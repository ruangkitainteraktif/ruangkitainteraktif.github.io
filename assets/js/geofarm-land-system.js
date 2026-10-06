/* InaLand BIG national Land System polygons in GeoFarm. */
(function () {
  'use strict';

  var API = 'https://inaland.big.go.id/panel/items/sistemlahan';
  var SOURCE = 'https://inaland.big.go.id/map';
  var REQUESTED_PAGE_SIZE = 500;
  var FALLBACK_PAGE_SIZE = 20;
  var REQUEST_TIMEOUT_MS = 45000;
  var MAX_PAGES = 10000;
  var controller = null;
  var generation = 0;
  var layer = null;
  var loading = false;
  var selectedDistrict = null;
  var cachedDistricts = null;

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

  function districtEntries() {
    if (cachedDistricts) return cachedDistricts;
    var all = window.KODE_WILAYAH_DATA || [];
    var byCode = Object.create(null);
    all.forEach(function (item) {
      if (item && item.kode) byCode[String(item.kode)] = item.nama || item.kode;
    });
    cachedDistricts = all.filter(function (item) {
      return item && item.kode && String(item.kode).split('.').length === 2;
    }).map(function (item) {
      var parts = String(item.kode).split('.');
      var province = byCode[parts[0]] || '';
      return {
        kode: String(item.kode),
        nama: String(item.nama || item.kode),
        provinsi: province,
        label: String(item.nama || item.kode) + (province ? ', ' + province : '')
      };
    });
    return cachedDistricts;
  }

  function findDistricts(query) {
    var q = normalizeSearch(query);
    if (q.length < 2) return [];
    return districtEntries().filter(function (item) {
      return normalizeSearch(item.label + ' ' + item.kode).indexOf(q) >= 0;
    }).slice(0, 20);
  }

  function setSelectedDistrict(item) {
    selectedDistrict = item || null;
    if (item) setStatus('');
    var input = byId('geotaniLandSystemDistrictSearch');
    var results = byId('geotaniLandSystemDistrictResults');
    var selected = byId('geotaniLandSystemDistrictSelected');
    if (input) input.value = item ? item.label : '';
    if (results) { results.hidden = true; results.innerHTML = ''; }
    if (selected) {
      selected.textContent = item ? '✓ ' + item.label + ' (' + item.kode + ')' : '';
      selected.hidden = !item;
    }
  }

  function showDistrictResults(query) {
    var results = byId('geotaniLandSystemDistrictResults');
    if (!results) return;
    var matches = findDistricts(query);
    results.innerHTML = '';
    if (!matches.length) { results.hidden = true; return; }
    matches.forEach(function (item) {
      var option = document.createElement('div');
      option.className = 'geotani-sls-result';
      option.textContent = item.label + ' (' + item.kode + ')';
      option.addEventListener('mousedown', function (event) {
        event.preventDefault();
        setSelectedDistrict(item);
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
        if (data && data.error) throw new Error(data.error.message || 'InaLand BIG mengembalikan error.');
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

  function firstArray(payload, depth) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object' || depth > 4) return null;
    var keys = ['features', 'items', 'records', 'rows', 'results', 'result', 'data', 'list', 'geojson', 'geo_json'];
    for (var i = 0; i < keys.length; i++) {
      var value = payload[keys[i]];
      if (Array.isArray(value)) return value;
      if (value && typeof value === 'object') {
        var nested = firstArray(value, depth + 1);
        if (nested) return nested;
      }
    }
    return null;
  }

  function firstNumber(payload, keys, depth) {
    if (!payload || typeof payload !== 'object' || depth > 4) return null;
    for (var i = 0; i < keys.length; i++) {
      var value = Number(payload[keys[i]]);
      if (payload[keys[i]] != null && isFinite(value) && value >= 0) return value;
    }
    var nestedKeys = ['pagination', 'meta', 'page', 'data', 'result'];
    for (var j = 0; j < nestedKeys.length; j++) {
      var nested = payload[nestedKeys[j]];
      if (nested && typeof nested === 'object') {
        var found = firstNumber(nested, keys, depth + 1);
        if (found != null) return found;
      }
    }
    return null;
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

  async function loadDistrictBoundary(district, signal) {
    var codeVariants = [district.kode, district.kode.replace('.', '')];
    var lastError = null;
    for (var i = 0; i < codeVariants.length; i++) {
      var query = new URLSearchParams({
        where: "KDPKAB='" + codeVariants[i].replace(/'/g, "''") + "'",
        f: 'json', returnGeometry: 'true', outSR: '4326', outFields: '*', geometryPrecision: '5'
      });
      var url = 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_KABKOTA_AR/MapServer/0/query?' + query.toString();
      try {
        var response = await fetchJson(url, signal);
        if (response && response.error) throw new Error(response.error.message || 'Batas BIG gagal dimuat.');
        var boundary = combinePolygonGeometries(response && response.features);
        if (boundary) {
          boundary.properties = { nama: district.nama, kode: district.kode, provinsi: district.provinsi };
          return boundary;
        }
      } catch (error) {
        if (signal && signal.aborted) throw error;
        lastError = error;
      }
    }

    if (signal && signal.aborted) throw new Error('Pemuatan dibatalkan.');
    try {
      var fallbackUrl = 'https://wilayah.smartartstudio.my.id/api/boundaries/' + encodeURIComponent(district.kode);
      var fallback = await fetchJson(fallbackUrl, signal);
      var rings = [];
      ringsFromBoundaryPath(fallback && fallback.path, rings);
      if (rings.length) {
        return {
          type: 'Feature',
          properties: { nama: district.nama, kode: district.kode, provinsi: district.provinsi },
          geometry: { type: 'Polygon', coordinates: rings }
        };
      }
    } catch (error) {
      if (signal && signal.aborted) throw error;
      lastError = lastError || error;
    }
    throw new Error(lastError && lastError.message
      ? 'Batas ' + district.nama + ' tidak dapat dimuat: ' + lastError.message
      : 'Batas ' + district.nama + ' tidak ditemukan.');
  }

  function clipToDistrict(feature, districtFeature) {
    if (!window.turf || typeof window.turf.intersect !== 'function') {
      throw new Error('Library pemotong polygon belum siap. Muat ulang halaman.');
    }
    try {
      var clipped = window.turf.intersect(window.turf.featureCollection([
        feature,
        districtFeature
      ]));
      if (!clipped || !clipped.geometry) return null;
      clipped.properties = feature.properties || {};
      return clipped;
    } catch (error) {
      return null;
    }
  }

  function pageUrl(page, pageSize) {
    return API + '?limit=' + pageSize + '&sort=objectid&page=' + page;
  }

  async function fetchPage(page, signal, pageSizeState) {
    try {
      return await fetchJson(pageUrl(page, pageSizeState.value), signal);
    } catch (error) {
      if ((signal && signal.aborted) || pageSizeState.value === FALLBACK_PAGE_SIZE) throw error;
      pageSizeState.value = FALLBACK_PAGE_SIZE;
      setStatus('Ukuran halaman besar ditolak layanan; melanjutkan dengan 20 record per halaman…');
      return fetchJson(pageUrl(page, pageSizeState.value), signal);
    }
  }

  function popupHtml(feature, district) {
    var p = feature.properties || {};
    var fields = [
      ['namobj', 'Nama objek'], ['m_lsysnam', 'Nama sistem lahan'],
      ['m_relcls', 'Kelas relief'], ['m_dompro', 'Proses dominan'],
      ['m_ltype', 'Tipe bentang lahan'], ['g_litho', 'Litologi'],
      ['m_region', 'Region'], ['area', 'Luas']
    ];
    var rows = '<div class="geotani-sls-popup-row"><span>Kabupaten/Kota</span><b>' +
      escapeHtml(district ? district.label : '-') + '</b></div>';
    var shown = Object.create(null);
    fields.forEach(function (field) {
      var value = propertyValue(p, field[0]);
      if (value == null || value === '' || typeof value === 'object') return;
      shown[field[0].toLowerCase()] = true;
      rows += '<div class="geotani-sls-popup-row"><span>' + field[1] +
        '</span><b>' + escapeHtml(value) + '</b></div>';
    });
    Object.keys(p).filter(function (key) {
      return !shown[key.toLowerCase()] && key.charAt(0) !== '_' &&
        p[key] != null && typeof p[key] !== 'object';
    }).slice(0, 12).forEach(function (key) {
      rows += '<div class="geotani-sls-popup-row"><span>' + escapeHtml(key) +
        '</span><b>' + escapeHtml(p[key]) + '</b></div>';
    });
    var title = propertyValue(p, 'm_lsysnam') || propertyValue(p, 'namobj') ||
      propertyValue(p, 'fcode') || propertyValue(p, 'objectid') || 'Sistem Lahan';
    return '<div class="geotani-sls-popup"><div class="geotani-sls-popup-title">' +
      escapeHtml(title) + '</div>' + rows +
      '<div class="geotani-lbslsd-credit"><b>Sumber:</b> Badan Informasi Geospasial (BIG) · ' +
      '<a href="' + SOURCE + '" target="_blank" rel="noopener noreferrer">InaLand Sistem Lahan</a></div></div>';
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

  function makeLayer(features, district) {
    var options = {
      style: function (feature) {
        var color = categoryColor(feature);
        return { color: '#394b39', weight: 0.35, opacity: 0.7, fillColor: color, fillOpacity: 0.58 };
      },
      onEachFeature: function (feature, polygon) {
        polygon.bindPopup(popupHtml(feature, district), { maxWidth: 340, className: 'agol-leaflet-popup' });
      }
    };
    /* Canvas keeps county layers usable when the service returns many
       polygons. Leaflet Canvas paths remain clickable. */
    if (typeof L.canvas === 'function') options.renderer = L.canvas({ padding: 0.5 });
    return L.geoJSON({ type: 'FeatureCollection', features: features }, {
      style: options.style,
      onEachFeature: options.onEachFeature,
      renderer: options.renderer
    });
  }

  function fitCountyBounds(bounds) {
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
    var district = selectedDistrict;
    if (!district) throw new Error('Pilih kabupaten/kota terlebih dahulu.');
    controller = new AbortController();
    var signal = controller.signal;
    setStatus('Memuat batas ' + district.label + '…');
    var districtFeature = await loadDistrictBoundary(district, signal);
    if (thisGeneration !== generation) return;
    var districtBounds = featureBounds(districtFeature);
    if (!districtBounds) throw new Error('Geometri batas kabupaten/kota tidak valid.');
    var pages = 0;
    var total = null;
    var lastPage = null;
    var recordsRead = 0;
    var features = [];
    var seenIds = new Set();
    var pageSignatures = new Set();
    var pageSizeState = { value: REQUESTED_PAGE_SIZE };

    for (var page = 1; page <= MAX_PAGES; page++) {
      if (thisGeneration !== generation) return;
      setStatus('Mencari poligon ' + district.nama + ' · halaman ' + page + '…');
      var payload = await fetchPage(page, signal, pageSizeState);
      if (thisGeneration !== generation) return;

      var rows = firstArray(payload, 0) || [];
      if (page === 1) {
        /* Avoid the ambiguous `count` key: several APIs use it for this page,
           which would otherwise stop pagination after page one. */
        total = firstNumber(payload, ['total', 'totalItems', 'total_items', 'recordsTotal', 'totalRecords'], 0);
        lastPage = firstNumber(payload, ['last_page', 'lastPage', 'total_pages', 'totalPages', 'pages'], 0);
      }
      if (!rows.length) break;
      var rowIds = rows.map(function (row) {
        var properties = getPropertyBag(row);
        var id = propertyValue(row, 'objectid');
        if (id == null) id = propertyValue(row, 'id');
        if (id == null) id = propertyValue(row, 'fid');
        if (id == null) id = propertyValue(row, 'ogc_fid');
        if (id == null) id = propertyValue(properties, 'objectid');
        if (id == null) id = propertyValue(properties, 'id');
        if (id == null) id = propertyValue(properties, 'fid');
        if (id == null) id = propertyValue(properties, 'ogc_fid');
        return id == null ? null : String(id);
      });
      if (rowIds.length && rowIds.every(function (id) { return id != null; })) {
        var signature = rowIds.join('|');
        if (pageSignatures.has(signature)) {
          throw new Error('Paginasi InaLand mengembalikan halaman yang sama berulang kali; data dihentikan agar tidak menggambar duplikat.');
        }
        pageSignatures.add(signature);
      }
      pages = page;
      recordsRead += rows.length;
      rows.forEach(function (row) {
        var feature = toFeature(row);
        if (!feature || !feature.geometry) return;
        var type = feature.geometry.type;
        if (type !== 'Polygon' && type !== 'MultiPolygon') return;
        var id = propertyValue(feature.properties, 'objectid');
        if (id == null) id = propertyValue(feature.properties, 'id');
        if (id == null) id = propertyValue(feature.properties, 'fid');
        if (id == null) id = propertyValue(feature.properties, 'ogc_fid');
        if (id != null) {
          var key = String(id);
          if (seenIds.has(key)) return;
          seenIds.add(key);
        }
        if (!boundsOverlap(featureBounds(feature), districtBounds)) return;
        var clipped = clipToDistrict(feature, districtFeature);
        if (clipped) features.push(clipped);
      });

      var progress = total != null && total > 0
        ? ' · ' + Math.min(100, Math.round(recordsRead / total * 100)) + '%'
        : '';
      setStatus('Memeriksa ' + recordsRead.toLocaleString('id-ID') +
        (total != null ? ' / ' + total.toLocaleString('id-ID') : '') +
        ' record nasional · ' + features.length.toLocaleString('id-ID') +
        ' poligon ' + district.nama + progress);

      if (lastPage != null && lastPage > 0 && page >= lastPage) break;
      if (page === MAX_PAGES) throw new Error('Batas halaman aman tercapai sebelum semua halaman selesai dimuat.');
      if (page % 10 === 0) await new Promise(function (resolve) { setTimeout(resolve, 80); });
    }

    if (thisGeneration !== generation) return;
    if (!features.length) {
      throw new Error('Tidak ada poligon Sistem Lahan yang beririsan dengan ' + district.label + '.');
    }
    if (!window.map || !window.L) throw new Error('Peta RuangKita belum siap.');

    var nextLayer = makeLayer(features, district);
    if (layer && window.map.hasLayer(layer)) window.map.removeLayer(layer);
    layer = nextLayer.addTo(window.map);
    var boundaryBounds = L.geoJSON(districtFeature).getBounds();
    fitCountyBounds(boundaryBounds && boundaryBounds.isValid() ? boundaryBounds : layer.getBounds());

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
        '<div><span>Kabupaten/Kota</span><b>' + escapeHtml(district.nama) + '</b></div>' +
        '<div><span>Poligon Sistem Lahan</span><b>' + features.length.toLocaleString('id-ID') + '</b></div>' +
        '<div><span>Nama sistem lahan</span><b>' + Object.keys(uniqueSystems).length.toLocaleString('id-ID') + '</b></div>' +
        '</div><div class="geotani-lbslsd-credit"><b>Sumber data:</b> Sistem Lahan 1:50.000, Badan Informasi Geospasial (BIG). ' +
        '<a href="' + SOURCE + '" target="_blank" rel="noopener noreferrer">InaLand BIG</a></div>';
    }
    setStatus('Data ' + district.label + ' selesai dimuat. Klik poligon untuk melihat atribut.');
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
    setSelectedDistrict(null);
    var search = byId('geotaniLandSystemDistrictSearch');
    var results = byId('geotaniLandSystemDistrictResults');
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
    var search = byId('geotaniLandSystemDistrictSearch');
    var results = byId('geotaniLandSystemDistrictResults');
    if (!card || !loadButton || loadButton.__landSystemBound) return;
    loadButton.__landSystemBound = true;
    if (search && results) {
      search.addEventListener('input', function () {
        selectedDistrict = null;
        var selected = byId('geotaniLandSystemDistrictSelected');
        if (selected) { selected.textContent = ''; selected.hidden = true; }
        showDistrictResults(search.value);
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
      if (!selectedDistrict) {
        setStatus('Pilih kabupaten/kota terlebih dahulu.');
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
