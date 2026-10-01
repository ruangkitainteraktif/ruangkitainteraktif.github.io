/* Uji fitur GeoFarm "Referensi Pertanian" (assets/js/geofarm-referensi.js).
 *
 * Fokusnya tiga hal yangDiam-diam bisa rusak dan tidak terlihat dari
 * sekilas screenshot:
 *
 *  1. PARSER LITERAL ARRAY. assets/data/pertanian/*.js bukan JSON: di
 *     akhirnya masih ada jQuery lama, dan di tengah-tengahnya ada `]`
 *     maupun `[` di DALAM string (isi artikel punya <ol>/<ul>, kamus
 *     punya karakter kutip). Pemotongan naif akan memotong data di tempat
 *     yang salah dan menghasilkan error yang jauh dari penyebabnya.
 *
 *  2. MALUMLU DAN SUDAH DIMUAT. Halaman awal harus nol byte untuk 3,7 MB
 *     data ini; file baru diambil saat kartunya dibuka, dan tidak diambil
 *     dua kali.
 *
 *  3. PENCARIAN + PAGINASI tidak boleh salah potong: "Muat lagi" menambah,
 *     bukan menggandakan, dan mengetik ulang selalu menghitung dari nol.
 *
 * Modul dimuat utuh ke dalam sandbox vm (bukan diekstrak per fungsi),
 * jadi yang diuji benar-benar file yang berjalan di browser.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const MODUL = path.join(ROOT, 'assets', 'js', 'geofarm-referensi.js');
const INDEX = path.join(ROOT, 'index.html');
const CSS = path.join(ROOT, 'assets', 'css', 'app.css');
const SRC = fs.readFileSync(MODUL, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + extra : '')); }
}
function equal(a, b, name, extra) {
  ok(name, a === b, extra !== undefined ? extra : ('dapat "' + a + '", harap "' + b + '"'));
}

/* ══ sandbox ══════════════════════════════════════════════════════════
   document sengaja TIDAK ada di sandbox fungsi murni supaya blok boot
   di akhir modul tidak jalan dan tidak meninggalkan timer menggantung. */
function sandbox(denganDocument) {
  const ctx = {
    console, setTimeout, clearTimeout, Promise, Math, Date, JSON,
    Array, Object, String, Number, RegExp, Error, isNaN, parseInt
  };
  if (denganDocument) ctx.document = denganDocument;
  ctx.window = ctx;              /* di browser `window` adalah global itu sendiri */
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: MODUL });
  return { R: ctx.GeoFarmReferensi, ctx };
}

/* ══ DOM tiruan ══════════════════════════════════════════════════════
   Cukup untuk yang dipakai modul: pencarian berdasarkan atribut, event,
   dan tiga bentuk menulis (textContent, innerHTML, insertAdjacentHTML). */
function El(tag, attrs, opsi) {
  const o = opsi || {};
  this.tag = tag;
  this.attrs = attrs || {};
  this.children = [];
  this.innerHTML = '';
  this.value = o.value || '';
  this.hidden = !!o.hidden;
  this.placeholder = (this.attrs && this.attrs.placeholder) || '';
  this.open = !!o.open;
  this.listeners = {};
}
El.prototype.getAttribute = function (n) {
  return this.attrs[n] === undefined ? null : this.attrs[n];
};
El.prototype.addEventListener = function (t, fn) {
  (this.listeners[t] = this.listeners[t] || []).push(fn);
};
El.prototype.fire = function (t) {
  (this.listeners[t] || []).forEach(function (f) { f({ target: this, preventDefault: function () {} }); }, this);
};
El.prototype.insertAdjacentHTML = function (pos, html) {
  if (pos !== 'beforeend') throw new Error('harness hanya mendukung beforeend');
  this.innerHTML += html;
};
/* Hanya selector atribut yang dipakai modul. */
El.prototype.querySelectorAll = function (sel) {
  const nama = sel.replace(/^\[|\]$/g, '');
  const out = [];
  (function jalan(node) {
    node.children.forEach(function (c) {
      if (c.getAttribute(nama) !== null) out.push(c);
      jalan(c);
    });
  })(this);
  return out;
};
El.prototype.querySelector = function (sel) {
  return this.querySelectorAll(sel)[0] || null;
};

function kartu(key, denganFilter) {
  const d = new El('details', { 'data-ref-card': key, 'aria-labelledby': 'x' });
  const head = new El('summary', { class: 'gt-card-head' });
  head.children.push(new El('span', { class: 'gt-card-icon' }));
  head.children.push(new El('span', {}, {}));
  const body = new El('div', { class: 'geofarm-ref-body' });
  body.children.push(new El('input', {
    'data-ref-cari': '', type: 'search',
    placeholder: 'Cari judul atau isi artikel'
  }));
  if (denganFilter) body.children.push(new El('select', { 'data-ref-filter': '' }, { hidden: true }));
  body.children.push(new El('p', { 'data-ref-status': '' }));
  body.children.push(new El('div', { 'data-ref-list': '' }));
  body.children.push(new El('button', { 'data-ref-more': '' }, { hidden: true }));
  d.children.push(head);
  d.children.push(body);
  return d;
}

function dokumen(kunci) {
  const grup = new El('div', { id: 'geofarm-referensi' });
  kunci.forEach(function (k) {
    grup.children.push(kartu(k[0], k[1]));
  });
  const doc = {
    readyState: 'complete',
    getElementById: function (id) { return id === 'geofarm-referensi' ? grup : null; },
    addEventListener: function () {}
  };
  return { doc: doc, grup: grup, kartu: function (key) { return grup.querySelectorAll('[data-ref-card]').filter(function (c) { return c.getAttribute('data-ref-card') === key; })[0]; } };
}

/* fetch tiruan: membaca file sungguhan dari repo, supaya yang diuji benar
   data produksi dan bukan fixture yang bisa melenceng dari aslinya. */
