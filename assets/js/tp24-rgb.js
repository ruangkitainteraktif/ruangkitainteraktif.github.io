/* ── Total Precipitation 24H RGB Layer (BMKG GFS) ── */
(function () {
  'use strict';

  var PROV_GEOJSON_URL = 'assets/data/bps/geojson/provinsi.geojson';
  var layer = null;
  var legendControl = null;

  var Legend = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd: function () {
      var div = L.DomUtil.create('div', 'wind-legend');
      L.DomEvent.disableClickPropagation(div);
      div.innerHTML =
        '<div class="wind-legend-title">Curah Hujan 24 Jam (mm)</div>' +
        '<div class="wind-legend-bar" style="background:linear-gradient(to right,#3b82f6,#22c55e,#eab308,#f97316,#ef4444)"></div>' +
        '<div class="wind-legend-labels"><span>0</span><span>0.5</span><span>5</span><span>20</span><span>50</span><span>100</span></div>' +
        '<div class="wind-legend-items">' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#3b82f6;"></span>0.5 – 5 — Ringan</div>' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#22c55e;"></span>5 – 20 — Sedang</div>' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#eab308;"></span>20 – 50 — Lebat</div>' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#f97316;"></span>50 – 100 — Sangat Lebat</div>' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#ef4444;"></span>> 100 — Ekstrem</div>' +
        '</div>' +
        '<div class="wind-legend-unit">Sumber: BMKG GFS</div>';
      return window.createLegendWithToggle(div);
    }
  });

  function escapeHtml(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function getPrecipCategory(mm) {
    if (mm <= 0) return { label: 'Tidak Hujan', color: '#a3a3a3', bg: '#f5f5f5', icon: '☀️' };
    if (mm <= 5) return { label: 'Ringan', color: '#3b82f6', bg: '#eff6ff', icon: '🌦️' };
    if (mm <= 20) return { label: 'Sedang', color: '#22c55e', bg: '#f0fdf4', icon: '🌧️' };
    if (mm <= 50) return { label: 'Lebat', color: '#eab308', bg: '#fefce8', icon: '🌧️' };
    if (mm <= 100) return { label: 'Sangat Lebat', color: '#f97316', bg: '#fff7ed', icon: '⛈️' };
    return { label: 'Ekstrem', color: '#ef4444', bg: '#fef2f2', icon: '🌊' };
  }

  function buildPopupHtml(lat, lon, lokasi, cuaca) {
    var t = cuaca.t ?? '-';
    var hu = cuaca.hu ?? '-';
    var ws = cuaca.ws ?? '-';
    var wd = cuaca.wd || cuaca.wd_to || '-';
    var weather = cuaca.weather_desc || cuaca.weather || '-';
    var image = cuaca.image || '';
    var pr = Number(cuaca.tp) || 0;
    var cat = getPrecipCategory(pr);

    return '<div class="wind-popup geoid-popup-scroll">' +
      '<div class="wind-popup-head" style="background:linear-gradient(135deg,#dc2626,#991b1b);"><div class="wind-popup-badge"><span class="wind-popup-badge-dot" style="background:#fca5a5;"></span>Precipitation Layer</div>' +
      '<strong>' + escapeHtml(lokasi?.desa || lokasi?.kecamatan || 'Lokasi') + '</strong>' +
      '<span>' + escapeHtml((lokasi?.kabkota || '') + (lokasi?.provinsi ? ', ' + lokasi.provinsi : '')) + '</span></div>' +
      '<div class="wind-popup-body">' +
      '<div class="wind-popup-meta"><div><span>Koordinat</span><b>' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '</b></div></div>' +
      '<div class="wind-popup-card" style="background:' + cat.bg + ';">' +
        '<div class="wind-popup-compass"><div class="wind-popup-compass-ring" style="border-color:' + cat.color + ';"><span style="font-size:20px;">' + cat.icon + '</span></div></div>' +
        '<div class="wind-popup-wind-info"><div class="wind-popup-speed"><span class="wind-popup-speed-val" style="color:' + cat.color + ';">' + pr + '</span><span class="wind-popup-speed-unit">mm</span></div>' +
        '<div class="wind-popup-cat" style="color:' + cat.color + ';">' + cat.label + '</div><div class="wind-popup-beaufort">Total 24 jam</div></div></div>' +
      '<div class="wind-popup-detail-grid">' +
        '<div class="wind-popup-detail"><span>Suhu</span><b>' + t + '°C</b></div>' +
        '<div class="wind-popup-detail"><span>Kelembapan</span><b>' + hu + '%</b></div>' +
        '<div class="wind-popup-detail"><span>Angin</span><b>' + ws + ' km/j</b></div>' +
        '<div class="wind-popup-detail" style="grid-column:span 3;"><span>Cuaca</span><b>' + escapeHtml(weather) + '</b></div>' +
        (image ? '<div class="wind-popup-detail" style="grid-column:span 3;justify-content:center;"><img src="' + escapeHtml(image) + '" alt="" style="width:36px;height:36px;object-fit:contain;"></div>' : '') +
      '</div></div></div>';
  }

  var popupMarker = null;

  async function showPopup(lat, lon) {
    if (popupMarker) { map.removeLayer(popupMarker); popupMarker = null; }
    var icon = L.divIcon({ className: 'geoid-marker-wrap', html: '<div class="geoid-marker" role="img"><svg viewBox="0 0 24 24"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg></div>', iconSize: [48, 54], iconAnchor: [24, 52], popupAnchor: [0, -52] });
    popupMarker = L.marker([lat, lon], { icon: icon, zIndexOffset: 1000 }).addTo(map);
    popupMarker.bindPopup('<div class="wind-popup geoid-popup-scroll"><div class="wind-popup-head" style="background:linear-gradient(135deg,#dc2626,#991b1b);"><div class="wind-popup-badge"><span class="wind-popup-badge-dot" style="background:#fca5a5;"></span>Precipitation</div><strong>' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '</strong></div><div class="wind-popup-body"><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px 0 10px;gap:8px;"><div style="width:28px;height:28px;border:3px solid #fecaca;border-top-color:#dc2626;border-radius:50%;animation:geoportal-spin .8s linear infinite;"></div><span style="font-size:10px;color:#94a3b8;">Memuat data curah hujan…</span></div></div></div>', { maxWidth: 310, className: 'geoid-leaflet-popup' });
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
      else popupMarker.setPopupContent('<div class="wind-popup geoid-popup-scroll"><div class="wind-popup-head" style="background:linear-gradient(135deg,#dc2626,#991b1b);"><strong>' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '</strong></div><div class="wind-popup-body"><div class="wind-popup-fallback">Data curah hujan tidak tersedia.</div></div></div>');
    } catch (err) {
      popupMarker.setPopupContent('<div class="wind-popup"><div class="wind-popup-head" style="background:linear-gradient(135deg,#dc2626,#991b1b);"><strong>' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '</strong></div><div class="wind-popup-body"><span style="color:#e74c3c;font-size:12px;">Gagal memuat data</span></div></div>');
    }
  }

  function showLegend() { if (!legendControl) { legendControl = new Legend(); legendControl.addTo(map); } }
  function hideLegend() { if (legendControl) { map.removeControl(legendControl); legendControl = null; } }

  var H24_MS = 24 * 60 * 60 * 1000;

  function ensureTp24Forecast(modelRun) {
    var now = new Date();
    var utcH = now.getUTCHours();
    var forecast = new Date(modelRun);
    if (utcH >= 12) { forecast.setUTCDate(forecast.getUTCDate() + 1); forecast.setUTCHours(3, 0, 0, 0); }
    else if (utcH >= 3) { forecast.setUTCHours(12, 0, 0, 0); }
    else { forecast.setUTCHours(3, 0, 0, 0); }
    if (forecast <= modelRun) { forecast = new Date(modelRun); forecast.setUTCHours(forecast.getUTCHours() + 3); }
    if (forecast.getTime() - modelRun.getTime() < H24_MS) {
      forecast = new Date(modelRun.getTime() + H24_MS);
    }
    return forecast;
  }

  function addLayer(modelRun, forecast) {
    var mr = GfsBase.buildDateStr(modelRun);
    var fc = GfsBase.buildDateStr(forecast);
    var url = GfsBase.basePath + '/tp24/1000/' + mr + '/' + fc + '/{z}/{x}/{y}.png';
    if (layer) { map.removeLayer(layer); layer = null; }
    layer = L.tileLayer(url, { tileSize: 256, opacity: 0.7, maxZoom: 8, minZoom: 0, tms: true, attribution: 'BMKG GFS TP24' }).addTo(map);
    GfsBase.loadProvinsi(PROV_GEOJSON_URL);
    showLegend();
    var info = document.getElementById('tp24RgbInfo');
    if (info) info.textContent = GfsBase.formatInfo(modelRun, forecast);
  }

  async function showLayer() {
    if (layer) { map.removeLayer(layer); layer = null; }
    var candidates = await GfsBase.buildCandidateListAsync();
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      var fc = ensureTp24Forecast(c.modelRun);
      var ok = await GfsBase.probeTileFor('gfs_indo', 'tp24', GfsBase.buildDateStr(c.modelRun), GfsBase.buildDateStr(fc));
      if (ok) { addLayer(c.modelRun, fc); return; }
    }
    var info = document.getElementById('tp24RgbInfo');
    if (info) info.textContent = 'Data curah hujan BMKG belum tersedia';
  }

  function hideLayer() {
    if (layer) { map.removeLayer(layer); layer = null; }
    GfsBase.removeProvinsi();
    hideLegend();
  }

  function isActive() { return !!layer && map.hasLayer(layer); }

  window.showTp24Popup = showPopup;
  window.isTp24RgbActive = isActive;

  if (typeof GfsBase !== 'undefined') GfsBase.registerLayer('tp24', hideLayer);

  document.addEventListener('DOMContentLoaded', function () {
    var checkbox = document.getElementById('toggleTp24Rgb');
    if (!checkbox) return;
    var info = document.getElementById('tp24RgbInfo');
    GfsBase.buildCandidateListAsync().then(function (candidates) {
      if (candidates.length) {
        var fc0 = ensureTp24Forecast(candidates[0].modelRun);
        if (info) info.textContent = 'Model run: ' + GfsBase.formatInfo(candidates[0].modelRun, fc0);
      }
    });
    checkbox.addEventListener('change', function () {
      if (this.checked) {
        if (typeof GfsBase.deactivateOthers === 'function') GfsBase.deactivateOthers('tp24');
        showLayer(); map.flyTo([-1.5, 118.5], 5, { duration: 1.5 });
      }
      else hideLayer();
    });
  });
})();
