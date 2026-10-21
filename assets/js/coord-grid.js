/* ── Grid Koordinat dinamis (graticule) ──
 * Garis lintang & bujur yang intervalnya menyesuaikan zoom (dinamis),
 * plus label koordinat di tepi kiri (lintang) dan tepi atas (bujur).
 * Dipanggil dari tombol di sheet Alat (Gambar & Ukur).
 */
(function () {
  'use strict';

  /* Interval (derajat) yang diizinkan, dari yang paling kecil. */
  var STEPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 45, 90];
  var MIN_SPACING_PX = 70; /* jarak minimum antar garis dalam piksel */

  var _group = null;
  var _active = false;
  var _raf = 0;

  function getMap() {
    if (typeof window._map !== 'undefined' && window._map) return window._map;
    if (typeof window.map !== 'undefined' && window.map) return window.map;
    if (typeof map !== 'undefined' && map) return map;
    return null;
  }

  /* Pilih interval agar jarak garis di layar >= MIN_SPACING_PX (paling rapat yang diizinkan). */
  function pickStep(zoom) {
    var pxPerDeg = (256 * Math.pow(2, zoom)) / 360; /* proyeksi web mercator di khatulistiwa */
    for (var i = 0; i < STEPS.length; i++) {
      if (STEPS[i] * pxPerDeg >= MIN_SPACING_PX) return STEPS[i];
    }
    return STEPS[STEPS.length - 1];
  }

  function decimalsFor(step) {
    if (step >= 1) return 0;
    if (step >= 0.1) return 1;
    if (step >= 0.01) return 2;
    return 3;
  }

  function fmtLat(v, step) {
    var d = decimalsFor(step);
    if (Math.abs(v) < Math.pow(10, -d) / 2) return '0\u00B0';
    return Math.abs(v).toFixed(d) + '\u00B0' + (v > 0 ? 'LU' : 'LS');
  }

  function fmtLon(v, step) {
    var d = decimalsFor(step);
    if (Math.abs(v) < Math.pow(10, -d) / 2) return '0\u00B0';
    return Math.abs(v).toFixed(d) + '\u00B0' + (v > 0 ? 'BT' : 'BB');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function labelMarker(latlng, text, kind) {
    return L.marker(latlng, {
      icon: L.divIcon({
        className: 'cg-label cg-label-' + kind,
        html: '<span>' + esc(text) + '</span>',
        iconSize: [0, 0]
      }),
      interactive: false,
      keyboard: false,
      pane: 'cgPane'
    });
  }

  function ensurePane(m) {
    if (!m.getPane('cgPane')) {
      m.createPane('cgPane');
      m.getPane('cgPane').style.zIndex = 450; /* di atas overlay, di bawah marker */
      m.getPane('cgPane').style.pointerEvents = 'none';
    }
  }

  function draw() {
    var m = getMap();
    if (!_active || !m) return;

    ensurePane(m);
    if (!_group) _group = L.layerGroup();
    if (!m.hasLayer(_group)) _group.addTo(m);
    _group.clearLayers();

    var zoom = m.getZoom();
    var step = pickStep(zoom);
    var size = m.getSize();

    /* perluas viewport 50% ke segala arah agar tidak ada garis yang "muncul" saat digeser */
    var tl = m.containerPointToLatLng([-size.x * 0.5, -size.y * 0.5]);
    var br = m.containerPointToLatLng([size.x * 1.5, size.y * 1.5]);
    var lonMin = Math.min(tl.lng, br.lng), lonMax = Math.max(tl.lng, br.lng);
    var latMin = Math.max(Math.min(tl.lat, br.lat), -85.05);
    var latMax = Math.min(Math.max(tl.lat, br.lat), 85.05);

    var lineStyle = { color: '#334155', weight: 1, opacity: 0.5, dashArray: '4 6', interactive: false, pane: 'cgPane' };
    var i, v, n = 0;

    /* garis bujur (vertikal) + label di tepi bawah */
    var iStart = Math.ceil(lonMin / step - 1e-9);
    for (i = iStart; (v = i * step) <= lonMax + 1e-9 && n < 400; i++, n++) {
      v = +v.toFixed(10);
      _group.addLayer(L.polyline([[latMin, v], [latMax, v]], lineStyle));
      var x = m.latLngToContainerPoint([latMax, v]).x;
      if (x > -20 && x < size.x + 20) {
        _group.addLayer(labelMarker(m.containerPointToLatLng([x, size.y - 10]), fmtLon(v, step), 'lon'));
      }
    }

    /* garis lintang (horizontal) + label di tepi kiri */
    n = 0;
    var jStart = Math.ceil(latMin / step - 1e-9);
    for (i = jStart; (v = i * step) <= latMax + 1e-9 && n < 400; i++, n++) {
      v = +v.toFixed(10);
      _group.addLayer(L.polyline([[v, lonMin], [v, lonMax]], lineStyle));
      var y = m.latLngToContainerPoint([v, lonMin]).y;
      if (y > -20 && y < size.y + 20) {
        _group.addLayer(labelMarker(m.containerPointToLatLng([10, y]), fmtLat(v, step), 'lat'));
      }
    }
  }

  function scheduleDraw() {
    if (_raf) return;
    _raf = requestAnimationFrame(function () {
      _raf = 0;
      draw();
    });
  }

  function bindMap(m) {
    m.on('move', scheduleDraw);
    m.on('zoomend', draw);
    m.on('resize', draw);
  }

  function unbindMap(m) {
    m.off('move', scheduleDraw);
    m.off('zoomend', draw);
    m.off('resize', draw);
  }

  function toggleCoordGrid(show) {
    var m = getMap();
    if (!m) return;
    if (show) {
      if (_active) return;
      _active = true;
      ensurePane(m);
      if (!_group) _group = L.layerGroup();
      _group.addTo(m);
      bindMap(m);
      draw();
    } else {
      if (!_active) return;
      _active = false;
      unbindMap(m);
      if (_group && m.hasLayer(_group)) m.removeLayer(_group);
      if (_raf) { cancelAnimationFrame(_raf); _raf = 0; }
    }
    syncButton();
  }

  function syncButton() {
    var btn = document.getElementById('cgToggleBtn');
    if (btn) btn.classList.toggle('active', _active);
  }

  /* Handler onclick tile tombol di sheet Alat. */
  window.toggleCoordGridFromSheet = function () {
    toggleCoordGrid(!_active);
  };

  window.toggleCoordGrid = toggleCoordGrid;
  window.isCoordGridActive = function () { return _active; };

  /* Default aktif: nyalakan sendiri begitu map tersedia. map-core.js dimuat
   * sebelum skrip ini sehingga map biasanya sudah ada — interval hanya sebagai
   * pengaman bila urutan muat berubah. Pengguna masih bisa mematikan lewat
   * tombol di sheet Alat (Gambar & Ukur); status tidak disimpan — muat ulang
   * selalu kembali aktif (memang itulah "default"). */
  function autoEnable() {
    if (getMap()) { toggleCoordGrid(true); return; }
    var tries = 0;
    var timer = setInterval(function () {
      if (getMap()) { clearInterval(timer); toggleCoordGrid(true); }
      else if (++tries > 100) clearInterval(timer);
    }, 100);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoEnable);
  else autoEnable();
})();
