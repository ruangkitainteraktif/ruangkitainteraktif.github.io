/* ── RainViewer Precipitation Time Slider ── */
(function () {
  'use strict';

  var GSMAP_KEY = 'gsmap-rain';
  var API_URL = 'https://api.rainviewer.com/public/weather-maps.json';
  var REFRESH_MS = 10 * 60 * 1000;

  var sliderControl = null;
  var legendControl = null;
  var currentIndex = 0;
  var radarFrames = [];
  var _fetchPromise = null;
  var _refreshInterval = null;
  var _titleRow = null;

  var MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  function formatTime(unixTs) {
    var d = new Date(unixTs * 1000);
    var utcH = d.getUTCHours();
    var utcM = d.getUTCMinutes();
    var wibH = (utcH + 7) % 24;
    var hh = String(wibH).padStart(2, '0');
    var mm = String(utcM).padStart(2, '0');
    return hh + ':' + mm + ' WIB';
  }

  function formatDateShort(unixTs) {
    var d = new Date(unixTs * 1000);
    return d.getUTCDate() + ' ' + MONTH_NAMES[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  function formatDateTime(unixTs) {
    return formatDateShort(unixTs) + ' ' + formatTime(unixTs);
  }

  function buildTileUrl(host, path) {
    return host + path + '/256/{z}/{x}/{y}/2/1_1.png';
  }

  function fetchTimestamps(callback) {
    if (_fetchPromise) { _fetchPromise.then(callback); return; }
    _fetchPromise = new Promise(function (resolve) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', API_URL, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            var data = JSON.parse(xhr.responseText);
            var host = data.host || '';
            var past = (data.radar && data.radar.past) ? data.radar.past : [];
            radarFrames = past.map(function (f) {
              return { time: f.time, path: f.path, url: buildTileUrl(host, f.path) };
            });
            resolve(radarFrames);
          } catch (e) {
            console.error('[RainViewer] Failed to parse API:', e);
            radarFrames = [];
            resolve([]);
          }
        } else {
          radarFrames = [];
          resolve([]);
        }
      };
      xhr.send();
    });
    _fetchPromise.then(function () { callback(); });
  }

  function updateRainUrl(frame) {
    var layer = baseTileLayers[GSMAP_KEY];
    if (!layer) return;
    layer.setUrl(frame.url);
  }

  function ensureBottomCenterControlCorner() {
    if (map._controlCorners.bottomcenter) return;
    map._controlCorners.bottomcenter = L.DomUtil.create('div', 'leaflet-bottom leaflet-center', map._controlContainer);
  }

  ensureBottomCenterControlCorner();

  var RainTimeSliderControl = L.Control.extend({
    options: { position: 'bottomcenter' },
    onAdd: function () {
      var wrap = L.DomUtil.create('div', 'bmkg-time-slider-wrap');
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

      var titleRow = L.DomUtil.create('div', 'bmkg-ts-title', wrap);
      titleRow.textContent = 'Precipitation Radar';
      _titleRow = titleRow;

      var controlsRow = L.DomUtil.create('div', 'bmkg-ts-controls', wrap);

      var prevBtn = L.DomUtil.create('button', 'bmkg-ts-btn bmkg-ts-prev', controlsRow);
      prevBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
      prevBtn.title = 'Sebelumnya';

      var sliderWrap = L.DomUtil.create('div', 'bmkg-ts-slider-wrap', controlsRow);
      var slider = L.DomUtil.create('input', 'bmkg-ts-slider', sliderWrap);
      slider.type = 'range';
      slider.min = '0';
      slider.max = '0';
      slider.value = '0';
      slider.step = '1';

      var nextBtn = L.DomUtil.create('button', 'bmkg-ts-btn bmkg-ts-next', controlsRow);
      nextBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
      nextBtn.title = 'Berikutnya';

      var infoRow = L.DomUtil.create('div', 'bmkg-ts-info', wrap);
      var dateDisplay = L.DomUtil.create('span', 'bmkg-ts-date', infoRow);
      dateDisplay.textContent = 'Memuat...';

      var timeDisplay = L.DomUtil.create('span', 'bmkg-ts-time', infoRow);
      timeDisplay.textContent = '';

      function applyTimestamp() {
        if (radarFrames.length === 0) return;
        var frame = radarFrames[currentIndex];
        dateDisplay.textContent = formatDateTime(frame.time);
        updateRainUrl(frame);
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
        if (val < radarFrames.length - 1) {
          slider.value = String(val + 1);
          slider.dispatchEvent(new Event('input'));
        }
      });

      fetchTimestamps(function () {
        if (radarFrames.length === 0) {
          dateDisplay.textContent = 'Data tidak tersedia';
          return;
        }
        slider.max = String(radarFrames.length - 1);
        currentIndex = radarFrames.length - 1;
        slider.value = String(currentIndex);
        applyTimestamp();
      });

      wrap._slider = slider;
      wrap._dateDisplay = dateDisplay;
      return wrap;
    }
  });

  var _prevMaxZoom = null;

  var RainLegend = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd: function () {
      var div = L.DomUtil.create('div', 'himawari-legend');
      L.DomEvent.disableClickPropagation(div);
      div.innerHTML =
        '<div class="himawari-legend-title">Intensitas Hujan (Radar)</div>' +
        '<div class="himawari-legend-bar" style="background:linear-gradient(90deg,transparent,#01b8ff,#00e500,#ffdc00,#ff7100,#ff0000,#b800d6);"></div>' +
        '<div class="himawari-legend-labels"><span>-</span><span>Ringan</span><span>Sedang</span><span>Deras</span><span>Sangat Deras</span><span>Ekstrem</span></div>' +
        '<div class="himawari-legend-items">' +
          '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#01b8ff;"></span>&lt; 5 mm/jam — Hujan Ringan</div>' +
          '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#00e500;"></span>5 - 10 mm/jam — Hujan Sedang</div>' +
          '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#ffdc00;"></span>10 - 20 mm/jam — Hujan Deras</div>' +
          '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#ff7100;"></span>20 - 30 mm/jam — Hujan Sangat Deras</div>' +
          '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#ff0000;"></span>30 - 50 mm/jam — Hujan Ekstrem</div>' +
          '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#b800d6;"></span>&gt; 50 mm/jam — Sangat Ekstrem</div>' +
        '</div>' +
        '<div class="himawari-legend-unit">Sumber: RainViewer</div>';
      return div;
    }
  });

  function showLegend() {
    if (!legendControl) {
      legendControl = new RainLegend();
      legendControl.addTo(map);
    }
  }

  function hideLegend() {
    if (legendControl) {
      map.removeControl(legendControl);
      legendControl = null;
    }
  }

  function showSlider() {
    if (!sliderControl) {
      sliderControl = new RainTimeSliderControl();
      sliderControl.addTo(map);
    }
    showLegend();
    _prevMaxZoom = map.getMaxZoom();
    map.setMaxZoom(7);
    if (map.getZoom() > 7) map.setZoom(5);
  }

  function hideSlider() {
    if (sliderControl) {
      map.removeControl(sliderControl);
      sliderControl = null;
    }
    hideLegend();
    if (_prevMaxZoom !== null) {
      map.setMaxZoom(_prevMaxZoom);
      _prevMaxZoom = null;
    }
  }

  function activateGsmapLayer() {
    radarFrames = [];
    currentIndex = 0;
    _fetchPromise = null;
    hideSlider();
    var layer = baseTileLayers[GSMAP_KEY];
    if (!map.hasLayer(layer)) layer.addTo(map);
    fetchTimestamps(function () {
      if (radarFrames.length > 0) {
        layer.setUrl(radarFrames[radarFrames.length - 1].url);
      }
      showSlider();
      startAutoRefresh();
    });
  }

  function cleanup() {
    hideSlider();
    hideLegend();
    var layer = baseTileLayers[GSMAP_KEY];
    if (layer && map.hasLayer(layer)) map.removeLayer(layer);
    radarFrames = [];
    currentIndex = 0;
    _fetchPromise = null;
    stopAutoRefresh();
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    _refreshInterval = setInterval(function () {
      _fetchPromise = null;
      fetchTimestamps(function () {
        if (!sliderControl || radarFrames.length === 0) return;
        var slider = sliderControl._slider;
        if (!slider) return;
        slider.max = String(radarFrames.length - 1);
        if (currentIndex >= radarFrames.length) currentIndex = radarFrames.length - 1;
        slider.value = String(currentIndex);
        var frame = radarFrames[currentIndex];
        var dateEl = sliderControl._dateDisplay;
        if (dateEl) dateEl.textContent = formatDateTime(frame.time);
        updateRainUrl(frame);
      });
    }, REFRESH_MS);
  }

  function stopAutoRefresh() {
    if (_refreshInterval) {
      clearInterval(_refreshInterval);
      _refreshInterval = null;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    map.on('basemapchanged', function (e) {
      if (e.basemap === GSMAP_KEY) {
        activateGsmapLayer();
      } else if (e.basemap !== GSMAP_KEY) {
        hideSlider();
      }
    });

    if (typeof currentBasemapName !== 'undefined' && currentBasemapName === GSMAP_KEY) {
      activateGsmapLayer();
    }
  });

  window.gsmapTimeSliderCleanup = cleanup;
})();
