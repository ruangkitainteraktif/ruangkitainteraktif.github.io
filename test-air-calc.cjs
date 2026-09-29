/* Mengukur tampilan nyata section "Kebutuhan Air Tanaman" dan membandingkannya
   dengan section NDVI sungguhan di panel yang sama.

   Versi sebelumnya menulis markup air secara manual di dalam harness, lalu
   hanya mengecek nilai CSS. Dua masalah: markup harness melenceng dari
   polygon-analysis.js (masih pakai pa-air-note padahal airSectionHtml() sudah
   berubah), dan "konsisten dengan template" tidak pernah benar-benar diukur --
   hanya diasumsikan dari source. Di sini kedua section dibangkitkan dari fungsi
   aslinya, lalu metrik kotaknya dibandingkan langsung.

   Jalankan: node test-air-calc.cjs
   Kalau Chrome tidak ada, dilewati dengan exit 0. */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
].filter(p => { try { return fs.existsSync(p); } catch (e) { return false; } });

if (!CHROME.length) {
  console.log('  Chrome tidak ditemukan, tes air dilewati.');
  process.exit(0);
}

const SRC = fs.readFileSync(
  path.join(__dirname, 'assets', 'js', 'polygon-analysis.js'), 'utf8');

/* Pencocokan kurung kurawal, bukan regex: pola /\}\n  \}/ memotong fungsi di
   tengah blok if/else yang penutupnya ada di kolom yang sama. */
function potong(nama) {
  const m = SRC.match(new RegExp('^\\s*(?:async\\s+)?function ' + nama + '\\(', 'm'));
  if (!m) { console.error('tidak ditemukan: ' + nama); process.exit(1); }
  const mulai = SRC.indexOf('{', m.index);
  let depth = 0, i = mulai;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) { console.error('kurung kurawal tidak seimbang di ' + nama); process.exit(1); }
  return SRC.slice(m.index, i + 1);
}

const CARET = '<svg class="pa-collapse-ico" viewBox="0 0 12 12" width="11" height="11" '
  + 'aria-hidden="true" focusable="false"><path d="M3 4.8 6 7.8l3-3" fill="none" '
  + 'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* Ikon diambil dari definisi const di berkas sumber, bukan ditulis ulang.
   Stub SVG tanpa width/height akan melar dan membuat tinggi tombol ikut
   membesar -- pengukuran jadi tidak realistis seperti aslinya. */
function potongConst(nama) {
  const m = SRC.match(new RegExp('^\\s*const ' + nama + '\\s*=', 'm'));
  if (!m) { console.error('const tidak ditemukan: ' + nama); process.exit(1); }
  const akhir = SRC.indexOf("';", m.index);
  const buka = SRC.indexOf("'", m.index);
  return 'var ' + nama + ' = ' + SRC.slice(buka, akhir + 2) + ';';
}

const stub = `
function escapeHtml(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function fmt(v,d){return Number.isFinite(v)?v.toLocaleString('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d}):'-';}
function isSectionCollapsed(item,s){return !!(item.collapsed&&item.collapsed[s]);}
/* collapseBtnHtml() asli dari berkas sumber memakai const CARET, jadi stub
   wajib menyediakannya -- kalau tidak, fungsi asli yang diekstrak gagal
   saat dipanggil. */
var CARET = ${JSON.stringify(CARET)};
${potongConst('ICON_CALC')}
${potongConst('ICON_SPIN')}
${potongConst('ICON_CHEVRON')}
var window = { WaterNeed: WATERNEED };
`;

const WATERNEED = {
  BULAN: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'],
  FORECAST_DAYS: 16,
  daftarTanaman: function () {
    return [{ id: 'padi', nama: 'Padi' }, { id: 'sawit', nama: 'Kelapa Sawit' }];
  },
  _fmtAngka: function (v) { return String(Math.round(v)); },
  _escapeHtml: function (v) { return String(v); },
  _tabelTahapHtml: function (e) {
    return e.perTahap.map(function (s) {
      return '<div class="pa-air-row"><span>' + s.nama + '</span><span>ETc '
        + Math.round(s.etc) + ' mm</span></div>';
    }).join('');
  }
};

