/* Uji konversi panel GeoWatch (CCTV) ke kartu collapsed .gt-card-head.
 *
 * Dua hal yang paling rawan di perubahan markup seperti ini:
 *
 *  1. KERUSAKAN CCTV. cctv.js:163 dan :170 memanggil
 *     getElementById('cctvAreaFilter'/'cctvSearchInput').addEventListener
 *     TANPA penjaga. Kalau salah satu id hilang atau berubah nama, seluruh
 *     cctv.js setelah baris itu ikut mati — termasuk
 *     toggleTollRoadLayer/toggleNonTollRoadLayer/toggleNationalRoadLayer
 *     yang dipanggil dari markup. Sidebar juga mencari .cctv-autocomplete
 *     dari dalam #cctv-search-sheet (sidebar.js:234). Semua id dan kelas
 *     itu wajib masih ada, di tempat yang bisa dicari.
 *
 *  2. KELAS BERSAMA. .cctv-card-header dipakai 14 kali di panel GeoPulse,
 *     GeoPangan, Gempa, dan Cuaca Maritime. Menghapus gayanya karena
 *     "kartu GeoWatch sudah ganti template" akan mematikan pita biru di
 *     semua panel itu tanpa error. Setiap kelas yang dihapus diuji satu
 *     per satu: boleh hilang HANYA kalau tidak ada lagi pemakaiannya.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'app.css'), 'utf8');
const CCTV_JS = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'cctv.js'), 'utf8');
const SIDEBAR_JS = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'sidebar.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}
function equal(a, b, name, extra) {
  ok(name, a === b, extra !== undefined ? extra : ('dapat ' + JSON.stringify(a) + ', harap ' + JSON.stringify(b)));
}
function hitung(teks, pola) { return (teks.match(pola) || []).length; }

/* Buang komentar HTML dan CSS sebelum memeriksa "apakah masih ada".
 * Tanpa ini, komentar dokumentasi yang menyebut .cctv-sheet-handle atau
 * toggleCctvSheet() akan terbaca sebagai kode yang masih hidup — dan
 *komentar yang sengaja ditulis justru akan membuat tes gagal selamanya. */
