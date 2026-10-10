(function () {
  'use strict';

  var PROXY_PREFIX = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';
  var MAX_DEPTH = 8;
  var MAX_FOLDERS = 2000;
  var MAX_SERVICES = 4000;
  var DISCOVERY_CONCURRENCY = 8;
  var ATTRIBUTE_PAGE_SIZE = 100;
  var state = {
    root: null,
    leaves: [],
    selected: new Set(),
    active: {},
    serviceNodes: {},
    folderNodes: {},
    attributeKey: null,
    attributeRequest: 0,
    attributePageByKey: {},
    attributeFilterByKey: {},
    highlightedFeature: null,
    visited: {},
    run: 0,
    cancelled: false,
    folderCount: 0,
    serviceCount: 0,
    truncated: false,
    errors: 0,
    discoveryBusy: false
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

  function setCountStatus(message, isError) {
    var element = getElement('arcgisCountStatus');
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
    function fetchWithTimeout(url, timeoutMs) {
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      var timeout = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;
      return fetch(url, controller ? { signal: controller.signal } : undefined)
        .then(readJsonResponse)
        .finally(function () { if (timeout) clearTimeout(timeout); });
    }
    return fetchWithTimeout(requestUrl, 8000).catch(function (directError) {
      if (directError && directError.arcgis) throw directError;
      return fetchWithTimeout(PROXY_PREFIX + encodeURIComponent(requestUrl), 12000).catch(function (proxyError) {
        if (proxyError && proxyError.arcgis) throw proxyError;
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
      metadataError: service.metadataError || '',
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
    // ArcGIS may expose queryable records under `tables` instead of `layers`
    // (for example, a table-only FeatureServer). Tables also have numeric IDs
    // and use the same /{id}/query endpoint, so include them in the tree.
    var layers = metadata && Array.isArray(metadata.layers) ? metadata.layers.slice() : [];
    var tables = metadata && Array.isArray(metadata.tables) ? metadata.tables : [];
    tables.forEach(function (table) {
      if (table && !layers.some(function (layer) { return layer && String(layer.id) === String(table.id); })) layers.push(table);
    });
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
    var serviceName = String(info.name || '').replace(/^\/+|\/+$/g, '');
    var serviceBase = parentUrl;
    // Some ArcGIS folder listings return a fully qualified service name
    // (for example "Peta_Jakarta/Jembatan") even when queried inside that
    // folder. Match the downloader reference: resolve qualified names from
    // the services catalog root so the current folder is not duplicated.
    if (serviceName.indexOf('/') !== -1) {
      var parsedParent = new URL(parentUrl);
      var catalogMatch = parsedParent.pathname.match(/^(.*\/rest\/services)(?:\/|$)/i);
      if (catalogMatch) {
        parsedParent.pathname = catalogMatch[1];
        parsedParent.search = '';
        parsedParent.hash = '';
        serviceBase = parsedParent.toString().replace(/\/$/, '');
      }
    }
    return makeService(serviceName, info.type, joinPath(serviceBase, serviceName, info.type), depth);
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
    // Folder contents are loaded only after the user opens that folder.
    var open = '';
    var label = node.kind === 'folder' ? 'Folder' : node.kind === 'service' ? 'Service' : 'Grup layer';
    var childMarkup = children.map(renderNode).join('');
    if (!childMarkup && node.loading) childMarkup = '<div class="arcgis-tree-loading arcgis-tree-loading--inline"><span class="arcgis-tree-spinner" aria-hidden="true"></span><span>Memuat isi ' + escapeHtml(label.toLowerCase()) + '…</span></div>';
    else if (!childMarkup && node.kind === 'service' && !node.metadataLoaded) childMarkup = '<div class="arcgis-tree-empty">Buka service untuk memuat daftar sublayer.</div>';
    return '<details class="arcgis-tree-group" data-tree-key="' + escapeHtml(node.url || node.key || '') + '" data-tree-kind="' + escapeHtml(node.kind) + '" data-depth="' + node.depth + '"' + open + '><summary><span class="arcgis-tree-summary-title">' + escapeHtml(node.name) + '</span><span class="arcgis-tree-meta">' + escapeHtml(label) + ' · ' + leafCount + ' layer</span></summary><div class="arcgis-tree-children">' + childMarkup + '</div></details>';
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
    var rootNodes = state.root.kind === 'service' ? [state.root] : state.root.children;
    if (rootNodes && rootNodes.length) {
      tree.innerHTML = rootNodes.map(renderNode).join('');
    } else if (tree.getAttribute('aria-busy') === 'true') {
      tree.innerHTML = '<div class="arcgis-tree-loading"><span class="arcgis-tree-spinner" aria-hidden="true"></span><span>Memuat folder dan layer…</span></div>';
    } else {
      tree.innerHTML = '<div class="arcgis-tree-empty">Tidak ada folder atau service ditemukan.</div>';
    }
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
      if (button) button.disabled = state.discoveryBusy || count === 0;
    });
  }

  function setDiscoveryBusy(busy) {
    state.discoveryBusy = busy;
    ['arcgisDiscoverBtn'].concat(ACTION_BUTTON_IDS).forEach(function (id) {
      var element = getElement(id);
      if (!element) return;
      if (id === 'arcgisDiscoverBtn') {
        element.disabled = busy;
        element.setAttribute('aria-busy', busy ? 'true' : 'false');
        element.classList.toggle('is-loading', busy);
        element.textContent = busy ? 'Mencari folder dan layer…' : 'Cari folder dan layer';
      }
      else element.disabled = busy || state.selected.size === 0;
    });
    var cancelButton = getElement('arcgisCancelBtn');
    if (cancelButton) {
      cancelButton.style.display = busy ? '' : 'none';
      cancelButton.disabled = !busy;
    }
    updateSelection();
  }

  async function discoverNode(item, queue, runId) {
    if (runId !== state.run || state.cancelled) return;
    var node = item.node;
    if (state.visited[node.url]) return;
    state.visited[node.url] = true;
    node.loading = true;
    if (node.kind === 'folder') {
      var data;
      try {
        data = await fetchJson(node.url);
      } catch (error) {
        if (runId === state.run && !state.cancelled) state.errors++;
        node.loading = false;
        delete state.visited[node.url];
        return;
      }
      if (runId !== state.run || state.cancelled) return;
      listFrom(data, 'folders').forEach(function (name) {
        if (state.folderCount >= MAX_FOLDERS || item.depth >= MAX_DEPTH) {
          state.truncated = true;
          return;
        }
        state.folderCount++;
        var folder = makeFolder(name, joinPath(node.url, name), item.depth + 1);
        node.children.push(folder);
        state.folderNodes[folder.url] = folder;
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
        state.serviceNodes[service.url] = service;
      });
      node.loading = false;
      node.childrenFetched = true;
      return;
    }
    if (node.kind === 'service') {
      if (node.type === 'MapServer' || node.type === 'FeatureServer') {
        node.metadataLoaded = false;
        node.children = [];
      } else {
        node.children = [makeFallbackLeaf(node)];
      }
      node.loading = false;
    }
  }

  async function loadServiceMetadata(node) {
    if (!node || node.metadataLoaded || node.metadataLoading || state.cancelled) return;
    node.metadataLoading = true;
    node.loading = true;
    var runId = state.run;
    renderTree();
    try {
      var metadata = await fetchJson(node.url);
      if (runId !== state.run || state.cancelled || state.serviceNodes[node.url] !== node) return;
      populateService(node, metadata);
      node.metadataLoaded = true;
    } catch (error) {
      if (runId !== state.run || state.cancelled || state.serviceNodes[node.url] !== node) return;
      state.errors++;
      node.metadataError = error && error.message ? error.message : String(error);
      node.children = [makeFallbackLeaf(node)];
      node.metadataLoaded = true;
      setStatus('Sublayer ' + node.name + ' gagal dibaca: ' + node.metadataError, true);
    } finally {
      if (runId === state.run && !state.cancelled && state.serviceNodes[node.url] === node) {
        node.metadataLoading = false;
        node.loading = false;
        renderTree();
      }
    }
  }

  async function loadFolderContents(node) {
    if (!node || node.childrenFetched || node.loading || state.cancelled) return;
    if (node.depth >= MAX_DEPTH) {
      setStatus('Batas kedalaman folder (' + MAX_DEPTH + ') tercapai.', true);
      return;
    }
    node.loading = true;
    var runId = state.run;
    renderTree();
    try {
      await discoverNode({ node: node, depth: node.depth }, [], runId);
      if (runId !== state.run || state.cancelled) return;
      renderTree();
      if (node.childrenFetched) {
        setStatus('Folder ' + node.name + ' dimuat.');
      } else {
        setStatus('Folder ' + node.name + ' gagal dimuat. Periksa akses atau koneksi server.', true);
      }
    } catch (error) {
      if (runId === state.run && !state.cancelled) {
        node.loading = false;
        state.errors++;
        renderTree();
        setStatus('Folder ' + node.name + ' gagal dimuat: ' + (error.message || String(error)), true);
      }
    }
  }

  async function discoverAll(runId) {
    var queue = [{ node: state.root, depth: 0 }];
    while (queue.length) {
      if (runId !== state.run || state.cancelled) return;
      var batch = queue.splice(0, DISCOVERY_CONCURRENCY);
      await Promise.all(batch.map(function (item) {
        return discoverNode(item, queue, runId);
      }));
      if (runId === state.run && !state.cancelled) renderTree();
      setProgress(state.folderCount + ' folder dan ' + state.serviceCount + ' service dimuat pada tingkat ini');
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
    state.serviceNodes = {};
    state.folderNodes = {};
    state.leaves = [];
    state.selected.clear();
    state.visited = {};
    state.folderCount = 0;
    state.serviceCount = 0;
    state.truncated = false;
    state.errors = 0;
    setDiscoveryBusy(true);
    setStatus('Membaca folder ArcGIS REST…');
    setProgress('Memuat struktur folder dan layer…');
    var tree = getElement('arcgisLayerTree');
    if (tree) {
      tree.setAttribute('aria-busy', 'true');
      tree.innerHTML = '<div class="arcgis-tree-loading"><span class="arcgis-tree-spinner" aria-hidden="true"></span><span>Menghubungkan ke ArcGIS REST…</span></div>';
    }
    try {
      state.root = makeRootNode(sourceUrl);
      if (state.root.kind === 'folder') state.folderNodes[state.root.url] = state.root;
      if (state.root.kind === 'service') {
        state.serviceCount = 1;
        state.serviceNodes[state.root.url] = state.root;
      }
      renderTree();
      await discoverAll(runId);
      if (runId !== state.run) return;
      renderTree();
      var suffix = state.truncated ? ' Discovery dihentikan oleh batas safety.' : '';
      if (state.errors) suffix += ' ' + state.errors + ' folder/service gagal dibaca.';
      var expandHint = state.root.kind === 'service' ? 'Buka service untuk memuat sublayer.' : 'Buka folder untuk memuat isinya.';
      setStatus(state.folderCount + ' folder dan ' + state.serviceCount + ' service terlihat. ' + expandHint + suffix, state.truncated || state.errors > 0);
      setProgress('');
      if (tree) tree.removeAttribute('aria-busy');
    } catch (error) {
      if (runId === state.run) {
        setStatus(error && error.message ? error.message : String(error), true);
        setProgress('');
        if (tree) {
          tree.removeAttribute('aria-busy');
          tree.innerHTML = '<div class="arcgis-tree-empty">Pencarian gagal. Periksa URL dan coba lagi.</div>';
        }
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
    var tree = getElement('arcgisLayerTree');
    if (tree) {
      tree.removeAttribute('aria-busy');
      if (!state.root || !state.root.children.length) tree.innerHTML = '<div class="arcgis-tree-empty">Pencarian dibatalkan.</div>';
    }
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
      returnGeometry: 'true',
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

  function highlightArcGisFeature(parentLayer, featureLayer) {
    if (!featureLayer || typeof featureLayer.setStyle !== 'function') return;
    var previous = state.highlightedFeature;
    if (previous && previous.temporary) {
      var mapInstance = getMap();
      if (mapInstance && mapInstance.hasLayer(previous.layer)) mapInstance.removeLayer(previous.layer);
    } else if (previous && previous.featureLayer !== featureLayer && previous.parentLayer && typeof previous.parentLayer.resetStyle === 'function') {
      previous.parentLayer.resetStyle(previous.featureLayer);
    }
    state.highlightedFeature = { parentLayer: parentLayer, featureLayer: featureLayer };
    featureLayer.setStyle({ color: '#facc15', weight: 4, opacity: 1, fillColor: '#facc15', fillOpacity: 0.42 });
    if (typeof featureLayer.bringToFront === 'function') featureLayer.bringToFront();
  }

  function highlightIdentifyResult(result, sourceKey) {
    var geometry = esriGeometryToGeoJson(result && result.geometry);
    if (!geometry) return null;
    return highlightGeoJsonFeature({ type: 'Feature', properties: {}, geometry: geometry }, sourceKey);
  }

  function highlightGeoJsonFeature(feature, sourceKey) {
    var mapInstance = getMap();
    if (!feature || !feature.geometry || !mapInstance || typeof L === 'undefined' || !L.geoJSON) return null;
    var previous = state.highlightedFeature;
    if (previous && previous.temporary && mapInstance.hasLayer(previous.layer)) mapInstance.removeLayer(previous.layer);
    else if (previous && previous.parentLayer && typeof previous.parentLayer.resetStyle === 'function') previous.parentLayer.resetStyle(previous.featureLayer);
    var layer = L.geoJSON(feature, {
      style: { color: '#facc15', weight: 4, opacity: 1, fillColor: '#facc15', fillOpacity: 0.42 }
    }).addTo(mapInstance);
    state.highlightedFeature = { temporary: true, layer: layer, sourceKey: sourceKey || '' };
    if (typeof layer.bringToFront === 'function') layer.bringToFront();
    return layer;
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
    descriptor.featureLayers = [];
    var featureLayer = L.geoJSON(data, {
      style: function () {
        return { color: '#1d4ed8', weight: 1.5, opacity: 0.9, fillColor: '#60a5fa', fillOpacity: 0.18 };
      },
      onEachFeature: function (feature, layer) {
        descriptor.featureLayers.push(layer);
        layer.bindPopup(buildPopup(descriptor.name, feature.properties, descriptor.type), { maxWidth: 360, className: 'arcgis-leaflet-popup' });
        layer.on('click', function () { highlightArcGisFeature(featureLayer, layer); });
      }
    });
    return featureLayer;
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
          highlightIdentifyResult(result, descriptor.key);
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
      if (state.highlightedFeature && (state.highlightedFeature.parentLayer === record.layer || state.highlightedFeature.sourceKey === key)) {
        if (state.highlightedFeature.temporary && mapInstance && mapInstance.hasLayer(state.highlightedFeature.layer)) mapInstance.removeLayer(state.highlightedFeature.layer);
        state.highlightedFeature = null;
      }
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
    var filter = state.attributeFilterByKey[descriptor.key] || { field: '*', query: '' };
    state.attributeFilterByKey[descriptor.key] = filter;
    var focusedSearch = document.activeElement && document.activeElement.classList.contains('arcgis-attribute-search');
    var caret = focusedSearch ? document.activeElement.selectionStart : null;
    var fields = [];
    var fieldSet = {};
    features.forEach(function (feature) {
      Object.keys(feature && feature.properties || {}).forEach(function (field) {
        if (!isGeometryField(field) && !fieldSet[field]) { fieldSet[field] = true; fields.push(field); }
      });
    });
    var query = String(filter.query || '').trim().toLocaleLowerCase('id-ID');
    var rows = features.map(function (feature, index) { return { feature: feature, index: index }; }).filter(function (row) {
      if (!query) return true;
      var props = row.feature && row.feature.properties || {};
      var values = filter.field === '*' ? Object.keys(props).map(function (key) { return props[key]; }) : [props[filter.field]];
      return values.some(function (value) { return value != null && String(value).toLocaleLowerCase('id-ID').indexOf(query) !== -1; });
    });
    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / ATTRIBUTE_PAGE_SIZE));
    var page = Number(state.attributePageByKey[descriptor.key]) || 1;
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;
    state.attributePageByKey[descriptor.key] = page;
    var start = (page - 1) * ATTRIBUTE_PAGE_SIZE;
    var visibleRows = rows.slice(start, start + ATTRIBUTE_PAGE_SIZE);
    var html = '<div class="arcgis-attribute-tools"><label><span>Filter field</span><select class="arcgis-attribute-filter-field" aria-label="Pilih kolom untuk difilter"><option value="*">Semua kolom</option>';
    fields.forEach(function (field) {
      html += '<option value="' + escapeHtml(field) + '"' + (filter.field === field ? ' selected' : '') + '>' + escapeHtml(field) + '</option>';
    });
    html += '</select></label><input class="arcgis-attribute-search" type="search" value="' + escapeHtml(filter.query || '') + '" placeholder="Cari nilai atribut..." aria-label="Cari nilai atribut"></div>';
    if (!fields.length) {
      html += '<div class="arcgis-attribute-empty">Tidak ada field atribut pada layer ini.</div>';
      table.innerHTML = html;
      setAttributeStatus(features.length ? 'Layer tidak memiliki field atribut.' : 'Tidak ada fitur pada layer ini.', !features.length);
      bindAttributeFilters(table, record);
      return;
    }
    if (!rows.length) {
      html += '<div class="arcgis-attribute-empty">Tidak ada baris yang cocok dengan filter.</div>';
      table.innerHTML = html;
      setAttributeStatus('0 dari ' + features.length.toLocaleString('id-ID') + ' fitur cocok · ' + descriptor.name);
      bindAttributeFilters(table, record);
      return;
    }
    var visibleFields = fields.slice(0, 20);
    html += '<div class="arcgis-attribute-scroll"><table><thead><tr>';
    visibleFields.forEach(function (field) { html += '<th>' + escapeHtml(field) + '</th>'; });
    html += '</tr></thead><tbody>';
    visibleRows.forEach(function (row) {
      var props = row.feature && row.feature.properties || {};
      html += '<tr data-arcgis-feature-index="' + row.index + '" tabindex="0" title="Klik untuk menyorot fitur pada peta">';
      visibleFields.forEach(function (field) { html += '<td title="' + escapeHtml(formatValue(props[field])) + '">' + escapeHtml(formatValue(props[field])) + '</td>'; });
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
    setAttributeStatus('Menampilkan ' + (start + 1) + '–' + (start + visibleRows.length) + ' dari ' + total + ' fitur cocok · ' + descriptor.name + (descriptor.paginationWarning ? ' · ' + descriptor.paginationWarning : ''));
    bindAttributeFilters(table, record);
    table.querySelectorAll('[data-arcgis-attribute-page]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (button.dataset.arcgisAttributePage === 'prev' && page > 1) page--;
        if (button.dataset.arcgisAttributePage === 'next' && page < totalPages) page++;
        state.attributePageByKey[descriptor.key] = page;
        renderAttributeTable(record);
      });
    });
    table.querySelectorAll('tr[data-arcgis-feature-index]').forEach(function (row) {
      function focusFeature() {
        var index = Number(row.getAttribute('data-arcgis-feature-index'));
        var featureLayer = descriptor.featureLayers && descriptor.featureLayers[index];
        var mapInstance = getMap();
        if (!featureLayer) {
          var overlay = highlightGeoJsonFeature(features[index], descriptor.key);
          if (!overlay || !mapInstance) return;
          var overlayBounds = overlay.getBounds();
          if (overlayBounds && overlayBounds.isValid()) mapInstance.fitBounds(overlayBounds.pad(0.1), { maxZoom: 17 });
          return;
        }
        highlightArcGisFeature(record.layer, featureLayer);
        if (mapInstance && typeof featureLayer.getBounds === 'function') {
          var bounds = featureLayer.getBounds();
          if (bounds && bounds.isValid()) mapInstance.fitBounds(bounds.pad(0.1), { maxZoom: 17 });
        } else if (mapInstance && typeof featureLayer.getLatLng === 'function') {
          mapInstance.setView(featureLayer.getLatLng(), Math.max(mapInstance.getZoom(), 15));
        }
        if (typeof featureLayer.openPopup === 'function') featureLayer.openPopup();
      }
      row.addEventListener('click', focusFeature);
      row.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focusFeature(); }
      });
    });
    if (focusedSearch) {
      var searchInput = table.querySelector('.arcgis-attribute-search');
      if (searchInput) { searchInput.focus(); if (caret != null) searchInput.setSelectionRange(caret, caret); }
    }
  }

  function bindAttributeFilters(table, record) {
    var fieldSelect = table.querySelector('.arcgis-attribute-filter-field');
    var searchInput = table.querySelector('.arcgis-attribute-search');
    function updateFilter() {
      var filter = state.attributeFilterByKey[record.descriptor.key] || { field: '*', query: '' };
      filter.field = fieldSelect ? fieldSelect.value : '*';
      filter.query = searchInput ? searchInput.value : '';
      state.attributeFilterByKey[record.descriptor.key] = filter;
      state.attributePageByKey[record.descriptor.key] = 1;
      renderAttributeTable(record);
    }
    if (fieldSelect) fieldSelect.addEventListener('change', updateFilter);
    if (searchInput) searchInput.addEventListener('input', updateFilter);
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
      setCountStatus('Pilih minimal satu layer.', true);
      return;
    }
    var countButton = getElement('arcgisCountBtn');
    var buttonText = countButton ? countButton.textContent : '';
    if (countButton) {
      countButton.disabled = true;
      countButton.classList.add('is-loading');
      countButton.textContent = 'Menghitung…';
    }
    setCountStatus('Menghitung jumlah fitur…');
    setProgress('0/' + inputs.length + ' layer dihitung');
    var done = 0;
    var failed = 0;
    var summaries = [];
    try {
      for (var index = 0; index < inputs.length; index++) {
        var descriptor = state.leaves[Number(inputs[index].getAttribute('data-arcgis-leaf'))];
        if (!descriptor) continue;
        setProgress('Menghitung ' + (index + 1) + '/' + inputs.length + ' · ' + descriptor.name);
        setCountStatus('Menghitung fitur ' + descriptor.name + '…');
        try {
          if (!descriptor.layerId) {
            throw new Error(descriptor.metadataError
              ? 'Metadata sublayer gagal dibaca: ' + descriptor.metadataError
              : 'Service tidak menyediakan sublayer atau tabel yang bisa dihitung.');
          }
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
    setCountStatus(summaries.join(' · ') || 'Tidak ada layer dihitung.', failed > 0);
    if (done) console.log('[ArcGIS] hitung fitur:', summaries);
  }

  function shpProperties(properties) {
    var result = {};
    Object.keys(properties || {}).forEach(function (key) {
      var base = String(key || 'field').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 10) || 'field';
      var name = base;
      var suffix = 1;
      while (Object.prototype.hasOwnProperty.call(result, name)) {
        var tail = String(suffix++);
        name = base.slice(0, 10 - tail.length) + tail;
      }
      var value = properties[key];
      if (value == null || (typeof value === 'number' && !Number.isFinite(value))) value = '';
      else if (typeof value === 'boolean') value = value ? 1 : 0;
      else if (typeof value === 'object') value = JSON.stringify(value);
      result[name] = value;
    });
    return result;
  }

  async function exportShapefile(key) {
    var record = state.active[key];
    var descriptor = record && record.descriptor;
    if (!descriptor) return { ok: false, message: 'Layer ArcGIS tidak ditemukan.' };
    if (!descriptor.layerId) return { ok: false, message: 'Sublayer tidak memiliki ID untuk diekspor.' };
    var writer = window.shpwrite || (typeof shpwrite !== 'undefined' ? shpwrite : null);
    if (!writer || typeof writer.zip !== 'function') return { ok: false, message: 'Modul pembuat SHP belum siap. Muat ulang halaman lalu coba kembali.' };

    try {
      var data = descriptor.featureData || await fetchFeatureGeoJson(descriptor);
      var features = (data && data.features || []).filter(function (feature) {
        return feature && feature.geometry && feature.geometry.type && Array.isArray(feature.geometry.coordinates);
      });
      if (!features.length) return { ok: false, message: 'Layer tidak memiliki fitur geometri yang bisa diekspor.' };
      var types = {};
      features.forEach(function (feature) {
        var type = feature.geometry.type;
        if (type === 'Point' || type === 'MultiPoint') types.point = 'points';
        else if (type === 'LineString' || type === 'MultiLineString') types.polyline = 'lines';
        else if (type === 'Polygon' || type === 'MultiPolygon') types.polygon = 'polygons';
      });
      if (!Object.keys(types).length) return { ok: false, message: 'Jenis geometri layer ini belum didukung oleh format SHP.' };

      var fileName = descriptor.name.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'layer_arcgis';
      var collection = {
        type: 'FeatureCollection',
        features: features.map(function (feature) {
          return Object.assign({}, feature, { properties: shpProperties(feature.properties) });
        })
      };
      var zipData = await writer.zip(collection, {
        folder: fileName,
        filename: fileName,
        outputType: 'blob',
        types: types,
        prj: 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'
      });
      var blob = zipData instanceof Blob ? zipData : new Blob([zipData], { type: 'application/zip' });
      var objectUrl = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName + '.zip';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
      var partial = data && data.paginationWarning ? ' (data mungkin belum lengkap: server tidak mendukung pagination)' : '';
      return { ok: true, message: features.length.toLocaleString('id-ID') + ' fitur diekspor ke ' + fileName + '.zip' + partial + '.' };
    } catch (error) {
      return { ok: false, message: 'Gagal mengekspor SHP: ' + (error && error.message ? error.message : String(error)) };
    }
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
        var summary = event.target.closest('summary');
        var treeDetails = summary && summary.closest('details[data-tree-kind]');
        var treeKind = treeDetails && treeDetails.getAttribute('data-tree-kind');
        if (treeKind === 'folder') {
          window.setTimeout(function () {
            if (treeDetails.open) loadFolderContents(state.folderNodes[treeDetails.getAttribute('data-tree-key')]);
          }, 0);
        }
        var serviceDetails = treeKind === 'service' ? treeDetails : null;
        if (serviceDetails) {
          window.setTimeout(function () {
            if (serviceDetails.open) loadServiceMetadata(state.serviceNodes[serviceDetails.getAttribute('data-tree-key')]);
          }, 0);
        }
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
    exportShapefile: exportShapefile,
    remove: removeLayer,
    clear: clearDynamicLayers,
    getActive: function () { return state.active; }
  };
  window.discoverArcGISRestSource = discover;
  window.clearArcGISRestLayers = clearDynamicLayers;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
