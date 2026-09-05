/* ── BMKG Himawari-9 Time Slider — satellite.bmkg.go.id ── */
(function () {
  'use strict';

  var HIMAWARI_KEY = 'bmkg-himawari';
  var MODELRUN_URL = 'https://satellite.bmkg.go.id/api22/modelrun';
  var TILE_URL_BASE = 'https://satellite.bmkg.go.id/api22/tile/{z}/{x}/{y}.png?tiletype=himawari9&modelname=himawari9&param=EH&baserun=';
  var PROV_GEOJSON_URL = 'assets/data/bps/geojson/provinsi.geojson';

  var sliderControl = null;
  var currentIndex = 0;
  var timestamps = [];
  var _provLayer = null;
  var _fetchPromise = null;

  var MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  function formatTime(isoStr) {
    var d = new Date(isoStr);
    var hh = String(d.getUTCHours()).padStart(2, '0');
    var mm = String(d.getUTCMinutes()).padStart(2, '0');
    return hh + ':' + mm + ' UTC';
  }

  function formatDateShort(isoStr) {
    var d = new Date(isoStr);
    return d.getUTCDate() + ' ' + MONTH_NAMES[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  function formatDateTime(isoStr) {
    return formatDateShort(isoStr) + ' ' + formatTime(isoStr);
  }

  function updateHimawariUrl(baserun) {
    var layer = baseTileLayers[HIMAWARI_KEY];
    if (!layer) return;
    layer.setUrl(TILE_URL_BASE + encodeURIComponent(baserun));
  }

  function fetchTimestamps(callback) {
    if (_fetchPromise) { _fetchPromise.then(callback); return; }
    _fetchPromise = new Promise(function (resolve) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', MODELRUN_URL, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            var data = JSON.parse(xhr.responseText);
            var list = (data.himawari9 || []).slice().reverse();
            timestamps = list;
            resolve(list);
          } catch (e) {
            console.error('[BMKGSlider] Failed to parse modelrun:', e);
            timestamps = [];
            resolve([]);
          }
        } else {
          timestamps = [];
          resolve([]);
        }
      };
      xhr.send();
    });
    _fetchPromise.then(function () { callback(); });
  }

  function loadProvinsiLayer() {
    if (_provLayer) { _provLayer.addTo(map); return; }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', PROV_GEOJSON_URL, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var geojson = JSON.parse(xhr.responseText);
          _provLayer = L.geoJSON(geojson, {
            style: { color: '#ffffff', weight: 1, opacity: 0.7, fillColor: '#ffffff', fillOpacity: 0 },
            interactive: false
          }).addTo(map);
        } catch (e) {
          console.error('[BMKGSlider] Failed to load provinsi:', e);
        }
      }
    };
    xhr.send();
  }

  function removeProvinsiLayer() {
    if (_provLayer && map.hasLayer(_provLayer)) {
      map.removeLayer(_provLayer);
    }
  }

  function ensureBottomCenterControlCorner() {
    if (map._controlCorners.bottomcenter) return;
    map._controlCorners.bottomcenter = L.DomUtil.create('div', 'leaflet-bottom leaflet-center', map._controlContainer);
  }

  ensureBottomCenterControlCorner();

  var BmkgTimeSliderControl = L.Control.extend({
    options: { position: 'bottomcenter' },
    onAdd: function () {
      var wrap = L.DomUtil.create('div', 'bmkg-time-slider-wrap');
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

      var prevBtn = L.DomUtil.create('button', 'bmkg-ts-btn bmkg-ts-prev', wrap);
      prevBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
      prevBtn.title = 'Sebelumnya';

      var sliderWrap = L.DomUtil.create('div', 'bmkg-ts-slider-wrap', wrap);
      var slider = L.DomUtil.create('input', 'bmkg-ts-slider', sliderWrap);
      slider.type = 'range';
      slider.min = '0';
      slider.max = '0';
      slider.value = '0';
      slider.step = '1';

      var nextBtn = L.DomUtil.create('button', 'bmkg-ts-btn bmkg-ts-next', wrap);
      nextBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
      nextBtn.title = 'Berikutnya';

      var dateDisplay = L.DomUtil.create('div', 'bmkg-ts-date', wrap);
      dateDisplay.textContent = 'Memuat...';

      var timeDisplay = L.DomUtil.create('div', 'bmkg-ts-time', wrap);
      timeDisplay.textContent = 'Update setiap 10 menit';

      function applyTimestamp() {
        if (timestamps.length === 0) return;
        var ts = timestamps[currentIndex];
        dateDisplay.textContent = formatDateTime(ts);
        updateHimawariUrl(ts);
      }

      slider.addEventListener('input', function () {
        currentIndex = parseInt(this.value, 10);
        applyTimestamp();
      });

      prevBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var val = parseInt(slider.value, 10);
        if (val > 0) {
          slider.value = String(val - 1);
          slider.dispatchEvent(new Event('input'));
        }
      });

      nextBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var val = parseInt(slider.value, 10);
        if (val < timestamps.length - 1) {
          slider.value = String(val + 1);
          slider.dispatchEvent(new Event('input'));
        }
      });

      fetchTimestamps(function () {
        if (timestamps.length === 0) {
          dateDisplay.textContent = 'Data tidak tersedia';
          return;
        }
        slider.max = String(timestamps.length - 1);
        currentIndex = 0;
        slider.value = '0';
        applyTimestamp();
      });

      wrap._slider = slider;
      return wrap;
    }
  });

  var _prevMaxZoom = null;

  function showSlider() {
    if (!sliderControl) {
      sliderControl = new BmkgTimeSliderControl();
      sliderControl.addTo(map);
    }
    loadProvinsiLayer();
    _prevMaxZoom = map.getMaxZoom();
    map.setMaxZoom(10);
    if (map.getZoom() > 10) map.setZoom(5);
  }

  function hideSlider() {
    if (sliderControl) {
      map.removeControl(sliderControl);
      sliderControl = null;
    }
    removeProvinsiLayer();
    if (_prevMaxZoom !== null) {
      map.setMaxZoom(_prevMaxZoom);
      _prevMaxZoom = null;
    }
  }

  function cleanup() {
    hideSlider();
    timestamps = [];
    currentIndex = 0;
    _fetchPromise = null;
  }

  document.addEventListener('DOMContentLoaded', function () {
    map.on('basemapchanged', function (e) {
      if (e.basemap === HIMAWARI_KEY) {
        fetchTimestamps(function () { showSlider(); });
      } else {
        hideSlider();
      }
    });

    if (typeof currentBasemapName !== 'undefined' && currentBasemapName === HIMAWARI_KEY) {
      fetchTimestamps(function () { showSlider(); });
    }
  });

  window.bmkgHimawariSliderCleanup = cleanup;
})();
