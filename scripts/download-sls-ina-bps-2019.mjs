/* Download the complete InaRISK SLS layer as a resumable, compressed GeoJSON. */
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';
import { createGzip, gunzipSync, gzipSync } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://inarisk1.bnpb.go.id:8443/geoserver/wfs';
const LAYER = 'basemap:ina_bps_sls_2019';
const PAGE_SIZE = 2500;
// InaRISK slows or stalls concurrent large WFS requests; download sequentially.
const CONCURRENCY = 1;
const OUT_DIR = fileURLToPath(new URL('../downloads/', import.meta.url));
const PAGE_DIR = fileURLToPath(new URL('../downloads/.sls-ina-bps-2019-pages/', import.meta.url));
const OUTPUT = fileURLToPath(new URL('../downloads/SLS_BPS_2019_InaRISK.geojson.gz', import.meta.url));
const META = fileURLToPath(new URL('../downloads/SLS_BPS_2019_InaRISK.metadata.json', import.meta.url));
const PROPERTIES = 'OBJECTID_1,objectid,kdprov,kdkab,kdkec,kddesa,kdsls,idsls,nmprov,nmkab,nmkec,nmdesa,nmsls,rw_dki,periode,sumber';
const COLUMNS = PROPERTIES.split(',').join('%2C');
// GeoServer returned numberMatched=1312612 for this layer on 2026-10-23.
// Pass a different total as the first CLI argument if a fresh hits request
// reports a changed count.
const total = Number(process.argv[2] || 1312612);

function urlFor(startIndex) {
  return ENDPOINT + '?service=WFS&version=2.0.0&request=GetFeature&typeNames=' + encodeURIComponent(LAYER) +
    '&count=' + PAGE_SIZE + '&startIndex=' + startIndex + '&outputFormat=application%2Fjson&srsName=EPSG%3A4326&propertyName=the_geom%2C' + COLUMNS;
}

async function getText(url) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json, text/xml' } });
      const text = await response.text();
      if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + text.slice(0, 300));
      return text;
    } catch (error) {
      lastError = error;
      if (attempt < 5) await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    } finally { clearTimeout(timer); }
  }
  throw lastError;
}

async function fetchPage(offset, total) {
  const filename = join(PAGE_DIR, String(offset).padStart(10, '0') + '.json.gz');
  if (existsSync(filename)) return;
  const text = await getText(urlFor(offset));
  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error('Respons bukan JSON pada startIndex=' + offset + ': ' + text.slice(0, 250)); }
  if (!Array.isArray(json.features)) throw new Error('Respons tidak berisi GeoJSON features pada startIndex=' + offset);
  if (json.features.length === 0 && offset < total) throw new Error('Halaman kosong sebelum jumlah fitur tercapai (startIndex=' + offset + ').');
  if (json.features.length > PAGE_SIZE) throw new Error('GeoServer melampaui ukuran halaman pada startIndex=' + offset);
  const temp = filename + '.tmp';
  writeFileSync(temp, gzipSync(Buffer.from(JSON.stringify(json))));
  renameSync(temp, filename);
}

async function writeChunk(stream, chunk) {
  if (!stream.write(chunk)) await once(stream, 'drain');
}

const outDirectory = OUT_DIR;
const pagesDirectory = PAGE_DIR;
mkdirSync(outDirectory, { recursive: true });
mkdirSync(pagesDirectory, { recursive: true });

if (existsSync(OUTPUT)) {
  console.log('Berkas hasil sudah ada:', OUTPUT);
  process.exit(0);
}

const offsets = [];
for (let offset = 0; offset < total; offset += PAGE_SIZE) offsets.push(offset);
let next = 0, complete = 0, downloadedBytes = 0, failed = null;
const cached = new Set(readdirSync(pagesDirectory).filter(name => name.endsWith('.json.gz')).map(name => Number(name.slice(0, -8))));
complete = offsets.filter(offset => cached.has(offset)).length;
console.log('Total:', total.toLocaleString('id-ID'), 'fitur; halaman:', offsets.length, '; sudah tersimpan:', complete, '; paralel:', CONCURRENCY);

async function worker() {
  while (!failed) {
    const index = next++;
    if (index >= offsets.length) return;
    const offset = offsets[index];
    if (cached.has(offset)) continue;
    try {
      await fetchPage(offset, total);
      complete++;
      if (complete % 10 === 0 || complete === offsets.length) {
        const files = readdirSync(pagesDirectory).filter(name => name.endsWith('.json.gz'));
        downloadedBytes = files.reduce((sum, name) => sum + statSync(join(pagesDirectory, name)).size, 0);
        console.log('Unduh:', complete + '/' + offsets.length, 'halaman;', (downloadedBytes / 1024 / 1024).toFixed(1), 'MiB terkompresi; startIndex terakhir:', offset);
      }
    } catch (error) {
      failed = new Error('Gagal mengunduh halaman startIndex=' + offset + ': ' + error.message);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
if (failed) throw failed;

const tempOutput = OUTPUT + '.tmp';
const gzip = createGzip({ level: 6 });
const file = createWriteStream(tempOutput);
const finalizer = pipeline(gzip, file);
try {
  await writeChunk(gzip, '{"type":"FeatureCollection","features":[');
  let first = true, count = 0;
  for (const offset of offsets) {
    const compressed = readFileSync(join(pagesDirectory, String(offset).padStart(10, '0') + '.json.gz'));
    const page = JSON.parse(gunzipSync(compressed).toString('utf8'));
    if (!Array.isArray(page.features)) throw new Error('Cache halaman rusak pada startIndex=' + offset);
    if (page.features.length) {
      if (!first) await writeChunk(gzip, ',');
      await writeChunk(gzip, JSON.stringify(page.features).slice(1, -1));
      first = false;
      count += page.features.length;
    }
    console.log('Rangkai:', count.toLocaleString('id-ID'), '/', total.toLocaleString('id-ID'));
  }
  await writeChunk(gzip, ']}');
  gzip.end();
  await finalizer;
  if (count !== total) throw new Error('Jumlah fitur akhir tidak cocok: ' + count + ' dari ' + total);
  renameSync(tempOutput, OUTPUT);
  writeFileSync(META, JSON.stringify({
    layer: LAYER,
    endpoint: ENDPOINT,
    downloadedAt: new Date().toISOString(),
    featureCount: count,
    pageSize: PAGE_SIZE,
    output: 'SLS_BPS_2019_InaRISK.geojson.gz',
    coordinateSystem: 'EPSG:4326',
    properties: PROPERTIES.split(','),
    geometry: 'GeoJSON geometry (MultiPolygon/Polygon)'
  }, null, 2) + '\n');
  rmSync(pagesDirectory, { recursive: true, force: true });
  console.log('Selesai:', OUTPUT, '|', count.toLocaleString('id-ID'), 'fitur');
} catch (error) {
  gzip.destroy(error);
  file.destroy();
  await finalizer.catch(() => {});
  throw error;
}
