/* Uji tiga kartu runtime GeoPulse di Chrome sungguhan.
 *
 * Berbeda dengan test-geopulse-cuaca.cjs (yang memeriksa markup static),
 * tes ini memanggil displayWeatherInfo() SEBENARNYA lewat
 * fetchWeatherBMKG() dengan fetch yang dipalsukan. Jadi yang diuji adalah
 * hasil innerHTML yang benar-benar dirender browser - bukan tebakan
 * tentang string template-nya.
 *
 * Yang diuji:
 *  1. Tiga kartu "Cuaca Sekarang", "Grafik Suhu", "Prakiraan Cuaca" benar
 *     benar muncul di #weather-content setelah data masuk.
 *  2. Ketiganya mulai terlipat, dan dibuka/menutup dengan benar.
 *  3. .weather-hero TETAP gradien biru dengan teks putih. Ini yang paling
 *     rawan rusak: kalau blok hero ikut hilang bersama pitanya, teksnya
 *     jadi putih di atas putih dan tidak terbaca - dan itu hanya terlihat
 *     setelah dirender.
 *  4. SVG grafik suhu punya tinggi nyata setelah kartu dibuka. buildTemperatureChart
 *     membuat SVG tangan (bukan Chart.js), jadi tidak boleh memerlukan
 *     ResizeObserver apa pun.
 *  5. Tiga .weather-day-card benar-benar terbentuk dari loopnya.
 *  6. .weather-source berada DI LUAR kartu (saatnya tidak, karena
 *     .cctv-card prakiraan tidak pernah ditutup - bug yang ikut diperbaiki).
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
  /* Hanya section Cuaca yang dipakai: displayWeatherInfo() menulis ke
   * #weather-content di dalamnya. Subtab lain tidak relevan untuk tes ini
   * dan sengaja tidak ikut dibawa. */
  const gp = potongElemen(html, html.indexOf('<div id="gempa-subtab-infocuaca"'), 'div');
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<link rel="stylesheet" href="/assets/css/app.css">
<style>
body{margin:0;background:var(--bg-primary)}
#geotools-sheet{position:static;visibility:visible;transform:none;width:380px;box-shadow:none}
#geotools-sheet .gs-sheet-body{flex:none;overflow:visible;padding:12px 16px}
img{max-width:100%}
</style></head><body><div id="geotools-sheet"><div class="gs-sheet-body">
${gp}
</div></div>
<script src="/assets/js/weather-bmkg.js"></script>
<script>
window.__r = { S: 0, F: 0, catat: [] };
function ok(n, c, e) { if (c) { window.__r.S++; } else { window.__r.F++; window.__r.catat.push('GAGAL ' + n + ' :: ' + (e === undefined ? '' : e)); } return !!c; }
function catat(n, v) { window.__r.catat.push(n + ' = ' + v); }

/* Data BMKG palsu: 3 hari x 8 slot. */
function slot(i) {
  return { t: String(24 + (i % 5)), hu: '78', ws: '6', tcc: '45', wd_to: 'TL', wd: '300',
    local_datetime: '2026-10-0' + (2 + Math.floor(i / 8)) + ' ' + String((i % 8) * 3).padStart(2, '0') + ':00',
    weather_desc: 'Cerah Berawan', image: '' };
}
var DATA = { lokasi: { desa: 'Sawah Blok 1', kecamatan: 'Ciasia', kabkota: 'Bandung', provinsi: 'Jawa Barat', lat: '-6.9', lon: '107.6' },
  data: [{ cuaca: [ [0,1,2,3,4,5,6,7].map(slot), [8,9,10,11,12,13,14,15].map(slot), [16,17,18,19,20,21,22,23].map(slot) ] }] };

/* Ganti fetch sebelum memanggil Weather BMKG sungguhan. */
window.fetch = function () {
  return Promise.resolve({ ok: true, json: function () { return Promise.resolve(DATA); } });
};

