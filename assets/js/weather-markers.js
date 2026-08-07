  // Generasi 38 Marker Cuaca Random di Peta
  function getRandomWeatherLocations(count) {
    const total = Math.min(count, weatherSearchLocations.length);
    const selected = [];
    const usedIndexes = new Set();

    while (selected.length < total) {
      const index = Math.floor(Math.random() * weatherSearchLocations.length);
      if (usedIndexes.has(index)) continue;
      usedIndexes.add(index);
      selected.push(weatherSearchLocations[index]);
    }
    return selected;
  }

  async function generate38RandomWeatherMarkersLegacy() {
    if (!weatherSearchLocations.length) return;

    weatherMarkersGroup.clearLayers();

    const selected38 = getRandomWeatherLocations(38);

    // Marker dibuat lebih dahulu agar 38 desa selalu terlihat di peta,
    // termasuk saat salah satu respons BMKG lambat atau gagal.
    selected38.forEach(item => {
      const kodeADM4 = item.kode;
      const lat = item.lat || item.latitude || (-6.8 - (Math.random() * 1.5));
      const lng = item.lng || item.longitude || (109.5 + (Math.random() * 2.5));
      const loadingIcon = L.divIcon({
        className: 'custom-weather-marker',
        html: '<div class="weather-marker-icon"><span>☁</span><span>Memuat</span></div>',
        iconSize: [74, 25],
        iconAnchor: [37, 12]
      });
      const marker = L.marker([lat, lng], { icon: loadingIcon, title: item.desa }).addTo(weatherMarkersGroup);
      marker.bindPopup(`<div style="font-size:12px; text-align:center;"><b>${item.desa}, ${item.kecamatan || '-'}</b><br><small>Memuat prakiraan cuaca...</small></div>`);

      fetch(`https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${kodeADM4}`)
        .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
        .then(data => {
          const cuacaNow = data.data?.[0]?.cuaca?.[0]?.[0];
          if (!cuacaNow) throw new Error('Prakiraan tidak tersedia');

          const customIcon = L.divIcon({
            className: 'custom-weather-marker',
            html: `
              <div class="weather-marker-icon">
                <img src="${cuacaNow.image}" alt="icon">
                <span>${cuacaNow.t}°C</span>
              </div>
            `,
            iconSize: [60, 25],
            iconAnchor: [30, 12]
          });
          marker.setIcon(customIcon);

          marker.bindPopup(`
            <div style="font-size:12px; text-align:center;">
              <b>${item.desa || 'Wilayah'}, ${item.kecamatan || ''}</b><br>
              <img src="${cuacaNow.image}" width="36" height="36"><br>
              <span style="font-size:14px; font-weight:bold;">${cuacaNow.t}°C</span> - ${cuacaNow.weather_desc}<br>
              <small>Kelembapan: ${cuacaNow.hu}% | Angin: ${cuacaNow.ws} km/j</small>
            </div>
          `);
        })
        .catch(() => {
          marker.bindPopup(`<div style="font-size:12px; text-align:center;"><b>${item.desa}, ${item.kecamatan || '-'}</b><br><small>Prakiraan BMKG belum tersedia.</small></div>`);
          console.warn(`Gagal memuat marker cuaca kode ${kodeADM4}`);
        });
    });
  }

  function escapeBMKGHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]);
  }

  function createBMKGPopup(lokasi, cuaca) {
    const insightsHTML = typeof buildWeatherInsightsHTML === 'function' ? buildWeatherInsightsHTML(cuaca) : '';
    return `<div class="bmkg-popup">
      <div class="bmkg-popup-head"><strong>${escapeBMKGHTML(lokasi?.desa || lokasi?.kelurahan || 'Lokasi prakiraan')}</strong><span>${escapeBMKGHTML(lokasi?.kecamatan || '')}${lokasi?.kotkab ? ` · ${escapeBMKGHTML(lokasi.kotkab)}` : ''}</span></div>
      <div class="bmkg-popup-weather"><img src="${escapeBMKGHTML(cuaca.image || '')}" alt="${escapeBMKGHTML(cuaca.weather_desc || 'Cuaca')}"><div><div class="bmkg-popup-temp">${escapeBMKGHTML(cuaca.t ?? '-')}°C</div><span>${escapeBMKGHTML(cuaca.weather_desc || 'Tidak tersedia')}</span></div></div>
      ${insightsHTML}
    </div>`;
  }

  async function generate38RandomWeatherMarkers() {
    if (!weatherSearchLocations.length) return;
    weatherMarkersGroup.clearLayers();

    const selected38 = getRandomWeatherLocations(38);
    const requests = selected38.map(async item => {
      const response = await fetch(`https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${item.kode}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const lokasi = data.lokasi || {};
      const cuacaNow = data.data?.[0]?.cuaca?.[0]?.[0];
      const lat = Number(lokasi.lat);
      const lon = Number(lokasi.lon);
      if (!cuacaNow || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error('Data prakiraan atau koordinat BMKG tidak valid');
      }

      const icon = L.divIcon({
        className: 'custom-weather-marker',
        html: `<div class="weather-marker-icon"><img src="${escapeBMKGHTML(cuacaNow.image || '')}" alt=""><span>${escapeBMKGHTML(cuacaNow.t ?? '-')}°C</span></div>`,
        iconSize: [62, 70], iconAnchor: [31, 62], popupAnchor: [0, -62]
      });
      return L.marker([lat, lon], { icon, title: lokasi.desa || item.desa })
        .bindPopup(createBMKGPopup(lokasi, cuacaNow), { maxWidth: 290, className: 'bmkg-leaflet-popup' });
    });

    const results = await Promise.allSettled(requests);
    const markers = results.filter(result => result.status === 'fulfilled').map(result => result.value);
    weatherMarkersGroup.addLayers(markers);
    console.info(`${markers.length} marker cuaca BMKG ditampilkan dari ${selected38.length} desa acak.`);
  }
