/* Desa-level Land System polygons from BIG SatuPeta in GeoFarm. */
(function () {
  'use strict';

  var QUERY = 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/28/query';
  var SOURCE = 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/28';
  var QUERY_BATCH_SIZE = 100;
  var QUERY_CONCURRENCY = 3;
  var REQUEST_TIMEOUT_MS = 45000;
  var SERVICE_EXTENT = { xmin: 94.971951812, ymin: -11.007615377, xmax: 127.163453355, ymax: 6.076768401 };
  var controller = null;
  var generation = 0;
  var layer = null;
  var loading = false;
  var selectedVillage = null;
  var cachedVillages = null;

  function byId(id) { return document.getElementById(id); }

  function setStatus(message) {
    var status = byId('geotani-land-system-status');
    if (status) status.textContent = message || '';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function normalizeSearch(value) {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  function villageEntries() {
    if (cachedVillages) return cachedVillages;
    var all = window.KODE_WILAYAH_DATA || [];
    var byCode = Object.create(null);
    all.forEach(function (item) {
      if (item && item.kode) byCode[String(item.kode)] = item.nama || item.kode;
    });
    cachedVillages = all.filter(function (item) {
      return item && item.kode && String(item.kode).split('.').length === 4;
    }).map(function (item) {
      var parts = String(item.kode).split('.');
      var context = [byCode[parts.slice(0, 3).join('.')], byCode[parts.slice(0, 2).join('.')], byCode[parts[0]]]
        .filter(function (name) { return !!name; }).join(', ');
      return {
        kode: String(item.kode),
        nama: String(item.nama || item.kode),
        provinsi: byCode[parts[0]] || '',
        label: String(item.nama || item.kode) + (context ? ', ' + context : '')
      };
    });
    return cachedVillages;
  }

  function findVillages(query) {
    var q = normalizeSearch(query);
    if (q.length < 2) return [];
    return villageEntries().filter(function (item) {
      return normalizeSearch(item.label + ' ' + item.kode).indexOf(q) >= 0;
    }).slice(0, 20);
  }

  function setSelectedVillage(item) {
    selectedVillage = item || null;
    if (item) setStatus('');
    var input = byId('geotaniLandSystemVillageSearch');
    var results = byId('geotaniLandSystemVillageResults');
    var selected = byId('geotaniLandSystemVillageSelected');
    if (input) input.value = item ? item.label : '';
    if (results) { results.hidden = true; results.innerHTML = ''; }
    if (selected) {
      selected.textContent = item ? '✓ ' + item.label + ' (' + item.kode + ')' : '';
      selected.hidden = !item;
    }
  }

  function showVillageResults(query) {
    var results = byId('geotaniLandSystemVillageResults');
    if (!results) return;
    var matches = findVillages(query);
    results.innerHTML = '';
    if (!matches.length) { results.hidden = true; return; }
    matches.forEach(function (item) {
      var option = document.createElement('div');
      option.className = 'geotani-sls-result';
      option.textContent = item.label + ' (' + item.kode + ')';
      option.addEventListener('mousedown', function (event) {
        event.preventDefault();
        setSelectedVillage(item);
      });
      results.appendChild(option);
    });
    results.hidden = false;
  }

  function fetchJson(url, signal) {
    function request(target) {
      var requestController = new AbortController();
      var timeout = setTimeout(function () { requestController.abort(); }, REQUEST_TIMEOUT_MS);
      var abortFromParent = function () { requestController.abort(); };
      if (signal) {
        if (signal.aborted) requestController.abort();
        else signal.addEventListener('abort', abortFromParent, { once: true });
      }
      return fetch(target, { signal: requestController.signal }).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      }).then(function (data) {
        if (data && data.error) throw new Error(data.error.message || 'BIG SatuPeta mengembalikan error.');
        return data;
      }).finally(function () {
        clearTimeout(timeout);
        if (signal) signal.removeEventListener('abort', abortFromParent);
      });
    }
    return request(url).catch(function (originalError) {
      if (signal && signal.aborted) throw originalError;
      var proxy = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=' + encodeURIComponent(url);
      return request(proxy).catch(function () { throw originalError; });
    });
  }

  async function fetchSpatialFeatures(bounds, village, signal) {
    if (bounds[0] > SERVICE_EXTENT.xmax || bounds[2] < SERVICE_EXTENT.xmin ||
        bounds[1] > SERVICE_EXTENT.ymax || bounds[3] < SERVICE_EXTENT.ymin) {
      throw new Error('Desa ini berada di luar cakupan layer BIG SatuPeta (sekitar 95°–127° BT).');
    }
    var geometry = JSON.stringify({
      xmin: bounds[0], ymin: bounds[1], xmax: bounds[2], ymax: bounds[3],
      spatialReference: { wkid: 4326 }
    });
    var idParams = new URLSearchParams({
      where: '1=1', geometry: geometry, geometryType: 'esriGeometryEnvelope',
      spatialRel: 'esriSpatialRelIntersects', inSR: '4326', returnIdsOnly: 'true', f: 'json'
    });
    setStatus('Mencari poligon di sekitar ' + village.nama + '…');
    var idResponse = await fetchJson(QUERY + '?' + idParams.toString(), signal);
    var ids = idResponse.objectIds || [];
    if (!ids.length) return [];

    var batches = [];
    for (var i = 0; i < ids.length; i += QUERY_BATCH_SIZE) {
      batches.push(ids.slice(i, i + QUERY_BATCH_SIZE));
    }
    var results = new Array(batches.length);
    var next = 0;
    var completed = 0;
    var spatialController = new AbortController();
    var abortSpatial = function () { spatialController.abort(); };
    if (signal) {
      if (signal.aborted) spatialController.abort();
      else signal.addEventListener('abort', abortSpatial, { once: true });
    }
    function worker() {
      if (spatialController.signal.aborted) return Promise.resolve();
      if (next >= batches.length) return Promise.resolve();
      var index = next++;
      var params = new URLSearchParams({
        objectIds: batches[index].join(','),
        outFields: 'objectid,fcode,namobj,metadata,area,g_litho,m_lsysnam,m_relcls,m_dompro,m_ltype,m_region',
        returnGeometry: 'true', outSR: '4326', f: 'json'
      });
      return fetchJson(QUERY + '?' + params.toString(), spatialController.signal).then(function (data) {
        if (spatialController.signal.aborted) return;
        results[index] = data.features || [];
        completed += results[index].length;
        setStatus('Mengambil polygon ' + completed.toLocaleString('id-ID') + ' dari ' + ids.length.toLocaleString('id-ID') + ' untuk ' + village.nama + '…');
        return worker();
      }).catch(function (error) {
        if (!spatialController.signal.aborted) spatialController.abort();
        throw error;
      });
    }
    try {
      await Promise.all(Array.from({ length: Math.min(QUERY_CONCURRENCY, batches.length) }, worker));
      return [].concat.apply([], results);
    } finally {
      if (signal) signal.removeEventListener('abort', abortSpatial);
    }
  }

  function parseJsonValue(value) {
    if (typeof value !== 'string') return value;
    var text = value.trim();
    if (!text || (text.charAt(0) !== '{' && text.charAt(0) !== '[')) return null;
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  function getPropertyBag(record) {
    if (record && record.properties && typeof record.properties === 'object') return record.properties;
    if (record && record.attributes && typeof record.attributes === 'object') return record.attributes;
    return record || {};
  }

  function propertyValue(properties, name) {
    if (!properties) return undefined;
    if (properties[name] !== undefined) return properties[name];
    var target = String(name).toLowerCase();
    var key = Object.keys(properties).filter(function (candidate) {
      return candidate.toLowerCase() === target;
    })[0];
    return key ? properties[key] : undefined;
  }

  function convertEsriFeature(geometry, properties) {
    if (window.L && L.esri && L.esri.Util && typeof L.esri.Util.arcgisToGeoJSON === 'function') {
      try {
        var converted = L.esri.Util.arcgisToGeoJSON({ geometry: geometry, attributes: properties });
        if (converted && converted.type === 'Feature' && converted.geometry) return converted;
      } catch (e) { /* fall through to geometry normalization below */ }
    }
    if (geometry && geometry.rings) {
      return {
        type: 'Feature',
        properties: properties,
        geometry: { type: 'Polygon', coordinates: geometry.rings }
      };
    }
    return null;
  }

  function toFeature(record) {
    if (!record) return null;
    if (record.type === 'Feature' && record.geometry) return record;
    if (record.feature && record.feature.type === 'Feature') return record.feature;

    var props = getPropertyBag(record);
    var geometry = propertyValue(record, 'geometry') || propertyValue(record, 'geom') ||
      propertyValue(record, 'geojson') || propertyValue(record, 'geo_json') ||
      propertyValue(record, 'geometry_json') || propertyValue(record, 'shape') ||
      propertyValue(record, 'the_geom') || propertyValue(record, 'geom_json') ||
      propertyValue(record, 'wkb_geometry') || propertyValue(props, 'geometry') ||
      propertyValue(props, 'geom') || propertyValue(props, 'geojson') ||
      propertyValue(props, 'geo_json') || propertyValue(props, 'geometry_json') ||
      propertyValue(props, 'shape') || propertyValue(props, 'the_geom') ||
      propertyValue(props, 'geom_json') || propertyValue(props, 'wkb_geometry');
    geometry = parseJsonValue(geometry) || geometry;
    if (geometry && geometry.type === 'Feature' && geometry.geometry) return geometry;
    if (geometry && geometry.geometry && !geometry.coordinates && !geometry.rings) {
      var wrapped = convertEsriFeature(geometry.geometry, geometry.attributes || props);
      if (wrapped) return wrapped;
      geometry = geometry.geometry;
    }
    if (geometry && (geometry.rings || geometry.paths || geometry.x != null)) {
      var esriFeature = convertEsriFeature(geometry, props);
      if (esriFeature) return esriFeature;
    }
    if (!geometry || !geometry.type || !geometry.coordinates) return null;
    var cleanProps = {};
    Object.keys(props).forEach(function (key) {
      if (/^(geometry|geom|geojson|geo_json|geometry_json|shape|the_geom|geom_json|wkb_geometry)$/i.test(key)) return;
      var value = props[key];
      if (value == null || typeof value !== 'object') cleanProps[key] = value;
    });
    return { type: 'Feature', properties: cleanProps, geometry: geometry };
  }

  function featureBounds(feature) {
    var coordinates = feature && feature.geometry && feature.geometry.coordinates;
    if (!coordinates) return null;
    var bounds = [Infinity, Infinity, -Infinity, -Infinity];
    function visit(value) {
      if (!Array.isArray(value)) return;
      if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
        bounds[0] = Math.min(bounds[0], value[0]);
        bounds[1] = Math.min(bounds[1], value[1]);
        bounds[2] = Math.max(bounds[2], value[0]);
        bounds[3] = Math.max(bounds[3], value[1]);
        return;
      }
      value.forEach(visit);
    }
    visit(coordinates);
    return isFinite(bounds[0]) ? bounds : null;
  }

  function boundsOverlap(a, b) {
    return !!a && !!b && a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
  }

  function combinePolygonGeometries(features) {
    var polygons = [];
    (features || []).forEach(function (record) {
      var feature = toFeature(record);
      if (!feature || !feature.geometry) return;
      if (feature.geometry.type === 'Polygon') polygons.push(feature.geometry.coordinates);
      else if (feature.geometry.type === 'MultiPolygon') polygons = polygons.concat(feature.geometry.coordinates);
    });
    if (!polygons.length) return null;
    return {
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiPolygon', coordinates: polygons }
    };
  }

  function ringsFromBoundaryPath(value, output) {
    if (!Array.isArray(value)) return;
    if (value.length >= 4 && Array.isArray(value[0]) && typeof value[0][0] === 'number') {
      output.push(value.map(function (point) { return [Number(point[1]), Number(point[0])]; }));
      return;
    }
    value.forEach(function (part) { ringsFromBoundaryPath(part, output); });
  }

  async function loadVillageBoundary(village, signal) {
    var url = 'https://wilayah.smartartstudio.my.id/api/boundaries/' + encodeURIComponent(village.kode);
    var data = await fetchJson(url, signal);
    var rings = [];
    ringsFromBoundaryPath(data && data.path, rings);
    if (!rings.length) throw new Error('Batas desa/kelurahan ' + village.nama + ' tidak ditemukan.');
    return {
      type: 'Feature',
      properties: { nama: village.nama, kode: village.kode, provinsi: village.provinsi },
      geometry: { type: 'Polygon', coordinates: rings }
    };
  }

  function clipToVillage(feature, villageFeature) {
    if (!window.turf || typeof window.turf.intersect !== 'function') {
      throw new Error('Library pemotong polygon belum siap. Muat ulang halaman.');
    }
    try {
      var clipped = window.turf.intersect(window.turf.featureCollection([
        feature,
        villageFeature
      ]));
      if (!clipped || !clipped.geometry) return null;
      clipped.properties = feature.properties || {};
      return clipped;
    } catch (error) {
      return null;
    }
  }

  function popupHtml(feature, village) {
    var p = feature.properties || {};
    var fields = [
      ['namobj', 'Nama objek'], ['m_lsysnam', 'Nama sistem lahan'],
      ['m_relcls', 'Kelas relief'], ['m_dompro', 'Proses dominan'],
      ['m_ltype', 'Tipe bentang lahan'], ['g_litho', 'Litologi'],
      ['m_region', 'Region'], ['area', 'Luas']
    ];
    var rows = '<div class="agol-popup-field"><span class="agol-popup-field-label">Desa/Kelurahan</span><span class="agol-popup-field-value">' +
      escapeHtml(village ? village.label : '-') + '</span></div>';
    var shown = Object.create(null);
    fields.forEach(function (field) {
      var value = propertyValue(p, field[0]);
      if (value == null || value === '' || typeof value === 'object') return;
      shown[field[0].toLowerCase()] = true;
      rows += '<div class="agol-popup-field"><span class="agol-popup-field-label">' + field[1] +
        '</span><span class="agol-popup-field-value">' + escapeHtml(value) + '</span></div>';
    });
    Object.keys(p).filter(function (key) {
      return !shown[key.toLowerCase()] && key.charAt(0) !== '_' &&
        p[key] != null && typeof p[key] !== 'object';
    }).slice(0, 12).forEach(function (key) {
      rows += '<div class="agol-popup-field"><span class="agol-popup-field-label">' + escapeHtml(key) +
        '</span><span class="agol-popup-field-value">' + escapeHtml(p[key]) + '</span></div>';
    });
    var title = propertyValue(p, 'm_lsysnam') || propertyValue(p, 'namobj') ||
      propertyValue(p, 'fcode') || propertyValue(p, 'objectid') || 'Sistem Lahan';
    return '<div class="agol-popup">' +
      '<div class="agol-popup-header agol-geo-kawasan">' +
      '<div class="agol-popup-badge"><span class="agol-popup-badge-dot" style="background:#86efac;"></span>Sistem Lahan</div>' +
      '<div class="agol-popup-title">' + escapeHtml(title) + '</div>' +
      '</div>' +
      '<div class="agol-popup-body"><div class="agol-popup-fields">' + rows + '</div></div>' +
      '<div class="agol-popup-footer"><span>Sumber: Badan Informasi Geospasial (BIG) · ' +
      '<a href="' + SOURCE + '" target="_blank" rel="noopener noreferrer">BIG SatuPeta</a></span></div>' +
      '</div>';
  }

  function categoryColor(feature) {
    var p = feature.properties || {};
    var key = String(propertyValue(p, 'm_relcls') || propertyValue(p, 'unit_morf') ||
      propertyValue(p, 'landform') || propertyValue(p, 'm_lsysnam') ||
      propertyValue(p, 'fcode') || 'land-system');
    var hash = 0;
    for (var i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
    var palette = ['#8b6f47', '#6d8f63', '#a86f55', '#7387a6', '#9777a5', '#b28a45', '#4f9088', '#9a665f', '#79904e', '#727ca0'];
    return palette[Math.abs(hash) % palette.length];
  }

  function makeLayer(features, village) {
    var options = {
      style: function (feature) {
        var color = categoryColor(feature);
        return { color: '#394b39', weight: 0.35, opacity: 0.7, fillColor: color, fillOpacity: 0.58 };
      },
      onEachFeature: function (feature, polygon) {
        polygon.bindPopup(popupHtml(feature, village), { maxWidth: 340, className: 'agol-leaflet-popup' });
      }
    };
    /* Canvas keeps village layers usable when the service returns many
       polygons. Leaflet Canvas paths remain clickable. */
    if (typeof L.canvas === 'function') options.renderer = L.canvas({ padding: 0.5 });
    return L.geoJSON({ type: 'FeatureCollection', features: features }, {
      style: options.style,
      onEachFeature: options.onEachFeature,
      renderer: options.renderer
    });
  }

  function fitVillageBounds(bounds) {
    if (!bounds || !bounds.isValid()) return;
    var map = window.map || window._map;
    if (!map) return;
    var padded = bounds.pad(0.03);
    if (window.SheetDrag && typeof window.SheetDrag.flyToBoundsInVisibleMap === 'function') {
      window.SheetDrag.flyToBoundsInVisibleMap(padded, { maxZoom: 12, duration: 0.8 });
    } else {
      map.flyToBounds(padded, { maxZoom: 12, duration: 0.8 });
    }
  }

  async function loadAll() {
    var thisGeneration = generation;
    var village = selectedVillage;
    if (!village) throw new Error('Pilih desa/kelurahan terlebih dahulu.');
    controller = new AbortController();
    var signal = controller.signal;
    setStatus('Memuat batas ' + village.label + '…');
    var villageFeature = await loadVillageBoundary(village, signal);
    if (thisGeneration !== generation) return;
    var villageBounds = featureBounds(villageFeature);
    if (!villageBounds) throw new Error('Geometri batas desa/kelurahan tidak valid.');

    var rows = await fetchSpatialFeatures(villageBounds, village, signal);
    if (thisGeneration !== generation) return;
    setStatus('Memotong ' + rows.length.toLocaleString('id-ID') + ' poligon ke batas ' + village.nama + '…');
    var features = [];
    var seenIds = new Set();
    rows.forEach(function (row) {
      var feature = toFeature(row);
      if (!feature || !feature.geometry) return;
      var type = feature.geometry.type;
      if (type !== 'Polygon' && type !== 'MultiPolygon') return;
      var id = propertyValue(feature.properties, 'objectid');
      if (id != null) {
        var key = String(id);
        if (seenIds.has(key)) return;
        seenIds.add(key);
      }
      if (!boundsOverlap(featureBounds(feature), villageBounds)) return;
      var clipped = clipToVillage(feature, villageFeature);
      if (clipped) features.push(clipped);
    });

    if (thisGeneration !== generation) return;
    if (!features.length) {
      throw new Error('Tidak ada poligon Sistem Lahan yang beririsan dengan ' + village.label + '.');
    }
    if (!window.map || !window.L) throw new Error('Peta RuangKita belum siap.');

    var nextLayer = makeLayer(features, village);
    if (layer && window.map.hasLayer(layer)) window.map.removeLayer(layer);
    layer = nextLayer.addTo(window.map);
    var boundaryBounds = L.geoJSON(villageFeature).getBounds();
    fitVillageBounds(boundaryBounds && boundaryBounds.isValid() ? boundaryBounds : layer.getBounds());

    var output = byId('geotani-land-system-output');
    if (output) {
      var uniqueSystems = Object.create(null);
      features.forEach(function (feature) {
        var properties = feature.properties || {};
        var name = propertyValue(properties, 'm_lsysnam') || propertyValue(properties, 'namobj') ||
          propertyValue(properties, 'fcode') || propertyValue(properties, 'objectid');
        if (name != null && name !== '') uniqueSystems[String(name)] = true;
      });
      output.innerHTML = '<div class="geotani-lbslsd-summary">' +
        '<div><span>Desa/Kelurahan</span><b>' + escapeHtml(village.nama) + '</b></div>' +
        '<div><span>Poligon Sistem Lahan</span><b>' + features.length.toLocaleString('id-ID') + '</b></div>' +
        '<div><span>Nama sistem lahan</span><b>' + Object.keys(uniqueSystems).length.toLocaleString('id-ID') + '</b></div>' +
        '</div><div class="geotani-lbslsd-credit"><b>Sumber data:</b> Sistem Lahan BIG SatuPeta. ' +
        '<a href="' + SOURCE + '" target="_blank" rel="noopener noreferrer">BIG SatuPeta</a></div>';
    }
    setStatus('Data ' + village.label + ' selesai dimuat. Klik poligon untuk melihat atribut.');
  }
  function clearLayer() {
    generation++;
    if (controller) controller.abort();
    controller = null;
    loading = false;
    var map = window.map || window._map;
    if (layer && map && map.hasLayer(layer)) map.removeLayer(layer);
    layer = null;
    var output = byId('geotani-land-system-output');
    if (output) output.innerHTML = '';
    setStatus('');
    setSelectedVillage(null);
    var search = byId('geotaniLandSystemVillageSearch');
    var results = byId('geotaniLandSystemVillageResults');
    if (search) search.value = '';
    if (search) search.disabled = false;
    if (results) { results.hidden = true; results.innerHTML = ''; }
    var loadButton = byId('geotani-land-system-load');
    if (loadButton) loadButton.disabled = false;
  }

  function init() {
    var card = byId('geotani-land-system-card');
    var loadButton = byId('geotani-land-system-load');
    var resetButton = byId('geotani-land-system-reset');
    var search = byId('geotaniLandSystemVillageSearch');
    var results = byId('geotaniLandSystemVillageResults');
    if (!card || !loadButton || loadButton.__landSystemBound) return;
    loadButton.__landSystemBound = true;
    if (search && results) {
      search.addEventListener('input', function () {
        selectedVillage = null;
        var selected = byId('geotaniLandSystemVillageSelected');
        if (selected) { selected.textContent = ''; selected.hidden = true; }
        showVillageResults(search.value);
      });
      document.addEventListener('click', function (event) {
        if (!results.contains(event.target) && event.target !== search) {
          results.hidden = true;
          results.innerHTML = '';
        }
      });
    }
    loadButton.addEventListener('click', function () {
      if (loading) return;
      if (!selectedVillage) {
        setStatus('Pilih desa/kelurahan terlebih dahulu.');
        if (search) search.focus();
        return;
      }
      loading = true;
      var runGeneration = generation;
      loadButton.disabled = true;
      if (search) search.disabled = true;
      var map = window.map || window._map;
      if (layer && map && map.hasLayer(layer)) map.removeLayer(layer);
      layer = null;
      byId('geotani-land-system-output').innerHTML = '';
      loadAll().catch(function (error) {
        if (runGeneration !== generation) return;
        if (error && error.name === 'AbortError') return;
        console.error('[Land System Indonesia BIG]', error);
        setStatus(error && error.message ? error.message : 'Gagal memuat data Sistem Lahan BIG.');
      }).finally(function () {
        if (runGeneration === generation) {
          loading = false;
          loadButton.disabled = false;
          if (search) search.disabled = false;
          controller = null;
        }
      });
    });
    if (resetButton) resetButton.addEventListener('click', clearLayer);
  }

  window.GeoFarmLandSystem = {
    load: loadAll,
    reset: clearLayer,
    getLayer: function () { return layer; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
