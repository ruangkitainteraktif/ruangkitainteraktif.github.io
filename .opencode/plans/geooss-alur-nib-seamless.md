# GeoOSS — Alur NIB → Polygon → Administrasi → Seamless → Detail → Zona → KBLI → Constraint → Screening

Status: riset selesai, implementasi belum dimulai.
Riset dilakukan 30 Sep 2026, seluruh endpoint diverifikasi langsung ke
`tres/proxy.ashx?…arcgis/rest/services/`.

## Keputusan yang sudah diambil

| Keputusan | Pilihan |
|---|---|
| Titik masuk alur | Polygon digambar; NIB opsional untuk memperkaya KBLI |
| Peran constraint | Informasi tambahan, tidak mengubah verdict |
| Sumber seamless | `SERVICE_RDTR_ALL` saja (666 baris) |
| Penentuan `id_rtr` | Cocokkan `NAMA_RDTR` ke metadata lokal |
| Cache metadata | Cache memori; query per geometry tetap online |
| Data kegiatan | Snapshot lokal dulu, server + cache memori sebagai fallback |
| Placeholder `-` | Verdict normal + catatan eksplisit |
| Credit tanpa `_meta` | Tanpa tanggal, seperti sekarang |

## Peta alur

```
Polygon (gambar, atau dari NIB opsional)
  └─> SERVICE_RDTR_ALL, query per geometry
       ├─ ID_WILAYAH  → wajib .trim()
       └─ NAMA_RDTR
            └─> cocokkan inti-token ke rdtr/{id_wilayah}.json
                 ├─ kena  → id_rtr, kolom_unik, url_mapserver
                 └─ gagal → pemilih RDTR manual (tidak pernah buntu)
                      └─> Layer zona: kolom_unik (KODSZN / KODZON / KODUNK)
                           ├─ 17 field constraint → catatan, bukan verdict
                           └─> Kegiatan: lokal dulu, server + cache memori
                                └─> Screening: SESUAI / SEBAGIAN / TIDAK SESUAI
```

## Bukti lapangan

Setiap baris di bawah sudah diverifikasi dengan request nyata, bukan dari
dokumentasi.

| Layanan | Temuan |
|---|---|
| `KKPR/KKPR_OSS_ALL/MapServer/0` | `nib`, `id_izin`, `kd_izin`. Extent `NaN`. |
| `KKPR/KKPR_BERUSAHA/MapServer/0` | punya field **`kbli`** — KBLI asli ATR/BPN, bukan hasil tebakan |
| `_RDTR_SEAMLESS/SERVICE_RDTR_ALL/MapServer/0` | 666 baris. Query per geometry **berhasil** (polygon Tulangan → 1 hasil) |
| `…/058_RDTR_…/_RDTR_35K3_…/MapServer/0` | `KODSZN`, `KODZON`, `NAMZON`, `NAMSZN`, + 17 field constraint |
| `…/058_RDTR_…/MapServer/0/query` | `NOTHPR` berisi teks Perda, `LP2B_2: "Tidak Ada"` |
| `BATAS_ADMINISTRASI/` | 470 MapServer, penamaan tidak konsisten, 4 typo (`ADMINSTRASI`) |
| `rdtrinteraktif/api/interactive/rdtr/{id}` | mengembalikan `id_rtr`, `kolom_unik`, `url_mapserver` |
| `rdtrinteraktif/api/interactive/activities?…` | **bentuk berbeda dari snapshot lokal** — lihat di bawah |

### Empat jebakan data yang harus ditangani

| Jebakan | Bukti | Perbaikan |
|---|---|---|
| `ID_WILAYAH` korup | `"3515000000\r\n"` | `.trim()` sebelum join. `TRIM()` ditolak server, jadi wajib di client |
| `ID_RTR` berisi spasi | `" "` untuk Tulangan | fallback ke pencocokan nama |
| Nama RDTR berbeda antar sumber | `RDTR WP Gempol` (seamless) vs `RDTR Gempol` (lokal) | inti-token: 3/12 cocok persis → 11/12 setelah normalisasi |
| `returnDistinctValues` diabaikan | tetap 666 baris | andalkan query per geometry, bukan tarik semua |

## Endpoint `activities` — bentuk berbeda dari snapshot lokal

Request `activities?id_wilayah=3510000000&id_rtr=004` (256.786 byte):

```json
{"status":200,"message":"OK","data":[
  {"id_kegiatan":"001","kegiatan":"RUMAH TUNGGAL",
   "nilai_kolom_unik":"{\r\n  \"data\": [\r\n    \"PS\",\r\n    \"P-1\",…"}}]}
```

