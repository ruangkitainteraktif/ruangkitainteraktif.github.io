/* ── Kawasan Hutan 250K (Juni 2026) — Geoportal Planologi Kehutanan ──
 * ArcGIS MapServer murni "Map" capability: tanpa tile cache, tanpa
 * identify, tanpa query. Overlay dibentuk lewat /export per tile
 * (bbox EPSG:3857 256x256, PNG32 transparan) — pola dynamic mapservice.
 * Legenda diambil dari /legend (JSON) lewat proxy CORS.
 */
(function () {
  'use strict';

  var BASE = 'https://geoportal.planologi.kehutanan.go.id/server/rest/services/Peta_Interaktif_2026/KWSHUTAN_AR_250K/MapServer';
  var ID = 'kwshutan-planologi';
  var layer = null;
  var visible = false;
  var legendData = null;
  var legendPromise = null;

  function getMap() {
    return (typeof map !== 'undefined' && map) ? map : null;
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function makeTileLayer() {
    var Merc = L.Projection.SphericalMercator;
    var KwsPlanologiTileLayer = L.TileLayer.extend({
      getTileUrl: function (coords) {
        var b = this._tileCoordsToBounds(coords);
        var nw = Merc.project(b.getNorthWest());
        var se = Merc.project(b.getSouthEast());
        var bb = [nw.x, se.y, se.x, nw.y].map(function (v) { return v.toFixed(2); }).join(',');
        return BASE + '/export?bbox=' + encodeURIComponent(bb) +
          '&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image';
      }
    });
    return new KwsPlanologiTileLayer('', {
      tileSize: 256,
      minZoom: 4,
      maxZoom: 18,
      opacity: 0.9,
      bounds: L.latLngBounds([-11.2, 94.8], [6.2, 141.3]),
      attribution: 'Kementerian Kehutanan (Planologi)'
    });
  }

  function fetchLegend() {
    if (legendData) return Promise.resolve(legendData);
    if (!legendPromise) {
      legendPromise = fetch(BASE + '/legend?f=pjson', { credentials: 'include' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (data) { legendData = data; return data; })
        .catch(function (err) { console.warn('[KH 250K Planologi] Legenda gagal:', err.message); return null; });
    }
    return legendPromise;
  }

  function createLegend() {
    if (typeof addUnifiedLegend !== 'function' || typeof createLegendWithToggle !== 'function') return;
    var div = L.DomUtil.create('div', 'kwshutan-planologi-legend');
    L.DomEvent.disableClickPropagation(div);
    div.innerHTML = '<div class="hotspot-legend-title">Kawasan Hutan 250K (Juni 2026)</div>' +
      '<div class="hotspot-legend-items" id="kwshutanPlanologiLegendItems">' +
      '<div class="hotspot-legend-item"><span>Memuat legenda…</span></div></div>' +
      '<div class="hotspot-legend-source">Sumber: Ditjen Planologi Kehutanan</div>';
    addUnifiedLegend(ID, createLegendWithToggle(div));
    fetchLegend().then(function (data) {
      var items = document.getElementById('kwshutanPlanologiLegendItems');
      if (!items) return;
      var unit = (data && data.layers && data.layers[0] && data.layers[0].legend) || [];
      if (!unit.length) { items.innerHTML = '<div class="hotspot-legend-item"><span>Legenda tidak tersedia.</span></div>'; return; }
      items.innerHTML = unit.map(function (u) {
        return '<div class="hotspot-legend-item">' +
          '<span class="hotspot-legend-dot"><img src="data:image/png;base64,' + u.imageData + '" alt="" style="width:16px;height:16px;display:block;"></span>' +
          '<span>' + esc(u.label) + '</span></div>';
      }).join('');
    });
  }

  function removeLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend(ID);
  }

  function showLayer() {
    var map = getMap();
    if (!map) return;
    if (layer && !map.hasLayer(layer)) { layer.addTo(map); visible = true; createLegend(); return; }
    layer = makeTileLayer();
    layer.on('tileerror', function () { console.warn('[KH 250K Planologi] Tile gagal dimuat (export).'); });
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

  window.toggleKwshutanPlanologiLayer = function (arg, show) {
    if (typeof arg === 'boolean') show = arg;
    if (show === undefined) show = !visible;
    if (show) showLayer(); else hideLayer();
  };
  window.isKwshutanPlanologiActive = function () { return visible; };
  window.kwshutanPlanologiCleanup = function () {
    hideLayer();
    layer = null;
  };
})();
