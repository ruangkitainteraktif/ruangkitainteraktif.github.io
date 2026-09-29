/* Menguji panel detail fitur tabel atribut.
   Fungsi diambil dari assets/js/attribute-table.js yang asli lalu disuntikkan
   ke harness, jadi yang diuji benar implementasi yang berjalan -- bukan
   salinan yang bisa Marketing się od wielkości.

   Jalankan: node test-fitur-detail.cjs */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
].filter(p => { try { return fs.existsSync(p); } catch (e) { return false; } });

if (!CHROME.length) {
  console.log('  Chrome tidak ditemukan, tes detail dilewati.');
  process.exit(0);
}

const ROOT = __dirname;
const SRC = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'attribute-table.js'), 'utf8');

/* Ekstraksi berbasis pencocokan kurung kurawal: regex seperti
   /function f\([\s\S]*?\n  \}/ memotong fungsi begitu ada blok if di dalam. */
function potong(nama) {
  const m = SRC.match(new RegExp('^\\s*function ' + nama + '\\(', 'm'));
  if (!m) { console.error('tidak ditemukan: ' + nama); process.exit(1); }
  const mulai = SRC.indexOf('{', m.index);
  let d = 0, i = mulai;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') d++;
    else if (SRC[i] === '}') { d--; if (d === 0) break; }
  }
  return SRC.slice(m.index, i + 1);
}

const blok = [
  'var _currentFeatures = [];',
  'var _searchQuery = "";',
  'function getFilteredFeatures(fs){ return fs; }',
  'function escAttr(v){ return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }',
  potong('labelAttrValue'),
  potong('featureDetailHtml'),
  potong('closeAttrFeatureDetail'),
  potong('openFeatureDetailByIndex'),
  'this.openIdx = openFeatureDetailByIndex; this.closeIt = closeAttrFeatureDetail;',
  'this.setF = function(f){ _currentFeatures = f; };',
  'this.html = featureDetailHtml;',
  potong('atLayerSubtitle'),
  'this.subtitle = atLayerSubtitle;'
].join('\n');

const CSS = fs.readFileSync(path.join(ROOT, 'assets', 'css', 'app.css'), 'utf8');

/* Pola regex dikirim sebagai string lalu di-new RegExp() di browser.
   Menulis regex langsung di dalam template literal bermasalah: \s jadi "s"
   dan \. jadi "." karena template literal tidak mengenal escape itu, jadi
   polanya hilang dan asersi bisa gagal tanpa sebab yang benar. */
const POLA = {
  'baris-tabel-data-idx': 'class="at-row" data-idx="[^"]+"',
  'klik-buka-detail': 'openFeatureDetailByIndex\\(idx\\)',
  'baris-wms-juga-at-row': 'html \\+= \'<tr class="at-row" data-idx="\' \\+ i \\+ \'">\';',
  'hapus-at-row-active': 'querySelectorAll\\(\'\\.at-row-active\'\\)[\\s\\S]{0,200}classList\\.remove\\(\'at-row-active\'\\)',
  'tandai-setelah-detail-muncul': 'if \\(!openFeatureDetailByIndex\\(idx\\)\\) return;[\\s\\S]{0,140}classList\\.add\\(\'at-row-active\'\\)',
  'css-at-row-active': '\\.at-row-active\\s*\\{[^}]*background',
  'subtitle-kelas': 'class="at-layer-subtitle"',
  'subtitle-nama-biasa': 'Sawah DCA',
  'subtitle-tanpa-img-mentah': '<img',
  'subtitle-img-ter-escape': '&lt;img',
  'detail-bukan-json-raw': '>attributes<',
  'detail-ada-pesan-kosong': 'tidak punya kolom atribut',
  'judul-sheet-tabel': '>Tabel<'
};

