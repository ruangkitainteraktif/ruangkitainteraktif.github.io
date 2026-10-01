/* Uji Referensi Pertanian di Chrome sungguhan, lewat HTTP lokal.
 *
 * test-referensi-geofarm.cjs (node + vm) tidak bisa menguji dua hal yang
 * justru paling rawan di fitur ini:
 *
 *  1. JALUR PENGAMBILAN DATA. Modul memakai fetch(); dari file:// fetch
 *     diblokir CORS, jadi di sandbox vm jalur itu tidak pernah tersentuh
 *     sama sekali. Yang di sini adalah bukti keras bahwa datanya benar
 *     diambil saat kartu dibuka - bukan sebelum, dan tidak dua kali.
 *
 *  2. MEKANISME TERLIPAT DAN GAYA. Aturan
 *     .geofarm-ref:not([open]) > .geofarm-ref-body { display: none }
 *     hanya berlaku di browser. Markup yang diuji dipotong langsung dari
 *     index.html dan CSS-nya app.css yang asli, jadi penyuntingan kedua
 *     file itu ikut teruji - bukan salinan yang bisa menyimpang.
 *
 * Repo dilayani lewat http://127.0.0.1 supaya fetch() boleh jalan, lalu
 * hasil Chrome headless --dump-dom dibaca dari <div id="out">.
 * Kalau Chrome tidak ada, tes dilewati dengan exit 0.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
].filter(function (p) { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!CHROME.length) { console.log('Chrome tidak ditemukan, dilewati.'); process.exit(0); }

const TIPE = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

/* Lebar ini meniru #geotools-sheet sungguhan: min(380px, …) dengan padding
   12px 16px, jadi isi efektifnya 348px. Menguji di 430px seperti harness
   lain akan menutupi overflow yang justru terjadi di sidebar aslinya. */