function buatPasif(catatan) {
  return function (url) {
    catatan.push(url);
    return Promise.resolve({
      ok: true,
      status: 200,
      text: function () { return Promise.resolve(fs.readFileSync(path.join(ROOT, url), 'utf8')); }
    });
  };
}
function hitung(html, pola) {
  return (html.match(pola) || []).length;
}

/* Kembalikan potongan html dari tag pembuka di posisi `dari` sampai tag
   penutup yang menutupnya, dengan menghitung kedalaman. Dipakai supaya
   batas pemeriksaan markup ditentukan oleh struktur, bukan oleh teks yang
   kebetulan ada di sebelahnya. */
function potongElemen(html, dari, tag) {
  const re = new RegExp('<' + tag + '\\b|</' + tag + '>', 'g');
  re.lastIndex = dari;
  let depth = 0, m;
  while ((m = re.exec(html))) {
    if (m[0].charAt(1) === '/') {
      depth--;
      if (depth === 0) return html.slice(dari, re.lastIndex);
    } else {
      depth++;
    }
  }
  return '';
}

/* ══ 1. parser literal array ══════════════════════════════════════════ */
console.log('\n1. Parser literal array');
const { R } = sandbox(null);
const LA = R.literalArray;

equal(LA('var a = [1,2,[3,4]]; $("x")', 'a'), '[1,2,[3,4]]', 'kurung siku bersarang ikut dihitung');
equal(LA('var a = ["x]y"]; setelah', 'a'), '["x]y"]', '"]" di dalam string bukan penutup');
equal(LA('var a = ["x[y"]; setelah', 'a'), '["x[y"]', '"[" di dalam string bukan pembuka baru');
equal(LA('var a = ["say \\"hi\\" ]"]; setelah', 'a'), '["say \\"hi\\" ]"]', 'kutip yang di-escape diabaikan');
equal(LA("var a = ['x]y']; setelah", 'a'), "['x]y']", 'string kutip tunggal juga ditangani');
equal(LA('  var   kamus  =\n [1];  var lain = [2];', 'kamus'), '[1]', 'spasi dan baris baru di ="var x ="');
equal(LA('var a = [1]; var b = [2];', 'b'), '[2]', 'nama variabel jadi pembeda');
ok('nama variabel salah -> melempar', (function () {
  try { LA('var a = [1];', 'tidakAda'); return false; } catch (e) { return /tidak ditemukan/.test(e.message); }
})());
ok('literal tidak tertutup -> melempar', (function () {
  try { LA('var a = [1, 2;', 'a'); return false; } catch (e) { return /tidak tertutup/.test(e.message); }
})());
ok('jQuery setelah "];" tidak ikut terbawa', LA('var a = [1];\n$("#list-kamus").html(x);', 'a').indexOf('$') === -1);

/* ══ 2. data sungguhan ════════════════════════════════════════════════ */
console.log('\n2. Empat file data di assets/data/pertanian/');
const HARAP = { artikel: 'post', kamus: 'kamus', opete: 'opt', pestisida: 'pestisida' };
const BANYAK = { artikel: 42, kamus: 5605, opete: 2162, pestisida: 1890 };
const rowsOf = {};
const normOf = {};
Object.keys(HARAP).forEach(function (key) {
  const conf = R.DATASET[key];
  const file = path.join(ROOT, conf.file);
  const src = fs.readFileSync(file, 'utf8');
  const lit = LA(src, HARAP[key]);
  const arr = new Function('return (' + lit + ');')();
  rowsOf[key] = arr;
  const norm = conf.normalisasi(arr);
  normOf[key] = norm;

  console.log('  -- ' + key + ' (' + conf.file + ')');
  ok(conf.file + ' ada di repo', fs.existsSync(file));
  ok('varName ' + HARAP[key] + ' ditemukan di file', new RegExp('var\\s+' + HARAP[key] + '\\s*=\\s*\\[').test(src));
  equal(arr.length, BANYAK[key], 'jumlah baris ' + HARAP[key]);
  ok('hasil eval adalah array', Array.isArray(arr));
  ok('tidak ada baris hilang saat normalisasi', norm.length === arr.length, norm.length + ' dari ' + arr.length);
  ok('literal lebih pendek dari file (ekor jQuery dibuang)',
    lit.length < src.length, lit.length + ' vs ' + src.length);
  ok('ekor jQuery tidak ikut', lit.indexOf('$("#list-') === -1);
  ok('tidak ada $ yang tersisa di literal', lit.indexOf('function innerContent') === -1);
  ok('semua entri punya kunci cari', norm.every(function (r) { return typeof r.cari === 'string' && r.cari.length > 0; }));
});

/* ══ 3. pembedah data ═════════════════════════════════════════════════ */
console.log('\n3. Pemecahan merek dagang & perusahaan');
equal(R.jumlah(2162), '2.162', 'pemisah ribuan Indonesia');
equal(R.jumlah(5605), '5.605', 'pemisah ribuan untuk 4 digit');
equal(R.jumlah(20), '20', 'angka kecil tidak diberi pemisah');
ok('ukuran file tidak lagi jadi data yang dihitung dan ditampilkan',
  typeof R.ukuran === 'undefined' &&
  Object.keys(R.DATASET).every(function (k) { return R.DATASET[k].bytes === undefined; }));
ok('modul tidak lagi menulis ke lencana jumlah di kepala',
  !/data-ref-count/.test(SRC));
equal(R.pecahMerek('VULGAR 865 SL (umum) 2,4-D dimetil amina : 865 g/l').merek, 'VULGAR 865 SL', 'merek = sebelum kurung pertama');
equal(R.pecahMerek('VULGAR 865 SL (umum) 2,4-D dimetil amina : 865 g/l').keterangan,
  '(umum) 2,4-D dimetil amina : 865 g/l', 'keterangan = dari kurung pertama');
