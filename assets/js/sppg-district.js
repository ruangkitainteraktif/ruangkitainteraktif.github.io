/* ── SPPG District Choropleth Layer ── */
(function () {
  'use strict';

  var API_URL = 'https://mbgwatch.org/api/backend/v2/sppgs';
  var GEOJSON_URL = 'assets/data/bps/geojson/kabupaten.geojson';
  var LOCAL_DATA_URL = 'assets/data/sppg-district-data.json';
  var LOCAL_CACHE_KEY = 'sppg-district-cache';
  var PROXY_LIST = [
    function (url) { return 'https://api.cors.lol/?url=' + encodeURIComponent(url); },
    function (url) { return 'https://proxy.killcors.com/?url=' + encodeURIComponent(url); },
    function (url) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url); }
  ];

  var layer = null;
  var legendCtrl = null;
  var apiCache = null;
  var geoCache = null;
  var aggregatedData = {};
  var tableState = { sortKey: 'no', sortDir: 'asc', page: 1, search: '', rows: [] };
  var PER_PAGE = 10;

  /* ── Helpers ── */
  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s || '-').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function normalizeDistrict(name) {
    if (!name) return '';
    var n = name.toUpperCase().trim();
    if (n.indexOf('KOTA ') === 0) n = n.substring(5);
    if (n === 'GUNUNGKIDUL') n = 'GUNUNG KIDUL';
    return n;
  }

  /* ── Color scale ── */
  function getColor(count) {
    if (!count || count === 0) return 'rgba(200,200,200,0.3)';
    if (count <= 50)  return '#fef3c7';
    if (count <= 100) return '#fbbf24';
    if (count <= 200) return '#f97316';
    if (count <= 500) return '#ef4444';
    return '#991b1b';
  }

  function getLabel(count) {
    if (!count || count === 0) return 'Tidak ada data';
    if (count <= 50)  return '1 – 50';
    if (count <= 100) return '51 – 100';
    if (count <= 200) return '101 – 200';
    if (count <= 500) return '201 – 500';
    return '> 500';
  }

  /* ── Fetch API (with CORS proxy fallback) ── */
  function fetchWithTimeout(url, timeout) {
    return new Promise(function (resolve, reject) {
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, timeout || 10000);
      fetch(url, { signal: controller.signal })
        .then(function (r) { clearTimeout(timer); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(resolve)
        .catch(reject);
    });
  }

  function fetchApiData(callback) {
    if (apiCache) { callback(apiCache); return; }
    fetchWithTimeout(API_URL, 10000)
      .then(function (data) {
        apiCache = data;
        aggregateByDistrict(data);
        try { localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(data)); } catch (e) {}
        callback(apiCache);
      })
      .catch(function () {
        var tries = PROXY_LIST.map(function (fn) { return fn(API_URL); });
        var i = 0;
        function tryNextProxy() {
          if (i >= tries.length) {
            loadFromCacheOrLocal(callback);
            return;
          }
          fetchWithTimeout(tries[i], 10000)
            .then(function (data) {
              apiCache = data;
              aggregateByDistrict(data);
              try { localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(data)); } catch (e) {}
              callback(apiCache);
            })
            .catch(function () { i++; tryNextProxy(); });
        }
        tryNextProxy();
      });
  }

  function loadFromCacheOrLocal(callback) {
    try {
      var cached = localStorage.getItem(LOCAL_CACHE_KEY);
      if (cached) {
        var data = JSON.parse(cached);
        if (Array.isArray(data) && data.length > 0) {
          apiCache = data;
          aggregateByDistrict(data);
          callback(apiCache);
          return;
        }
      }
    } catch (e) {}
    fetchLocalData(callback);
  }

  function fetchLocalData(callback) {
    fetchWithTimeout(LOCAL_DATA_URL, 15000)
      .then(function (data) {
        apiCache = data;
        aggregateByDistrict(data);
        callback(apiCache);
      })
      .catch(function (e) {
        console.warn('[SPPG District] Gagal memuat data lokal:', e.message);
        if (typeof showMapToast === 'function') showMapToast('Gagal memuat data SPPG. Coba lagi nanti.', 'error');
        callback(null);
      });
  }

  function fetchGeoJson(callback) {
    if (geoCache) { callback(geoCache); return; }
    fetch(GEOJSON_URL)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        geoCache = data;
        callback(geoCache);
      })
      .catch(function (e) {
        console.warn('[SPPG District] GeoJSON fetch gagal:', e.message);
        callback(null);
      });
  }

  /* ── Aggregate by district ── */
  function aggregateByDistrict(data) {
    aggregatedData = {};
    for (var i = 0; i < data.length; i++) {
      var item = data[i];
      var district = item.district;
      if (!district) continue;
      var key = normalizeDistrict(district);
      if (!aggregatedData[key]) {
        aggregatedData[key] = {
          name: district,
          province: item.province || '',
          count: 0,
          items: []
        };
      }
      aggregatedData[key].count++;
      aggregatedData[key].items.push(item);
    }
  }

  /* ── Popup builder ── */
  function buildPopup(feature, districtData) {
    var props = feature.properties;
    var name = props.nmkab || '-';
    var prov = props.nmprov || (districtData ? districtData.province : '-');
    var count = districtData ? districtData.count : 0;
    var items = districtData ? districtData.items : [];

    var badgeColor = count > 500 ? '#991b1b' : count > 200 ? '#ef4444' : count > 100 ? '#f97316' : count > 50 ? '#fbbf24' : '#10b981';

    var listHtml = '';
    var showItems = items.slice(0, 20);
    for (var i = 0; i < showItems.length; i++) {
      var it = showItems[i];
      listHtml += '<div class="sppgd-popup-item">' +
        '<span class="sppgd-popup-item-name">' + esc(it.name) + '</span>' +
        '<span class="sppgd-popup-item-sub">' + esc(it.subDistrict || '') + (it.village ? ', ' + esc(it.village) : '') + '</span>' +
      '</div>';
    }
    if (items.length > 20) {
      listHtml += '<div class="sppgd-popup-more">+' + (items.length - 20) + ' lainnya...</div>';
    }

    return '<div class="sppgd-popup">' +
      '<div class="sppgd-popup-header">' +
        '<div class="sppgd-popup-badge" style="background:' + badgeColor + '">' + count + ' SPPG</div>' +
        '<div class="sppgd-popup-title">' + esc(name) + '</div>' +
        '<div class="sppgd-popup-subtitle">' + esc(prov) + '</div>' +
      '</div>' +
      '<div class="sppgd-popup-body">' +
        '<div class="sppgd-popup-list">' + (listHtml || '<div class="sppgd-popup-empty">Tidak ada data SPPG</div>') + '</div>' +
      '</div>' +
      '<div class="sppgd-popup-footer">' +
        '<div class="sppgd-popup-source">Sumber: MBG Watch API</div>' +
      '</div>' +
    '</div>';
  }

  /* ── Table panel ── */
  function renderTable(districtName) {
    var items = [];
    if (districtName) {
      var key = normalizeDistrict(districtName);
      if (aggregatedData[key]) items = aggregatedData[key].items;
    } else {
      for (var k in aggregatedData) {
        items = items.concat(aggregatedData[k].items);
      }
    }

    var filtered = items;
    if (tableState.search) {
      var q = tableState.search.toLowerCase();
      filtered = items.filter(function (it) {
        return (it.name || '').toLowerCase().indexOf(q) >= 0 ||
               (it.subDistrict || '').toLowerCase().indexOf(q) >= 0 ||
               (it.village || '').toLowerCase().indexOf(q) >= 0 ||
               (it.district || '').toLowerCase().indexOf(q) >= 0 ||
               (it.province || '').toLowerCase().indexOf(q) >= 0;
      });
    }

    var sortKey = tableState.sortKey;
    var sortDir = tableState.sortDir;
    filtered.sort(function (a, b) {
      var va = a[sortKey] || '';
      var vb = b[sortKey] || '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    tableState.rows = filtered;
    var total = filtered.length;
    var totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
    if (tableState.page > totalPages) tableState.page = totalPages;
    var start = (tableState.page - 1) * PER_PAGE;
    var pageItems = filtered.slice(start, start + PER_PAGE);

    var container = $('sppgd-table-panel');
    if (!container) return;

    var sortIcon = function (key) {
      if (tableState.sortKey !== key) return '';
      return tableState.sortDir === 'asc' ? ' ▲' : ' ▼';
    };

    var rowsHtml = '';
    for (var i = 0; i < pageItems.length; i++) {
      var it = pageItems[i];
      var no = start + i + 1;
      rowsHtml += '<tr class="sppgd-tr" data-lat="' + (it.latitude || '') + '" data-lng="' + (it.longitude || '') + '">' +
        '<td>' + no + '</td>' +
        '<td>' + esc(it.name) + '</td>' +
        '<td>' + esc(it.province) + '</td>' +
        '<td>' + esc(it.district) + '</td>' +
        '<td>' + esc(it.subDistrict) + '</td>' +
        '<td>' + esc(it.village) + '</td>' +
      '</tr>';
    }
    if (!rowsHtml) {
      rowsHtml = '<tr><td colspan="6" class="sppgd-td-empty">Tidak ada data</td></tr>';
    }

    var pagHtml = '';
    if (totalPages > 1) {
      pagHtml += '<div class="sppgd-pagination">';
      pagHtml += '<button class="sppgd-pag-btn" data-page="prev" ' + (tableState.page <= 1 ? 'disabled' : '') + '>&laquo;</button>';
      var startPage = Math.max(1, tableState.page - 2);
      var endPage = Math.min(totalPages, startPage + 4);
      if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);
      for (var p = startPage; p <= endPage; p++) {
        pagHtml += '<button class="sppgd-pag-btn' + (p === tableState.page ? ' sppgd-pag-active' : '') + '" data-page="' + p + '">' + p + '</button>';
      }
      pagHtml += '<button class="sppgd-pag-btn" data-page="next" ' + (tableState.page >= totalPages ? 'disabled' : '') + '>&raquo;</button>';
      pagHtml += '<span class="sppgd-pag-info">Halaman ' + tableState.page + ' dari ' + totalPages + ' (' + total + ' data)</span>';
      pagHtml += '</div>';
    }

    container.innerHTML =
      '<div class="sppgd-table-wrap">' +
        '<div class="sppgd-table-title">' +
          '<span class="sppgd-badge">SPPG</span> Sebaran per Kab/Kota' +
          (districtName ? ' &mdash; ' + esc(districtName) : '') +
          ' <span>&middot; ' + total + ' lokasi</span>' +
        '</div>' +
        '<div class="sppgd-table-header">' +
          '<div class="sppgd-table-actions">' +
            '<input type="text" id="sppgdTableSearch" class="sppgd-table-search" placeholder="Cari nama, kecamatan, desa..." value="' + esc(tableState.search) + '" autocomplete="off" />' +
            '<button id="sppgdExportCsv" class="sppgd-btn-csv" title="Export CSV"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> CSV</button>' +
            '<button id="sppgdCloseTable" class="sppgd-btn-close" title="Tutup">&times;</button>' +
          '</div>' +
        '</div>' +
        '<div class="sppgd-table-scroll">' +
          '<table class="sppgd-table">' +
            '<thead><tr>' +
              '<th data-sort="no" class="sppgd-th-no">No' + sortIcon('no') + '</th>' +
              '<th data-sort="name">Nama' + sortIcon('name') + '</th>' +
              '<th data-sort="province">Provinsi' + sortIcon('province') + '</th>' +
              '<th data-sort="district">Kab/Kota' + sortIcon('district') + '</th>' +
              '<th data-sort="subDistrict">Kecamatan' + sortIcon('subDistrict') + '</th>' +
              '<th data-sort="village">Desa' + sortIcon('village') + '</th>' +
            '</tr></thead>' +
            '<tbody>' + rowsHtml + '</tbody>' +
          '</table>' +
        '</div>' +
        pagHtml +
      '</div>';

    bindTableEvents();
  }

  function bindTableEvents() {
    var searchEl = $('sppgdTableSearch');
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        tableState.search = this.value;
        tableState.page = 1;
        renderTable(tableState._currentDistrict || '');
      });
    }

    var csvBtn = $('sppgdExportCsv');
    if (csvBtn) {
      csvBtn.addEventListener('click', function () { exportCsv(); });
    }

    var closeBtn = $('sppgdCloseTable');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        var el = $('sppgd-table-container');
        if (el) el.innerHTML = '';
        var panel = $('sppgd-table-panel');
        if (panel) panel.style.display = 'none';
      });
    }

    var sortHeaders = document.querySelectorAll('.sppgd-table th[data-sort]');
    sortHeaders.forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.dataset.sort;
        if (key === 'no') return;
        if (tableState.sortKey === key) {
          tableState.sortDir = tableState.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          tableState.sortKey = key;
          tableState.sortDir = 'asc';
        }
        tableState.page = 1;
        renderTable(tableState._currentDistrict || '');
      });
    });

    var pagBtns = document.querySelectorAll('.sppgd-pag-btn');
    pagBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var pg = btn.dataset.page;
        if (pg === 'prev') tableState.page = Math.max(1, tableState.page - 1);
        else if (pg === 'next') tableState.page++;
        else tableState.page = parseInt(pg);
        renderTable(tableState._currentDistrict || '');
      });
    });

    var trs = document.querySelectorAll('.sppgd-tr');
    trs.forEach(function (tr) {
      tr.addEventListener('click', function () {
        var lat = parseFloat(tr.dataset.lat);
        var lng = parseFloat(tr.dataset.lng);
        if (!isNaN(lat) && !isNaN(lng)) {
          map.flyTo([lat, lng], 14, { duration: 0.8 });
          L.popup({ maxWidth: 300, className: 'sppgd-marker-popup' })
            .setLatLng([lat, lng])
            .setContent('<div style="font-size:12px;padding:4px"><strong>' + esc(tr.cells[1].textContent) + '</strong></div>')
            .openOn(map);
        }
      });
    });
  }

  function exportCsv() {
    var rows = tableState.rows || [];
    var lines = ['No,Nama,Provinsi,Kab/Kota,Kecamatan,Desa'];
    for (var i = 0; i < rows.length; i++) {
      var it = rows[i];
      lines.push((i + 1) + ',"' + (it.name || '').replace(/"/g, '""') + '","' + (it.province || '').replace(/"/g, '""') + '","' + (it.district || '').replace(/"/g, '""') + '","' + (it.subDistrict || '').replace(/"/g, '""') + '","' + (it.village || '').replace(/"/g, '""') + '"');
    }
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    var now = new Date();
    var dd = String(now.getDate()).padStart(2, '0');
    var mm = String(now.getMonth() + 1).padStart(2, '0');
    var yyyy = now.getFullYear();
    a.download = 'sppg_kabupaten_' + yyyy + '-' + mm + '-' + dd + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ── Legend ── */
  function showLegend() {
    if (legendCtrl) return;
    if (typeof addUnifiedLegend !== 'function') return;
    var div = L.DomUtil.create('div', 'sppgd-legend');
    L.DomEvent.disableClickPropagation(div);
    div.innerHTML =
      '<div class="wind-legend-title">SPPG per Kabupaten/Kota</div>' +
      '<div class="sppgd-legend-items">' +
        '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#991b1b;"></span>&gt; 500 SPPG</div>' +
        '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#ef4444;"></span>201 – 500</div>' +
        '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#f97316;"></span>101 – 200</div>' +
        '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#fbbf24;"></span>51 – 100</div>' +
        '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#fef3c7;border:1px solid #d97706;"></span>1 – 50</div>' +
        '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:rgba(200,200,200,0.3);border:1px solid #aaa;"></span>Tidak ada data</div>' +
      '</div>' +
      '<div class="wind-legend-unit">Sumber: MBG Watch API</div>';
    addUnifiedLegend('sppgDistrict', typeof createLegendWithToggle === 'function' ? createLegendWithToggle(div) : div);
    legendCtrl = true;
  }

  function hideLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('sppgDistrict');
    legendCtrl = null;
  }

  /* ── Show/hide table panel ── */
  function showTablePanel(districtName) {
    var panel = $('sppgd-table-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'sppgd-table-panel';
      panel.className = 'sppgd-table-panel';
      var mapContainer = map.getContainer();
      var parent = mapContainer.parentElement || mapContainer.parentNode;
      parent.appendChild(panel);
    }
    panel.style.display = 'block';
    tableState._currentDistrict = districtName || '';
    tableState.page = 1;
    tableState.search = '';
    tableState.sortKey = 'name';
    tableState.sortDir = 'asc';
    renderTable(districtName);
  }

  /* ── Main toggle ── */
  function toggleSppgDistrictLayer(show) {
    if (show) {
      if (layer && map.hasLayer(layer)) return;

      fetchGeoJson(function (geoData) {
        if (!geoData) return;
        fetchApiData(function () {
          if (!apiCache) return;

          layer = L.geoJSON(geoData, {
            style: function (feature) {
              var name = normalizeDistrict(feature.properties.nmkab);
              var data = aggregatedData[name];
              var count = data ? data.count : 0;
              return {
                fillColor: getColor(count),
                weight: 1,
                opacity: 0.8,
                color: '#666',
                fillOpacity: 0.65
              };
            },
            onEachFeature: function (feature, l) {
              var name = normalizeDistrict(feature.properties.nmkab);
              var data = aggregatedData[name] || null;

              l.bindTooltip(
                '<strong>' + esc(feature.properties.nmkab) + '</strong>' +
                (data ? ' &mdash; ' + data.count + ' SPPG' : ''),
                { sticky: true, className: 'sppgd-tooltip' }
              );

              l.on('mouseover', function () {
                l.setStyle({ weight: 2, color: '#333', fillOpacity: 0.85 });
              });
              l.on('mouseout', function () {
                layer.resetStyle(l);
              });
              l.on('click', function () {
                var html = buildPopup(feature, data);
                L.popup({ maxWidth: 340, className: 'sppgd-leaflet-popup' })
                  .setLatLng(l.getCenter())
                  .setContent(html)
                  .openOn(map);
              });
            }
          }).addTo(map);

          showLegend();
        });
      });
    } else {
      if (layer && map.hasLayer(layer)) map.removeLayer(layer);
      layer = null;
      hideLegend();
      map.closePopup();
      var panel = $('sppgd-table-panel');
      if (panel) panel.style.display = 'none';
    }
  }

  window.toggleSppgDistrictLayer = toggleSppgDistrictLayer;
  window.isSppgDistrictLayerActive = function () { return !!layer && map.hasLayer(layer); };
  window.getSppgDistrictData = function () { return apiCache || []; };
})();
