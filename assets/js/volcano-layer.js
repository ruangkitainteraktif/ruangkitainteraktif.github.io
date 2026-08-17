/* ── Gunung Api Indonesia — PVMBG/MAGMA volcano layer ── */
(function () {
  'use strict';

  var GUNUNG_URL = 'assets/data/gunung.json';

  var volcanoClusterGroup = L.markerClusterGroup({
    maxClusterRadius: 45,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true
  });
  var volcanoLoaded = false;
  var volcanoVisible = false;

  var STATUS_LABEL = {
    1: 'Normal',
    2: 'Waspada',
    3: 'Siaga',
    4: 'Awas'
  };

  var STATUS_COLOR = {
    1: '#22c55e',
    2: '#f59e0b',
    3: '#ea580c',
    4: '#dc2626'
  };

  function esc(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function createVolcanoIcon(color) {
    return L.divIcon({
      className: 'volcano-marker-icon',
      html: '<div style="'
        + 'width:18px;height:18px;'
        + 'background:' + color + ';'
        + 'border:2px solid #fff;'
        + 'border-radius:50%;'
        + 'box-shadow:0 1px 4px rgba(0,0,0,.35);'
        + 'display:flex;align-items:center;justify-content:center;'
        + 'font-size:10px;color:#fff;font-weight:700;'
        + '">&#9650;</div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
      popupAnchor: [0, -10]
    });
  }

  function buildVolcanoPopup(v) {
    var status = v.ga_status || 1;
    var color = STATUS_COLOR[status] || STATUS_COLOR[1];
    var statusLabel = STATUS_LABEL[status] || 'Normal';

    var html = '<div class="quake-popup" style="min-width:260px">';
    html += '<div class="quake-popup-header">';
    html += '<div class="quake-popup-status"><span class="quake-popup-status-dot" style="background:' + color + '"></span>Gunung Api</div>';
    html += '<div class="quake-popup-region">' + esc(v.ga_nama_gapi) + '</div>';
    html += '</div>';

    html += '<div style="padding:10px 14px">';
    html += '<div style="display:inline-block;background:' + color + ';color:#fff;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:700;margin-bottom:8px;">' + esc(statusLabel) + '</div>';
    html += '<div class="quake-popup-details">';

    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Kode</span><span class="quake-popup-detail-value">' + esc(v.ga_code) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Kabupaten</span><span class="quake-popup-detail-value">' + esc(v.ga_kab_gapi) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Provinsi</span><span class="quake-popup-detail-value">' + esc(v.ga_prov_gapi) + '</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Elevasi</span><span class="quake-popup-detail-value">' + esc(v.ga_elev_gapi) + ' m</span></div>';
    html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Koordinat</span><span class="quake-popup-detail-value">' + esc(v.ga_lat_gapi) + ', ' + esc(v.ga_lon_gapi) + '</span></div>';

    if (v.ga_koter_gapi) {
      html += '<div class="quake-popup-detail-item"><span class="quake-popup-detail-label">Kota Terdekat</span><span class="quake-popup-detail-value">' + esc(v.ga_koter_gapi) + '</span></div>';
    }

    html += '</div></div>';

    // VONA notice
    if (v.has_vona && v.noticenumber) {
      html += '<div style="padding:8px 14px;border-top:1px solid #f1f5f9">';
      html += '<div style="font-size:10px;font-weight:600;color:#ea580c;margin-bottom:4px">VONA / NOTAM</div>';
      html += '<div style="font-size:11px;color:#475569">Nomor: ' + esc(v.noticenumber);
      if (v.erupt_icon) {
        html += ' <span style="color:#dc2626;font-weight:700">ERUPSI</span>';
      }
      html += '</div></div>';
    } else {
      html += '<div style="padding:8px 14px;border-top:1px solid #f1f5f9">';
      html += '<div style="font-size:11px;color:#94a3b8;font-style:italic">Tidak ada VONA aktif</div>';
      html += '</div>';
    }

    // Link to MAGMA
    html += '<div style="padding:8px 14px;border-top:1px solid #f1f5f9">';
    html += '<a href="https://magma.esdm.go.id" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#0891b2;text-decoration:none;font-weight:600;">';
    html += 'Lihat detail di MAGMA &#8599;</a>';
    html += '</div>';

    html += '<div class="quake-popup-footer"><span>Sumber: PVMBG/MAGMA · ' + esc(v.ga_code) + '</span></div>';
    html += '</div>';
    return html;
  }

  function placeVolcanoMarkers(volcanoes) {
    volcanoClusterGroup.clearLayers();

    for (var i = 0; i < volcanoes.length; i++) {
      var v = volcanoes[i];
      var lat = parseFloat(v.ga_lat_gapi);
      var lon = parseFloat(v.ga_lon_gapi);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      var status = v.ga_status || 1;
      var color = STATUS_COLOR[status] || STATUS_COLOR[1];

      var marker = L.marker([lat, lon], {
        icon: createVolcanoIcon(color)
      });

      marker.bindPopup(buildVolcanoPopup(v), { maxWidth: 360, className: 'quake-leaflet-popup' });

      volcanoClusterGroup.addLayer(marker);
    }
  }

  async function fetchVolcanoes() {
    if (volcanoLoaded) return;
    var info = document.getElementById('volcanoInfo');
    try {
      var res = await fetch(GUNUNG_URL);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var json = await res.json();
      placeVolcanoMarkers(json);
      volcanoLoaded = true;
      if (info) info.textContent = json.length + ' gunung api aktif di Indonesia';
    } catch (e) {
      console.error('[Volcano] Gagal memuat gunung.json:', e);
      if (info) info.textContent = 'Gagal memuat data gunung api';
    }
  }

  function showVolcano() {
    if (volcanoClusterGroup.getLayers().length === 0) return;
    if (!map.hasLayer(volcanoClusterGroup)) volcanoClusterGroup.addTo(map);
    volcanoVisible = true;
  }

  function hideVolcano() {
    if (map.hasLayer(volcanoClusterGroup)) map.removeLayer(volcanoClusterGroup);
    volcanoVisible = false;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var checkbox = document.getElementById('toggleVolcanoLayer');
    if (!checkbox) return;
    checkbox.addEventListener('change', function () {
      if (this.checked) {
        fetchVolcanoes().then(function () { showVolcano(); });
      } else {
        hideVolcano();
      }
    });
  });

  window.isVolcanoLayerActive = function () { return volcanoVisible; };
})();
