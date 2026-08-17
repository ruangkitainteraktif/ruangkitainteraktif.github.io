/* -- Gempa NTT 2026 (BNPB) -- */
(function () {
  'use strict';

  var URL = 'https://gis.bnpb.go.id/server/rest/services/2026_gempabumi_ntt/mv_gempa_ntt_2026_v1/FeatureServer/25';
  var layer = null;
  var visible = false;

  function esc(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function fmt(n) {
    return n != null ? Number(n).toLocaleString('id-ID') : '-';
  }

  function severityColor(p) {
    var berat = p.rumah_rusak_berat || 0;
    var sedang = p.rumah_rusak_sedang || 0;
    var ringan = p.rumah_rusak_ringan || 0;
    var meninggal = p.meninggal || 0;
    if (meninggal > 0 || berat > 10) return { fill: '#dc2626', stroke: '#991b1b', label: 'Berat' };
    if (sedang > 5 || ringan > 20) return { fill: '#f59e0b', stroke: '#b45309', label: 'Sedang' };
    if (ringan > 0 || sedang > 0) return { fill: '#3b82f6', stroke: '#1d4ed8', label: 'Ringan' };
    return { fill: '#6b7280', stroke: '#4b5563', label: 'Data' };
  }

  function buildPopup(p) {
    var sev = severityColor(p);
    var sevClass = sev.label === 'Berat' ? 'agol-severity-berat' : sev.label === 'Sedang' ? 'agol-severity-sedang' : sev.label === 'Ringan' ? 'agol-severity-ringan' : 'agol-severity-data';
    var dateStr = p.tanggal_update ? new Date(p.tanggal_update).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';
    var html = '<div class="agol-popup" style="min-width:260px">';
    html += '<div class="agol-popup-header ' + sevClass + '">';
    html += '<div class="agol-popup-badge"><span class="agol-popup-badge-dot"></span>' + esc(p.jenis_bencana || 'Gempa Bumi') + '</div>';
    html += '<div class="agol-popup-title">' + esc(p.kabupaten || '-') + '</div>';
    html += '<div class="agol-popup-subtitle">' + esc(p.provinsi || '-') + '</div>';
    html += '</div>';
    html += '<div class="agol-popup-body">';
    html += '<div class="agol-popup-meta">Update: ' + dateStr + '</div>';
    html += '<div class="agol-popup-fields">';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Meninggal</span><span class="agol-popup-field-value" style="color:' + (p.meninggal > 0 ? '#dc2626' : '#16a34a') + ';">' + fmt(p.meninggal) + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Luka Sakit</span><span class="agol-popup-field-value">' + fmt(p.luka_sakit_) + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Mengungsi</span><span class="agol-popup-field-value">' + fmt(p.mengungsi_) + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Rusak Ringan</span><span class="agol-popup-field-value">' + fmt(p.rumah_rusak_ringan) + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Rusak Sedang</span><span class="agol-popup-field-value">' + fmt(p.rumah_rusak_sedang) + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Rusak Berat</span><span class="agol-popup-field-value" style="color:' + (p.rumah_rusak_berat > 0 ? '#dc2626' : '#16a34a') + ';">' + fmt(p.rumah_rusak_berat) + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Total Rusak</span><span class="agol-popup-field-value"><strong>' + fmt(p.rumah_rusak) + '</strong></span></div>';
    html += '</div>';
    if (p.kib) {
      html += '<div class="agol-popup-remark"><div class="agol-popup-remark-title">KIB</div><div class="agol-popup-remark-text">' + esc(p.kib) + '</div></div>';
    }
    html += '</div>';
    html += '<div class="agol-popup-footer"><span>Sumber: BNPB</span></div>';
    html += '</div>';
    return html;
  }

  function toggleLayer(v) {
    if (!v) { if (layer && map.hasLayer(layer)) map.removeLayer(layer); visible = false; return; }
    if (layer) { if (!map.hasLayer(layer)) layer.addTo(map); visible = true; return; }
    layer = L.esri.featureLayer({
      url: URL,
      where: '1=1',
      outFields: ['kib', 'provinsi', 'kabupaten', 'tanggal_update', 'jenis_bencana', 'meninggal', 'luka_sakit_', 'mengungsi_', 'rumah_rusak_ringan', 'rumah_rusak_sedang', 'rumah_rusak_berat', 'rumah_rusak'],
      style: function (f) {
        var sev = severityColor(f.properties);
        return { color: sev.stroke, weight: 1.5, fillColor: sev.fill, fillOpacity: 0.35, opacity: 0.85 };
      },
      onEachFeature: function (f, l) {
        l.bindPopup(buildPopup(f.properties), { maxWidth: 360, className: 'agol-leaflet-popup' });
      }
    });
    layer.addTo(map);
    visible = true;
    layer.on('error', function (e) { console.error('[Gempa NTT] Error:', e); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var cb = document.getElementById('toggleGempaNTT');
    if (!cb) return;
    cb.addEventListener('change', function () { toggleLayer(this.checked); });
  });

  window.isGempaNTTActive = function () { return visible; };
})();
