/* Memeriksa nesting tag pada kartu GeoFarm Analisis di index.html.
   HTML yang tidak seimbang merusak seluruh tab GeoTools, jadi ini diperiksa
   dengan menghitung <section>/<details>/<div> sungguhan, bukan perkiraan. */
const fs = require('fs');
const path = require('path');

const h = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const MULAI = '<section class="geofarm-card"';
const i = h.indexOf(MULAI);
if (i < 0) { console.log('  kartu tidak ditemukan'); process.exit(1); }

// Cari </section> penutup dengan menelusuri nesting section. Opening menambah
// depth dulu, baru closing yang menguranginya -- kalau tidak, tag pembuka kartu
// ini sendiri tidak pernah terhitung dan </section>-nya yang pertama milik
// section berikutnya akan tertangkap.
let depth = 0, end = -1, k = i;
while (k < h.length) {
  const no = h.indexOf('<', k);
  if (no < 0) break;
  if (h.startsWith('<section', no)) { depth++; k = no + 8; continue; }
  if (h.startsWith('</section', no)) {
    depth--;
    if (depth === 0) { end = no; break; }
    k = no + 10; continue;
  }
  k = no + 1;
}
if (end < 0) { console.log('  </section> penutup tidak ditemukan'); process.exit(1); }

const seg = h.slice(i, end + '</section>'.length);
console.log('  kartu dari offset ' + i + ' sampai ' + end + ' (' + seg.length + ' karakter)');

const buka = n => (seg.match(new RegExp('<' + n + '[ >]', 'g')) || []).length;
const tutup = n => (seg.match(new RegExp('</' + n + '>', 'g')) || []).length;

let bad = 0;
['section', 'details', 'summary', 'div', 'ol', 'ul', 'li', 'dl', 'dt', 'dd', 'p', 'button', 'span']
  .forEach(n => {
    const b = buka(n), c = tutup(n);
    if (b !== c) { bad++; console.log('  TIDAK SEIMBANG  ' + n + ': buka=' + b + ' tutup=' + c); }
    else console.log('  ok   ' + n.padEnd(9) + ' buka=' + String(b).padEnd(3) + ' tutup=' + c);
  });

// Elemen yang tidak punya tag penutup.
const voidTags = ['input', 'br', 'hr', 'img'];
voidTags.forEach(n => {
  const b = buka(n);
  console.log('  ok   ' + n.padEnd(9) + ' (void) ' + b + ' kali');
});

// Atribut penting untuk aksesibilitas.
const perlu = [
  [/aria-labelledby="geofarmCardTitle"/, 'kartu punya aria-labelledby'],
  [/id="geofarmCardTitle"/, 'judul kartu punya id'],
  [/class="geofarm-guide"/, 'panduan ada'],
  [/class="geofarm-guide-summary"/, 'panduan punya summary'],
  [/id="geofarmDrawPolygonBtn"/, 'tombol buat polygon ada'],
  [/id="geofarmUploadBtn"/, 'tombol unggah polygon ada'],
  [/id="geofarmOpenAnalysisBtn"/, 'tombol buka analisis ada'],
  [/id="geofarmUploadInput"/, 'input file ada'],
  [/id="geofarmUploadStatus"/, 'status upload ada']
];
console.log('');
perlu.forEach(([re, nama]) => {
  if (re.test(seg)) console.log('  ok   ' + nama);
  else { bad++; console.log('  HILANG  ' + nama); }
});

// id harus unik di seluruh dokumen.
console.log('');
['geofarmCardTitle', 'geofarmDrawPolygonBtn', 'geofarmUploadBtn', 'geofarmOpenAnalysisBtn',
  'geofarmUploadInput', 'geofarmOpenCount', 'geofarmOpenPending', 'geofarmUploadStatus']
  .forEach(id => {
    const n = (h.match(new RegExp('id="' + id + '"', 'g')) || []).length;
    if (n === 1) console.log('  ok   id "' + id + '" unik');
    else { bad++; console.log('  DUPLIKAT/HILANG  id "' + id + '": ' + n + ' kali'); }
  });

/* Panduan ditulis untuk pembaca n   non-pertanian. Yang diperiksa di sini bukan hanya strukturnya, tapi isi
   dan bahasanya: istilah teknis harus ada
   penjelasannya, dan hal yang mudah disalahpahami harus diberi peringatan
   eksplisit -- bukan diserahkan ke pembaca. */
console.log('\n  Isi panduan (untuk pembaca non-pertanian):');
const teksPanduan = (seg.match(/<div class="geofarm-guide-body">([\s\S]*?)<\/div>\s*<\/details>/) || [])[1] || '';
const polos = teksPanduan.replace(/<[^>]+>/g, ' ').replace(/&mdash;/g, '-').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');

