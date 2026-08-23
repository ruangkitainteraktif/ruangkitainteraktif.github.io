  // Toggle Sidebar
  window.currentActiveTab = 'tab-geoid';
  const CHEVRON_RIGHT = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
  const CHEVRON_LEFT = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
  function setToggleIcon(collapsed) {
    const btn = document.getElementById('toggleBtn');
    if (btn) btn.innerHTML = collapsed ? CHEVRON_RIGHT : CHEVRON_LEFT;
  }
  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar-left');
    sidebar.classList.toggle('collapsed');
    setToggleIcon(sidebar.classList.contains('collapsed'));
    setTimeout(() => map.invalidateSize(), 300);
  }

  // Toggle Detail Panel
  function toggleDetailPanel(show = null) {
    const panel = document.getElementById('detail-panel');
    const btn = window._detailPanelBtn;
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
      if (show === false) {
        closeAdminModal();
      } else {
        openAdminModal();
        if (typeof showChoropleth === 'function') showChoropleth('jumlah');
      }
    } else {
      if (show === true || (show === null && panel.classList.contains('hidden'))) {
        panel.classList.remove('hidden');
        if (btn) btn.classList.add('active');
        if (typeof showChoropleth === 'function') showChoropleth('jumlah');
      } else {
        panel.classList.add('hidden');
        if (btn) btn.classList.remove('active');
      }
    }
  }

  function openAdminModal() {
    if (window.innerWidth <= 768) {
      adminModalOpenedAt = Date.now();
      const panel = document.getElementById('detail-panel');
      panel.classList.remove('hidden');
      panel.classList.add('active');
      document.getElementById('modal-backdrop').classList.add('active');
    }
  }

  function closeAdminModal() {
    const panel = document.getElementById('detail-panel');
    panel.classList.add('hidden');
    panel.classList.remove('active');
    document.getElementById('modal-backdrop').classList.remove('active');
  }

  // Hindari "ghost click" mobile (~300ms) yang langsung menutup panel
  // setelah dibuka lewat tap pada peta.
  function onBackdropClick() {
    if (Date.now() - adminModalOpenedAt < 500) return;
    closeAdminModal();
  }

  // Tab Utama Sidebar
  function openTab(evt, tabId) {
    const tabContents = document.getElementsByClassName("tab-content");
    for (let i = 0; i < tabContents.length; i++) tabContents[i].classList.remove("active");

    const tabBtns = document.getElementsByClassName("tab-btn");
    for (let i = 0; i < tabBtns.length; i++) tabBtns[i].classList.remove("active");

    document.getElementById(tabId).classList.add("active");
    evt.currentTarget.classList.add("active");
    window.currentActiveTab = tabId;

    if (tabId !== 'tab-cctv') {
      var sheet = document.getElementById('cctv-search-sheet');
      if (sheet) {
        sheet.classList.remove('sheet-open');
        if (window.innerWidth <= 768 && sheet.parentElement === document.body) {
          var tabCctv = document.getElementById('tab-cctv');
          if (tabCctv) {
            var refNode = tabCctv.querySelector('.cctv-card');
            if (refNode && refNode.parentNode === tabCctv) {
              tabCctv.insertBefore(sheet, refNode);
            } else {
              tabCctv.appendChild(sheet);
            }
          }
        }
        applyCctvSearchVisibility();
      }
    }

    if (tabId !== 'tab-geoportal') closeGeoportalModal();

    if (typeof renderGeoportalLegend === 'function') setTimeout(renderGeoportalLegend, 50);
    if (typeof window.updateGeoportalPrintVisibility === 'function') window.updateGeoportalPrintVisibility();

    if (tabId === 'tab-gempa') {
      var gempaGempaPanel = document.getElementById('gempa-subtab-gempa');
      if (gempaGempaPanel && gempaGempaPanel.classList.contains('active')) loadEarthquakeData();
    }
    if (tabId === 'tab-cctv') {
      loadCctvData();
      if (window.innerWidth <= 768) {
        var sidebar = document.getElementById('sidebar-left');
        var sheet = document.getElementById('cctv-search-sheet');
        if (sheet && sheet.parentElement !== document.body) {
          document.body.appendChild(sheet);
        }
        applyCctvSearchVisibility();
        if (sidebar && !sidebar.classList.contains('collapsed')) {
          sidebar.classList.add('collapsed');
          setToggleIcon(true);
          setTimeout(function () { map.invalidateSize(); }, 300);
        }
        setTimeout(function () {
          if (sheet) sheet.classList.add('sheet-open');
        }, 350);
      }
    }
    if (tabId === 'tab-geopangan' && typeof window.geopanganAutoLoad === 'function') window.geopanganAutoLoad();

    const unifiedSearch = document.getElementById('unifiedSearch');
    const insightCards = document.getElementById('mapInsightCards');

    if (unifiedSearch) unifiedSearch.style.display = 'block';
    if (insightCards) insightCards.style.display = 'none';

    if (tabId !== 'tab-alat') {
      removeDrawControl();
      stopMeasureMode();
    }

    if (typeof setBaseMap === 'function') {
      if (tabId === 'tab-geoid') {
        if (typeof currentBasemapName !== 'undefined' && currentBasemapName !== 'google-maps') setBaseMap('google-maps');
      } else if (tabId === 'tab-geotani' || tabId === 'tab-gempa' || tabId === 'tab-geoportal') {
        if (typeof currentBasemapName !== 'undefined' && currentBasemapName !== 'esri-satellite') setBaseMap('esri-satellite');
      } else {
        if (typeof currentBasemapName !== 'undefined' && currentBasemapName !== 'carto-light') setBaseMap('carto-light');
      }
    }
  }

  function openGeotaniAnalysisTab(tabId) {
    const targetPanel = document.getElementById(`geotani-${tabId}-panel`);
    const targetTab = document.getElementById(`geotani-${tabId}-tab`);
    if (!targetPanel || !targetTab) return;

    document.querySelectorAll('.geotani-analysis-panel').forEach(panel => {
      const isActive = panel === targetPanel;
      panel.classList.toggle('active', isActive);
      panel.hidden = !isActive;
    });
    document.querySelectorAll('.geotani-analysis-tab').forEach(tab => {
      const isActive = tab === targetTab;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });
  }

  // Sub-tab GEOQUAKE: Gempabumi / Karhutla / Info Cuaca / Prediksi Cuaca
  function openGempaSubtab(btn) {
    var subtabId = btn.getAttribute('data-subtab');
    if (!subtabId) return;

    // Toggle buttons
    var tabs = btn.parentElement.querySelectorAll('.gempa-subtab-btn');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
    btn.classList.add('active');

    // Toggle panels
    var panels = document.querySelectorAll('.gempa-subtab-panel');
    for (var j = 0; j < panels.length; j++) panels[j].classList.remove('active');
    var target = document.getElementById(subtabId);
    if (target) target.classList.add('active');

    // Load earthquake data when switching to gempa sub-tab
    if (subtabId === 'gempa-subtab-gempa') loadEarthquakeData();
  }

  function openGempaSubtabById(subtabId) {
    var btn = document.querySelector('.gempa-subtab-btn[data-subtab="' + subtabId + '"]');
    if (btn) openGempaSubtab(btn);
  }

  function openGeoidSubtab(btn) {
    var subtabId = btn.getAttribute('data-subtab');
    if (!subtabId) return;

    var tabs = btn.parentElement.querySelectorAll('.geoid-subtab-btn');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
    btn.classList.add('active');

    var panels = document.querySelectorAll('.geoid-subtab-panel');
    for (var j = 0; j < panels.length; j++) panels[j].classList.remove('active');
    var target = document.getElementById(subtabId);
    if (target) target.classList.add('active');

    if (typeof map !== 'undefined' && map) setTimeout(function () { map.invalidateSize(); }, 200);
  }

  window.openGempaSubtabById = openGempaSubtabById;
  window.openGempaSubtab = openGempaSubtab;
  window.openGeoidSubtab = openGeoidSubtab;

  function applyCctvSearchVisibility() {
    var sheet = document.getElementById('cctv-search-sheet');
    if (!sheet) return;
    var cctvSearch = sheet.querySelector('.cctv-autocomplete');
    if (!cctvSearch) return;
    cctvSearch.style.display = (window.innerWidth <= 768) ? 'none' : '';
  }

  window.addEventListener('resize', applyCctvSearchVisibility);
