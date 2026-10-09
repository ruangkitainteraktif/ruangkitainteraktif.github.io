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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addDonationBanners, { once: true });
  } else {
    addDonationBanners();
  }
  window.addEventListener('resize', addDonationBanners, { passive: true });
})();