equal(R.pecahMerek('APEX 200 EC').merek, 'APEX 200 EC', 'tanpa kurung: semuanya merek');
equal(R.pecahMerek('APEX 200 EC').keterangan, '', 'tanpa kurung: keterangan kosong');
equal(R.pecahMerek('').merek, '', 'string kosong tidak error');
const PT = R.pecahPerusahaan('PT Fortuna Mulia Sejati (info) Izin: Tetap 02 February 2023 RI. 01030120134734');
equal(PT.nama, 'PT Fortuna Mulia Sejati', 'perusahaan = sebelum "Izin:", tanpa "(info)"');
equal(PT.izin, 'Tetap 02 February 2023 RI. 01030120134734', 'izin = setelah "Izin:"');
equal(R.pecahPerusahaan('PT Foo (info)').nama, 'PT Foo', 'tanpa "Izin:" -> izin kosong');
equal(R.pecahPerusahaan('PT Foo (info)').izin, '', 'tanpa "Izin:" -> string kosong');
equal(R.pecahPerusahaan(undefined).nama, '', 'undefined tidak error');

console.log('\n4. Urutan & isi hasil normalisasi');
/* Yang diperiksa adalah hasil normalisasi, bukan baris mentah: pengurutan
   dilakukan di normalisasi(), dan baris mentah belum tersusun. */
function monoton(nilai, nama) {
  ok(nama + ' (abaikan huruf besar-kecil)', nilai.every(function (v, i, a) { return i === 0 || a[i - 1] <= v; }));
}
monoton(normOf.kamus.map(function (r) { return String(r.kata).toLowerCase(); }), 'kamus terurut naik');
monoton(normOf.artikel.map(function (r) { return String(r.judul).toLowerCase(); }), 'artikel terurut naik');

/* opete memakai localeCompare, dan localeCompare menaruh tanda baca
   ("? ", "(", ".") sebelum huruf — jadi 15 nama yang diawali "? " naik ke
   paling atas. Itu perilaku ICU yang benar dan disengaja, bukan urutan
   yang rusak; yang diperiksa di sini persis aturan yang dipakai modul. */
ok('opete terurut menurut collation yang dipakai modul', (function () {
  const n = normOf.opete.map(function (r) { return r.nama; });
  return n.every(function (v, i, a) { return i === 0 || a[i - 1].localeCompare(v) <= 0; });
})());
ok('opete: tanda baca memang mendahului huruf (menjelaskan 15 nama "? " di atas)', (function () {
  const n = normOf.opete.map(function (r) { return r.nama; });
  const tanya = n.filter(function (v) { return /^\?/.test(v); });
  if (!tanya.length) return true;
  return n.indexOf(tanya[tanya.length - 1]) < n.findIndex(function (v) { return !/^[^\w]/.test(v); });
})());
ok('opete: nama yang diawali tanda baca memang ada di sumber', (function () {
  return rowsOf.opete.filter(function (r) { return /^\?/.test(String(r.nama)); }).length > 0;
})());

/* Yang membuat urut() perlu ada: dengan perbandingan < > biasa, huruf
   besar bercampur dengan huruf kecil di tengah daftar, persis di tempat
   orang mencari. */
ok('kamus: urutan ASCII < akan salah (dasar alasan memakai localeCompare)', (function () {
  const k = normOf.kamus.map(function (r) { return String(r.kata); });
  return k.some(function (v, i, a) { return i > 0 && a[i - 1] > v; });
})());
ok('kamus: urutan ASCII opete juga akan salah', (function () {
  const n = normOf.opete.map(function (r) { return String(r.nama); });
  return n.some(function (v, i, a) { return i > 0 && a[i - 1] > v; });
})());
const kat = {};
rowsOf.opete.forEach(function (r) { kat[r.kategori] = (kat[r.kategori] || 0) + 1; });
ok('kategori opete hanya Hama & Penyakit', Object.keys(kat).sort().join(',') === 'Hama,Penyakit', Object.keys(kat).join(','));
equal(JSON.stringify(R.DATASET.opete.opsiFilter(rowsOf.opete)), '["Hama","Penyakit"]', 'opsiFilter diturunkan dari data');
ok('semua artikel punya judul', rowsOf.artikel.every(function (r) { return String(r.title || '').trim().length > 0; }));
ok('semua kamus punya kata', rowsOf.kamus.every(function (r) { return String(r.kata || '').trim().length > 0; }));

console.log('\n5. Renderer: escaping & bentuk HTML');
const D = R.DATASET;
const htmlKamus = D.kamus.render({ kata: '<img src=x onerror=alert(1)>', arti: 'a & b', cari: 'x' });
ok('kamus: teks di-escape', htmlKamus.indexOf('&lt;img') !== -1 && htmlKamus.indexOf('<img') === -1);
ok('kamus: & di-escape', /a &amp; b/.test(htmlKamus));
ok('kamus: dua baris (kata + arti)', /class="geofarm-ref-row"/.test(htmlKamus));
ok('kamus: arti kosong -> tanda hubung', /<i>—<\/i>/.test(D.kamus.render({ kata: 'x', arti: '', cari: 'x' })));

const htmlOpete = D.opete.render({
  nama: '<script>alert(1)</script> Spodoptera exigua',
  kategori: 'Hama', html: '<div class="geofarm-ref-konten"><table></table></div>', cari: 'x'
});
ok('opete: nama di-escape', htmlOpete.indexOf('&lt;script&gt;') !== -1 && htmlOpete.indexOf('<script>') === -1);
ok('opete: isi HTML tepercaya tidak di-escape', htmlOpete.indexOf('geofarm-ref-konten') !== -1);
ok('opete: badge kategori ada + hook data-kat', /data-kat="hama"/.test(htmlOpete) && />Hama</.test(htmlOpete));
ok('opete: badge untuk "Penyakit" -> data-kat="penyakit"',
  /data-kat="penyakit"/.test(D.opete.render({ nama: 'x', kategori: 'Penyakit', html: '', cari: '' })));
