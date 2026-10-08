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

  function createSponsoredAd(sheet) {
    var ad = document.createElement('section');
    ad.className = 'lc-sponsored-ad sheet-sponsored-ad';
    ad.setAttribute('aria-label', 'Iklan');
    ad.innerHTML = '<button class="lc-ad-close" type="button" aria-label="Tutup iklan" title="Tutup iklan">&times;</button><div class="lc-sponsored-copy"><span class="lc-sponsored-tag">IKLAN</span><span class="lc-sponsored-title">Temukan sesuatu yang menarik</span></div><div class="lc-ad-viewport"><div class="lc-ad-frame"></div></div>';
    ad.querySelector('.lc-ad-close').addEventListener('click', function (event) {
      event.stopPropagation();
      sheet.dataset.sponsoredAdDismissed = 'true';
      if (ad._resizeObserver) ad._resizeObserver.disconnect();
      ad.remove();
    });
    var frame = ad.querySelector('.lc-ad-frame');
    var viewport = ad.querySelector('.lc-ad-viewport');
    var activeFormat = null;
    function fitAd() {
      var availableWidth = viewport.clientWidth;
      if (availableWidth <= 0) return;
      var format = availableWidth < 390
        ? { key: '126b894c6f9b5f5e3acca47557d0c389', width: 320, height: 50 }
        : availableWidth < 600
          ? { key: 'caa684f2f6524c34b84e0218547de5e4', width: 468, height: 60 }
          : { key: '07e86776906aabd9b6e8d43b1c3c1096', width: 728, height: 90 };
      frame.style.width = availableWidth + 'px';
      if (activeFormat && activeFormat.key === format.key) return;
      activeFormat = format;
      frame.style.height = format.height + 'px';
      frame.style.transform = 'none';
      viewport.style.height = format.height + 'px';
      var iframe = document.createElement('iframe');
      iframe.title = 'Iklan sponsor';
      iframe.width = format.width;
      iframe.height = format.height;
      iframe.loading = 'lazy';
      iframe.scrolling = 'no';
      iframe.frameBorder = '0';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.style.width = '100%';
      iframe.style.height = format.height + 'px';
      iframe.srcdoc = '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><script>var atOptions={key:"' + format.key + '",format:"iframe",height:' + format.height + ',width:' + format.width + ',params:{}};</script><script src="https://www.highrevenueformat.com/' + format.key + '/invoke.js"></script></body></html>';
      frame.replaceChildren(iframe);
    }
    fitAd();
    if (window.ResizeObserver) {
      ad._resizeObserver = new ResizeObserver(fitAd);
      ad._resizeObserver.observe(viewport);
    } else {
      window.addEventListener('resize', fitAd, { passive: true });
    }
    return ad;
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
        var ad = sheet.querySelector(':scope > .sheet-sponsored-ad');
        if (!ad && sheet.dataset.sponsoredAdDismissed !== 'true') {
          ad = createSponsoredAd(sheet);
          banner.insertAdjacentElement('afterend', ad);
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
