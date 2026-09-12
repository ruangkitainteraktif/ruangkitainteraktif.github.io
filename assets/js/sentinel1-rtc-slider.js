/* ── Sentinel-1 RTC (SAR) Time Slider — Planetary Computer ── */
(function () {
  'use strict';

  var STAC_API = 'https://planetarycomputer.microsoft.com/api/stac/v1';
  var INDONESIA_BBOX = [95.0, -11.0, 141.0, 6.0];
  var BAND_EXPRESSION = '0.03 + log (10e-4 - log (0.05 / (0.02 + 2 * vv)));0.05 + exp (0.25 * (log (0.01 + 2 * vv) + log (0.02 + 5 * vh)));1 - log (0.05 / (0.045 - 0.9 * vv))';
  var RESCALE_PARAMS = ['0%2C.8000', '0%2C1.000', '0%2C1.000'];
  var COLLECTION = 'sentinel-1-rtc';
  var MAX_RESULTS = 100;

  var sliderControl = null;
  var legendControl = null;
  var currentIndex = 0;
  var scenes = [];
  var _fetchPromise = null;
  var _layer = null;
  var _prevMaxZoom = null;

  var MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
  ];

  function formatDateShort(isoStr) {
    var d = new Date(isoStr);
    return d.getUTCDate() + ' ' + MONTH_NAMES[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  function formatDateOnly(isoStr) {
    return formatDateShort(isoStr);
  }

  function buildTileUrl(scene) {
    var tilejsonUrl = scene.tilejsonUrl;
    if (!tilejsonUrl) return '';
    var sep = tilejsonUrl.indexOf('?') === -1 ? '?' : '&';
    return tilejsonUrl + sep +
      'expression=' + BAND_EXPRESSION +
      '&rescale=' + RESCALE_PARAMS[0] +
      '&rescale=' + RESCALE_PARAMS[1] +
      '&rescale=' + RESCALE_PARAMS[2] +
      '&asset_as_band=true' +
      '&format=png';
  }

  function getLayer() {
    if (!_layer) {
      _layer = L.tileLayer('', {
        maxZoom: 13,
        minZoom: 0,
        opacity: 0.85,
        attribution: 'Sentinel-1 RTC &copy; ESA / Microsoft Planetary Computer'
      });
    }
    return _layer;
  }

  function fetchScenes(callback) {
    if (_fetchPromise) { _fetchPromise.then(callback); return; }
    _fetchPromise = new Promise(function (resolve) {
      var today = new Date();
      var yyyy = today.getUTCFullYear();
      var mm = String(today.getUTCMonth() + 1).padStart(2, '0');
      var dd = String(today.getUTCDate()).padStart(2, '0');
      var todayStr = yyyy + '-' + mm + '-' + dd;
      var datetimeParam = '2014-01-01/' + todayStr;

      var url = STAC_API + '/search' +
        '?collections=' + COLLECTION +
        '&bbox=' + INDONESIA_BBOX.join(',') +
        '&datetime=' + datetimeParam +
        '&limit=' + MAX_RESULTS +
        '&sortby=-datetime';

      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            var data = JSON.parse(xhr.responseText);
            var features = data.features || [];
            var seen = {};
            var result = [];
            for (var i = 0; i < features.length; i++) {
              var f = features[i];
              var dt = f.properties && f.properties.datetime;
              if (!dt) continue;
              var dateKey = dt.substring(0, 10);
              if (seen[dateKey]) continue;
              seen[dateKey] = true;
              var tilejsonAsset = f.assets && f.assets.tilejson;
              if (!tilejsonAsset || !tilejsonAsset.href) continue;
              result.push({
                id: f.id,
                datetime: dt,
                dateKey: dateKey,
                tilejsonUrl: tilejsonAsset.href,
                bbox: f.bbox || null
              });
            }
            scenes = result;
            resolve(scenes);
          } catch (e) {
            console.error('[Sentinel1RTC] Failed to parse STAC response:', e);
            scenes = [];
            resolve([]);
          }
        } else {
          console.error('[Sentinel1RTC] STAC request failed:', xhr.status);
          scenes = [];
          resolve([]);
        }
      };
      xhr.send();
    });
    _fetchPromise.then(function () { callback(); });
  }

  function updateTileUrl(scene) {
    var layer = getLayer();
    var url = buildTileUrl(scene);
    if (!url) return;
    if (map.hasLayer(layer)) {
      layer.setUrl(url);
    }
  }

  function ensureBottomCenterControlCorner() {
    if (map._controlCorners.bottomcenter) return;
    map._controlCorners.bottomcenter = L.DomUtil.create('div', 'leaflet-bottom leaflet-center', map._controlContainer);
  }

  ensureBottomCenterControlCorner();

  var Sentinel1TimeSliderControl = L.Control.extend({
    options: { position: 'bottomcenter' },
    onAdd: function () {
      var wrap = L.DomUtil.create('div', 's1rtc-time-slider-wrap');
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

      var controlsRow = L.DomUtil.create('div', 's1rtc-ts-controls', wrap);

      var prevBtn = L.DomUtil.create('button', 's1rtc-ts-btn s1rtc-ts-prev', controlsRow);
      prevBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
      prevBtn.title = 'Sebelumnya';

      var sliderWrap = L.DomUtil.create('div', 's1rtc-ts-slider-wrap', controlsRow);
      var slider = L.DomUtil.create('input', 's1rtc-ts-slider', sliderWrap);
      slider.type = 'range';
      slider.min = '0';
      slider.max = '0';
      slider.value = '0';
      slider.step = '1';

      var nextBtn = L.DomUtil.create('button', 's1rtc-ts-btn s1rtc-ts-next', controlsRow);
      nextBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
      nextBtn.title = 'Berikutnya';

      var infoRow = L.DomUtil.create('div', 's1rtc-ts-info', wrap);
      var dateDisplay = L.DomUtil.create('span', 's1rtc-ts-date', infoRow);
      dateDisplay.textContent = 'Memuat data SAR...';

      var sceneInfo = L.DomUtil.create('span', 's1rtc-ts-time', infoRow);
      sceneInfo.textContent = '';

      function applyScene() {
        if (scenes.length === 0) return;
        var scene = scenes[currentIndex];
        dateDisplay.textContent = formatDateOnly(scene.datetime);
        sceneInfo.textContent = (currentIndex + 1) + ' / ' + scenes.length;
        updateTileUrl(scene);
      }

      slider.addEventListener('input', function () {
        currentIndex = parseInt(this.value, 10);
        applyScene();
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
        if (val < scenes.length - 1) {
          slider.value = String(val + 1);
          slider.dispatchEvent(new Event('input'));
        }
      });

      fetchScenes(function () {
        if (scenes.length === 0) {
          dateDisplay.textContent = 'Data tidak tersedia';
          sceneInfo.textContent = '';
          return;
        }
        slider.max = String(scenes.length - 1);
        currentIndex = scenes.length - 1;
        slider.value = String(currentIndex);
        applyScene();
      });

      wrap._slider = slider;
      wrap._dateDisplay = dateDisplay;
      wrap._sceneInfo = sceneInfo;
      return wrap;
    }
  });

  function showLegend() {
    if (typeof addUnifiedLegend !== 'function') return;
    var div = L.DomUtil.create('div', 'himawari-legend');
    L.DomEvent.disableClickPropagation(div);
    div.innerHTML =
      '<div class="himawari-legend-title">Sentinel-1 SAR False Color</div>' +
      '<div class="himawari-legend-bar" style="background:linear-gradient(90deg,#1a1a2e,#0f3460,#1a936f,#53a8b6,#b6d7e8,#ffffff);"></div>' +
      '<div class="himawari-legend-labels"><span>Gelap</span><span>Sedang</span><span>Cerah</span></div>' +
      '<div class="himawari-legend-items">' +
        '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#0f3460;"></span>Biru — Air (VV tinggi)</div>' +
        '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#1a936f;"></span>Hijau — Vegetasi (VH tinggi)</div>' +
        '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#f6d743;"></span>Kuning — Tanah/Gedung</div>' +
        '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#d62828;"></span>Merah — Urban/Bare Soil</div>' +
      '</div>' +
      '<div class="himawari-legend-unit">Polarisasi: VV + VH | Resolusi: 10m</div>' +
      '<div class="himawari-legend-unit">Sumber: ESA Sentinel-1 / Microsoft Planetary Computer</div>';
    addUnifiedLegend('s1rtc', window.createLegendWithToggle(div));
    legendControl = true;
  }

  function hideLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('s1rtc');
    legendControl = null;
  }

  function showSlider() {
    if (!sliderControl) {
      sliderControl = new Sentinel1TimeSliderControl();
      var el = sliderControl.onAdd(map);
      if (typeof addUnifiedSlider === 'function') {
        addUnifiedSlider('s1rtc', 'Sentinel-1 SAR', el);
      } else {
        sliderControl.addTo(map);
      }
    }
    showLegend();
    _prevMaxZoom = map.getMaxZoom();
    map.setMaxZoom(13);
    if (map.getZoom() > 13) map.setZoom(6);
  }

  function hideSlider() {
    if (sliderControl) {
      if (typeof removeUnifiedSlider === 'function') removeUnifiedSlider('s1rtc');
      else { try { map.removeControl(sliderControl); } catch (e) {} }
      sliderControl = null;
    }
    hideLegend();
    if (_prevMaxZoom !== null) {
      map.setMaxZoom(_prevMaxZoom);
      _prevMaxZoom = null;
    }
  }

  function activateSentinel1Rtc() {
    scenes = [];
    currentIndex = 0;
    _fetchPromise = null;
    hideSlider();
    var layer = getLayer();
    if (!map.hasLayer(layer)) layer.addTo(map);
    fetchScenes(function () {
      if (scenes.length > 0) {
        var url = buildTileUrl(scenes[scenes.length - 1]);
        if (url) layer.setUrl(url);
      }
      showSlider();
    });
  }

  function cleanupSentinel1Rtc() {
    hideSlider();
    hideLegend();
    var layer = getLayer();
    if (layer && map.hasLayer(layer)) map.removeLayer(layer);
    scenes = [];
    currentIndex = 0;
    _fetchPromise = null;
  }

  function isSentinel1RtcActive() {
    var layer = getLayer();
    return !!(layer && map.hasLayer(layer));
  }

  window.activateSentinel1Rtc = activateSentinel1Rtc;
  window.cleanupSentinel1Rtc = cleanupSentinel1Rtc;
  window.isSentinel1RtcActive = isSentinel1RtcActive;

  document.addEventListener('DOMContentLoaded', function () {
    map.on('basemapchanged', function (e) {
      if (e.basemap === 'sentinel1-rtc') {
        activateSentinel1Rtc();
      } else {
        cleanupSentinel1Rtc();
      }
    });
  });
})();
