/* Uji UI dua mode: modePickerHtml, manualBlockHtml, sceneListHtml,
   cloudBadgeHtml, dan indexBlockHtml. Fokus pada dua hal:
   1. HTML well-formed (div seimbang) di kedua cabang mode
   2. cabang Otomatis benar-benar tidak berubah perilakunya */
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
/* Ekstraksi fungsi berbasis pencocokan kurung kurawal, BUKAN regex.
   Regex seperti /function f\([\s\S]*?\n  \}/ Vulnerability: begitu ada
   blok if di dalam fungsi, baris penutup blok itu juga berada di kolom yang
   sama dan fungsinya terpotong di tengah. dulu hal ini terjadi setelah
   blok dipindahkan ke scope modul dan indentasinya berubah. */
function potong(nama) {
  const m = SRC.match(new RegExp('^\\s*(?:async\\s+)?function ' + nama + '\\(', 'm'));
  if (!m) { console.error('tidak ditemukan: ' + nama); process.exit(1); }
  const mulai = SRC.indexOf('{', m.index);
  let depth = 0;
  let i = mulai;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) { console.error('kurung kurawal tidak seimbang di ' + nama); process.exit(1); }
  return SRC.slice(m.index, i + 1);
}
function tag(html) {
  return { buka: (html.match(/<div\b/g) || []).length, tutup: (html.match(/<\/div>/g) || []).length };
}
function cekSeimbang(html) { const t = tag(html); return t.buka === t.tutup; }

const stub = `
function escapeHtml(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
var ICON_AUTO = '<svg class="pa-mode-ico"></svg>';
var ICON_MANUAL = '<svg class="pa-mode-ico"></svg>';
// Ikon section air juga dibutuhkan airSectionHtml() yang ikut diuji di sini.
var ICON_CALC = '<svg class="pa-air-calc-ico"></svg>';
var ICON_SPIN = '<svg class="pa-air-calc-ico is-spin"></svg>';
var ICON_CHEVRON = '<svg class="pa-air-caret"></svg>';
function fmt(v,d){return Number.isFinite(v)?v.toLocaleString('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d}):'-';}
function isSectionCollapsed(item,s){return !!(item.collapsed && item.collapsed[s]);}
function sectionHeadHtml(item, section, title){
  const open = !isSectionCollapsed(item, section);
  return '<div class="pa-section-head"><span class="pa-section-title">' + escapeHtml(title) + '</span>'
    + '<span class="pa-section-tools">'
    + '<button class="pa-collapse-btn" type="button" data-pa-action="toggle-section"'
    + ' data-pa-id="' + item.id + '" data-pa-section="' + section + '"'
    + ' aria-expanded="' + (open ? 'true' : 'false') + '">&#9662;</button>'
    + '</span></div>';
}
const TREND_CLOUD_HIGH = 25;
const PICK_ORDER = ['ndvi','ndmi','ndre','ndwi','evi','msavi','nbr','ndvi705'];
const COMPUTE_SPECS = {};
PICK_ORDER.forEach(function(k){COMPUTE_SPECS[k]={key:k,label:k.toUpperCase(),formula:'F = 1',table:[{label:'a',min:0,max:1,rgb:[1,2,3]}]};});
const PICKABLE_KEYS = PICK_ORDER.slice();
var window = {};
`;

const ctx = { Math, Number, String, Array, JSON, console, Boolean, isNaN, parseInt, Object };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(
  stub
  + '\n' + potong('airTanamanOptions')
  + '\n' + potong('airBlockHtml')
  + '\n' + potong('airSectionHtml')
  + '\n' + potong('modePickerHtml')
  + '\n' + potong('sceneListHtml')
  + '\n' + potong('manualResultHtml')
  + '\n' + potong('manualBlockHtml')
  + '\n' + potong('cloudQuality')
  + '\n' + potong('cloudBadgeHtml')
  + '\nthis.modePickerHtml=modePickerHtml;this.sceneListHtml=sceneListHtml;'
  + 'this.manualBlockHtml=manualBlockHtml;this.manualResultHtml=manualResultHtml;'
  + 'this.cloudBadgeHtml=cloudBadgeHtml;this.cloudQuality=cloudQuality;'
  + 'this.airSectionHtml=airSectionHtml;', ctx);

