/* Uji pemisahan sheet GeoData dari sheet GeoTools.
 *
 * GeoData punya sheet sendiri (openGeoDataSheet) dan tidak lagi menjadi
 * salah satu tab di .geotools-dropdown.
 *
 * Dua masalah yang menjadi prasyarat ini diselesaikan, dan keduanya dijaga di sini:
 *
 *  1. "Dropdown hilang, tidak bisa melihat card lainnya." GeoData semula
 *     disembunyikan BERSAMA dropdown-nya, supaya tidak terlihat "GeoFarm"
 *     tertulis di atas isi GeoData. Tapi menyembunyikan dropdown ikut
 *     menghapus satu-satunya cara pindah tab - user benar-benar terjebak.
 *     Sekarang tidak adastatus "sedang disembunyikan" sama sekali:
 *     dropdown GeoTools selalu tampil, karena GeoData tidak lagi ikut
 *     di dalamnya.
 *
 *  2. openGeotoolsMainTab() melepas .active dari SEMUA
 *     .geotools-main-tab-panel. Selama GeoData memakai kelas itu,
 *     memilih tab lain akan membuat GeoData ikut lenyap. Karena itu panelnya
 *     sekarang memakai .geodata-panel dan berada di #geodata-panel-host,
 *     di luar #tab-geotools.
 *
 * Yang SENGAJA tidak dilakukan: dropdown tidak dipindahkan ke header sheet.
 * Ada 8 pemicu di sidebar (tombol nav GEOMET & GEOPULSE plus 6 tombol
 * redirect) yang melakukan querySelector('.geotools-dropdown') dan dispatch
 * 'change' TANPA pernah membuka sheet. Kalau dropdown pindah ke header,
 * saat sheet tertutup seluruh header ikut tersembunyi dan dropdown jadi tak
 * terjangkau - kedelapan pemicu itu ikut mati. Itu perubahan perilaku yang
 * jauh lebih besar daripada sekadar "pindah posisi", jadi dibiarkan.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CORE = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'map-core.js'), 'utf8');
const SIDEBAR = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'sidebar.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'app.css'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function ok(nama, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + nama); }
  else { fail++; console.log('  FAIL ' + nama + (extra !== undefined ? '  -> ' + extra : '')); }
}
function equal(a, b, nama, extra) {
  ok(nama, a === b, extra !== undefined ? extra : ('dapat ' + JSON.stringify(a) + ', harap ' + JSON.stringify(b)));
}
function hitung(t, p) { return (t.match(p) || []).length; }
function tanpaKomentar(t) {
  return t.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
}
const CORE_K = tanpaKomentar(CORE);
const SIDEBAR_K = tanpaKomentar(SIDEBAR);
const HTML_K = tanpaKomentar(HTML);
const CSS_K = tanpaKomentar(CSS);

function potong(html, dari, tag) {
  const re = new RegExp('<' + tag + '\\b|</' + tag + '>', 'g');
  re.lastIndex = dari;
  let d = 0, m;
  while ((m = re.exec(html))) {
    if (m[0].charAt(1) === '/') { d--; if (d === 0) return html.slice(dari, re.lastIndex); }
    else d++;
  }
  return null;
}

/* ── 1. Sheet GeoData ada di markup ─────────────────────────────────── */
console.log('\n1. Sheet GeoData di markup');
ok('#geodata-sheet ada', /<div id="geodata-sheet">/.test(HTML));
equal(hitung(HTML, /id="geodata-sheet"/g), 1, 'id geodata-sheet unik');
equal(hitung(HTML, /id="geodataSheetBody"/g), 1, 'id geodataSheetBody unik');
ok('punya handle, head, dan body seperti sheet lain',
  /<div class="geodata-sheet-handle"><\/div>/.test(HTML) &&
  /<div class="geodata-sheet-head">/.test(HTML) &&
  /<div class="geodata-sheet-body" id="geodataSheetBody">/.test(HTML));
ok('head-nya punya judul GeoData + tombol minimalkan + tombol tutup',
  /<span class="geodata-sheet-title"[^>]*>[\s\S]{0,400}?GeoData/.test(HTML) &&
  /onclick="minimizeGeoDataSheet\(\)"/.test(HTML) &&
  /onclick="closeGeoDataSheet\(\)"/.test(HTML));