function tanpaKomentar(teks) {
  return teks
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/* Hanya baris kode, komentar sudah dibuang. */
const HTML_KODE = tanpaKomentar(HTML);
const CSS_KODE = tanpaKomentar(CSS);

/* Portofolio kelas yang dihapus. Untuk tiap nama, dua pertanyaan:
 * apakah masih dipakai di markup, dan apakah aturannya masih ada. */
function masihDipakai(nama) {
  return new RegExp('(class="[^"]*\\b' + nama + '\\b|\\.' + nama + '\\s*[,{>])').test(HTML_KODE);
}
function masihAdaAturan(nama) {
  return new RegExp('(^|[^\\w-])\\.' + nama + '\\s*[,{]').test(CSS_KODE);
}

/* Potong elemen beserta isinya dengan menghitung kedalaman tag. */
function potongElemen(html, dari, tag) {
  const re = new RegExp('<' + tag + '\\b|</' + tag + '>', 'g');
  re.lastIndex = dari;
  let depth = 0, m;
  while ((m = re.exec(html))) {
    if (m[0].charAt(1) === '/') {
      depth--;
      if (depth === 0) return { awal: dari, akhir: re.lastIndex, teks: html.slice(dari, re.lastIndex) };
    } else {
      depth++;
    }
  }
  return null;
}

const MULAI = '<div id="geotoolsTabGeoWatch"';
const iPanel = HTML.indexOf(MULAI);
ok('panel #geotoolsTabGeoWatch ada', iPanel !== -1);
if (iPanel === -1) process.exit(1);
const panel = potongElemen(HTML, iPanel, 'div');
ok('panel #geotoolsTabGeoWatch tertutup', !!panel);
if (!panel) process.exit(1);
const P = panel.teks;

/* ── 1. Bentuk kartu collapsed ───────────────────────────────────────── */
console.log('\n1. Kartu mengikuti template .gt-card-head');
equal(hitung(P, /<details\b/g), 1, 'panel berisi tepat satu <details>');
equal(hitung(P, /<\/details>/g), 1, '</details> seimbang');
ok('kartu memakai kelas geowatch-cctv', /<details class="geowatch-cctv"/.test(P));
ok('tanpa atribut open (mulai terlipat)',
  !/\sopen[\s=>/]/.test(P.slice(0, P.indexOf('>') + 1)), P.slice(0, 60));
ok('kepala memakai .gt-card-head', /<summary class="gt-card-head">/.test(P));
ok('kepala punya ikon .gt-card-icon', /<span class="gt-card-icon" aria-hidden="true">/.test(P));
ok('kepala punya judul <b id>', /<b id="geowatchCctvTitle">/.test(P));
ok('kepala punya subjudul <small>', /<small>Ketik lokasi atau pilih wilayah<\/small>/.test(P));
ok('kepala punya pembungkus <span> tunggal (bukan beberapa span lepas)',
  hitung(/<summary class="gt-card-head">([\s\S]*?)<\/summary>/.exec(P)[1], /<span\b/g) === 2);
ok('aria-labelledby menunjuk judul yang ada',
  /aria-labelledby="geowatchCctvTitle"/.test(P) && /id="geowatchCctvTitle"/.test(P));
ok('badan kartu memakai .geowatch-cctv-body', /<div class="geowatch-cctv-body">/.test(P));
ok('tidak ada kelas kepala per modul', !/geowatch-cctv-head|geowatch-cctv-summary/.test(P));
ok('kartu lama .cctv-search-card sudah tidak ada', !/cctv-search-card/.test(P));
ok('kelas kepala lama tidak di markup', !/class="cctv-card-header"/.test(P));

/* ── 2. Id & kelas yang HARUS tetap ada ──────────────────────────────── */
console.log('\n2. Id dan kelas yang dipanggil JavaScript');
/* Dipasangkan dengan_baris pemanggilnya, supaya kalau nama berubah di
   kedua sisi, tes ini ikut gagal (bukan diam-diam lolos). */
[
  ['cctvSearchInput', /getElementById\('cctvSearchInput'\)\.addEventListener/],
  ['cctvAreaFilter', /getElementById\('cctvAreaFilter'\)\.addEventListener/],
  ['cctvAutocomplete', /getElementById\('cctvAutocomplete'\)/],
  ['cctvStatus', /getElementById\('cctvStatus'\)/],
  ['cctvResults', /getElementById\('cctvResults'\)/]
].forEach(function (pasangan) {
  const id = pasangan[0];
  ok('id ' + id + ' masih ada di markup', new RegExp('id="' + id + '"').test(P));
  ok('id ' + id + ' masih dipanggil cctv.js', pasangan[1].test(CCTV_JS));
});

ok('id cctv-search-sheet masih ada (sidebar.js:232)',
  /id="cctv-search-sheet"/.test(P) && /getElementById\('cctv-search-sheet'\)/.test(SIDEBAR_JS));
ok('id geotoolsTabGeoWatch tidak berubah',
  /id="geotoolsTabGeoWatch"/.test(P) && (HTML.match(/geotoolsTabGeoWatch/g) || []).length >= 3);
ok('kelas geotools-main-tab-panel tetap (sidebar.js:203 mengaktifkannya)',
  /class="geotools-main-tab-panel/.test(P));
ok('dropdown GeoTools masih menunjuk panel ini',
  /<option value="geotoolsTabGeoWatch"/.test(HTML));

/* Sidebar mencari .cctv-autocomplete dari DALAM #cctv-search-sheet. */
const iSheet = P.indexOf('id="cctv-search-sheet"');
const iAuto = P.indexOf('class="cctv-autocomplete"');
const iTutupSheet = P.indexOf('</div>', iSheet);
ok('.cctv-autocomplete ada di dalam #cctv-search-sheet',
  iAuto > iSheet && iAuto < iTutupSheet, 'sheet@' + iSheet + ' auto@' + iAuto);
ok('sidebar.js masih mencari .cctv-autocomplete dari #cctv-search-sheet',
  /sheet\.querySelector\('\.cctv-autocomplete'\)/.test(SIDEBAR_JS));
ok('#cctvAutocomplete tetap anak .cctv-autocomplete (konteks posisi absolut)',
  /class="cctv-autocomplete">[\s\S]{0,220}?id="cctvAutocomplete"/.test(P));

/* ── 3. Aturan CSS ───────────────────────────────────────────────────── */
console.log('\n3. Gaya di app.css');
ok('ada gaya .geowatch-cctv', /\.geowatch-cctv\s*\{/.test(CSS));
ok('ada aturan collapse :not([open])',
  /\.geowatch-cctv:not\(\[open\]\)\s*>\s*\.geowatch-cctv-body\s*\{\s*display:\s*none/.test(CSS));
ok('badan kartu punya padding', /\.geowatch-cctv-body\s*\{\s*padding:/.test(CSS));
ok('kartu punya border + radius + warna tema', (function () {
  const blok = /\.geowatch-cctv\s*\{([^}]*)\}/.exec(CSS);
  if (!blok) return false;
  return /border:/.test(blok[1]) && /border-radius:/.test(blok[1]) && /var\(--bg-card\)/.test(blok[1]);
})());
/* overflow: visible itu wajib: daftar autocomplete diposisikan absolute
   dan harus bisa keluar dari kartu, seperti pada .cctv-search-card lama.
   Kalau berubah jadi hidden, dropdown-nya terpotong tanpa error. */
ok('kartu memakai overflow: visible (dropdown autocomplete tidak terpotong)',
  (function () {
    const blok = /\.geowatch-cctv\s*\{([^}]*)\}/.exec(CSS);
    return blok && /overflow:\s*visible/.test(blok[1]);
  })());
ok('kartu punya z-index (dropdown di atas isi kartu lain)',
  (function () {
    const blok = /\.geowatch-cctv\s*\{([^}]*)\}/.exec(CSS);
    return blok && /z-index:\s*3/.test(blok[1]);
  })());
ok('sudut atas kepala dibulatkan sendiri (kartu tidak memotong)',
  /\.geowatch-cctv\s*>\s*\.gt-card-head\s*\{[^}]*border-radius/.test(CSS));
ok('.gt-card-head TIDAK ditulis ulang (satu template kepala)',
  (CSS.match(/^\.gt-card-head\s*\{/gm) || []).length === 1);
ok('.cctv-search-body tetap ada (gaya isian tidak berubah)',
  /\.cctv-search-body\s*\{/.test(CSS) && /class="cctv-search-body"/.test(P));
ok('.cctv-search-body dipakai di dalam badan kartu', /geowatch-cctv-body[\s\S]{0,120}?cctv-search-body/.test(P));
ok('aturan gelap .cctv-search-body tetap ada',
  /\[data-theme="dark"\]\s*\.cctv-search-body input/.test(CSS));

/* ── 4. Kelas yang dihapus, dan apakah masih dipakai ────────────────── */
console.log('\n4. Kelas yang dihapus tidak boleh masih dipakai');
  /* Portofolio kelas yang dihapus. Yang boleh hilang HANYA kalau tidak
     ada pemakaiannya lagi DAN tidak ada aturannya lagi; kalau masih
     dipakai, penghapusan aturannya berarti panel lain ikut kehilangan
     gaya. */
  ['cctv-search-card', 'cctv-sheet-handle'].forEach(function (kelas) {
    ok(kelas + ' tidak ada lagi dipakai di markup', !masihDipakai(kelas));
    ok(kelas + ' tidak ada lagi aturannya di CSS', !masihAdaAturan(kelas));
    ok(kelas + ' tidak ada lagi di JS', CCTV_JS.indexOf(kelas) === -1 && SIDEBAR_JS.indexOf(kelas) === -1);
    ok(kelas + ' tidak disebut di nama fungsi/handler JS',
      !new RegExp('function\\s+\\w*' + kelas + '|\\b' + kelas + '\\b\\s*\\(').test(CCTV_JS + SIDEBAR_JS));
  });
  ok('toggleCctvSheet() dihapus dari cctv.js', CCTV_JS.indexOf('toggleCctvSheet') === -1);
  ok('tidak ada lagi pemanggil toggleCctvSheet di markup',
    !/onclick="[^"]*toggleCctvSheet/.test(HTML_KODE));
  ok('#cctv-search-sheet.sheet-open dihapus dari CSS',
    !/#cctv-search-sheet\.sheet-open/.test(CSS_KODE));
  ok('selector "#cctv-search-sheet > .cctv-card" dihapus (kartu bukan anak langsung lagi)',
    CSS_KODE.indexOf('#cctv-search-sheet > .cctv-card') === -1);

/* ── 5. Kelas bersama yang HARUS TETAP ADA ──────────────────────────── */
console.log('\n5. Kelas bersama yang TIDAK BOLEH ikut terhapus');
/* .cctv-card-header dipakai belasan kali di panel GeoPulse, GeoPangan,
   Gempa, dan Cuaca Maritime. Menghapus gayanya hanya karena "kartu
   GeoWatch sudah ganti template" akan mematikan pita biru di semua panel
   itu tanpa error sama sekali. Karena itu jumlahnya diperiksa, dan
   pemakaiannya harus berada DI LUAR panel GeoWatch. */
const pakaiHeader = [];
HTML_KODE.split('\n').forEach(function (b, i) { if (/class="cctv-card-header"/.test(b)) pakaiHeader.push(i + 1); });
ok('.cctv-card-header dipakai di banyak panel (> 5)',
  pakaiHeader.length > 5, pakaiHeader.length + ' pemakaian');
const iGW = HTML.indexOf('<div id="geotoolsTabGeoWatch"');
const iGP = HTML.indexOf('<div id="geotoolsTabGeoPulse"');
ok('tidak ada .cctv-card-header yang tersisa di panel GeoWatch',
  pakaiHeader.every(function (n) { return n < iGW || n > iGP; }),
  pakaiHeader.join(', '));
ok('gaya .cctv-card-header masih ada', /\.cctv-card-header\s*\{/.test(CSS_KODE));
ok('gaya svg di dalam .cctv-card-header masih ada', /\.cctv-card-header svg\s*\{/.test(CSS_KODE));

/* .cctv-card dipakai ulang cctv.js untuk tiap tombol hasil pencarian, jadi
   aturan .cctv-card tidak boleh ikut hilang bersama .cctv-search-card. */
ok('.cctv-card masih ada (cctv.js memakai ulang untuk tombol hasil)',
  /\.cctv-card\b\s*[,{]/.test(CSS_KODE) &&
  /cctv-card cctv-result-item/.test(CCTV_JS),
  'pemakaian di cctv.js: ' + /cctv-card cctv-result-item/.test(CCTV_JS));
ok('.cctv-result-item masih ada', /\.cctv-result-item\b/.test(CSS_KODE));

/* Aturan yang DIHAPUS di perubahan ini hanya
   ".cctv-search-card .cctv-card-body". Pemakaian .cctv-card-body lain
   ada di GeoPangan/Gempa/Cuaca dan TIDAK PERNAH berada di dalam
   .cctv-search-card, jadi mereka memang tidak pernah mendapat styling dari
   aturan itu — kehapusannya tidak mengubah apa pun bagi mereka. */
ok('aturan .cctv-search-card .cctv-card-body sudah hilang',
  !/\.cctv-search-card\s+\.cctv-card-body/.test(CSS_KODE));
ok('pemakaian .cctv-card-body lain tidak berada di panel GeoWatch',
  (function () {
    const baris = [];
    HTML_KODE.split('\n').forEach(function (b, i) { if (/class="[^"]*\bcctv-card-body\b/.test(b)) baris.push(i + 1); });
    return baris.length > 0 && baris.every(function (n) { return n < iGW || n > iGP; });
  })());

/* ── 6. Keseimbangan tag ─────────────────────────────────────────────── */
console.log('\n6. Keseimbangan tag di dalam panel');
[['div', 0], ['details', 0], ['summary', 0], ['span', 0], ['button', 0], ['select', 0], ['label', 0]]
  .forEach(function (t) {
    const tag = t[0];
    equal(hitung(P, new RegExp('<' + tag + '\\b', 'g')), hitung(P, new RegExp('</' + tag + '>', 'g')),
      '<' + tag + '> seimbang');
  });
ok('hanya satu <summary> (kepala kartu)', hitung(P, /<summary\b/g) === 1);
ok('tidak ada <h5>/<p class="geofarm-ref-group-title"> yg disalin', !/geofarm-ref-group/.test(P));
equal((HTML.match(/id="geowatchCctvTitle"/g) || []).length, 1, 'id judul kartu unik di halaman');
equal((HTML.match(/class="geowatch-cctv"/g) || []).length, 1, 'hanya satu kartu geowatch-cctv');
ok('kartu GeoFarm tidak ikut berubah', /<details class="geofarm-card"/.test(HTML) && /<details class="geofarm-ref"/.test(HTML));

console.log('\n' + (fail === 0 ? 'SEMUA LULUS' : 'ADA YANG GAGAL') + ': ' + pass + ' lulus, ' + fail + ' gagal');
process.exit(fail === 0 ? 0 : 1);
