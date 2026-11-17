/* ── Fault Layer (BNPB INARISK) ── */
(function () {
  'use strict';

  const FAULT_URL = 'https://gis.bnpb.go.id/server/rest/services/inarisk/Faults/MapServer';
  let faultLayer = null;

  function escapeHtml(v) {
    return String(v || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[c]));
  }

  function getFaultColor(name) {
    const n = (name || '').toLowerCase();
    if (n.includes('megathrust')) return '#dc2626';
    if (n.includes('sumatera')) return '#ea580c';
    if (n.includes('java') || n.includes('jawa')) return '#f59e0b';
    if (n.includes('sulawesi')) return '#7c3aed';
    if (n.includes('kalimantan')) return '#2563eb';
    if (n.includes('maluku')) return '#0891b2';
    if (n.includes('banda')) return '#059669';
    return '#6b7280';
  }

  function getFaultTypeLabel(type) {
    const t = (type || '').trim().toUpperCase();
    if (t === 'SS') return 'Strike-Slip';
    if (t.startsWith('R45')) return 'Reverse (45°)';
    if (t.startsWith('NORM60')) return 'Normal (60°)';
    if (t.includes('NORM')) return 'Normal';
    if (t.includes('THRUST')) return 'Thrust';
    return type || '-';
  }

  function buildPopupHtml(features) {
    if (!features || features.length === 0) return null;

    let html = '<div class="quake-popup" style="min-width:220px;">';
    html += '<div class="quake-popup-header"><div class="quake-popup-status"><span class="quake-popup-status-dot" style="background:#f59e0b;"></span> Patahan</div></div>';
    html += '<div style="padding:8px 12px;">';

    features.forEach((f, i) => {
      const a = f.attributes || {};
      const name = a.Name || a.FID || '-';
      const color = getFaultColor(name);

      if (i > 0) html += '<hr style="margin:8px 0;border:0;border-top:1px solid #e5e7eb;">';

      html += '<div style="margin-bottom:6px;">';
      html += '<div style="font-weight:700;color:' + color + ';font-size:13px;margin-bottom:4px;">' + escapeHtml(name) + '</div>';

      if (a.Segment && a.Segment.trim()) {
        html += '<div style="font-size:11px;color:#475569;"><b>Segmen:</b> ' + escapeHtml(a.Segment) + '</div>';
      }
      if (a.Type && a.Type.trim()) {
        html += '<div style="font-size:11px;color:#475569;"><b>Tipe:</b> ' + getFaultTypeLabel(a.Type) + '</div>';
      }
      if (a.Mmax_d && a.Mmax_d > 0) {
        html += '<div style="font-size:11px;color:#475569;"><b>M Max:</b> ' + a.Mmax_d + '</div>';
      }
      if (a.Sliprate_1 && a.Sliprate_1.trim() && a.Sliprate_1.trim() !== ' ') {
        html += '<div style="font-size:11px;color:#475569;"><b>Slip Rate:</b> ' + escapeHtml(a.Sliprate_1) + ' mm/tahun</div>';
      }
      if (a.LCLASSSTR && a.LCLASSSTR.trim()) {
        html += '<div style="font-size:11px;color:#475569;"><b>Kode:</b> ' + escapeHtml(a.LCLASSSTR) + '</div>';
      }

      html += '</div>';
    });

    html += '<div style="font-size:10px;color:#94a3b8;margin-top:6px;">Sumber: INARISK BNPB</div>';
    html += '</div></div>';

    return html;
  }

  async function identifyFault(lat, lon) {
    try {
      const size = map.getSize();
      const point = map.latLngToContainerPoint([lat, lon]);
      const bounds = map.getBounds();
      const sr = map.options.crs ? map.options.crs.code : 'EPSG:3857';

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

      const res = await fetch(FAULT_URL + '/identify?' + params.toString());
      if (!res.ok) return [];
      const data = await res.json();
      if (!data.results || data.results.length === 0) return [];

      const features = [];
      data.results.forEach(r => {
        if (r.attributes) {
          features.push({ attributes: r.attributes, geometry: r.geometry, layerName: 'Patahan Indonesia (BNPB)', latlng: { lat: lat, lng: lon } });
        }
      });
      return features;
    } catch (e) {
      console.error('[FaultLayer] Identify error:', e);
      return [];
    }
  }

  async function onMapClick(e) {
    if (!faultLayer || !map.hasLayer(faultLayer)) return;

    const lat = e.latlng.lat;
    const lon = e.latlng.lng;

    const features = await identifyFault(lat, lon);
    if (!faultLayer || !map.hasLayer(faultLayer)) return;
    if (features.length > 0) {
      const html = buildPopupHtml(features);
      window.showFaultIdentifyResult({ latlng: e.latlng, html: html, features: features, tableId: 'fault-selection-bnpb' });
    } else {
      window.showFaultIdentifyResult({ latlng: e.latlng, html: '<div class="quake-popup" style="padding:12px;text-align:center;"><span style="font-size:12px;color:#94a3b8;">Tidak ada data patahan di lokasi ini.</span></div>' });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    const checkbox = document.getElementById('toggleFaultLayer');
    if (!checkbox) return;

    checkbox.addEventListener('change', function () {
      if (this.checked) {
        if (!faultLayer) {
          faultLayer = L.esri.dynamicMapLayer({
            url: FAULT_URL,
            opacity: 0.6,
            layers: [0, 1, 2, 3, 4, 5, 6]
          }).addTo(map);
          map.on('click', onMapClick);
        } else {
          faultLayer.addTo(map);
          map.on('click', onMapClick);
        }
      } else {
        if (faultLayer) { map.removeLayer(faultLayer); }
        map.off('click', onMapClick);
        if (window.clearFaultIdentifySelection) window.clearFaultIdentifySelection();
      }
    });
  });

  window._faultLayerCleanup = function () {
    if (faultLayer) { map.removeLayer(faultLayer); faultLayer = null; }
    map.off('click', onMapClick);
    if (window.clearFaultIdentifySelection) window.clearFaultIdentifySelection();
    const cb = document.getElementById('toggleFaultLayer');
    if (cb) cb.checked = false;
  };
})();
