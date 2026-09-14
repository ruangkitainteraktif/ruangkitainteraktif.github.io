/* ═══════════════════════════════════════════════════════════════════
   Fasilitas Umum — Sekolah Indonesia (BNPB)
   Toggle marker per kabupaten (default: Surabaya)
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SEKOLAH_URL = 'https://gis.bnpb.go.id/server/rest/services/Basemap/Sekolah/MapServer/0';

  var SCHOOL_COLORS = {
    'SD Negeri': '#2563eb', 'SD Swasta': '#60a5fa',
    'SMP Negeri': '#16a34a', 'SMP Swasta': '#4ade80',
    'SMU Negeri': '#dc2626', 'SMU Swasta': '#f87171',
    'SMK Negeri': '#7c3aed', 'SMK Swasta': '#a78bfa',
    'MI Negeri': '#0891b2', 'MI Swasta': '#22d3ee',
    'MTs Negeri': '#ca8a04', 'MTs Swasta': '#facc15',
    'MA Negeri': '#be185d', 'MA Swasta': '#f472b6'
  };

  var _layer = null;

  function $(id) { return document.getElementById(id); }

  function escHtml(s) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(s || '')));
    return d.innerHTML;
  }

  window.toggleSekolahLayer = function (visible) {
    if (!visible) {
      if (_layer && map.hasLayer(_layer)) map.removeLayer(_layer);
      _layer = null;
      return;
    }

    _layer = L.esri.featureLayer({
      url: SEKOLAH_URL,
      where: '1=1',
      outFields: ['nama', 'infrastruk', 'kabkot', 'provinsi', 'kecamatan', 'desa'],
      pointToLayer: function (feat, latlng) {
        var tipe = feat.properties ? feat.properties.infrastruk : '';
        var color = SCHOOL_COLORS[tipe] || '#6b7280';
        return L.circleMarker(latlng, {
          radius: 4, fillColor: color, color: '#fff',
          weight: 1, fillOpacity: 0.8
        });
      },
      onEachFeature: function (feat, layer) {
        if (feat.properties) {
          var p = feat.properties;
          layer.bindPopup(
            '<div style="font-family:system-ui;font-size:12px;line-height:1.5">' +
            '<b>' + escHtml(p.nama || '-') + '</b><br>' +
            'Jenis: ' + escHtml(p.infrastruk || '-') + '<br>' +
            'Kab/Kota: ' + escHtml(p.kabkot || '-') + '<br>' +
            'Kecamatan: ' + escHtml(p.kecamatan || '-') + '<br>' +
            'Desa: ' + escHtml(p.desa || '-') +
            '</div>',
            { maxWidth: 280 }
          );
        }
      }
    }).addTo(map);
  };

})();
