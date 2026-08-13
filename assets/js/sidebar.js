  // Toggle Sidebar
  window.currentActiveTab = 'tab-geoid';
  function toggleSidebar() {
    const sidebar = document.getElementById('sidebar-left');
    const toggleBtn = document.getElementById('toggleBtn');
    
    sidebar.classList.toggle('collapsed');
    toggleBtn.innerHTML = sidebar.classList.contains('collapsed') ? '&gt;&gt;' : '&lt;&lt;';

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
      }
    } else {
      if (show === true || (show === null && panel.classList.contains('hidden'))) {
        panel.classList.remove('hidden');
        if (btn) btn.classList.add('active');
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

    if (tabId !== 'tab-geoportal') closeGeoportalModal();

    if (tabId === 'tab-gempa') {
      var gempaGempaPanel = document.getElementById('gempa-subtab-gempa');
      if (gempaGempaPanel && gempaGempaPanel.classList.contains('active')) loadEarthquakeData();
    }
    if (tabId === 'tab-cctv') loadCctvData();

    const unifiedSearch = document.getElementById('unifiedSearch');
    const insightCards = document.getElementById('mapInsightCards');

    if (tabId === 'tab-geoid') {
      if (unifiedSearch) unifiedSearch.style.display = 'block';
    } else {
      if (unifiedSearch) unifiedSearch.style.display = 'none';
    }
    if (insightCards) insightCards.style.display = 'none';

    if (tabId !== 'tab-alat') {
      removeDrawControl();
      stopMeasureMode();
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

  // Sub-tab GEOQUAKE: Gempabumi / Karhutla
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
