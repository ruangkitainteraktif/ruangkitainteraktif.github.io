/* Uji sheet GeoData di Chrome sungguhan.
 *
 * Yang diuji di sini, dan hanya bisa diuji di browser: apakah sheet GeoData
 * benar-benar muncul sebagai panel sisi kanan seperti sheet tabel, legenda,
 * dan alat & ukur - bukan sekadar ada di DOM.
 *
 * Latar belakang. Sheet GeoData sempat memakai kelas milik GeoTools
 * (gs-sheet-* dan geotools-sheet-open). Dua masalahnya:
 *
 *  1. SEMUA aturan .gs-sheet-* di app.css di-scope ke #geotools-sheet, jadi
 *     tidak satu pun yang mengenai sheet GeoData - panelnya jadi tanpa
 *     position, tanpa gaya kepala, tanpa body yang bisa digulir.
 *  2. bodyOpen/bodyMin ditoggle ke <body> oleh sheet-drag.js, jadi GeoData
 *     memasang dan melepas kelas milik GeoTools di <body>.
 *
 * Test ini tidak memuat Leaflet dan tidak menjalankan SheetDrag. Yang
 * dilakukan adalah meniru apa yang dilakukan SheetDrag - memasang
 * geodata-sheet-open pada sheet DAN pada <body> - lalu mengukur hasilnya.
 *
 * PENTING: setiap pergantian kelas sengaja menunggu transition selesai
 * (450ms). Aturan sheet punya "transition: transform .3s, visibility .3s",
 * dan visibility ikut dianimasikan - nilainya tetap "hidden" selama transisi
 * baru berubah di akhir. Versi pertama tes ini mengukur langsung setelah
 * kelas dipasang dan melaporkan sheet "tidak terlihat" padahal semua
 * aturannya benar. Mengukur pada t=0 akan selalu gagal.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = __dirname;
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
].filter(function (p) { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!CHROME.length) { console.log('Chrome tidak ditemukan, dilewati.'); process.exit(0); }

const TIPE = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml'
};

function potongElemen(html, dari, tag) {
  const re = new RegExp('<' + tag + '\\b|</' + tag + '>', 'g');
  re.lastIndex = dari;
  let d = 0, m;
  while ((m = re.exec(html))) {
    if (m[0].charAt(1) === '/') { d--; if (d === 0) return html.slice(dari, re.lastIndex); }
    else d++;
  }
  return '';
}

function halaman() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  /* Sheet GeoData, isi host-nya, dan sheet GeoTools sebagai pembanding -
   * semuanya apa adanya dari markup, supaya yang diukur benar-benar CSS
   * yang dipakai aplikasi. */
  const sheet = potongElemen(html, html.indexOf('<div id="geodata-sheet"'), 'div');
  const host = potongElemen(html, html.indexOf('<div id="geodata-panel-host"'), 'div');
  const gts = potongElemen(html, html.indexOf('<div id="geotools-sheet"'), 'div');
  /* #tab-geotools ikut dibawa supaya onOpen sheet GeoTools bisa dicoba
   * sungguhan: itu yang membuktikan host GeoData tidak ikut terseret. */
  const tabGeotools = potongElemen(html, html.indexOf('<div id="tab-geotools"'), 'div');
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<link rel="stylesheet" href="/assets/css/app.css">
<style>
body{margin:0;background:var(--bg-primary)}
.leaflet-bottom.leaflet-right{position:fixed;right:0;bottom:0;width:40px;height:40px;background:#cbd5e1}
.map-fab-wrap{position:fixed;right:12px;bottom:12px;width:44px;height:44px;background:#94a3b8}
.petadasar-export-block{position:fixed;left:12px;bottom:12px;width:44px;height:44px;background:#a5b4fc}
img{max-width:100%}
/* Transisi DIMATIKAN khusus untuk harness ini.
 *
 * Aturan sheet memang punya "transition: transform .3s, visibility .3s",
 * dan visibility ikut dianimasikan: nilainya tetap "hidden" sampai transisi
 * berakhir. Ketika chrome dijalankan dengan --virtual-time-budget, virtual
 * time melaju jauh lebih cepat dari jam animasi, jadi setTimeout(450) bisa
 * selesai sementara transisi 300ms belum - hasilnya pengukuran yang
 * bergantian-gantian antar jalannya tes, bukan aturan yang salah.
 * Yang diuji di sini adalah NILAI AKHIR aturan CSS, jadi transisi dimatikan
 * supaya pengukurannya deterministik. */
*, *::before, *::after { transition: none !important; animation: none !important; }
</style></head><body>
<div class="leaflet-bottom leaflet-right"></div>
<div class="map-fab-wrap"></div>
<div class="petadasar-export-block"></div>
${sheet}
${gts}
${host}
${tabGeotools}
<script>
window.__r = { S: 0, F: 0, catat: [] };
function ok(n, c, e) { if (c) { window.__r.S++; } else { window.__r.F++; window.__r.catat.push('GAGAL ' + n + ' :: ' + (e === undefined ? '' : e)); } return !!c; }
function catat(n, v) { window.__r.catat.push(n + ' = ' + v); }
function equal2(a, b, n) { ok(n, a === b, 'dapat ' + a + ', harap ' + b); }
var TUNDA = 450; /* transition sheet 300ms + jeda */
function tidur(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* Meniru SheetDrag: openClass/minClass ke sheet, bodyOpen/bodyMin ke <body>. */
function setSheet(sheetId, openClass, minClass, bodyOpen, bodyMin, aktif) {
  var sh = document.getElementById(sheetId);
  sh.classList.remove(openClass);
  sh.classList.remove(minClass);
  sh.classList.add(aktif ? openClass : minClass);
  document.body.classList.toggle(bodyOpen, !!aktif);
  document.body.classList.toggle(bodyMin, !aktif);
}
/* onOpen sheet GeoData memindahkan isi host ke body. */
function pindahkanHost() {
  var body = document.getElementById('geodataSheetBody');
  var host = document.getElementById('geodata-panel-host');
  while (host.firstChild) body.appendChild(host.firstChild);
}

window.addEventListener('load', async function () {
  try {
    var sheet = document.getElementById('geodata-sheet');
    var gts = document.getElementById('geotools-sheet');
    var body = document.getElementById('geodataSheetBody');
    var head = sheet.querySelector('.geodata-sheet-head');
    var judul = sheet.querySelector('.geodata-sheet-title');
    var minBtn = sheet.querySelector('.geodata-sheet-minimize');
    var closeBtn = sheet.querySelector('.geodata-sheet-close');
    var ctrl = document.querySelector('.leaflet-bottom.leaflet-right');

    /* 0. Sebelum dibuka: tersembunyi di luar layar. */
    var cs0 = getComputedStyle(sheet);
    ok('sebelum dibuka sheet tidak terlihat', cs0.visibility === 'hidden', cs0.visibility);
    ok('sebelum dibuka sheet bergeser ke kanan', cs0.transform !== 'none' && cs0.transform !== 'none ');

    /* 0b. Host HANYA tempat parkir: tidak boleh men tampilkan GeoData
     * Analysis di tempatnya. Tanpa ini, panelnya bocor ke sidebar tepat di
     * bawah isi tab GeoTools - user melihat "GeoData Analysis" dua kali. */
    var host0 = document.getElementById('geodata-panel-host');
    ok('host ada di markup', !!host0);
    ok('host tidak punya kotak (display:none)',
      getComputedStyle(host0).display === 'none', getComputedStyle(host0).display);
    var bocor = host0.querySelector('#geotoolsTabMuatData');
    ok('panel GeoData Analysis ada di dalam host', !!bocor);
    ok('panel GeoData Analysis TIDAK ter-render di dalam host',
      bocor.getClientRects().length === 0, bocor.getClientRects().length);
    var judulBocor = host0.querySelector('#geotoolsTabMuatData h4');
    ok('judul GeoData Analysis tidak terlihat di host',
      judulBocor.getClientRects().length === 0);
    ok('enam tombol Alat tidak ter-render di host',
      host0.querySelectorAll('[data-subtab^="alat-tab-"]').length === 6 &&
      Array.prototype.every.call(host0.querySelectorAll('[data-subtab^="alat-tab-"]'), function (e) {
        return e.getClientRects().length === 0;
      }));

    /* 0c. Host juga tidak boleh ikut terseret ke sheet GeoTools. */
    var bodyGts = document.getElementById('geotoolsSheetBody');
    var nodes = Array.prototype.slice.call(document.getElementById('tab-geotools').childNodes);
    nodes.forEach(function (n) {
      if (n.nodeType === 1 && n.id === 'geodata-panel-host') return;
      bodyGts.appendChild(n);
    });
    ok('sheet GeoTools TIDAK memuat panel GeoData Analysis',
      bodyGts.querySelector('#geotoolsTabMuatData') === null);
    ok('sheet GeoTools TIDAK memuat host GeoData',
      bodyGts.querySelector('#geodata-panel-host') === null);
    ok('sheet GeoTools tetap memuat dropdown-nya',
      bodyGts.querySelector('.geotools-dropdown') !== null);
    ok('sheet GeoTools tetap memuat 9 panel tab',
      bodyGts.querySelectorAll('.geotools-main-tab-panel').length === 9,
      bodyGts.querySelectorAll('.geotools-main-tab-panel').length);
    /* Dikembalikan supaya langkah berikutnya mengukur kondisi bersih. */
    while (bodyGts.firstChild) document.getElementById('tab-geotools').appendChild(bodyGts.firstChild);

    /* 1. Buka, lalu tunggu transisi selesai sebelum mengukur. */
    pindahkanHost();
    setSheet('geodata-sheet', 'geodata-sheet-open', 'geodata-sheet-minimized',
      'geodata-sheet-open', 'geodata-sheet-minimized', true);
    await tidur(TUNDA);

    var cs = getComputedStyle(sheet);
    var rs = sheet.getBoundingClientRect();
    ok('sheet menjadi terlihat setelah transisi', cs.visibility === 'visible', cs.visibility);
    ok('sheet tidak lagi bergeser ke luar layar', rs.right <= window.innerWidth + 1,
      Math.round(rs.left) + '-' + Math.round(rs.right));
    ok('sheet menempel di kanan', Math.round(rs.right) === Math.round(window.innerWidth - 12),
      Math.round(rs.right) + ' vs ' + (window.innerWidth - 12));
    ok('sheet punya lebar template 380px', Math.round(rs.width) === 380, Math.round(rs.width));
    ok('tinggi sheet mengisi ruang vertikal', rs.height > window.innerHeight * 0.6, Math.round(rs.height));
    ok('sheet jadi kolom flex', cs.display === 'flex' && cs.flexDirection === 'column', cs.display + '/' + cs.flexDirection);

    /* 2. Kepala: judul + tombol bulat 28px di kanan. */
    ok('kepala sheet tampil', getComputedStyle(head).display === 'flex', getComputedStyle(head).display);
    ok('kepala punya tinggi wajar', head.getBoundingClientRect().height > 30, Math.round(head.getBoundingClientRect().height));
    ok('judul GeoData terbaca', judul.textContent.trim() === 'GeoData', judul.textContent);
    ok('judul punya ikon', judul.querySelector('svg') !== null);
    ok('judul tidak melapisi body (flex-shrink:0)', getComputedStyle(head).flexShrink === '0', getComputedStyle(head).flexShrink);
    [['minimalkan', minBtn], ['tutup', closeBtn]].forEach(function (t) {
      var r = t[1].getBoundingClientRect();
      ok('tombol ' + t[0] + ' ter-render', r.width > 0, Math.round(r.width) + 'x' + Math.round(r.height));
      ok('tombol ' + t[0] + ' berbentuk bulat 28px', Math.round(r.width) === 28 && Math.round(r.height) === 28,
        Math.round(r.width) + 'x' + Math.round(r.height));
      ok('tombol ' + t[0] + ' ada di kanan kepala', r.left > rs.left + rs.width - 90, Math.round(r.left));
    });

    /* 3. Body: bisa digulir, memuat isi GeoData. */
    var cb = getComputedStyle(body);
    ok('body sheet tampil', cb.display !== 'none', cb.display);
    ok('body sheet bisa digulir', cb.overflowY === 'auto' || cb.overflowY === 'scroll', cb.overflowY);
    ok('body sheet punya padding template', cb.paddingLeft === '16px' && cb.paddingTop === '12px', cb.padding);
    ok('isi GeoData sudah pindah ke body sheet', body.querySelector('#geotoolsTabMuatData') !== null);
    ok('enam tombol Alat ter-render di dalam sheet',
      body.querySelectorAll('[data-subtab^="alat-tab-"]').length === 6,
      body.querySelectorAll('[data-subtab^="alat-tab-"]').length);
    var aktif = body.querySelector('.geoid-subtab-btn.active');
    ok('subtab aktif ter-render', !!aktif && aktif.getClientRects().length > 0, aktif && aktif.textContent.trim());
    var h4 = body.querySelector('#geotoolsTabMuatData h4');
    ok('judul GeoData Analysis terlihat',
      !!h4 && h4.getClientRects().length > 0 && h4.textContent.indexOf('GeoData Analysis') === 0,
      h4 && h4.textContent);
    ok('host jadi kosong setelah dipindah',
      document.getElementById('geodata-panel-host').children.length === 0);

    /* 3b. Grid subtab: 3 kolom x 2 baris, dan lebih kecil dari sebelumnya.
     *
     * Sebelumnya pakai repeat(auto-fit, minmax(112px, 1fr)). Di sheet 380px
     * (konten ~348px) auto-fit hanya menghasilkan 2 kolom -
     * (348 + 8) / (112 + 8) = 2,96 -> 2 - sehingga 6 tombol jadi 2x3.
     * Sekarang dikunci repeat(3, 1fr). */
    var grid = body.querySelector('.geotools-upload-tabs');
    ok('nav subtab Alat ada', !!grid);
    var gcs = getComputedStyle(grid);
    equal2(gcs.gridTemplateColumns.split(' ').filter(Boolean).length, 3, 'tepat 3 kolom');
    var btn = Array.prototype.slice.call(grid.querySelectorAll('.geoid-subtab-btn'));
    equal2(btn.length, 6, 'enam tombol');
    /* Jumlahkan per baris dari posisi atas, bukan dari indeks. */
    var atas = btn.map(function (b) { return Math.round(b.getBoundingClientRect().top); });
    var baris = atas.filter(function (v, i) { return atas.indexOf(v) === i; });
    equal2(baris.length, 2, 'tepat 2 baris');
    baris.forEach(function (t, i) {
      equal2(atas.filter(function (v) { return v === t; }).length, 3, 'baris ' + (i + 1) + ' berisi 3 tombol');
    });
    /* Tidak ada tombol yang meluber keluar kotaknya (white-space: nowrap). */
    var gb = grid.getBoundingClientRect();
    var bocorGrid = btn.filter(function (b) {
      var r = b.getBoundingClientRect();
      return r.width > 0 && (r.left < gb.left - 1 || r.right > gb.right + 1);
    });
    equal2(bocorGrid.length, 0, 'tidak ada tombol yang keluar dari grid');
    /* Lebih kecil: tinggi tiap tombol turun dari 72px ke <= 62px, dan
     * tinggi grid turun dari ~232px (2x3) ke ~128px (2x2... 2 baris). */
    ok('tinggi tombol lebih kecil dari sebelumnya (72px)', btn[0].getBoundingClientRect().height <= 62,
      Math.round(btn[0].getBoundingClientRect().height));
    ok('tinggi grid 2 baris di bawah 150px', grid.getBoundingClientRect().height < 150,
      Math.round(grid.getBoundingClientRect().height));
    catat('tinggi tombol subtab', Math.round(btn[0].getBoundingClientRect().height));
    catat('tinggi grid subtab', Math.round(grid.getBoundingClientRect().height));
    catat('lebar satu tombol', Math.round(btn[0].getBoundingClientRect().width));
    /* Teks panjang "ArcGIS REST" tidak boleh terpotong. textContent diawali
     * newline + spasi (karena <svg> tidak punya teks), jadi harus di-trim. */
    var labelPanjang = btn.filter(function (b) { return b.textContent.trim().indexOf('ArcGIS') === 0; })[0];
    ok('tombol berlabel terpanjang ditemukan', !!labelPanjang);
    ok('label terpanjang muat di kolomnya',
      labelPanjang.scrollWidth <= labelPanjang.clientWidth + 1,
      labelPanjang.scrollWidth + '/' + labelPanjang.clientWidth);

    /* 4. Kontrol Leaflet kanan digeser, supaya tidak tertutup panel. */
    catat('kontrol kanan saat sheet terbuka', Math.round(ctrl.getBoundingClientRect().right));
    ok('kontrol Leaflet kanan digeser ke kiri panel',
      Math.round(ctrl.getBoundingClientRect().right) <= Math.round(window.innerWidth - 380 - 12),
      Math.round(ctrl.getBoundingClientRect().right));
    ok('<body> memakai kelas sheet GeoData sendiri', document.body.classList.contains('geodata-sheet-open'));
    ok('<body> TIDAK memakai kelas sheet GeoTools', !document.body.classList.contains('geotools-sheet-open'),
      document.body.className);

    /* 5. Minimalkan: jadi chip 36px di bawah tengah. */
    setSheet('geodata-sheet', 'geodata-sheet-open', 'geodata-sheet-minimized',
      'geodata-sheet-open', 'geodata-sheet-minimized', false);
    await tidur(TUNDA);
    var rm = sheet.getBoundingClientRect();
    ok('saat diminimalkan sheet tetap terlihat', getComputedStyle(sheet).visibility === 'visible',
      getComputedStyle(sheet).visibility);
    ok('chip setinggi 36px', Math.round(rm.height) === 36, Math.round(rm.height));
    ok('body disembunyikan saat diminimalkan', getComputedStyle(body).display === 'none', getComputedStyle(body).display);
    ok('kepala dipadatkan ke 36px', Math.round(head.getBoundingClientRect().height) === 36,
      Math.round(head.getBoundingClientRect().height));
    ok('chip berada di bawah tengah', Math.abs((rm.left + rm.right) / 2 - window.innerWidth / 2) < 2,
      Math.round(rm.left) + '-' + Math.round(rm.right));
    ok('<body> beralih ke kelas minimized', document.body.classList.contains('geodata-sheet-minimized'));
    ok('kontrol Leaflet kembali ke kanan saat jadi chip',
      Math.round(ctrl.getBoundingClientRect().right) === window.innerWidth,
      Math.round(ctrl.getBoundingClientRect().right));

    /* 6. Buka lagi lalu tutup, dan pastikan GeoTools tidak ikut terpengaruh. */
    setSheet('geodata-sheet', 'geodata-sheet-open', 'geodata-sheet-minimized',
      'geodata-sheet-open', 'geodata-sheet-minimized', true);
    await tidur(TUNDA);
    ok('buka lagi setelah diminimalkan worked', getComputedStyle(sheet).visibility === 'visible',
      getComputedStyle(sheet).visibility);
    sheet.classList.remove('geodata-sheet-open');
    document.body.classList.remove('geodata-sheet-open');
    await tidur(TUNDA);
    ok('setelah ditutup sheet kembali tersembunyi', getComputedStyle(sheet).visibility === 'hidden',
      getComputedStyle(sheet).visibility);
    ok('<body> bersih dari kelas GeoData',
      !document.body.classList.contains('geodata-sheet-open') &&
      !document.body.classList.contains('geodata-sheet-minimized'), document.body.className);
    var cg = getComputedStyle(gts);
    ok('sheet GeoTools tetap punya geometri sendiri (380px, fixed)',
      cg.position === 'fixed' && Math.round(gts.getBoundingClientRect().width) === 380,
      cg.position + '/' + Math.round(gts.getBoundingClientRect().width));
    ok('sheet GeoTools tidak ikut memakai kelas GeoData',
      !gts.classList.contains('geodata-sheet-open') && !gts.classList.contains('geodata-sheet-minimized'));

    var o = document.createElement('div');
    o.id = 'out';
    o.textContent = (window.__r.F === 0 ? 'LULUS' : 'GAGAL') + ' ' + window.__r.S + ' lulus, ' + window.__r.F + ' gagal\\n' +
      window.__r.catat.join('\\n');
    document.body.appendChild(o);
  } catch (e) {
    var o = document.createElement('div');
    o.id = 'out';
    o.textContent = 'ERROR HARNESS ' + (e && e.stack ? e.stack : e);
    document.body.appendChild(o);
  }
});
</script></body></html>`;
}

const server = http.createServer(function (req, res) {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/__halaman') {
    res.writeHead(200, { 'content-type': TIPE['.html'] });
    return res.end(halaman());
  }
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('x'); }
  res.writeHead(200, { 'content-type': TIPE[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

function jalankanChrome(args, ms) {
  return new Promise(function (res) {
    const p = spawn(CHROME[0], args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    p.stdout.on('data', function (d) { out += d; });
    const t = setTimeout(function () { p.kill('SIGKILL'); }, ms);
    p.on('close', function () { clearTimeout(t); res(out); });
  });
}

server.listen(0, '127.0.0.1', async function () {
  const port = server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gds-'));
  const dom = await jalankanChrome([
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-dev-shm-usage', '--hide-scrollbars',
    '--user-data-dir=' + profile, '--window-size=1366,900',
    '--virtual-time-budget=40000', '--dump-dom',
    'http://127.0.0.1:' + port + '/__halaman'
  ], 90000);
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });

  const m = /<div id="out">([\s\S]*?)<\/div>/.exec(dom);
  if (!m) {
    console.log('HARNESS TIDAK SELESAI (panjang dom ' + dom.length + ')');
    process.exit(1);
  }
  const teks = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  console.log(teks);
  process.exit(/GAGAL|ERROR /.test(teks) ? 1 : 0);
});
