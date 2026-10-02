/* Uji section "Cuaca" GeoPulse di Chrome sungguhan.
 *
 * Yang diuji di sini, dan hanya bisa diuji di browser:
 *  1. Kedua kartu mulai terlipat dan isinya benar-benar tidak ter-render.
 *  2. Membuka / menutup kartu menyembunyikan dan memunculkan isi.
 *  3. Daftar toggle kualitas udara (9 butir) TETAP bisa digulir di dalam
 *     kartu: max-height 35vh + overflow-y:auto dari .cctv-layers ikut
 *     bertahan, dan margin 12px bawaannya benar-benar sudah dinolkan.
 *     Kalau max-height hilang, daftar akan memanjang dan mendorong seluruh
 *     panel GeoPulse - gejalanya cuma terlihat setelah dirender.
 *     Jendela Chrome sengaja dibuat PENDEK (420x900): batasnya 35vh dari
 *     tinggi jendela, dan isi 9 butir memakai sekitar 500px, sehingga di
 *     jendela 2400px daftar itu muat tanpa perlu digulir danassertinya
 *     jadi tidak pernah menguji apa pun.
 *  4. Checkbox tetap bisa diklik setelah dipindahkan ke dalam <details>.
 *  5. Jarak antar kartu 10px, dan isi menghormati padding 12px 13px.
 *  6. Section LAIN di panel GeoPulse tidak ikut berubah - pita biru
 *     .cctv-card-header di section Gempa/Kehutanan/Geologi/Forecasting
 *     harus tetap utuh, lengkap dengan ikon SVG-nya.
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
  /* Panel GeoPulse penuh, dengan tab GeoTools diaktifkan supaya
   * .geotools-main-tab-panel (display:none) tidak menyembunyikannya.
   * Subtab lain dibiarkan apa adanya: inline style="display:none;"-nya
   * memang bagian dari kondisi saat ini dan tidak boleh ikut hilang. */
  const gp = potongElemen(html, html.indexOf('<div id="geotoolsTabGeoPulse"'), 'div')
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
    var kartu = document.querySelectorAll('details.geopulse-card');
    var maritim = document.getElementById('geopulse-cuaca-maritim');
    var udara = document.getElementById('geopulse-kualitas-udara');

    /* 1. Dua kartu, keduanya terlipat. */
    ok('dua kartu geopulse-card', kartu.length === 2, kartu.length);
    ok('kartu maritim & udara ada', !!maritim && !!udara);
    ok('keduanya mulai terlipat', maritim.open === false && udara.open === false);
    [0, 1].forEach(function (i) {
      var b = kartu[i].querySelector('.geopulse-card-body');
      var h = kartu[i].querySelector('.gt-card-head');
      ok('kartu ' + i + ' badan tidak tampil', getComputedStyle(b).display === 'none', getComputedStyle(b).display);
      ok('kartu ' + i + ' badan tidak punya kotak', b.getClientRects().length === 0);
      ok('kartu ' + i + ' kepala tetap tampil', getComputedStyle(h).display !== 'none');
      ok('kartu ' + i + ' kepala punya tinggi wajar', h.getBoundingClientRect().height > 20,
        Math.round(h.getBoundingClientRect().height));
    });
    catat('tinggi terlipat', Math.round(maritim.getBoundingClientRect().height) + ' / ' + Math.round(udara.getBoundingClientRect().height));
    ok('judul maritim terbaca', maritim.querySelector('.gt-card-head b').textContent === 'Layer Cuaca Maritim');
    ok('judul udara terbaca', udara.querySelector('.gt-card-head b').textContent === 'Kualitas Udara');
    ok('kartu memakai overflow: hidden', getComputedStyle(maritim).overflow === 'hidden', getComputedStyle(maritim).overflow);

    /* 2. Buka kartu udara saja, dan cek daftar toggle-nya. */
    udara.open = true;
    var body = udara.querySelector('.geopulse-card-body');
    ok('badan udara tampil setelah dibuka', getComputedStyle(body).display !== 'none', getComputedStyle(body).display);
    ok('badan udara punya kotak', body.getClientRects().length > 0);
    ok('padding badan 12px 13px (sama dengan kartu lain)',
      getComputedStyle(body).paddingLeft === '13px' && getComputedStyle(body).paddingTop === '12px',
      getComputedStyle(body).padding);
    /* 3. .cctv-layers harus masih mengunci tinggi + memberi scroll. */
    var cs = getComputedStyle(body);
    ok('max-height 35vh dari .cctv-layers masih berlaku', cs.maxHeight !== 'none', cs.maxHeight);
    ok('badan bisa digulir (overflow-y auto/scroll)', cs.overflowY === 'auto' || cs.overflowY === 'scroll', cs.overflowY);
    ok('isi benar-benar lebih tinggi dari kotaknya, jadi daftar perlu digulir',
      body.scrollHeight > body.clientHeight + 4, body.scrollHeight + ' vs ' + body.clientHeight);
    catat('scrollHeight/clientHeight daftar udara', body.scrollHeight + ' / ' + body.clientHeight);
    /* Margin bawaan .cctv-layers harus sudah dinolkan: kalau tidak, isi
     * akan mulai 12px di dalam padding dan ruang hilang. */
    ok('margin bawaan .cctv-layers sudah dinolkan', cs.marginTop === '0px' && cs.marginBottom === '0px', cs.margin);
    /* Kotak isinya harus di dalam padding kartu. */
    var rb = udara.getBoundingClientRect();
    var first = udara.querySelector('.cctv-layer-toggle').getBoundingClientRect();
    ok('toggle pertama menghormati padding kartu', first.left >= rb.left + 12 && first.right <= rb.right - 12,
      Math.round(first.left) + '-' + Math.round(first.right) + ' vs ' + Math.round(rb.left) + '-' + Math.round(rb.right));

    /* 4. Checkbox tetap bisa dicentang lewat label.
     *
     * Input aslinya disembunyikan dengan sengaja: ".cctv-layer-toggle input
     * { display:none }" karena centangnya digambar sendiri oleh
     * .cctv-layer-check. Jadi yang harus diuji bukan "input punya kotak",
     * tapi jalur yang benar-benar dipakai pengguna: klik label. */
    var cb = document.getElementById('toggleOpenaqPm25');
    ok('checkbox OpenAQ PM2.5 ada', !!cb);
    ok('input sengaja disembunyikan (centang digambar sendiri)',
      getComputedStyle(cb).display === 'none', getComputedStyle(cb).display);
    var label = cb.closest('label.cctv-layer-toggle');
    ok('checkbox terbungkus label .cctv-layer-toggle', !!label);
    ok('label ter-render', label.getClientRects().length > 0);
    var kotak = label.querySelector('.cctv-layer-check').getBoundingClientRect();
    ok('kotak centang punya ukuran wajar', kotak.width > 10 && kotak.height > 10, Math.round(kotak.width) + 'x' + Math.round(kotak.height));
    ok('label dan checkbox-nya ber-associate', cb.closest('label') === label);
    label.click();
    ok('klik label mencentang checkbox dari dalam <details>', cb.checked === true);
    var after = label.querySelector('.cctv-layer-check').getBoundingClientRect();
    ok('kotak centang tidak bergeser setelah dicentang', Math.round(after.width) === Math.round(kotak.width));

    /* Buka kartu maritim juga, lalu tutup keduanya lagi. */
    maritim.open = true;
    ok('kedua badan tampil setelah keduanya dibuka',
      getComputedStyle(maritim.querySelector('.geopulse-card-body')).display !== 'none' &&
      getComputedStyle(body).display !== 'none');
    ok('dua toggle maritim ada', document.querySelectorAll('#geopulse-cuaca-maritim .cctv-layer-toggle').length === 2,
      document.querySelectorAll('#geopulse-cuaca-maritim .cctv-layer-toggle').length);
    ok('sembilan toggle udara ada', document.querySelectorAll('#geopulse-kualitas-udara .cctv-layer-toggle').length === 9,
      document.querySelectorAll('#geopulse-kualitas-udara .cctv-layer-toggle').length);
    catat('tinggi terbuka', Math.round(maritim.getBoundingClientRect().height) + ' / ' + Math.round(udara.getBoundingClientRect().height));
    maritim.open = false; udara.open = false;
    ok('kedua badan tersembunyi lagi setelah ditutup',
      getComputedStyle(maritim.querySelector('.geopulse-card-body')).display === 'none' &&
      getComputedStyle(body).display === 'none');
    ok('checkbox yang dicentang tetap ada setelah ditutup', document.getElementById('toggleOpenaqPm25').checked === true);

    /* 5. Jarak antar kartu 10px. */
    udara.open = true; maritim.open = true;
    var a = maritim.getBoundingClientRect(), b = udara.getBoundingClientRect();
    catat('jarak antar kartu', Math.round(b.top - a.bottom));
    ok('jarak antar kartu 10px (sama dengan ritme GeoNusa/GeoPangan)',
      Math.round(b.top - a.bottom) === 10, Math.round(b.top - a.bottom));

    /* 6. Section lain di GeoPulse tidak ikut berubah. */
    var pitaLain = document.querySelectorAll('#geotoolsTabGeoPulse .cctv-card-header');
    ok('section lain masih punya pita .cctv-card-header', pitaLain.length > 0, pitaLain.length);
    ok('pita lama tidak ikut jadi kartu .geopulse-card',
      document.querySelectorAll('details.geopulse-card .cctv-card-header').length === 0);
    /* Pita section Gempa sengaja disembunyikan inline; yang diuji di sini
     * hanya aturannya masih berlaku, jadi pitanya harus tetap biru. */
    var gayaPita = null;
    for (var i = 0; i < document.styleSheets.length; i++) {
      var rules; try { rules = document.styleSheets[i].cssRules; } catch (e) { continue; }
      for (var j = 0; j < rules.length; j++) {
        if ((rules[j].selectorText || '') === '.cctv-card-header') gayaPita = rules[j].style;
      }
    }
    ok('aturan .cctv-card-header masih ada di CSS', !!gayaPita);
    if (gayaPita) {
      ok('pita lama masih punya gradien biru', gayaPita.backgroundImage.indexOf('gradient') !== -1, gayaPita.backgroundImage);
      ok('pita lama masih bertEra', gayaPita.color === 'rgb(255, 255, 255)', gayaPita.color);
    }
    /* Aturan .gempa-subtab-panel yang membuat section ini terlihat harus utuh. */
    var aturanPanel = null;
    for (var i2 = 0; i2 < document.styleSheets.length; i2++) {
      var r2; try { r2 = document.styleSheets[i2].cssRules; } catch (e) { continue; }
      for (var j2 = 0; j2 < r2.length; j2++) {
        if ((r2[j2].selectorText || '') === '.gempa-subtab-panel.active') aturanPanel = r2[j2].style;
      }
    }
    ok('aturan .gempa-subtab-panel.active { display:block } masih ada',
      !!aturanPanel && aturanPanel.display === 'block', aturanPanel && aturanPanel.display);

    var o = document.createElement('div');
    o.id = 'out';
    o.textContent = (window.__r.F === 0 ? 'LULUS' : 'GAGAL') + ' ' + window.__r.S + ' lulus, ' + window.__r.F + ' gagal\\\\n' +
      window.__r.catat.join('\\\\n');
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gpc-'));
  const dom = await jalankanChrome([
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-dev-shm-usage', '--hide-scrollbars',
    '--user-data-dir=' + profile, '--window-size=420,900',
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
