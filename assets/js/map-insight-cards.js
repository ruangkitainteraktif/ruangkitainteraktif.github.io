// MAP INSIGHT CARDS — Cuaca & Gempa Hari Ini
  let quakeMarker = null;
  let _insightQuakeRadius = null;

  function initMapInsightCards() {
    loadInsightWeather();
    loadInsightQuake();
  }

  function loadInsightWeather() {
    const body = document.getElementById('insightWeatherBody');
    if (!body) return;

    if (window.currentWeatherData) {
      updateInsightWeatherCard();
      return;
    }

    body.innerHTML = '<div class="insight-loading">Pilih wilayah di tab Cuaca</div>';
  }

  async function loadInsightQuake() {
    const body = document.getElementById('insightQuakeBody');
    if (!body) return;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch('https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json', { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

      const gempa = result?.Infogempa?.gempa;
      if (!gempa) {
        body.innerHTML = '<div class="insight-quake-none">Tidak ada gempa terkini</div>';
        return;
      }

      window.currentQuakeData = gempa;

      const mag = parseFloat(gempa.Magnitude) || 0;
      let bgColor = '#10b981';
      if (mag >= 7) bgColor = '#dc2626';
      else if (mag >= 5) bgColor = '#f59e0b';
      else if (mag >= 4) bgColor = '#f97316';

      body.innerHTML = `
        <div class="insight-quake-main" style="cursor:pointer" id="quakeCardClickable">
          <div class="insight-quake-left">
            <div class="insight-quake-mag" style="color:${bgColor}">M${escapeGeoidHtml(String(mag))}</div>
            <div class="insight-quake-label">Magnitude</div>
          </div>
          <div class="insight-quake-right">
            <div class="insight-quake-place">${escapeGeoidHtml(gempa.Wilayah || 'Lokasi tidak diketahui')}</div>
            <div class="insight-quake-meta">📅 ${escapeGeoidHtml(gempa.Tanggal || '-')} · ⏰ ${escapeGeoidHtml(gempa.Jam || '-')}</div>
            <div class="insight-quake-meta">📏 Kedalaman ${escapeGeoidHtml(gempa.Kedalaman || '-')}</div>
          </div>
        </div>
      `;

      document.getElementById('quakeCardClickable')?.addEventListener('click', () => flyToQuake(gempa));
    } catch (err) {
      console.warn('Gagal memuat insight gempa:', err);
      if (err.name === 'AbortError') {
        body.innerHTML = '<div class="insight-loading">Timeout memuat data</div>';
      } else if (err instanceof TypeError) {
        body.innerHTML = '<div class="insight-loading">Gagal menghubungi server</div>';
      } else {
        body.innerHTML = '<div class="insight-loading">Gagal memuat data</div>';
      }
    }
  }

  function flyToQuake(gempa) {
    const coords = (gempa.Coordinates || '').split(',');
    const lat = parseFloat(coords[0]);
    const lon = parseFloat(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    if (quakeMarker) map.removeLayer(quakeMarker);
    if (_insightQuakeRadius) { map.removeLayer(_insightQuakeRadius); _insightQuakeRadius = null; }

    const mag = parseFloat(gempa.Magnitude) || 0;
    let color = '#22c55e';
    if (mag >= 7) color = '#991b1b';
    else if (mag >= 6) color = '#dc2626';
    else if (mag >= 5) color = '#ea580c';
    else if (mag >= 4) color = '#f59e0b';
    const size = Math.min(34, Math.max(20, 12 + mag * 3));

    const quakeIcon = L.divIcon({
      className: 'quake-marker-wrap',
      html: `
        <div class="quake-marker" style="--qm-size:${size}px; --qm-color:${color}">
          <div class="quake-marker-ring"></div>
          <div class="quake-marker-ring quake-marker-ring--delay"></div>
          <div class="quake-marker-core">
            <span class="quake-marker-mag">M${escapeGeoidHtml(String(mag))}</span>
          </div>
        </div>
      `,
      iconSize: [size + 16, size + 16],
      iconAnchor: [(size + 16) / 2, (size + 16) / 2],
      popupAnchor: [0, -(size / 2 + 10)]
    });

    quakeMarker = L.marker([lat, lon], { icon: quakeIcon, zIndexOffset: 2000 }).addTo(map);

    let radius = 50000;
    if (mag >= 7) radius = 800000;
    else if (mag >= 6) radius = 400000;
    else if (mag >= 5) radius = 200000;
    else if (mag >= 4) radius = 100000;
    _insightQuakeRadius = L.circle([lat, lon], {
      radius: radius,
      color: color,
      weight: 1.5,
      opacity: 0.7,
      fillColor: color,
      fillOpacity: 0.12
    }).addTo(map);

    const getMagnitudeLabel = (m) => {
      if (m < 4) return 'Ringan';
      if (m < 5) return 'Ringan';
      if (m < 6) return 'Sedang';
      if (m < 7) return 'Kuat';
      return 'Sangat Kuat';
    };

    const popupHtml = `
      <div class="quake-popup">
        <div class="quake-popup-head" style="background:linear-gradient(135deg, ${color}dd, ${color}99)">
          <div class="quake-popup-badge">
            <span class="quake-popup-dot" style="background:${color}"></span>
            ${getMagnitudeLabel(mag)}
          </div>
          <strong class="quake-popup-mag">M${escapeGeoidHtml(String(mag))}</strong>
          <span>${escapeGeoidHtml(gempa.Wilayah || 'Lokasi tidak diketahui')}</span>
        </div>
        <div class="quake-popup-body">
          <div class="quake-popup-meta">
            <div><span>Waktu</span><b>${escapeGeoidHtml(gempa.Tanggal || '-')} ${escapeGeoidHtml(gempa.Jam || '-')}</b></div>
            <div><span>Kedalaman</span><b>${escapeGeoidHtml(gempa.Kedalaman || '-')}</b></div>
            <div><span>Koordinat</span><b style="font-size:10px">${lat.toFixed(4)}, ${lon.toFixed(4)}</b></div>
            <div><span>Potensi</span><b style="color:${color}">${escapeGeoidHtml(gempa.Potensi || '-')}</b></div>
            ${gempa.Dirasakan ? `<div><span>Dirasakan</span><b style="font-size:10px; text-align:right; max-width:150px; white-space:normal; line-height:1.3">${escapeGeoidHtml(gempa.Dirasakan)}</b></div>` : ''}
          </div>
        </div>
      </div>
    `;

    quakeMarker.bindPopup(popupHtml, { maxWidth: 300, className: 'quake-leaflet-popup' });
    map.setView([lat, lon], Math.max(map.getZoom(), 10), { animate: true, duration: 1 });
    setTimeout(() => quakeMarker.openPopup(), 1100);
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initMapInsightCards, 800);
  });
