/* Uji panel GeoPangan di Chrome sungguhan: nav sumber PIHPS/SP2KP dihapus,
 * dua isinya jadi kartu <details> yang mengikuti template .gt-card-head.
 *
 * Yang diuji di sini, dan hanya bisa diuji di browser:
 *  1. Kedua kartu mulai terlipat dan isinya benar-benar tidak ter-render.
 *  2. Membuka / menutup kartu benar-benar menyembunyikan dan memunculkan isi.
 *  3. UJI REGRESI YANG SEBENARNYA BERBAHAYA: tidak ada satu pun elemen
 *     ber-atribut data-geopangan-source* atau kelas .geopangan-source-panel
 *     yang tersisa di dokumen. Selectors itu dicari GLOBAL, dan
 *     ".geopangan-source-panel { display:none }" masih bisa menyembunyikan
 *     apa pun yang memakai kelas itu. Kalau atribut itu sempat dipakai ulang
 *     di kartu baru, gejalanya baru muncul setelah tab GeoPangan diklik.
 *  4. Jarak antar kartu 10px dan isi menghormati padding 12px 13px.
 *  5. Tabel lebar hasil JS tetap di dalam kotak kartu meski overflow:hidden.
 *  6. Pembungkus <canvas> HNT dan histori ikut ter-render saat kartu dibuka -
 *     tanpa itu, Chart.js tidak punya tinggi untuk menggambar.
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

function halaman() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const gp = potongElemen(html, html.indexOf('<div id="geotoolsTabGeoPangan"'), 'div')
    .replace('class="geotools-main-tab-panel"', 'class="geotools-main-tab-panel active"');
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<link rel="stylesheet" href="/assets/css/app.css">
<style>
body{margin:0;background:var(--bg-primary)}
#geotools-sheet{position:static;visibility:visible;transform:none;width:380px;box-shadow:none}
#geotools-sheet .gs-sheet-body{flex:none;overflow:visible;padding:12px 16px}
</style></head><body><div id="geotools-sheet"><div class="gs-sheet-body">
${gp}
</div></div>
<script>
window.__r = { S: 0, F: 0, catat: [] };
function ok(n, c, e) { if (c) { window.__r.S++; } else { window.__r.F++; window.__r.catat.push('GAGAL ' + n + ' :: ' + (e === undefined ? '' : e)); } return !!c; }
function catat(n, v) { window.__r.catat.push(n + ' = ' + v); }
window.addEventListener('load', function () {
  try {
    var kartu = document.querySelectorAll('details.geopangan-card');
    var pihps = document.getElementById('geopangan-card-pihps');
    var sp2kp = document.getElementById('geopangan-card-sp2kp');

    /* 1. Dua kartu, keduanya terlipat. */
    ok('dua kartu geopangan-card', kartu.length === 2, kartu.length);
    ok('kartu PIHPS & SP2KP ada', !!pihps && !!sp2kp);
    ok('keduanya mulai terlipat', pihps.open === false && sp2kp.open === false);
    [0, 1].forEach(function (i) {
      var b = kartu[i].querySelector('.geopangan-card-body');
      var h = kartu[i].querySelector('.gt-card-head');
      ok('kartu ' + i + ' badan tidak tampil', getComputedStyle(b).display === 'none', getComputedStyle(b).display);
      ok('kartu ' + i + ' badan tidak punya kotak', b.getClientRects().length === 0);
      ok('kartu ' + i + ' kepala tetap tampil', getComputedStyle(h).display !== 'none');
      ok('kartu ' + i + ' kepala punya tinggi wajar', h.getBoundingClientRect().height > 20,
        Math.round(h.getBoundingClientRect().height));
    });
    catat('tinggi terlipat', Math.round(pihps.getBoundingClientRect().height) + ' / ' + Math.round(sp2kp.getBoundingClientRect().height));
    /* Judul kartu tidak dibandingkan dengan teks hardcode: judulnya sedang
     * aktif disunting pengguna. Yang diperiksa adalah bahwa <b> di kepala
     * benar-benar terbaca dan label yang ditunjuk aria-labelledby isi sama
     * dengan <b> itu. */
    [['pihps', 'geopanganPihpsTitle'], ['sp2kp', 'geopanganSp2kpTitle']].forEach(function (t) {
      var kartu = document.getElementById('geopangan-card-' + t[0]);
      var b = kartu.querySelector('.gt-card-head b');
      var small = kartu.querySelector('.gt-card-head small');
      ok('kartu ' + t[0] + ' punya judul terbaca', b.textContent.trim().length > 2, b.textContent);
      ok('kartu ' + t[0] + ' punya subjudul terbaca', small.textContent.trim().length > 5, small.textContent);
      var label = document.getElementById(t[1]);
      ok('aria-labelledby kartu ' + t[0] + ' menunjuk judul yang ada', !!label && label === b);
    });
    ok('kartu memakai overflow: hidden', getComputedStyle(pihps).overflow === 'hidden', getComputedStyle(pihps).overflow);

    /* 2. Buka keduanya, lalu tutup lagi. */
    pihps.open = true; sp2kp.open = true;
    var bp = pihps.querySelector('.geopangan-card-body');
    var bs = sp2kp.querySelector('.geopangan-card-body');
    ok('kedua badan tampil setelah dibuka',
      getComputedStyle(bp).display !== 'none' && getComputedStyle(bs).display !== 'none');
    catat('tinggi terbuka', Math.round(pihps.getBoundingClientRect().height) + ' / ' + Math.round(sp2kp.getBoundingClientRect().height));
    ok('badan PIHPS punya kotak', bp.getClientRects().length > 0);
    ok('padding badan 12px 13px (sama dengan kartu lain)',
      getComputedStyle(bp).paddingLeft === '13px' && getComputedStyle(bp).paddingTop === '12px',
      getComputedStyle(bp).padding);

    /* Isi formulir PIHPS benar-benar ter-render. */
    var sel = document.getElementById('geopanganProvince');
    var tgl = document.getElementById('geopanganDateStart');
    ok('dropdown provinsi ter-render', sel.getClientRects().length > 0 && sel.getBoundingClientRect().height > 24,
      Math.round(sel.getBoundingClientRect().height));
    ok('input tanggal ter-render', tgl.getClientRects().length > 0 && tgl.getBoundingClientRect().height > 24,
      Math.round(tgl.getBoundingClientRect().height));
    ok('lima input tanggal ada di DOM',
      document.querySelectorAll('#geotoolsTabGeoPangan input[type="date"]').length === 5,
      document.querySelectorAll('#geotoolsTabGeoPangan input[type="date"]').length);
    ok('wrapper #geopangan-table-home ada DI DALAM kartu PIHPS',
      !!document.getElementById('geopangan-table-home') &&
      !!document.getElementById('geopangan-table-home').closest('details.geopangan-card'));

    /* 3. UJI REGRESI: selector nav lama harus tidak finds apa pun. */
    ok('tidak ada [data-geopangan-source-panel] di dokumen',
      document.querySelectorAll('[data-geopangan-source-panel]').length === 0,
      document.querySelectorAll('[data-geopangan-source-panel]').length);
    ok('tidak ada [data-geopangan-source] di dokumen',
      document.querySelectorAll('[data-geopangan-source]').length === 0,
      document.querySelectorAll('[data-geopangan-source]').length);
    ok('tidak ada .geopangan-source-panel di dokumen',
      document.querySelectorAll('.geopangan-source-panel').length === 0,
      document.querySelectorAll('.geopangan-source-panel').length);
    ok('tidak ada nav .geopangan-source-tabs di dokumen',
      document.querySelectorAll('.geopangan-source-tabs').length === 0);
    /* Kombinasi yang paling berbahaya: kartu yang ikut kena selector global. */
    ok('tidak ada kartu yang memakai atribut/kelas nav lama',
      document.querySelectorAll('details.geopangan-card[data-geopangan-source],' +
        'details.geopangan-card[data-geopangan-source-panel],' +
        'details.geopangan-card.geopangan-source-panel').length === 0);
    /* Aturan display:none milik nav lama harus sudah tidak ada di CSS, kalau
     * tidak dan suatu saat kelas itu dipakai lagi, kartu lenyap permanen. */
    var aturanLama = [];
    for (var i = 0; i < document.styleSheets.length; i++) {
      var rules; try { rules = document.styleSheets[i].cssRules; } catch (e) { continue; }
      for (var j = 0; j < rules.length; j++) {
        if ((rules[j].selectorText || '').indexOf('geopangan-source-panel') !== -1) aturanLama.push(rules[j].selectorText);
      }
    }
    ok('aturan CSS .geopangan-source-panel sudah dihapus', aturanLama.length === 0, aturanLama.join(' | '));

    /* 4. Jarak antar kartu 10px. */
    var a = pihps.getBoundingClientRect(), b = sp2kp.getBoundingClientRect();
    catat('jarak antar kartu', Math.round(b.top - a.bottom));
    ok('jarak antar kartu 10px (sama dengan ritme GeoFarm/GeoNusa)',
      Math.round(b.top - a.bottom) === 10, Math.round(b.top - a.bottom));
    ok('kedua kartu selebar panel', Math.round(a.width) === Math.round(b.width), Math.round(a.width) + '/' + Math.round(b.width));

    /* 5. Tabel lebar hasil JS tidak keluar dari kotak kartu. */
    document.getElementById('geopanganTable').innerHTML =
      '<div style="overflow-x:auto"><table style="width:900px;border-collapse:collapse">' +
      '<tr><td style="padding:6px 10px;white-space:nowrap">Baris exceedingly panjang untuk menguji pembungkus</td></tr></table></div>';
    var kotak = document.getElementById('geopanganTable').getBoundingClientRect();
    catat('kotak #geopanganTable', Math.round(kotak.left) + '-' + Math.round(kotak.right));
    ok('#geopanganTable menghormati padding kartu',
      kotak.left >= a.left + 12 && kotak.right <= a.right - 12,
      Math.round(kotak.left) + '-' + Math.round(kotak.right) + ' vs ' + Math.round(a.left) + '-' + Math.round(a.right));
    /* Tabelnya sendiri boleh lebih lebar - itu sebabnya ada overflow-x:auto
     * di pembungkungnya. Yang tidak boleh: pembungkus ikut melebar. */
    ok('pembungkus tabel punya overflow-x:auto sehingga tabel lebar tidak memaksa kartu melebar',
      kotak.width < 900 && a.width < 400, kotak.width + ' / ' + a.width);
    /* Tidak ada ancestor dari isi yang memotong isi. */
    var pemotong = null, n = document.getElementById('geopanganTable');
    while (n && n !== pihps.parentElement) {
      if (n === pihps) { n = n.parentElement; continue; }
      var ov = getComputedStyle(n).overflow;
      if (ov === 'hidden' || ov === 'clip') pemotong = (n.className || n.tagName) + '[' + ov + ']';
      n = n.parentElement;
    }
    ok('tidak ada ancestor di luar kartu yang memotong isi', pemotong === null, 'pemotong: ' + pemotong);

    /* 6. Pembungkus <canvas> ikut ter-render saat kartu dibuka.
     *
     * Dua kartu chart (#sp2kpHntChartCard dan #sp2kpHistoryCard) Starts
     * display:none karena belum ada data - itu perilaku lama yang sengaja
     * dipertahankan, dan diuji di sini supaya tidak ikut hilang.
     * Barulah setelah itu disimulasikan kondisi "data sudah datang"
     * (loadSp2kp() yang membuat kartunya tampil) sebelum mengukur tinggi
     * pembungkus: tanpa itu yang terukur 0 dan test ini tidak berarti
     * apa-apa. */
    var kartuHnt = document.getElementById('sp2kpHntChartCard');
    var kartuHist = document.getElementById('sp2kpHistoryCard');
    ok('kartu chart HNT mula-mula tersembunyi sebelum ada data', getComputedStyle(kartuHnt).display === 'none', getComputedStyle(kartuHnt).display);
    ok('kartu chart histori mula-mula tersembunyi sebelum ada data', getComputedStyle(kartuHist).display === 'none', getComputedStyle(kartuHist).display);
    ok('canvas ada di dalam kartu chart masing-masing',
      document.getElementById('sp2kpHntChart').closest('#sp2kpHntChartCard') === kartuHnt &&
      document.getElementById('sp2kpHistoryChart').closest('#sp2kpHistoryCard') === kartuHist);

    /* Simulasikan loadSp2kp() / loadSp2kpHistory() selesai: kartu chart
     * dimunculkan dan diisi tabel. */
    kartuHnt.style.display = 'block';
    kartuHist.style.display = 'block';
    var bungkus = [document.getElementById('sp2kpHntChart').parentElement,
                   document.getElementById('sp2kpHistoryChart').parentElement];
    ok('kedua canvas ada di dalam kartu SP2KP',
      document.getElementById('sp2kpHntChart').closest('details.geopangan-card') === sp2kp &&
      document.getElementById('sp2kpHistoryChart').closest('details.geopangan-card') === sp2kp);
    /* Tinggi pembungkus inilah yang membuat Chart.js (yang memasang
     * ResizeObserver pada induk canvas) menggambar dengan ukuran benar. */
    ok('kedua pembungkus canvas punya tinggi terukur',
      bungkus[0].getBoundingClientRect().height > 100 && bungkus[1].getBoundingClientRect().height > 100,
      Math.round(bungkus[0].getBoundingClientRect().height) + ' / ' + Math.round(bungkus[1].getBoundingClientRect().height));
    catat('tinggi pembungkus canvas', Math.round(bungkus[0].getBoundingClientRect().height) + ' / ' + Math.round(bungkus[1].getBoundingClientRect().height));
    /* Canvas default 300x150 sebelum atribut width/height diisi Chart.js;
     * lebarnya harus muat di dalam badan kartu. */
    var kan = document.getElementById('sp2kpHntChart').getBoundingClientRect();
    var bb = bs.getBoundingClientRect();
    ok('canvas muat di dalam lebar badan kartu', kan.width <= bb.width, Math.round(kan.width) + ' <= ' + Math.round(bb.width));
    /* Kartu SP2KP ditutup lagi harus menyembunyikan canvas-nya. */
    sp2kp.open = false;
    ok('canvas ikut tersembunyi saat kartu ditutup',
      document.getElementById('sp2kpHntChart').getClientRects().length === 0);
    ok('badan SP2KP display:none lagi', getComputedStyle(bs).display === 'none', getComputedStyle(bs).display);
    sp2kp.open = true;
    ok('canvas kembali ter-render saat dibuka lagi',
      document.getElementById('sp2kpHntChart').getClientRects().length > 0);
    ok('pembungkus canvas kembali punya tinggi setelah buka-tutup',
      document.getElementById('sp2kpHntChart').parentElement.getBoundingClientRect().height > 100,
      Math.round(document.getElementById('sp2kpHntChart').parentElement.getBoundingClientRect().height));

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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gpg-'));
  const dom = await jalankanChrome([
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-dev-shm-usage', '--hide-scrollbars',
    '--user-data-dir=' + profile, '--window-size=420,2400',
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
