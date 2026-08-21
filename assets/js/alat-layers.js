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

  function alatSectionTabSwitch(btn, panelId) {
    const toolsTab = btn.closest('#tab-alat');
    toolsTab.querySelectorAll('.alat-section-tab').forEach(tab => {
      tab.classList.remove('active');
      tab.setAttribute('aria-selected', 'false');
    });
    toolsTab.querySelectorAll('.alat-section-panel').forEach(panel => panel.classList.remove('active'));
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    toolsTab.querySelector(`#${panelId}`).classList.add('active');

    if (panelId === 'alat-section-file') {
      if (typeof removeDrawControl === 'function') removeDrawControl();
      if (typeof stopMeasureMode === 'function') stopMeasureMode();
    }
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
        if (item.type === 'GPX' || item.type === 'KML') resetGpxAnimationControls();
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
        const geojson = await shp(await zipFile.arrayBuffer());
        const collection = Array.isArray(geojson) ? geojson[0] : geojson;
        if (!collection || collection.type !== 'FeatureCollection') {
          throw new Error('SHP tidak menghasilkan FeatureCollection.');
        }
        addAlatLayer(zipFile.name.replace(/\.zip$/i, ''), 'SHP (ZIP)', collection);
        return;
      }

      // Jika file terpisah, parse geometri dan atribut sebelum digabungkan.
      const shpFile = [...files].find(f => f.name.toLowerCase().endsWith('.shp'));
      if (!shpFile) {
        throw new Error('File .shp tidak ditemukan.');
      }
      const baseName = shpFile.name.replace(/\.shp$/i, '');
      const baseNameLower = baseName.toLowerCase();
      const readBuffer = (file) => file ? file.arrayBuffer() : Promise.resolve(null);
      const [shpBuf, dbfBuf, prjText] = await Promise.all([
        readBuffer(shpFile),
        readBuffer([...files].find(f => f.name.toLowerCase() === `${baseNameLower}.dbf`)),
        (() => {
          const prjFile = [...files].find(f => f.name.toLowerCase() === `${baseNameLower}.prj`);
          return prjFile ? prjFile.text() : Promise.resolve(undefined);
        })()
      ]);
      if (!dbfBuf) throw new Error('File .dbf tidak ditemukan.');
      const geojson = await shpBuffersToGeoJSON(shpBuf, dbfBuf, prjText);
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
    resetGpxAnimationControls();
    setAlatStatus('🗑️ Semua layer analisis dihapus.');
  }

  async function shpBuffersToGeoJSON(shpBuffer, dbfBuffer, prjText) {
    const [geometries, properties] = await Promise.all([
      shp.parseShp(shpBuffer, prjText),
      shp.parseDbf(dbfBuffer)
    ]);
    return shp.combine([geometries, properties]);
  }

  // ==============================================================
  // GOOGLE MAPS TIMELINE JSON → ANIMASI TRACK
  // ==============================================================
  // Timeline (Google Maps JSON → GeoJSON)

  function parseTimelinePoint(str) {
    if (!str) return null;
    const parts = str.split(',');
    if (parts.length < 2) return null;
    const lat = parseFloat(parts[0].replace('°', '').trim());
    const lng = parseFloat(parts[1].replace('°', '').trim());
    if (isNaN(lat) || isNaN(lng)) return null;
    return [lng, lat]; // GeoJSON order [lng, lat]
  }

  function timelineToGeoJSON(json) {
    const segs = json && json.semanticSegments ? json.semanticSegments : [];
    const points = [];
    segs.forEach(function (seg) {
      if (!seg.timelinePath || !seg.timelinePath.length) return;
      seg.timelinePath.forEach(function (pt) {
        const ll = parseTimelinePoint(pt.point);
        if (!ll) return;
        const t = pt.time ? new Date(pt.time) : null;
        points.push({ lng: ll[0], lat: ll[1], t: t });
      });
    });
    // Dedup titik berurutan yang hampir identik (posisi diam) agar animasi ringan
    const dedup = [];
    const EPS = 1e-6;
    points.forEach(function (p) {
      const prev = dedup[dedup.length - 1];
      if (!prev || Math.abs(prev.lat - p.lat) > EPS || Math.abs(prev.lng - p.lng) > EPS) {
        dedup.push(p);
      }
    });
    if (dedup.length < 2) return null;
    const coords = dedup.map(function (p) { return [p.lng, p.lat]; });
    const f = dedup[0].t;
    const l = dedup[dedup.length - 1].t;
    let name = 'Google Timeline';
    if (f && l) {
      const opt = { day: '2-digit', month: 'short' };
      name += ' ' + f.toLocaleDateString('id-ID', opt) + ' – ' + l.toLocaleDateString('id-ID', opt);
    }
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { name: name },
        geometry: { type: 'LineString', coordinates: coords }
      }]
    };
  }

  function loadTimelineJSON() {
    const input = document.getElementById('timelineFileInput');
    function run(text) {
      try {
        const json = JSON.parse(text);
        const geojson = timelineToGeoJSON(json);
        if (!geojson) {
          setAlatStatus('Tidak ada timelinePath ditemukan dalam JSON.', true);
          return;
        }
        gpxCollectTracks(geojson);
        // Saat Muat & Animasi: basemap → Carto Light, zoom 15
        if (typeof setBaseMap === 'function') setBaseMap('carto-light');
        map.setZoom(8);
        setAlatStatus('Timeline dimuat (' + geojson.features[0].geometry.coordinates.length + ' titik). Tekan Play untuk memutar animasi.');
      } catch (e) {
        setAlatStatus('Gagal memuat Timeline JSON: ' + e.message, true);
      }
    }
    if (input && input.files && input.files[0]) {
      const reader = new FileReader();
      reader.onload = function () { run(reader.result); };
      reader.onerror = function () { setAlatStatus('Gagal membaca file.', true); };
      reader.readAsText(input.files[0]);
    } else {
      setAlatStatus('Pilih file Timeline.json dari HP Anda terlebih dahulu.', true);
    }
  }

  // ==============================================================
  // GPX TRACK ANIMATION
  // ==============================================================
  let gpxTracks = [];          // [{ name, coords }]
  let gpxAnimMarker = null;
  let gpxAnimTodo = null;       // panduan rute utuh (faint)
  let gpxAnimComet = [];        // band trail memudar (comet)
  let gpxAnimRaf = null;
  let gpxAnimPlaying = false;
  let gpxAnimPos = 0;           // posisi float untuk interpolasi halus
  let gpxAnimSpeed = 1;
  let gpxAnimLastTs = 0;
  let gpxAnimFinished = false;  // true bila animasi telah sampai ujung (jalur penuh menyala)
  const GPX_PTS_PER_SEC = 50;  // kecepatan dasar poin/detik (1x) — seimbang: ekor komet tetap terlihat (~12 dtk) & putar penuh ~2 menit
  const GPX_COMET_BASE_TAIL = 380;   // jumlah titik ekor komet pada 1x
  const GPX_COMET_SEGMENTS = 32;      // jumlah band → gradien halus kepala→ekor
  const GPX_COMET_HEAD = { color: [96, 165, 250], weight: 6, opacity: 0.95 };  // #60a5fa
  const GPX_COMET_TAIL = { color: [30, 64, 175], weight: 1, opacity: 0.0 };    // #1e40af
  function gpxCometStyle(k) {
    const f = k / (GPX_COMET_SEGMENTS - 1); // 0 = kepala, 1 = ekor
    const cr = Math.round(GPX_COMET_HEAD.color[0] + (GPX_COMET_TAIL.color[0] - GPX_COMET_HEAD.color[0]) * f);
    const cg = Math.round(GPX_COMET_HEAD.color[1] + (GPX_COMET_TAIL.color[1] - GPX_COMET_HEAD.color[1]) * f);
    const cb = Math.round(GPX_COMET_HEAD.color[2] + (GPX_COMET_TAIL.color[2] - GPX_COMET_HEAD.color[2]) * f);
    return {
      color: 'rgb(' + cr + ',' + cg + ',' + cb + ')',
      weight: GPX_COMET_HEAD.weight + (GPX_COMET_TAIL.weight - GPX_COMET_HEAD.weight) * f,
      opacity: GPX_COMET_HEAD.opacity + (GPX_COMET_TAIL.opacity - GPX_COMET_HEAD.opacity) * f,
      lineCap: 'round', lineJoin: 'round'
    };
  }

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
    const mapOverlay = document.getElementById('gpxAnimMapOverlay');
    sel.innerHTML = '';
    if (!gpxTracks.length) { ctrl.style.display = 'none'; return; }
    // Tutup sidebar terlebih dahulu, kemudian tampilkan panel animasi di atas peta.
    ctrl.style.display = 'none';
    const sidebar = document.getElementById('sidebar-left');
    if (sidebar) {
      sidebar.classList.add('collapsed');
      if (typeof setToggleIcon === 'function') setToggleIcon(true);
    }
    window.setTimeout(() => {
      // Panel sudah ditempatkan di overlay peta melalui markup index.html.
      if (mapOverlay && ctrl.parentElement !== mapOverlay) mapOverlay.appendChild(ctrl);
      ctrl.style.display = '';
      map.invalidateSize();
    }, 300);
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
    gpxAnimPos = 0;
    gpxAnimLastTs = 0;
    gpxAnimFinished = false;
    if (gpxAnimMarker) { map.removeLayer(gpxAnimMarker); gpxAnimMarker = null; }
    if (gpxAnimTodo) { map.removeLayer(gpxAnimTodo); gpxAnimTodo = null; }
    gpxAnimComet.forEach(function (l) { if (l) map.removeLayer(l); });
    gpxAnimComet = [];
    const btn = document.getElementById('gpxAnimPlay');
    if (btn) { const s = btn.querySelector('span'); if (s) s.textContent = 'Play'; }
    const slider = document.getElementById('gpxAnimSlider');
    if (slider) slider.value = 0;
  }

  function resetGpxAnimationControls() {
    gpxAnimReset();
    gpxTracks = [];
    const ctrl = document.getElementById('gpxAnimControls');
    const select = document.getElementById('gpxTrackSelect');
    const info = document.getElementById('gpxAnimInfo');
    if (ctrl) ctrl.style.display = 'none';
    if (select) select.replaceChildren();
    if (info) info.textContent = 'Pilih track lalu tekan Play.';
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
    if (gpxAnimPos === 0 || gpxAnimPos >= track.coords.length - 1) {
      gpxAnimReset();
      gpxAnimPos = 0;
      const latlngs = track.coords;
      gpxAnimTodo = L.polyline(latlngs, { color: '#94a3b8', weight: 2, opacity: 0.12 }).addTo(map);
      gpxAnimComet = [];
      for (let k = GPX_COMET_SEGMENTS - 1; k >= 0; k--) {
        gpxAnimComet[k] = L.polyline([], gpxCometStyle(k)).addTo(map);
      }
      gpxAnimMarker = L.marker(latlngs[0], {
        icon: L.divIcon({
          className: 'gpx-anim-dot',
          html: '<span class="gpx-anim-dot-inner"></span>',
          iconSize: [18, 18], iconAnchor: [9, 9]
        }),
        zIndexOffset: 1000
      }).addTo(map);
      map.flyToBounds(L.latLngBounds(latlngs), { padding: [60, 60], maxZoom: 7, duration: 0.6 });
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
    const target = (pct / 100) * total;
    if (Math.round(target) === Math.round(gpxAnimPos) && !gpxAnimFinished) return;

    // Bersihkan mode "selesai" agar kembali ke comet normal
    if (gpxAnimFinished || !gpxAnimComet.length) {
      if (gpxAnimMarker) { map.removeLayer(gpxAnimMarker); gpxAnimMarker = null; }
      if (gpxAnimTodo) { map.removeLayer(gpxAnimTodo); gpxAnimTodo = null; }
      gpxAnimComet.forEach(function (l) { if (l) map.removeLayer(l); });
      gpxAnimComet = [];
    gpxAnimFinished = false;
      gpxAnimTodo = L.polyline(track.coords, { color: '#94a3b8', weight: 2, opacity: 0.12 }).addTo(map);
      gpxAnimComet = [];
      for (let k = GPX_COMET_SEGMENTS - 1; k >= 0; k--) {
        gpxAnimComet[k] = L.polyline([], gpxCometStyle(k)).addTo(map);
      }
      gpxAnimMarker = L.marker(track.coords[0], {
        icon: L.divIcon({ className: 'gpx-anim-dot', html: '<span class="gpx-anim-dot-inner"></span>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        zIndexOffset: 1000
      }).addTo(map);
      map.flyToBounds(L.latLngBounds(track.coords), { padding: [60, 60], maxZoom: 7, duration: 0.5 });
    }

    gpxAnimPos = target;
    gpxAnimUpdateView(track);

    if (target >= total) {
      gpxAnimFinished = true;
      gpxAnimRevealFull(track);
    }
  }

  function gpxAnimSetSpeed(v) { gpxAnimSpeed = parseInt(v, 10) || 1; }

  function gpxAnimStep(ts) {
    if (!gpxAnimPlaying) return;
    const sel = document.getElementById('gpxTrackSelect');
    const tIdx = parseInt(sel.value, 10);
    const track = gpxTracks[tIdx];
    if (!track) return;

    if (!gpxAnimLastTs) gpxAnimLastTs = ts;
    const delta = (ts - gpxAnimLastTs) / 1000;
    gpxAnimLastTs = ts;
    // Maju berbasis waktu agar pergerakan halus & konsisten antar kecepatan
    const step = Math.max(0.5, delta * GPX_PTS_PER_SEC * gpxAnimSpeed);
    gpxAnimPos = Math.min(gpxAnimPos + step, track.coords.length - 1);

    gpxAnimUpdateView(track);

    if (gpxAnimPos >= track.coords.length - 1) {
      gpxAnimPlaying = false;
      gpxAnimFinished = true;
      gpxAnimRevealFull(track);
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
    const pos = gpxAnimPos;
    const last = coords.length - 1;
    const i = Math.max(0, Math.min(Math.floor(pos), last - 1));
    const frac = pos - i;
    const a = coords[i];
    const b = coords[Math.min(i + 1, last)];
    // Interpolasi posisi marker antar-titik → pergerakan halus
    const head = [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
    gpxAnimMarker.setLatLng(head);
    if (gpxAnimPlaying) map.panTo(head);

    // Comet halus: banyak band dengan gradien ketebalan & transparansi kepala→ekor
    if (!gpxAnimFinished) {
      const sp = gpxAnimSpeed || 1;
      const tailLen = Math.min(Math.round(GPX_COMET_BASE_TAIL * sp), last);
      const segLen = Math.max(1, tailLen / GPX_COMET_SEGMENTS);
      for (let k = 0; k < GPX_COMET_SEGMENTS; k++) {
        const end = i - Math.round(k * segLen);
        const start = i - Math.round((k + 1) * segLen);
        const s = Math.max(0, start);
        const e = Math.max(s, end);
        const pts = coords.slice(s, e + 1).map(function (c) { return [c[0], c[1]]; });
        if (k === 0) pts.push(head); // sambungkan ke posisi marker terinterpolasi
        gpxAnimComet[k].setLatLngs(pts);
      }
    }

    // Slider
    const pct = (pos / last) * 100;
    const slider = document.getElementById('gpxAnimSlider');
    if (slider) slider.value = pct;

    // Info jarak
    let dist = 0;
    for (let k = 1; k <= i; k++) {
      dist += L.latLng(coords[k - 1]).distanceTo(L.latLng(coords[k]));
    }
    let totalDist = 0;
    for (let k = 1; k < coords.length; k++) {
      totalDist += L.latLng(coords[k - 1]).distanceTo(L.latLng(coords[k]));
    }
    const fmtDist = dist >= 1000 ? (dist / 1000).toFixed(2) + ' km' : Math.round(dist) + ' m';
    const fmtTotal = totalDist >= 1000 ? (totalDist / 1000).toFixed(2) + ' km' : Math.round(totalDist) + ' m';
    document.getElementById('gpxAnimInfo').innerHTML =
      `<b>${track.name}</b> — ${fmtDist} / ${fmtTotal} — titik ${i + 1}/${coords.length}`;
  }

  // Seluruh jalur menyala dengan gaya comet (tiap band diisi penuh)
  function gpxAnimRevealFull(track) {
    for (let k = 0; k < GPX_COMET_SEGMENTS; k++) {
      if (gpxAnimComet[k]) gpxAnimComet[k].setLatLngs(track.coords);
    }
    if (gpxAnimTodo) { map.removeLayer(gpxAnimTodo); gpxAnimTodo = null; }
    gpxAnimMarker.setLatLng(track.coords[track.coords.length - 1]);
  }
