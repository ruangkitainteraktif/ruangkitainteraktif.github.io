/* ── Aerosol & SO2 Time Slider — NASA GIBS WMTS ── */
(function () {
  'use strict';

  var DAY_COUNT = 30;
  var sliderControl = null;
  var currentDayOffset = -1;

  var MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  var LAYER_CONFIG = {
    'omi-aerosol-index':    { gibs: 'OMI_Aerosol_Index',                         defOffset: -1, maxZoom: 6, info: 'OMI Aerosol Index' },
    'omi-aod-abs':          { gibs: 'OMI_Absorbing_Aerosol_Optical_Depth',       defOffset: -1, maxZoom: 6, info: 'OMI Absorbing AOD' },
    'omi-modis-terra-aod':  { gibs: 'MODIS_Terra_Aerosol',                       defOffset: -1, maxZoom: 6, info: 'MODIS Terra AOD' },
    'omi-modis-aqua-aod':   { gibs: 'MODIS_Aqua_Aerosol',                       defOffset: -1, maxZoom: 6, info: 'MODIS Aqua AOD' },
    'omi-so2':              { gibs: 'OMI_SO2_Lower_Troposphere',                defOffset: -2, maxZoom: 6, info: 'OMI SO\u2082 Lower Trop' },
    'omi-so2-pbl':          { gibs: 'OMI_SO2_Planetary_Boundary_Layer',         defOffset: -2, maxZoom: 6, info: 'OMI SO\u2082 PBL' },
    'omps-noaa20-so2-lt':   { gibs: 'OMPS_NOAA20_SO2_Lower_Troposphere',       defOffset: -2, maxZoom: 6, info: 'OMPS NOAA-20 SO\u2082' },
    'omi-no2':              { gibs: 'OMI_Nitrogen_Dioxide_Tropo_Column',        defOffset: -8, maxZoom: 5, info: 'OMI NO\u2082' }
  };

  function formatDate(d) {
    return d.getDate() + ' ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatISO(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  }

  function getDateByOffset(offset) {
    var d = new Date();
    d.setDate(d.getDate() + offset);
    return d;
  }

  function buildTileUrl(gibsId, dateStr) {
    return 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/' + gibsId + '/default/' + dateStr + '/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png';
  }

  function updateAllActiveLayers(dateStr) {
    if (!window.omiLayers) return;
    Object.keys(LAYER_CONFIG).forEach(function (key) {
      var layer = window.omiLayers[key];
      if (layer && map.hasLayer(layer)) {
        var cfg = LAYER_CONFIG[key];
        layer.setUrl(buildTileUrl(cfg.gibs, dateStr));
      }
    });
  }

  function getActiveLayerInfo() {
    if (!window.omiLayers) return '';
    var found = null;
    Object.keys(LAYER_CONFIG).forEach(function (key) {
      var layer = window.omiLayers[key];
      if (layer && map.hasLayer(layer)) {
        found = LAYER_CONFIG[key].info;
      }
    });
    return found || 'Aerosol/SO\u2082';
  }

  function showLegend() {
    if (typeof addUnifiedLegend !== 'function') return;
    var div = L.DomUtil.create('div', 'omi-legend leaflet-bar');
    L.DomEvent.disableClickPropagation(div);
    div.innerHTML =
      '<div class="himawari-legend-title">' + getActiveLayerInfo() + '</div>' +
      '<div class="himawari-legend-bar" style="background:linear-gradient(90deg,#ffffd9,#edf8b1,#c7e9b4,#7fcdbb,#41b6c4,#1d91c0,#225ea8,#0c2c84);height:12px;border-radius:3px;"></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:10px;margin-top:2px;"><span>Low</span><span>Medium</span><span>High</span></div>' +
      '<div class="himawari-legend-unit">Sumber: NASA GIBS</div>';
    addUnifiedLegend('aerosol-so2', typeof createLegendWithToggle === 'function' ? createLegendWithToggle(div) : div);
  }

  function hideLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('aerosol-so2');
  }

  function isAnyActive() {
    if (!window.omiLayers) return false;
    return Object.keys(LAYER_CONFIG).some(function (key) {
      var layer = window.omiLayers[key];
      return layer && map.hasLayer(layer);
    });
  }

  var SliderControl = L.Control.extend({
    options: { position: 'bottomcenter' },
    onAdd: function () {
      var wrap = L.DomUtil.create('div', 'modis-time-slider-wrap');
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

      if (typeof addUnifiedSlider !== 'function') {
        var titleRow = L.DomUtil.create('div', 'modis-ts-title', wrap);
        titleRow.textContent = 'Aerosol & SO\u2082';
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
      slider.value = String(currentDayOffset);
      slider.step = '1';

      var nextBtn = L.DomUtil.create('button', 'modis-ts-btn modis-ts-next', controlsRow);
      nextBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
      nextBtn.title = 'Hari berikutnya';

      var infoRow = L.DomUtil.create('div', 'modis-ts-info', wrap);
      var dateDisplay = L.DomUtil.create('span', 'modis-ts-date', infoRow);
      dateDisplay.textContent = formatDate(getDateByOffset(currentDayOffset));

      var timeDisplay = L.DomUtil.create('span', 'modis-ts-time', infoRow);
      timeDisplay.textContent = 'NASA GIBS Level-6';

      slider.addEventListener('input', function () {
        currentDayOffset = parseInt(this.value, 10);
        var d = getDateByOffset(currentDayOffset);
        var dateStr = formatISO(d);
        dateDisplay.textContent = formatDate(d);
        updateAllActiveLayers(dateStr);
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
        addUnifiedSlider('aerosol-so2', 'Aerosol & SO\u2082', el);
      } else {
        sliderControl.addTo(map);
      }
    }
    showLegend();
  }

  function hideSlider() {
    if (sliderControl) {
      if (typeof removeUnifiedSlider === 'function') removeUnifiedSlider('aerosol-so2');
      else { try { map.removeControl(sliderControl); } catch (e) {} }
      sliderControl = null;
    }
    hideLegend();
  }

  function checkVisibility() {
    if (isAnyActive()) {
      showSlider();
    } else {
      hideSlider();
    }
  }

  function cleanup() {
    hideSlider();
    currentDayOffset = -1;
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (window.omiLayers) {
      Object.keys(LAYER_CONFIG).forEach(function (key) {
        var layer = window.omiLayers[key];
        if (!layer) return;
        var origOnAdd = layer.onAdd;
        layer.onAdd = function (map) {
          var r = origOnAdd.call(this, map);
          setTimeout(checkVisibility, 50);
          return r;
        };
        var origOnRemove = layer.onRemove;
        layer.onRemove = function (map) {
          var r = origOnRemove.call(this, map);
          setTimeout(checkVisibility, 50);
          return r;
        };
      });
    }
  });

  window.aerosolSo2SliderCleanup = cleanup;
})();
