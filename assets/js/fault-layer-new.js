/* ── Fault Layer Baru (BNPB INARISK — PUSGEN 2024) ── */
(function () {
  'use strict';

  const FAULT_NEW_URL = 'https://gis.bnpb.go.id/server/rest/services/inarisk/Faults_new/MapServer';
  let faultNewLayer = null;
  let faultNewPopupMarker = null;

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
    if (t === 'SS' || t === 'SS90') return 'Strike-Slip';
    if (t.startsWith('R45')) return 'Reverse (45°)';
    if (t.startsWith('NORM60')) return 'Normal (60°)';
    if (t.includes('NORM')) return 'Normal';
    if (t.includes('THRUST')) return 'Thrust';
    return type || '-';
  }

  function buildPopupHtml(features) {
    if (!features || features.length === 0) return null;

    let html = '<div class="quake-popup" style="min-width:240px;">';
    html += '<div class="quake-popup-header"><div class="quake-popup-status"><span class="quake-popup-status-dot" style="background:#b91c1c;"></span> Patahan Baru (PUSGEN 2024)</div></div>';
    html += '<div style="padding:8px 12px;">';

    features.forEach((f, i) => {
      const a = f.attributes || {};
      const layerId = f.layerId;

      if (i > 0) html += '<hr style="margin:8px 0;border:0;border-top:1px solid #e5e7eb;">';

      html += '<div style="margin-bottom:6px;">';

      if (layerId === 0) {
        // Layer 0: Patahan Aktif Skala Besar PVMBG
        const name = a.namobj || a.simobj || '-';
        const color = getFaultColor(name);
        html += '<div style="font-weight:700;color:' + color + ';font-size:13px;margin-bottom:4px;">' + escapeHtml(name) + '</div>';
        html += '<div style="font-size:11px;color:#64748b;margin-bottom:4px;">' + escapeHtml(a.simobj || '') + '</div>';

        if (a.klspthn && a.klspthn.trim()) {
          html += '<div style="font-size:11px;color:#475569;"><b>Kelas:</b> ' + escapeHtml(a.klspthn) + '</div>';
        }
        if (a.pjgpthn && parseFloat(a.pjgpthn) > 0) {
          html += '<div style="font-size:11px;color:#475569;"><b>Panjang:</b> ' + a.pjgpthn + ' km</div>';
        }
        if (a.lokasi && a.lokasi.trim()) {
          html += '<div style="font-size:11px;color:#475569;"><b>Lokasi:</b> ' + escapeHtml(a.lokasi) + '</div>';
        }
        if (a.sjrhgempa && a.sjrhgempa.trim() && a.sjrhgempa !== 'No Record') {
          html += '<div style="font-size:11px;color:#475569;margin-top:4px;"><b>Sejarah Gempa:</b></div>';
          html += '<div style="font-size:10px;color:#64748b;line-height:1.4;">' + escapeHtml(a.sjrhgempa) + '</div>';
        }
        if (a.geologi && a.geologi.trim() && a.geologi !== 'No Information') {
          html += '<div style="font-size:11px;color:#475569;margin-top:4px;"><b>Geologi:</b></div>';
          html += '<div style="font-size:10px;color:#64748b;line-height:1.4;">' + escapeHtml(a.geologi) + '</div>';
        }
      } else {
        // Layer 1: PUSGEN 2024 Shallow Crustal
        const name = a.Name || '-';
        const color = getFaultColor(name);
        html += '<div style="font-weight:700;color:' + color + ';font-size:13px;margin-bottom:4px;">' + escapeHtml(name) + '</div>';

        if (a.Segment && a.Segment.trim()) {
          html += '<div style="font-size:11px;color:#475569;"><b>Segmen:</b> ' + escapeHtml(a.Segment) + '</div>';
        }
        if (a.Type && a.Type.trim()) {
          html += '<div style="font-size:11px;color:#475569;"><b>Tipe:</b> ' + getFaultTypeLabel(a.Type) + '</div>';
        }
        if (a.Mmax && a.Mmax !== '0') {
          html += '<div style="font-size:11px;color:#475569;"><b>M Max:</b> ' + escapeHtml(a.Mmax) + '</div>';
        }
        if (a.Sliprate_m && parseFloat(a.Sliprate_m) > 0) {
          html += '<div style="font-size:11px;color:#475569;"><b>Slip Rate:</b> ' + a.Sliprate_m + ' mm/tahun</div>';
        }
        if (a.Length_km && parseFloat(a.Length_km) > 0) {
          html += '<div style="font-size:11px;color:#475569;"><b>Panjang:</b> ' + a.Length_km + ' km</div>';
        }
        if (a.Region && a.Region.trim()) {
          html += '<div style="font-size:11px;color:#475569;"><b>Region:</b> ' + escapeHtml(a.Region) + '</div>';
        }
        if (a.LCLASSSTR && a.LCLASSSTR.trim()) {
          html += '<div style="font-size:11px;color:#475569;"><b>Kode:</b> ' + escapeHtml(a.LCLASSSTR) + '</div>';
        }
      }

      html += '</div>';
    });

    html += '<div style="font-size:10px;color:#94a3b8;margin-top:6px;">Sumber: INARISK BNPB · PUSGEN 2024</div>';
    html += '</div></div>';

    return html;
  }

  async function identifyFaultNew(lat, lon) {
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

      const res = await fetch(FAULT_NEW_URL + '/identify?' + params.toString());
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
      console.error('[FaultNewLayer] Identify error:', e);
      return [];
    }
  }

  async function onMapClick(e) {
    if (!faultNewLayer || !map.hasLayer(faultNewLayer)) return;

    const lat = e.latlng.lat;
    const lon = e.latlng.lng;

    if (faultNewPopupMarker) { map.removeLayer(faultNewPopupMarker); faultNewPopupMarker = null; }

    const icon = L.divIcon({
      className: 'geoid-marker-wrap',
      html: '<div class="geoid-marker" role="img"><svg viewBox="0 0 24 24"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg></div>',
      iconSize: [48, 54],
      iconAnchor: [24, 52],
      popupAnchor: [0, -52]
    });

    faultNewPopupMarker = L.marker([lat, lon], { icon: icon, zIndexOffset: 1000 }).addTo(map);
    faultNewPopupMarker.bindPopup('<div class="quake-popup" style="padding:16px;text-align:center;"><div style="width:24px;height:24px;border:3px solid #e5e7eb;border-top-color:#b91c1c;border-radius:50%;animation:geoportal-spin .8s linear infinite;margin:0 auto 8px;"></div><span style="font-size:11px;color:#94a3b8;">Mencari data patahan baru...</span></div>', { maxWidth: 300, className: 'quake-leaflet-popup' });
    faultNewPopupMarker.openPopup();

    const features = await identifyFaultNew(lat, lon);
    if (features.length > 0) {
      const html = buildPopupHtml(features);
      if (html) faultNewPopupMarker.setPopupContent(html);
    } else {
      faultNewPopupMarker.setPopupContent('<div class="quake-popup" style="padding:12px;text-align:center;"><span style="font-size:12px;color:#94a3b8;">Tidak ada data patahan baru di lokasi ini.</span></div>');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    const checkbox = document.getElementById('toggleFaultLayerNew');
    if (!checkbox) return;

    checkbox.addEventListener('change', function () {
      if (this.checked) {
        if (!faultNewLayer) {
          faultNewLayer = L.esri.dynamicMapLayer({
            url: FAULT_NEW_URL,
            opacity: 0.6,
            layers: [0, 1]
          }).addTo(map);
          map.on('click', onMapClick);
        } else {
          faultNewLayer.addTo(map);
          map.on('click', onMapClick);
        }
      } else {
        if (faultNewLayer) { map.removeLayer(faultNewLayer); }
        map.off('click', onMapClick);
        if (faultNewPopupMarker) { map.removeLayer(faultNewPopupMarker); faultNewPopupMarker = null; }
      }
    });
  });

  window._faultNewLayerCleanup = function () {
    if (faultNewLayer) { map.removeLayer(faultNewLayer); faultNewLayer = null; }
    map.off('click', onMapClick);
    if (faultNewPopupMarker) { map.removeLayer(faultNewPopupMarker); faultNewPopupMarker = null; }
    const cb = document.getElementById('toggleFaultLayerNew');
    if (cb) cb.checked = false;
  };
})();
