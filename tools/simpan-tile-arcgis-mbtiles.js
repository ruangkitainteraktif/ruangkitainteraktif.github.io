#!/usr/bin/env node
/* simpan-tile-arcgis-mbtiles.js — Unduh tile raster layanan ArcGIS MapServer
 * (mis. geoportal.planologi.kehutanan.go.id) langsung ke MBTiles (SQLite).
 *
 * Sumber  : <MapServer>/export — endpoint dinamis (capability Map). Query
 *           fitur/identify sering "not supported", jadi hasilnya raster PNG
 *           dengan simbologi resmi peta, bukan geometri vektor.
 * Grid    : slippy XYZ 256px, EPSG:3857 (baris TMS = (2^z-1)-y), persegi,
 *           transparent=true supaya area tanpa data tidak dihitung.
 * Hasil   : <out>.mbtiles (tiles + metadata), selain itu
 *           <outDir>/kosong.txt, <outDir>/gagal.txt, <outDir>/manifest.json.
 * Resume  : jalankan ulang perintah sama — tile yang sudah di MBTiles atau
 *           tercatat kosong dilewati, gagal dicoba lagi.
 *
 * Pakai   : node tools/simpan-tile-arcgis-mbtiles.js \
 *             --url https://geoportal.planologi.kehutanan.go.id/server/rest/services/Peta_Interaktif_2026/KWSHUTAN_AR_250K/MapServer \
 *             --z 5-10 --out "D:\MBTILES\kwshutan-ar-250k.mbtiles"
 * Opsi    : --bbox "W,S,E,N" (default: fullExtent layanan)  --conc 4  --retry 2
 *           --yes  --force  --help
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { DatabaseSync } = require('node:sqlite');

const HELP = `
Unduh tile raster layanan ArcGIS MapServer ke MBTiles.

Wajib : --url <.../MapServer>   URL layanan ArcGIS REST
       --z "5-10"              daftar zoom (slippy 256px, EPSG:3857)

Opsi  : --bbox "W,S,E,N"        cakupan lon/lat (default: fullExtent layanan)
       --out    file.mbtiles    tujuan (default: D:\\MBTILES\\<nama layanan>.mbtiles)
       --conc   pekerja paralel (default: 4)
       --retry  percobaan ulang per tile (default: 2)
       --yes    lewati konfirmasi
       --force  unduh ulang meski tile sudah ada
       --layer id               layerDefs show:<id> (opsional; default semua)
       --help   bantuan ini
`;

function parseArgs(argv) {
  const a = { url: null, z: null, bbox: null, out: null, conc: 4, retry: 2, yes: false, force: false, layer: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    switch (k) {
      case '--url': a.url = v; i++; break;
      case '--z': a.z = v; i++; break;
      case '--bbox': a.bbox = v; i++; break;
      case '--out': a.out = v; i++; break;
      case '--conc': a.conc = parseInt(v, 10); i++; break;
      case '--retry': a.retry = parseInt(v, 10); i++; break;
      case '--yes': a.yes = true; break;
      case '--force': a.force = true; break;
      case '--layer': a.layer = v; i++; break;
      case '--help': case '-h': a.help = true; break;
      default: console.error('Argumen tidak dikenal: ' + k); process.exit(2);
    }
  }
  return a;
}

function fail(msg) { console.error('GAGAL: ' + msg); process.exit(2); }

const HALF = 20037508.342789244, WORLD = HALF * 2;
function lon2tileX(lon, z) { return Math.floor(((lon + 180) / 360) * Math.pow(2, z)); }
function lat2tileY(lat, z) {
  const cl = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const r = cl * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z));
}
function tileBbox(z, x, y) {
  const s = WORLD / Math.pow(2, z), mn = -HALF + x * s, mx = HALF - y * s;
  // bulat ke 2 desimal (cm) — export ArcGIS dinamis toleran terhadap pembulatan ini
  return [mn, mx - s, mn + s, mx].map(v => Math.round(v * 100) / 100);
}

function exportUrl(base, bbox, layerId) {
  let u = base.replace(/\/$/, '') + '/export'
    + '?bbox=' + bbox.join(',')
    + '&bboxSR=102100&imageSR=102100&size=256,256'
    + '&format=png32&transparent=true&f=image';
  if (layerId !== null && layerId !== undefined) u += '&layerDefs=' + encodeURIComponent('{"' + layerId + '":"1=1"}');
  return u;
}

/* Hitung piksel tak-transparan PNG (palet ctype3 / RGBA ctype6) — 0 = kosong. */
function opaqueCount(buf) {
  if (!buf || buf.length < 24 || buf[0] !== 0x89) return null;
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), depth = buf[24], ctype = buf[25];
  if (depth !== 8 || !(ctype === 2 || ctype === 3 || ctype === 6)) return -1;
  try {
    const idat = []; let trns = null;
    for (let o = 8; o + 8 <= buf.length;) {
      const len = buf.readUInt32BE(o), t = buf.toString('ascii', o + 4, o + 8);
      if (t === 'IDAT') idat.push(buf.slice(o + 8, o + 8 + len));
      else if (t === 'tRNS') trns = buf.slice(o + 8, o + 8 + len);
      o += 12 + len;
    }
    if (ctype === 3 && !trns) return -1; // palet penuh tanpa transparansi: anggap berisi
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const ch = ctype === 6 ? 4 : 3, stride = w * ch;
    let prevRow = Buffer.alloc(stride), p = 0, opaque = 0;
    for (let y = 0; y < h; y++) {
      const f = raw[p++], row = raw.slice(p, p + stride); p += stride;
      const cur = Buffer.alloc(stride);
      for (let x = 0; x < stride; x++) {
        const a = x >= ch ? cur[x - ch] : 0, b = prevRow[x], c = x >= ch ? prevRow[x - ch] : 0;
        let v = row[x];
        if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
        else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
        cur[x] = v & 255;
      }
      if (ctype === 6) { for (let x = 3; x < stride; x += 4) if (cur[x] > 0) opaque++; }
      else { for (let x = 0; x < w; x++) { const idx = cur[x]; if (idx >= trns.length || trns[idx] > 0) opaque++; } }
      prevRow = cur;
    }
    return opaque;
  } catch (e) { return -1; }
}

