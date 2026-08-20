(function () {
  'use strict';

  var BI_API_RAW = 'https://www.bi.go.id/hargapangan/WebSite/TabelHarga';
  var GEOJSON_URL = 'assets/data/bps/geojson/provinsi.geojson';
  var COMMODITY_URL = 'assets/data/bi-hargapangan-commodities.json';
  var BPS_INFLASI_URL_125 = 'https://webapi.bps.go.id/v1/api/list/model/data/lang/ind/domain/0000/var/2263/th/125/key/4c135b6a06a97bd32fd0476067e0a5dd';
  var BPS_INFLASI_URL_126 = 'https://webapi.bps.go.id/v1/api/list/model/data/lang/ind/domain/0000/var/2263/th/126/key/4c135b6a06a97bd32fd0476067e0a5dd';
  var BPS_INFLASI_BULANAN_URL_125 = 'https://webapi.bps.go.id/v1/api/list/model/data/lang/ind/domain/0000/var/2262/th/125/key/4c135b6a06a97bd32fd0476067e0a5dd';
  var BPS_INFLASI_BULANAN_URL_126 = 'https://webapi.bps.go.id/v1/api/list/model/data/lang/ind/domain/0000/var/2262/th/126/key/4c135b6a06a97bd32fd0476067e0a5dd';

  var PROXY_LIST = [
    function (url) { return 'https://corsproxy.io/?url=' + encodeURIComponent(url); },
    function (url) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url); }
  ];

  var BPS_VERVAR_TO_PROV = {
    1100: 'ACEH', 1200: 'SUMATERA UTARA', 1300: 'SUMATERA BARAT',
    1400: 'RIAU', 1500: 'JAMBI', 1600: 'SUMATERA SELATAN',
    1700: 'BENGKULU', 1800: 'LAMPUNG', 1900: 'KEPULAUAN BANGKA BELITUNG',
    2100: 'KEPULAUAN RIAU', 3100: 'DKI JAKARTA', 3200: 'JAWA BARAT',
    3300: 'JAWA TENGAH', 3400: 'DI YOGYAKARTA', 3500: 'JAWA TIMUR',
    3600: 'BANTEN', 5100: 'BALI', 5200: 'NUSA TENGGARA BARAT',
    5300: 'NUSA TENGGARA TIMUR', 6100: 'KALIMANTAN BARAT',
    6200: 'KALIMANTAN TENGAH', 6300: 'KALIMANTAN SELATAN',
    6400: 'KALIMANTAN TIMUR', 6500: 'KALIMANTAN UTARA',
    7100: 'SULAWESI UTARA', 7200: 'SULAWESI TENGAH', 7300: 'SULAWESI SELATAN',
    7400: 'SULAWESI TENGGARA', 7500: 'GORONTALO', 7600: 'SULAWESI BARAT',
    8100: 'MALUKU', 8200: 'MALUKU UTARA', 9100: 'PAPUA BARAT',
    9200: 'PAPUA BARAT DAYA', 9400: 'PAPUA', 9500: 'PAPUA SELATAN',
    9600: 'PAPUA TENGAH', 9700: 'PAPUA PEGUNUNGAN', 9999: 'INDONESIA'
  };

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
  var inflasiCache = null;
  var sebaranPasarLayer = null;

  function $(id) { return document.getElementById(id); }

  var MONTH_LABELS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  function fetchBpsWithProxy(url) {
    // Web API BPS already allows CORS. Direct access is more reliable than
    // public proxies, which can be blocked or temporarily unavailable.
    var urls = [url].concat(PROXY_LIST.map(function (makeProxy) { return makeProxy(url); }));
    var tryFetch = function (idx) {
      if (idx >= urls.length) return Promise.reject(new Error('Semua sumber BPS gagal'));
      return fetch(urls[idx], { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r; })
        .catch(function () { return tryFetch(idx + 1); });
    };
    return tryFetch(0)
      .then(function (resp) { if (!resp.ok) throw new Error('HTTP ' + resp.status); return resp.json(); });
  }

  /* ── Fetch Inflasi BPS (2 years: 2025 + 2026) ── */
  function fetchInflasiData() {
    if (inflasiCache) return Promise.resolve(inflasiCache);
    return Promise.all([
      fetchBpsWithProxy(BPS_INFLASI_URL_125).catch(function (err) { console.warn('[Geopangan] Inflasi BPS 2025 gagal:', err); return null; }),
      fetchBpsWithProxy(BPS_INFLASI_URL_126).catch(function (err) { console.warn('[Geopangan] Inflasi BPS 2026 gagal:', err); return null; }),
      fetchBpsWithProxy(BPS_INFLASI_BULANAN_URL_125).catch(function (err) { console.warn('[Geopangan] Inflasi bulanan BPS 2025 gagal:', err); return null; }),
      fetchBpsWithProxy(BPS_INFLASI_BULANAN_URL_126).catch(function (err) { console.warn('[Geopangan] Inflasi bulanan BPS 2026 gagal:', err); return null; })
    ]).then(function (results) {
      var all = [], allBulanan = [];
      results.forEach(function (json, resultIndex) {
        if (!json || json.status !== 'OK' || !json.datacontent || !json.var || !json.tahun || !json.turtahun || !json.vervar) return;
        var dc = json.datacontent;
        var varId = json.var[0] && json.var[0].val;
        var turvarId = json.turvar && json.turvar[0] ? json.turvar[0].val : '0';
        // BPS mengirim `tahun` sebagai array, walaupun filter API hanya
        // menghasilkan satu tahun per respons.
        var yearMeta = Array.isArray(json.tahun) ? json.tahun[0] : json.tahun;
        var yearId = yearMeta && yearMeta.val;
        var yearNum = parseInt(yearMeta && yearMeta.label, 10);
        if (varId === undefined || yearId === undefined || !yearNum) return;

        // `datacontent` has no delimiters. Build its key from the BPS metadata
        // (vervar + var + turvar + tahun + turtahun) instead of slicing it at
        // assumed character positions.
        json.vervar.forEach(function (vervar) {
          var provName = BPS_VERVAR_TO_PROV[vervar.val];
          if (!provName) return;
          json.turtahun.forEach(function (turtahun) {
            var month = parseInt(turtahun.val, 10);
            if (month < 1 || month > 12) return; // Ignore the annual aggregate (13).
            var key = String(vervar.val) + String(varId) + String(turvarId) + String(yearId) + String(turtahun.val);
            var value = Number(dc[key]);
            if (!isFinite(value)) return;
            (resultIndex >= 2 ? allBulanan : all).push({ provKey: normalize(provName), year: yearNum, month: month, val: value });
          });
        });
      });
      function buildInflasiMap(entries) {
        entries.sort(function (a, b) { return a.year - b.year || a.month - b.month; });
        var latest = {}, monthly = {};
        entries.forEach(function (e) {
          if (!monthly[e.provKey]) monthly[e.provKey] = [];
          monthly[e.provKey].push({ label: MONTH_LABELS[e.month] + ' ' + String(e.year).slice(2), val: e.val });
          var cur = latest[e.provKey];
          if (!cur || e.year > cur.year || (e.year === cur.year && e.month > cur.month)) {
            latest[e.provKey] = { month: e.month, year: e.year, val: e.val };
          }
        });
        return { latest: latest, monthly: monthly };
      }
      var annual = buildInflasiMap(all);
      var bulanan = buildInflasiMap(allBulanan);
      var result = { latest: annual.latest, monthly: annual.monthly, latestBulanan: bulanan.latest, monthlyBulanan: bulanan.monthly };
      // Jangan cache kegagalan sementara. Dengan begitu tombol "Tampilkan"
      // dapat mencoba lagi apabila API BPS/proxy sempat tidak tersedia.
      if (all.length || allBulanan.length) inflasiCache = result;
      else console.warn('[Geopangan] Respons BPS tidak menghasilkan data inflasi yang dapat dipetakan.');
      return result;
    }).catch(function () { return { latest: {}, monthly: {} }; });
  }

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

    var query = params.toString();
    var json = await fetchWithProxy(BI_API_RAW + '/GetGridDataKomoditas?' + query);
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

  /* ── Dynamic Table: Harga Pangan Per Provinsi ── */
  var _gpTableState = { sortKey: 'price', sortDir: 'desc', page: 1, search: '', rows: [], last7Labels: [] };

  function renderGeopanganTable(data, priceMap, dailyMap, dateLabels, latestDate) {
    var container = $('geopanganTable');
    if (!container) return;

    var rows = [];
    data.filter(function (r) { return r.level === 1; }).forEach(function (r) {
      var key = normalize(r.name);
      var price = priceMap[key];
      if (price === null || price === undefined) return;
      var daily = dailyMap[key] || [];
      var last7 = daily.slice(-7);
      var trend = 'stable';
      if (last7.length >= 2) {
        var a = last7[last7.length - 2], b = last7[last7.length - 1];
        if (a !== null && b !== null) {
          if (b > a) trend = 'up';
          else if (b < a) trend = 'down';
        }
      }
      rows.push({ name: r.name, price: price, daily7: last7, trend: trend });
    });

    _gpTableState.rows = rows;
    _gpTableState.page = 1;
    _gpTableState.search = '';
    _gpTableState.sortKey = 'price';
    _gpTableState.sortDir = 'desc';
    _gpTableState.last7Labels = dateLabels.slice(-7);

    var last7Labels = dateLabels.slice(-7);

    container.innerHTML =
      '<div class="gp-table-wrap">' +
        '<div class="gp-table-title">Harga Pangan Per Provinsi</div>' +
        '<div class="gp-table-header">' +
          '<div class="gp-table-actions">' +
            '<input type="text" id="gpTableSearch" class="gp-table-search" placeholder="Cari provinsi..." autocomplete="off" />' +
            '<button id="gpExportCsv" class="gp-btn-csv" title="Export CSV"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> CSV</button>' +
          '</div>' +
        '</div>' +
        '<div class="gp-table-scroll">' +
          '<table class="gp-table">' +
            '<thead><tr>' +
              '<th class="gp-th-no" data-sort="no">No</th>' +
              '<th class="gp-th-prov" data-sort="name">Provinsi <span class="gp-sort-icon"></span></th>' +
              '<th class="gp-th-price" data-sort="price">Harga (Rp) <span class="gp-sort-icon"></span></th>' +
              last7Labels.map(function (l) { return '<th class="gp-th-day">' + l + '</th>'; }).join('') +
              '<th class="gp-th-trend">Tren</th>' +
            '</tr></thead>' +
            '<tbody id="gpTableBody"></tbody>' +
          '</table>' +
        '</div>' +
        '<div id="gpTablePagination" class="gp-pagination"></div>' +
      '</div>';

    container.querySelector('#gpTableSearch').addEventListener('input', function (e) {
      _gpTableState.search = e.target.value.toLowerCase();
      _gpTableState.page = 1;
      renderGpTableBody(_gpTableState.last7Labels);
      renderGpPagination();
    });

    var csvBtn = container.querySelector('#gpExportCsv');
    if (csvBtn) csvBtn.addEventListener('click', exportGeopanganCSV);

    var ths = container.querySelectorAll('th[data-sort]');
    for (var t = 0; t < ths.length; t++) {
      ths[t].addEventListener('click', function () {
        var key = this.getAttribute('data-sort');
        if (key === 'no') return;
        if (_gpTableState.sortKey === key) {
          _gpTableState.sortDir = _gpTableState.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          _gpTableState.sortKey = key;
          _gpTableState.sortDir = key === 'name' ? 'asc' : 'desc';
        }
        _gpTableState.page = 1;
        renderGpTableBody(_gpTableState.last7Labels);
        renderGpPagination();
        updateGpSortIcons();
      });
    }

    renderGpTableBody(last7Labels);
    renderGpPagination();
    updateGpSortIcons();
  }

  function getFilteredSortedGpRows() {
    var s = _gpTableState;
    var rows = s.rows;
    if (s.search) {
      rows = rows.filter(function (r) { return r.name.toLowerCase().indexOf(s.search) !== -1; });
    }
    var key = s.sortKey;
    var dir = s.sortDir === 'asc' ? 1 : -1;
    rows = rows.slice().sort(function (a, b) {
      if (key === 'name') return a.name.localeCompare(b.name) * dir;
      if (key === 'price') return (a.price - b.price) * dir;
      return 0;
    });
    return rows;
  }

  function renderGpTableBody(last7Labels) {
    var tbody = $('gpTableBody');
    if (!tbody) return;
    var filtered = getFilteredSortedGpRows();
    var perPage = 10;
    var start = (_gpTableState.page - 1) * perPage;
    var end = Math.min(start + perPage, filtered.length);
    var rows = '';
    for (var i = start; i < end; i++) {
      var d = filtered[i];
      var trendSvg = d.trend === 'up'
        ? '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 10 8 6 12 10"/></svg>'
        : d.trend === 'down'
        ? '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 6 8 10 12 6"/></svg>'
        : '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="8" x2="12" y2="8"/></svg>';
      var trendClass = 'gp-trend-' + d.trend;
      var cells = d.daily7.map(function (v) {
        return '<td class="gp-td-price">' + (v !== null ? 'Rp ' + v.toLocaleString('id-ID') : '-') + '</td>';
      }).join('');
      rows += '<tr>' +
        '<td class="gp-td-no">' + (i + 1) + '</td>' +
        '<td class="gp-td-name">' + d.name + '</td>' +
        '<td class="gp-td-price gp-td-price-main">Rp ' + d.price.toLocaleString('id-ID') + '</td>' +
        cells +
        '<td class="gp-td-trend ' + trendClass + '">' + trendSvg + '</td>' +
      '</tr>';
    }
    if (filtered.length === 0) {
      rows = '<tr><td colspan="' + (3 + 7 + 1) + '" class="gp-td-empty">Tidak ada data</td></tr>';
    }
    tbody.innerHTML = rows;
  }

  function renderGpPagination() {
    var pag = $('gpTablePagination');
    if (!pag) return;
    var filtered = getFilteredSortedGpRows();
    var totalPages = Math.ceil(filtered.length / 10);
    if (totalPages <= 1) { pag.innerHTML = ''; return; }
    var cp = _gpTableState.page;
    var html = '<button class="gp-page-btn" data-page="prev">&laquo;</button>';
    for (var i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - cp) <= 2) {
        html += '<button class="gp-page-btn' + (i === cp ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
      } else if (Math.abs(i - cp) === 3) {
        html += '<span class="gp-page-dots">...</span>';
      }
    }
    html += '<button class="gp-page-btn" data-page="next">&raquo;</button>';
    pag.innerHTML = html;

    var btns = pag.querySelectorAll('.gp-page-btn');
    for (var b = 0; b < btns.length; b++) {
      btns[b].addEventListener('click', function () {
        var pg = this.getAttribute('data-page');
        if (pg === 'prev') _gpTableState.page = Math.max(1, _gpTableState.page - 1);
        else if (pg === 'next') _gpTableState.page++;
        else _gpTableState.page = parseInt(pg);
        renderGpTableBody(_gpTableState.last7Labels);
        renderGpPagination();
      });
    }
  }

  function updateGpSortIcons() {
    var icons = document.querySelectorAll('.gp-table th[data-sort] .gp-sort-icon');
    for (var i = 0; i < icons.length; i++) {
      var th = icons[i].parentElement;
      var key = th.getAttribute('data-sort');
      if (key === _gpTableState.sortKey) {
        icons[i].textContent = _gpTableState.sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
      } else {
        icons[i].textContent = '';
      }
    }
  }

  function exportGeopanganCSV() {
    var rows = getFilteredSortedGpRows();
    if (!rows.length) return;

    var trendMap = { up: 'Naik', down: 'Turun', stable: 'Stabil' };
    var labels = _gpTableState.last7Labels;
    var headers = ['No', 'Provinsi', 'Harga (Rp)'].concat(labels).concat(['Tren']);
    var lines = [headers.join(',')];

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var daily = r.daily7.map(function (v) { return v !== null ? v : ''; });
      var trend = trendMap[r.trend] || r.trend;
      var cells = [i + 1, '"' + r.name.replace(/"/g, '""') + '"', r.price]
        .concat(daily)
        .concat([trend]);
      lines.push(cells.join(','));
    }

    var blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);

    var commodityEl = $('geopanganCommodity');
    var commodityName = commodityEl && commodityEl.selectedOptions[0] ? commodityEl.selectedOptions[0].textContent : 'all';
    var today = new Date();
    var dd = String(today.getDate()).padStart(2, '0');
    var mm = String(today.getMonth() + 1).padStart(2, '0');
    var yyyy = today.getFullYear();
    var filename = 'harga_pangan_' + commodityName.toLowerCase().replace(/\s+/g, '_') + '_' + yyyy + '-' + mm + '-' + dd + '.csv';

    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Main: load and display ── */
  async function loadAndDisplay() {
    var resultEl = $('geopanganResult');
    var loadBtn = $('geopanganLoadBtn');
    if (loadBtn) loadBtn.disabled = true;
    if (resultEl) resultEl.innerHTML = '<div class="geopangan-loading"><div class="geopangan-spinner"></div><span>Memuat data harga...</span></div>';

    try {
      var results = await Promise.all([fetchPriceData(), loadGeoJSON(), fetchInflasiData()]);
      var data = results[0];
      var geojson = results[1];
      var inflasiResult = results[2] || {};
      var inflasiLatest = inflasiResult.latest || {};
      var inflasiMonthly = inflasiResult.monthly || {};
      var inflasiBulananLatest = inflasiResult.latestBulanan || {};
      var inflasiBulananMonthly = inflasiResult.monthlyBulanan || {};

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
          var svgInflasi = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>';

          var inflasiEntry = inflasiLatest[normalize(provName)];
          var inflasiVal = inflasiEntry ? inflasiEntry.val : null;
          var inflasiFormatted = inflasiVal !== null ? inflasiVal.toFixed(2).replace('.', ',') + '%' : '-';
          var inflasiMonthLabel = inflasiEntry ? MONTH_LABELS[inflasiEntry.month] + ' ' + String(inflasiEntry.year).slice(2) : '';
          var inflasiBulananEntry = inflasiBulananLatest[normalize(provName)];
          var inflasiBulananVal = inflasiBulananEntry ? inflasiBulananEntry.val : null;
          var inflasiBulananFormatted = inflasiBulananVal !== null ? inflasiBulananVal.toFixed(2).replace('.', ',') + '%' : '-';
          var inflasiBulananMonthLabel = inflasiBulananEntry ? MONTH_LABELS[inflasiBulananEntry.month] + ' ' + String(inflasiBulananEntry.year).slice(2) : '';

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
                  '<div class="gp-popup-meta-row">' +
                    '<div class="gp-popup-meta-icon">' + svgInflasi + '</div>' +
                    '<div class="gp-popup-meta-text">' +
                      '<span class="gp-popup-meta-label">Inflasi BPS (Y-on-Y)</span>' +
                      '<span class="gp-popup-meta-value">' + inflasiFormatted + (inflasiMonthLabel ? ' <small>(' + inflasiMonthLabel + ')</small>' : '') + '</span>' +
                    '</div>' +
                  '</div>' +
                  '<div class="gp-popup-meta-row">' +
                    '<div class="gp-popup-meta-icon">' + svgInflasi + '</div>' +
                    '<div class="gp-popup-meta-text">' +
                      '<span class="gp-popup-meta-label">Inflasi BPS (M-to-M)</span>' +
                      '<span class="gp-popup-meta-value">' + inflasiBulananFormatted + (inflasiBulananMonthLabel ? ' <small>(' + inflasiBulananMonthLabel + ')</small>' : '') + '</span>' +
                    '</div>' +
                  '</div>' +
                '</div>' +
                '<div class="gp-popup-chart">' +
                  '<div class="gp-popup-chart-head">' + svgChart + '<span>Harga 7 Hari Terakhir</span></div>' +
                  '<div class="gp-popup-chart-wrap"><canvas id="gp-chart-' + provCode + '"></canvas></div>' +
                '</div>' +
                '<div class="gp-popup-chart gp-popup-chart--inflasi">' +
                  '<div class="gp-popup-chart-head">' + svgInflasi + '<span>Tren Inflasi Y-on-Y</span></div>' +
                  '<div class="gp-popup-chart-wrap"><canvas id="gp-inflasi-chart-' + provCode + '"></canvas></div>' +
                '</div>' +
                '<div class="gp-popup-chart gp-popup-chart--inflasi">' +
                  '<div class="gp-popup-chart-head">' + svgInflasi + '<span>Tren Inflasi M-to-M</span></div>' +
                  '<div class="gp-popup-chart-wrap"><canvas id="gp-inflasi-bulanan-chart-' + provCode + '"></canvas></div>' +
                '</div>' +
              '</div>' +
            '</div>';

          layer.bindPopup(popupHtml, { maxWidth: 320, className: 'gp-leaflet-popup' });

          layer.on('popupopen', function () {
            var canvas = document.getElementById('gp-chart-' + provCode);
            if (canvas && daily.length) {
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
            }

            var infCanvas = document.getElementById('gp-inflasi-chart-' + provCode);
            var infMonthly = inflasiMonthly[provKey] || [];
            if (infCanvas && infMonthly.length > 1) {
              var infCtx = infCanvas.getContext('2d');
              if (infCanvas._chartInstance) infCanvas._chartInstance.destroy();
              var infLabels = infMonthly.map(function (e) { return e.label; });
              var infValues = infMonthly.map(function (e) { return e.val; });
              infCanvas._chartInstance = new Chart(infCtx, {
                type: 'line',
                data: {
                  labels: infLabels,
                  datasets: [{
                    data: infValues,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245,158,11,0.10)',
                    fill: true,
                    tension: 0.35,
                    pointRadius: 3,
                    pointBackgroundColor: '#f59e0b',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5,
                    borderWidth: 2
                  }]
                },
                options: {
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false }, tooltip: { enabled: true, callbacks: { label: function (c) { return c.parsed.y.toFixed(2).replace('.', ',') + '%'; } } } },
                  scales: {
                    x: { display: true, grid: { display: false }, ticks: { font: { size: 8, family: 'Inter, sans-serif' }, color: '#6b7280', maxRotation: 45 } },
                    y: { display: true, grid: { color: '#fef3c7' }, ticks: { font: { size: 8, family: 'Inter, sans-serif' }, color: '#6b7280', callback: function (v) { return v.toFixed(1) + '%'; } } }
                  }
                }
              });
            }

            var infBulananCanvas = document.getElementById('gp-inflasi-bulanan-chart-' + provCode);
            var infBulananMonthly = inflasiBulananMonthly[provKey] || [];
            if (infBulananCanvas && infBulananMonthly.length > 1) {
              var infBulananCtx = infBulananCanvas.getContext('2d');
              if (infBulananCanvas._chartInstance) infBulananCanvas._chartInstance.destroy();
              infBulananCanvas._chartInstance = new Chart(infBulananCtx, {
                type: 'line',
                data: {
                  labels: infBulananMonthly.map(function (e) { return e.label; }),
                  datasets: [{ data: infBulananMonthly.map(function (e) { return e.val; }), borderColor: '#0ea5e9', backgroundColor: 'rgba(14,165,233,0.10)', fill: true, tension: 0.35, pointRadius: 3, pointBackgroundColor: '#0ea5e9', pointBorderColor: '#fff', pointBorderWidth: 1.5, borderWidth: 2 }]
                },
                options: {
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { display: false }, tooltip: { enabled: true, callbacks: { label: function (c) { return c.parsed.y.toFixed(2).replace('.', ',') + '%'; } } } },
                  scales: {
                    x: { display: true, grid: { display: false }, ticks: { font: { size: 8, family: 'Inter, sans-serif' }, color: '#6b7280', maxRotation: 45 } },
                    y: { display: true, grid: { color: '#e0f2fe' }, ticks: { font: { size: 8, family: 'Inter, sans-serif' }, color: '#6b7280', callback: function (v) { return v.toFixed(1) + '%'; } } }
                  }
                }
              });
            }
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

      renderGeopanganTable(data, priceMap, dailyMap, dateLabels, latestDate);

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
  };

  /* ── Public cleanup (called by reset layers) ── */
  window.clearGeopanganLayers = function () {
    if (activeLayer && map.hasLayer(activeLayer)) { map.removeLayer(activeLayer); activeLayer = null; }
    if (activeLegend) { map.removeControl(activeLegend); activeLegend = null; }
    if (sebaranPasarLayer && map.hasLayer(sebaranPasarLayer)) { map.removeLayer(sebaranPasarLayer); sebaranPasarLayer = null; }
    var chk = $('toggleSebaranPasar');
    if (chk) chk.checked = false;
    var resultEl = $('geopanganResult');
    if (resultEl) resultEl.innerHTML = '';
    var tableEl = $('geopanganTable');
    if (tableEl) tableEl.innerHTML = '';
  };

  /* ── Sebaran Pasar Layer (BAPPENAS / Kementerian Perdagangan) ── */
  var SEBARAN_PASAR_URL = 'https://geospasial.bappenas.go.id/server/rest/services/TRPPB_Sebaran_Pasar_kemendag/MapServer/0';

  function toggleSebaranPasar(visible) {
    if (!visible) {
      if (sebaranPasarLayer && map.hasLayer(sebaranPasarLayer)) {
        map.removeLayer(sebaranPasarLayer);
      }
      return;
    }
    if (sebaranPasarLayer) { sebaranPasarLayer.addTo(map); return; }
    sebaranPasarLayer = L.esri.featureLayer({
      url: SEBARAN_PASAR_URL,
      pointToLayer: function (geojson, latlng) {
        return L.circleMarker(latlng, {
          radius: 5,
          fillColor: '#e67e22',
          color: '#d35400',
          weight: 1,
          opacity: 1,
          fillOpacity: 0.85
        });
      },
      onEachFeature: function (feature, layer) {
        var p = feature.properties || {};
        var name = p.NAMA_PASAR || p.nama_pasar || '-';
        var jenis = p.JENIS_PASAR || p.jenis_pasar || '-';
        var kabkota = p.NAMA_KOTA || p.nama_kota || p.NAMA_KAB || p.nama_kab || '-';
        var provinsi = p.NAMA_PROP || p.nama_prop || '-';
        layer.bindPopup(
          '<div style="font-size:12px;line-height:1.6">' +
            '<strong style="color:#d35400">' + name + '</strong><br>' +
            'Jenis: ' + jenis + '<br>' +
            'Kab/Kota: ' + kabkota + '<br>' +
            'Provinsi: ' + provinsi +
          '</div>'
        );
      }
    }).addTo(map);
  }

  /* ── Init on first load if already on tab ── */
  async function init() {
    await Promise.all([loadCommodities(), populateProvinces()]);
    setDefaultDates();
  }

  /* ── Event listeners ── */
  document.addEventListener('DOMContentLoaded', function () {
    var loadBtn = $('geopanganLoadBtn');
    if (loadBtn) loadBtn.addEventListener('click', loadAndDisplay);
    var chkPasar = $('toggleSebaranPasar');
    if (chkPasar) chkPasar.addEventListener('change', function () { toggleSebaranPasar(this.checked); });
    if (window.currentActiveTab === 'tab-geopangan') init();
  });

})();
