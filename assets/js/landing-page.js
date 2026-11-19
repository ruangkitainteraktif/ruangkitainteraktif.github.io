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
  var mapViewKey = 'ruangkita_map_view_active';

  // Keep the map open after refresh in the same tab. A fresh tab/session
  // still starts at the landing page.
  try {
    if (sessionStorage.getItem(mapViewKey) === '1') {
      root.hidden = true;
      document.body.classList.add('rk-landing-dismissed');
    }
  } catch (error) {
    // Storage can be unavailable in private or restricted browser contexts.
  }

  function normalizeWeatherArea(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('id')
      .replace(/^(kabupaten|kab|kota administrasi|kota adm|kota|provinsi|daerah khusus ibukota|daerah khusus ibu kota|daerah istimewa|di|dki)\b\s*/g, '').trim();
  }

  async function resolveWeatherADM4(lat, lon) {
    var reverseUrl = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=pjson&featureTypes=&location=' + encodeURIComponent(lon) + ',' + encodeURIComponent(lat);
    var reverseResponse = typeof window.geoidFetchWithProxy === 'function'
      ? await window.geoidFetchWithProxy(reverseUrl, 15000)
      : await fetch(reverseUrl);
    if (!reverseResponse.ok) throw new Error('Lokasi GPS tidak dapat dikenali.');
    var reverseData = await reverseResponse.json();
    if (!reverseData || !reverseData.address) throw new Error('Wilayah dari GPS tidak ditemukan.');

    var address = reverseData.address;
    var levels = {
      provinsi: normalizeWeatherArea(address.Region),
      kabkota: normalizeWeatherArea(address.Subregion || address.MetroArea),
      kecamatan: normalizeWeatherArea(address.City || address.District),
      desa: normalizeWeatherArea(address.Neighborhood || address.PlaceName)
    };
    var locations = window.weatherSearchLocations || [];
    if (!locations.length) {
      var raw = window.KODE_WILAYAH_DATA;
      if (!raw) {
        var wilayahResponse = await fetch('assets/data/kode_wilayah.json');
        if (wilayahResponse.ok) raw = await wilayahResponse.json();
      }
      var rows = Array.isArray(raw) ? raw : (raw && raw.value) || [];
      var byCode = new Map(rows.map(function (row) { return [String(row.kode), row]; }));
      locations = rows.filter(function (row) { return /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(String(row.kode || '')); }).map(function (row) {
        var parts = String(row.kode).split('.');
        return {
          kode: String(row.kode), desa: row.nama || '',
          kecamatan: (byCode.get(parts[0] + '.' + parts[1] + '.' + parts[2]) || {}).nama || '',
          kabkota: (byCode.get(parts[0] + '.' + parts[1]) || {}).nama || '',
          provinsi: (byCode.get(parts[0]) || {}).nama || ''
        };
      });
    }
    if (!locations.length) throw new Error('Daftar kode wilayah belum siap. Coba lagi.');

    function matches(name, value) {
      var normalized = normalizeWeatherArea(name);
      return normalized && value && (normalized === value || normalized.indexOf(value) !== -1 || value.indexOf(normalized) !== -1);
    }
    var pool = levels.provinsi ? locations.filter(function (item) { return matches(item.provinsi, levels.provinsi); }) : locations;
    if (!pool.length && levels.provinsi) throw new Error('Provinsi dari GPS belum cocok dengan data wilayah BMKG.');
    var kabPool = levels.kabkota ? pool.filter(function (item) { return matches(item.kabkota, levels.kabkota); }) : [];
    if (kabPool.length) pool = kabPool;
    else if (levels.kabkota) throw new Error('Kabupaten/kota dari GPS belum cocok dengan data wilayah BMKG.');
    var kecPool = levels.kecamatan ? pool.filter(function (item) { return matches(item.kecamatan, levels.kecamatan); }) : [];
    if (kecPool.length) pool = kecPool;
    var desaMatch = levels.desa ? pool.find(function (item) { return matches(item.desa, levels.desa); }) : null;
    var selected = desaMatch || pool[0];
    if (!selected || !selected.kode) throw new Error('Kode desa untuk lokasi GPS tidak ditemukan.');
    return selected;
  }

  function fetchBMKGForecast(url) {
    if (typeof window.geoidFetchWithProxy === 'function') return window.geoidFetchWithProxy(url, 15000);
    return fetch(url);
  }

  if (weatherButton && weatherValue && weatherStatus) {
    var weatherLoaded = false;
    var weatherLoading = false;
    var locationRequestPending = false;

    function setWeatherError(message) {
      weatherValue.textContent = '--';
      weatherButton.setAttribute('aria-label', 'Cuaca tidak tersedia. Tekan untuk mencoba lagi.');
      weatherStatus.textContent = message;
      weatherStatus.hidden = false;
    }

    function loadWeatherForPosition(position) {
      if (weatherLoaded || weatherLoading) return;
      weatherLoading = true;
      weatherButton.disabled = true;
      weatherValue.textContent = '…';
      weatherStatus.textContent = 'Mengambil cuaca…';
      weatherStatus.hidden = false;

      var lat = position.coords.latitude;
      var lon = position.coords.longitude;
      resolveWeatherADM4(lat, lon).then(function (adm4) {
        var url = 'https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=' + encodeURIComponent(adm4.kode);
        return fetchBMKGForecast(url).then(function (response) {
          if (!response.ok) throw new Error('Data cuaca belum dapat dimuat.');
          return response.json().then(function (result) { return { result: result, adm4: adm4 }; });
        });
      }).then(function (payload) {
        var result = payload.result;
        var adm4 = payload.adm4;
        var current = result && result.data && result.data[0] && result.data[0].cuaca && result.data[0].cuaca[0] && result.data[0].cuaca[0][0];
        if (!current) throw new Error('Data cuaca untuk lokasi ini belum tersedia.');

        var temp = Number(current.t);
        var tempLabel = Number.isFinite(temp) ? Math.round(temp) + '°C' : '--°C';
        var weatherText = current.weather_desc || 'Cuaca hari ini';
        var location = result.lokasi || {};
        var locationParts = [location.desa || adm4.desa, location.kecamatan || adm4.kecamatan, location.kabkota || adm4.kabkota].filter(Boolean);
        weatherValue.textContent = tempLabel;
        weatherButton.setAttribute('aria-label', weatherText + ', ' + tempLabel + (locationParts.length ? ', ' + locationParts.join(', ') : ''));
        weatherStatus.textContent = [weatherText, locationParts.join(', ')].filter(Boolean).join(' · ');
        weatherStatus.hidden = false;
        weatherLoaded = true;
      }).catch(function (error) {
        setWeatherError(error.message || 'Cuaca gagal dimuat.');
      }).finally(function () {
        weatherLoading = false;
        weatherButton.disabled = false;
      });
    }

    function requestWeatherLocation(forceRefresh) {
      if (weatherLoaded && !forceRefresh) return;
      if (locationRequestPending || weatherLoading) return;
      if (forceRefresh) weatherLoaded = false;
      if (!navigator.geolocation) {
        setWeatherError('GPS tidak tersedia.');
        return;
      }
      if (weatherLoading) return;
      weatherButton.disabled = true;
      locationRequestPending = true;
      weatherValue.textContent = '…';
      weatherStatus.textContent = 'Menunggu izin lokasi…';
      weatherStatus.hidden = false;
      navigator.geolocation.getCurrentPosition(function (position) {
        locationRequestPending = false;
        loadWeatherForPosition(position);
      }, function (error) {
        locationRequestPending = false;
        weatherButton.disabled = false;
        setWeatherError(error.code === 1 ? 'Izin lokasi ditolak.' : 'Lokasi tidak berhasil diperoleh.');
      }, { enableHighAccuracy: false, maximumAge: 600000, timeout: 12000 });
    }

    weatherButton.addEventListener('click', function () { requestWeatherLocation(true); });
    window.addEventListener('ruangkita:location-granted', function (event) {
      var detail = event.detail || {};
      if (Number.isFinite(detail.lat) && Number.isFinite(detail.lon)) {
        loadWeatherForPosition({ coords: { latitude: detail.lat, longitude: detail.lon } });
      }
    });

    // Use an existing grant immediately; a new request still needs a user gesture.
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(function (permission) {
        if (permission.state === 'granted') requestWeatherLocation();
        var handlePermissionChange = function () {
          if (permission.state === 'granted') requestWeatherLocation();
        };
        if (permission.addEventListener) permission.addEventListener('change', handlePermissionChange);
        else permission.onchange = handlePermissionChange;
      }).catch(function () { /* The weather button remains available as fallback. */ });
    }
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

  var initialMapLocationRequested = false;
  function focusMapOnUserLocation() {
    if (initialMapLocationRequested || !navigator.geolocation) return;
    initialMapLocationRequested = true;
    navigator.geolocation.getCurrentPosition(function (position) {
      var currentMap = window.map;
      if (!currentMap || typeof currentMap.flyTo !== 'function') return;
      currentMap.flyTo([position.coords.latitude, position.coords.longitude], 12, { duration: 1.2 });
    }, function () {
      // Keep the default map view when the user declines or location is unavailable.
    }, { enableHighAccuracy: false, maximumAge: 600000, timeout: 12000 });
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
      try { sessionStorage.setItem(mapViewKey, '1'); } catch (error) { /* storage unavailable */ }
      focusMapOnUserLocation();
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
