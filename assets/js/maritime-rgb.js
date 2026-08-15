/* ── Maritime RGB — BMKG peta-maritim tile layers ── */
(function () {
  'use strict';

  var MARITIME_BASE = 'https://peta-maritim.bmkg.go.id/api21';
  var MARITIME_MODELRUN_API = MARITIME_BASE + '/modelrun';
  var PROV_GEOJSON_URL = 'assets/data/bps/geojson/provinsi.geojson';
  var PROBE_ZXY = '3/7/3';
  var CACHE_MS = 10 * 60 * 1000;

  var LAYERS = [
    {
      id: 'anginLaut', model: 'w3g_hires', layer: 'ws',
      name: 'Angin Laut', desc: 'Wind Speed & Direction',
      toggleId: 'toggleMaritimeAngin', infoId: 'maritimeAnginInfo',
      unit: 'knots',
      bands: [
        { max: 10, color: '#22c55e', label: 'Tenang (< 10 kn)' },
        { max: 20, color: '#eab308', label: 'Sedang (10-20 kn)' },
        { max: 30, color: '#f97316', label: 'Kuat (20-30 kn)' },
        { max: 999, color: '#dc2626', label: 'Sangat Kuat (> 30 kn)' }
      ]
    },
    {
      id: 'gelombang', model: 'w3g_hires', layer: 'dir',
      name: 'Tinggi Gelombang', desc: 'Significant Wave Height',
      toggleId: 'toggleMaritimeGelombang', infoId: 'maritimeGelombangInfo',
      unit: 'm',
      bands: [
        { max: 0.5, color: '#22c55e', label: 'Rendah (< 0.5 m)' },
        { max: 1.5, color: '#eab308', label: 'Sedang (0.5-1.5 m)' },
        { max: 2.5, color: '#f97316', label: 'Tinggi (1.5-2.5 m)' },
        { max: 999, color: '#dc2626', label: 'Sangat Tinggi (> 2.5 m)' }
      ]
    },
    {
      id: 'swell', model: 'w3g_hires', layer: 'psd',
      name: 'Swell', desc: 'Primary Swell Direction',
      toggleId: 'toggleMaritimeSwell', infoId: 'maritimeSwellInfo',
      unit: 'm',
      bands: [
        { max: 0.5, color: '#22c55e', label: 'Kecil (< 0.5 m)' },
        { max: 1.0, color: '#eab308', label: 'Sedang (0.5-1.0 m)' },
        { max: 2.0, color: '#f97316', label: 'Besar (1.0-2.0 m)' },
        { max: 999, color: '#dc2626', label: 'Sangat Besar (> 2.0 m)' }
      ]
    },
    {
      id: 'windSea', model: 'w3g_hires', layer: 'wsd',
      name: 'Gelombang Angin', desc: 'Wind Sea Direction',
      toggleId: 'toggleMaritimeWindSea', infoId: 'maritimeWindSeaInfo',
      unit: 'm',
      bands: [
        { max: 0.5, color: '#22c55e', label: 'Kecil (< 0.5 m)' },
        { max: 1.5, color: '#eab308', label: 'Sedang (0.5-1.5 m)' },
        { max: 2.5, color: '#f97316', label: 'Besar (1.5-2.5 m)' },
        { max: 999, color: '#dc2626', label: 'Sangat Besar (> 2.5 m)' }
      ]
    }
  ];

  var activeLayer = null;
  var activeConfig = null;
  var legendControl = null;
  var popupMarker = null;

  var _mrCache = {};
  var _mrCacheTime = 0;

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function buildDateStr(d) {
    return '' + d.getUTCFullYear()
      + pad2(d.getUTCMonth() + 1)
      + pad2(d.getUTCDate())
      + pad2(d.getUTCHours()) + '00';
  }

  function formatInfo(modelRun, forecast) {
    var m = buildDateStr(modelRun);
    var f = buildDateStr(forecast);
    var ms = m.slice(6, 8) + ' ' + m.slice(8, 10) + 'Z ' + m.slice(4, 6) + '/' + m.slice(0, 4);
    var fs = f.slice(6, 8) + ' ' + f.slice(8, 10) + 'Z ' + f.slice(4, 6) + '/' + f.slice(0, 4);
    return ms + ' \u2192 ' + fs;
  }

  function escapeMaritimeHtml(v) {
    return String(v || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  /* ── Modelrun ── */
  async function fetchModelruns() {
    var now = Date.now();
    if (_mrCacheTime && (now - _mrCacheTime) < CACHE_MS && _mrCache.w3g_hires) return _mrCache;
    try {
      var res = await fetch(MARITIME_MODELRUN_API);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      _mrCache = await res.json();
      _mrCacheTime = now;
      return _mrCache;
    } catch (e) {
      console.warn('Gagal memuat modelrun maritim:', e);
      return _mrCache || {};
    }
  }

  function calcForecastTime(modelRun) {
    var now = new Date();
    var utcH = now.getUTCHours();
    var forecast = new Date(modelRun);
    if (utcH >= 12) { forecast.setUTCDate(forecast.getUTCDate() + 1); forecast.setUTCHours(3, 0, 0, 0); }
    else if (utcH >= 3) { forecast.setUTCHours(12, 0, 0, 0); }
    else { forecast.setUTCHours(3, 0, 0, 0); }
    if (forecast <= modelRun) { forecast = new Date(modelRun); forecast.setUTCHours(forecast.getUTCHours() + 3); }
    return forecast;
  }

  async function buildCandidates(modelName) {
    var modelruns = await fetchModelruns();
    var runs = modelruns[modelName];
    if (!runs || !runs.length) return [];
    var candidates = [];
    for (var i = 0; i < runs.length; i++) {
      var mr = new Date(runs[i]);
      var fc = calcForecastTime(mr);
      candidates.push({ modelRun: mr, forecast: fc });
    }
    return candidates;
  }

  function probeTile(model, layer, mrStr, fcStr) {
    return new Promise(function (resolve) {
      var img = new Image();
      var timeout = setTimeout(function () { img.src = ''; resolve(false); }, 5000);
      img.onload = function () { clearTimeout(timeout); resolve(true); };
      img.onerror = function () { clearTimeout(timeout); resolve(false); };
      img.src = MARITIME_BASE + '/tile_req/' + model + '/' + layer + '/0/' + mrStr + '/' + fcStr + '/' + PROBE_ZXY + '.png';
    });
  }

  /* ── Layer ── */
  function addLayer(config, modelRun, forecast) {
    var mr = buildDateStr(modelRun);
    var fc = buildDateStr(forecast);
    var url = MARITIME_BASE + '/tile_req/' + config.model + '/' + config.layer + '/0/' + mr + '/' + fc + '/{z}/{x}/{y}.png';
    if (activeLayer) { map.removeLayer(activeLayer); activeLayer = null; }
    activeLayer = L.tileLayer(url, {
      tileSize: 256, opacity: 0.7, maxZoom: 8, minZoom: 3, tms: true,
      attribution: 'BMKG ' + config.name
    }).addTo(map);
    activeConfig = config;
    showLegend(config);
    if (typeof GfsBase !== 'undefined') GfsBase.loadProvinsi(PROV_GEOJSON_URL);
    var info = document.getElementById(config.infoId);
    if (info) info.textContent = formatInfo(modelRun, forecast);
    map.flyTo([-1.5, 118.5], 5, { duration: 1.0 });
  }

  async function showLayer(config) {
    if (activeLayer) { map.removeLayer(activeLayer); activeLayer = null; }
    var candidates = await buildCandidates(config.model);
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      var ok = await probeTile(config.model, config.layer, buildDateStr(c.modelRun), buildDateStr(c.forecast));
      if (ok) { addLayer(config, c.modelRun, c.forecast); return; }
    }
    var info = document.getElementById(config.infoId);
    if (info) info.textContent = 'Data ' + config.name + ' belum tersedia';
  }

  function hideLayer() {
    if (activeLayer) { map.removeLayer(activeLayer); activeLayer = null; }
    activeConfig = null;
    hideLegend();
    if (typeof GfsBase !== 'undefined') GfsBase.removeProvinsi();
  }

  function hideAllMaritime() {
    LAYERS.forEach(function (cfg) {
      var cb = document.getElementById(cfg.toggleId);
      if (cb && cb.checked) { cb.checked = false; }
    });
    hideLayer();
  }

  function isActive(cfg) {
    return activeLayer && activeConfig && activeConfig.id === cfg.id && map.hasLayer(activeLayer);
  }

  function isAnyActive() {
    return !!activeLayer && map.hasLayer(activeLayer);
  }

  function getActiveConfig() { return activeConfig; }

  /* ── Legend ── */
  var MaritimeLegend = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd: function () {
      var cfg = activeConfig;
      if (!cfg) return L.DomUtil.create('div');
      var div = L.DomUtil.create('div', 'maritime-legend');
      var html = '<div class="maritime-legend-title">' + escapeMaritimeHtml(cfg.name) + '</div>';
      cfg.bands.forEach(function (b) {
        html += '<div class="maritime-legend-row"><span class="maritime-legend-swatch" style="background:' + b.color + '"></span><span>' + escapeMaritimeHtml(b.label) + '</span></div>';
      });
      html += '<div class="maritime-legend-source">Sumber: BMKG</div>';
      div.innerHTML = html;
      return div;
    }
  });

  function showLegend(config) {
    hideLegend();
    legendControl = new MaritimeLegend();
    legendControl.addTo(map);
  }

  function hideLegend() {
    if (legendControl) { map.removeControl(legendControl); legendControl = null; }
  }

  /* ── Popup ── */
  async function showPopup(lat, lon) {
    if (popupMarker) { map.removeLayer(popupMarker); popupMarker = null; }

    var cfg = getActiveConfig();
    var cfgName = cfg ? cfg.name : 'Maritim';
    var cfgDesc = cfg ? cfg.desc : '';

    var icon = L.divIcon({
      className: 'geoid-marker-wrap',
      html: '<div class="geoid-marker" role="img"><svg viewBox="0 0 24 24"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg></div>',
      iconSize: [48, 54], iconAnchor: [24, 52], popupAnchor: [0, -52]
    });
    popupMarker = L.marker([lat, lon], { icon: icon, zIndexOffset: 1000 }).addTo(map);

    popupMarker.bindPopup(
      '<div class="wind-popup geoid-popup-scroll">' +
        '<div class="wind-popup-head" style="background:linear-gradient(135deg,#0891b2,#155e75);">' +
          '<div class="wind-popup-badge"><span class="wind-popup-badge-dot" style="background:#a5f3fc;"></span>' + escapeMaritimeHtml(cfgName) + '</div>' +
          '<strong>' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '</strong>' +
        '</div>' +
        '<div class="wind-popup-body">' +
          '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px 0 10px;gap:8px;">' +
            '<div style="width:28px;height:28px;border:3px solid #a5f3fc;border-top-color:#0891b2;border-radius:50%;animation:geoportal-spin .8s linear infinite;"></div>' +
            '<span style="font-size:10px;color:#94a3b8;">Memuat data maritim\u2026</span>' +
          '</div>' +
        '</div>' +
      '</div>',
      { maxWidth: 310, className: 'geoid-leaflet-popup' }
    );
    popupMarker.openPopup();

    try {
      var lokasi = { desa: '', kecamatan: '', kabkota: '', provinsi: '', kode: '' };
      try {
        var geoRes = await fetch('https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=pjson&featureTypes=&location=' + lon + ',' + lat);
        var geoData = await geoRes.json();
        if (geoData && geoData.address) {
          var addr = geoData.address;
          lokasi.desa = addr.Neighborhood || addr.PlaceName || '';
          lokasi.kecamatan = addr.City || addr.District || '';
          lokasi.kabkota = addr.Subregion || addr.MetroArea || '';
          lokasi.provinsi = addr.Region || '';
        }
      } catch (e) {}

      var cuaca = null;
      if (typeof matchKemendagri === 'function') {
        var matched = matchKemendagri(lokasi);
        if (matched) { lokasi.kode = matched.kode; lokasi.desa = lokasi.desa || matched.desa; lokasi.kecamatan = lokasi.kecamatan || matched.kecamatan; lokasi.kabkota = lokasi.kabkota || matched.kabkota; lokasi.provinsi = lokasi.provinsi || matched.provinsi; }
      }
      if (lokasi.kode) {
        try {
          var wr = await fetch('https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=' + lokasi.kode);
          if (wr.ok) { var wp = await wr.json(); cuaca = wp?.data?.[0]?.cuaca?.[0]?.[0] || null; }
        } catch (e) {}
      }

      var html = '<div class="wind-popup geoid-popup-scroll">';
      html += '<div class="wind-popup-head" style="background:linear-gradient(135deg,#0891b2,#155e75);">';
      html += '<div class="wind-popup-badge"><span class="wind-popup-badge-dot" style="background:#a5f3fc;"></span>' + escapeMaritimeHtml(cfgName) + '</div>';
      html += '<strong>' + escapeMaritimeHtml(lokasi.desa || lokasi.kecamatan || '') + '</strong>';
      html += '<span>' + escapeMaritimeHtml((lokasi.kabkota || '') + (lokasi.provinsi ? ', ' + lokasi.provinsi : '')) + '</span>';
      html += '</div>';
      html += '<div class="wind-popup-body">';

      html += '<div class="wind-popup-meta">';
      html += '<div><span>Koordinat</span><b>' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '</b></div>';
      if (cfg) {
        html += '<div><span>Layer</span><b>' + escapeMaritimeHtml(cfg.desc) + '</b></div>';
        html += '<div><span>Model</span><b>' + escapeMaritimeHtml(cfg.model) + '</b></div>';
      }
      html += '</div>';

      if (cuaca) {
        html += '<div class="wind-popup-cuaca">';
        html += '<div class="wind-popup-cuaca-title">Prakiraan Cuaca Terdekat</div>';
        html += '<div class="wind-popup-cuaca-grid">';
        html += '<div class="wind-popup-cuaca-item"><span>Suhu</span><b>' + escapeMaritimeHtml(cuaca.t || '-') + '\u00b0C</b></div>';
        html += '<div class="wind-popup-cuaca-item"><span>Kelembaban</span><b>' + escapeMaritimeHtml(cuaca.hu || '-') + '%</b></div>';
        html += '<div class="wind-popup-cuaca-item"><span>Angin</span><b>' + escapeMaritimeHtml(cuaca.ws || '-') + ' km/h</b></div>';
        html += '<div class="wind-popup-cuaca-item"><span>Awan</span><b>' + escapeMaritimeHtml(cuaca.tcc || '-') + '%</b></div>';
        if (cuaca.weather_desc) {
          html += '<div class="wind-popup-cuaca-item" style="grid-column:span 2"><span>Cuaca</span><b>' + escapeMaritimeHtml(cuaca.weather_desc) + '</b></div>';
        }
        html += '</div></div>';
      }

      html += '<div class="wind-popup-footer"><span>Sumber: BMKG Peta Maritim</span></div>';
      html += '</div></div>';

      popupMarker.setPopupContent(html);
    } catch (err) {
      popupMarker.setPopupContent(
        '<div class="wind-popup"><div class="wind-popup-head" style="background:linear-gradient(135deg,#0891b2,#155e75);"><strong>' + lat.toFixed(5) + ', ' + lon.toFixed(5) + '</strong></div><div class="wind-popup-body"><span style="color:#e74c3c;font-size:12px;">Gagal memuat data</span></div></div>'
      );
    }
  }

  /* ── Public API ── */
  function registerAll() {
    LAYERS.forEach(function (cfg) {
      if (typeof GfsBase !== 'undefined') GfsBase.registerLayer(cfg.id, hideLayer);
    });
  }

  function activateLayer(toggleId, config) {
    hideAllMaritime();
    if (typeof GfsBase !== 'undefined') GfsBase.deactivateAll();
    var cb = document.getElementById(toggleId);
    if (cb) cb.checked = true;
    showLayer(config);
  }

  function deactivateLayer(toggleId) {
    hideLayer();
    var cb = document.getElementById(toggleId);
    if (cb) cb.checked = false;
  }

  window.isMaritimeAnyActive = isAnyActive;
  window.getMaritimeActiveConfig = getActiveConfig;
  window.showMaritimePopup = showPopup;

  registerAll();

  /* ── Checkbox Handlers ── */
  document.addEventListener('DOMContentLoaded', function () {
    LAYERS.forEach(function (cfg) {
      var checkbox = document.getElementById(cfg.toggleId);
      if (!checkbox) return;
      var info = document.getElementById(cfg.infoId);
      buildCandidates(cfg.model).then(function (candidates) {
        if (candidates.length && info) info.textContent = 'Model run: ' + formatInfo(candidates[0].modelRun, candidates[0].forecast);
      });
      checkbox.addEventListener('change', function () {
        if (this.checked) {
          activateLayer(cfg.toggleId, cfg);
        } else {
          deactivateLayer(cfg.toggleId);
        }
      });
    });
  });
})();
