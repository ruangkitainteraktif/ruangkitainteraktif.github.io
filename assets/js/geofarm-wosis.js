/* HWSD soil classes clipped to the selected Indonesian district. */
(function () {
  'use strict';

  var PROXY = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';
  var REQUEST_TIMEOUT_MS = 15000;
  var districts = null;
  var selected = null;
  var boundaryLayer = null;
  var generation = 0;

  function el(id) { return document.getElementById(id); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }
  function status(s) { var n = el('geofarm-wosis-status'); if (n) n.textContent = s || ''; }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  async function loadLegend() {
    var box = el('geofarm-wrb-legend');
    if (!box) return;
    try {
      var response = await fetch('assets/data/hwsd-indonesia/legend.json');
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var items = await response.json();
      var list = document.createElement('div');
      list.className = 'geofarm-wrb-legend-list';
      items.forEach(function (item) {
        var row = document.createElement('div');
        row.className = 'geofarm-wrb-legend-row';
        var swatch = document.createElement('i');
        swatch.style.backgroundColor = item.color;
        var label = document.createElement('span');
        label.textContent = item.label;
        row.append(swatch, label);
        list.appendChild(row);
      });
      box.appendChild(list);
      var source = document.createElement('small');
      source.textContent = 'Sumber: FAO HWSD v2.01 · resolusi sekitar 1 km';
      box.appendChild(source);
    } catch (error) { console.warn('[HWSD Kabupaten] Legenda gagal dimuat:', error); }
  }

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
      return JSON.parse(body);
    } finally { clearTimeout(timer); }
  }

  async function requestWithProxy(url) {
    try { return await request(url); }
    catch (_) { return request(PROXY + encodeURIComponent(url)); }
  }

  async function boundaryFor(district) {
    var variants = [district.kode, district.kode.replace('.', '')];
    for (var i = 0; i < variants.length; i++) {
      status('Memuat batas kabupaten dari BIG…' + (i ? ' Mencoba format kode alternatif.' : ''));
      var params = new URLSearchParams({ where: "KDPKAB='" + variants[i] + "'", f: 'geojson', outSR: '4326', outFields: '*', returnGeometry: 'true' });
      var url = 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_KABKOTA_AR/MapServer/0/query?' + params.toString();
      try {
        var data = await requestWithProxy(url);
        if (data && data.features && data.features.length) {
          var polygons = [];
          data.features.forEach(function (feature) {
            var geometry = feature.geometry;
            if (!geometry) return;
            if (geometry.type === 'Polygon') polygons.push(geometry.coordinates);
            else if (geometry.type === 'MultiPolygon') polygons = polygons.concat(geometry.coordinates);
          });
          if (polygons.length) return { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polygons } };
        }
      } catch (_) { /* try the alternate code and boundary source */ }
    }
    var fallback = await requestWithProxy('https://wilayah.smartartstudio.my.id/api/boundaries/' + encodeURIComponent(district.kode));
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

  async function load() {
    var run = ++generation;
    var district = selected;
    if (!district) { status('Pilih kabupaten/kota terlebih dahulu.'); return; }
    if (!window.L || !window.map) { status('Peta belum siap.'); return; }
    try {
      if (boundaryLayer && window.map.hasLayer(boundaryLayer)) window.map.removeLayer(boundaryLayer);
      boundaryLayer = null;
      status('Memuat batas ' + district.label + '…');
      var boundary = await boundaryFor(district);
      if (run !== generation) return;
      boundaryLayer = window.L.geoJSON(boundary, {
        style: { color: '#b45309', weight: 2.5, opacity: 0.95, fillColor: '#f59e0b', fillOpacity: 0.12 }
      }).addTo(window.map);
      var bounds = boundaryLayer.getBounds();
      if (bounds.isValid()) {
        if (window.SheetDrag && typeof window.SheetDrag.flyToBoundsInVisibleMap === 'function') window.SheetDrag.flyToBoundsInVisibleMap(bounds.pad(0.04), { maxZoom: 10, duration: 0.8 });
        else window.map.flyToBounds(bounds.pad(0.04), { maxZoom: 10, duration: 0.8 });
      }
      if (typeof window.toggleHwsdDistrictLayer !== 'function') throw new Error('Layer HWSD kabupaten belum tersedia.');
      await window.toggleHwsdDistrictLayer(boundary.geometry, true);
      if (typeof window.setLayerCatalogCheckboxState === 'function') window.setLayerCatalogCheckboxState('toggleHwsdIndonesia', true);
      el('geofarm-wrb-legend').hidden = false;
      status('Peta jenis tanah HWSD v2.01 ditampilkan untuk ' + district.label + '. Klik peta untuk melihat atribut satuan tanah.');
      el('geofarm-wosis-output').innerHTML = '<p class="geotani-sls-desc">Peta menunjukkan kelompok tanah HWSD v2.01 (resolusi sekitar 1 km) dan telah dipotong mengikuti batas kabupaten/kota. Klik peta untuk melihat atribut satuan tanah. Sumber: <a href="https://www.fao.org/land-water/resources/tools/databases/hwsd/en" target="_blank" rel="noopener noreferrer">FAO Harmonized World Soil Database</a>.</p>';
    } catch (error) { if (run === generation) status(error.message || 'Data WRB gagal dimuat.'); }
  }

  function reset() {
    generation++;
    if (typeof window.toggleHwsdDistrictLayer === 'function') window.toggleHwsdDistrictLayer(null, false);
    if (typeof window.setLayerCatalogCheckboxState === 'function') window.setLayerCatalogCheckboxState('toggleHwsdIndonesia', false);
    if (boundaryLayer && window.map && window.map.hasLayer(boundaryLayer)) window.map.removeLayer(boundaryLayer);
    boundaryLayer = null;
    el('geofarm-wrb-legend').hidden = true;
    el('geofarm-wosis-output').replaceChildren();
    status('');
  }

  function init() {
    var input = el('geofarmWosisDistrictSearch');
    var results = el('geofarmWosisDistrictResults');
    if (!input || !results) return;
    loadLegend();
    input.addEventListener('input', function () { selected = null; el('geofarmWosisDistrictSelected').hidden = true; showMatches(input.value); });
    input.addEventListener('focus', function () { showMatches(input.value); });
    input.addEventListener('blur', function () { setTimeout(function () { results.hidden = true; }, 120); });
    el('geofarm-wosis-load').addEventListener('click', load);
    el('geofarm-wosis-reset').addEventListener('click', reset);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
