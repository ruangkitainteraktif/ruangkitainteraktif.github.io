/* Analyses polygon yang digambar pengguna: NDVI (GeoTIFF) + topografi. */
(function () {
  'use strict';

  const EXPORT_IMAGE_URL = 'https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer/exportImage';
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

  /* `hint` ditulis dengan bahasa sehari-hari supaya mudah dibaca petani:
     yang dijelaskan adalah artinya buat praktik, bukan istilah teknis. */
  const SPECTRAL_INDEXES = [
    {
      key: 'ndmi', label: 'NDMI', trendKey: 'ndmiTrend', bands: '8,12', table: NDMI_BANDS,
      hint: 'Seberapa lembap daunnya. Makin tinggi, makin banyak air di tumbuhan.'
    },
    {
      key: 'ndre', label: 'NDRE', trendKey: 'ndreTrend', rule: 'NDVI - with VRE Raw', table: NDRE_BANDS,
      hint: 'Seberapa hijau dan rapat daunnya. Makin tinggi, tanaman makin subur.'
    },
    {
      key: 'ndwi', label: 'NDWI', trendKey: 'ndwiTrend', rule: 'NDWI Raw', table: NDWI_BANDS,
      hint: 'Seberapa banyak air di permukaan lahan. Berguna untuk melihat sawah yang disiram atau tergenang.'
    }
  ];

  const state = {
    seq: 0, items: [], minimized: false, closed: false,
    footprint: null, footprintOwner: null,
    terrainOwner: null
  };

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

  function pickSize(bounds) {
    const wDeg = Math.abs(bounds.east - bounds.west);
    const hDeg = Math.abs(bounds.north - bounds.south);
    let w = Math.round((wDeg * M_PER_DEG) / TARGET_RES_M);
    let h = Math.round((hDeg * M_PER_DEG) / TARGET_RES_M);
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

  /* ── NDVI: exportImage GeoTIFF -> statistik + gambar ter-clip ── */

  /**
   * GeoTIFF satu indeks dari ArcGIS Sentinel2 ImageServer.
   * spec: { rule: 'NDVI Raw' } untuk rasterFunction yang dihitung server,
   *        { bands: '8,12' } untuk dua band mentah yang digabung sendiri.
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
   * `rasters` (satu elemen per band) supaya indeks dua-band seperti NDMI
   * bisa digabung sebelum dihitung.
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
   * Statistik indeks dalam rentang -1..1 (NDVI, NDMI, NDRE, NDWI semuanya
   * normalized difference, jadi batas validasinya sama). `table` hanya
   * mengatur class-break untuk sebaran kelas.
   */
  function computeStats(values, mask, table) {
    const table_ = table || NDVI_BANDS;
    let count = 0, sum = 0, min = Infinity, max = -Infinity;
    const bands = table_.map(function (band) { return { band: band, count: 0 }; });
    let inside = 0;

    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      inside++;
      const value = values[i];
      // Indeks asli selalu -1..1; di luar itu berarti nodata/awan.
      if (!Number.isFinite(value) || value < -1 || value > 1) continue;
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

  /** NDMI per-piksel dari dua band: (a - b) / (a + b). */
  function combineBands(a, b) {
    const total = Math.min(a.length, b.length);
    const out = new Float64Array(total);
    for (let i = 0; i < total; i++) {
      const x = a[i];
      const y = b[i];
      // Nodata L2A bernilai 0; reflectance dibatasi 10000.
      if (!x || !y || x > 10000 || y > 10000) {
        out[i] = NaN;
        continue;
      }
      out[i] = (x - y) / (x + y);
    }
    return out;
  }

  /**
   * NDMI, NDRE, NDWI untuk satu polygon. Masing-masing diambil terpisah agar
   * satu indeks yang gagal tidak menghilangkan hasil indeks lain; pesan
   * errornya disimpan per indeks.
   */
  async function runSpectral(item, onStatus) {
    const size = pickSize(item.bounds);
    for (let i = 0; i < SPECTRAL_INDEXES.length; i++) {
      const spec = SPECTRAL_INDEXES[i];
      onStatus('Menghitung ' + spec.label + '...');
      try {
        const blob = await requestIndexGeoTiff(item.bounds, size, spec);
        onStatus('Membaca piksel ' + spec.label + ' (' + size.w + '×' + size.h + ')...');
        const raster = await readIndexPixels(blob, item.bounds);
        const mask = rasterizeMask(item.rings, raster);
        const values = spec.bands
          ? combineBands(raster.rasters[0], raster.rasters[1])
          : raster.rasters[0];
        const stats = computeStats(values, mask, spec.table);
        if (!stats.count) throw new Error('Tidak ada piksel ' + spec.label + ' valid di dalam polygon.');
        item[spec.key] = stats;
        item[spec.key + 'Error'] = null;
      } catch (error) {
        item[spec.key] = null;
        item[spec.key + 'Error'] = error && error.message ? error.message : 'Gagal menghitung ' + spec.label + '.';
      }
    }
    await runSpectralMeta(item, onStatus);
  }

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

  /* ── LST (suhu permukaan tanah): Landsat Collection 2 Level-2 ──
     Sentinel-2 tidak punya band termal, jadi LST diambil dari landsat-c2-l2
     di Planetary Computer.

     Catatan penting:
     - 'cdist' itu produk Cloud Distance (satuan km), BUKAN suhu permukaan.
     - Asset lwir11 (ST_B10.TIF) SUDAH berisi suhu permukaan dalam Kelvin.
       Landsat C2 L2 science product dihitung sendiri oleh USGS; cukup
       diterapkan skala 0.00341802 * DN + 149.0 lalu dikurangi 273.15.
       Jadi algoritma surface temperature tidak perlu diimplementasikan ulang
       di sini.
     - revisit Landsat 8-16 hari, jadi tanggal akuisisi LST hampir pasti
       berbeda dari tanggal Sentinel-2 untuk NDMI/NDRE/NDWI. Tanggalnya
       ditampilkan di kartu agar tidak menyesatkan. */

  const LST_COLLECTION = 'landsat-c2-l2';
  const LST_WINDOW_DAYS = 45;
  // Skala resmi dari raster:bands ST_B10 di STAC (USGS C2 L2).
  const LST_T_SCALE = 0.00341802;
  const LST_T_OFFSET = 149.0;
  // qa_pixel: bit 0 fill, 1 dilated cloud, 2 cirrus, 3 cloud, 4 cloud shadow.
  const LST_QA_CLEAR_MASK = 0x1f;

  /** DN -> suhu permukaan (Celsius). */
  function landsatSurfaceTemp(bandT) {
    const kelvin = bandT * LST_T_SCALE + LST_T_OFFSET;
    if (!(kelvin > 0)) return NaN;
    return kelvin - 273.15;
  }

  function landsatQaClear(qa) {
    return (qa & LST_QA_CLEAR_MASK) === 0;
  }

  async function runLst(item, onStatus) {
    const to = new Date();
    const from = new Date(to.getTime() - LST_WINDOW_DAYS * 86400000);
    const period = {
      key: 'lst',
      label: 'LST',
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10)
    };

    onStatus('Mencari adegan Landsat...');
    const scene = await stacBestScene(item.bounds, period, LST_COLLECTION);
    if (!scene) {
      throw new Error('Tidak ada adegan Landsat dalam ' + LST_WINDOW_DAYS + ' hari terakhir untuk area ini.');
    }
    if (!scene.assets.lwir11) throw new Error('Adegan Landsat ini tidak memiliki band lwir11 (ST_B10).');
    if (!scene.assets.qa_pixel) throw new Error('Adegan Landsat ini tidak memiliki band qa_pixel.');

    onStatus('Mengunduh suhu permukaan Landsat...');
    const tempHref = await signCogUrl(scene.assets.lwir11.href);
    const qaHref = await signCogUrl(scene.assets.qa_pixel.href);
    onStatus('Membaca piksel suhu...');
    const temp = await readCogWindowMasked(tempHref, item.bounds, item.rings);
    onStatus('Membaca mask kualitas...');
    const qa = await readCogWindow(qaHref, item.bounds);

    onStatus('Menghitung statistik suhu...');
    const total = Math.min(temp.values.length, qa.length);
    const buckets = LST_BANDS.map(function (band) { return { band: band, count: 0 }; });
    let count = 0, inside = 0, sum = 0, min = Infinity, max = -Infinity;
    for (let i = 0; i < total; i++) {
      if (!temp.mask[i]) continue;
      inside++;
      if (!landsatQaClear(qa[i])) continue;
      const st = landsatSurfaceTemp(temp.values[i]);
      // Di luar rentang ini berarti nodata atau piksel yang tidak bermakna.
      if (!Number.isFinite(st) || st < -90 || st > 80) continue;
      count++;
      sum += st;
      if (st < min) min = st;
      if (st > max) max = st;
      const found = findBand(st, LST_BANDS);
      for (let b = 0; b < buckets.length; b++) if (buckets[b].band === found) buckets[b].count++;
    }
    if (!count) throw new Error('Tidak ada piksel suhu permukaan yang valid (semua tertutup awan atau badan air).');

    item.lst = {
      count: count,
      inside: inside,
      coverage: inside ? (count / inside) * 100 : 0,
      mean: sum / count,
      min: min,
      max: max,
      bands: buckets,
      date: String(scene.datetime || '').slice(0, 10),
      platform: scene.platform || '-',
      cloud: Number.isFinite(scene.cloud) ? scene.cloud : NaN
    };
    item.lstError = null;
    return item.lst;
  }

  /* ── Tren NDVI: Sentinel-2 L2A (STAC + windowed COG read), bulanan ── */

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
  async function stacBestScene(bounds, period, collection) {
    const collectionId = collection || PC_COLLECTION;
    const search = async function (cloudLimit) {
      const body = {
        collections: [collectionId],
        bbox: [bounds.west, bounds.south, bounds.east, bounds.north],
        datetime: period.from + 'T00:00:00Z/' + period.to + 'T23:59:59Z',
        query: { 'eo:cloud_cover': { lt: cloudLimit } },
        limit: 8
      };
      const response = await fetch(PC_SEARCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error('Pencarian adegan gagal (HTTP ' + response.status + ')');
      const data = await response.json();
      return (data && data.features) || [];
    };

    let features = await search(TREND_CLOUD_LIMIT);
    if (!features.length) features = await search(TREND_CLOUD_FALLBACK);
    if (!features.length) return null;
    features.sort(function (a, b) {
      return (a.properties['eo:cloud_cover'] || 0) - (b.properties['eo:cloud_cover'] || 0);
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

  /** Jendela piksel COG yang menutupi bbox polygon, dibatasi maksimal TREND_SAMPLE_PX. */
  function cogWindow(bounds, image) {
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
    if (x1 - x0 > TREND_SAMPLE_PX) x1 = x0 + TREND_SAMPLE_PX;
    if (y1 - y0 > TREND_SAMPLE_PX) y1 = y0 + TREND_SAMPLE_PX;
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
   * (plus - minus) / (plus + minus) untuk dua band Sentinel-2 L2A.
   * Dipakai NDVI, NDMI, NDRE, dan NDWI karena semuanya normalized
   * difference -- hanya pasangan band-nya yang berbeda.
   * Median + persentil dipakai supaya awan tidak menggeser garis tren.
   */
  function normalizedDiffFromBands(minus, plus) {
    const total = Math.min(minus.length, plus.length);
    const values = [];
    for (let i = 0; i < total; i++) {
      const m = minus[i];
      const p = plus[i];
      // Nodata L2A bernilai 0; reflectance dibatasi 10000.
      if (!m || !p || m > 10000 || p > 10000) continue;
      const value = (p - m) / (p + m);
      if (!Number.isFinite(value) || value < -1 || value > 1) continue;
      values.push(value);
    }
    if (!values.length) return null;
    values.sort(function (a, b) { return a - b; });
    const count = values.length;
    const mid = count >> 1;
    const median = count % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
    const pick = function (ratio) {
      const index = Math.min(count - 1, Math.max(0, Math.round((count - 1) * ratio)));
      return values[index];
    };
    return { count: count, median: median, p10: pick(0.1), p90: pick(0.9) };
  }

  /**
   * Pasangan band untuk tiap indeks pada jalur tren STAC.
   * `minus` dikurangi dari `plus`; assets diambil dari adegan sentinel-2-l2a
   * yang sama, jadi tidak perlu mosaic ArcGIS.
   */
  const TREND_BANDS = {
    ndvi: { minus: 'B04', plus: 'B08' },
    ndmi: { minus: 'B11', plus: 'B08' },
    ndre: { minus: 'B05', plus: 'B08' },
    ndwi: { minus: 'B08', plus: 'B03' }
  };

  async function loadTrendPoint(item, period, bands) {
    const scene = await stacBestScene(item.bounds, period);
    if (!scene) return null;
    if (!scene.assets[bands.minus] || !scene.assets[bands.plus]) {
      throw new Error('Adegan ini tidak memiliki band ' + bands.minus + '/' + bands.plus + '.');
    }
    const minus = await readCogWindow(await signCogUrl(scene.assets[bands.minus].href), item.bounds);
    const plus = await readCogWindow(await signCogUrl(scene.assets[bands.plus].href), item.bounds);
    const stats = normalizedDiffFromBands(minus, plus);
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
  async function fetchTrendPoint(item, period, bands, cacheTag) {
    const key = item.id + '|' + cacheTag + '|' + period.key + '|' + TREND_SAMPLE_PX;
    if (trendCache.has(key)) return trendCache.get(key);
    for (let attempt = 1; attempt <= TREND_ATTEMPTS; attempt++) {
      try {
        const point = await loadTrendPoint(item, period, bands);
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
    const bands = TREND_BANDS[spec.key] || TREND_BANDS.ndvi;
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
        points[index] = await fetchTrendPoint(item, periods[index], bands, spec.key);
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

  // Chip kecil di tengah bawah peta: satu-satunya cara membuka kembali panel
  // setelah user menekan tombol Tutup. Hanya tampil bila ada polygon.
  function syncReopenChip() {
    const chip = document.getElementById('geofarmReopenChip');
    if (!chip) return;
    const count = document.getElementById('geofarmReopenCount');
    if (count) count.textContent = state.items.length + ' polygon';
    chip.hidden = !(state.closed && state.items.length > 0);
  }

  function setMinimized(next) {
    const panel = panelEl();
    if (!panel) return;
    state.minimized = next === true;
    // Membuka atau minimize selalu membatalkan status "tertutup".
    state.closed = false;
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
      if (typeof window.closeGeotoolsSheet === 'function') window.closeGeotoolsSheet();
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
    state.closed = false;
    var panel = panelEl();
    if (panel) panel.classList.remove('pa-open', 'pa-min');
    document.body.classList.remove('pa-panel-open', 'pa-panel-minimized');
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
    state.closed = true;
    var panel = panelEl();
    if (panel) panel.classList.remove('pa-open', 'pa-min');
    document.body.classList.remove('pa-panel-open', 'pa-panel-minimized');
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

  function cloudBadgeHtml(item) {
    const quality = item.cloud && item.cloud.quality;
    const percent = item.cloud ? item.cloud.cloudPercent : NaN;
    const label = quality ? quality.short : 'Tidak tersedia';
    const color = quality ? quality.color : '#78909c';
    const value = Number.isFinite(percent) ? fmt(percent, 1) + '%' : '—';
    return '<div class="pa-cloud">' +
      '<span class="pa-cloud-dot" style="background:' + color + '"></span>' +
      '<span class="pa-cloud-label">Tutupan awan</span>' +
      '<span class="pa-cloud-value" style="color:' + color + '">' + value + '</span>' +
      '<span class="pa-cloud-badge" style="color:' + color + ';border-color:' + color + '">' + escapeHtml(label) + '</span>' +
      '</div>';
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

    return '<div class="pa-block">' +
      '<div class="pa-stats">' +
        '<div class="pa-stat"><span>Rata-rata</span><b>' + fmt(s.mean, 3) + '</b></div>' +
        '<div class="pa-stat"><span>Min</span><b>' + fmt(s.min, 3) + '</b></div>' +
        '<div class="pa-stat"><span>Maks</span><b>' + fmt(s.max, 3) + '</b></div>' +
        '<div class="pa-stat"><span>Piksel</span><b>' + s.count.toLocaleString('id-ID') + '</b></div>' +
      '</div>' +
      coverageNote +
      '<div class="pa-dist">' + rows + '</div>' +
      '<div class="pa-meta">Raster ' + escapeHtml(item.rasterSize || '-') + ' · 10 m/piksel</div>' +
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
    if (spec.key === 'ndmi') return 'NDMI = (B08 − B11) / (B08 + B11)';
    if (spec.key === 'ndre') return 'NDRE = (B08 − B05) / (B08 + B05)';
    if (spec.key === 'ndwi') return 'NDWI = (B03 − B08) / (B03 + B08)';
    return '';
  }

  function indexBlockHtml(item, spec) {
    if (item[spec.key + 'Error']) {
      return '<div class="pa-block pa-block-error">' + indexHeadHtml(spec.label, spec.hint) +
        escapeHtml(item[spec.key + 'Error']) + '</div>';
    }
    const s = item[spec.key];
    if (!s) {
      return '<div class="pa-block pa-block-muted">' + indexHeadHtml(spec.label, spec.hint) +
        escapeHtml(spec.label) + ' belum dihitung.</div>';
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
          metaRow('Band', escapeHtml(spec.bands ? spec.bands.replace(',', ' + ') : rasterFunctionText(spec))) +
          metaRow('Produk', 'Sentinel-2 L2A · 10 m/piksel') +
        '</div>' +
        spectralMetaHtml(item) +
      '</details>' +
      '</div>';
  }

  function rasterFunctionText(spec) {
    if (spec.rule === 'NDVI - with VRE Raw') return 'B08 + B05 (rasterFunction NDVI - with VRE Raw)';
    if (spec.rule === 'NDWI Raw') return 'B03 + B08 (rasterFunction NDWI Raw)';
    return spec.rule || '-';
  }

  function spectralBlockHtml(item) {
    return SPECTRAL_INDEXES.map(function (spec) {
      return indexBlockHtml(item, spec);
    }).join('');
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
        ? '<div class="pa-warn">Cakupan piksel valid ' + s.coverage.toFixed(0) + '% — sebagian area tertutup awan atau air.</div>'
        : '') +
      '<div class="pa-warn">Tanggal pengambilan LST berbeda dari citra Sentinel-2 di atas. Satelit ini melewati lokasi yang sama setiap 8-16 hari, ' +
        'jadi kondisi lahan yang dibandingkan tidak selalu sama.</div>' +
      '<details class="pa-details">' +
        '<summary class="pa-summary">Sumber &amp; tanggal citra</summary>' +
        '<div class="pa-block">' +
          metaRow('Satelit', escapeHtml(s.platform || '-')) +
          metaRow('Tanggal ambil', escapeHtml(s.date || '-')) +
          metaRow('Resolusi', '30 m/piksel') +
          metaRow('Tutupan awan', fmt(s.cloud, 0) + '%') +
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
    const analyzeBlock = item.analyzed ? '' :
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

    const cardOpen = '<div class="pa-card' + (item.stale ? ' pa-card-stale' : '') + '" data-pa-id="' + item.id + '">';
    const cardInfo = '<div class="pa-area">' + fmt(item.areaHa, 2) + ' ha · ' + (item.pointCount || 0) + ' titik sample</div>' +
      analyzeBlock + stale + busy;

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
      '<div class="pa-section' + (isSectionCollapsed(item, 'terrain') ? ' is-collapsed' : '') + '">' +
        sectionHeadHtml(item, 'terrain', 'Topografi', terrainEyeBtnHtml(item)) +
        '<div class="pa-section-body">' +
        terrainBlockHtml(item) +
        '</div>' +
      '</div>' +
      '<div class="pa-section' + (isSectionCollapsed(item, 'soil') ? ' is-collapsed' : '') + '">' +
        sectionHeadHtml(item, 'soil', 'Kelembapan Tanah') +
        '<div class="pa-section-body">' +
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
        (item.soilBusy ? '<div class="pa-block pa-block-muted"><span class="pa-spin"></span>' + escapeHtml(item.busy || 'Mengambil data kelembapan tanah…') + '</div>' : '') +
        soilBlockHtml(item) +
        (item.soilWeeklyBusy ? '<div class="pa-block pa-block-muted"><span class="pa-spin"></span>' + escapeHtml(item.busy || 'Mengambil data kelembapan tanah mingguan…') + '</div>' : '') +
        soilWeeklyBlockHtml(item) +
        (item.soilYearlyBusy ? '<div class="pa-block pa-block-muted"><span class="pa-spin"></span>' + escapeHtml(item.busy || 'Mengambil data kelembapan tanah tahunan…') + '</div>' : '') +
        soilYearlyBlockHtml(item) +
        '</div>' +
      '</div>' +
      '</div>';
  }

  function render() {
    const list = listEl();
    if (!list) return;
    if (!state.items.length) {
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
    list.innerHTML = state.items.slice().reverse().map(cardHtml).join('');
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
      if (item.lstBusy) return;
      item.lstBusy = true;
      item.lstError = null;
      render();
      runLst(item, function (text) { item.busy = text; render(); }).catch(function (error) {
        item.lst = null;
        item.lstError = error && error.message ? error.message : 'Gagal mengambil suhu permukaan.';
      }).finally(function () {
        item.busy = null;
        item.lstBusy = false;
        render();
      });
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

    if (action === 'ndvi-trend' || action === 'spectral-trend') {
      // Tren NDVI memakai spec null; tren indeks spektral memakai spec-nya
      // sendiri supaya band dan cache-nya terpisah.
      const spec = action === 'spectral-trend'
        ? SPECTRAL_INDEXES.filter(function (row) { return row.key === button.getAttribute('data-pa-trend'); })[0]
        : null;
      if (!spec && action === 'spectral-trend') return;
      const busyKey = spec ? spec.trendKey + 'Busy' : 'ndviTrendBusy';
      const trendKey = spec ? spec.trendKey : 'ndviTrend';
      const errorKey = spec ? spec.trendKey + 'Error' : 'ndviTrendError';
      const name = spec ? spec.label : 'NDVI';

      if (item[busyKey]) return;
      const current = item[trendKey];
      const months = current
        ? Math.min(TREND_MAX_MONTHS, current.months + TREND_STEP_MONTHS)
        : TREND_INITIAL_MONTHS;
      item[busyKey] = true;
      item[errorKey] = null;
      item.busy = 'Mencari adegan Sentinel-2…';
      render();
      const done = function (text) { item.busy = text || null; render(); };
      runIndexTrend(item, done, months, spec || { key: 'ndvi', label: 'NDVI' })
        .then(function (trend) {
          item[trendKey] = trend;
          item[busyKey] = false;
          item.busy = null;
          render();
        })
        .catch(function (error) {
          item[busyKey] = false;
          item.busy = null;
          item[trendKey] = null;
          item[errorKey] = error && error.message ? error.message : 'Gagal memuat tren ' + name + '.';
          render();
        });
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
      if (item.soilBusy) return;
      item.soilBusy = true;
      item.soilError = null;
      render();
      const done = function (text) { item.busy = text || null; render(); };
      runSoilMoisture(item, done)
        .then(function () {
          item.soilBusy = false;
          item.busy = null;
          render();
        })
        .catch(function (error) {
          item.soilBusy = false;
          item.busy = null;
          item.soil = null;
          item.soilError = error && error.message ? error.message : 'Gagal memuat data kelembapan tanah.';
          render();
        });
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
   * hasil unggah file. opts: { name, source, autoAnalyze }.
   * autoAnalyze:false dipakai alur unggah -- polygon masuk daftar dengan luas
   * saja, dan pengguna menekan tombol Analisis bila mau menghitungnya. Itu
   * penting karena satu polygon sudah memakan ~5 permintaan jaringan.
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
      collapsed: { ndvi: false, terrain: true, soil: true, spectral: true, lst: true },
      ndvi: null,
      ndviError: null,
      ndviTrend: null,
      ndviTrendError: null,
      ndviTrendBusy: false,
      // Indeks spektral (lihat SPECTRAL_INDEXES). Tiap indeks punya state
      // tren sendiri karena diambil dari pasangan band yang berbeda.
      ndmi: null,
      ndmiError: null,
      ndmiTrend: null,
      ndmiTrendBusy: false,
      ndmiTrendError: null,
      ndre: null,
      ndreError: null,
      ndreTrend: null,
      ndreTrendBusy: false,
      ndreTrendError: null,
      ndwi: null,
      ndwiError: null,
      ndwiTrend: null,
      ndwiTrendBusy: false,
      ndwiTrendError: null,
      spectralMeta: null,
      spectralMetaError: null,
      // Suhu permukaan tanah (Landsat, dimuat manual)
      lst: null,
      lstError: null,
      lstBusy: false,
      terrain: null,
      terrainError: null,
      cloud: null,
      cloudError: null
    };
    state.items.push(item);
    render();
    openPanel(true);
    if (options.autoAnalyze !== false) analyzeItem(item);
    return item;
  }

  window.registerDrawnPolygon = function (layer, areaHa) {
    // Hanya polygon dari sesi GeoFarm yang dianalisis. Gambar & Ukur, serta
    // tool gambar lain, tetap berfungsi tanpa memicu analisis ini.
    if (!geofarmDrawSession) return null;
    return addPolygonItem(layer, areaHa, { source: 'draw', autoAnalyze: true });
  };

  /**
   * Pintu masuk resmi untuk polygon hasil unggah file (SHP/GeoJSON).
   * Sengaja tanpa penjaga geofarmDrawSession: ini bukan gambar di peta, dan
   * analisisnya dijalankan manual lewat tombol di panel.
   */
  window.registerUploadedPolygon = function (layer, areaHa, name) {
    return addPolygonItem(layer, areaHa, { name: name || null, source: 'upload', autoAnalyze: false });
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

  /** Dipanggil chip buka-kembali di peta, dan saat sub-tab GeoFarm dibuka. */
  window.reopenGeoFarmPanel = function () {
    if (!state.items.length) return false;
    setMinimized(false);
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
