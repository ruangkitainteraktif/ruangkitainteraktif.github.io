/* ── MODIS Terra Time Slider — NASA GIBS WMTS ── */
(function () {
  'use strict';

  var MODIS_LAYER_KEY = 'modis-terra';
  var DAY_COUNT = 30;
  var sliderControl = null;
  var currentDayOffset = 0;

  var MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  function formatDate(d) {
    return d.getDate() + ' ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatISO(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  }

  function getToday() {
    return new Date();
  }

  function getDateByOffset(offset) {
    var d = getToday();
    d.setDate(d.getDate() + offset);
    return d;
  }

  function updateModisUrl(dateStr) {
    var modisLayer = baseTileLayers[MODIS_LAYER_KEY];
    if (!modisLayer) return;
    var newUrl = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/' + dateStr + '/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg';
    modisLayer.setUrl(newUrl);
  }

  function ensureBottomCenterControlCorner() {
    if (map._controlCorners.bottomcenter) return;
    map._controlCorners.bottomcenter = L.DomUtil.create('div', 'leaflet-bottom leaflet-center', map._controlContainer);
  }

  ensureBottomCenterControlCorner();

  var ModisTimeSliderControl = L.Control.extend({
    options: { position: 'bottomcenter' },
    onAdd: function () {
      var wrap = L.DomUtil.create('div', 'modis-time-slider-wrap');
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

      var titleRow = L.DomUtil.create('div', 'modis-ts-title', wrap);
      titleRow.textContent = 'MODIS Terra';

      var controlsRow = L.DomUtil.create('div', 'modis-ts-controls', wrap);

      var prevBtn = L.DomUtil.create('button', 'modis-ts-btn modis-ts-prev', controlsRow);
      prevBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
      prevBtn.title = 'Hari sebelumnya';

      var sliderWrap = L.DomUtil.create('div', 'modis-ts-slider-wrap', controlsRow);
      var slider = L.DomUtil.create('input', 'modis-ts-slider', sliderWrap);
      slider.type = 'range';
      slider.min = String(-DAY_COUNT);
      slider.max = '0';
      slider.value = '-1';
      slider.step = '1';

      var nextBtn = L.DomUtil.create('button', 'modis-ts-btn modis-ts-next', controlsRow);
      nextBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
      nextBtn.title = 'Hari berikutnya';

      var infoRow = L.DomUtil.create('div', 'modis-ts-info', wrap);
      var dateDisplay = L.DomUtil.create('span', 'modis-ts-date', infoRow);
      dateDisplay.textContent = formatDate(getDateByOffset(-1));

      var timeDisplay = L.DomUtil.create('span', 'modis-ts-time', infoRow);
      timeDisplay.textContent = 'Overpass ~10:30 WIB';

      slider.addEventListener('input', function () {
        currentDayOffset = parseInt(this.value, 10);
        var d = getDateByOffset(currentDayOffset);
        var dateStr = formatISO(d);
        dateDisplay.textContent = formatDate(d);
        updateModisUrl(dateStr);
      });

      prevBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var val = parseInt(slider.value, 10);
        if (val > -DAY_COUNT) {
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

  var _prevMaxZoom = null;

  function showSlider() {
    if (!sliderControl) {
      sliderControl = new ModisTimeSliderControl();
      sliderControl.addTo(map);
    }
    _prevMaxZoom = map.getMaxZoom();
    map.setMaxZoom(9);
    if (map.getZoom() > 9) map.setZoom(6);
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
    if (typeof baseTileLayers !== 'undefined' && baseTileLayers[MODIS_LAYER_KEY]) {
      var today = formatISO(getDateByOffset(-1));
      updateModisUrl(today);
    }
    currentDayOffset = -1;
  }

  document.addEventListener('DOMContentLoaded', function () {
    map.on('basemapchanged', function (e) {
      if (e.basemap === MODIS_LAYER_KEY) {
        showSlider();
      } else {
        hideSlider();
      }
    });

    if (typeof currentBasemapName !== 'undefined' && currentBasemapName === MODIS_LAYER_KEY) {
      showSlider();
    }
  });

  window.modisTimeSliderCleanup = cleanup;
})();
