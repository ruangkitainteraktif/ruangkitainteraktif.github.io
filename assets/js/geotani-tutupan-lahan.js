/* ── GeoTani: TUTUPAN LAHAN 2024 (KLHK / BNPB) per desa ──
 *
 * Menampilkan sebaran tutupan lahan di dalam desa yang dipilih, sebagai
 * workflow mandiri di sebelah kartu "LBS & LSD" dan "LSD 12 Provinsi".
 *
 * Sumber: BNPB, service thematic/PL_KLHK_2024/MapServer/0, layer
 * PL_KLHK_2024. 442.835 fitur, seluruh Indonesia, SR 4326. Diverifikasi
 * langsung ke server lewat query countOnly:
 *
 *   bbox 0,1 derajat di Aceh, Jawa, dan Maluku: 38 sampai 58 poligon.
 *   bbox 0,1 derajat di Kalimantan: 924 poligon.
 *   bbox 1 derajat di Kalimantan: 1.325 poligon.
 *
 * Empat hal yang membentuk desain modul ini. Sisanya ada di masing-masing
 * bagian yang menyirinya, karena tiap hal hanya berlaku di tempat ia
 * dipakai.
 *
 * 1. WARNA DIAMBIL DARI ID_Penutu4, BUKAN KELAS_PL.
 *    KELAS_PL kelihatannya seperti kunci alami, tapi tiga nilai di dalamnya
 *    merusaknya:
 *
 *      - 20121 (Bandara / Pelabuhan) punya KELAS_PL bernilai null.
 *      - 50011 (Rawa) punya KELAS_PL bernilai "rawa" -- huruf kecil,
 *        sedangkan label resminya "Rawa".
 *      - 20092 punya KELAS_PL "Pertanian Lahan Kering Bercampur dgn
 *        Semak", sedangkan legenda layer menyebutnya "Pertanian Lahan
 *        Kering Campur Semak".
 *
 *    Dua yang pertama membuat pencocokan string men-drop kelasnya, dan
 *    men-dropnya tanpa error: poligon tetap tampil, hanya warna default
 *    yang dipakai, jadi legendanya diam-diam jadi tidak lengkap.
 *    ID_Penutu4 integer dan lengkap untuk semua 442.835 fitur, jadi itu
 *    yang jadi kunci. Warna diambil apa adanya dari symbol.color di
 *    renderer server, sehingga palet di sini sama persis dengan yang
 *    dilihat di geoportal BNPB -- bukan tebakan.
 *
 * 2. Shape_Area TIDAK BISA DIPAKAI SEBAGAI LUAS.
 *    Field itu ada dan memanggilnya jadi godaan, tapi geometryProperties
 *    layer menyebut units: esriDecimalDegrees, dan nilainya memang
 *    derajat kuadrat: poligon 1,2e-05 adalah 0,0118 derajat
 *    kuadrat, bukan 11.800 meter persegi. Semua luas dihitung ulang dari
 *    geometri hasil klip lewat window.geoArea, sama seperti kartu lain.
 *
 * 3. BOUNDING BOX DESA, BUKAN KABUPATEN.
 *    Luas yang ditampilkan tetap luas di dalam desa, jadi bbox kabupaten
 *    hanya memperbesar jumlah poligon yang harus diklip lalu sebagian
 *    besar dibuang di luar desa -- menambah beban tanpa menambah angka.
 *    Diverifikasi: bbox kabupaten di Kalimantan 1.927 poligon, di Papua
 *    2.233 sampai 17.058. Batas maxRecordCount layer ini 2.000, jadi
 *    kabupaten di Papua sudah melewati batas sebelum ada satu poligon pun
 *    diklip.
 *
 * 4. HANYA DUA TAHUN, DAN 2017 SENGAJA TIDAK DILEWATKAN.
 *    Service PL_KLHK_2017 ada dan punya 22 kelas dengan kode yang sama
 *    persis seperti 2020 dan 2024, jadi pemetaan kelasnya sendiri mudah.
 *    Yang tidak layak adalah geometrinya: 689 fitur untuk seluruh
 *    Indonesia, masing-masing multi-part dengan ribuan titik. Satu bbox
 *    desa 0,04 derajat hanya mengembalikan 7 fitur -- tapi 30,3 MB dan 100
 *    detik, dengan 11.129 ring. Penyederhanaan maxAllowableOffset 0,003
 *    turunkan ke 1,4 MB dan 5 detik, tapi memotong detail sekitar 330
 *    meter sehingga kelas kecil bisa hilang atau berubah bentuk. Itu
 *    mengubah definisi kelas, bukan cuma mempercepat, dan delta yang
 *    berasal dari sana akan salah tanpa error. Server 2017 juga membalas
 *    521 saat diuji berulang.
 *
 *    Catatan ini ada di kepala file, bukan di layar. Di layar hanya
 *    ditulis tahun mana yang dibandingkan; menjelaskan kenapa satu tahun
 *    tidak ikut menambah kata-kata yang harus dilewati orang untuk
 *    membaca angka yang sebenarnya ada di depan mata.
 *
 * 5. DELTA DIHITUNG DARI KODE KELAS, BUKAN DARI NAMA.
 *    kode_pl (2020) dan ID_Penutu4 (2024) memakai skema yang sama
 *    persis -- 2001, 2002, 2004, ... 50011 -- dan pada bbox uji Aceh,
 *    Kalimantan, dan Jawa Timur kode yang muncul di kedua layer
 *    persis sama, tanpa kelas yatim di kedua arah.
 *
 *    Nama kelasnya justru BERBEDA: 2020 menulis "Pertanian Lahan Kering
 *    + Semak", 2024 menulis "Pertanian Lahan Kering Bercampur dgn Semak".
 *    Kalau baris tabelnya dibentuk dari nama server, satu kelas akan
 *    muncul jadi dua baris dan terlihat seperti dua kelas berbeda --
 *    masalah yang tidak memunculkan error, hanya hasil yang salah.
 *    Karena itu nama tampilan diambil dari KELAS di bawah, dan nama
 *    server disimpan terpisah hanya untuk popup.
 *
 * 6. LUAS DI KEDUA TAHUN DIHITUNG ULANG DARI GEOMETRI.
 *    2020 punya field `luas` per fitur: 11,44 ha, 8,17 ha, dan
 *    seterusnya, dengan total nasional 188.510.510 ha. Field itu godaan
 *    karena sudah jadi dalam satuan hektar, dan PL_KLHK_2020 memakainya
 *    untuk tabel atributnya sendiri.
 *
 *    Tapi Shape_Area di 2020 bernilai 153,5 untuk seluruh nasional --
 *    derajat kuadrat, bukan meter, sama seperti 2024. Dua layer itu
 *    punya dua satuan yang tidak sama, dan `luas` di 2020 sudah terisi
 *    sementara 2024 tidak punya padanannya. Mengganti satu sisi dengan
 *    atribut dan sisi lain dengan geometri akan membuat delta
 *    mencerminkan pilihan implementasi, bukan perubahan tutupan lahan
 *    yang terjadi di lapangan. Jadi kedua tahun lewat jalur yang sama:
 *    klip ke desa, lalu hitung dari geometri.
 *
* 7. PAGINASI ADA PER TAHUN, DAN pageSize-nya BEDA.
 *    maxRecordCount 2020 adalah 1.000, sedangkan 2024 adalah 2.000.
 *    Satu konstanta global akan meminta lebih dari yang server izinkan
 *    pada salah satu tahun, dan server mengabaikannya tanpa error --
 *    hasil yang terpotong tapi terlihat utuh. Jadi pageSize ikut
 *    konfigurasi layer, dan batas 3 halaman dihitung per tahun.
 *
 *    exceededTransferLimit bukan penanda habis di kedua layer. Pada
 *    2024 dengan bbox 13.654 poligon, tiap halaman berisi 2.000 selalu
 *    mengembalikan true, termasuk halaman terakhir yang sudah lengkap;
 *    offset 12.000 mengembalikan 1.654 fitur dengan flag KOSONG, dan
 *    offset 14.000 mengembalikan 0 fitur. Pada 2020 behave-nya sama:
 *    offset 8.000 masih penuh dengan flag true, offset 10.000 sudah 0 fitur.
 *    menentukan habis adalah features.length < pageSize.
 *
 *    MAX_HALAMAN = 3 disengaja. Satu halaman 2024 berisi 2.000 fitur
 *    weighs 12,8 MB dan 37 detik; halaman kedua 17,9 MB dan 69 detik.
 *    Dua tahun berarti paling buruk enam permintaan, dan itu diterima
 *    -- lebih baik beberapa detik lambat daripada menampilkan angka
 *    yang terpotong tanpa disamarkan.
 *
 * Batas desa, cache, dan penghitung luas TIDAK ditulis ulang di sini.
 * Semuanya diambil dari window.GeoTaniLbsLsd supaya tidak ada dua
 * implementasi yang bisa berbeda. Yang ditulis di sini hanya orkestrasi
 * dan presentasi.
 */
