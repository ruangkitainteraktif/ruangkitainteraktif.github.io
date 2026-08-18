  // EPSG:54034 (World Mollweide) for Pertanian Sawah layer
  if (typeof proj4 !== 'undefined') {
    proj4.defs('EPSG:54034', '+proj=moll +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs');
  }

  // 1. Inisialisasi Peta
  // Pusat awal mengikuti extent layer IGTPR ATR/BPN: BIDANG_JAKARTA_CLP.
  const map = L.map('map', { zoomControl: false, preferCanvas: true }).setView([-7.249, 112.751], 12);

L.control.scale({
  position: 'bottomleft',
  maxWidth: 200,
  metric: true,
  imperial: false
}).addTo(map);

  const baseTileLayers = {
    'carto-light': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: 'Mas Pannn'
    }),
    'osm': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: 'Mas Pannn'
    }),
    'esri-satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Mas Pannn'
    }),
    'rupabumi': L.tileLayer('https://geoservices.big.go.id/rbi/rest/services/BASEMAP/Rupabumi_Indonesia/MapServer/tile/{z}/{y}/{x}?blankTile=false', {
      maxZoom: 18,
      attribution: 'Mas Pannn'
    }),
    'carto-dark': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: 'Mas Pannn'
    }),
    'google-maps': L.tileLayer('https://mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 19,
      attribution: 'Mas Pannn'
    }),
    'google-terrain': L.tileLayer('https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
      maxZoom: 19,
      attribution: 'Mas Pannn'
    }),
    'google-traffic': L.tileLayer('https://mt0.google.com/vt?lyrs=s@159000000,traffic|seconds_into_week:-1&style=3&x={x}&y={y}&z={z}', {
      maxZoom: 19,
      attribution: 'Mas Pannn'
    })
  };

  let currentBasemapName = 'google-maps';
  let currentRdtrOpacity = 0.8;

  function setBaseMap(name) {
    const key = baseTileLayers[name] ? name : 'google-maps';
    Object.entries(baseTileLayers).forEach(([layerName, layer]) => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    });
    baseTileLayers[key].addTo(map);
    currentBasemapName = key;
    const select = document.getElementById('basemapSelect');
    if (select) select.value = key;
  }

  function setRdtrOpacity(value) {
    currentRdtrOpacity = Number(value);
    const valueText = document.getElementById('opacityValue');
    if (valueText) valueText.textContent = currentRdtrOpacity.toFixed(1);
  }

  function setMapLocked(locked) {
    if (locked) {
      map.dragging.disable();
      map.touchZoom.disable();
      map.doubleClickZoom.disable();
      map.scrollWheelZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();
    } else {
      map.dragging.enable();
      map.touchZoom.enable();
      map.doubleClickZoom.enable();
      map.scrollWheelZoom.enable();
      map.boxZoom.enable();
      map.keyboard.enable();
    }
  }

  setBaseMap(currentBasemapName);
  setRdtrOpacity(currentRdtrOpacity);
  setMapLocked(false);

  L.control.locate({
    position: 'bottomright',
    flyTo: true,
    setView: 'untilPanOrZoom',
    keepCurrentZoomLevel: false,
    initialZoomLevel: 16,
    showPopup: false,
    strings: {
      title: 'Tampilkan lokasi saya',
      popup: 'Anda berada dalam radius {distance} {unit} dari titik ini',
      outsideMapBoundsMsg: 'Lokasi Anda berada di luar area peta'
    },
    locateOptions: {
      enableHighAccuracy: true,
      maxZoom: 16,
      timeout: 12000,
      maximumAge: 0
    },
    markerStyle: {
      radius: 8,
      color: '#ffffff',
      weight: 3,
      fillColor: '#0879bf',
      fillOpacity: 1
    },
    circleStyle: {
      color: '#0879bf',
      weight: 1,
      fillColor: '#57c7e8',
      fillOpacity: 0.16
    }
  }).addTo(map);

  var locateA = document.querySelector('.leaflet-control-locate a');
  if (locateA) {
    var locateSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    locateSvg.setAttribute('viewBox', '0 0 24 24');
    locateSvg.setAttribute('width', '22');
    locateSvg.setAttribute('height', '22');
    locateSvg.setAttribute('fill', 'none');
    locateSvg.setAttribute('stroke', 'currentColor');
    locateSvg.setAttribute('stroke-width', '2');
    locateSvg.setAttribute('stroke-linecap', 'round');
    locateSvg.setAttribute('stroke-linejoin', 'round');
    locateSvg.innerHTML = '<circle cx="12" cy="12" r="3"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/>';
    locateA.prepend(locateSvg);
  }

  // Detail Panel Toggle Control
  const DetailPanelControl = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() {
      const btn = L.DomUtil.create('button', 'detail-panel-btn');
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>';
      btn.title = 'Panel Detail Administrasi';
      btn.setAttribute('aria-label', 'Buka/tutup panel detail administrasi');
      L.DomEvent.disableClickPropagation(btn);
      L.DomEvent.disableScrollPropagation(btn);
      btn.addEventListener('click', () => {
        toggleDetailPanel();
      });
      window._detailPanelBtn = btn;
      return btn;
    }
  });
  new DetailPanelControl().addTo(map);

  // Basemap Control
  const basemapLabels = {
    'carto-light': 'Carto Light',
    'carto-dark': 'Carto Dark',
    'osm': 'Open Street Map',
    'esri-satellite': 'Esri Satellite',
    'rupabumi': 'Rupabumi Indonesia',
    'google-maps': 'Google Maps',
    'google-terrain': 'Google Terrain',
    'google-traffic': 'Google Traffic'
  };
  const BasemapControl = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() {
      const wrap = L.DomUtil.create('div', 'basemap-control-wrap');
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

      const dropdown = L.DomUtil.create('div', 'basemap-dropdown', wrap);
      dropdown.style.display = 'none';
      Object.entries(basemapLabels).forEach(([key, label]) => {
        const opt = L.DomUtil.create('div', 'basemap-option', dropdown);
        opt.textContent = label;
        opt.dataset.value = key;
        if (key === currentBasemapName) opt.classList.add('active');
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          setBaseMap(key);
          dropdown.querySelectorAll('.basemap-option').forEach(o => o.classList.remove('active'));
          opt.classList.add('active');
          dropdown.style.display = 'none';
        });
      });

      const btn = L.DomUtil.create('button', 'basemap-btn', wrap);
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>';
      btn.title = 'Pilih Basemap';
      btn.setAttribute('aria-label', 'Ganti basemap');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = dropdown.style.display === 'block';
        dropdown.style.display = isVisible ? 'none' : 'block';
      });

      document.addEventListener('click', () => { dropdown.style.display = 'none'; });
      return wrap;
    }
  });
  new BasemapControl().addTo(map);

  // Reset Layers Control
  const ResetLayersControl = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() {
      const btn = L.DomUtil.create('button', 'reset-layers-btn');
      btn.innerHTML = '↺';
      btn.title = 'Reset semua layer';
      btn.setAttribute('aria-label', 'Reset semua layer aktif');
      L.DomEvent.disableClickPropagation(btn);
      L.DomEvent.disableScrollPropagation(btn);
      btn.addEventListener('click', () => {
        // 1. Matikan layer jalan & angin (checkbox-driven)
        const toggles = [
          'toggleTollRoad', 'toggleNonTollRoad', 'toggleNationalRoad',
          'toggleWindAnim', 'toggleWindRgb', 'toggleRhRgb', 'toggleTp24Rgb', 'toggleSawahDilindungi', 'toggleSawahNasional50k',
          'toggleBppLayer', 'toggleSawitLayer', 'toggleErosiLayer', 'toggleHotspotLayer'
        ];
        toggles.forEach(id => {
          const el = document.getElementById(id);
          if (el && el.checked) {
            el.checked = false;
            el.dispatchEvent(new Event('change'));
          }
        });

        // 2. Matikan semua geoportal WMS/WFS layers
        geoportalLayers.forEach((layer) => {
          if (map.hasLayer(layer)) map.removeLayer(layer);
        });

        // 3. Matikan ArcGIS Sawah & Kawasan layers
        if (typeof arcgisSawahLayers !== 'undefined') {
          Object.keys(arcgisSawahLayers).forEach(key => {
            if (arcgisSawahLayers[key] && map.hasLayer(arcgisSawahLayers[key])) {
              map.removeLayer(arcgisSawahLayers[key]);
            }
          });
        }

        // 3b. Uncheck geotani jsTree nodes
        var geotaniTree = $('#geotaniLayerTree').jstree(true);
        if (geotaniTree) {
          geotaniTree.uncheck_all();
        }

        // 3c. Uncheck geoportal jsTree nodes
        var geoportalTree = $('#geoportalLayerList').jstree(true);
        if (geoportalTree) {
          geoportalTree.uncheck_all();
        }

        // 4. Matikan Sawah Dilindungi & Sawah Nasional (non-checkbox fallback)
        if (typeof sawahDilindungiLayer !== 'undefined' && sawahDilindungiLayer && map.hasLayer(sawahDilindungiLayer)) {
          map.removeLayer(sawahDilindungiLayer);
          sawahDilindungiLayer = null;
        }
        if (typeof sawahNasionalLayer !== 'undefined' && sawahNasionalLayer && map.hasLayer(sawahNasionalLayer)) {
          map.removeLayer(sawahNasionalLayer);
          sawahNasionalLayer = null;
        }

        // 4b. Matikan Erosi KTA layer (non-checkbox fallback)
        if (typeof erosiLayer !== 'undefined' && erosiLayer && map.hasLayer(erosiLayer)) {
          map.removeLayer(erosiLayer);
          erosiLayer = null;
        }

        // 5. Matikan GeoID boundary layer
        if (typeof geoidBoundaryLayer !== 'undefined' && geoidBoundaryLayer && map.hasLayer(geoidBoundaryLayer)) {
          map.removeLayer(geoidBoundaryLayer);
          geoidBoundaryLayer = null;
        }
        if (typeof clearGeoidChildBoundaries === 'function') clearGeoidChildBoundaries();

        // 5b. Bersihkan hasil analisis GeoTani: KTA, LBS, dan NDVI.
        if (typeof clearOverlay === 'function') clearOverlay();
        if (typeof clearLbsAnalysis === 'function') clearLbsAnalysis();
        if (typeof clearNdviAnalysis === 'function') clearNdviAnalysis();
        if (typeof clearLandcoverAnalysis === 'function') clearLandcoverAnalysis();

        // 5d. Bersihkan file yang dimuat lewat Alat Analisis, termasuk GPX/KML
        // serta marker, jejak, dan kartu Animasi Track.
        if (typeof clearAlatLayers === 'function') clearAlatLayers();

        // 5c. Sembunyikan choropleth BPS indikator
        if (typeof hideChoropleth === 'function') hideChoropleth();

        // 5d. Hapus layer geopangan (choropleth harga pangan)
        if (typeof clearGeopanganLayers === 'function') clearGeopanganLayers();

        // 6. Hapus map click marker
        if (mapClickMarker && map.hasLayer(mapClickMarker)) {
          map.removeLayer(mapClickMarker);
          mapClickMarker = null;
        }

        // 7. Bersihkan marker grup
        if (weatherMarkersGroup) weatherMarkersGroup.clearLayers();
        if (selectedWeatherGroup) selectedWeatherGroup.clearLayers();
        if (cctvMarkersGroup) cctvMarkersGroup.clearLayers();
        if (earthquakeMarkerGroup) earthquakeMarkerGroup.clearLayers();
        if (typeof _gempaRadiusCircle !== 'undefined' && _gempaRadiusCircle) { map.removeLayer(_gempaRadiusCircle); _gempaRadiusCircle = null; }
        if (typeof _insightQuakeRadius !== 'undefined' && _insightQuakeRadius) { map.removeLayer(_insightQuakeRadius); _insightQuakeRadius = null; }
        if (typeof _popupMarkerGroup !== 'undefined' && _popupMarkerGroup) { _popupMarkerGroup.clearLayers(); _popupMarkerGroup = null; }
        if (typeof _faultLayerCleanup === 'function') _faultLayerCleanup();
        if (typeof _faultNewLayerCleanup === 'function') _faultNewLayerCleanup();
        if (typeof _jalurEvakuasiCleanup === 'function') _jalurEvakuasiCleanup();
        if (typeof _finiteFaultNTTCleanup === 'function') _finiteFaultNTTCleanup();
        if (typeof _worldPlatesLayerCleanup === 'function') _worldPlatesLayerCleanup();

        // Bersihkan layer sensor & katalog gempa
        document.querySelectorAll('#toggleKatalogGempa, #toggleSensorSeismic, #toggleSensorGlobal, #toggleHistoryGempa').forEach(function (cb) {
          if (cb) cb.checked = false;
        });
        if (typeof isKatalogGempaActive === 'function' && isKatalogGempaActive()) {
          document.getElementById('toggleKatalogGempa')?.dispatchEvent(new Event('change'));
        }
        if (typeof isSensorSeismicActive === 'function' && isSensorSeismicActive()) {
          document.getElementById('toggleSensorSeismic')?.dispatchEvent(new Event('change'));
        }
        if (typeof isSensorGlobalActive === 'function' && isSensorGlobalActive()) {
          document.getElementById('toggleSensorGlobal')?.dispatchEvent(new Event('change'));
        }
        if (typeof isHistoryGempaActive === 'function' && isHistoryGempaActive()) {
          document.getElementById('toggleHistoryGempa')?.dispatchEvent(new Event('change'));
        }

        // Bersihkan layer gunung api
        if (document.getElementById('toggleVolcanoLayer')) {
          document.getElementById('toggleVolcanoLayer').checked = false;
        }
        if (typeof isVolcanoLayerActive === 'function' && isVolcanoLayerActive()) {
          document.getElementById('toggleVolcanoLayer')?.dispatchEvent(new Event('change'));
        }

        // Bersihkan layer gerakan tanah
        if (document.getElementById('toggleGertanLayer')) {
          document.getElementById('toggleGertanLayer').checked = false;
        }
        if (typeof isGertanLayerActive === 'function' && isGertanLayerActive()) {
          document.getElementById('toggleGertanLayer')?.dispatchEvent(new Event('change'));
        }

        // Bersihkan layer KRB Gunung Api
        if (document.getElementById('toggleKrbGunungApi')) {
          document.getElementById('toggleKrbGunungApi').checked = false;
        }
        if (typeof isKrbGunungApiActive === 'function' && isKrbGunungApiActive()) {
          document.getElementById('toggleKrbGunungApi')?.dispatchEvent(new Event('change'));
        }

        // Bersihkan layer KRB Titik Gas Vulkanik
        if (document.getElementById('toggleKrbTitik')) {
          document.getElementById('toggleKrbTitik').checked = false;
        }
        if (typeof isKrbTitikActive === 'function' && isKrbTitikActive()) {
          document.getElementById('toggleKrbTitik')?.dispatchEvent(new Event('change'));
        }

        // Bersihkan layer gempa NTT
        if (document.getElementById('toggleGempaNTT')) {
          document.getElementById('toggleGempaNTT').checked = false;
        }
        if (typeof isGempaNTTActive === 'function' && isGempaNTTActive()) {
          document.getElementById('toggleGempaNTT')?.dispatchEvent(new Event('change'));
        }

        // Bersihkan layer geologi BIG
        var bigGeoToggles = ['togglePetaGeologi', 'toggleGeostruktur', 'togglePatahanAktif', 'toggleLikuifaksi', 'toggleKarst'];
        var bigGeoFns = ['isPetaGeologiActive', 'isGeostrukturActive', 'isPatahanAktifActive', 'isLikuifaksiActive', 'isKarstActive'];
        bigGeoToggles.forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.checked = false;
        });
        bigGeoFns.forEach(function (fn, i) {
          if (typeof window[fn] === 'function' && window[fn]()) {
            document.getElementById(bigGeoToggles[i])?.dispatchEvent(new Event('change'));
          }
        });

        // 8. Uncheck semua checkbox geoportal & arcgis
        document.querySelectorAll('[data-geolayer]').forEach(cb => { cb.checked = false; });

        // 9. Matikan wind animation
        if (typeof toggleWindAnimation === 'function') toggleWindAnimation(false);
        const windControls = document.getElementById('windControls');
        if (windControls) windControls.style.display = 'none';

        // 10. Reset detail panel
        const detailPanel = document.getElementById('detail-panel');
        if (detailPanel) detailPanel.classList.add('hidden');
        const detailBtn = window._detailPanelBtn;
        if (detailBtn) detailBtn.classList.remove('active');

        btn.classList.add('reset-flash');
        setTimeout(() => btn.classList.remove('reset-flash'), 400);
      });
      return btn;
    }
  });
  new ResetLayersControl().addTo(map);

  let selectedWilayahId = "3313000000";
  let selectedRtrId = "001";
  let mapClickMarker = null;
  let wilayahLookup = [];
  let selectedWeatherMarker = null;

  const weatherMarkersGroup = L.layerGroup().addTo(map);
  const selectedWeatherGroup = L.layerGroup().addTo(map);
  const cctvMarkersGroup = L.markerClusterGroup({ maxClusterRadius: 45 }).addTo(map);
  const earthquakeMarkerGroup = L.layerGroup().addTo(map);
  const geoportalLayers = new Map();
  const GEOPORTAL_WMS_URL = 'https://pisda.sukoharjokab.go.id/geoserver/ows';
  const PEMPROV_WMS_URL = 'https://geoserver.jatimprov.go.id/geoserver/wms';
  const MAGELANG_WMS_URL = 'https://geoportal.magelangkota.go.id/geoserver/ows';
  const IGTPR_WMS_URL = 'https://igtpr.atrbpn.go.id/geoserver/ows';
  const BHUMI_WMS_URL = 'https://atlas.atrbpn.go.id/geoserver/ows';
  const BPS_WMS_URL = 'https://geoserver.bps.go.id/ows';