const HALAMAN = `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/assets/css/app.css">
<style>
body{margin:0;background:var(--bg-primary)}
#geotools-sheet{position:static;visibility:visible;transform:none;width:380px;margin:0;box-shadow:none}
#geotools-sheet .gs-sheet-body{flex:none;overflow:visible;padding:12px 16px 16px}
</style>
</head><body>
<div id="geotools-sheet">
<div class="gs-sheet-body"><div class="geotools-main-tab-panel active" id="geotoolsTabGeoFarm">
__PANEL__
</div></div></div>
<script src="/assets/js/geofarm-referensi.js"></script>
<script>
window.__hasil = { langkah: [] };
function catat(nama, nilai) { window.__hasil.langkah.push(nama + ' = ' + nilai); }
window.addEventListener('load', function () {
  var S = 0, F = 0;
  function ok(n, c, e) { if (c) { S++; } else { F++; catat('GAGAL: ' + n, e === undefined ? '' : e); } return !!c; }
  try {
    var grup = document.getElementById('geofarm-referensi');
    ok('grup ada', !!grup);
    var kartu = grup.querySelectorAll('[data-ref-card]');
    ok('4 kartu', kartu.length === 4, kartu.length);

    var peta = {};
    kartu.forEach(function (d) { peta[d.getAttribute('data-ref-card')] = d; });

    /* 1. Semua harus mulai terlipat dan isinya benar-benar tak terlihat. */
    var LEBAR = 348;   /* 380px sheet - 16px padding kiri - 16px kanan */
    ok('grup tidak meluber keluar lebar sheet', grup.getBoundingClientRect().width <= LEBAR + 1,
      grup.getBoundingClientRect().width);
    /* Scroll dibandingkan clientWidth, bukan lebar tetap: scrollWidth
       selalu minimal sebesar kotak elemen itu sendiri (termasuk padding),
       jadi membandingkannya dengan 348 hanya akan selalu gagal. */
    (function () {
      var b = document.querySelector('#geotools-sheet .gs-sheet-body');
      ok('tidak ada scroll horizontal di isi sheet', b.scrollWidth <= b.clientWidth + 1,
        b.scrollWidth + ' vs client ' + b.clientWidth);
    })();
    Object.keys(peta).forEach(function (k) {
      var lebar = peta[k].getBoundingClientRect().width;
      ok(k + ' tidak lebih lebar dari sheet', lebar <= LEBAR + 1, lebar);
    });

    /* Jarak antar kartu di tab ini harus seragam. Dulu tiap kartu punya
       margin-top sendiri (14px / 20px / 8px) sehingga enam kartu terlihat
       seperti tiga modul berbeda. Yang diukur di sini jarak antar kotak
       yang benar-benar dirender, bukan angka di CSS. */
    (function () {
      function nama(d) {
        var b = d.querySelector('.gt-card-head b');
        return b ? b.textContent.trim() : '?';
      }
      var semua = [].slice.call(document.querySelectorAll('#geotoolsTabGeoFarm > details, #geotoolsTabGeoFarm > div > details'));
      var gap = [];
      for (var i = 1; i < semua.length; i++) {
        var a = semua[i - 1].getBoundingClientRect();
        var b = semua[i].getBoundingClientRect();
        gap.push({ dari: nama(semua[i - 1]), ke: nama(semua[i]), px: Math.round(b.top - a.bottom) });
      }
      catat('kartu di panel', semua.map(nama).join(' | '));
      catat('jarak antar kartu', gap.map(function (g) { return g.dari + ' -> ' + g.ke + ' = ' + g.px + 'px'; }).join('  '));
      var unik = gap.map(function (g) { return g.px; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
      ok('jarak antar kartu seragam', unik.length === 1, unik.join(','));
      ok('jarak antar kartu > 0 (tidak menempel)', gap.length > 0 && unik[0] > 0, unik.join(','));
      /* Jarak menuju kartu pertama datang dari margin-bottom paragraf
         pengantar panel, jadi itu boleh lebih besar; yang diperiksa di
         sini hanya jarak antar kartu. */
      ok('semua jarak antar kartu tidak negatif', gap.every(function (g) { return g.px >= 0; }),
        gap.map(function (g) { return g.px; }).join(','));
    })();
    Object.keys(peta).forEach(function (k) {
      var d = peta[k];
      ok(k + ' mulai terlipat', d.open === false);
      var body = d.querySelector('.geofarm-ref-body');
      var vis = getComputedStyle(body).display;
      ok(k + ' body tidak tampil saat terlipat', vis === 'none', vis);
      var head = d.querySelector('.gt-card-head');
      ok(k + ' kepala tetap terlihat', getComputedStyle(head).display !== 'none');
      ok(k + ' kepala punya tinggi', head.getBoundingClientRect().height > 20,
        head.getBoundingClientRect().height);
    });
    catat('tinggi kepala', Math.round(peta.kamus.querySelector('.gt-card-head').getBoundingClientRect().height));

    /* 2. Sebelum satu pun kartu dibuka, tidak boleh ada file data yang
       sudah ditarik. performance.getEntriesByType('resource') dipakai
       supaya       yang diperiksa adalah yang benar-benar lewat jaringan, bukan
       sekadar isi DOM. */
    (function () {
      var req = performance.getEntriesByType('resource').map(function (r) { return r.name; });
      var data = req.filter(function (n) { return /pertanian/.test(n); });
      ok('tidak ada file data yang diminta sebelum kartu dibuka', data.length === 0, data.join(','));
      catat('resource saat awal', req.length);
    })();

    /* 3. Buka satu per satu; tiap kartu harus memuat file sendiri. */
    var urutan = ['kamus', 'opete', 'pestisida', 'artikel'];
    var i = 0;
    function lanjut() {
      if (i >= urutan.length) { selesai(); return; }
      var key = urutan[i++];
      var d = peta[key];
      d.open = true;
      d.dispatchEvent(new Event('toggle'));
      var t0 = Date.now();
      (function tunggu() {
        var st = d.querySelector('[data-ref-status]');
        var list = d.querySelector('[data-ref-list]');
        if (Date.now() - t0 > 20000) { ok(key + ' termuat', false, st.textContent); return lanjut(); }
        if (!/hasil|artikel|istilah|penyakit|produk/.test(st.textContent) || /Mengambil/.test(st.textContent)) {
          return setTimeout(tunggu, 120);
        }
        catat(key + ' status', st.textContent);
        catat(key + ' ms', Date.now() - t0);
        var n = list.querySelectorAll('.geofarm-ref-row, .geofarm-ref-item').length;
        ok(key + ' list terisi', n > 0, n);
        ok(key + ' list dibatasi 20 baris', n <= 20, n);
        ok(key + ' status tidak error', !/Gagal/.test(st.textContent), st.textContent);
        ok(key + ' status tidak menampilkan ukuran file',
          !/\d+\s*(KB|MB)/.test(st.textContent), st.textContent);
        ok(key + ' tidak ada lencana ukuran/jumlah di kepala',
          d.querySelector('[data-ref-count]') === null && !/gt-card-count/.test(d.innerHTML));
        ok(key + ' kepala tidak menampilkan "KB" atau "MB"',
          !/\d+\s*(KB|MB)/.test(d.querySelector('.gt-card-head').textContent),
          d.querySelector('.gt-card-head').textContent.trim());
        ok(key + ' tombol muat-lagi tampil', d.querySelector('[data-ref-more]').hidden === false);

        /* 4. Ketik satu kata, daftar harus menyaring. */
        var cari = d.querySelector('[data-ref-cari]');
        var sebelum = list.innerHTML;
        var v = key === 'kamus' ? 'lahan' : key === 'opete' ? 'spodoptera' : key === 'pestisida' ? 'glifosat' : 'anggrek';
        cari.value = v;
        cari.dispatchEvent(new Event('input'));
        setTimeout(function () {
          ok(key + ' pencarian menyaring', list.innerHTML !== sebelum, JSON.stringify(list.innerHTML.slice(0, 80)));
          ok(key + ' status menyebut jumlah hasil', /hasil dari/.test(st.textContent) || /Tidak ada/.test(st.textContent),
            st.textContent);
          /* 5. Buka entri pertama: isi panjang harus benar-benar muncul. */
          cari.value = '';
          cari.dispatchEvent(new Event('input'));
          setTimeout(function () {
            /* Kamus sengaja memakai dua baris biasa, bukan <details>:
               isinya pendek dan tidak perlu<details> sendiri. */
            var it = list.querySelector('details.geofarm-ref-item');
            if (key === 'kamus') {
              ok('kamus memakai baris datar (bukan details)', list.querySelectorAll('.geofarm-ref-row').length > 0);
              var row = list.querySelector('.geofarm-ref-row');
              ok('baris kamus punya istilah + arti', !!row && row.querySelector('b') && row.querySelector('span'),
                row ? row.textContent : 'tidak ada');
            } else if (it) {
              it.open = true;
              var ib = it.querySelector('.geofarm-ref-item-body');
              ok(key + ' isi entri tampil saat dibuka', getComputedStyle(ib).display !== 'none');
              ok(key + ' isi entri punya konten', ib.textContent.trim().length > 20, ib.textContent.trim().length);
            } else {
              ok(key + ' entri pertama bertipe details', false, 'tidak ada .geofarm-ref-item');
            }
            /* 6. Poster yang gagal dimuat harus disembunyikan, bukan
               meninggalkan kotak kosong setinggi 190px. */
            var img = list.querySelector('img.geofarm-ref-poster');
            if (img) {
              /* Ganti ke URL yang pasti gagal supaya error-nya dipancing. */
              var uji = document.createElement('img');
              uji.className = 'geofarm-ref-poster';
              uji.src = '/__tidak-ada-' + key + '.jpg';
              list.appendChild(uji);
              setTimeout(function () {
                ok(key + ' poster gagal disembunyikan (tidak ada kotak kosong)',
                  uji.style.display === 'none', uji.style.display || '(kosong)');
                ok('tidak ada handler sebaris di markup',
                  !/\sonerror=/.test(document.querySelector('.geofarm-ref').innerHTML));
                uji.remove();
                lanjut();
              }, 400);
              return;
            }
            /* 6. Saringan kategori (kartu opete saja). */
            var f = d.querySelector('[data-ref-filter]');
            if (f) {
              ok('saringan tampil setelah data ada', f.hidden === false);
              ok('slinger punya opsi', f.options.length === 3, f.options.length);
              f.value = 'Hama';
              f.dispatchEvent(new Event('change'));
              ok('saringan Hama berlaku', /hasil dari/.test(st.textContent), st.textContent);
              f.value = '';
              f.dispatchEvent(new Event('change'));
            } else {
              ok('kartu tanpa saringan benar-benar tidak punya select', true);
            }
            /* 7. Konten yang disisipkan harus punya gaya, bukan HTML telanjang. */
            var k = list.querySelector('.geofarm-ref-konten p, .geofarm-ref-konten td, .geofarm-ref-konten li');
            if (k) {
              var fs2 = parseFloat(getComputedStyle(k).fontSize);
              ok(key + ' isi artikel/tabel punya ukuran font masuk akal', fs2 >= 8 && fs2 <= 20, fs2);
              catat(key + ' font isi', fs2);
            }
            lanjut();
          }, 260);
        }, 300);
      })();
    }
    lanjut();

    function selesai() {
    /* Dihitung dari sisi server: ini bukti keras bahwa tiap file benar-benar
       diminta tepat sekali, tidak menggandakan. Server mengembalikan
       daftarnya lewat endpoint kecil; synchronous XHR dipakai karena di
       akhir harness tidak boleh ada promise yang belum selesai. */
    var req = (function () {
      try {
        var x = new XMLHttpRequest();
        x.open('GET', '/__req', false);
        x.send();
        return JSON.parse(x.responseText);
      } catch (e) { return ['GAGAL: ' + e]; }
    })();
    ok('tepat 4 file data yang diminta, masing-masing sekali',
      req.length === 4 && req.filter(function (v, i, a) { return a.indexOf(v) === i; }).length === 4, req.join(','));
    ok('file yang diminta persis empat data yang ada',
      req.slice().sort().join(',') === [
        '/assets/data/pertanian/blog.js', '/assets/data/pertanian/kamus.js',
        '/assets/data/pertanian/opete.js', '/assets/data/pertanian/pestisida.js'
      ].sort().join(','), req.join(','));
    catat('total request data', req.length);
      var d = document.createElement('div');
      d.id = 'out';
      d.textContent = (F === 0 ? 'LULUS' : 'GAGAL') + ' ' + S + ' lulus, ' + F + ' gagal\\n' +
        window.__hasil.langkah.join('\\n');
      document.body.appendChild(d);
    }
  } catch (e) {
    var d = document.createElement('div');
    d.id = 'out';
    d.textContent = 'ERROR HARNESS ' + (e && e.stack ? e.stack : e);
    document.body.appendChild(d);
  }
});
</script>
</body></html>`;

