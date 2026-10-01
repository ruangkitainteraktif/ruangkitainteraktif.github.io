/* Menjalankan harness layer TransJakarta di Chrome headless.
 *
 * Yang diuji:
 *   - 12 koridor punya 12 warna berbeda dan tidak ada duplikat
 *   - rekap menggabungkan 2 arah jadi 1 baris per koridor
 *   - z-index pane di atas terrain, di bawah label
 *   - sheet benar-benar terbuka saat layer dinyalakan, menutup saat mati
 *   - isi sheet: 12 baris, chip warna sama dengan warna peta, 3 kotak
 *     statistik, header sticky
 *   - popup escaped
 *
 * Jalankan: node test-transjakarta.cjs
 * Kalau Chrome tidak ada, dilewati dengan exit 0. */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
].filter(p => { try { return fs.existsSync(p); } catch (e) { return false; } });

if (!CHROME.length) {
  console.log('  Chrome tidak ditemukan, tes TransJakarta dilewati.');
  process.exit(0);
}

const html = path.join(__dirname, 'test-transjakarta.html');
const url = 'file:///' + html.replace(/\\/g, '/');

let dom = '';
try {
  dom = execFileSync(CHROME[0], [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--window-size=760,1200',
    '--virtual-time-budget=60000', '--dump-dom', url
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
if (!m) process.exit(1);
process.exit(parseInt(m[2], 10) === 0 ? 0 : 1);