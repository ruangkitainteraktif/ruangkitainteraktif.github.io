(function () {
  'use strict';

  var root = document.getElementById('rkLandingPage');
  if (!root) return;

  var cards = Array.prototype.slice.call(root.querySelectorAll('.rk-landing-card'));
  var search = root.querySelector('#rkLandingSearch');
  var empty = root.querySelector('#rkLandingEmpty');
  var clear = root.querySelector('#rkLandingClearSearch');
  var tip = root.querySelector('#rkLandingTip');
  var weatherButton = root.querySelector('#rkWeatherWidget');
  var weatherValue = root.querySelector('#rkWeatherWidgetValue');
  var weatherStatus = root.querySelector('#rkWeatherWidgetStatus');

  if (weatherButton && weatherValue && weatherStatus) {
    weatherButton.setAttribute('aria-describedby', 'rkWeatherWidgetStatus');
    weatherButton.addEventListener('click', function () {
      if (!navigator.geolocation) {
        weatherStatus.textContent = 'GPS tidak tersedia di browser ini.';
        weatherStatus.hidden = false;
        return;
      }

      weatherButton.disabled = true;
      weatherValue.textContent = '…';
      weatherStatus.textContent = 'Meminta lokasi untuk mengambil cuaca BMKG hari ini…';
      weatherStatus.hidden = false;

      navigator.geolocation.getCurrentPosition(function (position) {
        var lat = position.coords.latitude;
        var lon = position.coords.longitude;
        var url = 'https://api.bmkg.go.id/publik/prakiraan-cuaca?lat=' + encodeURIComponent(lat) + '&lon=' + encodeURIComponent(lon);

        fetch(url).then(function (response) {
          if (!response.ok) throw new Error('Layanan cuaca sedang tidak tersedia.');
          return response.json();
        }).then(function (result) {
          var current = result && result.data && result.data[0] && result.data[0].cuaca && result.data[0].cuaca[0] && result.data[0].cuaca[0][0];
          if (!current) throw new Error('Data cuaca untuk lokasi ini belum tersedia.');

          var temp = Number(current.t);
          var tempLabel = Number.isFinite(temp) ? Math.round(temp) + '°' : '--°';
          var weatherText = current.weather_desc || 'Cuaca hari ini';
          var location = result.lokasi || {};
          var locationParts = [location.desa, location.kecamatan, location.kabkota].filter(Boolean);
          weatherValue.textContent = tempLabel;
          weatherButton.setAttribute('aria-label', 'Cuaca sekitar: ' + weatherText + ', ' + tempLabel + '. Tekan untuk memperbarui.');
          weatherStatus.textContent = weatherText + ' · ' + tempLabel + 'C' + (locationParts.length ? ' · ' + locationParts.join(', ') : '') + ' · BMKG';
        }).catch(function (error) {
          weatherValue.textContent = 'GPS';
          weatherButton.setAttribute('aria-label', 'Gunakan GPS untuk melihat cuaca hari ini');
          weatherStatus.textContent = error.message || 'Cuaca gagal dimuat. Coba lagi.';
        }).finally(function () {
          weatherButton.disabled = false;
          weatherStatus.hidden = false;
        });
      }, function (error) {
        weatherValue.textContent = 'GPS';
        weatherButton.disabled = false;
        weatherButton.setAttribute('aria-label', 'Gunakan GPS untuk melihat cuaca hari ini');
        weatherStatus.textContent = error.code === 1 ? 'Izin lokasi ditolak. Aktifkan izin lokasi untuk melihat cuaca.' : 'Lokasi tidak berhasil diperoleh. Coba lagi.';
        weatherStatus.hidden = false;
      }, { enableHighAccuracy: false, maximumAge: 600000, timeout: 12000 });
    });
  }

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
