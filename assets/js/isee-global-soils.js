/* Global soil layers from the ISee / Purdue Soil Explorer ArcGIS services. */
(function () {
  'use strict';

  var ROOT = 'https://mapsweb.lib.purdue.edu/arcgis/rest/services/Isee/';
  var DEFINITIONS = {
    hillshade: { service: 'WLD_Hillshade_V2', label: 'Hillshade Global', z: 210, opacity: 0.72, attribution: 'ISee Network / Purdue University' },
    orders: { service: 'WLD_Soil_Orders', label: 'Soil Orders Global', z: 220, opacity: 0.9, attribution: 'Soil Orders: USDA NRCS / ISee Network' },
    moisture: { service: 'WLD_Soil_Moisture_Regimes', label: 'Soil Moisture Regimes Global', z: 230, opacity: 0.9, attribution: 'ISee Network / Purdue University' },
    boundaries: { service: 'WLD_Admin_Boundaries', label: 'Batas Administrasi Global', z: 240, opacity: 0.9, attribution: 'ISee Network / Purdue University' },
    labels: { service: 'WLD_Admin_Labels', label: 'Label Administrasi Global', z: 250, opacity: 1, attribution: 'ISee Network / Purdue University' }
  };
  var layers = {};
  var legendRequest = null;
  var ordersLegendEntries = [];
  var moistureLegendRequest = null;
  var moistureLegendEntries = [];
  var legendId = 'isee-global-soil-orders';
  var identifyMap = null;
  var identifyHandler = null;
  var identifyRequestId = 0;
  var currentPopup = null;
  var soilThemeActive = { orders: false, moisture: false };
  var soilThemeSupport = ['hillshade', 'boundaries', 'labels'];

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function isPopupDocumentField(field, value) {
    var text = String(value == null ? '' : value).trim();
    return /<!doctype\s+html|<html\b/i.test(text) ||
      (/about this map/i.test(text) && /soils consist of a series/i.test(text)) ||
      /^(?:popupinfo|popup_html|html_content)$/i.test(String(field || ''));
  }

  function jsonp(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var callbackName = '__ruangkitaIseeIdentify' + Date.now() + Math.floor(Math.random() * 100000);
      var script = document.createElement('script');
      var settled = false;
      function finish(error, data) {
        if (settled) return;
        settled = true; clearTimeout(timeout); script.remove(); delete window[callbackName];
        if (error) reject(error); else resolve(data);
      }
      var timeout = setTimeout(function () { finish(new Error('Waktu permintaan habis.')); }, timeoutMs || 12000);
      window[callbackName] = function (data) { finish(data && data.error ? new Error(data.error.message || 'Identify gagal.') : null, data); };
      script.onerror = function () { finish(new Error('Service Soil Explorer tidak dapat dijangkau.')); };
      script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + callbackName;
      document.head.appendChild(script);
    });
  }

  function getIdentifyUrl(key, latlng, map) {
    var definition = DEFINITIONS[key];
    var point = window.L.CRS.EPSG3857.project(latlng);
    var bounds = map.getBounds();
    var southWest = window.L.CRS.EPSG3857.project(bounds.getSouthWest());
    var northEast = window.L.CRS.EPSG3857.project(bounds.getNorthEast());
    var size = map.getSize();
    var params = new URLSearchParams({
      geometry: JSON.stringify({ x: point.x, y: point.y, spatialReference: { wkid: 3857 } }),
      geometryType: 'esriGeometryPoint', sr: '3857',
      mapExtent: [southWest.x, southWest.y, northEast.x, northEast.y].join(','),
      imageDisplay: [Math.max(1, size.x), Math.max(1, size.y), 96].join(','),
      tolerance: '8', layers: 'all', returnGeometry: 'false', f: 'json'
    });
    return ROOT + definition.service + '/MapServer/identify?' + params.toString();
  }

  function legendClassForValue(key, value) {
    var entries = key === 'moisture' ? moistureLegendEntries : ordersLegendEntries;
    var target = String(value == null ? '' : value);
    for (var i = 0; i < entries.length; i++) {
      var values = entries[i].values || [];
      if (values.some(function (item) { return String(item) === target; })) return entries[i].label;
    }
    return '';
  }

  function formatIdentifyResult(key, response) {
    var definition = DEFINITIONS[key];
    var results = response && Array.isArray(response.results) ? response.results : [];
    return results.map(function (result) {
      var attributes = result.attributes || {};
      var value = result.value;
      if (value == null) {
        var pixelField = Object.keys(attributes).find(function (field) { return /pixel.?value/i.test(field); });
        value = pixelField ? attributes[pixelField] : attributes.Value;
      }
      var classField = Object.keys(attributes).find(function (field) { return /class.?label|class.?name/i.test(field); });
      var className = (key === 'orders' || key === 'moisture') ? (legendClassForValue(key, value) || (classField && attributes[classField])) : '';
      var rows = [];
      if (className) rows.push([key === 'orders' ? 'Soil Order' : 'Kelas Tanah', className]);
      else if (value != null && value !== '') rows.push(['Nilai piksel', value]);
      Object.keys(attributes).forEach(function (field) {
        var fieldValue = attributes[field];
        if (fieldValue == null || fieldValue === '' || isPopupDocumentField(field, fieldValue) || /objectid|fid|shape|globalid|count_|pixel.?value|class.?label|class.?name/i.test(field)) return;
        if (rows.some(function (row) { return row[0] === field || String(row[1]) === String(fieldValue); })) return;
        rows.push([field.replace(/_/g, ' '), fieldValue]);
      });
      return { title: className || result.layerName || definition.label, rows: rows.slice(0, 7) };
    });
  }

  function renderIdentifyPopup(latlng, results, failedCount) {
    var html = '<div class="agol-popup isee-soil-popup">' +
      '<div class="agol-popup-header agol-geo-tanah"><div class="agol-popup-badge"><span class="agol-popup-badge-dot"></span>Soil Explorer</div>' +
      '<div class="agol-popup-title">Informasi Tanah</div><div class="agol-popup-subtitle">' + Number(latlng.lat).toFixed(5) + ', ' + Number(latlng.lng).toFixed(5) + '</div></div>';
    html += '<div class="agol-popup-body">';
    if (!results.length) {
      html += '<div class="isee-soil-popup-empty">Tidak ada informasi pada titik ini. Cakupan layer global dapat berbeda.</div>';
    } else {
      results.forEach(function (result) {
        html += '<section class="isee-soil-popup-section"><strong>' + escapeHtml(result.title) + '</strong>';
        if (result.rows.length) {
          html += '<div class="agol-popup-fields">';
          result.rows.forEach(function (row) {
            html += '<div class="agol-popup-field"><span class="agol-popup-field-label">' + escapeHtml(row[0]) + '</span><span class="agol-popup-field-value">' + escapeHtml(row[1]) + '</span></div>';
          });
          html += '</div>';
        } else html += '<small>Service tidak mengembalikan atribut rinci untuk titik ini.</small>';
        html += '</section>';
      });
    }
    if (failedCount) html += '<small class="isee-soil-popup-note">Sebagian layer gagal merespons (' + failedCount + ').</small>';
    html += '</div><div class="agol-popup-footer"><span>Sumber: ISee Network / Purdue University</span></div></div>';
    return html;
  }

  function identifyAtPoint(event) {
    var map = identifyMap;
    if (!map || !event || !event.latlng) return;
    var requestId = ++identifyRequestId;
    var activeKeys = Object.keys(layers).filter(function (key) {
      return key !== 'hillshade' && map.hasLayer(layers[key]);
    });
    if (!activeKeys.length) return;
    currentPopup = window.L.popup({ maxWidth: 360, className: 'isee-soil-leaflet-popup' })
      .setLatLng(event.latlng)
      .setContent('<div class="agol-popup isee-soil-popup"><div class="agol-popup-header agol-geo-tanah"><div class="agol-popup-badge">Soil Explorer</div><div class="agol-popup-title">Memuat informasi tanah...</div></div></div>')
      .openOn(map);
    Promise.all(activeKeys.map(function (key) {
      return jsonp(getIdentifyUrl(key, event.latlng, map)).then(function (data) {
        return { key: key, results: formatIdentifyResult(key, data) };
      });
    }).map(function (promise) {
      return promise.catch(function () { return { failed: true, results: [] }; });
    })).then(function (responses) {
      if (requestId !== identifyRequestId || !map.hasLayer(currentPopup)) return;
      var results = [], failedCount = 0;
      responses.forEach(function (response) {
        if (response.failed) { failedCount++; return; }
        response.results.forEach(function (result) { results.push(result); });
      });
      currentPopup.setContent(renderIdentifyPopup(event.latlng, results, failedCount));
    });
  }

  function syncIdentifyHandler(map) {
    var shouldListen = Object.keys(layers).some(function (key) { return key !== 'hillshade' && map.hasLayer(layers[key]); });
    if (identifyMap && identifyHandler) identifyMap.off('click', identifyHandler);
    identifyMap = null; identifyHandler = null; identifyRequestId++;
    if (currentPopup) { map.closePopup(currentPopup); currentPopup = null; }
    if (!shouldListen) return;
    identifyMap = map; identifyHandler = identifyAtPoint;
    map.on('click', identifyHandler);
  }

  function updateOrdersLegend() {
    if (!window.addUnifiedLegend) return;
    var box = document.createElement('div');
    box.className = 'isee-soil-legend';
    var heading = document.createElement('strong');
    heading.textContent = 'Soil Orders Global';
    box.appendChild(heading);
    var list = document.createElement('div');
    list.className = 'isee-soil-legend-items';
    box.appendChild(list);
    var note = document.createElement('small');
    note.className = 'isee-soil-legend-note';
    note.textContent = 'Peta global. Detail dan visibilitas bergantung pada skala tampilan.';
    box.appendChild(note);
    var source = document.createElement('small');
    source.className = 'isee-soil-legend-source';
    source.textContent = 'Sumber: ISee Network / Purdue University; data USDA NRCS.';
    box.appendChild(source);
    window.addUnifiedLegend(legendId, window.createLegendWithToggle ? window.createLegendWithToggle(box) : box);

    if (!legendRequest) {
      legendRequest = new Promise(function (resolve) {
        var callbackName = '__ruangkitaIseeLegend' + Date.now();
        var script = document.createElement('script');
        var settled = false;
        function finish(data) {
          if (settled) return;
          settled = true; clearTimeout(timeout); script.remove(); delete window[callbackName]; resolve(data || null);
        }
        var timeout = setTimeout(function () { finish(null); }, 15000);
        window[callbackName] = finish;
        script.onerror = function () { console.warn('[ISee Soil] Legenda tidak dapat dimuat.'); finish(null); };
        script.src = ROOT + 'WLD_Soil_Orders/MapServer/legend?f=json&callback=' + callbackName;
        document.head.appendChild(script);
      });
    }
    legendRequest.then(function (data) {
      if (!data || !Array.isArray(data.layers)) return;
      var layer = data.layers.find(function (item) { return Number(item.layerId) === 0; }) || data.layers[0];
      if (!layer || !Array.isArray(layer.legend) || !document.body.contains(box)) return;
      ordersLegendEntries = layer.legend;
      layer.legend.forEach(function (item) {
        var row = document.createElement('div'); row.className = 'isee-soil-legend-row';
        if (item.imageData) {
          var image = document.createElement('img');
          image.alt = ''; image.src = 'data:' + (item.contentType || 'image/png') + ';base64,' + item.imageData;
          row.appendChild(image);
        }
        var label = document.createElement('span'); label.textContent = item.label || item.values && item.values.join(', ') || 'Kelas tanah';
        row.appendChild(label); list.appendChild(row);
      });
    });
  }

  function setLayerVisible(key, visible, map, L) {
    var definition = DEFINITIONS[key];
    if (!definition) return;
    if (!layers[key]) {
      layers[key] = L.esri.tiledMapLayer({
        url: ROOT + definition.service + '/MapServer',
        opacity: definition.opacity,
        zIndex: definition.z,
        attribution: definition.attribution
      });
    }
    if (visible) {
      if (!map.hasLayer(layers[key])) layers[key].addTo(map);
      if (key === 'orders') updateOrdersLegend();
      if (key === 'moisture' && !moistureLegendRequest) {
        moistureLegendRequest = jsonp(ROOT + definition.service + '/MapServer/legend?f=json').then(function (data) {
          var item = data && Array.isArray(data.layers) && (data.layers.find(function (entry) { return Number(entry.layerId) === 0; }) || data.layers[0]);
          moistureLegendEntries = item && Array.isArray(item.legend) ? item.legend : [];
        }).catch(function (error) { console.warn('[ISee Soil] Legenda soil moisture tidak dapat dimuat:', error); });
      }
    } else {
      if (map.hasLayer(layers[key])) map.removeLayer(layers[key]);
      if (key === 'orders' && window.removeUnifiedLegend) window.removeUnifiedLegend(legendId);
    }
  }

  function syncCatalogLayerState(key, visible) {
    if (typeof window.setLayerCatalogCheckboxState === 'function') {
      window.setLayerCatalogCheckboxState('isee-soil-' + key, visible);
    }
  }

  function toggleIseeSoilLayer(id, visible) {
    var key = String(id || '').replace(/^isee-soil-/, '');
    var map = window.map, L = window.L;
    if (!DEFINITIONS[key] || !map || !L || !L.esri || !L.esri.tiledMapLayer) return;

    if (key === 'orders' || key === 'moisture') {
      soilThemeActive[key] = !!visible;
      setLayerVisible(key, !!visible, map, L);
      var showSupport = soilThemeActive.orders || soilThemeActive.moisture;
      soilThemeSupport.forEach(function (supportKey) {
        setLayerVisible(supportKey, showSupport, map, L);
        syncCatalogLayerState(supportKey, showSupport);
      });
    } else {
      // Keep shared context layers on while either soil classification is active.
      var requiredBySoilTheme = soilThemeSupport.indexOf(key) >= 0 && (soilThemeActive.orders || soilThemeActive.moisture);
      setLayerVisible(key, requiredBySoilTheme ? true : !!visible, map, L);
      if (requiredBySoilTheme && !visible) syncCatalogLayerState(key, true);
    }
    syncIdentifyHandler(map);
  }

  window.toggleIseeSoilLayer = toggleIseeSoilLayer;
})();