ok('opete: kategori kosong -> tanpa badge',
  D.opete.render({ nama: 'x', kategori: '', html: '', cari: '' }).indexOf('geofarm-ref-badge') === -1);
ok('opete: bungkus <details> sendiri', /^<details class="geofarm-ref-item">/.test(htmlOpete));

const p = D.pestisida.normalisasi([{
  no: 1,
  merekdagang: 'VULGAR 865 SL (umum) glifosat : 540 g/l Herbisida',
  carapemakaian: 'Kelapa sawit: gulma berdaun lebar',
  perusahaan: 'PT Fortuna Mulia Sejati (info) Izin: Tetap 02 February 2023 RI. 0103'
}])[0];
const htmlPest = D.pestisida.render(p);
ok('pestisida: judul = nama merek', /<b>VULGAR 865 SL<\/b>/.test(htmlPest));
ok('pestisida: ringkasan = perusahaan', /<small>PT Fortuna Mulia Sejati<\/small>/.test(htmlPest));
ok('pestisida: ada blok bahan aktif', /Bahan aktif/.test(htmlPest));
ok('pestisida: ada blok cara pemakaian', /Cara pemakaian/.test(htmlPest));
ok('pestisida: ada blok izin', />Izin</.test(htmlPest));
ok('pestisida: isi di-escape', /&lt;b&gt;y&lt;\/b&gt;/.test(D.pestisida.render(
  D.pestisida.normalisasi([{ no: 9, merekdagang: 'X <b>y</b>', carapemakaian: '', perusahaan: 'PT A' }])[0])));
ok('pestisida: tanpa merek -> judul "#no"', /<b>#9<\/b>/.test(
  D.pestisida.render(D.pestisida.normalisasi([{ no: 9, merekdagang: '', carapemakaian: '', perusahaan: 'PT A' }])[0])));

const htmlArt = D.artikel.render({
  judul: 'Budidaya <b>Anggrek</b> & "Kamboja"', meta: 'Juni 12, 2022',
  poster: 'https://telegra.ph/file/x.jpg?a=1&b=2',
  html: '<div class="geofarm-ref-konten"><p>Isi <strong>tebal</strong></p></div>', cari: 'x'
});
ok('artikel: judul di-escape', /&lt;b&gt;Anggrek&lt;\/b&gt;/.test(htmlArt) && /&quot;Kamboja&quot;/.test(htmlArt) && /&amp;/.test(htmlArt));
ok('artikel: tidak ada tag dari judul yang lolos', !/<b>Anggrek/.test(htmlArt));
ok('artikel: atribut poster di-escape (& jadi &amp;)', /a=1&amp;b=2/.test(htmlArt));
ok('artikel: poster lazy', /loading="lazy"/.test(htmlArt));
ok('artikel: isi HTML tepercaya tetap apa adanya', /<strong>tebal<\/strong>/.test(htmlArt));
ok('artikel: tanpa poster -> tidak ada <img>', D.artikel.render(
  { judul: 'x', meta: '', poster: '', html: '', cari: 'x' }).indexOf('<img') === -1);
ok('artikel: tanpa tanggal -> tidak ada <small>', D.artikel.render(
  { judul: 'x', meta: '', poster: '', html: '', cari: 'x' }).indexOf('<small>') === -1);

