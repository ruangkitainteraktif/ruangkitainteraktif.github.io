<div align="center">

# 🌏 RUANG KITA

### **Satu Peta untuk Nusantara** — *One Map for the Archipelago*

![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)
[![Live Demo](https://img.shields.io/badge/Live_Demo-ruangkitainteraktif.github.io-brightgreen)](https://ruangkitainteraktif.github.io)

</div>

---

## 📖 Tentang / About

**RUANG KITA** adalah platform peta interaktif berbasis web untuk Indonesia. Mengintegrasikan data geospasial dari berbagai sumber Kementerian dan Lembaga (BMKG, BIG, Kementan, Kemendagri, Pemprov Jatim, Kab. Sukoharjo) ke dalam satu antarmuka yang mudah digunakan.

**RUANG KITA** is a web-based interactive map platform for Indonesia. It integrates geospatial data from various government sources (BMKG, BIG, Kementan, Kemendagri, East Java Provincial Govt, Sukoharjo Regency) into a single, easy-to-use interface.

🌐 **Live Demo:** [https://ruangkitainteraktif.github.io](https://ruangkitainteraktif.github.io)

📱 **Mobile App:** Download APK RuangKita Mobile langsung dari website

---

## 🖼️ Screenshot

<div align="center">

![RUANG KITA](assets/img/view.jpg)

</div>

---

## ✨ Fitur / Features

### 🗺️ GEOID — Batas Wilayah Administrasi

- Pencarian bertingkat: Provinsi → Kabupaten/Kota → Kecamatan → Desa/Kelurahan
- Pencarian koordinat (Latitude, Longitude)
- Reverse geocode otomatis saat klik peta
- Tampilan batas wilayah dari **BIG** (Badan Informasi Geospasial)
- Ringkasan jumlah wilayah (Provinsi, Kab/Kota, Kecamatan, Desa)
- Pop-up detail administrasi (provinsi, kecamatan, desa, jalan, kode pos)

*Hierarchical search: Province → Regency → District → Village. Automatic reverse geocode on map click. Administrative boundaries from BIG.*

### 🌾 GEOTANI — Analisis Pertanian

- **LBS Analysis** — Analisis Luas Lahan Baku Sawah per desa/kelurahan
- **KTA Analysis** — Overlay erosi (Konservasi Tanah & Air) dengan Lahan Baku Sawah
- **NDVI Analysis** — Indeks Vegetasi Normalisasi (Sentinel-2) untuk analisis kesehatan tanaman
- **Land Cover Analysis** — Klasifikasi tutupan lahan (Sentinel-2 10m, Esri)
- Pencarian BPP (Balai Penyuluhan Pertanian) dan IGT Sawit
- Skor kerentanan pertanian (CVSS-style scoring) berbasis erosi, NDVI, dan rasio sawah
- Cetak PDF hasil analisis geotani

*Agricultural analysis: LBS (Rice Field Area), KTA (Soil & Water Conservation overlay), NDVI (Sentinel-2 vegetation index), Land Cover (Sentinel-2 10m). Agricultural vulnerability scoring and PDF export.*

### 📡 GEOPORTAL — Layer Data Pemerintah

- Layer data **Pemprov Jawa Timur**: pendidikan, kesehatan, transportasi, batas administrasi
- Layer data **Kabupaten Sukoharjo**: sekolah, puskesmas, jaringan infrastruktur, aset daerah
- Layer data **Magelang Kota**, **ATR/BPN**, **BPS**
- Pencarian layer dengan autocomplete
- Tree view layer (jsTree) dengan checkbox on/off
- Klik peta untuk melihat detail fitur (properti attribute)

*Government data layers: East Java Provincial (education, health, transport), Sukoharjo Regency (schools, health centers, infrastructure), ATR/BPN land parcels, BPS statistics.*

### 🎥 GEOWATCH — CCTV Lalu Lintas

- Monitoring CCTV jalan tol, jalan nasional, dan jalan non-tol
- Streaming video real-time (Video.js + HLS.js)
- Pencarian CCTV dengan autocomplete
- Filter berdasarkan area
- Marker clustering untuk titik CCTV

*Real-time traffic CCTV monitoring on toll roads, national roads, and non-toll roads with video streaming.*

### 🌤️ GEOWX — Prakiraan Cuaca BMKG

- Prakiraan cuaca 3 hari ke depan dari BMKG
- Grafik prakiraan cuaca 3 hari per 3 jam
- Pencarian lokasi dengan autocomplete
- Insight cuaca (ikon, suhu, kelembapan, angin, tutupan awan)
- **Animasi Angin (Wind Particle)** — visualisasi aliran angin real-time

*3-day weather forecast from BMKG. Wind particle animation for real-time wind flow visualization.*

### 🔴 GEOQUAKE — Data Gempa Real-time

- Gempa terkini dari BMKG
- Gempa signifikan (M5.0+)
- Gempa dirasakan
- Marker animasi dengan popup detail
- Zona risiko gempa dan longsor dari **BIG**

*Real-time earthquake data from BMKG: latest, significant (M5.0+), and felt earthquakes with animated markers. Hazard zone mapping from BIG.*

### 🛠️ TOOLS — Alat Analisis GIS

- Gambar di peta: Titik, Garis, Poligon, Persegi, Lingkaran
- Pengukuran jarak dan luas area
- Export hasil gambar ke **GeoJSON**
- Import dan visualisasi file **GeoJSON**
- Import dan visualisasi **Shapefile** (.shp + .dbf + .shx)
- Cetak PDF dari analisis geotani

*Drawing tools (marker, polyline, polygon, rectangle, circle). Distance and area measurement. GeoJSON/SHP import and visualization. PDF export.*

### 🔍 Pencarian Terpadu / Unified Search

- Satu kolom pencarian untuk semua level administrasi dan lokasi
- Hasil instan dengan autocomplete
- **Insight Cards** — kartu cuaca dan gempa terkini di bawah pencarian

*Single search bar for all administrative levels with instant results. Live weather and earthquake insight cards.*

### 📊 Insight & Analisis / Insights & Analysis

- **Statistik Dukcapil** — data kependudukan (usia, agama, pendidikan, pekerjaan, golongan darah)
- Jadwal sholat (Aladhan API)
- Fasilitas terdekat dari Overpass API (rumah sakit, sekolah, dll)
- Estimasi harga properti (Rupabumi.com)
- Luas wilayah dan lahan baku sawah
- Zona bahaya (gempa, longsor) dari BIG

*Population statistics (age, religion, education, occupation, blood type). Prayer schedule. Nearby facilities. Property price estimation. Village area analysis. Hazard zone mapping.*

### 📱 Welcome Feature Modal

- Modal selamat datang otomatis saat pertama kali membuka website (session-based)
- Daftar lengkap semua fitur dan teknologi yang digunakan
- Tombol Download RuangKita Mobile APK

*Auto-show welcome modal on first visit with feature overview and mobile app download.*

### 🗺️ Fitur Peta Lainnya

- **Basemap**: Carto Light, Carto Dark, OpenStreetMap, Esri Satellite, Rupabumi Indonesia (BIG)
- **Opasitas layer** yang dapat diatur
- **Kunci peta** — disable interaksi peta
- **Reset layer** — hapus semua layer aktif sekaligus
- **Lokasi saya** — tombol geolokasi pengguna
- **RuangKita Mobile** — aplikasi Android (APK) untuk akses dari HP

*Multiple basemaps, adjustable layer opacity, map lock, layer reset, user geolocation, and mobile app (APK).*

---

## 🛠️ Teknologi / Technologies

| Teknologi | Versi | Kegunaan / Purpose |
|-----------|-------|-------------------|
| [Leaflet.js](https://leafletjs.com/) | 1.9.4 | Peta interaktif inti / Core interactive map |
| [Turf.js](https://turfjs.org/) | 7.1.0 | Analisis geospasial / Geospatial analysis |
| [Esri Leaflet](https://esri.github.io/esri-leaflet/) | 3.0.12 | Integrasi ArcGIS / ArcGIS integration |
| [proj4js](https://proj4js.github.io/) | 2.9.0 | Konversi proyeksi / Projection conversion |
| [Leaflet Draw](https://leaflet.github.io/Leaflet.draw/) | 1.0.4 | Alat menggambar / Drawing tools |
| [Leaflet MarkerCluster](https://leaflet.github.io/Leaflet.markercluster/) | 1.5.3 | Clustering marker / Marker clustering |
| [Leaflet LocateControl](https://leaflet.github.io/Leaflet.control.locate/) | 0.85.1 | Lokasi pengguna / User geolocation |
| [Video.js](https://videojs.com/) | 8.23.4 | Pemutar video CCTV / CCTV video player |
| [HLS.js](https://github.com/video-dev/hls.js/) | 1.6.5 | Streaming video HLS / HLS video streaming |
| [jsPDF](https://github.com/parallax/jsPDF) | 2.5.1 | Cetak PDF / PDF generation |
| [html2canvas](https://html2canvas.hertzen.com/) | 1.4.1 | Screenshot peta untuk PDF / Map screenshot for PDF |
| [jQuery](https://jquery.com/) | 3.7.1 | DOM manipulation & jsTree |
| [jsTree](https://www.jstree.com/) | 3.3.17 | Tree view layer selector / Layer tree view |
| [shpjs](https://github.com/calvinmetcalf/shapefile-js) | 4.0.4 | Baca file Shapefile / Read Shapefile files |

---

## 🚀 Cara Penggunaan / Getting Started

### Online / Daring

Kunjungi langsung: **[https://ruangkitainteraktif.github.io](https://ruangkitainteraktif.github.io)**

### Lokal / Local

```bash
# Clone repository
git clone https://github.com/ruangkitainteraktif/ruangkitainteraktif.github.io.git

# Buka folder
cd ruangkitainteraktif

# Buka index.html di browser
# Buka file langsung, tidak perlu build step
# Just open index.html in your browser - no build step required!
```

> 💡 **Catatan:** Karena menggunakan API eksternal, beberapa fitur memerlukan koneksi internet.
>
> *Note: Some features require an internet connection due to external API calls.*

---

## 📂 Struktur File / Project Structure

```
ruangkita/
├── index.html                     # Halaman utama / Main page
├── LICENSE                        # GPL-3.0
├── README.md
└── assets/
    ├── css/
    │   └── app.css                # Semua gaya CSS / All CSS styles
    ├── img/
    │   └── favicon.png            # Ikon aplikasi / App icon
    ├── data/
    │   ├── kode_wilayah.json      # Kode wilayah administrasi / Admin codes
    │   ├── geoportal-layers.json  # Konfigurasi layer geoportal
    │   ├── dukcapil/              # Data kependudukan per provinsi
    │   └── app-release.apk        # RuangKita Mobile APK
    └── js/
        ├── map-core.js            # Inisialisasi peta + basemap
        ├── sidebar.js             # Navigasi sidebar + tab
        ├── app-boot.js            # Bootstrap aplikasi
        ├── geoid-wilayah.js       # Pencarian wilayah + insight + boundary
        ├── geotani-search.js      # Pencarian geotani (BPP, IGT Sawit)
        ├── erosi-kta.js           # Analisis KTA + overlay erosi
        ├── ndvi-analysis.js       # Analisis NDVI (Sentinel-2)
        ├── landcover-analysis.js  # Analisis Land Cover
        ├── sawah-dilindungi.js    # Layer sawah dilindungi & nasional
        ├── dukcapil-population.js # Data kependudukan Dukcapil
        ├── geoportal.js           # Geoportal WMS/WFS layers
        ├── geoportal-search.js    # Pencarian layer geoportal
        ├── cctv.js                # CCTV lalu lintas
        ├── weather-bmkg.js        # Data cuaca BMKG
        ├── weather-data.js        # Kode ADM4 + pencarian cuaca
        ├── weather-markers.js     # Marker cuaca di peta
        ├── weather-geocode.js     # Geocode untuk pencarian cuaca
        ├── weather-init.js        # Inisialisasi cuaca + welcome modal
        ├── wind-animation.js      # Animasi angin (wind particle)
        ├── earthquake.js          # Data gempa BMKG
        ├── map-click.js           # Handler klik peta + reverse geocode
        ├── map-insight-cards.js   # Kartu insight cuaca & gempa
        ├── unified-search.js      # Pencarian terpadu
        ├── overlay-village-search.js # Pencarian desa untuk overlay
        ├── alat-draw-measure.js   # Alat gambar & ukur
        ├── alat-layers.js         # Import GeoJSON/SHP
        ├── detail-subtab.js       # Sub-tab detail
        ├── location-permission.js # Modal izin lokasi
        └── geoid-wilayah.js       # Pencarian wilayah + insight
```

---

## 🤝 Kontribusi / Contributing

Kontribusi sangat diterima! Berikut cara berkontribusi:

Contributions are welcome! Here's how to contribute:

1. **Fork** repository ini
2. **Buat branch** baru: `git checkout -b fitur-baru`
3. **Commit** perubahan: `git commit -m 'Tambah fitur baru'`
4. **Push** ke branch: `git push origin fitur-baru`
5. **Buka Pull Request**

### Ide Kontribusi / Contribution Ideas

- 🐛 Bug fix
- ✨ Fitur baru
- 📝 Dokumentasi
- 🌐 Terjemahan
- 🎨 UI/UX improvement
- ⚡ Performa optimization

---

## 📄 Lisensi / License

Proyek ini dilisensikan di bawah **GNU General Public License v3.0** — lihat [LICENSE](LICENSE) untuk detail.

This project is licensed under the **GPL-3.0 License** — see [LICENSE](LICENSE) for details.

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

---

## ❤️ Dukungan / Support

Jika proyek ini bermanfaat, dukunglah pengembangannya:

If this project is useful, consider supporting its development:

<a href="https://saweria.co/maspannn">
  <img src="https://img.shields.io/badge/Saweria-Dukung-ff4d4d?style=for-the-badge" alt="Saweria">
</a>
<a href="https://www.paypal.com/paypalme/panjidanutirto">
  <img src="https://img.shields.io/badge/PayPal-Support-003087?style=for-the-badge&logo=paypal&logoColor=white" alt="PayPal">
</a>

---

<div align="center">

**🌏 RUANG KITA**

<small>Satu Peta untuk Nusantara</small>

</div>
