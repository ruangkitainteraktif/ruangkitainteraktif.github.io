/* Uji panel GeoNusa di Chrome sungguhan.
 *
 * Yang diuji di sini, dan hanya bisa diuji di browser:
 *  1. Kedua kartu mulai terlipat dan tidak ada isinya yang ter-render.
 *  2. Membuka keduanya menampilkan isi (grid 4 kotak, kartu statistik, dan
 *     kartu indikator yang diisi JS).
 *  3. UJI REGRESI YANG SEBENARNYA BERBAHAYA: menyalinkan
 *     openGeoidSubtab lalu/kliknya pada tombol Alat. Fungsi itu mencari
 *     .geoid-subtab-panel di SELURUH dokumen. Kalau kartu GeoNusa masih
 *     memakai kelas itu, kelas .active akan hilang dari sana dan
 *     "display:none" menyembunyikannya permanen — tanpa nav, mustahil
 *     dibuka lagi. Disimulasikan di sini, karena gejalanya baru muncul
 *     setelah pengguna menekan tombol di panel LAIN.
 *  4. Jarak antar kartu sama dengan ritme 10px di tab GeoFarm.
 *  5. Isi yang dihasilkan JS (grafik, tabel) tidak keluar dari kotak
 *     kartu despite overflow:hidden.
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
  let depth = 0, m;
  while ((m = re.exec(html))) {
    if (m[0].charAt(1) === '/') { depth--; if (depth === 0) return html.slice(dari, re.lastIndex); }
    else depth++;
  }
  return '';
}

function halaman(tema) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const aktif = function (s) { return s.replace('class="geotools-main-tab-panel"', 'class="geotools-main-tab-panel active"'); };
  const gn = aktif(potongElemen(html, html.indexOf('<div id="geotoolsTabGeonusa"'), 'div'));
  /* Panel GeoData ikut dibawa supaya ada tombol Alat sungguhan untuk ditekan. */
  const gd = potongElemen(html, html.indexOf('<div id="geotoolsTabMuatData"'), 'div');
  return `<!doctype html><html lang="id" data-theme="${tema}"><head><meta charset="utf-8">
<link rel="stylesheet" href="/assets/css/app.css">
<style>
body{margin:0;background:var(--bg-primary)}
#geotools-sheet{position:static;visibility:visible;transform:none;width:380px;box-shadow:none}
#geotools-sheet .gs-sheet-body{flex:none;overflow:visible;padding:12px 16px}
#geotoolsTabMuatData{position:absolute;left:-9999px;top:0}
</style></head><body><div id="geotools-sheet"><div class="gs-sheet-body">
${gn}
</div></div>
<div class="geotools-main-tab-panel">${gd}</div>
<script src="/assets/js/sidebar.js"></script>
<script>
window.__r = { S: 0, F: 0, catat: [] };
function ok(n, c, e) { if (c) { window.__r.S++; } else { window.__r.F++; window.__r.catat.push('GAGAL ' + n + ' :: ' + (e === undefined ? '' : e)); } return !!c; }
function catat(n, v) { window.__r.catat.push(n + ' = ' + v); }
window.addEventListener('load', function () {
  try {
    var kartu = document.querySelectorAll('details.geonusa-card');
    var stat = document.getElementById('geoidStatsCard');
    var ind = document.getElementById('geoidIndicatorCard');
    var ringkas = document.getElementById('geoidSummaryCards');

    /* 1. Dua kartu, keduanya terlipat. */
    ok('dua kartu geonusa-card', kartu.length === 2, kartu.length);
    ok('keduanya mulai terlipat', kartu[0].open === false && kartu[1].open === false);
    [0, 1].forEach(function (i) {
      var b = kartu[i].querySelector('.geonusa-card-body');
      var h = kartu[i].querySelector('.gt-card-head');
      ok('kartu ' + i + ' badan tidak tampil', getComputedStyle(b).display === 'none', getComputedStyle(b).display);
      ok('kartu ' + i + ' badan tidak punya kotak', b.getClientRects().length === 0);
      ok('kartu ' + i + ' kepala tetap tampil', getComputedStyle(h).display !== 'none');
      ok('kartu ' + i + ' kepala punya tinggi wajar', h.getBoundingClientRect().height > 20, h.getBoundingClientRect().height);
    });
    catat('tinggi terlipat', Math.round(kartu[0].getBoundingClientRect().height) + ' / ' + Math.round(kartu[1].getBoundingClientRect().height));
    ok('judul pertama terbaca', kartu[0].querySelector('.gt-card-head b').textContent === 'Statistik Indonesia');
    ok('judul kedua terbaca', kartu[1].querySelector('.gt-card-head b').textContent === 'Indikator Penduduk');

    /* 2. Buka keduanya. */
    kartu[0].open = true; kartu[1].open = true;
    ok('kedua badan tampil setelah dibuka',
      getComputedStyle(kartu[0].querySelector('.geonusa-card-body')).display !== 'none' &&
      getComputedStyle(kartu[1].querySelector('.geonusa-card-body')).display !== 'none');
    catat('tinggi terbuka', Math.round(kartu[0].getBoundingClientRect().height) + ' / ' + Math.round(kartu[1].getBoundingClientRect().height));
    ok('grid 4 kotak ringkasan tampil', ringkas.querySelectorAll('.geoid-summary-box').length === 4);
    ok('empat kotak ter-render', ringkas.querySelectorAll('.geoid-summary-box')[0].getClientRects().length > 0);
    ok('keempat angka ada di DOM',
      ['geoidCountProv','geoidCountKab','geoidCountKec','geoidCountDesa'].every(function (id) {
        return !!document.getElementById(id); }));
    /* Simulasikan isi yang dibuat population-chart.js, termasuk ikon
     * magnifier 12x12 yang ber-posisi absolute. */
    stat.innerHTML = '<div><div id="pyramid-chart" style="height:120px;background:#e0f2fe"></div>' +
      '<div id="generation-chart" style="height:90px;background:#dbeafe;margin-top:10px"></div></div>';
    ind.innerHTML = '<div><div style="position:relative"><input id="tbl-search" type="text" style="width:100%;padding:5px 8px 5px 24px">' +
      '<svg style="position:absolute;left:7px;top:50%;transform:translateY(-50%);pointer-events:none" width="12" height="12" viewBox="0 0 24 24"></svg>' +
      '</div><div id="indicator-chart" style="height:80px;background:#f0f9ff;margin-top:10px"></div></div>';

    /* 3. Isi JS tidak keluar dari kotak kartu meskipun overflow:hidden.
     *    Yang diuji: tidak ada ancestor dari isi yang memotong. */
    [['kartu statistik', stat, kartu[0]], ['kartu indikator', ind, kartu[1]]].forEach(function (t) {
      var nama = t[0], isi = t[1], card = t[2];
      var pemotong = null, n = isi;
      while (n && n !== card.parentElement) {
        if (n === card) { n = n.parentElement; continue; }
        var ov = getComputedStyle(n).overflow;
        if (ov === 'hidden' || ov === 'clip') pemotong = (n.className || n.tagName) + '[' + ov + ']';
        n = n.parentElement;
      }
      /* Yang boleh memotong hanya kartu itu sendiri (overflow:hidden) —
       * yang justru kita inginkan untuk tepi pita kepala. */
      ok(nama + ': tidak ada ancestor di luar kartu yang memotong', pemotong === null, 'pemotong: ' + pemotong);
      var rb = card.getBoundingClientRect();
      catat(nama + ' kartu', Math.round(rb.left) + '-' + Math.round(rb.right) +
        ' (padding ' + getComputedStyle(card.querySelector('.geonusa-card-body')).paddingLeft + ')');
      var bocor = [];
      Array.prototype.forEach.call(isi.querySelectorAll('div,input,svg'), function (e) {
        var r = e.getBoundingClientRect();
        /* Yang diperiksa: isi tetap DI DALAM kotak kartu. Toleransinya
         * kecil (2px) karena kartu tidak boleh memotong lebar — itu
         * justru tanda overflow yang salah. */
        if (r.width > 0 && (r.right > rb.right - 2 || r.left < rb.left + 2)) {
          bocor.push((e.id || e.className || e.tagName) + ' ' + Math.round(r.left) + '-' + Math.round(r.right));
        }
      });
      ok(nama + ': isi tidak keluar dari kotak kartu', bocor.length === 0, bocor.join(' | '));
      /* Sebaliknya: isi juga tidak boleh menempel di tepi, karena
       * georaster-card-body memakai padding 12px 13px. */
      var tempel = [];
      Array.prototype.forEach.call(isi.querySelectorAll('div[style*="width:100%"], input'), function (e) {
        var r = e.getBoundingClientRect();
        if (r.left < rb.left + 8 || r.right > rb.right - 8) {
          tempel.push((e.id || e.className || e.tagName) + ' ' + Math.round(r.left) + '-' + Math.round(r.right));
        }
      });
      ok(nama + ': isi menghormati padding kartu', tempel.length === 0, tempel.join(' | '));
    });
    /* Ikon magnifier harus di dalam kotak position:relative-nya. */
    var svg = ind.querySelector('svg');
    var indukSvg = svg.parentElement;
    ok('ikon magnifier punya induk ber-posisi relative',
      getComputedStyle(indukSvg).position === 'relative', getComputedStyle(indukSvg).position);
    var rb2 = indukSvg.getBoundingClientRect(), rs = svg.getBoundingClientRect();
    ok('ikon magnifier tidak keluar dari kotaknya',
      rs.top >= rb2.top - 1 && rs.bottom <= rb2.bottom + 1,
      Math.round(rb2.top) + '-' + Math.round(rb2.bottom) + ' vs ' + Math.round(rs.top) + '-' + Math.round(rs.bottom));

    /* 4. Jarak antar kartu 10px, dan ke paragraf pengantar dari marginnya. */
    var a = kartu[0].getBoundingClientRect(), b = kartu[1].getBoundingClientRect();
    catat('jarak antar kartu', Math.round(b.top - a.bottom));
    ok('jarak antar kartu 10px (sama dengan ritme GeoFarm)',
      Math.round(b.top - a.bottom) === 10, Math.round(b.top - a.bottom));

    /* 5. UJI REGRESI: klik tombol Alat sungguhan lewat openGeoidSubtab.
     *    Fungsi itu menghapus .active dari SEMUA .geoid-subtab-panel di
     *    dokumen. Kalau kartu GeoNusa masih memakai kelas itu, keduanya
     *    akan lenyap permanen. */
    ok('sidebar.js termuat (openGeoidSubtab ada)', typeof window.openGeoidSubtab === 'function');
    var tombolAlat = document.querySelector('[data-subtab="alat-tab-gpx"]');
    ok('tombol Alat sungguhan ada di DOM', !!tombolAlat);
    ok('kartu GeoNusa TIDAK punya kelas geoid-subtab-panel',
      document.querySelectorAll('details.geonusa-card.geoid-subtab-panel').length === 0);
    if (tombolAlat) {
      window.openGeoidSubtab(tombolAlat);
    }
    catat('setelah klik Alat, kartu[0].open', kartu[0].open);
    catat('setelah klik Alat, kartu[1].open', kartu[1].open);
    ok('kartu GeoNusa tetap terbuka setelah tombol Alat diklik',
      kartu[0].open === true && kartu[1].open === true);
    ok('kartu GeoNusa tetap ter-render setelah tombol Alat diklik',
      getComputedStyle(kartu[0].querySelector('.geonusa-card-body')).display !== 'none' &&
      getComputedStyle(kartu[1].querySelector('.geonusa-card-body')).display !== 'none');
    /* Nav Alat sendiri harus tetap berfungsi (bukan ikut rusak). */
    ok('nav Alat masih berfungsi: panelnya aktif',
      document.getElementById('alat-tab-gpx').classList.contains('active'),
      document.getElementById('alat-tab-gpx').className);
    ok('nav Alat: tombol lain kehilangan .active',
      !document.querySelector('[data-subtab="alat-tab-kmz"]').classList.contains('active'));

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
    const q = new URL(req.url, 'http://x').searchParams;
    res.writeHead(200, { 'content-type': TIPE['.html'] });
    return res.end(halaman(q.get('tema') || 'light'));
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-'));
  const dom = await jalankanChrome([
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-dev-shm-usage', '--hide-scrollbars',
    '--user-data-dir=' + profile, '--window-size=420,1600',
    '--virtual-time-budget=20000', '--dump-dom',
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
  process.exit(/GAGAL|ERROR HARNESS/.test(teks) ? 1 : 0);
});
