/* GeoFarm: statistik luas LBS 2023 per pulau dari layanan Kementan. */
(function () {
  'use strict';

  var SERVICE = 'https://sig02.pertanian.go.id/server/rest/services/Sawah/Sawah2023/MapServer';
  var LAYER = SERVICE + '/0';
  var PROXY = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';
  var CACHE_KEY = 'geofarm-sawah-statistics-2023-v1';
  var PAGE_SIZE = 150;
  var ISLANDS = [
    { name: 'Sumatera', codes: ['11','12','13','14','15','16','17','18','19','21'], focus: [0, 101] },
    { name: 'Jawa', codes: ['31','32','33','34','35','36'], focus: [-7.2, 110.5] },
    { name: 'Bali & Nusa Tenggara', codes: ['51','52','53'], focus: [-8.5, 117] },
    { name: 'Kalimantan', codes: ['61','62','63','64','65'], focus: [-1.5, 114.5] },
    { name: 'Sulawesi', codes: ['71','72','73','74','75','76'], focus: [-3, 120] },
    { name: 'Maluku', codes: ['81','82'], focus: [-3.3, 130] },
    { name: 'Papua', codes: ['91','92','93','94','95','96'], focus: [-4.3, 137] }
  ];
  var btn = document.getElementById('geofarm-sawah-run');
  var resetBtn = document.getElementById('geofarm-sawah-reset');
  var status = document.getElementById('geofarm-sawah-status');
  var output = document.getElementById('geofarm-sawah-output');
  var steps = document.getElementById('geofarm-sawah-island-steps');
  if (!btn || !status || !output || !steps) return;

  var cache = readCache();
  var mapLayers = Object.create(null);
  var chart = null;
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
  function ready() { return ISLANDS.every(function (island) { return !!cache[island.name]; }); }
  function loading(step, title, progress, detail) {
    var p = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : null;
    status.innerHTML = '<div class="gf-forest-loading"><span class="gf-forest-spinner" aria-hidden="true"></span><div class="gf-forest-loading-copy"><strong>' +
      esc(step + ' · ' + title) + '</strong>' + (detail ? '<small>' + esc(detail) + '</small>' : '') +
      (p === null ? '<div class="gf-forest-progress gf-forest-progress-indeterminate"><i></i></div>' :
        '<div class="gf-forest-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '"><i style="width:' + p + '%"></i></div>') +
      '</div></div>';
  }
  function updateSteps() {
    steps.innerHTML = ISLANDS.map(function (island, i) {
      var saved = cache[island.name];
      var loaded = !!mapLayers[island.name];
      var count = saved ? Number(saved.featureCount || 0).toLocaleString('id-ID') : '';
      return '<div class="gf-forest-island-step"><div class="gf-forest-island-meta"><strong>' + esc((i + 1) + '. ' + island.name) +
        '</strong><small id="gf-sawah-step-status-' + i + '">' + (saved ? 'Data tersedia · ' + count + ' poligon' + (loaded ? ' · peta aktif' : '') : 'Siap dihitung') +
        '</small></div><button class="gf-forest-island-button" type="button" data-island-index="' + i + '"' + (busy ? ' disabled' : '') + '>' +
        (saved ? (loaded ? 'Hitung ulang' : 'Muat poligon') : 'Hitung pulau') + '</button></div>';
    }).join('');
    btn.disabled = !ready() || busy;
    if (resetBtn) resetBtn.disabled = busy || !Object.keys(mapLayers).some(function (name) { return !!mapLayers[name]; });
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
  function popup(properties, island) {
    var p = properties || {};
    var ha = Number(getValue(p, 'Luas_Ha')) || 0;
    var fields = [
      ['Pulau', island.name], ['Provinsi', getValue(p, 'WADMPR')], ['Kabupaten', getValue(p, 'WADMKK')],
      ['Jenis lahan sawah', landType(p)], ['Cetak sawah', getValue(p, 'Cetak_Sawah')], ['Luas', fmt(ha) + ' ha']
    ].filter(function (row) { return row[1] !== '' && row[1] !== null && row[1] !== undefined; });
    return '<div class="agol-popup"><div class="agol-popup-header agol-geo-kawasan"><div class="agol-popup-badge">KEMENTAN · LAHAN BAKU SAWAH 2023</div>' +
      '<div class="agol-popup-title">' + esc(landType(p)) + '</div></div><div class="agol-popup-body"><div class="agol-popup-fields">' +
      fields.map(function (row) { return '<div class="agol-popup-field"><span class="agol-popup-field-label">' + esc(row[0]) +
        '</span><span class="agol-popup-field-value">' + esc(row[1]) + '</span></div>'; }).join('') +
      '</div></div><div class="agol-popup-footer"><span>Sumber: Kementerian Pertanian · LBS 2023</span></div></div>';
  }
  function addPagePolygons(features, island, stagingLayer) {
    if (!window.L || !L.geoJSON || !L.esri || !L.esri.Util || !stagingLayer) return 0;
    var geoFeatures = [];
    features.forEach(function (feature) {
      try {
        var geo = L.esri.Util.arcgisToGeoJSON(feature);
        if (!geo || !geo.geometry) return;
        var attrs = feature.attributes || {};
        geo.properties = Object.assign({}, geo.properties || {}, attrs, {
          _sawahType: landType(attrs),
          _sawahAreaHa: Number(getValue(attrs, 'Luas_Ha')) || 0
        });
        geoFeatures.push(geo);
      } catch (error) { console.warn('[GeoFarm Sawah] Geometri tidak dapat ditampilkan:', error); }
    });
    if (!geoFeatures.length) return 0;
    var renderer = typeof L.canvas === 'function' ? L.canvas({ padding: 0.4 }) : undefined;
    L.geoJSON({ type: 'FeatureCollection', features: geoFeatures }, {
      renderer: renderer,
      style: function (feature) {
        var color = colorFor(feature.properties && feature.properties._sawahType, 0);
        return { color: color, weight: 0.65, opacity: 0.95, fillColor: color, fillOpacity: 0.38 };
      },
      onEachFeature: function (feature, layer) {
        layer.bindPopup(popup(feature.properties, island), { maxWidth: 320, className: 'gf-forest-leaflet-popup' });
      }
    }).addTo(stagingLayer);
    return geoFeatures.length;
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
  async function processIsland(island, stagingLayer) {
    loading('1/3', 'Memuat data pulau', null, 'Menyiapkan poligon sawah ' + island.name + '.');
    var where = "WIADPR IN ('" + island.codes.join("','") + "')";
    var count = await fetchJson(requestUrl({ where: where, returnCountOnly: 'true', f: 'json' }));
    var total = Number(count.count);
    if (!Number.isFinite(total) || total < 1) throw new Error('Tidak ada poligon sawah untuk ' + island.name + ' atau jumlah data tidak valid.');
    var groups = Object.create(null), counts = Object.create(null), processed = 0, offset = 0;
    while (offset < total) {
      var size = PAGE_SIZE, page;
      while (!page) {
        loading('2/3', 'Menghitung dan menampilkan poligon', processed / total * 100,
          island.name + ' · poligon ' + (processed + 1).toLocaleString('id-ID') + ' dari ' + total.toLocaleString('id-ID') + ' · halaman ' + size + '.');
        var params = { where: where, outFields: 'OBJECTID,WADMPR,WIADPR,WADMKK,WIADKK,Qname_2023,Jenis_Lahan_Sawah,Cetak_Sawah,Luas_Ha',
          returnGeometry: 'true', outSR: '4326', orderByFields: 'OBJECTID', resultOffset: offset, resultRecordCount: size, f: 'json' };
        try { page = await fetchJson(requestUrl(params)); }
        catch (error) {
          if (size <= 25) throw new Error('Gagal memuat poligon ke-' + offset.toLocaleString('id-ID') + ': ' + error.message);
          size = Math.max(25, Math.floor(size / 2));
        }
      }
      if (!Array.isArray(page.features)) throw new Error('Format poligon dari layanan tidak valid.');
      if (!page.features.length) throw new Error('Data terhenti pada poligon ke-' + offset.toLocaleString('id-ID') + '.');
      var islandFeatures = [];
      page.features.forEach(function (feature) {
        var attrs = feature.attributes || {};
        var provinceCode = String(getValue(attrs, 'WIADPR')).substring(0, 2);
        if (island.codes.indexOf(provinceCode) < 0) return;
        islandFeatures.push(feature);
        var ha = Number(getValue(attrs, 'Luas_Ha')) || 0;
        feature._sawahAreaHa = ha;
        if (!Number.isFinite(ha) || ha <= 0) return;
        var type = landType(attrs);
        groups[type] = (groups[type] || 0) + ha;
        counts[type] = (counts[type] || 0) + 1;
      });
      addPagePolygons(islandFeatures, island, stagingLayer);
      processed += page.features.length;
      offset += page.features.length;
      await new Promise(function (resolve) { requestAnimationFrame(resolve); });
    }
    if (!Object.keys(groups).length) throw new Error('Kode provinsi pada data tidak cocok dengan pembagian wilayah ' + island.name + '.');
    loading('3/3', 'Menyimpan ringkasan', 100, 'Perhitungan selesai untuk ' + processed.toLocaleString('id-ID') + ' poligon.');
    cache[island.name] = { groups: groups, counts: counts, featureCount: processed, fetchedAt: new Date().toISOString() };
    if (!saveCache()) { delete cache[island.name]; throw new Error('Ringkasan berhasil dihitung, tetapi tidak dapat disimpan.'); }
    return cache[island.name];
  }
  function collect(islands) {
    var groups = Object.create(null), counts = Object.create(null), features = 0, types = Object.create(null);
    islands.forEach(function (island) {
      var saved = cache[island.name]; features += Number(saved.featureCount) || 0;
      Object.keys(saved.groups || {}).forEach(function (type) {
        types[type] = true; groups[island.name + '|' + type] = Number(saved.groups[type]) || 0;
        counts[island.name + '|' + type] = Number(saved.counts[type]) || 0;
      });
    });
    return { groups: groups, counts: counts, featureCount: features, types: Object.keys(types).sort() };
  }
  function render(report, selected) {
    var islands = selected || ISLANDS;
    var types = report.types;
    var rows = islands.map(function (island) {
      var values = {}, counts = {};
      types.forEach(function (type) { values[type] = report.groups[island.name + '|' + type] || 0; counts[type] = report.counts[island.name + '|' + type] || 0; });
      var total = types.reduce(function (sum, type) { return sum + values[type]; }, 0);
      return { name: island.name, values: values, counts: counts, total: total };
    });
    var national = rows.reduce(function (sum, row) { return sum + row.total; }, 0);
    var isNational = islands.length === ISLANDS.length;
    var sorted = rows.slice().sort(function (a, b) { return b.total - a.total; });
    var html = '<div class="gf-forest-total"><span>Total luas sawah ' + (isNational ? 'Indonesia' : esc(islands[0].name)) + '</span><strong>' + fmt(national) + ' ha</strong><small>' + fmt(national / 100) + ' km² · ' + report.featureCount.toLocaleString('id-ID') + ' poligon</small></div>';
    html += '<div class="gf-sawah-legend"><b>Jenis lahan sawah:</b>' + types.map(function (type, i) { return '<span><i style="background:' + colorFor(type, i) + '"></i>' + esc(type) + '</span>'; }).join('') + '</div>';
    html += '<div style="height:270px;margin:16px 0 8px;position:relative"><canvas id="geofarm-sawah-chart" aria-label="Grafik luas sawah per pulau" role="img"></canvas></div>';
    html += '<h4 class="gf-forest-heading">Rincian luas sawah per pulau dan jenis</h4><div class="gf-forest-table-wrap"><table class="gf-forest-table gf-sawah-table"><thead><tr><th>Pulau</th>';
    types.forEach(function (type) { html += '<th>' + esc(type) + ' (ha)</th>'; });
    html += '<th>Total (ha)</th><th>Porsi nasional</th><th>Poligon</th></tr></thead><tbody>';
    rows.forEach(function (row) {
      var n = types.reduce(function (sum, type) { return sum + row.counts[type]; }, 0);
      html += '<tr><th scope="row">' + esc(row.name) + '</th>';
      types.forEach(function (type) { html += '<td>' + fmt(row.values[type]) + '</td>'; });
      html += '<td><b>' + fmt(row.total) + '</b></td><td>' + pct(national ? row.total / national * 100 : 0) + '</td><td>' + n.toLocaleString('id-ID') + '</td></tr>';
    });
    html += '<tr class="gf-forest-grand"><th>' + (isNational ? 'Indonesia' : 'Total pulau') + '</th>';
    types.forEach(function (type) { html += '<td>' + fmt(rows.reduce(function (sum, row) { return sum + row.values[type]; }, 0)) + '</td>'; });
    html += '<td>' + fmt(national) + '</td><td>100%</td><td>' + report.featureCount.toLocaleString('id-ID') + '</td></tr></tbody></table></div>';
    html += '<p class="gf-forest-note">Luas merupakan penjumlahan atribut hektare pada data sumber. Poligon ditampilkan bertahap di peta; klik sawah untuk melihat provinsi, kabupaten, jenis, dan luas. Statistik tersimpan di browser. Sumber: Kementerian Pertanian, LBS 2023.</p>';
    output.innerHTML = html;
    if (chart) chart.destroy();
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
    status.innerHTML = '<span class="gf-forest-done">' + (isNational ? 'Statistik nasional' : 'Statistik ' + esc(islands[0].name)) + ' siap. Total ' + fmt(national) + ' ha. Pulau dengan luas terbesar: ' + esc(sorted[0] ? sorted[0].name : '—') + '.</span>';
  }

  steps.addEventListener('click', async function (event) {
    var button = event.target.closest('.gf-forest-island-button');
    if (!button || busy) return;
    var island = ISLANDS[Number(button.getAttribute('data-island-index'))];
    if (!island) return;
    busy = true; updateSteps();
    var map = window.map || window._map;
    var stagingLayer = map && window.L && L.featureGroup ? L.featureGroup().addTo(map) : null;
    try {
      await processIsland(island, stagingLayer);
      var previous = mapLayers[island.name];
      var visible = !!(stagingLayer && stagingLayer.getLayers && stagingLayer.getLayers().length);
      if (visible) {
        if (previous && map.hasLayer(previous)) map.removeLayer(previous);
        mapLayers[island.name] = stagingLayer;
      } else if (stagingLayer && map && map.hasLayer(stagingLayer)) map.removeLayer(stagingLayer);
      output.innerHTML = '';
      render(collect([island]), [island]);
      if (visible && stagingLayer.getBounds && stagingLayer.getBounds().isValid()) map.fitBounds(stagingLayer.getBounds().pad(0.04), { maxZoom: 8, animate: true });
      status.innerHTML += visible ? '<br><span class="gf-forest-done">Poligon sawah ' + esc(island.name) + ' ditampilkan di peta.</span>' : '<br><span class="gf-forest-error">Perhitungan berhasil, tetapi poligon belum dapat ditampilkan di peta.</span>';
    } catch (error) {
      if (stagingLayer && map && map.hasLayer(stagingLayer)) map.removeLayer(stagingLayer);
      console.error('[GeoFarm Sawah]', error);
      status.innerHTML = '<span class="gf-forest-error">Pemrosesan ' + esc(island.name) + ' gagal: ' + esc(error.message || 'data tidak dapat dimuat.') + '</span>';
    } finally { busy = false; updateSteps(); }
  });
  btn.addEventListener('click', function () {
    if (busy || !ready()) return;
    render(collect(ISLANDS));
  });
  if (resetBtn) resetBtn.addEventListener('click', function () {
    if (busy) return;
    var map = window.map || window._map;
    Object.keys(mapLayers).forEach(function (name) {
      var layer = mapLayers[name];
      if (layer && map && map.hasLayer(layer)) map.removeLayer(layer);
      delete mapLayers[name];
    });
    status.textContent = 'Semua poligon sawah dihapus dari peta. Ringkasan statistik tetap tersedia.';
    updateSteps();
  });
  var style = document.createElement('style');
  style.textContent = '.gf-sawah-legend{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:12px 0;font-size:10px;color:#475569}.gf-sawah-legend span{display:flex;align-items:center;gap:4px}.gf-sawah-legend i{display:inline-block;width:9px;height:9px;border-radius:50%}.gf-sawah-table{min-width:760px}';
  document.head.appendChild(style);
  updateSteps();
})();
