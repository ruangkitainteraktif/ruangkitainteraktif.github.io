/* Uji panel Cek Lokasi pada sheet "Gambar & Ukur".
 *
 * Dua perbaikan yang diuji di sini dan tidak bisa ditangkap pemeriksaan
 * syntax biasa:
 *   1. Menekan "Cek" harus memasang pin di peta (sebelumnya hanya tombol
 *      Pin yang bisa, lewat alat gambar).
 *   2. Tombol "Reset" harus membersihkan pin, input, dan panel hasil --
 *      termasuk saat respons jaringan masih dalam perjalanan, di mana
 *      tombol Cek sebelumnya bisa tertinggal nonaktif selamanya.
 *   3. Alur Pin menyerahkan marker alat gambar ke modul ini, supaya tidak
 *      ada dua pin di titik yang sama.
 *   4. Lingkaran yang digambar lewat tool gambar tidak boleh dianggap pin.
 *      Regresi ini berbahaya: lingkaran itu justru ikut terhapus.
 *
 * Modul dimuat sungguhan di sandbox vm dengan stub Leaflet/DOM, supaya
 * perilakunya teruji apa adanya, bukan versi yang ditulis ulang.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}

function buatElemen(id) {
  const e = {
    id: id,
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    style: {},
    dataset: {},
    _h: {},
    addEventListener: function (t, fn) { (this._h[t] = this._h[t] || []).push(fn); },
    dispatch: function (t) { (this._h[t] || []).forEach(function (fn) { fn({ type: t }); }); }
  };
  return e;
}

const idDipakai = [
  'dmCekLokasi', 'geolokasiInput', 'geolokasiCek', 'geolokasiPin',
  'geolokasiReset', 'geolokasiSalin', 'geolokasiHasil', 'geolokasiStatus'
];
const elemen = {};
idDipakai.forEach(function (id) { elemen[id] = buatElemen(id); });

/* ── stub Leaflet ────────────────────────────────────────────────────── */

const grupDibuat = [];
let berapaKaliFly = 0;
let titikDiLayar = true;

function Marker(pos) { this._pos = pos; this._popup = null; }
Marker.prototype.bindPopup = function (html) { this._popup = html; return this; };
Marker.prototype.getPopup = function () { return this._popup; };
Marker.prototype.setLatLng = function (p) { this._pos = p; return this; };
Marker.prototype.getLatLng = function () { return { lat: this._pos[0], lng: this._pos[1] }; };
Marker.prototype.addTo = function (g) { g.addLayer(this); return this; };
Marker.prototype.remove = function () { return this; };

function LayerGroup() { this._layers = []; grupDibuat.push(this); }
LayerGroup.prototype.addTo = function () { return this; };
LayerGroup.prototype.addLayer = function (l) { if (this._layers.indexOf(l) < 0) this._layers.push(l); return this; };
LayerGroup.prototype.removeLayer = function (l) { const i = this._layers.indexOf(l); if (i >= 0) this._layers.splice(i, 1); return this; };
LayerGroup.prototype.clearLayers = function () { this._layers = []; return this; };
LayerGroup.prototype.getLayers = function () { return this._layers.slice(); };

function jumlahPin() {
  return grupDibuat.reduce(function (n, g) { return n + g._layers.length; }, 0);
}

const petaHandler = {};
const map = {
  on: function (ev, fn) { (petaHandler[ev] = petaHandler[ev] || []).push(fn); },
  getZoom: function () { return 12; },
  getBounds: function () { return { contains: function () { return titikDiLayar; } }; },
  flyTo: function () { berapaKaliFly++; },
  setView: function () { berapaKaliFly++; },
  removeLayer: function () {}
};

const L = {
  Marker: Marker,
  marker: function (pos) { return new Marker(pos); },
  layerGroup: function () { return new LayerGroup(); }
};

/* ── sandbox ─────────────────────────────────────────────────────────── */

const drawGroupDipakai = [];
const panggilanRemoveDrawLayer = [];

