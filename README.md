<div align="center">

# 🌏 RUANG KITA

### **Satu Peta untuk Nusantara** — *One Map for the Archipelago*

![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)
[![Live Demo](https://img.shields.io/badge/Live_Demo-ruangkitainteraktif.github.io-brightgreen)](https://ruangkitainteraktif.github.io)

</div>

---

## 📖 Tentang / About

**RUANG KITA** adalah platform peta interaktif berbasis web untuk Indonesia. Mengintegrasikan data geospasial dari berbagai sumber Kementerian dan Lembaga (BMKG, BIG, Kementan, Kemendagri, Pemprov Jatim, Kab. Sukoharjo, BNPB, PVMBG, BPS) ke dalam satu antarmuka yang mudah digunakan.

**RUANG KITA** is a web-based interactive map platform for Indonesia. It integrates geospatial data from various government sources into a single, easy-to-use interface.

🌐 **Live Demo:** [https://ruangkitainteraktif.github.io](https://ruangkitainteraktif.github.io)

📱 **Mobile App:** Download APK RuangKita Mobile langsung dari website

---

## 🖼️ Screenshot

<div align="center">

![RUANG KITA](assets/img/view.jpg)

</div>

---

## ✨ Fitur / Features

### 🗺️ GEONUSA — Batas Wilayah Administrasi

- Pencarian bertingkat: Provinsi → Kabupaten/Kota → Kecamatan → Desa/Kelurahan
- Pencarian koordinat (Latitude, Longitude)
- Reverse geocode otomatis saat klik peta dengan insight wilayah (cuaca, luas, sawah, CCTV, POI, dukcapil)
- Tampilan batas wilayah dari **BIG** (Badan Informasi Geospasial)
- Ringkasan jumlah wilayah (Provinsi, Kab/Kota, Kecamatan, Desa)
- Pop-up detail administrasi (provinsi, kecamatan, desa, jalan, kode pos)
- **Geolokasi pengguna** dengan izin GPS — menampilkan batas wilayah dan data lengkap lokasi

*Hierarchical search with automatic reverse geocode, user geolocation with boundary display.*

### 🌾 GEOTANI — Analisis Pertanian

- **LBS Analysis** — Analisis Luas Lahan Baku Sawah per desa/kelurahan
- **KTA Analysis** — Overlay erosi (Konservasi Tanah & Air) dengan Lahan Baku Sawah
- **NDVI Analysis** — Indeks Vegetasi Normalisasi (Sentinel-2) untuk analisis kesehatan tanaman dengan time series
- **NDRE / NDMI** — Indeks lanjutan untuk deteksi stres tanaman
- **Crop Health** — Skor kesehatan tanaman berbasis NDVI/NDRE/NDMI dengan status warna (Sehat/Sedang/Stres)
- **DEM/Terrain Analysis** — Analisis SRTM (elevasi, slope, aspect, flood potential)
- **Land Cover Analysis** — Klasifikasi tutupan lahan (Sentinel-2 10m, Esri)
- **Choropleth BPS** — Peta interaktif 18 indikator demografi per provinsi (BPS)
- **Population Pyramid** — Piramida populasi usia × jenis kelamin
- Pencarian BPP (Balai Penyuluhan Pertanian) dan IGT Sawit
- Skor kerentanan pertanian (CVSS-style scoring) berbasis erosi, NDVI, dan rasio sawah
- Cetak PDF hasil analisis geotani

*Agricultural analysis: LBS, KTA, NDVI/NDRE/NDMI crop health scoring, DEM terrain, Land Cover, Choropleth BPS, Population Pyramid, PDF export.*

### 📡 GEOPORTAL — Layer Data Pemerintah

- Layer data **Pemprov Jawa Timur**: pendidikan, kesehatan, transportasi, batas administrasi
- Layer data **Kabupaten Sukoharjo**: sekolah, puskesmas, jaringan infrastruktur, aset daerah
- Layer data **Magelang Kota**, **ATR/BPN**, **BPS**
- Pencarian layer dengan autocomplete
- Tree view layer (jsTree) dengan checkbox on/off
- Klik peta untuk melihat detail fitur (properti attribute)

*Government data layers: East Java Provincial, Sukoharjo Regency, ATR/BPN land parcels, BPS statistics.*

### 🎥 GEOWATCH — CCTV Lalu Lintas

- Monitoring CCTV jalan tol, jalan nasional, dan jalan non-tol
- Streaming video real-time (Video.js + HLS.js)
- Pencarian CCTV dengan autocomplete
- Filter berdasarkan area
- Marker clustering untuk titik CCTV

*Real-time traffic CCTV monitoring with video streaming.*

### 🌤️ GEOPULSE — Cuaca & Prediksi

**Sub-tab: Info Cuaca**
- Prakiraan cuaca 3 hari ke depan dari BMKG
- Grafik prakiraan cuaca 3 hari per 3 jam
- Pencarian lokasi dengan autocomplete
- Insight cuaca (ikon, suhu, kelembapan, angin, tutupan awan)

**Sub-tab: Prediksi Cuaca**
- **Animasi Angin (Wind Particle)** — visualisasi aliran angin real-time
- **Prediksi GFS** — Grafik animasi prediksi angin, kelembapan, curah hujan, PM2.5, HTH, GsMAP (48 jam ke depan)
- **Prediksi Maritim** — Analisis gelombang laut (InaWaves API): tinggi gelombang, arus, angin laut, arah gelombang
- Peta prediksi dengan overlay gelombang dan angin

*BMKG weather forecast, wind particle animation, GFS model predictions, maritime wave analysis (InaWaves).*

### 🔴 GEOQUAKE — Gempa & Info Geologi

**Sub-tab: Info Gempa**
- Gempa terkini dari BMKG
- Gempa signifikan (M5.0+)
- Gempa dirasakan
- Marker animasi dengan popup detail
- Zona risiko gempa dan longsor dari **BIG**

**Sub-tab: Info Geologi**
- **Gunung Api** — 74 gunung api berstatus dari MAGMA Indonesia, marker warna berdasarkan level aktivitas
- **KRB Gunung Api** — Zona bahaya火山 (MapServer) polygon overlay
- **KRB Titik** — Titik gas vulkanik berbahaya (MapServer) dengan popup detail
- **Peta Geologi** — Peta geologi nasional (BIG MapServer)
- **Geostruktur** — Patahan sesar dan lipatan dari BIG
- **Patahan Aktif 1:50K** — Data patahan aktif detail
- **Likuifaksi** — Zona kerentanan likuifaksi
- **Karst** — Lanskap karst nasional

**Sub-tab: Info Bencana**
- **Gempa NTT 2026** — Data kerusakan gempa dari BNPB (FeatureServer) dengan warna tingkat kerusakan
- **Jalur Evakuasi** — Rute evakuasi bencana
- **Sensor Seismic** — Stasiun pemantauan gempa aktif
- **Sensor Global** — Stasiun pemantauan global
- **Riwayat Gempa** — Data gempa historis
- **Katalog Gempa** — Katalog gempa BMKG

**Sub-tab: Info Karhutla**
- **Hotspot Karhutla** — Titik panas kebakaran hutan dan lahan dari NASA FIRMS via SIPONGI
- Heatmap visualisasi kepadatan hotspot

*Real-time earthquakes, volcano monitoring (74 volcanoes), geological hazard layers, BNPB damage data, karhutla hotspot monitoring.*

### 🛠️ GEOTOOLS — Alat Analisis GIS

- Gambar di peta: Titik, Garis, Poligon, Persegi, Lingkaran
- Pengukuran jarak dan luas area
- Export hasil gambar ke **GeoJSON**
- Import dan visualisasi file **GeoJSON**
- Import dan visualisasi **Shapefile** (.shp + .dbf + .shx)
- Cetak PDF dari analisis geotani

*Drawing tools, distance/area measurement, GeoJSON/SHP import, PDF export.*

### 🔍 Pencarian Terpadu / Unified Search

- Satu kolom pencarian untuk semua level administrasi dan lokasi
- Hasil instan dengan autocomplete
- **Insight Cards** — kartu cuaca dan gempa terkini di bawah pencarian

*Single search bar with instant results, live weather and earthquake insight cards.*

### 📊 Insight & Analisis / Insights & Analysis

- **Statistik Dukcapil** — data kependudukan (usia, agama, pendidikan, pekerjaan, golongan darah)
- **Choropleth Maps** — 18 indikator demografi per provinsi dari BPS
- **Population Pyramid** — visualisasi piramida populasi
- **Crop Health** — skor kesehatan tanaman berbasis indeks vegetasi
- Jadwal sholat (Aladhan API)
- Fasilitas terdekat dari Overpass API (rumah sakit, sekolah, dll)
- Estimasi harga properti (Rupabumi.com)
- Luas wilayah dan lahan baku sawah
- Zona bahaya (gempa, longsor) dari BIG

*Population statistics, choropleth maps, population pyramid, crop health, prayer schedule, nearby facilities, property estimation.*

### 📱 Welcome Feature Modal & About

- Modal selamat datang otomatis saat pertama kali membuka website (session-based)
- Daftar lengkap semua fitur dalam modal
- Tombol Download RuangKita Mobile APK
- **Tab ABOUT** — Form kontak (via Google Apps Script), donasi Saweria & PayPal, download APK

*Auto-show welcome modal, contact form, donation links, APK download.*

### 🗺️ Fitur Peta Lainnya

- **Basemap**: Carto Light, Carto Dark, OpenStreetMap, Esri Satellite, Rupabumi Indonesia (BIG), **Google Maps**, **Google Terrain**, **Google Traffic**
- **Scale bar** — pengukuran skala di peta
- **Opasitas layer** yang dapat diatur
- **Kunci peta** — disable interaksi peta
- **Reset layer** — hapus semua layer aktif sekaligus
- **Lokasi saya** — tombol geolokasi pengguna dengan reverse geocoding
- **RuangKita Mobile** — aplikasi Android (APK) untuk akses dari HP

*8 basemaps including Google, scale bar, layer opacity, map lock, layer reset, user geolocation, mobile app.*

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
| [Leaflet.heat](https://github.com/Leaflet/Leaflet.heat) | 0.2.0 | Heatmap karhutla / Karhutla heatmap |
| [Video.js](https://videojs.com/) | 8.23.4 | Pemutar video CCTV / CCTV video player |
| [HLS.js](https://github.com/video-dev/hls.js/) | 1.6.5 | Streaming video HLS / HLS video streaming |
| [Chart.js](https://www.chartjs.org/) | 4.4.7 | Grafik & visualisasi / Charts & visualization |
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

## 🤝 Kontribusi / Contributing

Kontribusi sangat diterima! Berikut cara berkontribusi:

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
