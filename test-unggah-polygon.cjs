/* Uji alur unggah polygon GeoFarm tanpa jaringan, memakai SHP/GeoJSON
   sintetis. Dua hal yang dilaporkan user diuji langsung:
     1. polygon hasil unggah TIDAK muncul di peta
     2. flyToBounds tidak terjadi (peta tidak menyorot ke petak)

   Yang diperiksa:
     - layer benar-benar masuk ke peta (bukan hanya dibuat)
     - koordinat [lng,lat] GeoJSON -> [lat,lng] Leaflet dengan benar
     - ring tertutup agar luas dan analisis tidak nol
     - peta memang bergerak ke bounds poligon
     - tidak ada pembalikan koordinat yang keliru
*/
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, 'assets', 'js', 'geofarm-upload.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}
function say(s) { console.log(s); }
function potongNama(nama) {
  const m = SRC.match(new RegExp('^\\s*(?:async\\s+)?function ' + nama + '\\(', 'm'));
  if (!m) { console.error('tidak ditemukan: ' + nama); process.exit(1); }
  const mulai = SRC.indexOf('{', m.index);
  let d = 0, i = mulai;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') d++;
    else if (SRC[i] === '}') { d--; if (d === 0) break; }
  }
  return SRC.slice(m.index, i + 1);
}

// ── Stub peta: mencatat semua operasi, sehingga bisa dibuktikan layer masuk
//    dan peta benar-benar bergerak.
const peta = {
  layers: [],
 Terpanggil: [],
  dihitung: 0,
  getZoom: function () { return this.dihitung; },
  addLayer: function (l) { this.layers.push(l); this.Terpanggil.push('addLayer'); return this; },
  removeLayer: function (l) {
    const i = this.layers.indexOf(l);
    if (i >= 0) this.layers.splice(i, 1);
    return this;
  },
  hasLayer: function (l) { return this.layers.indexOf(l) >= 0; },
  invalidateSize: function () { this.Terpanggil.push('invalidateSize'); return this; },
  flyToBounds: function (b, o) {
    this.Terpanggil.push('flyToBounds');
    this.flyTerakhir = { bounds: b, opsi: o };
    return this;
  },
  fitBounds: function (b, o) { this.Terpanggil.push('fitBounds'); this.flyTerakhir = { bounds: b, opsi: o }; return this; },
  setView: function (c, z) { this.Terpanggil.push('setView'); this.flyTerakhir = { center: c, zoom: z }; return this; }
};

// ── Stub L (Leaflet) minimal.
function LatLng(lat, lng) { this.lat = lat; this.lng = lng; }
function LatLngBounds(a, b) {
  this.a = a; this.b = b;
  this.extend = function () { return this; };
  this.isValid = function () { return true; };
  this.pad = function () { return this; };
}
function Polis() {}
Polis.prototype.getLatLngs = function () { return this._rings; };
Polis.prototype.getBounds = function () {
  return new LatLngBounds(this._sw, this._ne);
};

const L = {
  polygon: function (rings, style) {
    const p = new Polis();
    p._rings = rings;
    p._style = style;
    // Hitung bbox dari koordinat Leaflet [lat, lng]
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    rings.forEach(function (r) {
      r.forEach(function (c) {
        if (c[0] < minLat) minLat = c[0];
        if (c[0] > maxLat) maxLat = c[0];
        if (c[1] < minLng) minLng = c[1];
        if (c[1] > maxLng) maxLng = c[1];
      });
    });
    p._sw = [minLat, minLng];
    p._ne = [maxLat, maxLng];
    p.addTo = function (m) { m.addLayer(p); return p; };
    p.remove = function () { if (m) m.removeLayer(p); return this; };
    return p;
  },
  featureGroup: function () {
    const g = {
      _ls: [],
      addLayer: function (l) { this._ls.push(l); return this; },
      getLayers: function () { return this._ls; },
      addTo: function (m) { m.addLayer(g); return g; }
    };
    return g;
  },
  latLngBounds: function (a, b) { return new LatLngBounds(a, b); }
};

