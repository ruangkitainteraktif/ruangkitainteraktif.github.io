/* ── Finite Fault NTT 2026 (BNPB INARISK) ── */
(function () {
  'use strict';

  const FF_URL = 'https://gis.bnpb.go.id/server/rest/services/2026_gempabumi_ntt/finite_fault_ntt/MapServer';
  let ffLayer = null;
  let ffPopupMarker = null;

  function escapeHtml(v) {
    return String(v || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[c]));
  }

  function parseNum(v) {
    if (v === null || v === undefined || v === '') return null;
    var s = String(v).replace(',', '.');
    var n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  function buildPopupHtml(features) {
    if (!features || features.length === 0) return null;

    var shown = features.slice(0, 3);
    var more = features.length > 3 ? features.length - 3 : 0;

    var html = '<div class="quake-popup" style="min-width:260px;">';
    html += '<div class="quake-popup-header"><div class="quake-popup-status"><span class="quake-popup-status-dot" style="background:#ea580c;"></span> Finite Fault NTT 2026</div></div>';
    html += '<div style="padding:8px 12px;">';

    shown.forEach(function (f, i) {
      var a = f.attributes || {};
      var fillColor = a.fill || '#ea580c';

      if (i > 0) html += '<hr style="margin:8px 0;border:0;border-top:1px solid #e5e7eb;">';

      html += '<div style="margin-bottom:6px;">';

      html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">';
      html += '<span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:' + escapeHtml(fillColor) + ';border:1px solid #d1d5db;"></span>';
      html += '<span style="font-weight:700;color:#ea580c;font-size:13px;">Patch #' + escapeHtml(a.FID || '-') + '</span>';
      html += '</div>';

      var slip = parseNum(a.slip);
      if (slip !== null) {
        html += '<div style="font-size:11px;color:#475569;"><b>Slip:</b> ' + slip.toFixed(3) + ' m</div>';
      }

      var rake = parseNum(a.rake);
      if (rake !== null) {
        html += '<div style="font-size:11px;color:#475569;"><b>Rake:</b> ' + rake.toFixed(2) + '°</div>';
      }

      var rise = parseNum(a.rise);
      if (rise !== null) {
        html += '<div style="font-size:11px;color:#475569;"><b>Rise Time:</b> ' + rise.toFixed(1) + ' s</div>';
      }

      var trup = parseNum(a.trup);
      if (trup !== null) {
        html += '<div style="font-size:11px;color:#475569;"><b>Rupture Time:</b> ' + trup.toFixed(2) + ' s</div>';
      }

      var moment = parseNum(a.sf_moment);
      if (moment !== null) {
        var exp = Math.floor(Math.log10(Math.abs(moment)));
        var mantissa = moment / Math.pow(10, exp);
        html += '<div style="font-size:11px;color:#475569;"><b>Momen Seismik:</b> ' + mantissa.toFixed(2) + '×10<sup>' + exp + '</sup> N·m</div>';
      }

      var xew = parseNum(a.x__ew);
      var yns = parseNum(a.y__ns);
      if (xew !== null || yns !== null) {
        html += '<div style="font-size:11px;color:#475569;"><b>Displacement:</b> ';
        if (xew !== null) html += 'EW ' + xew.toFixed(2) + ' km';
        if (xew !== null && yns !== null) html += ' · ';
        if (yns !== null) html += 'NS ' + yns.toFixed(2) + ' km';
        html += '</div>';
      }

      html += '</div>';
    });

    if (more > 0) {
      html += '<div style="font-size:10px;color:#94a3b8;margin-top:4px;">+' + more + ' patch lainnya di lokasi ini</div>';
    }

    html += '<div style="font-size:10px;color:#94a3b8;margin-top:6px;">Sumber: INARISK BNPB · Finite Fault NTT 2026</div>';
    html += '</div></div>';

    return html;
  }

  async function identifyFF(lat, lon) {
    try {
      var size = map.getSize();
      var bounds = map.getBounds();

      var params = new URLSearchParams({
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

      var res = await fetch(FF_URL + '/identify?' + params.toString());
      if (!res.ok) return [];
      var data = await res.json();
      if (!data.results || data.results.length === 0) return [];

      var features = [];
      data.results.forEach(function (r) {
        if (r.attributes) {
          features.push({ layerId: r.layerId, attributes: r.attributes });
        }
      });
      return features;
    } catch (e) {
      console.error('[FiniteFaultNTT] Identify error:', e);
      return [];
    }
  }

  function showPopupAt(lat, lng) {
    if (ffPopupMarker) { map.removeLayer(ffPopupMarker); ffPopupMarker = null; }

    var icon = L.divIcon({
      className: 'geoid-marker-wrap',
      html: '<div class="geoid-marker" role="img"><svg viewBox="0 0 24 24"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg></div>',
      iconSize: [48, 54],
      iconAnchor: [24, 52],
      popupAnchor: [0, -52]
    });

    ffPopupMarker = L.marker([lat, lng], { icon: icon, zIndexOffset: 1000 }).addTo(map);
    ffPopupMarker.bindPopup('<div class="quake-popup" style="padding:16px;text-align:center;"><div style="width:24px;height:24px;border:3px solid #e5e7eb;border-top-color:#ea580c;border-radius:50%;animation:geoportal-spin .8s linear infinite;margin:0 auto 8px;"></div><span style="font-size:11px;color:#94a3b8;">Mencari data finite fault...</span></div>', { maxWidth: 340, className: 'quake-leaflet-popup' });
    ffPopupMarker.openPopup();

    identifyFF(lat, lng).then(function (features) {
      if (features.length > 0) {
        var html = buildPopupHtml(features);
        if (html) ffPopupMarker.setPopupContent(html);
      } else {
        ffPopupMarker.setPopupContent('<div class="quake-popup" style="padding:12px;text-align:center;"><span style="font-size:12px;color:#94a3b8;">Tidak ada data finite fault di lokasi ini.</span></div>');
      }
    });
  }

  function onMapClickFF(e) {
    if (!ffLayer || !map.hasLayer(ffLayer)) return;
    showPopupAt(e.latlng.lat, e.latlng.lng);
  }

  async function loadFeatureLayer() {
    return new Promise(function (resolve) {
      var fl = L.esri.featureLayer({
        url: FF_URL + '/0',
        pointToLayer: function () {},
        style: function (feature) {
          var a = feature.properties || {};
          var fillColor = a.fill || '#ea580c';
          var strokeWid = parseNum(a.stroke_wid) || 1.5;
          var fillOpaci = parseNum(a.fill_opaci);
          if (fillOpaci !== null) fillOpaci = fillOpaci;
          else fillOpaci = 0.65;

          return {
            color: '#555',
            weight: strokeWid,
            opacity: 0.8,
            fillColor: fillColor,
            fillOpacity: fillOpaci
          };
        },
        onEachFeature: function (feature, layer) {
          layer.on('click', function () {
            var a = feature.properties || {};
            showPopupAt(layer.getBounds().getCenter().lat, layer.getBounds().getCenter().lng);
          });
        }
      });

      fl.on('load', function () { resolve(fl); });
      fl.on('error', function () { resolve(null); });
      fl.addTo(map);

      setTimeout(function () { resolve(fl); }, 10000);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var checkbox = document.getElementById('toggleFiniteFaultNTT');
    if (!checkbox) return;

    checkbox.addEventListener('change', function () {
      if (this.checked) {
        if (!ffLayer) {
          loadFeatureLayer().then(function (layer) {
            if (layer) {
              ffLayer = layer;
              map.on('click', onMapClickFF);
            } else {
              ffLayer = L.esri.dynamicMapLayer({
                url: FF_URL,
                opacity: 0.65,
                layers: [0]
              }).addTo(map);
              map.on('click', onMapClickFF);
            }
          });
        } else {
          ffLayer.addTo(map);
          map.on('click', onMapClickFF);
        }
      } else {
        if (ffLayer) { map.removeLayer(ffLayer); ffLayer = null; }
        map.off('click', onMapClickFF);
        if (ffPopupMarker) { map.removeLayer(ffPopupMarker); ffPopupMarker = null; }
      }
    });
  });

  window._finiteFaultNTTCleanup = function () {
    if (ffLayer) { map.removeLayer(ffLayer); ffLayer = null; }
    map.off('click', onMapClickFF);
    if (ffPopupMarker) { map.removeLayer(ffPopupMarker); ffPopupMarker = null; }
    var cb = document.getElementById('toggleFiniteFaultNTT');
    if (cb) cb.checked = false;
  };

  window.isFiniteFaultNTTActive = function () { return ffLayer && map.hasLayer(ffLayer); };
  window.showFiniteFaultPopup = function (lat, lng) { showPopupAt(lat, lng); };
})();
