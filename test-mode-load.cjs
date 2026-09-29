/* Smoke test: muat polygon-analysis.js sungguhan di sandbox dengan stub
   permisif, lalu jalankan skenario mode mandiri dengan STAC dan COG palsu.
   Tujuannya menangkap ReferenceError/TDZ dan salah urutan deklarasi yang
   tidak akan terlihat dari pemeriksaan syntax. */
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

/* Stub permisif: apa pun yang tidak dikenal dikembalikan sebagai fungsi atau
   objek kosong, sehingga modul bisa dievaluasi tanpa DOM. */
function stubUniversal(path) {
  const fn = function () { return stubUniversal(path + '()'); };
  return new Proxy(fn, {
    get(t, prop) {
      if (prop === Symbol.toPrimitive) return () => 0;
      if (prop === 'then') return undefined;            // jangan dianggap Promise
      if (prop === Symbol.iterator) return function* () {};
      if (prop === 'length') return 0;
      if (prop === 'getBoundingClientRect') return () => stubUniversal(path + '.rect');
      if (prop === 'getContext') return () => stubUniversal(path + '.ctx');
      return stubUniversal(path + '.' + String(prop));
    },
    apply() { return stubUniversal(path + '()'); },
    construct() { return stubUniversal(path + '.new'); },
    has() { return true; }
  });
}

const sandbox = {
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  Promise: Promise,
  Math: Math,
  JSON: JSON,
  Date: Date,
  Map: Map,
  Set: Set,
  Error: Error,
  AbortController: AbortController,
  Number: Number,
  Array: Array,
  String: String,
  Object: Object,
  parseInt: parseInt,
  parseFloat: parseFloat,
  isNaN: isNaN,
  Float64Array: Float64Array,
  Uint8Array: Uint8Array
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.window = sandbox;
sandbox.document = stubUniversal('document');

console.log('\n1. Modul bisa dievaluasi tanpa ReferenceError');
try {
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'polygon-analysis.js' });
  ok('polygon-analysis.js termuat tanpa melempar error', true);
} catch (e) {
  ok('polygon-analysis.js termuat tanpa melempar error', false, e.message);
  console.log('\n' + pass + ' lulus, ' + fail + ' gagal');
  process.exit(1);
}

console.log('\n2. Yang diekspor ke window tidak berubah');
ok('reopenGeoFarmPanel masih ada', typeof sandbox.window.reopenGeoFarmPanel === 'function',
  typeof sandbox.window.reopenGeoFarmPanel);
ok('removeGeoFarmItemsByLayers masih ada', typeof sandbox.window.removeGeoFarmItemsByLayers === 'function');
// Modul hanya MEMBACA fungsi ini lewat guard, tidak pernah menetakkannya ke
// window. Jadi yang dicek adalah guard-nya masih ada di sumber, bukan key-nya.
ok('setGeoFarmReportIndexSpecs dipanggil lewat guard (untuk PDF)',
  /typeof window\.setGeoFarmReportIndexSpecs === 'function'/.test(SRC));
ok('daftar index untuk laporan PDF tetap dipakai ALL_INDEXES',
  /window\.setGeoFarmReportIndexSpecs\(ALL_INDEXES\)/.test(SRC));
// water-need.js adalah berkas terpisah; yang penting di sini tidak ada kode
// mode mandiri yang menimpa namespace global itu.
ok('mode baru tidak menimpa global WaterNeed',
  !/window\.WaterNeed\s*=/.test(SRC), 'polygon-analysis.js tidak boleh menulis window.WaterNeed');

console.log('\n3. Jalur lama utuh: konstanta dan fungsi kunci tidak berubah');
function isi(pola) {
  const m = SRC.match(pola);
  return m ? m[1] : null;
}
ok('TREND_SAMPLE_PX masih 32', isi(/const TREND_SAMPLE_PX = (\d+);/) === '32',
  isi(/const TREND_SAMPLE_PX = (\d+);/));
