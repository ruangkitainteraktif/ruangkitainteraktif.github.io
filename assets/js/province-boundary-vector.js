/* ── Province Boundary (PBF Vector Tiles) ── */
(function () {
  'use strict';

  var PBF_URL = 'https://tiles.circlegeo.com/data/administration/{z}/{x}/{y}.pbf';
  var _provinceLayer = null;
  var _active = false;
  var AUTO_BOUNDARY_BASEMAPS = {
    'modis-terra': true, 'modis-aqua': true,
    'viirs-noaa20': true, 'viirs-noaa21': true, 'viirs-snpp': true,
    'oci-pace': true,
    'bmkg-himawari': true, 'bmkg-himawari-nc': true, 'bmkg-himawari-wv': true,
    'bmkg-himawari-rp': true, 'bmkg-himawari-sw': true, 'bmkg-himawari-sm': true,
    'bmkg-himawari-va': true, 'bmkg-himawari-vs': true, 'bmkg-himawari-fd': true,
    'bmkg-himawari-hires': true, 'bmkg-gk2a': true, 'bmkg-gk2a-wv': true,
    'bmkg-gk2a-rp': true,
    'noaa-true-color': true, 'noaa-goes-ir': true,
    'sentinel2': true, 'eox-s2cloudless-2024': true, 'eox-blackmarble': true
  };

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

  function syncWithBasemap(name) {
    var shouldShow = !!AUTO_BOUNDARY_BASEMAPS[name] &&
      typeof window.currentBasemapName !== 'undefined' &&
      window.currentBasemapName === name;

    if (shouldShow) show(); else hide();

    var button = document.getElementById('qlProvinsi');
    if (button) button.classList.toggle('active', shouldShow);
  }

  if (window.map && typeof window.map.on === 'function') {
    window.map.on('basemapchanged', function (event) {
      syncWithBasemap(event && event.basemap);
    });
    syncWithBasemap(window.currentBasemapName);
  }
})();
