/* Uji GeoWatch CCTV di Chrome sungguhan: kartu terlipat, diri yang
 * disembunyikan, dan daftar autocomplete tetap bisa keluar dari kartu.
 *
 * Yang diuji di sini yang TIDAK bisa diuji dari statis: computed style
 * (display:none benar-benar berlaku), dan yang paling penting, daftar
 * autocomplete tidak terpotong kartu — hal itu hanya terlihat kalau
 * dirender di browser.
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

/* Panel GeoWatch + panel GeoPulse, keduanya diberi kelas .active supaya
 * .geotools-main-tab-panel (display:none) tidak menyembunyikannya. Tanpa
 * itu semua pengukuran nol dan tes gagal tanpa alasan yang jelas.
 *
 * GeoPulse dipilih sebagai pembanding aturan bersama .cctv-card-header
 * (panel GeoPangan sudah tidak memakainya sejak jadi kartu <details>).
 * Sembilan pita GeoPulse berada DI DALAM .gempa-subtab-panel, jadi
 * subtabnya harus diaktifkan dulu, kalau tidak pita yang diukur tinggi 0px.
 *
 * Dua hal yang perlu dilawan di sini:
 *  - kelas: ".gempa-subtab-panel { display:none }" di app.css.
 *  - gaya inline: EMPAT dari lima subtab GeoPulse memakai
 *    style="display:none;" langsung di tag-nya, dan gaya inline menang
 *    atas aturan stylesheet apa pun. Mengaktifkan kelas saja tidak
   * cukup — gaya inline harus ikut dibuang, persis seperti yang

 *    dilakukan sidebar.js:157-168 saat pengguna menekan tombol subtab. */
