/* ── NOAA Nowcoast Visible Imagery Time Slider ── */
(function () {
  'use strict';

  var LAYER_KEY = 'nowcoast-visible-imagery';
  var sliderControl = null;
  var legendControl = null;
  var currentTimestamp = null;
  var _prevMaxZoom = null;

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

  function formatDateTime(isoStr) {
    var d = new Date(isoStr);
    var day = String(d.getUTCDate()).padStart(2, '0');
    var month = MONTH_NAMES[d.getUTCMonth()];
    var year = d.getUTCFullYear();
    var time = formatTime(isoStr);
    return day + ' ' + month + ' ' + year + ' ' + time;
  }

  function formatISO(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  }

  function ensureBottomCenterControlCorner() {
    if (map._controlCorners.bottomcenter) return;
    map._controlCorners.bottomcenter = L.DomUtil.create('div', 'leaflet-bottom leaflet-center', map._controlContainer);
  }

  ensureBottomCenterControlCorner();

  var NowcoastTimeSliderControl = L.Control.extend({
    options: { position: 'bottomcenter' },
    onAdd: function () {
      var wrap = L.DomUtil.create('div', 'nowcoast-ts-wrap');
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

      var titleRow = L.DomUtil.create('div', 'nowcoast-ts-title', wrap);
      titleRow.textContent = 'NOAA Visible Imagery';

      var controlsRow = L.DomUtil.create('div', 'nowcoast-ts-controls', wrap);

      var prevBtn = L.DomUtil.create('button', 'nowcoast-ts-btn nowcoast-ts-prev', controlsRow);
      prevBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
      prevBtn.title = 'Sebelumnya';

      var sliderWrap = L.DomUtil.create('div', 'nowcoast-ts-slider-wrap', controlsRow);
      var slider = L.DomUtil.create('input', 'nowcoast-ts-slider', sliderWrap);
      slider.type = 'range';
      slider.min = '0';
      slider.max = '0';
      slider.value = '0';
      slider.step = '1';

      var nextBtn = L.DomUtil.create('button', 'nowcoast-ts-btn nowcoast-ts-next', controlsRow);
      nextBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
      nextBtn.title = 'Berikutnya';

      var infoRow = L.DomUtil.create('div', 'nowcoast-ts-info', wrap);
      var dateDisplay = L.DomUtil.create('span', 'nowcoast-ts-date', infoRow);
      dateDisplay.textContent = '—';

      var timeDisplay = L.DomUtil.create('span', 'nowcoast-ts-time', infoRow);
      timeDisplay.textContent = '';

      wrap._slider = slider;
      wrap._dateDisplay = dateDisplay;
      wrap._timeDisplay = timeDisplay;
      wrap._filteredTimestamps = [];
      wrap._currentIndex = 0;

      function loadTimestamps(callback) {
        var timestamps = [];
        var now = new Date();
        for (var i = 0; i < 24; i++) {
          var d = new Date();
          d.setUTCDate(now.getUTCDate() - i);
          d.setUTCHours(3, 0, 0, 0);
          timestamps.push(formatISO(d));
        }
        timestamps.sort();
        wrap._filteredTimestamps = timestamps;
        callback(timestamps);
      }

      function updateLayerUrl(ts) {
        var layer = baseTileLayers[LAYER_KEY];
        if (!layer) return;
        var separator = layer.getUrl().includes('?') ? '&' : '?';
        layer.setUrl(layer.getUrl() + separator + 'TIME=' + encodeURIComponent(ts));
      }

      function updateTimeDisplay(ts) {
        currentTimestamp = ts;
        wrap._dateDisplay.textContent = formatDateTime(ts);
        var dateEl = wrap._timeDisplay;
        if (dateEl) {
          var d = new Date(ts);
          timeDisplay.textContent = 'Jam ' + formatTime(ts);
        }
        updateLayerUrl(ts);
      }

      function onSliderInput() {
        var val = parseInt(slider.value, 10);
        if (!isNaN(val) && wrap._filteredTimestamps && val >= 0 && val < wrap._filteredTimestamps.length) {
          updateTimeDisplay(wrap._filteredTimestamps[val]);
        }
      }

      function onPrevClick() {
        if (wrap._filteredTimestamps.length === 0) return;
        var val = parseInt(slider.value, 10);
        if (val > 0) {
          slider.value = String(val - 1);
          onSliderInput();
        }
      }

      function onNextClick() {
        if (wrap._filteredTimestamps.length === 0) return;
        var val = parseInt(slider.value, 10);
        if (val < wrap._filteredTimestamps.length - 1) {
          slider.value = String(val + 1);
          onSliderInput();
        }
      }

      fetchTimestamps = function (callback) {
        loadTimestamps(callback);
      };

      fetchTimestamps(function (timestamps) {
        wrap._filteredTimestamps = timestamps;
        slider.max = String(Math.max(0, timestamps.length - 1));
        wrap._currentIndex = timestamps.length - 1;
        slider.value = String(wrap._currentIndex);
        if (timestamps.length > 0) {
          updateTimeDisplay(timestamps[timestamps.length - 1]);
        }
      });

      prevBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        onPrevClick();
      });

      nextBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        onNextClick();
      });

      slider.addEventListener('input', function () {
        onSliderInput();
      });

      return wrap;
    }
  });

  function showLegend() {
    if (typeof addUnifiedLegend !== 'function') return;
    var div = L.DomUtil.create('div', 'nowcoast-legend');
    L.DomEvent.disableClickPropagation(div);
    div.innerHTML =
      '<div class="himawari-legend-title">Visible Imagery (Grayscale)</div>' +
      '<div class="himawari-legend-bar" style="background:linear-gradient(90deg,#000000 0%,#ffffff 100%);"></div>' +
      '<div class="himawari-legend-labels"><span>Gelap</span><span>Cerah</span></div>' +
      '<div class="himawari-legend-unit">Sumber: NOAA Nowcoast Satellite</div>';
    addUnifiedLegend('nowcoast-visible-imagery', window.createLegendWithToggle(div));
    legendControl = true;
  }

  function hideLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('nowcoast-visible-imagery');
    legendControl = null;
  }

  function showSlider() {
    if (!sliderControl) {
      sliderControl = new NowcoastTimeSliderControl();
      var el = sliderControl.onAdd(map);
      if (typeof addUnifiedSlider === 'function') {
        addUnifiedSlider('nowcoast-visible-imagery', 'NOAA Visible Imagery', el);
      } else {
        sliderControl.addTo(map);
      }
    }
    showLegend();
    _prevMaxZoom = map.getMaxZoom();
    map.setMaxZoom(22);
    if (map.getZoom() > 22) map.setZoom(5);
  }

  function hideSlider() {
    if (sliderControl) {
      if (typeof removeUnifiedSlider === 'function') removeUnifiedSlider('nowcoast-visible-imagery');
      else { try { map.removeControl(sliderControl); } catch (e) {} }
      sliderControl = null;
    }
    hideLegend();
    if (_prevMaxZoom !== null) {
      map.setMaxZoom(_prevMaxZoom);
      _prevMaxZoom = null;
    }
  }

  function cleanup() {
    hideSlider();
    hideLegend();
    currentTimestamp = null;
  }

  function activateNowcoastLayer() {
    hideSlider();
    fetchTimestamps(function (timestamps) {
      if (timestamps.length > 0) {
        showSlider();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    map.on('basemapchanged', function (e) {
      if (e.basemap === LAYER_KEY) {
        activateNowcoastLayer();
      } else {
        hideSlider();
      }
    });

    if (typeof currentBasemapName !== 'undefined' && currentBasemapName === LAYER_KEY) {
      activateNowcoastLayer();
    }
  });

  window.nowcoastVisibleImagerySliderCleanup = cleanup;
})();