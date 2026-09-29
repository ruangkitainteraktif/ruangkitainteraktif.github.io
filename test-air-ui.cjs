/* Uji airSectionHtml + airBlockHtml: hasil HTML harus well-formed (tag <div>
   berpasangan) dan tidak boleh memuat 'undefined' atau 'NaN' yang akan
   tampil mentah di UI. Div yang tidak seimbang akan merusak seluruh kartu
   polygon, jadi di sini dihitung tag-nya secara literal. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(
  path.join(__dirname, 'assets', 'js', 'polygon-analysis.js'), 'utf8');

/* Ekstraksi fungsi berbasis pencocokan kurung kurawal, bukan regex.
   Regex /function f\([\s\S]*?\n  \}/ memotong fungsi di dalam blok if
   begitu penutup blok tersebut berada di kolom yang sama. */
function potong(nama) {
  const m = SRC.match(new RegExp('^\\s*(?:async\\s+)?function ' + nama + '\\(', 'm'));
  if (!m) { console.error('tidak ditemukan: ' + nama); process.exit(1); }
  const mulai = SRC.indexOf('{', m.index);
  let depth = 0, i = mulai;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) { console.error('kurung kurawal tidak seimbang di ' + nama); process.exit(1); }
  return SRC.slice(m.index, i + 1);
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}

const stub = `
function escapeHtml(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function fmt(v,d){return Number.isFinite(v)?v.toLocaleString('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d}):'-';}
function isSectionCollapsed(item,s){return !!(item.collapsed&&item.collapsed[s]);}
function sectionHeadHtml(item,section,title){return '<div class="pa-section-head"><span class="pa-section-title">'+escapeHtml(title)+'</span></div>';}
// Ikon di berkas aslinya adalah const terpisah supaya warnanya ikut
// currentColor; airSectionHtml() memakainya langsung. Stub menyalinnya agar
// fungsi itu tetap bisa dijalankan di luar DOM.
var ICON_CALC = '<svg class="pa-air-calc-ico"></svg>';
var ICON_SPIN = '<svg class="pa-air-calc-ico is-spin"></svg>';
var ICON_CHEVRON = '<svg class="pa-air-caret"></svg>';
var window = { WaterNeed: WATERNEED };
`;

const WATERNEED = {
  BULAN: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'],
  FORECAST_DAYS: 16,
  daftarTanaman: function () {
    return [{ id: 'padi', nama: 'Padi' }, { id: 'jagung', nama: 'Jagung' }];
  },
  _fmtAngka: function (v) { return String(Math.round(v)); },
  _escapeHtml: function (v) { return String(v); },
  _tabelTahapHtml: function (e) {
    return e.perTahap.map(function (s) {
      return '<div class="pa-air-row"><span>' + s.nama + '</span><span>ETc ' + Math.round(s.etc) + ' mm</span></div>';
    }).join('');
  }
};

const ctx = { Math, Array, JSON, Number, String, console, WATERNEED };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(
  stub + '\n' + potong('airTanamanOptions') + '\n' + potong('airBlockHtml') + '\n' + potong('airSectionHtml')
  + '\nthis.airSectionHtml = airSectionHtml; this.airBlockHtml = airBlockHtml;', ctx);
const airSectionHtml = ctx.airSectionHtml;
const airBlockHtml = ctx.airBlockHtml;

function tagBalance(html) {
  const buka = (html.match(/<div\b/g) || []).length;
  const tutup = (html.match(/<\/div>/g) || []).length;
  return { buka: buka, tutup: tutup };
}

const hasil = {
  tanaman: { id: 'padi', nama: 'Padi', catatan: 'Butuh genangan tipis saat tahap vegetatif.' },
  bulanan: {
    perBulan: [3.5, 3.4, 3.7, 3.6, 3.5, 3.4, 3.8, 4.3, 4.5, 4.5, 3.6, 3.6],
    sumber: 'Open-Meteo Archive, rata-rata 2021-2025',
    perkiraan: false
  },
  harian: { sumber: 'Open-Meteo Forecast, 16 hari' },
  rerataEt0Harian: 4.52,
  etc: {
    totalHari: 125,
    etcTotal: 679,
    perTahap: [
      { nama: 'Inisiasi', hari: 20, kc: 1.05, etc: 103 },
      { nama: 'Pengembangan', hari: 35, kc: 1.20, etc: 207 },
      { nama: 'Tengah', hari: 40, kc: 1.20, etc: 236 },
      { nama: 'Akhir', hari: 30, kc: 0.90, etc: 133 }
    ]
  }
};

