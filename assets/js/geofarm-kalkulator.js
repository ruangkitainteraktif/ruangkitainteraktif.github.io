/* ── GeoFarm: Kalkulator Benih & Pupuk ──
 *
 * Satu kartu dengan dua tab yang memakai SATU field luas lahan:
 *
 *   Tab Benih -> luas, jarak tanam, benih/lubang, daya tumbuh, cadangan
 *                -> jumlah benih (butir)
 *   Tab Pupuk -> luas + dosis tiap jenis pupuk (kg/ha) + HET
 *                -> kebutuhan (kg), jumlah karung, estimasi biaya
 *
 * Module ini juga pemilik field luas bersama, jadi "Ambil dari poligon"
 * cukup satu tombol dan hasilnya langsung terpakai kedua tab.
 *
 * ── RUMUS BENIH ──
 *   luasM2       = luas x faktor satuan (m2 -> 1, ha -> 10000)
 *   jarakTanamM2 = (jarakBaris/100) x (jarakTanam/100)
 *   jumlahLubang = luasM2 / jarakTanamM2
 *   kebutuhan    = jumlahLubang x benihPerLubang
 *                   / (dayaTumbuh/100) x (1 + cadangan/100)
 *
 * ── RUMUS PUPUK ──
 *   luasHa      = luasM2 / 10000
 *   kebutuhanKg = dosisKgPerHa x luasHa
 *   karung      = ceil(kebutuhanKg / 50)      (sak bulging 50 kg)
 *   rekomendasi = karung x 50                  (yang dibeli di kios)
 *   biaya       = jumlah (kebutuhanKg_i x HET_i)
 *
 * ── JEBAKAN DATA ──
 * Enam hal di bawah ini yang pernah salah dan tidak boleh "dibulatkan"
 * dalam implementasi. Semuanya berkomentar di tempatnya juga.
 *
 * 1. HASIL BENIH DIBULATKAN KE ATAS. Benih tidak dijual per butir, jadi
 *    `Math.ceil` benar sedangkan `Math.round` bisa kurang beli.
 *
 * 2. DAYA TUMBUH 0 BUKAN "BELUM DIISI". 0 berarti tidak ada koreksi
 *    sama sekali; membaginya akan menghasilkan Infinity yang tidak
 *    pernah tampil di kalkulator mana pun. Jadi 0 diperlakukan sebagai
 *    100%, bukan disembunyikan sampai user mengisinya.
 *
 * 3. LUAS POLIGON DIHITUNG ULANG, TIDAK DIBACA DARI CACHE.
 *    markPolygonStale() di polygon-analysis.js memperbarui ring dan
 *    bounds setelah simpul diedit, tapi TIDAK memperbarui `areaHa`;
 *    `layer._measureData` juga basi setelah edit. Karena itu tombol
 *    "Ambil dari poligon" memanggil geoArea lagi, bukan membaca nilai
 *    yang tersimpan, supaya luas selalu sama dengan petak di peta.
 *
 * 4. NPK MAJEMUKNYA SENDIRI MEMBAWA N. Dosis "Urea 250 + NPK 300"
 *    yang sering ditulis di literatur sebenarnya salah: NPK 300 sudah
 *    menyumbang 45 kg N/ha, dan 250 kg urea sudah menyumbang 115 kg
 *    N/ha, jadi menumpuk keduanya menghasilkan 160 kg N/ha (1,39x
 *    target). Fungsi `ureaSetelahNpk` mengurangi N dari NPK dulu.
 *
 * 5. SP-36, KCl, DAN NPK 15-10-12 TIDAK BERSUBSIDI, jadi tidak punya
 *    HET resmi. Default harganya kosong. Baris tanpa harga TIDAK
 *    dijumlahkan sebagai Rp 0 — kalau iya, total biaya terlihat
 *    lengkap padahal sebenarnya ada ratusan ribu rupiah yang belum ikut
 *    terhitung. Kalau tidak ada satu pun harga terisi, blok biaya
 *    disembunyikan.
 *
 * 6. DOSIS PUPUK ADALAH KEBUTUHAN SATU MUSIM, BUKAN SEKALI TEBARAN.
 *    Angka horti seperti bawang merah 435 kg urea/ha terlihat berlebihan
 *    kalau dibaca sebagai takaran satu kali; sebenarnya itu total musim
 *    yang dibagi beberapa aplikasi. Karena itu baris di atas
 *    BATAS_TAKAR_SEKALIG lebih dari 150 kg/ha diberi peringatan.
 */
