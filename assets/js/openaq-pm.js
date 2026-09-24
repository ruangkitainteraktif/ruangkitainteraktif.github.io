/* ── OpenAQ Air Quality PM2.5 / PM10 / PM1 — FeatureServer + markercluster ── */
(function () {
  'use strict';

  var BASE = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/ArcGIS/rest/services/Air_Quality_PM25_Latest_Results/FeatureServer';
  var LAYERS = {
    'pm25': {
      query: BASE + '/0/query',
      toggleId: 'toggleOpenaqPm25',
      infoId: 'openaqPm25Info',
      title: 'PM2.5 (OpenAQ)',
      label: 'PM2.5',
      activeFn: 'isOpenaqPm25Active',
      objProp: 'openaqPm25LayerObj'
    },
    'pm10': {
      query: BASE + '/1/query',
      toggleId: 'toggleOpenaqPm10',
      infoId: 'openaqPm10Info',
      title: 'PM10 (OpenAQ)',
      label: 'PM10',
      activeFn: 'isOpenaqPm10Active',
      objProp: 'openaqPm10LayerObj'
    },
    'pm1': {
      query: BASE + '/2/query',
      toggleId: 'toggleOpenaqPm1',
      infoId: 'openaqPm1Info',
      title: 'PM1 (OpenAQ)',
      label: 'PM1',
      activeFn: 'isOpenaqPm1Active',
      objProp: 'openaqPm1LayerObj'
    }
  };
  var OUT_FIELDS = 'OBJECTID,location_id,city,location,country,country_name,lastUpdated,value,unit,value_2,unit_2,parameter,owner_name,provider_name,instrument_name,url';
  var PAGE_SIZE = 1000;
  var MAX_PER_VIEW = 12000;
  var LOAD_DEBOUNCE_MS = 350;

  function newCluster() {
    return L.markerClusterGroup({
      maxClusterRadius: 45,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true
    });
  }

  var state = {
    'pm25': { layer: newCluster(), visible: false, loadedIds: Object.create(null), loadedCount: 0, loadTimer: null, loadSeq: 0 },
    'pm10': { layer: newCluster(), visible: false, loadedIds: Object.create(null), loadedCount: 0, loadTimer: null, loadSeq: 0 },
    'pm1':  { layer: newCluster(), visible: false, loadedIds: Object.create(null), loadedCount: 0, loadTimer: null, loadSeq: 0 }
  };

  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  /* US EPA AQI breakpoints (µg/m3): PM2.5 & PM1 use same scale; PM10 looser */
  function valueColor(kind, val) {
    var n = parseFloat(val);
    if (isNaN(n)) return '#94a3b8';
    var t;
    if (kind === 'pm10') {
      if (n <= 54) return '#22c55e';
      if (n <= 154) return '#eab308';
      if (n <= 254) return '#f97316';
      if (n <= 354) return '#dc2626';
      if (n <= 424) return '#a855f7';
      return '#7f1d1d';
    }
    if (n <= 12) return '#22c55e';
    if (n <= 35.4) return '#eab308';
    if (n <= 55.4) return '#f97316';
    if (n <= 150.4) return '#dc2626';
    if (n <= 250.4) return '#a855f7';
    return '#7f1d1d';
  }

  function valueCategory(kind, val) {
    var n = parseFloat(val);
    if (isNaN(n)) return '-';
    if (kind === 'pm10') {
      if (n <= 54) return 'Baik';
      if (n <= 154) return 'Sedang';
      if (n <= 254) return 'Tidak Sehat (Sensitif)';
      if (n <= 354) return 'Tidak Sehat';
      if (n <= 424) return 'Sangat Tidak Sehat';
      return 'Berbahaya';
    }
    if (n <= 12) return 'Baik';
    if (n <= 35.4) return 'Sedang';
    if (n <= 55.4) return 'Tidak Sehat (Sensitif)';
    if (n <= 150.4) return 'Tidak Sehat';
    if (n <= 250.4) return 'Sangat Tidak Sehat';
    return 'Berbahaya';
  }

  function getMarkerRadius(val) {
    var n = parseFloat(val);
    if (isNaN(n)) return 4;
    if (n >= 150) return 8;
    if (n >= 55) return 7;
    if (n >= 35) return 6;
    if (n >= 12) return 5;
    return 4;
  }

  function formatTime(iso) {
    if (!iso) return '-';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear() +
      ' · ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ' UTC';
  }

  function buildPopupHtml(p, cfg) {
    var color = valueColor(cfg.label.toLowerCase() === 'pm10' ? 'pm10' : 'pm', p.value);
    var kind = cfg.label.toLowerCase() === 'pm10' ? 'pm10' : 'pm';
    var val = p.value != null ? parseFloat(p.value) : null;
    var valText = val != null && !isNaN(val) ? val.toFixed(1) + ' ' + (p.unit || 'µg/m³') : '-';
    var place = p.location || p.city || '-';
    var country = p.country_name || p.country || '-';

    var html = '<div class="quake-popup" style="min-width:240px">';
    html += '<div class="quake-popup-header">';
    html += '<div class="quake-popup-status"><span class="quake-popup-status-dot" style="background:' + color + '"></span>' + escapeHtml(cfg.title) + '</div>';
    html += '<div class="quake-popup-region">' + escapeHtml(valueCategory(kind, p.value)) + '</div>';
    html += '</div>';

    html += '<div class="quake-popup-mag-display">';
    html += '<div class="quake-popup-mag-circle" style="background:' + color + '">';
    html += '<span class="quake-popup-mag-num">' + escapeHtml(val != null && !isNaN(val) ? String(Math.round(val)) : '-') + '</span>';
    html += '<span class="quake-popup-mag-label">' + escapeHtml(cfg.label) + '</span>';
    html += '</div>';
    html += '<div class="quake-popup-mag-info">';
    html += '<div class="quake-popup-potensi">Konsentrasi Massa</div>';
    html += '<div class="quake-popup-time">' + escapeHtml(valText) + '</div>';
    html += '</div></div>';

    html += '<div class="quake-popup-details">';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Lokasi</span><span class="quake-popup-detail-value">' + escapeHtml(place) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Negara</span><span class="quake-popup-detail-value">' + escapeHtml(country) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Parameter</span><span class="quake-popup-detail-value">' + escapeHtml(p.parameter || cfg.label) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Pemilik</span><span class="quake-popup-detail-value">' + escapeHtml(p.owner_name || p.provider_name || '-') + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Update</span><span class="quake-popup-detail-value">' + escapeHtml(formatTime(p.lastUpdated)) + '</span></div>';
    if (p.url) {
      html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Stasiun</span><span class="quake-popup-detail-value"><a href="' + escapeHtml(p.url) + '" target="_blank" rel="noopener">Buka</a></span></div>';
    }
    html += '</div>';

    html += '<div class="quake-popup-footer"><span>Sumber: OpenAQ · ID: ' + escapeHtml(p.OBJECTID != null ? p.OBJECTID : '-') + '</span></div>';
    html += '</div>';
    return html;
  }

  function setInfo(cfg, text) {
    var info = document.getElementById(cfg.infoId);
    if (info) info.textContent = text;
  }

  function anyVisible() {
    return Object.keys(state).some(function (k) { return state[k].visible; });
  }

  function showLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('openaq-pm');
    if (typeof addUnifiedLegend !== 'function') return;
    var div = L.DomUtil.create('div', 'hotspot-legend');
    L.DomEvent.disableClickPropagation(div);
    div.innerHTML =
      '<div class="hotspot-legend-title">Kualitas Udara — PM (OpenAQ)</div>' +
      '<div class="hotspot-legend-total">Kategori AQI (US EPA) · PM2.5/PM1 · µg/m³</div>' +
      '<div class="hotspot-legend-items">' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#22c55e;"></span>Baik (PM2.5 ≤12 · PM10 ≤54)</div>' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#eab308;"></span>Sedang (PM2.5 ≤35.4 · PM10 ≤154)</div>' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#f97316;"></span>Tidak Sehat Sensitif (≤55.4 · ≤254)</div>' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#dc2626;"></span>Tidak Sehat (≤150.4 · ≤354)</div>' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#a855f7;"></span>Sangat Tidak Sehat (≤250.4 · ≤424)</div>' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#7f1d1d;"></span>Berbahaya (&gt;250.4 · &gt;424)</div>' +
      '</div>' +
      '<div class="hotspot-legend-source">Sumber: OpenAQ · US EPA breakpoints</div>';
    addUnifiedLegend('openaq-pm', typeof createLegendWithToggle === 'function' ? createLegendWithToggle(div) : div);
  }

  function hideLegend() {
    if (anyVisible()) return;
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('openaq-pm');
  }

  function addFeature(st, cfg, kind, f) {
    var p = f && f.properties;
    var c = f && f.geometry && f.geometry.coordinates;
    if (!p || !c) return false;
    var key = p.OBJECTID != null ? String(p.OBJECTID) : null;
    if (!key || st.loadedIds[key]) return false;
    st.loadedIds[key] = 1;

    var lon = parseFloat(c[0]);
    var lat = parseFloat(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;

    var color = valueColor(cfg.label.toLowerCase() === 'pm10' ? 'pm10' : 'pm', p.value);
    var marker = L.circleMarker([lat, lon], {
      radius: getMarkerRadius(p.value),
      color: color,
      weight: 1,
      opacity: 0.9,
      fillColor: color,
      fillOpacity: 0.75,
      properties: p
    });
    marker.feature = { type: 'Feature', properties: p, geometry: f.geometry };
    marker.bindPopup(buildPopupHtml(p, cfg), { maxWidth: 340, className: 'quake-leaflet-popup' });
    st.layer.addLayer(marker);
    st.loadedCount += 1;
    return true;
  }

  function buildQueryUrl(cfg, bbox, offset) {
    var geom = JSON.stringify({
      xmin: bbox.getWest(),
      ymin: bbox.getSouth(),
      xmax: bbox.getEast(),
      ymax: bbox.getNorth(),
      spatialReference: { wkid: 4326 }
    });
    var params = [
      'where=' + encodeURIComponent('1=1'),
      'geometry=' + encodeURIComponent(geom),
      'geometryType=esriGeometryEnvelope',
      'inSR=4326',
      'spatialRel=esriSpatialRelIntersects',
      'outFields=' + encodeURIComponent(OUT_FIELDS),
      'returnGeometry=true',
      'outSR=4326',
      'f=geojson',
      'resultOffset=' + (offset || 0),
      'resultRecordCount=' + PAGE_SIZE,
      'orderByFields=' + encodeURIComponent('OBJECTID')
    ];
    return cfg.query + '?' + params.join('&');
  }

  async function loadViewport(kind) {
    var cfg = LAYERS[kind];
    var st = state[kind];
    if (!st.visible || typeof map === 'undefined' || !map) return;
    var seq = ++st.loadSeq;
    var bbox = map.getBounds();
    var offset = 0;
    var added = 0;

    try {
      while (offset < MAX_PER_VIEW) {
        if (seq !== st.loadSeq || !st.visible) return;
        var res = await fetch(buildQueryUrl(cfg, bbox, offset));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var json = await res.json();
        if (json && json.error) throw new Error(json.error.message || 'ArcGIS error');
        var features = (json && json.features) || [];
        for (var i = 0; i < features.length; i++) {
          if (addFeature(st, cfg, kind, features[i])) added += 1;
        }
        if (features.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      if (seq !== st.loadSeq || !st.visible) return;
      setInfo(cfg, st.loadedCount + ' stasiun (viewport) · OpenAQ');
      if (added === 0 && st.loadedCount === 0) {
        setInfo(cfg, 'Tidak ada stasiun di area ini');
      }
      st.layer.fire('load');
    } catch (e) {
      console.error('[OpenAQ ' + kind + '] Error:', e);
      st.layer.fire('error', { error: e });
      if (seq === st.loadSeq) setInfo(cfg, 'Gagal memuat data OpenAQ');
    }
  }

  function scheduleLoad(kind) {
    var st = state[kind];
    if (st.loadTimer) clearTimeout(st.loadTimer);
    st.loadTimer = setTimeout(function () {
      st.loadTimer = null;
      loadViewport(kind);
    }, LOAD_DEBOUNCE_MS);
  }

  function onMapMove(e) {
    var kind = e && e.kind;
    if (kind) {
      if (state[kind].visible) scheduleLoad(kind);
      return;
    }
    Object.keys(state).forEach(function (k) {
      if (state[k].visible) scheduleLoad(k);
    });
  }

  function bindMapOnce() {
    if (bindMapOnce._bound) return;
    bindMapOnce._bound = true;
    map.on('moveend zoomend', function () {
      onMapMove({ kind: null });
    });
  }

  function show(kind) {
    var cfg = LAYERS[kind];
    var st = state[kind];
    st.visible = true;
    bindMapOnce();
    if (!map.hasLayer(st.layer)) st.layer.addTo(map);
    setInfo(cfg, 'Memuat stasiun OpenAQ…');
    showLegend();
    loadViewport(kind);
  }

  function hide(kind) {
    var cfg = LAYERS[kind];
    var st = state[kind];
    st.visible = false;
    st.loadSeq += 1;
    if (st.loadTimer) {
      clearTimeout(st.loadTimer);
      st.loadTimer = null;
    }
    if (map.hasLayer(st.layer)) map.removeLayer(st.layer);
    hideLegend();
    setInfo(cfg, 'Stasiun OpenAQ ' + cfg.label + ' (live)');
  }

  document.addEventListener('DOMContentLoaded', function () {
    Object.keys(LAYERS).forEach(function (kind) {
      var cfg = LAYERS[kind];
      var cb = document.getElementById(cfg.toggleId);
      if (cb) {
        cb.addEventListener('change', function () {
          if (this.checked) show(kind);
          else hide(kind);
        });
      }
    });
  });

  window.isOpenaqPm25Active = function () { return state['pm25'].visible; };
  window.isOpenaqPm10Active = function () { return state['pm10'].visible; };
  window.isOpenaqPm1Active = function () { return state['pm1'].visible; };
  Object.defineProperty(window, 'openaqPm25LayerObj', { get: function () { return state['pm25'].layer; } });
  Object.defineProperty(window, 'openaqPm10LayerObj', { get: function () { return state['pm10'].layer; } });
  Object.defineProperty(window, 'openaqPm1LayerObj', { get: function () { return state['pm1'].layer; } });
})();
