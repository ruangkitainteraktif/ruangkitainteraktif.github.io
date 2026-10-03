/* ── TransJakarta — Koridor Transportasi Umum (2026) ──
 *
 * Dua layer dari satu FeatureServer:
 *   /0  Bus Stops  point
 *   /1  Bus Routes polyline
 *
 * TIGA TEMUAN YANG MENENTUKAN CARA KERJA MODUL INI. Semuanya diuji
 * langsung ke endpoint, bukan diasumsikan, karena tiga asumsi yang
 * paling wajar ternyata salah:
 *
 * 1. TIDAK ADA TILE. exportTilesAllowed=False dan /tile/... membalas
 *    400 di semua zoom. Jadi L.tileLayer mustahil, dan WMTS/vektor-tile
 *    juga tidak ada. Satu-satunya jalan adalah L.esri.featureLayer, yang
 *    memang querying REST per viewport -- cocok, karena datanya kecil:
 *    24 fitur, bukan nation-scale.
 *
 * 2. CORS AMAN TANPA PROXY. Server meng-echo Access-Control-Allow-Origin
 *    dari origin permintaan, jadi fetch langsung dari browser berhasil.
 *    Proxy kta-cors-proxy milik repo ini sengaja TIDAK dipakai di jalur
 *    utama. Ia tetap dipertahankan sebagai cadangan, karena server bisa
 *    berubah sewaktu-waktu tanpa pemberitahuan -- lihat ambilJson().
 *
 * 3. PROYEKTI SERVER BUKAN 3857. Data native-nya UTM zone 48S (WKID
 *    32748), sedangkan peta web ini 3857. Leaflet/esri-leaflet melakukan
 *    konversi sendiri untuk geometry, jadi TIDAK ADA proj4 yang perlu
 *    dimuat. Yang penting: selalu minta outSR=4326, dan tambahkan
 *    geometryPrecision supaya payload tidak membengkak. Tanpa precision,
 *    satu koridor punya ribuan titik desimal panjang; dengan precision 5
 *    (kira-kira 1 meter), turun jadi ~18 KB per koridor.
 *
 * KORIDOR DISIMPAN SEBAGAI STRING DI SERVER, BUKAN ANGKA. Field KORIDOR
 * bertipe esriFieldTypeString, jadi tidak boleh di-bandingkan dengan > 0
 * atau diurutkan secara numerik tanpa parse lebih dulu. Urutan koridor
 * di sheet sengaja diurutkan dengan parseInt, bukan sesuai urutan string
 * -- kalau tidak, koridor 10 dan 11 akan muncul sebelum koridor 2.
 *
 * 24 fitur = 12 koridor x 2 arah, dan setiap koridor punya dua record
 * dengan JURUSAN yang saling berlawanan ("KOTA - BLOK M" dan
 * "BLOK M - KOTA"). Sheet menjumlahkan keduanya jadi satu baris, karena
 * yang dilihat pengguna adalah satu koridor utuh, bukan dua arah.
 */
