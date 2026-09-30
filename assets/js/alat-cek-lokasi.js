/* Alat Cek Lokasi: dari koordinat ke nama wilayah.
   Hanya baca. Satu endpoint GISTARU untuk seluruh tingkat wilayah, lihat
   .opencode/plans/geolokasi-cek-lokasi.md untuk risetnya. */
(function () {
  'use strict';

  var PROXY = 'https://gistaru.atrbpn.go.id/tres/proxy.ashx?';
  var DASAR = 'https://gistaru.atrbpn.go.id/arcgis/rest/services/';
  var LAYER = DASAR + 'BATAS_ADMINISTRASI/Admin_Kecamatan/MapServer/0/query';

  /* GISTARU tidak punya batas desa. Hanya batas kecamatan ke bawah. Field
     wadmkd di layer ini bernilai satu spasi, bukan kosong, jadi nilai itu
     harus dibuang. Kalau tidak, UI menampilkan "Desa:  " dan terlihat
     seperti bug. */
  var PETA_WILAYAH = {
    desa: { f: 'wadmkd', l: 'Desa / kelurahan' },
    kecamatan: { f: 'wadmkc', l: 'Kecamatan' },
    kabupaten: { f: 'wadmkk', l: 'Kabupaten / kota' },
    provinsi: { f: 'wadmpr', l: 'Provinsi' }
  };

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
     objek berisi empat null, karena pemanggil bisa membedakan "tidak ada
     data" dari "data ada tapi satu-duanya kosong". */
  function normalisasiWilayah(p) {
    p = p || {};
    var out = {};
    var ada = 0;
    var kunci = ['desa', 'kecamatan', 'kabupaten', 'provinsi'];
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
  /* Id marker yang dibuat oleh modul ini. Dipakai untuk memasang ulang
     panel hasil setiap kali pin baru dibuat, sehingga koordinat lama tidak
     pernah tertinggal di layar setelah peta dipindahkan. */
  var markerLokasi = null;

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

  /* Hasil wilayah. `s` adalah hasil cariWilayah(). */
  function hasilHtml(s, lat, lng) {
    var h = '<div class="geolokasi-hasil">';
    h += '<div class="geolokasi-koordinat"><b>' + esc(teksKoordinat(lat, lng)) + '</b></div>';

    h += '<table class="geolokasi-tabel"><tbody>';
    h += '<tr><th>' + esc(PETA_WILAYAH.provinsi.l) + '</th><td>' + esc(s.wilayah.provinsi) + '</td></tr>';
    h += '<tr><th>' + esc(PETA_WILAYAH.kabupaten.l) + '</th><td>' + esc(s.wilayah.kabupaten) + '</td></tr>';
    h += '<tr><th>' + esc(PETA_WILAYAH.kecamatan.l) + '</th><td>' + esc(s.wilayah.kecamatan) + '</td></tr>';

    /* Desa selalu kosong di sumber ini. Ketiadaan itu harus dijelaskan,
       bukan disembunyikan dengan tanda hubung tanpa alasan. */
    h += '<tr><th>' + esc(PETA_WILAYAH.desa.l) + '</th><td>'
      + '<span class="geolokasi-takada">tidak tersedia di sumber data</span></td></tr>';
    h += '</tbody></table>';

    var dms = sudutDMS(lat, lng);
    if (dms) h += '<div class="geolokasi-kecil">' + esc(dms) + '</div>';

    if (s.multi) {
      h += '<div class="geolokasi-kecil geolokasi-kecil--wajar">'
        + 'Titik ini tepat pada batas wilayah, dan lebih dari satu kecamatan cocok. '
        + 'Yang ditampilkan adalah yang pertama.</div>';
    }
    return h + '</div>';
  }

  function cek() {
    if (!el.out) return;
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
    if (el.status) el.status.textContent = 'Mencari wilayah...';
    if (el.btn) el.btn.disabled = true;

    cariWilayah(masuk.lat, masuk.lng).then(function (s) {
      if (el.btn) el.btn.disabled = false;
      if (s.jaringan) {
        tampilkanPesan('<div class="geolokasi-galat">Tidak dapat membaca wilayah dari server ATR/BPN. '
          + 'Koordinat di atas tetap benar.<br>'
          + '<span class="geolokasi-kecil">' + esc(s.pesan) + '</span></div>');
        if (el.status) el.status.textContent = '';
        return;
      }
      if (s.kosong) {
        tampilkanPesan('<div class="geolokasi-galat">Titik ini di luar wilayah Indonesia, '
          + 'sehingga tidak ada batas wilayah yang bisa dibaca.</div>');
        if (el.status) el.status.textContent = '';
        return;
      }
      if (!s.wilayah) {
        tampilkanPesan('<div class="geolokasi-galat">Batas wilayah ditemukan, '
          + 'tetapi tidak memuat nama desa, kecamatan, kabupaten, atau provinsi.</div>');
        if (el.status) el.status.textContent = '';
        return;
      }
      if (el.status) el.status.textContent = '';
      tampilkanPesan(hasilHtml(s, masuk.lat, masuk.lng));
      /* Tombol Salin baru muncul setelah ada koordinat yang benar. */
      if (el.salin) el.salin.style.display = '';
    });
  }

  /* Panel hasil dibersihkan setiap kali koordinat berubah, supaya tidak
     ada angka lama yang terlihat masih berlaku. */
  function kosongkan() {
    tampilkanPesan('');
    if (el.status) el.status.textContent = '';
    if (el.salin) el.salin.style.display = 'none';
  }

  /* Pasang listener draw:created, tepat satu kali.
     Penanda disimpan di objek map, BUKAN di elemen DOM, karena init()
     dipanggil berulang kali oleh loop boot -- penanda di elemen akan
     membiarkan listener menumpuk. Flag sengaja tidak pernah dihapus:
     kalau dihapus, listener lama menggantung dan tetap dipanggil. */
  function pasangPendengar() {
    if (typeof window.map === 'undefined' || !window.map || !window.L) return;
    if (window.map.__geolokasiBound) return;
    window.map.__geolokasiBound = true;

    window.map.on('draw:created', function (ev) {
      var layer = ev && ev.layer;
      /* Hanya marker. Polygon, garis, dan lingkaran milik alat gambar dan
         GeoOSS, dan ikut memicu event yang sama. */
      if (!layer || typeof layer.getLatLng !== 'function') return;
      var p = layer.getLatLng();
      markerLokasi = layer;
      /* Isi input lalu cek, supaya koordinat yang ditampilkan sama dengan
         yang ada di pin, dan bisa langsung disalin tanpa diketik ulang. */
      if (el.input) el.input.value = teksKoordinat(p.lat, p.lng);
      kosongkan();
      cek();
    });
  }

  /* Pin: pakai mode marker bawaan alat gambar. Popup koordinat sudah
     dipasang di alat-draw-measure.js, jadi di sini tidak perlu membuat
     marker sendiri -- dan pin ikut bisa dihapus dari alat gambar. */
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
    var host = root || document.getElementById('alat-tab-lokasi');
    if (!host) return null;
    el = {
      host: host,
      input: document.getElementById('geolokasiInput'),
      btn: document.getElementById('geolokasiCek'),
      pin: document.getElementById('geolokasiPin'),
      salin: document.getElementById('geolokasiSalin'),
      out: document.getElementById('geolokasiHasil'),
      status: document.getElementById('geolokasiStatus')
    };
    if (!el.input || !el.out) return null;
    if (el.input.__geolokasiBound) return api;
    el.input.__geolokasiBound = true;

    if (el.btn) el.btn.addEventListener('click', cek);
    if (el.pin) el.pin.addEventListener('click', pasangPin);
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
    teksKoordinat: teksKoordinat,
    sudutDMS: sudutDMS,
    bersihkanNilai: bersih,
    kosongkan: kosongkan,
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
