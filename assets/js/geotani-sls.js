/* ── GeoTani: SLS (Satuan Lingkungan Setempat) per desa ──
 *
 * Menampilkan batas SLS di dalam desa yang sedang dipilih di GeoTani.
 *
 * Dua hal yang membentuk seluruh desain modul ini:
 *
 * 1. Kode desa GeoTani TIDAK bisa diturunkan menjadi prefiks idsls.
 *    GeoTani memakai kode BPS standar (11.01.01.2001, dari
 *    wilayah.smartartstudio.my.id), sedangkan frame BPS memakai penomoran
 *    sendiri: 514 kabupaten (BPS standar 416) dan kdkab yang tidak cocok.
 *    Prefix naif selalu mengembalikan 0 hasil. Karena itu desa dicari lewat
 *    koordinat, bukan lewat kode.
 *
 * 2. Kolom `luas` TIDAK dipakai. Satuan kolom itu tidak terdokumentasi dan
 *    berbeda antar layer: rasio terhadap luas geometri ~95 di layer SLS tapi
 *    ~2420 di layer desa. Menampilkannya akan salah sampai dua orde besaran.
 *    Semua luas dihitung dari geometri lewat window.geoArea (geodesik).
 *
   * Server WFS tidak mengirim header CORS, jadi browser tidak bisa mengambil
   * data ini langsung. Semua request lewat kta-cors-proxy. Worker itu memakai
   * cacheTtl: 0, jadi tiap permintaan benar-benar tembus ke BPS -- karena itu
   * ada cache sisi klien dan pemanggilan hanya terjadi atas permintaan pengguna.
   *
   * PENTING (verified 2026-09-29): GeoServer BPS sedang tidak mempublikasikan
   * layer apa pun. GetCapabilities WFS 2.0.0 mengembalikan FeatureTypeList
   * kosong, WMS hanya punya satu layer dummy bernama "WMS" dengan extent
   * minx=0/maxx=-1, dan setiap namespace (wilkerstat, bps, wilayah, geospasial,
   * statistik) dijawab "Unknown namespace". Jadi LAYER_DESA dan LAYER_SLS di
   * bawah akan menjatuhkan HTTP 400 sampai BPS memublikasikan workspace itu
   * lagi. Ini kondisi di luar kendali aplikasi; pesan error sudah dibuat
   * jujur soal itu, bukan menyalahkan perangkat pengguna.
   */
