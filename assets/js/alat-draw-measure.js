  // ==============================================================
  // ALAT GAMBAR & UKUR: POINT, LINE, POLYGON, AREA, JARAK, LUAS
  // ==============================================================
  const drawLayerGroup = L.featureGroup().addTo(map);
  const measureLayerGroup = L.featureGroup().addTo(map);
  let drawControl = null;
  let measureMode = null;
  let measurePoints = [];
  let measurePolyline = null;
  let measurePolygon = null;
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

  function formatArea(sqMeters) {
    if (sqMeters >= 1000000) return `${(sqMeters / 1000000).toFixed(3)} km²`;
    if (sqMeters >= 10000) return `${(sqMeters / 10000).toFixed(2)} ha`;
    return `${sqMeters.toFixed(1)} m²`;
  }

  function setMeasureResult(message) {
    const el = document.getElementById('alatMeasureResult');
    if (el) el.textContent = message;
  }

  function startDraw(type) {
    if (!window.L.Draw) {
      setMeasureResult('⚠️ Plugin Leaflet.draw belum dimuat.');
      return;
    }
    // Hentikan mode ukur jika aktif.
    stopMeasureMode();

    if (drawControl) map.removeControl(drawControl);

    const options = {
      position: 'topright',
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

    // Aktifkan mode gambar yang dipilih.
    const handlerMap = {
      marker: 'marker',
      polyline: 'polyline',
      polygon: 'polygon',
      rectangle: 'rectangle',
      circle: 'circle'
    };
    const handler = drawControl._toolbars.draw._modes[handlerMap[type]].handler;
    handler.enable();
    setMeasureResult(`✏️ Klik pada peta untuk menggambar ${type}. Klik "Hapus Gambar" untuk membersihkan.`);
  }

  map.on(L.Draw.Event.CREATED, (e) => {
    const layer = e.layer;
    drawLayerGroup.addLayer(layer);
    // Tampilkan ukuran pada popup untuk poligon/garis.
    if (layer instanceof L.Polygon) {
      try {
        const latlngs = layer.getLatLngs()[0];
        const areaM2 = L.GeometryUtil.geodesicArea(latlngs);
        layer.bindPopup(`<b>Luas:</b> ${formatArea(areaM2)}`);
      } catch (err) {
        layer.bindPopup('Poligon');
      }
    } else if (layer instanceof L.Polyline) {
      const dist = L.GeometryUtil.length(layer);
      layer.bindPopup(`<b>Panjang:</b> ${formatDistance(dist)}`);
    } else if (layer instanceof L.Marker) {
      layer.bindPopup(`📍 ${layer.getLatLng().lat.toFixed(6)}, ${layer.getLatLng().lng.toFixed(6)}`);
    } else if (layer instanceof L.Circle) {
      const areaM2 = Math.PI * Math.pow(layer.getRadius(), 2);
      layer.bindPopup(`<b>Luas:</b> ${formatArea(areaM2)}<br><b>Jari-jari:</b> ${formatDistance(layer.getRadius())}`);
    }
  });

  // ---- Mode Ukur Jarak & Luas ----
  function startMeasure(mode) {
    if (drawControl) {
      map.removeControl(drawControl);
      drawControl = null;
    }
    stopMeasureMode();
    measureMode = mode;
    measurePoints = [];
    measureLayerGroup.clearLayers();
    setMeasureResult(mode === 'distance'
      ? '📏 Klik titik pertama pada peta. Klik titik berikutnya untuk menambah. Klik titik terakhir untuk selesai.'
      : '📐 Klik titik untuk membentuk area. Klik titik terakhir untuk menutup poligon.');
  }

  function stopMeasureMode() {
    measureMode = null;
    measurePoints = [];
    if (measurePolyline) { measureLayerGroup.removeLayer(measurePolyline); measurePolyline = null; }
    if (measurePolygon) { measureLayerGroup.removeLayer(measurePolygon); measurePolygon = null; }
    if (measureTempLayer) { measureLayerGroup.removeLayer(measureTempLayer); measureTempLayer = null; }
  }

  map.on('click', (e) => {
    if (!measureMode) return;
    measurePoints.push(e.latlng);

    if (measureMode === 'distance') {
      if (measurePolyline) measureLayerGroup.removeLayer(measurePolyline);
      measurePolyline = L.polyline(measurePoints, { color: '#e74c3c', weight: 3 }).addTo(measureLayerGroup);
      const dist = L.GeometryUtil.length(measurePolyline);
      setMeasureResult(`📏 Jarak total: <b>${formatDistance(dist)}</b> (${measurePoints.length} titik). Klik titik baru untuk menambah.`);
    } else if (measureMode === 'area') {
      if (measurePoints.length >= 3) {
        if (measurePolygon) measureLayerGroup.removeLayer(measurePolygon);
        measurePolygon = L.polygon(measurePoints, { color: '#e67e22', weight: 2, fillColor: '#e67e22', fillOpacity: 0.3 }).addTo(measureLayerGroup);
        const areaM2 = L.GeometryUtil.geodesicArea(measurePolygon.getLatLngs()[0]);
        setMeasureResult(`📐 Luas: <b>${formatArea(areaM2)}</b> (${measurePoints.length} titik). Klik titik baru untuk menambah.`);
      } else {
        setMeasureResult(`📐 Klik ${3 - measurePoints.length} titik lagi untuk membentuk area.`);
      }
    }
  });

  function clearDrawings() {
    drawLayerGroup.clearLayers();
    measureLayerGroup.clearLayers();
    stopMeasureMode();
    if (drawControl) {
      map.removeControl(drawControl);
      drawControl = null;
    }
    setMeasureResult('🗑️ Semua gambar dan ukuran dihapus.');
  }

  function exportDrawings() {
    const features = [];
    drawLayerGroup.eachLayer(layer => {
      const geojson = layer.toGeoJSON();
      if (geojson) features.push(geojson);
    });
    if (!features.length) {
      setMeasureResult('⚠️ Tidak ada gambar untuk diexport.');
      return;
    }
    const collection = { type: 'FeatureCollection', features };
    const blob = new Blob([JSON.stringify(collection, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gambar-peta.geojson';
    a.click();
    URL.revokeObjectURL(url);
    setMeasureResult(`💾 ${features.length} fitur diexport sebagai GeoJSON.`);
  }
