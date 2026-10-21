#!/usr/bin/env node
/* simpan-tile-persil.js — Unduh tile persil nasional (BHUMI) ke folder lokal.
 *
 * Sumber : https://bhumi.atrbpn.go.id/mprx/service  LAYERS=bhumi_persil
 *          (direct dari Node + Referer bhumi — nginx menerimanya; tidak lewat proxy)
 * Grid    : Leaflet tileSize 512 — 2^(z-1) sel per zoom, span = world/2^(z-1),
 *          persis formula bhumiPersilNasionalTileUrl() di map-core.js.
 *          (Sel grid ini = slippy 256 pada zoom z-1. CATATAN: zoom site z13
 *          (span 9784 m) saat ini gagal di server — 500 "internal error" —
 *          tile gagal dicatat di gagal.txt, tidak menghentikan unduhan.)
 * Hasil  : <out>\{z}\{x}\{y}.png  (tile berisi)
 *          <out>\kosong.txt        (z/x/y tanpa isi — sengaja tidak disimpan)
 *          <out>\gagal.txt         (z/x/y + alasan — ulangi berjalan untuk memuat ulang)
 *          <out>\manifest.json     (cakupan, jumlah, sumber)
 *
 * Pakai  : node tools/simpan-tile-persil.js --bbox 106.75,-6.25,106.85,-6.15 --z 13-14
 *          opsi: --out "D:\TILE PERSIL"  --conc 4  --retry 2  --yes  --force  --help
 *
 * Contoh resep:
 *   Nasional ringkas (garis besar) : --bbox 94.6,-11.1,141.1,6.4 --z "10-12"
 *   Satu kota/kabupaten            : --bbox 106.3,-6.6,107.1,-5.9 --z "13-16"
 *   Area kerja kecil (per desa)    : --bbox 106.79,-6.25,106.81,-6.23 --z "14-18"
 *
 * Perkiraan kasar luas/tile (grid site): z10 ±78 km, z12 ±19,6 km, z13 ±9,8 km (rusak),
 * z14 ±4,9 km, z15 ±2,4 km, z16 ±1,2 km; tile padat ±130 KB, kosong 0,4–7 KB.
 * Jalankan ulang perintah yang sama untuk melanjutkan (resume); tile yang sudah
 * ada dan seluruh entri kosong dilewati, tile gagal dicoba lagi.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const HALF = 20037508.342789244;
const WORLD = HALF * 2;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, Referer: 'https://bhumi.atrbpn.go.id/peta' };

const HELP = `
Unduh tile persil BHUMI ke folder lokal (piramida {z}/{x}/{y}.png, grid Leaflet 512).

Wajib : --bbox "W,S,E,N"   cakupan geografis (contoh: 106.3,-6.6,107.1,-5.9)
       --z "A-B" atau "10-12,14,16-17"   daftar zoom (grid site; z13 bermasalah)

Opsi  : --out   folder tujuan   (default: D:\\TILE PERSIL)
       --conc  pekerja paralel (default: 4)
       --retry percobaan ulang per tile (default: 2)
       --yes   lewati konfirmasi
       --force unduh ulang meski file sudah ada
       --help  bantuan ini
`;

function parseArgs(argv) {
  const a = { out: 'D:\\TILE PERSIL', conc: 4, retry: 2, yes: false, force: false, help: false, bbox: null, z: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    switch (k) {
      case '--bbox': a.bbox = v; i++; break;
      case '--z': a.z = v; i++; break;
      case '--out': a.out = v; i++; break;
      case '--conc': a.conc = parseInt(v, 10); i++; break;
      case '--retry': a.retry = parseInt(v, 10); i++; break;
      case '--yes': a.yes = true; break;
      case '--force': a.force = true; break;
      case '--help': case '-h': a.help = true; break;
      default: console.error('Argumen tak dikenal: ' + k + ' (pakai --help)'); process.exit(2);
    }
  }
  return a;
}

function parseBbox(s) {
  const p = String(s || '').split(',').map(Number);
  if (p.length !== 4 || p.some(n => !isFinite(n))) fail('--bbox harus "W,S,E,N" berupa angka, contoh: 106.75,-6.25,106.85,-6.15');
  const [w, s2, e, n] = p;
  if (w >= e || s2 >= n) fail('Syarat bbox: W<E dan S<N');
  if (w < -180 || e > 180 || s2 < -85.05 || n > 85.05) fail('Bbox di luar batas dunia (lon -180..180, lat -85..85)');
  return [w, s2, e, n];
}

function parseZooms(s) {
  const out = new Set();
  for (const part of String(s || '').split(',')) {
    const t = part.trim();
    if (!t) continue;
    const m = t.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) fail('--z tidak valid: "' + t + '" (contoh: 13-14 atau 10-12,14)');
    const a = +m[1], b = m[2] !== undefined ? +m[2] : a;
    if (a > b) fail('Rentang zoom terbalik: ' + t);
    if (a < 10 || b > 21) fail('Zoom di luar dukungan layer persil (10–21): ' + t);
    for (let z = a; z <= b; z++) out.add(z);
  }
  if (!out.size) fail('--z kosong');
  return [...out].sort((x, y) => x - y);
}

function fail(msg) { console.error('GAGAL: ' + msg); process.exit(2); }

function lon2cellX(lon, z) { return Math.floor(((lon + 180) / 360) * Math.pow(2, z - 1)); }
function lat2cellY(lat, z) {
  const cl = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const r = cl * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
  return Math.floor(y * Math.pow(2, z - 1));
}

function tileBbox(z, x, y) {
  const span = WORLD / Math.pow(2, z - 1);
  const minX = -HALF + x * span;
  const maxY = HALF - y * span;
  return [minX, maxY - span, minX + span, maxY];
}

function tileUrl(z, x, y) {
  const bbox = tileBbox(z, x, y).map(v => Math.round(v * 100) / 100).join(',');
  return 'https://bhumi.atrbpn.go.id/mprx/service' +
    '?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap' +
    '&FORMAT=image%2Fpng&TRANSPARENT=true' +
    '&LAYERS=bhumi_persil&STYLES=' +
    '&SRS=EPSG:3857&CRS=EPSG:3857&TILED=true' +
    '&WIDTH=512&HEIGHT=512&BBOX=' + bbox;
}

/* ── Deteksi tile kosong: hitung piksel ber-alfa (PNG palet ctype3 via PLTE/tRNS,
 *    atau RGBA ctype6). Kembalikan jumlah piksel tak-transparan; null jika bukan PNG. ── */
