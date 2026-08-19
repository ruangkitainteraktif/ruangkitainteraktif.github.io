(function () {
  'use strict';

  var HOTSPOT_API = 'https://opsroom.sipongidata.my.id/api/opsroom/indoHotspot?wilayah=IN&filterperiode=false&from=&to=&late=24&satelit[]=NASA-MODIS&satelit[]=NASA-SNPP&satelit[]=NASA-NOAA20&confidence[]=low&confidence[]=medium&confidence[]=high&provinsi=&kabkota=';

  var heatmapLayer = null;
  var hotspotMarkerGroup = null;
  var hotspotLegendControl = null;
  var hotspotDataLoaded = false;
  var hotspotFeatures = [];

  function getConfidenceColor(level) {
    if (level === 'high') return '#dc2626';
    if (level === 'medium') return '#f59e0b';
    return '#22c55e';
  }

  function getConfidenceIntensity(level) {
    if (level === 'high') return 1.0;
    if (level === 'medium') return 0.6;
    return 0.3;
  }

  function fetchHotspotData(callback) {
    fetch(HOTSPOT_API)
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function (json) { callback(null, json); })
      .catch(function (e) { callback(e, null); });
  }

  function loadHotspotData(callback) {
    if (hotspotDataLoaded) { callback(true); return; }
    fetchHotspotData(function (err, geojson) {
      if (err || !geojson || !geojson.features) {
        console.error('[Hotspot] Gagal fetch:', err);
        callback(false);
        return;
      }
      hotspotFeatures = geojson.features;
      hotspotDataLoaded = true;
      callback(true);
    });
  }

  function createHotspotLegend(totalCount, high, medium, low) {
    if (hotspotLegendControl) {
      map.removeControl(hotspotLegendControl);
      hotspotLegendControl = null;
    }

    var LegendControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        var div = L.DomUtil.create('div', 'hotspot-legend');
        L.DomEvent.disableClickPropagation(div);

        div.innerHTML =
          '<div class="hotspot-legend-title">Hotspot Karhutla (24 Jam)</div>' +
          '<div class="hotspot-legend-total">' + totalCount.toLocaleString('id-ID') + ' titik aktif</div>' +
          '<div class="hotspot-legend-gradient">' +
            '<div class="hotspot-legend-bar"></div>' +
            '<div class="hotspot-legend-labels">' +
              '<span>Low</span><span>Medium</span><span>High</span>' +
            '</div>' +
          '</div>' +
          '<div class="hotspot-legend-items">' +
            '<div class="hotspot-legend-item">' +
              '<span class="hotspot-legend-dot" style="background:#dc2626;"></span>' +
              '<span>High (' + high + ')</span>' +
            '</div>' +
            '<div class="hotspot-legend-item">' +
              '<span class="hotspot-legend-dot" style="background:#f59e0b;"></span>' +
              '<span>Medium (' + medium + ')</span>' +
            '</div>' +
            '<div class="hotspot-legend-item">' +
              '<span class="hotspot-legend-dot" style="background:#22c55e;"></span>' +
              '<span>Low (' + low + ')</span>' +
            '</div>' +
          '</div>' +
          '<div class="hotspot-legend-source">Sumber: SIPONGI KEMENHUT</div>';

        return div;
      }
    });

    hotspotLegendControl = new LegendControl();
    hotspotLegendControl.addTo(map);
  }

  function removeHotspotLegend() {
    if (hotspotLegendControl) {
      map.removeControl(hotspotLegendControl);
      hotspotLegendControl = null;
    }
  }

  function showHotspotLayer() {
    loadHotspotData(function (ok) {
      if (!ok || !hotspotFeatures.length) {
        console.error('[Hotspot] Tidak ada data');
        return;
      }

      var high = 0, medium = 0, low = 0;
      var latlngs = [];

      for (var i = 0; i < hotspotFeatures.length; i++) {
        var p = hotspotFeatures[i].properties;
        if (p.lat == null || p.long == null) continue;

        if (p.confidence_level === 'high') high++;
        else if (p.confidence_level === 'medium') medium++;
        else low++;

        latlngs.push([p.lat, p.long, getConfidenceIntensity(p.confidence_level)]);
      }

      heatmapLayer = L.heatLayer(latlngs, {
        radius: 20,
        blur: 15,
        maxZoom: 17,
        max: 1.0,
        gradient: {
          0.2: '#22c55e',
          0.4: '#84cc16',
          0.6: '#f59e0b',
          0.8: '#ef4444',
          1.0: '#dc2626'
        },
        minOpacity: 0.4
      }).addTo(map);

      hotspotMarkerGroup = L.layerGroup();

      for (var j = 0; j < hotspotFeatures.length; j++) {
        var f = hotspotFeatures[j];
        var pp = f.properties;
        if (pp.lat == null || pp.long == null) continue;

        var color = getConfidenceColor(pp.confidence_level);
        var confPct = pp.confidence != null ? pp.confidence + '%' : '-';

        var marker = L.circleMarker([pp.lat, pp.long], {
          radius: 4,
          fillColor: color,
          color: '#fff',
          weight: 1,
          opacity: 0.9,
          fillOpacity: 0.85
        });

        var popupHtml =
          '<div style="font-family:system-ui,-apple-system,sans-serif;min-width:200px;">' +
            '<div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:6px;">Hotspot Karhutla</div>' +
            '<div style="font-size:11px;color:#475569;line-height:1.6;">' +
              '<div><b>' + (pp.desa || '-') + '</b>, ' + (pp.kecamatan || '-') + '</div>' +
              '<div>' + (pp.kabkota || '-') + ', ' + (pp.nama_provinsi || '-') + '</div>' +
              '<div style="margin-top:4px;">' + (pp.sumber || '-') +
                ' | <span style="color:' + color + ';font-weight:700;">' +
                (pp.confidence_level || '-') + ' (' + confPct + ')</span>' +
              '</div>' +
              '<div>' + (pp.date_hotspot || '-') + '</div>' +
            '</div>' +
            '<div style="margin-top:6px;padding-top:6px;border-top:1px solid #e5e7eb;">' +
              '<a href="' + (pp.route_create || '#') + '" target="_blank" ' +
              'style="font-size:10px;color:#0891b2;text-decoration:none;font-weight:600;">' +
              'Laporkan Ground Check</a>' +
            '</div>' +
          '</div>';

        marker.bindPopup(popupHtml, { maxWidth: 280, className: 'hotspot-popup' });
        hotspotMarkerGroup.addLayer(marker);
      }

      hotspotMarkerGroup.addTo(map);

      var eyeBtn = document.getElementById('toggleHotspotMarkers');
      if (eyeBtn) {
        eyeBtn.style.display = 'flex';
        eyeBtn.classList.remove('markers-hidden');
        eyeBtn.title = 'Sembunyikan marker';
      }

      createHotspotLegend(hotspotFeatures.length, high, medium, low);
      renderHotspotSummaryCard(high, medium, low);

      if (typeof window.loadHotspotTable === 'function') window.loadHotspotTable();
      if (typeof window.loadHotspotBar === 'function') window.loadHotspotBar();
    });
  }

  function renderHotspotSummaryCard(high, medium, low) {
    var container = document.getElementById('hotspot-summary-card');
    if (!container) return;

    var total = high + medium + low;

    // Find the latest hotspot by date
    var latest = null;
    var latestDate = null;
    for (var i = 0; i < hotspotFeatures.length; i++) {
      var p = hotspotFeatures[i].properties;
      if (!p.date_hotspot) continue;
      var d = new Date(p.date_hotspot);
      if (!latestDate || d > latestDate) {
        latestDate = d;
        latest = p;
      }
    }

    var latestProv = latest ? (latest.nama_provinsi || '-') : '-';
    var latestKab = latest ? (latest.kabkota || '-') : '-';
    var latestKec = latest ? (latest.kecamatan || '-') : '-';
    var latestDesa = latest ? (latest.desa || '-') : '-';
    var latestSatelit = latest ? (latest.sumber || '-') : '-';
    var latestConf = latest ? (latest.confidence_level || '-') : '-';
    var latestDateStr = latest ? (latest.date_hotspot || '-') : '-';

    container.innerHTML =
      '<div class="hotspot-summary">' +
        '<div class="hotspot-summary-main">' +
          '<div class="hotspot-summary-icon">&#x1F525;</div>' +
          '<div>' +
            '<h5 class="hotspot-summary-title">Hotspot Karhutla Terbaru</h5>' +
            '<div class="hotspot-summary-count">' + total.toLocaleString('id-ID') + ' titik aktif dalam 24 jam</div>' +
          '</div>' +
        '</div>' +
        '<div class="hotspot-summary-details">' +
          '<span>Lokasi<b>' + latestDesa + ', ' + latestKec + '</b></span>' +
          '<span>Satelit<b>' + latestSatelit + '</b></span>' +
          '<span>Confidence<b>' + latestConf + '</b></span>' +
        '</div>' +
        '<div class="hotspot-summary-waktu">' +
          '<span>Waktu<b>' + latestDateStr + '</b></span>' +
        '</div>' +
      '</div>';
  }

  function hideHotspotLayer() {
    if (heatmapLayer) {
      map.removeLayer(heatmapLayer);
      heatmapLayer = null;
    }
    if (hotspotMarkerGroup) {
      map.removeLayer(hotspotMarkerGroup);
      hotspotMarkerGroup = null;
    }
    removeHotspotLegend();
    var eyeBtn = document.getElementById('toggleHotspotMarkers');
    if (eyeBtn) {
      eyeBtn.style.display = 'none';
      eyeBtn.classList.remove('markers-hidden');
    }
    var summaryCard = document.getElementById('hotspot-summary-card');
    if (summaryCard) summaryCard.innerHTML = '';

    if (typeof window.clearHotspotTable === 'function') window.clearHotspotTable();
    if (typeof window.clearHotspotBar === 'function') window.clearHotspotBar();
  }

  function toggleHotspotMarkers() {
    if (!hotspotMarkerGroup) return;
    var eyeBtn = document.getElementById('toggleHotspotMarkers');
    if (map.hasLayer(hotspotMarkerGroup)) {
      map.removeLayer(hotspotMarkerGroup);
      if (eyeBtn) {
        eyeBtn.classList.add('markers-hidden');
        eyeBtn.title = 'Tampilkan marker';
      }
    } else {
      hotspotMarkerGroup.addTo(map);
      if (eyeBtn) {
        eyeBtn.classList.remove('markers-hidden');
        eyeBtn.title = 'Sembunyikan marker';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var checkbox = document.getElementById('toggleHotspotLayer');
    if (checkbox) {
      checkbox.addEventListener('change', function () {
        if (this.checked) {
          showHotspotLayer();
        } else {
          hideHotspotLayer();
        }
      });
    }

    var eyeBtn = document.getElementById('toggleHotspotMarkers');
    if (eyeBtn) {
      eyeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleHotspotMarkers();
      });
    }
  });

  window.showHotspotLayer = showHotspotLayer;
  window.hideHotspotLayer = hideHotspotLayer;
})();

