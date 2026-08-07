const WILAYAH_API_BASE = 'https://wilayah.web.id/api';
const WILAYAH_LOCAL_DATA_URL = 'assets/data/kode_wilayah.json';

const GEOID_PROVINCE_FALLBACK = [
  ['11', 'Aceh'], ['12', 'Sumatera Utara'], ['13', 'Sumatera Barat'], ['14', 'Riau'], ['15', 'Jambi'], ['16', 'Sumatera Selatan'], ['17', 'Bengkulu'], ['18', 'Lampung'], ['19', 'Kepulauan Bangka Belitung'], ['21', 'Kepulauan Riau'],
  ['31', 'DKI Jakarta'], ['32', 'Jawa Barat'], ['33', 'Jawa Tengah'], ['34', 'DI Yogyakarta'], ['35', 'Jawa Timur'], ['36', 'Banten'],
  ['51', 'Bali'], ['52', 'Nusa Tenggara Barat'], ['53', 'Nusa Tenggara Timur'], ['61', 'Kalimantan Barat'], ['62', 'Kalimantan Tengah'], ['63', 'Kalimantan Selatan'], ['64', 'Kalimantan Timur'], ['65', 'Kalimantan Utara'],
  ['71', 'Sulawesi Utara'], ['72', 'Sulawesi Tengah'], ['73', 'Sulawesi Selatan'], ['74', 'Sulawesi Tenggara'], ['75', 'Gorontalo'], ['76', 'Sulawesi Barat'], ['81', 'Maluku'], ['82', 'Maluku Utara'],
  ['91', 'Papua Barat'], ['92', 'Papua'], ['93', 'Papua Selatan'], ['94', 'Papua Tengah'], ['95', 'Papua Pegunungan'], ['96', 'Papua Barat Daya']
].map(([code, name]) => ({ code, name }));

let geoidSelectedProvince = null;
let geoidSelectedRegency = null;
let geoidSelectedDistrict = null;
let geoidWilayahDataPromise = null;
let geoidBoundaryLayer = null;
let geoidBoundaryRequestId = 0;

async function getGeoidWilayahData() {
  if (!geoidWilayahDataPromise) {
    geoidWilayahDataPromise = fetch(WILAYAH_LOCAL_DATA_URL)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => {
        if (!Array.isArray(data)) throw new Error('Format kode_wilayah.json tidak valid');
        return data.filter(item => item && typeof item.kode === 'string' && item.nama);
      });
  }
  return geoidWilayahDataPromise;
}

function getWilayahChildren(data, parentCode, depth) {
  const prefix = parentCode ? `${parentCode}.` : '';
  return data.filter(item => item.kode.startsWith(prefix) && item.kode.split('.').length === depth);
}

function escapeGeoidHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
}

function getGeoidSelection() {
  const fields = [
    ['pilihDesa', 'desa'],
    ['pilihKecamatan', 'kecamatan'],
    ['pilihKabupaten', 'kabkota'],
    ['pilihProvinsi', 'provinsi']
  ];

  const result = {};
  fields.forEach(([id, key]) => {
    const select = document.getElementById(id);
    const option = select && select.options[select.selectedIndex];
    if (option && option.value) result[key] = option.dataset.name || option.textContent.trim();
  });
  return result;
}

function updateApplyWilayahButton() {
  const btn = document.getElementById('applyWilayah');
  if (!btn) return;

  const selection = getGeoidSelection();
  btn.disabled = !Object.keys(selection).length;
  btn.textContent = 'Cari Wilayah';
}

function resetGeoidSelect(select, placeholder, disabled = true) {
  select.innerHTML = `<option value="">${placeholder}</option>`;
  select.disabled = disabled;
}

function renderGeoidProvinces(provinces) {
  const select = document.getElementById('pilihProvinsi');
  if (!select) {
    console.error('pilihProvinsi element not found');
    return;
  }

  select.innerHTML = '<option value="">Pilih Provinsi</option>';
  provinces.forEach(province => {
    const option = document.createElement('option');
    option.value = province.code;
    option.textContent = province.name;
    option.dataset.name = province.name;
    option.dataset.regenciesUrl = province.regencies_url;
    select.appendChild(option);
  });
}

async function loadGeoidProvinces() {
  const select = document.getElementById('pilihProvinsi');
  if (select) select.innerHTML = '<option value="">Memuat provinsi...</option>';

  try {
    const data = await getGeoidWilayahData();
    const provinces = getWilayahChildren(data, '', 1)
      .map(item => ({ code: item.kode, name: item.nama }));
    if (!provinces.length) throw new Error('Data provinsi tidak ditemukan');
    renderGeoidProvinces(provinces);
  } catch (err) {
    console.warn('kode_wilayah.json tidak dapat dimuat; memakai data cadangan:', err);
    renderGeoidProvinces(GEOID_PROVINCE_FALLBACK);
  }
}

async function loadGeoidRegencies(provinceCode) {
  try {
    const data = await getGeoidWilayahData();
    const regencies = getWilayahChildren(data, provinceCode, 2);

    const select = document.getElementById('pilihKabupaten');
    if (!select) return;

    select.innerHTML = '<option value="">Pilih Kabupaten/Kota</option>';
    select.disabled = false;

    regencies.forEach(regency => {
      const option = document.createElement('option');
      option.value = regency.kode;
      option.textContent = regency.nama;
      option.dataset.name = regency.nama;
      select.appendChild(option);
    });
  } catch (err) {
    console.error('Gagal memuat kabupaten:', err);
  }
}

async function loadGeoidDistricts(regencyCode) {
  try {
    const data = await getGeoidWilayahData();
    const districts = getWilayahChildren(data, regencyCode, 3);

    const select = document.getElementById('pilihKecamatan');
    if (!select) return;

    select.innerHTML = '<option value="">Pilih Kecamatan</option>';
    select.disabled = false;

    districts.forEach(district => {
      const option = document.createElement('option');
      option.value = district.kode;
      option.textContent = district.nama;
      option.dataset.name = district.nama;
      select.appendChild(option);
    });
  } catch (err) {
    console.error('Gagal memuat kecamatan:', err);
  }
}

