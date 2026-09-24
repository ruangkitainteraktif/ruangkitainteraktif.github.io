/* ── Hotspot VIIRS Global — Satellite_VIIRS_Thermal_Hotspots + markercluster ── */
(function () {
  'use strict';

  var VIIRS_QUERY = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/ArcGIS/rest/services/Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query';
  var OUT_FIELDS = 'OBJECTID,latitude,longitude,bright_ti4,acq_date,acq_time,satellite,confidence,frp,daynight,hours_old,bright_ti5,version';
  var PAGE_SIZE = 4000;
  var MAX_PER_VIEW = 20000;
  var LOAD_DEBOUNCE_MS = 350;

  var viirsLayer = L.markerClusterGroup({
    maxClusterRadius: 45,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true
  });
  var viirsVisible = false;
  var loadedIds = Object.create(null);
  var loadedCount = 0;
  var loadTimer = null;
  var loadSeq = 0;

  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function confidenceColor(level) {
    var c = String(level || '').toLowerCase();
    if (c === 'high') return '#dc2626';
    if (c === 'nominal' || c === 'medium') return '#f59e0c';
    return '#22c55e';
  }

  function confidenceLabel(level) {
    var c = String(level || '').toLowerCase();
    if (c === 'high') return 'High';
    if (c === 'nominal' || c === 'medium') return 'Nominal';
    if (c === 'low') return 'Low';
    return level || '-';
  }

  function getMarkerRadius(fr, hoursOld) {
    if (fr >= 100) return 9;
    if (fr >= 50) return 8;
    if (fr >= 20) return 7;
    if (fr >= 10) return 6;
    if (hoursOld != null && hoursOld <= 6) return 5;
    return 4;
  }

  function whereForZoom(z) {
    if (z <= 3) return "confidence = 'high' AND hours_old <= 24";
    if (z <= 6) return "confidence IN ('high','nominal') AND hours_old <= 24";
    return 'hours_old <= 24';
  }

  function filterLabel(z) {
    if (z <= 3) return 'high · 24 jam';
    if (z <= 6) return 'high/nominal · 24 jam';
    return '24 jam';
  }

  function formatUtc(ms) {
    if (ms == null || isNaN(ms)) return '-';
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '-';
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear() +
      ' · ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ' UTC';
  }

  function buildPopupHtml(p) {
    var color = confidenceColor(p.confidence);
    var frp = p.frp != null ? parseFloat(p.frp) : null;
    var frpText = frp != null && !isNaN(frp) ? frp.toFixed(1) + ' MW' : '-';
    var daynight = p.daynight === 'D' ? 'Siang' : (p.daynight === 'N' ? 'Malam' : (p.daynight || '-'));
    var satMap = { 'N': 'NOAA-20/21', 'S': 'Suomi NPP', '1': 'NOAA-21', '2': 'NOAA-20' };
    var sat = satMap[p.satellite] || p.satellite || '-';

    var html = '<div class="quake-popup" style="min-width:240px">';
    html += '<div class="quake-popup-header">';
    html += '<div class="quake-popup-status"><span class="quake-popup-status-dot" style="background:' + color + '"></span>Hotspot VIIRS</div>';
    html += '<div class="quake-popup-region">Confidence: ' + escapeHtml(confidenceLabel(p.confidence)) + '</div>';
    html += '</div>';

    html += '<div class="quake-popup-mag-display">';
    html += '<div class="quake-popup-mag-circle" style="background:' + color + '">';
    html += '<span class="quake-popup-mag-num">' + escapeHtml(frp != null && !isNaN(frp) ? String(Math.round(frp)) : '-') + '</span>';
    html += '<span class="quake-popup-mag-label">FRP</span>';
    html += '</div>';
    html += '<div class="quake-popup-mag-info">';
    html += '<div class="quake-popup-potensi">Fire Radiative Power</div>';
    if (p.hours_old != null) {
      html += '<div class="quake-popup-time">' + escapeHtml(String(p.hours_old)) + ' jam lalu · ' + escapeHtml(daynight) + '</div>';
    } else {
      html += '<div class="quake-popup-time">' + escapeHtml(formatUtc(p.acq_time || p.acq_date)) + '</div>';
    }
    html += '</div></div>';

    html += '<div class="quake-popup-details">';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Satelit</span><span class="quake-popup-detail-value">' + escapeHtml(sat) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">FRP</span><span class="quake-popup-detail-value">' + escapeHtml(frpText) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Bright T<sub>4</sub></span><span class="quake-popup-detail-value">' +
      escapeHtml(p.bright_ti4 != null ? Number(p.bright_ti4).toFixed(1) + ' K' : '-') + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Waktu</span><span class="quake-popup-detail-value">' +
      escapeHtml(formatUtc(p.acq_time || p.acq_date)) + '</span></div>';
    html += '</div>';

    html += '<div class="quake-popup-footer"><span>Sumber: VIIRS · ID: ' + escapeHtml(p.OBJECTID != null ? p.OBJECTID : '-') + '</span></div>';
    html += '</div>';
    return html;
  }

  function setInfo(text) {
    var info = document.getElementById('viirsHotspotsInfo');
    if (info) info.textContent = text;
  }

  function showLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('viirs-hotspots');
    if (typeof addUnifiedLegend !== 'function') return;
    var div = L.DomUtil.create('div', 'hotspot-legend');
    L.DomEvent.disableClickPropagation(div);
    div.innerHTML =
      '<div class="hotspot-legend-title">Hotspot VIIRS (24 Jam)</div>' +
      '<div class="hotspot-legend-total">Filter per zoom: z≤3 high · z4–6 high/nominal · z&gt;6 semua</div>' +
      '<div class="hotspot-legend-items">' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#dc2626;"></span>High confidence</div>' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#f59e0c;"></span>Nominal confidence</div>' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#22c55e;"></span>Low confidence</div>' +
      '</div>' +
      '<div class="hotspot-legend-source">Sumber: VIIRS (NOAA-20/21, Suomi NPP) · NASA FIRMS</div>';
    addUnifiedLegend('viirs-hotspots', typeof createLegendWithToggle === 'function' ? createLegendWithToggle(div) : div);
  }

  function hideLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('viirs-hotspots');
  }

  function featureKey(p) {
    if (p && p.OBJECTID != null) return String(p.OBJECTID);
    if (!p) return null;
    return [p.latitude, p.longitude, p.acq_time, p.satellite].join('|');
  }

  function addFeature(f) {
    var p = f && f.properties;
    var c = f && f.geometry && f.geometry.coordinates;
    if (!p || !c) return false;
    var key = featureKey(p);
    if (!key || loadedIds[key]) return false;
    loadedIds[key] = 1;

    var lon = parseFloat(c[0]);
    var lat = parseFloat(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;

    var frp = p.frp != null ? parseFloat(p.frp) : 0;
    if (isNaN(frp)) frp = 0;
    var color = confidenceColor(p.confidence);
    var marker = L.circleMarker([lat, lon], {
      radius: getMarkerRadius(frp, p.hours_old),
      color: color,
      weight: 1,
      opacity: 0.9,
      fillColor: color,
      fillOpacity: 0.75,
      properties: p
    });
    marker.feature = { type: 'Feature', properties: p, geometry: f.geometry };
    marker.bindPopup(buildPopupHtml(p), { maxWidth: 340, className: 'quake-leaflet-popup' });
    viirsLayer.addLayer(marker);
    loadedCount += 1;
    return true;
  }

  function buildQueryUrl(bbox, where, offset) {
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
      'orderByFields=' + encodeURIComponent('hours_old ASC, frp DESC')
    ];
    return VIIRS_QUERY + '?' + params.join('&');
  }

  async function loadViewport() {
    if (!viirsVisible || typeof map === 'undefined' || !map) return;
    var seq = ++loadSeq;
    var z = map.getZoom();
    var where = whereForZoom(z);
    var bbox = map.getBounds();
    var offset = 0;
    var added = 0;

    try {
      while (offset < MAX_PER_VIEW) {
        if (seq !== loadSeq || !viirsVisible) return;
        var res = await fetch(buildQueryUrl(bbox, where, offset));
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var json = await res.json();
        if (json && json.error) throw new Error(json.error.message || 'ArcGIS error');
        var features = (json && json.features) || [];
        for (var i = 0; i < features.length; i++) {
          if (addFeature(features[i])) added += 1;
        }
        if (features.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      if (seq !== loadSeq || !viirsVisible) return;
      setInfo(loadedCount + ' hotspot (viewport) · ' + filterLabel(z));
      if (added === 0 && loadedCount === 0) {
        setInfo('Tidak ada hotspot di area ini (' + filterLabel(z) + ')');
      }
      viirsLayer.fire('load');
    } catch (e) {
      console.error('[VIIRS Hotspots] Error:', e);
      viirsLayer.fire('error', { error: e });
      if (seq === loadSeq) setInfo('Gagal memuat hotspot VIIRS');
    }
  }

  function scheduleLoad() {
    if (loadTimer) clearTimeout(loadTimer);
    loadTimer = setTimeout(function () {
      loadTimer = null;
      loadViewport();
    }, LOAD_DEBOUNCE_MS);
  }

  function onMapMove() {
    if (!viirsVisible) return;
    scheduleLoad();
  }

  function showViirs() {
    viirsVisible = true;
    if (!map.hasLayer(viirsLayer)) viirsLayer.addTo(map);
    map.on('moveend zoomend', onMapMove);
    setInfo('Memuat hotspot VIIRS…');
    showLegend();
    loadViewport();
  }

  function hideViirs() {
    viirsVisible = false;
    loadSeq += 1;
    if (loadTimer) {
      clearTimeout(loadTimer);
      loadTimer = null;
    }
    map.off('moveend zoomend', onMapMove);
    if (map.hasLayer(viirsLayer)) map.removeLayer(viirsLayer);
    hideLegend();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var checkbox = document.getElementById('toggleViirsHotspots');
    if (!checkbox) return;
    checkbox.addEventListener('change', function () {
      if (this.checked) showViirs();
      else hideViirs();
    });
  });

  window.isViirsHotspotsActive = function () { return viirsVisible; };
  Object.defineProperty(window, 'viirsHotspotsLayerObj', {
    get: function () { return viirsLayer; }
  });
})();
