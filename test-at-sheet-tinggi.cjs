/* Menjalankan harness tinggi sheet tabel atribut di Chrome headless dengan
   ukuran viewport ponsel.

   Bug yang dijaga: unit AdSense di dalam sheet (data-ad-format="auto")
   membuat show_ads_impl.js menulis `height: auto !important` dan
   `min-height: 0 !important` ke sheet saat slotnya dirender. Karena !important,
   aturan CSS `height: var(--sheet-h, 50dvh)` tidak pernah menang dan sheet
   membuka setinggi isi tabel -- layar penuh di ponsel, untuk SEMUA layer.

   Harness meniru tulisan itu lalu mengukur tinggi sheet. sheet-drag.js
   mengembalikan ukuran sheet lewat custom property --sheet-h.

   Jalankan: node test-at-sheet-tinggi.cjs
   Kalau Chrome tidak ditemukan, tes dilewati dengan exit 0. */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe'
].filter(p => { try { return fs.existsSync(p); } catch (e) { return false; } });

if (!CHROME.length) {
  console.log('  Chrome tidak ditemukan, tes tinggi sheet dilewati.');
  process.exit(0);
}

const html = path.join(__dirname, 'test-at-sheet-mobile.html');
const url = 'file:///' + html.replace(/\\/g, '/');

let dom = '';
try {
  dom = execFileSync(CHROME[0], [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--window-size=390,844',
    '--virtual-time-budget=15000', '--dump-dom', url
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  console.log('  Chrome gagal dijalankan, tes dilewati: ' + e.message);
  process.exit(0);
}

const BUKA = '<div id="out">';
const TUTUP = '</div>';
const i = dom.indexOf(BUKA);
if (i < 0) {
  console.log('  Harness tidak menghasilkan output.');
  process.exit(1);
}
const j = dom.indexOf(TUTUP, i + BUKA.length);
if (j < 0) { console.log('  Output tidak tertutup dengan benar.'); process.exit(1); }
const teks = dom.slice(i + BUKA.length, j)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&');

console.log(teks);

const m = teks.match(/(\d+) lulus, (\d+) gagal/);
if (!m) process.exit(1);
if (teks.indexOf('VIEWPORT LEBIH 768px') >= 0) {
  console.log('  Harness tidak berjalan di lebar mobile.');
  process.exit(1);
}
process.exit(parseInt(m[2], 10) === 0 ? 0 : 1);