/* ══ 6. siklus hidup DOM ═══════════════════════════════════════════════ */
console.log('\n6. Malu-malu, buka, cari, muat lagi');
(async function () {
  const dipanggil = [];
  const { doc, kartu: kartuOf } = dokumen([['kamus', false]]);
  const s = sandbox(doc);
  s.ctx.fetch = buatPasif(dipanggil);

  ok('init() menemukan kartu', s.R.init() === true);
  equal(dipanggil.length, 0, 'halaman awal TIDAK mengunduh apa pun');

  const host = kartuOf('kamus');
  const list = host.querySelector('[data-ref-list]');
  const status = host.querySelector('[data-ref-status]');
  const cari = host.querySelector('[data-ref-cari]');
  const more = host.querySelector('[data-ref-more]');

  ok('status awal mengatakan belum dimuat, bukan ukuran file',
    /Belum dimuat/.test(status.textContent), status.textContent);
  ok('status awal tidak lagi menampilkan ukuran file',
    !/KB|MB/.test(status.textContent), status.textContent);
  ok('kartu tidak punya lencana jumlah di kepala',
    host.querySelector('[data-ref-count]') === null && /gt-card-count/.test(SRC) === false);
  ok('list masih kosong sebelum kartu dibuka', list.innerHTML === '');

  host.open = true;
  host.fire('toggle');
  await new Promise(function (r) { setTimeout(r, 60); });

  equal(dipanggil.length, 1, 'buka kartu -> tepat satu fetch');
  equal(dipanggil[0], 'assets/data/pertanian/kamus.js', 'file yang diambil benar');
  equal(hitung(list.innerHTML, /class="geofarm-ref-row"/g), R.HALAMAN, 'hanya ' + R.HALAMAN + ' baris pertama yang dirender');
  ok('status melaporkan jumlah total', /5\.605 istilah/.test(status.textContent));
  ok('status tidak menampilkan ukuran file setelah dimuat',
    !/KB|MB/.test(status.textContent), status.textContent);
  ok('tombol "Muat lagi" muncul', more.hidden === false);
  ok('tombol "Muat lagi" menyebut ukuran halaman, bukan sisa semua',
    /^Muat 20 lagi$/.test(more.textContent), more.textContent);

  host.open = false; host.fire('toggle');
  host.open = true; host.fire('toggle');
  await new Promise(function (r) { setTimeout(r, 60); });
  equal(dipanggil.length, 1, 'buka-tutup-buka TIDAK mengunduh ulang');

  more.fire('click');
  equal(hitung(list.innerHTML, /class="geofarm-ref-row"/g), R.HALAMAN * 2, '"Muat lagi" MENAMBAH, bukan menggandakan');
  ok('isi lama tidak hilang setelah muat lagi', list.innerHTML.indexOf('A horizon') !== -1);

  const sebelum = list.innerHTML;
  cari.value = 'zzzzzz';
  cari.fire('input');
  ok('mengetik tidak langsung merender (ada jeda)', list.innerHTML === sebelum);
  await new Promise(function (r) { setTimeout(r, 260); });
  equal(list.innerHTML, '', 'pencarian tanpa hasil mengosongkan list');
  ok('statusidone salah: "tidak ada"', /Tidak ada/.test(status.textContent) && /is-warn/.test(status.className));
  ok('tombol "Muat lagi" disembunyikan saat tidak ada sisa', more.hidden === true);

  /* "lahan" muncul di kolom arti (mis. "abandoned land" = "lahan bongkor"),
     tidak pernah di kolom kata. Kalau pencarian hanya membaca judul,
     semua 104 hasil ini tidak akan ditemukan. */
  cari.value = 'lahan';
  cari.fire('input');
  await new Promise(function (r) { setTimeout(r, 260); });
  ok('pencarian menemukan isi (bukan cuma kata kunci)',
    hitung(list.innerHTML, /class="geofarm-ref-row"/g) > 0, list.innerHTML.slice(0, 120));
  ok('pencarian isi menemukan 104 entri', /104 hasil dari 5\.605/.test(status.textContent), status.textContent);
  ok('status memakai kalimat "hasil dari"', /hasil dari 5\.605/.test(status.textContent), status.textContent);
  ok('kunci yang hanya ada di isi tetap cocok walau beda huruf besar-kecil',
    normOf.kamus.some(function (r) { return r.arti.toLowerCase().indexOf('lahan') !== -1
      && r.kata.toLowerCase().indexOf('lahan') === -1; }));

  /* Spasi berlebih harus diperlakukan sama seperti satu spasi: tanpa ini,
     "  A   HORIZON  " akan memecah menjadi ["", "A", "", "HORIZON", ""] dan
     kata kosong ikut dihitung sebagai syarat. */
  cari.value = 'a horizon';
  cari.fire('input');
  await new Promise(function (r) { setTimeout(r, 260); });
  const rapi = list.innerHTML;
  const teksRapi = status.textContent;
  ok('pencarian tidak membedakan huruf besar-kecil', hitung(rapi, /geofarm-ref-row/g) > 0, status.textContent);
  ok('dua kata diurutkan lain harus di-AND-kan, bukan diabaikan', /hasil dari 5\.605/.test(teksRapi), teksRapi);

  cari.value = '   a     HORIZON   ';
  cari.fire('input');
  await new Promise(function (r) { setTimeout(r, 260); });
  ok('spasi berlebih tidak mengubah hasil', list.innerHTML === rapi && status.textContent === teksRapi,
    status.textContent + ' vs ' + teksRapi);

  cari.value = 'xyzzyplugh';
  cari.fire('input');
  await new Promise(function (r) { setTimeout(r, 260); });
  ok('kunci yang tidak ada -> "Tidak ada"', /Tidak ada/.test(status.textContent), status.textContent);

  cari.value = '';
  cari.fire('input');
  await new Promise(function(r) { setTimeout(r, 260); });
  equal(hitung(list.innerHTML, /class="geofarm-ref-row"/g), R.HALAMAN, 'mengosongkan pencarian kembali ke halaman pertama');
  ok('status kembali ke mode normal', !/hasil dari/.test(status.textContent), status.textContent);

  console.log('\n7. Saringan kategori (kartu opete)');
  const d2 = dokumen([['opete', true]]);
  const s2 = sandbox(d2.doc);
  s2.ctx.fetch = buatPasif([]);
  s2.R.init();
  const host2 = d2.kartu('opete');
  const list2 = host2.querySelector('[data-ref-list]');
  const stat2 = host2.querySelector('[data-ref-status]');
  const filt = host2.querySelector('[data-ref-filter]');
  ok('select saringan tersembunyi sebelum data ada', filt.hidden === true);
  host2.open = true; host2.fire('toggle');
  await new Promise(function(r) { setTimeout(r, 80); });
  ok('select saringan muncul setelah data ada', filt.hidden === false);
  ok('opsi saringan = Semua + Hama + Penyakit',
    /value="">Semua kategori/.test(filt.innerHTML) && /value="Hama"/.test(filt.innerHTML) && /value="Penyakit"/.test(filt.innerHTML),
    filt.innerHTML);
  ok('semua kategori tampil tanpa saringan', /2\.162/.test(stat2.textContent));
  filt.value = 'Penyakit';
  filt.fire('change');
  ok('saring "Penyakit" -> hanya 1.014 dari 2.162', /1\.014 hasil dari 2\.162/.test(stat2.textContent), stat2.textContent);
  ok('baris yang dirender semuanya penyakit',
    hitung(list2.innerHTML, /data-kat="penyakit"/g) === R.HALAMAN);
  ok('tidak ada baris "Hama" yang bocor ke hasil saringan',
    hitung(list2.innerHTML, /data-kat="hama"/g) === 0);
  filt.value = '';
  filt.fire('change');
  ok('kategori "Semua" mengembalikan jumlah penuh', /2\.162 hama & penyakit/.test(stat2.textContent), stat2.textContent);

  /* Saringan harus TEPAT. Entri yang kategorinya kosong tidak boleh ikut
     masuk hasil "Hama": kategori kosong tidak sama dengan apa pun, dan
     kode yang hanya mengecek "kalau punya kategori" akan membocorkannya. */
  const d2b = dokumen([['opete', true]]);
  const s2b = sandbox(d2b.doc);
  let barisPalsu = rowsOf.opete.concat([{ nama: 'Tanpa Kategori', detail: '<table></table>', kategori: '' }]);
  s2b.ctx.fetch = function () {
    return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve('var opt = ' + JSON.stringify(barisPalsu) + ';'); } });
  };
  s2b.R.init();
  const host2b = d2b.kartu('opete');
  const list2b = host2b.querySelector('[data-ref-list]');
  const stat2b = host2b.querySelector('[data-ref-status]');
  const filt2b = host2b.querySelector('[data-ref-filter]');
  host2b.open = true; host2b.fire('toggle');
  await new Promise(function (r) { setTimeout(r, 80); });
  ok('entri tanpa kategori ikut terhitung saat tidak disaring',
    /2\.163 hama & penyakit/.test(stat2b.textContent), stat2b.textContent);
  filt2b.value = 'Hama';
  filt2b.fire('change');
  ok('entri tanpa kategori TIDAK bocor ke saringan "Hama"',
    /1\.148 hasil dari 2\.163/.test(stat2b.textContent), stat2b.textContent);
  ok('entri tanpa kategori tidak muncul di DOM hasil saringan',
    list2b.innerHTML.indexOf('Tanpa Kategori') === -1);
  filt2b.value = '';
  filt2b.fire('change');
  ok('tanpa saringan, entri tanpa kategori tetap tampil', /2\.163/.test(stat2b.textContent), stat2b.textContent);

  console.log('\n8. Kartu tanpa select tidak dibuatkan saringan');
  const d3 = dokumen([['artikel', false], ['pestisida', false]]);
  const s3 = sandbox(d3.doc);
  s3.ctx.fetch = buatPasif([]);
  s3.R.init();
  ok('artikel tidak punya select', d3.kartu('artikel').querySelector('[data-ref-filter]') === null);
  ok('pestisida tidak punya select', d3.kartu('pestisida').querySelector('[data-ref-filter]') === null);

  console.log('\n9. File hilang / rusak');
  const d4 = dokumen([['kamus', false]]);
  const s4 = sandbox(d4.doc);
  s4.ctx.fetch = function () { return Promise.resolve({ ok: false, status: 404, text: function () { return Promise.resolve(''); } }); };
  s4.R.init();
  const host4 = d4.kartu('kamus');
  const stat4 = host4.querySelector('[data-ref-status]');
  host4.open = true; host4.fire('toggle');
  await new Promise(function(r) { setTimeout(r, 60); });
  ok('HTTP gagal -> status is-error menyebut file', /Gagal membaca/.test(stat4.textContent) && /kamus\.js/.test(stat4.textContent), stat4.textContent);
  ok('HTTP gagal -> kelas is-error', /is-error/.test(stat4.className));
  ok('HTTP gagal -> list tetap kosong', host4.querySelector('[data-ref-list]').innerHTML === '');

  const d5 = dokumen([['kamus', false]]);
  const s5 = sandbox(d5.doc);
  s5.ctx.fetch = buatPasif([]);
  s5.R.init();
  s5.R.muatArray('assets/data/pertanian/kamus.js', 'namaYangSalahAda')
    .then(function () { ok('nama var salah -> ditolak', false); })
    .catch(function (e) { ok('nama var salah -> ditolak', /tidak ditemukan/.test(e.message), e.message); })
    .then(function () {
      cekMarkup();
    });
})().catch(function (e) {
  console.log('\nERROR HARNESS: ' + (e && e.stack ? e.stack : e));
  fail++;
  cekMarkup();
});

