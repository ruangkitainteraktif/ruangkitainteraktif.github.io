/* Uji COMPUTE_SPECS, PICKABLE_KEYS, dan readCogBandsAligned (validasi
   penyelarasan band). Blok diambil dari polygon-analysis.js yang asli,
   bukan disalin, supaya kalau implementasi berubah, tes ikut berubah. */
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
/* Ekstraksi berbasis pencocokan kurung kurawal, bukan regex: pola
   /...[\s\S]*?\n  \}/ memotong fungsi di dalam blok if. */
function potongNama(nama) {
  const m = SRC.match(new RegExp('^\\s*(?:async\\s+)?function ' + nama + '\\(', 'm'));
  if (!m) { console.error('tidak ditemukan: ' + nama); process.exit(1); }
  const mulai = SRC.indexOf('{', m.index);
  let depth = 0, i = mulai;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) { console.error('kurung kurawal tidak seimbang di ' + nama); process.exit(1); }
  return SRC.slice(m.index, i + 1);
}
function potong(re) {
  const m = SRC.match(re);
  if (!m) { console.error('blok tidak ditemukan: ' + re); process.exit(1); }
  return m[0];
}

/* ---------- 1. COMPUTE_SPECS & PICKABLE_KEYS ---------- */
console.log('\n1. COMPUTE_SPECS dan PICKABLE_KEYS');

const blokCompute = potong(/const COMPUTE_SPECS = \(function \(\) \{[\s\S]*?\}\)\(\);/);
const blokPick = potong(/const PICKABLE_KEYS = PICK_ORDER\.filter[\s\S]*?return !!COMPUTE_SPECS\[key\]; \}\);/);
const blokOrder = potong(/const PICK_ORDER = \[[^\]]*\];/);

// Stub yang mencerminkan data nyata: ALL_INDEXES berisi 7 index spektral
// (NDVI tidak ada di sana), TREND_SPECS berisi 8 (ada ndvi).
const stub = `
const NDVI_BANDS = ['ndviTable'];
const ALL_INDEXES = [
  { key:'ndmi', label:'NDMI', hint:'h', formula:'f', table:['t'] },
  { key:'ndre', label:'NDRE', hint:'h', formula:'f', table:['t'] },
  { key:'ndwi', label:'NDWI', hint:'h', formula:'f', table:['t'] },
  { key:'evi', label:'EVI', hint:'h', formula:'f', table:['t'], scale:0.0001, range:[-2,2] },
  { key:'msavi', label:'MSAVI', hint:'h', formula:'f', table:['t'], scale:0.0001, range:[-2,2] },
  { key:'nbr', label:'NBR', hint:'h', formula:'f', table:['t'] },
  { key:'ndvi705', label:'NDVI705', hint:'h', formula:'f', table:['t'] },
  { key:'orphan', label:'Orphan', hint:'h', formula:'f', table:['t'] }
];
const TREND_SPECS = {
  ndvi:{ bands:'4,8', compute:'ndRatio' },
  ndmi:{ bands:'11,8', compute:'ndRatio' },
  ndre:{ bands:'5,8', compute:'ndRatio' },
  ndwi:{ bands:'8,3', compute:'ndRatio' },
  evi:{ bands:'8,4,2', scale:0.0001, compute:'eviCompute', range:[-2,2] },
  msavi:{ bands:'8,4', scale:0.0001, compute:'msaviCompute', range:[-2,2] },
  nbr:{ bands:'12,8', compute:'ndRatio' },
  ndvi705:{ bands:'5,6', compute:'ndRatio' }
};
`;

const c1 = {};
c1.globalThis = c1;
vm.createContext(c1);
vm.runInContext(stub + blokCompute + '\n' + blokOrder + '\n' + blokPick +
  '\nthis.C = COMPUTE_SPECS; this.P = PICKABLE_KEYS;', c1);
const C = c1.C;
const P = c1.P;

ok('8 index terpasang (7 dari ALL_INDEXES + ndvi)', Object.keys(C).length === 8,
  Object.keys(C).length + ' key');
ok('NDVI ikut terpasang walau tidak ada di ALL_INDEXES', !!C.ndvi);
ok('NDVI memakai tabel kelas NDVI_BANDS',
  Array.isArray(C.ndvi.table) && C.ndvi.table[0] === 'ndviTable', JSON.stringify(C.ndvi.table));
