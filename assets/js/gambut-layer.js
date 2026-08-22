/* ── Lahan Gambut — SIMANTAN KLHK Feature Layer ── */
(function () {
  'use strict';

  var GAMBUT_URL = 'https://simontana.kehutanan.go.id/arcgis/rest/services/simontana/gambut/MapServer/0';
  var layer = null;
  var visible = false;

  var FILL = '#c9f2d0';
  var STROKE = '#6e8f57';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function fmtArea(v) {
    if (v == null || isNaN(v)) return '-';
    return Number(v).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' m²';
  }

  function buildPopup(p) {
    var html = '<div class="agol-popup" style="min-width:240px">';
    html += '<div class="agol-popup-header agol-geo-kawasan">';
    html += '<div class="agol-popup-badge"><span class="agol-popup-badge-dot" style="background:' + FILL + ';"></span>Lahan Gambut</div>';
    html += '<div class="agol-popup-title">' + esc(p.lg_50 || 'Lahan Gambut') + '</div>';
    html += '</div>';
    html += '<div class="agol-popup-body"><div class="agol-popup-fields">';
    if (p.l != null) html += '<div class="agol-popup-field"><span class="agol-popup-field-label">L (kedalaman)</span><span class="agol-popup-field-value">' + esc(p.l) + '</span></div>';
    if (p.lpdc != null) html += '<div class="agol-popup-field"><span class="agol-popup-field-label">LPDC</span><span class="agol-popup-field-value">' + esc(p.lpdc) + '</span></div>';
    if (p.lcyll != null) html += '<div class="agol-popup-field"><span class="agol-popup-field-label">LCYLL</span><span class="agol-popup-field-value">' + esc(p.lcyll) + '</span></div>';
    if (p['st_area(shape)'] != null) html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Luas</span><span class="agol-popup-field-value">' + fmtArea(p['st_area(shape)']) + '</span></div>';
    html += '</div></div>';
    html += '<div class="agol-popup-footer"><span>Sumber: SIMANTAN KLHK</span></div>';
    html += '</div>';
    return html;
  }

  function showLayer() {
    if (layer) {
      if (!map.hasLayer(layer)) layer.addTo(map);
      visible = true;
      return;
    }
    layer = L.esri.featureLayer({
      url: GAMBUT_URL,
      where: '1=1',
      outFields: ['lg_50', 'l', 'lpdc', 'lcyll', 'st_area(shape)'],
      style: function () {
        return {
          color: STROKE,
          weight: 0.6,
          opacity: 0.9,
          fillColor: FILL,
          fillOpacity: 0.45
        };
      },
      onEachFeature: function (f, l) {
        l.bindPopup(buildPopup(f.properties), { maxWidth: 340, className: 'agol-leaflet-popup' });
      }
    });
    layer.addTo(map);
    visible = true;
    layer.on('error', function (e) { console.error('[Lahan Gambut] Error:', e); });
  }

  function hideLayer() {
    if (layer && map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
    visible = false;
  }

  function toggleLayer(v) {
    if (v) showLayer();
    else hideLayer();
  }

  function cleanup() {
    hideLayer();
    var cb = document.getElementById('toggleGambutLayer');
    if (cb) cb.checked = false;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var cb = document.getElementById('toggleGambutLayer');
    if (cb) {
      cb.addEventListener('change', function () { toggleLayer(this.checked); });
    }
  });

  window.gambutLayerCleanup = cleanup;
})();