console.log('\n1. Section kosong (belum dihitung)');
const itemKosong = { id: 1, areaHa: 2.5, collapsed: { air: true }, air: null, airError: null, airBusy: false, airTanamanId: 'padi' };
let html = airSectionHtml(itemKosong);
let b = tagBalance(html);
ok('<div> seimbang', b.buka === b.tutup, b.buka + ' buka vs ' + b.tutup + ' tutup');
ok('memuat judul "Kebutuhan Air Tanaman"', html.indexOf('Kebutuhan Air Tanaman') !== -1);
ok('ada tombol hitung', html.indexOf('data-pa-action="air"') !== -1);
ok('ada select tanaman', html.indexOf('data-pa-air-crop') !== -1);
ok('opsi Padi terpilih', /value="padi"[^>]*selected/.test(html));
ok('ada 2 opsi tanaman', (html.match(/<option/g) || []).length === 2, (html.match(/<option/g) || []).length);
ok('tidak ada NaN', html.indexOf('NaN') === -1);
ok('tidak ada "undefined"', html.indexOf('undefined') === -1);
ok('status sibuk tidak muncul saat idle', html.indexOf('Menghitung') === -1);

// Keadaan sibuk: ikon berputar dan tombol nonaktif hanya muncul di sini, jadi
// harus diuji dengan item yang airBusy-nya true -- bukan dari html idle.
const busyHtml = airSectionHtml(Object.assign({}, itemKosong, {
  airBusy: true, busy: 'Mengambil ET0 dari Open-Meteo'
}));
const bBusy = tagBalance(busyHtml);
ok('<div> seimbang saat sibuk', bBusy.buka === bBusy.tutup,
  bBusy.buka + ' buka vs ' + bBusy.tutup + ' tutup');
ok('tidak ada NaN saat sibuk', busyHtml.indexOf('NaN') === -1);

