(function () {
  'use strict';

var PROXY_PREFIX = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';
  var PAGE_SIZE = 1000;
  var MAX_PAGES = 100;
  var ATTRIBUTE_PAGE_SIZE = 100;
  var FETCH_TIMEOUT_MS = 25000;
  var EXPORT_BUDGET_MS = 120000;
  var state = { run: 0, controller: null, busy: false, layers: [], selected: {}, loaded: {}, featureData: {}, counts: {}, activeTableLayer: '', attributePage: 1, attributeField: '*', attributeQuery: '', highlight: null, deadline: 0 };

  function remainingBudget() {
    if (!state.deadline) return FETCH_TIMEOUT_MS;
    return state.deadline - Date.now();
  }

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
      exportButton.textContent = busy && label === 'export' ? 'Mengekspor SHP…' : 'Export SHP';
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
      var budget = remainingBudget();
      if (budget <= 0) {
        var expired = new Error('Waktu total pembacaan habis.');
        expired.timedOut = true;
        throw expired;
      }
      var limit = Math.max(1000, Math.min(FETCH_TIMEOUT_MS, budget));
      var controller = new AbortController();
      var parent = state.controller;
      var abortParent = function () { controller.abort(); };
      if (parent) {
        if (parent.signal.aborted) controller.abort();
        else parent.signal.addEventListener('abort', abortParent, { once: true });
      }
      var timedOut = false;
      var timeout = window.setTimeout(function () { timedOut = true; controller.abort(); }, limit);
      try {
        var response = await fetch(requestUrl, { signal: controller.signal, headers: { Accept: 'application/json, application/xml, text/xml, */*' } });
        if (!response.ok) {
          var httpError = new Error('HTTP ' + response.status);
          httpError.httpStatus = response.status;
          throw httpError;
        }
        return await response.text();
      } catch (error) {
        if (timedOut && error && error.name === 'AbortError') {
          var timeoutError = new Error('Waktu baca habis (' + Math.round(limit / 1000) + ' d).');
          timeoutError.timedOut = true;
          throw timeoutError;
        }
        throw error;
      } finally {
        window.clearTimeout(timeout);
        if (parent) parent.signal.removeEventListener('abort', abortParent);
      }
    }
    try {
      return await request(url);
    } catch (directError) {
      if (state.controller && state.controller.signal.aborted) throw directError;
      /* Timeout berarti servernya sendiri tidak merespons. Mencoba proxy
         hanya menambah waktu tunggu tanpa memperbaiki apa pun. */
      if (directError && directError.timedOut) throw directError;
      /* 403 sering datang dari WAF/proxy depan GeoServer yang menolak
         permintaan langsung, padahal proxy CORS diteruskan. */
      var retryable = !directError || !directError.httpStatus || directError.httpStatus >= 500 || directError.httpStatus === 403;
      if (!retryable) throw directError;
      try {
        return await request(PROXY_PREFIX + encodeURIComponent(url));
      } catch (proxyError) {
        if (directError.httpStatus === 403 && proxyError.httpStatus === 403) {
          throw new Error('GeoServer menolak permintaan ini (403) baik langsung maupun melalui proxy. Periksa izin WFS atau aturan firewall server.');
        }
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
tree.innerHTML = workspaces.map(function (workspace, workspaceIndex) {
      var children = groups[workspace].map(function (entry) {
        var layer = entry.layer;
        var checked = state.selected[layer.name] ? ' checked' : '';
        var loaded = state.loaded[layer.name] ? ' · sudah dimuat' : '';
        var count = Object.prototype.hasOwnProperty.call(state.counts, layer.name) ? ' · ' + state.counts[layer.name].toLocaleString('id-ID') + ' fitur' : '';
        return '<label class="arcgis-tree-leaf"><input type="checkbox" data-geoserver-layer="' + entry.index + '"' + checked + '><span class="arcgis-tree-label" title="' + escapeHtml(layer.name) + '">' + escapeHtml(layer.title) + '</span><span class="arcgis-tree-type" title="' + escapeHtml(layer.name) + '">' + escapeHtml(layer.name.split(':').pop()) + escapeHtml(loaded + count) + '</span></label>';
      }).join('');
      return '<details class="arcgis-tree-group"' + (workspaceIndex === 0 ? ' open' : '') + '><summary><span class="arcgis-tree-summary-title">' + escapeHtml(workspace) + '</span><span class="arcgis-tree-meta">' + groups[workspace].length + ' layer WFS</span></summary><div class="arcgis-tree-children">' + children + '</div></details>';
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
  function parseFeatureCount(responseText) {
    try {
      var json = JSON.parse(responseText);
      var candidate = json.numberMatched != null ? json.numberMatched : json.totalFeatures;
      if (candidate == null) candidate = json.numberOfFeatures;
      if (candidate != null && candidate !== 'unknown' && Number.isFinite(Number(candidate))) return Number(candidate);
    } catch (_) { /* respons WFS hits umumnya XML */ }
    var xml = new DOMParser().parseFromString(responseText, 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) return null;
    var root = xml.documentElement;
    var attributes = ['numberMatched', 'numberOfFeatures', 'numberOfRecordsMatched'];
    for (var i = 0; i < attributes.length; i++) {
      var candidateXml = root.getAttribute(attributes[i]);
      if (candidateXml && candidateXml !== 'unknown' && Number.isFinite(Number(candidateXml))) return Number(candidateXml);
    }
    return null;
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
      /* Jangan wasting sisa anggaran untuk percobaan berikutnya. */
      if (state.deadline && Date.now() >= state.deadline) {
        lastError = new Error('Waktu total pembacaan habis sebelum semua percobaan selesai.');
        break;
      }
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
      try {
        data = await getFeaturePage(base, layer.name, offset, version);
      } catch (pageError) {
        /* Halaman berikutnya gagal: lebih baik kirim hasil parsial
           daripada membatalkan seluruh ekspor. */
        truncated = true;
        break;
      }
      if (!data.features.length) break;
      features = features.concat(data.features);
      offset += data.features.length;
      page++;
      if (typeof onProgress === 'function') onProgress(features.length);
      if (state.deadline && Date.now() >= state.deadline) { truncated = true; break; }
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
        var zeroReported = false;
        var rootBase = normalizeOwsUrl(el('geoserverSourceUrl').value);
        var bases = [rootBase, workspaceOwsUrl(rootBase, layer.name)];
        for (var baseIndex = 0; baseIndex < bases.length && !(total > 0); baseIndex++) for (var versionIndex = 0; versionIndex < 3 && !(total > 0); versionIndex++) {
          var version = ['2.0.0', '1.1.0', '1.0.0'][versionIndex];
          try {
            var url = new URL(featureUrl(bases[baseIndex], layer.name, 0, version));
            url.searchParams.set('resultType', 'hits');
            var responseText = await fetchText(url.toString());
            var candidate = parseFeatureCount(responseText);
            if (candidate > 0) total = candidate;
            else if (candidate === 0) zeroReported = true;
          } catch (_) { /* coba endpoint workspace atau versi WFS berikutnya */ }
        }
        if (total == null && zeroReported) total = 0;
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
    state.deadline = Date.now() + EXPORT_BUDGET_MS;
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
      state.deadline = 0;
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
  /* ===== Persil Nasional (BHUMI) — unduh raster dari expapi/umum/wms =====
     Endpoint selalu membalas PNG 512×512 (RGBA) untuk BBOX EPSG:3857 yang
     diberikan; parameter WIDTH/HEIGHT diabaikan. `filter` wajib ter-encrypt
     AES-256-CBC gaya OpenSSL (Salted__) — nilai '%' = semua persil dalam
     BBOX. Rentang permintaan dijaga ≤4 km (≥8 km memicu 500 upstream). */
  var PERSIL_WMS = 'https://bhumi.atrbpn.go.id/expapi/umum/wms';
  // Passphrase AES filter; dirotasi BHUMI 2026-10-22 (chunk 8815, fungsi
  // n()). Nilai lama S3cretATRXBUMI kini membuat server membalas 400
  // "Missing layer or filter parameter" karena filter tidak bisa dibuka.
  var PERSIL_PASS = 'K9#mQ8!wL5*zY4@tN7&eX1^bJ3(c';
  var PERSIL_TILE = 512;
  var PERSIL_MAX_TILES = 600;
  var PERSIL_MAX_DIM = 16384;
  var PERSIL_WKT_3857 = 'PROJCS["WGS 84 / Pseudo-Mercator",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]],CONVERSION["Popular Visualisation Pseudo-Mercator",METHOD["Popular Visualisation Pseudo Mercator",AUTHORITY["EPSG","9804"]],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",0],PARAMETER["false_easting",0],PARAMETER["false_northing",0],LENGTHUNIT["metre",1]],CS[Cartesian,2],AXIS["easting",east],AXIS["northing",north],UNIT["metre",1],AUTHORITY["EPSG","3857"]]';
  var persilState = { run: 0, busy: false, lastPngUrl: null };

  function persilStatus(message, error) {
    var status = el('persilStatus');
    if (!status) return;
    status.textContent = message || '';
    status.style.color = error ? '#b91c1c' : '#52728a';
    status.hidden = !message;
  }
  function persilSetBusy(busy) {
    persilState.busy = busy;
    var button = el('persilDownloadBtn');
    var cancel = el('persilCancelBtn');
    if (button) {
      button.disabled = busy;
      button.textContent = busy ? 'Mengunduh…' : 'Unduh PNG + World File (ZIP)';
    }
    if (cancel) cancel.hidden = !busy;
  }
  function persilMd5Bytes(bytes) {
    function add32(a, b) { return (a + b) & 0xFFFFFFFF; }
    function rol(n, c) { return (n << c) | (n >>> (32 - c)); }
    function cmn(q, a, b, x, s, t) { return add32(rol(add32(add32(a, q), add32(x, t)), s), b); }
    function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
    function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
    function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
    function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
    var msgLen = bytes.length;
    var padded = new Uint8Array((((msgLen + 8) >> 6) + 1) * 64);
    padded.set(bytes);
    padded[msgLen] = 0x80;
    var bitLen = msgLen * 8;
    padded[padded.length - 8] = bitLen & 0xFF;
    padded[padded.length - 7] = (bitLen >>> 8) & 0xFF;
    padded[padded.length - 6] = (bitLen >>> 16) & 0xFF;
    padded[padded.length - 5] = (bitLen >>> 24) & 0xFF;
    var a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (var i = 0; i < padded.length; i += 64) {
      var x = [];
      for (var j = 0; j < 16; j++) {
        x[j] = padded[i + j * 4] | (padded[i + j * 4 + 1] << 8) |
                (padded[i + j * 4 + 2] << 16) | (padded[i + j * 4 + 3] << 24);
      }
      var oa = a, ob = b, oc = c, od = d;
      a = ff(a,b,c,d,x[0],7,-680876936); d = ff(d,a,b,c,x[1],12,-389564586); c = ff(c,d,a,b,x[2],17,606105819); b = ff(b,c,d,a,x[3],22,-1044525330);
      a = ff(a,b,c,d,x[4],7,-176418897); d = ff(d,a,b,c,x[5],12,1200080426); c = ff(c,d,a,b,x[6],17,-1473231341); b = ff(b,c,d,a,x[7],22,-45705983);
      a = ff(a,b,c,d,x[8],7,1770035416); d = ff(d,a,b,c,x[9],12,-1958414417); c = ff(c,d,a,b,x[10],17,-42063); b = ff(b,c,d,a,x[11],22,-1990404162);
      a = ff(a,b,c,d,x[12],7,1804603682); d = ff(d,a,b,c,x[13],12,-40341101); c = ff(c,d,a,b,x[14],17,-1502002290); b = ff(b,c,d,a,x[15],22,1236535329);
      a = gg(a,b,c,d,x[1],5,-165796510); d = gg(d,a,b,c,x[6],9,-1069501632); c = gg(c,d,a,b,x[11],14,643717713); b = gg(b,c,d,a,x[0],20,-373897302);
      a = gg(a,b,c,d,x[5],5,-701558691); d = gg(d,a,b,c,x[10],9,38016083); c = gg(c,d,a,b,x[15],14,-660478335); b = gg(b,c,d,a,x[4],20,-405537848);
      a = gg(a,b,c,d,x[9],5,568446438); d = gg(d,a,b,c,x[14],9,-1019803690); c = gg(c,d,a,b,x[3],14,-187363961); b = gg(b,c,d,a,x[8],20,1163531501);
      a = gg(a,b,c,d,x[13],5,-1444681467); d = gg(d,a,b,c,x[2],9,-51403784); c = gg(c,d,a,b,x[7],14,1735328473); b = gg(b,c,d,a,x[12],20,-1926607734);
      a = hh(a,b,c,d,x[5],4,-378558); d = hh(d,a,b,c,x[8],11,-2022574463); c = hh(c,d,a,b,x[11],16,1839030562); b = hh(b,c,d,a,x[14],23,-35309556);
      a = hh(a,b,c,d,x[1],4,-1530992060); d = hh(d,a,b,c,x[4],11,1272893353); c = hh(c,d,a,b,x[7],16,-155497632); b = hh(b,c,d,a,x[10],23,-1094730640);
      a = hh(a,b,c,d,x[13],4,681279174); d = hh(d,a,b,c,x[0],11,-358537222); c = hh(c,d,a,b,x[3],16,-722521979); b = hh(b,c,d,a,x[6],23,76029189);
      a = hh(a,b,c,d,x[9],4,-640364487); d = hh(d,a,b,c,x[12],11,-421815835); c = hh(c,d,a,b,x[15],16,530742520); b = hh(b,c,d,a,x[2],23,-995338651);
      a = ii(a,b,c,d,x[0],6,-198630844); d = ii(d,a,b,c,x[7],10,1126891415); c = ii(c,d,a,b,x[14],15,-1416354905); b = ii(b,c,d,a,x[5],21,-57434055);
      a = ii(a,b,c,d,x[12],6,1700485571); d = ii(d,a,b,c,x[3],10,-1894986606); c = ii(c,d,a,b,x[10],15,-1051523); b = ii(b,c,d,a,x[1],21,-2054922799);
      a = ii(a,b,c,d,x[8],6,1873313359); d = ii(d,a,b,c,x[15],10,-30611744); c = ii(c,d,a,b,x[6],15,-1560198380); b = ii(b,c,d,a,x[13],21,1309151649);
      a = ii(a,b,c,d,x[4],6,-145523070); d = ii(d,a,b,c,x[11],10,-1120210379); c = ii(c,d,a,b,x[2],15,718787259); b = ii(b,c,d,a,x[9],21,-343485551);
      a = add32(a, oa); b = add32(b, ob); c = add32(c, oc); d = add32(d, od);
    }
    var out = new Uint8Array(16);
    function put(word, off) {
      out[off] = word & 0xFF; out[off + 1] = (word >>> 8) & 0xFF;
      out[off + 2] = (word >>> 16) & 0xFF; out[off + 3] = (word >>> 24) & 0xFF;
    }
    put(a, 0); put(b, 4); put(c, 8); put(d, 12);
    return out;
  }
  function persilEncryptFilter(plain) {
    var salt = crypto.getRandomValues(new Uint8Array(8));
    var passBytes = new Uint8Array(PERSIL_PASS.length);
    for (var i = 0; i < passBytes.length; i++) passBytes[i] = PERSIL_PASS.charCodeAt(i);
    var out = new Uint8Array(0), prev = new Uint8Array(0);
    while (out.length < 48) {
      var input = new Uint8Array(prev.length + passBytes.length + 8);
      input.set(prev, 0);
      input.set(passBytes, prev.length);
      input.set(salt, prev.length + passBytes.length);
      prev = persilMd5Bytes(input);
      var merged = new Uint8Array(out.length + prev.length);
      merged.set(out, 0);
      merged.set(prev, out.length);
      out = merged;
    }
    return crypto.subtle.importKey('raw', out.subarray(0, 32), { name: 'AES-CBC' }, false, ['encrypt'])
      .then(function (key) {
        return crypto.subtle.encrypt({ name: 'AES-CBC', iv: out.subarray(32, 48) }, key, new TextEncoder().encode(plain));
      })
      .then(function (cipherBuf) {
        var buf = new Uint8Array(16 + cipherBuf.byteLength);
        buf.set(new TextEncoder().encode('Salted__'), 0);
        buf.set(salt, 8);
        buf.set(new Uint8Array(cipherBuf), 16);
        var text = '';
        for (var j = 0; j < buf.length; j++) text += String.fromCharCode(buf[j]);
        return btoa(text);
      });
  }
  function persilLonToX(lon) { return lon * 20037508.342789244 / 180; }
  function persilLatToY(lat) { return 6378137 * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)); }
  function persilResolveBounds(text) {
    text = String(text || '').trim();
    if (text) {
      var parts = text.split(',').map(function (part) { return Number(part.trim()); });
      if (parts.length !== 4 || parts.some(function (n) { return !Number.isFinite(n); })) {
        throw new Error('Format wilayah tidak valid. Tulis: barat,selatan,timur,utara (contoh 106.70,-6.30,106.85,-6.20).');
      }
      var west = parts[0], south = parts[1], east = parts[2], north = parts[3];
      if (west < -180 || east > 180 || west >= east || south < -85 || north > 85 || south >= north) {
        throw new Error('Rentang wilayah di luar batas (gunakan lon −180…180, lat −85…85, dan pastikan barat < timur, selatan < utara).');
      }
      return { x0: persilLonToX(west), y0: persilLatToY(south), x1: persilLonToX(east), y1: persilLatToY(north), label: 'wilayah masukan' };
    }
    var map = window.map || window._map;
    if (!map || typeof map.getBounds !== 'function') {
      throw new Error('Tampilan peta belum siap. Geser peta ke wilayah yang ingin diunduh, atau isi kolom wilayah manual.');
    }
    var bounds = map.getBounds();
    var sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
    return { x0: persilLonToX(sw.lng), y0: persilLatToY(sw.lat), x1: persilLonToX(ne.lng), y1: persilLatToY(ne.lat), label: 'tampilan peta' };
  }
  function persilPlan(bounds, span) {
    if (!Number.isFinite(span) || span < 250 || span > 4000) span = 2000;
    var res = span / PERSIL_TILE;
    var width = bounds.x1 - bounds.x0, height = bounds.y1 - bounds.y0;
    var cols = Math.max(1, Math.ceil(width / span));
    var rows = Math.max(1, Math.ceil(height / span));
    var requests = cols * rows;
    if (requests > PERSIL_MAX_TILES) {
      throw new Error('Wilayah terlalu luas untuk resolusi ini: ' + requests + ' permintaan (maksimal ' + PERSIL_MAX_TILES + '). Perkecil wilayah atau pilih resolusi lebih rendah.');
    }
    var outW = Math.max(1, Math.round(width / res));
    var outH = Math.max(1, Math.round(height / res));
    if (outW > PERSIL_MAX_DIM || outH > PERSIL_MAX_DIM) {
      throw new Error('Hasil terlalu besar (' + outW + '×' + outH + ' px, maksimal ' + PERSIL_MAX_DIM + ' px per sisi). Perkecil wilayah atau turunkan resolusi.');
    }
    return { span: span, res: res, cols: cols, rows: rows, requests: requests, outW: outW, outH: outH };
  }
  function persilIsPng(bytes) {
    return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
      bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A;
  }
  function persilFetchOnce(url, parentSignal, timeoutMs) {
    var controller = new AbortController();
    var timedOut = false;
    var timer = window.setTimeout(function () { timedOut = true; controller.abort(); }, timeoutMs);
    var onParentAbort = function () { controller.abort(); };
    if (parentSignal) {
      if (parentSignal.aborted) controller.abort();
      else parentSignal.addEventListener('abort', onParentAbort, { once: true });
    }
    function cleanup() {
      window.clearTimeout(timer);
      if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);
    }
    return fetch(url, { signal: controller.signal })
      .then(function (response) {
        return response.arrayBuffer().then(function (buffer) {
          var bytes = new Uint8Array(buffer);
          if (response.ok && persilIsPng(bytes)) return bytes;
          var detail = response.ok ? new TextDecoder().decode(bytes.slice(0, 160)) : ('HTTP ' + response.status);
          var error = new Error('Respons server bukan PNG (' + detail.trim() + ').');
          error.persilBadResponse = true;
          throw error;
        });
      })
      .catch(function (error) {
        if (timedOut && error && error.name === 'AbortError') {
          var timeoutError = new Error('Waktu permintaan tile habis (' + Math.round(timeoutMs / 1000) + ' d).');
          timeoutError.persilBadResponse = true;
          throw timeoutError;
        }
        throw error;
      })
      .finally(cleanup);
  }
  function persilFetchTile(bboxText, filter, parentSignal) {
    var url = PERSIL_WMS + '?layer=Persil&filter=' + encodeURIComponent(filter) + '&BBOX=' + bboxText;
    var proxied = PROXY_PREFIX + encodeURIComponent(url);
    return persilFetchOnce(proxied, parentSignal, 45000).catch(function (firstError) {
      if (firstError && firstError.name === 'AbortError') throw firstError;
      if (parentSignal && parentSignal.aborted) throw firstError;
      return new Promise(function (resolve) { window.setTimeout(resolve, 1600); }).then(function () {
        return persilFetchOnce(proxied, parentSignal, 45000);
      });
    });
  }
  var persilCrcTable = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();
  function persilCrc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = persilCrcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function persilZipBuild(files) {
    var chunks = [], central = [], offset = 0;
    files.forEach(function (file) {
      var nameBytes = new TextEncoder().encode(file.name);
      var data = file.data;
      var crc = persilCrc32(data);
      var local = new Uint8Array(30 + nameBytes.length);
      var localView = new DataView(local.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, 0, true);
      localView.setUint16(12, 33, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, data.length, true);
      localView.setUint32(22, data.length, true);
      localView.setUint16(26, nameBytes.length, true);
      localView.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      chunks.push(local, data);
      var entry = new Uint8Array(46 + nameBytes.length);
      var entryView = new DataView(entry.buffer);
      entryView.setUint32(0, 0x02014b50, true);
      entryView.setUint16(4, 20, true);
      entryView.setUint16(6, 20, true);
      entryView.setUint16(8, 0x0800, true);
      entryView.setUint16(10, 0, true);
      entryView.setUint16(12, 0, true);
      entryView.setUint16(14, 33, true);
      entryView.setUint32(16, crc, true);
      entryView.setUint32(20, data.length, true);
      entryView.setUint32(24, data.length, true);
      entryView.setUint16(28, nameBytes.length, true);
      entryView.setUint16(30, 0, true);
      entryView.setUint16(32, 0, true);
      entryView.setUint16(34, 0, true);
      entryView.setUint16(36, 0, true);
      entryView.setUint32(38, 0, true);
      entryView.setUint32(42, offset, true);
      entry.set(nameBytes, 46);
      central.push(entry);
      offset += local.length + data.length;
    });
    var cdSize = central.reduce(function (sum, entry) { return sum + entry.length; }, 0);
    var eocd = new Uint8Array(22);
    var eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x06054b50, true);
    eocdView.setUint16(4, 0, true);
    eocdView.setUint16(6, 0, true);
    eocdView.setUint16(8, files.length, true);
    eocdView.setUint16(10, files.length, true);
    eocdView.setUint32(12, cdSize, true);
    eocdView.setUint32(16, offset, true);
    eocdView.setUint16(20, 0, true);
    return new Blob(chunks.concat(central, [eocd]), { type: 'application/zip' });
  }
  function persilSaveBlob(blob, fileName) {
    var objectUrl = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 4000);
  }
  function persilTimestamp() {
    var now = new Date();
    function pad(value) { return String(value).padStart(2, '0'); }
    return now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' + pad(now.getHours()) + pad(now.getMinutes());
  }
  function persilShowPreview(pngBlob) {
    var box = el('persilPreviewBox');
    var img = el('persilPreviewImg');
    if (!box || !img) return;
    if (persilState.lastPngUrl) URL.revokeObjectURL(persilState.lastPngUrl);
    persilState.lastPngUrl = URL.createObjectURL(pngBlob);
    img.src = persilState.lastPngUrl;
    box.hidden = false;
  }
  async function persilRun(opts) {
    opts = opts || {};
    if (persilState.busy) throw new Error('Masih ada proses unduhan persil yang berjalan.');
    var run = ++persilState.run;
    makeController();
    var signal = state.controller.signal;
    persilSetBusy(true);
    try {
      var spanInput = el('persilPrecision');
      var span = Number(opts.span) || Number(spanInput && spanInput.value) || 2000;
      var bboxText = opts.bbox != null ? opts.bbox : (el('persilBboxInput') ? el('persilBboxInput').value : '');
      var bounds = persilResolveBounds(bboxText);
      var plan = persilPlan(bounds, span);
      persilStatus('Menyiapkan filter enkripsi…');
      var filter = await persilEncryptFilter('%');
      if (run !== persilState.run) return null;
      var fullW = plan.cols * PERSIL_TILE;
      var fullH = plan.rows * PERSIL_TILE;
      var fullCanvas = document.createElement('canvas');
      fullCanvas.width = fullW;
      fullCanvas.height = fullH;
      var context = fullCanvas.getContext('2d');
      var total = plan.requests;
      var finished = 0;
      var nextIndex = 0;
      persilStatus('Mengunduh tile 0/' + total + ' (' + bounds.label + ', ≈' + Math.round(plan.res * 100) / 100 + ' m/px)…');
      async function worker() {
        while (nextIndex < total) {
          var index = nextIndex++;
          if (run !== persilState.run) return;
          var col = index % plan.cols;
          var row = (index / plan.cols) | 0;
          var tx0 = bounds.x0 + col * plan.span;
          var tx1 = tx0 + plan.span;
          var ty1 = bounds.y1 - row * plan.span;
          var ty0 = ty1 - plan.span;
          var bbox = [tx0, ty0, tx1, ty1].map(function (value) { return Math.round(value * 100) / 100; }).join(',');
          var bytes = await persilFetchTile(bbox, filter, signal);
          if (run !== persilState.run) return;
          var bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
          context.drawImage(bitmap, col * PERSIL_TILE, row * PERSIL_TILE);
          if (bitmap.close) bitmap.close();
          finished++;
          persilStatus('Mengunduh tile ' + finished + '/' + total + '…');
        }
      }
      await Promise.all([worker(), worker()]);
      if (run !== persilState.run) return null;
      var outCanvas = document.createElement('canvas');
      outCanvas.width = plan.outW;
      outCanvas.height = plan.outH;
      outCanvas.getContext('2d').drawImage(fullCanvas, 0, 0, plan.outW, plan.outH, 0, 0, plan.outW, plan.outH);
      var pngBlob = await new Promise(function (resolve) { outCanvas.toBlob(resolve, 'image/png'); });
      if (!pngBlob) throw new Error('Gagal membuat PNG hasil unduhan.');
      var opaque = null;
      if (plan.outW * plan.outH <= 4000000) {
        var pixels = outCanvas.getContext('2d').getImageData(0, 0, plan.outW, plan.outH).data;
        opaque = 0;
        for (var p = 3; p < pixels.length; p += 4) if (pixels[p] > 0) opaque++;
      }
      var pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
      var pgw = [plan.res, '0', '0', String(-plan.res), String(bounds.x0 + plan.res / 2), String(bounds.y1 - plan.res / 2)].join('\n') + '\n';
      var zipBlob = persilZipBuild([
        { name: 'persil-nasional.png', data: pngBytes },
        { name: 'persil-nasional.pgw', data: new TextEncoder().encode(pgw) },
        { name: 'persil-nasional.prj', data: new TextEncoder().encode(PERSIL_WKT_3857) }
      ]);
      var stats = {
        cols: plan.cols, rows: plan.rows, tiles: total, width: plan.outW, height: plan.outH,
        res: plan.res, pngBytes: pngBytes.length, zipBytes: zipBlob.size, opaque: opaque
      };
      persilShowPreview(pngBlob);
      if (opts.download !== false) persilSaveBlob(zipBlob, 'persil-nasional-' + persilTimestamp() + '.zip');
      persilStatus('Selesai: ' + plan.outW + '×' + plan.outH + ' px dari ' + total + ' tile (' + Math.round(zipBlob.size / 1024).toLocaleString('id-ID') + ' KB ZIP' + (opaque != null && opaque === 0 ? ' — tidak ada pixel persil terdeteksi di wilayah ini' : '') + ').');
      return stats;
    } finally {
      if (run === persilState.run) persilSetBusy(false);
    }
  }
  function persilCancelRun() {
    persilState.run++;
    if (state.controller) state.controller.abort();
    persilSetBusy(false);
    persilStatus('Unduhan persil dibatalkan.', true);
  }
  function persilDownloadGated() {
    if (typeof window.RKRequireGoogleLogin !== 'function') {
      persilStatus('Login Google belum siap. Muat ulang halaman lalu coba kembali.', true);
      return;
    }
    window.RKRequireGoogleLogin(function () {
      persilRun().catch(function (error) {
        if (error) persilStatus(error.message || String(error), true);
      });
    });
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
    var persilButton = el('persilDownloadBtn');
    if (persilButton) persilButton.addEventListener('click', persilDownloadGated);
    var persilCancelButton = el('persilCancelBtn');
    if (persilCancelButton) persilCancelButton.addEventListener('click', persilCancelRun);
    window.RKDownloadPersil = persilRun;
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