(function () {
  'use strict';

  var BN = 'https://gis.bnpb.go.id/server/rest/services/thematic/';

  var REQUEST_TIMEOUT_MS = 45000;
  var MAX_Coba = 3;
  var JEDA_COBA_MS = [2500, 6000];

  var MAX_HALAMAN = 3;

  /* Dua layer, dan hampir semua bedanya ada di sini: pageSize, nama
     field, dan layer ID-nya. Dicampur ke dalam query langsung berarti
     pembaca harus menggali tahu bedanya di mana; disimpan sebagai
     konfigurasi membuat perbedaan itu terlihat tanpa harus menelusuri
     kode.

     pageSize bukan pilihan: 2020 punya maxRecordCount 1.000 dan 2024
     punya 2.000. Server mengabaikan resultRecordCount yang melebihi
     batasnya tanpa error, jadi konstanta global akan menghasilkan data
     terpotong yang terlihat utuh. Verifikasi ke server: 2020 membalas
     true untuk exceededTransferLimit di setiap halaman sampai ke
     6.000, dan 0 fitur di 10.000.

     Field ditulis eksplisit, bukan `*`. Alasannya ada di server: kalau
     outFields disempit ke KELAS_PL saja, balasan berisi
     {"KELAS_PL":"Semak/Belukar"} -- OBJECTID dan ID_Penutu4 tidak ikut
     tanpa error. Dengan `*` ikut Shape_Length, Shape_Area, R, G, B,
     dan di 2020 juga `luas`, yang tidak boleh dipakai (lihat kepala
     file): Shape_Area di kedua layer dalam derajat kuadrat, dan `luas`
     hanya ada di 2020 sehingga memakainya di satu sisi membuat delta
     mencerminkan pilihan implementasi, bukan perubahan di lapangan. */
  var TAHUN = [
    {
      tahun: 2020,
      layer: 'PL_KLHK_2020/MapServer/0',
      pageSize: 1000,
      fieldKelas: 'kelas',
      fieldKode: 'kode_pl',
      outFields: 'kelas,kode_pl'
    },
    {
      tahun: 2024,
      layer: 'PL_KLHK_2024/MapServer/0',
      pageSize: 2000,
      fieldKelas: 'KELAS_PL',
      fieldKode: 'ID_Penutu4',
      outFields: 'KELAS_PL,ID_Penutu4'
    }
  ];
  var TAHUN_AWAL = 2020;
  var TAHUN_AKHIR = 2024;

  /* 22 kelas, warna apa adanya dari symbol.color renderer server:
     [r,g,b,alpha] -> hex. */
  var KELAS = {
    2001:  { nama: 'Hutan Lahan Kering Primer',                 warna: '#006400' },
    2002:  { nama: 'Hutan Lahan Kering Sekunder',               warna: '#228b22' },
    2004:  { nama: 'Hutan Mangrove Primer',                     warna: '#004c2b' },
    2005:  { nama: 'Hutan Rawa Primer',                         warna: '#006b54' },
    2006:  { nama: 'Hutan Tanaman',                             warna: '#7cfc00' },
    2007:  { nama: 'Belukar',                                   warna: '#bdb76b' },
    2010:  { nama: 'Perkebunan',                                warna: '#ffa500' },
    2012:  { nama: 'Permukiman',                                warna: '#cc0000' },
    2014:  { nama: 'Tanah / Lahan Terbuka',                     warna: '#ff00ff' },
    3000:  { nama: 'Savana / Padang Rumput',                    warna: '#f0e68c' },
    5001:  { nama: 'Tubuh / Badan Air',                         warna: '#00bfff' },
    20041: { nama: 'Hutan Mangrove Sekunder',                   warna: '#2e8b57' },
    20051: { nama: 'Hutan Rawa Sekunder',                       warna: '#3cb371' },
    20071: { nama: 'Belukar Rawa',                              warna: '#9acd32' },
    20091: { nama: 'Pertanian Lahan Kering',                    warna: '#fff176' },
    20092: { nama: 'Pertanian Lahan Kering Campur Semak',        warna: '#e6d96a' },
    20093: { nama: 'Sawah',                                     warna: '#00ff7f' },
    20094: { nama: 'Tambak',                                    warna: '#00ced1' },
    20121: { nama: 'Bandara / Pelabuhan',                       warna: '#8b0000' },
    20122: { nama: 'Transmigrasi',                              warna: '#ff6347' },
    20141: { nama: 'Pertambangan',                              warna: '#800000' },
    50011: { nama: 'Rawa',                                      warna: '#87cefa' }
  };
  var WARNA_DEFAULT = '#94a3b8';

  var state = null;
  window._geotaniTutupanData = null;
  var api = null;

  var mapLayer = null;
  var highlightLayer = null;
  var cache = new Map();
  var cacheOrder = [];
  var CACHE_MAX = 8;
  var inFlight = new Map();
  /* Dinaikkan setiap kali pengguna menekan "Reset Polygon". Lihat load(). */
  var generasi = 0;
  var selectedKode = null;

  /* ── dependensi ──
     Sama seperti kartu LSD 12 Provinsi: modul ini berdiri di atas kartu
     LBS & LSD untuk batas desa, cache meta desa, dan penghitung luas.
     Kalau modul itu belum termuat, modul ini tidak punya apa pun untuk
     ditampilkan -- itu dilaporkan, bukan dicoba dengan implementasi
     sendiri yang bisa berbeda diam-diam. */
  function M() { return window.GeoTaniLbsLsd; }

  function butuhDasar() {
    var m = M();
    if (!m || typeof m.clipKeDesa !== 'function' || typeof m.villageMeta !== 'function') {
      throw new Error('Modul LBS & LSD belum dimuat. Muat ulang halaman.');
    }
    return m;
  }

  /* ── kelas dan warna ──
     Yang menjadi kunci adalah kode numerik kelas, bukan nama field yang
     memuatnya. Nama field berbeda antar tahun (kelas di 2020, KELAS_PL di
     2024) dan nama isinya juga berbeda, jadi keduanya tidak bisa jadi
     kunci. Kodenya sama persis di kedua layer, dan lengkap 22 kelas. */
  function kelasUntuk(attrs, config) {
    var a = attrs || {};
    var cfg = config || TAHUN[TAHUN.length - 1];
    var id = a[cfg.fieldKode];
    var info = id === null || id === undefined || id === '' ? null : (KELAS[String(id)] || null);
    /* Nama tampilan SELALU dari KELAS di atas, bukan dari server. Nama
       server berbeda antar tahun -- 2020 "Pertanian Lahan Kering + Semak",
       2024 "Pertanian Lahan Kering Bercampur dgn Semak" -- dan kalau baris
       tabel dibentuk dari sana, satu kelas split jadi dua baris dan
       terlihat seperti dua kelas berbeda. Nama server disimpan terpisah
       karena masih berguna di popup: itu yang tertulis di data asli. */
    var namaServer = a[cfg.fieldKelas] ? String(a[cfg.fieldKelas]).trim() : '';
    var nama = info ? info.nama
      : 'Kelas ' + (id === null || id === undefined ? 'tidak diketahui' : id);
    return {
      id: id === null || id === undefined ? null : id,
      kunci: id === null || id === undefined ? 'lainnya' : String(id),
      nama: nama,
      namaServer: namaServer,
      warna: info ? info.warna : WARNA_DEFAULT,
      dikenal: !!info
    };
  }

  /* Konfigurasi layer berdasarkan tahun. Throwing di sini, bukan diam,
     karena tahun yang tidak dikenal berarti konfigurasi hilang dan query akan
     dikirim dengan field yang salah -- server membalas 200 dengan
     features tanpa atribut yang dibutuhkan, dan hasilnya kelas kosong
     tanpa error. */
  function configTahun(tahun) {
    for (var i = 0; i < TAHUN.length; i++) {
      if (TAHUN[i].tahun === tahun) return TAHUN[i];
    }
    throw new Error('Tahun ' + tahun + ' tidak dikonfigurasi.');
  }

  /* ── url & retry ──
     BNPB mengirim Access-Control-Allow-Origin yang	echo origin, jadi
     request boleh langsung ke gis.bnpb.go.id tanpa CORS worker --
     terbukti dari respons 200 yang membawa header itu. Host gis.bnpb.go.id
     juga sudah ada di allowlist worker kta-cors-proxy, jadi kalau
     kebijakan CORS BNPB berubah masih ada jalan, tapi jalur itu tidak
     dicoba duluan: menyembunyikan penyebab sebenarnya kalau gagal. */
  function url(config, params) {
    var q = Object.keys(params)
      .filter(function (k) { return params[k] !== null && params[k] !== undefined && params[k] !== ''; })
      .map(function (k) { return k + '=' + encodeURIComponent(params[k]); })
      .join('&');
    return BN + config.layer + '/query?' + q;
  }

  function bisaDiulang(err) {
    if (!err) return false;
    /* 400 dari ArcGIS sering datang tanpa pesan dan sementara, jadi
       diulang. 404 tidak: itu kondisi pasti yang tidak akan berubah. */
    if (err.arcgis === 400) return true;
    if (err.status === 404) return false;
    if (err.name === 'AbortError') return true;
    if (/HTTP 5\d\d|Failed to fetch|NetworkError|Load failed/i.test(err.message || '')) return true;
    return false;
  }

  function tidur(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  async function fetchJsonSekali(u) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT_MS);
    try {
      var res = await fetch(u, { signal: ctrl.signal });
      if (!res.ok) {
        var e = new Error('HTTP ' + res.status);
        e.status = res.status;
        throw e;
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchJson(u) {
    var last = null;
    for (var i = 0; i < MAX_Coba; i++) {
      try {
        var j = await fetchJsonSekali(u);
        /* ArcGIS sering membalas HTTP 200 dengan badan error. Kalau ini
           diperlakukan sukses, modul akan mengira layer kosong padahal
           server sedang menolak. */
        if (j && j.error) {
          var e2 = new Error('ArcGIS ' + (j.error.code || '?') + ': ' + (j.error.message || 'tanpa pesan'));
          e2.arcgis = j.error.code || 400;
          throw e2;
        }
        return j;
      } catch (err) {
        last = err;
        if (i < MAX_Coba - 1 && bisaDiulang(err)) {
          var jeda = JEDA_COBA_MS[i] != null ? JEDA_COBA_MS[i] : 8000;
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[Tutupan Lahan] permintaan gagal, mencoba lagi dalam ' + jeda +
              ' ms (percobaan ' + (i + 1) + '/' + MAX_Coba + '):', err && err.message);
          }
          await tidur(jeda);
          continue;
        }
        break;
      }
    }
    if (typeof console !== 'undefined' && console.error) {
      console.error('[Tutupan Lahan] gagal memuat:', last && last.message, last);
    }
    throw last;
  }

  /* ── kueri ──
     Filter spatial pakai envelope, bukan poligon: jalur bbox + intersect
     client-side sudah terbukti dipakai kartu LBS & LSD dan LSD 12 Provinsi,
     dan ArcGIS di sini tidak menerima geometry poligon kompleks pada kolom
     geometry-type polygon tanpa parameter tambahan.

     Konfigurasi layer datang sebagai argumen, bukan dibaca dari konstanta
     global. Itu bukan sekadar gaya: pageSize 2020 (1.000) dan 2024 (2.000)
     berbeda karena server mereka berbeda, dan halaman pertama untuk tahun
     yang salah akan menghasilkan data terpotong tanpa error.

     Berhenti pada features.length < config.pageSize, bukan pada
     exceededTransferLimit. Bandingkan catatan di kepala file: flag itu
     menyala di setiap halaman sampai yang terakhir di kedua layer, dan
     kosong justru ketika OFFSET sudah melewati ujung. Memakainya sebagai
     penentu akan membalik kesimpulan dengan tepat. */
  async function querySemua(envelope, config, options) {
    var cfg = config || configTahun(TAHUN_AKHIR);
    var opts = options || {};
    var onHalaman = typeof opts.onHalaman === 'function' ? opts.onHalaman : null;
    var maksHal = opts.maksHalaman || MAX_HALAMAN;
    var features = [];
    var halaman = 0;
    var habisJaring = false;

    for (var h = 0; h < maksHal; h++) {
      var json = await fetchJson(url(cfg, {
        f: 'json',
        where: '1=1',
        geometry: envelope,
        geometryType: 'esriGeometryEnvelope',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outSR: '4326',
        outFields: cfg.outFields,
        returnGeometry: 'true',
        resultRecordCount: cfg.pageSize,
        resultOffset: h === 0 ? null : h * cfg.pageSize
      }));
      var batch = (json && json.features) || [];
      for (var i = 0; i < batch.length; i++) features.push(batch[i]);
      halaman += 1;
      if (onHalaman) onHalaman(halaman, batch.length);

      /* Batch kosong: OFFSET sudah melewati ujung, jadi tidak ada lagi data.
         Batch lebih kecil dari pageSize juga berarti habis, dan inilah yang
         membedakan "sudah habis" dari "halaman penutup yang kebetulan
         sedikit" -- keduanya terlihat sama dari exceededTransferLimit. */
      if (batch.length === 0) break;
      if (batch.length < cfg.pageSize) break;
      /* Batch penuh dan masih ada ruang: server punya lebih banyak. Kalau
         sudah lewat batas halaman, berhenti dan tandai terpotong -- bukan
         diam-diam menampilkan separuh data. */
      if (h + 1 >= maksHal) habisJaring = true;
    }

    return {
      features: features,
      halaman: halaman,
      /* true kalau berhenti sebelum server kehabisan data. */
      terpotong: habisJaring
    };
  }

  function rememberCache(key, value) {
    cache.set(key, value);
    var i = cacheOrder.indexOf(key);
    if (i >= 0) cacheOrder.splice(i, 1);
    cacheOrder.push(key);
    while (cacheOrder.length > CACHE_MAX) cache.delete(cacheOrder.shift());
  }

  /* ── orkestrasi ──
     Dua layer dimuat berurutan, bukan paralel. Alasannya bukan
    performed: permintaan kedua sering menabrak server yang sama dalam
     hitungan detik, dan 2020 sudah dibuktikan membalas 521 saat diuji
     berulang. Berurutan menambah beberapa detik yang bisa diunik, dengan
     upside server tidak diberi dua beban sekaligus.

     Desa tanpa fitur bukan kegagalan: kedua layer mencakup seluruh
     Indonesia, jadi kondisi kosong jarang, tapi kalau terjadi itu keadaan
     kosong yang harus dijawab, bukan error. */
  function load(kode) {
    if (inFlight.has(kode)) return inFlight.get(kode);
    var gen = generasi;
    var p = (async function () {
      var m = butuhDasar();
      var meta = await m.villageMeta(kode);
      if (!meta || !meta.geojson) throw new Error('Batas desa tidak dapat dimuat. Pilih desa lain atau coba lagi.');
      var box = m.bboxDariRings(meta.rings);
      if (!box) throw new Error('Batas desa tidak dapat dibaca.');

      var perTahun = [];
      for (var t = 0; t < TAHUN.length; t++) {
        var cfg = TAHUN[t];
        var got = await querySemua(box.envelope, cfg);
        perTahun.push(kumpulkanTahun(cfg, got, m, meta));
      }

      if (gen !== generasi) return null;

      state = rangkai(meta, box, perTahun);
      window._geotaniTutupanData = state;
      return state;
    })();
    inFlight.set(kode, p);
    return p.then(function (r) { inFlight.delete(kode); return r; },
      function (e) { inFlight.delete(kode); throw e; });
  }

  /* Menghitung satu tahun: klip setiap poligon ke desa, jumlahkan luas per
     kelas, dan sisakan indeks poligon supaya klik di tabel bisa menyorot
     seluruh poligon milik kelas itu -- bukan satu poligon, karena yang
     diklik pengguna adalah nama kelas, bukan objek tertentu. */
  function kumpulkanTahun(cfg, got, m, meta) {
    var perKelas = {};
    var indeksPerKelas = {};
    var poligon = [];
    var totalIrisan = 0;
    var utuh = 0, terpotong = 0;
    var tidakDikenal = 0;

    for (var f = 0; f < got.features.length; f++) {
      var feat = got.features[f];
      var clipped = m.clipKeDesa(feat, meta.geojson);
      if (!clipped) continue;
      var k = kelasUntuk(feat.attributes, cfg);
      var luas = clipped.luasIrisanHa === null || clipped.luasIrisanHa === undefined ? 0 : clipped.luasIrisanHa;

      if (!perKelas[k.kunci]) {
        perKelas[k.kunci] = {
          kunci: k.kunci,
          id: k.id,
          nama: k.nama,
          warna: k.warna,
          dikenal: k.dikenal,
          ha: 0,
          jumlah: 0
        };
        indeksPerKelas[k.kunci] = [];
      }
      perKelas[k.kunci].ha += luas;
      perKelas[k.kunci].jumlah += 1;
      indeksPerKelas[k.kunci].push(poligon.length);

      poligon.push({
        tahun: cfg.tahun,
        kelas: k,
        luasIrisanHa: luas,
        luasGeometriPenuhHa: clipped.luasGeometriPenuhHa,
        terpotong: clipped.terpotong,
        attrs: feat.attributes,
        geometry: clipped.geometry
      });

      if (clipped.terpotong) terpotong += 1; else utuh += 1;
      totalIrisan += luas;
      if (!k.dikenal) tidakDikenal += 1;
    }

    var kelasList = Object.keys(perKelas).map(function (x) { return perKelas[x]; })
      .sort(function (a, b) { return b.ha - a.ha; });

    return {
      config: cfg,
      tahun: cfg.tahun,
      kelas: kelasList,
      perKelas: perKelas,
      indeksPerKelas: indeksPerKelas,
      poligon: poligon,
      totalIrisanHa: totalIrisan,
      utuh: utuh,
      terpotong: terpotong,
      tidakDikenal: tidakDikenal,
      terpotongQuery: got.terpotong,
      halaman: got.halaman,
      adaData: poligon.length > 0
    };
  }

  /* Menyatukan dua tahun jadi satu baris per kelas.

     Kunci penggabungan adalah kode kelas, yang sama di kedua layer.
     Kelas yang hanya muncul di satu tahun tetap dapat baris dengan delta
     kosong -- menyembunyikannya membuat pengguna menyimpulkan kelas itu
     tidak pernah ada, padahal kemunculan dan hilangnya sebuah kelas
     justru perubahan yang paling penting secara kebijakan. */
  function rangkai(meta, box, perTahun) {
    var desaLuas = meta.luasHa;
    var awal = perTahun[0];
    var akhir = perTahun[perTahun.length - 1];
    var gabung = {};

    for (var t = 0; t < perTahun.length; t++) {
      var th = perTahun[t];
      for (var c = 0; c < th.kelas.length; c++) {
        var k = th.kelas[c];
        if (!gabung[k.kunci]) {
          gabung[k.kunci] = {
            kunci: k.kunci,
            id: k.id,
            nama: k.nama,
            warna: k.warna,
            dikenal: k.dikenal,
            perTahun: {}
          };
        }
        gabung[k.kunci].perTahun[th.tahun] = { ha: k.ha, jumlah: k.jumlah };
      }
    }

    var baris = Object.keys(gabung).map(function (x) { return gabung[x]; });

    /* Total luas terpetakan per tahun. Dipakai sebagai penyebut porsi, dan
       disimpan di state karena grafik dan baris insight membutuhkannya --
       menghitung ulang dari baris akan menjumlahkan kelas yang saling
       tumpang tindih, sehingga totalnya bukan luas terpetakan. */
    var totalAwal = perTahun.length ? perTahun[0].totalIrisanHa : 0;
    var totalAkhir = perTahun.length ? perTahun[perTahun.length - 1].totalIrisanHa : 0;

    baris.forEach(function (b) {
      var haAwal = b.perTahun[TAHUN_AWAL] ? b.perTahun[TAHUN_AWAL].ha : null;
      var haAkhir = b.perTahun[TAHUN_AKHIR] ? b.perTahun[TAHUN_AKHIR].ha : null;
      b.tahunAwal = TAHUN_AWAL;
      b.tahunAkhir = TAHUN_AKHIR;
      b.haAwal = haAwal;
      b.haAkhir = haAkhir;
      /* Tiga kondisi yang dibedakan, karena ketiganya berbeda artinya dan
         tidak boleh tampil sama:

         - ada di kedua tahun: delta dihitung seperti biasa, dan nol berarti
           luasnya sama, yang itu informasi.
         - ada di tahun awal saja: seluruh luasnya hilang, jadi delta
          sama dengan minus luas awal, bukan null. Melihat "–" di baris yang
           sebenarnya kehilangan 40 ha sawah akan membuat pengguna salah
           membaca. Ini kasus yang paling penting secara kebijakan, jadi
           angkanya justru harus paling tegas.
         - ada di tahun akhir saja: kelas baru, belum ada pembandingnya, jadi
           delta null dengan label "hanya di tahun akhir". */
      if (haAwal === null) {
        b.delta = null;
        b.hilang = false;
        b.baruMuncul = haAkhir !== null && haAkhir > 0;
      } else {
        b.delta = (haAkhir || 0) - haAwal;
        b.hilang = (haAkhir === null || haAkhir === 0) && haAwal > 0;
        b.baruMuncul = false;
      }
      /* Persen delta luas terhadap luas desa. Penyebutnya luas desa, bukan
         luas terpetakan, jadi nilainya ikut bergerak ketika luas terpetakan
         berubah antara tahun. Bandingkan dengan deltaPoin di bawah: yang
         ini tidak dipakai di grafik justru karena itu. */
      b.deltaPersen = desaLuas > 0 && b.delta !== null ? (b.delta / desaLuas) * 100 : null;
      b.hanyaSatuTahun = haAwal === null || haAkhir === null;

      /* Porsi terhadap luas terpetakan tahun itu sendiri. Inilah angka yang
         dipakai grafik, bukan delta luas.

         Alasannya diukur, bukan theoretis. Dua layer yang petanya menutup
         area berbeda: untuk bbox yang sama, jumlah Shape_Area 2024 lebih
         besar 24% sampai 87% dari 2020. Itu muncul karena kedua peta
         memotong petak berbeda -- bukan karena lahan berubah. Delta luas
         mentah lalu mewarisi semua ketidakcocokan itu: pada satu bbox uji,
         kelas 2002 (Hutan Lahan Kering Sekunder) naik dari 0,00014 ke
         0,03271 derajat kuadrat, tampak +22.501% padahal yang terjadi
         hanya 2024 menggambar area yang 2020 tidak digambar.

         Porsi menolak itu: setiap tahun dinormalkan ke totalnya sendiri,
         jadi yang dibandingkan adalah komposisi, dan luas yang
         tidak dipetakan di salah satu tahun tidak muncul sebagai
         "pertumbuhan".Trade-offnya, dan itu harus disebut di layar:
         perubahan luas mutlak memang tidak bisa dibaca dari sini. */
      b.porsiAwal = b.perTahun[TAHUN_AWAL] ? proporsi(b.perTahun[TAHUN_AWAL].ha, totalAwal) : null;
      b.porsiAkhir = b.perTahun[TAHUN_AKHIR] ? proporsi(b.perTahun[TAHUN_AKHIR].ha, totalAkhir) : null;
      /* Delta dalam poin persen: selisih dua porsi. Null kalau salah
         satu tahun tidak punya kelas ini, karena "tidak ada" bukan
         "nol persen". */
      b.deltaPoin = (b.porsiAwal === null || b.porsiAkhir === null) ? null : (b.porsiAkhir - b.porsiAwal);
    });

    /* Urutan mengikuti tahun terakhir, jadi baris yang diklik pengguna
       urutannya sama dengan yang mereka lihat di peta (peta selalu
       menampilkan tahun terakhir). */
    baris.sort(function (a, b) { return (b.haAkhir || 0) - (a.haAkhir || 0); });

    /* Peta digambar manual, jadi poligon bisa saling menimpa. Kalau
       penjumlahan irisan melebihi luas desa, angkanya menghitung sebagian
       area lebih dari sekali -- lebih baik ditandai daripada ditampilkan
       sebagai fakta. Persamaan 1.02 sama dengan kartu lain: toleransi
       kecil untuk galat geometri, bukan pembulatan. */
    var lapisTumpangTindih = {};
    for (var y = 0; y < perTahun.length; y++) {
      var th2 = perTahun[y];
      lapisTumpangTindih[th2.tahun] = desaLuas > 0 && th2.totalIrisanHa > desaLuas * 1.02;
    }

    var tidakDikenal = 0;
    var perTahunRingkas = [];
    for (var z = 0; z < perTahun.length; z++) {
      tidakDikenal += perTahun[z].tidakDikenal;
      perTahunRingkas.push({
        tahun: perTahun[z].tahun,
        config: perTahun[z].config,
        totalIrisanHa: perTahun[z].totalIrisanHa,
        utuh: perTahun[z].utuh,
        terpotong: perTahun[z].terpotong,
        tidakDikenal: perTahun[z].tidakDikenal,
        terpotongQuery: perTahun[z].terpotongQuery,
        halaman: perTahun[z].halaman,
        adaData: perTahun[z].adaData,
        tumpangTindih: lapisTumpangTindih[perTahun[z].tahun],
        kelas: perTahun[z].kelas,
        indeksPerKelas: perTahun[z].indeksPerKelas,
        poligon: perTahun[z].poligon
      });
    }

    var adaData = perTahunRingkas.some(function (x) { return x.adaData; });

    return {
      kode: meta.kode || null,
      namaDesa: meta.nama,
      luasDesaHa: desaLuas,
      bbox: box,
      baris: baris,
      perTahun: perTahunRingkas,
      /* Total luas terpetakan per tahun, dipakai grafik sebagai penyebut
         porsi. Disimpan di state supaya penyebutnya sama persis dengan
         yang dipakai rangkai(). */
      totalAwal: totalAwal,
      totalAkhir: totalAkhir,
      /* Layer yang dipetakan di peta selalu tahun terakhir: menampilkan dua
         layer sekaligus akan menutupi yang lebih baru dan membuat delta
         tidak bisa dilihat langsung di peta. */
      tahunPeta: TAHUN_AKHIR,
      tidakDikenal: tidakDikenal,
      adaData: adaData,
      /* Seberapa berbeda luas terpetakan kedua tahun, dalam persen.

         Ini angka yang menentukan seberapa jauh delta luas bisa
         dipercaya. Dekat ke nol berarti kedua peta memotong area yang
         hampir sama, jadi delta luasnya mendekati perubahan sebenarnya;
         jauh dari nol berarti peta tidak sebanding dan yang bisa dibaca
         hanya komposisinya. Diperhitungkan dari luas yang sudah diklip,
         jadi tidak bergantung padabbox. */
      bedaLuasTerpetakan: totalAwal > 0
        ? ((totalAkhir - totalAwal) / totalAwal) * 100
        : null,
      persenTertutup: function () {
        var th3 = perTahunRingkas[perTahunRingkas.length - 1];
        if (!desaLuas || desaLuas <= 0) return null;
        return (th3.totalIrisanHa / desaLuas) * 100;
      }(),
      sumber: 'KLHK via BNPB (PL_KLHK_2020 dan PL_KLHK_2024)'
    };
  }

  /* Tahun yang poligonnya dipetakan. */
  function petaTahun() {
    return TAHUN_AKHIR;
  }

  /* Poligon satu tahun tertentu, untuk digambar dan disorot. */
  function poligonTahun(tahun) {
    if (!state) return [];
    var th = state.perTahun[state.perTahun.length - 1];
    for (var i = 0; i < state.perTahun.length; i++) {
      if (state.perTahun[i].tahun === tahun) { th = state.perTahun[i]; break; }
    }
    return th ? th.poligon : [];
  }

  function indeksTahun(tahun) {
    if (!state) return {};
    var th = state.perTahun[state.perTahun.length - 1];
    for (var i = 0; i < state.perTahun.length; i++) {
      if (state.perTahun[i].tahun === tahun) { th = state.perTahun[i]; break; }
    }
    return th ? th.indeksPerKelas : {};
  }

  /* ── proporsi ──
     Porsi satu kelas terhadap luas terpetakan tahun itu sendiri.

     Penyebutnya total yang sudah ada di state, bukan penjumlahan ulang
     baris: kelas bisa saling tumpang tindih, jadi penjumlahan baris
     tidak sama dengan luas terpetakan, dan memakai yang salah membuat
     porsi tidak berjumlah 100% tanpa error. */
  function proporsi(ha, total) {
    if (ha === null || ha === undefined) return null;
    if (!total || total <= 0) return null;
    return (ha / total) * 100;
  }

  /* ── kredit ──
     Ketentuan penggunaan data KLHK mewajibkan menyebut lembaga pemberi
     data dan tautan ke sumber aslinya, sama seperti BIG dan ATR/BPN. */
  var credit = {
    lembaga: 'Kementerian Lingkungan Hidup dan Kehutanan (KLHK), melalui BNPB',
    judul: 'Peta Tutupan Lahan 2020 dan 2024, layanan PL_KLHK_2020 dan PL_KLHK_2024',
    periode: 'Tahun 2020 dan 2024',
    tautan: 'https://gis.bnpb.go.id/server/rest/services/thematic/PL_KLHK_2024/MapServer'
  };

  function creditTanggalAkses() {
    return new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function creditHtml() {
    return '<div class="geotani-lbslsd-credit">' +
      '<b>Sumber data:</b> ' + escapeHtml(credit.judul) + ' &mdash; ' + escapeHtml(credit.lembaga) + '. ' +
      'Diakses pada ' + creditTanggalAkses() + '. ' +
      '<a href="' + escapeHtml(credit.tautan) + '" target="_blank" rel="noopener noreferrer">Tautan langsung</a>' +
      '</div>';
  }

  function creditText() {
    return credit.judul + ' - ' + credit.lembaga + '. Diakses pada ' +
      creditTanggalAkses() + '. ' + credit.tautan;
  }

  /* ── peta ── */
  function clearMap() {
    if (mapLayer && window.map && window.map.hasLayer(mapLayer)) window.map.removeLayer(mapLayer);
    if (highlightLayer && window.map && window.map.hasLayer(highlightLayer)) window.map.removeLayer(highlightLayer);
    mapLayer = null;
    highlightLayer = null;
  }

  function gambarLayer(items) {
    var group = window.L.featureGroup();
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var poly = window.L.geoJSON(it.geometry, {
        style: { color: '#334155', weight: 0.8, opacity: 0.55, fillColor: it.kelas.warna, fillOpacity: 0.7 }
      });
      poly.bindPopup(popupHtml(it));
      group.addLayer(poly);
    }
    group.addTo(window.map);
    return group;
  }

  /* Popup menunjukkan luas di kedua tahun sekaligus, bukan cuma tahun yang
     dipetakan. Karena yang dipetakan selalu tahun terakhir, popup yang
     hanya menampilkan 2024 membuat pengguna mencari angka 2020 di tempat
     lain -- padahal delta untuk petak itu sudah diketahui di sini. */
  function popupHtml(it) {
    var a = it.attrs || {};
    var baris = '';
    function tambah(label, nilai) {
      baris += '<div class="geotani-sls-popup-row"><span>' + escapeHtml(label) +
        '</span><b>' + escapeHtml(nilai) + '</b></div>';
    }
    tambah('Kelas tutupan', it.kelas.nama);
    tambah('Luas di desa', fmtLuas(it.luasIrisanHa));
    if (it.kelas.id !== null) tambah('Kode kelas', String(it.kelas.id));

    /* Nama server ditampilkan apa adanya, karena itu yang tertulis di data
       asli dan nama itu berbeda antar tahun -- berguna saat pengguna perlu
       mencocokkan dengan tabel atribut BNPB sendiri. */
    if (it.kelas.namaServer) tambah('Nama di layer ' + it.tahun, it.kelas.namaServer);

    var pembanding = bandingkanKelas(it.kelas.kunci, it.tahun);
    if (pembanding && pembanding.lawan !== null && pembanding.lawan !== undefined) {
      tambah('Luas ' + TAHUN_AWAL, fmtLuas(pembanding.lawan));
      tambah('Perubahan', (pembanding.delta > 0 ? '+' : '') + fmtLuas(pembanding.delta));
    } else {
      tambah('Luas ' + TAHUN_AWAL, 'tidak ada kelas ini');
    }

    if (!it.kelas.dikenal) {
      baris += '<div class="geotani-sls-popup-row"><span>Status</span><b>kelas di luar daftar 2024</b></div>';
    }
    return '<div class="geotani-sls-popup">' +
      '<div class="geotani-sls-popup-title">' + escapeHtml(it.kelas.nama) + '</div>' +
      baris +
      (it.terpotong ? '<div class="geotani-sls-popup-row"><span>Status</span><b>terpotong batas desa</b></div>' : '') +
      '</div>';
  }

  /* Baris tabel untuk satu kunci kelas, dipakai popup agar tidak
     menghitung ulang penggabungan dua tahun. */
  function bandingkanKelas(kunci) {
    if (!state) return null;
    for (var i = 0; i < state.baris.length; i++) {
      if (String(state.baris[i].kunci) === String(kunci)) {
        var b = state.baris[i];
        var dari = b.perTahun[TAHUN_AWAL];
        var ke = b.perTahun[TAHUN_AKHIR];
        return {
          delta: b.delta,
          /* Tahun lain dari yang dipetakan, supaya popup menunjukkan
             perbandingan terhadap tahun yang bukan isinya sendiri. */
          lawan: dari ? dari.ha : (ke ? ke.ha : null)
        };
      }
    }
    return null;
  }

  function drawOnMap(options) {
    clearMap();
    if (!state || !window.L || !window.map) return false;
    var opts = options || {};
    var tampil = opts.tahun || state.tahunPeta;
    var poligon = poligonTahun(tampil);
    if (poligon.length) mapLayer = gambarLayer(poligon);
    zoomKeDesa(opts);
    return true;
  }

  /* Pad dan maxZoom mengikuti kartu LBS & LSD dan LSD 12 Provinsi: dua
     analisis yang berdampingan harus bergerak kamera dengan cara yang
     sama, kalau tidak keduanya terasa berasal dari dua aplikasi berbeda. */
  function zoomKeDesa(options) {
    var opts = options || {};
    if (!state || !window.map || !window.L) return false;
    if (opts.flyTo === false) return false;
    if (!state.bbox) return false;
    var b = state.bbox;
    window.map.flyToBounds(
      window.L.latLngBounds([[b.south, b.west], [b.north, b.east]]).pad(0.08),
      { maxZoom: 17, duration: opts.duration === undefined ? 0.8 : opts.duration }
    );
    return true;
  }

  /* Menyorot satu poligon pada tahun tertentu. Indeks bersifat per tahun,
     jadi tahun ikut diterima supaya indeks dari tahun yang salah tidak
     dipakai untuk menunjuk poligon tahun lain. */
  function highlight(index, tahun) {
    if (!state || !window.L || !window.map) return false;
    var th = tahun || state.tahunPeta;
    var it = poligonTahun(th)[Number(index)];
    if (!it) return false;
    if (highlightLayer && window.map.hasLayer(highlightLayer)) window.map.removeLayer(highlightLayer);
    highlightLayer = window.L.geoJSON(it.geometry, {
      style: { color: '#f59e0b', weight: 2.6, opacity: 1, fillColor: '#fbbf24', fillOpacity: 0.4 }
    }).addTo(window.map);
    return true;
  }

  /* Menyorot seluruh kelas pada tahun tertentu. Tabel menampilkan satu
     baris per kelas, jadi yang diklik pengguna adalah nama kelas;
     menyorot satu poligon saja akan terlihat seperti baris itu cuma
     berisi satu petak. */
  function highlightKelas(kunci, tahun) {
    if (!state || !window.L || !window.map) return false;
    var th = tahun || state.tahunPeta;
    var idx = indeksTahun(th)[String(kunci)];
    if (!idx || !idx.length) return false;
    if (highlightLayer && window.map.hasLayer(highlightLayer)) window.map.removeLayer(highlightLayer);
    var poligon = poligonTahun(th);
    var group = window.L.featureGroup();
    var warna = '#f59e0b';
    for (var c = 0; c < state.baris.length; c++) {
      if (String(state.baris[c].kunci) === String(kunci)) { warna = state.baris[c].warna; break; }
    }
    for (var i = 0; i < idx.length; i++) {
      var it = poligon[idx[i]];
      if (!it) continue;
      group.addLayer(window.L.geoJSON(it.geometry, {
        style: { color: '#f59e0b', weight: 2.2, opacity: 1, fillColor: warna, fillOpacity: 0.85 }
      }).addTo(window.map));
    }
    highlightLayer = group;
    return true;
  }

  function clear() {
    state = null;
    window._geotaniTutupanData = null;
    clearMap();
  }

  /* Tombol "Reset Polygon". clear() saja tidak cukup: ia hanya mengosongkan
     state, layer peta, dan window._geotaniTutupanData. Tanpa ini, tabel
     hasil dan input pencarian masih menampilkan desa yang sudah dilepas
     dari peta, sehingga layar terlihat seperti data masih termuat. */
  function reset() {
    generasi += 1;
    clear();
    inFlight.clear();
    setSelectedKode(null, null);
    var input = document.getElementById('geotaniTutupanVillageSearch');
    var results = document.getElementById('geotaniTutupanVillageResults');
    var out = document.getElementById('geotani-tutupan-output');
    var status = document.getElementById('geotani-tutupan-status');
    var btn = document.getElementById('geotani-tutupan-load');
    if (input) input.value = '';
    if (results) { results.hidden = true; results.innerHTML = ''; }
    if (out) out.innerHTML = '';
    if (status) status.textContent = '';
    if (btn) btn.disabled = false;
  }

  function getState() { return state; }

  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtLuas(ha) {
    if (ha === null || ha === undefined) return 'tidak tersedia';
    return ha.toLocaleString('id-ID', { maximumFractionDigits: 3 }) + ' ha';
  }

  /* Persen selalu terhadap luas desa, bukan terhadap luas terpetakan.
     Kalau terhadap luas terpetakan, setiap kolom selalu berjumlah 100%
     dan menutupi fakta yang lebih penting: ada desa yang tutupannya
     tidak sampai seluruh luas desa. */
  function fmtPersen(nilai) {
    if (nilai === null || nilai === undefined || !isFinite(nilai)) return '–';
    return nilai.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%';
  }

  function persenDariDesa(ha) {
    if (state.luasDesaHa === null || state.luasDesaHa === undefined || state.luasDesaHa <= 0) return null;
    return (ha / state.luasDesaHa) * 100;
  }

/* Persen perubahan terhadap luas desa. Berbeda dari deltaPoin, penyebutnya
     luas desa -- bukan luas terpetakan -- jadi ikut bergerak ketika luas
     terpetakan berubah antara tahun. Karena itu dipakai di kolom delta luas
     pada tabel utama, di mana pembaca sudah melihat kedua luas tahun.
     Tidak dipakai di grafik: grafik sengaja hanya memplot porsi terhadap
     luas terpetakan, karena itu satu-satunya yang comparable saat kedua
     peta memotong area berbeda. */

  /* Tanda plus atau minus untuk delta. Tanda eksplisit bukan estetika:
     kolom perubahan tanpa tanda "+" membuat +3 ha dan -3 ha terlihat
     sama di glance, dan arah perubahan justru yang paling penting. */
  function fmtDelta(ha) {
    if (ha === null || ha === undefined || !isFinite(ha)) return '–';
    var t = (ha > 0 ? '+' : '') + ha.toLocaleString('id-ID', { maximumFractionDigits: 3 }) + ' ha';
    return t;
  }

  function kelasDelta(delta) {
    if (delta === null || delta === undefined || !isFinite(delta)) return '';
    if (Math.abs(delta) < 0.001) return 'geotani-tutupan-delta--nol';
    return delta > 0 ? 'geotani-tutupan-delta--naik' : 'geotani-tutupan-delta--turun';
  }

  /* Kepala tabel dibuat dari <table> sungguhan, bukan dari daftar <ul>
     dengan label di atas. Yang membuat pengguna bingung adalah tiga
     kolom angka tanpa judul -- "12,4 ha" di kolom kedua bisa berarti 2020
     atau 2024, dan yang salah baca delta-nya salah arah. Judul kolom harus
     melekat pada kolomnya, bukan ditulis sekali di kaki tabel.

     Tabel juga tidak memakai max-height: daftar kelas bisa 22 baris, dan
     menggulir di dalam daftar yang sudah ada daftar lain di atasnya
     membuat panel terasa sempit tanpa menambah informasi. Baris tabel ini
     pendek, jadi seluruhnya muat tanpa perlu digulir. */
  function barisKelas() {
    if (!state.baris.length) return '';
    var h = '<div class="geotani-lbslsd-layer">';
    h += '<div class="geotani-lbslsd-layer-head">' +
      '<span class="geotani-lbslsd-swatch" style="background:' + escapeHtml(state.baris[0].warna) + '"></span>' +
      'Perubahan ' + TAHUN_AWAL + ' &rarr; ' + TAHUN_AKHIR + ' <b>' + state.baris.length + '</b> kelas</div>';
    h += '<div class="geotani-lbslsd-sub">Luas dihitung dari irisan dengan batas desa pada ' +
      'kedua tahun, jadi dapat dibandingkan langsung. Klik baris untuk menyorot ' +
      'poligon kelas itu di peta (tahun ' + state.tahunPeta + ').</div>';
    h += '<table class="geotani-tutupan-tabel">';
    h += '<thead><tr>' +
      '<th scope="col">Kelas tutupan</th>' +
      '<th scope="col" class="geotani-tutupan-ha">' + TAHUN_AWAL + '</th>' +
      '<th scope="col" class="geotani-tutupan-ha">' + TAHUN_AKHIR + '</th>' +
      '<th scope="col" class="geotani-tutupan-delta">Perubahan</th>' +
      '</tr></thead><tbody>';
    for (var i = 0; i < state.baris.length; i++) {
      var k = state.baris[i];
      h += '<tr data-tutupan-kelas="' + escapeHtml(k.kunci) + '" data-tutupan-tahun="' + state.tahunPeta + '"' +
        (k.dikenal ? '' : ' title="Kelas ini tidak ada di daftar 2024; warnanya hanya penanda."') + '>' +
        '<th scope="row">' +
        '<span class="geotani-lbslsd-swatch" style="background:' + escapeHtml(k.warna) + '"></span>' +
        '<span class="geotani-sls-name">' + escapeHtml(k.nama) +
        (k.dikenal ? '' : ' <i>(di luar daftar)</i>') +
        (k.hilang ? ' <i>(hilang total)</i>' : '') +
        (k.baruMuncul ? ' <i>(baru di ' + TAHUN_AKHIR + ')</i>' : '') +
        '</span></th>' +
        '<td class="geotani-tutupan-ha">' + fmtLuas(k.haAwal) + '</td>' +
        '<td class="geotani-tutupan-ha">' + fmtLuas(k.haAkhir) + '</td>' +
        '<td class="geotani-tutupan-delta ' + kelasDelta(k.delta) + '">' + fmtDelta(k.delta) + '</td>' +
        '</tr>';
    }
    h += '</tbody></table>';
    h += '</div>';
    return h;
  }

  /* ── proporsi kelas ──
     Porsi tiap kelas terhadap luas terpetakan tahun itu sendiri.

     Ini yang membuat grafik bisa dipercaya, dan alasannya terukur: dua
     peta yang sama tidak memotong area yang sama. Jumlah Shape_Area 2024
     pada bbox yang sama lebih besar 24% sampai 87% dari 2020, jadi
     delta luas mentah mewarisi seluruh ketidakcocokan itu. Pada satu
     bbox uji, kelas 2002 tampak naik +22.501% padahal yang berbeda hanya
     2024 menggambar area yang 2020 tidak. Porsi menolak itu: setiap
     tahun dinormalkan ke totalnya sendiri, jadi yang dibandingkan adalah
     komposisi.

     Trade-offnya harus disebut di layar, bukan disembunyikan di sini:
     perubahan luas mutlak tidak bisa dibaca dari grafik ini. Kalau kedua
     peta memang sebanding (beda luas kecil), delta luasnya mendekati
     perubahan sebenarnya -- dan besarnya selisih itu ikut ditulis. */
  function komposisi(tahun) {
    var th = null;
    for (var i = 0; i < state.perTahun.length; i++) {
      if (state.perTahun[i].tahun === tahun) { th = state.perTahun[i]; break; }
    }
    if (!th) return [];
    var total = th.totalIrisanHa;
    if (!total || total <= 0) return [];
    var out = [];
    for (var c = 0; c < th.kelas.length; c++) {
      var k = th.kelas[c];
      out.push({
        kunci: k.kunci,
        nama: k.nama,
        warna: k.warna,
        persen: proporsi(k.ha, total),
        ha: k.ha
      });
    }
    out.sort(function (a, b) { return b.persen - a.persen; });
    return out;
  }

  /* Porsi kelas terhadap luas desa, untuk tabel kedua. */
  function barisPersen() {
    var yangBisa = state.baris.filter(function (b) { return b.deltaPoin !== null; });
    if (!yangBisa.length) return '';
    var h = '<div class="geotani-lbslsd-layer">';
    h += '<div class="geotani-lbslsd-layer-head">Porsi tiap kelas dari luas terpetakan</div>';
    h += '<div class="geotani-lbslsd-sub">Setiap tahun dinormalkan ke totalnya, jadi yang dibandingkan ' +
      'adalah komposisi dan bukan luas mutlak. Kalau kedua peta memotong area yang berbeda besar, ' +
      'perubahan luas ha tidak terlihat di sini.</div>';
    h += '<table class="geotani-tutupan-tabel">';
    h += '<thead><tr>' +
      '<th scope="col">Kelas tutupan</th>' +
      '<th scope="col" class="geotani-tutupan-ha">' + TAHUN_AWAL + '</th>' +
      '<th scope="col" class="geotani-tutupan-ha">' + TAHUN_AKHIR + '</th>' +
      '<th scope="col" class="geotani-tutupan-delta">Selisih</th>' +
      '</tr></thead><tbody>';
    for (var i = 0; i < yangBisa.length; i++) {
      var k = yangBisa[i];
      h += '<tr>' +
        '<th scope="row">' +
        '<span class="geotani-lbslsd-swatch" style="background:' + escapeHtml(k.warna) + '"></span>' +
        '<span class="geotani-sls-name">' + escapeHtml(k.nama) + '</span></th>' +
        '<td class="geotani-tutupan-ha">' + fmtPersen(k.porsiAwal) + '</td>' +
        '<td class="geotani-tutupan-ha">' + fmtPersen(k.porsiAkhir) + '</td>' +
        '<td class="geotani-tutupan-delta ' + kelasDelta(k.deltaPoin) + '">' +
        (k.deltaPoin > 0 ? '+' : '') + fmtPersen(k.deltaPoin) + '</td>' +
        '</tr>';
    }
    h += '</tbody></table></div>';
    return h;
  }

  /* ── grafik ──
   Dua grafik SVG yang dibuat sendiri, bukan Chart.js.

   Alasannya bukan ukuran file. Yang digambar di sini perlu warna per
   kelas yang PERSIS sama dengan warna di peta dan di tabel, batang yang
   tumbuh dari sumbu nol di tengah, dan dua lingkaran yang bisa
   dibandingkan berdampingan. Chain.js tidak punya jalan singkat untuk
   ketiga hal itu tanpa banyak konfigurasi, sedangkan pola SVG-nya sudah
   dipakai kartu GeoFarm untuk grafik trennya -- jadi satu pola, satu
   tempat yang harus-care.

   Bentuknya dipilih supaya tidak ada yang perlu digulir: tinggi setiap
   grafik dihitung dari jumlah batangnya, bukan dibatasi. Daftar kelas
   bisa 22 baris, dan grafik yang menutupi sebagian kelasnya tanpa
   memberi tahu sama saja dengan menyembunyikan data.

   Skala batang mengikuti delta terbesar yang ada. Kalau semua delta kecil
   tapi dibesar-skala dengan tetap memakai angka tetap, perubahan yang
   nyata terlihat seperti noise. */

  var GRAFIK_W = 288;

  /* ── grafik 1: batang berubahAGN ──
     Delta dalam poin persen, batang ke kanan atau ke kiri dari sumbu nol
     di tengah. Urutan dari perubahan terbesar, karena itu yang dicari
     orang: kelas mana yang berubah paling banyak. */
  function grafikDeltaPoin() {
    /* Hanya kelas yang ada di kedua tahun. Kelas yang hilang atau baru
       muncul tidak punya delta yang bisa diplot -- nilainya bukan nol,
       tapi tidak terdefinisi -- jadi mereka dilaporkan di baris insight,
       bukan dipaksa jadi batang. */
    var data = state.baris.filter(function (b) {
      return b.deltaPoin !== null && Math.abs(b.deltaPoin) >= 0.05;
    });
    if (!data.length) return '';

    data.sort(function (a, b) { return Math.abs(b.deltaPoin) - Math.abs(a.deltaPoin); });
    var pungsen = data.slice(0, 8);
    var sisa = data.slice(8);

    var maks = 0;
    for (var i = 0; i < pungsen.length; i++) {
      maks = Math.max(maks, Math.abs(pungsen[i].deltaPoin));
    }
    if (maks <= 0) return '';

    var baris = pungsen.length + sisa.length;
    var barisTinggi = 13;
    var pad = { top: 13, right: 40, bottom: 15, left: 40 };
    var tinggi = pad.top + baris * barisTinggi + pad.bottom;
    var lebarPlot = GRAFIK_W - pad.left - pad.right;
    var tengah = pad.left + lebarPlot / 2;
    /* Setengah lebar plot dipakai per satuan poin persen, jadi batang
       terpanjang menyentuh tepi plot dan tidak menabrak label. */
    var perPoin = (lebarPlot / 2) / maks;

    var p = [];
    p.push('<svg class="gt-grafik" viewBox="0 0 ' + GRAFIK_W + ' ' + tinggi +
      '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Grafik perubahan porsi tiap kelas tutupan lahan antara ' +
      TAHUN_AWAL + ' dan ' + TAHUN_AKHIR + '">' +
      '<line class="gt-grafik-grid" x1="' + pad.left + '" y1="' + pad.top +
      '" x2="' + GRAFIK_W + '" y2="' + pad.top + '"/>' +
      '<text class="gt-grafik-ax" x="' + tengah + '" y="' + (pad.top - 4) + '" text-anchor="middle">0</text>');

    for (var j = 0; j < pungsen.length; j++) {
      var b = pungsen[j];
      var y = pad.top + j * barisTinggi + 2.5;
      var lebar = Math.abs(b.deltaPoin) * perPoin;
      var x = b.deltaPoin >= 0 ? tengah : tengah - lebar;
      var kelasB = b.deltaPoin > 0 ? 'gt-grafik-bar--naik' : 'gt-grafik-bar--turun';
      p.push('<text class="gt-grafik-kelas" x="' + (pad.left - 5) + '" y="' + (y + 6) +
        '" text-anchor="end">' + escapeHtml(potongNama(b.nama, 11)) + '</text>');
      p.push('<rect class="gt-grafik-bar ' + kelasB + '" x="' + x.toFixed(1) + '" y="' +
        y.toFixed(1) + '" width="' + lebar.toFixed(1) + '" height="8" rx="1.5"' +
        '><title>' + escapeHtml(b.nama) + ': ' + fmtPersen(b.porsiAwal) + ' → ' +
        fmtPersen(b.porsiAkhir) + ' (' + (b.deltaPoin > 0 ? '+' : '') +
        b.deltaPoin.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' poin)</title></rect>');
      p.push('<text class="gt-grafik-nilai ' + kelasB + '" x="' + (GRAFIK_W - pad.right + 4) +
        '" y="' + (y + 6) + '">' + (b.deltaPoin > 0 ? '+' : '') +
        b.deltaPoin.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '</text>');
    }

    if (sisa.length) {
      var ySisa = pad.top + pungsen.length * barisTinggi + 2.5;
      var jumlah = sisa.reduce(function (a, b) { return a + b.deltaPoin; }, 0);
      var xSisa = jumlah >= 0 ? tengah : tengah - Math.abs(jumlah) * perPoin;
      p.push('<text class="gt-grafik-kelas" x="' + (pad.left - 5) + '" y="' + (ySisa + 6) +
        '" text-anchor="end">' + sisa.length + ' kelas</text>');
      p.push('<rect class="gt-grafik-bar gt-grafik-bar--lainnya" x="' + xSisa.toFixed(1) +
        '" y="' + ySisa.toFixed(1) + '" width="' + (Math.abs(jumlah) * perPoin).toFixed(1) +
        '" height="8" rx="1.5"><title>' + sisa.length + ' kelas lain, jumlah ' +
        (jumlah > 0 ? '+' : '') + jumlah.toLocaleString('id-ID', { maximumFractionDigits: 1 }) +
        ' poin</title></rect>');
      p.push('<text class="gt-grafik-nilai gt-grafik-bar--lainnya" x="' + (GRAFIK_W - pad.right + 4) +
        '" y="' + (ySisa + 6) + '">' + (jumlah > 0 ? '+' : '') +
        jumlah.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '</text>');
    }

    p.push('<text class="gt-grafik-ax" x="' + pad.left + '" y="' + (tinggi - 4) + '">turun</text>');
    p.push('<text class="gt-grafik-ax" x="' + (GRAFIK_W - pad.right) + '" y="' + (tinggi - 4) +
      '" text-anchor="end">naik</text>');
    p.push('<text class="gt-grafik-ax" x="' + tengah + '" y="' + (tinggi - 4) +
      '" text-anchor="middle">poin persen</text>');
    p.push('</svg>');
    return p.join('');
  }

  /* ── grafik 2: dua lingkaran komposisi ──
     Sebelas persen kelas sawah dan empat puluh persen lahan kering jauh
     lebih cepat terbaca sebagai sudut busur dan luas warna daripada
     sebagai angka di tabel. Dua lingkaran, satu per tahun, berdampingan
     supaya perbandingannya langsung. */
  function grafikKomposisi() {
    var a = komposisi(TAHUN_AWAL);
    var b = komposisi(TAHUN_AKHIR);
    if (!a.length || !b.length) return '';

    /* Tampilkan maksimal tujuh irisan per lingkaran, sisanya digabung
       sebagai "lainnya". Tanpa batas, satu desa dengan 22 kelas akan
       menghasilkan 44 irisan dan lingkaran yang hanya garis-garis tipis
       yang mustahil dibaca. Irisan kecil digabung karena totalnya kecil
       juga, dan hasilnya di legenda. */
    var iris = [];
    for (var i = 0; i < a.length; i++) iris.push({ kunci: a[i].kunci, nama: a[i].nama, warna: a[i].warna });
    for (var j = 0; j < b.length; j++) {
      var ada = iris.some(function (x) { return x.kunci === b[j].kunci; });
      if (!ada) iris.push({ kunci: b[j].kunci, nama: b[j].nama, warna: b[j].warna });
    }
    /* Urut irisan legendanya ikut yang paling besar di kedua tahun, supaya
       warna yang paling sering dilihat ada di urutan atas legenda. */
    function bobot(kunci) {
      var tot = 0;
      for (var i = 0; i < a.length; i++) if (a[i].kunci === kunci) tot += a[i].persen;
      for (var j = 0; j < b.length; j++) if (b[j].kunci === kunci) tot += b[j].persen;
      return tot;
    }
    iris.sort(function (x, y) { return bobot(y.kunci) - bobot(x.kunci); });

    /* Irisan dipangkas jadi tujuh per lingkaran, sisanya digabung sebagai
       "Lainnya" dan diberi nama yang menyebut jumlahnya -- jadi legenda
       tidak diam-diam menutup kelas yang ada.

       Sisa yang digabung dijumlahkan sebagai persen, bukan luas, lalu
       dinormalkan ulang ke 100%. Tanpa itu, lingkaran kedua bisa
       tidak menutup 360 derajat karena penjumlahan persen tidak persis
       100 (pembulatan per kelas), dan irisannya terlihat bergeser. */
    function potong(data) {
      var out = data.slice(0, 7).map(function (k) {
        return { kunci: k.kunci, nama: k.nama, warna: k.warna, persen: k.persen };
      });
      var sisa = data.slice(7);
      if (!sisa.length) return out;
      var sisaPersen = sisa.reduce(function (a, k) { return a + k.persen; }, 0);
      if (sisaPersen <= 0.05) return out;
      out.push({
        kunci: '__lainnya',
        nama: 'Lainnya (' + sisa.length + ')',
        warna: WARNA_DEFAULT,
        persen: sisaPersen
      });
      var total = out.reduce(function (a, k) { return a + k.persen; }, 0);
      if (total > 0) {
        for (var i = 0; i < out.length; i++) out[i].persen = (out[i].persen / total) * 100;
      }
      return out;
    }
    var pa = potong(a);
    var pb = potong(b);

    var R = 46;
    var lebar = 288;
    var tinggi = 116;
    var cxA = 76;
    var cxB = lebar - 76;
    var cy = 52;

    function lingkaran(cx, data) {
      var seg = [];
      var sudut = -Math.PI / 2;
      for (var i = 0; i < data.length; i++) {
        var k = data[i];
        var sudut2 = sudut + (k.persen / 100) * Math.PI * 2;
        /* Busur butuh dua busur: satu untuk irisan lebih besar dari
           setengah lingkaran, satu untuk yang lebih kecil. Tanpa itu,
           busur yang panjang lebih dari 180 derajat digambar lewat jalan
           pendek dan irisannya terbalik. */
        var besar = k.persen > 50;
        var d = 'M' + cx.toFixed(1) + ' ' + cy.toFixed(1) +
          'L' + (cx + R * Math.cos(sudut)).toFixed(2) + ' ' + (cy + R * Math.sin(sudut)).toFixed(2) +
          'A' + R + ' ' + R + ' 0 ' + (besar ? 1 : 0) + ' 1 ' +
          (cx + R * Math.cos(sudut2)).toFixed(2) + ' ' + (cy + R * Math.sin(sudut2)).toFixed(2) +
          'Z';
        seg.push('<path class="gt-grafik-iris" d="' + d + '" fill="' + escapeHtml(k.warna) +
          '"><title>' + escapeHtml(k.nama) + ' ' + TAHUN_AWAL + ': ' + fmtPersen(k.persen) + '</title></path>');
        sudut = sudut2;
      }
      seg.push('<circle class="gt-grafik-lingkar" cx="' + cx + '" cy="' + cy + '" r="' + R + '"/>');
      return seg.join('');
    }

    var p = [];
    p.push('<svg class="gt-grafik" viewBox="0 0 ' + lebar + ' ' + tinggi +
      '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Komposisi tutupan lahan ' +
      TAHUN_AWAL + ' dan ' + TAHUN_AKHIR + '">' +
      lingkaran(cxA, pa) + lingkaran(cxB, pb));
    var utamaA = pa[0];
    var utamaB = pb[0];
    p.push('<text class="gt-grafik-donat" x="' + cxA + '" y="' + (cy - 2) + '" text-anchor="middle">' +
      Math.round(utamaA.persen) + '%</text>');
    p.push('<text class="gt-grafik-donat" x="' + cxA + '" y="' + (cy + 7) + '" text-anchor="middle">' +
      escapeHtml(potongNama(utamaA.nama, 8)) + '</text>');
    p.push('<text class="gt-grafik-donat" x="' + cxB + '" y="' + (cy - 2) + '" text-anchor="middle">' +
      Math.round(utamaB.persen) + '%</text>');
    p.push('<text class="gt-grafik-donat" x="' + cxB + '" y="' + (cy + 7) + '" text-anchor="middle">' +
      escapeHtml(potongNama(utamaB.nama, 8)) + '</text>');
    p.push('<text class="gt-grafik-ax" x="' + cxA + '" y="' + (cy + R + 13) + '" text-anchor="middle">' +
      TAHUN_AWAL + '</text>');
    p.push('<text class="gt-grafik-ax" x="' + cxB + '" y="' + (cy + R + 13) + '" text-anchor="middle">' +
      TAHUN_AKHIR + '</text>');
    p.push('</svg>');
    return p.join('');
  }

  /* Legenda satu baris per kelas yang muncul di kedua lingkaran, jadi
     warna di grafik bisa dibaca tanpa harus melacak mouse. */
  function legendaKomposisi() {
    var a = komposisi(TAHUN_AWAL);
    var b = komposisi(TAHUN_AKHIR);
    if (!a.length || !b.length) return '';
    var semua = {};
    var i;
    for (i = 0; i < a.length; i++) semua[a[i].kunci] = a[i];
    for (i = 0; i < b.length; i++) if (!semua[b[i].kunci]) semua[b[i].kunci] = b[i];
    var list = Object.keys(semua).map(function (k) { return semua[k]; });
    list.sort(function (x, y) {
      return (y.persen || 0) - (x.persen || 0);
    });

    var h = '<div class="gt-legenda">';
    for (var c = 0; c < list.length; c++) {
      h += '<span class="gt-legenda-item"><i style="background:' +
        escapeHtml(list[c].warna) + '"></i>' + escapeHtml(potongNama(list[c].nama, 22)) + '</span>';
    }
    h += '</div>';
    return h;
  }

  /* Nama dipotong agar tabel dan grafik tidak melebar. Dipotong di
     batas kata kalau mungkin, supaya "Hutan Lahan Kering Primer"
     menjadi "Hutan Lahan K..." dan bukan "Hutan Lahan Ke...". */
  function potongNama(nama, maks) {
    var s = String(nama || '');
    if (s.length <= maks) return s;
    var potong = s.slice(0, maks - 3);
    var spasi = potong.lastIndexOf(' ');
    if (spasi > maks * 0.55) potong = potong.slice(0, spasi);
    return potong.replace(/[\s,\/]+$/, '') + '...';
  }

  /* ── insight ──
     Tiga kalimat yang paling sering dicari orang dari tabel 22 baris:
     kelas apa yang paling banyak berubah, kelas mana yang hilang, dan
     apakah kedua peta bisa dibandingkan sama sekali.

     Setiap kalimat menyertakan syaratnya. Kalimat tanpa syarat
     ("lahan hutan berkurang 12%") lebih berbahaya daripada tidak ada
     kalimat, karena ia terdengar tegas sementara dasarnya belum
     dipastikan. */
  function blokInsight() {
    if (!state.baris.length) return '';
    var butir = [];

    /* 1. Kelas yang paling banyak berubah. */
    var berubah = state.baris.filter(function (b) { return b.deltaPoin !== null; });
    berubah.sort(function (a, b) { return Math.abs(b.deltaPoin) - Math.abs(a.deltaPoin); });
    var atas = berubah.filter(function (b) { return Math.abs(b.deltaPoin) >= 0.05; }).slice(0, 3);
    if (atas.length) {
      var kalimat = atas.map(function (b) {
        return '<b>' + escapeHtml(b.nama) + '</b> ' +
          (b.deltaPoin > 0 ? 'naik' : 'turun') + ' ' +
          Math.abs(b.deltaPoin).toLocaleString('id-ID', { maximumFractionDigits: 1 }) +
          ' poin (' + fmtPersen(b.porsiAwal) + ' → ' + fmtPersen(b.porsiAkhir) + ')';
      }).join('; ');
      butir.push({ ikon: '~', isi: 'Perubahan terbesar: ' + kalimat + '.' });
    }

    /* 2. Kelas yang hilang total atau baru muncul. */
    var hilang = state.baris.filter(function (b) { return b.hilang; });
    var baru = state.baris.filter(function (b) { return b.baruMuncul; });
    if (hilang.length) {
      butir.push({
        ikon: '!',
        kelas: 'penting',
        isi: '<b>' + hilang.length + ' kelas hilang total</b> dari peta ' + TAHUN_AKHIR + ': ' +
          hilang.map(function (b) { return escapeHtml(b.nama); }).join(', ') +
          '. Kelas ini tidak ada lagi di desa ini pada tahun terakhir.'
      });
    }
    if (baru.length) {
      butir.push({
        ikon: '+',
        isi: '<b>' + baru.length + ' kelas baru</b> muncul di ' + TAHUN_AKHIR + ': ' +
          baru.map(function (b) { return escapeHtml(b.nama); }).join(', ') + '.'
      });
    }

    /* 3. Seberapa bisa kedua peta dibandingkan. Ini yang paling sering
       dilewati orang dan paling menentukan. */
    var beda = state.bedaLuasTerpetakan;
    if (beda !== null && isFinite(beda)) {
      var besar = Math.abs(beda);
      if (besar < 5) {
        butir.push({
          ikon: '=',
          isi: 'Kedua peta memotong area yang hampir sama (' + fmtLuas(state.totalAwal) + ' → ' +
            fmtLuas(state.totalAkhir) + '), jadi perubahan luas di tabel mendekati perubahan di lapangan.'
        });
      } else {
        /* Kata "peta memotong area berbeda" bukan "lahan berubah". Yang
           benar hanya komposisinya, dan itu yang ditunjukkan grafik. */
        butir.push({
          ikon: '!',
          kelas: 'penting',
          isi: 'Kedua peta <b>tidak memotong area yang sama</b>: luas terpetakan ' + TAHUN_AWAL + ' ' +
            fmtLuas(state.totalAwal) + ' dan ' + TAHUN_AKHIR + ' ' + fmtLuas(state.totalAkhir) +
            ' (' + (beda > 0 ? '+' : '') + beda.toLocaleString('id-ID', { maximumFractionDigits: 0 }) +
            '%). Grafik di atas menampilkan <b>porsi</b>, bukan luas, karena itu yang bisa ' +
            'dibandingkan. Perubahan luas mutlak belum bisa dibaca dari sini.'
        });
      }
    }

    if (!butir.length) return '';
    var h = '<div class="gt-insight">';
    for (var i = 0; i < butir.length; i++) {
      h += '<div class="gt-insight-item' + (butir[i].kelas === 'penting' ? ' gt-insight-item--penting' : '') + '">' +
        '<span class="gt-insight-ikon" aria-hidden="true">' + escapeHtml(butir[i].ikon) + '</span>' +
        '<span>' + butir[i].isi + '</span></div>';
    }
    h += '</div>';
    return h;
  }

  function listHtml() {
    if (!state) return '';
    if (state.adaData === false) {
      return '<div class="geotani-lbslsd-summary">' +
        '<div><span>Desa</span><b>' + escapeHtml(state.namaDesa) + '</b></div>' +
        (state.luasDesaHa !== null
          ? '<div><span>Luas desa</span><b>' + fmtLuas(state.luasDesaHa) + '</b></div>' : '') +
        '<div><span>Tutupan</span><b>0 ha</b></div>' +
        '</div>' +
        '<div class="geotani-lbslsd-warn" style="margin-top:8px;">Tidak ada poligon tutupan lahan ' +
        'yang beririsan dengan desa ini pada kedua tahun. Peta tutupan KLHK mencakup seluruh Indonesia, ' +
        'jadi desa yang benar-benar tidak terpetakan jarang terjadi -- kalau ini muncul, cek kembali ' +
        'batas desa yang dipilih.</div>' +
        creditHtml();
    }

    var akhir = state.perTahun[state.perTahun.length - 1];
    var awal = state.perTahun[0];

    var h = '<div class="geotani-lbslsd-summary">';
    h += '<div><span>Luas ' + TAHUN_AKHIR + '</span><b>' + fmtLuas(akhir.totalIrisanHa) + '</b></div>';
    h += '<div><span>Luas desa</span><b>' +
      (state.luasDesaHa !== null ? fmtLuas(state.luasDesaHa) : 'tidak tersedia') + '</b></div>';
    h += '<div><span>% tertutup</span><b>' + fmtPersen(state.persenTertutup) + '</b></div>';
    h += '</div>';

    /* Di bawah 100% itu kondisi yang dijumpai, bukan kesalahan: peta
       tutupan KLHK tidak memetakan setiap desa sampai penuh. Yang penting
       angka itu ditampilkan apa adanya, bukan dinormalkan jadi 100%
       supaya tabel terlihat lebih rapi. */
    if (state.persenTertutup !== null && state.persenTertutup < 99.5) {
      h += '<div class="geotani-lbslsd-note" style="margin-top:7px">' +
        'Tutupan ' + TAHUN_AKHIR + ' tidak menutup seluruh desa (' + fmtPersen(state.persenTertutup) +
        ' dari luas desa). Peta tutupan KLHK tidak memetakan setiap desa sampai 100%.</div>';
    }

    /* Peringatan disebut per tahun. Tanpa penyebutan tahun, "sebagian
       poligon tidak ditampilkan" tidak bisa ditindaklanjuti: kalau 2020-nya
       terpotong dan 2024-nya utuh, delta-nya tidak bisa dipercaya dan itu
       informasi yang perlu diketahui. */
    for (var p = 0; p < state.perTahun.length; p++) {
      var th = state.perTahun[p];
      if (th.terpotongQuery) {
        h += '<div class="geotani-lbslsd-warn">Tahun ' + th.tahun + ': jumlah poligon yang bisa dimuat ' +
          'untuk desa ini melebihi ' + MAX_HALAMAN + ' halaman, jadi sebagian poligon tidak ditampilkan ' +
          'dan luas ' + th.tahun + ' lebih kecil daripada sebenarnya. Persentase ikut terlalu rendah.</div>';
      }
      if (th.tumpangTindih) {
        h += '<div class="geotani-lbslsd-warn">Peringatan tumpang tindih ' + th.tahun + ': jumlah luas ' +
          'melebihi luas desa (' + fmtLuas(th.totalIrisanHa) + ' dari ' + fmtLuas(state.luasDesaHa) +
          '). Peta digambar manual sehingga poligon bisa saling menimpa, dan luas hasil penjumlahan ' +
          'menghitung sebagian area lebih dari sekali.</div>';
      }
      if (th.tidakDikenal > 0) {
        h += '<div class="geotani-lbslsd-warn">' + th.tidakDikenal + ' poligon tahun ' + th.tahun +
          ' punya kelas yang tidak ada di daftar 2024. Warnanya abu-abu, jadi tidak ikut dihitung ' +
          'sebagai kelas yang dikenal.</div>';
      }
    }

    /* Kelas yang hilang total adalah perubahan yang paling penting secara
       kebijakan, jadi ia tidak boleh hilang dari tampilan hanya karena tidak
       punya pasangan untuk dibandingkan. */
    var hilang = state.baris.filter(function (b) { return b.hilang; });
    if (hilang.length) {
      h += '<div class="geotani-lbslsd-warn">' + hilang.length + ' kelas tidak punya luas sama sekali di ' +
        TAHUN_AKHIR + ': ' +
        hilang.map(function (b) { return escapeHtml(b.nama); }).join(', ') +
        '. Kelas ini hilang total dari peta ' + TAHUN_AKHIR + '.</div>';
    }

    var totalDelta = akhir.totalIrisanHa - awal.totalIrisanHa;
    h += '<div class="geotani-lbslsd-note" style="margin-top:7px">Total luas terpetakan ' +
      TAHUN_AWAL + ' ' + fmtLuas(awal.totalIrisanHa) + ' &rarr; ' + TAHUN_AKHIR + ' ' +
      fmtLuas(akhir.totalIrisanHa) + ' (' + fmtDelta(totalDelta) + '). Perubahan total belum tentu ' +
      'perubahan tutupan lahan: peta tidak memetakan setiap desa sampai penuh, dan tingkat ' +
      'pemetaannya berbeda antar tahun.</div>';

    /* Ringkasan insight dan grafik sengaja DI ATAS tabel, bukan di bawah.
       Tabel 22 baris tanpa perlu digulir adalah yang justru menyembunyikan
       grafik, jadi grafik harus muncul lebih dulu dari data yang
       diringkasnya. */
    h += blokInsight();

    var gDelta = grafikDeltaPoin();
    if (gDelta) {
      h += '<div class="geotani-lbslsd-layer">';
      h += '<div class="geotani-lbslsd-layer-head">Perubahan porsi tiap kelas</div>';
      h += '<div class="geotani-lbslsd-sub">Batang ke kanan berarti porsi ' + TAHUN_AKHIR +
        ' lebih besar, ke kiri lebih kecil. Besaran dalam poin persen dari luas terpetakan ' +
        'tiap tahun, bukan persen relatif terhadap luas desa.</div>';
      h += gDelta;
      h += '</div>';
    }

    var gKomp = grafikKomposisi();
    if (gKomp) {
      h += '<div class="geotani-lbslsd-layer">';
      h += '<div class="geotani-lbslsd-layer-head">Komposisi tiap tahun</div>';
      h += '<div class="geotani-lbslsd-sub">Porsi tiap kelas dari luas terpetanan tahun itu sendiri. ' +
        'Dua lingkaran dibandingkan berdampingan, bukan dijumlahkan.</div>';
      h += gKomp;
      h += legendaKomposisi();
      h += '</div>';
    }

    h += barisKelas();
    h += barisPersen();
    h += creditHtml();
    return h;
  }

  /* ── pencarian desa ──
     Milik kartu ini sendiri, karena kode desa di panel GeoTani lain disimpan
     di state modul lokal mereka. Daftar dan normalisasi diambil dari kartu
     LBS & LSD supaya tidak ada dua daftar desa yang bisa berbeda. */
  function daftarDesa() {
    var m = M();
    if (!m || typeof m.daftarDesa !== 'function') return null;
    return m.daftarDesa();
  }

  function cariDesa(query) {
    var m = M();
    if (!m || typeof m.cariDesa !== 'function') return [];
    return m.cariDesa(query);
  }

  /* Kode desa yang sudah dipilih di panel GeoTani lain. Dipakai supaya
     pengguna tidak perlu mengetik ulang nama desa yang sama tiga kali. */
  function kodeDariPanelLain() {
    var m = M();
    if (m && typeof m.kodeDariPanelLain === 'function') {
      var k = m.kodeDariPanelLain();
      if (k) return String(k);
    }
    if (m && typeof m.getSelectedKode === 'function' && m.getSelectedKode()) {
      return String(m.getSelectedKode());
    }
    return null;
  }

  function setSelectedKode(kode, nama) {
    selectedKode = kode ? String(kode) : null;
    var picked = document.getElementById('geotaniTutupanVillageSelected');
    if (picked) {
      if (selectedKode) {
        picked.textContent = '✓ ' + (nama || selectedKode) + ' (' + selectedKode + ')';
        picked.hidden = false;
      } else {
        picked.textContent = '';
        picked.hidden = true;
      }
    }
    if (selectedKode !== (state && state.kode) && state) clear();
  }

  function getSelectedKode() { return selectedKode; }

  function init(root) {
    var host = root || document.getElementById('geotani-tutupan-card');
    if (!host) return null;
    var btn = document.getElementById('geotani-tutupan-load');
    var out = document.getElementById('geotani-tutupan-output');
    var status = document.getElementById('geotani-tutupan-status');
    var input = document.getElementById('geotaniTutupanVillageSearch');
    var results = document.getElementById('geotaniTutupanVillageResults');
    var resetBtn = document.getElementById('geotani-tutupan-reset');
    if (!btn || !out) return null;
    if (btn.__geotaniTutupanBound) return api;
    btn.__geotaniTutupanBound = true;

    if (resetBtn && !resetBtn.__geotaniTutupanResetBound) {
      resetBtn.__geotaniTutupanResetBound = true;
      resetBtn.addEventListener('click', function () { reset(); });
    }

    var lain = kodeDariPanelLain();
    if (lain) setSelectedKode(lain, null);

    if (input && results) {
      var hide = function () { results.hidden = true; results.innerHTML = ''; };
      input.addEventListener('input', function () {
        var found = cariDesa(input.value);
        if (!found.length) { hide(); return; }
        results.innerHTML = '';
        for (var i = 0; i < found.length; i++) {
          (function (item) {
            var div = document.createElement('div');
            div.className = 'geotani-sls-result';
            div.textContent = item.nama + ' (' + item.kode + ')';
            div.addEventListener('mousedown', function (e) {
              e.preventDefault();
              input.value = item.nama;
              hide();
              setSelectedKode(item.kode, item.nama);
            });
            results.appendChild(div);
          })(found[i]);
        }
        results.hidden = false;
      });
      document.addEventListener('click', function (e) {
        if (!results.contains(e.target) && e.target !== input) hide();
      });
    }

    btn.addEventListener('click', async function () {
      var kode = selectedKode || kodeDariPanelLain();
      if (!kode) {
        if (status) status.textContent = 'Pilih desa terlebih dahulu.';
        if (input) input.focus();
        return;
      }
      btn.disabled = true;
      out.innerHTML = '';
      if (status) status.textContent = 'Mengambil data tutupan lahan ' +
        TAHUN_AWAL + ' dan ' + TAHUN_AKHIR + ' dari KLHK/BNPB...';
      try {
        var st = await load(kode);
        /* null berarti pengguna menekan "Reset Polygon" selagi request ini
           berjalan. Jangan menulis apa pun ke layar. */
        if (!st) return;
        drawOnMap();
        out.innerHTML = listHtml();
        if (status) {
          status.textContent = st.adaData === false
            ? 'Tidak ada poligon tutupan lahan di desa ini.'
            : 'Membandingkan ' + TAHUN_AWAL + ' dan ' + TAHUN_AKHIR + '.';
        }
      } catch (e) {
        if (status) {
          status.textContent = e && e.message
            ? e.message
            : 'Gagal mengambil data tutupan lahan.';
        }
      } finally {
        btn.disabled = false;
      }
    });

    out.addEventListener('click', function (ev) {
      var li = ev.target.closest ? ev.target.closest('[data-tutupan-kelas]') : null;
      if (li) {
        /* Tahun ikut dibawa: indeks poligon berbeda per tahun, dan peta
           selalu menampilkan tahun terakhir. Tanpa ini, klik baris yang
           poligonnya cuma ada di tahun awal akan menyorot petak yang salah. */
        highlightKelas(li.getAttribute('data-tutupan-kelas'), Number(li.getAttribute('data-tutupan-tahun')) || undefined);
      }
    });

    return api;
  }

  api = {
    load: load,
    clear: clear,
    init: init,
    reset: reset,
    getState: getState,
    listHtml: listHtml,
    credit: credit,
    creditHtml: creditHtml,
    creditText: creditText,
    creditTanggalAkses: creditTanggalAkses,
    drawOnMap: drawOnMap,
    zoomKeDesa: zoomKeDesa,
    clearMap: clearMap,
    highlight: highlight,
    highlightKelas: highlightKelas,
    querySemua: querySemua,
    fetchJson: fetchJson,
    kelasUntuk: kelasUntuk,
    daftarDesa: daftarDesa,
    cariDesa: cariDesa,
    setSelectedKode: setSelectedKode,
    getSelectedKode: getSelectedKode,
    kodeDariPanelLain: kodeDariPanelLain,
    KELAS: KELAS,
    WARNA_DEFAULT: WARNA_DEFAULT,
    TAHUN: TAHUN,
    TAHUN_AWAL: TAHUN_AWAL,
    TAHUN_AKHIR: TAHUN_AKHIR,
    configTahun: configTahun,
    petaTahun: petaTahun,
    poligonTahun: poligonTahun,
    indeksTahun: indeksTahun,
    MAX_HALAMAN: MAX_HALAMAN,
    BN: BN,
    _url: url
  };
  window.GeoTaniTutupan = api;

  if (typeof document !== 'undefined') {
    var boot = function () { if (!init()) setTimeout(boot, 300); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();