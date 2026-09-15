/* ── BMKG 10-Day Precipitation Forecast Time Slider ── */
(function () {
  'use strict';

  var MAPSERVER_URL = 'https://gis.bmkg.go.id/arcgis/rest/services/prakicu10days/MapServer';
  var LAYER_KEY = 'bmkg-precip-10days';
  var DAYS = [
    { id: 23, label: 'Hari 1' },
    { id: 24, label: 'Hari 2' },
    { id: 25, label: 'Hari 3' },
    { id: 26, label: 'Hari 4' },
    { id: 27, label: 'Hari 5' },
    { id: 28, label: 'Hari 6' },
    { id: 29, label: 'Hari 7' },
    { id: 30, label: 'Hari 8' },
    { id: 31, label: 'Hari 9' },
    { id: 22, label: 'Hari 10' }
  ];

  var _layer = null;
  var sliderControl = null;
  var currentIndex = 0;
  var _active = false;

  function getMap() {
    if (typeof window._map !== 'undefined') return window._map;
    if (typeof map !== 'undefined') return map;
    return null;
  }

  function updateLayer(dayIndex) {
    var m = getMap();
    if (!m || !_layer) return;
    _layer.setLayers([DAYS[dayIndex].id]);
  }

  function ensureBottomCenterControlCorner() {
    var m = getMap();
    if (!m) return;
    if (m._controlCorners.bottomcenter) return;
    m._controlCorners.bottomcenter = L.DomUtil.create('div', 'leaflet-bottom leaflet-center', m._controlContainer);
  }

  function formatUpdateDate() {
    var d = new Date();
    var dd = String(d.getDate()).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var yyyy = d.getFullYear();
    return dd + '/' + mm + '/' + yyyy;
  }

  var PrecipTimeSliderControl = L.Control.extend({
    options: { position: 'bottomcenter' },
    onAdd: function () {
      var m = getMap();
      var wrap = L.DomUtil.create('div', 'sentinel2-time-slider-wrap');
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

      var controlsRow = L.DomUtil.create('div', 'sentinel2-ts-controls', wrap);

      var prevBtn = L.DomUtil.create('button', 'sentinel2-ts-btn sentinel2-ts-prev', controlsRow);
      prevBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
      prevBtn.title = 'Hari sebelumnya';

      var sliderWrap = L.DomUtil.create('div', 'sentinel2-ts-slider-wrap', controlsRow);
      var slider = L.DomUtil.create('input', 'sentinel2-ts-slider', sliderWrap);
      slider.type = 'range';
      slider.min = '0';
      slider.max = String(DAYS.length - 1);
      slider.value = String(currentIndex);
      slider.step = '1';

      var nextBtn = L.DomUtil.create('button', 'sentinel2-ts-btn sentinel2-ts-next', controlsRow);
      nextBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
      nextBtn.title = 'Hari berikutnya';

      var infoRow = L.DomUtil.create('div', 'sentinel2-ts-info', wrap);
      var dateDisplay = L.DomUtil.create('span', 'sentinel2-ts-date', infoRow);
      dateDisplay.textContent = DAYS[currentIndex].label;

      var timeDisplay = L.DomUtil.create('span', 'sentinel2-ts-time', infoRow);
      timeDisplay.textContent = 'Update: ' + formatUpdateDate();

      slider.addEventListener('input', function () {
        currentIndex = parseInt(this.value, 10);
        dateDisplay.textContent = DAYS[currentIndex].label;
        updateLayer(currentIndex);
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
        if (val < DAYS.length - 1) {
          slider.value = String(val + 1);
          slider.dispatchEvent(new Event('input'));
        }
      });

      wrap._slider = slider;
      return wrap;
    }
  });

  function showLegend() {
    if (typeof addUnifiedLegend !== 'function') return;
    var div = L.DomUtil.create('div', 'wind-legend');
    L.DomEvent.disableClickPropagation(div);
    div.innerHTML =
      '<div class="wind-legend-title">Curah Hujan Kumulatif (mm)</div>' +
      '<div class="wind-legend-bar" style="background:linear-gradient(90deg,#f0f9e8,#bae4bc,#7bccc4,#43a2ca,#f8a065,#f0743e,#e34a33,#b30000);"></div>' +
      '<div class="wind-legend-labels"><span>0</span><span>10</span><span>25</span><span>50</span><span>100</span><span>200</span><span>300</span></div>' +
      '<div class="wind-legend-unit">Sumber: BMKG prakicu10days</div>';
    addUnifiedLegend(LAYER_KEY, window.createLegendWithToggle(div));
  }

  function hideLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend(LAYER_KEY);
  }

  function showSlider() {
    var m = getMap();
    if (!m) return;
    if (!sliderControl) {
      ensureBottomCenterControlCorner();
      sliderControl = new PrecipTimeSliderControl();
      var el = sliderControl.onAdd(m);
      if (typeof addUnifiedSlider === 'function') {
        addUnifiedSlider(LAYER_KEY, 'Prakiraan Hujan 10 Hari (BMKG)', el);
      } else {
        sliderControl.addTo(m);
      }
    }
  }

  function hideSlider() {
    if (sliderControl) {
      if (typeof removeUnifiedSlider === 'function') removeUnifiedSlider(LAYER_KEY);
      else { try { var m = getMap(); if (m) m.removeControl(sliderControl); } catch (e) {} }
      sliderControl = null;
    }
  }

  window.toggleBmkgPrecip10days = function (visible) {
    var m = getMap();
    if (!m) return;

    if (!visible) {
      if (_layer && m.hasLayer(_layer)) {
        m.removeLayer(_layer);
      }
      _layer = null;
      hideSlider();
      hideLegend();
      _active = false;
      return;
    }

    if (!_layer) {
      _layer = L.esri.dynamicMapLayer({
        url: MAPSERVER_URL,
        opacity: 0.65,
        layers: [DAYS[currentIndex].id],
        format: 'png32',
        transparent: true
      });
    }

    _layer.addTo(m);
    _active = true;
    showSlider();
    showLegend();
  };

  window.isBmkgPrecip10daysActive = function () {
    return _active;
  };
})();