function htmlUji() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const aktif = function (s) {
    return s.replace('class="geotools-main-tab-panel"', 'class="geotools-main-tab-panel active"');
  };
  const gw = aktif(potongElemen(html, html.indexOf('<div id="geotoolsTabGeoWatch"'), 'div'));
  const gp = aktif(
    potongElemen(html, html.indexOf('<div id="geotoolsTabGeoPulse"'), 'div')
      .replace(/(<div id="gempa-subtab-[a-z]+"[^>]*?)\s*style="display:none;"/g, '$1')
      .replace(/class="gempa-subtab-panel"/g, 'class="gempa-subtab-panel active"')
  );
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<link rel="stylesheet" href="/assets/css/app.css">
<style>
body{margin:0;background:var(--bg-primary)}
#geotools-sheet{position:static;visibility:visible;transform:none;width:380px;box-shadow:none}
#geotools-sheet .gs-sheet-body{flex:none;overflow:visible;padding:12px 16px}
</style></head><body>
<div id="geotools-sheet"><div class="gs-sheet-body">
${gw}
${gp}
</div></div>
<script>
window.__r = { S: 0, F: 0, catat: [] };
function ok(n, c, e) { if (c) { window.__r.S++; } else { window.__r.F++; window.__r.catat.push('GAGAL ' + n + ' :: ' + (e === undefined ? '' : e)); } return !!c; }
function catat(n, v) { window.__r.catat.push(n + ' = ' + v); }
window.addEventListener('load', function () {
  try {
    var d = document.querySelector('details.geowatch-cctv');
    var body = d.querySelector('.geowatch-cctv-body');
    var head = d.querySelector('.gt-card-head');
    var input = document.getElementById('cctvSearchInput');
    var hasil = document.getElementById('cctvResults');
    var status = document.getElementById('cctvStatus');
    var filter = document.getElementById('cctvAreaFilter');
    var oto = document.querySelector('.cctv-autocomplete');

    /* 1. Mulai terlipat, dan benar-benar tidak terlihat. */
    ok('kartu ada', !!d);
    ok('mulai terlipat', d.open === false);
    ok('badan tidak tampil saat terlipat', getComputedStyle(body).display === 'none', getComputedStyle(body).display);
    ok('kepala tetap tampil', getComputedStyle(head).display !== 'none');
    ok('kepala punya tinggi wajar', head.getBoundingClientRect().height > 20, head.getBoundingClientRect().height);
    ok('judul terbaca', (d.querySelector('.gt-card-head b') || {}).textContent === 'Pencarian CCTV');
    ok('subjudul terbaca', (d.querySelector('.gt-card-head small') || {}).textContent.length > 5);
    ok('ikon ada', !!d.querySelector('.gt-card-icon'));
    catat('lebar kartu', Math.round(d.getBoundingClientRect().width));

    /* 2. Elemen yang dipanggil JS harus ada. Fokus diuji setelah kartu
     *    dibuka: saat terlipat input memang berada di dalam display:none
     *    dan tidak boleh bisa difokuskan — itu perilaku yang benar. */
    ok('input pencarian ada', !!input);
    ok('filter wilayah ada', !!filter);
    ok('daftar hasil ada', !!hasil);
    ok('pesan status ada', !!status);
    ok('.cctv-autocomplete ada', !!oto);
    ok('input tidak bisa difokuskan saat kartu terlipat (benar)',
      (function () { input.focus(); return document.activeElement !== input; })());

    /* 3. Buka: badan harus muncul. */
    d.open = true;
    ok('badan tampil setelah dibuka', getComputedStyle(body).display !== 'none', getComputedStyle(body).display);
    ok('kartu bertambah tinggi setelah dibuka', d.getBoundingClientRect().height > 20);
    input.focus();
    ok('input bisa difokuskan setelah kartu dibuka', document.activeElement === input);
    input.blur();

    /* 4. Autocomplete tidak boleh terpotong kartu.
     *    Skenario berbahaya: badan kartu pendek (belum ada hasil), sehingga
     *    daftar setinggi 180px keluar dari tepi bawah kartu. Kalau kartu
     *    memakai overflow:hidden, daftar terpotong diam-diam. */
    var list = document.getElementById('cctvAutocomplete');
    var simpan = { status: status.innerHTML, hasil: hasil.innerHTML };
    status.style.display = 'none';
    hasil.style.display = 'none';
    list.style.display = 'block';
    /* Isi daftar harus cukup lebih tinggi dari max-height-nya (180px),
     * kalau tidak daftar hanya setinggi satu tombol dan tidak akan keluar
     * dari kartu — skenario yang sebenarnya kita uji tidak terjadi. */
    var isi = '';
    for (var n = 0; n < 14; n++) isi += '<button>Wilayah uji nomor ' + (n + 1) + '</button>';
    list.innerHTML = isi;
    var rk = d.getBoundingClientRect();
    var rl = list.getBoundingClientRect();
    catat('tinggi daftar             ', Math.round(rl.height));
    catat('kartu bawah (badan pendek)', Math.round(rk.bottom));
    catat('daftar bawah               ', Math.round(rl.bottom));
    ok('daftar benar-benar lebih tinggi dari kartu (skenario teruji)',
      rl.height > 40 && rl.bottom > rk.bottom, 'daftar ' + Math.round(rl.height) + 'px vs kartu sampai ' + Math.round(rk.bottom));
    ok('daftar autocomplete melewati tepi bawah kartu, tidak terpotong',
      rl.bottom > rk.bottom + 4, 'kartu ' + Math.round(rk.bottom) + ' daftar ' + Math.round(rl.bottom));
    ok('daftar tidak keluar dari sisi horizontal kartu',
      rl.left >= rk.left - 1 && rl.right <= rk.right + 1,
      'kartu ' + Math.round(rk.left) + '-' + Math.round(rk.right) + ' daftar ' + Math.round(rl.left) + '-' + Math.round(rl.right));
    /* Yang menjadi tanggung jawab perubahan ini: tidak ada ancestor
     * DI DALAM kartu yang memotong. Ancestor di luar kartu (mis.
     * #geotools-sheet) memang memotong di batas viewport, itu urusan
     * sheet dan sudah begitu sebelum perubahan ini. */
    (function () {
      var pemotong = null;
      var n2 = list.parentElement;
      while (n2 && n2 !== d) {
        var ov = getComputedStyle(n2).overflow;
        if (ov === 'hidden' || ov === 'clip') pemotong = n2.className || n2.id || n2.tagName;
        n2 = n2.parentElement;
      }
      ok('tidak ada ancestor di dalam kartu yang memotong daftar', pemotong === null,
        'pemotong: ' + pemotong);
      var ovKartu = getComputedStyle(d).overflow;
      ok('kartu memakai overflow visible', ovKartu === 'visible', ovKartu);
    })();
    list.style.display = '';
    list.innerHTML = '';
    status.style.display = '';
    hasil.style.display = '';
    status.innerHTML = simpan.status;
    hasil.innerHTML = simpan.hasil;

    /* 5. Gaya isian tidak berubah (masih .cctv-search-body). */
    ok('input punya tinggi 40px seperti sebelumnya',
      Math.round(input.getBoundingClientRect().height) === 40, input.getBoundingClientRect().height);
    ok('filter punya tinggi 40px', Math.round(filter.getBoundingClientRect().height) === 40);
    catat('jarak input ke pesan status', Math.round(status.getBoundingClientRect().top - input.getBoundingClientRect().bottom));

    /* 6. Panel lain yang memakai .cctv-card-header harus tetap punya
     *    pita biru. Ini regresi yang paling mudah luput.
     *
     *    Panel pembandingnya GeoPulse, bukan GeoPangan. GeoPangan kini
     *    memakai kartu <details> dan tidak punya .cctv-card-header lagi,
     *    sedangkan GeoPulse masih memakainya 9 kali - jadi dia satu-satunya
     *    panel yang benar-benar membuktikan aturan bersama itu masih hidup. */
    var headerLain = document.querySelectorAll('#geotoolsTabGeoPulse .cctv-card-header');
    ok('panel GeoPulse masih punya .cctv-card-header', headerLain.length > 0, headerLain.length);
    if (headerLain.length) {
      var hs = getComputedStyle(headerLain[0]);
      ok('kepala kartu panel lain masih punya latar (pita biru)', hs.backgroundImage.indexOf('gradient') !== -1, hs.backgroundImage);
      ok('kepala kartu panel lain masih punya teks putih', hs.color === 'rgb(255, 255, 255)', hs.color);
      ok('kepala kartu panel lain punya tinggi',
        headerLain[0].getBoundingClientRect().height > 20,
        Math.round(headerLain[0].getBoundingClientRect().height));
    }

    /* 7. Tutup lagi. */
    d.open = false;
    ok('badan tersembunyi lagi setelah ditutup', getComputedStyle(body).display === 'none');

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
    return res.end(htmlUji());
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gwg-'));
  const dom = await jalankanChrome([
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-dev-shm-usage', '--hide-scrollbars',
    '--user-data-dir=' + profile, '--window-size=420,1400',
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
