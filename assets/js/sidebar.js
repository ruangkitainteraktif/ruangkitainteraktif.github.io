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
    // A feature may temporarily hide the whole sidebar (for example GeoPangan).
    // A direct user toggle always restores the dashboard navigation first.
    sidebar.classList.remove('sidebar-force-hidden');
    sidebar.classList.toggle('collapsed');
    setToggleIcon(sidebar.classList.contains('collapsed'));
    setTimeout(() => map.invalidateSize(), 300);
  }

  function toggleSidebarMenu(button) {
    const sidebar = document.getElementById('sidebar-left');
    if (!sidebar) return;
    const collapsed = sidebar.classList.toggle('menu-collapsed');
    if (button) button.setAttribute('aria-expanded', String(!collapsed));
  }

  function minimizeAllSheets() {
    if (typeof minimizeGeotoolsSheet === 'function') minimizeGeotoolsSheet();
    if (typeof minimizeAttrTableSheet === 'function') minimizeAttrTableSheet();
    if (typeof minimizeAiSheet === 'function') minimizeAiSheet();
    if (typeof minimizeDrawSidebar === 'function') minimizeDrawSidebar();
    if (typeof minimizeLegendSidebar === 'function') minimizeLegendSidebar();
    var hs = document.getElementById('hotspot-sheet');
    if (hs && hs.classList.contains('sheet-open')) { if (typeof toggleHotspotSheet === 'function') toggleHotspotSheet(); }
    var gp = document.getElementById('geopangan-sheet');
    if (gp && gp.classList.contains('sheet-open')) { if (typeof toggleGeopanganSheet === 'function') toggleGeopanganSheet(); }
    var sidebar = document.getElementById('sidebar-left');
    if (sidebar && !sidebar.classList.contains('collapsed')) toggleSidebar();
  }
  window.minimizeAllSheets = minimizeAllSheets;

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

    // Collapse Menu Aplikasi after selecting a tab
    var sidebar = document.getElementById('sidebar-left');
    if (sidebar && !sidebar.classList.contains('menu-collapsed')) {
      toggleSidebarMenu(document.getElementById('sidebarNavToggle'));
    }

    if (tabId !== 'tab-cctv') {
      var sheet = document.getElementById('cctv-search-sheet');
      if (sheet) {
        sheet.classList.remove('sheet-open');
        applyCctvSearchVisibility();
      }
    }

    if (tabId !== 'tab-geoportal') closeGeoportalModal();

    if (typeof renderGeoportalLegend === 'function') setTimeout(renderGeoportalLegend, 50);

    if (tabId === 'tab-cctv') {
      loadCctvData();
      applyCctvSearchVisibility();
    }
    if (tabId === 'tab-geopangan' && typeof window.geopanganAutoLoad === 'function') window.geopanganAutoLoad();

    const unifiedSearch = document.getElementById('unifiedSearch');
    const insightCards = document.getElementById('mapInsightCards');

    if (unifiedSearch) unifiedSearch.style.display = 'block';
    if (insightCards) insightCards.style.display = 'none';

    if (tabId !== 'tab-draw' && tabId !== 'tab-geotools') {
      removeDrawControl();
      stopMeasureMode();
    }

    if (typeof setBaseMap === 'function') {
      if (typeof currentBasemapName !== 'undefined' && currentBasemapName !== 'google-maps') setBaseMap('google-maps');
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
    document.querySelectorAll('.geotani-analysis-card').forEach(tab => {
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

  function openGeotoolsMainTab(btn) {
    var tabId = btn.getAttribute('data-maintab');
    if (!tabId) return;
    var tabs = btn.parentElement.querySelectorAll('.geotools-main-tab-btn');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
    btn.classList.add('active');
    var panels = document.querySelectorAll('.geotools-main-tab-panel');
    for (var j = 0; j < panels.length; j++) panels[j].classList.remove('active');
    var target = document.getElementById(tabId);
    if (target) target.classList.add('active');
    if (tabId === 'geotoolsTabDemnas' && window.DemnasDownload && typeof window.DemnasDownload.load === 'function') {
      window.DemnasDownload.load().catch(function () {});
    }
    if (tabId === 'geotoolsTabGeoPulse') {
      var gempaPanel = document.getElementById('gempa-subtab-gempa');
      if (gempaPanel && gempaPanel.classList.contains('active') && typeof loadEarthquakeData === 'function') loadEarthquakeData();
    }
    if (tabId === 'geotoolsTabGeoPangan' && typeof window.geopanganAutoLoad === 'function') window.geopanganAutoLoad();
    if (tabId === 'geotoolsTabGeoWatch') {
      if (typeof window.loadCctvData === 'function') {
        window.loadCctvData().then(function () {
          if (typeof window.renderCctvList === 'function') window.renderCctvList();
        }).catch(function (err) {
          console.warn('GeoWatch CCTV load failed on tab activation:', err);
        });
      }
    }
    if (typeof map !== 'undefined' && map) setTimeout(function () { map.invalidateSize(); }, 200);
  }
  window.openGeotoolsMainTab = openGeotoolsMainTab;

  function applyCctvSearchVisibility() {
    var sheet = document.getElementById('cctv-search-sheet');
    if (!sheet) return;
    var cctvSearch = sheet.querySelector('.cctv-autocomplete');
    if (cctvSearch) cctvSearch.style.display = '';
  }

  window.addEventListener('resize', applyCctvSearchVisibility);

  /* ── GeoTani: Reset Layer + Detail Buttons ── */
  function initGeotaniButtons() {
    function showBtn(id) { var el = document.getElementById(id); if (el) el.style.display = ''; }
    function hideBtn(id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; }

    function showDetailPopup(title, html) {
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;';
      overlay.addEventListener('click', function (e) { if (e.target === overlay) document.body.removeChild(overlay); });
      var box = document.createElement('div');
      box.style.cssText = 'background:#fff;border-radius:10px;max-width:min(600px,90vw);max-height:70vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.2);';
      box.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e5e7eb;background:#f9fafb;">'
        + '<strong style="font-size:13px;color:#1e293b;">' + title + '</strong>'
        + '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="background:none;border:none;cursor:pointer;font-size:18px;color:#94a3b8;padding:0 4px;">&times;</button>'
        + '</div>'
        + '<div style="overflow:auto;padding:12px 16px;font-size:11px;">' + html + '</div>';
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    }

    function makeDetailTable(rows) {
      if (!rows.length) return '<em>Tidak ada data.</em>';
      var keys = Object.keys(rows[0]);
      var h = '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
      h += '<thead><tr>' + keys.map(function (k) { return '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #e5e7eb;color:#64748b;font-weight:600;">' + k + '</th>'; }).join('') + '</tr></thead>';
      h += '<tbody>';
      rows.forEach(function (r, i) {
        h += '<tr style="background:' + (i % 2 ? '#f9fafb' : '#fff') + ';">';
        keys.forEach(function (k) { h += '<td style="padding:5px 8px;border-bottom:1px solid #f1f5f9;color:#334155;">' + (r[k] != null ? r[k] : '-') + '</td>'; });
        h += '</tr>';
      });
      h += '</tbody></table>';
      return h;
    }

    /* LBS */
    var lbsLayerActive = false;
    var origClearLbs = window.clearLbsAnalysis;
    window.clearLbsAnalysis = function () {
      if (typeof origClearLbs === 'function') origClearLbs();
      lbsLayerActive = false; hideBtn('btnClearLbs'); hideBtn('btnDetailLbs');
    };
    var lbsRunBtn = document.getElementById('btnRunLbs');
    if (lbsRunBtn) {
      var origLbsHandler = lbsRunBtn.onclick;
      lbsRunBtn.addEventListener('click', function () {
        setTimeout(function () {
          var resultArea = document.getElementById('lbsResultArea');
          if (resultArea && resultArea.style.display !== 'none' && resultArea.innerHTML.trim()) {
            lbsLayerActive = true; showBtn('btnClearLbs'); showBtn('btnDetailLbs');
          }
        }, 500);
      });
    }
    var btnClearLbs = document.getElementById('btnClearLbs');
    if (btnClearLbs) btnClearLbs.addEventListener('click', function () { if (typeof window.clearLbsAnalysis === 'function') window.clearLbsAnalysis(); });
    var btnDetailLbs = document.getElementById('btnDetailLbs');
    if (btnDetailLbs) btnDetailLbs.addEventListener('click', function () {
      var resultArea = document.getElementById('lbsResultArea');
      if (resultArea) showDetailPopup('Detail LBS', resultArea.innerHTML);
    });

    /* KTA */
    var btnClearKta = document.getElementById('btnClearKta');
    if (btnClearKta) btnClearKta.addEventListener('click', function () { if (typeof clearOverlay === 'function') clearOverlay(); hideBtn('btnClearKta'); hideBtn('btnDetailKta'); });
    var btnRunOverlay = document.getElementById('btnRunOverlay');
    if (btnRunOverlay) {
      btnRunOverlay.addEventListener('click', function () {
        setTimeout(function () {
          if (typeof erosiSawahOverlayLayer !== 'undefined' && erosiSawahOverlayLayer) {
            showBtn('btnClearKta'); showBtn('btnDetailKta');
          }
        }, 1000);
      });
    }
    var btnDetailKta = document.getElementById('btnDetailKta');
    if (btnDetailKta) btnDetailKta.addEventListener('click', function () {
      if (typeof erosiSawahOverlayLayer !== 'undefined' && erosiSawahOverlayLayer) {
        var rows = [];
        erosiSawahOverlayLayer.eachLayer(function (l) {
          if (l.feature && l.feature.properties) {
            var p = l.feature.properties;
            rows.push({ Nama: p.namaobj || p.nmobj || '-', Luas: p.luas_ha ? p.luas_ha + ' ha' : '-', Erosi: p.erosi || p.koderosi || '-' });
          }
        });
        showDetailPopup('Detail KTA Overlay', makeDetailTable(rows));
      }
    });

    /* NDVI */
    var btnClearNdvi = document.getElementById('btnClearNdvi');
    if (btnClearNdvi) btnClearNdvi.addEventListener('click', function () { if (typeof window.clearNdviAnalysis === 'function') window.clearNdviAnalysis(); hideBtn('btnClearNdvi'); hideBtn('btnDetailNdvi'); });
    var btnRunNdvi = document.getElementById('btnRunNdvi');
    if (btnRunNdvi) {
      btnRunNdvi.addEventListener('click', function () {
        setTimeout(function () {
          if (typeof ndviLayer !== 'undefined' && ndviLayer) {
            showBtn('btnClearNdvi'); showBtn('btnDetailNdvi');
          }
        }, 1500);
      });
    }
    var btnDetailNdvi = document.getElementById('btnDetailNdvi');
    if (btnDetailNdvi) btnDetailNdvi.addEventListener('click', function () {
      var report = document.querySelector('#geotani-ndvi-panel .ndvi-report, #geotani-ndvi-panel [id*=report]');
      if (report) { showDetailPopup('Detail NDVI', report.innerHTML); return; }
      showDetailPopup('Detail NDVI', '<em>Analisis sedang ditampilkan di peta. Gunakan popup pada polygon untuk detail.</em>');
    });

    /* Landcover */
    var btnClearLandcover = document.getElementById('btnClearLandcover');
    if (btnClearLandcover) btnClearLandcover.addEventListener('click', function () { if (typeof window.clearLandcoverAnalysis === 'function') window.clearLandcoverAnalysis(); hideBtn('btnClearLandcover'); hideBtn('btnDetailLandcover'); });
    var btnRunLandcover = document.getElementById('btnRunLandcover');
    if (btnRunLandcover) {
      btnRunLandcover.addEventListener('click', function () {
        setTimeout(function () {
          if (typeof landcoverLayer !== 'undefined' && landcoverLayer) {
            showBtn('btnClearLandcover'); showBtn('btnDetailLandcover');
          }
        }, 1500);
      });
    }
    var btnDetailLandcover = document.getElementById('btnDetailLandcover');
    if (btnDetailLandcover) btnDetailLandcover.addEventListener('click', function () {
      var report = document.querySelector('#geotani-landcover-panel .landcover-report, #geotani-landcover-panel [id*=report]');
      if (report) { showDetailPopup('Detail Land Cover', report.innerHTML); return; }
      showDetailPopup('Detail Land Cover', '<em>Analisis sedang ditampilkan di peta. Gunakan popup pada polygon untuk detail.</em>');
    });

    /* Satupeta */
    var btnClearSatupeta = document.getElementById('btnClearSatupeta');
    if (btnClearSatupeta) btnClearSatupeta.addEventListener('click', function () { if (typeof SatupetaDownloader !== 'undefined') SatupetaDownloader.clearSelection(); hideBtn('btnClearSatupeta'); hideBtn('btnDetailSatupeta'); });
    var origFetchDisplay = window.SatupetaDownloader && SatupetaDownloader.run;
    if (typeof SatupetaDownloader !== 'undefined') {
      var origRun = SatupetaDownloader.run;
      SatupetaDownloader.run = function (kode) {
        if (typeof origRun === 'function') origRun.call(SatupetaDownloader, kode);
        setTimeout(function () {
          var info = document.getElementById('satupetaInfo');
          if (info && info.style.display !== 'none' && info.innerHTML.trim()) {
            showBtn('btnClearSatupeta'); showBtn('btnDetailSatupeta');
          }
        }, 1500);
      };
    }
    var btnDetailSatupeta = document.getElementById('btnDetailSatupeta');
    if (btnDetailSatupeta) btnDetailSatupeta.addEventListener('click', function () {
      var info = document.getElementById('satupetaInfo');
      if (info) showDetailPopup('Detail Penggunaan Tanah', info.innerHTML);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGeotaniButtons);
  } else {
    initGeotaniButtons();
  }
