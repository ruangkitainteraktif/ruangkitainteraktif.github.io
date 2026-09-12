/* ── Sentinel-1 RTC (SAR) Global Mosaic — Planetary Computer ── */
(function () {
  'use strict';

  var MOSAIC_BASE = 'https://planetarycomputer.microsoft.com/api/data/v1/mosaic/e02134555ecc4ae7dc64dd2e4e7acd51/tiles/WebMercatorQuad/{z}/{x}/{y}@2x';
  var MOSAIC_PARAMS = '?asset_as_band=true' +
    '&expression=0.03+%2B+log+%2810e-4+-+log+%280.05+%2F+%280.02+%2B+2+%2A+vv%29%29%29%3B0.05+%2B+exp+%280.25+%2A+%28log+%280.01+%2B+2+%2A+vv%29+%2B+log+%280.02+%2B+5+%2A+vh%29%29%29%3B1+-+log+%280.05+%2F+%280.045+-+0.9+%2A+vv%29%29' +
    '&rescale=0%2C.8000&rescale=0%2C1.000&rescale=0%2C1.000' +
    '&collection=sentinel-1-rtc&format=png';

  var _layer = null;
  var _coastlineWasActive = false;
  var _mosaicVariant = null; // '2x' or '1x' or null (undetected)
  var _triedFallback = false;

  function getLayer() {
    if (!_layer) {
      // Choose URL variant according to detected mosaic variant.
      var base = MOSAIC_BASE;
      var params = MOSAIC_PARAMS;
      if (_mosaicVariant === '1x') {
        base = MOSAIC_BASE.replace('%7C', '|').replace('@2x', '');
      }

      // Default: use 2x tiles (tileSize 512 + zoomOffset -1). If detection later finds 1x, we'll recreate layer.
      _layer = L.tileLayer(base + params, {
        maxZoom: 13,
        minZoom: 0,
        opacity: 0.85,
        attribution: 'Sentinel-1 RTC &copy; ESA / Microsoft Planetary Computer',
        tileSize: 512,
        zoomOffset: -1,
        crossOrigin: true
      });

      // Surface tile load errors to the user for easier debugging and attempt fallback.
      _layer.on('tileerror', function (err) {
        var src = (err && err.tile && (err.tile.currentSrc || err.tile.src)) || err && err.url || 'unknown';
        console.error('Sentinel-1 RTC tile error:', src, err);
        if (typeof showMapToast === 'function') showMapToast('Gagal memuat potongan mosaik Sentinel-1 (' + src + ')', 'error');

        // If we haven't tried fallback yet, switch to 1x variant and recreate layer.
        if (!_triedFallback && _mosaicVariant !== '1x') {
          _triedFallback = true;
          console.warn('Sentinel-1 RTC: attempting fallback to non-@2x tiles');
          if (map && _layer) {
            try { if (map.hasLayer(_layer)) map.removeLayer(_layer); } catch (e) {}
            _layer = null;
            _mosaicVariant = '1x';
            var base = MOSAIC_BASE.replace('@2x', '');
            _layer = L.tileLayer(base + MOSAIC_PARAMS, { maxZoom: 13, minZoom: 0, opacity: 0.85, attribution: 'Sentinel-1 RTC &copy; ESA / Microsoft Planetary Computer', tileSize: 256, zoomOffset: 0, crossOrigin: true });
            _layer.on('tileerror', function (e2) { console.error('Sentinel-1 RTC tile error (fallback):', (e2 && e2.tile && (e2.tile.currentSrc || e2.tile.src)) || e2 && e2.url || 'unknown', e2); if (typeof showMapToast === 'function') showMapToast('Gagal memuat potongan mosaik Sentinel-1 (fallback).', 'error'); });
            _layer.addTo(map);
            if (typeof showMapToast === 'function') showMapToast('Beralih ke varian non-@2x (fallback).', 'info');
          }
        }
      });
    }
    return _layer;
  }

  // Try both @2x and non-@2x tile URLs to determine which the server supports.
  function detectMosaicVariant(callback) {
    if (_mosaicVariant) { if (callback) callback(_mosaicVariant); return; }
    var testLat = -2.5, testLon = 118.0; // central Indonesia
    var z = 6;
    function lon2tile(lon, z) { return Math.floor((lon + 180) / 360 * Math.pow(2, z)); }
    function lat2tile(lat, z) {
      var rad = lat * Math.PI / 180;
      return Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * Math.pow(2, z));
    }
    var x = lon2tile(testLon, z);
    var y = lat2tile(testLat, z);

    var candidate2x = MOSAIC_BASE.replace('{z}', z).replace('{x}', x).replace('{y}', y) + MOSAIC_PARAMS;
    var candidate1x = candidate2x.replace('@2x', '');

    // Try 2x first
    fetch(candidate2x, { method: 'GET', mode: 'cors' }).then(function (res) {
      if (res.ok) { _mosaicVariant = '2x'; console.log('Sentinel-1 mosaic: detected @2x'); if (callback) callback(_mosaicVariant); }
      else {
        // try 1x
        fetch(candidate1x, { method: 'GET', mode: 'cors' }).then(function (r2) {
          if (r2.ok) { _mosaicVariant = '1x'; console.log('Sentinel-1 mosaic: detected 1x'); }
          else { _mosaicVariant = 'unknown'; console.warn('Sentinel-1 mosaic: neither @2x nor 1x returned OK'); }
          if (callback) callback(_mosaicVariant);
        }).catch(function () { _mosaicVariant = 'unknown'; if (callback) callback(_mosaicVariant); });
      }
    }).catch(function () {
      // try 1x if 2x fetch failed
      fetch(candidate1x, { method: 'GET', mode: 'cors' }).then(function (r2) {
        if (r2.ok) { _mosaicVariant = '1x'; console.log('Sentinel-1 mosaic: detected 1x (after 2x failed)'); }
        else { _mosaicVariant = 'unknown'; console.warn('Sentinel-1 mosaic: detection failed'); }
        if (callback) callback(_mosaicVariant);
      }).catch(function () { _mosaicVariant = 'unknown'; if (callback) callback(_mosaicVariant); });
    });
  }

  // Replace existing layer with the appropriate variant if detection changed
  function ensureLayerVariantAndAdd() {
    detectMosaicVariant(function (variant) {
      // if variant determined to be 1x, and current layer uses @2x, recreate it
      if (variant === '1x' && _layer) {
        try { if (map.hasLayer(_layer)) map.removeLayer(_layer); } catch (e) {}
        _layer = null;
        var base = MOSAIC_BASE.replace('@2x', '');
        _layer = L.tileLayer(base + MOSAIC_PARAMS, { maxZoom: 13, minZoom: 0, opacity: 0.85, attribution: 'Sentinel-1 RTC &copy; ESA / Microsoft Planetary Computer', tileSize: 256, zoomOffset: 0, crossOrigin: true });
        _layer.on('tileerror', function (err) { console.error('Sentinel-1 RTC tile error', err); if (typeof showMapToast === 'function') showMapToast('Gagal memuat potongan mosaik Sentinel-1.', 'error'); });
      }
      var layer = getLayer();
      if (!map.hasLayer(layer)) layer.addTo(map);
    });
  }

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
  }

  function hideLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('s1rtc');
  }

  function activateSentinel1Rtc() {
    // Ensure we detect which tile variant to use and add the appropriate layer
    ensureLayerVariantAndAdd();
    showLegend();
    if (typeof toggleCoastlineLayer === 'function') {
      var cb = document.getElementById('toggleCoastlineLayer');
      _coastlineWasActive = cb ? cb.checked : false;
      if (!_coastlineWasActive) {
        toggleCoastlineLayer(true);
        if (cb) cb.checked = true;
      }
    }
  }

  function cleanupSentinel1Rtc() {
    hideLegend();
    var layer = getLayer();
    if (layer && map.hasLayer(layer)) map.removeLayer(layer);
    if (typeof toggleCoastlineLayer === 'function' && !_coastlineWasActive) {
      toggleCoastlineLayer(false);
      var cb = document.getElementById('toggleCoastlineLayer');
      if (cb) cb.checked = false;
      _coastlineWasActive = false;
    }
  }

  window.activateSentinel1Rtc = activateSentinel1Rtc;
  window.cleanupSentinel1Rtc = cleanupSentinel1Rtc;

  map.on('basemapchanged', function (e) {
    if (e.basemap === 'sentinel1-rtc') {
      activateSentinel1Rtc();
    } else {
      cleanupSentinel1Rtc();
    }
  });
})();
