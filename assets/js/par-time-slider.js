/* ── PAR (Photosynthetically Available Radiation) Time Slider — NASA GIBS WMTS ── */
(function () {
  'use strict';

  var LAYER_KEY = 'par';
  var GIBS_LAYER_ID = 'OCI_PACE_Photosynthetically_Available_Radiation';
  var GIBS_EXT = 'png';
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
    if (typeof window.updateParDate === 'function') {
      window.updateParDate(dateStr);
    }
  }

  var SliderControl = L.Control.extend({
    options: { position: 'bottomcenter' },
    onAdd: function () {
      var wrap = L.DomUtil.create('div', 'modis-time-slider-wrap');
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

      if (typeof addUnifiedSlider !== 'function') {
        var titleRow = L.DomUtil.create('div', 'modis-ts-title', wrap);
        titleRow.textContent = 'PAR - Radiasi Fotosintesis';
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
      slider.value = '-2';
      slider.step = '1';

      var nextBtn = L.DomUtil.create('button', 'modis-ts-btn modis-ts-next', controlsRow);
      nextBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
      nextBtn.title = 'Hari berikutnya';

      var infoRow = L.DomUtil.create('div', 'modis-ts-info', wrap);
      var dateDisplay = L.DomUtil.create('span', 'modis-ts-date', infoRow);
      dateDisplay.textContent = formatDate(getDateByOffset(-2));

      var timeDisplay = L.DomUtil.create('span', 'modis-ts-time', infoRow);
      timeDisplay.textContent = 'OCI PACE Level-7';

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

  function showLegend() {
    if (typeof addUnifiedLegend !== 'function') return;
    var div = L.DomUtil.create('div', 'himawari-legend');
    L.DomEvent.disableClickPropagation(div);
    div.innerHTML =
      '<div class="himawari-legend-title">Photosynthetically Available Radiation (PAR)</div>' +
      '<div class="himawari-legend-bar" style="background:linear-gradient(90deg,#1a0533,#3b0764,#7c3aed,#a855f7,#facc15,#fb923c,#ef4444);"></div>' +
      '<div class="himawari-legend-labels"><span>0 mol/m\u00B2/d</span><span>15</span><span>30</span><span>60+ mol/m\u00B2/d</span></div>' +
      '<div class="himawari-legend-items">' +
        '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#3b0764;"></span>Ungu — Rendah (&lt;5 mol/m\u00B2/d)</div>' +
        '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#a855f7;"></span>Ungu Muda — Sedang (5\u201315 mol/m\u00B2/d)</div>' +
        '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#facc15;"></span>Kuning — Tinggi (15\u201340 mol/m\u00B2/d)</div>' +
        '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#ef4444;"></span>Merah — Sangat Tinggi (&gt;40 mol/m\u00B2/d)</div>' +
      '</div>' +
      '<div class="himawari-legend-unit">Satuan: mol/m\u00B2/d (PAR) | Resolusi: 1 km</div>' +
      '<div class="himawari-legend-unit">Sumber: NASA GIBS / OCI PACE</div>';
    addUnifiedLegend('par', window.createLegendWithToggle(div));
  }

  function hideLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('par');
  }

  function showSlider() {
    if (!sliderControl) {
      sliderControl = new SliderControl();
      var el = sliderControl.onAdd(map);
      if (typeof addUnifiedSlider === 'function') {
        addUnifiedSlider('par', 'PAR - Radiasi Fotosintesis', el);
      } else {
        sliderControl.addTo(map);
      }
    }
    showLegend();
    _prevMaxZoom = map.getMaxZoom();
    map.setMaxZoom(7);
    if (map.getZoom() > 7) map.setZoom(5);
  }

  function hideSlider() {
    if (sliderControl) {
      if (typeof removeUnifiedSlider === 'function') removeUnifiedSlider('par');
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
    currentDayOffset = -2;
  }

  document.addEventListener('DOMContentLoaded', function () {
    window.parShowSlider = showSlider;
    window.parHideSlider = hideSlider;
  });

  window.parTimeSliderCleanup = cleanup;
})();
