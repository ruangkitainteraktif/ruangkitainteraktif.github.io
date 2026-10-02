/* Uji konversi panel GeoRaster (id geotoolsTabDemnas) ke kartu collapsed
 * .gt-card-head.
 *
 * Feature ini sama rapuhnya dengan GeoWatch, tapi-danger-nya justru
 * berlawanan:
 *
 *  1. TIDAK ADA getElementById TANPA PENJAGA. Semua 70 titik pemanggilan
 *     di demnas-download.js berguard, jadi id yang hilang tidak akan
 *     melempar error — demnas-download.js tetap hidup tapi separuh
 *     fiturnya mati diam-diam. Test yang hanya memeriksa "id ada di
 *     markup" tidak cukup; yang diperiksa di sini adalah kecocokan
 *     dengan nama yang benar-benar dipanggil JS, dan jumlah serta nilai
 *     atribut penting.
 *
 *  2. .demnas-clip-actions > button (app.css) adalah satu-satunya
 *     selector anak langsung di panel ini. Kalau kedua tombolnya
 *     terpisah satu tingkat, aturan itu hilang dan
 *     .demnas-clip-refresh-btn { width:100% } kembali dipakai — dua
 *     tombol jadi bertumpuk penuh. Diuji lewat struktur induknya.
 *
 *  3. .geotools-2col-side yang dibuang punya position:sticky. Kalau
 *     kelas itu dipindah ke <details>, seluruh kartu ikut menempel.
 *     Test memastikan kelas itu tidak lagi muncul di markup maupun CSS.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'app.css'), 'utf8');
const DEMNAS = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'demnas-download.js'), 'utf8');
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
function anakLangsung(teks, tag) {
  const m = new RegExp('<' + tag + '\\b[^>]*>').exec(teks);
  return m ? m[0] : null;
}

const P = potongElemen(HTML, HTML.indexOf('<div id="geotoolsTabDemnas"'), 'div');
ok('panel #geotoolsTabDemnas ada dan tertutup', !!P);
if (!P) process.exit(1);

/* ── 1. Bentuk kartu ────────────────────────────────────────────────── */
console.log('\n1. Kartu mengikuti template .gt-card-head');
equal(hitung(P.teks, /<details\b/g), 1, 'panel berisi tepat satu <details>');
equal(hitung(P.teks, /<\/details>/g), 1, '</details> seimbang');
ok('kartu memakai kelas georaster-card', /<details class="georaster-card"/.test(P.teks));
ok('tanpa atribut open (mulai terlipat)',
  !/\sopen[\s=>/]/.test(P.teks.slice(0, P.teks.indexOf('>') + 1)));
ok('kepala memakai .gt-card-head', /<summary class="gt-card-head">/.test(P.teks));
ok('kepala punya .gt-card-icon', /<span class="gt-card-icon" aria-hidden="true">/.test(P.teks));
ok('kepala punya satu <span> pembungkus',
  hitung(/<summary class="gt-card-head">([\s\S]*?)<\/summary>/.exec(P.teks)[1], /<span\b/g) === 2);
ok('judul <b id="georasterCardTitle">', /<b id="georasterCardTitle">Unduh DEMNAS<\/b>/.test(P.teks));
ok('subjudul <small>', /<small>Clip batas wilayah, lalu unduh TIFF tanpa token<\/small>/.test(P.teks));
ok('aria-labelledby menunjuk judul yang ada', /aria-labelledby="georasterCardTitle"/.test(P.teks));
ok('badan kartu .georaster-card-body', /<div class="georaster-card-body">/.test(P.teks));
ok('judul panel (h4) tetap di luar kartu',
  /<h4 style="font-size:15px; margin-bottom:4px;">GeoRaster Analysis<\/h4>[\s\S]{0,200}<details/.test(P.teks));
ok('kartu lama tidak ada', !/geotools-2col-side/.test(HTML_KODE) && !/geotools-2col-side/.test(CSS_KODE));
equal((HTML.match(/id="georasterCardTitle"/g) || []).length, 1, 'id judul kartu unik');
equal((HTML.match(/class="georaster-card"/g) || []).length, 1, 'hanya satu kartu georaster-card');
ok('dropdown GeoTools masih menunjuk panel ini', /<option value="geotoolsTabDemnas">/.test(HTML));

