/* Add the RUANGKITA donation card to application sheets. */
(function () {
  'use strict';

  /* '#ai-sheet .ais-sheet-body' sengaja tidak ada di daftar berikut: sheet Tanya
     Ruang tidak lagi menampilkan banner donasi. */
  var SHEET_CONTENTS = [
    '#hotspot-sheet .hs-sheet-body',
    '#geopangan-sheet .gp-sheet-body',
    '#transjakarta-sheet .tj-sheet-body',
    '#transjogja-sheet .tj-sheet-body',
    '#geotoolsSheetBody',
    '#geodataSheetBody',
    '#attr-table-sheet .at-sheet-body',
    '#drawSidebar .dm-sidebar-body',
    '#legendSidebarBody',
    '#polygonAnalysisList'
  ];

  function createDonationBanner() {
    var banner = document.createElement('div');
    banner.className = 'lc-donation-banner sheet-donation-banner';

    var message = document.createElement('div');
    message.className = 'lc-donation-copy';
    message.innerHTML = '<span class="lc-donation-eyebrow">DUKUNG PETA INDONESIA</span><strong class="lc-donation-text">Bantu RUANGKITA terus berkembang</strong><span class="lc-donation-note">Donasi Anda membantu biaya server, data, dan fitur baru.</span>';
    var mark = document.createElement('span');
    mark.className = 'lc-donation-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>';
    banner.append(mark, message);

    var buttons = document.createElement('div');
    buttons.className = 'lc-donation-btns';
    [
      { label: 'Donasi', href: 'https://saweria.co/ruangkita', className: 'lc-donation-saweria' },
      { label: 'PayPal', href: 'https://www.paypal.com/paypalme/panjidanutirto', className: 'lc-donation-paypal' }
    ].forEach(function (item) {
      var link = document.createElement('a');
      link.href = item.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      if (item.label === 'PayPal') link.setAttribute('aria-label', 'Donasi melalui PayPal');
      link.className = 'lc-donation-btn ' + item.className;
      link.textContent = item.label;
      buttons.appendChild(link);
    });
    banner.appendChild(buttons);
    return banner;
  }

  function addDonationBanners() {
    SHEET_CONTENTS.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (content) {
        var banner = content.querySelector(':scope > .sheet-donation-banner');
        if (!banner) {
          banner = createDonationBanner();
          content.insertBefore(banner, content.firstChild);
        }
      });
    });
  }

  /* Unit fluid DI ANTARA kartu pada empat tab GeoTools, bukan hanya setelah
     kartu pertama seperti sebelumnya.

Penempatan memakai iterasi children panel, bukan selektor :scope, karena
     indentasi HTML di index.html tidak konsisten: .georaster-card (baris 2445)
     memakai indent 12 sedangkan saudaranya .geotani-kta-card di indent 18,
     padahal keduanya anak langsung dari tab. Hanya panel.children yang bisa
     dipercaya.

     MAX_PER_TAB membatasi jumlah unit per tab. Tanpa batas itu GeoDisaster
     menghasilkan sebelas iklan dalam satu layar: kartu Cuaca Sekarang, tiga
     kartu GeoPulse, enam kartu CCTV, dan satu kartu gd. AdSense membatasi
     jumlah iklan per halaman, jadi nilainya sengaja dibatasi dan bisa
     dinaikkan dari satu konstanta di bawah. */
  var GEO_TOOLS_TABS = [
    { key: 'geonusa', id: 'geotoolsTabGeonusa', selectors: ['.geonusa-card', '.geotrans-card'] },
    { key: 'geoportal', id: 'geotoolsTabGeoportal', selectors: ['.geotani-kta-card', '.georaster-card', '.geoportal-card'] },
    { key: 'geofarm', id: 'geotoolsTabGeoFarm', selectors: ['.geofarm-card', '.geofarm-ref', '.geopangan-card'] },
    { key: 'geodisaster', id: 'geotoolsTabGeoDisaster', selectors: ['.cctv-card', '.geopulse-card', '.geonusa-card'] }
  ];

  var MAX_PER_TAB = 5;

  function addGeoToolsInlineAds() {
    GEO_TOOLS_TABS.forEach(function (tab) {
      var panel = document.getElementById(tab.id);
      if (!panel) return;
      /* Disalin dulu: menyisipkan saat iterasi akan membuat array ikut
         bergeser dan unit berikutnya tertunjuk pada ad yang baru dibuat. */
      var nodes = Array.prototype.slice.call(panel.children);
      /* Batas dihitung dari unit yang SUDAH ADA, bukan dari yang ditambahkan
         pada panggilan ini. Kalau hanya menghitung penambahan, pemanggilan
         kedua akan lolos lagi di bawah batas dan menyisip unit tambahan --
         tiap pemanggilan menambah iklan baru. */
      var placed = panel.querySelectorAll('.geotools-inline-adsense').length;
      nodes.forEach(function (node) {
        if (placed >= MAX_PER_TAB) return;
        if (!node.matches) return;
        var isCard = tab.selectors.some(function (sel) { return node.matches(sel); });
        if (!isCard) return;
        var next = node.nextElementSibling;
        if (next && next.classList.contains('geotools-inline-adsense')) return;
        var ad = createAdUnit();
        ad.classList.add('geotools-inline-adsense', 'geotools-inline-adsense--' + tab.key);
        node.insertAdjacentElement('afterend', ad);
        dorongSlotIklan(ad);
        placed++;
      });
    });
  }

  /* Unit di tiga sheet alat: Draw & Ukur, Tabel Atribut, dan Legenda.

     Letak masing-masing dipilih karena isi sheet itu dibangun berbeda:

     - Draw & Ukur (#drawSidebar .dm-sidebar-body) kartunya statis di
       index.html, jadi unit cukup disisipkan di akhir badan.

     - Tabel Atribut (#attr-table-sheet .at-sheet-body) isinya #at-sheet-content
       yang ditulis ulang setiap kali tabel digambar ulang. Karena itu unit
       TIDAK boleh masuk ke #at-sheet-content, cukup jadi saudara sesudahnya di
       .at-sheet-body -- begitu isi tabel berganti, unitnya tetap ada.
         Perhatikan sheet ini sudah punya iklan sendiri dari attribute-table.js
(slot 1306506445) di bawah kolom pencarian; yang ditambah di sini
        menempati posisi berbeda, yaitu dasar sheet.

     - Legenda (#legendSidebarBody) memakai pola PINDAH: onOpen memindahkan
       semua anak .legend-body ke body sidebar, onClose memindahkannya semua
       kembali (map-core.js). Unit yang disisipkan DI DALAM body akan ikut
       terbawa ke .legend-body dan muncul di kontrol legenda di peta walau sheet
       sudah ditutup. Jadi unitnya dibuat saudara SESUDAH body, di dalam
       #legendSidebar, yang tidak pernah disentuh pola pindah itu. Karena
       .lg-sidebar-body memakai flex:1 1 auto, unit ini tertempel di dasar
       sidebar. */

  /* Unit tepat di bawah tombol "Export SHP" pada kartu "Geospasial
  Indonesia" di tab GeoPortal.
  
  Berbeda dengan tiga unit di atas, unit ini harus mengikuti tampilan
  tombolnya. syncSHPExportButton() di satupeta-downloader.js hanya menulis
  style.display dan disabled pada tombol, tanpa pernah menyinggung modul
  iklan, jadi iklannya akan terlihat walau belum ada data yang bisa
  diekspor -- iklan yatim yang tidak ada konteksnya. Observer di bawah
  menjembataninya tanpa mengubah satupeta-downloader.js sama sekali. */
  function addGeoPortalExportShpAd() {
    var button = document.getElementById('satupetaExportShpBtn');
    if (!button || !button.parentNode) return;
    var next = button.nextElementSibling;
    if (next && next.classList.contains('satupeta-export-shp-adsense')) return;
    var ad = createAdUnit();
    ad.classList.add('satupeta-export-shp-adsense');
    ad.setAttribute('aria-label', 'Iklan');
    button.insertAdjacentElement('afterend', ad);

    var apply = function () {
      ad.style.display = (button.style.display !== 'none' && !button.disabled) ? '' : 'none';
    };
    apply();
    if ('MutationObserver' in window) {
      new MutationObserver(apply)
        .observe(button, { attributes: true, attributeFilter: ['style', 'disabled'] });
    }
    dorongSlotIklan(ad);
  }
  var TOOL_SHEET_AD_PLACEMENTS = [
    { key: 'alat-ukur', anchor: '#drawSidebar .dm-sidebar-body', position: 'beforeend' },
    { key: 'tabel', anchor: '#attr-table-sheet .at-sheet-body', position: 'beforeend' },
    { key: 'legenda', anchor: '#legendSidebarBody', position: 'afterend' }
  ];

  function addToolSheetAds() {
    TOOL_SHEET_AD_PLACEMENTS.forEach(function (placement) {
      var el = document.querySelector(placement.anchor);
      if (!el || !el.parentNode) return;
      var marker = 'tool-sheet-adsense--' + placement.key;
      var neighbour = placement.position === 'afterend'
        ? el.nextElementSibling
        : el.lastElementChild;
      if (neighbour && neighbour.classList.contains('tool-sheet-adsense')) return;
      var ad = createAdUnit();
      ad.classList.add('tool-sheet-adsense', marker);
      ad.setAttribute('aria-label', 'Iklan');
      el.insertAdjacentElement(placement.position, ad);
      dorongSlotIklan(ad);
    });
  }

  /* Unit fluid di sheet GeoData.

     Sheet GeoData tidak ikut placement addGeoToolsInlineAds() di bawah: tabnya
     berawalan "alat-tab-" (alat-tab-arcgis-rest, alat-tab-geoserver), bukan
     "geotoolsTab". Jadi unitnya ditambahkan sendiri dengan anchor berupa id
     elemen, bukan berupa kartu tempat kartu disisipkan.

     afterend dipakai untuk dua tombol "Export SHP". Di tab ArcGIS tombol itu
     berada di dalam grid aksi, sehingga unit menjadi baris grid berikutnya dan
     ikut memakai gap yang sama dengan tombol lain, tanpa CSS tambahan.

     beforebegin dipakai untuk kartu "Layer Dimuat". Anchor-nya #alatLayerList
     yang berada DI DALAM kartu itu, sedangkan yang harus didahului adalah kartu
     seluruhnya, jadi elemen sasaran dinaikkan lewat closest() lebih dulu. */
  var GEODATA_AD_PLACEMENTS = [
    { key: 'arcgis', anchor: '#arcgisExportSelectedBtn', position: 'afterend' },
    { key: 'geoserver', anchor: '#geoserverExportBtn', position: 'afterend' },
    { key: 'layer-dimuat', anchor: '#alatLayerList', position: 'beforebegin', climb: '.alat-card' },
    { key: 'layer-bawah', anchor: '#alatLayerList', position: 'afterend', climb: '.alat-card' },
    { key: 'display', anchor: '#geodataSheetBody', position: 'beforeend' }
  ];

  function addGeoDataAds() {
    GEODATA_AD_PLACEMENTS.forEach(function (placement) {
      var el = document.querySelector(placement.anchor);
      if (!el) return;
      var target = (placement.climb && el.closest) ? (el.closest(placement.climb) || el) : el;
      if (!target.parentNode) return;
      var sibling = placement.position === 'beforebegin'
        ? target.previousElementSibling
        : target.nextElementSibling;
      if (sibling && sibling.classList.contains('geodata-menu-adsense')) return;
      var ad = createAdUnit();
      ad.classList.add('geodata-menu-adsense', 'geodata-menu-adsense--' + placement.key);
      ad.setAttribute('aria-label', 'Iklan');
      target.insertAdjacentElement(placement.position, ad);
      dorongSlotIklan(ad);
    });
  }

  /* Unit fluid untuk posisi di antara kartu GeoTools. Loader AdSense hanya
     dimuat sekali di <head> index.html. */
  function createAdUnit() {
    var wrap = document.createElement('div');
    wrap.className = 'lc-adsense sheet-adsense';
    wrap.innerHTML = '<!-- Ruang Kita -->' +
      '<ins class="adsbygoogle" style="display:block"' +
      ' data-ad-format="fluid"' +
      ' data-ad-layout-key="-fb+5w+4e-db+86"' +
      ' data-ad-client="ca-pub-7501816933195235"' +
      ' data-ad-slot="5975101505"></ins>';
    return wrap;
  }

  /* <script> yang disuntik lewat innerHTML tidak pernah dieksekusi
     browser, jadi push AdSense dijalankan sebagai kode biasa.

     Push-nya ditunda sampai sheet benar-benar terlihat. Seluruh sheet
     masih tersembunyi saat halaman dimuat, dan <ins> yang didorong dalam
     keadaan tersembunyi diisi tinggi nol oleh AdSense lalu tidak pernah
     dirender ulang -- slotnya jadi kosong terus meski sheet dibuka. */
  function dorongSlotIklan(ad) {
    if (!('IntersectionObserver' in window)) { dorongSekarang(ad); return; }
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        io.disconnect();
        dorongSekarang(ad);
        return;
      }
    }, { rootMargin: '100px' });
    io.observe(ad);
  }

  /* Sekali per unit. AdSense menghitung tiap push sebagai permintaan
     tayang, jadi push kedua pada <ins> yang sama hanya membuang kuota. */
  function dorongSekarang(ad) {
    if (ad.dataset.terdorong === '1') return;
    ad.dataset.terdorong = '1';
    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch (e) { /* slot gagal diisi, biarkan */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      addDonationBanners();
      addGeoToolsInlineAds();
      addGeoDataAds();
      addToolSheetAds();
      addGeoPortalExportShpAd();
    }, { once: true });
  } else {
    addDonationBanners();
    addGeoToolsInlineAds();
    addGeoDataAds();
    addToolSheetAds();
    addGeoPortalExportShpAd();
  }
  window.addEventListener('resize', addDonationBanners, { passive: true });
})();
