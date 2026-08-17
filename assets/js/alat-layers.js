  // ==============================================================
  // ALAT ANALISIS: MUAT GEOJSON, GPX, KML, KMZ & SHP KE PETA
  // ==============================================================
  const alatLayers = []; // [{ id, name, type, layer, geojson }]
  let alatLayerCounter = 0;

  function setAlatStatus(message, isError = false) {
    const status = document.getElementById('alatStatus');
    status.textContent = message;
    status.style.color = isError ? '#c0392b' : '#567';
  }

  function alatFileTabSwitch(btn, panelId) {
    btn.closest('.alat-file-card').querySelectorAll('.alat-file-tab').forEach(t => t.classList.remove('active'));
    btn.closest('.alat-file-card').querySelectorAll('.alat-file-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(panelId).classList.add('active');
  }

  function renderAlatLayerList() {
    const list = document.getElementById('alatLayerList');
    list.replaceChildren(...alatLayers.map(item => {
      const card = document.createElement('div');
      card.className = 'alat-layer-card';
      const name = document.createElement('strong');
      name.textContent = item.name;
      const meta = document.createElement('small');
      meta.textContent = `${item.type} · ${item.geojson.features.length} fitur`;
      const btns = document.createElement('div');
      btns.className = 'alat-layer-card-btns';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      const isVisible = map.hasLayer(item.layer);
      toggle.innerHTML = (isVisible
        ? '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Sembunyikan'
        : '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg> Tampilkan');
      toggle.addEventListener('click', () => {
        if (map.hasLayer(item.layer)) map.removeLayer(item.layer);
        else item.layer.addTo(map);
        renderAlatLayerList();
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'alat-remove-btn';
      remove.innerHTML = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg> Hapus';
      remove.addEventListener('click', () => {
        map.removeLayer(item.layer);
        const idx = alatLayers.indexOf(item);
        if (idx > -1) alatLayers.splice(idx, 1);
        renderAlatLayerList();
      });
      btns.append(toggle, remove);
      card.append(name, meta, btns);
      return card;
    }));
  }

  function addAlatLayer(name, type, geojson) {
    const layer = L.geoJSON(geojson, {
      style: () => ({
        color: '#0879bf',
        weight: 2,
        fillColor: '#4aa3df',
        fillOpacity: 0.35
      }),
      pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
        radius: 6,
        color: '#0879bf',
        weight: 2,
        fillColor: '#4aa3df',
        fillOpacity: 0.8
      }),
      onEachFeature: (feature, layer) => {
        if (feature.properties && Object.keys(feature.properties).length) {
          const props = Object.entries(feature.properties)
            .map(([k, v]) => `<div class="alat-popup-row"><b>${escapeBMKGHTML(k)}</b><span>${escapeBMKGHTML(v)}</span></div>`)
            .join('');
          layer.bindPopup(`<div class="alat-popup">${props}</div>`, { maxWidth: 260, className: 'alat-leaflet-popup' });
        }
      }
    });
    layer.addTo(map);
    const id = ++alatLayerCounter;
    alatLayers.push({ id, name, type, layer, geojson });
    map.flyToBounds(layer.getBounds().pad(0.1), { maxZoom: 15, duration: 0.8 });
    renderAlatLayerList();
    setAlatStatus(`✅ ${name} dimuat: ${geojson.features.length} fitur ditampilkan.`);
  }

  function loadGeoJSONFile() {
    const input = document.getElementById('geojsonFileInput');
    const file = input.files && input.files[0];
    if (!file) {
      setAlatStatus('⚠️ Pilih file GeoJSON terlebih dahulu.', true);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const geojson = JSON.parse(e.target.result);
        if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
          throw new Error('Format GeoJSON tidak valid (harus FeatureCollection).');
        }
        addAlatLayer(file.name.replace(/\.(geojson|json)$/i, ''), 'GeoJSON', geojson);
      } catch (err) {
        setAlatStatus(`❌ Gagal memuat GeoJSON: ${err.message}`, true);
      }
    };
    reader.onerror = () => setAlatStatus('❌ Gagal membaca file.', true);
    reader.readAsText(file);
  }

  function loadGPXFile() {
    const input = document.getElementById('gpxFileInput');
    const file = input.files && input.files[0];
    if (!file) {
      setAlatStatus('⚠️ Pilih file GPX atau KML terlebih dahulu.', true);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const doc = new DOMParser().parseFromString(text, 'text/xml');
        const parseError = doc.querySelector('parsererror');
        if (parseError) throw new Error('XML tidak valid.');
        let geojson;
        const root = doc.documentElement.tagName.toLowerCase();
        if (root === 'gpx') {
          geojson = toGeoJSON.gpx(doc);
        } else if (root === 'kml') {
          geojson = toGeoJSON.kml(doc);
        } else {
          throw new Error('Format tidak dikenali (harus GPX atau KML).');
        }
        if (!geojson || geojson.type !== 'FeatureCollection' || !geojson.features.length) {
          throw new Error('Tidak ada fitur ditemukan dalam file.');
        }
        const fmt = root === 'gpx' ? 'GPX' : 'KML';
        addAlatLayer(file.name.replace(/\.(gpx|kml)$/i, ''), fmt, geojson);
        gpxCollectTracks(geojson);
      } catch (err) {
        setAlatStatus(`❌ Gagal memuat GPX/KML: ${err.message}`, true);
      }
    };
    reader.onerror = () => setAlatStatus('❌ Gagal membaca file.', true);
    reader.readAsText(file);
  }

  async function loadKMZFile() {
    const input = document.getElementById('kmzFileInput');
    const file = input.files && input.files[0];
    if (!file) {
      setAlatStatus('⚠️ Pilih file KMZ terlebih dahulu.', true);
      return;
    }
    setAlatStatus('⏳ Memproses file KMZ...');
    try {
      const buffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(buffer);
      let kmlFile = null;
      zip.forEach((path, entry) => {
        if (path.toLowerCase().endsWith('.kml')) kmlFile = entry;
      });
      if (!kmlFile) throw new Error('File .kml tidak ditemukan di dalam KMZ.');
      const kmlString = await kmlFile.async('string');
      const doc = new DOMParser().parseFromString(kmlString, 'text/xml');
      const parseError = doc.querySelector('parsererror');
      if (parseError) throw new Error('KML di dalam KMZ tidak valid.');
      const geojson = toGeoJSON.kml(doc);
      if (!geojson || geojson.type !== 'FeatureCollection' || !geojson.features.length) {
        throw new Error('Tidak ada fitur ditemukan dalam KMZ.');
      }
      addAlatLayer(file.name.replace(/\.kmz$/i, ''), 'KMZ', geojson);
      gpxCollectTracks(geojson);
    } catch (err) {
      setAlatStatus(`❌ Gagal memuat KMZ: ${err.message}`, true);
    }
  }

  async function loadSHPFile() {
    const input = document.getElementById('shpFileInput');
    const files = input.files;
    if (!files || !files.length) {
      setAlatStatus('⚠️ Pilih file SHP (.shp/.dbf/.shx) atau .zip terlebih dahulu.', true);
      return;
    }
    setAlatStatus('⏳ Memproses file SHP...');
    try {
      // Jika ada file .zip, gunakan shpjs langsung.
      const zipFile = [...files].find(f => f.name.toLowerCase().endsWith('.zip'));
      if (zipFile) {
        const geojson = await shp(zipFile);
        const collection = Array.isArray(geojson) ? geojson[0] : geojson;
        if (!collection || collection.type !== 'FeatureCollection') {
          throw new Error('SHP tidak menghasilkan FeatureCollection.');
        }
        addAlatLayer(zipFile.name.replace(/\.zip$/i, ''), 'SHP (ZIP)', collection);
        return;
      }

      // Jika file terpisah (.shp + .dbf + .shx), gabungkan menjadi array buffer.
      const shpFile = [...files].find(f => f.name.toLowerCase().endsWith('.shp'));
      if (!shpFile) {
        throw new Error('File .shp tidak ditemukan.');
      }
      const baseName = shpFile.name.replace(/\.shp$/i, '');
      const readBuffer = (file) => file ? file.arrayBuffer() : Promise.resolve(null);
      const [shpBuf, dbfBuf, shxBuf] = await Promise.all([
        readBuffer(shpFile),
        readBuffer([...files].find(f => f.name.toLowerCase() === `${baseName}.dbf`)),
        readBuffer([...files].find(f => f.name.toLowerCase() === `${baseName}.shx`))
      ]);
      const geojson = await shp.combine([shpBuf, dbfBuf, shxBuf]);
      if (!geojson || geojson.type !== 'FeatureCollection') {
        throw new Error('SHP tidak menghasilkan FeatureCollection.');
      }
      addAlatLayer(baseName, 'SHP', geojson);
    } catch (err) {
      console.error('Gagal memuat SHP:', err);
      setAlatStatus(`❌ Gagal memuat SHP: ${err.message}`, true);
    }
  }

  function clearAlatLayers() {
    alatLayers.forEach(item => map.removeLayer(item.layer));
    alatLayers.length = 0;
    renderAlatLayerList();
    gpxAnimReset();
    setAlatStatus('🗑️ Semua layer analisis dihapus.');
  }

  // ==============================================================
  // GPX TRACK ANIMATION
  // ==============================================================
  let gpxTracks = [];          // [{ name, coords }]
  let gpxAnimMarker = null;
  let gpxAnimTrailDone = null; // polyline sudah dilalui
  let gpxAnimTrailTodo = null; // polyline belum dilalui
  let gpxAnimRaf = null;
  let gpxAnimPlaying = false;
  let gpxAnimIdx = 0;
  let gpxAnimSpeed = 2;
  let gpxAnimLastTs = 0;

  function gpxCollectTracks(geojson) {
    gpxTracks = [];
    geojson.features.forEach(f => {
      if (f.geometry && f.geometry.type === 'LineString' && f.geometry.coordinates.length > 1) {
        gpxTracks.push({
          name: f.properties && f.properties.name ? f.properties.name : 'Track ' + (gpxTracks.length + 1),
          coords: f.geometry.coordinates.map(c => [c[1], c[0]]) // [lat, lng]
        });
      }
    });
    // Also collect MultiLineString
    geojson.features.forEach(f => {
      if (f.geometry && f.geometry.type === 'MultiLineString') {
        f.geometry.coordinates.forEach((line, i) => {
          gpxTracks.push({
            name: (f.properties && f.properties.name ? f.properties.name : 'Track') + (i > 0 ? ' ' + (i + 1) : ''),
            coords: line.map(c => [c[1], c[0]])
          });
        });
      }
    });
    const sel = document.getElementById('gpxTrackSelect');
    const ctrl = document.getElementById('gpxAnimControls');
    sel.innerHTML = '';
    if (!gpxTracks.length) { ctrl.style.display = 'none'; return; }
    ctrl.style.display = '';
    gpxTracks.forEach((t, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = t.name + ' (' + t.coords.length + ' titik)';
      sel.appendChild(opt);
    });
    document.getElementById('gpxAnimInfo').textContent = 'Pilih track lalu tekan Play.';
  }

  function gpxAnimReset() {
    if (gpxAnimRaf) cancelAnimationFrame(gpxAnimRaf);
    gpxAnimRaf = null;
    gpxAnimPlaying = false;
    gpxAnimIdx = 0;
    gpxAnimLastTs = 0;
    if (gpxAnimMarker) { map.removeLayer(gpxAnimMarker); gpxAnimMarker = null; }
    if (gpxAnimTrailDone) { map.removeLayer(gpxAnimTrailDone); gpxAnimTrailDone = null; }
    if (gpxAnimTrailTodo) { map.removeLayer(gpxAnimTrailTodo); gpxAnimTrailTodo = null; }
    const btn = document.getElementById('gpxAnimPlay');
    if (btn) { const s = btn.querySelector('span'); if (s) s.textContent = 'Play'; }
    const slider = document.getElementById('gpxAnimSlider');
    if (slider) slider.value = 0;
  }

  function gpxAnimToggle() {
    if (gpxAnimPlaying) { gpxAnimPause(); } else { gpxAnimPlay(); }
  }

  function gpxAnimPlay() {
    const sel = document.getElementById('gpxTrackSelect');
    const tIdx = parseInt(sel.value, 10);
    if (isNaN(tIdx) || !gpxTracks[tIdx]) return;
    const track = gpxTracks[tIdx];

    // Jika mulai dari awal, setup trail
    if (gpxAnimIdx === 0 || gpxAnimIdx >= track.coords.length - 1) {
      gpxAnimReset();
      gpxAnimIdx = 0;
      const latlngs = track.coords;
      gpxAnimTrailDone = L.polyline([], { color: '#0879bf', weight: 4, opacity: 0.9 }).addTo(map);
      gpxAnimTrailTodo = L.polyline(latlngs, { color: '#b0c4d8', weight: 3, opacity: 0.6, dashArray: '6 4' }).addTo(map);
      gpxAnimMarker = L.circleMarker(latlngs[0], {
        radius: 8, color: '#fff', weight: 3, fillColor: '#e74c3c', fillOpacity: 1
      }).addTo(map);
      gpxAnimMarker.bindPopup('', { maxWidth: 200, className: 'alat-leaflet-popup' });
      map.flyToBounds(L.latLngBounds(latlngs).pad(0.1), { duration: 0.6 });
    }

    gpxAnimPlaying = true;
    gpxAnimLastTs = 0;
    const playBtn = document.getElementById('gpxAnimPlay');
    const playSpan = playBtn.querySelector('span');
    const playSvg = playBtn.querySelector('svg');
    if (playSpan) playSpan.textContent = 'Pause';
    if (playSvg) playSvg.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    gpxAnimRaf = requestAnimationFrame(gpxAnimStep);
  }

  function gpxAnimPause() {
    gpxAnimPlaying = false;
    if (gpxAnimRaf) cancelAnimationFrame(gpxAnimRaf);
    gpxAnimRaf = null;
    const playBtn = document.getElementById('gpxAnimPlay');
    const playSpan = playBtn.querySelector('span');
    const playSvg = playBtn.querySelector('svg');
    if (playSpan) playSpan.textContent = 'Play';
    if (playSvg) playSvg.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
  }

  function gpxAnimStop() {
    gpxAnimReset();
    const ctrl = document.getElementById('gpxAnimControls');
    if (gpxTracks.length) ctrl.style.display = '';
  }

  function gpxAnimSeek(pct) {
    const sel = document.getElementById('gpxTrackSelect');
    const tIdx = parseInt(sel.value, 10);
    if (isNaN(tIdx) || !gpxTracks[tIdx]) return;
    const track = gpxTracks[tIdx];
    const total = track.coords.length - 1;
    const target = Math.round(pct / 100 * total);
    if (target === gpxAnimIdx) return;

    // Setup layers if needed
    if (!gpxAnimTrailDone) {
      gpxAnimTrailDone = L.polyline([], { color: '#0879bf', weight: 4, opacity: 0.9 }).addTo(map);
      gpxAnimTrailTodo = L.polyline(track.coords, { color: '#b0c4d8', weight: 3, opacity: 0.6, dashArray: '6 4' }).addTo(map);
      gpxAnimMarker = L.circleMarker(track.coords[0], {
        radius: 8, color: '#fff', weight: 3, fillColor: '#e74c3c', fillOpacity: 1
      }).addTo(map);
      gpxAnimMarker.bindPopup('', { maxWidth: 200, className: 'alat-leaflet-popup' });
    }

    gpxAnimIdx = target;
    gpxAnimUpdateView(track);
  }

  function gpxAnimSetSpeed(v) { gpxAnimSpeed = parseInt(v, 10) || 2; }

  function gpxAnimStep(ts) {
    if (!gpxAnimPlaying) return;
    const sel = document.getElementById('gpxTrackSelect');
    const tIdx = parseInt(sel.value, 10);
    const track = gpxTracks[tIdx];
    if (!track) return;

    if (!gpxAnimLastTs) gpxAnimLastTs = ts;
    const delta = ts - gpxAnimLastTs;
    // ~30 points per second at 1x speed
    const step = Math.max(1, Math.round(delta / 1000 * 30 * gpxAnimSpeed));
    gpxAnimIdx = Math.min(gpxAnimIdx + step, track.coords.length - 1);
    gpxAnimLastTs = ts;

    gpxAnimUpdateView(track);

    if (gpxAnimIdx >= track.coords.length - 1) {
      gpxAnimPlaying = false;
      const playBtn = document.getElementById('gpxAnimPlay');
      const playSpan = playBtn.querySelector('span');
      const playSvg = playBtn.querySelector('svg');
      if (playSpan) playSpan.textContent = 'Selesai';
      if (playSvg) playSvg.innerHTML = '<polyline points="20 6 9 17 4 12"/>';
      return;
    }
    gpxAnimRaf = requestAnimationFrame(gpxAnimStep);
  }

  function gpxAnimUpdateView(track) {
    const coords = track.coords;
    const idx = gpxAnimIdx;
    const done = coords.slice(0, idx + 1);
    gpxAnimTrailDone.setLatLngs(done);
    gpxAnimMarker.setLatLng(coords[idx]);
    // Update remaining trail
    if (idx < coords.length - 1) {
      gpxAnimTrailTodo.setLatLngs(coords.slice(idx));
    } else {
      gpxAnimTrailTodo.setLatLngs([]);
    }
    // Slider
    const pct = idx / (coords.length - 1) * 100;
    document.getElementById('gpxAnimSlider').value = pct;
    // Info
    let dist = 0;
    for (let i = 1; i <= idx; i++) {
      dist += L.latLng(coords[i - 1]).distanceTo(L.latLng(coords[i]));
    }
    let totalDist = 0;
    for (let i = 1; i < coords.length; i++) {
      totalDist += L.latLng(coords[i - 1]).distanceTo(L.latLng(coords[i]));
    }
    const fmtDist = dist >= 1000 ? (dist / 1000).toFixed(2) + ' km' : Math.round(dist) + ' m';
    const fmtTotal = totalDist >= 1000 ? (totalDist / 1000).toFixed(2) + ' km' : Math.round(totalDist) + ' m';
    gpxAnimMarker.setPopupContent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#e74c3c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"/><path d="M10 22V17L7 14V10l5-2 5 2v4l-3 3v5"/><path d="M10 13l2 2 2-2"/></svg>');
    gpxAnimMarker.openPopup();
    document.getElementById('gpxAnimInfo').innerHTML =
      `<b>${track.name}</b> — ${fmtDist} / ${fmtTotal} — titik ${idx + 1}/${coords.length}`;
  }