function opaqueCount(buf) {
  if (!buf || buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), depth = buf[24], ctype = buf[25];
  if (depth !== 8 || !(ctype === 2 || ctype === 3 || ctype === 6)) return -1;
  try {
    const idat = [];
    let plte = null, trns = null;
    for (let o = 8; o + 8 <= buf.length;) {
      const len = buf.readUInt32BE(o), t = buf.toString('ascii', o + 4, o + 8);
      if (t === 'IDAT') idat.push(buf.slice(o + 8, o + 8 + len));
      else if (t === 'PLTE') plte = buf.slice(o + 8, o + 8 + len);
      else if (t === 'tRNS') trns = buf.slice(o + 8, o + 8 + len);
      o += 12 + len;
    }
    const raw = zlib.inflateSync(Buffer.concat(idat));
    const ch = ctype === 6 ? 4 : 3;
    const stride = w * ch;
    let prevRow = Buffer.alloc(stride), p = 0, opaque = 0;
    for (let y = 0; y < h; y++) {
      const f = raw[p++]; const row = raw.slice(p, p + stride); p += stride;
      const cur = Buffer.alloc(stride);
      for (let x = 0; x < stride; x++) {
        const a = x >= ch ? cur[x - ch] : 0, b = prevRow[x], c = x >= ch ? prevRow[x - ch] : 0;
        let v = row[x];
        if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
        else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
        cur[x] = v & 255;
      }
      if (ctype === 6) { for (let x = 3; x < stride; x += 4) if (cur[x] > 0) opaque++; }
      else if (ctype === 3) { for (let x = 0; x < w; x++) { const idx = cur[x]; if (!trns || idx >= trns.length || trns[idx] > 0) opaque++; } }
      else { for (let x = 0; x < w; x++) { const o3 = x * 3; if (!(cur[o3] === 255 && cur[o3 + 1] === 255 && cur[o3 + 2] === 255)) opaque++; } }
      prevRow = cur;
    }
    if (ctype === 3 && !plte) return opaque; // palet hilang: tRNS-absen = semua opaque
    return opaque;
  } catch (e) { return -1; }
}

