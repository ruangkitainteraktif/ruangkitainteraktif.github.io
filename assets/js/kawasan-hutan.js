/* ── Kawasan Hutan — ESDM Geoportal Feature Layer ── */
(function () {
  'use strict';

  var KAWASAN_HUTAN_URL = 'https://geoportal.esdm.go.id/gis1/rest/services/Kawasan_Hutan/MapServer/0';
  var layer = null;
  var legendControl = null;
  var visible = false;

  var FUNGSI_COLOR = {
    'Kawasan Konservasi':              '#c500ff',
    'Kawasan Konservasi Laut':         '#ffffff',
    'Hutan Lindung':                   '#38a800',
    'Hutan Produksi Tetap':            '#ffff00',
    'Hutan Produksi Terbatas':         '#aaff00',
    'Hutan Produksi Yang Dapat Dikonversi': '#ff73df',
    'Areal Penggunaan Lain':           '#e0e0e0',
    'Tubuh Air':                       '#00c5ff',
    'Tidak Terdefinisi':               '#ff5500'
  };

  var DEFAULT_COLOR = '#cccccc';

  function esc(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function getColor(deskripsi) {
    return FUNGSI_COLOR[deskripsi] || DEFAULT_COLOR;
  }

  function formatLuas(val) {
    if (val == null || isNaN(val)) return '-';
    return Number(val).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' ha';
  }

  function buildPopup(p) {
    var color = getColor(p.deskripsi);
    var html = '<div class="agol-popup" style="min-width:240px">';
    html += '<div class="agol-popup-header agol-geo-kawasan">';
    html += '<div class="agol-popup-badge"><span class="agol-popup-badge-dot" style="background:' + color + ';"></span>Kawasan Hutan</div>';
    html += '<div class="agol-popup-title">' + esc(p.deskripsi || '-') + '</div>';
    html += '</div>';
    html += '<div class="agol-popup-body"><div class="agol-popup-fields">';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Luas</span><span class="agol-popup-field-value">' + formatLuas(p.lskkws) + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">No. SK</span><span class="agol-popup-field-value">' + esc(p.noskkws || '-') + '</span></div>';
    if (p.remark && p.remark !== '-') {
      html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Keterangan</span><span class="agol-popup-field-value">' + esc(p.remark) + '</span></div>';
    }
    html += '</div></div>';
    html += '<div class="agol-popup-footer"><span>Sumber: Geoportal ESDM</span></div>';
    html += '</div>';
    return html;
  }

  function createLegend() {
    removeLegend();
    var LegendControl = L.Control.extend({
      options: { position: 'bottomleft' },
      onAdd: function () {
        var div = L.DomUtil.create('div', 'hotspot-legend');
        L.DomEvent.disableClickPropagation(div);

        var items = '';
        var entries = [
          ['Kawasan Konservasi', '#c500ff'],
          ['Hutan Lindung', '#38a800'],
          ['Hutan Produksi Tetap', '#ffff00'],
          ['Hutan Produksi Terbatas', '#aaff00'],
          ['HPT Dapat Dikonversi', '#ff73df'],
          ['Tubuh Air', '#00c5ff'],
          ['Areal Penggunaan Lain', '#e0e0e0']
        ];
        for (var i = 0; i < entries.length; i++) {
          items += '<div class="hotspot-legend-item">' +
            '<span class="hotspot-legend-dot" style="background:' + entries[i][1] + ';"></span>' +
            '<span>' + entries[i][0] + '</span>' +
          '</div>';
        }

        div.innerHTML =
          '<div class="hotspot-legend-title">Kawasan Hutan</div>' +
          '<div class="hotspot-legend-items">' + items + '</div>' +
          '<div class="hotspot-legend-source">Sumber: Geoportal ESDM</div>';

        return div;
      }
    });
    legendControl = new LegendControl();
    legendControl.addTo(map);
  }

  function removeLegend() {
    if (legendControl) {
      map.removeControl(legendControl);
      legendControl = null;
    }
  }

  function showLayer() {
    if (layer) {
      if (!map.hasLayer(layer)) layer.addTo(map);
      visible = true;
      return;
    }
    layer = L.esri.featureLayer({
      url: KAWASAN_HUTAN_URL,
      where: '1=1',
      outFields: ['namobj', 'deskripsi', 'noskkws', 'lskkws'],
      style: function (f) {
        var deskripsi = f.properties.deskripsi || '';
        return {
          color: getColor(deskripsi),
          weight: 1,
          opacity: 0.8,
          fillColor: getColor(deskripsi),
          fillOpacity: 0.25
        };
      },
      onEachFeature: function (f, l) {
        l.bindPopup(buildPopup(f.properties), { maxWidth: 340, className: 'agol-leaflet-popup' });
      }
    });
    layer.addTo(map);
    visible = true;
    layer.on('error', function (e) { console.error('[Kawasan Hutan] Error:', e); });
    createLegend();
  }

  function hideLayer() {
    if (layer && map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
    visible = false;
    removeLegend();
  }

  function toggleLayer(v) {
    if (v) showLayer();
    else hideLayer();
  }

  function cleanup() {
    hideLayer();
    var cb = document.getElementById('toggleKawasanHutanLayer');
    if (cb) cb.checked = false;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var cb = document.getElementById('toggleKawasanHutanLayer');
    if (cb) {
      cb.addEventListener('change', function () { toggleLayer(this.checked); });
    }
  });

  window.isKawasanHutanActive = function () { return visible; };
  window.kawasanHutanCleanup = cleanup;
})();
