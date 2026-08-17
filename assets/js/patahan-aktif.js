/* ── Patahan Aktif Indonesia — BIG SatuPeta fault lines layer ── */
(function () {
  'use strict';

  var URL = 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/44';
  var layer = null;
  var visible = false;

  function esc(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function buildPopup(p) {
    var html = '<div class="agol-popup" style="min-width:240px">';
    html += '<div class="agol-popup-header agol-geo-patahan">';
    html += '<div class="agol-popup-badge"><span class="agol-popup-badge-dot"></span>Patahan Aktif</div>';
    html += '<div class="agol-popup-title">' + esc(p.namobj || '-') + '</div>';
    html += '</div>';
    html += '<div class="agol-popup-body"><div class="agol-popup-fields">';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Jenis</span><span class="agol-popup-field-value">' + esc(p.jenispthn || '-') + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Panjang</span><span class="agol-popup-field-value">' + esc(p.pjgpthn || '-') + ' km</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Lokasi</span><span class="agol-popup-field-value">' + esc(p.lokasi || '-') + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Geologi</span><span class="agol-popup-field-value">' + esc(p.geologi || '-') + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Riwayat Gempa</span><span class="agol-popup-field-value">' + esc(p.sjrhgempa || '-') + '</span></div>';
    html += '</div>';
    if (p.remark && p.remark !== '-') {
      html += '<div class="agol-popup-remark"><div class="agol-popup-remark-title">Keterangan</div><div class="agol-popup-remark-text">' + esc(p.remark) + '</div></div>';
    }
    html += '</div>';
    html += '<div class="agol-popup-footer"><span>Sumber: BIG SatuPeta · ' + esc(p.simobj || '-') + '</span></div>';
    html += '</div>';
    return html;
  }

  function toggleLayer(v) {
    if (!v) { if (layer && map.hasLayer(layer)) map.removeLayer(layer); visible = false; return; }
    if (layer) { if (!map.hasLayer(layer)) layer.addTo(map); visible = true; return; }
    layer = L.esri.featureLayer({
      url: URL, where: '1=1',
      outFields: ['simobj', 'namobj', 'jenispthn', 'pjgpthn', 'remark', 'lokasi', 'geologi', 'sjrhgempa'],
      style: { color: '#850012', weight: 1.5, opacity: 0.85 },
      onEachFeature: function (f, l) {       l.bindPopup(buildPopup(f.properties), { maxWidth: 340, className: 'agol-leaflet-popup' }); }
    });
    layer.addTo(map); visible = true;
    layer.on('error', function (e) { console.error('[Patahan Aktif] Error:', e); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var cb = document.getElementById('togglePatahanAktif');
    if (!cb) return;
    cb.addEventListener('change', function () { toggleLayer(this.checked); });
  });
  window.isPatahanAktifActive = function () { return visible; };
})();
