/* ── Kawasan Bentang Alam Karst — BIG SatuPeta karst layer ── */
(function () {
  'use strict';

  var URL = 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/23';
  var layer = null;
  var visible = false;

  function esc(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function getColor(remark) {
    if (!remark) return '#a89363';
    if (remark.indexOf('Level 1') !== -1) return '#d8b273';
    if (remark.indexOf('Level 2') !== -1) return '#9e7462';
    if (remark.indexOf('Level 3') !== -1) return '#9e9362';
    if (remark.indexOf('Level 4') !== -1) return '#d39774';
    return '#a89363';
  }

  function buildPopup(p) {
    var html = '<div class="agol-popup" style="min-width:240px">';
    html += '<div class="agol-popup-header agol-geo-karst">';
    html += '<div class="agol-popup-badge"><span class="agol-popup-badge-dot"></span>Karst</div>';
    html += '<div class="agol-popup-title">' + esc(p.namobj || '-') + '</div>';
    html += '</div>';
    html += '<div class="agol-popup-body"><div class="agol-popup-fields">';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Level</span><span class="agol-popup-field-value">' + esc(p.remark || '-') + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">SK KBAK</span><span class="agol-popup-field-value">' + esc(p.skkbak || '-') + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Kelas KBAK</span><span class="agol-popup-field-value">' + esc(p.klskbak || '-') + '</span></div>';
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
      outFields: ['namobj', 'skkbak', 'datstr', 'klskbak', 'remark'],
      style: function (f) {
        return { color: getColor(f.properties.remark), weight: 1, fillColor: getColor(f.properties.remark), fillOpacity: 0.4 };
      },
      onEachFeature: function (f, l) { l.bindPopup(buildPopup(f.properties), { maxWidth: 340, className: 'agol-leaflet-popup' }); }
    });
    layer.addTo(map); visible = true;
    layer.on('error', function (e) { console.error('[Karst] Error:', e); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var cb = document.getElementById('toggleKarst');
    if (!cb) return;
    cb.addEventListener('change', function () { toggleLayer(this.checked); });
  });
  window.isKarstActive = function () { return visible; };
})();
