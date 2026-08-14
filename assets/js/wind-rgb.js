/* ── Wind RGB Layer (BMKG GFS) ── */
(function () {
  'use strict';

  var PROV_GEOJSON_URL = 'assets/data/bps/geojson/provinsi.geojson';
  var windRgbLayer = null;
  var legendControl = null;
  var windPopupMarker = null;

  var WindLegend = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd: function () {
      var div = L.DomUtil.create('div', 'wind-legend');
      L.DomEvent.disableClickPropagation(div);
      div.innerHTML =
        '<div class="wind-legend-title">Wind Speed (m/s)</div>' +
        '<div class="wind-legend-bar" style="background:linear-gradient(to right,#64b4ff,#32dc78,#ffdc32,#ff5032)"></div>' +
        '<div class="wind-legend-labels"><span>0</span><span>3</span><span>8</span><span>15</span><span>25</span></div>' +
        '<div class="wind-legend-items">' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#64b4ff;"></span>< 3 — Calm</div>' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#32dc78;"></span>3 – 8 — Light</div>' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#ffdc32;"></span>8 – 15 — Moderate</div>' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#ff5032;"></span>≥ 15 — Strong</div>' +
        '</div>' +
        '<div class="wind-legend-unit">Sumber: BMKG GFS</div>';
      return div;
    }
  });

  function escapeHtml(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function getWindCategory(ms) {
    if (ms < 1) return { label: 'Tenang', color: '#64b4ff', bg: '#eff6ff', icon: '🍃' };
    if (ms < 6) return { label: 'Ringan', color: '#32dc78', bg: '#f0fdf4', icon: '🌬️' };
    if (ms < 11) return { label: 'Sedang', color: '#ffdc32', bg: '#fefce8', icon: '💨' };
    if (ms < 17) return { label: 'Kuat', color: '#ff8c32', bg: '#fff7ed', icon: '🌪️' };
    return { label: 'Sangat Kuat', color: '#ff5032', bg: '#fef2f2', icon: '🌀' };
  }

  function getBeaufort(ms) {
    if (ms < 0.5) return 0; if (ms < 1.6) return 1; if (ms < 3.4) return 2;
    if (ms < 5.5) return 3; if (ms < 8.0) return 4; if (ms < 10.8) return 5;
    if (ms < 13.9) return 6; if (ms < 17.2) return 7; if (ms < 20.8) return 8;
    if (ms < 24.5) return 9; if (ms < 28.5) return 10; if (ms < 32.7) return 11;
    return 12;
  }

  function buildPopupHtml(lat, lon, lokasi, cuaca) {
    var ws = Number(cuaca.ws) || 0;
    var wsMs = ws / 3.6;
    var wd = cuaca.wd || cuaca.wd_to || '-';
    var wdDeg = Number(cuaca.wd_deg) || 0;
    var t = cuaca.t ?? '-';
    var hu = cuaca.hu ?? '-';
    var weather = cuaca.weather_desc || cuaca.weather || '-';
    var image = cuaca.image || '';
    var cat = getWindCategory(wsMs);
    var beaufort = getBeaufort(wsMs);

    return '<div class="wind-popup geoid-popup-scroll">' +
      '<div class="wind-popup-head"><div class="wind-popup-badge"><span class="wind-popup-badge-dot"></span>Wind Layer</div>' +
      '<strong>' + escapeHtml(lokasi?.desa || lokasi?.kecamatan || 'Lokasi') + '</strong>' +
      '<span>' + escapeHtml((lokasi?.kabkota || '') + (lokasi?.provinsi ? ', ' + lokasi.provinsi : '')) + '</span></div>' +
      '<div class="wind-popup-body">' +
      '<div class="wind-popup-meta"><div><span>Koordinat</span><b>' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '</b></div></div>' +
      '<div class="wind-popup-card" style="background:' + cat.bg + ';">' +
        '<div class="wind-popup-compass"><div class="wind-popup-compass-ring"><span class="wind-popup-compass-arrow" style="transform:rotate(' + wdDeg + 'deg)"></span></div><div class="wind-popup-compass-label">' + escapeHtml(wd) + '</div></div>' +
        '<div class="wind-popup-wind-info"><div class="wind-popup-speed"><span class="wind-popup-speed-val" style="color:' + cat.color + ';">' + ws + '</span><span class="wind-popup-speed-unit">km/j</span></div>' +
        '<div class="wind-popup-cat">' + cat.icon + ' ' + cat.label + '</div><div class="wind-popup-beaufort">Beaufort ' + beaufort + '</div></div></div>' +
      '<div class="wind-popup-detail-grid">' +
        '<div class="wind-popup-detail"><span>Suhu</span><b>' + t + '°C</b></div>' +
        '<div class="wind-popup-detail"><span>Kelembapan</span><b>' + hu + '%</b></div>' +
        '<div class="wind-popup-detail"><span>Cuaca</span><b>' + escapeHtml(weather) + '</b></div>' +
        (image ? '<div class="wind-popup-detail" style="grid-column:span 3;justify-content:center;"><img src="' + escapeHtml(image) + '" alt="" style="width:36px;height:36px;object-fit:contain;"></div>' : '') +
      '</div></div></div>';
  }

  async function showWindPopup(lat, lon) {
    if (windPopupMarker) { map.removeLayer(windPopupMarker); windPopupMarker = null; }
    var icon = L.divIcon({ className: 'geoid-marker-wrap', html: '<div class="geoid-marker" role="img"><svg viewBox="0 0 24 24"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg></div>', iconSize: [48, 54], iconAnchor: [24, 52], popupAnchor: [0, -52] });
    windPopupMarker = L.marker([lat, lon], { icon: icon, zIndexOffset: 1000 }).addTo(map);

    var loadingHtml = '<div class="wind-popup geoid-popup-scroll"><div class="wind-popup-head"><div class="wind-popup-badge"><span class="wind-popup-badge-dot"></span>Wind Layer</div><strong>' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '</strong></div><div class="wind-popup-body"><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px 0 10px;gap:8px;"><div style="width:28px;height:28px;border:3px solid #bfdbfe;border-top-color:#2563eb;border-radius:50%;animation:geoportal-spin .8s linear infinite;"></div><span style="font-size:10px;color:#94a3b8;">Memuat data angin…</span></div></div></div>';
    windPopupMarker.bindPopup(loadingHtml, { maxWidth: 310, className: 'geoid-leaflet-popup' });
    windPopupMarker.openPopup();

    try {
      var res = await fetch('https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=pjson&featureTypes=&location=' + lon + ',' + lat);
      var data = await res.json();
      var lokasi = { desa: '', kecamatan: '', kabkota: '', provinsi: '', kode: '' };
      if (data && data.address) {
        var addr = data.address;
        lokasi.desa = addr.Neighborhood || addr.PlaceName || '';
        lokasi.kecamatan = addr.City || addr.District || '';
        lokasi.kabkota = addr.Subregion || addr.MetroArea || '';
        lokasi.provinsi = addr.Region || '';
      }

      if (typeof matchKemendagri === 'function') {
        var matched = matchKemendagri(lokasi);
        if (matched) { lokasi.kode = matched.kode; lokasi.desa = lokasi.desa || matched.desa; lokasi.kecamatan = matched.kecamatan || lokasi.kecamatan; lokasi.kabkota = matched.kabkota || lokasi.kabkota; lokasi.provinsi = matched.provinsi || lokasi.provinsi; }
      }

      var cuaca = null;
      if (lokasi.kode) {
        try {
          var wr = await fetch('https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=' + lokasi.kode);
          if (wr.ok) { var wp = await wr.json(); cuaca = wp?.data?.[0]?.cuaca?.[0]?.[0] || null; }
        } catch (e) {}
      }

      if (cuaca) {
        windPopupMarker.setPopupContent(buildPopupHtml(lat, lon, lokasi, cuaca));
      } else {
        windPopupMarker.setPopupContent('<div class="wind-popup geoid-popup-scroll"><div class="wind-popup-head"><div class="wind-popup-badge"><span class="wind-popup-badge-dot"></span>Wind Layer</div><strong>' + escapeHtml(lokasi.desa || lokasi.kecamatan || 'Lokasi') + '</strong><span>' + escapeHtml((lokasi.kabkota || '') + (lokasi.provinsi ? ', ' + lokasi.provinsi : '')) + '</span></div><div class="wind-popup-body"><div class="wind-popup-meta"><div><span>Koordinat</span><b>' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '</b></div></div><div class="wind-popup-fallback">Data cuaca tidak tersedia.</div></div></div>');
      }
    } catch (err) {
      windPopupMarker.setPopupContent('<div class="wind-popup"><div class="wind-popup-head"><strong>' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '</strong></div><div class="wind-popup-body"><span style="color:#e74c3c;font-size:12px;">Gagal memuat data angin</span></div></div>');
    }
  }

  function showLegend() {
    if (!legendControl) { legendControl = new WindLegend(); legendControl.addTo(map); }
  }

  function hideLegend() {
    if (legendControl) { map.removeControl(legendControl); legendControl = null; }
  }

  function addLayer(modelRun, forecast) {
    var mr = GfsBase.buildDateStr(modelRun);
    var fc = GfsBase.buildDateStr(forecast);
    var url = GfsBase.basePath + '/wind/1000/' + mr + '/' + fc + '/{z}/{x}/{y}.png';
    if (windRgbLayer) { map.removeLayer(windRgbLayer); windRgbLayer = null; }
    windRgbLayer = L.tileLayer(url, { tileSize: 256, opacity: 0.7, maxZoom: 8, minZoom: 0, tms: true, attribution: 'BMKG GFS Wind RGB' }).addTo(map);
    GfsBase.loadProvinsi(PROV_GEOJSON_URL);
    showLegend();
    var info = document.getElementById('windRgbInfo');
    if (info) info.textContent = GfsBase.formatInfo(modelRun, forecast);
  }

  async function showLayer() {
    if (windRgbLayer) { map.removeLayer(windRgbLayer); windRgbLayer = null; }
    var candidates = await GfsBase.buildCandidateListAsync();
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      var ok = await GfsBase.probeTileFor('gfs_indo', 'wind', GfsBase.buildDateStr(c.modelRun), GfsBase.buildDateStr(c.forecast));
      if (ok) { addLayer(c.modelRun, c.forecast); return; }
    }
    var info = document.getElementById('windRgbInfo');
    if (info) info.textContent = 'Data angin BMKG belum tersedia';
  }

  function hideLayer() {
    if (windRgbLayer) { map.removeLayer(windRgbLayer); windRgbLayer = null; }
    GfsBase.removeProvinsi();
    hideLegend();
  }

  function isActive() { return !!windRgbLayer && map.hasLayer(windRgbLayer); }

  window.showWindPopup = showWindPopup;
  window.isWindRgbActive = isActive;

  if (typeof GfsBase !== 'undefined') GfsBase.registerLayer('wind', hideLayer);

  document.addEventListener('DOMContentLoaded', function () {
    var checkbox = document.getElementById('toggleWindRgb');
    if (!checkbox) return;
    var info = document.getElementById('windRgbInfo');
    GfsBase.buildCandidateListAsync().then(function (candidates) {
      if (candidates.length && info) info.textContent = 'Model run: ' + GfsBase.formatInfo(candidates[0].modelRun, candidates[0].forecast);
    });
    checkbox.addEventListener('change', function () {
      if (this.checked) {
        if (typeof GfsBase.deactivateOthers === 'function') GfsBase.deactivateOthers('wind');
        showLayer(); map.flyTo([-1.5, 118.5], 5, { duration: 1.5 });
      }
      else hideLayer();
    });
  });
})();
