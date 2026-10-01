/* ── GeoTani: LBS & LSD (BADAN INFORMASI GEOSPASIAL) per desa ──
 *
 * Menampilkan Lahan Baku Sawah dan Lahan Sawah yang Dilindungi di dalam desa
 * yang dipilih, sebagai workflow mandiri di bagian teratas GeoTani.
 *
 * Sumber: BIG SatuPeta (kspservices.big.go.id), skala minimal 1:50.000.
 *   - LBS = MapServer layer 36 "Peta Lahan baku Sawah Nasional"
 *   - LSD = MapServer layer 59 "Peta Lahan Sawah yang Dilindungi"
 *
 * Tiga hal yang membentuk desain modul ini:
 *
 * 1. KLIP KE DESA WAJIB. ArcGIS hanya bisa menyaring per bounding box, dan
 *    bbox desa selalu lebih besar dari desanya. Untuk desa uji: bbox 776 ha
 *    sementara luas desanya hanya 283,5 ha, sehingga penjumlahan mentah
 *    overstate sampai ~2,7 kali. Semua luas yang ditampilkan adalah luas
 *    hasil irisan dengan poligon desa.
 *
 * 2. Kolom luas BIG BOLEH dipakai, dan tetap disilangkan terhadap
 *    geometri. Ini berbeda dari kolom `luas` BPS yang ternyata salah satuan
 *    (rasio 95 sampai 2420). Di sini rasionya 0,9997 pada 77 fitur, jadi
 *    atribut dipakai sebagai pembanding dan hasilnya ditampilkan berdampingan
 *    supaya selisihnya terlihat kalau BIG mengubah cara hitungnya.
 *
 * 3. LSD ADALAH SUBSET LBS. Nilai luas yang identik muncul di kedua layer,
 *    jadi keduanya ditampilkan berlapis: LSB di bawah, LSD di atas. Bukan
 *    dua daftar terpisah.
 *
 * Berbeda dengan BPS, BIG mengirim header Access-Control-Allow-Origin, jadi
 * request boleh langsung ke server tanpa kta-cors-proxy.
 */
