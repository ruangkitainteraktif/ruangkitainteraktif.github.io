/* ── EOX Sentinel-2 Cloudless Time Slider ── */
(function () {
  'use strict';

  var LAYER_KEY = 'eox-s2cloudless-2024';
  var YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  var YEAR_URLS = {};
  YEARS.forEach(function (y) {
    YEAR_URLS[y] = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-' + y + '_3857/default/g/{z}/{y}/{x}.jpeg';
  });

  var sliderControl = null;
  var currentIndex = YEARS.length - 1;

  function updateUrl(year) {
    var layer = baseTileLayers[LAYER_KEY];
    if (!layer) return;
    layer.setUrl(YEAR_URLS[year]);
  }

  function ensureBottomCenterControlCorner() {
    if (map._controlCorners.bottomcenter) return;
    map._controlCorners.bottomcenter = L.DomUtil.create('div', 'leaflet-bottom leaflet-center', map._controlContainer);
  }

  ensureBottomCenterControlCorner();

  var EoxTimeSliderControl = L.Control.extend({
    options: { position: 'bottomcenter' },
    onAdd: function () {
      var wrap = L.DomUtil.create('div', 'sentinel2-time-slider-wrap');
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

      if (typeof addUnifiedSlider !== 'function') {
        var titleRow = L.DomUtil.create('div', 'sentinel2-ts-title', wrap);
        titleRow.textContent = 'Sentinel-2 Cloudless (EOX)';
      }

      var controlsRow = L.DomUtil.create('div', 'sentinel2-ts-controls', wrap);

      var prevBtn = L.DomUtil.create('button', 'sentinel2-ts-btn sentinel2-ts-prev', controlsRow);
      prevBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
      prevBtn.title = 'Tahun sebelumnya';

      var sliderWrap = L.DomUtil.create('div', 'sentinel2-ts-slider-wrap', controlsRow);
      var slider = L.DomUtil.create('input', 'sentinel2-ts-slider', sliderWrap);
      slider.type = 'range';
      slider.min = '0';
      slider.max = String(YEARS.length - 1);
      slider.value = String(currentIndex);
      slider.step = '1';

      var nextBtn = L.DomUtil.create('button', 'sentinel2-ts-btn sentinel2-ts-next', controlsRow);
      nextBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
      nextBtn.title = 'Tahun berikutnya';

      var infoRow = L.DomUtil.create('div', 'sentinel2-ts-info', wrap);
      var dateDisplay = L.DomUtil.create('span', 'sentinel2-ts-date', infoRow);
      dateDisplay.textContent = String(YEARS[currentIndex]);

      var timeDisplay = L.DomUtil.create('span', 'sentinel2-ts-time', infoRow);
      timeDisplay.textContent = 'Cloud-free composite';

      slider.addEventListener('input', function () {
        currentIndex = parseInt(this.value, 10);
        var year = YEARS[currentIndex];
        dateDisplay.textContent = String(year);
        updateUrl(year);
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
        if (val < YEARS.length - 1) {
          slider.value = String(val + 1);
          slider.dispatchEvent(new Event('input'));
        }
      });

      wrap._slider = slider;
      return wrap;
    }
  });

  var _prevMaxZoom = null;

  function showSlider() {
    if (!sliderControl) {
      sliderControl = new EoxTimeSliderControl();
      var el = sliderControl.onAdd(map);
      if (typeof addUnifiedSlider === 'function') {
        addUnifiedSlider(LAYER_KEY, 'Sentinel-2 Cloudless (EOX)', el);
      } else {
        sliderControl.addTo(map);
      }
    }
    _prevMaxZoom = map.getMaxZoom();
    map.setMaxZoom(14);
    if (map.getZoom() > 14) map.setZoom(10);
  }

  function hideSlider() {
    if (sliderControl) {
      if (typeof removeUnifiedSlider === 'function') removeUnifiedSlider(LAYER_KEY);
      else { try { map.removeControl(sliderControl); } catch (e) {} }
      sliderControl = null;
    }
    if (_prevMaxZoom !== null) {
      map.setMaxZoom(_prevMaxZoom);
      _prevMaxZoom = null;
    }
  }

  function cleanup() {
    hideSlider();
    if (typeof baseTileLayers !== 'undefined' && baseTileLayers[LAYER_KEY]) {
      updateUrl(2024);
    }
    currentIndex = YEARS.length - 1;
  }

  document.addEventListener('DOMContentLoaded', function () {
    map.on('basemapchanged', function (e) {
      if (e.basemap === LAYER_KEY) {
        showSlider();
      } else {
        hideSlider();
      }
    });

    if (typeof currentBasemapName !== 'undefined' && currentBasemapName === LAYER_KEY) {
      showSlider();
    }
  });

  window.eoxS2CloudlessSliderCleanup = cleanup;
})();
