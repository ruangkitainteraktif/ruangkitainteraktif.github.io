# GeoPangan Cloudflare Worker

Worker ini meneruskan request harga pangan ke Bank Indonesia dari sisi server agar browser tidak terkena pembatasan CORS. Worker hanya menerima endpoint dan parameter harga yang diperlukan aplikasi; ini bukan open proxy.

## Deploy

1. Instal Node.js LTS, lalu dari folder ini jalankan `npx wrangler login` dan selesaikan otorisasi Cloudflare.
2. Jalankan `npx wrangler deploy --config wrangler.jsonc`.
3. Buka `https://ruangkita-geopangan-proxy.ms-ruang-imajinasi.workers.dev/api/geopangan/harga` untuk memastikan respons `200` atau respons JSON dari Bank Indonesia.

Situs sudah memakai endpoint Worker `workers.dev`, sehingga tidak diperlukan konfigurasi DNS Cloudflare atau perubahan JavaScript lagi setelah deploy selesai.

## Pengembangan lokal

Jalankan `npx wrangler dev`. Jika port Worker berbeda dari situs lokal, tetapkan sebelum memuat `geopangan.js`:

```html
<script>window.GEOPANGAN_PROXY_URL = 'http://localhost:8787/api/geopangan';</script>
```
