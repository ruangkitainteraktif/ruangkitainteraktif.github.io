(function () {
  'use strict';

  var PROXY_PREFIX = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';
  var PAGE_SIZE = 1000;
  var MAX_PAGES = 100;
  var ATTRIBUTE_PAGE_SIZE = 100;
  var state = { run: 0, controller: null, busy: false, layers: [], selected: {}, loaded: {}, featureData: {}, counts: {}, activeTableLayer: '', attributePage: 1, attributeField: '*', attributeQuery: '', highlight: null };

  function el(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char];
    });
  }
  function setStatus(message, error) {
    var status = el('geoserverStatus');
    if (!status) return;
    status.textContent = message || '';
    status.style.color = error ? '#b91c1c' : '#52728a';
    status.hidden = !message;
  }
  function setBusy(busy, label) {
    state.busy = busy;
    var discover = el('geoserverDiscoverBtn');
    var cancel = el('geoserverCancelBtn');
    var add = el('geoserverAddBtn');
    var count = el('geoserverCountBtn');
    var exportButton = el('geoserverExportBtn');
    if (discover) {
      discover.disabled = busy;
      discover.textContent = busy && label === 'discover' ? 'Membaca workspace…' : 'Cari workspace dan layer';
    }
    if (cancel) {
      cancel.hidden = !busy;
      cancel.disabled = !busy;
    }
    if (add) add.disabled = busy || !Object.keys(state.selected).length;
    if (add) {
      add.classList.toggle('is-loading', busy && label === 'add');
      add.textContent = busy && label === 'add' ? 'Memuat layer…' : 'Tambahkan layer ke peta';
    }
    if (count) count.disabled = busy || !Object.keys(state.selected).length;
    if (exportButton) {
      exportButton.disabled = busy || !Object.keys(state.selected).length;
      exportButton.classList.toggle('is-loading', busy && label === 'export');
      exportButton.textContent = busy && label === 'export' ? 'Mengekspor SHP…' : 'Export SHP (login Google)';
    }
  }
  function normalizeOwsUrl(value) {
    var url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:') throw new Error('Gunakan URL GeoServer HTTPS.');
    url.search = '';
    url.hash = '';
    var path = url.pathname.replace(/\/+$/, '');
    var webIndex = path.toLowerCase().indexOf('/web/');
    if (webIndex >= 0) path = path.slice(0, webIndex);
    if (/\/(ows|wfs|wms)$/i.test(path)) path = path.replace(/\/(ows|wfs|wms)$/i, '/ows');
    else if (/\/geoserver$/i.test(path)) path += '/ows';
    else path += '/ows';
    url.pathname = path;
    return url.toString();
  }
  async function fetchText(url) {
    async function request(requestUrl) {
      var controller = new AbortController();
      var parent = state.controller;
      var abortParent = function () { controller.abort(); };
      if (parent) {
        if (parent.signal.aborted) controller.abort();
        else parent.signal.addEventListener('abort', abortParent, { once: true });
      }
      var timeout = window.setTimeout(function () { controller.abort(); }, 25000);
      try {
        var response = await fetch(requestUrl, { signal: controller.signal, headers: { Accept: 'application/json, application/xml, text/xml, */*' } });
        if (!response.ok) {
          var httpError = new Error('HTTP ' + response.status);
          httpError.httpStatus = response.status;
          throw httpError;
        }
        return await response.text();
      } finally {
        window.clearTimeout(timeout);
        if (parent) parent.signal.removeEventListener('abort', abortParent);
      }
    }
    try {
      return await request(url);
    } catch (directError) {
      if (state.controller && state.controller.signal.aborted) throw directError;
      if (directError && directError.httpStatus && directError.httpStatus < 500) throw directError;
      try {
        return await request(PROXY_PREFIX + encodeURIComponent(url));
      } catch (proxyError) {
        throw new Error('GeoServer tidak dapat dibaca langsung maupun melalui proxy. ' + (directError.message || proxyError.message));
      }
    }
  }
  function makeController() {
    if (state.controller) state.controller.abort();
    state.controller = new AbortController();
    return state.controller;
  }
  function localName(element) { return String(element && (element.localName || element.nodeName) || '').split(':').pop(); }
  function childText(parent, name) {
    if (!parent) return '';
    for (var i = 0; i < parent.children.length; i++) {
      if (localName(parent.children[i]) === name) return String(parent.children[i].textContent || '').trim();
    }
    return '';
  }
  function parseCapabilities(xmlText) {
    var xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) throw new Error('Respons GetCapabilities bukan XML yang valid.');
    var exception = Array.prototype.find.call(xml.getElementsByTagName('*'), function (node) {
      return /ExceptionText|ServiceException/i.test(localName(node));
    });
    if (exception) throw new Error(String(exception.textContent || 'GeoServer menolak GetCapabilities.').trim());
    var featureTypes = Array.prototype.filter.call(xml.getElementsByTagName('*'), function (node) {
      return localName(node) === 'FeatureType';
    });
    var layers = featureTypes.map(function (featureType) {
      var name = childText(featureType, 'Name');
      if (!name) return null;
      return {
        name: name,
        title: childText(featureType, 'Title') || name.split(':').pop(),
        workspace: name.indexOf(':') >= 0 ? name.split(':')[0] : 'Lainnya'
      };
    }).filter(Boolean);
    if (!layers.length) throw new Error('GetCapabilities tidak menemukan FeatureType WFS. Pastikan layer dipublikasikan sebagai WFS.');
    layers.sort(function (a, b) { return a.workspace.localeCompare(b.workspace) || a.title.localeCompare(b.title, 'id', { numeric: true, sensitivity: 'base' }); });
    return layers;
  }
  function renderTree() {
    var tree = el('geoserverLayerTree');
    if (!tree) return;
    var groups = {};
    state.layers.forEach(function (layer, index) {
      if (!groups[layer.workspace]) groups[layer.workspace] = [];
      groups[layer.workspace].push({ layer: layer, index: index });
    });
    var workspaces = Object.keys(groups);
    if (!workspaces.length) {
      tree.innerHTML = '<div class="arcgis-tree-empty">Tidak ada workspace atau layer WFS.</div>';
      return;
    }
    tree.innerHTML = workspaces.map(function (workspace) {
      var children = groups[workspace].map(function (entry) {
        var layer = entry.layer;
        var checked = state.selected[layer.name] ? ' checked' : '';
        var loaded = state.loaded[layer.name] ? ' · sudah dimuat' : '';
        var count = Object.prototype.hasOwnProperty.call(state.counts, layer.name) ? ' · ' + state.counts[layer.name].toLocaleString('id-ID') + ' fitur' : '';
        return '<label class="arcgis-tree-leaf"><input type="checkbox" data-geoserver-layer="' + entry.index + '"' + checked + '><span class="arcgis-tree-label" title="' + escapeHtml(layer.name) + '">' + escapeHtml(layer.title) + '</span><span class="arcgis-tree-type" title="' + escapeHtml(layer.name) + '">' + escapeHtml(layer.name.split(':').pop()) + escapeHtml(loaded + count) + '</span></label>';
      }).join('');
      return '<details class="arcgis-tree-group"><summary><span class="arcgis-tree-summary-title">' + escapeHtml(workspace) + '</span><span class="arcgis-tree-meta">' + groups[workspace].length + ' layer WFS</span></summary><div class="arcgis-tree-children">' + children + '</div></details>';
    }).join('');
    updateSelection();
  }
  function updateSelection() {
    var count = Object.keys(state.selected).length;
    var label = el('geoserverSelectionCount');
    var add = el('geoserverAddBtn');
    if (label) label.textContent = count ? count + ' layer dipilih' : 'Belum ada layer dipilih';
    if (add) add.disabled = state.busy || count === 0;
    var countButton = el('geoserverCountBtn');
    if (countButton) countButton.disabled = state.busy || count === 0;
    var exportButton = el('geoserverExportBtn');
    if (exportButton) exportButton.disabled = state.busy || count === 0;
  }
  async function discover() {
    var input = el('geoserverSourceUrl');
    var tree = el('geoserverLayerTree');
    if (!input || !tree) return;
    var run = ++state.run;
    makeController();
    state.layers = [];
    state.selected = {};
    updateSelection();
    setBusy(true, 'discover');
    tree.innerHTML = '<div class="arcgis-tree-loading"><span class="arcgis-tree-spinner" aria-hidden="true"></span><span>Membaca daftar workspace dan layer WFS…</span></div>';
    setStatus('Meminta WFS GetCapabilities…');
    try {
      var base = normalizeOwsUrl(input.value);
      var url = new URL(base);
      url.searchParams.set('service', 'WFS');
      url.searchParams.set('version', '2.0.0');
      url.searchParams.set('request', 'GetCapabilities');
      var xml = await fetchText(url.toString());
      if (run !== state.run) return;
      state.layers = parseCapabilities(xml);
      renderTree();
      setStatus(state.layers.length.toLocaleString('id-ID') + ' layer WFS ditemukan dalam ' + new Set(state.layers.map(function (layer) { return layer.workspace; })).size + ' workspace.');
    } catch (error) {
      if (run !== state.run) return;
      tree.innerHTML = '<div class="arcgis-tree-empty">Pencarian gagal. ' + escapeHtml(error.message || String(error)) + '</div>';
      setStatus(error.message || String(error), true);
    } finally {
      if (run === state.run) setBusy(false);
    }
  }
  function workspaceOwsUrl(base, layerName) {
    var url = new URL(base);
    var workspace = String(layerName || '').split(':')[0];
    if (!workspace || String(layerName).indexOf(':') < 0) return url.toString();
    var path = url.pathname.replace(/\/+$/, '').replace(/\/(ows|wfs|wms)$/i, '');
    if (path.split('/').pop() !== workspace) path += '/' + encodeURIComponent(workspace);
    url.pathname = path + '/ows';
    return url.toString();
  }
  function featureUrl(base, layerName, offset, version) {
    var url = new URL(base);
    url.searchParams.set('service', 'WFS');
    url.searchParams.set('version', version);
    url.searchParams.set('request', 'GetFeature');
    url.searchParams.set(version === '2.0.0' ? 'typeNames' : 'typeName', layerName);
    url.searchParams.set(version === '2.0.0' ? 'count' : 'maxFeatures', String(PAGE_SIZE));
    if (offset > 0) url.searchParams.set('startIndex', String(offset));
    url.searchParams.set('outputFormat', 'application/json');
    url.searchParams.set('srsName', 'EPSG:4326');
    return url.toString();
  }
  async function getFeaturePage(base, layerName, offset, version) {
    var text = await fetchText(featureUrl(base, layerName, offset, version));
    var data;
    try { data = JSON.parse(text); }
    catch (error) { throw new Error('WFS tidak mengembalikan GeoJSON. Periksa izin WFS dan outputFormat application/json.'); }
    if (data && data.exceptions) throw new Error(data.exceptions[0].text || 'GeoServer WFS mengembalikan error.');
    if (data && data.type === 'ExceptionReport') throw new Error('GeoServer menolak permintaan GetFeature.');
    if (!data || !Array.isArray(data.features)) throw new Error('Respons GeoServer bukan FeatureCollection GeoJSON.');
    return data;
  }
  async function fetchLayer(layer, onProgress) {
    var rootBase = normalizeOwsUrl(el('geoserverSourceUrl').value);
    var workspaceBase = workspaceOwsUrl(rootBase, layer.name);
    var attempts = [
      { base: workspaceBase, version: '1.0.0' },
      { base: workspaceBase, version: '2.0.0' },
      { base: workspaceBase, version: '1.1.0' },
      { base: rootBase, version: '1.0.0' },
      { base: rootBase, version: '2.0.0' },
      { base: rootBase, version: '1.1.0' }
    ];
    var base = rootBase;
    var version = '1.0.0';
    var data, lastError;
    for (var attempt = 0; attempt < attempts.length; attempt++) {
      try {
        base = attempts[attempt].base;
        version = attempts[attempt].version;
        data = await getFeaturePage(base, layer.name, 0, version);
        break;
      } catch (error) { lastError = error; }
    }
    if (!data) throw lastError || new Error('GeoServer tidak mengembalikan GeoJSON.');
    var features = data.features.slice();
    var offset = features.length;
    var previousSignature = '';
    var page = 1;
    var truncated = false;
    while (data.features.length === PAGE_SIZE && page < MAX_PAGES) {
      var first = data.features[0] && (data.features[0].id || JSON.stringify(data.features[0]).slice(0, 160));
      var last = data.features[data.features.length - 1] && (data.features[data.features.length - 1].id || JSON.stringify(data.features[data.features.length - 1]).slice(0, 160));
      var signature = String(first) + '|' + String(last);
      if (offset > PAGE_SIZE && signature === previousSignature) {
        truncated = true;
        break;
      }
      previousSignature = signature;
      data = await getFeaturePage(base, layer.name, offset, version);
      if (!data.features.length) break;
      features = features.concat(data.features);
      offset += data.features.length;
      page++;
      if (typeof onProgress === 'function') onProgress(features.length);
    }
    if (page >= MAX_PAGES && data.features.length === PAGE_SIZE) truncated = true;
    return { type: 'FeatureCollection', features: features, truncated: truncated };
  }
  function renderAttributeTable() {
    var table = el('geoserverAttributeTable');
    var status = el('geoserverAttributeStatus');
    if (!table || !status) return;
    var names = Object.keys(state.featureData);
    if (names.indexOf(state.activeTableLayer) < 0) state.activeTableLayer = names[0] || '';
    if (!state.activeTableLayer) {
      table.innerHTML = '';
      status.textContent = '';
      return;
    }
    var collection = state.featureData[state.activeTableLayer];
    var features = collection.features || [];
    var fieldSet = {};
    features.forEach(function (feature) { Object.keys(feature.properties || {}).forEach(function (key) { fieldSet[key] = true; }); });
    var fields = Object.keys(fieldSet);
    var query = String(state.attributeQuery || '').toLocaleLowerCase();
    var filtered = features.map(function (feature, index) { return { feature: feature, index: index }; }).filter(function (entry) {
      var props = entry.feature.properties || {};
      if (!query) return true;
      var values = state.attributeField === '*' ? fields : [state.attributeField];
      return values.some(function (field) { return String(props[field] == null ? '' : props[field]).toLocaleLowerCase().indexOf(query) >= 0; });
    });
    var pages = Math.max(1, Math.ceil(filtered.length / ATTRIBUTE_PAGE_SIZE));
    state.attributePage = Math.min(Math.max(1, state.attributePage), pages);
    var start = (state.attributePage - 1) * ATTRIBUTE_PAGE_SIZE;
    var rows = filtered.slice(start, start + ATTRIBUTE_PAGE_SIZE);
    var html = '<div class="arcgis-attribute-tools"><label><span>Layer</span><select data-geoserver-table-layer>';
    names.forEach(function (name) { html += '<option value="' + escapeHtml(name) + '"' + (name === state.activeTableLayer ? ' selected' : '') + '>' + escapeHtml(name) + '</option>'; });
    html += '</select></label><label><span>Filter field</span><select data-geoserver-table-field><option value="*">Semua kolom</option>';
    fields.forEach(function (field) { html += '<option value="' + escapeHtml(field) + '"' + (field === state.attributeField ? ' selected' : '') + '>' + escapeHtml(field) + '</option>'; });
    html += '</select></label><input data-geoserver-table-search type="search" value="' + escapeHtml(state.attributeQuery) + '" placeholder="Cari nilai atribut..." aria-label="Cari nilai atribut"></div>';
    if (!fields.length) html += '<div class="arcgis-attribute-empty">Layer tidak memiliki atribut.</div>';
    else if (!rows.length) html += '<div class="arcgis-attribute-empty">Tidak ada fitur yang cocok dengan filter.</div>';
    else {
      var visibleFields = fields.slice(0, 20);
      html += '<div class="arcgis-attribute-scroll"><table><thead><tr>' + visibleFields.map(function (field) { return '<th>' + escapeHtml(field) + '</th>'; }).join('') + '</tr></thead><tbody>';
      rows.forEach(function (entry) {
        html += '<tr data-geoserver-feature-index="' + entry.index + '" tabindex="0" title="Klik untuk menyorot fitur pada peta">';
        visibleFields.forEach(function (field) {
          var value = entry.feature.properties && entry.feature.properties[field];
          var text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
          html += '<td title="' + escapeHtml(text) + '">' + escapeHtml(text) + '</td>';
        });
        html += '</tr>';
      });
      html += '</tbody></table></div>';
      if (pages > 1) html += '<div class="arcgis-attribute-pagination"><button type="button" data-geoserver-page="prev"' + (state.attributePage <= 1 ? ' disabled' : '') + '>‹</button><span>Halaman ' + state.attributePage + ' / ' + pages + '</span><button type="button" data-geoserver-page="next"' + (state.attributePage >= pages ? ' disabled' : '') + '>›</button></div>';
    }
    table.innerHTML = html;
    status.textContent = 'Menampilkan ' + (filtered.length ? start + 1 : 0).toLocaleString('id-ID') + '–' + Math.min(start + rows.length, filtered.length).toLocaleString('id-ID') + ' dari ' + filtered.length.toLocaleString('id-ID') + ' fitur cocok · ' + state.activeTableLayer + (collection.truncated ? ' · hasil dibatasi' : '');
    var layerSelect = table.querySelector('[data-geoserver-table-layer]');
    var fieldSelect = table.querySelector('[data-geoserver-table-field]');
    var search = table.querySelector('[data-geoserver-table-search]');
    if (layerSelect) layerSelect.addEventListener('change', function () { state.activeTableLayer = layerSelect.value; state.attributePage = 1; state.attributeField = '*'; state.attributeQuery = ''; renderAttributeTable(); });
    if (fieldSelect) fieldSelect.addEventListener('change', function () { state.attributeField = fieldSelect.value; state.attributePage = 1; renderAttributeTable(); });
    if (search) search.addEventListener('input', function () { state.attributeQuery = search.value; state.attributePage = 1; renderAttributeTable(); var next = table.querySelector('[data-geoserver-table-search]'); if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); } });
    table.querySelectorAll('[data-geoserver-page]').forEach(function (button) { button.addEventListener('click', function () { state.attributePage += button.getAttribute('data-geoserver-page') === 'next' ? 1 : -1; renderAttributeTable(); }); });
    table.querySelectorAll('tr[data-geoserver-feature-index]').forEach(function (row) {
      function focusFeature() {
        var feature = features[Number(row.getAttribute('data-geoserver-feature-index'))];
        var map = window.map || window._map;
        if (!feature || !feature.geometry || !map || !window.L) return;
        if (state.highlight && map.hasLayer(state.highlight)) map.removeLayer(state.highlight);
        state.highlight = window.L.geoJSON(feature, { style: { color: '#facc15', weight: 4, fillColor: '#facc15', fillOpacity: 0.42 } }).addTo(map);
        if (state.highlight.bringToFront) state.highlight.bringToFront();
        var bounds = state.highlight.getBounds();
        if (bounds && bounds.isValid()) map.fitBounds(bounds.pad(0.1), { maxZoom: 17 });
        else if (feature.geometry.type === 'Point') map.setView([feature.geometry.coordinates[1], feature.geometry.coordinates[0]], Math.max(map.getZoom(), 15));
      }
      row.addEventListener('click', focusFeature);
      row.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focusFeature(); } });
    });
  }
  async function countSelected() {
    var selected = Object.keys(state.selected).map(function (name) { return state.selected[name]; });
    if (!selected.length) return;
    var run = ++state.run;
    makeController();
    setBusy(true, 'count');
    var button = el('geoserverCountBtn');
    var oldText = button ? button.textContent : '';
    if (button) { button.disabled = true; button.textContent = 'Menghitung…'; }
    var summaries = [];
    try {
      for (var i = 0; i < selected.length; i++) {
        if (run !== state.run) return;
        var layer = selected[i];
        setStatus('Menghitung fitur ' + layer.name + ' (' + (i + 1) + '/' + selected.length + ')…');
        var total = null;
        var rootBase = normalizeOwsUrl(el('geoserverSourceUrl').value);
        var bases = [workspaceOwsUrl(rootBase, layer.name), rootBase];
        for (var baseIndex = 0; baseIndex < bases.length && total == null; baseIndex++) for (var versionIndex = 0; versionIndex < 3 && total == null; versionIndex++) {
          var version = ['1.0.0', '2.0.0', '1.1.0'][versionIndex];
          var url = new URL(featureUrl(bases[baseIndex], layer.name, 0, version));
          url.searchParams.set('resultType', 'hits');
          try {
            var responseText = await fetchText(url.toString());
            try {
              var json = JSON.parse(responseText);
              var candidate = json.numberMatched != null ? json.numberMatched : json.totalFeatures;
              if (candidate != null && candidate !== 'unknown' && Number.isFinite(Number(candidate))) total = Number(candidate);
            } catch (_) {
              var xml = new DOMParser().parseFromString(responseText, 'application/xml');
              var root = xml.documentElement;
              var candidateXml = root.getAttribute('numberMatched') || root.getAttribute('numberOfFeatures') || root.getAttribute('numberOfRecordsMatched');
              if (candidateXml && candidateXml !== 'unknown' && Number.isFinite(Number(candidateXml))) total = Number(candidateXml);
            }
          } catch (_) { /* coba endpoint workspace atau versi WFS berikutnya */ }
        }
        summaries.push(layer.name + ': ' + (total == null ? 'server tidak mengirim hitungan' : total.toLocaleString('id-ID') + ' fitur'));
        if (total != null) state.counts[layer.name] = total;
      }
      setStatus(summaries.join(' · '), summaries.some(function (item) { return item.indexOf('tidak mengirim') >= 0; }));
      renderTree();
    } catch (error) {
      if (run === state.run) setStatus(error.message || String(error), true);
    } finally {
      if (button) button.textContent = oldText || 'Hitung fitur layer dipilih';
      if (run === state.run) setBusy(false);
    }
  }
  function shpSafeProperties(properties) {
    var result = {};
    Object.keys(properties || {}).forEach(function (key) {
      var base = String(key || 'field').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 10) || 'field';
      var field = base;
      var suffix = 1;
      while (Object.prototype.hasOwnProperty.call(result, field)) {
        var tail = String(suffix++);
        field = base.slice(0, 10 - tail.length) + tail;
      }
      var value = properties[key];
      if (value == null || (typeof value === 'number' && !Number.isFinite(value))) value = '';
      else if (typeof value === 'boolean') value = value ? 1 : 0;
      else if (typeof value === 'object') value = JSON.stringify(value);
      result[field] = value;
    });
    return result;
  }
  async function downloadShapefile(layer, collection) {
    var writer = window.shpwrite || (typeof shpwrite !== 'undefined' ? shpwrite : null);
    if (!writer || typeof writer.zip !== 'function') throw new Error('Modul pembuat SHP belum siap. Muat ulang halaman lalu coba kembali.');
    var features = (collection.features || []).filter(function (feature) {
      return feature && feature.geometry && feature.geometry.type && Array.isArray(feature.geometry.coordinates);
    });
    if (!features.length) throw new Error(layer.name + ': tidak ada fitur geometri yang dapat diekspor.');
    var types = {};
    features.forEach(function (feature) {
      var type = feature.geometry.type;
      if (type === 'Point' || type === 'MultiPoint') types.point = 'points';
      else if (type === 'LineString' || type === 'MultiLineString') types.polyline = 'lines';
      else if (type === 'Polygon' || type === 'MultiPolygon') types.polygon = 'polygons';
    });
    if (!Object.keys(types).length) throw new Error(layer.name + ': jenis geometri belum didukung format SHP.');
    var fileName = layer.name.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'layer_geoserver';
    var safeCollection = {
      type: 'FeatureCollection',
      features: features.map(function (feature) {
        return Object.assign({}, feature, { properties: shpSafeProperties(feature.properties) });
      })
    };
    var zipData = await writer.zip(safeCollection, {
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
    return features.length;
  }
  function exportSelectedWithLogin() {
    if (!Object.keys(state.selected).length) {
      setStatus('Pilih minimal satu layer GeoServer untuk diekspor.', true);
      return;
    }
    if (typeof window.RKRequireGoogleLogin !== 'function') {
      setStatus('Login Google belum siap. Muat ulang halaman lalu coba kembali.', true);
      return;
    }
    window.RKRequireGoogleLogin(exportSelected);
  }
  async function exportSelected() {
    var selected = Object.keys(state.selected).map(function (name) { return state.selected[name]; });
    if (!selected.length) return;
    var run = ++state.run;
    makeController();
    setBusy(true, 'export');
    var summaries = [];
    var errors = [];
    try {
      for (var i = 0; i < selected.length; i++) {
        if (run !== state.run) return;
        var layer = selected[i];
        setStatus('Mengunduh fitur ' + layer.name + ' untuk ekspor SHP (' + (i + 1) + '/' + selected.length + ')…');
        await new Promise(function (resolve) { window.requestAnimationFrame(resolve); });
        try {
          var collection = await fetchLayer(layer, function (featureCount) {
            if (run === state.run) setStatus('Menyiapkan ' + layer.name + ': ' + featureCount.toLocaleString('id-ID') + ' fitur diunduh…');
          });
          if (run !== state.run) return;
          var exported = await downloadShapefile(layer, collection);
          summaries.push(exported.toLocaleString('id-ID') + ' fitur diekspor ke ' + layer.name + '.zip' + (collection.truncated ? ' (sebagian fitur)' : ''));
        } catch (error) {
          if (run !== state.run) return;
          errors.push(error.message || String(error));
        }
      }
      var message = summaries.concat(errors).join(' · ');
      setStatus(message || 'Tidak ada layer yang berhasil diekspor.', errors.length > 0);
    } finally {
      if (run === state.run) setBusy(false);
    }
  }
  async function addSelected() {
    var selected = Object.keys(state.selected).map(function (name) { return state.selected[name]; });
    if (!selected.length) return;
    if (typeof window.addAlatGeoJSONLayer !== 'function') {
      setStatus('Fitur pemuatan layer belum siap. Muat ulang halaman lalu coba kembali.', true);
      return;
    }
    var run = ++state.run;
    makeController();
    setBusy(true, 'add');
    var loaded = 0;
    var failed = [];
    for (var i = 0; i < selected.length; i++) {
      if (run !== state.run) return;
      var layer = selected[i];
      setStatus('Mengunduh layer ' + layer.name + ' (' + (i + 1) + '/' + selected.length + ')…');
      try {
        var geojson = await fetchLayer(layer, function (featureCount) {
          if (run === state.run) setStatus('Mengunduh ' + layer.name + ': ' + featureCount.toLocaleString('id-ID') + ' fitur…');
        });
        if (run !== state.run) return;
        if (!geojson.features.length) throw new Error('layer tidak memiliki fitur.');
        geojson.features = geojson.features.filter(function (feature) {
          return feature && feature.geometry && feature.geometry.type && feature.geometry.coordinates != null;
        });
        if (!geojson.features.length) throw new Error('fitur tidak memiliki geometri yang dapat ditampilkan di peta.');
        setStatus('Memasang ' + layer.name + ' ke peta…');
        window.addAlatGeoJSONLayer(layer.title || layer.name, 'GeoServer WFS', geojson);
        state.loaded[layer.name] = true;
        state.featureData[layer.name] = geojson;
        if (!geojson.truncated) state.counts[layer.name] = geojson.features.length;
        state.activeTableLayer = layer.name;
        state.attributePage = 1;
        renderAttributeTable();
        delete state.selected[layer.name];
        loaded++;
        if (geojson.truncated) failed.push(layer.name + ': dibatasi ' + (PAGE_SIZE * MAX_PAGES).toLocaleString('id-ID') + ' fitur');
      } catch (error) {
        if (run !== state.run) return;
        failed.push(layer.name + ': ' + (error.message || String(error)));
      }
    }
    renderTree();
    var message = loaded + ' layer GeoServer dimuat.';
    if (failed.length) message += ' ' + failed.join(' · ');
    setStatus(message, failed.length > 0);
    setBusy(false);
  }
  function cancel() {
    state.run++;
    if (state.controller) state.controller.abort();
    setBusy(false);
    setStatus('Pemuatan GeoServer dibatalkan.', true);
  }
  function bind() {
    var discoverButton = el('geoserverDiscoverBtn');
    var cancelButton = el('geoserverCancelBtn');
    var addButton = el('geoserverAddBtn');
    var tree = el('geoserverLayerTree');
    if (discoverButton) discoverButton.addEventListener('click', discover);
    if (cancelButton) cancelButton.addEventListener('click', cancel);
    if (addButton) addButton.addEventListener('click', addSelected);
    var countButton = el('geoserverCountBtn');
    if (countButton) countButton.addEventListener('click', countSelected);
    var exportButton = el('geoserverExportBtn');
    if (exportButton) exportButton.addEventListener('click', exportSelectedWithLogin);
    if (tree) tree.addEventListener('change', function (event) {
      var input = event.target.closest('input[data-geoserver-layer]');
      if (!input) return;
      var layer = state.layers[Number(input.getAttribute('data-geoserver-layer'))];
      if (!layer) return;
      if (input.checked) state.selected[layer.name] = layer;
      else delete state.selected[layer.name];
      updateSelection();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
