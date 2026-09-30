/* Membangun snapshot data GeoOSS (Pre-OSS Spatial Checker) dari API
   ATR/BPN GISTARU, supaya modul di browser tidak perlu menyentuh endpoint
   yang tidak bisa diakses lintas origin.

   MENGAPA DI-BUILD SEBAGAI FILE STATIS
   ------------------------------------
   Empat endpoint yang dipakai GeoOSS semuanya berada di path
   /rdtrinteraktif/api/... yang TIDAK mengirim header Access-Control-Allow-Origin,
   sehingga browser memblokirnya. Fallback CORS Worker tidak menolong: worker
   itu balas 522 (connection timed out) untuk setiap URL gistaru.atrbpn.go.id,
   sementara host lain dilayani normal. Jadi satu-satunya jalur yang aman
   untuk browser adalah tres/proxy.ashx -- dan itu hanya berlaku untuk ArcGIS
   REST, tidak untuk /rdtrinteraktif.

   Yang di-snapshot hanya metadata dan daftar kegiatan. Geometri zonanya tetap
   diambil langsung dari ArcGIS lewat tres/proxy.ashx saat runtime, karena
   (a) ArcGIS itu mengirim ACAO:*, jadi aman untuk browser, dan (b) geometri
   tidak boleh basi. Snapshot yang sudah kedaluwarsa akan membuat pengguna
   melihat zona yang sudah tidak berlaku.

   UKURAN
   ------
   Daftar kegiatan adalah bagian besar. Semula tiap kegiatan menyimpan daftar
   zona lengkapnya sendiri, dan beberapa RDTR (mis.|RDTR|Perbatasan|Sekitar
   Bandara|Yogyakarta) punya 300-an kode compound panjang per kegiatan, sehingga
   satu berkas bisa 6 MB. Di sini daftar zona disimpan sebagai POOL unik per
   RDTR dan tiap kegiatan hanya menyimpan indeksnya. Itu compressing
   redundancy yang luar biasa besar: 6,4 MB menjadi sekitar 100 KB.

   Jalankan:
     node scripts/build-geooss-snapshot.mjs                 # provinsi 33
     node scripts/build-geooss-snapshot.mjs --prov=35       # provinsi lain
     node scripts/build-geooss-snapshot.mjs --prov=33 --force
     node scripts/build-geooss-snapshot.mjs --index-only    # hanya provinces.json

   Kalau wilayah yang dipilih belum punya file-nya, UI menampilkan "belum
   di-build" beserta perintah build -- BUKAN "tidak ditemukan". Membedakan
   tidak-ada-datatanya dari datanya-tidak-dibangun itu penting: yang pertama
   adalah fakta, yang kedua hanya keterbatasan repo.
*/
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'assets', 'data', 'geooss');

const API = 'https://gistaru.atrbpn.go.id/rdtrinteraktif/api/interactive';
const JEDA_MS = 250;

const args = process.argv.slice(2);
const argOf = (nama, bawaan) => {
  const a = args.find(x => x.startsWith('--' + nama + '='));
  return a ? a.split('=')[1] : bawaan;
};
const PROV = argOf('prov', '33');
const FORCE = args.includes('--force');
const INDEX_ONLY = args.includes('--index-only');
const RDTR_ONLY = args.includes('--rdtr-only');

const DIBANGUN = new Date().toISOString().slice(0, 10);
const SUMBER_API = API + ' (ATR/BPN GISTARU)';

const tidur = ms => new Promise(r => setTimeout(r, ms));

async function ambil(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  if (j.status && j.status !== 200) throw new Error(j.message || 'status ' + j.status);
  return j.data;
}

function tulis(rel, obj) {
  const p = join(OUT, rel);
  mkdirSync(dirname(p), { recursive: true });
  const json = JSON.stringify(obj);
  writeFileSync(p, json);
  return { path: p, bytes: Buffer.byteLength(json) };
}

function baca(rel) {
  return JSON.parse(readFileSync(join(OUT, rel), 'utf8'));
}

