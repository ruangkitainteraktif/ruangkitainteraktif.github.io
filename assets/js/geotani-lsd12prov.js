/* ── GeoTani: LSD 12 PROVINSI (ATR/BPN GISTARU) per desa ──
 *
 * Menampilkan Lahan Sawah yang Dilindungi di dalam desa yang dipilih,
 * sebagai workflow mandiri di sebelah kartu "LBS & LSD".
 *
 * Sumber: ATR/BPN GISTARU, service LSD/LSD_DAL/MapServer/0, yang bernama
 * LSD_12_PROVINSI -- nama itu bukan kebetulan, dan memang cakupan segaris
 * dengan namanya. Terbukti lewat query langsung ke server:
 *
 *   760.273 fitur total, dan WADMPR LIKE '%Jawa%' mengembalikan 0.
 *   Tidak ada satu pun fitur di Jawa, termasuk Jawa Timur.
 *
 * Sebelas dari dua belas provinsi yang terisi: Aceh, Sumatera Utara, Riau,
 * Kepulauan Riau, Jambi, Sumatera Selatan, Bengkulu, Lampung, Bangka
 * Belitung, Kalimantan Barat, Kalimantan Selatan, Sulawesi Selatan. Semua
 * wilayah lain nol: Bali, NTB, NTT, Kalimantan Timur dan Utara, semua
 * Sulawesi selain selatan, Maluku, dan Papua. Kalimantan Tengah punya 7
 * fitur di Kapuas dan Barito Timur -- sedikit, tapi nyata, jadi tidak
 * boleh ikut masuk daftar 12 hanya supaya angkanya bulat.
 *
 * Lima hal yang membentuk desain modul ini:
 *
 * 1. KARTU INI TIDAK MENYENTUH LBS/LSD BIG.
 *    Dua layer itu mengukur hal yang sama dari sumber berbeda, dan
 *    menjumlahkannya menghitung sawah dilindungi dua kali. Karena itu
 *    kartu ini berdiri sendiri dan tidak pernah dibandingkan diam-diam
 *    dengan kartu sebelahnya. Satu-satunya hubungan yang ditampilkan
 *    adalah kalimat "jangan dijumlahkan".
 *
 * 2. KLIP KE DESA WAJIB, sama seperti kartu LBS & LSD. GISTARU hanya punya
 *    WADMPR dan WADMKK, tidak ada kode desa sama sekali, jadi tidak ada
 *    cara menyaring per desa di sisi server. Bounding box desa selalu lebih
 *    besar dari desanya; tanpa klip, penjumlahan mentah bisa lebih dari
 *    dua kali luas sebenarnya.
 *
 * 3. FIELDNYA HURUF BESAR, dan kalimatnya BERBEDA dari BIG. Di sini
 *    `LUASHA`, di BIG `luasha`. Dan nilai LSD di sini berbunyi
 *    "... di dalam Penetapan Kawasan Hutan", sementara BIG menulis
 *    "... di Dalam Kawasan Hutan". Kata "Penetapan" hanya dipakai GISTARU,
 *    dan seluruh 760.273 fiturnya memakainya. Karena itu warna dicocokkan
 *    lewat bentuk kalimatnya, bukan.keysama persis -- kalau tidak, semua
 *    poligon jatuh ke warna default dan informasi dalam/luar kawasan hutan
 *    hilang tanpa error apa pun.
 *
 * 4. LUASHA SUDAH DALAM HEKTARE, bukan meter persegi. Terbukti: jumlah
 *    Shape_Area 27.516.732.116 m2 sama dengan jumlah LUASHA 2.751.673 ha.
 *    Jadi luasnya bisa dibandingkan langsung dengan luas_polyg BIG.
 *
 * 5. KARTU INI MULAI TERLIPAT, LALU SEPERTI APA ADANYA.
 *    Terlipatnya cuma keadaan awal dari markup: <details> ditulis
 *    tanpa atribut `open`. Setelah itu modul ini tidak menyentuh
 *    `card.open` sama sekali -- tidak di init, tidak setelah selesai
 *    memuat, tidak di Reset Polygon, dan tidak saat pindah tab.
 *
 *    Alasannya soal urutan kerja. Tombol "Tampilkan" ada DI DALAM kartu,
 *    jadi saat tombol ditekan kartu pasti terbuka; kalau modul menutup
 *    kartu begitu selesai memuat, hasilnya hilang tepat di tempat
 *    pengguna baru saja memintanya, dan dia harus menekan judulnya lagi
 *    hanya untuk membaca angka yang sudah selesai dihitung. Itu juga
 *    alasan tidak ada penjaga toggle di sini: ia menutup kartu setiap kali
 *    perpindahan tab terjadi, dan panel GeoTani yang dibuka berikutnya jadi
 *    dimulai dari kartu terbuka milik kunjungan sebelumnya, bukan dari
 *    workflow desa.
 *
 * Retry itu wajib, bukan opsional. GISTARU terbukti membalas 500 lalu
 * 400 tanpa pesan ketika sedang dibebani, lalu pulih sendiri; satu query
 * yang gagal berulang kali berhasil setelah 75 detik. Tanpa retry, satu
 * kedipan tidak stabil akan terbaca "tidak ada data" -- dan di 12 provinsi
 * itu keputusan yang salah, karena isinya tetap ada.
 *
 * Batas desa, cache, dan penghitung luas TIDAK ditulis ulang di sini.
 * Semuanya diambil dari window.GeoTaniLbsLsd supaya tidak ada dua
 * implementasi yang bisa berbeda. Yang ditulis di sini hanya orkestrasi
 * dan presentasi.
 */
