  // Geoportal Layer Search — using jsTree search plugin

  function initGeoportalSearch() {
    const input = document.getElementById('geoportalSearchInput');
    const container = document.getElementById('geoportalLayerList');
    if (!input || !container) return;

    let searchTimeout = null;

    input.addEventListener('input', function () {
      clearTimeout(searchTimeout);
      const query = this.value.trim();
      searchTimeout = setTimeout(function () {
        try {
          const tree = $(container).jstree(true);
          if (tree) tree.search(query);
        } catch (e) {}
      }, 200);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        this.value = '';
        try {
          const tree = $(container).jstree(true);
          if (tree) tree.search('');
        } catch (e) {}
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(initGeoportalSearch, 500);
  });
