(function () {
  'use strict';
  const layerFields = document.getElementById('gpLayerFields');
  if (!layerFields) return;
  const toolCard = document.querySelector('.gp-tools-card');
  const toolBody = document.querySelector('.dm-sidebar-body');
  if (toolCard) {
    const title = toolCard.querySelector('summary');
    if (title && title.firstChild) title.firstChild.textContent = 'GEOPROCESSING ';
    toolCard.style.margin = '0 0 12px';
    if (toolBody) toolBody.prepend(toolCard);
  }
  const esc = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const getLayers = () => typeof window.getAlatGeoJSONLayers === 'function'
    ? window.getAlatGeoJSONLayers().filter(layer => ['Layer proyek', 'ArcGIS Feature Layer', 'GeoJSON', 'Esri JSON', 'SHP', 'SHP (ZIP)', 'Geoprocessing Draw'].includes(layer.type))
    : [];
  let selectedBoundary = null;
  let boundaryRequest = 0;
  let latestOutput = null;
  let latestOutputLayer = null;
  let latestOutputVisible = true;
  const status = (message, error) => {
    const el = document.getElementById('gpStatus');
    if (el) { el.textContent = message; el.style.color = error ? '#b91c1c' : '#475569'; }
  };
  function select(id, label, polygonOnly) {
    const candidates = getLayers().filter(layer => !polygonOnly || layer.geojson.features.some(f => f.geometry && /Polygon/.test(f.geometry.type)));
    return `<label class="geotani-form-label" for="${id}">${label}</label><select class="geotani-form-input" id="${id}"><option value="">Pilih layer…</option>${candidates.map(layer => `<option value="${layer.id}">${esc(layer.name)} (${layer.geojson.features.length} fitur)</option>`).join('')}</select>`;
  }
  window.updateGeoprocessingForm = function () {
    const op = document.getElementById('gpOperation').value;
    let html = '';
    if (op === 'clip') html = select('gpInput', 'Layer yang dipotong', false)
      + '<label class="geotani-form-label" for="gpBoundaryMode">Sumber batas polygon</label><select class="geotani-form-input" id="gpBoundaryMode" onchange="changeGeoprocessingBoundaryMode()"><option value="admin">Batas administrasi (provinsi–desa)</option><option value="layer">Polygon dari layer, upload, atau hasil gambar</option></select>'
      + '<div id="gpAdminBoundaryTools"><label class="geotani-form-label" for="gpBoundaryLevel">Tingkat batas wilayah</label><select class="geotani-form-input" id="gpBoundaryLevel" onchange="changeGeoprocessingBoundaryLevel()"><option value="1">Provinsi</option><option value="2">Kabupaten/Kota</option><option value="3">Kecamatan</option><option value="4">Desa/Kelurahan</option></select>'
      + '<label class="geotani-form-label" for="gpBoundaryQuery">Cari batas wilayah</label><input class="geotani-form-input" id="gpBoundaryQuery" type="search" placeholder="Ketik kode atau nama wilayah"><button class="geotools-btn gp-action-btn" type="button" onclick="searchGeoprocessingBoundaries()" style="margin-top:6px;">Cari wilayah</button><select class="geotani-form-input" id="gpBoundaryResults" size="4" style="margin-top:6px;"><option value="">Ketik nama/kode lalu cari</option></select><button class="geotools-btn gp-action-btn" type="button" onclick="loadGeoprocessingBoundary()" style="margin-top:6px;">Gunakan batas ini</button><div id="gpBoundaryStatus" role="status" aria-live="polite" style="font-size:10px;margin-top:5px;color:#64748b;"></div></div>'
      + '<div id="gpLayerBoundaryTools" hidden>' + select('gpClipBoundaryLayer', 'Layer polygon batas', true) + '<button class="geotools-btn gp-action-btn" type="button" onclick="useGeoprocessingLayerBoundary()" style="margin-top:6px;">Gunakan polygon layer</button><div id="gpLayerBoundaryStatus" role="status" aria-live="polite" style="font-size:10px;margin-top:5px;color:#64748b;"></div></div>';
    if (op === 'buffer') html = select('gpInput', 'Layer sumber', false) + '<label class="geotani-form-label" for="gpDistance">Jarak buffer (meter)</label><input class="geotani-form-input" id="gpDistance" type="number" min="0.1" step="any" value="500">';
    if (op === 'intersect' || op === 'union') html = select('gpInput', 'Layer pertama (poligon)', true) + select('gpOverlay', 'Layer kedua (poligon)', true);
    if (op === 'merge') html = '<p style="font-size:11px;color:#64748b">Pilih dua atau lebih layer bergeometri sejenis.</p><div id="gpMergeLayers"></div>';
    if (op === 'dissolve') html = select('gpInput', 'Layer poligon', true) + '<label class="geotani-form-label" for="gpField">Kelompok atribut</label><select class="geotani-form-input" id="gpField"><option value="">Gabungkan semua fitur</option></select>';
    layerFields.innerHTML = html;
    if (op === 'merge') {
      const box = document.getElementById('gpMergeLayers');
      box.innerHTML = getLayers().map(layer => `<label style="display:flex;gap:8px;align-items:center;padding:5px;font-size:12px"><input type="checkbox" value="${layer.id}"> ${esc(layer.name)} (${layer.geojson.features.length})</label>`).join('') || '<small>Belum ada layer GeoJSON. Muat layer terlebih dahulu.</small>';
    }
    const input = document.getElementById('gpInput'), field = document.getElementById('gpField');
    if (input && field) input.addEventListener('change', () => {
      const layer = getLayers().find(item => String(item.id) === input.value);
      const keys = layer && layer.geojson.features.find(f => f.properties)?.properties ? Object.keys(layer.geojson.features.find(f => f.properties).properties) : [];
      field.innerHTML = '<option value="">Gabungkan semua fitur</option>' + keys.map(key => `<option value="${esc(key)}">${esc(key)}</option>`).join('');
    });
    if (op === 'clip') {
      if (document.getElementById('gpBoundaryMode')?.value === 'admin') window.searchGeoprocessingBoundaries();
      document.getElementById('gpBoundaryQuery')?.addEventListener('input', window.searchGeoprocessingBoundaries);
    }
    status(getLayers().length ? `${getLayers().length} layer tersedia.` : 'Muat terlebih dahulu layer GeoJSON/SHP melalui tab Muat Data.', false);
  };
  window.changeGeoprocessingBoundaryMode = function () {
    boundaryRequest++;
    selectedBoundary = null;
    const adminMode = document.getElementById('gpBoundaryMode')?.value !== 'layer';
    const admin = document.getElementById('gpAdminBoundaryTools');
    const layer = document.getElementById('gpLayerBoundaryTools');
    if (admin) admin.hidden = !adminMode;
    if (layer) layer.hidden = adminMode;
    if (adminMode) window.searchGeoprocessingBoundaries();
    const info = document.getElementById('gpLayerBoundaryStatus');
    if (info) info.textContent = '';
  };
  window.useGeoprocessingLayerBoundary = function () {
    const id = document.getElementById('gpClipBoundaryLayer')?.value;
    const layer = getLayers().find(item => String(item.id) === id);
    const features = layer ? polygonFeatures(layer) : [];
    const info = document.getElementById('gpLayerBoundaryStatus');
    if (!features.length) {
      selectedBoundary = null;
      if (info) info.textContent = 'Pilih layer yang memiliki geometri polygon.';
      return;
    }
    selectedBoundary = unionFeatures(features);
    if (info) info.textContent = 'Batas siap: ' + layer.name + ' (' + features.length + ' polygon).';
  };
  window.changeGeoprocessingBoundaryLevel = function () {
    boundaryRequest++;
    selectedBoundary = null;
    const info = document.getElementById('gpBoundaryStatus');
    if (info) info.textContent = 'Tingkat wilayah berubah. Muat batas yang baru.';
    window.searchGeoprocessingBoundaries();
  };
  const boundaryEndpoints = {
    1: { url: 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_PROVINSI_AR/MapServer/0/query', field: 'KDPPUM' },
    2: { url: 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_KABKOTA_AR/MapServer/0/query', field: 'KDPKAB' },
    3: { url: 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_KECAMATAN_AR/MapServer/0/query', field: 'KDCPUM' },
    4: { url: 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_DESAKEL_AR/MapServer/0/query', field: 'KDEPUM' }
  };
  window.searchGeoprocessingBoundaries = function () {
    const level = Number(document.getElementById('gpBoundaryLevel')?.value || 1);
    const query = String(document.getElementById('gpBoundaryQuery')?.value || '').trim().toLocaleLowerCase('id');
    const result = document.getElementById('gpBoundaryResults');
    const rows = window.KODE_WILAYAH_DATA || [];
    if (!result) return;
    const matches = rows.filter(row => String(row.kode || '').split('.').length === level && (!query || String(row.kode + ' ' + row.nama).toLocaleLowerCase('id').includes(query))).slice(0, 100);
    result.innerHTML = matches.length ? matches.map(row => `<option value="${esc(row.kode)}">${esc(row.nama)} · ${esc(row.kode)}</option>`).join('') : '<option value="">Tidak ada wilayah cocok</option>';
    const info = document.getElementById('gpBoundaryStatus');
    if (info) info.textContent = matches.length ? `${matches.length} hasil ditampilkan; persempit pencarian bila wilayah belum ditemukan.` : 'Tidak ada hasil. Coba kode atau nama lain.';
  };
  window.loadGeoprocessingBoundary = async function () {
    const request = ++boundaryRequest;
    const level = Number(document.getElementById('gpBoundaryLevel')?.value || 1);
    const code = document.getElementById('gpBoundaryResults')?.value;
    const info = document.getElementById('gpBoundaryStatus');
    try {
      if (!code) throw new Error('Pilih satu wilayah dari hasil pencarian.');
      if (info) info.textContent = 'Memuat geometri batas BIG…';
      const config = boundaryEndpoints[level];
      const url = config.url + '?' + new URLSearchParams({ where: config.field + "='" + code + "'", outFields: '*', returnGeometry: 'true', outSR: '4326', f: 'geojson', geometryPrecision: '6' });
      const response = await fetch(url);
      if (!response.ok) throw new Error('Layanan BIG mengembalikan HTTP ' + response.status + '.');
      const data = await response.json();
      if (request !== boundaryRequest) return;
      const feature = data.features && data.features.find(item => item.geometry && /Polygon/.test(item.geometry.type));
      if (!feature) throw new Error('Geometri poligon untuk wilayah ini tidak ditemukan.');
      const admin = (window.KODE_WILAYAH_DATA || []).find(item => String(item.kode) === String(code));
      feature.properties = { ...(feature.properties || {}), kode_wilayah: code, nama_wilayah: admin ? admin.nama : code, tingkat_wilayah: level };
      selectedBoundary = feature;
      if (info) info.textContent = 'Batas siap: ' + (admin ? admin.nama : code) + ' (' + ['','Provinsi','Kabupaten/Kota','Kecamatan','Desa/Kelurahan'][level] + ').';
    } catch (error) {
      if (request !== boundaryRequest) return;
      selectedBoundary = null;
      if (info) info.textContent = error.message || 'Batas wilayah gagal dimuat.';
    }
  };
  window.resetGeoprocessingBoundary = function () {
    boundaryRequest++;
    selectedBoundary = null;
    const query = document.getElementById('gpBoundaryQuery');
    const results = document.getElementById('gpBoundaryResults');
    const info = document.getElementById('gpBoundaryStatus');
    const layerInfo = document.getElementById('gpLayerBoundaryStatus');
    const boundaryLayer = document.getElementById('gpClipBoundaryLayer');
    if (query) query.value = '';
    if (results) results.innerHTML = '<option value="">Ketik nama/kode lalu cari</option>';
    if (info) info.textContent = 'Polygon batas direset. Cari dan muat batas baru untuk Clip.';
    if (layerInfo) layerInfo.textContent = 'Polygon batas direset.';
    if (boundaryLayer) boundaryLayer.value = '';
  };
  const importStatus = (message, error) => {
    const el = document.getElementById('gpImportStatus');
    if (el) { el.textContent = message; el.style.color = error ? '#b91c1c' : '#475569'; }
  };
  function registerImportedLayer(name, type, geojson) {
    if (!geojson || !Array.isArray(geojson.features) || !geojson.features.length) throw new Error('File tidak memiliki fitur GeoJSON.');
    const item = window.addAlatGeoJSONLayer(name, type, geojson);
    importStatus(`${name} dimuat (${geojson.features.length} fitur). Layer siap dipilih pada operasi.`, false);
    window.refreshGeoprocessingLayerChoices();
    return item;
  }
  window.importGeoprocessingGeoJSON = async function (files) {
    try {
      const file = files && files[0];
      if (!file) return;
      const parsed = JSON.parse(await file.text());
      const geojson = parsed && parsed.type === 'FeatureCollection' ? parsed
        : parsed && parsed.type === 'Feature' ? { type: 'FeatureCollection', features: [parsed] }
        : null;
      if (!geojson) throw new Error('Gunakan GeoJSON Feature atau FeatureCollection.');
      registerImportedLayer(file.name.replace(/\.(geojson|json)$/i, ''), 'GeoJSON', geojson);
    } catch (error) { importStatus(error.message || 'GeoJSON gagal dimuat.', true); }
    finally { const input = document.getElementById('gpGeoJSONInput'); if (input) input.value = ''; }
  };
  window.importGeoprocessingSHP = async function (files) {
    try {
      const selected = Array.from(files || []);
      if (!selected.length) return;
      const zipFile = selected.find(file => /\.zip$/i.test(file.name));
      let geojson, name, type;
      if (zipFile) {
        if (typeof window.shp !== 'function') throw new Error('Pustaka pembaca SHP belum tersedia.');
        const parsed = await window.shp(await zipFile.arrayBuffer());
        geojson = Array.isArray(parsed) ? parsed[0] : parsed;
        name = zipFile.name.replace(/\.zip$/i, ''); type = 'SHP (ZIP)';
      } else {
        const shpFile = selected.find(file => /\.shp$/i.test(file.name));
        if (!shpFile) throw new Error('Pilih file .zip atau file .shp beserta .dbf (dan .prj jika ada).');
        const base = shpFile.name.replace(/\.shp$/i, '').toLowerCase();
        const dbfFile = selected.find(file => file.name.replace(/\.[^.]+$/, '').toLowerCase() === base && /\.dbf$/i.test(file.name));
        const prjFile = selected.find(file => file.name.replace(/\.[^.]+$/, '').toLowerCase() === base && /\.prj$/i.test(file.name));
        if (!dbfFile) throw new Error('File .dbf pendamping tidak ditemukan.');
        if (!window.shp || !window.shp.parseShp) throw new Error('Pustaka pembaca SHP belum tersedia.');
        const [shapeBuffer, dbfBuffer, prjText] = await Promise.all([
          shpFile.arrayBuffer(), dbfFile.arrayBuffer(), prjFile ? prjFile.text() : Promise.resolve(undefined)
        ]);
        const [geometries, properties] = await Promise.all([
          window.shp.parseShp(shapeBuffer, prjText), window.shp.parseDbf(dbfBuffer)
        ]);
        geojson = window.shp.combine([geometries, properties]);
        name = shpFile.name.replace(/\.shp$/i, ''); type = 'SHP';
      }
      registerImportedLayer(name, type, geojson);
    } catch (error) { importStatus(error.message || 'SHP gagal dimuat.', true); }
    finally { const input = document.getElementById('gpShpInput'); if (input) input.value = ''; }
  };
  let captureNextDrawPolygon = false;
  window.startGeoprocessingPolygonDraw = function () {
    if (typeof window.startDraw !== 'function') { importStatus('Alat gambar polygon belum tersedia.', true); return; }
    captureNextDrawPolygon = true;
    importStatus('Gambar polygon pada peta. Selesaikan polygon dengan klik titik awal.', false);
    window.startDraw('polygon');
  };
  if (window.map && typeof window.map.on === 'function' && window.L && window.L.Draw) {
    window.map.on(window.L.Draw.Event.CREATED, event => {
      if (!captureNextDrawPolygon) return;
      captureNextDrawPolygon = false;
      if (!(event.layer instanceof window.L.Polygon) || event.layer instanceof window.L.Rectangle) {
        importStatus('Bentuk yang digambar bukan polygon. Pilih Gambar polygon untuk mencoba lagi.', true);
        return;
      }
      try {
        const geojson = event.layer.toGeoJSON();
        registerImportedLayer('Polygon_Geoprocessing', 'Geoprocessing Draw', { type: 'FeatureCollection', features: [geojson] });
        status('Polygon hasil gambar siap dipilih sebagai layer sumber atau batas Clip.', false);
      } catch (error) { importStatus(error.message || 'Polygon gagal disimpan.', true); }
    });
    window.map.on('draw:drawstop', () => {
      if (!captureNextDrawPolygon) return;
      captureNextDrawPolygon = false;
      importStatus('Gambar polygon dibatalkan.', false);
    });
  }
  const featureCollection = features => turf.featureCollection(features.filter(Boolean));
  const polygonFeatures = layer => layer.geojson.features.filter(f => f.geometry && /Polygon/.test(f.geometry.type));
  function clipLine(line, polygon) {
    const segments = line.geometry.type === 'LineString' ? [line.geometry.coordinates] : line.geometry.coordinates;
    const kept = [];
    const boundary = turf.polygonToLine(polygon);
    segments.forEach(coords => {
      for (let i = 0; i < coords.length - 1; i++) {
        const segment = turf.lineString([coords[i], coords[i + 1]], line.properties || {});
        let pieces;
        try { pieces = turf.lineSplit(segment, boundary).features; } catch (_) { pieces = [segment]; }
        pieces.forEach(piece => {
          const coords = piece.geometry.coordinates;
          const mid = turf.midpoint(turf.point(coords[0]), turf.point(coords[coords.length - 1]));
          if (turf.booleanPointInPolygon(mid, polygon)) kept.push(coords);
        });
      }
    });
    return kept.length ? turf.multiLineString(kept, line.properties || {}) : null;
  }
  function intersectPolygon(a, b) {
    try { return turf.intersect(featureCollection([a, b])); } catch (_) { return null; }
  }
  function renderOutputActions() {
    const host = document.getElementById('gpResultActions');
    if (!host || !latestOutput || !latestOutputLayer) return;
    host.replaceChildren();
    const visibility = document.createElement('button');
    visibility.type = 'button';
    visibility.className = 'geotools-btn gp-action-btn';
    visibility.setAttribute('aria-label', latestOutputVisible ? 'Sembunyikan layer hasil' : 'Tampilkan layer hasil');
    visibility.title = latestOutputVisible ? 'Sembunyikan layer hasil' : 'Tampilkan layer hasil';
    visibility.innerHTML = latestOutputVisible
      ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg> Sembunyikan layer'
      : '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A10.8 10.8 0 0112 5c6.4 0 10 7 10 7a16 16 0 01-3.1 3.8M6.2 6.2C3.5 8.1 2 12 2 12s3.6 7 10 7c1.1 0 2.1-.2 3-.6"/></svg> Tampilkan layer';
    visibility.addEventListener('click', () => {
      latestOutputVisible = !latestOutputVisible;
      if (latestOutputVisible) latestOutputLayer.layer.addTo(map);
      else map.removeLayer(latestOutputLayer.layer);
      renderOutputActions();
    });
    const download = document.createElement('button');
    download.type = 'button';
    download.className = 'geotools-btn gp-action-btn';
    download.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg> Unduh GeoJSON';
    download.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(latestOutput)], { type: 'application/geo+json' });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url;
      link.download = `${latestOutputLayer.name.replace(/[^a-z0-9_-]+/gi, '_')}.geojson`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    host.append(visibility, download);
  }
  function unionFeatures(features) {
    const parts = [];
    features.forEach(feature => {
      let current = feature, changed = true;
      while (changed) {
        changed = false;
        for (let i = 0; i < parts.length; i++) {
          if (!turf.booleanIntersects(parts[i], current)) continue;
          current = turf.union(featureCollection([parts[i], current])) || current;
          parts.splice(i, 1);
          changed = true;
          break;
        }
      }
      parts.push(current);
    });
    return parts;
  }
  function run() {
    try {
      if (!window.turf) throw new Error('Pustaka Turf.js belum tersedia.');
      const layers = getLayers(), op = document.getElementById('gpOperation').value;
      const get = id => layers.find(layer => String(layer.id) === document.getElementById(id)?.value);
      let result = [], name = '', type = 'GeoJSON';
      if (op === 'clip') {
        const input = get('gpInput');
        if (!input || !selectedBoundary) throw new Error('Pilih layer sumber dan muat batas wilayah terlebih dahulu.');
        const masks = Array.isArray(selectedBoundary) ? selectedBoundary : [selectedBoundary];
        if (!masks.length) throw new Error('Layer batas tidak memiliki poligon.');
        input.geojson.features.forEach(feature => {
          if (!feature.geometry) return;
          if (/Polygon/.test(feature.geometry.type)) {
            masks.forEach(mask => {
              const clipped = intersectPolygon(feature, mask);
              if (clipped) result.push({ ...clipped, properties: { ...(feature.properties || {}) } });
            });
          } else if (/Point/.test(feature.geometry.type)) {
            if (masks.some(mask => turf.booleanPointInPolygon(feature, mask))) result.push(feature);
          } else if (/Line/.test(feature.geometry.type)) {
            const lineResults = masks.map(mask => clipLine(feature, mask)).filter(Boolean);
            result.push(...lineResults);
          }
        });
        name = `${input.name}_clip`;
      } else if (op === 'buffer') {
        const input = get('gpInput'), distance = Number(document.getElementById('gpDistance').value);
        if (!input || !Number.isFinite(distance) || distance <= 0) throw new Error('Pilih layer dan masukkan jarak buffer positif.');
        result = input.geojson.features.map(f => f.geometry ? turf.buffer(f, distance, { units: 'meters' }) : null).filter(Boolean);
        name = `${input.name}_buffer_${distance}m`;
      } else if (op === 'intersect') {
        const a = get('gpInput'), b = get('gpOverlay');
        if (!a || !b) throw new Error('Pilih kedua layer terlebih dahulu.');
        polygonFeatures(a).forEach(left => polygonFeatures(b).forEach(right => {
          const out = intersectPolygon(left, right);
          if (out) { out.properties = { ...(left.properties || {}), ...(right.properties || {}) }; result.push(out); }
        }));
        name = `${a.name}_${b.name}_intersect`;
      } else if (op === 'union') {
        const a = get('gpInput'), b = get('gpOverlay');
        if (!a || !b) throw new Error('Pilih kedua layer terlebih dahulu.');
        const all = [...polygonFeatures(a), ...polygonFeatures(b)];
        if (!all.length) throw new Error('Tidak ditemukan poligon.');
        result = unionFeatures(all).map(merged => ({ ...merged, properties: {} }));
        name = `${a.name}_${b.name}_union`;
      } else if (op === 'merge') {
        const ids = [...document.querySelectorAll('#gpMergeLayers input:checked')].map(input => input.value);
        const selected = layers.filter(layer => ids.includes(String(layer.id)));
        if (selected.length < 2) throw new Error('Pilih minimal dua layer.');
        const family = g => g && (/Point/.test(g.type) ? 'point' : /Line/.test(g.type) ? 'line' : /Polygon/.test(g.type) ? 'polygon' : 'other');
        const types = new Set(selected.flatMap(layer => layer.geojson.features.map(f => family(f.geometry))));
        if (types.size !== 1 || types.has('other')) throw new Error('Merge hanya bisa untuk tipe geometri yang sama.');
        result = selected.flatMap(layer => layer.geojson.features);
        name = selected.map(layer => layer.name).join('_') + '_merge';
      } else if (op === 'dissolve') {
        const input = get('gpInput');
        if (!input) throw new Error('Pilih layer poligon.');
        const key = document.getElementById('gpField').value;
        const groups = new Map();
        polygonFeatures(input).forEach(feature => {
          const value = key ? feature.properties?.[key] : 'Semua fitur';
          if (key && value == null) return;
          const groupKey = String(value ?? '');
          if (!groups.has(groupKey)) groups.set(groupKey, { value, features: [] });
          groups.get(groupKey).features.push(feature);
        });
        groups.forEach(group => unionFeatures(group.features).forEach(dissolved => {
          dissolved.properties = key ? { [key]: group.value } : {};
          result.push(dissolved);
        }));
        name = `${input.name}_dissolve`;
      }
      if (!result.length) throw new Error('Operasi tidak menghasilkan fitur. Periksa geometri dan cakupan layer.');
      const output = { type: 'FeatureCollection', features: result };
      if (typeof window.addAlatGeoJSONLayer !== 'function') throw new Error('Penyimpanan layer hasil tidak tersedia.');
      latestOutputLayer = window.addAlatGeoJSONLayer(name, type, output);
      latestOutput = output;
      latestOutputVisible = true;
      renderOutputActions();
      status(`Selesai: ${result.length} fitur ditambahkan sebagai layer “${name}”. Gunakan tombol mata untuk mengatur tampilannya atau unduh GeoJSON.`, false);
    } catch (error) { status(error.message || 'Geoprocessing gagal.', true); }
  }
  window.runGeoprocessing = run;
  window.refreshGeoprocessingLayerChoices = function () {
    const layers = getLayers();
    ['gpInput', 'gpOverlay', 'gpClipBoundaryLayer'].forEach(id => {
      const control = document.getElementById(id);
      if (!control) return;
      const previous = control.value;
      const polygonOnly = id === 'gpOverlay' || id === 'gpClipBoundaryLayer' || (id === 'gpInput' && ['intersect', 'union', 'dissolve'].includes(document.getElementById('gpOperation')?.value));
      const candidates = layers.filter(layer => !polygonOnly || layer.geojson.features.some(f => f.geometry && /Polygon/.test(f.geometry.type)));
      control.innerHTML = '<option value="">Pilih layer…</option>' + candidates.map(layer => `<option value="${esc(layer.id)}">${esc(layer.name)} (${layer.geojson.features.length} fitur)</option>`).join('');
      if (candidates.some(layer => String(layer.id) === previous)) control.value = previous;
    });
    const mergeBox = document.getElementById('gpMergeLayers');
    if (mergeBox) {
      const checked = new Set([...mergeBox.querySelectorAll('input:checked')].map(input => input.value));
      mergeBox.innerHTML = layers.map(layer => `<label style="display:flex;gap:8px;align-items:center;padding:5px;font-size:12px"><input type="checkbox" value="${esc(layer.id)}"${checked.has(String(layer.id)) ? ' checked' : ''}> ${esc(layer.name)} (${layer.geojson.features.length})</label>`).join('') || '<small>Belum ada layer vektor yang aktif di katalog layer.</small>';
    }
  };
  const card = document.querySelector('.gp-tools-card');
  if (card) card.addEventListener('toggle', () => { if (card.open) window.updateGeoprocessingForm(); });
  if (window.map && typeof window.map.on === 'function') {
    let refreshTimer;
    window.map.on('layeradd layerremove', () => {
      if (!card || !card.open) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(window.refreshGeoprocessingLayerChoices, 120);
    });
  }
  window.updateGeoprocessingForm();
})();
