/* GeoTani: CEK NIB TANAH (ATR/BPN GISTARU).
 *
 * Mencari bidang tanah berdasarkan fitur NIB lewat WFS GISTARU, lalu
 * menampilkan empat atribut: penggunaan, tipe hak, NIB, dan luas peta.
 *
 * Tiga hal di endpoint ini mudah salah dan semuanya sudah diuji:
 *
 * 1. WFS version=2.0.0 (typeNames, jamak) HANGS saat mengembalikan fitur.
 *    Diuji dengan batas waktu 20 detik: request JSON, GML2, dan CSV di
 *    2.0.0 semuanya tidak pernah menjawab. Yang berhasil hanya
 *    version=1.0.0 dengan typeName (tunggal). Jangan "upgrade" ke 2.0.0.
 *
 * 2. atlas.atrbpn.go.id tidak mengirim header Access-Control-Allow-Origin,
 *    jadi fetch langsung dari browser diblokir. Tile WMS tetap bisa tampil
 *    karena dimuat lewat <img>, tetapi WFS JSON harus lewat worker proxy.
 *    Pola ini sudah dipakai modul lain di situs ini.
 *
 * 3. resultType=hits tidak bisa dipakai sebagai pemeriksaan cepat: di
 *    WFS 1.0.0 server membalas numberOfFeatures="0" untuk semua NIB,
 *    termasuk yang memang ada. Query tanpa hasil harus ditunggu sampai
 *    server selesai, tidak bisa ditebak lebih awal.
 */
