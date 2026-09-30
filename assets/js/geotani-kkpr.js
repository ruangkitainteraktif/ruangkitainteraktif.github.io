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
   */
(function () {
  'use strict';

  var HOST_PROXY = 'https://gistaru.atrbpn.go.id/tres/proxy.ashx?';
  var DASAR_LAYER = 'https://gistaru.atrbpn.go.id/arcgis/rest/services/KKPR/';
  var LAYER_OSS = DASAR_LAYER + 'KKPR_OSS_ALL/MapServer/0/query';
  var LAYER_BERUSAHA = DASAR_LAYER + 'KKPR_BERUSAHA/MapServer/0/query';

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
    return HOST_PROXY + (o.layer || LAYER_OSS) + '?' + q.join('&');
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
        ' izin hanya ada di KKPR_BERUSAHA dan belum masuk KKPR_OSS_ALL');
    }
    if (hasil.gagalOss) catatan.push('layer KKPR_OSS_ALL gagal dimuat, hasil bisa tidak lengkap');
    if (hasil.gagalBerusaha) catatan.push('layer KKPR_BERUSAHA gagal dimuat, nama usaha mungkin tidak tampil');
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
      'ATR/BPN. NIB dan nomor izin adalah data permohonan yang served langsung ' +
      'dari server ATR/BPN, bukan hasil interpretasi.<br>'
      + 'Nama usaha diterjemahkan dari kode KBLI memakai codebook KBLI 2020 ' +
      '(dataset ronnieaban/kbli2020, Apache-2.0, turunan klasifikasi BPS). ' +
      'Kode yang tidak ada di codebook ditampilkan apa adanya, tanpa ditebak.</div>';
    return html;
  }

  function pesanGagal(err) {
    var msg = err && err.message ? err.message : 'tidak diketahui';
    if (err && err.name === 'AbortError') {
      return 'Permintaan ke ATR/BPN melewati batas waktu. Server sedang lambat atau tidak terjangkau.';
    }
    if (/HTTP 499/.test(msg) || /Token/i.test(msg)) {
      return 'ATR/BPN menolak permintaan (Token Required). Semua akses harus lewat tres/proxy.ashx.';
    }
    if (/Failed to execute query|Unable to complete/i.test(msg)) {
      return 'ATR/BPN menolak query. NIB mungkin tidak ada, atau layanannya sedang bermasalah.';
    }
    if (/CORS|NetworkError|Failed to fetch|Load failed/i.test(msg)) {
      return 'Tidak bisa menghubungi ATR/BPN dari browser. Kemungkinan besar CORS: layanan ini '
        + 'tidak mengirim header yang mengizinkan permintaan lintas origin. Data tidak dapat '
        + 'ditampilkan sampai itu diperbaiki di sisi ATR/BPN.';
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
              + ' tidak ditemukan di KKPR_OSS_ALL maupun KKPR_BERUSAHA ATR/BPN.';
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

    return api;
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
    getState: function () { return state; }
  };
  window.GeoTaniKkpr = api;

  if (typeof document !== 'undefined') {
    var boot = function () { if (!init()) setTimeout(boot, 300); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();
