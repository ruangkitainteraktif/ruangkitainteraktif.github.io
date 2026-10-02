/* Uji panel GeoPangan: nav sumber (PIHPS / SP2KP) dihapus, dua panelnya
 * dipisah menjadi dua kartu collapsed .gt-card-head.
 *
 * Tiga jebakan yang sudah diperiksa sebelum perubahan dibuat, dan semuanya
 * masih dijaga oleh tes ini:
 *
 *  1. openGeoPanganSourceTab() MENCARI SECARA GLOBAL.
 *     Fungsi lamanya menjalankan querySelectorAll('[data-geopangan-source]')
 *     dan ('[data-geopangan-source-panel]') di SELURUH dokumen. Kalau nav
 *     dihapus tapi dua panel lamanya (beserta atributnya) dibiarkan, begitu
 *     sidebar.js memanggil fungsi itu, .active dicabut dari panel yang salah
 *     dan ".geopangan-source-panel { display:none }" menyembunyikannya
 *     permanen. Nav DAN panelnya harus dibuang BERSAMA, dan atribut
 *     data-geopangan-source* tidak boleh dipakai ulang di kartu baru.
 *
 *  2. loadVariants() HANYA DIPANGGIL OLEH openGeoPanganSourceTab().
 *     Fungsi itu yang mengisi #sp2kpVariantSelect. Kalau ikut hilang,
 *     katalog variant tidak pernah dimuat dan dropdown SP2KP kosong
 *     selamanya — dan tidak ada error yang terlihat, dropdownnya cuma
 *     tidak pernah berisi apa-apa. Pemanggilnya dipindah ke kartu SP2KP:
 *     loadVariants() berjalan saat kartu itu pertama kali dibuka.
 *
 *  3. .cctv-card / .cctv-card-header MASIH DIPAKAI panel lain.
 *     GeoPulse memakainya 9 kali. Yang dihapus hanya pemakaiannya di
 *     panel ini, bukan aturannya. (.cctv-card-body memang tidak pernah
 *     punya aturan sama sekali, jadi hilangnya pemakaiannya di sini
 *     tidak mengubah apa pun secara visual.)
 *
 * Id yang ditulis ulang JS (#geopanganResult, #geopanganTable,
 * #sppgSebaranTable) dipindahkan runtime oleh moveGeopanganContent()
 * ke #geopangan-sheet-content. Wrapper-nya harus tetap ada.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'app.css'), 'utf8');
const SIDEBAR = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'sidebar.js'), 'utf8');
const SP2KP = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'sp2kp-geopangan.js'), 'utf8');
const GEOPANGAN = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'geopangan.js'), 'utf8');

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
/* Nama yang hanya muncul di dalam komentar tidak boleh dihitung sebagai
 * "masih dipakai" maupun "sudah dihapus". */
const HTML_KODE = tanpaKomentar(HTML);
const CSS_KODE = tanpaKomentar(CSS);
const SP2KP_KODE = tanpaKomentar(SP2KP);
const SIDEBAR_KODE = tanpaKomentar(SIDEBAR);

function potongElemen(html, dari, tag) {
  const re = new RegExp('<' + tag + '\\b|</' + tag + '>', 'g');
  re.lastIndex = dari;
  let depth = 0, m;
  while ((m = re.exec(html))) {
    if (m[0].charAt(1) === '/') { depth--; if (depth === 0) return { akhir: re.lastIndex, teks: html.slice(dari, re.lastIndex) }; }
    else depth++;
  }
  return null;
}

const P = potongElemen(HTML, HTML.indexOf('<div id="geotoolsTabGeoPangan"'), 'div');
ok('panel #geotoolsTabGeoPangan ada dan tertutup', !!P);
if (!P) process.exit(1);
const PK = tanpaKomentar(P.teks);

