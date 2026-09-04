  const EARTHQUAKE_ENDPOINTS = {
    latest: 'https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json',
    significant: 'https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json',
    felt: 'https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json'
  };
  let earthquakeLoaded = false;
  let earthquakeLatestData = null;
  let earthquakeSignificantData = [];
  let earthquakeFeltData = [];

  const significantLayerGroup = L.layerGroup();
  const feltLayerGroup = L.layerGroup();

  function getEarthquakeList(payload) {
    const gempa = payload?.Infogempa?.gempa;
    return Array.isArray(gempa) ? gempa : (gempa ? [gempa] : []);
  }

  function getMagnitudeColor(mag) {
    const m = parseFloat(mag) || 0;
    if (m >= 7) return '#991b1b';
    if (m >= 6) return '#dc2626';
    if (m >= 5) return '#ea580c';
    if (m >= 4) return '#f59e0b';
    return '#22c55e';
  }

  function getMagnitudeRadius(mag) {
    const m = parseFloat(mag) || 0;
    if (m >= 7) return 800000;
    if (m >= 6) return 400000;
    if (m >= 5) return 200000;
    if (m >= 4) return 100000;
    return 50000;
  }

  function getMagnitudeLabel(mag) {
    const m = parseFloat(mag) || 0;
    if (m < 4) return 'Ringan';
    if (m < 5) return 'Ringan';
    if (m < 6) return 'Sedang';
    if (m < 7) return 'Kuat';
    return 'Sangat Kuat';
  }

  function escapeBMKGHTML(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
  }

  function buildQuakeListPopupHtml(item, label) {
    const coords = (item.Coordinates || '').split(',');
    const lat = parseFloat(coords[0]);
    const lon = parseFloat(coords[1]);
    const mag = parseFloat(item.Magnitude) || 0;
    const color = getMagnitudeColor(mag);
    const feeling = item.Dirasakan || '-';
    const potensi = item.Potensi || '-';
    return `
      <div class="quake-popup">
        <div class="quake-popup-header">
          <div class="quake-popup-status">
            <span class="quake-popup-status-dot"></span>
            ${escapeBMKGHTML(label)}
          </div>
          <div class="quake-popup-region">${escapeBMKGHTML(item.Wilayah || 'Lokasi tidak diketahui')}</div>
        </div>
        <div class="quake-popup-mag-display">
          <div class="quake-popup-mag-circle" style="background:${color}">
            <span class="quake-popup-mag-num">${escapeBMKGHTML(mag)}</span>
            <span class="quake-popup-mag-label">MAG</span>
          </div>
          <div class="quake-popup-mag-info">
            <div class="quake-popup-potensi">${escapeBMKGHTML(potensi)}</div>
            <div class="quake-popup-time">${escapeBMKGHTML(item.Tanggal || '-')} · ${escapeBMKGHTML(item.Jam || '-')}</div>
          </div>
        </div>
        <div class="quake-popup-details">
          <div class="quake-popup-detail-item">
            <span class="quake-popup-detail-label">Kedalaman</span>
            <span class="quake-popup-detail-value">${escapeBMKGHTML(item.Kedalaman || '-')}</span>
          </div>
          <div class="quake-popup-detail-item">
            <span class="quake-popup-detail-label">Koordinat</span>
            <span class="quake-popup-detail-value">${Number.isFinite(lat) ? lat.toFixed(2) : '-'}, ${Number.isFinite(lon) ? lon.toFixed(2) : '-'}</span>
          </div>
        </div>
        ${feeling !== '-' ? `
        <div class="quake-popup-feeling">
          <div class="quake-popup-feeling-title">Dirasakan</div>
          <div class="quake-popup-feeling-text">${escapeBMKGHTML(feeling)}</div>
        </div>` : ''}
        <div class="quake-popup-footer">
          <span class="quake-popup-footer-text">Sumber: BMKG</span>
        </div>
      </div>`;
  }

  function placeQuakeListMarkers(items, layerGroup, label) {
    layerGroup.clearLayers();
    items.forEach(item => {
      const coords = (item.Coordinates || '').split(',');
      const lat = parseFloat(coords[0]);
      const lon = parseFloat(coords[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const mag = parseFloat(item.Magnitude) || 0;
      const color = getMagnitudeColor(mag);
      const radius = getMarkerRadius(mag);

      const marker = L.circleMarker([lat, lon], {
        radius: radius,
        color: color,
        weight: 1.5,
        opacity: 0.9,
        fillColor: color,
        fillOpacity: 0.7
      });

      marker.bindPopup(buildQuakeListPopupHtml(item, label), { maxWidth: 340, className: 'quake-leaflet-popup' });
      layerGroup.addLayer(marker);
    });
  }

  function getMarkerRadius(mag) {
    if (mag >= 7) return 12;
    if (mag >= 6) return 10;
    if (mag >= 5) return 8;
    if (mag >= 4) return 6;
    return 4;
  }

  function toggleSignificantMarkers(visible) {
    if (visible) {
      placeQuakeListMarkers(earthquakeSignificantData, significantLayerGroup, 'Gempa M 5.0+');
      if (!map.hasLayer(significantLayerGroup)) significantLayerGroup.addTo(map);
    } else {
      if (map.hasLayer(significantLayerGroup)) map.removeLayer(significantLayerGroup);
    }
  }

  function toggleFeltMarkers(visible) {
    if (visible) {
      placeQuakeListMarkers(earthquakeFeltData, feltLayerGroup, 'Gempa Dirasakan');
      if (!map.hasLayer(feltLayerGroup)) feltLayerGroup.addTo(map);
    } else {
      if (map.hasLayer(feltLayerGroup)) map.removeLayer(feltLayerGroup);
    }
  }

  function renderEarthquakeData(latest, significant, felt) {
    const container = document.getElementById('earthquake-content');
    if (!latest) {
      container.innerHTML = '<div class="quake-message">Data gempa terbaru belum tersedia.</div>';
      return;
    }
    earthquakeLatestData = latest;
    earthquakeSignificantData = significant;
    earthquakeFeltData = felt;

    const sigInfo = document.getElementById('significantMarkersInfo');
    const feltInfo = document.getElementById('feltMarkersInfo');
    if (sigInfo) sigInfo.textContent = significant.length + ' gempa M5+ terkini dari BMKG';
    if (feltInfo) feltInfo.textContent = felt.length + ' gempa dirasakan terkini dari BMKG';

    container.innerHTML = `
      <article class="quake-latest" onclick="flyToLatestEarthquake()" style="cursor:pointer" title="Klik untuk terbang ke lokasi gempa">
        <div class="quake-latest-main"><div class="quake-magnitude">M${escapeBMKGHTML(latest.Magnitude || '-')}</div><div><h5 class="quake-latest-title">Gempabumi Terbaru</h5><div class="quake-latest-place">${escapeBMKGHTML(latest.Wilayah || 'Lokasi tidak tersedia')}</div></div></div>
        <div class="quake-latest-details"><span>Waktu<b>${escapeBMKGHTML(latest.Jam || '-')}</b></span><span>Kedalaman<b>${escapeBMKGHTML(latest.Kedalaman || '-')}</b></span></div>
        <div class="quake-latest-potensi">Potensi: <b>${escapeBMKGHTML(latest.Potensi || '-')}</b></div>
      </article>
      <div class="quake-refresh-wrap"><button class="quake-refresh" type="button" onclick="loadEarthquakeData(true)">Muat ulang</button></div>`;

    placeLatestEarthquakeMarker(latest);
  }

  function placeLatestEarthquakeMarker(gempa) {
    if (typeof map === 'undefined' || !map) return;
    earthquakeMarkerGroup.clearLayers();

    const coords = (gempa.Coordinates || '').split(',');
    const lat = parseFloat(coords[0]);
    const lon = parseFloat(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const mag = parseFloat(gempa.Magnitude) || 0;
    const color = getMagnitudeColor(mag);
    const size = Math.min(34, Math.max(20, 12 + mag * 3));

    const quakeIcon = L.divIcon({
      className: 'quake-marker-wrap',
      html: `
        <div class="quake-marker" style="--qm-size:${size}px; --qm-color:${color}">
          <div class="quake-marker-ring"></div>
          <div class="quake-marker-ring quake-marker-ring--delay"></div>
          <div class="quake-marker-core">
            <span class="quake-marker-mag">M${escapeBMKGHTML(mag)}</span>
          </div>
        </div>
      `,
      iconSize: [size + 16, size + 16],
      iconAnchor: [(size + 16) / 2, (size + 16) / 2],
      popupAnchor: [0, -(size / 2 + 10)]
    });

    const marker = L.marker([lat, lon], { icon: quakeIcon, zIndexOffset: 2000 })
      .addTo(earthquakeMarkerGroup);

    const radius = getMagnitudeRadius(mag);
    L.circle([lat, lon], {
      radius: radius,
      color: color,
      weight: 1.5,
      opacity: 0.7,
      fillColor: color,
      fillOpacity: 0.12
    }).addTo(earthquakeMarkerGroup);

    const depth = gempa.Kedalaman || '-';
    const feeling = gempa.Dirasakan || '-';
    const potensi = gempa.Potensi || '-';
    const popupHtml = `
      <div class="quake-popup">
        <div class="quake-popup-header">
          <div class="quake-popup-status">
            <span class="quake-popup-status-dot"></span>
            Gempa Terbaru
          </div>
          <div class="quake-popup-region">${escapeBMKGHTML(gempa.Wilayah || 'Lokasi tidak diketahui')}</div>
        </div>
        <div class="quake-popup-mag-display">
          <div class="quake-popup-mag-circle" style="background:${color}">
            <span class="quake-popup-mag-num">${escapeBMKGHTML(mag)}</span>
            <span class="quake-popup-mag-label">MAG</span>
          </div>
          <div class="quake-popup-mag-info">
            <div class="quake-popup-potensi">${escapeBMKGHTML(potensi)}</div>
            <div class="quake-popup-time">${escapeBMKGHTML(gempa.Tanggal || '-')} · ${escapeBMKGHTML(gempa.Jam || '-')}</div>
          </div>
        </div>
        <div class="quake-popup-details">
          <div class="quake-popup-detail-item">
            <span class="quake-popup-detail-label">Kedalaman</span>
            <span class="quake-popup-detail-value">${escapeBMKGHTML(depth)}</span>
          </div>
          <div class="quake-popup-detail-item">
            <span class="quake-popup-detail-label">Koordinat</span>
            <span class="quake-popup-detail-value">${lat.toFixed(2)}, ${lon.toFixed(2)}</span>
          </div>
        </div>
        ${feeling !== '-' ? `
        <div class="quake-popup-feeling">
          <div class="quake-popup-feeling-title">Dirasakan</div>
          <div class="quake-popup-feeling-text">${escapeBMKGHTML(feeling)}</div>
        </div>` : ''}
        <div class="quake-popup-footer">
          <span class="quake-popup-footer-text">Sumber: BMKG</span>
        </div>
      </div>
    `;
    marker.bindPopup(popupHtml, { maxWidth: 340, className: 'quake-leaflet-popup' });
  }

  function flyToLatestEarthquake() {
    if (!earthquakeLatestData) return;
    const coords = (earthquakeLatestData.Coordinates || '').split(',');
    const lat = parseFloat(coords[0]);
    const lon = parseFloat(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    map.flyTo([lat, lon], 7, { duration: 1.2 });
  }

  function flyToEarthquake(coordinates, magnitude, wilayah, tanggal, jam, kedalaman, potensi) {
    const coords = (coordinates || '').split(',');
    const lat = parseFloat(coords[0]);
    const lon = parseFloat(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const mag = parseFloat(magnitude) || 0;
    const color = getMagnitudeColor(mag);
    const size = Math.min(34, Math.max(20, 12 + mag * 3));

    const quakeIcon = L.divIcon({
      className: 'quake-marker-wrap',
      html: `
        <div class="quake-marker" style="--qm-size:${size}px; --qm-color:${color}">
          <div class="quake-marker-ring"></div>
          <div class="quake-marker-ring quake-marker-ring--delay"></div>
          <div class="quake-marker-core">
            <span class="quake-marker-mag">M${escapeBMKGHTML(mag)}</span>
          </div>
        </div>
      `,
      iconSize: [size + 16, size + 16],
      iconAnchor: [(size + 16) / 2, (size + 16) / 2],
      popupAnchor: [0, -(size / 2 + 10)]
    });

    const marker = L.marker([lat, lon], { icon: quakeIcon, zIndexOffset: 2000 })
      .addTo(earthquakeMarkerGroup);

    const radius = getMagnitudeRadius(mag);
    L.circle([lat, lon], {
      radius: radius,
      color: color,
      weight: 1.5,
      opacity: 0.7,
      fillColor: color,
      fillOpacity: 0.12
    }).addTo(earthquakeMarkerGroup);

    const popupHtml = `
      <div class="quake-popup">
        <div class="quake-popup-header">
          <div class="quake-popup-status">
            <span class="quake-popup-status-dot"></span>
            Gempa Terbaru
          </div>
          <div class="quake-popup-region">${escapeBMKGHTML(wilayah || 'Lokasi tidak diketahui')}</div>
        </div>
        <div class="quake-popup-mag-display">
          <div class="quake-popup-mag-circle" style="background:${color}">
            <span class="quake-popup-mag-num">${escapeBMKGHTML(mag)}</span>
            <span class="quake-popup-mag-label">MAG</span>
          </div>
          <div class="quake-popup-mag-info">
            <div class="quake-popup-potensi">${escapeBMKGHTML(potensi || '-')}</div>
            <div class="quake-popup-time">${escapeBMKGHTML(tanggal || '-')} · ${escapeBMKGHTML(jam || '-')}</div>
          </div>
        </div>
        <div class="quake-popup-details">
          <div class="quake-popup-detail-item">
            <span class="quake-popup-detail-label">Kedalaman</span>
            <span class="quake-popup-detail-value">${escapeBMKGHTML(kedalaman || '-')}</span>
          </div>
          <div class="quake-popup-detail-item">
            <span class="quake-popup-detail-label">Koordinat</span>
            <span class="quake-popup-detail-value">${lat.toFixed(2)}, ${lon.toFixed(2)}</span>
          </div>
        </div>
        <div class="quake-popup-footer">
          <span class="quake-popup-footer-text">Sumber: BMKG</span>
        </div>
      </div>
    `;
    marker.bindPopup(popupHtml, { maxWidth: 340, className: 'quake-leaflet-popup' });

    map.flyTo([lat, lon], 7, { duration: 1.2 });
  }

  async function loadEarthquakeData(force = false) {
    if (earthquakeLoaded && !force) return;
    const container = document.getElementById('earthquake-content');
    container.innerHTML = '<div class="quake-message">Memuat data gempabumi BMKG...</div>';
    try {
      const responses = await Promise.all(Object.values(EARTHQUAKE_ENDPOINTS).map(async url => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }));
      const [latestPayload, significantPayload, feltPayload] = responses;
      renderEarthquakeData(getEarthquakeList(latestPayload)[0], getEarthquakeList(significantPayload), getEarthquakeList(feltPayload));
      earthquakeLoaded = true;

      const sigCb = document.getElementById('toggleSignificantMarkers');
      const feltCb = document.getElementById('toggleFeltMarkers');
      if (sigCb && !sigCb._bound) {
        sigCb._bound = true;
        sigCb.addEventListener('change', function () { toggleSignificantMarkers(this.checked); });
      }
      if (feltCb && !feltCb._bound) {
        feltCb._bound = true;
        feltCb.addEventListener('change', function () { toggleFeltMarkers(this.checked); });
      }
    } catch (error) {
      console.error('Gagal memuat data gempabumi BMKG:', error);
      container.innerHTML = '<div class="quake-message">Gagal memuat data gempa. Silakan coba muat ulang.</div>';
    }
  }

  window.quakeResetLayers = function () {
    const sigCb = document.getElementById('toggleSignificantMarkers');
    const feltCb = document.getElementById('toggleFeltMarkers');
    if (sigCb && sigCb.checked) { sigCb.checked = false; sigCb.dispatchEvent(new Event('change')); }
    if (feltCb && feltCb.checked) { feltCb.checked = false; feltCb.dispatchEvent(new Event('change')); }
  };
