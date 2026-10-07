/* WoSIS soil profile observations by Indonesian district. */
(function () {
  'use strict';

  var PROXY = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';
  var MAX_FEATURES = 5000;
  var REQUEST_TIMEOUT_MS = 15000;
  var districts = null;
  var selected = null;
  var layer = null;
  var boundaryLayer = null;
  var generation = 0;

  function el(id) { return document.getElementById(id); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }
  function status(s) { var n = el('geofarm-wosis-status'); if (n) n.textContent = s || ''; }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function districtList() {
    if (districts) return districts;
    var rows = window.KODE_WILAYAH_DATA || [];
    var names = Object.create(null);
    rows.forEach(function (x) { if (x && x.kode) names[String(x.kode)] = x.nama || x.kode; });
    districts = rows.filter(function (x) { return x && x.kode && String(x.kode).split('.').length === 2; }).map(function (x) {
      var parts = String(x.kode).split('.');
      var province = names[parts[0]] || '';
      return { kode: String(x.kode), nama: String(x.nama || x.kode), provinsi: province, label: String(x.nama || x.kode) + (province ? ', ' + province : '') };
    });
    return districts;
  }

  function setSelected(item) {
    selected = item;
    el('geofarmWosisDistrictSearch').value = item ? item.label : '';
    el('geofarmWosisDistrictResults').hidden = true;
    var picked = el('geofarmWosisDistrictSelected');
    picked.textContent = item ? '✓ ' + item.label + ' (' + item.kode + ')' : '';
    picked.hidden = !item;
    status('');
  }

  function showMatches(query) {
    var box = el('geofarmWosisDistrictResults');
    box.replaceChildren();
    var q = norm(query);
    if (q.length < 2) { box.hidden = true; return; }
    districtList().filter(function (d) { return norm(d.label + ' ' + d.kode).indexOf(q) >= 0; }).slice(0, 20).forEach(function (d) {
      var option = document.createElement('div');
      option.className = 'geotani-sls-result';
      option.textContent = d.label + ' (' + d.kode + ')';
      option.addEventListener('mousedown', function (event) { event.preventDefault(); setSelected(d); });
      box.appendChild(option);
    });
    box.hidden = !box.childNodes.length;
  }

  function boundsOf(feature) {
    var coords = feature && feature.geometry && feature.geometry.coordinates;
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    function walk(c) {
      if (!Array.isArray(c)) return;
      if (typeof c[0] === 'number' && typeof c[1] === 'number') {
        b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]);
        b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]);
      } else c.forEach(walk);
    }
    walk(coords);
    if (!isFinite(b[0])) throw new Error('Batas kabupaten tidak memiliki koordinat yang valid.');
    return b;
  }

  async function request(url) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT_MS);
    try {
      var response = await fetch(url, { signal: ctrl.signal });
      var body = await response.text();
      if (!response.ok) {
        var detail = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);
        throw new Error('HTTP ' + response.status + (detail ? ' — ' + detail : ''));
      }
      var data;
      try { data = JSON.parse(body); }
      catch (_) { throw new Error('Respons layanan bukan GeoJSON/JSON.'); }
      if (data && data.exceptions) throw new Error('ISRIC mengembalikan kesalahan WFS.');
      return data;
    } finally { clearTimeout(timer); }
  }

  async function requestWithProxy(url, label) {
    try {
      if (label) status(label + ' · menghubungi sumber…');
      return await request(url);
    }
    catch (error) {
      try {
        if (label) status(label + ' · mencoba jalur proxy…');
        return await request(PROXY + encodeURIComponent(url));
      }
      catch (proxyError) { throw proxyError || error; }
    }
  }

  async function boundaryFor(district) {
    var variants = [district.kode, district.kode.replace('.', '')];
    for (var i = 0; i < variants.length; i++) {
      status('Langkah 1/4 · Memuat batas kabupaten dari BIG…' + (i ? ' mencoba format kode alternatif.' : ''));
      var params = new URLSearchParams({ where: "KDPKAB='" + variants[i] + "'", f: 'geojson', outSR: '4326', outFields: '*', returnGeometry: 'true' });
      var url = 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_KABKOTA_AR/MapServer/0/query?' + params.toString();
      try {
        var data = await requestWithProxy(url, 'Langkah 1/4 · Memuat batas kabupaten dari BIG');
        if (data && data.features && data.features.length) {
          var polygons = [];
          data.features.forEach(function (feature) {
            var g = feature.geometry;
            if (!g) return;
            if (g.type === 'Polygon') polygons.push(g.coordinates);
            else if (g.type === 'MultiPolygon') polygons = polygons.concat(g.coordinates);
          });
          if (polygons.length) return { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polygons } };
        }
      } catch (_) { /* try boundary service fallback */ }
    }
    var fallback = await requestWithProxy('https://wilayah.smartartstudio.my.id/api/boundaries/' + encodeURIComponent(district.kode), 'Langkah 2/4 · Mencoba sumber batas alternatif');
    var rings = [];
    function collect(value) {
      if (!Array.isArray(value)) return;
      if (value.length >= 4 && Array.isArray(value[0]) && typeof value[0][0] === 'number') rings.push(value.map(function (p) { return [Number(p[1]), Number(p[0])]; }));
      else value.forEach(collect);
    }
    collect(fallback.path);
    if (!rings.length) throw new Error('Batas ' + district.label + ' tidak ditemukan.');
    return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: rings } };
  }

  function wfsUrl(bounds) {
    var p = new URLSearchParams({ map: '/map/wosis_latest.map', service: 'WFS', version: '1.1.0', request: 'GetFeature', typeName: 'wosis_latest_phaq', outputFormat: 'geojson', srsName: 'CRS:84', bbox: bounds.join(',') + ',CRS:84', maxFeatures: String(MAX_FEATURES) });
    return 'https://maps.isric.org/mapserv?' + p.toString();
  }

  function featureName(props) {
    var keys = Object.keys(props || {});
    function get(names) {
      var key = keys.find(function (k) { return names.indexOf(k.toLowerCase()) >= 0; });
      return key ? props[key] : '';
    }
    return { id: get(['profile_id', 'id', 'site_id']), ph: get(['phaq', 'value', 'result_value']), date: get(['date', 'sampling_date', 'profile_date']), name: get(['site_name', 'profile_name', 'name']) };
  }

  async function load() {
    var run = ++generation;
    var district = selected;
    if (!district) { status('Pilih kabupaten/kota terlebih dahulu.'); return; }
    if (!window.L || !window.map) { status('Peta belum siap.'); return; }
    try {
      if (layer && window.map.hasLayer(layer)) window.map.removeLayer(layer);
      if (boundaryLayer && window.map.hasLayer(boundaryLayer)) window.map.removeLayer(boundaryLayer);
      layer = null;
      boundaryLayer = null;
      status('Memuat batas ' + district.label + '…');
      var boundary = await boundaryFor(district);
      if (run !== generation) return;
      status('Langkah 2/4 · Menggambar batas dan mengarahkan peta ke ' + district.nama + '…');
      if (boundaryLayer && window.map.hasLayer(boundaryLayer)) window.map.removeLayer(boundaryLayer);
      boundaryLayer = window.L.geoJSON(boundary, { style: { color: '#b45309', weight: 2.5, opacity: 0.95, fillColor: '#f59e0b', fillOpacity: 0.12 } }).addTo(window.map);
      var districtBounds = boundaryLayer.getBounds();
      if (districtBounds.isValid()) {
        if (window.SheetDrag && typeof window.SheetDrag.flyToBoundsInVisibleMap === 'function') window.SheetDrag.flyToBoundsInVisibleMap(districtBounds.pad(0.04), { maxZoom: 10, duration: 0.8 });
        else window.map.flyToBounds(districtBounds.pad(0.04), { maxZoom: 10, duration: 0.8 });
      }
      status('Langkah 3/4 · Batas tampil; meminta titik pH WoSIS…');
      var bbox = boundsOf(boundary);
      status('Langkah 3/4 · Mengambil data WoSIS…');
      var data = await requestWithProxy(wfsUrl(bbox), 'Langkah 3/4 · Mengambil data WoSIS');
      if (run !== generation) return;
      var collected = data.features || [];
      var capped = collected.length >= MAX_FEATURES;
      status('Langkah 4/4 · Memilah titik yang berada di dalam kabupaten…');
      var points = collected.filter(function (f) {
        return f.geometry && f.geometry.type === 'Point' && window.turf.booleanPointInPolygon(f, boundary);
      });
      if (!points.length) throw new Error('Tidak ada titik pH WoSIS yang tercatat di ' + district.nama + '.');
      status('Langkah 4/4 · Menampilkan ' + points.length + ' titik pada peta…');
      var group = window.L.geoJSON({ type: 'FeatureCollection', features: points }, {
        pointToLayer: function (feature, latlng) { return window.L.circleMarker(latlng, { radius: 6, color: '#fff', weight: 1.5, fillColor: '#8b5cf6', fillOpacity: 0.9 }); },
        onEachFeature: function (feature, marker) {
          var props = feature.properties || {};
          var v = featureName(props);
          var rows = Object.keys(props).slice(0, 12).map(function (key) {
            var value = props[key];
            if (value == null || value === '') return '';
            return '<br>' + escapeHtml(key) + ': ' + escapeHtml(value);
          }).join('');
          marker.bindPopup('<b>WoSIS · pH air</b><br>ID: ' + escapeHtml(v.id || '—') + '<br>pH (H₂O): ' + escapeHtml(v.ph || 'lihat atribut') + rows);
        }
      });
      if (layer && window.map.hasLayer(layer)) window.map.removeLayer(layer);
      layer = group.addTo(window.map);
      var msg = points.length + ' titik profil dengan data pH air ditemukan di ' + district.label + '.';
      if (capped) msg += ' Tampilan dibatasi hingga ' + MAX_FEATURES + ' rekaman.';
      status(msg);
      el('geofarm-wosis-output').innerHTML = '<p class="geotani-sls-desc">Klik titik untuk melihat atribut profil. Sumber: <a href="https://maps.isric.org/mapserv/wosis_latest" target="_blank" rel="noopener noreferrer">WoSIS latest WFS (ISRIC)</a>. Layer pH air; nilai tidak tersedia untuk semua profil.</p>';
    } catch (error) { if (run === generation) status(error.message || 'Data WoSIS gagal dimuat.'); }
  }

  function reset() {
    generation++;
    if (layer && window.map && window.map.hasLayer(layer)) window.map.removeLayer(layer);
    if (boundaryLayer && window.map && window.map.hasLayer(boundaryLayer)) window.map.removeLayer(boundaryLayer);
    layer = null;
    boundaryLayer = null;
    el('geofarm-wosis-output').replaceChildren();
    status('');
  }

  function init() {
    var input = el('geofarmWosisDistrictSearch');
    var results = el('geofarmWosisDistrictResults');
    if (!input || !results) return;
    input.addEventListener('input', function () { selected = null; el('geofarmWosisDistrictSelected').hidden = true; showMatches(input.value); });
    input.addEventListener('focus', function () { showMatches(input.value); });
    input.addEventListener('blur', function () { setTimeout(function () { results.hidden = true; }, 120); });
    el('geofarm-wosis-load').addEventListener('click', load);
    el('geofarm-wosis-reset').addEventListener('click', reset);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