const reqPertanian = [];
const server = http.createServer(function (req, res) {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  if (p === '/__req') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(reqPertanian));
  }
  if (/\/assets\/data\/pertanian\//.test(p)) reqPertanian.push(p);
  if (p === '/__harness.html') {
    res.writeHead(200, { 'content-type': TIPE['.html'] });
    return res.end(HALAMAN.replace('__PANEL__', panelHtml()));
  }
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('tidak ada');
  }
  res.writeHead(200, { 'content-type': TIPE[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

/* Potong SELURUH panel #geotoolsTabGeoFarm dari index.html, bukan cuma
   grup Referensi. Alasannya jarak antar kartu: jarak antara kartu Kalkulator
   dan kartu Referensi pertama hanya terlihat kalau kartu Kalkulator ikut
   dirender. Dulu jaraknya 14px vs 8px dan tidak ada yang mengetahuinya. */
function panelHtml() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dari = html.indexOf('<div id="geotoolsTabGeoFarm"');
  if (dari < 0) throw new Error('panel #geotoolsTabGeoFarm tidak ditemukan di index.html');
  const potong = potongElemen(html, dari, 'div');
  if (!potong) throw new Error('panel #geotoolsTabGeoFarm tidak tertutup');
  return potong;
}

/* Pencocokan kedalaman <div>; sama seperti di test-referensi-geofarm.cjs. */
function potongElemen(html, dari, tag) {
  const re = new RegExp('<' + tag + '\\b|</' + tag + '>', 'g');
  re.lastIndex = dari;
  let depth = 0, m;
  while ((m = re.exec(html))) {
    if (m[0].charAt(1) === '/') {
      depth--;
      if (depth === 0) return html.slice(dari, re.lastIndex);
    } else {
      depth++;
    }
  }
  return '';
}

/* Chrome dijalankan dengan spawn, BUKAN execFileSync. execFileSync
   memblokir event loop Node, jadi server HTTP di file ini tidak akan pernah
   menjawab permintaan dari halaman — dan fetch() di dalam modul pun tidak
   akan pernah resolve. */
const { spawn } = require('child_process');

function jalankanChrome(args, ms) {
  return new Promise(function (res) {
    const p = spawn(CHROME[0], args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    p.stdout.on('data', function (d) { out += d; });
    const t = setTimeout(function () { p.kill('SIGKILL'); }, ms);
    p.on('error', function (e) { clearTimeout(t); res({ dom: '', err: String(e) }); });
    p.on('close', function () { clearTimeout(t); res({ dom: out, err: '' }); });
  });
}

server.listen(0, '127.0.0.1', async function () {
  const port = server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gfref-'));
  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--disable-dev-shm-usage', '--user-data-dir=' + profile, '--window-size=1280,2400',
    '--virtual-time-budget=120000', '--dump-dom', 'http://127.0.0.1:' + port + '/__harness.html'
  ];
  const { dom, err } = await jalankanChrome(args, 90000);
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
  if (err) console.log('chrome gagal: ' + err);

  const m = /<div id="out">([\s\S]*?)<\/div>/.exec(dom);
  if (!m) {
    console.log('HARNESS TIDAK SELESAI. Doma mungkin terpotong. Panjang doma: ' + dom.length);
    const ada = dom.indexOf('geofarm-ref');
    console.log('marker geofarm-ref di doma: ' + (ada === -1 ? 'tidak ada' : ada));
    process.exit(1);
  }
  const teks = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  console.log(teks);
  process.exit(/GAGAL|ERROR HARNESS/.test(teks) ? 1 : 0);
});
