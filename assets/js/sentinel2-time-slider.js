/* ── Sentinel-2 Time Slider — EOX Cloudless XYZ ── */
(function () {
  'use strict';

  var SENTINEL2_LAYER_KEY = 'sentinel2';
  var YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024];
  var YEAR_URLS = {};
  YEARS.forEach(function (y) {
    YEAR_URLS[y] = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-' + y + '_3857/default/g/{z}/{y}/{x}.jpg';
  });
  YEAR_URLS['latest'] = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg';

  var sliderControl = null;
  var currentIndex = 0;
  var allYears = YEARS.concat(['latest']);

  function updateSentinel2Url(year) {
    var sentLayer = baseTileLayers[SENTINEL2_LAYER_KEY];
    if (!sentLayer) return;
    var url = YEAR_URLS[year] || YEAR_URLS['latest'];
    sentLayer.setUrl(url);
  }

  function ensureBottomCenterControlCorner() {
    if (map._controlCorners.bottomcenter) return;
    map._controlCorners.bottomcenter = L.DomUtil.create('div', 'leaflet-bottom leaflet-center', map._controlContainer);
  }

  ensureBottomCenterControlCorner();

  var Sentinel2TimeSliderControl = L.Control.extend({
    options: { position: 'bottomcenter' },
    onAdd: function () {
      var wrap = L.DomUtil.create('div', 'sentinel2-time-slider-wrap');
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

      if (typeof addUnifiedSlider !== 'function') {
        var titleRow = L.DomUtil.create('div', 'sentinel2-ts-title', wrap);
        titleRow.textContent = 'Sentinel-2';
      }

      var controlsRow = L.DomUtil.create('div', 'sentinel2-ts-controls', wrap);

      var prevBtn = L.DomUtil.create('button', 'sentinel2-ts-btn sentinel2-ts-prev', controlsRow);
      prevBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
      prevBtn.title = 'Tahun sebelumnya';

      var sliderWrap = L.DomUtil.create('div', 'sentinel2-ts-slider-wrap', controlsRow);
      var slider = L.DomUtil.create('input', 'sentinel2-ts-slider', sliderWrap);
      slider.type = 'range';
      slider.min = '0';
      slider.max = String(allYears.length - 1);
      slider.value = String(allYears.length - 1);
      slider.step = '1';

      var nextBtn = L.DomUtil.create('button', 'sentinel2-ts-btn sentinel2-ts-next', controlsRow);
      nextBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
      nextBtn.title = 'Tahun berikutnya';

      var infoRow = L.DomUtil.create('div', 'sentinel2-ts-info', wrap);
      var dateDisplay = L.DomUtil.create('span', 'sentinel2-ts-date', infoRow);
      dateDisplay.textContent = 'Latest';

      var timeDisplay = L.DomUtil.create('span', 'sentinel2-ts-time', infoRow);
      timeDisplay.textContent = 'Cloud-free mosaic';

      slider.addEventListener('input', function () {
        currentIndex = parseInt(this.value, 10);
        var year = allYears[currentIndex];
        dateDisplay.textContent = year === 'latest' ? 'Latest' : String(year);
        updateSentinel2Url(year);
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
        if (val < allYears.length - 1) {
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
      sliderControl = new Sentinel2TimeSliderControl();
      var el = sliderControl.onAdd(map);
      if (typeof addUnifiedSlider === 'function') {
        addUnifiedSlider('sentinel2', 'Sentinel-2', el);
      } else {
        sliderControl.addTo(map);
      }
    }
    _prevMaxZoom = map.getMaxZoom();
    map.setMaxZoom(13);
    if (map.getZoom() > 13) map.setZoom(10);
  }

  function hideSlider() {
    if (sliderControl) {
      if (typeof removeUnifiedSlider === 'function') removeUnifiedSlider('sentinel2');
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
    if (typeof baseTileLayers !== 'undefined' && baseTileLayers[SENTINEL2_LAYER_KEY]) {
      updateSentinel2Url('latest');
    }
    currentIndex = allYears.length - 1;
  }

  document.addEventListener('DOMContentLoaded', function () {
    map.on('basemapchanged', function (e) {
      if (e.basemap === SENTINEL2_LAYER_KEY) {
        showSlider();
      } else {
        hideSlider();
      }
    });

    if (typeof currentBasemapName !== 'undefined' && currentBasemapName === SENTINEL2_LAYER_KEY) {
      showSlider();
    }
  });

  window.sentinel2TimeSliderCleanup = cleanup;
})();
