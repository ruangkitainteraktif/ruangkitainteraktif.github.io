/* ── Shared Satellite Boundary Layer — Natural Earth Coastline ── */
var satelliteBoundary = (function () {
  'use strict';

  var GEOJSON_URL = 'assets/data/natural-earth/ne_50m_coastline.geojson';
  var _layer = null;

  function show(map) {
    if (_layer && map.hasLayer(_layer)) return;
    if (_layer) { _layer.addTo(map); return; }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', GEOJSON_URL, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var geojson = JSON.parse(xhr.responseText);
          _layer = L.geoJSON(geojson, {
            style: { color: '#ffffff', weight: 1, opacity: 0.7 },
            interactive: false
          }).addTo(map);
        } catch (e) {}
      }
    };
    xhr.send();
  }

  function hide(map) {
    if (_layer && map.hasLayer(_layer)) {
      map.removeLayer(_layer);
    }
  }

  return { show: show, hide: hide };
})();
