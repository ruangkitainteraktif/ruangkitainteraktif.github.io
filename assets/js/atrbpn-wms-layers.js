/* ── ATRBPN WMS Tile Layers (mapservice.atrbpn.go.id) ── */
(function () {
  'use strict';

  var WMS_URL = 'https://mapservice.atrbpn.go.id/geoserver/wms';

  var LAYERS = {
    'atrbpn-wms-lsd-umum': { layer: 'umum:LSD', label: 'Lahan Sawah Dilindungi', center: null },
    'atrbpn-wms-lahanbakusawah-new-sawah': { layer: 'sawah:lahanbakusawah_new', label: 'Lahan Baku Sawah 2024', center: null },
    'atrbpn-wms-lsd-12-provinsi-sawah': { layer: 'sawah:lsd_12_provinsi', label: 'LSD 12 Provinsi', center: null },
    'atrbpn-wms-lsd-8-provinsi-sawah': { layer: 'sawah:lsd_8_provinsi', label: 'LSD 8 Provinsi', center: null }
  };

  var active = {};
  var legendActive = {};

  function flyToConfig() {
    map.flyTo([-6.1754, 106.8272], 11, { duration: 1.2 });
  }

  function show(id) {
    var c = LAYERS[id];
    if (!c) return;
    if (active[id]) { map.removeLayer(active[id]); }
    active[id] = L.tileLayer.wms(WMS_URL, {
      layers: c.layer,
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      tiled: true,
      opacity: 0.7,
      maxZoom: 18,
      attribution: c.label + " (ATR/BPN)"
    }).addTo(map);
    flyToConfig();
    showLegend(id, c);
  }

  function hide(id) {
    if (active[id]) { map.removeLayer(active[id]); delete active[id]; }
    hideLegend(id);
  }

  function showLegend(id, c) {
    if (legendActive[id]) return;
    if (typeof addUnifiedLegend !== 'function') return;
    var div = L.DomUtil.create('div', 'atrbpn-legend');
    L.DomEvent.disableClickPropagation(div);
    var legendUrl = WMS_URL + '?service=WMS&version=1.1.1&request=GetLegendGraphic'
      + '&format=image/png&layer=' + encodeURIComponent(c.layer)
      + '&legend_options=fontAntiAliasing:true;fontSize:11';
    div.innerHTML =
      '<div class="atrbpn-legend-title">' + c.label + '</div>'
      + '<img src="' + legendUrl + '" alt="legend" style="max-width:100%;background:#fff;border-radius:4px;" onerror="this.style.display=&apos;none&apos;" />'
      + '<div class="atrbpn-legend-source">Sumber: ATR/BPN (mapservice.atrbpn.go.id)</div>';
    addUnifiedLegend(id, typeof createLegendWithToggle === 'function' ? createLegendWithToggle(div) : div);
    legendActive[id] = true;
  }

  function hideLegend(id) {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend(id);
    legendActive[id] = false;
  }

  window.toggleAtrbpnWmsLayer = function (id, visible) {
    if (visible) show(id); else hide(id);
  };

  window.isAtrbpnWmsActive = function (id) {
    return !!(active[id] && map.hasLayer(active[id]));
  };

  window.ATRBPN_WMS_IDS = Object.keys(LAYERS);
})();
