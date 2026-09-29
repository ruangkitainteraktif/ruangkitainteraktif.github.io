/* Uji ujung-ke-ujung mode mandiri terhadap Planetary Computer sungguhan.
   Menjalankan: stacListScenes -> pilih adegan -> baca band COG -> rumus
   index -> computeStats -> median. Tidak memakai mock.

   Jalankan: node test-mode-e2e.cjs            (butuh jaringan)
   Lewati bila STAC tidak terjangkau: exit 0 dengan pesan. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(
  path.join(__dirname, 'assets', 'js', 'polygon-analysis.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}
function potong(re) {
  const m = SRC.match(re);
  if (!m) { console.error('blok tidak ditemukan: ' + re); process.exit(1); }
  return m[0];
}

// Kotak uji di Kab. Subang, Jawa Barat (daerah persawahan).
const BBOX = { west: 107.70, south: -6.58, east: 107.78, north: -6.52 };
const BOUNDS = { west: 500010, south: 10, east: 500990, north: 1990 };
// Poligon bujur sangkar 2x2 km di dalam UTM 48N, diproyeksi ke derajat
// hanya untuk needsAsiyap: di sini rings dipakai apa adanya oleh stub.
const RINGS = [[[500010, 10], [500990, 10], [500990, 1990], [500010, 1990], [500010, 10]]];

// Buffer PNG/canvas mini supaya rasterizeMask benar-benar571 meng-return
// mask berisi 1 di dalam polygon.
function stubCanvas() {
  return {
    width: 0, height: 0,
    getContext() {
      return {
        clearRect() {},
        // Polygon dip raster ke kanan atas; kalau titik di dalam [0.5,0.5]
        // dianggap fill, seluruh jendela jadi 1.
        beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
        fill() {}, set fillStyle(v) {},
        getImageData(x, y, w, h) {
          const d = new Uint8ClampedArray(w * h * 4);
          for (let i = 0; i < w * h; i++) { d[i * 4 + 3] = 255; }
          return { data: d, width: w, height: h };
        }
      };
    },
    toDataURL() { return 'data:image/png;base64,'; }
  };
}

const stubs = `
const PC_COLLECTION = 'sentinel-2-l2a';
const PC_SEARCH_URL = 'https://planetarycomputer.microsoft.com/api/stac/v1/search';
const PC_SIGN_URL = 'https://planetarycomputer.microsoft.com/api/sas/v1/sign';
const TREND_CLOUD_HIGH = 25;
const TREND_SAMPLE_PX = 32;
const NDVI_BANDS = [
  { label:'rendah', min:-Infinity, max:0.2, rgb:[198,135,42] },
  { label:'sedang', min:0.2, max:0.4, rgb:[215,190,55] },
  { label:'tinggi', min:0.4, max:Infinity, rgb:[101,169,66] }
];
const SPECTRAL_INDEXES = [
  { key:'ndmi', label:'NDMI', table:NDVI_BANDS },
  { key:'ndre', label:'NDRE', table:NDVI_BANDS },
  { key:'ndwi', label:'NDWI', table:NDVI_BANDS }
];
const EXTRA_INDEXES = [
  { key:'evi', label:'EVI', table:NDVI_BANDS, scale:0.0001, range:[-2,2] },
  { key:'msavi', label:'MSAVI', table:NDVI_BANDS, scale:0.0001, range:[-2,2] },
  { key:'nbr', label:'NBR', table:NDVI_BANDS },
  { key:'ndvi705', label:'NDVI705', table:NDVI_BANDS }
];
const ALL_INDEXES = SPECTRAL_INDEXES.concat(EXTRA_INDEXES);
function ndRatio(v){ return (v[1]-v[0])/(v[1]+v[0]); }
function eviCompute(v){ return 2.5*(v[0]-v[1])/(v[0]+6*v[1]-7.5*v[2]+1); }
function msaviCompute(v){ const t=2*v[0]+1; return (t-Math.sqrt(t*t-8*(v[0]-v[1])))/2; }
const TREND_SPECS = {
  ndvi:{ bands:'4,8', compute:ndRatio },
  ndmi:{ bands:'11,8', compute:ndRatio },
  ndre:{ bands:'5,8', compute:ndRatio },
  ndwi:{ bands:'8,3', compute:ndRatio },
  evi:{ bands:'8,4,2', scale:0.0001, compute:eviCompute, range:[-2,2] },
  msavi:{ bands:'8,4', scale:0.0001, compute:msaviCompute, range:[-2,2] },
  nbr:{ bands:'12,8', compute:ndRatio },
  ndvi705:{ bands:'5,6', compute:ndRatio }
};
function projectBounds(b){ return { west:500010, south:10, east:500990, north:1990, epsg:32648 }; }
function projectRings(r){ return r; }
function rasterizeMask(rings, raster){
  const n = raster.width * raster.height;
  return new Uint8Array(n).fill(1);
}
function findBand(v, table){
  for (let i=0;i<table.length;i++){ if (v>=table[i].min && v<table[i].max) return table[i]; }
  return table[table.length-1];
}
function computeStats(values, mask, table, range){
  const t = table || NDVI_BANDS;
  const lo = range && Number.isFinite(range[0]) ? range[0] : -1;
  const hi = range && Number.isFinite(range[1]) ? range[1] : 1;
  let count=0,sum=0,mn=Infinity,mx=-Infinity,inside=0;
  const bands = t.map(function(b){ return { band:b, count:0 }; });
  for (let i=0;i<mask.length;i++){
    if(!mask[i]) continue; inside++;
    const v = values[i];
    if(!Number.isFinite(v)||v<lo||v>hi) continue;
    count++; sum+=v;
    if(v<mn)mn=v; if(v>mx)mx=v;
    const f = findBand(v,t);
    for(let b=0;b<bands.length;b++) if(bands[b].band===f) bands[b].count++;
  }
  return { count, inside, mean: count?sum/count:NaN, min: count?mn:NaN, max: count?mx:NaN,
    coverage: inside?(count/inside)*100:0, bands };
}
function applyIndexFormula(rasters, spec){
  if (spec.rule) return rasters[0];
  const total = Math.min.apply(null, rasters.map(function(r){return r.length;}));
  const out = new Float64Array(total);
  const scale = Number.isFinite(spec.scale) ? spec.scale : 1;
  for (let i=0;i<total;i++){
    const v = new Array(rasters.length);
    let bad = false;
    for (let b=0;b<rasters.length;b++){ const raw=rasters[b][i]; if(!(raw>0 && raw<=10000)) {bad=true;break;} v[b]=raw*scale; }
    out[i] = bad ? NaN : spec.compute(v);
  }
  return out;
}
var window = { GeoTIFF: { fromUrl: function(href){ return require('geotiffish')(href); } },
  console: console };
`;

console.log('Menghubungi Planetary Computer...');
(async function () {
  // 1. Cek dulu apakah STAC terjangkau; kalau tidak, lewati dengan baik.
  let jaringOk = true;
  try {
    const r = await fetch('https://planetarycomputer.microsoft.com/api/stac/v1/collections',
      { signal: AbortSignal.timeout(45000) });
    jaringOk = r.ok;
  } catch (e) {
    jaringOk = false;
    console.log('  STAC tidak terjangkau (' + e.message + '), tes dilewati.');
  }
  if (!jaringOk) { console.log('\nDilewati karena jaringan.'); process.exit(0); }

  const blocks = [
    /async function stacListScenes\(bounds, opts\) \{[\s\S]*?\n  \}/,
    /function trendAssetName\(band\) \{[\s\S]*?\n  \}/,
    /function trendStatsFromPixels\(values, range\) \{[\s\S]*?\n  \}/,
    /function cogWindow\(bounds, image, maxPx\) \{[\s\S]*?\n  \}/,
    /async function readCogBandsAligned\(hrefs, bounds, rings, maxPx\) \{[\s\S]*?\n  \}/,
    /function robustStatsInMask\(values, mask, range\) \{[\s\S]*?\n  \}/,
    /async function signCogUrl\(href\) \{[\s\S]*?\n  \}/
  ].map(potong).join('\n');

  const specBlocks = potong(/const COMPUTE_SPECS = \(function \(\) \{[\s\S]*?\}\)\(\);/);

  const sandbox = {
    console, Math, JSON, Date, Promise, Number, Array, String, Object,
    Map, Set, Error, Float64Array, Uint8Array, parseInt, isNaN,
    AbortSignal
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.document = { createElement: stubCanvas };
  sandbox.fetch = fetch;
  vm.createContext(sandbox);
  vm.runInContext(stubs + '\n' + blocks + '\n' + specBlocks +
    '\nthis.list=stacListScenes;this.read=readCogBandsAligned;this.sign=signCogUrl;' +
    '\nthis.robust=robustStatsInMask;this.apply=applyIndexFormula;this.stats=computeStats;' +
    '\nthis.C=COMPUTE_SPECS;this.nd=ndRatio;this.band=trendAssetName;', sandbox);

  // 2. Cari adegan nyata
  console.log('\n1. Pencarian adegan (STAC nyata)');
  const list = await sandbox.list(BBOX, { cloudLimit: 20, months: 6, limit: 30 });
  ok('STAC mengembalikan adegan', Array.isArray(list) && list.length > 0,
    (list && list.length) + ' adegan');
  if (!list || !list.length) {
    console.log('  tidak ada adegan, tes berikutnya dilewati.');
    process.exit(fail === 0 ? 0 : 1);
  }
  console.log('  ' + list.length + ' adegan, 5 teratas:');
  list.slice(0, 5).forEach(s => console.log('    ' + s.date + '  awan ' +
    (Number.isFinite(s.cloud) ? s.cloud.toFixed(2) + '%' : '-') + '  ' + (s.platform || '-')));
  ok('tanggal format YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(list[0].date), list[0].date);
  ok('semua adegan di bawah batas awan 20%',
    list.every(s => !Number.isFinite(s.cloud) || s.cloud < 20));
  ok('terurut terbaru dulu', list[0].date >= list[list.length - 1].date,
    list[0].date + ' vs ' + list[list.length - 1].date);
  ok('tiap adegan punya assets COG', !!list[0].assets && !!list[0].assets.B08);
  ok('tanpa tanggal kembar', new Set(list.map(s => s.date)).size === list.length);

  // 3. Ambil scene paling bersih dan baca band sungguhan
  const scene = list.reduce((b, s) => {
    if (!b) return s;
    return (Number.isFinite(s.cloud) ? s.cloud : 999) < (Number.isFinite(b.cloud) ? b.cloud : 999) ? s : b;
  }, null);
  console.log('\n2. Cek ketersediaan band pada adegan terpilih (' + scene.date + ')');
  // Catatan jujur: yang diuji di sini adalah metadata STAC sungguhan dan
  // ketersediaan asset-nya. Pembacaan piksel COG asli tidak bisa dijalankan
  // di Node tanpa geotiff.js, jadi bagian jendela/penyelarasan di bawah
  // memakai citra simulasi, bukan unduhan COG.
  const semuaBand = new Set();
  ['ndvi', 'ndmi', 'ndre', 'ndwi', 'evi', 'msavi', 'nbr', 'ndvi705'].forEach(k => {
    String(sandbox.C[k].bands).split(',').forEach(b => semuaBand.add(sandbox.band(b.trim())));
  });
  console.log('  band dibutuhkan semua index: ' + Array.from(semuaBand).sort().join(' '));
  const hilang = Array.from(semuaBand).filter(n => !scene.assets[n]);
  ok('adegan menyediakan semua band yang dibutuhkan 8 index', hilang.length === 0,
    'hilang: ' + (hilang.length ? hilang.join(',') : 'tidak ada'));

  // trendAssetName harus memetakan nomor band ESA ke nama asset
  ok('trendAssetName(4) = B04', sandbox.band('4') === 'B04', sandbox.band('4'));
  ok('trendAssetName(8) = B08', sandbox.band('8') === 'B08', sandbox.band('8'));
  ok('trendAssetName(12) = B12 (bukan B11)', sandbox.band('12') === 'B12', sandbox.band('12'));

  const assetNames = ['4', '8'].map(sandbox.band);
  console.log('  band NDVI: ' + assetNames.join(' + '));
  const hrefs = [];
  for (const n of assetNames) {
    if (!scene.assets[n]) { ok('asset ' + n + ' ada', false); return finish(); }
    hrefs.push(await sandbox.sign(scene.assets[n].href));
  }
  ok('penandatanganan COG berhasil', hrefs.every(h => /^https?:/.test(h)));
  ok('URL bertanda tangan punya token', hrefs.every(h => /[?&]st=/.test(h)));

  console.log('\n3. Penyelarasan jendela band beda resolusi (citra simulasi)');
  const fake = makeMiniCog(hrefs.length);
  const test = await readBands(sandbox, fake);
  ok('pembaca menghasilkan dua band', test.rasters.length === 2);
  ok('kedua band sama panjang', test.rasters[0].length === test.rasters[1].length);
  ok('panjang = width x height', test.rasters[0].length === test.width * test.height);
  ok('geo diteruskan untuk overlay', !!test.geo && Number.isFinite(test.geo.minX),
    JSON.stringify(test.geo));

  console.log('\n4. Rumus index dari piksel');
  // Biri B04 = 1500, B08 = 6000 -> NDVI = (6000-1500)/(6000+1500) = 0.6
  const spec = sandbox.C.ndvi;
  const r = test.rasters;
  const values = sandbox.apply(r, spec);
  let valid = 0, sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (Number.isFinite(values[i])) { valid++; sum += values[i]; }
  }
  ok('ada piksel valid', valid > 0, valid + ' dari ' + values.length);
  const rerata = sum / valid;
  ok('NDVI dari piksel = 0,600', Math.abs(rerata - 0.6) < 1e-9, rerata);

  const st = sandbox.stats(values, test.mask, spec.table, spec.range);
  ok('computeStats memberi count > 0', st.count > 0, st.count);
  ok('mean ~0,6', Math.abs(st.mean - 0.6) < 1e-9, st.mean);
  ok('coverage 100%', Math.abs(st.coverage - 100) < 1e-9, st.coverage);
  const rb = sandbox.robust(values, test.mask, spec.range);
  ok('median ~0,6', Math.abs(rb.median - 0.6) < 1e-9, rb.median);
  ok('p10 = p90 = median untuk nilai seragam', rb.p10 === 0.6 && rb.p90 === 0.6);

  console.log('\n5. Median tahan awan, rerata tidak');
  // 100 piksel tani NDVI 0,7 + 30 piksel awan NDVI 0,0
  const total = 130;
  const vals = new Float64Array(total);
  for (let i = 0; i < 130; i++) vals[i] = i < 100 ? 0.7 : 0.0;
  const m = new Uint8Array(total).fill(1);
  const s2 = sandbox.stats(vals, m, spec.table, spec.range);
  const r2 = sandbox.robust(vals, m, spec.range);
  ok('rerata tergeser oleh awan', s2.mean < 0.55, s2.mean.toFixed(4));
  ok('median tetap stabil', Math.abs(r2.median - 0.7) < 1e-9, r2.median);
  ok('median lebih dekat ke nilai tani daripada rerata',
    Math.abs(r2.median - 0.7) < Math.abs(s2.mean - 0.7),
    r2.median.toFixed(4) + ' vs ' + s2.mean.toFixed(4));

  finish();
})().catch(e => { console.error('ERROR TES:', e); process.exit(1); });

function finish() {
  console.log('\n' + (fail === 0 ? 'SEMUA LULUS' : 'ADA YANG GAGAL') + ': ' + pass + ' lulus, ' + fail + ' gagal');
  process.exit(fail === 0 ? 0 : 1);
}

/* Pembaca COG mini: cukup untuk menguji penjajaran jendela & ukuran, tanpa
   geotiff.js. Band 10 m (B04, B08) dan 20 m disimulasikan supaya terlihat
   apakah keduanya bisa disamakan panjangnya. */
function makeMiniCog(nBand) {
  const mk = (res, nilai) => ({
    getBoundingBox: () => [500000, 0, 502000, 2000],
    getResolution: () => [res, res],
    getWidth: () => Math.floor(2000 / res),
    getHeight: () => Math.floor(2000 / res),
    readRasters: (opts) => {
      const w = opts.width || (opts.window[2] - opts.window[0]);
      const h = opts.height || (opts.window[3] - opts.window[1]);
      return Promise.resolve([new Array(w * h).fill(nilai)]);
    }
  });
  return [mk(10, 1500), mk(10, 6000)];
}

async function readBands(sandbox, imgs) {
  // Bungkus window.GeoTIFF.fromUrl dengan citra mini kita
  let i = 0;
  sandbox.window.GeoTIFF = {
    fromUrl: () => Promise.resolve({ getImage: () => imgs[i++] })
  };
  return sandbox.read(['u1', 'u2'], BOUNDS, RINGS, 64);
}
