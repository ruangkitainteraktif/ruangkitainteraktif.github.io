  // Turunkan URL WFS dari URL WMS (geoserver.jatimprov.go.id/geoserver/wms -> /geoserver/wfs;
  // endpoint /ows langsung bisa dipakai untuk WMS & WFS).
  function wfsUrlFromWmsUrl(wmsUrl) {
    if (/\/ows\/?$/.test(wmsUrl)) return wmsUrl.replace(/\/ows\/?$/, '/wfs');
    return wmsUrl.replace(/\/wms\/?$/, '/wfs');
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

    const detectRes = await fetch(detectUrl);
    if (!detectRes.ok) throw new Error(`WFS HTTP ${detectRes.status}`);
    const detectData = await detectRes.json();
    const geomType = detectData.features?.[0]?.geometry?.type;
    if (geomType !== 'Point' && geomType !== 'MultiPoint') return null;

    const fullUrl = `${wfsUrl}?service=WFS&version=1.1.0&request=GetFeature&typeNames=${encodeURIComponent(resolvedName)}&outputFormat=application/json`;
    const fullRes = await fetch(fullUrl);
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

  // Cek apakah checkbox layer geoportal masih aktif.
  function isGeoportalCheckboxActive(layerName, wmsUrl) {
    // Check jsTree state first
    var tree = $('#geoportalLayerList').jstree(true);
    if (tree) {
      var node = tree.get_node(layerName);
      if (node) return tree.is_checked(node);
    }
    // Fallback to legacy checkbox
    const input = [...document.querySelectorAll('[data-geolayer]')].find(el =>
      el.dataset.geolayer === layerName &&
      (el.dataset.geoserverUrl || GEOPORTAL_WMS_URL) === wmsUrl
    );
    return input ? input.checked : false;
  }

  // Ambil batas (bbox) layer dari WMS GetCapabilities (cache per server).
  const geoportalCapsCache = new Map();
  async function getGeoportalLayerBBox(wmsUrl, layerName) {
    let doc = geoportalCapsCache.get(wmsUrl);
    if (!doc) {
      const res = await fetch(`${wmsUrl}?service=WMS&version=1.1.1&request=GetCapabilities`);
      const text = await res.text();
      doc = new DOMParser().parseFromString(text, 'text/xml');
      geoportalCapsCache.set(wmsUrl, doc);
    }
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

    const layer = L.tileLayer.wms(wmsUrl, {
      layers: resolvedName,
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      tiled: true,
      opacity: .82,
      crossOrigin: true
    });
    layer.on('tileerror', function (e) {
      console.warn('[Geoportal] WMS tile error:', { layerName, resolvedName, wmsUrl, tileUrl: e.tile?.src });
    });
    return layer;
  }

  function toggleGeoportalLayer(layerName, visible, wmsUrl = GEOPORTAL_WMS_URL) {

    const cacheKey = `${wmsUrl}::${layerName}`;
    const layer = geoportalLayers.get(cacheKey);

    if (!layer) {
      // Belum pernah dimuat: buat WMS raster secara synchronus agar popup
      // langsung aktif; di latar belakang coba upgrade ke marker cluster
      // bila layer adalah titik (WFS).
      if (!visible) return;
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

  function buildGeoportalFeatureInfoParams(layerName, latlng, wmsUrl = GEOPORTAL_WMS_URL) {
    const resolvedName = resolveGeoportalLayerName(layerName);
    const bounds = map.getBounds();
    const size = map.getSize();
    const point = map.latLngToContainerPoint(latlng, map.getZoom());
    const projection = map.options?.crs || L.CRS.EPSG3857;
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
    const response = await fetch(`${wmsUrl}?${params.toString()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  }

  async function getGeoportalFeatureInfo(layerName, latlng, wmsUrl = GEOPORTAL_WMS_URL) {
    const params = buildGeoportalFeatureInfoParams(layerName, latlng, wmsUrl);
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

      const coordsEl = document.getElementById('geoportalModalCoords');
      if (coordsEl) coordsEl.innerText = `(${e.latlng.lng.toFixed(5)}, ${e.latlng.lat.toFixed(5)})`;
      openGeoportalModal();
      renderGeoportalLoading();

      if (!activeWMS.length && !activeArcGIS.length) {
        renderGeoportalDetails([]);
        return false;
      }

      const wmsPromises = activeWMS.map(({ layerName, wmsUrl }) => getGeoportalFeatureInfo(layerName, e.latlng, wmsUrl));
      const arcgisPromises = activeArcGIS.map(({ layerKey, url, layers }) =>
        fetchArcGISFeatureInfo(url, layers, e.latlng).then(results => results.map(r => ({ ...r, layerName: `${layerKey} — ${r.layerName}` })))
      );
      const results = await Promise.allSettled([...wmsPromises, ...arcgisPromises]);
      const features = results.filter(result => result.status === 'fulfilled').flatMap(result => result.value);
      renderGeoportalDetails(features);
      const failed = results.filter(result => result.status === 'rejected');
      if (failed.length) console.warn('Sebagian GetFeatureInfo gagal:', failed);
      return true;
    } catch (err) {
      console.error('[Geoportal] handleGeoportalMapClick error:', err);
      openGeoportalModal();
      renderGeoportalDetails([]);
      return false;
    }
  }
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

  function buildSubtreeFolder(layer, wmsUrl, catTitle) {
    const children = (layer.children || []).map(child => {
      GEOPORTAL_LAYER_DATA.push({ id: child.id, label: child.label, category: catTitle, wmsUrl });
      return {
        id: child.id,
        text: child.label,
        li_attr: { 'data-level': '2', 'data-wms-url': wmsUrl }
      };
    });
    return {
      id: layer.id,
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

    const treeData = layersConfig.categories.map(cat => {
      const wmsUrl = layersConfig.sources[cat.source]?.wmsUrl || GEOPORTAL_WMS_URL;
      var totalCount = 0;
      var children;
      if (cat.layers.length && cat.layers[0].type === 'folder') {
        children = cat.layers.map(layer => {
          totalCount += (layer.children || []).length;
          return buildSubtreeFolder(layer, wmsUrl, cat.title);
        });
      } else {
        children = cat.layers.map(layer => {
          GEOPORTAL_LAYER_DATA.push({ id: layer.id, label: layer.label, category: cat.title, wmsUrl });
          return {
            id: layer.id,
            text: layer.label,
            li_attr: { 'data-level': '1', 'data-wms-url': wmsUrl }
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

      if (ARCGIS_SAWAH_CONFIG[node.id]) {
        toggleArcgisSawah(node.id, true);
      } else {
        toggleGeoportalLayer(node.id, true, wmsUrl);
      }
    });

    $(container).on('uncheck_node.jstree', function (e, data) {
      const node = data.node;
      if (node.children && node.children.length) return;
      const wmsUrl = node.li_attr['data-wms-url'] || GEOPORTAL_WMS_URL;

      if (ARCGIS_SAWAH_CONFIG[node.id]) {
        toggleArcgisSawah(node.id, false);
      } else {
        toggleGeoportalLayer(node.id, false, wmsUrl);
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
