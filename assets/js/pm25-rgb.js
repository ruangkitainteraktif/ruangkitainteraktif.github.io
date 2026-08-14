/* ── PM2.5 Air Quality RGB Layer (BMKG PCM) ── */
(function () {
  'use strict';

  var PROV_GEOJSON_URL = 'assets/data/bps/geojson/provinsi.geojson';
  var MODEL_NAME = 'pcm_pm25';
  var LAYER_NAME = 'pm25';
  var BASE_PATH = 'pcm_pm25';
  var layer = null;
  var legendControl = null;

  var Legend = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd: function () {
      var div = L.DomUtil.create('div', 'wind-legend');
      L.DomEvent.disableClickPropagation(div);
      div.innerHTML =
        '<div class="wind-legend-title">PM2.5 (µg/m³)</div>' +
        '<div class="wind-legend-bar" style="background:linear-gradient(to right,#22c55e,#eab308,#f97316,#ef4444,#7c3aed,#7f1d1d)"></div>' +
        '<div class="wind-legend-labels"><span>0</span><span>15</span><span>55</span><span>150</span><span>250</span><span>500</span></div>' +
        '<div class="wind-legend-items">' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#22c55e;"></span>< 15 — Baik</div>' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#eab308;"></span>15 – 55 — Sedang</div>' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#f97316;"></span>55 – 150 — Tidak Sehat (Sensitif)</div>' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#ef4444;"></span>150 – 250 — Tidak Sehat</div>' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#7c3aed;"></span>250 – 500 — Sangat Tidak Sehat</div>' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#7f1d1d;"></span>> 500 — Berbahaya</div>' +
        '</div>' +
        '<div class="wind-legend-unit">Sumber: BMKG PCM PM2.5</div>';
      return div;
    }
  });

  function escapeHtml(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function getPM25Category(val) {
    if (val < 15) return { label: 'Baik', color: '#22c55e', bg: '#f0fdf4', icon: '🌿' };
    if (val < 55) return { label: 'Sedang', color: '#eab308', bg: '#fefce8', icon: '😐' };
    if (val < 150) return { label: 'Tidak Sehat untuk Sensitif', color: '#f97316', bg: '#fff7ed', icon: '😷' };
    if (val < 250) return { label: 'Tidak Sehat', color: '#ef4444', bg: '#fef2f2', icon: '⚠️' };
    if (val < 500) return { label: 'Sangat Tidak Sehat', color: '#7c3aed', bg: '#f5f3ff', icon: '🚨' };
    return { label: 'Berbahaya', color: '#7f1d1d', bg: '#fef2f2', icon: '☠️' };
  }

  function buildPopupHtml(lat, lon, lokasi, cuaca) {
    var t = cuaca.t ?? '-';
    var hu = cuaca.hu ?? '-';
    var ws = cuaca.ws ?? '-';
    var weather = cuaca.weather_desc || cuaca.weather || '-';
    var pm25 = Number(cuaca.pm25) || 0;
    var cat = getPM25Category(pm25);

    return '<div class="wind-popup geoid-popup-scroll">' +
      '<div class="wind-popup-head" style="background:linear-gradient(135deg,#22c55e,#16a34a);"><div class="wind-popup-badge"><span class="wind-popup-badge-dot" style="background:#bbf7d0;"></span>PM2.5 Layer</div>' +
      '<strong>' + escapeHtml(lokasi?.desa || lokasi?.kecamatan || 'Lokasi') + '</strong>' +
      '<span>' + escapeHtml((lokasi?.kabkota || '') + (lokasi?.provinsi ? ', ' + lokasi.provinsi : '')) + '</span></div>' +
      '<div class="wind-popup-body">' +
      '<div class="wind-popup-meta"><div><span>Koordinat</span><b>' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '</b></div></div>' +
      '<div class="wind-popup-card" style="background:' + cat.bg + ';">' +
        '<div class="wind-popup-compass"><div class="wind-popup-compass-ring" style="border-color:' + cat.color + ';"><span style="font-size:20px;">' + cat.icon + '</span></div></div>' +
        '<div class="wind-popup-wind-info"><div class="wind-popup-speed"><span class="wind-popup-speed-val" style="color:' + cat.color + ';">' + pm25 + '</span><span class="wind-popup-speed-unit">µg/m³</span></div>' +
        '<div class="wind-popup-cat" style="color:' + cat.color + ';">' + cat.label + '</div></div></div>' +
      '<div class="wind-popup-detail-grid">' +
        '<div class="wind-popup-detail"><span>Suhu</span><b>' + t + '°C</b></div>' +
        '<div class="wind-popup-detail"><span>Kelembapan</span><b>' + hu + '%</b></div>' +
        '<div class="wind-popup-detail"><span>Angin</span><b>' + ws + ' km/j</b></div>' +
        '<div class="wind-popup-detail" style="grid-column:span 3;"><span>Cuaca</span><b>' + escapeHtml(weather) + '</b></div>' +
      '</div></div></div>';
  }

  var popupMarker = null;

  async function showPopup(lat, lon) {
    if (popupMarker) { map.removeLayer(popupMarker); popupMarker = null; }
    var icon = L.divIcon({ className: 'geoid-marker-wrap', html: '<div class="geoid-marker" role="img"><svg viewBox="0 0 24 24"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg></div>', iconSize: [48, 54], iconAnchor: [24, 52], popupAnchor: [0, -52] });
    popupMarker = L.marker([lat, lon], { icon: icon, zIndexOffset: 1000 }).addTo(map);
    popupMarker.bindPopup('<div class="wind-popup geoid-popup-scroll"><div class="wind-popup-head" style="background:linear-gradient(135deg,#22c55e,#16a34a);"><div class="wind-popup-badge"><span class="wind-popup-badge-dot" style="background:#bbf7d0;"></span>PM2.5</div><strong>' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '</strong></div><div class="wind-popup-body"><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px 0 10px;gap:8px;"><div style="width:28px;height:28px;border:3px solid #bbf7d0;border-top-color:#22c55e;border-radius:50%;animation:geoportal-spin .8s linear infinite;"></div><span style="font-size:10px;color:#94a3b8;">Memuat data PM2.5…</span></div></div></div>', { maxWidth: 310, className: 'geoid-leaflet-popup' });
    popupMarker.openPopup();

    try {
      var res = await fetch('https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=pjson&featureTypes=&location=' + lon + ',' + lat);
      var data = await res.json();
      var lokasi = { desa: '', kecamatan: '', kabkota: '', provinsi: '', kode: '' };
      if (data && data.address) { var addr = data.address; lokasi.desa = addr.Neighborhood || addr.PlaceName || ''; lokasi.kecamatan = addr.City || addr.District || ''; lokasi.kabkota = addr.Subregion || addr.MetroArea || ''; lokasi.provinsi = addr.Region || ''; }
      if (typeof matchKemendagri === 'function') { var m = matchKemendagri(lokasi); if (m) { lokasi.kode = m.kode; lokasi.desa = lokasi.desa || m.desa; lokasi.kecamatan = m.kecamatan || lokasi.kecamatan; lokasi.kabkota = m.kabkota || lokasi.kabkota; lokasi.provinsi = m.provinsi || lokasi.provinsi; } }
      var cuaca = null;
      if (lokasi.kode) { try { var wr = await fetch('https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=' + lokasi.kode); if (wr.ok) { var wp = await wr.json(); cuaca = wp?.data?.[0]?.cuaca?.[0]?.[0] || null; } } catch (e) {} }
      if (cuaca) popupMarker.setPopupContent(buildPopupHtml(lat, lon, lokasi, cuaca));
      else popupMarker.setPopupContent('<div class="wind-popup geoid-popup-scroll"><div class="wind-popup-head" style="background:linear-gradient(135deg,#22c55e,#16a34a);"><strong>' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '</strong></div><div class="wind-popup-body"><div class="wind-popup-fallback">Data PM2.5 tidak tersedia.</div></div></div>');
    } catch (err) {
      popupMarker.setPopupContent('<div class="wind-popup"><div class="wind-popup-head" style="background:linear-gradient(135deg,#22c55e,#16a34a);"><strong>' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '</strong></div><div class="wind-popup-body"><span style="color:#e74c3c;font-size:12px;">Gagal memuat data</span></div></div>');
    }
  }

  function showLegend() { if (!legendControl) { legendControl = new Legend(); legendControl.addTo(map); } }
  function hideLegend() { if (legendControl) { map.removeControl(legendControl); legendControl = null; } }

  function addLayer(modelRun, forecast) {
    var mr = GfsBase.buildDateStr(modelRun);
    var fc = GfsBase.buildDateStr(forecast);
    var url = GfsBase.basePath.replace('gfs_indo', BASE_PATH) + '/' + LAYER_NAME + '/1000/' + mr + '/' + fc + '/{z}/{x}/{y}.png';
    if (layer) { map.removeLayer(layer); layer = null; }
    layer = L.tileLayer(url, { tileSize: 256, opacity: 0.7, maxZoom: 8, minZoom: 0, tms: true, attribution: 'BMKG PCM PM2.5' }).addTo(map);
    GfsBase.loadProvinsi(PROV_GEOJSON_URL);
    showLegend();
    var info = document.getElementById('pm25RgbInfo');
    if (info) info.textContent = GfsBase.formatInfo(modelRun, forecast);
  }

  async function showLayer() {
    if (layer) { map.removeLayer(layer); layer = null; }
    var candidates = await GfsBase.buildCandidateListForModel(MODEL_NAME);
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      var ok = await GfsBase.probeTileFor(BASE_PATH, LAYER_NAME, GfsBase.buildDateStr(c.modelRun), GfsBase.buildDateStr(c.forecast));
      if (ok) { addLayer(c.modelRun, c.forecast); return; }
    }
    var info = document.getElementById('pm25RgbInfo');
    if (info) info.textContent = 'Data PM2.5 BMKG belum tersedia';
  }

  function hideLayer() {
    if (layer) { map.removeLayer(layer); layer = null; }
    GfsBase.removeProvinsi();
    hideLegend();
  }

  function isActive() { return !!layer && map.hasLayer(layer); }

  window.showPm25Popup = showPopup;
  window.isPm25RgbActive = isActive;

  if (typeof GfsBase !== 'undefined') GfsBase.registerLayer('pm25', hideLayer);

  document.addEventListener('DOMContentLoaded', function () {
    var checkbox = document.getElementById('togglePm25Rgb');
    if (!checkbox) return;
    var info = document.getElementById('pm25RgbInfo');
    GfsBase.buildCandidateListForModel(MODEL_NAME).then(function (candidates) {
      if (candidates.length && info) info.textContent = 'Model run: ' + GfsBase.formatInfo(candidates[0].modelRun, candidates[0].forecast);
    });
    checkbox.addEventListener('change', function () {
      if (this.checked) {
        if (typeof GfsBase.deactivateOthers === 'function') GfsBase.deactivateOthers('pm25');
        showLayer(); map.flyTo([-1.5, 118.5], 5, { duration: 1.5 });
      }
      else hideLayer();
    });
  });
})();