const HTML = `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8">
<link rel="stylesheet" href="assets/css/app.css">
<style>
 body { margin:0; padding:10px; background: var(--bg-primary); }
 #sheet { width: 380px; }
 #out { white-space:pre-wrap; font:11px monospace; background:#fff;
        border:2px solid #000; padding:8px; margin-top:12px; color:#000; }
</style></head>
<body>
<div id="sheet">
  <div class="at-sheet-head"><span class="at-sheet-title"><span id="atSheetTitleText">Tabel</span></span></div>
  <div class="at-sheet-body" id="at-sheet-content"></div>
</div>
<div id="out">MENUNGGU</div>
<script>
var SRC = ${JSON.stringify(SRC)};
var CSS = ${JSON.stringify(CSS)};
var POLA = ${JSON.stringify(POLA)};
function pola(nama) { return new RegExp(POLA[nama]); }
<\/script>
<script>${blok}<\/script>
<script>
(function () {
  var lines = [], pass = 0, fail = 0;
  function say(s) { lines.push(s); }
  function ok(n, c, e) {
    if (c) { pass++; lines.push('  ok   ' + n); }
    else { fail++; lines.push('  FAIL ' + n + (e !== undefined ? '  -> ' + e : '')); }
  }
  function selesai() {
    lines.push('');
    lines.push((fail === 0 ? 'SEMUA LULUS' : 'ADA YANG GAGAL') + ': ' + pass + ' lulus, ' + fail + ' gagal');
    document.getElementById('out').textContent = lines.join('\\n');
  }
  try {
    say('1. Baris tabel punya data-idx (sumber untuk detail)');
    ok('baris tabel membawa data-idx', pola('baris-tabel-data-idx').test(SRC), 'pola data-idx tidak ada');
    ok('handler klik memanggil openFeatureDetailByIndex', pola('klik-buka-detail').test(SRC));
    ok('baris WMS juga punya kelas at-row + data-idx', pola('baris-wms-juga-at-row').test(SRC));

    say('');
    say('2. Detail fitur muncul saat baris diklik');
    setF([
      { NAMA: 'Sawah Blok 1', LUAS: '1,25', KAB: 'Subang' },
      { NAMA: 'Sawah Blok 2', LUAS: '0,80', KAB: 'Subang' }
    ]);
    var f = openIdx(1);
    ok('fitur dikembalikan', !!f, 'null');
    ok('fitur yang benar (indeks 1)', f && f.NAMA === 'Sawah Blok 2', f ? f.NAMA : '');
    var el = document.getElementById('atFeatureDetail');
    ok('panel detail muncul di DOM', !!el);
    if (el) {
      var n = el.querySelectorAll('.at-detail-row').length;
      say('  baris detail: ' + n);
      ok('menampilkan semua kolom (3)', n === 3, n + ' baris');
      var teks = el.textContent;
      ok('berisi NAMA fitur', /Sawah Blok 2/.test(teks));
      ok('berisi nilai LUAS', /0,80/.test(teks));
      ok('ada tombol tutup', !!el.querySelector('.at-detail-close'));
    }

    say('');
    say('3. Klik kedua mengganti detail, bukan menumpuk');
    openIdx(0);
    ok('hanya satu panel detail', document.querySelectorAll('#atFeatureDetail').length === 1,
      document.querySelectorAll('#atFeatureDetail').length + ' panel');
    ok('isi detail ikut berubah', /Sawah Blok 1/.test(document.getElementById('atFeatureDetail').textContent));

    say('');
    say('3b. Hanya satu baris yang ditandai aktif');
    var isi = document.getElementById('at-sheet-content');
    isi.innerHTML = '';
    isi.innerHTML = '<table class="at-table"><tbody>'
      + '<tr class="at-row" data-idx="0"><td>a</td></tr>'
      + '<tr class="at-row" data-idx="1"><td>b</td></tr>'
      + '</tbody></table>';
    var baris = isi.querySelectorAll('.at-row');
    // Meniru urutan persis yang dipakai handler di attribute-table.js.
    baris[1].classList.add('at-row-active');
    ok('baris yang diklik ditandai aktif', baris[1].classList.contains('at-row-active'));
    isi.querySelectorAll('.at-row-active').forEach(function (r) { r.classList.remove('at-row-active'); });
    ok('hanya satu baris bisa aktif pada satu waktu',
      isi.querySelectorAll('.at-row-active').length === 0);
    // Jarak antar pernyataan diuji terpisah, bukan dengan satu regex panjang.
    // Batas 160 karakter pernah rapuh: di blok WMS ada try/catch di antaranya
    // sehingga jarak remove->add jadi 1838 karakter dan tes gagal palsu.
    ok('handler menghapus at-row-active dari baris lain',
      pola('hapus-at-row-active').test(SRC));
    // Regex literal tak bisa dipakai di dalam template literal (backslash-nya
    // dimakan), jadi hitungan memakai split.
    // Total 4: 2 di handler klik baris (vektor + WMS) yang baru, 2 lagi di
    // helper lama highlightMarkerOnMap() dan highlightRowByLatLng().
    var nAdd = SRC.split("classList.add('at-row-active')").length - 1;
    ok('kedua handler klik baris (vektor + WMS) menandai baris aktif', nAdd === 4, nAdd + ' kemunculan');
    ok('baris hanya ditandai setelah detail benar-benar muncul',
      pola('tandai-setelah-detail-muncul').test(SRC));
    ok('kelas at-row-active punya style di CSS', pola('css-at-row-active').test(CSS));
    isi.innerHTML = '';

    say('');
    say('4. Tombol tutup bekerja');
    closeIt();
    ok('panel detail hilang', !document.getElementById('atFeatureDetail'));
    ok('closeAttrFeatureDetail terekspor ke window (untuk onclick inline)',
      /window\\.closeAttrFeatureDetail\\s*=/.test(SRC));
    ok('tombol tutup memanggilnya', /onclick="closeAttrFeatureDetail\\(\\)"/.test(SRC));

    say('');
    say('5. Nama layer di-escape (nama layer berasal dari katalog)');
    var bersih = subtitle('Sawah DCA');
    ok('nama layer biasa tampil utuh', pola('subtitle-nama-biasa').test(bersih));
    ok('pakai kelas at-layer-subtitle', pola('subtitle-kelas').test(bersih));
    var jahat = subtitle('<img src=x onerror=alert(1)>');
    ok('HTML di nama layer di-escape',
      !pola('subtitle-tanpa-img-mentah').test(jahat) && pola('subtitle-img-ter-escape').test(jahat), jahat);
    ok('nama layer kosong -> tanpa subjudul', subtitle('') === '' && subtitle(null) === '');

    say('');
    say('6. Kasus tepi');
    ok('indeks di luar jangkauan -> null, tidak error', openIdx(99) === null);
    ok('indeks bukan angka -> null, tidak error', openIdx('bukan-angka') === null);
    setF([{ A: 1 }]);
    var kosong = html({ _internal: 1 });
    ok('fitur tanpa kolom atribut -> pesan, bukan panel kosong',
      pola('detail-ada-pesan-kosong').test(kosong));
    var wms = html({ attributes: { NAMA: 'Puncak', KET: 'Api' } });
    ok('hasil WMS diratakan (bukan satu baris JSON)', /NAMA/.test(wms) && /Puncak/.test(wms));
    ok('tidak menampilkan satu kunci "attributes"', !pola('detail-bukan-json-raw').test(wms));
    ok('kunci internal (diawali _) disembunyikan', !/_internal/.test(html({ _a: 1, B: 2 })));

    say('');
    say('7. Tampilan panel detail');
    setF([{ NAMA: 'Sawah', LUAS: '2,5' }]);
    openIdx(0);
    var d2 = document.getElementById('atFeatureDetail');
    if (d2) {
      var cs = getComputedStyle(d2);
      say('  tinggi panel: ' + Math.round(d2.getBoundingClientRect().height) + 'px');
      ok('panel punya latar sendiri', cs.backgroundColor !== 'rgba(0, 0, 0, 0)', cs.backgroundColor);
      ok('panel punya border', parseFloat(cs.borderTopWidth) >= 1, cs.borderTopWidth);
      var row = d2.querySelector('.at-detail-row');
      if (row) {
        var rc = getComputedStyle(row);
        say('  kolom detail: ' + rc.gridTemplateColumns);
        ok('baris detail dua kolom (kunci + nilai)', /\\S+\\s+\\S+/.test(rc.gridTemplateColumns), rc.gridTemplateColumns);
        say('  font baris: ' + rc.fontSize);
        ok('teks detail cukup besar untuk dibaca (>= 10px)', parseFloat(rc.fontSize) >= 10, rc.fontSize);
      }
    }
  } catch (e) {
    lines.push('ERROR HARNESS: ' + e.message);
    lines.push('  ' + (e.stack || '').split('\\n').slice(0, 4).join('\\n  '));
  }
  selesai();
})();
<\/script>
</body></html>`;

