/* ── Province Boundary (PBF Vector Tiles) ── */
(function () {
  'use strict';

  var PBF_URL = 'https://tiles.circlegeo.com/data/administration/{z}/{x}/{y}.pbf';
  var _provinceLayer = null;
  var _active = false;

  function show() {
    if (!_provinceLayer) {
      if (!map.getPane('provincePane')) map.createPane('provincePane');
      map.getPane('provincePane').style.zIndex = '1000';
      _provinceLayer = L.vectorGrid.protobuf(PBF_URL, {
        vectorTileLayerStyles: {
          province: {
            color: '#ffffff',
            weight: 1.2,
            opacity: 0.85,
            fill: false
          }
        },
        minZoom: 0,
        maxZoom: 10,
        interactive: false,
        pane: 'provincePane'
      });
    }
    if (!map.hasLayer(_provinceLayer)) _provinceLayer.addTo(map);
    _active = true;
  }

  function hide() {
    if (_provinceLayer && map.hasLayer(_provinceLayer)) map.removeLayer(_provinceLayer);
    _active = false;
  }

  function isActive() {
    return _active;
  }

  function cleanup() {
    hide();
    _provinceLayer = null;
  }

  window.toggleProvinceBoundary = function (visible) {
    if (visible) show(); else hide();
  };
  window.isProvinceBoundaryActive = isActive;
  window.provinceBoundaryCleanup = cleanup;
})();