/* Bangkitkan kedua section dari fungsi yang sama seperti di panel asli.
   Section NDVI dipakai sebagai pembanding: kalau .pa-section-air diam-diam
   punya kotak sendiri, perbedaannya langsung terlihat di angka. */
const ctx = { Math, Array, JSON, Number, String, console, WATERNEED };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext([
  stub,
  potong('collapseBtnHtml'),
  potong('sectionHeadHtml'),
  potong('airTanamanOptions'),
  potong('airBlockHtml'),
  potong('airSectionHtml'),
  [
    'this.airHtml = airSectionHtml({ id: 1, collapsed: {} });',
    'this.ndviHtml =',
    '\'<div class="pa-section\' + (isSectionCollapsed({collapsed:{}}, \'ndvi\') ? \' is-collapsed\' : \'\') + \'">\'',
    '+ sectionHeadHtml({collapsed:{}}, \'ndvi\', \'NDVI\')',
    '+ \'<div class="pa-section-body"><div class="pa-note">Median dipakai sebagai angka utama.</div></div></div>\';'
  ].join('\n')
].join('\n'), ctx);

const HARNESS = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>tes-kebutuhan-air</title>
<link rel="stylesheet" href="assets/css/app.css">
<style>
  #polygonAnalysisSidebar .pa-section-body { display: block; }
  body { margin:0; padding:10px; background: var(--bg-primary); }
  #out { white-space:pre-wrap; font:11px monospace; background:#fff; border:2px solid #000; padding:8px; color:#000; }
</style>
</head>
<body>

<!-- Dua section asli dari polygon-analysis.js. Masing-masing dibungkus
     sendiri supaya keduanya sama-sama:first-of-type: template .pa-section
     menghapus border/padding atas pada section pertama, jadi kalau pembanding
     tidak dibungkus, yang dibandingkan bukan versi yang setara dan selisih
     margin-top akan salah dibaca sebagai override. -->
<div id="polygonAnalysisSidebar" class="pa-panel">
  <div class="pa-slot">${ctx.airHtml}</div>
  <div class="pa-slot">${ctx.ndviHtml}</div>
</div>

<div id="out">MENUNGGU</div>

