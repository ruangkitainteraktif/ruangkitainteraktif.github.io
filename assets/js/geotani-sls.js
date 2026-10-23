/* ── GeoTani: SLS (Satuan Lingkungan Setempat) per desa ──
 *
 * Menampilkan batas SLS di dalam desa yang sedang dipilih di GeoTani.
 *
 * Data SLS dibaca dari GeoServer InaRISK melalui proxy CORS. Kode desa yang
 * dipilih dicocokkan dengan atribut kddesa. Luas dihitung geodesik.
 */
(function () {
  'use strict';

  var OWS = 'https://inarisk1.bnpb.go.id:8443/geoserver/wfs';
  var LAYER_SLS = 'basemap:ina_bps_sls_2019';
  var PROXY = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';

  /* Maks SLS per desa yang teramati di lapangan adalah 85. 200 memberi
     margin panjang; sebagai pengaman, hasil yang menyentuh batas ini akan
     ditandai terpotong alih-alih ditampilkan seolah-olah lengkap. */
  var MAX_SLS = 200;

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

  /* GeoServer membalas 400 dengan "Unknown namespace" ketika workspace
     tempat layer SLS berada sudah tidak dipublikasikan. Itu hal yang terjadi
     di luar kendali aplikasi, jadi pesannya harus menyuruh pengguna
     menunggu BPS, bukan menyalahkan perangkatnya. */
  function pesanBpsGagal(status, txt) {
    var ows = bacaOwsException(txt);
    if (/unknown namespace/i.test(ows)) {
      return 'Layer SLS InaRISK tidak ditemukan pada GeoServer: ' + ows;
    }
    if (ows) return 'GeoServer InaRISK menolak permintaan (' + status + '): ' + ows;
    return 'Permintaan ke GeoServer InaRISK gagal (HTTP ' + status + ').';
  }

  async function fetchJson(url) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT_MS);
    try {
      var res = await fetch(url, { signal: ctrl.signal });
      /* 429 dari proxy berarti batas permintaan tercapai, bukan kegagalan
         jaringan. Error-nya dibuat dengan resetAt terisi supaya lapisan UI
         bisa menampilkan hitung mundur, bukan kalimat "gagal" yang menyesatkan. */
      if (res.status === 429) {
        var resetSec = Number(res.headers.get('X-RateLimit-Reset'));
        var err = new Error('Batas permintaan layanan tercapai untuk alamat IP ini.');
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
      if (e && e.name === 'AbortError') throw new Error('Permintaan ke GeoServer InaRISK timeout.');
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
     Kode desa terpilih dipakai langsung untuk meminta polygon SLS InaRISK.
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

  function escapeCql(value) {
    return String(value == null ? '' : value).replace(/'/g, "''");
  }

  function slsFilterFromProperties(props) {
    var fields = ['kdprov', 'kdkab', 'kdkec', 'kddesa'];
    var terms = [];
    for (var i = 0; i < fields.length; i++) {
      var value = props && props[fields[i]];
      if (value !== null && value !== undefined && String(value) !== '') {
        var literal = typeof value === 'number' && Number.isFinite(value)
          ? String(value) : "'" + escapeCql(value) + "'";
        terms.push(fields[i] + ' = ' + literal);
      }
    }
    if (!terms.length) throw new Error('Atribut kode SLS tidak tersedia pada hasil pencocokan.');
    return terms.join(' AND ');
  }

  function collectRings(value, output) {
    if (!Array.isArray(value)) return;
    if (value.length >= 4 && Array.isArray(value[0]) && typeof value[0][0] === 'number') {
      output.push(value);
      return;
    }
    value.forEach(function (item) { collectRings(item, output); });
  }

  function toLonLat(point) {
    var x = Number(point[0]), y = Number(point[1]);
    if (Math.abs(x) > 90 && Math.abs(x) <= 180) return [x, y];
    if (Math.abs(y) > 90 && Math.abs(y) <= 180) return [y, x];
    return [y, x];
  }

  function villageGeometry(data) {
    var rings = [];
    collectRings(data && data.path, rings);
    var polygons = rings.map(function (ring) { return [ring.map(toLonLat)]; })
      .filter(function (polygon) {
        return polygon[0].every(function (p) { return Number.isFinite(p[0]) && Number.isFinite(p[1]); });
      });
    if (!polygons.length) throw new Error('Geometri batas desa tidak ditemukan.');
    return { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polygons } };
  }

  async function fetchVillageBoundary(kode) {
    var digits = String(kode || '').replace(/\D/g, '');
    if (!/^\d{10}$/.test(digits)) throw new Error('Kode desa tidak valid untuk mengambil batas.');
    var kodeApi = digits.slice(0, 2) + '.' + digits.slice(2, 4) + '.' +
      digits.slice(4, 6) + '.' + digits.slice(6, 10);
    var url = 'https://wilayah.smartartstudio.my.id/api/boundaries/' + encodeURIComponent(kodeApi);
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT_MS);
    try {
      var response = await fetch(url, { signal: ctrl.signal });
      if (!response.ok) throw new Error('Batas desa gagal dimuat (HTTP ' + response.status + ').');
      var data = await response.json();
      return { data: data, feature: villageGeometry(data) };
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('Permintaan batas desa timeout.');
      throw e;
    } finally { clearTimeout(timer); }
  }

  async function findSlsAtPoint(point) {
    if (!window.turf || typeof window.turf.booleanPointInPolygon !== 'function') {
      throw new Error('Library geometri peta belum tersedia. Muat ulang halaman lalu coba lagi.');
    }
    var pads = [0.0002, 0.001, 0.005];
    for (var p = 0; p < pads.length; p++) {
      var pad = pads[p];
      var bbox = [point[0] - pad, point[1] - pad, point[0] + pad, point[1] + pad].join(',') + ',EPSG:4326';
      var url = wfsUrl({
        service: 'WFS', version: '2.0.0', request: 'GetFeature',
        typeNames: LAYER_SLS, outputFormat: 'application/json', srsName: 'EPSG:4326',
        count: 250, bbox: bbox,
        propertyName: 'kdprov,kdkab,kdkec,kddesa,idsls,nmsls,nmdesa,the_geom'
      });
      var json = await fetchJson(proxyUrl(url));
      var features = (json && json.features) || [];
      for (var i = 0; i < features.length; i++) {
        var feature = features[i];
        if (!feature || !feature.geometry) continue;
        try { if (window.turf.booleanPointInPolygon(point, feature)) return feature; }
        catch (e) { /* Abaikan kandidat dengan geometri rusak. */ }
      }
    }
    return null;
  }

  async function findSlsInsideVillage(village) {
    if (!window.turf || typeof window.turf.pointOnFeature !== 'function' ||
        typeof window.turf.booleanPointInPolygon !== 'function') return null;
    var coords = village.geometry.coordinates;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function visit(value) {
      if (!Array.isArray(value)) return;
      if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
        minX = Math.min(minX, value[0]); maxX = Math.max(maxX, value[0]);
        minY = Math.min(minY, value[1]); maxY = Math.max(maxY, value[1]);
        return;
      }
      value.forEach(visit);
    }
    visit(coords);
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
    var bbox = [minX, minY, maxX, maxY, 'EPSG:4326'].join(',');
    var url = wfsUrl({
      service: 'WFS', version: '2.0.0', request: 'GetFeature',
      typeNames: LAYER_SLS, outputFormat: 'application/json', srsName: 'EPSG:4326',
      count: 1000, bbox: bbox,
      propertyName: 'kdprov,kdkab,kdkec,kddesa,idsls,nmsls,nmdesa,the_geom'
    });
    var json = await fetchJson(proxyUrl(url));
    var features = (json && json.features) || [];
    var best = null, bestArea = -1;
    for (var i = 0; i < features.length; i++) {
      var feature = features[i];
      if (!feature || !feature.geometry) continue;
      try {
        var sample = window.turf.pointOnFeature(feature);
        if (!window.turf.booleanPointInPolygon(sample, village)) continue;
        var area = window.turf.area(feature);
        if (Number.isFinite(area) && area > bestArea) { best = feature; bestArea = area; }
      } catch (e) { /* Abaikan kandidat dengan geometri rusak. */ }
    }
    return best;
  }

  /* Cocokkan titik interior batas desa ke geometri SLS; format kode kedua
     sumber tidak diasumsikan sama. */
  async function findDesaId(kode) {
    var kodeDesa = String(kode || '').replace(/\D/g, '');
    if (!/^\d{10}$/.test(kodeDesa)) {
      throw new Error('Kode desa yang dipilih tidak valid.');
    }
    var key = kodeDesa;
    if (cacheDesa.has(key)) return cacheDesa.get(key);

    var boundary = await fetchVillageBoundary(kodeDesa);
    var point;
    try {
      point = window.turf.pointOnFeature(boundary.feature).geometry.coordinates;
    } catch (e) {
      throw new Error('Titik interior batas desa tidak dapat dihitung.');
    }
    var feature = await findSlsAtPoint(point);
    if (!feature) feature = await findSlsInsideVillage(boundary.feature);
    if (!feature) throw new Error('Geometri SLS tidak ditemukan di dalam batas desa ' + kodeDesa + '.');
    var props = feature.properties || {};
    var result = {
      iddesa: kodeDesa,
      nama: boundary.data.nama || props.nmdesa || props.nmsls || '',
      cqlFilter: slsFilterFromProperties(props)
    };
    remember(cacheDesa, key, result);
    return result;
  }

  /* ── tahap 2: SLS di desa itu ──
     Filter memakai keempat komponen kode wilayah agar `kddesa` yang berulang
     di kabupaten/kecamatan lain tidak ikut terambil. */
  async function loadSlsOfDesa(iddesa, cqlFilter) {
    if (!/^\d{10}$/.test(String(iddesa || ''))) {
      throw new Error('Kode desa tidak valid.');
    }
    if (cacheSls.has(iddesa)) return cacheSls.get(iddesa);

    if (!cqlFilter) {
      var matched = await findDesaId(iddesa);
      cqlFilter = matched.cqlFilter;
    }
    var url = wfsUrl({
      service: 'WFS', version: '2.0.0', request: 'GetFeature',
      typeNames: LAYER_SLS, outputFormat: 'application/json', srsName: 'EPSG:4326',
      count: MAX_SLS, propertyName: 'idsls,nmsls,the_geom',
      CQL_FILTER: cqlFilter
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
  function load(kode) {
    if (inFlight.has(kode)) return inFlight.get(kode);
    var gen = generasi;
    var p = (async function () {
      var desa = await findDesaId(kode);
      var sls = await loadSlsOfDesa(desa.iddesa, desa.cqlFilter);
      if (!sls.items.length) {
        throw new Error('Desa ini belum memiliki data SLS pada layer InaRISK 2019.');
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
    judul: 'SLS BPS 2019',
    penulis: 'InaRISK BNPB',
    periode: '2019',
    layer: LAYER_SLS,
    tautan: 'https://inarisk1.bnpb.go.id:8443/geoserver/web/wicket/bookmarkable/org.geoserver.web.demo.MapPreviewPage?1&filter=false'
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
    h += '<div id="geotani-sls-ad" class="lc-adsense sheet-adsense" aria-label="Iklan">' +
      '<ins class="adsbygoogle" style="display:block" data-ad-format="fluid" ' +
      'data-ad-layout-key="-fb+5w+4e-db+86" data-ad-client="ca-pub-7501816933195235" ' +
      'data-ad-slot="5975101505"></ins></div>';
    h += '<button type="button" id="geotani-sls-export" class="geotani-btn-print" style="margin-top:8px;width:100%;">Ekspor SHP (.zip)</button>';
    return h;
  }

  function pushSlsAd() {
    var ad = document.querySelector('#geotani-sls-ad ins.adsbygoogle');
    if (!ad || ad.dataset.pantau === '1') return;
    ad.dataset.pantau = '1';
    function push() {
      if (!ad.isConnected || ad.dataset.terdorong === '1') return;
      ad.dataset.terdorong = '1';
      try {
        window.adsbygoogle = window.adsbygoogle || [];
        window.adsbygoogle.push({});
      } catch (e) {
        ad.dataset.terdorong = '0';
        if (window.console && console.warn) console.warn('[AdSense] Slot SLS gagal dimuat:', e);
      }
    }
    if (!('IntersectionObserver' in window)) { push(); return; }
    var observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        observer.disconnect();
        push();
        break;
      }
    });
    observer.observe(ad);
  }

  function shpSafeProperties(properties) {
    var safe = {};
    Object.keys(properties || {}).forEach(function (key) {
      var base = String(key || 'field').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 10) || 'field';
      var field = base, suffix = 1;
      while (Object.prototype.hasOwnProperty.call(safe, field)) {
        var tail = String(suffix++);
        field = base.slice(0, 10 - tail.length) + tail;
      }
      var value = properties[key];
      safe[field] = value == null || (typeof value === 'number' && !Number.isFinite(value)) ? ''
        : typeof value === 'boolean' ? (value ? 1 : 0)
          : typeof value === 'object' ? JSON.stringify(value) : value;
    });
    return safe;
  }

  async function exportSlsShapefile() {
    if (!state || !state.items || !state.items.length) {
      return { ok: false, message: 'Belum ada data SLS untuk diekspor.' };
    }
    var writer = window.shpwrite || (typeof shpwrite !== 'undefined' ? shpwrite : null);
    if (!writer || typeof writer.zip !== 'function') {
      return { ok: false, message: 'Modul pembuat SHP belum siap. Muat ulang halaman lalu coba kembali.' };
    }
    try {
      var features = state.items.filter(function (item) { return item && item.geometry; }).map(function (item) {
        return {
          type: 'Feature',
          geometry: item.geometry,
          properties: shpSafeProperties({
            id_sls: item.idsls,
            nm_sls: item.nmsls,
            kd_desa: state.iddesa,
            nm_desa: state.namaDesa,
            luas_ha: item.luasHa,
            periode: '2019'
          })
        };
      });
      if (!features.length) return { ok: false, message: 'Tidak ada geometri SLS yang bisa diekspor.' };
      var fileName = ('sls-' + (state.namaDesa || state.iddesa))
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'sls-desa';
      var archive = await writer.zip({ type: 'FeatureCollection', features: features }, {
        folder: fileName,
        filename: fileName,
        outputType: 'blob',
        types: { polygon: 'polygons' },
        prj: 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'
      });
      var blob = archive instanceof Blob ? archive : new Blob([archive], { type: 'application/zip' });
      var objectUrl = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName + '.zip';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
      return { ok: true, message: features.length.toLocaleString('id-ID') + ' SLS diekspor ke ' + fileName + '.zip.' };
    } catch (error) {
      return { ok: false, message: 'Gagal mengekspor SHP: ' + (error && error.message ? error.message : String(error)) };
    }
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
      btn.disabled = true;
      out.innerHTML = '';
      berhentiHitungMundur();
      if (status) status.textContent = 'Mengambil data wilayah...';
      try {
        var st = await load(kode);
        // null = pengguna menekan "Reset Polygon" selagi request berjalan.
        if (!st) return;
        drawOnMap();
        out.innerHTML = listHtml();
        pushSlsAd();
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
      var exportButton = ev.target.closest ? ev.target.closest('#geotani-sls-export') : null;
      if (exportButton) {
        exportButton.disabled = true;
        if (status) status.textContent = 'Menyiapkan berkas SHP...';
        exportSlsShapefile().then(function (result) {
          if (status) status.textContent = result.message;
        }).finally(function () { exportButton.disabled = false; });
        return;
      }
      var li = ev.target.closest ? ev.target.closest('[data-sls-index]') : null;
      if (li) highlight(Number(li.getAttribute('data-sls-index')));
    });

    return api;
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
    exportSlsShapefile: exportSlsShapefile,
    daftarDesa: daftarDesa,
    cariDesa: cariDesa,
    setSelectedKode: setSelectedKode,
    getSelectedKode: getSelectedKode,
    kodeDariPanelLain: kodeDariPanelLain,
    normalisasi: normalisasi,
    MAX_SLS: MAX_SLS,
    OWS: OWS,
    LAYER_SLS: LAYER_SLS,
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
