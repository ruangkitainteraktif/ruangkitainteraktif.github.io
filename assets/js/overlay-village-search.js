// ==========================================
// Overlay Village Search
// Autocomplete desa dari kode_wilayah.json
// ==========================================

(function() {
  let villageData = [];
  let loadPromise = null;

  function ensureLoaded() {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        const res = await fetch('assets/data/kode_wilayah.json');
        if (!res.ok) return;
        const all = await res.json();
        villageData = all.filter(item => item.kode && (item.kode.match(/\./g) || []).length === 3);

      } catch (e) {
        console.warn('Gagal memuat kode_wilayah.json:', e);
      }
    })();
    return loadPromise;
  }

  function searchVillages(query) {
    if (!query || query.length < 2 || !villageData.length) return [];
    const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return villageData.filter(item => {
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
      div.textContent = item.nama;
      div.addEventListener('mouseenter', () => { div.style.background = '#e3f2fd'; });
      div.addEventListener('mouseleave', () => { div.style.background = ''; });
      div.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = item.nama;
        window._selectedVillageKode = item.kode;
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
    if (!input || !results || !selected) return;

    ensureLoaded();

    input.addEventListener('input', async () => {
      const q = input.value.trim();
      if (q.length < 2) {
        results.style.display = 'none';
        window._selectedVillageKode = null;
        selected.style.display = 'none';
        return;
      }
      await ensureLoaded();
      const found = searchVillages(q);
      renderResults(found, results, input, selected);
    });

    input.addEventListener('focus', async () => {
      if (input.value.trim().length >= 2) {
        await ensureLoaded();
        const found = searchVillages(input.value.trim());
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
