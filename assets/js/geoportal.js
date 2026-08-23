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
    const detectUrl = `${wfsUrl}?service=WFS&version=1.1.0&request=GetFeature&typeNames=${encodeURIComponent(resolvedName)}&outputFormat=application/json&count=1`;

    const detectRes = await geoFetch(detectUrl);
    if (!detectRes.ok) throw new Error(`WFS HTTP ${detectRes.status}`);
    const detectData = await detectRes.json();
    const geomType = detectData.features?.[0]?.geometry?.type;
    if (geomType !== 'Point' && geomType !== 'MultiPoint') return null;

    const fullUrl = `${wfsUrl}?service=WFS&version=1.1.0&request=GetFeature&typeNames=${encodeURIComponent(resolvedName)}&outputFormat=application/json`;
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
    layer.on('tileerror', function (e) {
      console.warn('[Geoportal] WMS tile error:', { layerName, resolvedName, wmsUrl, tileUrl: e.tile?.src });
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
  }

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

      if (!activeWMS.length && !activeArcGIS.length) return false;

      const wmsPromises = activeWMS.map(({ layerName, wmsUrl }) => getGeoportalFeatureInfo(layerName, e.latlng, wmsUrl, pickGeoportalCrs(wmsUrl, layerName)));
      const arcgisPromises = activeArcGIS.map(({ layerKey, url, layers }) =>
        fetchArcGISFeatureInfo(url, layers, e.latlng).then(results => results.map(r => ({ ...r, layerName: `${layerKey} — ${r.layerName}` })))
      );
      const results = await Promise.allSettled([...wmsPromises, ...arcgisPromises]);
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
    if (window.currentActiveTab !== 'tab-geoportal') return;
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
  const arcgisSawahLayers = {};

  function toggleArcgisSawah(layerKey, visible) {
    const config = ARCGIS_SAWAH_CONFIG[layerKey];
    if (!config) return;

    if (visible) {
      if (arcgisSawahLayers[layerKey]) { map.addLayer(arcgisSawahLayers[layerKey]); return; }
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
  }

  var GEOPORTAL_LAYER_DATA = [];

  function buildSubtreeFolder(layer, wmsUrl, catTitle, catId) {
    const children = (layer.children || []).map(child => {
      const realName = child.id;
      const nodeId = `${catId}::${layer.id}::${realName}`;
      GEOPORTAL_LAYER_DATA.push({ id: realName, label: child.label, category: catTitle, wmsUrl });
      geoportalNodeIndex.set(`${wmsUrl}::${realName}`, nodeId);
      return {
        id: nodeId,
        text: child.label,
        li_attr: { 'data-level': '2', 'data-wms-url': wmsUrl, 'data-layer-name': realName }
      };
    });
    return {
      id: `${catId}::${layer.id}`,
      text: layer.label,
      children: children,
      state: { opened: false },
      li_attr: { 'data-level': '1' }
    };
  }

  function buildGeoportalTree(layersConfig) {
    const container = document.getElementById('geoportalLayerList');
    if (!container) return;

    GEOPORTAL_LAYER_DATA = [];
    geoportalNodeIndex.clear();

    const treeData = layersConfig.categories.map(cat => {
      const wmsUrl = layersConfig.sources[cat.source]?.wmsUrl || GEOPORTAL_WMS_URL;
      var totalCount = 0;
      var children;
      if (cat.layers.length && cat.layers[0].type === 'folder') {
        children = cat.layers.map(layer => {
          totalCount += (layer.children || []).length;
          return buildSubtreeFolder(layer, wmsUrl, cat.title, cat.id);
        });
      } else {
        children = cat.layers.map(layer => {
          if (layer.type === 'arcgis') {
            // Layer ArcGIS REST: id sudah unik, tidak diprefix.
            GEOPORTAL_LAYER_DATA.push({ id: layer.id, label: layer.label, category: cat.title, wmsUrl });
            return {
              id: layer.id,
              text: layer.label,
              li_attr: { 'data-level': '1', 'data-wms-url': wmsUrl }
            };
          }
          const realName = layer.id;
          const nodeId = `${cat.id}::${realName}`;
          GEOPORTAL_LAYER_DATA.push({ id: realName, label: layer.label, category: cat.title, wmsUrl });
          geoportalNodeIndex.set(`${wmsUrl}::${realName}`, nodeId);
          return {
            id: nodeId,
            text: layer.label,
            li_attr: { 'data-level': '1', 'data-wms-url': wmsUrl, 'data-layer-name': realName }
          };
        });
        totalCount = children.length;
      }
      return {
        id: cat.id,
        text: cat.title + ' <span class="layer-count-badge">' + totalCount + '</span>',
        children: children,
        state: { opened: false },
        li_attr: { 'data-level': '0' }
      };
    });

    if (window.__geoportalTreeReady) {
      try { $(container).jstree('destroy'); } catch (e) {}
    }

    $(container).jstree({
      core: {
        data: treeData,
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

    window.__geoportalTreeReady = true;

    $(container).on('check_node.jstree', function (e, data) {
      const node = data.node;
      if (node.children && node.children.length) return;
      const wmsUrl = node.li_attr['data-wms-url'] || GEOPORTAL_WMS_URL;
      const layerName = node.li_attr['data-layer-name'] || node.id;

      if (ARCGIS_SAWAH_CONFIG[node.id]) {
        toggleArcgisSawah(node.id, true);
      } else {
        toggleGeoportalLayer(layerName, true, wmsUrl);
      }
    });

    $(container).on('uncheck_node.jstree', function (e, data) {
      const node = data.node;
      if (node.children && node.children.length) return;
      const wmsUrl = node.li_attr['data-wms-url'] || GEOPORTAL_WMS_URL;
      const layerName = node.li_attr['data-layer-name'] || node.id;

      if (ARCGIS_SAWAH_CONFIG[node.id]) {
        toggleArcgisSawah(node.id, false);
      } else {
        toggleGeoportalLayer(layerName, false, wmsUrl);
      }
    });
  }

  fetch('assets/data/geoportal-layers.json')
    .then(r => r.json())
    .then(cfg => {
      window.__geoportalLayersConfig = cfg;
      buildGeoportalTree(cfg);
      Object.values(cfg.sources).forEach(s => loadGeoportalCaps(s.wmsUrl).catch(() => {}));
    })
    .catch(err => console.error('[Geoportal] Gagal memuat geoportal-layers.json:', err));

  function showPrintLoading() {
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
      txt.textContent = 'Sedang memproses cetak peta…';
      box.appendChild(spin);
      box.appendChild(txt);
      el.appendChild(box);
      document.body.appendChild(el);
    }
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

  window.printGeoportalMap = async function () {
    const btn = document.querySelector('.geoportal-print-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = window.GEOPORTAL_PRINT_SPINNER || '⏳'; }
    showPrintLoading();

    const hiddenEls = [];

    try {
      map.closePopup();

      const arcgisLabels = {
        'arcgis-sawah-2023': 'Sawah 2023 (Kementan)',
        'arcgis-sawah-2019': 'LBS 2019 (Kementan)',
        'arcgis-kawasan-padi': 'Kawasan Padi (Kementan)',
        'arcgis-kawasan-jagung': 'Kawasan Jagung (Kementan)',
        'arcgis-kawasan-kedelai': 'Kawasan Kedelai (Kementan)'
      };

      const labelMap = {};
      const categoryMap = {};
      if (typeof GEOPORTAL_LAYER_DATA !== 'undefined' && Array.isArray(GEOPORTAL_LAYER_DATA)) {
        GEOPORTAL_LAYER_DATA.forEach(d => {
          if (d && d.id) {
            if (!labelMap[d.id]) labelMap[d.id] = d.label || d.id;
            if (!categoryMap[d.id] && d.category) categoryMap[d.id] = d.category;
          }
        });
      }
      function dispName(layerName) {
        const lbl = labelMap[layerName] || layerName;
        const cat = categoryMap[layerName] || '';
        return cat ? cat + ' — ' + lbl : lbl;
      }

      const titleNames = [];
      getActiveGeoportalLayers().forEach(a => titleNames.push(dispName(a.layerName)));
      getActiveArcgisLayers().forEach(a => titleNames.push(arcgisLabels[a.layerKey] || a.layerKey));
      let titleText;
      if (titleNames.length === 0) titleText = 'Peta Geoportal';
      else if (titleNames.length === 1) titleText = titleNames[0];
      else titleText = titleNames.slice(0, 3).join(', ') + (titleNames.length > 3 ? ` (+${titleNames.length - 3})` : '');

      const sidebar = document.getElementById('sidebar-left');
      if (sidebar && !sidebar.classList.contains('collapsed')) {
        sidebar.classList.add('collapsed');
        hiddenEls.push({ restore: () => sidebar.classList.remove('collapsed') });
      }

      const overlays = document.querySelectorAll('.unified-search, .map-insight-cards, .leaflet-control-zoom, .leaflet-control-locate, .reset-layers-btn, .geoportal-print-btn, .basemap-btn, .basemap-control-wrap, .leaflet-control-scale, .detail-panel-btn, #detail-panel');
      overlays.forEach(el => {
        if (el && getComputedStyle(el).display !== 'none') {
          const prev = el.style.display;
          el.style.setProperty('display', 'none', 'important');
          hiddenEls.push({ restore: () => { el.style.display = prev; } });
        }
      });

      const prevBasemap = (typeof currentBasemapName !== 'undefined') ? currentBasemapName : null;
      if (typeof setBaseMap === 'function' && prevBasemap !== 'esri-satellite') {
        setBaseMap('esri-satellite');
      }

      if (typeof getGeoportalLayerBBox === 'function') {
        let minLat = 90, minLng = 180, maxLat = -90, maxLng = -180, found = false;
        const gpLayers = getActiveGeoportalLayers();
        for (const a of gpLayers) {
          try {
            const bbox = await getGeoportalLayerBBox(a.wmsUrl, a.layerName);
            if (bbox) {
              minLat = Math.min(minLat, bbox.south); minLng = Math.min(minLng, bbox.west);
              maxLat = Math.max(maxLat, bbox.north); maxLng = Math.max(maxLng, bbox.east);
              found = true;
            }
          } catch (e) { /* abaikan */ }
        }
        const agLayers = getActiveArcgisLayers();
        for (const a of agLayers) {
          const lyr = arcgisSawahLayers[a.layerKey];
          if (lyr && typeof lyr.getBounds === 'function') {
            const b = lyr.getBounds();
            if (b && b.isValid()) {
              const sw = b.getSouthWest(), ne = b.getNorthEast();
              minLat = Math.min(minLat, sw.lat); minLng = Math.min(minLng, sw.lng);
              maxLat = Math.max(maxLat, ne.lat); maxLng = Math.max(maxLng, ne.lng);
              found = true;
            }
          }
        }
        if (found) {
          map.fitBounds([[minLat, minLng], [maxLat, maxLng]], { maxZoom: 16, padding: [20, 20], duration: 0 });
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      map.invalidateSize();
      await new Promise(r => setTimeout(r, 400));

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = 297, pageH = 210, margin = 8;
      const titleH = 14, bottomStripH = 14;
      const mapFrameX = margin;
      const mapFrameY = margin + titleH + 2;
      const mapFrameW = 185;
      const mapFrameH = pageH - margin * 2 - titleH - 2 - bottomStripH;
      const panelX = mapFrameX + mapFrameW + 4;
      const panelW = pageW - panelX - margin;
      const panelH = mapFrameH;

      pdf.setDrawColor(30, 41, 59);
      pdf.setLineWidth(0.4);
      pdf.rect(margin, margin, pageW - margin * 2, pageH - margin * 2);

      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.line(margin, margin + titleH, pageW - margin, margin + titleH);

      const now = new Date();
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.setTextColor(30, 41, 59);
      pdf.text(titleText, margin + 2, margin + titleH / 2, { baseline: 'middle' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(100, 116, 139);
      const dateFormatted = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
      pdf.text(dateFormatted, pageW - margin - 2, margin + 5, { align: 'right' });
      const bmName = (typeof currentBasemapName !== 'undefined' && currentBasemapName) ? currentBasemapName : '-';
      pdf.text('Basemap: ' + bmName, pageW - margin - 2, margin + 9, { align: 'right' });
      pdf.setFontSize(7);
      pdf.setTextColor(150, 150, 150);
      pdf.text('WGS84 / EPSG:4326', pageW - margin - 2, margin + 12, { align: 'right' });

      pdf.setDrawColor(55, 65, 81);
      pdf.setLineWidth(0.3);
      pdf.rect(mapFrameX, mapFrameY, mapFrameW, mapFrameH);

      let mCX = mapFrameX + mapFrameW / 2, mCY = mapFrameY + mapFrameH / 2;
      let effLonMin = null, effLonMax = null, effLatMin = null, effLatMax = null;
      try {
        const leafletContainer = document.querySelector('.leaflet-container');
        if (leafletContainer) {
          map.invalidateSize();
          await new Promise(r => setTimeout(r, 200));
          const mapCanvas = await html2canvas(leafletContainer, { useCORS: true, allowTaint: true, scale: 2, logging: false, backgroundColor: '#e8e8e8' });

          const canvasAspect = mapCanvas.width / mapCanvas.height;
          const frameAspect = mapFrameW / mapFrameH;
          let cropX, cropY, cropW, cropH;
          if (canvasAspect > frameAspect) {
            cropH = mapCanvas.height;
            cropW = cropH * frameAspect;
            cropX = (mapCanvas.width - cropW) / 2;
            cropY = 0;
          } else {
            cropW = mapCanvas.width;
            cropH = cropW / frameAspect;
            cropX = 0;
            cropY = (mapCanvas.height - cropH) / 2;
          }
          const c = document.createElement('canvas');
          c.width = Math.round(cropW);
          c.height = Math.round(cropH);
          c.getContext('2d').drawImage(mapCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
          const mapImg = c.toDataURL('image/jpeg', 0.92);
          pdf.addImage(mapImg, 'JPEG', mapFrameX, mapFrameY, mapFrameW, mapFrameH);
          mCX = mapFrameX + mapFrameW / 2;
          mCY = mapFrameY + mapFrameH / 2;

          const vb = map.getBounds();
          const lonMin = vb.getWest(), lonMax = vb.getEast();
          const latMin = vb.getSouth(), latMax = vb.getNorth();
          const fx = cropW / mapCanvas.width, fy = cropH / mapCanvas.height;
          effLonMin = lonMin + (lonMax - lonMin) * (0.5 - fx / 2);
          effLonMax = lonMin + (lonMax - lonMin) * (0.5 + fx / 2);
          effLatMax = latMax - (latMax - latMin) * (0.5 - fy / 2);
          effLatMin = latMax - (latMax - latMin) * (0.5 + fy / 2);
        }
      } catch (e) {
        console.warn('[PrintGeoportal] Gagal menangkap peta (layer tanpa CORS?):', e);
      }

      pdf.setDrawColor(55, 65, 81);
      pdf.setLineWidth(0.3);
      pdf.rect(mapFrameX, mapFrameY, mapFrameW, mapFrameH, 'S');

      try {
        pdf.saveGraphicsState();
        if (typeof pdf.GState === 'function') {
          pdf.setGState(new pdf.GState({ opacity: 0.6 }));
          pdf.setTextColor(255, 255, 255);
        } else {
          pdf.setTextColor(255, 255, 255);
        }
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(28);
        pdf.text('PREVIEW', mCX, mCY - 9, { align: 'center', baseline: 'middle' });
        pdf.setFontSize(22);
        pdf.text('RUANGKITA PRO', mCX, mCY + 1, { align: 'center', baseline: 'middle' });
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.text('ruangkita.net', mCX, mCY + 11, { align: 'center', baseline: 'middle' });
        pdf.restoreGraphicsState();
      } catch (e) {
        console.warn('[PrintGeoportal] Watermark gagal:', e);
      }

      const mapBounds = map.getBounds();
      const latMin = (effLatMin != null) ? effLatMin : mapBounds.getSouth();
      const latMax = (effLatMax != null) ? effLatMax : mapBounds.getNorth();
      const lonMin = (effLonMin != null) ? effLonMin : mapBounds.getWest();
      const lonMax = (effLonMax != null) ? effLonMax : mapBounds.getEast();

      function calcInterval(range, targetLines) {
        const raw = range / targetLines;
        const mag = Math.pow(10, Math.floor(Math.log10(raw)));
        const norm = raw / mag;
        if (norm <= 1.5) return mag;
        if (norm <= 3.5) return 2 * mag;
        if (norm <= 7.5) return 5 * mag;
        return 10 * mag;
      }

      const latRange = latMax - latMin, lonRange = lonMax - lonMin;
      const latInterval = calcInterval(latRange, 6), lonInterval = calcInterval(lonRange, 8);
      pdf.setDrawColor(180, 180, 180);
      pdf.setLineWidth(0.15);
      pdf.setFontSize(6);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(80, 80, 80);

      const latStart = Math.ceil(latMin / latInterval) * latInterval;
      for (let lat = latStart; lat <= latMax; lat += latInterval) {
        const ratio = (lat - latMin) / latRange;
        const py = mapFrameY + mapFrameH - ratio * mapFrameH;
        pdf.setLineDashPattern([1.5, 1.5], 0);
        pdf.line(mapFrameX, py, mapFrameX + mapFrameW, py);
        pdf.setLineDashPattern([], 0);
        const label = lat.toFixed(latInterval < 0.1 ? 2 : 1) + '°';
        pdf.text(label, mapFrameX - 1, py + 1.5, { align: 'right' });
      }

      const lonStart = Math.ceil(lonMin / lonInterval) * lonInterval;
      for (let lon = lonStart; lon <= lonMax; lon += lonInterval) {
        const ratio = (lon - lonMin) / lonRange;
        const px = mapFrameX + ratio * mapFrameW;
        pdf.setLineDashPattern([1.5, 1.5], 0);
        pdf.line(px, mapFrameY, px, mapFrameY + mapFrameH);
        pdf.setLineDashPattern([], 0);
        const label = lon.toFixed(lonInterval < 0.1 ? 2 : 1) + '°';
        pdf.text(label, px, mapFrameY + mapFrameH + 3.5, { align: 'center' });
      }

      // Skala & Arah Utara dipindah ke kolom LAYER AKTIF (gaya modern ArcGIS Pro).

      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.line(panelX, mapFrameY, panelX, mapFrameY + panelH);
      const activeNames = [];
      getActiveGeoportalLayers().forEach(a => { activeNames.push(dispName(a.layerName)); });
      getActiveArcgisLayers().forEach(a => { activeNames.push(arcgisLabels[a.layerKey] || a.layerKey); });
      const headTitle = activeNames.length ? activeNames.join(' / ') : 'LAYER AKTIF';
      let py = mapFrameY + 4;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(30, 41, 59);
      pdf.text(headTitle, panelX + 4, py, { maxWidth: panelW - 8 });
      py += 6;
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.line(panelX + 4, py, panelX + panelW - 4, py);
      py += 4;

      // --- Arah Utara & Skala (atas kolom, gaya modern ArcGIS Pro) ---
      const sLatMin = (effLatMin != null) ? effLatMin : latMin;
      const sLatMax = (effLatMax != null) ? effLatMax : latMax;
      const centerLatS = (sLatMin + sLatMax) / 2;
      const mPerDegS = 111132.92 - 559.82 * Math.cos(2 * centerLatS * Math.PI / 180);
      const mPerPxS = ((sLatMax - sLatMin) * mPerDegS) / mapFrameH;

      const naCX = panelX + panelW / 2, naCY = py + 11, naR = 9;
      pdf.setDrawColor(30, 41, 59);
      pdf.setLineWidth(0.3);
      if (typeof pdf.circle === 'function') pdf.circle(naCX, naCY, naR);
      pdf.setFillColor(30, 41, 59);
      pdf.triangle(naCX, naCY - naR + 1.5, naCX - 2.8, naCY, naCX + 2.8, naCY, 'F');
      pdf.setDrawColor(148, 163, 184);
      pdf.setLineWidth(0.3);
      pdf.triangle(naCX, naCY + naR - 1.5, naCX - 2.8, naCY, naCX + 2.8, naCY);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6);
      pdf.setTextColor(30, 41, 59);
      pdf.text('N', naCX, naCY - naR - 2, { align: 'center' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(5.5);
      pdf.setTextColor(100, 116, 139);
      pdf.text('UTARA', naCX, naCY + naR + 3, { align: 'center' });

      const sbPixelLen = 44;
      const rawM = sbPixelLen * mPerPxS;
      const tM = Math.pow(10, Math.floor(Math.log10(rawM)));
      const nrm = rawM / tM;
      const niceM = (nrm <= 1.5) ? 1 * tM : (nrm <= 3.5) ? 2 * tM : (nrm <= 7.5) ? 5 * tM : 10 * tM;
      const niceW = niceM / mPerPxS;
      const sbLX = panelX + (panelW - niceW) / 2;
      const sbBY = naCY + naR + 9;
      pdf.setDrawColor(30, 41, 59);
      pdf.setLineWidth(0.3);
      pdf.line(sbLX, sbBY, sbLX + niceW, sbBY);
      pdf.line(sbLX, sbBY - 1.3, sbLX, sbBY + 1.3);
      pdf.line(sbLX + niceW / 2, sbBY - 1.3, sbLX + niceW / 2, sbBY + 1.3);
      pdf.line(sbLX + niceW, sbBY - 1.3, sbLX + niceW, sbBY + 1.3);
      const sbH = 1.8;
      pdf.setDrawColor(30, 41, 59);
      pdf.setLineWidth(0.2);
      pdf.setFillColor(30, 41, 59);
      pdf.rect(sbLX, sbBY - sbH / 2, niceW / 2, sbH, 'FD');
      pdf.setFillColor(220, 224, 230);
      pdf.rect(sbLX + niceW / 2, sbBY - sbH / 2, niceW / 2, sbH, 'FD');
      const sbUnit = niceM >= 1000 ? (niceM / 1000) + ' km' : niceM + ' m';
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(5.5);
      pdf.setTextColor(55, 65, 81);
      pdf.text('0', sbLX, sbBY - 2.4, { align: 'center' });
      pdf.text(sbUnit, sbLX + niceW, sbBY - 2.4, { align: 'center' });
      pdf.setFontSize(5.5);
      pdf.setTextColor(100, 116, 139);
      pdf.text('SKALA', sbLX, sbBY + 3);

      py = sbBY + 8;

      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(55, 65, 81);
      if (activeNames.length === 0) {
        pdf.setTextColor(150, 150, 150);
        pdf.text('Tidak ada layer aktif', panelX + 4, py + 3);
      } else {
        activeNames.forEach(nm => {
          if (nm === headTitle) return;
          if (py > mapFrameY + panelH - 4) return;
          const txt = '• ' + nm;
          const lines = pdf.splitTextToSize(txt, panelW - 8);
          lines.forEach(ln => { pdf.text(ln, panelX + 4, py + 3); py += 4; });
          py += 1;
        });
      }

      const dateStr = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`;
      pdf.save(`Peta_Geoportal_${dateStr}.pdf`);
    } catch (err) {
      console.error('[PrintGeoportal] Gagal membuat PDF:', err);
      showPrintError(err && err.message ? err.message : String(err));
    } finally {
      hidePrintLoading();
      if (btn) { btn.disabled = false; btn.innerHTML = window.GEOPORTAL_PRINT_ICON || '🖨'; }
      try {
        hiddenEls.forEach(h => { if (h.restore) { try { h.restore(); } catch (e) {} } });
      } catch (e) {}
      try {
        if (prevBasemap && prevBasemap.indexOf('google') === 0 && typeof setBaseMap === 'function') {
          setBaseMap(prevBasemap);
        }
      } catch (e) {}
      try { map.invalidateSize(); } catch (e) {}
    }
  };