const dasar = {
  id: 7, index: 1, areaHa: 2.5, mode: 'auto', picked: ['ndvi', 'ndmi', 'ndwi'],
  scene: null, sceneList: null, sceneListError: null, sceneListBusy: false,
  sceneCloudLimit: 20, sceneMonths: 6, pixelCap: 640, sclMask: false,
  runBusy: false, manualError: null, manualResult: null, analyzed: false
};

console.log('\n1. Pemilih mode: dua cabang');
let auto = ctx.modePickerHtml(Object.assign({}, dasar));
let mand = ctx.modePickerHtml(Object.assign({}, dasar, { mode: 'mandiri' }));
ok('div seimbang di mode Otomatis', cekSeimbang(auto));
ok('div seimbang di mode Mandiri', cekSeimbang(mand));
const optAuto = /class="pa-mode-opt is-on"[^>]*data-pa-value="auto"/.test(auto)
    || /data-pa-value="auto"[^>]*class="pa-mode-opt is-on"/.test(auto);
const optMandOn = /class="pa-mode-opt is-on"[^>]*data-pa-value="mandiri"/.test(mand)
    || /data-pa-value="mandiri"[^>]*class="pa-mode-opt is-on"/.test(mand);
// Warna aktif diakhiri tanda kutip, sedangkan non-aktif diikuti kutip+spasi
// (karena 'is-on' menyusul). Keduanya harus dihitung, itu sebabnya dua pola.
const hitungKartu = h => (h.match(/class="pa-mode-opt(?: is-on)?"/g) || []).length;
ok('dua kartu opsi ada', hitungKartu(auto) === 2, hitungKartu(auto) + ' kartu');
ok('dua kartu juga di mode mandiri', hitungKartu(mand) === 2, hitungKartu(mand) + ' kartu');
ok('kartu auto diberi is-on saat mode auto', optAuto, 'cari di: ' + auto.slice(0, 200));
ok('kartu mandiri diberi is-on saat mode mandiri', optMandOn);
ok('kartu non-aktif tidak punya is-on',
    (auto.match(/pa-mode-opt is-on/g) || []).length === 1,
    (auto.match(/pa-mode-opt is-on/g) || []).length);
ok('aria-pressed true hanya untuk mode aktif',
    (auto.match(/aria-pressed="true"/g) || []).length === 1,
    (auto.match(/aria-pressed="true"/g) || []).length);
ok('aria-pressed false untuk mode non-aktif',
    (auto.match(/aria-pressed="false"/g) || []).length === 1,
    (auto.match(/aria-pressed="false"/g) || []).length);
ok('Mandiri aktif saat mode mandiri', (mand.match(/aria-pressed="true"/g) || []).length === 1);
ok('kedua kartu punya data-pa-id', (auto.match(/data-pa-id="7"/g) || []).length === 2);
ok('aksi memakai data-pa-action (bukan atribut terpisah)',
    /data-pa-action="set-mode"/.test(auto) && /data-pa-value="auto"/.test(auto));
ok('setiap kartu punya ikon', (auto.match(/pa-mode-ico/g) || []).length === 2,
    (auto.match(/pa-mode-ico/g) || []).length);
ok('setiap kartu punya judul dan deskripsi',
    (auto.match(/pa-mode-title/g) || []).length === 2 &&
    (auto.match(/pa-mode-desc/g) || []).length === 2);
