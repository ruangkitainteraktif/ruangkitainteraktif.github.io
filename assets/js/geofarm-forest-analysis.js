/* GeoFarm: statistik luas Kawasan Hutan Indonesia dari layanan ESDM. */
(function () {
  'use strict';

  var SERVICE = 'https://geoportal.esdm.go.id/gis1/rest/services/Kawasan_Hutan/MapServer';
  var LAYER = SERVICE + '/0';
  var PROXY = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';
  var FOREST_WHERE = "deskripsi IN ('Kawasan Konservasi','Hutan Lindung','Hutan Produksi Tetap','Hutan Produksi Terbatas','Hutan Produksi Yang Dapat Dikonversi')";
  /* Halaman kecil lebih stabil pada service ESDM; halaman adaptif mengecil
     lagi bila server gagal memproses geometri yang kompleks. */
  var CHUNK = 200;
  var CACHE_KEY = 'geofarm-forest-statistics-esdm-20251018-v5-geodesic-corrected';
  var FOREST_CLASSES = [
    'Kawasan Konservasi', 'Hutan Lindung', 'Hutan Produksi Tetap',
    'Hutan Produksi Terbatas', 'Hutan Produksi Yang Dapat Dikonversi'
  ];
  var ISLANDS = [
    { name: 'Sumatera', file: 'sumatera', codes: [11,12,13,14,15,16,17,18,19,21], bounds: [[-6,95],[6,107]] },
    { name: 'Jawa', file: 'jawa', codes: [31,32,33,34,35,36], bounds: [[-9,104],[ -5,115]] },
    { name: 'Bali & Nusa Tenggara', file: 'bali-nusa-tenggara', codes: [51,52,53], bounds: [[-12,113],[-7,126]] },
    { name: 'Kalimantan', file: 'kalimantan', codes: [61,62,63,64,65], bounds: [[-5,108],[5,120]] },
    { name: 'Sulawesi', file: 'sulawesi', codes: [71,72,73,74,75,76], bounds: [[-7,117],[3,126]] },
    { name: 'Maluku', file: 'maluku', codes: [81,82], bounds: [[-9,123],[3,136]] },
    { name: 'Papua', file: 'papua', codes: [91,92,93,94,95,96], bounds: [[-11,129],[1,142]] }
  ];
  var btn = document.getElementById('geofarm-forest-run');
  var resetBtn = document.getElementById('geofarm-forest-reset');
  var status = document.getElementById('geofarm-forest-status');
  var output = document.getElementById('geofarm-forest-output');
  var islandSteps = document.getElementById('geofarm-forest-island-steps');
  var chart = null;
  var islandCache = readIslandCache();
  var forestMapLayers = Object.create(null);
  var busy = false;

  if (!btn || !status || !output || !islandSteps) return;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function formatHa(value) {
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value);
  }

  function formatPct(value) {
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(value) + '%';
  }

  function setLoading(step, title, progress, detail) {
    var pct = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : null;
    status.innerHTML = '<div class="gf-forest-loading"><span class="gf-forest-spinner" aria-hidden="true"></span>' +
      '<div class="gf-forest-loading-copy"><strong>' + esc(step + ' · ' + title) + '</strong>' +
      (detail ? '<small>' + esc(detail) + '</small>' : '') +
      (pct === null ? '<div class="gf-forest-progress gf-forest-progress-indeterminate"><i></i></div>' :
        '<div class="gf-forest-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>') +
      '</div></div>';
  }

  function serviceErrorMessage(data) {
    if (!data || !data.error) return '';
    var error = data.error;
    var detail = Array.isArray(error.details) ? error.details.filter(Boolean).join(' ') : '';
    return [error.message, detail].filter(Boolean).join(' — ');
  }

  function apiUrl(offset, count, where, omitOrder) {
    var params = {
      f: 'json', where: where, outFields: 'objectid_1,kode_prov,deskripsi,namobj,fungsikws,noskkws,lskkws',
      returnGeometry: 'true', outSR: '4326', orderByFields: 'objectid_1',
      resultOffset: offset, resultRecordCount: count
    };
    if (omitOrder) delete params.orderByFields;
    return LAYER + '/query?' + Object.keys(params).map(function (key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
    }).join('&');
  }

  async function fetchJson(url) {
    var attempts = [url, PROXY + encodeURIComponent(url)];
    var lastError;
    for (var i = 0; i < attempts.length; i++) {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, 90000);
      try {
        var response = await fetch(attempts[i], { signal: ctrl.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        var data = await response.json();
        if (data.error) throw new Error(serviceErrorMessage(data) || 'Layanan ESDM menolak permintaan.');
        return data;
      } catch (error) {
        lastError = error && error.name === 'AbortError' ? new Error('Permintaan data melewati batas waktu.') : error;
      } finally { clearTimeout(timer); }
    }
    throw lastError || new Error('Gagal menghubungi layanan ESDM.');
  }

  function geometryAreaHa(geometry) {
    if (!geometry || !Array.isArray(geometry.rings) || !geometry.rings.length || !window.geoArea) return 0;
    try {
      /* ArcGIS stores rings as [longitude, latitude], while geoArea expects
         [latitude, longitude]. Preserve ring winding so multipart exteriors
         are added and interior holes are subtracted correctly. */
      var latLngRings = geometry.rings.map(function (ring) {
        return ring.map(function (point) { return [Number(point[1]), Number(point[0])]; });
      });
      if (typeof window.geoArea.areaM2FromRings === 'function') {
        return window.geoArea.areaM2FromRings(latLngRings, true) / 10000 || 0;
      }
      return window.geoArea.areaHaFromRings(latLngRings) || 0;
    }
    catch (_) { return 0; }
  }

  function propertyValue(properties, name) {
    if (!properties) return '';
    if (properties[name] !== undefined) return properties[name];
    var match = Object.keys(properties).find(function (key) { return key.toLowerCase() === name.toLowerCase(); });
    return match ? properties[match] : '';
  }

  function categoryName(properties) {
    var label = String(propertyValue(properties, 'deskripsi') || '').trim();
    var code = String(propertyValue(properties, 'fungsikws') || '');
    if (!label) {
      if (/^(100000|1002(00|10|20|30|40|50|60))$/.test(code)) return 'Kawasan Konservasi';
      if (/^100(201|211|221|241|251)$/.test(code)) return 'Kawasan Konservasi Laut';
      if (code === '100100') return 'Hutan Lindung';
      if (code === '100300') return 'Hutan Produksi Tetap';
      if (code === '100400') return 'Hutan Produksi Terbatas';
      if (code === '100500') return 'Hutan Produksi Yang Dapat Dikonversi';
      if (code === '100700') return 'Areal Penggunaan Lain';
      if (/^500(100|300)$/.test(code)) return 'Tubuh Air';
      return 'Tidak Terdefinisi';
    }
    var normalized = label.toLowerCase();
    if (normalized.indexOf('konservasi') >= 0 && normalized.indexOf('laut') >= 0) return 'Kawasan Konservasi Laut';
    if (normalized.indexOf('konservasi') >= 0) return 'Kawasan Konservasi';
    if (normalized.indexOf('lindung') >= 0) return 'Hutan Lindung';
    if (normalized.indexOf('produksi') >= 0 && normalized.indexOf('konversi') >= 0) return 'Hutan Produksi Yang Dapat Dikonversi';
    if (normalized.indexOf('produksi') >= 0 && normalized.indexOf('terbatas') >= 0) return 'Hutan Produksi Terbatas';
    if (normalized.indexOf('produksi') >= 0 && normalized.indexOf('tetap') >= 0) return 'Hutan Produksi Tetap';
    if (normalized.indexOf('penggunaan lain') >= 0) return 'Areal Penggunaan Lain';
    if (normalized.indexOf('tubuh air') >= 0) return 'Tubuh Air';
    return label;
  }

  function forestColor(category) {
    var value = String(category || '').toLowerCase();
    if (value.indexOf('konservasi') >= 0 && value.indexOf('laut') < 0) return '#7c3aed';
    if (value.indexOf('konservasi laut') >= 0) return '#0891b2';
    if (value.indexOf('lindung') >= 0) return '#15803d';
    if (value.indexOf('dapat dikonversi') >= 0) return '#ea580c';
    if (value.indexOf('terbatas') >= 0) return '#84cc16';
    if (value.indexOf('produksi tetap') >= 0) return '#ca8a04';
    if (value.indexOf('air') >= 0) return '#0284c7';
    return '#64748b';
  }

  function popupHtml(feature, island) {
    var p = feature.properties || {};
    var category = categoryName(p);
    var fields = [
      ['Pulau', island.name], ['Fungsi kawasan', category],
      ['Nama objek', propertyValue(p, 'namobj')], ['Kode provinsi', propertyValue(p, 'kode_prov')],
      ['Nomor SK', propertyValue(p, 'noskkws')],
      ['Luas menurut SK', propertyValue(p, 'lskkws') ? formatHa(Number(propertyValue(p, 'lskkws'))) + ' ha' : '—']
    ].filter(function (row) { return row[1] !== '' && row[1] !== null && row[1] !== undefined; });
    var fieldHtml = fields.map(function (row) {
      return '<div class="agol-popup-field"><span class="agol-popup-field-label">' + esc(row[0])
        + '</span><span class="agol-popup-field-value">' + esc(row[1]) + '</span></div>';
    }).join('');
    return '<div class="agol-popup">'
      + '<div class="agol-popup-header agol-geo-kawasan">'
      + '<div class="agol-popup-badge"><span class="agol-popup-badge-dot" style="background:' + esc(forestColor(category)) + '"></span>ESDM · KAWASAN HUTAN</div>'
      + '<div class="agol-popup-title">' + esc(category) + '</div>'
      + '</div>'
      + '<div class="agol-popup-body"><div class="agol-popup-fields">' + fieldHtml + '</div></div>'
      + '<div class="agol-popup-footer"><span>Sumber: Geoportal ESDM · Kawasan Hutan</span></div>'
      + '</div>';
  }

  function createIslandImageLayer(island) {
    if (!window.L || !L.esri || !L.esri.dynamicMapLayer) throw new Error('Layer gambar server tidak tersedia.');
    var where = 'kode_prov IN (' + island.codes.join(',') + ') AND ' + FOREST_WHERE;
    var layer = L.esri.dynamicMapLayer({
      url: SERVICE, layers: [0], layerDefs: { 0: where }, opacity: 0.82,
      format: 'png32', transparent: true, f: 'image'
    });
    if (typeof layer.bindPopup === 'function') layer.bindPopup(function (error, collection) {
      var feature = collection && collection.features && collection.features[0];
      return error || !feature ? false : popupHtml(feature, island);
    }, { maxWidth: 320, className: 'gf-forest-leaflet-popup' });
    return layer;
  }

  function readIslandCache() {
    try {
      var parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) { return {}; }
  }

  function writeIslandCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(islandCache)); return true; }
    catch (error) { console.warn('[GeoFarm Kawasan Hutan] Gagal menyimpan cache lokal:', error); return false; }
  }

  function allIslandsReady() {
    return ISLANDS.every(function (island) { return !!islandCache[island.name]; });
  }

  async function readLocalIslandData(island) {
    var baseUrl = 'assets/data/kawasan-hutan-esdm/' + island.file + '.json?v=20261103-forest-local-json-v1';
    var lastError;
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        var response = await fetch(baseUrl + '&try=' + attempt, { cache: 'reload' });
        if (!response.ok) throw new Error('Layanan data mengembalikan HTTP ' + response.status + '.');
        var buffer = await response.arrayBuffer();
        var contentLength = Number(response.headers.get('content-length'));
        if (contentLength && contentLength !== buffer.byteLength) throw new Error('Unduhan file terpotong (' + buffer.byteLength + '/' + contentLength + ' byte).');
        var data = JSON.parse(new TextDecoder('utf-8').decode(buffer));
        if (!data || !Array.isArray(data.features) || !data.features.length) throw new Error('Data tidak berisi daftar poligon.');
        if (Number(data.featureCount) !== data.features.length) throw new Error('Jumlah poligon pada file tidak lengkap.');
        return data;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise(function (resolve) { setTimeout(resolve, 250 * (attempt + 1)); });
      }
    }
    console.warn('[GeoFarm Kawasan Hutan] File lokal tidak dapat dibaca:', island.name, lastError);
    throw new Error('Data ' + island.name + ' gagal dimuat setelah 3 percobaan: ' + (lastError && lastError.message || 'format data tidak valid.'));
  }

  function accumulateFeatures(features, island, categories, categoryCounts) {
    features.forEach(function (feature) {
      var attrs = feature.attributes || feature.properties || {};
      var geometry = feature.geometry || (feature.type ? feature : null);
      var category = categoryName(attrs);
      var province = parseInt(attrs.kode_prov || attrs.KODE_PROV, 10);
      if (!Number.isFinite(province) || island.codes.indexOf(province) < 0) return;
      var ha = geometryAreaHa(geometry);
      if (!Number.isFinite(ha) || ha <= 0) return;
      categories[category] = (categories[category] || 0) + ha;
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });
  }

  function updateIslandSteps() {
    islandSteps.innerHTML = ISLANDS.map(function (island, index) {
      var saved = islandCache[island.name];
      var count = saved && Number(saved.featureCount) ? Number(saved.featureCount).toLocaleString('id-ID') : '';
      var mapLoaded = !!forestMapLayers[island.name];
      return '<div class="gf-forest-island-step"><div class="gf-forest-island-meta"><strong>' + esc((index + 1) + '. ' + island.name) + '</strong>' +
        '<small id="gf-forest-island-status-' + index + '">' + (saved ? 'Data tersedia · ' + count + ' poligon' + (mapLoaded ? ' · peta aktif' : ' · peta belum dimuat') : 'Siap dihitung') + '</small></div>' +
        '<button class="gf-forest-island-button" type="button" data-island-index="' + index + '">' + (saved ? (mapLoaded ? 'Muat ulang peta' : 'Muat peta') : 'Hitung luas') + '</button></div>';
    }).join('');
    btn.disabled = !allIslandsReady() || busy;
    if (resetBtn) resetBtn.disabled = busy || !Object.keys(forestMapLayers).some(function (name) { return !!forestMapLayers[name]; });
  }

  async function loadLocalIslandStatistics(island, data) {
    var features = data.features;
    var categories = Object.create(null);
    var categoryCounts = Object.create(null);
    for (var offset = 0; offset < features.length; offset += CHUNK) {
      var page = features.slice(offset, offset + CHUNK);
      setLoading('2/3', 'Menghitung luas kawasan', offset / features.length * 100,
        island.name + ' · poligon ' + (offset + 1).toLocaleString('id-ID') + ' dari ' + features.length.toLocaleString('id-ID') + '.');
      accumulateFeatures(page, island, categories, categoryCounts);
      await new Promise(function (resolve) { requestAnimationFrame(resolve); });
    }
    setLoading('3/3', 'Menyimpan ringkasan', 100,
      'Perhitungan selesai untuk ' + features.length.toLocaleString('id-ID') + ' poligon.');
    var result = {
      categories: categories,
      categoryCounts: categoryCounts,
      featureCount: features.length,
      fetchedAt: data.downloadedAt || new Date().toISOString(),
      source: 'bundled'
    };
    islandCache[island.name] = result;
    if (!writeIslandCache()) {
      delete islandCache[island.name];
      throw new Error('Ringkasan ' + island.name + ' sudah dihitung, tetapi browser tidak dapat menyimpannya.');
    }
    return result;
  }

  async function loadIslandStatistics(island) {
    if (islandCache[island.name]) return islandCache[island.name];
    setLoading('1/3', 'Memuat data pulau', null, 'Menyiapkan poligon ' + island.name + '.');
    var localData = null;
    try { localData = await readLocalIslandData(island); }
    catch (localError) {
      console.warn('[GeoFarm Kawasan Hutan] Data lokal gagal dimuat; mencoba query layanan:', island.name, localError);
      setLoading('1/3', 'Mencoba sumber data lain', null, 'Data ' + island.name + ' akan dimuat bertahap dari layanan peta.');
    }
    if (localData) return loadLocalIslandStatistics(island, localData);
    var where = 'kode_prov IN (' + island.codes.join(',') + ') AND ' + FOREST_WHERE;
    var countUrl = LAYER + '/query?where=' + encodeURIComponent(where) + '&returnCountOnly=true&f=json';
    setLoading('1/3', 'Menghubungi layanan ESDM', null, 'Memeriksa jumlah poligon ' + island.name + '.');
    var countData = await fetchJson(countUrl);
    if (countData.error || !Number.isFinite(+countData.count)) throw new Error('Jumlah fitur ' + island.name + ' dari layanan ESDM tidak valid.');
    var totalCount = +countData.count;
    if (!totalCount) throw new Error('Layanan ESDM tidak mengembalikan poligon untuk ' + island.name + '.');

    var categories = Object.create(null);
    var categoryCounts = Object.create(null);
    var processed = 0;
    var offset = 0;
    while (offset < totalCount) {
      var pageSize = CHUNK;
      var page;
      var omitOrder = false;
      while (!page) {
        setLoading('2/3', 'Menghitung luas kawasan', processed / totalCount * 100,
          island.name + ' · poligon ' + (processed + 1).toLocaleString('id-ID') + ' dari ' + totalCount.toLocaleString('id-ID') + ' · halaman ' + pageSize + ' poligon.');
        try {
          page = await fetchJson(apiUrl(offset, pageSize, where, omitOrder));
        } catch (pageError) {
          if (pageSize <= 25 && omitOrder) throw new Error('Query ESDM gagal pada poligon ' + offset.toLocaleString('id-ID') + ': ' + pageError.message);
          if (pageSize <= 25) {
            omitOrder = true;
            setLoading('2/3', 'Mencoba format query alternatif', processed / totalCount * 100,
              'Server menolak urutan fitur; mencoba lagi tanpa parameter pengurutan.');
          } else {
            pageSize = Math.max(25, Math.floor(pageSize / 2));
            setLoading('2/3', 'Mencoba ulang dengan halaman lebih kecil', processed / totalCount * 100,
              'Ukuran halaman diturunkan ke ' + pageSize + ' poligon karena server gagal memproses permintaan sebelumnya.');
          }
        }
      }
      if (!Array.isArray(page.features)) throw new Error('Format geometri dari layanan ESDM tidak valid.');
      var features = page.features;
      if (!features.length && offset < totalCount) throw new Error('Data terhenti pada poligon ' + offset.toLocaleString('id-ID') + '. Silakan coba lagi.');
      features.forEach(function (feature) {
        var attrs = feature.attributes || feature.properties || {};
        var geometry = feature.geometry || (feature.type ? feature : null);
        var category = categoryName(attrs);
        var province = parseInt(attrs.kode_prov || attrs.KODE_PROV, 10);
        if (!Number.isFinite(province)) return;
        if (island.codes.indexOf(province) < 0) return;
        var ha = geometryAreaHa(geometry);
        if (!Number.isFinite(ha) || ha <= 0) return;
        categories[category] = (categories[category] || 0) + ha;
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      });
      processed += features.length;
      offset += features.length;
    }
    setLoading('3/3', 'Menyimpan ringkasan', 100, 'Perhitungan geodesik ' + island.name + ' selesai untuk ' + processed.toLocaleString('id-ID') + ' poligon.');
    var result = { categories: categories, categoryCounts: categoryCounts, featureCount: totalCount, fetchedAt: new Date().toISOString() };
    islandCache[island.name] = result;
    if (!writeIslandCache()) {
      delete islandCache[island.name];
      throw new Error('Ringkasan ' + island.name + ' sudah dihitung, tetapi browser tidak dapat menyimpannya.');
    }
    return result;
  }

  function buildReportFromLocal(islands) {
    var groups = Object.create(null);
    var categoryCounts = Object.create(null);
    var featureCount = 0;
    islands.forEach(function (island) {
      var saved = islandCache[island.name];
      featureCount += Number(saved.featureCount) || 0;
      FOREST_CLASSES.forEach(function (category) {
        groups[island.name + '|' + category] = Number(saved.categories[category]) || 0;
        categoryCounts[island.name + '|' + category] = Number(saved.categoryCounts && saved.categoryCounts[category]) || 0;
      });
    });
    return { groups: groups, categoryCounts: categoryCounts, featureCount: featureCount, fetchedAt: new Date() };
  }

  function render(report, islandFilter) {
    var visibleIslands = islandFilter || ISLANDS;
    var isNational = visibleIslands.length === ISLANDS.length;
    var islandTotals = visibleIslands.map(function (island) {
      var values = {};
      var counts = {};
      FOREST_CLASSES.forEach(function (category) {
        values[category] = report.groups[island.name + '|' + category] || 0;
        counts[category] = report.categoryCounts[island.name + '|' + category] || 0;
      });
      var total = FOREST_CLASSES.reduce(function (sum, category) { return sum + values[category]; }, 0);
      var featureCount = FOREST_CLASSES.reduce(function (sum, category) { return sum + counts[category]; }, 0);
      return { name: island.name, values: values, counts: counts, total: total, featureCount: featureCount };
    });
    var national = islandTotals.reduce(function (sum, row) { return sum + row.total; }, 0);
    var categoryTotals = FOREST_CLASSES.map(function (category) {
      return { name: category, total: islandTotals.reduce(function (sum, row) { return sum + row.values[category]; }, 0) };
    });
    var sorted = islandTotals.slice().sort(function (a, b) { return b.total - a.total; });
    var totalLabel = isNational ? 'Total luas kawasan hutan Indonesia' : 'Total luas kawasan hutan ' + visibleIslands[0].name;
    var html = '<div class="gf-forest-total"><span>' + esc(totalLabel) + '</span><strong>' + formatHa(national) + ' ha</strong><small>' + formatHa(national / 100) + ' km² · berdasarkan ' + report.featureCount.toLocaleString('id-ID') + ' poligon</small></div>';
    html += '<div style="height:270px;margin:16px 0 8px;position:relative"><canvas id="geofarm-forest-chart" aria-label="Grafik luas kawasan hutan per pulau" role="img"></canvas></div>';
    html += '<h4 class="gf-forest-heading">' + (isNational ? 'Report luas per pulau dan fungsi' : 'Report luas per fungsi · ' + esc(visibleIslands[0].name)) + '</h4><div class="gf-forest-table-wrap"><table class="gf-forest-table"><thead><tr><th>Pulau</th>';
    FOREST_CLASSES.forEach(function (category) { html += '<th>' + esc(category.replace('Hutan ', '')) + '</th>'; });
    html += '<th>Total (ha)</th><th>Porsi nasional</th></tr></thead><tbody>';
    islandTotals.forEach(function (row) {
      html += '<tr><th scope="row">' + esc(row.name) + '</th>';
      FOREST_CLASSES.forEach(function (category) { html += '<td>' + formatHa(row.values[category]) + '</td>'; });
      html += '<td><b>' + formatHa(row.total) + '</b></td><td>' + formatPct(national ? row.total / national * 100 : 0) + '</td></tr>';
    });
    html += '<tr class="gf-forest-grand"><th scope="row">' + (isNational ? 'Indonesia' : 'Total ' + esc(visibleIslands[0].name)) + '</th>';
    categoryTotals.forEach(function (row) { html += '<td>' + formatHa(row.total) + '</td>'; });
    html += '<td>' + formatHa(national) + '</td><td>100%</td></tr></tbody></table></div>';
    html += '<p class="gf-forest-note">Kawasan Konservasi Laut, Areal Penggunaan Lain, Tubuh Air, dan kelas tidak terdefinisi tidak dihitung sebagai luas hutan. Luas dihitung geodesik dari geometri. Ringkasan statistik disimpan di local storage browser. Sumber: Kawasan Hutan ESDM, layer ' + esc('Kawasan Hutan 20251018') + '.</p>';
    output.innerHTML = html;
    if (chart) chart.destroy();
    var canvas = document.getElementById('geofarm-forest-chart');
    if (canvas && window.Chart) {
      chart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: islandTotals.map(function (row) { return row.name; }),
          datasets: FOREST_CLASSES.map(function (category, index) {
            return { label: category, data: islandTotals.map(function (row) { return row.values[category] / 1000; }),
              backgroundColor: ['#047857','#15803d','#65a30d','#a3a13a','#c0843d'][index], borderWidth: 0 };
          })
        },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
            tooltip: { callbacks: { label: function (ctx) { return ctx.dataset.label + ': ' + formatHa(ctx.raw * 1000) + ' ha'; } } } },
          scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: 'Ribu hektare' }, ticks: { callback: function (v) { return formatHa(v); } } } }
        }
      });
    }
    status.innerHTML = '<span class="gf-forest-done">Selesai menghitung ' + formatHa(national) + ' ha. Pulau dengan luas terbesar: ' + esc(sorted[0] ? sorted[0].name : '—') + '.</span>';
  }

  function renderDetailed(report, islandFilter) {
    var visibleIslands = islandFilter || ISLANDS;
    var isNational = visibleIslands.length === ISLANDS.length;
    var rows = visibleIslands.map(function (island) {
      var values = {}, counts = {};
      FOREST_CLASSES.forEach(function (category) {
        values[category] = Number(report.groups[island.name + '|' + category]) || 0;
        counts[category] = Number(report.categoryCounts[island.name + '|' + category]) || 0;
      });
      var total = FOREST_CLASSES.reduce(function (sum, category) { return sum + values[category]; }, 0);
      var polygons = FOREST_CLASSES.reduce(function (sum, category) { return sum + counts[category]; }, 0);
      return { name: island.name, values: values, counts: counts, total: total, polygons: polygons };
    });
    var totalHa = rows.reduce(function (sum, row) { return sum + row.total; }, 0);
    var totalPolygons = rows.reduce(function (sum, row) { return sum + row.polygons; }, 0);
    var title = isNational ? 'Luas kawasan hutan Indonesia' : 'Luas kawasan hutan ' + rows[0].name;
    var html = '<div class="gf-forest-total"><span>' + esc(title) + '</span><strong>' + formatHa(totalHa) + ' ha</strong><small>' + formatHa(totalHa / 100) + ' km² · ' + totalPolygons.toLocaleString('id-ID') + ' poligon hutan</small></div>';
    html += '<div class="gf-forest-map-legend"><b>Legenda peta:</b>';
    FOREST_CLASSES.forEach(function (category) { html += '<span><i style="background:' + forestColor(category) + '"></i>' + esc(category) + '</span>'; });
    html += '<span><i style="background:#64748b"></i>Kelas lain (tidak dihitung)</span></div>';
    html += '<div style="height:290px;margin:16px 0 8px;position:relative"><canvas id="geofarm-forest-chart" aria-label="Grafik luas hutan per fungsi kawasan" role="img"></canvas></div>';
    html += '<h4 class="gf-forest-heading">Rincian fungsi kawasan</h4><div class="gf-forest-table-wrap"><table class="gf-forest-table gf-forest-detail-table"><thead><tr><th>Pulau</th><th>Fungsi kawasan</th><th>Luas (ha)</th><th>Luas (km²)</th><th>Porsi pulau</th><th>Poligon</th></tr></thead><tbody>';
    rows.forEach(function (row) {
      FOREST_CLASSES.forEach(function (category) {
        var area = row.values[category];
        html += '<tr><th scope="row">' + esc(row.name) + '</th><td><i class="gf-forest-class-dot" style="background:' + forestColor(category) + '"></i>' + esc(category) + '</td><td>' + formatHa(area) + '</td><td>' + formatHa(area / 100) + '</td><td>' + formatPct(row.total ? area / row.total * 100 : 0) + '</td><td>' + row.counts[category].toLocaleString('id-ID') + '</td></tr>';
      });
      html += '<tr class="gf-forest-grand"><th>' + esc(row.name) + '</th><td>Total pulau</td><td>' + formatHa(row.total) + '</td><td>' + formatHa(row.total / 100) + '</td><td>' + formatPct(totalHa ? row.total / totalHa * 100 : 0) + '</td><td>' + row.polygons.toLocaleString('id-ID') + '</td></tr>';
    });
    html += '<tr class="gf-forest-grand"><th>' + (isNational ? 'Indonesia' : esc(rows[0].name)) + '</th><td>Total ' + (isNational ? 'nasional' : 'pulau') + '</td><td>' + formatHa(totalHa) + '</td><td>' + formatHa(totalHa / 100) + '</td><td>100%</td><td>' + totalPolygons.toLocaleString('id-ID') + '</td></tr></tbody></table></div>';
    html += '<p class="gf-forest-note">Luas dihitung geodesik dari geometri yang digeneralisasi sekitar 55 m sesuai skala 1:250.000. Angka ini adalah luas kawasan berdasarkan fungsi/status, bukan luas tutupan hutan aktual; karena itu tidak sebanding langsung dengan FAO FRA 2025 yang melaporkan sekitar 95,97 juta ha tutupan hutan. Grafik menampilkan luas per fungsi; arahkan kursor untuk melihat luas, porsi pulau, dan jumlah poligon. Peta memakai gambar layanan yang difilter per pulau; klik peta untuk melihat informasi objek jika tersedia. Ringkasan statistik tersimpan di browser. Sumber: ESDM, Kawasan Hutan 2025.</p>';
    output.innerHTML = html;
    if (chart) chart.destroy();
    var canvas = document.getElementById('geofarm-forest-chart');
    if (canvas && window.Chart) {
      chart = new Chart(canvas, {
        type: 'bar',
        data: { labels: rows.map(function (row) { return row.name; }), datasets: FOREST_CLASSES.map(function (category) {
          return { label: category, data: rows.map(function (row) { return row.values[category] / 1000; }), backgroundColor: forestColor(category), borderWidth: 0 };
        }) },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
            tooltip: { callbacks: { label: function (ctx) {
              var row = rows[ctx.dataIndex], area = row.values[ctx.dataset.label] || 0;
              return [ctx.dataset.label + ': ' + formatHa(area) + ' ha (' + formatPct(row.total ? area / row.total * 100 : 0) + ')',
                'Poligon: ' + (row.counts[ctx.dataset.label] || 0).toLocaleString('id-ID')];
            } } } },
          scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: 'Ribu hektare' }, ticks: { callback: function (value) { return formatHa(value); } } } }
          }
      });
    }
    status.innerHTML = '<span class="gf-forest-done">Statistik ' + esc(isNational ? 'Indonesia' : rows[0].name) + ' siap. Total ' + formatHa(totalHa) + ' ha.</span>';
  }

  islandSteps.addEventListener('click', async function (event) {
    var button = event.target.closest('.gf-forest-island-button');
    if (!button || busy) return;
    var island = ISLANDS[Number(button.getAttribute('data-island-index'))];
    if (!island) return;
    busy = true;
    updateIslandSteps();
    islandSteps.querySelectorAll('button').forEach(function (item) { item.disabled = true; });
    var map = window.map || window._map;
    try {
      var saved = await loadIslandStatistics(island);
      var imageShown = false;
      if (map && window.L && L.esri && L.esri.dynamicMapLayer) {
        Object.keys(forestMapLayers).forEach(function (name) {
          var activeLayer = forestMapLayers[name];
          if (activeLayer && map.hasLayer(activeLayer)) map.removeLayer(activeLayer);
          delete forestMapLayers[name];
        });
        var imageLayer = createIslandImageLayer(island);
        imageLayer.addTo(map);
        forestMapLayers[island.name] = imageLayer;
        imageShown = true;
      }
      var index = ISLANDS.indexOf(island);
      var rowStatus = document.getElementById('gf-forest-island-status-' + index);
      if (rowStatus) rowStatus.textContent = 'Data tersedia · ' + Number(saved.featureCount).toLocaleString('id-ID') + ' poligon';
      output.innerHTML = '';
      renderDetailed(buildReportFromLocal([island]), [island]);
      if (imageShown && island.bounds) {
        var islandBounds = L.latLngBounds(island.bounds).pad(0.04);
        if (window.SheetDrag && typeof window.SheetDrag.flyToBoundsInVisibleMap === 'function') {
          window.SheetDrag.flyToBoundsInVisibleMap(islandBounds, { maxZoom: 7, duration: 0.8 });
        } else {
          map.fitBounds(islandBounds, { maxZoom: 7, animate: true });
        }
      }
      status.innerHTML += imageShown
        ? '<br><span class="gf-forest-done">Peta kawasan hutan ' + esc(island.name) + ' ditampilkan sebagai gambar layanan yang difilter per pulau; ringkasan tersimpan di browser.</span>'
        : '<br><span class="gf-forest-error">Perhitungan ' + esc(island.name) + ' berhasil, tetapi layer peta tidak tersedia.</span>';
    } catch (error) {
      console.error('[GeoFarm Kawasan Hutan]', error);
      status.innerHTML = '<span class="gf-forest-error">Pemrosesan data ' + esc(island.name) + ' gagal: ' + esc(error.message || 'data tidak dapat dimuat.') + '</span>';
    } finally {
      busy = false;
      updateIslandSteps();
    }
  });

  btn.addEventListener('click', function () {
    if (busy || !allIslandsReady()) return;
    output.innerHTML = '';
    renderDetailed(buildReportFromLocal(ISLANDS));
    if (window.map && window.L && L.latLngBounds) {
      var bounds = L.latLngBounds([]);
      ISLANDS.forEach(function (island) {
        var layer = forestMapLayers[island.name];
        if (layer && island.bounds) bounds.extend(L.latLngBounds(island.bounds));
      });
      if (bounds.isValid()) {
        var nationalBounds = bounds.pad(0.04);
        if (window.SheetDrag && typeof window.SheetDrag.flyToBoundsInVisibleMap === 'function') {
          window.SheetDrag.flyToBoundsInVisibleMap(nationalBounds, { maxZoom: 5, duration: 0.8 });
        } else {
          window.map.fitBounds(nationalBounds, { maxZoom: 5, animate: true });
        }
      }
    }
  });

  if (resetBtn) resetBtn.addEventListener('click', function () {
    if (busy) return;
    var map = window.map || window._map;
    Object.keys(forestMapLayers).forEach(function (name) {
      var layer = forestMapLayers[name];
      if (layer && map && map.hasLayer(layer)) map.removeLayer(layer);
      delete forestMapLayers[name];
    });
    status.textContent = 'Semua layer peta kawasan hutan dihapus. Ringkasan statistik tetap tersedia.';
    updateIslandSteps();
  });

  var style = document.createElement('style');
  style.textContent = '.geotani-sls-status#geofarm-forest-status{margin-bottom:12px}.gf-forest-total{display:flex;flex-direction:column;gap:4px;padding:14px 16px;border-radius:12px;background:#ecfdf5;border:1px solid #a7f3d0;color:#064e3b}.gf-forest-total span{font-size:12px;font-weight:600}.gf-forest-total strong{font-size:24px;line-height:1.2}.gf-forest-total small,.gf-forest-note{font-size:11px;color:#64748b}.gf-forest-heading{margin:18px 0 8px;font-size:13px}.gf-forest-table-wrap{overflow-x:auto;border:1px solid #e2e8f0;border-radius:9px}.gf-forest-table{border-collapse:collapse;width:100%;min-width:850px;font-size:11px}.gf-forest-table th,.gf-forest-table td{padding:8px;text-align:right;border-bottom:1px solid #e2e8f0;white-space:nowrap}.gf-forest-table thead th{background:#f8fafc;color:#475569;font-weight:600}.gf-forest-table th:first-child{text-align:left}.gf-forest-table tbody th{font-weight:600}.gf-forest-table .gf-forest-grand{background:#f0fdf4;font-weight:700}.gf-forest-note{line-height:1.5;margin:10px 0 0}.gf-forest-loading{display:flex;align-items:flex-start;gap:10px;padding:10px 2px}.gf-forest-spinner{width:17px;height:17px;flex:0 0 17px;border:2px solid #bbf7d0;border-top-color:#15803d;border-radius:50%;animation:gfForestSpin .75s linear infinite;margin-top:2px}.gf-forest-loading-copy{min-width:0;flex:1}.gf-forest-loading-copy strong{display:block;font-size:12px;color:#334155}.gf-forest-loading-copy small{display:block;margin-top:3px;font-size:11px;color:#64748b}.gf-forest-progress{height:4px;margin-top:8px;background:#e2e8f0;border-radius:9px;overflow:hidden}.gf-forest-progress i{display:block;height:100%;background:#16a34a;border-radius:9px;transition:width .2s ease}.gf-forest-progress-indeterminate i{width:35%;animation:gfForestProgress 1.2s ease-in-out infinite}.gf-forest-error{color:#b91c1c;font-size:12px}.gf-forest-done{color:#166534;font-size:12px}@keyframes gfForestSpin{to{transform:rotate(360deg)}}@keyframes gfForestProgress{0%{transform:translateX(-110%)}100%{transform:translateX(310%)}}';
  document.head.appendChild(style);
  var stepStyle = document.createElement('style');
  stepStyle.textContent = '.gf-forest-island-steps{display:grid;gap:7px;margin:12px 0}.gf-forest-island-step{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;border:1px solid #e2e8f0;border-radius:9px;background:#fff}.gf-forest-island-meta{display:flex;flex-direction:column;gap:3px;min-width:0}.gf-forest-island-meta strong{font-size:12px;color:#334155}.gf-forest-island-meta small{font-size:10px;color:#64748b}.gf-forest-island-button{flex:0 0 auto;padding:6px 9px;border:1px solid #bbf7d0;border-radius:7px;background:#f0fdf4;color:#166534;font-size:10px;font-weight:600;cursor:pointer}.gf-forest-island-button:disabled,#geofarm-forest-run:disabled{opacity:.55;cursor:wait}.gf-forest-map-legend{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:12px 0;font-size:10px;color:#475569}.gf-forest-map-legend span{display:flex;align-items:center;gap:4px}.gf-forest-map-legend i,.gf-forest-class-dot{display:inline-block;width:9px;height:9px;border-radius:50%;flex:0 0 auto}.gf-forest-class-dot{margin-right:6px}.gf-forest-detail-table{min-width:700px}.gf-forest-popup{font:12px/1.45 system-ui,sans-serif}.gf-forest-popup dl{display:grid;grid-template-columns:100px 1fr;gap:3px 7px;margin:8px 0 0}.gf-forest-popup dt{font-weight:600;color:#64748b}.gf-forest-popup dd{margin:0;overflow-wrap:anywhere}';
  document.head.appendChild(stepStyle);
  updateIslandSteps();
})();