| | Server | Snapshot lokal |
|---|---|---|
| Akar | `{status, message, data:[]}` | `{_meta, zona:{}, kegiatan:[]}` |
| Nama kegiatan | `kegiatan` | `nama` |
| Kunci | `id_kegiatan` | `id` |
| Daftar zona | `nilai_kolom_unik` = string JSON, parse 2× | `z` = indeks ke pool |
| `_meta` | tidak ada | ada |
| Jumlah | 1.000 | 1.855 (RDTR lain) |

`data.zona` dan `data.kegiatan` akan `undefined`. Kode yang membaca
`d.kegiatan` akan **error**, bukan sekadar salah data.

`scripts/build-geooss-snapshot.mjs:173` sudah punya `parseNilaiKolomUnik()`
yang menangani tiga bentuk: daftar biasa, `{data:"-"}`, dan kode compound.
Parser **dipindah ke runtime**, bukan ditulis ulang.

### Placeholder `-`

`{"data":"-"}` = kegiatan tanpa daftar zona. 4 dari 1.000 kegiatan di
3510000000/004, 40 di 1.855 pada RDTR lain. Perlakuan: verdict TIDAK SESUAI
dengan catatan eksplisit. Tanpa catatan, pengguna akan menyimpulkan modul
salah — padahal kegiatannya jelas ada, hanya ATR/BPN tidak mencantumkan zona.

## Cakupan metadata lokal

- `assets/data/geooss/rdtr/`: 514 berkas, **320 berisi RDTR, 194 kosong**
- Distribusi `kolom_unik`: `KODSZN` 556, `KODZON` 1, `KODUNK` 77
  → `kolom_unik` tidak boleh di-hardcode; `fieldYangAda()` sudah menangani
- `RDTR WP Srengat` ada di seamless untuk `3517000000`, tapi tidak ada di
  metadata lokal. Pencocokan nama tidak bisa jadi satu-satunya jalur.

## Komponen yang akan dibangun

### 1. `muatSeamless(polygon)`
Query per geometry ke `SERVICE_RDTR_ALL`, `geometryType=esriGeometryPolygon`,
`inSR=4326`, `spatialRel=esriSpatialRelIntersects`. Wajib:
- `outFields`: `ID_WILAYAH`, `ID_RTR`, `NAMA_RDTR`, `PROVINSI`, `KAB_KOT`
- `ID_WILAYAH.trim()` sebelum dipakai sebagai kunci
- deteksi `ID_RTR` yang hanya berisi spasi → tandai `butuhPencocokanNama`
- poligon user berpotensi banyak RDTR: tampilkan daftar kandidat, jangan
  diam-diam ambil yang pertama

### 2. `intiNamaRtr()` + `cocokkanRtr()`
Buang token noise sebelum dibandingkan: `rdtr`, `wp`, `bwp`, `swp`, `perkotaan`,
`kawasan`, `oss`, `kabupaten`, `kota`, `wilayah`, `rencana`, `perencanaan`.
Lalu bandingkan himpunan token unik, bukan string.

Fixture pengujian — 12 nama nyata dari seamless:

| NAMA_RDTR (seamless) | Metadata lokal |
|---|---|
| `RDTR Perkotaan Pandaan` | `RDTR Pandaan` → 001 |
| `RDTR WP Gempol` | `RDTR Gempol` → 004 |
| `RDTR WP Grati` | `RDTR Grati` → 003 |
| `RDTR WP Wonorejo` | `RDTR Wonorejo` → 002 |
| `RDTR BWP Pilangkenceng` | `RDTR WP Pilangkenceng` → 001 |
| `RDTR WP Kraksaan` | `RDTR WP Kraksaan` → 001 |
| `RDTR WP Paiton` | `RDTR WP Paiton` → 002 |
| `RDTR WP Perkotaan Dringu-Gending-Pajarakan (OSS)` | `RDTR Perkotaan Dringu-Gending-Pajarakan` → 003 |
| `RDTR Perkotaan Nganjuk` | `RDTR WP Perkotaan Nganjuk` → 001 |
| `RDTR Kertosono` | `RDTR WP Perkotaan Kertosono` → 002 |
| `RDTR Wilayah Perencanaan Tulangan` | sama → 007 |
| `RDTR WP Srengat` | **tidak ada** → fallback manual |

### 3. Fallback
Polygon tidak kena RDTR, atau nama tidak cocok di metadata lokal, atau metadata
lokal kosong → tampilkan pemilih RDTR manual yang sekarang. **Tidak pernah
buntu.**

