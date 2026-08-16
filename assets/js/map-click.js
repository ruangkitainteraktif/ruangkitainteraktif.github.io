  // KLIK MAP -> REVERSE GEOCODE, POPUP & DETAIL PANEL
  function isCuacaTabActive() {
    if (document.getElementById('tab-cuaca')?.classList.contains('active') === true) return true;
    if (document.getElementById('tab-gempa')?.classList.contains('active') === true) {
      var infoCuacaPanel = document.getElementById('gempa-subtab-infocuaca');
      if (infoCuacaPanel && infoCuacaPanel.classList.contains('active')) return true;
    }
    return false;
  }

  async function openGeotaniBoundaryFromOverlay(latlng, kode) {
    kode = kode || window._selectedVillageKode || window._lastGeotaniLocation?.kode;
    if (!kode || typeof showGeoidBoundary !== 'function') return;

    const boundaryLayer = await showGeoidBoundary(kode, undefined, { flyTo: false });
    if (boundaryLayer?.getPopup) boundaryLayer.openPopup(latlng);
  }

  map.on('click', async function(e) {
    // Jika klik mengenai fitur interaktif (marker hotspot, polygon, dll),
    // biarkan Leaflet yang handle popup-nya.
    const target = e.originalEvent?.target;
    if (target && target.closest && target.closest('.leaflet-interactive')) return;

    const lat = e.latlng.lat;
    const lng = e.latlng.lng;

    if (typeof isWindRgbActive === 'function' && isWindRgbActive()) {
      if (typeof showWindPopup === 'function') showWindPopup(lat, lng);
      return;
    }
    if (typeof isRhRgbActive === 'function' && isRhRgbActive()) {
      if (typeof showRhPopup === 'function') showRhPopup(lat, lng);
      return;
    }
    if (typeof isTp24RgbActive === 'function' && isTp24RgbActive()) {
      if (typeof showTp24Popup === 'function') showTp24Popup(lat, lng);
      return;
    }
    if (typeof isPm25RgbActive === 'function' && isPm25RgbActive()) {
      if (typeof showPm25Popup === 'function') showPm25Popup(lat, lng);
      return;
    }
    if (typeof isHthRgbActive === 'function' && isHthRgbActive()) {
      if (typeof showHthPopup === 'function') showHthPopup(lat, lng);
      return;
    }
    if (typeof isGsmapRgbActive === 'function' && isGsmapRgbActive()) {
      if (typeof showGsmapPopup === 'function') showGsmapPopup(lat, lng);
      return;
    }
    if (typeof isMaritimeAnyActive === 'function' && isMaritimeAnyActive()) {
      if (typeof showMaritimePopup === 'function') showMaritimePopup(lat, lng);
      return;
    }
    if (typeof isFiniteFaultNTTActive === 'function' && isFiniteFaultNTTActive()) {
      if (typeof showFiniteFaultPopup === 'function') showFiniteFaultPopup(lat, lng);
      return;
    }

    // Nonaktifkan popup geoid di tab pengaturan, alat, dan gempa
    const activeTab = window.currentActiveTab;
    if (activeTab === 'tab-pengaturan' || activeTab === 'tab-alat' || activeTab === 'tab-gempa') return;

    // GeoTani tidak memakai reverse geocoding. Saat area kosong dalam cakupan
    // hasil irisan diklik, tampilkan popup batas wilayah analisis aktif.
    if (activeTab === 'tab-geotani') {
      const ktaOverlayLayer = typeof erosiSawahOverlayLayer !== 'undefined' && erosiSawahOverlayLayer;
      const lbsOverlayLayer = typeof getLbsOverlayLayer === 'function' && getLbsOverlayLayer();
      const clickedFeature = e.originalEvent?.target?.closest?.('.leaflet-interactive');
      const overlays = [
        { layer: lbsOverlayLayer, kode: window._selectedLbsVillageKode },
        { layer: ktaOverlayLayer, kode: window._selectedVillageKode || window._lastGeotaniLocation?.kode }
      ];
      const activeOverlay = overlays.find(({ layer }) => layer && map.hasLayer(layer) && layer.getBounds().contains(e.latlng));
      if (activeOverlay && !clickedFeature) {
        await openGeotaniBoundaryFromOverlay(e.latlng, activeOverlay.kode);
      }
      return;
    }

    // Jika klik mengenai fitur overlay, biarkan Leaflet yang handle popup
    const overlayLayer = typeof erosiSawahOverlayLayer !== 'undefined' && erosiSawahOverlayLayer;
    if (overlayLayer && map.hasLayer(overlayLayer)) {
      let hitOverlay = false;
      overlayLayer.eachLayer(l => {
        if (l instanceof L.Polygon && l.getBounds && l.getBounds().contains(e.latlng)) {
          const poly = e.originalEvent?.target;
          if (poly && poly.closest && poly.closest('.leaflet-interactive')) hitOverlay = true;
        }
      });
      if (hitOverlay) return;
    }

    // Saat layer Geoportal/ArcGIS aktif, klik dipakai untuk GetFeatureInfo.
    if (getActiveGeoportalLayers().length || getActiveArcgisLayers().length) {
      await handleGeoportalMapClick(e);
      return;
    }

    // Tab Cuaca: biarkan findAdm4ByCoordinates yang tangani
    if (isCuacaTabActive()) {
      findAdm4ByCoordinates(lat, lng);
      return;
    }

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
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:18px 0 14px;gap:8px;">
            <div style="width:26px;height:26px;border:3px solid #bfdbfe;border-top-color:#2563eb;border-radius:50%;animation:geoportal-spin .8s linear infinite;"></div>
            <span style="font-size:10px;color:#94a3b8;text-align:center;">Memuat alamat…</span>
          </div>
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
    const matched = null;
    const adm4Code = '';
    const desa = '-';
    const kecamatan = '-';
    const kabkota = '-';
    const provinsi = '-';
    const jalan = `${lng.toFixed(5)}, ${lat.toFixed(5)}`;
    const kodepos = '-';

      // Update detail panel
      document.getElementById('adm-provinsi').innerText = provinsi;
      document.getElementById('adm-kabkota').innerText = kabkota;
      document.getElementById('adm-kecamatan').innerText = kecamatan;
      document.getElementById('adm-desa').innerText = desa;
      document.getElementById('adm-jalan').innerText = jalan;
      document.getElementById('adm-kodepos').innerText = kodepos;

      // Bangun popup konsisten dengan showGeoidFlyup()
      const title = `${lng.toFixed(5)}, ${lat.toFixed(5)}`;
      const hierarchy = [];
      const coordStr = `${lng.toFixed(5)}, ${lat.toFixed(5)}`;
      const isGeotaniMode = window.currentActiveTab === 'tab-geotani';
      const metadata = [
        ['Koordinat', coordStr]
      ].filter(Boolean);

      const prefix = isGeotaniMode ? 'geotani' : 'geoid';
      const popupContent = `
        <div class="${prefix}-popup geoid-popup-scroll">
          <div class="${prefix}-popup-head">
            <div class="${prefix}-popup-badge">
              <span class="${prefix}-popup-badge-dot"></span>
              ${isGeotaniMode ? 'Geotani' : 'Wilayah'}
            </div>
            <strong>${escapeMapClickHtml(title)}</strong>
          </div>
          <div class="${prefix}-popup-body">
            <div class="${prefix}-popup-meta">${metadata.map(([label, value]) => `<div><span>${escapeMapClickHtml(label)}</span><b>${escapeMapClickHtml(value)}</b></div>`).join('')}</div>
            <div class="${prefix}-popup-insights" data-geoid-insights>
              <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px 0 10px;gap:8px;">
                <div style="width:28px;height:28px;border:3px solid ${isGeotaniMode ? '#bbf7d0' : '#bfdbfe'};border-top-color:${isGeotaniMode ? '#16a34a' : '#2563eb'};border-radius:50%;animation:geoportal-spin .8s linear infinite;"></div>
                <span style="font-size:10px;color:#94a3b8;text-align:center;">Memuat analisis…</span>
              </div>
            </div>
            ${!isGeotaniMode ? `<div class="geoid-popup-cctv" data-cctv-insight><span style="color:#94a3b8; font-size:11px">Memuat CCTV terdekat…</span></div>` : ''}
          </div>
        </div>
      `;
      marker.setPopupContent(popupContent);
      marker._icon?.classList.add(isGeotaniMode ? 'geotani-leaflet-popup' : 'geoid-leaflet-popup');

      // Muat insights cuaca, gempa, CCTV terdekat
      if (window.currentActiveTab === 'tab-geoid') {
        await loadGeoidPopupInsights(marker, { lat, lon: lng, kode: adm4Code });
        if (adm4Code && typeof loadDukcapilPopulation === 'function') await loadDukcapilPopulation(marker, adm4Code, { lat, lon: lng });
      }

      // Tampilkan batas wilayah dari BIG
      if (adm4Code) showGeoidBoundary(adm4Code, 15);
    } catch (err) {
      console.error("Reverse Geocode Error:", err);
      if (marker.getPopup()) {
        const errorPrefix = window.currentActiveTab === 'tab-geotani' ? 'geotani' : 'geoid';
        marker.setPopupContent(`
          <div class="${errorPrefix}-popup">
            <div class="${errorPrefix}-popup-head">
              <strong>${lng.toFixed(5)}, ${lat.toFixed(5)}</strong>
            </div>
            <div class="${errorPrefix}-popup-body">
              <span style="color:#e74c3c; font-size:12px">Gagal memuat alamat</span>
            </div>
          </div>
        `);
      }
    }
  }


