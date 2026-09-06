/* ── Sentinel-5P TMS Time Slider — S5P-PAL ── */
(function () {
  'use strict';

  var S5P_BASE = 'https://s5p-pal-nl-l3-tms.obs.eu-nl.otc.t-systems.com';

  var S5P_PRODUCTS = {
    's5p-cloud-fraction': {
      product: 'cloud-fraction', period: 'day', version: '001',
      label: 'Sentinel-5P Cloud Fraction', shortLabel: 'Cloud Fraction',
      unit: '0 – 1', colorScale: 'cloud-fraction'
    },
    's5p-no2-tropo': {
      product: 'no2-tropospheric', period: 'fortnight', version: '001',
      label: 'Sentinel-5P NO\u2082 Tropospheric', shortLabel: 'NO\u2082 Tropospheric',
      unit: '\u00b5mol/m\u00b2', colorScale: 'no2'
    },
    's5p-ch4': {
      product: 'ch4', period: 'month', version: '001',
      label: 'Sentinel-5P CH\u2084', shortLabel: 'CH\u2084',
      unit: 'ppb', colorScale: 'ch4'
    },
    's5p-hcho': {
      product: 'hcho', period: 'month', version: '001',
      label: 'Sentinel-5P HCHO', shortLabel: 'Formaldehyde',
      unit: '\u00b5mol/m\u00b2', colorScale: 'hcho'
    },
    's5p-co': {
      product: 'co', period: 'month', version: '001',
      label: 'Sentinel-5P CO', shortLabel: 'Carbon Monoxide',
      unit: 'ppb', colorScale: 'co'
    },
    's5p-so2': {
      product: 'so2-7km-nrt', period: 'month', version: '001',
      label: 'Sentinel-5P SO\u2082', shortLabel: 'SO\u2082',
      unit: 'ppb', colorScale: 'so2'
    },
    's5p-o3': {
      product: 'o3', period: 'month', version: '001',
      label: 'Sentinel-5P O\u2083', shortLabel: 'Ozone',
      unit: 'ppb', colorScale: 'o3'
    }
  };

  var S5P_DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function isLeapYear(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
  function daysInMonth(y, m) { return m === 2 && isLeapYear(y) ? 29 : S5P_DAYS_IN_MONTH[m - 1]; }

  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtYMD(d) { return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()); }

  function addDays(d, n) {
    var r = new Date(d); r.setDate(r.getDate() + n); return r;
  }

  function fmtDateShort(d) {
    return d.getDate() + ' ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
  }

  function fmtPeriodLabel(start, end) {
    return fmtDateShort(start) + ' – ' + fmtDateShort(end);
  }

  /* ── Date Generation ── */
  function generateDates(info) {
    var dates = [];
    var period = info.period;
    var startDate = new Date(2018, 3, 30); // 30 Apr 2018
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    if (period === 'day') {
      var d = new Date(startDate);
      while (d <= today) {
        var end = addDays(d, 3);
        if (end >= startDate) {
          dates.push({ start: fmtYMD(d), end: fmtYMD(end), label: fmtPeriodLabel(d, end) });
        }
        d = addDays(d, 1);
      }
    } else if (period === 'fortnight') {
      var d = new Date(startDate);
      while (d <= today) {
        var end = addDays(d, 13);
        dates.push({ start: fmtYMD(d), end: fmtYMD(end), label: fmtPeriodLabel(d, end) });
        d = addDays(d, 7);
      }
    } else if (period === 'month') {
      for (var y = 2018; y <= today.getFullYear(); y++) {
        var mStart = (y === 2018) ? 5 : 1;
        for (var m = mStart; m <= 12; m++) {
          var ms = new Date(y, m - 1, 1);
          if (ms > today) break;
          var me = new Date(y, m - 1, daysInMonth(y, m));
          dates.push({ start: fmtYMD(ms), end: fmtYMD(me), label: fmtPeriodLabel(ms, me) });
        }
      }
    } else if (period === 'season') {
      var seasons = [[12, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]];
      for (var y = 2018; y <= today.getFullYear(); y++) {
        for (var si = 0; si < seasons.length; si++) {
          var sm = seasons[si];
          var ss = new Date(y, sm[1] - 1, 1);
          if (ss > today) continue;
          var se = new Date(y, sm[2] - 1, daysInMonth(y, sm[2]));
          dates.push({ start: fmtYMD(ss), end: fmtYMD(se), label: fmtPeriodLabel(ss, se) });
        }
      }
    } else if (period === 'year') {
      for (var y = 2018; y <= today.getFullYear(); y++) {
        var ys = new Date(y, 0, 1);
        var ye = new Date(y, 11, 31);
        dates.push({ start: fmtYMD(ys), end: fmtYMD(ye), label: fmtPeriodLabel(ys, ye) });
      }
    }

    // Filter to dates that are not in the future
    var todayStr = fmtYMD(today);
    dates = dates.filter(function (d) { return d.start <= todayStr; });
    return dates;
  }

  function buildDatasetPath(info, dateEntry) {
    return 'l3tms/s5p/' + info.product + '/' + info.version + '/' + info.period +
      '/' + dateEntry.start.substring(0, 4) + '/' + dateEntry.start.substring(4, 6) +
      '/s5p-l3tms-' + info.product + '-' + info.version + '-' + info.period +
      '-' + dateEntry.start + '-' + dateEntry.end;
  }

  function buildTileUrl(info, dateEntry) {
    return S5P_BASE + '/' + buildDatasetPath(info, dateEntry) + '/{z}/{x}/{y}.png';
  }

  /* ── Legend ── */
  var LEGEND_HTML = {
    'cloud-fraction':
      '<div class="s5p-legend-title">Cloud Fraction</div>' +
      '<div class="s5p-legend-bar" style="background:linear-gradient(90deg,#1b2c62 0%,#3c5aa6 25%,#6db5e0 50%,#c8e8f9 75%,#ffffff 100%);"></div>' +
      '<div class="s5p-legend-labels"><span>0</span><span>0.25</span><span>0.5</span><span>0.75</span><span>1</span></div>' +
      '<div class="s5p-legend-unit">Unit: fraction (0–1)</div>',
    'no2':
      '<div class="s5p-legend-title">NO\u2082 Column Density</div>' +
      '<div class="s5p-legend-bar" style="background:linear-gradient(90deg,#f6f6f6 0%,#fee08b 25%,#f46d43 50%,#d73027 75%,#67001f 100%);"></div>' +
      '<div class="s5p-legend-labels"><span>0</span><span>45</span><span>90</span><span>135</span><span>180</span></div>' +
      '<div class="s5p-legend-unit">Unit: \u00b5mol/m\u00b2</div>',
    'ch4':
      '<div class="s5p-legend-title">CH\u2084 Column</div>' +
      '<div class="s5p-legend-bar" style="background:linear-gradient(90deg,#f7fbff 0%,#6baed6 50%,#08306b 100%);"></div>' +
      '<div class="s5p-legend-labels"><span>1800</span><span>1850</span><span>1900</span></div>' +
      '<div class="s5p-legend-unit">Unit: ppb</div>',
    'hcho':
      '<div class="s5p-legend-title">HCHO Column Density</div>' +
      '<div class="s5p-legend-bar" style="background:linear-gradient(90deg,#f7fcf5 0%,#74c476 50%,#00441b 100%);"></div>' +
      '<div class="s5p-legend-labels"><span>0</span><span>0.01</span><span>0.02</span></div>' +
      '<div class="s5p-legend-unit">Unit: \u00b5mol/m\u00b2</div>',
    'co':
      '<div class="s5p-legend-title">CO Column Density</div>' +
      '<div class="s5p-legend-bar" style="background:linear-gradient(90deg,#fff7ec 0%,#fc8d59 50%,#7f0000 100%);"></div>' +
      '<div class="s5p-legend-labels"><span>0</span><span>0.05</span><span>0.1</span></div>' +
      '<div class="s5p-legend-unit">Unit: mol/m\u00b2</div>',
    'so2':
      '<div class="s5p-legend-title">SO\u2082 Column Density</div>' +
      '<div class="s5p-legend-bar" style="background:linear-gradient(90deg,#fff7ec 0%,#fc8d59 50%,#7f0000 100%);"></div>' +
      '<div class="s5p-legend-labels"><span>0</span><span>0.5</span><span>1</span></div>' +
      '<div class="s5p-legend-unit">Unit: Dobson Units</div>',
    'o3':
      '<div class="s5p-legend-title">O\u2083 Column Density</div>' +
      '<div class="s5p-legend-bar" style="background:linear-gradient(90deg,#f7fcf5 0%,#74c476 50%,#00441b 100%);"></div>' +
      '<div class="s5p-legend-labels"><span>0</span><span>0.2</span><span>0.4</span></div>' +
      '<div class="s5p-legend-unit">Unit: mol/m\u00b2</div>'
  };

  /* ── State ── */
  var sliderControl = null;
  var legendControl = null;
  var currentIndex = 0;
  var dates = [];
  var _activeKey = null;
  var _prevMaxZoom = null;
  var _titleRow = null;

  /* ── Helpers ── */
  function isS5pLayer(key) { return S5P_PRODUCTS.hasOwnProperty(key); }

  function ensureBottomCenterControlCorner() {
    if (map._controlCorners.bottomcenter) return;
    map._controlCorners.bottomcenter = L.DomUtil.create('div', 'leaflet-bottom leaflet-center', map._controlContainer);
  }
  ensureBottomCenterControlCorner();

  /* ── Tile Update ── */
  function updateTileUrl(dateEntry) {
    if (!_activeKey || !dateEntry) return;
    var layer = baseTileLayers[_activeKey];
    if (!layer) return;
    var info = S5P_PRODUCTS[_activeKey];
    layer.setUrl(buildTileUrl(info, dateEntry));
  }

  /* ── Legend Control ── */
  var S5pLegendControl = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd: function () {
      var div = L.DomUtil.create('div', 's5p-legend leaflet-bar');
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      var info = S5P_PRODUCTS[_activeKey];
      div.innerHTML = LEGEND_HTML[info ? info.colorScale : 'cloud-fraction'] || '';
      return div;
    }
  });

  function showLegend() {
    if (!legendControl) {
      legendControl = new S5pLegendControl();
      legendControl.addTo(map);
    }
  }

  function hideLegend() {
    if (legendControl) {
      map.removeControl(legendControl);
      legendControl = null;
    }
  }

  /* ── Time Slider Control ── */
  var S5pTimeSliderControl = L.Control.extend({
    options: { position: 'bottomcenter' },
    onAdd: function () {
      var wrap = L.DomUtil.create('div', 'bmkg-time-slider-wrap');
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

      var titleRow = L.DomUtil.create('div', 'bmkg-ts-title', wrap);
      titleRow.textContent = S5P_PRODUCTS[_activeKey] ? S5P_PRODUCTS[_activeKey].label : 'Sentinel-5P';
      _titleRow = titleRow;

      var controlsRow = L.DomUtil.create('div', 'bmkg-ts-controls', wrap);

      var prevBtn = L.DomUtil.create('button', 'bmkg-ts-btn bmkg-ts-prev', controlsRow);
      prevBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
      prevBtn.title = 'Sebelumnya';

      var sliderWrap = L.DomUtil.create('div', 'bmkg-ts-slider-wrap', controlsRow);
      var slider = L.DomUtil.create('input', 'bmkg-ts-slider', sliderWrap);
      slider.type = 'range';
      slider.min = '0';
      slider.max = '0';
      slider.value = '0';
      slider.step = '1';

      var nextBtn = L.DomUtil.create('button', 'bmkg-ts-btn bmkg-ts-next', controlsRow);
      nextBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
      nextBtn.title = 'Berikutnya';

      var infoRow = L.DomUtil.create('div', 'bmkg-ts-info', wrap);
      var dateDisplay = L.DomUtil.create('span', 'bmkg-ts-date', infoRow);
      dateDisplay.textContent = 'Memuat...';

      var countDisplay = L.DomUtil.create('span', 'bmkg-ts-time', infoRow);
      countDisplay.textContent = '';

      function applyTimestamp() {
        if (dates.length === 0) return;
        var d = dates[currentIndex];
        dateDisplay.textContent = d.label;
        countDisplay.textContent = (currentIndex + 1) + ' / ' + dates.length;
        updateTileUrl(d);
      }

      slider.addEventListener('input', function () {
        currentIndex = parseInt(this.value, 10);
        applyTimestamp();
      });

      prevBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var val = parseInt(slider.value, 10);
        if (val > 0) { slider.value = String(val - 1); slider.dispatchEvent(new Event('input')); }
      });

      nextBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var val = parseInt(slider.value, 10);
        if (val < dates.length - 1) { slider.value = String(val + 1); slider.dispatchEvent(new Event('input')); }
      });

      if (dates.length > 0) {
        slider.max = String(dates.length - 1);
        currentIndex = dates.length - 1;
        slider.value = String(currentIndex);
        applyTimestamp();
      } else {
        dateDisplay.textContent = 'Data tidak tersedia';
      }

      wrap._slider = slider;
      wrap._dateDisplay = dateDisplay;
      return wrap;
    }
  });

  function showSlider() {
    if (!sliderControl) {
      sliderControl = new S5pTimeSliderControl();
      sliderControl.addTo(map);
    }
    showLegend();
    _prevMaxZoom = map.getMaxZoom();
    map.setMaxZoom(9);
    if (map.getZoom() > 9) map.setZoom(5);
  }

  function hideSlider() {
    if (sliderControl) {
      map.removeControl(sliderControl);
      sliderControl = null;
    }
    hideLegend();
    if (_prevMaxZoom !== null) {
      map.setMaxZoom(_prevMaxZoom);
      _prevMaxZoom = null;
    }
  }

  /* ── Activation ── */
  function activateS5pLayer(key) {
    _activeKey = key;
    currentIndex = 0;
    dates = [];
    hideSlider();

    var info = S5P_PRODUCTS[key];
    if (!info) return;

    dates = generateDates(info);

    // Set URL before adding to map to avoid empty-URL tile requests
    if (dates.length > 0) {
      var layer = baseTileLayers[key];
      if (layer) {
        currentIndex = dates.length - 1;
        layer.setUrl(buildTileUrl(info, dates[currentIndex]));
        if (!map.hasLayer(layer)) layer.addTo(map);
      }
    }

    showSlider();
  }

  function cleanup() {
    hideSlider();
    // Remove S5P layer from map
    if (_activeKey) {
      var layer = baseTileLayers[_activeKey];
      if (layer && map.hasLayer(layer)) map.removeLayer(layer);
    }
    dates = [];
    currentIndex = 0;
    _activeKey = null;
    _titleRow = null;
  }

  /* ── Event Listeners ── */
  document.addEventListener('DOMContentLoaded', function () {
    map.on('basemapchanged', function (e) {
      if (isS5pLayer(e.basemap)) {
        activateS5pLayer(e.basemap);
      } else if (_activeKey) {
        cleanup();
      }
    });

    if (typeof currentBasemapName !== 'undefined' && isS5pLayer(currentBasemapName)) {
      activateS5pLayer(currentBasemapName);
    }
  });

  window.s5pTmsSliderCleanup = cleanup;
})();