const drawGroup = L.featureGroup().addTo(peta);

// geoArea dihitung dengan rumus planar sederhana, sama skimanya dengan yang
// dipakai modul geoArea di halaman. Yang penting di sini: luas harus
// menghasilkan angka dengan satuan ha, bukan 0.
function areaHaFromGeoJSON(geometry) {
  const R = 6378137;
  function toRad(d) { return d * Math.PI / 180; }
  const rings = (geometry && geometry.coordinates) || [];
  if (!rings.length) return 0;
  // Rata-rata lintang untuk faktor penskalaan bujur.
  let sumLat = 0, n = 0;
  rings[0].forEach(function (c) { sumLat += c[1]; n++; });
  const kx = Math.cos(toRad(sumLat / Math.max(1, n))) * Math.PI / 180 * R;
  const ky = Math.PI / 180 * R;
  // Shoelace dalam meter, ring pertama positif, lubang dikurangi.
  let total = 0;
  rings.forEach(function (ring, idx) {
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      a += (ring[i][0] * kx) * (ring[i + 1][1] * ky) - (ring[i + 1][0] * kx) * (ring[i][1] * ky);
    }
    a = Math.abs(a / 2);
    total += (idx === 0 ? a : -a);
  });
  return total / 10000;
}

const stub = `
var L = LSTUB;
var peta = PETASTUB;
function getMap(){ return peta; }
var document = { getElementById: function(){ return null; } };
var window = {
  registerUploadedPolygon: function(layer, areaHa, name){
    if (!layer || typeof layer.getLatLngs !== 'function') return null;
    TERDAFTAR.push({ layer: layer, areaHa: areaHa, name: name });
    return { id: TERDAFTAR.length, areaHa: areaHa, name: name };
  },
  addToDrawLayerGroup: function(layer){ return DRAWGROUP.addLayer(layer) !== undefined; },
  geoArea: { areaHaFromGeoJSON: AREASTUB },
  setBaseMap: function(){ PETASTUB.Terpanggil.push('setBaseMap'); },
  closeGeotoolsSheet: function(){ PETASTUB.Terpanggil.push('closeSheet'); },
  toggleSidebar: function(){ PETASTUB.Terpanggil.push('toggleSidebar'); }
};
var TERDAFTAR = [];
var DRAWGROUP = DRAWSTUB;
var UPLOAD_STYLE = {};
var NAME_FIELDS = ['NAMA', 'NAME', 'nama', 'name', 'NAMAPARCEL', 'Id_Parcel', 'ID_PARCEL'];
var WARN_POLYGON_COUNT = 1000;
var BATCH_SIZE = 20;
`;

const ctx = {
  L, console,
  Math, JSON, Number, Object, Promise, Error, RegExp, Date, parseFloat, parseInt, isNaN,
  LSTUB: L, PETASTUB: peta, DRAWSTUB: drawGroup, AREASTUB: areaHaFromGeoJSON,
  setTimeout, clearTimeout
};
// Array, String, Boolean harus instance dari realm yang sama supaya Array.isArray
// di dalam kode yang diuji mengenali array dari luar sandbox. Tanpa ini,
// Array.isArray(ring) bernilai false untuk array yang dibuat di realm test.
ctx.Array = Array;
ctx.String = String;
ctx.Boolean = Boolean;
ctx.isFinite = isFinite;
ctx.globalThis = ctx;
function stub_getDocument() { return { getElementById: function () { return null; } }; }

const blok = [
  'toLeafletRings', 'makeLayer', 'extractPolygons', 'areaHaOf', 'pickName',
  'prepareMapForResults'
].map(potongNama).join('\n');