/* ── 1. Nav sumber dihapus ──────────────────────────────────────────── */
console.log('\n1. Nav sumber dihapus');
ok('.geopangan-source-tabs tidak ada di panel', !/geopangan-source-tabs/.test(PK));
ok('tidak ada button.nav sumber', !/data-geopangan-source="/.test(PK));
ok('tidak ada role="tablist" di panel', !/role="tablist"/.test(PK));
ok('tidak ada role="tabpanel" di panel', !/role="tabpanel"/.test(PK));
ok('atribut data-geopangan-source* tidak ada di panel',
  !/data-geopangan-source/.test(PK));
ok('kelas .geopangan-source-panel tidak ada di panel',
  !/class="[^"]*\bgeopangan-source-panel\b/.test(PK));
equal(hitung(HTML_KODE, /data-geopangan-source/g), 0,
  'atribut data-geopangan-source* hilang dari seluruh halaman');
ok('id geopangan-pihps-panel dibuang', PK.indexOf('geopangan-pihps-panel') === -1);
ok('id geopangan-sp2kp-panel dibuang', PK.indexOf('geopangan-sp2kp-panel') === -1);

/* ── 2. Fungsi nav benar-benar hilang ────────────────────────────────── */
console.log('\n2. Fungsi navigasi sumber dihapus, bukan hanya tak terpakai');
ok('openGeoPanganSourceTab tidak didefinisikan lagi',
  !/function openGeoPanganSourceTab/.test(SP2KP));
ok('openGeoPanganSourceTab tidak lagi diekspor ke window',
  !/window\.openGeoPanganSourceTab/.test(SP2KP));
