  // ==============================================================
  // ALAT ANALISIS: MUAT GEOJSON & SHP KE PETA
  // ==============================================================
  const alatLayers = []; // [{ id, name, type, layer, geojson }]
  let alatLayerCounter = 0;

  function setAlatStatus(message, isError = false) {
    const status = document.getElementById('alatStatus');
    status.textContent = message;
    status.style.color = isError ? '#c0392b' : '#567';
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
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.textContent = map.hasLayer(item.layer) ? 'Sembunyikan' : 'Tampilkan';
      toggle.addEventListener('click', () => {
        if (map.hasLayer(item.layer)) map.removeLayer(item.layer);
        else item.layer.addTo(map);
        renderAlatLayerList();
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Hapus';
      remove.className = 'alat-remove-btn';
      remove.addEventListener('click', () => {
        map.removeLayer(item.layer);
        const idx = alatLayers.indexOf(item);
        if (idx > -1) alatLayers.splice(idx, 1);
        renderAlatLayerList();
      });
      card.append(name, meta, toggle, remove);
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
    setAlatStatus('🗑️ Semua layer analisis dihapus.');
  }
