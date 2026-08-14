/* ── GsMAP Precipitation RGB Layer (BMKG) ── */
(function () {
  'use strict';

  var PROV_GEOJSON_URL = 'assets/data/bps/geojson/provinsi.geojson';
  var MODEL_NAME = 'gsmap';
  var LAYER_NAME = 'precip';
  var BASE_PATH = 'gsmap';
  var layer = null;
  var legendControl = null;

  var Legend = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd: function () {
      var div = L.DomUtil.create('div', 'wind-legend');
      L.DomEvent.disableClickPropagation(div);
      div.innerHTML =
        '<div class="wind-legend-title">GsMAP Precipitation (mm/jam)</div>' +
        '<div class="wind-legend-bar" style="background:linear-gradient(to right,#a3e635,#eab308,#f97316,#7c3aed,#1e3a5f)"></div>' +
        '<div class="wind-legend-labels"><span>0</span><span>5</span><span>10</span><span>20</span><span>50</span></div>' +
        '<div class="wind-legend-items">' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#a3e635;"></span>< 1 — Hujan Ringan</div>' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#eab308;"></span>1 – 5 — Hujan Sedang</div>' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#f97316;"></span>5 – 10 — Hujan Lebat</div>' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#7c3aed;"></span>10 – 50 — Hujan Sangat Lebat</div>' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#1e3a5f;"></span>> 50 — Hujan Ekstrem</div>' +
        '</div>' +
        '<div class="wind-legend-unit">Sumber: BMKG GsMAP</div>';
      return div;
    }
  });

  function escapeHtml(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function getPrecipCategory(val) {
    if (val < 1) return { label: 'Hujan Ringan', color: '#a3e635', bg: '#f7fee7', icon: '🌦️' };
    if (val < 5) return { label: 'Hujan Sedang', color: '#eab308', bg: '#fefce8', icon: '🌧️' };
    if (val < 10) return { label: 'Hujan Lebat', color: '#f97316', bg: '#fff7ed', icon: '⛈️' };
    if (val < 50) return { label: 'Hujan Sangat Lebat', color: '#7c3aed', bg: '#f5f3ff', icon: '🌀' };
    return { label: 'Hujan Ekstrem', color: '#1e3a5f', bg: '#eff6ff', icon: '🌊' };
  }

  function buildPopupHtml(lat, lon, lokasi, cuaca) {
    var t = cuaca.t ?? '-';
    var hu = cuaca.hu ?? '-';
    var ws = cuaca.ws ?? '-';
    var weather = cuaca.weather_desc || cuaca.weather || '-';
    var precip = Number(cuaca.precip) || 0;
    var cat = getPrecipCategory(precip);

    return '<div class="wind-popup geoid-popup-scroll">' +
      '<div class="wind-popup-head" style="background:linear-gradient(135deg,#3b82f6,#1e40af);"><div class="wind-popup-badge"><span class="wind-popup-badge-dot" style="background:#bfdbfe;"></span>GsMAP Layer</div>' +
      '<strong>' + escapeHtml(lokasi?.desa || lokasi?.kecamatan || 'Lokasi') + '</strong>' +
      '<span>' + escapeHtml((lokasi?.kabkota || '') + (lokasi?.provinsi ? ', ' + lokasi.provinsi : '')) + '</span></div>' +
      '<div class="wind-popup-body">' +
      '<div class="wind-popup-meta"><div><span>Koordinat</span><b>' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '</b></div></div>' +
      '<div class="wind-popup-card" style="background:' + cat.bg + ';">' +
        '<div class="wind-popup-compass"><div class="wind-popup-compass-ring" style="border-color:' + cat.color + ';"><span style="font-size:20px;">' + cat.icon + '</span></div></div>' +
        '<div class="wind-popup-wind-info"><div class="wind-popup-speed"><span class="wind-popup-speed-val" style="color:' + cat.color + ';">' + precip + '</span><span class="wind-popup-speed-unit">mm/jam</span></div>' +
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
    popupMarker.bindPopup('<div class="wind-popup geoid-popup-scroll"><div class="wind-popup-head" style="background:linear-gradient(135deg,#3b82f6,#1e40af);"><div class="wind-popup-badge"><span class="wind-popup-badge-dot" style="background:#bfdbfe;"></span>GsMAP</div><strong>' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '</strong></div><div class="wind-popup-body"><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px 0 10px;gap:8px;"><div style="width:28px;height:28px;border:3px solid #bfdbfe;border-top-color:#3b82f6;border-radius:50%;animation:geoportal-spin .8s linear infinite;"></div><span style="font-size:10px;color:#94a3b8;">Memuat data GsMAP…</span></div></div></div>', { maxWidth: 310, className: 'geoid-leaflet-popup' });
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
      else popupMarker.setPopupContent('<div class="wind-popup geoid-popup-scroll"><div class="wind-popup-head" style="background:linear-gradient(135deg,#3b82f6,#1e40af);"><strong>' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '</strong></div><div class="wind-popup-body"><div class="wind-popup-fallback">Data GsMAP tidak tersedia.</div></div></div>');
    } catch (err) {
      popupMarker.setPopupContent('<div class="wind-popup"><div class="wind-popup-head" style="background:linear-gradient(135deg,#3b82f6,#1e40af);"><strong>' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '</strong></div><div class="wind-popup-body"><span style="color:#e74c3c;font-size:12px;">Gagal memuat data</span></div></div>');
    }
  }

  function showLegend() { if (!legendControl) { legendControl = new Legend(); legendControl.addTo(map); } }
  function hideLegend() { if (legendControl) { map.removeControl(legendControl); legendControl = null; } }

  function addLayer(modelRun, forecast) {
    var mr = GfsBase.buildDateStr(modelRun);
    var fc = GfsBase.buildDateStr(forecast);
    var url = 'https://spartan.bmkg.go.id/map/rgb_req/' + BASE_PATH + '/' + LAYER_NAME + '/1000/' + mr + '/' + fc + '/{z}/{x}/{y}.png';
    if (layer) { map.removeLayer(layer); layer = null; }
    layer = L.tileLayer(url, { tileSize: 256, opacity: 0.7, maxZoom: 8, minZoom: 0, tms: true, attribution: 'BMKG GsMAP' }).addTo(map);
    GfsBase.loadProvinsi(PROV_GEOJSON_URL);
    showLegend();
    var info = document.getElementById('gsmapRgbInfo');
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
    var info = document.getElementById('gsmapRgbInfo');
    if (info) info.textContent = 'Data GsMAP BMKG belum tersedia';
  }

  function hideLayer() {
    if (layer) { map.removeLayer(layer); layer = null; }
    GfsBase.removeProvinsi();
    hideLegend();
  }

  function isActive() { return !!layer && map.hasLayer(layer); }

  window.showGsmapPopup = showPopup;
  window.isGsmapRgbActive = isActive;

  if (typeof GfsBase !== 'undefined') GfsBase.registerLayer('gsmap', hideLayer);

  document.addEventListener('DOMContentLoaded', function () {
    var checkbox = document.getElementById('toggleGsmapRgb');
    if (!checkbox) return;
    var info = document.getElementById('gsmapRgbInfo');
    GfsBase.buildCandidateListForModel(MODEL_NAME).then(function (candidates) {
      if (candidates.length && info) info.textContent = 'Model run: ' + GfsBase.formatInfo(candidates[0].modelRun, candidates[0].forecast);
    });
    checkbox.addEventListener('change', function () {
      if (this.checked) {
        if (typeof GfsBase.deactivateOthers === 'function') GfsBase.deactivateOthers('gsmap');
        showLayer(); map.flyTo([-1.5, 118.5], 5, { duration: 1.5 });
      }
      else hideLayer();
    });
  });
})();
