/* ── EOX Overlay Labels ── */
(function () {
  'use strict';

  var _overlayLayer = null;
  var _active = false;

  var OVERLAY_URL = 'https://tiles.maps.eox.at/wmts/1.0.0/overlay_3857/default/g/{z}/{y}/{x}.png';

  function getMap() {
    if (typeof window._map !== 'undefined') return window._map;
    if (typeof map !== 'undefined') return map;
    return null;
  }

  window.toggleEoxOverlay = function (visible) {
    var m = getMap();
    if (!m) return;

    if (!visible) {
      if (_overlayLayer && m.hasLayer(_overlayLayer)) {
        m.removeLayer(_overlayLayer);
      }
      _active = false;
      return;
    }

    if (!_overlayLayer) {
      _overlayLayer = L.tileLayer(OVERLAY_URL, {
        maxZoom: 18,
        minZoom: 0,
        attribution: 'EOX Overlay',
        pane: 'overlayPane'
      });
    }

    _overlayLayer.addTo(m);
    _active = true;
  };

  window.isEoxOverlayActive = function () {
    return _active;
  };
})();
