  // Load awal cuaca
  // Muat panel cuaca awal tanpa memindahkan peta atau membuka popup marker.
  fetchWeatherBMKG('31.71.03.1001', { focusMap: false });

  // Tampilan awal: tab Geoid aktif, tampilkan pencarian global
  const unifiedSearch = document.getElementById('unifiedSearch');
  const insightCards = document.getElementById('mapInsightCards');
  if (unifiedSearch) unifiedSearch.style.display = 'block';
  if (insightCards) insightCards.style.display = 'none';

  // Close welcome modal helper
  function closeWelcomeModal() {
    const modal = document.getElementById('welcomeFeatureModal');
    if (modal) modal.classList.remove('open');
    // Penafian menyusul setelah welcome ditutup. Fungsinya memeriksa
    // sendiri apakah sudah pernah diterima, jadi panggilan ini aman
    // dipanggil berkali-kali maupun saat penafian sudah pernah-show.
    if (typeof window.tampilkanDisclaimerJikaBelum === 'function') {
      window.tampilkanDisclaimerJikaBelum();
    }
  }
  window.closeWelcomeModal = closeWelcomeModal;

  window.resetGeoPulseLayers = function () {
    var panel = document.getElementById('geotoolsTabGeoPulse');
    if (!panel) return;

    var airVisualIds = {
      'airvisual-pm10': 'toggleAirVisualPm10',
      'airvisual-o3': 'toggleAirVisualO3',
      'airvisual-no2': 'toggleAirVisualNo2',
      'airvisual-so2': 'toggleAirVisualSo2',
      'airvisual-co': 'toggleAirVisualCo'
    };
    panel.querySelectorAll('input[type="checkbox"]').forEach(function (input) {
      var catalogId = input.id || airVisualIds[input.getAttribute('data-airvisual-layer')];
      var catalogToggle = catalogId && document.querySelector('.lc-item input[data-layer-id="' + catalogId + '"]');
      if (catalogToggle && catalogToggle.checked) {
        catalogToggle.checked = false;
        catalogToggle.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (input.checked) {
        input.checked = false;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    ['quakeResetLayers', 'cuacaMaritimCleanup', 'khLayerCleanup', 'clearGeoPulseWeatherMarkers', 'clearSelectedWeatherLayer'].forEach(function (name) {
      if (typeof window[name] === 'function') {
        try { window[name](); } catch (error) { console.warn('[GeoPulse] gagal mereset ' + name + ':', error); }
      }
    });
  };

  var geopulseResetLayersBtn = document.getElementById('geopulseResetLayersBtn');
  if (geopulseResetLayersBtn) geopulseResetLayersBtn.addEventListener('click', window.resetGeoPulseLayers);

  window.addEventListener('load', () => {
    setTimeout(() => {
      document.getElementById('appLoadingOverlay')?.classList.add('is-hidden');
      // Tampilkan welcome modal setelah loading overlay fade-out (session-based)
      if (!sessionStorage.getItem('ruangkita_welcome_shown')) {
        sessionStorage.setItem('ruangkita_welcome_shown', '1');
        setTimeout(() => {
          const welcomeModal = document.getElementById('welcomeFeatureModal');
          if (welcomeModal) welcomeModal.classList.add('open');
        }, 600);
      } else {
        // Welcome sudah pernah tampil di sesi ini, jadi penafian yang
        // menggantikannya sebagai gerbang pertama.
        if (typeof window.tampilkanDisclaimerJikaBelum === 'function') {
          setTimeout(() => { window.tampilkanDisclaimerJikaBelum(); }, 500);
        }
      }
    }, 350);
  });
