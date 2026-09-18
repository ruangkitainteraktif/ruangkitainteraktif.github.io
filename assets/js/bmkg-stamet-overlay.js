/* ── BMKG Radar Soekarno-Hatta — gis.bmkg.go.id ArcGIS RadarCMax ── */
(function () {
  'use strict';

  var RADAR_URL = 'https://gis.bmkg.go.id/arcgis/rest/services/radarcmax/MapServer/export';
  var CORS_PROXY = 'https://corsproxy.io/?url=';
  var BBOX = '106.45,-6.30,106.80,-5.95';
  var IMG_SIZE = '800,600';
  var AIRPORT_CENTER = [-6.1256, 106.6559];
  var AIRPORT_BOUNDS = [[-6.30, 106.45], [-5.95, 106.80]];
  var AIRPORT_ZOOM = 9;
  var CAPTURE_MS = 10000;
  var ANIM_MS = 800;
  var MAX_FRAMES = 10;

  var _layer = null;
  var _frames = [];
  var _idx = 0;
  var _anim = null;
  var _capture = null;
  var _legendId = 'bmkg-radar-stamet';
  var _active = false;

  /* ── slider refs (set on control add) ── */
  var _slider = null;
  var _dateEl = null;
  var _timeEl = null;
  var _sliderControl = null;

  /* ── URL helpers ── */
  function rawUrl() {
    return RADAR_URL + '?bbox=' + BBOX + '&bboxSR=4326&imageSR=4326&size=' + IMG_SIZE +
      '&format=png32&transparent=true&f=image&_t=' + Date.now();
  }

  function proxiedUrl(u) { return CORS_PROXY + encodeURIComponent(u); }

  function fetchFrame() {
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        resolve(img.naturalWidth > 0 ? { url: img.src, ts: new Date().toLocaleTimeString('id-ID') } : null);
      };
      img.onerror = function () { resolve(null); };
      img.src = proxiedUrl(rawUrl());
    });
  }

  function captureFrame() {
    fetchFrame().then(function (frame) {
      if (!frame || !_active) return;
      _frames.push(frame);
      if (_frames.length > MAX_FRAMES) _frames.shift();
      syncSlider();
    });
  }

  /* ── slider ── */
  function syncSlider() {
    if (!_slider) return;
    _slider.max = String(Math.max(0, _frames.length - 1));
    _slider.value = String(_frames.length - 1);
    showFrame(_frames.length - 1);
  }

  function showFrame(i) {
    var f = _frames[i];
    if (!f || !_layer) return;
    try { _layer.setUrl(f.url); } catch (e) {}
    if (_dateEl) _dateEl.textContent = f.ts + ' WIB';
    if (_timeEl) _timeEl.textContent = 'Frame ' + (i + 1) + ' / ' + _frames.length;
  }

  /* ── animation ── */
  function startAnim() {
    if (_anim || _frames.length < 2) return;
    _idx = 0;
    showFrame(0);
    _anim = setInterval(function () {
      _idx = (_idx + 1) % _frames.length;
      showFrame(_idx);
      if (_slider) _slider.value = String(_idx);
    }, ANIM_MS);
  }

  function stopAnim() { if (_anim) { clearInterval(_anim); _anim = null; } }

  /* ── legend ── */
  function showLegend() {
    if (typeof addUnifiedLegend !== 'function') return;
    var d = document.createElement('div');
    d.className = 'stamet-radar-legend';
    d.innerHTML =
      '<div class="stamet-radar-legend-title">Radar Curah Hujan — BMKG</div>' +
      '<div class="stamet-radar-legend-items">' +
        '<div class="stamet-radar-legend-item"><span class="stamet-radar-swatch" style="background:#00ff00"></span>Hujan Ringan</div>' +
        '<div class="stamet-radar-legend-item"><span class="stamet-radar-swatch" style="background:#ffff00"></span>Hujan Sedang</div>' +
        '<div class="stamet-radar-legend-item"><span class="stamet-radar-swatch" style="background:#ff8800"></span>Hujan Lebat</div>' +
        '<div class="stamet-radar-legend-item"><span class="stamet-radar-swatch" style="background:#ff0000"></span>Hujan Sangat Lebat</div>' +
        '<div class="stamet-radar-legend-item"><span class="stamet-radar-swatch" style="background:#cc00cc"></span>Hujan Ekstrem</div>' +
      '</div>' +
      '<div class="stamet-radar-legend-meta">' +
        '<div id="stamet-radar-ts">Memuat radar...</div>' +
        '<div>Sumber: BMKG RadarCMax (gabungan stasiun)</div>' +
      '</div>';
    addUnifiedLegend(_legendId, typeof createLegendWithToggle === 'function' ? createLegendWithToggle(d) : d);
  }

  function hideLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend(_legendId);
  }

  /* ── L.Control: time slider ── */
  var RadarSliderControl = L.Control.extend({
    options: { position: 'bottomcenter' },
    onAdd: function () {
      var wrap = L.DomUtil.create('div', 'bmkg-time-slider-wrap');
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

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
      var dateEl = L.DomUtil.create('span', 'bmkg-ts-date', infoRow);
      dateEl.textContent = 'Memuat...';

      var timeEl = L.DomUtil.create('span', 'bmkg-ts-time', infoRow);
      timeEl.textContent = '';

      slider.addEventListener('input', function () {
        var i = parseInt(this.value, 10);
        showFrame(i);
      });

      prevBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var val = parseInt(slider.value, 10);
        if (val > 0) { slider.value = String(val - 1); slider.dispatchEvent(new Event('input')); }
      });

      nextBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var val = parseInt(slider.value, 10);
        if (val < parseInt(slider.max, 10)) { slider.value = String(val + 1); slider.dispatchEvent(new Event('input')); }
      });

      _slider = slider;
      _dateEl = dateEl;
      _timeEl = timeEl;
      return wrap;
    }
  });

  /* ── toggle ── */
  function toggleLayer(on) {
    if (on) {
      if (_active) return;
      _active = true;
      _frames = [];
      showLegend();

      if (!_sliderControl) {
        _sliderControl = new RadarSliderControl();
        _sliderControl.addTo(map);
      }

      captureFrame();

      var waitStart = Date.now();
      var waitIv = setInterval(function () {
        if (_frames.length > 0 || Date.now() - waitStart > 10000) {
          clearInterval(waitIv);
          if (!_active) return;

          if (_frames.length > 0) {
            _layer = L.imageOverlay(_frames[0].url, AIRPORT_BOUNDS, {
              opacity: 0.7,
              crossOrigin: 'anonymous',
              interactive: false
            });
            _layer.addTo(map);
            map.flyTo(AIRPORT_CENTER, AIRPORT_ZOOM, { duration: 1.2 });
            syncSlider();

            _capture = setInterval(captureFrame, CAPTURE_MS);

            setTimeout(function () {
              if (_active && _frames.length >= 2) startAnim();
            }, CAPTURE_MS + 500);
          } else {
            if (_dateEl) _dateEl.textContent = 'Radar tidak tersedia';
            if (typeof showMapToast === 'function') showMapToast('Radar BMKG tidak tersedia saat ini.', 'warn');
          }
        }
      }, 500);

    } else {
      _active = false;
      stopAnim();
      if (_capture) { clearInterval(_capture); _capture = null; }
      if (_layer) { map.removeLayer(_layer); _layer = null; }
      if (_sliderControl) { map.removeControl(_sliderControl); _sliderControl = null; }
      _slider = null; _dateEl = null; _timeEl = null;
      _frames = [];
      _idx = 0;
      hideLegend();
    }
  }

  window.toggleBmkgStametRadar = toggleLayer;
  window.isBmkgStametRadarActive = function () { return _active; };
})();
