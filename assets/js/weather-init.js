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
  }
  window.closeWelcomeModal = closeWelcomeModal;

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
      }
    }, 350);
  });
