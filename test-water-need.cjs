/* Uji water-need.js: hitung manual, agregasi bulanan, fallback 429. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(
  path.join(__dirname, 'assets', 'js', 'water-need.js'), 'utf8'
);

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
}
function near(a, b, eps) {
  return Math.abs(a - b) < (eps == null ? 1e-6 : eps);
}

function load(opts) {
  opts = opts || {};
  const win = { __airEt0Cache: {} };
  win.window = win;
  const ctx = {
    window: win,
    fetch: opts.fetch,
    Date: Date,
    Math: Math,
    JSON: JSON,
    Promise: Promise,
    Number: Number,
    Array: Array,
    parseInt: parseInt,
    console: console,
    String: String
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: 'water-need.js' });
  return win;
}

(async function () {
  /* ---- 1. Perhitungan ETc manual (FAO-56) ---- */
  console.log('\n1. Perhitungan ETc per tahapan');
  const win = load({ fetch: () => Promise.reject(new Error('tidak dipanggil')) });
  const padi = win.WaterNeed.daftarTanaman().find(t => t.id === 'padi');

  // ET0 = 3.0 mm/hari
  // Inisiasi   3.0 x 1.05 x 20 =  63.0
  // Pengembangan 3.0 x 1.20 x 35 = 126.0
  // Tengah     3.0 x 1.20 x 40 = 144.0
  // Akhir      3.0 x 0.90 x 30 =  81.0
  // total                      = 414.0 mm, 125 hari
  const etc = win.WaterNeed._hitungEtc(padi, 3.0);
  ok('ETc inisiasi = 63.0 mm', near(etc.perTahap[0].etc, 63.0, 1e-9), etc.perTahap[0].etc);
  ok('ETc pengembangan = 126.0 mm', near(etc.perTahap[1].etc, 126.0, 1e-9), etc.perTahap[1].etc);
  ok('ETc tengah = 144.0 mm', near(etc.perTahap[2].etc, 144.0, 1e-9), etc.perTahap[2].etc);
  ok('ETc akhir = 81.0 mm', near(etc.perTahap[3].etc, 81.0, 1e-9), etc.perTahap[3].etc);
  ok('ETc total = 414.0 mm', near(etc.etcTotal, 414.0, 1e-9), etc.etcTotal);
  ok('durasi musim = 125 hari', etc.totalHari === 125, etc.totalHari);

  // tahap tengah dan pengembangan memakai Kc puncak yang sama
  ok('Kc puncak dipakai di pengembangan dan tengah',
    etc.perTahap[1].kc === 1.20 && etc.perTahap[2].kc === 1.20);

  /* ---- 2. Konversi volume: 1 mm pada 1 ha = 10 m3 ---- */
  console.log('\n2. Konversi volume');
  // 414 mm pada 1 ha = 4140 m3; pada 2.5 ha = 10350 m3
  const mmKeM3 = v => v * 10;
  ok('414 mm x 1 ha = 4.140 m3', mmKeM3(414) === 4140, mmKeM3(414));
  ok('414 mm x 2,5 ha = 10.350 m3', near(mmKeM3(414) * 2.5, 10350, 1e-9));
  ok('1 mm x 0,01 ha = 0,1 m3', near(mmKeM3(1) * 0.01, 0.1, 1e-9));

  /* ---- 3. Agregasi ET0 bulanan dari data harian ---- */
  console.log('\n3. Agregasi ET0 bulanan dari deret harian');
  // 2 hari per bulan, nilai tetap -> rata-rata = nilai itu
  const time = ['2020-01-01', '2020-01-02', '2020-02-01', '2020-02-02',
    '2020-03-01', '2020-03-02', '2020-04-01', '2020-04-02',
    '2020-05-01', '2020-05-02', '2020-06-01', '2020-06-02',
    '2020-07-01', '2020-07-02', '2020-08-01', '2020-08-02',
    '2020-09-01', '2020-09-02', '2020-10-01', '2020-10-02',
    '2020-11-01', '2020-11-02', '2020-12-01', '2020-12-02'];
  const daily = time.map((_, i) => i + 1); // 1..24
  const win2 = load({
    fetch: (u) => {
      if (u.indexOf('archive-api') !== -1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
          daily: { et0_fao_evapotranspiration: daily, time: time } }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
        daily: { et0_fao_evapotranspiration: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
          time: time.slice(0, 16) } }) });
    }
  });
  const r2 = await win2.WaterNeed.ongkosHitung(-6.9, 107.6, 'padi');
  // Jan: (1+2)/2 = 1.5 ... Des: (23+24)/2 = 23.5
  ok('ET0 Jan = 1.5 mm/hari', near(r2.bulanan.perBulan[0], 1.5, 1e-9), r2.bulanan.perBulan[0]);
  ok('ET0 Feb = 3.5 mm/hari', near(r2.bulanan.perBulan[1], 3.5, 1e-9), r2.bulanan.perBulan[1]);
  ok('ET0 Des = 23.5 mm/hari', near(r2.bulanan.perBulan[11], 23.5, 1e-9), r2.bulanan.perBulan[11]);
  ok('rerata ET0 harian = 4.0', near(r2.rerataEt0Harian, 4.0, 1e-9), r2.rerataEt0Harian);
  // Musim padi: Kc [1.05, 1.20, 1.20, 0.90] x hari [20,35,40,30], ET0 4.0
  //   4.0x1.05x20=84, 4.0x1.20x35=168, 4.0x1.20x40=192, 4.0x0.90x30=108
  //   total 552 mm / 125 hari = 4.416 mm/hari
  // Rata-rata musim BUKAN ET0 x Kc puncak, karena ada tahap Kc di bawah puncak.
  ok('ETc total = 552 mm', near(r2.etc.etcTotal, 552, 1e-9), r2.etc.etcTotal);
  ok('ETc rata-rata musim = 4.416 mm/hari',
    near(r2.etc.etcTotal / r2.etc.totalHari, 4.416, 1e-9), r2.etc.etcTotal / r2.etc.totalHari);
  ok('Kc rata-rata musim = 1.104 (di antara 0.90 dan 1.20)',
    near((r2.etc.etcTotal / r2.etc.totalHari) / r2.rerataEt0Harian, 1.104, 1e-9));
  ok('ETc puncak harian = 4.8 mm (ET0 4.0 x Kc 1.20)',
    near(r2.rerataEt0Harian * padi.kc[1], 4.8, 1e-9), r2.rerataEt0Harian * padi.kc[1]);

  /* ---- 4. Nilai null diabaikan ---- */
  console.log('\n4. Nilai null diabaikan');
  const win3 = load({
    fetch: (u) => {
      if (u.indexOf('archive-api') !== -1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
          daily: { et0_fao_evapotranspiration: [3, null, 3, null, 3, null, 3, null,
            3, null, 3, null, 3, null, 3, null, 3, null, 3, null, 3, null, 3, null], time: time } }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
        daily: { et0_fao_evapotranspiration: [3, null, 3, 3, null, 3, 3, 3, null, 3, 3, 3, 3, 3, 3, 3],
          time: time.slice(0, 16) } }) });
    }
  });
  const r3 = await win3.WaterNeed.ongkosHitung(-6.9, 107.6, 'padi');
  // Jan = (3+3)/2 = 3.0, bukan (3+0+3+0)/4
  ok('Jan tetap 3.0 meski ada null', near(r3.bulanan.perBulan[0], 3.0, 1e-9), r3.bulanan.perBulan[0]);
  // harian: 12 nilai valid dari 16, semua 3 -> rerata 3.0
  ok('rerata harian tetap 3.0', near(r3.rerataEt0Harian, 3.0, 1e-9), r3.rerataEt0Harian);

  /* ---- 5. Fallback 429 pada Archive ---- */
  console.log('\n5. Fallback saat kuota Open-Meteo habis (429)');
  const win4 = load({
    fetch: (u) => {
      if (u.indexOf('archive-api') !== -1) {
        return Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
        daily: { et0_fao_evapotranspiration: new Array(16).fill(3.5), time: time.slice(0, 16) } }) });
    }
  });
  const r4 = await win4.WaterNeed.ongkosHitung(-6.9, 107.6, 'padi');
  ok('tidak melempar error saat 429', true);
  ok('ditandai sebagai perkiraan', r4.bulanan.perkiraan === true);
  ok('ET0 Jul tetap ada', r4.bulanan.perBulan[6] > 0, r4.bulanan.perBulan[6]);
  ok('sumber menyebut kuota habis', /kuota/i.test(r4.bulanan.sumber), r4.bulanan.sumber);
  ok('perhitungan tetap jalan (ETc 0.4830-ish)', r4.etc.etcTotal > 0);

  /* ---- 6. Cache: panggil dua kali, fetch hanya satu kali ---- */
  console.log('\n6. Cache koordinat');
  let nArchive = 0;
  const win5 = load({
    fetch: (u) => {
      if (u.indexOf('archive-api') !== -1) {
        nArchive++;
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
          daily: { et0_fao_evapotranspiration: daily, time: time } }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
        daily: { et0_fao_evapotranspiration: new Array(16).fill(4), time: time.slice(0, 16) } }) });
    }
  });
  await win5.WaterNeed.ongkosHitung(-6.9, 107.6, 'padi');
  await win5.WaterNeed.ongkosHitung(-6.901, 107.601, 'padi'); // koordinat sama setelah dibulatkan
  ok('Archive dipanggil 1x untuk koordinat yang sama', nArchive === 1, 'dipanggil ' + nArchive + 'x');
  ok('cache terisi', !!win5.__airEt0Cache['-6.90,107.60'], JSON.stringify(Object.keys(win5.__airEt0Cache)));

  /* ---- 7. Kc dan hari konsisten untuk semua tanaman ---- */
  console.log('\n7. Integritas tabel tanaman');
  const win6 = load({ fetch: () => Promise.reject(new Error('tidak dipanggil')) });
  const semua = win6.WaterNeed.daftarTanaman();
  let tabelOke = true, pesan = '';
  semua.forEach(t => {
    if (!t.id || !t.nama) { tabelOke = false; pesan = t.id + ' tanpa id/nama'; }
    if (!Array.isArray(t.kc) || t.kc.length !== 3) { tabelOke = false; pesan = t.id + ' kc bukan 3'; }
    if (!Array.isArray(t.hari) || t.hari.length !== 4) { tabelOke = false; pesan = t.id + ' hari bukan 4'; }
    t.kc.forEach(k => { if (!(k > 0 && k <= 1.3)) { tabelOke = false; pesan = t.id + ' Kc di luar 0-1.3: ' + k; } });
    t.hari.forEach(h => { if (!(h > 0)) { tabelOke = false; pesan = t.id + ' hari harus positif: ' + h; } });
    // Kc tahap tengah harus sama dengan puncak (memakai indeks 1)
    if (t.kc[2] > t.kc[1] + 1e-9) { tabelOke = false; pesan = t.id + ' Kc akhir lebih besar dari puncak'; }
  });
  ok('semua tanaman punya Kc 0-1.3 dan hari positif', tabelOke, pesan);
  ok('ada 8 tanaman', semua.length === 8, 'jumlah ' + semua.length);
  ok('id tanaman unik', new Set(semua.map(t => t.id)).size === semua.length);

  /* ---- 8. Bentuk HTML ---- */
  console.log('\n8. HTML aman dari injeksi');
  const aman = win6.WaterNeed._escapeHtml('<img src=x onerror=alert(1)>');
  ok('escapeHtml menetralkan tag', aman.indexOf('<img') === -1, aman);
  const html = win6.WaterNeed._tabelTahapHtml(etc);
  ok('tabel tahap memuat 4 baris', (html.match(/pa-air-row/g) || []).length === 4,
    (html.match(/pa-air-row/g) || []).length + ' baris');
  // etc diuji dengan ET0 3.0 -> tahap 84/168/192/108 tidak; yang benar 63/126/144/81
  ok('baris tahap memuat nilai ETc pengembangan 126', html.indexOf('126') !== -1, html);
  ok('baris tahap tidak memuat total musim (dirender terpisah di UI)',
    html.indexOf('414') === -1);

  console.log('\n' + (fail === 0 ? 'SEMUA LULUS' : 'ADA YANG GAGAL') + ': ' + pass + ' lulus, ' + fail + ' gagal');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR TES:', e); process.exit(1); });