async function loadGeoidVillages(districtCode) {
  try {
    const data = await getGeoidWilayahData();
    const villages = getWilayahChildren(data, districtCode, 4);

    const select = document.getElementById('pilihDesa');
    if (!select) return;

    select.innerHTML = '<option value="">Pilih Desa</option>';
    select.disabled = false;

    villages.forEach(village => {
      const option = document.createElement('option');
      option.value = village.kode;
      option.textContent = village.nama;
      option.dataset.code = village.kode;
      option.dataset.formattedCode = village.kode;
      option.dataset.name = village.nama;
      select.appendChild(option);
    });
  } catch (err) {
    console.error('Gagal memuat desa:', err);
  }
}

async function geocodeVillageByAdm4(adm4Code) {
  try {
    const response = await fetch(`https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${adm4Code}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const lokasi = data.lokasi || {};
    const lat = Number(lokasi.lat);
    const lon = Number(lokasi.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon, ...lokasi, weather: data.data?.[0]?.cuaca?.[0]?.[0] || null };
  } catch (err) {
    console.warn('Geocoding via BMKG gagal:', err);
    return null;
  }
}

async function geocodeAdministrativeArea(selection) {
  const hierarchy = [selection.desa, selection.kecamatan, selection.kabkota, selection.provinsi]
    .filter(Boolean)
    .join(', ');
  if (!hierarchy) return null;

  const params = new URLSearchParams({
    f: 'json',
    singleLine: `${hierarchy}, Indonesia`,
    countryCode: 'IDN',
    outFields: '*',
    maxLocations: '1'
  });
  const response = await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?${params}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  const candidate = data.candidates && data.candidates[0];
  if (!candidate || !candidate.location) return null;
  return { lat: candidate.location.y, lon: candidate.location.x };
}

async function showGeoidBoundary(kode, zoom) {
  if (typeof map === 'undefined' || !map) return;

  const requestId = ++geoidBoundaryRequestId;
  if (geoidBoundaryLayer) {
    map.removeLayer(geoidBoundaryLayer);
    geoidBoundaryLayer = null;
  }

  if (!kode) return;

  const parts = kode.split('.');
  const level = parts.length;
  const layerConfig = {
    1: { // Provinsi
      url: 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_WILAYAH/MapServer/12/query',
      field: 'KDPPUM',
      outFields: 'WADMPR,LUASWH',
      label: 'Provinsi'
    },
    2: { // Kabupaten/Kota
      url: 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/Administrasi_AR_KabKota_50K/MapServer/0/query',
      field: 'KDPKAB',
      outFields: 'WADMKK,WADMPR,LUASWH',
      label: 'Kabupaten/Kota'
    },
    3: { // Kecamatan
      url: 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/Administrasi_AR_Kecamatan_10K/MapServer/0/query',
      field: 'KDCPUM',
      outFields: 'WADMKC,WADMKK,WADMPR,LUASWH',
      label: 'Kecamatan'
    },
    4: { // Desa/Kelurahan
      url: 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/Administrasi_AR_KelDesa_10K/MapServer/0/query',
      field: 'KDEPUM',
      outFields: 'WADMKD,WADMKC,WADMKK,WADMPR,LUASWH',
      label: 'Desa/Kelurahan'
    }
  };

  const cfg = layerConfig[level];
  if (!cfg) {
    console.warn('Kode wilayah tidak valid:', kode);
    return;
  }

  const where = `${cfg.field}='${kode}'`;
  const params = new URLSearchParams({
    f: 'json',
    returnGeometry: 'true',
    spatialRel: 'esriSpatialRelIntersects',
    where,
    outFields: cfg.outFields,
    outSR: '4326'
  });
  const url = `${cfg.url}?${params}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.features || !data.features.length || requestId !== geoidBoundaryRequestId) return;

    const rings = [];
    data.features.forEach(feature => {
      if (feature.geometry && feature.geometry.rings) {
        feature.geometry.rings.forEach(ring => {
          rings.push(ring.map(([x, y]) => [y, x]));
        });
      }
    });
    if (!rings.length) return;

    const attrs = data.features[0].attributes || {};
    const getAttr = (obj, key) => {
      if (obj[key] !== undefined) return obj[key];
      const lower = key.toLowerCase();
      if (obj[lower] !== undefined) return obj[lower];
      const upper = key.toUpperCase();
      return obj[upper];
    };
    const popupFields = cfg.outFields.split(',').map(f => getAttr(attrs, f)).filter(Boolean);
    const popupText = [cfg.label, ...popupFields].join(', ');

    geoidBoundaryLayer = L.polygon(rings, {
      color: '#1267c4',
      weight: 3,
      opacity: 0.95,
      fillColor: '#38bdf8',
      fillOpacity: 0.12,
      dashArray: '7 5'
    }).addTo(map);
    geoidBoundaryLayer.bindPopup(`<div style="font-size:12px"><b>📍 Batas Wilayah</b><br>${escapeGeoidHtml(popupText)}</div>`, { maxWidth: 260 });
    geoidBoundaryLayer.bringToFront();

    const bounds = geoidBoundaryLayer.getBounds();
    if (bounds.isValid()) map.flyToBounds(bounds.pad(0.08), { maxZoom: zoom || (level === 1 ? 8 : level === 2 ? 10 : level === 3 ? 12 : 15), duration: 1 });
  } catch (err) {
    if (requestId === geoidBoundaryRequestId) {
      if (err.name === 'AbortError') {
        console.warn('Boundary wilayah timeout:', kode);
      } else {
        console.warn('Boundary wilayah tidak tersedia:', err);
      }
    }
  }
}

