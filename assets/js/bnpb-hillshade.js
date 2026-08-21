/* ── BNPB Hillshade & TOPOGRAFI PTH — separate overlays with provinsi boundary ── */
(function () {
  'use strict';

  var TOPOGRAFI_URL = 'https://gis.bnpb.go.id/server/rest/services/Basemap/TOPOGRAFI/MapServer';
  var TOPOGRAFI_PTH_URL = 'https://gis.bnpb.go.id/server/rest/services/Basemap/TOPOGRAFI_PTH/MapServer';
  var PROV_GEOJSON_URL = 'assets/data/bps/geojson/provinsi.geojson';

  var hillshadeLayer = null;
  var hillshadeProvLayer = null;
  var pthLayer = null;
  var pthProvLayer = null;
  var cachedGeojson = null;

  function fetchGeojson(cb) {
    if (cachedGeojson) { cb(cachedGeojson); return; }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', PROV_GEOJSON_URL, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          cachedGeojson = JSON.parse(xhr.responseText);
          cb(cachedGeojson);
        } catch (e) { console.error('[BNPB] Gagal parse provinsi GeoJSON:', e); }
      }
    };
    xhr.send();
  }

  function addProvinsi(target) {
    fetchGeojson(function (geojson) {
      var layer = L.geoJSON(geojson, {
        style: { color: '#ffffff', weight: 1, opacity: 0.7, fillColor: '#ffffff', fillOpacity: 0 },
        interactive: false
      }).addTo(map);
      if (target === 'hillshade') hillshadeProvLayer = layer;
      else pthProvLayer = layer;
    });
  }

  /* ── Hillshade overlay ── */
  function showHillshade() {
    if (!hillshadeLayer) {
      hillshadeLayer = L.esri.dynamicMapLayer({
        url: TOPOGRAFI_URL,
        layers: [1],
        opacity: 0.6
      });
    }
    if (!map.hasLayer(hillshadeLayer)) hillshadeLayer.addTo(map);
    if (!hillshadeProvLayer) addProvinsi('hillshade');
    else if (!map.hasLayer(hillshadeProvLayer)) hillshadeProvLayer.addTo(map);
  }

  function hideHillshade() {
    if (hillshadeLayer && map.hasLayer(hillshadeLayer)) map.removeLayer(hillshadeLayer);
    if (hillshadeProvLayer && map.hasLayer(hillshadeProvLayer)) map.removeLayer(hillshadeProvLayer);
  }

  function cleanupHillshade() {
    hideHillshade();
    hillshadeLayer = null;
    hillshadeProvLayer = null;
  }

  /* ── TOPOGRAFI PTH overlay ── */
  function showPth() {
    if (!pthLayer) {
      pthLayer = L.esri.dynamicMapLayer({
        url: TOPOGRAFI_PTH_URL,
        layers: [0],
        opacity: 0.7
      });
    }
    if (!map.hasLayer(pthLayer)) pthLayer.addTo(map);
    if (!pthProvLayer) addProvinsi('pth');
    else if (!map.hasLayer(pthProvLayer)) pthProvLayer.addTo(map);
  }

  function hidePth() {
    if (pthLayer && map.hasLayer(pthLayer)) map.removeLayer(pthLayer);
    if (pthProvLayer && map.hasLayer(pthProvLayer)) map.removeLayer(pthProvLayer);
  }

  function cleanupPth() {
    hidePth();
    pthLayer = null;
    pthProvLayer = null;
  }

  /* ── Combined cleanup (for reset) ── */
  function cleanupAll() {
    cleanupHillshade();
    cleanupPth();
  }

  window.bnpbHillshade = {
    show: showHillshade, hide: hideHillshade, cleanup: cleanupHillshade,
    showPth: showPth, hidePth: hidePth, cleanupPth: cleanupPth,
    cleanupAll: cleanupAll
  };
})();