/* ══ 10. markup index.html ═════════════════════════════════════════════ */
function cekMarkup() {
  console.log('\n10. Markup di index.html');
  const html = fs.readFileSync(INDEX, 'utf8');
  const MULAI = '<div class="geofarm-ref-group" id="geofarm-referensi">';
  const mulai = html.indexOf(MULAI);
  ok('grup #geofarm-referensi ada', mulai !== -1);
  if (mulai === -1) return selesai();

  /* Potong grup dari <div ... id="geofarm-referensi"> sampai </div> yang
     menutupnya, dengan menghitung kedalaman <div>. Dipotong sampai tag
     <script> saja tidak cukup:Markup di dalam <script> di halaman lain bisa
     mengandung "geofarm-referensi" dan menggeser batas. */
  const akhir = html.indexOf('<script src="assets/js/geofarm-referensi.js">');
  const grup = potongElemen(html, mulai, 'div');
  ok('grup ditutup dengan </div> yang tepat', grup.length > 0);
  ok('grup berada di dalam #geotoolsTabGeoFarm', (function () {
    const panel = html.indexOf('id="geotoolsTabGeoFarm"');
    return panel !== -1 && panel < mulai && (html.indexOf('id="geotoolsTabGeoFarm"', mulai) === -1
      || html.indexOf('id="geotoolsTabGeoFarm"', mulai) > akhir);
  })());
  ok('grup tidak ada di luar panel (hanya satu kemunculan di panel itu)',
    (html.match(/id="geofarm-referensi"/g) || []).length === 1);
  ok('grup <div> seimbang', hitung(grup, /<div\b/g) === hitung(grup, /<\/div>/g),
    hitung(grup, /<div\b/g) + ' buka vs ' + hitung(grup, /<\/div>/g) + ' tutup');
  ok('grup <details> seimbang', hitung(grup, /<details\b/g) === 4 && hitung(grup, /<\/details>/g) === 4);
  ok('grup <span> seimbang', hitung(grup, /<span\b/g) === hitung(grup, /<\/span>/g));
  ok('grup <button> seimbang', hitung(grup, /<button\b/g) === hitung(grup, /<\/button>/g));

  const detail = grup.match(/<details\b[\s\S]*?<\/details>/g) || [];
  equal(detail.length, 4, 'grup berisi tepat 4 kartu <details>');
  const kunci = detail.map(function (d) {
    const m = /data-ref-card="([a-z]+)"/.exec(d);
    return m ? m[1] : '?';
  });
  ok('kunci kartu benar', kunci.join(',') === 'artikel,kamus,opete,pestisida', kunci.join(','));

  detail.forEach(function (d, i) {
    const key = kunci[i];
    ok(key + ': tanpa atribut open (mulai terlipat)', !/\sopen[\s=>/]/.test(d.slice(0, d.indexOf('>') + 1)), d.slice(0, 70));
    ok(key + ': kepala pakai .gt-card-head', /<summary class="gt-card-head">/.test(d));
    ok(key + ': kepala TIDAK punya lencana jumlah/ukuran', !/data-ref-count/.test(d) && !/gt-card-count/.test(d));
    ok(key + ': tidak ada teks ukuran file di markup', !/\d+\s*(KB|MB)/.test(d));
    ok(key + ': ada satu input cari', hitung(d, /data-ref-cari/g) === 1);
    ok(key + ': ada satu status', hitung(d, /data-ref-status/g) === 1);
    ok(key + ': ada satu list', hitung(d, /data-ref-list/g) === 1);
    ok(key + ': ada satu tombol muat-lagi', hitung(d, /data-ref-more/g) === 1);
    ok(key + ': status punya role + aria-live', /role="status"/.test(d) && /aria-live="polite"/.test(d));
    ok(key + ': aria-labelledby menunjuk judul yang ada', (function () {
      const a = /aria-labelledby="([^"]+)"/.exec(d);
      return !!a && html.indexOf('id="' + a[1] + '"') !== -1;
    })());
    ok(key + ': tombol muat-lagi mulai hidden', /data-ref-more type="button" hidden/.test(d));
    ok(key + ': input cari bertipe search + autocomplete off',
      /type="search"/.test(d) && /autocomplete="off"/.test(d));
    ok(key + '<details> seimbang', hitung(d, /<details\b/g) === hitung(d, /<\/details>/g));
    ok(key + ': div seimbang', hitung(d, /<div\b/g) === hitung(d, /<\/div>/g));
  });

  ok('hanya kartu opete yang punya select saringan', hitung(grup, /data-ref-filter/g) === 1);
