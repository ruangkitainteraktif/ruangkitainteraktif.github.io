/* ── Sentinel-1 RTC (SAR) Global Mosaic — Planetary Computer ── */
(function () {
  'use strict';

  var MOSAIC_BASE = 'https://planetarycomputer.microsoft.com/api/data/v1/mosaic/e02134555ecc4ae7dc64dd2e4e7acd51/tiles/WebMercatorQuad/{z}/{x}/{y}';
  var MOSAIC_PARAMS = '?asset_as_band=true' +
    '&expression=0.03+%2B+log+%2810e-4+-+log+%280.05+%2F+%280.02+%2B+2+%2A+vv%29%29%29%3B0.05+%2B+exp+%280.25+%2A+%28log+%280.01+%2B+2+%2A+vv%29+%2B+log+%280.02+%2B+5+%2A+vh%29%29%29%3B1+-+log+%280.05+%2F+%280.045+-+0.9+%2A+vv%29%29' +
    '&rescale=0%2C.8000&rescale=0%2C1.000&rescale=0%2C1.000' +
    '&collection=sentinel-1-rtc&format=png';

  var JAKARTA_CENTER = [-6.2088, 106.8456];
  var JAKARTA_ZOOM = 12;

  var _layer = null;
  var _prevMaxZoom = null;
  var _fallbackLayer = null;
  var _zoomHandler = null;

  function getLayer() {
    if (!_layer) {
      _layer = L.tileLayer(MOSAIC_BASE + MOSAIC_PARAMS, {
        maxZoom: 18,
        minZoom: 6,
        maxNativeZoom: 14,
        opacity: 0.85,
        attribution: 'Sentinel-1 RTC &copy; ESA / Microsoft Planetary Computer',
        tileSize: 256,
        crossOrigin: true
      });
      _layer.on('tileerror', function (err) {
        var src = (err && err.tile && (err.tile.currentSrc || err.tile.src)) || err && err.url || 'unknown';
        console.error('Sentinel-1 RTC tile error:', src, err);
        if (typeof showMapToast === 'function') showMapToast('Citra Sentinel-1 RTC tidak tersedia saat ini.', 'error');
      });
    }
    return _layer;
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
      '<div class="himawari-legend-unit">Sumber: ESA Sentinel-1 / Microsoft Planetary Computer</div>' +
      '<div class="himawari-legend-unit" style="margin-top:4px;color:#f59e0b;">Detail maksimal: Kota Jakarta</div>';
    addUnifiedLegend('s1rtc', window.createLegendWithToggle(div));
  }

  function hideLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('s1rtc');
  }

  function activateSentinel1Rtc() {
    if (_prevMaxZoom === null) {
      _prevMaxZoom = map.getMaxZoom();
    }
    map.setMaxZoom(18);

    var layer = getLayer();
    if (!map.hasLayer(layer)) layer.addTo(map);

    if (typeof baseTileLayers !== 'undefined' && baseTileLayers['esri-satellite']) {
      _fallbackLayer = baseTileLayers['esri-satellite'];
      _zoomHandler = function (e) {
        if (e.target.getZoom() < 6 && !map.hasLayer(_fallbackLayer)) {
          _fallbackLayer.addTo(map);
        } else if (e.target.getZoom() >= 6 && map.hasLayer(_fallbackLayer)) {
          map.removeLayer(_fallbackLayer);
        }
      };
      map.on('zoomend', _zoomHandler);
    }

    if (!isInJakarta()) {
      map.setView(JAKARTA_CENTER, JAKARTA_ZOOM, { animate: true });
    }

    showLegend();
  }

  function isInJakarta() {
    var center = map.getCenter();
    return center.lat >= -6.4 && center.lat <= -6.1 && center.lng >= 106.7 && center.lng <= 107.0;
  }

  function cleanupSentinel1Rtc() {
    hideLegend();
    var layer = getLayer();
    if (layer && map.hasLayer(layer)) map.removeLayer(layer);
    if (_fallbackLayer && map.hasLayer(_fallbackLayer)) {
      map.removeLayer(_fallbackLayer);
      _fallbackLayer = null;
    }
    if (_zoomHandler) {
      map.off('zoomend', _zoomHandler);
      _zoomHandler = null;
    }
    if (_prevMaxZoom !== null) {
      map.setMaxZoom(_prevMaxZoom);
      _prevMaxZoom = null;
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