(function () {
  'use strict';

  var OWS = 'https://geoserver.bps.go.id/ows/service/WFS';
  var LAYER_DESA = 'wilkerstat:desa_2025_1';
  var LAYER_SLS = 'wilkerstat:sls_2025_1';
  var PROXY = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';

  /* Maks SLS per desa yang teramati di lapangan adalah 85. 200 memberi
     margin panjang; sebagai pengaman, hasil yang menyentuh batas ini akan
     ditandai terpotong alih-alih ditampilkan seolah-olah lengkap. */
  var MAX_SLS = 200;

  /* Kandidat desa dicari dalam kotak di sekitar titik dengan radius ini. 0,02
     derajat (~2,2 km) cukup untuk mencakup desa tanpa menarik tetangga yang
     jauh, dan tidak bergantung pada kecocokan nama "nmkec" yang bisa berbeda
     kapitalisasi atau spasi antara sumber. */
  var CANDIDATE_PAD_DEG = 0.02;
  var REQUEST_TIMEOUT_MS = 30000;

  /* Dipakai printGeotaniPdf() di geoid-wilayah.js; lastGeotaniPopupData di sana
     module-lokal, jadi state ini harus di window agar bisa dibaca. */
  var state = null;
  window._geotaniSlsData = null;
  /* Objek API dibuat di akhir IIFE; init() dipanggil setelah itu, jadi
     references di bawah selalu sudah terisi. */
  var api = null;

  var mapLayer = null;
  var highlightLayer = null;
  var cacheDesa = new Map();
  var cacheSls = new Map();
  var cacheOrder = [];
  var CACHE_MAX = 12;
  var inFlight = new Map();
/* Dinaikkan setiap kali pengguna menekan "Reset Polygon". Lihat load(). */
var generasi = 0;

  function proxyUrl(url) {
    return PROXY + encodeURIComponent(url);
  }

  function wfsUrl(params) {
    var q = Object.keys(params)
      .filter(function (k) { return params[k] !== null && params[k] !== undefined && params[k] !== ''; })
      .map(function (k) { return k + '=' + encodeURIComponent(params[k]); })
      .join('&');
    return OWS + '?' + q;
  }

  /* Bacalah teks exception OWS dari body XML GeoServer. Tanpa ini, error
     BPS hanya muncul sebagai "HTTP 400" yang tidak menjelaskan apa pun --
     padahal penyebabnya (namespace hilang, layer dihapus, parameter salah)
     selalu tertulis jelas di dalam body. */
  function bacaOwsException(txt) {
    if (!txt) return '';
    var m = txt.match(/<ows:ExceptionText>([^<]*)<\/ows:ExceptionText>/);
    if (m) return m[1].trim();
    m = txt.match(/<ServiceException[^>]*>([^<]*)<\/ServiceException>/);
    return m ? m[1].trim() : '';
  }

  /* GeoServer BPS membalas 400 dengan "Unknown namespace" ketika workspace
     tempat layer SLS berada sudah tidak dipublikasikan. Itu hal yang terjadi
     di luar kendali aplikasi, jadi pesannya harus menyuruh pengguna
     menunggu BPS, bukan menyalahkan perangkatnya. */
  function pesanBpsGagal(status, txt) {
    var ows = bacaOwsException(txt);
    if (/unknown namespace/i.test(ows)) {
      return 'Layanan data spasial BPS sedang tidak tersedia: '
        + 'wilayah kerja statistik (SLS) belum dipublikasikan. '
        + 'Ini gangguan di sisi BPS, bukan di perangkat Anda. Coba lagi nanti.';
    }
    if (ows) return 'BPS menolak permintaan (' + status + '): ' + ows;
    return 'Permintaan ke BPS gagal (HTTP ' + status + ').';
  }

  async function fetchJson(url) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT_MS);
    try {
      var res = await fetch(url, { signal: ctrl.signal });
      /* 429 dari proxy berarti kuota harian BPS habis, bukan kegagalan
         jaringan. Error-nya dibuat dengan resetAt terisi supaya lapisan UI
         bisa menampilkan hitung mundur, bukan kalimat "gagal" yang menyesatkan. */
      if (res.status === 429) {
        var resetSec = Number(res.headers.get('X-RateLimit-Reset'));
        var err = new Error('Kuota harian BPS habis untuk alamat IP ini.');
        err.kuotaHabis = true;
        err.resetAt = Number.isFinite(resetSec) && resetSec > 0 ? resetSec * 1000 : null;
        throw err;
      }
      if (!res.ok) {
        /* Body-nya XML, jadi res.json() akan melempar. Ambil teksnya apa
           adanya -- jangan sampai hilang bersama error parsing. */
        var body = '';
        try { body = await res.text(); } catch (e) { body = ''; }
        throw new Error(pesanBpsGagal(res.status, body));
      }
      return await res.json();
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('Permintaan ke BPS timeout.');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ── luas ──
     Memakai window.geoArea supaya konsisten dengan GeoTani yang sudah ada dan
     benar secara geodesik. Kalau geoArea belum termuat, dikembalikan null dan
     pemanggil menandai luas sebagai tidak tersedia -- bukan menebak. */
  function areaHa(geometry) {
    try {
      if (window.geoArea && typeof window.geoArea.areaHaFromGeoJSON === 'function') {
        var v = window.geoArea.areaHaFromGeoJSON(geometry);
        return Number.isFinite(v) ? v : null;
      }
    } catch (e) { /* jatuh ke null */ }
    return null;
  }

  /* ── cache ──
     Dua tahap: kode desa -> iddesa frame BPS, lalu iddesa -> SLS.
     Dibatasi CACHE_MAX entri dengan eviction berbasis urutan pakai, supaya
     kunjungan tidak mengembang tanpa batas di memori peramban. */
  function remember(map, key, value) {
    map.set(key, value);
    var i = cacheOrder.indexOf(key);
    if (i >= 0) cacheOrder.splice(i, 1);
    cacheOrder.push(key);
    while (cacheOrder.length > CACHE_MAX * 2) {
      var drop = cacheOrder.shift();
      cacheDesa.delete(drop);
      cacheSls.delete(drop);
    }
  }

  /* ── tahap 1: desa mana? ──
     Titik sentroid dari API boundary diuji terhadap setiap kandidat. Satu titik
     jauh lebih tahan beda batas sumber daripada poligon-dalam-poligon: kedua
     sumber pasti berbeda sedikit di tepi, tapi sentroid hampir selalu jatuh
     jelas di dalam satu desa. Kalau kandidat 0 atau lebih dari 1, modul menolak
     menebak. */
  async function findDesaId(lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error('Koordinat desa tidak valid.');
    }
    var key = lat.toFixed(5) + ',' + lng.toFixed(5);
    if (cacheDesa.has(key)) return cacheDesa.get(key);

    var bbox = [
      (lng - CANDIDATE_PAD_DEG).toFixed(6),
      (lat - CANDIDATE_PAD_DEG).toFixed(6),
      (lng + CANDIDATE_PAD_DEG).toFixed(6),
      (lat + CANDIDATE_PAD_DEG).toFixed(6)
    ].join(',') + ',EPSG:4326';

    var url = wfsUrl({
      service: 'WFS', version: '2.0.0', request: 'GetFeature',
      typeNames: LAYER_DESA, outputFormat: 'application/json', srsName: 'EPSG:4326',
      count: 25, bbox: bbox, propertyName: 'iddesa,nmdesa,geometry'
    });

    var json = await fetchJson(proxyUrl(url));
    var features = (json && json.features) || [];
    if (!features.length) {
      throw new Error('Desa ini belum tersedia pada frame BPS 2025-1.');
    }

    var pt = [lng, lat];
    var inside = [];
    for (var i = 0; i < features.length; i++) {
      var f = features[i];
      if (!f || !f.geometry) continue;
      var ok = false;
      try {
        // Selalu lewat window.turf, bukan nama telanjang: nama global hanya
        // berlaku di browser dan hilang begitu modul ini diuji di Node.
        ok = !!(window.turf && window.turf.booleanPointInPolygon(pt, f));
      } catch (e) { ok = false; }
      if (ok) inside.push(f);
    }

    if (inside.length === 0) {
      throw new Error('Batas desa tidak dapat dicocokkan dengan frame BPS. Pilih ulang wilayah.');
    }
    if (inside.length > 1) {
      throw new Error('Batas desa tumpang tindih dengan ' + inside.length + ' desa BPS. Pilih ulang wilayah.');
    }

    var pick = inside[0];
    var result = { iddesa: String(pick.properties.iddesa), nama: pick.properties.nmdesa || '' };
    if (!/^\d{10}$/.test(result.iddesa)) {
      throw new Error('Kode desa BPS tidak valid.');
    }
    remember(cacheDesa, key, result);
    return result;
  }

  /* ── tahap 2: SLS di desa itu ──
     iddesa berisi 10 digit, dan setiap idlss di dalamnya diawali kode itu,
     jadi filter prefix ini tepat sasaran -- tidak ada risiko poligon desa
     tetangga ikut terbawa. */
  async function loadSlsOfDesa(iddesa) {
    if (!/^\d{10}$/.test(String(iddesa || ''))) {
      throw new Error('Kode desa BPS tidak valid.');
    }
    if (cacheSls.has(iddesa)) return cacheSls.get(iddesa);

    var url = wfsUrl({
      service: 'WFS', version: '2.0.0', request: 'GetFeature',
      typeNames: LAYER_SLS, outputFormat: 'application/json', srsName: 'EPSG:4326',
      count: MAX_SLS, propertyName: 'idsls,nmsls,geometry',
      CQL_FILTER: "idsls LIKE '" + iddesa + "%'"
    });

    var json = await fetchJson(proxyUrl(url));
    var features = (json && json.features) || [];
    var items = [];
    for (var i = 0; i < features.length; i++) {
      var f = features[i];
      if (!f || !f.geometry) continue;
      items.push({
        idsls: String((f.properties || {}).idsls || ''),
        nmsls: (f.properties || {}).nmsls || '(tanpa nama)',
        luasHa: areaHa(f.geometry),
        geometry: f.geometry
      });
    }
    items.sort(function (a, b) { return a.nmsls.localeCompare(b.nmsls, 'id'); });

    var payload = { items: items, truncated: features.length >= MAX_SLS };
    remember(cacheSls, iddesa, payload);
    return payload;
  }

  /* ── orkestrasi ── */
  function load(kode, lat, lng) {
    if (inFlight.has(kode)) return inFlight.get(kode);
    var gen = generasi;
    var p = (async function () {
      var desa = await findDesaId(lat, lng);
      var sls = await loadSlsOfDesa(desa.iddesa);
      if (!sls.items.length) {
        throw new Error('Desa ini belum memiliki data SLS pada frame BPS 2025-1.');
      }
      var total = 0;
      var tanpaLuas = 0;
      for (var i = 0; i < sls.items.length; i++) {
        if (sls.items[i].luasHa === null) tanpaLuas += 1;
        else total += sls.items[i].luasHa;
      }
      /* Generasi berubah kalau pengguna menekan "Reset Polygon" selagi request
         ini berjalan. Membersihkan Map inFlight tidak membatalkan fetch, jadi
         responsnya harus diabaikan, bukan menimpa state yang sudah dikosongkan. */
      if (gen !== generasi) return null;
      state = {
        kode: kode, iddesa: desa.iddesa, namaDesa: desa.nama,
        items: sls.items, truncated: sls.truncated,
        totalLuasHa: total, tanpaLuas: tanpaLuas,
        sumber: 'BPS-Statistics Indonesia'
      };
      window._geotaniSlsData = state;
      return state;
    })();
    inFlight.set(kode, p);
    return p.then(function (r) { inFlight.delete(kode); return r; },
      function (e) { inFlight.delete(kode); throw e; });
  }

  /* ── pencarian desa ──
     Kartu ini punya pencarian sendiri. Kode desa di panel GeoTani lain
     (mis. satupeta) disimpan di state modul lokal mereka, bukan di window,
     jadi tidak bisa dibaca dari sini. Daftar desa memakai
     window.KODE_WILAYAH_DATA yang sudah termuat di halaman -- tidak ada
     permintaan jaringan tambahan untuk 3,9 MB data itu. */
  var desaList = null;
  var selectedKode = null;

  function daftarDesa() {
    if (desaList) return desaList;
    var all = (typeof window !== 'undefined') ? window.KODE_WILAYAH_DATA : null;
    if (!all || !all.length) return null;
    desaList = [];
    for (var i = 0; i < all.length; i++) {
      var it = all[i];
      // Level desa BPS punya tiga titik: prov.kab.kec.desa
      if (it && it.kode && it.nama && (it.kode.match(/\./g) || []).length === 3) {
        desaList.push(it);
      }
    }
    return desaList;
  }

  function normalisasi(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function cariDesa(query) {
    var list = daftarDesa();
    if (!list) return [];
    var q = normalisasi(query);
    if (q.length < 2) return [];
    var out = [];
    for (var i = 0; i < list.length && out.length < 20; i++) {
      if (normalisasi(list[i].nama).indexOf(q) >= 0) out.push(list[i]);
    }
    return out;
  }

  /* Desa yang mungkin sudah dipilih di panel GeoTani lain. Hanya dipakai
     sebagai petunjuk tampilan, bukan sebagai sumber kebenaran. */
  function kodeDariPanelLain() {
    try {
      if (window._selectedVillageKode) return String(window._selectedVillageKode);
      if (window._lastGeotaniLocation && window._lastGeotaniLocation.kode) {
        return String(window._lastGeotaniLocation.kode);
      }
    } catch (e) { /* abaikan */ }
    return null;
  }

  function setSelectedKode(kode, nama) {
    selectedKode = kode ? String(kode) : null;
    var picked = document.getElementById('geotaniSlsVillageSelected');
    if (picked) {
      if (selectedKode) {
        picked.textContent = '✓ ' + (nama || selectedKode) + ' (' + selectedKode + ')';
        picked.hidden = false;
      } else {
        picked.textContent = '';
        picked.hidden = true;
      }
    }
    if (selectedKode !== (state && state.kode)) {
      // Desa berganti: polygon SLS yang lama tidak boleh tetap tertinggal.
      if (state) clear();
    }
  }

  function getSelectedKode() { return selectedKode; }

  /* ── kutipan BPS ──
     Ketentuan Penggunaan BPS (pasal 13.2) mewajibkan kutipan yang memuat judul
     konten, tanggal akses, penulis, dan tautan langsung ke konten asli.

     Tautannya ditulis sebagai teks biasa, bukan sebagai <a> dengan label
     "Tautan langsung". URL yang tampil utuh bisa langsung disalin, dan itu
     yang diminta pasal itu; label tombol tidak. */
  function creditTanggalAkses() {
    var now = new Date();
    return now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  var credit = {
    judul: 'Wilayah Kerja Statistik - SLS (Satuan Lingkungan Setempat) 2025-1',
    penulis: 'BPS-Statistics Indonesia',
    periode: '2025-1',
    layer: LAYER_SLS,
    tautan: 'https://www.bps.go.id/'
  };

  function creditHtml() {
    return '<div class="geotani-sls-credit">' +
      '<b>Sumber data:</b> ' + credit.judul + ' &mdash; ' + credit.penulis + '. ' +
      'Diakses pada ' + creditTanggalAkses() + '. ' +
      credit.tautan +
      '</div>';
  }

  function creditText() {
    return credit.judul + ' - ' + credit.penulis + '. Diakses pada ' +
      creditTanggalAkses() + '. ' + credit.tautan;
  }

  /* ── peta ──
     Layer module-lokal, dibersihkan saat desa berganti supaya tidak ada
     polygon SLS dari desa sebelumnya yang masih tertinggal. */
  function clearMap() {
    if (!window.L || !window.map) { mapLayer = null; highlightLayer = null; return; }
    if (mapLayer && window.map.hasLayer(mapLayer)) window.map.removeLayer(mapLayer);
    if (highlightLayer && window.map.hasLayer(highlightLayer)) window.map.removeLayer(highlightLayer);
    mapLayer = null;
    highlightLayer = null;
  }

  function drawOnMap(options) {
    clearMap();
    if (!state || !window.L || !window.map) return false;
    var group = window.L.featureGroup();
    for (var i = 0; i < state.items.length; i++) {
      var it = state.items[i];
      var poly = window.L.geoJSON(it.geometry, {
        style: { color: '#16a34a', weight: 1.4, opacity: 0.9, fillColor: '#4ade80', fillOpacity: 0.16 }
      });
      poly.bindPopup(slsPopupHtml(it));
      group.addLayer(poly);
    }
    group.addTo(window.map);
    mapLayer = group;
    zoomToSls(options);
    return true;
  }

  /* Memposerkan peta ke SLS desa ini.
     Tanpa ini, memuat SLS dari pencarian di dalam kartu tidak bergerak sama
     sekali: peta masih di tempat sebelumnya dan pengguna tidak tahu poligon
     yang baru muncul ada di mana. Pola flyToBounds + pad + maxZoom mengikuti
     geoid-wilayah.js:728 dan erosi-kta.js.
     flyTo:false dipakai ketika peta tidak boleh digeser -- mis. sedang membuat
     PDF, yang memang memerlukan posisi peta tertentu. */
  function zoomToSls(options) {
    var opts = options || {};
    if (!mapLayer || !window.map || !window.L) return false;
    if (opts.flyTo === false) return false;
    var bounds = mapLayer.getBounds();
    if (!bounds || !bounds.isValid()) return false;
    // maxZoom 16: di atas itu geometri SLS yang hanya 8-90 titik per poligon
    // akan terlihat seperti bersudut, bukan batas yang digambar di lapangan.
    window.map.flyToBounds(bounds.pad(0.08), {
      maxZoom: 16,
      duration: opts.duration === undefined ? 0.8 : opts.duration
    });
    return true;
  }

  function slsPopupHtml(it) {
    var luas = it.luasHa === null
      ? 'tidak tersedia'
      : it.luasHa.toLocaleString('id-ID', { maximumFractionDigits: 3 }) + ' ha';
    return '<div class="geotani-sls-popup">' +
      '<div class="geotani-sls-popup-title">' + escapeHtml(it.nmsls) + '</div>' +
      '<div class="geotani-sls-popup-row"><span>Kode SLS</span><b>' + escapeHtml(it.idsls) + '</b></div>' +
      '<div class="geotani-sls-popup-row"><span>Luas (dihitung)</span><b>' + luas + '</b></div>' +
      '</div>';
  }

  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function clear() {
    state = null;
    window._geotaniSlsData = null;
    clearMap();
  }

  /* Tombol "Reset Polygon". clear() hanya mengosongkan state, layer peta, dan
     window._geotaniSlsData; daftar hasil dan input pencarian harus ikut
     dikosongkan supaya layar tidak terlihat masih memuat data. */
     function reset() {
       generasi += 1;
       clear();
       inFlight.clear();
       // Timer hitung mundur ikut dihentikan: panel sudah dikosongkan,
       // jadi tidak ada yang perlu diperbarui tiap detik lagi.
       berhentiHitungMundur();
       setSelectedKode(null, null);
    var input = document.getElementById('geotaniSlsVillageSearch');
    var results = document.getElementById('geotaniSlsVillageResults');
    var out = document.getElementById('geotani-sls-output');
    var status = document.getElementById('geotani-sls-status');
    var btn = document.getElementById('geotani-sls-load');
    if (input) input.value = '';
    if (results) { results.hidden = true; results.innerHTML = ''; }
    if (out) out.innerHTML = '';
    if (status) status.textContent = '';
    if (btn) btn.disabled = false;
  }

  function fmtLuas(ha) {
    if (ha === null || ha === undefined) return 'tidak tersedia';
    return ha.toLocaleString('id-ID', { maximumFractionDigits: 3 }) + ' ha';
  }

  function listHtml() {
    if (!state) return '';
    var h = '<div class="geotani-sls-summary">' +
      '<span><b>' + state.items.length + '</b> SLS</span>' +
      '<span>Total <b>' + fmtLuas(state.totalLuasHa) + '</b></span>' +
      '<span>Kode desa BPS <b>' + escapeHtml(state.iddesa) + '</b></span>' +
      '</div>';
    if (state.truncated) {
      h += '<div class="geotani-sls-warn">Menampilkan ' + state.items.length +
        ' SLS. Sebagian data mungkin tidak tampil.</div>';
    }
    if (state.tanpaLuas) {
      h += '<div class="geotani-sls-warn">' + state.tanpaLuas +
        ' SLS luasnya tidak dapat dihitung.</div>';
    }
    h += '<ul class="geotani-sls-list">';
    for (var i = 0; i < state.items.length; i++) {
      var it = state.items[i];
      h += '<li data-sls-index="' + i + '">' +
        '<span class="geotani-sls-name">' + escapeHtml(it.nmsls) + '</span>' +
        '<span class="geotani-sls-luas">' + fmtLuas(it.luasHa) + '</span>' +
        '</li>';
    }
    h += '</ul>';
    h += creditHtml();
    return h;
  }

  function highlight(index) {
    if (!state || !window.L || !window.map) return;
    if (highlightLayer && window.map.hasLayer(highlightLayer)) window.map.removeLayer(highlightLayer);
    var it = state.items[index];
    if (!it) return;
    highlightLayer = window.L.geoJSON(it.geometry, {
      style: { color: '#f59e0b', weight: 2.4, opacity: 1, fillColor: '#fbbf24', fillOpacity: 0.34 }
    }).addTo(window.map);
  }

  function getState() { return state; }

  /* ── kuota harian BPS ──
     Satu analisis butuh dua request BPS, jadi kuota 2 per 24 jam. Saat
     habis, error 429 membawa resetAt (epoch ms) dari header Worker.

     Hitung mundur diperbarui tiap detik supaya pengguna tidak perlu
     menghitung sendiri kapan harus mencoba lagi. Timer dihentikan saat
     kuota pulih atau saat panel di-reset, supaya tidak ada interval yang
     menggantung di latar belakang. */
  var hitungMundurTimer = 0;

  function formatSisa(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var jam = Math.floor(total / 3600);
    var menit = Math.floor((total % 3600) / 60);
    var detik = total % 60;
    if (jam >= 1) return jam + ' jam ' + menit + ' menit';
    if (menit >= 1) return menit + ' menit ' + detik + ' detik';
    return detik + ' detik';
  }

  function berhentiHitungMundur() {
    if (hitungMundurTimer) { clearInterval(hitungMundurTimer); hitungMundurTimer = 0; }
  }

  function tampilkanKuotaHabis(status, err) {
    berhentiHitungMundur();
    if (!status) return;
    var resetAt = err && err.resetAt;
    if (!Number.isFinite(resetAt)) {
      /* Worker tidak mengirim resetAt. Jangan tampilkan angka yang
         menebak, cukup diberi tahu bahwa kuota habis. */
      status.className = 'geotani-sls-status is-quota';
      status.textContent = 'Kuota harian BPS habis untuk alamat IP ini. '
        + 'Coba lagi nanti.';
      return;
    }    var tulis = function () {
      var sisa = resetAt - Date.now();
      if (sisa <= 0) {
        berhentiHitungMundur();
        status.className = 'geotani-sls-status';
        status.textContent = 'Kuota BPS sudah tersedia. Tekan "Tampilkan SLS" lagi.';
        return;
      }
      status.className = 'geotani-sls-status is-quota';
      status.textContent = 'Kuota harian BPS habis untuk alamat IP ini. '
        + 'Bisa diakses lagi dalam ' + formatSisa(sisa) + '.';
    };
    tulis();
    hitungMundurTimer = setInterval(tulis, 1000);
  }

  /* ── pembungkus UI ──
     Tombol "Tampilkan SLS" bersifat opt-in. Tidak ada request yang dikirim
     otomatis saat desa dipilih, supaya perpindahan desa tidak menambah lalu
     lintas ke BPS tanpa disengaja. */
  function init(root) {
    var host = root || document.getElementById('geotani-sls-card');
    if (!host) return null;
    var btn = document.getElementById('geotani-sls-load');
    var out = document.getElementById('geotani-sls-output');
    var status = document.getElementById('geotani-sls-status');
    var input = document.getElementById('geotaniSlsVillageSearch');
    var results = document.getElementById('geotaniSlsVillageResults');
    var resetBtn = document.getElementById('geotani-sls-reset');
    if (!btn || !out) return null;
    if (btn.__geotaniSlsBound) return api;
    btn.__geotaniSlsBound = true;

    if (resetBtn && !resetBtn.__geotaniSlsResetBound) {
      resetBtn.__geotaniSlsResetBound = true;
      resetBtn.addEventListener('click', function () { reset(); });
    }

    // Petunjuk: kalau pengguna sudah memilih desa di panel lain, sebutkan.
    var lain = kodeDariPanelLain();
    if (lain) setSelectedKode(lain, null);

    if (input && results) {
      var hide = function () { results.hidden = true; results.innerHTML = ''; };
      input.addEventListener('input', function () {
        var found = cariDesa(input.value);
        if (!found.length) { hide(); return; }
        results.innerHTML = '';
        for (var i = 0; i < found.length; i++) {
          (function (item) {
            var div = document.createElement('div');
            div.className = 'geotani-sls-result';
            div.textContent = item.nama + ' (' + item.kode + ')';
            div.addEventListener('mousedown', function (e) {
              e.preventDefault();
              input.value = item.nama;
              hide();
              setSelectedKode(item.kode, item.nama);
            });
            results.appendChild(div);
          })(found[i]);
        }
        results.hidden = false;
      });
      document.addEventListener('click', function (e) {
        if (!results.contains(e.target) && e.target !== input) hide();
      });
    }

    btn.addEventListener('click', async function () {
      var kode = selectedKode || kodeDariPanelLain();
      if (!kode) {
        if (status) status.textContent = 'Pilih desa terlebih dahulu.';
        if (input) input.focus();
        return;
      }
      var meta = await villageMeta(kode);
      if (!meta || !Number.isFinite(meta.lat) || !Number.isFinite(meta.lng)) {
        if (status) status.textContent = 'Batas desa tidak dapat dimuat. Pilih desa lain atau coba lagi.';
        return;
      }
      btn.disabled = true;
      out.innerHTML = '';
      berhentiHitungMundur();
      if (status) status.textContent = 'Mengambil data SLS dari BPS...';
      try {
        var st = await load(kode, meta.lat, meta.lng);
        // null = pengguna menekan "Reset Polygon" selagi request berjalan.
        if (!st) return;
        drawOnMap();
        out.innerHTML = listHtml();
        if (status) status.textContent = '';
      } catch (e) {
        /* Kuota habis punya tampilan sendiri: pesan error biasa akan
         membuat pengguna mengira BPS yang salah, padahal jatah miliknya
         sendiri yang habis. */
        if (e && e.kuotaHabis) {
          tampilkanKuotaHabis(status, e);
        } else if (status) {
          status.textContent = e && e.message ? e.message : 'Gagal mengambil data SLS.';
        }
      } finally {
        btn.disabled = false;
      }
    });

    out.addEventListener('click', function (ev) {
      var li = ev.target.closest ? ev.target.closest('[data-sls-index]') : null;
      if (li) highlight(Number(li.getAttribute('data-sls-index')));
    });

    return api;
  }

  /* Metadata desa (nama + sentroid) dari API yang sama dengan boundary GeoTani,
     jadi tidak ada sumber kedua yang harus dijaga. */
  var metaCache = new Map();
  async function villageMeta(kode) {
    if (metaCache.has(kode)) return metaCache.get(kode);
    var url = 'https://wilayah.smartartstudio.my.id/api/boundaries/' + encodeURIComponent(kode);
    try {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT_MS);
      var res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var d = await res.json();
      var meta = { nama: d.nama || kode, lat: d.lat, lng: d.lng };
      metaCache.set(kode, meta);
      return meta;
    } catch (e) {
      return null;
    }
  }

  api = {
    load: load,
    clear: clear,
    reset: reset,
    init: init,
    getState: getState,
    listHtml: listHtml,
    credit: credit,
    creditHtml: creditHtml,
    creditText: creditText,
    creditTanggalAkses: creditTanggalAkses,
    drawOnMap: drawOnMap,
    zoomToSls: zoomToSls,
    highlight: highlight,
    areaHa: areaHa,
    findDesaId: findDesaId,
    loadSlsOfDesa: loadSlsOfDesa,
    villageMeta: villageMeta,
    daftarDesa: daftarDesa,
    cariDesa: cariDesa,
    setSelectedKode: setSelectedKode,
    getSelectedKode: getSelectedKode,
    kodeDariPanelLain: kodeDariPanelLain,
    normalisasi: normalisasi,
    MAX_SLS: MAX_SLS,
    OWS: OWS,
    LAYER_SLS: LAYER_SLS,
    LAYER_DESA: LAYER_DESA,
    _wfsUrl: wfsUrl,
    _proxyUrl: proxyUrl
  };
  window.GeoTaniSls = api;

  /* Pengikatan tombol dilakukan di dalam modul, bukan lewat inline script di
     index.html, supaya tidak ada urutan eksekusi yang harus dijaga manual.
     Panel GeoTani bisa dibangun setelah DOM siap, jadi kartu ditunggu dulu. */
  if (typeof document !== 'undefined') {
    var boot = function () { if (!init()) setTimeout(boot, 300); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();
