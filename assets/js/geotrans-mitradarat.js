(() => {
  'use strict';

  const DATA_URL = 'assets/data/mitradarat.json';
  const MARKER_LIMIT = 5000;
  const panel = document.getElementById('geotoolsTabGeoTrans');
  const searchInput = document.getElementById('geotransSearch');
  const categorySelect = document.getElementById('geotransCategory');
  const operatorSelect = document.getElementById('geotransOperator');
  const status = document.getElementById('geotransStatus');
  const results = document.getElementById('geotransResults');
  const routeDetail = document.getElementById('geotransRouteDetail');
  const routeDialog = document.getElementById('geotransRouteDialog');
  const reset = document.getElementById('geotransReset');
  const layerToggles = [...document.querySelectorAll('[data-geotrans-layer]')];
  const routeCount = document.getElementById('geotransRouteCount');
  const stopCount = document.getElementById('geotransStopCount');
  const operatorCount = document.getElementById('geotransOperatorCount');
  const dataStamp = document.getElementById('geotransDataStamp');
  const resultsTitle = document.getElementById('geotransResultsTitle');
  const resultsHint = document.getElementById('geotransResultsHint');
  const showAllButton = document.getElementById('geotransShowAll');
  if (!panel || !searchInput || !categorySelect || !operatorSelect || !status || !results || !routeDetail || !routeDialog || !window.map || !window.L) return;

  let records = [];
  let loaded = false;
  let loading = null;
  let hasFittedMap = false;
  let overviewMode = true;
  let focusedFeatureKey = null;
  const stopLayer = L.markerClusterGroup({
    maxClusterRadius: 45,
    disableClusteringAtZoom: 14,
    showCoverageOnHover: false,
    chunkedLoading: true
  });
  const operatorLayer = L.layerGroup();
  const routeLayer = L.layerGroup();
  const stopIcon = L.divIcon({
    className: 'geotrans-stop-icon-wrap',
    html: '<span class="geotrans-stop-pin"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V7h14v13M3 7h18L19 3H5L3 7Zm5 3h3v3H8zm5 0h3v3h-3zM7 16h10M2 21h20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 10h3v3H8zm5 0h3v3h-3z" fill="currentColor" stroke="none"/></svg></span>',
    iconSize: [32, 38],
    iconAnchor: [16, 34],
    popupAnchor: [0, -30]
  });

  function normalize(value) {
    return String(value == null ? '' : value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function objectEntries(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.cities)) {
      const cityByPref = new Map(payload.cities.map(item => [String(item.pref), item.name]));
      const stopById = new Map(Object.values(payload.stops || {}).map(item => [String(item.id), item]));
      const stopOperator = new Map();
      (Array.isArray(payload.routes) ? payload.routes : []).forEach(route => {
        (route.stopIds || []).forEach(id => stopOperator.set(String(id), route.cityName));
      });
      const cities = payload.cities.map(item => ({ ...item, _kind: 'operator', _operator: item.name, area: item.city }));
      const routes = (Array.isArray(payload.routes) ? payload.routes : []).map(item => {
        const shape = Array.isArray(item.shape) ? item.shape : [];
        const points = shape.map(coordinatePair).filter(Boolean);
        const center = points.length ? points.reduce((acc, point) => ({ lat: acc.lat + point.lat / points.length, lon: acc.lon + point.lon / points.length }), { lat: 0, lon: 0 }) : {};
        const stopSequence = (item.stopIds || []).map((id, index) => {
          const stop = stopById.get(String(id));
          return stop ? { id: String(stop.id), name: stop.name || `Halte ${id}`, lat: number(stop.lat), lon: number(stop.lng), corridors: stop.corridors || [], order: index + 1 } : null;
        }).filter(Boolean);
        return { ...item, ...center, _kind: 'route', _operator: item.cityName, area: item.cityName, shape, _stopSequence: stopSequence };
      });
      const stops = payload.stops && typeof payload.stops === 'object'
        ? Object.values(payload.stops).map(item => ({ ...item, _kind: 'stop', _operator: stopOperator.get(String(item.id)) || cityByPref.get(String(item.pref)) || '', area: stopOperator.get(String(item.id)) || cityByPref.get(String(item.pref)) || '' }))
        : [];
      return [...cities, ...routes, ...stops];
    }
    if (payload && Array.isArray(payload.features)) return payload.features;
    if (payload && Array.isArray(payload.data)) return payload.data;
    if (payload && Array.isArray(payload.results)) return payload.results;
    if (payload && Array.isArray(payload.items)) return payload.items;
    if (payload && Array.isArray(payload.records)) return payload.records;
    return [];
  }

  function parsePayload(payload) {
    const normalized = objectEntries(payload).map(normalizeRecord).filter(Boolean);
    if (!normalized.length) throw new Error('Data kosong');
    return normalized;
  }

  function number(value) {
    if (typeof value === 'string') value = value.trim().replace(',', '.');
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function coordinatePair(value) {
    if (Array.isArray(value) && value.length >= 2) {
      const first = number(value[0]);
      const second = number(value[1]);
      if (Math.abs(first) <= 180 && Math.abs(second) <= 90) return { lon: first, lat: second };
    }
    if (typeof value === 'string') {
      const parts = value.split(/[;,\s]+/).map(number);
      if (parts.length >= 2 && Math.abs(parts[0]) <= 180 && Math.abs(parts[1]) <= 90) return { lon: parts[0], lat: parts[1] };
    }
    return null;
  }

  function normalizeRecord(source, index) {
    const feature = source && typeof source === 'object' ? source : {};
    const props = feature.properties && typeof feature.properties === 'object' ? feature.properties : feature;
    let lat = number(props.latitude ?? props.lat ?? props.latitud ?? props.koordinat_latitude ?? props.y);
    let lon = number(props.longitude ?? props.lon ?? props.lng ?? props.long ?? props.koordinat_longitude ?? props.x);
    let pair = null;
    if ((!Number.isFinite(lat) || !Number.isFinite(lon)) && feature.geometry) {
      pair = coordinatePair(feature.geometry.coordinates);
      if (pair) ({ lat, lon } = pair);
    }
    if ((!Number.isFinite(lat) || !Number.isFinite(lon))) {
      for (const key of ['coordinate', 'coordinates', 'location', 'lokasi', 'point', 'koordinat']) {
        pair = coordinatePair(props[key]);
        if (pair) { ({ lat, lon } = pair); break; }
      }
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

    const shape = Array.isArray(props.shape) ? props.shape.map(coordinatePair).filter(Boolean) : [];
    const kind = props._kind || 'location';
    const name = String(props.nama ?? props.name ?? props.fullName ?? props.nama_lokasi ?? props.nama_fasilitas ?? props.nama_terminal ?? props.nama_perusahaan ?? props.title ?? props.label ?? `Lokasi transportasi ${index + 1}`).trim();
    const category = kind === 'location' ? String(props.kategori ?? props.category ?? props.jenis ?? props.type ?? props.tipe ?? props.grup ?? props.group ?? props.kelas ?? 'Lainnya').trim() || 'Lainnya' : kind;
    const area = String(props.area ?? props.kabupaten_kota ?? props.kabupaten ?? props.kota ?? props.city ?? props.cityName ?? props.kab_kota ?? props.wilayah ?? props.kecamatan ?? props.provinsi ?? props.province ?? '').trim();
    const details = Object.entries(props).filter(([key, value]) => value != null && value !== '' && !/^(lat|latitude|lon|lng|long|longitude|x|y|coordinates|coordinate|geometry|shape|stopIds|_?stopSequence)$/i.test(key)).slice(0, 12);
    const searchText = normalize([name, category, area, ...details.flatMap(([key, value]) => [key, value])].join(' '));
    return { id: String(props.id ?? index), name, category, kind, operator: String(props._operator ?? props.cityName ?? ''), area, lat, lon, shape, stopSequence: props._stopSequence || [], color: props.color, details, properties: props, searchText };
  }

  function getFiltered() {
    const query = normalize(searchInput.value);
    const category = categorySelect.value;
    const operator = operatorSelect.value;
    return records.filter(item => (!category || item.kind === category) && (!operator || item.operator === operator) && (!query || item.searchText.includes(query)));
  }

  function isLayerEnabled(kind) {
    const toggle = layerToggles.find(input => input.dataset.geotransLayer === kind);
    return !toggle || toggle.checked;
  }

  function getVisibleBounds() {
    const bounds = L.latLngBounds();
    if (isLayerEnabled('route')) routeLayer.eachLayer(line => bounds.extend(line.getBounds()));
    if (isLayerEnabled('stop') && stopLayer.getBounds().isValid()) bounds.extend(stopLayer.getBounds());
    if (isLayerEnabled('operator')) operatorLayer.eachLayer(marker => bounds.extend(marker.getLatLng()));
    return bounds;
  }

  function fitVisibleLayers() {
    const bounds = getVisibleBounds();
    if (bounds.isValid()) {
      window.map.closePopup();
      window.map.flyToBounds(bounds, { padding: [22, 22], maxZoom: 15, duration: 0.65 });
    }
  }

  function popupContent(item) {
    return `<div class="geotrans-popup"><strong>${escapeHtml(item.name)}</strong></div>`;
  }

  function hideRouteDetail() {
    if (routeDialog.open) routeDialog.close();
    routeDetail.hidden = true;
    routeDetail.replaceChildren();
  }

  function showRouteDetail(item) {
    if (item.kind !== 'route') { hideRouteDetail(); return; }
    const props = item.properties;
    const stops = item.stopSequence;
    const panel = document.createDocumentFragment();
    const heading = document.createElement('div');
    heading.className = 'geotrans-detail-heading';
    const titleWrap = document.createElement('div');
    const eyebrow = document.createElement('small');
    eyebrow.textContent = `${item.operator} · ${props.shortName || 'Rute'}`;
    const title = document.createElement('strong');
    title.textContent = item.name;
    titleWrap.append(eyebrow, title);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'geotrans-detail-close';
    close.setAttribute('aria-label', 'Tutup detail rute');
    close.textContent = '×';
    close.addEventListener('click', hideRouteDetail);
    heading.append(titleWrap, close);
    panel.append(heading);

    const facts = document.createElement('div');
    facts.className = 'geotrans-route-facts';
    [
      ['Arah', `${props.origin || 'Awal rute'} → ${props.toward || 'Akhir rute'}`],
      ['Jam layanan', props.operatingHours || 'Belum tersedia'],
      ['Status', typeof props.isOperating === 'boolean' ? (props.isOperating ? 'Beroperasi' : 'Tidak beroperasi') : 'Informasi tidak tersedia'],
      ['Jumlah halte', `${stops.length} halte`]
    ].forEach(([label, value]) => {
      const fact = document.createElement('div');
      const key = document.createElement('small');
      key.textContent = label;
      const val = document.createElement('b');
      val.textContent = value;
      fact.append(key, val);
      facts.append(fact);
    });
    panel.append(facts);

    const diagramTitle = document.createElement('h5');
    diagramTitle.className = 'geotrans-detail-section-title';
    diagramTitle.textContent = 'Diagram urutan halte';
    panel.append(diagramTitle);
    const diagram = document.createElement('ol');
    diagram.className = 'geotrans-stop-diagram';
    stops.forEach((stop, index) => {
      const node = document.createElement('li');
      const station = document.createElement('button');
      station.type = 'button';
      station.className = 'geotrans-stop-node';
      station.title = `Lihat ${stop.name} di peta`;
      const number = document.createElement('i');
      number.textContent = String(index + 1);
      const name = document.createElement('span');
      name.textContent = stop.name;
      const endpoint = document.createElement('small');
      endpoint.textContent = index === 0 ? 'Awal' : index === stops.length - 1 ? 'Akhir' : '';
      station.append(number, name, endpoint);
      station.addEventListener('click', () => {
        window.map.closePopup();
        window.map.flyTo([stop.lat, stop.lon], 17, { duration: 0.5 });
      });
      node.append(station);
      diagram.append(node);
    });
    if (!stops.length) {
      const empty = document.createElement('li');
      empty.className = 'geotrans-detail-empty';
      empty.textContent = 'Urutan halte tidak tersedia untuk rute ini.';
      diagram.append(empty);
    }
    panel.append(diagram);

    const tableTitle = document.createElement('h5');
    tableTitle.className = 'geotrans-detail-section-title';
    tableTitle.textContent = 'Daftar halte';
    panel.append(tableTitle);
    const tableWrap = document.createElement('div');
    tableWrap.className = 'geotrans-stop-table-wrap';
    const table = document.createElement('table');
    table.className = 'geotrans-stop-table';
    table.innerHTML = '<thead><tr><th>No.</th><th>Nama halte</th><th>Kode</th><th>Koridor</th></tr></thead>';
    const tbody = document.createElement('tbody');
    stops.forEach((stop, index) => {
      const row = document.createElement('tr');
      [String(index + 1), stop.name, stop.id, stop.corridors.join(', ') || '—'].forEach(value => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      });
      tbody.append(row);
    });
    table.append(tbody);
    tableWrap.append(table);
    panel.append(tableWrap);
    routeDetail.replaceChildren(panel);
    routeDetail.hidden = false;
    if (!routeDialog.open) routeDialog.show();
  }

  routeDialog.addEventListener('click', event => {
    if (event.target === routeDialog) hideRouteDetail();
  });

  function render() {
    if (!loaded) return;
    const filtered = getFiltered();
    const shown = filtered.slice(0, MARKER_LIMIT);
    stopLayer.clearLayers();
    operatorLayer.clearLayers();
    routeLayer.clearLayers();
    shown.forEach(item => {
      const key = `${item.kind}:${item.id}`;
      if (focusedFeatureKey && key !== focusedFeatureKey) return;
      if (item.kind === 'route' && item.shape.length > 1) {
        const rawColor = String(item.color || '087f8c');
        const color = /^#[0-9a-f]{6}$/i.test(rawColor) ? rawColor : /^[0-9a-f]{6}$/i.test(rawColor) ? `#${rawColor}` : '#087f8c';
        const line = L.polyline(item.shape.map(point => [point.lat, point.lon]), {
          color, weight: 4, opacity: 0.84, lineCap: 'round', lineJoin: 'round'
        }).bindPopup(popupContent(item), { maxWidth: 340 });
        line.geotransKey = key;
        line.addTo(routeLayer);
      } else if (item.kind === 'operator' || item.kind === 'stop') {
        const marker = item.kind === 'stop'
          ? L.marker([item.lat, item.lon], { icon: stopIcon, title: item.name, alt: `Halte ${item.name}` })
          : L.circleMarker([item.lat, item.lon], { radius: 8, color: '#fff', weight: 2, fillColor: '#167448', fillOpacity: 0.96 });
        marker.bindPopup(popupContent(item), { maxWidth: 340 });
        marker.geotransKey = key;
        marker.addTo(item.kind === 'operator' ? operatorLayer : stopLayer);
      }
    });

    [[routeLayer, 'route'], [stopLayer, 'stop'], [operatorLayer, 'operator']].forEach(([layer, kind]) => {
      if (isLayerEnabled(kind) && layer.getLayers().length && !window.map.hasLayer(layer)) layer.addTo(window.map);
      if ((!isLayerEnabled(kind) || !layer.getLayers().length) && window.map.hasLayer(layer)) window.map.removeLayer(layer);
    });

    if (!hasFittedMap && shown.length) {
      const bounds = getVisibleBounds();
      if (bounds.isValid()) {
        window.map.closePopup();
        window.map.fitBounds(bounds, { padding: [18, 18], maxZoom: 15 });
        hasFittedMap = true;
      }
    }

    const counts = filtered.reduce((total, item) => { total[item.kind] = (total[item.kind] || 0) + 1; return total; }, {});
    const numberOf = value => (value || 0).toLocaleString('id-ID');
    const focusedFeature = focusedFeatureKey ? filtered.find(item => `${item.kind}:${item.id}` === focusedFeatureKey) : null;
    if (showAllButton) showAllButton.hidden = !focusedFeature;
    if (focusedFeature) {
      const focusLabel = focusedFeature.kind === 'route' ? 'rute' : focusedFeature.kind === 'stop' ? 'halte' : 'titik operator';
      status.textContent = `Peta sedang menampilkan ${focusLabel} terpilih saja.`;
      if (focusedFeature.kind === 'operator' && resultsTitle) resultsTitle.textContent = `Jaringan ${focusedFeature.name}`;
      if (resultsHint) resultsHint.textContent = focusedFeature.kind === 'operator'
        ? 'Pilih rute di daftar atau tampilkan semua hasil di peta'
        : focusedFeature.kind === 'route' ? 'Rute terpilih ditampilkan di peta' : 'Halte terpilih ditampilkan di peta';
    } else if (overviewMode && !searchInput.value.trim()) {
      status.textContent = `${numberOf(counts.operator)} operator tersedia. Pilih operator untuk melihat rute dan halte busnya.`;
      if (resultsTitle) resultsTitle.textContent = 'Operator tersedia';
      if (resultsHint) resultsHint.textContent = 'Pilih operator untuk membuka jaringannya';
    } else if (operatorSelect.value) {
      const selectedKind = categorySelect.value;
      const categoryName = selectedKind === 'route' ? 'rute' : selectedKind === 'stop' ? 'halte' : selectedKind === 'operator' ? 'operator' : '';
      if (categoryName) {
        status.textContent = `${numberOf(filtered.length)} ${categoryName} ditemukan untuk ${operatorSelect.value}.`;
        if (resultsTitle) resultsTitle.textContent = `${categoryName[0].toUpperCase()}${categoryName.slice(1)} ${operatorSelect.value}`;
        if (resultsHint) resultsHint.textContent = selectedKind === 'route' ? 'Pilih rute untuk melihat urutan halte' : selectedKind === 'stop' ? 'Pilih halte untuk melihat lokasinya' : 'Pilih operator untuk membuka jaringannya';
      } else {
        status.textContent = `${operatorSelect.value}: ${numberOf(counts.route)} rute dan ${numberOf(counts.stop)} halte tersedia.`;
        if (resultsTitle) resultsTitle.textContent = `Jaringan ${operatorSelect.value}`;
        if (resultsHint) resultsHint.textContent = 'Pilih rute untuk melihat urutan halte';
      }
    } else {
      const selectedLabel = categorySelect.value === 'route' ? 'rute' : categorySelect.value === 'stop' ? 'halte' : categorySelect.value === 'operator' ? 'operator' : 'hasil';
      status.textContent = `${numberOf(filtered.length)} ${selectedLabel} ditemukan${filtered.length > 50 ? '. Daftar menampilkan 50 hasil pertama.' : '.'}`;
      if (resultsTitle) resultsTitle.textContent = categorySelect.value ? `Daftar ${selectedLabel}` : 'Hasil pencarian';
      if (resultsHint) resultsHint.textContent = categorySelect.value === 'route' ? 'Pilih rute untuk melihat urutan halte' : categorySelect.value === 'stop' ? 'Pilih halte untuk melihat lokasinya' : 'Pilih operator untuk membuka rute dan halte';
    }
    const tableWrap = document.createElement('div');
    tableWrap.className = 'geotrans-table-wrap';
    const table = document.createElement('table');
    table.className = 'geotrans-table';
    table.setAttribute('aria-label', 'Daftar operator, rute, dan halte bus');
    table.innerHTML = '<thead><tr><th scope="col">Jenis</th><th scope="col">Nama jaringan</th><th scope="col">Informasi</th></tr></thead>';
    const tbody = document.createElement('tbody');
    filtered.slice(0, 50).forEach(item => {
      const row = document.createElement('tr');
      const key = `${item.kind}:${item.id}`;
      row.className = `geotrans-table-row geotrans-table-${item.kind}${focusedFeatureKey === key ? ' is-selected' : ''}`;
      row.tabIndex = 0;

      const typeCell = document.createElement('td');
      typeCell.className = 'geotrans-table-type-cell';
      const type = document.createElement('span');
      type.className = `geotrans-table-type geotrans-table-type-${item.kind}`;
      type.textContent = item.kind === 'route' ? 'Rute' : item.kind === 'stop' ? 'Halte' : 'Operator';
      typeCell.append(type);

      const nameCell = document.createElement('td');
      nameCell.className = 'geotrans-table-name-cell';
      const name = document.createElement('b');
      name.textContent = item.name;
      const description = document.createElement('small');
      if (item.kind === 'route') {
        const direction = [item.properties.origin, item.properties.toward].filter(Boolean).join(' to ');
        description.textContent = [item.properties.shortName, item.operator, direction].filter(Boolean).join(' · ');
      } else if (item.kind === 'stop') {
        description.textContent = item.operator || 'Operator tidak diketahui';
      } else {
        description.textContent = item.area || 'Wilayah layanan';
      }
      nameCell.append(name, description);

      const infoCell = document.createElement('td');
      infoCell.className = 'geotrans-table-info-cell';
      const info = document.createElement('b');
      const infoDescription = document.createElement('small');
      if (item.kind === 'route') {
        info.textContent = item.properties.operatingHours || 'Jam belum tersedia';
        infoDescription.textContent = typeof item.properties.isOperating === 'boolean'
          ? (item.properties.isOperating ? 'Beroperasi' : 'Tidak beroperasi')
          : 'Jam layanan';
      } else if (item.kind === 'stop') {
        info.textContent = `${(item.properties.corridors || []).length} koridor`;
        infoDescription.textContent = 'Melayani halte';
      } else {
        info.textContent = 'Operator bus';
        infoDescription.textContent = item.properties.city || item.area || 'Wilayah layanan';
      }
      infoCell.append(info, infoDescription);
      row.append(typeCell, nameCell, infoCell);

      const selectItem = () => {
        if (item.kind === 'operator') {
          focusedFeatureKey = `operator:${item.id}`;
          overviewMode = false;
          operatorSelect.value = item.operator;
          categorySelect.value = '';
          layerToggles.forEach(input => { input.checked = true; });
          hideRouteDetail();
          render();
          window.map.flyTo([item.lat, item.lon], 13, { duration: 0.5 });
          return;
        }
        focusedFeatureKey = key;
        showRouteDetail(item);
        const toggle = layerToggles.find(input => input.dataset.geotransLayer === item.kind);
        if (toggle && !toggle.checked) toggle.checked = true;
        render();
        if (item.kind === 'route' && item.shape.length > 1) {
          const line = routeLayer.getLayers().find(layer => layer.geotransKey === key);
          if (line) window.map.fitBounds(line.getBounds(), { padding: [30, 30], maxZoom: 15 });
        } else {
          window.map.flyTo([item.lat, item.lon], 16, { duration: 0.5 });
        }
      };
      row.addEventListener('click', selectItem);
      row.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectItem();
        }
      });
      tbody.append(row);
    });
    if (!filtered.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 3;
      cell.className = 'geotrans-table-empty';
      cell.textContent = 'Belum ada informasi yang cocok. Coba kata kunci atau kategori lain.';
      row.append(cell);
      tbody.append(row);
    }
    table.append(tbody);
    tableWrap.append(table);
    results.replaceChildren(tableWrap);
  }

  function load() {
    if (loaded) { render(); return Promise.resolve(); }
    if (loading) return loading;
    status.textContent = 'Memuat data transportasi...';
    loading = fetch(DATA_URL, { cache: 'no-cache' }).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }).then(payload => {
      records = parsePayload(payload);
      if (dataStamp && payload.fetchedAt) {
        const date = new Date(payload.fetchedAt);
        dataStamp.textContent = Number.isNaN(date.getTime()) ? 'Data lokal' : `Data lokal · diperbarui ${date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`;
      }
      const operators = [...new Set(records.filter(item => item.kind === 'operator').map(item => item.name))].sort((a, b) => a.localeCompare(b, 'id'));
      operatorSelect.replaceChildren(new Option('Semua operator', ''), ...operators.map(value => new Option(value, value)));
      operatorSelect.value = '';
      categorySelect.value = 'operator';
      layerToggles.forEach(toggle => { toggle.checked = toggle.dataset.geotransLayer === 'operator'; });
      if (routeCount) routeCount.textContent = records.filter(item => item.kind === 'route').length.toLocaleString('id-ID');
      if (stopCount) stopCount.textContent = records.filter(item => item.kind === 'stop').length.toLocaleString('id-ID');
      if (operatorCount) operatorCount.textContent = operators.length.toLocaleString('id-ID');
      loaded = true;
      render();
    }).catch(() => {
      status.textContent = 'Data transportasi belum bisa ditampilkan. Coba muat ulang halaman beberapa saat lagi.';
      throw new Error('Data transportasi gagal dimuat');
    }).finally(() => { loading = null; });
    return loading;
  }

  searchInput.addEventListener('input', () => {
    if (overviewMode && searchInput.value.trim()) {
      overviewMode = false;
      categorySelect.value = '';
      layerToggles.forEach(toggle => { toggle.checked = true; });
    }
    focusedFeatureKey = null;
    hideRouteDetail();
    render();
  });
  categorySelect.addEventListener('change', () => {
    overviewMode = false;
    focusedFeatureKey = null;
    const selectedKind = categorySelect.value;
    layerToggles.forEach(toggle => {
      toggle.checked = selectedKind ? toggle.dataset.geotransLayer === selectedKind : true;
    });
    hideRouteDetail();
    render();
    if (operatorSelect.value) fitVisibleLayers();
  });
  operatorSelect.addEventListener('change', () => {
    const selectedOperator = Boolean(operatorSelect.value);
    overviewMode = !selectedOperator;
    focusedFeatureKey = null;
    categorySelect.value = selectedOperator ? '' : 'operator';
    layerToggles.forEach(toggle => {
      toggle.checked = selectedOperator || toggle.dataset.geotransLayer === 'operator';
    });
    hideRouteDetail();
    render();
    fitVisibleLayers();
  });
  layerToggles.forEach(toggle => toggle.addEventListener('change', () => {
    overviewMode = false;
    focusedFeatureKey = null;
    if (toggle.checked && categorySelect.value && categorySelect.value !== toggle.dataset.geotransLayer) categorySelect.value = '';
    render();
  }));
  function resetFiltersAndLayers() {
    searchInput.value = '';
    categorySelect.value = 'operator';
    operatorSelect.value = '';
    overviewMode = true;
    focusedFeatureKey = null;
    if (showAllButton) showAllButton.hidden = true;
    layerToggles.forEach(toggle => { toggle.checked = toggle.dataset.geotransLayer === 'operator'; });
    hideRouteDetail();
    if (loaded) render();
    else {
      results.replaceChildren();
      status.textContent = 'Memuat ulang informasi transportasi...';
      load().catch(() => {});
    }
  }
  reset.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    resetFiltersAndLayers();
  });
  if (showAllButton) showAllButton.addEventListener('click', () => {
    focusedFeatureKey = null;
    render();
    fitVisibleLayers();
  });
  window.loadMitraDarat = load;
  window.resetMitraDaratLayer = resetFiltersAndLayers;
})();
