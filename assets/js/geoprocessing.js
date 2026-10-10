(function () {
  'use strict';
  const layerFields = document.getElementById('gpLayerFields');
  if (!layerFields) return;
  const toolCard = document.querySelector('.gp-tools-card');
  const toolBody = document.querySelector('.dm-sidebar-body');
  if (toolCard) {
    /* Dua baris lama dihapus, dua-duanya sudah tidak berlaku sejak kartu ini
       memakai template .gt-card-head:
         - menulis 'GEOPROCESSING ' ke child pertama summary. Child pertama
           kini spasi sebelum .gt-card-icon, jadi teks itu akan muncul di
           luar ikon. Judulnya pun sengaja dibiarkan title case supaya sama
           dengan lima kartu sheet ini yang lain.
         - margin inline '0 0 12px', yang menimpa .dm-card. */
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
  const geoprocessingLayers = new Set();
  const geoprocessingSourceLayers = new Set();
  const status = (message, error) => {
    const el = document.getElementById('gpStatus');
    if (el) { el.textContent = message; el.style.color = error ? '#b91c1c' : '#475569'; }
  };
  function select(id, label, polygonOnly) {
    const candidates = getLayers().filter(layer => !polygonOnly || layer.geojson.features.some(f => f.geometry && /Polygon/.test(f.geometry.type)));
    return `<label class="geotani-form-label" for="${id}">${label}</label><select class="geotani-form-input" id="${id}"><option value="">Pilih layer…</option>${candidates.map(layer => `<option value="${layer.id}">${esc(layer.name)} (${layer.geojson.features.length} fitur)</option>`).join('')}</select>`;
  }
  function checklist(id, label, polygonOnly) {
    return `<label class="geotani-form-label">${label}</label><div class="gp-layer-checklist" id="${id}" data-polygon-only="${polygonOnly ? 'true' : 'false'}"></div>`;
  }
  function populateChecklist(id) {
    const box = document.getElementById(id);
    if (!box) return;
    const selected = new Set([...box.querySelectorAll('input:checked')].map(input => input.value));
    const polygonOnly = box.dataset.polygonOnly === 'true';
    const candidates = getLayers().filter(layer => !polygonOnly || layer.geojson.features.some(feature => feature.geometry && /Polygon/.test(feature.geometry.type)));
    box.innerHTML = candidates.map(layer => `<label><input type="checkbox" value="${esc(layer.id)}"${selected.has(String(layer.id)) ? ' checked' : ''}> <span>${esc(layer.name)} (${layer.geojson.features.length} fitur)</span></label>`).join('') || '<small>Belum ada layer yang sesuai.</small>';
  }
  const selectedLayers = id => [...document.querySelectorAll(`#${id} input:checked`)].map(input => getLayers().find(layer => String(layer.id) === input.value)).filter(Boolean);
  const outputField = (label, placeholder) => `<label class="geotani-form-label" for="gpOutputName">${label}</label><input class="geotani-form-input" id="gpOutputName" type="text" placeholder="${placeholder}" required>`;
  function requireOutputName() {
    const name = String(document.getElementById('gpOutputName')?.value || '').trim();
    if (!name) throw new Error('Isi nama output terlebih dahulu.');
    return name;
  }
  window.updateGeoprocessingForm = function () {
    const op = document.getElementById('gpOperation').value;
    let html = '';
    if (op === 'clip') html = select('gpInput', 'Input Features', false)
      + '<label class="geotani-form-label" for="gpBoundaryMode">Sumber Clip Features</label><select class="geotani-form-input" id="gpBoundaryMode" onchange="changeGeoprocessingBoundaryMode()"><option value="admin">Cari batas administrasi (provinsi–desa)</option><option value="layer">Pilih polygon dari layer</option></select>'
      + '<div id="gpAdminBoundaryTools"><label class="geotani-form-label" for="gpBoundaryLevel">Tingkat batas wilayah</label><select class="geotani-form-input" id="gpBoundaryLevel" onchange="changeGeoprocessingBoundaryLevel()"><option value="1">Provinsi</option><option value="2">Kabupaten/Kota</option><option value="3">Kecamatan</option><option value="4">Desa/Kelurahan</option></select>'
      + '<label class="geotani-form-label" for="gpBoundaryQuery">Cari batas wilayah</label><input class="geotani-form-input" id="gpBoundaryQuery" type="search" placeholder="Ketik kode atau nama wilayah"><button class="geotools-btn gp-action-btn" type="button" onclick="searchGeoprocessingBoundaries()" style="margin-top:6px;">Cari wilayah</button><select class="geotani-form-input" id="gpBoundaryResults" size="4" style="margin-top:6px;"><option value="">Ketik nama/kode lalu cari</option></select><button class="geotools-btn gp-action-btn" type="button" onclick="loadGeoprocessingBoundary()" style="margin-top:6px;">Gunakan batas ini</button><div id="gpBoundaryStatus" role="status" aria-live="polite" style="font-size:10px;margin-top:5px;color:#64748b;"></div></div>'
      + '<div id="gpLayerBoundaryTools" hidden>' + select('gpClipBoundaryLayer', 'Clip Features layer', true).replace('<select class="geotani-form-input" id="gpClipBoundaryLayer">', '<select class="geotani-form-input" id="gpClipBoundaryLayer" onchange="useGeoprocessingLayerBoundary()">') + '<div id="gpLayerBoundaryStatus" role="status" aria-live="polite" style="font-size:10px;margin-top:5px;color:#64748b;">Pilih layer polygon sebagai Clip Features.</div></div>'
      + outputField('Output Feature Class', 'Nama layer hasil');
    if (op === 'buffer') html = select('gpInput', 'Input Features', false)
      + outputField('Output Feature Class', 'Nama layer hasil')
      + '<label class="geotani-form-label" for="gpBufferDistanceMode">Distance [value or field]</label><select class="geotani-form-input" id="gpBufferDistanceMode"><option value="value">Value</option><option value="field">Field</option></select>'
      + '<div id="gpBufferDistanceValue" style="display:grid;grid-template-columns:1fr 112px;gap:6px;"><input class="geotani-form-input" id="gpDistance" type="number" min="0.1" step="any" value="500"><select class="geotani-form-input" id="gpDistanceUnit" aria-label="Satuan jarak"><option value="meters">Meters</option><option value="kilometers">Kilometers</option><option value="feet">Feet</option><option value="miles">Miles</option></select></div>'
      + '<div id="gpBufferDistanceField" hidden>' + select('gpDistanceField', 'Distance field', false) + '</div>'
      + '<label class="geotani-form-label" for="gpBufferDissolve">Dissolve Type</label><select class="geotani-form-input" id="gpBufferDissolve"><option value="none">None</option><option value="all">Dissolve all output features</option></select>';
    if (op === 'intersect') html = checklist('gpIntersectLayers', 'Input Features (pilih minimal dua)', true)
      + outputField('Output Feature Class', 'Nama layer hasil')
      + '<label class="geotani-form-label" for="gpIntersectAttributes">Attributes To Join</label><select class="geotani-form-input" id="gpIntersectAttributes"><option value="all">All attributes</option><option value="no-fid">All attributes except feature IDs</option><option value="fid">Only feature IDs</option></select>';
    if (op === 'union') html = checklist('gpUnionLayers', 'Input Features (polygon)', true)
      + outputField('Output Feature Class', 'Nama layer hasil')
      + '<label class="geotani-form-label" for="gpUnionAttributes">Attributes To Join</label><select class="geotani-form-input" id="gpUnionAttributes"><option value="all">All attributes</option><option value="no-fid">All attributes except feature IDs</option><option value="fid">Only feature IDs</option></select>';
    if (op === 'merge') html = checklist('gpMergeLayers', 'Input Datasets (pilih minimal dua)', false)
      + outputField('Output Dataset', 'Nama dataset hasil')
      + '<label class="geotani-form-label" for="gpMergeFieldMode">Field Matching Mode</label><select class="geotani-form-input" id="gpMergeFieldMode"><option value="all">Automatically generate fields consolidated from all inputs</option><option value="first">Use the schema of the first dataset only</option></select>'
      + '<label class="gp-merge-source-option"><input id="gpMergeSourceInfo" type="checkbox"> Add source information to output</label>';
    if (op === 'dissolve') html = select('gpInput', 'Input Features', true)
      + outputField('Output Feature Class', 'Nama layer hasil')
      + '<label class="geotani-form-label" for="gpFields">Dissolve Fields (opsional, pilih satu atau lebih)</label><select class="geotani-form-input" id="gpFields" multiple size="4"></select><small style="display:block;margin-top:4px;color:#64748b;font-size:10px;">Kosongkan untuk menggabungkan semua fitur.</small>';
    layerFields.innerHTML = html;
    ['gpIntersectLayers', 'gpUnionLayers', 'gpMergeLayers'].forEach(populateChecklist);
    const input = document.getElementById('gpInput'), field = document.getElementById('gpFields');
    if (input && field) input.addEventListener('change', () => {
      const layer = getLayers().find(item => String(item.id) === input.value);
      const keys = layer && layer.geojson.features.find(f => f.properties)?.properties ? Object.keys(layer.geojson.features.find(f => f.properties).properties) : [];
      field.innerHTML = keys.map(key => `<option value="${esc(key)}">${esc(key)}</option>`).join('');
    });
    if (op === 'buffer') {
      const mode = document.getElementById('gpBufferDistanceMode');
      const valueBox = document.getElementById('gpBufferDistanceValue');
      const fieldBox = document.getElementById('gpBufferDistanceField');
      const fieldSelect = document.getElementById('gpDistanceField');
      const updateDistanceMode = () => {
        const useField = mode.value === 'field';
        valueBox.hidden = useField;
        fieldBox.hidden = !useField;
      };
      mode.addEventListener('change', updateDistanceMode);
      const fillDistanceFields = () => {
        const layer = getLayers().find(item => String(item.id) === input?.value);
        const props = layer?.geojson.features.find(feature => feature.properties)?.properties || {};
        const numericFields = Object.keys(props).filter(key => layer.geojson.features.some(feature => {
          const value = feature.properties && feature.properties[key];
          return value !== '' && value != null && Number.isFinite(Number(value));
        }));
        fieldSelect.innerHTML = numericFields.map(key => `<option value="${esc(key)}">${esc(key)}</option>`).join('') || '<option value="">Tidak ada field numerik</option>';
      };
      input?.addEventListener('change', fillDistanceFields);
      updateDistanceMode();
      fillDistanceFields();
    }
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
      let data;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        let response;
        try { response = await fetch(url, { signal: controller.signal }); }
        finally { clearTimeout(timeout); }
        if (!response.ok) throw new Error('Layanan BIG mengembalikan HTTP ' + response.status + '.');
        data = await response.json();
        if (data.error) throw new Error(data.error.message || 'Layanan BIG gagal.');
      } catch (bigError) {
        if (level !== 4 || typeof window.fetchVillageBoundaryFallback !== 'function') throw bigError;
        data = await window.fetchVillageBoundaryFallback({ where: "KDEPUM='" + code + "'", outFields: '*', returnGeometry: 'true', outSR: '4326', geometryPrecision: '6', f: 'geojson' });
        if (data.error) throw new Error(data.error.message || 'Layanan fallback batas desa gagal.');
      }
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
    geoprocessingSourceLayers.add(item);
    if (geojson.features.some(feature => feature.geometry && /Polygon/.test(feature.geometry.type))) geoprocessingLayers.add(item);
    importStatus(`${name} dimuat (${geojson.features.length} fitur). Layer siap dipilih pada operasi.`, false);
    window.refreshGeoprocessingLayerChoices();
    return item;
  }
  window.resetGeoprocessingSources = function () {
    let removed = 0;
    Array.from(geoprocessingSourceLayers).forEach(item => {
      if (typeof window.removeAlatGeoJSONLayer === 'function' && window.removeAlatGeoJSONLayer(item)) removed++;
      geoprocessingLayers.delete(item);
      geoprocessingSourceLayers.delete(item);
    });
    if (document.getElementById('gpBoundaryMode')?.value === 'layer') {
      selectedBoundary = null;
      const boundaryLayer = document.getElementById('gpClipBoundaryLayer');
      const boundaryInfo = document.getElementById('gpLayerBoundaryStatus');
      if (boundaryLayer) boundaryLayer.value = '';
      if (boundaryInfo) boundaryInfo.textContent = 'Layer sumber direset. Pilih Clip Features baru.';
    }
    window.refreshGeoprocessingLayerChoices();
    importStatus(removed ? `${removed} layer sumber dihapus dari peta.` : 'Tidak ada layer sumber untuk direset.', false);
  };
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
    if (!host) return;
    host.replaceChildren();
    if (!latestOutput || !latestOutputLayer) return;
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
    const repeat = document.createElement('button');
    repeat.type = 'button';
    repeat.className = 'geotools-btn gp-action-btn';
    repeat.textContent = 'Ulangi geoprocessing';
    repeat.addEventListener('click', run);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'geotools-btn gp-action-btn';
    remove.textContent = 'Hapus semua polygon';
    remove.addEventListener('click', () => {
      let removed = 0;
      Array.from(geoprocessingLayers).forEach(item => {
        const hasPolygon = item && item.geojson && Array.isArray(item.geojson.features)
          && item.geojson.features.some(feature => feature.geometry && /Polygon/.test(feature.geometry.type));
        if (!hasPolygon) return;
        if (typeof window.removeAlatGeoJSONLayer === 'function' && window.removeAlatGeoJSONLayer(item)) removed++;
        geoprocessingLayers.delete(item);
        if (item === latestOutputLayer) {
          latestOutput = null;
          latestOutputLayer = null;
          latestOutputVisible = false;
        }
      });
      renderOutputActions();
      status(removed ? `${removed} layer polygon Geoprocessing telah dihapus.` : 'Tidak ada polygon Geoprocessing untuk dihapus.', false);
      if (typeof window.refreshGeoprocessingLayerChoices === 'function') window.refreshGeoprocessingLayerChoices();
    });
    host.append(visibility, download, repeat, remove);
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
        if (!input || !selectedBoundary) throw new Error('Pilih Input Features dan Clip Features terlebih dahulu.');
        name = String(document.getElementById('gpOutputName')?.value || '').trim();
        if (!name) throw new Error('Isi nama Output Feature Class terlebih dahulu.');
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
      } else if (op === 'buffer') {
        const input = get('gpInput');
        if (!input) throw new Error('Pilih Input Features terlebih dahulu.');
        name = requireOutputName();
        const useField = document.getElementById('gpBufferDistanceMode')?.value === 'field';
        const distance = Number(document.getElementById('gpDistance')?.value);
        const distanceField = document.getElementById('gpDistanceField')?.value;
        if (useField && !distanceField) throw new Error('Pilih field numerik untuk Distance.');
        if (!useField && (!Number.isFinite(distance) || distance <= 0)) throw new Error('Masukkan jarak buffer positif.');
        const unit = document.getElementById('gpDistanceUnit')?.value || 'meters';
        const metersPerUnit = { meters: 1, kilometers: 1000, feet: 0.3048, miles: 1609.344 }[unit] || 1;
        result = input.geojson.features.map(feature => {
          if (!feature.geometry) return null;
          const featureDistance = useField ? Number(feature.properties && feature.properties[distanceField]) : distance;
          if (!Number.isFinite(featureDistance) || featureDistance <= 0) {
            throw new Error(useField ? `Nilai pada field “${distanceField}” harus berupa angka positif.` : 'Masukkan jarak buffer positif.');
          }
          return turf.buffer(feature, featureDistance * metersPerUnit, { units: 'meters' });
        }).filter(Boolean);
        if (document.getElementById('gpBufferDissolve')?.value === 'all') {
          result = unionFeatures(result).map(feature => ({ ...feature, properties: {} }));
        }
      } else if (op === 'intersect') {
        const inputs = selectedLayers('gpIntersectLayers');
        if (inputs.length < 2) throw new Error('Pilih minimal dua Input Features.');
        name = requireOutputName();
        const attributeMode = document.getElementById('gpIntersectAttributes')?.value || 'all';
        const fidName = layer => 'FID_' + layer.name.replace(/[^a-z0-9_]+/gi, '_');
        let intersections = polygonFeatures(inputs[0]).map((feature, featureIndex) => ({
          feature: { ...feature, properties: {} },
          attributes: attributeMode === 'fid' ? { [fidName(inputs[0])]: feature.id ?? feature.properties?.OBJECTID ?? featureIndex }
            : { ...(feature.properties || {}) },
          ids: { [fidName(inputs[0])]: feature.id ?? feature.properties?.OBJECTID ?? featureIndex }
        }));
        for (let index = 1; index < inputs.length && intersections.length; index++) {
          const next = [];
          const overlays = polygonFeatures(inputs[index]);
          intersections.forEach(left => overlays.forEach((right, featureIndex) => {
            const out = intersectPolygon(left.feature, right);
            if (out) {
              const idField = fidName(inputs[index]);
              const id = right.id ?? right.properties?.OBJECTID ?? featureIndex;
              const ids = { ...left.ids, [idField]: id };
              const attributes = attributeMode === 'fid' ? ids : {
                ...left.attributes,
                ...(right.properties || {})
              };
              next.push({ feature: out, attributes, ids });
            }
          }));
          intersections = next;
        }
        result = intersections.map(item => {
          if (attributeMode === 'no-fid') {
            item.attributes = Object.fromEntries(Object.entries(item.attributes).filter(([key]) => !/^(FID(?:_|$)|OBJECTID$)/i.test(key)));
          }
          item.feature.properties = item.attributes;
          return item.feature;
        });
      } else if (op === 'union') {
        const inputs = selectedLayers('gpUnionLayers');
        if (inputs.length < 2) throw new Error('Pilih minimal dua Input Features.');
        name = requireOutputName();
        const all = inputs.flatMap(polygonFeatures);
        if (!all.length) throw new Error('Tidak ditemukan poligon.');
        const attributeMode = document.getElementById('gpUnionAttributes')?.value || 'all';
        result = unionFeatures(all).map(merged => {
          let properties = { ...(merged.properties || {}) };
          if (attributeMode === 'no-fid') {
            properties = Object.fromEntries(Object.entries(properties).filter(([key]) => !/^(FID(?:_|$)|OBJECTID$)/i.test(key)));
          } else if (attributeMode === 'fid') {
            properties = Object.fromEntries(inputs.map(layer => {
              const index = polygonFeatures(layer).findIndex(feature => turf.booleanIntersects(feature, merged));
              const id = index < 0 ? -1 : (polygonFeatures(layer)[index].id ?? polygonFeatures(layer)[index].properties?.OBJECTID ?? index);
              return ['FID_' + layer.name.replace(/[^a-z0-9_]+/gi, '_'), id];
            }));
          }
          return { ...merged, properties };
        });
      } else if (op === 'merge') {
        const selected = selectedLayers('gpMergeLayers');
        if (selected.length < 2) throw new Error('Pilih minimal dua layer.');
        name = requireOutputName();
        const family = g => g && (/Point/.test(g.type) ? 'point' : /Line/.test(g.type) ? 'line' : /Polygon/.test(g.type) ? 'polygon' : 'other');
        const types = new Set(selected.flatMap(layer => layer.geojson.features.map(f => family(f.geometry))));
        if (types.size !== 1 || types.has('other')) throw new Error('Merge hanya bisa untuk tipe geometri yang sama.');
        const addSource = document.getElementById('gpMergeSourceInfo')?.checked;
        const firstSchema = new Set(selected[0].geojson.features.find(feature => feature.properties)?.properties
          ? Object.keys(selected[0].geojson.features.find(feature => feature.properties).properties)
          : []);
        const useFirstSchema = document.getElementById('gpMergeFieldMode')?.value === 'first';
        result = selected.flatMap(layer => layer.geojson.features.map(feature => ({
          ...feature,
          properties: {
            ...Object.fromEntries(Object.entries(feature.properties || {}).filter(([key]) => !useFirstSchema || firstSchema.has(key))),
            ...(addSource ? { MERGE_SRC: layer.name } : {})
          }
        })));
      } else if (op === 'dissolve') {
        const input = get('gpInput');
        if (!input) throw new Error('Pilih layer poligon.');
        name = requireOutputName();
        const keys = [...(document.getElementById('gpFields')?.selectedOptions || [])].map(option => option.value);
        const groups = new Map();
        polygonFeatures(input).forEach(feature => {
          const values = keys.map(key => feature.properties?.[key]);
          const groupKey = keys.length ? JSON.stringify(values) : 'all';
          if (!groups.has(groupKey)) groups.set(groupKey, { values, features: [] });
          groups.get(groupKey).features.push(feature);
        });
        groups.forEach(group => unionFeatures(group.features).forEach(dissolved => {
          dissolved.properties = Object.fromEntries(keys.map((key, index) => [key, group.values[index]]));
          result.push(dissolved);
        }));
      }
      if (!result.length) throw new Error('Operasi tidak menghasilkan fitur. Periksa geometri dan cakupan layer.');
      const output = { type: 'FeatureCollection', features: result };
      if (typeof window.addAlatGeoJSONLayer !== 'function') throw new Error('Penyimpanan layer hasil tidak tersedia.');
      if (latestOutputLayer && typeof window.removeAlatGeoJSONLayer === 'function') {
        window.removeAlatGeoJSONLayer(latestOutputLayer);
        geoprocessingLayers.delete(latestOutputLayer);
      }
      latestOutputLayer = window.addAlatGeoJSONLayer(name, type, output);
      if (result.some(feature => feature.geometry && /Polygon/.test(feature.geometry.type))) geoprocessingLayers.add(latestOutputLayer);
      latestOutput = output;
      latestOutputVisible = true;
      renderOutputActions();
      if (typeof window.refreshGeoprocessingLayerChoices === 'function') window.refreshGeoprocessingLayerChoices();
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
    if (document.getElementById('gpBoundaryMode')?.value === 'layer') {
      window.useGeoprocessingLayerBoundary();
    }
    ['gpIntersectLayers', 'gpUnionLayers', 'gpMergeLayers'].forEach(populateChecklist);
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
