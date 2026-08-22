  // Fetch Data Prakiraan Cuaca BMKG
  function focusWeatherLocation(data) {
    const lokasi = data.lokasi || {};
    const cuacaNow = data.data?.[0]?.cuaca?.[0]?.[0];
    const bmkgLat = Number(lokasi.lat);
    const bmkgLon = Number(lokasi.lon);
    if (!cuacaNow || !Number.isFinite(bmkgLat) || !Number.isFinite(bmkgLon)) return;

    const clickLat = window._lastClickLat;
    const clickLng = window._lastClickLng;
    const lat = (clickLat != null && Number.isFinite(clickLat)) ? clickLat : bmkgLat;
    const lon = (clickLng != null && Number.isFinite(clickLng)) ? clickLng : bmkgLon;

    window.currentWeatherData = { lokasi, cuaca: cuacaNow };
    updateInsightWeatherCard();

    if (mapClickMarker) {
      map.removeLayer(mapClickMarker);
      mapClickMarker = null;
    }
    selectedWeatherGroup.clearLayers();
    const icon = L.divIcon({
      className: 'custom-weather-marker selected-weather-marker',
      html: `<div class="weather-marker-icon"><img src="${escapeBMKGHTML(cuacaNow.image || '')}" alt=""><span>${escapeBMKGHTML(cuacaNow.t ?? '-')}°C</span></div>`,
      iconSize: [62, 70], iconAnchor: [31, 62], popupAnchor: [0, -62]
    });
    selectedWeatherMarker = L.marker([lat, lon], { icon, title: lokasi.desa || 'Lokasi cuaca', zIndexOffset: 1000 })
      .bindPopup(createBMKGPopup(lokasi, cuacaNow), { maxWidth: 290, className: 'bmkg-leaflet-popup' })
      .addTo(selectedWeatherGroup);

    map.setView([lat, lon], Math.max(map.getZoom(), 14), { animate: true });
    map.once('moveend', () => selectedWeatherMarker?.openPopup());
  }

  async function fetchWeatherBMKG(adm4Code, { focusMap = true } = {}) {
    const weatherContainer = document.getElementById('weather-content');
    weatherContainer.innerHTML = '<p style="font-size:12px; color:#666;">Memuat data cuaca BMKG...</p>';

    try {
      const response = await fetch(`https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${adm4Code}`);
      if (!response.ok) throw new Error('Gagal mengambil data cuaca');
      
      const result = await response.json();
      displayWeatherInfo(result);
      if (focusMap) focusWeatherLocation(result);
    } catch (error) {
      console.error('Error BMKG API:', error);
      weatherContainer.innerHTML = `<p style="color:red; font-size:12px;">Gagal memuat cuaca untuk kode: ${adm4Code}</p>`;
    }
  }

  function displayWeatherInfoLegacy(data) {
    const container = document.getElementById('weather-content');
    
    const lokasi = data.lokasi || {};
    const cuacaList = data.data?.[0]?.cuaca?.[0] || [];

    if (!cuacaList || cuacaList.length === 0) {
      container.innerHTML = '<p style="font-size:12px;">Data cuaca tidak tersedia untuk wilayah ini.</p>';
      return;
    }

    const current = cuacaList[0]; 

    let html = `
      <div class="weather-card">
        <h5 style="margin:0 0 4px 0; font-size:14px;">${lokasi.desa || 'Wilayah'}, ${lokasi.kecamatan || ''}</h5>
        <p style="margin:0; font-size:11px; color:#666;">${lokasi.kabkota || ''}, ${lokasi.provinsi || ''}</p>
        
        <div class="weather-main">
          <img src="${current.image}" alt="${current.weather_desc}" style="width:48px; height:48px;">
          <div>
            <div class="weather-temp">${current.t}°C</div>
            <div style="font-size:12px; font-weight:bold;">${current.weather_desc}</div>
          </div>
        </div>

        <div class="weather-item">
          <span>Kelembapan</span> <strong>${current.hu}%</strong>
        </div>
        <div class="weather-item">
          <span>Kecepatan Angin</span> <strong>${current.ws} km/jam</strong>
        </div>
        <div class="weather-item">
          <span>Arah Angin</span> <strong>${current.wd_to} (Dari ${current.wd})</strong>
        </div>
      </div>
      
      <h5 style="font-size:12px; margin:12px 0 6px 0;">Prakiraan Jam Berikutnya</h5>
      <div style="max-height:200px; overflow-y:auto;">
    `;

    cuacaList.slice(1, 6).forEach(item => {
      const jam = item.local_datetime ? item.local_datetime.split(' ')[1].substring(0, 5) : '-';
      html += `
        <div class="weather-forecast-item">
          <span style="color:#555;">${jam}</span>
          <img src="${item.image}" width="24" height="24" alt="${item.weather_desc}">
          <span style="max-width:90px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${item.weather_desc}</span>
          <strong>${item.t}°C</strong>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;
  }

  function buildTemperatureChart(forecastDays) {
    const allSlots = [];
    forecastDays.slice(0, 3).forEach((day, di) => {
      day.forEach(item => {
        const time = String(item.local_datetime || '').split(' ')[1]?.slice(0, 5) || '';
        const date = String(item.local_datetime || '').split(' ')[0] || '';
        const dayLabel = di === 0 ? 'Hari ini' : di === 1 ? 'Besok' : date.slice(8, 10) + '/' + date.slice(5, 7);
        allSlots.push({
          temp: Number(item.t) || 0,
          time,
          day: dayLabel,
          image: item.image || '',
          desc: item.weather_desc || ''
        });
      });
    });

    if (!allSlots.length) return '';

    const temps = allSlots.map(s => s.temp);
    const minT = Math.min(...temps) - 2;
    const maxT = Math.max(...temps) + 2;
    const range = maxT - minT || 1;

    const W = 700, H = 200, PAD_L = 35, PAD_R = 15, PAD_T = 25, PAD_B = 50;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;

    const getX = (i) => PAD_L + (i / Math.max(allSlots.length - 1, 1)) * chartW;
    const getY = (t) => PAD_T + (1 - (t - minT) / range) * chartH;

    const gridLines = [];
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const val = minT + (range * i / yTicks);
      const y = getY(val);
      gridLines.push(`<line x1="${PAD_L}" y1="${y}" x2="${W - PAD_R}" y2="${y}" stroke="#e8eef5" stroke-width="1"/>`);
      gridLines.push(`<text x="${PAD_L - 8}" y="${y + 4}" text-anchor="end" class="temp-chart-ylabel">${Math.round(val)}°</text>`);
    }

    let pathD = '', areaD = '';
    allSlots.forEach((s, i) => {
      const x = getX(i), y = getY(s.temp);
      pathD += (i === 0 ? 'M' : 'L') + `${x},${y} `;
      areaD += (i === 0 ? 'M' : 'L') + `${x},${y} `;
    });
    const lastX = getX(allSlots.length - 1);
    const firstX = getX(0);
    areaD += `L${lastX},${PAD_T + chartH} L${firstX},${PAD_T + chartH} Z`;

    const dots = allSlots.map((s, i) => {
      const x = getX(i), y = getY(s.temp);
      return `
        <circle cx="${x}" cy="${y}" r="3.5" fill="#fff" stroke="#1687d4" stroke-width="2" class="temp-chart-dot"/>
        <text x="${x}" y="${y - 9}" text-anchor="middle" class="temp-chart-val">${s.temp}°</text>
      `;
    }).join('');

    const xLabels = allSlots.map((s, i) => {
      const x = getX(i);
      const showDay = i === 0 || allSlots[i - 1]?.day !== s.day;
      return `
        <text x="${x}" y="${H - 22}" text-anchor="middle" class="temp-chart-xlabel">${s.time}</text>
        ${showDay ? `<text x="${x}" y="${H - 8}" text-anchor="middle" class="temp-chart-xday">${s.day}</text>` : ''}
      `;
    }).join('');

    const separators = [];
    for (let i = 1; i < allSlots.length; i++) {
      if (allSlots[i].day !== allSlots[i - 1].day) {
        const x = (getX(i - 1) + getX(i)) / 2;
        separators.push(`<line x1="${x}" y1="${PAD_T}" x2="${x}" y2="${PAD_T + chartH}" stroke="#c4d5e3" stroke-width="1" stroke-dasharray="4 3"/>`);
      }
    }

    return `
      <div class="temp-chart-container">
        <svg viewBox="0 0 ${W} ${H}" class="temp-chart-svg" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="tempAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#1687d4" stop-opacity="0.25"/>
              <stop offset="100%" stop-color="#1687d4" stop-opacity="0.02"/>
            </linearGradient>
          </defs>
          ${gridLines.join('')}
          ${separators.join('')}
          <path d="${areaD}" fill="url(#tempAreaGrad)"/>
          <path d="${pathD}" fill="none" stroke="#1687d4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          ${dots}
          ${xLabels}
        </svg>
      </div>
    `;
  }

  const escapeHTML = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);

  function classifyWeather(cuaca) {
    const t = Number(cuaca.t) || 0;
    const hu = Number(cuaca.hu) || 0;
    const ws = Number(cuaca.ws) || 0;
    const tcc = Number(cuaca.tcc) || 0;
    const wd = String(cuaca.wd_to || '');
    const desc = String(cuaca.weather_desc || '').toLowerCase();

    const isHujan = /hujan|rain|shower|drizzle/.test(desc);
    const isPetir = /petir|thunder/.test(desc);
    const isDeras = /lebat|heavy|deras/.test(desc);
    const isGerimis = /gerimis|drizzle|rata|light/.test(desc);
    const isMendung = /mendung|overcast|gelap/.test(desc);
    const isBerawan = /awan|cloudy|partly|mostly/.test(desc);
    const isCerah = /cerah|clear|sunny|sebagian/.test(desc);
    const isKabur = /kabur|haze|asap/.test(desc);

    let cuacaKlasifikasi, cuacaIcon, cuacaWarna;
    if (isPetir) { cuacaKlasifikasi = 'Hujan Petir'; cuacaIcon = '⛈️'; cuacaWarna = '#7b1fa2'; }
    else if (isDeras) { cuacaKlasifikasi = 'Hujan Deras'; cuacaIcon = '🌧️'; cuacaWarna = '#1565c0'; }
    else if (isHujan || isGerimis) { cuacaKlasifikasi = 'Hujan Ringan'; cuacaIcon = '🌦️'; cuacaWarna = '#0277bd'; }
    else if (isMendung) { cuacaKlasifikasi = 'Mendung'; cuacaIcon = '☁️'; cuacaWarna = '#546e7a'; }
    else if (isBerawan) { cuacaKlasifikasi = 'Berawan'; cuacaIcon = '⛅'; cuacaWarna = '#37474f'; }
    else if (isKabur) { cuacaKlasifikasi = 'Berkabut'; cuacaIcon = '🌫️'; cuacaWarna = '#78909c'; }
    else if (isCerah) { cuacaKlasifikasi = 'Cerah'; cuacaIcon = '☀️'; cuacaWarna = '#f57f17'; }
    else { cuacaKlasifikasi = cuaca.weather_desc || '-'; cuacaIcon = '🌤️'; cuacaWarna = '#00897b'; }

    let suhuKlasifikasi, suhuIcon, suhuWarna;
    if (t >= 35) { suhuKlasifikasi = 'Sangat Panas'; suhuIcon = '🔥'; suhuWarna = '#d32f2f'; }
    else if (t >= 30) { suhuKlasifikasi = 'Panas'; suhuIcon = '🌡️'; suhuWarna = '#e65100'; }
    else if (t >= 25) { suhuKlasifikasi = 'Hangat'; suhuIcon = '😊'; suhuWarna = '#f9a825'; }
    else if (t >= 20) { suhuKlasifikasi = 'Sejuk'; suhuIcon = '🍃'; suhuWarna = '#2e7d32'; }
    else { suhuKlasifikasi = 'Dingin'; suhuIcon = '🥶'; suhuWarna = '#1565c0'; }

    let kelembabanKlasifikasi, kelembabanIcon, kelembabanWarna;
    if (hu >= 85) { kelembabanKlasifikasi = 'Sangat Lembap'; kelembabanIcon = '💧'; kelembabanWarna = '#0d47a1'; }
    else if (hu >= 70) { kelembabanKlasifikasi = 'Lembap'; kelembabanIcon = '💦'; kelembabanWarna = '#0277bd'; }
    else if (hu >= 50) { kelembabanKlasifikasi = 'Normal'; kelembabanIcon = '✅'; kelembabanWarna = '#2e7d32'; }
    else if (hu >= 30) { kelembabanKlasifikasi = 'Kering'; kelembabanIcon = '🍂'; kelembabanWarna = '#e65100'; }
    else { kelembabanKlasifikasi = 'Sangat Kering'; kelembabanIcon = '🏜️'; kelembabanWarna = '#bf360c'; }

    let anginKlasifikasi, anginIcon, anginWarna;
    if (ws >= 40) { anginKlasifikasi = 'Kencang'; anginIcon = '🌪️'; anginWarna = '#b71c1c'; }
    else if (ws >= 25) { anginKlasifikasi = 'Agak Kencang'; anginIcon = '💨'; anginWarna = '#e65100'; }
    else if (ws >= 12) { anginKlasifikasi = 'Sedang'; anginIcon = '🌬️'; anginWarna = '#00897b'; }
    else if (ws >= 5) { anginKlasifikasi = 'Ringan'; anginIcon = '🍃'; anginWarna = '#2e7d32'; }
    else { anginKlasifikasi = 'Tenang'; anginIcon = '😴'; anginWarna = '#78909c'; }

    let awanKlasifikasi, awanIcon, awanWarna;
    if (tcc >= 80) { awanKlasifikasi = 'Tertutup Awan'; awanIcon = '☁️'; awanWarna = '#455a64'; }
    else if (tcc >= 50) { awanKlasifikasi = 'Berawan Tebal'; awanIcon = '🌥️'; awanWarna = '#546e7a'; }
    else if (tcc >= 20) { awanKlasifikasi = 'Berawan Sebagian'; awanIcon = '⛅'; awanWarna = '#00897b'; }
    else { awanKlasifikasi = 'Langit Cerah'; awanIcon = '☀️'; awanWarna = '#f57f17'; }

    const insights = [];

    if (isHujan) {
      if (isDeras) insights.push('Hujan sedang deras saat ini, sebaiknya siapkan payung atau jas hujan jika harus keluar.');
      else if (isPetir) insights.push('Hujan disertai petir, hindari aktivitas di luar ruangan dan jauhi area terbuka.');
      else insights.push('Hujan ringan sedang turun, bring a payung just in case.');
    } else if (isCerah) {
      insights.push('Cuaca cerah, cocok untuk aktivitas luar ruangan.');
    } else if (isBerawan) {
      insights.push('Langit berawan, cuaca masih nyaman untuk beraktivitas.');
    } else if (isMendung) {
      insights.push('Langit mendung, waspada potensi hujan mendadak.');
    } else if (isKabur) {
      insights.push('Terlihat berkabut, berhati-hatilah saat berkendara.');
    }

    if (t >= 34) insights.push('Suhu cukup panas, minum air yang cukup dan hindari paparan matahari langsung.');
    else if (t <= 20) insights.push('Suhu terasa dingin, jaket atau sweater bisa jadi pilihan yang tepat.');

    if (hu >= 85) insights.push('Kelembapan sangat tinggi, udara terasa pengat.');
    else if (hu <= 35) insights.push('Udara cukup kering, gunakan pelembap kulit jika perlu.');

    if (ws >= 30) insights.push('Angin bertiup cukup kencang, waspada benda ringan yang beterbangan.');

    const kalimatAlam = insights.length ? insights[0] : `Kondisi ${cuacaKlasifikasi.toLowerCase()} saat ini.`;

    return {
      cuaca: { label: cuacaKlasifikasi, icon: cuacaIcon, warna: cuacaWarna },
      suhu: { label: suhuKlasifikasi, icon: suhuIcon, warna: suhuWarna },
      kelembaban: { label: kelembabanKlasifikasi, icon: kelembabanIcon, warna: kelembabanWarna },
      angin: { label: anginKlasifikasi, icon: anginIcon, warna: anginWarna },
      awan: { label: awanKlasifikasi, icon: awanIcon, warna: awanWarna },
      kalimatAlam
    };
  }

  function buildWeatherInsightsHTML(cuaca) {
    const c = classifyWeather(cuaca);
    const badge = (label, icon, warna) => `<span class="wi-badge" style="background:${warna}15; color:${warna}; border:1px solid ${warna}30">${icon} ${escapeHTML(label)}</span>`;
    return `
      <div class="weather-insights">
        <div class="wi-kalimat">${escapeHTML(c.kalimatAlam)}</div>
        <div class="wi-badges">
          ${badge(c.cuaca.label, c.cuaca.icon, c.cuaca.warna)}
          ${badge(c.suhu.label, c.suhu.icon, c.suhu.warna)}
          ${badge(c.kelembaban.label, c.kelembaban.icon, c.kelembaban.warna)}
          ${badge(c.angin.label, c.angin.icon, c.angin.warna)}
          ${badge(c.awan.label, c.awan.icon, c.awan.warna)}
        </div>
      </div>`;
  }

  window.buildWeatherInsightsHTML = buildWeatherInsightsHTML;

  function updateInsightWeatherCard() {
    const body = document.getElementById('insightWeatherBody');
    if (!body) return;
    const data = window.currentWeatherData;
    if (!data) return;
    const { lokasi, cuaca } = data;
    if (!cuaca) return;

    const temp = cuaca.t ?? '-';
    const desc = cuaca.weather_description || cuaca.weather || '-';
    const image = cuaca.image || '';
    const kelembaban = cuaca.hu ?? cuaca.humidity ?? '-';
    const angin = cuaca.ws ?? cuaca.windspeed ?? '-';
    const kota = lokasi.kota || lokasi.desa || 'Indonesia';

    body.innerHTML = `
      <div class="insight-weather-main">
        <div class="insight-weather-left">
          <div class="insight-weather-temp">${temp}°</div>
          ${image ? `<img src="${escapeHTML(image)}" alt="" class="insight-weather-icon" />` : ''}
        </div>
        <div class="insight-weather-right">
          <div class="insight-weather-desc">${escapeHTML(desc)}</div>
          <div class="insight-weather-detail">💧 ${kelembaban}% · 💨 ${angin} km/j</div>
          <div class="insight-weather-detail">📍 ${escapeHTML(kota)}</div>
        </div>
      </div>
    `;
  }

  window.updateInsightWeatherCard = updateInsightWeatherCard;

  function displayWeatherInfo(data) {
    const container = document.getElementById('weather-content');
    const lokasi = data.lokasi || {};
    const forecastDays = (data.data?.[0]?.cuaca || []).filter(day => Array.isArray(day) && day.length);

    if (!forecastDays.length) {
      container.innerHTML = '<p style="font-size:12px;">Data cuaca tidak tersedia untuk wilayah ini.</p>';
      return;
    }

    const current = forecastDays[0][0];
    window.currentWeatherData = { lokasi, cuaca: current };
    updateInsightWeatherCard();
    const formatTime = datetime => String(datetime || '').split(' ')[1]?.slice(0, 5) || '-';
    const formatDay = (datetime, index) => {
      const date = new Date(`${String(datetime || '').split(' ')[0]}T00:00:00`);
      if (Number.isNaN(date.getTime())) return `Hari ke-${index + 1}`;
      const label = date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' });
      return index === 0 ? `Hari ini · ${label}` : label;
    };

    const allSlots = [];
    forecastDays.slice(0, 3).forEach(day => {
      day.forEach(item => allSlots.push(Number(item.t) || 0));
    });
    const minTemp = Math.min(...allSlots);
    const maxTemp = Math.max(...allSlots);

    let html = `
      <section class="weather-panel" style="color:#fff">
        <div class="weather-hero">
          <p class="weather-hero-location">${escapeHTML(lokasi.desa || 'Wilayah')}, ${escapeHTML(lokasi.kecamatan || '')}</p>
          <p class="weather-hero-region">${escapeHTML(lokasi.kabkota || '')}, ${escapeHTML(lokasi.provinsi || '')}</p>
          <div class="weather-now">
            <img src="${escapeHTML(current.image || '')}" alt="${escapeHTML(current.weather_desc || 'Cuaca')}">
            <div><div class="weather-now-temp">${escapeHTML(current.t ?? '-')}°C</div><div class="weather-now-desc">${escapeHTML(current.weather_desc || 'Tidak tersedia')} · ${formatTime(current.local_datetime)}</div></div>
          </div>
          <div class="weather-metrics">
            <div class="weather-metric" style="color:#fff">Kelembapan<strong style="color:#fff">${escapeHTML(current.hu ?? '-')}%</strong></div>
            <div class="weather-metric" style="color:#fff">Angin<strong style="color:#fff">${escapeHTML(current.ws ?? '-')} km/j</strong></div>
            <div class="weather-metric" style="color:#fff">Awan<strong style="color:#fff">${escapeHTML(current.tcc ?? '-')}%</strong></div>
            <div class="weather-metric" style="color:#fff">Arah Angin<strong style="color:#fff">${escapeHTML(current.wd_to ?? '-')} (${escapeHTML(current.wd ?? '-')})</strong></div>
          </div>
        </div>

        ${buildWeatherInsightsHTML(current)}

        <div class="temp-chart-section">
          <div class="temp-chart-header">
            <h4 class="temp-chart-title">Grafik Suhu Prakiraan 3 Hari · per 3 jam</h4>
            <div class="temp-chart-legend">
              <span class="temp-chart-legend-item"><span class="temp-chart-legend-dot" style="background:#e74c3c"></span>${maxTemp}°</span>
              <span class="temp-chart-legend-item"><span class="temp-chart-legend-dot" style="background:#3498db"></span>${minTemp}°</span>
            </div>
          </div>
          ${buildTemperatureChart(forecastDays)}
        </div>

        <h4 class="weather-days-title" style="margin:16px 0 8px;padding:9px 12px;border-radius:10px;font-size:14px;font-weight:700;color:#fff;background:#0879bf">Prakiraan 3 Hari · per 3 jam</h4>
        <div class="weather-days-grid">
    `;

    forecastDays.slice(0, 3).forEach((day, dayIndex) => {
      const summary = day[Math.min(3, day.length - 1)] || day[0];
      html += `
        <article class="weather-day-card">
          <div class="weather-day-head"><span>${formatDay(day[0]?.local_datetime, dayIndex)}</span><span class="weather-day-summary">${escapeHTML(summary.weather_desc || '-')}</span></div>
          <div class="weather-slots">
            ${day.map(item => `<div class="weather-slot" title="${escapeHTML(item.weather_desc || '')}"><span>${formatTime(item.local_datetime)}</span><img src="${escapeHTML(item.image || '')}" alt=""><span class="weather-slot-temp">${escapeHTML(item.t ?? '-')}°</span></div>`).join('')}
          </div>
        </article>
      `;
    });

    html += `</div><p class="weather-source" style="margin-bottom: 60px">BMKG · diperbarui ${escapeHTML(current.local_datetime || '-')}</p></section>`;
    container.innerHTML = html;
  }
