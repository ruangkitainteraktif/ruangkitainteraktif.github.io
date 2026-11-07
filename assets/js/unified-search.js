  let unifiedSearchTimer;

  function unifiedNormalize(value) {
    return normalizeWeatherSearch(value);
  }

  function unifiedStripPrefix(query) {
    var levelFilter = null;
    var wantKota = false;
    var m = query.match(/^(provinsi|kabupaten|kota|kecamatan|desa|kelurahan)\s+/);
    if (m) {
      var p = m[1];
      if (p === 'provinsi') levelFilter = 'provinsi';
      else if (p === 'kabupaten') levelFilter = 'kabkot';
      else if (p === 'kota') { levelFilter = 'kabkot'; wantKota = true; }
      else if (p === 'kecamatan') levelFilter = 'kecamatan';
      else levelFilter = 'desa';
      query = query.slice(m[0].length);
    }
    return { query: query, levelFilter: levelFilter, wantKota: wantKota };
  }

  function unifiedTokens(query) {
    return query.replace(/[(),.]/g, ' ').split(/\s+/).filter(function (t) { return t.length >= 2; });
  }

  function unifiedMatch(searchText, query, tokens) {
    if (searchText.includes(query)) return true;
    if (/^\d{2}(?:\.\d{2}){0,2}(?:\.\d{4})?$/.test(query)) return false;
    if (tokens.length >= 2) {
      return tokens.every(function (t) { return searchText.includes(t); });
    }
    return false;
  }

  function searchUnifiedDesa(query, tokens) {
    if (!weatherSearchLocations || !weatherSearchLocations.length) return [];
    const results = [];
    for (const loc of weatherSearchLocations) {
      if (unifiedMatch(loc.searchText, query, tokens)) {
        results.push({
          type: 'desa',
          name: loc.desa,
          kecamatan: loc.kecamatan,
          kabkot: loc.kabkota,
          provinsi: loc.provinsi,
          kode: loc.kode
        });
        if (results.length >= 5) break;
      }
    }
    return results;
  }

  function searchUnifiedProvinsi(query, tokens) {
    if (!provinsiSearchIndex || !provinsiSearchIndex.length) return [];
    const results = [];
    for (const item of provinsiSearchIndex) {
      if (unifiedMatch(item.searchText, query, tokens)) {
        results.push({
          type: 'provinsi',
          name: item.name,
          provinsi: item.name,
          kode: item.kode
        });
        if (results.length >= 5) break;
      }
    }
    return results;
  }

  function searchUnifiedKabkot(query, tokens, wantKota) {
    if (!kabkotaSearchIndex || !kabkotaSearchIndex.length) return [];
    const results = [];
    for (const item of kabkotaSearchIndex) {
      if (unifiedMatch(item.searchText, query, tokens)) {
        results.push({
          type: 'kabkot',
          name: item.name,
          provinsi: item.provinsi,
          kode: item.kode,
          _isKota: String(item.name).toLowerCase().indexOf('kota ') === 0
        });
        if (results.length >= 10) break;
      }
    }
    if (wantKota) {
      results.sort(function (a, b) { return (b._isKota ? 1 : 0) - (a._isKota ? 1 : 0); });
    }
    return results.slice(0, 5).map(function (r) {
      return { type: r.type, name: r.name, provinsi: r.provinsi, kode: r.kode };
    });
  }

  function searchUnifiedKecamatan(query, tokens) {
    if (!kecamatanSearchIndex || !kecamatanSearchIndex.length) return [];
    const results = [];
    for (const item of kecamatanSearchIndex) {
      if (unifiedMatch(item.searchText, query, tokens)) {
        results.push({
          type: 'kecamatan',
          name: item.name,
          kabkot: item.kabkot,
          provinsi: item.provinsi,
          kode: item.kode
        });
        if (results.length >= 5) break;
      }
    }
    return results;
  }

  function searchUnifiedCctv(query) {
    if (!cctvData || !cctvData.length) return [];
    const results = [];
    for (const item of cctvData) {
      if (item.searchText.includes(query)) {
        results.push({
          type: 'cctv',
          name: item.name,
          area: item.area,
          id: item.id,
          lat: item.lat,
          lon: item.lon
        });
        if (results.length >= 5) break;
      }
    }
    return results;
  }

  /* Search index sources are the same metadata used by GeoPortal Hub and
     Katalog Peta. Layer results are capped for a readable dropdown, while
     the full source is scanned for every query. */
  let geoportalConfigPromise = null;
  function getGeoportalConfig() {
    if (window.__geoportalLayersConfig) return Promise.resolve(window.__geoportalLayersConfig);
    if (!geoportalConfigPromise) {
      geoportalConfigPromise = fetch('assets/data/geoportal-layers.json')
        .then(function (response) { if (!response.ok) throw new Error('HTTP ' + response.status); return response.json(); })
        .then(function (config) { window.__geoportalLayersConfig = config; return config; })
        .catch(function (error) { geoportalConfigPromise = null; throw error; });
    }
    return geoportalConfigPromise;
  }

  function searchGeoportalHubLayers(query, tokens, config) {
    if (!config || !Array.isArray(config.categories)) return [];
    const sources = config.sources || {};
    const matches = [];
    function addLayer(layer, category, wmsUrl, folder) {
      if (!layer) return;
      if (layer.type === 'folder' || Array.isArray(layer.children)) {
        (layer.children || []).forEach(function (child) { addLayer(child, category, wmsUrl, layer.label || layer.id); });
        return;
      }
      const name = layer.label || layer.id || '';
      if (!layer.id || !wmsUrl) return;
      const context = [name, layer.id, category, folder].filter(Boolean).join(' ');
      const searchText = unifiedNormalize(context);
      if (!name || !unifiedMatch(searchText, query, tokens)) return;
      matches.push({
        type: 'geoportal-layer', name: name, layerName: layer.id,
        wmsUrl: wmsUrl, category: folder ? category + ' · ' + folder : category,
        layerType: layer.type || 'wms'
      });
    }
    config.categories.forEach(function (category) {
      const source = sources[category.source] || {};
      const wmsUrl = source.wmsUrl || config.wmsUrl || '';
      (category.layers || []).forEach(function (layer) { addLayer(layer, category.title || category.label || category.id, wmsUrl, ''); });
    });
    return rankLayerResults(matches, query).slice(0, 8);
  }

  function searchMapCatalogLayers(query, tokens, categories) {
    if (!Array.isArray(categories)) return [];
    const matches = [], seen = Object.create(null);
    function addLayer(layer, category, group) {
      if (!layer || layer.hidden || !layer.id || !layer.label || seen[layer.id]) return;
      const searchText = unifiedNormalize([layer.label, layer.id, category, group].filter(Boolean).join(' '));
      if (!unifiedMatch(searchText, query, tokens)) return;
      seen[layer.id] = true;
      matches.push({ type: 'map-catalog-layer', name: layer.label, layerId: layer.id,
        category: group ? category + ' · ' + group : category });
    }
    function visitLayers(layers, category, group) {
      (layers || []).forEach(function (layer) {
        if (!layer || layer.hidden) return;
        if (Array.isArray(layer.children)) visitLayers(layer.children, category, group ? group + ' · ' + (layer.label || layer.id || '') : (layer.label || layer.id || ''));
        else addLayer(layer, category, group);
      });
    }
    function visitCategory(category) {
      if (!category || category.hidden || category.type === 'basemap') return;
      const title = category.cat || category.title || category.label || 'Katalog Peta';
      visitLayers(category.layers, title, '');
      (category.subcats || []).forEach(function (subcat) {
        visitLayers(subcat.layers, title, subcat.subcat || subcat.title || '');
      });
      (category.groups || []).forEach(function (group) {
        visitLayers(group.layers, title, group.group || group.title || '');
      });
    }
    categories.forEach(visitCategory);
    return rankLayerResults(matches, query).slice(0, 8);
  }

  function rankLayerResults(items, query) {
    const q = unifiedNormalize(query);
    return items.sort(function (a, b) {
      const an = unifiedNormalize(a.name), bn = unifiedNormalize(b.name);
      const ar = an === q ? 0 : an.indexOf(q) === 0 ? 1 : 2;
      const br = bn === q ? 0 : bn.indexOf(q) === 0 ? 1 : 2;
      return ar - br || an.localeCompare(bn);
    });
  }

  async function searchAllLayerCatalogs(query, tokens) {
    const dynamicReady = typeof window.ensureDynamicCatalogLoaded === 'function'
      ? Promise.resolve().then(function () { return window.ensureDynamicCatalogLoaded(); }).catch(function () {})
      : Promise.resolve();
    const hubReady = getGeoportalConfig().catch(function () { return window.__geoportalLayersConfig || null; });
    const settled = await Promise.all([dynamicReady, hubReady]);
    const catalogData = typeof window.getLayerCatalogData === 'function' ? window.getLayerCatalogData() : [];
    return {
      geoportal: searchGeoportalHubLayers(query, tokens, settled[1]),
      catalog: searchMapCatalogLayers(query, tokens, catalogData)
    };
  }

  function runUnifiedSearch(rawQuery) {
    var stripped = unifiedStripPrefix(rawQuery);
    var query = stripped.query;
    var levelFilter = stripped.levelFilter;
    var wantKota = stripped.wantKota;
    var tokens = unifiedTokens(query);
    var provResults = levelFilter && levelFilter !== 'provinsi' ? [] : searchUnifiedProvinsi(query, tokens);
    var kabkotResults = levelFilter && levelFilter !== 'kabkot' ? [] : searchUnifiedKabkot(query, tokens, wantKota);
    var kecResults = levelFilter && levelFilter !== 'kecamatan' ? [] : searchUnifiedKecamatan(query, tokens);
    var desaResults = levelFilter && levelFilter !== 'desa' ? [] : searchUnifiedDesa(query, tokens);
    var cctvResults = levelFilter ? [] : searchUnifiedCctv(query);
    return [...provResults, ...kabkotResults, ...kecResults, ...desaResults, ...cctvResults];
  }

  let unifiedSearchSequence = 0;
  async function performUnifiedSearch(query) {
    const sequence = ++unifiedSearchSequence;
    const stripped = unifiedStripPrefix(query);
    const baseItems = runUnifiedSearch(query);
    renderUnifiedResults(baseItems, !stripped.levelFilter && stripped.query.length >= 2);
    if (stripped.levelFilter || stripped.query.length < 2) return;
    try {
      const layerItems = await searchAllLayerCatalogs(stripped.query, unifiedTokens(stripped.query));
      const input = document.getElementById('unifiedSearchInput');
      if (sequence !== unifiedSearchSequence || !input || unifiedNormalize(input.value.trim()) !== query) return;
      renderUnifiedResults(baseItems.concat(layerItems.geoportal, layerItems.catalog));
    } catch (error) {
      console.warn('[UnifiedSearch] Gagal mencari katalog layer:', error);
    }
  }

  function renderUnifiedResults(items, searchingLayers) {
    const container = document.getElementById('unifiedSearchResults');
    const clearBtn = document.getElementById('unifiedSearchClear');

    if (!items.length) {
      container.innerHTML = '<div class="unified-ac-empty">' + (searchingLayers
        ? 'Mencari layer di GeoPortal Hub dan Katalog Peta…'
        : 'Tidak ditemukan') + '</div>';
      container.style.display = 'block';
      clearBtn.style.display = 'flex';
      return;
    }

    const provItems = items.filter(i => i.type === 'provinsi');
    const kabkotItems = items.filter(i => i.type === 'kabkot');
    const kecItems = items.filter(i => i.type === 'kecamatan');
    const desaItems = items.filter(i => i.type === 'desa');
    const cctvItems = items.filter(i => i.type === 'cctv');
    const hubLayerItems = items.filter(i => i.type === 'geoportal-layer');
    const catalogLayerItems = items.filter(i => i.type === 'map-catalog-layer');
    let html = '';

    const groupConfig = [
      { items: provItems, label: 'Provinsi', icon: '🗺️' },
      { items: kabkotItems, label: 'Kabupaten / Kota', icon: '🏙️' },
      { items: kecItems, label: 'Kecamatan', icon: '🏘️' },
      { items: desaItems, label: 'Desa / Kelurahan', icon: '📍' },
      { items: cctvItems, label: 'CCTV', icon: '🎥' }
    ];

    groupConfig.push({ items: hubLayerItems, label: 'GeoPortal Hub', icon: 'G' });
    groupConfig.push({ items: catalogLayerItems, label: 'Katalog Peta', icon: 'K' });
    const visibleItems = [];
    for (const group of groupConfig) {
      if (!group.items.length) continue;
      html += `<div class="unified-ac-group"><span class="unified-ac-label">${group.label}</span>`;
      group.items.forEach(item => {
        let detail = '';
        if (item.type === 'provinsi') {
          detail = `<small style="color:#999;font-size:10px">Kode: ${escapeGeoidHtml(item.kode)}</small>`;
        } else if (item.type === 'kabkot') {
          detail = `<small>${escapeGeoidHtml(item.provinsi)}</small><small style="color:#999;font-size:10px">Kode: ${escapeGeoidHtml(item.kode)}</small>`;
        } else if (item.type === 'kecamatan') {
          detail = `<small>${escapeGeoidHtml(item.kabkot)}, ${escapeGeoidHtml(item.provinsi)}</small><small style="color:#999;font-size:10px">Kode: ${escapeGeoidHtml(item.kode)}</small>`;
        } else if (item.type === 'desa') {
          detail = `<small>${escapeGeoidHtml(item.kecamatan)}, ${escapeGeoidHtml(item.kabkot)}, ${escapeGeoidHtml(item.provinsi)}</small><small style="color:#999;font-size:10px">${escapeGeoidHtml(item.kode)}</small>`;
        } else if (item.type === 'cctv') {
          detail = `<small>${escapeGeoidHtml(item.area)}</small>`;
        } else if (item.type === 'geoportal-layer' || item.type === 'map-catalog-layer') {
          detail = `<small>${escapeGeoidHtml(item.category || '')}</small><small class="unified-ac-add-hint">+ Tambahkan ke Layer Aktif</small>`;
        }
        const itemIndex = visibleItems.push(item) - 1;
        html += `<button type="button" class="unified-ac-item" data-type="${item.type}" data-result-index="${itemIndex}"><span class="unified-ac-icon">${group.icon}</span><div><strong>${escapeGeoidHtml(item.name)}</strong>${detail}</div></button>`;
      });
      html += '</div>';
    }

    container.innerHTML = html;
    container.style.display = 'block';
    clearBtn.style.display = 'flex';

    container.querySelectorAll('.unified-ac-item').forEach(btn => {
      btn.addEventListener('click', () => selectUnifiedResult(visibleItems[Number(btn.dataset.resultIndex)]));
    });
  }

  function addLayerSearchResult(item) {
    let added = false;
    if (item.type === 'geoportal-layer') {
      const key = item.wmsUrl + '::' + item.layerName;
      const meta = { label: item.name, category: item.category, type: item.layerType,
        wmsUrl: item.wmsUrl, layerName: item.layerName };
      added = typeof window.isGeoportalHubLayerAdded === 'function' && window.isGeoportalHubLayerAdded(key);
      if (!added && typeof window.addGeoportalHubLayerToActive === 'function') {
        added = window.addGeoportalHubLayerToActive(key, meta) !== false;
      }
    } else if (item.type === 'map-catalog-layer') {
      added = typeof window.isMapCatalogLayerAdded === 'function' && window.isMapCatalogLayerAdded(item.layerId);
      if (!added && typeof window.addMapCatalogLayerToActive === 'function') {
        added = window.addMapCatalogLayerToActive(item.layerId, item.name, item.category || 'Katalog Peta') !== false;
      }
    }
    if (added && typeof window.openActiveLayersSidebar === 'function') window.openActiveLayersSidebar();
    return added;
  }

  async function selectUnifiedResult(item) {
    const input = document.getElementById('unifiedSearchInput');
    const results = document.getElementById('unifiedSearchResults');
    const clearBtn = document.getElementById('unifiedSearchClear');
    unifiedSearchSequence++;
    input.value = item.name;
    results.style.display = 'none';
    clearBtn.style.display = 'none';

    if (item.type === 'geoportal-layer' || item.type === 'map-catalog-layer') {
      const added = addLayerSearchResult(item);
      if (!added && window.showToast) window.showToast('Layer tidak dapat ditambahkan. Coba lagi dari katalog sumber.', 'error');
      return;
    }

    if (item.type === 'cctv') {
      const _m = window.map;
      if (_m) _m.flyTo([item.lat, item.lon], 16, { duration: 0.5 });
      openCctvModal(item.id);
      return;
    }

    const wilayahTypes = ['provinsi', 'kabkot', 'kecamatan', 'desa'];
    if (wilayahTypes.includes(item.type)) {
      if (typeof window.resetAllLayers === 'function') { try { window.resetAllLayers(); } catch (e) {} }
      let layer = null;
      try {
        layer = await showGeoidBoundary(item.kode, undefined, { source: 'unified-search' });
      } catch (e) {
        console.warn('[UnifiedSearch] showGeoidBoundary failed:', e);
      }
      if (typeof setAdmText === 'function') {
        setAdmText('adm-provinsi', item.provinsi);
        setAdmText('adm-kabkota', item.type === 'kabkot' ? item.name : item.kabkot);
        setAdmText('adm-kecamatan', item.type === 'kecamatan' ? item.name : item.kecamatan);
        setAdmText('adm-desa', item.type === 'desa' ? item.name : '-');
      }

      /* Sheet Tanya Ruang TIDAK lagi dibuka otomatis di sini. Dulu
         openAiSheet() + _aiSendQuick() dipanggil begitu batas selesai
         digambar, sehingga panel AI menutupi peta persis saat user masih
         ingin melihat wilayah yang ia cari.
         Sekarang pemanggilnya tombol "Tanya Ruang" di dalam popup batas
         wilayah, jadi AI hanya terbuka bila memang diminta.

         Popup-nya sendiri dibuka di sini supaya tombolnya langsung terlihat
         tanpa harus klik poligon dulu. Tanpa delay: Leaflet memindahkan
         popup mengikuti peta selama flyToBounds, jadi tidak perlu menunggu
         animasi selesai. showGeoidBoundary() mengembalikan undefined pada
         jalur fallback (batas BIG tidak tersedia), dan itu sudah dijaga. */
      if (layer && typeof layer.openPopup === 'function') {
        try { layer.openPopup(); } catch (e) {
          console.warn('[UnifiedSearch] Gagal membuka popup batas:', e);
        }
      }
      // Opening the unified detail sheet resizes the map, and its popup
      // handler briefly pans to the popup anchor. Fit the searched boundary
      // after that layout/pan settles so the whole selected area is visible.
      if (layer && typeof layer.getBounds === 'function') {
        const bounds = layer.getBounds();
        const _m = window.map;
        if (_m && bounds && bounds.isValid && bounds.isValid()) {
          const maxZoomByLevel = { 1: 8, 2: 10, 3: 12, 4: 15 };
          const maxZoom = maxZoomByLevel[String(item.kode || '').split('.').length] || 15;
          window.setTimeout(() => {
            if (!_m.hasLayer(layer) || !bounds.isValid()) return;
            if (typeof _m.invalidateSize === 'function') _m.invalidateSize({ pan: false });
            _m.flyToBounds(bounds.pad(0.08), { maxZoom, duration: 1 });
          }, 560);
        }
      }
    }
  }

  (function initUnifiedSearch() {
    const input = document.getElementById('unifiedSearchInput');
    const results = document.getElementById('unifiedSearchResults');
    const clearBtn = document.getElementById('unifiedSearchClear');
    if (!input || !results) return;

    input.addEventListener('input', function () {
      clearTimeout(unifiedSearchTimer);
      unifiedSearchSequence++;
      const query = unifiedNormalize(this.value.trim());
      if (query.length < 2) { results.style.display = 'none'; clearBtn.style.display = 'none'; return; }

      unifiedSearchTimer = setTimeout(async () => {
        if (!cctvLoaded && typeof loadCctvData === 'function') loadCctvData();
        await performUnifiedSearch(query);
      }, 80);
    });

    input.addEventListener('focus', function () {
      const query = unifiedNormalize(this.value.trim());
      if (query.length >= 2) {
        if (!cctvLoaded && typeof loadCctvData === 'function') loadCctvData();
        performUnifiedSearch(query);
      }
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { results.style.display = 'none'; }
    });

    clearBtn.addEventListener('click', function () {
      unifiedSearchSequence++;
      input.value = '';
      results.style.display = 'none';
      this.style.display = 'none';
      input.focus();
    });

    document.addEventListener('click', function (e) {
      if (!e.target.closest('.unified-search')) {
        results.style.display = 'none';
      }
    });
  })();
