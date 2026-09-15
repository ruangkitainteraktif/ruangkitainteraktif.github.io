# Plan: Attribute Table untuk Semua Layer Katalog

## Ringkasan
Menambahkan attribute table support ke semua layer di katalog layer yang memungkinkan.
- **8 layer ArcGIS dynamicMapLayer** → type `arcgis` (query REST API)
- **3 layer PMTiles** → type `pmtiles` (queryTileFeaturesDebug)
- **1 layer WMS** → WMS_ATTR_REGISTRY (GetFeatureInfo click)
- **~30 layer raster** → type `raster` (pesan "tidak memiliki tabel atribut")

---

## 1. Modifikasi `attribute-table.js`

### 1a. Tambah type `arcgis` di `loadFeatures()` (sebelum `type === 'dss'`)

```js
} else if (config.type === 'arcgis') {
  var currentId2 = _currentLayer.id;
  var content2 = document.getElementById('at-sheet-content');
  if (content2) content2.innerHTML = '<div class="at-loading">Memuat data dari server…</div>';
  var qUrl = config.url + (config.url.indexOf('?') === -1 ? '?' : '&') +
    'where=1%3D1&outFields=' + encodeURIComponent((config.outFields || ['*']).join(',')) +
    '&returnGeometry=true&outSR=4326&f=json&resultRecordCount=2000';
  fetch(qUrl).then(function (r) { return r.json(); }).then(function (data) {
    if (!_currentLayer || _currentLayer.id !== currentId2) return;
    var feats = (data && data.features) || [];
    _currentFeatures = feats.map(function (feat) {
      var a = feat.attributes || {};
      var f = {};
      for (var k in a) { if (a[k] !== null && a[k] !== undefined) f[k] = a[k]; }
      if (feat.geometry) {
        var ll = null;
        if (feat.geometry.x != null && feat.geometry.y != null) ll = [feat.geometry.y, feat.geometry.x];
        else if (feat.geometry.paths && feat.geometry.paths[0] && feat.geometry.paths[0][0]) { var p = feat.geometry.paths[0][0]; ll = [p[1], p[0]]; }
        else if (feat.geometry.rings && feat.geometry.rings[0] && feat.geometry.rings[0][0]) { var p2 = feat.geometry.rings[0][0]; ll = [p2[1], p2[0]]; }
        if (ll) f._latlng = ll;
      }
      return f;
    });
    _currentPage = 1;
    renderAttrContent();
  }).catch(function () {
    if (_currentLayer && _currentLayer.id === currentId2 && content2)
      content2.innerHTML = '<div class="at-empty">Gagal memuat data atribut.</div>';
  });
  return;
}
```

### 1b. Tambah type `pmtiles` di `loadFeatures()` (setelah `arcgis`)

```js
} else if (config.type === 'pmtiles') {
  var pLayer = config.getLayer();
  if (pLayer && typeof pLayer.queryTileFeaturesDebug === 'function') {
    var center = map.getCenter();
    pLayer.queryTileFeaturesDebug(center.lng, center.lat).then(function (results) {
      if (!_currentLayer || _currentLayer.id !== currentId2) return;
      var feats = (results && results.data) || results || [];
      _currentFeatures = feats.map(function (item) {
        var f = {};
        for (var k in item.properties || item) {
          if (k !== 'geometry') f[k] = (item.properties || item)[k];
        }
        if (item.geometry && item.geometry.coordinates) {
          var c = item.geometry.coordinates;
          if (item.geometry.type === 'Point') f._latlng = [c[1], c[0]];
        }
        return f;
      });
      _currentPage = 1;
      renderAttrContent();
    }).catch(function () {
      if (_currentLayer && _currentLayer.id === currentId2)
        renderAttrContent();
    });
    return;
  }
}
```

### 1c. Tambah entries di `ATTR_LAYER_REGISTRY` (sebelum `toggleHillshade`)