function pad(s, n) {
  s = String(s == null ? '' : s);
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

/* Daftar kabupaten/kota dibaca dari assets/data/kode_wilayah.js, berkas lokal
   yang bentuknya `window.KODE_WILAYAH_DATA = [...]`. Dipakai apa adanya supaya
   daftar di GeoOSS sama persis dengan yang dipakai modul lain di halaman ini,
   dan tidak perlu fetch API yang tidak bisa diakses browser.

   Kode di berkas itu memakai titik: "33.01" (5 karakter) untuk kabupaten/kota,
   "33.01.01" (8 karakter) untuk kecamatan, "33.01.01.2001" (13 karakter) untuk
   desa, dan "33" (2 karakter) untuk provinsi. Kode wilayah GISTARU adalah
   10 digit, jadi titiknya dibuang lalu enam digit nol ditambahkan:
   33.01 -> 3301 -> 3301000000.

   Berkas itu dibaca sebagai teks lalu bagian setelah "=" diambil, supaya tidak
   perlu eval dan tidak butuh lingkungan browser. */
function bacaKodeWilayah() {
  const p = join(ROOT, 'assets', 'data', 'kode_wilayah.js');
  const src = readFileSync(p, 'utf8');
  const m = src.match(/=\s*(\[[\s\S]*\])\s*;?\s*$/);
  if (!m) throw new Error('Tidak bisa menemukan array JSON di ' + p);
  return JSON.parse(m[1]);
}

function daftarWilayah(kodeProv) {
  return daftarSemuaWilayah().filter(k => k.kode.indexOf(kodeProv + '.') === 0);
}

/* Semua kabupaten/kota di Indonesia, 514 entri, diambil dari berkas lokal
   yang sama. Dipakai untuk membangun rdtr/*.json secara nasional. */
function daftarSemuaWilayah() {
  const semua = bacaKodeWilayah();
  const out = [];
  for (const x of semua) {
    const k = x.kode || '';
    if (k.length !== 5) continue;
    out.push({ id: k.replace('.', '') + '000000', nama: x.nama, kode: k });
  }
  return out.sort((a, b) => a.kode.localeCompare(b.kode));
}

/* API GISTARU suka membalas 500 lalu 400 tanpa pesan ketika sedang dibebani,
   lalu pulih sendiri. Untuk build 514 kabupaten, banyak yang akan gagal
   karena transient, jadi percobaan diulang. Ini yang membuat build-nya
   andal tanpa harus dijalankan berkali-kali. */
async function ambilDenganCoba(url, cobaMaks = 3) {
  let last;
  for (let i = 0; i < cobaMaks; i++) {
    try {
      return await ambil(url);
    } catch (e) {
      last = e;
      if (i < cobaMaks - 1) await tidur(1200 * (i + 1));
    }
  }
  throw last;
}

/* nilai_kolom_unik tiba sebagai STRING berisi JSON, lengkap dengan \\r\\n dan
   indentasi di dalamnya. Contoh nyata dari GISTARU:
     "{\"data\": [\"SP\",\"SS\",\"R-2\", \"SPU 3.3\"]}"

   Tiga bentuk yang benar-benar ditemukan di lapangan:

   1. { "data": ["SP","R-2","SPU-3.3"] }
      Daftar kode zona biasa. Inilah bentuk yang dipakai Cilacap.

   2. { "data": "-" }
      Placeholder. Kegiatan ini tidak punya daftar zona sama sekali. Ini
      BUKAN kegagalan parse, dan harus disimpan sebagai daftar kosong.

   3. { "data": ["PS_K01B_Rawan Bencana Tsunami Tingkat Tinggi, Rawan
      Bencana Banjir Tingkat Tinggi"] }
      Kode compound: nama zona diikuti teks atribut (banjir, likuefaksi) yang
      dipisahkan koma.

   Dua konsekuensi yang penting:

   a) Nilai mentah DISIMPAN APA ADANYA. Versi pertama skrip ini mengganti spasi
      dengan hyphen, dan itu merusak bentuk 3: kode jadi tidak bisa dicocokkan,
      dan lebih buruk lagi, dua kode berbeda bisa terlihat sama. Di sini spasi
      hanya dirapatkan. Penyamaan dilakukan runtime lewat kunci kanonik, jadi
      aturannya ada di satu tempat (geotani-geooss.js) dan bisa diuji.

   b) Daftar zona dikumpulkan ke POOL unik, lalu tiap kegiatan menyimpan indeks
      saja. Bentuk 3 mengulang hundreds kode yang nyaris sama di tiap kegiatan;
      tanpa pool, satu RDTR bisa 6 MB. */
function parseNilaiKolomUnik(raw) {
  if (raw == null) return { zona: [], bentuk: 'null' };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { zona: [], bentuk: 'tidak-json' };
  }
  const d = parsed && parsed.data;
  if (d == null) return { zona: [], bentuk: 'kosong' };
  if (!Array.isArray(d)) return { zona: [], bentuk: 'placeholder' };
  const zona = [];
  const lihat = new Set();
  for (const v of d) {
    const kode = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    if (!kode || lihat.has(kode)) continue;
    lihat.add(kode);
    zona.push(kode);
  }
  return { zona, bentuk: 'daftar' };
}