ok('micro-label kapital ada', /pa-mode-label/.test(auto) && /MODE ANALISIS|Mode analisis/.test(auto));
ok('grup punya role=group untuk aksesibilitas', /role="group"/.test(auto));
ok('deskripsi Otomatis menyebut citra terbaru', /Citra terbaru, NDVI \+ 3 index/.test(auto));
ok('deskripsi Mandiri menyebut pilihan pengguna', /Pilih citra, awan, dan index sendiri/.test(auto));
ok('catatan Otomatis mengakui badge awan hanya estimasi',
    /estimasi katalog/.test(auto));
// Teksnya persis seperti ini di UI; spasi ganda hanya muncul kalau catatan
// dirangkai dari string terpisah.
ok('catatan Mandiri menjanjikan tanggal ikut ditampilkan',
    /Tanggal ikut ditampilkan di setiap hasil/.test(mand), mand.slice(-220));
ok('catatan Mandiri menjelaskan asal badge awan',
    /badge\s+awan\s+berasal\s+dari\s+citra\s+yang\s+sama/.test(mand));
ok('kelas lama sudah tidak dipakai', !/pa-mode-btn|pa-mode-group|pa-mode-hint/.test(auto));

/* 2. CUMA SATU tombol analisis per mode.
   Ini keluhan nyata dari pengguna: di mode Mandiri, kartu pernah menampilkan
   tombol "Analisis" milik jalur OTOMATIS sekaligus tombol "Hitung index
   terpilih" milik wizard. Dua tombol analisis berdampingan membuat pengguna
   tidak tahu mana yang dipakai, dan yang salah menjalankan jalur otomatis
   tanpa sengaja. Blok analyzeBlock kini disembunyikan di mode mandiri. */
console.log('\n2. Cuma satu tombol analisis per mode');
const src = fs.readFileSync(
  path.join(__dirname, 'assets', 'js', 'polygon-analysis.js'), 'utf8');
ok('analyzeBlock disembunyikan saat mode mandiri',
  /const analyzeBlock = \(item\.analyzed \|\| item\.mode === 'mandiri'\) \? ''/.test(src),
  (/const analyzeBlock = [^;]*/.exec(src) || [])[0]);

console.log('\n2b. Section kebutuhan air terpisah dari rantai citra');
const air = ctx.airSectionHtml(Object.assign({}, dasar, { collapsed: { air: true } }));
const airBuka = ctx.airSectionHtml(Object.assign({}, dasar, { collapsed: { air: false } }));
ok('section air punya kelas pemisah pa-section-air', /pa-section-air/.test(air));
ok('terbuka juga memakai kelas pemisah', /pa-section-air/.test(airBuka));
ok('tertutup punya is-collapsed', /pa-section-air is-collapsed/.test(air));
ok('terbuka tidak punya is-collapsed', /is-collapsed/.test(airBuka) === false);
ok('memuat catatan bahwa terpisah dari citra',
  /Terpisah dari analisis citra/.test(airBuka));
ok('catatan menyebut tidak memakai citra satelit',
  /tidak memakai citra satelit/.test(airBuka));
ok('memakai sectionHeadHtml sehingga punya tombol ciut sendiri',
  /data-pa-section="air"|sectionHeadHtml/.test(src));
ok('air default tertutup di state polygon',
  /collapsed:\s*\{[^}]*\bair:\s*true/.test(src),
  (/collapsed: \{[^}]*air: \w+/.exec(src) || [])[0]);
