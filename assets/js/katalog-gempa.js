/* ── Katalog Gempa BMKG — historical earthquake catalog layer ── */
(function () {
  'use strict';

  var KATALOG_URL = 'https://bmkg-content-inatews.storage.googleapis.com/katalog_gempa.json';

  var katalogLayerGroup = L.layerGroup();
  var katalogLoaded = false;
  var katalogVisible = false;

  function escapeKatalogHtml(v) {
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

  function parseDate(dateStr) {
    var parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return parts[2] + '-' + parts[1] + '-' + parts[0];
  }

  function parseDateID(dateStr) {
    var months = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    var parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    var day = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);
    var year = parts[2];
    return day + ' ' + (months[month] || parts[1]) + ' ' + year;
  }

  function buildPopupHtml(d) {
    var html = '<div class="quake-popup" style="min-width:240px">';
    html += '<div class="quake-popup-header">';
    html += '<div class="quake-popup-status"><span class="quake-popup-status-dot" style="background:' + getMarkerColor(d.mag) + '"></span>Katalog Gempa</div>';
    html += '<div class="quake-popup-region">' + escapeKatalogHtml(d.lokasi || d.pusat || '-') + '</div>';
    html += '</div>';

    html += '<div class="quake-popup-mag-display">';
    html += '<div class="quake-popup-mag-circle" style="background:' + getMarkerColor(d.mag) + '">';
    html += '<span class="quake-popup-mag-num">' + escapeKatalogHtml(d.mag) + '</span>';
    html += '<span class="quake-popup-mag-label">MAG</span>';
    html += '</div>';
    html += '<div class="quake-popup-mag-info">';
    if (d.tsunami === 'Ya') {
      html += '<div class="quake-popup-potensi" style="color:#dc2626;font-weight:700">⚠ TSUNAMI</div>';
    } else {
      html += '<div class="quake-popup-potensi">Tidak ada potensi tsunami</div>';
    }
    html += '<div class="quake-popup-time">' + escapeKatalogHtml(parseDate(d.date)) + ' · ' + escapeKatalogHtml(d.time || '-') + ' UTC</div>';
    html += '</div></div>';

    html += '<div class="quake-popup-details">';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Kedalaman</span><span class="quake-popup-detail-value">' + escapeKatalogHtml(d.depth || '-') + ' km</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Pusat Gempa</span><span class="quake-popup-detail-value">' + escapeKatalogHtml(d.pusat || '-') + '</span></div>';
    html += '</div>';

    if (d.dirasakan && d.dirasakan !== '-') {
      html += '<div style="padding:8px 14px;border-top:1px solid #f1f5f9">';
      html += '<div style="font-size:10px;font-weight:600;color:#ea580c;margin-bottom:4px">DIRASAKAN</div>';
      html += '<div style="font-size:11px;color:#475569;line-height:1.4">' + escapeKatalogHtml(d.dirasakan) + '</div>';
      html += '</div>';
    }

    if (d.korban && d.korban !== '-') {
      html += '<div style="padding:8px 14px;border-top:1px solid #f1f5f9">';
      html += '<div style="font-size:10px;font-weight:600;color:#dc2626;margin-bottom:4px">KORBAN / KERUSAKAN</div>';
      html += '<div style="font-size:11px;color:#475569;line-height:1.4">' + escapeKatalogHtml(d.korban) + '</div>';
      html += '</div>';
    }

    html += '<div class="quake-popup-footer"><span>Sumber: ' + escapeKatalogHtml(d.sumber || 'BMKG') + ' · ID: ' + escapeKatalogHtml(d.id || '-') + '</span></div>';
    html += '</div>';
    return html;
  }

  function placeKatalogMarkers(features) {
    katalogLayerGroup.clearLayers();
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
        depth: p.depth, date: p.date, time: p.ot_utc,
        lokasi: p.lokasi, pusat: p.pusat_gempa,
        tsunami: p.tsunami, dirasakan: p.dirasakan,
        korban: p.korban_kerusakan, sumber: p.sumber, id: p.id_event
      };

      marker.bindPopup(buildPopupHtml(data), { maxWidth: 340, className: 'quake-leaflet-popup' });
      katalogLayerGroup.addLayer(marker);
    }
  }

  async function fetchKatalog() {
    if (katalogLoaded) return;
    var info = document.getElementById('katalogGempaInfo');
    try {
      var res = await fetch(KATALOG_URL);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var json = await res.json();
      var features = json.features || [];
      placeKatalogMarkers(features);
      katalogLoaded = true;
      if (info) info.textContent = features.length + ' gempa signifikan historis';
    } catch (e) {
      console.error('Gagal memuat katalog gempa:', e);
      if (info) info.textContent = 'Gagal memuat katalog gempa';
    }
  }

  function showKatalog() {
    if (katalogLayerGroup.getLayers().length === 0) return;
    if (!map.hasLayer(katalogLayerGroup)) katalogLayerGroup.addTo(map);
    katalogVisible = true;
  }

  function hideKatalog() {
    if (map.hasLayer(katalogLayerGroup)) map.removeLayer(katalogLayerGroup);
    katalogVisible = false;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var checkbox = document.getElementById('toggleKatalogGempa');
    if (!checkbox) return;
    checkbox.addEventListener('change', function () {
      if (this.checked) {
        fetchKatalog().then(function () { showKatalog(); });
      } else {
        hideKatalog();
      }
    });
  });

  window.isKatalogGempaActive = function () { return katalogVisible; };
})();