(function () {
  'use strict';

  var DASAR = 'https://services8.arcgis.com/mpSDBlkEzjS62WgX/ArcGIS/rest/services/TransJakarta_Network/FeatureServer/';
  var DASAR_JALUR = 'https://services8.arcgis.com/mpSDBlkEzjS62WgX/arcgis/rest/services/Data_Jaringan_TransJakarta/FeatureServer/';
  var DASAR_JAKARTASATU = 'https://jakartasatu.jakarta.go.id/server/rest/services/JakartaSatu/Transjakarta/MapServer/';
  var DATA_TRANSPORTASI_JAKARTA = 'https://gis-dpmptsp.jakarta.go.id/arcgis/rest/services/Hosted/Transportasi_Umum_Jakarta_v2/FeatureServer/0/query';
  var DASAR_JALAN_JAKARTASATU = 'https://jakartasatu.jakarta.go.id/server/rest/services/JakartaSatu/Peta_Jalan/MapServer/';
  var ID_HALTE = 0;
  var ID_JALUR = 0;
  var ID_JALUR_JAKARTASATU = 1;

  var PROXY = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';

  var FIELD_JALUR = ['route_short_name', 'route_long_name', 'route_desc', 'route_type', 'route_type_text', 'route_color', 'route_text_color', 'Shape__Length'];
  var FIELD_HALTE = ['stop_name', 'stop_desc', 'stop_code', 'Type', 'route_info', 'wheelchair_boarding', 'platform_code'];

  var WARNA_DEFAULT = '#94a3b8';

  /* Z pane. Peta dibuat dengan preferCanvas:true (map-core.js), jadi
   * bringToFront() tidak mengubah urutan DOM -- urutan hanya bisa
   * dikendalikan lewat pane.
   *
   * 100  batnasPane   = hillshade + batimetri (bringToBack)
   * 400  overlayPane  = layer vektor biasa
   * 455  lbsVtPane    = vektor tile pertanian
   * 430  (dipakai di sini, di atas overlayPane, di bawah lbsVtPane)
   * 2000 labelsPane  = label basemap, selalu paling atas
   *
   * Dipilih di atas terrain/hillshade supaya jalur tidak hilang di
   * bawahnya, dan di bawah label supaya nama jalan tetap terbaca. */
  var Z_PANE = 430;

  /* Halte memakai pane sendiri, satu tingkat di atas jalur.
   *
   * Alasannya bukan sekadar "supaya kelihatan". Dengan pane yang sama,
   * urutan gambar hanya bergantung pada urutan penambahan layer -- dan
   * urutan itu berubah begitu salah satu dinyalakan lewat toggle
   * terpisah. Akibatnya titik halte bisa tertimpa garis koridor,
   * persis di tempat orang justru butuh melihatnya. Pane terpisah
   * menutup masalah itu secara permanen, bukan bergantung pada urutan
   * penambahan yang bisa berubah sewaktu-waktu. */
  var Z_PANE_HALTE = 431;

  /* 12 koridor. Warna dipilih per hue agar mudah dibedakan pasangkan
   * dua garis bersebelahan, dan seluruhnya brightness tinggi supaya
   * tetap terbaca di atas peta satelit dan terrain, bukan cuma di atas
   * basemap terang.
   *
   * "halo" adalah garis luar putih transparan. Tanpa itu, koridor
   * berwarna terang yang lewat di atas jalan abu-abu atau area hijau
   * rastafel ownership jadi sulit dibaca -- dan yang penting, dua
   * koridor yang bersilangan di pusat kota akan terlihat sebagai satu
   * gumpalan. */
  var KORIDOR = {
    '1':  { nama: 'Koridor 1', line: '#ff4d6d', halo: 'rgba(255,255,255,.85)' },
    '2':  { nama: 'Koridor 2', line: '#ff7a18', halo: 'rgba(255,255,255,.85)' },
    '3':  { nama: 'Koridor 3', line: '#ffc300', halo: 'rgba(60,40,0,.85)' },
    '4':  { nama: 'Koridor 4', line: '#7ed321', halo: 'rgba(0,50,0,.85)' },
    '5':  { nama: 'Koridor 5', line: '#00e5a0', halo: 'rgba(0,50,35,.85)' },
    '6':  { nama: 'Koridor 6', line: '#22d3ee', halo: 'rgba(0,40,50,.85)' },
    '7':  { nama: 'Koridor 7', line: '#3b82f6', halo: 'rgba(255,255,255,.85)' },
    '8':  { nama: 'Koridor 8', line: '#a855f7', halo: 'rgba(255,255,255,.85)' },
    '9':  { nama: 'Koridor 9', line: '#f472b6', halo: 'rgba(60,0,35,.85)' },
    '10': { nama: 'Koridor 10', line: '#ffd60a', halo: 'rgba(60,40,0,.85)' },
    '11': { nama: 'Koridor 11', line: '#5eead4', halo: 'rgba(0,50,45,.85)' },
    '12': { nama: 'Koridor 12', line: '#c084fc', halo: 'rgba(45,0,60,.85)' }
  };

  var KODE_URUT = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

  var layerJalur = null;
  var layerJalurJakartaSatu = null;
  var layerHalte = null;
  var layerAntarmoda = null;
  var cacheJalur = null;
  var cacheHalte = null;
  var cacheAntarmoda = null;
  var visibleJalur = false;
  var visibleJalurJakartaSatu = false;
  var visibleHalte = false;
  var visibleAntarmoda = false;
  var moduleActive = false;
  var koridorTerpilih = null;
  var koridorDisorot = null;
  var jenisDisorot = null;

  /* Sheet harus terbuka saat layer dinyalakan, tapi TIDAK boleh memaksa
   * buka ulang setelah user menutup manual. Tanpa flag ini, toggle
   * on-off-on akan selalu membHoyat sheet ke layar even kalau user
   * sengaja menutupnya. */
  var userTutupSheet = false;

  /* Peta sudah pernah terbang ke jaringan jalur. Mencegah pola
   * toggle on-off-on Terbang berulang kali dan mengubah posisi kerja
   * pengguna di peta tanpa diminta. */
  var sudahTerbang = false;

  var state = {
    dimuat: false,
    gagal: false,
    ringkas: [],
    ringkasJakartaSatu: [],
    totalKm: 0,
    halte: 0,
    antarmoda: 0,
    antarmodaError: '',
    filter: { q: '', kategori: 'all', jenis: {} }
  };

  function normalizeLayanan(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s) return 'Layanan umum';
    var lower = s.toLowerCase();
    if (lower.indexOf('brt') !== -1 || lower.indexOf('bus rapid transit') !== -1) return 'BRT';
    if (lower.indexOf('feeder') !== -1) return 'Feeder';
    if (lower.indexOf('mikro') !== -1 || lower.indexOf('micro') !== -1) return 'Mikrotrans';
    if (lower.indexOf('non-brt') !== -1 || lower.indexOf('non brt') !== -1) return 'Non-BRT';
    if (lower.indexOf('angkot') !== -1 || lower.indexOf('bus') !== -1) return 'Bus';
    if (lower.indexOf('transit') !== -1) return 'Transit';
    return s;
  }

  function opsiJenisLayanan() {
    var map = {};
    state.ringkas.forEach(function (r) {
      var label = normalizeLayanan(r.tipe || 'Layanan umum');
      map[label] = (map[label] || 0) + 1;
    });
    return Object.keys(map).sort(function (a, b) {
      return a.localeCompare(b, 'id');
    });
  }

  function siapkanFilterJenis() {
    var opsi = opsiJenisLayanan();
    if (!state.filter.jenis) state.filter.jenis = {};
    opsi.forEach(function (jenis) {
      if (typeof state.filter.jenis[jenis] !== 'boolean') state.filter.jenis[jenis] = true;
    });
    Object.keys(state.filter.jenis).forEach(function (jenis) {
      if (opsi.indexOf(jenis) === -1) delete state.filter.jenis[jenis];
    });
    return opsi;
  }

  function cocokFilterKoridor(r) {
    var q = (state.filter.q || '').trim().toLowerCase();
    var nama = (r.nama || '').toLowerCase();
    var kode = String(r.kode || '').toLowerCase();
    var tipe = normalizeLayanan(r.tipe || 'Layanan umum');

    if (q) {
      var haystack = [nama, kode, tipe, (r.ruas || []).join(' ')].join(' ').toLowerCase();
      if (haystack.indexOf(q) === -1) return false;
    }

    return true;
  }

  function filterFeatureByState(f) {
    var p = f && f.properties ? f.properties : {};
    var q = (state.filter.q || '').trim().toLowerCase();
    var tipe = normalizeLayanan(p.route_type_text || p.route_desc || p.Type || 'Layanan umum');
    var haystack = [
      p.route_short_name || '',
      p.KORIDOR || '',
      p.route_long_name || '',
      p.JURUSAN || '',
      p.route_desc || '',
      p.route_info || '',
      p.stop_name || '',
      p.NAMA || '',
      tipe
    ].join(' ').toLowerCase();

    if (q && haystack.indexOf(q) === -1) return false;
    return true;
  }

  function fiturTerfilterJalur() {
    if (!cacheJalur || !cacheJalur.features) return { type: 'FeatureCollection', features: [] };
    var fitur = cacheJalur.features.filter(function (f) {
      return filterFeatureByState(f);
    });
    /* Klik baris memilih satu koridor dan meredupkan koridor lain. */
    if (koridorTerpilih) fitur = fitur.filter(function (f) { return kunciKoridor((f.properties || {}).KORIDOR) === koridorTerpilih; });
    return {
      type: 'FeatureCollection',
      features: fitur
    };
  }

  function refreshLayerJalur() {
    if (!cacheJalur) return;
    var fitur = fiturTerfilterJalur().features;
    function muatKeLayer(layer, jakartaSatu) {
      if (!layer) return;
      var data = {
        type: 'FeatureCollection',
        features: fitur.filter(function (f) {
          var tambahan = (f.properties || {}).__rangkumanRoute === false;
          return tambahan === jakartaSatu;
        })
      };
      layer.halo.clearLayers();
      layer.utama.clearLayers();
      layer.halo.addData(data);
      layer.utama.addData(data);
    }
    if (visibleJalur) muatKeLayer(layerJalur, false);
    if (visibleJalurJakartaSatu) muatKeLayer(layerJalurJakartaSatu, true);
    refreshStyleKoridorTerpilih();
  }

  function fiturTerfilterHalte() {
    if (!cacheHalte || !cacheHalte.features) return { type: 'FeatureCollection', features: [] };
    return {
      type: 'FeatureCollection',
      features: cacheHalte.features.filter(filterFeatureByState)
    };
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function nomor(n) {
    return Number(n || 0).toLocaleString('id-ID');
  }

  /* KORIDOR dari server bisa bernapas/spasi di beberapa baris halte.
   * Semua akses ke tabel warna HARUS lewat fungsi ini, bukan langsung
   * mengindeks KORIDOR[v], kalau tidak koridor dengan spasi akan
   * jatuh ke warna abu-abu tanpa alasan yang kelihatan. */
  function kunciKoridor(v) {
    return String(v == null ? '' : v).trim();
  }

  function infoKoridor(v) {
    return KORIDOR[kunciKoridor(v)] || null;
  }

  function warnaKoridor(v) {
    var f = cacheJalur && cacheJalur.features || [];
    for (var i = 0; i < f.length; i++) {
      var p = f[i].properties || {};
      if (kunciKoridor(p.KORIDOR) === kunciKoridor(v) && /^[0-9a-f]{6}$/i.test(p.route_color || '')) return '#' + p.route_color;
    }
    var info = infoKoridor(v);
    if (info) return info.line;
    return WARNA_DEFAULT;
  }

  function haloKoridor(v) {
    var info = infoKoridor(v);
    return info ? info.halo : 'rgba(255,255,255,.8)';
  }

  function getStyleJalur(f, selectedKode) {
    var p = f && f.properties || {};
    var kode = kunciKoridor(p.KORIDOR);
    var tipe = normalizeLayanan(p.route_type_text || p.route_desc || p.Type || 'Layanan umum');
    var sorot = koridorDisorot ? kode === koridorDisorot : !!(jenisDisorot && tipe === jenisDisorot);
    var aktif = sorot || !!(selectedKode != null ? (kode === selectedKode) : (kode === koridorTerpilih));
    return {
      color: aktif ? '#f97316' : warnaKoridor(kode),
      weight: aktif ? 5.2 : 3.5,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round'
    };
  }

  function getStyleHaloJalur(f, selectedKode) {
    var p = f && f.properties || {};
    var kode = kunciKoridor(p.KORIDOR);
    var tipe = normalizeLayanan(p.route_type_text || p.route_desc || p.Type || 'Layanan umum');
    var sorot = koridorDisorot ? kode === koridorDisorot : !!(jenisDisorot && tipe === jenisDisorot);
    var aktif = sorot || !!(selectedKode != null ? (kode === selectedKode) : (kode === koridorTerpilih));
    return {
      color: aktif ? '#fff7ed' : haloKoridor(kode),
      weight: aktif ? 10 : 7,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    };
  }

  function refreshStyleKoridorTerpilih() {
    [layerJalur, layerJalurJakartaSatu].forEach(function (group) {
      if (!group) return;
      if (group.halo && group.halo.eachLayer) {
        group.halo.eachLayer(function (layer) {
          if (layer && layer.feature) layer.setStyle(getStyleHaloJalur(layer.feature));
        });
      }
      if (group.utama && group.utama.eachLayer) {
        group.utama.eachLayer(function (layer) {
          if (layer && layer.feature) layer.setStyle(getStyleJalur(layer.feature));
        });
      }
    });
  }

  function pilihKoridor(kode, opts) {
    var target = kunciKoridor(kode);
    koridorTerpilih = target || null;
    refreshLayerJalur();
    refreshStyleKoridorTerpilih();
    if (opts && opts.zoom !== false && target && cacheJalur && cacheJalur.features) {
      var feats = cacheJalur.features.filter(function (f) {
        return kunciKoridor((f.properties || {}).KORIDOR) === target;
      });
      if (feats.length) {
        var group = L.geoJSON({ type: 'FeatureCollection', features: feats });
        try {
          map.fitBounds(group.getBounds(), { padding: [36, 36], maxZoom: 15 });
        } catch (e) {} 
      }
    }
  }

  /* ── ambil data ──
   * outSR=4326 wajib supaya Leaflet bisa memplot hasilnya; tanpa itu
   * koordinatnya UTM 48S dan layer muncul di Samudra Hindia.
   * geometryPrecision=5 memangkas desimal yang tidak ada gunanya.
   */
  function urlQuery(id, params) {
    var q = ['where=1%3D1', 'returnGeometry=true', 'outSR=4326', 'geometryPrecision=5', 'f=json'];
    for (var i = 0; i < params.length; i++) q.push(params[i]);
    return DASAR + id + '/query?' + q.join('&');
  }

  function urlQueryJalur(params) {
    var q = ['where=1%3D1', 'returnGeometry=true', 'outSR=4326', 'geometryPrecision=5', 'f=json'];
    for (var i = 0; i < params.length; i++) q.push(params[i]);
    return DASAR_JALUR + ID_JALUR + '/query?' + q.join('&');
  }

  function urlQueryJakartaSatu(id, params) {
    var q = ['where=1%3D1', 'returnGeometry=true', 'outSR=4326', 'geometryPrecision=5', 'f=json'];
    for (var i = 0; i < params.length; i++) q.push(params[i]);
    return DASAR_JAKARTASATU + id + '/query?' + q.join('&');
  }

  function ambilJson(url) {
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .catch(function () {
        /* Cadangan saja. Jalur utama hampir selalu berhasil karena
         * server meng-echo CORS header; proxy dipakai kalau ada yang
         * berubah di sisi server. */
        return fetch(PROXY + encodeURIComponent(url), { headers: { Accept: 'application/json' } })
          .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          });
      });
  }

  /* esriJSON -> GeoJSON.
   *
   * INI BUKAN DETAIL KECIL. ArcGIS REST /query dengan returnGeometry=true
   * TIDAK mengembalikan GeoJSON, melainkan esriJSON, dan bentuknya beda
   * total:
   *
   *   polyline  { paths: [[ [x,y], [x,y] ]] }   (bukan "coordinates")
   *   point     { x: 106.8, y: -6.1 }          (bukan "coordinates")
   *
   * Leaflet hanya mencari kunci "coordinates". Kalau objek mentah
   * diteruskan apa adanya, L.geoJSON tidak melempar error -- dia diam,
   * karena "geometry" yang dia terima dianggap bukan geometri yang dia
   * kenal. Akibatnya layer tidak pernah muncul di peta, tanpa jejak
   * error di konsol, dan getBounds() mengembalikan batas yang tidak
   * masuk akal sehingga fitBounds juga tidak bergerak ke mana pun.
   *
   * Konversi dilakukan di sini, bukan lewat esri-leaflet, karena modul
   * ini memakai L.geoJSON untukcersuaikanwarnadan halo -- bukan
   * L.esri.featureLayer yang sudah mengonversi sendiri. */
  function esriGeometryKeGeoJson(g) {
    if (!g) return null;

    /* Sudah GeoJSON (mis. dari cache atau sumber lain) -> teruskan. */
    if (g.coordinates) return g;

    /* Polyline. Satu path = LineString, lebih dari satu = MultiLineString.
     * Layer Jalur di sini satu path per fitur (masing-masing arah), tapi
     * kasus MultiLineString tetap ditangani supaya modul tidak rapuh
     * kalau nanti server mengubah cara simpan geometri. */
    if (g.paths && g.paths.length) {
      if (g.paths.length === 1) {
        return { type: 'LineString', coordinates: g.paths[0] };
      }
      return { type: 'MultiLineString', coordinates: g.paths };
    }

    /* Point. srcPoint="web" berarti x/y sudahDegrees, bukan meter --
     * yang terjadi kalau outSR=4326 dipakai, dan itu yang kita minta. */
    if (g.x != null && g.y != null) {
      return { type: 'Point', coordinates: [g.x, g.y] };
    }

    /* Polygon / MultiPolygon, untuk kelengkapan. */
    if (g.rings && g.rings.length) {
      if (g.rings.length === 1) {
        return { type: 'Polygon', coordinates: g.rings };
      }
      return { type: 'MultiPolygon', coordinates: [g.rings] };
    }

    return null;
  }

  function featuresKeGeoJson(data) {
    var feats = (data && data.features) || [];
    return {
      type: 'FeatureCollection',
      features: feats.map(function (f) {
        return {
          type: 'Feature',
          geometry: esriGeometryKeGeoJson(f.geometry),
          properties: f.attributes || {}
        };
      }).filter(function (f) {
        /* Fitur tanpa geometri yang bisa dikonversi dibuang, bukan
         * dibiarkan ikut. Kalau dibiarkan, L.geoJSON akan melempar
         * "Invalid GeoJSON" untuk satu fitur dan seluruh layer hilang. */
        return !!f.geometry;
      })
    };
  }

  /* ── rekap per koridor ──
   * 24 fitur server = 12 koridor x 2 arah. Sheet butuh satu baris per
   * koridor, jadi SHAPE.LEN dijumlahkan dan ruas digabung.
   *
   * Panjang total dijumlah dari semua record, bukan dari baris
   * setelah digabung, karena keduanya harus sama -- kalau tidak, ada
   * koridor yang somehow tidak terhitung dan angka besar di header
   * tidak bisa dipercaya. */
  function rekapKoridor(geojson) {
    var peta = {};
    geojson.features.forEach(function (f) {
      var p = f.properties || {};
      if (p.__rangkumanRoute === false) return;
      var k = kunciKoridor(p.KORIDOR);
      if (!k) k = 'Rute';
      if (!peta[k]) peta[k] = { kode: k, nama: (infoKoridor(k) || {}).nama || ('Rute ' + k), warna: warnaKoridor(k), tipe: p.route_desc || '', panjangM: 0, ruas: [], fitur: [] };
      var len = Number(p['SHAPE.LEN']) || 0;
      peta[k].panjangM += len;
      if (p.JURUSAN) peta[k].ruas.push(String(p.JURUSAN));
      peta[k].fitur.push(f);
    });

    return Object.keys(peta).sort(function (a, b) { return a.localeCompare(b, 'id', { numeric: true }); }).map(function (k) { return peta[k]; });
  }

  function normalisasiHalteUtama(data) {
    var hasil = featuresKeGeoJson(data);
    hasil.features.forEach(function (f) {
      var p = f.properties || {};
      p.NAMA = p.stop_name;
      p.JENIS = p.Type;
      p.KORIDOR = p.route_info;
      p.ALAMAT = p.stop_desc;
    });
    return hasil.features;
  }

  function normalisasiHalteJakartaSatu(data) {
    var hasil = featuresKeGeoJson(data);
    hasil.features.forEach(function (f) {
      var p = f.properties || {};
      p.stop_name = p.NAMOBJ || p.NAMA_HALTE || p.NAME || 'Halte Transjakarta';
      p.NAMA = p.stop_name;
      p.JENIS = p.JENIS || 'Halte';
      p.KORIDOR = p.Koridor || p.KORIDOR || '';
      p.route_info = p.route_info || p.KORIDOR;
      p.ALAMAT = p.Alamat || p.ALAMAT || p.ALAMAT_HALTE || '';
    });
    return hasil.features;
  }

  function normalisasiJalurJakartaSatu(data) {
    var hasil = featuresKeGeoJson(data);
    hasil.features.forEach(function (f) {
      var p = f.properties || {};
      p.KORIDOR = p.KORIDOR || p.Koridor || p.route_short_name || p.ROUTE_SHORT_NAME || p.KODE_RUTE || p.kode_rute || p.ID_RUTE || p.RUTE || p.ROUTE_ID || p.route_id || p.NAMOBJ || p.NAMRUTE || p.OBJECTID || '';
      p.JURUSAN = p.JURUSAN || p.route_long_name || p.ROUTE_LONG_NAME || p.NAMA_RUTE || p.nama_rute || p.NAMRUTE || p.NAMOBJ || p.NAME || p.NAMA || p.ROUTE_NAME || '';
      p.route_desc = p.route_desc || p.ROUTE_DESC || p.routes_desc || p.JENIS_LAYANAN || p.JENIS || '';
      p.route_color = p.route_color || p.ROUTE_COLOR || p.WARNA || '';
      p['SHAPE.LEN'] = p['SHAPE.LEN'] || p.Shape__Length || p.Shape_Length || p.SHAPE_LEN || p.SHAPE_LENGTH;
      p.__rangkumanRoute = false;
    });
    return hasil.features;
  }

  function rekapJalurJakartaSatu(features) {
    var peta = Object.create(null);
    (features || []).forEach(function (f) {
      var p = f.properties || {};
      var kode = kunciKoridor(p.KORIDOR);
      if (!kode) return;
      if (!peta[kode]) {
        peta[kode] = {
          kode: kode,
          nama: p.JURUSAN || (infoKoridor(kode) || {}).nama || ('Koridor ' + kode),
          warna: warnaKoridor(kode),
          tipe: p.route_desc || '',
          panjangM: 0,
          ruas: [],
          fitur: []
        };
      }
      var item = peta[kode];
      var panjang = Number(p['SHAPE.LEN']) || 0;
      item.panjangM += panjang;
      if (p.route_desc && !item.tipe) item.tipe = String(p.route_desc);
      if (p.JURUSAN && item.ruas.indexOf(String(p.JURUSAN)) === -1) item.ruas.push(String(p.JURUSAN));
      item.fitur.push(f);
    });
    return Object.keys(peta).sort(function (a, b) {
      return a.localeCompare(b, 'id', { numeric: true });
    }).map(function (kode) { return peta[kode]; });
  }

  function kunciGeometriJalur(feature) {
    var p = feature.properties || {};
    var geometri = feature.geometry;
    if (!p.KORIDOR || !geometri || !geometri.coordinates) return '';

    var titik = geometri.type === 'LineString'
      ? geometri.coordinates
      : geometri.type === 'MultiLineString'
        ? geometri.coordinates.reduce(function (semua, path) { return semua.concat(path); }, [])
        : [];
    if (titik.length < 2) return '';

    var indeks = [0, Math.floor((titik.length - 1) / 4), Math.floor((titik.length - 1) / 2), Math.floor((titik.length - 1) * 3 / 4), titik.length - 1];
    var sampel = indeks.map(function (i) {
      return Number(titik[i][0]).toFixed(3) + ',' + Number(titik[i][1]).toFixed(3);
    }).sort();
    return String(p.KORIDOR).trim().toLowerCase() + '|' + sampel.join(';');
  }

  function gabungDataJalur(kumpulan) {
    var fitur = [];
    var kunci = Object.create(null);
    kumpulan.forEach(function (features, sumber) {
      (features || []).forEach(function (feature) {
        var props = feature.properties || (feature.properties = {});
        if (sumber === 0) props.__rangkumanRoute = true;
        var geometri = kunciGeometriJalur(feature);
        var idGeometri = geometri ? sumber + '|' + geometri : '';
        if (idGeometri && kunci[idGeometri]) return;
        if (idGeometri) kunci[idGeometri] = true;
        fitur.push(feature);
      });
    });
    return fitur;
  }

  function gabungDataHalte(kumpulan) {
    var gabungan = [];
    var grid = Object.create(null);
    var ukuranSel = 0.0002;
    var jarakMaksimum = 15;

    kumpulan.forEach(function (features) {
      (features || []).forEach(function (feature) {
        var geometry = feature.geometry;
        var coords = geometry && geometry.coordinates;
        if (!coords || coords.length < 2) return;

        var lon = Number(coords[0]);
        var lat = Number(coords[1]);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
        var cellX = Math.floor(lon / ukuranSel);
        var cellY = Math.floor(lat / ukuranSel);
        var cocok = null;

        for (var dxCell = -1; dxCell <= 1 && !cocok; dxCell++) {
          for (var dyCell = -1; dyCell <= 1 && !cocok; dyCell++) {
            var kandidat = grid[cellX + dxCell + ':' + (cellY + dyCell)] || [];
            for (var i = 0; i < kandidat.length; i++) {
              var titik = kandidat[i];
              var dy = (lat - titik.lat) * 111320;
              var dx = (lon - titik.lon) * 111320 * Math.cos((lat + titik.lat) * Math.PI / 360);
              if (dx * dx + dy * dy <= jarakMaksimum * jarakMaksimum) {
                cocok = titik.feature;
                break;
              }
            }
          }
        }

        if (cocok) {
          var target = cocok.properties || (cocok.properties = {});
          var tambahan = feature.properties || {};
          Object.keys(tambahan).forEach(function (key) {
            var nilai = tambahan[key];
            if ((target[key] == null || String(target[key]).trim() === '') && nilai != null && String(nilai).trim() !== '') {
              target[key] = nilai;
            }
          });
          return;
        }

        gabungan.push(feature);
        var keySel = cellX + ':' + cellY;
        if (!grid[keySel]) grid[keySel] = [];
        grid[keySel].push({ feature: feature, lon: lon, lat: lat });
      });
    });

    return gabungan;
  }

  function muatData() {
    if (state.dimuat || state.gagal) return Promise.resolve();
    var pJalurUtama = ambilJson(urlQueryJalur(['outFields=' + encodeURIComponent(FIELD_JALUR.join(','))]))
      .then(function (d) {
        if (d && d.error) throw new Error(d.error.message || 'ArcGIS error');
        var fitur = featuresKeGeoJson(d).features;
        fitur.forEach(function (f) { var p = f.properties || {}; p.KORIDOR = p.route_short_name; p.JURUSAN = p.route_long_name || p.route_desc; p['SHAPE.LEN'] = p.Shape__Length; p.__rangkumanRoute = true; });
        return fitur;
      }).catch(function (e) {
        if (window.console) console.warn('[TransJakarta] sumber jalur utama gagal:', e);
        return [];
      });
    var pJalurJakartaSatu = ambilJson(urlQueryJakartaSatu(ID_JALUR_JAKARTASATU, ['outFields=*']))
      .then(function (d) {
        if (d && d.error) throw new Error(d.error.message || 'JakartaSatu error');
        return normalisasiJalurJakartaSatu(d);
      }).catch(function (e) {
        if (window.console) console.warn('[TransJakarta] sumber jalur JakartaSatu gagal:', e);
        return [];
      });
    var pJalur = Promise.all([pJalurUtama, pJalurJakartaSatu]).then(function (hasil) {
        cacheJalur = { type: 'FeatureCollection', features: gabungDataJalur(hasil) };
        if (!cacheJalur.features.length) throw new Error('Tidak ada data jalur dari kedua sumber');
        state.ringkas = rekapKoridor(cacheJalur);
        state.ringkasJakartaSatu = rekapJalurJakartaSatu(hasil[1]);
        state.totalKm = state.ringkas.reduce(function (a, b) { return a + b.panjangM; }, 0) / 1000;
      });

    var pHalteUtama = ambilJson(urlQuery(ID_HALTE, ['outFields=' + encodeURIComponent(FIELD_HALTE.join(','))]))
      .then(function (d) {
        if (d && d.error) throw new Error(d.error.message || 'ArcGIS error');
        return normalisasiHalteUtama(d);
      }).catch(function (e) {
        if (window.console) console.warn('[TransJakarta] sumber halte utama gagal:', e);
        return [];
      });
    var pHalteJakartaSatu = ambilJson(urlQueryJakartaSatu(0, ['outFields=*']))
      .then(function (d) {
        if (d && d.error) throw new Error(d.error.message || 'JakartaSatu error');
        return normalisasiHalteJakartaSatu(d);
      }).catch(function (e) {
        if (window.console) console.warn('[TransJakarta] sumber halte JakartaSatu gagal:', e);
        return [];
      });
    var pHalte = Promise.all([pHalteUtama, pHalteJakartaSatu]).then(function (hasil) {
      cacheHalte = { type: 'FeatureCollection', features: gabungDataHalte(hasil) };
      state.halte = cacheHalte.features.length;
    });

    return Promise.all([pJalur, pHalte])
      .then(function () {
        state.dimuat = true;
        siapkanFilterJenis();
        renderSheet();
      })
      .catch(function (e) {
        state.gagal = true;
        if (window.console) console.error('[TransJakarta] gagal memuat data:', e);
        renderSheet();
      });
  }

