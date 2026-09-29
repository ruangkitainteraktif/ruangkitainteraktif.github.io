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
let drawSessionActive = false;
let drawHideExportActions = false;

function setDrawHideExportActions(hidden) {
  drawHideExportActions = hidden === true;
}
window.setDrawHideExportActions = setDrawHideExportActions;

function removeDrawControl() {
  if (drawControl) {
    map.removeControl(drawControl);
    drawControl = null;
  }
}

function buildDrawActionsWrap() {
  const wrap = L.DomUtil.create('div', 'draw-actions-wrap');
  const actions = [
    {
      label: 'Export GeoJSON',
      className: 'geojson',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5z"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
      run: exportDrawings
    },
    {
      label: 'Export SHP',
      className: 'shp',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18v13H3z"/><path d="M3 7l3-4h12l3 4"/><path d="M8 11h8"/><path d="M8 15h5"/></svg>',
      run: exportDrawingsSHP
    }
  ];
  actions.forEach(action => {
    const button = L.DomUtil.create('button', `draw-actions-btn ${action.className}`, wrap);
    button.type = 'button';
    button.innerHTML = `${action.icon}<span class="draw-actions-label">${action.label}</span>`;
    button.title = action.label;
    button.setAttribute('aria-label', action.label);
    button.addEventListener('click', event => {
      event.preventDefault();
      action.run();
    });
  });
  L.DomEvent.disableClickPropagation(wrap);
  L.DomEvent.disableScrollPropagation(wrap);
  return wrap;
}

function addDrawActionsControl() {
  if (!drawControl) return;
  if (drawHideExportActions) return;
  const container = drawControl.getContainer ? drawControl.getContainer() : null;
  if (!container) return;
  container.insertBefore(buildDrawActionsWrap(), container.firstChild);
}

function isDrawSidebarOpen() {
  const sidebar = document.getElementById('drawSidebar');
  /* Sheet yang diminimalkan tetap menyisakan dm-sidebar-open, jadi kedua
     kelas dicek supaya sidebar yang cuma jadi chip tidak ikut dihitung
     sedang terbuka. */
  return !!sidebar && sidebar.classList.contains('dm-sidebar-open') &&
    !sidebar.classList.contains('dm-sidebar-minimized');
}

function syncDrawChrome() {
  const sessionActive = !!measureMode || drawSessionActive ||
    drawLayerGroup.getLayers().length > 0 || measureLayerGroup.getLayers().length > 0;
  document.body.classList.toggle('draw-chrome-hidden', !isDrawSidebarOpen() && !sessionActive);
}

/* Dipanggil dari luar (GeoFarm) untuk mengakhiri sesi gambar. Normalnya
   drawSessionActive direset oleh event draw:drawstop, tapi saat kontrol
   dicabut dari luar event itu tidak pernah menyala sehingga status sesi
   menggantung dan drawControl tetap menunjuk kontrol yang sudah dilepas --
   startDraw() berikutnya lalu mencoba removeControl() pada kontrol basi.
   Dipakai juga untuk menyembunyikan kembali chrome gambar. */
window.stopDrawSession = function () {
  drawSessionActive = false;
  stopMeasureMode();
  removeDrawControl();
  syncDrawChrome();
};

/* Memasukkan layer ke feature group gambar agar bisa ikut diedit dan dihapus
   lewat tool Gambar & Ukur, sama seperti polygon hasil menggambar.
   Dipakai GeoFarm untuk polygon hasil unggah file SHP/GeoJSON. */
window.addToDrawLayerGroup = function (layer) {
  if (!layer) return false;
  drawLayerGroup.addLayer(layer);
  syncDrawChrome();
  return true;
};

/* Pembaca feature group gambar, untuk tools di luar Gambar & Ukur yang
   butuh tahu polygon mana yang ada: GeoFarm Kalkulator Benih memakai ini
   untuk mengisi luas dari poligon terakhir. Dipakai karena
   addToDrawLayerGroup() di atas satu-satunya jalan resmi masuk ke
   drawLayerGroup, dan di situ polygon hasil unggah SHP/GeoJSON ikut
   masuk juga — kalau GeoFarm hanya mendengarkan L.Draw.Event.CREATED,
   polygon unggahan akan terlewat.

   Yang dikembalikan group aslinya, bukan salinan, supaya perubahan
   sesudahnya (gambar baru, hapus, edit simpul) tetap terlihat tanpa
   perlu memasang event listener tambahan. */
window.getDrawnLayers = function () {
  return drawLayerGroup.getLayers();
};