(function () {
  'use strict';

  var SATUAN_M2 = { m2: 1, ha: 10000 };
  var KARUNG_KG = 50;
  /* Batas takaran sekali tebar. Di atas angka ini ada dua risiko
     sekaligus: hara hilang (luruh, menguap, terlarut) dan akar terbakar
     karena kadar terlalu pekat. Karena itu baris yang melebihi batas
     ini dapat peringatan, lihat catatan (6). */
  var BATAS_TAKAR_SEKALIG = 150;

  /* ── data Pupuk ──
     kadar hara dalam persen bobot, mengikuti format kemasan.
     sp/p2o5/k2o dipakai untuk koreksi N saat NPK ikut dipakai. */
  var PUPUK = [
    { id: 'urea', nama: 'Urea', n: 46, p: 0, k: 0, ket: '46% N' },
    { id: 'za', nama: 'ZA', n: 21, p: 0, k: 0, ket: '21% N, 26% S' },
    { id: 'sp36', nama: 'SP-36', n: 0, p: 36, k: 0, ket: '36% P2O5' },
    { id: 'kcl', nama: 'KCl', n: 0, p: 0, k: 60, ket: '60% K2O' },
    { id: 'npk1515', nama: 'NPK 15-15-15', n: 15, p: 15, k: 15, ket: '15-15-15' },
    { id: 'npk1510', nama: 'NPK 15-10-12', n: 15, p: 10, k: 12, ket: '15-10-12' }
  ];

  /* ── HET (harga eceran tertinggi) ──
     Kepmentan No. 1117/KPTS./SR.310/M/10/2025, berlaku 22 Oktober 2025,
     menurunkan HET 2025 sebesar 20% dari Kepmentan 800/2025.
     Hanya urea, NPK, dan ZA yang masuk program subsidi, jadi SP-36,
     KCl, dan NPK 15-10-12 TIDAK diberi angka tebakan — lihat jebakan (5).
     Semua bisa diedit user karena HET berubah tiap tahun. */
  var HET_AWAL = {
    urea: 1800,
    za: 1360,
    sp36: '',
    kcl: '',
    npk1515: 1840,
    npk1510: ''
  };
  var SUMBER_HET = 'Kepmentan No. 1117/KPTS./SR.310/M/10/2025 (22 Okt 2025)';

  /* ── preset tanaman ──
     Padi sawah: Permen No. 13/2022 Pasal 8. Pemetaan status hara P dan K
     ke dosis SP-36/KCl bersifat nasional, sedangkan angka Urea 250
     adalah nilai "umum" yang sama di sebagian besar tabel kecamatan.
     Dosis Pastinya per kecamatan, jadi di bawahnya ada catatan.
     Horti: tabel dosis BALITSA (Suwandi 2011) yang dipakai manual
     JIRCAS, DITERJEMAHKAN ke bentuk produk murni:
       Urea = N/0,46   SP-36 = P2O5/0,36   KCl = K2O/0,60
     Angka horti yang besar itu total satu musim (jebakan 6), bukan
     takaran sekali tebar. */
  var PRESET = [
    {
      id: 'padi-rendah', nama: 'Padi sawah - hara P & K rendah', sumber: 'Permen 13/2022',
      dosis: { urea: 250, za: 0, sp36: 100, kcl: 100, npk1515: 0, npk1510: 0 }
    },
    {
      id: 'padi-sedang', nama: 'Padi sawah - hara P & K sedang', sumber: 'Permen 13/2022',
      dosis: { urea: 250, za: 0, sp36: 75, kcl: 50, npk1515: 0, npk1510: 0 }
    },
    {
      id: 'padi-tinggi', nama: 'Padi sawah - hara P tinggi, K sedang/tinggi', sumber: 'Permen 13/2022',
      dosis: { urea: 250, za: 0, sp36: 50, kcl: 50, npk1515: 0, npk1510: 0 }
    },
    {
      id: 'cabai', nama: 'Cabai (monokultur)', sumber: 'Suwandi 2011 / BALITSA',
      dosis: { urea: 326, za: 0, sp36: 417, kcl: 250, npk1515: 0, npk1510: 0 }
    },
    {
      id: 'tomat', nama: 'Tomat / kubis', sumber: 'Suwandi 2011 / BALITSA',
      dosis: { urea: 246, za: 0, sp36: 267, kcl: 250, npk1515: 0, npk1510: 0 }
    },
    {
      id: 'bawang', nama: 'Bawang merah', sumber: 'Suwandi 2011 / BALITSA',
      dosis: { urea: 435, za: 0, sp36: 250, kcl: 167, npk1515: 0, npk1510: 0 }
    },
    {
      id: 'lain', nama: 'Tanaman lain - isi sendiri', sumber: '',
      dosis: { urea: 0, za: 0, sp36: 0, kcl: 0, npk1515: 0, npk1510: 0 }
    }
  ];

  var el = null;              /* cache elemen DOM; diisi di init() */
  var bound = false;
  var api = null;
  /* Satuan yang TERAKHIR dipakai, dipisah dari <select> karena satuan bisa
     diubah dari kode (tombol "Ambil dari poligon" memaksa ke ha) tanpa
     melalui event change. Kalau satuan sebelumnya disimpankan di
     dataset/elemen, setiap perubahan dari kode akan meninggalkannya
     basi dan konversi luas meleset 10.000 kali tanpa terlihat. */
  var satuanSebelum = 'm2';
  var tabAktif = 'benih';

  /* ── util ──
     Format memakai id-ID supaya pemisah ribuan titik dan desimal koma,
     sama dengan readout luas di panel GeoFarm. */
  function fmt(n) {
    return Number(n).toLocaleString('id-ID');
  }

  function fmtNum(n) {
    /* Nilai fraksional (jumlah lubang, luas per lubang) dibatasi 2 desimal
       supaya tidak berubah-ubah tiap ketikan angka. */
    return Number(n).toLocaleString('id-ID', { maximumFractionDigits: 2 });
  }

  function fmtRupiah(n) {
    return 'Rp' + Math.round(n).toLocaleString('id-ID');
  }

  function angka(value) {
    var n = parseFloat(value);
    return isFinite(n) ? n : null;
  }

  /* Angka untuk diisi ke <input type="number">: 6 digit signifikan, lalu
     nol di ekor dibuang. toFixed(4) tidak boleh dipakai di sini karena
     luas kecil seperti 0,000042 ha akan jadi "0.0000" lalu terkirim
     sebagai nol. Pembuangan nol juga hanya boleh pada bagian desimal,
     kalau tidak "10000" akan jadi "1". */
  function angkaRingkas(n) {
    if (!isFinite(n)) return '';
    var s = String(Number(n.toPrecision(6)));
    if (s.indexOf('.') > -1) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function setStatus(node, text, kind) {
    if (!node) return;
    node.textContent = text || '';
    node.className = 'geofarm-kalk-status' + (kind ? ' is-' + kind : '');
  }

  /* Satu-satunya jalan mengubah satuan. Nilai <select> dan satuanSebelum
     selalu ditulis berpasangan supaya tidak pernah tidak sinkron. */
  function setSatuan(unit) {
    var u = unit === 'ha' ? 'ha' : 'm2';
    if (el && el.satuan) el.satuan.value = u;
    satuanSebelum = u;
  }

  function luasM2Sekarang() {
    if (!el) return 0;
    var v = angka(el.luas.value) || 0;
    return v * SATUAN_M2[el.satuan.value === 'ha' ? 'ha' : 'm2'];
  }

  /* ── hitung benih ──
     Murni, tanpa menyentuh DOM, supaya bisa diuji terpisah dari render.
     Mengembalikan objek hasil, atau null kalau input belum cukup. */
  function hitung(v) {
    var luasM2 = v.luas * SATUAN_M2[v.satuan];
    var jarakTanamM2 = (v.jarakBaris / 100) * (v.jarakTanam / 100);
    if (!isFinite(luasM2) || luasM2 <= 0) return null;
    if (!isFinite(jarakTanamM2) || jarakTanamM2 <= 0) return null;
    if (!isFinite(v.perLubang) || v.perLubang < 1) return null;

    var jumlahLubang = luasM2 / jarakTanamM2;
    var benihDasar = jumlahLubang * v.perLubang;
    /* Daya tumbuh 0 = tanpa koreksi, lihat catatan (2) di kepala file. */
    var daya = v.daya > 0 ? Math.min(v.daya, 100) / 100 : 1;
    var cadangan = v.cadangan > 0 ? v.cadangan / 100 : 0;
    var setelahDaya = benihDasar / daya;
    var kebutuhan = setelahDaya * (1 + cadangan);
    if (!isFinite(kebutuhan) || kebutuhan <= 0) return null;

    return {
      luasM2: luasM2,
      jarakTanamM2: jarakTanamM2,
      jumlahLubang: jumlahLubang,
      benihDasar: benihDasar,
      setelahDaya: setelahDaya,
      setelahCadangan: kebutuhan,
      total: Math.ceil(kebutuhan),
      /* Lahan lebih kecil dari satu jarak tanam. Angka tetap dihitung, tapi
         hasilnya tidak setara satu lubang penuh dan harus diperingatkan. */
      kurangDariSatuLubang: jumlahLubang < 1
    };
  }

  function bacaInputBenih() {
    return {
      luas: angka(el.luas.value) || 0,
      satuan: el.satuan.value === 'ha' ? 'ha' : 'm2',
      jarakBaris: angka(el.jarakBaris.value) || 0,
      jarakTanam: angka(el.jarakTanam.value) || 0,
      perLubang: angka(el.perLubang.value) === null ? 1 : parseFloat(el.perLubang.value),
      daya: angka(el.daya.value) || 0,
      cadangan: angka(el.cadangan.value) || 0
    };
  }

  function renderBenih() {
    var v = bacaInputBenih();
    var r = hitung(v);
    el.benihOutput.innerHTML = '';
    if (!r) {
      if (v.luas <= 0) { setStatus(el.benihStatus, 'Isi luas lahan dulu.'); return; }
      if (v.jarakBaris <= 0 || v.jarakTanam <= 0) { setStatus(el.benihStatus, 'Isi jarak baris dan jarak tanam dulu.'); return; }
      if (v.perLubang < 1) { setStatus(el.benihStatus, 'Benih per lubang minimal 1 butir.', 'warn'); return; }
      setStatus(el.benihStatus, 'Input belum valid.');
      return;
    }

    setStatus(el.benihStatus, '');
    var h = '';
    h += '<div class="geofarm-benih-total">';
    h += '<span>Total kebutuhan benih</span>';
    h += '<b>' + fmt(r.total) + ' <small>butir</small></b>';
    h += '</div>';
    h += '<dl class="geofarm-benih-rows">';
    h += '<div><dt>Jumlah lubang</dt><dd>' + fmtNum(r.jumlahLubang) + '</dd></div>';
    h += '<div><dt>Benih dasar</dt><dd>' + fmt(r.benihDasar) + ' butir</dd></div>';
    if (v.daya > 0) h += '<div><dt>Setelah daya tumbuh ' + escapeHtml(fmtNum(v.daya)) + '%</dt><dd>' + fmtNum(r.setelahDaya) + ' butir</dd></div>';
    if (v.cadangan > 0) h += '<div><dt>Tambah cadangan ' + escapeHtml(fmtNum(v.cadangan)) + '%</dt><dd>' + fmtNum(r.setelahCadangan) + ' butir</dd></div>';
    h += '</dl>';
    h += '<div class="geofarm-benih-luas-info">Luas ' + escapeHtml(fmtNum(r.luasM2 / 10000)) + ' ha &middot; jarak tanam ' +
      escapeHtml(fmtNum(r.jarakTanamM2 * 10000)) + ' cm&sup2; per lubang</div>';
    if (r.kurangDariSatuLubang) {
      h += '<div class="geofarm-benih-warn">Jarak tanam lebih besar dari lahan, jadi hasil di atas setara satu lubang penuh. ' +
        'Periksa lagi jarak tanam atau luas lahannya.</div>';
    }
    el.benihOutput.innerHTML = h;
  }

  /* ── hitung pupuk ──
     `dosis` dan `het` bisa berupa objek ATAU array sepanjang PUPUK,
     supaya pemanggil tidak perlu tahu urutannya. Murni, tanpa DOM. */
  function hitungPupuk(luasM2, dosis, het) {
    if (!isFinite(luasM2) || luasM2 <= 0) return null;
    var luasHa = luasM2 / 10000;
    var baris = [];
    var totalKg = 0, totalBiaya = 0, adaHarga = false;

    for (var i = 0; i < PUPUK.length; i++) {
      var p = PUPUK[i];
      var d = dosis[p.id] !== undefined ? dosis[p.id] : (Array.isArray(dosis) ? dosis[i] : 0);
      d = angka(d) || 0;
      if (d < 0) d = 0;
      var kg = d * luasHa;
      var h = het[p.id] !== undefined ? het[p.id] : (Array.isArray(het) ? het[i] : '');
      h = (h === '' || h === null || h === undefined) ? null : (angka(h) || null);
      /* Baris dengan dosis 0 dikeluarkan dari total (jebakan tambahan).
         Kalau ikut dijumlahkan sebagai 0, total kg bisa terlihat nol
         padahal ada satu baris kosong saja yang aktif.

         HANYA-KANYA harga tetap dibawa di baris 0-dosis. Kalau di sini
         diisi null, renderPupuk() akan menulis ulang kolom HET baris itu
         menjadi kosong, jadi harga yang sudah diketik user hilang tepat
         ketika dia menambah dosis di baris itu. */
      if (d <= 0) {
        baris.push({ svc: p, dosis: 0, kg: 0, karung: 0, harga: h, biaya: null, perluBertahap: false });
        continue;
      }
      var biaya = (h !== null && h > 0) ? kg * h : null;
      if (biaya !== null) { adaHarga = true; totalBiaya += biaya; }
      totalKg += kg;
      baris.push({
        svc: p,
        dosis: d,
        kg: kg,
        karung: Math.ceil(kg / KARUNG_KG),
        harga: h,
        biaya: biaya,
        /* Jebakan (6): dosis besar di atas batas sekali tebar. */
        perluBertahap: d > BATAS_TAKAR_SEKALIG
      });
    }

    if (totalKg <= 0) return null;
    return {
      luasHa: luasHa,
      baris: baris,
      totalKg: totalKg,
      /* Jumlah sak dibulatkan ke atas supaya tidak kurang beli; berat
         yang dibeli adalah jumlah sak penuh dikali 50 kg. */
      totalKarung: Math.ceil(totalKg / KARUNG_KG),
      adaHarga: adaHarga,
      totalBiaya: totalBiaya,
      adaDosisTinggi: baris.some(function (b) { return b.perluBertahap; })
    };
  }

  /* Koreksi N saat NPK majemuk ikut dipakai — jebakan (4).
     `ureaDasar` adalah dosis urea yang mewakili target N
     (mis. 250 kg urea = 115 kg N). NPK sudah menyumbang sebagian N,
     jadi urea yang perlu ditambahkan hanya sisanya. */
  function ureaSetelahNpk(ureaDasar, npkKg, nPersen) {
    if (!isFinite(npkKg) || npkKg <= 0 || !isFinite(nPersen) || nPersen <= 0) return ureaDasar;
    var nTarget = ureaDasar * 46 / 100;
    var nDariNpk = npkKg * nPersen / 100;
    var sisa = (nTarget - nDariNpk) / (46 / 100);
    return sisa > 0 ? sisa : 0;
  }

  /* Nilai taken langsung dari DOM yang sedang tampil, BUKAN dari peta
     elemen yang di-cache di init(). Urutan init lalu tidak penting, dan
     input yang baru dibuat renderPupuk() ikut terbaca tanpa harus
     mengisi cache dulu. Elemen yang belum ada (render pertama) dibaca
     sebagai 0 / kosong, bukan lewat `undefined.value`. */
  function bacaInputPupuk() {
    var dosis = {}, het = {};
    for (var i = 0; i < PUPUK.length; i++) {
      var id = PUPUK[i].id;
      var dEl = document.getElementById('geofarmPupukDosis_' + id);
      var hEl = document.getElementById('geofarmPupukHet_' + id);
      dosis[id] = dEl ? (angka(dEl.value) || 0) : 0;
      var hv = hEl ? hEl.value : '';
      het[id] = (hv === '') ? '' : (angka(hv) || 0);
    }
    return { dosis: dosis, het: het };
  }

  function renderPupuk() {
    if (!el.pupukBody) return;
    var luasM2 = luasM2Sekarang();
    var v = bacaInputPupuk();
    var r = hitungPupuk(luasM2, v.dosis, v.het);
    var preset = PRESET.filter(function (p) { return p.id === el.preset.value; })[0];
    el.presetInfo.textContent = preset && preset.sumber ? 'Acuan: ' + preset.sumber : '';

    var h = '';
    for (var i = 0; i < PUPUK.length; i++) {
      var p = PUPUK[i];
      var b = r ? r.baris[i] : { dosis: v.dosis[p.id], kg: null, karung: null, harga: v.het[p.id], biaya: null, perluBertahap: false };
      h += '<tr>';
      h += '<th scope="row"><span class="geofarm-kalk-nama">' + escapeHtml(p.nama) + '</span><small>' + escapeHtml(p.ket) + '</small></th>';
      h += '<td><input type="number" min="0" step="any" inputmode="decimal" class="geofarm-kalk-cell" id="geofarmPupukDosis_' + p.id + '" value="' + escapeHtml(angkaRingkas(b.dosis || 0)) + '" aria-label="Dosis ' + escapeHtml(p.nama) + ' kg per hektar"></td>';
      h += '<td class="geofarm-kalk-cell-out">' + (b.kg !== null && b.kg > 0 ? fmtNum(b.kg) + ' kg' : '<span class="is-kosong">-</span>') + '</td>';
      h += '<td><input type="number" min="0" step="1" inputmode="numeric" class="geofarm-kalk-cell" id="geofarmPupukHet_' + p.id + '" value="' + (b.harga === '' || b.harga === null ? '' : escapeHtml(angkaRingkas(b.harga))) + '" placeholder="Rp" aria-label="Harga ' + escapeHtml(p.nama) + ' per kilogram"></td>';
      /* Baris dengan dosis 0 diberi tanda "-" di kedua kolom output, bukan
         "belum ada harga". Tanpa ini baris kosong ikut terlihat seperti
         ada masalah harga, padahal yang bermasalah baris lain. */
      if (!(b.dosis > 0)) {
        h += '<td class="geofarm-kalk-cell-out"><span class="is-kosong">-</span></td>';
      } else {
        h += '<td class="geofarm-kalk-cell-out">' + (b.biaya !== null ? fmtRupiah(b.biaya) : '<span class="is-kosong">belum ada harga</span>') + '</td>';
      }
      h += '</tr>';
    }
    el.pupukBody.innerHTML = h;

    /* Input di dalam tabel baru dibuat ulang setiap render, jadi
       listener-nya dipasang ulang di sini, bukan sekali di init(). */
    for (var j = 0; j < PUPUK.length; j++) {
      bindPupukRow(PUPUK[j].id);
    }

    var t = '';
    if (r) {
      t += '<div class="geofarm-kalk-total"><span>Total pupuk</span><b>' + fmtNum(r.totalKg) + ' <small>kg</small></b></div>';
      t += '<dl class="geofarm-benih-rows">';
      t += '<div><dt>Jumlah karung ' + KARUNG_KG + ' kg</dt><dd>' + fmt(r.totalKarung) + ' sak</dd></div>';
      t += '<div><dt>Rekomendasi beli</dt><dd>' + fmt(r.totalKarung * KARUNG_KG) + ' kg (sak penuh)</dd></div>';
      t += '</dl>';
      if (r.adaHarga) {
        t += '<div class="geofarm-kalk-total is-money"><span>Estimasi biaya</span><b>' + fmtRupiah(r.totalBiaya) + '</b></div>';
      }
      if (r.adaDosisTinggi) {
        t += '<div class="geofarm-benih-warn">Ada dosis di atas ' + BATAS_TAKAR_SEKALIG + ' kg/ha. ' +
          'Angka itu kebutuhan satu musim penuh, bukan takaran sekali tebar; bagikan jadi beberapa aplikasi ' +
          'sesuai jadwal pemupukan tanaman.</div>';
      }
      if (!r.adaHarga) {
        t += '<div class="geofarm-kalk-hint">Isi kolom HET untuk menghitung biaya. SP-36, KCl, dan NPK 15-10-12 tidak masuk ' +
          'pupuk bersubsidi jadi tidak punya HET resmi — isi harga pasarnya sendiri.</div>';
      }
    } else {
      t += '<div class="geofarm-kalk-hint">' + (luasM2 > 0 ? 'Isi dosis salah satu jenis pupuk di atas.' : 'Isi luas lahan dulu.') + '</div>';
    }
    el.pupukTotal.innerHTML = t;
  }

  function bindPupukRow(id) {
    var d = document.getElementById('geofarmPupukDosis_' + id);
    var h = document.getElementById('geofarmPupukHet_' + id);
    if (d) d.addEventListener('input', renderPupuk);
    if (h) h.addEventListener('input', renderPupuk);
  }

  function pakaiPreset(id) {
    var preset = PRESET.filter(function (p) { return p.id === id; })[0];
    if (!preset) return;
    for (var i = 0; i < PUPUK.length; i++) {
      var p = PUPUK[i];
      var input = document.getElementById('geofarmPupukDosis_' + p.id);
      if (input) input.value = angkaRingkas(preset.dosis[p.id] || 0);
    }
    renderPupuk();
  }

  /* ── Ambil luas dari poligon GeoFarm ──
     Dua sumber, dipakai berurutan:
       1. window.getDrawnLayers() — accessor resmi dari
          alat-draw-measure.js. Cakup polygon hasil gambar dan hasil
          unggah SHP/GeoJSON, karena keduanya masuk ke feature group yang
          sama.
       2. const global `drawLayerGroup` — accessor-nya belum ada
          (mis. file dimuat dari cache lama). const top-level di script
          klasik masuk ke global lexical scope, jadi tetap terbaca dari
          script lain; `typeof` aman kalau caranya sudah diganti. */
  function polygonTerakhir() {
    var layers = null;
    try {
      if (typeof window.getDrawnLayers === 'function') {
        layers = window.getDrawnLayers();
      } else if (typeof drawLayerGroup !== 'undefined' && drawLayerGroup) {
        layers = drawLayerGroup.getLayers();
      }
    } catch (e) {
      return null;
    }
    if (!layers || !layers.length) return null;
    /* getLayers() urut penyisipan, jadi yang terakhir = yang paling baru.
       L.Polygon juga mencakup L.Rectangle, yang sah dipakai sebagai petak. */
    for (var i = layers.length - 1; i >= 0; i--) {
      var l = layers[i];
      if (l && window.L && L.Polygon && l instanceof L.Polygon) return l;
    }
    return null;
  }

  /* Satu-satunya sumber pesan untuk field luas bersama, jadi kedua tab
     menampilkan instruksi yang sama persis. */
  function pesanLuas(text, kind) {
    setStatus(el.luasStatus, text, kind);
    if (text) {
      setStatus(el.benihStatus, text, kind);
      setStatus(el.pupukStatus, text, kind);
    }
  }

  function ambilDariPoligon() {
    var layer = polygonTerakhir();
    if (!layer) {
      pesanLuas('Belum ada poligon di peta. Buat atau unggah polygon GeoFarm dulu.', 'warn');
      return;
    }
    var ha = null;
    try {
      if (window.geoArea && typeof window.geoArea.areaHaFromGeoJSON === 'function') {
        /* toGeoJSON(), bukan getLatLngs(): poligon berlubang dan MultiPolygon
           butuh seluruh geometrinya, sedangkan getLatLngs()[0] hanya
           mengembalikan ring pertama. */
        ha = window.geoArea.areaHaFromGeoJSON(layer.toGeoJSON());
      }
    } catch (e) {
      ha = null;
    }
    if (!isFinite(ha) || ha <= 0) {
      pesanLuas('Luas poligon tidak bisa dihitung. Gambar ulang polygon-nya.', 'warn');
      return;
    }
    setSatuan('ha');
    el.luas.value = angkaRingkas(ha);
    renderSemua();
    pesanLuas('Luas diambil dari poligon terakhir: ' + fmtNum(ha) + ' ha.', 'ok');
  }

  /* ── tab ── */
  function bukaTab(which) {
    tabAktif = which === 'pupuk' ? 'pupuk' : 'benih';
    var ativo = tabAktif;
    var tabs = [
      { btn: el.tabBenih, panel: el.panelBenih, key: 'benih' },
      { btn: el.tabPupuk, panel: el.panelPupuk, key: 'pupuk' }
    ];
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].key === ativo;
      tabs[i].btn.classList.toggle('active', on);
      tabs[i].btn.setAttribute('aria-selected', String(on));
      tabs[i].panel.hidden = !on;
    }
  }

  function renderSemua() {
    if (!el) return;
    renderBenih();
    renderPupuk();
  }

  /* ── init ── */
  function init(root) {
    var host = root || document.getElementById('geofarm-kalkulator-card');
    if (!host) return false;
    el = {
      luas: document.getElementById('geofarmKalkLuas'),
      satuan: document.getElementById('geofarmKalkSatuan'),
      ambil: document.getElementById('geofarmKalkAmbil'),
      luasStatus: document.getElementById('geofarmKalkLuasStatus'),
      tabBenih: document.getElementById('geofarmKalkTabBenih'),
      tabPupuk: document.getElementById('geofarmKalkTabPupuk'),
      panelBenih: document.getElementById('geofarmKalkPanelBenih'),
      panelPupuk: document.getElementById('geofarmKalkPanelPupuk'),
      jarakBaris: document.getElementById('geofarmBenihJarakBaris'),
      jarakTanam: document.getElementById('geofarmBenihJarakTanam'),
      perLubang: document.getElementById('geofarmBenihPerLubang'),
      daya: document.getElementById('geofarmBenihDaya'),
      cadangan: document.getElementById('geofarmBenihCadangan'),
      benihStatus: document.getElementById('geofarmBenihStatus'),
      benihOutput: document.getElementById('geofarmBenihOutput'),
      preset: document.getElementById('geofarmPupukPreset'),
      presetInfo: document.getElementById('geofarmPupukPresetInfo'),
      pupukStatus: document.getElementById('geofarmPupukStatus'),
      pupukBody: document.getElementById('geofarmPupukBody'),
      pupukTotal: document.getElementById('geofarmPupukTotal'),
      /* Baris Pupuk TIDAK memakai peta elemen yang di-cache: nilainya
         dibaca langsung dari DOM di bacaInputPupuk(). Jadi urutan baris
         di bawah tidak bergantung pada elemen mana yang sudah ada. */
    };

    if (!el.luas || !el.satuan || !el.benihOutput || !el.luasStatus) return false;
    if (!el.preset || !el.pupukBody || !el.pupukTotal) return false;
    if (bound) { bukaTab(tabAktif); renderSemua(); return true; }
    bound = true;

    /* Opsi preset dibangun dari array PRESET, sama alasan kenapa baris
       tabel tidak ditulis di index.html: satu sumber kebenaran. */
    var opts = '';
    for (var i = 0; i < PRESET.length; i++) {
      opts += '<option value="' + escapeHtml(PRESET[i].id) + '">' + escapeHtml(PRESET[i].nama) + '</option>';
    }
    el.preset.innerHTML = opts;

    /* Baris Pupuk pertama kali dibangun oleh renderPupuk() supaya markup
       tabel tidak dobel antara HTML dan JS. */
    renderPupuk();

    /* HET default diisi SEKALI di sini, setelah tabel pertama ada tapi
       sebelum render kedua — bukan di dalam renderPupuk(). Kalau
       pengisiannya ikut di renderPupuk(), setiap ketikan dosis akan
       menulis ulang harga yang sengaja dikosongkan user. SP-36, KCl,
       dan NPK 15-10-12 sengaja dibiarkan kosong: tidak punya HET resmi. */
    for (var j = 0; j < PUPUK.length; j++) {
      var hargaAwal = HET_AWAL[PUPUK[j].id];
      var hEl = document.getElementById('geofarmPupukHet_' + PUPUK[j].id);
      if (hEl && hargaAwal !== '' && hargaAwal !== undefined) hEl.value = hargaAwal;
    }
    renderPupuk();

    el.luas.addEventListener('input', renderSemua);
    ['jarakBaris', 'jarakTanam', 'perLubang', 'daya', 'cadangan'].forEach(function (key) {
      el[key].addEventListener('input', renderBenih);
    });

    /* Ganti satuan harus mengonversi angkanya juga. Kalau tidak, 1 ha yang
       diketik lalu diganti ke m2 akan terbaca 1 m2 dan hasil meleset
       10.000 kali — kesalahan yang tidak terlihat dari tampilannya.

       Arah konversinya: dari satuan LAMA ke m2 dulu, baru dari m2 ke
       satuan BARU. 1 m2 -> ha karena itu 1 / 10000, bukan 1 * 10000.
       Konversi membaca satuanSebelum, bukan nilai <select> saat event
       fired, supaya perubahan satuan dari kode lewat setSatuan() ikut
       tercatat dan tidak memicu konversi ganda. */
    el.satuan.addEventListener('change', function () {
      var lama = angka(el.luas.value);
      if (lama !== null && lama > 0) {
        el.luas.value = angkaRingkas(lama * SATUAN_M2[satuanSebelum] / SATUAN_M2[el.satuan.value]);
      }
      setSatuan(el.satuan.value);
      pesanLuas('');
      renderSemua();
    });
    satuanSebelum = el.satuan.value === 'ha' ? 'ha' : 'm2';

    el.ambil.addEventListener('click', ambilDariPoligon);
    el.tabBenih.addEventListener('click', function () { bukaTab('benih'); });
    el.tabPupuk.addEventListener('click', function () { bukaTab('pupuk'); });
    el.preset.addEventListener('change', function () { pakaiPreset(el.preset.value); });

    bukaTab(tabAktif);
    renderSemua();
    return true;
  }

  api = {
    init: init,
    hitung: hitung,
    hitungPupuk: hitungPupuk,
    ureaSetelahNpk: ureaSetelahNpk,
    ambilDariPoligon: ambilDariPoligon,
    pakaiPreset: pakaiPreset,
    bukaTab: bukaTab,
    PUPUK: PUPUK,
    PRESET: PRESET,
    HET_AWAL: HET_AWAL,
    SUMBER_HET: SUMBER_HET,
    KARUNG_KG: KARUNG_KG
  };
  window.GeoFarmKalkulator = api;

  /* Kartu GeoFarm ada di DOM sejak awal, tapi modul ini dimuat belakangan
     dari daftar script. Pola boot ulang 300ms sama dengan geotani-sls.js
     supaya urutan pemuatan tidak harus dijaga manual. */
  if (typeof document !== 'undefined') {
    var boot = function () { if (!init()) setTimeout(boot, 300); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();
