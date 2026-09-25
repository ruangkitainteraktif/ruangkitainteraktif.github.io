(function () {
  'use strict';

  var IMAGE_SERVER = 'https://geoservices.big.go.id/raster/rest/services/DEMNAS/DEM_Indonesia/ImageServer/query';
  var LOCAL_CATALOG_URL = 'assets/data/demnas-index.json';
  var PROXY_PREFIX = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';
  var PAGE_SIZE = 1000;
  var EXPORT_DIMS = [1024, 512, 256, 128, 64];
  var DEMNAS_WHERE = "Category=1 AND Name LIKE 'DEMNAS_%'";
  var DEFAULT_PIXEL_SIZE = 7.4985e-5;
  var NO_DATA = Number.NaN;
  var BOUNDARY_CONFIG = {
    '2': { label: 'Kabupaten/Kota', field: 'KDPKAB', url: 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_KABKOTA_AR/MapServer/0/query' },
    '3': { label: 'Kecamatan', field: 'KDCPUM', url: 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_KECAMATAN_AR/MapServer/0/query' },
    '4': { label: 'Desa/Kelurahan', field: 'KDEPUM', url: 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_DESAKEL_AR/MapServer/0/query' }
  };
  var RECOMMENDATION_CONFIG = {
    '2': { label: 'Kabupaten/Kota', field: 'KDPKAB', name: 'NAMOBJ', parent: '', url: BOUNDARY_CONFIG['2'].url },
    '3': { label: 'Kecamatan', field: 'KDCPUM', name: 'NAMOBJ', parent: 'WADMKK', url: BOUNDARY_CONFIG['3'].url },
    '4': { label: 'Desa/Kelurahan', field: 'KDEPUM', name: 'NAMOBJ', parent: 'WADMKK', url: BOUNDARY_CONFIG['4'].url }
  };
  var ADMIN_RESULT_LIMIT = 100;

  var _active = false;
  var _catalog = [];
  var _catalogPromise = null;
  var _selectedFeature = null;
  var _polygonLayer = null;
  var _adminDataPromise = null;
  var _adminEntries = [];
  var _adminByCode = {};
  var _adminLevel = '';
  var _selectedAdmin = null;
  var _selectedBoundary = null;
  var _clipBoundaryLayer = null;
  var _clipImageLayer = null;
  var _clipRasterResult = null;
  var _clipCacheKey = '';
  var _clipPreviewPromise = null;
  var _clipPreviewRun = 0;
  var _clipPreviewPolygonOnly = false;
  var _adminRequest = 0;
  var _recommendations = [];
  var _recommendationRun = 0;

  function setStatus(message, isError) {
    var element = document.getElementById('demnasStatus');
    if (!element) return;
    if (!message) {
      element.style.display = 'none';
      element.textContent = '';
      element.classList.remove('demnas-status--error');
      return;
    }
    element.style.display = '';
    element.textContent = message;
    element.classList.toggle('demnas-status--error', !!isError);
  }

  function setBusy(busy) {
    var button = document.getElementById('demnasDownloadBtn');
    var select = document.getElementById('demnasNamobjSelect');
    var controls = ['demnasAdminLevel', 'demnasAdminSearch', 'demnasAdminSelect', 'demnasClipRefreshBtn', 'demnasClipResetBtn', 'demnasRecommendedSelect'];
    if (button) button.disabled = busy;
    if (select) select.disabled = busy;
    controls.forEach(function (id) {
      var element = document.getElementById(id);
      if (element) element.disabled = busy;
    });
  }

  function setPreviewStatus(message, isError) {
    var element = document.getElementById('demnasPreviewStatus');
    if (!element) return;
    element.textContent = message || '';
    element.classList.toggle('is-error', !!isError);
  }

  function normalizeSearchText(value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('id-ID')
      .trim();
  }

  function loadAdminData() {
    if (_adminDataPromise) return _adminDataPromise;
    var loader = typeof getGeoidWilayahData === 'function'
      ? Promise.resolve().then(function () { return getGeoidWilayahData(); })
      : fetch('assets/data/kode_wilayah.json').then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      });
    _adminDataPromise = loader.then(function (data) {
      var list = Array.isArray(data) ? data : data && data.value;
      if (!Array.isArray(list)) throw new Error('Data kode wilayah tidak valid.');
      _adminEntries = list.filter(function (item) {
        return item && item.kode && item.nama && String(item.kode).split('.').length >= 2;
      }).map(function (item) {
        return { kode: String(item.kode), nama: String(item.nama) };
      });
      _adminByCode = {};
      _adminEntries.forEach(function (item) { _adminByCode[item.kode] = item; });
      return _adminEntries;
    }).catch(function (error) {
      _adminDataPromise = null;
      throw error;
    });
    return _adminDataPromise;
  }

  function adminEntryLabel(item) {
    var parts = item.kode.split('.');
    var parent = '';
    if (parts.length === 4) {
      var kecamatan = _adminByCode[parts.slice(0, 3).join('.')];
      var kabupaten = _adminByCode[parts.slice(0, 2).join('.')];
      parent = [kecamatan && kecamatan.nama, kabupaten && kabupaten.nama].filter(Boolean).join(', ');
    } else if (parts.length === 3) {
      var kab = _adminByCode[parts.slice(0, 2).join('.')];
      parent = kab && kab.nama || '';
    }
    return item.nama + (parent ? ' — ' + parent : '') + ' [' + item.kode + ']';
  }

  function updateAdminVisibility() {
    var searchWrap = document.getElementById('demnasAdminSearchWrap');
    var selected = document.getElementById('demnasAdminSelected');
    var refresh = document.getElementById('demnasClipRefreshBtn');
    var reset = document.getElementById('demnasClipResetBtn');
    if (searchWrap) searchWrap.hidden = !_adminLevel;
    if (selected) selected.hidden = !_selectedAdmin;
    if (refresh) refresh.hidden = !_selectedAdmin || !_selectedFeature;
    if (reset) reset.hidden = !(_selectedFeature || _selectedAdmin || _selectedBoundary);
  }

  function populateAdminOptions() {
    var select = document.getElementById('demnasAdminSelect');
    var search = document.getElementById('demnasAdminSearch');
    var count = document.getElementById('demnasAdminSearchCount');
    if (!select || !_adminLevel) return;
    var query = normalizeSearchText(search ? search.value : '');
    var matches = _adminEntries.filter(function (item) {
      if (String(item.kode).split('.').length !== Number(_adminLevel)) return false;
      if (!query) return true;
      return normalizeSearchText(item.nama + ' ' + item.kode).indexOf(query) !== -1;
    });
    matches.sort(function (a, b) { return a.nama.localeCompare(b.nama, 'id-ID'); });
    var visible = matches.slice(0, ADMIN_RESULT_LIMIT);
    select.innerHTML = '';
    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = visible.length ? 'Pilih wilayah…' : 'Wilayah tidak ditemukan';
    placeholder.disabled = !visible.length;
    select.appendChild(placeholder);
    visible.forEach(function (item) {
      var option = document.createElement('option');
      option.value = item.kode;
      option.textContent = adminEntryLabel(item);
      select.appendChild(option);
    });
    if (count) count.textContent = query ? matches.length.toLocaleString('id-ID') + ' wilayah cocok' : 'Pilih hasil pencarian wilayah';
    if (_selectedAdmin) select.value = _selectedAdmin.kode;
  }

  function clearAdminSelection() {
    _selectedAdmin = null;
    _selectedBoundary = null;
    _clipRasterResult = null;
    _clipCacheKey = '';
    clearClipPreview();
    var selected = document.getElementById('demnasAdminSelected');
    if (selected) {
      selected.hidden = true;
      selected.textContent = '';
    }
    updateAdminVisibility();
  }

  function setRecommendationStatus(message, isError) {
    var element = document.getElementById('demnasRecommendationStatus');
    if (!element) return;
    element.textContent = message || '';
    element.classList.toggle('is-error', !!isError);
  }

  function clearRecommendations() {
    _recommendationRun++;
    _recommendations = [];
    var box = document.getElementById('demnasRecommendationBox');
    var select = document.getElementById('demnasRecommendedSelect');
    var count = document.getElementById('demnasRecommendationCount');
    if (box) box.hidden = true;
    if (count) count.textContent = '';
    if (select) {
      select.innerHTML = '<option value="">Pilih rekomendasi wilayah…</option>';
      select.disabled = false;
    }
    setRecommendationStatus('');
  }

  function attributeValue(attributes, name) {
    if (!attributes) return '';
    var target = String(name).toLowerCase();
    var keys = Object.keys(attributes);
    for (var index = 0; index < keys.length; index++) {
      if (keys[index].toLowerCase() === target) return attributes[keys[index]];
    }
    return '';
  }

  function recommendationLabel(item) {
    return item.name + (item.parent ? ' — ' + item.parent : '') + ' [' + item.code + ']';
  }

  function recommendationQueryUrl(level, bounds) {
    var config = RECOMMENDATION_CONFIG[String(level)];
    var pad = 0.0001;
    var query = new URLSearchParams({
      where: '1=1',
      geometry: [bounds.minX - pad, bounds.minY - pad, bounds.maxX + pad, bounds.maxY + pad].join(','),
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: config.field + ',' + config.name + (config.parent ? ',' + config.parent : ''),
      returnGeometry: 'false',
      returnCountOnly: 'false',
      outSR: '4326',
      resultRecordCount: '200',
      f: 'json'
    });
    return config.url + '?' + query.toString();
  }

  function queryRecommendedRegions(level, bounds) {
    var config = RECOMMENDATION_CONFIG[String(level)];
    return fetchWithProxy(recommendationQueryUrl(level, bounds), 'json').then(function (data) {
      if (data && data.error) throw new Error(data.error.message || 'BIG RBI gagal');
      return (data && data.features || []).map(function (feature) {
        var attributes = feature && feature.attributes || {};
        var code = String(attributeValue(attributes, config.field) || '').trim();
        var name = String(attributeValue(attributes, config.name) || '').trim();
        if (!code || !name) return null;
        return {
          level: String(level),
          code: code,
          name: name,
          parent: config.parent ? String(attributeValue(attributes, config.parent) || '').trim() : '',
          key: String(level) + '|' + code
        };
      }).filter(Boolean);
    });
  }

  function renderRecommendations(items, errorCount) {
    var box = document.getElementById('demnasRecommendationBox');
    var select = document.getElementById('demnasRecommendedSelect');
    var count = document.getElementById('demnasRecommendationCount');
    if (!box || !select) return;
    box.hidden = false;
    select.innerHTML = '';
    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = items.length ? 'Pilih rekomendasi wilayah…' : 'Tidak ada wilayah yang beririsan';
    placeholder.disabled = !items.length;
    select.appendChild(placeholder);
    var grouped = {};
    items.forEach(function (item) {
      if (!grouped[item.level]) grouped[item.level] = [];
      grouped[item.level].push(item);
    });
    ['4', '3', '2'].forEach(function (level) {
      if (!grouped[level]) return;
      var group = document.createElement('optgroup');
      group.label = RECOMMENDATION_CONFIG[level].label;
      grouped[level].sort(function (first, second) { return first.name.localeCompare(second.name, 'id-ID'); }).forEach(function (item) {
        var option = document.createElement('option');
        option.value = item.key;
        option.textContent = recommendationLabel(item);
        group.appendChild(option);
      });
      select.appendChild(group);
    });
    if (count) count.textContent = items.length ? items.length + ' opsi' : '0 opsi';
    setRecommendationStatus(errorCount ? 'Sebagian data wilayah gagal dimuat. Pilih hasil yang tersedia.' : 'Pilih rekomendasi untuk langsung clip raster.', !!errorCount);
  }

  function applyRecommendation(value) {
    var item = _recommendations.find(function (entry) { return entry.key === String(value || ''); });
    if (!item) return Promise.resolve(null);
    var levelSelect = document.getElementById('demnasAdminLevel');
    _adminRequest++;
    _adminLevel = item.level;
    if (levelSelect) levelSelect.value = item.level;
    clearAdminSelection();
    var search = document.getElementById('demnasAdminSearch');
    if (search) search.value = item.name;
    updateAdminVisibility();
    return loadAdminData().then(function () {
      if (!_adminByCode[item.code]) {
        _adminEntries.push({ kode: item.code, nama: item.name });
        _adminByCode[item.code] = { kode: item.code, nama: item.name };
      }
      populateAdminOptions();
      var adminSelect = document.getElementById('demnasAdminSelect');
      if (adminSelect) adminSelect.value = item.code;
      updateAdminVisibility();
      return selectAdminEntry(item.code);
    }).catch(function (error) {
      setPreviewStatus(error && error.message ? error.message : String(error), true);
      return null;
    });
  }

  function loadRecommendations(feature) {
    clearRecommendations();
    if (!feature) return Promise.resolve([]);
    var run = _recommendationRun;
    var box = document.getElementById('demnasRecommendationBox');
    if (box) box.hidden = false;
    setRecommendationStatus('Memuat wilayah yang beririsan…');
    var select = document.getElementById('demnasRecommendedSelect');
    if (select) {
      select.innerHTML = '<option value="">Memuat rekomendasi…</option>';
      select.disabled = true;
    }
    var bounds;
    try {
      bounds = featureBounds(feature);
    } catch (error) {
      if (select) {
        select.disabled = false;
        select.innerHTML = '<option value="">Gunakan pencarian wilayah manual</option>';
      }
      setRecommendationStatus(error && error.message ? error.message : String(error), true);
      return Promise.resolve([]);
    }
    var levels = Object.keys(RECOMMENDATION_CONFIG);
    var requests = levels.map(function (level) {
      return queryRecommendedRegions(level, bounds).then(function (items) {
        return { level: level, items: items };
      }).catch(function () {
        return { level: level, items: [], error: true };
      });
    });
    return Promise.all(requests).then(function (results) {
      if (run !== _recommendationRun) return [];
      var items = [];
      var errorCount = 0;
      results.forEach(function (result) {
        items = items.concat(result.items || []);
        if (result.error) errorCount++;
      });
      var unique = {};
      items = items.filter(function (item) {
        if (unique[item.key]) return false;
        unique[item.key] = true;
        return true;
      });
      _recommendations = items;
      var recommendationSelect = document.getElementById('demnasRecommendedSelect');
      if (recommendationSelect) recommendationSelect.disabled = false;
      renderRecommendations(_recommendations, errorCount);
      return _recommendations;
    });
  }

  function fetchWithProxy(url, responseType) {
    function read(response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      if (responseType === 'blob') return response.blob();
      return response.json();
    }
    return fetch(url).then(read).catch(function () {
      return fetch(PROXY_PREFIX + encodeURIComponent(url)).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status + ' (proxy)');
        if (responseType === 'blob') return response.blob();
        return response.json();
      });
    });
  }

  function queryUrl(options) {
    var query = [
      'where=' + encodeURIComponent(options.where || '1=1'),
      'objectIds=',
      'time=',
      'geometry=',
      'geometryType=esriGeometryEnvelope',
      'inSR=',
      'spatialRel=esriSpatialRelIntersects',
      'relationParam=',
      'outFields=' + encodeURIComponent(options.outFields || '*'),
      'returnGeometry=' + (options.returnGeometry ? 'true' : 'false'),
      'outSR=4326',
      'returnIdsOnly=false',
      'returnCountOnly=' + (options.returnCountOnly ? 'true' : 'false'),
      'returnExtentOnly=false',
      'pixelSize=',
      'rasterQuery=',
      'orderByFields=',
      'groupByFieldsForStatistics=',
      'outStatistics=',
      'returnDistinctValues=false',
      'multidimensionalDefinition=',
      'returnTrueCurves=false',
      'maxAllowableOffset=',
      'geometryPrecision=',
      'f=json'
    ];
    if (!options.returnCountOnly) {
      query.push('resultOffset=' + (options.offset || 0));
      query.push('resultRecordCount=' + (options.count || PAGE_SIZE));
    }
    return IMAGE_SERVER + '?' + query.join('&');
  }

  function loadRemoteCatalog() {
    return fetchWithProxy(queryUrl({ where: DEMNAS_WHERE, returnCountOnly: true, returnGeometry: false }), 'json').then(function (countResponse) {
      var total = Number(countResponse && countResponse.count);
      if (!total) throw new Error('Katalog DEMNAS kosong.');
      var pages = Math.ceil(total / PAGE_SIZE);
      var features = [];
      var chain = Promise.resolve();
      for (var page = 0; page < pages; page++) {
        chain = chain.then(function (offset) {
          setStatus('Memuat katalog DEMNAS… ' + Math.min(offset + PAGE_SIZE, total) + '/' + total);
          return fetchWithProxy(queryUrl({ where: DEMNAS_WHERE, returnCountOnly: false, returnGeometry: true, count: PAGE_SIZE, offset: offset }), 'json').then(function (response) {
            if (!response || !response.features) throw new Error('Respons katalog DEMNAS tidak valid.');
            features = features.concat(response.features);
          });
        }(page * PAGE_SIZE));
      }
      return chain.then(function () {
        _catalog = features;
        return _catalog;
      });
    });
  }

  function loadCatalog() {
    if (_catalogPromise) return _catalogPromise;
    _catalogPromise = fetchWithProxy(LOCAL_CATALOG_URL, 'json').then(function (data) {
      if (!data || !data.features || !data.features.length) throw new Error('Katalog DEMNAS lokal kosong.');
      _catalog = data.features;
      return _catalog;
    }).catch(function () {
      return loadRemoteCatalog();
    }).catch(function (error) {
      _catalogPromise = null;
      throw error;
    });
    return _catalogPromise;
  }

  function featureName(feature) {
    return String(feature && feature.attributes && feature.attributes.Name || '').trim();
  }

  function sheetFilename(feature) {
    var name = featureName(feature);
    if (!name) throw new Error('Feature DEMNAS tidak memiliki Name.');
    return name.replace(/\.tif$/i, '') + '.tif';
  }

  function getPixelSize(feature) {
    var attributes = feature && feature.attributes || {};
    var low = Number(attributes.LowPS);
    var high = Number(attributes.HighPS);
    if (Number.isFinite(low) && low > 0) return low;
    if (Number.isFinite(high) && high > 0) return high;
    return DEFAULT_PIXEL_SIZE;
  }

  function featureBounds(feature) {
    var rings = feature && feature.geometry && feature.geometry.rings;
    if (!rings || !rings.length) throw new Error('Polygon DEMNAS tidak memiliki geometry.');
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    rings.forEach(function (ring) {
      ring.forEach(function (point) {
        var x = Number(point[0]);
        var y = Number(point[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      });
    });
    if (!(maxX > minX && maxY > minY)) throw new Error('Extent polygon DEMNAS tidak valid.');
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  function geometryBounds(geometry) {
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    function walk(coordinates) {
      if (!Array.isArray(coordinates)) return;
      if (typeof coordinates[0] === 'number') {
        var x = Number(coordinates[0]);
        var y = Number(coordinates[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        return;
      }
      coordinates.forEach(walk);
    }
    if (geometry && geometry.coordinates) walk(geometry.coordinates);
    if (!(maxX > minX && maxY > minY)) throw new Error('Batas wilayah tidak valid.');
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  function intersectBounds(first, second) {
    var bounds = {
      minX: Math.max(first.minX, second.minX),
      minY: Math.max(first.minY, second.minY),
      maxX: Math.min(first.maxX, second.maxX),
      maxY: Math.min(first.maxY, second.maxY)
    };
    if (!(bounds.maxX > bounds.minX && bounds.maxY > bounds.minY)) return null;
    return bounds;
  }

  function makeExportPlan(bounds, width, height) {
    return {
      bbox: bounds,
      pixelSizeX: (bounds.maxX - bounds.minX) / width,
      pixelSizeY: (bounds.maxY - bounds.minY) / height,
      fullW: width,
      fullH: height
    };
  }

  function exportRasterUrl(bounds, width, height) {
    var query = [
      'bbox=' + [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].join(','),
      'bboxSR=4326',
      'imageSR=4326',
      'size=' + width + ',' + height,
      'format=tiff',
      'pixelType=F32',
      'interpolation=RSP_NearestNeighbor',
      'adjustAspectRatio=false',
      'f=json'
    ].join('&');
    return 'https://geoservices.big.go.id/raster/rest/services/DEMNAS/DEM_Indonesia/ImageServer/exportImage?' + query;
  }

  function ringArea(ring) {
    var area = 0;
    for (var index = 0; index < ring.length - 1; index++) {
      area += Number(ring[index][0]) * Number(ring[index + 1][1]) - Number(ring[index + 1][0]) * Number(ring[index][1]);
    }
    return area / 2;
  }

  function ringsToGeometry(rings) {
    var validRings = (rings || []).filter(function (ring) {
      return Array.isArray(ring) && ring.length >= 4;
    }).map(function (ring) {
      return ring.map(function (point) { return [Number(point[0]), Number(point[1])]; });
    }).filter(function (ring) {
      return ring.every(function (point) { return Number.isFinite(point[0]) && Number.isFinite(point[1]); });
    });
    if (!validRings.length) return null;
    var outers = [];
    var holes = [];
    validRings.forEach(function (ring) {
      if (ringArea(ring) < 0) outers.push(ring);
      else holes.push(ring);
    });
    if (!outers.length) {
      outers.push(validRings[0]);
      holes = validRings.slice(1);
    }
    var polygons = outers.map(function (outer, index) {
      return [outer].concat(index === 0 ? holes : []);
    });
    if (polygons.length === 1) return { type: 'Polygon', coordinates: polygons[0] };
    return { type: 'MultiPolygon', coordinates: polygons };
  }

  function boundaryFromFeatures(features, entry) {
    var polygons = [];
    (features || []).forEach(function (feature) {
      var geometry = feature && feature.geometry;
      var normalized = geometry && geometry.rings ? ringsToGeometry(geometry.rings) : null;
      if (!normalized) return;
      if (normalized.type === 'Polygon') polygons.push(normalized.coordinates);
      else if (normalized.type === 'MultiPolygon') polygons = polygons.concat(normalized.coordinates);
    });
    if (!polygons.length) throw new Error('Geometri batas wilayah tidak ditemukan.');
    return {
      type: 'Feature',
      properties: { nama: entry.nama, kode: entry.kode, level: entry.level },
      geometry: { type: 'MultiPolygon', coordinates: polygons }
    };
  }

  function collectRings(value, output) {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && Array.isArray(value[0]) && typeof value[0][0] === 'number') {
      output.push(value);
      return;
    }
    value.forEach(function (item) { collectRings(item, output); });
  }

  function boundaryFromWilayah(data, entry) {
    var paths = [];
    collectRings(data && data.path, paths);
    var rings = paths.filter(function (ring) { return ring.length >= 4; }).map(function (ring) {
      return ring.map(function (point) { return [Number(point[1]), Number(point[0])]; });
    });
    var geometry = ringsToGeometry(rings);
    if (!geometry) throw new Error('Fallback batas wilayah tidak valid.');
    return {
      type: 'Feature',
      properties: { nama: data.nama || entry.nama, kode: entry.kode, level: entry.level },
      geometry: geometry
    };
  }

  function loadBoundary(entry) {
    var config = BOUNDARY_CONFIG[String(entry.level)];
    if (!config) return Promise.reject(new Error('Tingkat wilayah tidak didukung.'));
    var query = new URLSearchParams({
      where: config.field + "='" + entry.kode.replace(/'/g, "''") + "'",
      f: 'json',
      returnGeometry: 'true',
      outSR: '4326',
      outFields: '*',
      geometryPrecision: '5'
    });
    var bigUrl = config.url + '?' + query.toString();
    return fetchWithProxy(bigUrl, 'json').then(function (data) {
      if (data && data.error) throw new Error(data.error.message || 'BIG RBI gagal');
      return boundaryFromFeatures(data && data.features, { nama: entry.nama, kode: entry.kode, level: entry.level });
    }).catch(function (bigError) {
      var fallbackUrl = 'https://wilayah.smartartstudio.my.id/api/boundaries/' + encodeURIComponent(entry.kode);
      return fetchWithProxy(fallbackUrl, 'json').then(function (data) {
        return boundaryFromWilayah(data, { nama: entry.nama, kode: entry.kode, level: entry.level });
      }).catch(function () {
        throw bigError;
      });
    });
  }

  async function readGeoTiffValues(blob) {
    if (!window.GeoTIFF || typeof window.GeoTIFF.fromBlob !== 'function') {
      throw new Error('Library geotiff.js belum termuat.');
    }
    var tiff = await window.GeoTIFF.fromBlob(blob);
    var image = await tiff.getImage();
    var rasters = await image.readRasters();
    if (!rasters || !rasters.length) throw new Error('Band raster DEMNAS kosong.');
    return { values: rasters[0], width: image.getWidth(), height: image.getHeight() };
  }

  function writeGeoTiff(values, plan) {
    if (!window.GeoTIFF || typeof window.GeoTIFF.writeArrayBuffer !== 'function') {
      throw new Error('Library geotiff.js belum termuat.');
    }
    return window.GeoTIFF.writeArrayBuffer(values, {
      width: plan.fullW,
      height: plan.fullH,
      SamplesPerPixel: [1],
      BitsPerSample: [32],
      SampleFormat: [3],
      PhotometricInterpretation: 1,
      PlanarConfiguration: 1,
      Compression: 1,
      ModelPixelScale: [plan.pixelSizeX, plan.pixelSizeY, 0],
      ModelTiepoint: [0, 0, 0, plan.bbox.minX, plan.bbox.maxY, 0],
      GTModelTypeGeoKey: 2,
      GTRasterTypeGeoKey: 1,
      GeographicTypeGeoKey: 4326,
      GDAL_NODATA: 'nan'
    });
  }

  function rasterValue(values, row, col, width) {
    if (Array.isArray(values) && Array.isArray(values[0])) return values[row][col];
    return values[row * width + col];
  }

  function createRasterMask(boundary, plan) {
    if (!boundary || !boundary.geometry) return null;
    var canvas = document.createElement('canvas');
    canvas.width = plan.fullW;
    canvas.height = plan.fullH;
    var context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas mask tidak tersedia.');
    var geometry = boundary.geometry;
    var polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates || [];
    polygons.forEach(function (polygon) {
      context.beginPath();
      polygon.forEach(function (ring) {
        ring.forEach(function (point, index) {
          var x = ((Number(point[0]) - plan.bbox.minX) / (plan.bbox.maxX - plan.bbox.minX)) * plan.fullW;
          var y = ((plan.bbox.maxY - Number(point[1])) / (plan.bbox.maxY - plan.bbox.minY)) * plan.fullH;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.closePath();
      });
      context.fillStyle = '#fff';
      context.fill('evenodd');
    });
    return context.getImageData(0, 0, plan.fullW, plan.fullH).data;
  }

  function elevationColor(value) {
    if (!Number.isFinite(value)) return [0, 0, 0, 0];
    if (value < 0) return [30, 100, 200, 205];
    if (value < 100) return [65, 182, 110, 205];
    if (value < 500) return [170, 220, 50, 205];
    if (value < 1000) return [232, 180, 50, 205];
    if (value < 1500) return [210, 130, 50, 205];
    if (value < 2000) return [190, 80, 60, 205];
    return [140, 30, 40, 205];
  }

  function createPreviewCanvas(result) {
    var canvas = document.createElement('canvas');
    canvas.width = result.plan.fullW;
    canvas.height = result.plan.fullH;
    var context = canvas.getContext('2d');
    var image = context.createImageData(canvas.width, canvas.height);
    for (var index = 0; index < result.values.length; index++) {
      var color = elevationColor(result.values[index]);
      var offset = index * 4;
      image.data[offset] = color[0];
      image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2];
      image.data[offset + 3] = color[3];
    }
    context.putImageData(image, 0, 0);
    return canvas;
  }

  async function loadRasterResult(feature, boundary) {
    var sheetBounds = featureBounds(feature);
    var bounds = sheetBounds;
    var boundaryBounds = null;
    if (boundary) {
      boundaryBounds = geometryBounds(boundary.geometry);
      bounds = intersectBounds(sheetBounds, boundaryBounds);
      if (!bounds) throw new Error('Batas wilayah tidak beririsan dengan DEMNAS terpilih.');
    }
    var sizes = EXPORT_DIMS;
    var lastError = null;
    for (var sizeIndex = 0; sizeIndex < sizes.length; sizeIndex++) {
      var size = sizes[sizeIndex];
      try {
        setStatus('Mengunduh DEMNAS' + (boundary ? ' hasil clip' : '') + '… resolusi ' + size + '×' + size);
        var metadata = await fetchWithProxy(exportRasterUrl(bounds, size, size), 'json');
        if (!metadata || !metadata.href) {
          throw new Error((metadata && metadata.error && metadata.error.message) || 'exportImage gagal.');
        }
        var blob = await fetchWithProxy(metadata.href, 'blob');
        var raster = await readGeoTiffValues(blob);
        var plan = makeExportPlan(bounds, size, size);
        var values = new Float32Array(plan.fullW * plan.fullH);
        values.fill(NO_DATA);
        var mask = boundary ? createRasterMask(boundary, plan) : null;
        var validPixels = 0;
        var rows = Math.min(plan.fullH, raster.height);
        var cols = Math.min(plan.fullW, raster.width);
        for (var row = 0; row < rows; row++) {
          for (var col = 0; col < cols; col++) {
            var index = row * plan.fullW + col;
            var value = Number(rasterValue(raster.values, row, col, raster.width));
            var insideMask = !mask || mask[index * 4 + 3] > 0;
            if (insideMask && Number.isFinite(value) && Math.abs(value) < 1000000) {
              values[index] = value;
              validPixels++;
            }
          }
        }
        if (!validPixels) {
          lastError = new Error('Resolusi ' + size + ' tidak memiliki piksel valid di dalam batas wilayah.');
          continue;
        }
        return {
          values: values,
          plan: plan,
          size: size,
          masked: !!boundary,
          partialSheet: !!(boundaryBounds && (
            boundaryBounds.minX < sheetBounds.minX || boundaryBounds.minY < sheetBounds.minY ||
            boundaryBounds.maxX > sheetBounds.maxX || boundaryBounds.maxY > sheetBounds.maxY
          ))
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Tidak ada piksel DEMNAS valid pada polygon.');
  }

  async function buildExportBuffer(feature, boundary) {
    var result = await loadRasterResult(feature, boundary);
    setStatus('Menyusun GeoTIFF QGIS… ' + result.size + '×' + result.size);
    var buffer = await writeGeoTiff(result.values, result.plan);
    return { buffer: buffer, result: result };
  }

  function featureToGeoJson(feature) {
    var geometry = feature && feature.geometry;
    var normalized = geometry && geometry.rings ? ringsToGeometry(geometry.rings) : null;
    if (!normalized) return null;
    return {
      type: 'Feature',
      properties: feature.attributes || {},
      geometry: normalized
    };
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function clearPolygon() {
    if (_polygonLayer && window.map) window.map.removeLayer(_polygonLayer);
    _polygonLayer = null;
  }

  function showPolygon(feature) {
    clearPolygon();
    if (!window.map) return;
    var geojson = featureToGeoJson(feature);
    if (!geojson) return;
    _polygonLayer = L.geoJSON(geojson, {
      style: {
        color: '#166534',
        weight: 2,
        opacity: 0.95,
        fillColor: '#4ade80',
        fillOpacity: 0.12
      }
    }).addTo(window.map);
    _polygonLayer.bindPopup(function () {
      var attributes = feature.attributes || {};
      return '<strong>' + escapeHtml(attributes.Name || 'DEMNAS') + '</strong><br>OBJECTID: ' + escapeHtml(attributes.OBJECTID || '-') + '<br>Resolusi: ' + escapeHtml(attributes.LowPS || attributes.HighPS || '-');
    });
    var bounds = _polygonLayer.getBounds();
    if (bounds.isValid()) window.map.fitBounds(bounds.pad(0.08), { maxZoom: 12, animate: true });
  }

  function removeClipPreviewLayers() {
    if (_clipImageLayer && window.map) window.map.removeLayer(_clipImageLayer);
    if (_clipBoundaryLayer && window.map) window.map.removeLayer(_clipBoundaryLayer);
    _clipImageLayer = null;
    _clipBoundaryLayer = null;
  }

  function clearClipPreview() {
    _clipPreviewRun++;
    _clipPreviewPromise = null;
    _clipPreviewPolygonOnly = false;
    removeClipPreviewLayers();
    _clipRasterResult = null;
    _clipCacheKey = '';
    var legend = document.getElementById('demnasElevationLegend');
    if (legend) legend.hidden = true;
    setPreviewStatus('');
  }

  function clipCacheKey(feature, boundary) {
    var objectId = feature && feature.attributes && feature.attributes.OBJECTID || '';
    var code = boundary && boundary.properties && boundary.properties.kode || '';
    return String(objectId) + '|' + String(code);
  }

  function showClipBoundary(boundary) {
    removeClipPreviewLayers();
    if (!boundary || !window.map || typeof L === 'undefined' || !L.geoJSON) return;
    _clipBoundaryLayer = L.geoJSON(boundary, {
      style: {
        color: '#f97316',
        weight: 2,
        opacity: 1,
        fillColor: '#fb923c',
        fillOpacity: 0.08
      }
    }).addTo(window.map);
    _clipBoundaryLayer.bindPopup(function () {
      var properties = boundary.properties || {};
      return '<strong>Batas wilayah</strong><br>' + escapeHtml(properties.nama || '-') + '<br>Kode: ' + escapeHtml(properties.kode || '-');
    });
  }

  function showClipRaster(result) {
    if (!result || !window.map || typeof L === 'undefined' || !L.imageOverlay) return;
    var canvas = createPreviewCanvas(result);
    var bounds = result.plan.bbox;
    _clipImageLayer = L.imageOverlay(canvas.toDataURL('image/png'), [[bounds.maxY, bounds.minX], [bounds.minY, bounds.maxX]], {
      opacity: 0.82,
      interactive: false,
      className: 'demnas-raster-preview'
    }).addTo(window.map);
    var legend = document.getElementById('demnasElevationLegend');
    if (legend) legend.hidden = false;
  }

  function refreshClipPreview() {
    if (!_selectedFeature || !_selectedBoundary) return Promise.resolve(null);
    var run = ++_clipPreviewRun;
    var key = clipCacheKey(_selectedFeature, _selectedBoundary);
    _clipPreviewPolygonOnly = false;
    _clipRasterResult = null;
    _clipCacheKey = '';
    var legend = document.getElementById('demnasElevationLegend');
    if (legend) legend.hidden = true;
    showClipBoundary(_selectedBoundary);
    setPreviewStatus('Menyiapkan preview raster berwarna…');
    var refreshButton = document.getElementById('demnasClipRefreshBtn');
    if (refreshButton) refreshButton.disabled = true;
    var promise = loadRasterResult(_selectedFeature, _selectedBoundary);
    _clipPreviewPromise = promise;
    return promise.then(function (result) {
      if (run !== _clipPreviewRun) return null;
      _clipRasterResult = result;
      _clipCacheKey = key;
      showClipBoundary(_selectedBoundary);
      showClipRaster(result);
      var bounds = result.plan.bbox;
      if (window.map) window.map.fitBounds([[bounds.minY, bounds.minX], [bounds.maxY, bounds.maxX]], { padding: [24, 24], maxZoom: 16, animate: true });
      setPreviewStatus('Preview siap · ' + result.size + '×' + result.size + ' piksel' + (result.partialSheet ? ' · hanya sheet DEMNAS terpilih' : ''));
      setStatus('Preview DEMNAS siap. Klik Unduh DEMNAS TIFF untuk menyimpan hasil clip.');
      return result;
    }).catch(function (error) {
      if (run !== _clipPreviewRun) return null;
      _clipPreviewPolygonOnly = true;
      showClipBoundary(_selectedBoundary);
      var legend = document.getElementById('demnasElevationLegend');
      if (legend) legend.hidden = true;
      setPreviewStatus('Raster warna tidak tersedia. Menampilkan polygon batas wilayah clip saja.');
      setStatus('Preview polygon siap. Raster warna tidak dapat dimuat: ' + (error && error.message ? error.message : String(error)));
      return null;
    }).then(function (result) {
      if (run === _clipPreviewRun && refreshButton) refreshButton.disabled = false;
      if (_clipPreviewPromise === promise) _clipPreviewPromise = null;
      return result;
    });
  }

  function selectAdminEntry(code) {
    var entry = _adminByCode[String(code || '')];
    if (!entry || String(entry.kode).split('.').length !== Number(_adminLevel)) return Promise.resolve(null);
    _selectedAdmin = entry;
    _selectedBoundary = null;
    clearClipPreview();
    updateAdminVisibility();
    var selected = document.getElementById('demnasAdminSelected');
    if (selected) {
      selected.textContent = entry.nama + ' [' + entry.kode + ']';
      selected.hidden = false;
    }
    setPreviewStatus('Memuat batas wilayah ' + entry.nama + '…');
    var requestId = ++_adminRequest;
    return loadBoundary({ nama: entry.nama, kode: entry.kode, level: _adminLevel }).then(function (boundary) {
      if (requestId !== _adminRequest || !_selectedAdmin || _selectedAdmin.kode !== entry.kode) return null;
      _selectedBoundary = boundary;
      showClipBoundary(boundary);
      updateAdminVisibility();
      return refreshClipPreview();
    }).catch(function (error) {
      if (requestId === _adminRequest) setPreviewStatus(error && error.message ? error.message : String(error), true);
      return null;
    });
  }

  function changeAdminLevel() {
    var level = document.getElementById('demnasAdminLevel');
    _adminLevel = level ? String(level.value) : '';
    _adminRequest++;
    var search = document.getElementById('demnasAdminSearch');
    if (search) search.value = '';
    clearAdminSelection();
    if (!_adminLevel) return;
    updateAdminVisibility();
    setPreviewStatus('Memuat daftar wilayah…');
    loadAdminData().then(function () {
      if (String(level && level.value) !== _adminLevel) return;
      populateAdminOptions();
      setPreviewStatus('Pilih wilayah untuk clip raster.');
    }).catch(function (error) {
      setPreviewStatus(error && error.message ? error.message : String(error), true);
    });
  }

  function populateSelect(catalog) {
    var select = document.getElementById('demnasNamobjSelect');
    if (!select) return;
    select.innerHTML = '';
    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Pilih index DEMNAS…';
    select.appendChild(placeholder);
    var groups = {};
    catalog.forEach(function (feature) {
      var attributes = feature.attributes || {};
      var region = String(attributes.REGION || 'Tanpa Region');
      if (!groups[region]) groups[region] = [];
      groups[region].push(feature);
    });
    Object.keys(groups).sort().forEach(function (region) {
      var group = document.createElement('optgroup');
      group.label = region;
      groups[region].sort(function (a, b) { return featureName(a).localeCompare(featureName(b)); }).forEach(function (feature) {
        var attributes = feature.attributes || {};
        var option = document.createElement('option');
        option.value = String(attributes.OBJECTID);
        option.textContent = featureName(feature) + ' [ID ' + attributes.OBJECTID + ']';
        group.appendChild(option);
      });
      select.appendChild(group);
    });
  }

  function filterSelect(query) {
    var select = document.getElementById('demnasNamobjSelect');
    var countElement = document.getElementById('demnasSearchCount');
    if (!select) return;
    var normalized = String(query || '').trim().toLowerCase();
    var options = select.querySelectorAll('option');
    var matched = 0;
    for (var index = 0; index < options.length; index++) {
      var option = options[index];
      if (!option.value) {
        option.hidden = false;
        continue;
      }
      var text = String(option.textContent || '').toLowerCase();
      var value = String(option.value || '').toLowerCase();
      var isMatch = !normalized || text.indexOf(normalized) !== -1 || value.indexOf(normalized) !== -1;
      if (isMatch) matched++;
      option.hidden = option.selected ? false : !isMatch;
    }
    var groups = select.querySelectorAll('optgroup');
    for (var groupIndex = 0; groupIndex < groups.length; groupIndex++) {
      var group = groups[groupIndex];
      var hasVisibleOption = false;
      for (var optionIndex = 0; optionIndex < group.options.length; optionIndex++) {
        if (!group.options[optionIndex].hidden) {
          hasVisibleOption = true;
          break;
        }
      }
      group.hidden = !hasVisibleOption;
    }
    if (countElement) {
      var total = _catalog.length;
      countElement.textContent = normalized ? matched.toLocaleString('id-ID') + ' dari ' + total.toLocaleString('id-ID') + ' index cocok' : total.toLocaleString('id-ID') + ' index dimuat';
    }
  }

  function findFeature(objectId) {
    for (var index = 0; index < _catalog.length; index++) {
      if (String(_catalog[index].attributes && _catalog[index].attributes.OBJECTID) === String(objectId)) return _catalog[index];
    }
    return null;
  }

  function selectFeature(objectId) {
    if (!objectId) {
      _selectedFeature = null;
      clearPolygon();
      clearClipPreview();
      clearRecommendations();
      var selected = document.getElementById('demnasIndexSelected');
      if (selected) selected.style.display = 'none';
      return;
    }
    var feature = findFeature(objectId);
    if (!feature) return;
    _selectedFeature = feature;
    clearClipPreview();
    var attributes = feature.attributes || {};
    var selectedElement = document.getElementById('demnasIndexSelected');
    if (selectedElement) {
      selectedElement.textContent = featureName(feature) + ' [OBJECTID ' + attributes.OBJECTID + ']';
      selectedElement.style.display = 'block';
    }
    showPolygon(feature);
    updateAdminVisibility();
    loadRecommendations(feature);
    if (_selectedBoundary) {
      refreshClipPreview();
      setStatus('Polygon ' + featureName(feature) + ' dipilih. Preview clip sedang dimuat.');
    } else {
      setStatus('Polygon ' + featureName(feature) + ' dipilih. Klik Unduh DEMNAS TIFF.');
    }
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.download = filename;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function downloadDemnasResmi() {
    if (_active) {
      setStatus('Export DEMNAS sedang berjalan. Tunggu proses selesai.', true);
      return;
    }
    if (!_selectedFeature) {
      setStatus('Pilih index DEMNAS dari dropdown terlebih dahulu.', true);
      return;
    }
    if (_adminLevel && !_selectedBoundary) {
      setStatus('Pilih batas wilayah terlebih dahulu.', true);
      return;
    }
    _active = true;
    setBusy(true);
    setStatus('Menyiapkan export DEMNAS tanpa token…');
    try {
      var boundary = _selectedBoundary;
      var key = boundary ? clipCacheKey(_selectedFeature, boundary) : '';
      var result = null;
      if (boundary && _clipRasterResult && _clipCacheKey === key) {
        result = _clipRasterResult;
      } else if (boundary && _clipPreviewPromise) {
        result = await _clipPreviewPromise.catch(function () { return null; });
      }
      if (!result) result = await loadRasterResult(_selectedFeature, boundary);
      if (boundary) {
        _clipRasterResult = result;
        _clipCacheKey = key;
        if (!_clipImageLayer) {
          showClipBoundary(boundary);
          showClipRaster(result);
        }
      }
      setStatus('Menyusun GeoTIFF QGIS… ' + result.size + '×' + result.size);
      var buffer = await writeGeoTiff(result.values, result.plan);
      if (!buffer || !buffer.byteLength) throw new Error('File TIFF hasil export kosong.');
      var filename = sheetFilename(_selectedFeature);
      var blob = new Blob([buffer], { type: 'image/tiff' });
      downloadBlob(blob, filename);
      setStatus('Berhasil mengunduh ' + filename + ' (' + blob.size + ' bytes, tanpa token).');
      if (typeof window.closeGeotoolsSheet === 'function') window.closeGeotoolsSheet();
    } catch (error) {
      setStatus('Gagal: ' + (error && error.message ? error.message : String(error)), true);
    } finally {
      _active = false;
      setBusy(false);
    }
  }

  function resetDemnasSelection() {
    _active = false;
    _adminRequest++;
    _adminLevel = '';
    _selectedFeature = null;
    _selectedAdmin = null;
    _selectedBoundary = null;
    _clipRasterResult = null;
    _clipCacheKey = '';
    _clipPreviewPolygonOnly = false;
    clearRecommendations();
    clearClipPreview();
    var mainSelect = document.getElementById('demnasNamobjSelect');
    var mainSearch = document.getElementById('demnasSearchInput');
    var level = document.getElementById('demnasAdminLevel');
    var adminSearch = document.getElementById('demnasAdminSearch');
    var adminSelect = document.getElementById('demnasAdminSelect');
    var adminCount = document.getElementById('demnasAdminSearchCount');
    var selectedAdmin = document.getElementById('demnasAdminSelected');
    var selectedIndex = document.getElementById('demnasIndexSelected');
    if (mainSelect) mainSelect.value = '';
    if (mainSearch) mainSearch.value = '';
    if (level) level.value = '';
    if (adminSearch) adminSearch.value = '';
    if (adminSelect) adminSelect.innerHTML = '<option value="">Pilih wilayah…</option>';
    if (adminCount) adminCount.textContent = '';
    if (selectedAdmin) {
      selectedAdmin.hidden = true;
      selectedAdmin.textContent = '';
    }
    if (selectedIndex) {
      selectedIndex.textContent = '';
      selectedIndex.style.display = 'none';
    }
    clearPolygon();
    setStatus('');
    setPreviewStatus('');
    setRecommendationStatus('');
    updateAdminVisibility();
    setBusy(false);
  }

  function load() {
    if (_catalog.length) return Promise.resolve(_catalog);
    setStatus('Memuat katalog DEMNAS dari ImageServer BIG…');
    return loadCatalog().then(function (catalog) {
      populateSelect(catalog);
      var search = document.getElementById('demnasSearchInput');
      filterSelect(search ? search.value : '');
      setStatus(catalog.length + ' index DEMNAS dimuat. Pilih index untuk melihat polygon dan rekomendasi wilayah clip.');
      return catalog;
    }).catch(function (error) {
      setStatus('Gagal memuat katalog: ' + (error && error.message ? error.message : String(error)), true);
      throw error;
    });
  }

  function init() {
    var select = document.getElementById('demnasNamobjSelect');
    var button = document.getElementById('demnasDownloadBtn');
    var search = document.getElementById('demnasSearchInput');
    var adminLevel = document.getElementById('demnasAdminLevel');
    var adminSearch = document.getElementById('demnasAdminSearch');
    var adminSelect = document.getElementById('demnasAdminSelect');
    var recommendedSelect = document.getElementById('demnasRecommendedSelect');
    var refresh = document.getElementById('demnasClipRefreshBtn');
    var reset = document.getElementById('demnasClipResetBtn');
    if (!select || !button) return;
    button.disabled = false;
    if (search) search.addEventListener('input', function () {
      filterSelect(this.value);
    });
    select.addEventListener('change', function () {
      selectFeature(this.value);
    });
    button.addEventListener('click', function () {
      downloadDemnasResmi();
    });
    if (adminLevel) adminLevel.addEventListener('change', changeAdminLevel);
    if (adminSearch) adminSearch.addEventListener('input', populateAdminOptions);
    if (adminSelect) adminSelect.addEventListener('change', function () {
      if (this.value) selectAdminEntry(this.value);
    });
    if (recommendedSelect) recommendedSelect.addEventListener('change', function () {
      if (this.value) applyRecommendation(this.value);
    });
    if (refresh) refresh.addEventListener('click', function () {
      if (_selectedFeature && _selectedBoundary) refreshClipPreview();
      else if (_selectedFeature && _selectedAdmin) selectAdminEntry(_selectedAdmin.kode);
    });
    if (reset) reset.addEventListener('click', resetDemnasSelection);
    updateAdminVisibility();
  }

  window.downloadDemnasResmi = downloadDemnasResmi;
  window.downloadDemnasKabupaten = downloadDemnasResmi;
  window.startDemnasDownload = downloadDemnasResmi;
  window.DemnasDownload = {
    load: load,
    download: downloadDemnasResmi,
    clear: resetDemnasSelection
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
