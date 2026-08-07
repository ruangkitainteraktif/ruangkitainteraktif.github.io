  // 1. Inisialisasi Peta
  const map = L.map('map', { zoomControl: false }).setView([-7.24685, 112.73758], 13);

  const baseTileLayers = {
    'carto-light': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: 'Mas Pannn'
    }),
    'osm': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }),
    'esri-satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Mas Pannn'
    }),
    'rupabumi': L.tileLayer('https://geoservices.big.go.id/rbi/rest/services/BASEMAP/Rupabumi_Indonesia/MapServer/tile/{z}/{y}/{x}?blankTile=false', {
      maxZoom: 18,
      attribution: '&copy; BIG - Badan Informasi Geospasial'
    }),
    'carto-dark': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: 'Mas Pannn'
    })
  };

  let currentBasemapName = 'esri-satellite';
  let currentRdtrOpacity = 0.8;

  function setBaseMap(name) {
    const key = baseTileLayers[name] ? name : 'esri-satellite';
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

  const basemapSelect = document.getElementById('basemapSelect');
  if (basemapSelect) {
    basemapSelect.value = currentBasemapName;
    basemapSelect.addEventListener('change', function() {
      setBaseMap(this.value);
    });
  }

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
        // 1. Matikan layer angin (checkbox-driven)
        const toggles = [
          'toggleWindAnim'
        ];
        toggles.forEach(id => {
          const el = document.getElementById(id);
          if (el && el.checked) {
            el.checked = false;
            el.dispatchEvent(new Event('change'));
          }
        });

        // 2. Matikan GeoID boundary layer
        if (typeof geoidBoundaryLayer !== 'undefined' && geoidBoundaryLayer && map.hasLayer(geoidBoundaryLayer)) {
          map.removeLayer(geoidBoundaryLayer);
          geoidBoundaryLayer = null;
        }

        // 3. Hapus map click marker
        if (mapClickMarker && map.hasLayer(mapClickMarker)) {
          map.removeLayer(mapClickMarker);
          mapClickMarker = null;
        }

        // 4. Bersihkan marker grup
        if (weatherMarkersGroup) weatherMarkersGroup.clearLayers();
        if (selectedWeatherGroup) selectedWeatherGroup.clearLayers();
        if (earthquakeMarkerGroup) earthquakeMarkerGroup.clearLayers();

        // 5. Matikan wind animation
        if (typeof toggleWindAnimation === 'function') toggleWindAnimation(false);
        const windControls = document.getElementById('windControls');
        if (windControls) windControls.style.display = 'none';

        // 6. Reset detail panel
        const detailPanel = document.getElementById('detail-panel');
        if (detailPanel) detailPanel.classList.add('hidden');
        const showBtn = document.getElementById('show-detail-btn');
        if (showBtn) showBtn.style.display = 'block';

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
  const earthquakeMarkerGroup = L.layerGroup().addTo(map);
