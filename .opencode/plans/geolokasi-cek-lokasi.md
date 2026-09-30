# Cek Lokasi dari Koordinat

Status: riset selesai, implementasi belum dimulai.
Riset 30 Sep 2026. Semua endpoint diverifikasi langsung ke GISTARU.

## Yang diminta

- Cek lokasi berdasarkan koordinat, ditaruh di sheet Gambar & Ukur
- Pin untuk ambil koordinat di peta
- Koordinat bisa disalin ke clipboard

## Keputusan yang sudah diambil

| Keputusan | Pilihan |
|---|---|
| Lokasi | Kartu di dalam sheet Gambar & Ukur (subtab baru di GeoData) |
| Pin | Ikut alat gambar, bisa dihapus |
| Format koordinat | Derajat desimal |
| Sumber wilayah | GISTARU yang sudah ada |
| Input manual | Tetap ada, ketik angka lalu tekan Cek |
| Popup klik peta | Perbaiki yang ada, jangan buat UI baru |

## Temuan yang mengubah rencana

### 1. Tool ini sebagian sudah ada, tapi mati

`assets/js/map-click.js` sudah punya:
- popup koordinat lengkap dengan tombol Salin (5 desimal, `map-click.js:150`)
- fungsi `fetchReverseGeocodeWithPopup()` (`map-click.js:172`)
- elemen `adm-provinsi`, `adm-kabkota`, `adm-kecamatan`, `adm-desa`

Tapi isinya hardcoded kosong:

```js
const matched = null;
const adm4Code = '';
const desa = '-';
const kecamatan = '-';
const kabkota = '-';
const provinsi = '-';
```

Tidak ada baris pun yang memanggil `fetchReverseGeocodeWithPopup()`. Jadi
permintaan "cek lokasi" sebagian sudah terpenuhi tanpa kode baru, dan sisanya
menghidupkan fungsi yang ada.

### 2. "Gambar & Ukur" bukan panel sendiri

`map-core.js:2497` memindahkan isi seluruh `#tab-geotools` ke dalam sheet saat
FAB dibuka. Sheet berisi dropdown 10 modul, bukan modul terpisah. Karena itu
alat ini masuk sebagai **subtab baru di GeoData** (`geotoolsTabMuatData`),
bukan modul dropdown baru. Urutan dropdown tidak berubah.

### 3. Satu endpoint sudah cukup untuk semua tingkat wilayah

`BATAS_ADMINISTRASI/Admin_Kecamatan/MapServer/0` punya field
`wadmkd`, `wadmkc`, `wadmkk`, `wadmpr`. Satu request per titik:

```json
{"namobj":"Tulangan", "wadmkd":" ", "wadmkc":"Tulangan",
 "wadmkk":"Sidoarjo", "wadmpr":"Jawa Timur"}
```

Jadi `SERVICE_RDTR_ALL` dan `WADMKD` di layer zona **tidak diperlukan**.

### 4. Pin tidak perlu kode marker

`startDraw('marker')` sudah didukung (`alat-draw-measure.js:334`) dan handler
`draw:created` sudah memberi popup berisi koordinat
(`alat-draw-measure.js:366`). Cukup memanggil `startDraw('marker')`, sama
seperti GeoOSS memanggil `startDraw('polygon')`.

## Dua jebakan yang harus ditangani

### Jebakan 1: `wadmkd` bernilai satu spasi

Layer ini **tidak punya batas desa**, hanya batas kecamatan. Sample Tulangan
mengembalikan `"wadmkd":" "`. Tanpa `trim()`, UI menampilkan "Desa: " dan
terlihat seperti bug.

Konsekuensi untuk desain: **desa tidak akan pernah terisi dari GISTARU**.
Kolom desa harus menampilkan "tidak tersedia di sumber data" dengan alasan,
bukan spasi kosong dan bukan `-` yang tidak dijelaskan.

`namobj` adalah sumber nama utama; untuk sample sama dengan `wadmkc`, tapi
tidak selalu sama.

### Jebakan 2: di luar Indonesia, `features: []` dengan status 200

`{x:0, y:0}` mengembalikan 200 dan array kosong, bukan error. Jadi
"tidak ada wilayah di titik ini" dan "server tidak terjangkau" harus
dibedakan di UI.

### Jebakan 3: `supportsAdvancedQueries: false`

