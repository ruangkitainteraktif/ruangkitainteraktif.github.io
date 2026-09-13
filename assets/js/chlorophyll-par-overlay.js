/* ── Chlorophyll-a & PAR Overlay Layers (NASA GIBS OCI PACE) ── */
(function () {
  'use strict';

  var _chlorophyllLayer = null;
  var _parLayer = null;

  function makeChlorophyll() {
    var url = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/OCI_PACE_Chlorophyll_a/default/{Time}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png';
    var d = new Date(); d.setDate(d.getDate() - 2);
    var dateStr = d.toISOString().slice(0, 10);
    return L.tileLayer(url.replace('{Time}', dateStr), {
      maxZoom: 7, minZoom: 0, opacity: 0.6,
      attribution: 'NASA GIBS OCI PACE'
    });
  }

  function makePar() {
    var url = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/OCI_PACE_Photosynthetically_Available_Radiation/default/{Time}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png';
    var d = new Date(); d.setDate(d.getDate() - 2);
    var dateStr = d.toISOString().slice(0, 10);
    return L.tileLayer(url.replace('{Time}', dateStr), {
      maxZoom: 7, minZoom: 0, opacity: 0.75,
      attribution: 'NASA GIBS OCI PACE'
    });
  }

  function showChlorophyll() {
    if (!_chlorophyllLayer) _chlorophyllLayer = makeChlorophyll();
    if (!map.hasLayer(_chlorophyllLayer)) _chlorophyllLayer.addTo(map);
    if (typeof window.chlorophyllShowSlider === 'function') window.chlorophyllShowSlider();
  }

  function hideChlorophyll() {
    if (_chlorophyllLayer && map.hasLayer(_chlorophyllLayer)) map.removeLayer(_chlorophyllLayer);
    if (typeof window.chlorophyllHideSlider === 'function') window.chlorophyllHideSlider();
  }

  function showPar() {
    if (!_parLayer) _parLayer = makePar();
    if (!map.hasLayer(_parLayer)) _parLayer.addTo(map);
    if (typeof window.parShowSlider === 'function') window.parShowSlider();
  }

  function hidePar() {
    if (_parLayer && map.hasLayer(_parLayer)) map.removeLayer(_parLayer);
    if (typeof window.parHideSlider === 'function') window.parHideSlider();
  }

  function cleanupChlorophyll() {
    hideChlorophyll();
    _chlorophyllLayer = null;
  }

  function cleanupPar() {
    hidePar();
    _parLayer = null;
  }

  window.toggleChlorophyllOverlay = function (visible) {
    if (visible) showChlorophyll(); else hideChlorophyll();
  };
  window.toggleParOverlay = function (visible) {
    if (visible) showPar(); else hidePar();
  };
  window.updateChlorophyllDate = function (dateStr) {
    if (_chlorophyllLayer) {
      var url = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/OCI_PACE_Chlorophyll_a/default/' + dateStr + '/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png';
      _chlorophyllLayer.setUrl(url);
    }
  };
  window.updateParDate = function (dateStr) {
    if (_parLayer) {
      var url = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/OCI_PACE_Photosynthetically_Available_Radiation/default/' + dateStr + '/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png';
      _parLayer.setUrl(url);
    }
  };
  window.chlorophyllOverlayCleanup = cleanupChlorophyll;
  window.parOverlayCleanup = cleanupPar;
})();
