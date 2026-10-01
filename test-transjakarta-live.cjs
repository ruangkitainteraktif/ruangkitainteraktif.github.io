/* Harness live: buktikan L.geoJSON + fitBounds benar-benar bekerja
 * dengan data asli JakartaSatu. Ini yang tidak bisa dibuktikan test
 * offline -- bug esriJSON dulu lolos karena fixture-nya sudah GeoJSON.
 *
 * Jalankan: node test-transjakarta-live.cjs */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
].filter(p => { try { return fs.existsSync(p); } catch (e) { return false; } });

if (!CHROME.length) { console.log('  Chrome tidak ada, tes live dilewati.'); process.exit(0); }

const html = path.join(__dirname, 'test-transjakarta-live.html');
const url = 'file:///' + html.replace(/\\/g, '/');

let dom = '';
try {
  dom = execFileSync(CHROME[0], [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--window-size=760,1200',
    '--virtual-time-budget=90000', '--dump-dom', url
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  console.log('  Chrome gagal dijalankan, tes dilewati: ' + e.message);
  process.exit(0);
}

const i = dom.indexOf('<div id="out">');
if (i < 0) { console.log('  Harness tidak menghasilkan output.'); process.exit(1); }
const j = dom.indexOf('</div>', i + 14);
const teks = dom.slice(i + 14, j)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

console.log(teks);
const m = teks.match(/(\d+) lulus, (\d+) gagal/);
if (!m) process.exit(1);
process.exit(parseInt(m[2], 10) === 0 ? 0 : 1);