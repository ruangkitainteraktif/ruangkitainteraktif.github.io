/* Add the RUANGKITA donation card to application sheets. */
(function () {
  'use strict';

  var SHEET_CONTENTS = [
    '#hotspot-sheet .hs-sheet-body',
    '#geopangan-sheet .gp-sheet-body',
    '#transjakarta-sheet .tj-sheet-body',
    '#transjogja-sheet .tj-sheet-body',
    '#geotoolsSheetBody',
    '#geodataSheetBody',
    '#attr-table-sheet .at-sheet-body',
    '#ai-sheet .ais-sheet-body',
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
      { label: 'Donasi', href: 'https://saweria.co/maspannn', className: 'lc-donation-saweria' },
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

  /* Unit tambahan disisipkan setelah kartu pertama pada tiap tab. Anchor
     berada di dalam konten tab, jadi slot ikut berpindah ke sheet GeoTools. */
  function addGeoToolsInlineAds() {
    var placements = [
      { tab: 'geotoolsTabGeonusa', anchor: ':scope > .geonusa-card', key: 'geonusa' },
      { tab: 'geotoolsTabGeoportal', anchor: ':scope > .geotani-kta-card', key: 'geoportal' },
      { tab: 'geotoolsTabGeoFarm', anchor: ':scope > .geofarm-card', key: 'geofarm' },
      { tab: 'geotoolsTabGeoDisaster', anchor: '#weather-card-sekarang', key: 'geodisaster' }
    ];
    placements.forEach(function (placement) {
      var tab = document.getElementById(placement.tab);
      if (!tab || tab.querySelector('.geotools-inline-adsense--' + placement.key)) return;
      var card = tab.querySelector(placement.anchor);
      if (!card) return;
      var ad = createAdUnit();
      ad.classList.add('geotools-inline-adsense', 'geotools-inline-adsense--' + placement.key);
      card.insertAdjacentElement('afterend', ad);
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
    }, { once: true });
  } else {
    addDonationBanners();
    addGeoToolsInlineAds();
  }
  window.addEventListener('resize', addDonationBanners, { passive: true });
})();
