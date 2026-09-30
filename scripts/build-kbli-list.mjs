/* Builds assets/data/kbli-2020.json: a flat { kode 5 digit -> judul } map
   used by geotani-kkpr.js to turn the `kbli` field on KKPR_BERUSAHA into a
   readable business activity name.

   Source
   ------
   Hugging Face dataset `ronnieaban/kbli2020` (Apache-2.0), derived from the
   KBLI 2020 classification published by BPS. Fetched through the
   datasets-server `/rows` endpoint rather than the raw CSV so the script needs
   no CSV parser and no dependency -- this repo has no root package.json.

   Why not ask BPS or OSS directly? BPS publishes the classification through
   klasifikasi.web.bps.go.id, but that app is a Yii shell whose records load
   over an XHR whose endpoint is not documented, and oss.go.id/id/kbli exposes
   no public API either. So the codebook is pinned here and rebuilt by hand.

   Normalisation, and why each step is needed
   ------------------------------------------
   1. `kode` is int64 in the dataset, so 01262 arrives as 1262 and loses its
      leading zero. Padded back to 5 digits. This is not cosmetic: the
      `kbli` values in KKPR_BERUSAHA are also unpadded (76 of the first 1000
      distinct codes are 4 digits, e.g. 1270 for 01270), so the runtime does
      the same padding before looking anything up.
   2. `kategori` carries trailing whitespace on some rows.
   3. A few titles end in a bare "Kelompok" token, which is an artefact of how
      the source text was cut, not part of the name. Counted and reported.
   4. Titles are uppercased to match how BPS prints them.

   `deskripsi` (the long definition of each subcategory) is deliberately NOT
   included: it would take the file from ~120 KB to well over 1 MB for text no
   one reads in a tooltip.

   Run with:  node scripts/build-kbli-list.mjs
*/
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATASET = 'ronnieaban/kbli2020';
const ROWS_URL = 'https://datasets-server.huggingface.co/rows';
const PAGE_SIZE = 100;
const OUT_PATH = join(__dirname, '..', 'assets', 'data', 'kbli-2020.json');

/* KBLI subcategory codes are 5 digits. Anything shorter lost a leading zero
   to the int64 column; anything longer is not a subcategory and is reported. */
function padKode(v) {
  return String(v).trim().padStart(5, '0');
}

function cleanJudul(v) {
  let s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toUpperCase();
  const tanpaKelompok = s.replace(/\s+KELOMPOK$/, '').trim();
  return tanpaKelompok;
}

async function fetchPage(offset) {
  const params = new URLSearchParams({
    dataset: DATASET,
    config: 'default',
    split: 'train',
    offset: String(offset),
    length: String(PAGE_SIZE)
  });
  const res = await fetch(`${ROWS_URL}?${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} at offset ${offset}`);
  const json = await res.json();
  return { rows: json.rows || [], total: json.num_rows_total };
}

async function main() {
  console.log(`Fetching ${DATASET} from datasets-server...`);

  const kodebook = new Map();
  const bentrok = [];
  const raccak = new Set();
  const nonLimaDigit = [];
  const judulKosong = [];
  let judulDiawaliKelompok = 0;
  let total = null;
  let offset = 0;

  for (;;) {
    const { rows, total: t } = await fetchPage(offset);
    if (total == null && typeof t === 'number') total = t;
    if (!rows.length) break;

    for (const r of rows) {
      const kodeAsli = r.row.kode;
      if (kodeAsli == null) continue;

      const kode = padKode(kodeAsli);
      if (String(kodeAsli).trim().length !== 5) nonLimaDigit.push(String(kodeAsli));

      const mentah = String(r.row.kategori == null ? '' : r.row.kategori).trim();
      if (!mentah) {
        judulKosong.push(kode);
        continue;
      }

      const judul = cleanJudul(mentah);
      if (judul !== mentah.toUpperCase()) judulDiawaliKelompok++;

      if (raccak.has(kode)) continue;
      if (kodebook.has(kode)) {
        if (kodebook.get(kode) !== judul) {
          /* Dua baris berbeda memakai kode yang sama setelah dipad. Contoh
             01430: "Peternakan unta dan sejenisnya" (gaya KBLI 2008) vs
             "Industri pakaian jadi rajutan dan sulaman/bordir" (KBLI 2020,
             kode aslinya 14130). Sumbernya mencampur dua daftar, jadi kode
             seperti ini tidak bisa dipercaya. Menebak salah satu berarti
             menampilkan nama usaha yang keliru, dan itu lebih buruk daripada
             tidak menampilkan judul sama sekali. Kode seperti ini dibuang
             dan dianggap tidak ditemukan saat lookup. */
          bentrok.push({ kode, awal: kodebook.get(kode), baru: judul });
          kodebook.delete(kode);
          raccak.add(kode);
        }
        continue;
      }
      kodebook.set(kode, judul);
    }

    offset += rows.length;
    console.log(`  offset ${offset}${total ? '/' + total : ''} -> ${kodebook.size} kode unik`);

    if (total != null && offset >= total) break;
    if (rows.length < PAGE_SIZE) break;
  }

  const urut = {};
  for (const kode of [...kodebook.keys()].sort()) urut[kode] = kodebook.get(kode);

  const keluaran = {
    _meta: {
      deskripsi: 'Peta kode KBLI 2020 ke judul subkategori, untuk lookup field `kbli` pada layer KKPR_BERUSAHA.',
      sumber: `Hugging Face dataset ${DATASET} (Apache-2.0), turunan klasifikasi KBLI 2020 BPS`,
      sumber_url: `https://huggingface.co/datasets/${DATASET}`,
      dibangun: new Date().toISOString().slice(0, 10),
      perintah_bangun: 'node scripts/build-kbli-list.mjs',
      jumlah_kode: Object.keys(urut).length,
      catatan: 'Kode 5 digit. Kode yang ambigu di sumber dibuang, bukan ditebak. Tidak menyertakan `deskripsi` agar berkas tetap kecil.'
    },
    ...urut
  };

  const json = JSON.stringify(keluaran);
  writeFileSync(OUT_PATH, json);

  console.log('');
  console.log('--- laporan ---');
  console.log(`baris dipulled   : ${offset}`);
  console.log(`kode unik        : ${Object.keys(urut).length}`);
  console.log(`ukuran berkas    : ${(json.length / 1024).toFixed(1)} KB`);
  console.log(`kode non 5 digit : ${nonLimaDigit.length}${nonLimaDigit.length ? ' (contoh: ' + nonLimaDigit.slice(0, 5).join(', ') + ')' : ''}`);
  console.log(`judul kosong     : ${judulKosong.length}`);
  console.log(`judul dibersihkan: ${judulDiawaliKelompok}`);
  console.log(`kode bentrok     : ${raccak.size} (dibuang, dianggap tidak ditemukan)`);
  for (const b of bentrok.slice(0, 10)) {
    console.log(`  ${b.kode}: "${b.awal}" vs "${b.baru}"`);
  }
  console.log('');
  console.log(`Ditulis ke ${OUT_PATH}`);

  if (Object.keys(urut).length < 2000) {
    console.warn('PERINGATAN: jumlah kode jauh di bawah 2.290 baris sumber. Periksa sumber data.');
  }
  if (nonLimaDigit.length > 0) {
    console.log('Catatan: padding ke 5 digit happened pada kode di atas; runtime wajib melakukan hal sama.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