/* ── 2. Semua id demnas* ─────────────────────────────────────────────── */
console.log('\n2. Id demnas* yang dipanggil demnas-download.js');
const dipanggil = [...new Set((DEMNAS.match(/getElementById\('(demnas[A-Za-z]*)'\)/g) || [])
  .map(function (s) { return /'([^']+)'/.exec(s)[1]; }))].sort();
/* 25 id dipanggil getElementById. Id demnas* di dalam panel ini 26;
 * sisanya demnasLoadingTitle, yang isinya ditulis lewat
 * .demnas-loading-head strong (bukan lewat id) dan memang tidak pernah
 * diambil JS. */
equal(dipanggil.length, 25, 'demnas-download.js mengambil 25 id berbeda lewat getElementById');
const idDiPanel = [...new Set((P.teks.match(/id="(demnas[A-Za-z]*)"/g) || [])
  .map(function (s) { return /"([^"]+)"/.exec(s)[1]; }))].sort();
equal(idDiPanel.length, 26, 'panel memuat 26 id demnas*');
equal(idDiPanel.filter(function (x) { return dipanggil.indexOf(x) === -1; }).join(','),
  'demnasLoadingTitle', 'hanya demnasLoadingTitle yang tidak diambil JS');
dipanggil.forEach(function (id) {
  ok('id ' + id + ' masih ada di panel', idDiPanel.indexOf(id) !== -1);
});
/* Gerbang init(): kalau salah satu hilang, tidak ada listener yang terpasang. */
ok('gerbang init() lengkap: #demnasNamobjSelect + #demnasDownloadBtn',
  /if \(!select \|\| !button\) return;/.test(DEMNAS) &&
  /id="demnasNamobjSelect"/.test(P.teks) && /id="demnasDownloadBtn"/.test(P.teks));
/* Id yang tidak diambil getElementById tetap harus ada, karena isinya
 * dibaca lewat aturan kelas induknya. */
['demnasLoadingTitle', 'demnasSearchCount', 'demnasIndexSelected', 'demnasElevationLegend']
  .forEach(function (id) {
    ok('id ' + id + ' ada walau tidak dipanggil getElementById', new RegExp('id="' + id + '"').test(P.teks));
  });

/* ── 3. Nilai & atribut yang tidak boleh berubah ─────────────────────── */
console.log('\n3. Atribut penting tidak berubah');
equal(hitung(P.teks, /<select id="demnasNamobjSelect"[^>]*size="1"/g), 1, 'demnasNamobjSelect tetap size=1');
equal(hitung(P.teks, /<select id="demnasRecommendedSelect"[^>]*size="1"/g), 1, 'demnasRecommendedSelect tetap size=1');
equal(hitung(P.teks, /<select id="demnasAdminSelect"[^>]*size="1"/g), 1, 'demnasAdminSelect tetap size=1');
equal(hitung(P.teks, /aria-live="polite"/g), 2, 'dua aria-live tetap ada (preview + loading)');
equal(hitung(P.teks, /id="demnasSearchInput"[^>]*type="search"/g), 1, 'demnasSearchInput tetap type=search');
equal(hitung(P.teks, /id="demnasAdminSearch"[^>]*type="search"/g), 1, 'demnasAdminSearch tetap type=search');
equal(hitung(P.teks, /autocomplete="off"/g), 2, 'autocomplete=off tetap di kedua input pencarian');
equal(hitung(P.teks, /id="demnasIndexSelected"[^>]*display:none/g), 1, 'demnasIndexSelected tetap display:none');
equal(hitung(P.teks, /id="demnasStatus"[^>]*display:none/g), 1, 'demnasStatus tetap display:none');
equal(hitung(P.teks, /class="cctv-message"/g), 1, 'demnasStatus tetap memakai .cctv-message');
/* Opsi clip tidak boleh berubah urutan maupun nilai. */
equal(hitung(P.teks, /<option value="4">Desa\/Kelurahan<\/option>/g), 1, 'opsi Desa/Kelurahan');
equal(hitung(P.teks, /<option value="3">Kecamatan<\/option>/g), 1, 'opsi Kecamatan');
equal(hitung(P.teks, /<option value="2">Kabupaten\/Kota<\/option>/g), 1, 'opsi Kabupaten/Kota');
equal(hitung(P.teks, /<option value="">Tanpa clip<\/option>/g), 1, 'opsi Tanpa clip');
/* Legenda elevasi: lima label, urutan sama. */
equal((/<span>0<\/span><span>500<\/span><span>1\.000<\/span><span>1\.500<\/span><span>2\.000\+<\/span>/.test(P.teks)), true,
  'legenda elevasi urut 0/500/1.000/1.500/2.000+');

/* ── 4. Aturan selector anak langsung ────────────────────────────────── */
console.log('\n4. .demnas-clip-actions tetap induk langsung dari kedua tombol');
ok('aturan CSS .demnas-clip-actions > button masih ada', /\.demnas-clip-actions\s*>\s*button\s*\{/.test(CSS_KODE));
const clip = potongElemen(P.teks, P.teks.indexOf('<div class="demnas-clip-actions">'), 'div');
ok('.demnas-clip-actions ditemukan', !!clip);
if (clip) {
  /* Buang tag pembuka div-nya dulu: yang diperiksa adalah isi dalam
   * .demnas-clip-actions, yaitu anak-anak langsungnya. */
  const isi = clip.teks.replace(/^<div class="demnas-clip-actions">\s*/, '');
  ok('#demnasClipRefreshBtn anak langsung', /^<button id="demnasClipRefreshBtn"/.test(isi));
  ok('#demnasClipResetBtn anak langsung (tanpa elem lain di antaranya)',
    /^<button id="demnasClipRefreshBtn"[\s\S]*?<\/button>\s*<button id="demnasClipResetBtn"/.test(isi),
    isi.replace(/\s+/g, ' ').slice(0, 120));
  equal(hitung(isi, /<button\b/g), 2, 'tepat dua tombol di dalam .demnas-clip-actions');
}
equal(hitung(P.teks, /class="demnas-clip-refresh-btn"/g), 1, 'demnasClipRefreshBtn masih ada');
equal(hitung(P.teks, /class="demnas-clip-reset-btn"/g), 1, 'demnasClipResetBtn masih ada');
equal(hitung(P.teks, /id="demnasClipRefreshBtn"[^>]*hidden/g), 1, 'tombol preview tetap hidden');
equal(hitung(P.teks, /id="demnasClipResetBtn"[^>]*hidden/g), 1, 'tombol reset tetap hidden');

/* ── 5. Kotak turunan ────────────────────────────────────────────────── */
console.log('\n5. Kotak turunan DEMNAS tetap utuh');
['demnas-recommendation-box', 'demnas-clip-box', 'demnas-loading-layer',
  'demnas-admin-search-wrap', 'demnas-admin-selected', 'demnas-elevation-legend',
  'demnas-preview-status', 'demnas-clip-heading', 'demnas-recommendation-heading',
  'demnas-loading-head', 'demnas-loading-track', 'demnas-loading-meta',
  'demnas-elevation-bar', 'demnas-elevation-labels', 'demnas-loading-spinner',
  'demnas-clip-actions', 'demnas-recommendation-status', 'demnas-admin-search-count']
  .forEach(function (k) {
    ok('kelas ' + k + ' masih ada di markup', new RegExp('class="[^"]*\\b' + k + '\\b').test(P.teks));
    ok('gaya .' + k + ' masih ada', new RegExp('(^|[^\\w-])\\.' + k + '\\s*[,{]').test(CSS_KODE));
  });
/* Aturan [hidden] override wajib tetap ada: .demnas-admin-search-wrap dan
 * .demnas-admin-selected memakai display:grid/flex, yang mengalahkan
 * [hidden] bawaan browser. */
ok('override [hidden] untuk .demnas-admin-search-wrap masih ada',
  /\.demnas-admin-search-wrap\[hidden\]/.test(CSS_KODE));
ok('override [hidden] untuk .demnas-admin-selected masih ada',
  /\.demnas-admin-selected\[hidden\]/.test(CSS_KODE));
ok('override [hidden] untuk .demnas-recommendation-box masih ada',
  /\.demnas-recommendation-box\[hidden\]/.test(CSS_KODE));
ok('override [hidden] untuk .demnas-loading-layer masih ada',
  /\.demnas-loading-layer\[hidden\]/.test(CSS_KODE));
ok('override [hidden] untuk .demnas-elevation-legend masih ada',
  /\.demnas-elevation-legend\[hidden\]/.test(CSS_KODE));
/* Tujuh elemen mulai tersembunyi. Yang diuji bukan jumlahnya, tapi
 * identitasnya: satu elemen yang lupa hidden akan muncul sebagai kotak
 * kosong yang aneh sebelum pengguna memilih apa pun. */
const tersembunyi = (P.teks.match(/<[^>]*(?:id|class)="[^"]*"[^>]*\shidden[^>]*>/g) || [])
  .map(function (s) { return (/id="([^"]+)"/.exec(s) || [null, '(tanpa id)'])[1]; })
  .sort();
equal(tersembunyi.join(','),
  'demnasAdminSearchWrap,demnasAdminSelected,demnasClipRefreshBtn,demnasClipResetBtn,' +
  'demnasElevationLegend,demnasLoadingLayer,demnasRecommendationBox',
  'tepat tujuh elemen, dengan identitas yang sama seperti sebelumnya');

/* ── 6. Gaya kartu ──────────────────────────────────────────────────── */
console.log('\n6. Gaya di app.css');
ok('ada gaya .georaster-card', /\.georaster-card\s*\{/.test(CSS_KODE));
ok('ada aturan collapse :not([open])',
  /\.georaster-card:not\(\[open\]\)\s*>\s*\.georaster-card-body\s*\{\s*display:\s*none/.test(CSS_KODE));
ok('badan kartu punya padding', /\.georaster-card-body\s*\{\s*padding:/.test(CSS_KODE));
ok('kartu punya border, radius, warna tema', (function () {
  const b = /\.georaster-card\s*\{([^}]*)\}/.exec(CSS_KODE);
  return b && /border:/.test(b[1]) && /border-radius:/.test(b[1]) && /var\(--bg-card\)/.test(b[1]);
})());
/* Berbeda dari GeoWatch: overflow:hidden aman karena panel ini tidak
 * punya popup absolute. Kalau diubah ke visible tidak merusak apa pun,
 * tapi hidden tetap benar karena yang perlu dipotong tepi pita kepala. */
ok('kartu memakai overflow: hidden', (function () {
  const b = /\.georaster-card\s*\{([^}]*)\}/.exec(CSS_KODE);
  return b && /overflow:\s*hidden/.test(b[1]);
})());
ok('.gt-card-head TIDAK ditulis ulang', (CSS.match(/^\.gt-card-head\s*\{/gm) || []).length === 1);
ok('catatan penerjemahan punya gaya', /\.georaster-card-note\s*\{/.test(CSS_KODE));
ok('.geotools-2col (grid) sudah dihapus', !/(^|[^\\w-])\.geotools-2col\s*[,{]/.test(CSS_KODE));
ok('.geotools-2col-side sudah dihapus dari CSS', !/\.geotools-2col-side/.test(CSS_KODE));
ok('.geotools-2col-side sudah dihapus dari markup', !/geotools-2col-side/.test(HTML_KODE));
ok('.geotools-2col-main (dipakai panel GeoData) tetap ada', /\.geotools-2col-main\s*\{/.test(CSS_KODE));
ok('.geotools-2col-main masih dipakai markup', /class="[^"]*geotools-2col-main/.test(HTML_KODE));

/* ── 7. Tidak ada selector anak langsung di panel yang rusak ─────────── */
console.log('\n7. Selector anak langsung di dalam panel');
/* Satu-satunya ">" di panel ini adalah .demnas-clip-actions > button,
 * sudah diperiksa di bagian 4. Kalau ada selector lain yang menyentuh
 * elemen panel dan memakai ">", harus ikut dicek. */
const selectorPanel = (CSS_KODE.match(/[^{}]*\bdemnas[A-Za-z-]*[^{}]*[>~][^{}]*\{/g) || [])
  .map(function (s) { return s.trim(); });
const langsung = selectorPanel.filter(function (s) { return />/.test(s); });
equal(langsung.length, 1, 'hanya .demnas-clip-actions > button yang memakai ">"',
  langsung.join(' | '));
ok('selector anak langsung yang tersisa memang .demnas-clip-actions > button',
  langsung.every(function (s) { return /\.demnas-clip-actions\s*>\s*button/.test(s); }),
  langsung.join(' | '));
ok('tidak ada #geotoolsTabDemnas > ... yang bergantung pada tingkat',
  !/#geotoolsTabDemnas\s*[>+~]/.test(CSS_KODE));

/* ── 8. Aktivasi tab ────────────────────────────────────────────────── */
console.log('\n8. Aktivasi tab tidak bergantung pada DOM terlihat');
ok('sidebar.js masih memanggil DemnasDownload.load() untuk panel ini',
  /tabId === 'geotoolsTabDemnas'[\s\S]{0,140}?DemnasDownload\.load\(\)/.test(SIDEBAR));
ok('demnas-download.js tidak membaca layout (tidak ada getBoundingClientRect/offsetHeight)',
  !/getBoundingClientRect|offsetHeight|clientHeight|getComputedStyle/.test(DEMNAS));
ok('demnas-download.js tidak memindahkan elemen panel (tidak ada appendChild pada wadah)',
  !/demnasLoadingLayer\)\.appendChild|demnasStatus\)\.appendChild|demnasRecommendationBox\)\.appendChild/.test(DEMNAS));
/* Hanya <select> yang diisi ulang oleh JS. Kalau suatu saat innerHTML atau
 * appendChild menyasar kotak/status/layer, isi panel yang baru dirakit
 * akan tertimpa — jadi di sini yang dijaga adalah "tidak ada wadah
 * panel yang jadi sasaran tul ulang". */
ok('tidak ada id demnas* yang menjadi sasaran innerHTML',
  !/getElementById\('(demnas[A-Za-z]*)'\)\.innerHTML/.test(DEMNAS));
ok('sasaran innerHTML hanya variabel select lokal',
  (DEMNAS.match(/([A-Za-z_$][\w$]*)\.innerHTML/g) || [])
    .every(function (s) { return /^(select|adminSelect)\.innerHTML$/.test(s); }),
  (DEMNAS.match(/([A-Za-z_$][\w$]*)\.innerHTML/g) || []).join(', '));
ok('sasaran appendChild hanya select, optgroup, dan <a> unduhan',
  (DEMNAS.match(/([A-Za-z_$][\w$]*)\.appendChild\(/g) || [])
    .every(function (s) { return /^(select|group|body)\.appendChild\($/.test(s); }),
  (DEMNAS.match(/([A-Za-z_$][\w$]*)\.appendChild\(/g) || []).join(', '));
ok('tidak ada replaceChildren/insertAdjacentHTML di demnas-download.js',
  !/replaceChildren|insertAdjacentHTML/.test(DEMNAS));

/* ── 9. Keseimbangan tag ────────────────────────────────────────────── */
console.log('\n9. Keseimbangan tag di dalam panel');
['div', 'details', 'summary', 'span', 'button', 'select', 'option', 'label', 'strong', 'p', 'small', 'svg']
  .forEach(function (t) {
    equal(hitung(P.teks, new RegExp('<' + t + '\\b', 'g')), hitung(P.teks, new RegExp('</' + t + '>', 'g')),
      '<' + t + '> seimbang');
  });
equal(hitung(P.teks, /<summary\b/g), 1, 'hanya satu <summary> (kepala kartu)');
ok('kartu lain tidak ikut berubah',
  /<details class="geofarm-card"/.test(HTML) && /<details class="georaster-card"/.test(HTML) &&
  /<details class="geowatch-cctv"/.test(HTML) && hitung(HTML, /<details\b/g) >= 7);

console.log('\n' + (fail === 0 ? 'SEMUA LULUS' : 'ADA YANG GAGAL') + ': ' + pass + ' lulus, ' + fail + ' gagal');
process.exit(fail === 0 ? 0 : 1);
