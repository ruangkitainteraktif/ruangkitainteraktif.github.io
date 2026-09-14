/* ── Zoom Earth Time Animation — tiles.zoom.earth ── */
(function () {
  'use strict';

  var TILE_TEMPLATE = 'https://tiles.zoom.earth/geocolor/himawari/{date}/{time}/{z}/{x}/{y}.jpg';
  var INTERVAL_SEC = 600;
  var HISTORY_DAYS = 6;

  var TIME_RANGES = [
    { label: '3J', hours: 3 },
    { label: '6J', hours: 6 },
    { label: '12J', hours: 12 },
    { label: '24J', hours: 24 },
    { label: '3H', hours: 72 },
    { label: 'Semua', hours: 0 }
  ];

  var sliderControl = null;
  var currentIndex = 0;
  var allTimestamps = [];
  var filteredTimestamps = [];
  var _active = false;
  var _playInterval = null;
  var _prevMaxZoom = null;
  var _selectedRange = 0;
  var PLAY_INTERVAL_MS = 400;
  var CROSSFADE_MS = 300;
  var _crossfadeLayer = null;
  var _crossfading = false;

  var MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function pad2(n) { return String(n).padStart(2, '0'); }

  function generateTimestamps() {
    var now = Math.floor(Date.now() / 1000);
    var start = now - HISTORY_DAYS * 86400;
    start = Math.floor(start / INTERVAL_SEC) * INTERVAL_SEC;
    var result = [];
    for (var t = start; t <= now; t += INTERVAL_SEC) {
      result.push(t);
    }
    return result;
  }

  function tsToDateStr(ts) {
    var d = new Date(ts * 1000);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }

  function tsToTimeStr(ts) {
    var d = new Date(ts * 1000);
    return pad2(d.getUTCHours()) + pad2(d.getUTCMinutes());
  }

  function formatDateTime(ts) {
    var d = new Date(ts * 1000);
    var utcH = d.getUTCHours(), utcM = d.getUTCMinutes();
    var wibH = (utcH + 7) % 24;
    return d.getUTCDate() + ' ' + MONTH_NAMES[d.getUTCMonth()] + ' ' + d.getUTCFullYear() +
           ' ' + pad2(wibH) + ':' + pad2(utcM) + ' WIB';
  }

  function buildTileUrl(ts) {
    return TILE_TEMPLATE
      .replace('{date}', tsToDateStr(ts))
      .replace('{time}', tsToTimeStr(ts));
  }

  function getVisibleTileUrls(baseUrl) {
    var zoom = map.getZoom();
    var bounds = map.getBounds();
    var urls = [];
    var tileBounds = L.bounds(
      map.project(bounds.getNorthWest(), zoom).divideBy(256).floor(),
      map.project(bounds.getSouthEast(), zoom).divideBy(256).floor()
    );
    for (var x = tileBounds.min.x; x <= tileBounds.max.x; x++) {
      for (var y = tileBounds.min.y; y <= tileBounds.max.y; y++) {
        urls.push(baseUrl.replace('{z}', zoom).replace('{x}', x).replace('{y}', y));
      }
    }
    return urls;
  }

  function preloadTiles(urls, callback) {
    if (urls.length === 0) { callback(); return; }
    var loaded = 0;
    var limit = Math.min(urls.length, 20);
    for (var i = 0; i < limit; i++) {
      var im = new Image();
      im.onload = im.onerror = function () {
        loaded++;
        if (loaded >= limit) callback();
      };
      im.src = urls[i];
    }
  }

  function crossfadeTo(ts) {
    if (_crossfading || !_active) return;
    var mainLayer = baseTileLayers['zoom-earth'];
    if (!mainLayer) return;
    var url = buildTileUrl(ts);
    if (!url) return;

    var tileUrls = getVisibleTileUrls(url);
    preloadTiles(tileUrls, function () {
      if (!_crossfading && _active) startCrossfade(url, mainLayer);
    });
  }

  function startCrossfade(url, mainLayer) {
    _crossfading = true;

    if (_crossfadeLayer) {
      try { map.removeLayer(_crossfadeLayer); } catch (e) {}
      _crossfadeLayer = null;
    }

    _crossfadeLayer = L.tileLayer(url, {
      maxZoom: 18, minZoom: 0, opacity: 0,
      crossOrigin: 'anonymous', interactive: false
    });
    _crossfadeLayer.addTo(map);

    var start = null;
    function step(timestamp) {
      if (!start) start = timestamp;
      var progress = Math.min((timestamp - start) / CROSSFADE_MS, 1);
      var eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      _crossfadeLayer.setOpacity(eased);
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        mainLayer.setUrl(url);
        try { map.removeLayer(_crossfadeLayer); } catch (e) {}
        _crossfadeLayer = null;
        _crossfading = false;
      }
    }
    requestAnimationFrame(step);
  }

  function updateTileUrl(ts) {
    if (!_active) return;
    var layer = baseTileLayers['zoom-earth'];
    if (layer) layer.setUrl(buildTileUrl(ts));
  }

  function filterTimestamps() {
    if (_selectedRange === 0) {
      filteredTimestamps = allTimestamps.slice();
      return;
    }
    var hours = TIME_RANGES[_selectedRange].hours;
    var cutoffSec = Math.floor(Date.now() / 1000) - hours * 3600;
    filteredTimestamps = allTimestamps.filter(function (ts) { return ts >= cutoffSec; });
    if (filteredTimestamps.length === 0 && allTimestamps.length > 0) {
      filteredTimestamps = [allTimestamps[allTimestamps.length - 1]];
    }
  }

  function ensureBottomCenter() {
    if (map._controlCorners.bottomcenter) return;
    map._controlCorners.bottomcenter = L.DomUtil.create(
      'div', 'leaflet-bottom leaflet-center', map._controlContainer
    );
  }
  ensureBottomCenter();

  var ZoomEarthSliderControl = L.Control.extend({
    options: { position: 'bottomcenter' },
    onAdd: function () {
      var wrap = L.DomUtil.create('div', 'ze-time-slider-wrap');
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

      var rangeRow = L.DomUtil.create('div', 'ze-ts-range', wrap);
      var rangeBtns = [];
      TIME_RANGES.forEach(function (r, i) {
        var btn = L.DomUtil.create('button', 'ze-ts-range-btn' + (i === _selectedRange ? ' ze-ts-range-active' : ''), rangeRow);
        btn.textContent = r.label;
        btn.title = r.hours === 0 ? 'Semua waktu' : r.hours + ' jam terakhir';
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          _selectedRange = i;
          filterTimestamps();
          rangeBtns.forEach(function (b, j) {
            b.classList.toggle('ze-ts-range-active', j === i);
          });
          updateSliderFromFilter();
        });
        rangeBtns.push(btn);
      });

      var controlsRow = L.DomUtil.create('div', 'ze-ts-controls', wrap);

      var playBtn = L.DomUtil.create('button', 'ze-ts-btn ze-ts-play', controlsRow);
      playBtn.innerHTML = '<svg class="ze-icon-play" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>' +
                          '<svg class="ze-icon-pause" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="display:none"><rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/></svg>';
      playBtn.title = 'Putar / Jeda';

      var prevBtn = L.DomUtil.create('button', 'ze-ts-btn ze-ts-prev', controlsRow);
      prevBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
      prevBtn.title = 'Sebelumnya';

      var sliderWrap = L.DomUtil.create('div', 'ze-ts-slider-wrap', controlsRow);
      var slider = L.DomUtil.create('input', 'ze-ts-slider', sliderWrap);
      slider.type = 'range';
      slider.min = '0';
      slider.max = '0';
      slider.value = '0';
      slider.step = '1';

      var nextBtn = L.DomUtil.create('button', 'ze-ts-btn ze-ts-next', controlsRow);
      nextBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
      nextBtn.title = 'Berikutnya';

      var infoRow = L.DomUtil.create('div', 'ze-ts-info', wrap);
      var dateDisplay = L.DomUtil.create('span', 'ze-ts-date', infoRow);
      dateDisplay.textContent = 'Memuat...';
      var timeDisplay = L.DomUtil.create('span', 'ze-ts-time', infoRow);
      timeDisplay.textContent = '';

      var iconPlay = playBtn.querySelector('.ze-icon-play');
      var iconPause = playBtn.querySelector('.ze-icon-pause');
      var playing = false;

      function applyTimestamp() {
        if (filteredTimestamps.length === 0) return;
        var ts = filteredTimestamps[currentIndex];
        dateDisplay.textContent = formatDateTime(ts);
        updateTileUrl(ts);
      }

      function updateSliderFromFilter() {
        stopPlay();
        slider.max = String(Math.max(0, filteredTimestamps.length - 1));
        currentIndex = filteredTimestamps.length - 1;
        slider.value = String(currentIndex);
        applyTimestamp();
      }

      function startPlay() {
        if (filteredTimestamps.length === 0) return;
        playing = true;
        iconPlay.style.display = 'none';
        iconPause.style.display = 'block';
        _playInterval = setInterval(function () {
          if (_crossfading) return;
          if (currentIndex < filteredTimestamps.length - 1) currentIndex++;
          else currentIndex = 0;
          slider.value = String(currentIndex);
          var ts = filteredTimestamps[currentIndex];
          dateDisplay.textContent = formatDateTime(ts);
          crossfadeTo(ts);
        }, PLAY_INTERVAL_MS);
      }

      function stopPlay() {
        playing = false;
        iconPlay.style.display = 'block';
        iconPause.style.display = 'none';
        if (_playInterval) { clearInterval(_playInterval); _playInterval = null; }
      }

      playBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (playing) stopPlay(); else startPlay();
      });

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
        if (val < filteredTimestamps.length - 1) { slider.value = String(val + 1); slider.dispatchEvent(new Event('input')); }
      });

      allTimestamps = generateTimestamps();
      filterTimestamps();
      if (filteredTimestamps.length === 0) {
        dateDisplay.textContent = 'Data tidak tersedia';
      } else {
        slider.max = String(filteredTimestamps.length - 1);
        currentIndex = filteredTimestamps.length - 1;
        slider.value = String(currentIndex);
        applyTimestamp();
      }

      wrap._slider = slider;
      wrap._dateDisplay = dateDisplay;
      wrap._stopPlay = stopPlay;
      return wrap;
    }
  });

  function showSlider() {
    if (sliderControl) return;
    sliderControl = new ZoomEarthSliderControl();
    var el = sliderControl.onAdd(map);
    if (typeof addUnifiedSlider === 'function') {
      addUnifiedSlider('zoom-earth', 'Zoom Earth Himawari', el);
    } else {
      sliderControl.addTo(map);
    }
    _prevMaxZoom = map.getMaxZoom();
    map.setMaxZoom(18);
  }

  function hideSlider() {
    if (sliderControl) {
      if (sliderControl._stopPlay) sliderControl._stopPlay();
      if (typeof removeUnifiedSlider === 'function') removeUnifiedSlider('zoom-earth');
      else { try { map.removeControl(sliderControl); } catch (e) {} }
      sliderControl = null;
    }
    if (_playInterval) { clearInterval(_playInterval); _playInterval = null; }
    if (_crossfadeLayer) {
      try { map.removeLayer(_crossfadeLayer); } catch (e) {}
      _crossfadeLayer = null;
    }
    _crossfading = false;
    if (_prevMaxZoom !== null) {
      map.setMaxZoom(_prevMaxZoom);
      _prevMaxZoom = null;
    }
  }

  function activate() {
    _active = true;
    allTimestamps = [];
    filteredTimestamps = [];
    currentIndex = 0;
    _selectedRange = 0;
    hideSlider();
    showSlider();
  }

  function cleanup() {
    hideSlider();
    allTimestamps = [];
    filteredTimestamps = [];
    currentIndex = 0;
    _active = false;
  }

  document.addEventListener('DOMContentLoaded', function () {
    map.on('basemapchanged', function (e) {
      if (e.basemap === 'zoom-earth') {
        activate();
      } else {
        _active = false;
        hideSlider();
      }
    });

    if (typeof currentBasemapName !== 'undefined' && currentBasemapName === 'zoom-earth') {
      activate();
    }
  });

  window.zoomEarthSliderCleanup = cleanup;
})();
