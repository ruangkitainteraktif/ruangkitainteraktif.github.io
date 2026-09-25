(function () {
  'use strict';

  var VARIANT_URL = 'https://api-sp2kp.kemendag.go.id/master/api/variant?take=1000000&is_active=true&sort=%5B%7B%22selector%22%3A%22nama%22%2C%22desc%22%3Afalse%7D%5D';
  var AVERAGE_PRICE_URL = 'https://api-sp2kp.kemendag.go.id/report/api/average-price/hnt-disparity';
  var HISTORY_URL = 'https://api-sp2kp.kemendag.go.id/report/api/hnt/history-series';
  var PROXY_PREFIX = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';
  var PROVINCE_GEOJSON = 'assets/data/bps/geojson/provinsi.geojson';

  var variantData = [];
  var variantPromise = null;
  var provinceGeoJson = null;
  var activeLayer = null;
  var historyChart = null;
  var hntChart = null;

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(message, isError) {
    var element = $('sp2kpStatus');
    if (!element) return;
    if (!message) {
      element.style.display = 'none';
      element.textContent = '';
      element.classList.remove('sp2kp-status--error');
      return;
    }
    element.style.display = '';
    element.textContent = message;
    element.classList.toggle('sp2kp-status--error', !!isError);
  }

  function setBusy(busy) {
    var ids = ['sp2kpVariantSelect', 'sp2kpLatestDate', 'sp2kpLoadBtn'];
    ids.forEach(function (id) {
      var element = $(id);
      if (element) element.disabled = busy;
    });
  }

  function setHistoryBusy(busy) {
    var ids = ['sp2kpHistoryStart', 'sp2kpHistoryEnd', 'sp2kpHistoryLoadBtn'];
    ids.forEach(function (id) {
      var element = $(id);
      if (element) element.disabled = busy;
    });
  }

  function setHistoryStatus(message, isError) {
    var element = $('sp2kpHistoryStatus');
    if (!element) return;
    if (!message) {
      element.style.display = 'none';
      element.textContent = '';
      element.classList.remove('sp2kp-status--error');
      return;
    }
    element.style.display = '';
    element.textContent = message;
    element.classList.toggle('sp2kp-status--error', !!isError);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function fetchWithProxy(url) {
    return fetch(url).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).catch(function () {
      return fetch(PROXY_PREFIX + encodeURIComponent(url)).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status + ' (proxy)');
        return response.json();
      });
    });
  }

  function normalizeCode(value) {
    var code = String(value == null ? '' : value).replace(/\D/g, '');
    if (!code) return '';
    return code.padStart(2, '0');
  }

  function loadVariants() {
    if (variantPromise) return variantPromise;
    setStatus('Memuat katalog variant SP2KP…');
    variantPromise = fetchWithProxy(VARIANT_URL).then(function (json) {
      var items = json && Array.isArray(json.data) ? json.data : [];
      if (!items.length) throw new Error('Katalog variant SP2KP kosong.');
      variantData = items;
      populateVariants(items);
      setStatus(items.length + ' variant SP2KP siap. Pilih variant dan tanggal.');
      return items;
    }).catch(function (error) {
      variantPromise = null;
      setStatus('Gagal memuat variant: ' + (error && error.message ? error.message : String(error)), true);
      throw error;
    });
    return variantPromise;
  }

  function populateVariants(items) {
    var select = $('sp2kpVariantSelect');
    if (!select) return;
    select.innerHTML = '';
    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Pilih variant SP2KP…';
    select.appendChild(placeholder);
    var groups = {};
    items.forEach(function (item) {
      var type = item.tipe_komoditas && item.tipe_komoditas.nama || 'Tanpa tipe';
      var commodity = item.komoditas && item.komoditas.nama || 'Tanpa komoditas';
      var key = type + ' — ' + commodity;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    Object.keys(groups).sort().forEach(function (groupName) {
      var group = document.createElement('optgroup');
      group.label = groupName;
      groups[groupName].sort(function (a, b) {
        return String(a.nama || '').localeCompare(String(b.nama || ''));
      }).forEach(function (item) {
        var option = document.createElement('option');
        option.value = String(item.id);
        option.textContent = String(item.nama || 'Variant ' + item.id);
        group.appendChild(option);
      });
      select.appendChild(group);
    });
  }

  function setDefaultDates() {
    var end = new Date(Date.now() - 86400000);
    var start = new Date(end.getTime() - 29 * 86400000);
    var endText = end.toISOString().slice(0, 10);
    var startText = start.toISOString().slice(0, 10);
    if ($('sp2kpLatestDate')) $('sp2kpLatestDate').value = endText;
    if ($('sp2kpHistoryEnd')) $('sp2kpHistoryEnd').value = endText;
    if ($('sp2kpHistoryStart')) $('sp2kpHistoryStart').value = startText;
  }

  function loadProvinces() {
    if (provinceGeoJson) return Promise.resolve(provinceGeoJson);
    return fetch(PROVINCE_GEOJSON).then(function (response) {
      if (!response.ok) throw new Error('GeoJSON provinsi gagal dimuat.');
      return response.json();
    }).then(function (data) {
      provinceGeoJson = data;
      return data;
    });
  }

  function getSelectedVariant() {
    var id = $('sp2kpVariantSelect') ? $('sp2kpVariantSelect').value : '';
    return variantData.find(function (item) { return String(item.id) === String(id); }) || null;
  }

  function averageItemsByProvince(payload) {
    var items = payload && payload.data && Array.isArray(payload.data.items) ? payload.data.items : [];
    var result = {};
    items.forEach(function (item) {
      var code = normalizeCode(item.kode_provinsi);
      if (code && !result[code]) result[code] = item;
    });
    return result;
  }

  function numericValue(value) {
    if (value == null || String(value).trim() === '') return null;
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function colorForDisparity(value, min, max) {
    if (value === null || value === undefined) return '#d8e0e7';
    if (max === min) return '#22c55e';
    var extent = Math.max(Math.abs(min), Math.abs(max), 1);
    var ratio = Math.max(0, Math.min(1, (value + extent) / (extent * 2)));
    if (ratio < 0.5) {
      var t = ratio * 2;
      return 'rgb(' + Math.round(37 + (34 - 37) * t) + ',' + Math.round(99 + (197 - 99) * t) + ',' + Math.round(235 + (94 - 235) * t) + ')';
    }
    var u = (ratio - 0.5) * 2;
    return 'rgb(' + Math.round(34 + (220 - 34) * u) + ',' + Math.round(197 + (38 - 197) * u) + ',' + Math.round(94 + (38 - 94) * u) + ')';
  }

  function addLegend(variantName, min, max, nationalHnt) {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('sp2kp');
    if (typeof addUnifiedLegend !== 'function') return;
    var legend = L.DomUtil.create('div', 'gp-legend');
    L.DomEvent.disableClickPropagation(legend);
    var minText = (min > 0 ? '+' : '') + min.toFixed(2) + '%';
    var maxText = (max > 0 ? '+' : '') + max.toFixed(2) + '%';
    var nationalText = nationalHnt == null ? '-' : 'Rp ' + nationalHnt.toLocaleString('id-ID');
    legend.innerHTML = '<div class="gp-legend-header"><div class="gp-legend-badge">SP2KP</div><div class="gp-legend-info-row"><span>' + escapeHtml(variantName) + '</span></div></div><div class="gp-legend-body"><div class="gp-legend-bar"><span style="background:#2563eb"></span><span style="background:#22c55e"></span><span style="background:#facc15"></span><span style="background:#ef6b3b"></span><span style="background:#dc2626"></span></div><div class="gp-legend-labels"><span class="gp-legend-label-min">' + minText + '</span><span class="gp-legend-label-max">' + maxText + '</span></div><div class="gp-legend-unit">Disparitas terhadap HNT nasional • HNT nasional: ' + nationalText + '</div></div>';
    addUnifiedLegend('sp2kp', legend);
  }

  function clearLayer() {
    if (activeLayer && window.map) window.map.removeLayer(activeLayer);
    activeLayer = null;
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('sp2kp');
  }

  function renderLatest(geojson, byProvince, variant, nationalHnt) {
    clearLayer();
    var values = Object.keys(byProvince).map(function (code) {
      return numericValue(byProvince[code].disparitas_pct);
    }).filter(function (value) { return value !== null; });
    if (!values.length) throw new Error('Tidak ada disparity HNT provinsi pada tanggal tersebut.');
    var min = Math.min.apply(Math, values);
    var max = Math.max.apply(Math, values);
    var dataByCode = {};
    Object.keys(byProvince).forEach(function (code) {
      var item = byProvince[code];
      var disparity = numericValue(item.disparitas_pct);
      if (disparity !== null) dataByCode[code] = { price: numericValue(item.harga), disparity: disparity, item: item };
    });
    if (window.clearGeopanganLayers) window.clearGeopanganLayers();
    if (!window.map) throw new Error('Peta belum siap.');
    activeLayer = L.geoJSON(geojson, {
      style: function (feature) {
        var code = normalizeCode(feature.properties && (feature.properties.kdprov || feature.properties.kdprovinsi));
        var disparity = dataByCode[code] ? dataByCode[code].disparity : null;
        return { fillColor: colorForDisparity(disparity, min, max), color: '#ffffff', weight: 1, opacity: 1, fillOpacity: 0.78 };
      },
      onEachFeature: function (feature, layer) {
        var code = normalizeCode(feature.properties && (feature.properties.kdprov || feature.properties.kdprovinsi));
        var entry = dataByCode[code];
        var item = entry ? entry.item : {};
        var name = item.nama_provinsi || feature.properties.nmprov || feature.properties.name || 'Provinsi';
        var price = entry ? entry.price : null;
        var disparity = entry ? entry.disparity : null;
        var nationalText = nationalHnt == null ? '-' : 'Rp ' + nationalHnt.toLocaleString('id-ID');
        var html = '<div class="gp-popup"><div class="gp-popup-head"><div class="gp-popup-badge"><span class="gp-popup-badge-dot"></span>SP2KP</div><strong>' + escapeHtml(name) + '</strong><span>' + escapeHtml(variant.nama || 'Variant') + '</span></div><div class="gp-popup-body"><div class="gp-popup-price"><div class="gp-popup-price-info"><span class="gp-popup-price-label">Harga HNT provinsi</span><span class="gp-popup-price-value">' + (price === null ? '-' : 'Rp ' + price.toLocaleString('id-ID')) + '</span></div></div><div class="gp-popup-meta"><div class="gp-popup-meta-row"><div class="gp-popup-meta-text"><span class="gp-popup-meta-label">HNT nasional</span><span class="gp-popup-meta-value">' + nationalText + '</span></div></div><div class="gp-popup-meta-row"><div class="gp-popup-meta-text"><span class="gp-popup-meta-label">Disparitas terhadap HNT</span><span class="gp-popup-meta-value">' + (disparity === null ? '-' : disparity.toFixed(2) + '%') + '</span></div></div></div></div></div>';
        layer.bindPopup(html, { maxWidth: 320, className: 'gp-leaflet-popup' });
      }
    }).addTo(window.map);
    window.map.fitBounds(activeLayer.getBounds().pad(0.05));
    addLegend(variant.nama || 'Variant SP2KP', min, max, nationalHnt);
    renderTable(byProvince, variant);
    renderHntChart(byProvince, variant);
  }

  function renderHntChart(byProvince, variant) {
    var card = $('sp2kpHntChartCard');
    var canvas = $('sp2kpHntChart');
    var subtitle = $('sp2kpHntChartSubtitle');
    if (!card || !canvas) return;
    if (hntChart) {
      hntChart.destroy();
      hntChart = null;
    }
    var entries = Object.keys(byProvince).map(function (code) {
      var item = byProvince[code];
      return {
        code: code,
        name: item.nama_provinsi || 'Provinsi ' + code,
        price: numericValue(item.harga)
      };
    }).filter(function (entry) { return entry.price !== null; }).sort(function (a, b) {
      if (b.price !== a.price) return b.price - a.price;
      return a.name.localeCompare(b.name, 'id-ID');
    }).slice(0, 10);
    if (!entries.length || typeof Chart === 'undefined') {
      card.style.display = 'none';
      return;
    }
    if (subtitle) subtitle.textContent = (variant.nama || 'SP2KP') + ' • 10 provinsi dengan HNT tertinggi';
    card.style.display = 'block';
    hntChart = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: entries.map(function (entry) { return entry.name; }),
        datasets: [{
          label: 'Harga HNT',
          data: entries.map(function (entry) { return entry.price; }),
          backgroundColor: 'rgba(22,163,74,.82)',
          borderColor: '#15803d',
          borderWidth: 1,
          borderRadius: 4,
          barThickness: 16
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (context) {
                return 'HNT: Rp ' + Number(context.raw).toLocaleString('id-ID');
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              font: { size: 9 },
              callback: function (value) { return 'Rp ' + Number(value).toLocaleString('id-ID'); }
            },
            grid: { color: '#edf2ef' }
          },
          y: {
            ticks: { font: { size: 9 } },
            grid: { display: false }
          }
        }
      }
    });
  }

  function renderTable(byProvince, variant) {
    var target = $('sp2kpTable');
    if (!target) return;
    var entries = Object.keys(byProvince).map(function (code) {
      var item = byProvince[code];
      return {
        code: code,
        name: item.nama_provinsi || '-',
        price: numericValue(item.harga),
        disparity: numericValue(item.disparitas_pct)
      };
    }).sort(function (a, b) {
      if (a.price === null && b.price !== null) return 1;
      if (a.price !== null && b.price === null) return -1;
      if (a.price !== null && b.price !== null && a.price !== b.price) return b.price - a.price;
      return a.name.localeCompare(b.name, 'id-ID');
    });
    var rows = entries.map(function (entry) {
      return '<tr><td>' + escapeHtml(entry.code) + '</td><td>' + escapeHtml(entry.name) + '</td><td>' + (entry.price === null ? '-' : 'Rp ' + entry.price.toLocaleString('id-ID')) + '</td><td>' + (entry.disparity === null ? '-' : entry.disparity.toFixed(2) + '%') + '</td></tr>';
    }).join('');
    target.innerHTML = '<div style="overflow:auto;margin-top:12px;"><div class="sp2kp-table-title">Harga HNT</div><div class="sp2kp-table-subtitle">' + escapeHtml(variant.nama || 'SP2KP') + '</div><table class="sp2kp-data-table"><thead><tr><th style="text-align:left;">Kode</th><th style="text-align:left;">Provinsi</th><th style="text-align:right;">Harga</th><th style="text-align:right;">Disparitas HNT</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function renderHistoryTable(history, variant) {
    var target = $('sp2kpHistoryTable');
    if (!target) return;
    if (!history.length) {
      target.innerHTML = '<div style="font-size:10px;color:#64748b;padding:10px 0;">Tidak ada data histori pada periode tersebut.</div>';
      return;
    }
    var rows = history.map(function (item) {
      var price = numericValue(item.harga);
      return '<tr><td>' + escapeHtml(item.tanggal_data || '-') + '</td><td>' + (price === null ? '-' : 'Rp ' + price.toLocaleString('id-ID')) + '</td></tr>';
    }).join('');
    target.innerHTML = '<div style="overflow:auto;margin-top:10px;"><div class="sp2kp-table-title">Perkembangan HNT Nasional</div><div class="sp2kp-table-subtitle">' + escapeHtml(variant.nama || 'SP2KP') + '</div><table class="sp2kp-history-table"><thead><tr><th style="text-align:left;">Tanggal</th><th style="text-align:right;">Harga</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function renderHistory(history) {
    var card = $('sp2kpHistoryCard');
    var canvas = $('sp2kpHistoryChart');
    if (!card || !canvas) return;
    card.style.display = 'block';
    if (historyChart) {
      historyChart.destroy();
      historyChart = null;
    }
    if (typeof Chart === 'undefined') {
      return false;
    }
    historyChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: history.map(function (item) { return item.tanggal_data; }),
        datasets: [{
          label: 'Perkembangan HNT nasional',
          data: history.map(function (item) { return numericValue(item.harga); }),
          borderColor: '#16a34a',
          backgroundColor: '#86efac55',
          fill: true,
          tension: 0.25,
          pointRadius: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { font: { size: 9 } }, grid: { display: false } },
          y: { ticks: { font: { size: 9 }, callback: function (value) { return 'Rp' + Number(value).toLocaleString('id-ID'); } }, grid: { color: '#edf2f7' } }
        }
      }
    });
    return true;
  }

  function clearHistory() {
    if (historyChart) {
      historyChart.destroy();
      historyChart = null;
    }
    var card = $('sp2kpHistoryCard');
    if (card) card.style.display = 'none';
    var table = $('sp2kpHistoryTable');
    if (table) table.innerHTML = '';
    setHistoryStatus('');
  }

  function openGeoPanganSourceTab(source) {
    var selected = source === 'sp2kp' ? 'sp2kp' : 'pihps';
    var tabs = document.querySelectorAll('[data-geopangan-source]');
    var panels = document.querySelectorAll('[data-geopangan-source-panel]');
    tabs.forEach(function (tab) {
      var active = tab.getAttribute('data-geopangan-source') === selected;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.setAttribute('tabindex', active ? '0' : '-1');
    });
    panels.forEach(function (panel) {
      var active = panel.getAttribute('data-geopangan-source-panel') === selected;
      panel.classList.toggle('active', active);
      panel.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    if (selected === 'sp2kp') {
      if (typeof window.clearGeopanganLayers === 'function') window.clearGeopanganLayers();
      loadVariants().catch(function () {});
    } else if (typeof window.geopanganAutoLoad === 'function') {
      window.geopanganAutoLoad();
    }
  }

  function bindSourceTabs() {
    var tabs = document.querySelectorAll('[data-geopangan-source]');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        openGeoPanganSourceTab(this.getAttribute('data-geopangan-source'));
      });
    });
  }

  async function loadSp2kp() {
    if (!$('sp2kpVariantSelect') || !$('sp2kpVariantSelect').value) {
      setStatus('Pilih variant SP2KP terlebih dahulu.', true);
      return;
    }
    var variant = getSelectedVariant();
    if (!variant) {
      setStatus('Variant SP2KP tidak valid.', true);
      return;
    }
    var date = $('sp2kpLatestDate') ? $('sp2kpLatestDate').value : '';
    if (!date) {
      setStatus('Pilih tanggal HNT terlebih dahulu.', true);
      return;
    }
    setBusy(true);
    setStatus('Memuat data HNT SP2KP…');
    try {
      var averageUrl = AVERAGE_PRICE_URL + '?variant_id=' + encodeURIComponent(variant.id) + '&tanggal=' + encodeURIComponent(date);
      var response = await Promise.all([fetchWithProxy(averageUrl), loadProvinces()]);
      var byProvince = averageItemsByProvince(response[0]);
      var averageData = response[0] && response[0].data || {};
      var nationalHnt = numericValue(averageData.hnt);
      renderLatest(response[1], byProvince, variant, nationalHnt);
      $('sp2kpResult').innerHTML = '<div style="font-size:10px;color:#47735b;margin-top:10px;">Sumber: SP2KP • ' + Object.keys(byProvince).length + ' provinsi • ' + date + (nationalHnt === null ? '' : ' • HNT nasional Rp ' + nationalHnt.toLocaleString('id-ID')) + '</div>';
      setStatus('Choropleth HNT SP2KP siap ditampilkan.');
    } catch (error) {
      setStatus('Gagal: ' + (error && error.message ? error.message : String(error)), true);
    } finally {
      setBusy(false);
    }
  }

  async function loadSp2kpHistory() {
    if (!$('sp2kpVariantSelect') || !$('sp2kpVariantSelect').value) {
      setHistoryStatus('Pilih variant SP2KP terlebih dahulu.', true);
      return;
    }
    var variant = getSelectedVariant();
    if (!variant) {
      setHistoryStatus('Variant SP2KP tidak valid.', true);
      return;
    }
    var start = $('sp2kpHistoryStart') ? $('sp2kpHistoryStart').value : '';
    var end = $('sp2kpHistoryEnd') ? $('sp2kpHistoryEnd').value : '';
    if (!start || !end) {
      setHistoryStatus('Lengkapi periode histori.', true);
      return;
    }
    clearHistory();
    setHistoryBusy(true);
    setHistoryStatus('Memuat histori HNT…');
    try {
      var historyUrl = HISTORY_URL + '?tanggal_start=' + encodeURIComponent(start) + '&tanggal_end=' + encodeURIComponent(end) + '&variant_id=' + encodeURIComponent(variant.id);
      var payload = await fetchWithProxy(historyUrl);
      var history = payload && Array.isArray(payload.data) ? payload.data : [];
      renderHistoryTable(history, variant);
      if (!history.length) {
        setHistoryStatus('Tidak ada data histori pada periode tersebut.', true);
        return;
      }
      var chartReady = renderHistory(history);
      setHistoryStatus(chartReady ? 'Histori HNT siap ditampilkan.' : 'Tabel histori siap; grafik tidak tersedia.', !chartReady);
    } catch (error) {
      setHistoryStatus('Gagal: ' + (error && error.message ? error.message : String(error)), true);
    } finally {
      setHistoryBusy(false);
    }
  }

  function init() {
    var button = $('sp2kpLoadBtn');
    var historyButton = $('sp2kpHistoryLoadBtn');
    var resetButton = $('sp2kpResetBtn');
    if (!button) return;
    setDefaultDates();
    bindSourceTabs();
    button.addEventListener('click', loadSp2kp);
    if (historyButton) historyButton.addEventListener('click', loadSp2kpHistory);
    if (resetButton) resetButton.addEventListener('click', function () {
      if (typeof window.clearSp2kpGeoPangan === 'function') window.clearSp2kpGeoPangan();
    });
  }

  window.openGeoPanganSourceTab = openGeoPanganSourceTab;
  window.sp2kpGeoPanganOpen = function () {
    openGeoPanganSourceTab('sp2kp');
  };
  window.clearSp2kpGeoPangan = function () {
    clearLayer();
    if (hntChart) {
      hntChart.destroy();
      hntChart = null;
    }
    var chartCard = $('sp2kpHntChartCard');
    if (chartCard) chartCard.style.display = 'none';
    clearHistory();
    var result = $('sp2kpResult');
    if (result) result.innerHTML = '';
    var table = $('sp2kpTable');
    if (table) table.innerHTML = '';
    setStatus('');
  };
  window.sp2kpGeoPanganLoad = loadSp2kp;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
