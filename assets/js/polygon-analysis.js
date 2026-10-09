/* Analyses polygon yang digambar pengguna: NDVI (GeoTIFF) + topografi. */
(function () {
  'use strict';

  const EXPORT_IMAGE_URL = 'https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer/exportImage';
  const LANDSAT_IMAGE_URL = 'https://landsat2.arcgis.com/arcgis/rest/services/Landsat/MS/ImageServer/exportImage';
  const NDVI_RULE = { rasterFunction: 'NDVI Raw' };
  const M_PER_DEG = 111320;
  const TARGET_RES_M = 10;
  const MAX_PX = 640;
  const MIN_PX = 24;
  const FETCH_TIMEOUT = 60000;

  /* Samakan dengan band di buildNdviDetails() supaya legenda sidebar konsisten. */
  const NDVI_BANDS = [
    { label: 'Sangat rendah', min: -Infinity, max: 0, rgb: [57, 124, 168] },
    { label: 'Rendah', min: 0, max: 0.2, rgb: [198, 135, 42] },
    { label: 'Sedang', min: 0.2, max: 0.4, rgb: [215, 190, 55] },
    { label: 'Tinggi', min: 0.4, max: 0.6, rgb: [101, 169, 66] },
    { label: 'Sangat tinggi', min: 0.6, max: Infinity, rgb: [23, 107, 52] }
  ];

  /* Indeks spektral tambahan per polygon.
     PENTING soal nomor band: service Sentinel2 Esri tidak berurutan B1..B12.
     Urutan bandNames-nya adalah
       1 B1, 2 B2, 3 B3, 4 B4, 5 B5, 6 B6, 7 B7, 8 B8, 9 B8A, 10 B9,
       11 B10_Cirrus, 12 B11, 13 B12
     jadi B11 berada di posisi 12 -- bukan 11. Meminta bandIds '8,11' akan
     diam-diam mengambil B10 (Cirrus) dan menghasilkan NDMI yang salah tanpa
     error. NDRE & NDWI memakai rasterFunction yang sudah dihitung server.
     Catatan: NDMI hanya tersedia sebagai 'NDMI Colorized' (RGB 3 band) di
     service itu, sehingga tidak bisa dipakai untuk statistik -- karena itu
     NDMI dihitung sendiri dari dua band mentah. */

  const NDMI_BANDS = [
    { label: 'Kering', min: -Infinity, max: 0, rgb: [166, 106, 63] },
    { label: 'Sangat kering', min: 0, max: 0.2, rgb: [214, 190, 120] },
    { label: 'Kering', min: 0.2, max: 0.4, rgb: [232, 215, 150] },
    { label: 'Lembap', min: 0.4, max: 0.6, rgb: [150, 200, 180] },
    { label: 'Sangat lembap', min: 0.6, max: Infinity, rgb: [37, 116, 169] }
  ];

  const NDRE_BANDS = [
    { label: 'Sangat rendah', min: -Infinity, max: 0.1, rgb: [198, 135, 42] },
    { label: 'Rendah', min: 0.1, max: 0.2, rgb: [215, 190, 55] },
    { label: 'Sedang', min: 0.2, max: 0.3, rgb: [101, 169, 66] },
    { label: 'Tinggi', min: 0.3, max: 0.4, rgb: [23, 107, 52] },
    { label: 'Sangat tinggi', min: 0.4, max: Infinity, rgb: [11, 61, 30] }
  ];

  const NDWI_BANDS = [
    { label: 'Tidak ada air', min: -Infinity, max: -0.2, rgb: [215, 190, 55] },
    { label: 'Sedikit air', min: -0.2, max: 0, rgb: [150, 200, 120] },
    { label: 'Cukup air', min: 0, max: 0.2, rgb: [80, 160, 200] },
    { label: 'Perairan', min: 0.2, max: 0.4, rgb: [37, 116, 169] },
    { label: 'Air terbuka', min: 0.4, max: Infinity, rgb: [10, 60, 130] }
  ];

  /* Ambang berikut disusun dari rentang umum indeks tersebut, bukan dari satu
     sumber baku. Kalau ingin menyesuaikan, ubah hanya angka min/max di sini. */
  const EVI_BANDS = [
    { label: 'Tanpa vegetasi', min: -Infinity, max: 0.05, rgb: [166, 106, 63] },
    { label: 'Sangat rendah', min: 0.05, max: 0.2, rgb: [214, 190, 120] },
    { label: 'Rendah', min: 0.2, max: 0.35, rgb: [232, 215, 150] },
    { label: 'Sedang', min: 0.35, max: 0.5, rgb: [101, 169, 66] },
    { label: 'Tinggi', min: 0.5, max: 0.7, rgb: [23, 107, 52] },
    { label: 'Sangat tinggi', min: 0.7, max: Infinity, rgb: [11, 61, 30] }
  ];

  const MSAVI_BANDS = [
    { label: 'Tanpa vegetasi', min: -Infinity, max: 0, rgb: [166, 106, 63] },
    { label: 'Sangat rendah', min: 0, max: 0.15, rgb: [214, 190, 120] },
    { label: 'Rendah', min: 0.15, max: 0.3, rgb: [232, 215, 150] },
    { label: 'Sedang', min: 0.3, max: 0.45, rgb: [101, 169, 66] },
    { label: 'Tinggi', min: 0.45, max: 0.6, rgb: [23, 107, 52] },
    { label: 'Sangat tinggi', min: 0.6, max: Infinity, rgb: [11, 61, 30] }
  ];

  /* NBR dibalik arahnya dibanding indeks lain: makin RENDAH makin terbakar. */
  const NBR_BANDS = [
    { label: 'Tidak terbakar', min: 0.5, max: Infinity, rgb: [23, 107, 52] },
    { label: 'Kerusakan kecil', min: 0.3, max: 0.5, rgb: [101, 169, 66] },
    { label: 'Kerusakan sedang', min: 0.2, max: 0.3, rgb: [232, 215, 150] },
    { label: 'Kerusakan berat', min: 0.1, max: 0.2, rgb: [214, 120, 60] },
    { label: 'Terbakar', min: -0.1, max: 0.1, rgb: [180, 60, 40] },
    { label: 'Terbakar sangat berat', min: -Infinity, max: -0.1, rgb: [110, 30, 25] }
  ];

  const NDVI705_BANDS = [
    { label: 'Sangat rendah', min: -Infinity, max: 0.1, rgb: [198, 135, 42] },
    { label: 'Rendah', min: 0.1, max: 0.25, rgb: [215, 190, 55] },
    { label: 'Sedang', min: 0.25, max: 0.4, rgb: [101, 169, 66] },
    { label: 'Tinggi', min: 0.4, max: 0.55, rgb: [23, 107, 52] },
    { label: 'Sangat tinggi', min: 0.55, max: Infinity, rgb: [11, 61, 30] }
  ];

  /* ── Rumus indeks ──
     `compute(v)` menerima array band's SUDAH berskala dan mengembalikan nilai
     indeks per piksel, atau NaN bila tidak bisa dihitung.

     PENTING soal skala: NDMI/NDRE/NDWI/NBR/NDVI705 adalah RASIO MURNI
     ((a-b)/(a+b)), jadi skala band saling menghilangkan dan `scale` = 1.
     Tapi EVI dan MSAVI punya suku "+1" di penyebut; suku itu hanya benar
     bila reflektansi berada di skala 0-1. Service ArcGIS mengembalikan DN
     0-10000, jadi keduanya WAJIB memakai scale 0.0001. Tanpa itu EVI bernilai
     sekitar 2.4 untuk padi sehat (sampah) -- sudah diuji numerik. */

  function eviCompute(v) {
    const nir = v[0], red = v[1], blue = v[2];
    const den = nir + 6 * red - 7.5 * blue + 1;
    return den ? 2.5 * (nir - red) / den : NaN;
  }

  function msaviCompute(v) {
    const nir = v[0], red = v[1];
    const a = 2 * nir + 1;
    const rad = a * a - 8 * (nir - red);
    return rad >= 0 ? (a - Math.sqrt(rad)) / 2 : NaN;
  }

  /* ── Dua sistem penamaan band yang hidup berdampingan ──

     `spec.bands` memakai NOMOR URUT di ArcGIS Sentinel2 ImageServer. Service
     itu punya 13 band (B01-B12 + B08A) dengan urutan:
       pos 1-8 = B01-B08, 9 = B08A, 10 = B09, 11 = B10, 12 = B11, 13 = B12
     Jadi "nomor = nomor" hanya berlaku sampai posisi 8, lalu bergeser.
     NDMI memakai pos '8,12' untuk mengambil B08 dan B11.

     Sebaliknya TREND_SPECS memakai NAMA ASSET STAC (B02, B08, B12, ...) yang
     mengikuti penamaan asli Sentinel-2.

     Kedua sistem sama untuk posisi 1-8, dan semua rumus di bawah memakai
     band's di posisi <= 8 (B02, B04, B05, B06, B08) kecuali B11 lewat pos 12.
     Jangan memakai pos 13 (B12) di spec.bands tanpa memeriksa ulang. */

  /* `hint` ditulis dengan bahasa sehari-hari supaya mudah dibaca petani:
     yang dijelaskan adalah artinya buat praktik, bukan istilah teknis. */

  /* Dimuat otomatis bersama NDVI. */
  const SPECTRAL_INDEXES = [
    {
      key: 'ndmi', label: 'NDMI', trendKey: 'ndmiTrend', bands: '8,12',
      /* (v[0]-v[1]) dengan urutan band 8,12 menghasilkan (B08−B11)/(B08+B11).
         JANGAN diganti ndRatio: ndRatio menghitung (v[1]−v[0])/(v[1]+v[0]) dan
         untuk urutan band ini hasilnya bertanda terbalik. */
      compute: function (v) { return (v[0] - v[1]) / (v[0] + v[1]); },
      formula: 'NDMI = (B08 − B11) / (B08 + B11)', table: NDMI_BANDS,
      hint: 'Seberapa lembap daunnya. Makin tinggi, makin banyak air di tumbuhan.'
    },
    {
      key: 'ndre', label: 'NDRE', trendKey: 'ndreTrend', rule: 'NDVI - with VRE Raw',
      formula: 'NDRE = (B08 − B05) / (B08 + B05)', table: NDRE_BANDS,
      hint: 'Seberapa hijau dan rapat daunnya. Makin tinggi, tanaman makin subur.'
    },
    {
      key: 'ndwi', label: 'NDWI', trendKey: 'ndwiTrend', rule: 'NDWI Raw',
      formula: 'NDWI = (B03 − B08) / (B03 + B08)', table: NDWI_BANDS,
      hint: 'Seberapa banyak air di permukaan lahan. Berguna untuk melihat sawah yang disiram atau tergenang.'
    }
  ];

  /* Dimuat manual lewat tombol, satu per satu. Alasannya sederhana: tiap
     indeks = satu permintaan exportImage, dan menambahkannya ke alur otomatis
     akan membuat satu polygon memicu banyak permintaan sekaligus. */
  const EXTRA_INDEXES = [
    {
      key: 'evi', label: 'EVI', trendKey: 'eviTrend', bands: '8,4,2', scale: 0.0001,
      compute: eviCompute, range: [-2, 2], table: EVI_BANDS,
      formula: 'EVI = 2,5 × (B08 − B04) / (B08 + 6×B04 − 7,5×B02 + 1)',
      hint: 'Seberapa subur tanamanya, dengan mengabaikan pengaruh tanah dan kabut. Lebih tepat daripada NDVI saat tanaman jarang.'
    },
    {
      key: 'msavi', label: 'MSAVI', trendKey: 'msaviTrend', bands: '8,4', scale: 0.0001,
      compute: msaviCompute, range: [-2, 2], table: MSAVI_BANDS,
      formula: 'MSAVI = [2×B08 + 1 − √((2×B08 + 1)² − 8×(B08 − B04))] / 2',
      hint: 'Mirip EVI, tapi khusus untuk tanaman yang masih kecil dan belum rapat.'
    },
    {
      key: 'nbr', label: 'NBR', trendKey: 'nbrTrend', rule: 'Normalized Burn Ratio',
      formula: 'NBR = (B08 − B12) / (B08 + B12)', table: NBR_BANDS,
      hint: 'Seberapa besar kerusakan akibat pembakaran. Makin rendah, makin parah.'
    },
    {
      key: 'ndvi705', label: 'NDVI705', trendKey: 'ndvi705Trend', rule: 'NDVI - VRE only Raw',
      formula: 'NDVI705 = (B06 − B05) / (B06 + B05)', table: NDVI705_BANDS,
      hint: 'Seberapa cukup nitrogen di daun, dipakai saat tanaman masih tahap awal.'
    }
  ];

  const ALL_INDEXES = SPECTRAL_INDEXES.concat(EXTRA_INDEXES);

  /* Modul laporan PDF (geofarm-report.js) butuh daftar indeks agar bisa
     menulis kolom yang sama untuk semua indeks. Diberi tahu di sini supaya
     modul itu tidak perlu tahu urutan definisi indeks di berkas ini. */
  if (typeof window.setGeoFarmReportIndexSpecs === 'function') {
    window.setGeoFarmReportIndexSpecs(ALL_INDEXES);
  }

  const state = {
    seq: 0, items: [], minimized: false,
    notice: null, noticeKind: 'info', noticeTimer: 0,
    completing: false,
    footprint: null, footprintOwner: null,
    terrainOwner: null
  };

  /** Pesan singkat hasil aksi pengguna (ekspor), hilang sendiri. */
  function showNotice(message, kind) {
    if (state.noticeTimer) { clearTimeout(state.noticeTimer); state.noticeTimer = 0; }
    state.notice = message;
    state.noticeKind = kind === 'error' ? 'error' : 'info';
    render();
    state.noticeTimer = setTimeout(function () {
      state.noticeTimer = 0;
      state.notice = null;
      render();
    }, 6000);
  }

  /* ── Kontrol export di kepala panel ──
     Sengaja TIDAK memakai footer: footer yang selalu tampil memakan tinggi
     sheet, hanya beberapa mm, tapi ikut mengurangi ruang daftar polygon.
     Kontrol ini baru muncul setelah semua analisis selesai. */

  function exportRootEl() {
    return document.getElementById('geofarmExport');
  }

  function exportMenuEl() {
    return document.getElementById('geofarmExportMenu');
  }

  function isExportMenuOpen() {
    var menu = exportMenuEl();
    return !!menu && !menu.hidden;
  }

  function openExportMenu() {
    var menu = exportMenuEl();
    var root = exportRootEl();
    if (!menu) return;
    menu.hidden = false;
    if (root) root.classList.add('is-open');
    var toggle = document.getElementById('geofarmExportToggle');
    if (toggle) toggle.setAttribute('aria-expanded', 'true');
  }

  function closeExportMenu() {
    var menu = exportMenuEl();
    var root = exportRootEl();
    if (menu) menu.hidden = true;
    if (root) root.classList.remove('is-open');
    var toggle = document.getElementById('geofarmExportToggle');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }

  function toggleExportMenu() {
    if (isExportMenuOpen()) closeExportMenu();
    else openExportMenu();
  }

  /**
   * Kontrol export hanya ditampilkan kalau seluruh daftar polygon sudah
   * tuntas. Selama belum, yang terlihat di kartu adalah daftar langkah yang
   * masih harus dikerjakan pengguna.
   */
  function renderExportToggle() {
    var root = exportRootEl();
    if (!root) return;
    var ready = state.items.length > 0 && exportReadiness().ready;
    if (!ready) closeExportMenu();
    root.hidden = !ready;
  }

  /* Klik di luar menu dan tombolnya menutup menu. Dipasang sekali, bukan di
     setiap render(), supaya tidak menumpuk listener. */
  function bindExportMenu() {
    if (typeof document === 'undefined' || document.__geofarmExportMenuBound) return;
    document.__geofarmExportMenuBound = true;
    document.addEventListener('click', function (event) {
      if (!isExportMenuOpen()) return;
      var root = exportRootEl();
      if (root && root.contains(event.target)) return;
      closeExportMenu();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && isExportMenuOpen()) {
        closeExportMenu();
        var toggle = document.getElementById('geofarmExportToggle');
        if (toggle) toggle.focus();
      }
    });
  }


  /**
   * Menjalankan ekspor SHP atau PDF lalu menampilkan hasilnya di panel.
   * kind: 'shp' atau 'pdf'. PDF ditangani geofarm-report.js supaya file
   * polygon-analysis.js tidak ikut menanggung tata letak laporan.
   */
  function runGeoFarmExport(button, kind) {
    var isPdf = kind === 'pdf';
    var fn = isPdf ? window.buildGeoFarmReportPDF : window.exportGeoFarmSHP;
    if (typeof fn !== 'function') {
      showNotice(isPdf ? 'Modul laporan PDF belum siap.' : 'Modul ekspor SHP belum siap.', 'error');
      return;
    }
    if (!state.items.length) {
      showNotice('Tidak ada polygon untuk diekspor.', 'error');
      return;
    }
    /* Penjaga terakhir. Tombolnya memang sudah dikunci lewat UI, tapi ekspor
       juga bisa dipicu dari kode atau dari klik yang terjadi sebelum statusnya
       selesai, jadi dicek lagi di sini. */
    var readiness = exportReadiness();
    if (!readiness.ready || state.completing) {
      showNotice(
        state.completing
          ? 'Analisis masih berjalan. Tunggu sampai selesai lalu ekspor.'
          : 'Analisis belum lengkap. ' + gapSummary(readiness),
        'error'
      );
      return;
    }
    if (button && button.setAttribute) {
      button.setAttribute('disabled', 'disabled');
      button.classList.add('is-busy');
    }
    // PDF menerima array item apa adanya; SHP mengambil sendiri dari state.
    var result = isPdf ? fn(state.items.slice()) : fn();
    Promise.resolve(result).then(function (res) {
      if (button && button.removeAttribute) {
        button.removeAttribute('disabled');
        button.classList.remove('is-busy');
      }
      showNotice(
        res && res.message ? res.message : 'Ekspor selesai.',
        res && res.ok === false ? 'error' : 'info'
      );
    });
  }

  /* ── util ─────────────────────────────────────────────── */

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmt(value, digits) {
    return Number.isFinite(value)
      ? value.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })
      : '-';
  }

  function mapReady() {
    return typeof map !== 'undefined' && map && typeof L !== 'undefined' && L.latLngBounds;
  }

  function findBand(value, table) {
    const bands = table || NDVI_BANDS;
    for (let i = 0; i < bands.length; i++) {
      if (value >= bands[i].min && value < bands[i].max) return bands[i];
    }
    return bands[bands.length - 1];
  }

  /** Leaflet [lat,lng] -> ring GeoJSON [lng,lat]; indentation pertama jadi hole. */
  function ringsFromLatLngs(latlngs) {
    const rings = [];
    latlngs.forEach(function (ring) {
      if (!ring || !ring.length) return;
      const points = ring.map(function (pt) { return [pt.lng, pt.lat]; });
      // GeoJSON/turf menuntut ring tertutup, sedangkan Leaflet menyimpannya terbuka.
      const first = points[0];
      const last = points[points.length - 1];
      if (points.length > 2 && (first[0] !== last[0] || first[1] !== last[1])) {
        points.push([first[0], first[1]]);
      }
      rings.push(points);
    });
    return rings;
  }

  function boundsOf(rings) {
    let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
    rings.forEach(function (ring) {
      ring.forEach(function (pt) {
        if (pt[0] < west) west = pt[0];
        if (pt[0] > east) east = pt[0];
        if (pt[1] < south) south = pt[1];
        if (pt[1] > north) north = pt[1];
      });
    });
    return { west: west, south: south, east: east, north: north };
  }

  /* ── Projeksi WGS84 -> UTM ──
     PENTING: bbox yang dihitung boundsOf() ada dalam DERAJAT, sedangkan COG
     di Planetary Computer berada dalam UTM meter per zona
     (sentinel-2-l2a = EPSG:327xx/326xx, landsat-c2-l2 = EPSG:326xx/327xx).
     Mengcampur keduanya membuat jendela piksel terpotong ke pojok kiri atas
     citra -- hasil statistiknya jadi sampah tanpa error yang terlihat.

     Dihitung sendiri (tanpa proj4 dari CDN) karena aset COG-nya selalu
     WGS84 UTM north/south. Divalidasi terhadap titik acuan: 111°E/0° =
     (500000, 0) dan zona hasil hitungan cocok dengan proj:epsg yang
     dilaporkan STAC. */
  const UTM_A = 6378137.0;
  const UTM_F = 1 / 298.257223563;
  const UTM_K0 = 0.9996;
  const UTM_E2 = UTM_F * (2 - UTM_F);
  const UTM_EP2 = UTM_E2 / (1 - UTM_E2);

  function wgs84ToUtm(lng, lat) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    // UTM tidak didefinisikan di luar 80°S..84°N.
    if (lat < -80 || lat > 84) return null;
    const zone = Math.floor((lng + 180) / 6) + 1;
    const lng0R = (((zone - 1) * 6 - 180 + 3) * Math.PI) / 180;
    const latR = (lat * Math.PI) / 180;
    const lngR = (lng * Math.PI) / 180;
    const sinLat = Math.sin(latR);
    const cosLat = Math.cos(latR);
    const tanLat = Math.tan(latR);
    const N = UTM_A / Math.sqrt(1 - UTM_E2 * sinLat * sinLat);
    const A = cosLat * (lngR - lng0R);
    const e4 = UTM_E2 * UTM_E2;
    const e6 = e4 * UTM_E2;
    const M = UTM_A * (
      (1 - UTM_E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * latR
      - ((3 * UTM_E2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * latR)
      + ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * latR)
      - ((35 * e6) / 3072) * Math.sin(6 * latR)
    );
    let x = UTM_K0 * N * A + 500000;
    let y = UTM_K0 * (M + N * tanLat);
    if (lat < 0) y += 10000000;
    return { x: x, y: y, epsg: lat >= 0 ? 32600 + zone : 32700 + zone };
  }

  /** Bbox derajat -> bbox UTM. Error kalau titiknya di luar jangkauan UTM. */
  function projectBounds(bounds) {
    const nw = wgs84ToUtm(bounds.west, bounds.north);
    const se = wgs84ToUtm(bounds.east, bounds.south);
    if (!nw || !se) throw new Error('Lokasi polygon di luar jangkauan zona UTM.');
    return {
      west: Math.min(nw.x, se.x),
      east: Math.max(nw.x, se.x),
      south: Math.min(nw.y, se.y),
      north: Math.max(nw.y, se.y),
      epsg: nw.epsg
    };
  }

  /** Ring derajat -> ring UTM, untuk mask yang harus seprojksi dengan raster. */
  function projectRings(rings) {
    return rings.map(function (ring) {
      return ring.map(function (pt) {
        const p = wgs84ToUtm(pt[0], pt[1]);
        if (!p) throw new Error('Vertex polygon di luar jangkauan zona UTM.');
        return [p.x, p.y];
      });
    });
  }

  function pickSizeAtResolution(bounds, resolutionM) {
    const wDeg = Math.abs(bounds.east - bounds.west);
    const hDeg = Math.abs(bounds.north - bounds.south);
    let w = Math.round((wDeg * M_PER_DEG) / resolutionM);
    let h = Math.round((hDeg * M_PER_DEG) / resolutionM);
    const longest = Math.max(w, h) || 1;
    if (longest > MAX_PX) {
      const scale = MAX_PX / longest;
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    return {
      w: Math.max(MIN_PX, Math.min(MAX_PX, w)),
      h: Math.max(MIN_PX, Math.min(MAX_PX, h))
    };
  }

  function pickSize(bounds) {
    return pickSizeAtResolution(bounds, TARGET_RES_M);
  }

  /* ── NDVI: exportImage GeoTIFF -> statistik + gambar ter-clip ── */

  /**
   * GeoTIFF satu indeks dari ArcGIS Sentinel2 ImageServer.
   * spec: { rule: 'NDVI Raw' } untuk rasterFunction yang dihitung server,
   *        { bands: '8,12' } atau { bands: '8,4,2' } untuk band mentah yang
   *        dirumuskan sendiri oleh applyIndexFormula.
   * Lihat catatan SPECTRAL_INDEXES soal nomor band.
   */
  function requestIndexGeoTiff(bounds, size, spec) {
    const params = new URLSearchParams({
      bbox: [bounds.west, bounds.south, bounds.east, bounds.north].map(function (v) { return v.toFixed(7); }).join(','),
      bboxSR: '4326',
      imageSR: '4326',
      size: size.w + ',' + size.h,
      format: 'tiff',
      f: 'image'
    });
    if (spec && spec.bands) {
      params.set('bandIds', spec.bands);
    } else {
      const rule = (spec && spec.rule) ? spec.rule : NDVI_RULE.rasterFunction;
      params.set('renderingRule', JSON.stringify({ rasterFunction: rule }));
    }
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT);
    return fetch(EXPORT_IMAGE_URL + '?' + params.toString(), { signal: controller.signal })
      .then(function (response) {
        if (!response.ok) throw new Error('Server citra menolak permintaan (HTTP ' + response.status + ')');
        return response.blob();
      })
      .finally(function () { clearTimeout(timer); });
  }

  /**
   * Baca seluruh band dari GeoTIFF. Nilai dikembalikan sebagai array
   * `rasters` (satu elemen per band) supaya indeks berband banyak seperti
   * NDMI dan EVI bisa dirumuskan ulang sebelum dihitung.
   */
  async function readIndexPixels(blob, fallbackBounds) {
    if (!window.GeoTIFF || typeof window.GeoTIFF.fromBlob !== 'function') {
      throw new Error('Library geotiff.js belum termuat.');
    }
    const tiff = await window.GeoTIFF.fromBlob(blob);
    const image = await tiff.getImage();
    const rasters = await image.readRasters();
    if (!rasters || !rasters.length) throw new Error('Raster indeks kosong.');

    const width = image.getWidth();
    const height = image.getHeight();
    const bb = image.getBoundingBox();
    const geo = Array.isArray(bb) && bb.length === 4 && Number.isFinite(bb[0]) && Number.isFinite(bb[2]) && bb[2] > bb[0]
      ? { minX: bb[0], minY: bb[1], maxX: bb[2], maxY: bb[3] }
      : { minX: fallbackBounds.west, minY: fallbackBounds.south, maxX: fallbackBounds.east, maxY: fallbackBounds.north };

    return { rasters: rasters, width: width, height: height, geo: geo };
  }

  /** Mask polygon via canvas (mendukung hole) -> Uint8Array 1 = di dalam polygon. */
  function rasterizeMask(rings, raster) {
    const canvas = document.createElement('canvas');
    canvas.width = raster.width;
    canvas.height = raster.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const spanX = (raster.geo.maxX - raster.geo.minX) || 1;
    const spanY = (raster.geo.maxY - raster.geo.minY) || 1;
    const toX = function (lng) { return ((lng - raster.geo.minX) / spanX) * raster.width; };
    const toY = function (lat) { return ((raster.geo.maxY - lat) / spanY) * raster.height; };

    ctx.beginPath();
    rings.forEach(function (ring) {
      if (!ring.length) return;
      ctx.moveTo(toX(ring[0][0]), toY(ring[0][1]));
      for (let i = 1; i < ring.length; i++) ctx.lineTo(toX(ring[i][0]), toY(ring[i][1]));
      ctx.closePath();
    });
    ctx.fillStyle = '#fff';
    ctx.fill('evenodd');

    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const mask = new Uint8Array(raster.width * raster.height);
    for (let i = 0, p = 3; i < mask.length; i++, p += 4) mask[i] = pixels[p] > 128 ? 1 : 0;
    return mask;
  }

  /**
   * Statistik indeks di dalam rentang min..max. Semua indeks di sini
   * memakai rentang -1..1, tapi batasnya dibuat parametris agar tidak
   * mengasumsikan; `table` hanya mengatur class-break untuk sebaran kelas.
   */
  function computeStats(values, mask, table, range) {
    const table_ = table || NDVI_BANDS;
    const lo = range && Number.isFinite(range[0]) ? range[0] : -1;
    const hi = range && Number.isFinite(range[1]) ? range[1] : 1;
    let count = 0, sum = 0, min = Infinity, max = -Infinity;
    const bands = table_.map(function (band) { return { band: band, count: 0 }; });
    let inside = 0;

    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      inside++;
      const value = values[i];
      // Di luar rentang indeks berarti nodata, awan, atau perhitungan gagal.
      if (!Number.isFinite(value) || value < lo || value > hi) continue;
      count++;
      sum += value;
      if (value < min) min = value;
      if (value > max) max = value;
      const found = findBand(value, table_);
      for (let b = 0; b < bands.length; b++) if (bands[b].band === found) bands[b].count++;
    }

    return {
      count: count,
      inside: inside,
      mean: count ? sum / count : NaN,
      min: count ? min : NaN,
      max: count ? max : NaN,
      coverage: inside ? (count / inside) * 100 : 0,
      bands: bands
    };
  }

  function renderNdviCanvas(values, mask, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(width, height);
    const data = image.data;

    for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
      if (!mask[i]) continue;
      const value = values[i];
      if (!Number.isFinite(value) || value < -1 || value > 1) continue;
      const rgb = findBand(value).rgb;
      data[p] = rgb[0];
      data[p + 1] = rgb[1];
      data[p + 2] = rgb[2];
      data[p + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  function showOverlay(dataUrl, raster, item) {
    if (!mapReady()) return;
    if (item.overlay && map.hasLayer(item.overlay)) {
      map.removeLayer(item.overlay);
    }
    const overlay = L.imageOverlay(dataUrl, L.latLngBounds(
      [[raster.geo.minY, raster.geo.minX], [raster.geo.maxY, raster.geo.maxX]]
    ), { opacity: 0.85, interactive: false, pane: 'overlayPane' });
    overlay.addTo(map);
    item.overlay = overlay;
    item.overlayVisible = true;
  }

  function removeItemOverlay(item) {
    if (item.overlay && mapReady() && map.hasLayer(item.overlay)) {
      map.removeLayer(item.overlay);
    }
    item.overlay = null;
    item.overlayVisible = false;
  }

  function toggleItemOverlay(item) {
    if (!item.overlay || !mapReady()) return false;
    if (map.hasLayer(item.overlay)) {
      map.removeLayer(item.overlay);
      item.overlayVisible = false;
    } else {
      item.overlay.addTo(map);
      item.overlayVisible = true;
    }
    return item.overlayVisible;
  }

  async function runNdvi(item, onStatus) {
    onStatus('Mengunduh raster NDVI...');
    const size = pickSize(item.bounds);
    const blob = await requestIndexGeoTiff(item.bounds, size, { rule: NDVI_RULE.rasterFunction });
    onStatus('Membaca piksel (' + size.w + '×' + size.h + ')...');
    const raster = await readIndexPixels(blob, item.bounds);
    const mask = rasterizeMask(item.rings, raster);
    const stats = computeStats(raster.rasters[0], mask);
    if (!stats.count) throw new Error('Tidak ada piksel NDVI valid di dalam polygon.');

    onStatus('Menyusun gambar ter-clip...');
    const canvas = renderNdviCanvas(raster.rasters[0], mask, raster.width, raster.height);
    showOverlay(canvas.toDataURL('image/png'), raster, item);

    item.ndvi = stats;
    item.rasterSize = size.w + '×' + size.h;
    return stats;
  }

  /**
   * Menerapkan rumus indeks ke seluruh band yang dibaca.
   * spec.rule  -> server sudah menghitung, rasters[0] langsung dipakai.
   * spec.bands -> band mentah, dirumuskan ulang lewat spec.compute.
   * spec.scale -> faktor penskalaan band sebelum dirumuskan. WAJIB 0.0001
   *               untuk EVI/MSAVI karena rumusnya memuat suku "+1" yang hanya
   *               benar pada skala 0-1, sedangkan service memberi DN 0-10000.
   */
  function applyIndexFormula(rasters, spec) {
    if (spec.rule) return rasters[0];
    const total = Math.min.apply(null, rasters.map(function (r) { return r.length; }));
    const out = new Float64Array(total);
    const scale = Number.isFinite(spec.scale) ? spec.scale : 1;
    // Jumlah band yang diminta harus sama dengan jumlah band yang benar-benar
    // dibaca; kalau tidak, hasilnya tidak bisa dipercaya, jadi seluruh piksel
    // ditandai tidak valid.
    if (!spec.compute || rasters.length !== spec.bands.split(',').length) {
      out.fill(NaN);
      return out;
    }
    // `v` dipakai ulang tiap piksel (ribuan-kaliAN di satu polygon) alih-alih
    // dialokasikan ulang; compute tidak menyimpan referensinya.
    const v = new Array(rasters.length);
    for (let i = 0; i < total; i++) {
      let bad = false;
      for (let b = 0; b < rasters.length; b++) {
        const raw = rasters[b][i];
        // Reflektansi Sentinel-2 yang sah: > 0 sampai 10000. Di luar itu nodata.
        if (!raw || raw < 0 || raw > 10000) { bad = true; break; }
        v[b] = raw * scale;
      }
      out[i] = bad ? NaN : spec.compute(v);
    }
    return out;
  }

  /** Menghitung satu indeks spektral untuk satu polygon. */
  async function computeIndexFor(item, spec, onStatus) {
    const size = pickSize(item.bounds);
    if (onStatus) onStatus('Menghitung ' + spec.label + '...');
    const blob = await requestIndexGeoTiff(item.bounds, size, spec);
    if (onStatus) onStatus('Membaca piksel ' + spec.label + ' (' + size.w + '×' + size.h + ')...');
    const raster = await readIndexPixels(blob, item.bounds);
    const mask = rasterizeMask(item.rings, raster);
    const values = applyIndexFormula(raster.rasters, spec);
    const stats = computeStats(values, mask, spec.table, spec.range);
    if (!stats.count) throw new Error('Tidak ada piksel ' + spec.label + ' valid di dalam polygon.');
    item[spec.key] = stats;
    item[spec.key + 'Error'] = null;
    return stats;
  }

  /**
   * NDMI, NDRE, NDWI untuk satu polygon. Masing-masing diambil terpisah agar
   * satu indeks yang gagal tidak menghilangkan hasil indeks lain; pesan
   * errornya disimpan per indeks.
   */
  async function runSpectral(item, onStatus) {
    for (let i = 0; i < SPECTRAL_INDEXES.length; i++) {
      const spec = SPECTRAL_INDEXES[i];
      try {
        await computeIndexFor(item, spec, onStatus);
      } catch (error) {
        item[spec.key] = null;
        item[spec.key + 'Error'] = error && error.message ? error.message : 'Gagal menghitung ' + spec.label + '.';
      }
    }
    await runSpectralMeta(item, onStatus);
  }

  /**
   * Memuat satu indeks lanjutan (EVI / MSAVI / NBR / NDVI705) saat pengguna
   * menekan tombolnya. Sengaja satu per klik: tiap indeks adalah satu
   * permintaan exportImage, jadi memuat semuanya sekaligus saat polygon
   * digambar akan membuat satu polygon memicu banyak permintaan raster.
   */
  async function runExtraIndex(item, spec, onStatus) {
    try {
      await computeIndexFor(item, spec, onStatus);
    } catch (error) {
      item[spec.key] = null;
      item[spec.key + 'Error'] = error && error.message ? error.message : 'Gagal menghitung ' + spec.label + '.';
      throw error;
    }
    // Metadata ikut diambil bila belum ada: indeks lanjutan bisa dimuat pada
    // polygon yang belum dianalisis, dan blok "Rumus & sumber citra" jadi
    // tidak berguna tanpa tanggal akuisisi serta tutupan awannya.
    if (!item.spectralMeta && !item.spectralMetaError) {
      await runSpectralMeta(item, onStatus);
    }
  }

  /** Dipanggil dari tombol "Hitung" pada tiap indeks lanjutan. */
  window.loadGeoFarmIndex = function (id, key) {
    const item = itemById(id);
    if (!item) return false;
    const spec = EXTRA_INDEXES.filter(function (row) { return row.key === key; })[0];
    if (!spec) return false;
    const busyKey = spec.key + 'Busy';
    if (item[busyKey]) return false;
    item[busyKey] = true;
    item[spec.key + 'Error'] = null;
    render();
    runExtraIndex(item, spec, function (text) { item.busy = text; render(); })
      .catch(function () { /* pesan errornya sudah tersimpan di item */ })
      .then(function () {
        item.busy = null;
        item[busyKey] = false;
        render();
      });
    return true;
  };

  /**
   * Metadata citra untuk indeks spektral. Ketiga indeks dihitung dari
   * rasterFunction/band yang sama pada ImageServer Sentinel-2 yang sama,
   * jadi satu query katalog cukup untuk semuanya -- dan memang itu adegan
   * yang benar, bukan tebakan. Kegagalan metadata tidak boleh menggagalkan
   * indeksnya, jadi error disimpan terpisah.
   */
  async function runSpectralMeta(item, onStatus) {
    item.spectralMetaError = null;
    if (typeof window.fetchNdviCloudInfo !== 'function') return;
    onStatus('Mengambil metadata Indeks Spektral...');
    try {
      item.spectralMeta = await window.fetchNdviCloudInfo([
        item.bounds.west, item.bounds.south, item.bounds.east, item.bounds.north
      ]);
    } catch (error) {
      item.spectralMeta = null;
      item.spectralMetaError = 'Metadata citra tidak dapat dimuat: ' +
        (error && error.message ? error.message : 'katalog tidak merespons.');
    }
  }

  /* ── LST: raster function suhu Celsius dari Landsat ImageServer ── */
  const LST_RENDERING_RULE = { rasterFunction: 'Band 10 Surface Temperature in Celsius' };
  const LST_MOSAIC_RULE = {
    mosaicMethod: 'esriMosaicAttribute',
    sortField: 'Best',
    sortValue: '0',
    mosaicOperation: 'MT_FIRST'
  };

  async function runLst(item, onStatus) {
    if (!window.GeoTIFF || typeof window.GeoTIFF.fromBlob !== 'function') {
      throw new Error('Library geotiff.js belum termuat.');
    }
    onStatus('Mengunduh suhu permukaan Landsat...');
    const size = pickSizeAtResolution(item.bounds, 30);
    const params = new URLSearchParams({
      bbox: [item.bounds.west, item.bounds.south, item.bounds.east, item.bounds.north]
        .map(function (value) { return value.toFixed(7); }).join(','),
      bboxSR: '4326',
      imageSR: '4326',
      size: size.w + ',' + size.h,
      format: 'tiff',
      pixelType: 'F32',
      renderingRule: JSON.stringify(LST_RENDERING_RULE),
      mosaicRule: JSON.stringify(LST_MOSAIC_RULE),
      f: 'image'
    });

    // Jika slider Landsat sedang memilih tahun tertentu, analisis mengikuti
    // rentang yang sama. Tanpa pilihan waktu, ImageServer memakai mosaik Best.
    const mapLayer = typeof baseTileLayers !== 'undefined' && baseTileLayers['landsat-agriculture'];
    if (mapLayer && typeof mapLayer.getTimeRange === 'function') {
      const timeRange = mapLayer.getTimeRange();
      if (timeRange && timeRange[0] instanceof Date && timeRange[1] instanceof Date) {
        params.set('time', timeRange[0].getTime() + ',' + timeRange[1].getTime());
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT);
    let blob;
    try {
      const response = await fetch(LANDSAT_IMAGE_URL + '?' + params.toString(), { signal: controller.signal });
      if (!response.ok) throw new Error('Server Landsat menolak permintaan (HTTP ' + response.status + ').');
      blob = await response.blob();
    } finally {
      clearTimeout(timer);
    }
    if (/json/i.test(blob.type || '')) {
      let responseJson = {};
      try { responseJson = JSON.parse(await blob.text()); } catch (error) {}
      throw new Error(responseJson.error && responseJson.error.message
        ? 'ArcGIS Landsat: ' + responseJson.error.message
        : 'Server Landsat tidak mengembalikan GeoTIFF.');
    }

    onStatus('Membaca piksel suhu Landsat...');
    const raster = await readIndexPixels(blob, item.bounds);
    const mask = rasterizeMask(item.rings, raster);
    const values = raster.rasters[0];
    const buckets = LST_BANDS.map(function (band) { return { band: band, count: 0 }; });
    let count = 0, inside = 0, sum = 0, min = Infinity, max = -Infinity;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      inside++;
      const temperature = values[i];
      if (!Number.isFinite(temperature) || temperature < -90 || temperature > 80) continue;
      count++;
      sum += temperature;
      if (temperature < min) min = temperature;
      if (temperature > max) max = temperature;
      const found = findBand(temperature, LST_BANDS);
      for (let b = 0; b < buckets.length; b++) if (buckets[b].band === found) buckets[b].count++;
    }
    if (!count) throw new Error('Tidak ada piksel suhu permukaan Landsat yang valid di dalam polygon.');

    const activeTimeRange = mapLayer && typeof mapLayer.getTimeRange === 'function'
      ? mapLayer.getTimeRange() : null;
    let dateLabel = 'Mosaik terbaik';
    if (activeTimeRange && activeTimeRange[0] instanceof Date && activeTimeRange[1] instanceof Date) {
      dateLabel = 'Filter tahun ' + activeTimeRange[0].getUTCFullYear() + ' (tanggal scene dapat bervariasi)';
    }
    item.lst = {
      count: count,
      inside: inside,
      coverage: inside ? (count / inside) * 100 : 0,
      mean: sum / count,
      min: min,
      max: max,
      bands: buckets,
      date: dateLabel,
      platform: 'Landsat ImageServer (Esri, USGS, NASA)',
      cloud: NaN
    };
    item.lstError = null;
    return item.lst;
  }

  /* ── Tren indeks: Sentinel-2 L2A (STAC + windowed COG read), bulanan ── */

  const TREND_INITIAL_MONTHS = 6;
  const TREND_STEP_MONTHS = 6;
  const TREND_MAX_MONTHS = 18;
  const TREND_CONCURRENCY = 3;
  const TREND_SAMPLE_PX = 32;
  const TREND_CLOUD_LIMIT = 20;
  // Musim-cloud tidak punya adegan < 20%; pakai adegan terbaik di bawah ambang kedua.
  const TREND_CLOUD_FALLBACK = 60;
  const TREND_CLOUD_HIGH = 25;
  const TREND_ATTEMPTS = 3;
  const TREND_RETRY_MS = 1500;
  const PC_SEARCH_URL = 'https://planetarycomputer.microsoft.com/api/stac/v1/search';
  const PC_SIGN_URL = 'https://planetarycomputer.microsoft.com/api/sas/v1/sign';
  const PC_COLLECTION = 'sentinel-2-l2a';
  // Cache per polygon+periode agar "tambah periode" tidak mengunduh ulang.
  const trendCache = new Map();
  const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const CHART_W = 288;
  const CHART_H = 124;
  const CHART_PAD = { top: 12, right: 6, bottom: 20, left: 28 };

  function waitMs(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function trendPeriods(months) {
    const now = new Date();
    const list = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
      list.push({
        key: d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'),
        label: MONTH_SHORT[d.getUTCMonth()] + ' ' + String(d.getUTCFullYear()).slice(2),
        from: d.toISOString().slice(0, 10),
        to: end.toISOString().slice(0, 10)
      });
    }
    return list;
  }

  /**
   * Adegan dengan tutupan awan terkecil di dalam rentang periode.
   * `collection` opsional: tren NDVI memakai sentinel-2-l2, LST memakai
   * landsat-c2-l2. Keduanya punya properti eo:cloud_cover sehingga penyaringan
   * awan di query dan pengurutannya tetap berlaku.
   */
  /**
   * Daftar adegan yang tersedia untuk satu polygon, dipilah per tanggal.
   *
   * Beda dari stacBestScene di atas: yang ini mengembalikan SEMUA kandidat,
   * bukan hanya satu terbaik, karena mode mandiri meminta user yang memilih
   * adegan. Ambang awan menjadi opsi query, dan sengaja tidak ada penyaringan
   * diam-diam -- user harus bisa melihat adegan berawan supaya tahu
   * keputusan apa yang dia ambil.
   *
   * opts: { cloudLimit, months, limit }
   *   cloudLimit  batas atas tutupan awan persen; null = tanpa batas
   *   months      berapa bulan ke belakang dari hari ini
   *   limit       batas jumlah adegan yang dikembalikan
    */
  async function stacListScenes(bounds, opts) {
    const o = opts || {};
    const now = new Date();
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const months = o.months && o.months > 0 ? o.months : 6;
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1));
    const limit = o.limit && o.limit > 0 ? o.limit : 60;

    const body = {
      collections: [PC_COLLECTION],
      bbox: [bounds.west, bounds.south, bounds.east, bounds.north],
      datetime: from.toISOString().slice(0, 10) + 'T00:00:00Z/' +
        to.toISOString().slice(0, 10) + 'T23:59:59Z',
      limit: limit
    };
    if (Number.isFinite(o.cloudLimit)) {
      body.query = { 'eo:cloud_cover': { lt: o.cloudLimit } };
    }

    const response = await fetch(PC_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error('Pencarian adegan gagal (HTTP ' + response.status + ')');
    const data = await response.json();
    const features = (data && data.features) || [];

    // Tanggal bisa kembar: satu hari bisa punya beberapa tile atau pengudan.
    // Adegan dengan tanggal sama digabung agar tabel tidak berduplikat.
    const perTanggal = new Map();
    features.forEach(function (f) {
      const props = f.properties || {};
      const tanggal = String(props.datetime || '').slice(0, 10);
      if (!tanggal) return;
      const cloud = props['eo:cloud_cover'];
      const entry = perTanggal.get(tanggal);
      if (entry) {
        // Simpan yang paling bersih sebagai denominator representatif.
        if (Number.isFinite(cloud) && (!Number.isFinite(entry.cloud) || cloud < entry.cloud)) {
          entry.cloud = cloud;
          entry.feature = f;
        }
        entry.count += 1;
        return;
      }
      perTanggal.set(tanggal, {
        date: tanggal,
        datetime: props.datetime,
        cloud: cloud,
        platform: props.platform,
        feature: f,
        count: 1
      });
    });

    const list = Array.from(perTanggal.values());
    // Terbaru dulu: untuk Multiply, yang paling dekat dengan sekarang biasanya
    // yang dicari. Awan jadi tiebreak kedua.
    list.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (a.cloud == null ? 999 : a.cloud) - (b.cloud == null ? 999 : b.cloud);
    });
    return list.map(function (entry) {
      const props = entry.feature.properties || {};
      return {
        id: entry.feature.id,
        date: entry.date,
        datetime: props.datetime,
        cloud: entry.cloud,
        platform: props.platform,
        orbit: props['sat:relative_orbit'] || null,
        assets: entry.feature.assets,
        scenes: entry.count,
        cloudy: Number.isFinite(entry.cloud) && entry.cloud > TREND_CLOUD_HIGH
      };
    });
  }

  async function stacBestScene(bounds, period, collection, options) {
    const collectionId = collection || PC_COLLECTION;
    const o = options || {};
    const search = async function (cloudLimit) {
      const body = {
        collections: [collectionId],
        bbox: [bounds.west, bounds.south, bounds.east, bounds.north],
        datetime: period.from + 'T00:00:00Z/' + period.to + 'T23:59:59Z',
        limit: 8
      };
      if (Number.isFinite(cloudLimit)) body.query = { 'eo:cloud_cover': { lt: cloudLimit } };
      const response = await fetch(PC_SEARCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error('Pencarian adegan gagal (HTTP ' + response.status + ')');
      const data = await response.json();
      return (data && data.features) || [];
    };

    const cloudLimits = Array.isArray(o.cloudLimits)
      ? o.cloudLimits
      : [TREND_CLOUD_LIMIT, TREND_CLOUD_FALLBACK];
    let features = [];
    for (let i = 0; i < cloudLimits.length && !features.length; i++) {
      features = await search(cloudLimits[i]);
    }
    if (!features.length) return null;
    features.sort(function (a, b) {
      const ca = Number.isFinite(a.properties['eo:cloud_cover']) ? a.properties['eo:cloud_cover'] : Infinity;
      const cb = Number.isFinite(b.properties['eo:cloud_cover']) ? b.properties['eo:cloud_cover'] : Infinity;
      return ca - cb;
    });
    const best = features[0];
    const cloud = best.properties['eo:cloud_cover'];
    return {
      assets: best.assets,
      datetime: best.properties.datetime,
      platform: best.properties.platform,
      cloud: cloud,
      cloudy: Number.isFinite(cloud) && cloud > TREND_CLOUD_HIGH
    };
  }

  async function signCogUrl(href) {
    const response = await fetch(PC_SIGN_URL + '?href=' + encodeURIComponent(href));
    if (!response.ok) throw new Error('Penandatanganan COG gagal (HTTP ' + response.status + ')');
    const data = await response.json();
    return data.href || href;
  }

  /**
   * Jendela piksel COG yang menutupi bbox polygon.
   *
   * `maxPx` sengaja opsional dengan default TREND_SAMPLE_PX: jalur tren hanya
   * butuh sampel kecil untuk median, sementara mode mandiri memakai jendela
   * jauh lebih besar supaya statistik zonalnya benar-benar mewakili petak.
   * Default-nya tidak diubah supaya angka tren tetap sama seperti sebelumnya.
   */
  function cogWindow(bounds, image, maxPx) {
    const cap = Number.isFinite(maxPx) && maxPx > 0 ? Math.round(maxPx) : TREND_SAMPLE_PX;
    const bb = image.getBoundingBox();
    const res = image.getResolution();
    let x0 = Math.floor((bounds.west - bb[0]) / res[0]);
    let x1 = Math.ceil((bounds.east - bb[0]) / res[0]);
    // Sumbu Y GeoTIFF terbalik: baris 0 = utara.
    let y0 = Math.floor((bb[3] - bounds.north) / res[1]);
    let y1 = Math.ceil((bb[3] - bounds.south) / res[1]);
    x0 = Math.max(0, x0);
    y0 = Math.max(0, y0);
    x1 = Math.min(image.getWidth(), Math.max(x0 + 2, x1));
    y1 = Math.min(image.getHeight(), Math.max(y0 + 2, y1));
    if (x1 - x0 > cap) x1 = x0 + cap;
    if (y1 - y0 > cap) y1 = y0 + cap;
    // Jendela harus tetap di dalam citra. Tanpa guard ini, bbox yang salah
    // proyeksi menghasilkan tinggi/lebar negatif dan geotiff.js hanya
    // melempar error cryptic.
    x0 = Math.max(0, Math.min(x0, image.getWidth() - 2));
    y0 = Math.max(0, Math.min(y0, image.getHeight() - 2));
    x1 = Math.max(x0 + 2, Math.min(x1, image.getWidth()));
    y1 = Math.max(y0 + 2, Math.min(y1, image.getHeight()));
    if (x1 <= x0 || y1 <= y0) {
      throw new Error('Jendela piksel di luar jangkauan citra.');
    }
    return [x0, y0, x1, y1];
  }

  async function readCogWindow(href, bounds) {
    const tiff = await window.GeoTIFF.fromUrl(href);
    const image = await tiff.getImage();
    // Bbox COG dalam UTM meter, sedangkan `bounds` masih derajat.
    const rasters = await image.readRasters({ window: cogWindow(projectBounds(bounds), image) });
    if (!rasters || !rasters.length) throw new Error('COG tidak menghasilkan piksel.');
    return rasters[0];
  }

  /**
   * Sama seperti readCogWindow, tapi ikut mengembalikan mask polygon.
   * readCogWindow() hanya mengambil seluruh jendela bbox, sehingga statistik
   * LST dihitungnya akan memasukkan piksel di luar polygon. LST memakai
   * jalur ini supaya konsisten dengan NDMI/NDRE/NDWI yang di-mask.
   * Bbox DAN ring diproyeksi ke UTM, karena geo turunan jendela juga UTM.
   */
  async function readCogWindowMasked(href, bounds, rings) {
    const tiff = await window.GeoTIFF.fromUrl(href);
    const image = await tiff.getImage();
    const win = cogWindow(projectBounds(bounds), image);
    const rasters = await image.readRasters({ window: win });
    if (!rasters || !rasters.length) throw new Error('COG tidak menghasilkan piksel.');
    const bb = image.getBoundingBox();
    const res = image.getResolution();
    const width = win[2] - win[0];
    const height = win[3] - win[1];
    // Bounding box jendela turunan, bukan bbox citra penuh.
    const geo = {
      minX: bb[0] + win[0] * res[0],
      maxX: bb[0] + win[2] * res[0],
      maxY: bb[3] - win[1] * res[1],
      minY: bb[3] - win[3] * res[1]
    };
    return {
      values: rasters[0],
      mask: rasterizeMask(projectRings(rings), { width: width, height: height, geo: geo })
    };
  }

  /**
   * Baca beberapa band sekaligus dan TURUNKAN semuanya ke satu grid piksel
   * yang sama.
   *
   * Kenapa ini perlu ada: band Sentinel-2 tidak seragam. B02/B03/B04/B08
   * beresolusi 10 m, sedangkan B05/B06/B11/B12 20 m. Jendela piksel dihitung
   * per citra, jadi B11 (20 m) dan B08 (10 m) untuk area yang sama
   * menghasilkan array dengan panjang berbeda. applyIndexFormula() memakai
   * Math.min() atas panjang array, yang berarti piksel 10 m akan
   * disejajarkan ke piksel 20 m yang areanya berbeda -- hasil salah, tanpa
   * error. Yang kena: NDMI, NBR, dan NDRE.
   *
   * Solusinya: hitung jendela dari band pertama sebagai acuan ukuran keluaran,
   * lalu paksa setiap band berikutnya dibaca pada ukuran yang sama lewat opsi
   * width/height geotiff.js. Resampling memakai 'nearest': kelas indeks di
   * banding tidak boleh mengarang nilai di antara piksel asli, dan reflektansi
   * 20 m tidak boleh diinterpolasi seolah-olah presisi 10 m.
   *
   * Konsekuensi yang ditampilkan ke user: untuk index bercampur resolusi,
   * hasil dihitung pada grid 10 m dengan band 20 m di-downsample, sehingga
   * presisi sebenarnya mengikuti band terhalus yang di-downsample.
   */
  async function readCogBandsAligned(hrefs, bounds, rings, maxPx) {
    if (!Array.isArray(hrefs) || !hrefs.length) throw new Error('Tidak ada band yang diminta.');
    const projected = projectBounds(bounds);
    const openImage = async function (href) {
      const tiff = await window.GeoTIFF.fromUrl(href);
      return tiff.getImage();
    };

    const images = [];
    for (let i = 0; i < hrefs.length; i++) images.push(await openImage(hrefs[i]));

    // Band pertama jadi acuan ukuran keluaran.
    const baseImage = images[0];
    const baseWin = cogWindow(projected, baseImage, maxPx);
    const width = baseWin[2] - baseWin[0];
    const height = baseWin[3] - baseWin[1];
    if (width < 2 || height < 2) throw new Error('Jendela piksel terlalu kecil untuk dianalisis.');

    const rasters = [];
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      // Jendela dihitung ulang per citra: band 20 m punya indeks piksel
      // berbeda untuk area geografis yang sama.
      const win = i === 0 ? baseWin : cogWindow(projected, image, maxPx);
      const sameSize = (win[2] - win[0]) === width && (win[3] - win[1]) === height;
      const data = await image.readRasters(sameSize
        ? { window: win }
        : { window: win, width: width, height: height, resampleMethod: 'nearest' });
      if (!data || !data.length) throw new Error('COG tidak menghasilkan piksel.');
      rasters.push(data[0]);
    }

    // Validasi: kalau ada band yang tetap beda panjang, jangan diamkan.
    for (let i = 0; i < rasters.length; i++) {
      if (rasters[i].length !== width * height) {
        throw new Error('Band ' + (i + 1) + ' menghasilkan ' + rasters[i].length +
          ' piksel, seharusnya ' + (width * height) + '. Band beresolusi berbeda ' +
          'tidak bisa disamakan.');
      }
    }

    const bb = baseImage.getBoundingBox();
    const res = baseImage.getResolution();
    const geo = {
      minX: bb[0] + baseWin[0] * res[0],
      maxX: bb[0] + baseWin[2] * res[0],
      maxY: bb[3] - baseWin[1] * res[1],
      minY: bb[3] - baseWin[3] * res[1]
    };
    return {
      rasters: rasters,
      width: width,
      height: height,
      geo: geo,
      mask: rasterizeMask(projectRings(rings), { width: width, height: height, geo: geo })
    };
  }

  /* Rasio berurutan: band pertama dikurangi dari band kedua.
     (pakai) v[1] = plus, v[0] = minus. Semua normalized difference memakai ini. */
  function ndRatio(v) {
    return (v[1] - v[0]) / (v[1] + v[0]);
  }

  /** Nomor band Sentinel-2 -> nama asset STAC, mis. 8 -> "B08". */
  function trendAssetName(band) {
    return 'B' + String(band).padStart(2, '0');
  }

  /**
   * Ringkasan per Window COG: median + persentil, supaya awan tidak menggeser
   * garis tren. Dijaga sinkron dengan rumus indeks (spec.compute) sehingga
   * nilai tren dan nilai sesaat tidak mungkin berbeda.
   */
  function trendStatsFromPixels(values, range) {
    const lo = range && Number.isFinite(range[0]) ? range[0] : -1;
    const hi = range && Number.isFinite(range[1]) ? range[1] : 1;
    const list = [];
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      if (!Number.isFinite(value) || value < lo || value > hi) continue;
      list.push(value);
    }
    if (!list.length) return null;
    list.sort(function (a, b) { return a - b; });
    const count = list.length;
    const mid = count >> 1;
    const median = count % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
    const pick = function (ratio) {
      const index = Math.min(count - 1, Math.max(0, Math.round((count - 1) * ratio)));
      return list[index];
    };
    return { count: count, median: median, p10: pick(0.1), p90: pick(0.9) };
  }

  /**
   * Band + rumus untuk tiap indeks pada jalur tren STAC.
   *
   * PENTING: angka di `bands` di sini adalah nomor band SENTINEL-2 yang asli,
   * lalu diubah jadi nama asset lewat trendAssetName() ('12' -> 'B12'). Itu
   * BERBEDA dari `spec.bands` yang memakai urutan ArcGIS, di mana pos '12'
   * berarti B11. Untuk nomor <= 8 kebetulan sama, jadi kesalahannya mudah
   * terlewat -- NBR memakai '12,8' di sini (B12+B08) dan tidak punya
   * spec.bands sama sekali karena dihitung server lewat rasterFunction.
   *
   * Karena `bands`, `scale`, dan `compute` punya bentuk yang sama dengan spec
   * indeks, spec ini bisa langsung dipakai ulang oleh applyIndexFormula:
   * nilai tren dijamin identik dengan nilai sesaat.
   */
  const TREND_SPECS = {
    ndvi: { bands: '4,8', compute: ndRatio },
    ndmi: { bands: '11,8', compute: ndRatio },
    ndre: { bands: '5,8', compute: ndRatio },
    ndwi: { bands: '8,3', compute: ndRatio },
    evi: { bands: '8,4,2', scale: 0.0001, compute: eviCompute, range: [-2, 2] },
    msavi: { bands: '8,4', scale: 0.0001, compute: msaviCompute, range: [-2, 2] },
    nbr: { bands: '12,8', compute: ndRatio },
    ndvi705: { bands: '5,6', compute: ndRatio }
  };

  /**
   * Spec gabungan untuk mode mandiri: satu objek per index yang memuat
   * sekaligus bagian tampilan (dari ALL_INDEXES) dan bagian hitung
   * (dari TREND_SPECS).
   *
   * Kenapa butuh digabung:
   *   - ALL_INDEXES punya `table` (kelas warna untuk histogram), `label`,
   *     dan `hint`, tapi tidak punya `bands`/`compute` untuk index yang
   *     sebelumnya dihitung server lewat rasterFunction ArcGIS.
   *   - TREND_SPECS punya `bands`/`compute`/`scale`/`range`, tapi tidak punya
   *     `table` sama sekali.
   *
   * Tanpa penggabungan ini, statistik mode mandiri tidak punya bagian
   * rumusnya, dan indexBlockHtml() akan gagal karena selalu membaca spec.table.
   *
   * PENTING soal urutan band: TREND_SPECS memakai nomor band ESA asli
   * ('12' = B12) dengan urutan (minus, plus) untuk ndRatio. spec.bands di
   * jalur ArcGIS memakai urutan ArcGIS, di mana pos '12' berarti B11. Untuk
   * nomor <= 8 keduanya kebetulan sama, jadi selisihnya mudah terlewat --
   * karena itu COMPUTE_SPECS hanya boleh dibangun dari TREND_SPECS.
   */
  const COMPUTE_SPECS = (function () {
    const map = {};
    ALL_INDEXES.forEach(function (spec) {
      const trend = TREND_SPECS[spec.key];
      if (!trend) return;
      map[spec.key] = {
        key: spec.key,
        label: spec.label,
        hint: spec.hint,
        formula: spec.formula,
        table: spec.table,
        bands: trend.bands,
        compute: trend.compute,
        scale: trend.scale,
        range: trend.range
      };
    });
    /* NDVI tidak termasuk ALL_INDEXES: dulu hanya dihitung server lewat
       NDVI_RULE, jadi tidak pernah punya spec di daftar itu. Tapi TREND_SPECS
       sudah punya band dan rumusnya, dan mode mandiri wajib bisa menghitung
       NDVI -- itu justru pilihan bawaan. Jadi sisipkan di sini, bukan
        mengubah ALL_INDEXES, karena itu ikut mengubah jalur lama. */
    if (TREND_SPECS.ndvi) {
      map.ndvi = {
        key: 'ndvi',
        label: 'NDVI',
        hint: 'Seberapa hijau dan subur tumbuhan. Makin tinggi, makin banyak tumbuhan yang tumbuh baik.',
        formula: 'NDVI = (B08 \u2212 B04) / (B08 + B04)',
        table: NDVI_BANDS,
        bands: TREND_SPECS.ndvi.bands,
        compute: TREND_SPECS.ndvi.compute,
        scale: TREND_SPECS.ndvi.scale,
        range: TREND_SPECS.ndvi.range
      };
    }
    return map;
  })();

  /** Urutan tampilan index yang bisa dipilih, NDVI selalu di depan. */
  const PICK_ORDER = ['ndvi', 'ndmi', 'ndre', 'ndwi', 'evi', 'msavi', 'nbr', 'ndvi705'];
  const PICKABLE_KEYS = PICK_ORDER.filter(function (key) { return !!COMPUTE_SPECS[key]; });

  /** Cache piksel COG per (adegan, band, jendela) supaya ganti pilihan index
   *  tidak mengunduh ulang band yang sama. Dibatasi supaya tidak menahan
   *  RAM tanpa batas saat user berpindah polygon banyak. */
  const BAND_CACHE = new Map();
  const BAND_CACHE_MAX = 48;

  function bandCacheKey(sceneId, band, px) {
    return sceneId + '|' + band + '|' + px;
  }

  /**
   * Masker kelas SCL: 1 = piksel boleh dipakai, 0 = dibuang.
   *
   * Kelas SCL Sentinel-2 (kode pelihan ESA):
   *   0 no data, 1 saturated, 2 dark, 3 bayangan awan, 4 vegetasi,
   *   5 bukan vegetasi, 6 air, 7 unclassified, 8 awan sedang,
   *   9 awan tinggi, 10 cirrus tipis, 11 salju.
   *
   * Yang dibuang: 0, 1, 2, 3, 8, 9, 10, 11. Yang dipertahankan: 4, 5, 6, 7
   * (vegetasi, tanah, air, tak terklasifikasi) karena semuanya sah untuk
   * dihitungNDVI. Kelas yang tidak dikenal juga dibuang -- lebih aman
   * menyisakan sedikit piksel daripada menghitung dengan data tak dikenal.
   */
  const SCL_PAKAI = { 4: 1, 5: 1, 6: 1, 7: 1 };

  function sclClearMask(scl) {
    if (!scl || !scl.length) return null;
    const out = new Uint8Array(scl.length);
    for (let i = 0; i < scl.length; i++) {
      out[i] = SCL_PAKAI[scl[i]] ? 1 : 0;
    }
    return out;
  }

  /** Irisi dua mask: 1 hanya kalau keduanya 1. Panjang harus sama. */
  function gabungMask(a, b) {
    const n = Math.min(a.length, b.length);
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = (a[i] && b[i]) ? 1 : 0;
    return out;
  }

  /**
   * Hitung statistik yang tahan awan untuk satu indeks pada satu adegan.
   *
   * Kenapa median: tanpa SCL, piksel awan tidak bisa dibedakan dari tani
   * karena nilainya sah secara matematis -- awan menghasilkan NDVI sekitar
   * 0 sampai 0,2, masih di dalam rentang [-1, 1], jadi filter rentang di
   * computeStats() tidak akan menolaknya. Akibatnya rerata terseret ke
   * bawah. Median tidak terlalu tergeser oleh sebagian kecil piksel
   * ekstrem, dan teknik yang sama sudah dipakai trendStatsFromPixels() untuk
   * menjaga garis tren agar tidak bergeser gara-gara awan.
   *
   * Piksel di luar polygon diganti NaN supaya tidak ikut terhitung; fungsi
   * yang dipakai sudah melewati nilai tak hingga.
   */
  function robustStatsInMask(values, mask, range) {
    const total = Math.min(values.length, mask.length);
    const masked = new Float64Array(total);
    for (let i = 0; i < total; i++) {
      masked[i] = mask[i] ? values[i] : NaN;
    }
    return trendStatsFromPixels(masked, range);
  }

  /**
   * Mode mandiri: hitung index yang dipilih user dari satu adegan tertentu.
   *
   * Berbeda dari computeIndexFor() yang memakai ArcGIS exportImage: di sini
   * tanggal benar-benar dihormati karena adegan datang dari pencarian STAC
   * beserta asset-nya, dan band dibaca langsung dari COG. Hasil ditulis ke
   * field yang sama (item[key]) supaya seluruh lapisan tampilan yang sudah
   * ada tidak perlu diubah.
   *
   * Satu index gagal tidak menghentikan index lain; pesan errornya disimpan
   * per index, sama seperti runSpectral() yang sudah ada.
   */
  async function runIndexOnScene(item, keys, onStatus) {
    const scene = item.scene;
    if (!scene || !scene.assets) {
      throw new Error('Pilih adegan citra terlebih dahulu.');
    }
    const daftar = (keys && keys.length) ? keys : PICKABLE_KEYS;
    const done = [];
    const gagal = [];

    for (let i = 0; i < daftar.length; i++) {
      const key = daftar[i];
      const spec = COMPUTE_SPECS[key];
      if (!spec) continue;
      if (onStatus) onStatus('Menghitung ' + spec.label + ' dari citra ' + scene.date + '...');
      try {
        const bandNames = String(spec.bands).split(',').map(function (b) {
          return trendAssetName(b.trim());
        });
        const hrefs = [];
        for (let b = 0; b < bandNames.length; b++) {
          const asset = scene.assets[bandNames[b]];
          if (!asset || !asset.href) {
            throw new Error('Adegan ' + scene.date + ' tidak menyediakan band ' + bandNames[b] + '.');
          }
          const keyCache = bandCacheKey(scene.id || scene.date, bandNames[b], item.pixelCap);
          let href = BAND_CACHE.get(keyCache);
          if (!href) {
            href = await signCogUrl(asset.href);
            if (BAND_CACHE.size >= BAND_CACHE_MAX) {
              BAND_CACHE.delete(BAND_CACHE.keys().next().value);
            }
            BAND_CACHE.set(keyCache, href);
          }
          hrefs.push(href);
        }

        /* SCL (Scene Classification) dibaca DULUAN kalau masking diaktifkan,
           karena SCL beresolusi 20 m sementara band 10 m. Dengan SCL jadi
           band pertama, readCogBandsAligned() akan memakai grid SCL sebagai
           acuan dan menurunkan semua band ke 20 m -- itu memang konsekuensi
           yang sudah dinyatakan di UI, dan satu-satunya cara kedua band
           resolutions bisa dibandingkan pixel per pixel. */
        let useScl = false;
        if (item.sclMask) {
          const assetScl = scene.assets.SCL;
          if (!assetScl || !assetScl.href) {
            throw new Error('Adegan ini tidak menyediakan band SCL untuk masking awan.');
          }
          hrefs.unshift(await signCogUrl(assetScl.href));
          useScl = true;
        }

        const read = await readCogBandsAligned(hrefs, item.bounds, item.rings, item.pixelCap);
        let mask = read.mask;
        if (useScl) {
          const clear = sclClearMask(read.rasters[0]);
          if (!clear) {
            throw new Error('Band SCL tidak terbaca, masking awan tidak bisa dipakai.');
          }
          mask = gabungMask(read.mask, clear);
        }

        const values = applyIndexFormula(useScl ? read.rasters.slice(1) : read.rasters, spec);
        const stats = computeStats(values, mask, spec.table, spec.range);
        if (!stats.count) {
          throw new Error('Tidak ada piksel ' + spec.label +
            ' valid di dalam polygon' + (useScl ? ' setelah awan dibuang.' : '.'));
        }
        const robust = robustStatsInMask(values, mask, spec.range);
        stats.median = robust ? robust.median : NaN;
        stats.p10 = robust ? robust.p10 : NaN;
        stats.p90 = robust ? robust.p90 : NaN;
        stats.resolution = read.width + 'x' + read.height + (useScl ? ' (SCL 20 m)' : '');
        stats.sceneDate = scene.date;
        stats.sceneCloud = scene.cloud;

        item[key] = stats;
        item[key + 'Error'] = null;
        done.push(key);

        // NDVI juga digambar di peta, seperti pada jalur otomatis.
        if (key === 'ndvi') {
          try {
            const canvas = renderNdviCanvas(values, read.mask, read.width, read.height);
            showOverlay(canvas.toDataURL('image/png'), { geo: read.geo }, item);
          } catch (error) {
            console.warn('[GeoFarm] Gagal menggambar layer NDVI:', error);
          }
        }
      } catch (error) {
        item[key] = null;
        item[key + 'Error'] = error && error.message
          ? error.message
          : 'Gagal menghitung ' + spec.label + '.';
        gagal.push(key);
      }
    }
    return { done: done, gagal: gagal };
  }

  async function loadTrendPoint(item, period, spec) {
    const scene = await stacBestScene(item.bounds, period);
    if (!scene) return null;
    const numbers = spec.bands.split(',');
    const assets = numbers.map(function (band) {
      const name = trendAssetName(band);
      if (!scene.assets[name]) {
        throw new Error('Adegan ini tidak memiliki band ' + name + '.');
      }
      return name;
    });
    const rasters = [];
    for (let i = 0; i < assets.length; i++) {
      rasters.push(await readCogWindow(await signCogUrl(scene.assets[assets[i]].href), item.bounds));
    }
    const stats = trendStatsFromPixels(applyIndexFormula(rasters, spec), spec.range);
    if (!stats) return null;
    return {
      label: period.label,
      mean: stats.median,
      min: stats.p10,
      max: stats.p90,
      pixels: stats.count,
      cloud: Number.isFinite(scene.cloud) ? scene.cloud : NaN,
      cloudy: !!scene.cloudy,
      date: String(scene.datetime || '').slice(0, 10)
    };
  }

  // Jaringan sesekali gagal; coba ulang sebelum periode ditandai kosong.
  // `cacheTag` wajib ikut di kunci cache: tiap indeks memakai adegan dan band
  // berbeda, jadi NDMI dan NDRE tidak boleh berbagi hasil.
  async function fetchTrendPoint(item, period, spec, cacheTag) {
    const key = item.id + '|' + cacheTag + '|' + period.key + '|' + TREND_SAMPLE_PX;
    if (trendCache.has(key)) return trendCache.get(key);
    for (let attempt = 1; attempt <= TREND_ATTEMPTS; attempt++) {
      try {
        const point = await loadTrendPoint(item, period, spec);
        const value = point || { label: period.label, mean: NaN, min: NaN, max: NaN, pixels: 0, cloud: NaN, date: '' };
        trendCache.set(key, value);
        return value;
      } catch (error) {
        if (attempt >= TREND_ATTEMPTS) {
          return { label: period.label, mean: NaN, min: NaN, max: NaN, pixels: 0, cloud: NaN, date: '' };
        }
        await waitMs(TREND_RETRY_MS * attempt);
      }
    }
  }

  async function runIndexTrend(item, onStatus, months, spec) {
    const periods = trendPeriods(months);
    const trendSpec = TREND_SPECS[spec.key];
    if (!trendSpec) throw new Error('Tren ' + spec.label + ' belum didukung.');
    const points = new Array(periods.length);
    let cursor = 0;
    let done = 0;

    async function worker() {
      for (;;) {
        const index = cursor++;
        if (index >= periods.length) return;
        if (typeof onStatus === 'function') {
          onStatus('Mengambil adegan ' + (index + 1) + '/' + periods.length + ': ' + periods[index].label + '…');
        }
        points[index] = await fetchTrendPoint(item, periods[index], trendSpec, spec.key);
        done++;
        if (typeof onStatus === 'function') {
          onStatus('Memproses ' + done + '/' + periods.length + ' selesai…');
        }
      }
    }

    const workers = [];
    const batch = Math.min(TREND_CONCURRENCY, periods.length);
    for (let i = 0; i < batch; i++) workers.push(worker());
    await Promise.all(workers);

    const valid = points.filter(function (p) { return p && Number.isFinite(p.mean); });
    if (!valid.length) {
      throw new Error('Tidak ada adegan Sentinel-2 untuk periode ini. Coba lagi nanti.');
    }

    const means = valid.map(function (p) { return p.mean; });
    const sum = means.reduce(function (total, value) { return total + value; }, 0);
    const sortedMeans = means.slice().sort(function (a, b) { return a - b; });
    const midIndex = sortedMeans.length >> 1;
    const median = sortedMeans.length % 2
      ? sortedMeans[midIndex]
      : (sortedMeans[midIndex - 1] + sortedMeans[midIndex]) / 2;
    const clouds = valid.filter(function (p) { return Number.isFinite(p.cloud); }).map(function (p) { return p.cloud; });
    const first = valid[0];
    const last = valid[valid.length - 1];
    const best = valid.reduce(function (top, p) { return p.mean > top.mean ? p : top; }, valid[0]);
    const worst = valid.reduce(function (low, p) { return p.mean < low.mean ? p : low; }, valid[0]);

    return {
      // uid dipakai sebagai id gradien SVG di dalam kartu, jadi wajib unik
      // per indeks: tanpa ini empat grafik di satu kartu saling menimpa
      // referensi gradiennya dan garisnya tampil salah warna.
      uid: 't' + item.id + '-' + spec.key + '-' + months,
      key: spec.key,
      label: spec.label,
      months: months,
      points: points,
      validCount: valid.length,
      gaps: periods.length - valid.length,
      avg: sum / means.length,
      median: median,
      delta: last.mean - first.mean,
      best: { label: best.label, mean: best.mean },
      worst: { label: worst.label, mean: worst.mean },
      from: first.label,
      to: last.label,
      cloudyCount: valid.filter(function (p) { return p.cloudy; }).length,
      cloudAvg: clouds.length ? clouds.reduce(function (total, value) { return total + value; }, 0) / clouds.length : NaN,
      sample: TREND_SAMPLE_PX + '×' + TREND_SAMPLE_PX
    };
  }

  function trendSummaryHtml(trend) {
    const delta = trend.delta;
    const deltaClass = delta >= 0 ? 'naik' : 'turun';
    const arrow = delta >= 0 ? '▲' : '▼';
    return '<div class="pa-trend-sum">' +
      '<div class="pa-trend-stat"><span>Median</span><b>' + fmt(trend.median, 3) + '</b></div>' +
      '<div class="pa-trend-stat"><span>' + escapeHtml(trend.from) + ' → ' + escapeHtml(trend.to) + '</span>' +
        '<b class="' + deltaClass + '">' + arrow + ' ' + fmt(Math.abs(delta), 3) + '</b></div>' +
      '<div class="pa-trend-stat"><span>Tertinggi · ' + escapeHtml(trend.best.label) + '</span><b>' + fmt(trend.best.mean, 3) + '</b></div>' +
      '<div class="pa-trend-stat"><span>Terendah · ' + escapeHtml(trend.worst.label) + '</span><b>' + fmt(trend.worst.mean, 3) + '</b></div>' +
      '</div>';
  }

  function trendColor(key) {
    if (key === 'ndmi') return '#0ea5e9';
    if (key === 'ndre') return '#16a34a';
    if (key === 'ndwi') return '#2563eb';
    return '#22c55e';
  }

  function trendChartSvg(trend) {
    const plotW = CHART_W - CHART_PAD.left - CHART_PAD.right;
    const plotH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;
    const points = trend.points;
    const valid = points.filter(function (p) { return Number.isFinite(p.mean); });

    // Sumbu Y mengikuti data (dengan sentuh nol) supaya variasi Seasonal terlihat.
    let lo = Infinity;
    let hi = -Infinity;
    valid.forEach(function (p) {
      lo = Math.min(lo, p.min, p.mean);
      hi = Math.max(hi, p.max, p.mean);
    });
    if (!valid.length) { lo = 0; hi = 1; }
    const pad = Math.max(0.05, (hi - lo) * 0.22);
    lo = Math.max(-1, lo - pad);
    hi = Math.min(1, hi + pad);
    if (lo > 0) lo = 0;
    if (hi - lo < 0.1) hi = Math.min(1, lo + 0.1);
    const span = hi - lo || 1;

    const x = function (i) {
      return CHART_PAD.left + (points.length > 1 ? (i * plotW) / (points.length - 1) : plotW / 2);
    };
    const y = function (value) {
      return CHART_PAD.top + (1 - (value - lo) / span) * plotH;
    };

    const parts = [];
    parts.push('<defs><linearGradient id="paTrendFill' + trend.uid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + trendColor(trend.key) + '" stop-opacity=".34"/>' +
      '<stop offset="100%" stop-color="' + trendColor(trend.key) + '" stop-opacity="0"/></linearGradient></defs>');

    [lo, (lo + hi) / 2, hi].forEach(function (tick) {
      parts.push('<line class="pa-trend-grid" x1="' + CHART_PAD.left + '" y1="' + y(tick).toFixed(1) +
        '" x2="' + (CHART_PAD.left + plotW) + '" y2="' + y(tick).toFixed(1) + '"/>');
      parts.push('<text class="pa-trend-axis" x="' + (CHART_PAD.left - 5) + '" y="' + (y(tick) + 3).toFixed(1) +
        '" text-anchor="end">' + fmt(tick, 2) + '</text>');
    });
    if (lo <= 0 && hi >= 0) {
      parts.push('<line class="pa-trend-zero" x1="' + CHART_PAD.left + '" y1="' + y(0).toFixed(1) +
        '" x2="' + (CHART_PAD.left + plotW) + '" y2="' + y(0).toFixed(1) + '"/>');
    }

    // Rentang p10–p90 tiap periode.
    let band = '';
    points.forEach(function (p, i) {
      if (!Number.isFinite(p.mean)) return;
      const xTop = x(i).toFixed(1);
      band += 'M' + xTop + ' ' + y(p.max).toFixed(1) +
        'L' + xTop + ' ' + y(p.min).toFixed(1) + ' ';
    });
    if (band) parts.push('<path class="pa-trend-band" d="' + band + '"/>');

    if (valid.length) {
      const line = valid.map(function (p, i) { return (i ? 'L' : 'M') + x(points.indexOf(p)).toFixed(1) + ' ' + y(p.mean).toFixed(1); }).join(' ');
      const lastIndex = points.indexOf(valid[valid.length - 1]);
      const firstIndex = points.indexOf(valid[0]);
      parts.push('<path class="pa-trend-area" d="' + line + ' L' + x(lastIndex).toFixed(1) + ' ' + y(lo).toFixed(1) +
        ' L' + x(firstIndex).toFixed(1) + ' ' + y(lo).toFixed(1) + ' Z" fill="url(#paTrendFill' + trend.uid + ')"/>');
      parts.push('<path class="pa-trend-line" d="' + line + '"/>');
    }

    // Label bulan diberi jarak agar tidak bertabrakan pada jumlah periode berbeda.
    const labelStep = points.length <= 7 ? 1 : points.length <= 12 ? 2 : 3;
    points.forEach(function (p, i) {
      if (!Number.isFinite(p.mean)) return;
      const cloud = Number.isFinite(p.cloud) ? ' · awan ' + fmt(p.cloud, 0) + '%' : '';
      const flag = p.cloudy ? ' (awan tinggi)' : '';
      const date = p.date ? ' (' + p.date + ')' : '';
      parts.push('<circle class="pa-trend-dot' + (p.cloudy ? ' pa-trend-dot-cloudy' : '') + '" cx="' + x(i).toFixed(1) +
        '" cy="' + y(p.mean).toFixed(1) + '" r="2.6"><title>' + escapeHtml(p.label + date) + ' · ' + escapeHtml(trend.label) + ' median ' +
        fmt(p.mean, 3) + cloud + flag + ' (p10 ' + fmt(p.min, 2) + ' / p90 ' + fmt(p.max, 2) + ')</title></circle>');
      if (i === 0 || i === points.length - 1 || i % labelStep === 0) {
        parts.push('<text class="pa-trend-x" x="' + x(i).toFixed(1) + '" y="' + (CHART_H - 6) +
          '" text-anchor="middle">' + escapeHtml(p.label) + '</text>');
      }
    });

    return '<svg class="pa-trend-svg" viewBox="0 0 ' + CHART_W + ' ' + CHART_H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Grafik tren bulanan ' + escapeHtml(trend.label) + '">' +
      parts.join('') + '</svg>';
  }

  // Muat pertama 6 periode; klik berikutnya menambah 6 periode (cache dipakai).
  function trendButtonLabel(item, spec) {
    const trend = spec ? item[spec.trendKey] : item.ndviTrend;
    const label = spec ? spec.label : 'NDVI';
    if (!trend) return 'Grafik tren ' + label;
    if (trend.months < TREND_MAX_MONTHS) return 'Tambah ' + TREND_STEP_MONTHS + ' bulan';
    return 'Muat ulang tren';
  }

  function trendBlockHtml(item, spec) {
    const trend = spec ? item[spec.trendKey] : item.ndviTrend;
    if (!trend) return '';
    const name = trend.label || 'NDVI';
    const gapNote = trend.gaps ? ' · ' + trend.gaps + ' bln kosong' : '';
    const cloudNote = Number.isFinite(trend.cloudAvg) ? ' · awan ' + fmt(trend.cloudAvg, 0) + '%' : '';
    const cloudyNote = trend.cloudyCount ? ' · ' + trend.cloudyCount + ' berawan' : '';
    return '<div class="pa-block pa-trend">' +
      '<div class="pa-trend-head">' +
        '<span class="pa-trend-title">Tren ' + escapeHtml(name) + ' ' + trend.validCount + ' periode</span>' +
        '<span class="pa-trend-meta">S2 L2A · sampel ' + escapeHtml(trend.sample) + escapeHtml(cloudNote + cloudyNote + gapNote) + '</span>' +
      '</div>' +
      trendChartSvg(trend) +
      '<div class="pa-trend-legend"><span class="pa-trend-key"></span>Median ' + escapeHtml(name) +
        '<span class="pa-trend-key-band"></span>p10–p90<span class="pa-trend-key-cloudy"></span>awan tinggi</div>' +
      trendSummaryHtml(trend) +
      '<div class="pa-trend-note">Median dari ' + trend.sample + ' piksel sampel per adegan (bukan zonal penuh).</div>' +
      '</div>';
  }

  /* ── Awan (manual, sesuai permintaan) ── */

  async function runCloud(item, onStatus) {
    if (typeof window.fetchNdviCloudInfo !== 'function') return;
    onStatus('Mengambil metadata awan...');
    const info = await window.fetchNdviCloudInfo([
      item.bounds.west, item.bounds.south, item.bounds.east, item.bounds.north
    ]);
    item.cloudError = null;
    item.cloud = info;
  }

  /* ── Topografi ── */

  async function runTerrain(item, onStatus) {
    if (typeof window.runDemAnalysisForPolygon !== 'function') {
      throw new Error('Modul analisis DEM belum termuat.');
    }
    const results = await window.runDemAnalysisForPolygon(
      item.rings,
      { name: 'Polygon ' + item.index, level: 'polygon', kode: null },
      // progressCb modul DEM kirim (persen, pesan); teruskan pesannya ke sidebar.
      function (percent, message) {
        onStatus(message || ('Memproses ' + Math.round(Number(percent) || 0) + '%'));
      },
      { skipOverlay: true }
    );
    item.terrain = results;
    item.pointCount = results.pointCount || 0;
    return results;
  }

  function toggleTerrainOverlay(item) {
    if (!item.terrain) return;
    if (typeof window.clearDemOverlay === 'function') window.clearDemOverlay();
    if (typeof window.createElevationOverlay === 'function') {
      window.createElevationOverlay(item.terrain.elevData, item.terrain);
    }
    state.terrainOwner = item.id;
  }

  /* ── Kelembapan tanah (NOAA SOIL_monthly) ── */

  const SOIL_URL = 'https://gis.nnvl.noaa.gov/arcgis/rest/services/SOIL/SOIL_monthly/ImageServer/exportImage';
  const SOIL_META_URL = 'https://gis.nnvl.noaa.gov/arcgis/rest/services/SOIL/SOIL_monthly/ImageServer';
  const SOIL_WEEKLY_URL = 'https://gis.nnvl.noaa.gov/arcgis/rest/services/SOIL/SOIL_weekly/ImageServer/exportImage';
  const SOIL_WEEKLY_META_URL = 'https://gis.nnvl.noaa.gov/arcgis/rest/services/SOIL/SOIL_weekly/ImageServer';
  const SOIL_YEARLY_URL = 'https://gis.nnvl.noaa.gov/arcgis/rest/services/SOIL/SOIL_yearly/ImageServer/exportImage';
  const SOIL_YEARLY_META_URL = 'https://gis.nnvl.noaa.gov/arcgis/rest/services/SOIL/SOIL_yearly/ImageServer';
  const SOIL_BANDS = 4;
  const SOIL_HIST_BINS = [
    { label: 'Sangat kering', min: 0, max: 26, rgb: [165, 0, 38] },
    { label: 'Kering', min: 26, max: 51, rgb: [215, 48, 39] },
    { label: 'Agak kering', min: 51, max: 76, rgb: [244, 109, 67] },
    { label: 'Normal', min: 76, max: 102, rgb: [254, 174, 97] },
    { label: 'Agak basah', min: 102, max: 127, rgb: [254, 224, 144] },
    { label: 'Basah', min: 127, max: 153, rgb: [224, 243, 248] },
    { label: 'Sangat basah', min: 153, max: 178, rgb: [171, 217, 233] },
    { label: 'Jenuh', min: 178, max: 256, rgb: [116, 173, 209] }
  ];

  /* SoilGrids WCS: median surface predictions sampled and masked to a drawn
     polygon. The existing SoilGrids WMS layers are visual overlays only. */
  const SOILGRIDS_WCS_BASE = 'https://maps.isric.org/mapserv';
  const SOILGRIDS_CRS_4326 = 'http://www.opengis.net/def/crs/EPSG/0/4326';
  const SOILGRIDS_PROPERTIES = [
    { key: 'phh2o', label: 'pH tanah (H₂O)', unit: 'pH', factor: 10 },
    { key: 'soc', label: 'Karbon organik tanah', unit: 'g/kg', factor: 10 },
    { key: 'nitrogen', label: 'Nitrogen total', unit: 'g/kg', factor: 100 },
    { key: 'clay', label: 'Liat', unit: '%', factor: 10 },
    { key: 'sand', label: 'Pasir', unit: '%', factor: 10 },
    { key: 'silt', label: 'Debu', unit: '%', factor: 10 },
    { key: 'cec', label: 'Kapasitas tukar kation (CEC)', unit: 'cmol(+)/kg', factor: 10 },
    { key: 'bdod', label: 'Bulk density', unit: 'kg/dm³', factor: 100 },
    { key: 'cfvo', label: 'Fragmen kasar', unit: '%', factor: 10 },
    { key: 'wv0010', label: 'Kadar air pada 10 kPa', unit: '% vol.', factor: 10 },
    { key: 'wv0033', label: 'Kadar air pada 33 kPa', unit: '% vol.', factor: 10 },
    { key: 'wv1500', label: 'Kadar air pada 1500 kPa', unit: '% vol.', factor: 10 }
  ];

  function soilGridsCoverageUrl(property, bounds) {
    const params = new URLSearchParams({
      map: '/map/' + property.key + '.map',
      SERVICE: 'WCS', VERSION: '2.0.1', REQUEST: 'GetCoverage',
      COVERAGEID: property.key + '_0-5cm_Q0.5',
      FORMAT: 'GEOTIFF_INT16',
      SUBSETTINGCRS: SOILGRIDS_CRS_4326,
      OUTPUTCRS: SOILGRIDS_CRS_4326
    });
    params.append('SUBSET', 'X(' + bounds.west + ',' + bounds.east + ')');
    params.append('SUBSET', 'Y(' + bounds.south + ',' + bounds.north + ')');
    return SOILGRIDS_WCS_BASE + '?' + params.toString();
  }

  async function fetchSoilGridsRaster(url) {
    if (typeof window.geoidFetchWithProxy === 'function') {
      return window.geoidFetchWithProxy(url, FETCH_TIMEOUT);
    }
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function runSoilGrids(item, onStatus) {
    if (!window.GeoTIFF || typeof window.GeoTIFF.fromBlob !== 'function') {
      throw new Error('Library GeoTIFF belum termuat.');
    }
    const results = [];
    let insideCount = 0;
    for (let p = 0; p < SOILGRIDS_PROPERTIES.length; p++) {
      const property = SOILGRIDS_PROPERTIES[p];
      onStatus('SoilGrids ' + (p + 1) + '/' + SOILGRIDS_PROPERTIES.length + ' · ' + property.label + '…');
      try {
      const url = soilGridsCoverageUrl(property, item.bounds);
      const response = await fetchSoilGridsRaster(url);
      if (!response.ok) throw new Error(property.label + ': HTTP ' + response.status);
      const blob = await response.blob();
      if (!blob.size) throw new Error(property.label + ': raster kosong.');
      const tiff = await window.GeoTIFF.fromBlob(blob);
      const image = await tiff.getImage();
      const rasters = await image.readRasters();
      if (!rasters || !rasters.length) throw new Error(property.label + ': raster tidak berisi band.');
      const width = image.getWidth();
      const height = image.getHeight();
      const bbox = image.getBoundingBox();
      const geo = Array.isArray(bbox) && bbox.length === 4 && Number.isFinite(bbox[0]) && Number.isFinite(bbox[2]) && bbox[2] > bbox[0]
        ? { minX: bbox[0], minY: bbox[1], maxX: bbox[2], maxY: bbox[3] }
        : { minX: item.bounds.west, minY: item.bounds.south, maxX: item.bounds.east, maxY: item.bounds.north };
      const mask = rasterizeMask(item.rings, { width: width, height: height, geo: geo });
      const values = [];
      const rasterValues = rasters[0];
      const noData = typeof image.getGDALNoData === 'function' ? image.getGDALNoData() : null;
      let inside = 0;
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i]) continue;
        inside++;
        const raw = Number(rasterValues[i]);
        if (!Number.isFinite(raw) || (noData !== null && raw === noData) || raw <= -32000) continue;
        values.push(raw / property.factor);
      }
      insideCount = Math.max(insideCount, inside);
      if (!values.length) {
        results.push({ property: property, count: 0, mean: NaN, min: NaN, max: NaN, p10: NaN, median: NaN, p90: NaN });
        continue;
      }
      values.sort(function (a, b) { return a - b; });
      const sum = values.reduce(function (total, value) { return total + value; }, 0);
      results.push({
        property: property, count: values.length, mean: sum / values.length,
        min: values[0], max: values[values.length - 1],
        p10: soilPercentile(values, 10), median: soilPercentile(values, 50), p90: soilPercentile(values, 90)
      });
      } catch (error) {
        results.push({ property: property, count: 0, error: error && error.message ? error.message : 'Layanan tidak tersedia.' });
      }
    }
    if (!results.some(function (row) { return row.count; })) {
      const failure = results.filter(function (row) { return row.error; })[0];
      throw new Error(failure
        ? 'Layanan SoilGrids gagal (' + failure.property.label + '): ' + failure.error
        : 'Tidak ada piksel SoilGrids valid di dalam polygon. Coba polygon yang lebih luas.');
    }
    item.soilGrids = { results: results, inside: insideCount, size: '±250 m/piksel', depth: '0–5 cm', quantile: 'Q0.50' };
    return item.soilGrids;
  }

  function soilGridsBlockHtml(item) {
    if (item.soilGridsError) return '<div class="pa-block pa-block-error">' + escapeHtml(item.soilGridsError) + '</div>';
    if (!item.soilGrids) return '<div class="pa-block pa-block-muted">Belum ada hasil SoilGrids. Nilai akan dihitung untuk piksel yang masuk ke polygon.</div>';
    const rows = item.soilGrids.results.map(function (row) {
      if (row.error) return '<tr><th>' + escapeHtml(row.property.label) + '</th><td colspan="4">Gagal mengambil data: ' + escapeHtml(row.error) + '</td></tr>';
      if (!row.count) return '<tr><th>' + escapeHtml(row.property.label) + '</th><td colspan="4">Tidak ada piksel valid</td></tr>';
      return '<tr><th>' + escapeHtml(row.property.label) + '</th><td>' + fmt(row.mean, 2) + ' ' + escapeHtml(row.property.unit) + '</td><td>' + fmt(row.min, 2) + '–' + fmt(row.max, 2) + '</td><td>' + fmt(row.p10, 2) + ' / ' + fmt(row.median, 2) + ' / ' + fmt(row.p90, 2) + '</td><td>' + row.count.toLocaleString('id-ID') + '</td></tr>';
    }).join('');
    return '<div class="pa-sg-table-wrap"><table class="pa-sg-table"><thead><tr><th>Parameter</th><th>Rata-rata</th><th>Rentang</th><th>Sebaran piksel P10 / median / P90</th><th>Piksel</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="pa-meta">Prediksi median ' + escapeHtml(item.soilGrids.quantile) + ' · kedalaman ' + escapeHtml(item.soilGrids.depth) + ' · resolusi sumber ' + escapeHtml(item.soilGrids.size) + ' · ' + item.soilGrids.inside.toLocaleString('id-ID') + ' piksel di dalam polygon.</div>';
  }

  function soilGridsCaveatHtml() {
    return '<div class="pa-sg-caveat"><b>Interpretasi &amp; keterbatasan</b><br>' +
      'SoilGrids adalah prediksi model global berbasis profil tanah dan covariate lingkungan, bukan hasil uji laboratorium di petak ini. Resolusi 250 m membuat piksel dapat mencampur kondisi beberapa lahan; polygon kecil bisa hanya mencakup sedikit piksel. Kedalaman properti di sini 0–5 cm, sehingga tidak mewakili seluruh zona akar. Laporan memakai median prediksi Q0.50; P10/P90 di tabel menunjukkan sebaran piksel di polygon, bukan interval ketidakpastian model. Akurasi berbeda menurut properti dan wilayah; gunakan sebagai screening awal, lalu validasi dengan sampel tanah setempat. ' +
      '<a href="https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_01.html" target="_blank" rel="noopener noreferrer">Metode &amp; akurasi ISRIC</a> · ' +
      '<a href="https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs_04.html" target="_blank" rel="noopener noreferrer">Batas penggunaan lokal</a></div>';
  }

  function soilFindBin(value) {
    for (let i = 0; i < SOIL_HIST_BINS.length; i++) {
      if (value >= SOIL_HIST_BINS[i].min && value < SOIL_HIST_BINS[i].max) return SOIL_HIST_BINS[i];
    }
    return SOIL_HIST_BINS[SOIL_HIST_BINS.length - 1];
  }

  function soilPercentile(sorted, p) {
    if (!sorted.length) return NaN;
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  async function fetchSoilMetadata() {
    try {
      const resp = await fetch(SOIL_META_URL + '?f=json');
      if (!resp.ok) return null;
      const data = await resp.json();
      return {
        name: data.name || 'SOIL/SOIL_monthly',
        description: data.description || '',
        bandCount: data.bandCount || 4,
        bandNames: data.bandNames || [],
        pixelType: data.pixelType || 'U8',
        timeExtent: data.timeInfo && data.timeInfo.timeExtent
          ? { start: new Date(data.timeInfo.timeExtent[0]).toISOString().slice(0, 10), end: new Date(data.timeInfo.timeExtent[1]).toISOString().slice(0, 10) }
          : null,
        minPixelSize: data.minPixelSize || 0,
        maxPixelSize: data.maxPixelSize || 0,
        meanPixelSize: data.meanPixelSize || 0,
        copyright: data.copyrightText || '',
        capabilities: data.capabilities || ''
      };
    } catch (e) {
      return null;
    }
  }

  async function runSoilMoisture(item, onStatus) {
    onStatus('Mengambil metadata SOIL...');
    const meta = await fetchSoilMetadata();

    onStatus('Mengunduh raster kelembapan tanah...');
    const size = pickSize(item.bounds);
    const params = new URLSearchParams({
      bbox: [item.bounds.west, item.bounds.south, item.bounds.east, item.bounds.north].map(function (v) { return v.toFixed(7); }).join(','),
      bboxSR: '4326',
      imageSR: '4326',
      size: size.w + ',' + size.h,
      format: 'tiff',
      f: 'image'
    });
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT);
    let blob;
    try {
      const resp = await fetch(SOIL_URL + '?' + params.toString(), { signal: controller.signal });
      if (!resp.ok) throw new Error('Server SOIL menolak permintaan (HTTP ' + resp.status + ')');
      blob = await resp.blob();
    } finally {
      clearTimeout(timer);
    }

    onStatus('Membaca piksel SOIL...');
    if (!window.GeoTIFF || typeof window.GeoTIFF.fromBlob !== 'function') {
      throw new Error('Library geotiff.js belum termuat.');
    }
    const tiff = await window.GeoTIFF.fromBlob(blob);
    const image = await tiff.getImage();
    const rasters = await image.readRasters();
    if (!rasters || !rasters.length) throw new Error('Raster SOIL kosong.');

    const width = image.getWidth();
    const height = image.getHeight();
    const bb = image.getBoundingBox();
    const geo = Array.isArray(bb) && bb.length === 4 && Number.isFinite(bb[0]) && Number.isFinite(bb[2]) && bb[2] > bb[0]
      ? { minX: bb[0], minY: bb[1], maxX: bb[2], maxY: bb[3] }
      : { minX: item.bounds.west, minY: item.bounds.south, maxX: item.bounds.east, maxY: item.bounds.north };

    const mask = rasterizeMask(item.rings, { width: width, height: height, geo: geo });
    const bandStats = [];
    let totalInside = 0;
    for (let b = 0; b < rasters.length && b < SOIL_BANDS; b++) {
      const vals = rasters[b];
      const collected = [];
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i]) continue;
        if (b === 0) totalInside++;
        const v = vals[i];
        if (!Number.isFinite(v) || v === 0) continue;
        collected.push(v);
      }
      if (!collected.length) {
        bandStats.push({ band: 'Band_' + (b + 1), count: 0, mean: NaN, min: NaN, max: NaN, p10: NaN, p25: NaN, median: NaN, p75: NaN, p90: NaN, stddev: NaN, hist: SOIL_HIST_BINS.map(function () { return 0; }) });
        continue;
      }
      collected.sort(function (a, b) { return a - b; });
      const count = collected.length;
      const sum = collected.reduce(function (a, v) { return a + v; }, 0);
      const mean = sum / count;
      const variance = collected.reduce(function (a, v) { return a + (v - mean) * (v - mean); }, 0) / count;
      const stddev = Math.sqrt(variance);
      const hist = SOIL_HIST_BINS.map(function () { return 0; });
      for (let i = 0; i < collected.length; i++) {
        const bin = soilFindBin(collected[i]);
        for (let h = 0; h < SOIL_HIST_BINS.length; h++) {
          if (SOIL_HIST_BINS[h] === bin) { hist[h]++; break; }
        }
      }
      bandStats.push({
        band: 'Band_' + (b + 1),
        count: count,
        mean: mean,
        min: collected[0],
        max: collected[count - 1],
        p10: soilPercentile(collected, 10),
        p25: soilPercentile(collected, 25),
        median: soilPercentile(collected, 50),
        p75: soilPercentile(collected, 75),
        p90: soilPercentile(collected, 90),
        stddev: stddev,
        hist: hist
      });
    }

    if (!bandStats.length || !totalInside) {
      throw new Error('Tidak ada piksel SOIL valid di dalam polygon.');
    }

    item.soil = { bands: bandStats, inside: totalInside, size: size.w + '×' + size.h, meta: meta };
    return item.soil;
  }

  function soilChartSvg(item) {
    const bands = item.soil.bands;
    if (!bands || !bands.length) return '';
    const W = 288, H = 110, pad = { top: 10, right: 8, bottom: 22, left: 30 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;
    const maxVal = 255;
    const barW = Math.min(40, (chartW / bands.length) * 0.55);
    const gap = chartW / bands.length;
    let bars = '';
    bands.forEach(function (s, i) {
      const x = pad.left + gap * i + (gap - barW) / 2;
      const yMean = pad.top + chartH - (s.mean / maxVal) * chartH;
      const yMin = pad.top + chartH - (s.min / maxVal) * chartH;
      const yMax = pad.top + chartH - (s.max / maxVal) * chartH;
      const yP10 = pad.top + chartH - (s.p10 / maxVal) * chartH;
      const yP90 = pad.top + chartH - (s.p90 / maxVal) * chartH;
      bars += '<line x1="' + (x + barW / 2) + '" y1="' + yMin + '" x2="' + (x + barW / 2) + '" y2="' + yMax + '" stroke="#475569" stroke-width="1.2"/>';
      bars += '<rect x="' + x + '" y="' + yP90 + '" width="' + barW + '" height="' + Math.max(1, yP10 - yP90) + '" fill="#94a3b8" opacity="0.5" rx="2"/>';
      bars += '<rect x="' + x + '" y="' + yMean + '" width="' + barW + '" height="' + Math.max(1, pad.top + chartH - yMean) + '" fill="#2563eb" rx="2"/>';
      bars += '<text x="' + (x + barW / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="8" fill="#64748b">' + escapeHtml(s.band.replace('Band_', 'B')) + '</text>';
    });
    let grid = '';
    for (let v = 0; v <= 255; v += 85) {
      const y = pad.top + chartH - (v / maxVal) * chartH;
      grid += '<line x1="' + pad.left + '" y1="' + y + '" x2="' + (W - pad.right) + '" y2="' + y + '" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="2 3"/>';
      grid += '<text x="' + (pad.left - 4) + '" y="' + (y + 3) + '" text-anchor="end" font-size="7.5" fill="#94a3b8">' + v + '</text>';
    }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="display:block;width:100%;height:auto;overflow:visible">' +
      grid + bars +
      '<text x="' + (pad.left - 4) + '" y="' + (pad.top + 3) + '" text-anchor="end" font-size="7.5" fill="#94a3b8">255</text>' +
      '</svg>';
  }

  function soilHistHtml(item) {
    const bands = item.soil.bands;
    if (!bands || !bands.length) return '';
    const first = bands[0];
    if (!first.hist || !first.hist.length) return '';
    const total = first.count || 1;
    const rows = SOIL_HIST_BINS.map(function (bin, i) {
      const n = first.hist[i] || 0;
      const pct = (n / total) * 100;
      const hex = 'rgb(' + bin.rgb.join(',') + ')';
      return '<div class="pa-dist-row">' +
        '<span class="pa-dist-label">' + escapeHtml(bin.label) + '</span>' +
        '<span class="pa-dist-bar"><i style="width:' + pct.toFixed(1) + '%;background:' + hex + '"></i></span>' +
        '<b class="pa-dist-value">' + pct.toFixed(0) + '%</b>' +
        '</div>';
    }).join('');
    return '<div class="pa-dist">' + rows + '</div>';
  }

  function soilMetaHtml(item) {
    const meta = item.soil && item.soil.meta;
    if (!meta) return '';
    const rows = [];
    if (meta.name) rows.push(metaRow('Sumber', escapeHtml(meta.name)));
    if (meta.description) rows.push(metaRow('Deskripsi', escapeHtml(meta.description)));
    if (meta.bandCount) rows.push(metaRow('Jumlah band', String(meta.bandCount)));
    if (meta.bandNames && meta.bandNames.length) rows.push(metaRow('Nama band', escapeHtml(meta.bandNames.join(', '))));
    if (meta.pixelType) rows.push(metaRow('Tipe piksel', escapeHtml(meta.pixelType)));
    if (meta.timeExtent) rows.push(metaRow('Rentang waktu', escapeHtml(meta.timeExtent.start + ' s/d ' + meta.timeExtent.end)));
    if (meta.meanPixelSize) rows.push(metaRow('Resolusi rata-rata', fmt(meta.meanPixelSize, 0) + ' m'));
    if (meta.copyright) rows.push(metaRow('Hak cipta', escapeHtml(meta.copyright)));
    if (!rows.length) return '';
    return '<details class="pa-details"><summary class="pa-summary">Metadata SOIL</summary>' +
      '<div class="pa-block">' + rows.join('') + '</div></details>';
  }

  async function runSoilYearly(item, onStatus) {
    onStatus('Mengambil metadata SOIL tahunan...');
    let meta = null;
    try {
      const resp = await fetch(SOIL_YEARLY_META_URL + '?f=json');
      if (resp.ok) {
        const data = await resp.json();
        meta = {
          name: data.name || 'SOIL/SOIL_yearly',
          description: data.description || '',
          bandCount: data.bandCount || 4,
          bandNames: data.bandNames || [],
          pixelType: data.pixelType || 'U8',
          timeExtent: data.timeInfo && data.timeInfo.timeExtent
            ? { start: new Date(data.timeInfo.timeExtent[0]).toISOString().slice(0, 10), end: new Date(data.timeInfo.timeExtent[1]).toISOString().slice(0, 10) }
            : null,
          meanPixelSize: data.meanPixelSize || 0,
          copyright: data.copyrightText || '',
          capabilities: data.capabilities || ''
        };
      }
    } catch (e) {}

    onStatus('Mengunduh raster kelembapan tanah tahunan...');
    const size = pickSize(item.bounds);
    const params = new URLSearchParams({
      bbox: [item.bounds.west, item.bounds.south, item.bounds.east, item.bounds.north].map(function (v) { return v.toFixed(7); }).join(','),
      bboxSR: '4326',
      imageSR: '4326',
      size: size.w + ',' + size.h,
      format: 'tiff',
      f: 'image'
    });
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT);
    let blob;
    try {
      const resp = await fetch(SOIL_YEARLY_URL + '?' + params.toString(), { signal: controller.signal });
      if (!resp.ok) throw new Error('Server SOIL tahunan menolak permintaan (HTTP ' + resp.status + ')');
      blob = await resp.blob();
    } finally {
      clearTimeout(timer);
    }

    onStatus('Membaca piksel SOIL tahunan...');
    if (!window.GeoTIFF || typeof window.GeoTIFF.fromBlob !== 'function') {
      throw new Error('Library geotiff.js belum termuat.');
    }
    const tiff = await window.GeoTIFF.fromBlob(blob);
    const image = await tiff.getImage();
    const rasters = await image.readRasters();
    if (!rasters || !rasters.length) throw new Error('Raster SOIL tahunan kosong.');

    const width = image.getWidth();
    const height = image.getHeight();
    const bb = image.getBoundingBox();
    const geo = Array.isArray(bb) && bb.length === 4 && Number.isFinite(bb[0]) && Number.isFinite(bb[2]) && bb[2] > bb[0]
      ? { minX: bb[0], minY: bb[1], maxX: bb[2], maxY: bb[3] }
      : { minX: item.bounds.west, minY: item.bounds.south, maxX: item.bounds.east, maxY: item.bounds.north };

    const mask = rasterizeMask(item.rings, { width: width, height: height, geo: geo });
    const bandStats = [];
    let totalInside = 0;
    for (let b = 0; b < rasters.length && b < SOIL_BANDS; b++) {
      const vals = rasters[b];
      const collected = [];
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i]) continue;
        if (b === 0) totalInside++;
        const v = vals[i];
        if (!Number.isFinite(v) || v === 0) continue;
        collected.push(v);
      }
      if (!collected.length) {
        bandStats.push({ band: 'Band_' + (b + 1), count: 0, mean: NaN, min: NaN, max: NaN, p10: NaN, p25: NaN, median: NaN, p75: NaN, p90: NaN, stddev: NaN, hist: SOIL_HIST_BINS.map(function () { return 0; }) });
        continue;
      }
      collected.sort(function (a, b) { return a - b; });
      const count = collected.length;
      const sum = collected.reduce(function (a, v) { return a + v; }, 0);
      const mean = sum / count;
      const variance = collected.reduce(function (a, v) { return a + (v - mean) * (v - mean); }, 0) / count;
      const stddev = Math.sqrt(variance);
      const hist = SOIL_HIST_BINS.map(function () { return 0; });
      for (let i = 0; i < collected.length; i++) {
        const bin = soilFindBin(collected[i]);
        for (let h = 0; h < SOIL_HIST_BINS.length; h++) {
          if (SOIL_HIST_BINS[h] === bin) { hist[h]++; break; }
        }
      }
      bandStats.push({
        band: 'Band_' + (b + 1),
        count: count,
        mean: mean,
        min: collected[0],
        max: collected[count - 1],
        p10: soilPercentile(collected, 10),
        p25: soilPercentile(collected, 25),
        median: soilPercentile(collected, 50),
        p75: soilPercentile(collected, 75),
        p90: soilPercentile(collected, 90),
        stddev: stddev,
        hist: hist
      });
    }

    if (!bandStats.length || !totalInside) {
      throw new Error('Tidak ada piksel SOIL tahunan valid di dalam polygon.');
    }

    item.soilYearly = { bands: bandStats, inside: totalInside, size: size.w + '×' + size.h, meta: meta };
    return item.soilYearly;
  }

  function soilYearlyChartSvg(item) {
    const bands = item.soilYearly && item.soilYearly.bands;
    if (!bands || !bands.length) return '';
    const W = 288, H = 110, pad = { top: 10, right: 8, bottom: 22, left: 30 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;
    const maxVal = 255;
    const barW = Math.min(40, (chartW / bands.length) * 0.55);
    const gap = chartW / bands.length;
    let bars = '';
    bands.forEach(function (s, i) {
      const x = pad.left + gap * i + (gap - barW) / 2;
      const yMean = pad.top + chartH - (s.mean / maxVal) * chartH;
      const yMin = pad.top + chartH - (s.min / maxVal) * chartH;
      const yMax = pad.top + chartH - (s.max / maxVal) * chartH;
      const yP10 = pad.top + chartH - (s.p10 / maxVal) * chartH;
      const yP90 = pad.top + chartH - (s.p90 / maxVal) * chartH;
      bars += '<line x1="' + (x + barW / 2) + '" y1="' + yMin + '" x2="' + (x + barW / 2) + '" y2="' + yMax + '" stroke="#475569" stroke-width="1.2"/>';
      bars += '<rect x="' + x + '" y="' + yP90 + '" width="' + barW + '" height="' + Math.max(1, yP10 - yP90) + '" fill="#94a3b8" opacity="0.5" rx="2"/>';
      bars += '<rect x="' + x + '" y="' + yMean + '" width="' + barW + '" height="' + Math.max(1, pad.top + chartH - yMean) + '" fill="#2563eb" rx="2"/>';
      bars += '<text x="' + (x + barW / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="8" fill="#64748b">' + escapeHtml(s.band.replace('Band_', 'B')) + '</text>';
    });
    let grid = '';
    for (let v = 0; v <= 255; v += 85) {
      const y = pad.top + chartH - (v / maxVal) * chartH;
      grid += '<line x1="' + pad.left + '" y1="' + y + '" x2="' + (W - pad.right) + '" y2="' + y + '" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="2 3"/>';
      grid += '<text x="' + (pad.left - 4) + '" y="' + (y + 3) + '" text-anchor="end" font-size="7.5" fill="#94a3b8">' + v + '</text>';
    }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="display:block;width:100%;height:auto;overflow:visible">' +
      grid + bars +
      '<text x="' + (pad.left - 4) + '" y="' + (pad.top + 3) + '" text-anchor="end" font-size="7.5" fill="#94a3b8">255</text>' +
      '</svg>';
  }

  function soilYearlyHistHtml(item) {
    const bands = item.soilYearly && item.soilYearly.bands;
    if (!bands || !bands.length) return '';
    const first = bands[0];
    if (!first.hist || !first.hist.length) return '';
    const total = first.count || 1;
    const rows = SOIL_HIST_BINS.map(function (bin, i) {
      const n = first.hist[i] || 0;
      const pct = (n / total) * 100;
      const hex = 'rgb(' + bin.rgb.join(',') + ')';
      return '<div class="pa-dist-row">' +
        '<span class="pa-dist-label">' + escapeHtml(bin.label) + '</span>' +
        '<span class="pa-dist-bar"><i style="width:' + pct.toFixed(1) + '%;background:' + hex + '"></i></span>' +
        '<b class="pa-dist-value">' + pct.toFixed(0) + '%</b>' +
        '</div>';
    }).join('');
    return '<div class="pa-dist">' + rows + '</div>';
  }

  function soilYearlyMetaHtml(item) {
    const meta = item.soilYearly && item.soilYearly.meta;
    if (!meta) return '';
    const rows = [];
    if (meta.name) rows.push(metaRow('Sumber', escapeHtml(meta.name)));
    if (meta.description) rows.push(metaRow('Deskripsi', escapeHtml(meta.description)));
    if (meta.bandCount) rows.push(metaRow('Jumlah band', String(meta.bandCount)));
    if (meta.bandNames && meta.bandNames.length) rows.push(metaRow('Nama band', escapeHtml(meta.bandNames.join(', '))));
    if (meta.pixelType) rows.push(metaRow('Tipe piksel', escapeHtml(meta.pixelType)));
    if (meta.timeExtent) rows.push(metaRow('Rentang waktu', escapeHtml(meta.timeExtent.start + ' s/d ' + meta.timeExtent.end)));
    if (meta.meanPixelSize) rows.push(metaRow('Resolusi rata-rata', fmt(meta.meanPixelSize, 0) + ' m'));
    if (meta.copyright) rows.push(metaRow('Hak cipta', escapeHtml(meta.copyright)));
    if (!rows.length) return '';
    return '<details class="pa-details"><summary class="pa-summary">Metadata SOIL Tahunan</summary>' +
      '<div class="pa-block">' + rows.join('') + '</div></details>';
  }

  /* ---- Kebutuhan air tanaman: ETc = ET0 x Kc -------------------------
     Cakupan versi 1 hanya ETc. Curah hujan efektif, kapasitas air tanah,
     dan efisiensi irigasi TIDAK dihitung -- batas itu disebut terbuka di
     UI supaya angkanya tidak dibaca sebagai jadwal irigasi. */
  function airTanamanOptions(terpilih) {
    const daftar = (window.WaterNeed && window.WaterNeed.daftarTanaman) ? window.WaterNeed.daftarTanaman() : [];
    return daftar.map(function (t) {
      return '<option value="' + escapeHtml(t.id) + '"' +
        (t.id === terpilih ? ' selected' : '') + '>' + escapeHtml(t.nama) + '</option>';
    }).join('');
  }

  function localDateInputValue() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function airBlockHtml(item) {
    if (item.airError) {
      return '<div class="pa-block pa-block-error">' + escapeHtml(item.airError) + '</div>';
    }
    if (!item.air) return '';

    const W = window.WaterNeed;
    const t = item.air.tanaman;
    const etc = item.air.etc;
    const luas = item.areaHa;
    // 1 mm air pada 1 ha = 10 m3.
    const m3 = etc.etcTotal * luas * 10;
    const m3Hari = m3 / etc.totalHari;
    const et0 = item.air.rerataEt0Harian;

    let html = '';
    if (item.air.neraca) {
      const balance = item.air.neraca;
      const maxBar = Math.max.apply(null, balance.days.map(function (d) { return Math.max(d.etc || 0, d.effectiveRain || 0); }).concat([1]));
      const daily = balance.days.map(function (d) {
        const etcWidth = Math.max(0, Math.min(100, (d.etc || 0) / maxBar * 100));
        const rainWidth = Math.max(0, Math.min(100, (d.effectiveRain || 0) / maxBar * 100));
        return '<div class="pa-wi-day"><div class="pa-wi-day-head"><span>' + escapeHtml(d.date) + '</span><span>Hari tanam ' + (d.cropAge < 0 ? 'belum tanam' : d.cropAge + 1) + ' · Kc ' + fmt(d.kc, 2) + '</span></div>' +
          '<div class="pa-wi-bars"><span class="pa-wi-bar pa-wi-etc" style="width:' + etcWidth + '%" title="ETc ' + fmt(d.etc, 1) + ' mm"></span><span class="pa-wi-bar pa-wi-rain" style="width:' + rainWidth + '%" title="Hujan efektif ' + fmt(d.effectiveRain, 1) + ' mm"></span></div>' +
          '<div class="pa-wi-day-values"><span>ETc ' + fmt(d.etc, 1) + ' mm</span><span>Hujan ' + fmt(d.rain, 1) + ' mm · efektif ' + fmt(d.effectiveRain, 1) + '</span><b>' + (d.gap == null ? '—' : 'Gap ' + fmt(d.gap, 1) + ' mm') + '</b></div></div>';
      }).join('');
      const gapM3 = balance.totals.gap * item.areaHa * 10;
      html += '<div class="pa-wi-card"><div class="pa-wi-title">Neraca indikatif ' + balance.completeDays + ' hari</div>' +
        '<div class="pa-wi-metrics"><div><b>' + fmt(balance.totals.etc, 1) + ' mm</b><small>kebutuhan tanaman (ETc)</small></div><div><b>' + fmt(balance.totals.rain, 1) + ' mm</b><small>prakiraan hujan</small></div><div><b>' + fmt(balance.totals.gap, 1) + ' mm</b><small>gap harian indikatif</small></div></div>' +
        '<div class="pa-air-row"><span>Gap pada luas petak (' + fmt(item.areaHa, 2) + ' ha)</span><b>±' + fmt(gapM3, 0) + ' m³</b></div>' +
        '<div class="pa-wi-legend"><span><i class="pa-wi-etc"></i> ETc tanaman</span><span><i class="pa-wi-rain"></i> Hujan efektif (' + fmt(balance.rainEffectivePct, 0) + '%)</span></div>' +
        '<details class="pa-details"><summary class="pa-summary">Rincian harian</summary><div class="pa-wi-days">' + daily + '</div></details>' +
        '<div class="pa-block pa-block-muted"><b>Makna angka.</b> Gap menjumlahkan selisih harian max(ETc − hujan efektif, 0); ini bukan rekomendasi volume penyiraman. Belum menghitung simpanan air zona akar, limpasan, drainase, genangan, atau efisiensi irigasi.</div>' +
        '<div class="pa-air-src">ETc = ET₀ × Kc tahap tanaman · Sumber cuaca: ' + escapeHtml(balance.source) + ' pada centroid polygon.</div></div>';
    }
    html += '<div class="pa-block">';
    html += '<div class="pa-air-hero">';
    html += '<div class="pa-air-hero-val">' + fmt(m3, 0) + ' m<sup>3</sup></div>';
    html += '<div class="pa-air-hero-lab">ETc indikatif ' + escapeHtml(t.nama) +
      ' untuk satu siklus contoh<br>' + fmt(etc.etcTotal, 0) + ' mm &times; ' + fmt(luas, 2) + ' ha</div>';
    html += '</div>';
    html += '<div class="pa-air-row"><span>ET0 saat ini</span><span>' + fmt(et0, 2) + ' mm/hari</span></div>';
    html += '<div class="pa-air-row"><span>Durasi musim</span><span>' + etc.totalHari + ' hari</span></div>';
    html += '<div class="pa-air-row"><span>Rata-rata harian</span><span>' + fmt(m3Hari, 1) + ' m<sup>3</sup>/hari</span></div>';
    html += W._tabelTahapHtml(etc);
    html += '</div>';

    html += '<details class="pa-details">';
    html += '<summary class="pa-summary">Pola ET0 bulanan (5 tahun)</summary>';
    html += '<div class="pa-block">';
    item.air.bulanan.perBulan.forEach(function (v, i) {
      const maks = Math.max.apply(null, item.air.bulanan.perBulan.concat([0.1]));
      const lebar = Math.max(2, Math.round((v / maks) * 100));
      html += '<div class="pa-air-row pa-air-month">';
      html += '<span>' + W.BULAN[i] + '</span>';
      html += '<span class="pa-air-bar-wrap"><span class="pa-air-bar" style="width:' + lebar + '%"></span></span>';
      html += '<span>' + fmt(v, 2) + '</span>';
      html += '</div>';
    });
    html += '<div class="pa-air-src">' + escapeHtml(item.air.bulanan.sumber) +
      ' &middot; ' + escapeHtml(item.air.harian.sumber) + '</div>';
    html += '</div></details>';

    if (item.air.bulanan.perkiraan) {
      html += '<div class="pa-block pa-block-muted">Kuota Open-Meteo habis, jadi ET0 memakai rerata kasar. ' +
        'Angka ini hanya untuk melihat besaran, bukan untuk keputusan irigasi.</div>';
    }

    if (t.catatan) {
      html += '<div class="pa-block pa-block-muted">' + escapeHtml(t.catatan) + '</div>';
    }

    html += '<div class="pa-block pa-block-muted"><b>Estimasi siklus contoh.</b> Nilai ini memakai ET₀ rata-rata prakiraan saat ini untuk seluruh durasi tanaman. Gunakan neraca 16 hari di atas untuk konteks cuaca dekat; keduanya bukan volume air yang harus disiram.</div>';

    html += '<div class="pa-block pa-block-muted">Estimasi satu musim memakai ET0 rata-rata ' +
      (window.WaterNeed.FORECAST_DAYS || 16) + ' hari ke depan, dengan asumsi cuaca sekarang ' +
      'berlanjut sampai musim selesai. Kalau musimnya sedang berjalan, hasilnya yang paling ' +
      'mendekati; untuk musim yang masih jauh, pakai pola ET0 bulanan di atas sebagai gantinya.</div>';

    return html;
  }

  /* Ikon inline memakai currentColor supaya warnanya ikut ke putih saat
     tombol sedang aktif, dan tidak menambah request HTTP. */
  const ICON_CALC =
    '<svg class="pa-air-calc-ico" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
    '<rect x="3.2" y="1.4" width="9.6" height="13.2" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
    '<path d="M5.6 1.9h4.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>' +
    '<path d="M5.4 8.4h5.2M5.4 11h3.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>' +
    '</svg>';

  const ICON_SPIN =
    '<svg class="pa-air-calc-ico is-spin" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
    '<circle cx="8" cy="8" r="5.4" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-dasharray="20 14"/></svg>';

  const ICON_CHEVRON =
    '<svg class="pa-air-caret" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true" focusable="false">' +
    '<path d="M3 4.8 6 7.8l3-3" fill="none" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function airSectionHtml(item) {
    // Section ini memakai template .pa-section yang sama dengan section lain.
    // Sifat hitungannya memang berbeda (cukup luas polygon, tanpa citra
    // satelit), tapi itu disampaikan lewat isi dan catatan di dalamnya, bukan
    // lewat tampilan kotak sendiri -- supaya tidak terlihat seperti kartu
    // dari template yang berbeda. Kelas pa-section-air tetap dipakai untuk
    // state ciut dan urutan section.
    return '<div class="pa-section pa-section-air' +
      (isSectionCollapsed(item, 'air') ? ' is-collapsed' : '') + '">' +
      sectionHeadHtml(item, 'air', 'Water Intelligence') +
      '<div class="pa-section-body">' +
      /* Catatan memakai .pa-note, kelas yang sama dengan catatan di section
         NDVI, Indeks Spektral, dan Topografi. */
      '<div class="pa-note">Neraca indikatif 16 hari menggabungkan ET₀, Kc menurut umur tanaman, dan prakiraan hujan di titik tengah petak. Pilih tanggal tanam agar tahap tanaman mengikuti kalender.</div>' +
      /* Baris tanaman: label di atas, select penuh di bawahnya. Pola ini
         mengikuti komponen form ArcGIS -- bukan label-inline yang sempit,
         karena select berisi nama tanaman yang panjang ("Kelapa Sawit"). */
      '<div class="pa-air-field">' +
      '<label class="pa-air-label" for="pa-air-crop-' + item.id + '">Tanaman</label>' +
      '<div class="pa-air-select-wrap">' +
      '<select id="pa-air-crop-' + item.id + '" class="pa-air-select" data-pa-air-crop data-pa-id="' + item.id + '">' +
      airTanamanOptions(item.airTanamanId) +
      '</select>' +
      ICON_CHEVRON +
      '</div>' +
      '<div class="pa-air-field"><label class="pa-air-label" for="pa-air-date-' + item.id + '">Tanggal tanam / mulai fase</label><input id="pa-air-date-' + item.id + '" class="pa-air-select" type="date" data-pa-air-date data-pa-id="' + item.id + '" value="' + escapeHtml(item.airSowingDate || localDateInputValue()) + '"></div>' +
      '<div class="pa-air-field"><label class="pa-air-label" for="pa-air-rain-' + item.id + '">Porsi hujan yang diasumsikan efektif <b data-pa-air-rain-label>' + fmt(item.airRainEffectivePct == null ? 70 : item.airRainEffectivePct, 0) + '%</b></label><input id="pa-air-rain-' + item.id + '" class="pa-wi-range" type="range" min="50" max="90" step="5" data-pa-air-rain data-pa-id="' + item.id + '" value="' + (item.airRainEffectivePct == null ? 70 : item.airRainEffectivePct) + '"><small class="pa-wi-hint">Atur sebagai skenario 50–90%; bukan pengukuran hujan efektif di petak.</small></div>' +
      '</div>' +
      /* Tombol-primary gaya ArcGIS: ikon, label pendek, state terlihat.
         Teksnya "Hitung" saja -- isi panel sudah menjelaskan apa yang dihitung,
         jadi "Hitung kebutuhan air" itu redundant. */
      '<button class="pa-air-calc" type="button" data-pa-action="air" data-pa-id="' + item.id + '"' +
      (item.airBusy ? ' disabled' : '') + '>' +
      (item.airBusy ? ICON_SPIN + '<span>Menghitung…</span>'
        : ICON_CALC + '<span>Analisis Water Intelligence</span>') +
      '</button>' +
      (item.airBusy ? '<div class="pa-block pa-block-muted"><span class="pa-spin"></span>' +
      escapeHtml(item.busy || 'Mengambil ET0 dari Open-Meteo…') + '</div>' : '') +
      airBlockHtml(item) +
      '</div>' +
      '</div>';
  }

  /* ---- Aksi kebutuhan air --------------------------------------------- */

  /* Centroid true polygon (shoelace), bukan titik tengah bounding box.
     Petak sawah sering tidak beraturan, jadi titik tengah bbox bisa jatuh
     di luar petak dan memberi ET0 lokasi yang salah. Batas shapely:
     rings = [ [lon, lat], ... ] dalam derajat. */
  function centroidOf(rings) {
    const outer = rings && rings[0];
    if (!outer || outer.length < 3) return null;
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < outer.length; i++) {
      const p = outer[i];
      const q = outer[(i + 1) % outer.length];
      const cross = p[0] * q[1] - q[0] * p[1];
      a += cross;
      cx += (p[0] + q[0]) * cross;
      cy += (p[1] + q[1]) * cross;
    }
    a *= 0.5;
    if (Math.abs(a) < 1e-12) {
      // Polygon runtuh (luas ~0) atau/self-intersecting: jatuh ke bbox center.
      const b = boundsOf(rings);
      return { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 };
    }
    return { lng: cx / (6 * a), lat: cy / (6 * a) };
  }

  function runAirNeed(item) {
    if (item.airBusy) return;
    if (!window.WaterNeed) {
      item.airError = 'Modul kebutuhan air belum termuat (water-need.js).';
      render();
      return;
    }
    const c = centroidOf(item.rings);
    if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) {
      item.airError = 'Centroid polygon tidak bisa dihitung. Gambar ulang petaknya.';
      render();
      return;
    }

    const sowingInput = document.getElementById('pa-air-date-' + item.id);
    const rainInput = document.getElementById('pa-air-rain-' + item.id);
    if (sowingInput) item.airSowingDate = sowingInput.value;
    if (rainInput) item.airRainEffectivePct = Number(rainInput.value);
    if (!item.airSowingDate) item.airSowingDate = localDateInputValue();

    item.airBusy = true;
    item.airError = null;
    item.busy = 'Mengambil ET0 dan hujan harian dari Open-Meteo…';
    render();

    return window.WaterNeed.ongkosHitung(c.lat, c.lng, item.airTanamanId, {
      sowingDate: item.airSowingDate,
      effectiveRainPct: item.airRainEffectivePct == null ? 70 : item.airRainEffectivePct
    })
      .then(function (hasil) {
        item.air = hasil;
        item.airLat = c.lat;
        item.airLng = c.lng;
      })
      .catch(function (error) {
        item.air = null;
        item.airError = error && error.message
          ? error.message
          : 'Gagal mengambil ET0 dari Open-Meteo.';
      })
      .then(function () {
        item.airBusy = false;
        item.busy = null;
        render();
      });
  }

  /* Prakiraan cuaca per centroid. Rekomendasi dibatasi pada keputusan
     operasional yang memang didukung data cuaca; diagnosis hama/penyakit
     dan dosis pupuk memerlukan pengamatan lapang serta data tanah. */
  function weatherSectionHtml(item) {
    let body = '<div class="pa-note">Prakiraan 7 hari di titik tengah polygon dari Open-Meteo.</div>';
    if (item.weatherBusy) body += '<div class="pa-block pa-block-muted"><span class="pa-spin"></span> Mengambil prakiraan cuaca…</div>';
    else if (item.weatherError) body += '<div class="pa-block pa-block-error">' + escapeHtml(item.weatherError) + '</div>';
    else if (item.weather) {
      const w = item.weather;
      body += '<div class="pa-block"><div class="pa-air-row"><span>Sekarang</span><b>' + fmt(w.temp, 1) + ' °C · RH ' + fmt(w.humidity, 0) + '% · angin ' + fmt(w.wind, 0) + ' km/j</b></div>';
      body += '<div class="pa-subhead">Prakiraan 7 hari</div>';
      w.days.forEach(function (d) { body += '<div class="pa-air-row"><span>' + escapeHtml(d.date) + '</span><b>' + fmt(d.min, 0) + '–' + fmt(d.max, 0) + ' °C · hujan ' + fmt(d.rain, 1) + ' mm</b></div>'; });
      const wet = w.days.some(function (d) { return d.rain >= 10; });
      const windy = Number(w.wind) >= 15;
      const humid = Number(w.humidity) >= 85 && w.days.some(function (d) { return d.rain >= 1; });
      body += '<div class="pa-block pa-block-muted"><b>Catatan tindakan</b><ul>';
      body += wet ? '<li>Tunda pemupukan yang mudah tercuci bila hujan lebat diperkirakan; ikuti label dan kondisi lahan.</li>' : '<li>Tidak tampak sinyal hujan lebat pada prakiraan ini; waktu pemupukan tetap mengikuti fase dan rekomendasi setempat.</li>';
      body += (wet || windy) ? '<li>Hindari penyemprotan saat hujan atau angin kencang; periksa label produk dan kondisi aktual.</li>' : '<li>Cuaca prakiraan relatif memungkinkan untuk aplikasi; cek angin dan hujan tepat sebelum menyemprot.</li>';
      body += humid ? '<li>Kelembapan dan hujan mendukung kondisi lembap: tingkatkan pemantauan gejala penyakit jamur, ini bukan diagnosis.</li>' : '<li>Belum ada sinyal cuaca kuat untuk risiko penyakit jamur; lakukan pemantauan rutin.</li>';
      body += '</ul><small>Data cuaca tidak cukup untuk menentukan dosis pupuk, jenis pestisida, atau memastikan hama/penyakit. Perlu jenis/fase tanaman, uji tanah, dan pengamatan lapang.</small></div></div>';
      body += '<div class="pa-air-src">Sumber: Open-Meteo · prakiraan titik centroid, bukan pengukuran di seluruh petak.</div>';
    }
    return '<div class="pa-section' + (isSectionCollapsed(item, 'weather') ? ' is-collapsed' : '') + '">' + sectionHeadHtml(item, 'weather', 'Cuaca & Rekomendasi') + '<div class="pa-section-body">' + body + '<button class="pa-btn pa-btn-ghost" type="button" data-pa-action="weather" data-pa-id="' + item.id + '"' + (item.weatherBusy ? ' disabled' : '') + '>' + (item.weather ? 'Perbarui prakiraan' : 'Analisis cuaca') + '</button></div></div>';
  }

  function runPolygonWeather(item) {
    if (item.weatherBusy) return;
    const c = centroidOf(item.rings);
    if (!c) { item.weatherError = 'Centroid polygon tidak bisa dihitung.'; render(); return; }
    item.weatherBusy = true; item.weatherError = null; render();
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + encodeURIComponent(c.lat) + '&longitude=' + encodeURIComponent(c.lng) + '&current=temperature_2m,relative_humidity_2m,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FJakarta&forecast_days=7';
    fetch(url).then(function (r) { if (!r.ok) throw new Error('Layanan cuaca tidak merespons (' + r.status + ').'); return r.json(); })
      .then(function (d) {
        if (!d.current || !d.daily || !Array.isArray(d.daily.time)) throw new Error('Data prakiraan tidak lengkap.');
        item.weather = { temp: d.current.temperature_2m, humidity: d.current.relative_humidity_2m, wind: d.current.wind_speed_10m, days: d.daily.time.map(function (date, i) { return { date: date, min: d.daily.temperature_2m_min[i], max: d.daily.temperature_2m_max[i], rain: d.daily.precipitation_sum[i] }; }) };
      }).catch(function (e) { item.weatherError = e.message || 'Gagal mengambil prakiraan cuaca.'; })
      .then(function () { item.weatherBusy = false; render(); });
  }

  /* Select tanaman tidak memicu render penuh supaya select tidak kehilangan
     fokus saat pengguna masih menekankeyboard. Hasil dihitung ulang hanya
     bila pengguna menekan tombol, supaya tidak boros kuota Open-Meteo. */
  function onPanelChange(event) {
    const target = event.target;
    if (!target || !target.closest) return;

    const select = target.closest('[data-pa-air-crop]');
    if (select) {
      const id = Number(select.getAttribute('data-pa-id'));
      const item = state.items.filter(function (x) { return x.id === id; })[0];
      if (!item) return;
      item.airTanamanId = select.value;
      // Kalau sudah ada hasil, tandai stale supaya tombol hitung ulang menyala.
      if (item.air) {
        item.air = null;
        item.airError = null;
        render();
      }
      return;
    }

    const sowingDate = target.closest('[data-pa-air-date]');
    if (sowingDate) {
      const item = itemById(sowingDate.getAttribute('data-pa-id'));
      if (!item) return;
      item.airSowingDate = sowingDate.value;
      item.air = null;
      item.airError = null;
      render();
      return;
    }
    const rainFraction = target.closest('[data-pa-air-rain]');
    if (rainFraction) {
      const item = itemById(rainFraction.getAttribute('data-pa-id'));
      if (!item) return;
      item.airRainEffectivePct = Number(rainFraction.value);
      const label = rainFraction.parentElement.querySelector('[data-pa-air-rain-label]');
      if (label) label.textContent = item.airRainEffectivePct + '%';
      item.air = null;
      item.airError = null;
      render();
      return;
    }

    /* --- Kontrol mode mandiri ---
       Semuanya dikumpulkan di sini supaya hanya ada satu listener change.
       Nilai angka tidak memicu render penuh: kolom isinya diketik pengguna
       dan render ulang akan memindahkan fokus di tengah pengetikan. */
    const idx = target.closest('[data-pa-index]');
    if (idx) {
      const item = itemFromEl(idx);
      if (!item) return;
      const key = idx.getAttribute('data-pa-index');
      if (!COMPUTE_SPECS[key]) return;
      const picked = (item.picked || []).slice();
      const at = picked.indexOf(key);
      if (idx.checked && at === -1) picked.push(key);
      if (!idx.checked && at !== -1) picked.splice(at, 1);
      // Kembalikan ke urutan tetap supaya tampilan tidak bergantung urutan klik.
      item.picked = PICK_ORDER.filter(function (k) { return picked.indexOf(k) !== -1; });
      // Hanya label yang berubah; render penuh tidak perlu, tapi status tombol
      // "Hitung index terpilih" bergantung pada jumlah pilihan.
      const row = idx.closest('.pa-idx');
      if (row) row.classList.toggle('is-on', idx.checked);
      syncManualButton(item);
      return;
    }

    const angka = function (attr, min, max) {
      const el = target.closest('[' + attr + ']');
      if (!el) return null;
      const v = Number(el.value);
      if (!Number.isFinite(v)) return null;
      return Math.min(max, Math.max(min, Math.round(v)));
    };

    const cloud = angka('data-pa-cloud-limit', 0, 100);
    if (cloud !== null) {
      const item = itemFromEl(target);
      if (item) item.sceneCloudLimit = cloud;
      return;
    }
    const months = angka('data-pa-months', 1, 36);
    if (months !== null) {
      const item = itemFromEl(target);
      if (item) item.sceneMonths = months;
      return;
    }
    const cap = angka('data-pa-pixel-cap', 32, 1024);
    if (cap !== null) {
      const item = itemFromEl(target);
      if (item) item.pixelCap = cap;
      return;
    }

    const scl = target.closest('[data-pa-scl]');
    if (scl) {
      const item = itemFromEl(scl);
      if (!item) return;
      item.sclMask = !!scl.checked;
      // Resolusi memengaruhi hasil, jadi tandai angka lama sebagai tidak lagi
      // berlaku: user perlu tahu piksel mana yang menghasilkan angka itu.
      if (item.analyzed) item.stale = true;
      render();
    }
  }

  function itemFromEl(el) {
    const id = Number(el.getAttribute('data-pa-id'));
    if (!Number.isFinite(id)) return null;
    return state.items.filter(function (x) { return x.id === id; })[0] || null;
  }

  /** Nyalakan/matikan tombol "Hitung index terpilih" sesuai jumlah pilihan. */
  function syncManualButton(item) {
    const btn = panelEl() && panelEl().querySelector(
      '[data-pa-action="run-manual"][data-pa-id="' + item.id + '"]');
    if (!btn) return;
    btn.disabled = item.runBusy || !item.scene || !(item.picked && item.picked.length);
  }


  function soilYearlyBlockHtml(item) {
    if (item.soilYearlyError) {
      return '<div class="pa-block pa-block-error">' + escapeHtml(item.soilYearlyError) + '</div>';
    }
    if (!item.soilYearly) {
      return '';
    }
    const rows = item.soilYearly.bands.map(function (s) {
      return '<div class="pa-soil-row">' +
        '<span class="pa-soil-band">' + escapeHtml(s.band) + '</span>' +
        '<span class="pa-soil-stat">min <b>' + fmt(s.min, 0) + '</b></span>' +
        '<span class="pa-soil-stat">rata <b>' + fmt(s.mean, 1) + '</b></span>' +
        '<span class="pa-soil-stat">maks <b>' + fmt(s.max, 0) + '</b></span>' +
        '</div>';
    }).join('');
    const detailRows = item.soilYearly.bands.map(function (s) {
      return '<div class="pa-soil-row pa-soil-row-detail">' +
        '<span class="pa-soil-band">' + escapeHtml(s.band) + '</span>' +
        '<span class="pa-soil-stat">p10 <b>' + fmt(s.p10, 0) + '</b></span>' +
        '<span class="pa-soil-stat">p25 <b>' + fmt(s.p25, 0) + '</b></span>' +
        '<span class="pa-soil-stat">med <b>' + fmt(s.median, 0) + '</b></span>' +
        '<span class="pa-soil-stat">p75 <b>' + fmt(s.p75, 0) + '</b></span>' +
        '<span class="pa-soil-stat">p90 <b>' + fmt(s.p90, 0) + '</b></span>' +
        '<span class="pa-soil-stat">sd <b>' + fmt(s.stddev, 1) + '</b></span>' +
        '</div>';
    }).join('');
    return '<div class="pa-block">' +
      '<div class="pa-soil-grid">' + rows + '</div>' +
      '<div class="pa-soil-grid pa-soil-grid-detail">' + detailRows + '</div>' +
      '<div class="pa-meta">Raster ' + escapeHtml(item.soilYearly.size) + ' · resolusi ~9,8 km/piksel · U8 (0–255) · ' + item.soilYearly.inside.toLocaleString('id-ID') + ' piksel dalam polygon</div>' +
      '</div>' +
      '<div class="pa-block">' +
      '<div class="pa-soil-chart-title">Perbandingan antar band</div>' +
      soilYearlyChartSvg(item) +
      '<div class="pa-soil-legend"><span class="pa-soil-key-bar"></span>Rata-rata<span class="pa-soil-key-range"></span>p10–p90<span class="pa-soil-key-minmax"></span>Min–Maks</div>' +
      '</div>' +
      '<div class="pa-block">' +
      '<div class="pa-soil-chart-title">Distribusi Band_1</div>' +
      soilYearlyHistHtml(item) +
      '</div>' +
      soilYearlyMetaHtml(item);
  }

  async function runSoilWeekly(item, onStatus) {
    onStatus('Mengambil metadata SOIL mingguan...');
    let meta = null;
    try {
      const resp = await fetch(SOIL_WEEKLY_META_URL + '?f=json');
      if (resp.ok) {
        const data = await resp.json();
        meta = {
          name: data.name || 'SOIL/SOIL_weekly',
          description: data.description || '',
          bandCount: data.bandCount || 4,
          bandNames: data.bandNames || [],
          pixelType: data.pixelType || 'U8',
          timeExtent: data.timeInfo && data.timeInfo.timeExtent
            ? { start: new Date(data.timeInfo.timeExtent[0]).toISOString().slice(0, 10), end: new Date(data.timeInfo.timeExtent[1]).toISOString().slice(0, 10) }
            : null,
          meanPixelSize: data.meanPixelSize || 0,
          copyright: data.copyrightText || '',
          capabilities: data.capabilities || ''
        };
      }
    } catch (e) {}

    onStatus('Mengunduh raster kelembapan tanah mingguan...');
    const size = pickSize(item.bounds);
    const params = new URLSearchParams({
      bbox: [item.bounds.west, item.bounds.south, item.bounds.east, item.bounds.north].map(function (v) { return v.toFixed(7); }).join(','),
      bboxSR: '4326',
      imageSR: '4326',
      size: size.w + ',' + size.h,
      format: 'tiff',
      f: 'image'
    });
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT);
    let blob;
    try {
      const resp = await fetch(SOIL_WEEKLY_URL + '?' + params.toString(), { signal: controller.signal });
      if (!resp.ok) throw new Error('Server SOIL mingguan menolak permintaan (HTTP ' + resp.status + ')');
      blob = await resp.blob();
    } finally {
      clearTimeout(timer);
    }

    onStatus('Membaca piksel SOIL mingguan...');
    if (!window.GeoTIFF || typeof window.GeoTIFF.fromBlob !== 'function') {
      throw new Error('Library geotiff.js belum termuat.');
    }
    const tiff = await window.GeoTIFF.fromBlob(blob);
    const image = await tiff.getImage();
    const rasters = await image.readRasters();
    if (!rasters || !rasters.length) throw new Error('Raster SOIL mingguan kosong.');

    const width = image.getWidth();
    const height = image.getHeight();
    const bb = image.getBoundingBox();
    const geo = Array.isArray(bb) && bb.length === 4 && Number.isFinite(bb[0]) && Number.isFinite(bb[2]) && bb[2] > bb[0]
      ? { minX: bb[0], minY: bb[1], maxX: bb[2], maxY: bb[3] }
      : { minX: item.bounds.west, minY: item.bounds.south, maxX: item.bounds.east, maxY: item.bounds.north };

    const mask = rasterizeMask(item.rings, { width: width, height: height, geo: geo });
    const bandStats = [];
    let totalInside = 0;
    for (let b = 0; b < rasters.length && b < SOIL_BANDS; b++) {
      const vals = rasters[b];
      const collected = [];
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i]) continue;
        if (b === 0) totalInside++;
        const v = vals[i];
        if (!Number.isFinite(v) || v === 0) continue;
        collected.push(v);
      }
      if (!collected.length) {
        bandStats.push({ band: 'Band_' + (b + 1), count: 0, mean: NaN, min: NaN, max: NaN, p10: NaN, p25: NaN, median: NaN, p75: NaN, p90: NaN, stddev: NaN, hist: SOIL_HIST_BINS.map(function () { return 0; }) });
        continue;
      }
      collected.sort(function (a, b) { return a - b; });
      const count = collected.length;
      const sum = collected.reduce(function (a, v) { return a + v; }, 0);
      const mean = sum / count;
      const variance = collected.reduce(function (a, v) { return a + (v - mean) * (v - mean); }, 0) / count;
      const stddev = Math.sqrt(variance);
      const hist = SOIL_HIST_BINS.map(function () { return 0; });
      for (let i = 0; i < collected.length; i++) {
        const bin = soilFindBin(collected[i]);
        for (let h = 0; h < SOIL_HIST_BINS.length; h++) {
          if (SOIL_HIST_BINS[h] === bin) { hist[h]++; break; }
        }
      }
      bandStats.push({
        band: 'Band_' + (b + 1),
        count: count,
        mean: mean,
        min: collected[0],
        max: collected[count - 1],
        p10: soilPercentile(collected, 10),
        p25: soilPercentile(collected, 25),
        median: soilPercentile(collected, 50),
        p75: soilPercentile(collected, 75),
        p90: soilPercentile(collected, 90),
        stddev: stddev,
        hist: hist
      });
    }

    if (!bandStats.length || !totalInside) {
      throw new Error('Tidak ada piksel SOIL mingguan valid di dalam polygon.');
    }

    item.soilWeekly = { bands: bandStats, inside: totalInside, size: size.w + '×' + size.h, meta: meta };
    return item.soilWeekly;
  }

  function soilWeeklyChartSvg(item) {
    const bands = item.soilWeekly && item.soilWeekly.bands;
    if (!bands || !bands.length) return '';
    const W = 288, H = 110, pad = { top: 10, right: 8, bottom: 22, left: 30 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;
    const maxVal = 255;
    const barW = Math.min(40, (chartW / bands.length) * 0.55);
    const gap = chartW / bands.length;
    let bars = '';
    bands.forEach(function (s, i) {
      const x = pad.left + gap * i + (gap - barW) / 2;
      const yMean = pad.top + chartH - (s.mean / maxVal) * chartH;
      const yMin = pad.top + chartH - (s.min / maxVal) * chartH;
      const yMax = pad.top + chartH - (s.max / maxVal) * chartH;
      const yP10 = pad.top + chartH - (s.p10 / maxVal) * chartH;
      const yP90 = pad.top + chartH - (s.p90 / maxVal) * chartH;
      bars += '<line x1="' + (x + barW / 2) + '" y1="' + yMin + '" x2="' + (x + barW / 2) + '" y2="' + yMax + '" stroke="#475569" stroke-width="1.2"/>';
      bars += '<rect x="' + x + '" y="' + yP90 + '" width="' + barW + '" height="' + Math.max(1, yP10 - yP90) + '" fill="#94a3b8" opacity="0.5" rx="2"/>';
      bars += '<rect x="' + x + '" y="' + yMean + '" width="' + barW + '" height="' + Math.max(1, pad.top + chartH - yMean) + '" fill="#2563eb" rx="2"/>';
      bars += '<text x="' + (x + barW / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="8" fill="#64748b">' + escapeHtml(s.band.replace('Band_', 'B')) + '</text>';
    });
    let grid = '';
    for (let v = 0; v <= 255; v += 85) {
      const y = pad.top + chartH - (v / maxVal) * chartH;
      grid += '<line x1="' + pad.left + '" y1="' + y + '" x2="' + (W - pad.right) + '" y2="' + y + '" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="2 3"/>';
      grid += '<text x="' + (pad.left - 4) + '" y="' + (y + 3) + '" text-anchor="end" font-size="7.5" fill="#94a3b8">' + v + '</text>';
    }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" style="display:block;width:100%;height:auto;overflow:visible">' +
      grid + bars +
      '<text x="' + (pad.left - 4) + '" y="' + (pad.top + 3) + '" text-anchor="end" font-size="7.5" fill="#94a3b8">255</text>' +
      '</svg>';
  }

  function soilWeeklyHistHtml(item) {
    const bands = item.soilWeekly && item.soilWeekly.bands;
    if (!bands || !bands.length) return '';
    const first = bands[0];
    if (!first.hist || !first.hist.length) return '';
    const total = first.count || 1;
    const rows = SOIL_HIST_BINS.map(function (bin, i) {
      const n = first.hist[i] || 0;
      const pct = (n / total) * 100;
      const hex = 'rgb(' + bin.rgb.join(',') + ')';
      return '<div class="pa-dist-row">' +
        '<span class="pa-dist-label">' + escapeHtml(bin.label) + '</span>' +
        '<span class="pa-dist-bar"><i style="width:' + pct.toFixed(1) + '%;background:' + hex + '"></i></span>' +
        '<b class="pa-dist-value">' + pct.toFixed(0) + '%</b>' +
        '</div>';
    }).join('');
    return '<div class="pa-dist">' + rows + '</div>';
  }

  function soilWeeklyMetaHtml(item) {
    const meta = item.soilWeekly && item.soilWeekly.meta;
    if (!meta) return '';
    const rows = [];
    if (meta.name) rows.push(metaRow('Sumber', escapeHtml(meta.name)));
    if (meta.description) rows.push(metaRow('Deskripsi', escapeHtml(meta.description)));
    if (meta.bandCount) rows.push(metaRow('Jumlah band', String(meta.bandCount)));
    if (meta.bandNames && meta.bandNames.length) rows.push(metaRow('Nama band', escapeHtml(meta.bandNames.join(', '))));
    if (meta.pixelType) rows.push(metaRow('Tipe piksel', escapeHtml(meta.pixelType)));
    if (meta.timeExtent) rows.push(metaRow('Rentang waktu', escapeHtml(meta.timeExtent.start + ' s/d ' + meta.timeExtent.end)));
    if (meta.meanPixelSize) rows.push(metaRow('Resolusi rata-rata', fmt(meta.meanPixelSize, 0) + ' m'));
    if (meta.copyright) rows.push(metaRow('Hak cipta', escapeHtml(meta.copyright)));
    if (!rows.length) return '';
    return '<details class="pa-details"><summary class="pa-summary">Metadata SOIL Mingguan</summary>' +
      '<div class="pa-block">' + rows.join('') + '</div></details>';
  }

  function soilWeeklyBlockHtml(item) {
    if (item.soilWeeklyError) {
      return '<div class="pa-block pa-block-error">' + escapeHtml(item.soilWeeklyError) + '</div>';
    }
    if (!item.soilWeekly) {
      return '';
    }
    const rows = item.soilWeekly.bands.map(function (s) {
      return '<div class="pa-soil-row">' +
        '<span class="pa-soil-band">' + escapeHtml(s.band) + '</span>' +
        '<span class="pa-soil-stat">min <b>' + fmt(s.min, 0) + '</b></span>' +
        '<span class="pa-soil-stat">rata <b>' + fmt(s.mean, 1) + '</b></span>' +
        '<span class="pa-soil-stat">maks <b>' + fmt(s.max, 0) + '</b></span>' +
        '</div>';
    }).join('');
    const detailRows = item.soilWeekly.bands.map(function (s) {
      return '<div class="pa-soil-row pa-soil-row-detail">' +
        '<span class="pa-soil-band">' + escapeHtml(s.band) + '</span>' +
        '<span class="pa-soil-stat">p10 <b>' + fmt(s.p10, 0) + '</b></span>' +
        '<span class="pa-soil-stat">p25 <b>' + fmt(s.p25, 0) + '</b></span>' +
        '<span class="pa-soil-stat">med <b>' + fmt(s.median, 0) + '</b></span>' +
        '<span class="pa-soil-stat">p75 <b>' + fmt(s.p75, 0) + '</b></span>' +
        '<span class="pa-soil-stat">p90 <b>' + fmt(s.p90, 0) + '</b></span>' +
        '<span class="pa-soil-stat">sd <b>' + fmt(s.stddev, 1) + '</b></span>' +
        '</div>';
    }).join('');
    return '<div class="pa-block">' +
      '<div class="pa-soil-grid">' + rows + '</div>' +
      '<div class="pa-soil-grid pa-soil-grid-detail">' + detailRows + '</div>' +
      '<div class="pa-meta">Raster ' + escapeHtml(item.soilWeekly.size) + ' · resolusi ~9,8 km/piksel · U8 (0–255) · ' + item.soilWeekly.inside.toLocaleString('id-ID') + ' piksel dalam polygon</div>' +
      '</div>' +
      '<div class="pa-block">' +
      '<div class="pa-soil-chart-title">Perbandingan antar band</div>' +
      soilWeeklyChartSvg(item) +
      '<div class="pa-soil-legend"><span class="pa-soil-key-bar"></span>Rata-rata<span class="pa-soil-key-range"></span>p10–p90<span class="pa-soil-key-minmax"></span>Min–Maks</div>' +
      '</div>' +
      '<div class="pa-block">' +
      '<div class="pa-soil-chart-title">Distribusi Band_1</div>' +
      soilWeeklyHistHtml(item) +
      '</div>' +
      soilWeeklyMetaHtml(item);
  }

  function soilBlockHtml(item) {
    if (item.soilError) {
      return '<div class="pa-block pa-block-error">' + escapeHtml(item.soilError) + '</div>';
    }
    if (!item.soil) {
      return '';
    }
    const rows = item.soil.bands.map(function (s) {
      return '<div class="pa-soil-row">' +
        '<span class="pa-soil-band">' + escapeHtml(s.band) + '</span>' +
        '<span class="pa-soil-stat">min <b>' + fmt(s.min, 0) + '</b></span>' +
        '<span class="pa-soil-stat">rata <b>' + fmt(s.mean, 1) + '</b></span>' +
        '<span class="pa-soil-stat">maks <b>' + fmt(s.max, 0) + '</b></span>' +
        '</div>';
    }).join('');
    const detailRows = item.soil.bands.map(function (s) {
      return '<div class="pa-soil-row pa-soil-row-detail">' +
        '<span class="pa-soil-band">' + escapeHtml(s.band) + '</span>' +
        '<span class="pa-soil-stat">p10 <b>' + fmt(s.p10, 0) + '</b></span>' +
        '<span class="pa-soil-stat">p25 <b>' + fmt(s.p25, 0) + '</b></span>' +
        '<span class="pa-soil-stat">med <b>' + fmt(s.median, 0) + '</b></span>' +
        '<span class="pa-soil-stat">p75 <b>' + fmt(s.p75, 0) + '</b></span>' +
        '<span class="pa-soil-stat">p90 <b>' + fmt(s.p90, 0) + '</b></span>' +
        '<span class="pa-soil-stat">sd <b>' + fmt(s.stddev, 1) + '</b></span>' +
        '</div>';
    }).join('');
    return '<div class="pa-block">' +
      '<div class="pa-soil-grid">' + rows + '</div>' +
      '<div class="pa-soil-grid pa-soil-grid-detail">' + detailRows + '</div>' +
      '<div class="pa-meta">Raster ' + escapeHtml(item.soil.size) + ' · resolusi ~9,8 km/piksel · U8 (0–255) · ' + item.soil.inside.toLocaleString('id-ID') + ' piksel dalam polygon</div>' +
      '</div>' +
      '<div class="pa-block">' +
      '<div class="pa-soil-chart-title">Perbandingan antar band</div>' +
      soilChartSvg(item) +
      '<div class="pa-soil-legend"><span class="pa-soil-key-bar"></span>Rata-rata<span class="pa-soil-key-range"></span>p10–p90<span class="pa-soil-key-minmax"></span>Min–Maks</div>' +
      '</div>' +
      '<div class="pa-block">' +
      '<div class="pa-soil-chart-title">Distribusi Band_1</div>' +
      soilHistHtml(item) +
      '</div>' +
      soilMetaHtml(item);
  }

  /* ── Panel & kartu ── */

  function panelEl() {
    return document.getElementById('polygonAnalysisSidebar');
  }

  function listEl() {
    return document.getElementById('polygonAnalysisList');
  }

  // Judul hanya nama fitur; jumlah polygon dibawa oleh badge #polygonAnalysisCount
  // yang diisi render(). Digit tidak boleh ikut di sini, kalau tidak keduanya
  // tampil berdampingan dan terbaca ganda (mis. "GeoFarm · 1" + "1 polygon").
  function syncTitle() {
    const title = document.getElementById('polygonAnalysisTitle');
    if (!title) return;
    title.textContent = 'GeoFarm';
  }

  function isMinimized() {
    const panel = panelEl();
    return !!state.minimized || !!(panel && panel.classList.contains('pa-min'));
  }

  // Di mode minimal tombol minimize menjadi tombol perbesar.
  function syncActions() {
    const panel = panelEl();
    const button = panel && panel.querySelector('[data-pa-action="minimize"]');
    if (!button) return;
    const label = isMinimized() ? 'Perbesar' : 'Minimalkan';
    button.setAttribute('aria-label', label);
    button.title = label;
  }

  // Tombol "Buka Analisis" di tab GeoTools. Sheet analisis tidak lagi muncul
  // sendiri begitu polygon dibuat, jadi tombol inilah yang memanggilnya.
  //
  // Letaknya di dalam tab GeoTools, bukan melayang di peta: sebagai elemen
  // dalam sheet, posisinya ikut mengalir dan tidak pernah menutupi peta.
  // Karena tidak lagi condemning di luar panel, kondisinya juga bisa lebih
  // sederhana -- cukup "ada polygon", tanpa perlu tahu panel sedang
  // terbuka atau jadi chip.
  function syncReopenChip() {
    const btn = document.getElementById('geofarmOpenAnalysisBtn');
    if (!btn) return;
    const belum = state.items.filter((item) => !item.analyzed).length;
    const count = document.getElementById('geofarmOpenCount');
    if (count) count.textContent = state.items.length + ' polygon';
    const pending = document.getElementById('geofarmOpenPending');
    if (pending) {
      pending.hidden = belum === 0;
      if (belum) pending.textContent = belum + ' belum dianalisis';
    }
    btn.hidden = state.items.length === 0;
  }

  function setMinimized(next) {
    if (window.SheetDrag) {
      if (next) window.SheetDrag.minimize('geofarm');
      else window.SheetDrag.restore('geofarm');
      syncTitle();
      syncActions();
      syncReopenChip();
      return;
    }
    const panel = panelEl();
    if (!panel) return;
    state.minimized = next === true;
    panel.classList.toggle('pa-min', state.minimized);
    panel.classList.add('pa-open');
    document.body.classList.toggle('pa-panel-open', !state.minimized);
    document.body.classList.toggle('pa-panel-minimized', state.minimized);
    syncTitle();
    syncActions();
    syncReopenChip();
  }

  function restoreFromTitle() {
    if (!isMinimized()) return;
    // Pakai openPanel supaya sidebar lain di slot kanan ikut tertutup.
    openPanel(true);
  }

  // openTab() selalu memaksa basemap ke google-maps, jadi kembalikan ke
  // Google Satellite setelah pindah tab agar overlay citra tetap terbaca.
  function keepSatelliteBasemap() {
    try {
      if (typeof window.setBaseMap === 'function') window.setBaseMap('google-satellite-kh');
    } catch (e) {
      console.warn('[GeoFarm] Gagal mempertahankan basemap satelit:', e);
    }
  }

  // Setelah polygon selesai, sidebar GeoTools ditutup supaya peta punya ruang
  // fullest. Dulu sidebar ini dibuka kembali di sini supaya hasil NDVI/soil
  // kelihatan, tetapi hasilnya kini tampil di #polygonAnalysisSidebar
  // (sheet kanan di desktop, bottom sheet di mobile) sehingga sidebar tidak
  // perlu dibuka lagi. Di mobile juga wajib ditutup: lebarnya 310px di
  // viewport ~360px sehingga menutup hampir seluruh layar, dan tidak ada
  // tombol tutup (.toggle-sidebar-btn display:none di semua viewport).
  // Pakai toggle utama agar ikon tombol & ukuran Leaflet tetap sinkron.
  //
  // #geotools-sheet ikut ditutup karena openGeotoolsSheet() memindahkan isi
  // #tab-geotools ke sana; sheet itulah yang menutupi peta, bukan #sidebar-left.
  // minimizeGeotoolsSheet() adalah toggle dan sengaja tidak dipakai: dipanggil
  // tanpa penjaga akan membuka sheet yang sedang diminimalkan.
  function hideGeotoolsSidebar() {
    var sheet = document.getElementById('geotools-sheet');
    // Sheet yang diminimalkan sudah kehilangan gs-sheet-open, jadi cukup dicek
    // satu class ini.
    if (sheet && sheet.classList.contains('gs-sheet-open')) {
      if (typeof window.closeGeotoolsSheet === 'function') {
        // SheetDrag.close() menjalankan resetAllLayers() secara default.
        // Saat membuka panel analisis, reset itu menghapus polygon dan item
        // GeoFarm tepat sebelum panel dirender.
        var wasResetting = window.__resetAllLayersRunning === true;
        if (!wasResetting) window.__resetAllLayersRunning = true;
        try {
          window.closeGeotoolsSheet();
        } finally {
          if (!wasResetting) window.__resetAllLayersRunning = false;
        }
      }
    }
    var sidebar = document.getElementById('sidebar-left');
    if (sidebar && !sidebar.classList.contains('collapsed')) {
      if (typeof window.toggleSidebar === 'function') {
        window.toggleSidebar();
      } else {
        sidebar.classList.add('collapsed');
      }
    }
    var m = window.map;
    if (m && typeof m.invalidateSize === 'function') {
      setTimeout(function () { m.invalidateSize(); }, 300);
    }
  }

  /* ── Pendaftaran sheet GeoFarm ──
     Panel GeoFarm punya tiga keadaan, bukan dua: terbuka, minimal (chip),
     dan tertutup (tombol Tutup, lalu muncul chip buka-kembali sendiri).
     State ketiga itu tetap milik modul ini; sheet-drag.js hanya memegang
     dua yang pertama, jadi onClose tidak boleh ikut mengubahnya. */
  window.SheetDrag && window.SheetDrag.register('geofarm', {
    el: 'polygonAnalysisSidebar',
    openClass: 'pa-open',
    minClass: 'pa-min',
    bodyOpen: 'pa-panel-open',
    bodyMin: 'pa-panel-minimized',
    handle: '.sheet-drag-handle',
    header: '.pa-head',
    minButton: '.pa-min-toggle',
    labelMin: 'Minimalkan',
    labelOpen: 'Perbesar'
  });

  function openPanel(expand) {
    var dd = document.querySelector('.geotools-dropdown');
    if (dd) {
      dd.value = 'geotoolsTabGeoFarm';
      dd.dispatchEvent(new Event('change'));
    }
    if (typeof window.openTab === 'function') {
      window.openTab(null, 'tab-geotools');
    }
    keepSatelliteBasemap();
    hideGeotoolsSidebar();
    setMinimized(false);
  }

  // Dipanggil saat polygon terakhir dihapus: panel ditutup penuh dan tidak
  // ada lagi yang perlu dibuka kembali. Tool gambar juga dibersihkan karena
  // jalur ini sama-sama merupakan penutupan panel.
  function closePanel() {
    state.minimized = false;
    if (window.SheetDrag) {
      window.SheetDrag.close('geofarm');
    } else {
      var panel = panelEl();
      if (panel) panel.classList.remove('pa-open', 'pa-min');
      document.body.classList.remove('pa-panel-open', 'pa-panel-minimized');
    }
    syncTitle();
    syncActions();
    syncReopenChip();
    stopGeofarmDrawTool();
  }

  // Melepas tool gambar GeoFarm dari peta. Tiga langkah, masing-masing
  // dibungkus try/catch karena kalau salah satu melempar, langkah sisanya
  // tetap harus jalan: panel tidak boleh gagal tertutup hanya karena
  // pembersihan tool gambar gagal.
  function stopGeofarmDrawTool() {
    // stopDrawSession() adalah jalur resmi: melepas L.Control.Draw dari peta,
    // menololkan drawControl supaya startDraw() berikutnya tidak memakai
    // kontrol basi, dan mengembalikan draw-chrome-hidden ke chrome gambar.
    if (typeof window.stopDrawSession === 'function') {
      try { window.stopDrawSession(); } catch (e) {
        console.warn('[GeoFarm] Gagal mengakhiri sesi gambar:', e);
      }
    }
    // Membersihkan listener draw:drawstop milik GeoFarm; listener ini tidak
    // akan dinyalakan karena kontrolnya sudah dicabut.
    if (typeof window.cancelGeofarmPolygonDraw === 'function') {
      try { window.cancelGeofarmPolygonDraw(); } catch (e) {
        console.warn('[GeoFarm] Gagal melepas tool gambar:', e);
      }
    }
    if (typeof window.setDrawHideExportActions === 'function') {
      try { window.setDrawHideExportActions(false); } catch (e) {
        console.warn('[GeoFarm] Gagal memulihkan tombol export gambar:', e);
      }
    }
    document.body.classList.remove('geofarm-draw-active');
  }

  // Dipanggil dari tombol Tutup: panel disembunyikan, tool gambar dilepas,
  // tapi polygon yang sudah ada tetap pertahankan hasilnya.
  function dismissPanel() {
    if (!state.items.length) { closePanel(); return; }
    state.minimized = false;
    if (window.SheetDrag) {
      window.SheetDrag.close('geofarm');
    } else {
      var panel = panelEl();
      if (panel) panel.classList.remove('pa-open', 'pa-min');
      document.body.classList.remove('pa-panel-open', 'pa-panel-minimized');
    }
    syncTitle();
    syncActions();
    syncReopenChip();
    if (window.map && typeof window.map.invalidateSize === 'function') {
      setTimeout(function () { window.map.invalidateSize(); }, 300);
    }
    // Paling akhir: kegagalan membersihkan tool gambar tidak boleh menahan
    // panel dari tertutup.
    stopGeofarmDrawTool();
  }

  /**
   * Badge tutupan awan.
   *
   * Dua sumber, dan ini disengaja:
   *  - Mode mandiri: angka diambil dari `item.scene`, yaitu citra yang benar
   *    benar dipakai untuk menghitung piksel. Badge dan angka pasti cocok.
   *  - Mode otomatis: angka diambil dari katalog ArcGIS yang terpisah dari
   *    citra yang dihitung server, jadi KECIL kemungkinan besar berbeda
   *    tanggal. Perilaku lama tidak diubah, tapi hasilnya diberi catatan
   *    supaya tidak dibaca sebagai kepastian.
   *
   * Ambang kelas (10 / 30) meniru ndviCloudQuality() di ndvi-analysis.js.
   * Fungsi itu tidak diekspor ke window, jadi ditiru di sini; kalau ambangnya
   * diubah di sana, ubah juga di sini.
   */
  function cloudQuality(percent) {
    if (!Number.isFinite(percent)) {
      return { short: 'Tidak tersedia', color: '#78909c' };
    }
    if (percent <= 10) return { short: 'Baik', color: '#2e7d32' };
    if (percent <= 30) return { short: 'Cukup', color: '#b26a00' };
    return { short: 'Terbatas', color: '#c62828' };
  }

  function cloudBadgeHtml(item) {
    const mandiri = item.mode === 'mandiri' && item.scene;
    const percent = mandiri
      ? item.scene.cloud
      : (item.cloud ? item.cloud.cloudPercent : NaN);
    const quality = mandiri ? cloudQuality(percent) : (item.cloud && item.cloud.quality);
    const label = quality ? quality.short : 'Tidak tersedia';
    const color = quality ? quality.color : '#78909c';
    const value = Number.isFinite(percent) ? fmt(percent, 1) + '%' : '-';

    let html = '<div class="pa-cloud">';
    html += '<span class="pa-cloud-dot" style="background:' + color + '"></span>';
    html += '<span class="pa-cloud-label">Tutupan awan</span>';
    html += '<span class="pa-cloud-value" style="color:' + color + '">' + value + '</span>';
    html += '<span class="pa-cloud-badge" style="color:' + color + ';border-color:' + color + '">' +
      escapeHtml(label) + '</span>';
    if (mandiri) {
      html += '<span class="pa-cloud-date">citra ' + escapeHtml(item.scene.date) + '</span>';
    }
    return html + '</div>';
  }


  function ndviBlockHtml(item) {
    if (item.ndviError) {
      return '<div class="pa-block pa-block-error">' + escapeHtml(item.ndviError) + '</div>';
    }
    if (!item.ndvi) {
      return '<div class="pa-block pa-block-muted">NDVI belum dihitung.</div>';
    }
    const s = item.ndvi;
    const rows = NDVI_BANDS.map(function (band) {
      const entry = s.bands.filter(function (b) { return b.band === band; })[0];
      const n = entry ? entry.count : 0;
      const pct = s.count ? (n / s.count) * 100 : 0;
      const hex = 'rgb(' + band.rgb.join(',') + ')';
      return '<div class="pa-dist-row">' +
        '<span class="pa-dist-label">' + escapeHtml(band.label) + '</span>' +
        '<span class="pa-dist-bar"><i style="width:' + pct.toFixed(1) + '%;background:' + hex + '"></i></span>' +
        '<b class="pa-dist-value">' + pct.toFixed(0) + '%</b>' +
        '</div>';
    }).join('');

    const coverageNote = s.coverage < 90
      ? '<div class="pa-warn">Cakupan piksel valid ' + s.coverage.toFixed(0) + '% — sebagian area tidak memiliki data.</div>'
      : '';

    /* Mode mandiri: tampilkan median sebagai angka utama dan tanggal citra.
       Median dipakai karena tanpa SCL piksel awan tidak bisa dibedakan dari
       tani -- nilainya sah secara matematis, jadi rerata bisa terseret ke
       bawah. Rata-rata tetap ditampilkan sebagai pembanding. */
    const manual = Number.isFinite(s.median);
    const statUtama = manual
      ? '<div class="pa-stat is-primary"><span>Median</span><b>' + fmt(s.median, 3) + '</b></div>'
      : '';
    const asal = manual && s.sceneDate
      ? 'Citra ' + escapeHtml(s.sceneDate) +
        (Number.isFinite(s.sceneCloud) ? ' · awan ' + fmt(s.sceneCloud, 1) + '%' : '') +
        (s.resolution ? ' · ' + escapeHtml(s.resolution) : '')
      : 'Raster ' + escapeHtml(item.rasterSize || '-') + ' · 10 m/piksel';

    return '<div class="pa-block">' +
      '<div class="pa-stats">' +
        statUtama +
        '<div class="pa-stat"><span>Rata-rata</span><b>' + fmt(s.mean, 3) + '</b></div>' +
        '<div class="pa-stat"><span>Min</span><b>' + fmt(s.min, 3) + '</b></div>' +
        '<div class="pa-stat"><span>Maks</span><b>' + fmt(s.max, 3) + '</b></div>' +
        '<div class="pa-stat"><span>Piksel</span><b>' + s.count.toLocaleString('id-ID') + '</b></div>' +
      '</div>' +
      coverageNote +
      (manual
        ? '<div class="pa-note">Median dipakai sebagai angka utama: lebih tahan awan. ' +
          'Nilai p10\u2013p90 ' + fmt(s.p10, 3) + ' \u2013 ' + fmt(s.p90, 3) + '.</div>'
        : '') +
      '<div class="pa-dist">' + rows + '</div>' +
      '<div class="pa-meta">' + asal + '</div>' +
      '</div>';
  }

  /** Baris metadata citra untuk satu indeks spektral. */
  function spectralMetaHtml(item) {
    const meta = item.spectralMeta;
    if (item.spectralMetaError) {
      return '<div class="pa-meta-block">' +
        '<div class="pa-warn">' + escapeHtml(item.spectralMetaError) + '</div>' +
        '</div>';
    }
    if (!meta) {
      return '<div class="pa-meta-block"><div class="pa-block-note">Metadata citra tidak tersedia.</div></div>';
    }
    const quality = meta.quality;
    const cloudValue = Number.isFinite(meta.cloudPercent)
      ? '<b style="color:' + (quality ? quality.color : '#78909c') + '">' + fmt(meta.cloudPercent, 2) + '%</b>'
      : 'Tidak tersedia';

    const rows =
      metaRow('Sumber', 'Sentinel-2 L2A (Esri)') +
      metaRow('Akuisisi (WIB)', escapeHtml(meta.imageDate || '-')) +
      metaRow('Akuisisi (UTC)', escapeHtml(meta.acquisitionUtc || '-')) +
      metaRow('Platform', escapeHtml(meta.platform || '-')) +
      metaRow('Tingkat produk', escapeHtml(meta.level || '-')) +
      metaRow('Tile MGRS', escapeHtml(meta.tile || '-')) +
      metaRow('Orbit relatif', escapeHtml(meta.orbit || '-')) +
      metaRow('Baseline', escapeHtml(meta.baseline || '-')) +
      metaRow('Tutupan awan', cloudValue);

    const product = meta.productName
      ? '<div class="pa-meta-product">' +
          '<span class="pa-meta-key">ID produk</span>' +
          '<code>' + escapeHtml(meta.productName) + '</code>' +
        '</div>'
      : '';

    return '<div class="pa-meta-block">' +
      '<div class="pa-meta-title">Metadata citra</div>' +
      rows + product +
      '</div>';
  }

  /** Judul satu analisis: nama indeks di kiri, keterangan singkat di kanan. */
  function indexHeadHtml(label, hint) {
    return '<div class="pa-item-head">' +
      '<b>' + escapeHtml(label) + '</b>' +
      '<span>' + escapeHtml(hint || '') + '</span>' +
      '</div>';
  }

  /** Rumus & sumber band, ditampilkan pada metadata tiap indeks. */
  function indexFormula(spec) {
    return spec.formula || '';
  }

  /** Tombol muat manual untuk indeks lanjutan (tanpa pembungkus baris tombol). */
  function loadButtonHtml(item, spec, busy, label) {
    return '<button class="pa-btn" type="button" data-pa-action="spectral-extra" data-pa-index="' +
      spec.key + '" data-pa-id="' + item.id + '"' + (busy ? ' disabled' : '') + '>' +
      (busy ? '<span class="pa-spin"></span> Menghitung ' + escapeHtml(spec.label) + '…' : escapeHtml(label || 'Hitung ' + spec.label)) +
      '</button>';
  }

  /* `onDemand` diberikan oleh spectralBlockHtml sesuai kelompoknya, bukan
     disimpan di spec: dengan begitu indeks yang masuk EXTRA_INDEXES pasti
     punya tombol muat tanpa perlu flag yang bisa lupa diisi. */
  function indexBlockHtml(item, spec, onDemand) {
    const busy = !!item[spec.key + 'Busy'];
    if (item[spec.key + 'Error']) {
      return '<div class="pa-block pa-block-error">' + indexHeadHtml(spec.label, spec.hint) +
        escapeHtml(item[spec.key + 'Error']) +
        (onDemand ? '<div class="pa-btn-row pa-btn-row-single">' + loadButtonHtml(item, spec, busy, 'Coba lagi') + '</div>' : '') +
        '</div>';
    }
    const s = item[spec.key];
    if (!s) {
      return '<div class="pa-block pa-block-muted">' + indexHeadHtml(spec.label, spec.hint) +
        (onDemand
          ? '<div class="pa-note">Belum dihitung. Tekan Hitung bila perlu indeks ini.</div>' +
            '<div class="pa-btn-row pa-btn-row-single">' + loadButtonHtml(item, spec, busy, 'Hitung') + '</div>'
          : escapeHtml(spec.label) + ' belum dihitung.') +
        '</div>';
    }
    const rows = spec.table.map(function (band) {
      const entry = s.bands.filter(function (b) { return b.band === band; })[0];
      const n = entry ? entry.count : 0;
      const pct = s.count ? (n / s.count) * 100 : 0;
      const hex = 'rgb(' + band.rgb.join(',') + ')';
      return '<div class="pa-dist-row">' +
        '<span class="pa-dist-label">' + escapeHtml(band.label) + '</span>' +
        '<span class="pa-dist-bar"><i style="width:' + pct.toFixed(1) + '%;background:' + hex + '"></i></span>' +
        '<b class="pa-dist-value">' + pct.toFixed(0) + '%</b>' +
        '</div>';
    }).join('');

    const coverageNote = s.coverage < 90
      ? '<div class="pa-warn">Cakupan piksel valid ' + s.coverage.toFixed(0) + '% — sebagian area tidak memiliki data.</div>'
      : '';

    const trend = item[spec.trendKey];
    const trendBusy = item[spec.trendKey + 'Busy'];
    const trendError = item[spec.trendKey + 'Error'];

    return '<div class="pa-block">' +
      indexHeadHtml(spec.label, spec.hint) +
      '<div class="pa-stats">' +
        '<div class="pa-stat"><span>Rata-rata</span><b>' + fmt(s.mean, 3) + '</b></div>' +
        '<div class="pa-stat"><span>Min</span><b>' + fmt(s.min, 3) + '</b></div>' +
        '<div class="pa-stat"><span>Maks</span><b>' + fmt(s.max, 3) + '</b></div>' +
        '<div class="pa-stat"><span>Piksel</span><b>' + s.count.toLocaleString('id-ID') + '</b></div>' +
      '</div>' +
      coverageNote +
      '<div class="pa-dist">' + rows + '</div>' +
      '<div class="pa-meta">Raster ' + escapeHtml(item.rasterSize || '-') + ' · 10 m/piksel</div>' +
      '<div class="pa-btn-row">' +
        '<button class="pa-btn pa-btn-ghost" type="button" data-pa-action="spectral-trend" data-pa-trend="' +
          spec.key + '" data-pa-id="' + item.id + '"' + (trendBusy ? ' disabled' : '') + '>' +
          (trendBusy ? 'Memuat tren ' + spec.label + '…' : escapeHtml(trendButtonLabel(item, spec))) + '</button>' +
        (onDemand ? loadButtonHtml(item, spec, busy, 'Analisis ulang') : '') +
      '</div>' +
      (trendBusy
        ? '<div class="pa-block pa-block-muted"><span class="pa-spin"></span>' +
            escapeHtml(item.busy || 'Mengambil deret waktu ' + spec.label + '…') + '</div>'
        : '') +
      (trendError
        ? '<div class="pa-block pa-block-error pa-trend-error">Tren ' + escapeHtml(spec.label) + ': ' +
            escapeHtml(trendError) + '</div>'
        : '') +
      trendBlockHtml(item, spec) +
      // Rumus & sumber adegan ditutup secara default: penting untuk ilmiah,
      // tapi tidak perlu dibaca agar paham hasil analisisnya.
      '<details class="pa-details">' +
        '<summary class="pa-summary">Rumus &amp; sumber citra</summary>' +
        '<div class="pa-block">' +
          metaRow('Rumus', escapeHtml(indexFormula(spec))) +
          metaRow('Band', escapeHtml(spec.bands
            ? spec.bands.split(',').map(trendAssetName).join(' + ')
            : rasterFunctionText(spec))) +
          metaRow('Produk', 'Sentinel-2 L2A · 10 m/piksel') +
        '</div>' +
        spectralMetaHtml(item) +
      '</details>' +
      '</div>';
  }

  /* Band yang dipakai tiap rasterFunction, ditulis eksplisit karena urutan
     band di ArcGIS tidak sama dengan penamaan Sentinel-2 (B10 Cirrus
     menyisipkan satu kolom sehingga B11 berada di posisi 12). */
  const RASTER_FUNCTION_BANDS = {
    'NDVI - with VRE Raw': 'B08 + B05',
    'NDWI Raw': 'B03 + B08',
    'Normalized Burn Ratio': 'B08 + B12',
    'NDVI - VRE only Raw': 'B06 + B05'
  };

  function rasterFunctionText(spec) {
    if (!spec.rule) return '-';
    const bands = RASTER_FUNCTION_BANDS[spec.rule];
    return bands ? bands + ' (rasterFunction ' + spec.rule + ')' : spec.rule;
  }

  /**
   * Satu section "Indeks Spektral" berisi tujuh indeks: tiga yang dihitung
   * otomatis, lalu empat yang dimuat sendiri lewat tombolnya. Dikelompokkan
   * dengan subjudul supaya jelas mana yang gratis dimuat dan mana yang perlu
   * menekan tombol -- bukan dua section terpisah, karena semuanya indeks
   * spektral yang cara membacanya sama.
   */
  function spectralBlockHtml(item) {
    const auto = SPECTRAL_INDEXES.map(function (spec) {
      return indexBlockHtml(item, spec, false);
    }).join('');

    const extra = EXTRA_INDEXES.map(function (spec) {
      return indexBlockHtml(item, spec, true);
    }).join('');

    if (!extra) return auto;
    return auto +
      '<div class="pa-subhead">Indeks lanjutan</div>' +
      '<div class="pa-note">Tidak dihitung otomatis karena tiap indeks butuh satu ' +
        'permintaan citra tersendiri. Tekan Hitung hanya untuk yang Anda perlukan.</div>' +
      extra;
  }

  const LST_BANDS = [
    { label: 'Sangat dingin', min: -Infinity, max: 15, rgb: [59, 76, 192] },
    { label: 'Dingin', min: 15, max: 22, rgb: [96, 150, 210] },
    { label: 'Sedang', min: 22, max: 28, rgb: [150, 205, 175] },
    { label: 'Hangat', min: 28, max: 33, rgb: [232, 200, 110] },
    { label: 'Panas', min: 33, max: Infinity, rgb: [190, 74, 45] }
  ];

  const LST_HINT = 'Seberapa panas permukaan lahan. Makin tinggi, makin kering dan panas tanahnya.';

  function lstBlockHtml(item) {
    if (item.lstBusy) {
      return '<div class="pa-block pa-block-muted"><span class="pa-spin"></span>' +
        escapeHtml(item.busy || 'Mengambil suhu permukaan…') + '</div>';
    }
    if (item.lstError) {
      return '<div class="pa-block pa-block-error">' + indexHeadHtml('LST', LST_HINT) +
        escapeHtml(item.lstError) + '</div>';
    }
    if (!item.lst) return '';

    const s = item.lst;
    const rows = LST_BANDS.map(function (band) {
      const entry = s.bands.filter(function (b) { return b.band === band; })[0];
      const n = entry ? entry.count : 0;
      const pct = s.count ? (n / s.count) * 100 : 0;
      const hex = 'rgb(' + band.rgb.join(',') + ')';
      return '<div class="pa-dist-row">' +
        '<span class="pa-dist-label">' + escapeHtml(band.label) + '</span>' +
        '<span class="pa-dist-bar"><i style="width:' + pct.toFixed(1) + '%;background:' + hex + '"></i></span>' +
        '<b class="pa-dist-value">' + pct.toFixed(0) + '%</b>' +
        '</div>';
    }).join('');

    return '<div class="pa-block">' +
      indexHeadHtml('LST', LST_HINT) +
      '<div class="pa-stats">' +
        '<div class="pa-stat"><span>Rata-rata</span><b>' + fmt(s.mean, 1) + ' °C</b></div>' +
        '<div class="pa-stat"><span>Min</span><b>' + fmt(s.min, 1) + ' °C</b></div>' +
        '<div class="pa-stat"><span>Maks</span><b>' + fmt(s.max, 1) + ' °C</b></div>' +
        '<div class="pa-stat"><span>Piksel</span><b>' + s.count.toLocaleString('id-ID') + '</b></div>' +
      '</div>' +
      '<div class="pa-dist">' + rows + '</div>' +
      (s.coverage < 90
        ? '<div class="pa-warn">Cakupan piksel suhu valid ' + s.coverage.toFixed(0) + '% — sebagian area tidak memiliki nilai suhu yang dapat dihitung.</div>'
        : '') +
      '<div class="pa-warn">LST berasal dari mosaik Landsat. Tanggal citra dapat berbeda antar piksel dan tidak selalu sama dengan citra Sentinel-2. ' +
        'Mosaik Best tidak menjamin semua piksel bebas awan.</div>' +
      '<details class="pa-details">' +
        '<summary class="pa-summary">Sumber &amp; tanggal citra</summary>' +
        '<div class="pa-block">' +
          metaRow('Satelit', escapeHtml(s.platform || '-')) +
          metaRow('Tanggal ambil', escapeHtml(s.date || '-')) +
          metaRow('Resolusi', '30 m/piksel') +
          metaRow('Kualitas', 'Mosaik Best; awan dapat memengaruhi sebagian piksel') +
          metaRow('Piksel terbaca', s.count.toLocaleString('id-ID') + ' dari ' + (s.inside || 0).toLocaleString('id-ID')) +
        '</div>' +
      '</details>' +
      '</div>';
  }

  const NDVI_CBAR_MIN = -1;
  const NDVI_CBAR_MAX = 1;

  function ndviColorbarHtml() {
    const toPct = function (v) { return ((v - NDVI_CBAR_MIN) / (NDVI_CBAR_MAX - NDVI_CBAR_MIN)) * 100; };
    const stops = NDVI_BANDS.map(function (band) {
      const lo = band.min === -Infinity ? NDVI_CBAR_MIN : band.min;
      const hi = band.max === Infinity ? NDVI_CBAR_MAX : band.max;
      const hex = 'rgb(' + band.rgb.join(',') + ')';
      return hex + ' ' + toPct(lo).toFixed(2) + '%, ' + hex + ' ' + toPct(hi).toFixed(2) + '%';
    }).join(', ');

    const ticks = [
      { v: -1, t: '-1' }, { v: -0.5, t: '-0,5' }, { v: 0, t: '0' },
      { v: 0.2, t: '0,2' }, { v: 0.4, t: '0,4' }, { v: 0.6, t: '0,6' },
      { v: 0.8, t: '0,8' }, { v: 1, t: '1' }
    ];
    const tickHtml = ticks.map(function (tk) {
      return '<span class="pa-cbar-tick" style="left:' + toPct(tk.v).toFixed(2) + '%">' + tk.t + '</span>';
    }).join('');

    const classHtml = NDVI_BANDS.map(function (band) {
      const hex = 'rgb(' + band.rgb.join(',') + ')';
      return '<span class="pa-cbar-class"><i style="background:' + hex + '"></i>' + escapeHtml(band.label) + '</span>';
    }).join('');

    return '<div class="pa-cbar">' +
      '<div class="pa-cbar-bar" style="background:linear-gradient(90deg,' + stops + ')"></div>' +
      '<div class="pa-cbar-ticks">' + tickHtml + '</div>' +
      '<div class="pa-cbar-classes">' + classHtml + '</div>' +
      '</div>';
  }

  function terrainBlockHtml(item) {
    if (item.terrainError) {
      return '<div class="pa-block pa-block-error">' + escapeHtml(item.terrainError) + '</div>';
    }
    if (!item.terrain) {
      return '<div class="pa-block pa-block-muted">Topografi belum dihitung.</div>';
    }
    const t = item.terrain;
    const source = t.elevSourceLabel
      ? '<div class="pa-block-note">' + escapeHtml(t.elevSourceLabel) + '</div>'
      : '';
    return '<div class="pa-block">' +
      '<div class="pa-stats">' +
        '<div class="pa-stat"><span>Elevasi min</span><b>' + fmt(t.elevMin, 0) + ' m</b></div>' +
        '<div class="pa-stat"><span>Elevasi maks</span><b>' + fmt(t.elevMax, 0) + ' m</b></div>' +
        '<div class="pa-stat"><span>Kemiringan</span><b>' + fmt(t.slopeAvg, 1) + '°</b></div>' +
        '<div class="pa-stat"><span>Lereng curam</span><b>' + fmt(t.steepPct, 0) + '%</b></div>' +
      '</div>' +
      source +
      '<button class="pa-btn pa-btn-ghost" type="button" data-pa-action="terrain-overlay" data-pa-id="' + item.id + '">' +
        (state.terrainOwner === item.id ? 'Tampilkan ulang overlay' : 'Tampilkan overlay kemiringan') +
      '</button>' +
      '</div>';
  }

  function metaRow(label, value) {
    if (value === null || value === undefined || value === '') return '';
    return '<div class="pa-meta-row"><span class="pa-meta-key">' + escapeHtml(label) + '</span>' +
      '<span class="pa-meta-val">' + value + '</span></div>';
  }

  function resolutionText(res) {
    if (!res || res.low === null) return null;
    if (res.min !== null && res.max !== null && (res.min !== res.low || res.max !== res.low)) {
      return escapeHtml(res.low) + ' m (rentang ' + escapeHtml(res.min) + '–' + escapeHtml(res.max) + ' m)';
    }
    return escapeHtml(res.low) + ' m';
  }

  function metadataBlockHtml(item) {
    const cloud = item.cloud;
    // Tetap tampilkan pesan walau data lama masih ada, agar pengguna tahu itu refresh yang gagal.
    const errorHtml = item.cloudError
      ? '<div class="pa-block pa-block-error">' + escapeHtml(item.cloudError) + '</div>'
      : '';
    if (!cloud) {
      return errorHtml + '<div class="pa-block pa-block-muted">Metadata citra belum diambil. Klik <b>Perbarui awan</b> di atas.</div>';
    }

    const quality = cloud.quality;
    const rows =
      metaRow('Platform', escapeHtml(cloud.platform || '-')) +
      metaRow('Tingkat produk', escapeHtml(cloud.level || '-')) +
      metaRow('Tile MGRS', escapeHtml(cloud.tile || '-')) +
      metaRow('Orbit relatif', escapeHtml(cloud.orbit || '-')) +
      metaRow('Baseline', escapeHtml(cloud.baseline || '-')) +
      metaRow('Resolusi', resolutionText(cloud.resolution)) +
      metaRow('Akuisisi (WIB)', escapeHtml(cloud.imageDate || '-')) +
      metaRow('Akuisisi (UTC)', escapeHtml(cloud.acquisitionUtc || '-')) +
      metaRow('Waktu sensing', escapeHtml(cloud.sensingUtc || '-')) +
      metaRow('Tutupan awan', '<b style="color:' + (quality ? quality.color : '#78909c') + '">' +
        (Number.isFinite(cloud.cloudPercent) ? fmt(cloud.cloudPercent, 2) + '%' : 'Tidak tersedia') + '</b>') +
      metaRow('Kategori katalog', escapeHtml(cloud.category === null ? '-' : String(cloud.category))) +
      metaRow('Format data', escapeHtml(cloud.dataFormat || '-')) +
      metaRow('Object ID', escapeHtml(cloud.objectId === null ? '-' : String(cloud.objectId)));

    const product = cloud.productName
      ? '<div class="pa-meta-product">' +
          '<span class="pa-meta-key">ID produk</span>' +
          '<code title="Salin ID produk ESA">' + escapeHtml(cloud.productName) + '</code>' +
          '<button class="pa-copy" type="button" data-pa-action="copy-product" data-pa-id="' + item.id +
          '" title="Salin ID produk">salin</button>' +
        '</div>'
      : '';

    const actions = cloud.footprint
      ? '<button class="pa-btn pa-btn-ghost" type="button" data-pa-action="footprint" data-pa-id="' + item.id + '">' +
          (state.footprintOwner === item.id ? 'Sembunyikan area citra' : 'Lihat area citra') +
        '</button>'
      : '';

    return '<div class="pa-block pa-meta-block">' +
      '<div class="pa-meta-title">Metadata citra acuan</div>' +
      errorHtml +
      rows + product + actions +
      '<div class="pa-meta-note">Citra acuan dipilih dari katalog berdasarkan tutupan awan terendah pada area ini. ' +
      'Raster NDVI mengikuti mosaik bawaan layanan, sehingga tanggalnya dapat berbeda.</div>' +
      '</div>';
  }

  function showFootprint(item) {
    if (!mapReady() || !item.cloud || !item.cloud.footprint) return;
    if (state.footprint) {
      map.removeLayer(state.footprint);
      state.footprint = null;
    }
    if (state.footprintOwner === item.id) {
      state.footprintOwner = null;
      return;
    }
    const group = L.layerGroup();
    item.cloud.footprint.forEach(function (ring) {
      group.addLayer(L.polygon(ring.map(function (pt) { return [pt[1], pt[0]]; }), {
        color: '#0ea5e9',
        weight: 1.5,
        opacity: 0.9,
        fillColor: '#0ea5e9',
        fillOpacity: 0.05,
        dashArray: '5,4'
      }));
    });
    group.addTo(map);
    state.footprint = group;
    state.footprintOwner = item.id;
  }

  function copyWithExecCommand(text) {
    // Fallback untuk konteks non-secure atau saat izin clipboard ditolak.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (error) { ok = false; }
    document.body.removeChild(area);
    return ok;
  }

  function copyProductId(button, item) {
    const text = item.cloud && item.cloud.productName;
    if (!text) return;
    const done = function (ok) {
      const original = button.getAttribute('data-pa-label') || button.textContent;
      button.setAttribute('data-pa-label', original);
      button.textContent = ok ? 'tersalin' : 'gagal';
      setTimeout(function () {
        if (button.isConnected) button.textContent = original;
      }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { done(true); },
        function () { done(copyWithExecCommand(text)); }
      );
      return;
    }
    done(copyWithExecCommand(text));
  }

  function cardHtml(item) {
    // Peringatan "geometri diubah" hanya relevan kalau sudah ada hasil di
    // bawahnya. Polygon hasil unggah yang belum dianalisis akan ikut
    // bertanda stale saat diedit, dan memunculkan peringatan yang tidak
    // punya maksud.
    const stale = item.stale && item.analyzed
      ? '<div class="pa-stale">Geometri diubah — hasil di bawah belum diperbarui. ' +
        '<button class="pa-link" type="button" data-pa-action="rerun" data-pa-id="' + item.id + '">Analisis ulang</button></div>'
      : '';

    const busy = item.busy
      ? '<div class="pa-status"><span class="pa-spin"></span>' + escapeHtml(item.busy) + '</div>'
      : '';

    // Polygon hasil unggah belum dianalisis. Section hasil disembunyikan
    // sampai analisis benar-benar dijalankan, supaya kartu tidak menampilkan
    // colorbar dan tombol tren yang belum ada artinya.
    //
    // Di mode mandiri blok ini TIDAK ditampilkan. Wizard-nya sudah punya
    // tombol "Hitung index terpilih", jadi dua tombol analisis berdampingan
    // di satu kartu membuat pengguna tidak tahu mana yang dipakai -- dan
    // yang salah akan menjalankan jalur otomatis tanpa sengaja.
    const analyzeBlock = (item.analyzed || item.mode === 'mandiri') ? '' :
      '<div class="pa-pending">' +
        (item.analyzeBusy ? '' :
          '<div class="pa-pending-text">Belum dianalisis. Luas sudah dihitung; tekan Analisis untuk menghitung NDVI, indeks spektral, dan topografi.</div>') +
        '<div class="pa-btn-row">' +
          '<button class="pa-btn pa-btn-primary" type="button" data-pa-action="analyze" data-pa-id="' + item.id + '"' +
            (item.analyzeBusy ? ' disabled' : '') + '>' +
            (item.analyzeBusy ? 'Menganalisis…' : 'Analisis') + '</button>' +
        '</div>' +
      '</div>';

    const title = item.name ? escapeHtml(item.name) : 'GeoFarm';
    const sourceTag = item.source === 'upload'
      ? '<span class="pa-card-source">Unggah</span>'
      : '';

    const head = '<div class="pa-card-head">' +
        '<div class="pa-card-title">' +
          '<span class="pa-card-index">' + item.index + '</span>' +
          '<span>' + title + '</span>' +
          sourceTag +
        '</div>' +
        '<div class="pa-card-tools">' +
          '<button class="pa-icon" type="button" title="Hapus polygon" aria-label="Hapus polygon" data-pa-action="remove" data-pa-id="' + item.id + '">&#xd7;</button>' +
        '</div>' +
      '</div>';

    /* Dua arah untuk analysis yang sudah selesai: jalankan ulang, atau
       kosongkan. Tombol "Analisis" di analyzeBlock hanya muncul selama
       item belum dianalisis, jadi tanpa dua tombol ini tidak ada jalan
       kembali setelah adegan yang salah dipilih atau vertex diedit --
       satu-satunya jalan adalah menggambar ulang petak.

       Diletakkan di kartu, bukan di section NDVI, karena yang diulang
       adalah seluruh rantai analisis (NDVI, indeks spektral, topografi),
       bukan hanya satu section. */
    const reanalyzeBlock = item.analyzed ?
      '<div class="pa-btn-row pa-btn-row-reanalyze">' +
        '<button class="pa-btn pa-btn-ghost" type="button" data-pa-action="reanalyze" data-pa-id="' + item.id + '"' +
          (item.analyzeBusy ? ' disabled' : '') + '>' +
          (item.analyzeBusy ? 'Menganalisis ulang…' : 'Analisis ulang') + '</button>' +
        '<button class="pa-btn pa-btn-ghost" type="button" data-pa-action="reset-analysis" data-pa-id="' + item.id + '"' +
          (item.analyzeBusy ? ' disabled' : '') + '>' +
          'Reset analisis</button>' +
      '</div>' : '';

    const cardOpen = '<div class="pa-card' + (item.stale ? ' pa-card-stale' : '') + '" data-pa-id="' + item.id + '">';
    const cardInfo = '<div class="pa-area">' + fmt(item.areaHa, 2) + ' ha · ' + (item.pointCount || 0) + ' titik sample</div>' +
      // Daftar langkah di kartu sengaja dihapus: setiap analisis sudah punya
      // tombolnya sendiri di section terkait, dan tombol Export di kepala panel
      // baru muncul setelah semuanya selesai. Block pengingat hanya
      // menduplikasi info yang sudah ada di tempat yang lebih wajar.
      modePickerHtml(item) + analyzeBlock + reanalyzeBlock + manualBlockHtml(item) + stale + busy;

  /* ---- Kebutuhan air hanya ada di dalam hasil analisis.
     Dulu section ini ikut ditambahkan di jalur return lebih awal, jadi
     muncul sendirian sebelum Analisis ditekan -- alasannya waktu itu ia
     hanya butuh geometri polygon, tidak perlu menunggu citra. Sekarang ia
     berdiri di antara hasil citra (tepat di bawah LST) dan diperlakukan
     sebagai bagian dari hasil analisis: menampilkan hitungan kebutuhan air
     di luar hasil analisis membuatnya tidak jelas -- bukan hasil analisis,
     tapi bukan pula bagian dari petak yang belum dianalisis. */
    if (!item.analyzed) return cardOpen + head + cardInfo + '</div>';

    return cardOpen + head + cardInfo +
      '<div class="pa-section' + (isSectionCollapsed(item, 'ndvi') ? ' is-collapsed' : '') + '">' +
        sectionHeadHtml(item, 'ndvi', 'NDVI', ndviEyeBtnHtml(item)) +
        '<div class="pa-section-body">' +
        ndviColorbarHtml() +
        cloudBadgeHtml(item) +
        '<div class="pa-btn-row">' +
          '<button class="pa-btn pa-btn-ghost" type="button" data-pa-action="cloud" data-pa-id="' + item.id + '">Perbarui awan</button>' +
          '<button class="pa-btn pa-btn-ghost" type="button" data-pa-action="ndvi-trend" data-pa-id="' + item.id + '"' +
            (item.ndviTrendBusy ? ' disabled' : '') + '>' +
            (item.ndviTrendBusy ? 'Memuat tren…' : trendButtonLabel(item)) + '</button>' +
        '</div>' +
        ndviBlockHtml(item) +
        (item.ndviTrendBusy ? '<div class="pa-block pa-block-muted"><span class="pa-spin"></span>' + escapeHtml(item.busy || 'Mengambil deret waktu NDVI…') + '</div>' : '') +
        (item.ndviTrendError
          ? '<div class="pa-block pa-block-error pa-trend-error">Tren NDVI: ' + escapeHtml(item.ndviTrendError) + '</div>'
          : '') +
        trendBlockHtml(item) +
        '<details class="pa-details"' + (item.cloud ? ' open' : '') + '>' +
          '<summary class="pa-summary">Metadata citra</summary>' +
          metadataBlockHtml(item) +
        '</details>' +
        '</div>' +
      '</div>' +
      '<div class="pa-section' + (isSectionCollapsed(item, 'spectral') ? ' is-collapsed' : '') + '">' +
        sectionHeadHtml(item, 'spectral', 'Indeks Spektral') +
        '<div class="pa-section-body">' +
        spectralBlockHtml(item) +
        '</div>' +
      '</div>' +
      '<div class="pa-section' + (isSectionCollapsed(item, 'lst') ? ' is-collapsed' : '') + '">' +
        sectionHeadHtml(item, 'lst', 'Suhu Permukaan (LST)') +
        '<div class="pa-section-body">' +
        '<div class="pa-btn-row">' +
          '<button class="pa-btn pa-btn-ghost" type="button" data-pa-action="lst" data-pa-id="' + item.id + '"' +
            (item.lstBusy ? ' disabled' : '') + '>' +
            (item.lstBusy ? 'Memuat…' : (item.lst ? 'Muat ulang suhu' : 'Ambil suhu permukaan')) + '</button>' +
        '</div>' +
        lstBlockHtml(item) +
        '</div>' +
      '</div>' +
      /* Kebutuhan air tepat di bawah LST: keduanya soal kondisi permukaan
         lahan yang terukur (suhu dan air), jadi berdekatan. Tidak
         diletakkan paling akhir karena topografi dan kelembapan tanah punya
         sifat berbeda -- keduanya data tanah, bukan hasil pengukuran
         permukaan. */
      weatherSectionHtml(item) +
      airSectionHtml(item) +
      '<div class="pa-section' + (isSectionCollapsed(item, 'terrain') ? ' is-collapsed' : '') + '">' +
        sectionHeadHtml(item, 'terrain', 'Topografi', terrainEyeBtnHtml(item)) +
        '<div class="pa-section-body">' +
        terrainBlockHtml(item) +
        '</div>' +
      '</div>' +
      '<div class="pa-section' + (isSectionCollapsed(item, 'soil') ? ' is-collapsed' : '') + '">' +
        sectionHeadHtml(item, 'soil', 'Karakteristik Tanah') +
        '<div class="pa-section-body">' +
        (item.soilBusy ? '<div class="pa-block pa-block-muted"><span class="pa-spin"></span>' + escapeHtml(item.busy || 'Mengambil data kelembapan tanah…') + '</div>' : '') +
        soilBlockHtml(item) +
        (item.soilWeeklyBusy ? '<div class="pa-block pa-block-muted"><span class="pa-spin"></span>' + escapeHtml(item.busy || 'Mengambil data kelembapan tanah mingguan…') + '</div>' : '') +
        soilWeeklyBlockHtml(item) +
        (item.soilYearlyBusy ? '<div class="pa-block pa-block-muted"><span class="pa-spin"></span>' + escapeHtml(item.busy || 'Mengambil data kelembapan tanah tahunan…') + '</div>' : '') +
        soilYearlyBlockHtml(item) +
        '<div class="pa-sg-subsection"><h4>Karakteristik tanah · SoilGrids</h4>' +
        soilGridsCaveatHtml() +
        '<button class="pa-btn pa-btn-ghost" type="button" data-pa-action="soilgrids" data-pa-id="' + item.id + '"' +
          (item.soilGridsBusy ? ' disabled' : '') + '>' +
          (item.soilGridsBusy ? 'Mengambil SoilGrids…' : (item.soilGrids ? 'Perbarui analisis SoilGrids' : 'Analisis polygon dengan SoilGrids')) + '</button>' +
        (item.soilGridsBusy ? '<div class="pa-block pa-block-muted"><span class="pa-spin"></span>' + escapeHtml(item.soilGridsProgress || 'Mengambil prediksi tanah…') + '</div>' : '') +
        soilGridsBlockHtml(item) +
        '</div>' +
        '<div class="pa-btn-row">' +
          '<button class="pa-btn pa-btn-ghost" type="button" data-pa-action="soil-weekly" data-pa-id="' + item.id + '"' +
            (item.soilWeeklyBusy ? ' disabled' : '') + '>' +
            (item.soilWeeklyBusy ? 'Memuat…' : 'Analisis SOIL_weekly') + '</button>' +
          '<button class="pa-btn pa-btn-ghost" type="button" data-pa-action="soil" data-pa-id="' + item.id + '"' +
            (item.soilBusy ? ' disabled' : '') + '>' +
            (item.soilBusy ? 'Memuat…' : 'Analisis SOIL_monthly') + '</button>' +
        '</div>' +
        '<div class="pa-btn-row">' +
          '<button class="pa-btn pa-btn-ghost" type="button" data-pa-action="soil-yearly" data-pa-id="' + item.id + '"' +
            (item.soilYearlyBusy ? ' disabled' : '') + '>' +
            (item.soilYearlyBusy ? 'Memuat…' : 'Analisis SOIL_yearly') + '</button>' +
        '</div>' +
        '</div>' +
      '</div>' +
      '</div>';
  }


  /* Fungsi mode mandiri: dulunya tersesat di dalam cardHtml, jadi tidak
     terlihat oleh onPanelClick dan melempar ReferenceError saat tombol
     diklik. Dipindahkan ke scope modul. */
  /* ---- UI dua mode analisis -------------------------------------------
     Bentuknya mengikuti ArcGIS (design system Calcite): dua kartu opsi
     sejajar, keadaan aktif terisi penuh bukan sekadar garis bawah, ikon 16px,
     dan micro-label kapital. Tujuannya supaya pilihan ini terbaca sebagai
     keputusan penting -- bukan sekadar tombol kecil di antara bagian lain. */

  /* Ikon digambar inline supaya tidak menambah request HTTP dan warnanya
     otomatis mengikuti currentColor, termasuk pada keadaan aktif. */
  const ICON_AUTO =
    '<svg class="pa-mode-ico" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' +
    '<path d="M8.9 1 3.1 8.5h3.4L5.9 15l5.9-7.7H8.2z" fill="currentColor"/></svg>';

  const ICON_MANUAL =
    '<svg class="pa-mode-ico" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' +
    '<path d="M1.5 4.4h4.1M8.4 4.4h6.1M1.5 11.6h2.9M7.2 11.6h7.3" stroke="currentColor" ' +
    'stroke-width="1.3" stroke-linecap="round" fill="none"/>' +
    '<rect x="6.6" y="2.7" width="2" height="3.4" rx="0.6" fill="currentColor"/>' +
    '<rect x="5.1" y="9.9" width="2" height="3.4" rx="0.6" fill="currentColor"/></svg>';

  function modePickerHtml(item) {
    const auto = item.mode !== 'mandiri';
    const opt = function (value, title, desc, ikon, aktif) {
      return '<button class="pa-mode-opt' + (aktif ? ' is-on' : '') + '" type="button" ' +
        'data-pa-action="set-mode" data-pa-value="' + value + '" ' +
        'data-pa-id="' + item.id + '" aria-pressed="' + (aktif ? 'true' : 'false') + '">' +
        ikon +
        '<span class="pa-mode-txt">' +
          '<span class="pa-mode-title">' + title + '</span>' +
          '<span class="pa-mode-desc">' + desc + '</span>' +
        '</span>' +
        '</button>';
    };
    return '<div class="pa-mode">' +
      '<div class="pa-mode-head">' +
        '<span class="pa-mode-label">Mode analisis</span>' +
        '<span class="pa-mode-sub">pilih cara citra diambil</span>' +
      '</div>' +
      '<div class="pa-mode-opts" role="group" aria-label="Mode analisis">' +
        opt('auto', 'Otomatis', 'Citra terbaru, NDVI + 3 index', ICON_AUTO, auto) +
        opt('mandiri', 'Mandiri',
          'Pilih citra, awan, dan index sendiri', ICON_MANUAL, !auto) +
      '</div>' +
      /* Catatan hanya untuk mode Mandiri. Mode Otomatis tidak diberi catatan
         sama sekali: penjelasannya soal "jalur lama" dan "badge awan hanya
         estimasi" sudah dihapus karena tidak membantu user memilih, dan
         mode itu memang pilihan paling sederhana. */
      (auto ? ''
        : '<p class="pa-mode-note">Mandiri memakai citra yang Anda pilih. Tanggal ikut '
          + 'ditampilkan di setiap hasil, dan badge awan berasal dari citra yang sama.</p>') +
      '</div>';
  }

  function sceneListHtml(item) {
  if (item.sceneListBusy) {
    return '<div class="pa-block pa-block-muted"><span class="pa-spin"></span>Mencari citra Sentinel-2 untuk area ini…</div>';
  }
  if (item.sceneListError) {
    return '<div class="pa-block pa-block-error">' + escapeHtml(item.sceneListError) + '</div>';
  }
  if (!item.sceneList || !item.sceneList.length) return '';
  
  const baris = item.sceneList.map(function (s) {
    const dipilih = item.scene && item.scene.date === s.date;
    const cloud = Number.isFinite(s.cloud)
      ? '<span class="pa-scene-cloud' + (s.cloud > TREND_CLOUD_HIGH ? ' is-high' : '') + '">' +
        fmt(s.cloud, 1) + '%</span>'
      : '<span class="pa-scene-cloud">-</span>';
    return '<button class="pa-scene' + (dipilih ? ' is-active' : '') + '" type="button" ' +
      'data-pa-action="pick-scene" data-pa-date="' + escapeHtml(s.date) + '" data-pa-id="' + item.id + '">' +
      '<span class="pa-scene-date">' + escapeHtml(s.date) + '</span>' +
      cloud +
      '<span class="pa-scene-sat">' + escapeHtml(s.platform || '-') + '</span>' +
      '</button>';
  }).join('');
  
  return '<div class="pa-scene-list">' + baris + '</div>';
    }
  
    function manualBlockHtml(item) {
  if (item.mode !== 'mandiri') return '';
  const picked = item.picked || [];
  const cekIndex = PICKABLE_KEYS.map(function (key) {
    const spec = COMPUTE_SPECS[key];
    const on = picked.indexOf(key) !== -1;
    return '<label class="pa-idx' + (on ? ' is-on' : '') + '">' +
      '<input type="checkbox" data-pa-index="' + key + '" data-pa-id="' + item.id + '"' +
      (on ? ' checked' : '') + '>' +
      '<span class="pa-idx-name">' + escapeHtml(spec.label) + '</span>' +
      '<span class="pa-idx-formula">' + escapeHtml(spec.formula || '') + '</span>' +
      '</label>';
  }).join('');
  
  const sceneDipilih = item.scene
    ? '<div class="pa-block pa-scene-picked">Dipakai: <b>' + escapeHtml(item.scene.date) + '</b>' +
      (Number.isFinite(item.scene.cloud) ? ' · awan ' + fmt(item.scene.cloud, 1) + '%' : '') +
      (item.scene.platform ? ' · ' + escapeHtml(item.scene.platform) : '') + '</div>'
    : '<div class="pa-block pa-block-muted">Belum ada citra dipilih.</div>';
  
  return '<div class="pa-pending pa-manual">' +
    '<div class="pa-manual-step">' +
      '<div class="pa-subhead">1. Pilih citra</div>' +
      '<div class="pa-note">Nomor tutupan awan berasal dari metadata citra. Makin kecil, makin sedikit awan.</div>' +
      '<div class="pa-btn-row">' +
        '<button class="pa-btn pa-btn-ghost" type="button" data-pa-action="scenes" data-pa-id="' + item.id + '"' +
        (item.sceneListBusy ? ' disabled' : '') + '>' +
        (item.sceneListBusy ? 'Mencari…' : (item.sceneList ? 'Cari ulang' : 'Cari citra')) + '</button>' +
        '<label class="pa-inline">Batas awan ' +
          '<input class="pa-num" type="number" min="0" max="100" step="5" value="' +
          (Number.isFinite(item.sceneCloudLimit) ? item.sceneCloudLimit : 20) + '" ' +
          'data-pa-cloud-limit data-pa-id="' + item.id + '">%</label>' +
        '<label class="pa-inline">Periode ' +
          '<input class="pa-num" type="number" min="1" max="36" step="1" value="' +
          (Number.isFinite(item.sceneMonths) ? item.sceneMonths : 6) + '" ' +
          'data-pa-months data-pa-id="' + item.id + '">bln</label>' +
      '</div>' +
      sceneListHtml(item) +
      sceneDipilih +
    '</div>' +
    '<div class="pa-manual-step">' +
      '<div class="pa-subhead">2. Pilih index</div>' +
      '<div class="pa-idx-grid">' + cekIndex + '</div>' +
    '</div>' +
    '<div class="pa-manual-step">' +
      '<div class="pa-subhead">3. Jalankan</div>' +
      '<div class="pa-btn-row">' +
        '<button class="pa-btn pa-btn-primary" type="button" data-pa-action="run-manual" data-pa-id="' + item.id + '"' +
        (item.runBusy || !item.scene ? ' disabled' : '') + '>' +
        (item.runBusy ? 'Menghitung…' : 'Hitung index terpilih') + '</button>' +
      '</div>' +
      '<label class="pa-check"><input type="checkbox" data-pa-scl' +
        (item.sclMask ? ' checked' : '') + ' data-pa-id="' + item.id + '">' +
        'Masking awan per-piksel (SCL)</label>' +
      '<div class="pa-note">SCL beresolusi 20 m, sedangkan band 10 m. Mengaktifkannya menurunkan ' +
        'resolusi hasil ke 20 m. Nonaktif, median dipakai sebagai angka utama agar awan tidak ' +
        'menggeser rerata.</div>' +
      '<label class="pa-inline">Jendela piksel ' +
        '<input class="pa-num" type="number" min="32" max="1024" step="32" value="' +
        (Number.isFinite(item.pixelCap) ? item.pixelCap : 640) + '" data-pa-pixel-cap data-pa-id="' + item.id + '">px</label>' +
      (item.runBusy ? '<div class="pa-block pa-block-muted"><span class="pa-spin"></span>' +
        escapeHtml(item.busy || 'Menghitung…') + '</div>' : '') +
      (item.manualError ? '<div class="pa-block pa-block-error">' + escapeHtml(item.manualError) + '</div>' : '') +
      manualResultHtml(item) +
    '</div>' +
  '</div>';
    }
  
    function manualResultHtml(item) {
  if (!item.manualResult) return '';
  const r = item.manualResult;
  const scene = item.scene;
  let html = '<div class="pa-block pa-manual-result">';
  html += '<div class="pa-manual-head">';
  html += 'Dari citra <b>' + escapeHtml(scene ? scene.date : '-') + '</b>';
  if (scene && Number.isFinite(scene.cloud)) {
    html += ' · awan ' + fmt(scene.cloud, 1) + '%';
  }
  html += '</div>';
  if (r.done && r.done.length) {
    html += '<div class="pa-note">Terhitung: ' +
      r.done.map(function (k) { return escapeHtml(COMPUTE_SPECS[k].label); }).join(', ') + '</div>';
  }
  if (r.gagal && r.gagal.length) {
    html += '<div class="pa-block pa-block-error">Gagal: ' +
      r.gagal.map(function (k) { return escapeHtml(COMPUTE_SPECS[k].label); }).join(', ') + '</div>';
  }
  if (r.semuaGagal) {
    html += '<div class="pa-note">Tidak ada index yang berhasil dihitung. Lekak pesan error di ' +
      'section tiap index untuk melihat alasannya.</div>';
  }
  return html + '</div>';
    }
  
    /* ---- Aksi mode mandiri ------------------------------------------------ */
  
    /**
     * Ganti mode analisis satu polygon.
     *
     * Hasil mode sebelumnya tidak dihapus: berpindah ke mode lain lalu kembali
     * akan mendapat hasil lama kembali utuh, dan angka yang sudah dibaca user
     * tidak berubah diam-diam. Yang dibersihkan hanya penanda error, supaya
     * pesan kegagalan lama tidak ikut tampil sebagai kegagalan pada mode lain.
     */
    function setItemMode(item, value) {
  const next = value === 'mandiri' ? 'mandiri' : 'auto';
  if (item.mode === next) return;
  item.mode = next;
  item.manualError = null;
  if (next === 'mandiri') {
    item.manualResult = null;
  }
  // Kalau sudah pernah dianalisis di mode lain, analyzed tetap true supaya
  // section hasil ikut tampil; kalau belum, kartu tetap menampilkan wizard.
    render();
  }

  function runSceneList(item) {
  if (item.sceneListBusy) return;
  item.sceneListBusy = true;
  item.sceneListError = null;
  item.busy = 'Mencari citra Sentinel-2…';
  render();
  return stacListScenes(item.bounds, {
    cloudLimit: item.sceneCloudLimit,
    months: item.sceneMonths
  }).then(function (list) {
    item.sceneList = list;
    // Adegan terbersih langsung dipilih supaya user tidak wajib klik dua kali
    // untuk melihat sesuatu yang jalan.
    if (list && list.length && !item.scene) {
      item.scene = list.reduce(function (best, s) {
        if (!best) return s;
        const a = Number.isFinite(best.cloud) ? best.cloud : 999;
        const b = Number.isFinite(s.cloud) ? s.cloud : 999;
        return b < a ? s : best;
      }, null);
    }
  }).catch(function (error) {
    item.sceneList = null;
    item.sceneListError = error && error.message
      ? error.message
      : 'Gagal mencari citra untuk area ini.';
  }).then(function () {
    item.sceneListBusy = false;
    item.busy = null;
    render();
  });
    }
  
    function pickScene(item, date) {
  if (!item.sceneList) return;
  const found = item.sceneList.filter(function (s) { return s.date === date; })[0];
  if (!found) return;
  item.scene = found;
  item.manualResult = null;
  item.manualError = null;
  render();
    }
  
    function runManual(item) {
  if (item.runBusy) return;
  if (!item.scene) {
    item.manualError = 'Pilih citra dulu pada langkah 1.';
    render();
    return;
  }
  const keys = (item.picked || []).filter(function (k) { return !!COMPUTE_SPECS[k]; });
  if (!keys.length) {
    item.manualError = 'Centang minimal satu index pada langkah 2.';
    render();
    return;
  }
  
  item.runBusy = true;
  item.manualError = null;
  item.manualResult = null;
  item.busy = 'Menghitung ' + keys.length + ' index dari citra ' + item.scene.date + '…';
  render();
  
  return runIndexOnScene(item, keys, function (text) {
    item.busy = text;
    render();
  }).then(function (hasil) {
    item.manualResult = hasil;
    item.manualError = hasil.done.length ? null
      : 'Tidak ada index yang berhasil dihitung dari citra ini.';
  }).catch(function (error) {
    item.manualError = error && error.message ? error.message : 'Gagal menjalankan analisis.';
  }).then(function () {
    item.runBusy = false;
    item.busy = null;
    // Mode mandiri juga memunculkan section hasil, jadi tandai sudah
    // dianalisis supaya render membuka NDVI dan indeks spektral.
    item.analyzed = true;
    render();
  });
    }

  function render() {
    const list = listEl();
    // Tombol pemanggil disinkronkan lebih dulu supaya ikut benar saat
    // polygon ditambah, dihapus, atau selesai dianalisis -- semuanya
    // melewati render().
    syncReopenChip();
    if (!list) return;
    const hasItems = state.items.length > 0;
    // Kontrol export di kepala panel hanya muncul setelah semua polygon
    // tuntas. Tidak ada footer, jadi tidak ada ruang sheet yang terpakai.
    if (!hasItems) closeExportMenu();
    renderExportToggle();
    if (!hasItems) {
      list.innerHTML = '<div class="pa-empty">Belum ada polygon yang dianalisis.</div>';
      const counter = document.getElementById('polygonAnalysisCount');
      if (counter) counter.textContent = '0 polygon';
      return;
    }
    // Polygon terbaru ditampilkan paling atas. state.items tetap urut
    // kronologis (lama di depan) supaya item.index tetap angka urutan pembuatan
    // -- index itu dipakai sebagai badge kartu dan sebagai label 'Polygon N'
    // yang dikirim ke backend analyzeItem(). Membalik di sini, bukan dengan
    // unshift(), menjaga nomor itu tetap konsisten saat kartu dihapus.
    const notice = state.notice
      ? '<div class="pa-notice' + (state.noticeKind === 'error' ? ' is-error' : '') + '">' +
          escapeHtml(state.notice) + '</div>'
      : '';
    list.innerHTML = notice + state.items.slice().reverse().map(cardHtml).join('');
    const counter = document.getElementById('polygonAnalysisCount');
    if (counter) counter.textContent = state.items.length + ' polygon';
  }

  function itemById(id) {
    return state.items.filter(function (item) { return String(item.id) === String(id); })[0] || null;
  }

  const EYE_OPEN = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_CLOSED = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  const CARET = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

  function eyeBtnHtml(action, id, on, onLabel, offLabel) {
    const label = on ? onLabel : offLabel;
    return '<button class="pa-eye-btn' + (on ? ' is-on' : '') + '" type="button" ' +
      'data-pa-action="' + action + '" data-pa-id="' + id + '" ' +
      'title="' + escapeHtml(label) + '" ' +
      'aria-label="' + escapeHtml(label) + '" ' +
      'aria-pressed="' + (on ? 'true' : 'false') + '">' + (on ? EYE_OPEN : EYE_CLOSED) + '</button>';
  }

  function ndviEyeBtnHtml(item) {
    if (!item.overlay) return '';
    return eyeBtnHtml('toggle-overlay', item.id, item.overlayVisible !== false,
      'Sembunyikan citra NDVI', 'Tampilkan citra NDVI');
  }

  function terrainEyeBtnHtml(item) {
    if (!item.terrain) return '';
    const on = typeof window.isDemSamplesVisible === 'function' ? window.isDemSamplesVisible() : true;
    return eyeBtnHtml('toggle-terrain-points', item.id, on,
      'Sembunyikan titik sample topografi', 'Tampilkan titik sample topografi');
  }

  function collapseBtnHtml(item, section) {
    const collapsed = isSectionCollapsed(item, section);
    return '<button class="pa-collapse-btn' + (collapsed ? ' is-collapsed' : '') + '" type="button" ' +
      'data-pa-action="toggle-section" data-pa-id="' + item.id + '" data-pa-section="' + section + '" ' +
      'title="' + (collapsed ? 'Buka section' : 'Ciutkan section') + '" ' +
      'aria-label="' + (collapsed ? 'Buka section' : 'Ciutkan section') + '" ' +
      'aria-expanded="' + (collapsed ? 'false' : 'true') + '">' + CARET + '</button>';
  }

  // extraToolHtml diletakkan di kiri tombol collapse.
  function sectionHeadHtml(item, section, title, extraToolHtml) {
    return '<div class="pa-section-head">' +
      '<span class="pa-section-title">' + escapeHtml(title) + '</span>' +
      '<span class="pa-section-tools">' + (extraToolHtml || '') + collapseBtnHtml(item, section) + '</span>' +
      '</div>';
  }

  function isSectionCollapsed(item, section) {
    if (!item.collapsed) return section !== 'ndvi';
    const val = item.collapsed[section];
    if (typeof val === 'boolean') return val;
    return section !== 'ndvi';
  }

  async function analyzeItem(item) {
    item.ndviError = null;
    item.terrainError = null;
    try {
      await runNdvi(item, function (text) { item.busy = text; render(); });
      item.busy = null;
      render();
    } catch (error) {
      item.busy = null;
      item.ndvi = null;
      item.ndviError = error && error.message ? error.message : 'Gagal menganalisis NDVI.';
      render();
    }
    // Indeks spektral memakai pipeline & mask polygon yang sama dengan
    // NDVI, jadi cukup menyusul setelahnya.
    try {
      await runSpectral(item, function (text) { item.busy = text; render(); });
      item.busy = null;
      render();
    } catch (error) {
      item.busy = null;
      render();
    }
    try {
      await runTerrain(item, function (text) { item.busy = text; render(); });
      item.busy = null;
      render();
      toggleTerrainOverlay(item);
    } catch (error) {
      item.busy = null;
      item.terrain = null;
      item.terrainError = error && error.message ? error.message : 'Gagal menganalisis topografi.';
      render();
    }
    // Tandai sudah dianalisis walau sebagian ada yang gagal: kartu lalu
    // menampilkan tombol "Analisis ulang", bukan tombol pertama kali jalan.
    item.analyzed = true;
  }

  /**
   * Menghapus satu item beserta layer, overlay, dan jejak DEM-nya.
   * Dipakai oleh tombol × di kartu dan oleh event draw:deleted dari modul
   * gambar, supaya penghapusan lewat peta tidak meninggalkan kartu yatim.
   */
  /**
   * Mengembalikan satu item ke kondisi "belum dianalisis": overlay di peta
   * dilepas, lalu semua nilai hasil analisis dikosongkan. Dipakai tombol
   * "Reset analisis" supaya petak bisa dianalisis ulang dengan adegan atau
   * parameter yang berbeda tanpa harus menggambar ulang polygon.
   *
   * Yang SENGAJA tidak dikosongkan: geometri (rings, bounds, areaHa,
   * pointCount) dan pilihan pengguna (airTanamanId, mode, picked, scene,
   * sceneMonths, pixelCap, sclMask). Reset membersihkan hasil hitungan,
   * bukan membuang pekerjaan yang tidak perlu diulang.
   */
  function resetItemAnalysis(item) {
    if (!item || item.analyzeBusy) return false;

    // Overlay di peta harus dilepas lebih dulu, kalau tidak petanya masih
    // berwarna-warni padahal kartunya sudah kosong.
    removeItemOverlay(item);
    if (state.footprint && state.footprintOwner === item.id && mapReady()) map.removeLayer(state.footprint);
    if (state.terrainOwner === item.id && typeof window.clearDemOverlay === 'function') window.clearDemOverlay();
    if (state.footprintOwner === item.id) state.footprintOwner = null;
    if (state.terrainOwner === item.id) state.terrainOwner = null;

    item.analyzed = false;
    item.stale = false;
    item.busy = null;
    item.runBusy = false;
    item.pointCount = 0;

    item.ndvi = null;
    item.ndviError = null;
    item.ndviTrend = null;
    item.ndviTrendError = null;
    item.ndviTrendBusy = false;
    item.spectralMeta = null;
    item.spectralMetaError = null;
    item.lst = null;
    item.lstError = null;
    item.lstBusy = false;
    item.terrain = null;
    item.terrainError = null;
    item.cloud = null;
    item.cloudError = null;
    item.air = null;
    item.airError = null;
    item.airBusy = false;
    item.soil = null;
    item.soilError = null;
    item.soilBusy = false;
    item.soilWeekly = null;
    item.soilWeeklyError = null;
    item.soilWeeklyBusy = false;
    item.soilYearly = null;
    item.soilYearlyError = null;
    item.soilYearlyBusy = false;
    item.soilGrids = null;
    item.soilGridsError = null;
    item.soilGridsBusy = false;
    item.soilGridsProgress = null;
    item.manualResult = null;
    item.manualError = null;

    // Setiap indeks spektral punya nilai, error, status sibuk, dan tren
    // sendiri, jadi dikosongkan lewat ALL_INDEXES supaya indeks baru
    // otomatis ikut tanpa harus ditambah satu per satu di sini.
    for (let i = 0; i < ALL_INDEXES.length; i++) {
      const spec = ALL_INDEXES[i];
      item[spec.key] = null;
      item[spec.key + 'Error'] = null;
      item[spec.key + 'Busy'] = false;
      item[spec.trendKey] = null;
      item[spec.trendKey + 'Error'] = null;
      item[spec.trendKey + 'Busy'] = false;
    }

    // Section kembali ke keadaan tertutup seperti kartu baru, supaya hasil
    // yang baru tidak langsung memenuhi layar dengan section yang terbuka.
    item.collapsed = { ndvi: false, terrain: true, soil: true, spectral: true, lst: true, air: true };

    render();
    return true;
  }

  function removeItemById(id) {
    const item = itemById(id);
    if (!item) return false;
    if (item.layer && mapReady() && map.hasLayer(item.layer)) map.removeLayer(item.layer);
    removeItemOverlay(item);
    if (state.footprint && state.footprintOwner === item.id && mapReady()) map.removeLayer(state.footprint);
    if (state.terrainOwner === item.id && typeof window.clearDemOverlay === 'function') window.clearDemOverlay();
    if (state.footprintOwner === item.id) state.footprintOwner = null;
    if (state.terrainOwner === item.id) state.terrainOwner = null;
    state.items = state.items.filter(function (row) { return row.id !== item.id; });
    renumber();
    render();
    if (!state.items.length) closePanel();
    return true;
  }

  window.removeGeoFarmItemsByLayers = function (layers) {
    if (!layers) return 0;
    const targets = [];
    layers.eachLayer(function (layer) { targets.push(layer); });
    let removed = 0;
    targets.forEach(function (layer) {
      // Bandingkan objek layer secara langsung; hasil parse SHP/GeoJSON dan
      // hasil gambar bisa berupa L.geoJSON atau L.Polygon.
      for (let i = state.items.length - 1; i >= 0; i--) {
        if (state.items[i].layer === layer && removeItemById(state.items[i].id)) removed++;
      }
    });
    if (removed) render();
    return removed;
  };

  /* ── Aksi dari panel ── */

  function onPanelClick(event) {
    const target = event.target;
    const button = target && target.closest ? target.closest('[data-pa-action]') : null;
    if (!button) return;
    const action = button.getAttribute('data-pa-action');

    // Aksi panel (bukan per-kartu) tidak punya data-pa-id.
    if (action === 'restore') {
      restoreFromTitle();
      return;
    }

    if (action === 'minimize') {
      // Di mode minimal tombol yang sama dipakai untuk memulihkan panel.
      setMinimized(isMinimized() ? false : true);
      return;
    }

    if (action === 'close') {
      dismissPanel();
      return;
    }

    /* Aksi panel yang tidak punya data-pa-id. Semuanya harus ditangani
       SEBELUM penjaga item di bawah -- kalau tidak, tombolnya selalu keluar
       lebih dulu karena tidak punya polygon. */
    if (action === 'export-menu') {
      toggleExportMenu();
      return;
    }

    if (action === 'export-shp-all') {
      closeExportMenu();
      runGeoFarmExport(button, 'shp');
      return;
    }

    if (action === 'export-pdf-all') {
      closeExportMenu();
      runGeoFarmExport(button, 'pdf');
      return;
    }

    const id = button.getAttribute('data-pa-id');
    const item = itemById(id);
    if (!item) return;

    if (action === 'toggle-overlay') {
      toggleItemOverlay(item);
      render();
      return;
    }

    if (action === 'toggle-terrain-points') {
      if (typeof window.toggleDemSamples === 'function') window.toggleDemSamples();
      render();
      return;
    }

    if (action === 'lst') {
      runOptionalModule(item, optionalModules()[0]);
      return;
    }

    if (action === 'toggle-section') {
      const section = button.getAttribute('data-pa-section');
      if (!section) return;
      if (!item.collapsed) item.collapsed = {};
      item.collapsed[section] = !isSectionCollapsed(item, section);
      render();
      return;
    }

    if (action === 'remove') {
      removeItemById(item.id);
      return;
    }

    if (action === 'analyze') {
      if (typeof window.analyzeGeoFarmItem === 'function') window.analyzeGeoFarmItem(item.id);
      return;
    }

    if (action === 'reanalyze') {
      // Jalur yang sama persis dengan tombol Analisis pertama kali. analyzeItem
      // sudah mengosongkan error di awal dan menimpa setiap nilai, jadi aman
      // dijalankan ulang tanpa perlu state bersih lebih dulu.
      if (typeof window.analyzeGeoFarmItem === 'function') window.analyzeGeoFarmItem(item.id);
      return;
    }

    if (action === 'reset-analysis') {
      resetItemAnalysis(item);
      return;
    }

    if (action === 'spectral-extra') {
      // Hanya indeks lanjutan yang punya tombol muat. Dicari di EXTRA_INDEXES
      // supaya aksi ini tidak bisa dipakai untuk menjalankan ulang indeks otomatis.
      const key = button.getAttribute('data-pa-index');
      const target = EXTRA_INDEXES.filter(function (row) { return row.key === key; })[0];
      if (!target) return;
      if (item[target.key + 'Busy']) return;
      window.loadGeoFarmIndex(item.id, target.key);
      return;
    }

    if (action === 'ndvi-trend' || action === 'spectral-trend') {
      // Tren NDVI memakai spec null; tren indeks spektral memakai spec-nya
      // sendiri supaya band dan cache-nya terpisah.
      const spec = action === 'spectral-trend'
        ? ALL_INDEXES.filter(function (row) { return row.key === button.getAttribute('data-pa-trend'); })[0]
        : null;
      if (!spec && action === 'spectral-trend') return;
      // Modul tren diambil dari optionalModules() yang sama dengan runner
      // "lengkapi analisis", sehingga keduanya memakai jumlah bulan yang sama.
      const wanted = spec ? spec.trendKey : 'ndviTrend';
      const mod = optionalModules().filter(function (row) { return row.data === wanted; })[0];
      if (!mod) return;
      runOptionalModule(item, mod);
      return;
    }

    if (action === 'cloud') {
      runCloud(item, function (text) { item.busy = text; render(); })
        .then(function () { item.busy = null; render(); })
        .catch(function (error) {
          item.busy = null;
          item.cloudError = error && error.message ? error.message : 'Gagal memuat metadata awan.';
          render();
        });
      return;
    }

    if (action === 'footprint') {
      showFootprint(item);
      render();
      return;
    }

    if (action === 'copy-product') {
      copyProductId(button, item);
      return;
    }

    if (action === 'terrain-overlay') {
      toggleTerrainOverlay(item);
      render();
      return;
    }

    if (action === 'soil') {
      // optionalModules()[0] = LST, [1] = kelembapan tanah bulanan.
      runOptionalModule(item, optionalModules()[1]);
      return;
    }

    if (action === 'soil-weekly') {
      if (item.soilWeeklyBusy) return;
      item.soilWeeklyBusy = true;
      item.soilWeeklyError = null;
      item.busy = 'Mengambil metadata SOIL mingguan...';
      render();
      const done = function (text) { item.busy = text || null; render(); };
      runSoilWeekly(item, done)
        .then(function () {
          item.soilWeeklyBusy = false;
          item.busy = null;
          render();
        })
        .catch(function (error) {
          item.soilWeeklyBusy = false;
          item.busy = null;
          item.soilWeekly = null;
          item.soilWeeklyError = error && error.message ? error.message : 'Gagal memuat data kelembapan tanah mingguan.';
          render();
        });
      return;
    }

    if (action === 'soil-yearly') {
      if (item.soilYearlyBusy) return;
      item.soilYearlyBusy = true;
      item.soilYearlyError = null;
      item.busy = 'Mengambil metadata SOIL tahunan...';
      render();
      const done = function (text) { item.busy = text || null; render(); };
      runSoilYearly(item, done)
        .then(function () {
          item.soilYearlyBusy = false;
          item.busy = null;
          render();
        })
        .catch(function (error) {
          item.soilYearlyBusy = false;
          item.busy = null;
          item.soilYearly = null;
          item.soilYearlyError = error && error.message ? error.message : 'Gagal memuat data kelembapan tanah tahunan.';
          render();
        });
      return;
    }

    if (action === 'soilgrids') {
      if (item.soilGridsBusy) return;
      item.soilGridsBusy = true;
      item.soilGridsError = null;
      item.soilGridsProgress = 'Menyiapkan permintaan SoilGrids…';
      render();
      runSoilGrids(item, function (text) {
        item.soilGridsProgress = text;
        render();
      }).then(function () {
        item.soilGridsBusy = false;
        item.soilGridsProgress = null;
        render();
      }).catch(function (error) {
        item.soilGridsBusy = false;
        item.soilGridsProgress = null;
        item.soilGrids = null;
        item.soilGridsError = error && error.message ? error.message : 'Gagal menganalisis SoilGrids.';
        render();
      });
      return;
    }

    if (action === 'air') {
      runAirNeed(item);
      return;
    }

    if (action === 'weather') {
      runPolygonWeather(item);
      return;
    }

    if (action === 'set-mode') {
      setItemMode(item, button.getAttribute('data-pa-value'));
      return;
    }

    if (action === 'scenes') {
      runSceneList(item);
      return;
    }

    if (action === 'pick-scene') {
      pickScene(item, button.getAttribute('data-pa-date'));
      return;
    }

    if (action === 'run-manual') {
      runManual(item);
      return;
    }

    if (action === 'rerun') {
      item.stale = false;
      item.ndviTrend = null;
      item.ndviTrendError = null;
      analyzeItem(item);
    }
  }

  function renumber() {
    state.items.forEach(function (item, index) { item.index = index + 1; });
  }

  /* ── Kewajiban analisis sebelum ekspor ──
     Export dikunci sampai semua polygon melewati seluruh modul. Modul yang
     SUDAH DIPERCBA dan gagal tetap dihitung selesai: LST misalnya memang
     tidak ada di wilayah tertutup awan total, dan memaksa pengguna menekan
     ulang selamanya bukan solusi. Yang dihitung belum selesai hanya modul
     yang belum pernah dijalankan sama sekali. */

  /* Modul opsional di luar analisis inti. Trend dibangun lewat fungsi
     terpisah karena butuh spec indeks dan jumlah bulan.

     `store` dipakai hanya kalau runner-nya mengembalikan nilai dan tidak
     menyimpannya sendiri. runLst dan runSoilMoisture sudah mengisi item-nya
     sendiri, jadi store-nya kosong; runIndexTrend hanya mengembalikan objek
     tren tanpa menyimpannya, jadi trend wajib punya store. */
  function optionalModules() {
    const mods = [
      {
        key: 'lst', label: 'Suhu permukaan (LST)', data: 'lst', err: 'lstError', busy: 'lstBusy',
        run: function (item, onStatus) { return runLst(item, onStatus); }
      },
      {
        key: 'soil', label: 'Kelembapan tanah', data: 'soil', err: 'soilError', busy: 'soilBusy',
        run: function (item, onStatus) { return runSoilMoisture(item, onStatus); }
      }
    ];
    const trendSpec = function (spec) {
      return {
        key: 'trend-' + spec.key, label: 'Tren ' + spec.label,
        data: spec.trendKey, err: spec.trendKey + 'Error', busy: spec.trendKey + 'Busy',
        store: function (item, result) { item[spec.trendKey] = result; },
        run: function (item, onStatus) {
          return runIndexTrend(item, onStatus, trendMonthsFor(item, spec.trendKey), spec);
        }
      };
    };
    return mods
      .concat([trendSpec({ key: 'ndvi', label: 'NDVI', trendKey: 'ndviTrend' })])
      .concat(ALL_INDEXES.map(trendSpec));
  }

  /* Jumlah bulan untuk tren: sama persis dengan yang dipakai tombol di kartu,
     sehingga jalur "lengkapi analisis" dan klik manual tidak berbeda. */
  function trendMonthsFor(item, trendKey) {
    const current = item[trendKey];
    return current
      ? Math.min(TREND_MAX_MONTHS, current.months + TREND_STEP_MONTHS)
      : TREND_INITIAL_MONTHS;
  }

  /**
   * Menjalankan satu modul opsional dengan managing status sibuk dan pesan
   * error. Dipakai bersama oleh tombol di kartu dan olehisi "lengkapi
   * analisis", jadi keduanya pasti berperilaku sama.
   * Mengembalikan 'ok' | 'error' | 'busy'.
   */
  function runOptionalModule(item, mod, onStatus) {
    if (item[mod.busy]) return Promise.resolve('busy');
    item[mod.busy] = true;
    item[mod.err] = null;
    item.busy = 'Mengambil ' + mod.label + '…';
    render();
    const done = function (text) { item.busy = text || null; render(); };
    // mod.run bisa melempar sinkron (bukan menolak promise). Kalau dibiarkan,
    // flag busy tidak pernah dilepas oleh finally di bawah, dan modul itu
    // terkunci selamanya: setiap klik berikutnya hanya dapat 'busy'.
    let running;
    try {
      running = mod.run(item, done);
    } catch (error) {
      item[mod.busy] = false;
      item[mod.data] = null;
      item[mod.err] = error && error.message ? error.message : ('Gagal memuat ' + mod.label + '.');
      item.busy = null;
      render();
      return Promise.resolve('error');
    }
    return Promise.resolve(running)
      .then(function (result) {
        // Hanya modul yang mendeklarasikan store yang perlu disimpan di sini.
        if (mod.store) mod.store(item, result);
        return 'ok';
      })
      .catch(function (error) {
        item[mod.data] = null;
        item[mod.err] = error && error.message ? error.message : ('Gagal memuat ' + mod.label + '.');
        return 'error';
      })
      .finally(function () {
        item[mod.busy] = false;
        item.busy = null;
        render();
      });
  }

  /* ── Kesiapan ekspor ── */

  /* Setiap polygon harus melewati daftar modul ini. Indeks spektral dan tren
     dijumlahkan sebagai satu butir supaya daftar yang tampil di sheet tetap
     ringkas, bukan 20 baris. */
  function polygonGaps(item) {
    const gaps = [];
    const spectral = [];
    for (let i = 0; i < ALL_INDEXES.length; i++) {
      const spec = ALL_INDEXES[i];
      if (!item[spec.key] && !item[spec.key + 'Error']) spectral.push(spec.label);
    }
    if (!item.analyzed) gaps.push('analisis utama');
    else if (item.stale) gaps.push('analisis ulang (geometri diubah)');
    if (!item.ndvi && !item.ndviError) gaps.push('NDVI');
    if (spectral.length) gaps.push(spectral.length + ' indeks spektral');
    if (!item.terrain && !item.terrainError) gaps.push('topografi');
    if (!item.lst && !item.lstError) gaps.push('LST');
    if (!item.soil && !item.soilError) gaps.push('kelembapan tanah');
    if (!item.ndviTrend && !item.ndviTrendError) gaps.push('tren NDVI');
    let missingTrend = 0;
    if (!item.ndviTrend && !item.ndviTrendError) missingTrend += 1;
    for (let i = 0; i < ALL_INDEXES.length; i++) {
      const spec = ALL_INDEXES[i];
      if (!item[spec.trendKey] && !item[spec.trendKey + 'Error']) missingTrend += 1;
    }
    if (missingTrend) gaps.push(missingTrend + ' tren');
    return gaps;
  }

  /**
   * Ringkasan kesiapan seluruh daftar polygon. gaps berisi satu entri per
   * jenis modul yang belum tuntas, beserta berapa polygon yang.route.
   */
  function exportReadiness() {
    const items = state.items;
    const tally = {};
    let readyCount = 0;
    for (let i = 0; i < items.length; i++) {
      const gaps = polygonGaps(items[i]);
      if (!gaps.length) readyCount += 1;
      for (let g = 0; g < gaps.length; g++) {
        tally[gaps[g]] = (tally[gaps[g]] || 0) + 1;
      }
    }
    const gaps = Object.keys(tally).map(function (label) {
      return { label: label, count: tally[label] };
    });
    // Modul yang paling sering hilang ditampilkan lebih dulu supaya
    // daftar di sheet langsung mengarah ke bagian terbesar yang belum tuntas.
    gaps.sort(function (a, b) { return b.count - a.count; });
    return {
      ready: items.length > 0 && readyCount === items.length,
      total: items.length,
      readyCount: readyCount,
      gaps: gaps
    };
  }

  function gapSummary(readiness) {
    if (readiness.ready) return 'Semua polygon siap diekspor.';
    if (!readiness.gaps.length) return readiness.readyCount + ' dari ' + readiness.total + ' polygon lengkap.';
    return readiness.gaps.slice(0, 2).map(function (g) {
      return g.count + ' polygon kurang ' + g.label;
    }).join(', ') + (readiness.gaps.length > 2 ? ', dll.' : '.');
  }

  /* ── Ekspor SHP ──
     Geometri diambil dari item.rings, bukan dari layer Leaflet: rings sudah
     mengikuti GeoJSON (ring tertutup, urutan [lng,lat]) dan ikut diperbarui
     setiap vertex diedit lewat markPolygonStale(). */

  /* .prj WGS84 geographic, sama seperti export tool Gambar & Ukur. Luas tetap
     benar walau ditulis dalam satuan meter karena sudah dihitung di atas
     projeksi UTM saat polygon dibuat (item.areaHa). */
  const WGS84_PRJ = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';

  /* Nama field DBF maksimal 10 karakter, jadi semua nama di geofarmProperties()
     dijaga pendek. Nilai non-angka tidak boleh masuk ke kolom numerik --
     shpwrite akan menuliskannya apa adanya dan QGIS akan salah baca kolom. */
  function shpText(value, maxLength) {
    if (value === null || value === undefined) return '';
    const text = String(value).replace(/\s+/g, ' ').trim();
    return maxLength ? text.slice(0, maxLength) : text;
  }

  function shpNumber(value, digits) {
    if (!Number.isFinite(value)) return '';
    const factor = Math.pow(10, digits === undefined ? 4 : digits);
    return Math.round(value * factor) / factor;
  }

  /** Geometri GeoJSON dari rings.
      rings[0] adalah outer ring dan rings[1..] adalah hole, persis urutan yang
      diminta GeoJSON Polygon. Jadi semuanya ikut SATU Polygon -- bukan
      MultiPolygon. Membungkusnya jadi MultiPolygon akan membuat hole terisi
      dan, saat ditulis ke SHP, shpwrite menyatukan fitur yang berbeda. */
  function geofarmGeometry(item) {
    const rings = (item.rings || []).filter(function (ring) {
      return ring && ring.length >= 4;
    });
    if (!rings.length) return null;
    return { type: 'Polygon', coordinates: rings };
  }

  /**
   * Atribut satu polygon. Skema dibuat tetap: indeks yang belum dihitung tetap
   * ditulis sebagai kolom kosong, bukan dihilangkan, supaya tabel hasil ekspor
   * punya kolom yang sama persis untuk semua polygon.
   */
  function geofarmProperties(item) {
    const cloud = item.cloud || item.spectralMeta || null;
    const ndvi = item.ndvi;
    const terrain = item.terrain;
    const props = {
      gf_id: item.id,
      nama: shpText(item.name || ('Polygon ' + item.index), 60),
      sumber: item.source === 'upload' ? 'unggah' : 'gambar',
      luas_ha: shpNumber(item.areaHa, 2),
      titik: shpNumber(item.pointCount, 0),
      status: item.stale ? 'perlu rean' : (item.analyzed ? 'selesai' : 'belum'),
      tgl_citra: shpText(cloud && cloud.imageDate, 20),
      awan_pct: shpNumber(cloud && cloud.cloudPercent, 2),
      produk: shpText(cloud && cloud.productName, 70),
      piksel: shpNumber(ndvi && ndvi.count, 0),
      cakup_pct: shpNumber(ndvi && ndvi.coverage, 1)
    };
    props.ndvi = ndvi ? shpNumber(ndvi.mean) : '';
    props.ndvi_min = ndvi ? shpNumber(ndvi.min) : '';
    props.ndvi_max = ndvi ? shpNumber(ndvi.max) : '';
    for (let i = 0; i < ALL_INDEXES.length; i++) {
      const spec = ALL_INDEXES[i];
      const stats = item[spec.key];
      props[spec.key] = stats ? shpNumber(stats.mean) : '';
    }
    props.lst_c = item.lst ? shpNumber(item.lst.mean, 2) : '';
    props.elev_min = terrain ? shpNumber(terrain.elevMin, 1) : '';
    props.elev_maks = terrain ? shpNumber(terrain.elevMax, 1) : '';
    props.elev_avg = terrain ? shpNumber(terrain.elevAvg, 1) : '';
    props.miring = terrain ? shpNumber(terrain.slopeAvg, 2) : '';
    props.curam_pct = terrain ? shpNumber(terrain.steepPct, 1) : '';
    return props;
  }

  function geofarmFeature(item) {
    const geometry = geofarmGeometry(item);
    if (!geometry) return null;
    return { type: 'Feature', geometry: geometry, properties: geofarmProperties(item) };
  }

  function downloadExportBlobLocal(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportStamp() {
    const d = new Date();
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
  }

  /**
   * Ekspor polygon GeoFarm sebagai satu ZIP berisi .shp + .shx + .dbf + .prj.
   * Hanya SHP: GeoJSON bisa diambil kapan saja dari API peta, sementara SHP
   * tidak bisa dan tetap perlu atribut analisisnya. Mengembalikan
   * { ok, message } dan tidak melempar, supaya tombol bisa menampilkan
   * pesannya sendiri.
   */
  window.exportGeoFarmSHP = function () {
    const features = [];
    for (let i = 0; i < state.items.length; i++) {
      const feature = geofarmFeature(state.items[i]);
      if (feature) features.push(feature);
    }
    if (!features.length) {
      return Promise.resolve({ ok: false, message: 'Tidak ada polygon yang bisa diekspor.' });
    }

    const writer = (typeof window.shpwrite !== 'undefined') ? window.shpwrite
      : (typeof shpwrite !== 'undefined' ? shpwrite : null);
    if (!writer || typeof writer.zip !== 'function') {
      return Promise.resolve({ ok: false, message: 'Modul pembuat SHP belum siap. Muat ulang halaman lalu coba kembali.' });
    }

    const collection = { type: 'FeatureCollection', features: features };
    return writer.zip(collection, {
      folder: 'geofarm',
      filename: 'geofarm_polygon',
      outputType: 'blob',
      types: { polygon: 'polygons' },
      prj: WGS84_PRJ
    }).then(function (zipData) {
      const blob = zipData instanceof Blob ? zipData : new Blob([zipData], { type: 'application/zip' });
      downloadExportBlobLocal(blob, 'geofarm-polygon-' + exportStamp() + '-shp.zip');
      return { ok: true, message: features.length + ' polygon diekspor sebagai SHP ZIP.' };
    }).catch(function (error) {
      return { ok: false, message: 'Gagal membuat SHP: ' + (error && error.message ? error.message : String(error)) };
    });
  };

  /* ── API publik ── */

  /* Penanda bahwa gambar sedang berjalan dari GeoFarm.
     Hook draw:created di alat-draw-measure.js memanggil registerDrawnPolygon()
     untuk SETIAP polygon tanpa memeriksa asal gambarnya, sehingga polygon yang
     dibuat lewat tool "Gambar & Ukur" ikut memicu analisis GeoFarm. Tanpa
     penanda ini kedua tool itu memakai satu jalur analisis yang sama.
     Di-set true oleh activate() di geofarm-draw.js dan false lagi saat sesi
     berakhir. */
  let geofarmDrawSession = false;
  window.setGeofarmDrawSession = function (on) {
    geofarmDrawSession = on === true;
  };
  window.isGeofarmDrawSession = function () {
    return geofarmDrawSession;
  };

  /**
   * Satu item GeoFarm, dipakai bersama oleh polygon hasil gambar maupun polygon
   * hasil unggah file. opts: { name, source }.
   *
   * TIDAK ada auto-analisis, dari alur mana pun. Polygon masuk daftar dengan
   * luas saja, lalu pengguna menekan tombol Analisis di kartunya untuk
   * menghitung NDVI, indeks spektral, dan topografi. Ini penting karena satu
   * polygon sudah memakan ~5 permintaan jaringan dan menghasilkan overlay
   * berwarna di peta; menjalankannya diam-diam akan mengubah peta di belakang
   * layar tanpa user meminta apa pun.
   *
   * Sheet analisisnya juga tidak dibuka di sini. Pemanggilnya tombol
   * "Buka Analisis" di tab GeoTools (#geofarmOpenAnalysisBtn).
   */
  function addPolygonItem(layer, areaHa, opts) {
    if (!layer || !layer.getLatLngs) return null;
    const rings = ringsFromLatLngs(layer.getLatLngs());
    if (!rings.length) return null;
    const options = opts || {};

    state.seq += 1;
    const item = {
      id: state.seq,
      index: state.items.length + 1,
      layer: layer,
      rings: rings,
      bounds: boundsOf(rings),
      areaHa: Number.isFinite(areaHa) ? areaHa : 0,
      name: options.name || null,
      source: options.source === 'upload' ? 'upload' : 'draw',
      analyzed: false,
      analyzeBusy: false,
      pointCount: 0,
      stale: false,
      busy: null,
      overlay: null,
      overlayVisible: false,
      // air default TERUTUP dan dipisah secara visual: kebutuhan air adalah
      // hitungan terpisah dari citra satelit, bukan bagian dari rantai
      // NDVI/topografi. Kalau ikut terbuka, kartu jadi padat dan tombolnya
      // terlihat tumpang tindih dengan tombol analisis citra.
      collapsed: { ndvi: false, terrain: true, soil: true, spectral: true, lst: true, air: true },
      ndvi: null,
      ndviError: null,
      ndviTrend: null,
      ndviTrendError: null,
      ndviTrendBusy: false,
      spectralMeta: null,
      spectralMetaError: null,
      // Suhu permukaan tanah (Landsat, dimuat manual)
      lst: null,
      lstError: null,
      lstBusy: false,
      terrain: null,
      terrainError: null,
      cloud: null,
      cloudError: null,
      // Kebutuhan air tanaman (ETc = ET0 x Kc), dimuat manual
      air: null,
      airError: null,
      airBusy: false,
      airTanamanId: 'padi',
      airSowingDate: null,
      airRainEffectivePct: 70,
      soilGrids: null,
      soilGridsError: null,
      soilGridsBusy: false,
      soilGridsProgress: null,
      /* Dua mode analisis. 'auto' memakai jalur lama apa adanya (ArcGIS
         exportImage, adegan terbaru, tiga index beruntun) dan jadi default
         supaya tidak ada yang berubah bagi pengguna yang sudah biasa.
         'mandiri' memakai STAC/COG: user pilih adegan dan index sendiri. */
      mode: 'auto',
      picked: ['ndvi', 'ndmi', 'ndwi'],
      scene: null,
      sceneList: null,
      sceneListError: null,
      sceneListBusy: false,
      sceneCloudLimit: 20,
      sceneMonths: 6,
      pixelCap: 640,
      /* SCL beresolusi 20 m sementara band 10 m. Aktifkan hanya kalau memang
         mau masking awan per-piksel dan willing turun ke 20 m. */
      sclMask: false,
      runBusy: false,
      manualResult: null,
      manualError: null
    };

    /* Tiap indeks spektral -- yang otomatis maupun yang dimuat lewat tombol --
       punya nilai, pesan error, status sibuk, dan tren sendiri, karena tiap
       indeks memakai band dan cache yang berbeda. Diberikan lewat ALL_INDEXES
       supaya indeks baru otomatis ikut tanpa harus ditambah satu per satu. */
    for (let i = 0; i < ALL_INDEXES.length; i++) {
      const spec = ALL_INDEXES[i];
      item[spec.key] = null;
      item[spec.key + 'Error'] = null;
      item[spec.key + 'Busy'] = false;
      item[spec.trendKey] = null;
      item[spec.trendKey + 'Error'] = null;
      item[spec.trendKey + 'Busy'] = false;
    }

    state.items.push(item);
    /* Sheet analisis sengaja TIDAK dibuka di sini. Dulu openPanel(true)
       dipanggil otomatis begitu polygon selesai digambar, jadi panel menutupi
       peta persis saat user masih ingin melihat hasil gambarnya. Sekarang
       panel hanya terbuka lewat tombol "Buka Analisis" di tab GeoTools
       (#geofarmOpenAnalysisBtn), atau lewat judul chip ketika panel dalam
       mode minimal. render() sudah menyinkronkan tombol itu, jadi cukup
       dipanggil di sini. */
    render();
    return item;
  }

  window.registerDrawnPolygon = function (layer, areaHa) {
    // Hanya polygon dari sesi GeoFarm yang dianalisis. Gambar & Ukur, serta
    // tool gambar lain, tetap berfungsi tanpa memicu analisis ini. Kelas body
    // menjadi sinyal cadangan untuk event Leaflet yang datang saat status
    // internal sesi sedang disinkronkan.
    const isGeoFarmActive = geofarmDrawSession ||
      !!(document.body && document.body.classList.contains('geofarm-draw-active'));
    if (!isGeoFarmActive) return null;
    return addPolygonItem(layer, areaHa, { source: 'draw' });
  };

  /**
   * Pintu masuk resmi untuk polygon hasil unggah file (SHP/GeoJSON).
   * Sengaja tanpa penjaga geofarmDrawSession: ini bukan gambar di peta, dan
   * analisisnya dijalankan manual lewat tombol di panel.
   */
  window.registerUploadedPolygon = function (layer, areaHa, name) {
    return addPolygonItem(layer, areaHa, { name: name || null, source: 'upload' });
  };

  /** Menjalankan analisis (NDVI, indeks spektral, topografi) untuk satu item. */
  window.analyzeGeoFarmItem = function (id) {
    const item = itemById(id);
    if (!item || item.analyzeBusy) return false;
    item.analyzeBusy = true;
    render();
    analyzeItem(item)
      .then(function () { item.analyzed = true; })
      .catch(function (error) {
        item.analyzed = true;
        item.ndviError = item.ndviError ||
          (error && error.message ? error.message : 'Gagal menjalankan analisis.');
      })
      .then(function () {
        item.analyzeBusy = false;
        render();
      });
    return true;
  };

  /** Dipanggil sidebar alat dibuka: sisakan GeoFarm minimal agar tidak tertutup. */
  window.minimizeGeoFarmPanel = function () {
    if (!state.items.length) return false;
    setMinimized(true);
    return true;
  };

  /**
   * Pemanggil utama panel analisis: tombol mengambang di peta, dan judul
   * chip ketika panel sedang diminimalkan.
   *
   * Dipakai openPanel() dan bukan setMinimized(false) supaya efek sampingnya
   * ikut terjadi: tab GeoTools disorot, basemap dikembalikan ke satelit
   * supaya citra tetap terbaca, dan sidebar/sheet lain ditutup supaya panel
   * ini tidak berbagi ruang dengan yang lain.
   */
  window.reopenGeoFarmPanel = function () {
    if (!state.items.length) return false;
    openPanel(true);
    return true;
  };

  /** Dipanggil setelah vertex diedit: hasil lama ditandai, tidak dianalisis ulang diam-diam. */
  window.markPolygonStale = function (layer) {
    const item = state.items.filter(function (row) { return row.layer === layer; })[0];
    if (!item) return;
    item.rings = ringsFromLatLngs(layer.getLatLngs());
    item.bounds = boundsOf(item.rings);
    item.stale = true;
    render();
  };

  function bindPanel() {
    // Delegasi di panel, bukan di daftar: tombol minimize ada di .pa-head
    // yang berada di luar #polygonAnalysisList.
    const panel = panelEl();
    if (panel) panel.addEventListener('click', onPanelClick);
    // Select tanaman memakai event change, bukan click, jadi dibinden terpisah.
    if (panel) panel.addEventListener('change', onPanelChange);
    bindExportMenu();
  }

  // Panel ada di HTML statis; bind langsung bila sudah ter-parse agar tidak
  // menunggu DOMContentLoaded yang pada halaman ini bisa terlambat.
  if (panelEl()) {
    bindPanel();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindPanel);
  } else {
    bindPanel();
  }
})();
