/* ═══════════════════════════════════════════════════════
   Attribute Table — Dynamic feature attribute viewer
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var PAGE_SIZE = 100;
  var _currentLayer = null;
  var _currentFeatures = [];
  var _currentPage = 1;
  var _searchQuery = '';
  var _highlightMarker = null;
  var _wmsClickHandler = null;
  var _attrTableOpen = false;
  var _attrTableMinimized = false;

  /* ── Layer Registry ── */
  var ATTR_LAYER_REGISTRY = {
    toggleSignificantMarkers: {
      name: '15 Gempa M 5.0+ (BMKG)',
      type: 'vector',
      getFeatures: function () { return earthquakeSignificantData || []; },
      props: ['Tanggal', 'Jam', 'Magnitude', 'Kedalaman', 'Wilayah', 'Potensi', 'Dirasakan', 'Coordinates'],
      getLatLng: function (item) {
        var c = (item.Coordinates || '').split(',');
        return [parseFloat(c[0]), parseFloat(c[1])];
      }
    },
    toggleFeltMarkers: {
      name: '15 Gempa Dirasakan (BMKG)',
      type: 'vector',
      getFeatures: function () { return earthquakeFeltData || []; },
      props: ['Tanggal', 'Jam', 'Magnitude', 'Kedalaman', 'Wilayah', 'Potensi', 'Dirasakan', 'Coordinates'],
      getLatLng: function (item) {
        var c = (item.Coordinates || '').split(',');
        return [parseFloat(c[0]), parseFloat(c[1])];
      }
    },
    toggleLatestEarthquake: {
      name: 'Gempa Terbaru (BMKG)',
      type: 'vector',
      getFeatures: function () { return earthquakeLatestData ? [earthquakeLatestData] : []; },
      props: ['Tanggal', 'Jam', 'Magnitude', 'Kedalaman', 'Wilayah', 'Potensi', 'Dirasakan', 'Shakemap', 'Coordinates'],
      getLatLng: function (item) {
        var c = (item.Coordinates || '').split(',');
        return [parseFloat(c[0]), parseFloat(c[1])];
      }
    },
    toggleTollRoad: {
      name: 'Jalan Tol Pulau Jawa',
      type: 'geojson',
      getLayer: function () { return typeof tollRoadLayer !== 'undefined' ? tollRoadLayer : null; },
      props: ['NAMA', 'STATUS', 'REMARK'],
      getLatLng: function (f) {
        if (f.geometry && f.geometry.coordinates) {
          var c = f.geometry.coordinates;
          if (f.geometry.type === 'LineString' && c.length) return [c[0][1], c[0][0]];
          if (f.geometry.type === 'MultiLineString' && c.length && c[0].length) return [c[0][0][1], c[0][0][0]];
        }
        return null;
      }
    },
    toggleNonTollRoad: {
      name: 'Jalan Non Tol (BIG)',
      type: 'geojson',
      getLayer: function () { return typeof nonTollRoadLayer !== 'undefined' ? nonTollRoadLayer : null; },
      props: ['NAMA', 'REMARK', 'STATUS'],
      getLatLng: function (f) {
        if (f.geometry && f.geometry.coordinates) {
          var c = f.geometry.coordinates;
          if (f.geometry.type === 'LineString' && c.length) return [c[0][1], c[0][0]];
          if (f.geometry.type === 'MultiLineString' && c.length && c[0].length) return [c[0][0][1], c[0][0][0]];
        }
        return null;
      }
    },
    toggleNationalRoad: {
      name: 'Jalan Nasional',
      type: 'geojson',
      getLayer: function () { return typeof nationalRoadLayer !== 'undefined' ? nationalRoadLayer : null; },
      props: ['NAMA', 'REMARK'],
      getLatLng: function (f) {
        if (f.geometry && f.geometry.coordinates) {
          var c = f.geometry.coordinates;
          if (f.geometry.type === 'LineString' && c.length) return [c[0][1], c[0][0]];
          if (f.geometry.type === 'MultiLineString' && c.length && c[0].length) return [c[0][0][1], c[0][0][0]];
        }
        return null;
      }
    },
    toggleVolcanoLayer: {
      name: 'Gunung Api Indonesia (PVMBG)',
      type: 'cluster',
      getLayer: function () { return typeof volcanoClusterGroup !== 'undefined' ? volcanoClusterGroup : null; },
      props: ['NAMA', 'ga_status', 'EA', 'N', 'ELEV', 'KOTA'],
      getLatLng: function (m) {
        var ll = m.getLatLng();
        return [ll.lat, ll.lng];
      }
    },
    toggleSebaranPasar: {
      name: 'Sebaran Pasar Indonesia',
      type: 'cluster',
      getLayer: function () { return typeof sebaranPasarLayer !== 'undefined' ? sebaranPasarLayer : null; },
      props: ['NAMA_PASAR', 'JENIS_PASAR', 'NAMA_KOTA', 'NAMA_PROP'],
      getLatLng: function (m) {
        var ll = m.getLatLng();
        return [ll.lat, ll.lng];
      }
    },
    toggleSppgSebaranLayer: {
      name: 'Sebaran SPPG Indonesia',
      type: 'cluster',
      getLayer: function () { return typeof sppgSebaranLayer !== 'undefined' ? sppgSebaranLayer : null; },
      props: ['NAMA', 'ALAMAT', 'KOTA', 'PROVINSI'],
      getLatLng: function (m) {
        var ll = m.getLatLng();
        return [ll.lat, ll.lng];
      }
    },
    toggleSppgLayer: {
      name: 'SPPG Indonesia',
      type: 'cluster',
      getLayer: function () { return typeof sppgLayer !== 'undefined' ? sppgLayer : null; },
      props: ['NAMA', 'ALAMAT', 'KOTA', 'PROVINSI'],
      getLatLng: function (m) {
        var ll = m.getLatLng();
        return [ll.lat, ll.lng];
      }
    },
    toggleConcessionsLayer: {
      name: 'Konsesi (GFW)',
      type: 'geojson',
      getLayer: function () { return typeof concessionsHighlightLayer !== 'undefined' ? concessionsHighlightLayer : null; },
      props: ['concession_name', 'company', 'area_type', 'permit_type'],
      getLatLng: function (f) {
        if (f.geometry && f.geometry.coordinates) {
          var c = f.geometry.coordinates;
          if (f.geometry.type === 'Polygon' && c.length && c[0].length) return [c[0][0][1], c[0][0][0]];
          if (f.geometry.type === 'MultiPolygon' && c.length && c[0].length && c[0][0].length) return [c[0][0][0][1], c[0][0][0][0]];
        }
        return null;
      }
    },
    toggleKatalogGempa: {
      name: 'Katalog Gempa BMKG',
      type: 'cluster',
      getLayer: function () { return typeof katalogGempaLayer !== 'undefined' ? katalogGempaLayer : null; },
      props: ['Tanggal', 'Magnitudo', 'Kedalaman', 'Wilayah'],
      getLatLng: function (m) {
        var ll = m.getLatLng();
        return [ll.lat, ll.lng];
      }
    },
    toggleHistoryGempa: {
      name: 'Riwayat Gempa BMKG',
      type: 'cluster',
      getLayer: function () { return typeof historyGempaLayer !== 'undefined' ? historyGempaLayer : null; },
      props: ['Tanggal', 'Magnitudo', 'Kedalaman', 'Wilayah'],
      getLatLng: function (m) {
        var ll = m.getLatLng();
        return [ll.lat, ll.lng];
      }
    },
    toggleSensorSeismic: {
      name: 'Sensor Seismic BMKG',
      type: 'cluster',
      getLayer: function () { return typeof sensorSeismicLayer !== 'undefined' ? sensorSeismicLayer : null; },
      props: ['Nama', 'Tipe', 'Status', 'Lokasi'],
      getLatLng: function (m) {
        var ll = m.getLatLng();
        return [ll.lat, ll.lng];
      }
    },
    toggleSensorGlobal: {
      name: 'Sensor Global (GEOFON)',
      type: 'cluster',
      getLayer: function () { return typeof sensorGlobalLayer !== 'undefined' ? sensorGlobalLayer : null; },
      props: ['Nama', 'Tipe', 'Status', 'Network'],
      getLatLng: function (m) {
        var ll = m.getLatLng();
        return [ll.lat, ll.lng];
      }
    }
  };

  /* ── WMS GetFeatureInfo Layers ── */
  var WMS_ATTR_REGISTRY = {
    toggleFaultLayer: { name: 'Patahan Indonesia (BNPB)' },
    toggleFaultLayerNew: { name: 'Patahan Indonesia Baru (PUSGEN 2024)' },
    toggleWorldPlatesLayer: { name: 'Zona Patahan Dunia (USGS)' },
    toggleKrbGunungApi: { name: 'KRB Gunung Api (BIG)' },
    toggleKrbTitik: { name: 'Gas Vulkanik Gunung Api (BIG)' },
    togglePetaGeologi: { name: 'Peta Geologi (BIG)' },
    toggleGeostruktur: { name: 'Geologi Geostruktur (BIG)' },
    togglePatahanAktif: { name: 'Patahan Aktif 1:50K (BIG)' },
    toggleLikuifaksi: { name: 'Kerentanan Likuifaksi (BIG)' },
    toggleKarst: { name: 'Kawasan Bentang Alam Karst (BIG)' }
  };

  /* ── Escape HTML ── */
  function escAttr(v) {
    return String(v == null ? '-' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  /* ── Get Filtered Features ── */
  function getFilteredFeatures(features) {
    if (!_searchQuery) return features;
    var q = _searchQuery.toLowerCase();
    return features.filter(function (f) {
      if (!f) return false;
      if (typeof f === 'object') {
        for (var k in f) {
          if (f[k] && String(f[k]).toLowerCase().indexOf(q) !== -1) return true;
        }
      }
      return false;
    });
  }

  /* ── Extract features from geojson layer ── */
  function extractGeoJsonFeatures(layer) {
    var features = [];
    if (!layer) return features;
    layer.eachLayer(function (l) {
      if (l.feature && l.feature.properties) {
        var f = {};
        for (var k in l.feature.properties) f[k] = l.feature.properties[k];
        f._latlng = l.getLatLng ? l.getLatLng() : null;
        f._layer = l;
        features.push(f);
      }
    });
    return features;
  }

  /* ── Extract features from cluster/layerGroup ── */
  function extractClusterFeatures(layer) {
    var features = [];
    if (!layer) return features;
    layer.eachLayer(function (m) {
      if (m.getLatLng) {
        var props = {};
        if (m.feature && m.feature.properties) {
          props = m.feature.properties;
        } else if (m.options && m.options.properties) {
          props = m.options.properties;
        }
        var f = {};
        for (var k in props) f[k] = props[k];
        var ll = m.getLatLng();
        f._latlng = ll;
        f._marker = m;
        features.push(f);
      }
    });
    return features;
  }

  /* ── Open Attribute Table ── */
  function openAttrTable(toggleId) {
    var sheet = document.getElementById('attr-table-sheet');
    if (!sheet) return;

    var config = ATTR_LAYER_REGISTRY[toggleId];
    if (!config) return;

    _currentLayer = { id: toggleId, config: config };
    _currentPage = 1;
    _searchQuery = '';

    document.getElementById('atSheetTitleText').textContent = config.name;
    sheet.classList.add('attr-table-sheet-open');
    sheet.classList.remove('attr-table-sheet-minimized');
    _attrTableOpen = true;
    _attrTableMinimized = false;

    document.body.classList.add('attr-table-sheet-open');
    document.body.classList.remove('attr-table-sheet-minimized');

    loadFeatures();
  }
  window.openAttrTable = openAttrTable;

  /* ── Open WMS GetFeatureInfo mode ── */
  function openWmsAttrTable(toggleId) {
    var config = WMS_ATTR_REGISTRY[toggleId];
    if (!config) return;

    _currentLayer = { id: toggleId, config: config, isWms: true };

    var sheet = document.getElementById('attr-table-sheet');
    if (!sheet) return;

    document.getElementById('atSheetTitleText').textContent = config.name;
    sheet.classList.add('attr-table-sheet-open');
    sheet.classList.remove('attr-table-sheet-minimized');
    _attrTableOpen = true;
    _attrTableMinimized = false;

    document.body.classList.add('attr-table-sheet-open');
    document.body.classList.remove('attr-table-sheet-minimized');

    var content = document.getElementById('at-sheet-content');
    content.innerHTML =
      '<div class="at-wms-hint">' +
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>' +
        '<span>Klik di peta untuk melihat atribut layer ini.</span>' +
      '</div>';

    enableWmsClick(toggleId);
  }
  window.openWmsAttrTable = openWmsAttrTable;

  /* ── Load Features ── */
  function loadFeatures() {
    if (!_currentLayer || !_currentLayer.config) return;
    var config = _currentLayer.config;
    var features = [];

    if (config.type === 'vector') {
      var raw = config.getFeatures();
      features = raw.map(function (item) {
        var f = {};
        for (var k in item) {
          if (typeof item[k] !== 'object' || item[k] == null) f[k] = item[k];
        }
        var ll = config.getLatLng(item);
        if (ll && isFinite(ll[0]) && isFinite(ll[1])) f._latlng = ll;
        return f;
      });
    } else if (config.type === 'geojson') {
      features = extractGeoJsonFeatures(config.getLayer());
    } else if (config.type === 'cluster') {
      features = extractClusterFeatures(config.getLayer());
    }

    _currentFeatures = features;
    _currentPage = 1;
    renderAttrContent();
  }

  /* ── Render Content ── */
  function renderAttrContent() {
    var content = document.getElementById('at-sheet-content');
    if (!content) return;

    var all = getFilteredFeatures(_currentFeatures);
    var totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    if (_currentPage > totalPages) _currentPage = totalPages;

    var start = (_currentPage - 1) * PAGE_SIZE;
    var page = all.slice(start, start + PAGE_SIZE);
    var props = _currentLayer.config.props || [];

    if (_currentFeatures.length === 0) {
      content.innerHTML = '<div class="at-empty">Tidak ada fitur untuk layer ini.</div>';
      return;
    }

    var html = '';

    html += '<div class="at-controls">';
    html += '<input type="text" class="at-search" id="atSearchInput" placeholder="Cari fitur..." value="' + escAttr(_searchQuery) + '" />';
    html += '<div class="at-info">' + all.length + ' fitur';
    if (totalPages > 1) html += ' &middot; Halaman ' + _currentPage + ' / ' + totalPages;
    html += '</div>';
    html += '</div>';

    html += '<div class="at-table-wrap">';
    html += '<table class="at-table">';
    html += '<thead><tr>';
    html += '<th class="at-th-no">No</th>';
    props.forEach(function (p) { html += '<th>' + escAttr(p) + '</th>'; });
    html += '</tr></thead>';
    html += '<tbody>';

    page.forEach(function (f, i) {
      var latlng = f._latlng;
      var dataIdx = start + i;
      html += '<tr class="at-row" data-idx="' + dataIdx + '"' + (latlng ? ' data-lat="' + latlng[0] + '" data-lng="' + latlng[1] + '"' : '') + '>';
      html += '<td class="at-td-no">' + (start + i + 1) + '</td>';
      props.forEach(function (p) {
        var val = f[p];
        if (p === 'ga_status') {
          var labels = { 1: 'Normal', 2: 'Waspada', 3: 'Siaga', 4: 'Awas' };
          val = labels[val] || val || '-';
        }
        html += '<td title="' + escAttr(val) + '">' + escAttr(val) + '</td>';
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    html += '</div>';

    if (totalPages > 1) {
      html += '<div class="at-pagination">';
      html += '<button class="at-page-btn" data-page="prev"' + (_currentPage <= 1 ? ' disabled' : '') + '>&lsaquo; Prev</button>';
      html += '<span class="at-page-info">' + _currentPage + ' / ' + totalPages + '</span>';
      html += '<button class="at-page-btn" data-page="next"' + (_currentPage >= totalPages ? ' disabled' : '') + '>Next &rsaquo;</button>';
      html += '</div>';
    }

    content.innerHTML = html;

    var searchInput = document.getElementById('atSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        _searchQuery = this.value;
        _currentPage = 1;
        renderAttrContent();
      });
    }

    content.querySelectorAll('.at-row').forEach(function (row) {
      row.addEventListener('click', function () {
        var lat = parseFloat(row.dataset.lat);
        var lng = parseFloat(row.dataset.lng);
        if (isFinite(lat) && isFinite(lng)) {
          map.flyTo([lat, lng], Math.max(map.getZoom(), 12), { duration: 0.5 });
          highlightMarkerOnMap(lat, lng, row);
        }
      });
    });

    content.querySelectorAll('.at-page-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.dataset.page === 'prev' && _currentPage > 1) {
          _currentPage--;
          renderAttrContent();
        } else if (btn.dataset.page === 'next' && _currentPage < totalPages) {
          _currentPage++;
          renderAttrContent();
        }
      });
    });
  }

  /* ── Highlight marker on map ── */
  function highlightMarkerOnMap(lat, lng, rowEl) {
    if (_highlightMarker) {
      map.removeLayer(_highlightMarker);
      _highlightMarker = null;
    }
    _highlightMarker = L.circleMarker([lat, lng], {
      radius: 14,
      color: '#2563eb',
      weight: 3,
      fillColor: '#2563eb',
      fillOpacity: 0.3,
      className: 'at-highlight-pulse'
    }).addTo(map);

    setTimeout(function () {
      if (_highlightMarker) { map.removeLayer(_highlightMarker); _highlightMarker = null; }
    }, 3000);

    content.querySelectorAll('.at-row').forEach(function (r) { r.classList.remove('at-row-active'); });
    if (rowEl) rowEl.classList.add('at-row-active');
  }

  /* ── Highlight row from map click ── */
  function highlightRowByLatLng(lat, lng) {
    var content = document.getElementById('at-sheet-content');
    if (!content) return;

    content.querySelectorAll('.at-row').forEach(function (row) {
      var rlat = parseFloat(row.dataset.lat);
      var rlng = parseFloat(row.dataset.lng);
      if (isFinite(rlat) && isFinite(rlng) && Math.abs(rlat - lat) < 0.001 && Math.abs(rlng - lng) < 0.001) {
        row.classList.add('at-row-active');
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        row.classList.remove('at-row-active');
      }
    });
  }
  window.highlightAttrRow = highlightRowByLatLng;

  /* ── WMS GetFeatureInfo ── */
  function enableWmsClick(toggleId) {
    disableWmsClick();
    _wmsClickHandler = function (e) {
      fetchWmsFeatureInfo(e.latlng, toggleId);
    };
    map.on('click', _wmsClickHandler);
  }

  function disableWmsClick() {
    if (_wmsClickHandler) {
      map.off('click', _wmsClickHandler);
      _wmsClickHandler = null;
    }
  }

  function fetchWmsFeatureInfo(latlng, toggleId) {
    var zoom = map.getZoom();
    var size = map.getSize();
    var point = map.latLngToContainerPoint(latlng);

    var layerMap = {
      toggleFaultLayer: { url: 'https://tanahair.indonesia.go.id/demnas/rest/services/Demnas_Infrastruktur/MapServer', layers: '0' },
      toggleKrbGunungApi: { url: 'https://tanahair.indonesia.go.id/demnas/rest/services/Demnas_GunungApi/MapServer', layers: '0' },
      toggleKrbTitik: { url: 'https://tanahair.indonesia.go.id/demnas/rest/services/Demnas_GunungApi/MapServer', layers: '1' },
      togglePetaGeologi: { url: 'https://tanahair.indonesia.go.id/demnas/rest/services/Demnas_Geologi/MapServer', layers: '0' },
      toggleGeostruktur: { url: 'https://tanahair.indonesia.go.id/demnas/rest/services/Demnas_Geologi/MapServer', layers: '1' },
      togglePatahanAktif: { url: 'https://tanahair.indonesia.go.id/demnas/rest/services/Demnas_Geologi/MapServer', layers: '2' },
      toggleLikuifaksi: { url: 'https://tanahair.indonesia.go.id/demnas/rest/services/Demnas_Geologi/MapServer', layers: '3' },
      toggleKarst: { url: 'https://tanahair.indonesia.go.id/demnas/rest/services/Demnas_Geologi/MapServer', layers: '4' },
      toggleWorldPlatesLayer: { url: 'https://earthquake.usgs.gov/arcgis/services/eqcenter/MapServer/WMSServer', layers: '0' }
    };

    var cfg = layerMap[toggleId];
    if (!cfg) return;

    var params = [
      'SERVICE=WMS', 'VERSION=1.1.1', 'REQUEST=GetFeatureInfo',
      'LAYERS=' + cfg.layers, 'QUERY_LAYERS=' + cfg.layers,
      'INFO_FORMAT=application/json', 'FEATURE_COUNT=10',
      'SRS=EPSG:4326',
      'BBOX=' + (lng - 0.5) + ',' + (lat - 0.5) + ',' + (lng + 0.5) + ',' + (lat + 0.5),
      'WIDTH=' + size.x, 'HEIGHT=' + size.y,
      'X=' + Math.round(point.x), 'Y=' + Math.round(point.y)
    ];

    var url = cfg.url + (cfg.url.indexOf('?') === -1 ? '?' : '&') + params.join('&');

    var content = document.getElementById('at-sheet-content');
    if (content) content.innerHTML = '<div class="at-loading">Memuat data...</div>';

    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.features && data.features.length > 0) {
          renderWmsResults(data.features);
        } else {
          if (content) content.innerHTML = '<div class="at-empty">Tidak ada data atribut di lokasi ini.</div>';
        }
      })
      .catch(function () {
        if (content) content.innerHTML = '<div class="at-empty">Gagal memuat data atribut.</div>';
      });
  }

  function renderWmsResults(features) {
    var content = document.getElementById('at-sheet-content');
    if (!content) return;

    var allProps = {};
    features.forEach(function (f) {
      var attrs = f.attributes || f.properties || {};
      for (var k in attrs) allProps[k] = 1;
    });
    var props = Object.keys(allProps);

    var html = '';
    html += '<div class="at-controls"><div class="at-info">' + features.length + ' fitur ditemukan</div></div>';
    html += '<div class="at-table-wrap">';
    html += '<table class="at-table">';
    html += '<thead><tr>';
    props.forEach(function (p) { html += '<th>' + escAttr(p) + '</th>'; });
    html += '</tr></thead><tbody>';
    features.forEach(function (f) {
      var attrs = f.attributes || f.properties || {};
      html += '<tr>';
      props.forEach(function (p) { html += '<td title="' + escAttr(attrs[p]) + '">' + escAttr(attrs[p]) + '</td>'; });
      html += '</tr>';
    });
    html += '</tbody></table></div>';

    content.innerHTML = html;
  }

  /* ── Sheet Controls ── */
  function closeAttrTableSheet() {
    var sheet = document.getElementById('attr-table-sheet');
    if (sheet) {
      sheet.classList.remove('attr-table-sheet-open', 'attr-table-sheet-minimized');
    }
    document.body.classList.remove('attr-table-sheet-open', 'attr-table-sheet-minimized');
    _attrTableOpen = false;
    _attrTableMinimized = false;
    disableWmsClick();
    _currentLayer = null;
    _currentFeatures = [];
    _searchQuery = '';
    if (_highlightMarker) { map.removeLayer(_highlightMarker); _highlightMarker = null; }
  }
  window.closeAttrTableSheet = closeAttrTableSheet;

  function minimizeAttrTableSheet() {
    var sheet = document.getElementById('attr-table-sheet');
    if (!sheet) return;
    _attrTableMinimized = !_attrTableMinimized;
    sheet.classList.toggle('attr-table-sheet-minimized', _attrTableMinimized);
    document.body.classList.toggle('attr-table-sheet-minimized', _attrTableMinimized);
  }
  window.minimizeAttrTableSheet = minimizeAttrTableSheet;

  function toggleAttrTableSheet() {
    var sheet = document.getElementById('attr-table-sheet');
    if (!sheet) return;
    if (_attrTableMinimized) {
      minimizeAttrTableSheet();
      return;
    }
    if (_attrTableOpen) closeAttrTableSheet();
    else if (_currentLayer) {
      sheet.classList.add('attr-table-sheet-open');
      _attrTableOpen = true;
      document.body.classList.add('attr-table-sheet-open');
    }
  }
  window.toggleAttrTableSheet = toggleAttrTableSheet;

  /* ── Check if layer has attr support ── */
  function hasAttrSupport(toggleId) {
    return !!(ATTR_LAYER_REGISTRY[toggleId] || WMS_ATTR_REGISTRY[toggleId]);
  }
  window.hasAttrSupport = hasAttrSupport;

  /* ── Check if WMS layer ── */
  function isWmsAttrLayer(toggleId) {
    return !!WMS_ATTR_REGISTRY[toggleId];
  }
  window.isWmsAttrLayer = isWmsAttrLayer;

  /* ── Refresh current table if open ── */
  function refreshAttrTable() {
    if (_attrTableOpen && _currentLayer && !_currentLayer.isWms) {
      loadFeatures();
    }
  }
  window.refreshAttrTable = refreshAttrTable;

})();
