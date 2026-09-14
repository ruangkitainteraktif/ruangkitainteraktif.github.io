/* ── BMKG Himawari/GK-2A Time Slider — satellite.bmkg.go.id ── */
(function () {
  'use strict';

  var BMKG_LAYERS = {
    'bmkg-himawari':      { tiletype: 'himawari9', modelname: 'himawari9',    param: 'EH', title: 'Himawari-9 IR Enhanced' },
    'bmkg-himawari-nc':   { tiletype: 'himawari9', modelname: 'himawari9',    param: 'NC', title: 'Himawari-9 Natural Color' },
    'bmkg-himawari-wv':   { tiletype: 'himawari9', modelname: 'himawari9',    param: 'WV', title: 'Himawari-9 Water Vapor' },
    'bmkg-himawari-rp':   { tiletype: 'himawari9', modelname: 'himawari9',    param: 'RP', title: 'Himawari-9 Rainfall' },
    'bmkg-himawari-sw':   { tiletype: 'himawari9', modelname: 'himawari9',    param: 'SW', title: 'Himawari-9 Shortwave IR' },
    'bmkg-himawari-sm':   { tiletype: 'himawari9', modelname: 'himawari9',    param: 'SM', title: 'Himawari-9 SST' },
    'bmkg-himawari-va':   { tiletype: 'himawari9', modelname: 'himawari9',    param: 'VA', title: 'Himawari-9 Volcanic Ash' },
    'bmkg-himawari-vs':   { tiletype: 'himawari9', modelname: 'himawari9',    param: 'VS', title: 'Himawari-9 Visible' },
    'bmkg-himawari-fd':   { tiletype: 'himawari9', modelname: 'himawari9fd',  param: 'EH', title: 'Himawari-9 Full Disk' },
    'bmkg-himawari-hires':{ tiletype: 'himawari9', modelname: 'himawari9hires', param: 'VS', title: 'Himawari-9 Hi-Res (Visible)' },
    'bmkg-gk2a':          { tiletype: 'himawari9', modelname: 'gk2a',         param: 'EH', title: 'GK-2A IR Enhanced' },
    'bmkg-gk2a-wv':       { tiletype: 'himawari9', modelname: 'gk2a',         param: 'WV', title: 'GK-2A Water Vapor' },
    'bmkg-gk2a-rp':       { tiletype: 'himawari9', modelname: 'gk2a',         param: 'RP', title: 'GK-2A Rainfall' }
  };

  var MODELRUN_URL = 'https://satellite.bmkg.go.id/api22/modelrun';
  var TILE_URL_TEMPLATE = 'https://satellite.bmkg.go.id/api22/tile/{z}/{x}/{y}.png?tiletype={tiletype}&modelname={modelname}&param={param}&baserun=';

  var TIME_RANGES = [
    { label: '3J', hours: 3 },
    { label: '6J', hours: 6 },
    { label: '12J', hours: 12 },
    { label: '24J', hours: 24 },
    { label: '3H', hours: 72 },
    { label: 'Semua', hours: 0 }
  ];

  var sliderControl = null;
  var legendControl = null;
  var currentIndex = 0;
  var allTimestamps = [];
  var filteredTimestamps = [];
  var _fetchPromise = null;
  var _activeKey = null;
  var _refreshInterval = null;
  var _titleRow = null;
  var _playInterval = null;
  var _selectedRange = 0;
  var REFRESH_MS = 10 * 60 * 1000;
  var PLAY_MS = 400;
  var CROSSFADE_MS = 300;
  var _crossfadeLayer = null;
  var _crossfading = false;

  var MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  function formatTime(isoStr) {
    var d = new Date(isoStr);
    var utcH = d.getUTCHours();
    var utcM = d.getUTCMinutes();
    var wibH = (utcH + 7) % 24;
    var hh = String(wibH).padStart(2, '0');
    var mm = String(utcM).padStart(2, '0');
    return hh + ':' + mm + ' WIB';
  }

  function formatDateShort(isoStr) {
    var d = new Date(isoStr);
    return d.getUTCDate() + ' ' + MONTH_NAMES[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  function formatDateTime(isoStr) {
    return formatDateShort(isoStr) + ' ' + formatTime(isoStr);
  }

  function isBmkgLayer(key) {
    return BMKG_LAYERS.hasOwnProperty(key);
  }

  function buildTileUrl(tiletype, modelname, param, baserun) {
    return TILE_URL_TEMPLATE.replace('{tiletype}', tiletype).replace('{modelname}', modelname).replace('{param}', param) + encodeURIComponent(baserun);
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
    var total = urls.length;
    var limit = Math.min(total, 20);
    var img = new Image();
    for (var i = 0; i < limit; i++) {
      var im = new Image();
      im.onload = im.onerror = function () {
        loaded++;
        if (loaded >= limit) callback();
      };
      im.src = urls[i];
    }
  }

  function crossfadeTo(isoTs) {
    if (_crossfading || !_activeKey) return;
    var mainLayer = baseTileLayers[_activeKey];
    if (!mainLayer) return;
    var info = BMKG_LAYERS[_activeKey];
    if (!info) return;
    var url = buildTileUrl(info.tiletype, info.modelname, info.param, isoTs);
    if (!url) return;

    var tileUrls = getVisibleTileUrls(url);
    preloadTiles(tileUrls, function () {
      if (!_crossfading && _activeKey) startCrossfade(url, mainLayer);
    });
  }

  function startCrossfade(url, mainLayer) {
    _crossfading = true;

    if (_crossfadeLayer) {
      try { map.removeLayer(_crossfadeLayer); } catch (e) {}
      _crossfadeLayer = null;
    }

    _crossfadeLayer = L.tileLayer(url, {
      maxZoom: 10, minZoom: 0, opacity: 0,
      crossOrigin: true, interactive: false
    });
    _crossfadeLayer.addTo(map);

    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var progress = Math.min((ts - start) / CROSSFADE_MS, 1);
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

  function updateHimawariUrl(isoTs) {
    if (!_activeKey) return;
    var layer = baseTileLayers[_activeKey];
    if (!layer) return;
    var info = BMKG_LAYERS[_activeKey];
    if (!info) return;
    layer.setUrl(buildTileUrl(info.tiletype, info.modelname, info.param, isoTs));
  }

  function filterTimestamps() {
    if (_selectedRange === 0) {
      filteredTimestamps = allTimestamps.slice();
      return;
    }
    var hours = TIME_RANGES[_selectedRange].hours;
    var cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    filteredTimestamps = allTimestamps.filter(function (ts) { return ts >= cutoff; });
    if (filteredTimestamps.length === 0 && allTimestamps.length > 0) {
      filteredTimestamps = [allTimestamps[allTimestamps.length - 1]];
    }
  }

  function fetchTimestamps(callback) {
    if (_fetchPromise) { _fetchPromise.then(callback); return; }
    _fetchPromise = new Promise(function (resolve) {
      if (window._bmkgModelrunCache) {
        var data = window._bmkgModelrunCache;
        var apiKey = _activeKey ? BMKG_LAYERS[_activeKey].modelname : 'himawari9';
        var list = (data[apiKey] || []).slice().reverse();
        allTimestamps = list;
        filterTimestamps();
        resolve(list);
        return;
      }
      var xhr = new XMLHttpRequest();
      xhr.open('GET', MODELRUN_URL, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            var data = JSON.parse(xhr.responseText);
            var apiKey = _activeKey ? BMKG_LAYERS[_activeKey].modelname : 'himawari9';
            var list = (data[apiKey] || []).slice().reverse();
            allTimestamps = list;
            filterTimestamps();
            resolve(list);
          } catch (e) {
            console.error('[BMKGSlider] Failed to parse modelrun:', e);
            allTimestamps = [];
            filteredTimestamps = [];
            resolve([]);
          }
        } else {
          allTimestamps = [];
          filteredTimestamps = [];
          resolve([]);
        }
      };
      xhr.send();
    });
    _fetchPromise.then(function () { callback(); });
  }

  function ensureBottomCenterControlCorner() {
    if (map._controlCorners.bottomcenter) return;
    map._controlCorners.bottomcenter = L.DomUtil.create('div', 'leaflet-bottom leaflet-center', map._controlContainer);
  }

  ensureBottomCenterControlCorner();

  var BmkgTimeSliderControl = L.Control.extend({
    options: { position: 'bottomcenter' },
    onAdd: function () {
      var wrap = L.DomUtil.create('div', 'bmkg-time-slider-wrap');
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

      var rangeRow = L.DomUtil.create('div', 'bmkg-ts-range', wrap);
      var rangeBtns = [];
      TIME_RANGES.forEach(function (r, i) {
        var btn = L.DomUtil.create('button', 'bmkg-ts-range-btn' + (i === _selectedRange ? ' bmkg-ts-range-active' : ''), rangeRow);
        btn.textContent = r.label;
        btn.title = r.hours === 0 ? 'Semua waktu' : r.hours + ' jam terakhir';
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          _selectedRange = i;
          filterTimestamps();
          rangeBtns.forEach(function (b, j) {
            b.classList.toggle('bmkg-ts-range-active', j === i);
          });
          updateSliderFromFilter();
        });
        rangeBtns.push(btn);
      });

      var controlsRow = L.DomUtil.create('div', 'bmkg-ts-controls', wrap);

      var playBtn = L.DomUtil.create('button', 'bmkg-ts-btn bmkg-ts-play', controlsRow);
      playBtn.innerHTML = '<svg class="bmkg-icon-play" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>' +
                          '<svg class="bmkg-icon-pause" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="display:none"><rect x="5" y="3" width="4" height="18"/><rect x="15" y="3" width="4" height="18"/></svg>';
      playBtn.title = 'Putar / Jeda';

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

      var timeDisplay = L.DomUtil.create('span', 'bmkg-ts-time', infoRow);
      timeDisplay.textContent = '';

      function applyTimestamp() {
        if (filteredTimestamps.length === 0) return;
        var ts = filteredTimestamps[currentIndex];
        dateDisplay.textContent = formatDateTime(ts);
        updateHimawariUrl(ts);
      }

      function updateSliderFromFilter() {
        stopPlay();
        slider.max = String(Math.max(0, filteredTimestamps.length - 1));
        currentIndex = filteredTimestamps.length - 1;
        slider.value = String(currentIndex);
        applyTimestamp();
      }

      slider.addEventListener('input', function () {
        currentIndex = parseInt(this.value, 10);
        applyTimestamp();
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
        if (val < filteredTimestamps.length - 1) {
          slider.value = String(val + 1);
          slider.dispatchEvent(new Event('input'));
        }
      });

      var iconPlay = playBtn.querySelector('.bmkg-icon-play');
      var iconPause = playBtn.querySelector('.bmkg-icon-pause');
      var playing = false;

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
        }, PLAY_MS);
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

      wrap._stopPlay = stopPlay;

      fetchTimestamps(function () {
        if (filteredTimestamps.length === 0) {
          dateDisplay.textContent = 'Data tidak tersedia';
          return;
        }
        slider.max = String(filteredTimestamps.length - 1);
        currentIndex = filteredTimestamps.length - 1;
        slider.value = String(currentIndex);
        applyTimestamp();
      });

      wrap._slider = slider;
      wrap._dateDisplay = dateDisplay;
      return wrap;
    }
  });

  var _prevMaxZoom = null;

  function showLegend() {
    if (typeof addUnifiedLegend !== 'function') return;
    var div = L.DomUtil.create('div', 'himawari-legend');
    L.DomEvent.disableClickPropagation(div);
    var info = BMKG_LAYERS[_activeKey];
    var param = info ? info.param : 'EH';
    if (param === 'VS') {
      div.innerHTML =
        '<div class="himawari-legend-title">Visible (0.64&micro;m) — 500m</div>' +
        '<div class="himawari-legend-bar" style="background:linear-gradient(90deg,#000 0%,#fff 100%);"></div>' +
        '<div class="himawari-legend-labels"><span>Gelap</span><span>Cerah</span></div>' +
        '<div class="himawari-legend-unit">Sumber: BMKG Satellite</div>';
    } else if (param === 'WV') {
      div.innerHTML =
        '<div class="himawari-legend-title">Uap Air (WV 6.3&micro;m)</div>' +
        '<div class="himawari-legend-bar" style="background:linear-gradient(90deg,#1a1a2e,#16213e,#0f3460,#1a936f,#53a8b6,#b6d7e8,#ffffff);"></div>' +
        '<div class="himawari-legend-labels"><span>Kering</span><span>Lembab</span><span>Sangat Lembab</span></div>' +
        '<div class="himawari-legend-unit">Sumber: BMKG Satellite</div>';
    } else if (param === 'NC') {
      div.innerHTML =
        '<div class="himawari-legend-title">Natural Color (RGB)</div>' +
        '<div class="himawari-legend-bar" style="background:linear-gradient(90deg,#005000,#00a000,#64b4ff,#ffffff);"></div>' +
        '<div class="himawari-legend-labels"><span>Laut</span><span>Vegetasi</span><span>Awan Tipis</span><span>Awan Tebal</span></div>' +
        '<div class="himawari-legend-unit">Sumber: BMKG Satellite</div>';
    } else if (param === 'RP') {
      div.innerHTML =
        '<div class="himawari-legend-title">Rainfall Rate (Curah Hujan)</div>' +
        '<div class="himawari-legend-bar" style="background:linear-gradient(90deg,#000080,#0000ff,#00c800,#ffff00,#ff0000);"></div>' +
        '<div class="himawari-legend-labels"><span>Ringan</span><span>Sedang</span><span>Lebat</span><span>Sangat Lebat</span></div>' +
        '<div class="himawari-legend-unit">Sumber: BMKG Satellite</div>';
    } else if (param === 'SW') {
      div.innerHTML =
        '<div class="himawari-legend-title">Shortwave IR (3.9&micro;m)</div>' +
        '<div class="himawari-legend-bar" style="background:linear-gradient(90deg,#000050,#500078,#c86400,#ffc800,#ffffff);"></div>' +
        '<div class="himawari-legend-labels"><span>Dingin</span><span>Hangat</span><span>Panas</span></div>' +
        '<div class="himawari-legend-unit">Sumber: BMKG Satellite</div>';
    } else if (param === 'SM') {
      div.innerHTML =
        '<div class="himawari-legend-title">Sea Surface Temperature (SST)</div>' +
        '<div class="himawari-legend-bar" style="background:linear-gradient(90deg,#000080,#0064c8,#00b400,#ffc800,#c80000);"></div>' +
        '<div class="himawari-legend-labels"><span>20&deg;C</span><span>24&deg;C</span><span>28&deg;C</span><span>32&deg;C</span></div>' +
        '<div class="himawari-legend-unit">Sumber: BMKG Satellite</div>';
    } else if (param === 'VA') {
      div.innerHTML =
        '<div class="himawari-legend-title">Volcanic Ash (Abu Vulkanik)</div>' +
        '<div class="himawari-legend-bar" style="background:linear-gradient(90deg,#000050,#c80000,#ffc800,#ffffff);"></div>' +
        '<div class="himawari-legend-labels"><span>Tipis</span><span>Sedang</span><span>Tebal</span></div>' +
        '<div class="himawari-legend-unit">Sumber: BMKG Satellite</div>';
    } else {
      div.innerHTML =
        '<div class="himawari-legend-title">Suhu Puncak Awan (IR 10.4&micro;m)</div>' +
        '<div class="himawari-legend-bar"></div>' +
        '<div class="himawari-legend-labels"><span>-80&deg;C</span><span>-60&deg;C</span><span>-40&deg;C</span><span>-20&deg;C</span><span>0&deg;C</span><span>20&deg;C</span></div>' +
        '<div class="himawari-legend-items">' +
          '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#7b0051;"></span>&le; -80&deg;C — Ekstrem</div>' +
          '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#d62828;"></span>-80 s/d -60&deg;C — Sangat Dingin (Cb)</div>' +
          '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#f77f00;"></span>-60 s/d -40&deg;C — Dingin</div>' +
          '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#f6d743;"></span>-40 s/d -20&deg;C — Sedang</div>' +
          '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#1a936f;"></span>-20 s/d 0&deg;C — Hangat</div>' +
          '<div class="himawari-legend-item"><span class="himawari-legend-dot" style="background:#16213e;"></span>&ge; 0&deg;C — Cerah</div>' +
        '</div>' +
        '<div class="himawari-legend-unit">Sumber: BMKG Satellite</div>';
    }
    addUnifiedLegend('himawari', window.createLegendWithToggle(div));
    legendControl = true;
  }

  function hideLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('himawari');
    legendControl = null;
  }

  function showSlider() {
    if (!sliderControl) {
      sliderControl = new BmkgTimeSliderControl();
      var el = sliderControl.onAdd(map);
      var title = BMKG_LAYERS[_activeKey] ? BMKG_LAYERS[_activeKey].title : 'BMKG Satellite';
      if (typeof addUnifiedSlider === 'function') {
        addUnifiedSlider('himawari', title, el);
      } else {
        sliderControl.addTo(map);
      }
    }
    showLegend();
    _prevMaxZoom = map.getMaxZoom();
    map.setMaxZoom(10);
    if (map.getZoom() > 10) map.setZoom(5);
  }

  function hideSlider() {
    if (sliderControl) {
      if (sliderControl._stopPlay) sliderControl._stopPlay();
      if (typeof removeUnifiedSlider === 'function') removeUnifiedSlider('himawari');
      else { try { map.removeControl(sliderControl); } catch (e) {} }
      sliderControl = null;
    }
    if (_playInterval) { clearInterval(_playInterval); _playInterval = null; }
    if (_crossfadeLayer) {
      try { map.removeLayer(_crossfadeLayer); } catch (e) {}
      _crossfadeLayer = null;
    }
    _crossfading = false;
    hideLegend();
    if (_prevMaxZoom !== null) {
      map.setMaxZoom(_prevMaxZoom);
      _prevMaxZoom = null;
    }
  }

  function activateBmkgLayer(key) {
    _activeKey = key;
    _fetchPromise = null;
    allTimestamps = [];
    filteredTimestamps = [];
    currentIndex = 0;
    _selectedRange = 0;
    hideSlider();
    fetchTimestamps(function () {
      currentIndex = 0;
      showSlider();
    });
  }

  function cleanup() {
    hideSlider();
    hideLegend();
    allTimestamps = [];
    filteredTimestamps = [];
    currentIndex = 0;
    _fetchPromise = null;
    _activeKey = null;
    stopAutoRefresh();
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    _refreshInterval = setInterval(function () {
      if (!_activeKey) return;
      _fetchPromise = null;
      fetchTimestamps(function () {
        if (!sliderControl || filteredTimestamps.length === 0) return;
        var slider = sliderControl._slider;
        if (!slider) return;
        slider.max = String(filteredTimestamps.length - 1);
        if (currentIndex >= filteredTimestamps.length) currentIndex = filteredTimestamps.length - 1;
        slider.value = String(currentIndex);
        var ts = filteredTimestamps[currentIndex];
        var dateEl = sliderControl._dateDisplay;
        if (dateEl) dateEl.textContent = formatDateTime(ts);
        updateHimawariUrl(ts);
      });
    }, REFRESH_MS);
  }

  function stopAutoRefresh() {
    if (_refreshInterval) {
      clearInterval(_refreshInterval);
      _refreshInterval = null;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    map.on('basemapchanged', function (e) {
      if (isBmkgLayer(e.basemap)) {
        activateBmkgLayer(e.basemap);
      } else {
        hideSlider();
        _activeKey = null;
      }
    });

    if (typeof currentBasemapName !== 'undefined' && isBmkgLayer(currentBasemapName)) {
      activateBmkgLayer(currentBasemapName);
    }
  });

  window.bmkgHimawariSliderCleanup = cleanup;
})();