function isPngFile(file) {
  try {
    const st = fs.statSync(file);
    if (st.size < 500) return false;
    const fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(12);
    fs.readSync(fd, b, 0, 12, 0);
    fs.closeSync(fd);
    return b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG';
  } catch (e) { return false; }
}

function loadLines(file) {
  try { return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean); } catch (e) { return []; }
}

function fmtNum(n) { return n.toLocaleString('id-ID'); }
function fmtBytes(b) {
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
      const timer = setTimeout(() => ctl.abort(), 45000);
      const r = await fetch(url, { headers: HEADERS, signal: ctl.signal });
      clearTimeout(timer);
      const buf = Buffer.from(await r.arrayBuffer());
      if (r.status !== 200) {
        lastErr = { note: 'HTTP ' + r.status + ' ' + buf.slice(0, 60).toString('utf8').replace(/\s+/g, ' ').trim(), retry: r.status >= 500 || r.status === 429 };
        if (lastErr.retry && i < retries) { await new Promise(res => setTimeout(res, 1500 * (i + 1))); continue; }
        return { buf, err: lastErr.note };
      }
      if (buf.length < 30 || buf[0] !== 0x89) {
        lastErr = { note: 'bukan PNG: ' + buf.slice(0, 60).toString('utf8').replace(/\s+/g, ' ').trim(), retry: true };
        if (i < retries) { await new Promise(res => setTimeout(res, 1500 * (i + 1))); continue; }
        return { buf, err: lastErr.note };
      }
      return { buf, err: null };
    } catch (e) {
      lastErr = { note: 'jaringan: ' + (e && e.message ? e.message : e), retry: true };
      if (i < retries) { await new Promise(res => setTimeout(res, 1500 * (i + 1))); continue; }
      return { buf: null, err: lastErr.note };
    }
  }
  return { buf: null, err: lastErr ? lastErr.note : 'tidak diketahui' };
}

function enumerate(bbox, zooms) {
  const [w, s, e, n] = bbox;
  const cells = [];
  for (const z of zooms) {
    const x0 = Math.max(0, lon2cellX(w, z));
    const x1 = Math.min(Math.pow(2, z - 1) - 1, lon2cellX(e, z));
    const y0 = Math.max(0, lat2cellY(n, z)); // utara = y kecil
    const y1 = Math.min(Math.pow(2, z - 1) - 1, lat2cellY(s, z));
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) cells.push([z, x, y]);
  }
  return cells;
}

