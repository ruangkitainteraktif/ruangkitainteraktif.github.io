/* Peta Jenis Tanah Jawa Tengah dari web map ArcGIS Online 95c8a0fa... */
(function () {
  'use strict';

  var DATA_URL = 'assets/data/jenis-tanah-jateng.geojson';
  var SOURCE_URL = 'https://www.arcgis.com/apps/mapviewer/index.html?webmap=95c8a0faece94c12b9b038f00952ac57';
  var layer = null;
  var loading = null;
  var requestedVisible = false;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function popup(properties) {
    var html = '<div class="agol-popup tanah-popup">';
    html += '<div class="agol-popup-header agol-geo-tanah">';
    html += '<div class="agol-popup-badge"><span class="agol-popup-badge-dot"></span>Jenis Tanah</div>';
    html += '<div class="agol-popup-title">' + esc(properties.MACAM_TANA || 'Informasi jenis tanah') + '</div>';
    html += '<div class="agol-popup-subtitle">Provinsi Jawa Tengah</div></div>';
    html += '<div class="agol-popup-body"><div class="agol-popup-fields">';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Bahan induk</span><span class="agol-popup-field-value">' + esc(properties.BAHAN_INDU || '-') + '</span></div>';
    html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Fisiografi</span><span class="agol-popup-field-value">' + esc(properties.FISIOGRAFI || '-') + '</span></div>';
    html += '</div></div>';
    html += '<div class="agol-popup-footer"><span>Sumber: <a href="' + SOURCE_URL + '" target="_blank" rel="noopener noreferrer">ArcGIS Online</a></span></div>';
    return html + '</div>';
  }

  function getLayer() {
    if (layer) return Promise.resolve(layer);
    if (loading) return loading;
    loading = fetch(DATA_URL).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).then(function (geojson) {
      layer = L.geoJSON(geojson, {
        style: function (feature) {
          return {
            color: feature.properties._fillColor || '#9b7653',
            weight: 0.7,
            opacity: 0.9,
            fillColor: feature.properties._fillColor || '#9b7653',
            fillOpacity: 0.365
          };
        },
        onEachFeature: function (feature, featureLayer) {
          featureLayer.bindPopup(popup(feature.properties), { maxWidth: 340, className: 'agol-leaflet-popup' });
        }
      });
      return layer;
    }).catch(function (error) {
      loading = null;
      console.error('[Jenis Tanah Jateng] Gagal memuat data:', error);
      if (window.showToast) window.showToast('Data peta jenis tanah gagal dimuat. Coba lagi.', 'error');
      throw error;
    });
    return loading;
  }

  window.toggleJenisTanahJateng = function (visible) {
    var map = window.map || window._map;
    if (!map) return;
    requestedVisible = !!visible;
    if (!visible) {
      if (layer && map.hasLayer(layer)) map.removeLayer(layer);
      return;
    }
    getLayer().then(function (loadedLayer) {
      if (requestedVisible && !map.hasLayer(loadedLayer)) loadedLayer.addTo(map);
    }).catch(function () {});
  };

  window.flyToJenisTanahJateng = function () {
    var map = window.map || window._map;
    if (!map) return;
    getLayer().then(function (loadedLayer) {
      var bounds = loadedLayer.getBounds();
      if (bounds && bounds.isValid()) map.flyToBounds(bounds.pad(0.06), { maxZoom: 11, duration: 0.8 });
    }).catch(function () {});
  };

  window.openJenisTanahJatengTable = function () {
    getLayer().then(function () {
      window.toggleJenisTanahJateng(true);
      if (typeof window.setLayerCatalogCheckboxState === 'function') {
        window.setLayerCatalogCheckboxState('toggleJenisTanahJateng', true);
      }
      if (typeof window.openAttrTableForLayer === 'function') {
        window.openAttrTableForLayer('toggleJenisTanahJateng');
      }
    }).catch(function () {});
  };

  window.getJenisTanahJatengLayer = function () { return layer; };
})();