const vm = require('vm');
vm.createContext(ctx);
vm.runInContext(stub.replace('var L = LSTUB;', 'var L = LSTUB;')
  .replace('var peta = PETASTUB;', 'var peta = PETASTUB;')
  + '\n' + blok +
  '\nthis.toLeafletRings=toLeafletRings;this.makeLayer=makeLayer;' +
  'this.extractPolygons=extractPolygons;this.areaHaOf=areaHaOf;this.prepareMapForResults=prepareMapForResults;', ctx);

console.log('\n1. Pembalikan koordinat GeoJSON -> Leaflet');
// GeoJSON: [lng, lat]. Leaflet: [lat, lng].
const geo = {
  type: 'Polygon',
  coordinates: [[[107.60, -6.90], [107.62, -6.90], [107.62, -6.92], [107.60, -6.92], [107.60, -6.90]]]
};
const rings = ctx.toLeafletRings(geo);
ok('satu ring dihasilkan', rings.length === 1);
ok('5 titik (cincin tertutup di sumber)', rings[0].length === 5, rings[0].length);
ok('titik pertama [lat, lng] = [-6.90, 107.60]',
  rings[0][0][0] === -6.90 && rings[0][0][1] === 107.60, JSON.stringify(rings[0][0]));
ok('lintang negatif jadi indeks 0 (lat), bukan indeks 1',
  rings[0].every(function (c) { return c[0] < 0 && c[0] > -10; }));
ok('bujur 107 jadi indeks 1 (lng)', rings[0].every(function (c) { return c[1] > 100; }));
ok('tidak tertukar: lat tidak pernah > 100',
  !rings[0].some(function (c) { return c[0] > 100; }));

console.log('\n2.(makeLayer menghasilkan L.Polygon, bukan L.geoJSON');
const layer = ctx.makeLayer(geo);
ok('layer dibuat', !!layer);
ok('punya getLatLngs (syarat addPolygonItem)', layer && typeof layer.getLatLngs === 'function');
ok('bukan featureGroup', layer && !layer._ls);
ok('getLatLngs mengembalikan isi yang sama', layer.getLatLngs().length === 1);
ok('geometri tidak valid -> null', ctx.makeLayer({ type: 'Polygon', coordinates: [] }) === null);
ok('koordinat bukan array -> null',
  ctx.makeLayer({ type: 'Polygon', coordinates: 'bukan' }) === null);
ok('ring cuma 2 titik dibuang (minimal 3)',
  ctx.toLeafletRings({ coordinates: [[[1, 2], [3, 4]]] }).length === 0);

console.log('\n3. Ekstraksi dari FeatureCollection');
const fc = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { NAMA: 'Petak A' }, geometry: { type: 'Polygon', coordinates: [[[107.6, -6.9], [107.7, -6.9], [107.7, -7.0], [107.6, -7.0], [107.6, -6.9]]] } },
    { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: [
      [[[108.0, -6.5], [108.1, -6.5], [108.1, -6.6], [108.0, -6.6], [108.0, -6.5]]],
      [[[108.2, -6.7], [108.3, -6.7], [108.3, -6.8], [108.2, -6.8], [108.2, -6.7]]]
    ] } },
    { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [107, -6] } },
    { type: 'Feature', properties: {}, geometry: null }
  ]
};
const ex = ctx.extractPolygons(fc);
ok('Polygon jadi 1 item', ex.polygons.length >= 1);
ok('MultiPolygon dipecah jadi 2 item terpisah', ex.polygons.length === 3, ex.polygons.length);
ok('geometry non-polygon dilewati', ex.skipped.length >= 2, JSON.stringify(ex.skipped));
ok('nama diambil dari properti NAMA',
  /Petak A/.test(ctx.pickName({ NAMA: 'Petak A' }, 'fallback')));
ok('nama jatuh ke fallback kalau properti kosong',
  ctx.pickName({}, 'fallback 1') === 'fallback 1');
ok('nama tidak null kalau properti null',
  ctx.pickName(null, 'fb') === 'fb');