function loadLines(file) {
  try { return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean); } catch (e) { return []; }
}
function fmtNum(n) { return n.toLocaleString('id-ID'); }
function fmtBytes(b) {
  if (!b) return '0 B';
  if (b >= 1073741824) return (b / 1073741824).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' GB';
  if (b >= 1048576) return (b / 1048576).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' MB';
  if (b >= 1024) return (b / 1024).toLocaleString('id-ID', { maximumFractionDigits: 0 }) + ' KB';
  return b + ' B';
}
function fmtDur(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return s + ' dtk';
  const m = Math.round(s / 60);
  if (m < 60) return m + ' mnt';
  return (m / 60).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jam';
}
function askYes() {
  return new Promise(resolve => {
    if (!process.stdin.isTTY) { resolve(false); return; }
    process.stdout.write('Lanjutkan unduh? [y/N] ');
    process.stdin.once('data', d => resolve(String(d).trim().toLowerCase() === 'y'));
    process.stdin.once('end', () => resolve(false));
  });
}

async function fetchWithRetry(url, retries) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 60000);
      const r = await fetch(url, { signal: ctl.signal });
      clearTimeout(timer);
      const buf = Buffer.from(await r.arrayBuffer());
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      if (r.status !== 200) {
        lastErr = { note: 'HTTP ' + r.status, retry: r.status >= 500 || r.status === 429 };
      } else if (buf[0] !== 0x89) {
        let note = 'bukan PNG';
        try { note = 'ARC error: ' + (JSON.parse(buf.toString('utf8')).error && JSON.parse(buf.toString('utf8')).error.message || 'tanpa pesan'); } catch (e) { /* bukan json */ }
        lastErr = { note, retry: false };
      } else {
        return { buf, err: null };
      }
    } catch (e) {
      lastErr = { note: 'jaringan: ' + (e && e.message ? e.message : e), retry: true };
    }
    if (lastErr.retry && i < retries) { await new Promise(res => setTimeout(res, 1500 * (i + 1))); continue; }
    if (!lastErr.retry) { return { buf: null, err: lastErr.note }; }
  }
  return { buf: null, err: lastErr ? lastErr.note : 'tidak diketahui' };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.url || !args.z) { console.log(HELP); process.exit(args.help ? 0 : 2); }
  if (!Number.isFinite(args.conc) || args.conc < 1 || args.conc > 16) fail('--conc harus 1-16');
  if (!Number.isFinite(args.retry) || args.retry < 0 || args.retry > 6) fail('--retry harus 0-6');
  const base = args.url.split('?')[0].replace(/\/+$/, '');

  /* Metadata layanan */
  const rMeta = await fetch(base + '?f=json');
  const meta = await rMeta.json();
  if (meta.error) fail('layanan menolak: ' + (meta.error.message || JSON.stringify(meta.error)));
  let bbox = null;
  if (args.bbox) {
    const p = args.bbox.split(',').map(Number);
    if (p.length !== 4 || p.some(n => !isFinite(n)) || p[0] >= p[2] || p[1] >= p[3]) fail('--bbox harus "W,S,E,N" dengan W<E dan S<N');
    bbox = p;
  } else if (meta.fullExtent && isFinite(meta.fullExtent.xmin)) {
    bbox = [meta.fullExtent.xmin, meta.fullExtent.ymin, meta.fullExtent.xmax, meta.fullExtent.ymax];
  } else fail('fullExtent tidak tersedia — tentukan --bbox manual');

  const zooms = [];
  for (const part of String(args.z).split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) fail('--z tidak valid: ' + part);
    const a = +m[1], b = m[2] !== undefined ? +m[2] : a;
    if (a > b) fail('rentang zoom terbalik: ' + part);
    for (let z = a; z <= b; z++) if (!zooms.includes(z)) zooms.push(z);
  }
  zooms.sort((p, q) => p - q);

  const layers = meta.layers || [];
  const nama = layers.length ? String(layers[0].name || base.split('/').pop()) : base.split('/').pop();
  const out = path.resolve(args.out || path.join('D:\\MBTILES', nama.toLowerCase() + '.mbtiles'));
  const outDir = path.dirname(out);
  fs.mkdirSync(outDir, { recursive: true });
  if (fs.existsSync(out) && fs.statSync(out).size === 0) fs.unlinkSync(out);

  const db = new DatabaseSync(out);
  db.exec(`
    PRAGMA journal_mode=DELETE;
    PRAGMA synchronous=OFF;
    CREATE TABLE IF NOT EXISTS metadata (name TEXT, value TEXT);
    CREATE TABLE IF NOT EXISTS tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);
    CREATE UNIQUE INDEX IF NOT EXISTS tile_index ON tiles (zoom_level, tile_column, tile_row);
  `);
  db.exec('PRAGMA synchronous=OFF');
  const insTile = db.prepare('INSERT OR REPLACE INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)');
  const mbHas = new Set();
  for (const r0 of db.prepare('SELECT zoom_level, tile_column, tile_row FROM tiles').iterate()) {
    mbHas.add(r0.zoom_level + '/' + r0.tile_column + '/' + r0.tile_row);
  }

  const kosongSet = new Set(loadLines(path.join(outDir, 'kosong.txt')));
  const gagalFile = path.join(outDir, 'gagal.txt');
  const gagalLines = loadLines(gagalFile);
  const gagalByKey = new Map();
  for (const l of gagalLines) { const k = l.split('\t')[0].trim(); if (!gagalByKey.has(k)) gagalByKey.set(k, l); }
  if (gagalByKey.size !== gagalLines.length) fs.writeFileSync(gagalFile, [...gagalByKey.values()].join('\n') + '\n');
  const gagalSet = new Set(gagalByKey.keys());

  const cells = [];
  for (const z of zooms) {
    const x0 = Math.max(0, lon2tileX(bbox[0], z));
    const x1 = Math.min(Math.pow(2, z) - 1, lon2tileX(bbox[2], z));
    const y0 = Math.max(0, lat2tileY(bbox[3], z));
    const y1 = Math.min(Math.pow(2, z) - 1, lat2tileY(bbox[1], z));
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const key = z + '/' + x + '/' + y;
      const col = x, row = (Math.pow(2, z) - 1) - y, lvl = z;
      if (!args.force && kosongSet.has(key)) continue;
      if (!args.force && mbHas.has(lvl + '/' + col + '/' + row)) continue;
      cells.push({ z, x, y });
    }
  }
  console.log('Layanan  : ' + base);
  console.log('MBTiles  : ' + out);
  console.log('Bbox     : ' + bbox.join(', ') + '   Zoom: ' + zooms.join(','));
  console.log('Sisa unduh: ' + fmtNum(cells.length) + ' tile (dari ' + fmtNum((function () {
    let n = 0;
    for (const z of zooms) {
      const x0 = Math.max(0, lon2tileX(bbox[0], z));
      const x1 = Math.min(Math.pow(2, z) - 1, lon2tileX(bbox[2], z));
      const y0 = Math.max(0, lat2tileY(bbox[3], z));
      const y1 = Math.min(Math.pow(2, z) - 1, lat2tileY(bbox[1], z));
      n += (x1 - x0 + 1) * (y1 - y0 + 1);
    }
    return n;
  })()) + ' sel)');
  console.log('LAYERS   : ' + layers.map(l => l.id + ':' + l.name).join(', '));
  if (!cells.length) {
    console.log('Tidak ada tile baru — semua lengkap.');
    tupleMetadata();
    db.close();
    return;
  }
  if (!args.yes) { const y = await askYes(); if (!y) { console.log('Dibatalkan.'); process.exit(1); } }

  const kosongArr = [], gagalArr = [];
  let dbBatch = 0;
  function flush() {
    if (dbBatch) { db.exec('COMMIT'); db.exec('BEGIN'); dbBatch = 0; }
    if (kosongArr.length) { fs.appendFileSync(path.join(outDir, 'kosong.txt'), kosongArr.join('\n') + '\n'); kosongArr.length = 0; }
    if (gagalArr.length) { fs.appendFileSync(gagalFile, gagalArr.join('\n') + '\n'); gagalArr.length = 0; }
  }
  db.exec('BEGIN');
  const flushTimer = setInterval(flush, 5000);
  const t0 = Date.now();
  let done = 0, written = 0, empty = 0, failed = 0, bytes = 0, cursor = 0, nextReport = 50;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= cells.length) return;
      const { z, x, y } = cells[i];
      const key = z + '/' + x + '/' + y;
      try {
        const { buf, err } = await fetchWithRetry(exportUrl(base, tileBbox(z, x, y), args.layer === null ? undefined : args.layer), args.retry);
        if (err || !buf) { failed++; if (!gagalSet.has(key)) { gagalSet.add(key); gagalArr.push(key + '\t' + String(err || '').slice(0, 200)); } }
        else {
          const oc = opaqueCount(buf);
          if (oc === 0) { empty++; kosongArr.push(key); kosongSet.add(key); }
          else {
            const row = (Math.pow(2, z) - 1) - y;
            insTile.run(z, x, row, buf);
            mbHas.add(z + '/' + x + '/' + row);
            if (++dbBatch >= 50) { db.exec('COMMIT'); db.exec('BEGIN'); dbBatch = 0; }
            written++; bytes += buf.length;
          }
        }
      } catch (e) {
        failed++;
        if (!gagalSet.has(key)) { gagalSet.add(key); gagalArr.push(key + '\tkesalahan: ' + (e && e.message || e)); }
      }
      done++;
      if (done >= nextReport) {
        nextReport += 100;
        const el = Date.now() - t0;
        console.log('  ' + fmtNum(done) + '/' + fmtNum(cells.length) + ' • tulis ' + fmtNum(written) + ' • kosong ' + fmtNum(empty) + ' • gagal ' + fmtNum(failed) +
          ' • ' + fmtBytes(bytes) + ' • ETA ' + fmtDur((el / done) * (cells.length - done)));
      }
    }
  }

  const onSigint = () => { clearInterval(flushTimer); flush(); console.log('\nDihentikan — kemajuan tersimpan. Jalankan ulang perintah sama untuk melanjutkan.'); process.exit(130); };
  process.on('SIGINT', onSigint);

  await Promise.all(Array.from({ length: args.conc }, worker));
  clearInterval(flushTimer);
  flush();
  process.removeListener('SIGINT', onSigint);
  if (dbBatch) { db.exec('COMMIT'); dbBatch = 0; }

  const el = Date.now() - t0;
  console.log('Selesai ' + fmtDur(el) + ': tulis ' + fmtNum(written) + ' (' + fmtBytes(bytes) + '), kosong ' + fmtNum(empty) + ', gagal ' + fmtNum(failed) + '.');
  if (failed) console.log('Gagal tercatat di ' + gagalFile + ' — jalankan ulang perintah sama untuk mencoba lagi.');
  tupleMetadata();
  writeManifest();
  db.close();

  function tupleMetadata() {
    const st = db.prepare('SELECT COUNT(*) n, SUM(LENGTH(tile_data)) b, MIN(zoom_level) mn, MAX(zoom_level) mx FROM tiles').get();
    const metaRows = [
      ['name', meta.name || nama],
      ['type', 'overlay'],
      ['version', '1.0.0'],
      ['description', 'Tile raster ' + nama + ' dari ' + base + ' — simbologi resmi layanan (capability Map saja; Query/Identify tidak didukung). Cadangan pribadi; jangan didistribusikan ulang.'],
      ['format', 'png'],
      ['bounds', bbox.slice(0, 4).join(',')],
      ['center', ((bbox[0] + bbox[2]) / 2).toFixed(4) + ',' + ((bbox[1] + bbox[3]) / 2).toFixed(4) + ',' + (st && st.mn !== null ? st.mn : zooms[0])],
      ['minzoom', String(st && st.mn !== null ? st.mn : zooms[0])],
      ['maxzoom', String(st && st.mx !== null ? st.mx : zooms[zooms.length - 1])],
    ];
    const ins = db.prepare('INSERT OR REPLACE INTO metadata (name, value) VALUES (?, ?)');
    for (const [k, v] of metaRows) ins.run(k, v);
    if (st) console.log('MBTiles: ' + fmtNum(st.n) + ' tile, ' + fmtBytes(st.b) + ', zoom ' + st.mn + '-' + st.mx);
  }
  function writeManifest() {
    const file = path.join(outDir, 'manifest.json');
    let m = {};
    try { m = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { }
    m.sumber = base;
    m.layer = layers.map(l => l.id + ':' + l.name).join(', ');
    m.hasil = out;
    m.grid = 'slippy XYZ 256px EPSG:3857 → MBTiles TMS (tile_row = (2^z-1)-y)';
    m.dibuat = m.dibuat || new Date().toISOString();
    m.terakhir = new Date().toISOString();
    m.zooms = [...new Set([...(m.zooms || []), ...zooms])].sort((a, b) => a - b);
    if (Array.isArray(m.bbox)) m.bbox = [Math.min(m.bbox[0], bbox[0]), Math.min(m.bbox[1], bbox[1]), Math.max(m.bbox[2], bbox[2]), Math.max(m.bbox[3], bbox[3])];
    else m.bbox = bbox;
    m.riwayat = m.riwayat || [];
    m.riwayat.push({ waktu: new Date().toISOString(), bbox, zooms, tulis: written, kosong: empty, gagal: failed, bytes });
    try { fs.writeFileSync(file, JSON.stringify(m, null, 2)); } catch (e) { console.error('manifest gagal: ' + e.message); }
  }
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
