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
  var AMBANG_GESER = 6;      /* px; sebelum ini masih dianggap tap */
  var SELISIH_TUTUP = 320;   /* ms; blkade click setelah drag selesai */

  var DAFTAR = {};           /* id -> konfigurasi */
  var URUT = [];             /* id terdaftar, untuk iterasi yang stabil */
  var geser = null;          /* state gestur yang sedang berjalan */
  var rafTinggi = 0;
  var yRaf = 0;
  var desktopResize = null;

  /* Resize sheet kanan dari tepi kirinya pada desktop. */
  var SELECTOR_SHEET_DESKTOP = '#hotspot-sheet,#geopangan-sheet,#transjakarta-sheet,#transjogja-sheet,#geotools-sheet,#geodata-sheet,#attr-table-sheet,#ai-sheet,.dm-sidebar,.lg-sidebar,.pa-panel';
  document.addEventListener('pointerdown', function (e) {
    if (window.innerWidth <= BATAS_MOBILE || e.button !== 0) return;
    var sheet = e.target.closest && e.target.closest(SELECTOR_SHEET_DESKTOP);
    if (!sheet || e.clientX - sheet.getBoundingClientRect().left > 10) return;
    if (sheet.classList.contains('sheet-minimized') || sheet.classList.contains('gs-sheet-minimized') || sheet.classList.contains('geodata-sheet-minimized') || sheet.classList.contains('attr-table-sheet-minimized') || sheet.classList.contains('ais-sheet-minimized') || sheet.classList.contains('dm-sidebar-minimized') || sheet.classList.contains('lg-sidebar-minimized') || sheet.classList.contains('pa-min')) return;
    desktopResize = { sheet: sheet, x: e.clientX, width: sheet.getBoundingClientRect().width };
    sheet.classList.add('desktop-sheet-resizing');
    try { sheet.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  });
  window.addEventListener('pointermove', function (e) {
    if (!desktopResize) return;
    var width = Math.max(240, Math.min(window.innerWidth * 0.5, desktopResize.width + desktopResize.x - e.clientX));
    desktopResize.sheet.style.setProperty('--desktop-sheet-width', width + 'px');
    document.body.style.setProperty('--desktop-sheet-width', width + 'px');
  });
  function selesaiResizeDesktop() {
    if (!desktopResize) return;
    desktopResize.sheet.classList.remove('desktop-sheet-resizing');
    desktopResize = null;
    sinkronkanPeta();
  }
  window.addEventListener('pointerup', selesaiResizeDesktop);
  window.addEventListener('pointercancel', selesaiResizeDesktop);

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

     Dicermin hanya setelah drag selesai (keTengah dan terapkanTinggi), bukan
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
    document.body.classList.remove('sheet-dragging');
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

  /* Susun chip minimize dan pindahkan ke atas sheet yang sedang aktif.
     Sebelumnya semua panel memakai bottom tetap yang sama, sehingga chip
     lama tertumpuk atau tertutup saat sheet baru dibuka. */
  function aturPosisiChipMinim() {
    var chips = [];
    var activeTop = Infinity;
    for (var i = 0; i < URUT.length; i++) {
      var id = URUT[i];
      var sheet = elDari(DAFTAR[id]);
      if (!sheet) continue;
      if (isOpen(id) && isMinimized(id)) chips.push(sheet);
      else sheet.style.removeProperty('bottom');
      if (isOpen(id) && !isMinimized(id) && mobile()) {
        activeTop = Math.min(activeTop, sheet.getBoundingClientRect().top);
      }
    }

    chips.forEach(function (chip, index) {
      var bottom = mobile() ? 72 : 68;
      if (mobile() && activeTop !== Infinity) {
        bottom = Math.max(bottom, window.innerHeight - activeTop + 8);
      }
      chip.style.setProperty('bottom', (bottom + index * 44) + 'px', 'important');
    });
  }

  /* Dipanggil setiap kali state sheet berubah. Selain menyalakan kelas
     body, menjadwalkan map.invalidateSize() setelah transisi area peta
     selesai: tinggi di mobile dan lebar di desktop sama-sama berubah. */
  var _timerSinkron = 0;
  var _mobileSheetPanY = 0;
  function sinkronkanPusatPetaMobile(m) {
    var targetPanY = 0;
    if (mobile()) {
      var mapEl = document.getElementById('map');
      if (mapEl) {
        var mapRect = mapEl.getBoundingClientRect();
        var activeSheet = null;
        for (var i = 0; i < URUT.length; i++) {
          var id = URUT[i];
          if (!isOpen(id) || isMinimized(id)) continue;
          var sheetEl = elDari(DAFTAR[id]);
          if (sheetEl && (!activeSheet || sheetEl.getBoundingClientRect().top < activeSheet.getBoundingClientRect().top)) activeSheet = sheetEl;
        }
        if (activeSheet) {
          var sheetTop = activeSheet.getBoundingClientRect().top;
          var chrome = parseFloat(getComputedStyle(mapEl).getPropertyValue('--map-chrome')) || 0;
          var targetCenterY = (mapRect.top + chrome + sheetTop) / 2;
          targetPanY = mapRect.top + mapRect.height / 2 - targetCenterY;
        }
      }
    }
    var delta = targetPanY - _mobileSheetPanY;
    if (Math.abs(delta) > 1 && m && typeof m.panBy === 'function') {
      m.panBy([0, delta], { animate: false });
    }
    _mobileSheetPanY = targetPanY;
  }

  function sinkronkanPeta() {
    document.body.classList.toggle('sheet-terbuka', adaYangTerbuka());
    aturPosisiChipMinim();
    ukurChromeAtas();
    clearTimeout(_timerSinkron);
    _timerSinkron = setTimeout(function () {
      aturPosisiChipMinim();
      var m = window.map;
      if (m && typeof m.invalidateSize === 'function') {
        m.invalidateSize({ pan: false });
        sinkronkanPusatPetaMobile(m);
      }
    }, 340);
  }

  /* Jalankan FlyTo setelah ukuran peta selesai mengikuti sheet. Pada mobile
     tinggi peta berubah, sedangkan desktop lebarnya berubah; menghitung
     bounds selama transisi membuat pusat target bergeser dari ruang yang
     terlihat di antara search bar dan sheet. */
  function flyToBoundsInVisibleMap(bounds, options) {
    var run = function () {
      var m = window.map || window._map;
      if (!m || !bounds || !bounds.isValid || !bounds.isValid()) return;
      if (typeof m.invalidateSize === 'function') m.invalidateSize({ pan: false });
      m.flyToBounds(bounds, options || {});
    };
    if (document.body.classList.contains('sheet-terbuka')) {
      setTimeout(run, 380);
    } else if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () { window.requestAnimationFrame(run); });
    } else {
      setTimeout(run, 0);
    }
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
      geser: false,
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
      document.body.classList.add('sheet-dragging');
    }
    yRaf = e.clientY;
    if (!rafTinggi) {
      rafTinggi = requestAnimationFrame(function () {
        rafTinggi = 0;
        if (!geser) return;
        geser.sheet.style.setProperty('--sheet-h', hitungTinggi(geser) + 'px');
        /* Map and sheet are siblings, so mirror the live height on each
           frame. invalidateSize stays deferred until release to avoid
           recalculating Leaflet's layout for every pointer event. */
        cerminTinggiKeMap(geser.sheet);
      });
    }
    if (e.cancelable) e.preventDefault();
  }

  function hitungTinggi(g) {
    var dy = yRaf - g.y0;
    var h = g.h0 - dy;
    var min = window.innerHeight * 0.1;
    var maks = window.innerHeight * 0.9;
    if (h < min) h = min;
    if (h > maks) h = maks;
    return h;
  }

  function onUp(e) {
    if (!geser || e.pointerId !== geser.pointerId) return;
    if (rafTinggi) { cancelAnimationFrame(rafTinggi); rafTinggi = 0; }
    var g = geser;
    geser = null;
    document.body.classList.remove('sheet-dragging');
    try { if (g.sheet.releasePointerCapture && e.pointerId !== undefined) g.sheet.releasePointerCapture(e.pointerId); } catch (err) { /* tidak fatal */ }
    if (!g.geser) { g.sheet.classList.remove('is-dragging'); return; }

    var h = g.sheet.getBoundingClientRect().height;
    g.sheet.classList.remove('is-dragging');
    if (h <= window.innerHeight * 0.1 + 2) minimize(g.cfg.id);
    else terapkanTinggi(g.cfg, h);
    /* Swipe yang berakhir sebagai drag tidak boleh ikut memicu onclick
       header, karena 3 dari 5 handle lama memakai onclick untuk menutup
       sheet. */
    blokadeClick(g.sheet);
  }

  function terapkanTinggi(cfg, tinggi) {
    var e = elDari(cfg);
    if (!e) return;
    if (isMinimized(cfg.id)) restore(cfg.id);
    var minimum = window.innerHeight * 0.1;
    var maksimum = window.innerHeight * 0.9;
    tinggi = Math.max(minimum, Math.min(maksimum, tinggi));
    e.style.setProperty('--sheet-h', tinggi + 'px');
    cerminTinggiKeMap(e);
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
      var h = tinggiSekarang(cfg);
      if (e.key === 'ArrowUp') { terapkanTinggi(cfg, h + 24); e.preventDefault(); }
      else if (e.key === 'ArrowDown') { terapkanTinggi(cfg, h - 24); e.preventDefault(); }
      else if (e.key === 'Home') { terapkanTinggi(cfg, window.innerHeight * 0.1); e.preventDefault(); }
      else if (e.key === 'End') { terapkanTinggi(cfg, window.innerHeight * 0.9); e.preventDefault(); }
      else if (e.key === 'Escape') { minimize(cfg.id); e.preventDefault(); }
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
    pasang(cfg);
  }

  /* Body resize (hwang ganti, device dirotasi) membatalkan tinggi px
     yang sedang di-drag, karena angka itu dihitung terhadap innerWidth
     dan innerHeight yang lama. */
  window.addEventListener('resize', function () {
    if (geser) return;                      /* biarkan drag berjalan */
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
    flyToBoundsInVisibleMap: flyToBoundsInVisibleMap,
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
