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
    's5p-cloud-fraction': L.tileLayer('', { maxZoom: 9, tms: true, maxNativeZoom: 6, attribution: 'S5P-PAL Cloud Fraction' }),
    's5p-no2-tropo': L.tileLayer('', { maxZoom: 9, tms: true, maxNativeZoom: 6, attribution: 'S5P-PAL NO\u2082' }),
    's5p-ch4': L.tileLayer('', { maxZoom: 9, tms: true, maxNativeZoom: 6, attribution: 'S5P-PAL CH\u2084' }),
    's5p-hcho': L.tileLayer('', { maxZoom: 9, tms: true, maxNativeZoom: 6, attribution: 'S5P-PAL HCHO' }),
    's5p-co': L.tileLayer('', { maxZoom: 9, tms: true, maxNativeZoom: 6, attribution: 'S5P-PAL CO' }),
    's5p-so2': L.tileLayer('', { maxZoom: 9, tms: true, maxNativeZoom: 6, attribution: 'S5P-PAL SO\u2082' }),
    's5p-o3': L.tileLayer('', { maxZoom: 9, tms: true, maxNativeZoom: 6, attribution: 'S5P-PAL O\u2083' })
  };

  const airVisualLayers = {
    'airvisual-pm25': L.tileLayer('https://osm.airvisual.net/cog/pm25/tiles/{z}/{x}/{y}.png', { maxZoom: 12, minZoom: 0, opacity: 0.7, attribution: 'AirVisual' }),
    'airvisual-pm10': L.tileLayer('https://osm.airvisual.net/cog/pm10/tiles/{z}/{x}/{y}.png', { maxZoom: 12, minZoom: 0, opacity: 0.7, attribution: 'AirVisual' }),
    'airvisual-o3': L.tileLayer('https://osm.airvisual.net/cog/o3/tiles/{z}/{x}/{y}.png', { maxZoom: 12, minZoom: 0, opacity: 0.7, attribution: 'AirVisual' }),
    'airvisual-no2': L.tileLayer('https://osm.airvisual.net/cog/no2/tiles/{z}/{x}/{y}.png', { maxZoom: 12, minZoom: 0, opacity: 0.7, attribution: 'AirVisual' }),
    'airvisual-so2': L.tileLayer('https://osm.airvisual.net/cog/so2/tiles/{z}/{x}/{y}.png', { maxZoom: 12, minZoom: 0, opacity: 0.7, attribution: 'AirVisual' }),
    'airvisual-co': L.tileLayer('https://osm.airvisual.net/cog/co/tiles/{z}/{x}/{y}.png', { maxZoom: 12, minZoom: 0, opacity: 0.7, attribution: 'AirVisual' })
  };

  let currentBasemapName = 'bmkg-gk2a';
  let baseBasemapName = 'bmkg-gk2a';
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
    'bmkg-gk2a': 'gk2a'
  };
  var BMKG_PARAMS = {
    'bmkg-himawari': 'EH',
    'bmkg-himawari-fd': 'EH',
    'bmkg-himawari-hires': 'VS',
    'bmkg-gk2a': 'EH'
  };
  window._bmkgModelrunCache = null;

  var _noaaBoundaryLayer = null;
  var NOAA_BASEMAPS = ['noaa-true-color', 'noaa-goes-ir'];
  var S5P_BASEMAPS = ['s5p-cloud-fraction', 's5p-no2-tropo', 's5p-ch4', 's5p-hcho', 's5p-co', 's5p-so2', 's5p-o3'];

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

  function setBaseMap(name) {
    var isHillshade = (name === 'hillshade-indonesia');
    var isPth = (name === 'topografi-pth');
    var isBmkg = BMKG_TILETYPE.hasOwnProperty(name);
    var isS5p = S5P_BASEMAPS.indexOf(name) !== -1;

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
      } else if (name === 'modis-aqua') {
        baseTileLayers[name].setUrl(getGibsDateUrl('MODIS_Aqua_CorrectedReflectance_TrueColor', 'jpg', getYesterdayDate()));
      } else if (name === 'viirs-noaa20') {
        baseTileLayers[name].setUrl(getGibsDateUrl('VIIRS_NOAA20_CorrectedReflectance_TrueColor', 'jpeg', getYesterdayDate()));
      } else if (name === 'viirs-noaa21') {
        baseTileLayers[name].setUrl(getGibsDateUrl('VIIRS_NOAA21_CorrectedReflectance_TrueColor', 'jpeg', getYesterdayDate()));
      } else if (isBmkg) {
        var bmkgLayer = baseTileLayers[name];
        var bmkgModelName = BMKG_TILETYPE[name];
        var bmkgParam = BMKG_PARAMS[name] || 'EH';
        var bmkgXhr = new XMLHttpRequest();
        bmkgXhr.open('GET', 'https://satellite.bmkg.go.id/api22/modelrun', true);
        bmkgXhr.onreadystatechange = function () {
          if (bmkgXhr.readyState !== 4) return;
          if (bmkgXhr.status >= 200 && bmkgXhr.status < 300) {
            try {
              var data = JSON.parse(bmkgXhr.responseText);
              window._bmkgModelrunCache = data;
              var ts = (data[bmkgModelName] || []).slice().reverse()[0];
              if (ts) bmkgLayer.setUrl('https://satellite.bmkg.go.id/api22/tile/{z}/{x}/{y}.png?tiletype=himawari9&modelname=' + bmkgModelName + '&param=' + bmkgParam + '&baserun=' + encodeURIComponent(ts));
            } catch (e) {}
          }
          bmkgLayer.addTo(map);
          if (satelliteBoundary && name !== 'esri-satellite') satelliteBoundary.show(map);
          currentBasemapName = name;
          var sel = document.getElementById('basemapSelect');
          if (sel) sel.value = name;
          map.fire('basemapchanged', { basemap: name });
        };
        bmkgXhr.send();
        return;
      } else if (isS5p) {
        currentBasemapName = name;
        map.fire('basemapchanged', { basemap: name });
        return;
      }
      baseTileLayers[name].addTo(map);
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

  // Hillshade & Batnas toggle (geologi layers)
  document.addEventListener('DOMContentLoaded', function () {
    var hsCb = document.getElementById('toggleHillshade');
    var btCb = document.getElementById('toggleBatnas');
    if (hsCb) hsCb.addEventListener('change', function () {
      if (typeof bnpbHillshade === 'undefined') return;
      if (this.checked) bnpbHillshade.show(); else bnpbHillshade.hide();
    });
    if (btCb) btCb.addEventListener('change', function () {
      if (typeof bnpbHillshade === 'undefined') return;
      if (this.checked) bnpbHillshade.showPth(); else bnpbHillshade.hidePth();
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
    'noaa-true-color': 'NOAA True Color',
    'noaa-goes-ir': 'NOAA GOES IR',
    's5p-cloud-fraction': 'S5P Cloud Fraction',
    's5p-no2-tropo': 'S5P NO\u2082 Tropospheric',
    's5p-ch4': 'S5P CH\u2084',
    's5p-hcho': 'S5P HCHO',
    's5p-co': 'S5P CO',
    's5p-so2': 'S5P SO\u2082',
    's5p-o3': 'S5P O\u2083'
  };

  function createBasemapControl(labels, btnClass, btnIcon) {
    return L.Control.extend({
      options: { position: 'bottomright' },
      onAdd() {
        const wrap = L.DomUtil.create('div', 'basemap-control-wrap');
        L.DomEvent.disableClickPropagation(wrap);
        L.DomEvent.disableScrollPropagation(wrap);

        const dropdown = L.DomUtil.create('div', 'basemap-dropdown', wrap);
        dropdown.style.display = 'none';
        Object.entries(labels).forEach(([key, label]) => {
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

        const btn = L.DomUtil.create('button', 'basemap-btn ' + btnClass, wrap);
        btn.innerHTML = btnIcon;
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
  }

  const VectorBasemapControl = createBasemapControl(
    vectorBasemapLabels,
    'basemap-btn-vector',
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>'
  );
  const SatelliteBasemapControl = createBasemapControl(
    satelliteBasemapLabels,
    'basemap-btn-satellite',
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
  );

  new VectorBasemapControl().addTo(map);
  new SatelliteBasemapControl().addTo(map);

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
    var LegendControl = L.Control.extend({
      options: { position: 'bottomleft' },
      onAdd: function () {
        var el = L.DomUtil.create('div', 'airvisual-legend leaflet-bar');
        L.DomEvent.disableClickPropagation(el);
        L.DomEvent.disableScrollPropagation(el);
        el.innerHTML = buildLegendHtml(key);
        return el;
      }
    });
    _airvisualLegendControl = new LegendControl();
    _airvisualLegendControl.addTo(map);
  }

  function hideAirVisualLegend() {
    if (_airvisualLegendControl) {
      map.removeControl(_airvisualLegendControl);
      _airvisualLegendControl = null;
    }
  }

  // Province boundary layer for AirVisual
  var _provinsiAirvisualLayer = null;

  function loadProvinsiAirvisual() {
    if (_provinsiAirvisualLayer) { _provinsiAirvisualLayer.addTo(map); return; }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'assets/data/bps/geojson/provinsi.geojson', true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var geojson = JSON.parse(xhr.responseText);
          _provinsiAirvisualLayer = L.geoJSON(geojson, {
            style: { color: '#ffffff', weight: 1.5, opacity: 0.8, fillColor: '#ffffff', fillOpacity: 0 },
            interactive: false
          }).addTo(map);
        } catch (e) {
          console.error('[AirVisual] Gagal load provinsi GeoJSON:', e);
        }
      }
    };
    xhr.send();
  }

  function removeProvinsiAirvisual() {
    if (_provinsiAirvisualLayer && map.hasLayer(_provinsiAirvisualLayer)) {
      map.removeLayer(_provinsiAirvisualLayer);
    }
  }

  var _activeAirVisualLayerKey = null;

  function refreshAirVisualPresentation() {
    var activeKeys = Object.keys(airVisualLayers).filter(function (key) { return map.hasLayer(airVisualLayers[key]); });
    if (!activeKeys.length) {
      _activeAirVisualLayerKey = null;
      hideAirVisualLegend();
      removeProvinsiAirvisual();
      return;
    }
    if (activeKeys.indexOf(_activeAirVisualLayerKey) === -1) _activeAirVisualLayerKey = activeKeys[0];
    showAirVisualLegend(_activeAirVisualLayerKey);
    loadProvinsiAirvisual();
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
          'toggleWindAnim', 'toggleWindRgb', 'toggleRhRgb', 'toggleTp24Rgb',
          'togglePm25Rgb', 'toggleHthRgb',
          'toggleMaritimeAngin', 'toggleMaritimeGelombang', 'toggleMaritimeSwell', 'toggleMaritimeWindSea',
          'toggleSawahDilindungi', 'toggleSawahNasional50k',
          'toggleBppLayer', 'toggleSawitLayer', 'toggleErosiLayer',
          'toggleHotspotLayer', 'toggleKawasanHutanLayer', 'toggleGambutLayer', 'toggleKhLayer', 'togglePippibLayer',
          'toggleCuacaPelabuhanLayer', 'toggleCuacaPerairanLayer',
          'toggleSawitNasionalLayer', 'toggleSawitPerkebunanLayer', 'toggleRehabDasLayer', 'togglePerkebunanPl24Layer',
          'toggleRktnSumateraLayer', 'toggleRktnSulawesiLayer', 'toggleRktnPapuaLayer', 'toggleRktnMalukuLayer', 'toggleRktnKalimantanLayer', 'toggleRktnJawaLayer', 'toggleRktnBaliNtLayer',
          'toggleDemnasOverlay', 'toggleSebaranPasar', 'toggleSppgLayer',
          'toggleConcessionsLayer', 'toggleProtectedLayer', 'toggleMangroveLayer', 'togglePeatlandLayer'
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
        if (typeof s5pTmsSliderCleanup === 'function') s5pTmsSliderCleanup();
        if (typeof satelliteBoundary !== 'undefined') satelliteBoundary.hide(map);
        if (typeof modisViirsOverlayCleanup === 'function') modisViirsOverlayCleanup();
        if (typeof cuacaMaritimCleanup === 'function') cuacaMaritimCleanup();
        if (typeof pmtilesCleanup === 'function') pmtilesCleanup();
        if (typeof hideAirVisualLegend === 'function') hideAirVisualLegend();
        if (typeof removeProvinsiAirvisual === 'function') removeProvinsiAirvisual();
        Object.keys(airVisualLayers).forEach(function (key) {
          if (map.hasLayer(airVisualLayers[key])) map.removeLayer(airVisualLayers[key]);
        });
        document.querySelectorAll('[data-airvisual-layer]').forEach(function (input) { input.checked = false; });
        _activeAirVisualLayerKey = null;

        // Bersihkan layer sensor & katalog gempa
        document.querySelectorAll('#toggleKatalogGempa, #toggleSensorSeismic, #toggleSensorGlobal, #toggleHistoryGempa, #toggleSignificantMarkers, #toggleFeltMarkers').forEach(function (cb) {
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
        setBaseMap('google-maps');
        currentBasemapName = 'google-maps';
        var bmOpt = document.querySelector('.basemap-option[data-value="google-maps"]');
        if (bmOpt) {
          document.querySelectorAll('.basemap-option').forEach(function(o) { o.classList.remove('active'); });
          bmOpt.classList.add('active');
        }

        // 11. Reset detail panel
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
  window.__geoportalPrintCtrl = new PrintMapControl().addTo(map);
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
  const KLATEN_WMS_URL = 'https://geoportal.klaten.go.id/geoserver/wms';
  const CIREBON_WMS_URL = 'https://geoserver.cirebonkota.go.id/geoserver/wms';

  /* ── VIIRS NOAA-20 Thermal Anomalies (NASA GIBS WMS) ── */
  var viirsNoaa20Layer = null;

  function toggleViirsNoaa20Layer(show) {
    if (show) {
      if (viirsNoaa20Layer && map.hasLayer(viirsNoaa20Layer)) return;
      if (typeof LayerLoading !== 'undefined') LayerLoading.show();
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
    ecmwfFireLegendCtrl = new EcmwfFireLegendControl();
    ecmwfFireLegendCtrl.addTo(map);
  }

  function hideEcmwfFireLegend() {
    if (!ecmwfFireLegendCtrl) return;
    map.removeControl(ecmwfFireLegendCtrl);
    ecmwfFireLegendCtrl = null;
  }

  function toggleEcmwfFireLayer(show) {
    if (show) {
      if (ecmwfFireLayer && map.hasLayer(ecmwfFireLayer)) return;
      if (typeof LayerLoading !== 'undefined') LayerLoading.show();
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
      ecmwfFireLayer.on('load', function () {
        if (typeof LayerLoading !== 'undefined') LayerLoading.hide();
      });
      ecmwfFireLayer.on('error', function () {
        if (typeof LayerLoading !== 'undefined') LayerLoading.hide();
      });
      ecmwfFireLayer.addTo(map);
      showEcmwfFireLegend();
    } else {
      if (ecmwfFireLayer && map.hasLayer(ecmwfFireLayer)) map.removeLayer(ecmwfFireLayer);
      ecmwfFireLayer = null;
      hideEcmwfFireLegend();
    }
  }

  map.on('click', function (e) {
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
  });

  function toggleHujanLayer(show) {
    if (show) {
      if (typeof activateHujanLayer === 'function') activateHujanLayer();
    } else {
      if (typeof cleanupHujanLayer === 'function') cleanupHujanLayer();
    }
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