const sandbox = {
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  Promise: Promise,
  Math: Math,
  JSON: JSON,
  Date: Date,
  Error: Error,
  String: String,
  Number: Number,
  Array: Array,
  Object: Object,
  navigator: {},
  /* Fetch sengaja tidak pernah selesai: panel harus tetap bisa di-reset
     di tengah permintaan yang menggantung. */
  fetch: function () { return new Promise(function () {}); },
  document: {
    readyState: 'complete',
    body: { appendChild: function () {}, removeChild: function () {} },
    getElementById: function (id) { return elemen[id] || null; },
    createElement: function () { return buatElemen('tmp'); },
    addEventListener: function () {},
    querySelector: function () { return null; }
  }
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.L = L;
sandbox.map = map;
sandbox.removeDrawLayer = function (layer) {
  panggilanRemoveDrawLayer.push(layer);
  const i = drawGroupDipakai.indexOf(layer);
  if (i >= 0) drawGroupDipakai.splice(i, 1);
  return true;
};
sandbox.startDraw = function () {};

vm.createContext(sandbox);
const src = fs.readFileSync(path.join(__dirname, 'assets', 'js', 'alat-cek-lokasi.js'), 'utf8');
vm.runInContext(src, sandbox, { filename: 'alat-cek-lokasi.js' });

function api() { return sandbox.GeoLokasi; }
function klik(id) { elemen[id].dispatch('click'); }
function fireDraw(ev) { (petaHandler['draw:created'] || []).forEach(function (fn) { fn(ev); }); }

/* ── 1. init ─────────────────────────────────────────────────────────── */

ok('modul mengekspor window.GeoLokasi', !!sandbox.GeoLokasi);
ok('tombol Reset terpasang listener-nya',
  (elemen.geolokasiReset._h.click || []).length === 1);

/* ── 2. tombol Cek memasang pin ──────────────────────────────────────── */

elemen.geolokasiInput.value = '-7.470000, 112.650000';
klik('geolokasiCek');
ok('Cek memasang 1 pin di peta', jumlahPin() === 1, jumlahPin());
ok('Cek mematikan tombol selama request berjalan', elemen.geolokasiCek.disabled === true);
ok('Cek tidak menggeser peta bila titik sudah terlihat', berapaKaliFly === 0, berapaKaliFly);

/* ── 3. titik di luar layar membuat peta digeser ─────────────────────── */

titikDiLayar = false;
elemen.geolokasiInput.value = '0.5, 101.4';
klik('geolokasiCek');
ok('titik di luar layar membuat peta digeser', berapaKaliFly === 1, berapaKaliFly);
ok('pin lama digantikan, bukan bertambah', jumlahPin() === 1, jumlahPin());
titikDiLayar = true;

/* ── 4. input kosong tidak memasang pin ──────────────────────────────── */

elemen.geolokasiInput.value = '   ';
klik('geolokasiCek');
ok('input kosong menampilkan galat', /galat|kosong/i.test(elemen.geolokasiHasil.innerHTML),
  elemen.geolokasiHasil.innerHTML);
ok('input kosong tidak mengganti pin', jumlahPin() === 1, jumlahPin());

/* ── 5. Reset membersihkan semuanya ──────────────────────────────────── */

elemen.geolokasiInput.value = '-7.470000, 112.650000';
klik('geolokasiCek');
ok('sebelum Reset pin masih ada', jumlahPin() === 1, jumlahPin());
klik('geolokasiReset');
ok('Reset menghapus pin', jumlahPin() === 0, jumlahPin());
ok('Reset mengosongkan input', elemen.geolokasiInput.value === '', JSON.stringify(elemen.geolokasiInput.value));
ok('Reset mengosongkan panel hasil', elemen.geolokasiHasil.innerHTML === '');
ok('Reset menyalakan kembali tombol Cek', elemen.geolokasiCek.disabled === false);
ok('Reset memberi pesan status', elemen.geolokasiStatus.textContent.length > 0);

/* Respons telat tidak boleh mengisi ulang panel setelah Reset. */
const isiSesudahReset = elemen.geolokasiHasil.innerHTML;
ok('panel tetap kosong setelah Reset (guard cekToken)', elemen.geolokasiHasil.innerHTML === isiSesudahReset);

/* ── 6. alur Pin: marker alat gambar diserahkan ──────────────────────── */

const pinDipilih = new Marker([-7.2, 112.7]);
drawGroupDipakai.push(pinDipilih);
elemen.geolokasiInput.value = '';
panggilanRemoveDrawLayer.length = 0;
fireDraw({ layer: pinDipilih });
ok('alur Pin mengisi input dari titik yang dipilih',
  elemen.geolokasiInput.value.indexOf('-7.2') === 0, elemen.geolokasiInput.value);
ok('alur Pin melepas marker alat gambar', panggilanRemoveDrawLayer.length === 1,
  panggilanRemoveDrawLayer.length);
ok('alur Pin menyisakan tepat satu pin (milik modul ini)', jumlahPin() === 1, jumlahPin());

/* ── 7. lingkaran tidak dianggap pin ─────────────────────────────────── */

const lingkaran = { getLatLng: function () { return { lat: -9, lng: 119 }; } };
elemen.geolokasiInput.value = '9, 119';
panggilanRemoveDrawLayer.length = 0;
fireDraw({ layer: lingkaran });
ok('lingkaran tidak memicu penyerahan marker', panggilanRemoveDrawLayer.length === 0,
  panggilanRemoveDrawLayer.length);
ok('lingkaran tidak menimpa isi input', elemen.geolokasiInput.value === '9, 119',
  elemen.geolokasiInput.value);
fireDraw({ layer: null });
ok('event tanpa layer diabaikan', true);

/* ── 8. hapusMarker dipakai tombol Hapus Gambar ──────────────────────── */

api().hapusMarker();
ok('GeoLokasi.hapusMarker mengosongkan pin', jumlahPin() === 0, jumlahPin());

/* ── 9. pemeriksaan statis pasangan antar-file ───────────────────────── */

const drawSrc = fs.readFileSync(path.join(__dirname, 'assets', 'js', 'alat-draw-measure.js'), 'utf8');
ok('alat-draw-measure mengekspor removeDrawLayer',
  /window\.removeDrawLayer\s*=/.test(drawSrc));
ok('Hapus Gambar ikut membersihkan pin Cek Lokasi',
  /GeoLokasi\.hapusMarker/.test(drawSrc));

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const barisTombol = html.indexOf('id="geolokasiReset"');
ok('tombol Reset ada di index.html', barisTombol > 0);
ok('tombol Reset berada di dalam .geolokasi-tombol',
  barisTombol > html.indexOf('class="geolokasi-tombol"') &&
  barisTombol < html.indexOf('</div>', barisTombol));
ok('tombol Reset memakai kelas modifier', /dm-cek-lokasi-btn--reset/.test(html));

console.log('');
console.log((fail === 0 ? 'SEMUA LULUS: ' : 'ADA YANG GAGAL: ') + pass + ' lulus, ' + fail + ' gagal');
process.exit(fail === 0 ? 0 : 1);
