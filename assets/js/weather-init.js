  // Load awal cuaca
  // Muat panel cuaca awal tanpa memindahkan peta atau membuka popup marker.
  fetchWeatherBMKG('31.71.03.1001', { focusMap: false });

  // Tampilan awal: tab Geoid aktif, tampilkan pencarian global
  const unifiedSearch = document.getElementById('unifiedSearch');
  const insightCards = document.getElementById('mapInsightCards');
  if (unifiedSearch) unifiedSearch.style.display = 'block';
  if (insightCards) insightCards.style.display = 'none';
  
  window.addEventListener('load', () => {
    setTimeout(() => document.getElementById('appLoadingOverlay')?.classList.add('is-hidden'), 350);
  });
