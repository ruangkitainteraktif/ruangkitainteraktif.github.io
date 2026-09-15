/* ═══════════════════════════════════════════════════════════
   BMKG Time Zone Boundary — ArcGIS Dynamic MapLayer
   Source: gis.bmkg.go.id/arcgis/rest/services/Peta_Batas_Wilayah_Waktu_Indonesia
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var MAPSERVER_URL = 'https://gis.bmkg.go.id/arcgis/rest/services/Peta_Batas_Wilayah_Waktu_Indonesia/MapServer';
  var _layer = null;
  var _active = false;

  function getMap() {
    if (typeof window._map !== 'undefined') return window._map;
    if (typeof map !== 'undefined') return map;
    return null;
  }

  function showLegend() {
    if (typeof addUnifiedLegend !== 'function') return;
    var div = L.DomUtil.create('div', 'wind-legend');
    L.DomEvent.disableClickPropagation(div);
    div.innerHTML =
      '<div class="wind-legend-title">Batas Wilayah Waktu Indonesia</div>' +
      '<div class="wind-legend-items">' +
        '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#e74c3c;"></span>WIB (UTC+7)</div>' +
        '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#3498db;"></span>WITA (UTC+8)</div>' +
        '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#2ecc71;"></span>WIT (UTC+9)</div>' +
      '</div>' +
      '<div class="wind-legend-unit">Sumber: BMKG</div>';
    addUnifiedLegend('bmkg-timezone', window.createLegendWithToggle(div));
  }

  function hideLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('bmkg-timezone');
  }

  window.toggleBmkgTimezone = function (visible) {
    var m = getMap();
    if (!m) return;

    if (!visible) {
      if (_layer && m.hasLayer(_layer)) {
        m.removeLayer(_layer);
      }
      hideLegend();
      _active = false;
      return;
    }

    if (!_layer) {
      _layer = L.esri.dynamicMapLayer({
        url: MAPSERVER_URL,
        opacity: 0.7,
        layers: [1586],
        format: 'png32',
        transparent: true
      });
    }

    _layer.addTo(m);
    _active = true;
    showLegend();
  };

  window.isBmkgTimezoneActive = function () {
    return _active;
  };
})();
