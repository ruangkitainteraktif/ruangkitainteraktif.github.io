/* ── BIG Foto Udara (ImageServer) Overlay ── */
(function () {
  'use strict';

  var FU_URL = 'https://geoservices.big.go.id/raster/rest/services/FU/FU_Padang_0715_3216C/ImageServer';

  var _layer = null;
  var _active = false;

  function getMap() {
    if (typeof window._map !== 'undefined') return window._map;
    if (typeof map !== 'undefined') return map;
    return null;
  }

  window.toggleFuPadang = function (visible) {
    var m = getMap();
    if (!m) return;

    if (!visible) {
      if (_layer && m.hasLayer(_layer)) m.removeLayer(_layer);
      _active = false;
      return;
    }

    if (!_layer) {
      if (typeof L === 'undefined' || !L.esri || !L.esri.imageMapLayer) {
        if (typeof window.showMapToast === 'function') {
          window.showMapToast('Pustaka esri-leaflet tidak tersedia.', 'error');
        }
        return;
      }
      _layer = L.esri.imageMapLayer({
        url: FU_URL,
        format: 'jpgpng',
        transparent: true,
        opacity: 1,
        attribution: '© BIG',
        pane: 'overlayPane'
      });
    }

    if (!m.hasLayer(_layer)) _layer.addTo(m);
    _active = true;
  };

  window.isFuPadangActive = function () {
    return _active;
  };
})();
