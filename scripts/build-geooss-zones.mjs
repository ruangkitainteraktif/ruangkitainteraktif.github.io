/* Menyimpan geometri zona RDTR ke berkas lokal, supaya GeoOSS tetap bisa
   dipakai ketika ArcGIS GISTARU tidak dapat dijangkau dari browser.

   KENAPA PERLU ADA
   ---------------
   Modul pada dasarnya mengambil geometri zona langsung dari ArcGIS lewat
   tres/proxy.ashx. Itu cara yang benar dan paling hemat. Tapi layanan itu
   sering tidak terjangkau: sudah terbukti membalas 500 lalu 400 tanpa pesan
   ketika dibebani, dan CORS worker tidak pernah bisa menjangkau host tersebut
   (522). Ketika itu terjadi, modul tidak bisa menilai apa pun.

   UKURAN, DAN BATASNYA
   --------------------
   Layer RDTR terbagi per BIDANG TANAH, bukan per zona. Cilacap RDTR 001
   berisi 3.931 bidang untuk hanya 38 zona. Angka hasil pengukuran nyata:

     mentah                            1.408 KB per RDTR  ->  872 MB / 634 RDTR
     setelah gabung per zona              955 KB          ->  591 MB
     setelah sederhana 5 sampai 50 m      437 KB          ->  271 MB

   Penyederhanaan sudah mentok di 14.782 titik. Itu batas zone yang
   sebenarnya, bukan detail antar-bidang, jadi tidak bisa dikecilkan lagi
   tanpa kehilangan bentuk. Kesimpulan: cakupan nasional tidak bisa dibangun;
   271 MB tidak masuk akal untuk repositori dan halaman statis.

   Yang bisa dan yang skrip ini kerjakan: satu kabupaten pada satu waktu.
   Sidoarjo hanya punya 1 RDTR, jadi sekitar 600 KB. Itu persis cakupannya.

   KETELITIAN
   ----------
   Geometri yang disimpan ini DISEDERHANAKAN, default 10 meter. Luas irisan
   yang dihitung modul karena itu adalah PERKIRAAN, bukan pengukuran geodesik
   presisi. Itu wajib dinyatakan di tampilan, karena modul ini alat bantu
   screening awal, bukan pengganti pengukuran patok.

   PEMAKAIAN
   ---------
     node scripts/build-geooss-zones.mjs --kab=3515000000
     node scripts/build-geooss-zones.mjs --prov=35 --toleransi=10
     node scripts/build-geooss-zones.mjs --kab=3515000000 --dry-run
     node scripts/build-geooss-zones.mjs --kab=3515000000 --maks-kb=5000
*/
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const GEOOSS = join(ROOT, 'assets', 'data', 'geooss');
const OUT = join(GEOOSS, 'zones');

const ARC = 'https://gistaru.atrbpn.go.id/arcgis/rest/services/';
const PROXY = 'https://gistaru.atrbpn.go.id/tres/proxy.ashx?';

const args = process.argv.slice(2);
const argOf = (n, d) => {
  const a = args.find(x => x.startsWith('--' + n + '='));
  return a ? a.split('=')[1] : d;
};
const KAB = argOf('kab', null);
const PROV = argOf('prov', null);
const TOLERANSI = Number(argOf('toleransi', '10'));
const BATAS_KB = Number(argOf('maks-kb', '2500'));
const DRY = args.includes('--dry-run');

const JEDA_MS = 250;
const PAGE = 1000;
const METER_PER_DERJAT_LAT = 110574;

if (!KAB && !PROV) {
  console.error('Wajib isi --kab=<kode wilayah 10 digit> atau --prov=<2 digit>.');
  process.exit(1);
}

const tidur = ms => new Promise(r => setTimeout(r, ms));

async function ambilJson(url, coba = 3) {
  let last;
  for (let i = 0; i < coba; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j && j.error) throw new Error('ArcGIS ' + j.error.code + ': ' + (j.error.message || '(tanpa pesan)'));
      return j;
    } catch (e) {
      last = e;
      if (i < coba - 1) await tidur(1200 * (i + 1));
    }
  }
  throw last;
}

/* Douglas-Peucker, ditulis sendiri supaya skrip build tidak butuh dependensi
   baru. Repositori ini tidak punya package.json, dan menarik pustaka hanya
   untuk satu fungsi tidak sebanding dengan persistently menambahkannya. */
