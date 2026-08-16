// ==========================================
// Overlay Village Search
// Autocomplete desa & kabupaten dari kode_wilayah.json
// ==========================================

(function() {
  let allData = [];
  let desaData = [];
  let kabData = [];
  let loadPromise = null;

  function ensureLoaded() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        const res = await fetch('assets/data/kode_wilayah.json');
        if (!res.ok) return;
        const all = await res.json();
        allData = all.filter(item => {
          if (!item.kode) return false;
          const dots = (item.kode.match(/\./g) || []).length;
          return dots === 1 || dots === 3;
        });
        desaData = allData.filter(item => (item.kode.match(/\./g) || []).length === 3);
        kabData = allData.filter(item => (item.kode.match(/\./g) || []).length === 1);
      } catch (e) {
        console.warn('Gagal memuat kode_wilayah.json:', e);
      }
    })();
    return loadPromise;
  }

  function getLevelMode() {
    return document.getElementById('overlayLevelMode')?.value || 'desa';
  }

  function searchItems(query) {
    const level = getLevelMode();
    const source = level === 'kabupaten' ? kabData : desaData;
    if (!query || query.length < 2 || !source.length) return [];
    const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return source.filter(item => {
      const name = item.nama.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return name.includes(q);
    }).slice(0, 20);
  }

  function renderResults(results, container, input, selectedEl) {
    container.innerHTML = '';
    if (!results.length) {
      container.style.display = 'none';
      return;
    }
    results.forEach(item => {
      const div = document.createElement('div');
      div.style.cssText = 'padding:7px 10px;font-size:11px;cursor:pointer;border-bottom:1px solid #f0f4f8;color:#385773;transition:background .1s;';
      div.textContent = `${item.nama} (${item.kode})`;
      div.addEventListener('mouseenter', () => { div.style.background = '#e3f2fd'; });
      div.addEventListener('mouseleave', () => { div.style.background = ''; });
      div.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = item.nama;
        window._selectedVillageKode = item.kode;
        window._selectedOverlayLevel = getLevelMode();
        selectedEl.textContent = `\u2713 ${item.nama} (${item.kode})`;
        selectedEl.style.display = 'block';
        container.style.display = 'none';
      });
      container.appendChild(div);
    });
    container.style.display = 'block';
  }

  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('overlayVillageSearch');
    const results = document.getElementById('overlayVillageResults');
    const selected = document.getElementById('overlayVillageSelected');
    const levelMode = document.getElementById('overlayLevelMode');
    const areaLabel = document.getElementById('overlayAreaLabel');
    if (!input || !results || !selected) return;

    const levelPlaceholders = { desa: 'Ketik nama desa...', kabupaten: 'Ketik nama kabupaten...' };
    const levelLabels = { desa: 'Input Layer 2 — Desa/Kelurahan', kabupaten: 'Input Layer 2 — Kabupaten/Kota' };

    ensureLoaded();

    if (levelMode) {
      levelMode.addEventListener('change', () => {
        const level = levelMode.value;
        input.placeholder = levelPlaceholders[level] || levelPlaceholders.desa;
        if (areaLabel) areaLabel.textContent = levelLabels[level] || levelLabels.desa;
        input.value = '';
        results.style.display = 'none';
        selected.style.display = 'none';
        window._selectedVillageKode = null;
        window._selectedOverlayLevel = level;
      });
    }

    input.addEventListener('input', async () => {
      const q = input.value.trim();
      if (q.length < 2) {
        results.style.display = 'none';
        window._selectedVillageKode = null;
        selected.style.display = 'none';
        return;
      }
      await ensureLoaded();
      const found = searchItems(q);
      renderResults(found, results, input, selected);
    });

    input.addEventListener('focus', async () => {
      if (input.value.trim().length >= 2) {
        await ensureLoaded();
        const found = searchItems(input.value.trim());
        renderResults(found, results, input, selected);
      }
    });

    document.addEventListener('mousedown', (e) => {
      if (!input.contains(e.target) && !results.contains(e.target)) {
        results.style.display = 'none';
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        results.style.display = 'none';
        input.blur();
      }
    });
  });
})();
