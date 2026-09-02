/* ── Layer Cuaca Maritim (BMKG Maritim) ──
   Dua wrapper terpisah: Cuaca Pelabuhan (marker) + Cuaca Perairan (polygon).
   Toggle terpisah: toggleCuacaPerairanLayer, toggleCuacaPelabuhanLayer */
(function () {
  'use strict';

  var API_BASE = 'https://maritim.bmkg.go.id/marine2026-data/';
  var PELABUHAN_GEOJSON = API_BASE + 'meta/pelabuhan.json';
  var PERAIRAN_INDEX = API_BASE + 'meta/area_province.json';
  var WILAYAH_GEOJSON = API_BASE + 'meta/wilmetos.min.geojson';

  var WAVE_COLOR = {
    'Tenang': '#2e7d32',
    'Rendah': '#66bb6a',
    'Sedang': '#fdd835',
    'Tinggi': '#fb8c00',
    'Sangat Tinggi': '#e53935',
    'Ekstrem': '#8e24aa'
  };
  var DEFAULT_COLOR = '#90a4ae';

  var pelGroup = null, pelLoaded = false, pelLoading = false;
  var perGroup = null, perLoaded = false, perLoading = false;
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
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 10000);
    return fetch(url, { mode: 'cors', signal: controller.signal }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).catch(function (e) {
      clearTimeout(timer);
      throw e;
    });
  }

  function firstForecast(value, depth) {
    if (depth > 5 || value == null) return {};
    if (Array.isArray(value)) return firstForecast(value[0], depth + 1);
    if (typeof value !== 'object') return {};
    if (value.weather || value.weather_desc || value.wave_cat || value.wave_height || value.wind_speed) return value;
    var preferred = ['forecast_day1', 'forecast', 'data', 'items', 'weather'];
    for (var i = 0; i < preferred.length; i++) {
      if (value[preferred[i]]) {
        var result = firstForecast(value[preferred[i]], depth + 1);
        if (Object.keys(result).length) return result;
      }
    }
    var keys = Object.keys(value);
    for (var j = 0; j < keys.length; j++) {
      var nested = firstForecast(value[keys[j]], depth + 1);
      if (Object.keys(nested).length) return nested;
    }
    return {};
  }

  function normaliseForecast(payload) {
    var raw = firstForecast(payload, 0);
    return {
      weather: raw.weather || raw.weather_desc || raw.weather_text || '',
      weather_desc: raw.weather_desc || raw.description || '',
      wave_cat: raw.wave_cat || raw.wave_category || (raw.wave && raw.wave.category) || '',
      wave_desc: raw.wave_desc || raw.wave_height || (raw.wave && raw.wave.height) || '',
      wind_from: raw.wind_from || raw.wind_direction || (raw.wind && raw.wind.from) || '',
      wind_to: raw.wind_to || raw.wind_direction_to || (raw.wind && raw.wind.to) || '',
      wind_speed_min: raw.wind_speed_min || raw.wind_speed || (raw.wind && raw.wind.speed) || '',
      wind_speed_max: raw.wind_speed_max || raw.wind_speed || (raw.wind && raw.wind.speed) || '',
      current_from: raw.current_from || (raw.current && raw.current.from) || '',
      current_to: raw.current_to || (raw.current && raw.current.to) || '',
      current_speed_min: raw.current_speed_min || (raw.current && raw.current.speed) || '',
      current_speed_max: raw.current_speed_max || (raw.current && raw.current.speed) || '',
      visibility: raw.visibility || '', temp_min: raw.temp_min || raw.temperature || '', temp_max: raw.temp_max || raw.temperature || '',
      rh_min: raw.rh_min || raw.humidity || '', rh_max: raw.rh_max || raw.humidity || '',
      warning_desc: raw.warning_desc || raw.warning || '', valid_from: raw.valid_from || raw.datetime || raw.time || '', valid_to: raw.valid_to || ''
    };
  }

  function fetchAll(items, worker, onProgress) {
    var total = items.length, done = 0, cursor = 0, results = [];
    var workers = Math.min(12, total);
    function next() {
      var index = cursor++;
      if (index >= total) return Promise.resolve();
      return worker(items[index]).then(function (value) { if (value) results.push(value); }).catch(function (error) {
        console.warn('[Cuaca Maritim] data gagal dimuat', items[index], error);
      }).then(function () {
        done++;
        if (onProgress) onProgress(done, total);
        return next();
      });
    }
    return Promise.all(Array.from({ length: workers }, next)).then(function () { return results; });
  }

  function portIcon(color) {
    var html = '<div style="width:22px;height:22px;border-radius:50%;background:' + color +
      ';border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;">' +
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="5" r="2"/><line x1="12" y1="7" x2="12" y2="21"/><line x1="7" y1="12" x2="17" y2="12"/><path d="M5 12a7 7 0 0 0 14 0"/></svg></div>';
    return L.divIcon({ html: html, className: 'cuaca-port-divicon', iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -12] });
  }

  /* ── Pelabuhan ── */
  function loadPelabuhan(onProgress) {
    return fetchJson(PELABUHAN_GEOJSON).then(function (collection) {
      var ports = (collection && collection.features ? collection.features : []).map(function (feature) {
        var props = feature.properties || {}, coords = feature.geometry && feature.geometry.coordinates;
        return { code: props.code, name: props.name, longitude: coords && coords[0], latitude: coords && coords[1] };
      }).filter(function (port) { return port.code && Number.isFinite(port.latitude) && Number.isFinite(port.longitude); });
      return fetchAll(ports, function (port) {
        return fetchJson(API_BASE + 'pelabuhan/' + encodeURIComponent(port.code) + '.json').then(function (payload) {
          port.data = [normaliseForecast(payload)];
          return port;
        });
      }, onProgress);
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

  /* ── Perairan ── */
  function loadPerairanGeojson() {
    if (geojson) return Promise.resolve(geojson);
    return fetchJson(WILAYAH_GEOJSON).then(function (g) { geojson = g; return g; });
  }

  function loadPerairanWeather(onProgress) {
    return fetchJson(PERAIRAN_INDEX).then(function (manifest) {
      var areas = [];
      (manifest && manifest.data ? manifest.data : []).forEach(function (province) {
        (province.areas || []).forEach(function (area) { if (area.id) areas.push(area); });
      });
      weatherByCode = {};
      return fetchAll(areas, function (area) {
        return fetchJson(API_BASE + 'perairan/' + encodeURIComponent(area.id) + '.json').then(function (payload) {
          weatherByCode[area.id] = normaliseForecast(payload);
          weatherByCode[area.id].name = area.name;
          return area;
        });
      }, onProgress);
    });
  }

  function buildPerairanGroup() {
    return L.geoJSON(geojson, {
      style: function (feature) {
        var code = feature.properties.ID_MAR;
        var w = weatherByCode && weatherByCode[code];
        var color = WAVE_COLOR[w && w.wave_cat] || DEFAULT_COLOR;
        return { color: '#1f78ff', weight: 1, opacity: 0.85, fillColor: color, fillOpacity: 0.35 };
      },
      onEachFeature: function (feature, layer) {
        layer.bindPopup(maritimPopupHtml(feature), { maxWidth: 360, className: 'agol-leaflet-popup' });
      }
    });
  }

  function maritimPopupHtml(feature) {
    var code = feature.properties.ID_MAR;
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

  /* ── Info text ── */
  function setInfo(txt) {
    var el = document.getElementById('cuacaMaritimInfo');
    if (el) el.textContent = txt;
  }

  /* ── Enable / Disable Pelabuhan ── */
  function enablePelabuhan() {
    if (pelGroup && !map.hasLayer(pelGroup)) { pelGroup.addTo(map); return; }
    if (pelLoaded && pelGroup) { pelGroup.addTo(map); return; }
    if (pelLoading) return;
    pelLoading = true;
    setInfo('Memuat pelabuhan…');
    loadPelabuhan(function (d, t) { setInfo('Memuat pelabuhan… ' + d + '/' + t); }).then(function (ports) {
      pelGroup = buildPelabuhanGroup(ports);
      pelGroup.addTo(map);
      pelLoaded = true;
      pelLoading = false;
      setInfo('Cuaca pelabuhan: ' + ports.length + ' stasiun — BMKG Maritim');
    }).catch(function (e) {
      pelLoading = false;
      setInfo('Gagal memuat data cuaca pelabuhan.');
      console.error('[Cuaca Maritim] pelabuhan gagal:', e);
    });
  }

  function disablePelabuhan() {
    if (pelGroup && map.hasLayer(pelGroup)) map.removeLayer(pelGroup);
    pelLoading = false;
  }

  /* ── Enable / Disable Perairan ── */
  function enablePerairan() {
    if (perGroup && !map.hasLayer(perGroup)) { perGroup.addTo(map); return; }
    if (perLoaded && perGroup) { perGroup.addTo(map); return; }
    if (perLoading) return;
    perLoading = true;
    setInfo('Memuat perairan…');
    loadPerairanGeojson().then(function () {
      return loadPerairanWeather(function (d, t) { setInfo('Memuat perairan… ' + d + '/' + t); });
    }).then(function () {
      perGroup = buildPerairanGroup();
      perGroup.addTo(map);
      perLoaded = true;
      perLoading = false;
      setInfo('Cuaca perairan: ' + Object.keys(weatherByCode).length + ' wilayah — BMKG Maritim');
    }).catch(function (e) {
      perLoading = false;
      setInfo('Gagal memuat data cuaca perairan.');
      console.error('[Cuaca Maritim] perairan gagal:', e);
    });
  }

  function disablePerairan() {
    if (perGroup && map.hasLayer(perGroup)) map.removeLayer(perGroup);
    perLoading = false;
  }

  /* ── Event binding ── */
  document.addEventListener('DOMContentLoaded', function () {
    var cbPerairan = document.getElementById('toggleCuacaPerairanLayer');
    var cbPelabuhan = document.getElementById('toggleCuacaPelabuhanLayer');

    if (cbPerairan) {
      cbPerairan.addEventListener('change', function () {
        if (this.checked) enablePerairan(); else disablePerairan();
      });
    }
    if (cbPelabuhan) {
      cbPelabuhan.addEventListener('change', function () {
        if (this.checked) enablePelabuhan(); else disablePelabuhan();
      });
    }
  });

  /* ── Cleanup (called by reset layers) ── */
  window.cuacaMaritimCleanup = function () {
    disablePelabuhan();
    disablePerairan();
    pelGroup = null; pelLoaded = false;
    perGroup = null; perLoaded = false;
    var cb1 = document.getElementById('toggleCuacaPerairanLayer');
    var cb2 = document.getElementById('toggleCuacaPelabuhanLayer');
    if (cb1) cb1.checked = false;
    if (cb2) cb2.checked = false;
    setInfo('Cuaca pelabuhan & perairan — BMKG Maritim');
  };
})();
