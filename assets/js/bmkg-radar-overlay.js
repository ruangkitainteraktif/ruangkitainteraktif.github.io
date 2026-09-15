/* ═══════════════════════════════════════════════════════════
   BMKG Radar Overlay — ArcGIS Dynamic MapLayer
   Source: gis.bmkg.go.id/arcgis/rest/services/radarcmax
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var RADAR_URL = 'https://gis.bmkg.go.id/arcgis/rest/services/radarcmax/MapServer';
  var _radarLayer = null;
  var _active = false;
  var _refreshTimer = null;
  var _hasLegend = false;

  var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  function getMap() {
    if (typeof window._map !== 'undefined') return window._map;
    if (typeof map !== 'undefined') return map;
    return null;
  }

  function formatRadarTime(d) {
    var dd = String(d.getDate()).padStart(2, '0');
    var mon = MONTH_NAMES[d.getMonth()];
    var yyyy = d.getFullYear();
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return dd + ' ' + mon + ' ' + yyyy + ' \u2022 ' + hh + '.' + mm + ' WIB';
  }

  function updateTimestamp() {
    var el = document.getElementById('radarTimestampText');
    if (el) el.textContent = formatRadarTime(new Date());
  }

  function showTimestamp() {
    var el = document.getElementById('radarTimestamp');
    if (el) { el.style.display = ''; updateTimestamp(); }
  }

  function hideTimestamp() {
    var el = document.getElementById('radarTimestamp');
    if (el) el.style.display = 'none';
  }

  function refreshRadar() {
    if (!_radarLayer) return;
    var m = getMap();
    if (!m) return;
    _radarLayer.setParams({ _ts: Date.now() });
    updateTimestamp();
  }

  function showLegend() {
    if (typeof addUnifiedLegend !== 'function') return;
    var div = L.DomUtil.create('div', 'wind-legend');
    L.DomEvent.disableClickPropagation(div);
    div.innerHTML =
      '<div class="wind-legend-title">Radar Cuaca BMKG (dBZ)</div>' +
      '<div class="wind-legend-bar" style="background:linear-gradient(90deg,#a0d8ef,#01b8ff,#00e500,#b4dc00,#ffdc00,#ff7100,#ff0000,#b800d6);"></div>' +
      '<div class="wind-legend-labels"><span>5</span><span>15</span><span>25</span><span>35</span><span>45</span><span>55</span><span>65</span><span>75</span></div>' +
      '<div class="wind-legend-items">' +
        '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#a0d8ef;"></span>5 \u2013 15 dBZ \u2014 Sangat Ringan</div>' +
        '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#01b8ff;"></span>15 \u2013 25 dBZ \u2014 Ringan</div>' +
        '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#00e500;"></span>25 \u2013 35 dBZ \u2014 Sedang</div>' +
        '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#ffdc00;"></span>35 \u2013 45 dBZ \u2014 Deras</div>' +
        '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#ff7100;"></span>45 \u2013 55 dBZ \u2014 Sangat Deras</div>' +
        '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#ff0000;"></span>55 \u2013 65 dBZ \u2014 Ekstrem</div>' +
        '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#b800d6;"></span>&gt; 65 dBZ \u2014 Hail</div>' +
      '</div>' +
      '<div class="wind-legend-unit">Auto-refresh 6 menit | Sumber: BMKG Radar</div>';
    addUnifiedLegend('bmkg-radar', window.createLegendWithToggle(div));
    _hasLegend = true;
  }

  function hideLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('bmkg-radar');
    _hasLegend = false;
  }

  window.toggleBmkgRadar = function (visible) {
    var m = getMap();
    if (!m) return;

    if (!visible) {
      if (_radarLayer && m.hasLayer(_radarLayer)) {
        m.removeLayer(_radarLayer);
      }
      if (_refreshTimer) {
        clearInterval(_refreshTimer);
        _refreshTimer = null;
      }
      hideLegend();
      hideTimestamp();
      _active = false;
      return;
    }

    if (!_radarLayer) {
      _radarLayer = L.esri.dynamicMapLayer({
        url: RADAR_URL,
        opacity: 0.55,
        layers: [1],
        format: 'png32',
        transparent: true
      });
    }

    _radarLayer.addTo(m);
    _active = true;
    showLegend();
    showTimestamp();

    if (_refreshTimer) clearInterval(_refreshTimer);
    _refreshTimer = setInterval(refreshRadar, 360000);
  };

  window.isBmkgRadarActive = function () {
    return _active;
  };
})();
