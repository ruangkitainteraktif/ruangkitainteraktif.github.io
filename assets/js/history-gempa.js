/* ── History Gempa BMKG — recent M5+ earthquake history ── */
(function () {
  'use strict';

  var HISTORY_URL = 'https://bmkg-content-inatews.storage.googleapis.com/histori.json';

  var historyLayerGroup = L.layerGroup();
  var historyLoaded = false;
  var historyVisible = false;

  function escapeHtml(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
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

  function formatTime(timeStr) {
    if (!timeStr) return '-';
    var d = new Date(timeStr);
    if (isNaN(d.getTime())) return timeStr;
    var day = d.getUTCDate();
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    var mon = months[d.getUTCMonth()];
    var year = d.getUTCFullYear();
    var hh = String(d.getUTCHours()).padStart(2, '0');
    var mm = String(d.getUTCMinutes()).padStart(2, '0');
    return day + ' ' + mon + ' ' + year + ' · ' + hh + ':' + mm + ' UTC';
  }

  function buildPopupHtml(d) {
    var html = '<div class="quake-popup" style="min-width:240px">';
    html += '<div class="quake-popup-header">';
    html += '<div class="quake-popup-status"><span class="quake-popup-status-dot" style="background:' + getMarkerColor(d.mag) + '"></span>Riwayat Gempa BMKG</div>';
    html += '<div class="quake-popup-region">' + escapeHtml(d.place || '-') + '</div>';
    html += '</div>';

    html += '<div class="quake-popup-mag-display">';
    html += '<div class="quake-popup-mag-circle" style="background:' + getMarkerColor(d.mag) + '">';
    html += '<span class="quake-popup-mag-num">' + escapeHtml(d.mag.toFixed(1)) + '</span>';
    html += '<span class="quake-popup-mag-label">MAG</span>';
    html += '</div>';
    html += '<div class="quake-popup-mag-info">';
    html += '<div class="quake-popup-time">' + formatTime(d.time) + '</div>';
    html += '</div></div>';

    html += '<div class="quake-popup-details">';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Kedalaman</span><span class="quake-popup-detail-value">' + escapeHtml(d.depth) + ' km</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">ID</span><span class="quake-popup-detail-value">' + escapeHtml(d.id || '-') + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Status</span><span class="quake-popup-detail-value">' + escapeHtml(d.status || '-') + '</span></div>';
    html += '</div>';

    html += '<div class="quake-popup-footer"><span>Sumber: BMKG · ' + escapeHtml(d.fase || '0') + ' fase</span></div>';
    html += '</div>';
    return html;
  }

  function placeHistoryMarkers(features) {
    historyLayerGroup.clearLayers();
    for (var i = 0; i < features.length; i++) {
      var f = features[i];
      var c = f.geometry && f.geometry.coordinates;
      var p = f.properties;
      if (!c || !p) continue;

      var lon = parseFloat(c[0]);
      var lat = parseFloat(c[1]);
      var mag = parseFloat(p.mag) || 0;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      var marker = L.circleMarker([lat, lon], {
        radius: getMarkerRadius(mag),
        color: getMarkerColor(mag),
        weight: 1,
        opacity: 0.9,
        fillColor: getMarkerColor(mag),
        fillOpacity: 0.7
      });

      var data = {
        lat: lat, lon: lon, mag: mag,
        depth: p.depth, time: p.time,
        place: p.place, id: p.id,
        status: p.status, fase: p.fase
      };

      marker.bindPopup(buildPopupHtml(data), { maxWidth: 340, className: 'quake-leaflet-popup' });
      historyLayerGroup.addLayer(marker);
    }
  }

  async function fetchHistory() {
    if (historyLoaded) return;
    var info = document.getElementById('historyGempaInfo');
    try {
      var res = await fetch(HISTORY_URL);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var json = await res.json();
      var features = json.features || [];
      placeHistoryMarkers(features);
      historyLoaded = true;
      if (info) info.textContent = features.length + ' gempa M5+ tercatat';
    } catch (e) {
      console.error('Gagal memuat riwayat gempa:', e);
      if (info) info.textContent = 'Gagal memuat riwayat gempa';
    }
  }

  function showHistory() {
    if (historyLayerGroup.getLayers().length === 0) return;
    if (!map.hasLayer(historyLayerGroup)) historyLayerGroup.addTo(map);
    historyVisible = true;
  }

  function hideHistory() {
    if (map.hasLayer(historyLayerGroup)) map.removeLayer(historyLayerGroup);
    historyVisible = false;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var checkbox = document.getElementById('toggleHistoryGempa');
    if (!checkbox) return;
    checkbox.addEventListener('change', function () {
      if (this.checked) {
        fetchHistory().then(function () { showHistory(); });
      } else {
        hideHistory();
      }
    });
  });

  window.isHistoryGempaActive = function () { return historyVisible; };
})();