(function () {
  'use strict';

  var BIG = 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer';

  /* Definisi layer BIG. Field luas sengaja ikut diambil supaya bisa
     disilangkan terhadap hasil hitung geometri. */
  var LBS = {
    id: 36,
    key: 'lbs',
    nama: 'Lahan Baku Sawah',
    namaField: 'q_name19',
    luasField: 'luas_polyg',
    outFields: 'q_name19,luas_polyg,wadmpr,wadmkk',
    warna: { 'Sawah': '#e6fcc0' },
    warnaDefault: '#e6fcc0'
  };
  var LSD = {
    id: 59,
    key: 'lsd',
    nama: 'Lahan Sawah Dilindungi',
    namaField: 'lsd',
    luasField: 'luasha',
    outFields: 'lsd,luasha,fgsfrf,ctkswh,wadmpr,wadmkk',
    /* Warna diambil dari definisi layer yang sudah ada di satupeta-downloader.js
       supaya tampilan LBS/LSD di GeoTani dan di Analisis Spasial sama. */
    warna: {
      'Lahan Sawah yang Dilindungi di Dalam Kawasan Hutan': '#ffaa00',
      'Lahan Sawah yang Dilindungi di Luar Kawasan Hutan': '#aaff00'
    },
    warnaDefault: '#ffd966'
  };
  var LAYERS = [LBS, LSD];

  var REQUEST_TIMEOUT_MS = 30000;
  var RECORD_LIMIT = 2000;
  /* Batas atas yang masih masuk akal untuk satu desa. Dipakai untuk memberi
     peringatan, bukan untuk memotong data diam-diam. */
  var POLYGON_WARN = 400;

  var state = null;
  window._geotaniLbsLsdData = null;
  var api = null;

  var mapLayerLbs = null;
  var mapLayerLsd = null;
  var highlightLayer = null;
  var cache = new Map();
  var cacheOrder = [];
  var CACHE_MAX = 8;
  var inFlight = new Map();
/* Dinaikkan setiap kali pengguna menekan "Reset Polygon". Lihat load(). */
var generasi = 0;
  var metaCache = new Map();
  var desaList = null;
  var selectedKode = null;

  function bigUrl(layerId, params) {
    var q = Object.keys(params)
      .filter(function (k) { return params[k] !== null && params[k] !== undefined && params[k] !== ''; })
      .map(function (k) { return k + '=' + encodeURIComponent(params[k]); })
      .join('&');
    return BIG + '/' + layerId + '/query?' + q;
  }

  async function fetchJson(url) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT_MS);
    try {
      var res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('Permintaan ke BIG timeout.');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ── luas ──
     Memakai window.geoArea supaya konsisten dengan modul lain di repo.
     Mengembalikan null bila tidak bisa dihitung, dan pemanggil menandainya
     sebagai tidak tersedia -- bukan menebak. */
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
     Proxy BPS tidak cache, tapi BIG sendiri juga tidak. Tanpa cache, satu
     desa yang dibuka berulang akan mengulang ~400 KB tiap kali. */
  function rememberCache(key, value) {
    cache.set(key, value);
    var i = cacheOrder.indexOf(key);
    if (i >= 0) cacheOrder.splice(i, 1);
    cacheOrder.push(key);
    while (cacheOrder.length > CACHE_MAX) cache.delete(cacheOrder.shift());
  }

  /* ── metadata desa ──
     API yang sama dengan boundary GeoTani, jadi tidak ada sumber kedua yang
     harus dijaga. path-nya [lat, lng] dan diubah ke [lng, lat] untuk GeoJSON. */
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
      var rings = [];
      if (d.path && d.path.length) {
        for (var r = 0; r < d.path.length; r++) {
          var ring = [];
          for (var i = 0; i < d.path[r].length; i++) ring.push([d.path[r][i][1], d.path[r][i][0]]);
          rings.push(ring);
        }
      }
      var meta = {
        nama: d.nama || kode, lat: d.lat, lng: d.lng,
        rings: rings,
        geojson: rings.length ? { type: 'Polygon', coordinates: rings } : null,
        luasHa: rings.length ? areaHa({ type: 'Polygon', coordinates: rings }) : null
      };
      metaCache.set(kode, meta);
      return meta;
    } catch (e) {
      return null;
    }
  }

  function bboxDariRings(rings) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var r = 0; r < rings.length; r++) {
      for (var i = 0; i < rings[r].length; i++) {
        var x = rings[r][i][0], y = rings[r][i][1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (!Number.isFinite(minX)) return null;
    return {
      west: minX, south: minY, east: maxX, north: maxY,
      envelope: minX + ',' + minY + ',' + maxX + ',' + maxY
    };
  }

  /* ── kueri BIG ──
     Filter spatial memakai envelope (bbox), bukan poligon. ArcGIS di sini
     tidak menerima geometry poligon kompleks pada kolom geometry-type polygon
     tanpa tambahan-parameter, jadi bbox + intersect adalah jalur yang
     terbukti bekerja, dan sisanya diselesaikan dengan klip di sisi klien. */
  async function queryLayer(layer, envelope) {
    var url = bigUrl(layer.id, {
      f: 'json',
      where: '1=1',
      geometry: envelope,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outSR: '4326',
      outFields: layer.outFields,
      returnGeometry: 'true',
      resultRecordCount: RECORD_LIMIT
    });
    var json = await fetchJson(url);
    var features = (json && json.features) || [];
    return {
      features: features,
      terpotong: !!(json && json.exceededTransferLimit) || features.length >= RECORD_LIMIT
    };
  }

  /* ── klip ke desa ──
     Setiap poligon BIG dipotong dengan poligon desa. Poligon yang tidak
     menyentuh desa dibuang, yang terpotong ditandai supaya pengguna tahu
     luasnya bukan luas penuh. */
  function clipKeDesa(feature, villageGeo) {
    if (!feature || !feature.geometry || !feature.geometry.rings) return null;
    var src = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: feature.geometry.rings }
    };
    var out = null;
    try {
      if (window.turf && window.turf.intersect) {
        /* turf 7: intersect() menerima SATU FeatureCollection berisi tepat dua
           Feature, dan mengembalikan SATU Feature (Polygon atau MultiPolygon),
           atau null kalau tidak beririsan. Bentuk FeatureCollection ikut
           diterima supaya modul ini tidak rapuh kalau versi turf berubah. */
        var pieces = window.turf.intersect(window.turf.featureCollection([
          src,
          { type: 'Feature', properties: {}, geometry: villageGeo }
        ]));
        var geoms = [];
        if (pieces) {
          if (pieces.type === 'Feature' && pieces.geometry) geoms.push(pieces.geometry);
          else if (pieces.features) {
            for (var n = 0; n < pieces.features.length; n++) {
              if (pieces.features[n].geometry) geoms.push(pieces.features[n].geometry);
            }
          }
        }
        var coords = [];
        for (var i = 0; i < geoms.length; i++) {
          var g = geoms[i];
          if (!g || !g.coordinates) continue;
          if (g.type === 'Polygon') coords.push(g.coordinates);
          else if (g.type === 'MultiPolygon') {
            for (var k = 0; k < g.coordinates.length; k++) coords.push(g.coordinates[k]);
          }
        }
        if (coords.length) out = { type: 'MultiPolygon', coordinates: coords };
      }
    } catch (e) { out = null; }
    if (!out) return null;
    // Bandingkan luas poligon penuh dengan luas hasil irisan untuk menentukan
    // apakah poligon ini terpotong oleh batas desa. Field luas BIG sendiri
    // dibaca di pemanggil, yang tahu layer mana -- di sini cukup geometri.
    var luasPenuh = areaHa({ type: 'Polygon', coordinates: feature.geometry.rings });
    var luasIrisan = areaHa(out);
    return {
      geometry: out,
      luasIrisanHa: luasIrisan,
      luasGeometriPenuhHa: luasPenuh,
      terpotong: (luasPenuh && luasIrisan && luasIrisan < luasPenuh * 0.995) ? true : false
    };
  }

  function esriKeTurf(geometry) {
    if (!geometry || !geometry.rings) return null;
    return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: geometry.rings } };
  }

  /* ── orkestrasi ──
     Kedua layer diambil, lalu diklip ke desa. Layer tanpa fitur tidak
     dianggap error: ada desa yang memang tidak punya LBS atau LSD. */
  function load(kode) {
    if (inFlight.has(kode)) return inFlight.get(kode);
    var gen = generasi;
    var p = (async function () {
      var meta = await villageMeta(kode);
      if (!meta || !meta.geojson) throw new Error('Batas desa tidak dapat dimuat. Pilih desa lain atau coba lagi.');
      var box = bboxDariRings(meta.rings);
      if (!box) throw new Error('Batas desa tidak dapat dibaca.');

      var hasil = {};
      var adaData = false;
      for (var i = 0; i < LAYERS.length; i++) {
        var layer = LAYERS[i];
        var got = await queryLayer(layer, box.envelope);
        var items = [];
        var utuh = 0, terpotong = 0, totalIrisan = 0, totalAtribIrisan = 0, tanpaLuas = 0, tanpaAtrib = 0;
        var totalLuar = 0;
        for (var f = 0; f < got.features.length; f++) {
          var feat = got.features[f];
          var clipped = clipKeDesa(feat, meta.geojson);
          if (!clipped) continue;
          var attrs = feat.attributes || {};
          var nama = attrs[layer.namaField] || '(tanpa nama)';
          var luasAtribPenuh = typeof attrs[layer.luasField] === 'number' ? attrs[layer.luasField] : null;
          // Atribut BIG mengukur seluruh poligon, termasuk bagian di luar desa.
          // Yang ditampilkan adalah bagian di dalam desa, jadi atribut hanya
          // dipakai sebagai pembanding proporsi, bukan dijumlahkan apa adanya.
          var irisan = clipped.luasIrisanHa || 0;
          var penuh = clipped.luasGeometriPenuhHa || irisan;
          var atrikIrisan = luasAtribPenuh && penuh > 0 ? luasAtribPenuh * (irisan / penuh) : null;
          items.push({
            nama: nama,
            luasIrisanHa: irisan,
            luasAtribIrisanHa: atrikIrisan,
            luasAtribPenuhHa: luasAtribPenuh,
            terpotong: clipped.terpotong,
            warna: layer.warna[nama] || layer.warnaDefault,
            attrs: attrs,
            geometry: clipped.geometry
          });
          if (clipped.terpotong) terpotong += 1; else utuh += 1;
          totalIrisan += irisan;
          if (atrikIrisan === null) tanpaAtrib += 1; else totalAtribIrisan += atrikIrisan;
          if (clipped.luasIrisanHa === null) tanpaLuas += 1;
          totalLuar += luasAtribPenuh || 0;
        }
        items.sort(function (a, b) { return b.luasIrisanHa - a.luasIrisanHa; });
        if (items.length) adaData = true;
        hasil[layer.key] = {
          key: layer.key, nama: layer.nama, layerId: layer.id,
          items: items, utuh: utuh, terpotong: terpotong,
          totalIrisanHa: totalIrisan, totalAtribIrisanHa: totalAtribIrisan,
          totalLuarBboxHa: totalLuar,
          tanpaLuas: tanpaLuas, tanpaAtrib: tanpaAtrib,
          terpotongQuery: got.terpotong
        };
      }

      /* Guard tumpang tindih. Peta skala 1:50.000 digambar manual, jadi
         poligon bisa saling menimpa. Kalau penjumlahan irisan melebihi luas
         desa, angkanya menghitung sebagian area lebih dari sekali -- lebih
         baik ditandai daripada ditampilkan sebagai fakta. */
      var desaLuas = meta.luasHa;
      var totalLbsIrisan = hasil.lbs ? hasil.lbs.totalIrisanHa : 0;
      var lsdIrisan = hasil.lsd ? hasil.lsd.totalIrisanHa : 0;
      var tumpangTindih = desaLuas > 0 && totalLbsIrisan > desaLuas * 1.02;

      /* LSD adalah subset LBS. Kalau tidak berlaku, berarti salah satu layer
         berubah maknanya dan ditampilkan apa adanya akan menyesatkan. */
      var subsetMellanggah = totalLbsIrisan > 0 && lsdIrisan > totalLbsIrisan * 1.02;

      /* Generasi berubah kalau pengguna menekan "Reset Polygon" lewat. Memakai
         Map inFlight.clear() saja tidak mencegah apa pun: fetch yang sedang
         berjalan tidak dibatalkan, dan responsnya akan menulis ulang state
         sehingga layer yang baru saja dilepas muncul lagi. */
      if (gen !== generasi) return null;

      /* Desa tanpa LBS/LSD sama sekali bukan kegagalan. Cakupan peta BIG
         1:50.000 tidak mencakup seluruh wilayah, jadi kondisi ini normal dan
         harus tampil sebagai keadaan kosong, bukan error. */
      state = {
        kode: kode, namaDesa: meta.nama, luasDesaHa: desaLuas,
        bbox: box, layers: hasil,
        adaData: adaData,
        lbsIrisanHa: totalLbsIrisan,
        lsdIrisanHa: lsdIrisan,
        tumpangTindih: tumpangTindih,
        subsetTidakBerlaku: subsetMellanggah,
        sumber: 'Badan Informasi Geospasial (BIG)'
      };
      window._geotaniLbsLsdData = state;
      return state;
    })();
    inFlight.set(kode, p);
    return p.then(function (r) { inFlight.delete(kode); return r; },
      function (e) { inFlight.delete(kode); throw e; });
  }

  /* ── kredit ──
     Ketentuan BIG mewajibkan menyebut Badan Informasi Geospasial pada setiap
     laporan yang memakai datanya, beserta tautan ke sumber aslinya.

     Tautannya ditulis sebagai teks biasa, bukan sebagai <a> dengan label
     "Tautan langsung". URL yang tampil utuh bisa langsung disalin, dan itu
     yang diminta oleh ketentuan kutipan; label tombol tidak. */
  var credit = {
    lembaga: 'Badan Informasi Geospasial',
    judul: 'Peta Lahan Baku Sawah Nasional dan Peta Lahan Sawah yang Dilindungi (skala minimal 1:50.000)',
    periode: 'Kebijakan Satu Peta',
    layer: 'MapServer 36 (LBS) dan 59 (LSD)',
    tautan: 'https://geoportal.big.go.id/'
  };

  function creditTanggalAkses() {
    var now = new Date();
    return now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function creditHtml() {
    return '<div class="geotani-lbslsd-credit">' +
      '<b>Sumber data:</b> ' + escapeHtml(credit.judul) + ' &mdash; ' + escapeHtml(credit.lembaga) + '. ' +
      'Diakses pada ' + creditTanggalAkses() + '. ' +
      escapeHtml(credit.tautan) +
      '</div>';
  }

  function creditText() {
    return credit.judul + ' - ' + credit.lembaga + '. Diakses pada ' +
      creditTanggalAkses() + '. ' + credit.tautan;
  }

  /* ── peta ──
     LBS digambar lebih dulu lalu LSD di atasnya, karena LSD bagian dari LBS.
     Kalau urutannya dibalik, LSD tertutup dan tidak terlihat. */
  function clearMap() {
    if (mapLayerLbs && window.map && window.map.hasLayer(mapLayerLbs)) window.map.removeLayer(mapLayerLbs);
    if (mapLayerLsd && window.map && window.map.hasLayer(mapLayerLsd)) window.map.removeLayer(mapLayerLsd);
    if (highlightLayer && window.map && window.map.hasLayer(highlightLayer)) window.map.removeLayer(highlightLayer);
    mapLayerLbs = null;
    mapLayerLsd = null;
    highlightLayer = null;
  }

  function gambarLayer(layer, items, order) {
    var group = window.L.featureGroup();
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var poly = window.L.geoJSON(it.geometry, {
        style: { color: order, weight: 1.3, opacity: 0.9, fillColor: it.warna, fillOpacity: order === 'lbs' ? 0.5 : 0.65 }
      });
      poly.bindPopup(popupHtml(it, layer));
      group.addLayer(poly);
    }
    group.addTo(window.map);
    return group;
  }

  function popupHtml(it, layer) {
    var luas = it.luasIrisanHa === null ? 'tidak tersedia'
      : it.luasIrisanHa.toLocaleString('id-ID', { maximumFractionDigits: 3 }) + ' ha';
    var barisAtrib = '';
    if (it.luasAtribIrisanHa !== null) {
      barisAtrib = '<div class="geotani-sls-popup-row"><span>Luas atribut BIG</span><b>' +
        it.luasAtribIrisanHa.toLocaleString('id-ID', { maximumFractionDigits: 3 }) + ' ha</b></div>';
    }
    return '<div class="geotani-sls-popup">' +
      '<div class="geotani-sls-popup-title">' + escapeHtml(it.nama) + '</div>' +
      '<div class="geotani-sls-popup-row"><span>Layer</span><b>' + escapeHtml(layer.nama) + '</b></div>' +
      '<div class="geotani-sls-popup-row"><span>Luas di desa</span><b>' + luas + '</b></div>' +
      barisAtrib +
      (it.terpotong ? '<div class="geotani-sls-popup-row"><span>Status</span><b>terpotong batas desa</b></div>' : '') +
      '</div>';
  }

  function drawOnMap(options) {
    clearMap();
    if (!state || !window.L || !window.map) return false;
    var opts = options || {};
    if (state.layers.lbs) mapLayerLbs = gambarLayer(state.layers.lbs, state.layers.lbs.items, 'lbs');
    if (state.layers.lsd) mapLayerLsd = gambarLayer(state.layers.lsd, state.layers.lsd.items, 'lsd');
    zoomKeDesa(opts);
    return true;
  }

  /* Memposerkan peta ke desa hasil analisis. Tanpa ini, muat LBS/LSD tidak
     bergerak sama sekali dan poligon yang baru muncul terlihat seperti
     muncul entah dari mana. Pad dan maxZoom mengikuti pola geotani-sls.js;
     maxZoom 17 dipakai karena poligon BIG jauh lebih detail (sampai 800
     titik) dibanding SLS BPS. */
  function zoomKeDesa(options) {
    var opts = options || {};
    if (!state || !window.map || !window.L) return false;
    if (opts.flyTo === false) return false;
    if (!state.bbox) return false;
    var b = state.bbox;
    window.map.flyToBounds(
      window.L.latLngBounds([[b.south, b.west], [b.north, b.east]]).pad(0.08),
      { maxZoom: 17, duration: opts.duration === undefined ? 0.8 : opts.duration }
    );
    return true;
  }

  function highlight(grup, index) {
    if (!state || !window.L || !window.map) return false;
    if (highlightLayer && window.map.hasLayer(highlightLayer)) window.map.removeLayer(highlightLayer);
    var layer = grup === 'lsd' ? state.layers.lsd : state.layers.lbs;
    if (!layer) return false;
    var it = layer.items[index];
    if (!it) return false;
    highlightLayer = window.L.geoJSON(it.geometry, {
      style: { color: '#f59e0b', weight: 2.6, opacity: 1, fillColor: '#fbbf24', fillOpacity: 0.4 }
    }).addTo(window.map);
    return true;
  }

  function clear() {
    state = null;
    window._geotaniLbsLsdData = null;
    clearMap();
  }

  /* Tombol "Reset Polygon". clear() saja tidak cukup: ia hanya mengosongkan
     state, layer peta, dan window._geotaniLbsLsdData. Tanpa ini, daftar hasil
     dan input pencarian masih menampilkan desa yang sudah dilepas dari peta,
     sehingga layar terlihat seperti data masih termuat. */
  function reset() {
    generasi += 1;
    clear();
    inFlight.clear();
    setSelectedKode(null, null);
    var input = document.getElementById('geotaniLbsLsdVillageSearch');
    var results = document.getElementById('geotaniLbsLsdVillageResults');
    var out = document.getElementById('geotani-lbslsd-output');
    var status = document.getElementById('geotani-lbslsd-status');
    var btn = document.getElementById('geotani-lbslsd-load');
    if (input) input.value = '';
    if (results) { results.hidden = true; results.innerHTML = ''; }
    if (out) out.innerHTML = '';
    if (status) status.textContent = '';
    if (btn) btn.disabled = false;
  }

  function getState() { return state; }

  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtLuas(ha) {
    if (ha === null || ha === undefined) return 'tidak tersedia';
    return ha.toLocaleString('id-ID', { maximumFractionDigits: 3 }) + ' ha';
  }

  function barisLayer(layer) {
    if (!layer || !layer.items.length) return '';
    var h = '<div class="geotani-lbslsd-layer">';
    h += '<div class="geotani-lbslsd-layer-head">' +
      '<span class="geotani-lbslsd-swatch" style="background:' + escapeHtml(layer.items[0].warna) + '"></span>' +
      escapeHtml(layer.nama) + ' <b>' + layer.items.length + '</b> poligon</div>';
    h += '<div class="geotani-lbslsd-sub">Total di desa: <b>' + fmtLuas(layer.totalIrisanHa) + '</b>' +
      (layer.utuh || layer.terpotong
        ? ' <span class="geotani-lbslsd-note">(' + layer.utuh + ' utuh' +
          (layer.terpotong ? ', ' + layer.terpotong + ' terpotong' : '') + ')</span>'
        : '') +
      '</div>';
    if (layer.totalAtribIrisanHa > 0) {
      h += '<div class="geotani-lbslsd-sub">Luas atribut BIG di desa: ' + fmtLuas(layer.totalAtribIrisanHa) + '</div>';
    }
    if (layer.terpotongQuery) {
      h += '<div class="geotani-lbslsd-warn">Server BIG membatasi jumlah poligon per permintaan. Sebagian data mungkin tidak tampil.</div>';
    }
    h += '<ul class="geotani-lbslsd-list">';
    for (var i = 0; i < layer.items.length; i++) {
      var it = layer.items[i];
      h += '<li data-lbslsd-layer="' + layer.key + '" data-lbslsd-index="' + i + '">' +
        '<span class="geotani-sls-name">' + escapeHtml(it.nama) +
        (it.terpotong ? ' <i>(terpotong)</i>' : '') + '</span>' +
        '<span class="geotani-sls-luas">' + fmtLuas(it.luasIrisanHa) + '</span>' +
        '</li>';
    }
    h += '</ul></div>';
    return h;
  }

  function listHtml() {
    if (!state) return '';
    if (state.adaData === false) {
      /* Bukan kegagalan: peta BIG 1:50.000 tidak mencakup seluruh wilayah.
         Kredit tetap ditampilkan supaya jelas dari mana data ini berasal. */
      return '<div class="geotani-lbslsd-summary">' +
        '<div><span>Desa</span><b>' + escapeHtml(state.namaDesa) + '</b></div>' +
        (state.luasDesaHa !== null
          ? '<div><span>Luas desa</span><b>' + fmtLuas(state.luasDesaHa) + '</b></div>' : '') +
        '<div><span>LBS / LSD</span><b>0 ha</b></div>' +
        '</div>' +
        '<div class="geotani-lbslsd-note" style="margin-top:8px;">BIG tidak punya data LBS atau LSD ' +
        'yang menutupi desa ini. Cakupan peta skala 1:50.000 tidak seluruh Indonesia.</div>' +
        creditHtml();
    }
    var h = '<div class="geotani-lbslsd-summary">';
    h += '<div><span>Lahan Baku Sawah</span><b>' + fmtLuas(state.lbsIrisanHa) + '</b></div>';
    h += '<div><span>Lahan Sawah Dilindungi</span><b>' + fmtLuas(state.lsdIrisanHa) + '</b></div>';
    if (state.luasDesaHa !== null) {
      h += '<div><span>Luas desa</span><b>' + fmtLuas(state.luasDesaHa) + '</b></div>';
    }
    h += '</div>';
    if (state.tumpangTindih) {
      h += '<div class="geotani-lbslsd-warn">Peringatan tumpang tindih: jumlah luas LBS melebihi ' +
        'luas desa (' + fmtLuas(state.lbsIrisanHa) + ' dari ' + fmtLuas(state.luasDesaHa) + '). Peta ' +
        '1:50.000 BIG digambar manual sehingga poligon bisa saling menimpa, dan luas hasil ' +
        'penjumlahan menghitung sebagian area lebih dari sekali.</div>';
    }
    if (state.subsetTidakBerlaku) {
      /* Bukan error: dibuktikan di lapangan bahwa peta LBS BIG 1:50.000 punya
         lubang cakupan di sebagian desa, sehingga LSD bisa menutupi daerah yang
         LBS tidak gambarkan. Angkanya tetap ditampilkan, tapi catatan ini
         menjelaskan kenapa keduanya tidak sebanding. */
      h += '<div class="geotani-lbslsd-warn">Luas LSD lebih besar dari LBS di desa ini. Ini ' +
        'bukan kesalahan hitung: peta LBS BIG 1:50.000 memiliki lubang cakupan di sebagian desa, ' +
        'sehingga ada wilayah yang digambar LSD tetapi tidak digambar LBS.</div>';
    }
    h += barisLayer(state.layers.lbs);
    h += barisLayer(state.layers.lsd);
    h += creditHtml();
    return h;
  }

  /* ── pencarian desa ──
     Milik kartu ini sendiri, karena kode desa di panel GeoTani lain disimpan
     di state modul lokal mereka. Sumber daftar sudah termuat di halaman. */
  function daftarDesa() {
    if (desaList) return desaList;
    var all = (typeof window !== 'undefined') ? window.KODE_WILAYAH_DATA : null;
    if (!all || !all.length) return null;
    desaList = [];
    for (var i = 0; i < all.length; i++) {
      var it = all[i];
      if (it && it.kode && it.nama && (it.kode.match(/\./g) || []).length === 3) desaList.push(it);
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
    var picked = document.getElementById('geotaniLbsLsdVillageSelected');
    if (picked) {
      if (selectedKode) {
        picked.textContent = '✓ ' + (nama || selectedKode) + ' (' + selectedKode + ')';
        picked.hidden = false;
      } else {
        picked.textContent = '';
        picked.hidden = true;
      }
    }
    if (selectedKode !== (state && state.kode) && state) clear();
  }

  function getSelectedKode() { return selectedKode; }

  function init(root) {
    var host = root || document.getElementById('geotani-lbslsd-card');
    if (!host) return null;
    var btn = document.getElementById('geotani-lbslsd-load');
    var out = document.getElementById('geotani-lbslsd-output');
    var status = document.getElementById('geotani-lbslsd-status');
    var input = document.getElementById('geotaniLbsLsdVillageSearch');
    var results = document.getElementById('geotaniLbsLsdVillageResults');
    var resetBtn = document.getElementById('geotani-lbslsd-reset');
    if (!btn || !out) return null;
    if (btn.__geotaniLbsLsdBound) return api;
    btn.__geotaniLbsLsdBound = true;

    if (resetBtn && !resetBtn.__geotaniLbsLsdResetBound) {
      resetBtn.__geotaniLbsLsdResetBound = true;
      resetBtn.addEventListener('click', function () { reset(); });
    }

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
      if (status) status.textContent = 'Mengambil data LBS & LSD dari BIG...';
      try {
        var st = await load(kode);
        /* null berarti pengguna menekan "Reset Polygon" selagi request ini
           berjalan. Jangan menulis apa pun ke layar -- state sudah dikosongkan
           dan menggambar ulang akan bring back layer yang baru dilepas. */
        if (!st) return;
        drawOnMap();
        out.innerHTML = listHtml();
        if (status) {
          status.textContent = st.adaData === false
            ? 'BIG tidak punya data LBS/LSD untuk desa ini.'
            : '';
        }
      } catch (e) {
        if (status) status.textContent = e && e.message ? e.message : 'Gagal mengambil data LBS/LSD.';
      } finally {
        btn.disabled = false;
      }
    });

    out.addEventListener('click', function (ev) {
      var li = ev.target.closest ? ev.target.closest('[data-lbslsd-index]') : null;
      if (li) {
        highlight(li.getAttribute('data-lbslsd-layer'), Number(li.getAttribute('data-lbslsd-index')));
      }
    });

    return api;
  }

  api = {
    load: load,
    clear: clear,
    init: init,
    getState: getState,
    listHtml: listHtml,
    credit: credit,
    creditHtml: creditHtml,
    creditText: creditText,
    creditTanggalAkses: creditTanggalAkses,
    drawOnMap: drawOnMap,
    zoomKeDesa: zoomKeDesa,
    clearMap: clearMap,
    clear: clear,
    reset: reset,
    highlight: highlight,
    areaHa: areaHa,
    queryLayer: queryLayer,
    clipKeDesa: clipKeDesa,
    villageMeta: villageMeta,
    bboxDariRings: bboxDariRings,
    esriKeTurf: esriKeTurf,
    daftarDesa: daftarDesa,
    cariDesa: cariDesa,
    setSelectedKode: setSelectedKode,
    getSelectedKode: getSelectedKode,
    kodeDariPanelLain: kodeDariPanelLain,
    normalisasi: normalisasi,
    LBS: LBS,
    LSD: LSD,
    BIG: BIG,
    RECORD_LIMIT: RECORD_LIMIT,
    _bigUrl: bigUrl
  };
  window.GeoTaniLbsLsd = api;

  if (typeof document !== 'undefined') {
    var boot = function () { if (!init()) setTimeout(boot, 300); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();