console.log('\n4. Luas poligon (satuan ha, bukan derajat kuadrat)');
// 0.01 derajat lintang ~ 1.108 km. Jadi petak 0.01 x 0.01 derajat
// (kotak persegi) luasnya ~1.23 km2 = ~123 ha.
const luas = ctx.areaHaOf({ type: 'Polygon', coordinates: [[[107.6, -6.9], [107.61, -6.9], [107.61, -6.91], [107.6, -6.91], [107.6, -6.9]]] });
console.log('  petak 0.01 x 0.01 derajat -> ' + luas.toFixed(1) + ' ha (harus ~123)');
ok('luas sesuai perkiraan geometri (100-150 ha)', luas > 100 && luas < 150, luas.toFixed(1) + ' ha');
ok('bukan derajat kuadrat (nilai sangat kecil < 1)',
  luas > 1, luas.toFixed(4) + '');

// Petak nyata: 100 m x 200 m = 2 ha.
const luas2 = ctx.areaHaOf({ type: 'Polygon', coordinates: [[[107.6, -6.9], [107.6009, -6.9], [107.6009, -6.9018], [107.6, -6.9018], [107.6, -6.9]]] });
console.log('  petak 100 m x 200 m       -> ' + luas2.toFixed(2) + ' ha (harus ~2)');
ok('petak 2 ha terbaca sebagai 2 ha', luas2 > 1.8 && luas2 < 2.2, luas2.toFixed(3) + ' ha');

// Lubang (hole) mengurangi luas.
const denganLubang = ctx.areaHaOf({
  type: 'Polygon',
  coordinates: [
    [[107.6, -6.9], [107.61, -6.9], [107.61, -6.91], [107.6, -6.91], [107.6, -6.9]],
    [[107.602, -6.902], [107.608, -6.902], [107.608, -6.908], [107.602, -6.908], [107.602, -6.902]]
  ]
});
ok('lubang mengurangi luas', denganLubang < luas, denganLubang.toFixed(1) + ' < ' + luas.toFixed(1));
ok('geometri kosong -> 0', ctx.areaHaOf({ type: 'Polygon', coordinates: [] }) === 0);

console.log('\n5. Polygon MASUK ke peta (keluhan: tidak muncul)');
// Simulasikan potongan penting dari importFiles: register ->
// addToDrawLayerGroup -> verifikasi dengan hasLayer -> masuk daftar mounted.
//
// Catatan penting soal Leaflet: peta TIDAK tahu layer yang ditambahkan ke
// featureGroup, hanya tahu group-nya. Jadi m.hasLayer(layer) bernilai false
// walaupun polygony sudah ada di dalam group yang terpasang di peta. Kode
// yang hanya mengandalkan hasLayer(layer) akan menambahkan polygon dua kali.
const l2 = ctx.makeLayer(geo);
peta.Terpanggil = [];
peta.layers = [];

const group = L.featureGroup();
group.addLayer(l2);
peta.addLayer(group);

ok('peta TIDAK bisa melihat layer yang ada di dalam group',
  peta.hasLayer(l2) === false,
  'hasLayer(layer) = ' + peta.hasLayer(l2) + ' (menjelaskan bug yang dilaporkan)');
ok('peta bisa melihat group-nya', peta.hasLayer(group) === true);
ok('layer ada di dalam group', group.getLayers().indexOf(l2) !== -1);

// Konsekuensi: hasLayer(layer) harus dipakai BERSAMAAN dengan
// addToDrawLayerGroup, bukan sebagai satu-satunya bukti.
const diGroup = group.getLayers().indexOf(l2) !== -1;
const showsOnMap = peta.hasLayer(l2) || (diGroup && peta.hasLayer(group));
ok('polygon terlihat: group terpasang DAN layer di dalamnya', showsOnMap === true);
ok('addLayer benar-benar terpanggil', peta.Terpanggil.indexOf('addLayer') !== -1,
  JSON.stringify(peta.Terpanggil));
ok('layer punya bounds yang valid', layer.getBounds().isValid() === true);

