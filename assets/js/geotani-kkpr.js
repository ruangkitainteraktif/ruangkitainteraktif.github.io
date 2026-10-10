/* ═══════════════════════════════════════════════════════════════════
   GeoTani — KKPR (Kartu Kepemilikan Plekitas) via Pencarian NIB
   ═══════════════════════════════════════════════════════════════════
   Sumber: ATR/BPN, GISTARU. Sekarang DUA layer, bukan satu:
     - KKPR_OSS_ALL   241.434 bidang. Tidak punya field kbli sama sekali.
     - KKPR_BERUSAHA   40.822 bidang. Punya field kbli, tapi tidak punya
                      field judul -- nama usaha diambil dari codebook lokal
                      (assets/data/kbli-2020.json, dibangun oleh
                      scripts/build-kbli-list.mjs).
   Kedua layer saling lepas dan TIDAK selalu beririsan: NIB 2008250122752
   hanya ada di OSS_ALL, NIB 9120202811069 hanya ada di BERUSAHA, sedangkan
   NIB 0220105690193 ada di keduanya. Karena itu keduanya selalu ditanya,
   lalu digabung berdasarkan id_izin; izin yang hanya ada di BERUSAHA tetap
   dipakai dengan geometrinya sendiri. Pencarian tetap per NIB, bukan per
   wilayah, karena tidak satu pun layer punya field desa atau kabupaten.

   TIGA HAL YANG HARUS DIKETAHUI SEBELUM MENYUNTIKKAN KODE DI SINI:

   1. SEMUA request WAJIB lewat tres/proxy.ashx. Akses langsung ke
      arcgis.rest ditolak dengan {"error":{"code":499,
      "message":"Token Required"}}. URL di dalam proxy itu TIDAK
      di-encode, jadi parameter-nya tetap ikut sebagai & biasa.

   2. Layer tidak punya endpoint tile. /MapServer/tile/{z}/{y}/{x}
      membalas 404, jadi ini tidak bisa jadi layer basemap. Satu-satunya
      jalan adalah query lalu render GeoJSON.

   3. DATANYA TIDAK RAPI, dan itu bukan tanggung jawab server. Satu NIB
      bisa punya sampai 7 baris dengan 4 geometri BERBEDA di lokasi
      berbeda (terverifikasi pada NIB 0220105690193: geometri 250 m,
      400 m, 4 km, dan 3 km dalam satu NIB). Sebaliknya NIB
      2008250122752 rapi: 5 baris, 1 geometri, hanya berbeda id_izin.
      Aplikasi menampilkan apa adanya; ia tidak mencoba menebak mana
      yang benar, dan tidak menyembunyikan yang tidak konsisten.

   4. KODE KBLI TIDAK SELALU BISA DITERJEMAHKAN, dan aplikasi ini tidak
      menebaknya. Codebook lokal menutup 88,7% dari 1.323 kode berbeda yang
      benar-benar muncul di KKPR_BERUSAHA; sisanya ditampilkan sebagai kode
      mentah dengan label "tidak ditemukan di KBLI 2020". Sumber judul
      alternatif (tenderx.id) sengaja TIDAK dipakai: diuji, kodenya menunjuk
      ke level yang lebih kasar -- 55101 dijawab "Aktivitas Hotel Bintang
      Lima", bukan "Aktivitas Hotel", dan 68130/62090/14130 tidak ada
      sama sekali. Menampilkan nama usaha yang keliru tapi meyakinkan lebih
      buruk daripada tidak menampilkan nama sama sekali.

   Field kd_izin sengaja tidak dipakai meski terlihat menggoda: nilainya
   konstan "056000000002" pada 241.434 dari 241.435 baris, jadi tidak
   memfilter apa pun.

   ═══════════════════════════════════════════════════════════════════
   MODE KEDUA: CARI NAMA USAHA
   ═══════════════════════════════════════════════════════════════════
   Dua mode dalam satu kartu, karena folder KKPR di ATR/BPN berisi 24
   service dengan bentuk yang sangat berbeda. Ringkasnya:

     Punya NIB, sudah dipakai mode pertama  KKPR_OSS_ALL, KKPR_BERUSAHA
     Punya NIB, kembaran                   _KKPR_SPR_ALL (= persis
                                           KKPR_BERUSAHA: baris, SUM
                                           objectid, dan id_izin sama
                                           semua), PUSAT_24_25_
     Punya NIB, tapi isinya sudah tercakup  KKPR_SPR_ALL_PUSAT_24_25,
                                           KSN_MERAPI, KOTA_Denpasar,
                                           *_dev, *_dev_new_api (0 baris)
     TANPA nib, kuncinya lain             kkpr_nonber_all (0),
                                           kkpr_stranas_all (0),
                                           kkpr_dev_otomatis (id_proyek_lokasi),
                                           NONBERUSAHA_STRANAS (924),
                                           Hasil_Cek_Tumpang_Tindih (17.746),
                                           HPL_IKN (NIB_HPL), IKN 45/54

   Layer kembaran TIDAK ditambah: menyalinnya hanya menghasilkan dua baris
   izin yang identik dengan jenis_kkpr berbeda. Yang benar-benar menambah
   nilai dari kelompok itu cuma kolom Kewenangan dan Tgl_Final di PUSAT_24_25,
   dan itu terbatas pada satu wilayah kecil -- bukan pencarian nationwide,
   jadi tidak layak jadi tab sendiri.

   Mode kedua membaca kkpr_spr_all (18.603 baris): satu-satunya layer di
   folder ini yang punya NAMA_PMHN, jadi satu-satunya yang bisa dijangkau
   tanpa NIB. Verifikasi lewat NAMA_PMHN LIKE: UNISBA 2, FERRY 15,
   INDONESIA 1.545.

   TIGA HAL YANG BISA MEMBUAT MODE INI MENYESATKAN

   1. f=geojson TIDAK BISA DIPAKAI di layer ini. Terbukti: query
      PROVINSI='Aceh' dengan f=geojson mengembalikan 0 fitur, dengan
      f=json mengembalikan 3. service tetap mengiklankan
      "JSON, geoJSON" di supportedQueryFormats, jadi ini bukan salah
      parameter. Geometrinya datang sebagai esriGeometry.rings, jadi
      dikonversi lewat esriKeTurf() dari window.GeoTaniLbsLsd -- bukan
      dipakai langsung seperti hasil GeoJSON.

   2. LUAS ADALAH STRING BUKAN ANGKA. Nilai aslinya "47324 m2" dan
      "93968.2851474 m2", sementara NILAI_INVEST dan NILAI_PNBP juga string.
      Semua dikonversi di sisi klien. Nilai yang gagal di-parse ditampilkan
      mentah -- bukan jadi 0, karena 0 adalah jawaban dan sedangkan teks
      aslinya yang gagal dibaca adalah ketidaktahuan.

   3. NAMA USAHA DI MODE INI BUKAN DARI CODEBOOK LOKAL. Layer punya
      NOMEN_KBLI sendiri dari ATR/BPN, jadi kbli-2020.json tidak diunduh
      sama sekali di mode ini. Dua sumber nama yang berbeda itu tidak boleh
      disamakan: yang dari codebook adalah terjemahan, yang ini bawaan
      server. Kalau suatu saat keduanya tampil berdampingan, sumbernya
      ikut ditulis supaya tidak dibaca sebagai angka yang sama.

   JOIN KE NIB, DAN KENAPA TIDAK BISA DIANDALKAN
   kkpr_spr_all tidak punya field nib. Satu-satunya jalan ke NIB adalah
   IDPLOK, yang nilainya sama dengan id_proyek_lokasi di OSS_ALL -- terbukti
   IDPLOK 'L-201912302351328643730' di kkpr_spr_all = NIB 9120107131248 di
   OSS_ALL. Tapi dari 20 sampel IDPLOK, hanya 5 yang ketemu. Jadi tombol
   "cari NIB" hanya muncul kalau join benar-benar kena, dan hasil yang
   dibuka adalah angka milik OSS_ALL. Menampilkan tombol yang tiga perempat
   gagal akan merusak kepercayaan pada semua angka lain.
   */
