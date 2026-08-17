/* ── Peta Geologi — BIG SatuPeta geology layer ── */
(function () {
  'use strict';

  var URL = 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/8';
  var layer = null;
  var visible = false;

  function esc(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  var AGE_COLOR = {
    'Holosen': '#8b50c7', 'Kuarter': '#62c232', 'Neogen': '#ba5a30',
    'Miocene': '#4aaec2', 'Miosen': '#4aaec2', 'Oligocene': '#c22d61',
    'Paleogen': '#c9b34f', 'Pra Tersier': '#235ca6', 'Meso - Paleo': '#3da167',
    'Paleo - Meso': '#3da167', 'Tersier': '#c932a4', 'Mesozoikum': '#2523a6',
    'Jura': '#709c3b', 'Triassic': '#b52634', 'Trias': '#b52634',
    'Paleozoikum': '#32bfaa', 'Perm': '#9c6d22', 'Permian': '#9c6d22',
    'Pre-Permia': '#27a847', 'Carbonifer': '#c9c42e', 'Karbon': '#c9c42e',
    'Permo Karbon': '#3982b3', 'Kapur': '#2c49bf', 'Devonian': '#9e423f',
    'Silurian': '#9924ad', 'Ordovician': '#9c3379', 'Prakambrium': '#5433a3',
    'Proteroz': '#a0b336'
  };

  function getColor(umur) { return AGE_COLOR[umur] || '#6b7280'; }

  function buildPopup(p) {
    var color = getColor(p.umurobj);
    var html = '<div class="agol-popup" style="min-width:240px">';
    html += '<div class="agol-popup-header agol-geo-geologi">';
    html += '<div class="agol-popup-badge"><span class="agol-popup-badge-dot"></span>Peta Geologi</div>';
    html += '<div class="agol-popup-title">' + esc(p.namobj || '-') + '</div>';
    html += '</div>';
    html += '<div class="agol-popup-body"><div class="agol-popup-fields">';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Umur Geologi</span><span class="agol-popup-field-value">' + esc(p.umurobj || '-') + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Kode</span><span class="agol-popup-field-value">' + esc(p.fcode || '-') + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Simbol</span><span class="agol-popup-field-value">' + esc(p.simobj || '-') + '</span></div>';
    html += '</div>';
    if (p.remark && p.remark !== '-') {
      html += '<div class="agol-popup-remark"><div class="agol-popup-remark-title">Keterangan</div><div class="agol-popup-remark-text">' + esc(p.remark) + '</div></div>';
    }
    html += '</div>';
    html += '<div class="agol-popup-footer"><span>Sumber: BIG SatuPeta</span></div>';
    html += '</div>';
    return html;
  }

  function toggleLayer(v) {
    if (!v) { if (layer && map.hasLayer(layer)) map.removeLayer(layer); visible = false; return; }
    if (layer) { if (!map.hasLayer(layer)) layer.addTo(map); visible = true; return; }
    layer = L.esri.featureLayer({
      url: URL, where: '1=1',
      outFields: ['fcode', 'simobj', 'namobj', 'umurobj', 'remark'],
      style: function (f) {
        var color = getColor(f.properties.umurobj);
        return { color: color, weight: 0.5, fillColor: color, fillOpacity: 0.5 };
      },
      onEachFeature: function (f, l) { l.bindPopup(buildPopup(f.properties), { maxWidth: 340, className: 'agol-leaflet-popup' }); }
    });
    layer.addTo(map); visible = true;
    layer.on('error', function (e) { console.error('[Peta Geologi] Error:', e); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var cb = document.getElementById('togglePetaGeologi');
    if (!cb) return;
    cb.addEventListener('change', function () { toggleLayer(this.checked); });
  });
  window.isPetaGeologiActive = function () { return visible; };
})();
