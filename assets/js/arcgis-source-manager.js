(function () {
  'use strict';

  var PROXY_PREFIX = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';
  var MAX_DEPTH = 8;
  var MAX_FOLDERS = 2000;
  var MAX_SERVICES = 4000;
  var ATTRIBUTE_PAGE_SIZE = 100;
  var state = {
    root: null,
    leaves: [],
    selected: new Set(),
    active: {},
    attributeKey: null,
    attributeRequest: 0,
    attributePageByKey: {},
    visited: {},
    run: 0,
    cancelled: false,
    folderCount: 0,
    serviceCount: 0,
    truncated: false,
    errors: 0
  };

  function getElement(id) {
    return document.getElementById(id);
  }

  function getMap() {
    if (typeof window._map !== 'undefined' && window._map) return window._map;
    if (typeof window.map !== 'undefined' && window.map) return window.map;
    if (typeof map !== 'undefined') return map;
    return null;
  }

  function setStatus(message, isError) {
    var element = getElement('arcgisSourceStatus');
    if (!element) return;
    element.textContent = message || '';
    element.style.color = isError ? '#b91c1c' : '#52728a';
    element.style.display = message ? '' : 'none';
  }

  function setProgress(message) {
    var element = getElement('arcgisSourceProgress');
    if (element) element.textContent = message || '';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character];
    });
  }

  function isPrivateHost(hostname) {
    var host = String(hostname || '').toLowerCase();
    if (!host || host === 'localhost' || host === 'ip6-localhost' || host === '::1' || host === '[::1]') return true;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^0\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
    return false;
  }

  function normalizeBaseUrl(value) {
    var raw = String(value || '').trim();
    if (!raw) throw new Error('URL ArcGIS REST wajib diisi.');
    var parsed = new URL(raw);
    if (parsed.protocol !== 'https:') throw new Error('Gunakan URL ArcGIS REST HTTPS.');
    if (isPrivateHost(parsed.hostname)) throw new Error('Host lokal atau privat tidak diizinkan.');
    parsed.hash = '';
    parsed.search = '';
    parsed.pathname = parsed.pathname.replace(/\/+/g, '/').replace(/\/$/, '') + '/';
    return parsed.toString();
  }

  function validateUrl(value) {
    var parsed = new URL(value);
    if (parsed.protocol !== 'https:' || isPrivateHost(parsed.hostname)) throw new Error('URL ArcGIS tidak aman atau tidak didukung.');
    return parsed;
  }

  function withJsonFormat(value, format) {
    var parsed = validateUrl(value);
    parsed.searchParams.set('f', format || 'json');
    return parsed.toString();
  }

  function readJsonResponse(response) {
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json().then(function (data) {
      if (data && data.error) {
        var error = new Error('ArcGIS ' + (data.error.code || '') + ': ' + (data.error.message || 'service error'));
        error.arcgis = data.error;
        throw error;
      }
      return data;
    });
  }

  function fetchJson(value, format) {
    var requestUrl = withJsonFormat(value, format);
    return fetch(requestUrl).then(readJsonResponse).catch(function (directError) {
      return fetch(PROXY_PREFIX + encodeURIComponent(requestUrl)).then(readJsonResponse).catch(function (proxyError) {
        if (proxyError && proxyError.arcgis) throw proxyError;
        if (directError && directError.arcgis) throw directError;
        throw directError && directError.message ? directError : new Error('Tidak dapat membaca service. Periksa URL, CORS, atau izin host.');
      });
    });
  }

  function joinPath(base) {
    var parts = Array.prototype.slice.call(arguments, 1).filter(function (part) {
      return part !== undefined && part !== null && part !== '';
    });
    var encodedParts = [];
    parts.forEach(function (part) {
      String(part).split('/').filter(Boolean).forEach(function (segment) {
        encodedParts.push(encodeURIComponent(segment));
      });
    });
    return String(base).replace(/\/+$/, '') + '/' + encodedParts.join('/');
  }

  function serviceInfo(entry) {
    var text = String(entry && entry.name ? entry.name : entry || '').trim();
    var match = text.match(/^(.*?)\s*\((MapServer|FeatureServer|ImageServer|VectorTileServer)\)\s*$/i);
    if (match) return { name: match[1].trim(), type: match[2] };
    var explicitType = entry && entry.type ? String(entry.type).trim() : '';
    if (/^(MapServer|FeatureServer|ImageServer|VectorTileServer)$/i.test(explicitType)) {
      return { name: text, type: explicitType };
    }
    return null;
  }

  function serviceTypeFromUrl(value) {
    var match = String(value || '').match(/\/(MapServer|FeatureServer|ImageServer|VectorTileServer)(?:\/(\d+))?\/?$/i);
    return match ? { type: match[1], layerId: match[2] || '' } : null;
  }

  function listFrom(data, key) {
    return data && Array.isArray(data[key]) ? data[key] : data && Array.isArray(data[key.toUpperCase()]) ? data[key.toUpperCase()] : [];
  }

  function makeFolder(name, url, depth) {
    return { kind: 'folder', name: name, url: url, depth: depth, children: [] };
  }

  function makeService(name, type, url, depth) {
    return { kind: 'service', name: name, type: type, url: url, depth: depth, children: [] };
  }

  function layerKey(service, layerId) {
    return service.url + '/' + (layerId || 'service');
  }

  function layerRenderMode(serviceType, metadata) {
    if (serviceType === 'ImageServer') return 'image';
    if (serviceType === 'VectorTileServer') return 'vector';
    if (serviceType === 'MapServer' && (!metadata || (metadata.type && /raster/i.test(metadata.type)))) return 'dynamic';
    return 'feature';
  }

  function makeFallbackLeaf(service) {
    return {
      kind: 'leaf',
      key: layerKey(service, ''),
      name: service.name,
      type: service.type,
      serviceUrl: service.url,
      layerUrl: service.url,
      layerId: '',
      renderMode: layerRenderMode(service.type, null),
      selectable: true
    };
  }

  function makeLayerNode(service, layer, layerMap) {
    if (!layer || layer.id === undefined) return null;
    var id = String(layer.id);
    var name = String(layer && layer.name || 'Layer ' + id);
    var node = {
      kind: 'leaf',
      key: layerKey(service, id),
      name: name,
      type: service.type,
      serviceUrl: service.url,
      layerUrl: joinPath(service.url, id),
      layerId: id,
      metadata: layer,
      renderMode: layerRenderMode(service.type, layer),
      selectable: true
    };
    var subLayerIds = layer && Array.isArray(layer.subLayerIds) ? layer.subLayerIds : [];
    if (subLayerIds.length) {
      node.kind = 'group';
      node.selectable = false;
      node.children = subLayerIds.map(function (subId) {
        return makeLayerNode(service, layerMap[String(subId)], layerMap);
      }).filter(function (child) { return !!child; });
    }
    return node;
  }

  function populateService(service, metadata) {
    var layers = metadata && Array.isArray(metadata.layers) ? metadata.layers : [];
    var layerMap = {};
    layers.forEach(function (layer) {
      if (layer && layer.id !== undefined) layerMap[String(layer.id)] = layer;
    });
    service.children = layers.filter(function (layer) {
      return layer && (layer.parentLayerId === undefined || layer.parentLayerId === -1);
    }).map(function (layer) {
      return makeLayerNode(service, layer, layerMap);
    }).filter(Boolean);
    if (!service.children.length) service.children = [makeFallbackLeaf(service)];
    service.metadata = metadata;
  }

  function makeServiceFromEntry(parentUrl, entry, depth) {
    var info = serviceInfo(entry);
    if (!info) return null;
    return makeService(info.name, info.type, joinPath(parentUrl, info.name, info.type), depth);
  }

  function makeRootNode(value) {
    var normalized = normalizeBaseUrl(value);
    var service = serviceTypeFromUrl(normalized);
    if (service) {
      var serviceRoot = normalized.replace(/\/\d+\/?$/, '/');
      var servicePathMatch = serviceRoot.match(/\/([^/]+)\/(MapServer|FeatureServer|ImageServer|VectorTileServer)\/?$/i);
      return makeService(servicePathMatch ? servicePathMatch[1] : 'Service', service.type, serviceRoot, 0);
    }
    return makeFolder('ArcGIS REST', normalized, 0);
  }

  function countLeaves(node) {
    if (!node) return 0;
    if (node.kind === 'leaf') return node.selectable ? 1 : 0;
    return (node.children || []).reduce(function (total, child) {
      return total + countLeaves(child);
    }, 0);
  }

  function renderLeaf(node, index) {
    state.leaves.push(node);
    var checked = state.selected.has(node.key) ? ' checked' : '';
    if (!node.selectable) return '<div class="arcgis-tree-leaf arcgis-tree-leaf--disabled"><span class="arcgis-tree-label">' + escapeHtml(node.name) + '</span><span class="arcgis-tree-type">grup</span></div>';
    return '<label class="arcgis-tree-leaf"><input type="checkbox" data-arcgis-leaf="' + index + '"' + checked + '><span class="arcgis-tree-label">' + escapeHtml(node.name) + '</span><span class="arcgis-tree-type">' + escapeHtml(node.type) + '</span></label>';
  }

  function renderNode(node) {
    if (!node) return '';
    if (node.kind === 'leaf') return renderLeaf(node, state.leaves.length);
    var children = node.children || [];
    var leafCount = countLeaves(node);
    var open = node.depth === 0 ? ' open' : '';
    var label = node.kind === 'folder' ? 'Folder' : node.kind === 'service' ? 'Service' : 'Grup layer';
    return '<details class="arcgis-tree-group" data-tree-key="' + escapeHtml(node.url || node.key || '') + '" data-depth="' + node.depth + '"' + open + '><summary><span class="arcgis-tree-summary-title">' + escapeHtml(node.name) + '</span><span class="arcgis-tree-meta">' + escapeHtml(label) + ' · ' + leafCount + ' layer</span></summary><div class="arcgis-tree-children">' + children.map(renderNode).join('') + '</div></details>';
  }

  function renderTree() {
    var tree = getElement('arcgisLayerTree');
    if (!tree || !state.root) return;
    var openKeys = {};
    var existingDetails = tree.querySelectorAll('details[data-tree-key]');
    Array.prototype.forEach.call(existingDetails, function (detail) {
      if (detail.open) openKeys[detail.getAttribute('data-tree-key')] = true;
    });
    state.leaves = [];
    tree.innerHTML = state.root.children && state.root.children.length ? state.root.children.map(renderNode).join('') : '<div class="arcgis-tree-empty">Tidak ada folder atau service ditemukan.</div>';
    var details = tree.querySelectorAll('details[data-tree-key]');
    Array.prototype.forEach.call(details, function (detail) {
      if (openKeys[detail.getAttribute('data-tree-key')]) detail.open = true;
    });
    updateSelection();
  }

  var ACTION_BUTTON_IDS = ['arcgisCountBtn', 'arcgisAddSelectedBtn'];

  function updateSelection() {
    var count = state.selected.size;
    var countElement = getElement('arcgisSelectionCount');
    if (countElement) countElement.textContent = count ? count + ' layer dipilih' : 'Belum ada layer dipilih';
    ACTION_BUTTON_IDS.forEach(function (id) {
      var button = getElement(id);
      if (button) button.disabled = count === 0;
    });
  }

  function setDiscoveryBusy(busy) {
    ['arcgisDiscoverBtn'].concat(ACTION_BUTTON_IDS).forEach(function (id) {
      var element = getElement(id);
      if (!element) return;
      if (id === 'arcgisDiscoverBtn') element.disabled = busy;
      else element.disabled = busy || state.selected.size === 0;
    });
    var cancelButton = getElement('arcgisCancelBtn');
    if (cancelButton) {
      cancelButton.style.display = busy ? '' : 'none';
      cancelButton.disabled = !busy;
    }
  }

  async function discoverNode(item, queue, runId) {
    if (runId !== state.run || state.cancelled) return;
    var node = item.node;
    if (state.visited[node.url]) return;
    state.visited[node.url] = true;
    if (node.kind === 'folder') {
      var data;
      try {
        data = await fetchJson(node.url);
      } catch (error) {
        if (runId === state.run && !state.cancelled) state.errors++;
        return;
      }
      if (runId !== state.run || state.cancelled) return;
      listFrom(data, 'folders').forEach(function (name) {
        if (state.folderCount >= MAX_FOLDERS || item.depth >= MAX_DEPTH) {
          state.truncated = true;
          return;
        }
        state.folderCount++;
        node.children.push(makeFolder(name, joinPath(node.url, name), item.depth + 1));
        queue.push({ node: node.children[node.children.length - 1], depth: item.depth + 1 });
      });
      listFrom(data, 'services').forEach(function (entry) {
        var service = makeServiceFromEntry(node.url, entry, item.depth + 1);
        if (!service || state.serviceCount >= MAX_SERVICES) {
          if (!service) return;
          state.truncated = true;
          return;
        }
        state.serviceCount++;
        node.children.push(service);
        queue.push({ node: service, depth: item.depth + 1 });
      });
      return;
    }
    if (node.kind === 'service') {
      if (node.type === 'MapServer' || node.type === 'FeatureServer') {
        var serviceData;
        try {
          serviceData = await fetchJson(node.url);
        } catch (error) {
          if (runId === state.run && !state.cancelled) state.errors++;
          node.children = [makeFallbackLeaf(node)];
          return;
        }
        if (runId !== state.run || state.cancelled) return;
        populateService(node, serviceData);
      } else {
        node.children = [makeFallbackLeaf(node)];
      }
    }
  }

  async function discoverAll(runId) {
    var queue = [{ node: state.root, depth: 0 }];
    while (queue.length) {
      if (runId !== state.run || state.cancelled) return;
      var batch = queue.splice(0, 4);
      await Promise.all(batch.map(function (item) {
        return discoverNode(item, queue, runId);
      }));
      renderTree();
      setProgress(state.folderCount + ' folder, ' + state.serviceCount + ' service ditemukan');
    }
  }

  async function discover() {
    var input = getElement('arcgisSourceUrl');
    if (!input || !input.value.trim()) {
      setStatus('Masukkan URL ArcGIS terlebih dahulu.', true);
      return;
    }
    var sourceUrl = input.value.trim();
    var runId = ++state.run;
    state.cancelled = false;
    state.root = null;
    state.leaves = [];
    state.selected.clear();
    state.visited = {};
    state.folderCount = 0;
    state.serviceCount = 0;
    state.truncated = false;
    state.errors = 0;
    setDiscoveryBusy(true);
    setStatus('Membaca folder ArcGIS REST…');
    setProgress('Menyiapkan discovery…');
    try {
      state.root = makeRootNode(sourceUrl);
      if (state.root.kind === 'service') state.serviceCount = 1;
      await discoverAll(runId);
      if (runId !== state.run) return;
      renderTree();
      var suffix = state.truncated ? ' Discovery dihentikan oleh batas safety.' : '';
      if (state.errors) suffix += ' ' + state.errors + ' folder/service gagal dibaca.';
      setStatus(state.serviceCount + ' service ditemukan.' + suffix, state.truncated || state.errors > 0);
      setProgress('');
    } catch (error) {
      if (runId === state.run) {
        setStatus(error && error.message ? error.message : String(error), true);
        setProgress('');
      }
    } finally {
      if (runId === state.run) setDiscoveryBusy(false);
    }
  }

  function cancelDiscovery() {
    state.cancelled = true;
    state.run++;
    setDiscoveryBusy(false);
    setStatus('Discovery dibatalkan.');
    setProgress('');
  }

  function isGeometryField(name) {
    return /^(shape|geometry|shape__.*|objectid_?\d*|shape_area|shape_length|shape_leng|shape_len|st_area\(.*\)|st_length\(.*\))$/i.test(String(name || ''));
  }

  function formatValue(value) {
    if (value == null || value === '') return '-';
    if (typeof value === 'number') return value.toLocaleString('id-ID', { maximumFractionDigits: 4 });
    if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
    return String(value);
  }

  function buildPopup(title, properties, source) {
    var rows = '';
    var fields = Object.keys(properties || {}).filter(function (key) {
      return !isGeometryField(key) && properties[key] !== null && properties[key] !== undefined && properties[key] !== '';
    }).slice(0, 60);
    fields.forEach(function (key) {
      rows += '<div class="arcgis-popup-row"><span>' + escapeHtml(key) + '</span><strong>' + escapeHtml(formatValue(properties[key])) + '</strong></div>';
    });
    if (!rows) rows = '<div class="arcgis-popup-row"><span>Atribut</span><strong>-</strong></div>';
    return '<div class="arcgis-popup"><div class="arcgis-popup-title">' + escapeHtml(title || 'ArcGIS REST') + '</div><div class="arcgis-popup-source">' + escapeHtml(source || '') + '</div><div class="arcgis-popup-body">' + rows + '</div></div>';
  }

  function openPopup(latlng, html) {
    var mapInstance = getMap();
    if (!mapInstance) return;
    L.popup({ maxWidth: 360, className: 'arcgis-leaflet-popup' }).setLatLng(latlng).setContent(html).openOn(mapInstance);
  }

  function identify(record, latlng) {
    var mapInstance = getMap();
    if (!mapInstance || !record.descriptor.serviceUrl) return Promise.resolve([]);
    var size = mapInstance.getSize();
    var bounds = mapInstance.getBounds();
    var geometry = JSON.stringify({ x: latlng.lng, y: latlng.lat, spatialReference: { wkid: 4326 } });
    var params = new URLSearchParams({
      geometry: geometry,
      geometryType: 'esriGeometryPoint',
      sr: '4326',
      layers: record.descriptor.layerId ? 'visible:' + record.descriptor.layerId : 'visible',
      tolerance: '5',
      mapExtent: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(','),
      imageDisplay: size.x + ',' + size.y + ',96',
      returnGeometry: 'false',
      f: 'json'
    });
    return fetchJson(record.descriptor.serviceUrl + '/identify?' + params.toString()).then(function (data) {
      return data && Array.isArray(data.results) ? data.results : [];
    }).catch(function () { return []; });
  }

  function esriGeometryToGeoJson(geometry) {
    if (!geometry) return null;
    if (Array.isArray(geometry.rings) && geometry.rings.length) {
      return { type: 'Polygon', coordinates: geometry.rings };
    }
    if (Array.isArray(geometry.paths) && geometry.paths.length) {
      if (Array.isArray(geometry.paths[0]) && typeof geometry.paths[0][0] === 'number') {
        return { type: 'LineString', coordinates: geometry.paths };
      }
      return { type: 'MultiLineString', coordinates: geometry.paths };
    }
    if (Array.isArray(geometry.points) && geometry.points.length) {
      return { type: 'MultiPoint', coordinates: geometry.points };
    }
    if (typeof geometry.x === 'number' && typeof geometry.y === 'number') {
      return { type: 'Point', coordinates: [geometry.x, geometry.y] };
    }
    return null;
  }

  function esriFeatureSetToGeoJson(data) {
    var features = Array.isArray(data && data.features) ? data.features : [];
    return {
      type: 'FeatureCollection',
      features: features.map(function (feature) {
        return {
          type: 'Feature',
          properties: feature && feature.attributes || {},
          geometry: esriGeometryToGeoJson(feature && feature.geometry)
        };
      })
    };
  }

  function featureQueryUrl(descriptor, format, offset, count, countOnly, paginated, bbox) {
    var url = new URL(descriptor.layerUrl + '/query');
    url.searchParams.set('where', '1=1');
    if (countOnly) {
      url.searchParams.set('outFields', '');
      url.searchParams.set('returnGeometry', 'false');
      url.searchParams.set('outSR', '');
    } else {
      url.searchParams.set('outFields', '*');
      url.searchParams.set('returnGeometry', 'true');
      url.searchParams.set('outSR', '4326');
    }
    url.searchParams.set('returnCountOnly', countOnly ? 'true' : 'false');
    if (bbox && bbox.length === 4) {
      url.searchParams.set('geometry', bbox.join(','));
      url.searchParams.set('geometryType', 'esriGeometryEnvelope');
      url.searchParams.set('inSR', '4326');
      url.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
    }
    if (paginated !== false) {
      url.searchParams.set('resultOffset', String(offset || 0));
      url.searchParams.set('resultRecordCount', String(count == null ? ATTRIBUTE_PAGE_SIZE : count));
    }
    url.searchParams.set('f', format || 'json');
    return url.toString();
  }

  function isPaginationError(error) {
    return /pagination|resultOffset|resultRecordCount|offset/i.test(String(error && error.message || ''));
  }

  function featureResponseToGeoJson(data) {
    if (data && data.type === 'FeatureCollection') return data;
    if (data && Array.isArray(data.features)) return esriFeatureSetToGeoJson(data);
    throw new Error('Respons feature ArcGIS tidak valid.');
  }

  function fetchFeaturePage(descriptor, offset, countOnly, paginated, bbox) {
    var url = featureQueryUrl(descriptor, 'json', offset, countOnly ? 0 : ATTRIBUTE_PAGE_SIZE, countOnly, paginated, bbox);
    return fetchJson(url, 'json').then(function (data) {
      if (data && data.error) {
        var error = new Error(data.error.message || 'ArcGIS query gagal');
        error.arcgis = data.error;
        throw error;
      }
      if (countOnly) return { count: Number(data && data.count) || 0 };
      var collection = featureResponseToGeoJson(data);
      return {
        features: collection.features || [],
        exceededTransferLimit: data && data.exceededTransferLimit === true
      };
    });
  }

  function fetchAllFeatureData(descriptor, onProgress) {
    return fetchFeaturePage(descriptor, 0, true, false).catch(function () {
      return { count: 0 };
    }).then(function (countData) {
      var total = countData.count || 0;
      function collect(offset, collected) {
        if (onProgress) onProgress(collected.length, total);
        if (total > 0 && collected.length >= total) {
          return { type: 'FeatureCollection', features: collected, total: total, paginationWarning: '' };
        }
        return fetchFeaturePage(descriptor, offset, false, true).then(function (page) {
          var pageFeatures = page.features || [];
          var merged = collected.concat(pageFeatures);
          var nextOffset = offset + pageFeatures.length;
          var hasMore = pageFeatures.length > 0 && (total > 0 ? merged.length < total : (page.exceededTransferLimit || pageFeatures.length >= ATTRIBUTE_PAGE_SIZE));
          if (!hasMore) {
            return { type: 'FeatureCollection', features: merged, total: total || merged.length, paginationWarning: '' };
          }
          return collect(nextOffset, merged);
        }).catch(function (error) {
          if (!isPaginationError(error)) throw error;
          return fetchFeaturePage(descriptor, 0, false, false).then(function (page) {
            return {
              type: 'FeatureCollection',
              features: page.features || [],
              total: total || (page.features || []).length,
              paginationWarning: 'Server tidak mendukung pagination; data mungkin tidak lengkap.'
            };
          });
        });
      }
      return collect(0, []);
    });
  }

  function fetchFeatureGeoJson(descriptor, onProgress) {
    return fetchAllFeatureData(descriptor, onProgress);
  }

  async function createFeatureLayer(descriptor) {
    if (typeof L === 'undefined' || !L.geoJSON) throw new Error('Pustaka Leaflet tidak tersedia.');
    var data = await fetchFeatureGeoJson(descriptor);
    descriptor.featureData = data;
    descriptor.featureTotal = data.paginationWarning ? data.features.length : (data.total || data.features.length);
    descriptor.featureCount = data.features.length;
    descriptor.paginationWarning = data.paginationWarning || '';
    return L.geoJSON(data, {
      style: function () {
        return { color: '#1d4ed8', weight: 1.5, opacity: 0.9, fillColor: '#60a5fa', fillOpacity: 0.18 };
      },
      onEachFeature: function (feature, layer) {
        layer.bindPopup(buildPopup(descriptor.name, feature.properties, descriptor.type), { maxWidth: 360, className: 'arcgis-leaflet-popup' });
      }
    });
  }

  function createDynamicLayer(descriptor) {
    if (!L.esri || !L.esri.dynamicMapLayer) throw new Error('Pustaka Esri Leaflet tidak tersedia.');
    return L.esri.dynamicMapLayer({
      url: descriptor.serviceUrl,
      layers: [descriptor.layerId],
      opacity: 0.82,
      f: 'image'
    });
  }

  function createImageLayer(descriptor) {
    if (!L.esri || !L.esri.imageMapLayer) throw new Error('Pustaka Esri Leaflet tidak tersedia.');
    return L.esri.imageMapLayer({
      url: descriptor.layerUrl,
      format: 'jpgpng',
      transparent: true,
      opacity: 0.82
    });
  }

  function createVectorTileLayer(descriptor) {
    if (!L.esri || !L.esri.vectorTileLayer) throw new Error('VectorTileServer belum didukung oleh pustaka Esri Leaflet.');
    var layer = L.esri.vectorTileLayer(descriptor.serviceUrl, { opacity: 0.82 });
    layer.on('click', function (event) {
      var properties = event && event.properties || event && event.feature && event.feature.properties || {};
      openPopup(event.latlng, buildPopup(descriptor.name, properties, descriptor.type));
    });
    return layer;
  }

  async function addLayer(descriptor) {
    var mapInstance = getMap();
    if (!mapInstance) throw new Error('Peta belum siap.');
    if (state.active[descriptor.key]) throw new Error('Layer sudah aktif.');
    var layer;
    if (descriptor.renderMode === 'dynamic') layer = createDynamicLayer(descriptor);
    else if (descriptor.renderMode === 'image') layer = createImageLayer(descriptor);
    else if (descriptor.renderMode === 'vector') layer = createVectorTileLayer(descriptor);
    else layer = await createFeatureLayer(descriptor);
    if (!layer) throw new Error('Layer tidak dapat dibuat.');
    var record = { descriptor: descriptor, layer: layer, clickHandler: null };
    layer.on('error', function (error) {
      var message = error && error.error && error.error.message || error && error.message || 'layanan ArcGIS';
      setStatus('Gagal memuat ' + descriptor.name + ': ' + message, true);
    });
    if (descriptor.renderMode === 'dynamic' || descriptor.renderMode === 'image') {
      record.clickHandler = function (event) {
        identify(record, event.latlng).then(function (results) {
          if (!results.length) return;
          var result = results[0];
          openPopup(event.latlng, buildPopup(result.layerName || descriptor.name, result.attributes || {}, descriptor.type));
        });
      };
      mapInstance.on('click', record.clickHandler);
    }
    layer.addTo(mapInstance);
    if (typeof layer.getBounds === 'function') {
      var bounds = layer.getBounds();
      if (bounds && bounds.isValid()) mapInstance.fitBounds(bounds.pad(0.1), { maxZoom: 17 });
    }
    state.active[descriptor.key] = record;
    state.attributeKey = descriptor.key;
    if (descriptor.featureCount === 0) setStatus('Layer ' + descriptor.name + ' tidak memiliki fitur pada area saat ini.', true);
    renderActiveLayers();
  }

  function removeLayer(key) {
    var record = state.active[key];
    if (!record) return;
    var mapInstance = getMap();
    if (mapInstance) {
      if (record.clickHandler) mapInstance.off('click', record.clickHandler);
      if (mapInstance.hasLayer(record.layer)) mapInstance.removeLayer(record.layer);
    }
    delete state.active[key];
    delete state.attributePageByKey[key];
    renderActiveLayers();
  }

  function clearDynamicLayers() {
    Object.keys(state.active).forEach(removeLayer);
    renderActiveLayers();
  }

  function setAttributeStatus(message, isError) {
    var element = getElement('arcgisAttributeStatus');
    if (!element) return;
    element.textContent = message || '';
    element.style.color = isError ? '#b91c1c' : '#52728a';
    element.style.display = message ? '' : 'none';
  }

  function attributeEligible(record) {
    var descriptor = record && record.descriptor;
    return !!(descriptor && (descriptor.featureData || descriptor.renderMode === 'feature' || descriptor.renderMode === 'dynamic'));
  }

  function attributeFeatures(record) {
    var data = record && record.descriptor && record.descriptor.featureData;
    return data && Array.isArray(data.features) ? data.features : [];
  }

  function renderAttributeTable(record) {
    var table = getElement('arcgisAttributeTable');
    if (!table || !record) return;
    var descriptor = record.descriptor;
    var features = attributeFeatures(record);
    var total = descriptor.featureTotal || features.length;
    var totalPages = Math.max(1, Math.ceil(total / ATTRIBUTE_PAGE_SIZE));
    var page = Number(state.attributePageByKey[descriptor.key]) || 1;
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;
    state.attributePageByKey[descriptor.key] = page;
    var start = (page - 1) * ATTRIBUTE_PAGE_SIZE;
    var visibleFeatures = features.slice(start, start + ATTRIBUTE_PAGE_SIZE);
    var fields = [];
    var fieldSet = {};
    features.forEach(function (feature) {
      var properties = feature && feature.properties || {};
      Object.keys(properties).forEach(function (field) {
        if (!fieldSet[field]) {
          fieldSet[field] = true;
          fields.push(field);
        }
      });
    });
    fields = fields.slice(0, 20);
    if (!fields.length) {
      table.innerHTML = '<div class="arcgis-attribute-empty">Tidak ada field atribut pada layer ini.</div>';
      setAttributeStatus(features.length ? 'Layer tidak memiliki field atribut.' : 'Tidak ada fitur pada layer ini.', !features.length);
      return;
    }
    var html = '<div class="arcgis-attribute-scroll"><table><thead><tr>';
    fields.forEach(function (field) { html += '<th>' + escapeHtml(field) + '</th>'; });
    html += '</tr></thead><tbody>';
    visibleFeatures.forEach(function (feature) {
      var properties = feature && feature.properties || {};
      html += '<tr>';
      fields.forEach(function (field) { html += '<td title="' + escapeHtml(formatValue(properties[field])) + '">' + escapeHtml(formatValue(properties[field])) + '</td>'; });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    if (totalPages > 1) {
      html += '<div class="arcgis-attribute-pagination">';
      html += '<button type="button" data-arcgis-attribute-page="prev"' + (page <= 1 ? ' disabled' : '') + '>‹</button>';
      html += '<span>Halaman ' + page + ' / ' + totalPages + '</span>';
      html += '<button type="button" data-arcgis-attribute-page="next"' + (page >= totalPages ? ' disabled' : '') + '>›</button>';
      html += '</div>';
    }
    table.innerHTML = html;
    setAttributeStatus('Menampilkan ' + (start + 1) + '–' + (start + visibleFeatures.length) + ' dari ' + total + ' fitur · ' + descriptor.name + (descriptor.paginationWarning ? ' · ' + descriptor.paginationWarning : ''));
    table.querySelectorAll('[data-arcgis-attribute-page]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (button.dataset.arcgisAttributePage === 'prev' && page > 1) page--;
        if (button.dataset.arcgisAttributePage === 'next' && page < totalPages) page++;
        state.attributePageByKey[descriptor.key] = page;
        renderAttributeTable(record);
      });
    });
  }

  function loadAttributeTable(record) {
    if (!record || !attributeEligible(record)) return;
    var descriptor = record.descriptor;
    var requestId = ++state.attributeRequest;
    state.attributeKey = descriptor.key;
    var table = getElement('arcgisAttributeTable');
    if (descriptor.featureData) {
      if (table) table.setAttribute('data-loaded-key', descriptor.key);
      renderAttributeTable(record);
      return;
    }
    setAttributeStatus('Memuat atribut ' + descriptor.name + '…');
    if (table) {
      table.setAttribute('data-loaded-key', descriptor.key);
      table.innerHTML = '<div class="arcgis-attribute-loading"><span class="arcgis-attribute-spinner"></span>Memuat data atribut…</div>';
    }
    fetchFeatureGeoJson(descriptor, function (loaded, total) {
      if (requestId !== state.attributeRequest || state.attributeKey !== descriptor.key) return;
      setAttributeStatus('Memuat ' + loaded.toLocaleString('id-ID') + (total ? ' / ' + total.toLocaleString('id-ID') : '') + ' fitur…');
    }).then(function (data) {
      if (requestId !== state.attributeRequest || state.attributeKey !== descriptor.key) return;
      descriptor.featureData = data;
      descriptor.featureTotal = data.paginationWarning ? data.features.length : (data.total || data.features.length);
      descriptor.featureCount = data.features.length;
      descriptor.paginationWarning = data.paginationWarning || '';
      state.attributePageByKey[descriptor.key] = 1;
      renderAttributeTable(record);
    }).catch(function (error) {
      if (requestId !== state.attributeRequest || state.attributeKey !== descriptor.key) return;
      if (table) table.innerHTML = '<div class="arcgis-attribute-empty">Gagal memuat atribut layer.</div>';
      setAttributeStatus(error && error.message ? error.message : 'Gagal memuat atribut layer.', true);
    });
  }

  function renderAttributePanel() {
    var panel = getElement('arcgisAttributePanel');
    if (!panel) return;
    var records = Object.keys(state.active).map(function (key) { return state.active[key]; }).filter(attributeEligible);
    if (!records.length) {
      panel.hidden = true;
      state.attributeKey = null;
      state.attributeRequest++;
      return;
    }
    panel.hidden = false;
    var select = getElement('arcgisAttributeLayerSelect');
    if (select) {
      select.innerHTML = '';
      records.forEach(function (record) {
        var option = document.createElement('option');
        option.value = record.descriptor.key;
        option.textContent = record.descriptor.name;
        select.appendChild(option);
      });
      if (!records.some(function (record) { return record.descriptor.key === state.attributeKey; })) {
        state.attributeKey = records[records.length - 1].descriptor.key;
      }
      select.value = state.attributeKey;
    }
    var currentRecord = state.active[state.attributeKey];
    if (!currentRecord || !attributeEligible(currentRecord)) {
      state.attributeKey = records[records.length - 1].descriptor.key;
      currentRecord = records[records.length - 1];
    }
    if (!state.attributePageByKey[state.attributeKey]) state.attributePageByKey[state.attributeKey] = 1;
    var table = getElement('arcgisAttributeTable');
    if (table && table.getAttribute('data-loaded-key') !== state.attributeKey) loadAttributeTable(currentRecord);
  }

  function renderActiveLayers() {
    if (typeof window.renderAlatLayerList === 'function') window.renderAlatLayerList();
    renderAttributePanel();
  }

  function currentBbox() {
    var mapInstance = getMap();
    if (!mapInstance) return null;
    var bounds = mapInstance.getBounds();
    if (!bounds || !bounds.isValid()) return null;
    return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
  }

  function countFeatures(descriptor, bbox) {
    return fetchFeaturePage(descriptor, 0, true, false, bbox).then(function (data) {
      return data.count || 0;
    });
  }

  async function countSelected() {
    var tree = getElement('arcgisLayerTree');
    if (!tree) return;
    var inputs = tree.querySelectorAll('input[data-arcgis-leaf]:checked');
    if (!inputs.length) {
      setStatus('Pilih minimal satu layer.', true);
      return;
    }
    var countButton = getElement('arcgisCountBtn');
    var buttonText = countButton ? countButton.textContent : '';
    if (countButton) {
      countButton.disabled = true;
      countButton.classList.add('is-loading');
      countButton.textContent = 'Menghitung…';
    }
    setStatus('Menghitung jumlah fitur…');
    setProgress('0/' + inputs.length + ' layer dihitung');
    var done = 0;
    var failed = 0;
    var summaries = [];
    try {
      for (var index = 0; index < inputs.length; index++) {
        var descriptor = state.leaves[Number(inputs[index].getAttribute('data-arcgis-leaf'))];
        if (!descriptor) continue;
        setProgress('Menghitung ' + (index + 1) + '/' + inputs.length + ' · ' + descriptor.name);
        setStatus('Menghitung fitur ' + descriptor.name + '…');
        try {
          if (!descriptor.layerId) throw new Error('Service tanpa sublayer, tidak bisa dihitung');
          var bbox = descriptor.renderMode === 'feature' ? currentBbox() : null;
          var viewportCount = await countFeatures(descriptor, bbox);
          var layerCount = viewportCount;
          if (bbox) layerCount = await countFeatures(descriptor, null);
          descriptor.featureCount = viewportCount;
          descriptor.featureTotal = layerCount;
          done++;
          summaries.push(descriptor.name + ': ' + (bbox
            ? viewportCount.toLocaleString('id-ID') + ' di area pandang · ' + layerCount.toLocaleString('id-ID') + ' total'
            : layerCount.toLocaleString('id-ID') + ' fitur'));
        } catch (error) {
          failed++;
          summaries.push(descriptor.name + ': ' + (error && error.message ? error.message : String(error)));
        }
      }
    } finally {
      if (countButton) {
        countButton.classList.remove('is-loading');
        countButton.textContent = buttonText;
      }
      setProgress('');
      updateSelection();
    }
    setStatus(summaries.join(' · ') || 'Tidak ada layer dihitung.', failed > 0);
    if (done) console.log('[ArcGIS] hitung fitur:', summaries);
  }

  async function addSelected() {
    var tree = getElement('arcgisLayerTree');
    if (!tree) return;
    var inputs = tree.querySelectorAll('input[data-arcgis-leaf]:checked');
    if (!inputs.length) {
      setStatus('Pilih minimal satu layer.', true);
      return;
    }
    var addButton = getElement('arcgisAddSelectedBtn');
    var buttonText = addButton ? addButton.textContent : '';
    if (addButton) {
      addButton.disabled = true;
      addButton.classList.add('is-loading');
      addButton.textContent = 'Memuat layer…';
    }
    setStatus('Menyiapkan layer ArcGIS…');
    setProgress('0/' + inputs.length + ' layer siap');
    var added = 0;
    var failed = 0;
    try {
      for (var index = 0; index < inputs.length; index++) {
        var input = inputs[index];
        var descriptor = state.leaves[Number(input.getAttribute('data-arcgis-leaf'))];
        if (!descriptor) continue;
        setProgress('Memuat ' + (index + 1) + '/' + inputs.length + ' · ' + descriptor.name);
        setStatus('Memuat ' + descriptor.name + '…');
        try {
          await addLayer(descriptor);
          added++;
        } catch (error) {
          failed++;
          setStatus(error && error.message ? error.message : String(error), true);
        }
      }
    } finally {
      if (addButton) {
        addButton.classList.remove('is-loading');
        addButton.textContent = buttonText;
      }
      setProgress('');
      updateSelection();
    }
    if (added) setStatus(added + ' layer ditambahkan ke peta.' + (failed ? ' ' + failed + ' layer gagal.' : ''), failed > 0);
  }

  function bindEvents() {
    var discoverButton = getElement('arcgisDiscoverBtn');
    var cancelButton = getElement('arcgisCancelBtn');
    var addButton = getElement('arcgisAddSelectedBtn');
    var countButton = getElement('arcgisCountBtn');
    var attributeSelect = getElement('arcgisAttributeLayerSelect');
    var tree = getElement('arcgisLayerTree');
    if (discoverButton) discoverButton.addEventListener('click', discover);
    if (cancelButton) cancelButton.addEventListener('click', cancelDiscovery);
    if (addButton) addButton.addEventListener('click', addSelected);
    if (countButton) countButton.addEventListener('click', countSelected);
    if (attributeSelect) {
      attributeSelect.addEventListener('change', function () {
        var record = state.active[this.value];
        if (record) loadAttributeTable(record);
      });
    }
    if (tree) {
      tree.addEventListener('click', function (event) {
        event.stopPropagation();
      });
      tree.addEventListener('change', function (event) {
        var input = event.target.closest('input[data-arcgis-leaf]');
        if (!input) return;
        var descriptor = state.leaves[Number(input.getAttribute('data-arcgis-leaf'))];
        if (!descriptor) return;
        if (input.checked) state.selected.add(descriptor.key);
        else state.selected.delete(descriptor.key);
        updateSelection();
      });
    }
    renderActiveLayers();
  }

  function init() {
    bindEvents();
  }

  window.ArcGISRestSourceManager = {
    discover: discover,
    addSelected: addSelected,
    countSelected: countSelected,
    remove: removeLayer,
    clear: clearDynamicLayers,
    getActive: function () { return state.active; }
  };
  window.discoverArcGISRestSource = discover;
  window.clearArcGISRestLayers = clearDynamicLayers;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
