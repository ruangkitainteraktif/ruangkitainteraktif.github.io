  const EARTHQUAKE_ENDPOINTS = {
    latest: 'https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json',
    significant: 'https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json',
    felt: 'https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json'
  };
  let earthquakeLoaded = false;
  let earthquakeLatestData = null;

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

  function renderEarthquakeCards(items, felt = false) {
    if (!items.length) return '<div class="quake-message">Data tidak tersedia.</div>';
    return items.map(item => `
      <article class="quake-card" onclick="flyToEarthquake('${escapeBMKGHTML(item.Coordinates || '')}', '${escapeBMKGHTML(item.Magnitude || '')}', '${escapeBMKGHTML(item.Wilayah || '')}', '${escapeBMKGHTML(item.Tanggal || '')}', '${escapeBMKGHTML(item.Jam || '')}', '${escapeBMKGHTML(item.Kedalaman || '')}', '${escapeBMKGHTML(item.Potensi || '')}')" style="cursor:pointer" title="Klik untuk terbang ke lokasi gempa">
        <div class="quake-card-mag" style="color:${getMagnitudeColor(item.Magnitude)}; background:${getMagnitudeColor(item.Magnitude)}15">M${escapeBMKGHTML(item.Magnitude || '-')}</div>
        <div>
          <div class="quake-card-place">${escapeBMKGHTML(item.Wilayah || 'Lokasi tidak tersedia')}</div>
          <div class="quake-card-meta">${escapeBMKGHTML(item.Tanggal || '-')} · ${escapeBMKGHTML(item.Jam || '-')}<br>${escapeBMKGHTML(item.Kedalaman || '-')} · ${escapeBMKGHTML(item.Lintang || '')}, ${escapeBMKGHTML(item.Bujur || '')}</div>
          ${felt && item.Dirasakan ? `<div class="quake-card-feel">Dirasakan: ${escapeBMKGHTML(item.Dirasakan)}</div>` : ''}
        </div>
      </article>`).join('');
  }

  function renderEarthquakeData(latest, significant, felt) {
    const container = document.getElementById('earthquake-content');
    if (!latest) {
      container.innerHTML = '<div class="quake-message">Data gempa terbaru belum tersedia.</div>';
      return;
    }
    earthquakeLatestData = latest;
    container.innerHTML = `
      <div class="quake-toolbar"><h4>Info Gempa Bumi</h4><button class="quake-refresh" type="button" onclick="loadEarthquakeData(true)">Muat ulang</button></div>
      <article class="quake-latest" onclick="flyToLatestEarthquake()" style="cursor:pointer" title="Klik untuk terbang ke lokasi gempa">
        <div class="quake-latest-main"><div class="quake-magnitude">M${escapeBMKGHTML(latest.Magnitude || '-')}</div><div><h5 class="quake-latest-title">Gempabumi Terbaru</h5><div class="quake-latest-place">${escapeBMKGHTML(latest.Wilayah || 'Lokasi tidak tersedia')}</div></div></div>
        <div class="quake-latest-details"><span>Waktu<b>${escapeBMKGHTML(latest.Jam || '-')}</b></span><span>Kedalaman<b>${escapeBMKGHTML(latest.Kedalaman || '-')}</b></span><span>Potensi<b>${escapeBMKGHTML(latest.Potensi || '-')}</b></span></div>
      </article>
      <section class="quake-section"><h5 class="quake-section-title">15 Gempa M 5.0+ <span class="quake-count">${significant.length} data</span></h5><div class="quake-list">${renderEarthquakeCards(significant)}</div></section>
      <section class="quake-section"><h5 class="quake-section-title">15 Gempa Dirasakan <span class="quake-count">${felt.length} data</span></h5><div class="quake-list">${renderEarthquakeCards(felt, true)}</div></section>
      <p class="quake-attribution">BMKG · diperbarui saat tab dibuka</p>`;

    // Tambahkan marker gempa terbaru ke peta
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
    const size = Math.min(60, Math.max(36, 24 + mag * 5));

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
      iconSize: [size + 30, size + 30],
      iconAnchor: [(size + 30) / 2, (size + 30) / 2],
      popupAnchor: [0, -(size / 2 + 15)]
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

    // Buka popup marker setelah fly selesai
    earthquakeMarkerGroup.eachLayer(layer => {
      if (layer instanceof L.Marker && layer.getLatLng) {
        const ll = layer.getLatLng();
        if (Math.abs(ll.lat - lat) < 0.001 && Math.abs(ll.lng - lon) < 0.001) {
          setTimeout(() => layer.openPopup(), 1200);
        }
      }
    });
  }

  function flyToEarthquake(coordinates, magnitude, wilayah, tanggal, jam, kedalaman, potensi) {
    const coords = (coordinates || '').split(',');
    const lat = parseFloat(coords[0]);
    const lon = parseFloat(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const mag = parseFloat(magnitude) || 0;
    const color = getMagnitudeColor(mag);
    const size = Math.min(60, Math.max(36, 24 + mag * 5));

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
      iconSize: [size + 30, size + 30],
      iconAnchor: [(size + 30) / 2, (size + 30) / 2],
      popupAnchor: [0, -(size / 2 + 15)]
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

    setTimeout(() => marker.openPopup(), 1300);
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
    } catch (error) {
      console.error('Gagal memuat data gempabumi BMKG:', error);
      container.innerHTML = '<div class="quake-message">Gagal memuat data gempa. Silakan coba muat ulang.</div>';
    }
  }
