/* ── LSD Lahan Sawah Dilindungi TMS Layer ── */
(function () {
  'use strict';

  var TILE_URL = 'https://pptr.dasmap.com/layers/tms/public/269_lhnswhdlng/{z}/{x}/{y}/?tileSize=1024';
  var layer = null;

  function showLayer() {
    if (layer) { map.removeLayer(layer); layer = null; }
    layer = L.tileLayer(TILE_URL, {
      tileSize: 1024,
      opacity: 0.7,
      maxZoom: 18,
      minZoom: 0,
      attribution: 'LSD Lahan Sawah Dilindungi'
    }).addTo(map);
    map.flyTo([-7.68, 110.84], 12, { duration: 1.5 });
  }

  function hideLayer() {
    if (layer) { map.removeLayer(layer); layer = null; }
  }

  function isActive() { return !!layer && map.hasLayer(layer); }

  window.isLsdTmsActive = isActive;
  window.toggleLsdTmsLayer = function (visible) {
    if (visible) showLayer();
    else hideLayer();
  };
})();