/* ── Luas Kebakaran Chart ── */
(function () {
  'use strict';

  var LUAS_URL = 'assets/data/luas-kebakaran.json';

  function parseIndoNum(str) {
    if (typeof str === 'number') return str;
    if (!str) return 0;
    return parseFloat(String(str).replace(/\./g, '').replace(',', '.')) || 0;
  }

  function formatLuasVal(val) {
    if (val >= 1000000) return (val / 1000000).toFixed(1) + ' Jt';
    if (val >= 1000) return (val / 1000).toFixed(1) + ' Rb';
    return val.toFixed(0);
  }

  function renderLuasChart(totalData, lastUpdate) {
    var container = document.getElementById('luas-chart-container');
    if (!container || !totalData || !totalData.length) return;

    var years = [];
    var values = [];
    var maxVal = 0;

    for (var i = 0; i < totalData.length; i++) {
      var t = totalData[i];
      var year = String(t.tahun);
      var val = parseIndoNum(t.total);
      years.push(year);
      values.push(val);
      if (val > maxVal) maxVal = val;
    }

    if (maxVal === 0) maxVal = 1;

    var barsHtml = '';
    for (var j = 0; j < years.length; j++) {
      var pct = (values[j] / maxVal) * 100;
      var barH = Math.max(2, pct);
      var label = formatLuasVal(values[j]);
      barsHtml +=
        '<div class="luas-chart-bar-wrap">' +
          '<div class="luas-chart-bar-val">' + label + '</div>' +
          '<div class="luas-chart-bar" style="height:' + barH + '%;"></div>' +
          '<div class="luas-chart-bar-label">' + years[j] + '</div>' +
        '</div>';
    }

    container.innerHTML =
      '<div class="luas-chart">' +
        '<div class="luas-chart-header">' +
          '<div class="luas-chart-title">Indikasi Luas Kebakaran Karhutla</div>' +
          '<div class="luas-chart-subtitle">Total nasional (ha) &middot; Update: ' + (lastUpdate || '-') + '</div>' +
        '</div>' +
        '<div class="luas-chart-body">' +
          '<div class="luas-chart-bars">' + barsHtml + '</div>' +
        '</div>' +
      '</div>';
  }

  function loadLuasData() {
    var container = document.getElementById('luas-chart-container');
    if (!container) return;

    var xhr = new XMLHttpRequest();
    xhr.open('GET', LUAS_URL, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var json = JSON.parse(xhr.responseText);
          renderLuasChart(json.total, json.last);
        } catch (e) {
          console.error('[LuasChart] Parse error:', e);
          container.innerHTML = '<div style="text-align:center;padding:10px;color:#ef4444;font-size:8px;">Gagal memuat data luas kebakaran</div>';
        }
      } else {
        container.innerHTML = '<div style="text-align:center;padding:10px;color:#ef4444;font-size:8px;">Gagal memuat data luas kebakaran</div>';
      }
    };
    xhr.send();
  }

  loadLuasData();
})();

