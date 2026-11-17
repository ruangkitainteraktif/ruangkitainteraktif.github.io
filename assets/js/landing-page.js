(function () {
  'use strict';

  var root = document.getElementById('rkLandingPage');
  if (!root) return;

  var cards = Array.prototype.slice.call(root.querySelectorAll('.rk-landing-card'));
  var search = root.querySelector('#rkLandingSearch');
  var empty = root.querySelector('#rkLandingEmpty');
  var clear = root.querySelector('#rkLandingClearSearch');
  var tip = root.querySelector('#rkLandingTip');

  function filterTopics() {
    var query = (search && search.value || '').trim().toLocaleLowerCase('id');
    var visible = 0;
    cards.forEach(function (card) {
      var haystack = (card.textContent + ' ' + (card.dataset.search || '')).toLocaleLowerCase('id');
      card.hidden = !!query && haystack.indexOf(query) === -1;
      if (!card.hidden) visible += 1;
    });
    if (empty) empty.hidden = visible !== 0;
  }

  if (search) search.addEventListener('input', filterTopics);
  if (clear) clear.addEventListener('click', function () {
    if (search) {
      search.value = '';
      search.focus();
    }
    filterTopics();
  });

  var tips = {
    wilayah: 'Ketik nama desa, kecamatan, atau kota pada pencarian peta. Pilih hasil untuk melihat lokasi dan informasi yang tersedia.',
    pantau: 'Buka katalog peta lalu pilih cuaca, citra satelit, gempa, atau topik lingkungan. Ketersediaan data mengikuti sumbernya.',
    ruang: 'Cari RDTR, kawasan hutan, geologi, atau layer tata ruang. Periksa sumber dan tahun data sebelum menggunakannya.',
    data: 'GeoTools menerima SHP, GeoJSON, GPX, dan KMZ. Anda juga dapat menggambar atau mengukur langsung pada peta.'
  };
  root.querySelectorAll('[data-rk-intent]').forEach(function (button) {
    button.addEventListener('click', function () {
      root.querySelectorAll('[data-rk-intent]').forEach(function (item) {
        item.setAttribute('aria-pressed', String(item === button));
      });
      if (tip) tip.textContent = tips[button.dataset.rkIntent] || tips.wilayah;
    });
  });

  root.querySelectorAll('[data-rk-open-map]').forEach(function (button) {
    button.addEventListener('click', function (event) {
      if (button.tagName === 'A') event.preventDefault();
      if (root.hidden) return;
      root.hidden = true;
      document.body.classList.add('rk-landing-dismissed');
      if (typeof window.closeWelcomeModal === 'function') window.closeWelcomeModal();

      var loadingOverlay = document.getElementById('appLoadingOverlay');
      if (loadingOverlay) loadingOverlay.classList.remove('is-hidden');

      function finishEnteringMap() {
        window.requestAnimationFrame(function () {
          if (window.map && typeof window.map.invalidateSize === 'function') {
            window.map.invalidateSize({ pan: false });
          }
          if (loadingOverlay) {
            window.setTimeout(function () { loadingOverlay.classList.add('is-hidden'); }, 550);
          }
        });
      }

      if (document.readyState === 'complete') finishEnteringMap();
      else window.addEventListener('load', finishEnteringMap, { once: true });
    });
  });
})();