console.log('\n2. Section dengan hasil (ETc terisi)');
const item = Object.assign({}, itemKosong, { air: hasil, collapsed: { air: false } });
html = airSectionHtml(item);
b = tagBalance(html);
ok('<div> seimbang', b.buka === b.tutup, b.buka + ' buka vs ' + b.tutup + ' tutup');
// 679 mm x 2.5 ha x 10 = 16.975 m3. Dihitung dari fixture, bukan diketik
//manual, supaya tidak melenceng kalau fixture berubah.
const volumeHarapan = hasil.etc.etcTotal * 2.5 * 10;
ok('volume 2.5 ha = ' + volumeHarapan.toLocaleString('id-ID') + ' m3',
  html.indexOf(volumeHarapan.toLocaleString('id-ID')) !== -1,
  'dapat: ' + (html.match(/pa-air-hero-val">([\d.]+)/) || [])[1]);
ok('ET0 4.52 mm/hari tampil', html.indexOf('4,52') !== -1);
ok('durasi 125 hari tampil', html.indexOf('125 hari') !== -1);
// Teks tombol sekarang selalu "Hitung" -- tidak lagi berubah jadi "Hitung
// ulang" saat ada hasil, karena judul section sudah menjelaskan apa yang
// dihitung dan label panjang hanya membuat tombol penuh sempit.
ok('tombol tetap "Hitung" walau sudah ada hasil',
  /<button class="pa-air-calc"[^>]*>[\s\S]*?<span>Hitung<\/span>/.test(html),
  (html.match(/<span>[^<]*<\/span>/g) || []).slice(0, 3).join(' '));
ok('tombol memakai kelas ArcGIS pa-air-calc (bukan pa-btn ghost)',
  /class="pa-air-calc"/.test(html) && !/pa-btn pa-btn-ghost"[^>]*data-pa-action="air"/.test(html));
ok('tombol punya ikon kalkulator', /pa-air-calc-ico/.test(html));
ok('tombol punya ikon berputar saat sibuk', /is-spin/.test(busyHtml),
  'hanya muncul ketika airBusy = true');
ok('tombol nonaktif saat sibuk', /class="pa-air-calc"[^>]*disabled/.test(busyHtml));
ok('teks tombol saat sibuk = "Menghitung"', /Menghitung/.test(busyHtml));
ok('select tetap tampil saat sibuk', /pa-air-select/.test(busyHtml));
ok('select punya caret sendiri', /pa-air-caret/.test(html));
ok('catatan memakai kelas template pa-note (sama dengan section lain)',
  /class="pa-note"/.test(html) && !/class="pa-air-note"/.test(html));
ok('kelas pa-air-note yang lama sudah dihapus dari CSS',
  !/pa-air-note/.test(require('fs').readFileSync(require('path').join(__dirname, 'assets', 'css', 'app.css'), 'utf8')));
ok('label Tanaman memakai kelas pa-air-label', /class="pa-air-label"/.test(html));
ok('label Tanaman tidak diindent manual (sejajar isi section)',
  /\.pa-air-label\s*\{[^}]*margin:\s*0 0 3px\s*;/.test(
    require('fs').readFileSync(require('path').join(__dirname, 'assets', 'css', 'app.css'), 'utf8')));
ok('pola ET0 bulanan di dalam details', html.indexOf('<details') !== -1);
ok('sumber Open-Meteo disebut', html.indexOf('Open-Meteo') !== -1);
ok('batas modul dinyatakan', html.indexOf('Batas modul ini') !== -1);
ok('batas ET0 16 hari dinyatakan', html.indexOf('16 hari ke depan') !== -1);
ok('tidak ada NaN', html.indexOf('NaN') === -1);
ok('tidak ada undefined', html.indexOf('undefined') === -1);
ok('tidak ada [object Object]', html.indexOf('[object Object]') === -1);

console.log('\n3. Block saja (tanpa pembungkus section)');
const blk = airBlockHtml(item);
b = tagBalance(blk);
ok('block <div> seimbang', b.buka === b.tutup, b.buka + ' vs ' + b.tutup);
ok('12 baris bulan ada', (blk.match(/pa-air-month/g) || []).length === 12,
  (blk.match(/pa-air-month/g) || []).length);
ok('4 baris tahap ada', (blk.match(/pa-air-row/g) || []).length >= 4);

console.log('\n4. Error');
const itemErr = Object.assign({}, itemKosong, { airError: 'Gagal ambil data' });
const blkErr = airBlockHtml(itemErr);
ok('pesan error tampil', blkErr.indexOf('Gagal ambil data') !== -1);
ok('error tidak membuat NaN', blkErr.indexOf('NaN') === -1);
b = tagBalance(blkErr);
ok('block error <div> seimbang', b.buka === b.tutup, b.buka + ' vs ' + b.tutup);

console.log('\n5. Luas 0 (polygon tanpa luas) tidak boleh menghasilkan NaN');
const itemNol = Object.assign({}, itemKosong, { air: hasil, areaHa: 0, collapsed: { air: false } });
const blkNol = airBlockHtml(itemNol);
ok('tidak ada NaN dengan luas 0', blkNol.indexOf('NaN') === -1);
ok('tidak ada Infinity dengan luas 0', blkNol.indexOf('Infinity') === -1);
b = tagBalance(blkNol);
ok('tetap seimbang', b.buka === b.tutup, b.buka + ' vs ' + b.tutup);

console.log('\n6. Fallback perkiraan (kuota habis) diberi label');
const itemPerkiraan = Object.assign({}, item, {
  air: Object.assign({}, hasil, {
    bulanan: Object.assign({}, hasil.bulanan, {
      perkiraan: true, sumber: 'Perkiraan kasar, kuota Open-Meteo habis'
    })
  })
});
const blkP = airBlockHtml(itemPerkiraan);
ok('ditandai sebagai perkiraan', blkP.indexOf('Kuota Open-Meteo habis') !== -1);
ok('peringatan tidak untuk keputusan irigasi', blkP.indexOf('bukan untuk keputusan irigasi') !== -1);

console.log('\n7. Nama tanaman berisi HTML harus di-escape');
const itemXss = Object.assign({}, item, {
  air: Object.assign({}, hasil, { tanaman: { id: 'x', nama: '<b>Padi</b>', catatan: '' } })
});
const blkX = airBlockHtml(itemXss);
ok('tag <b> tidak lolos ke HTML', blkX.indexOf('<b>Padi</b>') === -1);
ok('nilai tetap terbaca sbg teks', blkX.indexOf('&lt;b&gt;Padi&lt;/b&gt;') !== -1);

/* 8. REGRESI: section air harus muncul untuk polygon yang BELUM dianalisis.
   Ini bug yang pernah terjadi -- airSectionHtml sempat diletakkan SETELAH
   `if (!item.analyzed) return ...`, jadi section baru tampil setelah Analisis
   (NDVI + DEM) selesai, padahal user yang baru selesai menggambar tidak
   akan pernah melihatnya. Diuji di tingkat sumber karena itu masalah
   struktur, bukan perilaku runtime. */
console.log('\n8. Regression: air terlihat tanpa harus Analisis');
const srcHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
ok('water-need.js dimuat di index.html',
  /<script src="assets\/js\/water-need\.js/.test(srcHtml));
ok('polygon-analysis.js tetap dimuat',
  /<script src="assets\/js\/polygon-analysis\.js/.test(srcHtml));

const cabangBelum = SRC.match(/if \(!item\.analyzed\) return cardOpen \+ head \+ cardInfo([^;]*);/);
ok('baris early-return untuk polygon belum dianalisis ditemukan', !!cabangBelum);
ok('cabang itu memanggil airSectionHtml',
  !!cabangBelum && /airSectionHtml\(item\)/.test(cabangBelum[1]),
  cabangBelum ? 'argumen: ' + cabangBelum[1].trim() : 'tidak ketemu');
// Hitung titik PEMANGGILAN saja; definisi `function airSectionHtml(item)`
// juga memuat pola yang sama, jadi harus dikecualikan.
const jumlahDefinisi = (SRC.match(/function airSectionHtml/g) || []).length;
const jumlahPanggil = (SRC.match(/airSectionHtml\(item\)/g) || []).length - jumlahDefinisi;
ok('hanya ada satu definisi airSectionHtml', jumlahDefinisi === 1, jumlahDefinisi + ' definisi');
ok('airSectionHtml dipanggil di kedua cabang (belum + sudah analisis)',
  jumlahPanggil === 2, 'ditemukan ' + jumlahPanggil + ' titik pemanggilan');
/* Default air sekarang TERUTUP. Dulu terbuka karena air satu-satunya analisis
   murah; setelah itu ada Mode Mandiri dengan wizard tiga langkah, jadi kartu
   yang terbuka penuh membuat tombolnya tumpang tindih dan membingungkan. */
ok('default air tertutup (air: true)',
  /collapsed:\s*\{[^}]*\bair:\s*true/.test(SRC),
  (/collapsed: \{[^}]*air: \w+/.exec(SRC) || [])[0]);
ok('section air memakai kelas pemisah agar tidak terbaca bagian NDVI',
  /pa-section-air/.test(SRC));
ok('section air punya catatan bahwa terpisah dari citra',
  /Terpisah dari analisis citra/.test(SRC));
ok('listener change terpasang untuk select tanaman',
  /addEventListener\('change',\s*onPanelChange\)/.test(SRC));
ok('aksi "air" terdaftar di dispatcher',
  /action === 'air'/.test(SRC));
// Penjaga: beberapa kali sempat ada kalimat rusak yang bocor ke dalam kode
// (karakter CJK, kata asing, variabel yang tidak pernah ada). Pola ditulis
// dengan escape Unicode supaya berkas ini tetap ASCII murni.
ok('tidak ada variabel tak dikenal di kode air',
  !/FORECAST_DAYS_HARI|\u7ebf\u7a0b|\u60f3\u8981|inam\u4e0d\u5982/.test(SRC),
  (/FORECAST_DAYS_HARI|\u7ebf\u7a0b|\u60f3\u8981|inam\u4e0d\u5982/.exec(SRC) || [])[0]);

console.log('\n' + (fail === 0 ? 'SEMUA LULUS' : 'ADA YANG GAGAL') + ': ' + pass + ' lulus, ' + fail + ' gagal');
process.exit(fail === 0 ? 0 : 1);
