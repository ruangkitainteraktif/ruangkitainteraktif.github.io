(function () {
  'use strict';

  var IMAGE_SERVER = 'https://geoservices.big.go.id/raster/rest/services/DEMNAS/DEM_Indonesia/ImageServer/query';
  var LOCAL_CATALOG_URL = 'assets/data/demnas-index.json';
  var PROXY_PREFIX = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';
  var PAGE_SIZE = 1000;
  var EXPORT_DIMS = [1024, 512];
  var DEMNAS_WHERE = "Category=1 AND Name LIKE 'DEMNAS_%'";
  var DEFAULT_PIXEL_SIZE = 7.4985e-5;
  var NO_DATA = Number.NaN;

  var _active = false;
  var _catalog = [];
  var _catalogPromise = null;
  var _selectedFeature = null;
  var _polygonLayer = null;

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
    if (button) button.disabled = busy;
    if (select) select.disabled = busy;
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

  function makeExportPlan(feature, width, height) {
    var bounds = featureBounds(feature);
    return {
      bbox: bounds,
      pixelSize: (bounds.maxX - bounds.minX) / width,
      fullW: width,
      fullH: height
    };
  }

  function exportRasterUrl(feature, width, height) {
    var bounds = featureBounds(feature);
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
      ModelPixelScale: [plan.pixelSize, plan.pixelSize, 0],
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

  async function buildExportBuffer(feature) {
    var sizes = EXPORT_DIMS;
    var lastError = null;
    for (var sizeIndex = 0; sizeIndex < sizes.length; sizeIndex++) {
      var size = sizes[sizeIndex];
      try {
        setStatus('Mengunduh DEMNAS… resolusi ' + size + '×' + size);
        var metadata = await fetchWithProxy(exportRasterUrl(feature, size, size), 'json');
        if (!metadata || !metadata.href) {
          throw new Error((metadata && metadata.error && metadata.error.message) || 'exportImage gagal.');
        }
        var blob = await fetchWithProxy(metadata.href, 'blob');
        var raster = await readGeoTiffValues(blob);
        var plan = makeExportPlan(feature, size, size);
        var values = new Float32Array(plan.fullW * plan.fullH);
        values.fill(NO_DATA);
        var validPixels = 0;
        var rows = Math.min(plan.fullH, raster.height);
        var cols = Math.min(plan.fullW, raster.width);
        for (var row = 0; row < rows; row++) {
          for (var col = 0; col < cols; col++) {
            var value = Number(rasterValue(raster.values, row, col, raster.width));
            if (Number.isFinite(value) && Math.abs(value) < 1000000) {
              values[row * plan.fullW + col] = value;
              validPixels++;
            }
          }
        }
        if (!validPixels) {
          lastError = new Error('Resolusi ' + size + ' tidak memiliki piksel valid.');
          continue;
        }
        setStatus('Menyusun GeoTIFF QGIS… ' + size + '×' + size);
        return writeGeoTiff(values, plan);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Tidak ada piksel DEMNAS valid pada polygon.');
  }

  function featureToGeoJson(feature) {
    var geometry = feature && feature.geometry;
    if (!geometry || !geometry.rings || !geometry.rings.length) return null;
    return {
      type: 'Feature',
      properties: feature.attributes || {},
      geometry: {
        type: 'Polygon',
        coordinates: geometry.rings
      }
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
      var selected = document.getElementById('demnasIndexSelected');
      if (selected) selected.style.display = 'none';
      return;
    }
    var feature = findFeature(objectId);
    if (!feature) return;
    _selectedFeature = feature;
    var attributes = feature.attributes || {};
    var selected = document.getElementById('demnasIndexSelected');
    if (selected) {
      selected.textContent = featureName(feature) + ' [OBJECTID ' + attributes.OBJECTID + ']';
      selected.style.display = 'block';
    }
    showPolygon(feature);
    setStatus('Polygon ' + featureName(feature) + ' dipilih. Klik Unduh DEMNAS TIFF.');
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
    _active = true;
    setBusy(true);
    setStatus('Menyiapkan export DEMNAS tanpa token…');
    try {
      var buffer = await buildExportBuffer(_selectedFeature);
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

  function load() {
    if (_catalog.length) return Promise.resolve(_catalog);
    setStatus('Memuat katalog DEMNAS dari ImageServer BIG…');
    return loadCatalog().then(function (catalog) {
      populateSelect(catalog);
      var search = document.getElementById('demnasSearchInput');
      filterSelect(search ? search.value : '');
      setStatus(catalog.length + ' index DEMNAS dimuat. Pilih index untuk melihat polygon.');
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
  }

  window.downloadDemnasResmi = downloadDemnasResmi;
  window.downloadDemnasKabupaten = downloadDemnasResmi;
  window.startDemnasDownload = downloadDemnasResmi;
  window.DemnasDownload = {
    load: load,
    download: downloadDemnasResmi,
    clear: function () {
      _active = false;
      _selectedFeature = null;
      clearPolygon();
      setBusy(false);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
