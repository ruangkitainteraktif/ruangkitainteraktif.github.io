(() => {
  'use strict';

  const STORE_KEY = 'ruangkita-geostudio-project-v1';
  const W = 1080, H = 1920, FPS = 30;
  const $ = (id) => document.getElementById(id);
  const defaults = [
    ['Opening', 4, 'Sebuah kota yang terus berubah', 'Apa yang membuat permukaan tanah bergerak?', 'zoomIn'],
    ['Geographic Overview', 5, 'Kepulauan di antara dua samudra', 'Mulai dari letak wilayah sebelum beralih ke ceritanya.', 'pan'],
    ['Data Visualization', 6, 'Apa yang ditunjukkan data?', 'Masukkan pengukuran dan sumber data Anda di panel aset.', 'counter'],
    ['Local Zoom', 5, 'Lihat lebih dekat', 'Pilih titik yang ingin Anda soroti di peta.', 'marker'],
    ['Impact Illustration', 5, 'Apa dampaknya bagi warga?', 'Ilustrasi rumah ini membantu menjelaskan perubahan wilayah.', 'gauge'],
    ['Conclusion', 5, 'Pertanyaan untuk kota kita', 'Tambahkan kesimpulan berdasarkan sumber yang Anda percaya.', 'bounce']
  ].map((s, i) => ({ id: crypto.randomUUID ? crypto.randomUUID() : `scene-${i}`, name: s[0], duration: s[1], title: s[2], copy: s[3], preset: s[4], lat: [-6.2, -2.5, -6.2, -6.2, -6.2, -6.2][i], lon: [106.82, 117.5, 106.82, 106.82, 106.82, 106.82][i], zoom: [2.4, 1, 2.1, 3.6, 2.5, 1.4][i], markers: [], show: { gauge: true, house: true, chart: true } }));

  let scenes = defaults;
  let currentScene = 0;
  let countries = [];
  let countryNames = new Map();
  let selectedFeature = null;
  let currentProjection = null;
  let customGeo = null;
  let voiceFile = null;
  let voiceBuffer = null;
  let dataValues = [];
  let sourceText = '';
  let toastTimer = 0;
  let playback = null;
  let exportCanceled = false;
  let exportSnapshot = null;
  let animationTimeline = null;
  let dragOrigin = null;
  let draggedMap = false;

  function toast(message) {
    const node = $('toast'); node.textContent = message; node.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 2600);
  }
  function formatTime(seconds) {
    const safe = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
  }
  function totalDuration() { return scenes.reduce((sum, scene) => sum + Number(scene.duration || 0), 0); }
  function setStatus(message, kind = '') {
    $('mapStatus').textContent = message;
    $('mapStatus').className = `inline-status ${kind ? `geo-status-${kind}` : ''}`;
    $('stageMessage').textContent = message;
  }
  function sceneAtTime(time) {
    let offset = 0;
    for (let i = 0; i < scenes.length; i++) {
      const end = offset + Number(scenes[i].duration || 0);
      if (time < end || i === scenes.length - 1) return { index: i, offset, local: Math.max(0, time - offset), duration: Number(scenes[i].duration || 0) };
      offset = end;
    }
    return { index: 0, offset: 0, local: 0, duration: 0 };
  }
  function readCamera() {
    const scene = scenes[currentScene];
    scene.lat = Number($('cameraLat').value) || 0;
    scene.lon = Number($('cameraLon').value) || 0;
    scene.zoom = Number($('cameraZoom').value) || 1;
  }
  function writeCamera(scene) {
    $('cameraLat').value = Number(scene.lat ?? -6.2).toFixed(2);
    $('cameraLon').value = Number(scene.lon ?? 106.82).toFixed(2);
    $('cameraZoom').value = scene.zoom ?? 2.4;
    $('zoomValue').value = `${Number(scene.zoom ?? 2.4).toFixed(1)}×`;
  }
  function countryName(feature) { return feature.properties?.name || feature.properties?.nmprov || feature.properties?.ADMIN || feature.properties?.admin || 'Wilayah'; }
  function activeMarkers() {
    const scene = scenes[currentScene];
    if (!Array.isArray(scene.markers)) scene.markers = [];
    return scene.markers;
  }

  function renderMap() {
    if (!window.d3) return;
    let focus = customGeo || selectedFeature;
    if (!focus) return;
    const bounds = d3.geoBounds(focus);
    const span = Math.max(Math.abs(bounds[1][0] - bounds[0][0]), Math.abs(bounds[1][1] - bounds[0][1]));
    // fitExtent divides by the feature's bounds; points and zero-width lines need a finite fallback.
    const projection = span < 1e-5
      ? d3.geoMercator().center(d3.geoCentroid(focus)).scale(1200).translate([270, 433])
      : d3.geoMercator().fitExtent([[44, 206], [496, 660]], focus);
    const geoPath = d3.geoPath(projection);
    const camera = scenes[currentScene];
    const center = projection([Number(camera.lon) || 0, Number(camera.lat) || 0]) || [270, 433];
    const scale = Number(camera.zoom) || 1;
    const tx = 270 - center[0] * scale;
    const ty = 433 - center[1] * scale;
    currentProjection = projection;
    d3.select('#worldShape').attr('d', countries.length ? geoPath({ type: 'FeatureCollection', features: countries }) : '');
    d3.select('#selectedShape').attr('d', geoPath(focus));
    d3.select('#mapCamera').attr('transform', `translate(${tx},${ty}) scale(${scale})`);
    $('regionLabel').textContent = `${customGeo ? customGeo.properties?.name || 'GeoJSON' : countryName(focus)} · PETA ILUSTRASI`;
    $('assetRegion').textContent = customGeo ? (customGeo.properties?.name || 'GeoJSON impor') : countryName(focus);
    renderMarkers();
    $('stageLoading').classList.add('hidden');
  }
  function renderMarkers() {
    if (!currentProjection) return;
    const camera = scenes[currentScene];
    const scale = Number(camera.zoom) || 1;
    const projectedCenter = currentProjection([Number(camera.lon) || 0, Number(camera.lat) || 0]) || [270, 433];
    const tx = 270 - projectedCenter[0] * scale, ty = 433 - projectedCenter[1] * scale;
    const items = activeMarkers();
    const group = d3.select('#markerLayer').selectAll('g.marker-pin').data(items, d => d.id);
    group.exit().remove();
    const enter = group.enter().append('g').attr('class', 'marker-pin');
    enter.append('circle').attr('r', 6);
    enter.append('text').attr('x', 10).attr('y', 3);
    enter.merge(group).attr('transform', d => {
      const p = currentProjection([Number(d.lon), Number(d.lat)]) || [270, 433];
      return `translate(${tx + p[0] * scale},${ty + p[1] * scale})`;
    }).select('text').text(d => d.label);
    $('assetMarkerCount').textContent = `${items.length} penanda`;
    renderMarkerEditor();
  }
  function chooseFeature(name) {
    if (!name) return;
    customGeo = null;
    selectedFeature = countries.find(f => countryName(f) === name) || countries.find(f => f.id === name);
    if (!selectedFeature) return;
    const centroid = d3.geoCentroid(selectedFeature);
    readCamera();
    scenes.forEach(scene => { scene.lon = centroid[0]; scene.lat = centroid[1]; });
    scenes[currentScene].zoom = 1;
    writeCamera(scenes[currentScene]);
    renderMap();
  }
  function fitRegion() {
    if (!selectedFeature && !customGeo) return;
    const center = d3.geoCentroid(customGeo || selectedFeature);
    scenes[currentScene].lat = center[1]; scenes[currentScene].lon = center[0]; scenes[currentScene].zoom = 1;
    writeCamera(scenes[currentScene]); renderMap();
  }

  function renderSceneList() {
    $('sceneList').replaceChildren();
    scenes.forEach((scene, index) => {
      const row = document.createElement('div'); row.className = `scene-item${index === currentScene ? ' active' : ''}`; row.tabIndex = 0; row.setAttribute('role', 'button'); row.setAttribute('aria-label', `Adegan ${String(index + 1).padStart(2, '0')}: ${scene.name}`);
      const number = document.createElement('span'); number.className = 'scene-number'; number.textContent = String(index + 1).padStart(2, '0');
      const meta = document.createElement('span'); meta.className = 'scene-meta';
      const title = document.createElement('strong'); title.textContent = scene.name;
      const detail = document.createElement('small'); detail.textContent = scene.preset.replace(/([A-Z])/g, ' $1');
      meta.append(title, detail);
      const order = document.createElement('span'); order.className = 'scene-order';
      const up = document.createElement('button'); up.type = 'button'; up.textContent = '↑'; up.setAttribute('aria-label', `Pindahkan ${scene.name} ke atas`); up.disabled = index === 0;
      const down = document.createElement('button'); down.type = 'button'; down.textContent = '↓'; down.setAttribute('aria-label', `Pindahkan ${scene.name} ke bawah`); down.disabled = index === scenes.length - 1;
      up.addEventListener('click', e => { e.stopPropagation(); moveScene(index, -1); }); down.addEventListener('click', e => { e.stopPropagation(); moveScene(index, 1); }); order.append(up, down);
      row.append(number, meta, order); row.addEventListener('click', () => selectScene(index));
      row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectScene(index); } });
      $('sceneList').append(row);
    });
  }
  function renderTimeline() {
    const track = $('timelineTrack'); track.replaceChildren();
    const total = totalDuration() || 1;
    scenes.forEach((scene, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = `timeline-scene${index === currentScene ? ' active' : ''}`;
      button.style.flex = `${Math.max(1, Number(scene.duration))} 1 0`; button.setAttribute('aria-label', `Ke adegan ${scene.name}, durasi ${scene.duration} detik`);
      const n = document.createElement('span'); n.className = 'timeline-scene-num'; n.textContent = String(index + 1).padStart(2, '0');
      const body = document.createElement('span'); body.className = 'timeline-scene-body';
      const name = document.createElement('strong'); name.textContent = scene.name;
      const dur = document.createElement('small'); dur.textContent = `${scene.duration} detik`;
      body.append(name, dur); button.append(n, body); button.addEventListener('click', () => selectScene(index)); track.append(button);
    });
    const cursor = document.createElement('i'); cursor.className = 'timeline-cursor'; cursor.id = 'timelineCursor'; cursor.style.left = '0%'; track.append(cursor);
    $('timelineSceneCount').textContent = `${scenes.length} adegan`;
    $('timelineDuration').textContent = formatTime(total);
    $('totalTime').textContent = formatTime(total);
    $('timelineScrub').max = total;
    $('rulerEnd').textContent = formatTime(total);
  }
  function syncTimeline(time = 0) {
    $('timelineScrub').value = Math.min(time, totalDuration());
    $('currentTime').textContent = formatTime(time);
    const cursor = $('timelineCursor'); if (cursor) cursor.style.left = `${Math.min(100, time / Math.max(totalDuration(), 1) * 100)}%`;
  }
  function selectScene(index) {
    if (!scenes[index]) return;
    if (playback) stopPlayback();
    if (animationTimeline) animationTimeline.kill();
    animationTimeline = null;
    readCamera(); currentScene = index;
    const scene = scenes[index];
    $('sceneIndex').textContent = String(index + 1).padStart(2, '0');
    $('sceneTitle').value = scene.title; $('sceneCopy').value = scene.copy;
    $('sceneDuration').value = scene.duration; $('scenePreset').value = scene.preset;
    scene.show ||= { gauge: true, house: true, chart: true };
    $('showGauge').checked = scene.show.gauge !== false; $('showHouse').checked = scene.show.house !== false; $('showChart').checked = scene.show.chart !== false;
    writeCamera(scene); renderMap(); renderText(); renderDataGraphics(); renderMarkers();
    if (currentProjection && window.gsap) { makeHighlight(); animateScene(scene, scene.duration); }
    $('frameNumber').textContent = `${String(index + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')}`;
    renderSceneList(); renderTimeline();
  }
  function moveScene(index, direction) {
    const next = index + direction;
    if (next < 0 || next >= scenes.length) return;
    [scenes[index], scenes[next]] = [scenes[next], scenes[index]];
    currentScene = next; selectScene(next); persistProject();
  }
  function renderText() {
    const scene = scenes[currentScene];
    $('mapTitle').textContent = scene.title;
    $('mapCopy').textContent = scene.copy;
  }
  function renderMarkerEditor() {
    const host = $('markerEditor'); host.replaceChildren();
    activeMarkers().forEach((marker, index) => {
      const row = document.createElement('div'); row.className = 'marker-row';
      const input = document.createElement('input'); input.value = marker.label; input.setAttribute('aria-label', `Nama penanda ${index + 1}`); input.maxLength = 36;
      input.addEventListener('input', () => {
        marker.label = input.value;
        d3.select('#markerLayer').selectAll('g.marker-pin').filter(item => item.id === marker.id).select('text').text(marker.label);
        persistSilent();
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Hapus penanda ${marker.label}`); remove.addEventListener('click', () => { activeMarkers().splice(index, 1); renderMarkers(); persistProject(); });
      row.append(input, remove); host.append(row);
    });
  }
  function renderDataGraphics() {
    const showGauge = scenes[currentScene]?.show?.gauge !== false, showHouse = scenes[currentScene]?.show?.house !== false, showChart = scenes[currentScene]?.show?.chart !== false;
    $('gaugeGroup').style.display = showGauge ? '' : 'none'; $('houseGroup').style.display = showHouse ? '' : 'none'; $('chartGroup').style.display = showChart ? '' : 'none';
    const valid = dataValues.filter(row => Number.isFinite(Number(row.value)) && row.value !== '');
    $('noData').hidden = valid.length > 0;
    $('chartEmpty').style.display = valid.length ? 'none' : '';
    const numeric = valid.map(row => Number(row.value));
    if (numeric.length) {
      const v = numeric[0]; $('gaugeValue').textContent = `${v}${valid[0].unit ? ` ${valid[0].unit}` : ''}`;
      const maximum = Math.max(...numeric.map(Math.abs), Math.abs(v), 1);
      $('gaugeArc').setAttribute('stroke-dashoffset', String(151 - 151 * Math.min(1, Math.abs(v) / maximum)));
      if (!window.d3) return;
      const barScale = d3.scaleLinear().domain([0, maximum]).range([10, 77]);
      const bars = d3.select('#chartBars').selectAll('g.data-bar').data(valid.slice(0, 5));
      bars.exit().remove(); const enter = bars.enter().append('g').attr('class', 'data-bar');
      enter.append('path').attr('stroke', '#df7950').attr('stroke-width', 11).attr('stroke-linecap', 'round');
      enter.append('text').attr('class', 'data-small').attr('text-anchor', 'middle');
      enter.merge(bars).each(function(row, index) {
        const x = 15 + index * 34, y = 105 - barScale(Math.abs(Number(row.value)));
        d3.select(this).select('path').attr('d', `M${x} 105V${y}`);
        d3.select(this).select('text').attr('x', x).attr('y', 122).text(row.label.slice(0, 7));
      });
    } else {
      $('gaugeValue').textContent = ''; $('gaugeArc').setAttribute('stroke-dashoffset', '151');
      if (window.d3) d3.select('#chartBars').selectAll('*').remove();
    }
  }
  function renderDataRows() {
    const host = $('dataRows'); host.replaceChildren();
    dataValues.forEach((row, index) => {
      const line = document.createElement('div'); line.className = 'data-row';
      const label = document.createElement('input'); label.value = row.label; label.placeholder = 'Etiket'; label.setAttribute('aria-label', `Nama angka ${index + 1}`); label.maxLength = 18;
      const value = document.createElement('input'); value.value = row.value; value.type = 'number'; value.placeholder = 'Nilai'; value.setAttribute('aria-label', `Nilai angka ${index + 1}`);
      const unit = document.createElement('input'); unit.value = row.unit || ''; unit.placeholder = 'Unit'; unit.setAttribute('aria-label', `Satuan angka ${index + 1}`); unit.maxLength = 8;
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Hapus angka ${row.label || index + 1}`);
      label.addEventListener('input', () => { row.label = label.value; renderDataGraphics(); });
      value.addEventListener('input', () => { row.value = value.value; renderDataGraphics(); });
      unit.addEventListener('input', () => { row.unit = unit.value; renderDataGraphics(); });
      remove.addEventListener('click', () => { dataValues.splice(index, 1); renderDataRows(); renderDataGraphics(); persistProject(); });
      line.append(label, value, unit, remove); host.append(line);
    });
  }

  function subtitleForTime(time) {
    const lines = $('subtitleScript').value.split(/\r?\n/).map(text => text.trim()).filter(Boolean);
    const stamped = lines.map(line => {
      const match = line.match(/^\[(\d{1,2}):(\d{2})\]\s*(.+)$/);
      return match ? { time: Number(match[1]) * 60 + Number(match[2]), text: match[3] } : null;
    });
    if (stamped.length && stamped.every(Boolean)) return stamped.filter(item => item.time <= time).at(-1)?.text || '';
    const sentences = $('subtitleScript').value.split(/(?<=[.!?])\s+/).map(text => text.trim()).filter(Boolean);
    if (!sentences.length || !totalDuration()) return '';
    const index = Math.min(sentences.length - 1, Math.floor(time / totalDuration() * sentences.length));
    return sentences[index];
  }
  function resetAnimationTargets() {
    if (animationTimeline) animationTimeline.kill();
    animationTimeline = null;
    gsap.set('#mapMotion', { transformOrigin: '270px 433px', scale: 1, x: 0, y: 0, opacity: 1 });
    gsap.set('#titleGroup', { y: 0, opacity: 1 }); gsap.set('#markerLayer .marker-pin', { scale: 1, transformOrigin: 'center', opacity: 1 });
    gsap.set('#highlightLayer', { opacity: 0 }); gsap.set('#gaugeArc', { attr: { 'stroke-dashoffset': 151 } });
    gsap.set('#houseGroup', { y: 0, opacity: 1 }); gsap.set('#chartGroup', { opacity: 1 });
    gsap.set('#subtitleGroup', { opacity: 0 });
  }
  function animateScene(scene, duration) {
    resetAnimationTargets();
    const tl = gsap.timeline({ paused: true });
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { animationTimeline = tl; return tl; }
    const end = Math.max(.8, Math.min(Number(duration) || scene.duration, Number(scene.duration) || 1));
    if (scene.preset === 'zoomIn') tl.fromTo('#mapMotion', { scale: .88 }, { scale: 1.12, duration: end * .72, ease: 'power2.out' });
    else if (scene.preset === 'zoomOut') tl.fromTo('#mapMotion', { scale: 1.16 }, { scale: .9, duration: end * .72, ease: 'power2.out' });
    else if (scene.preset === 'pan') tl.fromTo('#mapMotion', { x: -15 }, { x: 15, duration: end, ease: 'sine.inOut' });
    else if (scene.preset === 'marker') tl.fromTo('#markerLayer .marker-pin', { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: .65, stagger: .18, ease: 'back.out(2)' });
    else if (scene.preset === 'counter') {
      const rawValue = dataValues[0]?.value;
      const value = Number(rawValue);
      if (rawValue !== '' && rawValue != null && Number.isFinite(value)) {
        const counter = { value: 0 };
        tl.to(counter, { value, duration: Math.min(end, 2), ease: 'power1.out', onUpdate: () => { $('gaugeValue').textContent = `${counter.value.toFixed(0)}${dataValues[0]?.unit ? ` ${dataValues[0].unit}` : ''}`; } });
      } else tl.fromTo('#titleGroup', { y: 9, opacity: .25 }, { y: 0, opacity: 1, duration: .7, ease: 'power2.out' });
    } else if (scene.preset === 'gauge') {
      const valid = dataValues.filter(row => row.value !== '' && Number.isFinite(Number(row.value))).map(row => Math.abs(Number(row.value)));
      const maximum = Math.max(...valid, 1);
      const fill = valid.length ? 151 - 151 * Math.min(1, valid[0] / maximum) : 151;
      tl.fromTo('#gaugeArc', { attr: { 'stroke-dashoffset': 151 } }, { attr: { 'stroke-dashoffset': fill }, duration: Math.min(end, 1.8), ease: 'power2.out' });
    }
    else if (scene.preset === 'bounce') tl.fromTo('#titleGroup', { y: 24, opacity: .25 }, { y: 0, opacity: 1, duration: .75, ease: 'back.out(1.55)' });
    else if (scene.preset === 'icon') tl.fromTo('#houseGroup', { x: -24, opacity: 0 }, { x: 0, opacity: 1, duration: .8, ease: 'power2.out' });
    else if (scene.preset === 'highlight') tl.fromTo('#highlightLayer', { opacity: 0, scale: .65 }, { opacity: .8, scale: 1, duration: .8, ease: 'power2.out', transformOrigin: '270px 433px' });
    else if (scene.preset === 'transition') tl.fromTo('#mapMotion', { opacity: .15, scale: .88 }, { opacity: 1, scale: 1, duration: .9, ease: 'power2.out' });
    if ($('subtitleScript').value.trim()) tl.to('#subtitleGroup', { opacity: 1, duration: .35 }, Math.max(0, end * .12));
    animationTimeline = tl; return tl;
  }
  function makeHighlight() {
    if (!currentProjection) return;
    const layer = d3.select('#highlightLayer'); layer.selectAll('*').remove();
    const point = currentProjection ? currentProjection([Number(scenes[currentScene].lon), Number(scenes[currentScene].lat)]) : [270, 433];
    const s = scenes[currentScene].zoom || 1, center = currentProjection([Number(scenes[currentScene].lon), Number(scenes[currentScene].lat)]) || [270, 433];
    const x = 270 + (point[0] - center[0]) * s, y = 433 + (point[1] - center[1]) * s;
    layer.append('circle').attr('cx', x).attr('cy', y).attr('r', 45).attr('fill', '#f19b4b').attr('fill-opacity', .22).attr('stroke', '#e96f36').attr('stroke-width', 3);
  }
  async function waitFrame(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  function captureStage(canvas, ctx) {
    return new Promise((resolve, reject) => {
      const svg = $('mapSvg').cloneNode(true);
      svg.setAttribute('width', W); svg.setAttribute('height', H);
      const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      style.textContent = `.map-label{font:700 9px Arial,sans-serif;letter-spacing:1.2px;fill:#285b5b}.title-text{font:800 27px Arial,sans-serif;letter-spacing:-1.1px;fill:#193f40;stroke:#f4eee1;stroke-width:1.5px;paint-order:stroke;stroke-linejoin:round}.copy-text{font:600 11px Arial,sans-serif;fill:#335b58}.data-kicker{font:700 8px Arial,sans-serif;letter-spacing:1px;fill:#375754}.gauge-value{font:800 18px Arial,sans-serif;fill:#1f4746}.data-small{font:600 7px Arial,sans-serif;letter-spacing:.4px;fill:#5a716b}.subtitle-text{font:700 13px Arial,sans-serif;fill:#f6f1e7}.footer-mark{font:700 8px Arial,sans-serif;letter-spacing:1px;fill:#476965}.marker-pin circle{fill:#ee8143;stroke:#fff4da;stroke-width:2.4}.marker-pin text{font:700 12px Arial,sans-serif;fill:#173d3e;paint-order:stroke;stroke:#f4eee1;stroke-width:3;stroke-linejoin:round}`;
      svg.insertBefore(style, svg.firstChild);
      const markup = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => { ctx.clearRect(0, 0, W, H); ctx.drawImage(image, 0, 0, W, H); URL.revokeObjectURL(url); resolve(); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Pratinjau tidak dapat dirender ke frame video.')); };
      image.src = url;
    });
  }
  async function loadMediabunny() {
    return import('https://cdn.jsdelivr.net/npm/mediabunny@1.66.0/+esm');
  }
  function updateExportProgress(progress, message) {
    $('exportProgress').style.width = `${Math.max(0, Math.min(100, progress))}%`;
    $('exportPercent').textContent = `${Math.round(progress)}%`;
    if (message) $('exportMessage').textContent = message;
  }
  function openExport(message) {
    exportCanceled = false; $('exportOverlay').hidden = false; updateExportProgress(0, message);
  }
  function closeExport() { $('exportOverlay').hidden = true; }
  async function exportVideo() {
    if (!window.VideoEncoder) { toast('Browser ini belum menyediakan WebCodecs untuk ekspor MP4. Coba Chrome atau Edge terbaru.'); return; }
    if (playback) stopPlayback();
    exportSnapshot = { scene: currentScene, scenes: structuredClone(scenes), subtitle: $('subtitleScript').value };
    openExport('Menyiapkan encoder video…'); $('exportVideo').disabled = true;
    let output = null, audioContext = null;
    try {
      updateExportProgress(2, 'Memuat encoder MP4…');
      const mb = await loadMediabunny();
      if (exportCanceled) throw new Error('Ekspor dibatalkan.');
      const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d', { alpha: false });
      output = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.BufferTarget() });
      const videoSource = new mb.CanvasSource(canvas, { codec: 'avc', quality: new mb.Quality('high') });
      output.addVideoTrack(videoSource, { frameRate: FPS });
      let audioSource = null;
      if (voiceFile) {
        updateExportProgress(4, 'Membaca voice-over…');
        audioContext = new AudioContext();
        voiceBuffer = await audioContext.decodeAudioData(await voiceFile.arrayBuffer());
        audioSource = new mb.AudioBufferSource({ codec: 'aac', quality: new mb.Quality({ bitrate: 128000 }) });
        output.addAudioTrack(audioSource);
      }
      await output.start();
      if (audioSource) {
        const duration = totalDuration();
        let audio = voiceBuffer;
        if (voiceBuffer.duration > duration) {
          const frames = Math.floor(duration * voiceBuffer.sampleRate);
          audio = audioContext.createBuffer(voiceBuffer.numberOfChannels, frames, voiceBuffer.sampleRate);
          for (let channel = 0; channel < voiceBuffer.numberOfChannels; channel++) audio.copyToChannel(voiceBuffer.getChannelData(channel).subarray(0, frames), channel);
        }
        await audioSource.add(audio);
      }
      const totalFrames = Math.ceil(totalDuration() * FPS);
      let frame = 0, sceneStart = 0;
      for (let i = 0; i < scenes.length; i++) {
        if (exportCanceled) throw new Error('Ekspor dibatalkan.');
        currentScene = i; const scene = scenes[i];
        $('sceneTitle').value = scene.title; $('sceneCopy').value = scene.copy;
        $('sceneDuration').value = scene.duration; $('scenePreset').value = scene.preset;
        writeCamera(scene); renderMap(); renderText(); renderDataGraphics(); renderMarkers(); makeHighlight();
        $('frameNumber').textContent = `${String(i + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')}`;
        const sceneFrames = Math.ceil(Number(scene.duration) * FPS);
        const tl = animateScene(scene, scene.duration);
        for (let f = 0; f < sceneFrames; f++) {
          if (exportCanceled) throw new Error('Ekspor dibatalkan.');
          const localTime = f / FPS;
          tl.time(Math.min(localTime, tl.duration()), false);
          const globalTime = sceneStart + localTime;
          $('subtitleText').textContent = subtitleForTime(globalTime);
          syncTimeline(globalTime);
          await captureStage(canvas, ctx);
          await videoSource.add(frame / FPS, 1 / FPS);
          frame++;
          if (frame % 15 === 0) updateExportProgress(8 + frame / totalFrames * 82, `Merekam adegan ${i + 1} dari ${scenes.length}…`);
          await waitFrame(0);
        }
        sceneStart += Number(scene.duration);
      }
      updateExportProgress(92, 'Menyusun berkas MP4…');
      await output.finalize();
      if (exportCanceled) throw new Error('Ekspor dibatalkan.');
      const mp4 = new Blob([output.target.buffer], { type: 'video/mp4' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(mp4); link.download = `${($('projectTitle').value.trim() || 'geostudio-video').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}.mp4`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 5000);
      updateExportProgress(100, 'Video selesai diekspor.'); await waitFrame(500); closeExport(); toast('MP4 berhasil dibuat.');
    } catch (error) {
      console.error('GeoStudio export:', error);
      closeExport();
      if (error.message !== 'Ekspor dibatalkan.') toast(error.message || 'Ekspor gagal. Coba kurangi durasi atau gunakan browser desktop terbaru.');
      else toast('Ekspor dibatalkan.');
      if (output && output.state !== 'finalized' && output.state !== 'canceled') { try { await output.cancel(); } catch (_) {} }
    } finally {
      if (audioContext) await audioContext.close().catch(() => {});
      $('exportVideo').disabled = false;
      if (exportSnapshot) {
        scenes = exportSnapshot.scenes; currentScene = Math.min(exportSnapshot.scene, scenes.length - 1);
        $('subtitleScript').value = exportSnapshot.subtitle;
        selectScene(currentScene); $('subtitleText').textContent = '';
        exportSnapshot = null;
      }
    }
  }
  function togglePlayback() {
    if (playback) { stopPlayback(); return; }
    const start = Number($('timelineScrub').value) || 0;
    const initial = sceneAtTime(start);
    if (initial.index !== currentScene) selectScene(initial.index);
    if (!animationTimeline && window.gsap) { makeHighlight(); animateScene(scenes[currentScene], scenes[currentScene].duration); }
    if (animationTimeline) animationTimeline.time(Math.min(initial.local, animationTimeline.duration()));
    const endAt = performance.now() + (totalDuration() - start) * 1000;
    playback = { start, startAt: performance.now(), endAt, raf: 0 };
    $('previewPlay').innerHTML = '<span aria-hidden="true">Ⅱ</span> Jeda'; $('playPause').textContent = 'Ⅱ';
    function tick(now) {
      if (!playback) return;
      const time = Math.min(totalDuration(), playback.start + (now - playback.startAt) / 1000);
      const item = sceneAtTime(time);
      if (item.index !== currentScene) {
        currentScene = item.index; const scene = scenes[currentScene];
        $('sceneIndex').textContent = String(currentScene + 1).padStart(2, '0'); $('sceneTitle').value = scene.title; $('sceneCopy').value = scene.copy;
        $('sceneDuration').value = scene.duration; $('scenePreset').value = scene.preset; writeCamera(scene);
        renderText(); renderMap(); renderDataGraphics(); renderMarkers(); makeHighlight(); renderSceneList();
        $('frameNumber').textContent = `${String(currentScene + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')}`;
        animateScene(scene, scene.duration);
      }
      if (animationTimeline) animationTimeline.time(Math.min(item.local, animationTimeline.duration()));
      $('subtitleText').textContent = subtitleForTime(time); $('subtitleGroup').style.opacity = $('subtitleScript').value.trim() ? '1' : '0';
      syncTimeline(time);
      if (time >= totalDuration()) { stopPlayback(); syncTimeline(0); selectScene(0); return; }
      playback.raf = requestAnimationFrame(tick);
    }
    playback.raf = requestAnimationFrame(tick);
    if (voiceFile) {
      const player = $('voicePlayer');
      if (player) { player.currentTime = start; player.play().catch(() => {}); }
    }
  }
  function stopPlayback() {
    if (!playback) return;
    cancelAnimationFrame(playback.raf); playback = null;
    $('previewPlay').innerHTML = '<span aria-hidden="true">▶</span> Putar semua'; $('playPause').textContent = '▶';
    $('voicePlayer')?.pause();
  }
  function persistProject() {
    try {
      const project = { version: 1, title: $('projectTitle').value, scenes, currentScene, dataValues, sourceText, subtitle: $('subtitleScript').value, customGeo };
      localStorage.setItem(STORE_KEY, JSON.stringify(project)); toast('Proyek disimpan di browser ini.');
    } catch (error) { console.error(error); toast('Proyek tidak dapat disimpan. Berkas GeoJSON mungkin terlalu besar.'); }
  }
  function loadProject(project) {
    if (!project || !Array.isArray(project.scenes) || !project.scenes.length) throw new Error('Berkas ini bukan proyek GeoStudio yang dapat dibuka.');
    scenes = project.scenes; currentScene = Math.min(project.currentScene || 0, scenes.length - 1);
    scenes.forEach(scene => { scene.markers ||= structuredClone(project.markers || []); scene.show ||= { ...(project.show || { gauge: true, house: true, chart: true }) }; });
    dataValues = project.dataValues || []; sourceText = project.sourceText || '';
    $('projectTitle').value = project.title || 'GeoStudio'; $('subtitleScript').value = project.subtitle || '';
    $('dataSource').value = sourceText; customGeo = project.customGeo || null;
    if (customGeo) selectedFeature = customGeo;
    renderDataRows(); selectScene(currentScene); persistSilent();
  }
  function persistSilent() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ version: 1, title: $('projectTitle').value, scenes, currentScene, dataValues, sourceText, subtitle: $('subtitleScript').value, customGeo })); } catch (_) {}
  }
  function downloadProject() {
    const data = { version: 1, title: $('projectTitle').value, scenes, currentScene, dataValues, sourceText, subtitle: $('subtitleScript').value, customGeo };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'geostudio-project.json'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function bindEvents() {
    $('sceneTitle').addEventListener('input', () => { scenes[currentScene].title = $('sceneTitle').value; renderText(); renderSceneList(); renderTimeline(); });
    $('sceneCopy').addEventListener('input', () => { scenes[currentScene].copy = $('sceneCopy').value; renderText(); });
    $('sceneDuration').addEventListener('change', () => { scenes[currentScene].duration = Math.max(1, Math.min(60, Number($('sceneDuration').value) || 1)); $('sceneDuration').value = scenes[currentScene].duration; renderTimeline(); });
    $('scenePreset').addEventListener('change', () => { scenes[currentScene].preset = $('scenePreset').value; renderSceneList(); });
    ['cameraLat', 'cameraLon', 'cameraZoom'].forEach(id => $(id).addEventListener('input', () => { readCamera(); $('zoomValue').value = `${Number($('cameraZoom').value).toFixed(1)}×`; renderMap(); }));
    $('countrySelect').addEventListener('change', () => chooseFeature($('countrySelect').value));
    $('geojsonFile').addEventListener('change', async event => {
      const file = event.target.files?.[0]; if (!file) return;
      try {
        const raw = JSON.parse(await file.text());
        if (!raw || typeof raw !== 'object') throw new Error('Isi berkas harus berupa objek GeoJSON.');
        const fallbackName = file.name.replace(/\.(geo)?json$/i, '');
        let imported;
        if (raw.type === 'FeatureCollection' && Array.isArray(raw.features)) {
          const features = raw.features.filter(feature => feature?.type === 'Feature' && feature.geometry);
          if (!features.length) throw new Error('FeatureCollection tidak berisi geometri.');
          imported = { type: 'FeatureCollection', features };
        } else if (raw.type === 'Feature' && raw.geometry) imported = raw;
        else if (['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'].includes(raw.type)) {
          imported = { type: 'Feature', properties: { name: fallbackName }, geometry: raw };
        } else throw new Error('Tipe GeoJSON harus Feature, FeatureCollection, atau Geometry.');
        if (!window.d3) throw new Error('Pustaka peta belum termuat. Muat ulang halaman lalu coba lagi.');
        const bounds = d3.geoBounds(imported);
        if (!bounds.flat(2).every(Number.isFinite)) throw new Error('Koordinat GeoJSON tidak valid.');
        const centroid = d3.geoCentroid(imported);
        if (!centroid.every(Number.isFinite)) throw new Error('Koordinat GeoJSON tidak valid.');
        customGeo = imported; selectedFeature = imported; $('countrySelect').value = '';
        scenes[currentScene].lon = centroid[0]; scenes[currentScene].lat = centroid[1]; scenes[currentScene].zoom = 1;
        writeCamera(scenes[currentScene]); renderMap(); setStatus(`${file.name} dimuat.`, 'ready'); persistSilent();
      } catch (error) { console.error(error); const message = error.message || 'Berkas GeoJSON tidak dapat dibaca.'; setStatus(message, 'error'); toast(message); }
      event.target.value = '';
    });
    $('fitRegion').addEventListener('click', fitRegion);
    $('addMarker').addEventListener('click', () => addMarkerAtCamera());
    $('mapSvg').addEventListener('click', event => {
      if (draggedMap) { draggedMap = false; return; }
      if (event.target.closest('.marker-pin')) return;
      const p = d3.pointer(event, $('mapSvg'));
      if (p[0] < 22 || p[0] > 518 || p[1] < 185 || p[1] > 681) return;
      addMarkerAtCamera(p);
    });
    $('mapSvg').addEventListener('pointerdown', event => {
      if (event.target.closest('.marker-pin')) return;
      const p = d3.pointer(event, $('mapSvg')); if (p[1] < 185 || p[1] > 681) return;
      dragOrigin = { x: p[0], y: p[1], lat: Number(scenes[currentScene].lat), lon: Number(scenes[currentScene].lon), moved: false };
      $('mapSvg').setPointerCapture(event.pointerId);
    });
    $('mapSvg').addEventListener('pointermove', event => {
      if (!dragOrigin) return;
      const p = d3.pointer(event, $('mapSvg')); const dx = p[0] - dragOrigin.x, dy = p[1] - dragOrigin.y;
      if (Math.hypot(dx, dy) > 6) dragOrigin.moved = true;
      if (!dragOrigin.moved) return;
      const scale = Math.max(1, Number(scenes[currentScene].zoom) || 1);
      scenes[currentScene].lon = dragOrigin.lon - dx * .16 / scale;
      scenes[currentScene].lat = Math.max(-85, Math.min(85, dragOrigin.lat + dy * .12 / scale));
      writeCamera(scenes[currentScene]); renderMap();
    });
    $('mapSvg').addEventListener('pointerup', () => { if (dragOrigin?.moved) { draggedMap = true; readCamera(); persistSilent(); } dragOrigin = null; });
    $('markerEditor').addEventListener('input', () => persistSilent());
    [['showGauge', 'gauge'], ['showHouse', 'house'], ['showChart', 'chart']].forEach(([id, key]) => $(id).addEventListener('change', () => { scenes[currentScene].show[key] = $(id).checked; renderDataGraphics(); persistSilent(); }));
    $('addDataRow').addEventListener('click', () => { dataValues.push({ label: '', value: '', unit: '' }); renderDataRows(); renderDataGraphics(); });
    $('dataRows').addEventListener('input', persistSilent);
    $('dataSource').addEventListener('input', () => { sourceText = $('dataSource').value; persistSilent(); });
    $('subtitleScript').addEventListener('input', persistSilent);
    $('voiceoverFile').addEventListener('change', async event => {
      voiceFile = event.target.files?.[0] || null;
      if (!voiceFile) return;
      $('audioName').textContent = voiceFile.name; $('audioTrackName').textContent = voiceFile.name; $('audioTrackBody').classList.add('has-audio');
      let player = $('voicePlayer'); if (!player) { player = document.createElement('audio'); player.id = 'voicePlayer'; player.hidden = true; document.body.append(player); }
      player.src = URL.createObjectURL(voiceFile); player.preload = 'auto'; toast('Audio ditambahkan ke voice-over.');
    });
    $('previewPlay').addEventListener('click', togglePlayback); $('playPause').addEventListener('click', togglePlayback);
    $('timelineScrub').addEventListener('input', () => {
      const time = Number($('timelineScrub').value); const position = sceneAtTime(time);
      if (position.index !== currentScene) selectScene(position.index);
      if (animationTimeline) animationTimeline.time(Math.min(position.local, animationTimeline.duration()));
      $('subtitleText').textContent = subtitleForTime(time); $('subtitleGroup').style.opacity = $('subtitleScript').value.trim() ? '1' : '0'; syncTimeline(time);
    });
    $('jumpStart').addEventListener('click', () => { stopPlayback(); syncTimeline(0); selectScene(0); });
    $('jumpEnd').addEventListener('click', () => { stopPlayback(); syncTimeline(totalDuration()); selectScene(scenes.length - 1); });
    $('addScene').addEventListener('click', () => {
      readCamera(); const scene = { ...scenes[currentScene], markers: structuredClone(activeMarkers()), show: { ...scenes[currentScene].show }, id: crypto.randomUUID ? crypto.randomUUID() : `scene-${Date.now()}`, name: 'Adegan baru', duration: 4, preset: 'transition' };
      scenes.splice(currentScene + 1, 0, scene); selectScene(currentScene + 1); $('sceneTitle').focus();
    });
    $('removeScene').addEventListener('click', () => {
      if (scenes.length <= 1) { toast('Proyek harus memiliki setidaknya satu adegan.'); return; }
      scenes.splice(currentScene, 1); currentScene = Math.max(0, currentScene - 1); selectScene(currentScene); persistSilent();
    });
    $('saveProject').addEventListener('click', persistProject);
    $('exportProject').addEventListener('click', downloadProject);
    $('importProject').addEventListener('change', async event => {
      const file = event.target.files?.[0]; if (!file) return;
      try { loadProject(JSON.parse(await file.text())); toast('Berkas proyek dibuka.'); }
      catch (error) { toast(error.message || 'Berkas proyek tidak dapat dibuka.'); }
      event.target.value = '';
    });
    document.querySelectorAll('.asset-tab').forEach(tab => tab.addEventListener('click', () => {
      document.querySelectorAll('.asset-tab').forEach(el => { const on = el === tab; el.classList.toggle('active', on); el.setAttribute('aria-selected', String(on)); });
      ['visual', 'data', 'notes'].forEach(name => $(`${name}Tab`).classList.toggle('hidden', name !== tab.dataset.tab));
    }));
    $('recenterMap').addEventListener('click', () => { $('cameraLat').focus(); $('cameraLat').scrollIntoView({ block: 'center', behavior: 'smooth' }); });
    $('focusMarkers').addEventListener('click', () => { $('markerEditor').scrollIntoView({ block: 'center', behavior: 'smooth' }); $('addMarker').focus(); });
    $('exportVideo').addEventListener('click', exportVideo);
    $('cancelExport').addEventListener('click', () => { exportCanceled = true; $('exportMessage').textContent = 'Membatalkan ekspor…'; });
    $('projectMenu').addEventListener('click', downloadProject);
    $('projectTitle').addEventListener('input', persistSilent);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') { if (playback) stopPlayback(); if (!$('exportOverlay').hidden) exportCanceled = true; } });
  }
  function addMarkerAtCamera(point) {
    let lat = Number(scenes[currentScene].lat), lon = Number(scenes[currentScene].lon);
    if (point && currentProjection) {
      const scene = scenes[currentScene], scale = Number(scene.zoom) || 1;
      const center = currentProjection([Number(scene.lon) || 0, Number(scene.lat) || 0]) || [270, 433];
      const projectedPoint = [(point[0] - 270) / scale + center[0], (point[1] - 433) / scale + center[1]];
      const coordinate = currentProjection.invert(projectedPoint);
      if (coordinate) { lon = coordinate[0]; lat = coordinate[1]; }
    }
    const items = activeMarkers();
    items.push({ id: crypto.randomUUID ? crypto.randomUUID() : `marker-${Date.now()}`, label: `Lokasi ${items.length + 1}`, lat, lon });
    renderMarkers(); persistSilent(); toast('Penanda ditambahkan pada pusat kamera.');
  }
  function loadCountries() {
    const data = window.GEOSTUDIO_PROVINCES;
    if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length) {
      throw new Error('Data peta lokal tidak ditemukan. Pastikan assets/js/geostudio-data.js tersedia.');
    }
    return data.features.map(feature => ({ ...feature, properties: { ...feature.properties, name: countryName(feature) } }));
  }
  async function init() {
    bindEvents(); renderSceneList(); renderTimeline(); renderMarkerEditor(); renderDataRows(); renderDataGraphics(); selectScene(0);
    try {
      if (!window.d3 || !window.gsap) throw new Error('Pustaka D3 atau GSAP tidak termuat. Periksa koneksi internet.');
      const saved = localStorage.getItem(STORE_KEY); if (saved) loadProject(JSON.parse(saved));
      setStatus('Memuat batas provinsi Indonesia dari data lokal…');
      countries = loadCountries();
      const select = $('countrySelect'); select.replaceChildren(new Option('Pilih wilayah…', ''));
      countries.slice().sort((a, b) => countryName(a).localeCompare(countryName(b), 'id')).forEach(feature => select.add(new Option(countryName(feature), countryName(feature))));
      const indonesia = { type: 'FeatureCollection', properties: { name: 'Indonesia' }, features: countries };
      const persistedGeo = exportSnapshot?.customGeo;
      if (customGeo || persistedGeo) { selectedFeature = customGeo || persistedGeo; }
      else { selectedFeature = indonesia; }
      if (selectedFeature && !customGeo) {
        select.value = countryName(selectedFeature);
        if (currentScene === 0 && scenes[0].lat === -6.2 && scenes[0].lon === 106.82 && scenes[0].zoom === 2.4) scenes[0].zoom = 2.4;
      }
      renderMap(); setStatus(`${countries.length} provinsi Indonesia siap dari data lokal.`, 'ready');
      selectScene(currentScene);
      $('stageLoading').classList.add('hidden');
      $('subtitleText').textContent = subtitleForTime(0);
    } catch (error) {
      console.error('GeoStudio basemap:', error);
      setStatus(error.message || 'Peta dunia gagal dimuat.', 'error');
      $('stageMessage').textContent = 'Peta gagal dimuat. Periksa pustaka peta dan berkas data lokal.';
      $('stageLoading').classList.remove('hidden');
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();
