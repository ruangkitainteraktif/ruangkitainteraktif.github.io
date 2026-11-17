(function () {
  'use strict';

  var selectionLayer = null;
  var tableFeatures = Object.create(null);

  function selectionGeoJson(feature) {
    if (!feature || !feature.geometry) return null;
    if (window.L && L.esri && L.esri.Util && typeof L.esri.Util.arcgisToGeoJSON === 'function') {
      try { return L.esri.Util.arcgisToGeoJSON(feature); } catch (error) { /* use GeoJSON fallback */ }
    }
    var geometry = feature.geometry;
    if (geometry.type && geometry.coordinates) return feature;
    return null;
  }

  function clearSelection() {
    if (selectionLayer && window.map && map.hasLayer(selectionLayer)) map.removeLayer(selectionLayer);
    selectionLayer = null;
    if (window.map) map.closePopup();
  }

  window.showFaultIdentifyResult = function (options) {
    if (!options || !window.map) return;
    var features = options.features || [];
    clearSelection();

    var geoFeatures = features.map(selectionGeoJson).filter(Boolean);
    if (geoFeatures.length) {
      selectionLayer = L.geoJSON(geoFeatures, {
        interactive: false,
        style: { color: '#0759d6', weight: 6, opacity: 1, fillColor: '#38bdf8', fillOpacity: 0.24 }
      }).addTo(map);
      if (selectionLayer.bringToFront) selectionLayer.bringToFront();
    }

    var body = options.html || '<div class="quake-popup">Tidak ada data fitur pada lokasi ini.</div>';
    if (features.length && options.tableId) {
      tableFeatures[options.tableId] = features;
      var button = '<button type="button" class="fault-table-action" style="display:flex;align-items:center;gap:7px;margin:10px 12px 12px;padding:7px 10px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;color:#164e63;font-family:inherit;font-size:11px;font-weight:600;line-height:1;cursor:pointer" aria-label="Buka tabel atribut" title="Buka tabel atribut" onclick="window.openFaultSelectionTable(\'' + options.tableId + '\')">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 4v16m6-16v16"/></svg><span>Tabel atribut</span></button>';
      var end = body.lastIndexOf('</div></div>');
      body = end >= 0 ? body.slice(0, end) + button + body.slice(end) : body + button;
    }

    L.popup({ maxWidth: 340, className: 'quake-leaflet-popup' })
      .setLatLng(options.latlng)
      .setContent(body)
      .openOn(map);
  };

  window.openFaultSelectionTable = function (tableId) {
    var features = tableFeatures[tableId] || [];
    if (!features.length || typeof window.registerDynamicAttrTable !== 'function' || typeof window.openAttrTableForLayer !== 'function') return;
    window.registerDynamicAttrTable(tableId, {
      name: features[0].layerName || 'Fitur patahan terpilih',
      type: 'vector',
      getFeaturesAsync: function () {
        return Promise.resolve(features.map(function (feature) {
          var row = Object.assign({}, feature.attributes || {});
          row._faultLatLng = feature.latlng || null;
          return row;
        }));
      },
      getLatLng: function (row) {
        var point = row._faultLatLng;
        return point ? [point.lat, point.lng] : null;
      }
    });
    window.openAttrTableForLayer(tableId);
  };

  window.clearFaultIdentifySelection = clearSelection;
})();