function walkStats(dir) {
  let count = 0, bytes = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { continue; }
    for (const ent of ents) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.isFile() && ent.name.endsWith('.png')) { count++; bytes += fs.statSync(full).size; }
    }
  }
  return { count, bytes };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }
  if (!args.bbox) { console.error('Wajib: --bbox "W,S,E,N"  (lihat --help)\n'); console.log(HELP); process.exit(2); }
  if (!args.z) { console.error('Wajib: --z "13-14"  (lihat --help)\n'); console.log(HELP); process.exit(2); }
  if (!Number.isFinite(args.conc) || args.conc < 1 || args.conc > 16) fail('--conc harus 1–16');
  if (!Number.isFinite(args.retry) || args.retry < 0 || args.retry > 6) fail('--retry harus 0–6');
  const bbox = parseBbox(args.bbox);
  const zooms = parseZooms(args.z);
  const out = path.resolve(args.out);
  fs.mkdirSync(out, { recursive: true });
  for (const f of ['kosong.txt', 'gagal.txt']) fs.mkdirSync(path.dirname(path.join(out, f)), { recursive: true });

  const kosongSet = new Set(loadLines(path.join(out, 'kosong.txt')));
  const gagalFile = path.join(out, 'gagal.txt');
  const gagalLines = loadLines(gagalFile);
  const gagalByKey = new Map();
  for (const l of gagalLines) { const k = l.split('\t')[0].trim(); if (!gagalByKey.has(k)) gagalByKey.set(k, l); }
  const gagalSet = new Set(gagalByKey.keys());
  if (gagalByKey.size !== gagalLines.length) fs.writeFileSync(gagalFile, [...gagalByKey.values()].join('\n') + '\n');
  const cells = enumerate(bbox, zooms);
  const todo = [];
  let preSkip = 0;
  for (const c of cells) {
    const key = c[0] + '/' + c[1] + '/' + c[2];
    if (!args.force && kosongSet.has(key)) { preSkip++; continue; }
    const file = path.join(out, String(c[0]), String(c[1]), c[2] + '.png');
    if (!args.force && isPngFile(file)) { preSkip++; continue; }
    todo.push(c);
  }

  console.log('Folder   : ' + out);
  console.log('Bbox     : ' + bbox.join(', ') + '   Zoom: ' + zooms.join(', '));
  console.log('Sel      : ' + fmtNum(cells.length) + '  (lewat: ' + fmtNum(preSkip) + ' sudah ada/kosong, sisa ' + fmtNum(todo.length) + ')');
  if (!todo.length) { writeManifest(out, bbox, zooms, null); console.log('Tidak ada tile untuk diunduh — semua sudah lengkap.'); return; }

  const sampleN = Math.min(10, todo.length);
  const sampleIdx = new Set();
  while (sampleIdx.size < sampleN) sampleIdx.add(Math.floor(Math.random() * todo.length));
  let kbSum = 0, msSum = 0, ok = 0, dataCount = 0;
  process.stdout.write('Sampel ' + sampleN + ' tile: ');
  for (const i of sampleIdx) {
    const [z, x, y] = todo[i];
    const t0 = Date.now();
    const { buf, err } = await fetchWithRetry(tileUrl(z, x, y), Math.min(1, args.retry));
    const ms = Date.now() - t0;
    if (!err) { ok++; kbSum += buf.length / 1024; if ((opaqueCount(buf) || 0) > 0) dataCount++; }
    msSum += ms;
  }
  const avgKB = ok ? kbSum / ok : 0;
  const avgMs = msSum / sampleN;
  const estBytes = avgKB * 1024 * todo.length;
  console.log(' rata-rata ' + avgKB.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' KB, ' + Math.round(avgMs) + ' ms/tile, berisi ' + dataCount + '/' + ok);
  console.log('Perkiraan: ' + fmtNum(todo.length) + ' tile ± ' + fmtBytes(estBytes) + ' • ± ' + fmtDur((avgMs * todo.length) / args.conc) + ' dengan ' + args.conc + ' pekerja');
  console.log('CATATAN: zoom site z13 sering 500 dari server (berlaku juga untuk site live); tile gagal dicatat di gagal.txt.');
  if (estBytes > 5 * 1073741824) console.log('PERINGATAN: perkiraan > 5 GB — pastikan ruang disk cukup.');

  if (!args.yes) {
    const y = await askYes();
    if (!y) { console.log('Dibatalkan.'); process.exit(1); }
  }

  const kosongArr = [], gagalArr = [];
  let clearKosong = new Set(), clearGagal = new Set();
  const t0 = Date.now();
  let done = 0, written = 0, empty = 0, failed = 0, bytes = 0;
  let nextReport = 50;
  let cursor = 0;

  function pruneList(file, keys) {
    if (!keys.size) return;
    try {
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
      const kept = lines.filter(l => !keys.has(l.split('\t')[0].trim()));
      fs.writeFileSync(file, kept.length ? kept.join('\n') + '\n' : '');
    } catch (e) { /* abaikan */ }
  }
  function flush() {
    if (kosongArr.length) { fs.appendFileSync(path.join(out, 'kosong.txt'), kosongArr.join('\n') + '\n'); kosongArr.length = 0; }
    if (gagalArr.length) { fs.appendFileSync(path.join(out, 'gagal.txt'), gagalArr.join('\n') + '\n'); gagalArr.length = 0; }
    if (clearKosong.size) { pruneList(path.join(out, 'kosong.txt'), clearKosong); clearKosong = new Set(); }
    if (clearGagal.size) { pruneList(path.join(out, 'gagal.txt'), clearGagal); clearGagal = new Set(); }
  }
  const flushTimer = setInterval(flush, 5000);

  function recordGagal(key, note) {
    if (gagalSet.has(key)) return;
    gagalSet.add(key);
    gagalArr.push(key + '\t' + String(note || 'gagal').replace(/\t/g, ' ').slice(0, 200));
  }

  async function handle(c) {
    const [z, x, y] = c;
    const key = z + '/' + x + '/' + y;
    const { buf, err } = await fetchWithRetry(tileUrl(z, x, y), args.retry);
    if (err || !buf) {
      failed++;
      recordGagal(key, err);
    } else {
      const oc = opaqueCount(buf);
      if (oc === 0) { empty++; kosongArr.push(key); kosongSet.add(key); }
      else {
        const file = path.join(out, String(z), String(x), y + '.png');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, buf);
        written++; bytes += buf.length;
        if (kosongSet.has(key)) { clearKosong.add(key); kosongSet.delete(key); }
      }
      if (gagalSet.has(key)) { clearGagal.add(key); gagalSet.delete(key); }
    }
    done++;
    if (done >= nextReport) {
      nextReport += 50;
      const el = Date.now() - t0;
      const per = el / done;
      console.log('  ' + fmtNum(done) + '/' + fmtNum(todo.length) + ' • tulis ' + fmtNum(written) + ' • kosong ' + fmtNum(empty) + ' • gagal ' + fmtNum(failed) +
        ' • ' + fmtBytes(bytes) + ' • ETA ' + fmtDur(per * (todo.length - done)));
    }
  }

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= todo.length) return;
      try { await handle(todo[i]); } catch (e) {
        failed++;
        const [z, x, y] = todo[i];
        recordGagal(z + '/' + x + '/' + y, 'kesalahan internal: ' + (e && e.message ? e.message : e));
        done++;
      }
    }
  }

  const onSigint = () => { flush(); clearInterval(flushTimer); console.log('\nDihentikan — kemajuan tersimpan. Jalankan ulang perintah sama untuk melanjutkan.'); process.exit(130); };
  process.on('SIGINT', onSigint);

  console.log('Mulai unduh…');
  await Promise.all(Array.from({ length: args.conc }, () => worker()));
  clearInterval(flushTimer);
  flush();
  process.removeListener('SIGINT', onSigint);

  const el = Date.now() - t0;
  console.log('Selesai dalam ' + fmtDur(el) + ': tulis ' + fmtNum(written) + ' tile (' + fmtBytes(bytes) + '), kosong ' + fmtNum(empty) + ', gagal ' + fmtNum(failed) + '.');
  if (failed) console.log('Tile gagal tercatat di ' + path.join(out, 'gagal.txt') + ' — jalankan ulang perintah sama untuk mencoba lagi.');
  writeManifest(out, bbox, zooms, { run: { tile: todo.length, tulis: written, kosong: empty, gagal: failed, bytes, detik: Math.round(el / 1000) } });
}