/* Gelapkan warna koridor untuk dasar header popup.
   *
   * Header popup di repo ini memakai pola yang sama seperti modul lain:
   * .agol-popup-header hanya mengatur color:#fff, dan LATARNYA datang
   * dari kelas tema seperti agol-geo-geologi. Tanpa kelas itu, header
   * menjadi putih di atas putih: teks putih di atas latar putih, dan
   * dari sisi pengguna itu sama dengan header kosong.
   *
   * Di sini latarnya diturunkan dari warna koridor, bukan dari kelas
   * tema yang tetap, supaya popup tetap milik koridor itu. Warnanya
   * digelapkan dulu: beberapa warna koridor terang seperti kuning dan
   * hijau muda membuat teks putih di atasnya nyaris tidak terbaca --
   * dan teks popup yang tak terbaca sama buruknya dengan header kosong.
   */
  function gelapkan(hex, f) {
    var h = String(hex || '').replace('#', '');
    if (h.length !== 6) return '#0f172a';
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    r = Math.max(0, Math.round(r * f));
    g = Math.max(0, Math.round(g * f));
    b = Math.max(0, Math.round(b * f));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

/* Header popup: satu tag utuh, isi sudah termasuk di dalamnya.
 *
 * INI PERBAIKAN BUG NYATA, bukan rapikan. Versi sebelumnya
 * mengembalikan fragmen ' class="..." style="..."' tanpa <div pembuka
 * maupun tanda > penutup. Akibatnya header tidak pernah menjadi
 * elemen: atributnya tercetak sebagai teks di dalam .agol-popup, dan
 * badge + judul langsung menempel ke container tanpa latar. Dari
 * sisi pengguna itu tampil sebagai kotak aneh dengan barisan
 * atribut HTML di dalamnya.
 *
 * Isi header sengaja hanya nama koridor. Badge "Jalur TransJakarta"
 * dan nama ruas sebagai subtitle_info yang sama sudah ada di
 * badan popup -- tiga kali pengulangan yang sama dalam satu kotak kecil
 * membuat orang tidak tahu harus lihat mana.
 */
function headerPopup(warna, isi) {
  return '<div class="agol-popup-header agol-modul"'
    + ' style="background:linear-gradient(135deg,'
    + gelapkan(warna, 0.42) + ',' + gelapkan(warna, 0.62) + ')">'
    + isi
    + '</div>';
}

function popupJalur(p) {
  if (p.__rangkumanRoute === false) return popupJalurJakartaSatu(p);
  var kode = kunciKoridor(p.KORIDOR);
  var info = infoKoridor(kode);
  var warna = warnaKoridor(kode);
  var km = (Number(p['SHAPE.LEN']) || 0) / 1000;
  var nama = info ? info.nama : 'Koridor ' + (kode || '-');
  var jenisLayanan = p.route_type_text || p.route_desc || 'TransJakarta';
  if (jenisLayanan === '-') jenisLayanan = 'TransJakarta';

  var html = '<div class="agol-popup" style="min-width:210px">';
  html += headerPopup(warna,
    '<div class="agol-popup-title">'
    + '<span class="agol-popup-badge-dot" style="background:' + warna + ';"></span>'
    + esc(nama) + '</div>');

  html += '<div class="agol-popup-body"><div class="agol-popup-fields">';
  html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Ruas</span><span class="agol-popup-field-value">' + esc(p.JURUSAN || '-') + '</span></div>';
  html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Jenis layanan</span><span class="agol-popup-field-value">' + esc(jenisLayanan) + '</span></div>';
  html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Panjang</span><span class="agol-popup-field-value">' + esc(km.toLocaleString('id-ID', { maximumFractionDigits: 1 })) + ' km</span></div>';
  html += '</div></div>';
  html += '<div class="agol-popup-footer"><span>Sumber: ' + (p.__rangkumanRoute === false ? 'JakartaSatu' : 'Data_Jaringan_TransJakarta (GTFS)') + '</span></div>';
  html += '</div>';
  return html;
}

function popupJalurJakartaSatu(p) {
  var kode = kunciKoridor(p.KORIDOR) || '-';
  var nama = p.JURUSAN || p.NAMOBJ || p.NAMRUTE || p.NAMA_RUTE || p.NAME || (infoKoridor(kode) || {}).nama || '-';
  var jenis = p.route_desc || p.ROUTE_DESC || p.routes_desc || p.JENIS_LAYANAN || p.JENIS || 'TransJakarta';
  if (jenis === '-') jenis = 'TransJakarta';
  var km = (Number(p['SHAPE.LEN']) || 0) / 1000;
  var warna = warnaKoridor(kode);
  var html = '<div class="agol-popup" style="min-width:210px">';
  html += headerPopup(warna,
    '<div class="agol-popup-title">'
    + '<span class="agol-popup-badge-dot" style="background:' + warna + ';"></span>'
    + esc(nama) + '</div>');
  html += '<div class="agol-popup-body"><div class="agol-popup-fields">';
  html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Kode koridor</span><span class="agol-popup-field-value">' + esc(kode) + '</span></div>';
  html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Jenis layanan</span><span class="agol-popup-field-value">' + esc(jenis) + '</span></div>';
  html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Rute</span><span class="agol-popup-field-value">' + esc(nama) + '</span></div>';
  if (km > 0) html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Panjang</span><span class="agol-popup-field-value">' + esc(km.toLocaleString('id-ID', { maximumFractionDigits: 1 })) + ' km</span></div>';
  html += '</div></div>';
  html += '<div class="agol-popup-footer"><span>Sumber: JakartaSatu · Jalur Transjakarta</span></div>';
  html += '</div>';
  return html;
}

function popupHalte(p) {
  var kode = kunciKoridor(p.KORIDOR);
  var warna = warnaKoridor(kode);
  var nama = p.NAMA || 'Halte';

  var html = '<div class="agol-popup" style="min-width:210px">';
  html += headerPopup(warna,
    '<div class="agol-popup-title">'
    + '<span class="agol-popup-badge-dot" style="background:' + warna + ';"></span>'
    + esc(nama) + '</div>');

  html += '<div class="agol-popup-body"><div class="agol-popup-fields">';
  if (kode) html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Rute yang dilayani</span><span class="agol-popup-field-value">' + esc(kode) + '</span></div>';
  if (p.JENIS) {
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Tipe halte</span><span class="agol-popup-field-value">' + esc(p.JENIS === 'BRT' ? 'Halte BRT' : 'Pemberhentian non-BRT') + '</span></div>';
  }
  if (p.KECAMATAN || p.KELURAHAN) {
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Wilayah</span><span class="agol-popup-field-value">'
      + esc([p.KELURAHAN, p.KECAMATAN].filter(Boolean).join(', ') || '-') + '</span></div>';
  }
  if (p.ALAMAT) {
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Alamat</span><span class="agol-popup-field-value">' + esc(p.ALAMAT) + '</span></div>';
  }
  html += '</div></div>';
  html += '<div class="agol-popup-footer"><span>Sumber: TransJakarta Network (GTFS)</span></div>';
  html += '</div>';
  return html;
}
/* ── pane ──
   Dua pane terpisah: jalur di 430, halte di 431. Angka 430 dipilih
   di atas batnasPane (100 = hillshade dan terrain) dan di bawah
   labelsPane (2000), supaya jalur tidak hilang di bawah relief tapi
   nama jalan tetap terbaca. */
var KELAS_ANTARMODA = {
  'STASIUN KA BANDARA': { nama: 'Kereta Bandara', warna: '#a855f7' },
  'STASIUN KRL': { nama: 'KRL Commuter Line', warna: '#ef4444' },
  'STASIUN LRT - FASE 1': { nama: 'LRT Jakarta', warna: '#0ea5e9' },
  'STASIUN LRT - JABODEBEK': { nama: 'LRT Jabodebek', warna: '#f59e0b' },
  'STASIUN MRT - FASE 1': { nama: 'MRT Jakarta', warna: '#14b8a6' },
  'STASIUN UTAMA': { nama: 'Stasiun utama', warna: '#6366f1' }
};

function popupAntarmoda(p) {
  var kelas = String(p.kelas || p.KELAS || '').toUpperCase();
  var info = KELAS_ANTARMODA[kelas] || { nama: 'Transportasi publik', warna: '#64748b' };
  var nama = p.nama || p.NAMA || p.alamat || p.ALAMAT || info.nama;
  var html = '<div class="agol-popup" style="min-width:210px">';
  html += headerPopup(info.warna, '<div class="agol-popup-title"><span class="agol-popup-badge-dot" style="background:' + info.warna + ';"></span>' + esc(nama) + '</div>');
  html += '<div class="agol-popup-body"><div class="agol-popup-fields">';
  html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Moda</span><span class="agol-popup-field-value">' + esc(info.nama) + '</span></div>';
  if (p.jenis || p.JENIS) html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Jenis</span><span class="agol-popup-field-value">' + esc(p.jenis || p.JENIS) + '</span></div>';
  if (p.koridor || p.KORIDOR) html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Koridor / jalur</span><span class="agol-popup-field-value">' + esc(p.koridor || p.KORIDOR) + '</span></div>';
  if (p.alamat || p.ALAMAT) html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Alamat</span><span class="agol-popup-field-value">' + esc(p.alamat || p.ALAMAT) + '</span></div>';
  html += '</div></div><div class="agol-popup-footer"><span>Sumber: DPMPTSP DKI Jakarta · Transportasi Umum Jakarta</span></div></div>';
  return html;
}

function muatDataAntarmoda() {
  if (cacheAntarmoda) return Promise.resolve(cacheAntarmoda);
  var fitur = [];
  function halaman(offset) {
    var q = 'where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&resultRecordCount=2000&resultOffset=' + offset + '&f=json';
    return ambilJson(DATA_TRANSPORTASI_JAKARTA + '?' + q).then(function (data) {
      if (data && data.error) throw new Error(data.error.message || 'Data simpul antarmoda gagal dimuat');
      var batch = data && data.features || [];
      fitur = fitur.concat(batch);
      if (data && data.exceededTransferLimit && batch.length) return halaman(offset + batch.length);
      var geojson = featuresKeGeoJson({ features: fitur });
      geojson.features = geojson.features.filter(function (f) {
        var kelas = String((f.properties || {}).kelas || '').toUpperCase();
        return !!KELAS_ANTARMODA[kelas];
      });
      cacheAntarmoda = geojson;
      state.antarmoda = geojson.features.length;
      state.antarmodaError = '';
      return geojson;
    });
  }
  return halaman(0);
}

function buatLayerAntarmoda() {
  if (!map.getPane('antarmodaPane')) map.createPane('antarmodaPane');
  map.getPane('antarmodaPane').style.zIndex = '432';
  return L.geoJSON(null, {
    pane: 'antarmodaPane',
    pointToLayer: function (f, latlng) {
      var p = f.properties || {};
      var info = KELAS_ANTARMODA[String(p.kelas || '').toUpperCase()] || {};
      return L.circleMarker(latlng, { pane: 'antarmodaPane', radius: 6, color: '#fff', weight: 1.5, fillColor: info.warna || '#64748b', fillOpacity: .95 });
    },
    onEachFeature: function (f, layer) {
      layer.bindPopup(popupAntarmoda(f.properties || {}), { maxWidth: 320, className: 'agol-leaflet-popup' });
    }
  });
}

function tampilkanAntarmoda(v) {
  visibleAntarmoda = !!v;
  if (!v) {
    if (layerAntarmoda && map.hasLayer(layerAntarmoda)) map.removeLayer(layerAntarmoda);
    renderSheet();
    return;
  }
  if (!layerAntarmoda) layerAntarmoda = buatLayerAntarmoda();
  renderSheet();
  muatDataAntarmoda().then(function (data) {
    if (!visibleAntarmoda) return;
    layerAntarmoda.clearLayers();
    layerAntarmoda.addData(data);
    if (!map.hasLayer(layerAntarmoda)) layerAntarmoda.addTo(map);
    renderSheet();
  }).catch(function (err) {
    state.antarmodaError = err && err.message ? err.message : 'Data simpul antarmoda tidak tersedia.';
    visibleAntarmoda = false;
    renderSheet();
  });
}

function siapkanPane() {
  if (!map.getPane('transjakartaPane')) map.createPane('transjakartaPane');
  var p = map.getPane('transjakartaPane');
  if (p) p.style.zIndex = String(Z_PANE);
  if (!map.getPane('transjakartaHaltePane')) map.createPane('transjakartaHaltePane');
  var ph = map.getPane('transjakartaHaltePane');
  if (ph) ph.style.zIndex = String(Z_PANE_HALTE);
}

/* ── layer jalur ──
   Dua geoJSON: halo dan garis utama. Keduanya di pane yang sama,
   dan halo ditambahkan lebih dulu supaya garis utama menimpanya.
   Leaflet tidak punya outline multi-garis untuk polyline, jadi ini
   cara paling murah mendapatkan garis luar yang tidak menutupi
   warna -- tanpa itu dua koridor yang bersilangan di pusat kota
   terlihat sebagai satu gumpalan di atas peta satelit. */
function buatLayerJalur() {
  siapkanPane();
  var utama = L.geoJSON(null, {
    pane: 'transjakartaPane',
    style: function (f) {
      return getStyleJalur(f);
    },
    onEachFeature: function (f, l) {
      l.bindPopup(popupJalur(f.properties || {}), { maxWidth: 320, className: 'agol-leaflet-popup' });
      l.on('click', function () {
        var kode = kunciKoridor((f.properties || {}).KORIDOR);
        if (kode) pilihKoridor(kode, { zoom: true });
      });
    }
  });

  var halo = L.geoJSON(null, {
    pane: 'transjakartaPane',
    interactive: false,
    style: function (f) {
      return getStyleHaloJalur(f);
    }
  });

  return { utama: utama, halo: halo };
}

function tampilkanJalur(v) {
  if (!v) {
    if (layerJalur) {
      if (map.hasLayer(layerJalur.halo)) map.removeLayer(layerJalur.halo);
      if (map.hasLayer(layerJalur.utama)) map.removeLayer(layerJalur.utama);
    }
    visibleJalur = false;
    return;
  }

  if (!layerJalur) layerJalur = buatLayerJalur();
  visibleJalur = true;

  /* Tampilkan panel segera agar pengguna mendapat umpan balik saat data
   * jaringan masih dimuat. */
  if (!userTutupSheet) bukaSheet();

  var perluTerbang = !sudahTerbang;
  sudahTerbang = true;
  muatData().then(function () {
    if (!visibleJalur || !cacheJalur) return;

    refreshLayerJalur();
    if (!map.hasLayer(layerJalur.halo)) layerJalur.halo.addTo(map);
    if (!map.hasLayer(layerJalur.utama)) layerJalur.utama.addTo(map);
    if (perluTerbang) terbangKeSeluruhJalur();
  });
}

function tampilkanJalurJakartaSatu(v) {
  if (!v) {
    if (layerJalurJakartaSatu) {
      if (map.hasLayer(layerJalurJakartaSatu.halo)) map.removeLayer(layerJalurJakartaSatu.halo);
      if (map.hasLayer(layerJalurJakartaSatu.utama)) map.removeLayer(layerJalurJakartaSatu.utama);
    }
    visibleJalurJakartaSatu = false;
    return;
  }

  if (!layerJalurJakartaSatu) layerJalurJakartaSatu = buatLayerJalur();
  visibleJalurJakartaSatu = true;
  if (!userTutupSheet) bukaSheet();

  var perluTerbang = !sudahTerbang;
  sudahTerbang = true;
  muatData().then(function () {
    if (!visibleJalurJakartaSatu || !cacheJalur) return;
    refreshLayerJalur();
    if (!map.hasLayer(layerJalurJakartaSatu.halo)) layerJalurJakartaSatu.halo.addTo(map);
    if (!map.hasLayer(layerJalurJakartaSatu.utama)) layerJalurJakartaSatu.utama.addTo(map);
    if (perluTerbang) terbangKeSeluruhJalur();
  });
}

function terbangKeSeluruhJalur() {
  if (!cacheJalur || !cacheJalur.features || !cacheJalur.features.length) return;
  try {
    var fc = { type: 'FeatureCollection', features: cacheJalur.features.filter(function (f) {
      return !!(f && f.geometry);
    }) };
    var group = L.geoJSON(fc);
    var bounds = group.getBounds();
    if (bounds && bounds.isValid && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13 });
    }
  } catch (e) {
    if (window.console && console.warn) console.warn('[TransJakarta] gagal menghitung batas jalur:', e);
  }
}

