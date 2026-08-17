/* ── Kerentanan Likuifaksi — BIG SatuPeta liquefaction layer ── */
(function () {
  'use strict';

  var URL = 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/43';
  var layer = null;
  var visible = false;

  function esc(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function getColor(kerentanan) {
    if (!kerentanan) return { color: '#6b7280', fill: '#6b7280' };
    var k = kerentanan.toLowerCase();
    if (k.indexOf('tinggi') !== -1 || k.indexOf('high') !== -1) return { color: '#dc2626', fill: '#dc2626' };
    if (k.indexOf('sedang') !== -1 || k.indexOf('medium') !== -1 || k.indexOf('menengah') !== -1) return { color: '#f59e0b', fill: '#f59e0b' };
    return { color: '#a78bfa', fill: '#a78bfa' };
  }

  function buildPopup(p) {
    var c = getColor(p.kerentanan);
    var html = '<div class="agol-popup" style="min-width:240px">';
    html += '<div class="agol-popup-header agol-geo-likuifaksi">';
    html += '<div class="agol-popup-badge"><span class="agol-popup-badge-dot"></span>Likuifaksi</div>';
    html += '<div class="agol-popup-title">' + esc(p.namobj || '-') + '</div>';
    html += '</div>';
    html += '<div class="agol-popup-body"><div class="agol-popup-fields">';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Kerentanan</span><span class="agol-popup-field-value">' + esc(p.kerentanan || '-') + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Keterangan</span><span class="agol-popup-field-value">' + esc(p.keterangan || '-') + '</span></div>';
    html += '</div></div>';
    html += '<div class="agol-popup-footer"><span>Sumber: BIG SatuPeta</span></div>';
    html += '</div>';
    return html;
  }

  function toggleLayer(v) {
    if (!v) { if (layer && map.hasLayer(layer)) map.removeLayer(layer); visible = false; return; }
    if (layer) { if (!map.hasLayer(layer)) layer.addTo(map); visible = true; return; }
    layer = L.esri.featureLayer({
      url: URL, where: '1=1',
      outFields: ['namobj', 'kerentanan', 'keterangan'],
      style: function (f) {
        var c = getColor(f.properties.kerentanan);
        return { color: c.color, weight: 1, fillColor: c.fill, fillOpacity: 0.35 };
      },
      onEachFeature: function (f, l) { l.bindPopup(buildPopup(f.properties), { maxWidth: 340, className: 'agol-leaflet-popup' }); }
    });
    layer.addTo(map); visible = true;
    layer.on('error', function (e) { console.error('[Likuifaksi] Error:', e); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var cb = document.getElementById('toggleLikuifaksi');
    if (!cb) return;
    cb.addEventListener('change', function () { toggleLayer(this.checked); });
  });
  window.isLikuifaksiActive = function () { return visible; };
})();
