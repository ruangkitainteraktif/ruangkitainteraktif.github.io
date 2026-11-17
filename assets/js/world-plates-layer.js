/* ── World Plate Boundaries Layer (USGS) ── */
(function () {
  'use strict';

  const PLATES_URL = 'https://earthquake.usgs.gov/arcgis/rest/services/eq/map_plateboundaries/MapServer';
  let platesLayer = null;

  function escapeHtml(v) {
    return String(v || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[c]));
  }

  function getBoundaryColor(label) {
    const l = (label || '').toLowerCase();
    if (l.includes('convergent')) return '#dc2626';
    if (l.includes('divergent')) return '#2563eb';
    if (l.includes('transform')) return '#f59e0b';
    return '#6b7280';
  }

  function getBoundaryIcon(label) {
    const l = (label || '').toLowerCase();
    if (l.includes('convergent')) return '🔽';
    if (l.includes('divergent')) return '↔️';
    if (l.includes('transform')) return '↕️';
    return '🌍';
  }

  function buildPopupHtml(features) {
    if (!features || features.length === 0) return null;

    let html = '<div class="quake-popup" style="min-width:220px;">';
    html += '<div class="quake-popup-header"><div class="quake-popup-status"><span class="quake-popup-status-dot" style="background:#2563eb;"></span> Zona Patahan Dunia</div></div>';
    html += '<div style="padding:8px 12px;">';

    features.forEach((f, i) => {
      const a = f.attributes || {};
      const name = a.NAME || '-';
      const label = a.LABEL || '-';
      const color = getBoundaryColor(label);
      const icon = getBoundaryIcon(label);

      if (i > 0) html += '<hr style="margin:8px 0;border:0;border-top:1px solid #e5e7eb;">';

      html += '<div style="margin-bottom:4px;">';
      html += '<div style="font-weight:700;color:' + color + ';font-size:13px;margin-bottom:2px;">' + icon + ' ' + escapeHtml(name) + '</div>';
      html += '<div style="font-size:11px;color:#475569;"><b>Tipe:</b> <span style="color:' + color + ';">' + escapeHtml(label) + '</span></div>';
      html += '</div>';
    });

    html += '<div style="font-size:10px;color:#94a3b8;margin-top:6px;">Sumber: USGS (Bird, 2003)</div>';
    html += '</div></div>';

    return html;
  }

  async function identifyPlates(lat, lon) {
    try {
      const size = map.getSize();
      const bounds = map.getBounds();

      const params = new URLSearchParams({
        geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
        geometryType: 'esriGeometryPoint',
        sr: '4326',
        layers: 'all',
        tolerance: '8',
        mapExtent: JSON.stringify({
          xmin: bounds.getWest(),
          ymin: bounds.getSouth(),
          xmax: bounds.getEast(),
          ymax: bounds.getNorth(),
          spatialReference: { wkid: 4326 }
        }),
        imageDisplay: size.x + ',' + size.y + ',96',
        returnGeometry: 'true',
        outSR: '4326',
        returnCatalogItems: 'false',
        f: 'json'
      });

      const res = await fetch(PLATES_URL + '/identify?' + params.toString());
      if (!res.ok) return [];
      const data = await res.json();
      if (!data.results || data.results.length === 0) return [];

      const features = [];
      data.results.forEach(r => {
        if (r.attributes) {
          features.push({ attributes: r.attributes, geometry: r.geometry, layerName: 'Zona Patahan Dunia (USGS)', latlng: { lat: lat, lng: lon } });
        }
      });
      return features;
    } catch (e) {
      console.error('[WorldPlatesLayer] Identify error:', e);
      return [];
    }
  }

  async function onMapClick(e) {
    if (!platesLayer || !map.hasLayer(platesLayer)) return;

    const lat = e.latlng.lat;
    const lon = e.latlng.lng;

    const features = await identifyPlates(lat, lon);
    if (!platesLayer || !map.hasLayer(platesLayer)) return;
    if (features.length > 0) {
      const html = buildPopupHtml(features);
      window.showFaultIdentifyResult({ latlng: e.latlng, html: html, features: features, tableId: 'fault-selection-usgs' });
    } else {
      window.showFaultIdentifyResult({ latlng: e.latlng, html: '<div class="quake-popup" style="padding:12px;text-align:center;"><span style="font-size:12px;color:#94a3b8;">Tidak ada data zona patahan di lokasi ini.</span></div>' });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    const checkbox = document.getElementById('toggleWorldPlatesLayer');
    if (!checkbox) return;

    checkbox.addEventListener('change', function () {
      if (this.checked) {
        if (!platesLayer) {
          platesLayer = L.esri.dynamicMapLayer({
            url: PLATES_URL,
            opacity: 0.7,
            layers: [0, 1]
          }).addTo(map);
          map.on('click', onMapClick);
        } else {
          platesLayer.addTo(map);
          map.on('click', onMapClick);
        }
      } else {
        if (platesLayer) { map.removeLayer(platesLayer); }
        map.off('click', onMapClick);
        if (window.clearFaultIdentifySelection) window.clearFaultIdentifySelection();
      }
    });
  });

  window._worldPlatesLayerCleanup = function () {
    if (platesLayer) { map.removeLayer(platesLayer); platesLayer = null; }
    map.off('click', onMapClick);
    if (window.clearFaultIdentifySelection) window.clearFaultIdentifySelection();
    const cb = document.getElementById('toggleWorldPlatesLayer');
    if (cb) cb.checked = false;
  };
})();
