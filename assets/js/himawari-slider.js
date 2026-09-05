/* ── Himawari Time Slider — Zoom Earth Tiles ── */
(function () {
  'use strict';

  var HIMAWARI_LAYER_KEY = 'himawari';
  var STEP_COUNT = 18;
  var STEP_MINUTES = 10;
  var sliderControl = null;
  var currentOffset = 0;

  function formatTime(offsetMin) {
    var t = getHimawariTime(offsetMin);
    return t.time.slice(0, 2) + ':' + t.time.slice(2);
  }

  function formatDate(offsetMin) {
    var t = getHimawariTime(offsetMin);
    return t.date;
  }

  function updateHimawariUrl(offsetMin) {
    var layer = baseTileLayers[HIMAWARI_LAYER_KEY];
    if (!layer) return;
    layer.setUrl(getHimawariTileUrl(offsetMin));
  }

  function ensureBottomCenterControlCorner() {
    if (!map || !map._controlCorners) return;
    if (map._controlCorners.bottomcenter) return;
    map._controlCorners.bottomcenter = L.DomUtil.create('div', 'leaflet-bottom leaflet-center', map._controlContainer);
  }

  var _prevMaxZoom = null;

  function showSlider() {
    ensureBottomCenterControlCorner();
    if (!sliderControl) {
      var HimawariTimeSliderControl = L.Control.extend({
        options: { position: 'bottomcenter' },
        onAdd: function () {
          var wrap = L.DomUtil.create('div', 'himawari-ts-wrap');
          L.DomEvent.disableClickPropagation(wrap);
          L.DomEvent.disableScrollPropagation(wrap);

          var prevBtn = L.DomUtil.create('button', 'himawari-ts-btn himawari-ts-prev', wrap);
          prevBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
          prevBtn.title = '10 menit sebelumnya';

          var sliderWrap = L.DomUtil.create('div', 'himawari-ts-slider-wrap', wrap);
          var slider = L.DomUtil.create('input', 'himawari-ts-slider', sliderWrap);
          slider.type = 'range';
          slider.min = String(-STEP_COUNT);
          slider.max = '0';
          slider.value = '0';
          slider.step = '1';

          var nextBtn = L.DomUtil.create('button', 'himawari-ts-btn himawari-ts-next', wrap);
          nextBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
          nextBtn.title = '10 menit berikutnya';

          var timeDisplay = L.DomUtil.create('div', 'himawari-ts-time', wrap);
          timeDisplay.textContent = formatTime(0) + ' UTC';

          var dateDisplay = L.DomUtil.create('div', 'himawari-ts-date', wrap);
          dateDisplay.textContent = formatDate(0);

          slider.addEventListener('input', function () {
            currentOffset = parseInt(this.value, 10) * STEP_MINUTES;
            timeDisplay.textContent = formatTime(currentOffset) + ' UTC';
            dateDisplay.textContent = formatDate(currentOffset);
            updateHimawariUrl(currentOffset);
          });

          prevBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            var val = parseInt(slider.value, 10);
            if (val > -STEP_COUNT) {
              slider.value = String(val - 1);
              slider.dispatchEvent(new Event('input'));
            }
          });

          nextBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            var val = parseInt(slider.value, 10);
            if (val < 0) {
              slider.value = String(val + 1);
              slider.dispatchEvent(new Event('input'));
            }
          });

          wrap._slider = slider;
          return wrap;
        }
      });
      sliderControl = new HimawariTimeSliderControl();
      sliderControl.addTo(map);
    }
    _prevMaxZoom = map.getMaxZoom();
    map.setMaxZoom(7);
    if (map.getZoom() > 7) map.setZoom(7);
  }

  function hideSlider() {
    if (sliderControl) {
      map.removeControl(sliderControl);
      sliderControl = null;
    }
    if (_prevMaxZoom !== null) {
      map.setMaxZoom(_prevMaxZoom);
      _prevMaxZoom = null;
    }
  }

  function cleanup() {
    hideSlider();
    if (typeof baseTileLayers !== 'undefined' && baseTileLayers[HIMAWARI_LAYER_KEY]) {
      updateHimawariUrl(0);
    }
    currentOffset = 0;
  }

  document.addEventListener('DOMContentLoaded', function () {
    map.on('basemapchanged', function (e) {
      if (e.basemap === HIMAWARI_LAYER_KEY) {
        showSlider();
      } else {
        hideSlider();
      }
    });

    if (typeof currentBasemapName !== 'undefined' && currentBasemapName === HIMAWARI_LAYER_KEY) {
      showSlider();
    }
  });

  window.himawariTimeSliderCleanup = cleanup;
})();