ok('tidak ada lagi yang memanggilnya', !/openGeoPanganSourceTab\(/.test(SP2KP_KODE));
ok('sidebar.js tidak lagi memanggilnya', !/openGeoPanganSourceTab/.test(SIDEBAR_KODE));
ok('bindSourceTabs tidak ada lagi', !/bindSourceTabs/.test(SP2KP_KODE));
/* Kalau fungsinya masih ada, ini jebakan nomor 1. */
ok('tidak ada lagi pencarian global data-geopangan-source di JS mana pun',
  !/querySelectorAll\('\[data-geopangan-source/.test(SP2KP));
/* Yang mengisi kartu PIHPS sekarang memanggil geopanganAutoLoad langsung.
 * Diuji terhadap SIDEBAR_KODE (komentar dibuang) supaya panjang komentar
 * tidak ikut ruining jendelanya. */
ok('sidebar.js memanggil geopanganAutoLoad untuk tab GeoPangan',
  /tabId === 'geotoolsTabGeoPangan'[\s\S]{0,160}?window\.geopanganAutoLoad\(\)/.test(SIDEBAR_KODE));
ok('geopanganAutoLoad masih ada di geopangan.js',
  /window\.geopanganAutoLoad\s*=/.test(GEOPANGAN));

/* ── 3. loadVariants() tetap terpanggil ─────────────────────────────── */
console.log('\n3. Katalog variant SP2KP tetap dimuat');
ok('loadVariants() masih ada', /function loadVariants\(\)/.test(SP2KP));
ok('loadVariants() mengisi #sp2kpVariantSelect',
  /populateVariants/.test(SP2KP) && /function populateVariants/.test(SP2KP));
ok('#sp2kpVariantSelect ada di markup', /id="sp2kpVariantSelect"/.test(PK));
/* Ini inti jebakan nomor 2. Tiga kemunculan loadVariants() yang tersisa:
 * satu definisinya, dan DUA pemanggil - kartu SP2KP (toggle) serta
 * sp2kpGeoPanganOpen. Kalau jumlah ini turun ke satu, artinya salah satu
 * pemanggil hilang dan dropdown variant bisa jadi tidak pernah terisi. */
equal(hitung(SP2KP_KODE, /loadVariants\(\)/g), 3,
  'loadVariants(): 1 definisi + 2 pemanggil (toggle kartu & sp2kpGeoPanganOpen)');
equal(hitung(SP2KP_KODE, /loadVariants\(\)\.catch/g), 2,
  'kedua pemanggil dibungkus .catch()');
ok('pemanggilnya terikat ke kartu SP2KP lewat event toggle',
  /getElementById\('geopangan-card-sp2kp'\)/.test(SP2KP) &&
  /card\.addEventListener\('toggle'/.test(SP2KP) &&
  /if \(card\.open\) loadVariants\(\)\.catch/.test(SP2KP));
ok('kartu SP2KP punya id itu di markup', /id="geopangan-card-sp2kp"/.test(PK));
ok('bindSp2kpCard() dipanggil dari init()',
  /function init\(\)[\s\S]{0,400}?bindSp2kpCard\(\);/.test(SP2KP));
ok('loadVariants() tetap memoize (tidak menarik data dua kali)',
  /if \(variantPromise\) return variantPromise;/.test(SP2KP));
/* sp2kpGeoPanganOpen tidak pernah dipanggil, tapi tetap hidup dan kini
 * membuka kartunya — bukan memanggil fungsi nav yang sudah dihapus. */
ok('sp2kpGeoPanganOpen tidak lagi bergantung pada fungsi nav',
  /window\.sp2kpGeoPanganOpen = function \(\)[\s\S]{0,200}?geopangan-card-sp2kp/.test(SP2KP_KODE) &&
  !/openGeoPanganSourceTab/.test(SP2KP_KODE));


/* ── 4. Dua kartu collapsed ─────────────────────────────────────────── */
console.log('\n4. Dua kartu mengikuti template .gt-card-head');
equal(hitung(PK, /<details\b/g), 2, 'dua <details>');
equal(hitung(PK, /<\/details>/g), 2, '</details> seimbang');
equal(hitung(PK, /<summary class="gt-card-head">/g), 2, 'dua kepala .gt-card-head');
equal(hitung(PK, /<div class="geopangan-card-body">/g), 2, 'dua badan .geopangan-card-body');
equal(hitung(PK, /<span class="gt-card-icon" aria-hidden="true">/g), 2, 'dua ikon');
equal(hitung(PK, /<details class="geopangan-card"/g), 2, 'dua tag pembuka details');
ok('tidak ada atribut open (kartu mulai terlipat)',
  !/<details class="geopangan-card"[^>]*\sopen[\s=>/]/.test(PK));
/* Setiap kepala: ikon + tepat satu <span> pembungkus. */
const kepala = PK.match(/<summary class="gt-card-head">([\s\S]*?)<\/summary>/g) || [];
equal(kepala.length, 2, 'terkumpul dua kepala untuk diperiksa');
kepala.forEach(function (k, i) {
  equal(hitung(k, /<span\b/g), 2, 'kepala ' + (i + 1) + ': ikon + satu <span> pembungkus');
  equal(hitung(k, /<b\b/g), 1, 'kepala ' + (i + 1) + ': satu judul <b>');
  equal(hitung(k, /<small\b/g), 1, 'kepala ' + (i + 1) + ': satu subjudul <small>');
});
/* Teks judul TIDAK di-hardcode di sini. Judul kartu sedang aktif disunting
 * pengguna (mis. "Cari Wilayah - Harga pangan" -> "PIHPS - BI"), jadi yang
 * diuji adalah kontraknya: aria-labelledby menunjuk <b> yang ada dan
 * isinya bukan placeholder. */
function cekJudul(id, label) {
  const m = new RegExp('<b id="' + id + '">([^<]*)</b>').exec(PK);
  ok('kartu ' + label + ' punya judul <b id="' + id + '">', !!m);
  ok('judul kartu ' + label + ' tidak kosong', m && m[1].trim().length > 2, m && m[1]);
  ok('kartu ' + label + ' memakai aria-labelledby yang menunjuk judulnya',
    new RegExp('aria-labelledby="' + id + '"').test(PK));
}
cekJudul('geopanganPihpsTitle', 'PIHPS');
cekJudul('geopanganSp2kpTitle', 'SP2KP');
ok('kedua id judul unik di halaman',
  hitung(HTML, /id="geopanganPihpsTitle"/g) === 1 && hitung(HTML, /id="geopanganSp2kpTitle"/g) === 1);
ok('kedua id judul unik di halaman',
  hitung(HTML, /id="geopanganPihpsTitle"/g) === 1 && hitung(HTML, /id="geopanganSp2kpTitle"/g) === 1);
ok('kedua id kartu unik di halaman',
  hitung(HTML, /id="geopangan-card-pihps"/g) === 1 && hitung(HTML, /id="geopangan-card-sp2kp"/g) === 1);
equal(hitung(HTML, /class="geopangan-card"/g), 2, 'hanya dua kartu geopangan-card di halaman');
ok('judul panel tetap di luar kartu',
  /GeoPangan<\/h4>[\s\S]{0,200}<details/.test(PK));
ok('dropdown GeoTools masih menunjuk panel ini',
  /<option value="geotoolsTabGeoPangan"/.test(HTML));

/* ── 5. Id yang ditulis ulang JS ────────────────────────────────────── */
console.log('\n5. Id yang ditulis ulang JS & tempat yang dipindahkan runtime');
const idPenting = [
  /* PIHPS */
  'geopanganPriceType', 'geopanganCommodity', 'geopanganProvince',
  'geopanganDateStart', 'geopanganDateEnd', 'geopanganLoadBtn', 'geopanganResetBtn',
  'geopanganResult', 'geopanganTable', 'sppgSebaranTable', 'geopangan-table-home',
  /* SP2KP */
  'sp2kpVariantSelect', 'sp2kpLatestDate', 'sp2kpLoadBtn', 'sp2kpStatus',
  'sp2kpResult', 'sp2kpTable', 'sp2kpHntChartCard', 'sp2kpHntChartSubtitle',
  'sp2kpHntChart', 'sp2kpResetBtn', 'sp2kpHistoryStart', 'sp2kpHistoryEnd',
  'sp2kpHistoryLoadBtn', 'sp2kpHistoryStatus', 'sp2kpHistoryTable',
  'sp2kpHistoryCard', 'sp2kpHistoryChart'
];
idPenting.forEach(function (id) {
  ok('id ' + id + ' masih ada di panel', new RegExp('id="' + id + '"').test(PK));
  ok('id ' + id + ' unik di halaman', hitung(HTML, new RegExp('id="' + id + '"', 'g')) === 1,
    hitung(HTML, new RegExp('id="' + id + '"', 'g')));
});
/* Urutannya penting: moveGeopanganContent() memindahkan tiga id hasil ini
 * keluar dari kartu ke sheet, lalu memindahkannya kembali. */
ok('moveGeepanganContent masih menunjuk wrapper #geopangan-table-home',
  /var destination = toSheet \? \$\('geopangan-sheet-content'\) : \$\('geopangan-table-home'\);/.test(GEOPANGAN));
ok('wrapper #geopangan-table-home ada di markup', /id="geopangan-table-home"/.test(PK));
ok('wrapper itu ada DI DALAM kartu PIHPS',
  /id="geopangan-card-pihps"[\s\S]*?id="geopangan-table-home"/.test(PK));
ok('#geopangan-sheet-content masih ada di halaman', /id="geopangan-sheet-content"/.test(HTML));
/* Dua id ini diakses tanpa null guard di geopangan.js: hilang = lempar error. */
ok('#geopanganDateStart & #geopanganDateEnd diakses langsung',
  /geopanganDateStart/.test(GEOPANGAN) && /geopanganDateEnd/.test(GEOPANGAN));
/* Gerbang init(): tanpa sp2kpLoadBtn, seluruh SP2KP tidak dinyalakan. */
ok('gerbang init() masih bergantung pada #sp2kpLoadBtn',
  /var button = \$\('sp2kpLoadBtn'\);\n?[\s\S]{0,120}?if \(!button\) return;/.test(SP2KP));

/* ── 6. Chart tetap hidup di dalam kartu terlipat ───────────────────── */
console.log('\n6. Chart.js & pembungkus canvas');
['sp2kpHntChart', 'sp2kpHistoryChart'].forEach(function (id) {
  ok(id + ' ada', new RegExp('<canvas id="' + id + '">').test(PK));
  ok(id + ' tetap dibungkus <div> bertinggi tetap',
    new RegExp('style="height:\\d+px[^"]*"><canvas id="' + id + '">').test(PK),
    (/[^>]*><canvas id="[a-z0-9]*Chart">/.exec(PK) || [])[0]);
  ok(id + ' ada di dalam badan kartu, bukan di luar',
    new RegExp('class="geopangan-card-body"[\\s\\S]*?id="' + id + '"').test(PK));
});
/* Keduanya hanya digambar dari klik tombol yang ada DI DALAM badan kartu,
 * jadi mustahil terjadi saat kartu terlipat. */
ok('tombol pemicu HNT ada di markup',
  /id="sp2kpLoadBtn"/.test(PK) && /id="sp2kpHistoryLoadBtn"/.test(PK));
ok('kedua tombol diikat di init()',
  /button\.addEventListener\('click', loadSp2kp\)/.test(SP2KP) &&
  /historyButton\.addEventListener\('click', loadSp2kpHistory\)/.test(SP2KP));
/* Chart.js memasang ResizeObserver sendiri, jadi grafik menggambar ulang
 * saat kartu dibuka lagi - asalkan wrapper-nya ikut ke dalam badan kartu. */
ok('pembungkus tinggi tetap ada (syarat ResizeObserver bekerja)',
  hitung(PK, /style="height:\d+px;margin-top:8px;"><canvas/g) === 2);
ok('kartu tidak pakai overflow: visible seperti .geowatch-cctv',
  /\.geopangan-card\s*\{[^}]*overflow:\s*hidden/.test(CSS_KODE));

/* ── 7. Gaya ────────────────────────────────────────────────────────── */
console.log('\n7. Gaya di app.css');
ok('ada gaya .geopangan-card', /\.geopangan-card\s*\{/.test(CSS_KODE));
ok('ada aturan collapse :not([open])',
  /\.geopangan-card:not\(\[open\]\)\s*>\s*\.geopangan-card-body\s*\{\s*display:\s*none/.test(CSS_KODE));
ok('badan kartu punya padding 12px 13px (sama dengan kartu lain)',
  /\.geopangan-card-body\s*\{\s*padding:\s*12px 13px/.test(CSS_KODE));
ok('kartu punya border, radius, warna tema', (function () {
  const b = /\.geopangan-card\s*\{([^}]*)\}/.exec(CSS_KODE);
  return b && /border:/.test(b[1]) && /border-radius:\s*10px/.test(b[1]) && /var\(--bg-card\)/.test(b[1]);
})());
ok('jarak 10px antar kartu, sama seperti .geonusa-card',
  /\.geopangan-card\s*\+\s*\.geopangan-card\s*\{\s*margin-top:\s*10px/.test(CSS_KODE));
ok('kartu pertama tidak punya margin-top sendiri',
  !/(^|[},])\s*\.geopangan-card\s*\{[^}]*margin-top/.test(CSS_KODE));
/* Aturan nav dihapus, bukan dialiaskan: kelas itu eksklusif panel ini. */
ok('.geopangan-source-tabs hilang dari CSS', !/\.geopangan-source-tabs\s*\{/.test(CSS_KODE));
ok('.geopangan-source-tab hilang dari CSS', !/\.geopangan-source-tab\s*\{/.test(CSS_KODE));
ok('.geopangan-source-tab:hover hilang dari CSS', !/\.geopangan-source-tab:hover/.test(CSS_KODE));
ok('.geopangan-source-tab.active hilang dari CSS', !/\.geopangan-source-tab\.active/.test(CSS_KODE));
ok('.geopangan-source-panel hilang dari CSS', !/\.geopangan-source-panel\s*\{/.test(CSS_KODE));
ok('.geopangan-source-panel.active hilang dari CSS', !/\.geopangan-source-panel\.active/.test(CSS_KODE));
/* .geopangan-sticky-header tidak pernah punya position:sticky - namanya
 * saja yang menyesatkan. Setelah GeoPangan pindah ke kartu, satu-satunya
 * pemakainya (wrapper no-op di GeoWatch) ikut dihapus, jadi seluruh
 * aturannya boleh mati juga. */
ok('.geopangan-sticky-header hilang dari CSS', !/\.geopangan-sticky-header/.test(CSS_KODE));
ok('.geopangan-sticky-header hilang dari markup', !/geopangan-sticky-header/.test(HTML_KODE));
/* Jebakan nomor 3: kelas bersama harus TETAP. */
ok('.cctv-card MASIH ada di CSS (dipakai GeoPulse)', /\.cctv-card\s*\{/.test(CSS_KODE));
ok('.cctv-card-header MASIH ada di CSS (dipakai GeoPulse)', /\.cctv-card-header\s*\{/.test(CSS_KODE));
ok('.cctv-card-header svg MASIH ada di CSS', /\.cctv-card-header\s+svg\s*\{/.test(CSS_KODE));
ok('GeoPulse masih memakai .cctv-card-header di markup',
  hitung(HTML, /class="cctv-card-header"/g) > 0, hitung(HTML, /class="cctv-card-header"/g));
ok('.cctv-card tidak dipakai lagi di panel GeoPangan',
  !/class="cctv-card"/.test(PK) && !/class="cctv-card-header"/.test(PK));
/* .cctv-card-body memang tidak pernah punya aturan, jadi tidak ada yang hilang. */
ok('.cctv-card-body memang tidak pernah punya aturan CSS',
  !/\.cctv-card-body\s*\{/.test(CSS_KODE));
/* Aturan isian GeoPangan tidak boleh ikut hilang. */
ok('.geopangan-field masih ada', /\.geopangan-field\s*\{/.test(CSS_KODE));
ok('.geopangan-btn masih ada', /\.geopangan-btn\s*\{/.test(CSS_KODE));
ok('.sp2kp-table-subtitle masih ada', /\.sp2kp-table-subtitle\s*\{/.test(CSS_KODE));
ok('tema gelap .geopangan-field masih ada',
  /\[data-theme="dark"\]\s*\.geopangan-field/.test(CSS_KODE));
ok('.gt-card-head TIDAK ditulis ulang', hitung(CSS, /^\.gt-card-head\s*\{/gm) === 1);
const versi = /assets\/css\/app\.css\?v=(\d+)/.exec(HTML);
ok('app.css?v= ada di markup', !!versi);
ok('versi stylesheet sudah dinaikkan', versi && Number(versi[1]) >= 63, versi && versi[1]);

/* ── 8. Keseimbangan tag & tetangga ──────────────────────────────────── */
console.log('\n8. Keseimbangan tag & panel lain');
['div', 'details', 'summary', 'span', 'b', 'small', 'p', 'select', 'option', 'label', 'button', 'table']
  .forEach(function (t) {
    equal(hitung(PK, new RegExp('<' + t + '\\b', 'g')), hitung(PK, new RegExp('</' + t + '>', 'g')),
      '<' + t + '> seimbang');
  });
/* Lima input tanggal, semuanya harus tetap: 2 di formulir PIHPS
 * (geopanganDateStart/End) dan 3 di SP2KP (sp2kpLatestDate,
 * sp2kpHistoryStart/End). Semuanya elemen kosong tanpa tag penutup. */
equal(hitung(PK, /<input\b/g), 5, 'lima <input type="date"> (tanpa tag penutup)');
equal(hitung(PK, /<input type="date"/g), 5, 'kelimanya bertipe date');
equal(hitung(PK, /<\/input>/g), 0, 'tidak ada </input> yang menganggur');
equal(hitung(PK, /<canvas\b/g), 2, 'dua canvas');
equal(hitung(PK, /<\/canvas>/g), 2, '</canvas> seimbang');
/* Kedua .geopangan-card harus anak langsung panel, seperti kartu lain. */
ok('tidak ada .geopangan-card di dalam .cctv-card atau Details lain',
  !/<details class="(?!geopangan-card)[^"]*"/.test(PK));
ok('kartu panel lain tidak ikut berubah',
  /<details class="geowatch-cctv"/.test(HTML) && /<details class="georaster-card"/.test(HTML) &&
  /<details class="geonusa-card"/.test(HTML) && /<details class="geofarm-card"/.test(HTML));
ok('nav .geopangan-source-tabs tidak ada di halaman manapun',
  !/geopangan-source-tabs/.test(HTML_KODE));
ok('tidak ada selector #geotoolsTabGeoPangan > ... di CSS',
  !/#geotoolsTabGeoPangan\s*[>+~]/.test(CSS_KODE));

console.log('\n' + (fail === 0 ? 'SEMUA LULUS' : 'ADA YANG GAGAL') + ': ' + pass + ' lulus, ' + fail + ' gagal');
process.exit(fail === 0 ? 0 : 1);