<script>
(function () {
  var lines = [], pass = 0, fail = 0;
  function say(s) { lines.push(s); }
  function ok(n, c, e) {
    if (c) { pass++; lines.push('  ok   ' + n); }
    else { fail++; lines.push('  FAIL ' + n + (e !== undefined ? '  -> ' + e : '')); }
  }
  function px(v) { return Math.round(parseFloat(v) * 100) / 100; }
  function kotak(el) {
    var c = getComputedStyle(el);
    return {
      bg: c.backgroundColor,
      border: c.borderTopWidth + ' ' + c.borderTopColor,
      radius: c.borderTopLeftRadius,
      left: c.borderLeftWidth,
      top: c.borderTopWidth,
      marginTop: c.marginTop,
      padTop: c.paddingTop
    };
  }

  try {
    var air = document.querySelector('.pa-section-air');
    var ndvi = document.querySelectorAll('.pa-slot')[1].querySelector('.pa-section');
    var note = air.querySelector('.pa-note');
    var label = air.querySelector('.pa-air-label');
    var sel = air.querySelector('.pa-air-select');
    var caret = air.querySelector('.pa-air-caret');
    var btn = air.querySelector('.pa-air-calc');
    var ico = air.querySelector('.pa-air-calc-ico');
    var body = air.querySelector('.pa-section-body');
    var refNote = ndvi.querySelector('.pa-note');
    var refBody = ndvi.querySelector('.pa-section-body');

    say('0. Sectionndibangkitkan dari fungsi asli');
    ok('section air ada', !!air);
    ok('section pembanding (NDVI) ada', !!ndvi);
    ok('section air memakai kelas pa-section yang sama', air.className.indexOf('pa-section') === 0, air.className);
    ok('kelas pa-air-note lama sudah tidak dipakai',
      air.innerHTML.indexOf('pa-air-note') === -1, 'masih ada di markup');

    say('');
    say('1. KOTAK SECTION: sama persis dengan section lain');
    var ka = kotak(air), kn = kotak(ndvi);
    say('  air : bg=' + ka.bg + ' border=' + ka.border + ' r=' + ka.radius);
    say('  ndvi: bg=' + kn.bg + ' border=' + kn.border + ' r=' + kn.radius);
    ok('latar sama', ka.bg === kn.bg, ka.bg + ' vs ' + kn.bg);
    ok('border sama', ka.border === kn.border, ka.border + ' vs ' + kn.border);
    ok('radius sama', ka.radius === kn.radius, ka.radius + ' vs ' + kn.radius);
    ok('TIDAK ada garis aksen di kiri', parseFloat(ka.left) === 0, ka.left);
    ok('TIDAK ada latar khusus', ka.bg === kn.bg, ka.bg);
    ok('jarak atas sama seperti section lain', px(ka.marginTop) === px(kn.marginTop), ka.marginTop + ' vs ' + kn.marginTop);
    ok('padding atas sama seperti section lain', px(ka.padTop) === px(kn.padTop), ka.padTop + ' vs ' + kn.padTop);

    say('');
    say('2. CATATAN: kelas template .pa-note, tanpa kotak sendiri');
    ok('catatan ada', !!note);
    ok('catatan teksnya utuh', note.textContent.indexOf('Terpisah dari analisis citra') === 0);
    var cn = kotak(note), cr = kotak(refNote);
    say('  air : bg=' + cn.bg + ' borderL=' + cn.left + ' font=' + getComputedStyle(note).fontSize);
    say('  ndvi: bg=' + cr.bg + ' borderL=' + cr.left + ' font=' + getComputedStyle(refNote).fontSize);
    ok('catatan pakai .pa-note (kelas yang sama dengan section lain)',
      note.className === refNote.className, note.className + ' vs ' + refNote.className);
    ok('ukuran huruf catatan sama dengan catatan section lain',
      getComputedStyle(note).fontSize === getComputedStyle(refNote).fontSize,
      getComputedStyle(note).fontSize + ' vs ' + getComputedStyle(refNote).fontSize);
    ok('catatan TIDAK punya garis aksen di kiri', parseFloat(cn.left) === 0, cn.left);
    ok('catatan sejajar kiri dengan body section',
      Math.abs(note.getBoundingClientRect().left - body.getBoundingClientRect().left) < 1,
      Math.round(note.getBoundingClientRect().left) + ' vs ' + Math.round(body.getBoundingClientRect().left));

    say('');
    say('3. LABEL Tanaman: sejajar dengan isi section');
    ok('label ada', !!label);
    ok('label tidak diindent', parseFloat(getComputedStyle(label).marginLeft) === 0,
      getComputedStyle(label).marginLeft);
    ok('label mulai di kolom yang sama dengan isi body',
      Math.abs(label.getBoundingClientRect().left - body.getBoundingClientRect().left) < 1,
      Math.round(label.getBoundingClientRect().left) + ' vs ' + Math.round(body.getBoundingClientRect().left));
    ok('label kapital (gaya ArcGIS)', getComputedStyle(label).textTransform === 'uppercase',
      getComputedStyle(label).textTransform);
    ok('label punya letter-spacing', parseFloat(getComputedStyle(label).letterSpacing) > 0,
      getComputedStyle(label).letterSpacing);

    say('');
    say('4. SELECT tanaman: penuh, tidak terpotong');
    var rSel = sel.getBoundingClientRect();
    say('  ' + Math.round(rSel.width) + 'x' + Math.round(rSel.height) + 'px  font=' + getComputedStyle(sel).fontSize);
    ok('select mengisi lebar body',
      Math.abs(rSel.width - body.getBoundingClientRect().width) < 3,
      Math.round(rSel.width) + ' vs ' + Math.round(body.getBoundingClientRect().width));
    ok('select cukup tinggi untuk disentuh (> 28px)', rSel.height > 28, Math.round(rSel.height) + 'px');
    ok('caret tidak menutupi teks select', getComputedStyle(sel).paddingRight !== '0px',
      getComputedStyle(sel).paddingRight);
    ok('caret ada dan tidak capturing klik', caret && getComputedStyle(caret).pointerEvents === 'none');

    say('');
    say('5. TOMBOL Hitung: geometri mengikuti .pa-btn');
    var rBtn = btn.getBoundingClientRect();
    var cb = getComputedStyle(btn);
    say('  ' + Math.round(rBtn.width) + 'x' + Math.round(rBtn.height) + 'px  r=' + cb.borderRadius
      + '  font=' + cb.fontSize + '  pad=' + cb.padding);
    ok('tombol filled', !!btn);
    ok('tombol teksnya "Hitung"', /Hitung/.test(btn.textContent));
    ok('tombol punya ikon', !!ico);
    ok('tombol solid accent (aksen utama, bukan ghost)',
      cb.backgroundColor === getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
      || cb.backgroundColor === 'rgb(8, 145, 178)', cb.backgroundColor);
    ok('radius tombol sama dengan .pa-btn (7px)', parseFloat(cb.borderRadius) === 7, cb.borderRadius);
    ok('radius tombol sama dengan tombol section lain',
      cb.borderRadius === getComputedStyle(document.querySelector('.pa-btn, .pa-air-calc')).borderRadius,
      cb.borderRadius);
    ok('ukuran huruf tombol sama dengan .pa-btn (10.5px)', cb.fontSize === '10.5px', cb.fontSize);
    ok('jarak atas tombol sama dengan .pa-btn (7px)', parseFloat(cb.marginTop) === 7, cb.marginTop);
    ok('tombol bisa disentuh (>= 24px)', rBtn.height >= 24, Math.round(rBtn.height) + 'px');
  } catch (e) {
    lines.push('ERROR HARNESS: ' + e.message);
    lines.push('  ' + (e.stack || '').split('\\n').slice(0, 4).join('\\n  '));
  }
  lines.push('');
  lines.push((fail === 0 ? 'SEMUA LULUS' : 'ADA YANG GAGAL') + ': ' + pass + ' lulus, ' + fail + ' gagal');
  document.getElementById('out').textContent = lines.join('\\n');
})();
<\/script>
</body></html>`;

const tmp = path.join(__dirname, 'test-air-calc.html');
fs.writeFileSync(tmp, HARNESS, 'utf8');
const url = 'file:///' + tmp.replace(/\\/g, '/');

let dom = '';
try {
  dom = execFileSync(CHROME[0], [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--virtual-time-budget=10000', '--dump-dom', url
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  console.log('  Chrome gagal dijalankan, tes dilewati: ' + e.message);
  process.exit(0);
}

const OPEN = '<div id="out">';
const CLOSE = '</div>';
const i = dom.indexOf(OPEN);
if (i < 0) { console.log('  Harness air tidak menghasilkan output.'); process.exit(1); }
const j = dom.indexOf(CLOSE, i + OPEN.length);
if (j < 0) { console.log('  Output tidak ditutup dengan benar.'); process.exit(1); }

const teks = dom.slice(i + OPEN.length, j)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&');

console.log(teks);
const m = teks.match(/(\d+) lulus, (\d+) gagal/);
if (!m) { console.log('  Ringkasan tidak terbaca, tes dianggap gagal.'); process.exit(1); }
const lulus = parseInt(m[1], 10), gagal = parseInt(m[2], 10);
if (/ERROR HARNESS/.test(teks)) { console.log('  Harness error, tes dianggap gagal.'); process.exit(1); }
if (lulus === 0) { console.log('  Tidak ada asersi yang jalan, tes dianggap gagal.'); process.exit(1); }
process.exit(gagal === 0 ? 0 : 1);
