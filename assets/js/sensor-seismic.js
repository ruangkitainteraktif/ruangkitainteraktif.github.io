/* ── Sensor Seismic BMKG — Indonesian seismic sensor stations ── */
(function () {
  'use strict';

  var SENSOR_SEISMIC_URL = 'https://bmkg-content-inatews.storage.googleapis.com/sensor_seismic.json';

  var seismicLayerGroup = L.layerGroup();
  var seismicLoaded = false;
  var seismicVisible = false;

  function escapeHtml(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function buildPopupHtml(d) {
    var html = '<div class="quake-popup" style="min-width:220px">';
    html += '<div class="quake-popup-header">';
    html += '<div class="quake-popup-status"><span class="quake-popup-status-dot" style="background:#16a34a"></span>Sensor Seismic BMKG</div>';
    html += '<div class="quake-popup-region">' + escapeHtml(d.stakeholder || '-') + '</div>';
    html += '</div>';

    html += '<div class="quake-popup-details">';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">ID Stasiun</span><span class="quake-popup-detail-value">' + escapeHtml(d.id || '-') + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Stakeholder</span><span class="quake-popup-detail-value">' + escapeHtml(d.stakeholder || '-') + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">UPT BMKG</span><span class="quake-popup-detail-value">' + escapeHtml(d.uptbmkg || '-') + '</span></div>';
    html += '</div>';

    html += '<div class="quake-popup-footer"><span>Sensor gempa bumi aktif di Indonesia</span></div>';
    html += '</div>';
    return html;
  }

  function placeSeismicMarkers(features) {
    seismicLayerGroup.clearLayers();
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
        color: '#16a34a',
        weight: 1,
        opacity: 0.9,
        fillColor: '#22c55e',
        fillOpacity: 0.7
      });

      var data = {
        id: p.id,
        stakeholder: p.stakeholder,
        uptbmkg: p.uptbmkg
      };

      marker.bindPopup(buildPopupHtml(data), { maxWidth: 340, className: 'quake-leaflet-popup' });
      seismicLayerGroup.addLayer(marker);
    }
  }

  async function fetchSeismic() {
    if (seismicLoaded) return;
    var info = document.getElementById('sensorSeismicInfo');
    try {
      var res = await fetch(SENSOR_SEISMIC_URL);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var json = await res.json();
      var features = json.features || [];
      placeSeismicMarkers(features);
      seismicLoaded = true;
      if (info) info.textContent = features.length + ' stasiun sensor aktif';
    } catch (e) {
      console.error('Gagal memuat sensor seismic:', e);
      if (info) info.textContent = 'Gagal memuat data sensor';
    }
  }

  function showSeismic() {
    if (seismicLayerGroup.getLayers().length === 0) return;
    if (!map.hasLayer(seismicLayerGroup)) seismicLayerGroup.addTo(map);
    seismicVisible = true;
  }

  function hideSeismic() {
    if (map.hasLayer(seismicLayerGroup)) map.removeLayer(seismicLayerGroup);
    seismicVisible = false;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var checkbox = document.getElementById('toggleSensorSeismic');
    if (!checkbox) return;
    checkbox.addEventListener('change', function () {
      if (this.checked) {
        fetchSeismic().then(function () { showSeismic(); });
      } else {
        hideSeismic();
      }
    });
  });

  window.isSensorSeismicActive = function () { return seismicVisible; };
})();
