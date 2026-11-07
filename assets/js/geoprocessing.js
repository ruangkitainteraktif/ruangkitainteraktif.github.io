/* =============================================================================
 * GEOPROCESSING VIEW (assets/js/geoprocessing.js)
 *
 * Lapisan tampilan pane Geoprocessing pada sheet Alat:
 *   - navigasi tab Alat | Riwayat,
 *   - daftar tool per toolbox + pencarian,
 *   - form parameter & environment yang dirender dari skema di
 *     geoprocessing-core.js (GPC),
 *   - alur eksekusi dengan progress bar + tombol batal (Web Worker),
 *   - daftar hasil berlapis (mata, unduh GeoJSON/SHP/CSV, tabel, hapus),
 *   - log riwayat di localStorage.
 *
 * Seluruh perhitungan geometri ada di geoprocessing-core.js dan dijalankan di
 * Web Worker (geoprocessing-worker.js); file ini tidak menghitung geometri.
 * ============================================================================= */
(function () {
  'use strict';
  if (!window.GPC) return;

  var card = document.querySelector('.gp-tools-card');
  var toolBody = document.querySelector('.dm-sidebar-body');
  var host = document.getElementById('gpToolList');
  if (!card || !host) return;
  if (toolBody) {
    var locationCard = document.getElementById('dmCekLokasi');
    if (locationCard && locationCard.parentNode === toolBody) locationCard.after(card);
    else toolBody.prepend(card);
  }

  var GPC = window.GPC;
  var esc = function (value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  };

  /* ---------------------------------------------------------------- layer -- */
  var layerCache = { at: 0, list: null };
  var GP_LAYER_TYPES = ['Layer proyek', 'ArcGIS Feature Layer', 'GeoJSON', 'Esri JSON',
    'SHP', 'SHP (ZIP)', 'Geoprocessing Draw', 'Geoprocessing'];
  var hasPolygon = function (layer) {
    return !!(layer.geojson && layer.geojson.features || []).some(function (f) {
      return f.geometry && /Polygon/.test(f.geometry.type);
    });
  };
  function getLayers(fresh) {
    var now = Date.now();
    if (!fresh && layerCache.list && now - layerCache.at < 250) return layerCache.list;
    var list = typeof window.getAlatGeoJSONLayers === 'function' ? window.getAlatGeoJSONLayers() : [];
    layerCache = { at: now, list: list.filter(function (l) { return GP_LAYER_TYPES.indexOf(l.type) >= 0; }) };
    return layerCache.list;
  }
  function invalidateLayers() { layerCache = { at: 0, list: null }; }
  GPC.getLayers = function () { return getLayers(true); };

  function layerById(id) {
    if (id == null || id === '') return null;
    var layers = getLayers();
    for (var i = 0; i < layers.length; i++) if (String(layers[i].id) === String(id)) return layers[i];
    return null;
  }

  /* Nama field dari layer, opsional hanya yang numerik (untup Distance field). */
  function layerFieldNames(layerId, numericOnly) {
    var layer = layerById(layerId);
    if (!layer || !layer.geojson) return [];
    var features = layer.geojson.features || [];
    var sample = features.filter(function (f) { return f.properties && Object.keys(f.properties).length; })[0];
    if (!sample) return [];
    var keys = Object.keys(sample.properties);
    if (numericOnly) {
      keys = keys.filter(function (key) {
        return features.some(function (f) {
          var v = f.properties ? f.properties[key] : null;
          return v !== '' && v != null && Number.isFinite(Number(v));
        });
      });
    }
    return keys;
  }

  /* --------------------------------------------------------------- status -- */
  function status(message, isError) {
    var el = document.getElementById('gpStatus');
    if (!el) return;
    el.textContent = message || '';
    el.style.color = isError ? '#b91c1c' : '';
  }
  function importStatus(message, isError) {
    var el = document.getElementById('gpImportStatus');
    if (!el) return;
    el.textContent = message || '';
    el.style.color = isError ? '#b91c1c' : '';
  }

  /* ------------------------------------------------ batas administrasi ----- */
  var boundaryState = { adminFeature: null, layerLayerId: null, request: 0 };
  function adminBoundary() { return boundaryState.adminFeature ? [boundaryState.adminFeature] : []; }

  var boundaryEndpoints = {
    1: { url: 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_PROVINSI_AR/MapServer/0/query', field: 'KDPPUM' },
    2: { url: 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_KABKOTA_AR/MapServer/0/query', field: 'KDPKAB' },
    3: { url: 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_KECAMATAN_AR/MapServer/0/query', field: 'KDCPUM' },
    4: { url: 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_DESAKEL_AR/MapServer/0/query', field: 'KDEPUM' }
  };

  window.searchGeoprocessingBoundaries = function () {
    var level = Number(document.getElementById('gpBoundaryLevel')?.value || 1);
    var query = String(document.getElementById('gpBoundaryQuery')?.value || '').trim().toLocaleLowerCase('id');
    var result = document.getElementById('gpBoundaryResults');
    var rows = window.KODE_WILAYAH_DATA || [];
    if (!result) return;
    var matches = rows.filter(function (row) {
      return String(row.kode || '').split('.').length === level &&
        (!query || String(row.kode + ' ' + row.nama).toLocaleLowerCase('id').indexOf(query) >= 0);
    }).slice(0, 100);
    result.innerHTML = matches.length
      ? matches.map(function (row) { return '<option value="' + esc(row.kode) + '">' + esc(row.nama) + ' &middot; ' + esc(row.kode) + '</option>'; }).join('')
      : '<option value="">Tidak ada wilayah cocok</option>';
    var info = document.getElementById('gpBoundaryStatus');
    if (info) info.textContent = matches.length
      ? matches.length + ' hasil ditampilkan; persempit pencarian bila wilayah belum ditemukan.'
      : 'Tidak ada hasil. Coba kode atau nama lain.';
  };

  window.changeGeoprocessingBoundaryLevel = function () {
    boundaryState.request++;
    boundaryState.adminFeature = null;
    var info = document.getElementById('gpBoundaryStatus');
    if (info) info.textContent = 'Tingkat wilayah berubah. Muat batas yang baru.';
    window.searchGeoprocessingBoundaries();
  };

  window.loadGeoprocessingBoundary = async function () {
    var request = ++boundaryState.request;
    var level = Number(document.getElementById('gpBoundaryLevel')?.value || 1);
    var code = document.getElementById('gpBoundaryResults')?.value;
    var info = document.getElementById('gpBoundaryStatus');
    try {
      if (!code) throw new Error('Pilih satu wilayah dari hasil pencarian.');
      if (info) info.textContent = 'Memuat geometri batas BIG...';
      var config = boundaryEndpoints[level];
      var url = config.url + '?' + new URLSearchParams({
        where: config.field + "='" + code + "'", outFields: '*', returnGeometry: 'true',
        outSR: '4326', f: 'geojson', geometryPrecision: '6'
      });
      var data;
      try {
        var controller = new AbortController();
        var timeout = setTimeout(function () { controller.abort(); }, 8000);
        var response;
        try { response = await fetch(url, { signal: controller.signal }); }
        finally { clearTimeout(timeout); }
        if (!response.ok) throw new Error('Layanan BIG mengembalikan HTTP ' + response.status + '.');
        data = await response.json();
        if (data.error) throw new Error(data.error.message || 'Layanan BIG gagal.');
      } catch (bigError) {
        if (level !== 4 || typeof window.fetchVillageBoundaryFallback !== 'function') throw bigError;
        data = await window.fetchVillageBoundaryFallback({
          where: "KDEPUM='" + code + "'", outFields: '*', returnGeometry: 'true',
          outSR: '4326', geometryPrecision: '6', f: 'geojson'
        });
        if (data.error) throw new Error(data.error.message || 'Layanan fallback batas desa gagal.');
      }
      if (request !== boundaryState.request) return;
      var feature = data.features && data.features.find(function (item) {
        return item.geometry && /Polygon/.test(item.geometry.type);
      });
      if (!feature) throw new Error('Geometri poligon untuk wilayah ini tidak ditemukan.');
      var admin = (window.KODE_WILAYAH_DATA || []).find(function (item) { return String(item.kode) === String(code); });
      feature.properties = Object.assign({}, feature.properties || {}, {
        kode_wilayah: code, nama_wilayah: admin ? admin.nama : code, tingkat_wilayah: level
      });
      boundaryState.adminFeature = feature;
      if (info) info.textContent = 'Batas siap: ' + (admin ? admin.nama : code) + ' (' +
        ['', 'Provinsi', 'Kabupaten/Kota', 'Kecamatan', 'Desa/Kelurahan'][level] + ').';
    } catch (error) {
      if (request !== boundaryState.request) return;
      boundaryState.adminFeature = null;
      if (info) info.textContent = error.message || 'Batas wilayah gagal dimuat.';
    }
  };

  window.resetGeoprocessingBoundary = function () {
    boundaryState.request++;
    boundaryState.adminFeature = null;
    var info = document.getElementById('gpBoundaryStatus');
    if (info) info.textContent = 'Polygon batas direset. Cari dan muat batas baru untuk Clip.';
  };

  function updateLayerBoundaryStatus() {
    var info = document.getElementById('gpLayerBoundaryStatus');
    if (!info) return;
    var layer = layerById(values.boundaryLayer);
    if (!layer) { info.textContent = 'Pilih layer polygon sebagai Clip Features.'; return; }
    var count = (layer.geojson.features || []).filter(function (f) {
      return f.geometry && /Polygon/.test(f.geometry.type);
    }).length;
    info.textContent = count
      ? 'Batas siap: ' + layer.name + ' (' + count + ' polygon).'
      : 'Layer ini tidak memiliki poligon.';
  }

  /* --------------------------------------------------------- impor sumber -- */
  var importedSources = new Set();

  function registerImportedLayer(name, type, geojson) {
    if (!geojson || !Array.isArray(geojson.features) || !geojson.features.length) {
      throw new Error('File tidak memiliki fitur GeoJSON.');
    }
    var item = window.addAlatGeoJSONLayer(name, type, geojson);
    importedSources.add(item);
    invalidateLayers();
    importStatus(name + ' dimuat (' + geojson.features.length + ' fitur). Layer siap dipilih pada tool.', false);
    refreshLayerChoices();
    return item;
  }

  window.resetGeoprocessingSources = function () {
    var removed = 0;
    Array.from(importedSources).forEach(function (item) {
      if (typeof window.removeAlatGeoJSONLayer === 'function' && window.removeAlatGeoJSONLayer(item)) removed++;
      importedSources.delete(item);
    });
    invalidateLayers();
    refreshLayerChoices();
    importStatus(removed ? removed + ' layer sumber dihapus dari peta.' : 'Tidak ada layer sumber untuk direset.', false);
  };

  window.importGeoprocessingGeoJSON = async function (files) {
    try {
      var file = files && files[0];
      if (!file) return;
      var parsed = JSON.parse(await file.text());
      var geojson = parsed && parsed.type === 'FeatureCollection' ? parsed
        : parsed && parsed.type === 'Feature' ? { type: 'FeatureCollection', features: [parsed] }
          : null;
      if (!geojson) throw new Error('Gunakan GeoJSON Feature atau FeatureCollection.');
      registerImportedLayer(file.name.replace(/\.(geojson|json)$/i, ''), 'GeoJSON', geojson);
    } catch (error) {
      importStatus(error.message || 'GeoJSON gagal dimuat.', true);
    } finally {
      var input = document.getElementById('gpGeoJSONInput');
      if (input) input.value = '';
    }
  };

  window.importGeoprocessingSHP = async function (files) {
    try {
      var selected = Array.from(files || []);
      if (!selected.length) return;
      var zipFile = selected.find(function (file) { return /\.zip$/i.test(file.name); });
      var geojson, name, type;
      if (zipFile) {
        if (typeof window.shp !== 'function') throw new Error('Pustaka pembaca SHP belum tersedia.');
        var parsed = await window.shp(await zipFile.arrayBuffer());
        geojson = Array.isArray(parsed) ? parsed[0] : parsed;
        name = zipFile.name.replace(/\.zip$/i, '');
        type = 'SHP (ZIP)';
      } else {
        var shpFile = selected.find(function (file) { return /\.shp$/i.test(file.name); });
        if (!shpFile) throw new Error('Pilih file .zip atau file .shp beserta .dbf (dan .prj jika ada).');
        var base = shpFile.name.replace(/\.shp$/i, '').toLowerCase();
        var dbfFile = selected.find(function (file) {
          return file.name.replace(/\.[^.]+$/, '').toLowerCase() === base && /\.dbf$/i.test(file.name);
        });
        var prjFile = selected.find(function (file) {
          return file.name.replace(/\.[^.]+$/, '').toLowerCase() === base && /\.prj$/i.test(file.name);
        });
        if (!dbfFile) throw new Error('File .dbf pendamping tidak ditemukan.');
        if (!window.shp || !window.shp.parseShp) throw new Error('Pustaka pembaca SHP belum tersedia.');
        var buffers = await Promise.all([
          shpFile.arrayBuffer(), dbfFile.arrayBuffer(), prjFile ? prjFile.text() : Promise.resolve(undefined)
        ]);
        var parts = await Promise.all([
          window.shp.parseShp(buffers[0], buffers[2]), window.shp.parseDbf(buffers[1])
        ]);
        geojson = window.shp.combine(parts);
        name = shpFile.name.replace(/\.shp$/i, '');
        type = 'SHP';
      }
      registerImportedLayer(name, type, geojson);
    } catch (error) {
      importStatus(error.message || 'SHP gagal dimuat.', true);
    } finally {
      var input = document.getElementById('gpShpInput');
      if (input) input.value = '';
    }
  };

  var captureNextDrawPolygon = false;
  window.startGeoprocessingPolygonDraw = function () {
    if (typeof window.startDraw !== 'function') {
      importStatus('Alat gambar polygon belum tersedia.', true);
      return;
    }
    captureNextDrawPolygon = true;
    importStatus('Gambar polygon pada peta. Selesaikan polygon dengan klik titik awal.', false);
    window.startDraw('polygon');
  };
  if (window.map && typeof window.map.on === 'function' && window.L && window.L.Draw) {
    window.map.on(window.L.Draw.Event.CREATED, function (event) {
      if (!captureNextDrawPolygon) return;
      captureNextDrawPolygon = false;
      if (!(event.layer instanceof window.L.Polygon) || event.layer instanceof window.L.Rectangle) {
        importStatus('Bentuk yang digambar bukan polygon. Pilih Gambar polygon untuk mencoba lagi.', true);
        return;
      }
      try {
        var geojson = event.layer.toGeoJSON();
        registerImportedLayer('Polygon_Geoprocessing', 'Geoprocessing Draw',
          { type: 'FeatureCollection', features: [geojson] });
        status('Polygon hasil gambar siap dipilih sebagai layer sumber atau batas Clip.', false);
      } catch (error) {
        importStatus(error.message || 'Polygon gagal disimpan.', true);
      }
    });
    window.map.on('draw:drawstop', function () {
      if (!captureNextDrawPolygon) return;
      captureNextDrawPolygon = false;
      importStatus('Gambar polygon dibatalkan.', false);
    });
  }

  /* --------------------------------------------------------- state form ---- */
  var activeTool = null;
  var values = {};
  var remembered = {};
  var openBoxes = {};
  var envOpen = false;
  var running = null;
  var outputs = [];
  var outputSeq = 0;
  var OUTPUT_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

  function defaultValues(tool) {
    var out = {};
    tool.params.forEach(function (p) {
      if (p.type === 'numberunit') {
        out[p.name] = p.default != null ? p.default : 500;
        out.unit = p.unitDefault || 'meters';
      } else if (p.type === 'layers' || p.type === 'fields') {
        out[p.name] = [];
      } else if (p.type === 'checkbox') {
        out[p.name] = p.default != null ? p.default : false;
      } else if (p.default != null) {
        out[p.name] = p.default;
      } else {
        out[p.name] = '';
      }
    });
    return out;
  }

  /* ------------------------------------------------------- render daftar ---- */
  var searchInput = document.getElementById('gpToolSearch');

  function toolRow(tool, showChip) {
    return '<button type="button" class="gp-tool' + (tool.id === activeTool ? ' is-active' : '') +
      '" data-tool="' + esc(tool.id) + '"><b>' + esc(tool.label) +
      (showChip ? ' <span class="gp-chip">' + esc(GPC.toolboxLabel(tool.toolbox)) + '</span>' : '') +
      '</b><span>' + esc(tool.desc) + '</span></button>';
  }

  function renderToolList() {
    var query = searchInput ? searchInput.value : '';
    if (query && query.trim()) {
      var matches = GPC.searchTools(query);
      host.innerHTML = matches.length
        ? '<div class="gp-toolbox-result">' + matches.length + ' tool cocok dengan "' + esc(query.trim()) + '"</div>' +
          matches.map(function (t) { return toolRow(t, true); }).join('')
        : '<div class="gp-empty">Tidak ada tool yang cocok. Coba kata kunci lain, misalnya "buffer" atau "gabung".</div>';
      return;
    }
    host.innerHTML = GPC.TOOLBOXES.map(function (box) {
      var tools = GPC.toolboxTools(box.id);
      var isOpen = !!openBoxes[box.id];
      return '<div class="gp-toolbox' + (isOpen ? ' is-open' : '') + '" data-box="' + esc(box.id) + '">' +
        '<button type="button" class="gp-toolbox-head" data-box-toggle="' + esc(box.id) + '" aria-expanded="' + isOpen + '">' +
        '<svg class="gp-caret" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>' +
        '<span class="gp-toolbox-label">' + esc(box.label) + '</span>' +
        '<span class="gp-toolbox-desc">' + esc(box.desc) + '</span>' +
        '<span class="gp-toolbox-count">' + tools.length + '</span></button>' +
        '<div class="gp-toolbox-body">' + tools.map(function (t) { return toolRow(t, false); }).join('') + '</div>' +
        '</div>';
    }).join('');
  }

  if (host) {
    host.addEventListener('click', function (event) {
      var toggle = event.target.closest ? event.target.closest('[data-box-toggle]') : null;
      if (toggle) {
        var boxId = toggle.getAttribute('data-box-toggle');
        openBoxes[boxId] = !openBoxes[boxId];
        renderToolList();
        return;
      }
      var toolBtn = event.target.closest ? event.target.closest('[data-tool]') : null;
      if (toolBtn) openTool(toolBtn.getAttribute('data-tool'));
    });
  }
  if (searchInput) searchInput.addEventListener('input', renderToolList);

  /* --------------------------------------------------------- render form --- */
  function layerOptions(polygonOnly, selected, geometry) {
    var all = getLayers();
    var candidates = all.filter(function (layer) {
      if (polygonOnly && !hasPolygon(layer)) return false;
      if (!geometry) return true;
      return (layer.geojson.features || []).some(function (f) { return f.geometry && new RegExp(geometry, 'i').test(f.geometry.type); });
    });
    if (!candidates.length) {
      return polygonOnly && all.length
        ? '<option value="">Belum ada layer poligon — tambahkan dulu</option>'
        : '<option value="">Belum ada layer yang sesuai</option>';
    }
    return candidates.map(function (layer) {
      return '<option value="' + esc(layer.id) + '"' + (String(selected) === String(layer.id) ? ' selected' : '') + '>' +
        esc(layer.name) + ' (' + (layer.geojson.features || []).length + ' fitur)</option>';
    }).join('');
  }

  function checklistOptions(param, selected) {
    var wanted = Array.isArray(selected) ? selected.map(String) : [];
    var all = getLayers();
    var candidates = all.filter(function (layer) { return !param.polygonOnly || hasPolygon(layer); });
    if (!candidates.length) {
      return param.polygonOnly && all.length
        ? '<small>Belum ada layer poligon. Tambahkan layer poligon (mis. hasil gambar polygon atau upload SHP) dulu.</small>'
        : '<small>Belum ada layer yang sesuai.</small>';
    }
    return candidates.map(function (layer) {
      var id = String(layer.id);
      return '<label><input type="checkbox" data-gp-param="' + esc(param.name) + '" data-gp-list="1" value="' + esc(id) +
        '"' + (wanted.indexOf(id) >= 0 ? ' checked' : '') + '> <span>' + esc(layer.name) + ' (' +
        (layer.geojson.features || []).length + ' fitur)</span></label>';
    }).join('');
  }

  function unitOptions(selected) {
    return GPC.UNIT_OPTIONS.map(function (u) {
      return '<option value="' + u.value + '"' + (selected === u.value ? ' selected' : '') + '>' + u.label + '</option>';
    }).join('');
  }

  function boundaryWidget() {
    var level = values.boundaryLevel || '1';
    return '<div class="gp-boundary">' +
      '<select class="geotani-form-input" id="gpBoundaryLevel" aria-label="Tingkat batas wilayah">' +
      ['<option value="1"' + (level === '1' ? ' selected' : '') + '>Provinsi</option>',
        '<option value="2"' + (level === '2' ? ' selected' : '') + '>Kabupaten/Kota</option>',
        '<option value="3"' + (level === '3' ? ' selected' : '') + '>Kecamatan</option>',
        '<option value="4"' + (level === '4' ? ' selected' : '') + '>Desa/Kelurahan</option>'].join('') +
      '</select>' +
      '<div class="gp-boundary-row">' +
      '<input class="geotani-form-input" id="gpBoundaryQuery" type="search" placeholder="Ketik kode atau nama wilayah">' +
      '<button class="geotools-btn gp-action-btn" type="button" data-gp-boundary="search">Cari</button></div>' +
      '<select class="geotani-form-input" id="gpBoundaryResults" size="4"><option value="">Ketik nama/kode lalu cari</option></select>' +
      '<button class="geotools-btn gp-action-btn" type="button" data-gp-boundary="use">Gunakan batas ini</button>' +
      '<div id="gpBoundaryStatus" role="status" aria-live="polite"></div>' +
      '</div>';
  }

  function renderParam(param) {
    if (param.showIf && !param.showIf(values)) return '';
    var id = 'gpv_' + param.name;
    var label = param.label
      ? '<label class="geotani-form-label" for="' + id + '">' + esc(param.label) + (param.required ? ' *' : '') + '</label>'
      : '';
    var hint = param.hint ? '<small class="gp-field-hint">' + esc(param.hint) + '</small>' : '';
    switch (param.type) {
      case 'layer':
        return label + '<select class="geotani-form-input" id="' + id + '" data-gp-param="' + esc(param.name) + '">' +
          '<option value="">Pilih layer&hellip;</option>' + layerOptions(param.polygonOnly, values[param.name], param.geometry) + '</select>' +
          (param.name === 'boundaryLayer' ? '<div id="gpLayerBoundaryStatus"></div>' : '') + hint;
      case 'layers':
        return '<label class="geotani-form-label">' + esc(param.label) + (param.required ? ' *' : '') + '</label>' +
          '<div class="gp-layer-checklist gp-checklist">' + checklistOptions(param, values[param.name]) + '</div>' + hint;
      case 'select':
        return label + '<select class="geotani-form-input" id="' + id + '" data-gp-param="' + esc(param.name) + '">' +
          param.options.map(function (o) {
            return '<option value="' + esc(o.value) + '"' + (String(values[param.name]) === String(o.value) ? ' selected' : '') + '>' +
              esc(o.label) + '</option>';
          }).join('') + '</select>';
      case 'text':
        return label + '<input class="geotani-form-input" id="' + id + '" type="text" data-gp-param="' + esc(param.name) +
          '" placeholder="' + esc(param.placeholder || '') + '" value="' + esc(values[param.name] || '') + '">';
      case 'expression':
        return label + '<input class="geotani-form-input" id="' + id + '" type="text" data-gp-param="' + esc(param.name) +
          '" placeholder="' + esc(param.placeholder || '') + '" value="' + esc(values[param.name] || '') + '">' + hint;
      case 'numberunit':
        return label + '<div class="gp-field-row">' +
          '<input class="geotani-form-input" id="' + id + '" type="number" min="0" step="any" data-gp-param="distance" value="' +
          esc(values.distance) + '">' +
          '<select class="geotani-form-input" aria-label="Satuan jarak" data-gp-param="unit">' + unitOptions(values.unit) + '</select>' +
          '</div>';
      case 'field': {
        var fields = layerFieldNames(values[param.layerFrom], param.numeric);
        var current = values[param.name];
        return label + '<select class="geotani-form-input" id="' + id + '" data-gp-param="' + esc(param.name) + '">' +
          (fields.length
            ? fields.map(function (key) {
                return '<option value="' + esc(key) + '"' + (current === key ? ' selected' : '') + '>' + esc(key) + '</option>';
              }).join('')
            : '<option value="">Tidak ada field numerik</option>') +
          '</select>' + hint;
      }
      case 'fields': {
        var names = layerFieldNames(values[param.layerFrom], false);
        var selected = Array.isArray(values[param.name]) ? values[param.name] : [];
        return label + '<select class="geotani-form-input" id="' + id + '" multiple size="5" data-gp-param="' + esc(param.name) + '">' +
          (names.length
            ? names.map(function (key) {
                return '<option value="' + esc(key) + '"' + (selected.indexOf(key) >= 0 ? ' selected' : '') + '>' + esc(key) + '</option>';
              }).join('')
            : '<option value="">Layer belum memiliki atribut</option>') +
          '</select>' + hint;
      }
      case 'checkbox':
        return '<label class="gp-merge-source-option"><input type="checkbox" data-gp-param="' + esc(param.name) +
          '"' + (values[param.name] ? ' checked' : '') + '> ' + esc(param.label) + '</label>';
      case 'boundary':
        return boundaryWidget();
      case 'info':
        return '<p class="gp-field-hint">' + esc(param.label) + '</p>';
      default:
        return '';
    }
  }

  function renderEnv() {
    var env = GPC.env.get();
    var crsOptions = [
      ['auto', 'Otomatis (rekomendasi) - UTM zone dari pusat data'],
      ['utm', 'UTM zone otomatis'],
      ['aeqd', 'Azimuthal Equidistant (pusat data)'],
      ['4326', 'WGS 84 (EPSG:4326, derajat)']
    ].map(function (o) {
      return '<option value="' + o[0] + '"' + (env.crs === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('');
    var extentOptions = [
      ['input', 'Same as input'],
      ['map', 'Ikut tampilan peta saat ini'],
      ['custom', 'Custom (bbox)']
    ].map(function (o) {
      return '<option value="' + o[0] + '"' + (env.extent === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('');
    var box = Array.isArray(env.extentCustom) && env.extentCustom.length === 4 ? env.extentCustom : ['', '', '', ''];
    var boxLabels = ['West / Bujur min', 'South / Lintang min', 'East / Bujur max', 'North / Lintang max'];
    return '<details class="gp-env"' + (envOpen ? ' open' : '') + '>' +
      '<summary>Environment <span class="gp-env-summary" id="gpEnvSummary">' + esc(GPC.env.summary(env)) + '</span></summary>' +
      '<div class="gp-env-body">' +
      '<label class="geotani-form-label" for="gpEnvCrs">Processing Coordinate System</label>' +
      '<select class="geotani-form-input" id="gpEnvCrs" data-gp-env="crs">' + crsOptions + '</select>' +
      '<div class="gp-env-note">Buffer dan overlay dihitung pada CRS proyeksi agar jarak presisi. Hasil selalu dikembalikan ke EPSG:4326 sesuai spesifikasi GeoJSON untuk peta web.</div>' +
      '<label class="geotani-form-label" for="gpEnvExtent">Extent</label>' +
      '<select class="geotani-form-input" id="gpEnvExtent" data-gp-env="extent">' + extentOptions + '</select>' +
      '<div class="gp-env-grid" id="gpEnvCustom"' + (env.extent === 'custom' ? '' : ' hidden') + '>' +
      box.map(function (v, i) {
        return '<label>Extent ' + esc(boxLabels[i]) +
          '<input class="geotani-form-input" type="number" step="any" data-gp-env="extentCustom' + i + '" value="' + esc(v) + '"></label>';
      }).join('') + '</div>' +
      '<label class="geotani-form-label" for="gpEnvTolerance">XY Tolerance (meter)</label>' +
      '<input class="geotani-form-input" id="gpEnvTolerance" type="number" min="0" step="any" data-gp-env="xyTolerance" value="' +
      esc(env.xyTolerance) + '">' +
      '<div class="gp-env-note">Extent dipotong pada tool analisis geometri (Clip, Buffer, Intersect, Union, Dissolve).</div>' +
      '</div></details>';
  }

  function renderForm() {
    var tool = GPC.get(activeTool);
    var form = document.getElementById('gpToolForm');
    if (!tool || !form) return;
    var boxLabel = GPC.toolboxLabel(tool.toolbox);
    form.innerHTML =
      '<button type="button" class="gp-back" id="gpBackBtn">' +
      '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>' +
      'Semua tool</button>' +
      '<div class="gp-tool-head"><h4>' + esc(tool.label) + '</h4><span class="gp-chip">' + esc(boxLabel) + '</span></div>' +
      '<p class="gp-tool-desc">' + esc(tool.desc) + '</p>' +
      '<div class="gp-fields">' + tool.params.map(renderParam).join('') + '</div>' +
      renderEnv() +
      '<button type="button" class="geotools-btn gp-action-btn gp-run-btn" id="gpRunBtn">Jalankan ' + esc(tool.label) + '</button>';

    var back = document.getElementById('gpBackBtn');
    if (back) back.addEventListener('click', closeTool);
    var runBtn = document.getElementById('gpRunBtn');
    if (runBtn) runBtn.addEventListener('click', run);

    var searchBtn = form.querySelector('[data-gp-boundary="search"]');
    if (searchBtn) searchBtn.addEventListener('click', window.searchGeoprocessingBoundaries);
    var useBtn = form.querySelector('[data-gp-boundary="use"]');
    if (useBtn) useBtn.addEventListener('click', window.loadGeoprocessingBoundary);
    var level = document.getElementById('gpBoundaryLevel');
    if (level) level.addEventListener('change', function () {
      values.boundaryLevel = level.value;
      window.changeGeoprocessingBoundaryLevel();
    });
    var query = document.getElementById('gpBoundaryQuery');
    if (query) query.addEventListener('input', function () {
      clearTimeout(query._timer);
      query._timer = setTimeout(window.searchGeoprocessingBoundaries, 220);
    });

    if (running) setRunning(true);
    if (values.clipSource === 'layer') updateLayerBoundaryStatus();
  }

  function openTool(id, preset) {
    var tool = GPC.get(id);
    if (!tool) return;
    activeTool = id;
    values = preset ? Object.assign(defaultValues(tool), preset)
      : (remembered[id] ? Object.assign({}, remembered[id]) : defaultValues(tool));
    document.getElementById('gpToolList').hidden = true;
    document.getElementById('gpToolForm').hidden = false;
    renderToolList();
    renderForm();
    status(getLayers().length ? getLayers().length + ' layer tersedia.' : 'Muat layer GeoJSON/SHP melalui tab Muat Data.', false);
  }

  function closeTool() {
    if (activeTool) remembered[activeTool] = Object.assign({}, values);
    activeTool = null;
    document.getElementById('gpToolList').hidden = false;
    document.getElementById('gpToolForm').hidden = true;
    renderToolList();
  }

  /* -------------------------------------------------- event delegation ---- */
  var formEl = document.getElementById('gpToolForm');

  function onFormEvent(event) {
    var target = event.target;
    if (!target || !target.getAttribute) return;
    var envKey = target.getAttribute('data-gp-env');
    if (envKey) { syncEnv(envKey, target); return; }
    var name = target.getAttribute('data-gp-param');
    if (!name || !activeTool) return;
    var tool = GPC.get(activeTool);
    if (!tool) return;

    if (target.getAttribute('data-gp-list')) {
      var boxes = formEl.querySelectorAll('[data-gp-param="' + name + '"][data-gp-list]:checked');
      values[name] = Array.prototype.map.call(boxes, function (box) { return box.value; });
      return;
    }
    if (target.type === 'checkbox') {
      values[name] = target.checked;
    } else if (target.type === 'number') {
      values[name] = target.value === '' || !isFinite(Number(target.value)) ? '' : Number(target.value);
    } else if (target.tagName === 'SELECT' && target.multiple) {
      values[name] = Array.prototype.filter.call(target.options, function (o) { return o.selected; })
        .map(function (o) { return o.value; });
    } else {
      values[name] = target.value;
    }

    if (name === 'boundaryLayer') updateLayerBoundaryStatus();
    /* Render ulang hanya pada 'change' supaya mengetik tidak mereset fokus. */
    if (event.type === 'change' && tool.rerenderOnChange && tool.rerenderOnChange.indexOf(name) >= 0) {
      renderForm();
    }
  }

  function syncEnv(key, target) {
    var env = GPC.env.get();
    if (key.indexOf('extentCustom') === 0) {
      var index = Number(key.slice('extentCustom'.length));
      var box = Array.isArray(env.extentCustom) && env.extentCustom.length === 4
        ? env.extentCustom.slice() : ['', '', '', ''];
      box[index] = target.value === '' || !isFinite(Number(target.value)) ? '' : Number(target.value);
      GPC.env.set({ extentCustom: box });
    } else if (key === 'xyTolerance') {
      GPC.env.set({ xyTolerance: target.value === '' || !isFinite(Number(target.value))
        ? 0 : Number(target.value) });
    } else {
      var patch = {};
      patch[key] = target.value;
      GPC.env.set(patch);
      if (key === 'extent') {
        var grid = document.getElementById('gpEnvCustom');
        if (grid) grid.hidden = target.value !== 'custom';
      }
    }
    updateEnvSummary();
  }

  function updateEnvSummary() {
    var el = document.getElementById('gpEnvSummary');
    if (el) el.textContent = GPC.env.summary(GPC.env.get());
  }

  if (formEl) {
    formEl.addEventListener('input', onFormEvent);
    formEl.addEventListener('change', onFormEvent);
    /* 'toggle' tidak menggelembung, jadi ditangkap saat fase capture. */
    formEl.addEventListener('toggle', function (event) {
      if (event.target && event.target.classList && event.target.classList.contains('gp-env')) {
        envOpen = !!event.target.open;
      }
    }, true);
  }

  /* ------------------------------------------------------- progress -------- */
  function updateProgress(value, label) {
    var fill = document.getElementById('gpProgressFill');
    var text = document.getElementById('gpProgressLabel');
    var pct = Math.max(0, Math.min(1, Number(value) || 0));
    if (fill) fill.style.width = (pct * 100).toFixed(1) + '%';
    if (text) text.textContent = (label || 'Memproses...') + ' (' + Math.round(pct * 100) + '%)';
  }

  function setRunning(isRunning) {
    var btn = document.getElementById('gpRunBtn');
    if (btn) btn.disabled = !!isRunning;
    var progress = document.getElementById('gpProgress');
    if (progress) progress.hidden = !isRunning;
    var form = document.getElementById('gpToolForm');
    if (form) {
      Array.prototype.forEach.call(form.querySelectorAll('input, select'), function (el) {
        el.disabled = !!isRunning;
      });
    }
  }

  var cancelBtn = document.getElementById('gpCancelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', function () {
      if (running) running.cancel();
    });
  }

  /* ------------------------------------------------------------ jalankan ---- */
  var HISTORY_STATUS_LABEL = { ok: 'Berhasil', error: 'Gagal', cancelled: 'Dibatalkan', running: 'Berjalan' };

  function paramLabel(key, value, labels) {
    if (labels && labels[key] != null) return labels[key];
    if (key === 'input' || key === 'boundaryLayer') {
      var layer = layerById(value);
      return layer ? layer.name : value;
    }
    if (key === 'layers' && Array.isArray(value)) {
      return value.map(function (id) {
        var item = layerById(id);
        return item ? item.name : id;
      }).join(', ');
    }
    if (typeof value === 'boolean') return value ? 'ya' : 'tidak';
    return value;
  }

  /* Nama layer dipetakan saat eksekusi: daftar layer peta bisa berubah
     (penomoran "Layer peta N" ikut bergeser), sehingga resolve ulang nanti
     bisa menampilkan nama yang salah di riwayat. */
  function resolveLabels(tool, values) {
    var labels = {};
    tool.params.forEach(function (param) {
      if (param.type === 'layer') {
        var layer = layerById(values[param.name]);
        if (layer) labels[param.name] = layer.name;
      } else if (param.type === 'layers' && Array.isArray(values[param.name])) {
        labels[param.name] = values[param.name].map(function (id) {
          var item = layerById(id);
          return item ? item.name : id;
        }).join(', ');
      }
    });
    return labels;
  }

  function summarizeParams(entry) {
    var params = entry.params || {};
    return Object.keys(params).map(function (key) {
      var value = params[key];
      if (value == null || value === '' || (Array.isArray(value) && !value.length)) return '';
      if (typeof value === 'object') return '';
      return key + ': ' + paramLabel(key, value, entry.labels);
    }).filter(Boolean).join('  ·  ');
  }

  function pushHistory(entry) {
    try {
      GPC.history.add(entry);
    } catch (e) { /* penyimpanan penuh/diizinkan ditolak: riwayat tidak kritis */ }
    renderHistory();
  }

  function run() {
    var tool = GPC.get(activeTool);
    if (!tool || running) return;
    var extras = { boundaryReady: !!boundaryState.adminFeature, adminBoundary: adminBoundary() };
    var problem = GPC.validateTool(tool, values, extras);
    if (problem) { status(problem, true); return; }

    var job;
    var snapshot;
    try {
      job = GPC.buildJob(tool.id, values, extras);
      snapshot = JSON.parse(JSON.stringify(values));
    } catch (error) {
      status(error.message || 'Parameter tidak lengkap.', true);
      return;
    }

    /* Nama & parameter disalin sekarang: nilai form bisa berubah bila pengguna
       membuka tool lain selama job masih berjalan. */
    var requestedName = String(values.output || '').trim() || tool.label;
    var started = Date.now();
    var entry = {
      id: 'gp-' + started.toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      at: started,
      toolId: tool.id,
      toolLabel: tool.label,
      params: snapshot,
      labels: resolveLabels(tool, values),
      output: null,
      status: 'running',
      message: '',
      duration: null,
      features: null,
      crs: null,
      skipped: 0
    };

    setRunning(true);
    updateProgress(0.02, 'Menyiapkan ' + tool.label + '...');
    status('Menjalankan ' + tool.label + ' di latar belakang. UI tetap dapat digunakan.', false);

    var exec = GPC.execute(job, {
      onProgress: function (value, label) { updateProgress(value, label); }
    });
    running = exec;

    exec.promise.then(function (result) {
      running = null;
      setRunning(false);
      var duration = Date.now() - started;
      var features = (result && result.features) || [];
      var skipped = (result && result.skipped) || 0;
      var skipNote = skipped
        ? ' ' + skipped + ' geometri rusak tidak dapat dipulihkan sehingga dilewati.'
        : '';

      if (!features.length) {
        entry.status = 'ok';
        entry.duration = duration;
        entry.skipped = skipped;
        entry.message = 'Tidak ada fitur yang jatuh dalam hasil.' + skipNote;
        status(tool.label + ' selesai: 0 fitur hasil.' + skipNote, true);
        pushHistory(entry);
        return;
      }

      var name = uniqueOutputName(requestedName);
      addOutput({
        name: name,
        toolLabel: tool.label,
        geojson: { type: 'FeatureCollection', features: features },
        crs: (result && result.crs) || 'EPSG:4326',
        skipped: skipped,
        duration: duration
      });

      entry.status = 'ok';
      entry.output = name;
      entry.duration = duration;
      entry.features = features.length;
      entry.crs = (result && result.crs) || 'EPSG:4326';
      entry.skipped = skipped;
      entry.message = features.length.toLocaleString('id-ID') + ' fitur ditambahkan sebagai "' + name + '".' + skipNote;
      status(tool.label + ' selesai dalam ' + (duration / 1000).toFixed(1) + ' detik: ' +
        features.length.toLocaleString('id-ID') + ' fitur → ' + name + '.' + skipNote, false);
      pushHistory(entry);
    }, function (error) {
      running = null;
      setRunning(false);
      var cancelled = !!(error && error.cancelled);
      entry.status = cancelled ? 'cancelled' : 'error';
      entry.duration = Date.now() - started;
      entry.message = (error && error.message) || 'Geoprocessing gagal.';
      status(cancelled ? 'Geoprocessing dibatalkan.' : entry.message, !cancelled);
      pushHistory(entry);
    });
  }

  /* ------------------------------------------------------------ output ----- */
  function uniqueOutputName(base) {
    var name = String(base || 'Hasil').trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_') || 'Hasil';
    var taken = {};
    outputs.forEach(function (out) { taken[String(out.name).toLowerCase()] = true; });
    getLayers(true).forEach(function (layer) { taken[String(layer.name).toLowerCase()] = true; });
    if (!taken[name.toLowerCase()]) return name;
    var suffix = 1;
    var candidate;
    do { candidate = name + '_' + (suffix++); } while (taken[candidate.toLowerCase()]);
    return candidate;
  }

  function shpSafeProps(properties) {
    var safe = {};
    Object.keys(properties || {}).forEach(function (key) {
      var base = String(key || 'field').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 10) || 'field';
      var field = base;
      var suffix = 1;
      while (Object.prototype.hasOwnProperty.call(safe, field)) {
        var tail = String(suffix++);
        field = base.slice(0, 10 - tail.length) + tail;
      }
      var value = properties[key];
      safe[field] = value == null || (typeof value === 'number' && !isFinite(value)) ? ''
        : typeof value === 'boolean' ? (value ? 1 : 0)
          : typeof value === 'object' ? JSON.stringify(value) : value;
    });
    return safe;
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function fileBase(name) {
    return String(name || 'hasil').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'hasil';
  }

  function addOutput(spec) {
    var color = OUTPUT_COLORS[outputs.length % OUTPUT_COLORS.length];
    var item = window.addAlatGeoJSONLayer(spec.name, 'Geoprocessing', spec.geojson);
    /* Ganti warna bawaan agar tiap hasil mudah dibedakan di peta. */
    if (item && item.layer && typeof item.layer.setStyle === 'function') {
      try {
        item.layer.setStyle({ color: color, fillColor: color, weight: 2, fillOpacity: 0.3 });
      } catch (e) { /* sebagian layer tidak mendukung setStyle */ }
    }
    outputs.unshift({
      id: 'out-' + (++outputSeq),
      name: spec.name,
      color: color,
      toolLabel: spec.toolLabel,
      geojson: spec.geojson,
      crs: spec.crs,
      skipped: spec.skipped || 0,
      duration: spec.duration || 0,
      at: Date.now(),
      item: item,
      visible: true
    });
    invalidateLayers();
    renderOutputs();
    return outputs[0];
  }

  function outputById(id) {
    for (var i = 0; i < outputs.length; i++) if (outputs[i].id === id) return outputs[i];
    return null;
  }

  function exportGeoJSON(output) {
    var blob = new Blob([JSON.stringify(output.geojson)], { type: 'application/geo+json' });
    downloadBlob(blob, fileBase(output.name) + '.geojson');
    status('GeoJSON ' + output.name + ' diunduh.', false);
  }

  function exportCSV(output) {
    var features = output.geojson.features || [];
    var keys = [];
    features.slice(0, 1000).forEach(function (feature) {
      Object.keys(feature.properties || {}).forEach(function (key) {
        if (keys.indexOf(key) < 0) keys.push(key);
      });
    });
    if (!keys.length) keys = ['_fitur'];
    var cell = function (value) {
      if (value == null) return '';
      var text = typeof value === 'object' ? JSON.stringify(value) : String(value);
      return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    };
    var rows = [keys.map(cell).join(',')];
    features.forEach(function (feature) {
      var props = feature.properties || {};
      rows.push(keys.map(function (key) { return cell(props[key]); }).join(','));
    });
    downloadBlob(new Blob(['\ufeff' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }),
      fileBase(output.name) + '.csv');
    status('CSV ' + output.name + ' diunduh (' + features.length + ' baris).', false);
  }

  function exportSHP(output) {
    var writer = window.shpwrite || (typeof shpwrite !== 'undefined' ? shpwrite : null);
    if (!writer || typeof writer.zip !== 'function') {
      status('Modul pembuat SHP belum siap. Muat ulang halaman lalu coba lagi.', true);
      return;
    }
    var features = (output.geojson.features || []).filter(function (feature) {
      return feature && feature.geometry && feature.geometry.type && Array.isArray(feature.geometry.coordinates);
    });
    if (!features.length) { status('Hasil tidak memiliki geometri untuk diekspor.', true); return; }
    var types = {};
    features.forEach(function (feature) {
      var type = feature.geometry.type;
      if (type === 'Point' || type === 'MultiPoint') types.point = 'points';
      else if (type === 'LineString' || type === 'MultiLineString') types.polyline = 'lines';
      else if (type === 'Polygon' || type === 'MultiPolygon') types.polygon = 'polygons';
    });
    if (!Object.keys(types).length) { status('Jenis geometri hasil belum didukung format SHP.', true); return; }
    var base = fileBase(output.name);
    var collection = {
      type: 'FeatureCollection',
      features: features.map(function (feature) {
        return Object.assign({}, feature, { properties: shpSafeProps(feature.properties) });
      })
    };
    writer.zip(collection, {
      folder: base,
      filename: base,
      outputType: 'blob',
      types: types,
      prj: 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],'
        + 'PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'
    }).then(function (zipData) {
      var blob = zipData instanceof Blob ? zipData : new Blob([zipData], { type: 'application/zip' });
      downloadBlob(blob, base + '.zip');
      status('SHP ' + output.name + ' diunduh (' + features.length + ' fitur).', false);
    }).catch(function (error) {
      status('Gagal membuat SHP: ' + ((error && error.message) || error), true);
    });
  }

  function outputTableHTML(output) {
    var features = output.geojson.features || [];
    var keys = [];
    features.slice(0, 200).forEach(function (feature) {
      Object.keys(feature.properties || {}).forEach(function (key) {
        if (keys.indexOf(key) < 0) keys.push(key);
      });
    });
    if (!keys.length) keys = ['_fitur'];
    var rows = features.slice(0, 200).map(function (feature, index) {
      var props = feature.properties || {};
      return '<tr><td>' + (index + 1) + '</td>' + keys.map(function (key) {
        var value = props[key];
        if (value == null) value = '';
        if (typeof value === 'object') value = JSON.stringify(value);
        return '<td title="' + esc(value) + '">' + esc(value) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<details class="gp-output-table"' + (output.tableOpen ? ' open' : '') + ' data-out-table="' + esc(output.id) + '">' +
      '<summary>Tabel atribut (' + features.length.toLocaleString('id-ID') + ' fitur)</summary>' +
      '<div class="gp-table-scroll"><table class="gp-table"><thead><tr><th>#</th>' +
      keys.map(function (key) { return '<th>' + esc(key) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      (features.length > 200 ? '<div class="gp-table-note">Menampilkan 200 baris pertama. Unduh GeoJSON/CSV untuk data lengkap.</div>' : '') +
      '</details>';
  }

  function renderOutputs() {
    var host2 = document.getElementById('gpOutputs');
    if (!host2) return;
    host2.hidden = !outputs.length;
    if (!outputs.length) { host2.innerHTML = ''; return; }
    host2.innerHTML = '<div class="gp-outputs-title">Hasil (' + outputs.length + ')</div>' +
      outputs.map(function (output) {
        var visible = output.item && window.map && window.map.hasLayer(output.item.layer);
        return '<div class="gp-output' + (visible ? '' : ' is-hidden') + '" data-out="' + esc(output.id) + '">' +
          '<div class="gp-output-head">' +
          '<span class="gp-output-swatch" style="background:' + esc(output.color) + '"></span>' +
          '<span class="gp-output-name" title="' + esc(output.name) + '">' + esc(output.name) + '</span>' +
          '<span class="gp-output-meta">' + (output.geojson.features || []).length.toLocaleString('id-ID') +
          ' fitur &middot; ' + (output.duration / 1000).toFixed(1) + ' dtk</span></div>' +
          '<div class="gp-output-meta">' + esc(output.toolLabel) + ' &middot; ' + esc(output.crs) +
          (output.skipped ? ' &middot; ' + output.skipped + ' dilewati' : '') + '</div>' +
          '<div class="gp-output-actions">' +
          '<button type="button" data-out-act="eye">' + (visible ? 'Sembunyikan' : 'Tampilkan') + '</button>' +
          '<button type="button" data-out-act="geojson">GeoJSON</button>' +
          '<button type="button" data-out-act="shp">SHP</button>' +
          '<button type="button" data-out-act="csv">CSV</button>' +
          '<button type="button" data-out-act="table">Tabel</button>' +
          '<button type="button" class="is-danger" data-out-act="delete">Hapus</button>' +
          '</div>' + outputTableHTML(output) + '</div>';
      }).join('');
  }

  var outputsHost = document.getElementById('gpOutputs');
  if (outputsHost) {
    outputsHost.addEventListener('click', function (event) {
      var btn = event.target.closest ? event.target.closest('[data-out-act]') : null;
      if (!btn) return;
      var cardEl = btn.closest('[data-out]');
      var output = cardEl ? outputById(cardEl.getAttribute('data-out')) : null;
      if (!output) return;
      var action = btn.getAttribute('data-out-act');
      if (action === 'eye') {
        if (!window.map || !output.item) return;
        if (window.map.hasLayer(output.item.layer)) window.map.removeLayer(output.item.layer);
        else output.item.layer.addTo(window.map);
        renderOutputs();
      } else if (action === 'geojson') {
        exportGeoJSON(output);
      } else if (action === 'csv') {
        exportCSV(output);
      } else if (action === 'shp') {
        exportSHP(output);
      } else if (action === 'table') {
        output.tableOpen = !output.tableOpen;
        var details = outputsHost.querySelector('[data-out-table="' + output.id + '"]');
        if (details) details.open = output.tableOpen;
        else renderOutputs();
      } else if (action === 'delete') {
        if (output.item && typeof window.removeAlatGeoJSONLayer === 'function') {
          window.removeAlatGeoJSONLayer(output.item);
        }
        outputs = outputs.filter(function (item) { return item.id !== output.id; });
        invalidateLayers();
        renderOutputs();
        status('Hasil "' + output.name + '" dihapus.', false);
      }
    });
    outputsHost.addEventListener('toggle', function (event) {
      if (!event.target || !event.target.hasAttribute) return;
      var id = event.target.getAttribute('data-out-table');
      if (!id) return;
      var output = outputById(id);
      if (output) output.tableOpen = !!event.target.open;
    }, true);
  }

  /* ----------------------------------------------------------- riwayat ----- */
  function historyItemHTML(entry) {
    var statusClass = entry.status === 'ok' ? 'is-ok'
      : entry.status === 'cancelled' ? 'is-cancelled'
        : entry.status === 'running' ? '' : 'is-error';
    var when = new Date(entry.at).toLocaleString('id-ID',
      { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    var meta = [summarizeParams(entry)];
    if (entry.features != null) meta.push(entry.features.toLocaleString('id-ID') + ' fitur');
    if (entry.duration != null) meta.push((entry.duration / 1000).toFixed(1) + ' dtk');
    if (entry.crs) meta.push(entry.crs);
    return '<div class="gp-history-item ' + statusClass + '" data-hist="' + esc(entry.id) + '">' +
      '<div class="gp-history-top"><b>' + esc(entry.toolLabel || entry.toolId) + '</b>' +
      '<span class="gp-chip">' + esc(HISTORY_STATUS_LABEL[entry.status] || entry.status) + '</span>' +
      '<time>' + esc(when) + '</time></div>' +
      (meta.join('  ·  ') ? '<div class="gp-history-meta">' + esc(meta.join('  ·  ')) + '</div>' : '') +
      (entry.message ? '<div class="gp-history-msg">' + esc(entry.message) + '</div>' : '') +
      '<div class="gp-history-actions">' +
      '<button type="button" data-hist-act="rerun">Jalankan lagi</button>' +
      '<button type="button" data-hist-act="params">Parameter</button>' +
      '<button type="button" data-hist-act="remove">Hapus</button>' +
      '</div>' +
      '<pre class="gp-history-params" hidden>' + esc(JSON.stringify(entry.params || {}, null, 2)) + '</pre>' +
      '</div>';
  }

  function renderHistory() {
    var list = GPC.history.list();
    var count = document.getElementById('gpHistoryCount');
    if (count) {
      count.textContent = list.length > 99 ? '99+' : String(list.length);
      count.hidden = !list.length;
    }
    var host2 = document.getElementById('gpHistoryList');
    if (!host2) return;
    host2.innerHTML = list.length
      ? list.map(historyItemHTML).join('')
      : '<div class="gp-history-empty">Belum ada riwayat. Jalankan sebuah tool untuk mulai mencatat analisis di sini.</div>';
  }

  var historyHost = document.getElementById('gpHistoryList');
  if (historyHost) {
    historyHost.addEventListener('click', function (event) {
      var btn = event.target.closest ? event.target.closest('[data-hist-act]') : null;
      if (!btn) return;
      var cardEl = btn.closest('[data-hist]');
      var id = cardEl && cardEl.getAttribute('data-hist');
      if (!id) return;
      var action = btn.getAttribute('data-hist-act');
      if (action === 'remove') {
        GPC.history.remove(id);
        renderHistory();
        return;
      }
      var entry = null;
      GPC.history.list().some(function (item) {
        if (item.id === id) { entry = item; return true; }
        return false;
      });
      if (!entry) return;
      if (action === 'params') {
        var pre = cardEl.querySelector('.gp-history-params');
        if (pre) pre.hidden = !pre.hidden;
      } else if (action === 'rerun') {
        if (!GPC.get(entry.toolId)) {
          status('Tool "' + (entry.toolLabel || entry.toolId) + '" tidak tersedia lagi.', true);
          return;
        }
        switchTab('tools');
        openTool(entry.toolId, entry.params || {});
        status('Parameter dari riwayat dimuat. Periksa lalu tekan Jalankan.', false);
      }
    });
  }

  var historyClear = document.getElementById('gpHistoryClear');
  if (historyClear) {
    historyClear.addEventListener('click', function () {
      if (!GPC.history.count()) return;
      if (!window.confirm('Hapus seluruh riwayat geoprocessing?')) return;
      GPC.history.clear();
      renderHistory();
    });
  }

  /* --------------------------------------------------------------- tab ----- */
  function switchTab(name) {
    var toolsPanel = document.getElementById('gpPanelTools');
    var historyPanel = document.getElementById('gpPanelHistory');
    var buttons = document.querySelectorAll('[data-gp-tab]');
    var showHistory = name === 'history';
    if (toolsPanel) toolsPanel.hidden = showHistory;
    if (historyPanel) historyPanel.hidden = !showHistory;
    Array.prototype.forEach.call(buttons, function (button) {
      var active = button.getAttribute('data-gp-tab') === name;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (showHistory) renderHistory();
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-gp-tab]'), function (button) {
    button.addEventListener('click', function () { switchTab(button.getAttribute('data-gp-tab')); });
  });

  /* ------------------------------------------ segarkan pilihan layer ------- */
  var refreshTimer = null;
  function refreshLayerChoices() {
    invalidateLayers();
    if (!activeTool) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () {
      if (!activeTool) return;
      /* Jangan timpa pengguna yang sedang mengetik di kolom teks/angka. */
      var focused = document.activeElement;
      var form = document.getElementById('gpToolForm');
      if (focused && form && form.contains(focused) &&
        (focused.tagName === 'INPUT' && (focused.type === 'text' || focused.type === 'number' || focused.type === 'search'))) {
        return;
      }
      renderForm();
    }, 350);
  }
  window.refreshGeoprocessingLayerChoices = refreshLayerChoices;

  if (window.map && typeof window.map.on === 'function') {
    window.map.on('layeradd layerremove', function () {
      if (!card || card.open) refreshLayerChoices();
    });
  }

  if (card) {
    card.addEventListener('toggle', function () {
      if (!card.open) return;
      refreshLayerChoices();
      renderToolList();
    });
  }

  /* --------------------------------------------------------------- boot ---- */
  renderToolList();
  renderHistory();
  renderOutputs();
})();