### 4. Cache kegiatan
- `assets/data/geooss/activities/{id}/{rtr}.json` lebih dulu
- Kalau 404 / belum ada → query
  `rdtrinteraktif/api/interactive/activities?id_wilayah=&id_rtr=`
- Cache di memori (Map), bukan menulis berkas
- Normalisasi ke bentuk internal yang sama dengan snapshot lokal, supaya
  `screening()` dan `cariKegiatan()` tidak berubah sama sekali

### 5. Constraint
17 field sudah ada di layer zona. `kendalas()` sudah ada di kode tapi belum
memengaruhi verdict — sesuai keputusan, tetap informasi tambahan. Rinciannya:
`KKOP_1`, `LP2B_2`, `KRB_03`, `TOD_04`, `TEB_05`, `PUSLIT`, `CAGBUD`,
`RESAIR`, `KSMPDN`, `HANKAM`, `KKARST`, `PTBGMB`, `MGRSAT`, `RDBUMI`, `TPZ_00`.

## Hasil uji POST — 30 Sep 2026

`tres/proxy.ashx` **menerima POST**, tapi hanya dalam bentuk tertentu.

| Bentuk | Hasil |
|---|---|
| POST, URL target di query string, parameter di body | **200**, identik byte-per-byte dengan GET |
| POST, URL target di body | 400 `This proxy does not support empty parameters.` |
| POST langsung ke ArcGIS tanpa proxy | `Token Required` → proxy wajib |
| `allow-methods` (preflight OPTIONS) | `GET, POST, OPTIONS` |

### Endpoint `activities` hanya menerima GET

`POST` ke `rdtrinteraktif/api/interactive/activities` → **405 Method Not
Allowed**. Jadi komponen 4 tetap pakai GET. Tidak masalah: parameter-nya cuma
dua (`id_wilayah`, `id_rtr`), payload 256 KB ada di respons, bukan di request.

### Koreksi: `activities` ternyata mengirim CORS

Respons di Node tidak menunjukkan header CORS, dan saya sempat menyimpulkan
tidak bisa dipakai dari browser. ** itu salah.** Dengan header `Origin` seperti
yang dikirim browser:

```
activities : access-control-allow-origin: *
proxy      : access-control-allow-origin: *
```

Keduanya `*`. Endpoint `activities` bisa dipanggil langsung dari browser tanpa
proxy. Yang tetap salah: `POST` 405, jadi harus GET.

### Temuan penting: GET gagal untuk geometry di atas ~40 titik

Ini yang menentukan arsitektur komponen 1.

| Titik | Panjang URL | GET | POST |
|---|---|---|---|
| 20 | 1.306 | 200 | 200 |
| 30 | 1.756 | 200 | 200 |
| 40 | 2.206 | 200 | 200 |
| **45** | **2.431** | **400 Runtime Error** | 200 |
| 200 | 9.406 | 400 | 200 |
| 800 | 36.406 | `fetch failed` | 200 |

Batasnya bukan 8 KB seperti umumnya, tapi **~2.400 karakter** — danatia dipicu
oleh `tres/proxy.ashx` yang melempar ASP.NET Runtime Error, bukan oleh server
ArcGIS. Poligon yang digambar user di peta hampir pasti lebih dari 40 titik.

**Konsekuensi: `muatSeamless()` dan query zona wajib POST.** GET yang sekarang
dipakai modul untuk query zona akan breakage begitu geometri makin rumit. Aman
untuk sekarang karena modul mengirim `envelope`, bukan polygon penuh — tapi
`envelope` untuk Tulangan sudah 8,9 MB untuk 1.000 fitur, artinya modul
sekarang **sudah menabrak `maxRecordCount` = 1.000** dan hanya melihat sebagian
zona tanpa memberi tahu pengguna.

## Yang belum terverifikasi

1. **Perilaku `tres/proxy.ashx` saat throttle.** Layer zona pernah gagal dari
   browser. Kalau seamless ikut throttled, alur ini tidak boleh jadi satu-
   sat Ways.
2. **Verifikasi browser** untuk yang bersifat layout: posisi daftar saran,
   `scrollIntoView`, render 17 field constraint.
3. **Apakah `tres/proxy.ashx` mengizinkan POST dari browser.** OPTIONS
   mengizinkan, tapi uji ini dari Node. Browser mengirim preflight berbeda
   (`Access-Control-Request-Headers`).

## Catatan proses

Node.js utama dan Git tidak ada di mesin ini. Semua verifikasi berjalan di
Node bawaan Playwright (`ms-playwright-go\1.57.0\node.exe`). `git diff` tidak
bisa dijalankan, jadi laporan perubahan harus berupa nama berkas dan baris.
