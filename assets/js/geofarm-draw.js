(function () {
  'use strict';

  var TAB_ID = 'geotoolsTabGeoFarm';

  // Handler draw:drawstop yang masih terpasang untuk sesi gambar berjalan.
  // Disimpan di luar activate() supaya bisa dilepas dari panel: kalau tool
  // gambar dicabut dari luar, DRAWSTOP tidak pernah menyala dan listener-nya
  // akan menumpuk tiap kali GeoFarm dibuka lagi.
  var pendingStop = null;
  var stopTimer = 0;

  function clearPendingStop() {
    var m = getMap();
    if (pendingStop) {
      document.removeEventListener('draw:drawstop', pendingStop);
      if (m && window.L && window.L.Draw) m.off(L.Draw.Event.DRAWSTOP, pendingStop);
      pendingStop = null;
    }
    if (stopTimer) { clearTimeout(stopTimer); stopTimer = 0; }
  }

  function getMap() {
    return window.map || (typeof map !== 'undefined' ? map : null);
  }

  function showGeoFarmTab() {
    try {
      var dd = document.querySelector('.geotools-dropdown');
      if (dd) {
        dd.value = TAB_ID;
        dd.dispatchEvent(new Event('change'));
      }
      if (typeof window.openTab === 'function') window.openTab(null, 'tab-geotools');
    } catch (e) {
      console.warn('[GeoFarm] Gagal beralih ke tab GeoFarm:', e);
    }
  }

  /**
   * Mengembalikan GeoTools ke tab GeoFarm setelah sesi gambar selesai.
   *
   * Sheet analisis tidak muncul otomatis setelah polygon dibuat, jadi
   * tombol "Buka Analisis" di tab ini adalah satu-satunya jalan membukanya.
   * Tanpa langkah ini user selesai menggambar lalu dibiarkan menatap peta
   * kosong tanpa petunjuk ke mana harus pergi.
   *
   * Dua hal yang harus dilakukan, dan urutannya penting:
   * 1. Buka #geotools-sheet. Hook onOpen-nya memindahkan isi #tab-geotools
   *    ke dalam sheet, jadi sheet harus benar-benar terbuka lebih dulu.
   * 2. Set dropdown ke tab GeoFarm. Hook onOpen tidak menyentuh tab utama,
   *    dan openTab() sengaja tidak dipakai di sini: isinya sudah pindah ke
   *    sheet, jadi membuka sidebar kiri hanya menampilkan tab kosong.
   */
  function returnToGeoFarmTab() {
    try {
      if (typeof window.openGeotoolsSheet === 'function') {
        window.openGeotoolsSheet();
      }
      var dd = document.querySelector('.geotools-dropdown');
      if (dd && dd.value !== TAB_ID) {
        dd.value = TAB_ID;
        dd.dispatchEvent(new Event('change'));
      }
      var m = getMap();
      if (m) setTimeout(function () { m.invalidateSize(); }, 300);
    } catch (e) {
      console.warn('[GeoFarm] Gagal kembali ke tab GeoFarm:', e);
    }
  }

  function revealDrawChrome() {
    document.body.classList.remove('draw-chrome-hidden');
    document.body.classList.add('geofarm-draw-active');
  }

  /**
   * Sesi gambar GeoFarm selesai -- baik polygon berhasil dibuat maupun
   * dibatalkan dari toolbar.
   *
   * Class 'geofarm-draw-active' WAJIB dilepas di sini. Aturannya di app.css
   * memakai display:block !important pada .leaflet-draw, jadi selama class itu
   * masih menempel, syncDrawChrome() tidak bisa menyembunyikan toolbar dan
   * .draw-actions-wrap tetap tersembunyi. Akibatnya toolbar tertinggal di peta
   * tanpa tombol export maupun tombol clear/sembunyikan.
   *
   * Pemanggilan setDrawHideExportActions(false) di bawah mengembalikan tombol
   * export toolbar, yang disembunyikan lagi saat activate() di bawah.
   *
   * Dipakai juga ketika pengguna membatalkan gambar secara eksplisit.
   * Versi lama salah: menghapus class itu lalu memanggil revealDrawChrome()
   * yang langsung menambahkannya kembali.
   */
  function endGeofarmDrawSession() {
    // Tutup penanda sesi lebih dulu: registerDrawnPolygon() memakainya sebagai
    // gerbang, dan draw:created bisa menyala kapan saja selama kontrol masih
    // terpasang.
    if (typeof window.setGeofarmDrawSession === 'function') {
      window.setGeofarmDrawSession(false);
    }
    document.body.classList.remove('geofarm-draw-active');
    // Kembalikan tombol Export SHP/GeoJSON yang disembunyikan saat aktivasi.
    if (typeof window.setDrawHideExportActions === 'function') {
      try { window.setDrawHideExportActions(false); } catch (e) { /* abaikan */ }
    }
    // stopDrawSession() melepas kontrol gambar, menyetel ulang drawSessionActive,
    // lalu memanggil syncDrawChrome() sehingga toolbar ikut hilang kalau tidak
    // ada sesi lain yang aktif.
    if (typeof window.stopDrawSession === 'function') {
      try { window.stopDrawSession(); } catch (e) {
        console.warn('[GeoFarm] Gagal mengakhiri sesi gambar:', e);
      }
    }
  }

  function markButtonBusy(on) {
    var btn = document.getElementById('geofarmDrawPolygonBtn');
    if (!btn) return;
    btn.disabled = !!on;
    btn.style.opacity = on ? '.6' : '';
    btn.style.cursor = on ? 'progress' : '';
  }

  function positionControl() {
    var m = getMap();
    if (!m) return;
    var corner = m.getContainer().querySelector('.leaflet-bottom.leaflet-left');
    var control = corner && corner.querySelector('.leaflet-draw');
    if (control) {
      control.style.bottom = '10px';
      control.style.top = 'auto';
    }
  }

  // Di desktop .collapsed sudah memakai translateX(-100%) sehingga sidebar
  // hilang penuh. Pakai toggle utama agar ikon tombol & ukuran Leaflet sinkron.
  // Sidebar GeoTools diminimalkan saat menggambar agar peta punya ruang
  // fullest. Dipakai toggle utama agar ikon tombol & ukuran Leaflet sinkron.
  //
  // Penting: openGeotoolsSheet() memindahkan seluruh isi #tab-geotools keluar
  // dari #sidebar-left ke dalam #geotools-sheet (map-core.js). Jadi saat
  // GeoTools dibuka lewat FAB, tombol "Buat Polygon" berada di sheet, bukan di
  // sidebar-left. Menutup #sidebar-left saja tidak terlihat efeknya, sheet
  // tetap menutupi peta. Karena itu sheet ikut ditutup.
  //
  // Dipakai close (bukan minimize) sesuai permintaan: sheet benar-benar hilang
  // dari peta. Isinya dikembalikan ke #tab-geotools, dan bisa dibuka lagi lewat
  // tombol GeoTools di FAB.
  // Sheet yang diminimalkan tetap menyisakan gs-sheet-open (keputusan
  // konvensi di sheet-drag.js), jadi kedua kelas harus dicek. Kalau hanya
  // gs-sheet-open yang dicek, sheet yang sudah jadi chip ikut ditutup dan
  // kontennya dipindah balik ke #tab-geotools.
  function hideGeoToolsSidebar() {
    var sidebar = document.getElementById('sidebar-left');
    var sheet = document.getElementById('geotools-sheet');
    if (sheet && sheet.classList.contains('gs-sheet-open') && !sheet.classList.contains('gs-sheet-minimized')) {
      if (typeof window.closeGeotoolsSheet === 'function') window.closeGeotoolsSheet();
    }
    if (sidebar && !sidebar.classList.contains('collapsed')) {
      if (typeof window.toggleSidebar === 'function') {
        window.toggleSidebar();
      } else {
        sidebar.classList.add('collapsed');
      }
    }
    var m = getMap();
    if (m) setTimeout(function () { m.invalidateSize(); }, 300);
  }

  // openTab() selalu memaksa basemap ke google-maps, jadi kembalikan ke
  // Google Satellite setelah pindah tab.
  function useSatelliteBasemap() {
    try {
      if (typeof window.setBaseMap === 'function') window.setBaseMap('google-satellite-kh');
    } catch (e) {
      console.warn('[GeoFarm] Gagal mengganti basemap:', e);
    }
  }

  function activate() {
    showGeoFarmTab();
    useSatelliteBasemap();

    var m = getMap();
    if (!m || !window.L || !window.L.Draw) {
      markButtonBusy(false);
      return;
    }

    try {
      /* Tombol Export SHP/GeoJSON disembunyikan di sesi GeoFarm. Ekspor
         GeoFarm punya tempat sendiri: bar di bagian bawah sheet panel,
         yang membawa atribut analisis (lihat exportGeoFarmShapes di
         polygon-analysis.js). Tombol di toolbar hanya mengekspor gambar &
         pengukuran biasa, jadi disembunyikan agar tidak membingungkan. */
      if (typeof window.setDrawHideExportActions === 'function') {
        window.setDrawHideExportActions(true);
      }
      if (typeof window.startDraw === 'function') {
        // Tandai sesi GeoFarm tepat sebelum kontrol gambar dipasang. Dari titik
        // ini polygon hasil gambar dianalisis GeoFarm. Tanpa penanda ini,
        // polygon dari tool "Gambar & Ukur" juga memicu analisis yang sama
        // karena keduanya bergantung pada event draw:created yang sama.
        if (typeof window.setGeofarmDrawSession === 'function') {
          window.setGeofarmDrawSession(true);
        }
        window.startDraw('polygon');
      } else {
        // Tanpa startDraw tidak ada kontrol gambar, jadi tidak akan ada
        // draw:created. Jangan nyalakan penanda; kalau tidak, polygon dari
        // tool gambar lain ikut teranalisis.
        if (typeof window.setGeofarmDrawSession === 'function') {
          window.setGeofarmDrawSession(false);
        }
        revealDrawChrome();
      }
    } catch (e) {
      console.warn('[GeoFarm] Gagal mengaktifkan tool gambar polygon:', e);
      if (typeof window.setGeofarmDrawSession === 'function') {
        window.setGeofarmDrawSession(false);
      }
      revealDrawChrome();
    }

    revealDrawChrome();
    hideGeoToolsSidebar();
    markButtonBusy(true);

    setTimeout(positionControl, 120);

    var stop = function () {
      clearPendingStop();
      endGeofarmDrawSession();
      markButtonBusy(false);
      // Kembalikan sheet GeoTools ke tab GeoFarm. Sheet analisis tidak
      // dibuka otomatis; tombol "Buka Analisis" di tab itu yang memanggilnya.
      returnToGeoFarmTab();
    };
    pendingStop = stop;

    m.on(L.Draw.Event.DRAWSTOP, stop);
    stopTimer = setTimeout(clearPendingStop, 120000);
  }

  window.startGeofarmPolygonDraw = function () {
    activate();
  };

  window.cancelGeofarmPolygonDraw = function () {
    // Pemcleanupannya sama dengan selesai secara alami, supaya tidak ada jalur
    // yang meninggalkan toolbar tanpa tombol clear.
    endGeofarmDrawSession();
    var m = getMap();
    if (m && window.L && window.L.Draw) {
      var groups = [];
      m.eachControl(function (c) { groups.push(c); });
      groups.forEach(function (c) {
        if (c instanceof L.Control.Draw) m.removeControl(c);
      });
    }
    markButtonBusy(false);
    // Dibatalkan bukan berarti selesai menggambar, tapi user tetap
    // dikembalikan ke tab GeoFarm supaya tidak tertinggal di peta tanpa
    // ada yang terbuka. invalidateSize ikut dikerjakan di sana.
    returnToGeoFarmTab();
  };
})();