function dp(titik, toleransi) {
  if (titik.length < 3) return titik;
  const tol2 = toleransi * toleransi;
  const tandai = new Uint8Array(titik.length);
  tandai[0] = 1;
  tandai[titik.length - 1] = 1;
  const stack = [[0, titik.length - 1]];
  while (stack.length) {
    const seg = stack.pop();
    const a = seg[0];
    const b = seg[1];
    if (b <= a + 1) continue;
    const p1 = titik[a];
    const p2 = titik[b];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len2 = dx * dx + dy * dy;
    let maks = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const p = titik[i];
      let d;
      if (len2 === 0) {
        d = (p[0] - p1[0]) * (p[0] - p1[0]) + (p[1] - p1[1]) * (p[1] - p1[1]);
      } else {
        let t = ((p[0] - p1[0]) * dx + (p[1] - p1[1]) * dy) / len2;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const qx = p1[0] + t * dx;
        const qy = p1[1] + t * dy;
        d = (p[0] - qx) * (p[0] - qx) + (p[1] - qy) * (p[1] - qy);
      }
      if (d > maks) { maks = d; idx = i; }
    }
    if (maks > tol2 && idx > 0) {
      tandai[idx] = 1;
      stack.push([a, idx]);
      stack.push([idx, b]);
    }
  }
  const out = [];
  for (let i = 0; i < titik.length; i++) if (tandai[i]) out.push(titik[i]);
  return out;
}

function daftarKabupaten() {
  const src = readFileSync(join(ROOT, 'assets', 'data', 'kode_wilayah.js'), 'utf8');
  const m = src.match(/=\s*(\[[\s\S]*\])\s*;?\s*$/);
  if (!m) throw new Error('Tidak bisa membaca assets/data/kode_wilayah.js');
  return JSON.parse(m[1])
    .filter(x => (x.kode || '').length === 5)
    .map(x => ({ id: x.kode.replace('.', '') + '000000', nama: x.nama, kode: x.kode }));
}

