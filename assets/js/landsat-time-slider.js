/* Landsat ImageServer acquisition year slider. */
(function () {
  'use strict';

  var LAYER_KEY = 'landsat-agriculture';
  var YEARS = [1975, 1990, 2000, 2005, 2010];
  for (var year = 2013; year <= new Date().getUTCFullYear(); year++) YEARS.push(year);
  var choices = YEARS.concat(['best']);
  var sliderControl = null;

  function applyChoice(choice) {
    var layer = baseTileLayers[LAYER_KEY];
    if (!layer || typeof layer.setTimeRange !== 'function') return;
    if (choice === 'best') {
      layer.setTimeRange(null, null);
      return;
    }
    var from = new Date(Date.UTC(choice, 0, 1, 0, 0, 0));
    var to = new Date(Date.UTC(choice + 1, 0, 1, 0, 0, 0) - 1);
    layer.setTimeRange(from, to);
  }

  function ensureBottomCenterControlCorner() {
    if (map._controlCorners.bottomcenter) return;
    map._controlCorners.bottomcenter = L.DomUtil.create('div', 'leaflet-bottom leaflet-center', map._controlContainer);
  }

  ensureBottomCenterControlCorner();

  var LandsatTimeSliderControl = L.Control.extend({
    options: { position: 'bottomcenter' },
    onAdd: function () {
      var wrap = L.DomUtil.create('div', 'modis-time-slider-wrap');
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

      if (typeof addUnifiedSlider !== 'function') {
        var title = L.DomUtil.create('div', 'modis-ts-title', wrap);
        title.textContent = 'Landsat';
      }

      var controls = L.DomUtil.create('div', 'modis-ts-controls', wrap);
      var prev = L.DomUtil.create('button', 'modis-ts-btn modis-ts-prev', controls);
      prev.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
      prev.title = 'Periode sebelumnya';

      var sliderWrap = L.DomUtil.create('div', 'modis-ts-slider-wrap', controls);
      var slider = L.DomUtil.create('input', 'modis-ts-slider', sliderWrap);
      slider.type = 'range';
      slider.min = '0';
      slider.max = String(choices.length - 1);
      slider.value = String(choices.length - 1);
      slider.step = '1';

      var next = L.DomUtil.create('button', 'modis-ts-btn modis-ts-next', controls);
      next.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
      next.title = 'Periode berikutnya';

      var info = L.DomUtil.create('div', 'modis-ts-info', wrap);
      var date = L.DomUtil.create('span', 'modis-ts-date', info);
      date.textContent = 'Best available';
      var detail = L.DomUtil.create('span', 'modis-ts-time', info);
      detail.textContent = 'Tahun akuisisi · 30 m';

      slider.addEventListener('input', function () {
        var choice = choices[parseInt(slider.value, 10)];
        date.textContent = choice === 'best' ? 'Best available' : String(choice);
        applyChoice(choice);
      });

      prev.addEventListener('click', function (event) {
        event.stopPropagation();
        var value = parseInt(slider.value, 10);
        if (value > 0) {
          slider.value = String(value - 1);
          slider.dispatchEvent(new Event('input'));
        }
      });
      next.addEventListener('click', function (event) {
        event.stopPropagation();
        var value = parseInt(slider.value, 10);
        if (value < choices.length - 1) {
          slider.value = String(value + 1);
          slider.dispatchEvent(new Event('input'));
        }
      });

      return wrap;
    }
  });

  function showSlider() {
    if (sliderControl) return;
    sliderControl = new LandsatTimeSliderControl();
    var element = sliderControl.onAdd(map);
    if (typeof addUnifiedSlider === 'function') addUnifiedSlider(LAYER_KEY, 'Landsat', element);
    else sliderControl.addTo(map);
  }

  function hideSlider() {
    if (!sliderControl) return;
    if (typeof removeUnifiedSlider === 'function') removeUnifiedSlider(LAYER_KEY);
    else { try { map.removeControl(sliderControl); } catch (error) {} }
    sliderControl = null;
    applyChoice('best');
  }

  document.addEventListener('DOMContentLoaded', function () {
    map.on('basemapchanged', function (event) {
      if (event.basemap === LAYER_KEY) showSlider();
      else hideSlider();
    });
    if (typeof currentBasemapName !== 'undefined' && currentBasemapName === LAYER_KEY) showSlider();
  });
})();
