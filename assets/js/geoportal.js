  function closeGeoportalHubOnInitialLoad() {
    const hub = document.getElementById('geoportalHubCard');
    if (hub) hub.open = false;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', closeGeoportalHubOnInitialLoad, { once: true });
  } else {
    closeGeoportalHubOnInitialLoad();
  }

  // Turunkan URL WFS dari URL WMS (geoserver.jatimprov.go.id/geoserver/wms -> /geoserver/wfs;
  // endpoint /ows langsung bisa dipakai untuk WMS & WFS).
  function wfsUrlFromWmsUrl(wmsUrl) {
    if (/\/ows\/?$/.test(wmsUrl)) return wmsUrl.replace(/\/ows\/?$/, '/wfs');
    return wmsUrl.replace(/\/wms\/?$/, '/wfs');
  }

  // Proxy CORS opsional untuk server yang memblokir fetch lintas-origin
  // (GetCapabilities, WFS, GetFeatureInfo). Kosongkan ('') untuk akses langsung.
  // Contoh: 'https://geoportal-proxy.example.workers.dev/'
  const GEOPORTAL_PROXY = '';
  function geoFetch(targetUrl, init) {
    if (GEOPORTAL_PROXY) {
      return fetch(GEOPORTAL_PROXY + '?url=' + encodeURIComponent(targetUrl));
    }
    return fetch(targetUrl, init);
  }

  function resolveGeoportalLayerName(layerName) {
    if (layerName.startsWith('geonode:')) return layerName.slice(8);
    return layerName;
  }

  // Muat layer WMS point sebagai marker cluster via WFS (GeoJSON).
  // Kembalikan L.markerClusterGroup bila layer adalah point, selain itu null
  // (layer polygon/garis tetap dirender sebagai raster WMS oleh pemanggil).
  async function buildGeoportalPointCluster(layerName, wmsUrl) {
    const wfsUrl = wfsUrlFromWmsUrl(wmsUrl);
    const resolvedName = resolveGeoportalLayerName(layerName);
    const detectUrl = `${wfsUrl}?service=WFS&version=1.1.0&request=GetFeature&typeNames=${encodeURIComponent(resolvedName)}&outputFormat=application/json&count=1&srsName=EPSG:4326`;

    const detectRes = await geoFetch(detectUrl);
    if (!detectRes.ok) throw new Error(`WFS HTTP ${detectRes.status}`);
    const detectData = await detectRes.json();
    const geomType = detectData.features?.[0]?.geometry?.type;
    if (geomType !== 'Point' && geomType !== 'MultiPoint') return null;

    const fullUrl = `${wfsUrl}?service=WFS&version=1.1.0&request=GetFeature&typeNames=${encodeURIComponent(resolvedName)}&outputFormat=application/json&srsName=EPSG:4326`;
    const fullRes = await geoFetch(fullUrl);
    if (!fullRes.ok) throw new Error(`WFS HTTP ${fullRes.status}`);
    const fullData = await fullRes.json();
    if (!fullData.features || !fullData.features.length) return null;

    const pinSvg = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="#e74c3c" stroke="#fff" stroke-width="1.5" d="M12 2C7.6 2 4 5.6 4 10c0 5.3 8 12 8 12s8-6.7 8-12c0-4.4-3.6-8-8-8z"/><circle cx="12" cy="10" r="3" fill="#fff"/></svg>';

    const cluster = L.markerClusterGroup({ maxClusterRadius: 45 });
    fullData.features.forEach(feature => {
      if (!feature.geometry || !feature.geometry.coordinates) return;
      const coords = feature.geometry.type === 'MultiPoint' ? feature.geometry.coordinates : [feature.geometry.coordinates];
      coords.forEach(([lng, lat]) => {
        if (typeof lng !== 'number' || typeof lat !== 'number') return;
        if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return;
        const props = feature.properties || {};
        const title = props.nama_obyek || props.nama || props.name || '';
        const marker = L.marker([lat, lng], {
          icon: L.divIcon({ className: 'gp-point-icon', html: pinSvg, iconSize: [24, 24], iconAnchor: [12, 24], popupAnchor: [0, -24] }),
          title: String(title)
        });
        const rows = Object.entries(props)
          .filter(([, v]) => v !== null && v !== undefined && v !== '')
          .map(([k, v]) => `<div class="gp-point-popup-row"><b>${escapeBMKGHTML(k)}</b><span>${escapeBMKGHTML(Array.isArray(v) ? v.join(', ') : v)}</span></div>`)
          .join('');
        marker.bindPopup(`<div class="gp-point-popup"><strong>${escapeBMKGHTML(title || 'Detail POI')}</strong>${rows}</div>`, { maxWidth: 260, className: 'gp-point-leaflet-popup' });
        cluster.addLayer(marker);
      });
    });
    return cluster;
  }

  // Pemetaan cacheKey (wmsUrl::layerName) -> id node jsTree yang unik.
  // Diperlukan karena beberapa server mempublikasikan nama layer yang sama
  // (mis. "geonode:...") di banyak kategori, sehingga id node harus
  // diprefix dengan id kategori agar tidak tabrakan di jsTree.
  const geoportalNodeIndex = new Map();

  // CacheKey layer yang dirender sebagai marker cluster titik (bukan WMS raster).
  const geoportalPointLayerKeys = new Set();

  // ===================== Deteksi server WMS bermasalah =====================
  // Melacak kegagalan tile per wmsUrl (mis. sertifikat SSL kedaluwarsa /
  // server mati) dan menampilkan badge pada kategori/layer terkait di tree.
  const geoportalServerStatus = new Map();
  const GEO_SERVER_FAIL_THRESHOLD = 3;
  let __gpBadgeTimer = null;

  function isGeoportalServerDown(wmsUrl) {
    const st = geoportalServerStatus.get(wmsUrl);
    return !!(st && st.down);
  }

  function scheduleUpdateGeoportalServerBadges() {
    clearTimeout(__gpBadgeTimer);
    __gpBadgeTimer = setTimeout(updateGeoportalServerBadges, 400);
  }

  function markGeoportalServerOk(wmsUrl) {
    const st = geoportalServerStatus.get(wmsUrl);
    const wasDown = !!(st && st.down);
    geoportalServerStatus.set(wmsUrl, { errors: 0, down: false });
    if (wasDown) scheduleUpdateGeoportalServerBadges();
  }

  function markGeoportalServerError(wmsUrl) {
    const st = geoportalServerStatus.get(wmsUrl) || { errors: 0, down: false };
    st.errors += 1;
    if (!st.down && st.errors >= GEO_SERVER_FAIL_THRESHOLD) {
      st.down = true;
      console.warn('[Geoportal] Server tampak tidak tersedia:', wmsUrl);
      scheduleUpdateGeoportalServerBadges();
    }
    geoportalServerStatus.set(wmsUrl, st);
  }

  function updateGeoportalServerBadges() {
    const container = document.getElementById('geoportalLayerList');
    if (!container) return;
    let inst = null;
    try {
      if (typeof window.$ !== 'undefined' && $(container).data('jstree')) inst = $(container).jstree(true);
    } catch (e) { inst = null; }
    container.querySelectorAll('li[data-wms-url][data-level="1"]').forEach(li => {
      const url = li.getAttribute('data-wms-url') || '';
      let checked = false;
      if (inst && li.id) {
        try {
          const nd = inst.get_node(li.id);
          checked = !!(nd && inst.is_checked(nd));
        } catch (e) { checked = false; }
      }
      if (!checked) checked = li.classList.contains('jstree-checked');
      const bad = isGeoportalServerDown(url) && checked;
      const anchor = li.querySelector(':scope > a.jstree-anchor');
      if (!anchor) return;
      let badge = anchor.querySelector(':scope > .geoportal-server-badge');
      if (bad && !badge) {
        badge = document.createElement('span');
        badge.className = 'geoportal-server-badge';
        badge.textContent = 'Error';
        badge.title = 'Tile dari server ini gagal dimuat (kemungkinan sertifikat SSL kedaluwarsa atau server sedang mati).';
        anchor.appendChild(badge);
      } else if (!bad && badge) {
        badge.remove();
      }
    });
  }

  // Cek apakah checkbox layer geoportal masih aktif.
  function isGeoportalCheckboxActive(layerName, wmsUrl) {
    // Check jsTree state first
    var tree = $('#geoportalLayerList').jstree(true);
    if (tree) {
      var nodeId = geoportalNodeIndex.get(`${wmsUrl}::${layerName}`);
      if (nodeId) {
        var node = tree.get_node(nodeId);
        if (node) return tree.is_checked(node);
      }
    }
    // Fallback to legacy checkbox
    const input = [...document.querySelectorAll('[data-geolayer]')].find(el =>
      el.dataset.geolayer === layerName &&
      (el.dataset.geoserverUrl || GEOPORTAL_WMS_URL) === wmsUrl
    );
    return input ? input.checked : false;
  }

  // Cache GetCapabilities per server: { doc, crsByLayer }
  const geoportalCapsCache = new Map();
  async function loadGeoportalCaps(wmsUrl) {
    let cached = geoportalCapsCache.get(wmsUrl);
    if (cached) return cached;
    const res = await geoFetch(`${wmsUrl}?service=WMS&version=1.1.1&request=GetCapabilities`);
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    const crsByLayer = new Map();
    let rootCrs = [];
    const rootLayer = [...doc.querySelectorAll('Layer')].find(l => !l.querySelector(':scope > Name'));
    if (rootLayer) rootCrs = [...rootLayer.querySelectorAll(':scope > CRS')].map(e => e.textContent.trim());
    doc.querySelectorAll('Layer > Name').forEach(nameEl => {
      const layerEl = nameEl.parentElement;
      const crsList = [...layerEl.querySelectorAll(':scope > CRS')].map(e => e.textContent.trim());
      crsByLayer.set(nameEl.textContent.trim(), crsList.length ? crsList : rootCrs);
    });
    cached = { doc, crsByLayer, rootCrs };
    geoportalCapsCache.set(wmsUrl, cached);
    return cached;
  }

  // Pilih CRS Leaflet yang paling pas untuk layer tertentu berdasarkan daftar
  // CRS yang diiklankan server. Default ke EPSG:4326 (paling lazim didukung oleh
  // GeoServer, termasuk layer yang hanya mempublikasikan CRS:84).
  function pickGeoportalCrs(wmsUrl, layerName) {
    const cached = geoportalCapsCache.get(wmsUrl);
    const resolved = resolveGeoportalLayerName(layerName);
    const crsList = (cached ? (cached.crsByLayer.get(resolved) || cached.crsByLayer.get(layerName)) : null) || (cached ? cached.rootCrs : []) || [];
    if (crsList.some(c => /EPSG:3857|EPSG:3785|EPSG:900913|EPSG:102100/i.test(c))) return L.CRS.EPSG3857;
    if (crsList.some(c => /EPSG:4326|CRS:84|CRS:83|CRS:27/i.test(c))) return L.CRS.EPSG4326;
    // GeoServer umumnya bisa mereproyeksi ke 4326 meski tak diiklankan.
    // Default ke 4326 (bukan 3857) agar layer tetap tampil meski fetch
    // GetCapabilities terblokir CORS di beberapa server (mis. Jabar).
    if (crsList.length) return L.CRS.EPSG4326;
    return L.CRS.EPSG4326;
  }

  // Ambil batas (bbox) layer dari WMS GetCapabilities (cache per server).
  async function getGeoportalLayerBBox(wmsUrl, layerName) {
    const cached = await loadGeoportalCaps(wmsUrl);
    const doc = cached.doc;
    for (const layer of doc.querySelectorAll('Layer')) {
      const nameEl = layer.querySelector(':scope > Name');
      if (!nameEl || nameEl.textContent !== layerName) continue;
      const llbb = layer.querySelector('LatLonBoundingBox');
      if (llbb) {
        const west = Number(llbb.getAttribute('minx'));
        const east = Number(llbb.getAttribute('maxx'));
        const south = Number(llbb.getAttribute('miny'));
        const north = Number(llbb.getAttribute('maxy'));
        if ([west, east, south, north].every(Number.isFinite)) return { west, east, south, north };
      }
      const exbb = layer.querySelector('EX_GeographicBoundingBox');
      if (exbb) {
        const val = tag => Number(exbb.querySelector(tag)?.textContent);
        const west = val('westBoundLongitude');
        const east = val('eastBoundLongitude');
        const south = val('southBoundLatitude');
        const north = val('northBoundLatitude');
        if ([west, east, south, north].every(Number.isFinite)) return { west, east, south, north };
      }
      return null;
    }
    return null;
  }

  // Fly ke layer yang dipilih: marker cluster memakai getBounds(),
  // layer raster memakai bbox dari GetCapabilities.
  function flyToGeoportalLayer(layer, wmsUrl, layerName) {
    const isJakartaClp = layerName === 'volatil_jakarta:BIDANG_JAKARTA_CLP';
    const targetZoom = isJakartaClp ? 17 : 14;
    if (layer && typeof layer.getBounds === 'function') {
      const bounds = layer.getBounds();
      if (bounds && bounds.isValid()) {
        if (isJakartaClp) {
          map.flyTo(bounds.getCenter(), targetZoom, { duration: 0.8 });
        } else {
          map.flyToBounds(bounds.pad(0.12), { maxZoom: targetZoom, padding: [44, 44], duration: 0.8 });
        }
        return;
      }
    }
    const resolvedName = resolveGeoportalLayerName(layerName);
    getGeoportalLayerBBox(wmsUrl, resolvedName)
      .then(bbox => {
        if (bbox) {
          if (isJakartaClp) {
            map.flyTo([(bbox.south + bbox.north) / 2, (bbox.west + bbox.east) / 2], targetZoom, { duration: 0.8 });
          } else {
            map.flyToBounds([[bbox.south, bbox.west], [bbox.north, bbox.east]], { maxZoom: targetZoom, padding: [44, 44], duration: 0.8 });
          }
        }
      })
      .catch(() => {});
  }

  function makeGeoportalRasterLayer(layerName, wmsUrl) {
    const resolvedName = resolveGeoportalLayerName(layerName);
    const crs = pickGeoportalCrs(wmsUrl, layerName);

    const layer = L.tileLayer.wms(wmsUrl, {
      layers: resolvedName,
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      tiled: true,
      opacity: .82,
      crs: crs
    });
    layer.on('tileload', function () {
      markGeoportalServerOk(wmsUrl);
    });
    layer.on('tileerror', function (e) {
      console.warn('[Geoportal] WMS tile error:', { layerName, resolvedName, wmsUrl, tileUrl: e.tile?.src });
      markGeoportalServerError(wmsUrl);
    });
    return layer;
  }

  async function toggleGeoportalLayer(layerName, visible, wmsUrl = GEOPORTAL_WMS_URL) {

    const cacheKey = `${wmsUrl}::${layerName}`;
    const layer = geoportalLayers.get(cacheKey);

    if (!layer) {
      // Belum pernah dimuat: buat WMS raster secara synchronus agar popup
      // langsung aktif; di latar belakang coba upgrade ke marker cluster
      // bila layer adalah titik (WFS).
      if (!visible) return;
      await loadGeoportalCaps(wmsUrl).catch(() => {});
      const raster = makeGeoportalRasterLayer(layerName, wmsUrl);
      geoportalLayers.set(cacheKey, raster);
      if (isGeoportalCheckboxActive(layerName, wmsUrl) && !map.hasLayer(raster)) {
        raster.addTo(map);
        flyToGeoportalLayer(raster, wmsUrl, layerName);
      }
      // Coba WFS di latar belakang — bila berhasil, ganti layer di cache.
      buildGeoportalPointCluster(layerName, wmsUrl)
        .then(clusterLayer => {
          if (!clusterLayer) return;
          const current = geoportalLayers.get(cacheKey);
          if (current && map.hasLayer(current)) {
            map.removeLayer(current);
          }
          geoportalLayers.set(cacheKey, clusterLayer);
          geoportalPointLayerKeys.add(cacheKey);
          if (isGeoportalCheckboxActive(layerName, wmsUrl) && !map.hasLayer(clusterLayer)) {
            clusterLayer.addTo(map);
            flyToGeoportalLayer(clusterLayer, wmsUrl, layerName);
          }
        })
        .catch(() => {});
      return;
    }

    if (visible) {
      if (!map.hasLayer(layer)) layer.addTo(map);
      flyToGeoportalLayer(layer, wmsUrl, layerName);
    } else {
      map.removeLayer(layer);
    }
    scheduleRenderGeoportalLegend();
  }

  window.isGeoportalCatalogLayerActive = function (key) {
    const separator = key.lastIndexOf('::');
    if (separator < 0) return false;
    return isGeoportalCheckboxActive(key.slice(separator + 2), key.slice(0, separator));
  };

  window.toggleGeoportalCatalogLayer = function (key, visible) {
    const nodeId = geoportalNodeIndex.get(key);
    const tree = $('#geoportalLayerList').jstree(true);
    if (tree && nodeId && tree.get_node(nodeId)) {
      if (visible) tree.check_node(nodeId);
      else tree.uncheck_node(nodeId);
      return;
    }
    const separator = key.lastIndexOf('::');
    if (separator >= 0) toggleGeoportalLayer(key.slice(separator + 2), visible, key.slice(0, separator));
  };

  function getActiveGeoportalLayers() {
    return [...geoportalLayers.entries()]
      .filter(([, layer]) => map.hasLayer(layer))
      .map(([cacheKey, layer]) => {
        const [wmsUrl, layerName] = cacheKey.split('::');
        return { layerName, wmsUrl, layer };
      });
  }

  function formatGeoportalValue(value) {
    if (value === null || value === undefined || value === '') return '-';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }

  function openGeoportalModal() {
    document.getElementById('geoportalModal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeGeoportalModal() {
    document.getElementById('geoportalModal').classList.remove('open');
    document.body.style.overflow = '';
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('geoportalModal').classList.contains('open')) {
      closeGeoportalModal();
    }
  });

  function renderGeoportalLoading() {
    const container = document.getElementById('geoportalProperties');
    container.hidden = false;
    container.replaceChildren();
    const loading = document.createElement('div');
    loading.className = 'geoportal-loading';
    loading.innerHTML = '<span class="geoportal-spinner"></span><p>Mencari data fitur pada lokasi ini...</p>';
    container.appendChild(loading);
  }

  function renderGeoportalDetails(features) {
    const container = document.getElementById('geoportalProperties');
    container.hidden = false;
    container.replaceChildren();

    if (!features.length) {
      const hasActiveLayers = getActiveGeoportalLayers().length > 0 || getActiveArcgisLayers().length > 0;
      const empty = document.createElement('div');
      empty.className = 'geoportal-empty';
      if (hasActiveLayers) {
        empty.innerHTML = '<span>🗺️</span><p>Tidak ada fitur pada lokasi ini.</p><small>Coba klik titik lain atau perbesar peta.</small>';
      } else {
        empty.innerHTML = '<span>📂</span><p>Aktifkan layer dari panel Geoportal.</p><small>Centang layer di panel sebelah kiri, lalu klik pada peta untuk melihat properti fitur.</small>';
      }
      container.appendChild(empty);
      return;
    }

    features.forEach(({ layerName, properties }) => {
      const card = document.createElement('article');
      card.className = 'geoportal-card';

      const header = document.createElement('div');
      header.className = 'geoportal-card-head';
      const title = document.createElement('strong');
      title.textContent = layerName || 'Layer Geoportal';
      const badge = document.createElement('span');
      badge.textContent = `${Object.keys(properties || {}).length} properti`;
      header.append(title, badge);

      const propertyList = document.createElement('div');
      propertyList.className = 'geoportal-property-list';

      const entries = Object.entries(properties || {});
      if (!entries.length) {
        const noProp = document.createElement('p');
        noProp.className = 'geoportal-no-prop';
        noProp.textContent = 'Tidak ada properti yang tersedia untuk fitur ini.';
        propertyList.appendChild(noProp);
      } else {
        entries.forEach(([key, value]) => {
          const propCard = document.createElement('div');
          propCard.className = 'geoportal-prop';
          const label = document.createElement('label');
          label.textContent = key.replace(/_/g, ' ');
          const text = document.createElement('p');
          text.textContent = formatGeoportalValue(value);
          propCard.append(label, text);
          propertyList.appendChild(propCard);
        });
      }

      card.append(header, propertyList);
      container.appendChild(card);
    });
  }

  // Dipakai katalog tematik khusus GeoPortal agar popup mengikuti template
  // detail properti GeoPortal yang sama dengan hasil klik layer WMS.
  window.showGeoportalFeatureDetails = function (title, properties, latlng) {
    const coordsEl = document.getElementById('geoportalModalCoords');
    if (coordsEl && latlng) coordsEl.textContent = `(${latlng.lng.toFixed(5)}, ${latlng.lat.toFixed(5)})`;
    const titleEl = document.getElementById('geoportalModalTitle');
    if (titleEl) titleEl.textContent = title || 'Detail Layer';
    openGeoportalModal();
    renderGeoportalDetails([{ layerName: title || 'GeoPortal', properties: properties || {} }]);
  };

  function buildGeoportalFeatureInfoParams(layerName, latlng, wmsUrl = GEOPORTAL_WMS_URL, crs) {
    const resolvedName = resolveGeoportalLayerName(layerName);
    const bounds = map.getBounds();
    const size = map.getSize();
    const point = map.latLngToContainerPoint(latlng, map.getZoom());
    const projection = crs || map.options?.crs || L.CRS.EPSG3857;
    const sw = projection.project(bounds.getSouthWest());
    const ne = projection.project(bounds.getNorthEast());
    const srs = projection.code || 'EPSG:3857';

    return new URLSearchParams({
      service: 'WMS',
      request: 'GetFeatureInfo',
      version: '1.1.1',
      layers: resolvedName,
      query_layers: resolvedName,
      styles: '',
      bbox: `${sw.x},${sw.y},${ne.x},${ne.y}`,
      width: String(size.x),
      height: String(size.y),
      srs,
      x: String(Math.round(point.x)),
      y: String(Math.round(point.y)),
      info_format: 'application/json',
      feature_count: '20'
    });
  }

  function parseGeoportalFeatureInfoResponse(text) {
    if (!text) return [];

    try {
      const parsed = JSON.parse(text);
      const rawFeatures = parsed?.features || parsed?.Features || [];
      if (Array.isArray(rawFeatures)) {
        return rawFeatures.map(feature => ({
          properties: feature?.properties || feature?.Attributes || {}
        }));
      }
      if (parsed?.feature) {
        return [{ properties: parsed.feature.properties || parsed.feature.Attributes || {} }];
      }
    } catch (err) {
      // Fall back to HTML parsing below.
    }

    const htmlMatch = text.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
    if (!htmlMatch) return [];

    const rows = Array.from(htmlMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));
    const properties = {};
    rows.forEach(([_, rowHtml]) => {
      const cells = Array.from(rowHtml.matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi));
      if (cells.length >= 2) {
        const key = cells[0][1].replace(/<[^>]+>/g, '').trim();
        const value = cells[1][1].replace(/<[^>]+>/g, '').trim();
        if (key) properties[key] = value;
      }
    });
    return Object.keys(properties).length ? [{ properties }] : [];
  }

  async function fetchGeoportalInfo(wmsUrl, params) {
    const response = await geoFetch(`${wmsUrl}?${params.toString()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  }

  async function getGeoportalFeatureInfo(layerName, latlng, wmsUrl = GEOPORTAL_WMS_URL, crs) {
    const params = buildGeoportalFeatureInfoParams(layerName, latlng, wmsUrl, crs);
    let responseText = await fetchGeoportalInfo(wmsUrl, params);
    let features = parseGeoportalFeatureInfoResponse(responseText);

    // Beberapa server mengabaikan info_format JSON dan mengembalikan HTML/XML.
    // Ulangi dengan info_format text/html agar semua layer tetap bisa menampilkan properti.
    if (!features.length && !responseText.trim().startsWith('{')) {
      params.set('info_format', 'text/html');
      responseText = await fetchGeoportalInfo(wmsUrl, params);
      features = parseGeoportalFeatureInfoResponse(responseText);
    }

    return features.map(feature => ({ layerName, properties: feature.properties || {} }));
  }

  function getActiveArcgisLayers() {
    return Object.entries(arcgisSawahLayers)
      .filter(([, layer]) => layer && map.hasLayer(layer))
      .map(([key, layer]) => {
        const config = ARCGIS_SAWAH_CONFIG[key];
        return { layerKey: key, url: config.url, layers: config.layers };
      });
  }

  // ===================== Legenda Dinamis Geoportal =====================
  const ARCGIS_LAYER_LABELS = {
    'arcgis-sawah-2023': 'Sawah 2023 (Kementan)',
    'arcgis-sawah-2019': 'LBS 2019 (Kementan)',
    'arcgis-kawasan-padi': 'Kawasan Padi (Kementan)',
    'arcgis-kawasan-jagung': 'Kawasan Jagung (Kementan)',
    'arcgis-kawasan-kedelai': 'Kawasan Kedelai (Kementan)',
    'arcgis-vt-lbs-2024': 'LBS 2024 (Vektor)',
    'arcgis-vt-lbs-2019': 'LBS 2019 (Vektor)'
  };

  function buildGeoportalLegendGraphicUrl(wmsUrl, layerName) {
    return wmsUrl + '?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetLegendGraphic&FORMAT=image%2Fpng' +
      '&LAYER=' + encodeURIComponent(resolveGeoportalLayerName(layerName)) +
      '&LEGEND_OPTIONS=fontAntiAliasing:true;forceLabels:on';
  }

  function geoportalLabelFor(layerName) {
    let lbl = layerName, cat = '';
    if (Array.isArray(GEOPORTAL_LAYER_DATA)) {
      for (const d of GEOPORTAL_LAYER_DATA) {
        if (d && d.id === layerName) { lbl = d.label || layerName; cat = d.category || ''; break; }
      }
    }
    return cat ? cat + ' — ' + lbl : lbl;
  }

  function getGeoportalLegendItems() {
    const items = [];
    getActiveGeoportalLayers().forEach(a => {
      const isPoint = geoportalPointLayerKeys.has(`${a.wmsUrl}::${a.layerName}`);
      items.push({ kind: isPoint ? 'point' : 'wms', label: geoportalLabelFor(a.layerName), wmsUrl: a.wmsUrl, layerName: a.layerName });
    });
    getActiveArcgisLayers().forEach(a => {
      items.push({ kind: 'arcgis', label: ARCGIS_LAYER_LABELS[a.layerKey] || a.layerKey });
    });
    getActiveLbsVtLayers().forEach(a => {
      items.push({ kind: 'arcgis', label: ARCGIS_LAYER_LABELS[a.layerKey] || a.label });
    });
    return items;
  }

  const GeoportalLegendControl = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd() {
      this._container = L.DomUtil.create('div', 'geoportal-legend leaflet-bar');
      L.DomEvent.disableClickPropagation(this._container);
      L.DomEvent.disableScrollPropagation(this._container);
      this._container.style.display = 'none';
      return this._container;
    }
  });
  let geoportalLegendCtrl = null;
  let geoportalLegendSig = '';

  function getSt2023LegendItems() {
    return getActiveBpsSt2023Layers().map(({ layerName }) => ({
      kind: 'wms',
      label: st2023LabelFor(layerName),
      wmsUrl: BPS_ST2023_WMS_URL,
      layerName
    }));
  }

  function isMapLayerActive(layer) {
    return !!(layer && map.hasLayer(layer));
  }

  // Tab Geoportal & GeoTani lama sudah jadi halaman pengalihan; isi aslinya
  // pindah ke panel GeoTools. Deteksi section lewat dropdown yang aktif.
  const GEO_TOOLS_SECTIONS = {
    geotoolsTabGeoportal: 'geoportal',
    geotoolsTabGeoTani: 'geotani'
  };

  function activeGeoportalSection() {
    if (window.currentActiveTab === 'tab-geoportal') return 'geoportal';
    if (window.currentActiveTab === 'tab-geotani') return 'geotani';
    var dd = document.querySelector('.geotools-dropdown');
    if (dd && dd.value) return GEO_TOOLS_SECTIONS[dd.value] || '';
    return '';
  }

  function getGeotaniLegendItems() {
    const items = getSt2023LegendItems();
    const ARCGIS_LABELS = {
      'arcgis-sawah-2023': 'LBS 2023 (KEMENTAN)',
      'arcgis-sawah-2019': 'LBS 2019 (KEMENTAN)',
      'arcgis-kawasan-padi': 'Kawasan Padi (KEMENTAN)',
      'arcgis-kawasan-jagung': 'Kawasan Jagung (KEMENTAN)',
      'arcgis-kawasan-kedelai': 'Kawasan Kedelai (KEMENTAN)',
      'arcgis-vt-lbs-2024': 'LBS 2024 (Vektor)',
      'arcgis-vt-lbs-2019': 'LBS 2019 (Vektor)'
    };
    try {
      if (isMapLayerActive(bpsTutupanLahanState.layer)) {
        items.push({ kind: 'wms', label: 'Tutupan Lahan 100 m', wmsUrl: 'https://geoserver.bps.go.id/tutupan_lahan/wms', layerName: 'tutupan_lahan:tutupan_lahan_100m' });
      }
      Object.keys(bpsWmtsLayers).forEach(key => {
        if (!isMapLayerActive(bpsWmtsLayers[key])) return;
        if (key === 'bps-lbs-2024') items.push({ kind: 'wms', label: 'LBS Nasional 2024', wmsUrl: 'https://geoserver.bps.go.id/ksa/wms', layerName: 'ksa:lbs_2024' });
      });
      if (isMapLayerActive(sawahDilindungiLayer)) {
        items.push({ kind: 'swatch', color: '#ffaa00', label: 'LSD 50K (BIG)' });
      }
      if (isMapLayerActive(sawahNasionalLayer)) {
        items.push({ kind: 'swatch', color: '#e6fcc0', label: 'LBS 50K (BIG)' });
      }
      if (isMapLayerActive(erosiLayer)) {
        items.push({ kind: 'swatch', color: '#94a3b8', label: 'Peta Rawan Erosi (BIG)' });
      }
      if (typeof arcgisSawahLayers !== 'undefined') {
        Object.keys(arcgisSawahLayers).forEach(function (key) {
          if (arcgisSawahLayers[key] && isMapLayerActive(arcgisSawahLayers[key])) {
            items.push({ kind: 'swatch', color: '#4caf50', label: ARCGIS_LABELS[key] || key });
          }
        });
      }
      getActiveLbsVtLayers().forEach(a => {
        items.push({ kind: 'swatch', color: a.color, label: ARCGIS_LABELS[a.layerKey] || a.label });
      });
    } catch (e) { /* layer modul lain belum siap */ }
    return items;
  }

  function renderGeoportalLegend() {
    if (!geoportalLegendCtrl) {
      if (typeof map === 'undefined' || !map) return;
      if (typeof addUnifiedLegend !== 'function') return;
      geoportalLegendCtrl = true;
    }
    if (typeof removeUnifiedLegend !== 'function') return;
    removeUnifiedLegend('geoportal');

    const section = activeGeoportalSection();
    let items = [];
    if (section === 'geoportal') items = getGeoportalLegendItems();
    else items = getGeotaniLegendItems();
    if (!items.length) {
      geoportalLegendSig = '';
      geoportalLegendCtrl = null;
      return;
    }
    const sig = items.map(i => i.kind + ':' + i.label + ':' + (i.wmsUrl || '')).join('|');
    if (sig === geoportalLegendSig) return;
    geoportalLegendSig = sig;

    const div = document.createElement('div');
    div.className = 'geoportal-legend leaflet-bar';
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);

    let html = '<div class="geoportal-legend-title">Legenda</div>';
    items.forEach(it => {
      const safeLbl = (typeof escapeBMKGHTML === 'function') ? escapeBMKGHTML(it.label) : it.label;
      if (it.kind === 'wms') {
        html += '<div class="geoportal-legend-item">' +
          '<div class="geoportal-legend-label">' + safeLbl + '</div>' +
          '<img class="geoportal-legend-img" alt="" src="' +
          buildGeoportalLegendGraphicUrl(it.wmsUrl, it.layerName) + '"></div>';
      } else {
        const swStyle = it.color ? ' style="background:' + it.color + ';border:1px solid rgba(15,23,42,.25)"' : '';
        html += '<div class="geoportal-legend-item geoportal-legend-row">' +
          '<span class="geoportal-legend-swatch' + (it.kind === 'point' ? ' point' : '') + '"' + swStyle + '></span>' +
          '<span class="geoportal-legend-label">' + safeLbl + '</span></div>';
      }
    });
    div.innerHTML = html;
    div.querySelectorAll('img.geoportal-legend-img').forEach(img => {
      img.addEventListener('error', () => {
        const item = img.closest('.geoportal-legend-item');
        if (item) {
          item.classList.add('img-fail');
          const sw = document.createElement('span');
          sw.className = 'geoportal-legend-swatch';
          img.replaceWith(sw);
        }
      });
    });
    addUnifiedLegend('geoportal', typeof createLegendWithToggle === 'function' ? createLegendWithToggle(div) : div);
  }

  let __gpLegendTimer = null;
  function scheduleRenderGeoportalLegend() {
    clearTimeout(__gpLegendTimer);
    __gpLegendTimer = setTimeout(renderGeoportalLegend, 200);
  }
  window.scheduleRenderGeoportalLegend = scheduleRenderGeoportalLegend;

  if (typeof map !== 'undefined' && map && typeof map.on === 'function') {
    map.on('layeradd layerremove', scheduleRenderGeoportalLegend);
  }

  // Legenda juga harus mengikuti perpindahan panel di dropdown GeoTools.
  function bindGeoportalSectionHooks() {
    var dd = document.querySelector('.geotools-dropdown');
    if (dd && !dd.__gpLegendBound) {
      dd.__gpLegendBound = true;
      dd.addEventListener('change', scheduleRenderGeoportalLegend);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindGeoportalSectionHooks);
  } else {
    bindGeoportalSectionHooks();
  }
  setTimeout(bindGeoportalSectionHooks, 1500);

  function buildArcGISIdentifyParams(url, layers, latlng) {
    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    return new URLSearchParams({
      geometry: `${latlng.lng},${latlng.lat}`,
      geometryType: 'esriGeometryPoint',
      sr: '4326',
      layers: `all:${layers.join(',')}`,
      tolerance: '3',
      mapExtent: `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`,
      imageDisplay: `${map.getSize().x},${map.getSize().y},96`,
      returnGeometry: 'false',
      f: 'json'
    });
  }

  async function fetchArcGISFeatureInfo(url, layers, latlng) {
    const params = buildArcGISIdentifyParams(url, layers, latlng);
    const response = await fetch(`${url}/identify?${params.toString()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const results = data.results || [];
    return results.map(r => ({
      layerName: r.layerName || r.layerId,
      properties: r.attributes || {}
    }));
  }

  async function handleGeoportalMapClick(e) {
    try {
      const activeWMS = getActiveGeoportalLayers();
      const activeArcGIS = getActiveArcgisLayers();
      const activeSt2023 = getActiveBpsSt2023Layers();

      if (!activeWMS.length && !activeArcGIS.length && !activeSt2023.length) return false;

      const wmsPromises = activeWMS.map(({ layerName, wmsUrl }) => getGeoportalFeatureInfo(layerName, e.latlng, wmsUrl, pickGeoportalCrs(wmsUrl, layerName)));
      const arcgisPromises = activeArcGIS.map(({ layerKey, url, layers }) =>
        fetchArcGISFeatureInfo(url, layers, e.latlng).then(results => results.map(r => ({ ...r, layerName: `${layerKey} — ${r.layerName}` })))
      );
      const st2023Promises = activeSt2023.map(({ layerName }) =>
        getGeoportalFeatureInfo(layerName, e.latlng, BPS_ST2023_WMS_URL, pickGeoportalCrs(BPS_ST2023_WMS_URL, layerName))
          .then(results => results.map(r => ({ ...r, layerName: `${st2023LabelFor(layerName)} — ${r.layerName}` })))
      );
      const geotaniPromises = [];
      if (activeGeoportalSection() === 'geotani') {
        try {
          if (isMapLayerActive(erosiLayer)) {
            geotaniPromises.push(
              fetchArcGISFeatureInfo('https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/KEHUTANAN/MapServer', ['14'], e.latlng)
                .then(rs => rs.map(r => ({ ...r, layerName: `Peta Rawan Erosi — ${r.layerName}` })))
            );
          }
        } catch (e2) { /* erosi module belum siap */ }
      }
      const results = await Promise.allSettled([...wmsPromises, ...arcgisPromises, ...st2023Promises, ...geotaniPromises]);
      const features = results.filter(result => result.status === 'fulfilled').flatMap(result => result.value);
      const failed = results.filter(result => result.status === 'rejected');
      if (failed.length) console.warn('Sebagian GetFeatureInfo gagal:', failed);

      if (!features.length) return false;

      const coordsEl = document.getElementById('geoportalModalCoords');
      if (coordsEl) coordsEl.innerText = `(${e.latlng.lng.toFixed(5)}, ${e.latlng.lat.toFixed(5)})`;
      openGeoportalModal();
      renderGeoportalDetails(features);
      return true;
    } catch (err) {
      console.error('[Geoportal] handleGeoportalMapClick error:', err);
      return false;
    }
  }

  // Tangkap klik lebih awal dari event Leaflet. Beberapa polygon/vector layer
  // menghentikan propagasi event, sehingga map.on('click') tidak selalu menerima
  // kliknya. Capture listener memastikan GetFeatureInfo tetap dipanggil untuk
  // semua layer Geoportal aktif, termasuk polygon.
  map.getContainer().addEventListener('click', async function (event) {
    const section = activeGeoportalSection();
    if (section !== 'geoportal' && section !== 'geotani') return;
    if (section === 'geotani') {
      let hasManaged = getActiveBpsSt2023Layers().length > 0;
      try { hasManaged = hasManaged || isMapLayerActive(erosiLayer); } catch (e) {}
      if (!hasManaged) return;
    }
    if (event.target.closest?.('.leaflet-control')) return;

    event.__geoportalFeatureInfoCaptured = true;
    try {
      await handleGeoportalMapClick({
        latlng: map.mouseEventToLatLng(event),
        originalEvent: event
      });
    } catch (err) {
      console.error('[Geoportal] GetFeatureInfo capture gagal:', err);
    }
  }, true);

  // ArcGIS REST Layer: Lahan Baku Sawah & Kawasan Pertanian
  const ARCGIS_SAWAH_CONFIG = {
    'arcgis-sawah-2023': { url: 'https://sig02.pertanian.go.id/server/rest/services/Sawah/Sawah2023/MapServer', layers: [0] },
    'arcgis-sawah-2019': { url: 'https://sig02.pertanian.go.id/server/rest/services/Sawah/LBS2019/MapServer', layers: [23] },
    'arcgis-kawasan-padi': { url: 'https://sig02.pertanian.go.id/server/rest/services/Kawasan/Peta_Kawasan_Padi/MapServer', layers: [0] },
    'arcgis-kawasan-jagung': { url: 'https://sig02.pertanian.go.id/server/rest/services/Kawasan/Peta_Kawasan_Jagung/MapServer', layers: [0] },
    'arcgis-kawasan-kedelai': { url: 'https://sig02.pertanian.go.id/server/rest/services/Kawasan/Peta_Kawasan_Kedelai/MapServer', layers: [0] }
  };

  // ArcGIS Vector Tile: LBS 2019/2024 (Kementan, geoportal.pertanian.go.id)
  const LBS_VT_CONFIG = {
    'arcgis-vt-lbs-2024': {
      base: 'https://geoportal.pertanian.go.id/arcgis/rest/services/Hosted/LBS2024_TILE/VectorTileServer',
      sourceLayer: 'LBS2023',
      label: 'LBS 2024 (Vektor)',
      color: '#00c5ff',
      fillColor: 'rgba(115,223,255,0.33)'
    },
    'arcgis-vt-lbs-2019': {
      base: 'https://geoportal.pertanian.go.id/arcgis/rest/services/Hosted/LBS2019_TILE/VectorTileServer',
      sourceLayer: 'LBS2019',
      label: 'LBS 2019 (Vektor)',
      color: '#ffaa00',
      fillColor: 'rgba(255,170,0,0.33)'
    }
  };
  const lbsVtLayers = {};

  function getActiveLbsVtLayers() {
    return Object.keys(lbsVtLayers)
      .filter(k => lbsVtLayers[k] && map.hasLayer(lbsVtLayers[k]))
      .map(k => ({ layerKey: k, label: LBS_VT_CONFIG[k].label, color: LBS_VT_CONFIG[k].color }));
  }

  function showLbsVtLegend(layerKey) {
    if (typeof addUnifiedLegend !== 'function') return;
    const cfg = LBS_VT_CONFIG[layerKey];
    if (!cfg) return;
    const div = document.createElement('div');
    div.innerHTML = '<div class="geoportal-legend-title">' + cfg.label + '</div>'
      + '<div class="geoportal-legend-item geoportal-legend-row">'
      + '<span class="geoportal-legend-swatch" style="background:' + cfg.color + ';border:1px solid rgba(15,23,42,.25)"></span>'
      + '<span class="geoportal-legend-label">Lahan Baku Sawah</span></div>';
    if (typeof createLegendWithToggle === 'function') addUnifiedLegend(layerKey, createLegendWithToggle(div));
    else addUnifiedLegend(layerKey, div);
  }

  function toggleLbsVectorTile(layerKey, visible) {
    const cfg = LBS_VT_CONFIG[layerKey];
    if (!cfg) return;
    if (visible) {
      if (!lbsVtLayers[layerKey]) {
        if (!map.getPane('lbsVtPane')) map.createPane('lbsVtPane');
        map.getPane('lbsVtPane').style.zIndex = '455';
        const styles = {};
        styles[cfg.sourceLayer] = {
          fill: true,
          color: cfg.color,
          weight: 1,
          opacity: 0.95,
          fillColor: cfg.fillColor,
          fillOpacity: 1
        };
        lbsVtLayers[layerKey] = L.vectorGrid.protobuf(cfg.base + '/tile/{z}/{y}/{x}.pbf', {
          vectorTileLayerStyles: styles,
          minZoom: 3,
          maxZoom: 19,
          interactive: false,
          pane: 'lbsVtPane',
          updateWhenIdle: true
        });
      }
      if (!map.hasLayer(lbsVtLayers[layerKey])) map.addLayer(lbsVtLayers[layerKey]);
      showLbsVtLegend(layerKey);
      map.fitBounds([[ -7.75, 110.80 ], [ -7.35, 111.10 ]], { padding: [30, 30], maxZoom: 13 });
    } else {
      if (lbsVtLayers[layerKey] && map.hasLayer(lbsVtLayers[layerKey])) {
        map.removeLayer(lbsVtLayers[layerKey]);
      }
      if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend(layerKey);
    }
  }

  // WMTS KSA BPS (GeoWebCache, grid WebMercatorQuad = XYZ standar)
  const BPS_WMTS_CONFIG = {
    'bps-lbs-2024': { layer: 'ksa:lbs_2024' }
  };
  const bpsWmtsLayers = {};
  const BPS_WMTS_ERROR_TILE =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  function toggleBpsWmts(layerKey, visible) {
    const cfg = BPS_WMTS_CONFIG[layerKey];
    if (!cfg) return;
    if (visible) {
      if (!bpsWmtsLayers[layerKey]) {
        bpsWmtsLayers[layerKey] = L.tileLayer(
          'https://geoserver.bps.go.id/gwc/service/wmts?layer=' + encodeURIComponent(cfg.layer) +
          '&style=&tilematrixset=WebMercatorQuad&Service=WMTS&Request=GetTile&Version=1.0.0' +
          '&Format=image/png&TileMatrix={z}&TileCol={x}&TileRow={y}',
          {
            opacity: 0.85,
            bounds: [[-10.93, 95.0], [5.75, 140.9]],
            errorTileUrl: BPS_WMTS_ERROR_TILE,
            attribution: 'KSA BPS'
          }
        );
      }
      if (!map.hasLayer(bpsWmtsLayers[layerKey])) map.addLayer(bpsWmtsLayers[layerKey]);
    } else if (bpsWmtsLayers[layerKey] && map.hasLayer(bpsWmtsLayers[layerKey])) {
      map.removeLayer(bpsWmtsLayers[layerKey]);
    }
  }

  // WMS ST2023 (Sensus Pertanian 2023, KSA BPS) — tab Geotani
  const BPS_ST2023_WMS_URL = 'https://geoserver.bps.go.id/st2023/wms';
  const bpsSt2023Layers = {};
  const ST2023_LABELS = {
    'st2023:batas_desa': 'Batas Desa',
    'st2023:batas_kecamatan': 'Batas Kecamatan',
    'st2023:batas_kabupaten': 'Batas Kabupaten',
    'st2023:batas_provinsi': 'Batas Provinsi',
    'st2023:dasymetric_utp': 'Dasymetric UTP (Dasar)',
    'st2023:dasymetric_utp_tp': 'Dasymetric UTP Tanaman Pangan',
    'st2023:dasymetric_utp_horti': 'Dasymetric UTP Hortikultura',
    'st2023:dasymetric_utp_holti': 'Dasymetric UTP Holtikultura',
    'st2023:dasymetric_utp_hutan': 'Dasymetric UTP Hutan',
    'st2023:dasymetric_utp_ikan': 'Dasymetric UTP Perikanan',
    'st2023:dasymetric_utp_kebun': 'Dasymetric UTP Perkebunan',
    'st2023:dasymetric_utp_milenial': 'Dasymetric UTP Petani Milenial',
    'st2023:dasymetric_utp_ternak': 'Dasymetric UTP Peternakan',
    'st2023:dasymetric_utp_urban': 'Dasymetric UTP Urban',
    'st2023:geotagging': 'Geotagging (Semua)',
    'st2023:geotagging_tanaman_pangan': 'Geotagging Tanaman Pangan',
    'st2023:geotagging_hortikultura': 'Geotagging Hortikultura',
    'st2023:geotagging_kebun': 'Geotagging Perkebunan',
    'st2023:geotagging_hutan': 'Geotagging Hutan',
    'st2023:geotagging_ikan': 'Geotagging Perikanan',
    'st2023:geotagging_ternak': 'Geotagging Peternakan',
    'st2023:infrastruktur_pertanian': 'Infrastruktur Pertanian',
    'st2023:gurem_lahan_vw': 'Gurem Lahan'
  };
  function st2023UtpIhkLabel(layerName) {
    const m = layerName.match(/utp_ihk_(\d+)/);
    return m ? 'UTP IHK ' + String(Number(m[1])).padStart(2, '0') : layerName;
  }
  function st2023LabelFor(layerName) {
    if (ST2023_LABELS[layerName]) return ST2023_LABELS[layerName];
    if (/utp_ihk_/.test(layerName)) return st2023UtpIhkLabel(layerName);
    const short = layerName.replace(/^st2023:/, '');
    return ST2023_LABELS['st2023:' + short] || short;
  }
  function getActiveBpsSt2023Layers() {
    return Object.entries(bpsSt2023Layers)
      .filter(([, layer]) => layer && map.hasLayer(layer))
      .map(([layerName, layer]) => ({ layerName, layer }));
  }

  function toggleBpsSt2023Layer(layerName, visible) {
    if (!layerName) return;
    if (visible) {
      loadGeoportalCaps(BPS_ST2023_WMS_URL).catch(() => {});
      if (!bpsSt2023Layers[layerName]) {
        bpsSt2023Layers[layerName] = L.tileLayer.wms(
          'https://geoserver.bps.go.id/st2023/wms',
          {
            layers: layerName,
            format: 'image/png',
            transparent: true,
            version: '1.1.1',
            opacity: 0.85,
            attribution: 'ST2023 BPS'
          }
        );
        bpsSt2023Layers[layerName].on('tileerror', function (e) {
          console.warn('[Geotani] ST2023 tile error:', e.tile && e.tile.src);
        });
      }
      if (!map.hasLayer(bpsSt2023Layers[layerName])) map.addLayer(bpsSt2023Layers[layerName]);
      scheduleRenderGeoportalLegend();
    } else if (bpsSt2023Layers[layerName] && map.hasLayer(bpsSt2023Layers[layerName])) {
      map.removeLayer(bpsSt2023Layers[layerName]);
      scheduleRenderGeoportalLegend();
    }
  }

  // WMS Tutupan Lahan 100m (KSA BPS) — tab Geotani
  const bpsTutupanLahanState = { layer: null };

  function toggleBpsTutupanLahan(visible) {
    if (visible) {
      if (!bpsTutupanLahanState.layer) {
        bpsTutupanLahanState.layer = L.tileLayer.wms(
          'https://geoserver.bps.go.id/tutupan_lahan/wms',
          {
            layers: 'tutupan_lahan:tutupan_lahan_100m',
            format: 'image/png',
            transparent: true,
            version: '1.1.1',
            opacity: 0.85,
            attribution: 'KSA BPS'
          }
        );
        bpsTutupanLahanState.layer.on('tileerror', function (e) {
          console.warn('[Geotani] Tutupan Lahan tile error:', e.tile && e.tile.src);
        });
      }
      if (!map.hasLayer(bpsTutupanLahanState.layer)) map.addLayer(bpsTutupanLahanState.layer);
    } else if (bpsTutupanLahanState.layer && map.hasLayer(bpsTutupanLahanState.layer)) {
      map.removeLayer(bpsTutupanLahanState.layer);
    }
  }
  const arcgisSawahLayers = {};

  function toggleArcgisSawah(layerKey, visible) {
    if (LBS_VT_CONFIG[layerKey]) {
      toggleLbsVectorTile(layerKey, visible);
      return;
    }
    const config = ARCGIS_SAWAH_CONFIG[layerKey];
    if (!config) return;

    if (visible) {
      if (arcgisSawahLayers[layerKey]) { map.addLayer(arcgisSawahLayers[layerKey]); scheduleRenderGeoportalLegend(); return; }
      try {
        arcgisSawahLayers[layerKey] = L.esri.dynamicMapLayer({
          url: config.url,
          opacity: 0.7,
          layers: config.layers
        }).addTo(map);
      } catch (err) {
        console.warn('Gagal memuat layer ' + layerKey + ':', err);
      }
    } else {
      if (arcgisSawahLayers[layerKey] && map.hasLayer(arcgisSawahLayers[layerKey])) {
        map.removeLayer(arcgisSawahLayers[layerKey]);
      }
    }
    scheduleRenderGeoportalLegend();
  }

  var GEOPORTAL_LAYER_DATA = [];

  function buildGeoportalTree(layersConfig) {
    const container = document.getElementById('geoportalLayerList');
    if (!container) return;

    GEOPORTAL_LAYER_DATA = [];
    geoportalNodeIndex.clear();

    // Index metadata locally, but do not create thousands of jsTree nodes at startup.
    const categoryById = new Map();
    const folderById = new Map();
    const categoryNodes = [];
    layersConfig.categories.forEach(cat => {
      const wmsUrl = layersConfig.sources[cat.source]?.wmsUrl || GEOPORTAL_WMS_URL;
      categoryById.set(cat.id, { cat, wmsUrl });
      let totalCount = 0;
      const folders = cat.layers.length && cat.layers[0].type === 'folder';
      if (folders) {
        cat.layers.forEach(folder => {
          folderById.set(`${cat.id}::${folder.id}`, { cat, folder, wmsUrl });
          totalCount += (folder.children || []).length;
          (folder.children || []).forEach(child => {
            const nodeId = `${cat.id}::${folder.id}::${child.id}`;
            GEOPORTAL_LAYER_DATA.push({ id: child.id, label: child.label, category: cat.title, wmsUrl });
            geoportalNodeIndex.set(`${wmsUrl}::${child.id}`, nodeId);
          });
        });
      } else {
        totalCount = cat.layers.length;
        cat.layers.forEach(layer => {
          GEOPORTAL_LAYER_DATA.push({ id: layer.id, label: layer.label, category: cat.title, wmsUrl });
          if (layer.type !== 'arcgis') geoportalNodeIndex.set(`${wmsUrl}::${layer.id}`, `${cat.id}::${layer.id}`);
        });
      }
      categoryNodes.push({
        id: cat.id,
        text: cat.title + ' <span class="layer-count-badge">' + totalCount + '</span>',
        children: true,
        li_attr: { 'data-level': '0', 'data-wms-url': wmsUrl }
      });
    });

    function layerNode(cat, layer, wmsUrl, folderId) {
      const isArcgis = layer.type === 'arcgis';
      const nodeId = isArcgis ? layer.id : (folderId ? `${cat.id}::${folderId}::${layer.id}` : `${cat.id}::${layer.id}`);
      return {
        id: nodeId,
        text: layer.label,
        li_attr: { 'data-level': folderId ? '2' : '1', 'data-wms-url': wmsUrl, 'data-layer-name': isArcgis ? '' : layer.id }
      };
    }

    function getChildren(nodeId) {
      if (nodeId === '#') return categoryNodes;
      const categoryEntry = categoryById.get(nodeId);
      if (categoryEntry) {
        const { cat, wmsUrl } = categoryEntry;
        if (cat.layers.length && cat.layers[0].type === 'folder') {
          return cat.layers.map(folder => ({
            id: `${cat.id}::${folder.id}`,
            text: folder.label,
            children: true,
            li_attr: { 'data-level': '1', 'data-wms-url': wmsUrl }
          }));
        }
        return cat.layers.map(layer => layerNode(cat, layer, wmsUrl));
      }
      const folderEntry = folderById.get(nodeId);
      if (folderEntry) return (folderEntry.folder.children || []).map(layer => layerNode(folderEntry.cat, layer, folderEntry.wmsUrl, folderEntry.folder.id));
      return [];
    }

    function makeSearchTree(query) {
      const needle = query.toLocaleLowerCase();
      const results = [];
      layersConfig.categories.forEach(cat => {
        const { wmsUrl } = categoryById.get(cat.id);
        const categoryMatch = cat.title.toLocaleLowerCase().includes(needle);
        const grouped = cat.layers.length && cat.layers[0].type === 'folder';
        let children = [];
        if (grouped) {
          children = cat.layers.map(folder => {
            const hits = (folder.children || []).filter(layer => categoryMatch || `${layer.label} ${layer.id}`.toLocaleLowerCase().includes(needle));
            return hits.length ? { id: `${cat.id}::${folder.id}`, text: folder.label, state: { opened: true }, children: hits.map(layer => layerNode(cat, layer, wmsUrl, folder.id)) } : null;
          }).filter(Boolean);
        } else {
          children = cat.layers.filter(layer => categoryMatch || `${layer.label} ${layer.id}`.toLocaleLowerCase().includes(needle)).map(layer => layerNode(cat, layer, wmsUrl));
        }
        if (children.length) results.push({ id: cat.id, text: cat.title, children, state: { opened: true }, li_attr: { 'data-level': '0', 'data-wms-url': wmsUrl } });
      });
      return results;
    }

    let searchQuery = '';
    window.searchGeoportalLocal = function (query) {
      searchQuery = String(query || '').trim();
      const tree = $(container).jstree(true);
      if (tree) tree.refresh();
    };

    if (window.__geoportalTreeReady) {
      try { $(container).jstree('destroy'); } catch (e) {}
    }

    $(container).jstree({
      core: {
        data: function (node, callback) {
          callback(searchQuery ? (node.id === '#' ? makeSearchTree(searchQuery) : []) : getChildren(node.id));
        },
        themes: { dots: true, icons: true },
        check_callback: true,
        animation: 120
      },
      checkbox: {
        keep_selected_style: false,
        three_state: false,
        whole_node: true,
        tie_selection: false
      },
      plugins: ['checkbox', 'search'],
      search: {
        show_only_matches: true,
        show_only_matches_children: true,
        case_sensitive: false,
        fuzzy: false
      }
    });

    // Input pencarian sudah ada di GeoPortal Hub, tetapi sebelumnya tidak
    // pernah memanggil plugin search sehingga katalog tampak kosong.
    const searchInput = document.getElementById('geoportalSearchInput');
    if (searchInput && !searchInput.dataset.geoportalSearchBound) {
      searchInput.dataset.geoportalSearchBound = '1';
      let searchTimer = 0;
      searchInput.addEventListener('input', function () {
        clearTimeout(searchTimer);
        const query = this.value.trim();
        searchTimer = setTimeout(function () {
          const tree = $(container).jstree(true);
          if (!tree) return;
          window.searchGeoportalLocal(query);
        }, 180);
      });
    }
    if (searchInput && searchInput.value.trim()) {
      window.searchGeoportalLocal(searchInput.value.trim());
    }

    window.__geoportalTreeReady = true;
    setTimeout(updateGeoportalServerBadges, 600);
    setTimeout(updateGeoportalServerBadges, 2500);

    $(container).on('redraw.jstree open_node.jstree close_node.jstree search.jstree', function () {
      scheduleUpdateGeoportalServerBadges();
    });

    $(container).on('check_node.jstree', function (e, data) {
      const node = data.node;
      if (node.children && node.children.length) return;
      scheduleUpdateGeoportalServerBadges();
      const wmsUrl = node.li_attr['data-wms-url'] || GEOPORTAL_WMS_URL;
      const layerName = node.li_attr['data-layer-name'] || node.id;

      if (ARCGIS_SAWAH_CONFIG[node.id]) {
        toggleArcgisSawah(node.id, true);
      } else {
        toggleGeoportalLayer(layerName, true, wmsUrl);
      }
      if (typeof window.setGeoportalCatalogLayerState === 'function') {
        window.setGeoportalCatalogLayerState(wmsUrl + '::' + layerName, true);
      }
    });

    $(container).on('uncheck_node.jstree', function (e, data) {
      const node = data.node;
      if (node.children && node.children.length) return;
      scheduleUpdateGeoportalServerBadges();
      const wmsUrl = node.li_attr['data-wms-url'] || GEOPORTAL_WMS_URL;
      const layerName = node.li_attr['data-layer-name'] || node.id;

      if (ARCGIS_SAWAH_CONFIG[node.id]) {
        toggleArcgisSawah(node.id, false);
      } else {
        toggleGeoportalLayer(layerName, false, wmsUrl);
      }
      if (typeof window.setGeoportalCatalogLayerState === 'function') {
        window.setGeoportalCatalogLayerState(wmsUrl + '::' + layerName, false);
      }
    });
  }

  fetch('assets/data/geoportal-layers.json')
    .then(r => r.json())
    .then(cfg => {
      window.__geoportalLayersConfig = cfg;
      buildGeoportalTree(cfg);
    })
    .catch(err => console.error('[Geoportal] Gagal memuat geoportal-layers.json:', err));

  function showPrintLoading(message) {
    let el = document.getElementById('print-loading-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'print-loading-overlay';
      el.className = 'print-status-overlay';
      const box = document.createElement('div');
      box.className = 'print-status-box';
      const spin = document.createElement('div');
      spin.className = 'print-spinner';
      const txt = document.createElement('div');
      txt.className = 'print-status-text';
      txt.id = 'print-loading-text';
      txt.textContent = 'Sedang memproses cetak peta…';
      box.appendChild(spin);
      box.appendChild(txt);
      el.appendChild(box);
      document.body.appendChild(el);
    }
    const txt = document.getElementById('print-loading-text');
    if (txt) txt.textContent = message || 'Sedang memproses cetak peta…';
    el.style.display = 'flex';
  }
  function hidePrintLoading() {
    const el = document.getElementById('print-loading-overlay');
    if (el) el.style.display = 'none';
  }
  function showPrintError(message) {
    let el = document.getElementById('print-error-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'print-error-overlay';
      el.className = 'print-status-overlay';
      const box = document.createElement('div');
      box.className = 'print-error-box';
      const icon = document.createElement('div');
      icon.className = 'print-error-icon';
      icon.textContent = '!';
      const txt = document.createElement('div');
      txt.className = 'print-status-text';
      txt.id = 'print-error-text';
      box.appendChild(icon);
      box.appendChild(txt);
      el.appendChild(box);
      document.body.appendChild(el);
    }
    el.querySelector('#print-error-text').textContent = 'Gagal mencetak peta: ' + (message || 'Terjadi kesalahan.');
    el.style.display = 'flex';
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => { el.style.display = 'none'; }, 4500);
  }

  /* ── Print helpers ── */
  const _arcgisLabels = {
    'arcgis-sawah-2023': 'Sawah 2023 (Kementan)',
    'arcgis-sawah-2019': 'LBS 2019 (Kementan)',
    'arcgis-kawasan-padi': 'Kawasan Padi (Kementan)',
    'arcgis-kawasan-jagung': 'Kawasan Jagung (Kementan)',
    'arcgis-kawasan-kedelai': 'Kawasan Kedelai (Kementan)',
    'arcgis-vt-lbs-2024': 'LBS 2024 (Vektor)',
    'arcgis-vt-lbs-2019': 'LBS 2019 (Vektor)'
  };

  function _buildLabelMap() {
    const labelMap = {}, categoryMap = {};
    if (typeof GEOPORTAL_LAYER_DATA !== 'undefined' && Array.isArray(GEOPORTAL_LAYER_DATA)) {
      GEOPORTAL_LAYER_DATA.forEach(d => {
        if (d && d.id) {
          if (!labelMap[d.id]) labelMap[d.id] = d.label || d.id;
          if (!categoryMap[d.id] && d.category) categoryMap[d.id] = d.category;
        }
      });
    }
    return { labelMap, categoryMap };
  }

  function _dispName(labelMap, categoryMap, layerName) {
    const lbl = labelMap[layerName] || layerName;
    const cat = categoryMap[layerName] || '';
    return cat ? cat + ' \u2014 ' + lbl : lbl;
  }

  function _getActiveCatalogPrintLayers() {
    if (typeof window.buildLayerCatalogIfNeeded === 'function') window.buildLayerCatalogIfNeeded();
    const seen = new Set();
    return Array.from(document.querySelectorAll('.lc-item input[type="checkbox"][data-layer-id]:checked'))
      .map(function (checkbox) {
        const id = checkbox.dataset.layerId;
        const row = checkbox.closest('.lc-item');
        const label = row && row.querySelector('label');
        return { id, label: label ? label.textContent.trim() : id };
      })
      .filter(function (item) {
        if (!item.id || seen.has(item.id)) return false;
        seen.add(item.id);
        return !!item.label;
      });
  }

  // Include active Leaflet overlays from every app module, even when that
  // module does not register with the Geoportal layer lists above.
  function _getActiveMapPrintLayers(knownLabels) {
    const result = [];
    const seen = new Set(knownLabels || []);
    const baseName = window.currentBasemapName || currentBasemapName || '';
    if (!map || typeof map.eachLayer !== 'function') return result;
    const drawn = (typeof window.getDrawnLayers === 'function' ? window.getDrawnLayers() : [])
      .concat(typeof window.getMeasuredLayers === 'function' ? window.getMeasuredLayers() : []);
    const drawnCount = drawn.filter(Boolean).length;
    if (drawnCount) {
      const label = 'Gambar dan pengukuran (' + drawnCount + ' fitur)';
      if (!seen.has(label)) { seen.add(label); result.push({ kind: 'map', label: label }); }
    }
    map.eachLayer(function (layer) {
      if (!layer || layer === map) return;
      const options = layer.options || {};
      const pane = options.pane || '';
      const url = layer._url || (layer._url && layer._url.url) || '';
      const declared = options.name || options.layerName || options.title || layer.layerName || '';
      // The active basemap is already represented separately in the PDF.
      if (declared && String(declared).toLowerCase() === String(baseName).toLowerCase()) return;
      if (pane === 'tilePane' && !declared && layer instanceof L.TileLayer &&
          (options.zIndex == null || Number(options.zIndex) <= 200)) return;
      // Feature groups are containers; report their visible children instead.
      if (layer instanceof L.LayerGroup && !(layer instanceof L.FeatureGroup)) return;
      if (layer instanceof L.FeatureGroup) return;
      if (!(layer instanceof L.Layer)) return;
      let label = declared;
      if (!label && options.attribution) label = String(options.attribution).replace(/<[^>]*>/g, '').trim();
      if (!label && url) {
        try {
          const parsed = new URL(url, location.href);
          label = (parsed.hostname.replace(/^www\./, '') + parsed.pathname).replace(/\/{2,}/g, '/');
        } catch (e) { label = ''; }
      }
      if (!label) {
        if (layer instanceof L.Marker) label = 'Titik peta';
        else if (layer instanceof L.Polygon) label = 'Poligon peta';
        else if (layer instanceof L.Polyline) label = 'Garis peta';
        else if (layer instanceof L.Circle) label = 'Lingkaran peta';
        else if (layer instanceof L.TileLayer) label = 'Layer raster';
        else if (layer instanceof L.ImageOverlay) label = 'Overlay gambar';
        else return;
      }
      label = String(label).replace(/\s+/g, ' ').trim();
      if (!label || seen.has(label)) return;
      seen.add(label);
      result.push({ kind: 'map', label: label });
    });
    return result;
  }

  function _getVisibleHwsdPrintLegendItems() {
    var tiles = document.querySelectorAll('canvas[data-hwsd-district-tile]');
    var byColor = window.hwsdIndonesiaByColor || {};
    var legend = window.hwsdIndonesiaLegend || [];
    var classes = new Map();
    tiles.forEach(function (tile) {
      var bounds = tile.getBoundingClientRect();
      if (!bounds.width || !bounds.height || bounds.right <= 0 || bounds.bottom <= 0 || bounds.left >= innerWidth || bounds.top >= innerHeight) return;
      try {
        var pixels = tile.getContext('2d').getImageData(0, 0, tile.width, tile.height).data;
        // A stride of 4 samples the clipped raster efficiently. It finds
        // visible soil classes while keeping PDF preparation lightweight.
        for (var i = 0; i < pixels.length; i += 4 * 4) {
          if (pixels[i + 3] < 80) continue;
          var color = '#' + [pixels[i], pixels[i + 1], pixels[i + 2]].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
          var row = byColor[color];
          if (!row) continue;
          var code = String(row['Kode WRB'] || '').toUpperCase();
          var item = legend.find(function (candidate) { return String(candidate.code || '').toUpperCase() === code; });
          var label = item ? item.label : (row['Kelas WRB'] || code);
          if (label && !classes.has(label)) classes.set(label, { kind: 'swatch', label: label, color: item ? item.color : color });
        }
      } catch (e) { /* Tile tidak dapat dibaca: cetak legenda layer umum saja. */ }
    });
    if (!classes.size) return [];
    return [{ kind: 'section', label: 'HWSD v2.01 · Kelompok tanah WRB' }].concat(Array.from(classes.values()));
  }

  function _getActiveUnifiedPrintLegendItems(knownLabels) {
    var seen = new Set(knownLabels || []);
    var result = [];
    document.querySelectorAll('.unified-legend-section').forEach(function (section) {
      if (section.dataset.legendId === 'hwsd-indonesia') return;
      var titleNode = section.querySelector('.geoportal-legend-title, [class$="-legend-title"], strong');
      var title = titleNode ? titleNode.textContent.replace(/[▾⌄]/g, '').trim() : '';
      var rows = section.querySelectorAll('.geoportal-legend-item, .hwsd-id-legend-row, [class$="-legend-row"]');
      var addedRow = false;
      rows.forEach(function (row) {
        var labelNode = row.querySelector('.geoportal-legend-label, .hwsd-id-legend-row span, span:last-child');
        var label = (labelNode ? labelNode.textContent : row.textContent).replace(/[▾⌄]/g, '').trim();
        if (!label || seen.has(label)) return;
        var swatch = row.querySelector('.geoportal-legend-swatch, i, [style*="background"]');
        var color = swatch ? (swatch.style.backgroundColor || getComputedStyle(swatch).backgroundColor) : '';
        seen.add(label);
        result.push({ kind: 'swatch', label: label, color: color && color !== 'rgba(0, 0, 0, 0)' ? color : '#64748b' });
        addedRow = true;
      });
      if (!addedRow && title && !seen.has(title)) {
        seen.add(title);
        result.push({ kind: 'map', label: title });
      }
    });
    return result;
  }

  function _calcInterval(range, targetLines) {
    const raw = range / targetLines;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    if (norm <= 1.5) return mag;
    if (norm <= 3.5) return 2 * mag;
    if (norm <= 7.5) return 5 * mag;
    return 10 * mag;
  }

  function _printLegendColor(color) {
    var hex = String(color || '').match(/^#([0-9a-f]{6})$/i);
    if (hex) return [parseInt(hex[1].slice(0, 2), 16), parseInt(hex[1].slice(2, 4), 16), parseInt(hex[1].slice(4, 6), 16)];
    var rgb = String(color || '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : [100, 116, 139];
  }

  async function _loadLegendGraphic(url) {
    let fetchTimer = null;
    let imgTimer = null;
    try {
      const ctrl = new AbortController();
      fetchTimer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { mode: 'cors', signal: ctrl.signal });
      clearTimeout(fetchTimer);
      fetchTimer = null;
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob || !blob.type || blob.type.indexOf('image') !== 0) return null;
      const dataUrl = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });
      const im = await new Promise((resolve, reject) => {
        const img = new Image();
        imgTimer = setTimeout(() => reject(new Error('image timeout')), 5000);
        img.onload = () => { clearTimeout(imgTimer); imgTimer = null; resolve(img); };
        img.onerror = () => { clearTimeout(imgTimer); imgTimer = null; reject(new Error('image error')); };
        img.src = dataUrl;
      });
      return { dataUrl, w: im.naturalWidth, h: im.naturalHeight };
    } catch (e) {
      if (fetchTimer) clearTimeout(fetchTimer);
      if (imgTimer) clearTimeout(imgTimer);
      return null;
    }
  }

  /* ── Shared map capture: wait tiles + proxy non-CORS images ── */
  function _waitTilesReady(maxMs) {
    maxMs = maxMs || 6000;
    return new Promise(function (resolve) {
      var start = Date.now();
      (function tick() {
        var pending = 0;
        var imgs = document.querySelectorAll('.leaflet-container img');
        for (var i = 0; i < imgs.length; i++) {
          if (!imgs[i].complete) pending++;
        }
        if (pending === 0 || Date.now() - start >= maxMs) { resolve(); return; }
        setTimeout(tick, 120);
      })();
    });
  }

  function _captureProxySrc(src) {
    if (!src) return src;
    if (src.indexOf('data:') === 0 || src.indexOf('blob:') === 0) return src;
    if (src.indexOf('images.weserv.nl') !== -1) return src;
    var full = src.indexOf('//') === 0 ? (location.protocol + src) : src;
    if (full.indexOf('http://') !== 0 && full.indexOf('https://') !== 0) return src;
    return 'https://images.weserv.nl/?url=' + encodeURIComponent(full);
  }

  var TILE_SNAPSHOT_FORMAT = 'image/jpeg';
  var TILE_SNAPSHOT_QUALITY = 0.92;
  var TILE_SNAPSHOT_CONCURRENCY = 6;
  // Keep export responsive when a remote tile server is slow. Successful
  // snapshots remain cached, so repeat exports are faster still.
  var TILE_SNAPSHOT_TIMEOUT = 3500;
  var TILE_SNAPSHOT_BUDGET = 12000;
  var TILE_PROXY_CHAIN = [
    function (u) { return 'https://kta-cors-proxy.ms-ruang-imajinasi.workers.dev/?url=' + encodeURIComponent(u); },
    function (u) { return 'https://images.weserv.nl/?url=' + encodeURIComponent(u); }
  ];

  function _imgIsOriginSafe(img, src) {
    if (img && (img.crossOrigin === 'anonymous' || img.crossOrigin === 'use-credentials')) return true;
    if (!src) return false;
    if (src.indexOf('data:') === 0 || src.indexOf('blob:') === 0) return true;
    try {
      return new URL(src, location.href).origin === location.origin;
    } catch (e) {
      return false;
    }
  }

  var _snapshotCanvas = null;
  function _drawToDataUrl(source, w, h, format) {
    if (!source || !w || !h) return null;
    if (!_snapshotCanvas) _snapshotCanvas = document.createElement('canvas');
    if (_snapshotCanvas.width !== w) _snapshotCanvas.width = w;
    if (_snapshotCanvas.height !== h) _snapshotCanvas.height = h;
    var ctx = _snapshotCanvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
    format = format || TILE_SNAPSHOT_FORMAT;
    return format === 'image/jpeg'
      ? _snapshotCanvas.toDataURL(format, TILE_SNAPSHOT_QUALITY)
      : _snapshotCanvas.toDataURL(format);
  }

  function _snapshotFormatForSrc(src) {
    // PNG/WebP/GIF tiles may contain transparent pixels. JPEG snapshots turn
    // those pixels black, which makes clipped overlays cover the basemap.
    return /\.(?:png|webp|gif)(?:[?#]|$)/i.test(src || '') ? 'image/png' : TILE_SNAPSHOT_FORMAT;
  }

  var TILE_SNAPSHOT_CACHE_MAX = 400;
  var _tileSnapshotCache = {};
  var _tileSnapshotCacheKeys = [];

  function _rememberTileSnapshot(src, dataUrl) {
    if (_tileSnapshotCache[src]) return;
    _tileSnapshotCache[src] = dataUrl;
    _tileSnapshotCacheKeys.push(src);
    while (_tileSnapshotCacheKeys.length > TILE_SNAPSHOT_CACHE_MAX) {
      delete _tileSnapshotCache[_tileSnapshotCacheKeys.shift()];
    }
  }

  async function _fetchImageBitmap(target) {
    var controller = null;
    var timer = null;
    try {
      controller = new AbortController();
      timer = setTimeout(function () { controller.abort(); }, TILE_SNAPSHOT_TIMEOUT);
      var res = await fetch(target, { mode: 'cors', signal: controller.signal });
      if (!res.ok) return null;
      var type = (res.headers.get('content-type') || '').toLowerCase();
      if (type && type.indexOf('image/') !== 0) return null;
      var blob = await res.blob();
      if (!blob || !blob.size) return null;
      return await createImageBitmap(blob);
    } catch (e) {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function _fetchTileBitmap(url) {
    var direct = await _fetchImageBitmap(url);
    if (direct) return direct;
    for (var i = 0; i < TILE_PROXY_CHAIN.length; i++) {
      var bitmap = await _fetchImageBitmap(TILE_PROXY_CHAIN[i](url));
      if (bitmap) return bitmap;
    }
    return null;
  }

  async function _snapshotTileImages(container) {
    var imgs = container.querySelectorAll('img');
    var map = {};
    var failed = [];
    var direct = [];
    var remote = [];
    var seen = {};

    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      if (!img.complete || !img.naturalWidth || !img.naturalHeight) continue;
      var src = img.getAttribute('src') || '';
      if (!src || src.indexOf('data:') === 0) continue;
      if (seen[src]) continue;
      seen[src] = true;
      if (_tileSnapshotCache[src]) { map[src] = _tileSnapshotCache[src]; continue; }
      if (_imgIsOriginSafe(img, src)) direct.push({ src: src, img: img });
      else remote.push(src);
    }

    var total = direct.length + remote.length;
    var done = 0;
    function tick() {
      done++;
      if (total > 4 && (done % 4 === 0 || done === total)) {
        showPrintLoading('Menyiapkan peta: ' + done + '/' + total + ' tile…');
      }
    }

    for (var d = 0; d < direct.length; d++) {
      var url = null;
      try {
        url = _drawToDataUrl(direct[d].img, direct[d].img.naturalWidth, direct[d].img.naturalHeight, _snapshotFormatForSrc(direct[d].src));
      } catch (e) {
        url = null;
      }
      if (url) _rememberTileSnapshot(direct[d].src, url);
      if (url) map[direct[d].src] = url;
      else failed.push(direct[d].src);
      tick();
    }

    var cursor = 0;
    var startedAt = Date.now();
    async function worker() {
      while (cursor < remote.length) {
        var src = remote[cursor++];
        var bitmap = null;
        if (Date.now() - startedAt > TILE_SNAPSHOT_BUDGET) {
          failed.push(src);
          tick();
          continue;
        }
        try {
          bitmap = await _fetchTileBitmap(src);
        } catch (e) {
          bitmap = null;
        }
        var dataUrl = null;
        if (bitmap) {
          try {
            dataUrl = _drawToDataUrl(bitmap, bitmap.width, bitmap.height, _snapshotFormatForSrc(src));
          } catch (e) {
            dataUrl = null;
          }
          if (bitmap.close) bitmap.close();
        }
        if (dataUrl) _rememberTileSnapshot(src, dataUrl);
        if (dataUrl) map[src] = dataUrl;
        else failed.push(src);
        tick();
      }
    }

    var workers = [];
    var count = Math.min(TILE_SNAPSHOT_CONCURRENCY, remote.length);
    for (var w = 0; w < count; w++) workers.push(worker());
    if (workers.length) await Promise.all(workers);

    return { map: map, failed: failed, total: total, captured: Object.keys(map).length };
  }

  var BOUNDARY_GEOJSON_URL = 'assets/data/bps/geojson/provinsi.geojson';
  var BOUNDARY_GEOJSON_TIMEOUT = 12000;
  var _boundaryGeoJson = null;

  function _nextFrames(count) {
    return new Promise(function (resolve) {
      var left = count;
      (function step() {
        if (left-- <= 0) { resolve(); return; }
        requestAnimationFrame(step);
      })();
    });
  }

  async function _loadBoundaryGeoJson() {
    if (_boundaryGeoJson) return _boundaryGeoJson;
    if (typeof fetch !== 'function') return null;
    var controller = null;
    var timer = null;
    try {
      controller = new AbortController();
      timer = setTimeout(function () { controller.abort(); }, BOUNDARY_GEOJSON_TIMEOUT);
      var res = await fetch(BOUNDARY_GEOJSON_URL, { signal: controller.signal });
      if (!res.ok) return null;
      var json = await res.json();
      if (!json || !json.features || !json.features.length) return null;
      _boundaryGeoJson = json;
      return json;
    } catch (e) {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function _addBoundaryGeoJsonLayer() {
    if (typeof isProvinceBoundaryActive !== 'function' || !isProvinceBoundaryActive()) return null;
    if (typeof L === 'undefined' || !L.geoJSON) return null;
    var geo = await _loadBoundaryGeoJson();
    if (!geo) return null;
    var layer = L.geoJSON(geo, {
      interactive: false,
      style: { color: '#ffffff', weight: 1.2, opacity: 0.85, fill: false }
    });
    layer.addTo(map);
    await _nextFrames(3);
    return {
      restore: function () {
        try {
          if (map.hasLayer(layer)) map.removeLayer(layer);
        } catch (e) {}
      }
    };
  }

  var VECTOR_RASTER_CONCURRENCY = 4;
  var VECTOR_RASTER_TIMEOUT = 6000;
  var VECTOR_RASTER_BUDGET = 20000;
  var VECTOR_RASTER_LIMIT = 90;

  function _stylePx(style, key) {
    var match = new RegExp('(?:^|;)\\s*' + key + '\\s*:\\s*([\\d.]+)px').exec(style || '');
    return match ? Math.round(parseFloat(match[1])) : 0;
  }

  function _loadSvgImage(svg) {
    var style = svg.getAttribute('style') || '';
    var w = _stylePx(style, 'width') || parseInt(svg.getAttribute('width'), 10) || 0;
    var h = _stylePx(style, 'height') || parseInt(svg.getAttribute('height'), 10) || 0;
    if (!w || !h) {
      var rect = svg.getBoundingClientRect();
      w = Math.round(rect.width);
      h = Math.round(rect.height);
    }
    if (!w || !h) return null;

    var clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', w);
    clone.setAttribute('height', h);
    clone.removeAttribute('style');
    var url = 'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(new XMLSerializer().serializeToString(clone));

    return new Promise(function (resolve) {
      var img = new Image();
      var done = false;
      var finish = function (ok) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(ok ? { img: img, w: w, h: h, style: style } : null);
      };
      var timer = setTimeout(function () { finish(false); }, VECTOR_RASTER_TIMEOUT);
      img.onload = function () { finish(true); };
      img.onerror = function () { finish(false); };
      img.src = url;
    });
  }

  async function _rasterizeVectorTiles(container) {
    var pane = container.querySelector('.leaflet-map-pane');
    if (!pane) return { restore: function () {}, failed: 0 };
    // Keep user drawn and measured geometry as live Leaflet SVG. Converting
    // interactive SVGs to canvases can make their paths disappear in the
    // html2canvas clone, especially after edit/measure operations.
    var svgs = Array.prototype.slice.call(pane.querySelectorAll('svg')).filter(function (svg) {
      return !svg.querySelector('.leaflet-interactive');
    });
    if (svgs.length > VECTOR_RASTER_LIMIT) svgs = svgs.slice(0, VECTOR_RASTER_LIMIT);
    var originals = [];
    var failed = 0;
    if (!svgs.length) return { restore: function () {}, failed: 0 };

    var cursor = 0;
    var startedAt = Date.now();
    async function worker() {
      while (cursor < svgs.length) {
        var svg = svgs[cursor++];
        if (Date.now() - startedAt > VECTOR_RASTER_BUDGET) { failed++; continue; }
        var loaded = null;
        try {
          loaded = await _loadSvgImage(svg);
        } catch (e) {
          loaded = null;
        }
        if (!loaded) { failed++; continue; }
        try {
          var canvas = document.createElement('canvas');
          canvas.width = loaded.w;
          canvas.height = loaded.h;
          canvas.getContext('2d').drawImage(loaded.img, 0, 0, loaded.w, loaded.h);
          canvas.setAttribute('style', loaded.style);
          canvas.style.width = loaded.w + 'px';
          canvas.style.height = loaded.h + 'px';
          canvas.className = svg.getAttribute('class') || 'leaflet-tile';
          if (svg.parentNode) {
            svg.parentNode.replaceChild(canvas, svg);
            originals.push({ svg: svg, canvas: canvas });
          }
        } catch (e) {
          failed++;
        }
      }
    }

    var workers = [];
    var count = Math.min(VECTOR_RASTER_CONCURRENCY, svgs.length);
    for (var w = 0; w < count; w++) workers.push(worker());
    await Promise.all(workers);

    return {
      failed: failed,
      restore: function () {
        for (var i = originals.length - 1; i >= 0; i--) {
          var pair = originals[i];
          try {
            if (pair.canvas.parentNode) pair.canvas.parentNode.replaceChild(pair.svg, pair.canvas);
          } catch (e) {}
        }
      }
    };
  }

  function _assertCapturedTiles(canvas, snap) {
    if (!canvas || !canvas.width || !canvas.height) {
      throw new Error('Capture peta gagal: kanvas kosong.');
    }
    var snapTotal = (snap && snap.total) || 0;
    var snapCaptured = (snap && snap.captured) || 0;

    var probe = document.createElement('canvas');
    var scale = Math.min(1, 160 / canvas.width, 160 / canvas.height);
    probe.width = Math.max(1, Math.round(canvas.width * scale));
    probe.height = Math.max(1, Math.round(canvas.height * scale));
    var pctx = probe.getContext('2d', { willReadFrequently: true });
    if (!pctx) return;
    pctx.drawImage(canvas, 0, 0, probe.width, probe.height);

    var data;
    try {
      data = pctx.getImageData(0, 0, probe.width, probe.height).data;
    } catch (e) {
      return;
    }

    var counts = {};
    var total = 0;
    for (var i = 0; i < data.length; i += 4) {
      var key = (data[i] >> 4) + ',' + (data[i + 1] >> 4) + ',' + (data[i + 2] >> 4) + ',' + (data[i + 3] >> 4);
      counts[key] = (counts[key] || 0) + 1;
      total++;
    }

    var distinct = 0;
    var topKey = '';
    var topCount = 0;
    for (var k in counts) {
      if (!Object.prototype.hasOwnProperty.call(counts, k)) continue;
      distinct++;
      if (counts[k] > topCount) { topCount = counts[k]; topKey = k; }
    }
    if (!total || !topKey) return;

    var parts = topKey.split(',');
    var lum = 0.299 * (parseInt(parts[0], 10) * 16 + 8)
      + 0.587 * (parseInt(parts[1], 10) * 16 + 8)
      + 0.114 * (parseInt(parts[2], 10) * 16 + 8);
    var frac = topCount / total;
    var uniformDark = distinct <= 2 && frac >= 0.995 && lum < 14;
    var nothingCaptured = snapTotal > 0 && snapCaptured === 0;
    var failedCount = (snap && snap.failed && snap.failed.length) || 0;

    if (uniformDark || nothingCaptured) {
      throw new Error('Capture peta kosong: ' + failedCount + ' dari ' + snapTotal +
        ' tile gagal diambil. Ganti basemap atau muat ulang halaman, lalu coba lagi.');
    }
    if (failedCount > 0) {
      console.warn('[PrintGeoportal] ' + failedCount + ' tile gagal diambil saat export.');
    }
  }

  async function captureMapCanvas(opts) {
    opts = opts || {};
    var container = document.querySelector('.leaflet-container');
    if (!container) throw new Error('Peta tidak siap');
    // HWSD district clipping and some catalog overlays are native Leaflet
    // canvas tiles. Keep those on html2canvas so their complete rendered tile
    // (including destination-in polygon masks) is captured as one surface.
    // The direct renderer is faster for image/SVG-only maps.
    if (opts.fastRenderer && !container.querySelector('.leaflet-pane canvas.leaflet-tile')) {
      return _renderMapJpegCanvas(container);
    }
    map.invalidateSize();
    await _waitTilesReady(opts.tileWaitMs || 6000);
    var snap = await _snapshotTileImages(container);
    await new Promise(function (r) { setTimeout(r, 350); });
    var geoBoundary = await _addBoundaryGeoJsonLayer();
    // PDF export intentionally omits SVG overlays. They are expensive to
    // serialize/rasterize and have caused the map overlay capture to be flaky.
    var vectors = opts.skipSvg
      ? { failed: 0, restore: function () {} }
      : await _rasterizeVectorTiles(container);
    var canvas;
    try {
      canvas = await html2canvas(container, {
        useCORS: true,
        allowTaint: false,
        scale: opts.scale || 2,
        logging: false,
        backgroundColor: '#e8e8e8',
        imageTimeout: 15000,
        ignoreElements: opts.ignoreElements || function (el) {
          if (!el) return false;
          if (el.id === 'print-loading-overlay' || el.id === 'print-error-overlay') return true;
          return false;
        },
        onclone: function (doc) {
          var c = doc.querySelector('.leaflet-container');
          if (!c) return;
          if (opts.skipSvg) {
            c.querySelectorAll('svg').forEach(function (svg) { svg.remove(); });
          }
          var imgs = c.querySelectorAll('img');
          for (var i = 0; i < imgs.length; i++) {
            var img = imgs[i];
            var src = img.getAttribute('src') || '';
            if (!src || src.indexOf('data:') === 0) continue;
            var snapshot = snap.map[src];
            if (snapshot) {
              img.removeAttribute('crossorigin');
              img.setAttribute('src', snapshot);
              continue;
            }
            var proxied = _captureProxySrc(src);
            if (proxied !== src) {
              img.setAttribute('crossorigin', 'anonymous');
              img.setAttribute('src', proxied);
            } else if (src.indexOf('http') === 0 || src.indexOf('//') === 0) {
              img.setAttribute('crossorigin', 'anonymous');
            }
          }
        }
      });
      _assertCapturedTiles(canvas, snap);
      if (vectors.failed) {
        console.warn('[PrintGeoportal] ' + vectors.failed + ' layer vektor SVG gagal di-raster.');
      }
      return canvas;
    } finally {
      vectors.restore();
      if (geoBoundary) geoBoundary.restore();
    }
  }

  /* ── Phase 1: Prepare print data ── */
  async function preparePrintData() {
    map.closePopup();

    const { labelMap, categoryMap } = _buildLabelMap();
    const allBasemapLabels = Object.assign({}, vectorBasemapLabels || {}, satelliteBasemapLabels || {});
    const bmFriendly = allBasemapLabels[currentBasemapName] || currentBasemapName || 'Peta';

    const titleNames = [];
    getActiveGeoportalLayers().forEach(a => titleNames.push(_dispName(labelMap, categoryMap, a.layerName)));
    getActiveArcgisLayers().forEach(a => titleNames.push(_arcgisLabels[a.layerKey] || a.layerKey));
    getActiveLbsVtLayers().forEach(a => titleNames.push(_arcgisLabels[a.layerKey] || a.label));
    const catalogLayers = _getActiveCatalogPrintLayers();
    catalogLayers.forEach(function (item) {
      if (titleNames.indexOf(item.label) === -1) titleNames.push(item.label);
    });
    _getActiveMapPrintLayers(titleNames).forEach(function (item) { titleNames.push(item.label); });
    let titleText;
    if (titleNames.length === 0) titleText = bmFriendly;
    else titleText = titleNames.slice(0, 3).join(', ') + (titleNames.length > 3 ? ` (+${titleNames.length - 3})` : '');

    const sidebar = document.getElementById('sidebar-left');
    const hiddenEls = [];
    if (sidebar && !sidebar.classList.contains('collapsed')) {
      sidebar.classList.add('collapsed');
      hiddenEls.push({ restore: () => sidebar.classList.remove('collapsed') });
    }

    const overlays = document.querySelectorAll('.unified-search, .map-insight-cards, .leaflet-control-zoom, .leaflet-control-locate, .reset-layers-btn, .geoportal-print-btn, .geoportal-legend, .basemap-btn, .basemap-control-wrap, .leaflet-control-scale, .detail-panel-btn, #detail-panel, .draw-fab-wrap, .legend-wrap, .zoom-control-wrap, .geoid-marker-wrap, .leaflet-control-mouse-position, .wind-legend, .himawari-legend, .maritime-legend, .leaflet-control-legend, .quick-layer-bar, .petadasar-export-block, #print-error-overlay, .print-area-buttons, .print-area-frame, .print-area-vignette, .print-instruction, .map-fab-item, .map-fab-menu, .map-fab-overlay, .map-fab-btn, .layer-catalog-dropdown, .layer-catalog-btn, #geotools-sheet, .unified-slider-container, .unified-legend-container');
    overlays.forEach(el => {
      if (el && getComputedStyle(el).display !== 'none') {
        const prev = el.style.display;
        el.style.setProperty('display', 'none', 'important');
        hiddenEls.push({ restore: () => { el.style.display = prev; } });
      }
    });
    var _essentialControls = new Set(['leaflet-control-zoom', 'leaflet-control-locate', 'leaflet-control-scale']);
    document.querySelectorAll('.leaflet-control').forEach(function (el) {
      var cls = el.className || '';
      var dominated = false;
      _essentialControls.forEach(function (k) { if (cls.indexOf(k) !== -1) dominated = true; });
      if (dominated) return;
      if (el.querySelector('.geoportal-print-btn')) return;
      if (getComputedStyle(el).display !== 'none') {
        var prev = el.style.display;
        el.style.setProperty('display', 'none', 'important');
        hiddenEls.push({ restore: function () { el.style.display = prev; } });
      }
    });

    map.invalidateSize();
    await new Promise(r => setTimeout(r, 400));

    const pageW = 297, pageH = 210, margin = 8;
    const mapFrameX = margin;
    const mapFrameY = margin;
    const mapFrameW = 205;
    const mapFrameH = pageH - margin * 2;
    const panelX = mapFrameX + mapFrameW + 4;
    const panelW = pageW - panelX - margin;
    const panelH = mapFrameH;

    let mapImg = null;
    let exportCanvas = null;
    let exportBbox = null;
    let effLonMin = null, effLonMax = null, effLatMin = null, effLatMax = null;
    let mCX = mapFrameX + mapFrameW / 2, mCY = mapFrameY + mapFrameH / 2;

    try {
      const leafletContainer = document.querySelector('.leaflet-container');
      if (leafletContainer) {
        // Keep Leaflet SVG overlays in the capture. Removing SVGs here also
        // removes drawn/imported polygons from the exported map.
        const mapCanvas = await captureMapCanvas({ fastRenderer: true });
        const canvasAspect = mapCanvas.width / mapCanvas.height;
        const frameAspect = mapFrameW / mapFrameH;
        let cropX, cropY, cropW, cropH;
        if (canvasAspect > frameAspect) {
          cropH = mapCanvas.height; cropW = cropH * frameAspect;
          cropX = (mapCanvas.width - cropW) / 2; cropY = 0;
        } else {
          cropW = mapCanvas.width; cropH = cropW / frameAspect;
          cropX = 0; cropY = (mapCanvas.height - cropH) / 2;
        }
        const c = document.createElement('canvas');
        c.width = Math.round(cropW); c.height = Math.round(cropH);
        c.getContext('2d').drawImage(mapCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        mapImg = c.toDataURL('image/jpeg', 0.92);

        const vb = map.getBounds();
        const lonMin = vb.getWest(), lonMax = vb.getEast();
        const latMin = vb.getSouth(), latMax = vb.getNorth();
        const fx = cropW / mapCanvas.width, fy = cropH / mapCanvas.height;
        effLonMin = lonMin + (lonMax - lonMin) * (0.5 - fx / 2);
        effLonMax = lonMin + (lonMax - lonMin) * (0.5 + fx / 2);
        effLatMax = latMax - (latMax - latMin) * (0.5 - fy / 2);
        effLatMin = latMax - (latMax - latMin) * (0.5 + fy / 2);
        mCX = mapFrameX + mapFrameW / 2; mCY = mapFrameY + mapFrameH / 2;

        exportBbox = { lonMin: lonMin, lonMax: lonMax, latMin: latMin, latMax: latMax };
        const EX_MAX = 4096;
        if (mapCanvas.width > EX_MAX || mapCanvas.height > EX_MAX) {
          const exScale = EX_MAX / Math.max(mapCanvas.width, mapCanvas.height);
          const dc = document.createElement('canvas');
          dc.width = Math.max(1, Math.round(mapCanvas.width * exScale));
          dc.height = Math.max(1, Math.round(mapCanvas.height * exScale));
          dc.getContext('2d').drawImage(mapCanvas, 0, 0, dc.width, dc.height);
          exportCanvas = dc;
        } else {
          exportCanvas = mapCanvas;
        }
      }
    } catch (e) {
      console.warn('[PrintGeoportal] Gagal menangkap peta:', e);
      hiddenEls.forEach(function (h) { if (h.restore) try { h.restore(); } catch (err) {} });
      try { map.invalidateSize(); } catch (err) {}
      throw e;
    }

    const mapBounds = map.getBounds();
    const latMin = (effLatMin != null) ? effLatMin : mapBounds.getSouth();
    const latMax = (effLatMax != null) ? effLatMax : mapBounds.getNorth();
    const lonMin = (effLonMin != null) ? effLonMin : mapBounds.getWest();
    const lonMax = (effLonMax != null) ? effLonMax : mapBounds.getEast();

    const legendItems = [];
    getActiveGeoportalLayers().forEach(a => {
      const isPoint = geoportalPointLayerKeys.has(`${a.wmsUrl}::${a.layerName}`);
      legendItems.push({ kind: isPoint ? 'point' : 'wms', label: _dispName(labelMap, categoryMap, a.layerName), wmsUrl: a.wmsUrl, layerName: a.layerName });
    });
    getActiveArcgisLayers().forEach(a => {
      legendItems.push({ kind: 'arcgis', label: _arcgisLabels[a.layerKey] || a.layerKey });
    });
    getActiveLbsVtLayers().forEach(a => {
      legendItems.push({ kind: 'arcgis', label: _arcgisLabels[a.layerKey] || a.label });
    });
    catalogLayers.forEach(function (item) {
      if (!legendItems.some(function (legend) { return legend.label === item.label; })) {
        legendItems.push({ kind: 'catalog', label: item.label });
      }
    });
    _getActiveMapPrintLayers(legendItems.map(function (item) { return item.label; })).forEach(function (item) {
      legendItems.push(item);
    });
    _getActiveUnifiedPrintLegendItems(legendItems.map(function (item) { return item.label; })).forEach(function (item) {
      legendItems.push(item);
    });
    _getVisibleHwsdPrintLegendItems().forEach(function (item) {
      legendItems.push(item);
    });
    await (async () => {
      const loadAll = Promise.all(legendItems.map(async it => {
        if (it.kind !== 'wms') return;
        const r = await _loadLegendGraphic(buildGeoportalLegendGraphicUrl(it.wmsUrl, it.layerName));
        if (r && r.w > 2 && r.h > 2) { it.img = r.dataUrl; it.iw = r.w; it.ih = r.h; }
      }));
      let timer = null;
      const timeout = new Promise(resolve => { timer = setTimeout(resolve, 12000); });
      await Promise.race([loadAll, timeout]);
      if (timer) clearTimeout(timer);
    })();

    const satLegends = (typeof window.SATELLITE_LEGENDS !== 'undefined') ? window.SATELLITE_LEGENDS : null;
    const bmLegend = satLegends && satLegends[currentBasemapName] ? satLegends[currentBasemapName] : null;

    const activeNames = [];
    getActiveGeoportalLayers().forEach(a => activeNames.push(_dispName(labelMap, categoryMap, a.layerName)));
    getActiveArcgisLayers().forEach(a => activeNames.push(_arcgisLabels[a.layerKey] || a.layerKey));
    getActiveLbsVtLayers().forEach(a => activeNames.push(_arcgisLabels[a.layerKey] || a.label));
    catalogLayers.forEach(function (item) {
      if (activeNames.indexOf(item.label) === -1) activeNames.push(item.label);
    });
    legendItems.forEach(function (item) {
      if (item.kind !== 'basemap' && activeNames.indexOf(item.label) === -1) activeNames.push(item.label);
    });
    activeNames.unshift('Basemap: ' + bmFriendly);
    legendItems.unshift({ kind: 'basemap', label: 'Basemap · ' + bmFriendly });

    return {
      hiddenEls, titleText, bmFriendly, mapImg, legendItems, fullLegendItems: legendItems.slice(), bmLegend,
      baseBmLegend: bmLegend, showLegend: true, includeBasemapLegend: true, activeNames,
      exportCanvas, exportBbox,
      pageW, pageH, margin,
      mapFrameX, mapFrameY, mapFrameW, mapFrameH,
      panelX, panelW, panelH, mCX, mCY,
      latMin, latMax, lonMin, lonMax, now: new Date()
    };
  }

  /* ── Phase 2a: Render canvas preview ── */
  function renderPreviewCanvas(data) {
    const SCALE = 2;
    const cW = data.pageW * SCALE;
    const cH = data.pageH * SCALE;
    const s = SCALE;
    data.mapView = data.mapView || { scale: 1, dx: 0, dy: 0 };

    const overlay = document.createElement('div');
    overlay.className = 'print-preview-overlay';
    overlay.innerHTML = '<div class="print-preview-spinner"></div>';
    document.body.appendChild(overlay);

    const container = document.createElement('div');
    container.className = 'print-preview-container';
    const canvas = document.createElement('canvas');
    canvas.width = cW; canvas.height = cH;
    container.appendChild(canvas);

    const controls = document.createElement('div');
    controls.className = 'print-preview-controls';
    controls.innerHTML = '<label class="print-preview-title">Judul peta<input type="text" maxlength="120" aria-label="Judul peta"></label>' +
      '<div class="print-preview-map-tools"><span class="print-preview-control-label">Atur posisi peta</span>' +
      '<div class="print-preview-tool-row"><button type="button" data-pan="up" aria-label="Geser peta ke atas">▲</button></div>' +
      '<div class="print-preview-tool-row"><button type="button" data-pan="left" aria-label="Geser peta ke kiri">◀</button>' +
      '<button type="button" data-zoom="out" aria-label="Perkecil peta">−</button><span class="print-preview-zoom">100%</span>' +
      '<button type="button" data-zoom="in" aria-label="Perbesar peta">+</button><button type="button" data-pan="right" aria-label="Geser peta ke kanan">▶</button></div>' +
      '<div class="print-preview-tool-row"><button type="button" data-pan="down" aria-label="Geser peta ke bawah">▼</button></div></div>';
    controls.querySelector('input').value = data.titleText || '';

    const actions = document.createElement('div');
    actions.className = 'print-preview-actions';
    actions.innerHTML = '<button class="print-preview-cancel">\u2715 Batal</button><button class="print-preview-confirm">\uD83D\uDCBB Cetak PDF</button>';
    overlay.appendChild(container);
    overlay.appendChild(controls);
    overlay.appendChild(actions);
    const spinnerEarly = overlay.querySelector('.print-preview-spinner');
    if (spinnerEarly) spinnerEarly.style.display = 'none';

    const ctx = canvas.getContext('2d');

    let previewMapImage = null;
    if (data.mapImg) {
      previewMapImage = new Image();
      previewMapImage.onload = drawPreviewPage;
      previewMapImage.src = data.mapImg;
    }

    function drawPreviewPage() {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cW, cH);
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 0.4 * s;
      ctx.strokeRect(data.margin * s, data.margin * s, (data.pageW - data.margin * 2) * s, (data.pageH - data.margin * 2) * s);
      ctx.strokeStyle = '#374151'; ctx.lineWidth = 0.3 * s;
      ctx.strokeRect(data.mapFrameX * s, data.mapFrameY * s, data.mapFrameW * s, data.mapFrameH * s);
      if (previewMapImage && previewMapImage.complete && previewMapImage.naturalWidth) {
        const view = data.mapView;
        ctx.save();
        ctx.beginPath(); ctx.rect(data.mapFrameX * s, data.mapFrameY * s, data.mapFrameW * s, data.mapFrameH * s); ctx.clip();
        const drawW = data.mapFrameW * view.scale, drawH = data.mapFrameH * view.scale;
        const drawX = data.mapFrameX + (data.mapFrameW - drawW) / 2 + view.dx * data.mapFrameW;
        const drawY = data.mapFrameY + (data.mapFrameH - drawH) / 2 + view.dy * data.mapFrameH;
        ctx.drawImage(previewMapImage, drawX * s, drawY * s, drawW * s, drawH * s);
        ctx.restore();
      }
      _drawPreviewOverlay(ctx, data, s, cW, cH);
    }
    function refreshMapControls() {
      const view = data.mapView, maxPan = (view.scale - 1) / 2;
      controls.querySelector('.print-preview-zoom').textContent = Math.round(view.scale * 100) + '%';
      controls.querySelectorAll('[data-pan]').forEach(button => {
        const dir = button.dataset.pan;
        const blocked = maxPan < 0.001 || (dir === 'left' && view.dx <= -maxPan + 0.001) || (dir === 'right' && view.dx >= maxPan - 0.001) || (dir === 'up' && view.dy <= -maxPan + 0.001) || (dir === 'down' && view.dy >= maxPan - 0.001);
        button.disabled = blocked;
      });
      controls.querySelector('[data-zoom="out"]').disabled = view.scale <= 1;
    }
    controls.querySelector('input').addEventListener('input', function () { data.titleText = this.value.trim(); drawPreviewPage(); });
    controls.querySelectorAll('[data-zoom]').forEach(button => button.addEventListener('click', function () {
      data.mapView.scale = Math.max(1, Math.min(3, data.mapView.scale * (this.dataset.zoom === 'in' ? 1.2 : 1 / 1.2)));
      const maxPan = (data.mapView.scale - 1) / 2;
      data.mapView.dx = Math.max(-maxPan, Math.min(maxPan, data.mapView.dx));
      data.mapView.dy = Math.max(-maxPan, Math.min(maxPan, data.mapView.dy));
      refreshMapControls(); drawPreviewPage();
    }));
    controls.querySelectorAll('[data-pan]').forEach(button => button.addEventListener('click', function () {
      const step = 0.06, maxPan = (data.mapView.scale - 1) / 2;
      if (this.dataset.pan === 'left') data.mapView.dx = Math.max(-maxPan, data.mapView.dx - step);
      if (this.dataset.pan === 'right') data.mapView.dx = Math.min(maxPan, data.mapView.dx + step);
      if (this.dataset.pan === 'up') data.mapView.dy = Math.max(-maxPan, data.mapView.dy - step);
      if (this.dataset.pan === 'down') data.mapView.dy = Math.min(maxPan, data.mapView.dy + step);
      refreshMapControls(); drawPreviewPage();
    }));
    refreshMapControls();
    actions.querySelector('.print-preview-cancel').addEventListener('click', function () {
      overlay.remove();
      data.exportCanvas = null;
      data.hiddenEls.forEach(h => { if (h.restore) try { h.restore(); } catch (e) {} });
      try { map.invalidateSize(); } catch (e) {}
    });

    actions.querySelector('.print-preview-confirm').addEventListener('click', function () {
      overlay.remove();
      data.exportCanvas = null;
      generatePDF(data);
    });

    // Wire the controls before the first canvas render so a rendering error
    // cannot leave a visible preview with inert buttons.
    try { drawPreviewPage(); }
    catch (error) { console.error('[PrintGeoportal] Gagal merender preview:', error); }
  }

  /* ── Global Export TIF — viewport langsung, tanpa alur cetak ── */
  const EXPORT_UI_SELECTORS = [
    '.unified-search', '.map-insight-cards',
    '.leaflet-control-zoom', '.leaflet-control-locate', '.leaflet-control-scale',
    '.leaflet-control-mouse-position', '.leaflet-control-layers', '.leaflet-control-attribution',
    '.reset-layers-btn', '.geoportal-print-btn', '.geoportal-legend',
    '.basemap-btn', '.basemap-control-wrap',
    '.detail-panel-btn', '#detail-panel',
    '.draw-fab-wrap', '.legend-wrap', '.zoom-control-wrap',
    '.geoid-marker-wrap', '.wind-legend', '.himawari-legend', '.maritime-legend',
    '.leaflet-control-legend', '.quick-layer-bar', '.petadasar-export-block',
    '#print-error-overlay',
    '.print-area-buttons', '.print-area-frame', '.print-area-vignette', '.print-instruction',
    '.map-fab-wrap', '.map-fab-item', '.map-fab-menu', '.map-fab-overlay', '.map-fab-btn',
    '.layer-catalog-dropdown', '.layer-catalog-btn', '#geotools-sheet',
    '.unified-slider-container', '.unified-legend-container',
    '.modis-time-slider-wrap', '.bmkg-time-slider-wrap', '.sentinel2-time-slider-wrap',
    '.ze-time-slider-wrap', '.ghrsst-time-slider-wrap',
    '.modis-ts-title', '.modis-ts-controls', '.modis-ts-info', '.modis-ts-slider-wrap',
    '.bmkg-ts-title', '.bmkg-ts-controls', '.bmkg-ts-info', '.bmkg-ts-slider-wrap',
    '.s1rtc-time-slider-wrap', '.s1rtc-ts-title', '.s1rtc-ts-controls', '.s1rtc-ts-info', '.s1rtc-ts-slider-wrap',
    '.sentinel2-ts-slider-wrap', '.sat-export-btn'
  ].join(', ');

  function _hideExportUi(hiddenEls) {
    document.querySelectorAll(EXPORT_UI_SELECTORS).forEach(function (el) {
      if (el && getComputedStyle(el).display !== 'none') {
        var prev = el.style.display;
        el.style.setProperty('display', 'none', 'important');
        hiddenEls.push(function () { el.style.display = prev; });
      }
    });
    document.querySelectorAll('.leaflet-control-container .leaflet-control, .leaflet-top, .leaflet-bottom').forEach(function (el) {
      if (el && getComputedStyle(el).display !== 'none') {
        var prev = el.style.display;
        el.style.setProperty('display', 'none', 'important');
        hiddenEls.push(function () { el.style.display = prev; });
      }
    });
  }

  function _isExportIgnoredEl(el) {
    if (!el || !el.classList) return false;
    if (el.id === 'print-loading-overlay' || el.id === 'print-error-overlay' || el.id === 'print-preview-overlay') return true;
    var cls = (typeof el.className === 'string' && el.className) || (el.getAttribute && el.getAttribute('class')) || '';
    if (!cls) return false;
    if (cls.indexOf('leaflet-control') !== -1) return true;
    if (cls.indexOf('leaflet-top') !== -1 || cls.indexOf('leaflet-bottom') !== -1 || cls.indexOf('leaflet-bar') !== -1) return true;
    if (cls.indexOf('map-fab') !== -1) return true;
    if (cls.indexOf('time-slider') !== -1 || cls.indexOf('-ts-') !== -1) return true;
    if (cls.indexOf('unified-slider') !== -1 || cls.indexOf('unified-legend') !== -1) return true;
    if (cls.indexOf('print-area') !== -1) return true;
    if (/\b(dm-sidebar|lg-sidebar|pa-panel|sheet|gs-sheet|geodata-sheet|attr-table-sheet|ais-sheet|hs-sheet|gp-sheet)\b/.test(cls)) return true;
    return false;
  }

  async function _renderMapJpegCanvas(container) {
    map.invalidateSize();
    await _waitTilesReady(3500);
    // HWSD district clips are rendered by Leaflet as canvas tiles, so image-only
    // readiness checks can finish while those polygon tiles are still painting.
    var tileWaitStarted = Date.now();
    while (Date.now() - tileWaitStarted < 4500) {
      var pendingTile = Array.from(container.querySelectorAll('.leaflet-tile')).some(function (tile) {
        var box = tile.getBoundingClientRect();
        if (!box.width || !box.height || box.right <= 0 || box.bottom <= 0 || box.left >= innerWidth || box.top >= innerHeight) return false;
        return !tile.classList.contains('leaflet-tile-loaded') || (tile.tagName === 'IMG' && !tile.complete);
      });
      if (!pendingTile) break;
      await new Promise(function (resolve) { setTimeout(resolve, 80); });
    }
    var snap = await _snapshotTileImages(container);
    var rect = container.getBoundingClientRect();
    var scale = 2;
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));
    var ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Draw every visual primitive in Leaflet panes, not only basemap tiles.
    // Catalog and Geoportal Hub overlays can be raster tiles, SVG vectors,
    // canvas grids, or marker images; DOM order preserves their stacking.
    var nodes = container.querySelectorAll('.leaflet-tile, .leaflet-pane img, .leaflet-pane canvas, .leaflet-pane svg, .leaflet-pane .leaflet-marker-icon');
    var drawSvg = async function (svg, box) {
      try {
        var clone = svg.cloneNode(true);
        if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        // Percentage-sized Leaflet SVGs lose their CSS viewport when loaded as
        // standalone data images. Give the clone explicit raster dimensions.
        var svgWidth = svg.clientWidth || Math.round(box.width);
        var svgHeight = svg.clientHeight || Math.round(box.height);
        clone.setAttribute('width', String(svgWidth));
        clone.setAttribute('height', String(svgHeight));
        if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', '0 0 ' + svgWidth + ' ' + svgHeight);
        var sourceNodes = [svg].concat(Array.from(svg.querySelectorAll('*')));
        var cloneNodes = [clone].concat(Array.from(clone.querySelectorAll('*')));
        var styleProps = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'visibility'];
        sourceNodes.forEach(function (sourceNode, index) {
          var computed = getComputedStyle(sourceNode);
          var inline = styleProps.map(function (prop) { return prop + ':' + computed.getPropertyValue(prop); }).join(';');
          cloneNodes[index].setAttribute('style', (cloneNodes[index].getAttribute('style') || '') + ';' + inline);
        });
        var data = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
        var image = new Image();
        await new Promise(function (resolve, reject) {
          image.onload = resolve;
          image.onerror = reject;
          image.src = data;
        });
        ctx.drawImage(image, box.left - rect.left, box.top - rect.top, box.width, box.height);
      } catch (e) { /* SVG eksternal yang gagal diraster dilewati. */ }
    };

    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (_isExportIgnoredEl(node)) continue;
      var box = node.getBoundingClientRect();
      if (!box.width || !box.height || box.right <= rect.left || box.left >= rect.right || box.bottom <= rect.top || box.top >= rect.bottom) continue;
      var opacity = 1;
      for (var parent = node; parent && parent !== container; parent = parent.parentElement) {
        var ownOpacity = parseFloat(getComputedStyle(parent).opacity);
        if (Number.isFinite(ownOpacity)) opacity *= ownOpacity;
      }
      ctx.globalAlpha = opacity;
      if (node.tagName.toLowerCase() === 'svg') {
        await drawSvg(node, box);
        continue;
      }
      var source = node;
      if (node.tagName.toLowerCase() === 'img') {
        var src = node.getAttribute('src') || '';
        var snapshot = snap.map[src];
        if (snapshot) {
          source = new Image();
          source.src = snapshot;
          try { await source.decode(); } catch (e) { continue; }
        } else {
          if (!node.complete || !node.naturalWidth || !_imgIsOriginSafe(node, src)) continue;
        }
      }
      try { ctx.drawImage(source, box.left - rect.left, box.top - rect.top, box.width, box.height); } catch (e) {}
    }
    ctx.globalAlpha = 1;
    return canvas;
  }

  async function exportMapScreenshotJpeg(btn) {
    var original = btn && btn.innerHTML;
    var hiddenEls = [];
    if (!document.querySelector('.leaflet-container') || !window.map) {
      showPrintError('Simpan JPEG: peta belum siap.');
      return;
    }
    if (btn) { btn.style.pointerEvents = 'none'; btn.setAttribute('aria-disabled', 'true'); }
    showPrintLoading('Sedang menyiapkan JPEG…');
    try {
      _hideExportUi(hiddenEls);
      map.invalidateSize();
      await new Promise(function (resolve) { setTimeout(resolve, 250); });
      var container = document.querySelector('.leaflet-container');
      var canvas = await captureMapCanvas({ fastRenderer: true });
      var blob = await new Promise(function (resolve, reject) {
        canvas.toBlob(function (result) { result ? resolve(result) : reject(new Error('Gagal membuat gambar JPEG')); }, 'image/jpeg', 0.92);
      });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var d = new Date();
      var pad = function (n) { return String(n).padStart(2, '0'); };
      a.download = 'peta-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-z' + map.getZoom() + '.jpg';
      a.href = url;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (err) {
      console.error('[SimpanJPEG]', err);
      showPrintError('Simpan JPEG: ' + (err && err.message ? err.message : String(err)));
    } finally {
      while (hiddenEls.length) {
        try { hiddenEls.pop()(); } catch (e) {}
      }
      hidePrintLoading();
      try { map.invalidateSize(); } catch (e) {}
      if (btn) { btn.style.pointerEvents = ''; btn.removeAttribute('aria-disabled'); if (original != null) btn.innerHTML = original; }
    }
  }
  window.exportMapScreenshotJpeg = exportMapScreenshotJpeg;

  async function exportViewportGeoTiff(btn) {
    const orig = btn && btn.innerHTML;
    const hiddenEls = [];
    let succeeded = false;
    let failedMsg = null;

    function restoreExportUi() {
      while (hiddenEls.length) {
        var h = hiddenEls.pop();
        try { h(); } catch (e) {}
      }
    }

    function fail(msg) {
      failedMsg = msg;
      console.error('[ExportTIF]', msg);
      showPrintError('Export GeoTIFF: ' + (msg || 'Terjadi kesalahan.'));
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Gagal';
        setTimeout(function () { if (orig != null) btn.innerHTML = orig; }, 4000);
      }
    }

    if (typeof window.GeoTIFF === 'undefined' || typeof window.GeoTIFF.writeArrayBuffer !== 'function') {
      return fail('GeoTIFF.js belum termuat');
    }
    const leafletContainer = document.querySelector('.leaflet-container');
    if (!leafletContainer || !window.map) return fail('Peta tidak siap');
    if (btn) { btn.disabled = true; btn.textContent = '…'; }

    showPrintLoading('Sedang mengekspor GeoTIFF…');
    try {
      _hideExportUi(hiddenEls);
      map.invalidateSize();
      await new Promise(function (r) { setTimeout(r, 400); });

      const mapCanvas = await captureMapCanvas({
        fastRenderer: true
      });
      const EX_MAX = 4096;
      let canvas = mapCanvas;
      if (mapCanvas.width > EX_MAX || mapCanvas.height > EX_MAX) {
        const exScale = EX_MAX / Math.max(mapCanvas.width, mapCanvas.height);
        const dc = document.createElement('canvas');
        dc.width = Math.max(1, Math.round(mapCanvas.width * exScale));
        dc.height = Math.max(1, Math.round(mapCanvas.height * exScale));
        dc.getContext('2d').drawImage(mapCanvas, 0, 0, dc.width, dc.height);
        canvas = dc;
      }
      const w = canvas.width, h = canvas.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const rgba = ctx.getImageData(0, 0, w, h).data;
      const rgb = new Uint8Array(w * h * 3);
      for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
        const a = rgba[i + 3] / 255;
        rgb[j] = Math.round(rgba[i] * a + 255 * (1 - a));
        rgb[j + 1] = Math.round(rgba[i + 1] * a + 255 * (1 - a));
        rgb[j + 2] = Math.round(rgba[i + 2] * a + 255 * (1 - a));
      }
      const vb = map.getBounds();
      const sw = L.CRS.EPSG3857.project(vb.getSouthWest());
      const ne = L.CRS.EPSG3857.project(vb.getNorthEast());
      const sx = (ne.x - sw.x) / w;
      const sy = (ne.y - sw.y) / h;
      const metadata = {
        width: w,
        height: h,
        SamplesPerPixel: [3],
        BitsPerSample: [8, 8, 8],
        PhotometricInterpretation: 2,
        PlanarConfiguration: 1,
        Compression: 1,
        ModelPixelScale: [sx, sy, 0],
        ModelTiepoint: [0, 0, 0, sw.x, ne.y, 0],
        GTModelTypeGeoKey: 1,
        GTRasterTypeGeoKey: 1,
        ProjectedCSTypeGeoKey: 3857
      };
      const buffer = await window.GeoTIFF.writeArrayBuffer(rgb, metadata);
      const d = new Date();
      const pad2 = function (n) { return n < 10 ? '0' + n : String(n); };
      const date = d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
      const name = 'viewport-' + date + '-z' + map.getZoom() + '-' + w + 'x' + h + '.tif';
      const blob = new Blob([buffer], { type: 'image/tiff' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.download = name;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      succeeded = true;
    } catch (err) {
      fail(err && err.message ? err.message : String(err));
    } finally {
      restoreExportUi();
      hidePrintLoading();
      try { map.invalidateSize(); } catch (e) {}
      if (btn && !failedMsg) {
        btn.disabled = false;
        if (succeeded) {
          btn.textContent = '✓';
          setTimeout(function () { if (orig != null) btn.innerHTML = orig; }, 4000);
        }
      }
    }
  }
  window.exportViewportGeoTiff = exportViewportGeoTiff;

  function _drawRuangKitaWatermarkCanvas(ctx, centerX, centerY, s) {
    ctx.save();
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + (19 * s) + 'px Arial, sans-serif';
    ctx.fillText('PREVIEW', centerX * s, (centerY - 6) * s);
    ctx.font = 'bold ' + (15 * s) + 'px Arial, sans-serif';
    ctx.fillText('RUANGKITA', centerX * s, (centerY + 8) * s);
    ctx.restore();
  }

  function _drawRuangKitaWatermarkPdf(pdf, centerX, centerY) {
    var hasOpacity = false;
    try {
      pdf.setGState(new pdf.GState({ opacity: 0.38 }));
      hasOpacity = true;
    } catch (e) {}
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(42);
    pdf.text('PREVIEW', centerX, centerY - 2, { align: 'center' });
    pdf.setFontSize(32);
    pdf.text('RUANGKITA', centerX, centerY + 10, { align: 'center' });
    if (hasOpacity) {
      try { pdf.setGState(new pdf.GState({ opacity: 1 })); } catch (e) {}
    }
  }

  function _getPrintViewBounds(data) {
    const view = data.mapView || { scale: 1, dx: 0, dy: 0 };
    const scale = Math.max(1, view.scale || 1);
    const u0 = 0.5 - 0.5 / scale - (view.dx || 0) / scale;
    const v0 = 0.5 - 0.5 / scale - (view.dy || 0) / scale;
    const lonRange = data.lonMax - data.lonMin, latRange = data.latMax - data.latMin;
    return {
      lonMin: data.lonMin + u0 * lonRange, lonMax: data.lonMin + (u0 + 1 / scale) * lonRange,
      latMax: data.latMax - v0 * latRange, latMin: data.latMax - (v0 + 1 / scale) * latRange
    };
  }

  function _drawPreviewOverlay(ctx, data, s, cW, cH) {
    const viewBounds = _getPrintViewBounds(data);
    const { mapFrameX, mapFrameY, mapFrameW, mapFrameH, panelX, panelW, panelH,
      margin, pageW, mCX, mCY, legendItems, bmLegend, activeNames } = data;
    const { latMin, latMax, lonMin, lonMax } = viewBounds;

    ctx.strokeStyle = '#374151'; ctx.lineWidth = 0.3 * s;
    ctx.strokeRect(mapFrameX * s, mapFrameY * s, mapFrameW * s, mapFrameH * s);

    const latRange = latMax - latMin, lonRange = lonMax - lonMin;
    const latInterval = _calcInterval(latRange, 6), lonInterval = _calcInterval(lonRange, 8);
    ctx.strokeStyle = '#b4b4b4'; ctx.lineWidth = 0.15 * s;
    ctx.setLineDash([1.5 * s, 1.5 * s]);
    ctx.font = '6px "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = '#505050';
    const latStart = Math.ceil(latMin / latInterval) * latInterval;
    for (let lat = latStart; lat <= latMax; lat += latInterval) {
      const ratio = (lat - latMin) / latRange;
      const py = mapFrameY + mapFrameH - ratio * mapFrameH;
      ctx.beginPath(); ctx.moveTo(mapFrameX * s, py * s); ctx.lineTo((mapFrameX + mapFrameW) * s, py * s); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(lat.toFixed(latInterval < 0.1 ? 2 : 1) + '\u00B0', (mapFrameX - 1) * s, (py + 1.5) * s);
    }
    const lonStart = Math.ceil(lonMin / lonInterval) * lonInterval;
    for (let lon = lonStart; lon <= lonMax; lon += lonInterval) {
      const ratio = (lon - lonMin) / lonRange;
      const px = mapFrameX + ratio * mapFrameW;
      ctx.beginPath(); ctx.moveTo(px * s, mapFrameY * s); ctx.lineTo(px * s, (mapFrameY + mapFrameH) * s); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(lon.toFixed(lonInterval < 0.1 ? 2 : 1) + '\u00B0', px * s, (mapFrameY + mapFrameH + 3.5) * s);
    }
    ctx.setLineDash([]);

    _drawRuangKitaWatermarkCanvas(ctx, mapFrameX + mapFrameW / 2, mapFrameY + mapFrameH / 2, s);

    ctx.strokeStyle = '#c8c8c8'; ctx.lineWidth = 0.2 * s;
    ctx.beginPath(); ctx.moveTo(panelX * s, mapFrameY * s); ctx.lineTo(panelX * s, (mapFrameY + panelH) * s); ctx.stroke();

    let py = mapFrameY + 5;
    ctx.fillStyle = '#1e293b'; ctx.font = 'bold 10px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    const headTitle = data.titleText || 'LAYER AKTIF';
    const titleMaxWidth = (panelW - 8) * s;
    const titleWords = headTitle.split(/\s+/);
    let titleLine = '';
    titleWords.forEach(function (word) {
      const candidate = titleLine ? titleLine + ' ' + word : word;
      if (titleLine && ctx.measureText(candidate).width > titleMaxWidth) {
        ctx.fillText(titleLine, (panelX + 4) * s, py * s);
        py += 4.5;
        titleLine = word;
      } else titleLine = candidate;
    });
    if (titleLine) { ctx.fillText(titleLine, (panelX + 4) * s, py * s); py += 4.5; }
    ctx.fillStyle = '#64748b'; ctx.font = '6.5px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(data.now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }), (panelX + 4) * s, py * s); py += 3.5;
    ctx.fillText('Basemap: ' + data.bmFriendly, (panelX + 4) * s, py * s); py += 3.5;
    ctx.fillStyle = '#969696'; ctx.font = '6px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('WGS84 / EPSG:4326', (panelX + 4) * s, py * s);
    py += 3;
    ctx.strokeStyle = '#c8c8c8'; ctx.lineWidth = 0.2 * s;
    ctx.beginPath(); ctx.moveTo((panelX + 4) * s, py * s); ctx.lineTo((panelX + panelW - 4) * s, py * s); ctx.stroke();
    py += 3;

    const sLatMin = latMin;
    const sLatMax = latMax;
    const centerLatS = (sLatMin + sLatMax) / 2;
    const mPerDegS = 111132.92 - 559.82 * Math.cos(2 * centerLatS * Math.PI / 180);
    const mPerPxS = ((sLatMax - sLatMin) * mPerDegS) / mapFrameH;
    const naCX = panelX + panelW / 2, naCY = py + 11, naR = 9;
    ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 0.3 * s;
    ctx.beginPath(); ctx.arc(naCX * s, naCY * s, naR * s, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(naCX * s, (naCY - naR + 1.5) * s);
    ctx.lineTo((naCX - 2.8) * s, naCY * s);
    ctx.lineTo((naCX + 2.8) * s, naCY * s);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#94a3b8'; ctx.beginPath();
    ctx.moveTo(naCX * s, (naCY + naR - 1.5) * s);
    ctx.lineTo((naCX - 2.8) * s, naCY * s);
    ctx.lineTo((naCX + 2.8) * s, naCY * s);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1e293b'; ctx.font = 'bold 6px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('N', naCX * s, (naCY - naR - 2) * s);
    ctx.fillStyle = '#64748b'; ctx.font = '5.5px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('UTARA', naCX * s, (naCY + naR + 3) * s);

    const sbPixelLen = 44;
    const rawM = sbPixelLen * mPerPxS;
    const tM = Math.pow(10, Math.floor(Math.log10(rawM)));
    const nrm = rawM / tM;
    const niceM = (nrm <= 1.5) ? 1 * tM : (nrm <= 3.5) ? 2 * tM : (nrm <= 7.5) ? 5 * tM : 10 * tM;
    const niceW = niceM / mPerPxS;
    const sbLX = panelX + (panelW - niceW) / 2;
    const sbBY = naCY + naR + 9;
    const sbH = 1.8;
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 0.3 * s;
    ctx.beginPath(); ctx.moveTo(sbLX * s, sbBY * s); ctx.lineTo((sbLX + niceW) * s, sbBY * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sbLX * s, (sbBY - 1.3) * s); ctx.lineTo(sbLX * s, (sbBY + 1.3) * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo((sbLX + niceW / 2) * s, (sbBY - 1.3) * s); ctx.lineTo((sbLX + niceW / 2) * s, (sbBY + 1.3) * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo((sbLX + niceW) * s, (sbBY - 1.3) * s); ctx.lineTo((sbLX + niceW) * s, (sbBY + 1.3) * s); ctx.stroke();
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(sbLX * s, (sbBY - sbH / 2) * s, (niceW / 2) * s, sbH * s);
    ctx.fillStyle = '#dce0e6';
    ctx.fillRect((sbLX + niceW / 2) * s, (sbBY - sbH / 2) * s, (niceW / 2) * s, sbH * s);
    const sbUnit = niceM >= 1000 ? (niceM / 1000) + ' km' : niceM + ' m';
    ctx.fillStyle = '#374151'; ctx.font = '5.5px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('0', sbLX * s, (sbBY - 2.4) * s);
    ctx.fillText(sbUnit, (sbLX + niceW) * s, (sbBY - 2.4) * s);
    ctx.fillStyle = '#64748b'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('SKALA', sbLX * s, (sbBY + 3) * s);
    py = sbBY + 8;

    if (data.showLegend !== false) {
    py += 4;
    ctx.strokeStyle = '#c8c8c8'; ctx.lineWidth = 0.2 * s;
    ctx.beginPath(); ctx.moveTo((panelX + 4) * s, py * s); ctx.lineTo((panelX + panelW - 4) * s, py * s); ctx.stroke();
    py += 5;
    ctx.fillStyle = '#64748b'; ctx.font = 'bold 6.5px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('LEGENDA', (panelX + 4) * s, (py + 3) * s);
    py += 6;

    if (bmLegend) {
      ctx.fillStyle = '#374151'; ctx.font = 'bold 6.5px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(bmLegend.title + (bmLegend.unit ? ' \u2014 ' + bmLegend.unit : ''), (panelX + 4) * s, (py + 2.5) * s);
      py += 4.5;
      const gradX = panelX + 4, gradW = panelW - 20, gradH = 4;
      const stops = bmLegend.gradient;
      for (let gx = 0; gx < gradW; gx++) {
        let t = gx / gradW, c1 = stops[0][1], c2 = stops[stops.length - 1][1];
        for (let si = 0; si < stops.length - 1; si++) {
          if (t >= stops[si][0] && t <= stops[si + 1][0]) {
            const lt = (stops[si + 1][0] === stops[si][0]) ? 0 : (t - stops[si][0]) / (stops[si + 1][0] - stops[si][0]);
            c1 = stops[si][1]; c2 = stops[si + 1][1];
            ctx.fillStyle = 'rgb(' + Math.round(c1[0] + (c2[0] - c1[0]) * lt) + ',' + Math.round(c1[1] + (c2[1] - c1[1]) * lt) + ',' + Math.round(c1[2] + (c2[2] - c1[2]) * lt) + ')';
            break;
          }
        }
        if (t >= stops[stops.length - 1][0]) { const lc = stops[stops.length - 1][1]; ctx.fillStyle = 'rgb(' + lc[0] + ',' + lc[1] + ',' + lc[2] + ')'; }
        ctx.fillRect((gradX + gx) * s, py * s, 1 * s, gradH * s);
      }
      ctx.strokeStyle = '#374151'; ctx.lineWidth = 0.15 * s;
      ctx.strokeRect(gradX * s, py * s, gradW * s, gradH * s);
      py += gradH + 1.5;
      const bmLabels = bmLegend.labels;
      if (bmLabels && bmLabels.length) {
        ctx.fillStyle = '#505050'; ctx.font = '5px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(bmLabels[0], gradX * s, (py + 1) * s);
        ctx.textAlign = 'right';
        ctx.fillText(bmLabels[bmLabels.length - 1], (gradX + gradW) * s, (py + 1) * s);
        if (bmLabels.length > 2) { ctx.textAlign = 'center'; ctx.fillText(bmLabels[Math.floor(bmLabels.length / 2)], (gradX + gradW / 2) * s, (py + 1) * s); }
        py += 4;
      }
      py += 2;
    }

    if (legendItems.length === 0 && !bmLegend) {
      ctx.fillStyle = '#969696'; ctx.font = '6.5px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('Tidak ada layer aktif', (panelX + 4) * s, (py + 3) * s);
    } else if (legendItems.length > 0) {
      const MM_PER_PX = 25.4 / 96;
      legendItems.forEach(it => {
        const isSection = it.kind === 'section';
        const hasImg = it.kind === 'wms' && it.img;
        let imgW, imgH;
        if (hasImg) {
          imgW = it.iw * MM_PER_PX; imgH = it.ih * MM_PER_PX;
          const maxW = panelW - 12, maxH = 16;
          if (imgW > maxW) { imgH *= maxW / imgW; imgW = maxW; }
          if (imgH > maxH) { imgW *= maxH / imgH; imgH = maxH; }
        } else if (it.kind === 'swatch') { imgW = 4; imgH = 2.8; }
        else if (isSection) { imgW = 0; imgH = 0; }
        else { imgW = 6; imgH = 4.4; }
        const txtLines = [it.label];
        const rowH = isSection ? 5 : (txtLines.length * 3 + 1.5 + imgH + 2);
        if (py + rowH > mapFrameY + panelH - 3) return;
        ctx.fillStyle = '#374151'; ctx.font = (isSection ? 'bold ' : '') + '6.5px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        txtLines.forEach(ln => { ctx.fillText(ln, (panelX + 4) * s, (py + 2.5) * s); py += 3; });
        if (isSection) { py += 2; return; }
        py += 1.5;
        if (hasImg) {
          try {
            const li = new Image(); li.src = it.img;
            if (li.complete) ctx.drawImage(li, (panelX + 4) * s, py * s, imgW * s, imgH * s);
          } catch (e) {}
        } else if (it.kind === 'swatch') {
          ctx.fillStyle = it.color || '#64748b';
          ctx.fillRect((panelX + 4) * s, (py + 0.3) * s, imgW * s, (imgH - 0.6) * s);
        } else if (it.kind === 'point') {
          ctx.fillStyle = '#e74c3c'; ctx.beginPath();
          ctx.arc((panelX + 6) * s, (py + 2.2) * s, 1.8 * s, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = '#64748b';
          ctx.beginPath();
          const rx = (panelX + 4) * s, ry = (py + 0.3) * s, rw = 6 * s, rh = (imgH - 0.6) * s, rr = 0.8 * s;
          ctx.moveTo(rx + rr, ry); ctx.lineTo(rx + rw - rr, ry); ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + rr);
          ctx.lineTo(rx + rw, ry + rh - rr); ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - rr, ry + rh);
          ctx.lineTo(rx + rr, ry + rh); ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - rr);
          ctx.lineTo(rx, ry + rr); ctx.quadraticCurveTo(rx, ry, rx + rr, ry);
          ctx.closePath(); ctx.fill();
        }
        py += imgH + 2;
      });
    }
    }

    canvas.style.display = 'block';
    const spinner = document.querySelector('.print-preview-spinner');
    if (spinner) spinner.style.display = 'none';
  }

  /* ── Phase 2b: Generate PDF ── */
  async function generatePDF(data) {
    const btn = document.querySelector('.geoportal-print-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = window.GEOPORTAL_PRINT_SPINNER || '\u23F3'; }
    showPrintLoading();
    try {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const viewBounds = _getPrintViewBounds(data);
      const { latMin, latMax, lonMin, lonMax } = viewBounds;
      const { pageW, pageH, margin,
        mapFrameX, mapFrameY, mapFrameW, mapFrameH,
        panelX, panelW, panelH, mCX, mCY,
        now } = data;

      pdf.setDrawColor(30, 41, 59); pdf.setLineWidth(0.4);
      pdf.rect(margin, margin, pageW - margin * 2, pageH - margin * 2);

      pdf.setDrawColor(55, 65, 81); pdf.setLineWidth(0.3);
      pdf.rect(mapFrameX, mapFrameY, mapFrameW, mapFrameH);

      if (data.mapImg) {
        const view = data.mapView || { scale: 1, dx: 0, dy: 0 };
        if (view.scale > 1 || view.dx || view.dy) {
          const image = new Image();
          await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = data.mapImg; });
          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = image.naturalWidth; cropCanvas.height = image.naturalHeight;
          const cropCtx = cropCanvas.getContext('2d');
          const drawW = cropCanvas.width * view.scale, drawH = cropCanvas.height * view.scale;
          cropCtx.drawImage(image, (cropCanvas.width - drawW) / 2 + view.dx * cropCanvas.width, (cropCanvas.height - drawH) / 2 + view.dy * cropCanvas.height, drawW, drawH);
          pdf.addImage(cropCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', mapFrameX, mapFrameY, mapFrameW, mapFrameH);
        } else pdf.addImage(data.mapImg, 'JPEG', mapFrameX, mapFrameY, mapFrameW, mapFrameH);
      }

      pdf.setDrawColor(55, 65, 81); pdf.setLineWidth(0.3);
      pdf.rect(mapFrameX, mapFrameY, mapFrameW, mapFrameH, 'S');

      const latRange = latMax - latMin, lonRange = lonMax - lonMin;
      const latInterval = _calcInterval(latRange, 6), lonInterval = _calcInterval(lonRange, 8);
      pdf.setDrawColor(180, 180, 180); pdf.setLineWidth(0.15);
      pdf.setFontSize(6); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 80, 80);
      const latStart = Math.ceil(latMin / latInterval) * latInterval;
      for (let lat = latStart; lat <= latMax; lat += latInterval) {
        const ratio = (lat - latMin) / latRange;
        const py = mapFrameY + mapFrameH - ratio * mapFrameH;
        pdf.setLineDashPattern([1.5, 1.5], 0); pdf.line(mapFrameX, py, mapFrameX + mapFrameW, py); pdf.setLineDashPattern([], 0);
        pdf.text(lat.toFixed(latInterval < 0.1 ? 2 : 1) + '\u00B0', mapFrameX - 1, py + 1.5, { align: 'right' });
      }
      const lonStart = Math.ceil(lonMin / lonInterval) * lonInterval;
      for (let lon = lonStart; lon <= lonMax; lon += lonInterval) {
        const ratio = (lon - lonMin) / lonRange;
        const px = mapFrameX + ratio * mapFrameW;
        pdf.setLineDashPattern([1.5, 1.5], 0); pdf.line(px, mapFrameY, px, mapFrameY + mapFrameH); pdf.setLineDashPattern([], 0);
        pdf.text(lon.toFixed(lonInterval < 0.1 ? 2 : 1) + '\u00B0', px, mapFrameY + mapFrameH + 3.5, { align: 'center' });
      }

      _drawRuangKitaWatermarkPdf(pdf, mapFrameX + mapFrameW / 2, mapFrameY + mapFrameH / 2);

      pdf.setDrawColor(200, 200, 200); pdf.setLineWidth(0.2);
      pdf.line(panelX, mapFrameY, panelX, mapFrameY + panelH);
      const headTitle = data.titleText || 'LAYER AKTIF';
      let py = mapFrameY + 5;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(30, 41, 59);
      const titleLines = pdf.splitTextToSize(headTitle, panelW - 8);
      pdf.text(titleLines, panelX + 4, py);
      py += titleLines.length * 4.5;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5); pdf.setTextColor(100, 116, 139);
      const dateFormatted = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
      pdf.text(dateFormatted, panelX + 4, py); py += 3.5;
      pdf.text('Basemap: ' + data.bmFriendly, panelX + 4, py); py += 3.5;
      pdf.setFontSize(6); pdf.setTextColor(150, 150, 150);
      pdf.text('WGS84 / EPSG:4326', panelX + 4, py); py += 3;
      pdf.setDrawColor(200, 200, 200); pdf.setLineWidth(0.2);
      pdf.line(panelX + 4, py, panelX + panelW - 4, py);
      py += 3;

      const sLatMin = latMin;
      const sLatMax = latMax;
      const centerLatS = (sLatMin + sLatMax) / 2;
      const mPerDegS = 111132.92 - 559.82 * Math.cos(2 * centerLatS * Math.PI / 180);
      const mPerPxS = ((sLatMax - sLatMin) * mPerDegS) / mapFrameH;
      const naCX = panelX + panelW / 2, naCY = py + 11, naR = 9;
      pdf.setDrawColor(30, 41, 59); pdf.setLineWidth(0.3);
      if (typeof pdf.circle === 'function') pdf.circle(naCX, naCY, naR);
      pdf.setFillColor(30, 41, 59);
      pdf.triangle(naCX, naCY - naR + 1.5, naCX - 2.8, naCY, naCX + 2.8, naCY, 'F');
      pdf.setDrawColor(148, 163, 184); pdf.setLineWidth(0.3);
      pdf.triangle(naCX, naCY + naR - 1.5, naCX - 2.8, naCY, naCX + 2.8, naCY);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6); pdf.setTextColor(30, 41, 59);
      pdf.text('N', naCX, naCY - naR - 2, { align: 'center' });
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.5); pdf.setTextColor(100, 116, 139);
      pdf.text('UTARA', naCX, naCY + naR + 3, { align: 'center' });

      const sbPixelLen = 44, rawM = sbPixelLen * mPerPxS;
      const tM = Math.pow(10, Math.floor(Math.log10(rawM)));
      const nrm = rawM / tM;
      const niceM = (nrm <= 1.5) ? 1 * tM : (nrm <= 3.5) ? 2 * tM : (nrm <= 7.5) ? 5 * tM : 10 * tM;
      const niceW = niceM / mPerPxS;
      const sbLX = panelX + (panelW - niceW) / 2, sbBY = naCY + naR + 9, sbH = 1.8;
      pdf.setDrawColor(30, 41, 59); pdf.setLineWidth(0.3);
      pdf.line(sbLX, sbBY, sbLX + niceW, sbBY);
      pdf.line(sbLX, sbBY - 1.3, sbLX, sbBY + 1.3);
      pdf.line(sbLX + niceW / 2, sbBY - 1.3, sbLX + niceW / 2, sbBY + 1.3);
      pdf.line(sbLX + niceW, sbBY - 1.3, sbLX + niceW, sbBY + 1.3);
      pdf.setLineWidth(0.2);
      pdf.setFillColor(30, 41, 59); pdf.rect(sbLX, sbBY - sbH / 2, niceW / 2, sbH, 'FD');
      pdf.setFillColor(220, 224, 230); pdf.rect(sbLX + niceW / 2, sbBY - sbH / 2, niceW / 2, sbH, 'FD');
      const sbUnit = niceM >= 1000 ? (niceM / 1000) + ' km' : niceM + ' m';
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.5); pdf.setTextColor(55, 65, 81);
      pdf.text('0', sbLX, sbBY - 2.4, { align: 'center' });
      pdf.text(sbUnit, sbLX + niceW, sbBY - 2.4, { align: 'center' });
      pdf.setTextColor(100, 116, 139);
      pdf.text('SKALA', sbLX, sbBY + 3);
      py = sbBY + 8;

      if (data.showLegend !== false) {
      py += 4;
      pdf.setDrawColor(200, 200, 200); pdf.setLineWidth(0.2);
      pdf.line(panelX + 4, py, panelX + panelW - 4, py);
      py += 5;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.5); pdf.setTextColor(100, 116, 139);
      pdf.text('LEGENDA', panelX + 4, py + 3);
      py += 6;

      if (data.bmLegend) {
        const bmLegend = data.bmLegend;
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.5); pdf.setTextColor(55, 65, 81);
        const bmTitleLines = pdf.splitTextToSize(bmLegend.title + (bmLegend.unit ? ' \u2014 ' + bmLegend.unit : ''), panelW - 10);
        bmTitleLines.forEach(function (ln) { pdf.text(ln, panelX + 4, py + 2.5); py += 3; });
        py += 1.5;
        const gradX = panelX + 4, gradW = panelW - 20, gradH = 4, stops = bmLegend.gradient;
        for (let gx = 0; gx < gradW; gx++) {
          let t = gx / gradW, c1 = stops[0][1], c2 = stops[stops.length - 1][1];
          for (let si = 0; si < stops.length - 1; si++) {
            if (t >= stops[si][0] && t <= stops[si + 1][0]) {
              const lt = (stops[si + 1][0] === stops[si][0]) ? 0 : (t - stops[si][0]) / (stops[si + 1][0] - stops[si][0]);
              c1 = stops[si][1]; c2 = stops[si + 1][1];
              pdf.setFillColor(Math.round(c1[0] + (c2[0] - c1[0]) * lt), Math.round(c1[1] + (c2[1] - c1[1]) * lt), Math.round(c1[2] + (c2[2] - c1[2]) * lt));
              break;
            }
          }
          if (t >= stops[stops.length - 1][0]) { const lc = stops[stops.length - 1][1]; pdf.setFillColor(lc[0], lc[1], lc[2]); }
          pdf.rect(gradX + gx, py, 1, gradH, 'F');
        }
        pdf.setDrawColor(55, 65, 81); pdf.setLineWidth(0.15); pdf.rect(gradX, py, gradW, gradH, 'S');
        py += gradH + 1.5;
        const bmLabels = bmLegend.labels;
        if (bmLabels && bmLabels.length) {
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5); pdf.setTextColor(80, 80, 80);
          pdf.text(bmLabels[0], gradX, py + 1);
          pdf.text(bmLabels[bmLabels.length - 1], gradX + gradW, py + 1, { align: 'right' });
          if (bmLabels.length > 2) pdf.text(bmLabels[Math.floor(bmLabels.length / 2)], gradX + gradW / 2, py + 1, { align: 'center' });
          py += 4;
        }
        py += 2;
      }

      if (data.legendItems.length === 0 && !data.bmLegend) {
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5); pdf.setTextColor(150, 150, 150);
        pdf.text('Tidak ada layer aktif', panelX + 4, py + 3);
      } else if (data.legendItems.length > 0) {
        const MM_PER_PX = 25.4 / 96;
        data.legendItems.forEach(it => {
          const isSection = it.kind === 'section';
          const txtLines = pdf.splitTextToSize(it.label, panelW - 10);
          const hasImg = it.kind === 'wms' && it.img;
          let imgW, imgH;
          if (hasImg) {
            imgW = it.iw * MM_PER_PX; imgH = it.ih * MM_PER_PX;
            const maxW = panelW - 12, maxH = 16;
            if (imgW > maxW) { imgH *= maxW / imgW; imgW = maxW; }
            if (imgH > maxH) { imgW *= maxH / imgH; imgH = maxH; }
          } else if (it.kind === 'swatch') { imgW = 4; imgH = 2.8; }
          else if (isSection) { imgW = 0; imgH = 0; }
          else { imgW = 6; imgH = 4.4; }
          const rowH = isSection ? 5 : (txtLines.length * 3 + 1.5 + imgH + 2);
          if (py + rowH > mapFrameY + panelH - 3) return;
          pdf.setFont('helvetica', isSection ? 'bold' : 'normal'); pdf.setFontSize(6.5); pdf.setTextColor(55, 65, 81);
          txtLines.forEach(ln => { pdf.text(ln, panelX + 4, py + 2.5); py += 3; });
          if (isSection) { py += 2; return; }
          py += 1.5;
          if (hasImg) { try { pdf.addImage(it.img, 'PNG', panelX + 4, py, imgW, imgH); } catch (e) {} }
          else if (it.kind === 'swatch') { const color = _printLegendColor(it.color); pdf.setFillColor(color[0], color[1], color[2]); pdf.rect(panelX + 4, py + 0.3, imgW, imgH - 0.6, 'F'); }
          else if (it.kind === 'point') { pdf.setFillColor(231, 76, 60); pdf.circle(panelX + 6, py + 2.2, 1.8, 'F'); }
          else { pdf.setFillColor(100, 116, 139); pdf.roundedRect(panelX + 4, py + 0.3, 6, imgH - 0.6, 0.8, 0.8, 'F'); }
          py += imgH + 2;
        });
      }
      }

      const dateStr = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`;
      const safeTitle = String(data.titleText || 'peta').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'peta';
      pdf.save(`ruangkita-${safeTitle}-${dateStr}.pdf`);
    } catch (err) {
      console.error('[PrintGeoportal] Gagal membuat PDF:', err);
      showPrintError(err && err.message ? err.message : String(err));
    } finally {
      data.hiddenEls.forEach(h => { if (h.restore) try { h.restore(); } catch (e) {} });
      hidePrintLoading();
      if (btn) { btn.disabled = false; btn.innerHTML = window.GEOPORTAL_PRINT_ICON || '\uD83D\uDCBB'; }
      try { map.invalidateSize(); } catch (e) {}
    }
  }

  // ── Print Area Selection (Auto Rectangle Overlay) ──
  let _printFrame = null;
  let _printVignette = null;
  let _printInstruction = null;
  let _printAreaBtn = null;
  function _removePrintDrawUI() {
    if (_printFrame) { _printFrame.remove(); _printFrame = null; }
    if (_printVignette) { _printVignette.remove(); _printVignette = null; }
    if (_printInstruction) { _printInstruction.remove(); _printInstruction = null; }
    if (_printAreaBtn) { _printAreaBtn.remove(); _printAreaBtn = null; }
  }

  function _showPrintOverlay() {
    // Vignette — dark overlay outside the frame
    const vig = document.createElement('div');
    vig.className = 'print-area-vignette';
    document.body.appendChild(vig);
    _printVignette = vig;

    // Rectangle frame — aspect ratio matches the map frame in the PDF (205:194).
    const frame = document.createElement('div');
    frame.className = 'print-area-frame';
    document.body.appendChild(frame);
    _printFrame = frame;

    // Instruction banner
    const inst = document.createElement('div');
    inst.className = 'print-instruction';
    inst.innerHTML = '<span class="print-instruction-icon">&#9994;</span> Zoom in/out untuk memilih area cetak';
    document.body.appendChild(inst);
    _printInstruction = inst;
  }

  function _showPrintAreaButtons(onPrint) {
    const wrap = document.createElement('div');
    wrap.className = 'print-area-buttons';

    const printBtn = document.createElement('button');
    printBtn.className = 'print-area-btn';
    printBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v4"/><path d="M18 2v4"/><path d="M6 18v4"/><path d="M18 18v4"/><path d="M2 6h4"/><path d="M2 18h4"/><path d="M18 6h4"/><path d="M18 18h4"/></svg> Cetak Peta';
    printBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      onPrint();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'print-area-cancel';
    cancelBtn.textContent = 'Batalkan';
    cancelBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      _removePrintDrawUI();
    });

    wrap.appendChild(printBtn);
    wrap.appendChild(cancelBtn);
    document.body.appendChild(wrap);
    _printAreaBtn = wrap;
  }

  window.printGeoportalMap = function () {
    _removePrintDrawUI();
    _showPrintOverlay();
    _showPrintAreaButtons(function() {
      _removePrintDrawUI();
      _startPrint();
    });

    function onEscape(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onEscape);
        _removePrintDrawUI();
      }
    }
    document.addEventListener('keydown', onEscape);
  };

  async function _startPrint() {
    const btn = document.querySelector('.geoportal-print-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = window.GEOPORTAL_PRINT_SPINNER || '⏳'; }
    showPrintLoading();
    let consumed = false;
    try {
      const prep = preparePrintData();
      prep.then(function (data) {
        if (consumed || !data) return;
        data.hiddenEls.forEach(function (h) { if (h.restore) try { h.restore(); } catch (e) {} });
        try { map.invalidateSize(); } catch (e) {}
      }).catch(function () {});
      let timer = null;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Timeout menyiapkan data cetak (150s)')), 150000);
      });
      const data = await Promise.race([prep, timeout]);
      consumed = true;
      if (timer) clearTimeout(timer);
      hidePrintLoading();
      if (btn) { btn.disabled = false; btn.innerHTML = window.GEOPORTAL_PRINT_ICON || '💻'; }
      renderPreviewCanvas(data);
    } catch (err) {
      consumed = true;
      console.error('[PrintGeoportal] Gagal mempersiapkan data:', err);
      showPrintError(err && err.message ? err.message : String(err));
      hidePrintLoading();
      if (btn) { btn.disabled = false; btn.innerHTML = window.GEOPORTAL_PRINT_ICON || '💻'; }
    }
  }

