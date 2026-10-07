/* GeoNusa Hub: dropdown wilayah lokal, geometri batas ditampilkan dari BIG. */
(function () {
  'use strict';

  const LEVELS = [
    { id: 'geonusaProvince', label: 'provinsi', depth: 1 },
    { id: 'geonusaKabupaten', label: 'kabupaten/kota', depth: 2 },
    { id: 'geonusaKecamatan', label: 'kecamatan', depth: 3 },
    { id: 'geonusaDesa', label: 'desa/kelurahan', depth: 4 }
  ];

  function init() {
    const toggle = document.getElementById('geonusaUnifiedToggle');
    const panel = document.getElementById('geonusaUnifiedPanel');
    const status = document.getElementById('geonusaUnifiedStatus');
    const searchResults = document.getElementById('unifiedSearchResults');
    const searchInput = document.getElementById('unifiedSearchInput');
    const searchBtn = document.getElementById('geonusaSearchBtn');
    const resetLayerBtn = document.getElementById('geonusaResetLayerBtn');
    if (!toggle || !panel || !status || !searchBtn) return;

    if (resetLayerBtn) resetLayerBtn.addEventListener('click', () => {
      if (typeof window.resetGeoidBoundaryLayer === 'function') window.resetGeoidBoundaryLayer();
      if (searchInput) searchInput.value = '';
      setStatus('Layer batas wilayah direset.');
    });

    const selects = LEVELS.map(level => document.getElementById(level.id));
    let wilayahPromise;
    let provinceLoaded = false;
    function setStatus(message, error) {
      status.textContent = message;
      status.style.color = error ? '#b91c1c' : '';
    }
    function normalizeData(data) {
      const rows = Array.isArray(data) ? data : (data && Array.isArray(data.value) ? data.value : []);
      return rows.filter(item => item && typeof item.kode === 'string' && item.nama && /^\d+(?:\.\d+){0,3}$/.test(item.kode));
    }
    function getWilayahData() {
      if (!wilayahPromise) {
        const local = window.KODE_WILAYAH_DATA;
        wilayahPromise = local
          ? Promise.resolve(normalizeData(local))
          : fetch('assets/data/kode_wilayah.json').then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
          }).then(normalizeData);
      }
      return wilayahPromise;
    }
    function resetFrom(index) {
      for (let i = index; i < selects.length; i++) {
        const placeholder = i === 0 ? 'Pilih provinsi…' : `Pilih ${LEVELS[i - 1].label} dahulu`;
        selects[i].replaceChildren(new Option(placeholder, ''));
        selects[i].disabled = true;
      }
      searchBtn.disabled = !selects.some(select => select.value);
    }
    function selectedArea() {
      for (let i = selects.length - 1; i >= 0; i--) {
        const select = selects[i];
        if (select.value) return { code: select.value, name: select.selectedOptions[0]?.textContent || LEVELS[i].label, level: i };
      }
      return null;
    }
    async function populate(index, parentCode) {
      const level = LEVELS[index];
      const select = selects[index];
      select.disabled = true;
      select.replaceChildren(new Option('Memuat data lokal…', ''));
      setStatus(`Memuat daftar ${level.label} lokal…`);
      try {
        const all = await getWilayahData();
        const prefix = parentCode ? `${parentCode}.` : '';
        const items = all.filter(item => item.kode.split('.').length === level.depth && (!prefix || item.kode.startsWith(prefix)))
          .sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base', numeric: true }));
        select.replaceChildren(new Option(`Pilih ${level.label}…`, ''));
        items.forEach(item => select.add(new Option(item.nama, item.kode)));
        select.disabled = items.length === 0;
        if (index === 0) provinceLoaded = items.length > 0;
        if (!items.length) setStatus(`Data ${level.label} tidak ditemukan di data lokal.`, true);
        else setStatus(`${items.length.toLocaleString('id-ID')} ${level.label} tersedia dari data lokal.`);
      } catch (error) {
        if (index === 0) provinceLoaded = false;
        select.replaceChildren(new Option(`Gagal memuat ${level.label}`, ''));
        select.disabled = true;
        setStatus(`Data wilayah lokal gagal dimuat: ${error.message}`, true);
        console.error('[GeoNusa Hub] Gagal membaca data wilayah lokal:', error);
      }
    }

    toggle.addEventListener('click', () => {
      const open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (searchResults) searchResults.style.display = 'none';
      if (open && !provinceLoaded) populate(0);
    });

    selects.forEach((select, index) => {
      select.addEventListener('change', () => {
        resetFrom(index + 1);
        const selected = selectedArea();
        searchBtn.disabled = !selected;
        if (!select.value) {
          setStatus(`Pilih ${LEVELS[index].label} atau gunakan pilihan level di atasnya.`);
          return;
        }
        if (index < LEVELS.length - 1) populate(index + 1, select.value);
        else setStatus('Desa/kelurahan dipilih. Tekan Cari polygon untuk menampilkan batas.');
        if (index < LEVELS.length - 1) setStatus(`${select.selectedOptions[0].textContent} dipilih. Level ini juga bisa langsung dicari.`);
      });
    });

    searchBtn.addEventListener('click', async () => {
      const selected = selectedArea();
      if (!selected) return;
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      searchBtn.disabled = true;
      setStatus(`Mencari polygon ${selected.name} dari BIG…`);
      try {
        if (typeof window.showGeoidBoundary !== 'function') throw new Error('Fungsi batas peta belum tersedia.');
        const layer = await window.showGeoidBoundary(selected.code);
        if (!layer) throw new Error('Polygon tidak ditemukan atau batas BIG belum tersedia.');
        if (typeof layer.openPopup === 'function') layer.openPopup();
        if (searchInput) searchInput.value = selected.name;
        setStatus(`Polygon ${selected.name} ditampilkan.`);
      } catch (error) {
        setStatus(`Gagal menampilkan polygon: ${error.message}`, true);
        console.error('[GeoNusa Hub] Gagal menampilkan polygon:', error);
      } finally {
        searchBtn.disabled = !selectedArea();
      }
    });

    document.addEventListener('click', event => {
      if (!panel.hidden && !event.target.closest('#unifiedSearch')) {
        panel.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
    if (searchInput) searchInput.addEventListener('focus', () => {
      if (!panel.hidden) { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) {
        panel.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