async function ambilSemuaBidang(sv, layer) {
  const fitur = [];
  for (let o = 0; o < 30000; o += PAGE) {
    const q = ARC + sv + '/' + layer + '/query?where=1%3D1&outFields=*&returnGeometry=true'
      + '&outSR=4326&resultOffset=' + o + '&resultRecordCount=' + PAGE
      + '&maxAllowableOffset=0.00005&geometryPrecision=5&f=geojson';
    const j = await ambilJson(PROXY + q);
    const f = j.features || [];
    fitur.push(...f);
    if (f.length < PAGE) break;
    await tidur(JEDA_MS);
  }
  return fitur;
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

async function main() {
  console.log('GeoOSS zone builder');
  console.log('  target     : ' + (KAB ? 'kabupaten ' + KAB : 'provinsi ' + PROV));
  console.log('  toleransi  : ' + TOLERANSI + ' m');
  console.log('  batas      : ' + BATAS_KB + ' KB per RDTR');
  if (DRY) console.log('  mode       : dry-run, tidak ada file ditulis');
  console.log('');

  const semua = daftarKabupaten();
  const target = KAB
    ? semua.filter(k => k.id === KAB)
    : semua.filter(k => k.kode.indexOf(PROV + '.') === 0);

  if (!target.length) {
    console.error('Tidak ada kabupaten yang cocok. Kode wilayah 10 digit, mis. 3515000000.');
    process.exit(1);
  }
  console.log('  kabupaten  : ' + target.map(k => k.nama).join(', '));
  console.log('');

  /* Tahap 1: ukur dulu. Menulis ratusan megabyte tanpa sengaja adalah
     kesalahan yang mahal untuk dibatalkan. */
  const rencana = [];
  for (const kab of target) {
    const f = join(GEOOSS, 'rdtr', kab.id + '.json');
    if (!existsSync(f)) {
      console.log('  ' + pad(kab.nama, 26) + 'belum ada rdtr/ -- lewati');
      continue;
    }
    for (const r of (JSON.parse(readFileSync(f, 'utf8')).data || [])) {
      /* OUT sudah menunjuk ke folder zones/, jadi rel TIDAK boleh memuat
         'zones/' lagi. Kalau iya, hasilnya zones/zones/... */
      rencana.push({ kab, rdtr: r, rel: join(kab.id, r.id_rtr + '.json') });
    }
  }
  console.log('  RDTR akan diproses: ' + rencana.length);
  if (!rencana.length) { console.log('\nTidak ada RDTR untuk dibangun.'); return; }
  console.log('');

  const hasil = [];
  let totalKB = 0;

  for (const item of rencana) {
    const sv = item.rdtr.url_mapserver;
    const layer = item.rdtr.sublayer;
    const kolom = item.rdtr.kolom_unik;
    process.stdout.write('  ' + pad(item.kab.nama + ' ' + item.rdtr.id_rtr, 30));

    try {
      const bidang = await ambilSemuaBidang(sv, layer);
      if (!bidang.length) { console.log('0 bidang'); continue; }

      const grup = new Map();
      for (const f of bidang) {
        const p = f.properties || {};
        let k = p[kolom];
        if (k == null || k === '') k = p.KODZON;
        if (k == null || k === '') k = '(tanpa kode)';
        k = String(k);
        if (!grup.has(k)) grup.set(k, []);
        grup.get(k).push(f);
      }

      const zona = [];
      let titikTotal = 0;
      for (const [kode, arr] of grup) {
        const polygons = [];
        let nama = '';
        let namaZona = '';
        for (const f of arr) {
          const g = f.geometry;
          if (!g) continue;
          const p = f.properties || {};
          if (!nama) nama = p.NAMSZN || p.NAMZON || p.NAMOBJ || '';
          if (!namaZona) namaZona = p.NAMZON || '';
          if (g.type === 'Polygon') polygons.push(g.coordinates);
          else if (g.type === 'MultiPolygon') polygons.push(...g.coordinates);
        }
        if (!polygons.length) continue;

        /* Semua poligon dalam satu zona dijadikan satu entri, lalu tiap ring
           disederhanakan dan dibulatkan ke 6 desimal. Batas 6 desimal kira-kira
           11 cm, jauh lebih halus daripada toleransi penyederhanaan, jadi
           pembulatan tidak merusak bentuk. */
        const ringSederhana = [];
        for (const poly of polygons) {
          for (const ring of poly) {
            const pts = dp(ring, TOLERANSI / METER_PER_DERJAT_LAT);
            if (pts.length < 3) continue;
            const bulat = pts.map(p => [+p[0].toFixed(6), +p[1].toFixed(6)]);
            const first = bulat[0];
            const last = bulat[bulat.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) bulat.push(first);
            if (bulat.length >= 4) { ringSederhana.push(bulat); titikTotal += bulat.length; }
          }
        }
        if (!ringSederhana.length) continue;
        zona.push({ kode, nama, zona: namaZona, bidang: polygons.length, rings: ringSederhana });
      }

      const isi = {
        _meta: {
          deskripsi: 'Geometri zona peruntukan satu RDTR, disederhanakan untuk disimpan lokal.',
          sumber: 'ATR/BPN GISTARU ' + sv + '/' + layer,
          dibangun: new Date().toISOString().slice(0, 10),
          id_wilayah: item.kab.id,
          id_rtr: item.rdtr.id_rtr,
          kolom_unik: kolom,
          jumlah_zona: zona.length,
          toleransi_meter: TOLERANSI,
          titik_total: titikTotal,
          bidang_asal: bidang.length,
          catatan: 'Geometri DISEDERHANAKAN ' + TOLERANSI
            + ' m. Luas irisan yang dihitung modul adalah perkiraan, bukan pengukuran geodesik presisi.'
        },
        zona
      };
      const json = JSON.stringify(isi);
      const kb = Buffer.byteLength(json) / 1024;
      totalKB += kb;
      hasil.push({ item, kb, json, nama: item.kab.nama });

      if (kb > BATAS_KB) {
        console.log('LEWATI ' + kb.toFixed(0) + ' KB, melebihi batas ' + BATAS_KB + ' KB');
      } else {
        console.log(zona.length + ' zona, ' + bidang.length + ' bidang, '
          + titikTotal + ' titik, ' + kb.toFixed(0) + ' KB');
      }
      await tidur(JEDA_MS);
    } catch (e) {
      console.log('GAGAL: ' + e.message);
    }
  }

  console.log('');
  console.log('--- ringkasan ---');
  console.log('  RDTR diproses : ' + hasil.length);
  console.log('  total ukuran  : ' + (totalKB / 1024).toFixed(2) + ' MB');
  const perKab = {};
  for (const h of hasil) perKab[h.nama] = (perKab[h.nama] || 0) + h.kb;
  for (const n of Object.keys(perKab)) {
    console.log('  ' + pad(n, 28) + (perKab[n] / 1024).toFixed(2) + ' MB');
  }

  if (DRY) {
    console.log('');
    console.log('Dry-run: tidak ada file ditulis. Jalankan tanpa --dry-run untuk menyimpan.');
    return;
  }

  let ditulis = 0;
  let dilewati = 0;
  for (const h of hasil) {
    if (h.kb > BATAS_KB) { dilewati++; continue; }
    const p = join(OUT, h.item.rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, h.json);
    ditulis++;
  }
  console.log('');
  console.log('  ditulis       : ' + ditulis + ' berkas');
  if (dilewati) console.log('  dilewati      : ' + dilewati + ' (melebihi batas ukuran)');
  console.log('  lokasi        : ' + OUT);
}

main().catch(e => { console.error(e); process.exit(1); });