ok('TREND_CLOUD_LIMIT masih 20', isi(/const TREND_CLOUD_LIMIT = (\d+);/) === '20');
ok('TREND_CLOUD_FALLBACK masih 60', isi(/const TREND_CLOUD_FALLBACK = (\d+);/) === '60');
ok('MAX_PX jalur lama masih 640', isi(/const MAX_PX = (\d+);/) === '640');
ok('NDVI_RULE masih "NDVI Raw"', isi(/const NDVI_RULE = \{ rasterFunction: '([^']+)' \}/) === 'NDVI Raw',
  isi(/const NDVI_RULE = \{ rasterFunction: '([^']+)' \}/));
ok('EXPORT_IMAGE_URL masih ArcGIS Sentinel2',
  /sentinel\.arcgis\.com\/arcgis\/rest\/services\/Sentinel2\/ImageServer\/exportImage/.test(SRC));
ok('PC_COLLECTION masih sentinel-2-l2a', isi(/const PC_COLLECTION = '([^']+)'/) === 'sentinel-2-l2a',
  isi(/const PC_COLLECTION = '([^']+)'/));

console.log('\n4. Jalur lama tidak direwrite oleh mode baru');
// analyzeItem harus tetap memanggil runNdvi/runSpectral/runTerrain apa adanya
const analyzeBody = SRC.match(/async function analyzeItem\(item\) \{[\s\S]*?\n  \}/);
ok('fungsi analyzeItem masih ada', !!analyzeBody);
ok('analyzeItem tetap memanggil runNdvi', analyzeBody && /runNdvi\(item/.test(analyzeBody[0]));
ok('analyzeItem tetap memanggil runSpectral', analyzeBody && /runSpectral\(item/.test(analyzeBody[0]));
ok('analyzeItem tetap memanggil runTerrain', analyzeBody && /runTerrain\(item/.test(analyzeBody[0]));

// runNdvi tidak boleh menyentuh jalur COG baru
const ndviBody = SRC.match(/async function runNdvi\(item, onStatus\) \{[\s\S]*?\n  \}/);
ok('runNdvi tidak memakai readCogBandsAligned (jalur lama terpisah)',
  ndviBody && !/readCogBandsAligned/.test(ndviBody[0]));
ok('runNdvi tetap memakai requestIndexGeoTiff',
  ndviBody && /requestIndexGeoTiff/.test(ndviBody[0]));

// readCogWindowMasked harus tetap tanpa parameter baru
const masked = SRC.match(/async function readCogWindowMasked\(href, bounds, rings\) \{/);
ok('readCogWindowMasked tanda tangannya tidak berubah', !!masked);
ok('readCogWindowMasked tetap memakai cap default (tanpa maxPx eksplisit)',
  masked && /cogWindow\(projectBounds\(bounds\), image\)/.test(SRC));

console.log('\n5. Fungsi mode baru ada dan tidak bocor ke jalur lama');
['stacListScenes', 'runIndexOnScene', 'readCogBandsAligned', 'robustStatsInMask', 'cogWindow']
  .forEach(function (fn) {
    ok('fungsi ' + fn + ' ada', new RegExp('function ' + fn + '\\(').test(SRC));
  });

/* 6. REGRESI SCOPE. Delapan fungsi mode mandiri pernah tersesat DI DALAM
   cardHtml. Akibatnya modePickerHtml tetap jalan (dipanggil dari cardHtml),
   tapi setItemMode / runSceneList / pickScene / runManual tidak terlihat
   oleh onPanelClick yang di scope modul -> ReferenceError saat diklik, tanpa
   jejak di mana pun. Ini yang membuat tombol "Mandiri" tampak ada tapi mati.
   Diperiksa dengan menghitung kedalaman kurung kurawal tiap deklarasi. */
console.log('\n6. Regression: fungsi aksi wajib di scope modul, bukan di cardHtml');
const garis = SRC.split('\n');
const wajib = ['modePickerHtml', 'sceneListHtml', 'manualResultHtml', 'manualBlockHtml',
  'setItemMode', 'runSceneList', 'pickScene', 'runManual', 'onPanelChange',
  'itemFromEl', 'syncManualButton', 'sclClearMask', 'gabungMask', 'robustStatsInMask',
  'runIndexOnScene', 'stacListScenes', 'readCogBandsAligned'];
const kedalaman = {};
let depth = 0;
for (let i = 0; i < garis.length; i++) {
  const l = garis[i];
  for (const fn of wajib) {
    if (new RegExp('^\\s*(async\\s+)?function ' + fn + '\\(').test(l) && !(fn in kedalaman)) {
      kedalaman[fn] = { baris: i + 1, depth: depth };
    }
  }
  // Buang string supaya kurung kurawal di dalam teks tidak dihitung
  const bersih = l.replace(/'(\\.|[^'\\])*'/g, "''").replace(/"(\\.|[^"\\])*"/g, '""');
  depth += (bersih.match(/\{/g) || []).length;
  depth -= (bersih.match(/\}/g) || []).length;
}
ok('kurung kurawal file seimbang (depth akhir 0)', depth === 0, 'depth=' + depth);

// Ikon mode ditulis sebagai const terpisah supaya warna ikut currentColor
// (berubah saat kartu aktif). Kalau digabung ke dalam modePickerHtml sebagai
// string biasa, ikon akan ikut ter-escape dan tidak tampil.
ok('ikon dideklarasikan sebagai const terpisah', /const ICON_AUTO\s*=/.test(SRC) && /const ICON_MANUAL\s*=/.test(SRC));
ok('ikon memakai fill="currentColor" (ikut warna keadaan aktif)',
    /fill="currentColor"/.test(SRC));
ok('ikon mode punya aria-hidden', (SRC.match(/aria-hidden="true"/g) || []).length >= 2,
    (SRC.match(/aria-hidden="true"/g) || []).length);
ok('kartu mode punya role=group', /role="group" aria-label="Mode analisis"/.test(SRC));
ok('kelas mode lama sudah tidak dipakai',
    !/pa-mode-btn|pa-mode-group|pa-mode-hint/.test(SRC));
wajib.forEach(function (fn) {
  const k = kedalaman[fn];
  ok(fn + ' ada di scope modul', !!k && k.depth === 1,
    k ? 'baris ' + k.baris + ' depth ' + k.depth : 'tidak ditemukan');
});

ok('cogWindow menerima maxPx opsional', /function cogWindow\(bounds, image, maxPx\)/.test(SRC));
ok('cap default cogWindow tetap TREND_SAMPLE_PX',
  /const cap = Number\.isFinite\(maxPx\)[\s\S]{0,80}TREND_SAMPLE_PX/.test(SRC));
ok('readCogBandsAligned melempar error saat panjang band tak seragam',
  /tidak bisa disamakan/.test(SRC));
ok('median dihitung dari mask gabungan (polygon + SCL bila aktif)',
  /robustStatsInMask\(values, mask, spec\.range\)/.test(SRC));
ok('mask digabung dengan SCL sebelum dipakai', /gabungMask\(read\.mask, clear\)/.test(SRC));
ok('SCL dibaca lebih dulu agar jadi grid acuan 20 m',
  /hrefs\.unshift\(await signCogUrl\(assetScl\.href\)\)/.test(SRC));
ok('band SCL tidak ikut jadi input rumus index',
  /applyIndexFormula\(useScl \? read\.rasters\.slice\(1\) : read\.rasters, spec\)/.test(SRC));
ok('resolusi 20 m dinyatakan di hasil', /\(SCL 20 m\)/.test(SRC));
ok('toggle SCL benar-benar dibaca, bukan dekoratif',
  /if \(item\.sclMask\) \{/.test(SRC) && /scene\.assets\.SCL/.test(SRC));

console.log('\n' + (fail === 0 ? 'SEMUA LULUS' : 'ADA YANG GAGAL') + ': ' + pass + ' lulus, ' + fail + ' gagal');
process.exit(fail === 0 ? 0 : 1);
