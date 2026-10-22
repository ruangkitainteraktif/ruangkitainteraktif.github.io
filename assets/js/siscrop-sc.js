/* ── Fase Pertanaman Padi (Standing Crop) — SISCrop 2.0 (BSIP SDLP / Kementan) ──
 * Tema "Standing Crop" dari peta SISCrop: 34 tumpukan tile raster statis,
 * masing-masing satu kombinasi fase-per-periode di folder numeric
 * (https://scs1.brmpkementan.id/map-tiles/{kode}/{z}/{x}/{y}.png).
 * Layout TMS (y dari selatan), data sparse per fase (banyak tile 404/blank).
 * Legenda 6 fase: map-tiles/legend.sc.png.
 */
(function () {
  'use strict';

  var BASE = 'https://scs1.brmpkementan.id/map-tiles';
  var LEGEND_URL = BASE + '/legend.sc.png';
  var ID = 'brmp-sc';
  var FASE_CODES = [
    '11', '12', '13', '14', '15', '16', '17', '18', '19',
    '21',
    '31', '32', '33', '34', '35', '36',
    '51', '52', '53',
    '61', '62', '63', '64', '65',
    '71', '72', '73', '74', '75', '76',
    '81', '82',
    '91', '94'
  ];
  var layers = null; /* array L.TileLayer */
  var visible = false;
  var legendEl = null;

  function getMap() {
    return (typeof map !== 'undefined' && map) ? map : null;
  }

  function makeTileLayer(code) {
    var SiscropScTileLayer = L.TileLayer.extend({
      getTileUrl: function (coords) {
        var z = this._getZoomForUrl();
        var y = Math.pow(2, z) - 1 - coords.y;
        return BASE + '/' + code + '/' + z + '/' + coords.x + '/' + y + '.png';
      }
    });
    return new SiscropScTileLayer('', {
      tileSize: 256,
      minZoom: 11,
      maxZoom: 18,
      maxNativeZoom: 12,
      opacity: 0.9,
      bounds: L.latLngBounds([-11.2, 94.8], [6.2, 141.3]),
      attribution: 'BSIP SDLP — Kementerian Pertanian (SISCrop 2.0)'
    });
  }

  function createLegend() {
    if (typeof addUnifiedLegend !== 'function' || typeof createLegendWithToggle !== 'function') return;
    var div = L.DomUtil.create('div', 'siscrop-sc-legend');
    L.DomEvent.disableClickPropagation(div);
    div.innerHTML = '<div class="hotspot-legend-title">Fase Pertanaman Padi (Standing Crop)</div>' +
      '<div class="siscrop-sc-legend-items">' +
      '<img src="' + LEGEND_URL + '" fetchpriority="high" alt="Legenda fase pertanaman" style="width:100%;max-width:300px;display:block;border-radius:6px;" />' +
      '</div>' +
      '<div class="hotspot-legend-source">Sumber: BSIP SDLP (SISCrop 2.0) — 6 fase: pengairan, vegetatif 1-2, generatif 1-2, bera</div>';
    legendEl = addUnifiedLegend(ID, createLegendWithToggle(div));
  }

  function removeLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend(ID);
    legendEl = null;
  }

  function showLayer() {
    var map = getMap();
    if (!map) return;
    if (visible) {
      layers.forEach(function (l) { if (!map.hasLayer(l)) l.addTo(map); });
      createLegend();
      return;
    }
    layers = FASE_CODES.map(makeTileLayer);
    layers.forEach(function (l) { l.addTo(map); });
    visible = true;
    createLegend();
  }

  function hideLayer() {
    var map = getMap();
    if (layers && map) layers.forEach(function (l) { if (map.hasLayer(l)) map.removeLayer(l); });
    visible = false;
    removeLegend();
  }

  window.toggleSiscropScLayer = function (arg, show) {
    if (typeof arg === 'boolean') show = arg;
    if (show === undefined) show = !visible;
    if (show) showLayer(); else hideLayer();
  };
  window.isSiscropScActive = function () { return visible; };
  window.siscropScCleanup = function () {
    hideLayer();
    layers = null;
  };
})();
