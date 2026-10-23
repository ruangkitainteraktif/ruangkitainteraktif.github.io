/* Build a compact, static example of GISTARU point-identification data.
   Run with: node scripts/build-gistaru-persil-sample.mjs */
import { writeFileSync } from 'node:fs';

const ID_WILAYAH = '3372000000';
const LATITUDE = -7.5393212797350015;
const LONGITUDE = 110.82485970453568;
const API = 'https://gistaru.atrbpn.go.id/rdtrinteraktif/api/interactive';
const target = new URL('data', API + '/');
target.search = new URLSearchParams({
  id_wilayah: ID_WILAYAH,
  latitude: String(LATITUDE),
  longitude: String(LONGITUDE)
}).toString();
const activityUrl = new URL('activities', API + '/');
activityUrl.search = new URLSearchParams({ id_wilayah: ID_WILAYAH, id_rtr: '001' }).toString();

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('GISTARU membalas HTTP ' + response.status + ' untuk ' + url);
  const json = await response.json();
  if (json.status !== 200) throw new Error(json.message || 'Respons GISTARU tidak valid.');
  return json.data;
}

function leaves(value, path = [], result = []) {
  if (Array.isArray(value)) value.forEach(item => leaves(item, path, result));
  else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => leaves(item, path.concat(key), result));
  } else if (value != null && String(value).trim() !== '') {
    result.push({ path, value: String(value).trim() });
  }
  return result;
}

function distinct(values) { return [...new Set(values)]; }

function metrics(data) {
  const out = {};
  ['kdb', 'klb', 'kdh'].forEach(key => {
    out[key] = distinct(leaves(data[key]).map(row => row.value));
  });
  const height = new Map();
  leaves(data.ktgbgn).forEach(row => {
    const lotSize = row.path[row.path.length - 1];
    if (!height.has(lotSize)) height.set(lotSize, new Set());
    height.get(lotSize).add(row.value);
  });
  out.ktgbgn = [...height].map(([lotSize, values]) => ({ lotSize, values: [...values] }));
  const separation = new Map();
  leaves(data.ktb).forEach(row => {
    const rule = row.path[0];
    if (!separation.has(rule)) separation.set(rule, { rule, values: new Set(), roadClasses: new Set() });
    separation.get(rule).values.add(row.value);
    if (row.path[1]) separation.get(rule).roadClasses.add(row.path[1]);
  });
  out.ktb = [...separation.values()].map(item => ({
    rule: item.rule,
    values: [...item.values],
    roadClassCount: item.roadClasses.size
  }));
  out.gsb = distinct(leaves(data.gsb).map(row => row.value));
  out.ketrgn = distinct(leaves(data.ketrgn).map(row => row.value));
  out.ketentuanKegiatan = {};
  ['iznktg', 'tbtktg', 'bstktg', 'tbsktg'].forEach(key => {
    out.ketentuanKegiatan[key] = distinct(leaves(data[key]).map(row => row.value));
  });
  return out;
}

function activities(data, activityRows) {
  const nameById = new Map(activityRows.map(row => [String(row.id_kegiatan), row.kegiatan]));
  const groups = [
    ['diizinkan', 'bgnizn'],
    ['terbatas', 'bgntbt'],
    ['bersyarat', 'bgnbst'],
    ['tidakSesuai', 'bgntbs']
  ];
  const result = {};
  groups.forEach(([name, key]) => {
    const ids = distinct(leaves(data[key]).map(row => row.value));
    result[name] = ids.map(id => ({ id, nama: nameById.get(id) || id }));
  });
  return result;
}

const [data, activityRows] = await Promise.all([getJson(target), getJson(activityUrl)]);
if (!Array.isArray(activityRows)) throw new Error('Daftar kegiatan GISTARU tidak valid.');
const snapshot = {
  _meta: {
    deskripsi: 'Snapshot statis identifikasi RDTR GISTARU untuk satu titik contoh; tidak mengikuti klik persil.',
    sumber: target.toString(),
    sumberKegiatan: activityUrl.toString(),
    diambil: new Date().toISOString(),
    latitude: LATITUDE,
    longitude: LONGITUDE,
    id_wilayah: ID_WILAYAH
  },
  lokasi: {
    wilayah: 'Kota Surakarta',
    kecamatan: data.wadmkc,
    kelurahan: data.wadmkd
  },
  zona: {
    rtr: data.rtr,
    id_rtr: data.id_rtr,
    nama: data.namzon,
    kode: data.kodzon,
    subzona: data.namszn,
    kodeSubzona: data.kodszn,
    kodeBlok: data.kodblk,
    kodeSubblok: data.kodsbl,
    namaSWK: data.namswk
  },
  intensitas: metrics(data),
  kegiatan: activities(data, activityRows),
  peraturan: {
    ringkasan: data.nothpr,
    persetujuanPerda: data.pp,
    batangTubuh: data.bt,
    catatan: data.ct
  }
};

const output = new URL('../assets/data/gistaru-persil-sample.json', import.meta.url);
writeFileSync(output, JSON.stringify(snapshot, null, 2) + '\n');
console.log('Snapshot tersimpan:', output.pathname, '| ukuran:', Buffer.byteLength(JSON.stringify(snapshot)), 'byte');
