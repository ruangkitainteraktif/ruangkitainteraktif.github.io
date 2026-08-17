/* ── Geologi Geostruktur — BIG SatuPeta geostructure layer ── */
(function () {
  'use strict';

  var URL = 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/9';
  var layer = null;
  var visible = false;

  function esc(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  var STRUCT_COLOR = {
    'Lipatan': '#df5da7', 'Scarp': '#e8e8e8', 'Foliasi': '#d9d9d9',
    'Patahan': '#c5c5c5', 'Rekahan': '#b5b5b5', 'Kelurusan': '#a1a1a1',
    'Sumbu Lipatan': '#8e8e8e', 'Pematang Pantai': '#7a7a7a', 'Not Classified': '#686868'
  };

  function getColor(namaobj) { return STRUCT_COLOR[namaobj] || '#999999'; }

  function buildPopup(p) {
    var color = getColor(p.namaobj);
    var html = '<div class="quake-popup" style="min-width:240px">';
    html += '<div class="quake-popup-header">';
    html += '<div class="quake-popup-status"><span class="quake-popup-status-dot" style="background:' + color + '"></span>Geostruktur</div>';
    html += '<div class="quake-popup-region">' + esc(p.namaobj || '-') + '</div>';
    html += '</div>';
    html += '<div style="padding:10px 14px"><div class="quake-popup-details">';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Jenis</span><span class="quake-popup-detail-value">' + esc(p.namaobj || '-') + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Kelas Struktur</span><span class="quake-popup-detail-value">' + esc(p.klsstr || '-') + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Kode</span><span class="quake-popup-detail-value">' + esc(p.fcode || '-') + '</span></div>';
    html += '</div></div>';
    if (p.remark && p.remark !== '-') {
      html += '<div style="padding:8px 14px;border-top:1px solid #f1f5f9"><div style="font-size:10px;font-weight:600;color:#64748b;margin-bottom:2px">KETERANGAN</div><div style="font-size:11px;color:#475569;line-height:1.4">' + esc(p.remark) + '</div></div>';
    }
    html += '<div class="quake-popup-footer"><span>Sumber: BIG SatuPeta</span></div>';
    html += '</div>';
    return html;
  }

  function toggleLayer(v) {
    if (!v) { if (layer && map.hasLayer(layer)) map.removeLayer(layer); visible = false; return; }
    if (layer) { if (!map.hasLayer(layer)) layer.addTo(map); visible = true; return; }
    layer = L.esri.featureLayer({
      url: URL, where: '1=1',
      outFields: ['fcode', 'namaobj', 'klsstr', 'remark'],
      style: function (f) {
        return { color: getColor(f.properties.namaobj), weight: 1.2, opacity: 0.8 };
      },
      onEachFeature: function (f, l) { l.bindPopup(buildPopup(f.properties), { maxWidth: 340, className: 'quake-leaflet-popup' }); }
    });
    layer.addTo(map); visible = true;
    layer.on('error', function (e) { console.error('[Geostruktur] Error:', e); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var cb = document.getElementById('toggleGeostruktur');
    if (!cb) return;
    cb.addEventListener('change', function () { toggleLayer(this.checked); });
  });
  window.isGeostrukturActive = function () { return visible; };
})();
