/* ── VIIRS NOAA-20/21 Time Slider — NASA GIBS WMTS ── */
(function () {
  'use strict';

  var VIIRS_LAYERS = {
    'viirs-noaa20': {
      id: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor',
      ext: 'jpeg'
    },
    'viirs-noaa21': {
      id: 'VIIRS_NOAA21_CorrectedReflectance_TrueColor',
      ext: 'jpeg'
    }
  };
  var PROV_GEOJSON_URL = 'assets/data/bps/geojson/provinsi.geojson';
  var DAY_COUNT = 30;
  var sliderControl = null;
  var currentDayOffset = 0;
  var activeKey = null;
  var _provLayer = null;

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

  function updateViirsUrl(key, dateStr) {
    var layer = baseTileLayers[key];
    if (!layer) return;
    var meta = VIIRS_LAYERS[key];
    var newUrl = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/' + meta.id + '/default/' + dateStr + '/GoogleMapsCompatible_Level9/{z}/{y}/{x}.' + meta.ext;
    layer.setUrl(newUrl);
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
        } catch (e) {}
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

  var ViirsTimeSliderControl = L.Control.extend({
    options: { position: 'bottomcenter' },
    onAdd: function () {
      var wrap = L.DomUtil.create('div', 'modis-time-slider-wrap');
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

      var prevBtn = L.DomUtil.create('button', 'modis-ts-btn modis-ts-prev', wrap);
      prevBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
      prevBtn.title = 'Hari sebelumnya';

      var sliderWrap = L.DomUtil.create('div', 'modis-ts-slider-wrap', wrap);
      var slider = L.DomUtil.create('input', 'modis-ts-slider', sliderWrap);
      slider.type = 'range';
      slider.min = String(-DAY_COUNT);
      slider.max = '0';
      slider.value = '-1';
      slider.step = '1';

      var nextBtn = L.DomUtil.create('button', 'modis-ts-btn modis-ts-next', wrap);
      nextBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
      nextBtn.title = 'Hari berikutnya';

      var dateDisplay = L.DomUtil.create('div', 'modis-ts-date', wrap);
      dateDisplay.textContent = formatDate(getDateByOffset(-1));

      var timeDisplay = L.DomUtil.create('div', 'modis-ts-time', wrap);
      timeDisplay.textContent = 'Overpass ~20:30 WIB';

      slider.addEventListener('input', function () {
        currentDayOffset = parseInt(this.value, 10);
        var d = getDateByOffset(currentDayOffset);
        var dateStr = formatISO(d);
        dateDisplay.textContent = formatDate(d);
        if (activeKey) updateViirsUrl(activeKey, dateStr);
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

  function showSlider(key) {
    activeKey = key;
    ensureBottomCenterControlCorner();
    if (!sliderControl) {
      sliderControl = new ViirsTimeSliderControl();
      sliderControl.addTo(map);
    }
    loadProvinsiLayer();
    _prevMaxZoom = map.getMaxZoom();
    map.setMaxZoom(9);
    if (map.getZoom() > 9) map.setZoom(6);
  }

  function hideSlider() {
    if (sliderControl) {
      map.removeControl(sliderControl);
      sliderControl = null;
    }
    removeProvinsiLayer();
    activeKey = null;
    if (_prevMaxZoom !== null) {
      map.setMaxZoom(_prevMaxZoom);
      _prevMaxZoom = null;
    }
  }

  function cleanup() {
    hideSlider();
    Object.keys(VIIRS_LAYERS).forEach(function (key) {
      if (typeof baseTileLayers !== 'undefined' && baseTileLayers[key]) {
        var yesterday = (function () { var d = new Date(); d.setDate(d.getDate() - 1); return formatISO(d); })();
        updateViirsUrl(key, yesterday);
      }
    });
    currentDayOffset = -1;
  }

  document.addEventListener('DOMContentLoaded', function () {
    map.on('basemapchanged', function (e) {
      if (VIIRS_LAYERS[e.basemap]) {
        showSlider(e.basemap);
      } else {
        hideSlider();
      }
    });

    Object.keys(VIIRS_LAYERS).forEach(function (key) {
      if (typeof currentBasemapName !== 'undefined' && currentBasemapName === key) {
        showSlider(key);
      }
    });
  });

  window.viirsTimeSliderCleanup = cleanup;
})();
