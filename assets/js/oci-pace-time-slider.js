/* ── OCI PACE True Color Time Slider — NASA GIBS WMTS ── */
(function () {
  'use strict';

  var LAYER_KEY = 'oci-pace';
  var GIBS_LAYER_ID = 'OCI_PACE_True_Color';
  var GIBS_EXT = 'jpeg';
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

  function updateUrl(dateStr) {
    var layer = baseTileLayers[LAYER_KEY];
    if (!layer) return;
    var newUrl = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/' + GIBS_LAYER_ID + '/default/' + dateStr + '/GoogleMapsCompatible_Level7/{z}/{y}/{x}.' + GIBS_EXT;
    layer.setUrl(newUrl);
  }

  function ensureBottomCenterControlCorner() {
    if (map._controlCorners.bottomcenter) return;
    map._controlCorners.bottomcenter = L.DomUtil.create('div', 'leaflet-bottom leaflet-center', map._controlContainer);
  }

  var SliderControl = L.Control.extend({
    options: { position: 'bottomcenter' },
    onAdd: function () {
      var wrap = L.DomUtil.create('div', 'modis-time-slider-wrap');
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

      if (typeof addUnifiedSlider !== 'function') {
        var titleRow = L.DomUtil.create('div', 'modis-ts-title', wrap);
        titleRow.textContent = 'OCI PACE True Color';
      }

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
      timeDisplay.textContent = 'Overpass ~13:30 WIB';

      slider.addEventListener('input', function () {
        currentDayOffset = parseInt(this.value, 10);
        var d = getDateByOffset(currentDayOffset);
        var dateStr = formatISO(d);
        dateDisplay.textContent = formatDate(d);
        updateUrl(dateStr);
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
      sliderControl = new SliderControl();
      var el = sliderControl.onAdd(map);
      if (typeof addUnifiedSlider === 'function') {
        addUnifiedSlider('oci-pace', 'OCI PACE True Color', el);
      } else {
        sliderControl.addTo(map);
      }
    }
    _prevMaxZoom = map.getMaxZoom();
    map.setMaxZoom(7);
    if (map.getZoom() > 7) map.setZoom(5);
  }

  function hideSlider() {
    if (sliderControl) {
      if (typeof removeUnifiedSlider === 'function') removeUnifiedSlider('oci-pace');
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
      var yesterday = formatISO(getDateByOffset(-1));
      updateUrl(yesterday);
    }
    currentDayOffset = -1;
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

  window.ociPaceTimeSliderCleanup = cleanup;
})();
