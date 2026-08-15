  let unifiedSearchTimer;

  function unifiedNormalize(value) {
    return normalizeWeatherSearch(value);
  }

  function searchUnifiedDesa(query) {
    if (!weatherSearchLocations || !weatherSearchLocations.length) return [];
    const results = [];
    for (const loc of weatherSearchLocations) {
      if (loc.searchText.includes(query)) {
        results.push({
          type: 'desa',
          name: loc.desa,
          kecamatan: loc.kecamatan,
          kabkot: loc.kabkot,
          provinsi: loc.provinsi,
          kode: loc.kode
        });
        if (results.length >= 5) break;
      }
    }
    return results;
  }

  function searchUnifiedProvinsi(query) {
    if (!provinsiSearchIndex || !provinsiSearchIndex.length) return [];
    const results = [];
    for (const item of provinsiSearchIndex) {
      if (item.searchText.includes(query)) {
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

  function searchUnifiedKabkot(query) {
    if (!kabkotaSearchIndex || !kabkotaSearchIndex.length) return [];
    const results = [];
    for (const item of kabkotaSearchIndex) {
      if (item.searchText.includes(query)) {
        results.push({
          type: 'kabkot',
          name: item.name,
          provinsi: item.provinsi,
          kode: item.kode
        });
        if (results.length >= 5) break;
      }
    }
    return results;
  }

  function searchUnifiedKecamatan(query) {
    if (!kecamatanSearchIndex || !kecamatanSearchIndex.length) return [];
    const results = [];
    for (const item of kecamatanSearchIndex) {
      if (item.searchText.includes(query)) {
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

  function renderUnifiedResults(items) {
    const container = document.getElementById('unifiedSearchResults');
    const clearBtn = document.getElementById('unifiedSearchClear');

    if (!items.length) {
      container.innerHTML = '<div class="unified-ac-empty">Tidak ditemukan</div>';
      container.style.display = 'block';
      clearBtn.style.display = 'flex';
      return;
    }

    const provItems = items.filter(i => i.type === 'provinsi');
    const kabkotItems = items.filter(i => i.type === 'kabkot');
    const kecItems = items.filter(i => i.type === 'kecamatan');
    const desaItems = items.filter(i => i.type === 'desa');
    const cctvItems = items.filter(i => i.type === 'cctv');
    let html = '';

    const groupConfig = [
      { items: provItems, label: 'Provinsi', icon: '🗺️' },
      { items: kabkotItems, label: 'Kabupaten / Kota', icon: '🏙️' },
      { items: kecItems, label: 'Kecamatan', icon: '🏘️' },
      { items: desaItems, label: 'Desa / Kelurahan', icon: '📍' },
      { items: cctvItems, label: 'CCTV', icon: '🎥' }
    ];

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
        }
        html += `<button type="button" class="unified-ac-item" data-type="${item.type}"><span class="unified-ac-icon">${group.icon}</span><div><strong>${escapeGeoidHtml(item.name)}</strong>${detail}</div></button>`;
      });
      html += '</div>';
    }

    container.innerHTML = html;
    container.style.display = 'block';
    clearBtn.style.display = 'flex';

    const allItems = [...provItems, ...kabkotItems, ...kecItems, ...desaItems, ...cctvItems];
    container.querySelectorAll('.unified-ac-item').forEach((btn, idx) => {
      btn.addEventListener('click', () => selectUnifiedResult(allItems[idx]));
    });
  }

  async function applyUnifiedWilayah(marker, location, item) {
    if (!marker) return;

    const setText = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.innerText = value || '-';
    };
    setText('adm-provinsi', item.provinsi);
    setText('adm-kabkota', item.type === 'kabkot' ? item.name : item.kabkot);
    setText('adm-kecamatan', item.kecamatan);
    setText('adm-desa', item.type === 'desa' ? item.name : '-');
    setText('adm-jalan', '-');
    setText('adm-kodepos', location.kodepos || location.postal_code || '-');

    await loadGeoidPopupInsights(marker, { ...location, kode: item.kode });
    if (typeof loadDukcapilPopulation === 'function') await loadDukcapilPopulation(marker, item.kode, location);
    showGeoidBoundary(item.kode, item.type === 'provinsi' ? 8 : item.type === 'kabkot' ? 11 : item.type === 'kecamatan' ? 13 : 15);
  }

  async function selectUnifiedResult(item) {
    const input = document.getElementById('unifiedSearchInput');
    const results = document.getElementById('unifiedSearchResults');
    const clearBtn = document.getElementById('unifiedSearchClear');
    input.value = item.name;
    results.style.display = 'none';
    clearBtn.style.display = 'none';

    if (item.type === 'cctv') {
      map.flyTo([item.lat, item.lon], 16, { duration: 0.5 });
      openCctvModal(item.id);
      return;
    }

    if (item.type === 'provinsi') {
      const location = await geocodeAdministrativeArea({ provinsi: item.name });
      if (!location) { alert('Koordinat wilayah tidak ditemukan.'); return; }
      const marker = showGeoidFlyup(location.lat, location.lon, { provinsi: item.name, kode: item.kode }, 8);
      await applyUnifiedWilayah(marker, location, item);
      return;
    }

    if (item.type === 'kabkot') {
      const location = await geocodeAdministrativeArea({ kabkota: item.name, provinsi: item.provinsi });
      if (!location) { alert('Koordinat wilayah tidak ditemukan.'); return; }
      const marker = showGeoidFlyup(location.lat, location.lon, { kabkota: item.name, provinsi: item.provinsi, kode: item.kode }, 11);
      await applyUnifiedWilayah(marker, location, item);
      return;
    }

    if (item.type === 'kecamatan') {
      const location = await geocodeAdministrativeArea({ kecamatan: item.name, kabkota: item.kabkot, provinsi: item.provinsi });
      if (!location) { alert('Koordinat wilayah tidak ditemukan.'); return; }
      const marker = showGeoidFlyup(location.lat, location.lon, { kecamatan: item.name, kabkota: item.kabkot, provinsi: item.provinsi, kode: item.kode }, 13);
      await applyUnifiedWilayah(marker, location, item);
      return;
    }

    if (item.type === 'desa') {
      let location = await geocodeVillageByAdm4(item.kode);
      if (!location) {
        location = await geocodeAdministrativeArea({
          desa: item.name, kecamatan: item.kecamatan, kabkota: item.kabkot, provinsi: item.provinsi
        });
      }
      if (!location) { alert('Koordinat wilayah tidak ditemukan.'); return; }

      const marker = showGeoidFlyup(location.lat, location.lon, {
        desa: item.name,
        kecamatan: item.kecamatan,
        kabkota: item.kabkot,
        provinsi: item.provinsi,
        kode: item.kode
      }, 15);

      await applyUnifiedWilayah(marker, location, item);
    }
  }

  (function initUnifiedSearch() {
    const input = document.getElementById('unifiedSearchInput');
    const results = document.getElementById('unifiedSearchResults');
    const clearBtn = document.getElementById('unifiedSearchClear');
    if (!input || !results) return;

    input.addEventListener('input', function () {
      clearTimeout(unifiedSearchTimer);
      const query = unifiedNormalize(this.value.trim());
      if (query.length < 2) { results.style.display = 'none'; clearBtn.style.display = 'none'; return; }

      unifiedSearchTimer = setTimeout(async () => {
        if (!cctvLoaded && typeof loadCctvData === 'function') loadCctvData();
        const provResults = searchUnifiedProvinsi(query);
        const kabkotResults = searchUnifiedKabkot(query);
        const kecResults = searchUnifiedKecamatan(query);
        const desaResults = searchUnifiedDesa(query);
        const cctvResults = searchUnifiedCctv(query);
        renderUnifiedResults([...provResults, ...kabkotResults, ...kecResults, ...desaResults, ...cctvResults]);
      }, 80);
    });

    input.addEventListener('focus', function () {
      const query = unifiedNormalize(this.value.trim());
      if (query.length >= 2) {
        if (!cctvLoaded && typeof loadCctvData === 'function') loadCctvData();
        const provResults = searchUnifiedProvinsi(query);
        const kabkotResults = searchUnifiedKabkot(query);
        const kecResults = searchUnifiedKecamatan(query);
        const desaResults = searchUnifiedDesa(query);
        const cctvResults = searchUnifiedCctv(query);
        renderUnifiedResults([...provResults, ...kabkotResults, ...kecResults, ...desaResults, ...cctvResults]);
      }
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { results.style.display = 'none'; }
    });

    clearBtn.addEventListener('click', function () {
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