/* ── CO2 Emissions Chart ── */
(function () {
  'use strict';

  var CO2_URL = 'assets/data/emisi-co2.json';

  function parseIndoNum(str) {
    if (typeof str === 'number') return str;
    if (!str) return 0;
    return parseFloat(String(str).replace(/\./g, '').replace(',', '.')) || 0;
  }

  function formatCo2Val(val) {
    if (val >= 1000000000) return (val / 1000000000).toFixed(1) + ' M';
    if (val >= 1000000) return (val / 1000000).toFixed(1) + ' Jt';
    if (val >= 1000) return (val / 1000).toFixed(1) + ' Rb';
    return val.toFixed(0);
  }

  function renderCo2Chart(json) {
    var container = document.getElementById('co2-chart-container');
    if (!container || !json || !json.tahun || !json.data) return;

    var years = json.tahun.map(String);
    var totalPerYear = [];

    for (var yi = 0; yi < years.length; yi++) {
      var sum = 0;
      var provKeys = Object.keys(json.data);
      for (var pi = 0; pi < provKeys.length; pi++) {
        var arr = json.data[provKeys[pi]];
        for (var di = 0; di < arr.length; di++) {
          if (String(arr[di].tahun) === years[yi]) {
            sum += parseIndoNum(arr[di].luas);
          }
        }
      }
      totalPerYear.push(sum);
    }

    var maxVal = 0;
    for (var k = 0; k < totalPerYear.length; k++) {
      if (totalPerYear[k] > maxVal) maxVal = totalPerYear[k];
    }
    if (maxVal === 0) maxVal = 1;

    var barsHtml = '';
    for (var j = 0; j < years.length; j++) {
      var pct = (totalPerYear[j] / maxVal) * 100;
      var barH = Math.max(2, pct);
      var label = formatCo2Val(totalPerYear[j]);
      barsHtml +=
        '<div class="co2-chart-bar-wrap">' +
          '<div class="co2-chart-bar-val">' + label + '</div>' +
          '<div class="co2-chart-bar" style="height:' + barH + '%;"></div>' +
          '<div class="co2-chart-bar-label">' + years[j] + '</div>' +
        '</div>';
    }

    container.innerHTML =
      '<div class="co2-chart">' +
        '<div class="co2-chart-header">' +
          '<div class="co2-chart-title">Emisi CO2 Karhutla</div>' +
          '<div class="co2-chart-subtitle">Total nasional (ha)</div>' +
        '</div>' +
        '<div class="co2-chart-body">' +
          '<div class="co2-chart-bars">' + barsHtml + '</div>' +
        '</div>' +
      '</div>';
  }

  function loadCo2Data() {
    var container = document.getElementById('co2-chart-container');
    if (!container) return;

    var xhr = new XMLHttpRequest();
    xhr.open('GET', CO2_URL, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var json = JSON.parse(xhr.responseText);
          renderCo2Chart(json);
        } catch (e) {
          console.error('[CO2Chart] Parse error:', e);
          container.innerHTML = '<div style="text-align:center;padding:10px;color:#ef4444;font-size:8px;">Gagal memuat data emisi CO2</div>';
        }
      } else {
        container.innerHTML = '<div style="text-align:center;padding:10px;color:#ef4444;font-size:8px;">Gagal memuat data emisi CO2</div>';
      }
    };
    xhr.send();
  }

  loadCo2Data();
})();