Layer ini tidak mendukung `DISTINCT`, `order by`, atau agregasi. Kalau
koordinat jatuh tepat di batas dua kecamatan, server bisa mengembalikan lebih
dari satu fitur, dan UI harus menentukannya sendiri. Opsi: tampilkan yang
pertama dengan catatan "tepat di batas wilayah", atau tampilkan semua.

## Rencana implementasi

### 1. `assets/js/alat-cek-lokasi.js` (baru)

| Fungsi | Isi |
|---|---|
| `normalisasiWilayah(p)` | `trim()` semua field; nilai yang hanya spasi jadi `null` |
| `cariWilayah(lat, lng)` | 1 request GET ke `Admin_Kecamatan`, `geometryType=esriGeometryPoint` |
| `parseKoordinat(teks)` | terima `lat, lng` dengan spasi/koma; validasi rentang; tolak yang terbalik |
| `arahMataAngin(lat)` | 8 arah, dari bearing rose |
| `teksKoordinat(lat, lng)` | 6 desimal, satu format |
| `salin(teks)` | `navigator.clipboard.writeText`, fallback `execCommand('copy')` |
| `pinLokasi()` | memanggil `window.startDraw('marker')` |
| `tampilKanHasil(h)` | isi panel hasil |
| `init()` | pasang event, pasang subtab |

Query per titik ~700 karakter, jadi aman dari batas ~2.400 karakter yang
ditemukan saat uji POST.

### 2. Markup di `index.html`

Subtab baru di `geotoolsTabMuatData`, setelah `alat-tab-timeline`:

```html
<button class="geoid-subtab-btn" data-subtab="alat-tab-lokasi" onclick="openGeoidSubtab(this)">
  <span>Lokasi</span>
</button>
...
<div id="alat-tab-lokasi" class="geoid-subtab-panel">
  <!-- input koordinat, tombol Cek, tombol Pasang pin, panel hasil,
       tombol Salin -->
</div>
```

### 3. Perbaiki `fetchReverseGeocodeWithPopup()`

Isi yang sekarang hardcoded, pakai `cariWilayah()` yang sama. Cache per
koordinat supaya popup kedua di titik yang sama tidak request lagi.

### 4. Format koordinat diseragamkan ke 6 desimal

`map-click.js:150` sekarang 5 desimal. 6 desimal ~11 cm, cukup untuk titik
lahan, dan satu format di seluruh halaman. 6 desimal ~0,1 m.

### 5. CSS di `assets/css/app.css`

`.geolokasi-*`: panel hasil, baris koordinat, tombol salin. Naikkan
`app.css?v` karena ada CSS baru.

### 6. Test

| Suite | Isi |
|---|---|
| `geolokasi-parse` | `parseKoordinat`: format valid, tertukar, di luar rentang, kosong |
| `geolokasi-wilayah` | `normalisasiWilayah`: spasi jadi null, hierarchy, multi-fitur |
| `geolokasi-markup` | subtab terdaftar, id unik, script termuat, CSS ada |

## Kasus yang harus ditangani di UI

| Kasus | Tampilan |
|---|---|
| Koordinat valid, di Indonesia | hierarchy lengkap, desa "tidak tersedia" |
| Koordinat valid, di luar Indonesia | "titik ini di luar wilayah Indonesia" |
| Server tidak terjangkau | pesan jaringan + koordinat tetap tampil |
| `features: []` di dalam Indonesia | "tidak ada batas wilayah di titik ini" |
| Lebih dari satu fitur | tampilkan yang pertama + catatan "tepat di batas" |
| Input `112.65, -7.47` tertukar | pesan jelas: urutan harus latitude lalu longitude |
| Luas | tidak ditampilkan, alat ini tidak menerima polygon |

## Batasan yang perlu diketahui

- **Desa tidak tersedia.** Layer GISTARU hanya punya batas kecamatan. Ini
  bukan kekurangan implementasi, dan UI harus mengatakannya, bukan
  menyembunyikannya.
- **supportsAdvancedQueries: false** membatasi query; tidak bisa melakukan pencarian tambahan yang lebih rumit.
- Belum ada verifikasi browser untuk semua hal yang bersifat layout.

## Catatan proses

Node.js utama dan Git tidak ada di mesin ini. Verifikasi berjalan di Node
bawaan Playwright (`ms-playwright-go\1.57.0\node.exe`). `git diff` tidak bisa
dijalankan, jadi laporan perubahan berupa nama berkas dan nomor baris.
