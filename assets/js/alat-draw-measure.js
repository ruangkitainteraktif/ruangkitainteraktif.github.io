const drawLayerGroup = L.featureGroup().addTo(map);
const measureLayerGroup = L.featureGroup().addTo(map);
let drawControl = null;
let measureMode = null;
let measurePoints = [];
let measurePolyline = null;
let measureCasingLayer = null;
let measurePolygon = null;
let measureExportLayer = null;
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

function setLayerMeasureData(layer, data) {
  if (layer) layer._measureData = Object.assign({}, layer._measureData || {}, data || {});
}

function areaMeasureData(areaM2, source) {
  return {
    measurement_type: 'area',
    source: source || 'measure',
    area_m2: areaM2,
    area_ha: areaM2 / 10000,
    area_km2: areaM2 / 1000000,
    area_display: formatArea(areaM2)
  };
}

function distanceMeasureData(distance, source) {
  return {
    measurement_type: 'distance',
    source: source || 'measure',
    length_m: distance,
    length_km: distance / 1000,
    length_display: formatDistance(distance)
  };
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
  measureExportLayer = null;
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
  measureExportLayer = measurePolyline;
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
  measureExportLayer = measurePolygon;
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
      setLayerMeasureData(layer, areaMeasureData(areaM2, 'draw'));
      layer.bindPopup(`<b>Luas:</b> ${formatArea(areaM2)}`);
    } catch (error) {
      layer.bindPopup('Poligon');
    }
  } else if (layer instanceof L.Polyline) {
    const distance = getMeasureDistance(layer.getLatLngs());
    setLayerMeasureData(layer, distanceMeasureData(distance, 'draw'));
    layer.bindPopup(`<b>Panjang:</b> ${formatDistance(distance)}`);
  } else if (layer instanceof L.Marker) {
    const point = layer.getLatLng();
    layer.bindPopup(`${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}`);
  } else if (layer instanceof L.Circle) {
    const areaM2 = Math.PI * Math.pow(layer.getRadius(), 2);
    setLayerMeasureData(layer, Object.assign(areaMeasureData(areaM2, 'draw'), {
      radius_m: layer.getRadius(),
      radius_display: formatDistance(layer.getRadius())
    }));
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
    setLayerMeasureData(measureExportLayer, distanceMeasureData(distance, 'measure'));
    updateMeasureHud(formatDistance(distance), `${measurePoints.length} titik`, false);
    setMeasureResult(`Jarak total: <b>${formatDistance(distance)}</b>. Klik Ukur Lagi untuk mengulang.`);
  } else {
    const areaM2 = L.GeometryUtil.geodesicArea(measurePolygon.getLatLngs()[0]);
    setLayerMeasureData(measureExportLayer, areaMeasureData(areaM2, 'measure'));
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
    setLayerMeasureData(measureExportLayer, distanceMeasureData(distance, 'measure'));
    const canFinish = measurePoints.length >= 2;
    updateMeasureHud(canFinish ? formatDistance(distance) : '—', `${measurePoints.length} titik`, canFinish);
    setMeasureResult(canFinish
      ? `Jarak total: <b>${formatDistance(distance)}</b>. Klik Selesai atau tambahkan titik.`
      : 'Klik titik berikutnya untuk mengukur jarak.');
  } else {
    renderAreaGeometry();
    if (measurePoints.length >= 3) {
      const areaM2 = L.GeometryUtil.geodesicArea(measurePolygon.getLatLngs()[0]);
      setLayerMeasureData(measureExportLayer, areaMeasureData(areaM2, 'measure'));
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

function getLayerMeasureData(layer) {
  if (!layer) return null;
  let data = Object.assign({}, layer._measureData || {});
  try {
    if (layer instanceof L.Polygon) {
      const latlngs = layer.getLatLngs()[0];
      Object.assign(data, areaMeasureData(L.GeometryUtil.geodesicArea(latlngs), data.source || 'draw'));
    } else if (layer instanceof L.Polyline) {
      Object.assign(data, distanceMeasureData(getMeasureDistance(layer.getLatLngs()), data.source || 'draw'));
    } else if (layer instanceof L.Circle) {
      const areaM2 = Math.PI * Math.pow(layer.getRadius(), 2);
      Object.assign(data, areaMeasureData(areaM2, data.source || 'draw'), {
        radius_m: layer.getRadius(),
        radius_display: formatDistance(layer.getRadius())
      });
    }
  } catch (error) {
    return Object.keys(data).length ? data : null;
  }
  return Object.keys(data).length ? data : null;
}

function layerToExportGeoJSON(layer) {
  if (!layer || typeof layer.toGeoJSON !== 'function') return null;
  const geojson = layer.toGeoJSON();
  if (!geojson) return null;
  const data = getLayerMeasureData(layer);
  if (data) geojson.properties = Object.assign({}, geojson.properties || {}, data);
  return geojson;
}

function collectExportFeatures() {
  const features = [];
  drawLayerGroup.eachLayer(layer => {
    const geojson = layerToExportGeoJSON(layer);
    if (geojson) features.push(geojson);
  });
  if (measureExportLayer) {
    const geojson = layerToExportGeoJSON(measureExportLayer);
    if (geojson) features.push(geojson);
  }
  return features;
}

function downloadExportBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportDrawings() {
  const features = collectExportFeatures();
  if (!features.length) {
    setMeasureResult('Tidak ada gambar untuk diekspor.');
    return;
  }
  const collection = { type: 'FeatureCollection', features };
  const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/json' });
  downloadExportBlob(blob, 'gambar-peta.geojson');
  setMeasureResult(`${features.length} fitur diekspor sebagai GeoJSON.`);
}

function shpSafeProperties(properties) {
  const aliases = {
    measurement_type: 'meas_type',
    source: 'src',
    area_display: 'area_disp',
    length_display: 'len_disp',
    radius_display: 'rad_disp'
  };
  const result = {};
  Object.keys(properties || {}).forEach(key => {
    const name = aliases[key] || key.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 10);
    if (Object.prototype.hasOwnProperty.call(result, name)) return;
    let value = properties[key];
    if (value === null || value === undefined) value = '';
    if (typeof value === 'number' && !Number.isFinite(value)) value = '';
    if (typeof value === 'object') value = JSON.stringify(value);
    result[name] = value;
  });
  return result;
}

function featureForShp(feature) {
  return Object.assign({}, feature, {
    properties: shpSafeProperties(feature.properties)
  });
}

function shpTypesForFeatures(features) {
  const types = {};
  features.forEach(feature => {
    const type = feature && feature.geometry && feature.geometry.type;
    if (type === 'Point' || type === 'MultiPoint') types.point = 'points';
    if (type === 'LineString' || type === 'MultiLineString') types.polyline = 'lines';
    if (type === 'Polygon' || type === 'MultiPolygon') types.polygon = 'polygons';
  });
  return types;
}

async function exportDrawingsSHP() {
  if (typeof shpwrite === 'undefined') {
    setMeasureResult('Modul pembuat SHP belum siap. Muat ulang halaman lalu coba kembali.', true);
    return;
  }
  const features = collectExportFeatures();
  if (!features.length) {
    setMeasureResult('Tidak ada gambar atau pengukuran untuk diekspor.', true);
    return;
  }
  const types = shpTypesForFeatures(features);
  if (!Object.keys(types).length) {
    setMeasureResult('Geometry yang tersedia belum dapat diekspor ke SHP.', true);
    return;
  }
  try {
    setMeasureResult('Menyiapkan SHP ZIP…');
    const collection = {
      type: 'FeatureCollection',
      features: features.map(featureForShp)
    };
    const zipData = await shpwrite.zip(collection, {
      folder: 'gambar_peta',
      filename: 'gambar_peta',
      outputType: 'blob',
      types: types,
      prj: 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]'
    });
    const blob = zipData instanceof Blob ? zipData : new Blob([zipData], { type: 'application/zip' });
    downloadExportBlob(blob, 'gambar-peta-shp.zip');
    setMeasureResult(`${features.length} fitur diekspor sebagai SHP ZIP.`);
  } catch (error) {
    setMeasureResult('Gagal membuat SHP: ' + (error && error.message ? error.message : String(error)), true);
  }
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