ok('klik judul sheet minimal akan memulihkan (pola sheet GeoTools)',
  /restoreGeoDataSheet\(\)/.test(HTML));
ok('body-nya kosong di markup (isi datang dari onOpen)',
  /<div class="geodata-sheet-body" id="geodataSheetBody"><\/div>/.test(HTML));

/* ── 1b. Host tidak boleh menampilkan GeoData Analysis di tempatnya ──────
 *
 * #geodata-panel-host dibuat sebagai <div> telanjang tanpa kelas, jadi tanpa
 * aturan CSS apa pun ia merender seluruh panel "GeoData Analysis" - judul,
 * enam tab Alat, form ArcGIS REST - tepat di bawah isi tab GeoTools di
 * sidebar. Itu kebocoran yang nyata: panel yang sama terlihat dua kali.
 * Host hanya tempat parkir; onOpen sheet GeoData yang mengosongkannya. */
console.log('\n1b. Host GeoData tidak boleh bocor ke tempatnya');
/* Markup host diambil ulang di sini, bukan memakai variabel `host` yang
 * baru didefinisikan di bagian 2 - bagian ini jalan lebih dulu. */
var hostMarkup = potong(HTML, HTML.indexOf('<div id="geodata-panel-host"'), 'div');
ok('#geodata-panel-host ada', hostMarkup.length > 0);
ok('host tetap <div> tanpa kelas (bukan penyembunyi alami)',
  /<div id="geodata-panel-host">/.test(HTML));
