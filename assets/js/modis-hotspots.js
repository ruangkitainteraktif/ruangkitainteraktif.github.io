/* ── Hotspot MODIS Thermal — MODIS_Thermal_v1 (48 jam + 7 hari) + markercluster ── */
(function () {
  'use strict';

  var BASE = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/ArcGIS/rest/services/MODIS_Thermal_v1/FeatureServer';
  var LAYERS = {
    '48h': {
      query: BASE + '/0/query',
      whereBase: 'HOURS_OLD <= 48',
      infoId: 'modisHotspots48Info',
      activeFn: 'isModisHotspots48Active',
      objProp: 'modisHotspots48LayerObj'
    },
    '7d': {
      query: BASE + '/1/query',
      whereBase: 'DAY_OF_ACQ <= 7',
      infoId: 'modisHotspots7dInfo',
      activeFn: 'isModisHotspots7dActive',
      objProp: 'modisHotspots7dLayerObj'
    }
  };
  var OUT_FIELDS = 'OBJECTID,BRIGHTNESS,SATELLITE,CONFIDENCE,FRP,ACQ_DATE,DAYNIGHT,HOURS_OLD,DAY_OF_ACQ,BRIGHT_T31,VERSION';
  var PAGE_SIZE = 4000;
  var MAX_PER_VIEW = 20000;
  var LOAD_DEBOUNCE_MS = 350;

  var state = {
    '48h': {
      layer: L.markerClusterGroup({
        maxClusterRadius: 45,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true
      }),
      visible: false,
      loadedIds: Object.create(null),
      loadedCount: 0,
      loadTimer: null,
      loadSeq: 0
    },
    '7d': {
      layer: L.markerClusterGroup({
        maxClusterRadius: 45,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true
      }),
      visible: false,
      loadedIds: Object.create(null),
      loadedCount: 0,
      loadTimer: null,
      loadSeq: 0
    }
  };

  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function confColor(pct) {
    var n = parseFloat(pct);
    if (isNaN(n)) return '#22c55e';
    if (n >= 80) return '#dc2626';
    if (n >= 50) return '#f59e0c';
    return '#22c55e';
  }

  function confLabel(pct) {
    var n = parseFloat(pct);
    if (isNaN(n)) return '-';
    if (n >= 80) return 'High (' + Math.round(n) + '%)';
    if (n >= 50) return 'Nominal (' + Math.round(n) + '%)';
    return 'Low (' + Math.round(n) + '%)';
  }

  function getMarkerRadius(fr, hoursOld) {
    if (fr >= 100) return 9;
    if (fr >= 50) return 8;
    if (fr >= 20) return 7;
    if (fr >= 10) return 6;
    if (hoursOld != null && hoursOld <= 6) return 5;
    return 4;
  }

  function whereForZoom(cfg, z) {
    if (z <= 3) return cfg.whereBase + ' AND CONFIDENCE >= 80';
    if (z <= 6) return cfg.whereBase + ' AND CONFIDENCE >= 50';
    return cfg.whereBase;
  }

  function filterLabel(z) {
    if (z <= 3) return 'conf ≥80%';
    if (z <= 6) return 'conf ≥50%';
    return 'semua conf';
  }

  function formatUtc(ms) {
    if (ms == null || isNaN(ms)) return '-';
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '-';
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear() +
      ' · ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ' UTC';
  }

  function buildPopupHtml(p, kind) {
    var color = confColor(p.CONFIDENCE);
    var frp = p.FRP != null ? parseFloat(p.FRP) : null;
    var frpText = frp != null && !isNaN(frp) ? frp.toFixed(1) + ' MW' : '-';
    var daynight = p.DAYNIGHT === 'D' ? 'Siang' : (p.DAYNIGHT === 'N' ? 'Malam' : (p.DAYNIGHT || '-'));
    var satMap = { 'A': 'Aqua', 'T': 'Terra' };
    var sat = satMap[p.SATELLITE] || p.SATELLITE || '-';
    var title = kind === '7d' ? 'Hotspot MODIS (7 Hari)' : 'Hotspot MODIS (48 Jam)';

    var html = '<div class="quake-popup" style="min-width:240px">';
    html += '<div class="quake-popup-header">';
    html += '<div class="quake-popup-status"><span class="quake-popup-status-dot" style="background:' + color + '"></span>' + title + '</div>';
    html += '<div class="quake-popup-region">Confidence: ' + escapeHtml(confLabel(p.CONFIDENCE)) + '</div>';
    html += '</div>';

    html += '<div class="quake-popup-mag-display">';
    html += '<div class="quake-popup-mag-circle" style="background:' + color + '">';
    html += '<span class="quake-popup-mag-num">' + escapeHtml(frp != null && !isNaN(frp) ? String(Math.round(frp)) : '-') + '</span>';
    html += '<span class="quake-popup-mag-label">FRP</span>';
    html += '</div>';
    html += '<div class="quake-popup-mag-info">';
    html += '<div class="quake-popup-potensi">Fire Radiative Power</div>';
    if (p.HOURS_OLD != null) {
      html += '<div class="quake-popup-time">' + escapeHtml(String(p.HOURS_OLD)) + ' jam lalu · ' + escapeHtml(daynight) + '</div>';
    } else {
      html += '<div class="quake-popup-time">' + escapeHtml(formatUtc(p.ACQ_DATE)) + '</div>';
    }
    html += '</div></div>';

    html += '<div class="quake-popup-details">';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Satelit</span><span class="quake-popup-detail-value">' + escapeHtml(sat) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Confidence</span><span class="quake-popup-detail-value">' + escapeHtml(String(p.CONFIDENCE != null ? p.CONFIDENCE + '%' : '-')) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">FRP</span><span class="quake-popup-detail-value">' + escapeHtml(frpText) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Brightness</span><span class="quake-popup-detail-value">' +
      escapeHtml(p.BRIGHTNESS != null ? Number(p.BRIGHTNESS).toFixed(1) + ' K' : '-') + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Waktu</span><span class="quake-popup-detail-value">' +
      escapeHtml(formatUtc(p.ACQ_DATE)) + '</span></div>';
    html += '</div>';

    html += '<div class="quake-popup-footer"><span>Sumber: MODIS · ID: ' + escapeHtml(p.OBJECTID != null ? p.OBJECTID : '-') + '</span></div>';
    html += '</div>';
    return html;
  }

  function setInfo(cfg, text) {
    var info = document.getElementById(cfg.infoId);
    if (info) info.textContent = text;
  }

  function showLegend(kind) {
    var id = 'modis-hotspots-' + kind;
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend(id);
    if (typeof addUnifiedLegend !== 'function') return;
    var title = kind === '7d' ? 'Hotspot MODIS (7 Hari)' : 'Hotspot MODIS (48 Jam)';
    var div = L.DomUtil.create('div', 'hotspot-legend');
    L.DomEvent.disableClickPropagation(div);
    div.innerHTML =
      '<div class="hotspot-legend-title">' + title + '</div>' +
      '<div class="hotspot-legend-total">Filter per zoom: z≤3 conf ≥80% · z4–6 conf ≥50% · z&gt;6 semua</div>' +
      '<div class="hotspot-legend-items">' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#dc2626;"></span>High (≥80%)</div>' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#f59e0c;"></span>Nominal (50–79%)</div>' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#22c55e;"></span>Low (&lt;50%)</div>' +
      '</div>' +
      '<div class="hotspot-legend-source">Sumber: MODIS Terra/Aqua (NASA FIRMS)</div>';
    addUnifiedLegend(id, typeof createLegendWithToggle === 'function' ? createLegendWithToggle(div) : div);
  }

  function hideLegend(kind) {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('modis-hotspots-' + kind);
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

    var frp = p.FRP != null ? parseFloat(p.FRP) : 0;
    if (isNaN(frp)) frp = 0;
    var color = confColor(p.CONFIDENCE);
    var marker = L.circleMarker([lat, lon], {
      radius: getMarkerRadius(frp, p.HOURS_OLD),
      color: color,
      weight: 1,
      opacity: 0.9,
      fillColor: color,
      fillOpacity: 0.75,
      properties: p
    });
    marker.feature = { type: 'Feature', properties: p, geometry: f.geometry };
    marker.bindPopup(buildPopupHtml(p, kind), { maxWidth: 340, className: 'quake-leaflet-popup' });
    st.layer.addLayer(marker);
    st.loadedCount += 1;
    return true;
  }

  function buildQueryUrl(cfg, bbox, where, offset) {
    var geom = JSON.stringify({
      xmin: bbox.getWest(),
      ymin: bbox.getSouth(),
      xmax: bbox.getEast(),
      ymax: bbox.getNorth(),
      spatialReference: { wkid: 4326 }
    });
    var params = [
      'where=' + encodeURIComponent(where),
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
      'orderByFields=' + encodeURIComponent('HOURS_OLD ASC, FRP DESC')
    ];
    return cfg.query + '?' + params.join('&');
  }

  async function loadViewport(kind) {
    var cfg = LAYERS[kind];
    var st = state[kind];
    if (!st.visible || typeof map === 'undefined' || !map) return;
    var seq = ++st.loadSeq;
    var z = map.getZoom();
    var where = whereForZoom(cfg, z);
    var bbox = map.getBounds();
    var offset = 0;
    var added = 0;

    try {
      while (offset < MAX_PER_VIEW) {
        if (seq !== st.loadSeq || !st.visible) return;
        var res = await fetch(buildQueryUrl(cfg, bbox, where, offset));
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
      setInfo(cfg, st.loadedCount + ' hotspot (viewport) · ' + filterLabel(z));
      if (added === 0 && st.loadedCount === 0) {
        setInfo(cfg, 'Tidak ada hotspot (' + filterLabel(z) + ')');
      }
      st.layer.fire('load');
    } catch (e) {
      console.error('[MODIS ' + kind + '] Error:', e);
      st.layer.fire('error', { error: e });
      if (seq === st.loadSeq) setInfo(cfg, 'Gagal memuat hotspot MODIS');
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
    if (state['48h'].visible) scheduleLoad('48h');
    if (state['7d'].visible) scheduleLoad('7d');
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
    setInfo(cfg, 'Memuat hotspot MODIS…');
    showLegend(kind);
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
    hideLegend(kind);
    setInfo(cfg, kind === '7d' ? 'Hotspot MODIS 7 hari (Terra/Aqua)' : 'Hotspot MODIS 48 jam (Terra/Aqua)');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var cb48 = document.getElementById('toggleModisHotspots48');
    var cb7d = document.getElementById('toggleModisHotspots7d');
    if (cb48) {
      cb48.addEventListener('change', function () {
        if (this.checked) show('48h');
        else hide('48h');
      });
    }
    if (cb7d) {
      cb7d.addEventListener('change', function () {
        if (this.checked) show('7d');
        else hide('7d');
      });
    }
  });

  window.isModisHotspots48Active = function () { return state['48h'].visible; };
  window.isModisHotspots7dActive = function () { return state['7d'].visible; };
  Object.defineProperty(window, 'modisHotspots48LayerObj', {
    get: function () { return state['48h'].layer; }
  });
  Object.defineProperty(window, 'modisHotspots7dLayerObj', {
    get: function () { return state['7d'].layer; }
  });
})();
