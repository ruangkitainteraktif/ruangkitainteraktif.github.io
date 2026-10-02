/* Uji panel GeoNusa: nav subtab dihapus, dua isinya dipisah menjadi dua
 * kartu collapsed .gt-card-head.
 *
 * Dua jebakan yang sudah diperiksa sebelum perubahan dibuat, dan keduanya
 * masih dijaga oleh tes ini:
 *
 *  1. .geoid-subtab-panel DICARI SECARA GLOBAL.
 *     sidebar.js:184 menjalankan document.querySelectorAll('.geoid-subtab-panel')
 *     di SELURUH dokumen — bukan hanya panel GeoNusa. Kalau kartu baru masih
 *     memakai kelas itu, begitu pengguna menekan salah satu dari enam tombol
 *     Alat di panel GeoData, baris berikutnya menghapus .active dari kartu
 *     GeoNusa, dan ".geoid-subtab-panel { display:none }" menyembunyikannya
 *     permanen. Karena nav-nya dihapus, tidak ada lagi cara membukanya.
 *     openGeoidSubtab() sendiri masih hidup untuk nav Alat, jadi tidak
 *     boleh ikut dihapus.
 *
 *  2. .geoid-subtabs / .geoid-subtab-btn / .geoid-subtab-panel MASIH DIPAKAI
 *     oleh nav Alat. Nav GeoNusa yang dihapus, bukan aturannya. Menghapus
 *     CSS itu akan mematikan enam tombol Alat tanpa error.
 *
 * Id yang ditulis ulang oleh population-chart.js dan geoid-wilayah.js
 * (#geoidStatsCard, #geoidIndicatorCard, #geoidCountProv/Kab/Kec/Desa)
 * semuanya berguard di sisi JS, jadi tidak akan melempar error kalau
 * hilang — hanya jadi mati diam-diam. Yang diuji: semuanya masih ada,
 * dan atribut style inline-nya tidak berubah.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'app.css'), 'utf8');
const SIDEBAR = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'sidebar.js'), 'utf8');
const POP = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'population-chart.js'), 'utf8');
const WILAYAH = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'geoid-wilayah.js'), 'utf8');

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

const P = potongElemen(HTML, HTML.indexOf('<div id="geotoolsTabGeonusa"'), 'div');
ok('panel #geotoolsTabGeonusa ada dan tertutup', !!P);
if (!P) process.exit(1);

/* ── 1. Nav dihapus ─────────────────────────────────────────────────── */
console.log('\n1. Nav subtab dihapus');
ok('.geoid-subtabs tidak ada lagi di dalam panel GeoNusa', !/class="[^"]*\bgeoid-subtabs\b/.test(P.teks));
ok('tidak ada button.geoid-subtab-btn di panel GeoNusa', !/geoid-subtab-btn/.test(P.teks));
ok('tidak ada onclick="openGeoidSubtab" di panel GeoNusa', !/openGeoidSubtab/.test(P.teks));
ok('tidak ada data-subtab di panel GeoNusa', !/data-subtab/.test(P.teks));
ok('nav Alat di panel GeoData TETAP ada (enam tombol)',
  hitung(HTML_KODE, /class="geoid-subtab-btn[ "]/g) >= 6, hitung(HTML_KODE, /class="geoid-subtab-btn[ "]/g));
ok('nav Alat masih punya pembungkus .geoid-subtabs', /class="geoid-subtabs geotools-upload-tabs"/.test(HTML_KODE));
equal(hitung(HTML_KODE, /onclick="openGeoidSubtab\(this\)"/g), 6, 'enam pemanggil openGeoidSubtab yang tersisa');
ok('openGeoidSubtab() TIDAK dihapus (masih dipakai nav Alat)',
  /function openGeoidSubtab\(btn\)/.test(SIDEBAR) && /window\.openGeoidSubtab = openGeoidSubtab/.test(SIDEBAR));
