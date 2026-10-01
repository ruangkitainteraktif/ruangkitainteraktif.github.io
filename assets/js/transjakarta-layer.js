/* ── TransJakarta — Jalur & Halte (JakartaSatu) ──
 *
 * Dua layer dari satu MapServer:
 *   /0  Halte Transjakarta   point, 231 fitur
 *   /1  Jalur Transjakarta   polyline, 24 fitur = 12 koridor x 2 arah
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

  var DASAR = 'https://jakartasatu.jakarta.go.id/server/rest/services/JakartaSatu/Transjakarta/MapServer/';
  var ID_HALTE = 0;
  var ID_JALUR = 1;

  var PROXY = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';

  var FIELD_JALUR = ['KORIDOR', 'JURUSAN', 'SHAPE.LEN'];
  var FIELD_HALTE = ['NAMA', 'JENIS', 'KORIDOR', 'KELURAHAN', 'KECAMATAN', 'KOTA_ADMIN', 'ALAMAT'];

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
  var layerHalte = null;
  var cacheJalur = null;
  var cacheHalte = null;
  var visibleJalur = false;
  var visibleHalte = false;

  /* Sheet harus terbuka saat layer dinyalakan, tapi TIDAK boleh memaksa
   * buka ulang setelah user menutup manual. Tanpa flag ini, toggle
   * on-off-on akan selalu membHoyat sheet ke layar even kalau user
   * sengaja menutupnya. */
  var userTutupSheet = false;

  /* Peta sudah pernah terbang ke jaringan jalur. Mencegah pola
   * toggle on-off-on Terbang berulang kali dan mengubah posisi kerja
   * pengguna di peta tanpa diminta. */
  var sudahTerbang = false;

  var state = { dimuat: false, gagal: false, ringkas: [], totalKm: 0, halte: 0 };

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
    var info = infoKoridor(v);
    return info ? info.line : WARNA_DEFAULT;
  }

  function haloKoridor(v) {
    var info = infoKoridor(v);
    return info ? info.halo : 'rgba(255,255,255,.8)';
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
    KODE_URUT.forEach(function (k) {
      peta[k] = { kode: k, nama: KORIDOR[k].nama, warna: KORIDOR[k].line, panjangM: 0, ruas: [], fitur: [] };
    });

    geojson.features.forEach(function (f) {
      var p = f.properties || {};
      var k = kunciKoridor(p.KORIDOR);
      if (!peta[k]) {
        /* Koridor di luar 1-12. Tidak diabaikan diam-diam: dicatat
         * supaya kalau nanti Jakarta menambah koridor, kelewatannya
         * terlihat di konsol, bukan hilang diam-diam dari tabel. */
        if (window.console && console.warn) {
          console.warn('[TransJakarta] koridor di luar 1-12:', k);
        }
        return;
      }
      var len = Number(p['SHAPE.LEN']) || 0;
      peta[k].panjangM += len;
      if (p.JURUSAN) peta[k].ruas.push(String(p.JURUSAN));
      peta[k].fitur.push(f);
    });

    return KODE_URUT.map(function (k) { return peta[k]; });
  }

  function muatData() {
    if (state.dimuat || state.gagal) return Promise.resolve();
    var pJalur = ambilJson(urlQuery(ID_JALUR, ['outFields=' + encodeURIComponent(FIELD_JALUR.join(','))]))
      .then(function (d) {
        if (d && d.error) throw new Error(d.error.message || 'ArcGIS error');
        cacheJalur = featuresKeGeoJson(d);
        state.ringkas = rekapKoridor(cacheJalur);
        state.totalKm = state.ringkas.reduce(function (a, b) { return a + b.panjangM; }, 0) / 1000;
      });

    var pHalte = ambilJson(urlQuery(ID_HALTE, ['outFields=' + encodeURIComponent(FIELD_HALTE.join(','))]))
      .then(function (d) {
        if (d && d.error) throw new Error(d.error.message || 'ArcGIS error');
        cacheHalte = featuresKeGeoJson(d);
        state.halte = cacheHalte.features.length;
      });

    return Promise.all([pJalur, pHalte])
      .then(function () { state.dimuat = true; renderSheet(); })
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
  var kode = kunciKoridor(p.KORIDOR);
  var info = infoKoridor(kode);
  var warna = warnaKoridor(kode);
  var km = (Number(p['SHAPE.LEN']) || 0) / 1000;
  var nama = info ? info.nama : 'Koridor ' + (kode || '-');

  var html = '<div class="agol-popup" style="min-width:210px">';
  html += headerPopup(warna,
    '<div class="agol-popup-title">'
    + '<span class="agol-popup-badge-dot" style="background:' + warna + ';"></span>'
    + esc(nama) + '</div>');

  html += '<div class="agol-popup-body"><div class="agol-popup-fields">';
  html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Ruas</span><span class="agol-popup-field-value">' + esc(p.JURUSAN || '-') + '</span></div>';
  html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Panjang</span><span class="agol-popup-field-value">' + esc(km.toLocaleString('id-ID', { maximumFractionDigits: 1 })) + ' km</span></div>';
  html += '</div></div>';
  html += '<div class="agol-popup-footer"><span>Sumber: JakartaSatu (Pemprov DKI Jakarta)</span></div>';
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
  html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Koridor</span><span class="agol-popup-field-value">' + esc(infoKoridor(kode) ? infoKoridor(kode).nama : (kode || '-')) + '</span></div>';
  if (p.JENIS) {
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Jenis</span><span class="agol-popup-field-value">' + esc(p.JENIS) + '</span></div>';
  }
  if (p.KECAMATAN || p.KELURAHAN) {
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Wilayah</span><span class="agol-popup-field-value">'
      + esc([p.KELURAHAN, p.KECAMATAN].filter(Boolean).join(', ') || '-') + '</span></div>';
  }
  if (p.ALAMAT) {
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Alamat</span><span class="agol-popup-field-value">' + esc(p.ALAMAT) + '</span></div>';
  }
  html += '</div></div>';
  html += '<div class="agol-popup-footer"><span>Sumber: JakartaSatu (Pemprov DKI Jakarta)</span></div>';
  html += '</div>';
  return html;
}
/* ── pane ──
   Dua pane terpisah: jalur di 430, halte di 431. Angka 430 dipilih
   di atas batnasPane (100 = hillshade dan terrain) dan di bawah
   labelsPane (2000), supaya jalur tidak hilang di bawah relief tapi
   nama jalan tetap terbaca. */
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
      var kode = kunciKoridor((f.properties || {}).KORIDOR);
      return {
        color: warnaKoridor(kode),
        weight: 3.5,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round'
      };
    },
    onEachFeature: function (f, l) {
      l.bindPopup(popupJalur(f.properties || {}), { maxWidth: 320, className: 'agol-leaflet-popup' });
    }
  });

  var halo = L.geoJSON(null, {
    pane: 'transjakartaPane',
    interactive: false,
    style: function (f) {
      var kode = kunciKoridor((f.properties || {}).KORIDOR);
      return {
        color: haloKoridor(kode),
        weight: 7,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      };
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
    if (!visibleHalte) tutupSheet();
    return;
  }

  if (!layerJalur) layerJalur = buatLayerJalur();
  visibleJalur = true;

  /* Sheet dibuka SEBELUM data masuk, bukan sesudahnya. SheetDrag.buka()
   * bisa detach, bisa gagal. Kalau sheet menunggu, layer menyala tapi
   * tidak ada apa-apa yang terjadi, dan itu terbaca sebagai tidak
   * berfungsi. Sheet yang terbuka dengan tulisan "Memuat data" jauh
   * lebih jujur. */
  if (!userTutupSheet) bukaSheet();

  /* Baru menyala pertama kali? Terbang ke jalurnya.
   *
   * Tanpa ini layer menyala di Jakarta tapi peta masih di tempat yang
   * sama, dan tidak ada yang terlihat terjadi -- padahal tidak ada
   * yang salah. Ini yang paling sering dikeluhkan orang: layer
   * "tidak muncul" padahal isinya ada, cuma di luar viewport.
   *
   * Dijalankan hanya sekali per sesi. Kalau setiap nyalakan terbang
   * lagi, orang yang sedang menata peta kehilangan posisi kerjanya
   * setiap kali layer dimatikan sebentar.
   *
   * Ditunda sampai data masuk karena batas wilayah baru diketahui
   * setelah query selesai. */
  var perluTerbang = !sudahTerbang;
  sudahTerbang = true;

  muatData().then(function () {
    if (!cacheJalur) return;
    layerJalur.halo.clearLayers();
    layerJalur.utama.clearLayers();
    layerJalur.halo.addData(cacheJalur);
    layerJalur.utama.addData(cacheJalur);
    if (!map.hasLayer(layerJalur.halo)) layerJalur.halo.addTo(map);
    if (!map.hasLayer(layerJalur.utama)) layerJalur.utama.addTo(map);

    if (perluTerbang) terbangKeSeluruhJalur();
  });
}

/* Terbang ke seluruh jaringan koridor. Dipakai saat layer pertama kali
 * dinyalakan, karena bounds-nya hanya diketahui setelah data masuk. */
function terbangKeSeluruhJalur() {
  if (!cacheJalur || !cacheJalur.features.length) return;
  try {
    var b = L.geoJSON(cacheJalur).getBounds();
    if (!b.isValid()) return;
    map.fitBounds(b, { padding: [48, 48], maxZoom: 13 });
  } catch (e) {
    /* Batas tidak valid bukan alasan menggagalkan seluruh nyalanya
     * layer -- gejalanya hanya peta tidak bergerak, dan itu jauh
     * lebih mild daripada checkbox mati sendiri. */
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
    if (!visibleJalur) tutupSheet();
    return;
  }
  if (!layerHalte) {
    siapkanPane();
    layerHalte = buatLayerHalte();
  }
  visibleHalte = true;
  if (!userTutupSheet) bukaSheet();
  muatData().then(function () {
    if (!cacheHalte) return;
    layerHalte.clearLayers();
    layerHalte.addData(cacheHalte);
    if (!map.hasLayer(layerHalte)) layerHalte.addTo(map);
  });
}
  /* ── legend ── */
  function buatLegend() {
    if (typeof addUnifiedLegend !== 'function' || typeof createLegendWithToggle !== 'function') return;
    var items = '';
    KODE_URUT.forEach(function (k) {
      var info = KORIDOR[k];
      items += '<div class="hotspot-legend-item">'
        + '<span class="hotspot-legend-dot" style="background:' + info.line + ';"></span>'
        + '<span>' + esc(info.nama) + '</span>'
        + '</div>';
    });
    var div = L.DomUtil.create('div', 'hotspot-legend');
    L.DomEvent.disableClickPropagation(div);
    div.innerHTML = '<div class="hotspot-legend-title">Koridor TransJakarta</div>'
      + '<div class="hotspot-legend-items">' + items + '</div>'
      + '<div class="hotspot-legend-source">Sumber: JakartaSatu,Provinsi DKI Jakarta</div>';
    addUnifiedLegend('transjakarta', createLegendWithToggle(div));
  }

  function buangLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('transjakarta');
  }

  /* ── sheet ── */
  var SHEET_ID = 'transjakarta';

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
  }

  function barisKoridor(r) {
    var km = r.panjangM / 1000;
    /* Pemisah ruas memakai karakter "·" langsung, BUKAN entitas
     * &middot;. Baris ini dikunci dengan esc() di bawah, dan esc()
     * mengubah "&" jadi "&amp;" -- jadi &middot; akan tampil apa adanya
     * sebagai teks "&middot;" di layar. Karakter titik tengah itu
     * terpengaruh esc(). */
    var ruas = r.ruas.join(' · ');
    return '<tr class="tj-row" data-koridor="' + esc(r.kode) + '" tabindex="0">'
      + '<td class="tj-td-chip"><span class="tj-chip" style="background:' + r.warna + ';"></span></td>'
      + '<td class="tj-td-nama"><b>' + esc(r.nama) + '</b><small>' + esc(ruas || '-') + '</small></td>'
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
        + '<span>Layanan JakartaSatu sedang tidak terjangkau. Coba beberapa saat lagi.</span>'
        + '</div>';
      return;
    }

    if (!state.dimuat) {
      body.innerHTML = '<div class="tj-kosong"><b>Memuat data koridor&hellip;</b></div>';
      return;
    }

    var baris = state.ringkas.map(barisKoridor).join('');
    var ada = state.ringkas.filter(function (r) { return r.panjangM > 0; }).length;

    var km = esc(state.totalKm.toLocaleString('id-ID', { maximumFractionDigits: 0 }));

    body.innerHTML =
      '<div class="tj-ctrl">'
      + tombolLayer('jalur', visibleJalur, ada + ' koridor', '', 'Jalur Koridor')
      + '</div>'
      + '<div class="tj-stat">'
      + '<div class="tj-stat-item"><b>' + nomor(ada) + '</b><span>koridor</span></div>'
      + '<div class="tj-stat-item"><b>' + km + '</b><span>km total</span></div>'
      /* Kartu halte adalah tombol layer, bukan sekadar angka. Dipakai
         element button supaya bisa difokus dan punya peran untuk
         pembaca layar. Kelas tj-stat-item dipakai bersama supaya
         gaya kotak statistiknya tidak ditulis ulang. */
      + '<button type="button" class="tj-stat-item tj-cardHalte' + (visibleHalte ? ' is-on' : '') + '"'
      + ' data-tj-layer="halte"'
      + ' aria-pressed="' + (visibleHalte ? 'true' : 'false') + '"'
      + ' aria-label="Tampilkan halte TransJakarta">'
      + '<b>' + nomor(state.halte) + '</b><span>halte</span></button>'
      + '</div>'
      + '<div class="tj-table-wrap"><table class="tj-table">'
      + '<thead><tr><th class="tj-th-chip"></th><th class="tj-th-nama">Koridor</th><th class="tj-th-km">Panjang</th></tr></thead>'
      + '<tbody>' + baris + '</tbody></table></div>'
      + '<div class="tj-sumber">Sumber data: JakartaSatu, Provinsi DKI Jakarta. '
      + 'Panjang dihitung dari geometri jalur, bukan dari panjang jalan raya.</div>';
  }

  /* Klik baris = zoom ke koridor itu. Dipakai bersama klik+tap karena
   * sheet ini dipakai di HP. */
  function pasangInteraksiSheet() {
    var body = sheetBody();
    if (!body || body.__tjPasang) return;
    body.__tjPasang = true;

    /* Tombol layer dicek LEBIH DAHULU. Urutan ini penting: kartu halte
     * dan tombol jalur ada di dalam sheet yang sama dengan tabel, dan
     * tanpa pengecekan lebih dulu, klik tombol ikut memicu zoom ke
     * koridor -- yang sama sekali bukan yang dimaksud pengguna. */
    function keTombolLayer(e) {
      var btn = e.target.closest ? e.target.closest('[data-tj-layer]') : null;
      if (!btn || !body.contains(btn)) return false;
      var key = btn.dataset.tjLayer;
      if (key === 'jalur') setJalur(!visibleJalur);
      else if (key === 'halte') setHalte(!visibleHalte);
      else return false;
      return true;
    }

    function keBaris(e) {
      var tr = e.target.closest ? e.target.closest('.tj-row') : null;
      if (!tr) return;
      zoomKeKoridor(tr.dataset.koridor);
    }

    body.addEventListener('click', function (e) {
      if (keTombolLayer(e)) return;
      keBaris(e);
    });
    body.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      /* Element button sudah menangani Enter dan Space sendiri lewat
       * perilaku bawaan, jadi di sini cukup biarkan. Menangkapnya
       * akan membuat tombol terpicu dua kali. */
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

  /* Dua setter ini adalah satu-satunya jalan untuk menyalakan dan
   * mematikan layer. Tombol di sheet dan sakelar utama di Layer Catalog
   * sama-sama memanggilnya, jadi tidak mungkin salah satu menyalakan
   * layer tapi dianggap masih mati oleh yang lain. Keduanya selalu
   * menutup sheet kalau tidak ada layer yang tersisa -- sheet tanpa
   * isi di layar adalah panel yang tidak menjelaskan apa pun. */
  function setJalur(v) {
    if (v) { tampilkanJalur(true); buatLegend(); }
    else {
      tampilkanJalur(false);
      buangLegend();
      if (!visibleHalte) tutupSheet();
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
      if (!visibleJalur) tutupSheet();
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
        onClose: function () { userTutupSheet = true; }
      });
    }

    var btnTutup = document.getElementById('transjakarta-sheet-close');
    if (btnTutup) btnTutup.addEventListener('click', function () { tutupSheet(); });
    var btnMin = document.getElementById('transjakarta-sheet-minimize');
    if (btnMin) btnMin.addEventListener('click', function () {
      if (window.SheetDrag) window.SheetDrag.minimize(SHEET_ID);
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
      setJalur(true);
      if (!userTutupSheet) bukaSheet();
    } else {
      setJalur(false);
      setHalte(false);
      tutupSheet();
    }
  };

  window.toggleTransjakartaJalur = function (v) { setJalur(v); };
  window.toggleTransjakartaHalte = function (v) { setHalte(v); };

  window.isTransjakartaJalurActive = function () { return visibleJalur; };
  window.isTransjakartaHalteActive = function () { return visibleHalte; };
  window.transjakartaCleanup = function () {
    window.toggleTransjakartaJalur(false);
    window.toggleTransjakartaHalte(false);
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
