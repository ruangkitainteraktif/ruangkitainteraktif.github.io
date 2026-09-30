/* GeoOSS - Pre-OSS Spatial Checker
   Screening kesesuaian zona terhadap RDTR sebelum mengajukan proses resmi.

   GeoOSS BUKAN OSS. Modul ini tidak menerbitkan keputusan, tidak menerbitkan
   izin, dan tidak menggantikan OSS / ATR-BPN / Pemerintah Daerah. Yang
   dilakukan hanya membaca peta peruntukan zona yang sudah dipublikasikan
   pemerintah daerah, lalu menunjukkan zona mana yang mengizinkan kegiatan
   tertentu.

   ALUR DATA
   ---------
     provinces.json -> KODE_WILAYAH_DATA (sudah ada di halaman) -> rdtr/{id_wilayah}.json
       -> pilih RDTR -> gambar poligon -> query layer zona via tres/proxy.ashx
       -> activities/{id_wilayah}/{id_rtr}.json -> join lewat kolom_unik
       -> status per zona plus luas irisan

   TIGA HAL YANG HARUS DIKETAHUI SEBELUM MENYUNTIKKAN KODE DI SINI

   1. Data navigasi (provinces, rdtr, activities) TIDAK bisa diambil langsung
      dari browser. Endpoint-nya berada di path /rdtrinteraktif/api/... yang tidak
      mengirim header Access-Control-Allow-Origin. CORS Worker yang dipakai
      halaman ini tidak menolong: worker itu membalas 522 untuk SETIAP URL
      gistaru.atrbpn.go.id, sementara host lain dilayani normal. Karena itu data
      itu di-build offline oleh scripts/build-geooss-snapshot.mjs menjadi berkas
      statis, lalu dibaca modul ini dari assets/data/geooss/.

      Daftar kabupaten/kota TIDAK ikut di-build. Modul membacanya dari
      KODE_WILAYAH_DATA, berkas yang sudah ada dan sudah dimuat halaman ini.
      File itu juga lebih lengkap daripada yang dikembalikan API.

      Geometri zonanya TIDAK ikut di-snapshot. Geometri tetap diambil langsung
      dari ArcGIS lewat tres/proxy.ashx, karena layanan itu mengirim ACAO:*
      sehingga aman untuk browser, dan karena geometri yang basi akan membuat
      pengguna melihat zona yang sudah tidak berlaku.

   2. kolom_unik BERBEDA-BEDA antar RDTR dan tidak boleh di-hardcode. Cilacap
      memakai KODSZN, sedangkan RDTR Perbatasan Sekitar Bandara Yogyakarta
      memakai KODUNK. Modul membaca nama field itu dari rdtr/*.json lalu
      memverifikasi field-nya benar-benar ada di schema layer. Kalau tidak ada,
      modul melapor dan berhenti, bukan menebak field lain yang mirip.

   3. Kode zona dari API datang dalam beberapa bentuk dan tidak konsisten:
        "SP", "R-2", "SPU-3.3"                       (Cilacap, bentuk umum)
        "SPU 3.3"                                    (varian dengan SPASI)
        "PS_K01B_Rawan Bencana Tsunami, Rawan ..."  (kode compound + atribut)
      Semuanya diratakan lewat kunciZona(). Perbandingan dilakukan saat runtime,
      bukan saat build, supaya aturannya ada di satu tempat dan bisa diuji.

   BATASAN YANG HARUS SELALU TERLIHAT DI UI
   -----------------------------------------
   - Tidak ada layer RDTR nasional. Folder RDTR_SEAMLESS, _RDTR_SEAMLESS,
     RDTR_NASIONAL, LP2B_LBS_LSD, dan LSD semuanya membalas {"folders":[]},
     jadi data hanya tersedia untuk kabupaten/kota yang sudah didigitasi.
   - Layer zona tidak punya endpoint tile. /MapServer/tile/... membalas HTML,
     bukan PNG, jadi zona digambar dari GeoJSON hasil query.
   - Field `status` bernilai 6 pada semua RDTR yang dicek dan tidak ada
     dokumentasi artsinya, jadi tidak pernah diinterpretasi. Yang ditampilkan
     hanya integration_date sebagai penanda kesegaran.
   - Ini screening zona, bukan penilaian batas bidang. Zone yang tumpang tindih
     20 persen sudah berarti kegiatan itu tidak boleh lapangan, jadi modul
     sengaja tidak memberi skor komposit yang menyesatkan.
*/
(function () {
  'use strict';

  var DASAR_SERVICES = 'https://gistaru.atrbpn.go.id/arcgis/rest/services/';
  var HOST_PROXY = 'https://gistaru.atrbpn.go.id/tres/proxy.ashx?';
  var CORS_PROXY = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';
  var DASAR_DATA = 'assets/data/geooss/';

  var REQUEST_TIMEOUT_MS = 45000;

  /* Jumlah percobaan dan jeda antar percobaan. GISTARU terbukti membalas 500
     lalu 400 tanpa pesan ketika sedang dibebani, lalu pulih sendiri -- satu
     query yang gagal berulang kali berhasil setelah menunggu 75 detik. Jadi
     satu kegagalan tidak langsung berarti modul rusak, dan mencoba lagi
     beberapa kali jauh lebih berguna daripada langsung menyerah. */
  var MAX_Coba = 3;
  var JEDA_COBA_MS = [2500, 6000];

  function tidur(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function bisaDiulang(err) {
    /* 404 dan penolakan kolom tidak diulang: itu kondisi yang pasti dan tidak
       akan berubah kalau dicoba lagi. */
    if (!err) return false;
    if (err.kode === 'belum-di-build' || err.kode === 'dibuka-sebagai-berkas') return false;
    if (err.sumber === 'lokal') return false;
    if (err.arcgis === 400) return true;
    if (err.name === 'AbortError') return true;
    if (/HTTP 5\d\d|Failed to fetch|NetworkError|Load failed/i.test(err.message || '')) return true;
    if (/HTTP 49\d|Token Required/i.test(err.message || '')) return false;
    return false;
  }

  /* Semua request ke ArcGIS diberi penanda sumber, dan sama sekali semua
     error diberi sumber juga. Tanpa ini, fetch berkas lokal yang gagal akan
     ikut terbaca sebagai "Failed to fetch" dan dilaporkan sebagai masalah
     ATR/BPN -- padahal penyebabnya halaman dibuka dari file://, atau path
     salah. Itu kesalahan yang menyesatkan karena mengarahkan perbaikan ke
     tempat yang salah. */
  async function fetchJsonSekali(url) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT_MS);
    try {
      var res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) {
        var e = new Error('HTTP ' + res.status);
        e.sumber = 'arcgis';
        e.status = res.status;
        throw e;
      }
      return await res.json();
    } catch (err) {
      if (err && err.name === 'AbortError') {
        err.sumber = 'arcgis';
        throw err;
      }
      try {
        var res2 = await fetch(CORS_PROXY + encodeURIComponent(url), { signal: ctrl.signal });
        if (!res2.ok) throw new Error('HTTP ' + res2.status);
        return await res2.json();
      } catch (e) {
        /* Error ASLI yang dilempar, bukan error worker. Worker membalas 522
           untuk gistaru.atrbpn.go.id, jadi pursue error worker hanya
           menyembunyikan penyebab sebenarnya. */
        if (!err.sumber) err.sumber = 'arcgis';
        throw err;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchJson(url) {
    var last = null;
    for (var i = 0; i < MAX_Coba; i++) {
      try {
        return await fetchJsonSekali(url);
      } catch (err) {
        last = err;
        if (i < MAX_Coba - 1 && bisaDiulang(err)) {
          var jeda = JEDA_COBA_MS[i] != null ? JEDA_COBA_MS[i] : 8000;
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[GeoOSS] permintaan gagal, mencoba lagi dalam ' + jeda + ' ms (percobaan ' +
              (i + 1) + '/' + MAX_Coba + '):', err && err.message, url);
          }
          await tidur(jeda);
          continue;
        }
        break;
      }
    }
    /* Error asli dicetak ke konsol. Tanpa ini, penyebab sebenarnya hilang
       di balik pesan yang disederhanakan, dan bug seperti URL terlalu panjang
       atau diblokir ekstensi tidak akan pernah ketahuan. */
    if (typeof console !== 'undefined' && console.error) {
      console.error('[GeoOSS] gagal memuat:', last && last.message, '| sumber:',
        last && last.sumber, '| url:', url, '| error:', last);
    }
    throw last;
  }

  /* Nama field dan labelnya diambil dari alias field di layer GISTARU itu
     sendiri, bukan dikarang. NILAI-nya tetap ditampilkan mentah: layanan ini
     tidak mengekspos domain, dan mengarang arti angka 1/2/3 akan menyesatkan.
     Untuk KSMPDN dan PTBGMB labelnya dibiarkan sama dengan nama field karena
     artinya tidak bisa dipastikan dari nama itu sendiri. */
  /* Daftar field kendala, dikelompokkan menurut cara memperlakukannya.
     MUTLAK : tidak boleh dipakai di zona ini. Inilah yang mengubah
             "Sesuai" menjadi "Sesuai Bersyarat" kalau ada, dan tidak
             pernah membalik "Tidak Sesuai" menjadi "Sesuai".
     CATAT  : tidak melarang, tapi wajib diperiksa dan dijelaskan ke
             desa. Dihitung terpisah supaya bisa ditampilkan tanpa
            memicu alarm palsu.

     Klasifikasi ini keputusan konten, bukan hasil bacaan data. Field baru
     yang belum dikenal tidak ikut dihitung sama sekali -- lebih baik
     diam daripada salah dinilai. Field yang masuk daftar tapi kosong di
     skema layer disaring oleh fieldYangAda(), seperti sebelumnya.

     TPZ_00 "Teknik Pengaturan Zonasi" sengaja TIDAK masuk daftar. Ini
     satu-satunya kandidat untuk ketentuan intensitas, tapi nilainya
     "Tidak Ada" di zona yang diperiksa. Memakainya untuk menilai
     intensitas akan menampilkan angka yang tidak ada dasarnya. */
  var KENDALA_MUTLAK = [
    { f: 'LP2B_2', l: 'Lahan Pertanian Pangan Berkelanjutan' },
    { f: 'CAGBUD', l: 'Cagar Budaya' },
    { f: 'KKARST', l: 'Kawasan Karst' },
    { f: 'KKOP_1', l: 'Keselamatan Operasional Penerbangan' },
    { f: 'HANKAM', l: 'Pertahanan dan Keamanan' },
    { f: 'PUSLIT', l: 'Pusat Penelitian' },
    { f: 'MGRSAT', l: 'Migrasi Satwa' },
    { f: 'PTBGMB', l: 'Pertambangan Mineral dan Batubara' },
    { f: 'RDBUMI', l: 'Ruang Dalam Bumi' }
  ];
  var KENDALA_CATAT = [
    { f: 'KRB_03', l: 'Kawasan Rawan Bencana' },
    { f: 'TOD_04', l: 'Kawasan Berorientasi Transit' },
    { f: 'TEB_05', l: 'Tempat Evakuasi Bencana' },
    { f: 'RESAIR', l: 'Kawasan Resapan Air' },
    { f: 'KSMPDN', l: 'Kawasan Sempadan' },
    { f: 'BA', l: 'Berita Acara' },
    { f: 'CT', l: 'Dokumen Verifikasi' }
  ];
  /* Dipakai skrip query dan build. Urutan digabung dengan MUTLAK lebih
     dulu supaya field yang paling menentukan tampilannya paling atas. */
  var KENDALA = KENDALA_MUTLAK.concat(KENDALA_CATAT);

  var KENDALA_MUTLAK_SET = new Set(KENDALA_MUTLAK.map(function (k) { return k.f; }));
  var KENDALA_CATAT_SET = new Set(KENDALA_CATAT.map(function (k) { return k.f; }));


  /* Holder ARRAY, bukan string gabungan. fieldYangAda() menyaring daftar ini
     terhadap skema layer, dan penyaringan itu hanya benar kalau yang
     diiterasi adalah nama field -- bukan huruf singly dari string. */
  var OUTFIELDS = [
    'NAMOBJ', 'NAMZON', 'KODZON', 'NAMSZN', 'KODSZN', 'KODUNK',
    'JNSRPR', 'WADMPR', 'WADMKK', 'WADMKC', 'WADMKD',
    'LP2B_2', 'KRB_03', 'KKOP_1', 'TOD_04', 'TEB_05', 'CAGBUD',
    'HANKAM', 'KKARST', 'RESAIR', 'PUSLIT', 'MGRSAT', 'RDBUMI',
    'KSMPDN', 'PTBGMB', 'BA', 'CT', 'TPZ_00', 'REMARK', 'PP', 'NOTHPR'
  ];

var state = null;
var mapLayer = null;
var pratinjauLayer = null;
/* Poligon hasil gambar milik GeoOSS. Disimpan supaya bisa dihapus saat
   Reset dan saat menggambar ulang, tanpa menyentuh polygon milik fitur lain. */
var layerGambar = null;
  var cache = new Map();
  var inFlight = new Map();
  var token = 0;
  var daftarProvinsi = null;

  /* ── pembantu ────────────────────────────────────────────────────────── */

  function esc(v) {
    if (v == null) return '-';
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function nomor(n) {
    return Number(n || 0).toLocaleString('id-ID');
  }

  function luasHa(g) {
    try {
      if (window.geoArea && typeof window.geoArea.areaHaFromGeoJSON === 'function') {
        var v = window.geoArea.areaHaFromGeoJSON(g);
        return isFinite(v) ? v : null;
      }
    } catch (e) { /* jatuh ke null, bukan menebak */ }
    return null;
  }

  function fmtHa(v) {
    if (v == null) return 'tidak diketahui';
    if (v >= 100) return nomor(Math.round(v)) + ' ha';
    if (v >= 1) return v.toFixed(2).replace('.', ',') + ' ha';
    return nomor(Math.round(v * 10000)) + ' m2';
  }

  function pct(v) {
    if (v == null || !isFinite(v)) return '-';
    return v.toFixed(1).replace('.', ',') + '%';
  }

  /* Kunci kanonik kode zona. Semua bentuk yang ditemukan diratakan ke satu
     bentuk supaya bisa dibandingkan:
       "SPU-3.3" -> SPU_3_3
       "SPU 3.3" -> SPU_3_3   (varian dengan spasi, itu yang ada di data)
       "R-2"     -> R_2
       "BA_K01G" -> BA_K01G
     Rentetan spasi, hyphen, dan titik disatukan jadi satu underscore, lalu
     huruf besar. Menyatukan spasi dan hyphen itu penting karena sumbernya
     sendiri tidak konsisten memakai keduanya. */
  function kunciZona(kode) {
    return String(kode == null ? '' : kode)
      .trim()
      .toUpperCase()
      .replace(/[ \t\r\n\-.]+/g, '_')
      .replace(/[^A-Z0-9_]/g, '')
      .replace(/^_+|_+$/g, '');
  }

  /* Pencocokan kode zona.
     'pasti'  : sama persis setelah dinormalkan. Menutup kasus Cilacap.
     'awalan' : salah satu sisi berawalan sisi lain plus underscore. Untuk kode
                compound seperti "PS_K01B_Rawan Bencana Tsunami" di sisi
                kegiatan, yang kode zonanya hanya "PS_K01B" di sisi layer.
     'tidak'  : tidak cocok.
     Hasil 'awalan' ditandai supaya UI bisa menyebutnya sebagai pencocokan tidak
     langsung, bukan kecocokan pasti. */
  function cocokZona(kodeLayer, kodeAktivitas) {
    var a = kunciZona(kodeLayer);
    var b = kunciZona(kodeAktivitas);
    if (!a || !b) return 'tidak';
    if (a === b) return 'pasti';
    if (b.indexOf(a + '_') === 0) return 'awalan';
    if (a.indexOf(b + '_') === 0) return 'awalan';
    return 'tidak';
  }

  /* ── jaringan ────────────────────────────────────────────────────────── */

  /* Semua request ke ArcGIS diberi penanda sumber, dan sama sekali semua
     error diberi sumber juga. Tanpa ini, fetch berkas lokal yang gagal akan
     ikut terbaca sebagai "Failed to fetch" dan dilaporkan sebagai masalah
     ATR/BPN -- padahal penyebabnya halaman dibuka dari file://, atau path
     salah. Itu kesalahan yang menyesatkan karena mengarahkan perbaikan ke
     tempat yang salah. */
  /* Berkas lokal. 403 atau 404 berarti "belum di-build", dan itu STATUS YANG
     BERBEDA dari "tidak ada": yang pertama adalah keterbatasan repo, yang kedua
     adalah fakta. UI wajib menampilkan keduanya secara berbeda supaya pengguna
     tidak salah menyimpulkan bahwa datanya memang tidak ada. */
  /* Berkas lokal. Tiga kemungkinan yang wajib dibedakan, karena gejalanya
     mirip tapi perbaikannya sama sekali berbeda:
       - 404        : berkasnya memang tidak ada (wilayah belum di-build).
       - 403 / 405  : ada, tapi tidak boleh dibaca. Khas saat halaman dibuka
                      langsung dari file://, karena browser memperlakukan
                      fetch ke path relatif sebagai permintaan lintas origin.
       - TypeError   : koneksi terputus, atau respons diblokir (misalnya oleh
                      ekstensi pemblokir iklan), atau halaman dibuka dari path
                      yang salah sehingga assets/ tidak ditemukan.
     Semuanya diberi sumber 'lokal' supaya pesanGagal tidak menyalahkan
     ATR/BPN untuk masalah yang sebenarnya ada di sisi halaman. */
  async function ambilData(rel) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT_MS);
    try {
      var res = await fetch(DASAR_DATA + rel, { signal: ctrl.signal });
      if (res.status === 404) {
        var e404 = new Error('berkas tidak ada: ' + DASAR_DATA + rel);
        e404.kode = 'belum-di-build';
        e404.sumber = 'lokal';
        e404.status = 404;
        /* Disimpan supaya pesan bisa menyebut berkas mana yang bermasalah,
           tanpa harus meneruskannya lewat semua lapisan pemanggil. */
        e404.rel = rel;
        throw e404;
      }
      if (!res.ok) {
        var e = new Error('HTTP ' + res.status);
        e.sumber = 'lokal';
        e.status = res.status;
        throw e;
      }
      return await res.json();
    } catch (err) {
      if (!err.sumber) err.sumber = 'lokal';
      if (!err.kode && err.name !== 'AbortError') {
        err.jaringan = true;
        if (typeof location !== 'undefined' && location.protocol === 'file:') {
          err.kode = 'dibuka-sebagai-berkas';
        }
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /* Skema layer, untuk memverifikasi kolom_unik benar-benar ada. Kalau tidak,
     query dengan field itu akan menghasilkan join kosong yang terlihat
     meyakinkan, dan itu hasil terburuk yang mungkin terjadi.

     Extent juga diambil dari sini, bukan dengan request terpisah: metadata
     layer sudah memuat extent, jadi batas wilayah RDTR bisa zeigen ke peta
     tanpa satu pun request tambahan. */
  function skemaLayer(rdtr) {
    var key = 'skema:' + rdtr.url_mapserver + '/' + rdtr.sublayer;
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (inFlight.has(key)) return inFlight.get(key);
    var url = HOST_PROXY + DASAR_SERVICES + rdtr.url_mapserver + '/' + rdtr.sublayer + '?f=json';
    var p = fetchJson(url).then(function (j) {
      inFlight.delete(key);
      var fields = ((j && j.fields) || []).map(function (f) { return f.name; });
      var e = j && j.extent;
      var r = {
        fields: fields,
        ok: true,
        /* Extent metadata dalam derajat (WGS 84) untuk layer RDTR ini. Kalau
           layer nanti memakai proyeksi lain, batas ini akan terlihat salah
           posisi; karena itu pembatasannya ketat dan hanya dipakai untuk
           memperkecil tampilan, bukan untuk menghitung apa pun. */
        bbox: e && isFinite(e.xmin) ? [e.xmin, e.ymin, e.xmax, e.ymax] : null
      };
      cache.set(key, r);
      return r;
    }).catch(function (e) {
      inFlight.delete(key);
      throw e;
    });
    inFlight.set(key, p);
    return p;
  }

  /* Daftar field yang benar-benar ada di layer. PENTING: skema tiap RDTR
     BERBEDA. Cilacap punya KODSZN tapi tidak KODUNK; RDTR Perbatasanentional
     Sekitar Bandara Yogyakarta sebaliknya punya KODUNK tapi tidak punya
     RESAIR maupun KSMPDN. ArcGIS membalas "Failed to execute query" kalau
     outFields menyebut field yang tidak ada, jadi daftar OUTFIELDS yang
     gabungan harus disaring terhadap skema nyata sebelum dipakai.
     kolom_unik selalu dipaksakan masuk walau tidak ada di OUTFIELDS. */
  function fieldYangAda(skema, kolomUnik) {
    var ada = new Set(skema.fields || []);
    var out = [];
    for (var i = 0; i < OUTFIELDS.length; i++) {
      if (ada.has(OUTFIELDS[i])) out.push(OUTFIELDS[i]);
    }
    if (kolomUnik && ada.has(kolomUnik) && out.indexOf(kolomUnik) === -1) out.push(kolomUnik);
    if (!out.length) out.push('OBJECTID');
    return out.join(',');
  }

  /* Query zona memakai ENVELOPE, bukan poligon.
     Alasannya panjang URL. Poligon yang digambar user bisa ratusan titik, dan
     setiap titik jadi sekitar 50 karakter setelah percent-encode, jadi URL bisa
     melewati 6.000 karakter. Proxy dan browser punya batas panjang URL
     yang lebih rendah, dan ketika terlampaui hasilnya `Failed to fetch` yang
     di browser terlihat_identik dengan kegagalan CORS padahal bukan. Envelope
     selalu empat angka, jadi URL-nya pendek dan tidak bergantung pada
     kerumusan poligon.

     Konsekuensinya presisi dihitung di sisi client: semua zona di dalam
     envelope diambil, lalu hanya yang benar-benar berpotongan dengan poligon
     yang digambar yang dipakai, dan luas irisan dihitung client dengan turf.
     Geometri yang dikembalikan ArcGIS untuk spatial query adalah geometri
     penuh fitur, bukan potongan, sehingga irisan client-side ini benar. */
  function kotakPembatas(geom) {
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    var polys = geom.type === 'Polygon' ? [geom.coordinates]
      : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    for (var p = 0; p < polys.length; p++) {
      for (var r = 0; r < polys[p].length; r++) {
        var ring = polys[p][r];
        for (var i = 0; i < ring.length; i++) {
          var x = ring[i][0], y = ring[i][1];
          if (x < minx) minx = x;
          if (x > maxx) maxx = x;
          if (y < miny) miny = y;
          if (y > maxy) maxy = y;
        }
      }
    }
    if (minx === Infinity) return null;
    return [minx, miny, maxx, maxy];
  }

  /* Batas jumlah zona yang masih wajar diproses di client. Melewati ini
     biasanya berarti area gambar sangat besar. Lebih baik memberitahu
     pengguna daripada diam-diam memproses sebagian zona saja. */
  var BATAS_ZONA = 400;

  /* Batas berbeda untuk pratinjau. Pratinjau hanya perlu memberi gambaran
     bentuk wilayah, jadi boleh jauh lebih banyak poligon daripada analisis --
     yang analisis perlu menghitung irisan tiap poligon. */
  var BATAS_PRATINJAU = 3000;

  function queryZona(rdtr, outFields, kotak) {
    var of = Array.isArray(outFields) ? outFields.join(',') : String(outFields || 'OBJECTID');
    var q = [
      'where=1%3D1',
      'outFields=' + of,
      'returnGeometry=true',
      'geometry=' + [kotak[0], kotak[1], kotak[2], kotak[3]].join(','),
      'geometryType=esriGeometryEnvelope',
      'inSR=4326',
      'outSR=4326',
      'spatialRel=esriSpatialRelIntersects',
      'resultRecordCount=' + (BATAS_ZONA + 1),
      'f=geojson'
    ];
    var url = HOST_PROXY + DASAR_SERVICES + rdtr.url_mapserver + '/' + rdtr.sublayer + '/query?' + q.join('&');
    return fetchJson(url).then(function (j) {
      if (j && j.error) {
        /* ArcGIS sering membalas 400 dengan pesan KOSONG untuk geometry yang
           tidak bisa diparse. Pesan kosong itu tidak berguna untuk pengguna,
           jadi diganti dengan penjelas yang menunjuk ke penyebab yang mungkin. */
        var pesan = (j.error && j.error.message) || '';
        if (!pesan && (j.error.code === 400 || j.error.code === 404)) {
          pesan = 'ArcGIS menolak query (kode ' + j.error.code + ' tanpa pesan). '
            + 'Penyebab yang mungkin: layer sedang dibebani, atau geometri area di luar cakupan layer.';
        }
        var e = new Error(pesan);
        e.arcgis = j.error.code;
        throw e;
      }
      var f = (j && j.features) || [];
      return { fitur: f, terpotong: f.length > BATAS_ZONA };
    });
  }

  /* ── pemuatan data offline ───────────────────────────────────────────── */

  function punyaCache(key, fn) {
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (inFlight.has(key)) return inFlight.get(key);
    var p = fn().then(function (v) {
      inFlight.delete(key);
      cache.set(key, v);
      return v;
    }).catch(function (e) {
      inFlight.delete(key);
      throw e;
    });
    inFlight.set(key, p);
    return p;
  }

  function muatProvinsi() {
    if (daftarProvinsi) return Promise.resolve(daftarProvinsi);
    if (inFlight.has('prov')) return inFlight.get('prov');
    var p = ambilData('provinces.json').then(function (j) {
      inFlight.delete('prov');
      daftarProvinsi = (j && j.data) || [];
      return daftarProvinsi;
    }).catch(function (e) { inFlight.delete('prov'); throw e; });
    inFlight.set('prov', p);
    return p;
  }

  /* Kabupaten/kota diambil dari KODE_WILAYAH_DATA, yaitu berkas lokal yang
     sudah dimuat halaman ini (assets/data/kode_wilayah.js, dimuat di index.html
     sebelum modul ini), BUKAN dari API GISTARU. Dua alasan:

     1. Berkasnya sudah ada, jadi tidak perlu snapshot baru untuk daftar
        kabupaten/kota.
     2. Daftarnya lebih lengkap. File lokal berisi 514 kabupaten/kota secara
        nasional, sedangkan /cities/{prov} hanya mengembalikan sebagian.
        Untuk Jawa Tengah: 36 di file lokal, 28 dari API, dan yang hilang
        antara lain Kebumen, Wonosobo, Blora, Pemalang, serta Kota Magelang.
        Kabupaten yang tidak ada di API pun tetap bisa dipilih; nanti yang
        terlihat adalah "belum di-build", bukan "tidak ada".

     Kode di file itu memakai titik: "33.01" (5 karakter) untuk kabupaten/kota,
     "33.01.01" (8 karakter) untuk kecamatan, "33.01.01.2001" (13 karakter) untuk
     desa, dan "33" (2 karakter) untuk provinsi. Kode wilayah GISTARU adalah
     10 digit, jadi titik dibuang lalu enam digit nol ditambahkan. */
  function muatKabupaten(kodeProv) {
    var key = 'kab:' + kodeProv;
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (inFlight.has(key)) return inFlight.get(key);
    var p = new Promise(function (res, rej) {
      var data = window.KODE_WILAYAH_DATA;
      if (!data || !data.length) {
        rej(new Error('KODE_WILAYAH_DATA belum termuat'));
        return;
      }
      var pref = kodeProv + '.';
      var out = [];
      for (var i = 0; i < data.length; i++) {
        var k = data[i].kode || '';
        if (k.length !== 5 || k.indexOf(pref) !== 0) continue;
        out.push({ id: k.replace('.', '') + '000000', nama: data[i].nama, kode: k });
      }
      res(out);
    }).then(function (v) {
      inFlight.delete(key);
      cache.set(key, v);
      return v;
    }).catch(function (e) {
      inFlight.delete(key);
      throw e;
    });
    inFlight.set(key, p);
    return p;
  }

  function muatRdtr(idWilayah) {
    return punyaCache('rdtr:' + idWilayah, function () {
      return ambilData('rdtr/' + idWilayah + '.json').then(function (j) { return (j && j.data) || []; });
    });
  }

  function muatKegiatan(idWilayah, idRtr) {
    return punyaCache('keg:' + idWilayah + '/' + idRtr, function () {
      return ambilData('activities/' + idWilayah + '/' + idRtr + '.json').then(function (j) {
        return {
          meta: (j && j._meta) || {},
          zona: (j && j.zona) || [],
          kegiatan: (j && j.kegiatan) || []
        };
      });
    });
  }

  /* Geometri zona, dua sumber.
     UTAMA: berkas lokal assets/data/geooss/zones/{id}/{id_rtr}.json, dibuat
     oleh scripts/build-geooss-zones.mjs. Cadangannya: ArcGIS lewat
     tres/proxy.ashx.

     Local diprioritaskan karena layanan GISTARU sering tidak terjangkau dari
     browser, dan ketika tidak terjangkau modul sebelumnya tidak bisa menilai
     apa pun sama sekali. Penyimpanan lokal tidak bisa dibuat untuk seluruh
     Indonesia -- satu RDTR saja bisa 437 KB setelah disederhanakan, jadi 634
     RDTR akanundreds megabyte -- sehingga cakupannya per kabupaten, dibangun
     sesuai permintaan.

     Bedakan keduanya penting dan harus dinyatakan ke pengguna: zona lokal
     DISEDERHANAKAN 10 meter, jadi luas irisannya perkiraan. Zona dari
     ArcGIS asli, jadi lebih presisi. */
  function muatZonaLokal(idWilayah, idRtr) {
    return punyaCache('zonlokal:' + idWilayah + '/' + idRtr, function () {
      return ambilData('zones/' + idWilayah + '/' + idRtr + '.json').then(function (j) {
        return { meta: (j && j._meta) || {}, zona: (j && j.zona) || [] };
      });
    });
  }

  /* Forma GeoJSON dari zone lokal: satu fitur MultiPolygon per kode zona,
     supaya bisa langsung diiris dan diukur seperti hasil ArcGIS. */
  function zonaLokalKeFitur(data) {
    var fitur = [];
    for (var i = 0; i < data.zona.length; i++) {
      var z = data.zona[i];
      if (!z || !z.rings || !z.rings.length) continue;
      fitur.push({
        type: 'Feature',
        geometry: { type: 'MultiPolygon', coordinates: z.rings.map(function (r) { return [r]; }) },
        properties: {
          KODSZN: z.kode,
          NAMSZN: z.nama,
          NAMZON: z.zona,
          KODZON: z.kode
        }
      });
    }
    return fitur;
  }

  /* ── analisis ────────────────────────────────────────────────────────── */

  function iriskan(zonaFeature, drawnFeature) {
    if (!window.turf) return null;
    try {
      var a = window.turf.rewind(zonaFeature);
      var b = window.turf.rewind(drawnFeature);
      return window.turf.intersect(window.turf.featureCollection([a, b])) || null;
    } catch (e) { return null; }
  }

  /* Status satu zona terhadap SATU kegiatan.
     Penting: yang diperiksa hanya daftar zona milik kegiatan yang dipilih, bukan
     indeks seluruh RDTR. Kalau memakai indeks global, zona yang cocok dengan
     kegiatan lain akan salah dilaporkan sebagai diizinkan.
     'pasti'  : kode zona ada persis di daftar kegiatan terpilih.
     'awalan' : hanya cocok lewat awalan, untuk kode compound. Ditandai terpisah.
     'tidak'  : tidak ada di daftar kegiatan terpilih. */
  function statusZona(kodeZona, diizinkan, zonaKegatan) {
    var kk = kunciZona(kodeZona);
    if (!kk) return 'tidak';
    if (diizinkan.has(kk)) return 'pasti';
    for (var i = 0; i < zonaKegatan.length; i++) {
      if (cocokZona(kodeZona, zonaKegatan[i]) === 'awalan') return 'awalan';
    }
    return 'tidak';
  }

  /* Layer zona memecah satu zona jadi banyak poligon (satu per bidang tanah).
     Poligon Cilacap RDTR 001 mengembalikan 27 fitur untuk 6 kode zona saja.
     Kalau dihitung per fitur, jumlah zona dan luasnya jadi terduplikasi dan
     verdict-nya berdasar angka yang salah. Jadi semua fitur dikelompokkan
     berdasarkan kode zona: luas irisan dijumlahkan, dan nama, wilayah,
     kendala diambil dari fitur pertama yang mengisinya. */
  function grupkanZona(zonaHasil) {
    var peta = new Map();
    var urut = [];
    for (var i = 0; i < zonaHasil.length; i++) {
      var z = zonaHasil[i];
      var k = z.kode || '(tanpa kode)';
      var g = peta.get(k);
      if (!g) {
        g = {
          kode: z.kode,
          nama: z.nama,
          zona: z.zona,
          wilayah: z.wilayah,
          kendala: z.kendala,
          properti: z.properti,
          geometri: z.geometri,
          haIrisan: 0,
          nPoligon: 0,
          haTerukur: false
        };
        peta.set(k, g);
        urut.push(g);
      }
      var ha = z.haIrisan;
      if (ha != null) {
        g.haIrisan += ha;
        g.haTerukur = true;
      }
      g.nPoligon++;
      /* Isi detail yang kosong dari fitur berikutnya, jangan ditimpa. */
      if (!g.nama && z.nama) g.nama = z.nama;
      if (!g.wilayah && z.wilayah) g.wilayah = z.wilayah;
      if (g.kendala && g.kendala.length === 0 && z.kendala && z.kendala.length) g.kendala = z.kendala;
    }
    return urut;
  }

  /* Screening lengkap untuk satu kegiatan terhadap zona yang sudah di-query. */
  function screening(zonaHasil, dataKegiatan, idKegiatan) {
    var i, j;
    var kegiatan = null;
    for (i = 0; i < dataKegiatan.kegiatan.length; i++) {
      if (String(dataKegiatan.kegiatan[i].id) === String(idKegiatan)) {
        kegiatan = dataKegiatan.kegiatan[i];
        break;
      }
    }
    if (!kegiatan) return null;

    /* Kode zona milik kegiatan ini saja, dua bentuk: set kunci kanonik untuk
       pencocokan pasti, dan daftar string mentah untuk pencocokan awalan. */
    var diizinkan = new Set();
    var zonaKegatan = [];
    var zKeg = kegiatan.z || [];
    for (i = 0; i < zKeg.length; i++) {
      var z = dataKegiatan.zona[zKeg[i]];
      if (z == null) continue;
      zonaKegatan.push(z);
      diizinkan.add(kunciZona(z));
    }

    var totalHa = 0, ijinHa = 0, takHa = 0;
    var ijinJumlah = 0, takJumlah = 0, awalanJumlah = 0;
    var detail = [];

    /* KondisI khusus, dikumpulkan per jenis dan per field.
       Dipisah dari `kendala` yang sudah ada supaya satu hal yang jelas:
       yang dihitung di sini hanya zona yang kegiatan ini BENARKAN dipakai.
       Kendala di zona yang tidak mengizinkan kegiatan tidak boleh
       menurunkan verdict -- kalau tidak, hasilnya "Tidak Sesuai" dengan
       alasan LP2B, padahal masalahnya activities yang tidak mengizinkan.
       Itu dua hal berbeda, dan pengguna harus melihat keduanya terpisah. */
    var khusus = { mutlak: new Map(), catat: new Map() };
    var tanpaDaftarZona = !(kegiatan.z || []).length;
    /* LP2B dikumpulkan terpisah dari kendala biasa. Field LP2B_2 ada di
       zona dan tidak butuh request tambahan, jadi promoting-nya ke hasil
       cuma soal mengumpulkannya di sini. */
    var lp2bNama = new Set();
    var lp2bHa = 0;

    for (i = 0; i < zonaHasil.length; i++) {
      var zona = zonaHasil[i];
      var st = statusZona(zona.kode, diizinkan, zonaKegatan);
      var ha = zona.haIrisan != null ? zona.haIrisan : zona.ha;
      totalHa += ha || 0;
      if (st === 'pasti') { ijinJumlah++; ijinHa += ha || 0; }
      else if (st === 'awalan') { awalanJumlah++; ijinHa += ha || 0; }
      else { takJumlah++; takHa += ha || 0; }

      /* Kumpulkan kondisi khusus hanya untuk zona yang diizinkan. Luasnya
         ikut dijumlahkan per field, supaya pengguna melihat "berapa luas
         yang kena", bukan cuma "ada/tidak ada". */
      /* LP2B diambil dari SEMUA zona yang berpotongan, bukan hanya zona yang
         diizinkan. Sawah lp2b yang tidak diizinkan kegiatan ini tetap
         hindrance yang harus disebut -- kalau tidak, pengguna melihat
         "Lahan Pertanian Pangan Berkelanjutan" tidak muncul padahal ada. */
      var vLp2b = zona.properti ? (zona.properti.LP2B_2) : null;
      /* PENTING: harus di-trim SEBELUM dicek. Data GISTARU punya nilai
         " " (satu spasi) di beberapa field -- itulah yang membuat desa
         tidak pernah terisi di alat Cek Lokasi. Tanpa trim, "  " lolos
         dan muncul sebagai nama LP2B, padahal isinya tidak ada. */
      var teksLp2b = vLp2b == null ? '' : String(vLp2b).trim();
      if (teksLp2b && teksLp2b !== '0' && teksLp2b.toLowerCase() !== 'tidak ada') {
        lp2bNama.add(teksLp2b);
        lp2bHa += ha || 0;
      }

      if (st === 'pasti' || st === 'awalan') {
        var daftar = zona.kendala || [];
        for (var q = 0; q < daftar.length; q++) {
          var k = daftar[q];
          var target = KENDALA_MUTLAK_SET.has(k.f) ? khusus.mutlak : khusus.catat;
          if (!KENDALA_MUTLAK_SET.has(k.f) && !KENDALA_CATAT_SET.has(k.f)) continue;
          var lama = target.get(k.f);
          if (lama) {
            lama.jumlah++;
            lama.ha += ha || 0;
            if (lama.zona.indexOf(zona.kode) < 0) lama.zona.push(zona.kode);
          } else {
            target.set(k.f, {
              f: k.f, l: k.l, jumlah: 1, ha: ha || 0, zona: [zona.kode]
            });
          }
        }
      }
      detail.push({ zona: zona, status: st, ha: ha });
    }

    /* "Sesuai Bersyarat" muncul kalau kegiatan INI diizinkan di seluruh zona,
       tapi ada kondisi khusus yang harus dipenuhi. Urutannya penting:
       - ada kendala MUTLAK  -> "Sesuai Bersyarat". Ini yang paling penting,
         karena cagar budaya atau LP2B di tengah lahan berarti tidak bisa
         dianggap bebas masalah meski activities-nya mengizinkan.
       - hanya kendudALA CATAT -> tetap "Sesuai", tapi kendudala ditampilkan
         sebagai catatan. Menaikkan jadi "Bersyarat" untuk catatan yang
         tidak melarang akan membuat labelnya tidak berguna.
      rtlwl       "Tidak Sesuai" dan "Sebagian" tidak pernah naik jadi "Bersyarat", karena
       itu akan menutupi masalah yang lebih besar. */
    var verdict;
    var adaMutlak = khusus.mutlak.size > 0;
    if (!zonaHasil.length) verdict = 'tidak-ada-zona';
    else if (takJumlah === 0) verdict = adaMutlak ? 'bersyarat' : 'sesuai';
    else if (ijinJumlah === 0 && awalanJumlah === 0) verdict = 'tidak-sesuai';
    else verdict = 'sebagian';

    return {
      kegiatan: kegiatan,
      verdict: verdict,
      totalHa: totalHa,
      ijinHa: ijinHa,
      takHa: takHa,
      ijinJumlah: ijinJumlah,
      awalanJumlah: awalanJumlah,
      takJumlah: takJumlah,
      /* Penanda kegiatan tanpa daftar zona dari ATR/BPN. Bukan
         kegagalan parse: nilai_kolom_unik berisi {"data":"-"}. Verdict tetap
         "Tidak Sesuai" karena tidak ada bukti activities mengizinkan, tapi
         teksnya harus berbeda supaya pengguna tidak menyalahkan modul. */
      tanpaDaftarZona: tanpaDaftarZona,
      khusus: {
        mutlak: [...khusus.mutlak.values()].sort(function (a, b) { return b.ha - a.ha; }),
        catat: [...khusus.catat.values()].sort(function (a, b) { return b.ha - a.ha; })
      },
      /* LP2B sebagai hasil, bukan catatan. Luasnya dijumlahkan dari zona
         yang berpotongan, dan daftar nama disimpan terpisah supaya pesan
         bisa menyebut keduanya tanpa mengulangi kata yang sama. */
      lp2b: {
        ha: lp2bHa,
        nama: [...lp2bNama].slice(0, 8),
        jumlahNama: lp2bNama.size
      },
      detail: detail
    };
  }

  /* ── LBS / LSD ────────────────────────────────────────────────────────
     Luas Lahan Baku Sawah dan Lahan Sawah yang Dilindungi di dalam area
     gambar pengguna.

     SUMBER, DAN ALASAN PRIORITASNYA
     -------------------------------
     Dua sumber dipakai, berurutan: GISTARU dulu, BIG sebagai cadangan.

       GISTARU  LSD/LSD_DAL/MapServer/0. Relevan untuk izin karena dari
                ATR/BPN, dan namanya "LSD_12_PROVINSI" -- itu bukan
                kebetulan. Terbukti lewat query: 760.273 fitur, tapi
                WADMPR LIKE '%Jawa%' mengembalikan 0. Tidak ada satu pun
                fitur di Jawa, termasuk Jawa Timur. Jadi untuk sebagian
                besar wilayah Indonesia, termasuk tempat GeoOSS paling
                banyak dipakai, GISTARU TIDAK bisa dipakai.

       BIG      layer 36 (LBS) dan 59 (LSD), sama seperti kartu
                "LBS & LSD" yang sudah ada. Cakupannya jauh lebih luas.

     Konsekuensi: GISTARU-first bukan berarti "lebih baik selalu". Itu
     berarti "lebih otoritas kalau ada". Kalau GISTARU tidak punya data di
     titik itu, modul pindah ke BIG, dan UI HARUS menyebut yang mana yang
     dipakai -- kalau tidak, pengguna mengira angka berasal dari ATR/BPN
     padahal berasal dari peta 1:50.000 BIG.

     ATURAN YANG WAJIB DIPERHATIKAN
     ------------------------------
     LSD adalah SUBSET dari LBS. Luasnya sama persis di dua layer itu. Kalau
     dijumlahkan, luas sawah dilindungi terhitung dua kali dan hasilnya
     lebih besar dari luas sawah itu sendiri. Jadi yang ditampilkan adalah
     dua angka BERTERPISAH, bukan satu total.

     Batas desa TIDAK dipakai. Kartu LBS & LSD memotong dengan poligon desa
     supaya akurat di tepi, tapi batas desa hanya ada di server pihak ketiga
     (smartartstudio) yang bisa mati. Di sini cukup iris langsung dengan
     polygon user -- hasilnya perkiraan di tepi, dan itu dinyatakan.

     Reuse: definisi layer, query bbox, dan penghitung luas diambil dari
     window.GeoTaniLbsLsd supaya tidak ada dua implementasi yang bisa
     berbeda. Yang ditulis di sini hanya orkestrasi dan presentasi. */

  var LSD_SUMBER = {
    gistaru: {
      nama: 'ATR/BPN GISTARU',
      url: HOST_PROXY + DASAR_SERVICES + 'LSD/LSD_DAL/MapServer/0/query',
      outFields: 'LSD,FGSFRF,FKWS,LUASHA,WADMPR,WADMKK'
    },
    big: {
      nama: 'BIG 1:50.000',
      layer: 'LSD'
    }
  };

  /* Query bbox, lalu iris client-side dengan polygon user.
     Alasan memakai bbox dan bukan polygon: layer BIG menolak geometry
     poligon kompleks pada kolom geometry-type polygon tanpa parameter
     tambahan, dan jalur bbox + intersect client-side sudah terbukti
     dipakai di kartu LBS & LSD. */
  function queryBigLbsLsd(layerKey, envelope) {
    var M = window.GeoTaniLbsLsd;
    if (!M || !M.BIG) return Promise.reject(new Error('Modul LBS/LSD belum dimuat.'));
    var layer = layerKey === 'lsd' ? M.LSD : M.LBS;
    var q = [
      'f=json',
      'where=1%3D1',
      'geometry=' + encodeURIComponent(envelope),
      'geometryType=esriGeometryEnvelope',
      'inSR=4326',
      'spatialRel=esriSpatialRelIntersects',
      'outSR=4326',
      'outFields=' + encodeURIComponent(layer.outFields),
      'returnGeometry=true'
    ].join('&');
    return fetch(M.BIG + '/' + layer.id + '/query?' + q).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      return { fitur: (j && j.features) || [], layer: layer };
    });
  }

  /*      Iris satu fitur dengan polygon user. Mengembalikan null kalau tidak
     beririsan, dan luas irisannya dalam satuan hectare. Sama seperti
     clipKeDesa di kartu LBS & LSD, tapi memotong dengan polygon user,
     bukan batas desa. */
  function irisDenganUser(feature, userGeoJSON) {
    var M = window.GeoTaniLbsLsd;
    if (!M) return null;
    if (feature.geometry && feature.geometry.rings) {
      /* Layer BIG menghasilkan esriGeometry, bukan GeoJSON. */
      return M.clipKeDesa(feature, userGeoJSON);
    }
    if (feature.geometry && feature.geometry.type) {
      /* Layer GISTARU lewat proxy mengembalikan GeoJSON. Bentuk berbeda,
         jadi kodenya sendiri, bukan dicoba serobotan. */
      try {
        if (!window.turf || !window.turf.intersect) return null;
        var pieces = window.turf.intersect(window.turf.featureCollection([
          { type: 'Feature', properties: {}, geometry: feature.geometry },
          { type: 'Feature', properties: {}, geometry: userGeoJSON }
        ]));
        if (!pieces) return null;
        var g = pieces.geometry || pieces;
        if (!g || !g.coordinates) return null;
        var coords = [];
        if (g.type === 'Polygon') coords.push(g.coordinates);
        else if (g.type === 'MultiPolygon') coords = g.coordinates;
        if (!coords.length) return null;
        var multi = { type: 'MultiPolygon', coordinates: coords };
        var luasIrisan = hitungLuas(multi);
        var luasPenuh = hitungLuas(feature.geometry);
        return {
          geometry: multi,
          luasIrisanHa: luasIrisan,
          luasGeometriPenuhHa: luasPenuh,
          terpotong: !!(luasPenuh && luasIrisan && luasIrisan < luasPenuh * 0.995)
        };
      } catch (e) { return null; }
    }
    return null;
  }

  /* Feature Leaflet -> GeoJSON Polygon.
     Leaflet memakai [lat, lng]; GeoJSON memakai [lng, lat]. Pertukaran ini
     adalah kesalahan yang TIDAK terlihat: tidak ada error, polygon masih
     valid, hanyalokasinya di belahan bumi yang salah. Dan karena LBS/LSD
     dihitung dari irisan, hasilnya diam-diam nol. */
  function keGeoJSONPolygon(feature) {
    try {
      if (!feature) return null;
      if (feature.toGeoJSON) {
        var g = feature.toGeoJSON();
        if (g && g.type === 'Feature') {
          if (g.geometry.type === 'Polygon') return g.geometry;
          if (g.geometry.type === 'MultiPolygon') return g.geometry;
        }
        if (g && (g.type === 'Polygon' || g.type === 'MultiPolygon')) return g;
      }
      return null;
    } catch (e) { return null; }
  }

  /* Luas dari GeoJSON, memakai geoArea supaya konsisten dengan modul lain. */
  function hitungLuas(geometry) {
    try {
      if (window.geoArea && typeof window.geoArea.areaHaFromGeoJSON === 'function') {
        var v = window.geoArea.areaHaFromGeoJSON(geometry);
        return Number.isFinite(v) ? v : null;
      }
    } catch (e) { /* null */ }
    return null;
  }

  /* =========================================================================
     Analisis LBS/LSD terhadap polygon user.
     Mengembalikan objek yang selalu punya bentuk sama, supaya pemanggil
     tidak perlu memeriksa undefined:

       { tersedia, sumber, lbs: {ha, item[]}, lsd: {ha, item[]},
         lp2b: {ha, nama[]}, catatan: [] }
     ========================================================================= */
  function analisisLbsLsd(userGeometryGeoJSON, ringkasBatas) {
    var M = window.GeoTaniLbsLsd;
    var kosong = {
      tersedia: false, sumber: null,
      lbs: { ha: 0, item: [] }, lsd: { ha: 0, item: [] },
      lp2b: { ha: 0, nama: [] },
      catatan: []
    };
    if (!M) {
      kosong.catatan.push('Modul LBS/LSD belum dimuat, luas sawah tidak dihitung.');
      return Promise.resolve(kosong);
    }
    if (!userGeometryGeoJSON) {
      /* Kalimat ini hampir sama dengan yang sudah muncul di tempat lain:
         "Belum ada zona peruntukan yang berpotongan dengan area gambar",
         yang muncul setelah reset. Dua kalimat itu membingungkan: keduanya
         benar, tapi pengguna bisa membacanya sebagai dua masalah terpisah.
         Yang di sini dinyatakan sekali, dengan akibatnya, supaya jelas
         bahwa luas sawah BUKAN nol -- hanya belum bisa dihitung. */
      kosong.catatan.push('Belum dapat dihitung karena belum ada area gambar. '
        + 'Gambar area usaha terlebih dahulu.');
      return Promise.resolve(kosong);
    }

    /* Bounding box dari geometry user. Bentuknya bisa Polygon (ring satu)
       atau MultiPolygon (beberapa ring). Dua-duanya harus ditangani, dan
       lebih dulu disalin ke holder supaya kumpulkan() tidak perlu
       meneruskannya berulang kali. */
    window.__geoossUserGeometry = userGeometryGeoJSON;
    var rings;
    if (userGeometryGeoJSON.type === 'Polygon') {
      rings = userGeometryGeoJSON.coordinates;
    } else if (userGeometryGeoJSON.type === 'MultiPolygon') {
      rings = [];
      var multi = userGeometryGeoJSON.coordinates || [];
      for (var r = 0; r < multi.length; r++) rings.push(multi[r][0]);
    } else {
      rings = [];
    }
    var box = M.bboxDariRings(rings);
    if (!box) {
      kosong.catatan.push('Batas area gambar tidak terbaca.');
      return Promise.resolve(kosong);
    }

    var M2 = window.GeoTaniLbsLsd;
    var kerja = queryBigLbsLsd('lbs', box.envelope)
      .then(function (r) { return r; })
      .catch(function (e) {
        kosong.catatan.push('Gagal membaca Lahan Baku Sawah dari BIG: ' + (e && e.message ? e.message : 'tidak diketahui'));
        return null;
      });
    var kerjaLsd = queryBigLbsLsd('lsd', box.envelope)
      .then(function (r) { return r; })
      .catch(function (e) {
        kosong.catatan.push('Gagal membaca Lahan Sawah yang Dilindungi dari BIG: ' + (e && e.message ? e.message : 'tidak diketahui'));
        return null;
      });

    return Promise.all([kerja, kerjaLsd]).then(function (hasil) {
      var lbs = hasil[0], lsd = hasil[1];
      if (!lbs && !lsd) return kosong;

      var out = {
        tersedia: true,
        sumber: LSD_SUMBER.big.nama,
        lbs: kumpulkan(lbs, 'q_name19', 'luas_polyg'),
        lsd: kumpulkan(lsd, 'lsd', 'luasha'),
        lp2b: { ha: 0, nama: [] },
        catatan: kosong.catatan.slice()
      };

      /* Guard yang sama seperti kartu LBS & LSD: peta 1:50.000 digambar
         manual, jadi poligon bisa saling menimpa dan penjumlahan bisa
         melebihi luas area gambar sendiri. Ditandai, bukan disembunyikan. */
      if (out.lbs.ha > 0 && out.lsd.ha > out.lbs.ha * 1.02) {
        out.catatan.push('Luas Lahan Sawah yang Dilindungi lebih besar dari Lahan Baku Sawah. '
          + 'Ini bukan kesalahan hitung: peta 1:50.000 BIG punya lubang cakupan di sebagian wilayah, '
          + 'sehingga ada daerah yang digambar LSD tetapi tidak digambar LBS.');
      }
      if (ringkasBatas != null && out.lbs.ha > ringkasBatas * 1.02) {
        out.catatan.push('Jumlah luas Lahan Baku Sawah melebihi luas area gambar. '
          + 'Peta 1:50.000 digambar manual sehingga poligon bisa saling menimpa, '
          + 'dan penjumlahan menghitung sebagian area lebih dari sekali.');
      }
      return out;
    });
  }

  /* Kumpulkan luas irisan per item, dan totalnya. `namaField` dan
     `luasField` berbeda antara LBS (q_name19) dan LSD (lsd), jadi
     keduanya lewat parameter, bukan ditebak. */
  function kumpulkan(hasil, namaField, luasField) {
    var M = window.GeoTaniLbsLsd;
    var out = { ha: 0, item: [] };
    if (!hasil || !hasil.fitur) return out;
    for (var i = 0; i < hasil.fitur.length; i++) {
      var f = hasil.fitur[i];
      var a = f.attributes || {};
      var iris = irisDenganUser(f, window.__geoossUserGeometry);
      if (!iris || !iris.luasIrisanHa) continue;
      out.item.push({
        nama: a[namaField] || '(tanpa nama)',
        luasIrisanHa: iris.luasIrisanHa,
        luasAtribPenuhHa: typeof a[luasField] === 'number' ? a[luasField] : null,
        terpotong: iris.terpotong,
        geometry: iris.geometry
      });
      out.ha += iris.luasIrisanHa;
    }
    out.item.sort(function (a, b) { return b.luasIrisanHa - a.luasIrisanHa; });
    return out;
  }

  /* ── peta ─────────────────────────────────────────────────────────────── */

  function clearMap() {
    if (mapLayer && window.map && window.map.hasLayer(mapLayer)) window.map.removeLayer(mapLayer);
    mapLayer = null;
  }

  /* Menghapus poligon yang digambar pengguna milik GeoOSS.

     Poligon hasil gambar TIDAK milik GeoOSS: alat-draw-measure.js
     menyimpannya di drawLayerGroup, satu grup BERSAMA dengan GeoFarm. Karena
     itu clearDrawings() TIDAK boleh dipakai -- itu akan ikut menghapus
     polygon GeoFarm milik fitur lain, dan itu kerusakan yang jauh lebih
     sulit dilihat daripada garis yang tertinggal.

     drawLayerGroup adalah const di lingkup teratas script klasik, jadi
     terjangkau sebagai identifier telanjang dari script lain -- sama
     seperti `map` di map-core.js. Aksesnya dibungkus try karena kalau script
     itu belum dieksekusi, identifier-nya belum ada. */
  function hapusLayerGambar() {
    if (!layerGambar) return;
    try {
      if (typeof drawLayerGroup !== 'undefined' && drawLayerGroup
        && drawLayerGroup.hasLayer(layerGambar)) {
        drawLayerGroup.removeLayer(layerGambar);
      }
    } catch (e) { /* grup belum siap; lanjutkan */ }
    try {
      if (window.map && window.map.hasLayer(layerGambar)) window.map.removeLayer(layerGambar);
    } catch (e) { /* abaikan */ }
    layerGambar = null;
  }

  /* Layer pratinjau: garis batas zona milik RDTR yang sedang dipilih.

     Tanpa ini, memilih RDTR hanya menggerakkan kamera, dan tidak ada apa pun
     di peta yang menandai mana yang terpilih. Akibatnya pengguna harus
     menebak sendiri batas wilayah yang harus ia gambar, padahal yang perlu
     dilakukan hanya klik di dalam garis yang sudah digambar.

     Gaya digambar sengaja dibuat tipis dan transparan, supaya tidak bersaing
     dengan layer hasil analisis yang warnanya menandai status zona. */
  function clearPratinjau() {
    if (pratinjauLayer && window.map && window.map.hasLayer(pratinjauLayer)) {
      window.map.removeLayer(pratinjauLayer);
    }
    pratinjauLayer = null;
  }

  /* Batas kotak saja, dipakai kalau zona terlalu banyak untuk digambar
     sekaligus. Lebih baik menampilkan kotak yang benar daripada menggambar
     ribuan poligon yang membuat browser tersendat. */
  function gambarKotak(bbox) {
    if (!bbox || !bbox.length || !window.L || !window.map) return false;
    try {
      var rect = window.L.rectangle(
        window.L.latLngBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]]),
        { color: '#0891b2', weight: 2, dashArray: '6,4', fillOpacity: 0.06, interactive: false }
      );
      pratinjauLayer = window.L.featureGroup([rect]).addTo(window.map);
      return true;
    } catch (e) {
      return false;
    }
  }

  function gambarPratinjau(rdtr, bbox) {
    clearPratinjau();
    if (!bbox || !bbox.length || !window.L || !window.map) return false;
    /* Sedikit margin supaya zona di tepi tidak terpotong garis layar. */
    var m = 0.004;
    var kotak = [bbox[0] - m, bbox[1] - m, bbox[2] + m, bbox[3] + m];
    var q = [
      'where=1%3D1',
      'outFields=' + encodeURIComponent(rdtr.kolom_unik || 'OBJECTID'),
      'returnGeometry=true',
      'geometry=' + kotak.join(','),
      'geometryType=esriGeometryEnvelope',
      'inSR=4326',
      'outSR=4326',
      'spatialRel=esriSpatialRelIntersects',
      'resultRecordCount=' + (BATAS_PRATINJAU + 1),
      'f=geojson'
    ];
    var url = HOST_PROXY + DASAR_SERVICES + rdtr.url_mapserver + '/' + rdtr.sublayer + '/query?' + q.join('&');
    return fetchJson(url).then(function (j) {
      if (j && j.error) return gambarKotak(bbox);
      var fitur = (j && j.features) || [];
      if (!fitur.length) return gambarKotak(bbox);
      if (fitur.length > BATAS_PRATINJAU) {
        /* Terlalu banyak. Kotak batas digambar, dan hasilnya diberi tahu. */
        var ok = gambarKotak(bbox);
        if (el && el.status) {
          el.status.textContent = 'Wilayah ' + rdtr.rtr + ' memuat ' + fitur.length.toLocaleString('id-ID')
            + ' bidang zona, terlalu banyak untuk digambar sekaligus. Yang ditampilkan hanya batasnya. '
            + 'Gambar area di dalam kotak itu.';
        }
        return ok;
      }
      var gl = window.L.geoJSON({ type: 'FeatureCollection', features: fitur }, {
        style: { color: '#0891b2', weight: 1, opacity: 0.55, fillColor: '#22d3ee', fillOpacity: 0.05, interactive: false }
      });
      pratinjauLayer = gl.addTo(window.map);
      return true;
    }).catch(function () {
      /* Pratinjau itu kenyamanan, bukan syarat. Kalau gagal, peta tetap bisa
         dipakai dan pengguna tetap bisa menggambar; ketiadaan garis batas
         tidak boleh memblokir seluruh alur. */
      return gambarKotak(bbox);
    });
  }

  /* Terbang ke batas wilayah RDTR. Dipakai saat pengguna memilih RDTR, supaya
     langsung tahu di mana daerah itu berada tanpa harus menggambar buta.
     Pola flyToBounds + pad(0.08) + maxZoom 17 dipakai modul GeoTani lain
     (geotani-lbs-lsd), jadi gerakannya terasa sama dengan kartu di sebelahnya.

     Kegagalan dipulse-return false, bukan dilempar: peta tidak boleh bikin
     seluruh alur berhenti hanya karena satu gerakan kamera gagal. */
  function terbangKe(bbox) {
    if (!bbox || !bbox.length || !isFinite(bbox[0]) || !isFinite(bbox[3])) return false;
    if (!window.map || !window.L) return false;
    try {
      window.map.flyToBounds(
        window.L.latLngBounds([[bbox[1], bbox[0]], [bbox[3], bbox[2]]]).pad(0.08),
        { maxZoom: 17, duration: 0.8 }
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  var WARNA = {
    sesuai: { isi: '#16a34a', fill: '#22c55e' },
    sebagian: { isi: '#d97706', fill: '#f59e0b' },
    'tidak-sesuai': { isi: '#dc2626', fill: '#ef4444' },
    netral: { isi: '#0891b2', fill: '#22d3ee' }
  };

  /* Menambar zona hasil.
     PENTING: style diberikan sebagai OBJEK, bukan fungsi, dan satu
     L.geoJSON dibuat per zona.

     Alasannya ada bug nyata dari pengguna: "Cannot read properties of
     undefined (reading '_warna')". Leaflet memanggil fungsi style sebagai
     e(t.feature), jadi fungsi kita menerima t.feature. Di kondisi nyata
     t.feature itu undefined, sehingga f.feature._warna langsung melempar --
     dan seluruh hasil screening hilang karena satu pembacaan properti.

     Dengan objek literal, Leaflet tidak memanggil callback apa pun, jadi
     tidak ada yang bisa undefined. Jumlahnya kecil (6 sampai 40 zona untuk
     satu bidang tanah), jadi memecah per zona tidak menimbulkan masalah performa.
     _warna dihapus seluruhnya: menaruh warna di luar `properties` adalah
     gaya tidak baku, dan justru itu yang membuat jalur bacanya rapuh. */
  function gambar(zonaHasil) {
    clearMap();
    /* Pratinjau RDTR sudah tidak relevan begitu zona hasil mulai digambar;
       membiarkannya membuat peta penuh garis yang tidak menjelaskan apa pun. */
    clearPratinjau();
    if (!zonaHasil.length || !window.L || !window.map) return false;
    var L = window.L;
    var lapisan = [];
    var i;

    for (i = 0; i < zonaHasil.length; i++) {
      var z = zonaHasil[i];
      /* Zona tanpa geometri dilewati. Dulu ini diteruskan apa adanya, dan
         Leaflet mengembalikan null tanpa memberi tanda, jadi hasilnya hilang
         tanpa penjelasan. */
      if (!z || !z.geometri) continue;
      var w = WARNA[z.status || 'netral'] || WARNA.netral;
      var gl = L.geoJSON({
        type: 'Feature',
        geometry: z.geometri,
        properties: { nama: z.nama, kode: z.kode, status: z.status }
      }, {
        style: { color: w.isi, weight: 2, fillColor: w.fill, fillOpacity: 0.28 }
      });
      if (gl) lapisan.push(gl);
    }

    if (!lapisan.length) return false;
    mapLayer = L.featureGroup(lapisan).addTo(window.map);
    return true;
  }

  function zonaDariFitur(ft, kolomUnik, drawn) {
    var p = ft.properties || {};
    var kode = p[kolomUnik];
    if (kode == null || kode === '') kode = p.KODSZN != null && p.KODSZN !== '' ? p.KODSZN : p.KODZON;
    var iris = iriskan(ft, drawn);
    var ha = iris ? luasHa(iris) : null;
    return {
      kode: kode == null ? '' : String(kode),
      nama: p.NAMSZN || p.NAMZON || p.NAMOBJ || '(tanpa nama)',
      zona: p.NAMZON || '',
      wilayah: [p.WADMKD, p.WADMKC, p.WADMKK].filter(function (x) { return x; }).join(' / '),
      haIrisan: ha,
      ha: null,
      geometri: ft.geometry,
      properti: p,
      kendala: kendalas(p)
    };
  }

  function kendalas(p) {
    var out = [];
    for (var i = 0; i < KENDALA.length; i++) {
      var v = p[KENDALA[i].f];
      if (v == null || v === '' || v === 0 || v === '0') continue;
      out.push({ f: KENDALA[i].f, l: KENDALA[i].l, v: String(v) });
    }
    return out;
  }

  /* ── render ──────────────────────────────────────────────────────────── */

  var LABEL_VERDICT = {
    sesuai: 'SESUAI',
    bersyarat: 'SESUAI BERSYARAT',
    sebagian: 'SEBAGIAN',
    'tidak-sesuai': 'TIDAK SESUAI',
    'tidak-ada-zona': 'TIDAK ADA ZONA'
  };

     /* Penjelasan singkat untuk setiap verdict. Ditampilkan di bawah label,
        karena label saja tanpa alasan akan membuat pengguna salah paham.
        "Sesuai" dan "Sesuai Bersyarat" bedanya sangat halus secara visual,
        jadi dua kalimat penjelasan inilah yang sebenarnya membedakan. */
  var CARA_VERDICT = {
    sesuai: 'Semua zona yang berpotongan mengizinkan kegiatan ini, dan tidak ada '
      + 'kondisi khusus yang melarang.',
    bersyarat: 'Semua zona mengizinkan kegiatan ini, tapi ada kondisi khusus yang '
      + 'harus dipenuhi lebih dulu. Lihat daftar di bawah.',
    sebagian: 'Hanya sebagian zona yang mengizinkan kegiatan ini. Area yang '
      + 'tidak diizinkan perlu dipindah atau dikecualikan.',
    'tidak-sesuai': 'Tidak ada zona di area gambar yang mengizinkan kegiatan ini. '
      + 'Periksa kembali jenis kegiatan dan RDTR yang dipilih.',
    'tidak-ada-zona': 'Area gambar tidak berpotongan dengan zona peruntukan mana pun '
      + 'pada RDTR yang dipilih.'
  };

  function ringkasanHtml(s) {
    if (!s) return '';
    /* "bersyarat" memakai kelas warn, bukan ok. Activities-nya memang
       mengizinkan, tapi ada yang harus dipenuhi, jadi warna hijau akan
       menyesatkan. */
    var kelas = s.verdict === 'sesuai' ? 'is-ok'
      : (s.verdict === 'bersyarat' || s.verdict === 'sebagian' ? 'is-warn' : 'is-bad');
    var h = '<div class="geooss-verdict ' + kelas + '">';
    h += '<b>' + LABEL_VERDICT[s.verdict] + '</b> untuk kegiatan &ldquo;' + esc(s.kegiatan.nama) + '&rdquo;';
    h += '</div>';

    if (CARA_VERDICT[s.verdict]) {
      h += '<div class="geotani-sls-desc" style="margin-top:4px;">' + CARA_VERDICT[s.verdict] + '</div>';
    }

    /* Kegiatan tanpa daftar zona dari ATR/BPN. Verdict-nya "Tidak Sesuai"
       karena tidak ada bukti activities mengizinkan, tapi alasannya berbeda
       dan harus disebut supaya pengguna tidak menyimpulkan modulnya salah. */
    if (s.tanpaDaftarZona) {
      h += '<div class="geooss-warn"><b>ATR/BPN tidak mencantumkan zona untuk kegiatan ini.</b><br>'
        + 'Daftar kegiatan di sumber data tidak berisi kode zona, jadi modul '
        + 'tidak bisa memastikan apakah kegiatan ini diizinkan. Ini kekurangan data '
        + 'di sisi ATR/BPN, bukan kesalahan di modul ini. Konfirmasi langsung ke '
        + 'pemprov setempat sebelum memproses.</div>';
    }

    h += '<div class="geotani-sls-desc" style="margin-top:6px;">Dari ';
    h += '<b>' + nomor(s.ijinJumlah + s.awalanJumlah) + '</b> zona yang berpotongan dengan area gambar, ';
    h += '<b>' + nomor(s.takJumlah) + '</b> zona tidak mengizinkan kegiatan ini. ';
    h += 'Luas zona: <b>' + fmtHa(s.ijinHa) + '</b> diizinkan, <b>' + fmtHa(s.takHa) + '</b> tidak diizinkan';
    h += ' (total ' + fmtHa(s.totalHa) + ')';
    if (s.haGambar != null) {
      /* Luas area gambar dipakai sebagai pembanding, bukan penyebut. Irisan
         zona bisa lebih kecil dari area gambar kalau ada sebagian yang di luar
         RDTR terpilih, dan selisih itu sendiri informasi yang berguna. */
      h += '. Area gambar sendiri <b>' + fmtHa(s.haGambar) + '</b>';
      if (s.totalHa > 0) h += ', jadi <b>' + pct((s.totalHa / s.haGambar) * 100) + '</b> area gambar tertutup zona';
    }
    h += '.</div>';

    if (s.awalanJumlah) {
      h += '<div class="geooss-warn">' + nomor(s.awalanJumlah) + ' zona hanya cocok lewat pencocokan awalan, ';
      h += 'karena kode zonanya berisi teks atribut, bukan kode singkat. Periksa manual sebelum dipakai bermohon.</div>';
    }

    /* Luas Lahan Baku Sawah / Dilindungi. Dua angka TERPISAH, bukan satu
       total: LSD adalah subset dari LBS, jadi menjumlahkannya menghitung
       sawah dilindungi dua kali. */
    if (s.lbsLsd && s.lbsLsd.tersedia) {
      h += '<div class="geooss-sawah">';
      h += '<b>Lahan sawah di dalam area gambar</b>';
      h += '<table class="geooss-sawah-tabel"><tbody>';
      h += '<tr><th>Lahan Baku Sawah</th><td><b>' + fmtHa(s.lbsLsd.lbs.ha) + '</b></td></tr>';
      h += '<tr><th>Lahan Sawah yang Dilindungi</th><td><b>' + fmtHa(s.lbsLsd.lsd.ha) + '</b></td></tr>';
      h += '</tbody></table>';
      h += '<div class="geooss-sawah-kecil">Sumber peta: ' + esc(s.lbsLsd.sumber)
        + ' skala 1:50.000. Luas dihitung dari irisan dengan area gambar, '
        + 'jadi di tepi wilayah angka ini perkiraan.</div>';
      /* Satu baris eksplisit soal subset. Tanpa ini, pengguna bisa
         menjumlahkan sendiri dan mendapat luas yang lebih besar dari luas
         sawahnya. */
      h += '<div class="geooss-sawah-kecil">Lahan Sawah yang Dilindungi '
        + 'sudah termasuk di dalam Lahan Baku Sawah, jadi kedua angka ini '
        + '<b>jumlahkan</b>.</div>';
      for (var c = 0; c < (s.lbsLsd.catatan || []).length; c++) {
        h += '<div class="geooss-sawah-catatan">' + esc(s.lbsLsd.catatan[c]) + '</div>';
      }
      h += '</div>';
    } else if (s.lbsLsd && s.lbsLsd.catatan && s.lbsLsd.catatan.length) {
      /* Belum bisa dihitung, tapi ada alasannya. Menampilkan alasannya
         lebih berguna daripada diam, supaya pengguna tahu ini bukan
         kelalaian modul.

         Judulnya menyebut KEDUA nama lahannya, bukan cuma "Lahan sawah".
         Kalau hanya disebut umum, pengguna tidak bisa tahu bagian mana
         yang belum terisi saat membacanya di daftar isi. */
      h += '<div class="geooss-sawah geooss-sawah--kosong">';
      h += '<b>Lahan Baku Sawah dan Lahan Sawah yang Dilindungi</b>';
      for (var k = 0; k < s.lbsLsd.catatan.length; k++) {
        h += '<div class="geooss-sawah-kecil">' + esc(s.lbsLsd.catatan[k]) + '</div>';
      }
      h += '</div>';
    }

    /* LP2B: field LP2B_2 per zona, sudah dibaca GeoOSS tanpa request
       tambahan.

       Dicetak DI LUAR blok LBS/LSD, bukan di dalam. Dua-duanya punya
       sumber berbeda -- LP2B dari RDTR per zona, LBS/LSD dari peta
       1:50.000 -- jadi kegagalan satu tidak boleh menghilangkan yang
       lain. Versi pertama mencetaknya di dalam blok LBS/LSD, dan LP2B
       ikut hilang setiap kali BIG timeout. Test yang menemukan itu. */
    if (s.lp2b && s.lp2b.nama.length) {
      h += '<div class="geooss-sawah">';
      h += '<b>Lahan Pertanian Pangan Berkelindungi (LP2B)</b>';
      h += '<table class="geooss-sawah-tabel"><tbody>';
      h += '<tr><th>Luas LP2B</th><td><b>' + fmtHa(s.lp2b.ha) + '</b></td></tr>';
      h += '<tr><th>Zona</th><td>' + esc(s.lp2b.nama.join(', '));
      if (s.lp2b.jumlahNama > s.lp2b.nama.length) {
        h += ', dan ' + nomor(s.lp2b.jumlahNama - s.lp2b.nama.length) + ' zona lain';
      }
      h += '</td></tr>';
      h += '</tbody></table>';
      h += '<div class="geooss-sawah-kecil">Sumber: field LP2B di RDTR yang dipilih. '
        + 'Tidak perlu request tambahan, jadi tetap tampil walau peta sawah gagal dibaca.</div>';
      h += '</div>';
    }

    h += ketentuanKhususHtml(s);
    return h;
  }

  /* ── OUTPUT: Pre-check KKPR ──────────────────────────────────────────
     Satu blok ringkasan yang bisa dibaca siapa pun, dan link ke OSS resmi.
     Tidak ada tombol unduh: pengguna minta cukup di layar.

     Yang ditampilkan berurutan seperti alur yang diminta: lokasi, luas,
     kegiatan, zonasi, ketentuan intensitas, ketentuan khusus. Urutan itu
     bukan hiasan -- orang membacanya berurutan, jadi informasi yang
     menentukan (apakah zona mengizinkan) harus muncul sebelum catatan
     pelengkap.

     PENTING SOAL LINK OSS
     ---------------------
     Link menuju portal resmi oss.go.id. Target="_blank" disertai
     rel="noopener noreferrer" supaya halaman situs ini tidak bisa
     membaca halaman OSS lewat window.opener. Tanpa noopener, situs
     yang dibuka dari tab kita bisa mengubah halaman asli kita. */
  var URL_OSS = 'https://oss.go.id/';

  function precheckHtml(s) {
    if (!s) return '';
    var st = state || {};
    var h = '<div class="geooss-precheck">';

    h += '<div class="geooss-precheck-judul">';
    h += '<b>Pre-check KKPR</b>';
    h += '<span>Pemeriksaan awal, bukan keputusan izin. Lanjut ke OSS untuk pengajuan resmi.</span>';
    h += '</div>';

    h += '<table class="geooss-precheck-tabel"><tbody>';

    /* Lokasi. Desa dan kecamatan diambil dari zona yang berpotongan, karena
       satu area bisa memotong beberapa desa -- jadi seluruhnya ditampilkan,
       bukan hanya yang pertama. */
    var wilayah = [];
    for (var i = 0; i < s.detail.length; i++) {
      var w = s.detail[i].zona.wilayah;
      if (w && wilayah.indexOf(w) < 0) wilayah.push(w);
    }
    h += '<tr><th>Lokasi</th><td>'
      + (wilayah.length ? esc(wilayah.join(', ')) : 'tidak tersedia di data zona')
      + (st.kab ? '<br><span class="geooss-precheck-kecil">' + esc(st.kab.nama) + '</span>' : '')
      + '</td></tr>';

    h += '<tr><th>Luas area</th><td><b>' + fmtHa(s.haGambar != null ? s.haGambar : s.totalHa) + '</b>';
    if (s.haGambar != null && s.totalHa > 0) {
      h += '<span class="geooss-precheck-kecil">'
        + fmtHa(s.totalHa) + ' tertutup zona peruntukan (' + pct((s.totalHa / s.haGambar) * 100) + ')</span>';
    }
    h += '</td></tr>';

    h += '<tr><th>RDTR</th><td>' + esc(st.rdtr ? st.rdtr.rtr : '-') + '</td></tr>';

    h += '<tr><th>Kegiatan</th><td>' + esc(s.kegiatan.nama);
    /* Id kegiatan ditampilkan kalau ada: itu yang dicari pemohon kalau
       perlu konfirmasi ke pemprov. */
    if (s.kegiatan.id != null) {
      h += '<span class="geooss-precheck-kecil">kode ' + esc(s.kegiatan.id) + '</span>';
    }
    h += '</td></tr>';

    h += '<tr><th>Hasil kesesuaian</th><td><b>' + LABEL_VERDICT[s.verdict] + '</b>'
      + '<span class="geooss-precheck-kecil">' + nomor(s.ijinJumlah + s.awalanJumlah)
      + ' dari ' + nomor(s.detail.length) + ' zona mengizinkan</span></td></tr>';

    /* Zonasi: daftar kode zona yang benar-benar menyinggung area gambar.
      .batasi 12 supaya tabel tidak jadi tidak terbaca di ponsel. */
    var kodeZona = [];
    for (var q = 0; q < s.detail.length; q++) {
      var kz = s.detail[q].zona.kode;
      if (kz && kodeZona.indexOf(kz) < 0) kodeZona.push(kz);
    }
    h += '<tr><th>Zonasi</th><td>';
    if (!kodeZona.length) {
      h += '<span class="geooss-precheck-kecil">tidak ada</span>';
    } else if (kodeZona.length <= 12) {
      h += '<span class="geooss-precheck-kode">' + esc(kodeZona.join(', ')) + '</span>';
    } else {
      h += '<span class="geooss-precheck-kode">' + esc(kodeZona.slice(0, 12).join(', ')) + '</span>'
        + '<span class="geooss-precheck-kecil">dan ' + nomor(kodeZona.length - 12)
        + ' kode lainnya, lihat tabel zona di atas</span>';
    }
    h += '</td></tr>';

    /* Intensitas: tidak ada di sumber data. Dinyatakan, bukan dikarang. */
    h += '<tr><th>Ketentuan intensitas</th><td>'
      + '<span class="geooss-precheck-kecil">Belum tersedia. Peta zona ATR/BPN tidak memuat '
      + 'koefisien bangunan (KDB, KLB, KPR), jadi modul ini tidak menampilkan '
      + 'angka intensitas. Hitung dari dokumen RDTR atau tanyakan ke pemprov.</span>'
      + '</td></tr>';

    h += '</tbody></table>';

    /* Ketentuan khusus, diringkas. Rinciannya sudah ada di blok sebelumnya,
       jadi di sini cukup jumlah dan nama supaya ringkasan tetap utuh. */
    var k = s.khusus || { mutlak: [], catat: [] };
    h += '<div class="geooss-precheck-syarat">';
    if (k.mutlak.length) {
      h += '<b>Ketentuan khusus:</b> ';
      h += esc(k.mutlak.map(function (x) { return x.l; }).join(', '));
    } else if (k.catat.length) {
      h += '<b>Perlu diperiksa:</b> ';
      h += esc(k.catat.map(function (x) { return x.l; }).join(', '));
    } else {
      h += '<b>Ketentuan khusus:</b> tidak ada pada zona yang diizinkan.';
    }
    h += '</div>';

    h += '<a class="geooss-precheck-oss" href="' + esc(URL_OSS) + '" target="_blank" rel="noopener noreferrer">';
    h += 'Lanjut ke OSS &rarr;';
    h += '<span>oss.go.id &mdash; pengajuan izin resmi dilakukan di sana</span>';
    h += '</a>';

    h += '<div class="geooss-precheck-simmerah">';
    h += 'GeoOSS memeriksa zona peruntukan yang sudah dipublikasikan. Ia tidak ';
    h += 'memeriksa semua ketentuan perizinan, dan hasilnya bukan keputusan. ';
    h += 'Keputusan tetap dibuat OSS, ATR-BPN, dan Pemerintah Daerah.';
    h += '</div>';

    h += '</div>';
    return h;
  }

  /* Ketentuan khusus dan ketentuan intensitas, sesuai urutan yang diminta:
    zonasi, lalu ketentuan kegiatan, lalu kesesuaian, lalu daftar syarat yang
     harus dipenuhi.

     PERBEDAAN PENTING DI SINI
     -------------------------
    /* Ketentuan INTENSITAS tidak bisa diisi. Layer zona GISTARU tidak punya
     field intensitas: tidak ada KDB, KLB, KPR, atau sejenisnya. Satu-satunya
     kandidat, TPZ_00 "Teknik Pengaturan Zonasi", bernilai "Tidak Ada" pada
     zona yang benar-benar diperiksa. Menampilkan angka intensitas yang tidak
     ada dasarnya akan jauh lebih berbahaya daripada menyatakan belum ada,
     karena angka itu akan dipakai orang untuk menghitung koefisien bangunan.

     Yang ditulis untuk intensitas adalah blok kosong yang menyebut alasannya.
     Kalau nanti ATR/BPN menambah field-nya, blok ini tinggal diisi -- tidak
     perlu mengubah struktur hasil. */
  function ketentuanKhususHtml(s) {
    if (!s || !s.khusus) return '';
    var h = '';
    var k = s.khusus;

    if (k.mutlak.length) {
      h += '<div class="geooss-khusus">';
      h += '<b>Ketentuan khusus yang harus dipenuhi</b><br>';
      h += '<span class="geooss-khusus-ket">Zona di bawah mengizinkan kegiatan ini, '
        + 'tapi punya overlay yang tidak boleh diabaikan.</span>';
      h += '<table class="geooss-khusus-tabel"><tbody>';
      for (var i = 0; i < k.mutlak.length; i++) {
        h += '<tr><td>' + esc(k.mutlak[i].l) + '</td>'
          + '<td class="geooss-khusus-ha">' + fmtHa(k.mutlak[i].ha) + '</td>'
          + '<td class="geooss-khusus-zona">' + nomor(k.mutlak[i].jumlah) + ' zona</td></tr>';
      }
      h += '</tbody></table></div>';
    }

    if (k.catat.length) {
      h += '<div class="geooss-khusus geooss-khusus--ringan">';
      h += '<b>Perlu diperiksa</b><br>';
      h += '<span class="geooss-khusus-ket">Tidak melarang, tapi wajib ditanyakan ke desa.</span>';
      h += '<table class="geooss-khusus-tabel"><tbody>';
      for (var c = 0; c < k.catat.length; c++) {
        h += '<tr><td>' + esc(k.catat[c].l) + '</td>'
          + '<td class="geooss-khusus-ha">' + fmtHa(k.catat[c].ha) + '</td>'
          + '<td class="geooss-khusus-zona">' + nomor(k.catat[c].jumlah) + ' zona</td></tr>';
      }
      h += '</tbody></table></div>';
    }

    h += '<div class="geooss-khusus geooss-khusus--kosong">';
    h += '<b>Ketentuan intensitas</b><br>';
    h += '<span class="geooss-khusus-ket">Belum tersedia di sumber data. Peta zona dari '
      + 'ATR/BPN tidak memuat ketentuan koefisien bangunan seperti KDB, KLB, atau KPR, '
      + 'jadi modul ini tidak menampilkan angka intensitas. Hitung sendiri dari '
      + 'dokumen RDTR atau tanyakan langsung ke pemprov. Menampilkan angka yang '
      + 'tidak ada sumbernya akan menyesatkan.</span></div>';

    return h;
  }

  function daftarZonaHtml(zonaHasil, s) {
    var petaStatus = {};
    if (s) for (var q = 0; q < s.detail.length; q++) petaStatus[s.detail[q].zona.kode + '|' + q] = s.detail[q].status;

    var h = '<div class="geooss-zona-wrap"><table class="geooss-zona"><thead><tr>';
    h += '<th>Zona</th><th>Kode</th><th>Luas irisan</th><th>Wilayah</th><th>Status</th><th>Kendala</th>';
    h += '</tr></thead><tbody>';
    for (var i = 0; i < zonaHasil.length; i++) {
      var z = zonaHasil[i];
      var st = s ? null : (z.status || 'netral');
      var barisSt = '-';
      if (s) {
        for (var k = 0; k < s.detail.length; k++) {
          if (s.detail[k].zona === z) {
            st = s.detail[k].status;
            barisSt = st === 'pasti' ? 'diizinkan' : (st === 'awalan' ? 'diizinkan (awalan)' : 'tidak diizinkan');
            break;
          }
        }
      }
      h += '<tr>';
      h += '<td>' + esc(z.nama) + '</td>';
      h += '<td><span class="geooss-kode">' + esc(z.kode) + '</span></td>';
      h += '<td>' + fmtHa(z.haIrisan) + '</td>';
      h += '<td>' + esc(z.wilayah || '-') + '</td>';
      h += '<td class="geooss-st-' + esc(st || 'netral') + '">' + esc(barisSt) + '</td>';
      h += '<td>' + (z.kendala.length
        ? z.kendala.map(function (k) { return '<span class="geooss-kendala" title="' + esc(k.f) + '">' + esc(k.l) + ': ' + esc(k.v) + '</span>'; }).join(' ')
        : '<span class="geooss-kosong">-</span>') + '</td>';
      h += '</tr>';
    }
    h += '</tbody></table></div>';
    return h;
  }

  function dasarHtml(hasil) {
    var r = hasil.rdtr;
    var h = '<div class="geooss-dasar">';
    h += '<div><b>Kabupaten/Kota</b> ' + esc(hasil.kab ? hasil.kab.nama : '-') + '</div>';
    h += '<div><b>RDTR</b> ' + esc(r.rtr) + '</div>';
    h += '<div><b>Field kode zona</b> <span class="geooss-kode">' + esc(r.kolom_unik) + '</span></div>';
    if (r.integration_date) h += '<div><b>Integrasi</b> ' + esc(r.integration_date) + '</div>';
    h += '</div>';
    var perda = (hasil.zona && hasil.zona[0] && (hasil.zona[0].properti.PP || hasil.zona[0].properti.NOTHPR)) || '';
    if (perda) h += '<div class="geooss-dasar"><div><b>Dasar peraturan</b> ' + esc(perda) + '</div></div>';
    /* Sumber zona TIDAK lagi dicetak di sini. Dulu ada baris
       "Sumber peta zona" di sini DAN baris "Sumber zona dan peruntukan" di
       kreditHtml, jadi dua atribusi sumber tampil bersamaan dan saling
       tumpang tindih. Sekarang kreditHtml satu-satunya yang menyebut sumber,
       jadi tidak ada yang terulang dan tidak ada dua versi yang berbeda. */
    return h;
  }

  /* Credit: satu blok, satu kali. Isinya dua lapis.
     Lapis utama, dibaca pengguna awam: dari mana peta zona dan daftar
     kegiatan berasal, dengan perbedaan ketelitian yang harus diketahui.
     Lapis kedua, kecil dan redup: nama folder MapServer dan URL API
     lengkap, yang berguna untuk pengelola situs tapi tidak perlu mengganggu
     pengguna yang hanya mau tahu hasilnya bisa dipercaya atau tidak.

     Perbedaan ketelitian HARUS disebut, karena dua sumber itu tidak setara:
     zona yang diambil langsung dari ATR/BPN asli, sedangkan zona dari salinan
     lokal sudah disederhanakan sehingga luas irisannya perkiraan. */
  function kreditHtml(hasil) {
    var lokal = hasil.sumber === 'lokal';
    var tol = (hasil.toleransiZona != null) ? hasil.toleransiZona : 10;
    var h = '<div class="geotani-sls-desc" style="margin-top:10px;font-size:10px;opacity:.75;">';

    if (lokal) {
      h += 'Peta zona diambil dari salinan lokal di RuangKita, sudah disederhanakan '
        + tol + ' meter, jadi <b>luas yang tertera adalah perkiraan</b>. ';
    } else {
      h += 'Peta zona diambil langsung dari server ATR/BPN, jadi luasnya hasil perhitungan. ';
    }
    h += 'Daftar kegiatan per zona mengikuti RDTR yang dipublikasikan pemerintah daerah. '
      + 'Status di atas hanya mencerminkan zona peruntukan itu, bukan penilaian kelayakan.';

    h += '<br>GeoOSS adalah pemeriksaan awal, bukan keputusan izin, dan bukan pengganti OSS, '
      + 'ATR-BPN, atau Pemerintah Daerah. Keputusan tetap melalui analisis lapangan dan '
      + 'perizinan resmi.';

    /* Credit dipangkas jadi satu kalimat. Nama folder MapServer, URL API
       bertanda kueri, dan tanggal snapshot sengaja dibuang dari layar:
       tidak ada gunanya bagi pengguna yang hanya mau tahu boleh tidaknya
       sebuah lahan dipakai. Yang tersisa adalah nama lembaga, supaya
       hasilnya tetap bisa ditelusuri kalau mau ditanyakan lebih lanjut.
       Rincian teknisnya ada di dokumentasi modul, bukan di tampilan. */
    h += '<br><span class="geooss-detail">Sumber data: ATR/BPN GISTARU.</span>';

    h += '</div>';
    return h;
  }

  /* ── init dan UI ─────────────────────────────────────────────────────── */

  var el = {};

  /* Isi ulang sebuah <select>.
     Parameter kelima, terpilih, dipakai untuk memulihkan nilai SEBELUMNYA
     setelah opsi dibangun ulang. Tanpa itu, membangun ulang dropdown akan
     membuat browser memilih <option> pertama, yaitu placeholder kosong --
     dan itu diam-diam menghapus pilihan pengguna. Ini sempat terjadi di
     dropdown RDTR, yang membuat tombol gambar selalu menganggap belum ada
     RDTR terpilih padahal peta sudah bergerak ke sana. */
  function isiSelect(sel, items, labelFn, placeholder, terpilih) {
    if (!sel) return;
    var nilaiLama = terpilih != null ? terpilih : sel.value;
    sel.innerHTML = '';
    var o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = placeholder;
    sel.appendChild(o0);
    var ada = false;
    for (var i = 0; i < items.length; i++) {
      var o = document.createElement('option');
      o.value = items[i].value;
      o.textContent = labelFn(items[i]);
      sel.appendChild(o);
      if (String(o.value) === String(nilaiLama)) ada = true;
    }
    /* Dipulihkan hanya kalau nilainya benar-benar ada di daftar baru. Kalau
       tidak, biarkan placeholder yang terpilih -- itu lebih jujur daripada
       mempertahankan nilai yang tidak lagi relevan. */
    if (ada && nilaiLama !== '') sel.value = String(nilaiLama);
    else sel.value = '';
  }

  /* Pesan untuk PENGGUNA, bukan untuk pengembang. Dua aturan yang dipegang di
     sini:
       1. Tidak ada istilah teknis. Tidak ada "snapshot", "repo", "berkas JSON",
          atau perintah terminal di bagian yang dibaca orang awam.
       2. Selalu sebut apa yang TIDAK bisa dilakukan, lalu apa yang harus
          dilakukan. "Data belum ada" tanpa penjelasan akan disalahartikan
          sebagai "wilayah ini tidak boleh dibangun".

     Detail teknis tetap ada, tapi di baris paling bawah dan diberi label,
     supaya tidak menutupi pesan utamanya. */
  function pesanBelumDiBuild(rel) {
    return '<div class="geooss-warn">'
      + '<b>Data kegiatan untuk wilayah ini belum tersedia di RuangKita.</b><br>'
      + 'Wilayah ini sudah punya peta zona, tetapi daftar kegiatan yang diizinkan di '
      + 'setiap zona belum dimuat. Karena itu GeoOSS belum bisa menjawab apakah '
      + 'kegiatan pilihan Anda sesuai atau tidak di sini.<br><br>'
      + 'Ini <b>bukan</b> berarti wilayah ini tidak boleh dibangun, dan juga bukan berarti '
      + 'wilayah ini tidak punya rencana tata ruang. Hanya berarti RuangKita belum punya '
      + 'daftar kegiatannya. Silakan laporkan wilayah ini ke pengelola RuangKita agar '
      + 'datanya ditambahkan.'
      + (rel ? '<br><br><span class="geooss-detail">Detail teknis: berkas '
        + esc(rel) + ' belum ada di repositori.</span>' : '')
      + '</div>';
  }

  function pesanGagal(err) {
    /* Urutan penting. Kegagalan berkas lokal diperiksa LEBIH DAHULU, karena
       gejalanya (Failed to fetch) identik dengan kegagalan jaringan, dan
       melaporkannya sebagai "masalah ATR/BPN" akan mengarahkan orang
      komplain ke pihak yang salah. */
    if (err && err.kode === 'belum-di-build') {
      return pesanBelumDiBuild(err.rel || '');
    }
    if (err && err.kode === 'dibuka-sebagai-berkas') {
      return '<div class="geooss-warn"><b>Halaman ini sedang dibuka langsung dari berkas komputer.</b><br>'
        + 'Browser tidak mengizinkan pembacaan berkas lokal seperti itu, jadi GeoOSS tidak '
        + 'bisa memuat data wilayah.<br>'
        + 'Pengelola situs: jalankan lewat server lokal, misalnya <code>npx serve .</code>, '
        + 'lalu buka <code>http://localhost:3000</code>. Ini bukan masalah ATR/BPN.</div>';
    }
    if (err && err.sumber === 'lokal') {
      var ket = err.jaringan
        ? 'koneksi terputus, atau diblokir oleh ekstensi browser'
        : ('status HTTP ' + (err.status || '?'));
        return '<div class="geooss-warn"><b>Data wilayah gagal dimuat dari RuangKita (' + esc(ket) + ').</b><br>'
        + 'Ini masalah di sisi halaman atau koneksi Anda, bukan masalah ATR/BPN. '
        + 'Coba muat ulang halaman. Jika tetap gagal, kemungkinan ada ekstensi browser yang '
        + 'memblokir permintaan.</div>';
    }

    var m = err && err.message ? err.message : 'tidak diketahui';

    if (err && err.arcgis === 400) {
      return '<div class="geooss-warn"><b>ATR/BPN menolak permintaan peta zona ini.</b><br>'
        + 'Penyebab yang paling sering: area gambar berada di luar wilayah RDTR yang Anda pilih, '
        + 'atau layanan sedang sibuk. Silakan coba lagi beberapa saat lagi, atau gambar '
        + 'area yang lebih dekat ke tengah wilayah RDTR tersebut.</div>';
    }
    if (/HTTP 49[0-9]|Token Required/i.test(m)) {
      return '<div class="geooss-warn"><b>ATR/BPN menolak permintaan ini.</b><br>'
        + 'GeoOSS selalu mengirim permintaan lewat jalur resmi ATR/BPN. Jika ini muncul terus, '
        + 'kemungkinan layanan sedang dalam pemeliharaan.</div>';
    }
    if (/HTTP 5\d\d/.test(m)) {
      return '<div class="geooss-warn"><b>Layanan ATR/BPN sedang bermasalah.</b><br>'
        + 'Ini biasanya bersifat sementara dan bukan kesalahan Anda. Silakan coba lagi '
        + 'beberapa saat lagi.</div>';
    }
    if (/Failed to fetch|NetworkError|Load failed|CORS/i.test(m)) {
      return '<div class="geooss-warn"><b>Tidak bisa menghubungi server ATR/BPN.</b><br>'
        + 'Penyebab yang mungkin: koneksi terputus, permintaan terlalu besar, atau diblokir '
        + 'oleh ekstensi browser. Ada juga kemungkinan layanan sedang membebani dan '
        + 'balasannya tidak lengkap.<br>'
        + 'Coba muat ulang halaman. Jika tetap gagal, buka konsol browser (F12) dan kirimkan '
        + 'pesan berlabel [GeoOSS] gagal memuat kepada pengelola situs.</div>';
    }
    if (err && err.name === 'AbortError') {
      return '<div class="geooss-warn"><b>Permintaan terlalu lama dijawab.</b><br>'
        + 'Server ATR/BPN sedang lambat. Silakan coba lagi sebentar.</div>';
    }
    return '<div class="geooss-warn">Gagal memuat data (' + esc(m) + ').</div>';
  }

  /* ── pencarian kegiatan ───────────────────────────────────────────────
     Dipakai sebagai input + daftar saran, bukan <select>. Alasannya angka:
     data asli memuat 1.855 kegiatan dalam satu RDTR, dan 140.021 kegiatan
     di seluruh berkas. <select> dengan 1.855 <option> bukan daftar yang bisa
     dipakai manusia. Untuk mencapai "Perdagangan" dari huruf A, orang harus
     menggulir melewati ratusan baris, dan di Android itu lebih berat lagi
     karena tiap pilihan menambah tinggi daftar.

     Empat hal yang harus benar supaya hasilnya tidak menyesatkan:
     1. Pencocokan mengabaikan huruf besar-kecil, tanda baca, dan spasi
        ganda, karena nama kegiatan di sini penuh tanda baca aneh seperti
        "Biji- Bijian". Tanpa itu, mengetik "dagang" tidak akan menemukan
        "Perdagangan", dan pengguna akan menyimpulkan datanya memang salah.
     2. Semua kata yang diketik harus ada di nama (AND), bukan cukup satu.
        Kalau tidak, mengetik "pertanian luas" akan dibanjiri "Pertanian".
     3. Peringkatannya: yang diawali kata utuh lebih dulu, lalu yang memuat
        di dalam kata, lalu nama lebih pendek lebih dulu. "Perdagangan"
        harus muncul di atas "Perdagangan dan Penyediaan", bukan mengikuti
        urutan apa pun isi berkasnya.
     4. Hasil dibatasi, dan kalau masih ada yang tidak ditampilkan itu
        disebut. Menampilkan 1.855 baris sekaligus akan membekukan browser
        di ponsel. */

  var CARI_MAKS_HASIL = 30;

  /* Huruf beraksen jadi huruf biasa, huruf kecil, tanda baca jadi spasi, lalu
     spasi dirapatkan. Dipakai untuk pencocokan saja, bukan untuk teks yang
     ditampilkan ke pengguna. */
  function normalisasiCari(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* Satu kegiatan + kunci yang sudah ternormalisasi, dihitung sekali per
     kegiatan supaya tidak diulang untuk setiap ketikan. Daftar 1.855 baris
     dihitung ulang setiap kali satu huruf diketik, jadi harus murah. */
  function siapkanIndexKegiatan(daftar) {
    var out = [];
    for (var i = 0; i < daftar.length; i++) {
      var k = daftar[i];
      out.push({
        id: String(k.id),
        nama: String(k.nama == null ? '' : k.nama),
        kunci: normalisasiCari(k.nama)
      });
    }
    return out;
  }

  /* Peringkat kegiatan terhadap satu kueri. Semua kata kueri harus ada di
     nama. Rank: diawali kata (0), memuat di dalam kata (1), selain itu (2).
     Panjang nama jadi pemutus akhir, supaya hasil yang lebih umum tidak
     menutupi yang lebih spesifik. */
  function cariKegiatan(index, kueri) {
    var kunci = normalisasiCari(kueri);
    if (!kunci) return [];
    var kata = kunci.split(' ');
    var hasil = [];
    for (var i = 0; i < index.length; i++) {
      var it = index[i];
      var cocok = true;
      for (var w = 0; w < kata.length; w++) {
        if (it.kunci.indexOf(kata[w]) < 0) { cocok = false; break; }
      }
      if (!cocok) continue;
      var rank;
      if (it.kunci.indexOf(kunci) === 0) rank = 0;
      else if (it.kunci.indexOf(' ' + kunci) >= 0) rank = 1;
      else rank = 2;
      hasil.push({ it: it, rank: rank, skor: rank * 10000 + it.nama.length });
    }
    hasil.sort(function (a, b) { return a.skor - b.skor; });
    return hasil;
  }

  /* Potongan nama yang cocok dibungkus <mark>. Nama kegiatan berasal dari
     data ATR/BPN, jadi setiap potongan harus di-escape; kalau tidak, satu
     nama yang memuat "<" akan merusak tampilan halaman. */
  function sorotCocok(nama, kueri) {
    var kunci = normalisasiCari(kueri);
    var s = String(nama);
    if (!kunci) return esc(s);
    /* Pencocokan dilakukan di bentuk ternormalisasi, lalu dipetakan balik ke
       indeks teks asli. Normalisasi bisa mengubah panjang (satu huruf
       beraksen jadi dua huruf), jadi pemetaan dibangun sambil jalan dan
       bukan dengan indexOf() langsung. */
    var rebuilt = '';
    var keAsli = [];
    var i = 0;
    while (i < s.length) {
      var ch = s.charAt(i);
      if (!/[\p{L}\p{N}]/u.test(ch)) { i++; continue; }
      var low = ch.toLowerCase().replace(/[\u0300-\u036f]/g, '');
      var mulai = rebuilt.length;
      rebuilt += low;
      for (var t = 0; t < low.length; t++) keAsli[mulai + t] = i;
      i++;
    }
    var at = rebuilt.indexOf(kunci);
    if (at < 0) return esc(s);
    var a0 = keAsli[at];
    var a1 = keAsli[at + kunci.length - 1];
    if (a0 == null || a1 == null) return esc(s);
    return esc(s.slice(0, a0)) + '<mark>' + esc(s.slice(a0, a1 + 1)) + '</mark>' + esc(s.slice(a1 + 1));
  }

  function reset() {
    token++;
    state = null;
    clearMap();
    clearPratinjau();
    /* Poligon yang digambar ikut dihapus. Dulu tidak, jadi tombol
       "Hapus Area" menghapus hasil analisis tapi meninggalkan garis yang
       sudah digambar pengguna di peta -- dan tidak ada cara memindahkannya
       karena layerGambar sudah dibuang. */
    hapusLayerGambar();
    if (el.kegiatan) el.kegiatan.value = '';
    if (el.kegiatanCari) { el.kegiatanCari.value = ''; el.kegiatanCari.disabled = true; }
    if (el.kegiatanSaran) { el.kegiatanSaran.hidden = true; el.kegiatanSaran.innerHTML = ''; }
    if (el.kegiatanTerpilih) { el.kegiatanTerpilih.hidden = true; el.kegiatanTerpilih.textContent = ''; }
    if (el.langkah2) el.langkah2.hidden = true;
    if (el.output) el.output.innerHTML = '';
  }

  function gambarDiawasi() {
    var m = window.map;
    if (!m || !window.L || !window.L.Draw) return false;
    /* Samakan dengan alat gambar yang sudah ada di halaman ini, lalu ambil
       poligon yang baru dibuat lewat event. Jangan pakai getDrawnLayers()
       karena itu mengembalikan SEMUA layer gambar, termasuk milik GeoFarm. */
    if (typeof window.startDraw === 'function') {
      window.startDraw('polygon');
      return true;
    }
    return false;
  }

  /* ── combobox kegiatan ──────────────────────────────────────────────
     State khusus yang tidak disimpan di state utama, karena yang perlu di
     sini hanya isi input dan posisi kursor daftar saran. */
  var cariIndex = [];
  var cariAktif = -1;      /* baris yang disorot untuk keyboard */
  var cariJmlTampil = 0;

  /* Satu-satunya tempat yang menulis atribut aria daftar saran.
     Dipisah supaya sembunyiSaran(), tampilkanSaran(), dan sorotBaris()
     tidak bisa tidak sengaja memakai aturan berbeda. Test menemukan versi
     pertama yang hanya mengembalikan aria-expanded dan meninggalkan
     aria-activedescendant menunjuk baris yang sudah hilang dari DOM. */
  function perbaruiAria(aktif) {
    if (!el.kegiatanCari) return;
    el.kegiatanCari.setAttribute('aria-expanded', aktif ? 'true' : 'false');
    var bars = (el.kegiatanSaran && !el.kegiatanSaran.hidden)
      ? el.kegiatanSaran.querySelectorAll('.geotani-sls-result[data-id]')
      : [];
    /* Dibaca lewat getAttribute, bukan .id: di DOM browser .id terisi dari
       atribut, tapi di lingkungan uji kita hanya mengisi atributnya.
       Membaca atribut langsung berlaku di keduanya. */
    el.kegiatanCari.setAttribute('aria-activedescendant',
      aktif && bars[cariAktif] ? (bars[cariAktif].getAttribute('id') || '') : '');
  }

  function sembunyiSaran() {
    if (el.kegiatanSaran) { el.kegiatanSaran.hidden = true; el.kegiatanSaran.innerHTML = ''; }
    cariAktif = -1;
    cariJmlTampil = 0;
    perbaruiAria(false);
  }

  /* Mengosongkan input, id tersembunyi, dan label pilihan. Dipanggil setiap
     kali daftar kegiatan dimuat ulang, supaya kegiatan dari RDTR sebelumnya
     tidak terbawa. */
  function kosongkanKegiatan() {
    if (el.kegiatan) el.kegiatan.value = '';
    if (el.kegiatanCari) el.kegiatanCari.value = '';
    if (el.kegiatanTerpilih) { el.kegiatanTerpilih.hidden = true; el.kegiatanTerpilih.textContent = ''; }
    sembunyiSaran();
  }

  function isiDaftarKegiatan(daftar) {
    kosongkanKegiatan();
    cariIndex = siapkanIndexKegiatan(daftar || []);
    if (el.kegiatanCari) el.kegiatanCari.disabled = false;
    if (el.kegiatanCari) {
      el.kegiatanCari.placeholder = cariIndex.length
        ? 'Ketik sebagian nama kegiatan...'
        : 'Tidak ada kegiatan untuk wilayah ini';
    }
    /* Daftar tetap dibuka dengan beberapa contoh supaya pengguna tidak
       mengira inputnya rusak. Lima pertama saja, karena yang berikutnya
       perlu menggulir. */
    if (cariIndex.length) tampilkanSaran(cariIndex.slice(0, 5).map(function (it) { return { it: it, rank: 0, skor: 0 }; }));
  }

  function barisSaran(item, kueri) {
    var div = document.createElement('div');
    div.className = 'geotani-sls-result';
    div.setAttribute('role', 'option');
    div.setAttribute('data-id', item.id);
    /* id DOM wajib untuk aria-activedescendant: tanpa ini, pembaca layar
       tidak tahu baris mana yang sedang disorot, dan penyebutan yang
       dikembalikan akan selalu kosong. */
    div.id = 'geooss-keg-opt-' + item.id;
    var kiri = document.createElement('span');
    kiri.className = 'geooss-cari-nama';
    /* Dipasang lewat innerHTML, bukan textContent, karena sorotCocok()
       memang sengaja membuat <mark>. Nama kegiatannya sudah di-escape
       di dalam sorotCocok(), jadi ini bukan celah HTML. */
    kiri.innerHTML = sorotCocok(item.nama, kueri);
    var kanan = document.createElement('span');
    kanan.className = 'geooss-cari-kode';
    kanan.textContent = item.id;
    div.appendChild(kiri);
    div.appendChild(kanan);
    return div;
  }

  function tampilkanSaran(hasil, kueri) {
    if (!el.kegiatanSaran) return;
    cariAktif = -1;
    cariJmlTampil = hasil.length;
    el.kegiatanSaran.innerHTML = '';
    if (!hasil.length) {
      var kosong = document.createElement('div');
      kosong.className = 'geotani-sls-result';
      kosong.setAttribute('data-kosong', '');
      kosong.textContent = 'Tidak ada kegiatan yang namanya mengandung "' + (kueri || '') + '".';
      el.kegiatanSaran.appendChild(kosong);
      el.kegiatanSaran.hidden = false;
      perbaruiAria(true);
      return;
    }
    for (var i = 0; i < hasil.length; i++) {
      el.kegiatanSaran.appendChild(barisSaran(hasil[i].it, kueri));
    }
    /* Kalau hasil dipotong, orangnya perlu tahu masih ada yang tidak
       terlihat. Diam saja di sini akan membuat daftar terasa lengkap
       padahal tidak. */
    if (hasil.length >= CARI_MAKS_HASIL && cariIndex.length > CARI_MAKS_HASIL) {
      var judul = document.createElement('div');
      judul.className = 'geooss-cari-judul';
      judul.textContent = 'Menampilkan ' + CARI_MAKS_HASIL + ' dari ' + nomor(cariIndex.length)
        + ' kegiatan. Ketik lebih spesifik untuk mempersempit.';
      el.kegiatanSaran.insertBefore(judul, el.kegiatanSaran.firstChild);
    }
    el.kegiatanSaran.hidden = false;
    perbaruiAria(true);
  }

  /* Menyorot baris ke-n, dan membuatnya tetap terlihat saat digulir. */
  function sorotBaris(n) {
    if (!el.kegiatanSaran) return;
    var bars = el.kegiatanSaran.querySelectorAll('.geotani-sls-result[data-id]');
    if (!bars.length) return;
    if (n < 0) n = bars.length - 1;
    if (n >= bars.length) n = 0;
    for (var i = 0; i < bars.length; i++) bars[i].classList.remove('aktif');
    cariAktif = n;
    bars[n].classList.add('aktif');
    if (bars[n].scrollIntoView) bars[n].scrollIntoView({ block: 'nearest' });
    perbaruiAria(true);
  }

  /* Menerima kegiatan yang dipilih, lalu menjalankan screening. Satu pintu
     tunggal untuk klik dan Enter, supaya tidak ada jalur yang lupa
     menggambar ulang peta. */
  function pilihKegiatan(id) {
    if (!id || !state || !state.dataKegiatan) return;
    if (el.kegiatan) el.kegiatan.value = String(id);
    var s = screening(state.zona, state.dataKegiatan, id);
    if (!s) return;
    s.haGambar = state.haGambar;
    state.hasil = s;
    for (var i = 0; i < state.zona.length; i++) {
      for (var j = 0; j < s.detail.length; j++) {
        if (s.detail[j].zona === state.zona[i]) state.zona[i].status = s.detail[j].status;
      }
    }
    gambar(state.zona);

      /* Tampilkan hasil lebih dulu, lalu request LBS/LSD. Menunggu request
         sebelum merakit HTML akan membuat layar kosong sedikit demi
         sedikit -- dan BIG memang sering lambat. Kalau ini adalah pilihan
         kegiatan pertama, request-nya baru dibuat; pilihan berikutnya
         memakai hasil yang sama, jadi satu cek tidak mengulang dua
         request. */
    var render = function () {
      if (!el.output) return;
      el.output.innerHTML = ringkasanHtml(s) + precheckHtml(s) + dasarHtml(state)
        + daftarZonaHtml(state.zona, s) + kreditHtml(state);
    };
    render();

    if (!state.lbsLsdDipinta) {
      state.lbsLsdDipinta = true;
      if (el.status) el.status.textContent = 'Menghitung luas lahan sawah...';
      analisisLbsLsd(state.drawnGeoJSON, state.haGambar).then(function (hasil) {
        state.lbsLsd = hasil;
        /* Dicek ulang: pengguna bisa sudah menekan Hapus Area atau memilih
           kegiatan lain selagi request berjalan. Kalau state sudah tidak
           sama, hasilnya dibuang -- jangan tulis ke layar yang sudah berubah. */
        if (state.hasil !== s) return;
        if (el.status) el.status.textContent = '';
        /* PENTING: disalin ke objek hasil, bukan hanya ke state.
           ringkasanHtml() membaca s.lbsLsd, dan s-lah yang dirender adalah
           objek yang sama. Kalau hanya state.lbsLsd yang diisi, blok sawah
           tidak akan pernah tercetak -- persis yang terjadi: analyze
           berjalan, request BIG sukses, tapi blok tidak muncul di layar.
           Test geooss-sawah menguji ringkasanHtml dengan s.lbsLsd yang
           diisi manual, jadi jalur ini tidak tertangkap. */
        s.lbsLsd = hasil;
        render();
      }).catch(function (e) {
        if (state.hasil !== s) return;
        if (el.status) el.status.textContent = '';
        console.warn('[GeoOSS] Gagal menghitung luas lahan sawah:', e);
      });
    } else if (state.lbsLsd) {
      /* Permintaan sudah pernah dibuat dan hasilnya ada. Dipakai ulang,
         supaya ganti kegiatan tidak mengulang request BIG. */
      s.lbsLsd = state.lbsLsd;
      render();
    }
  }

  function pasangCariKegiatan() {
    var inp = el.kegiatanCari;
    var kotak = el.kegiatanSaran;
    if (!inp || !kotak) return;

    /* Menyalin nilai terpilih ke kotak "dipilih", lalu mengunci input.
       Setelah terkunci, mengetik tidak lagi mengubah apa pun sampai
       Hapus Area ditekan, jadi hasil yang tampil tidak mungkin berasal dari
       kegiatan yang berbeda dari yang tertulis di kotak. */
    var kunci = function (id, nama) {
      if (el.kegiatan) el.kegiatan.value = String(id);
      if (el.kegiatanTerpilih) {
        el.kegiatanTerpilih.hidden = false;
        el.kegiatanTerpilih.textContent = nama + ' (' + id + ')';
      }
      inp.value = nama;
      sembunyiSaran();
    };
    var lepasKunci = function () {
      if (el.kegiatan) el.kegiatan.value = '';
      if (el.kegiatanTerpilih) { el.kegiatanTerpilih.hidden = true; el.kegiatanTerpilih.textContent = ''; }
    };

    inp.addEventListener('input', function () {
      if (inp.value === '') {
        lepasKunci();
        if (cariIndex.length) {
          tampilkanSaran(cariIndex.slice(0, 5).map(function (it) { return { it: it, rank: 0, skor: 0 }; }));
        } else {
          sembunyiSaran();
        }
        return;
      }
      /* Saran yang tampil hanya berdasarkan teks, belum ada yang dipilih,
         jadi id sebelumnya harus dibuang. Kalau tidak, hasil lama tetap
         tertinggal padahal isian sudah tidak cocok. */
      lepasKunci();
      var hasil = cariKegiatan(cariIndex, inp.value);
      if (hasil.length > CARI_MAKS_HASIL) hasil = hasil.slice(0, CARI_MAKS_HASIL);
      tampilkanSaran(hasil, inp.value);
    });

    inp.addEventListener('keydown', function (e) {
      var bars = kotak.querySelectorAll('.geotani-sls-result[data-id]');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (kotak.hidden) {
          if (cariIndex.length) tampilkanSaran(cariKegiatan(cariIndex, inp.value).slice(0, CARI_MAKS_HASIL), inp.value);
        } else {
          sorotBaris(cariAktif + 1);
        }
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (kotak.hidden) {
          if (cariIndex.length) tampilkanSaran(cariKegiatan(cariIndex, inp.value).slice(0, CARI_MAKS_HASIL), inp.value);
        } else {
          sorotBaris(cariAktif - 1);
        }
        return;
      }
      if (e.key === 'Enter') {
        var t = (cariAktif >= 0 && bars[cariAktif]) ? bars[cariAktif] : (bars.length === 1 ? bars[0] : null);
        if (t) {
          e.preventDefault();
          kunci(t.getAttribute('data-id'), t.querySelector('.geooss-cari-nama').textContent);
          pilihKegiatan(t.getAttribute('data-id'));
        }
        return;
      }
      if (e.key === 'Escape') {
        if (!kotak.hidden) { e.preventDefault(); sembunyiSaran(); }
        return;
      }
      if (e.key === 'Tab') { sembunyiSaran(); }
    });

    /* mousedown, bukan click: browser memburamkan input sebelum click
      selesai, dan perubahan itu membatalkan daftar sebelum sempat terbaca.
       Pola ini sudah dipakai pencarian desa LBS & LSD. */
    kotak.addEventListener('mousedown', function (e) {
      var t = e.target;
      while (t && t !== kotak && !(t.className && /geotani-sls-result/.test(t.className) && t.getAttribute('data-id'))) {
        t = t.parentNode;
      }
      if (!t || t === kotak) return;
      e.preventDefault();
      kunci(t.getAttribute('data-id'), t.querySelector('.geooss-cari-nama').textContent);
      pilihKegiatan(t.getAttribute('data-id'));
    });

    document.addEventListener('click', function (e) {
      if (kotak.contains(e.target) || e.target === inp) return;
      if (!kotak.hidden) sembunyiSaran();
    });

    inp.addEventListener('blur', function () {
      /* Menunda 150 ms supaya mousedown pada daftar sempat selesai lebih
         dulu. Tanpa penundaan, blur akan menutup daftar sebelum
         pilihKegiatan sempat jalan. */
      setTimeout(function () { if (!kotak.contains(document.activeElement)) sembunyiSaran(); }, 150);
    });
  }

  function init(root) {
    var host = root || document.getElementById('geotani-geooss-card');
    if (!host) return null;
    el = {
      host: host,
      prov: document.getElementById('geooss-prov'),
      kab: document.getElementById('geooss-kab'),
      rdtr: document.getElementById('geooss-rdtr'),
      kegiatan: document.getElementById('geooss-kegiatan'),
      kegiatanCari: document.getElementById('geooss-kegiatan-cari'),
      kegiatanSaran: document.getElementById('geooss-kegiatan-saran'),
      kegiatanTerpilih: document.getElementById('geooss-kegiatan-terpilih'),
      btnGambar: document.getElementById('geooss-gambar'),
      btnReset: document.getElementById('geooss-reset'),
      status: document.getElementById('geooss-status'),
      output: document.getElementById('geooss-output'),
      langkah2: document.getElementById('geooss-langkah2')
    };
    if (!el.prov || !el.output) return null;
    if (el.prov.__geoossBound) return api;
    el.prov.__geoossBound = true;

    var myToken = 0;

    muatProvinsi().then(function (list) {
      isiSelect(el.prov, list.map(function (p) { return { value: p.kode, label: p.provinsi }; }),
        function (x) { return x.label; }, 'Pilih provinsi');
    }).catch(function (e) {
      if (el.status) el.status.textContent = pesanGagal(e);
    });

    el.prov.addEventListener('change', function () {
      var kode = el.prov.value;
      el.kab.innerHTML = '<option value="">Memuat...</option>';
      el.rdtr.innerHTML = '<option value="">Pilih kabupaten/kota dulu</option>';
      if (!kode) { el.kab.innerHTML = '<option value="">Pilih provinsi dulu</option>'; return; }
      muatKabupaten(kode).then(function (list) {
        if (!list.length) {
          isiSelect(el.kab, [], function (x) { return x; }, 'Tidak ada data untuk provinsi ini');
          return;
        }
        isiSelect(el.kab, list.map(function (c) { return { value: c.id, label: c.nama }; }),
          function (x) { return x.label; }, 'Pilih kabupaten/kota');
      }).catch(function (e) {
        /* Tidak ada lagi berkas cities/{kode}.json, jadi kegagalan di sini
           berarti KODE_WILAYAH_DATA belum termuat -- bukan "belum di-build". */
        if (el.kab) el.kab.innerHTML = '<option value="">-</option>';
        if (el.status) el.status.textContent = 'Daftar kabupaten/kota tidak tersedia.';
        if (el.output) {
          el.output.innerHTML = '<div class="geooss-warn">Daftar kabupaten/kota dibaca dari '
            + '<code>KODE_WILAYAH_DATA</code> yang dimuat oleh <code>assets/data/kode_wilayah.js</code>. '
            + 'Berkas itu tidak termuat, jadi GeoOSS tidak bisa menampilkan daftar wilayah. '
            + 'Muat ulang halaman; jika tetap kosong, periksa tag script-nya di index.html.</div>';
        }
      });
    });

    el.kab.addEventListener('change', function () {
      var id = el.kab.value;
      el.rdtr.innerHTML = '<option value="">Memuat...</option>';
      if (!id) { el.rdtr.innerHTML = '<option value="">Pilih kabupaten/kota dulu</option>'; return; }
      muatRdtr(id).then(function (list) {
        if (!list.length) {
          isiSelect(el.rdtr, [], function (x) { return x; }, 'Tidak ada RDTR untuk wilayah ini');
          if (el.output) {
            el.output.innerHTML = '<div class="geooss-warn"><b>Wilayah ini belum punya rencana detail '
              + 'tata ruang (RDTR) yang dipublikasikan.</b><br>Karena itu GeoOSS tidak bisa menilai '
              + 'apa pun di sini. Bukan berarti wilayah ini tidak boleh dibangun -- hanya berarti '
              + 'belum ada peta peruntukan yang bisa dijadikan dasar penilaian.<br>'
              + 'Kalau Anda yakin seharusnya ada, laporkan ke pengelola RuangKita.</div>';
          }
          return;
        }
        isiSelect(el.rdtr, list.map(function (r) {
          return { value: r.id_rtr, label: r.rtr + (r.integration_date ? ' (' + r.integration_date + ')' : '') };
        }), function (x) { return x.label; }, 'Pilih RDTR');
      }).catch(function (e) {
        if (e && e.kode === 'belum-di-build') {
          if (el.output) el.output.innerHTML = pesanBelumDiBuild('rdtr/' + id + '.json');
        } else if (el.status) el.status.textContent = pesanGagal(e);
      });
    });

    el.rdtr.addEventListener('change', function () {
      var idRtr = el.rdtr.value;
      if (el.kegiatan) el.kegiatan.value = '';
      if (el.kegiatanCari) { el.kegiatanCari.value = ''; el.kegiatanCari.disabled = true; }
      if (el.kegiatanSaran) { el.kegiatanSaran.hidden = true; el.kegiatanSaran.innerHTML = ''; }
      if (el.kegiatanTerpilih) { el.kegiatanTerpilih.hidden = true; el.kegiatanTerpilih.textContent = ''; }
      if (el.langkah2) el.langkah2.hidden = true;
      if (!idRtr) { if (el.status) el.status.textContent = ''; return; }
      muatRdtr(el.kab.value).then(function (list) {
        /* PENTING: dropdown RDTR TIDAK dibangun ulang di sini.
           Membangun ulang isi <select> dari dalam handler change-nya sendiri
           akan menghapus pilihan yang baru saja dibuat pengguna, karena
           browser otomatis memilih <option> pertama -- yaitu placeholder
           bernilai kosong. Akibatnya el.rdtr.value menjadi '' dan tombol
           "Gambar area" selamanya berkata "Pilih RDTR terlebih dahulu",
           padahal peta sudah bergerak ke lokasi yang benar. Daftar opsi sudah
           dibangun di handler kabupaten, jadi di sini cukup membacanya. */
        if (!list || !list.length) {
          if (el.status) el.status.textContent = 'Pilih kabupaten/kota yang lain.';
          return;
        }

        /*Langsung tunjukkan letaknya. Extent diambil dari metadata layer, yang
           sudah diambil untuk memeriksa kolom_unik -- jadi tidak ada request
           tambahan, dan tidak menambah beban ke ATR/BPN. */
        var terpilih = null;
        for (var i = 0; i < list.length; i++) {
          if (String(list[i].id_rtr) === String(idRtr)) { terpilih = list[i]; break; }
        }
        if (!terpilih) return;
        /* Pengaman tambahan: pastikan nilai yang dibaca tombol gambar tetap
           sama dengan yang baru saja dipilih pengguna. */
        if (el.rdtr) el.rdtr.value = String(idRtr);
        clearPratinjau();
        if (el.status) el.status.textContent = 'Menampilkan wilayah ' + terpilih.rtr + '...';
        skemaLayer(terpilih).then(function (s) {
          var bbox = s && s.bbox;
          /* Ketidakberhasilan terbang tidak membatalkan penggambaran
             pratinjau, dan sebaliknya. Keduanya hal yang berbeda, dan
             pengguna lebih terbantu kalau yang satu berhasil walau yang
             satunya gagal. */
          terbangKe(bbox);
          return gambarPratinjau(terpilih, bbox).then(function () {
            if (el.status) {
              el.status.textContent = 'Wilayah ' + terpilih.rtr
                + ' ditandai di peta dengan garis tipis. Klik "Gambar area di peta", '
                + 'lalu klik di dalam area itu.';
            }
          });
        }).catch(function () {
          if (el.status) el.status.textContent = 'Pilih RDTR ini, lalu klik "Gambar area di peta".';
        });
      }).catch(function (e) {
        /* Berkas rdtr/{id}.json tidak ada hanya berarti wilayah ini belum
           di-build, dan itu keterbatasan repo -- bukan fakta bahwa wilayahnya
           tidak punya RDTR. */
        isiSelect(el.rdtr, [], function (x) { return x; }, 'Data belum tersedia');
        if (el.output) el.output.innerHTML = pesanGagal(e);
        if (el.status) el.status.textContent = '';
      });
    });

    if (el.btnGambar) {
      el.btnGambar.addEventListener('click', function () {
        if (!el.rdtr.value) {
          if (el.status) el.status.textContent = 'Pilih RDTR terlebih dahulu.';
          return;
        }
        if (!gambarDiawasi()) {
          if (el.status) el.status.textContent = 'Alat gambar poligon belum siap. Muat ulang halaman.';
          return;
        }
        if (el.status) el.status.textContent = 'Klik titik-titik di peta untuk menggambar area, lalu klik titik pertama untuk menutup. Klik dua kali untuk selesai.';
      });
    }

    if (el.btnReset) {
      el.btnReset.addEventListener('click', function () {
        reset();
        if (typeof window.stopDrawSession === 'function') window.stopDrawSession();
        if (el.status) el.status.textContent = '';
        if (el.kab) el.kab.innerHTML = '<option value="">Pilih provinsi dulu</option>';
        if (el.rdtr) el.rdtr.innerHTML = '<option value="">Pilih kabupaten/kota dulu</option>';
        if (el.prov) el.prov.value = '';
      });
    }

    /* Event poligon selesai dibuat. Dipakai satu kali per sesi gambar. */
    var m = window.map;
    if (m && window.L && window.L.Draw) {
      m.on(window.L.Draw.Event.CREATED, async function (ev) {
        if (!ev || ev.layerType !== 'polygon') return;
        var idRtr = el.rdtr ? el.rdtr.value : '';
        if (!idRtr) return;
        myToken = ++token;
        /* Simpan layer-nya, bukan cuma GeoJSON-nya. Dulu hanya toGeoJSON()
           yang diambil lalu ev.layer dibuang, sehingga tidak ada cara
           menghapus garis yang sudah digambar dari peta. */
        hapusLayerGambar();
        layerGambar = ev.layer;
        var drew = ev.layer.toGeoJSON();
        if (typeof window.stopDrawSession === 'function') window.stopDrawSession();

        var kab = null;
        try {
          var daftar = await muatKabupaten(el.prov.value);
          for (var i = 0; i < daftar.length; i++) if (daftar[i].id === el.kab.value) kab = daftar[i];
        } catch (e) { /* lanjut; nama kabupaten hanya untuk tampilan */ }
        var daftarRdtr = await muatRdtr(el.kab.value);
        var rdtr = null;
        for (i = 0; i < daftarRdtr.length; i++) if (String(daftarRdtr[i].id_rtr) === String(idRtr)) rdtr = daftarRdtr[i];
        if (!rdtr) {
          if (el.output) el.output.innerHTML = '<div class="geooss-warn">Data RDTR tidak ditemukan. Pilih ulang RDTR.</div>';
          return;
        }

        var sumberZona = 'arsip-bpn';
        if (el.status) el.status.textContent = 'Mengambil zona peruntukan...';
        var fitur = null;
        var sumberPesan = '';
        var metaLokal = null;

        /* Zona lokal dicoba lebih dulu. Kalau berkasnya ada, tidak ada satu
           pun request ke ATR/BPN yang perlu dibuat untuk geometry -- dan itu
           yang membuat modul tetap bekerja saat GISTARU tidak terjangkau. */
        try {
          var lokal = await muatZonaLokal(el.kab.value, idRtr);
          if (lokal && lokal.zona.length) {
            metaLokal = lokal.meta;
            fitur = zonaLokalKeFitur(lokal);
            sumberZona = 'lokal';
          }
        } catch (e) {
          /* 404 berarti zona untuk wilayah ini memang belum dibangun. Itu
             bukan error, dan bukan juga alasan berhenti -- ArcGIS dicoba. */
        }

        try {
          if (!fitur) {
            /* Verifikasi kolom_unik benar-benar ada di layer. Kalau tidak, query
               tetap berjalan tetapi join akan kosong dan itu menyesatkan. */
            var skema = await skemaLayer(rdtr);
            var adaKolom = skema.fields.indexOf(rdtr.kolom_unik) !== -1;
            if (!adaKolom) {
              if (el.output) {
                el.output.innerHTML = '<div class="geooss-warn">'
                  + '<b>Peta zona wilayah ini tidak bisa dibaca.</b><br>'
                  + 'Data yang diunggah ke ATR/BPN untuk RDTR ini tidak memuat kolom kode zona '
                  + 'yang dibutuhkan GeoOSS, sehingga zona di dalamnya tidak bisa dicocokkan '
                  + 'dengan daftar kegiatan. Ini kekurangan data di sisi ATR/BPN, bukan '
                  + 'kesalahan pilihan Anda, dan tidak bisa diperbaiki dari sini.<br>'
                  + 'Silakan cek langsung ke petugas tata ruang daerah terkait.'
                  + '<br><br><span class="geooss-detail">Detail teknis: kolom yang diharapkan '
                  + '<code>' + esc(rdtr.kolom_unik) + '</code> tidak ada di schema layer. '
                  + 'Kolom yang tersedia: <code>' + esc(skema.fields.join(', ')) + '</code>.'
                  + '</span></div>';
              }
              if (el.status) el.status.textContent = 'Data zona wilayah ini belum lengkap di ATR/BPN.';
              return;
            }
            var kotak = kotakPembatas(drew.geometry);
            if (!kotak) {
              if (el.output) el.output.innerHTML = '<div class="geooss-warn">Batas area gambar tidak terbaca. Coba gambar ulang.</div>';
              return;
            }
            var hasilQuery = await queryZona(rdtr, fieldYangAda(skema, rdtr.kolom_unik), kotak);
            if (myToken !== token) return;
            fitur = hasilQuery.fitur;

            if (hasilQuery.terpotong) {
              if (el.output) {
                el.output.innerHTML = '<div class="geooss-warn">Area gambar memuat lebih dari ' + nomor(BATAS_ZONA)
                  + ' bidang zona, sehingga tidak semuanya dimuat. Hasil di bawah TIDAK lengkap. '
                  + 'Gambar area yang lebih kecil, atau gambar tepat batas satu bidang tanah.</div>';
              }
              if (el.status) el.status.textContent = 'Area terlalu besar untuk dimuat penuh.';
            }
          } else {
            if (el.status) {
              el.status.textContent = 'Menggunakan peta zona yang tersimpan di RuangKita (disederhanakan ' +
                ((metaLokal && metaLokal.toleransi_meter) || 10) + ' meter).';
            }
            sumberPesan = 'Zona diambil dari salinan lokal yang disederhanakan '
              + ((metaLokal && metaLokal.toleransi_meter) || 10)
              + ' meter, jadi luas yang tertera adalah perkiraan.';
          }

          /* Saringan presisi di client. Untuk zona dari ArcGIS, envelope hanya
             batas kasar, jadi zona yang kebetulan masuk kotak tapi tidak
             menyentuh poligon harus dibuang, kalau tidak luas dan verdict-nya
             salah. Zona lokal sudah pasti berada di dalam wilayahnya, tapi
             saringan yang sama tidak merugikan. */
          fitur = fitur.filter(function (f) {
            if (!f || !f.geometry) return false;
            try {
              if (window.turf) return !!window.turf.booleanIntersects(f, drew);
            } catch (e) { /* jatuh ke bawah */ }
            /* Tanpa turf, tidak ada cara memastikan. Batas kotak dipakai
               sebagai pendekatan dan hasilnya ditandai di status. */
            return true;
          });
          if (!window.turf && el.status) {
            el.status.textContent = 'Presisi area dihitung tanpa turf, hasil mungkin kurang tepat.';
          }

          /* state dibuat SATU KALI di sini, setelah sumber zona diketahui,
             supaya tidak tertimpa oleh cabang mana pun.
             toleransiZona ikut disimpan karena kredit harus menyebut angka
             yang BENAR. Kalau tidak, teks selalu menyebut "10 meter" padahal
             salinan lokal bisa dibangun dengan toleransi lain, dan itu
             kesalahan yang tidak akan ketahuan pengguna. */
          state = {
            kab: kab, rdtr: rdtr, zona: [], drawn: drew,
            /* drawnGeoJSON disimpan terpisah karena analisis LBS/LSD
               memerlukan bentuk GeoJSON, sedangkan drawn dipakai modul lain
               sebagai feature Leaflet. Bentuknya tidak sama. */
            drawnGeoJSON: null,
            sumber: sumberZona, sumberPesan: sumberPesan,
            toleransiZona: (metaLokal && metaLokal.toleransi_meter) || null,
            dataKegiatan: null, hasil: null,
            /* lbsLsdDipinta menahan supaya satu pemeriksaan tidak mengulang
               request BIG yang sama. Reset() mengosongkan state, jadi
               penanda ini ikut hilang bersama area gambarnya. */
            lbsLsdDipinta: false, lbsLsd: null
          };

          var zona = grupkanZona(fitur.map(function (f) {
            return zonaDariFitur(f, rdtr.kolom_unik, drew);
          }));
          if (el.langkah2) el.langkah2.hidden = false;
          if (el.kegiatan) el.kegiatan.disabled = false;

          if (!zona.length) {
            if (el.output) {
              el.output.innerHTML = '<div class="geooss-warn">Tidak ada zona peruntukan yang berpotongan '
                + 'dengan area gambar. Area ini mungkin di luar wilayah RDTR yang dipilih.</div>';
            }
            if (el.status) el.status.textContent = 'Tidak ada zona yang berpotongan.';
            return;
          }

          /* state sudah dibuat di atas; di sini hanya diisi zona dan luas. */
          state.zona = zona;
          state.haGambar = luasHa(drew);
          /* GeoJSON polygon user, untuk irisan LBS/LSD. Bentuk Leaflet
             dan GeoJSON tidak sama, jadi tidak bisa pakai yang satu untuk
             dua keperluan. Leaflet.draw memberi koordinat [lat, lng],
             GeoJSON minta [lng, lat] -- tertukar di sini akan mengembalikan
             lokasi di belahan bumi yang salah, bukan error. */
          state.drawnGeoJSON = keGeoJSONPolygon(drew);
          gambar(zona);
          kosongkanKegiatan();
          muatKegiatan(el.kab.value, idRtr).then(function (d) {
            if (myToken !== token) return;
            state.dataKegiatan = d;
            isiDaftarKegiatan(d.kegiatan);
            if (el.status) {
              el.status.textContent = nomor(zona.length) + ' zona dimuat. '
                + nomor(d.kegiatan.length) + ' kegiatan tersedia, ketik untuk mencari.';
            }
            if (el.output) {
              el.output.innerHTML = dasarHtml(state) + '<div class="geotani-sls-desc">'
                + 'Ketik sebagian nama kegiatan di atas untuk melihat zona mana yang mengizinkannya.'
                + '</div>';
            }
          }).catch(function (e) {
            if (el.output) el.output.innerHTML = dasarHtml(state) + pesanGagal(e);
          });
        } catch (e) {
          if (myToken !== token) return;
          if (el.output) el.output.innerHTML = pesanGagal(e);
          if (el.status) el.status.textContent = 'Gagal memuat zona.';
        }
      });
    }

    /* Dipasang sekali saja. Daftar kegiatan 1.855 baris, jadi handler
     dipasang per RDTR akan menumpuk dan membuat pencarian lambat. */
    if (el.kegiatanCari && !el.kegiatanCari.__geoossCariBound) {
      el.kegiatanCari.__geoossCariBound = true;
      pasangCariKegiatan();
    }

    return api;
  }

  var api = {
    init: init,
    reset: reset,
    clearPratinjau: clearPratinjau,
    gambar: gambar,
    hapusLayerGambar: hapusLayerGambar,
    gambarPratinjau: gambarPratinjau,
    kunciZona: kunciZona,
    cocokZona: cocokZona,
    screening: screening,
    grupkanZona: grupkanZona,
    statusZona: statusZona,
    muatProvinsi: muatProvinsi,
    muatKabupaten: muatKabupaten,
    muatRdtr: muatRdtr,
    muatKegiatan: muatKegiatan,
    isiDaftarKegiatan: isiDaftarKegiatan,
    kosongkanKegiatan: kosongkanKegiatan,
    /* Nama endingan Test karena ini bukan API modul, hanya jalan untuk
       mengecek state aria dari test. Sengaja tidak diberi nama yang terdengar
       nicer supaya jelas ini alat uji. */
    /* Nama dengan akhiran Test karena bukan API modul, hanya jalan untuk
       mengecek state aria dari test. Sengaja tidak diberi nama yang
       terdengar nicer supaya jelas ini alat uji. */
    sembunyiSaranTest: sembunyiSaran,
    muatZonaLokal: muatZonaLokal,
    zonaLokalKeFitur: zonaLokalKeFitur,
    queryZona: queryZona,
    kotakPembatas: kotakPembatas,
    terbangKe: terbangKe,
    fieldYangAda: fieldYangAda,
    skemaLayer: skemaLayer,
    ringkasanHtml: ringkasanHtml,
    precheckHtml: precheckHtml,
    kreditHtml: kreditHtml,
    dasarHtml: dasarHtml,
    daftarZonaHtml: daftarZonaHtml,
    pesanGagal: pesanGagal,
    keGeoJSONPolygon: keGeoJSONPolygon,
    hitungLuas: hitungLuas,
    analisisLbsLsd: analisisLbsLsd,
    irisDenganUser: irisDenganUser,
    kumpulkanLbs: kumpulkan,
    kumpulkanLsd: kumpulkan,
    LSD_SUMBER: LSD_SUMBER,
    normalisasiCari: normalisasiCari,
    siapkanIndexKegiatan: siapkanIndexKegiatan,
    cariKegiatan: cariKegiatan,
    sorotCocok: sorotCocok,
    CARI_MAKS_HASIL: CARI_MAKS_HASIL,
    KENDALA: KENDALA,
    getState: function () { return state; },
    /* Hanya untuk test. Menyiapkan state tanpa harus menggambar polygon
       di peta sungguhan, supaya test bisa memanggil pilihKegiatan() dan
       memeriksa output sungguhan. Test geooss-sawah tidak bisa
       menangkap bug "blok sawah tidak pernah muncul" karena menguji
       ringkasanHtml dengan s.lbsLsd diisi manual -- jalur yang tidak pernah
       dipanggil di aplikasi nyata. */
    setStateForTest: function (s) { state = s; return state; },
    pilihKegiatan: pilihKegiatan
  };
  window.GeoOss = api;

  if (typeof document !== 'undefined') {
    var boot = function () { if (!init()) setTimeout(boot, 300); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();
