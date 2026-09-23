/* ── BIG Foto Udara (ImageServer) Overlay ── */
(function () {
  'use strict';

  var BASE = 'https://geoservices.big.go.id/raster/rest/services/';

  var FU_LAYERS = {
    toggleFuPadang: {
      url: BASE + 'FU/FU_Padang_0715_3216C/ImageServer',
      bounds: [[-0.937509, 100.333325], [-0.916658, 100.354175]],
      label: 'Foto Udara Padang 0715 (BIG)'
    },
    toggleFuKendari: {
      url: BASE + 'FUTILE/FU_SULAWESI_KENDARI_2024_TILE/ImageServer',
      bounds: [[-4.104620, 122.437050], [-3.895381, 122.646283]],
      label: 'Foto Udara Kendari 2024 (BIG)'
    },
    toggleFuBitung: {
      url: BASE + 'FUTILE/FU_SULAWESI_KOTA_BITUNG_2024_TILE/ImageServer',
      bounds: [[1.374548, 125.082884], [1.479619, 125.229617]],
      label: 'Foto Udara Bitung 2024 (BIG)'
    },
    toggleFuMakassar: {
      url: BASE + 'FUTILE/FU_SULAWESI_MAKASSAR_2024_TILE/ImageServer',
      bounds: [[-5.292119, 119.353716], [-4.978715, 119.604617]],
      label: 'Foto Udara Makassar 2024 (BIG)'
    },
    toggleFuPlanetScope: {
      url: BASE + 'BASEMAP_PLANET/PLANETSCOPE_DESEMBER/ImageServer',
      bounds: [[-3.688868, 94.921875], [5.965754, 101.953125]],
      label: 'Basemap PlanetScope Des 2025 (BIG)'
    }
  };

  var _layers = {};
  var _active = {};

  function getMap() {
    if (typeof window._map !== 'undefined' && window._map) return window._map;
    if (typeof window.map !== 'undefined' && window.map) return window.map;
    if (typeof map !== 'undefined') return map;
    return null;
  }

  function hasEsri() {
    return typeof L !== 'undefined' && L.esri && L.esri.imageMapLayer;
  }

  window.toggleFuLayer = function (id, visible) {
    var def = FU_LAYERS[id];
    if (!def) return;
    var m = getMap();
    if (!m) return;

    if (!visible) {
      if (_layers[id] && m.hasLayer(_layers[id])) m.removeLayer(_layers[id]);
      _active[id] = false;
      return;
    }

    if (!hasEsri()) {
      if (typeof window.showMapToast === 'function') {
        window.showMapToast('Pustaka esri-leaflet tidak tersedia.', 'error');
      }
      return;
    }

    if (!_layers[id]) {
      _layers[id] = L.esri.imageMapLayer({
        url: def.url,
        format: 'jpgpng',
        transparent: true,
        opacity: 1,
        attribution: '© BIG',
        pane: 'overlayPane'
      });
      _layers[id].on('error', function (e) {
        console.warn('[FU] exportImage error:', id, e && e.error);
      });
    }

    if (!m.hasLayer(_layers[id])) _layers[id].addTo(m);
    _active[id] = true;
    m.flyToBounds(L.latLngBounds(def.bounds).pad(0.35), {
      maxZoom: 17,
      duration: 1.2
    });
  };

  window.isFuLayerActive = function (id) {
    return !!_active[id];
  };

  window.toggleFuPadang = function (visible) {
    window.toggleFuLayer('toggleFuPadang', visible);
  };
  window.toggleFuKendari = function (visible) {
    window.toggleFuLayer('toggleFuKendari', visible);
  };
  window.toggleFuBitung = function (visible) {
    window.toggleFuLayer('toggleFuBitung', visible);
  };
  window.toggleFuMakassar = function (visible) {
    window.toggleFuLayer('toggleFuMakassar', visible);
  };
  window.toggleFuPlanetScope = function (visible) {
    window.toggleFuLayer('toggleFuPlanetScope', visible);
  };

  window.isFuPadangActive = function () {
    return window.isFuLayerActive('toggleFuPadang');
  };
  window.isFuKendariActive = function () {
    return window.isFuLayerActive('toggleFuKendari');
  };
  window.isFuBitungActive = function () {
    return window.isFuLayerActive('toggleFuBitung');
  };
  window.isFuMakassarActive = function () {
    return window.isFuLayerActive('toggleFuMakassar');
  };
  window.isFuPlanetScopeActive = function () {
    return window.isFuLayerActive('toggleFuPlanetScope');
  };
})();
