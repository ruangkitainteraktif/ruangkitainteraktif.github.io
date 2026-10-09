  // Geoportal Layer Search — using jsTree search plugin

  function initGeoportalSearch() {
    const input = document.getElementById('geoportalSearchInput');
    const container = document.getElementById('geoportalLayerList');
    if (!input || !container || input.dataset.geoportalSearchBound) return;
    input.dataset.geoportalSearchBound = '1';

    let searchTimeout = null;

    input.addEventListener('input', function () {
      clearTimeout(searchTimeout);
      const query = this.value.trim();
      searchTimeout = setTimeout(function () {
        try {
          if (typeof window.searchGeoportalLocal === 'function') window.searchGeoportalLocal(query);
        } catch (e) {}
      }, 200);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        this.value = '';
        try {
          if (typeof window.searchGeoportalLocal === 'function') window.searchGeoportalLocal('');
        } catch (e) {}
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(initGeoportalSearch, 500);
  });
