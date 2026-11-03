import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'data', 'kawasan-hutan-esdm');
const LAYER = 'https://geoportal.esdm.go.id/gis1/rest/services/Kawasan_Hutan/MapServer/0';
const OUT_FIELDS = 'objectid_1,kode_prov,deskripsi,namobj,fungsikws,noskkws,lskkws';
const OFFSET_DEGREES = 0.0005; // kira-kira 55 m, sesuai skala sumber 1:250.000
const FOREST_WHERE = "deskripsi IN ('Kawasan Konservasi','Hutan Lindung','Hutan Produksi Tetap','Hutan Produksi Terbatas','Hutan Produksi Yang Dapat Dikonversi')";
const ISLANDS = [
  { name: 'Sumatera', file: 'sumatera', codes: [11,12,13,14,15,16,17,18,19,21] },
  { name: 'Jawa', file: 'jawa', codes: [31,32,33,34,35,36] },
  { name: 'Bali & Nusa Tenggara', file: 'bali-nusa-tenggara', codes: [51,52,53] },
  { name: 'Kalimantan', file: 'kalimantan', codes: [61,62,63,64,65] },
  { name: 'Sulawesi', file: 'sulawesi', codes: [71,72,73,74,75,76] },
  { name: 'Maluku', file: 'maluku', codes: [81,82] },
  { name: 'Papua', file: 'papua', codes: [91,92,93,94,95,96] }
];

async function fetchJson(url) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || 'ArcGIS query error');
      return data;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

function queryUrl(where, offset, count) {
  const params = new URLSearchParams({
    f: 'json', where, outFields: OUT_FIELDS, returnGeometry: 'true', outSR: '4326',
    orderByFields: 'objectid_1', resultOffset: String(offset), resultRecordCount: String(count),
    maxAllowableOffset: String(OFFSET_DEGREES)
  });
  return `${LAYER}/query?${params}`;
}

await fs.mkdir(OUT, { recursive: true });
for (const island of ISLANDS) {
  const where = `kode_prov IN (${island.codes.join(',')}) AND ${FOREST_WHERE}`;
  const countParams = new URLSearchParams({ f: 'json', where, returnCountOnly: 'true' });
  const { count } = await fetchJson(`${LAYER}/query?${countParams}`);
  if (!Number.isFinite(count) || count < 1) throw new Error(`Jumlah fitur ${island.name} tidak valid.`);

  const features = [];
  let offset = 0;
  let pageSize = 100;
  while (offset < count) {
    let page;
    while (!page) {
      try {
        page = await fetchJson(queryUrl(where, offset, pageSize));
      } catch (error) {
        if (pageSize <= 20) throw new Error(`${island.name}, offset ${offset}: ${error.message}`);
        pageSize = Math.max(20, Math.floor(pageSize / 2));
      }
    }
    if (!Array.isArray(page.features) || !page.features.length) {
      throw new Error(`Unduhan ${island.name} berhenti pada fitur ${offset} dari ${count}.`);
    }
    features.push(...page.features);
    offset += page.features.length;
    console.log(`${island.name}: ${offset.toLocaleString('id-ID')}/${count.toLocaleString('id-ID')} fitur`);
  }

  const payload = JSON.stringify({
    source: LAYER,
    sourceLayer: 'Kawasan Hutan 20251018',
    downloadedAt: new Date().toISOString(),
    island: island.name,
    featureCount: features.length,
    maxAllowableOffsetDegrees: OFFSET_DEGREES,
    generalizationApproxMeters: 55,
    features
  });
  const target = path.join(OUT, `${island.file}.json`);
  await fs.writeFile(target, payload, 'utf8');
  console.log(`${island.name}: ${Buffer.byteLength(payload).toLocaleString('id-ID')} B JSON lokal`);
}
