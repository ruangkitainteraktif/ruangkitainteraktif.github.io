(function () {
  'use strict';

  var BI_API_RAW = 'https://www.bi.go.id/hargapangan/WebSite/TabelHarga';
  var GEOJSON_URL = 'assets/data/bps/geojson/provinsi.geojson';
  var COMMODITY_URL = 'assets/data/bi-hargapangan-commodities.json';

  var PROXY_LIST = [
    function (url) { return 'https://corsproxy.io/?url=' + encodeURIComponent(url); },
    function (url) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url); }
  ];

  var PROVINCE_MAP = {
    1:  { code: '11', name: 'Aceh',                      nmprov: 'ACEH' },
    2:  { code: '12', name: 'Sumatera Utara',             nmprov: 'SUMATERA UTARA' },
    3:  { code: '13', name: 'Sumatera Barat',             nmprov: 'SUMATERA BARAT' },
    4:  { code: '14', name: 'Riau',                       nmprov: 'RIAU' },
    5:  { code: '21', name: 'Kepulauan Riau',             nmprov: 'KEPULAUAN RIAU' },
    6:  { code: '15', name: 'Jambi',                      nmprov: 'JAMBI' },
    7:  { code: '17', name: 'Bengkulu',                   nmprov: 'BENGKULU' },
    8:  { code: '16', name: 'Sumatera Selatan',           nmprov: 'SUMATERA SELATAN' },
    9:  { code: '19', name: 'Kepulauan Bangka Belitung',  nmprov: 'KEPULAUAN BANGKA BELITUNG' },
    10: { code: '18', name: 'Lampung',                    nmprov: 'LAMPUNG' },
    11: { code: '36', name: 'Banten',                     nmprov: 'BANTEN' },
    12: { code: '32', name: 'Jawa Barat',                 nmprov: 'JAWA BARAT' },
    13: { code: '31', name: 'DKI Jakarta',                nmprov: 'DKI JAKARTA' },
    14: { code: '33', name: 'Jawa Tengah',                nmprov: 'JAWA TENGAH' },
    15: { code: '34', name: 'DI Yogyakarta',              nmprov: 'DI YOGYAKARTA' },
    16: { code: '35', name: 'Jawa Timur',                 nmprov: 'JAWA TIMUR' },
    17: { code: '51', name: 'Bali',                       nmprov: 'BALI' },
    18: { code: '52', name: 'Nusa Tenggara Barat',        nmprov: 'NUSA TENGGARA BARAT' },
    19: { code: '53', name: 'Nusa Tenggara Timur',        nmprov: 'NUSA TENGGARA TIMUR' },
    20: { code: '61', name: 'Kalimantan Barat',           nmprov: 'KALIMANTAN BARAT' },
    21: { code: '63', name: 'Kalimantan Selatan',         nmprov: 'KALIMANTAN SELATAN' },
    22: { code: '62', name: 'Kalimantan Tengah',          nmprov: 'KALIMANTAN TENGAH' },
    23: { code: '64', name: 'Kalimantan Timur',           nmprov: 'KALIMANTAN TIMUR' },
    24: { code: '65', name: 'Kalimantan Utara',           nmprov: 'KALIMANTAN UTARA' },
    26: { code: '73', name: 'Sulawesi Selatan',           nmprov: 'SULAWESI SELATAN' },
    27: { code: '74', name: 'Sulawesi Tenggara',          nmprov: 'SULAWESI TENGGARA' },
    28: { code: '72', name: 'Sulawesi Tengah',            nmprov: 'SULAWESI TENGAH' },
    29: { code: '71', name: 'Sulawesi Utara',             nmprov: 'SULAWESI UTARA' },
    30: { code: '76', name: 'Sulawesi Barat',             nmprov: 'SULAWESI BARAT' },
    31: { code: '81', name: 'Maluku',                     nmprov: 'MALUKU' },
    32: { code: '82', name: 'Maluku Utara',               nmprov: 'MALUKU UTARA' },
    33: { code: '92', name: 'Papua',                      nmprov: 'PAPUA' },
    34: { code: '91', name: 'Papua Barat',                nmprov: 'PAPUA BARAT' }
  };

  var geojsonCache = null;
  var activeLayer = null;
  var activeLegend = null;
  var loaded = false;

  function $(id) { return document.getElementById(id); }

  function fmtDate(d) { return d.toISOString().slice(0, 10); }

  function parsePrice(str) {
    if (!str || str === '-') return null;
    return parseInt(String(str).replace(/,/g, ''), 10) || null;
  }

  function normalize(s) { return String(s || '').trim().toLowerCase(); }

  /* ── Fetch with proxy fallback ── */
  async function fetchWithProxy(url) {
    try {
      var res = await fetch(url);
      if (res.ok) return await res.json();
    } catch (e) { /* CORS blocked, try proxies */ }

    for (var i = 0; i < PROXY_LIST.length; i++) {
      try {
        var res = await fetch(PROXY_LIST[i](url), { cache: 'no-store' });
        if (res.ok) return await res.json();
      } catch (e) { /* try next */ }
    }
    throw new Error('Semua proxy gagal untuk: ' + url);
  }

  /* ── Commodity dropdown (local file) ── */
  async function loadCommodities() {
    var sel = $('geopanganCommodity');
    if (!sel) return;
    try {
      var json = await fetchWithProxy(COMMODITY_URL);
      var items = json.data || [];
      var cats = {};
      var catOrder = [];
      items.forEach(function (c) {
        if (!c.cat_id) {
          cats[c.id] = c.name;
          catOrder.push(c.id);
        }
      });

      var grouped = {};
      items.filter(function (c) { return !!c.cat_id; }).forEach(function (c) {
        if (!grouped[c.cat_id]) grouped[c.cat_id] = [];
        grouped[c.cat_id].push(c);
      });

      var html = '';
      catOrder.forEach(function (catId) {
        var list = grouped[catId];
        if (!list || !list.length) return;
        html += '<optgroup label="' + cats[catId] + '">';
        list.forEach(function (c) {
          html += '<option value="' + c.id + '">' + c.name + '</option>';
        });
        html += '</optgroup>';
      });
      sel.innerHTML = html;
    } catch (e) {
      console.error('[Geopangan] Gagal load komoditas:', e);
      sel.innerHTML = '<option value="">Gagal memuat komoditas</option>';
    }
  }

  /* ── Province dropdown ── */
  function populateProvinces() {
    var sel = $('geopanganProvince');
    if (!sel) return;
    Object.keys(PROVINCE_MAP).sort(function (a, b) { return a - b; }).forEach(function (id) {
      var p = PROVINCE_MAP[id];
      var opt = document.createElement('option');
      opt.value = id;
      opt.textContent = p.name;
      sel.appendChild(opt);
    });
  }

  /* ── Default dates: last 7 days ── */
  function setDefaultDates() {
    var end = new Date();
    var start = new Date(end.getTime() - 6 * 86400000);
    var elStart = $('geopanganDateStart');
    var elEnd = $('geopanganDateEnd');
    if (elStart) elStart.value = fmtDate(start);
    if (elEnd) elEnd.value = fmtDate(end);
  }

  /* ── Fetch price data from BI API ── */
  async function fetchPriceData() {
    var priceType = $('geopanganPriceType') ? $('geopanganPriceType').value : '1';
    var commodity = $('geopanganCommodity') ? $('geopanganCommodity').value : 'com_1';
    var provinceId = $('geopanganProvince') ? $('geopanganProvince').value : '';
    var startDate = $('geopanganDateStart') ? $('geopanganDateStart').value : '';
    var endDate = $('geopanganDateEnd') ? $('geopanganDateEnd').value : '';

    if (!startDate || !endDate) {
      setDefaultDates();
      startDate = $('geopanganDateStart').value;
      endDate = $('geopanganDateEnd').value;
    }

    var params = new URLSearchParams({
      price_type_id: priceType,
      comcat_id: commodity,
      province_id: provinceId,
      regency_id: '',
      showKota: 'false',
      showPasar: 'false',
      tipe_laporan: '1',
      start_date: startDate,
      end_date: endDate
    });

    var url = BI_API_RAW + '/GetGridDataKomoditas?' + params.toString();
    var json = await fetchWithProxy(url);
    return json.data || [];
  }

  /* ── Load GeoJSON ── */
  async function loadGeoJSON() {
    if (geojsonCache) return geojsonCache;
    var res = await fetch(GEOJSON_URL);
    geojsonCache = await res.json();
    return geojsonCache;
  }

  /* ── Color scale: green (cheap) -> yellow -> red (expensive) ── */
  function getColor(value, min, max) {
    if (value === null || value === undefined || isNaN(value)) return 'rgba(200,200,200,0.3)';
    if (max === min) return '#fbbf24';
    var t = Math.max(0, Math.min(1, (value - min) / (max - min)));
    var r, g, b;
    if (t < 0.5) {
      var u = t * 2;
      r = Math.round(34 + (251 - 34) * u);
      g = Math.round(197 + (191 - 197) * u);
      b = Math.round(94 + (36 - 94) * u);
    } else {
      var v = (t - 0.5) * 2;
      r = Math.round(251 + (220 - 251) * v);
      g = Math.round(191 + (38 - 191) * v);
      b = Math.round(36 + (38 - 36) * v);
    }
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function getColorStops(min, max, n) {
    var stops = [];
    for (var i = 0; i < n; i++) {
      var t = n > 1 ? i / (n - 1) : 0;
      stops.push(getColor(min + (max - min) * t, min, max));
    }
    return stops;
  }

  /* ── Legend control ── */
  function addLegend(min, max, commodityName, priceTypeName) {
    if (activeLegend) { map.removeControl(activeLegend); activeLegend = null; }
    var LegendControl = L.Control.extend({
      options: { position: 'bottomleft' },
      onAdd: function () {
        var div = L.DomUtil.create('div', 'gp-legend');
        L.DomEvent.disableClickPropagation(div);
        var stops = getColorStops(min, max, 7);
        var fmt = function (v) { return v != null ? 'Rp ' + v.toLocaleString('id-ID') : '-'; };

        var svgCommodity = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/><path d="M12 6v12"/></svg>';
        var svgMarket = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h18l-2 13H5L3 3z"/><circle cx="9" cy="21" r="1"/><circle cx="17" cy="21" r="1"/></svg>';

        div.innerHTML =
          '<div class="gp-legend-header">' +
            '<div class="gp-legend-badge">LEGENDA</div>' +
            '<div class="gp-legend-info-row">' + svgCommodity + '<span>' + commodityName + '</span></div>' +
            '<div class="gp-legend-info-row">' + svgMarket + '<span>' + priceTypeName + '</span></div>' +
          '</div>' +
          '<div class="gp-legend-body">' +
            '<div class="gp-legend-bar">' +
              stops.map(function (c) { return '<span style="background:' + c + '"></span>'; }).join('') +
            '</div>' +
            '<div class="gp-legend-labels">' +
              '<span class="gp-legend-label-min">' + fmt(min) + '</span>' +
              '<span class="gp-legend-label-max">' + fmt(max) + '</span>' +
            '</div>' +
            '<div class="gp-legend-unit">Rp/kg</div>' +
          '</div>';
        return div;
      }
    });
    activeLegend = new LegendControl();
    activeLegend.addTo(map);
  }

  /* ── Build price map from API response ── */
  function buildPriceMap(data) {
    if (!data.length) return { priceMap: {}, dailyMap: {}, dateLabels: [], latestDate: null, min: 0, max: 0 };
    var first = data[0];
    var dateCols = Object.keys(first).filter(function (k) { return /\d{2}\/\d{2}\/\d{4}/.test(k); });
    dateCols.sort(function (a, b) {
      var pa = a.split('/'), pb = b.split('/');
      return new Date(pa[2], pa[1] - 1, pa[0]) - new Date(pb[2], pb[1] - 1, pb[0]);
    });
    var latestDate = dateCols[dateCols.length - 1];
    var dateLabels = dateCols.map(function (d) {
      var p = d.split('/');
      return p[0] + '/' + p[1];
    });
    var priceMap = {};
    var dailyMap = {};
    var min = Infinity, max = -Infinity;
    data.filter(function (r) { return r.level === 1; }).forEach(function (r) {
      var key = normalize(r.name);
      var daily = [];
      dateCols.forEach(function (dc) {
        var v = parsePrice(r[dc]);
        daily.push(v);
        if (v !== null) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      });
      dailyMap[key] = daily;
      var latest = parsePrice(r[latestDate]);
      if (latest !== null) {
        priceMap[key] = latest;
      }
    });
    if (min === Infinity) { min = 0; max = 0; }
    return { priceMap: priceMap, dailyMap: dailyMap, dateLabels: dateLabels, latestDate: latestDate, min: min, max: max };
  }

  /* ── Format date display ── */
  function formatDateID(dateStr) {
    if (!dateStr) return '-';
    var parts = dateStr.split('/');
    var months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return parseInt(parts[0]) + ' ' + months[parseInt(parts[1]) - 1] + ' ' + parts[2];
  }

  /* ── Main: load and display ── */
  async function loadAndDisplay() {
    var resultEl = $('geopanganResult');
    var loadBtn = $('geopanganLoadBtn');
    if (loadBtn) loadBtn.disabled = true;
    if (resultEl) resultEl.innerHTML = '<div class="geopangan-loading"><div class="geopangan-spinner"></div><span>Memuat data harga...</span></div>';

    try {
      var results = await Promise.all([fetchPriceData(), loadGeoJSON()]);
      var data = results[0];
      var geojson = results[1];

      if (!data.length) {
        if (resultEl) resultEl.innerHTML = '<div class="geopangan-loading"><span>Tidak ada data untuk filter ini.</span></div>';
        return;
      }

      var built = buildPriceMap(data);
      var priceMap = built.priceMap;
      var dailyMap = built.dailyMap;
      var dateLabels = built.dateLabels;
      var latestDate = built.latestDate;
      var min = built.min;
      var max = built.max;
      var commodityEl = $('geopanganCommodity');
      var priceTypeEl = $('geopanganPriceType');
      var commodityName = commodityEl && commodityEl.selectedOptions[0] ? commodityEl.selectedOptions[0].textContent : '';
      var priceTypeName = priceTypeEl && priceTypeEl.selectedOptions[0] ? priceTypeEl.selectedOptions[0].textContent : '';

      if (activeLayer) { map.removeLayer(activeLayer); activeLayer = null; }
      if (activeLegend) { map.removeControl(activeLegend); activeLegend = null; }

      activeLayer = L.geoJSON(geojson, {
        style: function (feature) {
          var provName = normalize(feature.properties.nmprov);
          var price = priceMap[provName];
          return {
            fillColor: getColor(price, min, max),
            weight: 1.2, opacity: 1, color: '#fff', fillOpacity: 0.75
          };
        },
        onEachFeature: function (feature, layer) {
          var provName = feature.properties.nmprov || '-';
          var provCode = feature.properties.kdprov || '';
          var provKey = normalize(provName);
          var price = priceMap[provKey];
          var priceFormatted = price ? 'Rp ' + price.toLocaleString('id-ID') : '-';
          var daily = dailyMap[provKey] || [];

          var svgPrice = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>';
          var svgDate = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
          var svgMarket = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h18l-2 13H5L3 3z"/><line x1="3" y1="3" x2="1" y2="1"/><circle cx="9" cy="21" r="1"/><circle cx="17" cy="21" r="1"/></svg>';
          var svgChart = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>';

          var popupHtml =
            '<div class="gp-popup">' +
              '<div class="gp-popup-head">' +
                '<div class="gp-popup-badge"><span class="gp-popup-badge-dot"></span>HARGA PANGAN</div>' +
                '<strong>' + provName + '</strong>' +
                '<span>' + commodityName + '</span>' +
              '</div>' +
              '<div class="gp-popup-body">' +
                '<div class="gp-popup-price">' +
                  '<div class="gp-popup-price-icon">' + svgPrice + '</div>' +
                  '<div class="gp-popup-price-info">' +
                    '<span class="gp-popup-price-label">Harga Terakhir</span>' +
                    '<span class="gp-popup-price-value">' + priceFormatted + '</span>' +
                  '</div>' +
                '</div>' +
                '<div class="gp-popup-meta">' +
                  '<div class="gp-popup-meta-row">' +
                    '<div class="gp-popup-meta-icon">' + svgDate + '</div>' +
                    '<div class="gp-popup-meta-text">' +
                      '<span class="gp-popup-meta-label">Tanggal</span>' +
                      '<span class="gp-popup-meta-value">' + formatDateID(latestDate) + '</span>' +
                    '</div>' +
                  '</div>' +
                  '<div class="gp-popup-meta-row">' +
                    '<div class="gp-popup-meta-icon">' + svgMarket + '</div>' +
                    '<div class="gp-popup-meta-text">' +
                      '<span class="gp-popup-meta-label">Jenis Pasar</span>' +
                      '<span class="gp-popup-meta-value">' + priceTypeName + '</span>' +
                    '</div>' +
                  '</div>' +
                '</div>' +
                '<div class="gp-popup-chart">' +
                  '<div class="gp-popup-chart-head">' + svgChart + '<span>Harga 7 Hari Terakhir</span></div>' +
                  '<div class="gp-popup-chart-wrap"><canvas id="gp-chart-' + provCode + '"></canvas></div>' +
                '</div>' +
              '</div>' +
            '</div>';

          layer.bindPopup(popupHtml, { maxWidth: 320, className: 'gp-leaflet-popup' });

          layer.on('popupopen', function () {
            var canvas = document.getElementById('gp-chart-' + provCode);
            if (!canvas || !daily.length) return;
            var ctx = canvas.getContext('2d');
            if (canvas._chartInstance) canvas._chartInstance.destroy();
            var shortLabels = dateLabels.slice(-7);
            var values = daily.slice(-7);
            canvas._chartInstance = new Chart(ctx, {
              type: 'line',
              data: {
                labels: shortLabels,
                datasets: [{
                  data: values,
                  borderColor: '#10a37f',
                  backgroundColor: 'rgba(16,163,127,0.10)',
                  fill: true,
                  tension: 0.35,
                  pointRadius: 3,
                  pointBackgroundColor: '#10a37f',
                  pointBorderColor: '#fff',
                  pointBorderWidth: 1.5,
                  borderWidth: 2
                }]
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { enabled: true, callbacks: { label: function (c) { return 'Rp ' + c.parsed.y.toLocaleString('id-ID'); } } } },
                scales: {
                  x: { display: true, grid: { display: false }, ticks: { font: { size: 9, family: 'Inter, sans-serif' }, color: '#6b7280', maxRotation: 45 } },
                  y: { display: true, grid: { color: '#f0f0f0' }, ticks: { font: { size: 9, family: 'Inter, sans-serif' }, color: '#6b7280', callback: function (v) { return 'Rp' + v.toLocaleString('id-ID'); } } }
                }
              }
            });
          });

          layer.on('mouseover', function () { layer.setStyle({ weight: 2.5, fillOpacity: 0.9 }); });
          layer.on('mouseout', function () { if (activeLayer) activeLayer.resetStyle(layer); });
        }
      }).addTo(map);

      addLegend(min, max, commodityName, priceTypeName);

      var selectedProvince = $('geopanganProvince') ? $('geopanganProvince').value : '';
      if (selectedProvince && PROVINCE_MAP[selectedProvince]) {
        var targetNmprov = PROVINCE_MAP[selectedProvince].nmprov;
        activeLayer.eachLayer(function (layer) {
          if (normalize(layer.feature.properties.nmprov) === normalize(targetNmprov)) {
            map.fitBounds(layer.getBounds().pad(0.3), { maxZoom: 8 });
          }
        });
      } else {
        map.fitBounds(activeLayer.getBounds().pad(0.1));
      }

      if (resultEl) {
        resultEl.innerHTML =
          '<div class="geopangan-info">' +
            '<span>' + commodityName + '</span><span class="geopangan-info-sep">|</span>' +
            '<span>' + priceTypeName + '</span><span class="geopangan-info-sep">|</span>' +
            '<span>' + Object.keys(priceMap).length + ' provinsi</span><span class="geopangan-info-sep">|</span>' +
            '<span>' + formatDateID(latestDate) + '</span>' +
          '</div>';
      }

    } catch (e) {
      console.error('[Geopangan] Error:', e);
      if (resultEl) resultEl.innerHTML = '<div class="geopangan-loading"><span style="color:#dc2626;">Gagal memuat data. Cek koneksi internet lalu coba lagi.</span></div>';
    } finally {
      if (loadBtn) loadBtn.disabled = false;
    }
  }

  /* ── Public auto-load (called by sidebar.js) ── */
  window.geopanganAutoLoad = async function () {
    if (!loaded) {
      loaded = true;
      await Promise.all([loadCommodities(), populateProvinces()]);
      setDefaultDates();
    }
    loadAndDisplay();
  };

  /* ── Init on first load if already on tab ── */
  async function init() {
    await Promise.all([loadCommodities(), populateProvinces()]);
    setDefaultDates();
    loadAndDisplay();
  }

  /* ── Event listeners ── */
  document.addEventListener('DOMContentLoaded', function () {
    var loadBtn = $('geopanganLoadBtn');
    if (loadBtn) loadBtn.addEventListener('click', loadAndDisplay);
    if (window.currentActiveTab === 'tab-geopangan') init();
  });

})();
