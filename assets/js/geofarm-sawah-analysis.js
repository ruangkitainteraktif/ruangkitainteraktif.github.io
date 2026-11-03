/* GeoFarm: statistik luas LBS 2023 per provinsi dari layanan Kementan. */
(function () {
  'use strict';

  var SERVICE = 'https://sig02.pertanian.go.id/server/rest/services/Sawah/Sawah2023/MapServer';
  var LAYER = SERVICE + '/0';
  var PROXY = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';
  var PROVINCE_GEOJSON_URL = 'assets/data/bps/geojson/provinsi.geojson';
  var LBS_WMS_URL = 'https://geoserver.bps.go.id/ksa/wms';
  var CACHE_KEY = 'geofarm-sawah-statistics-2023-province-v2-refresh';
  var PAGE_SIZE = 150;
  var PROVINCES = [
    ['11','Aceh'],['12','Sumatera Utara'],['13','Sumatera Barat'],['14','Riau'],['15','Jambi'],['16','Sumatera Selatan'],['17','Bengkulu'],['18','Lampung'],['19','Kepulauan Bangka Belitung'],['21','Kepulauan Riau'],
    ['31','DKI Jakarta'],['32','Jawa Barat'],['33','Jawa Tengah'],['34','DI Yogyakarta'],['35','Jawa Timur'],['36','Banten'],
    ['51','Bali'],['52','Nusa Tenggara Barat'],['53','Nusa Tenggara Timur'],
    ['61','Kalimantan Barat'],['62','Kalimantan Tengah'],['63','Kalimantan Selatan'],['64','Kalimantan Timur'],['65','Kalimantan Utara'],
    ['71','Sulawesi Utara'],['72','Sulawesi Tengah'],['73','Sulawesi Selatan'],['74','Sulawesi Tenggara'],['75','Gorontalo'],['76','Sulawesi Barat'],
    ['81','Maluku'],['82','Maluku Utara'],
    ['91','Papua Barat'],['92','Papua Barat Daya'],['94','Papua'],['95','Papua Selatan'],['96','Papua Tengah'],['97','Papua Pegunungan']
  ].map(function (entry) { return { code: entry[0], name: entry[1] }; });
  var btn = document.getElementById('geofarm-sawah-run');
  var resetBtn = document.getElementById('geofarm-sawah-reset');
  var status = document.getElementById('geofarm-sawah-status');
  var output = document.getElementById('geofarm-sawah-output');
  var steps = document.getElementById('geofarm-sawah-island-steps');
  if (!btn || !status || !output || !steps) return;

  var cache = readCache();
  var provinceBoundaryLayer = null;
  var sawahWmsLayer = null;
  var activeProvinceName = '';
  var provinceGeoJsonPromise = null;
  var chart = null;
  var districtChart = null;
  var busy = false;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function fmt(value) { return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value || 0); }
  function pct(value) { return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(value || 0) + '%'; }
  function readCache() {
    try { var value = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); return value && typeof value === 'object' ? value : {}; }
    catch (_) { return {}; }
  }
  function saveCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); return true; }
    catch (error) { console.warn('[GeoFarm Sawah] Ringkasan tidak dapat disimpan:', error); return false; }
  }
  function loadProvinceGeoJson() {
    if (!provinceGeoJsonPromise) provinceGeoJsonPromise = fetch(PROVINCE_GEOJSON_URL).then(function (response) {
      if (!response.ok) throw new Error('Data batas provinsi tidak dapat dimuat.');
      return response.json();
    }).then(function (geojson) {
      if (!geojson || !Array.isArray(geojson.features)) throw new Error('Format batas provinsi tidak valid.');
      return geojson;
    }).catch(function (error) { provinceGeoJsonPromise = null; throw error; });
    return provinceGeoJsonPromise;
  }
  async function showProvinceBoundary(province, map) {
    var geojson = await loadProvinceGeoJson();
    var feature = geojson.features.find(function (item) {
      return String(item.properties && item.properties.kdprov) === province.code;
    });
    if (!feature) throw new Error('Batas wilayah ' + province.name + ' tidak tersedia.');
    if (sawahWmsLayer && map.hasLayer(sawahWmsLayer)) map.removeLayer(sawahWmsLayer);
    if (provinceBoundaryLayer && map.hasLayer(provinceBoundaryLayer)) map.removeLayer(provinceBoundaryLayer);
    var wmsProvinceName = String(feature.properties && feature.properties.nmprov || province.name).trim().replace(/'/g, "''");
    sawahWmsLayer = L.tileLayer.wms(LBS_WMS_URL, {
      layers: 'ksa:lbs_2024', format: 'image/png', transparent: true, version: '1.1.1', tiled: true,
      opacity: 0.72, CQL_FILTER: "WADMPR = '" + wmsProvinceName + "'",
      attribution: 'LBS 2024 · BPS'
    }).addTo(map);
    provinceBoundaryLayer = L.geoJSON(feature, {
      style: { color: '#047857', weight: 3, opacity: 0.95, fillColor: '#34d399', fillOpacity: 0.12 },
      onEachFeature: function (_, layer) {
        layer.bindPopup('<strong>Batas Provinsi ' + esc(province.name) + '</strong><br>Ringkasan luas sawah tersedia di panel.');
      }
    }).addTo(map);
    activeProvinceName = province.name;
    return provinceBoundaryLayer;
  }
  function loading(step, title, progress, detail) {
    var p = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : null;
    status.innerHTML = '<div class="gf-forest-loading"><span class="gf-forest-spinner" aria-hidden="true"></span><div class="gf-forest-loading-copy"><strong>' +
      esc(step + ' · ' + title) + '</strong>' + (detail ? '<small>' + esc(detail) + '</small>' : '') +
      (p === null ? '<div class="gf-forest-progress gf-forest-progress-indeterminate"><i></i></div>' :
        '<div class="gf-forest-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '"><i style="width:' + p + '%"></i></div>') +
      '</div></div>';
  }
  function updateSteps() {
    steps.innerHTML = PROVINCES.map(function (province, i) {
      var saved = cache[province.name];
      var loaded = activeProvinceName === province.name;
      var count = saved ? Number(saved.featureCount || 0).toLocaleString('id-ID') : '';
      return '<div class="gf-forest-island-step"><div class="gf-forest-island-meta"><strong>' + esc((i + 1) + '. ' + province.name) +
        '</strong><small id="gf-sawah-step-status-' + i + '">' + (saved ? (Number(saved.featureCount) === 0 ? 'Tidak ada poligon sawah · 0 ha' : 'Data tersedia · ' + count + ' poligon') + (saved.districts ? ' · rincian kabupaten siap' : '') + (loaded ? ' · peta aktif' : '') : 'Menunggu hitung nasional') +
        '</small></div><button class="gf-forest-island-button" type="button" data-island-index="' + i + '"' + (busy ? ' disabled' : '') + '>' +
        (saved ? 'Tampilkan batas' : 'Hitung provinsi') + '</button></div>';
    }).join('');
    btn.disabled = busy;
    if (resetBtn) resetBtn.disabled = busy || (!provinceBoundaryLayer && !sawahWmsLayer);
  }
  function getValue(attrs, field) {
    if (!attrs) return '';
    if (attrs[field] !== undefined) return attrs[field];
    var key = Object.keys(attrs).find(function (name) { return name.toLowerCase() === field.toLowerCase(); });
    return key ? attrs[key] : '';
  }
  function landType(attrs) { return String(getValue(attrs, 'Jenis_Lahan_Sawah') || getValue(attrs, 'Qname_2023') || 'Tidak diketahui').trim() || 'Tidak diketahui'; }
  function colorFor(label, index) {
    var colors = ['#15803d','#65a30d','#0f766e','#84cc16','#22c55e','#a3a13a','#047857','#4d7c0f'];
    var hash = 0; for (var i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) | 0;
    return colors[Math.abs(hash + index) % colors.length];
  }
  function requestUrl(params) {
    return LAYER + '/query?' + Object.keys(params).map(function (key) { return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]); }).join('&');
  }
  async function fetchJson(url) {
    var last;
    for (var attempt = 0; attempt < 2; attempt++) {
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, 90000);
      try {
        var response = await fetch(attempt ? PROXY + encodeURIComponent(url) : url, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Layanan data mengembalikan HTTP ' + response.status + '.');
        var data = await response.json();
        if (data.error) throw new Error(data.error.message || 'Layanan data menolak permintaan.');
        return data;
      } catch (error) { last = error && error.name === 'AbortError' ? new Error('Permintaan data melewati batas waktu.') : error; }
      finally { clearTimeout(timer); }
    }
    throw last || new Error('Layanan data tidak dapat dihubungi.');
  }
  async function processProvince(province) {
    loading('1/3', 'Memuat data provinsi', null, 'Menyiapkan poligon sawah ' + province.name + '.');
    var where = "WIADPR = '" + province.code + "'";
    var count = await fetchJson(requestUrl({ where: where, returnCountOnly: 'true', f: 'json' }));
    var total = Number(count.count);
    if (!Number.isFinite(total) || total < 0) throw new Error('Jumlah data sawah tidak valid untuk ' + province.name + '.');
    if (total === 0) {
      loading('3/3', 'Tidak ada poligon sawah', 100, province.name + ' dicatat dengan luas 0 ha; proses berlanjut ke provinsi berikutnya.');
      cache[province.name] = { groups: Object.create(null), counts: Object.create(null), districts: Object.create(null), featureCount: 0, fetchedAt: new Date().toISOString() };
      if (!saveCache()) { delete cache[province.name]; throw new Error('Hasil 0 ha tidak dapat disimpan untuk ' + province.name + '.'); }
      return cache[province.name];
    }
    var groups = Object.create(null), counts = Object.create(null), districts = Object.create(null), processed = 0, offset = 0;
    while (offset < total) {
      var size = PAGE_SIZE, page;
      while (!page) {
        loading('2/3', 'Menghitung statistik sawah', processed / total * 100,
          province.name + ' · poligon ' + (processed + 1).toLocaleString('id-ID') + ' dari ' + total.toLocaleString('id-ID') + ' · halaman ' + size + '.');
        var params = { where: where, outFields: 'OBJECTID,WADMPR,WIADPR,WADMKK,WIADKK,Qname_2023,Jenis_Lahan_Sawah,Cetak_Sawah,Luas_Ha',
          returnGeometry: 'false', orderByFields: 'OBJECTID', resultOffset: offset, resultRecordCount: size, f: 'json' };
        try { page = await fetchJson(requestUrl(params)); }
        catch (error) {
          if (size <= 25) throw new Error('Gagal memuat poligon ke-' + offset.toLocaleString('id-ID') + ': ' + error.message);
          size = Math.max(25, Math.floor(size / 2));
        }
      }
      if (!Array.isArray(page.features)) throw new Error('Format poligon dari layanan tidak valid.');
      if (!page.features.length) throw new Error('Data terhenti pada poligon ke-' + offset.toLocaleString('id-ID') + '.');
      page.features.forEach(function (feature) {
        var attrs = feature.attributes || {};
        var provinceCode = String(getValue(attrs, 'WIADPR')).substring(0, 2);
        if (provinceCode !== province.code) return;
        var ha = Number(getValue(attrs, 'Luas_Ha')) || 0;
        if (!Number.isFinite(ha) || ha <= 0) return;
        var type = landType(attrs);
        groups[type] = (groups[type] || 0) + ha;
        counts[type] = (counts[type] || 0) + 1;
        var districtCode = String(getValue(attrs, 'WIADKK') || '').trim();
        var districtName = String(getValue(attrs, 'WADMKK') || '').trim() || (districtCode ? 'Kabupaten/Kota ' + districtCode : 'Tidak diketahui');
        var districtKey = province.code + '|' + (districtCode || districtName);
        if (!districts[districtKey]) districts[districtKey] = { code: districtCode, name: districtName, groups: Object.create(null), counts: Object.create(null), featureCount: 0 };
        districts[districtKey].groups[type] = (districts[districtKey].groups[type] || 0) + ha;
        districts[districtKey].counts[type] = (districts[districtKey].counts[type] || 0) + 1;
        districts[districtKey].featureCount++;
      });
      processed += page.features.length;
      offset += page.features.length;
      await new Promise(function (resolve) { requestAnimationFrame(resolve); });
    }
    if (!Object.keys(groups).length) throw new Error('Kode provinsi pada data tidak cocok dengan ' + province.name + '.');
    loading('3/3', 'Menyimpan ringkasan', 100, 'Perhitungan selesai untuk ' + processed.toLocaleString('id-ID') + ' poligon.');
    cache[province.name] = { groups: groups, counts: counts, districts: districts, featureCount: processed, fetchedAt: new Date().toISOString() };
    if (!saveCache()) { delete cache[province.name]; throw new Error('Ringkasan berhasil dihitung, tetapi tidak dapat disimpan.'); }
    return cache[province.name];
  }
  async function processDistricts(province) {
    loading('1/2', 'Merinci luas per kabupaten/kota', null, 'Memuat atribut sawah ' + province.name + '.');
    var where = "WIADPR = '" + province.code + "'";
    var count = await fetchJson(requestUrl({ where: where, returnCountOnly: 'true', f: 'json' }));
    var total = Number(count.count);
    if (!Number.isFinite(total) || total < 0) throw new Error('Jumlah data sawah tidak valid untuk ' + province.name + '.');
    if (total === 0) {
      var previousSummary = { groups: cache[province.name].groups, counts: cache[province.name].counts,
        districts: cache[province.name].districts, featureCount: cache[province.name].featureCount };
      cache[province.name].groups = Object.create(null);
      cache[province.name].counts = Object.create(null);
      cache[province.name].districts = Object.create(null);
      cache[province.name].featureCount = 0;
      if (!saveCache()) {
        cache[province.name].groups = previousSummary.groups;
        cache[province.name].counts = previousSummary.counts;
        cache[province.name].districts = previousSummary.districts;
        cache[province.name].featureCount = previousSummary.featureCount;
        throw new Error('Rincian 0 poligon tidak dapat disimpan untuk ' + province.name + '.');
      }
      loading('2/2', 'Tidak ada rincian poligon', 100, province.name + ' dicatat dengan 0 kabupaten berpoligon sawah.');
      return cache[province.name].districts;
    }
    var districts = Object.create(null), processed = 0, offset = 0;
    while (offset < total) {
      var size = PAGE_SIZE, page;
      while (!page) {
        loading('1/2', 'Merinci luas per kabupaten/kota', processed / total * 100,
          province.name + ' · poligon ' + (processed + 1).toLocaleString('id-ID') + ' dari ' + total.toLocaleString('id-ID') + '.');
        try {
          page = await fetchJson(requestUrl({ where: where, outFields: 'OBJECTID,WIADPR,WADMKK,WIADKK,Qname_2023,Jenis_Lahan_Sawah,Luas_Ha',
            returnGeometry: 'false', orderByFields: 'OBJECTID', resultOffset: offset, resultRecordCount: size, f: 'json' }));
        } catch (error) {
          if (size <= 25) throw new Error('Gagal memuat rincian pada poligon ke-' + offset.toLocaleString('id-ID') + ': ' + error.message);
          size = Math.max(25, Math.floor(size / 2));
        }
      }
      if (!Array.isArray(page.features) || !page.features.length) throw new Error('Data kabupaten terhenti pada poligon ke-' + offset.toLocaleString('id-ID') + '.');
      page.features.forEach(function (feature) {
        var attrs = feature.attributes || {};
        if (String(getValue(attrs, 'WIADPR')).substring(0, 2) !== province.code) return;
        var ha = Number(getValue(attrs, 'Luas_Ha')) || 0;
        if (!Number.isFinite(ha) || ha <= 0) return;
        var code = String(getValue(attrs, 'WIADKK') || '').trim();
        var name = String(getValue(attrs, 'WADMKK') || '').trim() || (code ? 'Kabupaten/Kota ' + code : 'Tidak diketahui');
        var key = province.code + '|' + (code || name);
        var type = landType(attrs);
        if (!districts[key]) districts[key] = { code: code, name: name, groups: Object.create(null), counts: Object.create(null), featureCount: 0 };
        districts[key].groups[type] = (districts[key].groups[type] || 0) + ha;
        districts[key].counts[type] = (districts[key].counts[type] || 0) + 1;
        districts[key].featureCount++;
      });
      processed += page.features.length;
      offset += page.features.length;
      await new Promise(function (resolve) { requestAnimationFrame(resolve); });
    }
    if (!Object.keys(districts).length) throw new Error('Atribut kabupaten/kota tidak ditemukan pada data ' + province.name + '.');
    var previous = cache[province.name].districts;
    cache[province.name].districts = districts;
    if (!saveCache()) { cache[province.name].districts = previous; throw new Error('Rincian kabupaten berhasil dihitung, tetapi tidak dapat disimpan.'); }
    loading('2/2', 'Rincian tersimpan', 100, Object.keys(districts).length.toLocaleString('id-ID') + ' kabupaten/kota.');
    return districts;
  }
  function collect(provinces) {
    var groups = Object.create(null), counts = Object.create(null), features = 0, types = Object.create(null);
    provinces.forEach(function (province) {
      var saved = cache[province.name]; features += Number(saved.featureCount) || 0;
      Object.keys(saved.groups || {}).forEach(function (type) {
        types[type] = true; groups[province.name + '|' + type] = Number(saved.groups[type]) || 0;
        counts[province.name + '|' + type] = Number(saved.counts[type]) || 0;
      });
    });
    return { groups: groups, counts: counts, featureCount: features, types: Object.keys(types).sort() };
  }
  function render(report, selected) {
    var provinces = selected || PROVINCES;
    var types = report.types;
    var rows = provinces.map(function (province) {
      var values = {}, counts = {};
      types.forEach(function (type) { values[type] = report.groups[province.name + '|' + type] || 0; counts[type] = report.counts[province.name + '|' + type] || 0; });
      var total = types.reduce(function (sum, type) { return sum + values[type]; }, 0);
      return { name: province.name, values: values, counts: counts, total: total, featureCount: Number(cache[province.name].featureCount) || 0 };
    });
    var national = rows.reduce(function (sum, row) { return sum + row.total; }, 0);
    var isNational = provinces.length === PROVINCES.length;
    var sorted = rows.slice().sort(function (a, b) { return b.total - a.total; });
    var html = '<div class="gf-forest-total"><span>Total luas sawah ' + (isNational ? 'Indonesia' : esc(provinces[0].name)) + '</span><strong>' + fmt(national) + ' ha</strong><small>' + fmt(national / 100) + ' km² · ' + report.featureCount.toLocaleString('id-ID') + ' poligon</small></div>';
    html += '<div class="gf-sawah-legend"><b>Jenis lahan sawah:</b>' + types.map(function (type, i) { return '<span><i style="background:' + colorFor(type, i) + '"></i>' + esc(type) + '</span>'; }).join('') + '</div>';
    html += '<div style="height:270px;margin:16px 0 8px;position:relative"><canvas id="geofarm-sawah-chart" aria-label="Grafik luas sawah per provinsi" role="img"></canvas></div>';
    html += '<h4 class="gf-forest-heading">Rincian luas sawah per provinsi dan jenis</h4><div class="gf-forest-table-wrap"><table class="gf-forest-table gf-sawah-table"><thead><tr><th>Provinsi</th>';
    types.forEach(function (type) { html += '<th>' + esc(type) + ' (ha)</th>'; });
    html += '<th>Total (ha)</th><th>Porsi nasional</th><th>Poligon</th></tr></thead><tbody>';
    rows.forEach(function (row) {
      var n = types.reduce(function (sum, type) { return sum + row.counts[type]; }, 0);
      html += '<tr><th scope="row">' + esc(row.name) + '</th>';
      types.forEach(function (type) { html += '<td>' + fmt(row.values[type]) + '</td>'; });
      html += '<td><b>' + fmt(row.total) + '</b></td><td>' + pct(national ? row.total / national * 100 : 0) + '</td><td>' + n.toLocaleString('id-ID') + '</td></tr>';
    });
    html += '<tr class="gf-forest-grand"><th>' + (isNational ? 'Indonesia' : 'Total provinsi') + '</th>';
    types.forEach(function (type) { html += '<td>' + fmt(rows.reduce(function (sum, row) { return sum + row.values[type]; }, 0)) + '</td>'; });
    html += '<td>' + fmt(national) + '</td><td>100%</td><td>' + report.featureCount.toLocaleString('id-ID') + '</td></tr></tbody></table></div>';
    html += '<p class="gf-forest-note">Statistik memakai data LBS 2023 Kementan: luas dijumlahkan dari atribut Luas_Ha dan jumlah poligon dihitung dari fitur yang diterima. Ringkasan tersimpan di penyimpanan lokal browser. Peta menampilkan batas provinsi dengan overlay LBS 2024 BPS untuk visualisasi; overlay disaring per provinsi, sehingga tahunnya berbeda dari data statistik.</p>';
    if (isNational) {
      var papuaReference = { 'Papua Barat Daya': 472, 'Papua Selatan': 43037, 'Papua Tengah': 2370, 'Papua Pegunungan': 949 };
      var missingPapua = Object.keys(papuaReference).filter(function (name) {
        return rows.some(function (row) { return row.name === name && row.featureCount === 0; });
      });
      var missingPapuaHa = missingPapua.reduce(function (sum, name) { return sum + papuaReference[name]; }, 0);
      var officialTotal = 7356441;
      var gap = Math.max(0, officialTotal - national);
      var note = 'Catatan cakupan: total aplikasi dijumlahkan dari atribut luas pada poligon yang berhasil diterima; angka ini bukan angka resmi yang dipaksakan. Laporan Tahunan Kementan 2023 mencatat total LBS 7.356.441 ha sebagai pembanding. Metode dan cakupan layer layanan dapat berbeda.';
      if (missingPapua.length) {
        note += ' Data sumber saat ini tidak mengembalikan poligon untuk ' + missingPapua.join(', ') + '. Tabel Kementan mencatat luas gabungan ' + fmt(missingPapuaHa) + ' ha (Papua Barat Daya 472 ha, Papua Selatan 43.037 ha, Papua Tengah 2.370 ha, Papua Pegunungan 949 ha). Nilai 0 di aplikasi berarti poligon tidak tersedia dari query, bukan bukti bahwa sawah tidak ada.';
      }
      if (gap > 0) note += ' Selisih terhadap angka pembanding Kementan sekitar ' + fmt(gap) + ' ha; hasil nasional perlu dianggap belum lengkap.';
      html += '<p class="gf-forest-note gf-sawah-coverage-note">' + esc(note) + '</p>';
    }
    output.innerHTML = html;
    if (chart) chart.destroy();
    if (districtChart) { districtChart.destroy(); districtChart = null; }
    var canvas = document.getElementById('geofarm-sawah-chart');
    if (canvas && window.Chart) chart = new Chart(canvas, {
      type: 'bar', data: { labels: rows.map(function (row) { return row.name; }), datasets: types.map(function (type, i) {
        return { label: type, data: rows.map(function (row) { return row.values[type] / 1000; }), backgroundColor: colorFor(type, i), borderWidth: 0 };
      }) }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: { callbacks: { label: function (ctx) {
          var row = rows[ctx.dataIndex], value = row.values[ctx.dataset.label] || 0;
          return ctx.dataset.label + ': ' + fmt(value) + ' ha (' + pct(row.total ? value / row.total * 100 : 0) + ')';
        } } } }, scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: 'Ribu hektare' }, ticks: { callback: function (v) { return fmt(v); } } } }
      }
    });
    var emptyProvinces = rows.filter(function (row) { return row.featureCount === 0; }).map(function (row) { return row.name; });
    status.innerHTML = '<span class="gf-forest-done">' + (isNational ? 'Statistik nasional' : 'Statistik ' + esc(provinces[0].name)) + ' siap. Total ' + fmt(national) + ' ha. Provinsi dengan luas terbesar: ' + esc(sorted[0] ? sorted[0].name : '—') + '.</span>' +
      (emptyProvinces.length ? '<br><span class="gf-forest-note">Tidak ada poligon sawah pada data sumber untuk: ' + esc(emptyProvinces.join(', ')) + '.</span>' : '');
  }

  function renderDistrictDetails(province) {
    var saved = cache[province.name];
    var districts = Object.keys(saved && saved.districts || {}).map(function (key) {
      var district = saved.districts[key];
      var values = {}, counts = {};
      Object.keys(district.groups || {}).forEach(function (type) { values[type] = Number(district.groups[type]) || 0; });
      Object.keys(district.counts || {}).forEach(function (type) { counts[type] = Number(district.counts[type]) || 0; });
      return { code: district.code || '', name: district.name || 'Tidak diketahui', values: values, counts: counts,
        total: Object.keys(values).reduce(function (sum, type) { return sum + values[type]; }, 0), featureCount: Number(district.featureCount) || 0 };
    }).sort(function (a, b) { return b.total - a.total; });
    if (!districts.length) return;
    var types = Object.keys(saved.groups || {}).sort();
    var provinceTotal = types.reduce(function (sum, type) { return sum + (Number(saved.groups[type]) || 0); }, 0);
    var html = '<section class="gf-sawah-district-report"><h4 class="gf-forest-heading">Rincian luas sawah per kabupaten/kota · ' + esc(province.name) + '</h4>';
    html += '<p class="gf-forest-note">Ditampilkan ' + districts.length.toLocaleString('id-ID') + ' kabupaten/kota, diurutkan berdasarkan total luas sawah.</p>';
    html += '<div style="height:250px;margin:12px 0 8px;position:relative"><canvas id="geofarm-sawah-district-chart" aria-label="Grafik luas sawah per kabupaten/kota di ' + esc(province.name) + '" role="img"></canvas></div>';
    html += '<div class="gf-forest-table-wrap"><table class="gf-forest-table gf-sawah-table"><thead><tr><th>Kabupaten/Kota</th>';
    types.forEach(function (type) { html += '<th>' + esc(type) + ' (ha)</th>'; });
    html += '<th>Total (ha)</th><th>Porsi provinsi</th><th>Poligon</th></tr></thead><tbody>';
    districts.forEach(function (district) {
      html += '<tr><th scope="row">' + esc(district.name) + '</th>';
      types.forEach(function (type) { html += '<td>' + fmt(district.values[type] || 0) + '</td>'; });
      html += '<td><b>' + fmt(district.total) + '</b></td><td>' + pct(provinceTotal ? district.total / provinceTotal * 100 : 0) + '</td><td>' + district.featureCount.toLocaleString('id-ID') + '</td></tr>';
    });
    html += '<tr class="gf-forest-grand"><th>Total ' + esc(province.name) + '</th>';
    types.forEach(function (type) { html += '<td>' + fmt(districts.reduce(function (sum, district) { return sum + (district.values[type] || 0); }, 0)) + '</td>'; });
    html += '<td>' + fmt(districts.reduce(function (sum, district) { return sum + district.total; }, 0)) + '</td><td>100%</td><td>' + districts.reduce(function (sum, district) { return sum + district.featureCount; }, 0).toLocaleString('id-ID') + '</td></tr></tbody></table></div></section>';
    output.insertAdjacentHTML('beforeend', html);
    var canvas = document.getElementById('geofarm-sawah-district-chart');
    if (canvas && window.Chart) {
      var top = districts.slice(0, 20);
      districtChart = new Chart(canvas, { type: 'bar', data: { labels: top.map(function (district) { return district.name; }),
        datasets: types.map(function (type, i) { return { label: type, data: top.map(function (district) { return (district.values[type] || 0) / 1000; }), backgroundColor: colorFor(type, i), borderWidth: 0 }; }) },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: { callbacks: { label: function (ctx) {
          var district = top[ctx.dataIndex], value = district.values[ctx.dataset.label] || 0;
          return ctx.dataset.label + ': ' + fmt(value) + ' ha (' + pct(district.total ? value / district.total * 100 : 0) + ')';
        } } } }, scales: { x: { stacked: true, title: { display: true, text: 'Ribu hektare' } }, y: { stacked: true } } }
      });
    }
  }

  function renderNationalDistrictDetails() {
    var districts = [];
    var typesMap = Object.create(null);
    PROVINCES.forEach(function (province) {
      var saved = cache[province.name];
      Object.keys(saved && saved.districts || {}).forEach(function (key) {
        var district = saved.districts[key];
        var values = {}, counts = {};
        Object.keys(district.groups || {}).forEach(function (type) { typesMap[type] = true; values[type] = Number(district.groups[type]) || 0; });
        Object.keys(district.counts || {}).forEach(function (type) { counts[type] = Number(district.counts[type]) || 0; });
        districts.push({ province: province.name, name: district.name || 'Tidak diketahui', values: values, counts: counts,
          total: Object.keys(values).reduce(function (sum, type) { return sum + values[type]; }, 0), featureCount: Number(district.featureCount) || 0 });
      });
    });
    if (!districts.length) return 0;
    var types = Object.keys(typesMap).sort();
    var national = districts.reduce(function (sum, district) { return sum + district.total; }, 0);
    var html = '<section class="gf-sawah-district-report"><h4 class="gf-forest-heading">Rincian luas sawah nasional per kabupaten/kota</h4>';
    html += '<p class="gf-forest-note">' + districts.length.toLocaleString('id-ID') + ' kabupaten/kota · diurutkan berdasarkan total luas.</p>';
    html += '<div style="height:280px;margin:12px 0 8px;position:relative"><canvas id="geofarm-sawah-national-district-chart" aria-label="Grafik 20 kabupaten/kota dengan sawah terluas" role="img"></canvas></div>';
    html += '<div class="gf-forest-table-wrap gf-sawah-district-table-wrap"><table class="gf-forest-table gf-sawah-table"><thead><tr><th>Kabupaten/Kota</th><th>Provinsi</th>';
    types.forEach(function (type) { html += '<th>' + esc(type) + ' (ha)</th>'; });
    html += '<th>Total (ha)</th><th>Porsi nasional</th><th>Poligon</th></tr></thead><tbody>';
    districts.forEach(function (district) {
      html += '<tr><th scope="row">' + esc(district.name) + '</th><td>' + esc(district.province) + '</td>';
      types.forEach(function (type) { html += '<td>' + fmt(district.values[type] || 0) + '</td>'; });
      html += '<td><b>' + fmt(district.total) + '</b></td><td>' + pct(national ? district.total / national * 100 : 0) + '</td><td>' + district.featureCount.toLocaleString('id-ID') + '</td></tr>';
    });
    html += '<tr class="gf-forest-grand"><th colspan="2">Total kabupaten/kota</th>';
    types.forEach(function (type) { html += '<td>' + fmt(districts.reduce(function (sum, district) { return sum + (district.values[type] || 0); }, 0)) + '</td>'; });
    html += '<td>' + fmt(national) + '</td><td>100%</td><td>' + districts.reduce(function (sum, district) { return sum + district.featureCount; }, 0).toLocaleString('id-ID') + '</td></tr></tbody></table></div></section>';
    output.insertAdjacentHTML('beforeend', html);
    var canvas = document.getElementById('geofarm-sawah-national-district-chart');
    if (canvas && window.Chart) {
      var top = districts.slice().sort(function (a, b) { return b.total - a.total; }).slice(0, 20);
      districtChart = new Chart(canvas, { type: 'bar', data: { labels: top.map(function (district) { return district.name + ' · ' + district.province; }),
        datasets: types.map(function (type, i) { return { label: type, data: top.map(function (district) { return (district.values[type] || 0) / 1000; }), backgroundColor: colorFor(type, i), borderWidth: 0 }; }) },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
          tooltip: { callbacks: { label: function (ctx) { var district = top[ctx.dataIndex], value = district.values[ctx.dataset.label] || 0;
            return ctx.dataset.label + ': ' + fmt(value) + ' ha (' + pct(district.total ? value / district.total * 100 : 0) + ')'; } } } },
          scales: { x: { stacked: true, title: { display: true, text: 'Ribu hektare' } }, y: { stacked: true } } }
      });
    }
    return districts.length;
  }

  steps.addEventListener('click', async function (event) {
    var button = event.target.closest('.gf-forest-island-button');
    if (!button || busy) return;
    var provinceIndex = Number(button.getAttribute('data-island-index'));
    var province = PROVINCES[provinceIndex];
    if (!province) return;
    busy = true; updateSteps();
    var map = window.map || window._map;
    if (cache[province.name]) status.textContent = 'Menyiapkan batas wilayah ' + province.name + '...';
    status.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    var boundaryPromise = map && window.L && L.geoJSON
      ? showProvinceBoundary(province, map).catch(function (error) { return error; })
      : Promise.resolve(new Error('Peta tidak tersedia.'));
    try {
      if (!cache[province.name]) await processProvince(province);
      output.innerHTML = '';
      render(collect([province]), [province]);
      output.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var boundary = await boundaryPromise;
      if (!(boundary instanceof Error)) {
        if (boundary.getBounds && boundary.getBounds().isValid()) {
          var boundaryBounds = boundary.getBounds().pad(0.04);
          if (window.SheetDrag && typeof window.SheetDrag.flyToBoundsInVisibleMap === 'function') {
            window.SheetDrag.flyToBoundsInVisibleMap(boundaryBounds, { maxZoom: 8, duration: 0.8 });
          } else {
            map.fitBounds(boundaryBounds, { maxZoom: 8, animate: true });
          }
        }
        status.innerHTML += '<br><span class="gf-forest-done">Batas ' + esc(province.name) + ' dan overlay LBS 2024 yang difilter per provinsi ditampilkan pada peta.</span>';
      } else {
        status.innerHTML += '<br><span class="gf-forest-error">Statistik siap, tetapi batas wilayah gagal dimuat: ' + esc(boundary.message || 'peta tidak tersedia.') + '</span>';
      }
    } catch (error) {
      console.error('[GeoFarm Sawah]', error);
      status.innerHTML = '<span class="gf-forest-error">Pemrosesan ' + esc(province.name) + ' gagal: ' + esc(error.message || 'data tidak dapat dimuat.') + '</span>';
    } finally { busy = false; updateSteps(); }
  });
  btn.addEventListener('click', async function () {
    if (busy) return;
    busy = true;
    output.innerHTML = '';
    updateSteps();
    var failed = [];
    try {
      for (var i = 0; i < PROVINCES.length; i++) {
        var province = PROVINCES[i];
        try {
          if (!cache[province.name]) await processProvince(province);
          else if (!cache[province.name].districts) await processDistricts(province);
        } catch (error) { failed.push(province.name + ': ' + (error.message || 'gagal memuat')); }
      }
      var allStatisticsAvailable = PROVINCES.every(function (province) { return !!cache[province.name]; });
      var allDistrictsAvailable = PROVINCES.every(function (province) { return !!(cache[province.name] && cache[province.name].districts); });
      if (allStatisticsAvailable) render(collect(PROVINCES));
      var districtCount = allStatisticsAvailable && allDistrictsAvailable ? renderNationalDistrictDetails() : 0;
      if (failed.length) {
        status.innerHTML += '<br><span class="gf-forest-error">Pemrosesan nasional belum lengkap untuk ' + esc(failed.join('; ')) + '. Klik Hitung Nasional lagi untuk mencoba ulang.</span>';
      } else if (!allStatisticsAvailable || !allDistrictsAvailable) {
        status.innerHTML += '<br><span class="gf-forest-error">Tabel nasional per kabupaten belum lengkap. Klik Hitung Nasional lagi untuk melanjutkan.</span>';
      } else {
        status.innerHTML += '<br><span class="gf-forest-done">Rincian nasional mencakup ' + districtCount.toLocaleString('id-ID') + ' kabupaten/kota.</span>';
      }
      output.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      busy = false;
      updateSteps();
    }
  });
  if (resetBtn) resetBtn.addEventListener('click', function () {
    if (busy) return;
    var map = window.map || window._map;
    if (provinceBoundaryLayer && map && map.hasLayer(provinceBoundaryLayer)) map.removeLayer(provinceBoundaryLayer);
    if (sawahWmsLayer && map && map.hasLayer(sawahWmsLayer)) map.removeLayer(sawahWmsLayer);
    provinceBoundaryLayer = null;
    sawahWmsLayer = null;
    activeProvinceName = '';
    status.textContent = 'Batas wilayah dan overlay sawah dihapus dari peta. Ringkasan statistik tetap tersedia.';
    updateSteps();
  });
  var style = document.createElement('style');
  style.textContent = '#geofarm-sawah-output .gf-forest-total{margin-top:12px}.gf-sawah-legend{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:12px 0;font-size:10px;color:#475569}.gf-sawah-legend span{display:flex;align-items:center;gap:4px}.gf-sawah-legend i{display:inline-block;width:9px;height:9px;border-radius:50%}.gf-sawah-table{min-width:760px}.gf-sawah-district-report{margin-top:18px;padding-top:2px;border-top:1px solid #e2e8f0}.gf-sawah-district-table-wrap{max-height:420px;overflow:auto}.gf-sawah-district-table-wrap thead{position:sticky;top:0;z-index:1}';
  document.head.appendChild(style);
  updateSteps();
})();