function showGeoidFlyup(lat, lon, info, zoom = 15) {
  if (typeof map === 'undefined' || !map) return;

  const selectedGroup = typeof selectedWeatherGroup !== 'undefined'
    ? selectedWeatherGroup
    : L.layerGroup().addTo(map);

  selectedGroup.clearLayers();

  const icon = L.divIcon({
    className: 'geoid-marker-wrap',
    html: `<div class="geoid-marker" role="img" aria-label="Lokasi wilayah terpilih"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg></div>`,
    iconSize: [48, 54], iconAnchor: [24, 52], popupAnchor: [0, -52]
  });

  const marker = L.marker([lat, lon], { icon, title: info.desa || info.name || 'Lokasi', zIndexOffset: 1000 })
    .addTo(selectedGroup);

  const title = info.desa || info.name || 'Wilayah terpilih';
  const hierarchy = [info.kecamatan, info.kabkota, info.provinsi].filter(Boolean);
  const coordStr = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  const metadata = [
    info.alamat && ['Alamat', info.alamat],
    ['Kode pos', info.postal_code || 'Belum tersedia'],
    ['Koordinat', coordStr],
    info.kode && ['Kode wilayah', info.kode]
  ].filter(Boolean);
  const popupContent = `
    <div class="geoid-popup geoid-popup-scroll">
      <div class="geoid-popup-head">
        <strong>${escapeGeoidHtml(title)}</strong>
        ${hierarchy.length ? `<span>${hierarchy.map(escapeGeoidHtml).join(' · ')}</span>` : ''}
      </div>
      <div class="geoid-popup-body">
        ${metadata.length ? `<div class="geoid-popup-meta">${metadata.map(([label, value]) => `<div><span>${escapeGeoidHtml(label)}</span><b>${escapeGeoidHtml(value)}</b></div>`).join('')}</div>` : ''}
        <div class="geoid-popup-prayer" data-prayer-schedule><span style="color:#7a8fa3; font-size:11px">Memuat jadwal sholat…</span></div>
              <div class="geoid-popup-insights" data-geoid-insights>
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px 0 10px;gap:8px;">
                  <div style="width:28px;height:28px;border:3px solid #d0dde8;border-top-color:#0879bf;border-radius:50%;animation:geoportal-spin .8s linear infinite;"></div>
                  <span style="font-size:10px;color:#7a8fa3;text-align:center;">Memuat analisis…</span>
                </div>
              </div>
      </div>
    </div>
  `;

  marker.bindPopup(popupContent, { maxWidth: 310, className: 'geoid-leaflet-popup' });
  marker.openPopup();

  map.flyTo([lat, lon], zoom, { duration: 1 });
  return marker;
}

function geoidDistanceKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function loadGeoidPopupInsights(marker, location) {
  const element = marker.getPopup()?.getElement()?.querySelector('[data-geoid-insights]');
  if (!element) return;

  try {

  let weather = location.weather;
  if (!weather && location.kode) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const wr = await fetch(`https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${location.kode}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (wr.ok) {
        const wd = await wr.json();
        weather = wd.data?.[0]?.cuaca?.[0]?.[0] || null;
      }
    } catch (_) {}
  }

  const withTimeout = (promise, ms) => {
    const timeout = new Promise(resolve => setTimeout(() => resolve(null), ms));
    return Promise.race([promise, timeout]);
  };

  const quakeRequest = withTimeout(fetch('https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json').then(r => r.ok ? r.json() : null).catch(() => null), 10000);
  const poiRequest = withTimeout(fetchNearbyPOI(location.lat, location.lon), 8000);
  const propertiRequest = withTimeout(fetchPropertiHarga(location.lat, location.lon), 10000);
  const luasRequest = location.kode ? withTimeout(fetchLuasWilayah(location.kode), 10000) : Promise.resolve(null);
  const sawahRequest = location.kode ? withTimeout(fetchLuasSawah(location.kode), 15000) : Promise.resolve(null);
  const settled = await Promise.allSettled([quakeRequest, poiRequest, propertiRequest, luasRequest, sawahRequest]);
  const results = settled.map(r => r.status === 'fulfilled' ? r.value : null);
  const [quakePayload, poiCounts, properti, luas, sawah] = results;
  const quake = quakePayload?.Infogempa?.gempa;

  let poiHtml = '<div><b>🏪 Fasilitas Sekitar</b><span>Tidak tersedia</span></div>';
  if (poiCounts && Object.keys(poiCounts).length) {
    const priority = ['hospital', 'clinic', 'pharmacy', 'school', 'university', 'bank', 'atm', 'marketplace', 'supermarket', 'convenience', 'restaurant', 'cafe', 'fuel', 'parking', 'bus_station', 'police', 'fire_station', 'place_of_worship', 'post_office'];
    const sorted = Object.entries(poiCounts).sort((a, b) => {
      const ai = priority.indexOf(a[0]);
      const bi = priority.indexOf(b[0]);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return b[1] - a[1];
    });
    const rows = sorted.slice(0, 8).map(([type, count]) => {
      const label = type.replace(/_/g, ' ');
      return `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px"><span style="color:#54708d">${escapeGeoidHtml(label)}</span><span style="font-weight:600">${count}</span></div>`;
    }).join('');
    poiHtml = `<div><b>🏪 Fasilitas Sekitar</b><div style="margin-top:4px;display:grid;gap:2px">${rows}</div></div>`;
  }

  let propertiHtml = '<div><b>🏠 Harga Properti Rata-Rata</b><span>Tidak tersedia</span></div>';
  if (properti) {
    const formatRupiah = (val) => {
      if (!val && val !== 0) return '-';
      if (val >= 1000000000) return `Rp ${(val / 1000000000).toFixed(1)} M`;
      if (val >= 1000000) return `Rp ${(val / 1000000).toFixed(1)} jt`;
      return `Rp ${val.toLocaleString('id-ID')}`;
    };
    const rows = [];
    if (properti.rumah.count > 0) {
      rows.push(`<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px"><span style="color:#54708d">Rumah (${properti.rumah.count})</span><span style="font-weight:600;color:#0b4da2">${formatRupiah(properti.rumah.avg)}</span></div>`);
    }
    if (properti.ruko.count > 0) {
      rows.push(`<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px"><span style="color:#54708d">Ruko (${properti.ruko.count})</span><span style="font-weight:600;color:#0b4da2">${formatRupiah(properti.ruko.avg)}</span></div>`);
    }
    if (rows.length) {
      propertiHtml = `<div><b>🏠 Harga Properti Rata-Rata</b><div style="margin-top:4px;display:grid;gap:2px">${rows.join('')}</div></div>`;
    }
  }

  let luasHtml = '<div><b>📐 Luas Wilayah</b><span style="font-size:10px;color:#7a8fa3">Tidak tersedia</span></div>';
  if (luas && luas.luas > 0) {
    const ha = Number(luas.luas);
    const m2 = ha * 10000;
    const km2 = ha / 100;
    const fmtNum = (n) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
    const rows = [
      `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px"><span style="color:#54708d">Luas wilayah</span><span style="font-weight:600">${fmtNum(ha)} ha</span></div>`,
      `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px"><span style="color:#54708d">Dalam ${fmtNum(m2)} m²</span><span style="font-weight:600">${fmtNum(km2)} km²</span></div>`
    ];
    luasHtml = `<div><b>📐 Luas Wilayah</b><div style="margin-top:4px;display:grid;gap:2px">${rows.join('')}</div></div>`;
  }

  let sawahHtml = '<div><b>🌾 Luas Lahan Baku Sawah</b><span style="font-size:10px;color:#7a8fa3">Tidak tersedia</span></div>';
  if (sawah && sawah.sawahHa > 0) {
    const fmtNum = (n) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
    const luasWilayah = luas && luas.luas > 0 ? luas.luas : 0;
    const pct = luasWilayah > 0 ? ((sawah.sawahHa / luasWilayah) * 100).toFixed(1) : '-';
    const sawahRows = [
      `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px"><span style="color:#54708d">Total luas sawah</span><span style="font-weight:600;color:#2d7a2d">${fmtNum(sawah.sawahHa)} ha</span></div>`,
      `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px"><span style="color:#54708d">Luas wilayah</span><span style="font-weight:600">${fmtNum(luasWilayah)} ha</span></div>`,
      `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px"><span style="color:#54708d">Total ${sawah.count} bidang</span><span style="font-weight:600">${pct}% dari luas wilayah</span></div>`
    ];
    sawahHtml = `<div><b>🌾 Luas Lahan Baku Sawah</b><div style="margin-top:4px;display:grid;gap:2px">${sawahRows.join('')}</div></div>`;
  }

  let weatherHtml = '<div><b>☁ Cuaca</b><span>Tidak tersedia</span></div>';
  if (weather) {
    const wDesc = weather.weather_desc || '-';
    const temp = weather.t ?? '-';
    const hu = weather.hu ?? '-';
    const ws = weather.ws ?? '-';
    const wd = weather.wd ?? '-';
    const wdDeg = weather.wd_deg ?? '';
    const tcc = weather.tcc ?? '-';
    const windDir = wdDeg !== '' ? `${wd} (${wdDeg}°)` : wd;
    const weatherRows = [
      `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px"><span style="color:#54708d">Suhu</span><span style="font-weight:600">${escapeGeoidHtml(String(temp))}°C</span></div>`,
      `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px"><span style="color:#54708d">Kelembapan</span><span style="font-weight:600">${escapeGeoidHtml(String(hu))}%</span></div>`,
      `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px"><span style="color:#54708d">Angin</span><span style="font-weight:600">${escapeGeoidHtml(String(ws))} m/s</span></div>`,
      `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px"><span style="color:#54708d">Arah Angin</span><span style="font-weight:600">${escapeGeoidHtml(windDir)}</span></div>`,
      `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px"><span style="color:#54708d">Tutupan Awan</span><span style="font-weight:600">${escapeGeoidHtml(String(tcc))}%</span></div>`
    ];
    weatherHtml = `<div><b>☁ Cuaca · ${escapeGeoidHtml(wDesc)}</b><div style="margin-top:4px;display:grid;gap:2px">${weatherRows.join('')}</div></div>`;
  }

  element.innerHTML = `
    ${weatherHtml}
    <div><b>〽 Gempa terbaru</b><span>${quake ? `M${escapeGeoidHtml(quake.Magnitude || '-')} · ${escapeGeoidHtml(quake.Wilayah || '-')}` : 'Tidak tersedia'}</span></div>
    ${poiHtml}
    ${propertiHtml}
    ${luasHtml}
    ${sawahHtml}
  `;

  } catch (err) {
    console.warn('Gagal memuat insight:', err);
    element.innerHTML = '<div style="color:#e74c3c; font-size:11px">Gagal memuat data insight</div>';
  }
}

