/* ── World Plate Boundaries Layer (USGS) ── */
(function () {
  'use strict';

  const PLATES_URL = 'https://earthquake.usgs.gov/arcgis/rest/services/eq/map_plateboundaries/MapServer';
  let platesLayer = null;
  let platesPopupMarker = null;

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
        returnGeometry: 'false',
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
          features.push({ attributes: r.attributes });
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

    if (platesPopupMarker) { map.removeLayer(platesPopupMarker); platesPopupMarker = null; }

    const icon = L.divIcon({
      className: 'geoid-marker-wrap',
      html: '<div class="geoid-marker" role="img"><svg viewBox="0 0 24 24"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg></div>',
      iconSize: [48, 54],
      iconAnchor: [24, 52],
      popupAnchor: [0, -52]
    });

    platesPopupMarker = L.marker([lat, lon], { icon: icon, zIndexOffset: 1000 }).addTo(map);
    platesPopupMarker.bindPopup('<div class="quake-popup" style="padding:16px;text-align:center;"><div style="width:24px;height:24px;border:3px solid #e5e7eb;border-top-color:#2563eb;border-radius:50%;animation:geoportal-spin .8s linear infinite;margin:0 auto 8px;"></div><span style="font-size:11px;color:#94a3b8;">Mencari data zona patahan...</span></div>', { maxWidth: 300, className: 'quake-leaflet-popup' });
    platesPopupMarker.openPopup();

    const features = await identifyPlates(lat, lon);
    if (features.length > 0) {
      const html = buildPopupHtml(features);
      if (html) platesPopupMarker.setPopupContent(html);
    } else {
      platesPopupMarker.setPopupContent('<div class="quake-popup" style="padding:12px;text-align:center;"><span style="font-size:12px;color:#94a3b8;">Tidak ada data zona patahan di lokasi ini.</span></div>');
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
        if (platesPopupMarker) { map.removeLayer(platesPopupMarker); platesPopupMarker = null; }
      }
    });
  });

  window._worldPlatesLayerCleanup = function () {
    if (platesLayer) { map.removeLayer(platesLayer); platesLayer = null; }
    map.off('click', onMapClick);
    if (platesPopupMarker) { map.removeLayer(platesPopupMarker); platesPopupMarker = null; }
    const cb = document.getElementById('toggleWorldPlatesLayer');
    if (cb) cb.checked = false;
  };
})();
