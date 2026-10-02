/* Uji tiga kartu collapsed yang dibuat RUNTIME oleh displayWeatherInfo()
 * (assets/js/weather-bmkg.js) ke dalam #weather-content.
 *
 * Ini kasus yang berbeda dari test-geopulse-cuaca.cjs: ketiga kartu ini
 * tidak ada di index.html sama sekali,mereka dibuatkan lewat
 * template literal. Kalau markup-nya rusak, tidak ada yang gagal sampai
 * pengguna memilih sebuah wilayah dan BMKG mengembalikan data.
 *
 * Yang diperiksa:
 *  1. Ketiganya memakai template .gt-card-head dan tidak punya pita
 *     .cctv-card-header.
 *  2. Ketidakseimbangan tag yang LAMA sudah diperbaiki: template lama
 *     punya 23 <div> tapi hanya 22 </div>, jadi .cctv-card kartu prakiraan
 *     tidak pernah ditutup dan <p class="weather-source"> berakhir jadi
 *     anaknya. Sekarang harus seimbang.
 *  3. .weather-hero TETAP ada di dalam badan kartu. Aturannya color:#fff di
 *     atas gradien biru; kalau ikut hilang bersama pita lamanya, teksnya
 *     akan putih di atas putih. Yang boleh hilang hanya style margin-bawah
 *     inline-nya.
 *  4. buildTemperatureChart() mengembalikan SVG TANGAN, bukan Chart.js -
 *     jadi aman di dalam kartu terlipat tanpa bergantung pada ResizeObserver.
 *  5. Penutupan kartu prakiraan harus datang dari baris "html += ..." di
 *     SETELAH loop, karena .weather-days-grid masih menerima <article>.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const JS = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'weather-bmkg.js'), 'utf8');
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
function tanpaKomentar(t) { return t.replace(/\/\*[\s\S]*?\*\//g, ' '); }

/* Hanya fungsi displayWeatherInfo() yang hidup. displayWeatherInfoLegacy()
 * punya "let html = " juga tapi tidak punya pemanggil - tetap tidak boleh diubah dan harus
 * tetap memakai .weather-card yang lamanya. */
const AWAL = JS.indexOf('function displayWeatherInfo(data) {');
ok('displayWeatherInfo() ada', AWAL >= 0);
if (AWAL < 0) process.exit(1);
const AKHIR = JS.indexOf('if (typeof initWeatherSearch', AWAL);
const HIDUP = JS.slice(AWAL, AKHIR > 0 ? AKHIR : JS.length);
const K = tanpaKomentar(HIDUP);
const A = JS.indexOf('let html = ', AWAL);
const B = JS.indexOf('</details><p class="weather-source"', A);
const TEMPLATE = A >= 0 && B > A ? JS.slice(A, B + '</details>'.length) : '';
const LEGACY = JS.slice(JS.indexOf('function displayWeatherInfoLegacy'), AWAL);

/* ── 1. Tiga kartu mengikuti template ────────────────────────────────── */
console.log('\n1. Tiga kartu runtime mengikuti template .gt-card-head');
equal(hitung(K, /<details class="geopulse-card"/g), 3, 'tiga <details class="geopulse-card">');
equal(hitung(K, /<\/details>/g), 3, 'tiga </details>');
equal(hitung(K, /<summary class="gt-card-head">/g), 3, 'tiga kepala .gt-card-head');
equal(hitung(K, /<div class="geopulse-card-body">/g), 3, 'tiga badan .geopulse-card-body');
equal(hitung(K, /<span class="gt-card-icon" aria-hidden="true">/g), 3, 'tiga ikon');
equal(hitung(K, /aria-labelledby="weatherCard\w+"/g), 3, 'tiga aria-labelledby');
/* Tanpa atribut open, semua mulai terlipat. */
ok('tidak ada atribut open di kartu manapun',
  !/<details class="geopulse-card"[^>]*\sopen[\s=>/]/.test(K));
