/* ── Kawasan Hutan (Kemenhut/SIMANTAN) — Feature Layer ── */
(function () {
  'use strict';

  var KH_URL = 'https://simontana.kehutanan.go.id/arcgis/rest/services/simontana/kh/MapServer/0';
  var layer = null;
  var visible = false;

  var FUNGSI = {
    '1':     ['Kawasan Konservasi', '#c500ff'],
    '1002':  ['Kawasan Konservasi', '#c500ff'],
    '10021': ['Kawasan Konservasi', '#c500ff'],
    '10022': ['Kawasan Konservasi', '#c500ff'],
    '10023': ['Kawasan Konservasi', '#c500ff'],
    '10024': ['Kawasan Konservasi', '#c500ff'],
    '10025': ['Kawasan Konservasi', '#c500ff'],
    '10026': ['Kawasan Konservasi', '#c500ff'],
    '100201':['Kawasan Konservasi', '#c500ff'],
    '100202':['Kawasan Konservasi Laut', '#ffffff'],
    '100211':['Kawasan Konservasi Laut', '#ffffff'],
    '100221':['Kawasan Konservasi Laut', '#ffffff'],
    '100241':['Kawasan Konservasi Laut', '#ffffff'],
    '100251':['Kawasan Konservasi Laut', '#ffffff'],
    '1001':  ['Hutan Lindung', '#38a800'],
    '1003':  ['Hutan Produksi Tetap', '#ffff00'],
    '1004':  ['Hutan Produksi Terbatas', '#aaff00'],
    '1005':  ['Hutan Produksi yang Dapat Dikonversi', '#ff73df'],
    '1007':  ['Areal Penggunaan Lain', '#e0e0e0']
  };

  var DEFAULT_COLOR = '#cccccc';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function getFung(k) {
    return FUNGSI[String(k)] || [String(k || '-'), DEFAULT_COLOR];
  }

  function fmtLuas(v) {
    if (v == null || isNaN(v)) return '-';
    return Number(v).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' ha';
  }

  function buildPopup(p) {
    var f = getFung(p.fungsikws);
    var html = '<div class="agol-popup" style="min-width:240px">';
    html += '<div class="agol-popup-header agol-geo-kawasan">';
    html += '<div class="agol-popup-badge"><span class="agol-popup-badge-dot" style="background:' + f[1] + ';"></span>Kawasan Hutan</div>';
    html += '<div class="agol-popup-title">' + esc(f[0]) + '</div>';
    html += '</div>';
    html += '<div class="agol-popup-body"><div class="agol-popup-fields">';
    if (p.namobj) html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Nama</span><span class="agol-popup-field-value">' + esc(p.namobj) + '</span></div>';
    if (p.wadmpr) html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Provinsi</span><span class="agol-popup-field-value">' + esc(p.wadmpr) + '</span></div>';
    if (p.wadmkk) html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Kabupaten</span><span class="agol-popup-field-value">' + esc(p.wadmkk) + '</span></div>';
    if (p.lskpnjk != null) html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Luas</span><span class="agol-popup-field-value">' + fmtLuas(p.lskpnjk) + '</span></div>';
    if (p.noskpnjk) html += '<div class="agol-popup-field"><span class="agol-popup-field-label">No. SK</span><span class="agol-popup-field-value">' + esc(p.noskpnjk) + '</span></div>';
    if (p.keterangan) html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Keterangan</span><span class="agol-popup-field-value">' + esc(p.keterangan) + '</span></div>';
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
      url: KH_URL,
      where: '1=1',
      outFields: ['namobj', 'wadmkk', 'wadmpr', 'fungsikws', 'noskpnjk', 'lskpnjk', 'keterangan'],
      style: function (feature) {
        var f = getFung(feature.properties.fungsikws);
        return {
          color: f[1],
          weight: 1,
          opacity: 0.9,
          fillColor: f[1],
          fillOpacity: 0.35
        };
      },
      onEachFeature: function (f, l) {
        l.bindPopup(buildPopup(f.properties), { maxWidth: 340, className: 'agol-leaflet-popup' });
      }
    });
    layer.addTo(map);
    visible = true;
    layer.on('error', function (e) { console.error('[Kawasan Hutan KLHK] Error:', e); });
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
    var cb = document.getElementById('toggleKhLayer');
    if (cb) cb.checked = false;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var cb = document.getElementById('toggleKhLayer');
    if (cb) {
      cb.addEventListener('change', function () { toggleLayer(this.checked); });
    }
  });

  window.khLayerCleanup = cleanup;
})();