// Section air sengaja TIDAK punya aturan .pa-section-air { ... } sendiri:
// harus ikut template .pa-section yang sama dengan section lain. Yang boleh
// ada hanyalah selektor turunan, bukan kotak/garis aksen sendiri.
const appCssUi = fs.readFileSync(path.join(__dirname, 'assets', 'css', 'app.css'), 'utf8');
ok('section air tidak punya aturan kotak sendiri (ikut template .pa-section)',
  !/\.pa-section-air\s*\{/.test(appCssUi));
ok('section air tidak punya garis aksen di kiri',
  !/\.pa-section-air\s*\{[^}]*border-left/.test(appCssUi));
ok('section air tidak punya ::before di judul',
  !/\.pa-section-air[^{]*\.pa-section-title::before/.test(appCssUi));
ok('section air tidak punya latar sendiri',
  !/\.pa-section-air\s*\{[^}]*background/.test(appCssUi));
ok('section air tidak memakai colorbar NDVI',
  !/ndviColorbarHtml/.test(air) && !/ndviColorbarHtml/.test(airBuka));

console.log('\n3. Wizard hanya muncul di mode Mandiri');
const wAuto = ctx.manualBlockHtml(Object.assign({}, dasar));
const wMand = ctx.manualBlockHtml(Object.assign({}, dasar, { mode: 'mandiri' }));
ok('wizard kosong di mode Otomatis', wAuto === '', JSON.stringify(wAuto.slice(0, 60)));
ok('wizard muncul di mode Mandiri', wMand.length > 100);
ok('wizard div seimbang', cekSeimbang(wMand), JSON.stringify(tag(wMand)));
ok('ada 3 langkah bernomor', /1\. Pilih citra/.test(wMand) && /2\. Pilih index/.test(wMand) && /3\. Jalankan/.test(wMand));
ok('ada tombol Cari citra', /data-pa-action="scenes"/.test(wMand));
ok('ada tombol Hitung index terpilih', /data-pa-action="run-manual"/.test(wMand));
ok('ada ambang awan', /data-pa-cloud-limit/.test(wMand));
ok('ada periode bulan', /data-pa-months/.test(wMand));
ok('ada jendela piksel', /data-pa-pixel-cap/.test(wMand));
ok('ada toggle SCL', /data-pa-scl/.test(wMand));
ok('toggle SCL menjelaskan konsekuensi 20 m', /20 m/.test(wMand));

console.log('\n4. Checklist index: default dicentang sesuai permintaan');
const cekIdx = (wMand.match(/data-pa-index="[a-z0-9]+"/g) || []);
ok('8 index ditawarkan', cekIdx.length === 8, cekIdx.length + ' index');
const tercentang = (wMand.match(/data-pa-index="[a-z0-9]+" data-pa-id="7" checked/g) || []).map(s => /data-pa-index="([a-z0-9]+)"/.exec(s)[1]);
ok('NDVI, NDMI, NDWI tercentang', tercentang.length === 3, 'tercentang: ' + tercentang.join(','));
ok('NDRE tidak tercentang', tercentang.indexOf('ndre') === -1);
ok('EVI tidak tercentang', tercentang.indexOf('evi') === -1);
ok('urutan checkbox sesuai PICK_ORDER',
  cekIdx.map(s => /data-pa-index="([a-z0-9]+)"/.exec(s)[1]).join(',') ===
  'ndvi,ndmi,ndre,ndwi,evi,msavi,nbr,ndvi705', cekIdx.join(','));

console.log('\n5. Tombol jalankan nonaktif tanpa citra');
ok('tombol disabled saat scene null', /data-pa-action="run-manual" data-pa-id="7" disabled/.test(wMand));
const wAdaScene = ctx.manualBlockHtml(Object.assign({}, dasar, {
  mode: 'mandiri', scene: { date: '2026-06-19', cloud: 0, platform: 'Sentinel-2C' }
}));
ok('tombol aktif setelah citra dipilih',
  !/data-pa-action="run-manual" data-pa-id="7" disabled/.test(wAdaScene));
ok('citra terpilih tampil', /2026-06-19/.test(wAdaScene));
ok('awan citra terpilih tampil', /awan 0,0%/.test(wAdaScene), 'periksa format angka');

console.log('\n6. Daftar citra');
const scenes = [
  { date: '2026-06-19', cloud: 0, platform: 'Sentinel-2C' },
  { date: '2026-05-12', cloud: 45.6, platform: 'Sentinel-2B' }
];
const sl = ctx.sceneListHtml(Object.assign({}, dasar, { sceneList: scenes, scene: scenes[0] }));
ok('div seimbang', cekSeimbang(sl), JSON.stringify(tag(sl)));
ok('dua baris citra', (sl.match(/data-pa-action="pick-scene"/g) || []).length === 2);
ok('tanggal tampil', /2026-06-19/.test(sl) && /2026-05-12/.test(sl));
ok('awan tinggi ditandai', (sl.match(/is-high/g) || []).length === 1);
ok('citra terpilih diberi is-active', (sl.match(/pa-scene is-active/g) || []).length === 1);
ok('data-pa-date membawa tanggal', /data-pa-date="2026-06-19"/.test(sl));
ok('daftar kosong -> string kosong', ctx.sceneListHtml(Object.assign({}, dasar, { sceneList: [] })) === '');
ok('sibuk -> spinner', /pa-spin/.test(ctx.sceneListHtml(Object.assign({}, dasar, { sceneListBusy: true }))));
ok('error -> pesan error', /tidak bisa dihubungi/.test(
  ctx.sceneListHtml(Object.assign({}, dasar, { sceneListError: 'Katalog tidak bisa dihubungi' }))));

console.log('\n7. Badge awan: kejujuran per mode');
const badgeAuto = ctx.cloudBadgeHtml(Object.assign({}, dasar, {
  mode: 'auto', cloud: { cloudPercent: 12.3, quality: { short: 'Cukup', color: '#b26a00' } }
}));
ok('mode Otomatis: pakai angka katalog', /12,3%/.test(badgeAuto));
ok('mode Otomatis: ada catatan kehati-hatian',
  /estimasi katalog, bukan citra yang dipakai/.test(badgeAuto));
ok('mode Otomatis: tidak menampilkan tanggal citra', badgeAuto.indexOf('citra 20') === -1);
ok('mode Otomatis: div seimbang', cekSeimbang(badgeAuto));

const badgeMand = ctx.cloudBadgeHtml(Object.assign({}, dasar, {
  mode: 'mandiri', scene: { date: '2026-06-19', cloud: 0 },
  cloud: { cloudPercent: 88.8, quality: { short: 'Terbatas', color: '#c62828' } }
}));
ok('mode Mandiri: angka dari citra terpilih, bukan katalog', /0,0%/.test(badgeMand));
ok('mode Mandiri: TIDAK memakai angka katalog 88,8%', badgeMand.indexOf('88,8') === -1);
ok('mode Mandiri: menampilkan tanggal citra', /citra 2026-06-19/.test(badgeMand));
ok('mode Mandiri: TIDAK ada catatan estimasi', badgeMand.indexOf('estimasi katalog') === -1);
ok('kelas warna ikut mengikuti sumber angka',
  badgeMand.indexOf('#2e7d32') !== -1, 'awan 0% harus hijau');

console.log('\n8. Ambang kelas awan sama dengan ndvi-analysis.js');
ok('NaN -> Tidak tersedia abu', ctx.cloudQuality(NaN).short === 'Tidak tersedia');
ok('0% -> Baik', ctx.cloudQuality(0).short === 'Baik');
ok('10% -> Baik (batas)', ctx.cloudQuality(10).short === 'Baik');
ok('10,1% -> Cukup', ctx.cloudQuality(10.1).short === 'Cukup');
ok('30% -> Cukup (batas)', ctx.cloudQuality(30).short === 'Cukup');
ok('30,1% -> Terbatas', ctx.cloudQuality(30.1).short === 'Terbatas');
ok('awan tidak tersedia tidak error', ctx.cloudQuality(undefined).short === 'Tidak tersedia');

console.log('\n' + (fail === 0 ? 'SEMUA LULUS' : 'ADA YANG GAGAL') + ': ' + pass + ' lulus, ' + fail + ' gagal');
process.exit(fail === 0 ? 0 : 1);