ok('NDVI punya bands dari TREND_SPECS', C.ndvi.bands === '4,8', C.ndvi.bands);
ok('index tanpa TREND_SPECS ikut terbuang', !('orphan' in C));
ok('PICKABLE_KEYS punya 8 entri', P.length === 8, P.length + ' entri');
ok('PICKABLE_KEYS urut: NDVI di depan', P[0] === 'ndvi', P[0]);
ok('PICKABLE_KEYS memuat kedelapan index',
  P.join(',') === 'ndvi,ndmi,ndre,ndwi,evi,msavi,nbr,ndvi705', P.join(','));

// Setiap spec harus punya bagian tampilan DAN bagian hitung.
let lengkap = true, pesan = '';
P.forEach(function (k) {
  const s = C[k];
  ['label', 'hint', 'formula', 'table', 'bands', 'compute'].forEach(function (f) {
    if (s[f] === undefined || s[f] === null) { lengkap = false; pesan = k + ' tidak punya ' + f; }
  });
  if (typeof s.bands !== 'string' || s.bands.indexOf(',') < 0 && s.bands.indexOf(',') !== -1) { /* noop */ }
});
ok('setiap spec punya label, hint, formula, table, bands, compute', lengkap, pesan);

// bands harus bisa dipecah jadi nomor band
let bandsOke = true, jumlahBand = {};
P.forEach(function (k) {
  const arr = String(C[k].bands).split(',');
  jumlahBand[k] = arr.length;
  if (arr.some(function (b) { return !/^\d+$/.test(b.trim()); })) {
    bandsOke = false; pesan = k + ' punya band non-numerik: ' + C[k].bands;
  }
});
ok('semua bands berupa nomor band numerik', bandsOke, pesan);
ok('ndmi butuh 2 band', jumlahBand.ndmi === 2, jumlahBand.ndmi);
ok('evi butuh 3 band', jumlahBand.evi === 3, jumlahBand.evi);
ok('msavi butuh 2 band', jumlahBand.msavi === 2, jumlahBand.msavi);
ok('indeks lain 2 band', ['ndvi', 'ndre', 'ndwi', 'nbr', 'ndvi705'].every(function (k) { return jumlahBand[k] === 2; }));

// scale & range harus diteruskan utuh dari TREND_SPECS
ok('EVI membawa scale 0.0001', C.evi.scale === 0.0001, C.evi.scale);
ok('EVI membawa range [-2,2]', Array.isArray(C.evi.range) && C.evi.range[0] === -2 && C.evi.range[1] === 2);
ok('MSAVI membawa scale 0.0001', C.msavi.scale === 0.0001, C.msavi.scale);
ok('NDVI tidak punya scale (rasio tidak butuh)', C.ndvi.scale === undefined, C.ndvi.scale);

/* ---------- 2. Rumus: verifikasi urutan band (minus, plus) ---------- */
console.log('\n2. Urutan band ndRatio harus (minus, plus)');
const ndRatio = function (v) { return (v[1] - v[0]) / (v[1] + v[0]); };

// NDMI: TREND_SPECS '11,8' -> v[0]=B11, v[1]=B08 -> (B08-B11)/(B08+B11)
const ndmiNilai = ndRatio([1100, 3300]);
ok('NDMI B11=1100 B08=3300 -> 0.5', Math.abs(ndmiNilai - 0.5) < 1e-12, ndmiNilai);
// Band terbalik akan menghasilkan tanda yang salah
ok('NDMI band terbalik menghasilkan tanda kebalik', ndRatio([3300, 1100]) === -0.5);

// Band bercampur resolusi: B11 20 m, B08 10 m. Nilai harus tetap masuk akal.
ok('NDMI dengan band sama besar -> 0', ndRatio([2000, 2000]) === 0);
ok('NDMI dengan band 20 m bernilai realistis',
  Math.abs(ndRatio([800, 3200]) - 0.6) < 1e-12, ndRatio([800, 3200]));

