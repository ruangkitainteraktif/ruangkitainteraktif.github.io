(function () {
  'use strict';

  const LAYERS = {
    soil: {
      title: 'Jenis Tanah',
      service: 'https://geoportal.jogjaprov.go.id/server/rest/services/Hosted/Jenis_Tanah/FeatureServer/0',
      columns: [['jns_tnh', 'Jenis tanah'], ['tekstur', 'Tekstur'], ['infiltrasi', 'Infiltrasi'], ['luas', 'Luas']]
    },
    landuse: {
      title: 'Tata Guna Lahan',
      service: 'https://geoportal.jogjaprov.go.id/server/rest/services/Hosted/Tata_Guna_Lahan/FeatureServer/0',
      columns: [['pl', 'Penggunaan lahan'], ['peruntukan', 'Peruntukan'], ['keterangan', 'Keterangan'], ['luas', 'Luas']]
    },
    lsd: {
      title: 'Lahan Sawah Dilindungi',
      service: 'https://geoportal.jogjaprov.go.id/server/rest/services/DISPERTARU/Lahan_Sawah_Dilindungi/MapServer/0',
      columns: [['Kabupaten', 'Kabupaten'], ['POLA_III', 'Pola III'], ['JENIS_SAWA', 'Jenis sawah'], ['KP2B', 'KP2B'], ['luas_ha', 'Luas (ha)']]
    },
    rdtrYia: {
      title: 'Pola Ruang RDTR YIA 2022',
      service: 'https://geoportal.jogjaprov.go.id/server/rest/services/Hosted/Pola_Ruang_RDTR_YIA_2022/FeatureServer/0',
      columns: [['namobj', 'Nama zona'], ['namszn', 'Subzona'], ['kodewp', 'Kode WP'], ['wadmkc', 'Kecamatan'], ['wadmkd', 'Desa/Kalurahan'], ['luasha', 'Luas (ha)']]
    }
  };
  const PAGE_SIZE = 100;
  const BASE_STYLE = { color: '#475569', weight: 1, opacity: 0.85, fillColor: '#d8fcd4', fillOpacity: 0.62 };
  let features = [];
  let layer = null;
  let activeLayer = null;
  let activeKey = '';
  let objectIds = [];
  let currentPage = 0;
  const idCache = new Map();

  function byId(id) { return document.getElementById(id); }
  function setStatus(message, isError) {
    const el = byId('geojogjaStatus');
    if (!el) return;
    el.textContent = message;
    el.style.color = isError ? '#b91c1c' : '';
  }
  function value(props, key) {
    const v = props && props[key];
    return v === null || v === undefined || v === '' ? '—' : String(v);
  }
  function formatArea(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw === null || raw === undefined ? '—' : String(raw);
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n);
  }
  function featureId(feature) {
    const props = feature.properties || {};
    return String(props.fid ?? props.FID ?? props.OBJECTID ?? props.objectid ?? '');
  }
  function focusFeature(feature, row) {
    if (!feature || !layer || !window.map) return;
    if (activeLayer) activeLayer.setStyle(BASE_STYLE);
    const id = featureId(feature);
    const target = layer.getLayers().find(item => featureId(item.feature) === id);
    activeLayer = target || null;
    if (activeLayer) {
      activeLayer.setStyle({ color: '#f97316', weight: 4, opacity: 1, fillColor: '#f59e0b', fillOpacity: 0.6 });
      activeLayer.bringToFront();
      const bounds = activeLayer.getBounds();
      if (bounds.isValid()) window.map.flyToBounds(bounds.pad(0.12), { padding: [28, 28], maxZoom: 14, duration: 0.7 });
    }
    document.querySelectorAll('#geojogjaTableBody tr').forEach(tr => tr.classList.toggle('is-active', tr === row));
  }
  function showDetails(feature, latlng) {
    if (!feature) return;
    if (window.showGeoportalFeatureDetails) {
      const title = LAYERS[activeKey]?.title || 'Layer';
      window.showGeoportalFeatureDetails(`GeoJogja · ${title}`, feature.properties || {}, latlng);
    }
  }
  function drawTable(config) {
    const tbody = byId('geojogjaTableBody');
    const wrap = byId('geojogjaTableWrap');
    if (!tbody || !wrap) return;
    const head = wrap.querySelector('thead tr');
    head.replaceChildren();
    ['No.', ...config.columns.map(([, label]) => label)].forEach(label => {
      const th = document.createElement('th');
      th.textContent = label;
      head.appendChild(th);
    });
    tbody.replaceChildren();
    const fragment = document.createDocumentFragment();
    features.forEach((feature, index) => {
      const props = feature.properties || {};
      const row = document.createElement('tr');
      row.tabIndex = 0;
      row.setAttribute('aria-label', `Sorot poligon ${value(props, config.columns[0][0])}`);
      [String(currentPage * PAGE_SIZE + index + 1), ...config.columns.map(([key]) => key === 'luas' || key === 'luas_ha' || key === 'luasha' ? formatArea(props[key]) : value(props, key))].forEach(text => {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.appendChild(cell);
      });
      row.addEventListener('click', () => focusFeature(feature, row));
      row.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); focusFeature(feature, row); }
      });
      fragment.appendChild(row);
    });
    tbody.appendChild(fragment);
    wrap.hidden = false;
  }
  async function query(config, params) {
    const response = await fetch(`${config.service}/query?${params}`);
    const data = await response.json();
    if (!response.ok || data.error) {
      const error = data.error;
      const detail = error?.details?.length ? `: ${error.details.join('; ')}` : '';
      throw new Error(`${error?.message || `HTTP ${response.status}`}${detail}`);
    }
    return data;
  }
  async function fetchObjectIds(config) {
    const params = new URLSearchParams({ where: '1=1', returnIdsOnly: 'true', f: 'json' });
    const data = await query(config, params);
    return data.objectIds || [];
  }
  async function fetchFeaturePage(config, ids, page) {
    const pageIds = ids.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    if (!pageIds.length) return [];
    const params = new URLSearchParams({
      objectIds: pageIds.join(','), outFields: '*', returnGeometry: 'true',
      outSR: '4326', f: 'geojson'
    });
    const data = await query(config, params);
    return data.features || [];
  }
  function renderPagination(config) {
    const pagination = byId('geojogjaPagination');
    const info = byId('geojogjaPageInfo');
    const prev = byId('geojogjaPrevPage');
    const next = byId('geojogjaNextPage');
    const totalPages = Math.max(1, Math.ceil(objectIds.length / PAGE_SIZE));
    if (!pagination || !info || !prev || !next) return;
    if (!objectIds.length || !layer || activeKey !== byId('geojogjaLayerSelect').value) {
      pagination.hidden = true;
      return;
    }
    pagination.hidden = false;
    prev.disabled = currentPage <= 0;
    next.disabled = currentPage >= totalPages - 1;
    const first = objectIds.length ? currentPage * PAGE_SIZE + 1 : 0;
    const last = Math.min((currentPage + 1) * PAGE_SIZE, objectIds.length);
    info.textContent = `${config.title} · ${first}–${last} dari ${objectIds.length.toLocaleString('id-ID')} · halaman ${currentPage + 1}/${totalPages}`;
  }
  function mountLayer(config, shouldFitBounds) {
    if (!window.map || !window.L) throw new Error('Peta belum siap.');
    if (layer && window.map.hasLayer(layer)) window.map.removeLayer(layer);
    activeLayer = null;
    layer = L.geoJSON({ type: 'FeatureCollection', features }, {
      style: () => ({ ...BASE_STYLE }),
      onEachFeature: (feature, featureLayer) => {
        featureLayer.on('click', event => {
          focusFeature(feature, null);
          const rows = document.querySelectorAll('#geojogjaTableBody tr');
          const index = features.indexOf(feature);
          if (index >= 0 && rows[index]) {
            rows[index].classList.add('is-active');
            rows[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
          showDetails(feature, event.latlng);
        });
      }
    }).addTo(window.map);
    activeKey = byId('geojogjaLayerSelect').value;
    const bounds = layer.getBounds();
    if (shouldFitBounds && bounds.isValid()) window.map.fitBounds(bounds.pad(0.06), { maxZoom: 10 });
    byId('geojogjaHideBtn').hidden = false;
  }
  async function load(page, shouldFitBounds) {
    page = Number.isInteger(page) ? page : 0;
    shouldFitBounds = shouldFitBounds !== false;
    const button = byId('geojogjaLoadBtn');
    button.disabled = true;
    byId('geojogjaPagination').hidden = true;
    byId('geojogjaPrevPage').disabled = true;
    byId('geojogjaNextPage').disabled = true;
    button.textContent = 'Memuat data…';
    setStatus('Mengambil poligon dari Geoportal DIY…');
    try {
      const key = byId('geojogjaLayerSelect').value;
      const config = LAYERS[key];
      if (!config) throw new Error('Layer GeoJogja tidak dikenal.');
      if (activeKey !== key) {
        if (layer && window.map && window.map.hasLayer(layer)) window.map.removeLayer(layer);
        layer = null;
        activeLayer = null;
        page = 0;
      }
      if (!idCache.has(key)) idCache.set(key, await fetchObjectIds(config));
      objectIds = idCache.get(key);
      if (!objectIds.length) throw new Error('Layanan tidak mengembalikan ID fitur.');
      currentPage = Math.max(0, Math.min(page, Math.ceil(objectIds.length / PAGE_SIZE) - 1));
      features = await fetchFeaturePage(config, objectIds, currentPage);
      if (!features.length) throw new Error('Layanan tidak mengembalikan fitur.');
      drawTable(config);
      mountLayer(config, shouldFitBounds);
      renderPagination(config);
      setStatus(`${config.title}: menampilkan ${features.length.toLocaleString('id-ID')} poligon pada halaman ini. Klik baris untuk menyorot, atau poligon untuk membuka detail.`);
    } catch (error) {
      console.error('[GeoJogja] Gagal memuat layer:', error);
      setStatus(`Gagal memuat data GeoJogja: ${error.message}`, true);
    } finally {
      button.disabled = false;
      button.textContent = 'Tampilkan layer & tabel';
      renderPagination(LAYERS[byId('geojogjaLayerSelect').value]);
    }
  }
  function hide() {
    if (layer && window.map && window.map.hasLayer(layer)) window.map.removeLayer(layer);
    activeLayer = null;
    byId('geojogjaHideBtn').hidden = true;
    const config = LAYERS[byId('geojogjaLayerSelect').value];
    setStatus(objectIds.length ? `${config.title}: ${objectIds.length.toLocaleString('id-ID')} fitur terdaftar. Layer disembunyikan.` : 'Layer belum dimuat.');
  }
  document.addEventListener('DOMContentLoaded', () => {
    byId('geojogjaLoadBtn')?.addEventListener('click', load);
    byId('geojogjaHideBtn')?.addEventListener('click', hide);
    byId('geojogjaPrevPage')?.addEventListener('click', () => { if (currentPage > 0) load(currentPage - 1, false); });
    byId('geojogjaNextPage')?.addEventListener('click', () => {
      if (currentPage < Math.ceil(objectIds.length / PAGE_SIZE) - 1) load(currentPage + 1, false);
    });
  });
})();
