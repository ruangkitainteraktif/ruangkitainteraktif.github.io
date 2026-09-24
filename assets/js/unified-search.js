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

  async function selectUnifiedResult(item) {
    const input = document.getElementById('unifiedSearchInput');
    const results = document.getElementById('unifiedSearchResults');
    const clearBtn = document.getElementById('unifiedSearchClear');
    input.value = item.name;
    results.style.display = 'none';
    clearBtn.style.display = 'none';

    if (item.type === 'cctv') {
      const _m = window.map;
      if (_m) _m.flyTo([item.lat, item.lon], 16, { duration: 0.5 });
      openCctvModal(item.id);
      return;
    }

    const wilayahTypes = ['provinsi', 'kabkot', 'kecamatan', 'desa'];
    if (wilayahTypes.includes(item.type)) {
      if (typeof window.resetAllLayers === 'function') { try { window.resetAllLayers(); } catch (e) {} }
      try {
        await showGeoidBoundary(item.kode);
      } catch (e) {
        console.warn('[UnifiedSearch] showGeoidBoundary failed:', e);
      }
      if (typeof setAdmText === 'function') {
        setAdmText('adm-provinsi', item.provinsi);
        setAdmText('adm-kabkota', item.type === 'kabkot' ? item.name : item.kabkot);
        setAdmText('adm-kecamatan', item.type === 'kecamatan' ? item.name : item.kecamatan);
        setAdmText('adm-desa', item.type === 'desa' ? item.name : '-');
      }

      if (typeof window.openAiSheet === 'function') {
        window.openAiSheet();
        setTimeout(function () {
          if (typeof window._aiSendQuick === 'function') {
            var levelPrefix = '';
            if (item.type === 'provinsi') levelPrefix = 'Provinsi ';
            else if (item.type === 'kabkot') levelPrefix = '';
            else if (item.type === 'kecamatan') levelPrefix = 'Kecamatan ';
            else if (item.type === 'desa') levelPrefix = 'Desa ';
            var ctx = [];
            if (item.type === 'desa') {
              if (item.kecamatan) ctx.push(item.kecamatan);
              if (item.kabkot) ctx.push(item.kabkot);
              if (item.provinsi) ctx.push(item.provinsi);
            } else if (item.type === 'kecamatan') {
              if (item.kabkot) ctx.push(item.kabkot);
              if (item.provinsi) ctx.push(item.provinsi);
            } else if (item.type === 'kabkot') {
              if (item.provinsi) ctx.push(item.provinsi);
            }
            var aiText = levelPrefix + item.name;
            if (ctx.length) aiText += ', ' + ctx.join(', ');
            if (item.kode) aiText += ' (' + item.kode + ')';
            window._aiSendQuick(-1, aiText);
          }
        }, 400);
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
      const query = unifiedNormalize(this.value.trim());
      if (query.length < 2) { results.style.display = 'none'; clearBtn.style.display = 'none'; return; }

      unifiedSearchTimer = setTimeout(async () => {
        if (!cctvLoaded && typeof loadCctvData === 'function') loadCctvData();
        renderUnifiedResults(runUnifiedSearch(query));
      }, 80);
    });

    input.addEventListener('focus', function () {
      const query = unifiedNormalize(this.value.trim());
      if (query.length >= 2) {
        if (!cctvLoaded && typeof loadCctvData === 'function') loadCctvData();
        renderUnifiedResults(runUnifiedSearch(query));
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