/* Pita lama harus benar-benar hilang. */
ok('tidak ada .cctv-card di displayWeatherInfo()', !/class="cctv-card/.test(K));
ok('tidak ada pita .cctv-card-header di displayWeatherInfo()', !/class="cctv-card-header/.test(K));
ok('setiap kartu punya tepat satu judul <b> dan satu subjudul <small>',
  hitung(K, /<b id="weatherCard\w+Title">/g) === 3 && hitung(K, /<small>/g) === 3);
ok('kedua ikon pita lama (SVG) tidak lagi ikut',
  hitung(K, /<svg\b/g) === 0, hitung(K, /<svg\b/g));

/* ── 2. Ketidakseimbangan tag lama sudah diperbaiki ─────────────────── */
console.log('\n2. Tag template seimbang');
ok('wilayah template berhasil dipotong', TEMPLATE.length > 0);
[['div', /<div\b/g], ['details', /<details\b/g], ['summary', /<summary\b/g],
  ['span', /<span\b/g], ['b', /<b\b/g], ['small', /<small\b/g], ['p', /<p\b/g]]
  .forEach(function (c) {
    const buka = hitung(TEMPLATE, c[1]);
    const tutup = hitung(TEMPLATE, new RegExp('</' + c[0] + '>', 'g'));
    equal(tutup, buka, '<' + c[0] + '> seimbang (' + buka + ')');
  });
/* Penutup kartu prakiraan harus benar-benar ada di baris html += ...,
 * karena grid-nya masih dibuka saat template diakhiri. */
ok('baris penutup menutup tiga tag: grid, badan kartu, kartu',
  /html \+= `<\/div><\/div><\/details><p class="weather-source"/.test(K));
ok('tidak ada lagi .weather-days-grid yang menggantung',
  hitung(K, /<div class="weather-days-grid">/g) === 1);

/* ── 3. Isi kartu tidak boleh ikut hilang ───────────────────────────── */
console.log('\n3. Isi yang harus tetap ada');
ok('.weather-hero tetap ada di dalam badan kartu', /class="weather-hero"/.test(K));
ok('.weather-hero tidak lagi punya margin bawah inline',
  !/class="weather-hero"[^>]*style="margin-bottom/.test(K));
ok('.weather-now + .weather-metrics tetap ada',
  /class="weather-now"/.test(K) && /class="weather-metrics"/.test(K));
ok('empat metrik tetap ada (kelembapan, angin, awan, arah)',
  hitung(K, /class="weather-metric"/g) === 4, hitung(K, /class="weather-metric"/g));
ok('.temp-chart-section tetap ada', /class="temp-chart-section"/.test(K));
ok('buildTemperatureChart() tetap dipanggil',
  /\$\{buildTemperatureChart\(forecastDays\)\}/.test(K));
ok('legenda suhu min/max tetap ada',
  /temp-chart-legend-dot" style="background:#e74c3c"/.test(K) &&
  /temp-chart-legend-dot" style="background:#3498db"/.test(K));
ok('.weather-days-grid tetap ada', /class="weather-days-grid"/.test(K));
ok('.weather-day-card tetap dibangun per hari', /<article class="weather-day-card">/.test(K));
ok('.weather-source tetap ada', /class="weather-source"/.test(K));
ok('lokasi masuk ke subjudul kartu Cuaca Sekarang',
  /<small>\$\{escapeHTML\(lokasi\.desa \|\| 'Wilayah'\)\}/.test(K));

/* ── 4. Fungsi legacy tidak boleh tersentuh ─────────────────────────── */
console.log('\n4. displayWeatherInfoLegacy() tidak tersentuh');
ok('legacy masih ada', /function displayWeatherInfoLegacy\(data\)/.test(JS));
ok('legacy masih memakai .weather-card yang lamanya', /class="weather-card"/.test(LEGACY));
ok('legacy TIDAK ikut dapat kartu collapsed', !/geopulse-card/.test(LEGACY));
ok('legacy tidak punya <details>', !/<details/.test(LEGACY));

/* ── 5. buildTemperatureChart bukan Chart.js ────────────────────────── */
console.log('\n5. Grafik suhu bukan Chart.js');
const build = JS.slice(JS.indexOf('function buildTemperatureChart'), JS.indexOf('function displayWeatherInfo(data) {'));
ok('mengembalikan SVG tangan sendiri', /<svg viewBox="0 0 \$\{W\} \$\{H\}"/.test(build));
ok('memakai preserveAspectRatio, jadi aman di kartu terlipat',
  /preserveAspectRatio="xMidYMid meet"/.test(build));
ok('tidak memakai API Chart.js', !/new Chart\(/.test(build) && !/Chart\./.test(build));
ok('pembungkus .temp-chart-container tetap ada', /class="temp-chart-container"/.test(build));

/* ── 6. Gaya ────────────────────────────────────────────────────────── */
console.log('\n6. Gaya di app.css');
const CSS_K = tanpaKomentar(CSS);
ok('#weather-content punya margin-bottom 10px (jarak ke kartu static pertama)',
  /#weather-content\s*\{\s*margin-bottom:\s*10px/.test(CSS_K));
ok('.weather-hero di dalam badan kartu dinolkan marginnya',
  /\.geopulse-card-body\s+\.weather-hero\s*\{[^}]*margin:\s*0/.test(CSS_K));
ok('.temp-chart-section di dalam badan kartu dinolkan marginnya',
  /\.geopulse-card-body\s+\.temp-chart-section\s*\{[^}]*margin:\s*0/.test(CSS_K));
/* Isi kartu ini tidak boleh dipipihkan ke gaya kartu template. */
ok('.weather-hero MASIH punya color:#fff di atas gradien',
  /\.weather-hero\s*\{[^}]*color:\s*#fff/.test(CSS_K) &&
  /\.weather-hero\s*\{[^}]*linear-gradient/.test(CSS_K));
ok('.temp-chart-section MASIH punya background sendiri',
  /\.temp-chart-section\s*\{[^}]*background:\s*#fff/.test(CSS_K));
ok('.weather-hero tidak ditulis ulang oleh .geopulse-card-body',
  !/\.geopulse-card-body\s*\.weather-hero\s*\{[^}]*color:/.test(CSS_K));
ok('.geopulse-card utuh (kartu static masih memakainya)',
  /\.geopulse-card\s*\{/.test(CSS_K) &&
  /\.geopulse-card:not\(\[open\]\)\s*>\s*\.geopulse-card-body\s*\{\s*display:\s*none/.test(CSS_K));
const versi = /assets\/css\/app\.css\?v=(\d+)/.exec(HTML);
ok('app.css?v= ada di markup', !!versi);
ok('versi stylesheet sudah dinaikkan', versi && Number(versi[1]) >= 65, versi && versi[1]);

console.log('\n' + (fail === 0 ? 'SEMUA LULUS' : 'ADA YANG GAGAL') + ': ' + pass + ' lulus, ' + fail + ' gagal');
process.exit(fail === 0 ? 0 : 1);
