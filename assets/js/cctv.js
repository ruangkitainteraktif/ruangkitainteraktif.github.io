  const CCTV_DATA_URL = 'assets/data/cctv_updated.geojson';
  const CCTV_MARKER_LIMIT = 250;
  const TOLL_ROAD_URL = 'assets/data/jalan_tol.geojson';
  let cctvData = [];
  let cctvLoaded = false;
  let cctvHls = null;
  let cctvVideoJs = null;
  let tollRoadLayer = null;
  let tollRoadLoaded = false;

  function getCctvFiltered() {
    const area = document.getElementById('cctvAreaFilter').value;
    const query = normalizeWeatherSearch(document.getElementById('cctvSearchInput').value);
    return cctvData.filter(item => (!area || item.area === area) && (!query || item.searchText.includes(query)));
  }

  function drawCctvMarkers(items) {
    cctvMarkersGroup.clearLayers();
    const markerItems = items.slice(0, CCTV_MARKER_LIMIT);
    markerItems.forEach(item => {
      const icon = L.divIcon({ className: 'cctv-leaflet-icon', html: '<div class="cctv-map-icon"><img src="https://cdn-icons-png.flaticon.com/512/2709/2709318.png" alt="CCTV"></div>', iconSize: [40, 40], iconAnchor: [20, 20], popupAnchor: [0, -20] });
      L.marker([item.lat, item.lon], { icon, title: item.name })
        .bindPopup(`<div class="cctv-popup"><div class="cctv-popup-label"></div><strong>${escapeBMKGHTML(item.name)}</strong><span>${escapeBMKGHTML(item.area)}</span><button type="button" onclick="openCctvModal('${escapeBMKGHTML(item.id)}')">▶ Buka tayangan</button></div>`, { maxWidth: 260, className: 'cctv-leaflet-popup' })
        .on('click', () => map.flyTo([item.lat, item.lon], 16, { duration: .45 }))
        .addTo(cctvMarkersGroup);
    });
    return markerItems.length;
  }

  function renderCctvList() {
    const status = document.getElementById('cctvStatus');
    const results = document.getElementById('cctvResults');
    const area = document.getElementById('cctvAreaFilter').value;
    const items = getCctvFiltered();
    if (!area && !document.getElementById('cctvSearchInput').value.trim()) {
      cctvMarkersGroup.clearLayers();
      status.textContent = 'Pilih area untuk menampilkan cctv pada peta.';
      results.replaceChildren();
      return;
    }
    const markerCount = drawCctvMarkers(items);
    status.textContent = `${items.length} CCTV ditemukan · ${markerCount} marker ditampilkan di peta${items.length > markerCount ? ' (dibatasi untuk performa)' : ''}.`;
    results.replaceChildren(...items.slice(0, 50).map(item => {
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'cctv-card';
      card.innerHTML = `<strong>${escapeBMKGHTML(item.name)}</strong><small>${escapeBMKGHTML(item.area)}</small>`;
      card.addEventListener('click', () => { map.flyTo([item.lat, item.lon], 16, { duration: .5 }); openCctvModal(item.id); });
      return card;
    }));
  }

  function renderCctvAutocomplete() {
    const input = document.getElementById('cctvSearchInput');
    const list = document.getElementById('cctvAutocomplete');
    const query = normalizeWeatherSearch(input.value);
    if (query.length < 2) { list.style.display = 'none'; return; }
    const matches = [];
    for (const item of cctvData) { if (item.searchText.includes(query)) { matches.push(item); if (matches.length === 8) break; } }
    list.replaceChildren(...matches.map(item => {
      const option = document.createElement('button'); option.type = 'button'; option.textContent = `${item.name} — ${item.area}`;
      option.addEventListener('click', () => { input.value = item.name; document.getElementById('cctvAreaFilter').value = item.area; list.style.display = 'none'; renderCctvList(); });
      return option;
    }));
    list.style.display = matches.length ? 'block' : 'none';
  }

  async function loadCctvData() {
    if (cctvLoaded) return;
    const status = document.getElementById('cctvStatus');
    status.textContent = 'Memuat data CCTV...';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(CCTV_DATA_URL, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const geojson = await response.json();
      cctvData = (geojson.features || []).map(feature => ({
        id: String(feature.properties?.id || crypto.randomUUID()), name: feature.properties?.name || 'CCTV', area: feature.properties?.area || 'Tanpa area',
        mode: feature.properties?.mode || 'embed', url: feature.properties?.url || '', lon: Number(feature.geometry?.coordinates?.[0]), lat: Number(feature.geometry?.coordinates?.[1])
      })).filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lon) && item.url).map(item => ({ ...item, searchText: normalizeWeatherSearch(`${item.name} ${item.area} ${item.mode}`) }));
      const areas = [...new Set(cctvData.map(item => item.area))].sort((a, b) => a.localeCompare(b, 'id'));
      const areaSelect = document.getElementById('cctvAreaFilter');
      areaSelect.append(...areas.map(area => new Option(area, area)));
      cctvLoaded = true;
      status.textContent = `${cctvData.length} data cctv ditemukan.`;
    } catch (error) {
      console.error('Gagal memuat CCTV:', error);
      status.textContent = 'Gagal memuat data CCTV.';
    }
  }

  function closeCctvModal() {
    document.getElementById('cctvModal').classList.remove('open');
    document.querySelectorAll('.cctv-player').forEach(player => player.classList.remove('active'));
    document.getElementById('cctvIframePlayer').src = 'about:blank';
    document.getElementById('cctvImagePlayer').removeAttribute('src');
    if (cctvHls) { cctvHls.destroy(); cctvHls = null; }
    if (cctvVideoJs) cctvVideoJs.pause();
  }

  function openCctvModal(id) {
    const item = cctvData.find(camera => camera.id === String(id));
    if (!item) return;
    closeCctvModal();
    const modal = document.getElementById('cctvModal');
    const iframe = document.getElementById('cctvIframePlayer');
    const video = document.getElementById('cctvVideoPlayer');
    const image = document.getElementById('cctvImagePlayer');
    document.getElementById('cctvModalTitle').textContent = `${item.name} · ${item.area}`;
    if (item.mode === 'iframe') { iframe.src = item.url; iframe.classList.add('active'); }
    else if (item.mode === 'img' || /\.(jpe?g|png|webp)(\?|$)/i.test(item.url)) { image.src = item.url; image.classList.add('active'); }
    else {
      video.classList.add('active');
      if (window.videojs && !cctvVideoJs) cctvVideoJs = window.videojs(video, { controls: true, autoplay: true, muted: true, fluid: true });
      const media = cctvVideoJs ? (cctvVideoJs.el().querySelector('video') || video) : video;
      if (window.Hls?.isSupported()) { cctvHls = new Hls(); cctvHls.loadSource(item.url); cctvHls.attachMedia(media); }
      else { media.src = item.url; media.play().catch(() => {}); }
    }
    modal.classList.add('open');
  }

  document.getElementById('cctvAreaFilter').addEventListener('change', renderCctvList);
  document.getElementById('cctvSearchInput').addEventListener('input', () => { renderCctvAutocomplete(); renderCctvList(); });

  // Toggle Jalan Tol Layer
  document.getElementById('toggleTollRoad').addEventListener('change', async function() {
    if (this.checked) {
      if (!tollRoadLoaded) {
        try {
          const response = await fetch(TOLL_ROAD_URL);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const geojson = await response.json();
          tollRoadLayer = L.geoJSON(geojson, {
            style: {
              color: '#e67e22',
              weight: 3,
              opacity: 0.85,
              dashArray: '8 4',
              lineCap: 'round'
            },
            onEachFeature: function(feature, layer) {
              const props = feature.properties || {};
              const name = props.NAMA || props.NAME || props.nama || 'Jalan Tol';
              const status = props.STATUS || props.status || '';
              const info = status ? `${name} (${status})` : name;
              layer.bindTooltip(info, { sticky: true, className: 'toll-road-tooltip' });
            }
          }).addTo(map);
          tollRoadLoaded = true;
        } catch (err) {
          console.error('Gagal memuat data jalan tol:', err);
          this.checked = false;
        }
      } else if (tollRoadLayer) {
        tollRoadLayer.addTo(map);
      }
    } else if (tollRoadLayer) {
      map.removeLayer(tollRoadLayer);
    }
  });

  // Toggle Jalan Non Tol Layer (ArcGIS REST Service)
  const NON_TOLL_URL = 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SARANA_PRASARANA/MapServer/13';
  let nonTollRoadLayer = null;
  let nonTollLoaded = false;

  document.getElementById('toggleNonTollRoad').addEventListener('change', async function() {
    if (this.checked) {
      if (!nonTollLoaded) {
        try {
          const query = L.esri.query({ url: NON_TOLL_URL });
          query.returnGeometry(true);
          query.outFields = '*';
          query.where('1=1');
          const featureCollection = await new Promise((resolve, reject) => {
            query.run((error, result) => {
              if (error) reject(error);
              else resolve(result);
            });
          });
          if (!featureCollection || !featureCollection.features.length) {
            console.warn('Jalan non tol: tidak ada data');
            return;
          }
          nonTollRoadLayer = L.geoJSON(featureCollection, {
            style: {
              color: '#2ecc71',
              weight: 2,
              opacity: 0.8
            },
            onEachFeature: function(feature, layer) {
              const props = feature.properties || {};
              const name = props.NAMA || props.NAME || props.nama || props.REMARK || 'Jalan';
              layer.bindTooltip(String(name), { sticky: true, className: 'toll-road-tooltip' });
            }
          }).addTo(map);
          nonTollLoaded = true;
        } catch (err) {
          console.error('Gagal memuat data jalan non tol:', err);
          this.checked = false;
        }
      } else if (nonTollRoadLayer) {
        nonTollRoadLayer.addTo(map);
      }
    } else if (nonTollRoadLayer) {
      map.removeLayer(nonTollRoadLayer);
    }
  });

  // Toggle Jalan Nasional Layer (lokal GeoJSON)
  const NATIONAL_ROAD_URL = 'assets/data/jalan_nasional.geojson';
  let nationalRoadLayer = null;
  let nationalRoadLoaded = false;

  document.getElementById('toggleNationalRoad').addEventListener('change', async function() {
    if (this.checked) {
      if (!nationalRoadLoaded) {
        try {
          const response = await fetch(NATIONAL_ROAD_URL);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const geojson = await response.json();
          nationalRoadLayer = L.geoJSON(geojson, {
            style: {
              color: '#e74c3c',
              weight: 2.5,
              opacity: 0.85
            },
            onEachFeature: function(feature, layer) {
              const props = feature.properties || {};
              const name = props.NAMA || props.NAME || props.nama || 'Jalan Nasional';
              layer.bindTooltip(String(name), { sticky: true, className: 'toll-road-tooltip' });
            }
          }).addTo(map);
          nationalRoadLoaded = true;
        } catch (err) {
          console.error('Gagal memuat data jalan nasional:', err);
          this.checked = false;
        }
      } else if (nationalRoadLayer) {
        nationalRoadLayer.addTo(map);
      }
    } else if (nationalRoadLayer) {
      map.removeLayer(nationalRoadLayer);
    }
  });