async function main() {
  console.log('GeoOSS snapshot builder -- provinsi ' + PROV + (FORCE ? ' (force)' : ''));
  mkdirSync(OUT, { recursive: true });

  let totalBytes = 0;
  let nFile = 0;
  const gagal = [];
  const bentukGaib = {};
  let nPlaceholder = 0;

  // 1. provinces
  if (FORCE || INDEX_ONLY || !existsSync(join(OUT, 'provinces.json'))) {
    const data = await ambil(API + '/provinces/');
    const items = data.map(p => ({
      id: p.id,
      kode: String(p.id).slice(0, 2),
      provinsi: p.provinsi
    })).sort((a, b) => a.kode.localeCompare(b.kode));
    const r = tulis('provinces.json', {
      _meta: {
        deskripsi: 'Daftar provinsi beserta kode wilayah 10 digit, untuk drill-down GeoOSS.',
        sumber: SUMBER_API + ' /provinces/',
        dibangun: DIBANGUN,
        jumlah: items.length
      },
      data: items
    });
    totalBytes += r.bytes; nFile++;
    console.log('provinces.json        ' + items.length + ' provinsi, ' + (r.bytes / 1024).toFixed(1) + ' KB');
  } else {
    console.log('provinces.json        dilewati (sudah ada)');
  }

  if (INDEX_ONLY) {
    console.log('\n--index-only selesai.');
    return;
  }

  // ONE. Daftar kabupaten/kota TIDAK di-build.
  //
  // Modul membacanya dari KODE_WILAYAH_DATA (assets/data/kode_wilayah.js) yang
  // sudah ada dan sudah dimuat halaman ini. Berkas itu juga lebih lengkap:
  // 514 kabupaten/kota nasional, sementara /cities/{prov} hanya mengembalikan
  // sebagian (Jawa Tengah: 35 di file lokal, 28 dari API -- Kebumen, Wonosobo,
  // Blora, Pemalang, dan Kota Magelang hilang dari daftar API).
  //
  // TWO. Daftar RDTR di-build untuk SELURUH Indonesia, bukan per provinsi.
  // Alasannya ukuran: satu berkas rdtr/*.json hanya sekitar 860 byte, jadi 514
  // kabupaten kota sekitar 440 KB. Itu murah, dan konsekuensinya besar: dropdown
  // RDTR langsung berfungsi di semua 38 provinsi, dan kabupaten yang benar-
  // benar tidak punya RDTR bisa ditampilkan sebagai "tidak ada tata ruang
  // detail" (fakta) -- bukan "belum di-build" (keterbatasan repo), yang
  // menyesatkan karena mengira datanya memang tidak ada.
  const semuaKab = daftarSemuaWilayah();
  const kabProv = daftarWilayah(PROV);
  console.log('kab/kota nasional  : ' + semuaKab.length);
  console.log('kab/kota provinsi ' + PROV + ' : ' + kabProv.length);

  let nRdtr = 0;
  let nRdtrKosong = 0;
  let nFileAktivitas = 0;
  let nKegiatan = 0;
  let nZonaUnik = 0;
  let diproses = 0;

  for (const kab of semuaKab) {
    const rdtrRel = join('rdtr', kab.id + '.json');
    let rdtr;

    if (FORCE || !existsSync(join(OUT, rdtrRel))) {
      try {
        const data = await ambilDenganCoba(API + '/rdtr/' + kab.id);
        rdtr = (data || []).map(r => ({
          id_rtr: r.id_rtr,
          rtr: r.rtr,
          kolom_unik: r.kolom_unik,
          url_mapserver: r.url_mapserver,
          sublayer: r.sublayer_mapserver,
          integration_date: r.integration_date ? String(r.integration_date).slice(0, 10) : null
          // Sengaja TIDAK ikut menyimpan `status` (nilainya 6 di semua RDTR
          // yang dicek, tanpa dokumentasi arti), `memiliki_itbx`, dan
          // `memiliki_simulasi`. Field yang tidak akan dibaca modul jangan
          // ikut disertakan; orang lain akan mengira field itu bermakna.
        }));
        const r = tulis(rdtrRel, {
          _meta: {
            deskripsi: 'Daftar RDTR dalam satu kabupaten/kota, beserta nama field yang menyimpan kode zona.',
            sumber: SUMBER_API + ' /rdtr/' + kab.id,
            dibangun: DIBANGUN,
            jumlah: rdtr.length,
            catatan: 'kolom_unik dipakai runtime untuk join ke daftar kegiatan. Nilainya BERBEDA antar RDTR (KODSZN di Cilacap, KODUNK di RDTR Perbatasan Sekitar Bandara Yogyakarta) jadi tidak boleh di-hardcode.'
          },
          data: rdtr
        });
        totalBytes += r.bytes; nFile++;
      } catch (e) {
        gagal.push('rdtr/' + kab.id + ' (' + kab.nama + '): ' + e.message);
        await tidur(JEDA_MS);
        continue;
      }
    } else {
      rdtr = baca(rdtrRel).data;
    }

    nRdtr += rdtr.length;
    if (!rdtr.length) nRdtrKosong++;
    diproses++;
    if (diproses % 25 === 0 || diproses === semuaKab.length) {
      process.stdout.write('  rdtr: ' + diproses + '/' + semuaKab.length +
        ' (total ' + nRdtr + ' RDTR)\r\n');
    }

    if (RDTR_ONLY) continue;
    // Kegiatan hanya untuk provinsi yang diminta: ini bagian besar ukurannya
    // (puluhan MB bila semua Indonesia), jadi sengaja tidak nasional.
    if (kab.kode.slice(0, 2) !== PROV) continue;
    if (!rdtr.length) continue;

    for (const r of rdtr) {
      const actRel = join('activities', kab.id, r.id_rtr + '.json');
      if (FORCE || !existsSync(join(OUT, actRel))) {
        try {
          const data = await ambilDenganCoba(API + '/activities?id_wilayah=' + kab.id + '&id_rtr=' + r.id_rtr);
          const pool = [];
          const idxPool = new Map();
          const kegiatan = [];
          let nPlaceholderRDTR = 0;

          for (const a of (data || [])) {
            const hasil = parseNilaiKolomUnik(a.nilai_kolom_unik);
            bentukGaib[hasil.bentuk] = (bentukGaib[hasil.bentuk] || 0) + 1;
            if (hasil.bentuk !== 'daftar') {
              nPlaceholder++;
              if (hasil.bentuk === 'placeholder') nPlaceholderRDTR++;
            }
            const indeks = [];
            for (const z of hasil.zona) {
              if (!idxPool.has(z)) {
                idxPool.set(z, pool.length);
                pool.push(z);
              }
              indeks.push(idxPool.get(z));
            }
            kegiatan.push({ id: a.id_kegiatan, nama: a.kegiatan, z: indeks });
          }

          nKegiatan += kegiatan.length;
          nZonaUnik += pool.length;
          const out = tulis(actRel, {
            _meta: {
              deskripsi: 'Daftar kegiatan dan kode zona yang mengizinkannya, untuk satu RDTR.',
              sumber: SUMBER_API + ' /activities?id_wilayah=' + kab.id + '&id_rtr=' + r.id_rtr,
              dibangun: DIBANGUN,
              id_wilayah: kab.id,
              id_rtr: r.id_rtr,
              kolom_unik: r.kolom_unik,
              jumlah_kegiatan: kegiatan.length,
              jumlah_zona_unik: pool.length,
              tanpa_daftar_zona: nPlaceholderRDTR
            },
            // POOL zona unik. kegiatan[].z berisi indeks ke array ini.
            zona: pool,
            kegiatan
          });
          totalBytes += out.bytes; nFile++; nFileAktivitas++;
        } catch (e) {
          gagal.push('activities/' + kab.id + '/' + r.id_rtr + ' (' + r.rtr + '): ' + e.message);
          await tidur(JEDA_MS);
          continue;
        }
        await tidur(JEDA_MS);
      } else {
        const isi = baca(actRel);
        nKegiatan += isi.kegiatan.length;
        nZonaUnik += isi.zona.length;
        nFileAktivitas++;
      }
    }

    console.log('  ' + pad(kab.nama, 22) + ' ' + String(rdtr.length).padStart(2) + ' RDTR [' + rdtr.map(x => x.id_rtr).join(',') + ']');
  }

  console.log('');
  console.log('--- ringkasan ---');
  console.log('file ditulis      : ' + nFile);
  console.log('kab/kota nasional : ' + semuaKab.length);
  console.log('  tanpa RDTR      : ' + nRdtrKosong);
  console.log('RDTR di semua prov: ' + nRdtr);
  if (!RDTR_ONLY) {
    console.log('provinsi kegiatan : ' + PROV + ' (' + kabProv.length + ' kab/kota)');
    console.log('berkas kegiatan   : ' + nFileAktivitas);
    console.log('kegiatan total    : ' + nKegiatan.toLocaleString('id-ID'));
    console.log('entri zona unik   : ' + nZonaUnik.toLocaleString('id-ID'));
  } else {
    console.log('kegiatan          : dilewati (--rdtr-only)');
  }
  console.log('total ukuran      : ' + (totalBytes / 1024 / 1024).toFixed(2) + ' MB');
  console.log('bentuk nilai_kolom_unik:');
  for (const k of Object.keys(bentukGaib).sort()) {
    console.log('  ' + pad(k, 14) + bentukGaib[k] + (k === 'placeholder' ? '  (kegiatan tanpa daftar zona)' : ''));
  }
  if (gagal.length) {
    console.log('gagal: ' + gagal.length);
    for (const g of gagal) console.log('  ' + g);
  }
  console.log('');
  console.log('Tersimpan di ' + OUT);
}

main().catch(err => { console.error(err); process.exit(1); });
