/* Uji panel GeoRaster di Chrome sungguhan.
 *
 * Yang hanya bisa diuji di sini:
 *  1. display:none saat terlipat benar-benar berlaku, dan isinya kembali
 *     tampil saat dibuka.
 *  2. Tujuh elemen yang harus mulai tersembunyi benar-benar tidak
 *     terlihat (display:none), bukan sekadar punya atribut hidden.
 *  3. Spinner #demnasDownloadBtn.is-loading::after — satu-satunya elemen
 *     ber-posisi absolute di panel ini — tidak keluar dari kotaknya.
 *     Ini yang membuat overflow:hidden pada kartu deemed aman.
 *  4. Panel lain (GeoWatch) tidak ikut berubah.
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

function halaman(tema, buka) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const aktif = function (s) { return s.replace('class="geotools-main-tab-panel"', 'class="geotools-main-tab-panel active"'); };
  const gr = aktif(potongElemen(html, html.indexOf('<div id="geotoolsTabDemnas"'), 'div'));
  const gw = aktif(potongElemen(html, html.indexOf('<div id="geotoolsTabGeoWatch"'), 'div'));
  return `<!doctype html><html lang="id" data-theme="${tema}"><head><meta charset="utf-8">
<link rel="stylesheet" href="/assets/css/app.css">
<style>
body{margin:0;background:var(--bg-primary)}
#geotools-sheet{position:static;visibility:visible;transform:none;width:380px;box-shadow:none}
#geotools-sheet .gs-sheet-body{flex:none;overflow:visible;padding:12px 16px}
#geotoolsTabGeoWatch{margin-top:18px;border-top:2px dashed var(--border-color);padding-top:12px}
</style></head><body><div id="geotools-sheet"><div class="gs-sheet-body">
${gr}
${gw}
</div></div>
<script>
window.__r = { S: 0, F: 0, catat: [] };
function ok(n, c, e) { if (c) { window.__r.S++; } else { window.__r.F++; window.__r.catat.push('GAGAL ' + n + ' :: ' + (e === undefined ? '' : e)); } return !!c; }
function catat(n, v) { window.__r.catat.push(n + ' = ' + v); }
window.addEventListener('load', function () {
  try {
    var d = document.querySelector('details.georaster-card');
    var body = d.querySelector('.georaster-card-body');
    var head = d.querySelector('.gt-card-head');

    /* 1. Terlipat. */
    ok('kartu ada', !!d);
    ok('mulai terlipat', d.open === false);
    ok('badan tidak tampil saat terlipat', getComputedStyle(body).display === 'none', getComputedStyle(body).display);
    ok('kepala tetap tampil', getComputedStyle(head).display !== 'none');
    ok('kepala punya tinggi wajar', head.getBoundingClientRect().height > 20, head.getBoundingClientRect().height);
    ok('judul terbaca', head.querySelector('b').textContent === 'Unduh DEMNAS');
    ok('subjudul terbaca', head.querySelector('small').textContent.length > 10);
    ok('ikon ada', !!head.querySelector('.gt-card-icon'));
    catat('lebar kartu', Math.round(d.getBoundingClientRect().width));
    catat('tinggi kartu terlipat', Math.round(d.getBoundingClientRect().height));

    /* 2. Tidak ada elemen di badan yang bocor keluar saat terlipat.
     *    Kalau aturan .georaster-card:not([open]) > .georaster-card-body
     *    salah target, isi akan tetap terlihat di bawah kepala.
     *
     *    Yang diperiksa adalah benar-benar ter-render atau tidak
     *    (getClientRects), BUKAN nilai display anak. Nilai display anak
     *    tetap 'block' walau induknya display:none — hitungannya tetap
     *    block, hanya tidak digambar. Memakai getComputedStyle di sini
     *    akan selalu lulus dan tidak memblokir apa pun. */
    var bocor = [];
    Array.prototype.forEach.call(body.children, function (c) {
      if (c.getClientRects().length > 0) {
        bocor.push((c.id || c.className || c.tagName) + '[' + getComputedStyle(c).display + ']');
      }
    });
    ok('tidak ada isi yang benar-benar ter-render saat terlipat', bocor.length === 0, bocor.join(' | '));
    ok('badan tidak punya kotak sama sekali saat terlipat', body.getClientRects().length === 0);
    ok('kartu terlipat tidak setinggi isinya',
      d.getBoundingClientRect().height < head.getBoundingClientRect().height + 12,
      Math.round(d.getBoundingClientRect().height));

    /* 3. Buka. */
    d.open = true;
    ok('badan tampil setelah dibuka', getComputedStyle(body).display !== 'none', getComputedStyle(body).display);
    ok('kartu bertambah tinggi setelah dibuka',
      d.getBoundingClientRect().height > head.getBoundingClientRect().height + 60);
    catat('tinggi kartu terbuka', Math.round(d.getBoundingClientRect().height));

    /* 4. Tujuh elemen yang harus tersembunyi. */
    var harusHidden = ['demnasRecommendationBox', 'demnasAdminSearchWrap', 'demnasAdminSelected',
      'demnasClipRefreshBtn', 'demnasClipResetBtn', 'demnasElevationLegend', 'demnasLoadingLayer'];
    harusHidden.forEach(function (id) {
      var e = document.getElementById(id);
      ok(id + ' benar-benar tidak tampil', !!e && getComputedStyle(e).display === 'none',
        e ? getComputedStyle(e).display : 'elemen tidak ada');
    });
    ok('tujuh elemen hidden semuanya ada', harusHidden.every(function (id) { return !!document.getElementById(id); }));

    /* 5. Elemen yang harus terlihat. */
    ['demnasSearchInput', 'demnasNamobjSelect', 'demnasAdminLevel', 'demnasDownloadBtn']
      .forEach(function (id) {
        var e = document.getElementById(id);
        ok(id + ' terlihat', !!e && getComputedStyle(e).display !== 'none');
        ok(id + ' punya tinggi wajar', !!e && e.getBoundingClientRect().height > 10,
          e ? Math.round(e.getBoundingClientRect().height) : '-');
      });
    var dl = document.getElementById('demnasDownloadBtn');
    ok('tombol unduh selebar kartu', Math.abs(dl.getBoundingClientRect().width - (d.getBoundingClientRect().width - 26)) < 3,
      Math.round(dl.getBoundingClientRect().width) + ' vs ' + Math.round(d.getBoundingClientRect().width - 26));

    /* 6. Spinner is-loading: satu-satunya elemen absolute di panel.
     *    Kalau bocor keluar kartu, overflow:hidden tidak fulfill. */
    dl.classList.add('is-loading');
    var setelah = getComputedStyle(dl, '::after');
    catat('spin is-loading', setelah.content + ' ' + setelah.width + 'x' + setelah.height + ' ' + setelah.position);
    ok('::after spinner benar-benar dirender', setelah.content !== 'none', setelah.content);
    ok('::after spinner memakai position absolute', setelah.position === 'absolute', setelah.position);
    var rb = dl.getBoundingClientRect();
    ok('tombol sudah position relative (konteks spinner)', getComputedStyle(dl).position === 'relative', getComputedStyle(dl).position);
    ok('spinner tidak keluar dari kotak tombol', rb.height >= 15, Math.round(rb.height));
    dl.classList.remove('is-loading');

    /* 7. Isian tidak keluar dari lebar kartu. */
    var bocor = [];
    Array.prototype.forEach.call(body.querySelectorAll('input, select, button, div, p'), function (e) {
      var r = e.getBoundingClientRect();
      if (r.width > 0 && (r.right > rb.right + 1 || r.left < rb.left - 1)) bocor.push((e.id || e.className || e.tagName) + ' ' + Math.round(r.left) + '-' + Math.round(r.right));
    });
    ok('tidak ada isian yang keluar dari lebar kartu', bocor.length === 0, bocor.join(' | '));

    /* 8. Tutup lagi. */
    d.open = false;
    ok('badan tersembunyi lagi setelah ditutup', getComputedStyle(body).display === 'none');

    /* 9. Panel GeoWatch tidak ikut berubah. */
    var gw = document.querySelector('details.geowatch-cctv');
    ok('kartu GeoWatch masih ada dan juga terlipat', !!gw && gw.open === false);
    ok('kartu GeoWatch punya kelas sendiri', gw && gw.className === 'geowatch-cctv');
    ok('dua kartu memakai .gt-card-head', document.querySelectorAll('summary.gt-card-head').length === 2,
      document.querySelectorAll('summary.gt-card-head').length);

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
    return res.end(halaman(q.get('tema') || 'light', q.get('buka') === '1'));
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gr-'));
  const dom = await jalankanChrome([
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-dev-shm-usage', '--hide-scrollbars',
    '--user-data-dir=' + profile, '--window-size=420,1800',
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
