/* Reuse the Layer Catalog donation banner across application sheets. */
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
    message.className = 'lc-donation-text';
    message.textContent = 'Dukung RuangKita';
    banner.appendChild(message);

    var buttons = document.createElement('div');
    buttons.className = 'lc-donation-btns';
    [
      { label: 'Saweria', href: 'https://saweria.co/maspannn', className: 'lc-donation-saweria' },
      { label: 'PayPal', href: 'https://www.paypal.com/paypalme/panjidanutirto', className: 'lc-donation-paypal' }
    ].forEach(function (item) {
      var link = document.createElement('a');
      link.href = item.href;
      link.target = '_blank';
      link.rel = 'noopener';
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
        var sheet = content.parentElement;
        var banner = sheet.querySelector(':scope > .sheet-donation-banner');
        if (!banner) {
          banner = createDonationBanner();
          var header = Array.prototype.find.call(sheet.children, function (child) {
            return /(?:^|\s)(?:[\w-]*-head|pa-head)(?:\s|$)/.test(child.className || '');
          });
          if (header) header.insertAdjacentElement('afterend', banner);
          else content.insertBefore(banner, content.firstChild);
        }
        banner.style.margin = '0 0 12px';
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