(function () {
  'use strict';

  var WFS_URL = 'https://atlas.atrbpn.go.id/geoserver/gistaru/ows';
  var CORS_PROXY = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';

  /* Hanya empat atribut yang ditampilkan. LUAS ikut diminta karena ada
   * selisih beberapa meter persegi terhadap LUASPETA, tetapi yang
   * ditampilkan tetap LUASPETA. */
  var PROPERTY_NAME = 'NIB,PENGGUNAAN,TIPEHAK,LUAS,LUASPETA';
  var MAX_FEATURES = 50;

  /* Diuji: NIB yang ADA dijawab 1,5-3 detik. NIB yang TIDAK ada butuh
   * sekitar 30 detik dan baru kemudian mengembalikan 0 fitur, karena
   * server melakukan pemindaian penuh untuk kasus itu. Karena itu batas
   * waktu dibuat 45 detik -- memotongnya akan mengubah "tidak ditemukan"
   * jadi pesan error, dan itu jawaban yang salah. */
  var TIMEOUT_MS = 45000;

  /* Menit ke-8 GISTARU belum menjawab, padahal kasus yang ada biasanya
   * selesai di detik ke-3. Beri tahu agar tidak terasa macet. */
  var SLOW_HINT_MS = 8000;

  /* NIB di GISTARU hanya angka atau sedikit huruf. Membatasi ke karakter
   * ini membuat input pengguna tidak mungkin menjadi CQL_filter, jadi tanda
   * kutip tidak perlu di-escape sebagai satu-satunya pertahanan. */
  var NIB_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;

  var el = {};
  var _activeController = null;
  var _searchToken = 0;

  function cache() {
    el.input = document.getElementById('geotani-nib-input');
    el.button = document.getElementById('geotani-nib-search');
    el.reset = document.getElementById('geotani-nib-reset');
    el.status = document.getElementById('geotani-nib-status');
    el.results = document.getElementById('geotani-nib-results');
  }

  /* Mematikan layer Persil Tanah di Katalog Layer. Dipanggil dari tombol
   * Reset supaya satu klik membersihkan isi, daftar, dan layer sekaligus.
   * Nama toggle di sini harus sama persis dengan id di LAYER_CATALOG_DATA
   * (map-core.js) dan dengan yang dipakai attribute-table.js. */
  function matikanLayerPersil() {
    var ids = ['toggleBumiPersilLayer', 'toggleGistaruPersilLayer'];
    ids.forEach(function (id) {
      try {
        if (typeof window[id] === 'function') window[id](false);
      } catch (e) { /* layer sudah tidak ada; abaikan */ }
      try {
        if (typeof window.setLayerCatalogCheckboxState === 'function') {
          window.setLayerCatalogCheckboxState(id, false);
        }
      } catch (e) { /* katalog belum dibangun; abaikan */ }
    });
  }

  function resetSearch() {
    _searchToken++;
    /* Batalkan request yang masih berjalan supaya hasilnya tidak menimpa
     * keadaan yang baru saja direset. */
    if (_activeController) {
      try { _activeController.abort(); } catch (e) { /* sudah selesai */ }
      _activeController = null;
    }
    if (el.input) el.input.value = '';
    clearResults();
    setStatus('', false);
    matikanLayerPersil();
    if (el.button) el.button.disabled = false;
    syncResetButton();
    if (el.input) el.input.focus();
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Ganti koma sebagai separator ribuan, bukan titik, supaya tidak bentrok
   * dengan format desimal yang dipakai di bawah. */
  function formatNumber(value, decimals) {
    var n = Number(value);
    if (!isFinite(n)) return '-';
    return n.toLocaleString('id-ID', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  /* Menghasilkan karakter superscript langsung, bukan entitas &sup2;,
   * karena nilainya nanti lolos esc() yang akan mengubah "&" jadi "&amp;". */
  function formatLuas(luaspeta) {
    var n = Number(luaspeta);
    if (!isFinite(n)) return '-';
    return formatNumber(n, 2) + ' m² (' + formatNumber(n / 10000, 4) + ' ha)';
  }

  function setStatus(text, isError) {
    if (!el.status) return;
    el.status.textContent = text || '';
    el.status.classList.toggle('is-error', !!isError);
  }

  function clearResults() {
    if (el.results) {
      el.results.innerHTML = '';
      el.results.__features = [];
    }
    syncResetButton();
  }

  function syncResetButton() {
    if (!el.reset) return;
    var busy = !!(el.button && el.button.disabled);
    var hasResults = !!(el.results && el.results.__features && el.results.__features.length);
    el.reset.disabled = busy || (!hasResults && !(el.input && el.input.value));
  }

  function buildUrl(nib) {
    return WFS_URL +
      '?service=WFS' +
      '&version=1.0.0' +
      '&request=GetFeature' +
      '&typeName=' + encodeURIComponent('gistaru:persil') +
      '&outputFormat=' + encodeURIComponent('application/json') +
      '&propertyName=' + encodeURIComponent(PROPERTY_NAME) +
      '&maxFeatures=' + MAX_FEATURES +
      '&CQL_FILTER=' + encodeURIComponent("NIB='" + nib + "'");
  }

  function resultCard(feature, index) {
    var p = feature.properties || {};
    var rows = [
      ['Penggunaan', p.PENGGUNAAN || '-'],
      ['Tipe hak', p.TIPEHAK || '-'],
      ['NIB', p.NIB || '-'],
      ['Luas peta', formatLuas(p.LUASPETA)]
    ];

    var html = '<div class="nib-result" data-index="' + index + '"' +
      (feature.bbox && feature.bbox.length === 4 ? ' role="button" tabindex="0"' : '') + '>' +
      '<div class="nib-result-head">Bidang ' + (index + 1) + '</div>' +
      '<dl class="nib-result-rows">';
    rows.forEach(function (row) {
      html += '<div class="nib-result-row"><dt>' + esc(row[0]) + '</dt>' +
        '<dd>' + esc(row[1]) + '</dd></div>';
    });
    html += '</dl>';
    if (feature.bbox && feature.bbox.length === 4) {
      html += '<div class="nib-result-hint">Klik untuk lihat di peta</div>';
    }
    html += '</div>';
    return html;
  }

  function render(features, nib) {
    if (!el.results) return;

    if (!features.length) {
      setStatus('NIB ' + nib + ' tidak ditemukan pada GISTARU.', false);
      return;
    }

    /* NIB tidak unik di GISTARU: satu nomor bisa muncul di beberapa
     * kabupaten/kota, jadi hasilnya ditampilkan sebagai daftar. */
    var head = '<div class="nib-summary">Ditemukan <b>' + features.length + '</b> bidang' +
      (features.length >= MAX_FEATURES ? ' (batas ' + MAX_FEATURES + ' hasil)' : '') +
      ' untuk NIB <b>' + esc(nib) + '</b></div>';

    el.results.innerHTML = head +
      features.map(resultCard).join('');

    setStatus('', false);
  }

  function flyToFeature(feature) {
    if (!feature || !feature.bbox || feature.bbox.length !== 4) return;

    /* SheetDrag.flyToBoundsInVisibleMap sudah memanggil invalidateSize dan
     * menunggu transisi sheet selesai sebelum menghitung bounds. Tanpa itu
     * peta tetap memakai ukuran lamanya, dan karena #map punya
     * `background: #000` (app.css) area yang tidak tertile terlihat hitam. */
    if (window.SheetDrag && typeof window.SheetDrag.flyToBoundsInVisibleMap === 'function') {
      try {
        window.SheetDrag.flyToBoundsInVisibleMap(boundsOf(feature), { padding: [40, 40], maxZoom: 20, duration: 0.8 });
      } catch (e) { /* peta belum siap; hasil tetap tampil di daftar */ }
      return;
    }

    try {
      if (typeof map === 'undefined' || !map) return;
      if (typeof map.invalidateSize === 'function') map.invalidateSize({ pan: false });
      map.flyToBounds(boundsOf(feature), { padding: [40, 40], maxZoom: 20, duration: 0.8 });
    } catch (e) { /* peta belum siap; hasil tetap tampil di daftar */ }
  }

  /* bbox GeoJSON berurutan [west, south, east, north], sedangkan
   * L.latLngBounds menerima [southwest, northeast] dalam lat/lon. */
  function boundsOf(feature) {
    var b = feature.bbox;
    return L.latLngBounds([b[1], b[0]], [b[3], b[2]]);
  }

  function onResultsClick(event) {
    var node = event.target.closest ? event.target.closest('.nib-result') : null;
    if (!node || !el.results || node.getAttribute('role') !== 'button') return;
    var index = parseInt(node.getAttribute('data-index'), 10);
    var current = el.results.__features || [];
    flyToFeature(current[index]);
  }

  function onResultsKey(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var node = event.target.closest ? event.target.closest('.nib-result') : null;
    if (!node || node.getAttribute('role') !== 'button') return;
    event.preventDefault();
    node.click();
  }

  function search() {
    var nib = (el.input.value || '').trim();
    if (!nib) {
      setStatus('Masukkan NIB terlebih dahulu.', true);
      if (el.input) el.input.focus();
      return;
    }
    if (!NIB_PATTERN.test(nib)) {
      setStatus('NIB hanya boleh berisi huruf, angka, titik, garis, atau tanda hubung.', true);
      if (el.input) el.input.focus();
      return;
    }

    clearResults();
    if (el.button) el.button.disabled = true;
    syncResetButton();
    setStatus('Mengambil data dari ATR/BPN GISTARU...');

    var token = ++_searchToken;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    _activeController = controller;
    var timer = controller ? setTimeout(function () { controller.abort(); }, TIMEOUT_MS) : null;
    var slowHint = setTimeout(function () {
      /* Jangan ganggu jika pengguna sudah menekan Reset di tengah jalan. */
      if (token !== _searchToken) return;
      setStatus('GISTARU lambat merespons. NIB yang tidak terdaftar bisa membutuhkan sekitar 30 detik...');
    }, SLOW_HINT_MS);

    var url = CORS_PROXY + encodeURIComponent(buildUrl(nib));
    var options = { cache: 'no-store' };
    if (controller) options.signal = controller.signal;

    fetch(url, options).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).then(function (data) {
      /* Hasil untuk pencarian lama diabaikan: Reset sudah mengubah isi. */
      if (token !== _searchToken) return;
      var features = (data && data.features) || [];
      if (el.results) el.results.__features = features;
      render(features, nib);
    }).catch(function (err) {
      if (token !== _searchToken) return;
      clearResults();
      var timedOut = err && (err.name === 'AbortError' || /abort/i.test(err.message || ''));
      setStatus(timedOut
        ? 'GISTARU tidak menjawab dalam ' + Math.round(TIMEOUT_MS / 1000) + ' detik. Coba lagi.'
        : 'Gagal membaca data GISTARU. Coba lagi beberapa saat lagi.', true);
    }).then(function () {
      clearTimeout(slowHint);
      if (timer) clearTimeout(timer);
      if (_activeController === controller) _activeController = null;
      if (el.button) el.button.disabled = false;
      syncResetButton();
    });
  }

  function init() {
    cache();
    if (!el.input || !el.button || !el.status || el.button.__bound) return;
    el.button.__bound = true;

    el.button.addEventListener('click', search);
    el.input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        search();
      }
    });
    /* Tombol Reset aktif begitu ada isian, walau belum ada hasil. */
    el.input.addEventListener('input', syncResetButton);
    if (el.reset) el.reset.addEventListener('click', resetSearch);
    if (el.results) {
      el.results.addEventListener('click', onResultsClick);
      el.results.addEventListener('keydown', onResultsKey);
    }
    syncResetButton();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