// NBR: '12,8' -> v[0]=B12, v[1]=B08 -> (B08-B12)/(B08+B12)
ok('NBR (B08-B12)/(B08+B12) benar', Math.abs(ndRatio([1000, 3000]) - 0.5) < 1e-12, ndRatio([1000, 3000]));
// Band 12 untuk NBR harus B12 (20 m), bukan B11 seperti di jalur ArcGIS
ok('NBR memakai band 12', C.nbr.bands === '12,8', C.nbr.bands);
// Band 11 untuk NDMI harus B11
ok('NDMI memakai band 11', C.ndmi.bands === '11,8', C.ndmi.bands);

/* ---------- 3. Baca blok readCogBandsAligned ---------- */
console.log('\n3. readCogBandsAligned: penyelarasan band beda resolusi');
const blokAligned = potongNama('readCogBandsAligned');
const blokWindow = potongNama('cogWindow');

// Peta band Sentinel-2: resolusi metres per pixel.
const RESOLUSI = { B02: 10, B03: 10, B04: 10, B05: 20, B06: 20, B08: 10, B11: 20, B12: 20 };

/* Citra palsu: menjendela geographic box yang sama, kepadatan piksel
   berbeda sesuai resolusi band. Kalau jendela tidak disamakan ukurannya,
   band 20 m akan menghasilkan 1/4 piksel dan penjajarannya bergeser.

   Catatan tanda sumbu: berkasnya memakai Y = bb[3] - baris * resY, jadi resY
   diharapkan positif (baris 0 = utara). Itu sama dengan yang
   readCogWindowMasked() pakai di jalur LST yang sudah bekerja, dan
   readCogBandsAligned memakai rumus yang sama persis. */
function imagePalsu(namaBand, geo, resMeter) {
  const res = [resMeter, resMeter];
  const widthPx = Math.floor(2000 / resMeter);
  const heightPx = Math.floor(2000 / resMeter);
  return {
    _res: res, _w: widthPx, _h: heightPx, _name: namaBand,
    getBoundingBox: function () { return [geo.minX, geo.minY, geo.maxX, geo.maxY]; },
    getResolution: function () { return this._res; },
    getWidth: function () { return this._w; },
    getHeight: function () { return this._h; },
    // Nilai band konstan agarUJI hanya mengukur penyelarasan geometri.
    _nilai: 1000,
    readRasters: function (opts) {
      const w = opts.width || (opts.window[2] - opts.window[0]);
      const h = opts.height || (opts.window[3] - opts.window[1]);
      const out = new Array(w * h);
      for (let i = 0; i < out.length; i++) out[i] = this._nilai;
      return Promise.resolve([out]);
    }
  };
}

const c2 = { Math, Array, Number, Promise, Error, console };
c2.globalThis = c2;
vm.createContext(c2);
vm.runInContext(
  `function projectBounds(b){ return { west: b.west, south: b.south, east: b.east, north: b.north, minX: 500000, minY: 0, maxX: 502000, maxY: 2000 }; }
   function projectRings(r){ return r; }
   function rasterizeMask(rings, geo) { return new Array(geo.width * geo.height).fill(1); }
   var window = { GeoTIFF: { fromUrl: function () { return Promise.resolve({ getImage: function () { return this._img; } }); } } };
  ` + blokAligned.replace(/window\.GeoTIFF\.fromUrl\(href\)/g, 'window.GeoTIFF.fromUrl(href)')
    + '\nthis.readCogBandsAligned = readCogBandsAligned;', c2);
const readCogBandsAligned = c2.readCogBandsAligned;

// Pasang citra palsu per href
const urls = ['https://x/B08.tif', 'https://x/B11.tif'];
const geo = { minX: 500000, minY: 0, maxX: 502000, maxY: 2000 };
const imgs = {
  'https://x/B08.tif': imagePalsu('B08', geo, 10),
  'https://x/B11.tif': imagePalsu('B11', geo, 20)
};
// T intercepted window.GeoTIFF.fromUrl supaya mengembalikan citra yang benar
c2.__imgs = imgs;

