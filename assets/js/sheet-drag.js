/* ── Bottom sheet mobile: gestur geser tinggi ala Google Maps ──
 *
 * Satu modul ini memiliki seluruh siklus hidup sheet di bawah 768px:
 * buka, tutup, minimalkan, kembalikan, PLUS geser tinggi dengan tiga
 * titik jepit (chip / tengah / penuh). Sebelumnya tiap sheet punya
 * salinan sendiri dari logika yang sama (delapan salinan minimize,
 * sembilan open, tiga salinan aria-label, tersebar di enam file).
 *
 * ── KENAPA TINGGI DISIMPAN DI CUSTOM PROPERTY, BUKAN INLINE height ──
 * Tinggi sheet memakai `height: var(--sheet-h, 50dvh)`. Nilai
 * `--sheet-h` sengaja DIHAPUS saat sheet berada di stop tengah supaya
 * aturan CSS `50dvh` yang berlaku. Alasannya `dvh` ikut menyusut
 * mengikuti bar URL browser: kalau tinggi dipatok px, sheet melompat
 * begitu bar URL menyusut saat user menggeser ke stop penuh.
 *
 * ── KONVENSI STATE (penting, jangan diubah tanpa membaca semua aturan CSS) ──
 *   tertutup   : kelas open MATI, kelas min MATI
 *   terbuka    : kelas open NYALA, kelas min MATI
 *   minimal    : kelas open NYALA, kelas min NYALA   <-- open sengaja dibiarkan
 *
 * Kelas open dibiarkan menyala pada stop minimal itu keputusan, bukan
 * kelalaian. Aturan seperti `.pa-panel.pa-min` di app.css TIDAK mendeklarasikan ulang
 * `visibility` maupun `transform`, jadi chip GeoFarm hilang total di desktop
 * kalau kelas `pa-open` ikut dimatikan. Aturan `#hotspot-sheet.sheet-minimized`
 * dan `#geopangan-sheet.sheet-minimized` punya masalah yang sama di mobile.
 * Aturan body-class yang menyembunyikan nav bawah juga memakai
 * `body.X-open:not(.X-minimized)`, yang hanya masuk akal kalau keduanya
 * bisa hidup bersamaan.
 *
 * Konsekuensinya `body.X-open` berarti "sheet terlihat", bukan "sheet
 * mengembang". Sembunyikan-nav tetap memakai penjaga `:not()` itu.
 */
