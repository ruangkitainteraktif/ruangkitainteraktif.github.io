/* ── Jalur Evakuasi (BNPB INARISK) ── */
(function () {
  'use strict';

  const JALUR_URL = 'https://gis.bnpb.go.id/server/rest/services/inarisk/Jalur_evakuasi/MapServer';
  let jalurLayer = null;
  let jalurPopupMarker = null;

  function escapeHtml(v) {
    return String(v || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[c]));
  }

  function getLayerName(layerId) {
    const names = {
      0: 'Jalan Arteri Utama',
      1: 'Jalan Kolektor',
      2: 'Jalan Lokal',
      3: 'Jalan Lain'
    };
    return names[layerId] || 'Jalur Evakuasi';
  }

  function getLayerColor(layerId) {
    const colors = {
      0: '#dc2626',
      1: '#ea580c',
      2: '#f59e0b',
      3: '#6b7280'
    };
    return colors[layerId] || '#6b7280';
  }

  function buildPopupHtml(features) {
    if (!features || features.length === 0) return null;

    let html = '<div class="quake-popup" style="min-width:220px;">';
    html += '<div class="quake-popup-header"><div class="quake-popup-status"><span class="quake-popup-status-dot" style="background:#059669;"></span> Jalur Evakuasi</div></div>';
    html += '<div style="padding:8px 12px;">';

    features.forEach((f, i) => {
      const a = f.attributes || {};
      const layerId = f.layerId;
      const color = getLayerColor(layerId);
      const layerName = getLayerName(layerId);

      if (i > 0) html += '<hr style="margin:8px 0;border:0;border-top:1px solid #e5e7eb;">';

      html += '<div style="margin-bottom:6px;">';
      html += '<div style="font-weight:700;color:' + color + ';font-size:13px;margin-bottom:4px;">' + escapeHtml(layerName) + '</div>';

      // Show all available attributes dynamically
      const skipKeys = ['Shape', 'objectid', 'OBJECTID', 'GlobalID'];
      let hasContent = false;
      for (const key in a) {
        if (skipKeys.includes(key)) continue;
        const val = a[key];
        if (val === null || val === undefined || val === '' || val === ' ') continue;
        const label = key.replace(/_/g, ' ');
        html += '<div style="font-size:11px;color:#475569;"><b>' + escapeHtml(label) + ':</b> ' + escapeHtml(String(val)) + '</div>';
        hasContent = true;
      }

      if (!hasContent) {
        html += '<div style="font-size:11px;color:#94a3b8;font-style:italic;">Jalur evakuasi ' + escapeHtml(layerName.toLowerCase()) + '</div>';
      }

      html += '</div>';
    });

    html += '<div style="font-size:10px;color:#94a3b8;margin-top:6px;">Sumber: INARISK BNPB · Jalur Evakuasi</div>';
    html += '</div></div>';

    return html;
  }

  async function identifyJalur(lat, lon) {
    try {
      const size = map.getSize();
      const bounds = map.getBounds();

      const params = new URLSearchParams({
        geometry: JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } }),
        geometryType: 'esriGeometryPoint',
        sr: '4326',
        layers: 'all',
        tolerance: '12',
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

      const res = await fetch(JALUR_URL + '/identify?' + params.toString());
      if (!res.ok) return [];
      const data = await res.json();
      if (!data.results || data.results.length === 0) return [];

      const features = [];
      data.results.forEach(r => {
        if (r.attributes) {
          features.push({ layerId: r.layerId, attributes: r.attributes });
        }
      });
      return features;
    } catch (e) {
      console.error('[JalurEvakuasi] Identify error:', e);
      return [];
    }
  }

  async function onMapClick(e) {
    if (!jalurLayer || !map.hasLayer(jalurLayer)) return;

    const lat = e.latlng.lat;
    const lon = e.latlng.lng;

    if (jalurPopupMarker) { map.removeLayer(jalurPopupMarker); jalurPopupMarker = null; }

    const icon = L.divIcon({
      className: 'geoid-marker-wrap',
      html: '<div class="geoid-marker" role="img"><svg viewBox="0 0 24 24"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg></div>',
      iconSize: [48, 54],
      iconAnchor: [24, 52],
      popupAnchor: [0, -52]
    });

    jalurPopupMarker = L.marker([lat, lon], { icon: icon, zIndexOffset: 1000 }).addTo(map);
    jalurPopupMarker.bindPopup('<div class="quake-popup" style="padding:16px;text-align:center;"><div style="width:24px;height:24px;border:3px solid #e5e7eb;border-top-color:#059669;border-radius:50%;animation:geoportal-spin .8s linear infinite;margin:0 auto 8px;"></div><span style="font-size:11px;color:#94a3b8;">Mencari data jalur evakuasi...</span></div>', { maxWidth: 300, className: 'quake-leaflet-popup' });
    jalurPopupMarker.openPopup();

    const features = await identifyJalur(lat, lon);
    if (features.length > 0) {
      const html = buildPopupHtml(features);
      if (html) jalurPopupMarker.setPopupContent(html);
    } else {
      jalurPopupMarker.setPopupContent('<div class="quake-popup" style="padding:12px;text-align:center;"><span style="font-size:12px;color:#94a3b8;">Tidak ada data jalur evakuasi di lokasi ini.</span></div>');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    const checkbox = document.getElementById('toggleJalurEvakuasi');
    if (!checkbox) return;

    checkbox.addEventListener('change', function () {
      if (this.checked) {
        if (!jalurLayer) {
          jalurLayer = L.esri.dynamicMapLayer({
            url: JALUR_URL,
            opacity: 0.7,
            layers: [0, 1, 2, 3]
          }).addTo(map);
          map.on('click', onMapClick);
        } else {
          jalurLayer.addTo(map);
          map.on('click', onMapClick);
        }
      } else {
        if (jalurLayer) { map.removeLayer(jalurLayer); }
        map.off('click', onMapClick);
        if (jalurPopupMarker) { map.removeLayer(jalurPopupMarker); jalurPopupMarker = null; }
      }
    });
  });

  window._jalurEvakuasiCleanup = function () {
    if (jalurLayer) { map.removeLayer(jalurLayer); jalurLayer = null; }
    map.off('click', onMapClick);
    if (jalurPopupMarker) { map.removeLayer(jalurPopupMarker); jalurPopupMarker = null; }
    const cb = document.getElementById('toggleJalurEvakuasi');
    if (cb) cb.checked = false;
  };
})();