#### ArcGIS dynamicMapLayers:
```js
toggleJalurEvakuasi: {
  name: 'Jalur Evakuasi (BNPB)',
  type: 'arcgis',
  url: 'https://gis.bnpb.go.id/server/rest/services/inarisk/Jalur_evakuasi/MapServer/0/query',
  outFields: ['NAMA', 'JNS_JLN', 'KLNJTN', 'LEBAR', 'KET'],
  props: ['NAMA', 'JNS_JLN', 'KLNJTN', 'LEBAR', 'KET']
},
toggleFaultLayerNew: {
  name: 'Patahan Indonesia Baru (PUSGEN 2024)',
  type: 'arcgis',
  url: 'https://gis.bnpb.go.id/server/rest/services/inarisk/Faults_new/MapServer/1/query',
  outFields: ['Name', 'Segment', 'Type', 'Mmax', 'Sliprate_m', 'Length_km', 'Region', 'LCLASSSTR'],
  props: ['Name', 'Segment', 'Type', 'Mmax', 'Sliprate_m', 'Length_km', 'Region', 'LCLASSSTR']
},
toggleGeologiBNPB: {
  name: 'Peta Geologi (BNPB)',
  type: 'arcgis',
  url: 'https://gis.bnpb.go.id/server/rest/services/thematic/PETA_GEOLOGI/MapServer/1/query',
  outFields: ['*'],
  props: ['UMUROBJ']
},
arcgis-sawah-2023: {
  name: 'LBS 2023 (Kementan)',
  type: 'arcgis',
  url: 'https://sig02.pertanian.go.id/server/rest/services/Sawah/Sawah2023/MapServer/0/query',
  outFields: ['*'],
  props: []
},
arcgis-sawah-2019: {
  name: 'LBS 2019 (Kementan)',
  type: 'arcgis',
  url: 'https://sig02.pertanian.go.id/server/rest/services/Sawah/LBS2019/MapServer/23/query',
  outFields: ['*'],
  props: []
},
arcgis-kawasan-padi: {
  name: 'Kawasan Padi (Kementan)',
  type: 'arcgis',
  url: 'https://sig02.pertanian.go.id/server/rest/services/Kawasan/Peta_Kawasan_Padi/MapServer/0/query',
  outFields: ['*'],
  props: []
},
arcgis-kawasan-jagung: {
  name: 'Kawasan Jagung (Kementan)',
  type: 'arcgis',
  url: 'https://sig02.pertanian.go.id/server/rest/services/Kawasan/Peta_Kawasan_Jagung/MapServer/0/query',
  outFields: ['*'],
  props: []
},
arcgis-kawasan-kedelai: {
  name: 'Kawasan Kedelai (Kementan)',
  type: 'arcgis',
  url: 'https://sig02.pertanian.go.id/server/rest/services/Kawasan/Peta_Kawasan_Kedelai/MapServer/0/query',
  outFields: ['*'],
  props: []
},
```

#### PMTiles layers:
```js
toggleProtectedLayer: {
  name: 'Kawasan Konservasi (WDPA)',
  type: 'pmtiles',
  getLayer: function () { return window.protectedPmtilesLayer || null; },
  props: ['name', 'type', 'status', 'provinsi', 'kabupaten', 'area_ha']
},
toggleMangroveLayer: {
  name: 'Mangrove (GMW v3)',
  type: 'pmtiles',
  getLayer: function () { return window.mangrovePmtilesLayer || null; },
  props: ['name', 'type', 'status', 'provinsi', 'kabupaten', 'area_ha']
},
togglePeatlandLayer: {
  name: 'Lahan Gambut (GFW)',
  type: 'pmtiles',
  getLayer: function () { return window.peatlandPmtilesLayer || null; },
  props: ['name', 'type', 'status', 'provinsi', 'kabupaten', 'area_ha']
},
```

