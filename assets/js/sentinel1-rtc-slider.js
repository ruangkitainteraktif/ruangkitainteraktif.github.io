/* ── Sentinel-1 RTC (SAR) Global Mosaic — Planetary Computer ── */
(function () {
  'use strict';

  var MOSAIC_BASE = 'https://planetarycomputer.microsoft.com/api/data/v1/mosaic/e02134555ecc4ae7dc64dd2e4e7acd51/tiles/WebMercatorQuad/{z}/{x}/{y}@2x';
  var MOSAIC_PARAMS = '?asset_as_band=true' +
    '&expression=0.03+%2B+log+%2810e-4+-+log+%280.05+%2F+%280.02+%2B+2+%2A+vv%29%29%29%3B0.05+%2B+exp+%280.25+%2A+%28log+%280.01+%2B+2+%2A+vv%29+%2B+log+%280.02+%2B+5+%2A+vh%29%29%29%3B1+-+log+%280.05+%2F+%280.045+-+0.9+%2A+vv%29%29' +
    '&rescale=0%2C.8000&rescale=0%2C1.000&rescale=0%2C1.000' +
    '&collection=sentinel-1-rtc&format=png';
  // If you want to use the provided ArcGIS ImageServer exportImage as global tile source,
  // use the following template. It expects bbox values in EPSG:3857 (102100) and size parameters.
  var ARCGIS_EXPORT_TEMPLATE = 'https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer/exportImage?f=image&bbox={minx}%2C{miny}%2C{maxx}%2C{maxy}&bboxSR=102100&imageSR=102100&size={w}%2C{h}&format=png&mosaicRule=%7B%22ascending%22%3Atrue%2C%22mosaicMethod%22%3A%22esriMosaicAttribute%22%2C%22mosaicOperation%22%3A%22MT_FIRST%22%2C%22sortField%22%3A%22Year%22%2C%22sortValue%22%3A%222050%22%7D&renderingRule=%7B%22rasterFunction%22%3A%22Cartographic%20Renderer%20for%20Visualization%20and%20Analysis%22%7D&time=1767225599000';
  // User-requested Planetary Computer mosaic is the active global source.
  var GIBS_WMTS_TEMPLATE = null;

  var _layer = null;
  var _coastlineWasActive = false;
  var _mosaicVariant = null; // '2x' or '1x' or null (undetected)
  var _triedFallback = false;
  var _prevMaxZoom = null;

  function getLayer() {
    if (!_layer) {
      // Keep the Planetary Computer global mosaic as the active source.
      if (MOSAIC_BASE) {
        var base = MOSAIC_BASE;
        var params = MOSAIC_PARAMS;
        if (_mosaicVariant === '1x') {
          base = MOSAIC_BASE.replace('%7C', '|').replace('@2x', '');
        }
        _layer = L.tileLayer(base + params, {
          maxZoom: 18,
          minZoom: 0,
          opacity: 0.85,
          attribution: 'Sentinel-1 RTC &copy; ESA / Microsoft Planetary Computer',
          tileSize: 256,
          zoomOffset: 0,
          crossOrigin: true
        });
        _layer.on('tileerror', function (err) {
          var src = (err && err.tile && (err.tile.currentSrc || err.tile.src)) || err && err.url || 'unknown';
          console.error('Sentinel-1 RTC tile error:', src, err);
          if (typeof showMapToast === 'function') showMapToast('Citra Sentinel-1 RTC tidak tersedia saat ini.', 'error');
        });
      } else if (ARCGIS_EXPORT_TEMPLATE) {
        function tileBBox(z, x, y) {
          var extent = 20037508.342789244 * 2; // total world extent in meters
          var tileCount = Math.pow(2, z);
          var tileSizeMeters = extent / tileCount;
          var minx = -20037508.342789244 + x * tileSizeMeters;
          var maxx = -20037508.342789244 + (x + 1) * tileSizeMeters;
          var maxy = 20037508.342789244 - y * tileSizeMeters;
          var miny = 20037508.342789244 - (y + 1) * tileSizeMeters;
          return { minx: minx, miny: miny, maxx: maxx, maxy: maxy };
        }

        _layer = L.tileLayer('', {
          maxZoom: 13,
          minZoom: 0,
          opacity: 0.85,
          attribution: 'Sentinel-2 LandCover (Esri)',
          tileSize: 512,
          crossOrigin: true,
          getTileUrl: function (coords) {
            var z = coords.z, x = coords.x, y = coords.y;
            var bbox = tileBBox(z, x, y);
            var w = this.options.tileSize || 512;
            var h = w;
            // Build URL by replacing placeholders
            var url = ARCGIS_EXPORT_TEMPLATE.replace('{minx}', bbox.minx.toFixed(3)).replace('{miny}', bbox.miny.toFixed(3)).replace('{maxx}', bbox.maxx.toFixed(3)).replace('{maxy}', bbox.maxy.toFixed(3)).replace('{w}', w).replace('{h}', h);
            return url;
          }
        });

        _layer.on('tileerror', function (err) {
          var src = (err && err.tile && (err.tile.currentSrc || err.tile.src)) || err && err.url || 'unknown';
          console.error('ArcGIS export tile error:', src, err);
          if (typeof showMapToast === 'function') showMapToast('Citra Sentinel-1 RTC tidak tersedia saat ini.', 'error');
        });
      } else {
        // Final fallback to Planetary Computer mosaic.
        var base = MOSAIC_BASE;
        var params = MOSAIC_PARAMS;
        if (_mosaicVariant === '1x') {
          base = MOSAIC_BASE.replace('%7C', '|').replace('@2x', '');
        }
        _layer = L.tileLayer(base + params, {
          maxZoom: 18,
          minZoom: 0,
          opacity: 0.85,
          attribution: 'Sentinel-1 RTC &copy; ESA / Microsoft Planetary Computer',
          tileSize: 256,
          zoomOffset: 0,
          crossOrigin: true
        });
        _layer.on('tileerror', function (err) {
          var src = (err && err.tile && (err.tile.currentSrc || err.tile.src)) || err && err.url || 'unknown';
          console.error('Sentinel-1 RTC tile error:', src, err);
          if (typeof showMapToast === 'function') showMapToast('Citra Sentinel-1 RTC tidak tersedia saat ini.', 'error');
        });
      }
    }
    return _layer;
  }

  // The Planetary Computer source is already the intended tile source; do not block map rendering
  // on a separate async probe. A direct tile layer renders immediately and preserves the global mosaic.
  function ensureLayerVariantAndAdd() {
    var layer = getLayer();
    if (!map.hasLayer(layer)) layer.addTo(map);
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
    if (_prevMaxZoom === null) {
      _prevMaxZoom = map.getMaxZoom();
    }
    if (_prevMaxZoom !== null && _prevMaxZoom > 13) {
      map.setMaxZoom(13);
    }

    // Ensure we detect which tile variant to use and add the appropriate layer
    ensureLayerVariantAndAdd();
    showLegend();
    if (typeof toggleCoastlineLayer === 'function') {
      var cb = document.getElementById('toggleCoastlineLayer');
      _coastlineWasActive = cb ? cb.checked : false;
      toggleCoastlineLayer(false);
      if (cb) cb.checked = false;
    }
  }

  function cleanupSentinel1Rtc() {
    hideLegend();
    var layer = getLayer();
    if (layer && map.hasLayer(layer)) map.removeLayer(layer);
    if (typeof toggleCoastlineLayer === 'function') {
      toggleCoastlineLayer(false);
      var cb = document.getElementById('toggleCoastlineLayer');
      if (cb) cb.checked = false;
      _coastlineWasActive = false;
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