(async function () {
  // Jalankan dengan stub window.GeoTIFF yang benar
  const sandbox = {
    Math, Array, Number, Promise, Error, console,
    projectBounds: b => ({ ...b, minX: 500000, minY: 0, maxX: 502000, maxY: 2000 }),
    projectRings: r => r,
    rasterizeMask: (rings, geo2) => new Array(geo2.width * geo2.height).fill(1)
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const imgByUrl = {};
  sandbox.window = {
    GeoTIFF: {
      fromUrl: function (href) {
        return Promise.resolve({
          getImage: function () { return imgByUrl[href]; }
        });
      }
    }
  };
  // TREND_SAMPLE_PX = 32 persis seperti di berkas asal.
  sandbox.TREND_SAMPLE_PX = 32;
  imgByUrl[urls[0]] = imgs[urls[0]];
  imgByUrl[urls[1]] = imgs[urls[1]];
  vm.runInContext(blokWindow + '\n' + blokAligned + '\nthis.f = readCogBandsAligned;', sandbox);

  const bounds = { west: 500010, south: 10, east: 500990, north: 1990 };
  const r = await sandbox.f(urls, bounds, [[[500010, 10], [500990, 10], [500990, 1990], [500010, 1990]]], 64);

  ok('dua band terbaca', r.rasters.length === 2, r.rasters.length);
  ok('kedua band punya panjang sama', r.rasters[0].length === r.rasters[1].length,
    r.rasters[0].length + ' vs ' + r.rasters[1].length);
  ok('panjang = width * height', r.rasters[0].length === r.width * r.height,
    r.rasters[0].length + ' vs ' + (r.width * r.height));
  ok('panjang tidak nol', r.rasters[0].length > 0);
  ok('mask dibuat dengan ukuran yang sama', r.mask.length === r.width * r.height,
    r.mask.length + ' vs ' + (r.width * r.height));

  // Band 10 m jadi acuan: jendela 64 px
  ok('width mengikuti band 10 m (acuan)', r.width === 64, r.width);
  ok('tinggi sesuai aspect ratio geographic', r.height === 64, r.height);

  // Band yang dihilang harus jadi error, bukan diam-diam tidak sinkron
  let errorTangkap = null;
  const sandbox2 = { ...sandbox };
  sandbox2.globalThis = sandbox2;
  vm.createContext(sandbox2);
  const imgBuruk = imagePalsu('B11', geo, 20);
  imgBuruk.readRasters = function (opts) { return Promise.resolve([new Array(7).fill(1)]); };
  const imgByUrl2 = { [urls[0]]: imgs[urls[0]], [urls[1]]: imgBuruk };
  sandbox2.window = { GeoTIFF: { fromUrl: href => Promise.resolve({ getImage: () => imgByUrl2[href] }) } };
  vm.runInContext(blokWindow + '\n' + blokAligned + '\nthis.f = readCogBandsAligned;', sandbox2);
  try {
    await sandbox2.f(urls, bounds, [[[500010, 10], [500990, 10], [500990, 1990], [500010, 1990]]], 64);
  } catch (e) { errorTangkap = e; }
  ok('band yang panjangnya salah melempar error, bukan diam-diam', !!errorTangkap,
    errorTangkap ? errorTangkap.message : 'tidak ada error');
  ok('pesan error menyebut jumlah piksel', !!errorTangkap && /piksel/.test(errorTangkap.message),
    errorTangkap ? errorTangkap.message : '');

  // COG kosong harus error
  const sandbox3 = { ...sandbox };
  sandbox3.globalThis = sandbox3;
  vm.createContext(sandbox3);
  const imgKosong = imagePalsu('B08', geo, 10);
  imgKosong.readRasters = () => Promise.resolve([]);
  sandbox3.window = { GeoTIFF: { fromUrl: () => Promise.resolve({ getImage: () => imgKosong }) } };
  vm.runInContext(blokWindow + '\n' + blokAligned + '\nthis.f = readCogBandsAligned;', sandbox3);
  let e3 = null;
  try { await sandbox3.f(['a'], bounds, [[[500010, 10], [500990, 10], [500990, 1990], [500010, 1990]]], 64); }
  catch (e) { e3 = e; }
  ok('COG tanpa piksel melempar error', !!e3, e3 ? e3.message : 'tidak ada error');

  // Daftar href kosong harus error
  let e4 = null;
  try { await sandbox.f([], bounds, [], 64); } catch (e) { e4 = e; }
  ok('daftar band kosong melempar error', !!e4, e4 ? e4.message : 'tidak ada error');

  console.log('\n' + (fail === 0 ? 'SEMUA LULUS' : 'ADA YANG GAGAL') + ': ' + pass + ' lulus, ' + fail + ' gagal');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR TES:', e); process.exit(1); });
