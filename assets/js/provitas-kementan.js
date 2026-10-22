/* ── Provitas Pangan — SISCrop 2.0 (BBSDLP / Kementan) ──
 * Tile raster statis https://scs1.brmpkementan.id/map-tiles/provitas/{z}/{x}/{y}.png
 * Server memakai layout TMS (y dihitung dari selatan), hanya tersedia z11-z12;
 * y dibalik manual di getTileUrl supaya aman terhadap zoom native apa pun.
 */
(function () {
  'use strict';

  var BASE = 'https://scs1.brmpkementan.id/map-tiles/provitas';
  var LEGEND_URL = BASE + '/legend.provitas.png';
  var ID = 'brmp-provitas';
  var layer = null;
  var visible = false;
  var legendEl = null;

  function getMap() {
    return (typeof map !== 'undefined' && map) ? map : null;
  }

  function createLegend() {
    if (typeof addUnifiedLegend !== 'function' || typeof createLegendWithToggle !== 'function') return;
    var div = L.DomUtil.create('div', 'provitas-kementan-legend');
    L.DomEvent.disableClickPropagation(div);
    div.innerHTML = '<div class="hotspot-legend-title">Provitas Pangan (Standing Crop)</div>' +
      '<div class="provitas-kementan-legend-items">' +
      '<img src="' + LEGEND_URL + '" fetchpriority="high" alt="Legenda provitas" style="width:100%;max-width:300px;display:block;border-radius:6px;" />' +
      '</div>' +
      '<div class="hotspot-legend-source">Sumber: BBSDLP (SISCrop 2.0) — provitas ton/ha</div>';
    legendEl = addUnifiedLegend(ID, createLegendWithToggle(div));
  }

  function removeLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend(ID);
    legendEl = null;
  }

  function makeTileLayer() {
    var ProvitasKementanTileLayer = L.TileLayer.extend({
      getTileUrl: function (coords) {
        var z = this._getZoomForUrl();
        var y = Math.pow(2, z) - 1 - coords.y;
        return BASE + '/' + z + '/' + coords.x + '/' + y + '.png';
      }
    });
    return new ProvitasKementanTileLayer('', {
      tileSize: 256,
      minZoom: 11,
      maxZoom: 18,
      maxNativeZoom: 12,
      opacity: 0.9,
      bounds: L.latLngBounds([-11.2, 94.8], [6.2, 141.3]),
      attribution: 'BBSDLP — Kementerian Pertanian (SISCrop 2.0)'
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

  window.toggleProvitasKementanLayer = function (arg, show) {
    if (typeof arg === 'boolean') show = arg;
    if (show === undefined) show = !visible;
    if (show) showLayer(); else hideLayer();
  };
  window.isProvitasKementanActive = function () { return visible; };
  window.provitasKementanCleanup = function () {
    hideLayer();
    layer = null;
  };
})();
