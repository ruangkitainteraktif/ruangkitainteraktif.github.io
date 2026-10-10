/* Alat Cek Lokasi: dari koordinat ke nama wilayah.
   Hanya baca. Satu endpoint GISTARU untuk seluruh tingkat wilayah, lihat
   .opencode/plans/geolokasi-cek-lokasi.md untuk risetnya. */
(function () {
  'use strict';

  var PROXY = 'https://gistaru.atrbpn.go.id/tres/proxy.ashx?';
  var DASAR = 'https://gistaru.atrbpn.go.id/arcgis/rest/services/';
  var LAYER = DASAR + 'BATAS_ADMINISTRASI/Admin_Kecamatan/MapServer/0/query';

  /* Desa/kelurahan TIDAK bisa dibaca dari GISTARU: field wadmkd di sana
     bernilai satu spasi, bukan kosong. Untuk desa dipakai BIG RBI
     BATAS_DESAKEL_AR, endpoint yang sama dengan yang dipakai
     geoid-wilayah.js untuk drill-down desa (84.503 desa, field WADMKD).

     Sengaja TIDAK lewat tres/proxy.ashx: proxy itu milik GISTARU dan
     hanya berlaku untuk host GISTARU. Host BIG ini mengirim CORS dan
     repo ini mengambilnya langsung di belasan tempat lain. */
  var BIG_DESA = 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH'
    + '/BATAS_DESAKEL_AR/MapServer/0/query';
  /* Batas waktu wajib. Diuji September 2026: host ini menyelesaikan TLS
     lalu tidak pernah membalas (4 percobaan, timeout 25-45 detik).
     Tanpa batas waktu, satu klik "Cek Lokasi" menggantung lama. */
  var BIG_TIMEOUT_MS = 8000;

  /* Tiga tingkat pertama dari GISTARU. Desa TIDAK termasuk di sini: field
     wadmkd di layer itu bernilai satu spasi, bukan kosong, jadi nilainya
     harus dibuang -- kalau tidak, UI menampilkan "Desa:  " dan terlihat
     seperti bug. Desa diambil terpisah dari BIG, lihat cariDesa().

     Field desa sengaja TIDAK didefinisikan di sini, supaya tidak ada jalan
     yang membacanya lagi tanpa sengaja. */
  var PETA_WILAYAH = {
    kecamatan: { f: 'wadmkc', l: 'Kecamatan' },
    kabupaten: { f: 'wadmkk', l: 'Kabupaten / kota' },
    provinsi: { f: 'wadmpr', l: 'Provinsi' }
  };
  var LABEL_DESA = 'Desa / kelurahan';

  /* Nilai yang dianggap tidak ada: null, undefined, kosong, atau cuma
     whitespace. Data GISTARU punya " " (satu spasi) di beberapa field,
     jadi trimming saja tidak cukup -- harus dicek hasilnya kosong. */
  function bersih(v) {
    if (v == null) return null;
    var s = String(v).trim();
    if (!s) return null;
     /* Toleran terhadap nilai yang tampak terisi tapi sebenarnya bukan:
       "NULL" dalam huruf besar, atau "-". */
    if (/^(null|nil|tbd|tba|-|n\/a)$/i.test(s)) return null;
    return s;
  }

  /* Susun objek wilayah dari atribut mentah. Mengembalikan null kalau
     tidak ada satu pun tingkat yang terisi -- itu lebih berguna daripada
     objek berisi tiga null, karena pemanggil bisa membedakan "tidak ada
     data" dari "data ada tapi satu-duanya kosong".

     Hanya tiga tingkat, semua dari GISTARU. Desa ditambahkan terpisah
     oleh cek() dari BIG, karena GISTARU tidak memfasenya. */
  function normalisasiWilayah(p) {
    p = p || {};
    var out = {};
    var ada = 0;
    var kunci = ['kecamatan', 'kabupaten', 'provinsi'];
    for (var i = 0; i < kunci.length; i++) {
      var k = kunci[i];
      var v = bersih(p[PETA_WILAYAH[k].f]);
      if (v != null) { out[k] = v; ada++; }
    }
    /* namobj sering sama dengan wadmkc, tapi tidak selalu. Simpan
       terpisah supaya pemanggil bisa jatuh ke namobj kalau wadmkc kosong
       dan tidak vice versa. */
    var nam = bersih(p.namobj);
    if (nam != null) out.namaObjek = nam;
    if (!ada) return null;
    out.lengkap = ada === kunci.length;
    return out;
  }

  /* ── koordinat ─────────────────────────────────────────────────────────
     Input orang sangat sering tertukar urutan, dan dari teks saja tidak
     selalu bisa diketahui mana yang mana. Aturannya:

     1. Dua angka, dipisah spasi atau koma. Koma boleh jadi tanda desimal
        ("-7,47 112,65") -- kebiasaan Indonesia -- atau pemisah. Dua bentuk
        ini ambigu kalau keduanya memakai koma, jadi ikut dicoba.
     2. Kalau hanya satu yang masuk rentang, dianggap tertukar, dan hanya
        dibalik kalau hasil baliknya jadi valid. Titik sah di luar
        Indonesia tidak boleh ditolak.
     3. Kalau hanya satu yang valid dan pembalikannya tetap tidak valid,
        dibiarkan error dengan menyebut urutan. Menerima tanpa memberi
        tahu akan menampilkan lokasi yang salah di peta. */

  var BATAS_LAT = 90;
  /* Bujur Indonesia Timur melewati 180, jadi batasnya 141. */
  var BATAS_LNG_INDO = 141;

  /* Teks satu bagian. Koma dianggap tanda desimal kalau ada tepat satu
     koma dan bukan ada karakter pemisah lain -- itu yang membedakan
     "-7,47" dari "7, 47". */
  function keAngka(s) {
    var t = String(s == null ? '' : s).trim();
    if (!t) return null;
    if (t.indexOf(',') >= 0) t = t.replace(',', '.');
    var n = parseFloat(t);
    return isFinite(n) ? n : null;
  }

  /* Kandidat pembagian teks menjadi dua bagian angka, urut dari paling
     mungkin sampai paling mungkin keliru.

     Urutan ini penting, bukan asal dicoba. "-7,47 112,65" punya koma di
     dalam masing-masing angka, jadi memisahkan dengan koma lebih dulu
     menghasilkan "-7.47 112.65" -- benar dua bagian, tapi bagian kedua
     belum dibaca sebagai desimal sehingga angkanya keliru. Karena itu
     koma sebagai tanda desimal dicoba lebih dulu kalau ada dua koma
     yang masing-masing mengapit satu angka. */
  function kandidatBagian(s) {
    var out = [];

    /* Bentuk Indonesia: "‑7,47 112,65" -- dua koma, masing-masing di dalam
       satu angka. Koma harus dipakai sebagai tanda desimal. */
    var pemisahSpasi = s.split(/[\s;]+/).filter(function (x) { return x.length; });
    if (pemisahSpasi.length === 2 && (s.match(/,/g) || []).length === 2) {
      out.push(pemisahSpasi);
    }

    /* Bentuk umum: spasi, koma, atau titik koma sebagai pemisah. */
    var pemisahUmum = s.split(/[\s,;]+/).filter(function (x) { return x.length; });
    if (pemisahUmum.length === 2) out.push(pemisahUmum);

    /* Satu blok tanpa spasi tapi ada koma: "-7,47" -> dua bagian. */
    if (pemisahUmum.length === 1) {
      var bagianKoma = s.split(',').map(function (x) { return x.trim(); })
        .filter(function (x) { return x.length; });
      if (bagianKoma.length === 2) out.push(bagianKoma);
    }
    return out;
  }

  /* Dua bagian pertama yang keduanya bisa jadi angka. Mengembalikan null
     kalau tidak ada yang cocok. */
  function duaBagian(s) {
    var kandidat = kandidatBagian(s);
    for (var i = 0; i < kandidat.length; i++) {
      if (keAngka(kandidat[i][0]) != null && keAngka(kandidat[i][1]) != null) {
        return kandidat[i];
      }
    }
    return null;
  }

  /* Dua batas yang diterima, dalam urutan mana pun. Mengembalikan
     {lat, lng} kalau plausible, atau null kalau tidak. */
  function pasanganValid(a, b) {
    var lat = function (n) { return n >= -BATAS_LAT && n <= BATAS_LAT; };
    var lng = function (n) { return n >= -BATAS_LNG_INDO && n <= BATAS_LNG_INDO; };
    if (lat(a) && lng(b)) return { lat: a, lng: b, ditukar: false };
    if (lng(a) && lat(b)) return { lat: b, lng: a, ditukar: true };
    return null;
  }

  function parseKoordinat(teks) {
    var s = String(teks == null ? '' : teks).trim();
    if (!s) return { ok: false, alasan: 'Koordinat masih kosong.' };

    var bagian = duaBagian(s);
    if (!bagian) {
      /* Bedakan "terlalu banyak" dari "kurang", karena sarannya berbeda. */
      var potong = s.split(/[\s;]+/).filter(function (x) { return x.length; });
      if (potong.length > 2) {
        return { ok: false, alasan: 'Terlalu banyak angka. Masukkan tepat dua: latitude dan longitude.' };
      }
      return {
        ok: false,
        alasan: 'Masukkan dua angka: latitude lalu longitude, dipisah spasi atau koma.',
        contoh: '-7.470000, 112.650000'
      };
    }

    var a = keAngka(bagian[0]);
    var b = keAngka(bagian[1]);
    if (a == null || b == null) {
      return { ok: false, alasan: 'Ada karakter yang bukan angka.' };
    }

    var pasangan = pasanganValid(a, b);
    if (pasangan) {
      if (!pasangan.ditukar) return { ok: true, lat: pasangan.lat, lng: pasangan.lng };
      return {
        ok: true, lat: pasangan.lat, lng: pasangan.lng, ditukar: true,
        catatan: 'Urutan koordinat dibalik otomatis jadi latitude, longitude.'
      };
    }

    /* Tidak ada pasangan valid dalam urutan mana pun. Kalau SETENGAH-nya
       masuk rentang, masalahnya jelas urutan, dan sarannya menyebutnya. */
    var lat = function (n) { return n >= -BATAS_LAT && n <= BATAS_LAT; };
    var lng = function (n) { return n >= -BATAS_LNG_INDO && n <= BATAS_LNG_INDO; };
    if (lat(a) || lng(b)) {
      return {
        ok: false, ditukar: true,
        alasan: 'Angka pertama terbaca latitude, tapi angka kedua bukan longitude yang sah.',
        saran: 'Coba tulis dibalik: ' + bagian[1] + ', ' + bagian[0]
      };
    }
    if (lat(b) || lng(a)) {
      return {
        ok: false, ditukar: true,
        alasan: 'Angka kedua terbaca latitude, tapi angka pertama bukan longitude yang sah.',
        saran: 'Coba tulis dibalik: ' + bagian[1] + ', ' + bagian[0]
      };
    }
    return {
      ok: false,
      alasan: 'Di luar rentang yang sah. Latitude harus ' +
        (-BATAS_LAT) + ' sampai ' + BATAS_LAT + ', longitude ' +
        (-BATAS_LNG_INDO) + ' sampai ' + BATAS_LNG_INDO + '.'
    };
  }

  /* Sudut dari khatulistiwa, untuk ditampilkan apa adanya. Angka ini
     pasti benar, jadi lebih berguna daripada "arah mata angin", yang
     tidak bisa ditentukan dari satu koordinat saja -- arah timur dan barat
     bergantung posisi relatif terhadap titik acuan, dan kita tidak punya
     titik acuan pengguna. Menebak arah akan memberi angka yang terlihat
     meyakinkan tapi salah, jadi tidak ditampilkan sama sekali. */
  function sudutDMS(lat, lng) {
    var bagian = function (n, positive, negative) {
      if (n == null || !isFinite(n)) return null;
      var p = Math.abs(Number(n));
      var d = Math.floor(p);
      var mFloat = (p - d) * 60;
      var m = Math.floor(mFloat);
      var s = (mFloat - m) * 60;
      return (n < 0 ? negative : positive) + ' ' + d + '\u00b0 '
        + m + '\' ' + s.toFixed(2) + '\"';
    };
    var a = bagian(lat, 'LU', 'LS');
    var b = bagian(lng, 'BT', 'BB');
    if (!a || !b) return null;
    return a + ' ' + b;
  }

  /* 6 desimal, ~0,1 m di khatulistiwa. Satu format di seluruh halaman. */
  function teksKoordinat(lat, lng) {
    if (lat == null || lng == null) return '';
    return Number(lat).toFixed(6) + ', ' + Number(lng).toFixed(6);
  }

  function cacheKey(lat, lng) {
    return Number(lat).toFixed(4) + '|' + Number(lng).toFixed(4);
  }
  var cache = new Map();
  /* Cache terpisah dari cache GISTARU. Kalau keduanya berbagi satu Map,
     satu kunci bisa tertimpa hasil dari sumber yang salah, dan baris Desa
     bisa menampilkan nama kecamatan. */
  var cacheDesa = new Map();

  /* NAMOBJ hanya dipakai sebagai cadangan kalau WADMKD kosong. Karena
     NAMOBJ itu nama objek GENERIK, isinya belum tentu nama desa --
     bisa berupa nama lahan atau objek lain kalau layer yang terpakai
     ternyata bukan layer desa. Karena itu nilai yang terlalu pendek
     ditolak: nama desa Indonesia terpendek pun beberapa huruf, dan
     karakter tunggal hampir pasti bukan desa. */
  function namaDesa(v) {
    if (v == null) return null;
    var s = String(v).trim();
    if (s.length < 3) return null;
    return s;
  }

  /* ── desa / kelurahan (BIG RBI) ───────────────────────────────────────
     Keempat kondisi hasil dibedakan, karena empat hal berbeda terjadi di
     belakang layar dan empat jawaban berbeda yang jujur:

       ada    - titik ini di dalam satu batas desa
       tidak  - host hidup, layer dibaca, tapi titik ini tidak di dalam
                batas desa mana pun (misalnya di laut atau batas luar negeri)
       gagal  - host tidak menjawab / menolak / mengembalikan error
       belum  - modul tidak di-hosting di lingkungan yang bisa memanggil BIG

     "tidak" dan "gagal" WAJIB dibedakan. Kalau host mati lalu UI menulis
     "tidak ada batas desa di titik ini", pengguna menyimpulkan lokasi itu
     memang tidak berada di desa -- padahal batas desanya ada, hanya tidak
     sempat dibaca.

     Bentuk hasil dibuat inline di tiap cabang, bukan lewat konstanta
     bersama: tiap cabang butuh field berbeda (pesan hanya ada di 'gagal'),
     dan konstanta bersama yang bisa berubah tanpa disalin justru rawan
     dipakai ulang tanpa disalin. */
  function cariDesa(lat, lng) {
    var key = cacheKey(lat, lng);
    if (cacheDesa.has(key)) return Promise.resolve(cacheDesa.get(key));

    var geo = JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } });
    var q = 'geometry=' + encodeURIComponent(geo)
      + '&geometryType=esriGeometryPoint&inSR=4326'
      + '&spatialRel=esriSpatialRelIntersects'
      + '&outFields=NAMOBJ%2CWADMKD'
      + '&returnGeometry=false'
      /* resultRecordCount=2: cukup untuk melihat kasus titik yang jatuh
         tepat di batas dua desa, tanpa menarik semua fitur yang cocok. */
      + '&resultRecordCount=2&f=json';

    /* Timeout wajib. Diuji September 2026: geoservices.big.go.id
       menyelesaikan TLS lalu tidak pernah membalas (4 percobaan, timeout
       25-45 detik). Tanpa batas waktu, satu klik "Cek Lokasi" menggantung
       tanpa memberi tahu apa pun -- dan yang menggantung adalah baris
       paling bawah, bukan seluruh tabel. */
    var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, BIG_TIMEOUT_MS) : null;

    var opts = { method: 'POST', body: q };
    if (ctrl) opts.signal = ctrl.signal;

    var berhentiTimer = function () { if (timer) clearTimeout(timer); };

    return fetch(BIG_DESA, opts).then(function (r) {
      berhentiTimer();
      if (!r.ok) throw new Error('HTTP ' + r.status);
      /* Dibaca sebagai teks dulu, bukan r.json(). Server BIG kadang
         membalas halaman HTML -- halaman pemeliharaan atau blokir WAF --
         dengan status 200. r.json() di situ melempar SyntaxError yang
         teksnya bocor ke layar sebagai "Unexpected token '<'", dan itu
         tidak berguna bagi siapa pun. Bentuk respons diperiksa di sini
         supaya pesannya menyebut penyebab yang bisa ditindaklanjuti, bukan
         potongan isi halaman. */
      /* Fallback ke r.json() kalau r.text tidak ada -- beberapa polyfill
         fetch lama tidak menyediakannya, dan memanggil yang tidak ada akan
         melempar "r.text is not a function" yang kemudian dilaporkan
         sebagai "tidak dapat menghubungi server BIG". Itu salah: server
         sudah menjawab, hanya objek responsnya tidak lengkap. */
      if (typeof r.text !== 'function') return r.json();
      return r.text().then(function (teks) {
        var awal = String(teks == null ? '' : teks).replace(/^\s+/, '').slice(0, 1);
        if (awal !== '{' && awal !== '[') {
          throw new Error('Server BIG membalas halaman web, bukan data wilayah');
        }
        try {
          return JSON.parse(teks);
        } catch (e) {
          throw new Error('Respons server tidak dapat dibaca');
        }
      });
    }).then(function (j) {
      if (j && j.error) throw new Error(j.error.message || 'BIG menolak permintaan');
      var fitur = (j && j.features) || [];
      /* Reply 200 dengan features kosong berarti host hidup dan layer dibaca,
         tapi titik ini tidak di dalam batas desa mana pun. Itu BERBEDA dari
         host mati, dan tidak boleh ditampilkan dengan pesan yang sama. */
      if (!fitur.length) return { status: 'tidak', nama: null, jumlah: 0 };

      /* WADMKD dibaca lebih dulu: itu field yang menandai desa, sedangkan
         NAMOBJ adalah nama objek generik. Urutan ini penting kalau layer
         yang terpakai ternyata bukan layer desa. */
      var a = fitur[0].attributes || {};
      var nama = bersih(a.WADMKD) || namaDesa(bersih(a.NAMOBJ));
      /* Fitur yang ada tapi tanpa nama yang masuk akal diperlakukan sama
         dengan tidak ada: menampilkan baris kosong lebih membingungkan. */
      if (!nama) return { status: 'tidak', nama: null, jumlah: fitur.length };
      return { status: 'ada', nama: nama, jumlah: fitur.length, multi: fitur.length > 1 };
    }).catch(function (e) {
      berhentiTimer();
      if (typeof window.fetchVillageBoundaryFallback === 'function') {
        return window.fetchVillageBoundaryFallback({
          where: '1=1', geometry: geo, geometryType: 'esriGeometryPoint', inSR: '4326',
          spatialRel: 'esriSpatialRelIntersects', outFields: '*', returnGeometry: 'false',
          resultRecordCount: '2', timeoutMs: BIG_TIMEOUT_MS
        }).then(function (fallback) {
          var features = fallback && fallback.features || [];
          if (!features.length) return { status: 'tidak', nama: null, jumlah: 0 };
          var attributes = features[0].attributes || {};
          var name = bersih(attributes.WADMKD) || namaDesa(bersih(attributes.NAMA_KEL)) || namaDesa(bersih(attributes.NAMOBJ));
          return name ? { status: 'ada', nama: name, jumlah: features.length, multi: features.length > 1 }
            : { status: 'tidak', nama: null, jumlah: features.length };
        }).catch(function () {
          var pesan = e && e.name === 'AbortError' ? 'Layanan BIG tidak merespons' : ((e && e.message) || 'Tidak dapat menghubungi layanan BIG');
          return { status: 'gagal', nama: null, pesan: pesan, jumlah: 0 };
        });
      }
      var pesan = e && e.name === 'AbortError'
        ? 'Server BIG tidak merespons'
        : ((e && e.message) || 'Tidak dapat menghubungi server BIG');
      return { status: 'gagal', nama: null, pesan: pesan, jumlah: 0 };
    }).then(function (hasil) {
      cacheDesa.set(key, hasil);
      return hasil;
    });
  }

  /* Satu request per titik. Errornya dibedakan dari "tidak ada wilayah",
     karena keduanya tampil berbeda dan artinya berbeda: satu soal jaringan,
     satu soal lokasi. */
  function cariWilayah(lat, lng) {
    var key = cacheKey(lat, lng);
    if (cache.has(key)) return Promise.resolve(cache.get(key));

    var geo = JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } });
    var q = 'geometry=' + encodeURIComponent(geo)
      + '&geometryType=esriGeometryPoint&inSR=4326'
      + '&spatialRel=esriSpatialRelIntersects'
      + '&outFields=namobj%2Cwadmkd%2Cwadmkc%2Cwadmkk%2Cwadmpr'
      + '&returnGeometry=false&f=json';

    return fetch(PROXY + LAYER + '?' + q).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      if (j && j.error) throw new Error(j.error.message || 'ATRBPN menolak permintaan');
      var fitur = (j && j.features) || [];
      /*.features kosong berarti titik ini di luar wilayah Indonesia. Status
         tetap 200, jadi ini BUKAN error jaringan. */
      if (!fitur.length) {
        return { kosong: true, wilayah: null, jumlah: 0 };
      }
      var w = normalisasiWilayah(fitur[0].attributes);
      return {
        kosong: false,
        wilayah: w,
        jumlah: fitur.length,
        /* Layer ini supportsAdvancedQueries: false, jadi tidak bisa DISTINCT.
           Kalau titik jatuh tepat di batas dua kecamatan, server mengembalikan
           keduanya, dan yang pertama dipakai. Ini harus disebut. */
        multi: fitur.length > 1
      };
    }).catch(function (e) {
      /* Jaringan gagal atau server menolak. Dicatat sebagai `jaringan` supaya
         UI bisa membedakan dari "tidak ada wilayah". */
      return {
        kosong: false, jaringan: true,
        pesan: (e && e.message) || 'Tidak dapat menghubungi server',
        wilayah: null, jumlah: 0
      };
    }).then(function (hasil) {
      cache.set(key, hasil);
      return hasil;
    });
  }

  /* ── antarmuka ─────────────────────────────────────────────────────── */

  var el = {};
  /* Layer pin milik modul ini. Pin dibuat sendiri, bukan lewat alat
     gambar, supaya menekan Cek selalu langsung menunjukkan titiknya di
     peta dan tombol Reset bisa membersihkannya tanpa menghapus polygon
     atau garis milik alat Gambar & Ukur. Pola layerGroup per modul juga
     dipakai alat-konverter-koordinat.js. */
  var lokasiLayer = null;

  function esc(v) {
    if (v == null) return '-';
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  /* Clipboard API butuh HTTPS atau localhost. Situs ini sering dibuka dari
     file://, jadi harus ada fallback; tanpa itu tombol Salin diam-diam
     gagal. Pola yang sama sudah dipakai polygon-analysis.js. */
  function salin(teks, tombol) {
    if (!teks) return Promise.resolve(false);
    var done = function (ok, pesan) {
      if (!tombol) return;
      var lama = tombol.dataset.lamaTeks || tombol.textContent;
      tombol.dataset.lamaTeks = lama;
      tombol.textContent = ok ? 'Tersalin' : (pesan || 'Gagal');
      setTimeout(function () { tombol.textContent = lama; }, 1400);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(teks).then(function () {
        done(true); return true;
      }).catch(function () { return fallbackSalin(teks, done); });
    }
    return fallbackSalin(teks, done);
  }

  function fallbackSalin(teks, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = teks;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      done(ok, ok ? null : 'Gagal');
      return Promise.resolve(ok);
    } catch (e) {
      done(false, 'Gagal');
      return Promise.resolve(false);
    }
  }

  function tampilkanPesan(html) {
    if (el.out) el.out.innerHTML = html;
  }

  /* Baris Desa. Empat kondisi, empat kalimat berbeda.

     Yang paling penting: status 'gagal' (server BIG tidak merespons) dan
     'tidak' (titik ini memang di luar batas desa) TIDAK boleh memakai
     kalimat yang sama. "Tidak ada batas desa" saat server-nya mati
     menyuruh pengguna menyimpulkan sesuatu yang belum diketahui.

     Sumbernya disebut karena tiga baris di atasnya dari ATR/BPN GISTARU
     dan baris ini dari BIG. Tanpa catatan, pengguna mengira satu sumber.

     Untuk status 'gagal' TIDAK ada baris penjelasan tambahan. Versi
     pertama menuliskannya, dan yang tampil di layar adalah kalimat teknik
     mentah dari parser -- "Unexpected token '<'" beserta potongan awal
     halaman HTML. Itu membingungkan, tidak bisa ditindaklanjuti, dan
     membuat UI terlihat rusak. Row ini sudah menyatakan "belum dapat
     diperiksa (BIG)", dan itu sudah cukup. */
  function desaHtml(d) {
    if (!d) {
      /* null = BIG belum menjawab. Menunggu, bukan menyatakan tidak ada. */
      return '<span class="geolokasi-kecil">memeriksa batas desa di BIG...</span>';
    }
    if (d.status === 'ada') {
      return '<b>' + esc(d.nama) + '</b> <span class="geolokasi-kecil">(BIG)</span>';
    }
    if (d.status === 'tidak') {
      return '<span class="geolokasi-takada">tidak ada batas desa di titik ini (BIG)</span>';
    }
    if (d.status === 'belum') {
      return '<span class="geolokasi-takada">belum dapat diperiksa (BIG)</span>';
    }
    /* gagal */
    return '<span class="geolokasi-takada">belum dapat diperiksa (BIG)</span>';
  }

  /* Hasil wilayah. `s` adalah hasil cariWilayah() dengan tambahan `s.desa`
     dari cariDesa() -- boleh null kalau BIG belum menjawab. */
  function hasilHtml(s, lat, lng) {
    var h = '<div class="geolokasi-hasil">';
    h += '<div class="geolokasi-koordinat"><b>' + esc(teksKoordinat(lat, lng)) + '</b></div>';

    h += '<table class="geolokasi-tabel"><tbody>';
    h += '<tr><th>' + esc(PETA_WILAYAH.provinsi.l) + '</th><td>' + esc(s.wilayah.provinsi) + '</td></tr>';
    h += '<tr><th>' + esc(PETA_WILAYAH.kabupaten.l) + '</th><td>' + esc(s.wilayah.kabupaten) + '</td></tr>';
    h += '<tr><th>' + esc(PETA_WILAYAH.kecamatan.l) + '</th><td>' + esc(s.wilayah.kecamatan) + '</td></tr>';
    h += '<tr><th>' + esc(LABEL_DESA) + '</th><td>' + desaHtml(s.desa) + '</td></tr>';
    h += '</tbody></table>';

    var dms = sudutDMS(lat, lng);
    if (dms) h += '<div class="geolokasi-kecil">' + esc(dms) + '</div>';

    if (s.multi) {
      h += '<div class="geolokasi-kecil geolokasi-kecil--wajar">'
        + 'Titik ini tepat pada batas wilayah, dan lebih dari satu kecamatan cocok. '
        + 'Yang ditampilkan adalah yang pertama.</div>';
    }
    if (s.desa && s.desa.multi) {
      h += '<div class="geolokasi-kecil geolokasi-kecil--wajar">'
        + 'Titik ini tepat pada batas desa, dan lebih dari satu desa cocok. '
        + 'Yang ditampilkan adalah yang pertama.</div>';
    }
    return h + '</div>';
  }

  /* Naik setiap kali cek() dipanggil. Hasil BIG yang telat datang tidak
     boleh menimpa hasil koordinat yang sudah diganti pengguna -- kalau
     tidak, satu respons BIG yang lambat bisa menimpa hasil yang lebih baru
     dan menampilkan nama desa dari lokasi yang salah. */
  var cekToken = 0;

  function cek() {
    if (!el.out) return;
    var token = ++cekToken;
    var masuk = parseKoordinat(el.input ? el.input.value : '');
    if (!masuk.ok) {
      tampilkanPesan('<div class="geolokasi-galat">' + esc(masuk.alasan)
        + (masuk.saran ? '<br><span class="geolokasi-kecil">Saran: ' + esc(masuk.saran) + '</span>' : '')
        + '</div>');
      return;
    }
    if (masuk.catatan) {
      /* Ditukar otomatis: tampilkan sebagai peringatan, bukan error, karena
         sudah ditafsirkan dan hasilnya benar. */
      tampilkanPesan('<div class="geolokasi-kecil geolokasi-kecil--wajar">'
        + esc(masuk.catatan) + '</div>');
    }
    tampilkanMarker(masuk.lat, masuk.lng);
    if (el.status) el.status.textContent = 'Mencari alamat dengan ArcGIS...';
    if (el.btn) el.btn.disabled = true;
    if (el.salin) el.salin.style.display = 'none';
    var url = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=pjson&featureTypes=&location='
      + encodeURIComponent(masuk.lng + ',' + masuk.lat);
    fetch(url).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).then(function (data) {
      if (token !== cekToken) return;
      if (el.btn) el.btn.disabled = false;
      if (data && data.error) throw new Error(data.error.message || 'ArcGIS menolak permintaan');
      var address = data && data.address;
      if (!address || !(address.Match_addr || address.LongLabel)) {
        tampilkanPesan('<div class="geolokasi-galat">Alamat tidak ditemukan untuk koordinat ini.</div>');
        if (el.status) el.status.textContent = '';
        return;
      }
      var h = '<div class="geolokasi-hasil"><div class="geolokasi-koordinat"><b>' + esc(teksKoordinat(masuk.lat, masuk.lng)) + '</b></div>';
      h += '<table class="geolokasi-tabel"><tbody>';
      h += '<tr><th>Alamat</th><td>' + esc(address.Match_addr || address.LongLabel) + '</td></tr>';
      if (address.City) h += '<tr><th>Kecamatan</th><td>' + esc(address.City) + '</td></tr>';
      if (address.Subregion) h += '<tr><th>Kabupaten / Kota</th><td>' + esc(address.Subregion) + '</td></tr>';
      if (address.Region) h += '<tr><th>Provinsi / wilayah</th><td>' + esc(address.Region) + '</td></tr>';
      if (address.Country) h += '<tr><th>Negara</th><td>' + esc(address.Country) + '</td></tr>';
      h += '</tbody></table></div>';
      tampilkanPesan(h);
      if (el.salin) el.salin.style.display = '';
      if (el.status) el.status.textContent = '';
    }).catch(function (error) {
      if (token !== cekToken) return;
      if (el.btn) el.btn.disabled = false;
      tampilkanPesan('<div class="geolokasi-galat">Tidak dapat mengambil alamat dari ArcGIS.<br>'
        + '<span class="geolokasi-kecil">' + esc((error && error.message) || 'Periksa koneksi lalu coba lagi.') + '</span></div>');
      if (el.status) el.status.textContent = '';
    });
  }

  /* Panel hasil dibersihkan setiap kali koordinat berubah, supaya tidak
     ada angka lama yang terlihat masih berlaku. */
  function kosongkan() {
    tampilkanPesan('');
    if (el.status) el.status.textContent = '';
    if (el.salin) el.salin.style.display = 'none';
  }

  /* Pin hasil Cek, dipasang begitu koordinat terbaca -- tidak menunggu
     ArcGIS, supaya titiknya tetap muncul walau alamat gagal diambil.
     Peta digeser hanya kalau titiknya di luar layar, supaya pemeriksaan
     berulang di sekitar titik yang sama tidak membuat peta melompat. */
  function tampilkanMarker(lat, lng) {
    if (!window.map || !window.L || typeof window.L.marker !== 'function') return;
    var pos = [lat, lng];
    if (!lokasiLayer) lokasiLayer = window.L.layerGroup().addTo(window.map);
    else lokasiLayer.clearLayers();
    window.L.marker(pos, { title: 'Titik cek lokasi', alt: 'Lokasi yang dicek' })
      .bindPopup('<b>' + esc(teksKoordinat(lat, lng)) + '</b>')
      .addTo(lokasiLayer);
    var terlihat = false;
    try { terlihat = window.map.getBounds().contains(pos); } catch (e) { terlihat = false; }
    if (terlihat) return;
    if (typeof window.map.flyTo === 'function') {
      window.map.flyTo(pos, Math.max(window.map.getZoom(), 13), { duration: 0.8 });
    } else {
      window.map.setView(pos, Math.max(window.map.getZoom(), 13));
    }
  }

  function hapusMarker() {
    if (lokasiLayer) lokasiLayer.clearLayers();
  }

  /* Reset: pin di peta, isi input, dan panel hasil dibersihkan sekaligus.
     cekToken ikut dinaikkan supaya respons ArcGIS atau BIG yang masih
     dalam perjalanan tidak mengisi ulang panel sesudah direset, dan tombol
     Cek dinyalakan lagi karena reset bisa terjadi di tengah permintaan. */
  function reset() {
    cekToken++;
    hapusMarker();
    if (el.input) el.input.value = '';
    kosongkan();
    if (el.btn) el.btn.disabled = false;
    if (el.status) el.status.textContent = 'Pin di peta dan hasil dibersihkan.';
  }

  /* Pasang listener draw:created, tepat satu kali.
     Flag pengikatannya disimpan di objek map, BUKAN di elemen DOM, karena
     init() dipanggil berulang kali oleh loop boot -- flag di elemen akan
     membiarkan listener menumpuk. Flag sengaja tidak pernah dihapus:
     kalau dihapus, listener lama menggantung dan tetap dipanggil. */
  function pasangPendengar() {
    if (typeof window.map === 'undefined' || !window.map || !window.L) return;
    if (window.map.__geolokasiBound) return;
    window.map.__geolokasiBound = true;

    window.map.on('draw:created', function (ev) {
      var layer = ev && ev.layer;
      /* Hanya marker asli. Polygon dan garis memakai getLatLngs, tapi
         lingkaran memakai getLatLng persis seperti marker. Tanpa instanceof
         ini, lingkaran yang digambar ikut dianggap pin -- dan setelah pin
         diserahkan ke modul ini, lingkaran pengguna justru ikut terhapus. */
      if (!layer || !window.L || !(layer instanceof window.L.Marker)) return;
      var p = layer.getLatLng();
      /* Serahkan pin ke modul ini: alat gambar hanya dipakai untuk memilih
         titik. Kalau layernya dibiarkan, ada dua pin di titik yang sama dan
         Reset hanya membersihkan salah satunya. */
      if (typeof window.removeDrawLayer === 'function') window.removeDrawLayer(layer);
      /* Isi input lalu cek, supaya koordinat yang ditampilkan sama dengan
         yang ada di pin, dan bisa langsung disalin tanpa diketik ulang. */
      if (el.input) el.input.value = teksKoordinat(p.lat, p.lng);
      kosongkan();
      cek();
    });
  }

  /* Pin: memakai mode marker bawaan alat gambar sekadar untuk memilih
     titik. Pin yang jadi milik panel ini dipasang sendiri oleh cek();
     marker hasil alat gambar dilepas lewat removeDrawLayer() agar tidak
     ada dua pin di titik yang sama. */
  function pasangPin() {
    if (typeof window.startDraw === 'function') {
      pasangPendengar();
      window.startDraw('marker');
      if (el.status) el.status.textContent = 'Klik di peta untuk memasang pin lokasi.';
      return;
    }
    if (el.status) el.status.textContent = 'Alat gambar belum siap. Muat ulang halaman.';
  }

  function init(root) {
    /* Host-nya #dmCekLokasi, di dalam sheet "Gambar & Ukur" (drawSidebar).
       Sebelumnya #alat-tab-lokasi, sebuah subtab GeoData. Boot() mencoba
       ulang tiap 300 ms sampai host ketemu, jadi urutan pemuatan script
       tidak penting. */
    var host = root || document.getElementById('dmCekLokasi');
    if (!host) return null;
    el = {
      host: host,
      input: document.getElementById('geolokasiInput'),
      btn: document.getElementById('geolokasiCek'),
      pin: document.getElementById('geolokasiPin'),
      reset: document.getElementById('geolokasiReset'),
      salin: document.getElementById('geolokasiSalin'),
      out: document.getElementById('geolokasiHasil'),
      status: document.getElementById('geolokasiStatus')
    };
    if (!el.input || !el.out) return null;
    if (el.input.__geolokasiBound) return api;
    el.input.__geolokasiBound = true;

    if (el.btn) el.btn.addEventListener('click', cek);
    if (el.pin) el.pin.addEventListener('click', pasangPin);
    if (el.reset) el.reset.addEventListener('click', reset);
    /* Listener pin dipasang di sini juga, bukan hanya saat tombol diklik:
       GeoOSS dan modul lain bisa memasang pin, dan panel hasil harus ikut
       terisi apa pun siapa yang memulainya. */
    pasangPendengar();
    if (el.input) {
      el.input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); cek(); }
      });
    }
    if (el.salin) {
      el.salin.addEventListener('click', function () {
        /* Salin apa yang terakhir dicek, bukan isi input yang mungkin sudah
           diedit -- supaya yang tersalin selalu yang ditampilkan. */
        var s = parseKoordinat(el.input.value);
        if (!s.ok) { salin('', el.salin); return; }
        salin(teksKoordinat(s.lat, s.lng), el.salin);
      });
    }
    return api;
  }

  var api = {
    init: init,
    parseKoordinat: parseKoordinat,
    normalisasiWilayah: normalisasiWilayah,
    cariWilayah: cariWilayah,
    /* Ekspor dua fungsi ini supaya bisa diuji tanpa DOM, dan supaya
       modul lain (mis. map-click.js) bisa memakai batas desa tanpa
       memanggil request-nya dua kali -- cacheDesa yang menahan. */
    cariDesa: cariDesa,
    hasilHtml: hasilHtml,
    teksKoordinat: teksKoordinat,
    sudutDMS: sudutDMS,
    bersihkanNilai: bersih,
    kosongkan: kosongkan,
    hapusMarker: hapusMarker,
    pasangPin: pasangPin,
    salin: salin
  };
  window.GeoLokasi = api;

  if (typeof document !== 'undefined') {
    var boot = function () { if (!init()) setTimeout(boot, 300); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();
