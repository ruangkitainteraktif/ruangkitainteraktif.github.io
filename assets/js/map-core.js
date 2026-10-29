  // EPSG:54034 (World Mollweide) for Pertanian Sawah layer
  if (typeof proj4 !== 'undefined') {
    proj4.defs('EPSG:54034', '+proj=moll +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs');
  }

  // 1. Inisialisasi Peta
  const INITIAL_CENTER = [-7.2575, 112.7521]; // Kota Surabaya
  const INITIAL_ZOOM = 13;
  const map = L.map('map', {
    zoomControl: false,
    preferCanvas: true,
    maxZoom: 22,
    minZoom: 3
  }).setView(INITIAL_CENTER, INITIAL_ZOOM);
  window.map = map;

  // Keep one map popup at a time, then present feature details in a single
  // responsive sheet instead of anchoring the content to a Leaflet popup.
  var catalogPopupSheet = null;
  var catalogPopupCenterTimer = 0;
  var catalogPopupAdTimer = 0;
  var catalogPopupAdRequested = false;
  function ensureCatalogPopupSheet() {
    if (catalogPopupSheet) return catalogPopupSheet;
    var sheet = document.createElement('section');
    sheet.id = 'catalog-popup-sheet';
    sheet.className = 'bhumi-persil-sheet catalog-popup-sheet';
    sheet.setAttribute('role', 'region');
    sheet.setAttribute('aria-label', 'Detail layer peta');
    sheet.setAttribute('aria-hidden', 'true');
    sheet.innerHTML = '<div class="bhumi-persil-sheet-handle" aria-hidden="true"></div><div class="bhumi-persil-sheet-head"><div class="bhumi-persil-sheet-title">Detail Layer</div><div class="bhumi-persil-sheet-actions"><button type="button" class="bhumi-persil-sheet-minimize" aria-label="Minimalkan detail layer" title="Minimalkan panel"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg></button><button type="button" class="bhumi-persil-sheet-close" aria-label="Tutup detail layer" title="Tutup">&times;</button></div></div><div class="bhumi-persil-sheet-content catalog-popup-sheet-content"><div class="catalog-popup-sheet-ad-slot"><ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-7501816933195235" data-ad-slot="1306506445" data-ad-format="auto" data-full-width-responsive="true"></ins></div><div class="catalog-popup-sheet-cards"></div></div>';
    document.body.appendChild(sheet);
    var minimizeButton = sheet.querySelector('.bhumi-persil-sheet-minimize');
    function updateIcon() {
      var minimized = sheet.classList.contains('is-minimized');
      minimizeButton.innerHTML = minimized
        ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg>'
        : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>';
    }
    minimizeButton.addEventListener('click', function () {
      if (window.SheetDrag) {
        if (sheet.classList.contains('is-minimized')) window.SheetDrag.restore('catalog-popup');
        else if (sheet.classList.contains('is-open')) window.SheetDrag.minimize('catalog-popup');
        else {
          window.SheetDrag.buka('catalog-popup');
          window.SheetDrag.minimize('catalog-popup');
        }
      } else {
        var minimized = sheet.classList.toggle('is-minimized');
        sheet.classList.add('is-open');
        document.body.classList.add('catalog-popup-sheet-open');
        document.body.classList.toggle('catalog-popup-sheet-minimized', minimized);
      }
      updateIcon();
    });
    sheet.querySelector('.bhumi-persil-sheet-close').addEventListener('click', function () {
      window.clearTimeout(catalogPopupCenterTimer);
      window.clearTimeout(catalogPopupAdTimer);
      /* Sorotan polygon dari layer katalog (mis. OPT Pertanian) ikut dihapus
         saat card Detail Layer ditutup, supaya tidak ada highlight yatim
         yang tersisa di peta tanpa kartu penjelas. Dijalankan sebelum cabang
         persil karena kedua isi sheet memakai kartu yang sama. */
      (window.catalogHighlightCleanups || []).forEach(function (fn) {
        try { fn(); } catch (err) { /* abaikan cleanup yang gagal */ }
      });
      if (sheet.querySelector('.bhumi-persil-detail-card')) {
        bhumiPersilClearHighlight();
        return;
      }
      sheet.querySelector('.catalog-popup-sheet-cards').innerHTML = '';
      if (window.SheetDrag) window.SheetDrag.close('catalog-popup');
      else sheet.classList.remove('is-open');
      sheet.setAttribute('aria-hidden', 'true');
    });
    sheet.querySelector('.bhumi-persil-sheet-head').addEventListener('click', function (event) {
      if (sheet.classList.contains('is-minimized') && !event.target.closest('.bhumi-persil-sheet-actions') && window.SheetDrag) {
        window.SheetDrag.restore('catalog-popup');
        updateIcon();
      } else if (sheet.classList.contains('is-minimized') && !event.target.closest('.bhumi-persil-sheet-actions')) {
        sheet.classList.remove('is-minimized');
        document.body.classList.remove('catalog-popup-sheet-minimized');
        updateIcon();
      }
    });
    if (window.SheetDrag) {
      window.SheetDrag.register('catalog-popup', {
        el: sheet, openClass: 'is-open', minClass: 'is-minimized',
        bodyOpen: 'catalog-popup-sheet-open', bodyMin: 'catalog-popup-sheet-minimized',
        handle: '.bhumi-persil-sheet-handle', header: '.bhumi-persil-sheet-head',
        minButton: '.bhumi-persil-sheet-minimize',
        labelMin: 'Minimalkan detail layer', labelOpen: 'Perluas detail layer'
      });
    }
    sheet.__updateMinimizeIcon = updateIcon;
    catalogPopupSheet = sheet;
    return sheet;
  }

  function showCatalogPopupInSheet(popup) {
    if (!popup || (popup.options && popup.options.catalogSheet === false)) return false;
    var latlng = (popup.getLatLng && popup.getLatLng()) || popup._latlng ||
      (popup._source && popup._source.getLatLng && popup._source.getLatLng());
    var popupContainer = popup._container;
    var popupContent = popupContainer && popupContainer.querySelector('.leaflet-popup-content');
    if (!popupContent) return false;
    var popupWrapper = popupContainer.querySelector('.leaflet-popup-content-wrapper') || popupContent;
    var sheet = ensureCatalogPopupSheet();
    var content = sheet.querySelector('.catalog-popup-sheet-cards');
    var card = document.createElement('div');
    card.className = 'catalog-popup-sheet-card';
    if (popupContainer.classList) {
      Array.prototype.forEach.call(popupContainer.classList, function (name) {
        if (name !== 'leaflet-popup' && name !== 'leaflet-zoom-animated' && name !== 'leaflet-zoom-hide') card.classList.add(name);
      });
    }
    // Normalize catalog attribute rows into the same two-column table used by
    // the Persil sheet, while moving nodes (rather than copying HTML) so links
    // and any attached behavior remain intact.
    Array.prototype.forEach.call(popupContent.querySelectorAll('.agol-popup-fields'), function (fields) {
      if (!fields.querySelector('.agol-popup-field')) return;
      var table = document.createElement('table');
      table.className = 'bhumi-persil-data-table catalog-feature-data-table';
      var tbody = document.createElement('tbody');
      Array.prototype.forEach.call(fields.querySelectorAll(':scope > .agol-popup-field'), function (field) {
        var label = field.querySelector('.agol-popup-field-label');
        var value = field.querySelector('.agol-popup-field-value');
        if (!label || !value) return;
        var row = document.createElement('tr');
        var heading = document.createElement('th');
        var cell = document.createElement('td');
        heading.scope = 'row';
        while (label.firstChild) heading.appendChild(label.firstChild);
        while (value.firstChild) cell.appendChild(value.firstChild);
        row.appendChild(heading);
        row.appendChild(cell);
        tbody.appendChild(row);
      });
      if (!tbody.children.length) return;
      table.appendChild(tbody);
      fields.parentNode.replaceChild(table, fields);
    });
    Array.prototype.forEach.call(popupContent.querySelectorAll('.fsva-popup-fields'), function (fields) {
      var table = document.createElement('table');
      table.className = 'bhumi-persil-data-table catalog-feature-data-table fsva-feature-data-table';
      var tbody = document.createElement('tbody');
      Array.prototype.forEach.call(fields.children, function (field) {
        var label = field.querySelector('.fsva-popup-field-label');
        var value = field.querySelector('.fsva-popup-field-value');
        if (!label || !value) return;
        var row = document.createElement('tr');
        var heading = document.createElement('th');
        var cell = document.createElement('td');
        heading.scope = 'row';
        heading.textContent = label.textContent;
        var rank = field.querySelector('.fsva-popup-field-rank');
        if (rank) cell.appendChild(rank);
        cell.appendChild(value);
        row.appendChild(heading);
        row.appendChild(cell);
        tbody.appendChild(row);
      });
      if (!tbody.children.length) return;
      table.appendChild(tbody);
      fields.parentNode.replaceChild(table, fields);
    });
    popupContent.style.width = '100%';
    popupContent.style.maxWidth = 'none';
    popupContent.style.margin = '0';
    popupWrapper.style.width = '100%';
    popupWrapper.style.maxWidth = '100%';
    card.appendChild(popupWrapper);
    var persilCard = content.querySelector('.bhumi-persil-detail-card');
    if (persilCard) {
      window.clearTimeout(bhumiPersilCenterTimer);
      bhumiPersilClickSeq++;
      bhumiPersilClearMapSelection();
    }
    content.innerHTML = '';
    content.appendChild(card);
    /* Sheet dipakai ulang untuk semua popup. Tanpa reset ini, card baru
       bisa terbuka pada posisi scroll card sebelumnya sehingga bagian atas
       popup terlihat terpotong. */
    var sheetBody = sheet.querySelector('.bhumi-persil-sheet-content');
    if (sheetBody) {
      sheetBody.scrollTop = 0;
      sheetBody.scrollLeft = 0;
    }
    map.closePopup(popup);
    if (window.SheetDrag) {
      if (!window.SheetDrag.isOpen('catalog-popup')) window.SheetDrag.buka('catalog-popup');
      else if (window.SheetDrag.isMinimized('catalog-popup')) window.SheetDrag.restore('catalog-popup');
      if (sheet.__updateMinimizeIcon) sheet.__updateMinimizeIcon();
    } else sheet.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
    /* Popup PIHPS membuat grafik saat event popupopen. Event awal terjadi
       sebelum node dipindahkan dari popup Leaflet ke Detail Layer, sehingga
       Chart.js dapat mengukur canvas yang sudah tidak terlihat. Jalankan
       ulang listener layer setelah card berada di sheet yang terbuka. */
    if (card.classList.contains('gp-leaflet-popup') && popup._source && popup._source.fire) {
      window.requestAnimationFrame(function () {
        popup._source.fire('popupopen', { popup: popup }, false);
      });
    }
    if (!catalogPopupAdRequested) {
      window.clearTimeout(catalogPopupAdTimer);
      catalogPopupAdTimer = window.setTimeout(function () {
        if (!sheet.classList.contains('is-open') || sheet.classList.contains('is-minimized')) return;
        catalogPopupAdRequested = true;
        try {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (error) {
          catalogPopupAdRequested = false;
          if (window.console && console.warn) console.warn('[AdSense] Slot detail layer gagal dimuat:', error);
        }
      }, 550);
    }
    window.clearTimeout(catalogPopupCenterTimer);
    if (latlng) catalogPopupCenterTimer = window.setTimeout(function () {
      if (!sheet.classList.contains('is-open') || sheet.classList.contains('is-minimized')) return;
      if (typeof map.invalidateSize === 'function') map.invalidateSize({ pan: false });
      map.panTo(latlng, { animate: true, duration: 0.45 });
    }, 420);
    return true;
  }

  map.on('popupopen', function(e) {
    map.eachLayer(function(layer) {
      if (layer !== e.popup._source && layer._popup && layer._popup !== e.popup) {
        layer.closePopup();
      }
    });
    showCatalogPopupInSheet(e.popup);
  });

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
      maxNativeZoom: 19,
      maxZoom: 22,
      attribution: 'Mas Pannn'
    }),
    'petadasar-bpn': L.TileLayer.wmsCached('https://petadasar.meritech.cloud/wms', {
      layers: 'petadasar',
      format: 'image/png',
      transparent: true,
      crs: L.CRS.EPSG3857,
      version: '1.3.0',
      /* tileSize WAJIB 256. Dengan 512, koordinat tile Leaflet berada di
       * grid 512px, sedangkan endpoint fallback
       * petadasar.meritech.cloud/tile/ memakai grid 256px. Akibatnya
       * petadasar-cache.js salah mengirim koordinat: server membalas
       * HTTP 200 berisi placeholder 776 B, bukan 47 KB data sebenarnya.
       * Placeholder itu diterima sebagai tile yang sukses, sehingga isinya
       * terlihat ter-zoom dan tidak sesuai basemap di bawahnya.
       * 256 juga memangkas piksel jadi seperempat sehingga jauh lebih
       * ringan di jaringan seluler. */
      tileSize: 256,
      keepBuffer: 1,
      updateWhenIdle: true,
      updateWhenZooming: false,
      /* XYZ hanya menyediakan tile z16-z21 (di luar itu server membalas
       * 404). Layer mengikuti rentang itu supaya tidak ada permintaan
       * yang pasti kosong. Peta global tetap bisa di-zoom 3-22. */
      maxZoom: 21,
      minZoom: 16,
      attribution: 'ATR/BPN'
    }),
    'landsat-agriculture': L.esri.imageMapLayer({
      url: 'https://landsat2.arcgis.com/arcgis/rest/services/Landsat/MS/ImageServer',
      renderingRule: { rasterFunction: 'Agriculture with DRA' },
      mosaicRule: {
        mosaicMethod: 'esriMosaicAttribute',
        sortField: 'Best',
        sortValue: '0',
        mosaicOperation: 'MT_FIRST'
      },
      format: 'jpgpng',
      opacity: 1,
      minZoom: 5,
      maxZoom: 19,
      attribution: 'Esri, USGS, NASA'
    }),
    'landsat-agriculture-v2': L.esri.imageMapLayer({
      url: 'https://landsat.arcgis.com/arcgis/rest/services/Landsat/MS/ImageServer',
      renderingRule: { rasterFunction: 'Agriculture with DRA' },
      mosaicRule: {
        mosaicMethod: 'esriMosaicAttribute',
        sortField: 'Best',
        sortValue: '0',
        mosaicOperation: 'MT_FIRST'
      },
      format: 'jpgpng',
      opacity: 1,
      minZoom: 5,
      maxZoom: 19,
      attribution: 'Esri, USGS, NASA'
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
    'google-satellite-kh': L.tileLayer('https://khms{s}.google.com/kh/v=1015?x={x}&y={y}&z={z}', {
      subdomains: ['0', '1', '2', '3'],
      maxNativeZoom: 20,
      maxZoom: 22,
      attribution: 'Google'
    }),
    'modis-terra': L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{Time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg', {
      maxNativeZoom: 12,
      maxZoom: 22,
      minZoom: 0,
      attribution: 'NASA GIBS',
      Time: new Date().toISOString().slice(0, 10)
    }),
    'modis-aqua': L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Aqua_CorrectedReflectance_TrueColor/default/{Time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg', {
      maxNativeZoom: 12,
      maxZoom: 22,
      minZoom: 0,
      attribution: 'NASA GIBS',
      Time: new Date().toISOString().slice(0, 10)
    }),
    'viirs-noaa20': L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/{Time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpeg', {
      maxNativeZoom: 9,
      maxZoom: 22,
      minZoom: 0,
      Time: (function () { var d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })(),
      attribution: 'NASA GIBS'
    }),
    'viirs-noaa21': L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA21_CorrectedReflectance_TrueColor/default/{Time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpeg', {
      maxNativeZoom: 9,
      maxZoom: 22,
      minZoom: 0,
      Time: (function () { var d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })(),
      attribution: 'NASA GIBS'
    }),
    'viirs-snpp': L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/{Time}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpeg', {
      maxNativeZoom: 9,
      maxZoom: 22,
      minZoom: 0,
      Time: (function () { var d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })(),
      attribution: 'NASA GIBS'
    }),
    'oci-pace': L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/OCI_PACE_True_Color/default/{Time}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.jpeg', {
      maxNativeZoom: 7,
      maxZoom: 22,
      minZoom: 0,
      Time: (function () { var d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })(),
      attribution: 'NASA GIBS'
    }),
    'bmkg-himawari': L.tileLayer('https://satellite.bmkg.go.id/api22/tile/{z}/{x}/{y}.png?tiletype=himawari9&modelname=himawari9&param=EH&baserun=', {
      maxNativeZoom: 10,
      maxZoom: 22,
      minZoom: 3,
      tms: true,
      attribution: 'BMKG Himawari-9'
    }),
    'bmkg-himawari-nc': L.tileLayer('https://satellite.bmkg.go.id/api22/tile/{z}/{x}/{y}.png?tiletype=himawari9&modelname=himawari9&param=NC&baserun=', {
      maxNativeZoom: 10,
      maxZoom: 22,
      minZoom: 3,
      tms: true,
      attribution: 'BMKG Himawari-9 Natural Color'
    }),
    'bmkg-himawari-wv': L.tileLayer('https://satellite.bmkg.go.id/api22/tile/{z}/{x}/{y}.png?tiletype=himawari9&modelname=himawari9&param=WV&baserun=', {
      maxNativeZoom: 10,
      maxZoom: 22,
      minZoom: 3,
      tms: true,
      attribution: 'BMKG Himawari-9 Water Vapor'
    }),
    'bmkg-himawari-rp': L.tileLayer('https://satellite.bmkg.go.id/api22/tile/{z}/{x}/{y}.png?tiletype=himawari9&modelname=himawari9&param=RP&baserun=', {
      maxNativeZoom: 10,
      maxZoom: 22,
      minZoom: 3,
      tms: true,
      attribution: 'BMKG Himawari-9 Rainfall'
    }),
    'bmkg-himawari-sw': L.tileLayer('https://satellite.bmkg.go.id/api22/tile/{z}/{x}/{y}.png?tiletype=himawari9&modelname=himawari9&param=SW&baserun=', {
      maxNativeZoom: 10,
      maxZoom: 22,
      minZoom: 3,
      tms: true,
      attribution: 'BMKG Himawari-9 Shortwave IR'
    }),
    'bmkg-himawari-sm': L.tileLayer('https://satellite.bmkg.go.id/api22/tile/{z}/{x}/{y}.png?tiletype=himawari9&modelname=himawari9&param=SM&baserun=', {
      maxNativeZoom: 10,
      maxZoom: 22,
      minZoom: 3,
      tms: true,
      attribution: 'BMKG Himawari-9 SST'
    }),
    'bmkg-himawari-va': L.tileLayer('https://satellite.bmkg.go.id/api22/tile/{z}/{x}/{y}.png?tiletype=himawari9&modelname=himawari9&param=VA&baserun=', {
      maxNativeZoom: 10,
      maxZoom: 22,
      minZoom: 3,
      tms: true,
      attribution: 'BMKG Himawari-9 Volcanic Ash'
    }),
    'bmkg-himawari-vs': L.tileLayer('https://satellite.bmkg.go.id/api22/tile/{z}/{x}/{y}.png?tiletype=himawari9&modelname=himawari9&param=VS&baserun=', {
      maxNativeZoom: 10,
      maxZoom: 22,
      minZoom: 3,
      tms: true,
      attribution: 'BMKG Himawari-9 Visible'
    }),
    'bmkg-himawari-fd': L.tileLayer('https://satellite.bmkg.go.id/api22/tile/{z}/{x}/{y}.png?tiletype=himawari9&modelname=himawari9fd&param=EH&baserun=', {
      maxNativeZoom: 10,
      maxZoom: 22,
      minZoom: 3,
      tms: true,
      attribution: 'BMKG Himawari-9 FD'
    }),
    'bmkg-himawari-hires': L.tileLayer('https://satellite.bmkg.go.id/api22/tile/{z}/{x}/{y}.png?tiletype=himawari9&modelname=himawari9hires&param=VS&baserun=', {
      maxNativeZoom: 10,
      maxZoom: 22,
      minZoom: 3,
      tms: true,
      attribution: 'BMKG Himawari-9 Hi-Res'
    }),
    'bmkg-gk2a': L.tileLayer('https://satellite.bmkg.go.id/api22/tile/{z}/{x}/{y}.png?tiletype=himawari9&modelname=gk2a&param=EH&baserun=', {
      maxNativeZoom: 10,
      maxZoom: 22,
      minZoom: 3,
      tms: true,
      attribution: 'BMKG GK-2A IR'
    }),
    'bmkg-gk2a-wv': L.tileLayer('https://satellite.bmkg.go.id/api22/tile/{z}/{x}/{y}.png?tiletype=himawari9&modelname=gk2a&param=WV&baserun=', {
      maxNativeZoom: 10,
      maxZoom: 22,
      minZoom: 3,
      tms: true,
      attribution: 'BMKG GK-2A Water Vapor'
    }),
    'bmkg-gk2a-rp': L.tileLayer('https://satellite.bmkg.go.id/api22/tile/{z}/{x}/{y}.png?tiletype=himawari9&modelname=gk2a&param=RP&baserun=', {
      maxNativeZoom: 10,
      maxZoom: 22,
      minZoom: 3,
      tms: true,
      attribution: 'BMKG GK-2A Rainfall'
    }),
    'nowcoast-visible-imagery': L.tileLayer.wms('https://nowcoast.noaa.gov/geoserver/satellite/wms', {
      layers: 'global_visible_imagery_mosaic',
      format: 'image/png',
      transparent: true,
      version: '1.3.0',
      crs: L.CRS.EPSG3857,
      tileSize: 256,
      maxNativeZoom: 18,
      keepBuffer: 1,
      updateWhenIdle: true,
      updateWhenZooming: false
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
      maxNativeZoom: 13,
      maxZoom: 22,
      minZoom: 0,
      attribution: 'Sentinel-2 cloudless by EOX'
    }),
    'eox-s2cloudless-2024': L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpeg', {
      maxNativeZoom: 14,
      maxZoom: 22,
      minZoom: 0,
      attribution: 'EOX - Sentinel-2 cloudless 2024'
    }),
    'eox-blackmarble': L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/blackmarble_3857/default/g/{z}/{y}/{x}.jpg', {
      maxNativeZoom: 12,
      maxZoom: 22,
      minZoom: 0,
      attribution: 'NASA Black Marble - EOX'
    }),
    'eox-terrain-light': L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/terrain-light_3857/default/g/{z}/{y}/{x}.jpg', {
      maxNativeZoom: 12,
      maxZoom: 22,
      minZoom: 0,
      attribution: 'EOX Terrain Light'
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

  function _omiDate(offset) {
    var d = new Date();
    d.setDate(d.getDate() + (offset || -1));
    return d.toISOString().slice(0, 10);
  }
  var omiLayers = {
    'omi-aerosol-index': L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/OMI_Aerosol_Index/default/' + _omiDate(-1) + '/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png', {
      maxZoom: 6, minZoom: 0, opacity: 0.75, attribution: 'NASA GIBS OMI'
    }),
    'omi-so2': L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/OMI_SO2_Lower_Troposphere/default/' + _omiDate(-2) + '/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png', {
      maxZoom: 5, minZoom: 0, opacity: 0.75, attribution: 'NASA GIBS OMI'
    }),
    'omi-no2': L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/OMI_Nitrogen_Dioxide_Tropo_Column/default/' + _omiDate(-8) + '/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png', {
      maxZoom: 5, minZoom: 0, opacity: 0.75, attribution: 'NASA GIBS OMI'
    }),
    'omi-aod-abs': L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/OMI_Absorbing_Aerosol_Optical_Depth/default/' + _omiDate(-1) + '/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png', {
      maxZoom: 6, minZoom: 0, opacity: 0.75, attribution: 'NASA GIBS OMI'
    }),
    'omi-modis-terra-aod': L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_Aerosol/default/' + _omiDate(-1) + '/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png', {
      maxZoom: 6, minZoom: 0, opacity: 0.75, attribution: 'NASA GIBS MODIS Terra'
    }),
    'omi-modis-aqua-aod': L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Aqua_Aerosol/default/' + _omiDate(-1) + '/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png', {
      maxZoom: 6, minZoom: 0, opacity: 0.75, attribution: 'NASA GIBS MODIS Aqua'
    }),
    'omi-so2-pbl': L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/OMI_SO2_Planetary_Boundary_Layer/default/' + _omiDate(-2) + '/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png', {
      maxZoom: 6, minZoom: 0, opacity: 0.75, attribution: 'NASA GIBS OMI'
    }),
    'omps-noaa20-so2-lt': L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/OMPS_NOAA20_SO2_Lower_Troposphere/default/' + _omiDate(-2) + '/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png', {
      maxZoom: 6, minZoom: 0, opacity: 0.75, attribution: 'NASA GIBS OMPS NOAA-20'
    })
  };
  window.omiLayers = omiLayers;

  /* ── GHRSST SST Anomaly (NASA GIBS WMS) ── */
  var _ghrsstLayer = null;
  var _ghrsstCtrl = null;
  var _ghrsstCurrentOffset = 2;
  var GHRSST_START = '2002-07-01';
  var GHRSST_MIN_OFFSET = 2;

  function _ghrsstDateStr(offsetDays) {
    var d = new Date();
    d.setDate(d.getDate() - offsetDays);
    return d.toISOString().slice(0, 10);
  }
  function _ghrsstMaxOffset() {
    var start = new Date(GHRSST_START);
    var now = new Date();
    return Math.max(GHRSST_MIN_OFFSET, Math.floor((now - start) / 864e5) - 2);
  }
  function _ghrsstApply() {
    var ds = _ghrsstDateStr(_ghrsstCurrentOffset);
    if (_ghrsstLayer) _ghrsstLayer.setParams({ time: ds });
    if (_ghrsstCtrl && _ghrsstCtrl._dateEl) _ghrsstCtrl._dateEl.textContent = ds;
    if (_ghrsstCtrl && _ghrsstCtrl._slider) _ghrsstCtrl._slider.value = String(_ghrsstCurrentOffset);
  }

  function _createGhrsstTimeSlider() {
    if (_ghrsstCtrl) return;
    var maxOff = _ghrsstMaxOffset();
    _ghrsstCurrentOffset = GHRSST_MIN_OFFSET;

    _ghrsstCtrl = L.control({ position: 'bottomcenter' });
    _ghrsstCtrl.onAdd = function () {
      var wrap = L.DomUtil.create('div', 'ghrsst-time-slider-wrap');
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(wrap);

      var controlsRow = L.DomUtil.create('div', 'ghrsst-ts-controls', wrap);

      var prevBtn = L.DomUtil.create('button', 'ghrsst-ts-btn ghrsst-ts-prev', controlsRow);
      prevBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
      prevBtn.title = 'Lebih baru';

      var sliderWrap = L.DomUtil.create('div', 'ghrsst-ts-slider-wrap', controlsRow);
      var slider = L.DomUtil.create('input', 'ghrsst-ts-slider', sliderWrap);
      slider.type = 'range';
      slider.min = String(GHRSST_MIN_OFFSET);
      slider.max = String(maxOff);
      slider.value = String(GHRSST_MIN_OFFSET);
      slider.step = '1';

      var nextBtn = L.DomUtil.create('button', 'ghrsst-ts-btn ghrsst-ts-next', controlsRow);
      nextBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
      nextBtn.title = 'Lebih lama';

      var infoRow = L.DomUtil.create('div', 'ghrsst-ts-info', wrap);
      var dateDisplay = L.DomUtil.create('span', 'ghrsst-ts-date', infoRow);
      dateDisplay.textContent = _ghrsstDateStr(1);

      var layerLabel = L.DomUtil.create('span', 'ghrsst-ts-layer', infoRow);
      layerLabel.textContent = 'GHRSST SST Anomaly';

      slider.addEventListener('input', function () {
        _ghrsstCurrentOffset = parseInt(this.value, 10);
        _ghrsstApply();
      });
      prevBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (_ghrsstCurrentOffset > GHRSST_MIN_OFFSET) {
          _ghrsstCurrentOffset--;
          _ghrsstApply();
        }
      });
      nextBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (_ghrsstCurrentOffset < maxOff) {
          _ghrsstCurrentOffset++;
          _ghrsstApply();
        }
      });

      _ghrsstCtrl._dateEl = dateDisplay;
      _ghrsstCtrl._slider = slider;
      return wrap;
    };

    ensureBottomCenterControlCorner();
    _ghrsstCtrl.addTo(map);
  }
  function _removeGhrsstTimeSlider() {
    if (_ghrsstCtrl) {
      map.removeControl(_ghrsstCtrl);
      _ghrsstCtrl = null;
    }
  }

  function ensureBottomCenterControlCorner() {
    if (map._controlCorners.bottomcenter) return;
    map._controlCorners.bottomcenter = L.DomUtil.create('div', 'leaflet-bottom leaflet-center', map._controlContainer);
  }

  function toggleGhrsstSstAnomali(visible) {
    if (visible) {
      if (_ghrsstLayer && map.hasLayer(_ghrsstLayer)) return;
      var dateStr = _ghrsstDateStr(GHRSST_MIN_OFFSET);
      _ghrsstLayer = L.tileLayer.wms('https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi', {
        layers: 'GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies',
        format: 'image/png',
        transparent: true,
        crs: L.CRS.EPSG3857,
        attribution: 'NASA GIBS / GHRSST',
        opacity: 0.75,
        version: '1.3.0',
        time: dateStr
      }).addTo(map);
      _createGhrsstTimeSlider();
      showGhrsstLegend();
    } else {
      if (_ghrsstLayer && map.hasLayer(_ghrsstLayer)) map.removeLayer(_ghrsstLayer);
      _ghrsstLayer = null;
      _removeGhrsstTimeSlider();
      hideGhrsstLegend();
    }
  }
  window.toggleGhrsstSstAnomali = toggleGhrsstSstAnomali;

  function showGhrsstLegend() {
    if (typeof addUnifiedLegend !== 'function') return;
    var existing = document.querySelector('[data-legend-id="ghrsst-sst"]');
    if (existing) existing.remove();
    var el = L.DomUtil.create('div', 'omi-legend leaflet-bar');
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
    var titleEl = L.DomUtil.create('div', 'omi-legend-title', el);
    titleEl.textContent = 'SST Anomaly (GHRSST MUR)';
    var bar = L.DomUtil.create('div', 'himawari-legend-bar', el);
    bar.style.background = 'linear-gradient(90deg,#08306b,#08519c,#2171b5,#4292c6,#6baed6,#9ecae1,#c6dbef,#f7fbff,#fee0d2,#fcbba1,#fc9272,#fb6a4a,#ef3b2c,#cb181d,#a50f15,#67000d)';
    bar.style.height = '14px';
    bar.style.borderRadius = '3px';
    var labelsRow = L.DomUtil.create('div', 'himawari-legend-labels', el);
    labelsRow.style.display = 'flex';
    labelsRow.style.justifyContent = 'space-between';
    labelsRow.style.fontSize = '10px';
    ['-4', '-3', '-2', '-1', '0', '+1', '+2', '+3', '+4'].forEach(function (lbl) {
      var span = document.createElement('span');
      span.textContent = lbl;
      labelsRow.appendChild(span);
    });
    var unitEl = L.DomUtil.create('div', 'himawari-legend-unit', el);
    unitEl.textContent = '°C dari rata-rata | Resolusi: 1km | Sumber: NASA GIBS / GHRSST MUR';
    addUnifiedLegend('ghrsst-sst', typeof createLegendWithToggle === 'function' ? createLegendWithToggle(el) : el);
  }
  function hideGhrsstLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('ghrsst-sst');
  }

  var _activeOmiLegendKey = null;
  var _omiLegendControl = null;

  var OMI_LEGEND_DATA = {
    'omi-aerosol-index': {
      imgUrl: 'https://gibs.earthdata.nasa.gov/legends/OMI_Aerosol_Index_H.svg',
      title: 'UV Aerosol Index (OMI)'
    },
    'omi-so2': {
      imgUrl: 'https://gibs.earthdata.nasa.gov/legends/OMI_SO2_Lower_Troposphere_H.svg',
      title: 'SO\u2082 Troposphere Bawah (OMI)'
    },
    'omi-no2': {
      imgUrl: 'https://gibs.earthdata.nasa.gov/legends/OMI_Nitrogen_Dioxide_Tropo_Column_H.svg',
      title: 'NO\u2082 Tropospheric Column (OMI)'
    },
    'omi-aod-abs': {
      imgUrl: 'https://gibs.earthdata.nasa.gov/legends/OMI_Absorbing_Aerosol_Optical_Depth_H.svg',
      title: 'Absorbing AOD Near-UV (OMI)'
    },
    'omi-modis-terra-aod': {
      custom: true,
      title: 'Aerosol Optical Depth (MODIS Terra)',
      gradient: 'linear-gradient(90deg,#ffffcc,#c7e9b4,#7fcdbb,#41b6c4,#1d91c0,#225ea8,#0c2c84)',
      labels: ['0.0', '0.1', '0.2', '0.3', '0.5', '1.0', '2.0+'],
      unit: 'AOD 550nm | Resolusi: 10km | Sumber: NASA GIBS / MODIS Terra'
    },
    'omi-modis-aqua-aod': {
      custom: true,
      title: 'Aerosol Optical Depth (MODIS Aqua)',
      gradient: 'linear-gradient(90deg,#ffffcc,#c7e9b4,#7fcdbb,#41b6c4,#1d91c0,#225ea8,#0c2c84)',
      labels: ['0.0', '0.1', '0.2', '0.3', '0.5', '1.0', '2.0+'],
      unit: 'AOD 550nm | Resolusi: 10km | Sumber: NASA GIBS / MODIS Aqua'
    },
    'omi-so2-pbl': {
      imgUrl: 'https://gibs.earthdata.nasa.gov/legends/OMI_SO2_Planetary_Boundary_Layer_H.svg',
      title: 'SO\u2082 Planetary Boundary Layer (OMI)'
    },
    'omps-noaa20-so2-lt': {
      custom: true,
      title: 'SO\u2082 Lower Troposphere (OMPS NOAA-20)',
      gradient: 'linear-gradient(90deg,#f7fbff,#deebf7,#c6dbef,#9ecae1,#6baed6,#4292c6,#2171b5,#08519c,#08306b)',
      labels: ['-0.5', '0.0', '0.5', '1.0', '2.0', '3.0', '5.0+'],
      unit: 'SO\u2082 DU | Resolusi: 13.5x24km | Sumber: NASA GIBS / OMPS NOAA-20'
    }
  };

  function showOmiLegend(key) {
    hideOmiLegend();
    if (typeof addUnifiedLegend !== 'function') return;
    var d = OMI_LEGEND_DATA[key];
    if (!d) return;
    var el = L.DomUtil.create('div', 'omi-legend leaflet-bar');
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
    var titleEl = L.DomUtil.create('div', 'omi-legend-title', el);
    titleEl.textContent = d.title;
    if (d.custom) {
      var bar = L.DomUtil.create('div', 'himawari-legend-bar', el);
      bar.style.background = d.gradient;
      bar.style.height = '14px';
      bar.style.borderRadius = '3px';
      var labelsRow = L.DomUtil.create('div', 'himawari-legend-labels', el);
      labelsRow.style.display = 'flex';
      labelsRow.style.justifyContent = 'space-between';
      labelsRow.style.fontSize = '10px';
      (d.labels || []).forEach(function (lbl) {
        var span = document.createElement('span');
        span.textContent = lbl;
        labelsRow.appendChild(span);
      });
      if (d.unit) {
        var unitEl = L.DomUtil.create('div', 'himawari-legend-unit', el);
        unitEl.textContent = d.unit;
      }
    } else {
      var imgEl = L.DomUtil.create('img', 'omi-legend-img', el);
      imgEl.src = d.imgUrl;
      imgEl.alt = d.title;
      imgEl.style.width = '280px';
    }
    addUnifiedLegend('omi', typeof createLegendWithToggle === 'function' ? createLegendWithToggle(el) : el);
    _omiLegendControl = true;
  }

  function hideOmiLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('omi');
    _omiLegendControl = null;
  }

  function refreshOmiPresentation() {
    var activeKeys = Object.keys(omiLayers).filter(function (key) { return map.hasLayer(omiLayers[key]); });
    if (!activeKeys.length) {
      _activeOmiLegendKey = null;
      hideOmiLegend();
      return;
    }
    if (activeKeys.indexOf(_activeOmiLegendKey) === -1) _activeOmiLegendKey = activeKeys[0];
    showOmiLegend(_activeOmiLegendKey);
  }

  function toggleOmiLayer(key, visible) {
    var layer = omiLayers[key];
    if (!layer) return;
    if (visible) {
      layer.addTo(map);
      _activeOmiLegendKey = key;
    } else if (map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
    refreshOmiPresentation();
  }
  window.toggleOmiLayer = toggleOmiLayer;

  let currentBasemapName = 'google-maps';
  window.currentBasemapName = currentBasemapName;
  let baseBasemapName = 'esri-dark-gray';
  let currentRdtrOpacity = 0.8;

  function getYesterdayDate() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  function getTwoDaysAgoDate() {
    var d = new Date();
    d.setDate(d.getDate() - 2);
    return d.toISOString().slice(0, 10);
  }

  function getGibsDateUrl(layerId, ext, dateStr, level) {
    var lvl = level || 9;
    return 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/' + layerId + '/default/' + dateStr + '/GoogleMapsCompatible_Level' + lvl + '/{z}/{y}/{x}.' + ext;
  }

  var BMKG_TILETYPE = {
    'bmkg-himawari': 'himawari9',
    'bmkg-himawari-nc': 'himawari9',
    'bmkg-himawari-wv': 'himawari9',
    'bmkg-himawari-rp': 'himawari9',
    'bmkg-himawari-sw': 'himawari9',
    'bmkg-himawari-sm': 'himawari9',
    'bmkg-himawari-va': 'himawari9',
    'bmkg-himawari-vs': 'himawari9',
    'bmkg-himawari-fd': 'himawari9fd',
    'bmkg-himawari-hires': 'himawari9hires',
    'bmkg-gk2a': 'gk2a',
    'bmkg-gk2a-wv': 'gk2a',
    'bmkg-gk2a-rp': 'gk2a'
  };
  var BMKG_PARAMS = {
    'bmkg-himawari': 'EH',
    'bmkg-himawari-nc': 'NC',
    'bmkg-himawari-wv': 'WV',
    'bmkg-himawari-rp': 'RP',
    'bmkg-himawari-sw': 'SW',
    'bmkg-himawari-sm': 'SM',
    'bmkg-himawari-va': 'VA',
    'bmkg-himawari-vs': 'VS',
    'bmkg-himawari-fd': 'EH',
    'bmkg-himawari-hires': 'VS',
    'bmkg-gk2a': 'EH',
    'bmkg-gk2a-wv': 'WV',
    'bmkg-gk2a-rp': 'RP'
  };
  window._bmkgModelrunCache = null;

  var _noaaBoundaryLayer = null;
  var NOAA_BASEMAPS = ['noaa-true-color', 'noaa-goes-ir'];

  var petadasarIndexLayer = L.tileLayer(
    'https://petadasar.atrbpn.go.id/main/tmi/{x}/{y}/{z}/' + new Date().getFullYear() + '/0',
    { minZoom: 5, maxZoom: 19, pane: 'overlayPane', attribution: 'MDP ATR/BPN' }
  );

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
    'bmkg-himawari-nc': 'Citra BMKG Himawari-9 Natural Color tidak tersedia.',
    'bmkg-himawari-wv': 'Citra BMKG Himawari-9 Water Vapor tidak tersedia.',
    'bmkg-himawari-rp': 'Citra BMKG Himawari-9 Rainfall tidak tersedia.',
    'bmkg-himawari-sw': 'Citra BMKG Himawari-9 Shortwave IR tidak tersedia.',
    'bmkg-himawari-sm': 'Citra BMKG Himawari-9 SST tidak tersedia.',
    'bmkg-himawari-va': 'Citra BMKG Himawari-9 Volcanic Ash tidak tersedia.',
    'bmkg-himawari-vs': 'Citra BMKG Himawari-9 Visible tidak tersedia.',
    'bmkg-himawari-fd': 'Citra BMKG Himawari-9 Full Disk tidak tersedia.',
    'bmkg-himawari-hires': 'Citra BMKG Himawari-9 Hi-Res tidak tersedia.',
    'bmkg-gk2a': 'Citra BMKG GK-2A tidak tersedia saat ini.',
    'bmkg-gk2a-wv': 'Citra BMKG GK-2A Water Vapor tidak tersedia.',
    'bmkg-gk2a-rp': 'Citra BMKG GK-2A Rainfall tidak tersedia.',
    'modis-terra': 'Citra NASA GIBS MODIS Terra tidak tersedia.',
    'modis-aqua': 'Citra NASA GIBS MODIS Aqua tidak tersedia.',
    'viirs-noaa20': 'Citra NASA GIBS VIIRS NOAA-20 tidak tersedia.',
    'viirs-noaa21': 'Citra NASA GIBS VIIRS NOAA-21 tidak tersedia.',
    'viirs-snpp': 'Citra NASA GIBS VIIRS SNPP tidak tersedia.',
    'oci-pace': 'Citra NASA GIBS OCI PACE tidak tersedia.',
    'chlorophyll-a': 'Citra NASA GIBS Chlorophyll-a tidak tersedia.',
    'par': 'Citra NASA GIBS PAR tidak tersedia.',
    'noaa-true-color': 'Citra NOAA True Color tidak tersedia.',
    'noaa-goes-ir': 'Citra NOAA GOES IR tidak tersedia.'
  };

  var SATELLITE_TILES = ['bmkg-himawari', 'bmkg-himawari-nc', 'bmkg-himawari-wv', 'bmkg-himawari-rp', 'bmkg-himawari-sw', 'bmkg-himawari-sm', 'bmkg-himawari-va', 'bmkg-himawari-vs', 'bmkg-himawari-fd', 'bmkg-himawari-hires',     'bmkg-gk2a', 'bmkg-gk2a-wv', 'bmkg-gk2a-rp',
    'modis-terra', 'modis-aqua', 'viirs-noaa20', 'viirs-noaa21',     'viirs-snpp', 'oci-pace',
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

    if (typeof window.cleanupSentinel1Rtc === 'function') {
      window.cleanupSentinel1Rtc();
    }

    Object.entries(baseTileLayers).forEach(function (entry) {
      if (map.hasLayer(entry[1])) map.removeLayer(entry[1]);
    });
    if (map.hasLayer(petadasarIndexLayer)) map.removeLayer(petadasarIndexLayer);

    if (isHillshade) {
      baseTileLayers[baseBasemapName].addTo(map);
      if (typeof bnpbHillshade !== 'undefined') bnpbHillshade.show();
      if (typeof bnpbHillshade !== 'undefined') bnpbHillshade.hideBatnas();
    } else if (isPth) {
      baseTileLayers[baseBasemapName].addTo(map);
      if (typeof bnpbHillshade !== 'undefined') bnpbHillshade.showPth();
      if (typeof bnpbHillshade !== 'undefined') bnpbHillshade.hideBatnas();
    } else {
      if (typeof bnpbHillshade !== 'undefined') bnpbHillshade.hide();
      if (typeof bnpbHillshade !== 'undefined') bnpbHillshade.hidePth();
      if (typeof bnpbHillshade !== 'undefined') bnpbHillshade.hideBatnas();
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
      } else if (name === 'viirs-snpp') {
        baseTileLayers[name].setUrl(getGibsDateUrl('VIIRS_SNPP_CorrectedReflectance_TrueColor', 'jpeg', getYesterdayDate()));
        baseTileLayers[name].addTo(map);
        attachTileError(name);
      } else if (name === 'oci-pace') {
        baseTileLayers[name].setUrl(getGibsDateUrl('OCI_PACE_True_Color', 'jpeg', getYesterdayDate(), 7));
        baseTileLayers[name].addTo(map);
        attachTileError(name);
      } else if (isBmkg) {
        var bmkgLayer = baseTileLayers[name];
        var bmkgModelName = BMKG_TILETYPE[name];
        var bmkgParam = BMKG_PARAMS[name] || 'EH';
        currentBasemapName = name; window.currentBasemapName = name;
        var sel = document.getElementById('basemapSelect'); if (sel) sel.value = name;
        attachTileError(name);
        var bmkgXhr = new XMLHttpRequest();
        bmkgXhr.open('GET', 'https://satellite.bmkg.go.id/api22/modelrun', true);
        bmkgXhr.timeout = 10000;
        bmkgXhr.onerror = function () {
          bmkgLayer.addTo(map);
          // Layer Batas Provinsi (PBF) tidak lagi dinyalakan paksa di sini;
          // menggambar GeoFarm berulang kali memindahkan basemap ke Google
          // Satellite, yang sebelumnya memunculkan garis batas itu setiap kali.
          // Status layer kini sepenuhnya mengikuti centang user.
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
      } else if (name === 'sentinel1-rtc') {
        currentBasemapName = name;
        window.currentBasemapName = name;
        var sel = document.getElementById('basemapSelect');
        if (sel) sel.value = name;
        map.fire('basemapchanged', { basemap: name });
        return;
      } else if (name === 'petadasar-bpn') {
        baseTileLayers[name].addTo(map);
        if (!map.hasLayer(petadasarIndexLayer)) petadasarIndexLayer.addTo(map);
      } else {
        baseTileLayers[name].addTo(map);
      }
    }

    currentBasemapName = name;
    window.currentBasemapName = name;
    var select = document.getElementById('basemapSelect');
    if (select) select.value = name;
    map.fire('basemapchanged', { basemap: name });

    var isSatellite = satelliteBasemapLabels.hasOwnProperty(name);
    if (isSatellite) {
      // Layer Batas Provinsi (PBF) TIDAK lagi dinyalakan/dimatikan otomatis
      // saat basemap berganti. Sebelumnya setiap basemap satelit memunculkan
      // garis batas itu -- termasuk saat GeoFarm memindahkan basemap ke Google
      // Satellite -- dan menimpa centang checkbox milik user. Sekarang layer
      // hanya berubah lewat Layer Catalog atau tombol Batas Provinsi.
      showLabels();
    } else {
      hideLabels();
    }
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
    currentBasemapName = 'google-maps';
    window.currentBasemapName = 'google-maps';
    baseBasemapName = 'esri-dark-gray';
    setBaseMap(currentBasemapName);

    // Batas provinsi, angin, PM2.5, dan hujan sengaja NONAKTIF saat opening
    // supaya peta langsung bersih dan ringan. Semua tetap bisa diaktifkan manual.
    if (typeof window.toggleProvinceBoundary === 'function') {
      window.toggleProvinceBoundary(false);
    }
    var pbCb = document.getElementById('toggleProvinceBoundary');
    if (pbCb) pbCb.checked = false;

    var windToggle = document.getElementById('toggleWindAnim');
    if (windToggle) {
      windToggle.checked = false;
      if (typeof window.toggleWindAnimation === 'function') {
        window.toggleWindAnimation(false);
      }
      if (typeof windToggle.dispatchEvent === 'function') {
        windToggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (typeof window.toggleWindAnimation === 'function') {
      window.toggleWindAnimation(false);
    }

    var pm25Toggle = document.getElementById('toggleAirVisualPm25');
    if (pm25Toggle) {
      pm25Toggle.checked = false;
      pm25Toggle.dispatchEvent(new Event('change', { bubbles: true }));
    }

    if (typeof toggleHujanLayer === 'function') toggleHujanLayer(false);
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
        /* Membuka FAB mengecilkan sheet yang sedang mengembang, bukan
           menutupnya, supaya hasil kerja user tidak hilang. Tiga blok if
           yang sebelumnya menduplikasi cek yang sama sekarang satu
           panggilan. SheetDrag.minimize() bukan toggle, jadi sheet yang
           sudah jadi chip tidak akan terbalik terbuka. */
        if (window.SheetDrag) window.SheetDrag.minimizeTerbuka();
      });
      wrap.appendChild(items);
      wrap.appendChild(btn);
      if (window.innerWidth > 768) wrap.classList.add('map-fab-open');
      return wrap;
    }
  });
  var __fabCtrl = new MapFABControl().addTo(map);
  var __fabItems = null;

  window.addEventListener('resize', function () {
    var w = document.querySelector('.map-fab-wrap');
    if (w && window.innerWidth > 768) w.classList.add('map-fab-open');
  });

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
    return item;
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

  /* GPS: setView 'always' supaya marker tetap di tengah layar selama tracking
     aktif — mode bawaan 'untilPanOrZoom' berhenti memusat setelah satu
     geser/zoom (marker keluar frame saat berjalan). keepCurrentZoomLevel
     true agar tiap fix hanya memusat tanpa mengubah zoom (anti-kedip);
     zoom awal tetap 16 saat tombol diklik pertama kali. */
  L.control.locate({
    position: 'bottomright',
    flyTo: true,
    setView: 'always',
    keepCurrentZoomLevel: true,
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
    'google-satellite-kh': 'Google Satellite',
    'petadasar-bpn': 'Peta Dasar ATR/BPN',
    'landsat-agriculture': 'Landsat Agriculture',
    'modis-terra': 'MODIS Terra',
    'modis-aqua': 'MODIS Aqua',
    'viirs-noaa20': 'VIIRS NOAA-20',
    'viirs-noaa21': 'VIIRS NOAA-21',
    'viirs-snpp': 'VIIRS SNPP',
    'oci-pace': 'OCI PACE True Color',
    'bmkg-himawari': 'Himawari-9 IR',
    'bmkg-himawari-nc': 'Himawari-9 Natural Color',
    'bmkg-himawari-wv': 'Himawari-9 Water Vapor',
    'bmkg-himawari-rp': 'Himawari-9 Rainfall',
    'bmkg-himawari-sw': 'Himawari-9 Shortwave IR',
    'bmkg-himawari-sm': 'Himawari-9 SST',
    'bmkg-himawari-va': 'Himawari-9 Volcanic Ash',
    'bmkg-himawari-vs': 'Himawari-9 Visible',
    'bmkg-himawari-fd': 'Himawari-9 Full Disk',
    'bmkg-himawari-hires': 'Himawari-9 Hi-Res',
    'bmkg-gk2a': 'GK-2A IR',
    'bmkg-gk2a-wv': 'GK-2A Water Vapor',
    'bmkg-gk2a-rp': 'GK-2A Rainfall',
    'noaa-true-color': 'NOAA True Color',
    'noaa-goes-ir': 'NOAA GOES IR',
    'sentinel2': 'Sentinel-2',
    'eox-s2cloudless-2024': 'Sentinel-2 Cloudless 2024',
    'eox-blackmarble': 'NASA Black Marble',
    'eox-terrain-light': 'Terrain Light (EOX)'
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

  /* ── Draw & Measure Sidebar ──
     State buka/tutup/minimal dimiliki assets/js/sheet-drag.js supaya
     gestur geser tinggi dan aturan sembunyikan navigasi bawah memakai
     sumber kebenaran yang sama. Yang tersisa di sini hanya nama fungsi
     lamakan: index.html masih punya 11 pemanggilan onclick inline ke
     closeDrawSidebar, jadi namanya tidak boleh hilang. */
  window.SheetDrag && window.SheetDrag.register('dm', {
    el: 'drawSidebar',
    openClass: 'dm-sidebar-open',
    minClass: 'dm-sidebar-minimized',
    bodyOpen: 'dm-sidebar-open',
    bodyMin: 'dm-sidebar-minimized',
    handle: '.sheet-drag-handle',
    header: '.dm-sidebar-head',
    minButton: '.dm-sidebar-minimize',
    labelMin: 'Minimalkan',
    labelOpen: 'Perluas Alat'
  });

  function openDrawSidebar() { if (window.SheetDrag) window.SheetDrag.buka('dm'); }
  function closeDrawSidebar() { if (window.SheetDrag) window.SheetDrag.close('dm'); }
  // toggleMinimize, bukan minimize: fungsi inilah yang terikat ke tombol
  // minimize. Kalau minimize() (idempoten) yang dipakai, sekali sheet jadi
  // chip tombolnya mati dan tidak ada jalan expand dari sana.
  function minimizeDrawSidebar() { if (window.SheetDrag) window.SheetDrag.toggleMinimize('dm'); }
  function restoreDrawSidebar() { if (window.SheetDrag) window.SheetDrag.restore('dm'); }
  window.openDrawSidebar = openDrawSidebar;
  window.closeDrawSidebar = closeDrawSidebar;
  window.minimizeDrawSidebar = minimizeDrawSidebar;
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

  /* ── Legend Sidebar ──
     Estado sheet milik sheet-drag.js; di sini hanya perpindahan konten
     legenda antara sidebar dan legenda terpadu. */
  window.SheetDrag && window.SheetDrag.register('lg', {
    el: 'legendSidebar',
    openClass: 'lg-sidebar-open',
    minClass: 'lg-sidebar-minimized',
    bodyOpen: 'lg-sidebar-open',
    bodyMin: 'lg-sidebar-minimized',
    handle: '.sheet-drag-handle',
    header: '.lg-sidebar-head',
    minButton: '.lg-sidebar-minimize',
    labelMin: 'Minimalkan',
    labelOpen: 'Perluas Legenda',
    onOpen: function () {
      var body = document.getElementById('legendSidebarBody');
      var legendBody = document.querySelector('.legend-body');
      if (body && legendBody && legendBody.children.length > 0) {
        while (legendBody.firstChild) body.appendChild(legendBody.firstChild);
      }
    },
    onClose: function () {
      var body = document.getElementById('legendSidebarBody');
      if (!body) return;
      var legendBody = document.querySelector('.legend-body');
      if (legendBody) while (body.firstChild) legendBody.appendChild(body.firstChild);
    }
  });

  function openLegendSidebar() { if (window.SheetDrag) window.SheetDrag.buka('lg'); }
  function closeLegendSidebar() { if (window.SheetDrag) window.SheetDrag.close('lg'); }
  function minimizeLegendSidebar() { if (window.SheetDrag) window.SheetDrag.toggleMinimize('lg'); }
  function restoreLegendSidebar() { if (window.SheetDrag) window.SheetDrag.restore('lg'); }
  window.openLegendSidebar = openLegendSidebar;
  window.closeLegendSidebar = closeLegendSidebar;
  window.minimizeLegendSidebar = minimizeLegendSidebar;
  window.restoreLegendSidebar = restoreLegendSidebar;

  // Legend sidebar title click to restore when minimized
  (function() {
    var sb = document.getElementById('legendSidebar');
    if (!sb) return;
    var title = sb.querySelector('.lg-sidebar-title');
    if (title) {
      title.addEventListener('click', function() {
        if (sb.classList.contains('lg-sidebar-minimized')) restoreLegendSidebar();
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

  var _labelsLayer = null;
  var _labelsPaneName = 'labelsPane';

  function showLabels() {
    if (_labelsLayer && map.hasLayer(_labelsLayer)) return;
    if (!map.getPane(_labelsPaneName)) {
        map.createPane(_labelsPaneName);
        map.getPane(_labelsPaneName).style.zIndex = '2000';
    }
    _labelsLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 23, attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors', interactive: false, pane: _labelsPaneName }
    );
    _labelsLayer.addTo(map);
  }

  function hideLabels() {
    if (_labelsLayer && map.hasLayer(_labelsLayer)) map.removeLayer(_labelsLayer);
    _labelsLayer = null;
  }

  var _activeAirVisualLayerKey = null;

  function refreshAirVisualPresentation() {
    var activeKeys = Object.keys(airVisualLayers).filter(function (key) { return map.hasLayer(airVisualLayers[key]); });
    if (!activeKeys.length) {
      _activeAirVisualLayerKey = null;
      hideAirVisualLegend();
      return;
    }
    if (activeKeys.indexOf(_activeAirVisualLayerKey) === -1) _activeAirVisualLayerKey = activeKeys[0];
    showAirVisualLegend(_activeAirVisualLayerKey);
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

  function resetAllLayersImpl() {
        _layerCatalogState = {};
        if (typeof window.clearMitraDaratLayers === 'function') window.clearMitraDaratLayers();
        if (typeof window.clearArcGISRestLayers === 'function') window.clearArcGISRestLayers();
        // 1. Matikan layer jalan & angin (checkbox-driven)
        const toggles = [
          'toggleTransjakarta',
          'toggleTransjogja',
          'toggleTollRoad', 'toggleNonTollRoad', 'toggleNationalRoad',
          'toggleWindAnim', 'toggleWindRgb', 'toggleRhRgb', 'toggleTp24Rgb',
          'togglePm25Rgb', 'toggleHthRgb', 'toggleBmkgNormalHujan',
          'toggleMaritimeAngin', 'toggleMaritimeGelombang', 'toggleMaritimeSwell', 'toggleMaritimeWindSea',
           'toggleGhrsstSstAnomali',
          'toggleSawahDilindungi', 'toggleSawahNasional50k',
          'toggleBppLayer', 'toggleSawitLayer', 'toggleErosiLayer',
          'toggleHotspotLayer', 'toggleKawasanHutanLayer', 'toggleGambutLayer', 'toggleKhLayer', 'togglePippibLayer',
          'kwshutan-planologi', 'brmp-provitas', 'brmp-ip', 'brmp-sc',
          'toggleCuacaPelabuhanLayer', 'toggleCuacaPerairanLayer',
          'toggleSawitNasionalLayer', 'toggleSawitPerkebunanLayer', 'toggleRehabDasLayer', 'togglePerkebunanPl24Layer',
          'toggleRktnSumateraLayer', 'toggleRktnSulawesiLayer', 'toggleRktnPapuaLayer', 'toggleRktnMalukuLayer', 'toggleRktnKalimantanLayer', 'toggleRktnJawaLayer', 'toggleRktnBaliNtLayer',
          'toggleDemnasOverlay', 'toggleSebaranPasar', 'toggleSppgLayer', 'toggleSppgSebaranLayer', 'toggleSppgDistrictLayer',
          'toggleConcessionsLayer', 'toggleProtectedLayer', 'toggleMangroveLayer', 'togglePeatlandLayer',
          'toggleBumiPersilLayer',
          'toggleGistaruPersilLayer',
          'toggleFsvaLayer',
          'toggleLsdTmsLayer', 'toggleLbsTmsLayer',
          'toggleDiTmsLayer', 'toggleSaluranIrTmsLayer', 'toggleRtrwTmsLayer',
          'toggleSekolahLayer',
          'st2023:batas_desa', 'st2023:batas_kecamatan', 'st2023:batas_kabupaten', 'st2023:batas_provinsi',
          'st2023:dasymetric_utp', 'st2023:dasymetric_utp_tp', 'st2023:dasymetric_utp_horti', 'st2023:dasymetric_utp_holti',
          'st2023:dasymetric_utp_hutan', 'st2023:dasymetric_utp_ikan', 'st2023:dasymetric_utp_kebun',
          'st2023:dasymetric_utp_milenial', 'st2023:dasymetric_utp_ternak', 'st2023:dasymetric_utp_urban',
          'st2023:geotagging', 'st2023:geotagging_tanaman_pangan', 'st2023:geotagging_hortikultura',
          'st2023:geotagging_kebun', 'st2023:geotagging_hutan', 'st2023:geotagging_ikan', 'st2023:geotagging_ternak',
          'st2023:infrastruktur_pertanian', 'st2023:gurem_lahan_vw',
          'st2023:utp_ihk_01', 'st2023:utp_ihk_02', 'st2023:utp_ihk_03', 'st2023:utp_ihk_04',
          'st2023:utp_ihk_05', 'st2023:utp_ihk_06', 'st2023:utp_ihk_07', 'st2023:utp_ihk_08',
          'st2023:utp_ihk_09', 'st2023:utp_ihk_10', 'st2023:utp_ihk_11', 'st2023:utp_ihk_12',
          'st2023:utp_ihk_13', 'st2023:utp_ihk_14', 'st2023:utp_ihk_15', 'st2023:utp_ihk_16', 'st2023:utp_ihk_17',
          'bps-lbs-2024',
          'arcgis-sawah-2023', 'arcgis-sawah-2019',
            'arcgis-kawasan-padi', 'arcgis-kawasan-jagung', 'arcgis-kawasan-kedelai',
            'arcgis-vt-lbs-2024', 'arcgis-vt-lbs-2019',
            'opt-padi-penggerek', 'opt-padi-wbc', 'opt-padi-tikus', 'opt-padi-blas', 'opt-padi-kresek', 'opt-padi-tungro', 'opt-padi-kerdil',
            'opt-jagung-lalat', 'opt-jagung-penggerek', 'opt-jagung-tikus', 'opt-jagung-blay', 'opt-jagung-penggerek-tongkol', 'opt-jagung-ulat-litura', 'opt-jagung-ulat-frugiperda',
            'opt-kedelai-tikus', 'opt-kedelai-penggerek-polong', 'opt-kedelai-penggulung', 'opt-kedelai-ulat-litura', 'opt-kedelai-ulat-jengkal'
         ];
        toggles.forEach(id => {
          const el = document.getElementById(id);
          if (el && el.checked) {
            el.checked = false;
            el.dispatchEvent(new Event('change'));
          }
        });

        if (typeof window.toggleTransjakarta === 'function') window.toggleTransjakarta(false);
        if (typeof window.toggleTransjogja === 'function') window.toggleTransjogja(false);
        if (typeof window.toggleKwshutanPlanologiLayer === 'function') window.toggleKwshutanPlanologiLayer(false);
        if (typeof window.toggleProvitasKementanLayer === 'function') window.toggleProvitasKementanLayer(false);
        if (typeof window.toggleIpKementanLayer === 'function') window.toggleIpKementanLayer(false);
        if (typeof window.toggleSiscropScLayer === 'function') window.toggleSiscropScLayer(false);
        if (typeof toggleTollRoadLayer === 'function') toggleTollRoadLayer(false);
        if (typeof toggleNonTollRoadLayer === 'function') toggleNonTollRoadLayer(false);
         if (typeof toggleNationalRoadLayer === 'function') toggleNationalRoadLayer(false);

        // 1b. Matikan semua OPT layer
        if (typeof window.toggleOPTPest === 'function') {
          ['opt-padi-penggerek','opt-padi-wbc','opt-padi-tikus','opt-padi-blas','opt-padi-kresek','opt-padi-tungro','opt-padi-kerdil',
           'opt-jagung-lalat','opt-jagung-penggerek','opt-jagung-tikus','opt-jagung-blay','opt-jagung-penggerek-tongkol','opt-jagung-ulat-litura','opt-jagung-ulat-frugiperda',
           'opt-kedelai-tikus','opt-kedelai-penggerek-polong','opt-kedelai-penggulung','opt-kedelai-ulat-litura','opt-kedelai-ulat-jengkal'
          ].forEach(function (k) { window.toggleOPTPest(k, false); });
        }
        if (typeof window.toggleKategoriWilayahOpt === 'function' && window.KATEGORI_OPT_ATTR_DATA) {
          Object.keys(window.KATEGORI_OPT_ATTR_DATA).forEach(function (k) { window.toggleKategoriWilayahOpt(k, false); });
        }
        if (typeof window.toggleOPTPerkebunan === 'function' && window.OPTP_LAYER_IDS) {
          window.OPTP_LAYER_IDS.forEach(function (k) { window.toggleOPTPerkebunan(k, false); });
        }
        if (typeof window.toggleOPTHorti === 'function' && window.OPTH_LAYER_IDS) {
          window.OPTH_LAYER_IDS.forEach(function (k) { window.toggleOPTHorti(k, false); });
        }

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

        // 4d. Matikan GHRSST SST Anomaly & time slider
        toggleGhrsstSstAnomali(false);

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
        // 5c. Bersihkan layer SLS dan LBS/LSD. Keduanya terikat pada satu desa,
        // jadi harus ikut hilang bersama batas desanya -- kalau tidak, polygon
        // desa sebelumnya masih tertinggal di peta.
        if (typeof GeoTaniSls !== 'undefined' && typeof GeoTaniSls.clear === 'function') GeoTaniSls.clear();
        if (typeof GeoTaniLbsLsd !== 'undefined' && typeof GeoTaniLbsLsd.clear === 'function') GeoTaniLbsLsd.clear();
        // Kartu LSD 12 Provinsi (ATR/BPN) juga terikat pada satu desa, jadi
        // harus ikut hilang. Kalau tidak, poligon dari desa sebelumnya
        // tertinggal di peta setelah Reset Polygon.
        if (typeof GeoTaniLsd12 !== 'undefined' && typeof GeoTaniLsd12.clear === 'function') GeoTaniLsd12.clear();
        // Tutupan Lahan juga terikat pada satu desa, jadi ikut dilepas.
        if (typeof GeoTaniTutupan !== 'undefined' && typeof GeoTaniTutupan.clear === 'function') GeoTaniTutupan.clear();
        // Status terbuka atau tertutupnya kartu TIDAK diubah di sini untuk
        // ketiga kartu GeoTani ini. Itu pilihan pengguna: menutupnya di
        // reset atau saat pindah tab akan menyembunyikan hasil yang baru
        // saja selesai dihitung, dan memaksa pengguna menekan judulnya lagi
        // hanya untuk membacanya.

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
        if (typeof viirsSnppTimeSliderCleanup === 'function') viirsSnppTimeSliderCleanup();
        if (typeof ociPaceTimeSliderCleanup === 'function') ociPaceTimeSliderCleanup();
        if (typeof chlorophyllTimeSliderCleanup === 'function') chlorophyllTimeSliderCleanup();
        if (typeof parTimeSliderCleanup === 'function') parTimeSliderCleanup();
        if (typeof aerosolSo2SliderCleanup === 'function') aerosolSo2SliderCleanup();
        if (typeof chlorophyllOverlayCleanup === 'function') chlorophyllOverlayCleanup();
        if (typeof parOverlayCleanup === 'function') parOverlayCleanup();
        if (typeof sentinel2TimeSliderCleanup === 'function') sentinel2TimeSliderCleanup();
        if (typeof bmkgHimawariSliderCleanup === 'function') bmkgHimawariSliderCleanup();
        if (typeof cleanupHujanLayer === 'function') cleanupHujanLayer();
        if (typeof modisViirsOverlayCleanup === 'function') modisViirsOverlayCleanup();
        if (typeof cuacaMaritimCleanup === 'function') cuacaMaritimCleanup();
        if (typeof pmtilesCleanup === 'function') pmtilesCleanup();
        if (typeof hideAirVisualLegend === 'function') hideAirVisualLegend();
        Object.keys(airVisualLayers).forEach(function (key) {
          if (map.hasLayer(airVisualLayers[key])) map.removeLayer(airVisualLayers[key]);
        });
        document.querySelectorAll('[data-airvisual-layer]').forEach(function (input) { input.checked = false; });
        _activeAirVisualLayerKey = null;
        Object.keys(omiLayers).forEach(function (key) {
          if (map.hasLayer(omiLayers[key])) map.removeLayer(omiLayers[key]);
        });
        _activeOmiLegendKey = null;
        if (typeof hideOmiLegend === 'function') hideOmiLegend();

        // Bersihkan layer sensor & katalog gempa
        document.querySelectorAll('#toggleKatalogGempa, #toggleHistoricalQuakes, #toggleSensorSeismic, #toggleSensorGlobal, #toggleHistoryGempa, #toggleSignificantMarkers, #toggleFeltMarkers, #toggleLatestEarthquake, #toggleViirsHotspots, #toggleModisHotspots48, #toggleModisHotspots7d, #toggleOpenaqPm25, #toggleOpenaqPm10, #toggleOpenaqPm1, #toggleSpi1m, #toggleSpi3m, #toggleSpi6m, #toggleSpi9m, #toggleSpi12m, #toggleSpei1m, #toggleSpei3m, #toggleSpei6m, #toggleSpei9m, #toggleSpei12m').forEach(function (cb) {
          if (cb) cb.checked = false;
        });
        if (typeof isKatalogGempaActive === 'function' && isKatalogGempaActive()) {
          document.getElementById('toggleKatalogGempa')?.dispatchEvent(new Event('change'));
        }
        if (typeof isHistoricalQuakesActive === 'function' && isHistoricalQuakesActive()) {
          document.getElementById('toggleHistoricalQuakes')?.dispatchEvent(new Event('change'));
        }
        if (typeof isViirsHotspotsActive === 'function' && isViirsHotspotsActive()) {
          document.getElementById('toggleViirsHotspots')?.dispatchEvent(new Event('change'));
        }
        if (typeof isModisHotspots48Active === 'function' && isModisHotspots48Active()) {
          document.getElementById('toggleModisHotspots48')?.dispatchEvent(new Event('change'));
        }
        if (typeof isModisHotspots7dActive === 'function' && isModisHotspots7dActive()) {
          document.getElementById('toggleModisHotspots7d')?.dispatchEvent(new Event('change'));
        }
        if (typeof isOpenaqPm25Active === 'function' && isOpenaqPm25Active()) {
          document.getElementById('toggleOpenaqPm25')?.dispatchEvent(new Event('change'));
        }
        if (typeof isOpenaqPm10Active === 'function' && isOpenaqPm10Active()) {
          document.getElementById('toggleOpenaqPm10')?.dispatchEvent(new Event('change'));
        }
        if (typeof isOpenaqPm1Active === 'function' && isOpenaqPm1Active()) {
          document.getElementById('toggleOpenaqPm1')?.dispatchEvent(new Event('change'));
        }
        if (typeof isSpi1mActive === 'function' && isSpi1mActive()) {
          document.getElementById('toggleSpi1m')?.dispatchEvent(new Event('change'));
        }
        if (typeof isSpi3mActive === 'function' && isSpi3mActive()) {
          document.getElementById('toggleSpi3m')?.dispatchEvent(new Event('change'));
        }
        if (typeof isSpi6mActive === 'function' && isSpi6mActive()) {
          document.getElementById('toggleSpi6m')?.dispatchEvent(new Event('change'));
        }
        if (typeof isSpi9mActive === 'function' && isSpi9mActive()) {
          document.getElementById('toggleSpi9m')?.dispatchEvent(new Event('change'));
        }
        if (typeof isSpi12mActive === 'function' && isSpi12mActive()) {
          document.getElementById('toggleSpi12m')?.dispatchEvent(new Event('change'));
        }
        if (typeof isSpei1mActive === 'function' && isSpei1mActive()) {
          document.getElementById('toggleSpei1m')?.dispatchEvent(new Event('change'));
        }
        if (typeof isSpei3mActive === 'function' && isSpei3mActive()) {
          document.getElementById('toggleSpei3m')?.dispatchEvent(new Event('change'));
        }
        if (typeof isSpei6mActive === 'function' && isSpei6mActive()) {
          document.getElementById('toggleSpei6m')?.dispatchEvent(new Event('change'));
        }
        if (typeof isSpei9mActive === 'function' && isSpei9mActive()) {
          document.getElementById('toggleSpei9m')?.dispatchEvent(new Event('change'));
        }
        if (typeof isSpei12mActive === 'function' && isSpei12mActive()) {
          document.getElementById('toggleSpei12m')?.dispatchEvent(new Event('change'));
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

        // Gempa NTT layers removed

        // Bersihkan layer geologi BNPB
        var gnCb = document.getElementById('toggleGeologiBNPB');
        if (gnCb && gnCb.checked) { gnCb.checked = false; gnCb.dispatchEvent(new Event('change')); }

        // Bersihkan province boundary
        if (typeof window.toggleProvinceBoundary === 'function') window.toggleProvinceBoundary(false);
        var pbCb = document.getElementById('toggleProvinceBoundary');
        if (pbCb) pbCb.checked = false;

        // Bersihkan foto udara / imagery BIG
        var fuClearIds = (typeof window.getFuLayerIds === 'function')
          ? window.getFuLayerIds()
          : ['toggleFuPadang', 'toggleFuKendari', 'toggleFuBitung', 'toggleFuMakassar', 'toggleFuPlanetScope', 'toggleFuBanten'];
        fuClearIds.forEach(function (fuId) {
          if (typeof window.toggleFuLayer === 'function') window.toggleFuLayer(fuId, false);
          var fuEl = document.getElementById(fuId);
          if (fuEl) fuEl.checked = false;
        });

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

        // 10b-1. Reset layer persil ATR/BPN (BHUMI + GISTARU)
        if (typeof toggleBumiPersilLayer === 'function') toggleBumiPersilLayer(false);
        if (typeof toggleGistaruPersilLayer === 'function') toggleGistaruPersilLayer(false);

        // Layer dari kategori dinamis (IGTPR) punya toggle sendiri.
        if (typeof window.resetDynamicCatalogLayers === 'function') window.resetDynamicCatalogLayers();

        setBaseMap('google-maps');
        currentBasemapName = 'google-maps';
        window.currentBasemapName = 'google-maps';

        // 10b. Bersihkan drawing & measure
        if (typeof clearDrawings === 'function') clearDrawings();

        // 10c. Bersihkan unified legend & slider
        if (typeof clearUnifiedLegend === 'function') clearUnifiedLegend();
        if (typeof clearUnifiedSlider === 'function') clearUnifiedSlider();

        // 10e. Uncheck ALL layer catalog checkboxes (lc_ prefixed) and trigger their handlers
        var lcDd = document.getElementById('layerCatalogDropdown');
        if (lcDd) {
          lcDd.querySelectorAll('.lc-item input[type="checkbox"]').forEach(function(cb) {
            if (cb.checked) {
              cb.checked = false;
              cb.dispatchEvent(new Event('change'));
            }
          });
          delete lcDd.dataset.built;
        }

        // 10e2. Kembalikan pilihan identifikasi klik BHUMI ke default
        // (layer inti: zona nilai, nilai bidang, toponim) + matikan heatmap.
        try { localStorage.removeItem(BHUMI_IDENTIFY_STORAGE_KEY); } catch (e) {}
        bhumiIdentifyHydrate();
        if (typeof window.toggleBhumiHeatmap === 'function') window.toggleBhumiHeatmap(false);

        // 10f. Sync layer catalog checkboxes
        if (typeof syncLayerCatalogState === 'function') syncLayerCatalogState();

        // 11. Reset detail panel
        const detailPanel = document.getElementById('detail-panel');
        if (detailPanel) detailPanel.classList.add('hidden');
        const detailBtn = window._detailPanelBtn;
        if (detailBtn) detailBtn.classList.remove('active');
  }
  window.__geoportalPrintCtrl = new PrintMapControl();

  function resetAllLayers() {
    if (window.__resetAllLayersRunning) return;
    window.__resetAllLayersRunning = true;
    try { resetAllLayersImpl(); }
    finally { window.__resetAllLayersRunning = false; }
  }
  document.getElementById('resetLayersBtn').addEventListener('click', resetAllLayers);
  window.resetAllLayers = resetAllLayers;
  window.getLayerCatalogData = function () { return LAYER_CATALOG_DATA; };

  /* ── Pindahkan tombol ke dalam FAB ── */
  setTimeout(function () {
    createGeotoolsFAB();
    /* GeoData ditempelkan tepat setelah GeoTools: keduanya membuka sheet
     * yang sama, dan GeoData adalah tab yang paling sering dipakai, jadi
     * dua tombol ini sebaiknya bersebelahan di barisan FAB. */
    createGeoDataFAB();
    moveToFAB('.draw-fab-wrap', 'Alat');
    createAttrTableFAB();
    createLegendFAB();

    /* ── Zoom Control di bawah tengah ── */
    var zoomWrap = document.querySelector('.zoom-control-wrap');
    if (zoomWrap) {
      zoomWrap.style.position = 'fixed';
      zoomWrap.style.bottom = '30px';
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
const BHUMI_PERSIL_WMS_URL = 'https://bhumi.atrbpn.go.id/expapi/wms?authkey=e61b8fc8-20e2-442b-8e27-da62f6e6245v';
const GISTARU_WMS_URL = 'https://atlas.atrbpn.go.id/geoserver/gistaru/ows';
/* Lahan sawah dilindungi - GISLINER. Layer tile biner (hijau = sawah
 * dilindungi, transparan = bukan sawah), format XYZ, CORS terbuka.
 * Cakupannya belum nasional: diuji hanya Jawa yang utuh, sedangkan
 * Kalimantan, Maluku, Papua dan NTT kosong di atas zoom 7. Karena itu
 * layer dibatasi ke Jawa supaya wilayah kosong tidak terbaca sebagai error. */
const SAWAH_TILE_URL = 'https://gisliner.atrbpn.go.id/layers/tms/public/269_lsd_/{z}/{x}/{y}/?tileSize=256';
/* Leaflet memakai urutan [[latSelatan, lonBarat], [latUtara, lonTimur]]. */
const SAWAH_BOUNDS = [[-9.2, 105.0], [-5.2, 115.8]];
const SAWAH_COLOR = '#87cf15';

  /* ── Persil tanah ATR/BPN ──
   * Dua sumber, klasifikasi warna sama persis (delapan jenis hak):
   *   - BHUMI  : bhumi.atrbpn.go.id/expapi, layer petabpn:PersilBerdasarkanJenisHakStroke
   *   - GISTARU : atlas.atrbpn.go.id/geoserver/gistaru, layer gistaru:persil
   * Keduanya hanya menerima GetMap, jadi jangan pakai library WMS yang
   * memanggil GetCapabilities. GISTARU tidak mengirim header CORS, tetapi
   * tile Leaflet dimuat lewat <img> sehingga tetap bisa ditampilkan tanpa
   * proxy -- asal option crossOrigin tidak diaktifkan. */
  var bumiPersilLayer = null;
  var gistaruPersilLayer = null;
  var bhumiPersilNasionalLayer = null;
  var sawahLayer = null;
  var legendSawahShown = false;
  var legendPersilShown = false;

  /* Warna asli hasil render BHUMI, diambil dari sampling tile. GetLegendGraphic
   * GISTARU memakai warna yang sama pada opacity ~0,70 di atas putih, jadi
   * kedua sumber memakai palet yang sama persis. */
  var PERSIL_LEGEND = [
    { color: '#FFAA00', label: 'Hak Milik' },
    { color: '#BBB52B', label: 'Hak Guna Usaha' },
    { color: '#A5BFDD', label: 'Hak Guna Bangunan' },
    { color: '#389C22', label: 'Hak Pakai' },
    { color: '#B8358C', label: 'Hak Pengelolaan' },
    { color: '#244AA3', label: 'Hak Wakaf' },
    { color: '#42E5F4', label: 'Tanah Adat' },
    { color: '#686868', label: 'Belum Terdaftar' }
  ];

  function anyPersilLayerActive() {
    return !!((bumiPersilLayer && map.hasLayer(bumiPersilLayer)) ||
              (gistaruPersilLayer && map.hasLayer(gistaruPersilLayer)) ||
              (bhumiPersilNasionalLayer && map.hasLayer(bhumiPersilNasionalLayer)));
  }

  function showPersilLegend() {
    if (legendPersilShown) return;
    if (typeof addUnifiedLegend !== 'function') return;

    var div = L.DomUtil.create('div', 'atrbpn-legend');
    L.DomEvent.disableClickPropagation(div);

    var items = PERSIL_LEGEND.map(function (item) {
      return '<div class="atrbpn-legend-item">' +
        '<span class="atrbpn-legend-dot" style="background:' + item.color + ';"></span>' +
        '<span>' + item.label + '</span>' +
      '</div>';
    }).join('');

    div.innerHTML =
      '<div class="atrbpn-legend-title">Legenda Persil — ATR/BPN</div>' +
      '<div class="atrbpn-legend-items">' + items + '</div>' +
      '<div class="atrbpn-legend-source">Sumber: ATR/BPN — BHUMI &amp; GISTARU</div>';

    addUnifiedLegend('atrbpn-persil', typeof createLegendWithToggle === 'function' ? createLegendWithToggle(div) : div);
    legendPersilShown = true;
  }

  function hidePersilLegend() {
    if (typeof removeUnifiedLegend !== 'function') return;
    removeUnifiedLegend('atrbpn-persil');
    legendPersilShown = false;
  }

  /* Legenda dipakai bersama, jadi baru disembunyikan setelah TIDAK ada
   * layer persil yang masih menyala. */
  function refreshPersilLegend() {
    if (anyPersilLayerActive()) showPersilLegend();
    else hidePersilLegend();
  }

  function zoomToPersilDetail() {
    /* Persil hanya terbaca pada zoom dekat, jadi perbesar ke level detail di
     * titik tengah peta yang sedang dilihat. Sengaja tidak memanggil
     * setView ke koordinat tetap supaya posisi pengguna tidak hilang. */
    var detailZoom = Math.max(map.getZoom(), 18);
    if (detailZoom > map.getZoom()) {
      map.flyTo(map.getCenter(), detailZoom, { duration: 0.8 });
    }
  }

  function toggleBumiPersilLayer(show) {
    if (show) {
      if (bumiPersilLayer && map.hasLayer(bumiPersilLayer)) return;
      bumiPersilLayer = L.tileLayer.wms(BHUMI_PERSIL_WMS_URL, {
        layers: 'petabpn:PersilBerdasarkanJenisHakStroke',
        format: 'image/png',
        transparent: true,
        version: '1.1.1',
        crs: L.CRS.EPSG3857,
        attribution: 'ATR/BPN - Bhumi Persil'
      });
      bumiPersilLayer.addTo(map);
      zoomToPersilDetail();
      refreshPersilLegend();
    } else {
      if (bumiPersilLayer && map.hasLayer(bumiPersilLayer)) map.removeLayer(bumiPersilLayer);
      bumiPersilLayer = null;
      refreshPersilLegend();
    }
  }
  window.toggleBumiPersilLayer = toggleBumiPersilLayer;
  window.isBumiPersilLayerActive = function () {
    return !!(bumiPersilLayer && map.hasLayer(bumiPersilLayer));
  };

  function toggleGistaruPersilLayer(show) {
    if (show) {
      if (gistaruPersilLayer && map.hasLayer(gistaruPersilLayer)) return;
      gistaruPersilLayer = L.tileLayer.wms(GISTARU_WMS_URL, {
        layers: 'gistaru:persil',
        format: 'image/png',
        transparent: true,
        version: '1.1.1',
        crs: L.CRS.EPSG3857,
        attribution: 'ATR/BPN - GISTARU'
      });
      gistaruPersilLayer.addTo(map);
      zoomToPersilDetail();
      refreshPersilLegend();
    } else {
      if (gistaruPersilLayer && map.hasLayer(gistaruPersilLayer)) map.removeLayer(gistaruPersilLayer);
      gistaruPersilLayer = null;
      refreshPersilLegend();
    }
  }
  window.toggleGistaruPersilLayer = toggleGistaruPersilLayer;
  window.isGistaruPersilLayerActive = function () {
    return !!(gistaruPersilLayer && map.hasLayer(gistaruPersilLayer));
  };

  /* ── Persil nasional (BHUMI /mprx/service) ──
   * WMS 1.3 publik dengan layer bhumi_persil; melayani seluruh Indonesia
   * (diuji dari Medan, Makassar sampai Jayapura pada zoom 10-19). Dua
   * syarat yang tidak bisa dilanggar:
   *   - WIDTH/HEIGHT harus tepat 512; ukuran lain ditolak GeoServer;
   *   - nginx hanya menerima Referer dari domain bhumi, jadi tile dimuat
   *     lewat kta-cors-proxy yang menyuntikkan Referer
   *     https://bhumi.atrbpn.go.id/peta (browser dilarang memalsukan
   *     Referer, tidak ada cara lain dari sisi klien).
   * URL tile disusun manual karena Leaflet tidak mengenal VERSION=1.3.0
   * (pergantian SRS -> CRS). BBOX memakai lebar span x (tileSize/256):
   * dengan tileSize 512 satu tile Leaflet mencakup dua kali lebar grid
   * 256 pada zoom yang sama. */
  var BHUMI_PERSIL_NASIONAL_PROXY = 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=';

  function bhumiPersilNasionalTileUrl(coords) {
    var size = this.getTileSize().x;
    var half = 20037508.342789244;
    var span = ((half * 2) / Math.pow(2, coords.z)) * (size / 256);
    var minX = -half + coords.x * span;
    var maxY = half - coords.y * span;
    var bbox = minX + ',' + (maxY - span) + ',' + (minX + span) + ',' + maxY;
    var upstream = 'https://bhumi.atrbpn.go.id/mprx/service' +
      '?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap' +
      '&FORMAT=image%2Fpng&TRANSPARENT=true' +
      '&LAYERS=bhumi_persil&STYLES=' +
      '&SRS=EPSG:3857&CRS=EPSG:3857&TILED=true' +
      '&WIDTH=' + size + '&HEIGHT=' + size +
      '&BBOX=' + bbox;
    return BHUMI_PERSIL_NASIONAL_PROXY + encodeURIComponent(upstream);
  }

  function toggleBhumiPersilNasionalLayer(show) {
    if (show) {
      if (bhumiPersilNasionalLayer && map.hasLayer(bhumiPersilNasionalLayer)) return;
      bhumiPersilNasionalLayer = L.tileLayer('', {
        tileSize: 512,
        minZoom: 10,
        maxZoom: 21,
        attribution: 'ATR/BPN - BHUMI'
      });
      bhumiPersilNasionalLayer.getTileUrl = bhumiPersilNasionalTileUrl;
      /* Layanan BHUMI menolak permintaan tanpa sesi (403), dan penolakan itu
         tidak terlihat oleh Leaflet -- layernya hanya diam kosong, yang
         terbaca sebagai "layer rusak" tanpa keterangan. Tile yang gagal
         dihitung dulu; hanya setelah beberapa kali berturut-turut barulah
         pengguna diberi tahu, supaya satu tile yang kebetulan gagal tidak
         memunculkan peringatan palsu. */
      var tileGagal = 0;
      var tileBerhasil = false;
      bhumiPersilNasionalLayer.on('tileerror', function () {
        if (tileBerhasil) return;
        tileGagal++;
        if (tileGagal === 3 && typeof showMapToast === 'function') {
          showMapToast('Tile Persil Nasional gagal dimuat — layanan BHUMI menolak permintaan. ' +
            'Layer mungkin tampil kosong.', 'error');
        }
      });
      bhumiPersilNasionalLayer.on('tileload', function () {
        tileBerhasil = true;
        tileGagal = 0;
      });
      bhumiPersilNasionalLayer.addTo(map);
      showMapToast('Klik pada peta untuk melihat zona wilayah.', 'info');
      zoomToPersilDetail();
      refreshPersilLegend();
    } else {
      if (bhumiPersilNasionalLayer && map.hasLayer(bhumiPersilNasionalLayer)) map.removeLayer(bhumiPersilNasionalLayer);
      bhumiPersilNasionalLayer = null;
      bhumiPersilClearHighlight();
      refreshPersilLegend();
    }
  }
  window.toggleBhumiPersilNasionalLayer = toggleBhumiPersilNasionalLayer;
  window.isBhumiPersilNasionalLayerActive = function () {
    return !!(bhumiPersilNasionalLayer && map.hasLayer(bhumiPersilNasionalLayer));
  };

  /* ── Identifikasi persil saat klik (BHUMI /expapi/getPersil) ──
    * Saat layer Persil Nasional menyala, setiap klik peta mengirim query
    * titik (bbox viewport + posisi piksel klik, format identik dengan app
    * BHUMI) ke getPersil lewat kta-cors-proxy -- worker menyuntikkan
    * Referer/Origin/UA browser BHUMI dan meneruskan Authorization +
    * x-timestamp/x-signature + x-client-pubkey. Sejak rotasi kedua
    * 2026-10-22 getPersil menuntut: tanda tangan request (SHA256
    * timestamp+secret, masih sama), kunci pub ECDH P-256 yang baru
    * setiap permintaan (x-client-pubkey, dari bundle resmi BHUMI
    * chunk 8815 fungsi CJ()), dan Authorization JWT. Login memakai
    * akun publik yang hardcoded di app BHUMI; JWT di-cache ~50 menit.
    * Respons berupa AES-OpenSSL dengan passphrase hasil sesi ECDH
    * (SHA256 atas shared secret) didekripsi langsung di browser; bila
    * server tak memakai ECDH, fallback ke passphrase statis lama. */
  var bhumiPersilToken = { value: null, expiresAt: 0, pending: null };
  var bhumiPersilHighlight = null;
  var bhumiPersilMarker = null;
  var bhumiPersilSheet = null;
  var bhumiPersilCenterTimer = 0;
  var bhumiPersilClickSeq = 0;

  function bhumiPersilClearHighlight() {
    bhumiPersilClickSeq++;
    bhumiPersilClearMapSelection();
    bhumiPersilCloseSheet();
  }

  function bhumiPersilClearMapSelection() {
    if (bhumiPersilHighlight && map.hasLayer(bhumiPersilHighlight)) {
      map.removeLayer(bhumiPersilHighlight);
    }
    bhumiPersilHighlight = null;
    if (bhumiPersilMarker) map.removeLayer(bhumiPersilMarker);
    bhumiPersilMarker = null;
  }

  /* Rahasia tanda tangan /expapi — sama dengan yang dipakai app resmi
     BHUMI (chunk 8815, fungsi s()): SHA256(timestamp + ":" + rahasia).
     Didekode dari blob XOR di bundle resmi pada 2026-10-22. */
  var BHUMI_PERSIL_SIGN_SECRET = 'Bhum1@TrBpn!2026#AntiScrape';

  function bhumiPersilSignedHeaders() {
    var ts = Date.now().toString();
    return crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(ts + ':' + BHUMI_PERSIL_SIGN_SECRET))
      .then(function (buf) {
        var bytes = new Uint8Array(buf), hex = '';
        for (var i = 0; i < bytes.length; i++) hex += ('0' + bytes[i].toString(16)).slice(-2);
        return { 'x-timestamp': ts, 'x-signature': hex };
      });
  }

  function bhumiPersilProxyPost(pathname, payload, token, useEcdh) {
    var url = BHUMI_PERSIL_NASIONAL_PROXY +
      encodeURIComponent('https://bhumi.atrbpn.go.id' + pathname);
    function traceFailure(response) {
      if (response.ok) return Promise.resolve(response);
      return response.clone().text().then(function (body) {
        var safeBody = bhumiPersilSafeDiagnostic(body);
        console.error('[BHUMI] POST ' + pathname + ' gagal', {
          status: response.status,
          proxyStatus: response.headers.get('X-Proxy-Status'),
          contentType: response.headers.get('Content-Type'),
          body: safeBody || '(respons kosong)'
        });
        return response;
      }).catch(function (err) {
        console.error('[BHUMI] Gagal membaca body respons POST ' + pathname, err);
        return response;
      });
    }
    return bhumiPersilSignedHeaders().then(function (sig) {
      var headers = { 'Content-Type': 'application/json' };
      headers['x-timestamp'] = sig['x-timestamp'];
      headers['x-signature'] = sig['x-signature'];
      if (token) headers['Authorization'] = token;
      if (!useEcdh) {
        return fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(payload) })
          .then(traceFailure);
      }
      /* getPersil menuntut kunci pub ECDH P-256 baru per permintaan;
         kunci privatnya disimpan untuk menghitung sesi dekripsi. */
      return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
        .then(function (pair) {
          return crypto.subtle.exportKey('raw', pair.publicKey).then(function (raw) {
            var bytes = new Uint8Array(raw), hex = '';
            for (var i = 0; i < bytes.length; i++) hex += ('0' + bytes[i].toString(16)).slice(-2);
            headers['x-client-pubkey'] = hex;
            return fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(payload) })
              .then(traceFailure)
              .then(function (r) { return { res: r, privKey: pair.privateKey }; });
          });
        });
    }).catch(function (err) {
      console.error('[BHUMI] POST ' + pathname + ' gagal sebelum menerima respons HTTP', err);
      throw err;
    });
  }

  function bhumiPersilSafeDiagnostic(text) {
    return String(text == null ? '' : text)
      .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[JWT disamarkan]')
      .replace(/((?:"|')?(?:token|access_token|accessToken|authorization|x-signature|signature)(?:"|')?\s*:\s*)("[^"]*"|'[^']*'|[^,}\s]+)/gi, '$1"[RAHASIA DISAMARKAN]"');
  }

  function bhumiPersilTokenFrom(value, depth) {
    if (depth > 3 || value == null) return null;
    if (typeof value === 'string') {
      var token = value.trim().replace(/^Bearer\s+/i, '');
      return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) ? token : null;
    }
    if (typeof value !== 'object') return null;
    var keys = ['token', 'access_token', 'accessToken', 'jwt', 'authorization', 'data', 'result'];
    for (var i = 0; i < keys.length; i++) {
      var found = bhumiPersilTokenFrom(value[keys[i]], depth + 1);
      if (found) return found;
    }
    return null;
  }

  function bhumiPersilResponseMessage(value) {
    if (!value || typeof value !== 'object') return '';
    var message = value.message || value.error_description || value.error || value.detail;
    if (typeof message !== 'string') return '';
    // Hindari menampilkan payload/token yang mungkin dikembalikan server.
    return message.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').slice(0, 160);
  }

  function bhumiPersilGetToken() {
    if (bhumiPersilToken.value && Date.now() < bhumiPersilToken.expiresAt) {
      return Promise.resolve(bhumiPersilToken.value);
    }
    if (bhumiPersilToken.pending) return bhumiPersilToken.pending;
    bhumiPersilToken.pending = bhumiPersilProxyPost('/expapi/loginApi', { username: 'user', password: 'password' }, null)
      .then(function (r) {
        return r.text().then(function (text) {
          var body = null;
          try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }
          if (!r.ok) {
            var detail = bhumiPersilSafeDiagnostic(text);
            var upstreamStatus = r.headers.get('X-Proxy-Status');
            throw new Error('BHUMI_LOGIN_HTTP_' + r.status +
              (upstreamStatus ? ' (proxy upstream ' + upstreamStatus + ')' : '') +
              (detail ? ': ' + detail : '\n(respons kosong)'));
          }
          var token = bhumiPersilTokenFrom(body, 0);
          if (!token) {
            var msg = bhumiPersilSafeDiagnostic(text);
            throw new Error('BHUMI_LOGIN_TOKEN_MISSING' + (msg ? ': ' + msg : ''));
          }
          bhumiPersilToken.value = token;
          bhumiPersilToken.expiresAt = Date.now() + 50 * 60 * 1000;
          return token;
        });
      })
      .catch(function (err) {
        throw (err instanceof Error ? err : new Error('BHUMI_LOGIN_NETWORK_ERROR'));
      })
      .finally(function () { bhumiPersilToken.pending = null; });
    return bhumiPersilToken.pending;
  }

  /* BHUMI-CRYPTO-START -- MD5 + OpenSSL EVP_BytesToKey (AES-256-CBC).
     Passphrase mengikuti bundle resmi app BHUMI (chunk 8815, fungsi n(),
     dibobok lewat String.fromCharCode XOR); rotasi kunci terakhir
     2026-10-22 — sebelumnya S3cretATRXBUMI. */
  function bhumiMd5Bytes(bytes) {
    function add32(a, b) { return (a + b) & 0xFFFFFFFF; }
    function rol(n, c) { return (n << c) | (n >>> (32 - c)); }
    function cmn(q, a, b, x, s, t) { return add32(rol(add32(add32(a, q), add32(x, t)), s), b); }
    function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
    function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
    function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
    function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
    var msgLen = bytes.length;
    var padded = new Uint8Array((((msgLen + 8) >> 6) + 1) * 64);
    padded.set(bytes);
    padded[msgLen] = 0x80;
    var bitLen = msgLen * 8;
    padded[padded.length - 8] = bitLen & 0xFF;
    padded[padded.length - 7] = (bitLen >>> 8) & 0xFF;
    padded[padded.length - 6] = (bitLen >>> 16) & 0xFF;
    padded[padded.length - 5] = (bitLen >>> 24) & 0xFF;
    var a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (var i = 0; i < padded.length; i += 64) {
      var x = [];
      for (var j = 0; j < 16; j++) {
        x[j] = padded[i + j * 4] | (padded[i + j * 4 + 1] << 8) |
                (padded[i + j * 4 + 2] << 16) | (padded[i + j * 4 + 3] << 24);
      }
      var oa = a, ob = b, oc = c, od = d;
      a = ff(a,b,c,d,x[0],7,-680876936); d = ff(d,a,b,c,x[1],12,-389564586); c = ff(c,d,a,b,x[2],17,606105819); b = ff(b,c,d,a,x[3],22,-1044525330);
      a = ff(a,b,c,d,x[4],7,-176418897); d = ff(d,a,b,c,x[5],12,1200080426); c = ff(c,d,a,b,x[6],17,-1473231341); b = ff(b,c,d,a,x[7],22,-45705983);
      a = ff(a,b,c,d,x[8],7,1770035416); d = ff(d,a,b,c,x[9],12,-1958414417); c = ff(c,d,a,b,x[10],17,-42063); b = ff(b,c,d,a,x[11],22,-1990404162);
      a = ff(a,b,c,d,x[12],7,1804603682); d = ff(d,a,b,c,x[13],12,-40341101); c = ff(c,d,a,b,x[14],17,-1502002290); b = ff(b,c,d,a,x[15],22,1236535329);
      a = gg(a,b,c,d,x[1],5,-165796510); d = gg(d,a,b,c,x[6],9,-1069501632); c = gg(c,d,a,b,x[11],14,643717713); b = gg(b,c,d,a,x[0],20,-373897302);
      a = gg(a,b,c,d,x[5],5,-701558691); d = gg(d,a,b,c,x[10],9,38016083); c = gg(c,d,a,b,x[15],14,-660478335); b = gg(b,c,d,a,x[4],20,-405537848);
      a = gg(a,b,c,d,x[9],5,568446438); d = gg(d,a,b,c,x[14],9,-1019803690); c = gg(c,d,a,b,x[3],14,-187363961); b = gg(b,c,d,a,x[8],20,1163531501);
      a = gg(a,b,c,d,x[13],5,-1444681467); d = gg(d,a,b,c,x[2],9,-51403784); c = gg(c,d,a,b,x[7],14,1735328473); b = gg(b,c,d,a,x[12],20,-1926607734);
      a = hh(a,b,c,d,x[5],4,-378558); d = hh(d,a,b,c,x[8],11,-2022574463); c = hh(c,d,a,b,x[11],16,1839030562); b = hh(b,c,d,a,x[14],23,-35309556);
      a = hh(a,b,c,d,x[1],4,-1530992060); d = hh(d,a,b,c,x[4],11,1272893353); c = hh(c,d,a,b,x[7],16,-155497632); b = hh(b,c,d,a,x[10],23,-1094730640);
      a = hh(a,b,c,d,x[13],4,681279174); d = hh(d,a,b,c,x[0],11,-358537222); c = hh(c,d,a,b,x[3],16,-722521979); b = hh(b,c,d,a,x[6],23,76029189);
      a = hh(a,b,c,d,x[9],4,-640364487); d = hh(d,a,b,c,x[12],11,-421815835); c = hh(c,d,a,b,x[15],16,530742520); b = hh(b,c,d,a,x[2],23,-995338651);
      a = ii(a,b,c,d,x[0],6,-198630844); d = ii(d,a,b,c,x[7],10,1126891415); c = ii(c,d,a,b,x[14],15,-1416354905); b = ii(b,c,d,a,x[5],21,-57434055);
      a = ii(a,b,c,d,x[12],6,1700485571); d = ii(d,a,b,c,x[3],10,-1894986606); c = ii(c,d,a,b,x[10],15,-1051523); b = ii(b,c,d,a,x[1],21,-2054922799);
      a = ii(a,b,c,d,x[8],6,1873313359); d = ii(d,a,b,c,x[15],10,-30611744); c = ii(c,d,a,b,x[6],15,-1560198380); b = ii(b,c,d,a,x[13],21,1309151649);
      a = ii(a,b,c,d,x[4],6,-145523070); d = ii(d,a,b,c,x[11],10,-1120210379); c = ii(c,d,a,b,x[2],15,718787259); b = ii(b,c,d,a,x[9],21,-343485551);
      a = add32(a, oa); b = add32(b, ob); c = add32(c, oc); d = add32(d, od);
    }
    var out = new Uint8Array(16);
    function put(word, off) {
      out[off] = word & 0xFF; out[off + 1] = (word >>> 8) & 0xFF;
      out[off + 2] = (word >>> 16) & 0xFF; out[off + 3] = (word >>> 24) & 0xFF;
    }
    put(a, 0); put(b, 4); put(c, 8); put(d, 12);
    return out;
  }

  /* passphraseBytes: Uint8Array bila sesi ECDH; tanpa parameter memakai
     passphrase statis (payload non-ECDH). */
  function bhumiAesOpenSslDecrypt(cipherB64, passphraseBytes) {
    try {
      var bin = atob(cipherB64);
      if (bin.length < 17 || bin.slice(0, 8) !== 'Salted__') return Promise.resolve(null);
      var raw = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
      var pass = passphraseBytes;
      if (!pass) {
        var fixed = 'K9#mQ8!wL5*zY4@tN7&eX1^bJ3(c';
        pass = new Uint8Array(fixed.length);
        for (var f = 0; f < fixed.length; f++) pass[f] = fixed.charCodeAt(f);
      }
      var prev = new Uint8Array(0), out = new Uint8Array(0);
      while (out.length < 48) {
        var input = new Uint8Array(prev.length + pass.length + 8);
        input.set(prev, 0);
        for (var k = 0; k < pass.length; k++) input[prev.length + k] = pass[k];
        input.set(raw.subarray(8, 16), prev.length + pass.length);
        prev = bhumiMd5Bytes(input);
        var merged = new Uint8Array(out.length + prev.length);
        merged.set(out, 0); merged.set(prev, out.length);
        out = merged;
      }
      return crypto.subtle.importKey('raw', out.subarray(0, 32), { name: 'AES-CBC' }, false, ['decrypt'])
        .then(function (key) {
          return crypto.subtle.decrypt({ name: 'AES-CBC', iv: out.subarray(32, 48) }, key, raw.subarray(16));
        })
        .then(function (buf) { return new TextDecoder().decode(buf); })
        .catch(function () { return null; });
    } catch (err) {
      return Promise.resolve(null);
    }
  }
  /* BHUMI-CRYPTO-END */

  function bhumiPersilBytesFromHex(hex) {
    if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return null;
    var bytes = new Uint8Array(hex.length / 2);
    for (var i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    return bytes;
  }

  function bhumiPersilServerPubKey(response) {
    var ecdh = response && response.ecdh;
    var value = response && (response.serverPubKey || response.server_pub_key || response.serverPublicKey ||
      response.server_public_key || response.publicKey || response.public_key) ||
      (ecdh && typeof ecdh === 'object' && (ecdh.serverPubKey || ecdh.server_pub_key || ecdh.serverPublicKey ||
        ecdh.server_public_key || ecdh.publicKey || ecdh.public_key || ecdh.key || ecdh.pubkey)) ||
      (typeof ecdh === 'string' ? ecdh : null);
    if (!value) return null;
    if (typeof value === 'object') {
      var x = value.x, y = value.y;
      if (typeof x === 'string' && typeof y === 'string') {
        var xy = bhumiPersilBytesFromHex(x + y);
        if (!xy) {
          try {
            function b64urlBytes(part) {
              var encoded = part.replace(/-/g, '+').replace(/_/g, '/');
              while (encoded.length % 4) encoded += '=';
              var decoded = atob(encoded), result = new Uint8Array(decoded.length);
              for (var bi = 0; bi < decoded.length; bi++) result[bi] = decoded.charCodeAt(bi);
              return result;
            }
            var xb = b64urlBytes(x), yb = b64urlBytes(y);
            if (xb.length === 32 && yb.length === 32) {
              xy = new Uint8Array(64); xy.set(xb); xy.set(yb, 32);
            }
          } catch (e) {}
        }
        if (xy && xy.length === 64) {
          var xyRaw = new Uint8Array(65); xyRaw[0] = 4; xyRaw.set(xy, 1);
          return { bytes: xyRaw, format: 'jwk-xy' };
        }
      }
      value = value.key || value.value || value.pubkey || value.publicKey;
    }
    if (typeof value !== 'string') return null;
    var text = value.trim();
    var hex = text.replace(/^0x/i, '').replace(/\s+/g, '');
    var fromHex = bhumiPersilBytesFromHex(hex);
    if (fromHex && (fromHex.length === 65 || fromHex.length === 64)) {
      if (fromHex.length === 64) {
        var uncompressed = new Uint8Array(65); uncompressed[0] = 4; uncompressed.set(fromHex, 1); fromHex = uncompressed;
      }
      return { bytes: fromHex, format: 'hex' };
    }
    try {
      var base64 = text.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      var binary = atob(base64), decoded = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) decoded[i] = binary.charCodeAt(i);
      if (decoded.length === 64) {
        var uncompressedKey = new Uint8Array(65); uncompressedKey[0] = 4; uncompressedKey.set(decoded, 1); decoded = uncompressedKey;
      }
      if (decoded.length === 65) return { bytes: decoded, format: 'base64' };
    } catch (e) {}
    return null;
  }

  function bhumiPersilBytesToHex(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += ('0' + bytes[i].toString(16)).slice(-2);
    return hex;
  }

  function bhumiPersilDecryptMetadata(json, pubKeyInfo, attempts, hasPrivateKey) {
    var ecdh = json && json.ecdh;
    var ecdhInfo = ecdh && typeof ecdh === 'object'
      ? { type: 'object', keys: Object.keys(ecdh) }
      : { type: typeof ecdh, present: !!ecdh, length: typeof ecdh === 'string' ? ecdh.length : undefined, value: typeof ecdh === 'boolean' ? ecdh : undefined };
    return {
      responseKeys: json && typeof json === 'object' ? Object.keys(json).filter(function (key) { return key !== 'data'; }) : [],
      encrypted: !!(json && json.encrypted),
      encryptedDataLength: json && typeof json.data === 'string' ? json.data.length : null,
      encryptedDataHeader: (function () {
        try { return atob(json.data.slice(0, 16)).slice(0, 8); } catch (e) { return 'not-base64'; }
      })(),
      ecdh: ecdhInfo,
      serverPubKey: pubKeyInfo ? { format: pubKeyInfo.format, bytes: pubKeyInfo.bytes.length } : {
        present: !!(json && (json.serverPubKey || json.server_pub_key || json.serverPublicKey || json.server_public_key ||
          json.publicKey || json.public_key || json.ecdh)), format: 'unrecognized'
      },
      clientPrivateKey: !!hasPrivateKey,
      attempts: attempts || []
    };
  }

  function bhumiPersilParseResponse(json, privKey) {
    if (json && json.type === 'FeatureCollection') return Promise.resolve(json);
    if (!json || !json.encrypted || !json.data) return Promise.resolve(null);

    var attempts = [];
    var pubKeyInfo = bhumiPersilServerPubKey(json);
    function tryPassphrases(candidates, index) {
      if (index >= candidates.length) return Promise.resolve(null);
      var candidate = candidates[index];
      return bhumiAesOpenSslDecrypt(json.data, candidate.bytes).then(function (text) {
        if (text) {
          try {
            var parsed = JSON.parse(text);
            if (parsed && parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) return parsed;
            attempts.push(candidate.name + ': decrypted, payload bukan FeatureCollection');
          } catch (e) { attempts.push(candidate.name + ': decrypt berhasil, JSON tidak valid'); }
        } else attempts.push(candidate.name + ': AES decrypt gagal');
        return tryPassphrases(candidates, index + 1);
      });
    }

    var candidates = [];
    function addCandidate(name, bytes) {
      if (bytes && bytes.length) candidates.push({ name: name, bytes: bytes });
    }
    var fixed = 'K9#mQ8!wL5*zY4@tN7&eX1^bJ3(c', fixedBytes = new Uint8Array(fixed.length);
    for (var f = 0; f < fixed.length; f++) fixedBytes[f] = fixed.charCodeAt(f);

    var ecdhPromise = Promise.resolve();
    if (pubKeyInfo && privKey && window.crypto && crypto.subtle) {
      ecdhPromise = crypto.subtle.importKey('raw', pubKeyInfo.bytes, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
        .then(function (serverKey) { return crypto.subtle.deriveBits({ name: 'ECDH', public: serverKey }, privKey, 256); })
        .then(function (sharedBuffer) {
          var shared = new Uint8Array(sharedBuffer), sharedHex = bhumiPersilBytesToHex(shared);
          addCandidate('ECDH shared bytes', shared);
          addCandidate('ECDH shared hex text', new TextEncoder().encode(sharedHex));
          return Promise.all([
            crypto.subtle.digest('SHA-256', shared),
            crypto.subtle.digest('SHA-256', new TextEncoder().encode(sharedHex))
          ]).then(function (digests) {
            var rawHex = bhumiPersilBytesToHex(new Uint8Array(digests[0]));
            var hexText = bhumiPersilBytesToHex(new Uint8Array(digests[1]));
            addCandidate('SHA256(ECDH bytes)', new Uint8Array(digests[0]));
            addCandidate('SHA256(ECDH bytes) hex text', new TextEncoder().encode(rawHex));
            addCandidate('SHA256(ECDH hex text)', new Uint8Array(digests[1]));
            addCandidate('SHA256(ECDH hex text) hex text', new TextEncoder().encode(hexText));
          });
        }).catch(function (error) {
          attempts.push('ECDH derive: ' + ((error && error.message) || 'gagal'));
        });
    } else {
      attempts.push(!pubKeyInfo ? 'server public key tidak dikenali' : 'private key ECDH request tidak tersedia');
    }

    return ecdhPromise.then(function () {
      addCandidate('legacy static passphrase', fixedBytes);
      return tryPassphrases(candidates, 0);
    }).then(function (featureCollection) {
      if (featureCollection) return featureCollection;
      json.__decryptDiagnostics = bhumiPersilDecryptMetadata(json, pubKeyInfo, attempts, !!privKey);
      console.error('[BHUMI] Respons berhasil diterima tetapi dekripsi gagal', json.__decryptDiagnostics);
      return null;
    }).catch(function (error) {
      attempts.push('decrypt pipeline: ' + ((error && error.message) || 'gagal'));
      json.__decryptDiagnostics = bhumiPersilDecryptMetadata(json, pubKeyInfo, attempts, !!privKey);
      console.error('[BHUMI] Respons berhasil diterima tetapi dekripsi gagal', json.__decryptDiagnostics);
      return null;
    });
  }

  function bhumiPersilEsc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function bhumiPersilStatusCard(title, message, canRetry) {
    return bhumiPersilCard(title, 'Persil Nasional', [['Status', message]]) +
      (canRetry ? '<div class="bhumi-persil-retry-wrap"><button type="button" class="bhumi-persil-retry">Coba lagi</button></div>' : '');
  }

  function bhumiPersilLoadingCard(title) {
    return '<div class="agol-popup"><div class="agol-popup-header agol-geo-persil">' +
      '<div class="agol-popup-title">' + bhumiPersilEsc(title) + '</div>' +
      '<div class="agol-popup-subtitle">Persil Nasional</div></div>' +
      '<div class="agol-popup-body bhumi-persil-loading"><span class="bhumi-persil-spinner" role="status" aria-label="Memuat"></span></div></div>';
  }

  function bhumiPersilEnsureSheet() {
    bhumiPersilSheet = ensureCatalogPopupSheet();
    return bhumiPersilSheet;
  }

  var gistaruKabupatenPromise = null;
  /* API Interaktif GISTARU hanya menerima permintaan dari IP terdaftar
     (balasannya 403 "Akses hanya dari alamat IP terdaftar"). Sekali ditolak,
     permintaan berikutnya dilewati selama 10 menit supaya setiap klik peta
     tidak membayar satu ronde jaringan yang sudah pasti gagal -- langsung
     jatuh ke fallback zona yang datanya justru lebih lengkap. */
  var bhumiPersilGistaruApiDitolakSampai = 0;
  var GISTARU_PROXY_BASE = 'https://gistaru-proxy.atrbpn.go.id/proxy.ashx?';
  var GISTARU_API_BASE = 'https://gistaru.atrbpn.go.id/rdtrinteraktif/api/interactive/';

  function bhumiPersilGistaruRegion(latlng) {
    if (!gistaruKabupatenPromise) {
      gistaruKabupatenPromise = fetch('assets/data/bps/geojson/kabupaten.geojson')
        .then(function (response) {
          if (!response.ok) throw new Error('Batas kabupaten tidak dapat dimuat.');
          return response.json();
        }).catch(function (error) {
          gistaruKabupatenPromise = null;
          throw error;
        });
    }
    return gistaruKabupatenPromise.then(function (geojson) {
      if (!window.turf || typeof window.turf.booleanPointInPolygon !== 'function') {
        throw new Error('Pustaka geometri belum tersedia.');
      }
      var point = window.turf.point([Number(latlng.lng), Number(latlng.lat)]);
      var features = geojson.features || [];
      for (var i = 0; i < features.length; i++) {
        var feature = features[i];
        if (feature.geometry && window.turf.booleanPointInPolygon(point, feature)) {
          var props = feature.properties || {};
          var code = String(props.idkab || '').replace(/\D/g, '').padStart(4, '0');
          if (code.length !== 4) break;
          return { id: code + '000000', name: props.nmkab || props.namkab || props.NAMKAB || '' };
        }
      }
      throw new Error('Koordinat tidak masuk ke batas kabupaten yang dikenal.');
    });
  }

  function bhumiPersilGistaruRequest(path, params) {
    var query = Object.keys(params).map(function (key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
    }).join('&');
    var target = GISTARU_PROXY_BASE + GISTARU_API_BASE + path + '?' + query;
    var url = BHUMI_PERSIL_NASIONAL_PROXY + encodeURIComponent(target);
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (response) {
      if (!response.ok) {
        if (response.status === 403) bhumiPersilGistaruApiDitolakSampai = Date.now() + 10 * 60 * 1000;
        throw new Error('HTTP ' + response.status);
      }
      return response.json();
    }).then(function (json) {
      if (!json || Number(json.status) !== 200 || !json.data) {
        throw new Error((json && json.message) || 'Respons GISTARU tidak berisi data.');
      }
      return json.data;
    });
  }

  function bhumiPersilGistaruValue(value) {
    if (value == null || value === '') return '';
    if (Array.isArray(value)) return value.map(bhumiPersilGistaruValue).filter(Boolean).join('\n');
    if (typeof value === 'object') {
      return Object.keys(value).map(function (key) {
        return key + ': ' + bhumiPersilGistaruValue(value[key]);
      }).join('\n');
    }
    return String(value);
  }

  function bhumiPersilGistaruLeaves(value, path, out) {
    path = path || [];
    out = out || [];
    if (Array.isArray(value)) value.forEach(function (item) { bhumiPersilGistaruLeaves(item, path, out); });
    else if (value && typeof value === 'object') {
      Object.keys(value).forEach(function (key) { bhumiPersilGistaruLeaves(value[key], path.concat(key), out); });
    } else if (value != null && String(value).trim() !== '') out.push({ path: path, value: String(value).trim() });
    return out;
  }

  function bhumiPersilGistaruUnique(values) {
    var seen = Object.create(null);
    return values.filter(function (value) {
      if (seen[value]) return false;
      seen[value] = true;
      return true;
    });
  }

  function bhumiPersilGistaruSection(title, rows) {
    rows = rows.filter(function (row) { return row[1] != null && row[1] !== ''; });
    if (!rows.length) return '';
    return '<section class="bhumi-persil-gistaru-section"><h3>' + bhumiPersilEsc(title) + '</h3>' +
      '<table class="bhumi-persil-data-table"><tbody>' + rows.map(function (row) {
        return '<tr' + (row[2] ? ' class="bhumi-persil-gistaru-intensity-row"' : '') + '><th scope="row">' +
          bhumiPersilEsc(row[0]) + '</th><td>' + (row[2] ? row[1] : bhumiPersilEsc(row[1])) + '</td></tr>';
      }).join('') + '</tbody></table></section>';
  }

  function bhumiPersilGistaruRuleLines(value) {
    return bhumiPersilGistaruLeaves(value).map(function (item) {
      var context = item.path.filter(Boolean).join(' › ');
      return (context ? context + ' — ' : '') + item.value;
    });
  }

  function bhumiPersilGistaruListHtml(values) {
    values = values.filter(Boolean);
    if (!values.length) return '';
    return '<ul class="bhumi-persil-gistaru-rule-list">' + values.map(function (value) {
      return '<li>' + bhumiPersilEsc(value) + '</li>';
    }).join('') + '</ul>';
  }

  function bhumiPersilGistaruActivityGroups(data, activities) {
    var nameById = Object.create(null);
    (Array.isArray(activities) ? activities : []).forEach(function (item) {
      if (item && item.id_kegiatan != null) nameById[String(item.id_kegiatan)] = item.kegiatan || item.nama_kegiatan || item.name || String(item.id_kegiatan);
    });
    return [
      ['Diizinkan', 'bgnizn'], ['Terbatas', 'bgntbt'],
      ['Bersyarat', 'bgnbst'], ['Tidak sesuai', 'bgntbs']
    ].map(function (pair) {
      var ids = bhumiPersilGistaruUnique(bhumiPersilGistaruLeaves(data[pair[1]]).map(function (item) { return item.value; }));
      return { title: pair[0], names: ids.map(function (id) { return nameById[id] || id; }) };
    });
  }

  function bhumiPersilGistaruActivitiesSection(data, activities) {
    var groups = bhumiPersilGistaruActivityGroups(data, activities);
    var rules = [
      ['iznktg', 'Diizinkan'], ['tbtktg', 'Terbatas'],
      ['bstktg', 'Bersyarat'], ['tbsktg', 'Tidak sesuai']
    ];
    var html = groups.map(function (group, index) {
      var rule = bhumiPersilGistaruUnique(bhumiPersilGistaruLeaves(data[rules[index][0]])
        .map(function (item) { return item.value; }));
      var names = group.names.length
        ? '<ul>' + group.names.map(function (name) { return '<li>' + bhumiPersilEsc(name) + '</li>'; }).join('') + '</ul>'
        : '<p class="bhumi-persil-gistaru-empty">Tidak ada kegiatan pada kategori ini.</p>';
      var ruleHtml = rule.length
        ? '<details class="bhumi-persil-gistaru-activity-rule"><summary>Keterangan status</summary><ul>' +
          rule.map(function (text) { return '<li>' + bhumiPersilEsc(text) + '</li>'; }).join('') + '</ul></details>'
        : '';
      return '<article class="bhumi-persil-gistaru-activity-group is-status-' + (index + 1) + '">' +
        '<div class="bhumi-persil-gistaru-activity-head"><strong>' + bhumiPersilEsc(group.title) +
        '</strong><span>' + group.names.length.toLocaleString('id-ID') + ' kegiatan</span></div>' + names + ruleHtml + '</article>';
    }).join('');
    return '<section class="bhumi-persil-gistaru-section bhumi-persil-gistaru-activities-section">' +
      '<h3>Ketentuan kegiatan</h3><div class="bhumi-persil-gistaru-activity-groups">' + html + '</div></section>';
  }

  function bhumiPersilGistaruCard(data, regionName, activities) {
    data = data || {};
    var location = [
      ['Wilayah', data.wadmkk || data.wadmkab || data.nmkab || regionName],
      ['Kecamatan', data.wadmkc], ['Kelurahan/Desa', data.wadmkd]
    ];
    var zoneRows = [
      ['Rencana', data.rtr], ['ID RTR', data.id_rtr], ['Zona', data.namzon], ['Kode zona', data.kodzon],
      ['Subzona', data.namszn], ['Kode subzona', data.kodszn], ['Blok', data.kodblk],
      ['Subblok', data.kodsbl], ['SWK', data.namswk]
    ];
    var intensityRows = [
      ['KDB · Koefisien Dasar Bangunan', bhumiPersilGistaruListHtml(bhumiPersilGistaruRuleLines(data.kdb)), true],
      ['KLB · Koefisien Lantai Bangunan', bhumiPersilGistaruListHtml(bhumiPersilGistaruRuleLines(data.klb)), true],
      ['KDH · Koefisien Dasar Hijau', bhumiPersilGistaruListHtml(bhumiPersilGistaruRuleLines(data.kdh)), true],
      ['Ketinggian bangunan', bhumiPersilGistaruListHtml(bhumiPersilGistaruRuleLines(data.ktgbgn)), true],
      ['KTB · Ketentuan jarak bangunan', bhumiPersilGistaruListHtml(bhumiPersilGistaruRuleLines(data.ktb)), true],
      ['GSB · Garis sempadan bangunan', bhumiPersilGistaruListHtml(bhumiPersilGistaruRuleLines(data.gsb)), true],
      ['Keterangan zonasi', bhumiPersilGistaruListHtml(bhumiPersilGistaruRuleLines(data.ketrgn)), true]
    ];
    var rulesRows = [
      ['Ringkasan', data.nothpr], ['Persetujuan Perda', data.pp],
      ['Batang tubuh peraturan', data.bt], ['Catatan', data.ct]
    ].map(function (row) { return [row[0], bhumiPersilGistaruValue(row[1])]; });
    var title = data.namzon || data.namszn || 'Detail Informasi RDTR';
    var subtitle = [data.kodzon, data.kodszn].filter(Boolean).join(' · ') || 'Rencana Detail Tata Ruang';
    var sections = bhumiPersilGistaruSection('Lokasi', location) +
      bhumiPersilGistaruSection('Zona dan subzona', zoneRows) +
      bhumiPersilGistaruSection('Intensitas pemanfaatan ruang', intensityRows) +
      bhumiPersilGistaruActivitiesSection(data, activities) +
      bhumiPersilGistaruSection('Peraturan dan ketentuan', rulesRows);
    return '<div class="agol-popup"><div class="agol-popup-header agol-geo-persil">' +
      '<div class="agol-popup-title">' + bhumiPersilEsc(title) + '</div>' +
      '<div class="agol-popup-subtitle">' + bhumiPersilEsc(subtitle) + '</div></div>' +
      '<div class="agol-popup-body bhumi-persil-gistaru-body">' + sections + '</div>' +
      '<div class="agol-popup-footer"><span>Sumber: GISTARU ATR/BPN · RDTR Interaktif</span></div></div>';
  }

  /* Label field layer ArcGIS RDTR, disamakan dengan alias yang dipakai
     GISTARU sendiri. Field yang tidak dikenal tetap ditampilkan dengan kode
     aslinya supaya tidak ada informasi yang hilang diam-diam. */
  var bhumiPersilArcgisLabel = {
    NAMOBJ: 'Nama objek', NAMZON: 'Nama zona', KODZON: 'Kode zona',
    NAMSZN: 'Nama sub-zona', KODSZN: 'Kode sub-zona',
    JNSRPR: 'Jenis rencana pola ruang', KODEWP: 'Kode WP', KODSWP: 'Kode SWP',
    KODBLK: 'Kode blok', KODSBL: 'Kode sub-blok', KODUNK: 'Kode unsur',
    WADMPR: 'Provinsi', WADMKK: 'Kabupaten/Kota', WADMKC: 'Kecamatan',
    WADMKD: 'Kelurahan/Desa',
    KKOP_1: 'Keselamatan operasi penerbangan',
    LP2B_2: 'Lahan pertanian pangan berkelanjutan',
    KRB_03: 'Kawasan rawan bencana', TOD_04: 'Kawasan berorientasi transit',
    TEB_05: 'Tempat evakuasi bencana', PUSLIT: 'Pusat penelitian',
    CAGBUD: 'Kawasan cagar budaya', RESAIR: 'Kawasan resapan air',
    KSMPDN: 'Kawasan sempadan', HANKAM: 'Pertahanan dan keamanan',
    KKARST: 'Kawasan karst', PTBGMB: 'Pertambangan mineral dan batubara',
    MGRSAT: 'Kawasan migrasi satwa', RDBUMI: 'Ruang dalam bumi',
    TPZ_00: 'Teknik pengaturan zonasi', REMARK: 'Catatan',
    PP: 'Peta Perda', BA: 'Berita acara', CT: 'Dokumen verifikasi',
    BT: 'Batang tubuh peraturan', NOTHPR: 'Nomor dan tahun peraturan',
    KDB: 'KDB · koefisien dasar bangunan',
    KLB: 'KLB · koefisien lantai bangunan',
    KDH: 'KDH · koefisien dasar hijau', GSB: 'GSB · garis sempadan',
    KTB: 'KTB · jarak bangunan', KTGBGN: 'Ketinggian bangunan',
    KETRGN: 'Keterangan zonasi'
  };

  /* Pengelompokan baris kartu fallback. Grup ketiga (intensitas) sering tidak
     ada di layer ArcGIS -- hanya API Interaktif yang memilikinya -- jadi
     kosongnya grup itu bukan kegagalan, cukup tidak ditampilkan. */
  var bhumiPersilArcgisGrup = [
    ['Lokasi', ['WADMPR', 'WADMKK', 'WADMKC', 'WADMKD'], false],
    ['Zona dan subzona', ['NAMOBJ', 'NAMZON', 'KODZON', 'NAMSZN', 'KODSZN',
      'JNSRPR', 'KODEWP', 'KODSWP', 'KODBLK', 'KODSBL', 'KODUNK'], false],
    ['Intensitas pemanfaatan ruang', ['KDB', 'KLB', 'KDH', 'GSB', 'KTB',
      'KTGBGN', 'KETRGN'], false],
    ['Kendala dan peruntukan', ['KKOP_1', 'LP2B_2', 'KRB_03', 'TOD_04',
      'TEB_05', 'PUSLIT', 'CAGBUD', 'RESAIR', 'KSMPDN', 'HANKAM', 'KKARST',
      'PTBGMB', 'MGRSAT', 'RDBUMI', 'TPZ_00'], true],
    ['Peraturan dan dokumen', ['NOTHPR', 'PP', 'BA', 'CT', 'BT', 'REMARK'], false]
  ];

  /* "Tidak Ada" pada field kendala berarti tidak ada kendala, jadi
     menampilkannya hanya memenuhi kartu tanpa informasi apa pun. */
  function bhumiPersilArcgisPakai(kunci, nilai, sembunyikanKosong) {
    if (nilai == null) return false;
    var teks = String(nilai).trim();
    if (!teks) return false;
    if (sembunyikanKosong && teks.toLowerCase() === 'tidak ada') return false;
    return !!kunci;
  }

  function bhumiPersilArcgisNilai(nilai) {
    var teks = String(nilai).trim();
    if (/^https?:\/\//i.test(teks)) {
      return '<a href="' + bhumiPersilEsc(teks) + '" target="_blank" rel="noopener noreferrer">' +
        bhumiPersilEsc(teks.replace(/^https?:\/\/[^/]+/i, '')) + '</a>';
    }
    return bhumiPersilEsc(teks);
  }

  function bhumiPersilArcgisRows(keys, p, sembunyikanKosong) {
    return keys.map(function (kunci) {
      if (!bhumiPersilArcgisPakai(kunci, p[kunci], sembunyikanKosong)) return null;
      return [bhumiPersilArcgisLabel[kunci] || kunci,
        bhumiPersilArcgisNilai(p[kunci]), true];
    }).filter(Boolean);
  }

  /* Sisa field yang tidak masuk kelompok mana pun. Dicatat sebagai "atribut
     lain" supaya perubahan skema di sisi ATR/BPN tidak membuat data hilang
     tanpa jejak. */
  function bhumiPersilArcgisSisa(p, terpakai) {
    return Object.keys(p).filter(function (kunci) {
      if (terpakai.indexOf(kunci) !== -1) return false;
      if (kunci === 'OBJECTID' || kunci === 'SHAPE' || kunci.indexOf('SHAPE_') === 0) return false;
      return bhumiPersilArcgisPakai(kunci, p[kunci], false);
    }).map(function (kunci) {
      return [bhumiPersilArcgisLabel[kunci] || kunci, bhumiPersilArcgisNilai(p[kunci]), true];
    });
  }

  /* Daftar kegiatan dari berkas lokal assets/data/geooss/activities. API
     Interaktif menolak permintaan dari luar daftar IP terdaftar, tetapi
     daftar kegiatan per RDTR sudah diunduh ke repo, jadi kartu fallback tetap
     bisa menjawab "kegiatan apa yang boleh di zona ini". Mengembalikan
     { status, pasti, nama } dan TIDAK pernah melempar: gagal memuat daftar
     hanya menghilangkan satu bagian kartu, bukan seluruhnya. */
  function bhumiPersilKegiatanZonaDariData(geoOss, rdtr, p, data) {
    var kode = (p && (p.KODSZN || p.KODZON)) || '';
    var zona = (data && data.zona) || [];
    var daftar = (data && data.kegiatan) || [];
    if (!kode || !zona.length || !daftar.length) return { status: 'takada', nama: [], pasti: false };
    var indeks = [];
    var pasti = false;
    for (var i = 0; i < zona.length; i++) {
      var hasil = geoOss && typeof geoOss.cocokZona === 'function'
        ? geoOss.cocokZona(kode, zona[i])
        : (String(zona[i]).toUpperCase() === String(kode).toUpperCase() ? 'pasti' : 'tidak');
      if (hasil === 'pasti') { indeks = [i]; pasti = true; break; }
      if (hasil === 'awalan') indeks.push(i);
    }
    if (!indeks.length) return { status: 'zonatakada', nama: [], pasti: false };
    var dipakai = Object.create(null);
    indeks.forEach(function (i) { dipakai[i] = true; });
    var nama = [];
    daftar.forEach(function (k) {
      if (!k || !k.nama) return;
      var z = k.z || [];
      for (var j = 0; j < z.length; j++) {
        if (dipakai[z[j]]) { nama.push(k.nama); return; }
      }
    });
    return { status: nama.length ? 'ok' : 'kosong', pasti: pasti, nama: nama };
  }

  function bhumiPersilGistaruFallbackSections(rdtr, region, p, kegiatan) {
    var terpakai = [];
    bhumiPersilArcgisGrup.forEach(function (grup) {
      terpakai = terpakai.concat(grup[1]);
    });
    var html = '';
    bhumiPersilArcgisGrup.forEach(function (grup) {
      var rows = bhumiPersilArcgisRows(grup[1], p, grup[2]);
      if (grup[0] === 'Lokasi' && !rows.length) {
        rows = [['Wilayah', bhumiPersilEsc(region.name || ''), true]];
      }
      if (grup[0] === 'Zona dan subzona' && !rows.length && rdtr.rtr) {
        rows = [['Rencana', bhumiPersilEsc(rdtr.rtr), true]];
      }
      html += bhumiPersilGistaruSection(grup[0], rows);
    });
    var sisa = bhumiPersilArcgisSisa(p, terpakai);
    if (sisa.length) html += bhumiPersilGistaruSection('Atribut lainnya', sisa);
    if (kegiatan && kegiatan.status === 'ok') {
      var batas = 80;
      var teks = kegiatan.nama.slice(0, batas);
      if (kegiatan.nama.length > batas) {
        teks.push('… dan ' + (kegiatan.nama.length - batas) + ' kegiatan lainnya');
      }
      html += '<section class="bhumi-persil-gistaru-section">' +
        '<h3>Kegiatan yang diizinkan di zona ini</h3>' +
        bhumiPersilGistaruListHtml(teks) +
        '<p class="bhumi-persil-gistaru-fallback-note">Daftar kegiatan dari berkas lokal GISTARU ' +
        (kegiatan.pasti ? '— kode zona cocok persis.' :
          '— pencocokan kode zona tidak persis, periksa kembali kode di atas.') + '</p></section>';
    } else if (kegiatan && kegiatan.status === 'kosong') {
      html += '<section class="bhumi-persil-gistaru-section">' +
        '<h3>Kegiatan yang diizinkan di zona ini</h3>' +
        '<p class="bhumi-persil-gistaru-empty">Tidak ada kegiatan terdaftar untuk kode zona ini.</p></section>';
    } else if (kegiatan && kegiatan.status === 'zonatakada') {
      html += '<section class="bhumi-persil-gistaru-section">' +
        '<h3>Kegiatan yang diizinkan di zona ini</h3>' +
        '<p class="bhumi-persil-gistaru-empty">Kode zona pada titik ini tidak ditemukan dalam daftar kegiatan RDTR.</p></section>';
    } else if (kegiatan) {
      html += '<section class="bhumi-persil-gistaru-section">' +
        '<h3>Kegiatan yang diizinkan di zona ini</h3>' +
        '<p class="bhumi-persil-gistaru-empty">Daftar kegiatan untuk RDTR ini belum tersedia di repo.</p></section>';
    }
    html += '<p class="bhumi-persil-gistaru-fallback-note">Ketentuan intensitas (KDB, KLB, KDH) hanya tersedia lewat ' +
      'API RDTR Interaktif yang sedang menolak permintaan dari luar daftar IP terdaftar. ' +
      'Data di atas diambil langsung dari layer ArcGIS GISTARU.</p>';
    return html;
  }

  function bhumiPersilGistaruFallbackCard(rdtr, region, properties, kegiatan) {
    var p = properties || {};
    var judul = p.NAMZON || p.NAMSZN || p.NAMOBJ || 'Detail Informasi RDTR';
    var subjudul = [p.KODZON, p.KODSZN].filter(Boolean).join(' · ') ||
      rdtr.rtr || 'Rencana Detail Tata Ruang';
    var sections = bhumiPersilGistaruFallbackSections(rdtr, region, p, kegiatan);
    return '<div class="agol-popup"><div class="agol-popup-header agol-geo-persil">' +
      '<div class="agol-popup-title">' + bhumiPersilEsc(judul) + '</div>' +
      '<div class="agol-popup-subtitle">' + bhumiPersilEsc(subjudul) + '</div></div>' +
      '<div class="agol-popup-body bhumi-persil-gistaru-body">' + sections + '</div>' +
      '<div class="agol-popup-footer"><span>Sumber: GISTARU ATR/BPN · ArcGIS</span></div></div>';
  }

  function bhumiPersilLoadGistaruFallback(latlng) {
    var geoOss = window.GeoOss;
    if (!geoOss || !geoOss.muatRdtr || !geoOss.queryZona) {
      return Promise.reject(new Error('Fallback RDTR belum siap.'));
    }
    return bhumiPersilGistaruRegion(latlng).then(function (region) {
      return geoOss.muatRdtr(region.id).then(function (rdtrList) {
        var point = window.turf && window.turf.point ? window.turf.point([Number(latlng.lng), Number(latlng.lat)]) : null;
        function tryRdtr(index, lastError) {
          if (index >= rdtrList.length) {
            return Promise.reject(lastError || new Error('Tidak ada zona RDTR pada titik ini.'));
          }
          var rdtr = rdtrList[index];
          var pointBox = [Number(latlng.lng), Number(latlng.lat), Number(latlng.lng), Number(latlng.lat)];
          function featureAtPoint(features) {
            var feature = features.find(function (item) {
              return !point || !window.turf.booleanPointInPolygon || window.turf.booleanPointInPolygon(point, item);
            });
            return feature || null;
          }
          function queryArcGis() {
            return geoOss.queryZona(rdtr, '*', pointBox).then(function (result) {
              return featureAtPoint((result && result.fitur) || []);
            });
          }
          var localZones = geoOss.muatZonaLokal && geoOss.zonaLokalKeFitur
            ? geoOss.muatZonaLokal(region.id, rdtr.id_rtr).then(function (data) {
              return featureAtPoint(geoOss.zonaLokalKeFitur(data));
            }).catch(function () { return null; })
            : Promise.resolve(null);
          return localZones.then(function (feature) {
            return feature || queryArcGis();
          }).then(function (feature) {
            if (!feature) return tryRdtr(index + 1, lastError);
            /* Daftar kegiatan diambil dari berkas lokal: API Interaktif
               menolak permintaan dari luar daftar IP terdaftar, tetapi
               daftar kegiatan per RDTR sudah diunduh ke repo. Gagal memuatnya
               tidak boleh menggagalkan kartu -- hanya bagian kegiatan yang
               hilang. */
            var kegiatanPromise = typeof geoOss.muatKegiatan === 'function'
              ? geoOss.muatKegiatan(region.id, rdtr.id_rtr).then(function (data) {
                return bhumiPersilKegiatanZonaDariData(geoOss, rdtr, feature.properties, data);
              }).catch(function () { return undefined; })
              : Promise.resolve(undefined);
            return kegiatanPromise.then(function (kegiatan) {
              return bhumiPersilGistaruFallbackCard(rdtr, region, feature.properties, kegiatan);
            });
          }).catch(function (error) {
            return tryRdtr(index + 1, error);
          });
        }
        return tryRdtr(0, null);
      });
    });
  }

  /* Pesan error dari jaringan sangat teknis ("Failed to fetch", "HTTP 403")
     dan tidak menyebut apa pun yang bisa ditindaklanjuti pengguna. Diterjemahkan
     dulu ke bahasa yang menjelaskan penyebab sekaligus batasannya. */
  function bhumiPersilJelaskanError(err) {
    if (!err) return 'tidak tersedia';
    var pesan = String(err.message || err);
    if (/HTTP\s*403/i.test(pesan)) return 'HTTP 403 — layanan hanya menerima permintaan dari IP terdaftar';
    if (/HTTP\s*401/i.test(pesan)) return 'HTTP 401 — sesi ditolak';
    if (/HTTP\s*404/i.test(pesan)) return 'HTTP 404 — layanan atau layer tidak ditemukan';
    if (/HTTP\s*5\d\d/.test(pesan)) return pesan + ' — layanan ATR/BPN sedang terganggu';
    if (/Failed to fetch|NetworkError|Load failed/i.test(pesan)) {
      return 'koneksi ke layanan ArcGIS GISTARU diblokir atau terputus';
    }
    if (/berkas tidak ada/i.test(pesan)) return pesan;
    if (pesan.length > 140) pesan = pesan.slice(0, 140) + '…';
    return pesan;
  }

  function bhumiPersilLoadGistaru(latlng, seq) {
    var host = bhumiPersilSheet && bhumiPersilSheet.querySelector('.catalog-popup-sheet-cards');
    if (!host) return;
    var node = document.createElement('div');
    node.className = 'bhumi-persil-gistaru';
    node.innerHTML = bhumiPersilLoadingCard('RDTR GISTARU ATR/BPN');
    host.insertBefore(node, host.firstChild);
    /* Fallback ditangani sendiri supaya kegagalannya TIDAK jatuh ke catch
       wilayah di bawah -- kalau jatuh, pengguna akan diberi tahu bahwa
       "wilayah tidak dapat ditentukan" padahal wilayahnya benar. */
    function tampilkanFallback(apiError) {
      return bhumiPersilLoadGistaruFallback(latlng).then(function (html) {
        if (seq !== bhumiPersilClickSeq || !node.isConnected) return;
        node.innerHTML = html;
      }).catch(function (fallbackError) {
        if (seq !== bhumiPersilClickSeq || !node.isConnected) return;
        node.innerHTML = bhumiPersilStatusCard('RDTR GISTARU ATR/BPN',
          'Data RDTR belum bisa dimuat. API Interaktif: ' + bhumiPersilJelaskanError(apiError) +
          '. Fallback zona: ' + bhumiPersilJelaskanError(fallbackError) + '.', true);
      });
    }
    bhumiPersilGistaruRegion(latlng).then(function (region) {
      /* API sudah ditolak 403 pada klik sebelumnya: langsung ke fallback
         supaya satu request jaringan yang hasilnya sudah diketahui tidak
         dibayar berulang-ulang. */
      if (Date.now() < bhumiPersilGistaruApiDitolakSampai) {
        var ditolak = new Error('HTTP 403');
        ditolak.dilewati = true;
        return tampilkanFallback(ditolak);
      }
      return bhumiPersilGistaruRequest('data', {
        id_wilayah: region.id,
        latitude: Number(latlng.lat).toFixed(7),
        longitude: Number(latlng.lng).toFixed(7)
      }).then(function (data) {
        var idRtr = data.id_rtr || data.idrtr;
        var activitiesPromise = idRtr
          ? bhumiPersilGistaruRequest('activities', { id_wilayah: region.id, id_rtr: idRtr }).catch(function () { return null; })
          : Promise.resolve(null);
        return activitiesPromise.then(function (activities) {
          if (seq !== bhumiPersilClickSeq || !node.isConnected) return;
          node.innerHTML = bhumiPersilGistaruCard(data, region.name, activities);
        });
      }).catch(function (apiError) {
        return tampilkanFallback(apiError);
      });
    }).catch(function (regionError) {
      if (seq !== bhumiPersilClickSeq || !node.isConnected) return;
      node.innerHTML = bhumiPersilStatusCard('RDTR GISTARU ATR/BPN',
        'Wilayah tidak dapat ditentukan dari koordinat klik: ' +
        bhumiPersilJelaskanError(regionError) + '.', true);
    });
  }

  function bhumiPersilOpenSheet(latlng, html, includeGistaru) {
    var sheet = bhumiPersilEnsureSheet();
    var lat = Number(latlng.lat).toFixed(6), lng = Number(latlng.lng).toFixed(6);
    var coords = lat + ', ' + lng;
    var mapsUrl = 'https://www.google.com/maps?q=' + encodeURIComponent(lat + ',' + lng);
    var card = document.createElement('div');
    card.className = 'catalog-popup-sheet-card bhumi-persil-detail-card';
    card.innerHTML = html +
      '<div class="bhumi-persil-coordinates"><div class="bhumi-persil-coord-value"><span>Koordinat titik</span><strong>' + bhumiPersilEsc(coords) + '</strong></div>' +
      '<div class="bhumi-persil-coord-actions"><button type="button" class="bhumi-persil-copy" data-coordinates="' + bhumiPersilEsc(coords) + '">Salin koordinat</button>' +
      '<a class="bhumi-persil-maps" href="' + mapsUrl + '" target="_blank" rel="noopener noreferrer">Lihat di Google Maps</a></div></div>';
    sheet.querySelector('.catalog-popup-sheet-cards').replaceChildren(card);
    if (includeGistaru) bhumiPersilLoadGistaru(latlng, bhumiPersilClickSeq);
    var retryButton = card.querySelector('.bhumi-persil-retry');
    if (retryButton) retryButton.addEventListener('click', function () {
      bhumiPersilIdentify({ latlng: latlng });
    });
    var copyButton = sheet.querySelector('.bhumi-persil-copy');
    copyButton.addEventListener('click', function () {
      var value = copyButton.getAttribute('data-coordinates');
      var copied = function () { copyButton.textContent = 'Tersalin'; window.setTimeout(function () { copyButton.textContent = 'Salin koordinat'; }, 1600); };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(value).then(copied).catch(function () { bhumiPersilCopyFallback(value, copied); });
      } else bhumiPersilCopyFallback(value, copied);
    });
    if (window.SheetDrag) {
      if (!window.SheetDrag.isOpen('catalog-popup')) window.SheetDrag.buka('catalog-popup');
      else if (window.SheetDrag.isMinimized('catalog-popup')) window.SheetDrag.restore('catalog-popup');
      if (sheet.__updateMinimizeIcon) sheet.__updateMinimizeIcon();
    } else sheet.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
    if (bhumiPersilMarker) map.removeLayer(bhumiPersilMarker);
    bhumiPersilMarker = L.marker(latlng, { keyboard: false, riseOnHover: true, title: 'Lokasi persil dipilih' }).addTo(map);
    window.clearTimeout(bhumiPersilCenterTimer);
    bhumiPersilCenterTimer = window.setTimeout(function () {
      if (!bhumiPersilSheet || !bhumiPersilSheet.classList.contains('is-open') ||
          (window.SheetDrag && window.SheetDrag.isMinimized('catalog-popup'))) return;
      if (typeof map.invalidateSize === 'function') map.invalidateSize({ pan: false });
      map.panTo(latlng, { animate: true, duration: 0.45 });
    }, 420);
    if (!catalogPopupAdRequested) {
      window.clearTimeout(catalogPopupAdTimer);
      catalogPopupAdTimer = window.setTimeout(function () {
        if (!sheet.classList.contains('is-open') || sheet.classList.contains('is-minimized')) return;
        catalogPopupAdRequested = true;
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); }
        catch (error) {
          catalogPopupAdRequested = false;
          if (window.console && console.warn) console.warn('[AdSense] Slot detail layer gagal dimuat:', error);
        }
      }, 550);
    }
    return sheet;
  }

  function bhumiPersilCopyFallback(value, onSuccess) {
    var input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed'; input.style.opacity = '0';
    document.body.appendChild(input); input.select();
    try { if (document.execCommand('copy')) onSuccess(); } catch (e) { /* salin tidak didukung */ }
    document.body.removeChild(input);
  }

  function bhumiPersilCloseSheet() {
    window.clearTimeout(bhumiPersilCenterTimer);
    bhumiPersilCenterTimer = 0;
    if (!bhumiPersilSheet || !bhumiPersilSheet.querySelector('.bhumi-persil-detail-card')) return;
    if (window.SheetDrag && window.SheetDrag.isOpen('catalog-popup')) window.SheetDrag.close('catalog-popup');
    else bhumiPersilSheet.classList.remove('is-open');
    bhumiPersilSheet.setAttribute('aria-hidden', 'true');
    var content = bhumiPersilSheet.querySelector('.catalog-popup-sheet-cards');
    if (content) content.innerHTML = '';
  }

  function bhumiPersilCard(title, subtitle, fields) {
    var rows = '';
    fields.forEach(function (pair) {
      if (pair[1] == null || pair[1] === '') return;
      rows += '<tr><th scope="row">' + bhumiPersilEsc(pair[0]) + '</th><td>' + bhumiPersilEsc(pair[1]) + '</td></tr>';
    });
    if (!rows) rows = '<tr><th scope="row">Atribut</th><td>-</td></tr>';
    return '<div class="agol-popup"><div class="agol-popup-header agol-geo-persil">' +
      '<div class="agol-popup-title">' + bhumiPersilEsc(title) + '</div>' +
      '<div class="agol-popup-subtitle">' + bhumiPersilEsc(subtitle) + '</div></div>' +
      '<div class="agol-popup-body"><table class="bhumi-persil-data-table"><tbody>' + rows + '</tbody></table></div>' +
      '<div class="agol-popup-footer"><span>Sumber: ATR/BPN \u2014 BHUMI</span></div></div>';
  }

  function bhumiPersilFeatureCard(f, index, total) {
    var p = f.properties || {};
    var subtitle = total > 1 ? ('Persil ' + (index + 1) + ' dari ' + total) : 'Batas persil';
    return bhumiPersilCard(p.tipehak || 'Data Persil', subtitle, [
      ['Jenis Hak', p.tipehak],
      ['Luas', (p.luas != null && p.luas !== '') ? Number(p.luas).toLocaleString('id-ID') + ' m\u00B2' : ''],
      ['NIB', p.nib],
      ['Akurasi Bidang', p.akurasibidang]
    ]);
  }

  function bhumiPersilZntCard(f, index, total) {
    var p = f.properties || {};
    var subtitle = total > 1 ? ('Zona ' + (index + 1) + ' dari ' + total) :
      (p.NOMORZONE != null && p.NOMORZONE !== '' ? ('Zona ' + p.NOMORZONE) : 'Zona nilai tanah');
    return bhumiPersilCard('Zona Nilai Tanah', subtitle, [
      ['Nama Kantor', p.NAMAKANTOR],
      ['Nomor Zone', p.NOMORZONE],
      ['Tahun Dibuat', p.TAHUNDIBUAT],
      ['Range Nilai', p.RANGENILAI],
      ['Kelas Nilai', p.KELASNILAI]
    ]);
  }

  function bhumiPersilNbtCard(f, index, total) {
    var p = f.properties || {};
    var subtitle = total > 1 ? ('Bidang ' + (index + 1) + ' dari ' + total) :
      (p.kelurahan || p.kecamatan || 'Nilai bidang tanah');
    return bhumiPersilCard('Peta Nilai Bidang Tanah', subtitle, [
      ['Kecamatan', p.kecamatan],
      ['Kelurahan', p.kelurahan],
      ['Tipe Hak', p.tipehak],
      ['Zonasi', p.zonasi],
      ['Luas Bidang', (p.luasbidang != null && p.luasbidang !== '') ?
        Number(p.luasbidang).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' m\u00B2' : '']
    ]);
  }

  function bhumiPersilTopoCard(f, index, total) {
    var p = f.properties || {};
    var tanggal = p.TANGGALSISIP ? String(p.TANGGALSISIP).slice(0, 10) : '';
    var subtitle = total > 1 ? ('Toponim ' + (index + 1) + ' dari ' + total) :
      (p.UNSUR || 'Toponim');
    return bhumiPersilCard(p.NAMA || 'Toponim', subtitle, [
      ['Unsur', p.UNSUR],
      ['Alamat', p.ALAMAT],
      ['Tanggal Data', tanggal]
    ]);
  }

  function bhumiPersilQueryLayer(layerName, payload) {
    var body = Object.assign({}, payload, { service_layer_name: layerName, query_layers: layerName });
    return bhumiPersilGetToken()
      .then(function (token) {
        return bhumiPersilProxyPost('/expapi/getPersil', body, token, true)
          .then(function (out) {
            if (out.res.status !== 401) return out;
            bhumiPersilToken.value = null;
            return bhumiPersilGetToken().then(function (t2) {
              return bhumiPersilProxyPost('/expapi/getPersil', body, t2, true);
            });
          });
      })
      .then(function (out) {
        var r = out.res || out;
        var privKey = out.privKey || null;
        if (!r.ok) {
          return r.text().then(function (text) {
            var detail = bhumiPersilSafeDiagnostic(text);
            throw new Error('BHUMI_GETPERSIL_HTTP_' + r.status +
              (r.headers.get('X-Proxy-Status') ? ' (proxy upstream ' + r.headers.get('X-Proxy-Status') + ')' : '') +
              (detail ? '\n' + detail : '\n(respons kosong)'));
          });
        }
        return r.text().then(function (text) {
          var json;
          try { json = JSON.parse(text); }
          catch (e) { throw new Error('BHUMI_GETPERSIL_JSON_INVALID: ' + bhumiPersilSafeDiagnostic(text)); }
          return bhumiPersilParseResponse(json, privKey).then(function (fc) {
            if (!fc) {
              var diagnostics = json.__decryptDiagnostics || { responseKeys: Object.keys(json || {}) };
              throw new Error('BHUMI_DECRYPT_FAILED: respons sukses diterima, tetapi payload terenkripsi tidak dapat didekripsi menjadi FeatureCollection.\nMetadata respons (tanpa ciphertext/token):\n' + JSON.stringify(diagnostics, null, 2));
            }
            return fc;
          });
        });
      });
  }

  function bhumiPersilTematikCard(label, f, index, total) {
    var p = f.properties || {};
    var keys = Object.keys(p);
    var priority = ['NAMA', 'nama', 'NAME', 'name', 'NAMAKANTOR', 'kecamatan', 'KECAMATAN',
      'kelurahan', 'KELURAHAN', 'desa', 'DESA', 'LUAS', 'luas', 'tipehak', 'TIPEHAK'];
    var title = '';
    for (var pi = 0; pi < priority.length && !title; pi++) {
      if (p[priority[pi]] != null && p[priority[pi]] !== '') title = String(p[priority[pi]]);
    }
    var subtitle = total > 1
      ? (label + ' \u2014 ' + (index + 1) + ' dari ' + total)
      : (title ? label : 'Layer tematik BHUMI');
    var ordered = [];
    priority.forEach(function (k) { if (keys.indexOf(k) >= 0) ordered.push(k); });
    keys.forEach(function (k) { if (ordered.indexOf(k) < 0) ordered.push(k); });
    var fields = [];
    ordered.slice(0, 12).forEach(function (k) {
      var v = p[k];
      if (v && typeof v === 'object') { try { v = JSON.stringify(v); } catch (e) { v = ''; } }
      fields.push([k.replace(/_/g, ' '), v]);
    });
    return bhumiPersilCard(title || label, subtitle, fields);
  }

  function bhumiPersilCardBuilder(layer) {
    if (layer === 'umum:Persil') return bhumiPersilFeatureCard;
    if (layer === 'umum:ZNTRANGE') return bhumiPersilZntCard;
    if (layer === 'umum:nbt3') return bhumiPersilNbtCard;
    if (layer === 'umum:toponimi') return bhumiPersilTopoCard;
    var label = layer;
    BHUMI_IDENTIFY_TEMPLAYERS.forEach(function (t) { if (t.layer === layer) label = t.label; });
    return function (f, i, n) { return bhumiPersilTematikCard(label, f, i, n); };
  }

  function bhumiPersilRenderResult(latlng, layers, results) {
    bhumiPersilClearMapSelection();
    var groups = layers.map(function (layer, i) {
      var r = results[i];
      var fc = (r && r.ok) ? r.fc : null;
      return { feats: (fc && fc.features) ? fc.features : [], card: bhumiPersilCardBuilder(layer) };
    });
    if (!groups.some(function (g) { return g.feats.length; })) {
      bhumiPersilOpenSheet(latlng, bhumiPersilStatusCard('Data Pertanahan',
        'Tidak ada data persil atau layer terpilih di titik ini.'), true);
      return;
    }
    var group = L.featureGroup();
    groups.forEach(function (g) {
      g.feats.forEach(function (f) {
        if (f.bbox && f.bbox.coordinates) {
          try {
            var rings = f.bbox.coordinates.map(function (ring) {
              return ring.map(function (p) { return [p[1], p[0]]; });
            });
            L.polygon(rings, { color: '#FFAA00', weight: 2, fill: false, dashArray: '4 3' }).addTo(group);
          } catch (err) { /* bbox tidak valid: abaikan, kartu tetap tampil */ }
        }
      });
    });
    group.addTo(map);
    bhumiPersilHighlight = group;
    var parts = [];
    groups.forEach(function (g) {
      g.feats.forEach(function (f, i) { parts.push(g.card(f, i, g.feats.length)); });
    });
    var cards = parts.join('');
    if (parts.length > 1) cards = '<div class="bhumi-persil-list">' + cards + '</div>';
    bhumiPersilOpenSheet(latlng, cards, true);
  }

  function bhumiPersilIdentify(e, force) {
    if (!e.latlng) return;
    if (e.__bhumiPersilIdentifyHandled) return;
    if (!force && (!bhumiPersilNasionalLayer || !map.hasLayer(bhumiPersilNasionalLayer))) return;
    e.__bhumiPersilIdentifyHandled = true;
    var seq = ++bhumiPersilClickSeq;
    var size = map.getSize();
    var pt = map.latLngToContainerPoint(e.latlng);
    var vb = map.getBounds();
    var payload = {
      width: size.x,
      height: size.y,
      bbox: vb.getWest() + ',' + vb.getSouth() + ',' + vb.getEast() + ',' + vb.getNorth(),
      x: Math.round(pt.x),
      y: Math.round(pt.y),
      url: '/expapi/getPersil',
      service: '/bhumigs/umum'
    };
    bhumiPersilOpenSheet(e.latlng, bhumiPersilLoadingCard('Data Pertanahan'));
    var settled = function (p) {
      return p.then(function (fc) { return { ok: true, fc: fc }; },
        function (err) {
          var detail = (err && err.message) || String(err || 'Kesalahan tidak diketahui');
          console.error('[BHUMI] Identifikasi klik gagal', { error: detail });
          return { ok: false, err: detail };
        });
    };
    /* Permintaan 2026-10-22: hasil identifikasi hanya Persil + Zona Nilai
       Tanah, apa pun pilihan layer tematik di katalog. */
    var queryLayers = ['umum:Persil', 'umum:ZNTRANGE'];
    Promise.all(queryLayers.map(function (layer) {
      /* Persil/ZNT adalah data padat: pakai piksel klik yang presisi. */
      return settled(bhumiPersilQueryLayer(layer, payload));
    }))
      .then(function (res) {
        if (seq !== bhumiPersilClickSeq) return;
        if (!res.some(function (r) { return r.ok; })) {
          var errors = res.map(function (r) { return r.err || ''; }).filter(Boolean);
          var detail = errors.length ? errors.join('\n\n') : 'Permintaan tidak berhasil.';
          var loginFailure = /BHUMI_LOGIN_|token tidak tersedia/i.test(detail);
          var loginStatus = detail.match(/BHUMI_LOGIN_HTTP_(\d{3})/);
          var upstreamUnavailable = /BHUMI_LOGIN_HTTP_530|error code:\s*1016/i.test(detail);
          var title = upstreamUnavailable ? 'Layanan Data Pertanahan Tidak Tersedia' :
            loginFailure ? 'Autentikasi BHUMI Gagal' : 'Gagal Memuat Data Pertanahan';
          var message = upstreamUnavailable
            ? 'Layanan data pertanahan sedang tidak tersedia. Silakan coba lagi beberapa saat.'
            : loginStatus && loginStatus[1] === '401'
              ? 'Autentikasi data pertanahan gagal. Silakan coba ulangi permintaan.'
              : loginFailure
                ? 'Sesi autentikasi data pertanahan belum dapat digunakan. Silakan coba ulangi permintaan.'
                : 'Data pertanahan belum berhasil dimuat. Silakan coba ulangi permintaan.';
          bhumiPersilOpenSheet(e.latlng, bhumiPersilStatusCard(
            title, message, true), true);
          return;
        }
        bhumiPersilRenderResult(e.latlng, queryLayers, res);
      })
      .catch(function () {
        if (seq !== bhumiPersilClickSeq) return;
        bhumiPersilOpenSheet(e.latlng, bhumiPersilStatusCard('Gagal Memuat',
          'Data pertanahan belum berhasil dimuat. Silakan coba lagi.', true), true);
      });
  }
  map.on('click', bhumiPersilIdentify);
  window.identifyBhumiPersilAt = function (event) {
    if (event && event.latlng) bhumiPersilIdentify(event, true);
  };

  /* ── Heatmap Sebaran Transaksi Jual Beli Tanah 2023 (BHUMI) ──
     GeoJSON dari /expapi/get-sebarantransaksi lewat proxy. Endpoint
     merespons 200; jumlah fitur mengikuti data yang tersedia di BHUMI. */
  var bhumiHeatmapLayer = null;
  window.toggleBhumiHeatmap = function (on) {
    if (on) {
      if (bhumiHeatmapLayer) {
        if (!map.hasLayer(bhumiHeatmapLayer)) bhumiHeatmapLayer.addTo(map);
        return;
      }
      var url = BHUMI_PERSIL_NASIONAL_PROXY +
        encodeURIComponent('https://bhumi.atrbpn.go.id/expapi/get-sebarantransaksi');
      fetch(url)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (fc) {
          if (!fc || !fc.features || !fc.features.length) return;
          if (_layerCatalogState['bhumi-heatmap-transaksi'] !== true) return;
          if (bhumiHeatmapLayer) return;
          bhumiHeatmapLayer = L.geoJSON(fc, {
            pointToLayer: function (feature, latlng) {
              return L.circleMarker(latlng, {
                radius: 5, color: '#e11d48', weight: 1,
                fillColor: '#f43f5e', fillOpacity: 0.55
              });
            },
            style: function () {
              return { color: '#e11d48', weight: 1, fillColor: '#f43f5e', fillOpacity: 0.35 };
            }
          }).addTo(map);
        })
        .catch(function () { /* diamkan: layer hanya tampil bila data ada */ });
    } else if (bhumiHeatmapLayer && map.hasLayer(bhumiHeatmapLayer)) {
      map.removeLayer(bhumiHeatmapLayer);
    }
  };

  /* ── Lahan Sawah Dilindungi (GISLINER / ATR-BPN) ──
   * Tile PNG biner, format XYZ, sudah mengizinkan CORS sehingga tidak
   * perlu proxy. Legenda memakai warna yang diambil dari sampling tile
   * (rgb 135,207,21) supaya titik legenda cocok dengan isi peta. */
  function showSawahLegend() {
    if (legendSawahShown) return;
    if (typeof addUnifiedLegend !== 'function') return;

    var div = L.DomUtil.create('div', 'atrbpn-legend');
    L.DomEvent.disableClickPropagation(div);

    div.innerHTML =
      '<div class="atrbpn-legend-title">Legenda Lahan Sawah</div>' +
      '<div class="atrbpn-legend-items">' +
        '<div class="atrbpn-legend-item">' +
          '<span class="atrbpn-legend-dot" style="background:' + SAWAH_COLOR + ';"></span>' +
          '<span>Lahan sawah dilindungi</span>' +
        '</div>' +
      '</div>' +
      '<div class="atrbpn-legend-source">Sumber: ATR/BPN - GISLINER</div>';

    addUnifiedLegend('atrbpn-sawah', typeof createLegendWithToggle === 'function' ? createLegendWithToggle(div) : div);
    legendSawahShown = true;
  }

  function hideSawahLegend() {
    if (typeof removeUnifiedLegend !== 'function') return;
    removeUnifiedLegend('atrbpn-sawah');
    legendSawahShown = false;
  }

  function toggleSawahGislinerLayer(show) {
    if (show) {
      if (sawahLayer && map.hasLayer(sawahLayer)) return;
      /* bounds: Leaflet 1.9.4 (_isValidTile) melewati tile yang tidak
       * beririsan dengan bounds, jadi tidak ada request ke luar Jawa.
       * Sengaja TIDAK memanggil setView/flyTo -- pengguna yang memilih
       * sendiri sampai ke Jawa, supaya posisi peta tidak hilang. */
      sawahLayer = L.tileLayer(SAWAH_TILE_URL, {
        bounds: SAWAH_BOUNDS,
        minZoom: 8,
        maxZoom: 19,
        maxNativeZoom: 19,
        attribution: 'ATR/BPN - GISLINER'
      });
      sawahLayer.addTo(map);
      showSawahLegend();
    } else {
      if (sawahLayer && map.hasLayer(sawahLayer)) map.removeLayer(sawahLayer);
      sawahLayer = null;
      hideSawahLegend();
    }
  }
  window.toggleSawahGislinerLayer = toggleSawahGislinerLayer;
  window.isSawahGislinerLayerActive = function () {
    return !!(sawahLayer && map.hasLayer(sawahLayer));
  };

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
    function (url) { return 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=' + encodeURIComponent(url); }
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
          '<div class="fsva-legend-source">Sumber: Peta Ketahanan dan Kerentanan Pangan 2025 — Badan Pangan Nasional</div>';
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
      '<div class="fsva-legend-source">Sumber: Peta Ketahanan dan Kerentanan Pangan 2025 — Badan Pangan Nasional</div>';
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
    html += '<div class="fsva-popup-footer"><span>Sumber: Peta Ketahanan dan Kerentanan Pangan 2025 — Badan Pangan Nasional</span></div>';
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

  /* ── SIGAP WMS overlay layers ── */
  var SIGAP_WMS_URL = 'https://sigap.kehutanan.go.id/sigap-forge-geoserver-2026/sigap/wms';
  var sigapEsc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };

  /* Semua popup SIGAP memakai template .agol-popup yang sama dengan layer
     lain di panel Detail Layer: header badge/judul, body berisi baris atribut,
     lalu footer sumber. */
  function sigapPopupHtml(layerName, bodyHtml, footerText) {
    var title = String(layerName || '').split(':')[1] || layerName || 'SIGAP';
    return '<div class="agol-popup">'
      + '<div class="agol-popup-header agol-geo-kawasan">'
      + '<div class="agol-popup-badge"><span class="agol-popup-badge-dot" style="background:#86efac;"></span>SIGAP</div>'
      + '<div class="agol-popup-title">' + sigapEsc(title) + '</div>'
      + '</div>'
      + '<div class="agol-popup-body">' + bodyHtml + '</div>'
      + '<div class="agol-popup-footer"><span>' + sigapEsc(footerText) + '</span></div>'
      + '</div>';
  }

  function sigapStatusPopupHtml(layerName, statusText, footerText) {
    return sigapPopupHtml(layerName,
      '<div class="agol-popup-fields"><div class="agol-popup-field">'
      + '<span class="agol-popup-field-label">Status</span>'
      + '<span class="agol-popup-field-value">' + sigapEsc(statusText) + '</span>'
      + '</div></div>',
      footerText || 'Sumber: KLHK SIGAP');
  }

  function sigapGetFeatureInfo(layerName, e) {
    var b = map.getBounds();
    var nw = map.project(b.getNorthWest(), map.getZoom());
    var se = map.project(b.getSouthEast(), map.getZoom());
    var infoUrl = SIGAP_WMS_URL + '?' + L.Util.getParamString({
      service: 'WMS',
      version: '1.3.0',
      request: 'GetFeatureInfo',
      layers: layerName,
      query_layers: layerName,
      info_format: 'application/json',
      x: Math.floor(e.containerPoint.x),
      y: Math.floor(e.containerPoint.y),
      width: map.getSize().x,
      height: map.getSize().y,
      crs: 'EPSG:3857',
      bbox: nw.x + ',' + se.y + ',' + se.x + ',' + nw.y
    });
    fetch(infoUrl)
      .then(function(r) {
        if (r.status === 401 || r.status === 403) {
          L.popup({ maxWidth: 320, className: 'sigap-leaflet-popup' })
            .setLatLng(e.latlng)
            .setContent(sigapStatusPopupHtml(layerName, 'Memerlukan autentikasi', 'Data memerlukan autentikasi dari server KLHK SIGAP.'))
            .openOn(map);
          return null;
        }
        return r.json();
      })
      .then(function(data) {
        if (!data) return;
        if (data.features && data.features.length > 0) {
          var props = data.features[0].properties || {};
          var rows = '';
          for (var k in props) {
            if (props[k] != null && props[k] !== '') {
              rows += '<div class="agol-popup-field"><span class="agol-popup-field-label">' + sigapEsc(k)
                + '</span><span class="agol-popup-field-value">' + sigapEsc(String(props[k])) + '</span></div>';
            }
          }
          var html = sigapPopupHtml(layerName,
            '<div class="agol-popup-fields">'
            + (rows || '<div class="agol-popup-field"><span class="agol-popup-field-value">Tidak ada atribut.</span></div>')
            + '</div>',
            'Sumber: KLHK SIGAP');
          L.popup({ maxWidth: 320, className: 'sigap-leaflet-popup' })
            .setLatLng(e.latlng)
            .setContent(html)
            .openOn(map);
        } else {
          L.popup({ maxWidth: 320, className: 'sigap-leaflet-popup' })
            .setLatLng(e.latlng)
            .setContent(sigapStatusPopupHtml(layerName, 'Tidak ada data', 'Tidak ada fitur pada lokasi ini.'))
            .openOn(map);
        }
      })
      .catch(function(err) {
        console.warn('[SIGAP] GetFeatureInfo gagal:', err.message);
        L.popup({ maxWidth: 320, className: 'sigap-leaflet-popup' })
          .setLatLng(e.latlng)
          .setContent(sigapStatusPopupHtml(layerName, 'Gagal memuat', 'Gagal memuat data fitur.'))
          .openOn(map);
      });
  }

  function sigapAttachClickHandler(layer, layerName) {
    layer._sigapClickHandler = function (e) {
      if (!map.hasLayer(layer)) return;
      sigapGetFeatureInfo(layerName, e);
    };
    layer._sigapContainerClickHandler = function (event) {
      if (!map.hasLayer(layer)) return;
      if (event.target.closest('.leaflet-control')) return;
      try {
        layer._sigapClickHandler({
          latlng: map.mouseEventToLatLng(event),
          containerPoint: map.mouseEventToContainerPoint(event)
        });
      } catch (err) {}
    };
    map.getContainer().addEventListener('click', layer._sigapContainerClickHandler, true);
  }

  function sigapDetachClickHandler(layer) {
    if (layer && layer._sigapContainerClickHandler) {
      map.getContainer().removeEventListener('click', layer._sigapContainerClickHandler, true);
    }
  }

  /* ── SIGAP WMS overlay layers (registry-driven) ──
     Setiap entri katalog "sigap-*" dipetakan ke satu nama layer WMS
     lewat SIGAP_LAYER_REGISTRY. Legenda diambil dari GetLegendGraphic
     sehingga symbology selalu mengikuti server SIGAP. */
  var SIGAP_LAYER_REGISTRY = {
    'sigap-kawasan-hutan': { wms: 'sigap:kwshutan_ar_250k_jun2026', title: 'Kawasan Hutan (SIGAP 250K)', sub: 'Kawasan Hutan' },
    'sigap-khg-ar-250k': { wms: 'sigap:khg_ar_250k', title: 'KHG 250K', sub: 'Kawasan Hutan' },
    'sigap-khg-ar-50k': { wms: 'sigap:khg_ar_50k', title: 'KHG 50K', sub: 'Kawasan Hutan' },
    'sigap-khkp-ar-50k': { wms: 'sigap:khkp_ar_50k_iden', title: 'KHKP 50K', sub: 'Kawasan Hutan' },
    'sigap-khdtk-ar-50k-112024': { wms: 'sigap:khdtk_ar_50k_112024', title: 'KHDTK 50K 11/2024', sub: 'Kawasan Hutan' },
    'sigap-khdpk-ar-50k-122025': { wms: 'sigap:khdpk_ar_50k_122025_iden', title: 'KHDPK 50K 12/2025', sub: 'Kawasan Hutan' },
    'sigap-kphk-ar-250k-102025': { wms: 'sigap:kphk_ar_250k_102025_iden', title: 'KPHK 250K 10/2025', sub: 'Kawasan Hutan' },
    'sigap-kphp-kphl-ar-250k-0925': { wms: 'sigap:kphp_kphl_ar_250k_0925', title: 'KPHP KPHL 250K 09/2025', sub: 'Kawasan Hutan' },
    'sigap-blok-kk-ar-50k': { wms: 'sigap:blok_kk_ar_50k_iden', title: 'Blok KK 50K', sub: 'Kawasan Hutan' },
    'sigap-daerah-penyangga-kk-ar-50k': { wms: 'sigap:daerah_penyangga_kk_ar_50k', title: 'Daerah Penyangga KK 50K', sub: 'Kawasan Hutan' },
    'sigap-profil-kk-ar-50k': { wms: 'sigap:profil_kk_ar_50k', title: 'Profil KK 50K', sub: 'Kawasan Hutan' },
    'sigap-pkk-ar-50k-122025': { wms: 'sigap:pkk_ar_50k_122025', title: 'PKK 50K 12/2025', sub: 'Kawasan Hutan' },
    'sigap-pkk-ar-50k': { wms: 'sigap:pkk_ar_50k_iden', title: 'PKK 50K', sub: 'Kawasan Hutan' },
    'sigap-tata-hutan-kph-ar-50k': { wms: 'sigap:tata_hutan_kph_ar_50k_iden', title: 'Tata Hutan KPH 50K', sub: 'Kawasan Hutan' },
    'sigap-potensihutan-ar-250k': { wms: 'sigap:potensihutan_ar_250k', title: 'Potensihutan 250K', sub: 'Kawasan Hutan' },
    'sigap-feg-ar-250k': { wms: 'sigap:feg_ar_250k', title: 'FEG 250K', sub: 'Kawasan Hutan' },
    'sigap-feg-ar-50k-24': { wms: 'sigap:feg_ar_50k_24', title: 'FEG 50K 2024', sub: 'Kawasan Hutan' },
    'sigap-pntpnkwshutan-ar-50k-072024': { wms: 'sigap:pntpnkwshutan_ar_50k_072024', title: 'PNTPNKWSHUTAN 50K 07/2024', sub: 'Kawasan Hutan' },
    'sigap-rpkhdpk-ar-50k-122025': { wms: 'sigap:rpkhdpk_ar_50k_122025_iden', title: 'RPKHDPK 50K 12/2025', sub: 'Kawasan Hutan' },
    'sigap-rpkhdpk-ar-50k': { wms: 'sigap:rpkhdpk_ar_50k_iden', title: 'RPKHDPK 50K', sub: 'Kawasan Hutan' },
    'sigap-pl-2025': { wms: 'sigap:pl2025_ar_50k', title: 'Areal Penggunaan Lain (SIGAP 50K 2025)', sub: 'Penggunaan Lahan (PL)' },
    'sigap-pl2018-ar-250k': { wms: 'sigap:pl2018_ar_250k_iden', title: 'Penggunaan Lahan 2018 250K', sub: 'Penggunaan Lahan (PL)' },
    'sigap-pl2024-ar-250k': { wms: 'sigap:pl2024_ar_250k', title: 'Penggunaan Lahan 2024 250K', sub: 'Penggunaan Lahan (PL)' },
    'sigap-pl2024-ar-50k': { wms: 'sigap:pl2024_ar_50k', title: 'Penggunaan Lahan 2024 50K', sub: 'Penggunaan Lahan (PL)' },
    'sigap-plskwshutan-ar-50k': { wms: 'sigap:plskwshutan_ar_50k_iden', title: 'PLSKWSHUTAN 50K', sub: 'Penggunaan Lahan (PL)' },
    'sigap-paph-ar-250k-0825': { wms: 'sigap:paph_ar_250k_0825_iden', title: 'PAPH 250K 08/2025', sub: 'Perizinan & Pemanfaatan Hutan' },
    'sigap-ph2024-ar-250k': { wms: 'sigap:ph2024_ar_250k_iden', title: 'PH2024 250K', sub: 'Perizinan & Pemanfaatan Hutan' },
    'sigap-pkspkh-ar-50k-0525': { wms: 'sigap:pkspkh_ar_50k_0525', title: 'PKSPKH 50K 05/2025', sub: 'Perizinan & Pemanfaatan Hutan' },
    'sigap-pphd-ar-50k-122025': { wms: 'sigap:pphd_ar_50k_122025', title: 'PPHD 50K 12/2025', sub: 'Perizinan & Pemanfaatan Hutan' },
    'sigap-pphd-ar-50k': { wms: 'sigap:pphd_ar_50k_iden', title: 'PPHD 50K', sub: 'Perizinan & Pemanfaatan Hutan' },
    'sigap-pphkm-ar-50k-122025': { wms: 'sigap:pphkm_ar_50k_122025', title: 'PPHKM 50K 12/2025', sub: 'Perizinan & Pemanfaatan Hutan' },
    'sigap-pphkm-ar-50k': { wms: 'sigap:pphkm_ar_50k_iden', title: 'PPHKM 50K', sub: 'Perizinan & Pemanfaatan Hutan' },
    'sigap-pphtr-ar-50k-122025': { wms: 'sigap:pphtr_ar_50k_122025', title: 'PPHTR 50K 12/2025', sub: 'Perizinan & Pemanfaatan Hutan' },
    'sigap-pphtr-ar-50k': { wms: 'sigap:pphtr_ar_50k_iden', title: 'PPHTR 50K', sub: 'Perizinan & Pemanfaatan Hutan' },
    'sigap-ppkh-ar-50k-0525': { wms: 'sigap:ppkh_ar_50k_0525', title: 'PPKH 50K 05/2025', sub: 'Perizinan & Pemanfaatan Hutan' },
    'sigap-ppkh-ar-50k-jan2026': { wms: 'sigap:ppkh_ar_50k_jan2026_iden', title: 'PPKH 50K Januari 2026', sub: 'Perizinan & Pemanfaatan Hutan' },
    'sigap-ppkh-eksplorasi-ar-50k-0525': { wms: 'sigap:ppkh_eksplorasi_ar_50k_0525', title: 'PPKH Eksplorasi 50K 05/2025', sub: 'Perizinan & Pemanfaatan Hutan' },
    'sigap-ppkh-eksplorasi-ar-50k-jan2026': { wms: 'sigap:ppkh_eksplorasi_ar_50k_jan2026_iden', title: 'PPKH Eksplorasi 50K Januari 2026', sub: 'Perizinan & Pemanfaatan Hutan' },
    'sigap-ppkspkh-ar-50k-052025': { wms: 'sigap:ppkspkh_ar_50k_052025', title: 'PPKSPKH 50K 05/2025', sub: 'Perizinan & Pemanfaatan Hutan' },
    'sigap-pptpkh-ar-250k': { wms: 'sigap:pptpkh_ar_250k', title: 'PPTPKH 250K', sub: 'Perizinan & Pemanfaatan Hutan' },
    'sigap-pptpkh-ar-250k-rev-iv': { wms: 'sigap:pptpkh_ar_250k_rev_iv_iden', title: 'PPTPKH 250K Revisi IV', sub: 'Perizinan & Pemanfaatan Hutan' },
    'sigap-hutan-adat-50k-092025': { wms: 'sigap:hutan_adat_50k_092025', title: 'Hutan Adat 50K 09/2025', sub: 'Hutan Sosial' },
    'sigap-hutan-adat-ar-50k-012026': { wms: 'sigap:hutan_adat_ar_50k_012026_iden', title: 'Hutan Adat 50K 01/2026', sub: 'Hutan Sosial' },
    'sigap-hutan-hak-ar-50k-092025': { wms: 'sigap:hutan_hak_ar_50k_092025', title: 'Hutan Hak 50K 09/2025', sub: 'Hutan Sosial' },
    'sigap-hutan-penelitian-ar-250k': { wms: 'sigap:hutan_penelitian_ar_250k', title: 'Hutan Penelitian 250K', sub: 'Hutan Sosial' },
    'sigap-pbph-ar-50k-0924': { wms: 'sigap:pbph_ar_50k_0924', title: 'PBPH 50K 09/2024', sub: 'Hutan Sosial' },
    'sigap-tbpbph-ln-50k': { wms: 'sigap:tbpbph_ln_50k', title: 'TBPBPH 50K', sub: 'Hutan Sosial' },
    'sigap-kba-ar-250k': { wms: 'sigap:kba_ar_250k', title: 'KBA 250K', sub: 'Konservasi & Biodiversitas' },
    'sigap-kee-ar-50k': { wms: 'sigap:kee_ar_50k', title: 'KEE 50K', sub: 'Konservasi & Biodiversitas' },
    'sigap-kee-indikatif-ar-250k': { wms: 'sigap:kee_indikatif_ar_250k', title: 'KEE Indikatif 250K', sub: 'Konservasi & Biodiversitas' },
    'sigap-kemitraan-konservasi-kk-ar-50k': { wms: 'sigap:kemitraan_konservasi_kk_ar_50k', title: 'Kemitraan Konservasi KK 50K', sub: 'Konservasi & Biodiversitas' },
    'sigap-konflik-satwa-dan-manusia-pnt-50k': { wms: 'sigap:konflik_satwa_dan_manusia_pnt_50k', title: 'Konflik Satwa Dan Manusia Titik 50K', sub: 'Konservasi & Biodiversitas' },
    'sigap-kva-ar-250k': { wms: 'sigap:kva_ar_250k', title: 'KVA 250K', sub: 'Konservasi & Biodiversitas' },
    'sigap-zona-tn-ar-50k': { wms: 'sigap:zona_tn_ar_50k_iden', title: 'Zona TN 50K', sub: 'Konservasi & Biodiversitas' },
    'sigap-mangrove-ar-25k-24': { wms: 'sigap:mangrove_ar_25k_24', title: 'Mangrove 25K 2024', sub: 'Vegetasi & Reforestasi' },
    'sigap-perjumpaan-tumbuhan-alam-pada-kk-pnt-50k-2025': { wms: 'sigap:perjumpaan_tumbuhan_alam_pada_kk_pnt_50k_2025', title: 'Perjumpaan Tumbuhan Alam Pada KK Titik 50K 2025', sub: 'Vegetasi & Reforestasi' },
    'sigap-persemaian-permanen-pnt-250k': { wms: 'sigap:persemaian_permanen_pnt_250k', title: 'Persemaian Permanen Titik 250K', sub: 'Vegetasi & Reforestasi' },
    'sigap-rhl-2019-ar-10k': { wms: 'sigap:rhl_2019_ar_10k_iden', title: 'RHL 2019 10K', sub: 'Vegetasi & Reforestasi' },
    'sigap-rurhl-ar-50k': { wms: 'sigap:rurhl_ar_50k', title: 'RURHL 50K', sub: 'Vegetasi & Reforestasi' },
    'sigap-sumber-benih-pnt-250k': { wms: 'sigap:sumber_benih_pnt_250k', title: 'Sumber Benih Titik 250K', sub: 'Vegetasi & Reforestasi' },
    'sigap-zona-benih-ar-250k': { wms: 'sigap:zona_benih_ar_250k', title: 'Zona Benih 250K', sub: 'Vegetasi & Reforestasi' },
    'sigap-rawan-karhutla-ar-250k-2025': { wms: 'sigap:rawan_karhutla_ar_250k_2025', title: 'Rawan Karhutla 250K 2025', sub: 'Kebakaran Hutan' },
    'sigap-areal-karhutla-januari-maret-2026-ar-250k': { wms: 'sigap:areal_karhutla_januari_maret_2026_ar_250k', title: 'Areal Karhutla Januari-Maret 2026 250K', sub: 'Kebakaran Hutan' },
    'sigap-areal-karhutla-januari-mei-2026-ar-50k': { wms: 'sigap:areal_karhutla_januari_mei_2026_ar_50k_iden', title: 'Areal Karhutla Januari-Mei 2026 50K', sub: 'Kebakaran Hutan' },
    'sigap-sebaran-hotspot-januari-desember-2025-pnt-250k': { wms: 'sigap:sebaran_hotspot_januari_desember_2025_pnt_250k_iden', title: 'Sebaran Hotspot Januari-Desember 2025 Titik 250K', sub: 'Kebakaran Hutan' },
    'sigap-arahan-folu-2030-ar-250k': { wms: 'sigap:arahan_folu_2030_ar_250k', title: 'Arahan FOLU 2030 250K', sub: 'FOLU, REDD+ & Emisi' },
    'sigap-renja-folu-2030-ar-250k-051224': { wms: 'sigap:renja_folu_2030_ar_250k_051224_iden', title: 'Renja FOLU 2030 250K 05/12/2024', sub: 'FOLU, REDD+ & Emisi' },
    'sigap-redd-ar-250k': { wms: 'sigap:redd_ar_250k', title: 'REDD 250K', sub: 'FOLU, REDD+ & Emisi' },
    'sigap-beban-emisi-ar-250k-2022': { wms: 'sigap:beban_emisi_ar_250k_2022', title: 'Beban Emisi 250K 2022', sub: 'FOLU, REDD+ & Emisi' },
    'sigap-jlkarbon-ar-50k': { wms: 'sigap:jlkarbon_ar_50k', title: 'JLKARBON 50K', sub: 'FOLU, REDD+ & Emisi' },
    'sigap-nsdh-2025-ar-250k': { wms: 'sigap:nsdh_2025_ar_250k_iden', title: 'NSDH 2025 250K', sub: 'FOLU, REDD+ & Emisi' },
    'sigap-nsdhkwshutan-2023-ar-250k': { wms: 'sigap:nsdhkwshutan_2023_ar_250k_iden', title: 'NSDHKWSHUTAN 2023 250K', sub: 'FOLU, REDD+ & Emisi' },
    'sigap-rktn-ar-250k': { wms: 'sigap:rktn_ar_250k', title: 'RKTN 250K', sub: 'FOLU, REDD+ & Emisi' },
    'sigap-deforestasi-2023-2024-ar-250k': { wms: 'sigap:deforestasi_2023_2024_ar_250k_iden', title: 'Deforestasi 2023-2024 250K', sub: 'FOLU, REDD+ & Emisi' },
    'sigap-reforestasi-2023-2024-ar-250k': { wms: 'sigap:reforestasi_2023_2024_ar_250k', title: 'Reforestasi 2023-2024 250K', sub: 'FOLU, REDD+ & Emisi' },
    'sigap-reforestasi-2024-2025-ar-50k': { wms: 'sigap:reforestasi_2024_2025_ar_50k_iden', title: 'Reforestasi 2024-2025 50K', sub: 'FOLU, REDD+ & Emisi' },
    'sigap-lahan-kritis': { wms: 'sigap:lahan_kritis_ar_50k_2024_iden', title: 'Lahan Kritis (SIGAP 50K 2024)', sub: 'DAS, Ekoregion & Lingkungan' },
    'sigap-addendum-andal-rkl-rpl-ar-50k': { wms: 'sigap:addendum_andal_rkl_rpl_ar_50k', title: 'Addendum Andal RKL RPL 50K', sub: 'DAS, Ekoregion & Lingkungan' },
    'sigap-amdal-ar-50k': { wms: 'sigap:amdal_ar_50k', title: 'AMDAL 50K', sub: 'DAS, Ekoregion & Lingkungan' },
    'sigap-das-ar-50k-03-2025': { wms: 'sigap:das_ar_50k_03_2025_iden', title: 'DAS 50K 03/2025', sub: 'DAS, Ekoregion & Lingkungan' },
    'sigap-dta-danau-ar-50k': { wms: 'sigap:dta_danau_ar_50k', title: 'DTA Danau 50K', sub: 'DAS, Ekoregion & Lingkungan' },
    'sigap-ekoregion-darat-ar-500k': { wms: 'sigap:ekoregion_darat_ar_500k', title: 'Ekoregion Darat 500K', sub: 'DAS, Ekoregion & Lingkungan' },
    'sigap-ekoregion-laut-ar-500k': { wms: 'sigap:ekoregion_laut_ar_500k', title: 'Ekoregion Laut 500K', sub: 'DAS, Ekoregion & Lingkungan' },
    'sigap-indeks-kualitas-air-laut-pnt-250k': { wms: 'sigap:indeks_kualitas_air_laut_pnt_250k', title: 'Indeks Kualitas Air Laut Titik 250K', sub: 'DAS, Ekoregion & Lingkungan' },
    'sigap-klasifikasi-das-ar-50k': { wms: 'sigap:klasifikasi_das_ar_50k_iden', title: 'Klasifikasi DAS 50K', sub: 'DAS, Ekoregion & Lingkungan' },
    'sigap-mata-air-pnt-250k': { wms: 'sigap:mata_air_pnt_250k', title: 'Mata Air Titik 250K', sub: 'DAS, Ekoregion & Lingkungan' },
    'sigap-pantau-sampah-laut-p-2020-ar-250k': { wms: 'sigap:pantau_sampah_laut_p_2020_ar_250k_iden', title: 'Pantau Sampah Laut 2020 250K', sub: 'DAS, Ekoregion & Lingkungan' },
    'sigap-pengelolaansampah-2020-ar-50k': { wms: 'sigap:pengelolaansampah_2020_ar_50k', title: 'Pengelolaansampah 2020 50K', sub: 'DAS, Ekoregion & Lingkungan' },
    'sigap-pmt-merkuri-pnt-50k': { wms: 'sigap:pmt_merkuri_pnt_50k', title: 'PMT Merkuri Titik 50K', sub: 'DAS, Ekoregion & Lingkungan' },
    'sigap-rehab-das-ar-50k': { wms: 'sigap:rehab_das_ar_50k', title: 'Rehab DAS 50K', sub: 'DAS, Ekoregion & Lingkungan' },
    'sigap-ukl-upl-ar-50k': { wms: 'sigap:ukl_upl_ar_50k', title: 'UKL UPL 50K', sub: 'DAS, Ekoregion & Lingkungan' },
    'sigap-kerentanan-perubahan-iklim-ar-250k': { wms: 'sigap:kerentanan_perubahan_iklim_ar_250k', title: 'Kerentanan Perubahan Iklim 250K', sub: 'Perubahan Iklim' },
    'sigap-lokasi-proklim-ar-250k': { wms: 'sigap:lokasi_proklim_ar_250k', title: 'Lokasi Proklim 250K', sub: 'Perubahan Iklim' },
    'sigap-capaian-pe-ar-25k': { wms: 'sigap:capaian_pe_ar_25k', title: 'Capaian PE 25K', sub: 'Lainnya' },
    'sigap-iku-ar-250k': { wms: 'sigap:iku_ar_250k', title: 'IKU 250K', sub: 'Lainnya' },
    'sigap-iphps-ar-50k-122025': { wms: 'sigap:iphps_ar_50k_122025', title: 'IPHPS 50K 12/2025', sub: 'Lainnya' },
    'sigap-ipl-ar-250k': { wms: 'sigap:ipl_ar_250k', title: 'IPL 250K', sub: 'Lainnya' },
    'sigap-keslah-ar-50k': { wms: 'sigap:keslah_ar_50k_iden', title: 'KESLAH 50K', sub: 'Lainnya' },
    'sigap-kl-ar-250k': { wms: 'sigap:kl_ar_250k', title: 'KL 250K', sub: 'Lainnya' },
    'sigap-klasterihn-pnt-250k': { wms: 'sigap:klasterihn_pnt_250k_iden', title: 'Klasterihn Titik 250K', sub: 'Lainnya' },
    'sigap-penerapan-tkt-pnt-25k-20202024': { wms: 'sigap:penerapan_tkt_pnt_25k_20202024', title: 'Penerapan TKT Titik 25K 2020-2024', sub: 'Lainnya' },
    'sigap-piaps-rev-ix-ar-250k': { wms: 'sigap:piaps_rev_ix_ar_250k', title: 'PIAPS Revisi IX 250K', sub: 'Lainnya' },
    'sigap-piaps-rev-x-ar-250k-wgs1984': { wms: 'sigap:piaps_rev_x_ar_250k_wgs1984_iden', title: 'PIAPS Revisi X 250K WGS84', sub: 'Lainnya' },
    'sigap-pippib-2026-i-250k': { wms: 'sigap:pippib_2026_i_250k', title: 'PIPPIB 2026 I 250K', sub: 'Lainnya' },
    'sigap-pippib-2026-i-250k-rev': { wms: 'sigap:pippib_2026_i_250k_rev_iden', title: 'PIPPIB 2026 I 250K Revisi', sub: 'Lainnya' },
    'sigap-tipologi-lembaga-ar-250k': { wms: 'sigap:tipologi_lembaga_ar_250k', title: 'Tipologi Lembaga 250K', sub: 'Lainnya' }
  };
  var sigapActiveLayers = {};

  function sigapLegendHtml(def) {
    var legendUrl = SIGAP_WMS_URL + '?' + L.Util.getParamString({
      service: 'WMS',
      version: '1.3.0',
      request: 'GetLegendGraphic',
      format: 'image/png',
      layer: def.wms,
      legend_options: 'fontName:Arial;fontSize:11;forceLabels:on;dpi:96'
    });
    return (
      '<div class="himawari-legend-title">' + sigapEsc(def.title) + '</div>' +
      '<div style="max-height:260px;overflow:auto;">' +
      '<img src="' + legendUrl + '" alt="Legenda" style="max-width:100%;" onerror="this.style.display=\'none\';this.parentNode.insertAdjacentHTML(\'beforeend\',\'<div class=&quot;himawari-legend-unit&quot;>Legenda tidak tersedia</div>\')">' +
      '</div>' +
      '<div class="himawari-legend-unit">Sumber: KLHK SIGAP — ' + sigapEsc(def.wms) + '</div>'
    );
  }

  function toggleSigapLayer(id, show) {
    var def = SIGAP_LAYER_REGISTRY[id];
    if (!def) return;
    var layer = sigapActiveLayers[id];
    if (show) {
      if (layer && map.hasLayer(layer)) return;
      layer = L.tileLayer.wms(SIGAP_WMS_URL, {
        layers: def.wms,
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        crs: L.CRS.EPSG3857,
        tileSize: 256,
        maxZoom: 18,
        attribution: 'KLHK (SIGAP)'
      });
      layer.addTo(map);
      sigapAttachClickHandler(layer, def.wms);
      sigapActiveLayers[id] = layer;
      if (typeof addUnifiedLegend === 'function' && typeof createLegendWithToggle === 'function') {
        var div = L.DomUtil.create('div', 'sigap-layer-legend');
        L.DomEvent.disableClickPropagation(div);
        div.innerHTML = sigapLegendHtml(def);
        addUnifiedLegend(id, createLegendWithToggle(div));
      }
    } else {
      if (layer && map.hasLayer(layer)) map.removeLayer(layer);
      sigapDetachClickHandler(layer);
      delete sigapActiveLayers[id];
      if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend(id);
      map.closePopup();
    }
  }
  window.toggleSigapLayer = toggleSigapLayer;

  /* ═══════════════════════════════════════════════════════
     QUICK LAYER TOOLBAR
     ═══════════════════════════════════════════════════════ */
  (function initQuickLayerBar() {
    var cfg = {
      qlHotspot:     { type: 'sheet' },
      qlTransjakarta:{ type: 'toggle-fn',                    fn: function(v) { if (typeof window.toggleTransjakarta === 'function') window.toggleTransjakarta(v); } },
      qlPm25:        { target: 'toggleAirVisualPm25',         type: 'checkbox' },
      qlWind:        { target: 'toggleWindAnim',              type: 'checkbox' },
      qlHujan:     { type: 'toggle-fn',                    fn: toggleHujanLayer },
      qlRadar:     { type: 'toggle-fn',                    fn: function(v) { if (typeof window.toggleBmkgRadar === 'function') window.toggleBmkgRadar(v); } },
      qlProvinsi:  { type: 'toggle-fn',                    fn: function(v) { if (typeof window.toggleProvinceBoundary === 'function') window.toggleProvinceBoundary(v); } },
      qlEcmwfFire: { type: 'toggle-fn',                    fn: toggleEcmwfFireLayer },
      qlViirsNoaa20:{ type: 'toggle-fn',                    fn: toggleViirsNoaa20Layer },
      qlKonsesi:   { target: 'toggleConcessionsLayer',      type: 'checkbox' },
      qlPelabuhan: { target: 'toggleCuacaPelabuhanLayer',   type: 'checkbox' },
      qlPerairan:  { target: 'toggleCuacaPerairanLayer',    type: 'checkbox' },
      qlGambut:    { target: 'togglePeatlandLayer',         type: 'checkbox' },
      qlSawit:     { target: 'toggleSawitNasionalLayer',    type: 'checkbox' },
      qlGunungApi: { target: 'toggleVolcanoLayer',          type: 'checkbox' },
      qlSstAnomali:{ type: 'toggle-fn',                    fn: toggleGhrsstSstAnomali }
    };

    function syncToolbarState() {
      Object.keys(cfg).forEach(function (btnId) {
        var btn = document.getElementById(btnId);
        var c = cfg[btnId];
        if (!btn) return;
        if (c.type === 'sheet') {
          var sheet = document.getElementById('hotspot-sheet');
          /* Sheet yang diminimalkan tetap menyisakan sheet-open, jadi kedua
             kelas dicek supaya tombol toolbar tidak menyala untuk chip. */
          btn.classList.toggle('active', !!(sheet && sheet.classList.contains('sheet-open') && !sheet.classList.contains('sheet-minimized')));
        } else if (c.type === 'checkbox') {
          var cb = document.getElementById(c.target);
          btn.classList.toggle('active', !!(cb && cb.checked));
        } else if (c.type === 'toggle-fn') {
          var isOn = false;
          if (c.fn === toggleViirsNoaa20Layer) isOn = !!(viirsNoaa20Layer && map.hasLayer(viirsNoaa20Layer));
          else if (c.fn === toggleEcmwfFireLayer) isOn = !!(ecmwfFireLayer && map.hasLayer(ecmwfFireLayer));
          else if (c.fn === toggleHujanLayer) isOn = typeof isHujanLayerActive === 'function' && isHujanLayerActive();
          else if (btnId === 'qlRadar') isOn = typeof window.isBmkgRadarActive === 'function' && window.isBmkgRadarActive();
          else if (btnId === 'qlProvinsi') isOn = typeof isProvinceBoundaryActive === 'function' && isProvinceBoundaryActive();
          else if (btnId === 'qlTransjakarta') isOn = typeof window.isTransjakartaActive === 'function' ? window.isTransjakartaActive() : (typeof window.isTransjakartaJalurActive === 'function' && (window.isTransjakartaJalurActive() || (typeof window.isTransjakartaHalteActive === 'function' && window.isTransjakartaHalteActive())));
          else if (c.fn === toggleGhrsstSstAnomali) isOn = !!(_ghrsstLayer && map.hasLayer(_ghrsstLayer));
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
            else if (btnId === 'qlRadar') isOn = typeof window.isBmkgRadarActive === 'function' && window.isBmkgRadarActive();
            else if (btnId === 'qlProvinsi') isOn = typeof isProvinceBoundaryActive === 'function' && isProvinceBoundaryActive();
            else if (btnId === 'qlTransjakarta') isOn = typeof window.isTransjakartaActive === 'function' ? window.isTransjakartaActive() : (typeof window.isTransjakartaJalurActive === 'function' && (window.isTransjakartaJalurActive() || (typeof window.isTransjakartaHalteActive === 'function' && window.isTransjakartaHalteActive())));
            else if (c.fn === toggleGhrsstSstAnomali) isOn = !!(_ghrsstLayer && map.hasLayer(_ghrsstLayer));
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

  /* Helper: fly-to effect for markers and polygons */
  function flyToMarker(marker) {
    try {
      var latlng = marker.getLatLng();
      if (!latlng) return;
      var targetZoom = Math.max(map.getZoom(), 12);
      map.flyTo(latlng, targetZoom, { duration: 0.8 });
      if (marker.openPopup) setTimeout(function () { marker.openPopup(); }, 400);
    } catch (e) {}
  }

  function flyToPolygon(layer) {
    try {
      var bounds = null;
      if (typeof layer.getBounds === 'function') bounds = layer.getBounds();
      else if (layer.getLatLngs) bounds = L.latLngBounds(layer.getLatLngs());
      if (!bounds || !bounds.isValid()) return;
      map.flyToBounds(bounds.pad(0.12), { duration: 0.9 });
      if (layer.openPopup) setTimeout(function () { layer.openPopup(); }, 600);
    } catch (e) {}
  }

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
      _unifiedSliderEl.style.display = 'none';
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

  /* ── GeoTools sheet ──
     Repo ini tidak punya build, jadi isi tab dipindah secara fisik
     dari #tab-geotools ke dalam sheet saat pertama dibuka dan dikembalikan
     saat ditutup. Sheet GeoFarm ikut terbawa karena #geotoolsTabGeoFarm
     juga anak dari #tab-geotools; panelnya sendiri position fixed, jadi
     tetap tampil di atas meski berkedalaman DOM-nya di dalam sheet. */
  window.SheetDrag && window.SheetDrag.register('geotools', {
    el: 'geotools-sheet',
    openClass: 'gs-sheet-open',
    minClass: 'gs-sheet-minimized',
    bodyOpen: 'geotools-sheet-open',
    bodyMin: 'geotools-sheet-minimized',
    handle: '.gs-sheet-handle',
    header: '.gs-sheet-head',
    minButton: '.gs-sheet-minimize',
    labelMin: 'Minimalkan',
    labelOpen: 'Perluas GeoTools',
    onOpen: function () {
      var body = document.getElementById('geotoolsSheetBody');
      var tabContent = document.getElementById('tab-geotools');
      var sheet = document.getElementById('geotools-sheet');
      if (!body || !tabContent || !sheet || sheet.dataset.moved) return;
      /* Lewati #geodata-panel-host secara eksplisit.
       *
       * Host itu milik sheet GeoData. Sekarang host-nya memang berada di
       * luar #tab-geotools, jadi while-loop biasa tidak akan menyentuhnya.
       * Tapi kalau suatu saat host_without sengaja dipindah ke dalam
       * #tab-geotools, loop ini akan menarik GeoData Analysis ke sheet
       * GeoTools - dan user akan melihat panel yang sama dua kali. Lewatinya
       * secara eksplisit supaya posisi host tidak lagi jadi hal yang rapuh.
       * childNodes disalin dulu supaya boleh menghapus sambil iterating. */
      var nodes = Array.prototype.slice.call(tabContent.childNodes);
      nodes.forEach(function (n) {
        if (n.nodeType === 1 && n.id === 'geodata-panel-host') return;
        body.appendChild(n);
      });
      sheet.dataset.moved = '1';
    },
    onClose: function () {
      var body = document.getElementById('geotoolsSheetBody');
      var tabContent = document.getElementById('tab-geotools');
      var sheet = document.getElementById('geotools-sheet');
      if (!body || !tabContent || !sheet) return;
      if (typeof window.clearMitraDaratLayers === 'function') {
        try { window.clearMitraDaratLayers(); } catch (e) { /* penutupan sheet tetap berjalan */ }
      }
      if (typeof window.clearGeopanganLayers === 'function') {
        try { window.clearGeopanganLayers(); } catch (e) { /* lapis lain tetap jalan */ }
      }
      if (!sheet.dataset.moved) return;
      while (body.firstChild) tabContent.appendChild(body.firstChild);
      delete sheet.dataset.moved;
    }
  });

  function openGeotoolsSheet() { if (window.SheetDrag) window.SheetDrag.buka('geotools'); }
  function closeGeotoolsSheet() { if (window.SheetDrag) window.SheetDrag.close('geotools'); }
  function minimizeGeotoolsSheet() { if (window.SheetDrag) window.SheetDrag.toggleMinimize('geotools'); }
  function restoreGeotoolsSheet() { if (window.SheetDrag) window.SheetDrag.restore('geotools'); }
  window.openGeotoolsSheet = openGeotoolsSheet;
  window.closeGeotoolsSheet = closeGeotoolsSheet;
  window.minimizeGeotoolsSheet = minimizeGeotoolsSheet;
  window.restoreGeotoolsSheet = restoreGeotoolsSheet;

  /* ── GeoData Sheet (terpisah dari GeoTools) ──
   *
   * GeoData dulu jadi salah satu <option> di .geotools-dropdown, lalu
   * disembunyikan bersama dropdown-nya agar tidak terlihat "GeoFarm"
   * tertulis di atas isi GeoData. Dua masalah muncul dari situ:
   *
   *  1. Menyembunyikan dropdown ikut menghapus satu-satunya cara pindah tab,
   *     jadi user terjebak di GeoData dan tidak bisa melihat card lainnya.
   *  2. openGeotoolsMainTab() melepas .active dari SEMUA
   *     .geotools-main-tab-panel. Selama GeoData masih memakai kelas itu,
   *     memilih tab lain akan membuat GeoData ikut hilang - gejala yang
   *     sama, dari arah berbeda.
   *
   * Penyebabnya sama: GeoData diperlakukan sebagai tab GeoTools padahal
   * jalurnya sendiri (tombol FAB "GeoData"). Sekarang panelnya dipindah ke
   * #geodata-panel-host - di luar #tab-geotools - dengan kelas .geodata-panel,
   * dan punya sheet sendiri. Dropdown GeoTools tidak pernah perlu
   * disembunyikan lagi, jadi selalu tampil dan selalu bisa dipakai.
   *
   * Pola onOpen/onClose-nya sama persis dengan sheet GeoTools: memindahkan
   * isi host ke dalam body saat dibuka, dan mengembalikannya saat ditutup.
   * Karena host dan tab GeoTools terpisah di markup, keduanya tidak pernah
   * berebut elemen yang sama. */
  /* Sheet GeoData punya kelas sendiri, bukan milik GeoTools.
   *
   * bodyOpen/bodyMin PENTING: keduanya ditoggle ke <body> (lihat
   * setBody di sheet-drag.js). Kalau ikut memakai geotools-sheet-open,
   * membuka GeoData akan memasang kelas milik GeoTools di <body> - dan
   * menutup GeoData akan melepasnya, meski sheet GeoTools masih terbuka.
   * Sheet tabel, legenda, dan alat & ukur juga masing-masing punya
   * bodyOpen/bodyMin sendiri, jadi ini memang polanya.
   *
   * openClass/minClass juga milik GeoData sendiri karena seluruh aturan
   * .gs-sheet-* di app.css di-scope ke #geotools-sheet. Sheet GeoData tidak
   * akan dikenai satu pun aturan itu. */
  window.SheetDrag && window.SheetDrag.register('geodata', {
    el: 'geodata-sheet',
    openClass: 'geodata-sheet-open',
    minClass: 'geodata-sheet-minimized',
    bodyOpen: 'geodata-sheet-open',
    bodyMin: 'geodata-sheet-minimized',
    handle: '.geodata-sheet-handle',
    /* Di mobile, hanya pill handle yang memulai drag tinggi. Seluruh header
       jangan menjadi zona drag karena swipe/scroll di area judul dapat
       tertangkap sebagai gestur memperbesar sheet. */
    header: '.geodata-sheet-handle',
    minButton: '.geodata-sheet-minimize',
    labelMin: 'Minimalkan',
    labelOpen: 'Perluas GeoData',
    onOpen: function () {
      var body = document.getElementById('geodataSheetBody');
      var host = document.getElementById('geodata-panel-host');
      if (!body || !host) return;
      while (host.firstChild) body.appendChild(host.firstChild);
    },
    onClose: function () {
      var body = document.getElementById('geodataSheetBody');
      var host = document.getElementById('geodata-panel-host');
      if (!body || !host) return;
      while (body.firstChild) host.appendChild(body.firstChild);
    }
  });

  function openGeoDataSheet() { if (window.SheetDrag) window.SheetDrag.buka('geodata'); }
  function closeGeoDataSheet() { if (window.SheetDrag) window.SheetDrag.close('geodata'); }
  function minimizeGeoDataSheet() { if (window.SheetDrag) window.SheetDrag.toggleMinimize('geodata'); }
  function restoreGeoDataSheet() { if (window.SheetDrag) window.SheetDrag.restore('geodata'); }
  window.openGeoDataSheet = openGeoDataSheet;
  window.closeGeoDataSheet = closeGeoDataSheet;
  window.minimizeGeoDataSheet = minimizeGeoDataSheet;
  window.restoreGeoDataSheet = restoreGeoDataSheet;

  /* ── Export TIF FAB (viewport GeoTIFF) ── */
  function createExportTiffFAB() {
    if (!__fabItems) __fabItems = document.querySelector('.map-fab-items');
    if (!__fabItems) return;
    var item = L.DomUtil.create('button', 'map-fab-item export-tiff-fab');
    item.title = 'Export TIF';
    item.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    __fabItems.appendChild(item);
    item.addEventListener('click', function (e) {
      e.stopPropagation();
      closeFAB();
      if (typeof window.exportViewportGeoTiff === 'function') window.exportViewportGeoTiff(item);
    });
  }

  /* ── GeoTools FAB Button ── */
  function createGeotoolsFAB() {
    if (!__fabItems) __fabItems = document.querySelector('.map-fab-items');
    if (!__fabItems) return;
    var item = L.DomUtil.create('button', 'map-fab-item geotools-sheet-btn');
    item.dataset.rkRequiresGoogleLogin = 'true';
    item.dataset.rkAuthFabId = 'geotools';
    item.title = 'GeoTools';
    item.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>';
    __fabItems.appendChild(item);
    item.addEventListener('click', function (e) {
      e.stopPropagation();
      closeFAB();
      openGeotoolsSheet();
    });
  }

  /* ── GeoData FAB Button ──
   *
   * Membuka sheet GeoTools langsung di tab GeoData, jadi pengguna tidak
   * harus membuka GeoTools dulu lalu memilih GeoData dari dropdown.
   * GeoData adalah tab yang paling sering dipakai (lihat komentar urutan
   * <option> di index.html), dan tombol ini adalah jalan 1-klik ke sana.
   *
   * Dua hal soal URUTANNYA, keduanya sudah dibuktikan oleh
   * returnToGeoFarmTab() di geofarm-draw.js - jadi jangan dibalik:
   *
   *  1. openGeotoolsSheet() harus lebih dulu. Hook onOpen sheet ini
   *     memindahkan SELURUH isi #tab-geotools ke dalam #geotoolsSheetBody
   *     (sekali saja, lewat sheet.dataset.moved), dan <select
   *     class="geotools-dropdown"> ikut terbawa karena dia anak
   *     #tab-geotools. Sheet-nya sudah benar-benar terbuka saat
   *     SheetDrag.buka() kembali, jadi langkah kedua bisa langsung jalan -
   *     tidak perlu setTimeout seperti yang dipakai tombol shortcut di
   *     sidebar (yang harus lebih dulu membuka tab lewat openTab()).
   *
   *  2. openTab() sengaja TIDAK dipakai. Isi tab sudah pindah ke sheet,
   *     jadi membuka sidebar kiri hanya akan menampilkan tab kosong.
   *
   * Dropdown dicari ulang lewat querySelector setiap klik, bukan
   * disimpan sebagai reference: node-nya dipindahkan oleh hook onOpen,
   * bukan di-kloning, jadi reference yang disimpan sebelumnya tetap
   * benar - tapi querySelector juga aman bila sheet belum pernah dibuka.
   *
   * Ikon: silinder "database" (Feather). Dipilih supaya berbeda dari
   * lima ikon FAB yang sudah ada - kotak GeoTools, baki download Export
   * TIF, mata Gambar & Ukur, panel peta Legenda, dan kisi Semua Tabel.
   */
  function createGeoDataFAB() {
    if (!__fabItems) __fabItems = document.querySelector('.map-fab-items');
    if (!__fabItems) return;
    var item = L.DomUtil.create('button', 'map-fab-item geodata-fab');
    item.title = 'GeoData';
    item.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>';
    __fabItems.appendChild(item);
    item.addEventListener('click', function (e) {
      e.stopPropagation();
      closeFAB();
      /* Satu panggilan saja. GeoData punya sheet sendiri (register 'geodata'
       * di atas), jadi tidak ada dropdown yang perlu disetel, tidak ada
       * panel yang perlu diaktifkan manual, dan tidak ada kelas sembunyi
       * yang perlu dilepas.
       *
       * openTab() juga tidak dipakai: isi tab sudah dipindahkan ke sheet,
       * jadi membuka sidebar kiri hanya menampilkan tab kosong. */
      openGeoDataSheet();
    });
  }

  /* ── Legend FAB Button ── */
  function createLegendFAB() {
    if (!__fabItems) __fabItems = document.querySelector('.map-fab-items');
    if (!__fabItems) return;
    var item = L.DomUtil.create('button', 'map-fab-item legend-sidebar-btn');
    item.title = 'Legenda';
    item.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>';
    __fabItems.appendChild(item);
    item.addEventListener('click', function (e) {
      e.stopPropagation();
      closeFAB();
      openLegendSidebar();
    });
  }

  /* ── Attribute Table Picker FAB Button ── */
  function createAttrTableFAB() {
    if (!__fabItems) __fabItems = document.querySelector('.map-fab-items');
    if (!__fabItems) return;
    var item = L.DomUtil.create('button', 'map-fab-item attr-table-fab');
    item.title = 'Semua Tabel';
    item.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>';
    __fabItems.appendChild(item);
    item.addEventListener('click', function (e) {
      e.stopPropagation();
      closeFAB();
      if (typeof window.openAttrTablePicker === 'function') window.openAttrTablePicker();
    });
  }

  /* ═══════════════════════════════════════
     Layer Catalog Dropdown
     ═══════════════════════════════════════ */

  /* Katalog ATR/BPN hanya menyajikan Zona Nilai Tanah untuk identifikasi
     klik. Persil Nasional memakai entri tile terpisah. */
  var BHUMI_IDENTIFY_TEMPLAYERS = [
    { layer: "umum:ZNTRANGE", label: "Zona Nilai Tanah" }
  ];
  /* Tidak mengaktifkan layer identifikasi tematik secara otomatis.
     Pengguna dapat memilih layer yang dibutuhkan dari katalog; pilihan
     yang pernah disimpan tetap dipulihkan dari localStorage. */
  var BHUMI_IDENTIFY_CORE = [];
  var BHUMI_IDENTIFY_STORAGE_KEY = 'ruangkita-bhumi-identify-layers';

  var LAYER_CATALOG_DATA = [
    {
      cat: 'Peta Dasar',
      type: 'basemap',
      groups: [
        {
          group: 'Peta Vector',
          layers: [
            { id: 'google-maps', label: 'Google Maps' },
            { id: 'osm', label: 'Open Street Map' },
            { id: 'rupabumi', label: 'Rupabumi Indonesia' },
            { id: 'esri-dark-gray', label: 'Esri Dark Gray' },
            { id: 'esri-topo', label: 'Esri Topographic' },
            { id: 'esri-terrain', label: 'Esri Terrain' },
            { id: 'esri-street', label: 'Esri Street' },
            { id: 'esri-shaded-relief', label: 'Esri Shaded Relief' },
            { id: 'esri-physical', label: 'Esri Physical' },
            { id: 'esri-natgeo', label: 'Esri National Geographic' }
          ]
        },
        {
          group: 'Citra Satelit',
          layers: [
            { id: 'esri-satellite', label: 'Esri Satellite' },
            { id: 'google-satellite-kh', label: 'Google Satellite' },
            { id: 'petadasar-bpn', label: 'Peta Dasar ATR/BPN' },
            { id: 'landsat-agriculture', label: 'Landsat Agriculture' },
            { id: 'landsat-agriculture-v2', label: 'Landsat Agriculture (v2)' },
            { id: 'bmkg-himawari', label: 'Himawari-9 IR (BMKG)' },
            { id: 'bmkg-himawari-nc', label: 'Himawari-9 Natural Color (BMKG)' },
            { id: 'bmkg-himawari-wv', label: 'Himawari-9 Water Vapor (BMKG)' },
            { id: 'bmkg-himawari-rp', label: 'Himawari-9 Rainfall (BMKG)' },
            { id: 'bmkg-himawari-sw', label: 'Himawari-9 Shortwave IR (BMKG)' },
            { id: 'bmkg-himawari-sm', label: 'Himawari-9 SST (BMKG)' },
            { id: 'bmkg-himawari-va', label: 'Himawari-9 Volcanic Ash (BMKG)' },
            { id: 'bmkg-himawari-vs', label: 'Himawari-9 Visible (BMKG)' },
            { id: 'bmkg-himawari-fd', label: 'Himawari-9 Full Disk (BMKG)' },
            { id: 'bmkg-himawari-hires', label: 'Himawari-9 Hi-Res (BMKG)' },
            { id: 'bmkg-gk2a', label: 'GK-2A IR (BMKG)' },
            { id: 'bmkg-gk2a-wv', label: 'GK-2A Water Vapor (BMKG)' },
            { id: 'bmkg-gk2a-rp', label: 'GK-2A Rainfall (BMKG)' },
            { id: 'modis-terra', label: 'MODIS Terra (NASA)' },
            { id: 'modis-aqua', label: 'MODIS Aqua (NASA)' },
            { id: 'viirs-noaa20', label: 'VIIRS NOAA-20 (NASA)' },
            { id: 'viirs-noaa21', label: 'VIIRS NOAA-21 (NASA)' },
            { id: 'viirs-snpp', label: 'VIIRS SNPP (NASA)' },
            { id: 'oci-pace', label: 'OCI PACE (NASA)' },
            { id: 'noaa-true-color', label: 'NOAA True Color' },
            { id: 'noaa-goes-ir', label: 'NOAA GOES IR' },
            { id: 'nowcoast-visible-imagery', label: 'NOAA Visible Imagery' },
            { id: 'sentinel1-rtc', label: 'Sentinel-1 RTC (ESA)' },
            { id: 'sentinel2', label: 'Sentinel-2 (ESA)' },
            { id: 'eox-s2cloudless-2024', label: 'Sentinel-2 Cloudless 2024 (EOX)' },
            { id: 'eox-blackmarble', label: 'NASA Black Marble (EOX)' },
            { id: 'eox-terrain-light', label: 'Terrain Light (EOX)' }
          ]
}
    ],
  },
  {
    /* Jaringan bus TransJakarta dan Trans Jogja. Masing-masing punya
     * modul dan panel kendali sendiri. */
      cat: 'Transportasi',
      layers: [
        { id: 'toggleTransjakarta', label: 'TransJakarta Network' },
        { id: 'toggleTransjogja', label: 'TransJogja Network' }
      ]
    },
    {
      cat: 'Ketahanan Pangan',
      subcats: [
        { subcat: 'Kerawanan pangan', layers: [
          { id: 'toggleFsvaLayer', label: 'FSVA 2025 (Badan Pangan)' }
        ]},
        { subcat: 'Kawasan tanaman pangan', layers: [
          { id: 'arcgis-kawasan-padi', label: 'Kawasan Padi (KEMENTAN)' },
          { id: 'arcgis-kawasan-jagung', label: 'Kawasan Jagung (KEMENTAN)' },
          { id: 'arcgis-kawasan-kedelai', label: 'Kawasan Kedelai (KEMENTAN)' }
        ]},
        { subcat: 'Standing Crop (SISCrop)', layers: [
          { id: 'brmp-provitas', label: 'Provitas Pangan (KEMENTAN)' },
          { id: 'brmp-ip', label: 'Indeks Pertanaman (KEMENTAN)' },
          { id: 'brmp-sc', label: 'Fase Pertanaman Padi (KEMENTAN)' }
        ]},
        { subcat: 'Pasar dan layanan pangan', layers: [
          { id: 'toggleSebaranPasar', label: 'Sebaran Pasar Indonesia' },
          { id: 'toggleSppgSebaranLayer', label: 'Sebaran SPPG Indonesia' },
          { id: 'toggleSppgDistrictLayer', label: 'SPPG per Kabupaten/Kota' },
          { id: 'toggleSppgLayer', label: 'SPPG Indonesia' }
         ]}
       ]
     },
      {
        cat: 'OPT Pertanian',
      subcats: [
          { subcat: 'Rekap Serangan OPT — Padi', layers: [
            { id: 'opt-padi-penggerek', label: 'Penggerek Batang' },
            { id: 'opt-padi-wbc', label: 'Wereng Batang Cokelat (WBC)' },
            { id: 'opt-padi-tikus', label: 'Tikus' },
            { id: 'opt-padi-blas', label: 'Blas' },
            { id: 'opt-padi-kresek', label: 'Kresek' },
            { id: 'opt-padi-tungro', label: 'Tungro' },
            { id: 'opt-padi-kerdil', label: 'Kerdil Rumput' }
          ]},
          { subcat: 'Rekap Serangan OPT — Jagung', layers: [
            { id: 'opt-jagung-lalat', label: 'Lalat Bibit' },
            { id: 'opt-jagung-penggerek', label: 'Penggerek Batang' },
            { id: 'opt-jagung-tikus', label: 'Tikus' },
            { id: 'opt-jagung-blay', label: 'Blai' },
            { id: 'opt-jagung-penggerek-tongkol', label: 'Penggerek Tongkol' },
            { id: 'opt-jagung-ulat-litura', label: 'Ulat Grayak Litura' },
            { id: 'opt-jagung-ulat-frugiperda', label: 'Ulat Grayak Frugiperda' }
          ]},
          { subcat: 'Rekap Serangan OPT — Kedelai', layers: [
            { id: 'opt-kedelai-tikus', label: 'Tikus' },
            { id: 'opt-kedelai-penggerek-polong', label: 'Penggerek Polong' },
            { id: 'opt-kedelai-penggulung', label: 'Penggulung Daun' },
            { id: 'opt-kedelai-ulat-litura', label: 'Ulat Grayak Litura' },
            { id: 'opt-kedelai-ulat-jengkal', label: 'Ulat Jengkal' }
          ]},
          { subcat: 'Kategori Wilayah Serangan OPT — Padi (Musim Hujan)', layers: [
            { id: 'kategori-opt-hujan-penggerek-batang', label: 'Penggerek Batang' },
            { id: 'kategori-opt-hujan-wereng-batang-cokelat', label: 'Wereng Batang Cokelat' },
            { id: 'kategori-opt-hujan-tikus', label: 'Tikus' },
            { id: 'kategori-opt-hujan-blas', label: 'Blas' },
            { id: 'kategori-opt-hujan-kresek', label: 'Kresek' },
            { id: 'kategori-opt-hujan-tungro', label: 'Tungro' },
            { id: 'kategori-opt-hujan-kerdil-rumput', label: 'Kerdil Rumput' }
          ]},
          { subcat: 'Kategori Wilayah Serangan OPT — Padi (Musim Kemarau)', layers: [
            { id: 'kategori-opt-kemarau-penggerek-batang', label: 'Penggerek Batang' },
            { id: 'kategori-opt-kemarau-wereng-batang-cokelat', label: 'Wereng Batang Cokelat' },
            { id: 'kategori-opt-kemarau-tikus', label: 'Tikus' },
            { id: 'kategori-opt-kemarau-blas', label: 'Blas' },
            { id: 'kategori-opt-kemarau-kresek', label: 'Kresek' },
            { id: 'kategori-opt-kemarau-tungro', label: 'Tungro' },
            { id: 'kategori-opt-kemarau-kerdil-rumput', label: 'Kerdil Rumput' }
          ]},
          { subcat: 'Kategori Endemis OPT — Cengkeh', layers: [
            { id: 'optp-cengkeh-penggerek-batang', label: 'Penggerek Batang (Nothopeus sp.)' }
          ]},
          { subcat: 'Kategori Endemis OPT — Jambu Mete', layers: [
            { id: 'optp-jambu-mete-ulat-kipat', label: 'Ulat Kipat' },
            { id: 'optp-jambu-mete-kepik-penghisap', label: 'Kepik Penghisap (Helopeltis sp.)' },
            { id: 'optp-jambu-mete-wereng-pucuk', label: 'Wereng Pucuk (Sanurus sp.)' }
          ]},
          { subcat: 'Kategori Endemis OPT — Kakao', layers: [
            { id: 'optp-kakao-penggerek-buah-kakao', label: 'Penggerek Buah Kakao' },
            { id: 'optp-kakao-kepik-penghisap-buah', label: 'Kepik Penghisap Buah (Helopeltis sp.)' },
            { id: 'optp-kakao-penyakit-vascular-streak-dieback', label: 'Penyakit Vascular Streak Dieback (VSD)' },
            { id: 'optp-kakao-penyakit-busuk-buah', label: 'Penyakit Busuk Buah' }
          ]},
          { subcat: 'Kategori Endemis OPT — Kapas', layers: [
            { id: 'optp-kapas-heliothis-sp', label: 'Heliothis sp.' }
          ]},
          { subcat: 'Kategori Endemis OPT — Karet', layers: [
            { id: 'optp-karet-jamur-akar-putih', label: 'Jamur Akar Putih' },
            { id: 'optp-karet-gugur-daun-pestalotiopsis', label: 'Gugur Daun Pestalotiopsis' },
            { id: 'optp-karet-gugur-daun-colletotrichum', label: 'Gugur Daun Colletotrichum' },
            { id: 'optp-karet-penyakit-bidang-sadap', label: 'Penyakit Bidang Sadap' },
            { id: 'optp-karet-jamur-upas', label: 'Jamur Upas' },
            { id: 'optp-karet-rayap', label: 'Rayap' }
          ]},
          { subcat: 'Kategori Endemis OPT — Kelapa', layers: [
            { id: 'optp-kelapa-oryctes-rhinoceros', label: 'Oryctes rhinoceros' },
            { id: 'optp-kelapa-brontispa-longissima', label: 'Brontispa longissima' },
            { id: 'optp-kelapa-belalang-padang', label: 'Belalang Padang (Sexava spp.)' },
            { id: 'optp-kelapa-aspidiotus-destructor', label: 'Aspidiotus destructor' },
            { id: 'optp-kelapa-busuk-pucuk-kelapa', label: 'Busuk Pucuk Kelapa (Phytophthora palmivora)' }
          ]},
          { subcat: 'Kategori Endemis OPT — Kelapa Sawit', layers: [
            { id: 'optp-kelapa-sawit-ulat-api', label: 'Ulat Api' },
            { id: 'optp-kelapa-sawit-babi-hutan', label: 'Babi Hutan' },
            { id: 'optp-kelapa-sawit-tikus', label: 'Tikus' },
            { id: 'optp-kelapa-sawit-busuk-pangkal-batang', label: 'Busuk Pangkal Batang' }
          ]},
          { subcat: 'Kategori Endemis OPT — Kopi', layers: [
            { id: 'optp-kopi-penggerek-batang-kopi', label: 'Penggerek Batang Kopi' },
            { id: 'optp-kopi-karat-daun', label: 'Karat daun (Hemileia vastatrix)' },
            { id: 'optp-kopi-kutu-putih', label: 'Kutu Putih' }
          ]},
          { subcat: 'Kategori Endemis OPT — Lada', layers: [
            { id: 'optp-lada-busuk-pangkal-batang', label: 'Busuk Pangkal Batang' },
            { id: 'optp-lada-dasynus-piperis', label: 'Dasynus piperis' },
            { id: 'optp-lada-lophobaris-piperis', label: 'Lophobaris piperis' },
            { id: 'optp-lada-penyakit-kuning', label: 'Penyakit Kuning (nematoda)' },
            { id: 'optp-lada-keriting-daun', label: 'Keriting Daun' },
            { id: 'optp-lada-jamur-pirang', label: 'Jamur Pirang' }
          ]},
          { subcat: 'Kategori Endemis OPT — Nilam', layers: [
            { id: 'optp-nilam-ulat-daun', label: 'Ulat Daun' },
            { id: 'optp-nilam-budok', label: 'Budok' },
            { id: 'optp-nilam-busuk-batang', label: 'Busuk Batang' },
            { id: 'optp-nilam-belalang', label: 'Belalang' }
          ]},
          { subcat: 'Kategori Endemis OPT — Pala', layers: [
            { id: 'optp-pala-penyakit-busuk-buah', label: 'Penyakit Busuk Buah' },
            { id: 'optp-pala-hama-penggerek-batang', label: 'Hama Penggerek Batang' }
          ]},
          { subcat: 'Kategori Endemis OPT — Sagu', layers: [
            { id: 'optp-sagu-oryctes-rhinoceros', label: 'Oryctes rhinoceros' },
            { id: 'optp-sagu-babi-hutan', label: 'Babi Hutan' },
            { id: 'optp-sagu-artona-catoxantha', label: 'Artona catoxantha' }
          ]},
          { subcat: 'Kategori Endemis OPT — Tebu', layers: [
            { id: 'optp-tebu-tikus', label: 'Tikus (Rattus sp.)' },
            { id: 'optp-tebu-uret', label: 'Uret (Lepidiota stigma)' },
            { id: 'optp-tebu-penggerek-pucuk', label: 'Penggerek Pucuk (Scirpophaga sp.)' },
            { id: 'optp-tebu-penggerek-batang', label: 'Penggerek Batang (Chilo sp.)' },
            { id: 'optp-tebu-luka-api', label: 'Luka Api' }
          ]},
          { subcat: 'Kategori Endemis OPT — Teh', layers: [
            { id: 'optp-teh-helopeltis-sp', label: 'Helopeltis sp.' },
            { id: 'optp-teh-cacar-daun-teh', label: 'Cacar Daun Teh' },
            { id: 'optp-teh-wereng-pucuk-teh', label: 'Wereng Pucuk Teh' }
          ]},
          { subcat: 'Kategori Endemis OPT — Tembakau', layers: [
            { id: 'optp-tembakau-lanas', label: 'Lanas' },
            { id: 'optp-tembakau-spodoptera-sp', label: 'Spodoptera sp.' },
            { id: 'optp-tembakau-myzus-sp', label: 'Myzus sp.' },
            { id: 'optp-tembakau-tobacco-mosaic-virus', label: 'Tobacco Mosaic Virus (TMV)' },
            { id: 'optp-tembakau-aphis-sp', label: 'Aphis sp.' },
            { id: 'optp-tembakau-heliothis-sp', label: 'Heliothis sp.' }
          ]},
          { subcat: 'Kategori Endemis OPT — Vanili', layers: [
            { id: 'optp-vanili-busuk-batang', label: 'Busuk Batang' }
          ]},
          { subcat: 'Rekap Serangan OPT — Aneka Cabai', layers: [
            { id: 'opth-cabai-antraknosa', label: 'Antraknosa (Colletotrichum spp.)' },
            { id: 'opth-cabai-lalat-buah', label: 'Lalat Buah (Bactrocera spp.)' },
            { id: 'opth-cabai-layu-fusarium', label: 'Layu Fusarium (Fusarium oxysporum)' },
            { id: 'opth-cabai-trips', label: 'Trips (Thrips spp.)' },
            { id: 'opth-cabai-virus-keriting', label: 'Virus Keriting' },
            { id: 'opth-cabai-virus-kuning', label: 'Virus Kuning' }
          ]},
          { subcat: 'Rekap Serangan OPT — Bawang Merah', layers: [
            { id: 'opth-bawang-merah-embun-tepung', label: 'Embun Tepung (Perenospora destructor)' },
            { id: 'opth-bawang-merah-lalat-pengorok-daun', label: 'Lalat Pengorok Daun (Liriomyza sp.)' },
            { id: 'opth-bawang-merah-mati-pucuk', label: 'Mati Pucuk (Phytophora sp.)' },
            { id: 'opth-bawang-merah-trotol-bercak-ungu', label: 'Trotol/Bercak Ungu (Alternaria porri)' },
            { id: 'opth-bawang-merah-ulat-bawang', label: 'Ulat Bawang (Spodoptera exigua)' }
          ]}
        ]
      },
    {
      cat: 'Bencana & Risiko',
      layers: [
        { id: 'toggleLatestEarthquake', label: 'Gempa Terbaru (BMKG)' },
        { id: 'toggleSignificantMarkers', label: '15 Gempa M 5.0+ (BMKG)' },
        { id: 'toggleFeltMarkers', label: '15 Gempa Dirasakan (BMKG)' },
        { id: 'toggleFaultLayer', label: 'Patahan Indonesia (BNPB)' },
        { id: 'toggleFaultLayerNew', label: 'Patahan Indonesia Baru (PUSGEN 2024)' },
        { id: 'toggleWorldPlatesLayer', label: 'Zona Patahan Dunia (USGS)' },
        /* Gempa NTT and Finite Fault NTT removed */
        { id: 'toggleJalurEvakuasi', label: 'Jalur Evakuasi (BNPB)' },
        { id: 'toggleHistoryGempa', label: 'Riwayat Gempa BMKG' },
        { id: 'toggleKatalogGempa', label: 'Katalog Gempa BMKG' },
        { id: 'toggleHistoricalQuakes', label: 'Katalog Gempa Global (USGS)' },
        { id: 'toggleSensorSeismic', label: 'Sensor Seismic BMKG' },
        { id: 'toggleSensorGlobal', label: 'Sensor Global (GEOFON)' },
        { id: 'toggleViirsHotspots', label: 'Hotspot VIIRS (Global)' },
        { id: 'toggleModisHotspots48', label: 'Hotspot MODIS (48 Jam)' },
        { id: 'toggleModisHotspots7d', label: 'Hotspot MODIS (7 Hari)' }
      ]
    },
    {
      cat: 'Lingkungan & Laut',
      subcats: [
        { subcat: 'Laut', layers: [
          { id: 'toggleChlorophyllOverlay', label: 'Chlorophyll-a Laut (NASA)' },
          { id: 'toggleParOverlay', label: 'PAR - Radiasi Fotosintesis (NASA)' },
          { id: 'toggleGhrsstSstAnomali', label: 'SST Anomaly (GHRSST MUR)' }
        ]},
        { subcat: 'Aerosol', layers: [
          { id: 'omi-aerosol-index', label: 'UV Aerosol Index (OMI/Aura)' },
          { id: 'omi-aod-abs', label: 'Absorbing AOD Near-UV (OMI/Aura)' },
          { id: 'omi-modis-terra-aod', label: 'Aerosol Optical Depth (MODIS Terra)' },
          { id: 'omi-modis-aqua-aod', label: 'Aerosol Optical Depth (MODIS Aqua)' }
        ]},
        { subcat: 'SO\u2082', layers: [
          { id: 'omi-so2', label: 'SO\u2082 Lower Troposphere (OMI/Aura)' },
          { id: 'omi-so2-pbl', label: 'SO\u2082 Planetary Boundary Layer (OMI/Aura)' },
          { id: 'omps-noaa20-so2-lt', label: 'SO\u2082 Lower Troposphere (OMPS NOAA-20)' }
        ]},
        { subcat: 'NO\u2082', layers: [
          { id: 'omi-no2', label: 'NO\u2082 Tropospheric Column (OMI/Aura)' }
        ]}
      ]
    },
    {
      cat: 'Cuaca, Iklim & Kualitas Udara',
      subcats: [
        { subcat: 'Prakiraan cuaca dan kondisi laut', layers: [
          { id: 'toggleWindRgb', label: 'Wind Speed and Direction (GFS)' },
          { id: 'toggleRhRgb', label: 'Relative Humidity (GFS)' },
          { id: 'toggleTp24Rgb', label: 'Total Precipitation 24 Jam (GFS)' },
          { id: 'togglePm25Rgb', label: 'PM2.5 Air Quality (BMKG PCM)' },
          { id: 'toggleHthRgb', label: 'Hari Tanpa Hujan (BMKG HTH)' },
          { id: 'toggleBmkgPrecip10days', label: 'Prakiraan Hujan 10 Hari (BMKG)' },
          { id: 'toggleCuacaPerairanLayer', label: 'Cuaca Perairan (BMKG)' },
          { id: 'toggleCuacaPelabuhanLayer', label: 'Cuaca Pelabuhan (BMKG)' },
          { id: 'toggleMaritimeAngin', label: 'Angin Laut (Wind Speed)' },
          { id: 'toggleMaritimeGelombang', label: 'Tinggi Gelombang' },
          { id: 'toggleMaritimeSwell', label: 'Swell (Primary Swell)' },
          { id: 'toggleMaritimeWindSea', label: 'Gelombang Angin (Wind Sea)' }
        ]},
        { subcat: 'Kualitas Udara', layers: [
          { id: 'toggleAirVisualPm25', label: 'PM2.5 (AirVisual)' },
          { id: 'toggleAirVisualPm10', label: 'PM10 (AirVisual)', dataAttr: 'airvisual-pm10' },
          { id: 'toggleAirVisualO3', label: 'O3 - Ozon (AirVisual)', dataAttr: 'airvisual-o3' },
          { id: 'toggleAirVisualNo2', label: 'NO2 - Nitrogen Dioksida (AirVisual)', dataAttr: 'airvisual-no2' },
          { id: 'toggleAirVisualSo2', label: 'SO2 - Sulfur Dioksida (AirVisual)', dataAttr: 'airvisual-so2' },
          { id: 'toggleAirVisualCo', label: 'CO - Karbon Monoksida (AirVisual)', dataAttr: 'airvisual-co' },
          { id: 'toggleOpenaqPm25', label: 'PM2.5 (OpenAQ)' },
          { id: 'toggleOpenaqPm10', label: 'PM10 (OpenAQ)' },
          { id: 'toggleOpenaqPm1', label: 'PM1 (OpenAQ)' }
        ]},
        { subcat: 'Indeks kekeringan SPI (curah hujan)', layers: [
          { id: 'toggleSpi1m', label: 'SPI 1 Bulan' },
          { id: 'toggleSpi3m', label: 'SPI 3 Bulan' },
          { id: 'toggleSpi6m', label: 'SPI 6 Bulan' },
          { id: 'toggleSpi9m', label: 'SPI 9 Bulan' },
          { id: 'toggleSpi12m', label: 'SPI 12 Bulan' }
        ]},
        { subcat: 'Indeks kekeringan SPEI (curah hujan dan suhu)', layers: [
          { id: 'toggleSpei1m', label: 'SPEI 1 Bulan' },
          { id: 'toggleSpei3m', label: 'SPEI 3 Bulan' },
          { id: 'toggleSpei6m', label: 'SPEI 6 Bulan' },
          { id: 'toggleSpei9m', label: 'SPEI 9 Bulan' },
          { id: 'toggleSpei12m', label: 'SPEI 12 Bulan' }
        ]},
        { subcat: 'Pengamatan iklim BMKG', layers: [
          { id: 'toggleBmkgCurahHujan', label: 'Curah Hujan (BMKG)' },
          { id: 'toggleBmkgHariHujan', label: 'Hari Hujan (BMKG)' },
          { id: 'toggleBmkgNormalHujan', label: 'Normal Curah Hujan Bulanan (BMKG)' },
          { id: 'bmkgLightningLink', label: 'Monitoring Sambaran Petir Real-time (BMKG)', href: 'https://lightning.bmkg.go.id/map/monitoring' }
        ]}
      ]
    },
    {
      cat: 'Hutan, Lahan & Konservasi',
      layers: [
        { id: 'toggleConcessionsLayer', label: 'Konsesi (GFW)' },
        { id: 'toggleProtectedLayer', label: 'Kawasan Konservasi (WDPA)' },
        { id: 'toggleMangroveLayer', label: 'Mangrove (GMW v3)' },
        { id: 'togglePeatlandLayer', label: 'Lahan Gambut (GFW)' },
        { id: 'toggleKawasanHutanLayer', label: 'Kawasan Hutan (ESDM)' },
        { id: 'toggleGambutLayer', label: 'Lahan Gambut (SIMONTANA)' },
        { id: 'toggleKhLayer', label: 'Kawasan Hutan (Kemenhut)' },
        { id: 'kwshutan-planologi', label: 'Kawasan Hutan 250K Juni 2026 (Planologi)' },
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
      /* Seluruh layer overlay SIGAP (GeoServer KLHK) dibangkitkan dari
       * SIGAP_LAYER_REGISTRY agar id, label, dan nama WMS selalu sinkron. */
      cat: 'Kehutanan & Lahan (SIGAP)',
      subcats: (function () {
        var order = [], groups = {};
        Object.keys(SIGAP_LAYER_REGISTRY).forEach(function (id) {
          var def = SIGAP_LAYER_REGISTRY[id];
          var sub = def.sub || 'Lainnya';
          if (!groups[sub]) { groups[sub] = []; order.push(sub); }
          groups[sub].push({ id: id, label: def.title });
        });
        return order.map(function (name) { return { subcat: name, layers: groups[name] }; });
      })()
    },
    {
      cat: 'Geologi & Tanah',
      subcats: [
        { subcat: 'Geologi', layers: [
          { id: 'toggleGeologiArcGISOnline', label: 'Peta Geologi Yogyakarta (ArcGIS)' },
          { id: 'toggleJenisTanahJateng', label: 'Jenis Tanah Jawa Tengah (ArcGIS)' },
          { id: 'toggleGeologiBNPB', label: 'Peta Geologi (BNPB)' },
          { id: 'toggleVolcanoLayer', label: 'Gunung Api Indonesia (PVMBG)' },
          { id: 'toggleKrbGunungApi', label: 'Kawasan Rawan Bencana Gunung Api (BIG)' },
          { id: 'toggleKrbTitik', label: 'Gas Vulkanik Gunung Api (BIG)' },
          { id: 'togglePetaGeologi', label: 'Peta Geologi (BIG)' },
          { id: 'toggleGeostruktur', label: 'Geologi Geostruktur (BIG)' },
          { id: 'togglePatahanAktif', label: 'Patahan Aktif 1:50K (BIG)' },
          { id: 'toggleLikuifaksi', label: 'Kerentanan Likuifaksi (BIG)' },
{ id: 'toggleKarst', label: 'Kawasan Bentang Alam Karst (BIG)' },
          { id: 'toggleEkoregion', label: 'Bentang Lahan Indonesia' },
          { id: 'toggleBouguerBMKG', label: 'Anomali Bouguer Indonesia (BMKG)' }
        ]},
        { subcat: 'Peta tanah global (ISee / Purdue)', layers: [
          { id: 'isee-soil-orders', label: 'Soil Orders Global' },
          { id: 'isee-soil-moisture', label: 'Soil Moisture Regimes Global' },
          { id: 'isee-soil-temperature', label: 'Soil Temperature Regimes Global' },
          { id: 'isee-soil-hillshade', label: 'Hillshade Global' },
          { id: 'isee-soil-boundaries', label: 'Batas Administrasi Global' },
          { id: 'isee-soil-labels', label: 'Label Administrasi Global' }
        ]},
        { subcat: 'Jenis dan sifat tanah (WRB / ISRIC)', layers: [
          { id: 'toggleHwsdIndonesia', label: 'Jenis Tanah Indonesia (HWSD v2.01)' },
          { id: 'isric-soil-wrb', label: 'WRB — Kelas tanah paling mungkin' },
          { id: 'isric-soil-bdod', label: 'Bulk density · 0–5 cm' },
          { id: 'isric-soil-cec', label: 'Kapasitas tukar kation (CEC) · 0–5 cm' },
          { id: 'isric-soil-cfvo', label: 'Fragmen kasar volumetrik · 0–5 cm' },
          { id: 'isric-soil-clay', label: 'Kandungan liat · 0–5 cm' },
          { id: 'isric-soil-nitrogen', label: 'Nitrogen · 0–5 cm' },
          { id: 'isric-soil-phh2o', label: 'pH tanah dalam H₂O · 0–5 cm' },
          { id: 'isric-soil-sand', label: 'Kandungan pasir · 0–5 cm' },
          { id: 'isric-soil-silt', label: 'Kandungan debu · 0–5 cm' },
          { id: 'isric-soil-soc', label: 'Karbon organik tanah · 0–5 cm' },
          { id: 'isric-soil-ocs', label: 'Stok karbon organik · 0–30 cm' },
          { id: 'isric-soil-ocd', label: 'Kerapatan karbon organik · 0–5 cm' },
          { id: 'isric-soil-wv1500', label: 'Kadar air volumetrik · 1500 kPa · 0–5 cm' },
          { id: 'isric-soil-wv0033', label: 'Kadar air volumetrik · 33 kPa · 0–5 cm' },
          { id: 'isric-soil-wv0010', label: 'Kadar air volumetrik · 10 kPa · 0–5 cm' }
        ]}
      ]
    },
    {
      /* Persil Tanah ATR/BPN. Layer ini sengaja hanya tersedia lewat
       * Katalog Layer -- GeoPortal Hub memakai katalog WMS lain yang
       * tidak memuat BHUMI. Hidden: kategori ini belum ditampilkan. */
      cat: 'Pertanahan & ATR/BPN',
      hidden: true,
      layers: [
        { id: 'toggleBumiPersilLayer', label: 'Persil Tanah (BHUMI)' },
        { id: 'toggleGistaruPersilLayer', label: 'Persil Tanah (GISTARU)' }
      ]
    },
    {
      cat: 'Persil Nasional - ATR/BPN',
      subcats: [
        { subcat: 'Peta Pertanahan', layers: [
          { id: 'toggleBhumiPersilNasionalLayer', label: 'Persil Nasional (BHUMI)' }
        ]},
        { subcat: 'Identifikasi klik — layer tematik BHUMI', layers: BHUMI_IDENTIFY_TEMPLAYERS.map(function(t) {
          return { id: 'bhumi-identify:' + t.layer, label: t.label };
        })}
      ]
    },
    {
      cat: 'SITR Jawa Timur',
      subcats: [
        { subcat: 'Pola ruang & kawasan', layers: [
          { id: 'sitr-wms-5', label: 'Batas Administrasi Area' },
          { id: 'sitr-wms-6', label: 'Rencana Pola Ruang' },
          { id: 'sitr-wms-7', label: 'Rencana Pola Ruang (Kab/Kota)' },
          { id: 'sitr-wms-28', label: 'Rencana Pola Ruang (Jawa Timur)' },
          { id: 'sitr-wms-44', label: 'Rencana Kawasan Agropolitan (Kab/Kota)' },
          { id: 'sitr-wms-45', label: 'Rencana Kawasan Lindung (Kab/Kota)' },
          { id: 'sitr-wms-59', label: 'Kawasan Pertahanan & Keamanan (Kab/Kota)' },
          { id: 'sitr-wms-62', label: 'Rencana Wilayah Pelayanan (Kab/Kota)' },
          { id: 'sitr-wms-72', label: 'Batas Unit Lingkungan (Kab/Kota)' },
          { id: 'sitr-wms-81', label: 'Wilayah Perencanaan (Kab/Kota)' },
          { id: 'sitr-wms-86', label: 'Kawasan Industri & Rawan Banjir, Erosi (Kab/Kota)' },
          { id: 'sitr-wms-87', label: 'Kawasan Industri (Kab/Kota)' },
          { id: 'sitr-wms-88', label: 'Rencana Kawasan Strategis Ekonomi (Kab/Kota)' },
          { id: 'sitr-wms-90', label: 'Rencana Pariwisata (Kab/Kota)' },
          { id: 'sitr-wms-91', label: 'Rencana Pengembangan Wilayah (Kab/Kota)' },
          { id: 'sitr-wms-92', label: 'Rencana Rute Wisata (Kab/Kota)' },
          { id: 'sitr-wms-100', label: 'Rencana Pola Ruang (Kab/Kota)' },
          { id: 'sitr-wms-103', label: 'Pola Ruang (Kab/Kota) Percobaan' },
          { id: 'sitr-wms-108', label: 'Kawasan Strategis' },
          { id: 'sitr-wms-118', label: 'Rencana Pola Ruang Kab/Kota Perda 2023' },
          { id: 'sitr-wms-120', label: 'KKPRL Perda 10/2023 — RTRW Provinsi' }
        ]},
        { subcat: 'Transportasi', layers: [
          { id: 'sitr-wms-12', label: 'Sistem Jaringan Jalan' },
          { id: 'sitr-wms-26', label: 'Bandar Udara' },
          { id: 'sitr-wms-29', label: 'Stasiun KA' },
          { id: 'sitr-wms-32', label: 'Sistem Jaringan Jalan (Kab/Kota)' },
          { id: 'sitr-wms-37', label: 'Sistem Jaringan Jalan Tol' },
          { id: 'sitr-wms-40', label: 'Rencana Bandara (Kab/Kota)' },
          { id: 'sitr-wms-41', label: 'Rencana Terminal (Kab/Kota)' },
          { id: 'sitr-wms-51', label: 'Rencana Jalur Pelayaran (Kab/Kota)' },
          { id: 'sitr-wms-52', label: 'Rencana Jalur Penerbangan (Kab/Kota)' },
          { id: 'sitr-wms-54', label: 'Rencana Rel Kereta Api (Kab/Kota)' },
          { id: 'sitr-wms-63', label: 'Rencana Jaringan Jalan Lingkar Utara (Kab/Kota)' },
          { id: 'sitr-wms-64', label: 'Rencana Jaringan Pedestarian (Kab/Kota)' },
          { id: 'sitr-wms-65', label: 'Rencana Pengembangan Pintu Perlintasan KA (Kab/Kota)' },
          { id: 'sitr-wms-66', label: 'Rencana Prasarana Transportasi (Kab/Kota)' },
          { id: 'sitr-wms-77', label: 'Rencana Titik Jaringan Transportasi (Kab/Kota)' },
          { id: 'sitr-wms-79', label: 'Rencana Area Jaringan Jalan Tol (Kab/Kota)' },
          { id: 'sitr-wms-80', label: 'Rencana Toll Gate (Kab/Kota)' },
          { id: 'sitr-wms-82', label: 'Rencana ORR (Kab/Kota)' },
          { id: 'sitr-wms-83', label: 'Rencana IRR (Kab/Kota)' },
          { id: 'sitr-wms-84', label: 'Rencana Jaringan Jalan (Kab/Kota)' },
          { id: 'sitr-wms-94', label: 'Rencana Pelabuhan Penyeberangan (Kab/Kota)' },
          { id: 'sitr-wms-95', label: 'Rencana Pelabuhan (Kab/Kota)' },
          { id: 'sitr-wms-96', label: 'Rencana Rel Double Track (Kab/Kota)' },
          { id: 'sitr-wms-97', label: 'Rencana Rel Konservasi (Kab/Kota)' },
          { id: 'sitr-wms-98', label: 'Rencana Stasiun KA (Kab/Kota)' },
          { id: 'sitr-wms-99', label: 'Rencana Pelabuhan Ikan (Kab/Kota)' },
          { id: 'sitr-wms-101', label: 'Rencana Titik Rel Kereta Api Konservasi (Kab/Kota)' },
          { id: 'sitr-wms-102', label: 'Rencana Terminal Barang (Kab/Kota)' },
          { id: 'sitr-wms-104', label: 'Bandar Udara (Testing)' },
          { id: 'sitr-wms-107', label: 'Infrastruktur Transportasi' },
          { id: 'sitr-wms-117', label: 'Sistem Jaringan Transportasi' }
        ]},
        { subcat: 'Energi & telekomunikasi', layers: [
          { id: 'sitr-wms-20', label: 'Sistem Jaringan Energi' },
          { id: 'sitr-wms-21', label: 'Jaringan Gas dan Minyak' },
          { id: 'sitr-wms-38', label: 'Rencana Jaringan Gas (Kab/Kota)' },
          { id: 'sitr-wms-42', label: 'Rencana Jaringan Listrik (Kab/Kota)' },
          { id: 'sitr-wms-43', label: 'Rencana SUTET' },
          { id: 'sitr-wms-49', label: 'Rencana Telematika (Kab/Kota)' },
          { id: 'sitr-wms-50', label: 'Rencana Gardu Induk (Kab/Kota)' },
          { id: 'sitr-wms-55', label: 'Rencana Sistem Jaringan Telekomunikasi (Kab/Kota)' },
          { id: 'sitr-wms-60', label: 'Rencana SUTT (Kab/Kota)' },
          { id: 'sitr-wms-73', label: 'BTS (Kab/Kota)' },
          { id: 'sitr-wms-74', label: 'Rencana Titik Sistem Jaringan Telekomunikasi' },
          { id: 'sitr-wms-76', label: 'Rencana Titik Jaringan Listrik (Kab/Kota)' },
          { id: 'sitr-wms-89', label: 'Rencana Menara Bersama (Kab/Kota)' },
          { id: 'sitr-wms-109', label: 'Rencana Jaringan Telekomunikasi' },
          { id: 'sitr-wms-110', label: 'Sistem Infrastruktur Energi' },
          { id: 'sitr-wms-114', label: 'Sistem Jaringan Energi' }
        ]},
        { subcat: 'Sumber daya air & drainase', layers: [
          { id: 'sitr-wms-19', label: 'Sumber Mata Air' },
          { id: 'sitr-wms-35', label: 'Sistem Drainase (Kab/Kota)' },
          { id: 'sitr-wms-39', label: 'Rencana Saluran Irigasi (Kab/Kota)' },
          { id: 'sitr-wms-48', label: 'Perencanaan Sistem Penyediaan Air Minum (Kab/Kota)' },
          { id: 'sitr-wms-53', label: 'Rencana Jaringan Air Bersih (Kab/Kota)' },
          { id: 'sitr-wms-56', label: 'Rencana Sumber Daya Air (Kab/Kota)' },
          { id: 'sitr-wms-71', label: 'Rencana Saluran (Kab/Kota)' },
          { id: 'sitr-wms-75', label: 'Rencana Titik Jaringan Air Bersih (Kab/Kota)' },
          { id: 'sitr-wms-78', label: 'Rencana SPAM (Kab/Kota)' },
          { id: 'sitr-wms-93', label: 'SSWP (Kab/Kota)' },
          { id: 'sitr-wms-112', label: 'Sistem Infrastruktur Sumber Daya Air' },
          { id: 'sitr-wms-116', label: 'Sistem Jaringan Sumber Daya Air' }
        ]},
        { subcat: 'Permukiman & prasarana', layers: [
          { id: 'sitr-wms-15', label: 'Sistem Jaringan Prasarana Lainnya' },
          { id: 'sitr-wms-25', label: 'Sistem Perkotaan' },
          { id: 'sitr-wms-33', label: 'Sistem Perkotaan (Kab/Kota)' },
          { id: 'sitr-wms-61', label: 'Rencana Sistem Perkotaan (Kab/Kota)' },
          { id: 'sitr-wms-111', label: 'Sistem Infrastruktur Prasarana Lain' },
          { id: 'sitr-wms-113', label: 'Sistem Pusat Permukiman' },
          { id: 'sitr-wms-115', label: 'Sistem Jaringan Prasarana Lain' }
        ]},
        { subcat: 'Persampahan & IPAL', layers: [
          { id: 'sitr-wms-36', label: 'Sistem Jaringan Persampahan (Kab/Kota)' },
          { id: 'sitr-wms-46', label: 'Rencana Cakupan Persampahan (Kab/Kota)' },
          { id: 'sitr-wms-47', label: 'Rencana Persampahan TPA (Kab/Kota)' },
          { id: 'sitr-wms-67', label: 'Rencana IPAL (Kab/Kota)' },
          { id: 'sitr-wms-68', label: 'Rencana Area Persampahan TPA (Kab/Kota)' },
          { id: 'sitr-wms-69', label: 'Rencana Persampahan TPS (Kab/Kota)' }
        ]}
      ]
    },
    {
      cat: 'Citra Udara & Peta BIG',
      subcats: (function () {
        var g = (typeof window.getFuCatalogGroups === 'function')
          ? window.getFuCatalogGroups()
          : { main: [], ctsrt: [], fu: [], digital: [] };
        var main = g.main && g.main.length ? g.main : [
          { id: 'toggleFuPadang', label: 'Foto Udara Padang 0715 (BIG)' },
          { id: 'toggleFuKendari', label: 'Foto Udara Kendari 2024 (BIG)' },
          { id: 'toggleFuBitung', label: 'Foto Udara Bitung 2024 (BIG)' },
          { id: 'toggleFuMakassar', label: 'Foto Udara Makassar 2024 (BIG)' },
          { id: 'toggleFuPlanetScope', label: 'Basemap PlanetScope Des 2025 (BIG)' }
        ];
        return [
          { subcat: 'Utama', layers: main },
          { subcat: 'Citra CTSRT', layers: g.ctsrt || [] },
          { subcat: 'Arsip Foto Udara', layers: g.fu || [] },
          { subcat: 'Peta Digital', layers: g.digital || [] }
        ];
      })()
    },
{
      cat: 'Lahan Baku Sawah',
      layers: [
        { id: 'toggleSawahGislinerLayer', label: 'Lahan Sawah Dilindungi (ATR/BPN)' },
        { id: 'bps-lbs-2024', label: 'Lahan Baku Sawah Nasional 2024' }
        { id: 'toggleSawahDilindungi', label: 'Lahan Sawah Dilindungi 50K (BIG)' },
        { id: 'toggleSawahNasional50k', label: 'Lahan Baku Sawah 50K (BIG)' },
        { id: 'arcgis-vt-lbs-2024', label: 'LBS 2024 (Vektor)' },
        { id: 'arcgis-sawah-2023', label: 'LBS 2023' },
        { id: 'arcgis-vt-lbs-2019', label: 'LBS 2019 (Vektor)' },
        { id: 'arcgis-sawah-2019', label: 'LBS 2019' },
        ]
    },
    {
      cat: 'Tutupan Lahan Global',
      subcats: [
        { subcat: 'Komposit tutupan lahan', layers: [
          { id: 'glcluc-composite2020', label: 'Komposit tutupan lahan 2020' },
          { id: 'glcluc-composite2000', label: 'Komposit tutupan lahan 2000' }
        ]},
        { subcat: 'Hutan & tutupan pohon', layers: [
          { id: 'glcluc-forest', label: 'Tutupan pohon (hutan)' }
        ]},
        { subcat: 'Lahan pertanian', layers: [
          { id: 'glcluc-cropland', label: 'Lahan pertanian' },
          { id: 'glcluc-cropland-invert', label: 'Lahan pertanian (inversi)' },
          { id: 'glcluc-crop03', label: 'Lahan pertanian 2003' },
          { id: 'glcluc-crop07', label: 'Lahan pertanian 2007' },
          { id: 'glcluc-crop11', label: 'Lahan pertanian 2011' },
          { id: 'glcluc-crop15', label: 'Lahan pertanian 2015' },
          { id: 'glcluc-crop19', label: 'Lahan pertanian 2019' },
          { id: 'glcluc-cropchange-only', label: 'Perubahan lahan pertanian' }
        ]},
        { subcat: 'Permukiman & bangunan', layers: [
          { id: 'glcluc-builtup', label: 'Permukiman & bangunan' },
          { id: 'glcluc-builtup-2', label: 'Permukiman & bangunan v2' }
        ]},
        { subcat: 'Air, salju & tutupan khusus', layers: [
          { id: 'glcluc-water', label: 'Air' },
          { id: 'glcluc-snow', label: 'Salju & es' }
        ]},
        { subcat: 'Perubahan tutupan lahan', layers: [
          { id: 'glcluc-change-mask', label: 'Mask perubahan tutupan lahan (2000-2020)' },
          { id: 'glcluc-change-hill', label: 'Hillshade perubahan tutupan lahan' }
        ]},
        { subcat: 'Natural Lands (NatLand)', layers: [
          { id: 'natland-classes', label: 'NatLand — tutupan lahan (kelas)' },
          { id: 'natland-binary', label: 'NatLand — alam vs non-alam' }
        ]}
      ]
    },
    {
      cat: 'Elevasi & Tutupan Lahan',
      layers: [
        { id: 'toggleHillshade', label: 'Relief permukaan (hillshade)' },
        { id: 'toggleBatnas', label: 'Kedalaman laut (BATNAS)' },
        { id: 'toggleProvinceBoundary', label: 'Batas Provinsi (PBF)' },
        { id: 'toggleBmkgTimezone', label: 'Batas Wilayah Waktu (BMKG)' },
        { id: 'toggleTollRoad', label: 'Jalan Tol Pulau Jawa' },
        { id: 'toggleNationalRoad', label: 'Jalan Nasional' },
        { id: 'toggleEoxOverlay', label: 'Labels Overlay (EOX)' }
      ]
    }
  ];

  /* Citra satelit dan sensor pengamatan bumi tetap berada di Peta Dasar
     agar dapat dipilih sebagai basemap. Foto udara BIG dikelompokkan terpisah. */
  (function organizeImageryLayers() {
    var bigIndex = LAYER_CATALOG_DATA.findIndex(function (category) { return category.cat === 'Citra Udara & Peta BIG'; });
    if (bigIndex >= 0) {
      var big = LAYER_CATALOG_DATA[bigIndex];
      big.cat = 'Foto Udara & Peta BIG';
      (big.subcats || []).forEach(function (group) {
        if (group.subcat === 'Arsip Foto Udara') group.subcat = 'Foto udara dan arsip';
      });
    }

    var terrain = LAYER_CATALOG_DATA.find(function (category) { return category.cat === 'Elevasi & Tutupan Lahan'; });
    var boundaries = [];
    var roads = [];
    if (terrain && terrain.layers) {
      terrain.layers = terrain.layers.filter(function (layer) {
        if (layer.id === 'toggleProvinceBoundary' || layer.id === 'toggleBmkgTimezone') { boundaries.push(layer); return false; }
        if (layer.id === 'toggleTollRoad' || layer.id === 'toggleNationalRoad') { roads.push(layer); return false; }
        return true;
      });
    }
    var transport = LAYER_CATALOG_DATA.find(function (category) { return category.cat === 'Transportasi'; });
    if (transport && roads.length) transport.layers = transport.layers.concat(roads);
    if (boundaries.length) {
      var bigPosition = LAYER_CATALOG_DATA.findIndex(function (category) { return category.cat === 'Foto Udara & Peta BIG'; });
      LAYER_CATALOG_DATA.splice(bigPosition + 1, 0, { cat: 'Batas & Referensi Wilayah', layers: boundaries });
    }
  })();

  var LAYER_CATALOG_DESCRIPTIONS = {
    'Peta Dasar': 'Peta untuk orientasi dan mencari lokasi. Pilih satu sebagai latar peta.',
    'Foto Udara & Peta BIG': 'Foto udara dan produk peta BIG untuk melihat detail kondisi wilayah.',
    'Batas & Referensi Wilayah': 'Batas administrasi dan pembagian wilayah yang membantu menemukan lokasi atau membandingkan data antarwilayah.',
    'Geologi & Tanah': 'Informasi batuan, struktur bumi, jenis tanah, dan sifat tanah.',
    'Transportasi': 'Jaringan jalan dan rute transportasi umum.',
    'Pertanian & Ketahanan Pangan': 'Lahan pertanian, komoditas, serta organisme pengganggu tanaman (OPT), yaitu hama dan penyakit tanaman, juga kondisi dan layanan pangan.',
      'ATRBPN': 'Layer resmi BHUMI (ATR/BPN): Persil Nasional dan Zona Nilai Tanah. Saat aktif, klik peta untuk melihat atribut pada titik tersebut.',
    'SITR Jawa Timur': 'Sistem Informasi Tata Ruang Provinsi Jawa Timur (Pemprov Jatim). 93 layer perencanaan tata ruang — pola ruang RTRW/Perda, jaringan transportasi, energi, telekomunikasi, sumber daya air, permukiman, dan persampahan — dalam enam kelompok. Klik layer untuk menampilkan; peta otomatis menuju Jawa Timur.',
    'Bencana & Risiko': 'Kejadian bencana, sumber bahaya, pemantauan, dan informasi kesiapsiagaan.',
    'Lingkungan & Laut': 'Ekosistem, kondisi perairan, dan indikator kualitas lingkungan.',
    'Cuaca, Iklim & Kualitas Udara': 'Prakiraan dan pengamatan cuaca, pola iklim, kekeringan, serta polutan udara.',
    'Hutan, Lahan & Konservasi': 'Kawasan hutan, lahan gambut, perkebunan, dan kawasan lindung.',
    'Peta Kehutanan & Lahan (SIGAP)': 'Data kehutanan dan lahan dari SIGAP KLHK: kawasan hutan, penggunaan lahan, perizinan, konservasi, kebakaran hutan, dan FOLU.',
    'Elevasi & Tutupan Lahan': 'Ketinggian dan bentuk permukaan bumi, kedalaman laut, serta jenis tutupan lahan.',
    'Tutupan Lahan Global (UMD GLAD)': 'Tutupan lahan global 30 m dari UMD GLAD Land & Carbon Lab (Landsat): komposit 2000 & 2020, hutan, lahan pertanian, permukiman, air, salju, perubahan tutupan lahan, serta kawasan alam NatLand.'
  };

  (function placeGeologyAfterBasemap() {
    var geologyIndex = LAYER_CATALOG_DATA.findIndex(function (category) { return category.cat === 'Geologi & Tanah'; });
    var basemapIndex = LAYER_CATALOG_DATA.findIndex(function (category) { return category.cat === 'Peta Dasar'; });
    if (geologyIndex < 0 || basemapIndex < 0 || geologyIndex === basemapIndex + 1) return;
    var geologyCategory = LAYER_CATALOG_DATA.splice(geologyIndex, 1)[0];
    basemapIndex = LAYER_CATALOG_DATA.findIndex(function (category) { return category.cat === 'Peta Dasar'; });
    LAYER_CATALOG_DATA.splice(basemapIndex + 1, 0, geologyCategory);
  })();

  var _layerCatalogOpen = false;
  var _layerCatalogState = {};
  var _geoportalCatalogIds = Object.create(null);
  var _pinnedLayers = [];
  var PINNED_MAX = 10;
  var _pinStorageKey = 'ruangkita-pinned-layers';

  function loadPinnedLayers() {
    try {
      var raw = localStorage.getItem(_pinStorageKey);
      if (raw) {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr)) _pinnedLayers = arr.slice(0, PINNED_MAX);
      }
    } catch (e) { _pinnedLayers = []; }
  }
  function savePinnedLayers() {
    try { localStorage.setItem(_pinStorageKey, JSON.stringify(_pinnedLayers)); } catch (e) {}
  }

  function bhumiIdentifyStateId(layer) { return 'bhumi-identify:' + layer; }
  function bhumiIdentifyActiveLayers() {
    var out = [];
    BHUMI_IDENTIFY_TEMPLAYERS.forEach(function(t) {
      if (_layerCatalogState[bhumiIdentifyStateId(t.layer)]) out.push(t.layer);
    });
    return out;
  }
  function bhumiIdentifySaveState() {
    try {
      var obj = {};
      BHUMI_IDENTIFY_TEMPLAYERS.forEach(function(t) {
        obj[t.layer] = _layerCatalogState[bhumiIdentifyStateId(t.layer)] === true;
      });
      localStorage.setItem(BHUMI_IDENTIFY_STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {}
  }
  function bhumiIdentifyHydrate() {
    var saved = null;
    try {
      var raw = localStorage.getItem(BHUMI_IDENTIFY_STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch (e) { saved = null; }
    BHUMI_IDENTIFY_TEMPLAYERS.forEach(function(t) {
      var v = (saved && typeof saved[t.layer] === 'boolean')
        ? saved[t.layer]
        : BHUMI_IDENTIFY_CORE.indexOf(t.layer) >= 0;
      _layerCatalogState[bhumiIdentifyStateId(t.layer)] = v;
    });
  }
  bhumiIdentifyHydrate();
  function isPinnedLayer(id) { return _pinnedLayers.indexOf(id) >= 0; }
  function togglePinLayer(id) {
    var idx = _pinnedLayers.indexOf(id);
    if (idx >= 0) {
      _pinnedLayers.splice(idx, 1);
    } else {
      if (_pinnedLayers.length >= PINNED_MAX) _pinnedLayers.pop();
      _pinnedLayers.unshift(id);
    }
    savePinnedLayers();
  }
  loadPinnedLayers();
  var removedCatalogLayerIds = [
    'toggleRtrwTmsLayer', 'toggleLsdTmsLayer',
    'toggleLbsTmsLayer', 'toggleDiTmsLayer', 'toggleSaluranIrTmsLayer',
    'atrbpn-wms-lsd-umum', 'atrbpn-wms-lahanbakusawah-new-sawah',
    'atrbpn-wms-lsd-12-provinsi-sawah', 'atrbpn-wms-lsd-8-provinsi-sawah',
    'st2023:batas_desa', 'st2023:batas_kecamatan', 'st2023:batas_kabupaten', 'st2023:batas_provinsi',
    'st2023:dasymetric_utp', 'st2023:dasymetric_utp_tp', 'st2023:dasymetric_utp_horti',
    'st2023:dasymetric_utp_holti', 'st2023:dasymetric_utp_hutan', 'st2023:dasymetric_utp_ikan',
    'st2023:dasymetric_utp_kebun', 'st2023:dasymetric_utp_milenial', 'st2023:dasymetric_utp_ternak',
    'st2023:dasymetric_utp_urban', 'st2023:geotagging', 'st2023:geotagging_tanaman_pangan',
    'st2023:geotagging_hortikultura', 'st2023:geotagging_kebun', 'st2023:geotagging_hutan',
    'st2023:geotagging_ikan', 'st2023:geotagging_ternak', 'st2023:infrastruktur_pertanian',
    'st2023:gurem_lahan_vw', 'st2023:utp_ihk_01', 'st2023:utp_ihk_02', 'st2023:utp_ihk_03',
    'st2023:utp_ihk_04', 'st2023:utp_ihk_05', 'st2023:utp_ihk_06', 'st2023:utp_ihk_07',
    'st2023:utp_ihk_08', 'st2023:utp_ihk_09', 'st2023:utp_ihk_10', 'st2023:utp_ihk_11',
    'st2023:utp_ihk_12', 'st2023:utp_ihk_13', 'st2023:utp_ihk_14', 'st2023:utp_ihk_15',
    'st2023:utp_ihk_16', 'st2023:utp_ihk_17'
  ];
  _pinnedLayers = _pinnedLayers.filter(function (id) {
    return removedCatalogLayerIds.indexOf(id) === -1 &&
      (id.indexOf('bhumi-identify:') !== 0 || id === 'bhumi-identify:umum:ZNTRANGE');
  });
  savePinnedLayers();
  // Layer utama selalu diprioritaskan dalam pin bawaan katalog.
  var _defaultPinnedLayers = [
    'petadasar-bpn',
    'toggleBhumiPersilNasionalLayer',
    'isee-soil-orders',
    'toggleHwsdIndonesia',
    'toggleFsvaLayer',
    'toggleFaultLayerNew',
    'toggleTransjakarta',
    'toggleBouguerBMKG'
  ];
  _defaultPinnedLayers.forEach(function (id) {
    var idx = _pinnedLayers.indexOf(id);
    if (idx >= 0) _pinnedLayers.splice(idx, 1);
  });
  _pinnedLayers = _defaultPinnedLayers.concat(_pinnedLayers).slice(0, PINNED_MAX);
  savePinnedLayers();

  /* Kategori dari sumber eksternal (IGTPR) dimuat saat katalog pertama kali
     dibuka, bukan saat halaman dimuat: daftar layer-nya 52 KB dan tidak
     perlu ikut membebani waktu muat awal. Modul sumber menyediakan
     ensureDynamicCatalogLoaded() yang idempoten. */
  function muatKategoriDinamis() {
    if (typeof window.ensureDynamicCatalogLoaded !== 'function') return;
    try { window.ensureDynamicCatalogLoaded(); } catch (e) { /* sumber gagal, katalog tetap jalan */ }
  }

  function toggleLayerCatalog() {
    var dd = document.getElementById('layerCatalogDropdown');
    var btn = document.getElementById('layerCatalogBtn');
    if (!dd || !btn) return;
    _layerCatalogOpen = !_layerCatalogOpen;
    dd.classList.toggle('open', _layerCatalogOpen);
    btn.classList.toggle('active', _layerCatalogOpen);
    /* Blok export GeoTIFF ikut disembunyikan selama katalog terbuka:
       di mobile z-index blok (99998) menang atas dropdown (.unified-search
       1000), jadi tanpa ini tombol menutupi daftar layer. */
    document.body.classList.toggle('layer-catalog-open', _layerCatalogOpen);
    muatKategoriDinamis();
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
    document.body.classList.remove('layer-catalog-open');
    _layerCatalogOpen = false;
  }
  window.closeLayerCatalog = closeLayerCatalog;

  function buildLayerCatalogIfNeeded() {
    var dd = document.getElementById('layerCatalogDropdown');
    if (dd && !dd.dataset.built && typeof buildLayerCatalog === 'function') {
      buildLayerCatalog(dd);
      dd.dataset.built = '1';
    }
  }
  window.buildLayerCatalogIfNeeded = buildLayerCatalogIfNeeded;

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
      var id = cb.dataset.layerId;
      /* el: elemen DOM dengan id sama (mis. checkbox sidebar di luar katalog).
         Dulu variabel ini tidak pernah dideklarasikan sehingga sync melempar
         ReferenceError bila global el tidak kebetulan ada. */
      var el = findLayerById(id);
      if (cb.dataset.geoportalKey && typeof window.isGeoportalCatalogLayerActive === 'function') {
        cb.checked = window.isGeoportalCatalogLayerActive(cb.dataset.geoportalKey);
        _layerCatalogState[id] = cb.checked;
        if (id === 'rdtr-2022-dki-siap' && cb.checked && typeof map !== 'undefined' && map) {
          map.flyTo([-6.1754, 106.8272], 11, { duration: 1.2 });
          // Load ArcGIS Feature Layer
          if (!window._rdtrLayer) {
            window._rdtrLayer = loadArcgisFeatureLayer('https://dki-siap.atrbpn.go.id/server/rest/services/RDTR_2022/MapServer', function(layer) {
              if (layer && !map.hasLayer(layer)) {
                map.addLayer(layer);
              }
            });
          }
        } else if (id === 'rdtr-2022-dki-siap' && !cb.checked && window._rdtrLayer && map) {
          // Remove layer when unchecked
          if (map.hasLayer(window._rdtrLayer)) {
            map.removeLayer(window._rdtrLayer);
          }
          window._rdtrLayer = null;
        }
      } else if (cb.dataset.dynamicKey && typeof window.isDynamicCatalogLayerActive === 'function') {
        cb.checked = window.isDynamicCatalogLayerActive(cb.dataset.dynamicKey);
        _layerCatalogState[id] = cb.checked;
      } else if (el) {
        cb.checked = el.checked;
      } else if (cb.dataset.layerId === 'toggleHujanLayer' && typeof isHujanLayerActive === 'function') {
        cb.checked = isHujanLayerActive();
      } else if (cb.dataset.layerId === 'toggleBumiPersilLayer' && typeof window.isBumiPersilLayerActive === 'function') {
        cb.checked = window.isBumiPersilLayerActive();
      } else if (cb.dataset.layerId === 'toggleGistaruPersilLayer' && typeof window.isGistaruPersilLayerActive === 'function') {
        cb.checked = window.isGistaruPersilLayerActive();
      } else if (_layerCatalogState.hasOwnProperty(id)) {
        cb.checked = _layerCatalogState[id];
      }
    });
  }

  function loadArcgisFeatureLayer(layerUrl, callback) {
    if (typeof L !== 'undefined' && L.esri && L.esri.featureLayer) {
      var layer = L.esri.featureLayer(layerUrl);
      if (callback) callback(layer);
      return layer;
    }
    fetch(layerUrl + '?f=json')
      .then(function(r) { return r.json(); })
      .then(function(json) {
        var layer = L.geoJSON(json.features, { style: function(feature) { return { color: '#3388ff', weight: 1, fillOpacity: 0.4 }; } });
        if (callback) callback(layer);
        return layer;
      });
  }

  window.setLayerCatalogCheckboxState = function (id, checked) {
    _layerCatalogState[id] = !!checked;
    document.querySelectorAll('.lc-item input[type="checkbox"]').forEach(function (cb) {
      if (cb.dataset.layerId === id) cb.checked = !!checked;
    });
  };

  /* ── Kategori katalog dari sumber eksternal ──
   * Dipakai IGTPR ATR/BPN yang punya 788 layer, terlalu banyak untuk ditulis
   * satu per satu di LAYER_CATALOG_DATA. Daftar layer dikirim modul sumber
   * lewat registerDynamicLayerCategory() saat katalog dibuka pertama kali.
   *
   * Bedanya dari registerGeoportalCatalogLayers: checkbox memakai atribut
   * `dynamicKey`, bukan `geoportalKey`, supaya tidak grabbed oleh
   * window.toggleGeoportalCatalogLayer milik geoportal.js yang terikat ke
   * tree jsTree GeoPortal Hub. */
  window.registerDynamicLayerCategory = function (opts) {
    opts = opts || {};
    var signature = opts.signature;
    LAYER_CATALOG_DATA = LAYER_CATALOG_DATA.filter(function (category) {
      return category.dynamicSignature !== signature;
    });
    if (!opts.title || !opts.layers || !opts.layers.length) {
      var rebuilt = document.getElementById('layerCatalogDropdown');
      if (rebuilt && rebuilt.dataset.built) buildLayerCatalog(rebuilt);
      return;
    }
    LAYER_CATALOG_DATA.push({
      cat: opts.title,
      dynamicSignature: signature,
      subcats: opts.subcats || [{ subcat: opts.subcat || opts.title, layers: opts.layers }]
    });
    var dropdown = document.getElementById('layerCatalogDropdown');
    if (dropdown && dropdown.dataset.built) buildLayerCatalog(dropdown);
  };

  window.registerGeoportalCatalogLayers = function (sourceLayers) {
    LAYER_CATALOG_DATA = LAYER_CATALOG_DATA.filter(function (category) { return !category.geoportalSource; });
    _geoportalCatalogIds = Object.create(null);
    var sources = Object.create(null);
    (sourceLayers || []).forEach(function (sourceLayer, index) {
      var url = sourceLayer.wmsUrl || '';
      if (!url) return;
      if (!sources[url]) sources[url] = { groups: Object.create(null), order: [] };
      var source = sources[url];
      var groupName = sourceLayer.category || 'Layer lainnya';
      if (!source.groups[groupName]) { source.groups[groupName] = []; source.order.push(groupName); }
      var key = url + '::' + sourceLayer.id;
      var id = 'geoportal-hub-' + index;
      _geoportalCatalogIds[key] = id;
      if (typeof window.isGeoportalCatalogLayerActive === 'function') {
        _layerCatalogState[id] = window.isGeoportalCatalogLayerActive(key);
      }
      source.groups[groupName].push({ id: id, label: sourceLayer.label || sourceLayer.id, geoportalKey: key });
    });
    Object.keys(sources).forEach(function (url) {
      var source = sources[url];
      var category = {
        cat: source.order[0] || 'GeoPortal',
        geoportalSource: true
      };
      if (source.order.length === 1) {
        category.layers = source.groups[source.order[0]];
      } else {
        category.subcats = source.order.map(function (name) { return { subcat: name, layers: source.groups[name] }; });
      }
      LAYER_CATALOG_DATA.push(category);
    });
    var dropdown = document.getElementById('layerCatalogDropdown');
    if (dropdown && dropdown.dataset.built) buildLayerCatalog(dropdown);
  };

  window.setGeoportalCatalogLayerState = function (key, checked) {
    var id = _geoportalCatalogIds[key];
    if (!id) return;
    _layerCatalogState[id] = !!checked;
    document.querySelectorAll('.lc-item input[type="checkbox"]').forEach(function (checkbox) {
      if (checkbox.dataset.layerId === id) {
        checkbox.checked = !!checked;
        updateCatCount(checkbox.closest('.lc-category'));
      }
    });
    var dropdown = document.getElementById('layerCatalogDropdown');
    if (dropdown) delete dropdown.dataset.built;
  };

  /* Kategori bertanda `hidden` tidak dirender di Katalog Layer. Dipakai untuk
   * menyembunyikan sebuah kategori tanpa menghapus definisinya -- toggle
   * window.toggleBumiPersilLayer & friends tetap hidup dan masih bisa dipanggil
   * dari modul lain. Hapus flagnya untuk mengunculkan kembali. */
  function visibleCatalogCategories() {
    return LAYER_CATALOG_DATA.filter(function (cat) { return !cat.hidden; });
  }

  function buildLayerCatalog(container) {
    var html = '<div class="lc-donation-banner">' +
      '<div class="lc-donation-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg></div>' +
      '<div class="lc-donation-copy"><span class="lc-donation-eyebrow">DUKUNG PETA INDONESIA</span><strong class="lc-donation-text">Bantu RUANGKITA terus berkembang</strong><span class="lc-donation-note">Donasi Anda membantu biaya server, data, dan fitur baru.</span></div>' +
      '<div class="lc-donation-btns">' +
        '<a href="https://saweria.co/maspannn" target="_blank" rel="noopener noreferrer" class="lc-donation-btn lc-donation-saweria">Donasi</a>' +
        '<a href="https://www.paypal.com/paypalme/panjidanutirto" target="_blank" rel="noopener noreferrer" class="lc-donation-btn lc-donation-paypal" aria-label="Donasi melalui PayPal">PayPal</a>' +
      '</div>' +
    '</div>';
    /* Kotak cari tepat di bawah banner donasi, sebelum grup Layer Dipin.
       Sebelumnya ia diletakkan di antara grup "Layer Aktif" dan daftar
       kategori, sehingga tidak terlihat tanpa menggulir -- padahal itu cara
       paling cepat menjangkau layer yang namanya sulit diingat. */
    html += '<input type="text" class="lc-search lc-search-top" placeholder="Cari layer..." />';

      var pinIconOutline = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 11l-4 4h14l-4-4V5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2z"/></svg>';
      var pinIconFilled = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 11l-4 4h14l-4-4V5a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2z"/></svg>';

      var pinnedItems = [];
      if (_pinnedLayers.length > 0) {
        visibleCatalogCategories().forEach(function(cat) {
          var allLayers = cat.layers || [];
          if (cat.subcats) {
            cat.subcats.forEach(function(sc) { allLayers = allLayers.concat(sc.layers || []); });
          }
          if (cat.type === 'basemap' && cat.groups) {
            cat.groups.forEach(function(grp) { allLayers = allLayers.concat(grp.layers || []); });
          }
          allLayers.forEach(function(l) {
            var pi = _pinnedLayers.indexOf(l.id);
            if (pi >= 0) pinnedItems.push({ layer: l, order: pi, isBasemap: cat.type === 'basemap' });
          });
        });
        pinnedItems.sort(function (a, b) { return a.order - b.order; });
      }

      if (pinnedItems.length > 0) {
        html += '<div class="lc-category lc-pinned-group open">';
        html += '<div class="lc-pinned-header">';
        html += '<button class="lc-cat-header lc-pinned-header-btn" type="button">';
        html += '<svg class="lc-cat-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
        html += '<span class="lc-cat-title lc-pinned-title">Layer Dipin</span>';
        html += '<span class="lc-cat-count">' + pinnedItems.length + ' / ' + PINNED_MAX + '</span>';
        html += '</button>';
        html += '<button class="lc-unpin-all" type="button" id="lcUnpinAll">Hapus Semua Pin</button>';
        html += '</div>';
        html += '<div class="lc-items">';
        pinnedItems.forEach(function(pi) {
          var l = pi.layer;
          if (pi.isBasemap) {
            var isActive = (l.id === currentBasemapName);
            html += '<div class="lc-item lc-item-pinned' + (isActive ? ' lc-basemap-active' : '') + '">';
            html += '<input type="radio" name="lc-basemap-pin" id="lc_bm_pin_' + l.id + '" data-basemap-id="' + l.id + '"' + (isActive ? ' checked' : '') + ' />';
            html += '<label for="lc_bm_pin_' + l.id + '">' + l.label + '</label>';
            html += '<div class="lc-item-actions">';
            if (isActive) html += '<span class="lc-basemap-badge">Aktif</span>';
            html += '<button type="button" class="lc-pin-btn lc-pin-btn-active" data-layer-id="' + l.id + '" title="Hapus Pin">' + pinIconFilled + '</button>';
            html += '</div></div>';
          } else {
            var el = findLayerById(l.id);
            var isChecked = el ? el.checked : (_layerCatalogState[l.id] || false);
            if (l.id === 'toggleHujanLayer' && typeof isHujanLayerActive === 'function') isChecked = isHujanLayerActive();
            html += '<div class="lc-item lc-item-pinned">';
            html += '<input type="checkbox" id="lc_pin_' + l.id + '" data-layer-id="' + l.id + '"' + (l.geoportalKey ? ' data-geoportal-key="' + l.geoportalKey + '"' : '') + (isChecked ? ' checked' : '') + ' />';
            html += '<label for="lc_pin_' + l.id + '">' + l.label + '</label>';
            html += '<div class="lc-item-actions">';
            if (l.id !== 'toggleBmkgNormalHujan' && (l.id.indexOf('isee-soil-') !== 0 || l.id === 'isee-soil-boundaries')) {
              html += '<button type="button" class="lc-attr-btn' + ((isChecked || l.id === 'isee-soil-boundaries') ? ' lc-attr-btn-show' : '') + '" data-layer-id="' + l.id + '" title="Buka Tabel Atribut">';
              html += '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="12" height="12" rx="1.5"/><line x1="2" y1="5.5" x2="14" y2="5.5"/><line x1="2" y1="9" x2="14" y2="9"/><line x1="5.5" y1="2" x2="5.5" y2="14"/><line x1="9" y1="2" x2="9" y2="14"/></svg>';
              html += '</button>';
            }
            html += '<button type="button" class="lc-pin-btn lc-pin-btn-active" data-layer-id="' + l.id + '" title="Hapus Pin">' + pinIconFilled + '</button>';
            html += '</div></div>';
          }
        });
        html += '</div></div>';
      }

      var activeLayers = [];
      visibleCatalogCategories().forEach(function(cat) {
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

    /* Grup "Layer Aktif" sengaja TIDAK diberi open: semua kategori tertutup
       kecuali Layer Dipin, dan grup ini ikut tertutup supaya aturannya
       seragam. Yang aktif tetap kelihatan lewat badge jumlah di header. */
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

    visibleCatalogCategories().forEach(function(cat, ci) {
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
      /* Semua kategori mulai tertutup agar katalog lebih ringan dirender. */
      html += '<div class="lc-category" data-ci="' + ci + '">';
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
      if (LAYER_CATALOG_DESCRIPTIONS[cat.cat]) {
        html += '<p class="lc-category-description">' + LAYER_CATALOG_DESCRIPTIONS[cat.cat] + '</p>';
      }
      if (cat.type === 'basemap' && cat.groups) {
        cat.groups.forEach(function(grp) {
          html += '<div class="lc-basemap-group">' + grp.group + '</div>';
          grp.layers.forEach(function(l) {
            var isActive = (l.id === currentBasemapName);
            var bmPinned = isPinnedLayer(l.id);
            html += '<div class="lc-item lc-basemap-item' + (isActive ? ' lc-basemap-active' : '') + '" data-basemap-id="' + l.id + '">';
            html += '<input type="radio" name="lc-basemap" id="lc_bm_' + l.id + '" data-basemap-id="' + l.id + '"' + (isActive ? ' checked' : '') + ' />';
            html += '<label for="lc_bm_' + l.id + '">' + l.label + '</label>';
            html += '<div class="lc-item-actions">';
            if (isActive) html += '<span class="lc-basemap-badge">Aktif</span>';
            html += '<button type="button" class="lc-pin-btn' + (bmPinned ? ' lc-pin-btn-active' : '') + '" data-layer-id="' + l.id + '" title="' + (bmPinned ? 'Hapus Pin' : 'Pin Layer') + '">' + (bmPinned ? pinIconFilled : pinIconOutline) + '</button>';
            html += '</div></div>';
          });
        });
      } else if (cat.subcats) {
        cat.subcats.forEach(function(sc) {
          html += '<div class="lc-subcat-header">' + sc.subcat + '</div>';
          (sc.layers || []).forEach(function(l) {
            if (l.href) {
              html += '<div class="lc-item"><a href="' + l.href + '" target="_blank" rel="noopener noreferrer" style="padding:8px 10px;color:#2563eb;font-size:12px;font-weight:600;text-decoration:none;">' + l.label + ' ↗</a></div>';
              return;
            }
            var el = findLayerById(l.id);
            var isChecked = el ? el.checked : (_layerCatalogState[l.id] || false);
            if (l.id === 'toggleHujanLayer' && typeof isHujanLayerActive === 'function') {
              isChecked = isHujanLayerActive();
            }
            var isBhumiEntry = l.id.indexOf('bhumi-') === 0;
            html += '<div class="lc-item' + (l.unavailable ? ' lc-item-unavailable' : '') + '">';
html += '<input type="checkbox" id="lc_' + l.id + '" data-layer-id="' + l.id + '"' + (l.geoportalKey ? ' data-geoportal-key="' + l.geoportalKey + '"' : '') + (l.dynamicKey ? ' data-dynamic-key="' + l.dynamicKey + '"' : '') + (l.unavailable ? ' disabled' : '') + (isChecked ? ' checked' : '') + ' />';
            html += '<label for="lc_' + l.id + '">' + l.label + '</label>';
            html += '<div class="lc-item-actions">';
            if (!isBhumiEntry && l.id !== 'toggleBmkgNormalHujan' && (l.id.indexOf('isee-soil-') !== 0 || l.id === 'isee-soil-boundaries')) {
              html += '<button type="button" class="lc-attr-btn' + ((isChecked || l.id === 'isee-soil-boundaries') ? ' lc-attr-btn-show' : '') + '" data-layer-id="' + l.id + '" title="Buka Tabel Atribut">';
              html += '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="12" height="12" rx="1.5"/><line x1="2" y1="5.5" x2="14" y2="5.5"/><line x1="2" y1="9" x2="14" y2="9"/><line x1="5.5" y1="2" x2="5.5" y2="14"/><line x1="9" y1="2" x2="9" y2="14"/></svg>';
              html += '</button>';
            }
            if (!isBhumiEntry) {
              var pinned = isPinnedLayer(l.id);
              html += '<button type="button" class="lc-pin-btn' + (pinned ? ' lc-pin-btn-active' : '') + '" data-layer-id="' + l.id + '" title="' + (pinned ? 'Hapus Pin' : 'Pin Layer') + '">' + (pinned ? pinIconFilled : pinIconOutline) + '</button>';
            }
            html += '</div></div>';
            if (l.id === 'toggleBmkgNormalHujan') {
              var selectedMonth = Number(window._bmkgNormalHujanMonth || 0);
              var monthLabels = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
              html += '<div style="padding:2px 10px 10px 30px;"><label for="bmkgNormalHujanMonth" style="display:block;font-size:11px;margin-bottom:4px;">Pilih bulan</label><select id="bmkgNormalHujanMonth" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#334155;font-size:12px;">';
              monthLabels.forEach(function(month, index) { html += '<option value="' + index + '"' + (selectedMonth === index ? ' selected' : '') + '>' + month + '</option>'; });
              html += '</select><small style="display:block;margin-top:4px;color:#64748b;">Rata-rata klimatologis 30 tahun · BMKG</small></div>';
            }
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
          html += '<input type="checkbox" id="lc_' + l.id + '" data-layer-id="' + l.id + '"' + (l.geoportalKey ? ' data-geoportal-key="' + l.geoportalKey + '"' : '') + (isChecked ? ' checked' : '') + ' />';
          html += '<label for="lc_' + l.id + '">' + l.label + '</label>';
          html += '<div class="lc-item-actions">';
          /* Layer dari kategori dinamis (IGTPR) adalah WMS tile raster tanpa
             tabel atribut, jadi tombol tabel atribut disembunyikan. */
          if (!l.dynamicKey && l.id !== 'toggleHwsdIndonesia' && l.id.indexOf('kwshutan-planologi') !== 0 && l.id.indexOf('brmp-provitas') !== 0 && l.id.indexOf('brmp-ip') !== 0 && l.id.indexOf('brmp-sc') !== 0 && (l.id.indexOf('isee-soil-') !== 0 || l.id === 'isee-soil-boundaries')) {
            html += '<button type="button" class="lc-attr-btn' + ((isChecked || l.id === 'toggleJenisTanahJateng' || l.id === 'toggleGeologiArcGISOnline' || l.id === 'isee-soil-boundaries') ? ' lc-attr-btn-show' : '') + '" data-layer-id="' + l.id + '" title="Buka Tabel Atribut">';
            html += '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="12" height="12" rx="1.5"/><line x1="2" y1="5.5" x2="14" y2="5.5"/><line x1="2" y1="9" x2="14" y2="9"/><line x1="5.5" y1="2" x2="5.5" y2="14"/><line x1="9" y1="2" x2="9" y2="14"/></svg>';
            html += '</button>';
          }
          if (l.id === 'toggleJenisTanahJateng') html += '<button type="button" class="lc-fit-btn" data-layer-id="' + l.id + '" title="Arahkan peta ke seluruh Jawa Tengah" aria-label="Arahkan peta ke seluruh Jawa Tengah"><svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13 13 3M5 3h8v8"/></svg></button>';
          if (l.id === 'toggleGeologiArcGISOnline') html += '<button type="button" class="lc-fit-btn" data-layer-id="' + l.id + '" title="Arahkan peta ke seluruh data geologi" aria-label="Arahkan peta ke seluruh data geologi"><svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13 13 3M5 3h8v8"/></svg></button>';
          var pinned2 = isPinnedLayer(l.id);
          html += '<button type="button" class="lc-pin-btn' + (pinned2 ? ' lc-pin-btn-active' : '') + '" data-layer-id="' + l.id + '" title="' + (pinned2 ? 'Hapus Pin' : 'Pin Layer') + '">' + (pinned2 ? pinIconFilled : pinIconOutline) + '</button>';
          html += '</div></div>';
        });
      }
      html += '</div></div>';
    });

    container.innerHTML = html;
    container.classList.remove('lc-search-active');

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

    var unpinAllBtn = document.getElementById('lcUnpinAll');
    if (unpinAllBtn) {
      unpinAllBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        _pinnedLayers = [];
        savePinnedLayers();
        buildLayerCatalog(container);
      });
    }

    container.querySelectorAll('.lc-pin-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = btn.dataset.layerId;
        togglePinLayer(id);
        buildLayerCatalog(container);
      });
    });

    container.querySelectorAll('.lc-cat-header').forEach(function(btn) {
      btn.addEventListener('click', function() {
        btn.closest('.lc-category').classList.toggle('open');
      });
    });

    container.querySelectorAll('.lc-item[data-basemap-id]').forEach(function(item) {
      item.addEventListener('click', function(e) {
        if (e.target.closest('input, label, button')) return;
        var radio = item.querySelector('input[type="radio"]');
        if (radio && !radio.checked) radio.click();
      });
    });

    container.querySelectorAll('input[name="lc-basemap"]').forEach(function(radio) {
      radio.addEventListener('change', function() {
        var bmId = radio.dataset.basemapId;
        var categoryIndex = radio.closest('.lc-category') && radio.closest('.lc-category').dataset.ci;
        setBaseMap(bmId);
        buildLayerCatalog(container);
        if (categoryIndex != null) {
          var restoredCategory = container.querySelector('.lc-category[data-ci="' + categoryIndex + '"]');
          if (restoredCategory) restoredCategory.classList.add('open');
        }
      });
    });

    container.querySelectorAll('input[name="lc-basemap-pin"]').forEach(function(radio) {
      radio.addEventListener('change', function() {
        var bmId = radio.dataset.basemapId;
        setBaseMap(bmId);
        buildLayerCatalog(container);
      });
    });

    container.querySelectorAll('.lc-item input[type="checkbox"]').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var id = cb.dataset.layerId;
        var hasWindowToggle = !!cb.dataset.geoportalKey || !!cb.dataset.dynamicKey ||
          (id === 'toggleSignificantMarkers' && typeof window.toggleSignificantMarkers === 'function') ||
          (id === 'toggleFeltMarkers' && typeof window.toggleFeltMarkers === 'function') ||
          (id === 'toggleLatestEarthquake' && typeof window.toggleLatestEarthquake === 'function') ||
          (id === 'toggleSebaranPasar' && typeof window.toggleSebaranPasar === 'function') ||
          (id === 'toggleSppgSebaranLayer' && typeof window.toggleSppgSebaranLayer === 'function') ||
          (id === 'toggleSppgLayer' && typeof window.toggleSppg === 'function') ||
          (id === 'toggleSppgDistrictLayer' && typeof window.toggleSppgDistrictLayer === 'function') ||
          (id === 'toggleTransjakarta' && typeof window.toggleTransjakarta === 'function') ||
          (id === 'toggleTransjogja' && typeof window.toggleTransjogja === 'function') ||
          (id === 'toggleTollRoad' && typeof window.toggleTollRoadLayer === 'function') ||
          (id === 'toggleNationalRoad' && typeof window.toggleNationalRoadLayer === 'function') ||
          (id === 'toggleNonTollRoad' && typeof window.toggleNonTollRoadLayer === 'function') ||
          (id === 'toggleBumiPersilLayer' && typeof window.toggleBumiPersilLayer === 'function') ||
          (id === 'toggleGistaruPersilLayer' && typeof window.toggleGistaruPersilLayer === 'function') ||
          (id === 'toggleBhumiPersilNasionalLayer' && typeof window.toggleBhumiPersilNasionalLayer === 'function') ||
          (id === 'toggleSawahGislinerLayer' && typeof window.toggleSawahGislinerLayer === 'function') ||
          (id === 'toggleJenisTanahJateng' && typeof window.toggleJenisTanahJateng === 'function') ||
          (id === 'toggleHwsdIndonesia' && typeof window.toggleHwsdIndonesia === 'function') ||
          (id === 'toggleGeologiArcGISOnline' && typeof window.toggleGeologiArcGISOnline === 'function') ||
          (id === 'toggleBouguerBMKG' && typeof window.toggleBouguerBMKG === 'function') ||
          (id === 'toggleBmkgCurahHujan' && typeof window.toggleBmkgCurahHujan === 'function') ||
          (id === 'toggleBmkgHariHujan' && typeof window.toggleBmkgHariHujan === 'function') ||
          (id === 'toggleBmkgNormalHujan' && typeof window.toggleBmkgNormalHujan === 'function') ||
          (id.indexOf('isric-soil-') === 0 && typeof window.toggleIsricSoilLayer === 'function') ||
          (id.indexOf('isee-soil-') === 0 && typeof window.toggleIseeSoilLayer === 'function') ||
          (id === 'toggleHujanLayer') ||
          (id === 'toggleFsvaLayer' && typeof window.toggleFsvaLayer === 'function') ||
          id.indexOf('st2023:') === 0 ||
          id === 'bps-lbs-2024' ||
          id.indexOf('arcgis-') === 0 ||
           id === 'toggleChlorophyllOverlay' ||
            id === 'toggleParOverlay' ||
           (id.indexOf('opt-') === 0 && typeof window.toggleOPTPest === 'function') ||
           (id.indexOf('optp-') === 0 && typeof window.toggleOPTPerkebunan === 'function') ||
           (id.indexOf('opth-') === 0 && typeof window.toggleOPTHorti === 'function') ||
           (id.indexOf('kategori-opt-') === 0 && typeof window.toggleKategoriWilayahOpt === 'function') ||
           (id === 'toggleSawahDilindungi' && typeof window.toggleSawahDilindungiLayer === 'function') ||
          id === 'toggleSawahNasional50k' ||
          id === 'toggleErosiLayer' ||
           id === 'toggleLsdTmsLayer' ||
           id === 'toggleLbsTmsLayer' ||
           id === 'toggleDiTmsLayer' ||
           id === 'toggleSaluranIrTmsLayer' ||
           id === 'toggleRtrwTmsLayer' ||
           id.indexOf('atrbpn-wms-') === 0 ||
           id.indexOf('sigap-') === 0 ||
           id.indexOf('kwshutan-planologi') === 0 ||
           id.indexOf('brmp-provitas') === 0 || id.indexOf('brmp-ip') === 0 || id.indexOf('brmp-sc') === 0 ||
            ((id.indexOf('glcluc-') === 0 || id.indexOf('natland-') === 0) && typeof window.toggleLclTileLayer === 'function') ||
           id === 'toggleSekolahLayer' ||
          id.indexOf('omi-') === 0 ||
           id === 'toggleEoxOverlay' ||
            (id.indexOf('toggleFu') === 0 && typeof window.toggleFuLayer === 'function');
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
        if (id.indexOf('bhumi-identify:') === 0) bhumiIdentifySaveState();
        if (id === 'toggleSignificantMarkers' && typeof window.toggleSignificantMarkers === 'function') {
          window.toggleSignificantMarkers(cb.checked);
        }
        if (id === 'toggleFeltMarkers' && typeof window.toggleFeltMarkers === 'function') {
          window.toggleFeltMarkers(cb.checked);
        }
        if (id === 'toggleLatestEarthquake' && typeof window.toggleLatestEarthquake === 'function') {
          window.toggleLatestEarthquake(cb.checked);
        }
if (cb.dataset.geoportalKey && typeof window.toggleGeoportalCatalogLayer === 'function') {
          window.toggleGeoportalCatalogLayer(cb.dataset.geoportalKey, cb.checked);
        }
        if (cb.dataset.dynamicKey && typeof window.toggleDynamicCatalogLayer === 'function') {
          window.toggleDynamicCatalogLayer(cb.dataset.dynamicKey, cb.checked);
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
         if (id === 'toggleSppgDistrictLayer' && typeof window.toggleSppgDistrictLayer === 'function') {
           window.toggleSppgDistrictLayer(cb.checked);
         }
        if (id.indexOf('opt-') === 0 && typeof window.toggleOPTPest === 'function') {
          window.toggleOPTPest(id, cb.checked);
        }
        if (id.indexOf('optp-') === 0 && typeof window.toggleOPTPerkebunan === 'function') {
          window.toggleOPTPerkebunan(id, cb.checked);
        }
        if (id.indexOf('opth-') === 0 && typeof window.toggleOPTHorti === 'function') {
          window.toggleOPTHorti(id, cb.checked);
        }
        if (id.indexOf('kategori-opt-') === 0 && typeof window.toggleKategoriWilayahOpt === 'function') {
          window.toggleKategoriWilayahOpt(id, cb.checked);
        }
        if (id === 'toggleTransjakarta' && typeof window.toggleTransjakarta === 'function') {
          window.toggleTransjakarta(cb.checked);
        }
        if (id === 'toggleTransjogja' && typeof window.toggleTransjogja === 'function') {
          window.toggleTransjogja(cb.checked);
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
        if (id === 'toggleGistaruPersilLayer' && typeof window.toggleGistaruPersilLayer === 'function') {
          window.toggleGistaruPersilLayer(cb.checked);
        }
        if (id === 'toggleBhumiPersilNasionalLayer' && typeof window.toggleBhumiPersilNasionalLayer === 'function') {
          window.toggleBhumiPersilNasionalLayer(cb.checked);
        }
        if (id === 'toggleSawahGislinerLayer' && typeof window.toggleSawahGislinerLayer === 'function') {
          window.toggleSawahGislinerLayer(cb.checked);
        }
        if (id === 'toggleJenisTanahJateng' && typeof window.toggleJenisTanahJateng === 'function') {
          window.toggleJenisTanahJateng(cb.checked);
          if (cb.checked && typeof window.openJenisTanahJatengTable === 'function') {
            window.openJenisTanahJatengTable();
          }
          if (cb.checked && typeof window.flyToJenisTanahJateng === 'function') {
            window.flyToJenisTanahJateng();
          }
        }
        if (id === 'toggleHwsdIndonesia' && typeof window.toggleHwsdIndonesia === 'function') {
          window.toggleHwsdIndonesia(cb.checked);
        }
        if (id === 'toggleGeologiBNPB' && typeof window.toggleGeologiBNPB === 'function') {
          window.toggleGeologiBNPB(cb.checked);
        }
        if (id === 'toggleGeologiArcGISOnline' && typeof window.toggleGeologiArcGISOnline === 'function') {
          window.toggleGeologiArcGISOnline(cb.checked);
        }
        if (id === 'toggleBouguerBMKG' && typeof window.toggleBouguerBMKG === 'function') {
          window.toggleBouguerBMKG(cb.checked);
        }
        if (id === 'toggleBmkgCurahHujan' && typeof window.toggleBmkgCurahHujan === 'function') {
          window.toggleBmkgCurahHujan(cb.checked);
        }
        if (id === 'toggleBmkgHariHujan' && typeof window.toggleBmkgHariHujan === 'function') {
          window.toggleBmkgHariHujan(cb.checked);
        }
        if (id === 'toggleBmkgNormalHujan' && typeof window.toggleBmkgNormalHujan === 'function') {
          window.toggleBmkgNormalHujan(cb.checked);
        }
        if (id.indexOf('isric-soil-') === 0 && typeof window.toggleIsricSoilLayer === 'function') {
          window.toggleIsricSoilLayer(id, cb.checked);
        }
        if (id.indexOf('isee-soil-') === 0 && typeof window.toggleIseeSoilLayer === 'function') {
          window.toggleIseeSoilLayer(id, cb.checked);
        }
        if (id === 'toggleProvinceBoundary' && typeof window.toggleProvinceBoundary === 'function') {
          window.toggleProvinceBoundary(cb.checked);
        }
        if (id === 'toggleChlorophyllOverlay' && typeof window.toggleChlorophyllOverlay === 'function') {
          window.toggleChlorophyllOverlay(cb.checked);
        }
        if (id === 'toggleParOverlay' && typeof window.toggleParOverlay === 'function') {
          window.toggleParOverlay(cb.checked);
        }
        if (id === 'toggleHujanLayer') {
          toggleHujanLayer(cb.checked);
        }
        if (id === 'toggleFsvaLayer' && typeof window.toggleFsvaLayer === 'function') {
          window.toggleFsvaLayer(cb.checked);
        }
        if (id === 'toggleEkoregion' && typeof window.toggleEkoregion === 'function') {
          window.toggleEkoregion(cb.checked);
        }
        if (id.indexOf('sigap-') === 0 && typeof window.toggleSigapLayer === 'function') {
          window.toggleSigapLayer(id, cb.checked);
        }
        if (id.indexOf('kwshutan-planologi') === 0 && typeof window.toggleKwshutanPlanologiLayer === 'function') {
          window.toggleKwshutanPlanologiLayer(cb.checked);
        }
        if (id.indexOf('brmp-provitas') === 0 && typeof window.toggleProvitasKementanLayer === 'function') {
          window.toggleProvitasKementanLayer(cb.checked);
        }
        if (id.indexOf('brmp-ip') === 0 && typeof window.toggleIpKementanLayer === 'function') {
          window.toggleIpKementanLayer(cb.checked);
        }
        if (id.indexOf('brmp-sc') === 0 && typeof window.toggleSiscropScLayer === 'function') {
          window.toggleSiscropScLayer(cb.checked);
        }
        if ((id.indexOf('glcluc-') === 0 || id.indexOf('natland-') === 0) && typeof window.toggleLclTileLayer === 'function') {
          window.toggleLclTileLayer(id, cb.checked);
        }
        if (id.indexOf('st2023:') === 0 && typeof window.toggleBpsSt2023Layer === 'function') {
          window.toggleBpsSt2023Layer(id, cb.checked);
        }
        if (id === 'bps-lbs-2024' && typeof window.toggleBpsWmts === 'function') {
          window.toggleBpsWmts(id, cb.checked);
        }
        if (id.indexOf('arcgis-') === 0 && typeof window.toggleArcgisSawah === 'function') {
          window.toggleArcgisSawah(id, cb.checked);
        }
        if (id === 'toggleSawahDilindungi' && typeof window.toggleSawahDilindungi === 'function') {
          window.toggleSawahDilindungi(cb.checked);
        }
        if (id === 'toggleSawahNasional50k' && typeof window.toggleSawahNasional50k === 'function') {
          window.toggleSawahNasional50k(cb.checked);
        }
        if (id === 'toggleErosiLayer' && typeof window.toggleErosiLayer === 'function') {
          window.toggleErosiLayer(cb.checked);
        }
        if (id === 'toggleSekolahLayer' && typeof window.toggleSekolahLayer === 'function') {
          window.toggleSekolahLayer(cb.checked);
        }
        if (id.indexOf('TmsLayer') !== -1 && typeof window.toggleAtrbpnTmsLayer === 'function') {
          window.toggleAtrbpnTmsLayer(id, cb.checked);
        }
        if (id.indexOf('atrbpn-wms-') === 0 && typeof window.toggleAtrbpnWmsLayer === 'function') {
          window.toggleAtrbpnWmsLayer(id, cb.checked);
        }
        if (id.indexOf('sitr-wms-') === 0 && typeof window.toggleSitrJatimWmsLayer === 'function') {
          window.toggleSitrJatimWmsLayer(id, cb.checked);
        }
        if (id.indexOf('omi-') === 0 && typeof window.toggleOmiLayer === 'function') {
          window.toggleOmiLayer(id, cb.checked);
        }
        if (id === 'toggleEoxOverlay' && typeof window.toggleEoxOverlay === 'function') {
          window.toggleEoxOverlay(cb.checked);
        }
        if (id === 'toggleBmkgTimezone' && typeof window.toggleBmkgTimezone === 'function') {
          window.toggleBmkgTimezone(cb.checked);
        }
        if (id.indexOf('toggleFu') === 0 && typeof window.toggleFuLayer === 'function') {
          window.toggleFuLayer(id, cb.checked);
        }
        if (id === 'toggleBmkgPrecip10days' && typeof window.toggleBmkgPrecip10days === 'function') {
          window.toggleBmkgPrecip10days(cb.checked);
        }
        if (id === 'toggleGhrsstSstAnomali' && typeof window.toggleGhrsstSstAnomali === 'function') {
          window.toggleGhrsstSstAnomali(cb.checked);
        }
        updateCatCount(cb.closest('.lc-category'));
        var attrBtn = cb.closest('.lc-item').querySelector('.lc-attr-btn');
        if (attrBtn) {
          if (cb.checked) {
            attrBtn.classList.add('lc-attr-btn-show');
          } else {
            attrBtn.classList.remove('lc-attr-btn-show');
          }
        }
        if (!cb.checked && typeof removeUnifiedLegend === 'function') {
          removeUnifiedLegend(id);
        }
        delete container.dataset.built;
        closeLayerCatalog();
      });
    });

    container.querySelectorAll('.lc-attr-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = btn.dataset.layerId;
        if (id === 'toggleJenisTanahJateng' && typeof window.openJenisTanahJatengTable === 'function') {
          window.openJenisTanahJatengTable();
          return;
        }
        if (id === 'toggleGeologiArcGISOnline' && typeof window.openGeologiArcGISOnlineTable === 'function') {
          window.openGeologiArcGISOnlineTable();
          return;
        }
        if (typeof hasAttrSupport === 'function' && hasAttrSupport(id)) {
          if (typeof isWmsAttrLayer === 'function' && isWmsAttrLayer(id)) {
            openWmsAttrTable(id);
          } else if (typeof openAttrTableForLayer === 'function') {
            /* openAttrTableForLayer, bukan openAttrTable: yang latter cuma
               membuka sheet kosong tanpa memuat data layer. */
            openAttrTableForLayer(id);
          }
        }
      });
    });

    container.querySelectorAll('.lc-fit-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (btn.dataset.layerId === 'toggleJenisTanahJateng' && typeof window.flyToJenisTanahJateng === 'function') {
          window.flyToJenisTanahJateng();
        }
        if (btn.dataset.layerId === 'toggleGeologiArcGISOnline' && typeof window.flyToGeologiArcGISOnline === 'function') {
          window.flyToGeologiArcGISOnline();
        }
      });
    });

    var searchInput = container.querySelector('.lc-search');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        var q = searchInput.value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        container.classList.toggle('lc-search-active', !!q);
        container.querySelectorAll('.lc-item').forEach(function(item) {
          var label = item.querySelector('label');
          var text = (label ? label.textContent : item.textContent).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          item.style.display = text.indexOf(q) !== -1 ? '' : 'none';
        });
        container.querySelectorAll('.lc-category').forEach(function(cat) {
          var hasVisibleItem = Array.prototype.some.call(cat.querySelectorAll('.lc-item'), function(item) {
            return item.style.display !== 'none';
          });
          cat.style.display = hasVisibleItem || !q ? '' : 'none';
          if (q) cat.classList.add('open');
          else if (!cat.classList.contains('lc-pinned-group') && !cat.classList.contains('lc-active-group')) cat.classList.remove('open');
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
        /* Escape.yml::first dari minimal_chipik lalu restore, baru tutup.
           Dulu urutan ini bergantung pada dua variabel lokal yang sekarang
           sudah tidak ada; state-nya dibaca dari sheet-drag. */
        if (!window.SheetDrag) return;
        if (window.SheetDrag.isMinimized('geotools')) window.SheetDrag.restore('geotools');
        else if (window.SheetDrag.isOpen('geotools')) closeGeotoolsSheet();
      }
    });

    document.querySelectorAll('#sidebar-left input[type="checkbox"]').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var container = document.getElementById('layerCatalogContent');
        if (container) delete container.dataset.built;
      });
    });
  });
