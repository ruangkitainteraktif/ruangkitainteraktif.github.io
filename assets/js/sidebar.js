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
    const showBtn = document.getElementById('show-detail-btn');
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
        showBtn.style.display = 'none';
      } else {
        panel.classList.add('hidden');
        showBtn.style.display = 'block';
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

    if (tabId === 'tab-gempa') loadEarthquakeData();

    const unifiedSearch = document.getElementById('unifiedSearch');
    const insightCards = document.getElementById('mapInsightCards');

    if (tabId === 'tab-cuaca') {
      // Get search position before hiding
      const searchTop = unifiedSearch ? parseInt(getComputedStyle(unifiedSearch).top) : 14;
      const searchHeight = unifiedSearch ? unifiedSearch.offsetHeight : 46;
      // Hide global search, show cards at search position + 10px
      if (unifiedSearch) unifiedSearch.style.display = 'none';
      if (insightCards) {
        insightCards.style.display = 'flex';
        insightCards.style.top = (searchTop + searchHeight + 10) + 'px';
      }
    } else {
      // Show global search, hide cards
      if (unifiedSearch) unifiedSearch.style.display = 'block';
      if (insightCards) insightCards.style.display = 'none';
    }

    if (tabId !== 'tab-alat') {
      removeDrawControl();
      stopMeasureMode();
    }
  }