function writeManifest(out, bbox, zooms, runInfo) {
  const file = path.join(out, 'manifest.json');
  let m = {};
  try { m = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { m = {}; }
  m.sumber = 'https://bhumi.atrbpn.go.id/mprx/service (LAYERS=bhumi_persil, WMS 1.3, PNG 512x512, EPSG:3857)';
  m.grid = 'Leaflet tileSize 512: 2^(z-1) sel per zoom, span = world/2^(z-1) — sama dengan bhumiPersilNasionalTileUrl() di map-core.js (persis slippy-256 pada zoom z-1)';
  m.formatFile = '{z}/{x}/{y}.png (tile berisi); z/x/y ada di kosong.txt berarti tidak ada isi';
  m.lisensi = 'Data: ATR/BPN BHUMI — cadangan lokal pribadi, bukan untuk didistribusikan ulang';
  m.dibuat = m.dibuat || new Date().toISOString();
  m.terakhir = new Date().toISOString();
  const zset = new Set([...(m.zooms || []), ...zooms]);
  m.zooms = [...zset].sort((a, b) => a - b);
  if (Array.isArray(m.bbox)) {
    m.bbox = [Math.min(m.bbox[0], bbox[0]), Math.min(m.bbox[1], bbox[1]), Math.max(m.bbox[2], bbox[2]), Math.max(m.bbox[3], bbox[3])];
  } else m.bbox = bbox;
  if (runInfo) {
    m.riwayat = m.riwayat || [];
    m.riwayat.push(Object.assign({ waktu: new Date().toISOString(), bbox, zooms }, runInfo.run));
  }
  const st = walkStats(out);
  m.jumlahTilePng = st.count;
  m.totalBytes = st.bytes;
  try { fs.writeFileSync(file, JSON.stringify(m, null, 2)); } catch (e) { console.error('manifest gagal ditulis: ' + e.message); }
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
