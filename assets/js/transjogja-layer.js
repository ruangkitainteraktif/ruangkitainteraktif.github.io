/* Trans Jogja route layer. Kept independent from the Jakarta module. */
(function () {
  'use strict';

  var DATA_URL = 'assets/data/routes/transjogja.kml';
  var COLORS = ['#0e7490', '#7c3aed', '#ea580c', '#15803d', '#be123c', '#1d4ed8', '#a16207', '#0f766e', '#9333ea', '#c2410c'];
  var layer = null;
  var halteLayer = null;
  var records = [];
  var stops = [];
  var groupCache = null;
  var active = false;
  var routeVisible = false;
  var loaded = false;
  var loading = false;
  var stopsLoaded = false;
  var stopsVisible = false;
  var failed = false;
  var userClosed = false;
  var filterText = '';
  var selectedKey = '';
  var sudahTerbang = false;
  var sheetId = 'transjogja';
  var sheet = function () { return document.getElementById('transjogja-sheet'); };
  var body = function () { return document.getElementById('transjogja-sheet-content'); };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };

  function property(props, names) {
    var keys = Object.keys(props || {});
    for (var i = 0; i < names.length; i++) {
      var key = keys.find(function (k) { return k.toLowerCase() === names[i].toLowerCase(); });
      if (key && props[key] != null && String(props[key]).trim()) return String(props[key]).trim();
    }
    return '';
  }

  function valueOf(props, key) {
    return key && props[key] != null && String(props[key]).trim() ? String(props[key]).trim() : '';
  }

  function routeDetail(props) {
    var detail = property(props, ['rute', 'trayek', 'jurusan', 'route', 'lintasan']);
    if (detail) return detail;
    detail = property(props, ['description']);
    if (detail) {
      detail = detail.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').trim();
      detail = detail.split(/\n+/).map(function (line) { return line.replace(/^\s*\d+\s*(?:=>|→)\s*/, '').trim(); }).filter(function (line) { return line && !/^(?:!|--|AWAL|START|AKHIR|END)/i.test(line); }).join(' > ');
      if (detail) return detail;
    }
    var keys = Object.keys(props || {});
    for (var i = 0; i < keys.length; i++) {
      if (/(rute|trayek|jurusan|route|lintasan)/i.test(keys[i]) && !/^fcode$/i.test(keys[i])) {
        detail = valueOf(props, keys[i]);
        if (detail) return detail;
      }
    }
    return property(props, ['remark', 'metadata']);
  }

  function featureName(feature, i) {
    var p = feature.properties || {};
    var title = property(p, ['name', 'nama', 'namobj', 'rute']);
    if (!title) {
      var keys = Object.keys(p);
      for (var k = 0; k < keys.length && !title; k++) {
        if (/rute|trayek|koridor|jurusan|nama|kode|route/i.test(keys[k])) title = valueOf(p, keys[k]);
      }
    }
    title = (title || '').replace(/\s*[_–-]\s*Trans\s*Jogja\s*$/i, '').trim();
    return title || ('Rute ' + (i + 1));
  }

  function popupNama(nama) {
    return '<div class="agol-popup" style="min-width:210px"><div class="agol-popup-header agol-modul">'
      + '<div class="agol-popup-title"><span class="agol-popup-badge-dot" style="background:#0e7490"></span>' + esc(nama || 'Trans Jogja') + '</div>'
      + '</div></div>';
  }

  function titikRute(detail) {
    var text = String(detail || '').trim();
    if (!text) return [];
    var nodes = text.split(/\s*(?:>|\u2192|\u2013|\u2014|->|\s+-\s+|\r?\n|;\s*)/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (nodes.length < 2 && text.indexOf(',') !== -1) nodes = text.split(/,\s*/).map(function (s) { return s.trim(); }).filter(Boolean);
    return nodes.filter(function (s, i) { return i === 0 || s !== nodes[i - 1]; });
  }

  function diagramRute(details) {
    if (!details || !details.length) return '<div class="tgj-route-empty">Informasi lintasan tidak tersedia pada data layanan.</div>';
    return '<div class="tgj-gis-diagram"><div class="tgj-gis-heading"><span>DIAGRAM LINTASAN</span><small>RUTE GIS · ' + details.length + (details.length > 1 ? ' arah' : ' jalur') + '</small></div>'
      + details.slice(0, 3).map(function (detail, index) {
        var nodes = titikRute(detail);
        var shown = nodes.slice(0, 60);
        return '<div class="tgj-gis-direction"><div class="tgj-gis-direction-label">' + (details.length > 1 ? 'Lintasan ' + (index + 1) : 'Urutan halte / titik rute') + '</div><div class="tgj-gis-path" role="list" aria-label="Urutan halte rute">'
          + shown.map(function (node, i) {
            var first = i === 0;
            var last = i === shown.length - 1;
            var state = first ? 'is-start' : last ? 'is-end' : '';
            var role = first ? 'AWAL' : last ? 'AKHIR' : 'TITIK ' + (i + 1);
            return '<div class="tgj-gis-node ' + state + '" role="listitem"><span class="tgj-gis-marker">' + (first ? 'A' : last ? 'B' : (i + 1)) + '</span><span class="tgj-gis-node-label"><small>' + role + '</small><b>' + esc(node) + '</b></span></div>';
          }).join('')
          + (nodes.length > shown.length ? '<div class="tgj-gis-more">+' + (nodes.length - shown.length) + ' titik lanjutan</div>' : '')
          + '</div></div>';
      }).join('') + '</div>';
  }

  function lengthKm(feature) {
    var p = feature.properties || {};
    var stated = Number(p.Shape__Length || p.SHAPE_Length || p.shape_length || p.panjang || p.PANJANG);
    if (Number.isFinite(stated) && stated > 0) return stated > 1000 ? stated / 1000 : stated;
    var geom = feature.geometry;
    if (!geom || !geom.coordinates) return 0;
    var lines = geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates;
    var m = 0;
    lines.forEach(function (line) {
      for (var i = 1; i < line.length; i++) {
        var a = line[i - 1], b = line[i];
        var rad = Math.PI / 180, dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
        var h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
        m += 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
      }
    });
    return m / 1000;
  }

  function loadData() {
    if (loading || loaded) return Promise.resolve();
    loading = true;
    failed = false;
    render();
    return fetch(DATA_URL, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' saat membaca KML lokal.');
      return r.text();
    }).then(function (text) {
      if (!window.toGeoJSON || typeof window.toGeoJSON.kml !== 'function') throw new Error('Pustaka pembaca KML belum tersedia.');
      var doc = new DOMParser().parseFromString(text, 'text/xml');
      if (doc.querySelector('parsererror')) throw new Error('Format KML tidak valid.');
      var data = window.toGeoJSON.kml(doc);
      var allFeatures = data.features || [];
      records = allFeatures.filter(function (f) { return f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'); }).map(function (f, i) {
        f.__routeName = featureName(f, i);
        f.__routeKm = lengthKm(f);
        return f;
      });
      stops = allFeatures.filter(function (f) { return f.geometry && f.geometry.type === 'Point'; });
      groupCache = null;
      if (!records.length) throw new Error('KML tidak berisi geometri jalur.');
      loaded = true;
      stopsLoaded = true;
    }).catch(function (err) {
      failed = true;
      if (window.console) console.warn('[Trans Jogja] gagal memuat rute:', err);
    }).then(function () {
      loading = false;
      render();
      if (stopsVisible && stopsLoaded) showStops();
    });
  }

  function style(feature) {
    var i = Math.abs(String(feature.__routeName).split('').reduce(function (n, c) { return n + c.charCodeAt(0); }, 0)) % COLORS.length;
    var selected = selectedKey && feature.__routeName === selectedKey;
    return { color: COLORS[i], weight: selected ? 7 : 4, opacity: selected ? 1 : .86, lineCap: 'round', lineJoin: 'round' };
  }

  function showLayer() {
    if (!window.map || !loaded || !routeVisible) return;
    ensurePane('transjogjaRoutePane', 435);
    if (layer && window.map.hasLayer(layer)) window.map.removeLayer(layer);
    var shown = records.filter(function (f) { return !selectedKey || f.__routeName === selectedKey; });
    layer = L.geoJSON({ type: 'FeatureCollection', features: shown }, {
      pane: 'transjogjaRoutePane',
      style: style,
      onEachFeature: function (f, child) {
        var title = property(f.properties, ['nama', 'namobj']) || 'Rute Trans Jogja';
        child.bindPopup(popupNama(title), { className: 'agol-leaflet-popup' });
      }
    }).addTo(window.map);
  }

  function ensurePane(name, zIndex) {
    if (!window.map.getPane(name)) window.map.createPane(name);
    window.map.getPane(name).style.zIndex = String(zIndex);
  }

  function fitArea(bounds, maxZoom) {
    if (!window.map || !bounds || !bounds.isValid()) return;
    var map = window.map;
    var mapRect = map.getContainer().getBoundingClientRect();
    var panel = sheet();
    var topPadding = 36;
    var bottomPadding = 36;
    var leftPadding = 36;
    var rightPadding = 36;
    var search = document.getElementById('unifiedSearch');
    if (search) {
      var searchRect = search.getBoundingClientRect();
      if (searchRect.height > 0 && searchRect.bottom > mapRect.top && searchRect.bottom < mapRect.bottom) {
        topPadding = Math.max(topPadding, searchRect.bottom - mapRect.top + 16);
      }
    }
    if (panel && panel.classList.contains('sheet-open') && !panel.classList.contains('sheet-minimized')) {
      var panelRect = panel.getBoundingClientRect();
      if (window.SheetDrag && window.SheetDrag.isMobile()) {
        bottomPadding = Math.max(bottomPadding, mapRect.bottom - panelRect.top + 16);
      }
    }
    // fitBounds mempertimbangkan area tertutup sejak awal, sehingga zoom dan
    // posisi rute dihitung sekali seperti pemilihan koridor Transjakarta.
    map.fitBounds(bounds, {
      paddingTopLeft: [leftPadding, topPadding],
      paddingBottomRight: [rightPadding, bottomPadding],
      maxZoom: maxZoom || 15,
      animate: false
    });
  }

  // Saat sheet menjadi chip, bounds jaringan diposisikan di tengah viewport
  // peta, tanpa offset untuk panel atau kontrol pencarian.
  function fitViewport() {
    if (!window.map || !layer) return;
    var bounds = layer.getBounds();
    if (!bounds.isValid()) return;
    window.map.fitBounds(bounds, {
      padding: [36, 36],
      maxZoom: 13,
      animate: false
    });
  }

  function fokusJaringanAwal() {
    if (!active || !routeVisible || sudahTerbang || !loaded || !window.map || !layer) return;
    var bounds = layer.getBounds();
    if (!bounds.isValid()) return;
    window.setTimeout(function () {
      if (!active || !routeVisible || sudahTerbang || !window.map) return;
      if (typeof window.map.invalidateSize === 'function') window.map.invalidateSize({ pan: false });
      fitArea(bounds, 13);
      sudahTerbang = true;
    }, 380);
  }

  function showStops() {
    if (!window.map || !stopsLoaded) return;
    ensurePane('transjogjaHaltePane', 436);
    if (halteLayer && window.map.hasLayer(halteLayer)) window.map.removeLayer(halteLayer);
    halteLayer = L.geoJSON({ type: 'FeatureCollection', features: stops }, {
      pointToLayer: function (feature, latlng) {
        return L.circleMarker(latlng, { pane: 'transjogjaHaltePane', radius: 4, color: '#fff', weight: 1.5, fillColor: '#f97316', fillOpacity: .9 });
      },
      onEachFeature: function (feature, child) {
        var props = feature.properties || {};
        var title = property(props, ['nama', 'namobj', 'nama_halte', 'halte']) || 'Halte Trans Jogja';
        child.bindPopup(popupNama(title), { className: 'agol-leaflet-popup' });
      }
    }).addTo(window.map);
  }

  function setStopsVisible(value) {
    stopsVisible = !!value;
    if (stopsVisible) {
      if (loaded) showStops();
      else loadData().then(function () { if (stopsVisible && stopsLoaded) showStops(); });
    }
    else if (halteLayer && window.map && window.map.hasLayer(halteLayer)) window.map.removeLayer(halteLayer);
    render();
  }

  function groups() {
    if (groupCache) return groupCache;
    var out = Object.create(null);
    records.forEach(function (f) {
      var name = f.__routeName;
      if (!out[name]) out[name] = { name: name, count: 0, km: 0, details: [], bounds: L.latLngBounds() };
      out[name].count++;
      out[name].km += f.__routeKm;
      var detail = routeDetail(f.properties);
      if (detail && out[name].details.indexOf(detail) === -1) out[name].details.push(detail);
      var b = L.geoJSON(f).getBounds();
      if (b.isValid()) out[name].bounds.extend(b);
    });
    groupCache = Object.keys(out).map(function (k) { return out[k]; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'id', { numeric: true, sensitivity: 'base' }); });
    return groupCache;
  }

  function render() {
    var el = body();
    if (!el) return;
    if (failed) { el.innerHTML = '<div class="tj-kosong"><b>Data rute Trans Jogja gagal dimuat.</b><span>Data KML lokal tidak dapat dibaca. Coba muat ulang halaman.</span></div>'; return; }
    if (!loaded) { el.innerHTML = '<div class="tj-kosong"><b>Memuat data rute Trans Jogja…</b></div>'; return; }
    var all = groups();
    var visible = all.filter(function (r) { return r.name.toLocaleLowerCase('id').indexOf(filterText.toLocaleLowerCase('id')) !== -1; });
    var total = all.reduce(function (sum, r) { return sum + r.km; }, 0);
    el.innerHTML = '<div class="tj-stat"><div class="tj-stat-item"><b>' + all.length + '</b><span>rute</span></div><div class="tj-stat-item"><b>' + total.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '</b><span>km total</span></div><button type="button" class="tj-stat-item' + (stopsVisible ? ' is-on' : '') + '" data-tgj-halte aria-pressed="' + stopsVisible + '" aria-label="Tampilkan halte Trans Jogja"><b>' + (stopsLoaded ? stops.length : 'lihat') + '</b><span>halte</span></button></div>'
      + '<div class="tj-filter-box"><div class="tj-filter-row"><label class="tj-filter-label" for="tgj-search">Cari rute</label><input id="tgj-search" class="tj-filter-search" type="search" value="' + esc(filterText) + '" placeholder="Cari nama atau nomor rute"></div></div>'
      + '<div class="tj-ctrl"><button type="button" class="tj-switch' + (routeVisible ? ' is-on' : '') + '" data-tgj-toggle aria-pressed="' + routeVisible + '"><span class="tj-switch-dot"></span><span class="tj-switch-label">Jalur Trans Jogja</span><span class="tj-switch-count">' + records.length + ' segmen</span></button></div>'
      + '<div class="tj-ctrl"><button type="button" class="tj-switch' + (stopsVisible ? ' is-on' : '') + '" data-tgj-halte-toggle aria-pressed="' + stopsVisible + '"><span class="tj-switch-dot"></span><span class="tj-switch-label">Halte Trans Jogja</span><span class="tj-switch-count">' + (stopsLoaded ? stops.length + ' halte' : 'lihat') + '</span></button></div>'
      + '<div class="tgj-route-list">' + (visible.length ? visible.map(function (r, i) {
        var summary = r.details.join(' · ');
        var summaryShort = summary.length > 180 ? summary.slice(0, 177).trim() + '…' : summary;
        return '<div class="tgj-route-entry"><button type="button" class="tgj-route' + (selectedKey === r.name ? ' is-selected' : '') + '" data-tgj-route="' + esc(r.name) + '"><span class="tgj-route-color" style="background:' + COLORS[i % COLORS.length] + '"></span><span><b>' + esc(r.name) + '</b><small>' + r.count + ' segmen · ' + r.km.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' km</small>' + (summaryShort ? '<small class="tgj-route-summary"><strong>Rute</strong> ' + esc(summaryShort) + '</small>' : '<small class="tgj-route-summary">Informasi rute belum diisi pada data ini.</small>') + '</span></button>'
          + (selectedKey === r.name ? '<div class="tgj-route-details"><div class="tgj-gis-title"><span class="tgj-gis-pin" aria-hidden="true">⌖</span><span><b>Informasi rute</b><small>' + esc(r.name) + '</small></span></div>' + diagramRute(r.details) + '</div>' : '') + '</div>';
      }).join('') : '<div class="tj-empty-row">Tidak ada rute yang cocok.</div>') + '</div>'
      + '<div class="tj-sumber">Sumber data lokal: Trans Jogja v60 (5 Juni 2026). Pilih rute untuk menyorot jalur dan menggeser peta.</div>';
  }

  function setActive(value) {
    active = !!value;
    var cb = document.getElementById('toggleTransjogja');
    if (cb) cb.checked = active;
    if (active) {
      userClosed = false;
      routeVisible = true;
      sudahTerbang = false;
      loadData().then(function () {
        if (!loaded || !active) return;
        showLayer();
        fokusJaringanAwal();
      });
      if (!userClosed && window.SheetDrag) window.SheetDrag.buka(sheetId);
    } else {
      routeVisible = false;
      if (layer && window.map && window.map.hasLayer(layer)) window.map.removeLayer(layer);
      stopsVisible = false;
      if (halteLayer && window.map && window.map.hasLayer(halteLayer)) window.map.removeLayer(halteLayer);
      if (window.SheetDrag) window.SheetDrag.close(sheetId);
    }
    render();
  }

  function setRouteVisible(value) {
    routeVisible = !!value;
    if (routeVisible) {
      if (loaded) showLayer();
      else loadData().then(function () { if (active && routeVisible && loaded) showLayer(); });
    } else if (layer && window.map && window.map.hasLayer(layer)) {
      window.map.removeLayer(layer);
    }
    render();
  }

  function syncCatalogCheckbox(value) {
    var cb = document.getElementById('toggleTransjogja');
    if (cb) cb.checked = !!value;
    if (typeof window.setLayerCatalogCheckboxState === 'function') {
      window.setLayerCatalogCheckboxState('toggleTransjogja', !!value);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var el = sheet();
    if (window.SheetDrag) window.SheetDrag.register(sheetId, {
      el: 'transjogja-sheet', openClass: 'sheet-open', minClass: 'sheet-minimized',
      bodyOpen: 'transjogja-sheet-open', bodyMin: 'transjogja-sheet-minimized',
      handle: '.tj-sheet-handle', header: '.tj-sheet-head', minButton: '.tj-sheet-minimize',
      labelMin: 'Minimalkan panel Trans Jogja', labelOpen: 'Perluas panel Trans Jogja',
      onMinimize: function (minimized) {
        if (!minimized || !active || !loaded || !layer) return;
        // Tunggu sampai sheet selesai bertransisi dan peta memakai ukuran baru.
        window.setTimeout(function () {
          if (!active || !sheet() || !sheet().classList.contains('sheet-minimized')) return;
          if (window.map && typeof window.map.invalidateSize === 'function') window.map.invalidateSize({ pan: false });
          fitViewport();
        }, 360);
      },
      onClose: function () {
        userClosed = true;
        active = false;
        routeVisible = false;
        stopsVisible = false;
        syncCatalogCheckbox(false);
        if (window.map && layer && window.map.hasLayer(layer)) window.map.removeLayer(layer);
        if (window.map && halteLayer && window.map.hasLayer(halteLayer)) window.map.removeLayer(halteLayer);
        render();
      }
    });
    var min = document.getElementById('transjogja-sheet-minimize');
    var close = document.getElementById('transjogja-sheet-close');
    if (min) min.addEventListener('click', function () { if (window.SheetDrag) window.SheetDrag.toggleMinimize(sheetId); });
    if (close) close.addEventListener('click', function () { userClosed = true; if (window.SheetDrag) window.SheetDrag.close(sheetId); });
    if (el) {
      el.addEventListener('input', function (e) { if (e.target.id === 'tgj-search') { filterText = e.target.value; render(); var input = document.getElementById('tgj-search'); if (input) { input.focus(); input.setSelectionRange(filterText.length, filterText.length); } } });
      el.addEventListener('click', function (e) {
        if (e.target.closest('[data-tgj-toggle]')) { setRouteVisible(!routeVisible); return; }
        if (e.target.closest('[data-tgj-halte], [data-tgj-halte-toggle]')) { setStopsVisible(!stopsVisible); return; }
        var route = e.target.closest('[data-tgj-route]');
        if (route) {
          selectedKey = selectedKey === route.dataset.tgjRoute ? '' : route.dataset.tgjRoute;
          if (active && routeVisible) showLayer();
          var g = groups().find(function (r) { return r.name === selectedKey; });
          if (selectedKey && g) fitArea(g.bounds, 16);
          render();
        }
      });
    }
  });

  window.toggleTransjogja = setActive;
  window.isTransjogjaActive = function () { return active; };
})();