// Fetch nearby POIs (amenity) from Overpass API
async function fetchNearbyPOI(lat, lng, radiusMeter = 1000) {
  try {
    const overpassUrl = `https://overpass-api.de/api/interpreter?data=[out:json];node(around:${radiusMeter},${lat},${lng})["amenity"];out;`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(overpassUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const data = await response.json();
    const counts = {};
    (data.elements || []).forEach(item => {
      const type = item.tags?.amenity;
      if (type) counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  } catch (_) { return null; }
}

async function fetchPropertiHarga(lat, lng, radiusMeter = 2000) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const [rumahRes, rukoRes] = await Promise.all([
      fetch(`https://rupabumi.com/maps/api/properti.php?latitude=${lat}&longitude=${lng}`, { signal: controller.signal }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`https://rupabumi.com/maps/api/ruko.php?latitude=${lat}&longitude=${lng}`, { signal: controller.signal }).then(r => r.ok ? r.json() : null).catch(() => null)
    ]);
    clearTimeout(timeout);

    const calcAvg = (items, key = 'price') => {
      if (!items || !items.length) return { avg: 0, count: 0 };
      const valid = items.filter(i => i[key] && i[key] > 0);
      if (!valid.length) return { avg: 0, count: 0 };
      const sum = valid.reduce((s, i) => s + Number(i[key]), 0);
      return { avg: Math.round(sum / valid.length), count: valid.length };
    };

    const rumahData = Array.isArray(rumahRes) ? rumahRes : (rumahRes?.results || []);
    const rukoData = Array.isArray(rukoRes) ? rukoRes : (rukoRes?.results || []);

    return {
      rumah: calcAvg(rumahData),
      ruko: calcAvg(rukoData)
    };
  } catch (_) { return null; }
}

async function fetchLuasWilayah(kode) {
  if (!kode) return null;
  try {
    const parts = kode.split('.');
    const level = parts.length;
    const layerConfig = {
      1: { url: 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_WILAYAH/MapServer/12/query', field: 'KDPPUM', outFields: 'LUASWH,WADMPR' },
      2: { url: 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/Administrasi_AR_KabKota_50K/MapServer/0/query', field: 'KDPKAB', outFields: 'LUASWH,WADMKK,WADMPR' },
      3: { url: 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/Administrasi_AR_Kecamatan_10K/MapServer/0/query', field: 'KDCPUM', outFields: 'LUASWH,WADMKC,WADMKK,WADMPR' },
      4: { url: 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/Administrasi_AR_KelDesa_10K/MapServer/0/query', field: 'KDEPUM', outFields: 'LUASWH,NAMOBJ,WADMKD,WADMKK,WADMKC,WADMPR' }
    };
    const cfg = layerConfig[level];
    if (!cfg) return null;
    const where = `${cfg.field}='${kode}'`;
    const params = new URLSearchParams({
      f: 'json', returnGeometry: 'false', spatialRel: 'esriSpatialRelIntersects',
      where, outFields: cfg.outFields
    });
    const url = `${cfg.url}?${params}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.features || !data.features.length) return null;
    const a = data.features[0].attributes || {};
    const get = (key) => {
      if (a[key] !== undefined) return a[key];
      const lower = key.toLowerCase();
      if (a[lower] !== undefined) return a[lower];
      return a[key.toUpperCase()];
    };
    return { luas: get('LUASWH') || 0, nama: get('NAMOBJ') || '', desa: get('WADMKD') || '', kec: get('WADMKC') || '', kab: get('WADMKK') || '', prov: get('WADMPR') || '' };
  } catch (_) { return null; }
}

async function fetchLuasSawah(kode) {
  if (!kode) {
    console.warn('fetchLuasSawah: missing kode');
    return null;
  }
  if (typeof turf === 'undefined') {
    console.warn('fetchLuasSawah: turf.js not loaded');
    return null;
  }
  try {
    console.log('fetchLuasSawah: starting for kode', kode);
    const where = `KDEPUM='${kode}'`;
    const bParams = new URLSearchParams({
      f: 'json', returnGeometry: 'true', spatialRel: 'esriSpatialRelIntersects',
      where, outFields: 'LUASWH', outSR: '4326'
    });
    const bAbort = new AbortController();
    const bTimeout = setTimeout(() => bAbort.abort(), 8000);
    const bRes = await fetch(`https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/Administrasi_AR_KelDesa_10K/MapServer/0/query?${bParams}`, { signal: bAbort.signal });
    clearTimeout(bTimeout);
    if (!bRes.ok) {
      console.warn('fetchLuasSawah: BIG boundary fetch failed', bRes.status);
      return null;
    }
    const bData = await bRes.json();
    if (!bData.features || !bData.features.length) {
      console.warn('fetchLuasSawah: no boundary features');
      return null;
    }

    const rings = [];
    bData.features.forEach(f => {
      if (f.geometry && f.geometry.rings) {
        rings.push(f.geometry.rings);
      }
    });
    if (!rings.length) {
      console.warn('fetchLuasSawah: no rings');
      return null;
    }

    const villageRaw = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: rings[0]
      }
    };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    rings[0].forEach(ring => ring.forEach(([x, y]) => {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }));

    const envelope = `${minX},${minY},${maxX},${maxY}`;
    console.log('fetchLuasSawah: envelope', envelope);

    // Fetch sawah from ArcGIS Sawah 2023 with pagination
    const SAWAH_URL = 'https://sig02.pertanian.go.id/server/rest/services/Sawah/Sawah2023/MapServer/0/query';
    let allSawahFeatures = [];
    let offset = 0;
    do {
      const sParams = new URLSearchParams({
        f: 'json', returnGeometry: 'true',
        where: '1=1', geometry: envelope,
        geometryType: 'esriGeometryEnvelope',
        inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
        outFields: 'OBJECTID,WADMPR,WADMKK,Jenis_Lahan_Sawah,Luas_Ha',
        outSR: '4326',
        resultOffset: String(offset),
        resultRecordCount: '1000'
      });
      const sAbort = new AbortController();
      const sTimeout = setTimeout(() => sAbort.abort(), 12000);
      const sRes = await fetch(`${SAWAH_URL}?${sParams}`, { signal: sAbort.signal });
      clearTimeout(sTimeout);
      if (!sRes.ok) {
        console.warn('fetchLuasSawah: ArcGIS Sawah fetch failed', sRes.status);
        return null;
      }
      const sData = await sRes.json();
      const features = sData.features || [];
      allSawahFeatures = allSawahFeatures.concat(features);
      if (features.length < 1000 || !sData.exceededTransferLimit) break;
      offset += 1000;
    } while (offset < 5000);

    console.log('fetchLuasSawah: sawah features count', allSawahFeatures.length);
    if (!allSawahFeatures.length) {
      console.warn('fetchLuasSawah: no sawah features');
      return null;
    }

    let totalIntersectedArea = 0;
    let intersectedCount = 0;
    let useFallback = false;

    let villagePolygon;
    try {
      villagePolygon = turf.rewind(villageRaw);
    } catch (e) {
      console.warn('fetchLuasSawah: turf.rewind failed for village, using raw', e);
      villagePolygon = villageRaw;
    }

    for (const feature of allSawahFeatures) {
      if (!feature.geometry || !feature.geometry.rings) continue;

      let sawahPolygon;
      try {
        sawahPolygon = turf.rewind({
          type: 'Feature',
          properties: { Luas_Ha: feature.attributes?.Luas_Ha || 0 },
          geometry: {
            type: 'Polygon',
            coordinates: feature.geometry.rings
          }
        });
      } catch (e) {
        sawahPolygon = {
          type: 'Feature',
          properties: { Luas_Ha: feature.attributes?.Luas_Ha || 0 },
          geometry: {
            type: 'Polygon',
            coordinates: feature.geometry.rings
          }
        };
      }

      try {
        const intersection = turf.intersect(turf.featureCollection([villagePolygon, sawahPolygon]));
        if (intersection && intersection.geometry) {
          const areaM2 = turf.area(intersection);
          totalIntersectedArea += areaM2 / 10000;
          intersectedCount++;
        }
      } catch (e) {
        console.warn('fetchLuasSawah: intersection failed, falling back to Luas_Ha sum', e);
        useFallback = true;
        break;
      }
    }

    if (useFallback) {
      totalIntersectedArea = allSawahFeatures.reduce((sum, f) => sum + (f.attributes?.Luas_Ha || 0), 0);
      intersectedCount = allSawahFeatures.length;
    }

    console.log('fetchLuasSawah: result', { sawahHa: Math.round(totalIntersectedArea * 100) / 100, count: intersectedCount, fallback: useFallback });
    return {
      sawahHa: Math.round(totalIntersectedArea * 100) / 100,
      count: intersectedCount
    };
  } catch (e) {
    console.error('fetchLuasSawah error:', e);
    return null;
  }
}

async function cariLayerWilayah() {
  const selection = getGeoidSelection();
  if (!Object.keys(selection).length) {
    alert('Silakan pilih wilayah terlebih dahulu');
    return;
  }

  const desaSelect = document.getElementById('pilihDesa');
  const selectedVillage = desaSelect && desaSelect.options[desaSelect.selectedIndex];
  const adm4Code = selectedVillage && selectedVillage.value;

  const btn = document.getElementById('applyWilayah');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Mencari...';
  }

  try {
    let location = null;
    if (selection.desa && adm4Code) location = await geocodeVillageByAdm4(adm4Code);
    if (!location) location = await geocodeAdministrativeArea(selection);

    if (location) {
      const zoom = selection.desa ? 15 : selection.kecamatan ? 12 : selection.kabkota ? 10 : 7;
      const marker = showGeoidFlyup(location.lat, location.lon, {
        desa: selection.desa || selection.kecamatan || selection.kabkota || selection.provinsi,
        kecamatan: selection.kecamatan || location.kecamatan,
        kabkota: selection.kabkota || location.kabkota || location.kotkab,
        provinsi: selection.provinsi || location.provinsi,
        kode: selection.desa ? adm4Code : '',
        postal_code: (selectedVillage && selectedVillage.dataset.postalCode) || location.postal_code || location.kodepos
      }, zoom);
      loadGeoidPopupInsights(marker, { ...location, kode: location.kode || adm4Code });
      if (selection.desa) showGeoidBoundary(adm4Code, zoom);
      if (typeof loadPrayerSchedule === 'function') loadPrayerSchedule(marker, location.lat, location.lon);
    } else {
      alert('Koordinat wilayah tidak ditemukan. Coba pilih tingkat wilayah yang lebih rinci.');
    }
  } catch (err) {
    console.error('Error cari wilayah:', err);
    alert('Gagal mencari wilayah');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Cari Wilayah';
    }
  }
}

let geoidSearchLocations = [];
let geoidSearchTimer;
let geoidGeocodeAbort = null;
const GEOID_LOCAL_LIMIT = 3;
const GEOID_GEOCODE_LIMIT = 3;

function normalizeGeoidSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('id-ID');
}

function isGeoidAdm4Code(kode) {
  return /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(String(kode || ''));
}

async function buildGeoidSearchIndex() {
  if (geoidSearchLocations.length) return;
  try {
    const data = await getGeoidWilayahData();
    const wilayahByKode = new Map(data.map(item => [String(item.kode), item]));
    geoidSearchLocations = data
      .filter(item => isGeoidAdm4Code(item.kode))
      .map(item => {
        const [provinsiKode, kabKotaKode, kecamatanKode] = String(item.kode).split('.');
        const kecamatan = wilayahByKode.get(`${provinsiKode}.${kabKotaKode}.${kecamatanKode}`)?.nama || '';
        const kabkota = wilayahByKode.get(`${provinsiKode}.${kabKotaKode}`)?.nama || '';
        const provinsi = wilayahByKode.get(provinsiKode)?.nama || '';
        const location = {
          type: 'local',
          kode: String(item.kode),
          desa: item.nama || '',
          kecamatan,
          kabkota,
          provinsi
        };
        location.searchText = normalizeGeoidSearch([
          location.desa, location.kecamatan, location.kabkota, location.provinsi, location.kode
        ].join(' '));
        return location;
      });
  } catch (err) {
    console.warn('Gagal membangun indeks pencarian GEOID:', err);
  }
}

function searchLocalGeoid(query) {
  const matches = [];
  for (const item of geoidSearchLocations) {
    if (item.searchText.includes(query)) {
      matches.push(item);
      if (matches.length === GEOID_LOCAL_LIMIT) break;
    }
  }
  return matches;
}

async function searchArcGISGeocode(query) {
  if (geoidGeocodeAbort) geoidGeocodeAbort.abort();
  geoidGeocodeAbort = new AbortController();

  try {
    const params = new URLSearchParams({
      f: 'json',
      singleLine: `${query}, Indonesia`,
      countryCode: 'IDN',
      outFields: 'Match_addr,Addr_type,Type,Region,Subregion,City,Neighborhood,Postal',
      maxLocations: String(GEOID_GEOCODE_LIMIT)
    });
    const response = await fetch(
      `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?${params}`,
      { signal: geoidGeocodeAbort.signal }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return (data.candidates || [])
      .filter(c => c.location && c.score >= 70)
      .map(c => {
        const addr = c.address || {};
        return {
          type: 'geocode',
          lat: c.location.y,
          lon: c.location.x,
          name: addr.Match_addr || c.address || query,
          region: addr.Region || '',
          subregion: addr.Subregion || addr.City || '',
          neighborhood: addr.Neighborhood || '',
          score: c.score
        };
      });
  } catch (err) {
    if (err.name !== 'AbortError') console.warn('ArcGIS geocode error:', err);
    return [];
  }
}

function setupGeoidSearch() {
  const input = document.getElementById('geoidSearchInput');
  const results = document.getElementById('geoidAutocompleteResults');
  if (!input || !results) return;

  input.addEventListener('input', function() {
    clearTimeout(geoidSearchTimer);
    const query = this.value.trim();
    if (normalizeGeoidSearch(query).length < 2) {
      results.style.display = 'none';
      return;
    }
    geoidSearchTimer = setTimeout(() => runGeoidSearch(query, results), 200);
  });

  input.addEventListener('focus', function() {
    const query = this.value.trim();
    if (normalizeGeoidSearch(query).length >= 2) {
      runGeoidSearch(query, results);
    }
  });

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      results.style.display = 'none';
      this.blur();
    }
  });

  document.addEventListener('click', function(e) {
    if (!e.target.closest('.geoid-search-container')) {
      results.style.display = 'none';
    }
  });
}

async function runGeoidSearch(query, container) {
  const normalizedQuery = normalizeGeoidSearch(query);
  const localResults = searchLocalGeoid(normalizedQuery);
  const geocodeResults = await searchArcGISGeocode(query);

  const allResults = [...localResults, ...geocodeResults];
  renderGeoidAutocomplete(allResults, container);
}

function renderGeoidAutocomplete(items, container) {
  if (!items.length) {
    container.innerHTML = '<div class="geoid-autocomplete-item" style="color:#888;">Lokasi tidak ditemukan</div>';
    container.style.display = 'block';
    return;
  }

  const fragment = document.createDocumentFragment();

  const localItems = items.filter(i => i.type === 'local');
  const geocodeItems = items.filter(i => i.type === 'geocode');

  if (localItems.length) {
    const header = document.createElement('div');
    header.className = 'geoid-ac-header';
    header.textContent = 'Desa / Kelurahan';
    fragment.appendChild(header);

    localItems.forEach(item => {
      const el = document.createElement('div');
      el.className = 'geoid-autocomplete-item geoid-ac-local';
      el.innerHTML = `<strong>${escapeGeoidHtml(item.desa)}</strong><span class="geoid-ac-kode">${escapeGeoidHtml(item.kode)}</span><small>Kec. ${escapeGeoidHtml(item.kecamatan)}, ${escapeGeoidHtml(item.kabkota)}, ${escapeGeoidHtml(item.provinsi)}</small>`;
      el.addEventListener('click', () => selectGeoidLocalResult(item, container));
      fragment.appendChild(el);
    });
  }

  if (geocodeItems.length) {
    const header = document.createElement('div');
    header.className = 'geoid-ac-header';
    header.textContent = 'Lokasi dari Peta';
    fragment.appendChild(header);

    geocodeItems.forEach(item => {
      const el = document.createElement('div');
      el.className = 'geoid-autocomplete-item geoid-ac-geocode';
      const region = [item.subregion || item.region, item.neighborhood].filter(Boolean).join(', ');
      el.innerHTML = `<strong>${escapeGeoidHtml(item.name)}</strong><small class="geoid-ac-geocode-addr">${escapeGeoidHtml(region)}</small>`;
      el.addEventListener('click', () => selectGeoidGeocodeResult(item, container));
      fragment.appendChild(el);
    });
  }

  container.replaceChildren(fragment);
  container.style.display = 'block';
}

async function selectGeoidLocalResult(item, container) {
  const input = document.getElementById('geoidSearchInput');
  if (input) input.value = `${item.desa}, Kec. ${item.kecamatan}`;
  container.style.display = 'none';

  let location = await geocodeVillageByAdm4(item.kode);
  if (!location) {
    location = await geocodeAdministrativeArea({
      desa: item.desa,
      kecamatan: item.kecamatan,
      kabkota: item.kabkota,
      provinsi: item.provinsi
    });
  }
  if (!location) {
    alert('Koordinat wilayah tidak ditemukan.');
    return;
  }

  const zoom = 15;
  const marker = showGeoidFlyup(location.lat, location.lon, {
    desa: item.desa,
    kecamatan: item.kecamatan,
    kabkota: item.kabkota,
    provinsi: item.provinsi,
    kode: item.kode
  }, zoom);
  loadGeoidPopupInsights(marker, { ...location, kode: item.kode });
  showGeoidBoundary(item.kode, zoom);
  if (typeof loadPrayerSchedule === 'function') loadPrayerSchedule(marker, location.lat, location.lon);
}

function findAdm4ByGeocode(desa, kecamatan, kabkota, provinsi) {
  if (!geoidSearchLocations.length) return null;

  const normalize = str => normalizeGeoidSearch(str || '');
  const kecN = normalize(kecamatan);
  const kabN = normalize(kabkota);
  const provN = normalize(provinsi);

  // Extract potential village name from full address (split by comma, try each part)
  const nameParts = normalize(desa).split(/[\s,]+/).filter(p => p.length > 2);

  let best = null, bestScore = 0;
  for (const item of geoidSearchLocations) {
    let score = 0;
    const itemDesa = normalize(item.desa);
    const itemKec = normalize(item.kecamatan);
    const itemKab = normalize(item.kabkota);
    const itemProv = normalize(item.provinsi);

    // Match village name: exact or partial from address parts
    let desaMatched = false;
    if (itemDesa === normalize(desa)) { score += 4; desaMatched = true; }
    else if (itemDesa.includes(normalize(desa)) || normalize(desa).includes(itemDesa)) { score += 3; desaMatched = true; }
    else {
      for (const part of nameParts) {
        if (itemDesa === part || itemDesa.includes(part)) { score += 2; desaMatched = true; break; }
      }
    }

    // Match kecamatan
    if (kecN) {
      if (itemKec === kecN) score += 3;
      else if (itemKec.includes(kecN) || kecN.includes(itemKec)) score += 2;
    }

    // Match kabkota
    if (kabN) {
      if (itemKab === kabN) score += 2;
      else if (itemKab.includes(kabN) || kabN.includes(itemKab)) score += 1;
    }

    // Match provinsi
    if (provN) {
      if (itemProv === provN) score += 1;
      else if (itemProv.includes(provN) || provN.includes(itemProv)) score += 0.5;
    }

    // Boost if kecamatan+kabkota match (strong location signal even without desa)
    if (score >= 5 && kecN && kabN) score += 1;

    if (score > bestScore) { bestScore = score; best = item; }
  }

  return bestScore >= 4 ? best : null;
}

async function selectGeoidGeocodeResult(item, container) {
  const input = document.getElementById('geoidSearchInput');
  if (input) input.value = item.name;
  container.style.display = 'none';

  // Cari adm4 code dari kode_wilayah.json berdasarkan nama wilayah dari geocode
  const matched = findAdm4ByGeocode(
    item.name, item.neighborhood || '', item.subregion || item.region || '', item.region || ''
  );
  const adm4Code = matched ? matched.kode : '';

  const zoom = 16;
  const marker = showGeoidFlyup(item.lat, item.lon, {
    desa: matched ? matched.desa : item.name,
    kecamatan: matched ? matched.kecamatan : item.neighborhood || '',
    kabkota: matched ? matched.kabkota : item.subregion || item.region || '',
    provinsi: matched ? matched.provinsi : item.region || '',
    kode: adm4Code
  }, zoom);
  loadGeoidPopupInsights(marker, { lat: item.lat, lon: item.lon, kode: adm4Code });
  if (adm4Code) showGeoidBoundary(adm4Code, zoom);
  if (typeof loadPrayerSchedule === 'function') loadPrayerSchedule(marker, item.lat, item.lon);
}

function setupGeoidDropdowns() {
  const provinsiSelect = document.getElementById('pilihProvinsi');
  const kabupatenSelect = document.getElementById('pilihKabupaten');
  const kecamatanSelect = document.getElementById('pilihKecamatan');
  const desaSelect = document.getElementById('pilihDesa');

  if (!provinsiSelect || !kabupatenSelect || !kecamatanSelect || !desaSelect) return;

  provinsiSelect.addEventListener('change', function() {
    geoidSelectedProvince = this.value;
    resetGeoidSelect(kabupatenSelect, 'Pilih Kabupaten/Kota', !this.value);
    resetGeoidSelect(kecamatanSelect, 'Pilih Kabupaten/Kota Terlebih Dahulu');
    resetGeoidSelect(desaSelect, 'Pilih Kecamatan Terlebih Dahulu');
    updateApplyWilayahButton();

    if (this.value) {
      loadGeoidRegencies(this.value);
    }
  });

  kabupatenSelect.addEventListener('change', function() {
    geoidSelectedRegency = this.value;
    resetGeoidSelect(kecamatanSelect, 'Pilih Kecamatan', !this.value);
    resetGeoidSelect(desaSelect, 'Pilih Kecamatan Terlebih Dahulu');
    updateApplyWilayahButton();

    if (this.value) {
      loadGeoidDistricts(this.value);
    }
  });

  kecamatanSelect.addEventListener('change', function() {
    geoidSelectedDistrict = this.value;
    resetGeoidSelect(desaSelect, 'Pilih Desa', !this.value);
    updateApplyWilayahButton();

    if (this.value) {
      loadGeoidVillages(this.value);
    }
  });

  desaSelect.addEventListener('change', updateApplyWilayahButton);
}

function searchByCoordinate() {
  const latInput = document.getElementById('geoidLatInput');
  const lngInput = document.getElementById('geoidLngInput');
  const btn = document.getElementById('geoidCoordBtn');
  if (!latInput || !lngInput) return;

  const lat = parseFloat(latInput.value.replace(',', '.'));
  const lng = parseFloat(lngInput.value.replace(',', '.'));

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    alert('Koordinat tidak valid. Masukkan latitude (-90 s/d 90) dan longitude (-180 s/d 180).');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Mencari...'; }

  const zoom = 16;
  const marker = showGeoidFlyup(lat, lng, {
    desa: '',
    kecamatan: '',
    kabkota: '',
    provinsi: '',
    kode: ''
  }, zoom);

  fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=pjson&featureTypes=&location=${lng},${lat}`)
    .then(r => r.json())
    .then(data => {
      const desa = data?.address?.Neighborhood || data?.address?.District || '';
      const kecamatan = data?.address?.Subregion || data?.address?.City || '';
      const kabkota = data?.address?.City || '';
      const provinsi = data?.address?.Region || '';
      const kodepos = data?.address?.Postal || '';

      const matched = typeof findAdm4ByGeocode === 'function'
        ? findAdm4ByGeocode(desa, kecamatan, kabkota, provinsi) : null;
      const adm4Code = matched ? matched.kode : '';

      if (marker) {
        const title = matched?.desa || desa || 'Lokasi';
        const hierarchy = [matched?.kecamatan || kecamatan, matched?.provinsi || provinsi].filter(Boolean);
        const coordStr = `${lng.toFixed(5)}, ${lat.toFixed(5)}`;
        const metadata = [
          ['Koordinat', coordStr],
          kodepos && ['Kode pos', kodepos],
          adm4Code && ['Kode wilayah', adm4Code]
        ].filter(Boolean);

        marker.setPopupContent(`
          <div class="geoid-popup geoid-popup-scroll">
            <div class="geoid-popup-head">
              <strong>${escapeGeoidHtml(title)}</strong>
              ${hierarchy.length ? `<span>${hierarchy.map(escapeGeoidHtml).join(' · ')}</span>` : ''}
            </div>
            <div class="geoid-popup-body">
              <div class="geoid-popup-meta">${metadata.map(([label, value]) => `<div><span>${escapeGeoidHtml(label)}</span><b>${escapeGeoidHtml(value)}</b></div>`).join('')}</div>
              <div class="geoid-popup-prayer" data-prayer-schedule><span style="color:#7a8fa3; font-size:11px">Memuat jadwal sholat…</span></div>
        <div class="geoid-popup-insights" data-geoid-insights>
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px 0 10px;gap:8px;">
            <div style="width:28px;height:28px;border:3px solid #d0dde8;border-top-color:#0879bf;border-radius:50%;animation:geoportal-spin .8s linear infinite;"></div>
            <span style="font-size:10px;color:#7a8fa3;text-align:center;">Memuat analisis…</span>
          </div>
        </div>
            </div>
          </div>
        `, { maxWidth: 310, className: 'geoid-leaflet-popup' });
        marker.openPopup();

        loadPrayerSchedule(marker, lat, lng);
        loadGeoidPopupInsights(marker, { lat, lon: lng, kode: adm4Code });
        if (adm4Code) {
          showGeoidBoundary(adm4Code, zoom);
        }
      }
    })
    .catch(err => {
      console.warn('Reverse geocode gagal:', err);
    })
    .finally(() => {
      if (btn) { btn.disabled = false; btn.textContent = '🔍 Cari Koordinat'; }
    });
}

document.addEventListener('DOMContentLoaded', () => {
  const geoidTab = document.getElementById('tab-geoid');
  if (geoidTab) {
    loadGeoidProvinces();
    setupGeoidDropdowns();
    setupGeoidSearch();
    buildGeoidSearchIndex();
  }
});
