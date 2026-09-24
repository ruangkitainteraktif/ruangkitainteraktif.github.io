/* ── Katalog Gempa Global (USGS) — Historical_Quakes + markercluster ── */
(function () {
  'use strict';

  var HISTORICAL_QUERY = 'https://services9.arcgis.com/RHVPKKiFTONKtxq3/ArcGIS/rest/services/Historical_Quakes/FeatureServer/0/query';
  var OUT_FIELDS = 'id,mag,magType,place,depth,kmDepth,time,alert,tsunami,status,url,title';
  var PAGE_SIZE = 4000;
  var MAX_PER_VIEW = 20000;
  var LOAD_DEBOUNCE_MS = 350;

  var historicalLayer = L.markerClusterGroup({
    maxClusterRadius: 45,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true
  });
  var historicalVisible = false;
  var loadedIds = Object.create(null);
  var loadedCount = 0;
  var loading = false;
  var loadTimer = null;
  var loadSeq = 0;

  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function getMarkerColor(mag) {
    if (mag >= 7) return '#991b1b';
    if (mag >= 6) return '#dc2626';
    if (mag >= 5) return '#ea580c';
    if (mag >= 4) return '#f59e0b';
    if (mag >= 3) return '#22c55e';
    return '#3b82f6';
  }

  function getMarkerRadius(mag) {
    if (mag >= 7) return 10;
    if (mag >= 6) return 8;
    if (mag >= 5) return 7;
    if (mag >= 4) return 5;
    if (mag >= 3) return 4;
    return 3;
  }

  function minMagForZoom(z) {
    if (z <= 3) return 6;
    if (z <= 6) return 5;
    return 4;
  }

  function formatUtcTime(ms) {
    if (ms == null || isNaN(ms)) return '-';
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '-';
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear() +
      ' · ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ' UTC';
  }

  function buildPopupHtml(p) {
    var mag = parseFloat(p.mag);
    var magText = isNaN(mag) ? '-' : mag.toFixed(1);
    var color = getMarkerColor(isNaN(mag) ? 0 : mag);
    var html = '<div class="quake-popup" style="min-width:240px">';
    html += '<div class="quake-popup-header">';
    html += '<div class="quake-popup-status"><span class="quake-popup-status-dot" style="background:' + color + '"></span>Katalog Gempa Global</div>';
    html += '<div class="quake-popup-region">' + escapeHtml(p.place || p.title || '-') + '</div>';
    html += '</div>';

    html += '<div class="quake-popup-mag-display">';
    html += '<div class="quake-popup-mag-circle" style="background:' + color + '">';
    html += '<span class="quake-popup-mag-num">' + escapeHtml(magText) + '</span>';
    html += '<span class="quake-popup-mag-label">MAG</span>';
    html += '</div>';
    html += '<div class="quake-popup-mag-info">';
    if (p.tsunami === 1 || p.tsunami === '1') {
      html += '<div class="quake-popup-potensi" style="color:#dc2626;font-weight:700">⚠ TSUNAMI</div>';
    } else {
      html += '<div class="quake-popup-potensi">Tidak ada potensi tsunami</div>';
    }
    if (p.alert) {
      html += '<div class="quake-popup-potensi" style="color:#ea580c;font-weight:600">PAGER: ' + escapeHtml(String(p.alert).toUpperCase()) + '</div>';
    }
    html += '<div class="quake-popup-time">' + escapeHtml(formatUtcTime(p.time)) + '</div>';
    html += '</div></div>';

    html += '<div class="quake-popup-details">';
    var depth = p.kmDepth != null ? p.kmDepth : p.depth;
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Kedalaman</span><span class="quake-popup-detail-value">' + escapeHtml(depth != null ? depth : '-') + ' km</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Status</span><span class="quake-popup-detail-value">' + escapeHtml(p.status || '-') + '</span></div>';
    if (p.magType) {
      html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Tipe Mag</span><span class="quake-popup-detail-value">' + escapeHtml(p.magType) + '</span></div>';
    }
    html += '</div>';

    var link = p.url || p.detail;
    html += '<div class="quake-popup-footer"><span>Sumber: USGS · ID: ' + escapeHtml(p.id || '-') +
      (link ? ' · <a href="' + escapeHtml(link) + '" target="_blank" rel="noopener">Detail</a>' : '') +
      '</span></div>';
    html += '</div>';
    return html;
  }

  function setInfo(text) {
    var info = document.getElementById('historicalQuakesInfo');
    if (info) info.textContent = text;
  }

  function showLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('historical-quakes');
    if (typeof addUnifiedLegend !== 'function') return;
    var div = L.DomUtil.create('div', 'hotspot-legend');
    L.DomEvent.disableClickPropagation(div);
    div.innerHTML =
      '<div class="hotspot-legend-title">Katalog Gempa Global (USGS)</div>' +
      '<div class="hotspot-legend-total">Filter per zoom: z≤3 M6+ · z4–6 M5+ · z&gt;6 M4+</div>' +
      '<div class="hotspot-legend-items">' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#991b1b;"></span>M ≥ 7.0 (Great)</div>' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#dc2626;"></span>M 6.0–6.9 (Strong)</div>' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#ea580c;"></span>M 5.0–5.9 (Moderate)</div>' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#f59e0b;"></span>M 4.0–4.9 (Light)</div>' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#22c55e;"></span>M 3.0–3.9 (Minor)</div>' +
        '<div class="hotspot-legend-item"><span class="hotspot-legend-dot" style="background:#3b82f6;"></span>M &lt; 3.0 (Micro)</div>' +
      '</div>' +
      '<div class="hotspot-legend-source">Sumber: USGS Earthquake Catalog</div>';
    addUnifiedLegend('historical-quakes', typeof createLegendWithToggle === 'function' ? createLegendWithToggle(div) : div);
  }

  function hideLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('historical-quakes');
  }

  function featureKey(p, geom) {
    if (p && p.id != null && p.id !== '') return String(p.id);
    if (!geom || !geom.coordinates) return null;
    return String(p && p.time != null ? p.time : geom.coordinates.join(',')) + '|' + String(p && p.mag != null ? p.mag : '');
  }

  function addFeature(f) {
    var p = f && f.properties;
    var c = f && f.geometry && f.geometry.coordinates;
    if (!p || !c) return false;
    var key = featureKey(p, f.geometry);
    if (!key || loadedIds[key]) return false;
    loadedIds[key] = 1;

    var lon = parseFloat(c[0]);
    var lat = parseFloat(c[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;

    var mag = parseFloat(p.mag) || 0;
    var color = getMarkerColor(mag);
    var marker = L.circleMarker([lat, lon], {
      radius: getMarkerRadius(mag),
      color: color,
      weight: 1,
      opacity: 0.9,
      fillColor: color,
      fillOpacity: 0.7,
      properties: p
    });
    marker.feature = { type: 'Feature', properties: p, geometry: f.geometry };
    marker.bindPopup(buildPopupHtml(p), { maxWidth: 340, className: 'quake-leaflet-popup' });
    historicalLayer.addLayer(marker);
    loadedCount += 1;
    return true;
  }

  function buildQueryUrl(bbox, minMag, offset) {
    var geom = JSON.stringify({
      xmin: bbox.getWest(),
      ymin: bbox.getSouth(),
      xmax: bbox.getEast(),
      ymax: bbox.getNorth(),
      spatialReference: { wkid: 4326 }
    });
    var params = [
      'where=' + encodeURIComponent('mag >= ' + minMag),
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
      'orderByFields=' + encodeURIComponent('mag DESC')
    ];
    return HISTORICAL_QUERY + '?' + params.join('&');
  }

  async function loadViewport() {
    if (!historicalVisible || typeof map === 'undefined' || !map) return;
    var seq = ++loadSeq;
    loading = true;
    var minMag = minMagForZoom(map.getZoom());
    var bbox = map.getBounds();
    var offset = 0;
    var added = 0;

    try {
      while (offset < MAX_PER_VIEW) {
        if (seq !== loadSeq || !historicalVisible) return;
        var res = await fetch(buildQueryUrl(bbox, minMag, offset));
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
      if (seq !== loadSeq || !historicalVisible) return;
      setInfo(loadedCount + ' gempa M' + minMag + '+ (viewport, kumulatif)');
      if (added === 0 && loadedCount === 0) {
        setInfo('Tidak ada gempa M' + minMag + '+ di area ini');
      }
      historicalLayer.fire('load');
    } catch (e) {
      console.error('[Historical Quakes] Error:', e);
      historicalLayer.fire('error', { error: e });
      if (seq === loadSeq) setInfo('Gagal memuat katalog gempa global');
    } finally {
      if (seq === loadSeq) loading = false;
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
    if (!historicalVisible) return;
    scheduleLoad();
  }

  function showHistorical() {
    historicalVisible = true;
    if (!map.hasLayer(historicalLayer)) historicalLayer.addTo(map);
    map.on('moveend zoomend', onMapMove);
    setInfo('Memuat katalog gempa global…');
    showLegend();
    loadViewport();
  }

  function hideHistorical() {
    historicalVisible = false;
    loadSeq += 1;
    if (loadTimer) {
      clearTimeout(loadTimer);
      loadTimer = null;
    }
    map.off('moveend zoomend', onMapMove);
    if (map.hasLayer(historicalLayer)) map.removeLayer(historicalLayer);
    hideLegend();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var checkbox = document.getElementById('toggleHistoricalQuakes');
    if (!checkbox) return;
    checkbox.addEventListener('change', function () {
      if (this.checked) showHistorical();
      else hideHistorical();
    });
  });

  window.isHistoricalQuakesActive = function () { return historicalVisible; };
  Object.defineProperty(window, 'historicalQuakesLayerObj', {
    get: function () { return historicalLayer; }
  });
})();
