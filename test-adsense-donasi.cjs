/* Uji slot AdSense pada kartu donasi.
 *
 * Dua hal yang diuji dan tidak bisa ditangkap pemeriksaan syntax:
 *   1. Unit <ins> harus benar-benar terpasang tepat di bawah banner
 *      donasi, baik di katalog layer maupun di setiap sheet.
 *   2. Push AdSense harus terjadi tepat sekali per unit. addDonationBanners
 *      juga dipanggil pada event resize, jadi tanpa penjaga, satu layar
 *      yang diubah ukurannya akan membakar seluruh kuota tayang.
 *
 * sheet-donation-ads.js dijalankan sungguhan di sandbox vm dengan stub
 * DOM. map-core.js terlalu besar untuk dijalankan, jadi bagian itu diuji
 * secara statis: urutan markup dan pemanggilan push-nya.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}

const SLOT = '1306506445';
const KLIEN = 'ca-pub-7501816933195235';

/* ── stub DOM ────────────────────────────────────────────────────────── */

function El(tag, className) {
  this.tagName = tag;
  this.className = className || '';
  this.children = [];
  this.attributes = {};
  this.dataset = {};
  this.style = {};
  this.textContent = '';
  this.innerHTML = '';
  this.parentNode = null;
}
El.prototype.append = function () {
  for (let i = 0; i < arguments.length; i++) this.appendChild(arguments[i]);
};
El.prototype.appendChild = function (n) { n.parentNode = this; this.children.push(n); return n; };
El.prototype.insertBefore = function (n, ref) {
  n.parentNode = this;
  const i = ref ? this.children.indexOf(ref) : -1;
  if (i < 0) this.children.push(n); else this.children.splice(i, 0, n);
  return n;
};
El.prototype.setAttribute = function (k, v) { this.attributes[k] = v; };
El.prototype.querySelector = function (sel) {
  const m = /^:scope\s*>\s*(.+)$/.exec(sel);
  const kelas = (m ? m[1] : sel).replace(/^\./, '').split(/\s+/)[0];
  for (const c of this.children) {
    if (c.className.split(/\s+/).indexOf(kelas) >= 0) return c;
  }
  return null;
};
Object.defineProperty(El.prototype, 'firstChild', { get: function () { return this.children[0] || null; } });
Object.defineProperty(El.prototype, 'nextSibling', {
  get: function () {
    if (!this.parentNode) return null;
    const i = this.parentNode.children.indexOf(this);
    return this.parentNode.children[i + 1] || null;
  }
});

const SELECTOR_SHEET = [
  '#hotspot-sheet .hs-sheet-body',
  '#geopangan-sheet .gp-sheet-body',
  '#transjakarta-sheet .tj-sheet-body',
  '#transjogja-sheet .tj-sheet-body',
  '#geotoolsSheetBody',
  '#geodataSheetBody',
  '#attr-table-sheet .at-sheet-body',
  '#ai-sheet .ais-sheet-body',
  '#drawSidebar .dm-sidebar-body',
  '#legendSidebarBody',
  '#polygonAnalysisList'
];

const wadah = {};
SELECTOR_SHEET.forEach(function (s) { wadah[s] = new El('div'); });

const listenerResize = [];
const sandbox = {
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  document: {
    readyState: 'complete',
    createElement: function (t) { return new El(t); },
    querySelectorAll: function (s) { return wadah[s] ? [wadah[s]] : []; },
    addEventListener: function (t, fn) { if (t === 'DOMContentLoaded') listenerResize.push(fn); }
  },
  addEventListener: function (t, fn) { if (t === 'resize') listenerResize.push(fn); }
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
/* IntersectionObserver sengaja TIDAK disediakan: jalur cadangan yang
   langsung mendorong justru yang harus teruji di sini. */

vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, 'assets', 'js', 'sheet-donation-ads.js'), 'utf8'),
  sandbox, { filename: 'sheet-donation-ads.js' });

/* ── 1. unit terpasang di bawah banner ───────────────────────────────── */

