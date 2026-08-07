  // KLIK MAP -> REVERSE GEOCODE, POPUP & DETAIL PANEL
  function isCuacaTabActive() {
    return document.getElementById('tab-cuaca')?.classList.contains('active') === true;
  }

  function isAlatTabActive() {
    return document.getElementById('tab-alat')?.classList.contains('active') === true;
  }

  map.on('click', async function(e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;

    // Tab Cuaca: biarkan findAdm4ByCoordinates yang tangani
    if (isCuacaTabActive()) {
      findAdm4ByCoordinates(lat, lng);
      return;
    }

    // Tab Alat: jangan tampilkan popup geoid
    if (isAlatTabActive()) return;

    if (mapClickMarker) map.removeLayer(mapClickMarker);

    const clickIcon = L.divIcon({
      className: 'geoid-marker-wrap',
      html: `<div class="geoid-marker" role="img" aria-label="Lokasi klik"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg></div>`,
      iconSize: [48, 54], iconAnchor: [24, 52], popupAnchor: [0, -52]
    });

    mapClickMarker = L.marker([lat, lng], { icon: clickIcon, zIndexOffset: 1000 }).addTo(map);

    document.getElementById('clicked-coords').innerText = `(${lng.toFixed(5)}, ${lat.toFixed(5)})`;

    // Popup placeholder — akan diupdate setelah reverse geocode
    mapClickMarker.bindPopup(`
      <div class="geoid-popup geoid-popup-scroll">
        <div class="geoid-popup-head">
          <strong>${lng.toFixed(5)}, ${lat.toFixed(5)}</strong>
        </div>
        <div class="geoid-popup-body">
          <div class="geoid-popup-meta">
            <div><span>Koordinat</span><b>${lng.toFixed(5)}, ${lat.toFixed(5)}</b></div>
          </div>
          <span style="color:#7a8fa3; font-size:12px">Memuat alamat…</span>
        </div>
      </div>
    `, { maxWidth: 310, className: 'geoid-leaflet-popup' });
    mapClickMarker.openPopup();

    fetchReverseGeocodeWithPopup(lng, lat, mapClickMarker);
  });

  function escapeMapClickHtml(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
  }

  async function fetchReverseGeocodeWithPopup(lng, lat, marker) {
    const geocodeUrl = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=pjson&featureTypes=&location=${lng},${lat}`;

    try {
      const response = await fetch(geocodeUrl);
      const data = await response.json();

      const desa = data?.address?.Neighborhood || data?.address?.District || data?.address?.City || '-';
      const kecamatan = data?.address?.Subregion || data?.address?.City || '-';
      const provinsi = data?.address?.Region || '-';
      const jalan = data?.address?.Match_addr || data?.address?.Address || '-';
      const kodepos = data?.address?.Postal || '-';

      // Cari adm4 code dari kode_wilayah.json
      const matched = typeof findAdm4ByGeocode === 'function'
        ? findAdm4ByGeocode(desa, kecamatan, data?.address?.City || kecamatan, provinsi)
        : null;
      const adm4Code = matched ? matched.kode : '';

      // Update detail panel
      document.getElementById('adm-provinsi').innerText = matched ? matched.provinsi : provinsi;
      document.getElementById('adm-kecamatan').innerText = matched ? matched.kecamatan : kecamatan;
      document.getElementById('adm-desa').innerText = matched ? matched.desa : desa;
      document.getElementById('adm-jalan').innerText = jalan;
      document.getElementById('adm-kodepos').innerText = kodepos;

      // Bangun popup konsisten dengan showGeoidFlyup()
      const title = matched ? matched.desa : desa;
      const hierarchy = [matched ? matched.kecamatan : kecamatan, matched ? matched.provinsi : provinsi].filter(Boolean);
      const coordStr = `${lng.toFixed(5)}, ${lat.toFixed(5)}`;
      const metadata = [
        ['Alamat', jalan],
        ['Kode pos', kodepos],
        ['Koordinat', coordStr],
        adm4Code && ['Kode wilayah', adm4Code]
      ].filter(Boolean);

      const popupContent = `
        <div class="geoid-popup geoid-popup-scroll">
          <div class="geoid-popup-head">
            <strong>${escapeMapClickHtml(title)}</strong>
            ${hierarchy.length ? `<span>${hierarchy.map(escapeMapClickHtml).join(' · ')}</span>` : ''}
          </div>
          <div class="geoid-popup-body">
            <div class="geoid-popup-meta">${metadata.map(([label, value]) => `<div><span>${escapeMapClickHtml(label)}</span><b>${escapeMapClickHtml(value)}</b></div>`).join('')}</div>
            <div class="geoid-popup-prayer" data-prayer-schedule><span style="color:#7a8fa3; font-size:11px">Memuat jadwal sholat…</span></div>
            <div class="geoid-popup-insights" data-geoid-insights>
              <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px 0 10px;gap:8px;">
                <div style="width:28px;height:28px;border:3px solid #d0dde8;border-top-color:#0879bf;border-radius:50%;animation:geoportal-spin .8s linear infinite;"></div>
                <span style="font-size:10px;color:#7a8fa3;text-align:center;">Memuat analisis…</span>
              </div>
            </div>
          </div>
        </div>
      `;
      marker.setPopupContent(popupContent);

      // Muat jadwal sholat berdasarkan koordinat dari reverse geocode
      loadPrayerSchedule(marker, lat, lng);

      // Muat insights cuaca, gempa
      loadGeoidPopupInsights(marker, { lat, lon: lng, kode: adm4Code });

      // Tampilkan batas wilayah dari BIG
      if (adm4Code) showGeoidBoundary(adm4Code, 15);
    } catch (err) {
      console.error("Reverse Geocode Error:", err);
      if (marker.getPopup()) {
        marker.setPopupContent(`
          <div class="geoid-popup">
            <div class="geoid-popup-head">
              <strong>${lng.toFixed(5)}, ${lat.toFixed(5)}</strong>
            </div>
            <div class="geoid-popup-body">
              <span style="color:#e74c3c; font-size:12px">Gagal memuat alamat</span>
            </div>
          </div>
        `);
      }
    }
  }

  async function loadPrayerSchedule(marker, lat, lon) {
    const element = marker.getPopup()?.getElement()?.querySelector('[data-prayer-schedule]');
    if (!element || !lat || !lon) {
      if (element) element.innerHTML = '<span style="color:#7a8fa3; font-size:11px">Jadwal sholat tidak tersedia</span>';
      return;
    }

    try {
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yyyy = now.getFullYear();
      const dateStr = `${dd}-${mm}-${yyyy}`;

      const url = `https://api.aladhan.com/v1/timings/${dateStr}?latitude=${lat}&longitude=${lon}&method=20`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();

      const timings = payload?.data?.timings;
      const date = payload?.data?.date;
      if (!timings) throw new Error('Data tidak valid');

      const hijri = date?.hijri;
      const gregorian = date?.gregorian;

      const prayerList = [
        ['Imsak', timings.Imsak],
        ['Subuh', timings.Fajr],
        ['Terbit', timings.Sunrise],
        ['Dzuhur', timings.Dhuhr],
        ['Ashar', timings.Asr],
        ['Maghrib', timings.Maghrib],
        ['Isya', timings.Isha]
      ];

      element.innerHTML = `
        <div class="prayer-header">
          <span class="prayer-icon">🕌</span>
          <span class="prayer-title">Jadwal Sholat</span>
        </div>
        <div class="prayer-date">${escapeMapClickHtml(gregorian?.weekday?.en || '')}, ${escapeMapClickHtml(gregorian?.date || '')} ${escapeMapClickHtml(gregorian?.month?.en || '')} ${escapeMapClickHtml(gregorian?.year || '')}</div>
        <div class="prayer-hijri">${escapeMapClickHtml(hijri?.day || '')} ${escapeMapClickHtml(hijri?.month?.en || '')} ${escapeMapClickHtml(hijri?.year || '')} H</div>
        <div class="prayer-grid">
          ${prayerList.map(([name, time]) => `
            <div class="prayer-row">
              <span class="prayer-name">${name}</span>
              <span class="prayer-time">${escapeMapClickHtml(time || '-')}</span>
            </div>
          `).join('')}
        </div>
      `;
    } catch (err) {
      console.warn('Gagal memuat jadwal sholat:', err);
      element.innerHTML = '<span style="color:#7a8fa3; font-size:11px">Jadwal sholat tidak tersedia</span>';
    }
  }