ok('CSS menyembunyikan host sepenuhnya',
  /#geodata-panel-host\s*\{\s*display:\s*none/.test(CSS_K));
ok('host disembunyikan dengan display:none, bukan visibility (agar tidak menambah tinggi)',
  !/#geodata-panel-host\s*\{[^}]*visibility/.test(CSS_K));
ok('isi host tetap utuh (6 tombol Alat + panel)',
  (hostMarkup.match(/data-subtab="alat-tab-/g) || []).length === 6 &&
  /id="geotoolsTabMuatData"/.test(hostMarkup));
/* Penjaga tambahan di onOpen sheet GeoTools: walau host nanti dipindah ke
 * dalam #tab-geotools, GeoData tetap tidak boleh ikut masuk ke sana. */
ok('onOpen sheet GeoTools melewatkan host GeoData secara eksplisit',
  /if \(n\.nodeType === 1 && n\.id === 'geodata-panel-host'\) return;/.test(CORE_K));
ok('onOpen GeoTools memakai childNodes yang disalin dulu (aman menghapus sambil iterating)',
  /Array\.prototype\.slice\.call\(tabContent\.childNodes\)/.test(CORE_K));

/* ── 2. Panel GeoData pindah ke host sendiri ────────────────────────── */
console.log('\n2. Panel GeoData di host sendiri');
ok('#geodata-panel-host ada', /<div id="geodata-panel-host">/.test(HTML));
equal(hitung(HTML, /id="geodata-panel-host"/g), 1, 'id host unik');
ok('panel #geotoolsTabMuatData masih ada', /<div id="geotoolsTabMuatData"/.test(HTML));
equal(hitung(HTML, /id="geotoolsTabMuatData"/g), 1, 'id panel unik');
ok('panelnya sudah memakai .geodata-panel',
  /<div id="geotoolsTabMuatData" class="geodata-panel">/.test(HTML));
ok('panelnya TIDAK lagi memakai .geotools-main-tab-panel',
  !/<div id="geotoolsTabMuatData" class="[^"]*geotools-main-tab-panel/.test(HTML));

/* Posisi: host di luar #tab-geotools. Diperiksa pada markup TANPA komentar
 * karena komentar dropdown menyebut "#geotoolsTabMuatData" dan berada di
 * dalam #tab-geotools - pencarian teks biasa akan selalu positif. */
const tab = potong(HTML_K, HTML_K.indexOf('<div id="tab-geotools"'), 'div');
ok('#tab-geotools ditemukan', !!tab);
ok('panel GeoData TIDAK lagi anak #tab-geotools', tab.indexOf('geotoolsTabMuatData') === -1);
ok('host TIDAK ada di dalam #tab-geotools', tab.indexOf('geodata-panel-host') === -1);
const host = potong(HTML_K, HTML_K.indexOf('<div id="geodata-panel-host"'), 'div');
ok('host memuat panel GeoData', host.indexOf('id="geotoolsTabMuatData"') !== -1);
ok('tag di dalam host seimbang',
  hitung(host, /<div\b/g) === hitung(host, /<\/div>/g),
  hitung(host, /<div\b/g) + '/' + hitung(host, /<\/div>/g));

/* ── 3. Sisa isi GeoTools utuh ──────────────────────────────────────── */
console.log('\n3. Isi GeoTools tidak ikut berubah');
equal(hitung(tab, /<option value="geotoolsTab/g), 9, 'dropdown menyisakan sembilan opsi');
ok('option GeoData tidak ada lagi', !/<option value="geotoolsTabMuatData"/.test(HTML));
equal(hitung(tab, /class="geotools-main-tab-panel/g), 9, 'sembilan panel GeoTools tersisa');
[
  ['geotoolsTabGeoportal', 'GeoPortal'], ['geotoolsTabGeoOss', 'GeoOSS'],
  ['geotoolsTabGeoFarm', 'GeoFarm'], ['geotoolsTabGeoTani', 'GeoTani'],
  ['geotoolsTabGeoPangan', 'GeoPangan'], ['geotoolsTabDemnas', 'GeoRaster'],
  ['geotoolsTabGeoPulse', 'GeoPulse'], ['geotoolsTabGeonusa', 'GeoNusa'],
  ['geotoolsTabGeoWatch', 'GeoWatch']
].forEach(function (p) {
  /* Attrusi opsional diizinkan: GeoFarm punya " selected", jadi pola harus
   * membiarkan apa pun di antara value="..." dan teksnya. */
  ok('tab ' + p[1] + ' masih ada sebagai opsi',
    new RegExp('<option value="' + p[0] + '"[^>]*>' + p[1] + '</option>').test(tab));
  ok('panel ' + p[0] + ' masih ada', tab.indexOf('id="' + p[0] + '"') !== -1);
});
/* Enam subtab Alat harus utuh - GeoData tidak boleh ikut berubah. */
const subtab = [...host.matchAll(/data-subtab="(alat-tab-[a-z0-9-]+)"/g)].map(function (x) { return x[1]; });
equal(subtab.length, 6, 'enam tombol Alat masih ada');
equal(new Set(subtab).size, 6, 'keenam id tombol Alat unik');
equal([...host.matchAll(/<div id="(alat-tab-[a-z0-9-]+)"/g)].length, 6, 'enam panel Alat masih ada');
ok('ArcGIS REST tetap jadi subtab aktif default',
  /<button class="geoid-subtab-btn active" data-subtab="alat-tab-arcgis-rest"/.test(host) &&
  /<div id="alat-tab-arcgis-rest" class="geoid-subtab-panel active">/.test(host));
/* Lima dropzone, bukan enam: subtab keenam (ArcGIS REST) memakai input URL,
 * bukan area unggah berkas.
 *
 * Yang dihitung adalah tag <label>-nya, bukan prefiks "geotools-dropzone"
 * saja. Tiap dropzone punya anak .geotools-dropzone-content, -icon, -accept,
 * dan -filename, jadi pola prefiks yang longgar menghitung 35 - bukan 5. */
equal(hitung(host, /<label class="geotools-dropzone/g), 5,
  'lima dropzone unggah berkas (ArcGIS REST pakai input URL)');

/* ── 4. Registrasi sheet & fungsinya ───────────────────────────────── */
console.log('\n4. Registrasi SheetDrag & fungsi terpisah');
equal(hitung(CORE_K, /SheetDrag\.register\('geodata'/g), 1, 'sheet geodata terdaftar tepat sekali');
equal(hitung(CORE_K, /SheetDrag\.register\('geotools'/g), 1, 'sheet geotools tetap terdaftar');
ok('openClass & minClass milik GeoData sendiri',
  /openClass: 'geodata-sheet-open',\s*minClass: 'geodata-sheet-minimized'/.test(CORE_K));
ok('bodyOpen & bodyMin milik GeoData sendiri (bukan milik GeoTools)',
  /bodyOpen: 'geodata-sheet-open',\s*bodyMin: 'geodata-sheet-minimized'/.test(CORE_K));
ok('TIDAK memakai kelas sheet GeoTools',
  !/gs-sheet-|geotools-sheet-(open|minimized)/.test(
    CORE_K.slice(CORE_K.indexOf("register('geodata'"), CORE_K.indexOf('/* ── Export TIF FAB'))));
ok('handle/header/minButton memakai kelas GeoData sendiri',
  /handle: '\.geodata-sheet-handle',\s*header: '\.geodata-sheet-head',\s*minButton: '\.geodata-sheet-minimize'/.test(CORE_K));
ok('kelas di markup cocok dengan yang didaftarkan',
  /class="geodata-sheet-handle"/.test(HTML) &&
  /class="geodata-sheet-head"/.test(HTML) &&
  /class="geodata-sheet-minimize"/.test(HTML));
ok('markup sheet GeoData tidak lagi memakai kelas gs-sheet-*',
  potong(HTML, HTML.indexOf('<div id="geodata-sheet"'), 'div').indexOf('gs-sheet-') === -1);
ok('onOpen memindahkan isi host ke body',
  /function \(\) \{\s*var body = document\.getElementById\('geodataSheetBody'\);\s*var host = document\.getElementById\('geodata-panel-host'\);[\s\S]{0,300}?while \(host\.firstChild\) body\.appendChild\(host\.firstChild\);/.test(CORE_K));
ok('onClose mengembalikannya',
  /while \(body\.firstChild\) host\.appendChild\(body\.firstChild\);/.test(CORE_K));
ok('onOpen/onClose_geodata tidak menyentuh #tab-geotools',
  !/getElementById\('tab-geotools'\)/.test(
    CORE_K.slice(CORE_K.indexOf("register('geodata'"), CORE_K.indexOf('/* ── Export TIF FAB'))));
['openGeoDataSheet', 'closeGeoDataSheet', 'minimizeGeoDataSheet', 'restoreGeoDataSheet'].forEach(function (fn) {
  ok('fungsi ' + fn + ' ada', new RegExp('function ' + fn + '\\(\\)').test(CORE_K));
  ok('fungsi ' + fn + ' diekspor ke window', new RegExp('window\\.' + fn + ' = ' + fn + ';').test(CORE_K));
});
ok('openGeoDataSheet memanggil SheetDrag.buka(\'geodata\')',
  /function openGeoDataSheet\(\) \{ if \(window\.SheetDrag\) window\.SheetDrag\.buka\('geodata'\); \}/.test(CORE_K));
ok('openGeotoolsSheet tetap ke sheet geotools (tidak tertukar)',
  /function openGeotoolsSheet\(\) \{ if \(window\.SheetDrag\) window\.SheetDrag\.buka\('geotools'\); \}/.test(CORE_K));
ok('fungsi GeoTools dan GeoData memakai id sheet yang berbeda',
  CORE_K.indexOf("SheetDrag.buka('geodata')") !== CORE_K.indexOf("SheetDrag.buka('geotools')"));

/* ── 5. Tombol FAB memakai fungsi yang benar ────────────────────────── */
console.log('\n5. Tombol FAB GeoData');
const aF = CORE_K.indexOf('function createGeoDataFAB() {');
ok('createGeoDataFAB ada', aF >= 0);
const F = CORE_K.slice(aF, CORE_K.indexOf('/* ── Legend FAB Button', aF) > 0 ? CORE_K.indexOf('/* ── Legend FAB Button', aF) : aF + 1200);
ok('kliknya memanggil openGeoDataSheet()', /openGeoDataSheet\(\)/.test(F));
ok('kliknya TIDAK lagi menyentuh dropdown',
  !/geotools-dropdown/.test(F) && !/dispatchEvent/.test(F) && !/\.value\s*=/.test(F));
ok('kliknya tidak memanggil openGeotoolsSheet (sudah sheet sendiri)', !/openGeotoolsSheet/.test(F));
ok('kliknya tidak memakai openTab', !/openTab\s*\(/.test(F));
ok('tetap stopPropagation + closeFAB',
  /addEventListener\('click', function \(e\) \{\s*e\.stopPropagation\(\);\s*closeFAB\(\);\s*openGeoDataSheet\(\);/.test(F));
equal(hitung(CORE_K, /createGeoDataFAB\(\);/g), 1, 'dipanggil tepat sekali');
ok('dipanggil tepat setelah createGeotoolsFAB()',
  /createGeotoolsFAB\(\);\s*(?:\/\*[\s\S]*?\*\/\s*)?createGeoDataFAB\(\);/.test(CORE_K));
ok('tombolnya tetap .map-fab-item + ikon sendiri',
  /map-fab-item geodata-fab/.test(F) && /<ellipse cx="12" cy="5" rx="9" ry="3"\/>/.test(F));

/* ── 6. Tidak ada lagi mekanisme menyembunyikan dropdown ────────────── */
console.log('\n6. Mekanisme "sembunyikan dropdown" sudah dihapus total');
equal(hitung(CORE_K + SIDEBAR_K, /geotools-dropdown--nodropdown/g), 0,
  'kelas sembunyi tidak lagi dipakai di JS');
ok('aturan CSS .geotools-dropdown--nodropdown dihapus',
  !/geotools-dropdown--nodropdown/.test(CSS));
ok('openGeoDataPanel() sudah dihapus dari sidebar.js',
  SIDEBAR.indexOf('openGeoDataPanel') === -1 && SIDEBAR_K.indexOf('openGeoDataPanel') === -1);
ok('openGeotoolsMainTab() tidak lagi pernah menanyakan dropdown',
  !/dd\.classList/.test(SIDEBAR_K.slice(SIDEBAR_K.indexOf('function openGeotoolsMainTab'), SIDEBAR_K.indexOf('function applyCctvSearchVisibility'))));
ok('dropdown tidak dipindahkan ke header sheet (memutus 8 pemicu sidebar)',
  !/<div class="gs-sheet-head">[\s\S]{0,600}?class="geotools-dropdown"/.test(HTML));
ok('dropdown tetap anak langsung #tab-geotools',
  /<select class="geotools-dropdown" onchange="openGeotoolsMainTab\(this\)">[\s\S]{0,80}?<option/.test(tab));
/* Kedelapan pemicu sidebar itu harus tetap bisa bekerja. */
const pemicu = [...HTML.matchAll(/querySelector\('\.geotools-dropdown'\)/g)];
equal(pemicu.length, 8, 'delapan pemicu sidebar masih mengandalkan dropdown di tab body');
ok('openGeotoolsMainTab masih diekspor', /window\.openGeotoolsMainTab = openGeotoolsMainTab;/.test(SIDEBAR));

/* ── 7. Gaya ────────────────────────────────────────────────────────── */
console.log('\n7. Gaya di app.css');
ok('.geodata-panel punya aturannya sendiri', /\.geodata-panel\s*\{[^}]*overflow-x:\s*hidden/.test(CSS_K));
ok('.geodata-panel tidak dikunci display:none (selalu tampil di sheetnya)',
  !/\.geodata-panel\s*\{[^}]*display:\s*none/.test(CSS_K));
ok('.geodata-panel tidak mewarisi aturan .geotools-main-tab-panel',
  !/\.geodata-panel\s*\{[^}]*display:/.test(CSS_K));
ok('.geotools-main-tab-panel + .active tetap utuh (9 tab lain)',
  /\.geotools-main-tab-panel\s*\{\s*display:\s*none/.test(CSS_K) &&
  /\.geotools-main-tab-panel\.active\s*\{\s*display:\s*block/.test(CSS_K));
ok('.geotools-dropdown tetap punya gaya sendiri',
  /\.geotools-dropdown\s*\{[^}]*margin-bottom:\s*14px/.test(CSS_K));

/* ── 7b. CSS sheet GeoData sendiri ───────────────────────────────────
 *
 * Sheet GeoData sempat memakai kelas .gs-sheet-* milik GeoTools. Semua
 * aturan .gs-sheet-* itu di-scope ke #geotools-sheet, jadi tidak satu pun
 * yang mengenai sheet GeoData - panelnya jadi tanpa posisi, tanpa gaya
 * kepala, tanpa body yang bisa digulir. Karena itu sheet GeoData butuh
 * blok CSS-nya sendiri, seperti sheet tabel, legenda, dan alat & ukur. */
console.log('\n7b. CSS sheet GeoData (template sheet tabel/legenda/alat&ukur)');
ok('#geodata-sheet punya blok dasar', /#geodata-sheet\s*\{[^}]*position:\s*fixed/.test(CSS_K));
ok('lebar panel 380px seperti sheet GeoTools',
  /#geodata-sheet\s*\{[^}]*width:\s*min\(380px/.test(CSS_K));
ok('tersembunyi di luar layar sebelum dibuka',
  /#geodata-sheet\s*\{[^}]*visibility:\s*hidden/.test(CSS_K) &&
  /#geodata-sheet\s*\{[^}]*translateX\(calc\(100% \+ 24px\)\)/.test(CSS_K));
ok('ada aturan .geodata-sheet-open',
  /#geodata-sheet\.geodata-sheet-open\s*\{\s*transform:\s*translateX\(0\);\s*visibility:\s*visible/.test(CSS_K));
ok('kepala, judul, tombol & body punya gaya sendiri',
  /#geodata-sheet\s+\.geodata-sheet-head\s*\{/.test(CSS_K) &&
  /#geodata-sheet\s+\.geodata-sheet-title\s*\{/.test(CSS_K) &&
  /#geodata-sheet\s+\.geodata-sheet-minimize\s*\{/.test(CSS_K) &&
  /#geodata-sheet\s+\.geodata-sheet-close\s*\{/.test(CSS_K) &&
  /#geodata-sheet\s+\.geodata-sheet-body\s*\{/.test(CSS_K));
ok('body bisa digulir dengan padding template',
  /#geodata-sheet\s+\.geodata-sheet-body\s*\{[^}]*overflow-y:\s*auto/.test(CSS_K) &&
  /#geodata-sheet\s+\.geodata-sheet-body\s*\{[^}]*padding:\s*12px 16px 16px/.test(CSS_K));
ok('handle disembunyikan di desktop', /#geodata-sheet\s+\.geodata-sheet-handle\s*\{\s*display:\s*none/.test(CSS_K));
ok('ada aturan chip 36px saat diminimalkan',
  /#geodata-sheet\.geodata-sheet-minimized\s*\{[^}]*height:\s*36px/.test(CSS_K) &&
  /#geodata-sheet\.geodata-sheet-minimized\s+\.geodata-sheet-body\s*\{[^}]*display:\s*none/.test(CSS_K));
/* Jendela pencocokan harus longgar: aturan mobile GeoData berjarak ~11.000
 * karakter dari @media (max-width:768px) yang membungkusnya, karena blok
 * tersebut memuat banyak sheet lain lebih dulu. */
ok('ada varian mobile (bottom sheet + drag pill)',
  /@media \(max-width:\s*768px\)[\s\S]{0,14000}?#geodata-sheet\.geodata-sheet-open\s*\{\s*transform:\s*translateY\(0\)/.test(CSS_K) &&
  /@media \(max-width:\s*768px\)[\s\S]{0,14000}?#geodata-sheet\s+\.geodata-sheet-handle\s*\{[^}]*display:\s*flex/.test(CSS_K) &&
  /@media \(max-width:\s*768px\)[\s\S]{0,14000}?#geodata-sheet\s*\{[^}]*translateY\(100%\)/.test(CSS_K));
ok('kontrol Leaflet kanan digeser saat sheet terbuka',
  /body\.geodata-sheet-open:not\(\.geodata-sheet-minimized\)\s+\.leaflet-bottom\.leaflet-right\s*\{/.test(CSS_K));
ok('nav bawah & blok ekspor ikut tersembunyi, sama seperti sheet lain',
  /body\.geodata-sheet-open:not\(\.geodata-sheet-minimized\)\s+\.map-fab-wrap/.test(CSS_K) &&
  /body\.geodata-sheet-open:not\(\.geodata-sheet-minimized\)\s+\.petadasar-export-block/.test(CSS_K));
ok('CSS GeoTools tidak ikut berubah (tetap memakai kelasnya sendiri)',
  /#geotools-sheet\.gs-sheet-open\s*\{\s*transform:\s*translateX\(0\)/.test(CSS_K) &&
  /#geotools-sheet\s+\.gs-sheet-head\s*\{/.test(CSS_K));
ok('tidak ada aturan gs-sheet-* yang di-scope ke sheet GeoData',
  !/#geodata-sheet\s+\.gs-sheet-/.test(CSS_K));

/* ── 7c. Grid subtab GeoData: 3 kolom x 2 baris ──────────────────────
 *
 * `.geotools-upload-tabs` hanya dipakai di panel GeoData, jadi mengubahnya
 * tidak menyentuh sheet atau panel lain.
 *
 * Sebelumnya `repeat(auto-fit, minmax(112px, 1fr))`. Di sheet GeoTools 380px
 * (padding 12/16 -> konten ~348px) auto-fit hanya menghasilkan 2 kolom:
 * (348 + 8) / (112 + 8) = 2,96 -> turun ke 2. Enam tombol jadi 2x3 dan
 * sheet-nya jauh lebih tinggi dari yang perlu, padahal separuh isinya form
 * ArcGIS REST yang harus tetap muat tanpa menggulir. */
console.log('\n7c. Grid subtab GeoData 3 kolom x 2 baris');
ok('.geotools-upload-tabs hanya dipakai di panel GeoData',
  (HTML.match(/geotools-upload-tabs/g) || []).length === 1);
ok('grid dikunci 3 kolom, bukan auto-fit',
  /\.geotools-upload-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*1fr\)/.test(CSS_K));
ok('auto-fit minmax(112px) sudah tidak dipakai',
  !/\.geotools-upload-tabs\s*\{[^}]*auto-fit/.test(CSS_K));
ok('enam tombol subtab (SHP, GeoJSON, GPX, KMZ, ArcGIS REST, Timeline)',
  (hostMarkup.match(/data-subtab="alat-tab-/g) || []).length === 6);
/* Komentar BARU di blok ini mengutip kalimat lama yang salah ("7 subtab,
   bukan 6") untuk dikoreksi. Jadi kalimat itu masih ada - sebagai kutipan.
   Yang diuji: koreksinya ikut ada, dan alasan auto-fit yang lama sudah
   dibuang. */
ok('koreksi atas komentar lama yang salah ikut ditulis',
  /Komentar lama di blok ini menyebut/.test(CSS) && /keliru: jumlahnya 6/.test(CSS));
ok('alasan auto-fit yang lama sudah dibuang',
  !/Jumlah tombol sebelumnya juga tetap aman/.test(CSS));
ok('tinggi tombol diperkecil dari 72px ke 60px',
  /\.geotools-upload-tabs\s+\.geoid-subtab-btn\s*\{[^}]*min-height:\s*60px/.test(CSS_K) &&
  !/\.geotools-upload-tabs\s+\.geoid-subtab-btn\s*\{[^}]*min-height:\s*72px/.test(CSS_K));
ok('padding tombol diperkecil', /\.geotools-upload-tabs\s+\.geoid-subtab-btn\s*\{[^}]*padding:\s*8px 4px/.test(CSS_K));

const versi = /assets\/css\/app\.css\?v=(\d+)/.exec(HTML);
ok('app.css?v= ada di markup', !!versi);
ok('versi stylesheet sudah dinaikkan (grid 3 kolom + host disembunyikan)', versi && Number(versi[1]) >= 70, versi && versi[1]);

/* ── 8. Yang lain tidak terganggu ──────────────────────────────────── */
console.log('\n8. Yang lain tidak terganggu');
ok('openGeoidSubtab() tetap utuh (dipakai 6 tombol Alat)',
  /function openGeoidSubtab\(btn\)/.test(SIDEBAR) && /window\.openGeoidSubtab = openGeoidSubtab/.test(SIDEBAR));
ok('openGempaSubtab() tetap utuh', /function openGempaSubtab\(btn\)/.test(SIDEBAR));
ok('.map-fab-item tetap dikecualikan dari subsurface peta',
  /\.map-fab-wrap'\s*,\s*'\.map-fab-item'/.test(
    fs.readFileSync(path.join(ROOT, 'assets', 'js', 'geoportal.js'), 'utf8')));
ok('GeoData tidak punya checkbox, jadi layer-loading.js tidak perlu .geodata-panel',
  hitung(host, /<input[^>]*type="checkbox"/g) === 0, hitung(host, /<input[^>]*type="checkbox"/g));

console.log('\n' + (fail === 0 ? 'SEMUA LULUS' : 'ADA YANG GAGAL') + ': ' + pass + ' lulus, ' + fail + ' gagal');
process.exit(fail === 0 ? 0 : 1);