ok('openGeoidSubtab masih menimpa .geoid-subtab-btn di induknya',
  /btn\.parentElement\.querySelectorAll\('\.geoid-subtab-btn'\)/.test(SIDEBAR));

/* ── 2. Kelas global yang JANGAN dipakai kartu baru ─────────────────── */
console.log('\n2. Kartu tidak memakai kelas yang dicari secara global');
ok('sidebar.js memang mencari .geoid-subtab-panel secara global',
  /document\.querySelectorAll\('\.geoid-subtab-panel'\)/.test(SIDEBAR));
ok('penyebabnya: querySelectorAll tanpafkultas panel',
  !/openGeoidSubtab[\s\S]{0,400}?querySelectorAll\('\.geoid-subtab-panel'\)/.test(
    SIDEBAR.replace(/document\.querySelectorAll\('\.geoid-subtab-panel'\)/, '')));
ok('kartu GeoNusa TIDAK memakai .geoid-subtab-panel', !/class="[^"]*\bgeoid-subtab-panel\b/.test(P.teks));
ok('kartu GeoNusa TIDAK memakai kelas .active', !/class="[^"]*\bactive\b/.test(P.teks));
ok('aturan .geoid-subtab-panel { display:none } masih ada (dipakai Alat)',
  /\.geoid-subtab-panel\s*\{\s*display:\s*none/.test(CSS_KODE));
ok('kartu memakai kelas sendiri .geonusa-card', hitung(P.teks, /<details class="geonusa-card"/g) === 2);

/* ── 3. Dua kartu collapsed ─────────────────────────────────────────── */
console.log('\n3. Dua kartu mengikuti template .gt-card-head');
equal(hitung(P.teks, /<details\b/g), 2, 'dua <details>');
equal(hitung(P.teks, /<\/details>/g), 2, '</details> seimbang');
equal(hitung(P.teks, /<summary class="gt-card-head">/g), 2, 'dua kepala .gt-card-head');
equal(hitung(P.teks, /<div class="geonusa-card-body">/g), 2, 'dua badan .geonusa-card-body');
equal(hitung(P.teks, /<span class="gt-card-icon" aria-hidden="true">/g), 2, 'dua ikon');
/* Tanpa atribut open, kartu mulai terlipat. */
equal(hitung(P.teks, /<details class="geonusa-card"[^>]*>/g), 2, 'dua tag pembuka details');
ok('tidak ada atribut open', !/<details class="geonusa-card"[^>]*\sopen[\s=>/]/.test(P.teks));
/* Setiap kepala punya tepat satu <span> pembungkus di luar ikon. */
equal(hitung(/<summary class="gt-card-head">([\s\S]*?)<\/summary>/.exec(P.teks)[1], /<span\b/g), 2,
  'kepala pertama: ikon + satu <span> pembungkus');
ok('judul kartu pertama ada', /<b id="geonusaStatistikTitle">Statistik Indonesia<\/b>/.test(P.teks));
ok('judul kartu kedua ada', /<b id="geonusaIndikatorTitle">Indikator Penduduk<\/b>/.test(P.teks));
ok('kedua aria-labelledby menunjuk judul yang ada',
  /aria-labelledby="geonusaStatistikTitle"/.test(P.teks) && /aria-labelledby="geonusaIndikatorTitle"/.test(P.teks));
ok('kedua subjudul <small> ada', hitung(P.teks, /<small>Ringkasan wilayah, piramida, dan generasi<\/small>/g) === 1 &&
  hitung(P.teks, /<small>Pilih indikator dan lihat peringkat provinsi<\/small>/g) === 1);
equal((HTML.match(/id="geonusaStatistikTitle"/g) || []).length, 1, 'id judul pertama unik');
equal((HTML.match(/id="geonusaIndikatorTitle"/g) || []).length, 1, 'id judul kedua unik');
equal((HTML.match(/class="geonusa-card"/g) || []).length, 2, 'hanya dua kartu geonusa-card di halaman');
ok('judul panel tetap di luar kartu',
  /GeoNusa Analysis<\/h4>[\s\S]{0,160}<details/.test(P.teks));
ok('dropdown GeoTools masih menunjuk panel ini', /<option value="geotoolsTabGeonusa"/.test(HTML));

/* ── 4. Id yang ditulis ulang oleh JS ───────────────────────────────── */
console.log('\n4. Id yang ditulis ulang population-chart.js & geoid-wilayah.js');
const idPenting = ['geoidSummaryCards', 'geoidCountProv', 'geoidCountKab', 'geoidCountKec',
  'geoidCountDesa', 'geoidStatsCard', 'geoidIndicatorCard'];
idPenting.forEach(function (id) {
  ok('id ' + id + ' masih ada di panel', new RegExp('id="' + id + '"').test(P.teks));
  ok('id ' + id + ' unik di halaman', hitung(HTML, new RegExp('id="' + id + '"', 'g')) === 1,
    hitung(HTML, new RegExp('id="' + id + '"', 'g')));
});
/* Keempat angka-geoid ditulis lewat set() yang berguard; ada di geoid-wilayah.js. */
ok('penulis #geoidCount* ada di geoid-wilayah.js dan berguard',
  /const set = \(id, val\) => \{ const el = document\.getElementById\(id\); if \(el\)/.test(WILAYAH) &&
  /geoidCountProv/.test(WILAYAH) && /geoidCountDesa/.test(WILAYAH));
/* Gerbang renderPopulationChart: kalau salah satu kartu hilang, tidak ada
 * grafik sama sekali. */
ok('gerbang renderPopulationChart lengkap',
  /if \(!statsCard \|\| !indicatorCard\) return;/.test(POP) &&
  /getElementById\('geoidStatsCard'\)/.test(POP) && /getElementById\('geoidIndicatorCard'\)/.test(POP));
ok('tidak ada getElementById tanpa penjaga untuk id geoid di population-chart.js',
  !/getElementById\('(geoid[A-Za-z]*)'\)\.(addEventListener|textContent|innerHTML|appendChild)/.test(POP),
  (POP.match(/getElementById\('(geoid[A-Za-z]*)'\)\.\w+/g) || []).join(', '));
/* Atribut inline pada span angka tidak boleh berubah: nilainya ditulis
 * JS sebagai textContent, jadi style-nya harus tetap. */
idPenting.filter(function (x) { return /^geoidCount/.test(x); }).forEach(function (id) {
  ok(id + ' menyimpan style inline yang sama',
    new RegExp('id="' + id + '" style="font-size:20px;font-weight:700;line-height:1;"').test(P.teks));
});
equal(hitung(P.teks, /class="geoid-summary-box geoid-summary-/g), 4, 'empat kotak ringkasan wilayah');
equal(hitung(P.teks, /<hr style="margin: 12px 0 16px;/g), 1, 'pemisah <hr> tetap ada');
ok('catatan sumber tetap ada', /Sumber: BIG RBI \(Rupa Bumi Indonesia\) Edisi Juni 2026/.test(P.teks));
ok('kelas isi tetap sama: geoid-summary-cards / geoid-population-card / geoid-indicator-card',
  /class="geoid-summary-cards"/.test(P.teks) && /class="geoid-population-card"/.test(P.teks) &&
  /class="geoid-indicator-card"/.test(P.teks));

/* Id subtab lama dibuang: tidak ada yang/rujinya lagi. */
ok('id geoid-subtab-statistik dibuang', P.teks.indexOf('geoid-subtab-statistik') === -1);
ok('id geoid-subtab-indikator dibuang', P.teks.indexOf('geoid-subtab-indikator') === -1);
ok('kedua id itu memang tidak dirujuk JS mana pun',
  SIDEBAR.indexOf('geoid-subtab-statistik') === -1 && SIDEBAR.indexOf('geoid-subtab-indikator') === -1 &&
  POP.indexOf('geoid-subtab-') === -1 && WILAYAH.indexOf('geoid-subtab-') === -1);

/* ── 5. Gaya ────────────────────────────────────────────────────────── */
console.log('\n5. Gaya di app.css');
ok('ada gaya .geonusa-card', /\.geonusa-card\s*\{/.test(CSS_KODE));
ok('ada aturan collapse :not([open])',
  /\.geonusa-card:not\(\[open\]\)\s*>\s*\.geonusa-card-body\s*\{\s*display:\s*none/.test(CSS_KODE));
ok('badan kartu punya padding 12px 13px (sama dengan kartu lain)',
  /\.geonusa-card-body\s*\{\s*padding:\s*12px 13px/.test(CSS_KODE));
ok('kartu punya border, radius, warna tema', (function () {
  const b = /\.geonusa-card\s*\{([^}]*)\}/.exec(CSS_KODE);
  return b && /border:/.test(b[1]) && /border-radius:\s*10px/.test(b[1]) && /var\(--bg-card\)/.test(b[1]);
})());
ok('kartu memakai overflow: hidden (aman: tidak ada popup absolute di dalam)',
  (function () { const b = /\.geonusa-card\s*\{([^}]*)\}/.exec(CSS_KODE); return b && /overflow:\s*hidden/.test(b[1]); })());
ok('jarak 10px antar kartu, sama seperti .geofarm-kalk / .geofarm-ref',
  /\.geonusa-card\s*\+\s*\.geonusa-card\s*\{\s*margin-top:\s*10px/.test(CSS_KODE));
/* Kartu pertama tidak boleh punya margin-top sendiri; jaraknya datang dari
 * paragraf pengantar, seperti .geofarm-card.
 *
 * Selector harus dikunci di awal baris isi daftar aturan: tanpa itu pola
 * /\.geonusa-card\s*\{[^}]*margin-top/ ikut cocok dengan aturan
 * ".geonusa-card + .geonusa-card { margin-top }", karena bisa mulai cocok dari
 * .geonusa-card kedua di dalam selector itu. */
ok('kartu pertama tidak punya margin-top sendiri',
  !/(^|[},])\s*\.geonusa-card\s*\{[^}]*margin-top/.test(CSS_KODE));
ok('yang punya margin-top hanya aturan "+" (kartu kedua)',
  hitung(CSS_KODE, /\.geonusa-card\s*\+\s*\.geonusa-card\s*\{[^}]*margin-top/g) === 1);
/* Aturan nav Alat harus utuh. */
ok('.geoid-subtabs masih ada', /\.geoid-subtabs\s*\{/.test(CSS_KODE));
ok('.geoid-subtab-btn masih ada', /\.geoid-subtab-btn\s*\{/.test(CSS_KODE));
ok('.geoid-subtab-btn.active masih ada', /\.geoid-subtab-btn\.active\s*\{/.test(CSS_KODE));
ok('.geotools-upload-tabs (khusus Alat) masih ada', /\.geotools-upload-tabs\b/.test(CSS_KODE));
ok('tema gelap .geoid-subtabs masih ada', /\[data-theme="dark"\]\s*\.geoid-subtabs\s*\{/.test(CSS_KODE));
ok('.gt-card-head TIDAK ditulis ulang', (CSS.match(/^\.gt-card-head\s*\{/gm) || []).length === 1);
/* Versi stylesheet harus naik supaya cache pengunjung tidak memakai CSS lama. */
const versi = /assets\/css\/app\.css\?v=(\d+)/.exec(HTML);
ok('app.css?v= ada di markup', !!versi);
ok('versi stylesheet sudah dinaikkan', versi && Number(versi[1]) >= 62, versi && versi[1]);

/* ── 6. Tidak ada selector anak langsung yang bisa pecah ───────────── */
console.log('\n6. Selector anak langsung & hal lain');
ok('tidak ada #geotoolsTabGeonusa > ... di CSS',
  !/#geotoolsTabGeonusa\s*[>+~]/.test(CSS_KODE));
/* Satu-satunya pengGESER yang bisa menyentuh kartu ini: openGeoidSubtab
 * menolak .active. Karena kartu tidak memakai kelas itu,aman. */
ok('tidak ada kelas .active di markup panel', !/class="[^"]*\bactive\b/.test(P.teks));
/* population-chart.js mengisi dua kartu lewat innerHTML. Yang berbahaya
 * hanya kalau sebuah WAHAD panel ikut jadi sasaran — isinya yang sudah
 * dirakit akan tertimpa. statsCard dan indicatorCard memang SHOULD
 * ditimpa (keduanya isi yang dihasilkan JS); sisanya variabel lokal
 * milik fungsi-fungsi pembuat grafik. */
const sasaranInner = [...new Set((POP.match(/([A-Za-z_$][\w$]*)\.innerHTML/g) || [])
  .map(function (s) { return s.split('.')[0]; }))].sort();
ok('sasaran innerHTML tidak ada yang bernama geonusa/geoid/wadah panel',
  sasaranInner.every(function (n) { return !/geonusa|geoid|panel|summary|body/i.test(n); }),
  sasaranInner.join(', '));
ok('dua sasaran yang memang boleh adalah #geoidStatsCard & #geoidIndicatorCard',
  ['indicatorCard', 'statsCard'].every(function (n) { return sasaranInner.indexOf(n) !== -1; }),
  sasaranInner.join(', '));
ok('tidak ada replaceChildren/insertAdjacentHTML di population-chart.js',
  !/replaceChildren|insertAdjacentHTML/.test(POP));
ok('kedua kartu itu persis id yang dipertahankan',
  /statsCard = document\.getElementById\('geoidStatsCard'\)/.test(POP) &&
  /indicatorCard = document\.getElementById\('geoidIndicatorCard'\)/.test(POP));
/* #tbl-search di-fokus di dalam createGenericTable; itu sudah tak aktif
 * sebelumnya (panel tersembunyi saat render 2 detik), jadi tidak berubah. */
ok('satu-satunya .focus() di population-chart.js tetap berguard',
  hitung(POP, /\.focus\(\)/g) === 1 && /if \(searchInput\)[\s\S]{0,80}?\.focus\(\)/.test(POP));
ok('tidak ada scrollIntoView di population-chart.js', !/scrollIntoView/.test(POP));

/* ── 7. Keseimbangan tag ────────────────────────────────────────────── */
console.log('\n7. Keseimbangan tag di dalam panel');
/* <hr> dan <br> adalah elemen kosong: tidak punya tag penutup, jadi
 * tidak boleh ikut dihitung sebagai "tidak seimbang". */
['div', 'details', 'summary', 'span', 'b', 'small', 'p', 'i']
  .forEach(function (t) {
    equal(hitung(P.teks, new RegExp('<' + t + '\\b', 'g')), hitung(P.teks, new RegExp('</' + t + '>', 'g')),
      '<' + t + '> seimbang');
  });
equal(hitung(P.teks, /<hr\b/g), 1, 'satu <hr> (elemen kosong, tanpa tag penutup)');
equal(hitung(P.teks, /<\/hr>/g), 0, 'tidak ada </hr> yang menganggur');
/* .geonusa-card harus menjadi anak langsung panel, mengikuti konvensi
 * kartu lain (#geotoolsTabGeoFarm > details). */
ok('kedua .geonusa-card adalah anak langsung #geotoolsTabGeonusa',
  (function () {
    const anak = P.teks.match(/<details\b/g) || [];
    return anak.length === 2 && !/class="geowatch-cctv"|class="georaster-card"/.test(P.teks);
  })());
ok('kartu panel lain tidak ikut berubah',
  /<details class="geowatch-cctv"/.test(HTML) && /<details class="georaster-card"/.test(HTML) &&
  /<details class="geofarm-card"/.test(HTML));

console.log('\n' + (fail === 0 ? 'SEMUA LULUS' : 'ADA YANG GAGAL') + ': ' + pass + ' lulus, ' + fail + ' gagal');
process.exit(fail === 0 ? 0 : 1);
