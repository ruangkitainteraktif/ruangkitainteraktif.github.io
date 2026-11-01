/* ── Generator thumbnail basemap lokal (2026-11-01) ─────────────────────
   Mengunduh SATU tile preview (Jawa, z6) untuk tiap basemap XYZ lalu
   menyimpannya ke assets/img/basemap-preview/{id}.{png|jpg}. Hasilnya
   dipakai kartu katalog sehingga TIDAK ada request tile remote saat
   membuka Katalog -> Basemap (hemat & instan).

   Jalankan:  node tools/gen-basemap-preview.mjs
   Layer WMS / image (landsat, nowcoast, sentinel1-rtc) dilewati --
   kartunya tetap memakai placeholder lc-bm-thumb-ph.

   Daftar URL di bawah diambil dari basemapPreviewUrl() yang sudah
   diverifikasi di browser (titik tetap Jawa, z6). Bila menambah basemap
   XYZ baru, tambahkan entri { id, url } di sini lalu jalankan ulang. */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve('assets/img/basemap-preview');

const PREVIEWS = [
  { id: 'google-maps', url: 'https://mt0.google.com/vt/lyrs=m&x=51&y=33&z=6' },
  { id: 'osm', url: 'https://a.tile.openstreetmap.org/6/51/33.png' },
  { id: 'rupabumi', url: 'https://geoservices.big.go.id/rbi/rest/services/BASEMAP/Rupabumi_Indonesia/MapServer/tile/6/33/51?blankTile=false' },
  { id: 'esri-dark-gray', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/6/33/51' },
  { id: 'esri-topo', url: 'https://server.arcgisonline.com/arcgis/rest/services/World_Topo_Map/MapServer/tile/6/33/51' },
  { id: 'esri-terrain', url: 'https://server.arcgisonline.com/arcgis/rest/services/World_Terrain_Base/MapServer/tile/6/33/51' },
  { id: 'esri-street', url: 'https://server.arcgisonline.com/arcgis/rest/services/World_Street_Map/MapServer/tile/6/33/51' },
  { id: 'esri-shaded-relief', url: 'https://server.arcgisonline.com/arcgis/rest/services/World_Shaded_Relief/MapServer/tile/6/33/51' },
  { id: 'esri-physical', url: 'https://server.arcgisonline.com/arcgis/rest/services/World_Physical_Map/MapServer/tile/6/33/51' },
  { id: 'esri-natgeo', url: 'https://server.arcgisonline.com/arcgis/rest/services/NatGeo_World_Map/MapServer/tile/6/33/51' },
  { id: 'esri-satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/6/33/51' },
  { id: 'google-satellite-kh', url: 'https://khms0.google.com/kh/v=1015?x=51&y=33&z=6' },
  { id: 'bmkg-himawari', url: 'https://satellite.bmkg.go.id/api22/tile/6/51/30.png?tiletype=himawari9&modelname=himawari9&param=EH&baserun=' },
  { id: 'bmkg-himawari-nc', url: 'https://satellite.bmkg.go.id/api22/tile/6/51/30.png?tiletype=himawari9&modelname=himawari9&param=NC&baserun=' },
  { id: 'bmkg-himawari-wv', url: 'https://satellite.bmkg.go.id/api22/tile/6/51/30.png?tiletype=himawari9&modelname=himawari9&param=WV&baserun=' },
  { id: 'bmkg-himawari-rp', url: 'https://satellite.bmkg.go.id/api22/tile/6/51/30.png?tiletype=himawari9&modelname=himawari9&param=RP&baserun=' },
  { id: 'bmkg-himawari-sw', url: 'https://satellite.bmkg.go.id/api22/tile/6/51/30.png?tiletype=himawari9&modelname=himawari9&param=SW&baserun=' },
  { id: 'bmkg-himawari-sm', url: 'https://satellite.bmkg.go.id/api22/tile/6/51/30.png?tiletype=himawari9&modelname=himawari9&param=SM&baserun=' },
  { id: 'bmkg-himawari-va', url: 'https://satellite.bmkg.go.id/api22/tile/6/51/30.png?tiletype=himawari9&modelname=himawari9&param=VA&baserun=' },
  { id: 'bmkg-himawari-vs', url: 'https://satellite.bmkg.go.id/api22/tile/6/51/30.png?tiletype=himawari9&modelname=himawari9&param=VS&baserun=' },
  { id: 'bmkg-himawari-fd', url: 'https://satellite.bmkg.go.id/api22/tile/6/51/30.png?tiletype=himawari9&modelname=himawari9fd&param=EH&baserun=' },
  { id: 'bmkg-himawari-hires', url: 'https://satellite.bmkg.go.id/api22/tile/6/51/30.png?tiletype=himawari9&modelname=himawari9hires&param=VS&baserun=' },
  { id: 'bmkg-gk2a', url: 'https://satellite.bmkg.go.id/api22/tile/6/51/30.png?tiletype=himawari9&modelname=gk2a&param=EH&baserun=' },
  { id: 'bmkg-gk2a-wv', url: 'https://satellite.bmkg.go.id/api22/tile/6/51/30.png?tiletype=himawari9&modelname=gk2a&param=WV&baserun=' },
  { id: 'bmkg-gk2a-rp', url: 'https://satellite.bmkg.go.id/api22/tile/6/51/30.png?tiletype=himawari9&modelname=gk2a&param=RP&baserun=' },
  { id: 'modis-terra', url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2026-11-01/GoogleMapsCompatible_Level9/6/33/51.jpg' },
  { id: 'modis-aqua', url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Aqua_CorrectedReflectance_TrueColor/default/2026-11-01/GoogleMapsCompatible_Level9/6/33/51.jpg' },
  { id: 'viirs-noaa20', url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/2026-10-31/GoogleMapsCompatible_Level9/6/33/51.jpeg' },
  { id: 'viirs-noaa21', url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA21_CorrectedReflectance_TrueColor/default/2026-10-31/GoogleMapsCompatible_Level9/6/33/51.jpeg' },
  { id: 'viirs-snpp', url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/2026-10-31/GoogleMapsCompatible_Level9/6/33/51.jpeg' },
  { id: 'oci-pace', url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/OCI_PACE_True_Color/default/2026-10-31/GoogleMapsCompatible_Level7/6/33/51.jpeg' },
  { id: 'noaa-true-color', url: 'https://gis.nnvl.noaa.gov/arcgis/rest/services/TRUE/TRUE_current/ImageServer/tile/6/33/51' },
  { id: 'noaa-goes-ir', url: 'https://gis.nnvl.noaa.gov/arcgis/rest/services/GOES/GOES_current/ImageServer/tile/6/33/51' },
  { id: 'sentinel2', url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/6/33/51.jpg' },
  { id: 'eox-s2cloudless-2024', url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/6/33/51.jpeg' },
  { id: 'eox-blackmarble', url: 'https://tiles.maps.eox.at/wmts/1.0.0/blackmarble_3857/default/g/6/33/51.jpg' },
  { id: 'eox-terrain-light', url: 'https://tiles.maps.eox.at/wmts/1.0.0/terrain-light_3857/default/g/6/33/51.jpg' },
];

function extFor(contentType) {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  return 'png'; // default: png (juga menangani webp -> disimpan png; browser tetap render by content)
}

/* Endpoint BMKG menolak "baserun=" kosong (HTTP 400/403). Kita ambil
   modelrun terakhir per model lalu sisipkan ke URL tile BMKG/GK2A. */
async function getBmkgModelRuns() {
  try {
    const res = await fetch('https://satellite.bmkg.go.id/api22/modelrun', { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!res.ok) return {};
    return await res.json(); // { himawari9: [...], gk2a: [...], ... }
  } catch { return {}; }
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://ruangkita.github.io/' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, contentType: res.headers.get('content-type') };
}

async function run() {
  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });
  const modelRuns = await getBmkgModelRuns();
  const manifest = {};
  let okCount = 0, failCount = 0;
  // Unduh berurutan agar tidak membanjiri server tile & mudah melacak gagal.
  for (const item of PREVIEWS) {
    try {
      // Sisipkan baserun modelrun terakhir untuk tile BMKG/GK2A.
      let url = item.url;
      if (url.includes('baserun=')) {
        const m = url.match(/modelname=([^&]+)/);
        const model = m ? m[1] : '';
        const runs = modelRuns[model];
        if (runs && runs.length) url = url + encodeURIComponent(runs[0]);
      }
      const { buf, contentType } = await fetchBuffer(url);
      if (buf.length < 100) throw new Error('payload terlalu kecil ' + buf.length + 'B');
      const ext = extFor(contentType);
      const file = path.join(OUT_DIR, item.id + '.' + ext);
      await writeFile(file, buf);
      manifest[item.id] = item.id + '.' + ext;
      okCount++;
      console.log('OK  ' + item.id + '.' + ext + '  ' + buf.length + 'B  (' + (contentType || '?') + ')');
    } catch (e) {
      failCount++;
      console.log('GAGAL ' + item.id + '  ' + e.message);
    }
  }
  console.log('\nSelesai: ' + okCount + ' ok, ' + failCount + ' gagal.');
  // Tulis manifest agar map-core.js tahu file mana yang tersedia.
  const mfPath = path.resolve('assets/img/basemap-preview/manifest.json');
  await writeFile(mfPath, JSON.stringify(manifest, null, 2));
  console.log('Manifest: assets/img/basemap-preview/manifest.json (' + Object.keys(manifest).length + ' entri)');
}

run().catch((e) => { console.error(e); process.exit(1); });