if (!teksPanduan) { bad++; console.log('  HILANG  isi panduan tidak terbaca'); }
else {
  // Lima langkah utama. Hitungan <li> sederhana tidak bisa dipakai: di dalam
  // langkah "Pilih mode analisis" ada <ul> berisi dua pilihan, jadi totalnya
  // 7 dan akan salah menghitung langkah. Yang dihitung hanya <li>
  // di kedalaman teratas.
  const langkahUtama = (teksPanduan.match(/<ol class="geofarm-guide-steps">([\s\S]*?)<\/ol>/) || [])[1] || '';
  let li = 0, kedalaman = 0;
  const reLi = /<(\/?)li>/g;
  let mLi;
  while ((mLi = reLi.exec(langkahUtama)) !== null) {
    if (mLi[1] === '') { if (kedalaman === 0) li++; kedalaman++; }
    else kedalaman--;
  }
  if (li === 5) console.log('  ok   5 langkah utama');
  else { bad++; console.log('  HILANG  langkah utama: ' + li + ' (harusnya 5)'); }

  // Istilah teknis yang dipakai harus punya penjelasan.
  [['NDVI', 'kesuburan'], ['NDMI', 'lembap'], ['NDWI', 'permukaan'],
   ['NDRE', 'daun'], ['LST', 'suhu permukaan'], ['Kelembapan Tanah', 'kedalaman']]
    .forEach(([istilah, kataKunci]) => {
      const adaIstilah = new RegExp('>' + istilah + '<').test(teksPanduan);
      const adaPenjelasan = new RegExp(kataKunci, 'i').test(polos);
      if (adaIstilah && adaPenjelasan) console.log('  ok   ' + istilah + ' dijelaskan ("' + kataKunci + '")');
      else { bad++; console.log('  HILANG  ' + istilah + ': istilah=' + adaIstilah + ' penjelasan=' + adaPenjelasan); }
    });

  // Dua mode harus dijelaskan sebagai pilihan, bukan hanya namanya.
  if (/Otomatis/.test(polos) && /Mandiri/.test(polos) && /cephat|murah|cepat/i.test(polos)) {
    console.log('  ok   dua mode dijelaskan, termasuk kapan memilih yang cepat');
  } else { bad++; console.log('  HILANG  penjelasan per mode kurang'); }

  // Peringatan untuk hal yang mudah disalahpahami. Ini inti panduan untuk
  // non-pertanian: angka mana yang tidak boleh dipakai langsung.
  if (/awan/i.test(polos) && /perkiraan|tidak masuk akal/i.test(polos)) {
    console.log('  ok   awan dijelaskan sebagai sumber kesalahan');
  } else { bad++; console.log('  HILANG  penjelasan awan'); }

  if (/bukan[^.]*jumlah air|siram/i.test(polos)) {
    console.log('  ok   kebutuhan air ditegaskan bukan takaran penyiraman');
  } else { bad++; console.log('  HILANG  peringatan soal takaran penyiraman'); }

  // Sumber data disebut, biar angka bisa ditelusuri.
  if (/Sentinel-2/.test(polos) && /Open-Meteo/.test(polos)) {
    console.log('  ok   sumber data disebut (Sentinel-2, Open-Meteo)');
  } else { bad++; console.log('  HILANG  sumber data tidak disebut'); }

  // Istilah singkatan dicek apakah punya penjelasan di glosarium. Kalau ada
  // singkatan tanpa penjelasan, panduan ini tidak berguna untuk non-pertanian.
  const singkatan = (polos.match(/\b[A-Z]{3,6}\b/g) || []);
  const tanpaPenjelasan = singkatan.filter(s =>
    !new RegExp(s + '[- ]+(tinggi|rendah|agak|basah|kering|baik|normal)', 'i').test(polos) &&
    !new RegExp(s).test(polos.replace(s, '')) // ada penjelasan elsewhere
  );
  const perluJelas = singkatan.filter(s => ['NDVI', 'NDMI', 'NDWI', 'NDRE', 'LST', 'ETc', 'Kc'].includes(s));
  console.log('  info singkatan teknis yang muncul: ' +
    (perluJelas.length ? perluJelas.join(', ') : 'tidak ada'));

  // Panjang wajar: panduan yang terlalu panjang tidak akan dibaca.
  if (polos.length < 6000) console.log('  ok   panjang ' + polos.length + ' karakter (wajar dibaca)');
  else { bad++; console.log('  PANJANG  ' + polos.length + ' karakter, terlalu panjang'); }
}

// Tombol polygon tidak boleh berdiri sendiri di luar kartu.
const diLuarKartu = h.indexOf('id="geofarmDrawPolygonBtn"') < i;
if (!diLuarKartu) console.log('  ok   tombol buat polygon berada DI DALAM kartu');
else { bad++; console.log('  MASALAH  tombol buat polygon berada di luar kartu'); }

console.log('');
console.log(bad === 0 ? '  STRUKTUR SEHAT' : '  ' + bad + ' MASALAH');
process.exit(bad === 0 ? 0 : 1);