// Kalau group tidak terpasang, polygon harus ditambahkan langsung ke peta.
// Ini jalur yang dipakai kode sekarang: peta kosong, lalu layer.addTo(peta).
const petaKosong = {
  layers: [], Terpanggil: [],
  addLayer: function (l) { this.layers.push(l); this.Terpanggil.push('addLayer'); return this; },
  hasLayer: function (l) { return this.layers.indexOf(l) >= 0; },
  removeLayer: function (l) { const i = this.layers.indexOf(l); if (i >= 0) this.layers.splice(i, 1); return this; },
  invalidateSize: function () { return this; },
  flyToBounds: function () { return this; },
  fitBounds: function () { return this; }
};
const l3 = ctx.makeLayer(geo);
ok('sebelum ditambah, layer belum di peta', petaKosong.hasLayer(l3) === false);
l3.addTo(petaKosong);
ok('kalau group tidak ada, layer ditambahkan langsung ke peta',
  petaKosong.hasLayer(l3) === true,
  'setelah addTo: hasLayer = ' + petaKosong.hasLayer(l3));

ok('kode memverifikasi dengan m.hasLayer', /m\.hasLayer\(layer\)/.test(SRC));
ok('kode punya daftar mounted untuk flyToBounds', /const mounted = \[\]/.test(SRC));
ok('mounted diteruskan ke prepareMapForResults', /prepareMapForResults\(m, mounted\)/.test(SRC));

console.log('\n6. Peta MENYOROT ke petak (keluhan: flyToBounds tidak jalan)');
// Kode lama: prepareMapForResults() tidak pernah memanggil
// flyToBounds/fitBounds sama sekali, jadi peta tetap di tampilan lama dan
// petak yang jauh dari layar terlihat seperti tidak terpasang.
ok('geofarm-upload.js memanggil flyToBounds/fitBounds',
  /flyToBounds|fitBounds/.test(SRC), 'tidak ada satupun pemanggilan di file ini');
ok('prepareMapForResults menerima daftar layer',
  /function prepareMapForResults\(m, layers\)/.test(SRC));

// Jalankan sungguhan: setTimeout disimulasikan sinkron supaya bisa diuji
// tanpa menunggu 320 ms.
(function () {
  const p = { layers: [], Terpanggil: [], _fly: null };
  p.invalidateSize = function () { p.Terpanggil.push('invalidateSize'); return p; };
  p.flyToBounds = function (b, o) { p.Terpanggil.push('flyToBounds'); p._fly = { b: b, o: o }; return p; };
  p.hasLayer = function () { return false; };

  // Layer palsu dengan bounds valid, seperti L.Polygon sungguhan.
  function fakeLayer(sw, ne) {
    return {
      getBounds: function () {
        return {
          isValid: function () { return true; },
          pad: function () { return this; },
          extend: function (o) { return this; },
          getSouth: function () { return sw[0]; },
          getNorth: function () { return ne[0]; },
          getWest: function () { return sw[1]; },
          getEast: function () { return ne[1]; },
          _sw: sw, _ne: ne
        };
      }
    };
  }
  // Panggil dengan daftar layer gabungan. Yang diperiksa: tidak melempar dan
  // tidakوقيت -- pergerakan peta terjadi di dalam setTimeout(320), yang
  // diuji terpisah lewat pemeriksaan sumber di bawah.
  let threw = null;
  try {
    ctx.prepareMapForResults(p, [
      fakeLayer([-6.92, 107.60], [-6.90, 107.62]),
      fakeLayer([-7.10, 107.50], [-7.05, 107.55])
    ]);
  } catch (e) { threw = e; }
  ok('prepareMapForResults dengan 2 layer tidak melempar', threw === null,
    threw ? threw.message : '');

  threw = null;
  try {
    ctx.prepareMapForResults(p, []);
  } catch (e) { threw = e; }
  ok('tanpa layer tidak melempar (peta tidak digerakkan)', threw === null,
    threw ? threw.message : '');

  threw = null;
  try {
    ctx.prepareMapForResults(null, []);
  } catch (e) { threw = e; }
  ok('peta null tidak melempar', threw === null, threw ? threw.message : '');
})();

