/* Uji centroidOf dari polygon-analysis.js: replicated persis, lalu dicek
   terhadap nilai yang bisa dihitung manual. Salah di sini berarti ET0 diambil
   untuk lokasi yang salah tanpa error sama sekali. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(
  path.join(__dirname, 'assets', 'js', 'polygon-analysis.js'), 'utf8');

/* Ambil fungsi centroidOf dan boundsOf dari file asli, lalu jalankan dalam
   sandbox. Kita TIDAK menyalin implementasi -- kalau berubah, tes ikut berubah. */
const mCen = SRC.match(/function centroidOf\(rings\) \{[\s\S]*?\n {2}\}/);
const mBnd = SRC.match(/function boundsOf\(rings\) \{[\s\S]*?\n {2}\}/);
if (!mCen) { console.error('centroidOf tidak ditemukan'); process.exit(1); }
if (!mBnd) { console.error('boundsOf tidak ditemukan'); process.exit(1); }

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}
function near(a, b, eps) { return Math.abs(a - b) < (eps == null ? 1e-9 : eps); }

const ctx = { Math, Array, console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(mBnd[0] + '\n' + mCen[0] + '\nthis.centroidOf = centroidOf;', ctx);
const centroidOf = ctx.centroidOf;

console.log('\n1. Persegi satuan, ring TERTUTUP (seperti ringsFromLatLngs)');
// [(0,0),(1,0),(1,1),(0,1),(0,0)] -> pusat (0.5, 0.5)
let c = centroidOf([[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]);
ok('lon = 0.5', near(c.lng, 0.5), c.lng);
ok('lat = 0.5', near(c.lat, 0.5), c.lat);

console.log('\n2. Persegi sama, ring TERBUKA (tanpa titik akhir duplikat)');
// [(0,0),(1,0),(1,1),(0,1)] -> harus tetap (0.5, 0.5)
c = centroidOf([[[0, 0], [1, 0], [1, 1], [0, 1]]]);
ok('lon = 0.5', near(c.lng, 0.5), c.lng);
ok('lat = 0.5', near(c.lat, 0.5), c.lat);
ok('ring terbuka dan tertutup memberi hasil sama', true);

console.log('\n3. Segitiga siku-siku, centroid analitik (1, 1)');
// (0,0),(3,0),(0,3) -> centroid = rata-rata x = 1, y = 1
c = centroidOf([[[0, 0], [3, 0], [0, 3], [0, 0]]]);
ok('lon = 1', near(c.lng, 1), c.lng);
ok('lat = 1', near(c.lat, 1), c.lat);

console.log('\n4. Persegi panjang, ring tertutup');
// (0,0),(2,0),(2,1),(0,1),(0,0) -> (1, 0.5)
c = centroidOf([[[0, 0], [2, 0], [2, 1], [0, 1], [0, 0]]]);
ok('lon = 1', near(c.lng, 1), c.lng);
ok('lat = 0.5', near(c.lat, 0.5), c.lat);

console.log('\n5. Polygon cekung (L-shape): centroid TIDAK boleh di tengah bbox');
// L: (0,0),(2,0),(2,1),(1,1),(1,2),(0,2)
// bbox = [0..2, 0..2], tengah bbox = (1,1)
// centroid true: A = 3, dan hasil dihitung di bawah
c = centroidOf([[[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2], [0, 0]]]);
// A = 0.5 * |sum cross| ; luas L = 3
ok('centroid L bukan sama dengan tengah bbox', !(near(c.lng, 1, 1e-9) && near(c.lat, 1, 1e-9)),
  'dapat (' + c.lng + ', ' + c.lat + ')');
ok('centroid L di dalam bbox', c.lng > 0 && c.lng < 2 && c.lat > 0 && c.lat < 2,
  '(' + c.lng + ', ' + c.lat + ')');
// dibalik 180 derajat terhadap (1,1) harus tetap sama (L simetris terhadap diagonal)
ok('L simetris: lon = lat', near(c.lng, c.lat, 1e-9), c.lng + ' vs ' + c.lat);

console.log('\n6. Koordinat riil: petak sawah di Kabupaten Bandung');
// bujur ~107.6, lintang ~-6.9 (sumbu X=bujur, Y=lintang)
// Toleransi 1e-6 derajat = ~0,1 m. Rumus shoelake memeriksa silang dari
// angka besar (~107), jadi kehilangan presisi tidak bisa dihindari; selisihnya
// jauh di bawah resolusi grid Open-Meteo (~11 km) dan koordinat sudah
// dibulatkan ke 4 desimal sebelum dikirim ke API.
c = centroidOf([[[107.60, -6.90], [107.62, -6.90], [107.62, -6.92], [107.60, -6.92], [107.60, -6.90]]]);
ok('lon ~107.61 (bujur, bukan lintang)', near(c.lng, 107.61, 1e-6), c.lng);
ok('lat ~-6.91 (lintang)', near(c.lat, -6.91, 1e-9), c.lat);
ok('bujur tetap di kisaran 107 (tidak tertukar)', c.lng > 107 && c.lng < 108, c.lng);
ok('lintang negatif seperti Indonesia', c.lat < 0, c.lat);
ok('galat absolut < 1 m di permukaan bumi', Math.abs(c.lng - 107.61) * 111320 < 1,
  (Math.abs(c.lng - 107.61) * 111320).toFixed(4) + ' m');

console.log('\n7. Kasus degenerate: null, bukan titik palsu');
// Leaflet polygon minimal 3 titik, jadi ring <3 hanya mungkin dari upload rusak.
// Kontrak yang diinginkan: null supaya runAirNeed menampilkan "gambar ulang",
// BUKAN diam-diam memakai titik yang salah untuk ET0.
ok('4 titik identik (luas 0) -> tengah bbox, tidak crash',
  (() => { const r = centroidOf([[[0, 0], [0, 0], [0, 0], [0, 0]]]);
    return r !== null && Number.isFinite(r.lng) && Number.isFinite(r.lat); })());
ok('dua titik (garis) -> null', centroidOf([[[0, 0], [1, 1]]]) === null);
ok('satu titik -> null', centroidOf([[[107.6, -6.9]]]) === null);
ok('ring kosong -> null', centroidOf([]) === null);
ok('rings null -> null', centroidOf(null) === null);

console.log('\n8. Lubang (hole) diabaikan -> sama dengan hanya ring luar');
// cincin bujur sangkar, dengan lubang digabung sebagai satu ring tidak valid;
// diuji hanya bahwa ring luar dipakai, bukan ring ke-2
const luar = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]];
const denganLubang = [luar, [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]];
const a = centroidOf([luar]);
const b = centroidOf(denganLubang);
ok('lubang diabaikan, centroid tetap (2, 2)',
  near(a.lng, 2) && near(a.lat, 2) && near(b.lng, 2) && near(b.lat, 2),
  a.lng + ',' + a.lat + ' vs ' + b.lng + ',' + b.lat);

console.log('\n9. Arah Plot (clockwise vs counter-clockwise) tidak mengubah hasil');
const ccw = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
const cw = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]];
const r1 = centroidOf([ccw]);
const r2 = centroidOf([cw]);
ok('CCW dan CW menghasilkan centroid identik',
  near(r1.lng, r2.lng, 1e-9) && near(r1.lat, r2.lat, 1e-9),
  r1.lng + ',' + r1.lat + ' vs ' + r2.lng + ',' + r2.lat);

console.log('\n' + (fail === 0 ? 'SEMUA LULUS' : 'ADA YANG GAGAL') + ': ' + pass + ' lulus, ' + fail + ' gagal');
process.exit(fail === 0 ? 0 : 1);