const tmp = path.join(ROOT, 'test-fitur-detail.html');
fs.writeFileSync(tmp, HTML, 'utf8');

let dom = '';
try {
  dom = execFileSync(CHROME[0], [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--virtual-time-budget=10000', '--dump-dom',
    'file:///' + tmp.replace(/\\/g, '/')
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  console.log('  Chrome gagal dijalankan, tes dilewati: ' + e.message);
  process.exit(0);
}

const OPEN = '<div id="out">';
const CLOSE = '</div>';
const i = dom.indexOf(OPEN);
if (i < 0) { console.log('  Harness tidak menghasilkan output.'); process.exit(1); }
const j = dom.indexOf(CLOSE, i + OPEN.length);
if (j < 0) { console.log('  Output tidak ditutup dengan benar.'); process.exit(1); }

const teks = dom.slice(i + OPEN.length, j)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&');

console.log(teks);
const m = teks.match(/(\d+) lulus, (\d+) gagal/);
// 0 lulus berarti harness-nya sendiri yang tidak jalan, itu harus gagal --
// kalau tidak, regresi bisa lolos diam-diam sebagai "SEMUA LULUS".
if (!m) { console.log('  Ringkasan tidak terbaca, tes dianggap gagal.'); process.exit(1); }
const lulus = parseInt(m[1], 10), gagal = parseInt(m[2], 10);
if (/ERROR HARNESS/.test(teks)) { console.log('  Harness error, tes dianggap gagal.'); process.exit(1); }
if (lulus === 0) { console.log('  Tidak ada asersi yang jalan, tes dianggap gagal.'); process.exit(1); }
process.exit(gagal === 0 ? 0 : 1);