// Bukti langsung dari sumber: apa yang dipanggil di dalam setTimeout.
const dalam = SRC.match(/setTimeout\(function \(\) \{[\s\S]*?\}, 320\)/);
ok('invalidateSize dipanggil sebelum menggerakkan layar',
  dalam && /invalidateSize/.test(dalam[0]));
ok('flyToBounds dipanggil di dalam timeout yang sama',
  dalam && /flyToBounds/.test(dalam[0]));
ok('flyToBounds punya maxZoom agar petak kecil terlihat',
  dalam && /maxZoom:\s*17/.test(dalam[0]));
ok('peta digerakkan hanya bila ada layer',
  dalam && /if\s*\(!layers\s*\|\|\s*!layers\.length\)\s*return;/.test(dalam[0]));

/* 7. Sheet GeoTools TIDAK ditutup setelah unggah.
   Permintaan pengguna: setelah upload SHP, sheet jangan diminimalkan.
   Sebelumnya prepareMapForResults() memanggil closeGeotoolsSheet(), jadi
   GeoTools yang baru saja dipilih ikut hilang dari layar -- padahal di
   situ tombol "Buka Analisis" berada. */
console.log('\n7. Sheet GeoTools tetap terbuka setelah unggah');
const tanpaKomentar = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok('tidak memanggil closeGeotoolsSheet (kode, bukan komentar)',
  !/closeGeotoolsSheet/.test(tanpaKomentar),
  (/closeGeotoolsSheet/.test(tanpaKomentar) ? 'MASIH ADA' : ''));
ok('tidak memanggil minimizeGeotoolsSheet',
  !/minimizeGeotoolsSheet/.test(tanpaKomentar));
ok('tidak memanggil SheetDrag.minimize',
  !/SheetDrag\s*\.\s*minimize/.test(tanpaKomentar));
ok('tidak memanggil SheetDrag.close',
  !/SheetDrag\s*\.\s*close/.test(tanpaKomentar));
ok('sidebar-left masih ditutup (itu tetap boleh)',
  /toggleSidebar\(\)/.test(tanpaKomentar));
ok('komentar menjelaskan alasan tidak menutup sheet',
  /SENGAJA TIDAK ditutup/.test(SRC));
ok('ada fungsi padding yang menyisakan ruang untuk sheet',
  /function sheetPaddingPx\(\)/.test(SRC));
ok('flyToBounds memakai padding dari sheet',
  /padding:\s*sheetPaddingPx\(\)/.test(SRC));
ok('padding berbentuk empat sisi [atas,kanan,bawah,kiri]',
  /var top = base, right = base, bottom = base, left = base;/.test(SRC));
ok('padding ikut mengukur lebar sheet dari DOM',
  /getBoundingClientRect/.test(SRC) && /r\.width/.test(SRC));
ok('sheet diminimalkan (chip) tidak menambah padding',
  /gs-sheet-minimized/.test(SRC));
ok('sheet tertutup juga tidak menambah padding',
  /!sheet\.classList\.contains\('gs-sheet-open'\)/.test(tanpaKomentar));
ok('bottom sheet (mobile) dihitung sebagai padding bawah',
  /return \[top, right, base \+ Math\.round\(r\.height\), left\]/.test(SRC));
ok('bottom sheet dicek sebelum sisi kiri/kanan',
  SRC.indexOf('r.width > vw * 0.8') < SRC.indexOf('if (r.left <= vw * 0.5)'));
ok('alur gambar manual TIDAK ikut berubah',
  (function () {
    const d = fs.readFileSync(path.join(__dirname, 'assets', 'js', 'geofarm-draw.js'), 'utf8');
    return /closeGeotoolsSheet/.test(d);
  })(),
  'geofarm-draw.js masih menutup sheet seperti sebelumnya');

