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
    var html = '<div class="quake-popup" style="min-width:240px">';
    html += '<div class="quake-popup-header">';
    html += '<div class="quake-popup-status"><span class="quake-popup-status-dot" style="background:#850012"></span>Patahan Aktif</div>';
    html += '<div class="quake-popup-region">' + esc(p.namobj || '-') + '</div>';
    html += '</div>';
    html += '<div style="padding:10px 14px"><div class="quake-popup-details">';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Jenis</span><span class="quake-popup-detail-value">' + esc(p.jenispthn || '-') + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Panjang (km)</span><span class="quake-popup-detail-value">' + esc(p.pjgpthn || '-') + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Lokasi</span><span class="quake-popup-detail-value">' + esc(p.lokasi || '-') + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Geologi</span><span class="quake-popup-detail-value">' + esc(p.geologi || '-') + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Riwayat Gempa</span><span class="quake-popup-detail-value">' + esc(p.sjrhgempa || '-') + '</span></div>';
    html += '</div></div>';
    if (p.remark && p.remark !== '-') {
      html += '<div style="padding:8px 14px;border-top:1px solid #f1f5f9"><div style="font-size:10px;font-weight:600;color:#64748b;margin-bottom:2px">KETERANGAN</div><div style="font-size:11px;color:#475569;line-height:1.4">' + esc(p.remark) + '</div></div>';
    }
    html += '<div class="quake-popup-footer"><span>Sumber: BIG SatuPeta · ' + esc(p.simobj || '-') + '</span></div>';
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
      onEachFeature: function (f, l) { l.bindPopup(buildPopup(f.properties), { maxWidth: 340, className: 'quake-leaflet-popup' }); }
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
