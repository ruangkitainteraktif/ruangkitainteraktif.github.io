/* Sentinel-2 L1C date slider for the Esri ImageServer basemap. */
(function () {
  'use strict';

  var LAYER_KEY = 'sentinel2-l1c';
  var DAY_MS = 24 * 60 * 60 * 1000;
  var sliderControl = null;
  var selectedDay = null;

  function utcDay(timestamp) {
    return Math.floor(timestamp / DAY_MS) * DAY_MS;
  }

  function formatDay(timestamp) {
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
    }).format(new Date(timestamp));
  }

  function setSelectedDay(timestamp) {
    var layer = baseTileLayers[LAYER_KEY];
    if (!layer || typeof layer.setTimeRange !== 'function') return;
    selectedDay = utcDay(timestamp);
    layer.setTimeRange(new Date(selectedDay), new Date(selectedDay + DAY_MS - 1));
  }

  function ensureBottomCenterControlCorner() {
    if (map._controlCorners.bottomcenter) return;
    map._controlCorners.bottomcenter = L.DomUtil.create(
      'div', 'leaflet-bottom leaflet-center', map._controlContainer
    );
  }

  ensureBottomCenterControlCorner();

  var Sentinel2L1CTimeControl = L.Control.extend({
    options: { position: 'bottomcenter' },
    onAdd: function () {
      var wrap = L.DomUtil.create('div', 'sentinel2-time-slider-wrap');
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

      if (typeof addUnifiedSlider !== 'function') {
        var title = L.DomUtil.create('div', 'sentinel2-ts-title', wrap);
        title.textContent = 'Sentinel-2 L1C';
      }

      var controls = L.DomUtil.create('div', 'sentinel2-ts-controls', wrap);
      var prev = L.DomUtil.create('button', 'sentinel2-ts-btn sentinel2-ts-prev', controls);
      prev.type = 'button';
      prev.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
      prev.title = 'Hari sebelumnya';

      var sliderWrap = L.DomUtil.create('div', 'sentinel2-ts-slider-wrap', controls);
      var slider = L.DomUtil.create('input', 'sentinel2-ts-slider', sliderWrap);
      var maxDay = utcDay(Date.now());
      var minDate = new Date(maxDay);
      minDate.setUTCMonth(minDate.getUTCMonth() - 14);
      slider.type = 'range';
      slider.min = String(utcDay(minDate.getTime()));
      slider.max = String(maxDay);
      slider.step = String(DAY_MS);
      slider.value = String(selectedDay === null ? maxDay : selectedDay);

      var next = L.DomUtil.create('button', 'sentinel2-ts-btn sentinel2-ts-next', controls);
      next.type = 'button';
      next.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
      next.title = 'Hari berikutnya';

      var info = L.DomUtil.create('div', 'sentinel2-ts-info', wrap);
      var dateLabel = L.DomUtil.create('span', 'sentinel2-ts-date', info);
      var detailLabel = L.DomUtil.create('span', 'sentinel2-ts-time', info);

      function refreshLabel() {
        dateLabel.textContent = selectedDay === null ? 'Terbaru' : formatDay(Number(slider.value));
        detailLabel.textContent = selectedDay === null
          ? 'Komposit terbaik · Esri'
          : 'Sentinel-2 L1C · tanggal pilihan';
      }

      slider.addEventListener('input', function () {
        dateLabel.textContent = formatDay(Number(slider.value));
        detailLabel.textContent = 'Lepas slider untuk memuat tanggal';
      });
      slider.addEventListener('change', function () {
        setSelectedDay(Number(slider.value));
        refreshLabel();
      });

      function moveDay(offset) {
        var nextValue = Math.max(Number(slider.min), Math.min(Number(slider.max), Number(slider.value) + offset * DAY_MS));
        slider.value = String(nextValue);
        setSelectedDay(nextValue);
        refreshLabel();
      }
      prev.addEventListener('click', function () { moveDay(-1); });
      next.addEventListener('click', function () { moveDay(1); });

      refreshLabel();
      return wrap;
    }
  });

  function showSlider() {
    if (sliderControl) return;
    sliderControl = new Sentinel2L1CTimeControl();
    var element = sliderControl.onAdd(map);
    if (typeof addUnifiedSlider === 'function') {
      addUnifiedSlider(LAYER_KEY, 'Sentinel-2 L1C (Esri)', element);
    } else {
      sliderControl.addTo(map);
    }
  }

  function hideSlider() {
    if (!sliderControl) return;
    if (typeof removeUnifiedSlider === 'function') removeUnifiedSlider(LAYER_KEY);
    else { try { map.removeControl(sliderControl); } catch (e) {} }
    sliderControl = null;
  }

  document.addEventListener('DOMContentLoaded', function () {
    map.on('basemapchanged', function (event) {
      if (event.basemap === LAYER_KEY) showSlider();
      else hideSlider();
    });
    if (typeof currentBasemapName !== 'undefined' && currentBasemapName === LAYER_KEY) showSlider();
  });
})();