#### Raster layers (no attribute table):
```js
toggleBumiPersilLayer: { name: 'Persil Tanah (ATRBPN)', type: 'raster' },
toggleRtrwTmsLayer: { name: 'RTRW Kabupaten/Kota', type: 'raster' },
toggleLsdTmsLayer: { name: 'Lahan Sawah Dilindungi (LSD)', type: 'raster' },
toggleLbsTmsLayer: { name: 'Lahan Baku Sawah (LBS)', type: 'raster' },
toggleDiTmsLayer: { name: 'Daerah Irigasi', type: 'raster' },
toggleSaluranIrTmsLayer: { name: 'Saluran Irigasi', type: 'raster' },
toggleFsvaLayer: { name: 'FSVA 2025 (Badan Pangan)', type: 'raster' },
'bps-lbs-2024': { name: 'LBS Nasional 2024', type: 'raster' },
toggleDemnasOverlay: { name: 'Terrain Overlay (SRTM)', type: 'raster' },
toggleProvinceBoundary: { name: 'Batas Provinsi (PBF)', type: 'raster' },
toggleCoastlineLayer: { name: 'Garis Pantai (Natural Earth)', type: 'raster' },
toggleBpsTutupanLahan: { name: 'Peta Tutupan Lahan 100m (BPS)', type: 'raster' },
toggleWindRgb: { name: 'Wind Speed and Direction (GFS)', type: 'raster' },
toggleRhRgb: { name: 'Relative Humidity (GFS)', type: 'raster' },
toggleTp24Rgb: { name: 'Total Precipitation 24 Jam (GFS)', type: 'raster' },
togglePm25Rgb: { name: 'PM2.5 Air Quality (BMKG PCM)', type: 'raster' },
toggleHthRgb: { name: 'Hari Tanpa Hujan (BMKG HTH)', type: 'raster' },
toggleMaritimeAngin: { name: 'Angin Laut (Wind Speed)', type: 'raster' },
toggleMaritimeGelombang: { name: 'Tinggi Gelombang', type: 'raster' },
toggleMaritimeSwell: { name: 'Swell (Primary Swell)', type: 'raster' },
toggleMaritimeWindSea: { name: 'Gelombang Angin (Wind Sea)', type: 'raster' },
toggleChlorophyllOverlay: { name: 'Chlorophyll-a Laut (NASA)', type: 'raster' },
toggleParOverlay: { name: 'PAR - Radiasi Fotosintesis (NASA)', type: 'raster' },
'omi-aerosol-index': { name: 'UV Aerosol Index (OMI/Aura)', type: 'raster' },
'omi-aod-abs': { name: 'Absorbing AOD Near-UV (OMI/Aura)', type: 'raster' },
'omi-modis-terra-aod': { name: 'Aerosol Optical Depth (MODIS Terra)', type: 'raster' },
'omi-modis-aqua-aod': { name: 'Aerosol Optical Depth (MODIS Aqua)', type: 'raster' },
'omi-so2': { name: 'SO2 Lower Troposphere (OMI/Aura)', type: 'raster' },
'omi-so2-pbl': { name: 'SO2 Planetary Boundary Layer (OMI/Aura)', type: 'raster' },
'omps-noaa20-so2-lt': { name: 'SO2 Lower Troposphere (OMPS NOAA-20)', type: 'raster' },
'omi-no2': { name: 'NO2 Tropospheric Column (OMI/Aura)', type: 'raster' },
toggleAirVisualPm25: { name: 'PM2.5 (AirVisual)', type: 'raster' },
toggleAirVisualPm10: { name: 'PM10 (AirVisual)', type: 'raster' },
toggleAirVisualO3: { name: 'O3 - Ozon (AirVisual)', type: 'raster' },
toggleAirVisualNo2: { name: 'NO2 - Nitrogen Dioksida (AirVisual)', type: 'raster' },
toggleAirVisualSo2: { name: 'SO2 - Sulfur Dioksida (AirVisual)', type: 'raster' },
toggleAirVisualCo: { name: 'CO - Karbon Monoksida (AirVisual)', type: 'raster' },
```

### 1d. Tambah Sensus Pertanian 2023 ke `ATTR_LAYER_REGISTRY` (type `raster`)
Semua `st2023:*` layer adalah raster tile. Tambahkan entries dengan loop pattern:
```js
'st2023:batas_desa': { name: 'Batas Desa (SP2023)', type: 'raster' },
'st2023:batas_kecamatan': { name: 'Batas Kecamatan (SP2023)', type: 'raster' },
// ... dst untuk semua 24 st2023 layers
```

---

## 2. Modifikasi `concessions-layer.js` (PMTiles)

### 2a. Expose PMTiles layer objects globally

Di `concessions-layer.js`, setelah layer PMTiles dibuat, expose ke window:
```js
window.protectedPmtilesLayer = layers.protected.layer;
window.mangrovePmtilesLayer = layers.mangrove.layer;
window.peatlandPmtilesLayer = layers.peatland.layer;
```

Dan saat layer di-remove, set null:
```js
window.protectedPmtilesLayer = null;
window.mangrovePmtilesLayer = null;
window.peatlandPmtilesLayer = null;
```

---

## 3. File yang diubah

| File | Perubahan |
|------|-----------|
| `assets/js/attribute-table.js` | +type `arcgis`, +type `pmtiles`, +~40 entries di `ATTR_LAYER_REGISTRY` |
| `assets/js/concessions-layer.js` | +expose PMTiles layer ke `window` |

---

## 4. Layer yang TIDAK bisa attribute table (dihentikan)

| Layer | Alasan |
|-------|--------|
| 35 basemap layers | Radio-select tile layers |
| `toggleNonTollRoad` | Sudah ada di registry tapi tidak di katalog (orphaned) |

---

## 5. Urutan Eksekusi

1. Tambah type `arcgis` dan `pmtiles` di `loadFeatures()` pada `attribute-table.js`
2. Tambah semua entries di `ATTR_LAYER_REGISTRY` pada `attribute-table.js`
3. Expose PMTiles layer objects di `concessions-layer.js`
4. Test semua layer yang baru ditambahkan