ok('tidak ada handler sebaris di markup (onerror/onclick)',
  !/\son(error|click|load)\s*=/i.test(grup));
ok('penanganan poster gagal memakai fase capture', /addEventListener\('error',[\s\S]{0,220}true\)/.test(SRC));
  ok('index.html tidak menyalin isi data (tidak ada <table> dari opete.js)',
    hitung(grup, /<table/g) === 0 && hitung(grup, /<ol>/g) === 0);

  ok('id dalam grup unik', (function () {
    const ids = (grup.match(/id="[^"]+"/g) || []);
    return new Set(ids).size === ids.length;
  })());
  ok('id grup tidak bentrok dengan bagian lain halaman',
    (html.match(/id="geofarm-referensi"/g) || []).length === 1);
  ok('id label "for" benar-benar ada', (function () {
    const fors = (grup.match(/for="([^"]+)"/g) || []).map(function (s) { return /"([^"]+)"/.exec(s)[1]; });
    return fors.every(function (f) { return html.indexOf('id="' + f + '"') !== -1; });
  })());
  /* Panel #geotoolsTabGeoFarm diukur dengan menghitung kedalaman dari tag
     pembukanya, bukan dari penanda "TAB 3" berikutnya: di ujung panel ada
     </div> yang menutup tag yang dibuka DI LUAR panel, jadi potongan dari
     awal panel sampai penanda berikutnya memang tidak akan seimbang dan
     pemeriksaan seperti itu hanya menguji tebakan. */
  const panel = potongElemen(html, html.indexOf('<div id="geotoolsTabGeoFarm"'), 'div');
  ok('panel #geotoolsTabGeoFarm ditemukan', panel.length > 0);
  ok('panel #geotoolsTabGeoFarm <div> seimbang',
    hitung(panel, /<div\b/g) === hitung(panel, /<\/div>/g),
    hitung(panel, /<div\b/g) + ' buka vs ' + hitung(panel, /<\/div>/g) + ' tutup');
  ok('grup ada DI DALAM panel itu', panel.indexOf('id="geofarm-referensi"') !== -1);
  ok('grup ada di luar panel', html.replace(panel, '').indexOf('id="geofarm-referensi"') === -1);

  console.log('\n11. Script & asset');
  ok('geofarm-referensi.js dimuat di index.html', akhir !== -1);
  ok('dimuat tepat sekali', (html.match(/assets\/js\/geofarm-referensi\.js/g) || []).length === 1);
  ok('file modul benar-benar ada', fs.existsSync(MODUL));
  ok('keempat file data ada', Object.keys(HARAP).every(function (k) {
    return fs.existsSync(path.join(ROOT, R.DATASET[k].file));
  }));
  ok('path file data relatif dari root (dipakai fetch dari index.html)',
    Object.keys(HARAP).every(function (k) { return /^assets\/data\/pertanian\/[a-z]+\.js$/.test(R.DATASET[k].file); }));
  ok('file data masih isi (tidak ikut terpotong oleh perubahan ini)',
    Object.keys(HARAP).every(function (k) {
      return fs.statSync(path.join(ROOT, R.DATASET[k].file)).size > 100000;
    }), Object.keys(HARAP).map(function (k) {
      return k + ' ' + fs.statSync(path.join(ROOT, R.DATASET[k].file)).size;
    }).join(' '));

  cekCss();
}

