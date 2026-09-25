const drawLayerGroup = L.featureGroup().addTo(map);
const measureLayerGroup = L.featureGroup().addTo(map);
let drawControl = null;
let measureMode = null;
let measurePoints = [];
let measurePolyline = null;
let measureCasingLayer = null;
let measurePolygon = null;
let measureMarkerLayer = null;
let measureTempLayer = null;
let adminModalOpenedAt = 0;

function removeDrawControl() {
  if (drawControl) {
    map.removeControl(drawControl);
    drawControl = null;
  }
}

function formatDistance(meters) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${meters.toFixed(1)} m`;
}

function flattenLatLngs(value) {
  const points = [];
  function walk(item) {
    if (!item) return;
    if (typeof item.lat === 'number' && typeof item.lng === 'number') {
      points.push(item);
      return;
    }
    if (Array.isArray(item)) item.forEach(walk);
  }
  walk(value);
  return points;
}

function getMeasureDistance(points) {
  const flatPoints = flattenLatLngs(points);
  return flatPoints.slice(1).reduce((total, point, index) => (
    total + map.distance(flatPoints[index], point)
  ), 0);
}

function formatArea(sqMeters) {
  if (sqMeters >= 1000000) return `${(sqMeters / 1000000).toFixed(3)} km²`;
  if (sqMeters >= 10000) return `${(sqMeters / 10000).toFixed(2)} ha`;
  return `${sqMeters.toFixed(1)} m²`;
}

function setMeasureResult(message) {
  const sidebarResult = document.getElementById('alatMeasureResult');
  if (sidebarResult) sidebarResult.innerHTML = message || '';
  const hud = document.getElementById('measureHud');
  const hint = document.getElementById('measureHudHint');
  if (hud && !hud.hidden && hint) hint.innerHTML = message || '';
}

function getMeasureHud() {
  return document.getElementById('measureHud');
}

function showMeasureHud(mode) {
  const hud = getMeasureHud();
  if (!hud) return;
  const title = document.getElementById('measureHudTitle');
  const finish = document.getElementById('measureHudFinish');
  const remeasure = document.getElementById('measureHudRemeasure');
  const reset = document.getElementById('measureHudReset');
  const close = document.getElementById('measureHudClose');
  const value = document.getElementById('measureHudValue');
  const meta = document.getElementById('measureHudMeta');
  if (title) title.textContent = mode === 'area' ? 'Pengukuran Luas' : 'Pengukuran Jarak';
  if (value) value.textContent = '—';
  if (meta) meta.textContent = '0 titik';
  if (finish) {
    finish.hidden = false;
    finish.disabled = true;
    finish.textContent = 'Selesai';
  }
  if (remeasure) {
    remeasure.hidden = false;
    remeasure.disabled = true;
    remeasure.textContent = 'Ukur Lagi';
    remeasure.dataset.remeasureMode = '';
  }
  if (reset) reset.hidden = false;
  if (close) close.hidden = false;
  hud.hidden = false;
}

function updateMeasureHud(value, meta, canFinish) {
  const valueElement = document.getElementById('measureHudValue');
  const metaElement = document.getElementById('measureHudMeta');
  const finish = document.getElementById('measureHudFinish');
  const remeasure = document.getElementById('measureHudRemeasure');
  if (valueElement) valueElement.textContent = value;
  if (metaElement) metaElement.textContent = meta;
  if (finish) finish.disabled = !canFinish;
  if (remeasure) remeasure.disabled = !!measureMode;
}

function hideMeasureHud() {
  const hud = getMeasureHud();
  if (hud) hud.hidden = true;
}

function clearMeasureLayers() {
  if (measurePolyline) measureLayerGroup.removeLayer(measurePolyline);
  if (measureCasingLayer) measureLayerGroup.removeLayer(measureCasingLayer);
  if (measurePolygon) measureLayerGroup.removeLayer(measurePolygon);
  if (measureMarkerLayer) measureLayerGroup.removeLayer(measureMarkerLayer);
  if (measureTempLayer) measureLayerGroup.removeLayer(measureTempLayer);
  measurePolyline = null;
  measureCasingLayer = null;
  measurePolygon = null;
  measureMarkerLayer = null;
  measureTempLayer = null;
}

function renderMeasureMarkers() {
  measureMarkerLayer = L.layerGroup(measurePoints.map(point => L.circleMarker(point, {
    radius: 5,
    color: '#ffffff',
    weight: 2,
    fillColor: '#00a6d6',
    fillOpacity: 1
  }))).addTo(measureLayerGroup);
}

function renderDistanceGeometry() {
  clearMeasureLayers();
  if (!measurePoints.length) return;
  measureCasingLayer = L.polyline(measurePoints, {
    color: '#ffffff',
    weight: 8,
    opacity: 0.9,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(measureLayerGroup);
  measurePolyline = L.polyline(measurePoints, {
    color: '#00a6d6',
    weight: 4,
    opacity: 1,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(measureLayerGroup);
  renderMeasureMarkers();
}

function renderAreaGeometry() {
  clearMeasureLayers();
  renderMeasureMarkers();
  if (measurePoints.length < 3) return;
  measurePolygon = L.polygon(measurePoints, {
    color: '#00a6d6',
    weight: 3,
    fillColor: '#00a6d6',
    fillOpacity: 0.18
  }).addTo(measureLayerGroup);
}

function startDraw(type) {
  if (!window.L.Draw) {
    setMeasureResult('Plugin Leaflet.draw belum dimuat.');
    return;
  }
  stopMeasureMode();
  if (drawControl) map.removeControl(drawControl);
  const options = {
    position: 'bottomleft',
    draw: {
      marker: type === 'marker',
      polyline: type === 'polyline',
      polygon: type === 'polygon',
      rectangle: type === 'rectangle',
      circle: type === 'circle',
      circlemarker: false
    },
    edit: { featureGroup: drawLayerGroup }
  };
  drawControl = new L.Control.Draw(options);
  map.addControl(drawControl);
  setTimeout(() => {
    const element = document.querySelector('.leaflet-draw-section') || document.querySelector('.leaflet-draw-toolbar');
    if (element) {
      const control = element.closest('.leaflet-control');
      if (control) {
        control.style.bottom = '10px';
        control.style.top = 'auto';
      }
    }
  }, 50);
  const handlerMap = {
    marker: 'marker',
    polyline: 'polyline',
    polygon: 'polygon',
    rectangle: 'rectangle',
    circle: 'circle'
  };
  const handler = drawControl._toolbars.draw._modes[handlerMap[type]].handler;
  handler.enable();
  setMeasureResult(`Klik pada peta untuk menggambar ${type}. Gunakan Hapus Gambar untuk membersihkan.`);
}

map.on(L.Draw.Event.CREATED, event => {
  const layer = event.layer;
  drawLayerGroup.addLayer(layer);
  if (layer instanceof L.Polygon) {
    try {
      const latlngs = layer.getLatLngs()[0];
      const areaM2 = L.GeometryUtil.geodesicArea(latlngs);
      layer.bindPopup(`<b>Luas:</b> ${formatArea(areaM2)}`);
    } catch (error) {
      layer.bindPopup('Poligon');
    }
  } else if (layer instanceof L.Polyline) {
    const distance = getMeasureDistance(layer.getLatLngs());
    layer.bindPopup(`<b>Panjang:</b> ${formatDistance(distance)}`);
  } else if (layer instanceof L.Marker) {
    const point = layer.getLatLng();
    layer.bindPopup(`${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`);
  } else if (layer instanceof L.Circle) {
    const areaM2 = Math.PI * Math.pow(layer.getRadius(), 2);
    layer.bindPopup(`<b>Luas:</b> ${formatArea(areaM2)}<br><b>Jari-jari:</b> ${formatDistance(layer.getRadius())}`);
  }
});

function startMeasure(mode) {
  if (drawControl) {
    map.removeControl(drawControl);
    drawControl = null;
  }
  stopMeasureMode();
  measureMode = mode;
  measurePoints = [];
  measureLayerGroup.clearLayers();
  showMeasureHud(mode);
  setMeasureResult(mode === 'distance'
    ? 'Klik titik pertama pada peta.'
    : 'Klik titik untuk membentuk area.');
}

function finishMeasure() {
  if (!measureMode) return;
  if (measureMode === 'distance' && measurePoints.length < 2) {
    setMeasureResult('Tambahkan minimal dua titik untuk mengukur jarak.');
    return;
  }
  if (measureMode === 'area' && measurePoints.length < 3) {
    setMeasureResult('Tambahkan minimal tiga titik untuk mengukur luas.');
    return;
  }
  const finishedMode = measureMode;
  measureMode = null;
  const finish = document.getElementById('measureHudFinish');
  const remeasure = document.getElementById('measureHudRemeasure');
  if (finish) {
    finish.hidden = false;
    finish.disabled = true;
    finish.textContent = 'Selesai';
  }
  if (remeasure) {
    remeasure.hidden = false;
    remeasure.disabled = false;
    remeasure.dataset.remeasureMode = finishedMode;
  }
  if (finishedMode === 'distance') {
    const distance = getMeasureDistance(measurePoints);
    updateMeasureHud(formatDistance(distance), `${measurePoints.length} titik`, false);
    setMeasureResult(`Jarak total: <b>${formatDistance(distance)}</b>. Klik Ukur Lagi untuk mengulang.`);
  } else {
    const areaM2 = L.GeometryUtil.geodesicArea(measurePolygon.getLatLngs()[0]);
    updateMeasureHud(formatArea(areaM2), `${measurePoints.length} titik`, false);
    setMeasureResult(`Luas: <b>${formatArea(areaM2)}</b>. Klik Ukur Lagi untuk mengulang.`);
  }
}

function resetMeasure() {
  stopMeasureMode();
  setMeasureResult('');
}

function stopMeasureMode() {
  measureMode = null;
  measurePoints = [];
  clearMeasureLayers();
  hideMeasureHud();
}

function handleMeasureMapClick(event) {
  if (!measureMode) return;
  if (event.originalEvent && L.DomEvent && L.DomEvent.stopPropagation) {
    L.DomEvent.stopPropagation(event.originalEvent);
  }
  measurePoints.push(event.latlng);
  if (measureMode === 'distance') {
    renderDistanceGeometry();
    const distance = getMeasureDistance(measurePoints);
    const canFinish = measurePoints.length >= 2;
    updateMeasureHud(canFinish ? formatDistance(distance) : '—', `${measurePoints.length} titik`, canFinish);
    setMeasureResult(canFinish
      ? `Jarak total: <b>${formatDistance(distance)}</b>. Klik Selesai atau tambahkan titik.`
      : 'Klik titik berikutnya untuk mengukur jarak.');
  } else {
    renderAreaGeometry();
    if (measurePoints.length >= 3) {
      const areaM2 = L.GeometryUtil.geodesicArea(measurePolygon.getLatLngs()[0]);
      updateMeasureHud(formatArea(areaM2), `${measurePoints.length} titik`, true);
      setMeasureResult(`Luas: <b>${formatArea(areaM2)}</b>. Klik Selesai atau tambahkan titik.`);
    } else {
      updateMeasureHud('—', `${measurePoints.length} titik`, false);
      setMeasureResult(`Klik ${3 - measurePoints.length} titik lagi untuk membentuk area.`);
    }
  }
}

map.on('click', handleMeasureMapClick);

function clearDrawings() {
  drawLayerGroup.clearLayers();
  measureLayerGroup.clearLayers();
  stopMeasureMode();
  if (drawControl) {
    map.removeControl(drawControl);
    drawControl = null;
  }
  setMeasureResult('Semua gambar dan ukuran dihapus.');
}

function exportDrawings() {
  const features = [];
  drawLayerGroup.eachLayer(layer => {
    const geojson = layer.toGeoJSON();
    if (geojson) features.push(geojson);
  });
  if (!features.length) {
    setMeasureResult('Tidak ada gambar untuk diekspor.');
    return;
  }
  const collection = { type: 'FeatureCollection', features };
  const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'gambar-peta.geojson';
  link.click();
  URL.revokeObjectURL(url);
  setMeasureResult(`${features.length} fitur diekspor sebagai GeoJSON.`);
}

function bindMeasureHud() {
  const finish = document.getElementById('measureHudFinish');
  const remeasure = document.getElementById('measureHudRemeasure');
  const reset = document.getElementById('measureHudReset');
  const close = document.getElementById('measureHudClose');
  if (finish) finish.addEventListener('click', finishMeasure);
  if (remeasure) remeasure.addEventListener('click', () => {
    const mode = remeasure.dataset.remeasureMode;
    if (mode) startMeasure(mode);
  });
  if (reset) reset.addEventListener('click', resetMeasure);
  if (close) close.addEventListener('click', resetMeasure);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindMeasureHud);
} else {
  bindMeasureHud();
}
