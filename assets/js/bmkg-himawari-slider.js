/* ── BMKG Himawari/GK-2A Time Slider — satellite.bmkg.go.id ── */
(function () {
  'use strict';

  var BMKG_LAYERS = {
    'bmkg-himawari':      { tiletype: 'himawari9', modelname: 'himawari9',    param: 'EH', title: 'Himawari-9 IR Enhanced' },
    'bmkg-himawari-fd':   { tiletype: 'himawari9', modelname: 'himawari9fd',  param: 'EH', title: 'Himawari-9 Full Disk' },
    'bmkg-himawari-hires':{ tiletype: 'himawari9', modelname: 'himawari9hires', param: 'VS', title: 'Himawari-9 Hi-Res (Visible)' },
    'bmkg-gk2a':          { tiletype: 'himawari9', modelname: 'gk2a',         param: 'EH', title: 'GK-2A' }
  };
  var MODELRUN_URL = 'https://satellite.bmkg.go.id/api22/modelrun';
  var TILE_URL_TEMPLATE = 'https://satellite.bmkg.go.id/api22/tile/{z}/{x}/{y}.png?tiletype={tiletype}&modelname={modelname}&param={param}&baserun=';

  var sliderControl = null;
  var legendControl = null;
  var currentIndex = 0;
  var timestamps = [];
  var _fetchPromise = null;
  var _activeKey = null;
  var _refreshInterval = null;
  var REFRESH_MS = 10 * 60 * 1000;

  var MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  function formatTime(isoStr) {
    var d = new Date(isoStr);
    var utcH = d.getUTCHours();
    var utcM = d.getUTCMinutes();
    var wibH = (utcH + 7) % 24;
    var hh = String(wibH).padStart(2, '0');
    var mm = String(utcM).padStart(2, '0');
    return hh + ':' + mm + ' WIB';
  }

  function formatDateShort(isoStr) {
    var d = new Date(isoStr);
    return d.getUTCDate() + ' ' + MONTH_NAMES[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  function formatDateTime(isoStr) {
    return formatDateShort(isoStr) + ' ' + formatTime(isoStr);
  }

  function isBmkgLayer(key) {
    return BMKG_LAYERS.hasOwnProperty(key);
  }

  function buildTileUrl(tiletype, modelname, param, baserun) {
    return TILE_URL_TEMPLATE.replace('{tiletype}', tiletype).replace('{modelname}', modelname).replace('{param}', param) + encodeURIComponent(baserun);
  }

  function updateHimawariUrl(baserun) {
    if (!_activeKey) return;
    var layer = baseTileLayers[_activeKey];
    var info = BMKG_LAYERS[_activeKey];
    if (!layer || !info) return;
    layer.setUrl(buildTileUrl(info.tiletype, info.modelname, info.param, baserun));
  }

  function fetchTimestamps(callback) {
    if (_fetchPromise) { _fetchPromise.then(callback); return; }
    _fetchPromise = new Promise(function (resolve) {
      if (window._bmkgModelrunCache) {
        var data = window._bmkgModelrunCache;
        var apiKey = _activeKey ? BMKG_LAYERS[_activeKey].modelname : 'himawari9';
        var list = (data[apiKey] || []).slice().reverse();
        timestamps = list;
        resolve(list);
        return;
      }
      var xhr = new XMLHttpRequest();
      xhr.open('GET', MODELRUN_URL, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            var data = JSON.parse(xhr.responseText);
            var apiKey = _activeKey ? BMKG_LAYERS[_activeKey].modelname : 'himawari9';
            var list = (data[apiKey] || []).slice().reverse();
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

      var titleRow = L.DomUtil.create('div', 'bmkg-ts-title', wrap);
      titleRow.textContent = BMKG_LAYERS[_activeKey] ? BMKG_LAYERS[_activeKey].title : 'BMKG Satellite';

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
      wrap._dateDisplay = dateDisplay;
      return wrap;
    }
  });

  var _prevMaxZoom = null;

  var HimawariLegend = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd: function () {
      var div = L.DomUtil.create('div', 'himawari-legend');
      L.DomEvent.disableClickPropagation(div);
      var info = BMKG_LAYERS[_activeKey];
      var param = info ? info.param : 'EH';
      if (param === 'VS') {
        div.innerHTML =
          '<div class="himawari-legend-title">Visible (0.64&micro;m) — 500m</div>' +
          '<div class="himawari-legend-bar" style="background:linear-gradient(90deg,#000 0%,#fff 100%);"></div>' +
          '<div class="himawari-legend-labels"><span>Gelap</span><span>Cerah</span></div>' +
          '<div class="himawari-legend-unit">Sumber: BMKG Satellite</div>';
      } else {
        div.innerHTML =
          '<div class="himawari-legend-title">Suhu Puncak Awan (IR 10.4&micro;m)</div>' +
          '<div class="himawari-legend-bar"></div>' +
          '<div class="himawari-legend-labels"><span>-80&deg;C</span><span>-60&deg;C</span><span>-40&deg;C</span><span>-20&deg;C</span><span>0&deg;C</span><span>20&deg;C</span></div>' +
          '<div class="himawari-legend-items">' +
            '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#7b0051;"></span>&le; -80&deg;C — Ekstrem</div>' +
            '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#d62828;"></span>-80 s/d -60&deg;C — Sangat Dingin (Cb)</div>' +
            '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#f77f00;"></span>-60 s/d -40&deg;C — Dingin</div>' +
            '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#f6d743;"></span>-40 s/d -20&deg;C — Sedang</div>' +
            '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#1a936f;"></span>-20 s/d 0&deg;C — Hangat</div>' +
            '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#16213e;"></span>&ge; 0&deg;C — Cerah</div>' +
          '</div>' +
          '<div class="himawari-legend-unit">Sumber: BMKG Satellite</div>';
      }
      return div;
    }
  });

  function showLegend() {
    if (!legendControl) {
      legendControl = new HimawariLegend();
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
      sliderControl = new BmkgTimeSliderControl();
      sliderControl.addTo(map);
    }
    showLegend();
    _prevMaxZoom = map.getMaxZoom();
    map.setMaxZoom(10);
    if (map.getZoom() > 10) map.setZoom(5);
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

  function activateBmkgLayer(key) {
    _activeKey = key;
    _fetchPromise = null;
    timestamps = [];
    currentIndex = 0;
    // destroy old slider & legend so title updates
    hideSlider();
    fetchTimestamps(function () {
      showSlider();
      startAutoRefresh();
    });
  }

  function cleanup() {
    hideSlider();
    hideLegend();
    timestamps = [];
    currentIndex = 0;
    _fetchPromise = null;
    _activeKey = null;
    stopAutoRefresh();
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    _refreshInterval = setInterval(function () {
      if (!_activeKey) return;
      _fetchPromise = null;
      fetchTimestamps(function () {
        if (!sliderControl || timestamps.length === 0) return;
        var slider = sliderControl._slider;
        if (!slider) return;
        slider.max = String(timestamps.length - 1);
        if (currentIndex >= timestamps.length) currentIndex = timestamps.length - 1;
        slider.value = String(currentIndex);
        var ts = timestamps[currentIndex];
        var dateEl = sliderControl._dateDisplay;
        if (dateEl) dateEl.textContent = formatDateTime(ts);
        updateHimawariUrl(ts);
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
      if (isBmkgLayer(e.basemap)) {
        activateBmkgLayer(e.basemap);
      } else {
        hideSlider();
        _activeKey = null;
      }
    });

    if (typeof currentBasemapName !== 'undefined' && isBmkgLayer(currentBasemapName)) {
      activateBmkgLayer(currentBasemapName);
    }
  });

  window.bmkgHimawariSliderCleanup = cleanup;
})();
