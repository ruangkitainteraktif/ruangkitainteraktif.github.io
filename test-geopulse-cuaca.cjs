/* Uji section "Cuaca" GeoPulse (#gempa-subtab-infocuaca): dua kartu
 * .cctv-card + pita biru .cctv-card-header diganti menjadi dua kartu
 * collapsed .gt-card-head.
 *
 * Empat jebakan yang sudah diperiksa sebelum perubahan dibuat, dan semuanya
 * masih dijaga oleh tes ini:
 *
 *  1. HANYA section "Cuaca" yang terlihat di aplikasi. Tombol subtab
 *     (Cuaca / Gempa / Kehutanan / Geologi / Forecasting) hidup di dalam
 *     .gempa-subtabs, dan pembungkus itu inline style="display:none;" -
 *     tidak ada satu pun baris JS yang membukanya. Jadi wrapper
 *     .gempa-subtab-panel TIDAK boleh dilepas: itu yang membuat section ini
 *     terlihat, dan sidebar.js:162 mencari '.gempa-subtab-panel' secara
 *     global untuk menukar kelas .active. Empat section lain sengaja
 *     dibiarkan apa adanya; kalau suatu saat nav-nya dihidupkan, aturan
 *     .gempa-subtab-panel .cctv-layers (max-height 35vh) ikut-needed.
 *
 *  2. Id toggle layer dirujuk dari banyak modul sekaligus:
 *     cuaca-maritim-layer.js, openaq-pm.js, map-core.js (quick layer dan
 *     katalog layer), layer-loading.js, attribute-table.js, dan
 *     ai-analysis.js. Sebagian TANPA penjaga - cuaca-maritim-layer.js:373
 *     memanggil document.getElementById('toggleCuacaPerairanLayer') lalu
 *     langsung menambah event listener. Hilang satu id = checkbox yang
 *     tidak bisa dicentang, tanpa error yang terlihat.
 *
 *  3. Atribut data-airvisual-layer bukan id, jadi tidak ikut tertangkap
 *     pemeriksaan id. Enam toggle AirVisual (pm25, pm10, o3, no2, so2, co)
 *     diambil lewat querySelectorAll('[data-airvisual-layer=...]') di
 *     map-core.js dan dilacak isinya, jadi atributnya ikut diuji.
 *
 *  4. Kelas .cctv-layers harus tetap di badan kartu: di dalam
 *     .gempa-subtab-panel ia yang memberi max-height:35vh + overflow-y:auto
 *     pada daftar 10 toggle kualitas udara. Kalau hilang, daftar itu
 *     memanjang dan mendorong seluruh panel GeoPulse.
 *
 * Perhatikan juga: .cctv-card, .cctv-card-header, dan .cctv-layers TIDAK
 * dihapus dari CSS. Empat section GeoPulse yang lain masih memakainya, jadi
 * menghapus at akan mematikan semuanya tanpa error.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'app.css'), 'utf8');
const SIDEBAR = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'sidebar.js'), 'utf8');

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
const HTML_KODE = tanpaKomentar(HTML);
const CSS_KODE = tanpaKomentar(CSS);
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

const S = potongElemen(HTML, HTML.indexOf('<div id="gempa-subtab-infocuaca"'), 'div');
ok('section #gempa-subtab-infocuaca ada dan tertutup', !!S);
if (!S) process.exit(1);
const SK = tanpaKomentar(S.teks);

/* ── 1. Wrapper subtab tidak boleh disentuh ─────────────────────────── */
console.log('\n1. Wrapper .gempa-subtab-panel dipertahankan');
ok('section tetap memakai kelas .gempa-subtab-panel', /class="gempa-subtab-panel active"/.test(SK));
ok('wrapper tidak memakai inline display:none (itulah yang membuatnya terlihat)',
  !/id="gempa-subtab-infocuaca"[^>]*style="display:none/.test(SK));
ok('sidebar.js memang mencari .gempa-subtab-panel secara global',
  /document\.querySelectorAll\('\.gempa-subtab-panel'\)/.test(SIDEBAR_KODE));
ok('openGempaSubtab masih menukar .active di seluruh dokumen',
  /panels = document\.querySelectorAll\('\.gempa-subtab-panel'\)/.test(SIDEBAR_KODE) &&
  /panels\[j\]\.classList\.remove\('active'\)/.test(SIDEBAR_KODE) &&
  /target\.classList\.add\('active'\)/.test(SIDEBAR_KODE));
ok('kartu tidak memakai kelas .gempa-subtab-panel',
  !/class="[^"]*gempa-subtab-panel[^"]*"[^>]*>\s*<details/.test(SK));
/* Empat section lain harus tetap utuh. */
['gempa', 'karhutla', 'prediksicuaca', 'gunungapi'].forEach(function (s) {
  ok('section #' + s + ' masih ada', new RegExp('id="gempa-subtab-' + s + '"').test(HTML));
  ok('section #' + s + ' masih memakai .cctv-card-header',
    hitung(potongElemen(HTML, HTML.indexOf('<div id="gempa-subtab-' + s + '"'), 'div').teks,
      /class="cctv-card-header"/g) > 0);
});
equal(hitung(HTML, /class="cctv-card-header"/g), 7,
  'tujuh pita .cctv-card-header tersisa (4 section lain, bukan 9 seperti sebelumnya)');

/* ── 2. Dua kartu collapsed ─────────────────────────────────────────── */
console.log('\n2. Dua kartu mengikuti template .gt-card-head');
equal(hitung(SK, /<details\b/g), 2, 'dua <details>');
equal(hitung(SK, /<\/details>/g), 2, '</details> seimbang');
equal(hitung(SK, /<summary class="gt-card-head">/g), 2, 'dua kepala .gt-card-head');
equal(hitung(SK, /<div class="geopulse-card-body cctv-layers">/g), 2, 'dua badan .geopulse-card-body');
equal(hitung(SK, /<span class="gt-card-icon" aria-hidden="true">/g), 2, 'dua ikon');
equal(hitung(SK, /<details class="geopulse-card"/g), 2, 'dua tag pembuka details');
ok('tidak ada atribut open (kartu mulai terlipat)',
  !/<details class="geopulse-card"[^>]*\sopen[\s=>/]/.test(SK));
ok('tidak ada .cctv-card / .cctv-card-header di section Cuaca',
  !/class="cctv-card"|class="cctv-card-header"|class="cctv-card-body/.test(SK));
const kepala = SK.match(/<summary class="gt-card-head">([\s\S]*?)<\/summary>/g) || [];
equal(kepala.length, 2, 'terkumpul dua kepala untuk diperiksa');
kepala.forEach(function (k, i) {
  equal(hitung(k, /<span\b/g), 2, 'kepala ' + (i + 1) + ': ikon + satu <span> pembungkus');
  equal(hitung(k, /<b\b/g), 1, 'kepala ' + (i + 1) + ': satu judul <b>');
  equal(hitung(k, /<small\b/g), 1, 'kepala ' + (i + 1) + ': satu subjudul <small>');
});
/* Teks judul TIDAK di-hardcode: judul kartu sedang aktif disunting pengguna
 * (mis. "Layer Cuaca Maritim" -> "Cuaca Maritim"). Yang diuji kontraknya:
 * aria-labelledby menunjuk <b> yang ada, dan isinya bukan placeholder. */
function cekJudul(id, label) {
  const m = new RegExp('<b id="' + id + '">([^<]*)</b>').exec(SK);
  ok('kartu ' + label + ' punya judul <b id="' + id + '">', !!m);
  ok('judul kartu ' + label + ' tidak kosong', m && m[1].trim().length > 2, m && m[1]);
  ok('kartu ' + label + ' memakai aria-labelledby yang menunjuk judulnya',
    new RegExp('aria-labelledby="' + id + '"').test(SK));
  const sub = new RegExp('<b id="' + id + '">[^<]*</b>\\s*<small>([^<]*)</small>').exec(SK);
  ok('kartu ' + label + ' punya subjudul', sub && sub[1].trim().length > 5, sub && sub[1]);
}
cekJudul('geopulseCuacaMaritimTitle', 'Cuaca Maritim');
cekJudul('geopulseKualitasUdaraTitle', 'Kualitas Udara');
ok('kedua id kartu unik di halaman',
  hitung(HTML, /id="geopulse-cuaca-maritim"/g) === 1 && hitung(HTML, /id="geopulse-kualitas-udara"/g) === 1);
equal(hitung(HTML, /class="geopulse-card"/g), 2, 'hanya dua kartu geopulse-card di halaman');
ok('dua kartu adalah anak langsung wrapper .gempa-subtab-panel',
  !/<div class="(?!geopulse-card)[^"]*"[^>]*>\s*<details class="geopulse-card"/.test(SK));
/* Blok #weather-content (tulisannya weather-bmkg.js) tetap di atas kartu. */
ok('#weather-content tetap ada dan berada sebelum kartu pertama',
  /id="weather-content"/.test(SK) &&
  SK.indexOf('id="weather-content"') < SK.indexOf('<details class="geopulse-card"'));

/* ── 3. Id toggle layer ─────────────────────────────────────────────── */
console.log('\n3. Id toggle layer yang dirujuk banyak modul');
const idPenting = ['toggleCuacaPerairanLayer', 'toggleCuacaPelabuhanLayer', 'cuacaMaritimInfo',
  'toggleAirVisualPm25', 'toggleOpenaqPm25', 'toggleOpenaqPm10', 'toggleOpenaqPm1',
  'openaqPm25Info', 'openaqPm10Info', 'openaqPm1Info'];
idPenting.forEach(function (id) {
  ok('id ' + id + ' masih ada di section', new RegExp('id="' + id + '"').test(SK));
  ok('id ' + id + ' unik di halaman', hitung(HTML, new RegExp('id="' + id + '"', 'g')) === 1,
    hitung(HTML, new RegExp('id="' + id + '"', 'g')));
});
/* weather-content ditulis ulang oleh weather-bmkg.js. */
ok('#weather-content masih ditulis weather-bmkg.js',
  /getElementById\('weather-content'\)/.test(
    fs.readFileSync(path.join(ROOT, 'assets', 'js', 'weather-bmkg.js'), 'utf8')));

/* ── 4. Atribut data-airvisual-layer ─────────────────────────────────── */
console.log('\n4. Atribut data-airvisual-layer');
const airvisual = (SK.match(/data-airvisual-layer="([^"]*)"/g) || []).map(function (s) { return /"([^"]*)"/.exec(s)[1]; });
equal(airvisual.length, 6, 'enam toggle AirVisual');
equal(airvisual.join(','), 'airvisual-pm25,airvisual-pm10,airvisual-o3,airvisual-no2,airvisual-so2,airvisual-co',
  'nilai dan urutannya tidak berubah');
/* map-core.js melacak layer lewat atribut ini, bukan lewat id. */
ok('map-core.js masih melacak lewat data-airvisual-layer',
  /data-airvisual-layer/.test(fs.readFileSync(path.join(ROOT, 'assets', 'js', 'map-core.js'), 'utf8')));
/* Dua toggle maritim + sembilan toggle udara (6 AirVisual + 3 OpenAQ). */
equal(hitung(SK, /class="cctv-layer-toggle"/g), 11, 'sebelas toggle layer');

/* ── 5. Gaya ────────────────────────────────────────────────────────── */
console.log('\n5. Gaya di app.css');
ok('ada gaya .geopulse-card', /\.geopulse-card\s*\{/.test(CSS_KODE));
ok('ada aturan collapse :not([open])',
  /\.geopulse-card:not\(\[open\]\)\s*>\s*\.geopulse-card-body\s*\{\s*display:\s*none/.test(CSS_KODE));
ok('badan kartu punya padding 12px 13px (sama dengan kartu lain)',
  /\.geopulse-card-body\s*\{\s*padding:\s*12px 13px/.test(CSS_KODE));
ok('kartu punya border, radius, warna tema', (function () {
  const b = /\.geopulse-card\s*\{([^}]*)\}/.exec(CSS_KODE);
  return b && /border:/.test(b[1]) && /border-radius:\s*10px/.test(b[1]) && /var\(--bg-card\)/.test(b[1]);
})());
ok('kartu memakai overflow: hidden', (function () {
  const b = /\.geopulse-card\s*\{([^}]*)\}/.exec(CSS_KODE);
  return b && /overflow:\s*hidden/.test(b[1]);
})());
ok('jarak 10px antar kartu', /\.geopulse-card\s*\+\s*\.geopulse-card\s*\{\s*margin-top:\s*10px/.test(CSS_KODE));
ok('kartu pertama tidak punya margin-top sendiri',
  !/(^|[},])\s*\.geopulse-card\s*\{[^}]*margin-top/.test(CSS_KODE));
/* Jebakan nomor 4: margin bawaan .cctv-layers harus dinolkan di dalam
 * badan kartu, sementara aturan max-height-nya tetap dipakai. */
ok('.cctv-layers { margin: 12px 0 } masih ada (dipakai section lain)',
  /\.cctv-layers\s*\{\s*margin:\s*12px 0/.test(CSS_KODE));
ok('margin .cctv-layers dinolkan di dalam badan kartu',
  /\.geopulse-card-body\.cctv-layers\s*\{\s*margin:\s*0/.test(CSS_KODE));
ok('aturan max-height .gempa-subtab-panel .cctv-layers MASIH ADA',
  /\.gempa-subtab-panel\s+\.cctv-layers\s*\{[^}]*max-height:\s*35vh/.test(CSS_KODE));
/* Kelas bersama tidak boleh ikut mati. */
ok('.cctv-card MASIH ada di CSS (section lain)', /\.cctv-card\s*\{/.test(CSS_KODE));
ok('.cctv-card-header MASIH ada di CSS (section lain)', /\.cctv-card-header\s*\{/.test(CSS_KODE));
ok('.cctv-card-header svg MASIH ada di CSS', /\.cctv-card-header\s+svg\s*\{/.test(CSS_KODE));
ok('.cctv-layer-toggle MASIH ada di CSS', /\.cctv-layer-toggle\s*\{/.test(CSS_KODE));
ok('.cctv-layer-check MASIH ada di CSS', /\.cctv-layer-check\s*\{/.test(CSS_KODE));
ok('.cctv-layers MASIH ada di CSS', /\.cctv-layers\s*\{/.test(CSS_KODE));
ok('.gempa-subtabs MASIH ada di CSS', /\.gempa-subtabs\s*\{/.test(CSS_KODE));
ok('.gempa-subtab-btn MASIH ada di CSS', /\.gempa-subtab-btn\s*\{/.test(CSS_KODE));
ok('.gempa-subtab-panel MASIH ada di CSS', /\.gempa-subtab-panel\s*\{/.test(CSS_KODE));
ok('.gt-card-head TIDAK ditulis ulang', hitung(CSS, /^\.gt-card-head\s*\{/gm) === 1);
const versi = /assets\/css\/app\.css\?v=(\d+)/.exec(HTML);
ok('app.css?v= ada di markup', !!versi);
ok('versi stylesheet sudah dinaikkan', versi && Number(versi[1]) >= 64, versi && versi[1]);

/* ── 6. Keseimbangan tag ────────────────────────────────────────────── */
console.log('\n6. Keseimbangan tag di dalam section');
['div', 'details', 'summary', 'span', 'b', 'small', 'label'].forEach(function (t) {
  equal(hitung(SK, new RegExp('<' + t + '\\b', 'g')), hitung(SK, new RegExp('</' + t + '>', 'g')),
    '<' + t + '> seimbang');
});
/* Sebelas checkbox. Sebelas svg pun: tidak ada lagi ikon pita di dalam
 * kartu karena pita .cctv-card-header digantikan kepala .gt-card-head
 * yang memakai emoji. */
equal(hitung(SK, /<input\b/g), 11, 'sebelas checkbox (2 maritim + 9 udara)');
equal(hitung(SK, /<\/input>/g), 0, 'tidak ada </input> yang menganggur');
equal(hitung(SK, /<svg\b/g), 11, 'sebelas svg centang (ikon pita sudah tidak ada)');
equal(hitung(SK, /<\/svg>/g), 11, '</svg> seimbang');
equal(hitung(SK, /<polyline\b/g), 11, 'sebelas centang check');
ok('tidak ada selector #gempa-subtab-infocuaca > ... di CSS',
  !/#gempa-subtab-infocuaca\s*[>+~]/.test(CSS_KODE));
ok('dropdown GeoTools masih menunjuk panel GeoPulse',
  /<option value="geotoolsTabGeoPulse"/.test(HTML));

console.log('\n' + (fail === 0 ? 'SEMUA LULUS' : 'ADA YANG GAGAL') + ': ' + pass + ' lulus, ' + fail + ' gagal');
process.exit(fail === 0 ? 0 : 1);