/* ── Hotspot Sebaran Table ── */
(function () {
  'use strict';

  var HOTSPOT_API = 'https://opsroom.sipongidata.my.id/api/opsroom/indoHotspot?wilayah=IN&filterperiode=false&from=&to=&late=24&satelit[]=NASA-MODIS&satelit[]=NASA-SNPP&satelit[]=NASA-NOAA20&confidence[]=low&confidence[]=medium&confidence[]=high&provinsi=&kabkota=';
  var REFRESH_INTERVAL = 5 * 60 * 1000;
  var refreshTimer = null;
  var allData = [];
  var filteredData = [];
  var currentPage = 1;
  var perPage = 10;

  function aggregateFeatures(features) {
    var map = {};
    for (var i = 0; i < features.length; i++) {
      var p = features[i].properties;
      if (p.lat == null || p.long == null) continue;
      var prov = p.nama_provinsi || '-';
      var kab = p.kabkota || '-';
      var src = p.sumber || '-';
      var conf = p.confidence_level || '-';
      if (conf === 'high') conf = 'High';
      else if (conf === 'medium') conf = 'Medium';
      else conf = 'Low';
      var key = prov + '|' + kab + '|' + src + '|' + conf;
      if (!map[key]) map[key] = { provinsi: prov, kabupaten: kab, sumber: src, confidence: conf, counter: 0 };
      map[key].counter++;
    }
    var result = [];
    var keys = Object.keys(map);
    for (var k = 0; k < keys.length; k++) {
      result.push(map[keys[k]]);
    }
    return result;
  }

  function loadData() {
    var container = document.getElementById('hotspot-table-container');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:10px;color:#94a3b8;font-size:8px;">Memuat data hotspot...</div>';

    fetch(HOTSPOT_API)
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function (geojson) {
        if (!geojson || !geojson.features) throw new Error('No features');
        allData = aggregateFeatures(geojson.features);
        filteredData = allData.slice();
        renderTable();
      })
      .catch(function () {
        container.innerHTML = '<div style="text-align:center;padding:10px;color:#ef4444;font-size:8px;">Gagal memuat data hotspot</div>';
      });
  }

  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(function () {
      fetch(HOTSPOT_API)
        .then(function (r) { return r.json(); })
        .then(function (geojson) {
          if (geojson && geojson.features) {
            allData = aggregateFeatures(geojson.features);
            filteredData = allData.slice();
            applyFilters();
          }
        })
        .catch(function () {});
    }, REFRESH_INTERVAL);
  }

  function getProvinsiList() {
    var map = {};
    for (var i = 0; i < allData.length; i++) {
      map[allData[i].provinsi] = 1;
    }
    return Object.keys(map).sort();
  }

  function getCategories() {
    var map = {};
    for (var i = 0; i < allData.length; i++) {
      var c = allData[i].confidence;
      if (!map[c]) map[c] = 0;
      map[c]++;
    }
    return map;
  }

  function applyFilters() {
    var search = (document.getElementById('hotspotSearch') || {}).value || '';
    var provFilter = (document.getElementById('hotspotProvFilter') || {}).value || '';
    var confFilter = (document.getElementById('hotspotConfFilter') || {}).value || '';
    search = search.toLowerCase();

    filteredData = [];
    for (var i = 0; i < allData.length; i++) {
      var d = allData[i];
      if (search && d.kabupaten.toLowerCase().indexOf(search) === -1 && d.provinsi.toLowerCase().indexOf(search) === -1) continue;
      if (provFilter && d.provinsi !== provFilter) continue;
      if (confFilter && d.confidence !== confFilter) continue;
      filteredData.push(d);
    }
    currentPage = 1;
    renderTableBody();
    renderPagination();
  }

  function renderTable() {
    var container = document.getElementById('hotspot-table-container');
    if (!container) return;

    var cats = getCategories();
    var provList = getProvinsiList();

    var catHtml = '<div class="hs-cat-items">';
    var catColors = { High: '#ef4444', Medium: '#f59e0b', Low: '#22c55e' };
    var catKeys = ['High', 'Medium', 'Low'];
    for (var k = 0; k < catKeys.length; k++) {
      var ck = catKeys[k];
      if (cats[ck] !== undefined) {
        catHtml += '<div class="hs-cat-item"><span class="hs-cat-dot" style="background:' + (catColors[ck] || '#94a3b8') + ';"></span>' + ck + ': <b>' + cats[ck] + '</b></div>';
      }
    }
    catHtml += '</div>';

    var provOpts = '<option value="">Semua Provinsi</option>';
    for (var p = 0; p < provList.length; p++) {
      provOpts += '<option value="' + provList[p] + '">' + provList[p] + '</option>';
    }

    var confOpts = '<option value="">Semua Confidence</option>';
    for (var ci = 0; ci < catKeys.length; ci++) {
      if (cats[catKeys[ci]] !== undefined) {
        confOpts += '<option value="' + catKeys[ci] + '">' + catKeys[ci] + ' (' + cats[catKeys[ci]] + ')</option>';
      }
    }

    container.innerHTML =
      '<div class="hs-table-wrap">' +
        '<div class="hs-table-header">' +
          '<div class="hs-table-title">Sebaran Hotspot (24 Jam)</div>' +
          '<div class="hs-table-total">' + allData.reduce(function(s, r) { return s + r.counter; }, 0).toLocaleString('id-ID') + ' titik panas</div>' +
        '</div>' +
        catHtml +
        '<div class="hs-table-controls">' +
          '<input type="text" id="hotspotSearch" class="hs-search-input" placeholder="Cari provinsi / kabupaten...">' +
          '<select id="hotspotProvFilter" class="hs-select">' + provOpts + '</select>' +
          '<select id="hotspotConfFilter" class="hs-select">' + confOpts + '</select>' +
        '</div>' +
        '<div class="hs-table-scroll">' +
          '<table class="hs-table">' +
            '<thead><tr>' +
              '<th>No</th><th>Provinsi</th><th>Kabupaten</th><th>Sumber</th><th>Confidence</th><th>Jumlah</th>' +
            '</tr></thead>' +
            '<tbody id="hotspotTableBody"></tbody>' +
          '</table>' +
        '</div>' +
        '<div id="hotspotPagination" class="hs-pagination"></div>' +
      '</div>';

    document.getElementById('hotspotSearch').addEventListener('input', applyFilters);
    document.getElementById('hotspotProvFilter').addEventListener('change', applyFilters);
    document.getElementById('hotspotConfFilter').addEventListener('change', applyFilters);

    renderTableBody();
    renderPagination();
  }

  function renderTableBody() {
    var tbody = document.getElementById('hotspotTableBody');
    if (!tbody) return;

    var start = (currentPage - 1) * perPage;
    var end = Math.min(start + perPage, filteredData.length);
    var rows = '';

    for (var i = start; i < end; i++) {
      var d = filteredData[i];
      var confClass = 'hs-conf-' + d.confidence.toLowerCase();
      rows += '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + d.provinsi + '</td>' +
        '<td>' + d.kabupaten + '</td>' +
        '<td>' + d.sumber + '</td>' +
        '<td><span class="hs-conf-badge ' + confClass + '">' + d.confidence + '</span></td>' +
        '<td class="hs-num">' + d.counter + '</td>' +
      '</tr>';
    }

    if (filteredData.length === 0) {
      rows = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:16px;">Tidak ada data</td></tr>';
    }

    tbody.innerHTML = rows;
  }

  function renderPagination() {
    var pag = document.getElementById('hotspotPagination');
    if (!pag) return;

    var totalPages = Math.ceil(filteredData.length / perPage);
    if (totalPages <= 1) { pag.innerHTML = ''; return; }

    var html = '<button class="hs-page-btn" data-page="prev" ' + (currentPage <= 1 ? 'disabled' : '') + '>&laquo;</button>';
    for (var i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 2) {
        html += '<button class="hs-page-btn ' + (i === currentPage ? 'active' : '') + '" data-page="' + i + '">' + i + '</button>';
      } else if (Math.abs(i - currentPage) === 3) {
        html += '<span class="hs-page-dots">...</span>';
      }
    }
    html += '<button class="hs-page-btn" data-page="next" ' + (currentPage >= totalPages ? 'disabled' : '') + '>&raquo;</button>';
    pag.innerHTML = html;

    var btns = pag.querySelectorAll('.hs-page-btn');
    for (var b = 0; b < btns.length; b++) {
      btns[b].addEventListener('click', function () {
        var pg = this.getAttribute('data-page');
        var totalPages = Math.ceil(filteredData.length / perPage);
        if (pg === 'prev' && currentPage > 1) currentPage--;
        else if (pg === 'next' && currentPage < totalPages) currentPage++;
        else if (pg !== 'prev' && pg !== 'next') currentPage = parseInt(pg);
        renderTableBody();
        renderPagination();
      });
    }
  }

  function clearTable() {
    allData = [];
    filteredData = [];
    var container = document.getElementById('hotspot-table-container');
    if (container) container.innerHTML = '';
  }

  window.loadHotspotTable = loadData;
  window.clearHotspotTable = clearTable;
})();