(function () {
  'use strict';

  var GISTARU_PROXY = 'https://gistaru.atrbpn.go.id/tres/proxy.ashx?';
  var GISTARU_LSD = 'https://gistaru.atrbpn.go.id/arcgis/rest/services/LSD/LSD_DAL/MapServer/0';

  var REQUEST_TIMEOUT_MS = 45000;
  /* 1000 adalah maxRecordCount GISTARU, bukan pilihan. Angka yang lebih
     tinggi tidak mengembalikan lebih banyak, dan hasil yang terpotong
     ditandai di layar -- bukan dipotong diam-diam seperti request lain. */
  var RECORD_LIMIT = 1000;

  var MAX_Coba = 3;
  var JEDA_COBA_MS = [2500, 6000];

  /* Nama provinsi yang terisi, dipakai untuk kalimat cakupan dan untuk
     memutuskan apakah desa yang dipilih mungkin punya data. Bukan filter:
     daftar ini akan usang kalau ATR/BPN menambah provinsi, sedangkan
     unknowing memblokir tombol akan menolak hal yang sebenarnya ada. */
  var PROVINSI_TERISI = [
    'Aceh', 'Sumatera Utara', 'Riau', 'Kepulauan Riau', 'Jambi',
    'Sumatera Selatan', 'Bengkulu', 'Lampung', 'Bangka Belitung',
    'Kalimantan Barat', 'Kalimantan Selatan', 'Sulawesi Selatan'
  ];

  var LAYER = {
    key: 'lsd12',
    nama: 'Lahan Sawah yang Dilindungi',
    namaField: 'LSD',
    luasField: 'LUASHA',
    outFields: 'WADMPR,WADMKK,LSD,FGSFRF,FKWS,LUASHA,CTKSWH',
    /* Warna sengaja beda dari kartu BIG (oranye/kuning). Di peta keduanya
       bisa tampil bersamaan, dan warna yang sama untuk dua sumber berbeda
       membuat pengguna mengira itu satu layer. */
    warna: {
      'dalam kawasan hutan': '#3b82f6',
      'luar kawasan hutan': '#22c55e'
    },
    warnaDefault: '#93c5fd'
  };

  var state = null;
  window._geotaniLsd12Data = null;
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
     Modul ini berdiri di atas kartu LBS & LSD untuk batas desa, cache meta
     desa, dan penghitung luas. Kalau modul itu belum termuat, modul ini
     tidak punya apa-apa untuk ditampilkan -- itu dilaporkan, bukan
     dicoba dengan implementasi sendiri yang bisa berbeda diam-diam.

     Hanya fungsi yang benar-benar dipakai yang diperiksa. Daftar desa dan
     pencarian TIDAK termasuk: keduanya mengembalikan null/kosong dengan
     wajar kalau kartu sebelah tidak aktif, dan itu bukan kondisi yang
     perlu diperingatkan -- panel GeoTani lain memang boleh tidak aktif. */
  function M() { return window.GeoTaniLbsLsd; }

  function butuhDasar() {
    var m = M();
    if (!m || typeof m.clipKeDesa !== 'function' || typeof m.villageMeta !== 'function') {
      throw new Error('Modul LBS & LSD belum dimuat. Muat ulang halaman.');
    }
    return m;
  }

  /* ── warna ──
     Dicocokkan dari bentuk kalimat, bukan dari string persis. Alasannya
     tertulis di kepala file: GISTARU menulis "Penetapan", BIG menulis
     "Kawasan". Dua sumber, satu kalimat, dua ejaan -- dan untuk data GISTARU
     seluruhnya cuma ada dua nilai. */
  function warnaUntuk(nama) {
    var s = String(nama === null || nama === undefined ? '' : nama)
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/penetapan/g, 'kawasan hutan')
      .trim();
    if (s.indexOf('dalam') >= 0) return LAYER.warna['dalam kawasan hutan'];
    if (s.indexOf('luar') >= 0) return LAYER.warna['luar kawasan hutan'];
    return LAYER.warnaDefault;
  }

  /* Label pendek untuk daftar dan popup. Kalimat aslinya panjang dan
     identik untuk ribuan fitur, jadi ditampilkan utuh hanyaoros di popup. */
  function labelJenis(nama) {
    var s = String(nama === null || nama === undefined ? '' : nama);
    if (s.toLowerCase().indexOf('dalam') >= 0) return 'Dalam kawasan hutan';
    if (s.toLowerCase().indexOf('luar') >= 0) return 'Luar kawasan hutan';
    return s || '(tanpa kategori)';
  }

  /* ── url & retry ──
     GISTARU mengirim ACAO:*, jadi request boleh langsung ke tres/proxy.ashx
     tanpa CORS worker. Proxy itu milik GISTARU dan tidak berlaku untuk host
     lain, jadi worker kta-cors-proxy tidak dicoba sebagai cadangan: worker
     itu membalas 522 untuk setiap URL gistaru.atrbpn.go.id dan hanya
     menyembunyikan penyebab sebenarnya. */
  function url(params) {
    var q = Object.keys(params)
      .filter(function (k) { return params[k] !== null && params[k] !== undefined && params[k] !== ''; })
      .map(function (k) { return k + '=' + encodeURIComponent(params[k]); })
      .join('&');
    return GISTARU_PROXY + GISTARU_LSD + '/query?' + q;
  }

  function bisaDiulang(err) {
    if (!err) return false;
    /* 400 dari GISTARU datang tanpa pesan dan sering sementara. 404 tidak
       diulang: itu kondisi pasti yang tidak akan berubah. */
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
            console.warn('[LSD 12 Provinsi] permintaan gagal, mencoba lagi dalam ' + jeda +
              ' ms (percobaan ' + (i + 1) + '/' + MAX_Coba + '):', err && err.message);
          }
          await tidur(jeda);
          continue;
        }
        break;
      }
    }
    if (typeof console !== 'undefined' && console.error) {
      console.error('[LSD 12 Provinsi] gagal memuat:', last && last.message, last);
    }
    throw last;
  }

  /* ── kueri ──
     Filter spatial pakai envelope, bukan poligon. ArcGIS di sini tidak
     menerima geometry poligon kompleks pada kolom geometry-type polygon tanpa
     parameter tambahan; jalur bbox + intersect client-side sudah terbukti
     dipakai kartu LBS & LSD. */
  async function queryLsd(envelope) {
    var json = await fetchJson(url({
      f: 'json',
      where: '1=1',
      geometry: envelope,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outSR: '4326',
      outFields: LAYER.outFields,
      returnGeometry: 'true',
      resultRecordCount: RECORD_LIMIT
    }));
    var features = (json && json.features) || [];
    return {
      features: features,
      terpotong: !!(json && json.exceededTransferLimit) || features.length >= RECORD_LIMIT
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
     Layer tanpa fitur bukan kegagalan: 26 provinsi memang tidak punya data
     pada layer ini, jadi kondisi itu harus tampil sebagai keadaan kosong. */
  function load(kode) {
    if (inFlight.has(kode)) return inFlight.get(kode);
    var gen = generasi;
    var p = (async function () {
      var m = butuhDasar();
      var meta = await m.villageMeta(kode);
      if (!meta || !meta.geojson) throw new Error('Batas desa tidak dapat dimuat. Pilih desa lain atau coba lagi.');
      var box = m.bboxDariRings(meta.rings);
      if (!box) throw new Error('Batas desa tidak dapat dibaca.');

      var got = await queryLsd(box.envelope);

      var items = [];
      var utuh = 0, terpotong = 0, tanpaLuas = 0, tanpaAtrib = 0;
      var totalIrisan = 0, totalAtribIrisan = 0, totalLuar = 0;
      var perJenis = {};
      for (var f = 0; f < got.features.length; f++) {
        var feat = got.features[f];
        var clipped = m.clipKeDesa(feat, meta.geojson);
        if (!clipped) continue;
        var attrs = feat.attributes || {};
        var nama = attrs[LAYER.namaField] || '';
        var label = labelJenis(nama);
        var luasAtribPenuh = typeof attrs[LAYER.luasField] === 'number' ? attrs[LAYER.luasField] : null;
        var irisan = clipped.luasIrisanHa || 0;
        var penuh = clipped.luasGeometriPenuhHa || irisan;
        /* Atribut GISTARU mengukur seluruh poligon, termasuk bagian di luar
           desa. Yang ditampilkan bagian di dalam desa, jadi atribut hanya
           dipakai sebagai pembanding proporsi. */
        var atrikIrisan = luasAtribPenuh && penuh > 0 ? luasAtribPenuh * (irisan / penuh) : null;
        items.push({
          nama: label,
          namaPenuh: nama,
          warna: warnaUntuk(nama),
          luasIrisanHa: irisan,
          luasAtribIrisanHa: atrikIrisan,
          luasAtribPenuhHa: luasAtribPenuh,
          terpotong: clipped.terpotong,
          attrs: attrs,
          geometry: clipped.geometry
        });
        if (clipped.terpotong) terpotong += 1; else utuh += 1;
        totalIrisan += irisan;
        if (atrikIrisan === null) tanpaAtrib += 1; else totalAtribIrisan += atrikIrisan;
        if (clipped.luasIrisanHa === null) tanpaLuas += 1;
        totalLuar += luasAtribPenuh || 0;
        perJenis[label] = perJenis[label] || { label: label, warna: warnaUntuk(nama), ha: 0, jumlah: 0 };
        perJenis[label].ha += irisan;
        perJenis[label].jumlah += 1;
      }
      items.sort(function (a, b) { return b.luasIrisanHa - a.luasIrisanHa; });

      /* Peta digambar manual, jadi poligon bisa saling menimpa. Kalau
         penjumlahan irisan melebihi luas desa, angkanya menghitung sebagian
         area lebih dari sekali -- lebih baik ditandai daripada ditampilkan
         sebagai fakta. */
      var desaLuas = meta.luasHa;
      var tumpangTindih = desaLuas > 0 && totalIrisan > desaLuas * 1.02;

      /* Generasi berubah kalau pengguna menekan "Reset Polygon" selagi
         request berjalan. Map inFlight.clear() saja tidak mencegah apa pun:
         fetch yang sedang jalan tidak dibatalkan, dan responsnya akan menulis
         ulang state sehingga layer yang baru saja dilepas muncul lagi. */
      if (gen !== generasi) return null;

      var provinsi = (items.length && items[0].attrs && items[0].attrs.WADMPR)
        ? String(items[0].attrs.WADMPR).trim() : null;
      var adaProvinsi = null;
      if (provinsi) {
        for (var p2 = 0; p2 < PROVINSI_TERISI.length; p2++) {
          if (provinsi.toLowerCase() === PROVINSI_TERISI[p2].toLowerCase()) { adaProvinsi = true; break; }
        }
        if (adaProvinsi === null) adaProvinsi = false;
      }

      state = {
        kode: kode,
        namaDesa: meta.nama,
        luasDesaHa: desaLuas,
        bbox: box,
        layer: {
          key: LAYER.key,
          nama: LAYER.nama,
          items: items,
          utuh: utuh,
          terpotong: terpotong,
          totalIrisanHa: totalIrisan,
          totalAtribIrisanHa: totalAtribIrisan,
          totalLuarBboxHa: totalLuar,
          tanpaLuas: tanpaLuas,
          tanpaAtrib: tanpaAtrib,
          terpotongQuery: got.terpotong
        },
        perJenis: Object.keys(perJenis).map(function (k) { return perJenis[k]; })
          .sort(function (a, b) { return b.ha - a.ha; }),
        adaData: items.length > 0,
        provinsi: provinsi,
        /* true = desa ini di salah satu 12 provinsi; false = di luar, dan itu
           menjelaskan kenapa hasilnya kosong; null = tidak ada fitur, jadi
           tidak bisa dipastikan. */
        provinsiTermasuk12: adaProvinsi,
        irisanHa: totalIrisan,
        tumpangTindih: tumpangTindih,
        sumber: 'ATR/BPN GISTARU (LSD_12_PROVINSI)'
      };
      window._geotaniLsd12Data = state;
      return state;
    })();
    inFlight.set(kode, p);
    return p.then(function (r) { inFlight.delete(kode); return r; },
      function (e) { inFlight.delete(kode); throw e; });
  }

  /* ── kredit ──
     Ketentuan ATR/BPN mewajibkan menyebut lembaga pemberi data dan tautan ke
     sumber aslinya, sama seperti BIG.

     Tautannya ditulis sebagai teks biasa, bukan sebagai <a> dengan label
     "Tautan langsung". Label seperti itu membuat pembaca harus mencari tahu
     di mana tautannya, sementara URL yang tampil utuh bisa langsung disalin
     -- dan kutipan yang tidak bisa disalin tidak memenuhi syarat kutipan. */
  var credit = {
    lembaga: 'ATR/BPN (GISTARU)',
    judul: 'Peta Lahan Sawah yang Dilindungi',
    periode: 'Cakupan 12 provinsi',
    tautan: 'https://gistaru.atrbpn.go.id/arcgis/rest/services/LSD/LSD_DAL/MapServer'
  };

  function creditTanggalAkses() {
    return new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function creditHtml() {
    return '<div class="geotani-lbslsd-credit">' +
      '<b>Sumber data:</b> ' + escapeHtml(credit.judul) + ' &mdash; ' + escapeHtml(credit.lembaga) + '. ' +
      'Diakses pada ' + creditTanggalAkses() + '. ' +
      escapeHtml(credit.tautan) +
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
        style: { color: '#1d4ed8', weight: 1.3, opacity: 0.9, fillColor: it.warna, fillOpacity: 0.6 }
      });
      poly.bindPopup(popupHtml(it));
      group.addLayer(poly);
    }
    group.addTo(window.map);
    return group;
  }

  function popupHtml(it) {
    var luas = fmtLuas(it.luasIrisanHa);
    var a = it.attrs || {};
    var baris = '';
    function tambah(label, nilai) {
      baris += '<div class="geotani-sls-popup-row"><span>' + escapeHtml(label) +
        '</span><b>' + escapeHtml(nilai) + '</b></div>';
    }
    tambah('Provinsi', a.WADMPR || '-');
    tambah('Kab/Kota', a.WADMKK || '-');
    tambah('Kategori', it.nama);
    if (a.FGSFRF) tambah('FGSFRF', String(a.FGSFRF));
    if (a.FKWS) tambah('FKWS', String(a.FKWS));
    if (a.CTKSWH) tambah('Cetak sawah', String(a.CTKSWH));
    if (it.luasAtribIrisanHa !== null) {
      tambah('Luas atribut ATR/BPN', fmtLuas(it.luasAtribIrisanHa));
    }
    return '<div class="geotani-sls-popup">' +
      '<div class="geotani-sls-popup-title">' + escapeHtml(it.namaPenuh || it.nama) + '</div>' +
      '<div class="geotani-sls-popup-row"><span>Luas di desa</span><b>' + escapeHtml(luas) + '</b></div>' +
      baris +
      (it.terpotong ? '<div class="geotani-sls-popup-row"><span>Status</span><b>terpotong batas desa</b></div>' : '') +
      '</div>';
  }

  function drawOnMap(options) {
    clearMap();
    if (!state || !window.L || !window.map) return false;
    var opts = options || {};
    if (state.layer.items.length) mapLayer = gambarLayer(state.layer.items);
    zoomKeDesa(opts);
    return true;
  }

  /* Pad dan maxZoom mengikuti kartu LBS & LSD: poligon GISTARU sama
     detailnya dengan BIG, dan gerakan kamera yang beda membuat dua kartu
     yang berdampingan terasa berasal dari dua aplikasi berbeda. */
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

  function highlight(index) {
    if (!state || !window.L || !window.map) return false;
    if (highlightLayer && window.map.hasLayer(highlightLayer)) window.map.removeLayer(highlightLayer);
    var it = state.layer.items[index];
    if (!it) return false;
    highlightLayer = window.L.geoJSON(it.geometry, {
      style: { color: '#f59e0b', weight: 2.6, opacity: 1, fillColor: '#fbbf24', fillOpacity: 0.4 }
    }).addTo(window.map);
    return true;
  }

  function clear() {
    state = null;
    window._geotaniLsd12Data = null;
    clearMap();
  }

  /* Tombol "Reset Polygon". clear() saja tidak cukup: ia hanya mengosongkan
     state, layer peta, dan window._geotaniLsd12Data. Tanpa ini, daftar hasil
     dan input pencarian masih menampilkan desa yang sudah dilepas dari peta,
     sehingga layar terlihat seperti data masih termuat. */
  function reset() {
    generasi += 1;
    clear();
    inFlight.clear();
    setSelectedKode(null, null);
    var input = document.getElementById('geotaniLsd12VillageSearch');
    var results = document.getElementById('geotaniLsd12VillageResults');
    var out = document.getElementById('geotani-lsd12-output');
    var status = document.getElementById('geotani-lsd12-status');
    var btn = document.getElementById('geotani-lsd12-load');
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

  function barisPerJenis() {
    if (!state || !state.perJenis.length) return '';
    var h = '<div class="geotani-lbslsd-layer">';
    h += '<div class="geotani-lbslsd-sub">Rincian per kategori:</div>' +
      '<ul class="geotani-lbslsd-list geotani-lbslsd-list--ringkas">';
    for (var i = 0; i < state.perJenis.length; i++) {
      var j = state.perJenis[i];
      h += '<li>' +
        '<span class="geotani-lbslsd-swatch" style="background:' + escapeHtml(j.warna) + '"></span>' +
        '<span class="geotani-sls-name">' + escapeHtml(j.label) + '</span>' +
        '<span class="geotani-sls-luas">' + fmtLuas(j.ha) + '</span></li>';
    }
    h += '</ul></div>';
    return h;
  }

  function listHtml() {
    if (!state) return '';
    if (state.adaData === false) {
      /* Bukan kegagalan. Cakupan layer ini memang 12 provinsi, jadi kondisi
         ini normal di sebagian besar Indonesia dan harus tampil sebagai
         keadaan kosong. Kredit tetap supaya jelas dari mana data ini berasal. */
      var alasan = state.provinsiTermasuk12 === false
        ? 'Provinsi <b>' + escapeHtml(state.provinsi || 'ini') + '</b> di luar 12 provinsi yang dilayani layer ini.'
        : 'Cakupan layer ini hanya 12 provinsi, tidak seluruh Indonesia.';
      return '<div class="geotani-lbslsd-summary">' +
        '<div><span>Desa</span><b>' + escapeHtml(state.namaDesa) + '</b></div>' +
        (state.luasDesaHa !== null
          ? '<div><span>Luas desa</span><b>' + fmtLuas(state.luasDesaHa) + '</b></div>' : '') +
        '<div><span>LSD</span><b>0 ha</b></div>' +
        '</div>' +
        '<div class="geotani-lbslsd-warn" style="margin-top:8px;">ATR/BPN GISTARU tidak punya data ' +
        'Lahan Sawah yang Dilindungi untuk desa ini. ' + alasan +
        ' Untuk angka yang tersedia di seluruh Indonesia, pakai kartu LBS &amp; LSD (BIG).</div>' +
        creditHtml();
    }

    var h = '<div class="geotani-lbslsd-summary">';
    h += '<div><span>Lahan Sawah Dilindungi</span><b>' + fmtLuas(state.irisanHa) + '</b></div>';
    if (state.luasDesaHa !== null) {
      h += '<div><span>Luas desa</span><b>' + fmtLuas(state.luasDesaHa) + '</b></div>';
    }
    h += '<div><span>Poligon</span><b>' + state.layer.items.length + '</b></div>';
    h += '</div>';

    /* Satu kalimat yang selalu ada, bukan hanya kalau perlu. Dua kartu
       bersebelahan bisa menampilkan dua angka berbeda untuk hal yang sama,
       dan users berdiri tepat di bawah keduanya. */
    h += '<div class="geotani-lbslsd-note" style="margin-top:7px">Angka ini dari ATR/BPN. ' +
      'Kartu LBS &amp; LSD menampilkan angka BIG untuk desa yang sama &mdash; ' +
      '<b>jumlahkan tidak</b>, keduanya mengukur hal yang sama.</div>';

    if (state.tumpangTindih) {
      h += '<div class="geotani-lbslsd-warn">Peringatan tumpang tindih: jumlah luas melebihi luas desa (' +
        fmtLuas(state.irisanHa) + ' dari ' + fmtLuas(state.luasDesaHa) + '). Peta digambar manual sehingga ' +
        'poligon bisa saling menimpa, dan luas hasil penjumlahan menghitung sebagian area lebih dari sekali.</div>';
    }
    if (state.layer.terpotongQuery) {
      h += '<div class="geotani-lbslsd-warn">Server ATR/BPN membatasi jumlah poligon per permintaan (' +
        RECORD_LIMIT + '). Sebagian data mungkin tidak tampil, jadi luas di atas understated.</div>';
    }

    h += barisPerJenis();

    h += '<div class="geotani-lbslsd-layer">';
    h += '<div class="geotani-lbslsd-layer-head">' +
      '<span class="geotani-lbslsd-swatch" style="background:' +
      escapeHtml(state.layer.items[0].warna) + '"></span>' +
      escapeHtml(state.layer.nama) + ' <b>' + state.layer.items.length + '</b> poligon</div>';
    h += '<div class="geotani-lbslsd-sub">Total di desa: <b>' + fmtLuas(state.layer.totalIrisanHa) + '</b>' +
      (state.layer.utuh || state.layer.terpotong
        ? ' <span class="geotani-lbslsd-note">(' + state.layer.utuh + ' utuh' +
          (state.layer.terpotong ? ', ' + state.layer.terpotong + ' terpotong' : '') + ')</span>'
        : '') +
      '</div>';
    if (state.layer.totalAtribIrisanHa > 0) {
      h += '<div class="geotani-lbslsd-sub">Luas atribut ATR/BPN di desa: ' +
        fmtLuas(state.layer.totalAtribIrisanHa) + '</div>';
    }
    if (state.provinsi) {
      h += '<div class="geotani-lbslsd-sub">Provinsi: ' + escapeHtml(state.provinsi) + '</div>';
    }
    h += '<ul class="geotani-lbslsd-list">';
    for (var i = 0; i < state.layer.items.length; i++) {
      var it = state.layer.items[i];
      h += '<li data-lsd12-index="' + i + '">' +
        '<span class="geotani-lbslsd-swatch" style="background:' + escapeHtml(it.warna) + '"></span>' +
        '<span class="geotani-sls-name">' + escapeHtml(it.nama) +
        (it.terpotong ? ' <i>(terpotong)</i>' : '') + '</span>' +
        '<span class="geotani-sls-luas">' + fmtLuas(it.luasIrisanHa) + '</span>' +
        '</li>';
    }
    h += '</ul></div>';
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
     user tidak perlu mengetik ulang nama desa yang sama dua kali. */
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
    var picked = document.getElementById('geotaniLsd12VillageSelected');
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
    var host = root || document.getElementById('geotani-lsd12-card');
    if (!host) return null;
    var btn = document.getElementById('geotani-lsd12-load');
    var out = document.getElementById('geotani-lsd12-output');
    var status = document.getElementById('geotani-lsd12-status');
    var input = document.getElementById('geotaniLsd12VillageSearch');
    var results = document.getElementById('geotaniLsd12VillageResults');
    var resetBtn = document.getElementById('geotani-lsd12-reset');
    if (!btn || !out) return null;
    if (btn.__geotaniLsd12Bound) return api;
    btn.__geotaniLsd12Bound = true;

    if (resetBtn && !resetBtn.__geotaniLsd12ResetBound) {
      resetBtn.__geotaniLsd12ResetBound = true;
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
      /* Kartu tetap terbuka setelah selesai dimuat. Menutupnya otomatis akan
         menyembunyikan hasilnya persis di tempat pengguna baru saja
         memintanya, jadi dia harus menekan judulnya lagi hanya untuk
         membaca angka yang sudah selesai dihitung. */
      btn.disabled = true;
      out.innerHTML = '';
      if (status) status.textContent = 'Mengambil data LSD dari ATR/BPN GISTARU...';
      try {
        var st = await load(kode);
        /* null berarti pengguna menekan "Reset Polygon" selagi request ini
           berjalan. Jangan menulis apa pun ke layar. */
        if (!st) return;
        drawOnMap();
        out.innerHTML = listHtml();
        if (status) {
          status.textContent = st.adaData === false
            ? 'ATR/BPN tidak punya data LSD untuk desa ini.'
            : '';
        }
      } catch (e) {
        if (status) {
          status.textContent = e && e.message
            ? e.message
            : 'Gagal mengambil data LSD dari ATR/BPN.';
        }
      } finally {
        btn.disabled = false;
      }
    });

    out.addEventListener('click', function (ev) {
      var li = ev.target.closest ? ev.target.closest('[data-lsd12-index]') : null;
      if (li) highlight(Number(li.getAttribute('data-lsd12-index')));
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
    queryLsd: queryLsd,
    fetchJson: fetchJson,
    warnaUntuk: warnaUntuk,
    labelJenis: labelJenis,
    daftarDesa: daftarDesa,
    cariDesa: cariDesa,
    setSelectedKode: setSelectedKode,
    getSelectedKode: getSelectedKode,
    kodeDariPanelLain: kodeDariPanelLain,
    PROVINSI_TERISI: PROVINSI_TERISI,
    LAYER: LAYER,
    GISTARU_LSD: GISTARU_LSD,
    RECORD_LIMIT: RECORD_LIMIT,
    _url: url
  };
  window.GeoTaniLsd12 = api;

  if (typeof document !== 'undefined') {
    var boot = function () { if (!init()) setTimeout(boot, 300); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();
