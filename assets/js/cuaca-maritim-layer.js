/* ── Layer Cuaca Maritim (BMKG Maritim) ──
   Satu wrapper menggabungkan Cuaca Pelabuhan (marker) + Cuaca Perairan (polygon).
   Toggle tunggal: toggleCuacaMaritimLayer */
(function () {
  'use strict';

  var PEL_BASE = 'https://peta-maritim.bmkg.go.id/public_api/pelabuhan';
  var PEL_MANIFEST = PEL_BASE + '_list';
  var PER_BASE = 'https://peta-maritim.bmkg.go.id/public_api/perairan';
  var PER_MANIFEST = PER_BASE + '_list';
  var WILAYAH_GEOJSON = 'https://peta-maritim.bmkg.go.id/public_api/static/wilayah_perairan.json';

  var WAVE_COLOR = {
    'Tenang': '#2e7d32',
    'Rendah': '#66bb6a',
    'Sedang': '#fdd835',
    'Tinggi': '#fb8c00',
    'Sangat Tinggi': '#e53935',
    'Ekstrem': '#8e24aa'
  };
  var DEFAULT_COLOR = '#90a4ae';

  var group = null;
  var loaded = false, loading = false;
  var geojson = null, weatherByCode = null;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }
  function fmt(v) {
    if (v == null) return '';
    if (typeof v === 'number') return Number(v).toLocaleString('id-ID', { maximumFractionDigits: 2 });
    return String(v);
  }
  function field(label, val) {
    if (val == null || val === '') return '';
    return '<div class="agol-popup-field"><span class="agol-popup-field-label">' + esc(label) +
      '</span><span class="agol-popup-field-value">' + esc(val) + '</span></div>';
  }

  function fetchJson(url) {
    return fetch(url, { mode: 'cors' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function portIcon(color) {
    var html = '<div style="width:22px;height:22px;border-radius:50%;background:' + color +
      ';border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;">' +
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="5" r="2"/><line x1="12" y1="7" x2="12" y2="21"/><line x1="7" y1="12" x2="17" y2="12"/><path d="M5 12a7 7 0 0 0 14 0"/></svg></div>';
    return L.divIcon({ html: html, className: 'cuaca-port-divicon', iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -12] });
  }

  function loadPelabuhan(onProgress) {
    return fetchJson(PEL_MANIFEST).then(function (manifest) {
      var files = (manifest && manifest.files) ? manifest.files : [];
      var total = files.length, done = 0, results = [];
      return Promise.all(files.map(function (f) {
        return fetchJson(PEL_BASE + '/' + f.name).then(function (p) { results.push(p); }).catch(function (e) {
          console.warn('[Cuaca Maritim] pelabuhan gagal', f.name, e);
        }).then(function () { done++; if (onProgress) onProgress(done, total); });
      })).then(function () { return results; });
    });
  }

  function loadPerairanGeojson() {
    if (geojson) return Promise.resolve(geojson);
    return fetchJson(WILAYAH_GEOJSON).then(function (g) { geojson = g; return g; });
  }

  function loadPerairanWeather(onProgress) {
    return fetchJson(PER_MANIFEST).then(function (manifest) {
      var files = (manifest && manifest.files) ? manifest.files : [];
      var total = files.length, done = 0;
      weatherByCode = {};
      return Promise.all(files.map(function (f) {
        return fetchJson(PER_BASE + '/' + f.name).then(function (reg) {
          if (reg && reg.code && reg.data && reg.data[0]) weatherByCode[reg.code] = reg.data[0];
        }).catch(function (e) {
          console.warn('[Cuaca Maritim] perairan gagal', f.name, e);
        }).then(function () { done++; if (onProgress) onProgress(done, total); });
      }));
    });
  }

  function buildPelabuhanGroup(ports) {
    var g = L.layerGroup();
    ports.forEach(function (p) {
      if (!p || p.latitude == null || p.longitude == null) return;
      var d = (p.data && p.data[0]) || {};
      var color = WAVE_COLOR[d.wave_cat] || DEFAULT_COLOR;
      var m = L.marker([p.latitude, p.longitude], { icon: portIcon(color) });
      m.bindPopup(pelabuhanPopup(p), { maxWidth: 360, className: 'agol-leaflet-popup' });
      g.addLayer(m);
    });
    return g;
  }

  function buildPerairanGroup() {
    return L.geoJSON(geojson, {
      style: function (feature) {
        var code = feature.properties.WP_1;
        var w = weatherByCode && weatherByCode[code];
        var color = WAVE_COLOR[w && w.wave_cat] || DEFAULT_COLOR;
        return { color: '#1f78ff', weight: 1, opacity: 0.85, fillColor: color, fillOpacity: 0.35 };
      },
      onEachFeature: function (feature, layer) {
        layer.bindPopup(maritimPopupHtml(feature), { maxWidth: 360, className: 'agol-leaflet-popup' });
      }
    });
  }

  function pelabuhanPopup(p) {
    var d = (p.data && p.data.length) ? p.data[0] : {};
    var color = WAVE_COLOR[d.wave_cat] || DEFAULT_COLOR;
    var html = '<div class="agol-popup" style="min-width:250px">';
    html += '<div class="agol-popup-header agol-geo-kawasan">';
    html += '<div class="agol-popup-badge"><span class="agol-popup-badge-dot" style="background:' + color + ';"></span>Cuaca Pelabuhan</div>';
    html += '<div class="agol-popup-title">' + esc(p.name) + '</div>';
    html += '</div>';
    html += '<div class="agol-popup-body"><div class="agol-popup-fields">';
    if (d.weather) html += field('Cuaca', d.weather);
    if (d.weather_desc) html += field('Keterangan', d.weather_desc);
    if (d.wave_cat) html += field('Gelombang', d.wave_cat + (d.wave_desc ? ' (' + d.wave_desc + ')' : ''));
    if (d.wind_from) html += field('Angin', d.wind_from + ' → ' + d.wind_to + '  ' + fmt(d.wind_speed_min) + '–' + fmt(d.wind_speed_max) + ' knot');
    if (d.current_from) html += field('Arus', d.current_from + ' → ' + d.current_to + '  ' + fmt(d.current_speed_min) + '–' + fmt(d.current_speed_max) + ' cm/s');
    if (d.visibility) html += field('Jarak Pandang', fmt(d.visibility) + ' m');
    if (d.temp_min != null) html += field('Suhu', fmt(d.temp_min) + '–' + fmt(d.temp_max) + ' °C');
    if (d.rh_min != null) html += field('Kelembapan', fmt(d.rh_min) + '–' + fmt(d.rh_max) + ' %');
    if (d.low_tide != null) html += field('Surut Terendah', fmt(d.low_tide) + ' m (' + esc(d.low_tide_time) + ')');
    if (d.high_tide != null) html += field('Pasang Tertinggi', fmt(d.high_tide) + ' m (' + esc(d.high_tide_time) + ')');
    if (d.warning_desc && d.warning_desc !== 'NIL') html += field('Peringatan Dini', d.warning_desc);
    if (d.valid_from) html += field('Berlaku', esc(d.valid_from) + ' s.d. ' + esc(d.valid_to));
    html += '</div></div>';
    html += '<div class="agol-popup-footer"><span>Sumber: BMKG Maritim</span></div>';
    html += '</div>';
    return html;
  }

  function maritimPopupHtml(feature) {
    var code = feature.properties.WP_1;
    var w = weatherByCode && weatherByCode[code];
    var name = (w && w.name) || feature.properties.WP_IMM || feature.properties.WPIMM || code;
    var color = WAVE_COLOR[w && w.wave_cat] || DEFAULT_COLOR;
    var html = '<div class="agol-popup" style="min-width:250px">';
    html += '<div class="agol-popup-header agol-geo-kawasan">';
    html += '<div class="agol-popup-badge"><span class="agol-popup-badge-dot" style="background:' + color + ';"></span>Cuaca Perairan</div>';
    html += '<div class="agol-popup-title">' + esc(name) + '</div>';
    html += '</div>';
    html += '<div class="agol-popup-body"><div class="agol-popup-fields">';
    if (code) html += field('Kode Wilayah', code);
    if (feature.properties.WilPel) html += field('Stasiun', feature.properties.WilPel);
    if (w) {
      if (w.weather) html += field('Cuaca', w.weather);
      if (w.weather_desc) html += field('Keterangan', w.weather_desc);
      if (w.wave_cat) html += field('Gelombang', w.wave_cat + (w.wave_desc ? ' (' + w.wave_desc + ')' : ''));
      if (w.wind_from) html += field('Angin', w.wind_from + ' → ' + w.wind_to + '  ' + fmt(w.wind_speed_min) + '–' + fmt(w.wind_speed_max) + ' knot');
      if (w.warning_desc && w.warning_desc !== 'NIL') html += field('Peringatan Dini', w.warning_desc);
      if (w.valid_from) html += field('Berlaku', esc(w.valid_from) + ' s.d. ' + esc(w.valid_to));
    } else {
      html += field('Info', 'Data cuaca wilayah ini belum tersedia');
    }
    html += '</div></div>';
    html += '<div class="agol-popup-footer"><span>Sumber: BMKG Maritim</span></div>';
    html += '</div>';
    return html;
  }

  function setInfo(txt) {
    var el = document.getElementById('cuacaMaritimInfo');
    if (el) el.textContent = txt;
  }

  function enable() {
    if (group && !map.hasLayer(group)) { group.addTo(map); return; }
    if (loaded && group) { group.addTo(map); return; }
    if (loading) return;
    loading = true;
    setInfo('Memuat data cuaca maritim…');
    Promise.all([
      loadPelabuhan(function (d, t) { setInfo('Memuat pelabuhan… ' + d + '/' + t); }),
      loadPerairanGeojson().then(function () {
        return loadPerairanWeather(function (d, t) { setInfo('Memuat perairan… ' + d + '/' + t); });
      })
    ]).then(function (res) {
      var pelGroup = buildPelabuhanGroup(res[0]);
      var perGroup = buildPerairanGroup();
      group = L.layerGroup([perGroup, pelGroup]);
      group.addTo(map);
      loaded = true;
      loading = false;
      setInfo('Cuaca maritim: ' + res[0].length + ' pelabuhan, ' + Object.keys(weatherByCode).length + ' perairan — BMKG Maritim');
    }).catch(function (e) {
      loading = false;
      setInfo('Gagal memuat data cuaca maritim (BMKG).');
      console.error('[Cuaca Maritim]', e);
    });
  }

  function disable() {
    if (group && map.hasLayer(group)) map.removeLayer(group);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var cb = document.getElementById('toggleCuacaMaritimLayer');
    if (cb) cb.addEventListener('change', function () { if (this.checked) enable(); else disable(); });
  });

  window.cuacaMaritimCleanup = function () {
    disable();
    var cb = document.getElementById('toggleCuacaMaritimLayer');
    if (cb) cb.checked = false;
  };
})();