(function observeDrawSidebar() {
  const sidebar = document.getElementById('drawSidebar');
  if (!sidebar || typeof MutationObserver === 'undefined') return;
  new MutationObserver(syncDrawChrome).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
})();

syncDrawChrome();

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
  if (typeof window.geoArea !== 'undefined') return window.geoArea.lengthM(flatPoints);
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

function setMeasureResult(message, toastType) {
  const hud = document.getElementById('measureHud');
  const hint = document.getElementById('measureHudHint');
  if (hud && !hud.hidden && hint) hint.innerHTML = message || '';
  if (message && toastType && typeof window.showMapToast === 'function') {
    window.showMapToast(message, toastType === true || toastType === 'error' ? 'warn' : toastType);
  }
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
  removeDrawControl();
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
  addDrawActionsControl();
  drawSessionActive = true;
  syncDrawChrome();
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
      const areaM2 = geoArea.areaM2FromRings(latlngs);
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

  if (layer instanceof L.Polygon && !(layer instanceof L.Rectangle) && typeof window.registerDrawnPolygon === 'function') {
    try {
      window.registerDrawnPolygon(layer, geoArea.areaHaFromRings(layer.getLatLngs()[0]));
    } catch (error) {
      console.warn('[Polygon] Gagal menyiapkan analisis polygon:', error);
    }
  }
  syncDrawChrome();
});

map.on('draw:drawstop', () => {
  drawSessionActive = false;
  drawHideExportActions = false;
  syncDrawChrome();
});

map.on('draw:editstop draw:deleted', (event) => {
  // Layer yang dihapus lewat tool gambar harus ikut hilang dari panel GeoFarm,
  // kalau tidak kartunya tertinggal sebagai yatim di daftar.
  if (event && event.type === 'draw:deleted' && typeof window.removeGeoFarmItemsByLayers === 'function') {
    window.removeGeoFarmItemsByLayers(event.layers);
  }
  syncDrawChrome();
});

map.on('draw:edited', event => {
  if (typeof window.markPolygonStale !== 'function' || !event.layers) return;
  event.layers.eachLayer(layer => {
    try {
      window.markPolygonStale(layer);
    } catch (error) {
      console.warn('[Polygon] Gagal menandai polygon:', error);
    }
  });
});

function startMeasure(mode) {
  removeDrawControl();
  stopMeasureMode();
  measureMode = mode;
  measurePoints = [];
  measureLayerGroup.clearLayers();
  showMeasureHud(mode);
  setMeasureResult(mode === 'distance'
    ? 'Klik titik pertama pada peta.'
    : 'Klik titik untuk membentuk area.');
  syncDrawChrome();
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
    const areaM2 = geoArea.areaM2FromRings(measurePolygon.getLatLngs()[0]);
    setLayerMeasureData(measureExportLayer, areaMeasureData(areaM2, 'measure'));
    updateMeasureHud(formatArea(areaM2), `${measurePoints.length} titik`, false);
    setMeasureResult(`Luas: <b>${formatArea(areaM2)}</b>. Klik Ukur Lagi untuk mengulang.`);
  }
  syncDrawChrome();
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
  syncDrawChrome();
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
      ? `Jarak total: <b>${formatDistance(distance)}</b>`
      : 'Klik titik berikutnya untuk mengukur jarak.');
  } else {
    renderAreaGeometry();
    if (measurePoints.length >= 3) {
      const areaM2 = geoArea.areaM2FromRings(measurePolygon.getLatLngs()[0]);
      setLayerMeasureData(measureExportLayer, areaMeasureData(areaM2, 'measure'));
      updateMeasureHud(formatArea(areaM2), `${measurePoints.length} titik`, true);
      setMeasureResult(`Luas: <b>${formatArea(areaM2)}</b>`);
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
  removeDrawControl();
  setMeasureResult('Semua gambar dan ukuran dihapus.');
  syncDrawChrome();
}

function getLayerMeasureData(layer) {
  if (!layer) return null;
  let data = Object.assign({}, layer._measureData || {});
  try {
    if (layer instanceof L.Polygon) {
      const latlngs = layer.getLatLngs()[0];
      Object.assign(data, areaMeasureData(geoArea.areaM2FromRings(latlngs), data.source || 'draw'));
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
    setMeasureResult('Tidak ada gambar untuk diekspor.', 'error');
    return;
  }
  const collection = { type: 'FeatureCollection', features };
  const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/json' });
  downloadExportBlob(blob, 'gambar-peta.geojson');
  setMeasureResult(`${features.length} fitur diekspor sebagai GeoJSON.`, 'info');
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
    setMeasureResult(`${features.length} fitur diekspor sebagai SHP ZIP.`, 'info');
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
