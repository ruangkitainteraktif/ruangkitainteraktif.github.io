#!/usr/bin/env node
/* proxy-persil-qgis.js — WMS persil BHUMI untuk QGIS via proxy lokal.
 *
 * Kenapa perlu: nginx bhumi.atrbpn.go.id menyaring request WMS berdasarkan
 * Referer + User-Agent (harus tampak seperti dari halaman bhumi), dan
 * memblokir literal "GetCapabilities"/"GetFeatureInfo"/"GetLegendGraphic"
 * di query string (403) — sedangkan GeoServer menerima nilai REQUEST yang
 * ter-encode URL (mis. %47etCapabilities) sebagai nama request yang sama.
 * Proxy ini menyuntik header yang benar dan menyamarkan REQUEST itu, jadi
 * QGIS bisa memakai alur WMS normal (capabilities, peta, info).
 *
 * Jalankan : node tools/proxy-persil-qgis.js   (opsi: --port 7788)
 * QGIS     : Data Source Manager > WMS/WMTS > New >
 *            URL: http://localhost:7788/mprx/service
 *            (kolom Referer dibiarkan kosong — proxy yang mengisinya)
 *            pilih layer bhumi_persil > Add.
 *
 * Data: ATR/BPN BHUMI — pakai secukupnya (lihat peta di QGIS; jangan
 * unduhan masal).
 */
'use strict';
const http = require('http');

const UPSTREAM = 'https://bhumi.atrbpn.go.id';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BLOKIR = ['GetCapabilities', 'GetFeatureInfo', 'GetLegendGraphic'];

function parseArgs(argv) {
  const a = { port: 7788 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--port') { a.port = parseInt(v, 10); i++; }
    else { console.error('Argumen tidak dikenal: ' + k); process.exit(2); }
  }
  if (!Number.isFinite(a.port) || a.port < 1 || a.port > 65535) { console.error('--port harus 1-65535'); process.exit(2); }
  return a;
}

const args = parseArgs(process.argv.slice(2));

const server = http.createServer(async (req, res) => {
  try {
    /* REQUEST=GetXxx yang diblokir nginx → %47etXxx (huruf G saja yang
     * di-encode); GeoServer membacanya kembali sebagai GetXxx. */
    let raw = req.url;
    for (const k of BLOKIR) {
      const re = new RegExp('([?&]REQUEST=)(' + k + ')(?=&|$)', 'i');
      if (re.test(raw)) { raw = raw.replace(re, (m, p1, p2) => p1 + '%47' + p2.slice(1)); break; }
    }
    const target = UPSTREAM + raw;
    const r = await fetch(target, {
      headers: {
        'Referer': 'https://bhumi.atrbpn.go.id/peta',
        'Origin': 'https://bhumi.atrbpn.go.id',
        'User-Agent': UA,
        'Accept': req.headers.accept || '*/*'
      },
      redirect: 'follow'
    });
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get('content-type');
    res.writeHead(r.status, Object.assign(
      ct ? { 'Content-Type': ct } : {},
      { 'X-Proxy-Upstream': String(r.status), 'Cache-Control': 'no-store' }
    ));
    res.end(buf);
    console.log('GET ' + raw.slice(0, 140) + ' -> ' + r.status + ' ' + (buf.length >> 10) + ' KB');
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('proxy gagal: ' + (e && e.message ? e.message : e));
  }
});

server.listen(args.port, '127.0.0.1', () => {
  console.log('proxy persil BHUMI > http://127.0.0.1:' + args.port + '/mprx/service');
  console.log('QGIS: Data Source Manager > WMS/WMTS > New > URL di atas (kolom Referer kosong)');
  console.log('Berhenti: Ctrl+C');
});