(function () {
  'use strict';

  var HOST_PROXY = 'https://gistaru.atrbpn.go.id/tres/proxy.ashx?';
  var DASAR_LAYER = 'https://gistaru.atrbpn.go.id/arcgis/rest/services/KKPR/';
  var LAYER_OSS = DASAR_LAYER + 'KKPR_OSS_ALL/MapServer/0/query';
  var LAYER_BERUSAHA = DASAR_LAYER + 'KKPR_BERUSAHA/MapServer/0/query';

  /* Mode kedua. Layer ini satu-satunya di folder KKPR yang punya NAMA_PMHN,
     jadi satu-satunya yang bisa dijangkau tanpa NIB. 18.603 baris, extent
     95,23 - 140,87 BT dan -10,76 - 5,89 LU. */
  var LAYER_NAMA = DASAR_LAYER + 'kkpr_spr_all/MapServer/0/query';

  /* LUAS, NILAI_INVEST, dan NILAI_PNBP di layer ini semuanya STRING, bukan
     angka -- "47324 m2", "21000000000". Kalau dibaca langsung tanpa
     konversi, hasilnya NaN dan luas tiap baris kosong tanpa error. */
  var FIELDS_NAMA = 'IDPLOK,NAMA_PMHN,NOMEN_KBLI,KODE_KBLI,PROVINSI,KAB_KOT,'
    + 'KWNGN,LUAS,NO_KKPR,TGL_KKPR,NILAI_INVEST,NILAI_PNBP';

  /* Batas server: maxRecordCount 1000 di layer ini. requestRecordCount yang
     lebih besar tetap dijawab 1000, jadi paginasi selalu 1000 per halaman
     dan angka "dipotong" harus dinyatakan. */
  var BATAS_NAMA = 1000;

  /* Dipakai kalau services ATR/BPN tidak mengirim header CORS. Pola yang
     sama sudah dipakai attribute-table.js untuk ArcGIS, jadi tidak ada
     infrastruktur baru di sini. */
  var CORS_PROXY = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';

  var NIB_PANJANG = 13;
  var REQUEST_TIMEOUT_MS = 45000;

  /* Codebook KBLI 2020: peta { kode 5 digit -> judul subkategori }. File-nya
     sekitar 123 KB dan hanya diambil sekali, dan itu pun baru ketika ada
     hasil BERUSAHA yang benar-benar punya kode kbli -- pencarian NIB yang
     hanya ketemu OSS_ALL tidak perlu unduhan ini sama sekali. */
  var KODEBOOK_URL = 'assets/data/kbli-2020.json';

  /* Batas "terlalu besar" untuk satu bidang tanah. 0,05 derajat ~ 5,5 km
     di equator. Di atas ini geometri ditandai ganjil: tetap digambar,
     tapi dengan garis putus-putus dan diberi catatan di status. Ambil
     angka longgar supaya bidang yang benar tapi berukuran besar tidak
     ikut ditandai; yang ditandai adalah yang benar-benar salah, seperti
     poligon 200+ km yang ditemukan di sekitar Bandung. */
  var BATAS_GANJIL_DERJAT = 0.05;

  /* OSS_ALL tidak punya kbli; BERUSAHA tidak punya field ini di daftar
     yang ditanyakan justru punya, jadi field mana pun yang tidak ada
     diabaikan oleh ArcGIS. Field tetap ditanyakan per layer supaya tidak
     ada field asing yang ikut terbawa. */
  var FIELDS_OSS = 'nib,id_izin,oss_id,id_proyek,jenis_kkpr,created_at';
  var FIELDS_BERUSAHA = 'nib,id_izin,oss_id,id_proyek,jenis_kkpr,created_at,kbli';

  var state = null;
  var mapLayer = null;
  var cache = new Map();
  var inFlight = new Map();
  var token = 0;

  var kodebook = null;
  var kodebookMuat = null;

  /* Mode kedua punya state sendiri dan peta sendiri. Menyatukannya dengan
     state NIB akan membuat "Reset Polygon" menghapus hasil yang bukan miliknya,
     dan dua hasil dari dua sumber berbeda akan tercampur di satu tabel --
     padahal kolomnya tidak sama sekali. */
  var stateNama = null;
  var mapLayerNama = null;
  var cacheNama = new Map();
  var inFlightNama = new Map();
  var tokenNama = 0;
  var provinsiCache = null;

  function esc(v) {
    if (v == null) return '-';
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function nomor(n) {
    return Number(n || 0).toLocaleString('id-ID');
  }

  /* created_at datang sebagai epoch milidetik. Nilai 0 atau null berarti
     server tidak mengisinya -- bukan tanggal 1 Januari 1970. */
  function tanggal(ms) {
    if (ms == null) return '-';
    var n = Number(ms);
    if (!isFinite(n) || n <= 0) return '-';
    try {
      return new Date(n).toLocaleDateString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric'
      });
    } catch (e) {
      return '-';
    }
  }

  /* NIB disimpan apa adanya. Server tidak membedakan huruf besar, dan
     aslinya sudah huruf angka semua, jadi normalisasi hanya membuang spasi
     dan tanda hubung yang sering diketik orang dari dokumen. */
  function normalisasiNib(v) {
    return String(v == null ? '' : v).replace(/[\s-]/g, '');
  }

  function nibValid(v) {
    return /^\d{13}$/.test(v);
  }

  /* ── utilitas mode kedua ──
     semua di sini bekerja pada nilai yang datang sebagai STRING dari layer
     kkpr_spr_all. Kegagalan parse dikembalikan sebagai null, bukan 0:
     0 adalah jawaban yang sah dan tidak boleh dipakai sebagai pengganti
     ketidaktahuan. */

  /* LUAS di layer ini BUKAN satu format. Dari 1.000 baris pertama yang
     dicek, hanya sebagian yang bisa dibaca sebagai satu angka sederhana:

       "47324 m2", "93968.2851474 m2"   titik = desimal        778 baris
       "19,97 Ha", "3,01 Ha"            koma  = desimal         34 baris
       "5.652,64 m2"                    titik = RIBUAN, koma   = desimal
       "104.841,05 m2"                    10 baris
       "30.474 m2"                       3 desimal -> seribu  28 baris

     Dua yang pertama tidak boleh disamakan: "93968.2851474" jelas desimal
     (7 desimal), sementara "30.474" bisa berarti 30,474 atau 30.474 --
     dan untuk luas tanah, 30.474 ha masuk akal sedangkan 30,474 m2 tidak.
     Jadi titik TIGA desimal di akhir dianggap pemisah ribuan, titik lain
     dianggap desimal. Bukan tebakan tanpa dasar: "30.474" dan "93968.285"
     ada di baris yang sama, jadi keduanya harus bisa dibaca.

     Yang punya titik DAN koma ("5.652,64"), titik pasti ribuan.

     Satuan juga tidak seragam: 843 baris m2, 146 baris Ha, dan 1 baris
     "m²" (mojibake). Konversi ke satuan sama dilakukan di sini supaya
     penjumlahan tidak menjumlahkan m2 dengan Ha, yang akan menghasilkan
     angka 10.000 kali lebih besar dari yang benar tanpa error sama sekali.

     Hasil selalu dalam m2. Kegagalan parse mengembalikan null, bukan 0:
     0 adalah jawaban yang sah, sedangkan string yang tidak terbaca adalah
     ketidaktahuan, dan keduanya tidak boleh disamakan di tabel. */
  function parseLuas(v) {
    var s = String(v == null ? '' : v).replace(/ /g, ' ').trim();
    if (!s || s === '<Null>') return null;

    /* Satuan diambil dari token terakhir, tapi hanya kalau looks like
       satuan -- supaya "242,06" (tanpa satuan) tidak kehilangan angkanya
       hanya karena tidak ada spasi. */
    var satuan = '';
    var mSat = s.match(/\s*(m2|m\^?2|ha)$/i);
    if (mSat) {
      satuan = mSat[1].toLowerCase();
      s = s.slice(0, mSat.index).trim();
    } else if (/\s/.test(s)) {
      /* Ada spasi tapi bukan satuan yang dikenal: sisanya dibuang dan
         hasilnya dianggap tidak terbaca. Menebak satuan dari kata yang
         tak dikenal akan menghasilkan angka yang terlihat sahih. */
      return null;
    }

    if (!/^[0-9.,\s]+$/.test(s)) return null;

    var angka;
    if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) {
      /* Ribuan gaya Indonesia: titik membuang, koma jadi titik. */
      angka = s.replace(/\./g, '').replace(',', '.');
    } else if (s.indexOf(',') >= 0) {
      /* Hanya koma: desimal gaya Indonesia. */
      angka = s.replace(',', '.');
    } else if (/\.\d{3}$/.test(s) && !/\.\d{1,2}$/.test(s)) {
      /* Titik tiga desimal di akhir dan bukan satu-dua desimal: ribuan.
         30.474 -> 30474, sedangkan 93968.2851474 tetap apa adanya karena
         desimalnya lebih dari tiga. */
      angka = s.replace(/\./g, '');
    } else {
      angka = s;
    }

    /* Buang spasi sisa ("2 500") lalu pastikan benar-benar angka. */
    angka = angka.replace(/\s+/g, '');
    if (!/^\d+(\.\d+)?$/.test(angka)) return null;
    var n = Number(angka);
    if (!isFinite(n)) return null;

    /* Ha ke m2. Satu-satunya konversi satuan yang dilakukan di sini. */
    if (satuan === 'ha') return n * 10000;
    return n;
  }

  /* NILAI_INVEST = "21000000000", NILAI_PNBP = "802167". Keduanya string
     dan keduanya sudah dalam rupiah penuh, jadi tidak ada konversi satuan
     -- cukup pastikan itu angka. Nilai seperti "1,2 M" tidak ditemukan dan
     akan jadi null. */
  function parseRupiah(v) {
    var s = String(v == null ? '' : v).replace(/[\s.]/g, '').replace(/,/g, '.');
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  function formatRupiah(n) {
    if (n == null || !isFinite(n)) return '-';
    return 'Rp ' + Math.round(n).toLocaleString('id-ID');
  }

  /* TGL_KKPR di layer ini datang sebagai epoch milidetik, sama seperti
     created_at di layer NIB, dan 0 berarti server tidak mengisinya -- bukan
     1 Januari 1970. */
  function tanggalMs(ms) {
    if (ms == null) return '-';
    var n = Number(ms);
    if (!isFinite(n) || n <= 0) return '-';
    try {
      return new Date(n).toLocaleDateString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric'
      });
    } catch (e) {
      return '-';
    }
  }

  /* Nama pemohon dari server sometimes punya spasi ganda atau spasi di
     awal/akhir. Untuk LIKE, "  UNISBA " tidak akan cocok dengan "%UNISBA%"
     kalau yang diketik pengguna persis, jadi input dibersihkan dan query
     dibuat dari teks yang sudah bersih -- bukan dari input mentah. */
  function bersihNama(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  }

  /* Kutip nilai string untuk WHERE. Nama pemohon bisa mengandung tanda
     kutip tunggal ("GUDANG PT 'X'"), dan tanda itu harus dilipat dua kali
     supaya tidak menutup query dan membuat seluruh WHERE gagal. */
  function kutipSql(s) {
    return "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'";
  }

  /* Host proxy expects the inner URL mentah --JX, bukan percent-encoded.
     Karena itu query string-nya dirakit sendiri, tanpa encode. */
  function buildUrl(opts) {
    var o = opts || {};
    var q = [
      'where=' + (o.where || '1=1'),
      'outFields=' + (o.fields || FIELDS_OSS),
      'returnGeometry=true',
      'outSR=4326',
      'resultRecordCount=' + (o.limit || 200),
      'f=geojson'
    ];
    if (o.envelope) {
      q.push('geometry=' + o.envelope);
      q.push('geometryType=esriGeometryEnvelope');
      q.push('inSR=4326');
      q.push('spatialRel=esriSpatialRelIntersects');
    }
    if (o.offset) q.push('resultOffset=' + o.offset);
    return HOST_PROXY + (o.layer || LAYER_OSS) + '?' + q.join('&');
  }

  /* URL khusus mode kedua, dan bedanya bukan sekadar mengganti nama layer.

     f=json, bukan f=geojson. Terbukti: PROVINSI='Aceh' di kkpr_spr_all
     mengembalikan 0 fitur dengan f=geojson dan 3 fitur dengan f=json,
     padahal service mengiklankan "JSON, geoJSON" di supportedQueryFormats.
     Jadi hasil f=json di sini datang sebagai esriGeometry.rings dan WAJIB
     dikonversi lewat esriKeTurf() -- bukan dipakai langsung seperti GeoJSON.

     where juga tetap mentah, sama seperti mode pertama: proxy ini tidak
     meng-encode URL di dalamnya, jadi parameter harus ikut sebagai & biasa. */
  function buildUrlNama(opts) {
    var o = opts || {};
    var q = [
      'f=json',
      'where=' + (o.where || '1=1'),
      'outFields=' + FIELDS_NAMA,
      'returnGeometry=true',
      'outSR=4326',
      'resultRecordCount=' + BATAS_NAMA
    ];
    if (o.offset) q.push('resultOffset=' + o.offset);
    return HOST_PROXY + LAYER_NAMA + '?' + q.join('&');
  }

  function corsUrl(url) {
    return CORS_PROXY + encodeURIComponent(url);
  }

  async function fetchJson(url) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT_MS);
    try {
      var res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (err) {
      /* Kemungkinan besar CORS: host ATR/BPN tidak mengirim
         Access-Control-Allow-Origin. Coba lewat proxy CORS yang sudah
         dipakai halaman ini untuk ArcGIS lain. */
      if (err && err.name === 'AbortError') throw err;
      try {
        var res2 = await fetch(corsUrl(url), { signal: ctrl.signal });
        if (!res2.ok) throw new Error('HTTP ' + res2.status);
        return await res2.json();
      } catch (err2) {
        throw err;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /* Satu poligon per GEOMETRI UNIK, bukan per baris. NIB 2008250122752
     punya 5 baris dengan geometri yang persis sama; digambar lima kali
     akan saling menutupi (z-fighting) dan membuat peta terlihat seperti
     cuma satu bidang padahal izinnya berbeda. Baris dikelompokkan ke
     dalam grup supaya popup tetap bisa menampilkan semua izinnya. */
  function grupkan(features) {
    var grup = [];
    var peta = new Map();
    for (var i = 0; i < features.length; i++) {
      var f = features[i];
      if (!f || !f.geometry) continue;
      var p = f.properties || {};
      var kunci = geometriKunci(f.geometry);
      var ada = peta.get(kunci);
      if (!ada) {
        ada = { geometry: f.geometry, nib: p.nib || '', izin: [], ganjil: ganjil(f.geometry) };
        peta.set(kunci, ada);
        grup.push(ada);
      }
      ada.izin.push(p);
    }
    return grup;
  }

  /* Kunci pembeda geometri dibulatkan supaya dua baris yang koordinatnya
     identik tidak terpisah menjadi dua grup hanya karena selisih
     presisi. Lima desimal ~ 1,1 m, jauh lebih kasar dari presisi data. */
  function geometriKunci(geom) {
    var pts = [];
    var rings = geom.type === 'Polygon' ? [geom.coordinates]
      : geom.type === 'MultiPolygon' ? geom.coordinates
        : [];
    for (var r = 0; r < rings.length; r++) {
      var ring = rings[r][0] || [];
      for (var i = 0; i < ring.length; i++) {
        pts.push(ring[i][0].toFixed(5) + ',' + ring[i][1].toFixed(5));
      }
    }
    return pts.join(' ');
  }

  function bbox(geom) {
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    var rings = geom.type === 'Polygon' ? [geom.coordinates]
      : geom.type === 'MultiPolygon' ? geom.coordinates
        : [];
    for (var r = 0; r < rings.length; r++) {
      var ring = rings[r][0] || [];
      for (var i = 0; i < ring.length; i++) {
        var x = ring[i][0], y = ring[i][1];
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
    }
    if (minx === Infinity) return null;
    return { minx: minx, miny: miny, maxx: maxx, maxy: maxy };
  }

  function ganjil(geom) {
    var b = bbox(geom);
    if (!b) return true;
    return (b.maxx - b.minx) > BATAS_GANJIL_DERJAT ||
      (b.maxy - b.miny) > BATAS_GANJIL_DERJAT;
  }

  function unionBbox(grup) {
    var u = null;
    for (var i = 0; i < grup.length; i++) {
      var b = bbox(grup[i].geometry);
      if (!b) continue;
      if (!u) { u = { minx: b.minx, miny: b.miny, maxx: b.maxx, maxy: b.maxy }; continue; }
      u.minx = Math.min(u.minx, b.minx);
      u.miny = Math.min(u.miny, b.miny);
      u.maxx = Math.max(u.maxx, b.maxx);
      u.maxy = Math.max(u.maxy, b.maxy);
    }
    return u;
  }

  /* ── KBLI ──────────────────────────────────────────────────────────────
     Kode di BERUSAHA tidak konsisten panjangnya: dari 1.323 kode berbeda
     yang nyata dipakai, 1.217 lima digit, 106 empat digit (leading zero
     hilang, mis. 1270 untuk 01270), dan sisanya nilai sentinel. Semua
     dinormalkan ke lima digit supaya cocok dengan codebook. */

  function kbliKode(v) {
    var s = String(v == null ? '' : v).replace(/[\s.\-]/g, '');
    if (!/^\d+$/.test(s)) return '';
    /* "0" dan "00000" muncul di ATR/BPN sebagai placeholder untuk izin yang
       belum punya KBLI, bukan sebagai kode KBLI yang sah. */
    if (/^0+$/.test(s)) return '';
    if (s.length > 5) return '';
    while (s.length < 5) s = '0' + s;
    return s;
  }

  function muatKodebook() {
    if (kodebook) return Promise.resolve(kodebook);
    if (kodebookMuat) return kodebookMuat;
    kodebookMuat = fetch(KODEBOOK_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        /* _meta hanya keterangan build, bukan entri kode. */
        if (json && typeof json === 'object') delete json._meta;
        kodebook = json || {};
        return kodebook;
      })
      .catch(function () {
        /* Codebook gagal diambil bukan alasan menyembunyikan hasil. Geometri
           dan nomor izin tetap tampil; hanya kolom nama usaha yang kosong. */
        kodebook = {};
        return kodebook;
      });
    return kodebookMuat;
  }

  function judulKbli(kode) {
    if (!kode || !kodebook) return '';
    return kodebook[kode] || '';
  }

  /* Kunci penggabungan. id_izin kadang kosong, dan yang kosong tidak boleh
     jadi kunci merge karena semuanya akan collapse jadi satu. Fallback ke
     oss_id; kalau dua-duanya kosong, baris tidak bisa dipastikan milik izin
     yang sama dan sengaja dibiarkan terpisah. */
  function kunciIzin(p, fallback) {
    var id = String((p && p.id_izin) || '').trim();
    if (id && id !== '-') return 'i:' + id;
    var oss = String((p && p.oss_id) || '').trim();
    if (oss && oss !== '-') return 'o:' + oss;
    return 'x:' + fallback;
  }

  /* Gabung dua layer berdasarkan id_izin, satu arah: OSS_ALL menentukan
     geometri, BERUSAHA menambah field kbli pada izin yang sama. Izin yang
     hanya ada di BERUSAHA tetap hidup, dengan geometri BERUSAHA sendiri --
     itu bukan data asing, itu izin nyata yang belum masuk OSS_ALL. */
  function gabung(featsOss, featsBerusaha) {
    var peta = new Map();
    var hasil = [];
    var i;

    for (i = 0; i < featsOss.length; i++) {
      var f = featsOss[i];
      if (!f) continue;
      var p = f.properties || {};
      peta.set(kunciIzin(p, 'o' + i), p);
      hasil.push(f);
    }

    var hanyaBerusaha = 0;
    for (i = 0; i < featsBerusaha.length; i++) {
      var g = featsBerusaha[i];
      if (!g) continue;
      var q = g.properties || {};
      var ada = peta.get(kunciIzin(q, 'b' + i));
      if (ada) {
        /* id_izin sama: OSS_ALL sudah membawa geometri dan id proyek, jadi
           yang ditambahkan hanya kbli yang tidak ada di OSS_ALL. */
        if (q.kbli != null && q.kbli !== '') ada.kbli = q.kbli;
      } else {
        if (!g.geometry) continue;
        hasil.push(g);
        hanyaBerusaha++;
      }
    }

    return { features: hasil, hanyaBerusaha: hanyaBerusaha };
  }

  /* Terjemahkan kbli menjadi judul. Dilewati seluruhnya kalau tidak ada
     satu pun kode, supaya hasil yang hanya bersumber dari OSS_ALL tidak
     pernah memicu unduhan codebook. */
  function terapkanKbli(hasil) {
    var adaKode = false;
    var i, j;
    for (i = 0; i < hasil.grup.length; i++) {
      for (j = 0; j < hasil.grup[i].izin.length; j++) {
        if (kbliKode(hasil.grup[i].izin[j].kbli)) { adaKode = true; break; }
      }
      if (adaKode) break;
    }
    if (!adaKode) return Promise.resolve(hasil);

    return muatKodebook().then(function () {
      for (var a = 0; a < hasil.grup.length; a++) {
        for (var b = 0; b < hasil.grup[a].izin.length; b++) {
          var p = hasil.grup[a].izin[b];
          var kode = kbliKode(p.kbli);
          p.kbli_kode = kode;
          p.kbli_judul = kode ? judulKbli(kode) : '';
        }
      }
      return hasil;
    });
  }

  function load(nib) {
    if (cache.has(nib)) return Promise.resolve(cache.get(nib));
    if (inFlight.has(nib)) return inFlight.get(nib);

    var where = "nib='" + nib + "'";

    /* allSettled, bukan all: kalau satu layer gagal, yang lain harus tetap
       tampil. Menyembunyikan data yang berhasil dimuat karena request lain
       error lebih buruk daripada menampilkan hasil sebagian. */
    var p = Promise.allSettled([
      fetchJson(buildUrl({ where: where, layer: LAYER_OSS, fields: FIELDS_OSS })),
      fetchJson(buildUrl({ where: where, layer: LAYER_BERUSAHA, fields: FIELDS_BERUSAHA }))
    ])
      .then(function (settled) {
        inFlight.delete(nib);

        if (settled[0].status === 'rejected' && settled[1].status === 'rejected') {
          throw settled[0].reason;
        }

        var oss = settled[0].status === 'fulfilled'
          ? ((settled[0].value && settled[0].value.features) || []) : [];
        var berusaha = settled[1].status === 'fulfilled'
          ? ((settled[1].value && settled[1].value.features) || []) : [];

        var gab = gabung(oss, berusaha);
        var hasil = {
          nib: nib,
          grup: grupkan(gab.features),
          total: gab.features.length,
          nOss: oss.length,
          nHanyaBerusaha: gab.hanyaBerusaha,
          gagalOss: settled[0].status === 'rejected',
          gagalBerusaha: settled[1].status === 'rejected'
        };

        return terapkanKbli(hasil);
      })
      .then(function (hasil) {
        // Cache tidak menyimpan NIB yang kosong: data ATR/BPN berubah
        // dari waktu ke waktu, dan mengunci "tidak ditemukan" lebih lama
        // akan membuat pengguna yakin NIB itu memang tidak ada.
        if (grupnyaAda(hasil)) cache.set(nib, hasil);
        return hasil;
      })
      .catch(function (err) {
        inFlight.delete(nib);
        throw err;
      });

    inFlight.set(nib, p);
    return p;
  }

  function grupnyaAda(hasil) {
    return !!(hasil && hasil.grup && hasil.grup.length);
  }

  /* ══════════════════════════════════════════════════════════════════
     MODE KEDUA: CARI NAMA USAHA -- kkpr_spr_all
     ══════════════════════════════════════════════════════════════════ */

  /* Daftar provinsi untuk dropdown.

     groupByFieldsForStatistics TIDAK bisa dipakai di layer ini: query
     groupBy PROVINSI membalas {"error":{"code":400,"message":"Unable to
     complete operation."}} -- dicoba dan gagal. Jadi daftar provinsi
     dikumpulkan dengan resultOffset, satu halaman 1000 baris per
     permintaan, dan berhenti begitu halaman terurut kehabisan nilai baru.

     18.603 baris total berarti 19 permintaan untuk daftar lengkap. Itu
     banyak, jadi hasilnya disimpan di cache dan HANYA diambil saat dropdown
     dibuka untuk pertama kali -- bukan bersama setiap pencarian. */
  var HALAMAN_PROVINSI = 1000;

  async function daftarProvinsi() {
    if (provinsiCache) return provinsiCache;
    var seen = new Set();
    var offset = 0;
    /* Pengaman terhadap halaman kosong yang diulang tanpa henti. Sembilan
       belas halaman memang cukup untuk 18.603 baris, tapi server yang salah
       akan mengembalikan offset yang sama selamanya dan loop ini tidak akan
       pernah berhenti. */
    var maxIterasi = 40;
    for (var i = 0; i < maxIterasi; i++) {
      var url = buildUrlNama({ where: '1=1', offset: offset });
      var json = await fetchJson(url);
      var fitur = (json && json.features) || [];
      if (!fitur.length) break;
      for (var f = 0; f < fitur.length; f++) {
        var p = (fitur[f] && fitur[f].attributes) || {};
        var prov = String(p.PROVINSI || '').replace(/\s+/g, ' ').trim();
        if (prov) seen.add(prov);
      }
      if (fitur.length < HALAMAN_PROVINSI) break;
      offset += HALAMAN_PROVINSI;
    }
    provinsiCache = Array.from(seen).sort(function (a, b) { return a.localeCompare(b, 'id'); });
    return provinsiCache;
  }

  /* Susun WHERE dari input pengguna. Setiap bagian yang kosong TIDAK
     ditambahkan -- jadi satu pencarian "UNISBA" tanpa provinsi tidak
     berubah jadi dua syarat. Satu-satunya syarat wajibnya ada satu saja,
     yaitu minimal satu filter, supaya "tampilkan semua 18.603 baris" tidak
     bisa terjadi karena tombolnya ditekan tanpa sengaja.

     WILDCARD LIKE DI-TULIS SEBAGAI %25, BUKAN %. Ini bukan gaya penulisan.

     WAF di depan tres/proxy.ashx menolak request yang memuat persen mentah
     di query string, dan membalas HTTP 200 dengan badan HTML
     "<title>Request Rejected</title>" beserta support ID -- bukan 4xx, jadi
     fetch() menganggapnya sukses dan res.json() gagal dengan
     "Unexpected token '<'". Terverifikasi: raw '%' ditolak, %25 dijawab
     {"count":2}. Query tanpa wildcard, dan query dengan kurung UPPER(),
     keduanya lolos -- jadi penolakannya benar-benar hanya pada persen.

     ArcGIS men-decode %25 kembali menjadi % sebelum mem-parsing WHERE, jadi
     polanya tetap bekerja seperti LIKE '%...%'.

     Perhatikan juga UPPER(): nama pemohon di server tidak konsisten
     huruf besar-kecilnya, dan LIKE di ArcGIS sensitif huruf. Tanpa UPPER,
     "unisba" tidak akan menemukan "UNISBA". */
  var WILDCARD = '%25';

  function whereNama(nama, provinsi) {
    var syarat = [];
    var n = bersihNama(nama);
    var p = bersihNama(provinsi);
    if (n) {
      /* Kutip nilai tetap harus dilipat dua kali, dan itu dilakukan oleh
         kutipSql sebelum penyisipan wildcard, supaya tanda kutip milik
         pengguna tidak bisa menutup query. */
      syarat.push('UPPER(NAMA_PMHN) LIKE ' + kutipSql(WILDCARD + n.toUpperCase() + WILDCARD));
    }
    if (p) syarat.push('PROVINSI=' + kutipSql(p));
    if (!syarat.length) return null;
    return syarat.join(' AND ');
  }

  /* Konversi satu fitur kkpr_spr_all menjadi baris tabel.

     Geometri f=json berupa esriGeometry.rings, jadi wajib lewat
     esriKeTurf(). Fungsi itu milik window.GeoTaniLbsLsd -- dipinjam, bukan
     disalin, supaya konversi rings di repo ini cuma ada satu implementasi.
     Kalau modul itu belum termuat, geometri ditolak dan baris tetap
     ditampilkan tanpa peta: lebih baik daripada tidak menampilkan izin
     sama sekali hanya karena satu script belum dimuat. */
  function keGeoJson(feat) {
    var rings = feat && feat.geometry && feat.geometry.rings;
    if (!rings) return null;
    var m = window.GeoTaniLbsLsd;
    if (m && typeof m.esriKeTurf === 'function') {
      var f = m.esriKeTurf(feat);
      return (f && f.geometry) || null;
    }
    return { type: 'Polygon', coordinates: rings };
  }

  /* Satu geometry per IDPLOK, bukan per baris.

     Feature yang sama bisa muncul lebih dari sekali: query bbox di Aceh
     mengembalikan "ACEH ENERGI EOLIANA" dua kali, dan itu bukan Request
     kembar, melainkan satu bidang dengan lebih dari satu izin. IDPLOK
     dipakai sebagai kunci -- itu id proyek lokasi, yang sama dengan
     id_proyek_lokasi di OSS_ALL, dan satu lokasi Normally punya satu
     bidang. */
  function grupkanNama(features) {
    var grup = [];
    var peta = new Map();
    for (var i = 0; i < features.length; i++) {
      var f = features[i];
      if (!f) continue;
      var p = f.attributes || {};
      var idplok = String(p.IDPLOK || '').trim();
      /* Baris tanpa IDPLOK tidak bisa di Keys dengan aman: kalau
         semuanya kosong, semua akan collapse jadi satu bidang besar yang
         salah. Baris seperti itu tetap ditampilkan, satu per baris. */
      var kunci = idplok ? 'p:' + idplok : 'x:' + i;
      var geom = keGeoJson(f);
      var ada = peta.get(kunci);
      if (!ada) {
        ada = {
          kunci: kunci,
          geometry: geom,
          idplok: idplok,
          nama: bersihNama(p.NAMA_PMHN) || '(tanpa nama)',
          aktivitas: bersihkan(p.NOMEN_KBLI),
          kodeKbli: bersihkan(p.KODE_KBLI),
          provinsi: bersihkan(p.PROVINSI),
          kabKota: bersihkan(p.KAB_KOT),
          kewenangan: bersihkan(p.KWNGN),
          noKkpr: bersihkan(p.NO_KKPR),
          tglKkpr: tanggalMs(p.TGL_KKPR),
          luasM2: parseLuas(p.LUAS),
          luasMentah: bersihkan(p.LUAS),
          investasi: parseRupiah(p.NILAI_INVEST),
          pnbp: parseRupiah(p.NILAI_PNBP),
          /* NIB diisi belakangan oleh lookupNibUntuk(). Kosong berarti
             join tidak kena -- dan itu kondisi yang biasa, bukan error. */
          nib: null,
          /* Atribut mentah disimpan supaya popup bisa menampilkan nilai
             server apa adanya kalau format lokal gagal mem-parse. */
          attrs: p,
          ganjil: geom ? ganjil(geom) : true
        };
        peta.set(kunci, ada);
        grup.push(ada);
      }
    }
    grup.sort(function (a, b) { return (b.luasM2 || 0) - (a.luasM2 || 0); });
    return grup;
  }

  /* Server mengisi banyak field dengan satu spasi (" ", "NO_KKPR": " "),
     yang secara visual sama dengan kosong tapi tidak sama dengan null.
     Perlakukan sebagai kosong supaya tabel tidak penuh sel berisi " ". */
  function bersihkan(v) {
    var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    return (s === '-' || s === '-') ? '' : s;
  }

  /* Satu request. Tidak ada paginasi di sini: BATAS_NAMA sudah 1000 dan
     exceedTransferLimit pada hasil itu yang dilaporkan, bukan diperbaiki
     diam-diam dengan mengambil halaman berikutnya. Layer ini mengembalikan
     1.545 baris untuk nama umum; mengambil semua halaman hanya akan
     memperlambat tanpa memberi jawaban yang lebih benar, karena pengguna
     yang mengetik "INDONESIA" sedang mencari perusahaan tertentu, bukan
     daftar seluruhnya. */
  async function queryNama(where) {
    var json = await fetchJson(buildUrlNama({ where: where }));
    if (json && json.error) {
      throw new Error('ArcGIS ' + (json.error.code || '?') + ': ' + (json.error.message || 'tanpa pesan'));
    }
    var fitur = (json && json.features) || [];
    return {
      fitur: fitur,
      terpotong: !!(json && json.exceededTransferLimit) || fitur.length >= BATAS_NAMA
    };
  }

  /* Cari NIB untuk satu IDPLOK.

    Join kkpr_spr_all ke OSS_ALL lewat IDPLOK = id_proyek_lokasi. Dari 20
     sampel hanya 5 yang ketemu, jadi sebagian besar GAGAL dan itu kondisi biasa.

     Karena itu hasilnya dipakai sebagai tambahan, bukan sumber. Kalau tidak
     ketemu, baris tetap tampil tanpa NIB dan tombol "cari NIB" tidak
     muncul sama sekali -- bukan muncul lalu gagal. */
  async function lookupNibUntuk(idplok) {
    var id = String(idplok || '').trim();
    if (!id) return null;
    var where = 'id_proyek_lokasi=' + kutipSql(id);
    var url = buildUrl({ where: where, fields: 'nib,id_proyek_lokasi', limit: 1 });
    var json = await fetchJson(url);
    var fitur = (json && json.features) || [];
    if (!fitur.length) return null;
    var p = fitur[0] && (fitur[0].properties || {});
    /* f=geojson mengembalikan properties; kalau server suatu saat mengubah
       bentuknya, fallback membaca attributes supaya tidak diam-diam null. */
    var attrs = p && p.nib !== undefined ? p : ((fitur[0] && fitur[0].attributes) || {});
    return attrs.nib ? String(attrs.nib) : null;
  }

  /* isiNibUntuk grup. Request per IDPLOK bisa banyak untuk hasil besar, jadi
     dibatasi 12: mengisi semuanya berarti puluhan request dan itu lambat
     tanpa manfaat. Baris yang tidak sempat dicek ditandai apa adanya. */
  async function isiNibUntuk(grup) {
    var batasi = grup.slice(0, 12);
    var sisa = grup.slice(12);
    var antre = Promise.all(batasi.map(function (g) {
      return lookupNibUntuk(g.idplok).then(function (nib) {
        g.nib = nib;
      }).catch(function () {
        /* Join gagal adalah kondisi biasa (3 dari 4 gagal). Tidak boleh
           menggagalkan seluruh pencarian karena satu request join gagal. */
        g.nib = null;
      });
    }));
    for (var i = 0; i < sisa.length; i++) sisa[i].nibTidakDicek = true;
    await antre;
    return grup;
  }

  function loadNama(opts) {
    var o = opts || {};
    var where = whereNama(o.nama, o.provinsi);
    if (!where) return Promise.reject(new Error('Isi nama usaha atau pilih provinsi lebih dulu.'));
    var kunci = where;

    if (cacheNama.has(kunci)) return Promise.resolve(cacheNama.get(kunci));
    if (inFlightNama.has(kunci)) return inFlightNama.get(kunci);

    var p = queryNama(where).then(function (got) {
      inFlightNama.delete(kunci);
      var grup = grupkanNama(got.fitur);
      var hasil = {
        where: where,
        nama: bersihNama(o.nama),
        provinsi: bersihNama(o.provinsi),
        grup: grup,
        total: got.fitur.length,
        terpotong: got.terpotong
      };
      return isiNibUntuk(grup).then(function () { return hasil; });
    }).then(function (hasil) {
      /* Cache tidak menyimpan hasil kosong, sama seperti mode NIB: data
         ATR/BPN berubah, dan mengunci "tidak ditemukan" membuat pengguna
         yakin layer itu tidak punya data padahal filter-nya terlalu sempit. */
      if (hasil.grup.length) cacheNama.set(kunci, hasil);
      return hasil;
    }).catch(function (err) {
      inFlightNama.delete(kunci);
      throw err;
    });

    inFlightNama.set(kunci, p);
    return p;
  }

  function popupHtml(g) {
    var baris = '';
    for (var i = 0; i < g.izin.length; i++) {
      var p = g.izin[i] || {};
      baris += '<div class="geotani-sls-popup-row"><span>Izin ' + (i + 1) + '</span><b>' +
        esc(p.id_izin || '-') + '</b></div>';
      if (p.kbli_kode) {
        baris += '<div class="geotani-sls-popup-row"><span>&nbsp;&nbsp;KBLI</span><b>' +
          esc(p.kbli_kode) + (p.kbli_judul ? ' &middot; ' + esc(p.kbli_judul) : '') + '</b></div>';
      }
    }
    return '<div class="geotani-sls-popup">' +
      '<div class="geotani-sls-popup-title">NIB ' + esc(g.nib) + '</div>' +
      '<div class="geotani-sls-popup-row"><span>Jumlah izin</span><b>' + nomor(g.izin.length) + '</b></div>' +
      baris +
      (g.ganjil
        ? '<div class="geotani-sls-popup-row"><span>Catatan</span><b>geometri tidak wajar (terlalu besar untuk satu bidang)</b></div>'
        : '') +
      '</div>';
  }

  function clearMap() {
    if (mapLayer && window.map && window.map.hasLayer(mapLayer)) {
      window.map.removeLayer(mapLayer);
    }
    mapLayer = null;
  }

  /* Peta mode kedua. Warna sengaja sama dengan mode NIB: dua mode ini
     menampilkan hal yang sama (bidang KKPR), jadi warna yang berbeda akan
     membuat pengguna mengira yang di layar adalah layer yang lain.

     Layer tanpa geometri TIDAK diberi warna merah. Merah di sini berarti
     geometri tidak wajar, yaitu ada masalah; tidak ada geometri sama
     sekali adalah masalah berbeda dan tidak boleh memakai tanda yang sama.
     Baris seperti itu tetap tampil di daftar tanpa peta. */
  function clearMapNama() {
    if (mapLayerNama && window.map && window.map.hasLayer(mapLayerNama)) {
      window.map.removeLayer(mapLayerNama);
    }
    mapLayerNama = null;
  }

  function gambarNama(grup) {
    clearMapNama();
    if (!grupnyaAda({ grup: grup }) || !window.L || !window.map) return false;
    var items = [];
    for (var i = 0; i < grup.length; i++) {
      var g = grup[i];
      if (!g.geometry) continue;
      items.push(window.L.geoJSON(g.geometry, {
        style: g.ganjil
          ? { color: '#dc2626', weight: 2, dashArray: '5,4', fillColor: '#dc2626', fillOpacity: 0.12 }
          : { color: '#0e7490', weight: 2, fillColor: '#22d3ee', fillOpacity: 0.25 }
      }));
    }
    if (!items.length) return false;
    mapLayerNama = window.L.featureGroup(items).addTo(window.map);
    return true;
  }

  function zoomKeNama(grup) {
    /* Hanya grup yang punya geometri yang boleh dipakai untuk zoom. Kalau
       tidak ada satu pun, fitBounds akan menerima daftar kosong dan melempar
       error, bukan diam-diam tidak menggeser kamera. */
    var punyaGeom = [];
    for (var i = 0; i < (grup || []).length; i++) {
      if (grup[i] && grup[i].geometry) punyaGeom.push(grup[i]);
    }
    var u = unionBbox(punyaGeom);
    if (!u || !window.map || !window.L) return false;
    window.map.fitBounds(
      window.L.latLngBounds([[u.miny, u.minx], [u.maxy, u.maxx]]).pad(0.15),
      { maxZoom: 18 }
    );
    return true;
  }

  function drawOnMapNama(opts) {
    if (!stateNama) return false;
    var o = opts || {};
    if (!gambarNama(stateNama.grup)) return false;
    if (o.flyTo !== false) zoomKeNama(stateNama.grup);
    return true;
  }

  function popupNama(g) {
    var baris = '';
    function tambah(label, nilai, mentah) {
      if (nilai === '' || nilai == null) return;
      baris += '<div class="geotani-sls-popup-row"><span>' + esc(label) +
        '</span><b>' + (mentah ? nilai : esc(nilai)) + '</b></div>';
    }
    tambah('Aktivitas', g.aktivitas);
    tambah('Kode KBLI', g.kodeKbli);
    tambah('Provinsi', g.provinsi);
    tambah('Kab/Kota', g.kabKota);
    tambah('Kewenangan', g.kewenangan);
    tambah('No. KKPR', g.noKkpr);
    tambah('Tanggal KKPR', g.tglKkpr);
    /* Luas: kalau gagal di-parse, teks server ditampilkan mentah. Menampilkan
       0 ha di sini berarti menyatakan tidak ada tanah, dan itu beda dari
       "server menulis luas dalam format yang tidak.dimahami". */
    if (g.luasM2 != null) {
      baris += '<div class="geotani-sls-popup-row"><span>Luas</span><b>' +
        nomor(g.luasM2) + ' m2</b></div>';
    } else if (g.luasMentah) {
      baris += '<div class="geotani-sls-popup-row"><span>Luas</span><b>' +
        esc(g.luasMentah) + '</b></div>';
    }
    if (g.investasi != null) tambah('Investasi', formatRupiah(g.investasi));
    if (g.pnbp != null) tambah('PNBP', formatRupiah(g.pnbp));
    /* NIB hanya muncul kalau join ke OSS_ALL kena. */
    tambah('NIB (dari data izin ATR/BPN)', g.nib);
    return '<div class="geotani-sls-popup">' +
      '<div class="geotani-sls-popup-title">' + esc(g.nama) + '</div>' +
      '<div class="geotani-sls-popup-row"><span>Sumber</span><b>ATR/BPN</b></div>' +
      baris +
      (g.ganjil && g.geometry
        ? '<div class="geotani-sls-popup-row"><span>Catatan</span><b>geometri tidak wajar (terlalu besar untuk satu bidang)</b></div>'
        : '') +
      (g.geometry ? '' :
        '<div class="geotani-sls-popup-row"><span>Catatan</span><b>geometri tidak termuat, bidang hanya tampil di daftar</b></div>') +
      '</div>';
  }

  function listNamaHtml(hasil) {
    var s = hasil || stateNama;
    if (!s) return '';
    var g = s.grup;
    if (!g.length) return '';

    var html = '';
    /* Jumlah luas dijumlahkan hanya dari baris yang luasnya benar-benar
       terbaca. Kalau ada baris berformat aneh, jumlahnya diberi catatan --
       bukan diperlakukan sebagai nol, yang akan membuat total terlihat
       lengkap padahal ada baris yang tidak ikut terhitung. */
    var totalM2 = 0;
    var tanpaLuas = 0;
    for (var i = 0; i < g.length; i++) {
      if (g[i].luasM2 == null) tanpaLuas += 1; else totalM2 += g[i].luasM2;
    }

    var nGanjil = 0, tanpaNib = 0, tanpaGeom = 0;
    for (var j = 0; j < g.length; j++) {
      if (g[j].ganjil && g[j].geometry) nGanjil += 1;
      if (!g[j].nib) tanpaNib += 1;
      if (!g[j].geometry) tanpaGeom += 1;
    }

    html += '<div class="geotani-sls-desc">';
    html += 'Data ATR/BPN menemukan <b>' + nomor(g.length) + ' bidang</b>';
    if (s.nama) html += ' untuk nama mengandung &ldquo;' + esc(s.nama) + '&rdquo;';
    if (s.provinsi) html += ' di <b>' + esc(s.provinsi) + '</b>';
    html += '.</div>';

    var catatan = [];
    if (s.terpotong) {
      catatan.push('Server membatasi hasil per permintaan (' + nomor(BATAS_NAMA) +
        '). Ada data yang tidak ditampilkan, jadi jumlah di bawah understated');
    }
    if (tanpaLuas) {
      catatan.push(nomor(tanpaLuas) +
        ' baris punya luas dalam format yang tidak dipahami dan tidak ikut dijumlahkan');
    }
    if (tanpaGeom) {
      catatan.push(nomor(tanpaGeom) +
        ' bidang tidak punya geometri, jadi tidak bisa digambar di peta');
    }
    if (nGanjil) {
      catatan.push(nomor(nGanjil) +
        ' geometri berukuran tidak wajar (> 5 km) dan ditandai garis putus-putus merah');
    }
    if (catatan.length) {
      html += '<div class="geotani-kkpr-warn">' + esc(catatan.join('. ') + '.') + '</div>';
    }

    if (g.length - tanpaNib > 0) {
      html += '<div class="geotani-sls-desc" style="font-size:10px;opacity:.75;">' +
        nomor(g.length - tanpaNib) + ' dari ' + nomor(g.length) +
        ' bidang punya NIB yang berhasil dicocokkan ke data izin ATR/BPN. ' +
        'Data luas-area ini tidak memuat NIB secara langsung, jadi sisanya memang '
        + 'tidak bisa dicocokkan &mdash; bukan berarti NIB-nya tidak ada.</div>';
    }

    html += '<div class="geotani-sls-desc" style="margin-top:8px;">Total luas terbaca: <b>' +
      nomor(Math.round(totalM2)) + ' m2</b></div>';

    html += '<div class="geotani-kkpr-table-wrap"><table class="geotani-kkpr-table">';
    html += '<thead><tr><th>Nama Pemohon</th><th>Aktivitas</th><th>Kab/Kota</th>'
      + '<th>Luas</th><th>Kewenangan</th><th>NIB</th></tr></thead><tbody>';
    for (var k = 0; k < g.length; k++) {
      var gr = g[k];
      html += '<tr>';
      html += '<td>' + esc(gr.nama) + (gr.noKkpr ? '<br><span class="geotani-kkpr-kosong">' +
        esc(gr.noKkpr) + '</span>' : '') + '</td>';
      html += '<td>' + (gr.aktivitas
        ? esc(gr.aktivitas)
        : (gr.kodeKbli
          ? '<span class="geotani-kkpr-kode">' + esc(gr.kodeKbli) + '</span>'
          : '<span class="geotani-kkpr-kosong">-</span>')) + '</td>';
      html += '<td>' + esc(gr.kabKota || gr.provinsi || '-') + '</td>';
      /* Tiga keadaan luas harus dibedakan: terbaca, ada tapi formatnya
         tidak dipahami, dan tidak ada sama sekali. */
      html += '<td>' + (gr.luasM2 != null
        ? nomor(Math.round(gr.luasM2)) + ' m2'
        : (gr.luasMentah
          ? '<span class="geotani-kkpr-kosong" title="format tidak dipahami oleh modul ini">' +
            esc(gr.luasMentah) + '</span>'
          : '<span class="geotani-kkpr-kosong">-</span>')) + '</td>';
      html += '<td>' + esc(gr.kewenangan || '-') + '</td>';
      html += '<td>' + (gr.nib
        ? esc(gr.nib)
        : (gr.nibTidakDicek
          ? '<span class="geotani-kkpr-kosong" title="di luar 12 baris pertama yang dicek NIB-nya">tidak dicek</span>'
          : '<span class="geotani-kkpr-kosong" title="nomor ini tidak ditemukan di data izin ATR/BPN">tidak ketemu</span>')) + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table></div>';

    html += '<div class="geotani-sls-desc" style="margin-top:10px;font-size:10px;opacity:.75;">' +
      'Sumber data: ATR/BPN. Nama pemohon dan nomen KBLI dibaca apa adanya dari ' +
      'server ATR/BPN &mdash; bukan diterjemahkan oleh RuangKita.<br>'
      + 'Kolom luas sudah dikonversi ke m2: server menulis satuan campuran (843 baris m2, ' +
      '146 baris Ha pada sampel 1.000 baris) dan menuliskannya sebagai teks. Baris yang ' +
      'formatnya tidak terbaca ditampilkan mentah dan tidak ikut dijumlahkan.<br>'
      + 'Kolom NIB dicocokkan dari data izin ATR/BPN, dan hanya cocok pada sebagian baris.</div>';
    return html;
  }

  function resetNama() {
    tokenNama++;
    cacheNama.clear();
    inFlightNama.clear();
    stateNama = null;
    clearMapNama();
    return true;
  }

  function gambar(grup) {
    clearMap();
    if (!grupnyaAda({ grup: grup }) || !window.L || !window.map) return false;
    var items = grup.map(function (g) {
      return {
        nama: 'NIB ' + g.nib,
        geom: g,
        layer: window.L.geoJSON(g.geometry, {
          style: g.ganjil
            ? { color: '#dc2626', weight: 2, dashArray: '5,4', fillColor: '#dc2626', fillOpacity: 0.12 }
            : { color: '#0e7490', weight: 2, fillColor: '#22d3ee', fillOpacity: 0.25 }
        })
      };
    });
    mapLayer = window.L.featureGroup(items.map(function (it) { return it.layer; })).addTo(window.map);
    return true;
  }

  function zoomKe(grup) {
    var u = unionBbox(grup || []);
    if (!u || !window.map || !window.L) return false;
    window.map.fitBounds(
      window.L.latLngBounds([[u.miny, u.minx], [u.maxy, u.maxx]]).pad(0.15),
      { maxZoom: 18 }
    );
    return true;
  }

  function drawOnMap(opts) {
    if (!state) return false;
    var o = opts || {};
    if (!gambar(state.grup)) return false;
    if (o.flyTo !== false) zoomKe(state.grup);
    return true;
  }

  function reset() {
    token++;
    cache.clear();
    inFlight.clear();
    state = null;
    clearMap();
    return true;
  }

  function statusHtml(hasil) {
    var g = hasil.grup;
    var nG = g.length;
    var nIzin = 0;
    var nGanjil = 0;
    var nKode = 0;
    var nTerjemah = 0;
    for (var i = 0; i < g.length; i++) {
      nIzin += g[i].izin.length;
      if (g[i].ganjil) nGanjil++;
      for (var j = 0; j < g[i].izin.length; j++) {
        var p = g[i].izin[j] || {};
        if (p.kbli_kode) {
          nKode++;
          if (p.kbli_judul) nTerjemah++;
        }
      }
    }

    var bagian = [];
    bagian.push('<div class="geotani-sls-desc">NIB <b>' + esc(hasil.nib) + '</b> menemukan <b>' +
      nomor(nG) + ' bidang</b> dengan <b>' + nomor(nIzin) + ' izin</b>.</div>');

    /* Layer yang gagal dan izin yang hanya ada di satu layer keduanya
       dilaporkan, bukan dibiarkan hilang. Hasil parsial yang jujur lebih
       berguna daripada pesan "tidak ditemukan" yang menyesatkan. */
    var catatan = [];
    if (hasil.nHanyaBerusaha) {
      catatan.push(nomor(hasil.nHanyaBerusaha) +
        ' izin ditemukan pada sumber kedua, tetapi belum tercatat pada sumber utama');
    }
    if (hasil.gagalOss) catatan.push('sebagian data izin gagal dimuat, hasil bisa tidak lengkap');
    if (hasil.gagalBerusaha) catatan.push('sebagian nama usaha gagal dimuat, ada yang mungkin tidak tampil');
    if (catatan.length) {
      bagian.push('<div class="geotani-kkpr-warn">' + esc(catatan.join('. ') + '.') + '</div>');
    }

    if (nKode && nTerjemah < nKode) {
      bagian.push('<div class="geotani-sls-desc">Dari <b>' + nomor(nKode) + '</b> kode KBLI pada izin ini, ' +
        '<b>' + nomor(nTerjemah) + '</b> punya judul di KBLI 2020. Sisanya ditampilkan sebagai kode saja, ' +
        'tanpa ditebak.</div>');
    }

    if (nG > 1) {
      bagian.push('<div class="geotani-kkpr-warn">Data ATR/BPN tidak konsisten: NIB ini punya ' +
        nomor(nG) + ' geometri yang berbeda. Satu NIB seharusnya menunjuk satu bidang. ' +
        'Semuanya digambar apa adanya; tidak ada yang dipilih atau disembunyikan.</div>');
    }
    if (nGanjil) {
      bagian.push('<div class="geotani-kkpr-warn">' + nomor(nGanjil) +
        ' geometra berukuran tidak wajar (> 5 km) dan ditandai garis putus-putus merah.</div>');
    }
    return bagian.join('');
  }

  /* Parameter opsional supaya bisa dipanggil dengan hasil tertentu, sama
     seperti statusHtml(hasil). Tanpa itu tabel hanya bisa dirender lewat
     klik tombol dan tidak bisa diperiksa terpisah. */
  function listHtml(hasil) {
    var s = hasil || state;
    if (!s) return '';
    var g = s.grup;
    var html = '';
    for (var i = 0; i < g.length; i++) {
      var grp = g[i];
      html += '<div class="geotani-kkpr-grup' + (grp.ganjil ? ' is-ganjil' : '') + '">';
      html += '<div class="geotani-kkpr-grup-head">Bidang ' + (i + 1) +
        ' &middot; ' + nomor(grp.izin.length) + ' izin' +
        (grp.ganjil ? ' &middot; <b>geometri tidak wajar</b>' : '') + '</div>';
      html += '<div class="geotani-kkpr-table-wrap"><table class="geotani-kkpr-table">';
      html += '<thead><tr><th>Nomor Izin</th><th>KBLI</th><th>Nama Usaha</th><th>Jenis</th>'
        + '<th>No. Proyek</th><th>Dibuat</th></tr></thead><tbody>';
      for (var j = 0; j < grp.izin.length; j++) {
        var p = grp.izin[j] || {};
        html += '<tr>';
        html += '<td>' + esc(p.id_izin) + '</td>';
        html += '<td>' + (p.kbli_kode
          ? '<span class="geotani-kkpr-kode">' + esc(p.kbli_kode) + '</span>'
          : '<span class="geotani-kkpr-kosong">-</span>') + '</td>';
        /* Tiga keadaan harus dibedakan, jangan disamakan jadi tanda hubung:
           ada kode dan ada judul, ada kode tapi judulnya tidak ada di
           codebook, dan tidak ada kode sama sekali. */
        html += '<td>' + (p.kbli_judul
          ? esc(p.kbli_judul)
          : (p.kbli_kode
            ? '<span class="geotani-kkpr-kosong">tidak ditemukan di KBLI 2020</span>'
            : '<span class="geotani-kkpr-kosong">-</span>')) + '</td>';
        /* jenis_kkpr ditampilkan mentah. Service ATR/BPN tidak
           mengekspos domain untuk field ini, jadi tidak ada sumber resmi
           yang bisa dipakai untuk mengartikan angka 1/2/3. Menempelkan
           arti karangan akan menyesatkan. */
        html += '<td>' + esc(p.jenis_kkpr) + '</td>';
        html += '<td>' + esc(p.id_proyek) + '</td>';
        html += '<td>' + esc(tanggal(p.created_at)) + '</td>';
        html += '</tr>';
      }
      html += '</tbody></table></div></div>';
    }
html += '<div class="geotani-sls-desc" style="margin-top:10px;font-size:10px;opacity:.75;">' +
      'Sumber data: ATR/BPN. NIB dan nomor izin adalah data permohonan yang dibaca ' +
      'apa adanya dari server ATR/BPN, bukan hasil interpretasi RuangKita.<br>'
      + 'Nama usaha diterjemahkan dari kode KBLI memakai klasifikasi KBLI 2020 ' +
      'dari BPS. Kode yang tidak ditemukan ditampilkan apa adanya, tanpa ditebak.</div>';
    return html;
  }

  function pesanGagal(err) {
    var msg = err && err.message ? err.message : 'tidak diketahui';
    if (err && err.name === 'AbortError') {
      return 'Permintaan ke ATR/BPN melewati batas waktu. Server sedang lambat atau tidak terjangkau.';
    }
    if (/HTTP 499/.test(msg) || /Token/i.test(msg)) {
      return 'ATR/BPN menolak permintaan ini. Data KKPR tidak dapat ditampilkan '
        + 'sampai layanannya kembali normal.';
    }
    if (/Failed to execute query|Unable to complete/i.test(msg)) {
      return 'ATR/BPN menolak query. NIB mungkin tidak ada, atau layanannya sedang bermasalah.';
    }
    if (/CORS|NetworkError|Failed to fetch|Load failed/i.test(msg)) {
      return 'Tidak bisa menghubungi ATR/BPN dari browser. Ini biasanya karena koneksi '
        + 'terputus, atau permintaan diblokir oleh ekstensi browser. Data tidak dapat '
        + 'ditampilkan sampai itu diperbaiki. Coba muat ulang halaman, atau matikan '
        + 'ekstensi yang memblokir permintaan ke layanan peta.';
    }
    return 'Gagal memuat data KKPR dari ATR/BPN (' + esc(msg) + ').';
  }

  function init(root) {
    var host = root || document.getElementById('geotani-kkpr-card');
    if (!host) return null;
    var input = document.getElementById('geotaniKkprSearch');
    var btn = document.getElementById('geotani-kkpr-load');
    var out = document.getElementById('geotani-kkpr-output');
    var status = document.getElementById('geotani-kkpr-status');
    var resetBtn = document.getElementById('geotani-kkpr-reset');
    if (!btn || !out) return null;
    if (btn.__geotaniKkprBound) return api;
    btn.__geotaniKkprBound = true;

    if (resetBtn && !resetBtn.__geotaniKkprResetBound) {
      resetBtn.__geotaniKkprResetBound = true;
      resetBtn.addEventListener('click', function () {
        reset();
        if (input) input.value = '';
        if (status) status.textContent = '';
        out.innerHTML = '';
        if (input) input.focus();
      });
    }

    if (input) {
      /* NIB 13 digit. Format dicek sebelum request supaya kesalahan ketik
         tidak berubah jadi request yang gagal tanpa penjelasan. */
      input.addEventListener('input', function () {
        var v = normalisasiNib(input.value);
        if (v !== input.value) input.value = v;
        if (status) {
          status.textContent = v.length === NIB_PANJANG && !nibValid(v)
            ? 'NIB harus 13 digit angka.'
            : (v.length && v.length < NIB_PANJANG
              ? v.length + '/13 digit'
              : '');
        }
      });
    }

    btn.addEventListener('click', async function () {
      var nib = input ? normalisasiNib(input.value) : '';
      if (!nibValid(nib)) {
        if (status) {
          status.textContent = 'Masukkan NIB lengkap 13 digit angka'
            + (nib ? ' (sekarang ' + nib.length + ' digit).' : ' terlebih dahulu.');
        }
        if (input) input.focus();
        return;
      }

      var myToken = ++token;
      btn.disabled = true;
      if (out) out.innerHTML = '';
      if (status) status.textContent = 'Mengambil data KKPR dari ATR/BPN untuk NIB ' + nib + '...';

      try {
        var hasil = await load(nib);
        // Reset ditekan selagi request berjalan: jangan menulis apa pun.
        if (myToken !== token) return;
        state = hasil;
        if (!grupnyaAda(hasil)) {
          out.innerHTML = '';
          if (status) {
            status.textContent = 'NIB ' + nib
              + ' tidak ditemukan di data izin maupun data luas-area ATR/BPN.';
          }
          return;
        }
        drawOnMap();
        out.innerHTML = statusHtml(hasil) + listHtml();
        if (status) {
          status.textContent = hasil.grup.length + ' bidang, '
            + (function () {
              var n = 0;
              for (var i = 0; i < hasil.grup.length; i++) n += hasil.grup[i].izin.length;
              return n;
            })() + ' izin dimuat.';
        }
      } catch (err) {
        if (myToken !== token) return;
        if (out) out.innerHTML = '';
        if (status) status.textContent = pesanGagal(err);
      } finally {
        if (myToken === token) btn.disabled = false;
      }
    });

    pasangModeNama();
    pasangTab();
    return api;
  }

  /* ── perpindahan tab ──
     Dipisah dari init() utama dengan alasan yang sama seperti mode kedua:
     init() menandai tombol NIB sebagai terpasang, jadi wiring tab yang salah
     tidak boleh ikut menggagalkan mode NIB yang sudah jalan.

     Event delegation di <details>, bukan listener per tombol. Kartunya
     <details> yang mulai terlipat, dan isinya tetap ada di DOM walau
     tidak terlihat -- jadi listener yang dipasang di init() tetap hidup
     tanpa perlu memasang ulang saat kartu dibuka. */
  function pasangTab() {
    var host = document.getElementById('geotani-kkpr-card');
    if (!host || host.__geotaniKkprTabBound) return;
    host.__geotaniKkprTabBound = true;

    var tablist = host.querySelector('.geotani-kkpr-tab');
    if (!tablist) return;

    tablist.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('[data-kkpr-tab]') : null;
      if (!btn) return;
      var kunci = btn.getAttribute('data-kkpr-tab');
      var tabBtn = tablist.querySelectorAll('[data-kkpr-tab]');
      var panel = host.querySelectorAll('[data-kkpr-panel]');
      for (var i = 0; i < tabBtn.length; i++) {
        var aktif = tabBtn[i].getAttribute('data-kkpr-tab') === kunci;
        tabBtn[i].classList.toggle('is-active', aktif);
        tabBtn[i].setAttribute('aria-selected', aktif ? 'true' : 'false');
      }
      for (var j = 0; j < panel.length; j++) {
        var p = panel[j].getAttribute('data-kkpr-panel') === kunci;
        panel[j].classList.toggle('is-active', p);
        panel[j].hidden = !p;
        panel[j].setAttribute('aria-hidden', p ? 'false' : 'true');
      }
      /* Pindah tab TIDAK menghapus hasil mode yang ditinggalkan. Dua mode
         membaca layer berbeda dan punya request sendiri;<?, memuat ulang
         satu mode karena yang lain sedang dilihat akan membuang cache yang
         baru dibangun. "Reset Polygon" masing-masing yang membersihkan. */
    });
  }

  /* ── mode kedua: sambungkan tombol dan dropdown ──
     Dipisah dari init() supaya mode NIB tidak ikut gagal kalau ada yang
     salah di wiring mode kedua: init() sudah menandai tombol NIB sebagai
     terpasang, jadi ketidaksesuaian kedua mode tidak saling menimpa. */
  function pasangModeNama() {
    var input = document.getElementById('geotaniKkprNamaSearch');
    var prov = document.getElementById('geotaniKkprNamaProvinsi');
    var btn = document.getElementById('geotani-kkpr-nama-load');
    var out = document.getElementById('geotani-kkpr-nama-output');
    var status = document.getElementById('geotani-kkpr-nama-status');
    var resetBtn = document.getElementById('geotani-kkpr-nama-reset');
    if (!btn || !out) return;
    if (btn.__geotaniKkprNamaBound) return;
    btn.__geotaniKkprNamaBound = true;

    if (resetBtn && !resetBtn.__geotaniKkprNamaResetBound) {
      resetBtn.__geotaniKkprNamaResetBound = true;
      resetBtn.addEventListener('click', function () {
        resetNama();
        if (input) input.value = '';
        if (status) status.textContent = '';
        out.innerHTML = '';
        if (input) input.focus();
      });
    }

    /* Daftar provinsi diambil sekali, saat select pertama kali dibuka --
       bukan saat halaman dimuat. 19 request HTTP untuk mengisi dropdown
       tidak layak dibayar oleh setiap pengunjung yang hanya mau mencari NIB. */
    if (prov && !prov.__geotaniKkprProvBound) {
      prov.__geotaniKkprProvBound = true;
      prov.addEventListener('focus', function () { isiProvinsi(prov, status); });
      prov.addEventListener('click', function () { isiProvinsi(prov, status); });
    }

    btn.addEventListener('click', async function () {
      var nama = input ? bersihNama(input.value) : '';
      var provinsi = prov && prov.value ? prov.value : '';
      if (!nama && !provinsi) {
        if (status) status.textContent = 'Isi nama usaha atau pilih provinsi lebih dulu.';
        if (input) input.focus();
        return;
      }

      var myToken = ++tokenNama;
      btn.disabled = true;
      if (out) out.innerHTML = '';
      if (status) status.textContent = 'Mencari bidang KKPR di ATR/BPN...';

      try {
        var hasil = await loadNama({ nama: nama, provinsi: provinsi });
        if (myToken !== tokenNama) return;
        stateNama = hasil;
        if (!hasil.grup.length) {
          out.innerHTML = '';
          if (status) {
            status.textContent = 'Tidak ada bidang di data ATR/BPN yang cocok dengan filter itu. '
              + 'Coba nama yang lebih pendek atau tanpa provinsi.';
          }
          return;
        }
        drawOnMapNama();
        out.innerHTML = listNamaHtml(hasil);
        if (status) status.textContent = hasil.grup.length + ' bidang dimuat.';
      } catch (err) {
        if (myToken !== tokenNama) return;
        if (out) out.innerHTML = '';
        if (status) status.textContent = pesanGagal(err);
      } finally {
        if (myToken === tokenNama) btn.disabled = false;
      }
    });
  }

  var provinsiMuat = null;
  async function isiProvinsi(sel, status) {
    if (!sel || sel.__geotaniKkprProvTerisi) return;
    if (provinsiMuat) { await provinsiMuat; return; }
    if (status) status.textContent = 'Mengambil daftar provinsi dari ATR/BPN...';
    provinsiMuat = daftarProvinsi().then(function (list) {
      sel.__geotaniKkprProvTerisi = true;
      var html = '<option value="">Semua provinsi</option>';
      for (var i = 0; i < list.length; i++) {
        html += '<option value="' + esc(list[i]) + '">' + esc(list[i]) + '</option>';
      }
      sel.innerHTML = html;
      if (status && status.textContent.indexOf('Mengambil daftar provinsi') === 0) status.textContent = '';
    }).catch(function () {
      /* Dropdown yang gagal diisi bukan alasan mematikan panel. Nama usaha
         saja masih bisa dicari; hanya filter provinsi yang tidak tersedia,
         dan itu disebut di baris status supaya tidak disalahpikan
         sebagai "tidak ada provinsi". */
      sel.innerHTML = '<option value="">Semua provinsi</option>';
      if (status) {
        status.textContent = 'Daftar provinsi tidak dapat dimuat. Pencarian nama usaha tetap bisa dipakai.';
      }
      provinsiMuat = null;
    });
    await provinsiMuat;
  }

  var api = {
    init: init,
    load: load,
    reset: reset,
    drawOnMap: drawOnMap,
    clearMap: clearMap,
    listHtml: listHtml,
    grupkan: grupkan,
    gabung: gabung,
    kbliKode: kbliKode,
    muatKodebook: muatKodebook,
    pesanGagal: pesanGagal,
    normalisasiNib: normalisasiNib,
    nibValid: nibValid,
    buildUrl: buildUrl,
    NIB_PANJANG: NIB_PANJANG,
    getState: function () { return state; },

    /* mode kedua */
    LAYER_NAMA: LAYER_NAMA,
    FIELDS_NAMA: FIELDS_NAMA,
    BATAS_NAMA: BATAS_NAMA,
    parseLuas: parseLuas,
    parseRupiah: parseRupiah,
    formatRupiah: formatRupiah,
    tanggalMs: tanggalMs,
    bersihNama: bersihNama,
    bersihkanNama: bersihkan,
    bersihkan: bersihkan,
    kutipSql: kutipSql,
    whereNama: whereNama,
    WILDCARD: WILDCARD,
    grupkanNama: grupkanNama,
    keGeoJson: keGeoJson,
    queryNama: queryNama,
    loadNama: loadNama,
    lookupNibUntuk: lookupNibUntuk,
    isiNibUntuk: isiNibUntuk,
    daftarProvinsi: daftarProvinsi,
    isiProvinsi: isiProvinsi,
    listNamaHtml: listNamaHtml,
    popupNama: popupNama,
    buildUrlNama: buildUrlNama,
    drawOnMapNama: drawOnMapNama,
    clearMapNama: clearMapNama,
    resetNama: resetNama,
    getStateNama: function () { return stateNama; }
  };
  window.GeoTaniKkpr = api;

  if (typeof document !== 'undefined') {
    var boot = function () { if (!init()) setTimeout(boot, 300); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();
