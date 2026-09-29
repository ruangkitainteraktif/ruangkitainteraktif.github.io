/* Memeriksa urutan elemen di kartu GeoFarm Analisis.
   Persyaratan: status unggah (#geofarmUploadStatus) harus tepat DI ATAS
   tombol Buka Analisis, supaya pesan "1 poligon dimuat · total 0,21 ha"
   muncul dekat tombol yang terkait aksi tersebut. */
const fs = require('fs');
const path = require('path');

const h = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const i = h.indexOf('<section class="geofarm-card"');
if (i < 0) { console.log('  kartu tidak ditemukan'); process.exit(1); }
const seg = h.slice(i, i + 5600);

console.log('  posisi relatif elemen di dalam kartu:');
const kunci = [
  ['tombol Buat/Unggah', 'geofarm-card-actions'],
  ['status unggah', 'geofarmUploadStatus'],
  ['tombol Buka Analisis', 'geofarmOpenAnalysisBtn'],
  ['input berkas', 'geofarmUploadInput'],
  ['catatan SHP', 'geofarm-shp-note'],
  ['panduan', 'geofarm-guide']
];
const pos = {};
kunci.forEach(([nama, k]) => {
  const a = seg.indexOf('id="' + k + '"');
  const b = seg.indexOf('class="' + k + '"');
  const p = a >= 0 ? a : b;
  pos[k] = p;
  console.log('    ' + nama.padEnd(20) + (p >= 0 ? '@' + p : 'TIDAK ADA'));
});

let fail = 0;
function ok(nama, cond, extra) {
  if (cond) console.log('  ok   ' + nama);
  else { fail++; console.log('  HILANG  ' + nama + (extra ? ' -> ' + extra : '')); }
}

// Syarat utama: status tepat sebelum tombol Buka Analisis, tanpa elemen
// lain di antaranya.
const status = pos['geofarmUploadStatus'];
const buka = pos['geofarmOpenAnalysisBtn'];
ok('status ada dan tombol Buka Analisis ada', status >= 0 && buka >= 0);
ok('status berada SEBELUM tombol Buka Analisis', status < buka,
  'status@' + status + ' buka@' + buka);

/* Yang harus dipastikan: tidak ada elemen LAIN di antara status dan tombol.
   Mengukur jarak karakter tidak berguna, karena jarak itu sudah termasuk sisa
   tag <p>...</p> beserta markup tombol Buka Analisis itu sendiri (SVG dan
   tiga span) -- semuanya memang bagian dari elemen yang dimaksud. */
const diAntara = seg.slice(status, buka);
// Tag <button milik "Buka Analisis" sendiri memang boleh muncul: itu tag
// pembuka elemen yang dituju, bukan elemen yang memisahkan. Yang dicari
// justru elemen LAIN yang muncul sebelum tag itu.
const elemenLain = diAntara
  .replace(/<!--[\s\S]*?-->/g, '')        // komentar tidak dihitung
  .replace(/^[\s\S]*?\/>\s*<\/p>\s*/, '') // sisa tag <p> miliknya sendiri
  .replace(/<button[^>]*$/, '')            // tag pembuka tombol tujuan
  .match(/<\/?(div|section|details|ul|ol|li|table|nav|aside|header|footer|h[1-6]|input|button|select|textarea|img|svg)\b/g) || [];
ok('tidak ada elemen lain di antara status dan tombol',
  elemenLain.length === 0,
  elemenLain.length ? 'ditemukan: ' + elemenLain.join(', ') : '');
ok('jarak tetap wajar (penanda tidak ada blok besar terselip)',
  buka - status < 600, (buka - status) + ' karakter');

ok('status TIDAK lagi setelah catatan SHP',
  pos['geofarm-shp-note'] < 0 || pos['geofarm-shp-note'] > buka,
  'catatan SHP@' + pos['geofarm-shp-note'] + ' buka@' + buka);

// Hanya ada satu elemen status (tidak ada duplikat yang membuat
// getElementById mengambil elemen yang salah).
const jumlah = (h.match(/id="geofarmUploadStatus"/g) || []).length;
ok('hanya ada satu #geofarmUploadStatus', jumlah === 1, jumlah + ' kali');

// Aksesibilitas: role=status supaya screen reader membacakan pesan.
ok('punya role="status"', /id="geofarmUploadStatus"[^>]*role="status"/.test(seg) ||
  /role="status"[^>]*id="geofarmUploadStatus"/.test(seg));
ok('punya aria-live="polite"', /aria-live="polite"/.test(seg));

console.log('');
console.log(fail === 0 ? '  URUTAN SEHAT' : '  ' + fail + ' MASALAH');
process.exit(fail === 0 ? 0 : 1);