/* ══ 12. CSS ══════════════════════════════════════════════════════════ */
function cekCss() {
  console.log('\n12. Gaya di app.css');
  const css = fs.readFileSync(CSS, 'utf8');

  const perlu = [
    'geofarm-ref-group', 'geofarm-ref', 'geofarm-ref-body', 'geofarm-ref-label',
    'geofarm-ref-input', 'geofarm-ref-select', 'geofarm-ref-status',
    'geofarm-ref-list', 'geofarm-ref-row', 'geofarm-ref-item',
    'geofarm-ref-item-sum', 'geofarm-ref-item-body', 'geofarm-ref-badge',
    'geofarm-ref-blok', 'geofarm-ref-konten', 'geofarm-ref-poster', 'geofarm-ref-more'
  ];
  perlu.forEach(function (k) {
    ok('ada gaya .' + k, css.indexOf('.' + k) !== -1);
  });

  /* Kelas yang sudah dihapus dari markup harus hilang dari CSS juga,
     bukan dibiarkan jadi alias: tidak ada yang memakainya lagi. */
  ok('.gt-card-count sudah dihapus dari CSS', css.indexOf('.gt-card-count') === -1);
  ok('.geofarm-ref-group-title sudah dihapus dari CSS', css.indexOf('.geofarm-ref-group-title') === -1);
  ok('.geofarm-ref-group-desc sudah dihapus dari CSS', css.indexOf('.geofarm-ref-group-desc') === -1);

  /* Jarak antar kartu di tab GeoFarm harus satu nilai. Dulu tiga:
     Kalkulator 14px, grup Referensi 20px, kartu Referensi 8px. */
  (function () {
    function marginTop(selektor) {
      const blok = new RegExp('(^|\\})\\s*' + selektor.replace('.', '\\.') +
        '\\s*\\{([^}]*)\\}', 'm').exec(css);
      if (!blok) return null;
      const m = /margin-top:\s*([0-9]+)px/.exec(blok[2]);
      return m ? Number(m[1]) : 0;
    }
    const kalk = marginTop('.geofarm-kalk');
    const ref = marginTop('.geofarm-ref');
    const grup = marginTop('.geofarm-ref-group');
    equal(kalk, ref, 'jarak kartu Kalkulator sama dengan kartu Referensi');
    equal(grup, 0, 'grup Referensi tidak menambah jarak sendiri (ambil dari kartu pertama)');
    ok('jarak antar kartu tidak nol (kartu tidak menempel)', ref > 0, ref);
  })();

  ok('isi kartu disembunyikan saat terlipat (mekanisme collapse)',
    /\.geofarm-ref:not\(\[open\]\)\s*>\s*\.geofarm-ref-body\s*\{\s*display:\s*none/.test(css));
  ok('daftar punya tinggi maksimum + overflow-y (agar tidak mendorong kartu lain)',
    /\.geofarm-ref-list\s*\{[^}]*max-height:[^}]*overflow-y:\s*auto/s.test(css));
  ok('overflow-x ditulis eksplisit di daftar',
    /\.geofarm-ref-list\s*\{[^}]*overflow-x:\s*hidden/s.test(css));
  ok('tema gelap punya aturan badge Hama',
    /\[data-theme="dark"\]\s*\.geofarm-ref-badge\[data-kat="hama"\]/.test(css));
  ok('tema gelap punya aturan status error',
    /\[data-theme="dark"\]\s*\.geofarm-ref-status\.is-error/.test(css));
  ok('.gt-card-head TIDAK ditulis ulang (satu template kepala)',
    (css.match(/^\.gt-card-head\s*\{/gm) || []).length === 1);
  ok('kepala tidak memakai kelas kepala per modul',
    !/\.geofarm-ref-head\s*\{/.test(css) && !/\.geofarm-ref-summary\s*\{/.test(css));
  ok('kelas tua yang dihapus tidak dibangkitan lagi',
    !/\.geofarm-card-head\s*\{/.test(css) && !/\.geofarm-kalk-head\s*\{/.test(css));

  /* Setiap kelas yang ditulis renderer harus punya gaya; kalau tidak, itu
     berarti markup dan CSS tidak sinkron dan akan rusak diam-diam.
     Class string di modul dirakit dengan Operator +, jadi nama class bisa
     terpotong di awal dan di akhir: class="geofarm-ref-item' ikut tertangkap
     kalau pola tidak berhenti di tanda kutip. */
  const emit = new Set();
  const pola = /class="([^"']+)/g;
  let m;
  while ((m = pola.exec(SRC))) {
    m[1].split(/\s+/).forEach(function (k) { if (/^geofarm-ref/.test(k)) emit.add(k); });
  }
  ok('kelas yang dipindai tidak kosong', emit.size > 0, [...emit].join(', '));
  const tanpaGaya = [...emit].filter(function (k) { return css.indexOf('.' + k) === -1; });
  ok('setiap kelas yang ditulis modul punya gaya', tanpaGaya.length === 0, tanpaGaya.join(', '));
  ok('kelas markup (index.html) juga punya gaya', (function () {
    const markup = fs.readFileSync(INDEX, 'utf8');
    const grup = potongElemen(markup, markup.indexOf('<div class="geofarm-ref-group"'), 'div');
    const kelas = new Set();
    const p2 = /class="([^"']+)/g;
    let m2;
    while ((m2 = p2.exec(grup))) {
      m2[1].split(/\s+/).forEach(function (k) { if (/^geofarm-ref|^gt-card/.test(k)) kelas.add(k); });
    }
    const hilang = [...kelas].filter(function (k) { return css.indexOf('.' + k) === -1; });
    return hilang.length === 0;
  })());

  selesai();
}

function selesai() {
  console.log('\n' + (fail === 0 ? 'SEMUA LULUS' : 'ADA YANG GAGAL') + ': ' + pass + ' lulus, ' + fail + ' gagal');
  process.exit(fail === 0 ? 0 : 1);
}
