  // EPSG:54034 (World Mollweide) for Pertanian Sawah layer
  if (typeof proj4 !== 'undefined') {
    proj4.defs('EPSG:54034', '+proj=moll +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs');
  }

  // 1. Inisialisasi Peta
  // Pusat awal: Tengah Indonesia (desktop) atau Kalimantan (mobile)
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
  const initialCenter = isMobile ? [-1.5, 116.0] : [-2.5, 118.0];
  const initialZoom = isMobile ? 5 : 5;
  const map = L.map('map', { zoomControl: false, preferCanvas: true, maxZoom: 19, minZoom: 4 }).setView(initialCenter, initialZoom);

L.control.scale({
  position: 'bottomleft',
  maxWidth: 120,
  metric: true,
  imperial: false
}).addTo(map);

  const baseTileLayers = {
    'osm': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: 'Mas Pannn'
    }),
    'esri-satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Mas Pannn'
    }),
    'esri-dark-gray': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Esri'
    }),
    'esri-topo': L.tileLayer('https://server.arcgisonline.com/arcgis/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Esri'
    }),
    'esri-terrain': L.tileLayer('https://server.arcgisonline.com/arcgis/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 13,
      attribution: 'Esri'
    }),
    'esri-street': L.tileLayer('https://server.arcgisonline.com/arcgis/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Esri'
    }),
    'esri-shaded-relief': L.tileLayer('https://server.arcgisonline.com/arcgis/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 13,
      attribution: 'Esri'
    }),
    'esri-physical': L.tileLayer('https://server.arcgisonline.com/arcgis/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 8,
      attribution: 'Esri'
    }),
    'esri-natgeo': L.tileLayer('https://server.arcgisonline.com/arcgis/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 16,
      attribution: 'Esri'
    }),
    'rupabumi': L.tileLayer('https://geoservices.big.go.id/rbi/rest/services/BASEMAP/Rupabumi_Indonesia/MapServer/tile/{z}/{y}/{x}?blankTile=false', {
      maxZoom: 18,
      attribution: 'Mas Pannn'
    }),
    'google-maps': L.tileLayer('https://mt0.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 19,
      attribution: 'Mas Pannn'
    }),
    'modis-terra': L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{Time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg', {
      maxZoom: 12,
      minZoom: 0,
      attribution: 'NASA GIBS',
      Time: new Date().toISOString().slice(0, 10)
    }),
    'modis-aqua': L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Aqua_CorrectedReflectance_TrueColor/default/{Time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg', {
      maxZoom: 12,
      minZoom: 0,
      attribution: 'NASA GIBS',
      Time: new Date().toISOString().slice(0, 10)
    }),
    'viirs-noaa20': L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/{Time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpeg', {
      maxZoom: 9,
      minZoom: 0,
      Time: (function () { var d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })(),
      attribution: 'NASA GIBS'
    }),
    'viirs-noaa21': L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA21_CorrectedReflectance_TrueColor/default/{Time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpeg', {
      maxZoom: 9,
      minZoom: 0,
      Time: (function () { var d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })(),
      attribution: 'NASA GIBS'
    }),
    'bmkg-himawari': L.tileLayer('https://satellite.bmkg.go.id/api22/tile/{z}/{x}/{y}.png?tiletype=himawari9&modelname=himawari9&param=EH&baserun=', {
      maxZoom: 10,
      minZoom: 3,
      tms: true,
      attribution: 'BMKG Himawari-9'
    }),
    'bmkg-himawari-fd': L.tileLayer('https://satellite.bmkg.go.id/api22/tile/{z}/{x}/{y}.png?tiletype=himawari9&modelname=himawari9fd&param=EH&baserun=', {
      maxZoom: 10,
      minZoom: 3,
      tms: true,
      attribution: 'BMKG Himawari-9 FD'
    }),
    'bmkg-himawari-hires': L.tileLayer('https://satellite.bmkg.go.id/api22/tile/{z}/{x}/{y}.png?tiletype=himawari9&modelname=himawari9hires&param=VS&baserun=', {
      maxZoom: 10,
      minZoom: 3,
      tms: true,
      attribution: 'BMKG Himawari-9 Hi-Res'
    }),
    'bmkg-gk2a': L.tileLayer('https://satellite.bmkg.go.id/api22/tile/{z}/{x}/{y}.png?tiletype=himawari9&modelname=gk2a&param=EH&baserun=', {
      maxZoom: 10,
      minZoom: 3,
      tms: true,
      attribution: 'BMKG GK-2A'
    }),
    'bmkg-gk2a-wv': L.tileLayer('https://satellite.bmkg.go.id/api22/tile/{z}/{x}/{y}.png?tiletype=himawari9&modelname=gk2a&param=WV&baserun=', {
      maxZoom: 10,
      minZoom: 3,
      maxNativeZoom: 3,
      tms: true,
      attribution: 'BMKG GK-2A Water Vapor'
    }),
    'noaa-true-color': L.tileLayer('https://gis.nnvl.noaa.gov/arcgis/rest/services/TRUE/TRUE_current/ImageServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      minZoom: 0,
      attribution: 'NOAA NNVL True Color'
    }),
    'noaa-goes-ir': L.tileLayer('https://gis.nnvl.noaa.gov/arcgis/rest/services/GOES/GOES_current/ImageServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      minZoom: 0,
      attribution: 'NOAA NNVL GOES IR'
    }),
    'sentinel2': L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg', {
      maxZoom: 13,
      minZoom: 0,
      attribution: 'Sentinel-2 cloudless by EOX'
    })
  };

  const airVisualLayers = {
    'airvisual-pm25': L.tileLayer('https://osm.airvisual.net/cog/pm25/tiles/{z}/{x}/{y}.png', { maxZoom: 12, minZoom: 0, opacity: 0.7, attribution: 'AirVisual' }),
    'airvisual-pm10': L.tileLayer('https://osm.airvisual.net/cog/pm10/tiles/{z}/{x}/{y}.png', { maxZoom: 12, minZoom: 0, opacity: 0.7, attribution: 'AirVisual' }),
    'airvisual-o3': L.tileLayer('https://osm.airvisual.net/cog/o3/tiles/{z}/{x}/{y}.png', { maxZoom: 12, minZoom: 0, opacity: 0.7, attribution: 'AirVisual' }),
    'airvisual-no2': L.tileLayer('https://osm.airvisual.net/cog/no2/tiles/{z}/{x}/{y}.png', { maxZoom: 12, minZoom: 0, opacity: 0.7, attribution: 'AirVisual' }),
    'airvisual-so2': L.tileLayer('https://osm.airvisual.net/cog/so2/tiles/{z}/{x}/{y}.png', { maxZoom: 12, minZoom: 0, opacity: 0.7, attribution: 'AirVisual' }),
    'airvisual-co': L.tileLayer('https://osm.airvisual.net/cog/co/tiles/{z}/{x}/{y}.png', { maxZoom: 12, minZoom: 0, opacity: 0.7, attribution: 'AirVisual' })
  };

  let currentBasemapName = 'esri-dark-gray';
  window.currentBasemapName = currentBasemapName;
  let baseBasemapName = 'esri-dark-gray';
  let currentRdtrOpacity = 0.8;

  function getYesterdayDate() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  function getGibsDateUrl(layerId, ext, dateStr) {
    return 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/' + layerId + '/default/' + dateStr + '/GoogleMapsCompatible_Level9/{z}/{y}/{x}.' + ext;
  }

  var BMKG_TILETYPE = {
    'bmkg-himawari': 'himawari9',
    'bmkg-himawari-fd': 'himawari9fd',
    'bmkg-himawari-hires': 'himawari9hires',
    'bmkg-gk2a': 'gk2a',
    'bmkg-gk2a-wv': 'gk2a'
  };
  var BMKG_PARAMS = {
    'bmkg-himawari': 'EH',
    'bmkg-himawari-fd': 'EH',
    'bmkg-himawari-hires': 'VS',
    'bmkg-gk2a': 'EH',
    'bmkg-gk2a-wv': 'WV'
  };
  window._bmkgModelrunCache = null;

  var _noaaBoundaryLayer = null;
  var NOAA_BASEMAPS = ['noaa-true-color', 'noaa-goes-ir'];

  function loadNoaaBoundary() {
    if (_noaaBoundaryLayer) { _noaaBoundaryLayer.addTo(map); return; }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'assets/data/bps/geojson/provinsi.geojson', true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var geojson = JSON.parse(xhr.responseText);
          _noaaBoundaryLayer = L.geoJSON(geojson, {
            style: { color: '#ffeb3b', weight: 2, opacity: 0.8, fillColor: '#ffeb3b', fillOpacity: 0 },
            interactive: false
          }).addTo(map);
        } catch (e) {}
      }
    };
    xhr.send();
  }

  function removeNoaaBoundary() {
    if (_noaaBoundaryLayer && map.hasLayer(_noaaBoundaryLayer)) {
      map.removeLayer(_noaaBoundaryLayer);
    }
  }

  // ── Toast Notification ──
  var _toastEl = null;
  var _toastTimer = null;
  var _tileErrorFired = {};

  function showMapToast(msg, type) {
    if (_toastEl) { _toastEl.remove(); clearTimeout(_toastTimer); }
    var el = document.createElement('div');
    el.className = 'map-toast' + (type === 'warn' ? ' toast-warn' : type === 'info' ? ' toast-info' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    _toastEl = el;
    _toastTimer = setTimeout(function () { el.remove(); _toastEl = null; }, 4000);
  }
  window.showMapToast = showMapToast;

  var SATELLITE_ERROR_MSG = {
    'bmkg-himawari': 'Citra BMKG Himawari-9 tidak tersedia saat ini.',
    'bmkg-himawari-fd': 'Citra BMKG Himawari-9 Full Disk tidak tersedia.',
    'bmkg-himawari-hires': 'Citra BMKG Himawari-9 Hi-Res tidak tersedia.',
    'bmkg-gk2a': 'Citra BMKG GK-2A tidak tersedia saat ini.',
    'bmkg-gk2a-wv': 'Citra BMKG GK-2A Water Vapor tidak tersedia.',
    'modis-terra': 'Citra NASA GIBS MODIS Terra tidak tersedia.',
    'modis-aqua': 'Citra NASA GIBS MODIS Aqua tidak tersedia.',
    'viirs-noaa20': 'Citra NASA GIBS VIIRS NOAA-20 tidak tersedia.',
    'viirs-noaa21': 'Citra NASA GIBS VIIRS NOAA-21 tidak tersedia.',
    'noaa-true-color': 'Citra NOAA True Color tidak tersedia.',
    'noaa-goes-ir': 'Citra NOAA GOES IR tidak tersedia.'
  };

  var SATELLITE_TILES = ['bmkg-himawari', 'bmkg-himawari-fd', 'bmkg-himawari-hires', 'bmkg-gk2a', 'bmkg-gk2a-wv',
    'modis-terra', 'modis-aqua', 'viirs-noaa20', 'viirs-noaa21',
    'noaa-true-color', 'noaa-goes-ir', 'sentinel2'];

  function attachTileError(key) {
    var layer = baseTileLayers[key];
    if (!layer || layer._tileErrorAttached) return;
    layer._tileErrorAttached = true;
    layer.on('tileerror', function () {
      if (_tileErrorFired[key]) return;
      _tileErrorFired[key] = true;
      var msg = SATELLITE_ERROR_MSG[key] || 'Citra satelit tidak tersedia.';
      showMapToast(msg, 'error');
    });
  }

  function setBaseMap(name) {
    var isHillshade = (name === 'hillshade-indonesia');
    var isPth = (name === 'topografi-pth');
    var isBmkg = BMKG_TILETYPE.hasOwnProperty(name);

    _tileErrorFired = {};

    Object.entries(baseTileLayers).forEach(function (entry) {
      if (map.hasLayer(entry[1])) map.removeLayer(entry[1]);
    });

    if (isHillshade) {
      baseTileLayers[baseBasemapName].addTo(map);
      if (typeof bnpbHillshade !== 'undefined') bnpbHillshade.show();
    } else if (isPth) {
      baseTileLayers[baseBasemapName].addTo(map);
      if (typeof bnpbHillshade !== 'undefined') bnpbHillshade.showPth();
    } else {
      if (typeof bnpbHillshade !== 'undefined') bnpbHillshade.hide();
      if (typeof bnpbHillshade !== 'undefined') bnpbHillshade.hidePth();
      baseBasemapName = name;
      if (name === 'modis-terra') {
        baseTileLayers[name].setUrl(getGibsDateUrl('MODIS_Terra_CorrectedReflectance_TrueColor', 'jpg', getYesterdayDate()));
        baseTileLayers[name].addTo(map);
        attachTileError(name);
      } else if (name === 'modis-aqua') {
        baseTileLayers[name].setUrl(getGibsDateUrl('MODIS_Aqua_CorrectedReflectance_TrueColor', 'jpg', getYesterdayDate()));
        baseTileLayers[name].addTo(map);
        attachTileError(name);
      } else if (name === 'viirs-noaa20') {
        baseTileLayers[name].setUrl(getGibsDateUrl('VIIRS_NOAA20_CorrectedReflectance_TrueColor', 'jpeg', getYesterdayDate()));
        baseTileLayers[name].addTo(map);
        attachTileError(name);
      } else if (name === 'viirs-noaa21') {
        baseTileLayers[name].setUrl(getGibsDateUrl('VIIRS_NOAA21_CorrectedReflectance_TrueColor', 'jpeg', getYesterdayDate()));
        baseTileLayers[name].addTo(map);
        attachTileError(name);
      } else if (isBmkg) {
        var bmkgLayer = baseTileLayers[name];
        var bmkgModelName = BMKG_TILETYPE[name];
        var bmkgParam = BMKG_PARAMS[name] || 'EH';
        attachTileError(name);
        var bmkgXhr = new XMLHttpRequest();
        bmkgXhr.open('GET', 'https://satellite.bmkg.go.id/api22/modelrun', true);
        bmkgXhr.timeout = 10000;
        bmkgXhr.onerror = function () {
          bmkgLayer.addTo(map);
          if (satelliteBoundary && name !== 'esri-satellite') satelliteBoundary.show(map);
          currentBasemapName = name; window.currentBasemapName = name;
          var sel = document.getElementById('basemapSelect'); if (sel) sel.value = name;
          map.fire('basemapchanged', { basemap: name });
          showMapToast(SATELLITE_ERROR_MSG[name] || 'Citra BMKG tidak tersedia.', 'error');
        };
        bmkgXhr.ontimeout = function () { bmkgXhr.onerror(); };
        bmkgXhr.onreadystatechange = function () {
          if (bmkgXhr.readyState !== 4) return;
          if (bmkgXhr.status >= 200 && bmkgXhr.status < 300) {
            try {
              var data = JSON.parse(bmkgXhr.responseText);
              window._bmkgModelrunCache = data;
              var ts = (data[bmkgModelName] || []).slice().reverse()[0];
              if (ts) {
                bmkgLayer.setUrl('https://satellite.bmkg.go.id/api22/tile/{z}/{x}/{y}.png?tiletype=himawari9&modelname=' + bmkgModelName + '&param=' + bmkgParam + '&baserun=' + encodeURIComponent(ts));
              } else {
                showMapToast(SATELLITE_ERROR_MSG[name] || 'Data BMKG tidak tersedia.', 'warn');
              }
            } catch (e) {
              showMapToast(SATELLITE_ERROR_MSG[name] || 'Gagal memproses data BMKG.', 'error');
            }
          } else {
            bmkgXhr.onerror();
            return;
          }
          bmkgLayer.addTo(map);
          if (satelliteBoundary && name !== 'esri-satellite') satelliteBoundary.show(map);
          currentBasemapName = name; window.currentBasemapName = name;
          var sel = document.getElementById('basemapSelect'); if (sel) sel.value = name;
          map.fire('basemapchanged', { basemap: name });
        };
        bmkgXhr.send();
        return;
      } else if (name === 'noaa-true-color' || name === 'noaa-goes-ir') {
        baseTileLayers[name].addTo(map);
        attachTileError(name);
      } else if (name === 'sentinel2') {
        baseTileLayers[name].addTo(map);
        attachTileError(name);
      } else {
        baseTileLayers[name].addTo(map);
      }
    }

    if (satelliteBoundary) {
      var isSatellite = satelliteBasemapLabels.hasOwnProperty(name);
      if (isSatellite && name !== 'esri-satellite') {
        satelliteBoundary.show(map);
      } else {
        satelliteBoundary.hide(map);
      }
    }

    currentBasemapName = name;
    var select = document.getElementById('basemapSelect');
    if (select) select.value = name;
    map.fire('basemapchanged', { basemap: name });
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

  function applyInitialStartupDefaults() {
    currentBasemapName = 'esri-dark-gray';
    baseBasemapName = 'esri-dark-gray';
    setBaseMap(currentBasemapName);

    var airVisualPm25Toggle = document.getElementById('toggleAirVisualPm25');
    if (airVisualPm25Toggle) {
      airVisualPm25Toggle.checked = true;
      if (typeof window.toggleAirVisualLayer === 'function') {
        window.toggleAirVisualLayer('airvisual-pm25', true);
      }
      if (typeof window.dispatchEvent === 'function') {
        airVisualPm25Toggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (typeof window.toggleAirVisualLayer === 'function') {
      window.toggleAirVisualLayer('airvisual-pm25', true);
    }

    var windToggle = document.getElementById('toggleWindAnim');
    if (windToggle) {
      windToggle.checked = true;
      if (typeof window.toggleWindAnimation === 'function') {
        window.toggleWindAnimation(true);
      }
      if (typeof window.dispatchEvent === 'function') {
        windToggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (typeof window.toggleWindAnimation === 'function') {
      window.toggleWindAnimation(true);
    }

    if (typeof window.activateHujanLayer === 'function' && !window.isHujanLayerActive()) {
      window.activateHujanLayer();
    }
  }

  setRdtrOpacity(currentRdtrOpacity);
  setMapLocked(false);

  /* ── FAB Menu Control (paling bawah) ── */
  const MapFABControl = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd: function () {
      var wrap = L.DomUtil.create('div', 'map-fab-wrap');
      var items = L.DomUtil.create('div', 'map-fab-items');
      var btn = L.DomUtil.create('button', 'map-fab-btn');
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>';
      btn.title = 'Menu Alat';
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);
      btn.addEventListener('click', function () {
        wrap.classList.toggle('map-fab-open');
        var ctrlContainer = wrap.closest('.leaflet-bottom.leaflet-right');
        if (ctrlContainer) ctrlContainer.classList.toggle('map-fab-active');
        if (document.body.classList.contains('geotools-sheet-open') && !document.getElementById('geotools-sheet').classList.contains('gs-sheet-minimized')) {
          minimizeGeotoolsSheet();
        }
        if (document.body.classList.contains('geopangan-sheet-open') && !document.body.classList.contains('geopangan-sheet-minimized')) {
          toggleGeopanganMinimize();
        }
        if (document.body.classList.contains('hotspot-sheet-open') && !document.body.classList.contains('hotspot-sheet-minimized')) {
          toggleHotspotMinimize();
        }
      });
      wrap.appendChild(items);
      wrap.appendChild(btn);
      return wrap;
    }
  });
  var __fabCtrl = new MapFABControl().addTo(map);
  var __fabItems = null;

  function moveToFAB(selector, title) {
    var el = document.querySelector(selector);
    if (!el) return;
    if (!__fabItems) __fabItems = document.querySelector('.map-fab-items');
    if (!__fabItems) return;
    var item = L.DomUtil.create('button', 'map-fab-item');
    item.title = title;
    item.appendChild(el);
    __fabItems.appendChild(item);
    if (el.style.display === 'none') item.style.display = 'none';
    item.addEventListener('click', function (e) {
      e.stopPropagation();
      closeFAB();
      el.click();
    });
  }

  function closeFAB() {
    var w = document.querySelector('.map-fab-wrap');
    if (w) {
      w.classList.remove('map-fab-open');
      var ctrlContainer = w.closest('.leaflet-bottom.leaflet-right');
      if (ctrlContainer) ctrlContainer.classList.remove('map-fab-active');
    }
  }
  map.on('click', closeFAB);

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

  // Hillshade & Batnas toggle (geologi layers)
  document.addEventListener('DOMContentLoaded', function () {
    var hsCb = document.getElementById('toggleHillshade');
    var btCb = document.getElementById('toggleBatnas');
    if (hsCb) hsCb.addEventListener('change', function () {
      if (typeof bnpbHillshade === 'undefined') return;
      if (this.checked) bnpbHillshade.showPth(); else bnpbHillshade.hidePth();
    });
    if (btCb) btCb.addEventListener('change', function () {
      if (typeof bnpbHillshade === 'undefined') return;
      if (this.checked) bnpbHillshade.show(); else bnpbHillshade.hide();
    });
  });

  // Basemap Control
  const vectorBasemapLabels = {
    'osm': 'Open Street Map',
    'rupabumi': 'Rupabumi Indonesia',
    'esri-dark-gray': 'Esri Dark Gray',
    'esri-topo': 'Esri Topographic',
    'esri-terrain': 'Esri Terrain',
    'esri-street': 'Esri Street',
    'esri-shaded-relief': 'Esri Shaded Relief',
    'esri-physical': 'Esri Physical',
    'esri-natgeo': 'Esri National Geographic',
    'google-maps': 'Google Maps'
  };
  const satelliteBasemapLabels = {
    'esri-satellite': 'Esri Satellite',
    'modis-terra': 'MODIS Terra',
    'modis-aqua': 'MODIS Aqua',
    'viirs-noaa20': 'VIIRS NOAA-20',
    'viirs-noaa21': 'VIIRS NOAA-21',
    'bmkg-himawari': 'Himawari-9 IR',
    'bmkg-himawari-fd': 'Himawari-9 Full Disk',
    'bmkg-himawari-hires': 'Himawari-9 Hi-Res',
    'bmkg-gk2a': 'GK-2A',
    'bmkg-gk2a-wv': 'GK-2A Water Vapor',
    'noaa-true-color': 'NOAA True Color',
    'noaa-goes-ir': 'NOAA GOES IR',
    'sentinel2': 'Sentinel-2'
  };

  setBaseMap(currentBasemapName);

  function scheduleInitialStartupDefaults() {
    setTimeout(function () {
      if (typeof window.activateHujanLayer === 'function' || typeof window.toggleWindAnimation === 'function') {
        applyInitialStartupDefaults();
      } else {
        setTimeout(scheduleInitialStartupDefaults, 200);
      }
    }, 150);
  }

  if (document.readyState === 'complete') {
    scheduleInitialStartupDefaults();
  } else {
    window.addEventListener('load', scheduleInitialStartupDefaults, { once: true });
  }

  // Zoom Control
  const ZoomControl = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd: function() {
      const wrap = L.DomUtil.create('div', 'zoom-control-wrap');

      const zoomIn = L.DomUtil.create('button', 'zoom-control-btn zoom-control-in');
      zoomIn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
      zoomIn.title = 'Zoom In';
      zoomIn.setAttribute('aria-label', 'Zoom In');
      zoomIn.addEventListener('click', function(e) {
        e.stopPropagation();
        map.zoomIn();
      });

      const zoomOut = L.DomUtil.create('button', 'zoom-control-btn zoom-control-out');
      zoomOut.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
      zoomOut.title = 'Zoom Out';
      zoomOut.setAttribute('aria-label', 'Zoom Out');
      zoomOut.addEventListener('click', function(e) {
        e.stopPropagation();
        map.zoomOut();
      });

      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

      wrap.appendChild(zoomIn);
      wrap.appendChild(zoomOut);
      return wrap;
    }
  });
  new ZoomControl().addTo(map);

  // Draw & Measure Sidebar
  var _drawSidebarMinimized = false;

  function openDrawSidebar() {
    var sb = document.getElementById('drawSidebar');
    if (!sb) return;
    _drawSidebarMinimized = false;
    sb.classList.remove('dm-sidebar-minimized');
    sb.classList.add('dm-sidebar-open');
    document.body.classList.add('dm-sidebar-open');
  }
  window.openDrawSidebar = openDrawSidebar;

  function closeDrawSidebar() {
    var sb = document.getElementById('drawSidebar');
    if (!sb) return;
    sb.classList.remove('dm-sidebar-open', 'dm-sidebar-minimized');
    _drawSidebarMinimized = false;
    document.body.classList.remove('dm-sidebar-open', 'dm-sidebar-minimized');
  }
  window.closeDrawSidebar = closeDrawSidebar;

  function minimizeDrawSidebar() {
    var sb = document.getElementById('drawSidebar');
    if (!sb) return;
    _drawSidebarMinimized = !_drawSidebarMinimized;
    sb.classList.toggle('dm-sidebar-minimized', _drawSidebarMinimized);
    document.body.classList.toggle('dm-sidebar-minimized', _drawSidebarMinimized);
    if (!_drawSidebarMinimized) {
      sb.classList.add('dm-sidebar-open');
      document.body.classList.add('dm-sidebar-open');
    } else {
      document.body.classList.remove('dm-sidebar-open');
    }
  }
  window.minimizeDrawSidebar = minimizeDrawSidebar;

  function restoreDrawSidebar() {
    var sb = document.getElementById('drawSidebar');
    if (!sb) return;
    _drawSidebarMinimized = false;
    sb.classList.remove('dm-sidebar-minimized');
    sb.classList.add('dm-sidebar-open');
    document.body.classList.remove('dm-sidebar-minimized');
    document.body.classList.add('dm-sidebar-open');
  }
  window.restoreDrawSidebar = restoreDrawSidebar;

  const DrawFABControl = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd: function() {
      const wrap = L.DomUtil.create('div', 'draw-fab-wrap');
      const btn = L.DomUtil.create('button', 'draw-fab-btn');
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
      btn.title = 'Draw & Measure';
      btn.setAttribute('aria-label', 'Draw & Measure');
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        openDrawSidebar();
      });
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);
      wrap.appendChild(btn);
      return wrap;
    }
  });
  new DrawFABControl().addTo(map);

  (function() {
    var sb = document.getElementById('drawSidebar');
    if (!sb) return;
    var title = sb.querySelector('.dm-sidebar-title');
    if (title) {
      title.addEventListener('click', function() {
        if (sb.classList.contains('dm-sidebar-minimized')) restoreDrawSidebar();
      });
    }
  })();

  // AirVisual Legend Control
  const AIRVISUAL_LEGEND_DATA = {
    'airvisual-pm25': {
      title: 'PM2.5 (μg/m³)',
      stops: [
        { label: 'Good', range: '0-12', color: '#00e400' },
        { label: 'Moderate', range: '12.1-35.4', color: '#ffff00' },
        { label: 'Unhealthy (Sensitive)', range: '35.5-55.4', color: '#ff7e00' },
        { label: 'Unhealthy', range: '55.5-150.4', color: '#ff0000' },
        { label: 'Very Unhealthy', range: '150.5-250.4', color: '#8f3f97' },
        { label: 'Hazardous', range: '250.5+', color: '#7e0023' }
      ]
    },
    'airvisual-pm10': {
      title: 'PM10 (μg/m³)',
      stops: [
        { label: 'Good', range: '0-54', color: '#00e400' },
        { label: 'Moderate', range: '55-154', color: '#ffff00' },
        { label: 'Unhealthy (Sensitive)', range: '155-254', color: '#ff7e00' },
        { label: 'Unhealthy', range: '255-354', color: '#ff0000' },
        { label: 'Very Unhealthy', range: '355-424', color: '#8f3f97' },
        { label: 'Hazardous', range: '425+', color: '#7e0023' }
      ]
    },
    'airvisual-o3': {
      title: 'O₃ (ppb)',
      stops: [
        { label: 'Good', range: '0-54', color: '#00e400' },
        { label: 'Moderate', range: '55-70', color: '#ffff00' },
        { label: 'Unhealthy (Sensitive)', range: '71-85', color: '#ff7e00' },
        { label: 'Unhealthy', range: '86-105', color: '#ff0000' },
        { label: 'Very Unhealthy', range: '106-200', color: '#8f3f97' },
        { label: 'Hazardous', range: '201+', color: '#7e0023' }
      ]
    },
    'airvisual-no2': {
      title: 'NO₂ (ppb)',
      stops: [
        { label: 'Good', range: '0-53', color: '#00e400' },
        { label: 'Moderate', range: '54-100', color: '#ffff00' },
        { label: 'Unhealthy (Sensitive)', range: '101-360', color: '#ff7e00' },
        { label: 'Unhealthy', range: '361-649', color: '#ff0000' },
        { label: 'Very Unhealthy', range: '650-1249', color: '#8f3f97' },
        { label: 'Hazardous', range: '1250+', color: '#7e0023' }
      ]
    },
    'airvisual-so2': {
      title: 'SO₂ (ppb)',
      stops: [
        { label: 'Good', range: '0-35', color: '#00e400' },
        { label: 'Moderate', range: '36-75', color: '#ffff00' },
        { label: 'Unhealthy (Sensitive)', range: '76-185', color: '#ff7e00' },
        { label: 'Unhealthy', range: '186-304', color: '#ff0000' },
        { label: 'Very Unhealthy', range: '305-604', color: '#8f3f97' },
        { label: 'Hazardous', range: '605+', color: '#7e0023' }
      ]
    },
    'airvisual-co': {
      title: 'CO (ppm)',
      stops: [
        { label: 'Good', range: '0-4.4', color: '#00e400' },
        { label: 'Moderate', range: '4.5-9.4', color: '#ffff00' },
        { label: 'Unhealthy (Sensitive)', range: '9.5-12.4', color: '#ff7e00' },
        { label: 'Unhealthy', range: '12.5-15.4', color: '#ff0000' },
        { label: 'Very Unhealthy', range: '15.5-30.4', color: '#8f3f97' },
        { label: 'Hazardous', range: '30.5+', color: '#7e0023' }
      ]
    }
  };

  function buildLegendHtml(key) {
    var d = AIRVISUAL_LEGEND_DATA[key];
    if (!d) return '';
    var html = '<div class="airvisual-legend-title">' + d.title + '</div>';
    html += '<div class="airvisual-legend-items">';
    for (var i = 0; i < d.stops.length; i++) {
      var s = d.stops[i];
      html += '<div class="airvisual-legend-item">' +
        '<span class="airvisual-legend-swatch" style="background:' + s.color + '"></span>' +
        '<span class="airvisual-legend-label">' + s.range + ' - ' + s.label + '</span>' +
        '</div>';
    }
    html += '</div>';
    return html;
  }

  var _airvisualLegendControl = null;

  function showAirVisualLegend(key) {
    hideAirVisualLegend();
    if (typeof addUnifiedLegend !== 'function') return;
    var el = L.DomUtil.create('div', 'airvisual-legend leaflet-bar');
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
    el.innerHTML = buildLegendHtml(key);
    addUnifiedLegend('airvisual', typeof createLegendWithToggle === 'function' ? createLegendWithToggle(el) : el);
    _airvisualLegendControl = true;
  }

  function hideAirVisualLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('airvisual');
    _airvisualLegendControl = null;
  }

  // Shared coastline layer
  var _coastlineLayer = null;
  var _coastlineGeneration = 0;
  var _coastlineXhr = null;

  function showCoastline() {
    if (_coastlineLayer && map.hasLayer(_coastlineLayer)) return;
    if (_coastlineXhr) { _coastlineXhr.abort(); _coastlineXhr = null; }
    var gen = ++_coastlineGeneration;
    var xhr = new XMLHttpRequest();
    _coastlineXhr = xhr;
    xhr.open('GET', 'assets/data/natural-earth/ne_50m_coastline.geojson', true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      _coastlineXhr = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var geojson = JSON.parse(xhr.responseText);
          if (gen !== _coastlineGeneration) return;
          _coastlineLayer = L.geoJSON(geojson, {
            style: { color: '#ffffff', weight: 1.2, opacity: 0.85, fillOpacity: 0 },
            filter: function (f) {
              return f && f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString');
            },
            interactive: false
          }).addTo(map);
        } catch (e) {}
      }
    };
    xhr.send();
  }

  function hideCoastline() {
    _coastlineGeneration++;
    if (_coastlineXhr) { _coastlineXhr.abort(); _coastlineXhr = null; }
    if (_coastlineLayer && map.hasLayer(_coastlineLayer)) map.removeLayer(_coastlineLayer);
    _coastlineLayer = null;
  }

  function toggleCoastlineLayer(show) {
    if (show) showCoastline(); else hideCoastline();
  }

  var _activeAirVisualLayerKey = null;

  function refreshAirVisualPresentation() {
    var activeKeys = Object.keys(airVisualLayers).filter(function (key) { return map.hasLayer(airVisualLayers[key]); });
    if (!activeKeys.length) {
      _activeAirVisualLayerKey = null;
      hideAirVisualLegend();
      hideCoastline();
      return;
    }
    if (activeKeys.indexOf(_activeAirVisualLayerKey) === -1) _activeAirVisualLayerKey = activeKeys[0];
    showAirVisualLegend(_activeAirVisualLayerKey);
        showCoastline();
  }

  function toggleAirVisualLayer(key, visible) {
    var layer = airVisualLayers[key];
    if (!layer) return;
    if (visible) {
      layer.addTo(map);
      _activeAirVisualLayerKey = key;
    } else if (map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
    refreshAirVisualPresentation();
  }

  document.querySelectorAll('[data-airvisual-layer]').forEach(function (input) {
    input.addEventListener('change', function () {
      toggleAirVisualLayer(this.dataset.airvisualLayer, this.checked);
    });
  });

  // Reset Layers Control
  // Ikon cetak & spinner (outline tebal) — dipakai ulang di tombol & saat proses
  window.GEOPORTAL_PRINT_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/><path d="M9 18h6"/></svg>';
  window.GEOPORTAL_PRINT_SPINNER = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9" opacity="0.9"/><path d="M12 3a9 9 0 0 1 9 9" opacity="0.25"/></svg>';

  // Print Map Control (global) — tampil di semua tab
  const PrintMapControl = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd() {
      const btn = L.DomUtil.create('button', 'geoportal-print-btn');
      btn.innerHTML = window.GEOPORTAL_PRINT_ICON;
      btn.title = 'Cetak peta (semua layer aktif)';
      btn.setAttribute('aria-label', 'Cetak peta');
      L.DomEvent.disableClickPropagation(btn);
      L.DomEvent.disableScrollPropagation(btn);
      btn.addEventListener('click', () => {
        if (typeof window.printGeoportalMap === 'function') window.printGeoportalMap();
      });
      return btn;
    }
  });

  function resetAllLayers() {
        _layerCatalogState = {};
        // 1. Matikan layer jalan & angin (checkbox-driven)
        const toggles = [
          'toggleTollRoad', 'toggleNonTollRoad', 'toggleNationalRoad',
          'toggleWindAnim', 'toggleWindRgb', 'toggleRhRgb', 'toggleTp24Rgb',
          'togglePm25Rgb', 'toggleHthRgb',
          'toggleMaritimeAngin', 'toggleMaritimeGelombang', 'toggleMaritimeSwell', 'toggleMaritimeWindSea',
          'toggleSawahDilindungi', 'toggleSawahNasional50k',
          'toggleBppLayer', 'toggleSawitLayer', 'toggleErosiLayer',
          'toggleHotspotLayer', 'toggleKawasanHutanLayer', 'toggleGambutLayer', 'toggleKhLayer', 'togglePippibLayer',
          'toggleCuacaPelabuhanLayer', 'toggleCuacaPerairanLayer',
          'toggleSawitNasionalLayer', 'toggleSawitPerkebunanLayer', 'toggleRehabDasLayer', 'togglePerkebunanPl24Layer',
          'toggleRktnSumateraLayer', 'toggleRktnSulawesiLayer', 'toggleRktnPapuaLayer', 'toggleRktnMalukuLayer', 'toggleRktnKalimantanLayer', 'toggleRktnJawaLayer', 'toggleRktnBaliNtLayer',
          'toggleDemnasOverlay', 'toggleSebaranPasar', 'toggleSppgLayer', 'toggleSppgSebaranLayer',
          'toggleConcessionsLayer', 'toggleProtectedLayer', 'toggleMangroveLayer', 'togglePeatlandLayer',
          'toggleBumiPersilLayer'
        ];
        toggles.forEach(id => {
          const el = document.getElementById(id);
          if (el && el.checked) {
            el.checked = false;
            el.dispatchEvent(new Event('change'));
          }
        });

        toggleCoastlineLayer(false);

        if (typeof toggleTollRoadLayer === 'function') toggleTollRoadLayer(false);
        if (typeof toggleNonTollRoadLayer === 'function') toggleNonTollRoadLayer(false);
        if (typeof toggleNationalRoadLayer === 'function') toggleNationalRoadLayer(false);

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

        // 3b-1. Matikan semua BPS/KSA WMS layers dari Geotani
        if (typeof bpsSt2023Layers !== 'undefined') {
          Object.keys(bpsSt2023Layers).forEach(function (key) {
            if (bpsSt2023Layers[key] && map.hasLayer(bpsSt2023Layers[key])) {
              map.removeLayer(bpsSt2023Layers[key]);
            }
          });
        }
        if (typeof bpsWmtsLayers !== 'undefined') {
          Object.keys(bpsWmtsLayers).forEach(function (key) {
            if (bpsWmtsLayers[key] && map.hasLayer(bpsWmtsLayers[key])) {
              map.removeLayer(bpsWmtsLayers[key]);
            }
          });
        }
        if (typeof bpsTutupanLahanState !== 'undefined' && bpsTutupanLahanState.layer && map.hasLayer(bpsTutupanLahanState.layer)) {
          map.removeLayer(bpsTutupanLahanState.layer);
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

        // 4c. Matikan VIIRS NOAA-20 & ECMWF Fire layers
        toggleViirsNoaa20Layer(false);
        toggleEcmwfFireLayer(false);

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
        if (typeof clearDemOverlay === 'function') clearDemOverlay();

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
        if (typeof kawasanHutanCleanup === 'function') kawasanHutanCleanup();
        if (typeof modisTimeSliderCleanup === 'function') modisTimeSliderCleanup();
        if (typeof modisAquaTimeSliderCleanup === 'function') modisAquaTimeSliderCleanup();
        if (typeof viirsTimeSliderCleanup === 'function') viirsTimeSliderCleanup();
        if (typeof cleanupHujanLayer === 'function') cleanupHujanLayer();
        if (typeof satelliteBoundary !== 'undefined') satelliteBoundary.hide(map);
        if (typeof modisViirsOverlayCleanup === 'function') modisViirsOverlayCleanup();
        if (typeof cuacaMaritimCleanup === 'function') cuacaMaritimCleanup();
        if (typeof pmtilesCleanup === 'function') pmtilesCleanup();
        if (typeof hideAirVisualLegend === 'function') hideAirVisualLegend();
        hideCoastline();
        Object.keys(airVisualLayers).forEach(function (key) {
          if (map.hasLayer(airVisualLayers[key])) map.removeLayer(airVisualLayers[key]);
        });
        document.querySelectorAll('[data-airvisual-layer]').forEach(function (input) { input.checked = false; });
        _activeAirVisualLayerKey = null;

        // Bersihkan layer sensor & katalog gempa
        document.querySelectorAll('#toggleKatalogGempa, #toggleSensorSeismic, #toggleSensorGlobal, #toggleHistoryGempa, #toggleSignificantMarkers, #toggleFeltMarkers, #toggleLatestEarthquake').forEach(function (cb) {
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
        if (typeof quakeResetLayers === 'function') quakeResetLayers();

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

        // 10b. Reset hillshade & PTH overlays
        if (typeof bnpbHillshade !== 'undefined') bnpbHillshade.cleanupAll();
        var hsCb = document.getElementById('toggleHillshade');
        var btCb = document.getElementById('toggleBatnas');
        if (hsCb) hsCb.checked = false;
        if (btCb) btCb.checked = false;

        // 10b-1. Reset Bumi Persil layer
        if (typeof toggleBumiPersilLayer === 'function') toggleBumiPersilLayer(false);

        setBaseMap('google-maps');
        currentBasemapName = 'google-maps';
        window.currentBasemapName = 'google-maps';

        // 10b. Bersihkan drawing & measure
        if (typeof clearDrawings === 'function') clearDrawings();

        // 10c. Bersihkan unified legend & slider
        if (typeof clearUnifiedLegend === 'function') clearUnifiedLegend();
        if (typeof clearUnifiedSlider === 'function') clearUnifiedSlider();

        // 10d. Bersihkan layer SIH3
        if (typeof cleanupSih3DpuLayers === 'function') cleanupSih3DpuLayers();
        if (typeof cleanupSih3CitarumLayers === 'function') cleanupSih3CitarumLayers();

        // 10e. Sync layer catalog checkboxes
        if (typeof syncLayerCatalogState === 'function') syncLayerCatalogState();

        // 11. Reset detail panel
        const detailPanel = document.getElementById('detail-panel');
        if (detailPanel) detailPanel.classList.add('hidden');
        const detailBtn = window._detailPanelBtn;
        if (detailBtn) detailBtn.classList.remove('active');
  }
  window.__geoportalPrintCtrl = new PrintMapControl().addTo(map);

  document.getElementById('resetLayersBtn').addEventListener('click', resetAllLayers);

  /* ── Pindahkan tombol ke dalam FAB ── */
  setTimeout(function () {
    createGeotoolsFAB();
    moveToFAB('.draw-fab-wrap', 'Gambar & Ukur');
    moveToFAB('.geoportal-print-btn', 'Cetak Peta');
    moveToFAB('.leaflet-control-locate', 'Lokasi Saya');

    /* ── Zoom Control di bawah tengah ── */
    var zoomWrap = document.querySelector('.zoom-control-wrap');
    if (zoomWrap) {
      zoomWrap.style.position = 'fixed';
      zoomWrap.style.bottom = '16px';
      zoomWrap.style.left = '50%';
      zoomWrap.style.transform = 'translateX(-50%)';
      zoomWrap.style.zIndex = '999';
      zoomWrap.style.flexDirection = 'row';
      zoomWrap.style.gap = '2px';
    }
  }, 300);

  let selectedWilayahId = "3313000000";
  let selectedRtrId = "001";
  let mapClickMarker = null;
  let wilayahLookup = [];
  let selectedWeatherMarker = null;

  const weatherMarkersGroup = L.layerGroup().addTo(map);
  const selectedWeatherGroup = L.layerGroup().addTo(map);
  const cctvMarkersGroup = L.markerClusterGroup({
    maxClusterRadius: 20,
    disableClusteringAtZoom: 14,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    iconCreateFunction: function(cluster) {
      const count = cluster.getChildCount();
      const size = count < 10 ? 26 : count < 30 ? 34 : count < 60 ? 42 : 52;
      return L.divIcon({
        html: '<div style="display:flex;align-items:center;justify-content:center;width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:rgba(14,165,233,0.9);color:#fff;font-weight:700;font-size:12px;border:2px solid rgba(255,255,255,0.9);box-shadow:0 2px 8px rgba(15,23,42,0.18);">' + count + '</div>',
        className: 'cctv-cluster-marker',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      });
    }
  }).addTo(map);
  const earthquakeMarkerGroup = L.layerGroup().addTo(map);
  const geoportalLayers = new Map();
  const GEOPORTAL_WMS_URL = 'https://pisda.sukoharjokab.go.id/geoserver/ows';
  const PEMPROV_WMS_URL = 'https://geoserver.jatimprov.go.id/geoserver/wms';
  const MAGELANG_WMS_URL = 'https://geoportal.magelangkota.go.id/geoserver/ows';
  const IGTPR_WMS_URL = 'https://igtpr.atrbpn.go.id/geoserver/ows';
  const BPS_WMS_URL = 'https://geoserver.bps.go.id/ows';
  const KLATEN_WMS_URL = 'https://geoportal.klaten.go.id/geoserver/wms';
  const CIREBON_WMS_URL = 'https://geoserver.cirebonkota.go.id/geoserver/wms';

  /* ── BPN Bhumi Persil (WMTS) ── */
  var bumiPersilLayer = null;

  function toggleBumiPersilLayer(show) {
    if (show) {
      if (bumiPersilLayer && map.hasLayer(bumiPersilLayer)) return;
      bumiPersilLayer = L.tileLayer('https://bhumi.atrbpn.go.id/mapproxy/wmts/bhumi_persil/localgrid_high/{z}/{x}/{y}.png', {
        tileSize: 256,
        attribution: 'ATRBPN - Bhumi Persil'
      });
      bumiPersilLayer.addTo(map);
      map.setView([-6.1944, 106.8231], 18);
    } else {
      if (bumiPersilLayer && map.hasLayer(bumiPersilLayer)) map.removeLayer(bumiPersilLayer);
      bumiPersilLayer = null;
    }
  }

  /* ── VIIRS NOAA-20 Thermal Anomalies (NASA GIBS WMS) ── */
  var viirsNoaa20Layer = null;

  function toggleViirsNoaa20Layer(show) {
    if (show) {
      if (viirsNoaa20Layer && map.hasLayer(viirsNoaa20Layer)) return;
      var today = new Date().toISOString().slice(0, 10);
      viirsNoaa20Layer = L.tileLayer.wms(
        'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi',
        {
          layers: 'VIIRS_NOAA20_Thermal_Anomalies_375m_All',
          format: 'image/png',
          transparent: true,
          crs: L.CRS.EPSG3857,
          time: today,
          attribution: 'NASA GIBS VIIRS NOAA-20'
        }
      );
      viirsNoaa20Layer.addTo(map);
    } else {
      if (viirsNoaa20Layer && map.hasLayer(viirsNoaa20Layer)) map.removeLayer(viirsNoaa20Layer);
      viirsNoaa20Layer = null;
    }
  }

  /* ── ECMWF Fire Composition (ECMWF WMS) ── */
  var ecmwfFireLayer = null;
  var ecmwfFireLegendCtrl = null;

  var EcmwfFireLegendControl = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd: function () {
      var div = L.DomUtil.create('div', 'ecmwf-fire-legend');
      L.DomEvent.disableClickPropagation(div);
      div.innerHTML =
        '<div class="ecmwf-fire-legend-title">Fire Radiative Power [W m\u207B\u00B2]</div>' +
        '<img class="ecmwf-fire-legend-img" alt="Legend" ' +
          'src="https://eccharts.ecmwf.int/wms/?token=public&request=GetLegend&layers=composition_fire&styles=sh_all_fire&width=350&height=50">' +
        '<div class="ecmwf-fire-legend-source">Sumber: ECMWF CAMS GFAS</div>';
      var img = div.querySelector('.ecmwf-fire-legend-img');
      if (img) {
        img.onerror = function () {
          img.style.display = 'none';
        };
      }
      return div;
    }
  });

  function showEcmwfFireLegend() {
    if (ecmwfFireLegendCtrl) return;
    if (typeof addUnifiedLegend !== 'function') return;
    var div = L.DomUtil.create('div', 'ecmwf-fire-legend');
    L.DomEvent.disableClickPropagation(div);
    div.innerHTML =
      '<div class="ecmwf-fire-legend-title">Fire Radiative Power [W m\u207B\u00B2]</div>' +
      '<img class="ecmwf-fire-legend-img" alt="Legend" ' +
        'src="https://eccharts.ecmwf.int/wms/?token=public&request=GetLegend&layers=composition_fire&styles=sh_all_fire&width=350&height=50">' +
      '<div class="ecmwf-fire-legend-source">Sumber: ECMWF CAMS GFAS</div>';
    var img = div.querySelector('.ecmwf-fire-legend-img');
    if (img) {
      img.onerror = function () {
        img.style.display = 'none';
      };
    }
    addUnifiedLegend('ecmwf-fire', typeof createLegendWithToggle === 'function' ? createLegendWithToggle(div) : div);
    ecmwfFireLegendCtrl = true;
  }

  function hideEcmwfFireLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('ecmwf-fire');
    ecmwfFireLegendCtrl = null;
  }

  function toggleEcmwfFireLayer(show) {
    if (show) {
      if (ecmwfFireLayer && map.hasLayer(ecmwfFireLayer)) return;
      ecmwfFireLayer = L.tileLayer.wms(
        'https://eccharts.ecmwf.int/wms/?token=public',
        {
          layers: 'composition_fire',
          format: 'image/png',
          transparent: true,
          version: '1.3.0',
          attribution: 'ECMWF'
        }
      );
      ecmwfFireLayer.on('load', function () {});
      ecmwfFireLayer.on('error', function () {});
      ecmwfFireLayer.addTo(map);
      showEcmwfFireLegend();
    } else {
      if (ecmwfFireLayer && map.hasLayer(ecmwfFireLayer)) map.removeLayer(ecmwfFireLayer);
      ecmwfFireLayer = null;
      hideEcmwfFireLegend();
    }
  }

  /* map.on('click', function (e) {
    if (!ecmwfFireLayer || !map.hasLayer(ecmwfFireLayer)) return;
    var lat = e.latlng.lat.toFixed(5);
    var lng = e.latlng.lng.toFixed(5);
    var html = '<div class="ecmwf-fire-popup">' +
      '<div class="ecmwf-fire-popup-title">Fire Radiative Power [W m\u207B\u00B2]</div>' +
      '<div class="ecmwf-fire-popup-props">' +
        '<div class="ecmwf-fire-popup-row"><span class="ecmwf-fire-popup-key">Lokasi</span><span class="ecmwf-fire-popup-val">' + lat + ', ' + lng + '</span></div>' +
        '<div class="ecmwf-fire-popup-row"><span class="ecmwf-fire-popup-key">Sumber</span><span class="ecmwf-fire-popup-val">CAMS GFAS</span></div>' +
        '<div class="ecmwf-fire-popup-row"><span class="ecmwf-fire-popup-key">Provider</span><span class="ecmwf-fire-popup-val">ECMWF</span></div>' +
      '</div>' +
      '<div class="ecmwf-fire-popup-note">Layer ini tidak menyediakan data titik. Gunakan legend untuk membaca intensitas FRP di lokasi klik.</div>' +
    '</div>';
    L.popup({ maxWidth: 300, className: 'ecmwf-fire-popup-wrap' })
      .setLatLng(e.latlng)
      .setContent(html)
      .openOn(map);
  }); */

  function toggleHujanLayer(show) {
    if (show) {
      if (typeof activateHujanLayer === 'function') activateHujanLayer();
    } else {
      if (typeof cleanupHujanLayer === 'function') cleanupHujanLayer();
    }
  }

  /* ── Food Security & Vulnerability Analysis (Badan Pangan) ── */
  var fsvaLayer = null;
  var fsvaLegendCtrl = null;
  var fsvaWmsUrl = 'https://geoportal.badanpangan.go.id/geoserver/palapa/wms';
  var fsvaProxies = [
    function (url) { return 'https://api.cors.syrins.tech/?url=' + encodeURIComponent(url); },
    function (url) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url); }
  ];

  function fsvaFetchJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).catch(function () {
      var chain = Promise.reject();
      fsvaProxies.forEach(function (mk) {
        chain = chain.catch(function () {
          return fetch(mk(url), { cache: 'no-store' }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          });
        });
      });
      return chain;
    });
  }

  var FsvaLegendControl = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd: function () {
      var div = L.DomUtil.create('div', 'fsva-legend');
      L.DomEvent.disableClickPropagation(div);
      div.innerHTML =
        '<div class="fsva-legend-title">FSVA 2025 - Indeks Kerentanan Pangan</div>' +
        '<img class="fsva-legend-img" alt="Legend" ' +
          'src="' + fsvaWmsUrl + '?request=GetLegendGraphic&layer=palapa:FSVA_2025&format=image/png&width=20&height=20">' +
        '<div class="fsva-legend-source">Sumber: Badan Pangan Nasional</div>';
      var img = div.querySelector('.fsva-legend-img');
      if (img) {
        img.onerror = function () { img.style.display = 'none'; };
      }
      return div;
    }
  });

  function showFsvaLegend() {
    if (fsvaLegendCtrl) return;
    if (typeof addUnifiedLegend !== 'function') return;
    var div = L.DomUtil.create('div', 'fsva-legend');
    L.DomEvent.disableClickPropagation(div);
    div.innerHTML =
      '<div class="fsva-legend-title">FSVA 2025 - Indeks Kerentanan Pangan</div>' +
      '<img class="fsva-legend-img" alt="Legend" ' +
        'src="' + fsvaWmsUrl + '?request=GetLegendGraphic&layer=palapa:FSVA_2025&format=image/png&width=20&height=20">' +
      '<div class="fsva-legend-source">Sumber: Badan Pangan Nasional</div>';
    var img = div.querySelector('.fsva-legend-img');
    if (img) {
      img.onerror = function () { img.style.display = 'none'; };
    }
    addUnifiedLegend('fsva', typeof createLegendWithToggle === 'function' ? createLegendWithToggle(div) : div);
    fsvaLegendCtrl = true;
  }

  function hideFsvaLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('fsva');
    fsvaLegendCtrl = null;
  }

  function buildFsvaPopup(props) {
    if (!props) return null;
    var esc = function(s) { return String(s || '-').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
    var rankColor = function(r) {
      if (r <= 2) return '#dc2626';
      if (r <= 4) return '#ea580c';
      return '#16a34a';
    };
    var rankLabel = function(r) {
      if (r <= 2) return 'Sangat Rentan';
      if (r <= 4) return 'Rentan';
      return 'Aman';
    };
    var fields = [
      ['Provinsi', props.WADMPR],
      ['Kab/Kota', props.WADMKK],
      ['Kode', props.KDPKAB]
    ];
    var indicators = [
      ['Jumlah Penduduk Miskin', props.NCPR, props.P_NCPR, '%'],
      ['Ketersediaan Energi', props.ENERGI, props.P_ENERG, '%'],
      ['Protein Hewani', props.PROHE, props.P_PROHE, '%'],
      ['Konsumsi Beras', props.CBPD, props.P_CBPD, '%'],
      ['Kemiskinan', props.MISKIN, props.P_MISKIN, '%'],
      ['Harga & Ketersediaan Pangan', props.CVHARGA, props.P_CVHARGA, ''],
      ['Pelayanan Air Minum', props.POU, props.P_POU, '%'],
      ['Rasio Lahan Sawah', props.RLSP, props.P_RLSP, '%'],
      ['Tanaman Pangan', props.TNPAIR, props.P_TNPAIR, '%'],
      ['Indeks Ketahanan Pangan', props.AMANPANGN, props.P_AMANPANG, '%'],
      ['Pencemaran Habitat', props.PPH, props.P_PPH, '%'],
      ['Prevalensi Stunting', props.STUNTING, props.P_STUNTING, '%']
    ];
    var html = '<div class="fsva-popup" style="min-width:280px">';
    html += '<div class="fsva-popup-header">';
    html += '<div class="fsva-popup-badge"><span class="fsva-popup-badge-dot"></span>FSVA 2025</div>';
    html += '<div class="fsva-popup-title">' + esc(props.WADMKK) + '</div>';
    html += '<div class="fsva-popup-subtitle">' + esc(props.WADMPR) + '</div>';
    html += '</div>';
    html += '<div class="fsva-popup-body">';
    if (props.RANK) {
      html += '<div class="fsva-popup-rank">';
      html += '<div class="fsva-popup-rank-label">Peringkat Nasional</div>';
      html += '<div class="fsva-popup-rank-value">#' + esc(props.RANK) + ' dari 514</div>';
      html += '</div>';
    }
    html += '<div class="fsva-popup-section-title">Indikator Kerentanan</div>';
    html += '<div class="fsva-popup-fields">';
    indicators.forEach(function(ind) {
      var label = ind[0], val = ind[1], rank = ind[2], unit = ind[3];
      if (val == null) return;
      var color = rankColor(rank);
      var rlabel = rankLabel(rank);
      html += '<div class="fsva-popup-field">';
      html += '<div class="fsva-popup-field-header">';
      html += '<span class="fsva-popup-field-label">' + esc(label) + '</span>';
      html += '<span class="fsva-popup-field-rank" style="background:' + color + ';">' + rlabel + '</span>';
      html += '</div>';
      html += '<div class="fsva-popup-field-value">' + esc(parseFloat(val).toFixed(1)) + unit + '</div>';
      html += '</div>';
    });
    html += '</div>';
    html += '</div>';
    html += '<div class="fsva-popup-footer"><span>Sumber: Badan Pangan Nasional - PETAKE TAHANAN DAN KERENTANAN PANGAN 2025</span></div>';
    html += '</div>';
    return html;
  }

  function toggleFsvaLayer(show) {
    if (show) {
      if (fsvaLayer && map.hasLayer(fsvaLayer)) return;
      fsvaLayer = L.tileLayer.wms(fsvaWmsUrl, {
        layers: 'palapa:FSVA_2025',
        format: 'image/png',
        transparent: true,
        version: '1.1.1',
        crs: L.CRS.EPSG4326,
        attribution: 'Badan Pangan Nasional - FSVA 2025'
      });
      fsvaLayer.addTo(map);
      fsvaLayer._fsvaClickHandler = function (e) {
        if (!fsvaLayer || !map.hasLayer(fsvaLayer)) return;
        var infoUrl = fsvaWmsUrl + '?' + L.Util.getParamString({
          service: 'WMS',
          version: '1.1.1',
          request: 'GetFeatureInfo',
          layers: 'palapa:FSVA_2025',
          query_layers: 'palapa:FSVA_2025',
          info_format: 'application/json',
          x: Math.floor(e.containerPoint.x),
          y: Math.floor(e.containerPoint.y),
          width: map.getSize().x,
          height: map.getSize().y,
          srs: 'EPSG:4326',
          bbox: map.getBounds().toBBoxString()
        });
        fsvaFetchJson(infoUrl)
          .then(function(data) {
            if (data.features && data.features.length > 0) {
              var props = data.features[0].properties;
              var html = buildFsvaPopup(props);
              if (html) {
                L.popup({ maxWidth: 320, className: 'fsva-leaflet-popup' })
                  .setLatLng(e.latlng)
                  .setContent(html)
                  .openOn(map);
              }
            }
          })
          .catch(function(err) {
            console.warn('[FSVA] GetFeatureInfo gagal:', err.message);
          });
      };
      fsvaLayer._fsvaContainerClickHandler = function (event) {
        if (!fsvaLayer || !map.hasLayer(fsvaLayer)) return;
        if (event.target.closest('.leaflet-control')) return;
        try {
          fsvaLayer._fsvaClickHandler({
            latlng: map.mouseEventToLatLng(event),
            containerPoint: map.mouseEventToContainerPoint(event)
          });
        } catch (err) {}
      };
      map.getContainer().addEventListener('click', fsvaLayer._fsvaContainerClickHandler, true);
      showFsvaLegend();
    } else {
      if (fsvaLayer && map.hasLayer(fsvaLayer)) map.removeLayer(fsvaLayer);
      if (fsvaLayer && fsvaLayer._fsvaContainerClickHandler) {
        map.getContainer().removeEventListener('click', fsvaLayer._fsvaContainerClickHandler, true);
      }
      fsvaLayer = null;
      hideFsvaLegend();
      map.closePopup();
    }
  }
  window.toggleFsvaLayer = toggleFsvaLayer;

  /* ═══════════════════════════════════════════════════════
     SIH3 - Dinas PU SDA Jatim (API-based markers)
     ═══════════════════════════════════════════════════════ */
  var SIH3_DPU_API = 'https://sih3.dpuair.jatimprov.go.id/main/get_data/view/{id}/label';
  var _sih3DpuLayers = {};
  var _sih3DpuCache = {};

  var SIH3_DPU_ICONS = {
    'Pos Hujan': { color: '#3b82f6', icon: '🌧️' },
    'Pos Duga Air': { color: '#10b981', icon: '💧' },
    'Pos Muka Air Tanah': { color: '#f59e0b', icon: '🌍' }
  };

  function _buildSih3DpuIcon(jenisPos) {
    var cfg = SIH3_DPU_ICONS[jenisPos] || { color: '#6b7280', icon: '📍' };
    return L.divIcon({
      className: 'sih3-dpu-marker',
      html: '<div style="background:' + cfg.color + ';width:22px;height:22px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-size:11px;">' + cfg.icon + '</div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });
  }

  function _buildSih3DpuPopup(props) {
    var jenis = props.jenis_pos || '-';
    var cfg = SIH3_DPU_ICONS[jenis] || { color: '#6b7280', icon: '📍' };
    return '<div class="sih3-popup sih3-dpu-popup">' +
      '<div class="sih3-popup-header" style="background:linear-gradient(135deg,' + cfg.color + ',' + cfg.color + 'cc)">' +
        '<div class="sih3-popup-badge"><span>' + cfg.icon + '</span> ' + jenis + '</div>' +
        '<div class="sih3-popup-title">' + (props.judul || '-') + '</div>' +
        '<div class="sih3-popup-subtitle">' + (props.name || '-') + '</div>' +
      '</div>' +
      '<div class="sih3-popup-body">' +
        '<div class="sih3-popup-row"><span class="sih3-popup-label">Kewenangan</span><span class="sih3-popup-value">' + (props.name || '-') + '</span></div>' +
        '<div class="sih3-popup-row"><span class="sih3-popup-label">Jenis Input</span><span class="sih3-popup-value">' + (props.tipe_input || '-') + '</span></div>' +
        '<div class="sih3-popup-row"><span class="sih3-popup-label">Nilai</span><span class="sih3-popup-value sih3-popup-highlight">' + (props.nilai || '-') + '</span></div>' +
        '<div class="sih3-popup-row"><span class="sih3-popup-label">Tanggal</span><span class="sih3-popup-value">' + (props.tanggal || '-') + ' ' + (props.jam ? props.jam + ':00' : '') + '</span></div>' +
      '</div>' +
      '<div class="sih3-popup-footer">SIH3 Dinas PU SDA Jatim</div>' +
    '</div>';
  }

  function toggleSih3DpuLayer(viewId, show) {
    if (show) {
      if (_sih3DpuLayers[viewId] && map.hasLayer(_sih3DpuLayers[viewId])) return;
      if (_sih3DpuCache[viewId]) {
        _sih3DpuLayers[viewId] = _sih3DpuCache[viewId];
        _sih3DpuLayers[viewId].addTo(map);
        return;
      }
      var url = SIH3_DPU_API.replace('{id}', viewId);
      fsvaFetchJson(url).then(function(data) {
        if (!Array.isArray(data) || data.length === 0) return;
        var markers = L.geoJSON(null, {
          pointToLayer: function(feature, latlng) {
            return L.marker(latlng, { icon: _buildSih3DpuIcon(feature.properties.jenis_pos) });
          },
          onEachFeature: function(feature, layer) {
            layer.bindPopup(_buildSih3DpuPopup(feature.properties), { maxWidth: 280, className: 'sih3-leaflet-popup' });
          }
        });
        data.forEach(function(item) {
          var lat = parseFloat(item.lat);
          var lng = parseFloat(item.long);
          if (isNaN(lat) || isNaN(lng)) return;
          markers.addLayer(L.marker([lat, lng], { icon: _buildSih3DpuIcon(item.jenis_pos) })
            .bindPopup(_buildSih3DpuPopup(item), { maxWidth: 280, className: 'sih3-leaflet-popup' }));
        });
        _sih3DpuCache[viewId] = markers;
        _sih3DpuLayers[viewId] = markers;
        markers.addTo(map);
      }).catch(function(err) {
        console.warn('[SIH3 DPU] Gagal load view ' + viewId + ':', err.message);
      });
    } else {
      if (_sih3DpuLayers[viewId] && map.hasLayer(_sih3DpuLayers[viewId])) {
        map.removeLayer(_sih3DpuLayers[viewId]);
      }
      delete _sih3DpuLayers[viewId];
    }
  }
  window.toggleSih3DpuLayer = toggleSih3DpuLayer;

  function cleanupSih3DpuLayers() {
    Object.keys(_sih3DpuLayers).forEach(function(k) {
      if (_sih3DpuLayers[k] && map.hasLayer(_sih3DpuLayers[k])) map.removeLayer(_sih3DpuLayers[k]);
    });
    _sih3DpuLayers = {};
  }

  /* ═══════════════════════════════════════════════════════
     SIH3 - BBWS Citarum (GeoJSON direct)
     ═══════════════════════════════════════════════════════ */
  var SIH3_CIT_BASE = 'https://sih3.wscitarum.id/public/storage/geospasial/';
  var _sih3CitLayers = {};
  var _sih3CitCache = {};

  var SIH3_CIT_FILES = {
    '16': 'Batas_DAS.geojson',
    '17': 'Batas_WSCitarum.geojson',
    '18': 'Batas_KabKot.geojson',
    '19': 'PDA_semua_instansi.geojson',
    '20': 'Kualitas_BBWS_2_2025.geojson',
    '21': 'Kualitas_DLH_2_2025.geojson',
    '22': 'PosKualitasAir_BBWS_PJT_DLH.geojson',
    '23': 'pch_semua_instansi.geojson',
    '24': 'AnalisisCH_Juni2026_29-07-2026_093519.geojson',
    '25': 'PrediksiCH_Agustus2026_update_11-08-2026_093044.geojson',
    '26': 'PrediksiCH_September2026_update_11-08-2026_093056.geojson',
    '27': 'HTH_WS%20Citarum_Agustus%202026_Dasarian%201_09-09-2026_134245.geojson',
    '28': 'KETAT_WS_Citarum.geojson',
    '29': 'Hidrogeologi.geojson',
    '30': 'CAT_April2026.geojson',
    '31': 'PrediksiCH_Oktober2026_11-08-2026_093118.geojson'
  };

  var SIH3_CIT_SIZES = { '28': 20.5, '29': 71.9 };

  var SIH3_CIT_STYLE = {
    batas: { color: '#8b5cf6', weight: 2, dashArray: '6 4', fillOpacity: 0, interactive: true },
    point: { radius: 5, weight: 1, fillOpacity: 0.85 }
  };

  var SIH3_CIT_COLORS = {
    '19': '#3b82f6', '20': '#10b981', '21': '#f59e0b', '22': '#8b5cf6',
    '23': '#06b6d4', '24': '#f97316', '25': '#ef4444', '26': '#ec4899',
    '27': '#14b8a6', '28': '#a855f7', '29': '#6366f1', '30': '#84cc16', '31': '#e11d48'
  };

  function _buildSih3CitStyle(fileId) {
    if (fileId === '16' || fileId === '17' || fileId === '18') return SIH3_CIT_STYLE.batas;
    var color = SIH3_CIT_COLORS[fileId] || '#3b82f6';
    return { radius: 5, weight: 1, color: color, fillColor: color, fillOpacity: 0.85 };
  }

  function _buildSih3CitPopup(props, fileId) {
    var rows = '';
    Object.keys(props).forEach(function(k) {
      if (props[k] && props[k] !== 'N/A' && props[k] !== 'null') {
        rows += '<div class="sih3-popup-row"><span class="sih3-popup-label">' + k + '</span><span class="sih3-popup-value">' + props[k] + '</span></div>';
      }
    });
    return '<div class="sih3-popup sih3-cit-popup">' +
      '<div class="sih3-popup-header" style="background:linear-gradient(135deg,#8b5cf6,#7c3aed)">' +
        '<div class="sih3-popup-badge"><span>💧</span> BBWS Citarum</div>' +
        '<div class="sih3-popup-title">' + (props.Nama || props.nama || props.KABUPATEN || 'Data') + '</div>' +
      '</div>' +
      '<div class="sih3-popup-body">' + rows + '</div>' +
      '<div class="sih3-popup-footer">SIH3 WS Citarum</div>' +
    '</div>';
  }

  function toggleSih3CitarumLayer(fileId, show) {
    if (show) {
      if (_sih3CitLayers[fileId] && map.hasLayer(_sih3CitLayers[fileId])) return;
      if (SIH3_CIT_SIZES[fileId]) {
        L.popup().setLatLng(map.getCenter()).setContent(
          '<div style="padding:8px;text-align:center;">' +
            '<div style="font-size:13px;font-weight:600;margin-bottom:4px;">⚠️ File Terlalu Besar</div>' +
            '<div style="font-size:11px;color:#64748b;">Ukuran: ~' + SIH3_CIT_SIZES[fileId] + ' MB<br>Memuat file ini dapat memperlambat peta.</div>' +
          '</div>'
        ).openOn(map);
        return;
      }
      if (_sih3CitCache[fileId]) {
        _sih3CitLayers[fileId] = _sih3CitCache[fileId];
        _sih3CitLayers[fileId].addTo(map);
        return;
      }
      var fileName = SIH3_CIT_FILES[fileId];
      if (!fileName) return;
      var url = SIH3_CIT_BASE + fileName;
      fsvaFetchJson(url).then(function(geojson) {
        var style = _buildSih3CitStyle(fileId);
        var layer = L.geoJSON(geojson, {
          style: function() { return style; },
          pointToLayer: function(feature, latlng) {
            var color = SIH3_CIT_COLORS[fileId] || '#3b82f6';
            return L.circleMarker(latlng, { radius: 5, weight: 1, color: color, fillColor: color, fillOpacity: 0.85 });
          },
          onEachFeature: function(feature, layer) {
            layer.bindPopup(_buildSih3CitPopup(feature.properties, fileId), { maxWidth: 300, className: 'sih3-leaflet-popup' });
          }
        });
        _sih3CitCache[fileId] = layer;
        _sih3CitLayers[fileId] = layer;
        layer.addTo(map);
      }).catch(function(err) {
        console.warn('[SIH3 Citarum] Gagal load file ' + fileId + ':', err.message);
      });
    } else {
      if (_sih3CitLayers[fileId] && map.hasLayer(_sih3CitLayers[fileId])) {
        map.removeLayer(_sih3CitLayers[fileId]);
      }
      delete _sih3CitLayers[fileId];
    }
  }
  window.toggleSih3CitarumLayer = toggleSih3CitarumLayer;

  function cleanupSih3CitarumLayers() {
    Object.keys(_sih3CitLayers).forEach(function(k) {
      if (_sih3CitLayers[k] && map.hasLayer(_sih3CitLayers[k])) map.removeLayer(_sih3CitLayers[k]);
    });
    _sih3CitLayers = {};
  }

  /* ═══════════════════════════════════════════════════════
     QUICK LAYER TOOLBAR
     ═══════════════════════════════════════════════════════ */
  (function initQuickLayerBar() {
    var cfg = {
      qlHotspot:   { type: 'sheet' },
      qlPm25:      { target: 'toggleAirVisualPm25',         type: 'checkbox' },
      qlWind:      { target: 'toggleWindAnim',              type: 'checkbox' },
      qlHujan:     { type: 'toggle-fn',                    fn: toggleHujanLayer },
      qlEcmwfFire: { type: 'toggle-fn',                    fn: toggleEcmwfFireLayer },
      qlViirsNoaa20:{ type: 'toggle-fn',                    fn: toggleViirsNoaa20Layer },
      qlKonsesi:   { target: 'toggleConcessionsLayer',      type: 'checkbox' },
      qlPelabuhan: { target: 'toggleCuacaPelabuhanLayer',   type: 'checkbox' },
      qlPerairan:  { target: 'toggleCuacaPerairanLayer',    type: 'checkbox' },
      qlGambut:    { target: 'togglePeatlandLayer',         type: 'checkbox' },
      qlSawit:     { target: 'toggleSawitNasionalLayer',    type: 'checkbox' },
      qlGunungApi: { target: 'toggleVolcanoLayer',          type: 'checkbox' }
    };

    function syncToolbarState() {
      Object.keys(cfg).forEach(function (btnId) {
        var btn = document.getElementById(btnId);
        var c = cfg[btnId];
        if (!btn) return;
        if (c.type === 'sheet') {
          var sheet = document.getElementById('hotspot-sheet');
          btn.classList.toggle('active', !!(sheet && sheet.classList.contains('sheet-open')));
        } else if (c.type === 'checkbox') {
          var cb = document.getElementById(c.target);
          btn.classList.toggle('active', !!(cb && cb.checked));
        } else if (c.type === 'toggle-fn') {
          var isOn = false;
          if (c.fn === toggleViirsNoaa20Layer) isOn = !!(viirsNoaa20Layer && map.hasLayer(viirsNoaa20Layer));
          else if (c.fn === toggleEcmwfFireLayer) isOn = !!(ecmwfFireLayer && map.hasLayer(ecmwfFireLayer));
          else if (c.fn === toggleHujanLayer) isOn = typeof isHujanLayerActive === 'function' && isHujanLayerActive();
          btn.classList.toggle('active', isOn);
        } else {
          btn.classList.toggle('active', currentBasemapName === c.target);
        }
      });
    }

    document.addEventListener('DOMContentLoaded', function () {
      Object.keys(cfg).forEach(function (btnId) {
        var btn = document.getElementById(btnId);
        var c = cfg[btnId];
        if (!btn) return;
        btn.addEventListener('click', function () {
          if (c.type === 'sheet') {
            if (typeof toggleHotspotSheet === 'function') toggleHotspotSheet();
          } else if (c.type === 'checkbox') {
            var cb = document.getElementById(c.target);
            if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
          } else if (c.type === 'toggle-fn') {
            var isOn = false;
            if (c.fn === toggleViirsNoaa20Layer) isOn = !!(viirsNoaa20Layer && map.hasLayer(viirsNoaa20Layer));
            else if (c.fn === toggleEcmwfFireLayer) isOn = !!(ecmwfFireLayer && map.hasLayer(ecmwfFireLayer));
            else if (c.fn === toggleHujanLayer) isOn = typeof isHujanLayerActive === 'function' && isHujanLayerActive();
            if (c.fn) c.fn(!isOn);
          } else {
            if (currentBasemapName === c.target) setBaseMap('google-maps');
            else setBaseMap(c.target);
          }
          syncToolbarState();
        });
      });
      syncToolbarState();
    });

    /* re-sync setiap 800ms supaya tombol selalu sinkron */
    setInterval(syncToolbarState, 800);
  })();

  window.createLegendWithToggle = function (container) {
    var wrap = document.createElement('div');
    wrap.className = 'legend-wrap legend-collapsed';
    var title = container.querySelector('[class$="-legend-title"]');
    if (title) {
      title.classList.add('legend-toggle');
      var icon = document.createElement('span');
      icon.className = 'legend-toggle-icon';
      icon.textContent = '\u25BE';
      title.appendChild(icon);
      title.addEventListener('click', function () {
        wrap.classList.toggle('legend-collapsed');
      });
    }
    wrap.appendChild(container);
    return wrap;
  };

  /* ═══════════════════════════════════════════════
     UNIFIED LEGEND & SLIDER CONTAINERS
     ═══════════════════════════════════════════════ */

  var _unifiedLegendEl = null;
  var _unifiedLegendBody = null;
  var _unifiedSliderEl = null;

  var UnifiedLegendControl = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd: function () {
      _unifiedLegendEl = L.DomUtil.create('div', 'unified-legend-container legend-collapsed');
      var header = L.DomUtil.create('div', 'legend-header', _unifiedLegendEl);
      header.innerHTML = '<span>Legenda</span><span class="legend-toggle-icon">\u25BE</span>';
      header.addEventListener('click', function () {
        _unifiedLegendEl.classList.toggle('legend-collapsed');
      });
      _unifiedLegendBody = L.DomUtil.create('div', 'legend-body', _unifiedLegendEl);
      L.DomEvent.disableClickPropagation(_unifiedLegendEl);
      L.DomEvent.disableScrollPropagation(_unifiedLegendEl);
      return _unifiedLegendEl;
    }
  });
  new UnifiedLegendControl().addTo(map);

  var UnifiedSliderControl = L.Control.extend({
    options: { position: 'bottomcenter' },
    onAdd: function () {
      if (!map._controlCorners.bottomcenter) {
        map._controlCorners.bottomcenter = L.DomUtil.create('div', 'leaflet-bottom leaflet-center', map._controlContainer);
      }
      _unifiedSliderEl = L.DomUtil.create('div', 'unified-slider-container');
      L.DomEvent.disableClickPropagation(_unifiedSliderEl);
      L.DomEvent.disableScrollPropagation(_unifiedSliderEl);
      return _unifiedSliderEl;
    }
  });
  new UnifiedSliderControl().addTo(map);

  window.addUnifiedLegend = function (id, domEl) {
    if (!_unifiedLegendBody) return;
    var existing = _unifiedLegendBody.querySelector('[data-legend-id="' + id + '"]');
    if (existing) existing.remove();
    var section = document.createElement('div');
    section.className = 'unified-legend-section';
    section.dataset.legendId = id;
    section.appendChild(domEl);
    _unifiedLegendBody.appendChild(section);
    _unifiedLegendEl.style.display = '';
    _unifiedLegendEl.classList.add('legend-collapsed');
  };

  window.removeUnifiedLegend = function (id) {
    if (!_unifiedLegendBody) return;
    var section = _unifiedLegendBody.querySelector('[data-legend-id="' + id + '"]');
    if (section) section.remove();
    if (_unifiedLegendBody.children.length === 0) _unifiedLegendEl.style.display = 'none';
  };

  window.addUnifiedSlider = function (id, title, domEl) {
    if (!_unifiedSliderEl) return;
    var existing = _unifiedSliderEl.querySelector('[data-slider-id="' + id + '"]');
    if (existing) existing.remove();
    var section = document.createElement('div');
    section.className = 'unified-slider-section';
    section.dataset.sliderId = id;
    if (title) {
      var header = document.createElement('div');
      header.className = 'unified-slider-header';
      header.textContent = title;
      section.appendChild(header);
    }
    section.appendChild(domEl);
    _unifiedSliderEl.appendChild(section);
    _unifiedSliderEl.style.display = '';
  };

  window.removeUnifiedSlider = function (id) {
    if (!_unifiedSliderEl) return;
    var section = _unifiedSliderEl.querySelector('[data-slider-id="' + id + '"]');
    if (section) section.remove();
    if (_unifiedSliderEl.children.length === 0) _unifiedSliderEl.style.display = 'none';
  };

  window.clearUnifiedLegend = function () {
    if (_unifiedLegendBody) { _unifiedLegendBody.innerHTML = ''; }
    if (_unifiedLegendEl) { _unifiedLegendEl.style.display = 'none'; _unifiedLegendEl.classList.remove('legend-collapsed'); }
  };

  window.clearUnifiedSlider = function () {
    if (_unifiedSliderEl) { _unifiedSliderEl.innerHTML = ''; _unifiedSliderEl.style.display = 'none'; }
  };

  /* ═══════════════════════════════════════
     GeoTools Bottom Sheet (FAB)
     ═══════════════════════════════════════ */

  var _geotoolsSheetOpen = false;

  function openGeotoolsSheet() {
    var sheet = document.getElementById('geotools-sheet');
    var body = document.getElementById('geotoolsSheetBody');
    var tabContent = document.getElementById('tab-geotools');
    if (!sheet || !body || !tabContent) return;
    if (!sheet.dataset.moved) {
      while (tabContent.firstChild) body.appendChild(tabContent.firstChild);
      sheet.dataset.moved = '1';
    }
    sheet.classList.add('gs-sheet-open');
    document.body.classList.add('geotools-sheet-open');
    _geotoolsSheetOpen = true;
  }

  function closeGeotoolsSheet() {
    var sheet = document.getElementById('geotools-sheet');
    var body = document.getElementById('geotoolsSheetBody');
    var tabContent = document.getElementById('tab-geotools');
    if (!sheet || !body || !tabContent) return;
    sheet.classList.remove('gs-sheet-open', 'gs-sheet-minimized');
    document.body.classList.remove('geotools-sheet-open');
    _geotoolsSheetOpen = false;
    if (sheet.dataset.moved) {
      while (body.firstChild) tabContent.appendChild(body.firstChild);
      delete sheet.dataset.moved;
    }
  }
  window.closeGeotoolsSheet = closeGeotoolsSheet;

  var _geotoolsMinimized = false;

  function minimizeGeotoolsSheet() {
    var sheet = document.getElementById('geotools-sheet');
    if (!sheet) return;
    _geotoolsMinimized = !_geotoolsMinimized;
    sheet.classList.toggle('gs-sheet-minimized', _geotoolsMinimized);
    sheet.classList.toggle('gs-sheet-open', !_geotoolsMinimized);
    document.body.classList.toggle('geotools-sheet-minimized', _geotoolsMinimized);
  }
  window.minimizeGeotoolsSheet = minimizeGeotoolsSheet;

  function restoreGeotoolsSheet() {
    var sheet = document.getElementById('geotools-sheet');
    if (!sheet) return;
    _geotoolsMinimized = false;
    sheet.classList.remove('gs-sheet-minimized');
    sheet.classList.add('gs-sheet-open');
    document.body.classList.add('geotools-sheet-open');
    document.body.classList.remove('geotools-sheet-minimized');
  }
  window.restoreGeotoolsSheet = restoreGeotoolsSheet;

  /* ── GeoTools FAB Button ── */
  function createGeotoolsFAB() {
    if (!__fabItems) __fabItems = document.querySelector('.map-fab-items');
    if (!__fabItems) return;
    var item = L.DomUtil.create('button', 'map-fab-item geotools-sheet-btn');
    item.title = 'GeoTools';
    item.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>';
    __fabItems.appendChild(item);
    item.addEventListener('click', function (e) {
      e.stopPropagation();
      closeFAB();
      openGeotoolsSheet();
    });
  }

  /* ═══════════════════════════════════════
     Layer Catalog Dropdown
     ═══════════════════════════════════════ */

  var LAYER_CATALOG_DATA = [
    {
      cat: 'Basemap',
      type: 'basemap',
      groups: [
        {
          group: 'Vektor',
          layers: [
            { id: 'osm', label: 'Open Street Map' },
            { id: 'rupabumi', label: 'Rupabumi Indonesia' },
            { id: 'esri-dark-gray', label: 'Esri Dark Gray' },
            { id: 'esri-topo', label: 'Esri Topographic' },
            { id: 'esri-terrain', label: 'Esri Terrain' },
            { id: 'esri-street', label: 'Esri Street' },
            { id: 'esri-shaded-relief', label: 'Esri Shaded Relief' },
            { id: 'esri-physical', label: 'Esri Physical' },
            { id: 'esri-natgeo', label: 'Esri National Geographic' },
            { id: 'google-maps', label: 'Google Maps' }
          ]
        },
        {
          group: 'Satelit',
          layers: [
            { id: 'esri-satellite', label: 'Esri Satellite' },
            { id: 'modis-terra', label: 'MODIS Terra' },
            { id: 'modis-aqua', label: 'MODIS Aqua' },
            { id: 'viirs-noaa20', label: 'VIIRS NOAA-20' },
            { id: 'viirs-noaa21', label: 'VIIRS NOAA-21' },
            { id: 'bmkg-himawari', label: 'Himawari-9 IR' },
            { id: 'bmkg-himawari-fd', label: 'Himawari-9 Full Disk' },
            { id: 'bmkg-himawari-hires', label: 'Himawari-9 Hi-Res' },
            { id: 'bmkg-gk2a', label: 'GK-2A' },
            { id: 'bmkg-gk2a-wv', label: 'GK-2A Water Vapor' },
            { id: 'noaa-true-color', label: 'NOAA True Color' },
            { id: 'noaa-goes-ir', label: 'NOAA GOES IR' },
            { id: 'sentinel2', label: 'Sentinel-2' }
          ]
        }
      ]
    },
    {
      cat: 'Bumi Persil',
      layers: [
        { id: 'toggleBumiPersilLayer', label: 'Persil Tanah (ATRBPN)' }
      ]
    },
    {
      cat: 'Ketahanan Pangan',
      layers: [
        { id: 'toggleFsvaLayer', label: 'FSVA 2025 (Badan Pangan)' }
      ]
    },
    {
      cat: 'Gempa & Bencana',
      layers: [
        { id: 'toggleLatestEarthquake', label: 'Gempa Terbaru (BMKG)' },
        { id: 'toggleSignificantMarkers', label: '15 Gempa M 5.0+ (BMKG)' },
        { id: 'toggleFeltMarkers', label: '15 Gempa Dirasakan (BMKG)' },
        { id: 'toggleFaultLayer', label: 'Patahan Indonesia (BNPB)' },
        { id: 'toggleFaultLayerNew', label: 'Patahan Indonesia Baru (PUSGEN 2024)' },
        { id: 'toggleWorldPlatesLayer', label: 'Zona Patahan Dunia (USGS)' },
        { id: 'toggleGempaNTT', label: 'Gempa NTT' },
        { id: 'toggleFiniteFaultNTT', label: 'Finite Fault NTT' },
        { id: 'toggleJalurEvakuasi', label: 'Jalur Evakuasi (BNPB)' },
        { id: 'toggleHistoryGempa', label: 'Riwayat Gempa BMKG' },
        { id: 'toggleKatalogGempa', label: 'Katalog Gempa BMKG' },
        { id: 'toggleSensorSeismic', label: 'Sensor Seismic BMKG' },
        { id: 'toggleSensorGlobal', label: 'Sensor Global (GEOFON)' }
      ]
    },
    {
      cat: 'Kehutanan',
      layers: [
        { id: 'toggleConcessionsLayer', label: 'Konsesi (GFW)' },
        { id: 'toggleProtectedLayer', label: 'Kawasan Konservasi (WDPA)' },
        { id: 'toggleMangroveLayer', label: 'Mangrove (GMW v3)' },
        { id: 'togglePeatlandLayer', label: 'Lahan Gambut (GFW)' },
        { id: 'toggleKawasanHutanLayer', label: 'Kawasan Hutan (ESDM)' },
        { id: 'toggleGambutLayer', label: 'Lahan Gambut (SIMONTANA)' },
        { id: 'toggleKhLayer', label: 'Kawasan Hutan (Kemenhut)' },
        { id: 'togglePippibLayer', label: 'PIPPIB 2023 Periode I' },
        { id: 'toggleSawitNasionalLayer', label: 'Sawit Nasional' },
        { id: 'toggleSawitPerkebunanLayer', label: 'Sawit dan Perkebunan' },
        { id: 'toggleRehabDasLayer', label: 'Rehab DAS' },
        { id: 'togglePerkebunanPl24Layer', label: 'Perkebunan PL24' },
        { id: 'toggleRktnSumateraLayer', label: 'RKTN Sumatera' },
        { id: 'toggleRktnSulawesiLayer', label: 'RKTN Sulawesi' },
        { id: 'toggleRktnPapuaLayer', label: 'RKTN Papua' },
        { id: 'toggleRktnMalukuLayer', label: 'RKTN Maluku' },
        { id: 'toggleRktnKalimantanLayer', label: 'RKTN Kalimantan' },
        { id: 'toggleRktnJawaLayer', label: 'RKTN Jawa' },
        { id: 'toggleRktnBaliNtLayer', label: 'RKTN Bali & NT' }
      ]
    },
    {
      cat: 'Cuaca & Maritim',
      layers: [
        { id: 'toggleCuacaPerairanLayer', label: 'Cuaca Perairan (BMKG)' },
        { id: 'toggleCuacaPelabuhanLayer', label: 'Cuaca Pelabuhan (BMKG)' },
        { id: 'toggleMaritimeAngin', label: 'Angin Laut (Wind Speed)' },
        { id: 'toggleMaritimeGelombang', label: 'Tinggi Gelombang' },
        { id: 'toggleMaritimeSwell', label: 'Swell (Primary Swell)' },
        { id: 'toggleMaritimeWindSea', label: 'Gelombang Angin (Wind Sea)' }
      ]
    },
    {
      cat: 'Prediksi Cuaca',
      layers: [
        { id: 'toggleHujanLayer', label: 'Hujan Realtime (BMKG)' },
        { id: 'toggleWindRgb', label: 'Wind Speed and Direction (GFS)' },
        { id: 'toggleRhRgb', label: 'Relative Humidity (GFS)' },
        { id: 'toggleTp24Rgb', label: 'Total Precipitation 24 Jam (GFS)' },
        { id: 'togglePm25Rgb', label: 'PM2.5 Air Quality (BMKG PCM)' },
        { id: 'toggleHthRgb', label: 'Hari Tanpa Hujan (BMKG HTH)' },
        { id: 'toggleWindAnim', label: 'Animasi Angin (Wind Particle)' }
      ]
    },
    {
      cat: 'Kualitas Udara',
      layers: [
        { id: 'toggleAirVisualPm25', label: 'PM2.5 (AirVisual)' },
        { id: 'toggleAirVisualPm10', label: 'PM10 (AirVisual)', dataAttr: 'airvisual-pm10' },
        { id: 'toggleAirVisualO3', label: 'O3 - Ozon (AirVisual)', dataAttr: 'airvisual-o3' },
        { id: 'toggleAirVisualNo2', label: 'NO2 - Nitrogen Dioksida (AirVisual)', dataAttr: 'airvisual-no2' },
        { id: 'toggleAirVisualSo2', label: 'SO2 - Sulfur Dioksida (AirVisual)', dataAttr: 'airvisual-so2' },
        { id: 'toggleAirVisualCo', label: 'CO - Karbon Monoksida (AirVisual)', dataAttr: 'airvisual-co' }
      ]
    },
    {
      cat: 'Geologi',
      layers: [
        { id: 'toggleVolcanoLayer', label: 'Gunung Api Indonesia (PVMBG)' },
        { id: 'toggleKrbGunungApi', label: 'Kawasan Rawan Bencana Gunung Api (BIG)' },
        { id: 'toggleKrbTitik', label: 'Gas Vulkanik Gunung Api (BIG)' },
        { id: 'togglePetaGeologi', label: 'Peta Geologi (BIG)' },
        { id: 'toggleGeostruktur', label: 'Geologi Geostruktur (BIG)' },
        { id: 'togglePatahanAktif', label: 'Patahan Aktif 1:50K (BIG)' },
        { id: 'toggleLikuifaksi', label: 'Kerentanan Likuifaksi (BIG)' },
        { id: 'toggleKarst', label: 'Kawasan Bentang Alam Karst (BIG)' },
        { id: 'toggleHillshade', label: 'Hillshade' },
        { id: 'toggleBatnas', label: 'Batnas (Batimetri)' }
      ]
    },
    {
      cat: 'Jalan',
      layers: [
        { id: 'toggleTollRoad', label: 'Jalan Tol Pulau Jawa' },
        { id: 'toggleNationalRoad', label: 'Jalan Nasional' },
        { id: 'toggleNonTollRoad', label: 'Jalan Non Tol (BIG)' }
      ]
    },
    {
      cat: 'Market & SPPG',
      layers: [
        { id: 'toggleSebaranPasar', label: 'Sebaran Pasar Indonesia' },
        { id: 'toggleSppgSebaranLayer', label: 'Sebaran SPPG Indonesia' },
        { id: 'toggleSppgLayer', label: 'SPPG Indonesia' }
      ]
    },
    {
      cat: 'Terrain & Lainnya',
      layers: [
        { id: 'toggleDemnasOverlay', label: 'Terrain Overlay (SRTM)' },
        { id: 'toggleCoastlineLayer', label: 'Garis Pantai (Natural Earth)' }
      ]
    },
    {
      cat: 'Dinas PU SDA Jatim (SIH3)',
      subcats: [
        { subcat: 'Hidrologi', layers: [
          { id: 'toggleSih3Dpu_78', label: 'Titik Sampling Kualitas Air' },
          { id: 'toggleSih3Dpu_73', label: 'Sensor Banjir BPBD Jatim' },
          { id: 'toggleSih3Dpu_70', label: 'Pos Tinggi Muka Air Dam Provinsi' },
          { id: 'toggleSih3Dpu_19', label: 'Pos Hujan WS Brantas PJT 1' },
          { id: 'toggleSih3Dpu_18', label: 'Pos Hujan WS Bengawan Solo PJT 1' },
          { id: 'toggleSih3Dpu_16', label: 'Pos Hujan WS BBWS Solo' },
          { id: 'toggleSih3Dpu_81', label: 'Pos Hujan PU SDA' },
          { id: 'toggleSih3Dpu_14', label: 'Pos Hujan BBWS Brantas' },
          { id: 'toggleSih3Dpu_21', label: 'Pos Duga Air WS Brantas PJT 1' },
          { id: 'toggleSih3Dpu_20', label: 'Pos Duga Air WS Bengawan Solo PJT 1' },
          { id: 'toggleSih3Dpu_31', label: 'Pos Duga Air PU SDA' },
          { id: 'toggleSih3Dpu_45', label: 'Pos Duga Air Jam-jaman PU SDA' },
          { id: 'toggleSih3Dpu_17', label: 'Pos Duga Air BBWS Solo' },
          { id: 'toggleSih3Dpu_15', label: 'Pos Duga Air BBWS Brantas' },
          { id: 'toggleSih3Dpu_44', label: 'Hujan Jam-jaman PU SDA' },
          { id: 'toggleSih3Dpu_38', label: 'Hujan Harian WS Welang Rejoso' },
          { id: 'toggleSih3Dpu_41', label: 'Hujan Harian WS Pekalen Sampean' },
          { id: 'toggleSih3Dpu_13', label: 'Hujan Harian WS Madura Bawean' },
          { id: 'toggleSih3Dpu_39', label: 'Hujan Harian WS Brantas' },
          { id: 'toggleSih3Dpu_12', label: 'Hujan Harian WS Bondoyudo Bedadung' },
          { id: 'toggleSih3Dpu_40', label: 'Hujan Harian WS Bengawan Solo' },
          { id: 'toggleSih3Dpu_10', label: 'Hujan Harian WS Baru Bajulmati' },
          { id: 'toggleSih3Dpu_69', label: 'Data TMA Harian PUPR Pamekasan' },
          { id: 'toggleSih3Dpu_84', label: 'Data Prediksi TMA PU SDA' },
          { id: 'toggleSih3Dpu_90', label: 'Data Prediksi Hujan Jam-jaman' },
          { id: 'toggleSih3Dpu_85', label: 'Data Prediksi Debit Sungai' },
          { id: 'toggleSih3Dpu_77', label: 'Data Meteorologi Juanda' },
          { id: 'toggleSih3Dpu_68', label: 'Data Hujan Harian PUPR Pamekasan' },
          { id: 'toggleSih3Dpu_89', label: 'Data Debit Sungai PU SDA' },
          { id: 'toggleSih3Dpu_80', label: 'AWLR Bidang Sungai Waduk Pantai' }
        ]},
        { subcat: 'Hidrogeologi', layers: [
          { id: 'toggleSih3Dpu_83', label: 'Telemetri TMA Tanah ESDM' },
          { id: 'toggleSih3Dpu_43', label: 'Sumur Pantau ESDM' },
          { id: 'toggleSih3Dpu_54', label: 'Sumur Pantau Badan Usaha' }
        ]},
        { subcat: 'Hidrometeorologi', layers: [
          { id: 'toggleSih3Dpu_32', label: 'Pos Hujan Utama BMKG' },
          { id: 'toggleSih3Dpu_36', label: 'Pos Hujan Otomatis BMKG' },
          { id: 'toggleSih3Dpu_29', label: 'Peta Peringatan Dini Kekeringan' }
        ]}
      ]
    },
    {
      cat: 'BBWS Citarum (SIH3)',
      subcats: [
        { subcat: 'Batas Wilayah', layers: [
          { id: 'toggleSih3Cit_16', label: 'Batas DAS WS Citarum' },
          { id: 'toggleSih3Cit_17', label: 'Batas WS Citarum' },
          { id: 'toggleSih3Cit_18', label: 'Kab/Kota WS Citarum' }
        ]},
        { subcat: 'Hidrologi', layers: [
          { id: 'toggleSih3Cit_19', label: 'Pos Duga Air (PDA)' },
          { id: 'toggleSih3Cit_20', label: 'Status Kualitas Air BBWS' },
          { id: 'toggleSih3Cit_21', label: 'Status Kualitas Air DLH' },
          { id: 'toggleSih3Cit_22', label: 'Titik Pos Pantau Kualitas Air' }
        ]},
        { subcat: 'Hidrometeorologi', layers: [
          { id: 'toggleSih3Cit_23', label: 'Pos Curah Hujan (PCH)' },
          { id: 'toggleSih3Cit_24', label: 'Analisis CH Juni 2026' },
          { id: 'toggleSih3Cit_25', label: 'Prakiraan CH Agustus 2026' },
          { id: 'toggleSih3Cit_26', label: 'Prakiraan CH September 2026' },
          { id: 'toggleSih3Cit_27', label: 'Hari Tanpa Hujan Klimatologi' },
          { id: 'toggleSih3Cit_31', label: 'Prakiraan CH Oktober 2026' }
        ]},
        { subcat: 'Hidrogeologi', layers: [
          { id: 'toggleSih3Cit_28', label: '⚠️ Ketersediaan Air Tanah (20.5 MB)' },
          { id: 'toggleSih3Cit_29', label: '⚠️ Hidrogeologi (71.9 MB)' },
          { id: 'toggleSih3Cit_30', label: 'Cekungan Air Tanah' }
        ]}
      ]
    }
  ];

  var _layerCatalogOpen = false;
  var _layerCatalogState = {};

  function toggleLayerCatalog() {
    var dd = document.getElementById('layerCatalogDropdown');
    var btn = document.getElementById('layerCatalogBtn');
    if (!dd || !btn) return;
    _layerCatalogOpen = !_layerCatalogOpen;
    dd.classList.toggle('open', _layerCatalogOpen);
    btn.classList.toggle('active', _layerCatalogOpen);
    if (_layerCatalogOpen && !dd.dataset.built) {
      buildLayerCatalog(dd);
      dd.dataset.built = '1';
    }
    if (_layerCatalogOpen) syncLayerCatalogState();
  }
  window.toggleLayerCatalog = toggleLayerCatalog;

  function closeLayerCatalog() {
    var dd = document.getElementById('layerCatalogDropdown');
    var btn = document.getElementById('layerCatalogBtn');
    if (dd) dd.classList.remove('open');
    if (btn) btn.classList.remove('active');
    _layerCatalogOpen = false;
  }
  window.closeLayerCatalog = closeLayerCatalog;

  function findLayerById(id) {
    var el = document.getElementById(id);
    if (el) return el;
    for (var i = 0; i < LAYER_CATALOG_DATA.length; i++) {
      if (!LAYER_CATALOG_DATA[i].layers) continue;
      for (var j = 0; j < LAYER_CATALOG_DATA[i].layers.length; j++) {
        var l = LAYER_CATALOG_DATA[i].layers[j];
        if (l.id === id && l.dataAttr) {
          return document.querySelector('[data-airvisual-layer="' + l.dataAttr + '"]');
        }
      }
    }
    return null;
  }

  function syncLayerCatalogState() {
    document.querySelectorAll('.lc-item input[type="checkbox"]').forEach(function(cb) {
      var el = findLayerById(cb.dataset.layerId);
      if (el) {
        cb.checked = el.checked;
      } else if (cb.dataset.layerId === 'toggleHujanLayer' && typeof isHujanLayerActive === 'function') {
        cb.checked = isHujanLayerActive();
      } else if (_layerCatalogState.hasOwnProperty(cb.dataset.layerId)) {
        cb.checked = _layerCatalogState[cb.dataset.layerId];
      }
    });
  }

  function buildLayerCatalog(container) {
    var html = '<div class="lc-donation-banner">' +
      '<div class="lc-donation-text">Dukung RuangKita</div>' +
      '<div class="lc-donation-btns">' +
        '<a href="https://saweria.co/maspannn" target="_blank" rel="noopener" class="lc-donation-btn lc-donation-saweria">Saweria</a>' +
        '<a href="https://www.paypal.com/paypalme/panjidanutirto" target="_blank" rel="noopener" class="lc-donation-btn lc-donation-paypal">PayPal</a>' +
      '</div>' +
    '</div>';

      var activeLayers = [];
      LAYER_CATALOG_DATA.forEach(function(cat) {
        var allLayers = cat.layers || [];
        if (cat.subcats) {
          cat.subcats.forEach(function(sc) { allLayers = allLayers.concat(sc.layers || []); });
        }
        allLayers.forEach(function(l) {
          var el = findLayerById(l.id);
          var isChecked = el ? el.checked : (_layerCatalogState[l.id] || false);
          if (l.id === 'toggleHujanLayer' && typeof isHujanLayerActive === 'function') {
            isChecked = isHujanLayerActive();
          }
          if (isChecked) activeLayers.push(l);
        });
      });

    if (activeLayers.length > 0) {
      html += '<div class="lc-category lc-active-group open">';
      html += '<div class="lc-active-header">';
      html += '<button class="lc-cat-header lc-active-header-btn" type="button">';
      html += '<svg class="lc-cat-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
      html += '<span class="lc-cat-title lc-active-title">Layer Aktif</span>';
      html += '<span class="lc-cat-count">' + activeLayers.length + '</span>';
      html += '</button>';
      html += '<button class="lc-clear-all" type="button" id="lcClearAll">Matikan Semua</button>';
      html += '</div>';
      html += '<div class="lc-items">';
      activeLayers.forEach(function(l) {
        html += '<div class="lc-item lc-active-item">';
        html += '<input type="checkbox" id="lc_active_' + l.id + '" data-layer-id="' + l.id + '" checked />';
        html += '<label for="lc_active_' + l.id + '">' + l.label + '</label>';
        html += '</div>';
      });
      html += '</div></div>';
    }

    html += '<input type="text" class="lc-search" placeholder="Cari layer..." />';
    LAYER_CATALOG_DATA.forEach(function(cat, ci) {
      var allLayers = cat.layers || [];
      if (cat.subcats) {
        cat.subcats.forEach(function(sc) { allLayers = allLayers.concat(sc.layers || []); });
      }
      var totalCount = allLayers.length;
      var checked = allLayers.filter(function(l) {
        var el = findLayerById(l.id);
        var isOn = (el && el.checked) || _layerCatalogState[l.id];
        if (l.id === 'toggleHujanLayer' && typeof isHujanLayerActive === 'function') {
          isOn = isHujanLayerActive();
        }
        return isOn;
      }).length;
      html += '<div class="lc-category open" data-ci="' + ci + '">';
      html += '<button class="lc-cat-header" type="button">';
      html += '<svg class="lc-cat-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
      html += '<span class="lc-cat-title">' + cat.cat + '</span>';
      if (cat.type === 'basemap') {
        html += '<span class="lc-cat-count">' + currentBasemapName + '</span>';
      } else {
        html += '<span class="lc-cat-count">' + checked + ' / ' + totalCount + '</span>';
      }
      html += '</button>';
      html += '<div class="lc-items">';
      if (cat.type === 'basemap' && cat.groups) {
        cat.groups.forEach(function(grp) {
          html += '<div class="lc-basemap-group">' + grp.group + '</div>';
          grp.layers.forEach(function(l) {
            var isActive = (l.id === currentBasemapName);
            html += '<div class="lc-item lc-basemap-item' + (isActive ? ' lc-basemap-active' : '') + '" data-basemap-id="' + l.id + '">';
            html += '<input type="radio" name="lc-basemap" id="lc_bm_' + l.id + '" data-basemap-id="' + l.id + '"' + (isActive ? ' checked' : '') + ' />';
            html += '<label for="lc_bm_' + l.id + '">' + l.label + '</label>';
            if (isActive) html += '<span class="lc-basemap-badge">Aktif</span>';
            html += '</div>';
          });
        });
      } else if (cat.subcats) {
        cat.subcats.forEach(function(sc) {
          html += '<div class="lc-subcat-header">' + sc.subcat + '</div>';
          (sc.layers || []).forEach(function(l) {
            var el = findLayerById(l.id);
            var isChecked = el ? el.checked : (_layerCatalogState[l.id] || false);
            if (l.id === 'toggleHujanLayer' && typeof isHujanLayerActive === 'function') {
              isChecked = isHujanLayerActive();
            }
            html += '<div class="lc-item">';
            html += '<input type="checkbox" id="lc_' + l.id + '" data-layer-id="' + l.id + '"' + (isChecked ? ' checked' : '') + ' />';
            html += '<label for="lc_' + l.id + '">' + l.label + '</label>';
            html += '</div>';
          });
        });
      } else {
        (cat.layers || []).forEach(function(l) {
          var el = findLayerById(l.id);
          var isChecked = el ? el.checked : (_layerCatalogState[l.id] || false);
          if (l.id === 'toggleHujanLayer' && typeof isHujanLayerActive === 'function') {
            isChecked = isHujanLayerActive();
          }
          html += '<div class="lc-item">';
          html += '<input type="checkbox" id="lc_' + l.id + '" data-layer-id="' + l.id + '"' + (isChecked ? ' checked' : '') + ' />';
          html += '<label for="lc_' + l.id + '">' + l.label + '</label>';
          html += '<button type="button" class="lc-attr-btn' + (isChecked ? ' lc-attr-btn-show' : '') + '" data-layer-id="' + l.id + '" title="Buka Tabel Atribut">';
          html += '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="12" height="12" rx="1.5"/><line x1="2" y1="5.5" x2="14" y2="5.5"/><line x1="2" y1="9" x2="14" y2="9"/><line x1="5.5" y1="2" x2="5.5" y2="14"/><line x1="9" y1="2" x2="9" y2="14"/></svg>';
          html += '</button>';
          html += '</div>';
        });
      }
      html += '</div></div>';
    });
    container.innerHTML = html;

    var clearAllBtn = document.getElementById('lcClearAll');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        container.querySelectorAll('.lc-active-item input[type="checkbox"]').forEach(function(cb) {
          if (cb.checked) {
            cb.checked = false;
            cb.dispatchEvent(new Event('change'));
          }
        });
        buildLayerCatalog(container);
      });
    }

    container.querySelectorAll('.lc-cat-header').forEach(function(btn) {
      btn.addEventListener('click', function() {
        btn.closest('.lc-category').classList.toggle('open');
      });
    });

    container.querySelectorAll('.lc-basemap-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        if (e.target.tagName === 'INPUT') return;
        var radio = item.querySelector('input[type="radio"]');
        if (radio && !radio.checked) radio.click();
      });
    });

    container.querySelectorAll('input[name="lc-basemap"]').forEach(function(radio) {
      radio.addEventListener('change', function() {
        var bmId = radio.dataset.basemapId;
        setBaseMap(bmId);
        buildLayerCatalog(container);
      });
    });

    container.querySelectorAll('.lc-item input[type="checkbox"]').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var id = cb.dataset.layerId;
        var hasWindowToggle =
          (id === 'toggleSignificantMarkers' && typeof window.toggleSignificantMarkers === 'function') ||
          (id === 'toggleFeltMarkers' && typeof window.toggleFeltMarkers === 'function') ||
          (id === 'toggleLatestEarthquake' && typeof window.toggleLatestEarthquake === 'function') ||
          (id === 'toggleSebaranPasar' && typeof window.toggleSebaranPasar === 'function') ||
          (id === 'toggleSppgSebaranLayer' && typeof window.toggleSppgSebaranLayer === 'function') ||
          (id === 'toggleSppgLayer' && typeof window.toggleSppg === 'function') ||
          (id === 'toggleTollRoad' && typeof window.toggleTollRoadLayer === 'function') ||
          (id === 'toggleNationalRoad' && typeof window.toggleNationalRoadLayer === 'function') ||
          (id === 'toggleNonTollRoad' && typeof window.toggleNonTollRoadLayer === 'function') ||
          (id === 'toggleBumiPersilLayer' && typeof window.toggleBumiPersilLayer === 'function') ||
          (id === 'toggleHujanLayer') ||
          (id === 'toggleCoastlineLayer') ||
          (id === 'toggleFsvaLayer' && typeof window.toggleFsvaLayer === 'function') ||
          (id.indexOf('toggleSih3Dpu_') === 0 && typeof window.toggleSih3DpuLayer === 'function') ||
          (id.indexOf('toggleSih3Cit_') === 0 && typeof window.toggleSih3CitarumLayer === 'function');
        if (!hasWindowToggle) {
          var el = findLayerById(id);
          if (el) {
            el.checked = cb.checked;
            el.dispatchEvent(new Event('change'));
          } else {
            _layerCatalogState[id] = cb.checked;
          }
        } else {
          _layerCatalogState[id] = cb.checked;
          var el = findLayerById(id);
          if (el) el.checked = cb.checked;
        }
        if (id === 'toggleSignificantMarkers' && typeof window.toggleSignificantMarkers === 'function') {
          window.toggleSignificantMarkers(cb.checked);
        }
        if (id === 'toggleFeltMarkers' && typeof window.toggleFeltMarkers === 'function') {
          window.toggleFeltMarkers(cb.checked);
        }
        if (id === 'toggleLatestEarthquake' && typeof window.toggleLatestEarthquake === 'function') {
          window.toggleLatestEarthquake(cb.checked);
        }
        if (id === 'toggleSebaranPasar' && typeof window.toggleSebaranPasar === 'function') {
          window.toggleSebaranPasar(cb.checked);
        }
        if (id === 'toggleSppgSebaranLayer' && typeof window.toggleSppgSebaranLayer === 'function') {
          window.toggleSppgSebaranLayer(cb.checked);
        }
        if (id === 'toggleSppgLayer' && typeof window.toggleSppg === 'function') {
          window.toggleSppg(cb.checked);
        }
        if (id === 'toggleTollRoad' && typeof window.toggleTollRoadLayer === 'function') {
          window.toggleTollRoadLayer(cb.checked);
        }
        if (id === 'toggleNationalRoad' && typeof window.toggleNationalRoadLayer === 'function') {
          window.toggleNationalRoadLayer(cb.checked);
        }
        if (id === 'toggleNonTollRoad' && typeof window.toggleNonTollRoadLayer === 'function') {
          window.toggleNonTollRoadLayer(cb.checked);
        }
        if (id === 'toggleBumiPersilLayer' && typeof window.toggleBumiPersilLayer === 'function') {
          window.toggleBumiPersilLayer(cb.checked);
        }
        if (id === 'toggleCoastlineLayer') {
          toggleCoastlineLayer(cb.checked);
        }
        if (id === 'toggleHujanLayer') {
          toggleHujanLayer(cb.checked);
        }
        if (id === 'toggleFsvaLayer' && typeof window.toggleFsvaLayer === 'function') {
          window.toggleFsvaLayer(cb.checked);
        }
        if (id.indexOf('toggleSih3Dpu_') === 0 && typeof window.toggleSih3DpuLayer === 'function') {
          window.toggleSih3DpuLayer(id.replace('toggleSih3Dpu_', ''), cb.checked);
        }
        if (id.indexOf('toggleSih3Cit_') === 0 && typeof window.toggleSih3CitarumLayer === 'function') {
          window.toggleSih3CitarumLayer(id.replace('toggleSih3Cit_', ''), cb.checked);
        }
        updateCatCount(cb.closest('.lc-category'));
        var attrBtn = cb.closest('.lc-item').querySelector('.lc-attr-btn');
        if (attrBtn) {
          if (cb.checked && typeof hasAttrSupport === 'function' && hasAttrSupport(id)) {
            attrBtn.classList.add('lc-attr-btn-show');
          } else {
            attrBtn.classList.remove('lc-attr-btn-show');
          }
        }
        delete container.dataset.built;
        closeLayerCatalog();
      });
    });

    container.querySelectorAll('.lc-attr-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = btn.dataset.layerId;
        if (typeof hasAttrSupport === 'function' && hasAttrSupport(id)) {
          if (typeof isWmsAttrLayer === 'function' && isWmsAttrLayer(id)) {
            openWmsAttrTable(id);
          } else {
            openAttrTable(id);
          }
        }
      });
    });

    var searchInput = container.querySelector('.lc-search');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        var q = searchInput.value.toLowerCase();
        container.querySelectorAll('.lc-item').forEach(function(item) {
          var text = item.querySelector('label').textContent.toLowerCase();
          item.style.display = text.indexOf(q) !== -1 ? '' : 'none';
        });
        container.querySelectorAll('.lc-category').forEach(function(cat) {
          var visible = cat.querySelectorAll('.lc-item[style=""], .lc-item:not([style])');
          cat.style.display = visible.length === 0 && q ? 'none' : '';
          if (q) cat.classList.add('open');
        });
      });
    }
  }

  function updateCatCount(catEl) {
    if (!catEl) return;
    var total = catEl.querySelectorAll('.lc-item').length;
    var checked = catEl.querySelectorAll('.lc-item input:checked').length;
    var countEl = catEl.querySelector('.lc-cat-count');
    if (countEl) countEl.textContent = checked + ' / ' + total;
  }

  document.addEventListener('DOMContentLoaded', function() {
    var btn = document.getElementById('layerCatalogBtn');
    if (btn) btn.addEventListener('click', function(e) { e.stopPropagation(); toggleLayerCatalog(); });

    document.addEventListener('click', function(e) {
      if (_layerCatalogOpen && !e.target.closest('.layer-catalog-dropdown') && !e.target.closest('.layer-catalog-btn')) {
        closeLayerCatalog();
      }
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        if (_layerCatalogOpen) closeLayerCatalog();
        if (_geotoolsMinimized) { minimizeGeotoolsSheet(); }
        else if (_geotoolsSheetOpen) closeGeotoolsSheet();
      }
    });
  });
