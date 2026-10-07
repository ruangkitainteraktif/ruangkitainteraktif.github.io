(function () {
  'use strict';

  const SERVICE = 'https://tataruang.jakarta.go.id/server/rest/services/Batas_Administrasi_Update/Batas_Administrasi_DKI_Jakarta_Update_View/MapServer/0';
  const FIELDS = ['WADMKK', 'WADMKC', 'WADMKD', 'WADMRW', 'WADMRT'];
  const LABELS = ['Kota/Kabupaten', 'Kecamatan', 'Kelurahan', 'RW', 'RT'];
  const SELECT_IDS = ['geojakarta-kota', 'geojakarta-kecamatan', 'geojakarta-kelurahan', 'geojakarta-rw', 'geojakarta-rt'];
  const OUT_FIELDS = 'OBJECTID,WADMKK,WADMKC,WADMKD,WADMRW,WADMRT,KDGPUM,KDFPUM,KDEPUM,KDCPUM,KDPKAB,LUASWH';
  const STYLE = { color: '#075985', weight: 3, opacity: 1, fillColor: '#38bdf8', fillOpacity: 0.2 };
  const HIGHLIGHT_STYLE = { color: '#f97316', weight: 4, opacity: 1, fillColor: '#fb923c', fillOpacity: 0.3 };

  let boundaryLayer = null;
  let requestSequence = 0;

  function byId(id) { return document.getElementById(id); }
  function selects() { return SELECT_IDS.map(byId); }

  function setStatus(message, kind) {
    const el = byId('geojakarta-status');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('is-error', kind === 'error');
    el.classList.toggle('is-busy', kind === 'busy');
  }

  function clearBoundary() {
    if (boundaryLayer && window.map && window.map.hasLayer(boundaryLayer)) {
      window.map.removeLayer(boundaryLayer);
    }
    boundaryLayer = null;
    const button = byId('geojakarta-clear');
    if (button) button.disabled = true;
  }

  function resetSelect(select, placeholder) {
    if (!select) return;
    select.replaceChildren(new Option(placeholder, ''));
    select.value = '';
    select.disabled = true;
  }

  function displayValue(field, value) {
    const text = String(value);
    if (field === 'WADMRW') return /^\d+$/.test(text) ? 'RW ' + text.padStart(2, '0') : 'RW ' + text;
    if (field === 'WADMRT') return /^\d+$/.test(text) ? 'RT ' + text.padStart(3, '0') : 'RT ' + text;
    return text;
  }

  function makeWhere(lastFieldIndex) {
    const parts = [];
    const nodes = selects();
    for (let i = 0; i <= lastFieldIndex; i++) {
      const value = nodes[i] && nodes[i].value;
      if (!value) break;
      parts.push(FIELDS[i] + " = '" + String(value).replace(/'/g, "''") + "'");
    }
    return parts.length ? parts.join(' AND ') : '1=1';
  }

  async function request(path, params) {
    const response = await fetch(SERVICE + path + '?' + params.toString(), {
      headers: { Accept: 'application/json' }
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      const error = data.error || {};
      const detail = Array.isArray(error.details) && error.details.length ? ': ' + error.details.join('; ') : '';
      throw new Error((error.message || 'HTTP ' + response.status) + detail);
    }
    return data;
  }

  async function loadOptions(index, sequence) {
    if (sequence !== requestSequence || index >= FIELDS.length) return;
    const field = FIELDS[index];
    const params = new URLSearchParams({
      where: makeWhere(index - 1),
      outFields: field,
      returnGeometry: 'false',
      returnDistinctValues: 'true',
      orderByFields: field + ' ASC',
      f: 'json'
    });
    const select = byId(SELECT_IDS[index]);
    const data = await request('/query', params);
    if (sequence !== requestSequence) return;

    const values = Array.from(new Set((data.features || [])
      .map(feature => feature && feature.attributes && feature.attributes[field])
      .filter(value => value !== null && value !== undefined && String(value).trim() !== '')
      .map(String)));
    values.sort((a, b) => a.localeCompare(b, 'id', { numeric: true, sensitivity: 'base' }));
    select.replaceChildren(new Option('Pilih ' + LABELS[index].toLowerCase() + '…', ''));
    values.forEach(value => select.add(new Option(displayValue(field, value), value)));
    select.disabled = values.length === 0;

    if (!values.length) {
      setStatus('Tidak ada data ' + LABELS[index].toLowerCase() + ' untuk pilihan wilayah ini.', 'error');
    } else {
      setStatus(values.length.toLocaleString('id-ID') + ' pilihan ' + LABELS[index].toLowerCase() + ' tersedia.');
    }
  }

  async function showSelectedRt(sequence) {
    const nodes = selects();
    const params = new URLSearchParams({
      where: makeWhere(FIELDS.length - 1),
      outFields: OUT_FIELDS,
      returnGeometry: 'true',
      outSR: '4326',
      returnZ: 'false',
      returnM: 'false',
      f: 'geojson'
    });
    setStatus('Mengambil geometri batas RT…', 'busy');
    const data = await request('/query', params);
    if (sequence !== requestSequence) return;
    if (!Array.isArray(data.features) || !data.features.length) {
      throw new Error('Geometri batas RT tidak ditemukan untuk pilihan ini.');
    }
    if (!window.map || !window.L) throw new Error('Peta belum siap.');

    clearBoundary();
    boundaryLayer = L.geoJSON({ type: 'FeatureCollection', features: data.features }, {
      style: () => Object.assign({}, STYLE),
      onEachFeature: (feature, featureLayer) => {
        featureLayer.on('click', event => {
          featureLayer.setStyle(HIGHLIGHT_STYLE);
          if (window.showGeoportalFeatureDetails) {
            window.showGeoportalFeatureDetails('GeoJakarta · Batas RT', feature.properties || {}, event.latlng);
          }
        });
      }
    }).addTo(window.map);

    const bounds = boundaryLayer.getBounds();
    if (bounds && bounds.isValid()) window.map.flyToBounds(bounds.pad(0.18), { padding: [28, 28], maxZoom: 18, duration: 0.7 });
    const button = byId('geojakarta-clear');
    if (button) button.disabled = false;
    const district = nodes[0].value;
    const kecamatan = nodes[1].value;
    const kelurahan = nodes[2].value;
    const rw = displayValue('WADMRW', nodes[3].value);
    const rt = displayValue('WADMRT', nodes[4].value);
    setStatus([district, kecamatan, kelurahan, rw, rt].join(' · ') + ' — batas tampil di peta.');
  }

  async function onLevelChange(index) {
    const sequence = ++requestSequence;
    clearBoundary();
    const nodes = selects();
    for (let i = index + 1; i < nodes.length; i++) {
      resetSelect(nodes[i], 'Pilih ' + LABELS[i - 1].toLowerCase() + ' dahulu');
    }
    if (!nodes[index].value) {
      setStatus('Pilih wilayah secara berurutan hingga tingkat RT.');
      return;
    }
    if (index === FIELDS.length - 1) {
      try { await showSelectedRt(sequence); }
      catch (error) {
        if (sequence === requestSequence) setStatus('Gagal menampilkan batas RT: ' + error.message, 'error');
      }
      return;
    }
    try {
      setStatus('Memuat daftar ' + LABELS[index + 1].toLowerCase() + '…', 'busy');
      await loadOptions(index + 1, sequence);
    } catch (error) {
      if (sequence === requestSequence) setStatus('Gagal memuat daftar wilayah: ' + error.message, 'error');
    }
  }

  function init() {
    const nodes = selects();
    if (!nodes[0] || !byId('geojakarta-status')) return;
    nodes.forEach((select, index) => select.addEventListener('change', () => onLevelChange(index)));
    byId('geojakarta-clear')?.addEventListener('click', () => {
      clearBoundary();
      nodes[4].value = '';
      setStatus('Batas dihapus dari peta. Pilih RT lagi untuk menampilkannya.');
    });

    const sequence = ++requestSequence;
    setStatus('Memuat daftar kota/kabupaten Jakarta…', 'busy');
    loadOptions(0, sequence).catch(error => {
      if (sequence === requestSequence) setStatus('Gagal memuat daftar wilayah Jakarta: ' + error.message, 'error');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