/* ── layer halte ── */
function buatLayerHalte() {
  return L.geoJSON(null, {
    pane: 'transjakartaHaltePane',
    pointToLayer: function (f, latlng) {
      var kode = kunciKoridor((f.properties || {}).KORIDOR);
      /* pane WAJIB diulang di sini. Leaflet mewariskan options dari
       * L.geoJSON ke layer yang dibuatnya sendiri, TETAPI tidak
       * mewariskannya ke object yang dikembalikan pointToLayer --
       * marker itu dibangun dari options baru di sini. Kalau pane
       * tidak disebut, tiap halte diam-diam jatuh ke overlayPane
       * dan tergambar di bawah garis koridor. */
      return L.circleMarker(latlng, {
        pane: 'transjakartaHaltePane',
        radius: 5,
        color: haloKoridor(kode),
        weight: 1.6,
        opacity: 1,
        fillColor: warnaKoridor(kode),
        fillOpacity: 1
      });
    },
    onEachFeature: function (f, l) {
      l.bindPopup(popupHalte(f.properties || {}), { maxWidth: 320, className: 'agol-leaflet-popup' });
    }
  });
}

function tampilkanHalte(v) {
  if (!v) {
    if (layerHalte && map.hasLayer(layerHalte)) map.removeLayer(layerHalte);
    visibleHalte = false;
    return;
  }
  if (!layerHalte) {
    siapkanPane();
    layerHalte = buatLayerHalte();
  }
  visibleHalte = true;
  if (!userTutupSheet) bukaSheet();
  muatData().then(function () {
    if (!visibleHalte || !cacheHalte) return;
    layerHalte.clearLayers();
    layerHalte.addData(cacheHalte);
    if (!map.hasLayer(layerHalte)) layerHalte.addTo(map);
  });
}
  /* ── legend ── */
  function buatLegend() {
    if (typeof addUnifiedLegend !== 'function' || typeof createLegendWithToggle !== 'function') return;
    var items = '';
    (state.ringkas.length ? state.ringkas : KODE_URUT.map(function (k) { return { kode: k, nama: KORIDOR[k].nama, warna: KORIDOR[k].line }; })).forEach(function (info) {
      items += '<div class="hotspot-legend-item">'
        + '<span class="hotspot-legend-dot" style="background:' + (info.warna || info.line) + ';"></span>'
        + '<span>' + esc(info.nama) + '</span>'
        + '</div>';
    });
    var div = L.DomUtil.create('div', 'hotspot-legend');
    L.DomEvent.disableClickPropagation(div);
    div.innerHTML = '<div class="hotspot-legend-title">Rute TransJakarta</div>'
      + '<div class="hotspot-legend-items">' + items + '</div>'
      + '<div class="hotspot-legend-source">BRT & bus non-BRT · Sumber: GTFS</div>';
    addUnifiedLegend('transjakarta', createLegendWithToggle(div));
  }

  function buangLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('transjakarta');
  }

  /* ── sheet ── */
  var SHEET_ID = 'transjakarta';
  var routingKoridor = null;
  var routingHalteAsal = '';
  var routingHalteTujuan = '';
  var layerRuteJalan = null;
  var cacheJalanRute = Object.create(null);

  function jarakKoordinat(a, b) {
    var rad = Math.PI / 180;
    var dLat = (b[1] - a[1]) * rad;
    var dLon = (b[0] - a[0]) * rad;
    var lat1 = a[1] * rad;
    var lat2 = b[1] * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function muatRuasJalan(awal, akhir) {
    var titikAwal = awal.map(function (v) { return Number(v).toFixed(5); }).join(',');
    var titikAkhir = akhir.map(function (v) { return Number(v).toFixed(5); }).join(',');
    var key = [titikAwal, titikAkhir].sort().join('|');
    if (cacheJalanRute[key]) return Promise.resolve(cacheJalanRute[key]);

    /* Query sepanjang koridor lurus, bukan satu envelope raksasa yang
     * ikut mengambil seluruh jaringan di antara dua titik berjauhan. */
    var jarakLurus = jarakKoordinat(awal, akhir);
    var jumlahTile = Math.max(1, Math.ceil(jarakLurus / 800));
    var tiles = [];
    for (var ti = 0; ti <= jumlahTile; ti++) {
      var t = ti / jumlahTile;
      var lon = awal[0] + (akhir[0] - awal[0]) * t;
      var lat = awal[1] + (akhir[1] - awal[1]) * t;
      tiles.push([lon - 0.0075, lat - 0.006, lon + 0.0075, lat + 0.006]);
    }
    var limit = 1000;
    var unik = Object.create(null);
    var jumlahUnik = 0;
    function identitas(f) {
      var a = f.attributes || {};
      var idKey = Object.keys(a).filter(function (k) { return /^(objectid|fid|id)$/i.test(k); })[0];
      if (idKey && a[idKey] != null) return 'id:' + a[idKey];
      var g = f.geometry || {};
      var paths = g.paths || [];
      var line = paths[0] || [];
      if (line.length) return 'geo:' + line.length + ':' + line[0].join(',') + ':' + line[line.length - 1].join(',');
      return 'raw:' + JSON.stringify(g);
    }
    function bacaTile(index) {
      if (index >= tiles.length || jumlahUnik >= 30000) return Promise.resolve();
      var box = tiles[index];
      function halaman(offset, jumlahTileFitur) {
      var q = [
        'where=1%3D1', 'returnGeometry=true', 'outFields=*', 'outSR=4326',
        'geometry=' + box.join('%2C'),
        'geometryType=esriGeometryEnvelope', 'inSR=4326',
        'spatialRel=esriSpatialRelIntersects', 'resultRecordCount=' + limit,
        'resultOffset=' + offset, 'f=json'
      ].join('&');
      return ambilJson(DASAR_JALAN_JAKARTASATU + '0/query?' + q).then(function (data) {
        if (data && data.error) throw new Error(data.error.message || 'Layanan Peta Jalan menolak permintaan');
        var batch = data && data.features || [];
        batch.forEach(function (f) {
          var id = identitas(f);
          if (unik[id]) return;
          unik[id] = f;
          jumlahUnik++;
        });
        jumlahTileFitur += batch.length;
        if (jumlahTileFitur >= 6000 && (data.exceededTransferLimit || batch.length === limit)) {
          throw new Error('Satu area jalan terlalu padat untuk diproses. Pilih halte di area yang lebih dekat.');
        }
        if (jumlahUnik < 30000 && ((data && data.exceededTransferLimit) || batch.length === limit) && batch.length) {
          return halaman(offset + batch.length, jumlahTileFitur);
        }
        return bacaTile(index + 1);
      });
      }
      return halaman(0, 0);
    }
    return bacaTile(0).then(function () {
      var features = Object.keys(unik).map(function (id) { return unik[id]; });
      var geojson = featuresKeGeoJson({ features: features });
      cacheJalanRute[key] = geojson.features;
      return geojson.features;
    });
  }

  function grafJalan(features) {
    var nodes = Object.create(null);
    function nodeUntuk(c) {
      var lon = Number(c[0]), lat = Number(c[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
      var k = lon.toFixed(5) + ':' + lat.toFixed(5);
      if (!nodes[k]) nodes[k] = { key: k, c: [lon, lat], edges: [] };
      return nodes[k];
    }
    function tambahGaris(coords) {
      for (var i = 1; i < coords.length; i++) {
        var a = nodeUntuk(coords[i - 1]), b = nodeUntuk(coords[i]);
        if (!a || !b || a.key === b.key) continue;
        var d = jarakKoordinat(a.c, b.c);
        if (!(d > 0) || d > 2000) continue;
        a.edges.push({ ke: b.key, jarak: d });
        b.edges.push({ ke: a.key, jarak: d });
      }
    }
    (features || []).forEach(function (f) {
      var g = f.geometry;
      if (!g) return;
      if (g.type === 'LineString') tambahGaris(g.coordinates || []);
      else if (g.type === 'MultiLineString') (g.coordinates || []).forEach(tambahGaris);
    });
    return nodes;
  }

  function nodeTerdekat(nodes, c) {
    var terdekat = null, dMin = Infinity;
    Object.keys(nodes).forEach(function (k) {
      var d = jarakKoordinat(nodes[k].c, c);
      if (d < dMin) { dMin = d; terdekat = nodes[k]; }
    });
    return terdekat && dMin <= 1200 ? terdekat : null;
  }

  function jalurTerpendek(nodes, sumber, tujuan) {
    if (!sumber || !tujuan) return null;
    var jarak = Object.create(null), sebelum = Object.create(null), selesai = Object.create(null);
    var antrean = [];
    function push(item) {
      var i = antrean.length;
      antrean.push(item);
      while (i > 0) {
        var parent = Math.floor((i - 1) / 2);
        if (antrean[parent].d <= item.d) break;
        antrean[i] = antrean[parent]; i = parent;
      }
      antrean[i] = item;
    }
    function pop() {
      var first = antrean[0], last = antrean.pop();
      if (antrean.length) {
        var i = 0;
        while (true) {
          var left = i * 2 + 1, right = left + 1;
          if (left >= antrean.length) break;
          var child = right < antrean.length && antrean[right].d < antrean[left].d ? right : left;
          if (antrean[child].d >= last.d) break;
          antrean[i] = antrean[child]; i = child;
        }
        antrean[i] = last;
      }
      return first;
    }
    jarak[sumber.key] = 0;
    push({ key: sumber.key, d: 0 });
    while (antrean.length) {
      var kini = pop();
      if (selesai[kini.key]) continue;
      if (kini.key === tujuan.key) break;
      selesai[kini.key] = true;
      nodes[kini.key].edges.forEach(function (e) {
        if (selesai[e.ke]) return;
        var baru = kini.d + e.jarak;
        if (jarak[e.ke] == null || baru < jarak[e.ke]) {
          jarak[e.ke] = baru;
          sebelum[e.ke] = kini.key;
          push({ key: e.ke, d: baru });
        }
      });
    }
    if (jarak[tujuan.key] == null) return null;
    var keys = [], k = tujuan.key;
    while (k) { keys.push(k); if (k === sumber.key) break; k = sebelum[k]; }
    if (keys[keys.length - 1] !== sumber.key) return null;
    keys.reverse();
    return { coordinates: keys.map(function (id) { return nodes[id].c; }), distanceM: jarak[tujuan.key] };
  }

  function halteDenganNama(nama) {
    var q = String(nama || '').trim().toLowerCase();
    return (cacheHalte && cacheHalte.features || []).filter(function (f) {
      var p = f.properties || {};
      return String(p.stop_name || p.NAMA || '').trim().toLowerCase() === q;
    })[0] || null;
  }

  function proyeksiKeRuas(titik, a, b) {
    var lat0 = titik[1] * Math.PI / 180;
    var skalaX = 111320 * Math.cos(lat0), skalaY = 110574;
    var bx = (b[0] - a[0]) * skalaX, by = (b[1] - a[1]) * skalaY;
    var px = (titik[0] - a[0]) * skalaX, py = (titik[1] - a[1]) * skalaY;
    var panjang2 = bx * bx + by * by;
    var t = panjang2 ? Math.max(0, Math.min(1, (px * bx + py * by) / panjang2)) : 0;
    var c = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    return { t: t, koordinat: c, jarak: jarakKoordinat(titik, c) };
  }

  function posisiTerdekatPadaGaris(garis, titik) {
    var kumulatif = 0, hasil = null;
    for (var i = 1; i < garis.length; i++) {
      var a = garis[i - 1], b = garis[i];
      var segmen = jarakKoordinat(a, b);
      var proyeksi = proyeksiKeRuas(titik, a, b);
      if (!hasil || proyeksi.jarak < hasil.jarak) {
        hasil = { jarak: proyeksi.jarak, posisi: kumulatif + segmen * proyeksi.t };
      }
      kumulatif += segmen;
    }
    return hasil;
  }

  function perbandinganKoridor(awal, akhir, kodeTerpilih, sumberTerpilih) {
    if (!cacheJalur || !cacheJalur.features) return [];
    var hasil = Object.create(null);
    cacheJalur.features.forEach(function (f) {
      var p = f.properties || {};
      var kode = kunciKoridor(p.KORIDOR || p.route_short_name || p.ROUTE_ID);
      if (!kode || !f.geometry) return;
      var paths = f.geometry.type === 'LineString' ? [f.geometry.coordinates]
        : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [];
      var terbaik = null;
      paths.forEach(function (line) {
        if (!line || line.length < 2) return;
        var a = posisiTerdekatPadaGaris(line, awal);
        var b = posisiTerdekatPadaGaris(line, akhir);
        if (!a || !b || a.jarak > 450 || b.jarak > 450) return;
        var jarak = a.jarak + Math.abs(a.posisi - b.posisi) + b.jarak;
        if (!terbaik || jarak < terbaik.jarakM) terbaik = { jarakM: jarak, celahAsalM: a.jarak, celahTujuanM: b.jarak };
      });
      if (!terbaik) return;
      var tipe = normalizeLayanan(p.route_type_text || p.route_desc || p.Type || 'Layanan umum');
      var sumber = p.__rangkumanRoute === false ? 'jakartasatu' : 'gtfs';
      var key = sumber + ':' + kode + ':' + tipe;
      if (!hasil[key] || terbaik.jarakM < hasil[key].jarakM) {
        hasil[key] = {
          kode: kode,
          nama: (infoKoridor(kode) || {}).nama || p.route_short_name || p.JURUSAN || ('Koridor ' + kode),
          tipe: tipe,
          sumber: sumber,
          jarakM: terbaik.jarakM,
          celahAsalM: terbaik.celahAsalM,
          celahTujuanM: terbaik.celahTujuanM,
          terpilih: kode === kunciKoridor(kodeTerpilih) && sumber === sumberTerpilih
        };
      }
    });
    return Object.keys(hasil).map(function (key) { return hasil[key]; }).sort(function (a, b) { return a.jarakM - b.jarakM; });
  }

  function htmlPerbandinganRute(awal, akhir) {
    var pilihan = perbandinganKoridor(awal, akhir, routingKoridor && routingKoridor.kode,
      routingKoridor && routingKoridor.sumber === 'jakartasatu' ? 'jakartasatu' : 'gtfs');
    if (!pilihan.length) {
      return '<div class="tj-route-compare"><b>Perbandingan layanan</b><p>Belum ada satu koridor langsung yang terdeteksi dekat dengan kedua halte. Pertimbangkan perpindahan koridor; urutan transfer belum dihitung.</p></div>';
    }
    var baris = pilihan.slice(0, 6).map(function (r) {
      return '<tr' + (r.terpilih ? ' class="is-selected"' : '') + '><td>' + esc(r.tipe) + '</td><td>'
        + esc(r.nama) + (r.terpilih ? ' <small>dipilih</small>' : '') + '</td><td>'
        + esc((r.jarakM / 1000).toLocaleString('id-ID', { maximumFractionDigits: 2 })) + ' km</td></tr>';
    }).join('');
    return '<div class="tj-route-compare"><b>Perbandingan koridor langsung</b>'
      + '<p>Jarak mengikuti geometri layanan dan mencakup akses lurus halte ke jalur. Urut dari jarak terpendek.</p>'
      + '<div class="tj-route-compare-table"><table><thead><tr><th>Jenis layanan</th><th>Koridor</th><th>Jarak</th></tr></thead><tbody>'
      + baris + '</tbody></table></div></div>';
  }

  function hitungRuteJalan(awal, akhir) {
    return muatRuasJalan(awal, akhir).then(function (features) {
      if (!features.length) throw new Error('Tidak ada ruas jalan JakartaSatu di sekitar kedua halte.');
      var nodes = grafJalan(features);
      var mulai = nodeTerdekat(nodes, awal), selesai = nodeTerdekat(nodes, akhir);
      if (!mulai || !selesai) throw new Error('Halte terlalu jauh dari jaringan jalan yang ditemukan.');
      var hasil = jalurTerpendek(nodes, mulai, selesai);
      if (!hasil) throw new Error('Rute jalan tidak tersambung di area ini.');
      hasil.coordinates.unshift(awal);
      hasil.coordinates.push(akhir);
      hasil.distanceM += jarakKoordinat(awal, mulai.c) + jarakKoordinat(akhir, selesai.c);
      hasil.jumlahRuas = features.length;
      return hasil;
    });
  }

  function routingEl() { return document.getElementById('transjakarta-routing'); }
  function panelHasilRouting() {
    var panel = routingEl();
    return panel && panel.querySelector('[data-tj-routing-result]');
  }

  function daftarPilihanHalte() {
    if (!cacheHalte || !cacheHalte.features) return '';
    var seen = Object.create(null);
    return cacheHalte.features.map(function (f) {
      var p = f.properties || {};
      var nama = String(p.stop_name || p.NAMA || '').trim();
      if (!nama || seen[nama.toLowerCase()]) return '';
      seen[nama.toLowerCase()] = true;
      return '<option value="' + esc(nama) + '"></option>';
    }).join('');
  }

  function renderRouting() {
    var panel = routingEl();
    if (!panel || !routingKoridor) return;
    var r = routingKoridor;
    var nama = r.nama || ('Koridor ' + r.kode);
    var ruas = (r.ruas || []).filter(Boolean).join(' · ') || 'Informasi arah belum tersedia';
    var idAsal = 'tj-routing-halte-asal';
    var idTujuan = 'tj-routing-halte-tujuan';
    panel.innerHTML = '<div class="tj-routing-head">'
      + '<div><span class="tj-routing-eyebrow">PERENCANA PERJALANAN</span><h3>Rute TransJakarta</h3></div>'
      + '<button type="button" class="tj-routing-minimize" data-tj-routing-minimize aria-label="Minimalkan panel routing" title="Minimalkan panel"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg></button>'
      + '<button type="button" class="tj-routing-close" data-tj-routing-close aria-label="Tutup perencana rute">&times;</button>'
      + '</div>'
      + '<div class="tj-routing-corridor"><span class="tj-routing-dot"></span><div><b>' + esc(nama) + '</b>'
      + '<small>' + esc(r.tipe || 'Layanan TransJakarta') + ' · ' + esc((Number(r.panjangM || 0) / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })) + ' km jalur</small></div></div>'
      + '<div class="tj-routing-fields">'
      + '<label for="' + idAsal + '"><span class="tj-routing-origin-dot"></span>'
      + '<input id="' + idAsal + '" aria-label="Halte asal" list="tj-routing-halte-list" value="' + esc(routingHalteAsal) + '" placeholder="Pilih halte keberangkatan" autocomplete="off"></label>'
      + '<div class="tj-routing-connector"></div>'
      + '<label for="' + idTujuan + '"><span class="tj-routing-dest-dot"></span>'
      + '<input id="' + idTujuan + '" aria-label="Halte tujuan" list="tj-routing-halte-list" value="' + esc(routingHalteTujuan) + '" placeholder="Pilih halte tujuan" autocomplete="off"></label>'
      + '<datalist id="tj-routing-halte-list">' + daftarPilihanHalte() + '</datalist>'
      + '</div>'
      + '<div class="tj-routing-note"><b>Arah layanan</b><span>' + esc(ruas) + '</span>'
      + '<small>Jalur jalan dihitung dari geometri Peta Jalan JakartaSatu. Data ini belum memuat jadwal bus, arah satu arah, penutupan jalan, atau lalu lintas langsung.</small></div>'
      + '<div class="tj-routing-result" data-tj-routing-result aria-live="polite">Pilih dua halte untuk menghitung jalur jalan pendukung.</div>'
      + '<div class="tj-routing-actions"><button type="button" data-tj-routing-swap aria-label="Tukar halte asal dan tujuan" title="Tukar halte">↕</button>'
      + '<button type="button" class="tj-routing-submit" data-tj-routing-submit>Hitung &amp; bandingkan</button></div>';
    panel.hidden = false;
  }

  function tutupRouting(pulihkanSheet) {
    routingKoridor = null;
    var panel = routingEl();
    if (panel) { panel.hidden = true; panel.classList.remove('is-minimized'); panel.innerHTML = ''; }
    var el = sheetEl();
    if (el) { el.classList.remove('tj-routing-mode'); el.style.removeProperty('--sheet-h'); }
    if (pulihkanSheet && el && el.classList.contains('sheet-open')) document.body.classList.add('transjakarta-sheet-open');
  }

  function sheetEl() {
    return document.getElementById('transjakarta-sheet');
  }

  function sheetBody() {
    return document.getElementById('transjakarta-sheet-content');
  }

  function bukaSheet() {
    renderSheet();
    if (window.SheetDrag) window.SheetDrag.buka(SHEET_ID);
  }

  function tutupSheet() {
    if (window.SheetDrag) window.SheetDrag.close(SHEET_ID);
    else resetTransjakartaSheet();
  }

  function resetTransjakartaSheet() {
    userTutupSheet = true;
    moduleActive = false;
    visibleJalur = false;
    visibleJalurJakartaSatu = false;
    visibleHalte = false;
    visibleAntarmoda = false;
    sementaraHalte = false;
    koridorTerpilih = null;
    koridorDisorot = null;
    jenisDisorot = null;
    sudahTerbang = false;
    state.filter.q = '';
    if (layerAntarmoda && map.hasLayer(layerAntarmoda)) map.removeLayer(layerAntarmoda);
    tutupRouting();
    routingHalteAsal = '';
    routingHalteTujuan = '';
    if (layerRuteJalan && map.hasLayer(layerRuteJalan)) map.removeLayer(layerRuteJalan);
    layerRuteJalan = null;
    var cb = document.getElementById('toggleTransjakarta');
    if (cb) cb.checked = false;
    if (layerJalur) {
      if (map.hasLayer(layerJalur.halo)) map.removeLayer(layerJalur.halo);
      if (map.hasLayer(layerJalur.utama)) map.removeLayer(layerJalur.utama);
      layerJalur.halo.clearLayers();
      layerJalur.utama.clearLayers();
    }
    if (layerJalurJakartaSatu) {
      if (map.hasLayer(layerJalurJakartaSatu.halo)) map.removeLayer(layerJalurJakartaSatu.halo);
      if (map.hasLayer(layerJalurJakartaSatu.utama)) map.removeLayer(layerJalurJakartaSatu.utama);
      layerJalurJakartaSatu.halo.clearLayers();
      layerJalurJakartaSatu.utama.clearLayers();
    }
    if (layerHalte) {
      if (map.hasLayer(layerHalte)) map.removeLayer(layerHalte);
      layerHalte.clearLayers();
    }
    buangLegend();
    renderSheet();
  }

  function barisKoridor(r, sumber) {
    var km = r.panjangM / 1000;
    /* Pemisah ruas memakai karakter "·" langsung, BUKAN entitas
     * &middot;. Baris ini dikunci dengan esc() di bawah, dan esc()
     * mengubah "&" jadi "&amp;" -- jadi &middot; akan tampil apa adanya
     * sebagai teks "&middot;" di layar. Karakter titik tengah itu
     * terpengaruh esc(). */
    var ruas = r.ruas.join(' · ');
    var tipe = r.tipe && r.tipe !== '-' ? r.tipe : 'TransJakarta';
    var kodeKoridor = r.kode && r.kode !== 'Rute' ? String(r.kode) : '-';
    var koridor = r.nama || ('Koridor ' + kodeKoridor);
    var dipilih = kunciKoridor(r.kode) === koridorTerpilih;
    return '<tr class="tj-row' + (dipilih ? ' is-selected' : '') + '" data-koridor="' + esc(r.kode) + '"'
      + (sumber ? ' data-tj-sumber="' + esc(sumber) + '"' : '') + ' tabindex="0">'
      + '<td class="tj-td-koridor"><span class="tj-koridor-toggle">'
      + '<span><b>' + esc(kodeKoridor) + '</b><small>' + esc(koridor) + '</small></span></span></td>'
      + '<td class="tj-td-nama"><b>' + esc(tipe) + '</b><small>' + esc(ruas || '-') + '</small></td>'
      + '<td class="tj-td-km">' + esc(km.toLocaleString('id-ID', { maximumFractionDigits: 1 })) + '</td>'
      + '</tr>';
  }

  function tombolLayer(key, nyala, jumlah, warna, label) {
    return '<button type="button" class="tj-switch' + (nyala ? ' is-on' : '') + '"'
      + ' data-tj-layer="' + key + '"'
      + ' aria-pressed="' + (nyala ? 'true' : 'false') + '">'
      + '<span class="tj-switch-dot"' + (warna ? ' style="background:' + warna + '"' : '') + '></span>'
      + '<span class="tj-switch-label">' + esc(label) + '</span>'
      + '<span class="tj-switch-count">' + esc(jumlah) + '</span>'
      + '</button>';
  }

  function renderSheet() {
    var body = sheetBody();
    if (!body) return;

    if (state.gagal) {
      body.innerHTML = '<div class="tj-kosong">'
        + '<b>Data TransJakarta belum bisa dimuat.</b>'
        + '<span>Layanan jaringan TransJakarta sedang tidak terjangkau. Coba beberapa saat lagi.</span>'
        + '</div>';
      return;
    }

    if (!state.dimuat) {
      body.innerHTML = '<div class="tj-kosong"><b>Memuat data koridor&hellip;</b></div>';
      return;
    }

    var filtered = state.ringkas.filter(cocokFilterKoridor).sort(function (a, b) {
      var urutJenis = String(a.tipe || '').localeCompare(String(b.tipe || ''), 'id', { sensitivity: 'base' });
      return urutJenis || String(a.nama || a.kode || '').localeCompare(String(b.nama || b.kode || ''), 'id', { sensitivity: 'base', numeric: true });
    });
    var filteredJakartaSatu = state.ringkasJakartaSatu.filter(cocokFilterKoridor).sort(function (a, b) {
      var urutJenis = String(a.tipe || '').localeCompare(String(b.tipe || ''), 'id', { sensitivity: 'base' });
      return urutJenis || String(a.nama || a.kode || '').localeCompare(String(b.nama || b.kode || ''), 'id', { sensitivity: 'base', numeric: true });
    });
    var baris = filtered.map(barisKoridor).join('');
    var barisJakartaSatu = filteredJakartaSatu.map(function (r) { return barisKoridor(r, 'jakartasatu'); }).join('');
    var ada = filtered.filter(function (r) { return r.panjangM > 0; }).length;
    var totalKm = filtered.reduce(function (sum, r) { return sum + r.panjangM; }, 0) / 1000;
    var km = esc(totalKm.toLocaleString('id-ID', { maximumFractionDigits: 0 }));

    body.innerHTML =
      '<div class="tj-stat">'
      + '<div class="tj-stat-item"><b>' + nomor(ada) + '</b><span>koridor</span></div>'
      + '<div class="tj-stat-item"><b>' + km + '</b><span>km total</span></div>'
      + '<button type="button" class="tj-stat-item tj-cardHalte' + (visibleHalte ? ' is-on' : '') + '"'
      + ' data-tj-layer="halte"'
      + ' aria-pressed="' + (visibleHalte ? 'true' : 'false') + '"'
      + ' aria-label="Tampilkan halte TransJakarta">'
      + '<b>' + nomor(state.halte) + '</b><span>halte</span></button>'
      + '</div>'
      + '<div class="tj-filter-box">'
      + '<div class="tj-filter-row">'
      + '<label class="tj-filter-label" for="tj-filter-search">Cari koridor</label>'
      + '<input id="tj-filter-search" class="tj-filter-search" type="search" value="' + esc(state.filter.q || '') + '" placeholder="Cari kode atau nama koridor" aria-label="Cari koridor TransJakarta">'
      + '</div>'
      + '</div>'
      + '<div class="tj-ctrl">'
      + tombolLayer('antarmoda', visibleAntarmoda, state.antarmodaError ? 'gagal' : (state.antarmoda ? nomor(state.antarmoda) + ' simpul' : 'lihat'), '', 'KRL · MRT · LRT · Kereta Bandara')
      + tombolLayer('jalur', visibleJalur, ada + ' koridor', '', 'TransJakarta · Jalur Koridor')
      + tombolLayer('jakartasatu-jalur', visibleJalurJakartaSatu, nomor(state.ringkasJakartaSatu.length) + ' koridor', '', 'TransJakarta · JakartaSatu')
      + '</div>'
      + '<div class="tj-table-wrap"><table class="tj-table">'
      + '<thead><tr><th class="tj-th-koridor">Koridor</th><th class="tj-th-nama">Jenis layanan</th><th class="tj-th-km">Panjang</th></tr></thead>'
      + '<tbody>' + (baris || '<tr><td colspan="3" class="tj-empty-row">Tidak ada koridor yang cocok dengan filter.</td></tr>') + '</tbody></table></div>'
      + '<h4 class="tj-table-title">Jalur Koridor JakartaSatu</h4>'
      + '<div class="tj-table-wrap"><table class="tj-table">'
      + '<thead><tr><th class="tj-th-koridor">Koridor</th><th class="tj-th-nama">Jenis layanan</th><th class="tj-th-km">Panjang</th></tr></thead>'
      + '<tbody>' + (barisJakartaSatu || '<tr><td colspan="3" class="tj-empty-row">Data koridor JakartaSatu tidak tersedia.</td></tr>') + '</tbody></table></div>'
      + '<div class="tj-sumber">Sumber jalur: Data_Jaringan_TransJakarta (GTFS) dan JakartaSatu. Data halte digabung dari TransJakarta Network dan JakartaSatu. Titik antarmoda: DPMPTSP DKI Jakarta.</div>';
  }

  /* Klik baris = zoom ke koridor itu. Dipakai bersama klik+tap karena
   * sheet ini dipakai di HP. */
  function pasangInteraksiSheet() {
    var body = sheetBody();
    if (!body || body.__tjPasang) return;
    body.__tjPasang = true;

    function keTombolLayer(e) {
      var btn = e.target.closest ? e.target.closest('[data-tj-layer]') : null;
      if (!btn || !body.contains(btn)) return false;
      var key = btn.dataset.tjLayer;
      if (key === 'jalur') setJalur(!visibleJalur);
      else if (key === 'jakartasatu-jalur') setJalurJakartaSatu(!visibleJalurJakartaSatu);
      else if (key === 'antarmoda') tampilkanAntarmoda(!visibleAntarmoda);
      else if (key === 'halte') setHalte(!visibleHalte);
      else return false;
      return true;
    }

    function keBaris(e) {
      var tr = e.target.closest ? e.target.closest('.tj-row') : null;
      if (!tr) return;
      var kode = tr.dataset.koridor;
      var sumberJakartaSatu = tr.dataset.tjSumber === 'jakartasatu';
      if (sumberJakartaSatu) {
        if (!visibleJalurJakartaSatu) setJalurJakartaSatu(true);
      } else if (!visibleJalur) {
        setJalur(true);
      }
      pilihKoridor(kode, { zoom: false });
      zoomKeKoridor(kode);
      if (layerRuteJalan && map.hasLayer(layerRuteJalan)) map.removeLayer(layerRuteJalan);
      layerRuteJalan = null;
      var daftarKoridor = sumberJakartaSatu ? state.ringkasJakartaSatu : state.ringkas;
      routingKoridor = daftarKoridor.filter(function (r) { return kunciKoridor(r.kode) === kunciKoridor(kode); })[0]
        || { kode: kode, nama: 'Koridor ' + kode, tipe: 'Layanan TransJakarta', panjangM: 0, ruas: [] };
      routingKoridor.sumber = sumberJakartaSatu ? 'jakartasatu' : 'gtfs';
      var el = sheetEl();
      if (el) {
        el.classList.add('tj-routing-mode');
      }
      var panelAktif = routingEl();
      if (panelAktif) panelAktif.classList.remove('is-minimized');
      document.body.classList.remove('transjakarta-sheet-open', 'transjakarta-sheet-minimized');
      renderRouting();
      renderSheet();
    }

    body.addEventListener('click', function (e) {
      if (keTombolLayer(e)) return;
      keBaris(e);
    });

    body.addEventListener('input', function (e) {
      var target = e.target;
      if (!target || !body.contains(target)) return;
      if (target.matches && target.matches('.tj-filter-search')) {
        state.filter.q = target.value;
        koridorDisorot = null;
        jenisDisorot = null;
        renderSheet();
        refreshLayerJalur();
        return;
      }
    });

    var panelRouting = routingEl();
    if (panelRouting) panelRouting.addEventListener('click', function (e) {
      var close = e.target.closest && e.target.closest('[data-tj-routing-close]');
      if (close) { tutupRouting(true); return; }
      var minimize = e.target.closest && e.target.closest('[data-tj-routing-minimize]');
      if (minimize) {
        var minimized = panelRouting.classList.toggle('is-minimized');
        minimize.setAttribute('aria-label', minimized ? 'Perluas panel routing' : 'Minimalkan panel routing');
        minimize.setAttribute('title', minimized ? 'Perluas panel' : 'Minimalkan panel');
        minimize.innerHTML = minimized
          ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg>'
          : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>';
        return;
      }
      var swap = e.target.closest && e.target.closest('[data-tj-routing-swap]');
      if (swap) {
        var asal = document.getElementById('tj-routing-halte-asal');
        var tujuan = document.getElementById('tj-routing-halte-tujuan');
        routingHalteAsal = tujuan ? tujuan.value : routingHalteTujuan;
        routingHalteTujuan = asal ? asal.value : routingHalteAsal;
        renderRouting();
        return;
      }
      var submit = e.target.closest && e.target.closest('[data-tj-routing-submit]');
      if (submit && routingKoridor) {
        var asalEl = document.getElementById('tj-routing-halte-asal');
        var tujuanEl = document.getElementById('tj-routing-halte-tujuan');
        routingHalteAsal = asalEl ? asalEl.value.trim() : '';
        routingHalteTujuan = tujuanEl ? tujuanEl.value.trim() : '';
        if (!routingHalteAsal || !routingHalteTujuan) {
          submit.textContent = 'Pilih halte asal dan tujuan';
          return;
        }
        if (routingHalteAsal.toLowerCase() === routingHalteTujuan.toLowerCase()) {
          submit.textContent = 'Pilih dua halte yang berbeda';
          return;
        }
        var asalFeature = halteDenganNama(routingHalteAsal);
        var tujuanFeature = halteDenganNama(routingHalteTujuan);
        if (!asalFeature || !tujuanFeature) {
          var hasilInvalid = panelHasilRouting();
          if (hasilInvalid) hasilInvalid.textContent = 'Pilih halte dari daftar saran agar nama dan lokasinya dikenali.';
          return;
        }
        var awal = asalFeature.geometry && asalFeature.geometry.coordinates;
        var akhir = tujuanFeature.geometry && tujuanFeature.geometry.coordinates;
        if (!awal || !akhir) return;
        submit.disabled = true;
        submit.textContent = 'Menghitung jalur jalan…';
        var hasilEl = panelHasilRouting();
        if (hasilEl) hasilEl.textContent = 'Memuat ruas jalan JakartaSatu di sekitar perjalanan…';
        hitungRuteJalan(awal, akhir).then(function (hasil) {
          if (layerRuteJalan && map.hasLayer(layerRuteJalan)) map.removeLayer(layerRuteJalan);
          if (!map.getPane('transjakartaRoutingPane')) map.createPane('transjakartaRoutingPane');
          map.getPane('transjakartaRoutingPane').style.zIndex = 460;
          layerRuteJalan = L.polyline(hasil.coordinates.map(function (c) { return [c[1], c[0]]; }), {
            pane: 'transjakartaRoutingPane', color: '#06b6d4', weight: 6, opacity: .95,
            lineCap: 'round', lineJoin: 'round'
          }).addTo(map);
          map.fitBounds(layerRuteJalan.getBounds(), { padding: [44, 44], maxZoom: 16 });
          var km = (hasil.distanceM / 1000).toLocaleString('id-ID', { maximumFractionDigits: 2 });
          if (hasilEl) hasilEl.innerHTML = '<div class="tj-route-road-summary"><b>Akses jalan pendukung: ' + esc(km) + ' km</b><span>Jaringan JakartaSatu · ' + esc(hasil.jumlahRuas) + ' fitur jalan di area rute</span></div>'
            + htmlPerbandinganRute(awal, akhir);
          submit.textContent = 'Hitung ulang jalur jalan';
        }).catch(function (err) {
          if (hasilEl) hasilEl.textContent = err && err.message ? err.message : 'Jaringan jalan gagal dimuat. Periksa koneksi lalu coba lagi.';
          submit.textContent = 'Coba hitung lagi';
        }).then(function () { submit.disabled = false; });
        return;
      }
    });

    if (panelRouting) panelRouting.addEventListener('input', function (e) {
      if (e.target.id === 'tj-routing-halte-asal') routingHalteAsal = e.target.value;
      if (e.target.id === 'tj-routing-halte-tujuan') routingHalteTujuan = e.target.value;
    });

    body.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.target.closest && e.target.closest('[data-tj-layer]')) return;
      if (!e.target.closest || !e.target.closest('.tj-row')) return;
      e.preventDefault();
      keBaris(e);
    });
  }

  /* Baris sheet dipakai untuk menelusuri koridor, jadi harus punya
   * akibat yang nyata: kalau tidak ada layer di layar, zoomToBounds
   * tidak terlihat efeknya dan klik baris terasa mati. Karena itu
   * halte ikut dinyalakan sementara supaya titik-titiknya terlihat,
   * lalu dikembalikan ke kondisi semula -- bukan dipaksa nyala. */
  var sementaraHalte = false;
  function zoomKeKoridor(kode) {
    if (!cacheJalur) return;
    var feats = cacheJalur.features.filter(function (f) {
      return kunciKoridor((f.properties || {}).KORIDOR) === kode;
    });
    if (!feats.length) return;

    var group = L.geoJSON({ type: 'FeatureCollection', features: feats });
    try { map.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 15 }); } catch (e) { /* geometri rusak */ }

    if (!layerHalte) return;
    if (!visibleHalte) {
      sementaraHalte = true;
      tampilkanHalte(true);
    }
  }

  /* Sakelar dalam sheet hanya mengatur visibilitas sublayer. Layer utama
   * dan sheet tetap hidup sampai sakelar utama Transjakarta dimatikan. */
  function setJalur(v) {
    if (v) { tampilkanJalur(true); buatLegend(); }
    else {
      koridorDisorot = null;
      jenisDisorot = null;
      tampilkanJalur(false);
      if (!visibleJalurJakartaSatu) buangLegend();
    }
    renderSheet();
  }

  function setJalurJakartaSatu(v) {
    if (v) { tampilkanJalurJakartaSatu(true); buatLegend(); }
    else {
      koridorDisorot = null;
      jenisDisorot = null;
      tampilkanJalurJakartaSatu(false);
      if (!visibleJalur) buangLegend();
    }
    renderSheet();
  }

  function setHalte(v) {
    if (v) { tampilkanHalte(true); }
    else {
      tampilkanHalte(false);
      /* Kalau halte hanya dinyalakan sementara untuk zoom koridor,
       * matikan lagi supaya tidak menggantung tanpa disengaja. */
      if (sementaraHalte) sementaraHalte = false;
    }
    renderSheet();
  }

  /* ── init ── */
  document.addEventListener('DOMContentLoaded', function () {
    pasangInteraksiSheet();

    /* Checkbox individual tidak lagi dipakai. Kontrol Jalur dan Halte
     * pindah ke dalam sheet; Layer Catalog menyimpan satu sakelar
     * utama (toggleTransjakarta). Listener di bawah hanya untuk itu,
     * supaya mengaktifkan dari mana pun melewati setter yang sama. */
    var cbUtama = document.getElementById('toggleTransjakarta');
    if (cbUtama) {
      cbUtama.addEventListener('change', function () {
        userTutupSheet = false;
        window.toggleTransjakarta(this.checked);
      });
    }

    if (window.SheetDrag) {
      window.SheetDrag.register(SHEET_ID, {
        el: 'transjakarta-sheet',
        openClass: 'sheet-open',
        minClass: 'sheet-minimized',
        bodyOpen: 'transjakarta-sheet-open',
        bodyMin: 'transjakarta-sheet-minimized',
        handle: '.tj-sheet-handle',
        header: '.tj-sheet-head',
        minButton: '.tj-sheet-minimize',
        labelMin: 'Minimalkan panel Jalur TransJakarta',
        labelOpen: 'Perluas panel Jalur TransJakarta',
        onClose: resetTransjakartaSheet
      });
    }

    var btnTutup = document.getElementById('transjakarta-sheet-close');
    if (btnTutup) btnTutup.addEventListener('click', function () { tutupSheet(); });
    var btnMin = document.getElementById('transjakarta-sheet-minimize');
    if (btnMin) btnMin.addEventListener('click', function () {
      if (window.SheetDrag) window.SheetDrag.toggleMinimize(SHEET_ID);
    });
  });

  /* Sakelar utama Layer Catalog. Menyala = buka sheet dan nyalakan
   * jaringan koridor. Mati = matikan semuanya.
   *
   * Toggle Jalur dan Toggle Halte tidak lagi punya checkbox sendiri di
   * Layer Catalog; keduanya hidup di dalam sheet. Fungsi lama
   * toggleTransjakartaJalur / toggleTransjakartaHalte tetap
   * dipertahankan karena resetAllLayers dan harness memakainya. */
  window.toggleTransjakarta = function (v) {
    var cb = document.getElementById('toggleTransjakarta');
    if (cb && cb.checked !== v) cb.checked = v;
    if (v) {
      moduleActive = true;
      userTutupSheet = false;
      setJalur(false);
      setJalurJakartaSatu(true);
      setHalte(false);
    } else {
      moduleActive = false;
      setJalur(false);
      setJalurJakartaSatu(false);
      tampilkanAntarmoda(false);
      setHalte(false);
      buangLegend();
      tutupSheet();
    }
  };

  window.toggleTransjakartaJalur = function (v) { setJalur(v); };
  window.toggleTransjakartaJakartaSatuJalur = function (v) { setJalurJakartaSatu(v); };
  window.toggleTransjakartaHalte = function (v) { setHalte(v); };

  window.isTransjakartaJalurActive = function () { return visibleJalur; };
  window.isTransjakartaJakartaSatuJalurActive = function () { return visibleJalurJakartaSatu; };
  window.isTransjakartaHalteActive = function () { return visibleHalte; };
  window.isTransjakartaActive = function () { return moduleActive || visibleJalur || visibleJalurJakartaSatu || visibleHalte || visibleAntarmoda; };
  window.transjakartaCleanup = function () {
    window.toggleTransjakarta(false);
  };
  Object.defineProperty(window, 'transjakartaLayerObj', { get: function () { return layerJalur ? layerJalur.utama : null; } });
  Object.defineProperty(window, 'transjakartaHalteLayerObj', { get: function () { return layerHalte; } });

  /* Diekspor untuk harness: koridor apa yang dikenali, warna apa yang
   * dipakai, dan data mentahnya. */
  window.__transjakarta = {
    KORIDOR: KORIDOR,
    KODE_URUT: KODE_URUT,
    warnaKoridor: warnaKoridor,
    infoKoridor: infoKoridor,
    kunciKoridor: kunciKoridor,
    rekapKoridor: rekapKoridor,
    featuresKeGeoJson: featuresKeGeoJson,
    esriGeometryKeGeoJson: esriGeometryKeGeoJson,
    Z_PANE: Z_PANE,
    DASAR: DASAR,
    ID_JALUR: ID_JALUR,
    ID_HALTE: ID_HALTE,
    urlQuery: urlQuery,
    state: state,
    muatData: muatData,
    bukaSheet: bukaSheet,
    terbangKeSeluruhJalur: terbangKeSeluruhJalur,
    sudahTerbang: function () { return sudahTerbang; },
    tampilkanJalur: tampilkanJalur,
    tampilkanHalte: tampilkanHalte,
    setJalur: setJalur,
    setHalte: setHalte,
    Z_PANE_HALTE: Z_PANE_HALTE,
    siapkanPane: siapkanPane,
    renderSheet: renderSheet,
    gelapkan: gelapkan,
    headerPopup: headerPopup,
    popupJalur: popupJalur,
    popupHalte: popupHalte
  };
})();
