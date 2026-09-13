/* ── Peta Geologi (BNPB) — Dynamic Overlay ── */
(function () {
  'use strict';

  var GEOLOGI_URL = 'https://gis.bnpb.go.id/server/rest/services/thematic/PETA_GEOLOGI/MapServer';
  var _geologiLayer = null;
  var _geologiActive = false;

  function showGeologi() {
    if (!_geologiLayer) {
      _geologiLayer = L.esri.dynamicMapLayer({
        url: GEOLOGI_URL,
        layers: [1],
        opacity: 0.6
      });
    }
    if (!map.hasLayer(_geologiLayer)) _geologiLayer.addTo(map);
    _geologiActive = true;
  }

  function hideGeologi() {
    if (_geologiLayer && map.hasLayer(_geologiLayer)) map.removeLayer(_geologiLayer);
    _geologiActive = false;
  }

  function isGeologiActive() {
    return _geologiActive;
  }

  function cleanupGeologi() {
    hideGeologi();
    _geologiLayer = null;
  }

  window.toggleGeologiBNPB = function (visible) {
    if (visible) showGeologi(); else hideGeologi();
  };
  window.isGeologiBNPBActive = isGeologiActive;
  window.geologiBNPBCleanup = cleanupGeologi;
})();
