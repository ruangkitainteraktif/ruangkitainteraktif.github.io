/* ArcGIS Online geology polygons for the Geologi catalog. */
(function () {
  'use strict';

  var ITEM_ID = 'f8aa4edefe9a4a30a01025129d8ba12e';
  var ITEM_URL = 'https://www.arcgis.com/sharing/rest/content/items/' + ITEM_ID;
  var SOURCE_URL = 'https://www.arcgis.com/apps/mapviewer/index.html?layers=' + ITEM_ID;
  var layer = null;
  var loading = null;
  var requestedVisible = false;
  var layerFields = [];
  var layerName = 'Peta Geologi Yogyakarta';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function appendParams(url, params) {
    var query = Object.keys(params).map(function (key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
    }).join('&');
    return url + (url.indexOf('?') === -1 ? '?' : '&') + query;
  }

  function fetchJSON(url) {
    function fetchFrom(target) {
      return fetch(target).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      }).then(function (data) {
        if (data && data.error) throw new Error(data.error.message || 'ArcGIS REST mengembalikan error.');
        return data;
      });
    }
    return fetchFrom(url).catch(function (directError) {
      var proxy = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=' + encodeURIComponent(url);
      return fetchFrom(proxy).catch(function () { throw directError; });
    });
  }

  function fieldsFromMetadata(metadata) {
    var ignored = /^(objectid|fid|shape|shape__area|shape__length|globalid|created_user|created_date|last_edited_user|last_edited_date)$/i;
    return (metadata.fields || []).filter(function (field) {
      return field && field.name && !ignored.test(field.name);
    }).map(function (field) {
      return { name: field.name, alias: field.alias || field.name };
    });
  }

  function sourceFromWebMap(itemData) {
    var sources = [];
    function walk(layers) {
      (layers || []).forEach(function (entry) {
        if (!entry) return;
        if (entry.url) sources.push({ url: entry.url, definition: entry.layerDefinition || {}, title: entry.title || entry.name || '' });
        var featureLayers = entry.featureCollection && entry.featureCollection.layers;
        (featureLayers || []).forEach(function (fcLayer) {
          var definition = fcLayer.layerDefinition || {};
          var features = fcLayer.featureSet && fcLayer.featureSet.features;
          if (features && features.length) sources.push({ embedded: features, definition: definition, title: definition.name || entry.title || '' });
        });
        if (entry.layers) walk(entry.layers);
      });
    }
    if (itemData && itemData.featureCollection && itemData.featureCollection.layers) {
      itemData.featureCollection.layers.forEach(function (fcLayer) {
        var definition = fcLayer.layerDefinition || {};
        var features = fcLayer.featureSet && fcLayer.featureSet.features;
        if (features && features.length) sources.push({ embedded: features, definition: definition, title: definition.name || '' });
      });
    }
    walk(itemData && itemData.operationalLayers);
    return sources;
  }

  function toGeoJSONFeature(feature) {
    if (!feature) return null;
    if (feature.type === 'Feature' && feature.geometry) return feature;
    if (window.L && L.esri && L.esri.Util && typeof L.esri.Util.arcgisToGeoJSON === 'function') {
      try {
        var converted = L.esri.Util.arcgisToGeoJSON(feature);
        if (converted && converted.type === 'Feature') return converted;
      } catch (ignore) {}
    }
    return null;
  }

  function fromFeatureSet(featureSet) {
    return (featureSet || []).map(toGeoJSONFeature).filter(Boolean);
  }

  function spatialReferenceCode(feature) {
    var ref = feature && feature._rkSpatialReference ||
      feature && feature.geometry && feature.geometry.spatialReference ||
      feature && feature.crs && feature.crs.properties && feature.crs.properties.name || '';
    if (typeof ref === 'object') {
      ref = ref.latestWkid || ref.wkid || ref.properties && ref.properties.name || '';
    }
    var match = String(ref).match(/(?:EPSG(?::|::)|wkid[=:]?)(\d+)/i);
    return match ? Number(match[1]) : 0;
  }

  function normalizeFeature(feature) {
    if (!feature || !feature.geometry || !feature.geometry.coordinates) return null;
    var geometry = feature.geometry;
    var first = null;
    function findFirst(value) {
      if (!Array.isArray(value)) return;
      if (value.length >= 2 && typeof value[0] !== 'object' && typeof value[1] !== 'object') {
        first = [Number(value[0]), Number(value[1])];
        return;
      }
      for (var i = 0; i < value.length && !first; i++) findFirst(value[i]);
    }
    findFirst(geometry.coordinates);
    if (!first || !isFinite(first[0]) || !isFinite(first[1])) return null;

    var wkid = spatialReferenceCode(feature);
    var webMercator = wkid === 3857 || wkid === 102100 || wkid === 102113 || wkid === 900913;
    if (!webMercator && (Math.abs(first[0]) > 180 || Math.abs(first[1]) > 90)) webMercator = true;
    var swapCoordinates = !webMercator && (
      (Math.abs(first[0]) <= 11 && first[1] >= 90 && first[1] <= 142) ||
      (Math.abs(first[0]) <= 90 && Math.abs(first[1]) > 90 && Math.abs(first[1]) <= 180)
    );

    function normalize(value) {
      if (!Array.isArray(value)) return value;
      if (value.length >= 2 && typeof value[0] !== 'object' && typeof value[1] !== 'object') {
        var x = Number(value[0]);
        var y = Number(value[1]);
        if (!isFinite(x) || !isFinite(y)) return null;
        var lon = x;
        var lat = y;
        if (webMercator) {
          lon = x / 20037508.342789244 * 180;
          var mercatorLat = y / 20037508.342789244 * 180;
          lat = 180 / Math.PI * (2 * Math.atan(Math.exp(mercatorLat * Math.PI / 180)) - Math.PI / 2);
        } else if (swapCoordinates) {
          lon = y;
          lat = x;
        }
        if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
        var point = [lon, lat];
        for (var z = 2; z < value.length; z++) point.push(value[z]);
        return point;
      }
      return value.map(normalize).filter(function (part) { return part !== null; });
    }

    var normalized = normalize(geometry.coordinates);
    if (!normalized || !normalized.length) return null;
    var copy = {};
    Object.keys(feature).forEach(function (key) { copy[key] = feature[key]; });
    copy.geometry = {};
    Object.keys(geometry).forEach(function (key) {
      if (key !== 'coordinates' && key !== 'spatialReference') copy.geometry[key] = geometry[key];
    });
    copy.geometry.coordinates = normalized;
    delete copy._rkSpatialReference;
    return copy;
  }

  function makeQueryUrl(url, offset, pageSize, format) {
    return appendParams(url.replace(/\/$/, '') + '/query', {
      where: '1=1',
      outFields: '*',
      returnGeometry: 'true',
      outSR: '4326',
      resultOffset: offset,
      resultRecordCount: pageSize,
      f: format
    });
  }

  function fetchQueryPage(url, offset, pageSize) {
    return fetchJSON(makeQueryUrl(url, offset, pageSize, 'geojson')).catch(function () {
      return fetchJSON(makeQueryUrl(url, offset, pageSize, 'json'));
    }).then(function (data) {
      var features = data.features || [];
      if (data.type !== 'FeatureCollection') features = fromFeatureSet(features);
      var reference = data.spatialReference || data.crs;
      if (reference) features.forEach(function (feature) {
        if (!feature._rkSpatialReference) feature._rkSpatialReference = reference;
      });
      return { features: features, exceeded: !!data.exceededTransferLimit };
    });
  }

  function fetchAllFeatures(source) {
    if (source.embedded) return Promise.resolve(fromFeatureSet(source.embedded));
    var pageSize = Math.min(Number(source.metadata.maxRecordCount) || 1000, 1000);
    var all = [];
    function next(offset, pageNumber) {
      return fetchQueryPage(source.url, offset, pageSize).then(function (page) {
        all = all.concat(page.features);
        if (all.length >= 30000) return all.slice(0, 30000);
        if (page.features.length === 0 || pageNumber >= 29 ||
            (!page.exceeded && page.features.length < pageSize)) return all;
        return next(offset + page.features.length, pageNumber + 1);
      });
    }
    return next(0, 0);
  }

  function prepareServiceSource(url, definition, title) {
    return fetchJSON(url).then(function (serviceMetadata) {
      var isRoot = /\/(?:FeatureServer|MapServer)\/?$/i.test(url);
      var candidates = isRoot
        ? (serviceMetadata.layers || []).map(function (entry) {
          return { url: url.replace(/\/$/, '') + '/' + entry.id, title: entry.name || title || '', definition: definition };
        })
        : [{ url: url.replace(/\/$/, ''), title: title || serviceMetadata.name || '', definition: definition }];
      return Promise.all(candidates.map(function (candidate) {
        return fetchJSON(candidate.url).then(function (metadata) {
          candidate.metadata = metadata;
          if (!candidate.definition || !Object.keys(candidate.definition).length) candidate.definition = metadata;
          candidate.title = candidate.title || metadata.name || '';
          candidate.fields = fieldsFromMetadata(metadata);
          return candidate;
        });
      })).then(function (prepared) {
        var polygonLayers = prepared.filter(function (candidate) {
          return /polygon/i.test(candidate.metadata.geometryType || '');
        });
        return polygonLayers.length ? polygonLayers : prepared;
      });
    });
  }

  function getSources(item, itemData) {
    var sources = sourceFromWebMap(itemData);
    if (item && item.url) sources.unshift({ url: item.url, title: item.title || '', definition: {} });
    var byUrl = {};
    sources = sources.filter(function (source) {
      if (!source.url) return true;
      if (byUrl[source.url]) return false;
      byUrl[source.url] = true;
      return true;
    });
    var prepared = [];
    return Promise.all(sources.map(function (source) {
      if (source.embedded) {
        source.fields = fieldsFromMetadata(source.definition);
        prepared.push([source]);
        return Promise.resolve();
      }
      return prepareServiceSource(source.url, source.definition, source.title).then(function (list) {
        prepared.push(list);
      });
    })).then(function () { return [].concat.apply([], prepared); });
  }

  function propertyEntries(properties, fields) {
    var entries = [];
    (fields || []).forEach(function (field) {
      var value = properties[field.name];
      if (value == null || value === '') return;
      entries.push('<div class="agol-popup-field"><span class="agol-popup-field-label">' +
        escapeHtml(field.alias) + '</span><span class="agol-popup-field-value">' +
        escapeHtml(value) + '</span></div>');
    });
    if (!entries.length) {
      Object.keys(properties || {}).filter(function (key) { return key.charAt(0) !== '_'; }).slice(0, 6).forEach(function (key) {
        entries.push('<div class="agol-popup-field"><span class="agol-popup-field-label">' +
          escapeHtml(key) + '</span><span class="agol-popup-field-value">' +
          escapeHtml(properties[key]) + '</span></div>');
      });
    }
    return entries.slice(0, 8).join('');
  }

  function getDisplayTitle(properties, source) {
    var displayField = source.metadata && source.metadata.displayField;
    var title = displayField && properties[displayField];
    if (!title) {
      var keys = Object.keys(properties || {});
      var key = keys.filter(function (candidate) {
        return /^(namobj|nama|name|unit|formasi|litologi|satuan|geologi)$/i.test(candidate);
      })[0];
      title = key && properties[key];
    }
    return title || source.title || layerName;
  }

  function colorFor(source, properties) {
    var renderer = source.definition && source.definition.drawingInfo && source.definition.drawingInfo.renderer;
    var symbol = renderer && renderer.symbol;
    if (symbol && symbol.color && symbol.color.length >= 3) {
      return 'rgb(' + symbol.color.slice(0, 3).join(',') + ')';
    }
    if (renderer && renderer.field1 && properties && properties[renderer.field1] != null) {
      var text = String(properties[renderer.field1]);
      var hash = 0;
      for (var i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
      var palette = ['#9d7952', '#bb8d5e', '#836b8f', '#728b61', '#a75f55', '#647d9e', '#b59b55', '#5d8b83'];
      return palette[Math.abs(hash) % palette.length];
    }
    return '#9b7653';
  }

  function loadLayer() {
    if (layer) return Promise.resolve(layer);
    if (loading) return loading;
    loading = Promise.all([fetchJSON(ITEM_URL + '?f=json'), fetchJSON(ITEM_URL + '/data?f=json')])
      .then(function (results) {
        var item = results[0] || {};
        var itemData = results[1] || {};
        return getSources(item, itemData);
      }).then(function (sources) {
        if (!sources.length) throw new Error('Item ArcGIS tidak berisi layer polygon atau URL service yang didukung.');
        return Promise.all(sources.map(function (source) {
          return fetchAllFeatures(source).then(function (features) {
            source.features = features.map(normalizeFeature).filter(Boolean).filter(function (feature) {
              var type = feature && feature.geometry && feature.geometry.type;
              return type === 'Polygon' || type === 'MultiPolygon';
            });
            source.fields = source.fields && source.fields.length ? source.fields :
              fieldsFromMetadata(source.metadata || {});
            return source;
          });
        }));
      }).then(function (sources) {
        var features = [];
        sources.forEach(function (source) {
          if (source.fields && source.fields.length && !layerFields.length) layerFields = source.fields;
          (source.features || []).forEach(function (feature) {
            feature.properties = feature.properties || {};
            feature.properties._rkSourceIndex = sources.indexOf(source);
          });
          features = features.concat(source.features || []);
        });
        if (!features.length) throw new Error('Service ArcGIS berhasil dihubungi, tetapi tidak mengembalikan geometri polygon.');
        layer = L.geoJSON({ type: 'FeatureCollection', features: features }, {
          style: function (feature) {
            var source = sources[Number(feature.properties && feature.properties._rkSourceIndex)] || sources[0];
            var color = colorFor(source, feature.properties || {});
            return { color: color, weight: 0.8, opacity: 0.95, fillColor: color, fillOpacity: 0.4 };
          },
          onEachFeature: function (feature, featureLayer) {
            var properties = feature.properties || {};
            var source = sources[Number(properties._rkSourceIndex)] || sources[0];
            var html = '<div class="agol-popup geologi-arcgis-popup">';
            html += '<div class="agol-popup-header agol-geo-geologi"><div class="agol-popup-badge"><span class="agol-popup-badge-dot"></span>' +
              escapeHtml(layerName) + '</div><div class="agol-popup-title">' +
              escapeHtml(getDisplayTitle(properties, source)) + '</div></div>';
            html += '<div class="agol-popup-body"><div class="agol-popup-fields">' +
              propertyEntries(properties, source.fields) +
              '</div></div><div class="agol-popup-footer"><span>Sumber: <a href="' +
              SOURCE_URL + '" target="_blank" rel="noopener noreferrer">ArcGIS Online</a></span></div></div>';
            featureLayer.bindPopup(html, { maxWidth: 360, className: 'agol-leaflet-popup' });
          }
        });
        return layer;
      }).catch(function (error) {
        loading = null;
        requestedVisible = false;
        console.error('[Peta Geologi Yogyakarta]', error);
        if (window.showToast) window.showToast('Data geologi gagal dimuat: ' + error.message, 'error');
        if (typeof window.setLayerCatalogCheckboxState === 'function') {
          window.setLayerCatalogCheckboxState('toggleGeologiArcGISOnline', false);
        }
        throw error;
      });
    return loading;
  }

  window.toggleGeologiArcGISOnline = function (visible) {
    var map = window.map || window._map;
    if (!map) return;
    requestedVisible = !!visible;
    if (!visible) {
      if (layer && map.hasLayer(layer)) map.removeLayer(layer);
      return;
    }
    loadLayer().then(function (loadedLayer) {
      if (requestedVisible && !map.hasLayer(loadedLayer)) loadedLayer.addTo(map);
    }).catch(function () {});
  };

  window.getGeologiArcGISOnlineLayer = function () { return layer; };
  window.getGeologiArcGISOnlineFields = function () {
    return layerFields.slice(0, 8).map(function (field) { return field.name; });
  };

  window.openGeologiArcGISOnlineTable = function () {
    loadLayer().then(function () {
      window.toggleGeologiArcGISOnline(true);
      if (typeof window.setLayerCatalogCheckboxState === 'function') {
        window.setLayerCatalogCheckboxState('toggleGeologiArcGISOnline', true);
      }
      if (typeof window.openAttrTableForLayer === 'function') {
        window.openAttrTableForLayer('toggleGeologiArcGISOnline');
      }
    }).catch(function () {});
  };

  window.flyToGeologiArcGISOnline = function () {
    loadLayer().then(function (loadedLayer) {
      var map = window.map || window._map;
      var bounds = loadedLayer.getBounds();
      if (!map || !bounds || !bounds.isValid()) return;
      var paddedBounds = bounds.pad(0.06);
      if (window.SheetDrag && typeof window.SheetDrag.flyToBoundsInVisibleMap === 'function') {
        window.SheetDrag.flyToBoundsInVisibleMap(paddedBounds, { maxZoom: 11, duration: 0.8 });
      } else {
        map.flyToBounds(paddedBounds, { maxZoom: 11, duration: 0.8 });
      }
    }).catch(function () {});
  };
})();