/* ── Hotspot Bar Chart per Provinsi ── */
(function () {
  'use strict';

  var HOTSPOT_API = 'https://opsroom.sipongidata.my.id/api/opsroom/indoHotspot?wilayah=IN&filterperiode=false&from=&to=&late=24&satelit[]=NASA-MODIS&satelit[]=NASA-SNPP&satelit[]=NASA-NOAA20&confidence[]=low&confidence[]=medium&confidence[]=high&provinsi=&kabkota=';
  var REFRESH_INTERVAL = 5 * 60 * 1000;
  var refreshTimer = null;

  function aggregateByProvinsi(features) {
    var map = {};
    for (var i = 0; i < features.length; i++) {
      var p = features[i].properties;
      if (p.lat == null || p.long == null) continue;
      var prov = p.nama_provinsi || '-';
      if (!map[prov]) map[prov] = 0;
      map[prov]++;
    }
    var arr = [];
    var keys = Object.keys(map);
    for (var k = 0; k < keys.length; k++) {
      arr.push({ provinsi: keys[k], counter: map[keys[k]] });
    }
    return arr;
  }

  function formatNum(val) {
    if (val >= 1000) return (val / 1000).toFixed(1) + ' Rb';
    return String(val);
  }

  function renderHotspotBar(data) {
    var container = document.getElementById('hotspot-bar-container');
    if (!container || !data || !data.length) return;

    var provMap = {};
    for (var i = 0; i < data.length; i++) {
      var p = data[i].provinsi;
      if (!provMap[p]) provMap[p] = 0;
      provMap[p] += data[i].counter;
    }

    var arr = [];
    var keys = Object.keys(provMap);
    for (var k = 0; k < keys.length; k++) {
      arr.push({ name: keys[k], total: provMap[keys[k]] });
    }
    arr.sort(function (a, b) { return b.total - a.total; });

    var maxVal = arr.length > 0 ? arr[0].total : 1;
    if (maxVal === 0) maxVal = 1;

    var barsHtml = '';
    for (var j = 0; j < arr.length; j++) {
      var pct = (arr[j].total / maxVal) * 100;
      var barH = Math.max(2, pct);
      barsHtml +=
        '<div class="hs-bar-wrap">' +
          '<div class="hs-bar-tooltip">' + arr[j].name + ' — ' + formatNum(arr[j].total) + ' titik panas</div>' +
          '<div class="hs-bar-val">' + formatNum(arr[j].total) + '</div>' +
          '<div class="hs-bar-area"><div class="hs-bar" style="height:' + barH + '%;"></div></div>' +
          '<div class="hs-bar-label">' + arr[j].name + '</div>' +
        '</div>';
    }

    container.innerHTML =
      '<div class="hs-bar-chart">' +
        '<div class="hs-bar-header">' +
          '<div class="hs-bar-title">Distribusi Hotspot per Provinsi (24 Jam)</div>' +
          '<div class="hs-bar-subtitle">Sumber: NASA-MODIS, SNPP, NOAA20</div>' +
        '</div>' +
        '<div class="hs-bar-body">' +
          '<div class="hs-bar-bars">' + barsHtml + '</div>' +
        '</div>' +
      '</div>';
  }

  function loadData() {
    var container = document.getElementById('hotspot-bar-container');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:10px;color:#94a3b8;font-size:8px;">Memuat data hotspot...</div>';

    fetch(HOTSPOT_API)
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function (geojson) {
        if (!geojson || !geojson.features) throw new Error('No features');
        renderHotspotBar(aggregateByProvinsi(geojson.features));
      })
      .catch(function () {
        container.innerHTML = '<div style="text-align:center;padding:10px;color:#ef4444;font-size:8px;">Gagal memuat data hotspot</div>';
      });
  }

  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(function () {
      fetch(HOTSPOT_API)
        .then(function (r) { return r.json(); })
        .then(function (geojson) {
          if (geojson && geojson.features) renderHotspotBar(aggregateByProvinsi(geojson.features));
        })
        .catch(function () {});
    }, REFRESH_INTERVAL);
  }

  function clearBar() {
    var container = document.getElementById('hotspot-bar-container');
    if (container) container.innerHTML = '';
  }

  window.loadHotspotBar = loadData;
  window.clearHotspotBar = clearBar;
})();