(function () {
  'use strict';

  var BATAS_MOBILE = 768;
  var STOP_CHIP = 0, STOP_TENGAH = 1, STOP_PENUH = 2;
  var AMBANG_GESER = 6;      /* px; sebelum ini masih dianggap tap */
  var WAKTU_LEMPA = 120;     /* ms; horizon proyeksi kecepatan */
  var PLIH_DI_ATAS = 10;     /* px peta yang disisakan di stop penuh */
  var KELAMBAT = 0.55;       /* px/ms; di bawah ini lem diabaikan */
  var SELISIH_TUTUP = 320;   /* ms; blkade click setelah drag selesai */

  var DAFTAR = {};           /* id -> konfigurasi */
  var URUT = [];             /* id terdaftar, untuk iterasi yang stabil */
  var geser = null;          /* state gestur yang sedang berjalan */
  var rafTinggi = 0;
  var yRaf = 0;

  /* ── util ── */
  function elDari(cfg) {
    return typeof cfg.el === 'string' ? document.getElementById(cfg.el) : cfg.el;
  }

  function di(cfg, nama) {
    var e = elDari(cfg);
    if (!e) return null;
    return e.querySelector ? e.querySelector(nama) : null;
  }

  /*Zona geser: header sheet. Handle di dalamnya ikut tercakup karena
    event naik dari anak ke header, jadi cukup satu listener. Kalau sheet
    tidak punya header, pakai elemen sheet-nya sendiri. */
  function zona(cfg) {
    return di(cfg, cfg.header) || elDari(cfg);
  }

  function mobile() {
    return window.innerWidth <= BATAS_MOBILE;
  }

  function px(v) {
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  /*Tinggi yang berlaku saat `--sheet-h` tidak disetel, yaitu tinggi
    tengah dari CSS. Diukur, bukan ditebak, supaya berhenti di antara
    tinggi CSS dan viewport tetap konsisten. Measur ini memaksa reflow
    satu kali, hanya saat sheet dibuka. */
  var cacheTengah = {};
  function tinggiTengah(cfg) {
    var e = elDari(cfg);
    if (!e) return 0;
    if (cacheTengah[cfg.id] !== undefined) return cacheTengah[cfg.id];
    var simpan = e.style.getPropertyValue('--sheet-h');
    e.style.removeProperty('--sheet-h');
    var h = e.getBoundingClientRect().height || window.innerHeight * 0.5;
    if (simpan) e.style.setProperty('--sheet-h', simpan);
    cacheTengah[cfg.id] = h;
    return h;
  }

  function tinggiSekarang(cfg) {
    var e = elDari(cfg);
    if (!e) return 0;
    return e.getBoundingClientRect().height;
  }

  /* ── state sheet ──
     Empat operasi ini adalah satu-satunya tempat yang boleh menyentuh
     kelas sheet. Semua tombol di enam file lain memanggilnya. */
  function kelas(cfg, nama, nyala) {
    var e = elDari(cfg);
    if (e && e.classList) e.classList.toggle(nama, !!nyala);
  }

  function setBody(cfg, nama, nyala) {
    if (document.body && document.body.classList) document.body.classList.toggle(nama, !!nyala);
  }

  function labelkan(cfg) {
    var b = di(cfg, cfg.minButton);
    if (!b) return;
    var min = cfg.labelMin || 'Minimalkan panel';
    var buka = cfg.labelOpen || 'Perluas panel';
    var now = isMinimized(cfg.id) ? buka : min;
    b.setAttribute('aria-label', now);
    b.title = now;
  }

  function isOpen(id) {
    var cfg = DAFTAR[id];
    if (!cfg) return false;
    var e = elDari(cfg);
    return !!(e && e.classList && e.classList.contains(cfg.openClass));
  }

  function isMinimized(id) {
    var cfg = DAFTAR[id];
    if (!cfg) return false;
    var e = elDari(cfg);
    return !!(e && e.classList && e.classList.contains(cfg.minClass));
  }

  /* Lepaskan semua stop non-default: `--sheet-h` dihapus supaya CSS
     `50dvh` yang berlaku lagi. */
  function keTengah(cfg) {
    var e = elDari(cfg);
    if (e && e.style) e.style.removeProperty('--sheet-h');
    cerminTinggiKeMap(e);
  }

  /* Tinggi sheet ikut dicermin ke elemen peta sebagai --map-h.
     Dua hal membuat ini perlu:
     1. @property --sheet-h punya inherits: false, jadi nilainya tidak
        menurun ke anak. #map adalah SAUDARA sheet, bukan anaknya, jadi
        dia hanya akan dapat initial-value 50dvh -- nilai yang diset di
        elemen sheet tidak akan pernah terbaca.
     2. Karena itu nilainya ditulis ulang ke #map dengan nama sendiri,
        supaya CSS bisa menghitung tinggi layar yang tidak tertutup sheet.

     Dicermin hanya di titik yang diam (keTengah dan terapkanStop), bukan
     di onMove: saat jari masih bergerak, tinggi peta ikut bergerak tetapi
     map.invalidateSize() belum dipanggil, jadi tile akan meleset di
     tengah gerakan. Lebih baik petanya menyusul setelah sheet berhenti. */
  function cerminTinggiKeMap(eSheet) {
    var m = document.getElementById('map');
    if (!m) return;
    var h = eSheet ? eSheet.style.getPropertyValue('--sheet-h') : '';
    if (h) m.style.setProperty('--map-h', h);
    else m.style.removeProperty('--map-h');
  }

  /* Kedalaman chrome di atas peta: tepi bawah unified search atau quick
     layer bar, mana yang lebih rendah. Ini yang membuat polygon harus
     duduk di tengah PITA bebas -- antara chrome itu dan tepi atas sheet,
     bukan di tengah kotak peta.

     Digunakan untuk menambah tinggi peta sebesar C px. Titik tengah peta
     ada di (C + H - S) / 2, sama dengan titik tengah pita bebas; sisa C px
     di bawah kotak peta memang tertutup sheet, dan itu memang bipartisan:
     sheetnya yang opaque. Peta sengaja TIDAK digeser turun memakai
     margin-top, karena chrome-nya beranchor ke tepi atas peta -- kalau peta
     digeser, unified search ikut turun dan tidak lagi menempel di atas.

     Diukur dari DOM, bukan angka tetap, jadi kalau tinggi kotak search
     atau jumlah tombol quick layer berubah, semuanya ikut menyesuaikan. */
  function ukurChromeAtas() {
    var m = document.getElementById('map');
    if (!m) return;
    var dasar = m.getBoundingClientRect().top;
    var bawah = 0;
    var sels = ['.unified-search', '.quick-layer-bar'];
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (!el) continue;
      var r = el.getBoundingClientRect();
      if (r.height <= 0) continue;
      var d = r.bottom - dasar;
      if (d > bawah) bawah = d;
    }
    m.style.setProperty('--map-chrome', Math.round(bawah) + 'px');
  }

  function buka(id, opsi) {
    var cfg = DAFTAR[id];
    if (!cfg) return;
    var e = elDari(cfg);
    if (!e) return;

    /* Mutexclusion: di bawah 768px hanya satu sheet boleh mengembang.
       Sheet lain jadi chip, bukan ditutup, supaya hasilKerja user tidak
       hilang. Di desktop tidak ada aturan ini karena sheet menjadi panel
       sisi kanan yang memang boleh berdiri sendiri. */
    if (mobile() && !(opsi && opsi.jaga)) {
      for (var i = 0; i < URUT.length; i++) {
        var lain = URUT[i];
        if (lain === id) continue;
        if (isOpen(lain) && !isMinimized(lain)) minimize(lain, { jaga: true });
      }
    }

    kelas(cfg, cfg.minClass, false);
    kelas(cfg, cfg.openClass, true);
    setBody(cfg, cfg.bodyMin, false);
    setBody(cfg, cfg.bodyOpen, true);
    keTengah(cfg);
    if (e.classList) {
      e.classList.add('sheet-draggable');
      delete cacheTengah[id];
    }
    labelkan(cfg);
    if (cfg.onOpen) { try { cfg.onOpen(); } catch (err) { lapis(id, 'onOpen', err); } }
    sinkronkanPeta();
  }

  function close(id) {
    var cfg = DAFTAR[id];
    if (!cfg) return;
    var e = elDari(cfg);
    if (!e) return;
    kelas(cfg, cfg.openClass, false);
    kelas(cfg, cfg.minClass, false);
    setBody(cfg, cfg.bodyOpen, false);
    setBody(cfg, cfg.bodyMin, false);
    keTengah(cfg);
    if (e.classList) e.classList.remove('sheet-draggable', 'is-dragging');
    geser = null;
    labelkan(cfg);
    if (cfg.onClose) { try { cfg.onClose(); } catch (err) { lapis(id, 'onClose', err); } }
    sinkronkanPeta();
  }

  function minimize(id, opsi) {
    var cfg = DAFTAR[id];
    if (!cfg) return;
    var e = elDari(cfg);
    if (!e) return;
    if (!isOpen(id)) { if (!(opsi && opsi.paksa)) return; buka(id, { jaga: true }); }
    keTengah(cfg);
    if (e.classList) e.classList.remove('is-dragging');
    /* Kelas open sengaja TIDAK dimatikan; lihat catatan konvensi di
       kepala file. Yang dimatikan hanya kelas min. */
    kelas(cfg, cfg.minClass, true);
    setBody(cfg, cfg.bodyMin, true);
    labelkan(cfg);
    if (cfg.onMinimize) { try { cfg.onMinimize(true); } catch (err) { lapis(id, 'onMinimize', err); } }
    sinkronkanPeta();
  }

  function restore(id) {
    var cfg = DAFTAR[id];
    if (!cfg) return;
    if (!isOpen(id)) { buka(id); return; }
    kelas(cfg, cfg.minClass, false);
    setBody(cfg, cfg.bodyMin, false);
    labelkan(cfg);
    if (cfg.onMinimize) { try { cfg.onMinimize(false); } catch (err) { lapis(id, 'onMinimize', err); } }
    sinkronkanPeta();
  }

  /* ── Ringkasan state untuk CSS ──
     Tiap sheet punya body class sendiri, jadi CSS tidak bisa menanyakan
     "ada sheet yang terbuka?" tanpa memeriksa delapan nama kelas berbeda.
     Ringkasan ini menyediakan satu kelas body saja: .sheet-terbuka.

     Sheet yang sudah jadi chip TIDAK dihitung. Chip cuma 36px di bawah
     tengah, jadi peta sudah terlihat penuh -- menghitungnya sebagai aktif
     akan membuat peta menyusut tanpa alasan. */
  function adaYangTerbuka() {
    for (var i = 0; i < URUT.length; i++) {
      if (isOpen(URUT[i]) && !isMinimized(URUT[i])) return true;
    }
    return false;
  }

  /* Dipanggil setiap kali state sheet berubah. Selain menyalakan kelas
     body, menjadwalkan map.invalidateSize() setelah transisi area peta
     selesai: tinggi di mobile dan lebar di desktop sama-sama berubah. */
  var _timerSinkron = 0;
  function sinkronkanPeta() {
    document.body.classList.toggle('sheet-terbuka', adaYangTerbuka());
    ukurChromeAtas();
    clearTimeout(_timerSinkron);
    _timerSinkron = setTimeout(function () {
      var m = window.map;
      if (m && typeof m.invalidateSize === 'function') m.invalidateSize({ pan: false });
    }, 340);
  }

  function toggle(id) {
    if (isOpen(id)) close(id); else buka(id);
  }

  function toggleMinimize(id) {
    if (!isOpen(id)) return;
    if (isMinimized(id)) restore(id); else minimize(id);
  }

  /* Minimalkan semua yang terbuka. Hotspot dan GeoPangan ditutup penuh,
     bukan jadi chip: keduanya menyimpan layer peta (titik panas, harga
     pangan) yang harus ikut hilang kalau semua disembunyikan. */
  function minimizeAll() {
    for (var i = 0; i < URUT.length; i++) {
      var id = URUT[i];
      if (!isOpen(id)) continue;
      var cfg = DAFTAR[id];
      if (cfg && cfg.tutupSaatMinimizeSemua) close(id);
      else minimize(id);
    }
  }

  /* Versi lembut dari minimizeAll: semua sheet yang MENGEMBANG dijadikan
     chip, tidak ada yang ditutup. Dipakai saat FAB peta ditekan, karena
     membuka FAB bukan bermaksud mengakhiri hasil yang sudah dihitung. */
  function minimizeTerbuka() {
    for (var i = 0; i < URUT.length; i++) {
      var id = URUT[i];
      if (isOpen(id) && !isMinimized(id)) minimize(id);
    }
  }

  function lapis(id, nama, err) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[sheet-drag] ' + id + '.' + nama + ' gagal:', err);
    }
  }

  /* ── gestur ──
     Pointer Events dipakai, bukan touch + mouse terpisah, supaya satu
     jalur kode menutup sentuh, pena, dan tetikus. */
  function onDown(e, id) {
    if (!mobile()) return;
    if (!isOpen(id)) return;
    if (e.button !== undefined && e.button !== 0) return;
    /* Tombol di dalam header harus tetap bisa ditekan, jadi Geser
       dimulai dari target lain, bukan dari button/input/dll. */
    if (e.target && e.target.closest && e.target.closest('button,a,input,select,textarea,label,[data-no-sheet-drag]')) return;

    var cfg = DAFTAR[id];
    var eSheet = elDari(cfg);
    if (!eSheet) return;

    geser = {
      id: id,
      cfg: cfg,
      sheet: eSheet,
      pointerId: e.pointerId,
      y0: e.clientY,
      h0: tinggiSekarang(cfg),
      tengah: tinggiTengah(cfg),
      geser: false,
      v: 0,
      yTerakhir: e.clientY,
      tTerakhir: e.timeStamp || Date.now(),
      stopAwal: isMinimized(id) ? STOP_CHIP : (eSheet.style.getPropertyValue('--sheet-h') ? STOP_PENUH : STOP_TENGAH)
    };
    try { if (eSheet.setPointerCapture && e.pointerId !== undefined) eSheet.setPointerCapture(e.pointerId); } catch (err) { /* tidak fatal */ }
  }

  function onMove(e) {
    if (!geser || e.pointerId !== geser.pointerId) return;
    var dy = e.clientY - geser.y0;
    if (!geser.geser) {
      if (Math.abs(dy) < AMBANG_GESER) return;
      geser.geser = true;
      geser.sheet.classList.add('is-dragging');
    }
    /* Kecepatan instantaneous, disimpan untuk proyeksi saat lepas. */
    var now = e.timeStamp || Date.now();
    var dt = now - geser.tTerakhir;
    if (dt > 0) geser.v = (e.clientY - geser.yTerakhir) / dt;
    geser.yTerakhir = e.clientY;
    geser.tTerakhir = now;

    yRaf = e.clientY;
    if (!rafTinggi) {
      rafTinggi = requestAnimationFrame(function () {
        rafTinggi = 0;
        if (!geser) return;
        geser.sheet.style.setProperty('--sheet-h', hitungTinggi(geser) + 'px');
      });
    }
    if (e.cancelable) e.preventDefault();
  }

  function hitungTinggi(g) {
    var dy = yRaf - g.y0;
    var h = g.h0 - dy;
    var min = 0;
    var maks = Math.max(window.innerHeight - PLIH_DI_ATAS, 120);
    if (h < min) h = min;
    if (h > maks) h = maks;
    return h;
  }

  function onUp(e) {
    if (!geser || e.pointerId !== geser.pointerId) return;
    if (rafTinggi) { cancelAnimationFrame(rafTinggi); rafTinggi = 0; }
    var g = geser;
    geser = null;
    try { if (g.sheet.releasePointerCapture && e.pointerId !== undefined) g.sheet.releasePointerCapture(e.pointerId); } catch (err) { /* tidak fatal */ }
    if (!g.geser) { g.sheet.classList.remove('is-dragging'); return; }

    var h = g.sheet.getBoundingClientRect().height;
    g.sheet.classList.remove('is-dragging');
    terapkanStop(g.cfg, pilihStop(g, h));
    /* Swipe yang berakhir sebagai drag tidak boleh ikut memicu onclick
       header, karena 3 dari 5 handle lama memakai onclick untuk menutup
       sheet. */
    blokadeClick(g.sheet);
  }

  /* Stop tujuan ditentukan dari POSISI PROYEKSI: tinggi sekarang
     dikoreksi kecepatan jari selama 120 ms ke depan. Tanpa ini
     gerakan cepat yang berhenti sedikit sebelum stop selalu mentok di
     stop yang salah. */
  function pilihStop(g, h) {
    var tengah = g.tengah || window.innerHeight * 0.5;
    var penuh = window.innerHeight - PLIH_DI_ATAS;
    if (Math.abs(g.v) < KELAMBAT) g.v = 0;
    var proyeksi = h - g.v * WAKTU_LEMPA;
    if (proyeksi < 0) proyeksi = 0;
    if (proyeksi > penuh) proyeksi = penuh;

    /* Dari chip hanya bisa naik: chip sudah stop paling bawah, jadi
       satu-satunya tujuan yang masuk akal adalah tengah. Tanpa aturan
       ini gesekan kecil dari chip akan memantulkan chip kembali. */
    if (g.stopAwal === STOP_CHIP) return STOP_TENGAH;

    /* Himpunan stop yang boleh dicapai dari posisi sekarang, lalu ambil
       yang terdekat. Dari tengah chip boleh dicapai langsung; dari penuh
       hanya boleh kalau jaraknya benar-benar jauh. */
    var opsi = [STOP_TENGAH, STOP_PENUH];
    if (g.stopAwal === STOP_TENGAH) opsi.unshift(STOP_CHIP);
    else if (proyeksi < tengah * 0.4) opsi.unshift(STOP_CHIP);

    var tinggiDari = function (s) { return s === STOP_CHIP ? 0 : (s === STOP_TENGAH ? tengah : penuh); };
    var terbaik = opsi[0], jarak = Math.abs(proyeksi - tinggiDari(opsi[0]));
    for (var i = 1; i < opsi.length; i++) {
      var d = Math.abs(proyeksi - tinggiDari(opsi[i]));
      if (d < jarak) { jarak = d; terbaik = opsi[i]; }
    }
    return terbaik;
  }

  function terapkanStop(cfg, stop) {
    var e = elDari(cfg);
    if (!e) return;
    if (stop === STOP_CHIP) { minimize(cfg.id); return; }
    /* Sheet yang sedang jadi chip harus lebih dulu dilepas kelas
       minimalnya. Hanya menghapus --sheet-h tidak cukup: aturan
       .X-minimized mengunci `height: 36px` dan menimpa nilai custom
       property, jadi chip-nya akan tetap 36px meski kita snap ke tengah. */
    if (isMinimized(cfg.id)) restore(cfg.id);
    e.style.removeProperty('--sheet-h');
    if (stop === STOP_PENUH) e.style.setProperty('--sheet-h', 'calc(100dvh - ' + PLIH_DI_ATAS + 'px)');
    cerminTinggiKeMap(e);
    /* Sheet bisa berhenti di stop penuh tanpa lewat minimize() maupun
       restore(), jadi invalidateSize dipanggil di sini juga. Keduanya
       idempoten: timer sebelumnya dibatalkan lalu dijadwalkan ulang. */
    sinkronkanPeta();
  }

  function blokadeClick(e) {
    if (!e.addEventListener) return;
    var sekali = function (ev) {
      if (Date.now() - blokadeClick.saya < SELISIH_TUTUP) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      e.removeEventListener('click', sekali, true);
      delete blokadeClick.saya;
    };
    blokadeClick.saya = Date.now();
    e.addEventListener('click', sekali, true);
  }

  /* ── keyboard ──
     Hanya handle yang dibuat bisa difokus, dengan peran separator
     supaya pembaca layarunyikan tempat menggeser. Header JANGAN diberi
     role atau tabindex: isinya berisi tombol, dan memberi peran
     separator pada sebuah header akan membohongi bentuk linkunya.
     Sheet tanpa handle sendiri sudah mendapat handle di dalam
     header-nya, jadi semua dari delapan sheet punya handle. */
  function pasangAksesibilitas(cfg) {
    var h = di(cfg, cfg.handle);
    if (!h) return;
    if (h.tagName !== 'BUTTON' && !h.hasAttribute('tabindex')) h.setAttribute('tabindex', '0');
    h.setAttribute('role', 'separator');
    h.setAttribute('aria-orientation', 'horizontal');
    h.setAttribute('aria-label', 'Ubah tinggi panel');
    h.addEventListener('keydown', function (e) {
      if (!mobile() || !isOpen(cfg.id)) return;
      var hTengah = tinggiTengah(cfg);
      var penuh = window.innerHeight - PLIH_DI_ATAS;
      var h = tinggiSekarang(cfg);
      if (e.key === 'ArrowUp') { terapkanStop(cfg, h >= hTengah ? STOP_PENUH : STOP_TENGAH); e.preventDefault(); }
      else if (e.key === 'ArrowDown') {
        if (h <= hTengah) terapkanStop(cfg, STOP_CHIP);
        else terapkanStop(cfg, STOP_TENGAH);
        e.preventDefault();
      } else if (e.key === 'Home') { terapkanStop(cfg, STOP_TENGAH); e.preventDefault(); }
      else if (e.key === 'End') { terapkanStop(cfg, STOP_PENUH); e.preventDefault(); }
      else if (e.key === 'Escape') { if (h > hTengah) terapkanStop(cfg, STOP_TENGAH); else minimize(cfg.id); e.preventDefault(); }
    });
  }

  /* ── pemasangan ── */
  function pasang(cfg) {
    var e = elDari(cfg);
    if (!e) return false;
    var z = zona(cfg);
    if (!z) return false;
    /* Listener pointerdown dipasang per sheet (zona gesernya berbeda),
       tapi pointermove/pointerup dipasang SATU KALI di window, bukan per
       sheet. Alasannya jari berhenti di sheet ketika keluar dari sheet saat
       sheet bergerak, jadi listener yang menempel di sheet akan kehilangan
       event di tengah gestur dan sheet-nya tersangkut separuh jalan. */
    /* Handle dan header dipasang BERPIKIRAN. Di markup, handle adalah
       sibling header, bukan anaknya, jadi pointerdown di handle tidak akan
       membubble ke header. Kalau hanya header yang didengarkan, gesekan
       yang dimulai dari handle (tempat jari paling wajar mendarat)
       akan mati diam-diam. Flag dipasang di sheet supaya keduanya tidak
       terpasang dua kali. */
    if (e.__sheetDragPasang) return true;
    e.__sheetDragPasang = true;
    var targets = [];
    var hd = di(cfg, cfg.handle);
    if (z) targets.push(z);
    if (hd && hd !== z) targets.push(hd);
    targets.forEach(function (t) {
      if (!t) return;
      t.classList.add('sheet-drag-zone');
      t.addEventListener('pointerdown', function (ev) { onDown(ev, cfg.id); });
    });
    pasangAksesibilitas(cfg);
    return true;
  }

  function pasangGlobal() {
    if (pasangGlobal.sudah) return;
    pasangGlobal.sudah = true;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function register(id, opts) {
    if (!id || !opts) return;
    pasangGlobal();
    var cfg = {
      id: id,
      el: opts.el || id,
      openClass: opts.openClass,
      minClass: opts.minClass,
      bodyOpen: opts.bodyOpen,
      bodyMin: opts.bodyMin,
      handle: opts.handle || '',
      header: opts.header || '',
      minButton: opts.minButton || '',
      labelMin: opts.labelMin,
      labelOpen: opts.labelOpen,
      tutupSaatMinimizeSemua: opts.tutupSaatMinimizeSemua === true,
      onOpen: opts.onOpen,
      onClose: opts.onClose,
      onMinimize: opts.onMinimize
    };
    if (!cfg.openClass || !cfg.minClass || !cfg.bodyOpen || !cfg.bodyMin) {
      lapis(id, 'register', new Error('kelas wajib belum lengkap'));
      return;
    }
    if (!DAFTAR[id]) URUT.push(id);
    DAFTAR[id] = cfg;
    delete cacheTengah[id];
    pasang(cfg);
  }

  /* Body resize (hwang ganti, device dirotasi) membatalkan tinggi px
     yang sedang di-drag, karena angka itu dihitung terhadap innerWidth
     dan innerHeight yang lama. */
  window.addEventListener('resize', function () {
    if (geser) return;                      /* biarkan drag berjalan */
    URUT.forEach(function (id) { delete cacheTengah[id]; });
    /* Chrome atas bisa berubah tinggi saat device dirotasi (quick layer
       bar membungkus atau tidak), jadi angka --map-chrome diukur ulang. */
    ukurChromeAtas();
    sinkronkanPeta();
  });

  window.SheetDrag = {
    register: register,
    buka: buka,
    close: close,
    minimize: minimize,
    restore: restore,
    toggle: toggle,
    toggleMinimize: toggleMinimize,
    minimizeAll: minimizeAll,
    minimizeTerbuka: minimizeTerbuka,
    isOpen: isOpen,
    isMinimized: isMinimized,
    adaYangTerbuka: adaYangTerbuka,
    sinkronkanPeta: sinkronkanPeta,
    isMobile: mobile,
    _daftar: DAFTAR
  };

  /* --------------------------------------------------------------------
   * Waktu sheet pertama benar-benar dibuka, pasang listener untuk sheet
   * yang daftarnya baru bisaresolve (elemen ada tapi header belum).
   * Pola boot ulang ini sama dengan modul lain di halaman ini.
   * ------------------------------------------------------------------- */
  function pasangSemua() {
    for (var i = 0; i < URUT.length; i++) pasang(DAFTAR[URUT[i]]);
  }
  if (typeof document !== 'undefined') {
    var boot = function () { pasangSemua(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
    /* Beberapa sheet dirender belakangan (kartu GeoFarm, daftar atribut).
       Pasang ulang sekali setelah halaman selesai, lalu lagi saat tab
       GeoTools benar-benar dibuka. */
    window.addEventListener('load', pasangSemua);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) pasangSemua();
    });
  }
})();
