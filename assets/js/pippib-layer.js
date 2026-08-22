/* ── PIPPIB 2023 Periode I — SIMANTAN KLHK Feature Layer ── */
(function () {
  'use strict';

  var PIPPIB_URL = 'https://simontana.kehutanan.go.id/arcgis/rest/services/PIPPIB/PIPPIB_Tahun_2023_Periode_I/MapServer/0';
  var layer = null;
  var visible = false;

  var JENIS = {
    'PIPPIB GAMBUT':   '#b6fce7',
    'PIPPIB KAWASAN':  '#fcb3f9',
    'PIPPIB PRIMER':   '#fcc6b8'
  };

  var DEFAULT_COLOR = '#cccccc';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function getColor(k) {
    return JENIS[String(k)] || DEFAULT_COLOR;
  }

  function fmtArea(v) {
    if (v == null || isNaN(v)) return '-';
    return Number(v).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' m²';
  }

  function buildPopup(p) {
    var color = getColor(p.pippib23_1);
    var html = '<div class="agol-popup" style="min-width:240px">';
    html += '<div class="agol-popup-header agol-geo-kawasan">';
    html += '<div class="agol-popup-badge"><span class="agol-popup-badge-dot" style="background:' + color + ';"></span>PIPPIB 2023</div>';
    html += '<div class="agol-popup-title">' + esc(p.pippib23_1 || '-') + '</div>';
    html += '</div>';
    html += '<div class="agol-popup-body"><div class="agol-popup-fields">';
    if (p.namaobj) html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Nama</span><span class="agol-popup-field-value">' + esc(p.namaobj) + '</span></div>';
    if (p.remark) html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Keterangan</span><span class="agol-popup-field-value">' + esc(p.remark) + '</span></div>';
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
      url: PIPPIB_URL,
      where: '1=1',
      outFields: ['namaobj', 'remark', 'pippib23_1', 'st_area(shape)'],
      style: function (feature) {
        var c = getColor(feature.properties.pippib23_1);
        return {
          color: '#6e6e6e',
          weight: 0.6,
          opacity: 0.9,
          fillColor: c,
          fillOpacity: 0.45
        };
      },
      onEachFeature: function (f, l) {
        l.bindPopup(buildPopup(f.properties), { maxWidth: 340, className: 'agol-leaflet-popup' });
      }
    });
    layer.addTo(map);
    visible = true;
    layer.on('error', function (e) { console.error('[PIPPIB 2023] Error:', e); });
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
    var cb = document.getElementById('togglePippibLayer');
    if (cb) cb.checked = false;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var cb = document.getElementById('togglePippibLayer');
    if (cb) {
      cb.addEventListener('change', function () { toggleLayer(this.checked); });
    }
  });

  window.pippibLayerCleanup = cleanup;
})();
