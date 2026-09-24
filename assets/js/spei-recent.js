/* ── SPEI recent (1/3/6/9/12 bulan) — polygon gridcode + viewport GeoJSON ── */
(function () {
  'use strict';

  var BASE = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/ArcGIS/rest/services/SPEI_v1_recent/FeatureServer';
  var LAYERS = {
    'spei1m':  { layerId: 0,  toggleId: 'toggleSpei1m',  infoId: 'spei1mInfo',  title: 'SPEI 1 Bulan',  activeFn: 'isSpei1mActive',  objProp: 'spei1mLayerObj' },
    'spei3m':  { layerId: 1,  toggleId: 'toggleSpei3m',  infoId: 'spei3mInfo',  title: 'SPEI 3 Bulan',  activeFn: 'isSpei3mActive',  objProp: 'spei3mLayerObj' },
    'spei6m':  { layerId: 2,  toggleId: 'toggleSpei6m',  infoId: 'spei6mInfo',  title: 'SPEI 6 Bulan',  activeFn: 'isSpei6mActive',  objProp: 'spei6mLayerObj' },
    'spei9m':  { layerId: 3,  toggleId: 'toggleSpei9m',  infoId: 'spei9mInfo',  title: 'SPEI 9 Bulan',  activeFn: 'isSpei9mActive',  objProp: 'spei9mLayerObj' },
    'spei12m': { layerId: 4,  toggleId: 'toggleSpei12m', infoId: 'spei12mInfo', title: 'SPEI 12 Bulan', activeFn: 'isSpei12mActive', objProp: 'spei12mLayerObj' }
  };
  var OUT_FIELDS = 'OBJECTID,gridcode,Rec_Date';
  var PAGE_SIZE = 1000;
  var MAX_PER_VIEW = 6000;
  var LOAD_DEBOUNCE_MS = 350;

  var SPEI_STYLE = {
    '-3': { fill: '#8c510a', label: 'Kekeringan ekstrem' },
    '-2': { fill: '#d8b365', label: 'Kekeringan parah' },
    '-1': { fill: '#f6e8c3', label: 'Kekeringan sedang' },
    '1':  { fill: '#c7eae5', label: 'Lembap ringan' },
    '2':  { fill: '#5ab4ac', label: 'Lembap berat' },
    '3':  { fill: '#01665e', label: 'Lembap ekstrem' },
    'default': { fill: '#cbd5e1', label: 'Normal' }
  };

  var state = {};
  Object.keys(LAYERS).forEach(function (key) {
    var g = L.geoJSON(null, {
      style: styleFn(),
      onEachFeature: function (feature, layer) {
        layer.bindPopup(buildPopupHtml(feature.properties || {}, LAYERS[key]), {
          maxWidth: 320,
          className: 'quake-leaflet-popup'
        });
      }
    });
    g._speiKey = key;
    state[key] = {
      container: g,
      visible: false,
      loadedIds: Object.create(null),
      loadedCount: 0,
      loadTimer: null,
      loadSeq: 0
    };
  });

  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function speiInfo(g) {
    var n = parseInt(g, 10);
    if (isNaN(n)) return SPEI_STYLE['default'];
    return SPEI_STYLE[String(n)] || SPEI_STYLE['default'];
  }

  function styleFn() {
    return function (feature) {
      var g = feature && feature.properties ? feature.properties.gridcode : null;
      var s = speiInfo(g);
      return {
        fillColor: s.fill,
        weight: 0.6,
        opacity: 0.9,
        color: '#fff',
        fillOpacity: 0.78
      };
    };
  }

  function formatDate(ms) {
    if (ms == null || isNaN(ms)) return '-';
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '-';
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
  }

  function buildPopupHtml(p, cfg) {
    var s = speiInfo(p.gridcode);
    var g = p.gridcode != null ? String(p.gridcode) : '-';

    var html = '<div class="quake-popup" style="min-width:220px">';
    html += '<div class="quake-popup-header">';
    html += '<div class="quake-popup-status"><span class="quake-popup-status-dot" style="background:' + s.fill + '"></span>' + escapeHtml(cfg.title) + '</div>';
    html += '<div class="quake-popup-region">' + escapeHtml(s.label) + '</div>';
    html += '</div>';
    html += '<div class="quake-popup-mag-display">';
    html += '<div class="quake-popup-mag-circle" style="background:' + s.fill + '">';
    html += '<span class="quake-popup-mag-num">' + escapeHtml(g) + '</span>';
    html += '<span class="quake-popup-mag-label">SPEI</span>';
    html += '</div>';
    html += '<div class="quake-popup-mag-info">';
    html += '<div class="quake-popup-potensi">' + escapeHtml(s.label) + '</div>';
    html += '<div class="quake-popup-time">' + escapeHtml(formatDate(p.Rec_Date)) + '</div>';
    html += '</div></div>';
    html += '<div class="quake-popup-details">';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Grid Code</span><span class="quake-popup-detail-value">' + escapeHtml(g) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Periode</span><span class="quake-popup-detail-value">' + escapeHtml(cfg.title) + '</span></div>';
    html += '</div>';
    html += '<div class="quake-popup-footer"><span>Sumber: SPEI recent · ID: ' + escapeHtml(p.OBJECTID != null ? p.OBJECTID : '-') + '</span></div>';
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
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('spei-recent');
    if (typeof addUnifiedLegend !== 'function') return;
    var div = L.DomUtil.create('div', 'hotspot-legend');
    L.DomEvent.disableClickPropagation(div);
    div.innerHTML =
      '<div class="hotspot-legend-title">SPEI — Precipitation-Evapotranspiration Index</div>' +
      '<div class="hotspot-legend-total">Gridcode −3 (kering) → +3 (lembap)</div>' +
      '<div class="hotspot-legend-items">' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#8c510a;"></span>−3 Kekeringan ekstrem</div>' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#d8b365;"></span>−2 Kekeringan parah</div>' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#f6e8c3;"></span>−1 Kekeringan sedang</div>' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#cbd5e1;"></span>0 Normal</div>' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#c7eae5;"></span>+1 Lembap ringan</div>' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#5ab4ac;"></span>+2 Lembap berat</div>' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#01665e;"></span>+3 Lembap ekstrem</div>' +
      '</div>' +
      '<div class="hotspot-legend-source">Sumber: SPEI recent (1/3/6/9/12 bulan)</div>';
    addUnifiedLegend('spei-recent', typeof createLegendWithToggle === 'function' ? createLegendWithToggle(div) : div);
  }

  function hideLegend() {
    if (anyVisible()) return;
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('spei-recent');
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
    return BASE + '/' + cfg.layerId + '/query?' + params.join('&');
  }

  async function loadViewport(key) {
    var cfg = LAYERS[key];
    var st = state[key];
    if (!st.visible || typeof map === 'undefined' || !map) return;
    var seq = ++st.loadSeq;
    var bbox = map.getBounds();
    var offset = 0;
    var added = 0;

    st.container.clearLayers();
    st.loadedIds = Object.create(null);
    st.loadedCount = 0;

    try {
      while (offset < MAX_PER_VIEW) {
        if (seq !== st.loadSeq || !st.visible) return;
        var res = await fetch(buildQueryUrl(cfg, bbox, offset));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var json = await res.json();
        if (json && json.error) throw new Error(json.error.message || 'ArcGIS error');
        var features = (json && json.features) || [];
        for (var i = 0; i < features.length; i++) {
          var f = features[i];
          var p = f && f.properties;
          if (!p || !f.geometry) continue;
          var keyId = p.OBJECTID != null ? String(p.OBJECTID) : null;
          if (!keyId || st.loadedIds[keyId]) continue;
          st.loadedIds[keyId] = 1;
          st.container.addData(f);
          st.loadedCount += 1;
          added += 1;
        }
        if (features.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      if (seq !== st.loadSeq || !st.visible) return;
      setInfo(cfg, st.loadedCount + ' poligon (viewport) · SPEI');
      if (added === 0 && st.loadedCount === 0) {
        setInfo(cfg, 'Tidak ada poligon di area ini');
      }
      st.container.fire('load');
    } catch (e) {
      console.error('[SPEI ' + key + '] Error:', e);
      st.container.fire('error', { error: e });
      if (seq === st.loadSeq) setInfo(cfg, 'Gagal memuat data SPEI');
    }
  }

  function scheduleLoad(key) {
    var st = state[key];
    if (st.loadTimer) clearTimeout(st.loadTimer);
    st.loadTimer = setTimeout(function () {
      st.loadTimer = null;
      loadViewport(key);
    }, LOAD_DEBOUNCE_MS);
  }

  function onMapMove(e) {
    var only = e && e.kind;
    if (only) {
      if (state[only].visible) scheduleLoad(only);
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

  function show(key) {
    var cfg = LAYERS[key];
    var st = state[key];
    st.visible = true;
    bindMapOnce();
    if (!map.hasLayer(st.container)) st.container.addTo(map);
    setInfo(cfg, 'Memuat poligon SPEI…');
    showLegend();
    loadViewport(key);
  }

  function hide(key) {
    var cfg = LAYERS[key];
    var st = state[key];
    st.visible = false;
    st.loadSeq += 1;
    if (st.loadTimer) {
      clearTimeout(st.loadTimer);
      st.loadTimer = null;
    }
    if (map.hasLayer(st.container)) map.removeLayer(st.container);
    st.container.clearLayers();
    hideLegend();
    setInfo(cfg, cfg.title + ' (SPEI recent)');
  }

  document.addEventListener('DOMContentLoaded', function () {
    Object.keys(LAYERS).forEach(function (key) {
      var cfg = LAYERS[key];
      var cb = document.getElementById(cfg.toggleId);
      if (cb) {
        cb.addEventListener('change', function () {
          if (this.checked) show(key);
          else hide(key);
        });
      }
    });
  });

  window.isSpei1mActive = function () { return state['spei1m'].visible; };
  window.isSpei3mActive = function () { return state['spei3m'].visible; };
  window.isSpei6mActive = function () { return state['spei6m'].visible; };
  window.isSpei9mActive = function () { return state['spei9m'].visible; };
  window.isSpei12mActive = function () { return state['spei12m'].visible; };
  Object.defineProperty(window, 'spei1mLayerObj', { get: function () { return state['spei1m'].container; } });
  Object.defineProperty(window, 'spei3mLayerObj', { get: function () { return state['spei3m'].container; } });
  Object.defineProperty(window, 'spei6mLayerObj', { get: function () { return state['spei6m'].container; } });
  Object.defineProperty(window, 'spei9mLayerObj', { get: function () { return state['spei9m'].container; } });
  Object.defineProperty(window, 'spei12mLayerObj', { get: function () { return state['spei12m'].container; } });
})();