let urutBenar = true;
let jumlahBanner = 0, jumlahIklan = 0;
SELECTOR_SHEET.forEach(function (s) {
  const c = wadah[s];
  const b = c.children[0];
  const a = c.children[1];
  if (!b || b.className.indexOf('sheet-donation-banner') < 0) urutBenar = false;
  if (!a || a.className.indexOf('sheet-adsense') < 0) urutBenar = false;
  if (b) jumlahBanner++;
  if (a) jumlahIklan++;
});
ok('setiap sheet punya banner donasi', jumlahBanner === SELECTOR_SHEET.length, jumlahBanner);
ok('setiap sheet punya unit iklan tepat setelahnya', jumlahIklan === SELECTOR_SHEET.length, jumlahIklan);
ok('urut: banner lalu unit iklan', urutBenar);

/* ── 2. unit memuat atribut yang diminta ─────────────────────────────── */

const contoh = wadah[SELECTOR_SHEET[0]].children[1].innerHTML;
ok('unit memakai data-ad-client yang benar', contoh.indexOf('data-ad-client="' + KLIEN + '"') >= 0);
ok('unit memakai data-ad-slot yang benar', contoh.indexOf('data-ad-slot="' + SLOT + '"') >= 0);
ok('unit memakai data-ad-format auto', contoh.indexOf('data-ad-format="auto"') >= 0);
ok('unit memakai data-full-width-responsive', contoh.indexOf('data-full-width-responsive="true"') >= 0);
ok('unit memakai class adsbygoogle', contoh.indexOf('class="adsbygoogle"') >= 0);
ok('unit diberi komentar Ruang Kita', contoh.indexOf('Ruang Kita') >= 0);

/* ── 3. push tepat sekali per unit ───────────────────────────────────── */

ok('push AdSense terjadi sekali per sheet',
  (sandbox.adsbygoogle || []).length === SELECTOR_SHEET.length,
  (sandbox.adsbygoogle || []).length);

/* resize memanggil addDonationBanners lagi; tidak boleh menambah apa pun. */
listenerResize.forEach(function (fn) { fn(); });
ok('resize tidak memasang unit kedua',
  wadah[SELECTOR_SHEET[0]].children.length === 2,
  wadah[SELECTOR_SHEET[0]].children.length);
ok('resize tidak menambah push',
  (sandbox.adsbygoogle || []).length === SELECTOR_SHEET.length,
  (sandbox.adsbygoogle || []).length);

/* ── 4. map-core.js (statis) ─────────────────────────────────────────── */

const core = fs.readFileSync(path.join(__dirname, 'assets', 'js', 'map-core.js'), 'utf8');
ok('map-core memuat data-ad-client yang benar',
  core.indexOf('data-ad-client="' + KLIEN + '"') >= 0);
ok('map-core memuat data-ad-slot yang benar',
  core.indexOf('data-ad-slot="' + SLOT + '"') >= 0);
ok('katalog layer memasang unit setelah banner donasi',
  core.indexOf('lc-donation-btn lc-donation-paypal') < core.indexOf("html += '<div class=\"lc-adsense\">'"));
ok('map-core memanggil push setelah innerHTML diisi',
  /container\.innerHTML = html;\s*\r?\n\s*dorongSlotIklan\(container\);/.test(core));
ok('map-core menunda push sampai dropdown terlihat',
  /IntersectionObserver/.test(core) && /dorongSekarang/.test(core));

/* ── 5. CSS dan loader ───────────────────────────────────────────────── */

const css = fs.readFileSync(path.join(__dirname, 'assets', 'css', 'app.css'), 'utf8');
ok('CSS punya pembungkus untuk katalog layer', /\.lc-adsense\s*\{/.test(css));
ok('CSS punya pembungkus untuk sheet', /\.lc-adsense\.sheet-adsense\s*\{/.test(css));

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const loader = (html.match(/adsbygoogle\.js\?client=/g) || []).length;
ok('loader AdSense ada di <head>', loader >= 1, loader);
ok('unit <ins> tidak ditulis statis di index.html (harus lewat JS)',
  html.indexOf('data-ad-slot="' + SLOT + '"') < 0);

console.log('');
console.log((fail === 0 ? 'SEMUA LULUS: ' : 'ADA YANG GAGAL: ') + pass + ' lulus, ' + fail + ' gagal');
process.exit(fail === 0 ? 0 : 1);
