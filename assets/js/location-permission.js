// LOCATION PERMISSION MODAL
(function() {
  const MODAL_KEY = 'ruangkita_location_permission';
  const modal = document.getElementById('locationPermissionModal');
  const allowBtn = document.getElementById('locationPermAllow');
  const denyBtn = document.getElementById('locationPermDeny');
  let userMarker = null;

  if (!modal || !allowBtn || !denyBtn) return;

  function showModal() {
    modal.style.display = 'flex';
  }

  function hideModal() {
    modal.style.display = 'none';
  }

  async function showUserPopup(lat, lon) {
    if (typeof map === 'undefined' || !map) return;

    if (userMarker) map.removeLayer(userMarker);

    const icon = L.divIcon({
      className: 'geoid-marker-wrap',
      html: `<div class="geoid-marker" role="img" aria-label="Lokasi Anda"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg></div>`,
      iconSize: [48, 54], iconAnchor: [24, 52], popupAnchor: [0, -52]
    });

    userMarker = L.marker([lat, lon], { icon, title: 'Lokasi Anda', zIndexOffset: 1000 }).addTo(map);

    const coordStr = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    const isGeotaniMode = window.currentActiveTab === 'tab-geotani';
    const prefix = isGeotaniMode ? 'geotani' : 'geoid';
     const popupContent = `
       <div class="${prefix}-popup geoid-popup-scroll">
         <div class="${prefix}-popup-head">
           <div class="${prefix}-popup-badge">
             <span class="${prefix}-popup-badge-dot"></span>
             ${isGeotaniMode ? 'Geotani' : 'Lokasi Anda'}
           </div>
           <strong>Lokasi Anda</strong>
           <span>Posisi saat ini</span>
         </div>
          <div class="${prefix}-popup-body">
            <div class="${prefix}-popup-meta">
              <div><span>Koordinat</span><b>${coordStr}</b></div>
            </div>
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

    userMarker.bindPopup(popupContent, { maxWidth: 360, className: isGeotaniMode ? 'geotani-leaflet-popup' : 'geoid-leaflet-popup' });
    userMarker.openPopup();

    // Di GeoTani, lokasi pengguna hanya ditampilkan sebagai penanda. Jangan
    // jalankan reverse geocoding ataupun pemuatan batas berdasarkan alamat.
    if (isGeotaniMode) return;

    let userAdm4Code = '';
    if (typeof loadGeoidPopupInsights === 'function') await loadGeoidPopupInsights(userMarker, { lat, lon, kode: userAdm4Code });
    if (userAdm4Code && typeof loadDukcapilPopulation === 'function') await loadDukcapilPopulation(userMarker, userAdm4Code, { lat, lon });
    if (typeof showGeoidBoundary === 'function' && userAdm4Code) showGeoidBoundary(userAdm4Code, 15);
  }

  function handleAllow() {
    hideModal();
    localStorage.setItem(MODAL_KEY, 'granted');
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          window.userLocation = { lat: latitude, lon: longitude };
          if (typeof map !== 'undefined' && map) {
            map.flyTo([latitude, longitude], 15, { duration: 1.5 });
            setTimeout(() => showUserPopup(latitude, longitude), 1600);
          }
        },
        (err) => {
          console.warn('Geolocation error:', err.message);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  }

  function handleDeny() {
    hideModal();
    localStorage.setItem(MODAL_KEY, 'denied');
  }

  allowBtn.addEventListener('click', handleAllow);
  denyBtn.addEventListener('click', handleDeny);

  // Check permission on first visit
  document.addEventListener('DOMContentLoaded', function() {
    const saved = localStorage.getItem(MODAL_KEY);
    if (saved) return;

    if (!navigator.geolocation) return;

    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        if (result.state === 'prompt') {
          setTimeout(showModal, 1000);
        } else if (result.state === 'granted') {
          localStorage.setItem(MODAL_KEY, 'granted');
        }
      }).catch(() => {
        setTimeout(showModal, 1000);
      });
    } else {
      setTimeout(showModal, 1000);
    }
  });
})();
