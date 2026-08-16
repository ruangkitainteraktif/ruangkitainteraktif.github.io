/* ── Sensor Global BMKG — global GEOFON/GSN sensor stations ── */
(function () {
  'use strict';

  var SENSOR_GLOBAL_URL = 'https://bmkg-content-inatews.storage.googleapis.com/sensor_global.json';

  var globalLayerGroup = L.layerGroup();
  var globalLoaded = false;
  var globalVisible = false;

  function escapeHtml(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function buildPopupHtml(d) {
    var html = '<div class="quake-popup" style="min-width:220px">';
    html += '<div class="quake-popup-header">';
    html += '<div class="quake-popup-status"><span class="quake-popup-status-dot" style="background:#3b82f6"></span>Sensor Global</div>';
    html += '<div class="quake-popup-region">' + escapeHtml(d.description || '-') + '</div>';
    html += '</div>';

    html += '<div class="quake-popup-details">';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">ID Stasiun</span><span class="quake-popup-detail-value">' + escapeHtml(d.id || '-') + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Jaringan</span><span class="quake-popup-detail-value">' + escapeHtml(d.net || '-') + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Stasiun</span><span class="quake-popup-detail-value">' + escapeHtml(d.sta || '-') + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Deskripsi</span><span class="quake-popup-detail-value">' + escapeHtml(d.description || '-') + '</span></div>';
    html += '</div>';

    html += '<div class="quake-popup-footer"><span>Sensor gempa global (GEOFON/GSN)</span></div>';
    html += '</div>';
    return html;
  }

  function placeGlobalMarkers(features) {
    globalLayerGroup.clearLayers();
    for (var i = 0; i < features.length; i++) {
      var f = features[i];
      var c = f.geometry && f.geometry.coordinates;
      var p = f.properties;
      if (!c || !p) continue;

      var lon = parseFloat(c[0]);
      var lat = parseFloat(c[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      var marker = L.circleMarker([lat, lon], {
        radius: 5,
        color: '#3b82f6',
        weight: 1,
        opacity: 0.9,
        fillColor: '#60a5fa',
        fillOpacity: 0.7
      });

      var data = {
        id: f.id,
        description: p.description,
        net: p.net,
        sta: p.sta
      };

      marker.bindPopup(buildPopupHtml(data), { maxWidth: 340, className: 'quake-leaflet-popup' });
      globalLayerGroup.addLayer(marker);
    }
  }

  async function fetchGlobal() {
    if (globalLoaded) return;
    var info = document.getElementById('sensorGlobalInfo');
    try {
      var res = await fetch(SENSOR_GLOBAL_URL);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var json = await res.json();
      var features = Array.isArray(json) ? json : (json.features || []);
      placeGlobalMarkers(features);
      globalLoaded = true;
      if (info) info.textContent = features.length + ' stasiun global';
    } catch (e) {
      console.error('Gagal memuat sensor global:', e);
      if (info) info.textContent = 'Gagal memuat data sensor global';
    }
  }

  function showGlobal() {
    if (globalLayerGroup.getLayers().length === 0) return;
    if (!map.hasLayer(globalLayerGroup)) globalLayerGroup.addTo(map);
    globalVisible = true;
  }

  function hideGlobal() {
    if (map.hasLayer(globalLayerGroup)) map.removeLayer(globalLayerGroup);
    globalVisible = false;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var checkbox = document.getElementById('toggleSensorGlobal');
    if (!checkbox) return;
    checkbox.addEventListener('change', function () {
      if (this.checked) {
        fetchGlobal().then(function () { showGlobal(); });
      } else {
        hideGlobal();
      }
    });
  });

  window.isSensorGlobalActive = function () { return globalVisible; };
})();