window.addEventListener('load', function () {
  fetchWeatherBMKG('31.71.03.1001', { focusMap: false }).then(function () {
    try {
      var wc = document.getElementById('weather-content');
      var kartu = wc.querySelectorAll('details.geopulse-card');
      var sekarang = document.getElementById('weather-card-sekarang');
      var suhu = document.getElementById('weather-card-grafik-suhu');
      var prakiraan = document.getElementById('weather-card-prakiraan');

      /* 1. Ketiganya benar-benar muncul. */
      ok('tiga kartu .geopulse-card di #weather-content', kartu.length === 3, kartu.length);
      ok('ketiga kartu punya id yang diharapkan', !!sekarang && !!suhu && !!prakiraan);
      ok('judul kartu terbaca',
        sekarang.querySelector('.gt-card-head b').textContent === 'Cuaca Sekarang' &&
        suhu.querySelector('.gt-card-head b').textContent === 'Grafik Suhu' &&
        prakiraan.querySelector('.gt-card-head b').textContent === 'Prakiraan Cuaca');
      ok('lokasi masuk ke subjudul kartu Cuaca Sekarang',
        sekarang.querySelector('.gt-card-head small').textContent.indexOf('Sawah Blok 1') === 0,
        sekarang.querySelector('.gt-card-head small').textContent);
      ok('tidak ada pita .cctv-card-header yang tersisa',
        wc.querySelectorAll('.cctv-card-header').length === 0);
      ok('tidak ada .cctv-card yang tersisa', wc.querySelectorAll('.cctv-card').length === 0);

      /* 2. Semuanya mulai terlipat. */
      [0, 1, 2].forEach(function (i) {
        ok('kartu ' + i + ' mulai terlipat', kartu[i].open === false);
        ok('kartu ' + i + ' badan tidak tampil',
          getComputedStyle(kartu[i].querySelector('.geopulse-card-body')).display === 'none');
        ok('kartu ' + i + ' kepala tetap tampil',
          getComputedStyle(kartu[i].querySelector('.gt-card-head')).display !== 'none');
      });
      catat('tinggi terlipat', Math.round(sekarang.getBoundingClientRect().height) + ' / ' +
        Math.round(suhu.getBoundingClientRect().height) + ' / ' + Math.round(prakiraan.getBoundingClientRect().height));

      /* 3. .weather-hero harus tetap gradien biru + teks putih. */
      sekarang.open = true;
      var hero = wc.querySelector('.weather-hero');
      ok('.weather-hero masih ada di dalam badan kartu', !!hero && !!hero.closest('details.geopulse-card'));
      var hs = getComputedStyle(hero);
      ok('hero tetap berlatar gradien', hs.backgroundImage.indexOf('gradient') !== -1, hs.backgroundImage);
      ok('teks hero tetap putih', hs.color === 'rgb(255, 255, 255)', hs.color);
      /* Kontras nyata: luminance teks jauh lebih tinggi dari latar. */
      function lum(c) {
        var m = c.match(/\\d+/g).map(Number);
        return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
      }
      ok('teks hero lebih terang dari latar (terbaca)', lum(hs.color) > 0.8, hs.color);
      var temp = hero.querySelector('.weather-now-temp');
      ok('suhu saat ini terbaca', temp.textContent.indexOf('\\u00b0C') !== -1, temp.textContent);
      ok('empat metrik tetap ada', hero.querySelectorAll('.weather-metric').length === 4,
        hero.querySelectorAll('.weather-metric').length);
      catat('tinggi hero terbuka', Math.round(hero.getBoundingClientRect().height));

      /* 4. SVG grafik suhu. */
      suhu.open = true;
      var svg = wc.querySelector('.temp-chart-svg');
      ok('SVG grafik suhu ada', !!svg);
      var kotakSvg = svg.getBoundingClientRect();
      ok('SVG punya tinggi nyata setelah kartu dibuka', kotakSvg.height > 50, Math.round(kotakSvg.height));
      ok('SVG punya lebar nyata', kotakSvg.width > 100, Math.round(kotakSvg.width));
      ok('SVG punya titik data (suhu per slot)', svg.querySelectorAll('circle').length === 24,
        svg.querySelectorAll('circle').length);
      ok('pembungkus .temp-chart-section punya tinggi', wc.querySelector('.temp-chart-section').getBoundingClientRect().height > 50);
      var legend = wc.querySelectorAll('.temp-chart-legend-item');
      ok('legenda min/max tetap ada', legend.length === 2, legend.length);

      /* 5. Tiga kartu hari dari loop-nya. */
      prakiraan.open = true;
      ok('tiga .weather-day-card terbentuk', wc.querySelectorAll('.weather-day-card').length === 3,
        wc.querySelectorAll('.weather-day-card').length);
      ok('delapan slot per hari', wc.querySelectorAll('.weather-day-card')[0].querySelectorAll('.weather-slot').length === 8,
        wc.querySelectorAll('.weather-day-card')[0].querySelectorAll('.weather-slot').length);
      ok('slot punya jam dan suhu', wc.querySelector('.weather-slot-temp').textContent.indexOf('\\u00b0') !== -1,
        wc.querySelector('.weather-slot-temp').textContent);
      ok('hari pertama ditandai sebagai "Hari ini"',
        wc.querySelector('.weather-day-head span').textContent.indexOf('Hari ini') === 0,
        wc.querySelector('.weather-day-head span').textContent);

      /* 6. .weather-source berada DI LUAR kartu (bug lama: ikut jadi anaknya). */
      var src = wc.querySelector('.weather-source');
      ok('.weather-source ada', !!src);
      ok('.weather-source BUKAN anak kartu mana pun', src && !src.closest('details.geopulse-card'));
      ok('.weather-source adalah anak langsung #weather-content', src && src.parentElement === wc);

      /* 7. Tutup lagi semuanya. */
      [sekarang, suhu, prakiraan].forEach(function (k) { k.open = false; });
      ok('ketiga badan tersembunyi setelah ditutup',
        Array.prototype.every.call(wc.querySelectorAll('.geopulse-card-body'), function (b) {
          return getComputedStyle(b).display === 'none';
        }));

      var o = document.createElement('div');
      o.id = 'out';
      o.textContent = (window.__r.F === 0 ? 'LULUS' : 'GAGAL') + ' ' + window.__r.S + ' lulus, ' + window.__r.F + ' gagal\\\\n' +
        window.__r.catat.join('\\\\n');
      document.body.appendChild(o);
    } catch (e) {
      var o2 = document.createElement('div');
      o2.id = 'out';
      o2.textContent = 'ERROR HARNESS ' + (e && e.stack ? e.stack : e);
      document.body.appendChild(o2);
    }
  }).catch(function (e) {
    var o3 = document.createElement('div');
    o3.id = 'out';
    o3.textContent = 'ERROR FETCH ' + (e && e.stack ? e.stack : e);
    document.body.appendChild(o3);
  });
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gpr-'));
  const dom = await jalankanChrome([
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-dev-shm-usage', '--hide-scrollbars',
    '--user-data-dir=' + profile, '--window-size=420,1600',
    '--virtual-time-budget=25000', '--dump-dom',
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
