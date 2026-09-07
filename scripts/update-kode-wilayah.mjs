import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RBI_BASE = 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH';
const DESA_URL = `${RBI_BASE}/BATAS_DESAKEL_AR/MapServer/0`;
const PAGE_SIZE = 1000;

async function fetchCount(url) {
  const res = await fetch(`${url}/query?where=1%3D1&returnCountOnly=true&f=json`);
  const json = await res.json();
  return json.count || 0;
}

async function fetchPage(url, offset) {
  const where = '1=1';
  const params = new URLSearchParams({
    where, f: 'json', returnGeometry: 'false',
    outFields: 'KDEPUM,NAMOBJ,WADMPR,WADMKK,WADMKC,WADMKD',
    resultOffset: String(offset), resultRecordCount: String(PAGE_SIZE),
    orderByFields: 'KDEPUM'
  });
  const res = await fetch(`${url}/query?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} at offset ${offset}`);
  const json = await res.json();
  return (json.features || []).map(f => f.attributes);
}

async function main() {
  console.log('Fetching desa count from BIG RBI...');
  const total = await fetchCount(DESA_URL);
  console.log(`Total desa: ${total}`);

  const pages = Math.ceil(total / PAGE_SIZE);
  console.log(`Pages to fetch: ${pages}`);

  const allDesa = [];
  for (let i = 0; i < pages; i++) {
    const offset = i * PAGE_SIZE;
    console.log(`Fetching page ${i + 1}/${pages} (offset ${offset})...`);
    const features = await fetchPage(DESA_URL, offset);
    allDesa.push(...features);
    if (i < pages - 1) await new Promise(r => setTimeout(r, 300));
  }

  console.log(`Total fetched: ${allDesa.length}`);

  const provMap = new Map();
  const kabMap = new Map();
  const kecMap = new Map();
  const desaList = [];

  for (const d of allDesa) {
    const kode = d.KDEPUM;
    const parts = (kode || '').split('.');
    if (parts.length < 4) continue;

    const provKode = parts[0];
    const kabKode = `${parts[0]}.${parts[1]}`;
    const kecKode = `${parts[0]}.${parts[1]}.${parts[2]}`;
    const namaDesa = d.NAMOBJ || d.WADMKD || '';
    const namaKec = d.WADMKC || '';
    const namaKab = d.WADMKK || '';
    const namaProv = d.WADMPR || '';

    if (!provMap.has(provKode) && namaProv) {
      provMap.set(provKode, { kode: provKode, nama: namaProv });
    }
    if (!kabMap.has(kabKode) && namaKab) {
      kabMap.set(kabKode, { kode: kabKode, nama: namaKab });
    }
    if (!kecMap.has(kecKode) && namaKec) {
      kecMap.set(kecKode, { kode: kecKode, nama: namaKec });
    }
    desaList.push({ kode, nama: namaDesa });
  }

  const result = [
    ...[...provMap.values()].sort((a, b) => a.kode.localeCompare(b.kode)),
    ...[...kabMap.values()].sort((a, b) => a.kode.localeCompare(b.kode)),
    ...[...kecMap.values()].sort((a, b) => a.kode.localeCompare(b.kode)),
    ...desaList.sort((a, b) => a.kode.localeCompare(b.kode))
  ];

  const outPath = join(__dirname, '..', 'assets', 'data', 'kode_wilayah.json');
  writeFileSync(outPath, JSON.stringify(result));
  console.log(`Written ${result.length} entries to kode_wilayah.json`);
  console.log(`  Provinsi: ${provMap.size}`);
  console.log(`  Kab/Kota: ${kabMap.size}`);
  console.log(`  Kecamatan: ${kecMap.size}`);
  console.log(`  Desa: ${desaList.length}`);
}

main().catch(console.error);