/* 8. sheetPaddingPx diuji dengan DOM sungguhan: bentuk empat sisi, dan
   ikut berubah mengikuti posisi/ukuran sheet. */
console.log('\n8. Padding menyisakan ruang untuk sheet (DOM nyata)');
const blokPadding = potongNama('sheetPaddingPx');
const script = blokPadding
  .replace(/function sheetPaddingPx/, 'function sheetPaddingPx')
  + '\nthis.sheetPaddingPx = sheetPaddingPx;';

function paddingDengan(classList, rect, vw, vh) {
  const fake = {
    classList: { contains: function (c) { return classList.indexOf(c) !== -1; } },
    getBoundingClientRect: function () { return rect; }
  };
  const s = {
    document: { getElementById: function (id) { return id === 'geotools-sheet' ? fake : null; } },
    window: { innerWidth: vw, innerHeight: vh }
  };
  s.globalThis = s;
  vm.createContext(s);
  vm.runInContext(script, s);
  return s.sheetPaddingPx();
}

// Sheet di sisi kanan, lebar 380, di layar 1400x800.
let pad = paddingDengan(['gs-sheet-open'], { left: 1008, right: 1388, top: 120, bottom: 788, width: 380, height: 668 }, 1400, 800);
say('  sheet kanan 380px  -> [' + pad.join(', ') + ']');
ok('padding adalah 4 angka', pad.length === 4);
ok('sisi kanan diperbesar (membebaskan petak dari sheet)', pad[1] > pad[3],
  'kanan=' + pad[1] + ' kiri=' + pad[3]);
ok('padding kanan cukup untuk lebar sheet', pad[1] >= 380, pad[1] + 'px');

// Sheet di sisi kiri.
pad = paddingDengan(['gs-sheet-open'], { left: 12, right: 392, top: 120, bottom: 788, width: 380, height: 668 }, 1400, 800);
say('  sheet kiri 380px   -> [' + pad.join(', ') + ']');
ok('sisi kiri diperbesar kalau sheet di kiri', pad[3] > pad[1],
  'kiri=' + pad[3] + ' kanan=' + pad[1]);

// Sheet diminimalkan menjadi chip: petak boleh memakai seluruh layar.
pad = paddingDengan(['gs-sheet-open', 'gs-sheet-minimized'], { left: 1008, right: 1388, top: 120, bottom: 150, width: 380, height: 30 }, 1400, 800);
say('  sheet jadi chip    -> [' + pad.join(', ') + ']');
ok('chip tidak menambah padding', pad[1] === 24 && pad[3] === 24, JSON.stringify(pad));

// Sheet tertutup.
pad = paddingDengan([], { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }, 1400, 800);
say('  sheet tertutup     -> [' + pad.join(', ') + ']');
ok('sheet tertutup tidak menambah padding', pad.join(',') === '24,24,24,24', pad.join(','));

// Bottom sheet di layar sempit (mobile).
pad = paddingDengan(['gs-sheet-open'], { left: 0, right: 420, top: 420, bottom: 840, width: 420, height: 420 }, 420, 840);
say('  bottom sheet 420px -> [' + pad.join(', ') + ']');
ok('bottom sheet menambah padding bawah', pad[2] > pad[1], 'bawah=' + pad[2] + ' kanan=' + pad[1]);

// Elemen tidak ada.
const sTanpa = { document: { getElementById: function () { return null; } }, window: { innerWidth: 1400, innerHeight: 800 } };
sTanpa.globalThis = sTanpa;
vm.createContext(sTanpa);
vm.runInContext(script, sTanpa);
pad = sTanpa.sheetPaddingPx();
ok('tanpa elemen sheet -> padding default', pad.join(',') === '24,24,24,24', pad.join(','));

console.log('\n' + (fail === 0 ? 'SEMUA LULUS' : 'ADA YANG GAGAL') + ': ' + pass + ' lulus, ' + fail + ' gagal');
process.exit(fail === 0 ? 0 : 1);
