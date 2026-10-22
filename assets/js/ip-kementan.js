/* ── Indeks Pertanaman — SISCrop 2.0 (BSIP SDLP / Kementan) ──
 * Tile raster statis https://scs1.brmpkementan.id/map-tiles/ip/{z}/{x}/{y}.png
 * Layout TMS (y dari selatan), hanya z11-z12; y dibalik manual di getTileUrl.
 */
(function () {
  'use strict';

  var BASE = 'https://scs1.brmpkementan.id/map-tiles/ip';
  var LEGEND_URL = BASE + '/legend.ip.png';
  var ID = 'brmp-ip';
  var layer = null;
  var visible = false;
  var legendEl = null;

  function getMap() {
    return (typeof map !== 'undefined' && map) ? map : null;
  }

  function createLegend() {
    if (typeof addUnifiedLegend !== 'function' || typeof createLegendWithToggle !== 'function') return;
    var div = L.DomUtil.create('div', 'ip-kementan-legend');
    L.DomEvent.disableClickPropagation(div);
    div.innerHTML = '<div class="hotspot-legend-title">Indeks Pertanaman (Standing Crop)</div>' +
      '<div class="ip-kementan-legend-items">' +
      '<img src="' + LEGEND_URL + '" fetchpriority="high" alt="Legenda indeks pertanaman" style="width:100%;max-width:300px;display:block;border-radius:6px;" />' +
      '</div>' +
      '<div class="hotspot-legend-source">Sumber: BSIP SDLP (SISCrop 2.0) — indeks pertanaman (IP)</div>';
    legendEl = addUnifiedLegend(ID, createLegendWithToggle(div));
  }

  function removeLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend(ID);
    legendEl = null;
  }

  function makeTileLayer() {
    var IpKementanTileLayer = L.TileLayer.extend({
      getTileUrl: function (coords) {
        var z = this._getZoomForUrl();
        var y = Math.pow(2, z) - 1 - coords.y;
        return BASE + '/' + z + '/' + coords.x + '/' + y + '.png';
      }
    });
    return new IpKementanTileLayer('', {
      tileSize: 256,
      minZoom: 11,
      maxZoom: 18,
      maxNativeZoom: 12,
      opacity: 0.9,
      bounds: L.latLngBounds([-11.2, 94.8], [6.2, 141.3]),
      attribution: 'BSIP SDLP — Kementerian Pertanian (SISCrop 2.0)'
    });
  }

  function showLayer() {
    var map = getMap();
    if (!map) return;
    if (layer && !map.hasLayer(layer)) { layer.addTo(map); visible = true; createLegend(); return; }
    layer = makeTileLayer();
    layer.addTo(map);
    visible = true;
    createLegend();
  }

  function hideLayer() {
    var map = getMap();
    if (layer && map && map.hasLayer(layer)) map.removeLayer(layer);
    visible = false;
    removeLegend();
  }

  window.toggleIpKementanLayer = function (arg, show) {
    if (typeof arg === 'boolean') show = arg;
    if (show === undefined) show = !visible;
    if (show) showLayer(); else hideLayer();
  };
  window.isIpKementanActive = function () { return visible; };
  window.ipKementanCleanup = function () {
    hideLayer();
    layer = null;
  };
})();
