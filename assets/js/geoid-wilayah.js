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
let lastGeotaniPopupData = null;

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

// ---- CVSS v3.1 Agricultural Vulnerability Scoring ----
function computeAgriculturalCvss(sawahPct, erosiKelas, ndviMean) {
  const kelas = String(erosiKelas || '').toLowerCase();
  const isErosiBad = kelas.includes('berat') && !kelas.includes('sangat');
  const isErosiSangat = kelas.includes('sangat berat');
  const isErosiSedang = kelas.includes('sedang');
  const isNdviBad = Number(ndviMean) < 0.3;
  const isNdviStress = Number(ndviMean) < 0.4;

  // Exploitability Metrics
  const AV = sawahPct > 60 ? 0.85 : sawahPct > 30 ? 0.62 : sawahPct > 10 ? 0.55 : 0.20;
  const AV_label = sawahPct > 60 ? 'Network' : sawahPct > 30 ? 'Adjacent' : sawahPct > 10 ? 'Local' : 'Physical';
  const AC = (isErosiBad || isErosiSangat) && isNdviBad ? 0.77 : 0.44;
  const AC_label = AC === 0.77 ? 'Low' : 'High';
  const PR = isErosiSangat ? 0.85 : isErosiBad ? 0.62 : 0.27;
  const PR_label = isErosiSangat ? 'None' : isErosiBad ? 'Low' : 'High';
  const UI = isNdviBad ? 0.85 : 0.62;
  const UI_label = isNdviBad ? 'None' : 'Required';

  // Impact Metrics
  const C_impact = sawahPct > 50 ? 0.56 : sawahPct > 20 ? 0.22 : 0.00;
  const C_label = C_impact >= 0.56 ? 'High' : C_impact >= 0.22 ? 'Low' : 'None';
  const I_impact = (isErosiBad || isErosiSangat) ? 0.56 : isErosiSedang ? 0.22 : 0.00;
  const I_label = I_impact >= 0.56 ? 'High' : I_impact >= 0.22 ? 'Low' : 'None';
  const A_impact = Number(ndviMean) < 0.2 ? 0.56 : Number(ndviMean) < 0.4 ? 0.22 : 0.00;
  const A_label = A_impact >= 0.56 ? 'High' : A_impact >= 0.22 ? 'Low' : 'None';

  // Scope
  const highCount = [C_impact >= 0.56, I_impact >= 0.56, A_impact >= 0.56].filter(Boolean).length;
  const scopeChanged = highCount >= 2;
  const S = scopeChanged ? 'Changed' : 'Unchanged';

  // CVSS v3.1 Formula
  const iss = 1 - ((1 - C_impact) * (1 - I_impact) * (1 - A_impact));
  let impact;
  if (scopeChanged) {
    impact = 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15);
    if (impact < 0) impact = 0;
  } else {
    impact = 6.42 * iss;
  }
  const exploitability = 8.22 * AV * AC * PR * UI;
  let rawScore = impact + exploitability;
  if (scopeChanged) rawScore = 1.08 * rawScore;
  const score = Math.min(rawScore, 10);
  const roundedScore = Math.round(score * 10) / 10;

  // Severity
  let severity, color;
  if (roundedScore === 0) { severity = 'None'; color = '#4caf50'; }
  else if (roundedScore <= 3.9) { severity = 'Low'; color = '#8bc34a'; }
  else if (roundedScore <= 6.9) { severity = 'Medium'; color = '#ff9800'; }
  else if (roundedScore <= 8.9) { severity = 'High'; color = '#f44336'; }
  else { severity = 'Critical'; color = '#b71c1c'; }

  // Vector string
  const avShort = { Network: 'N', Adjacent: 'A', Local: 'L', Physical: 'P' }[AV_label];
  const acShort = { Low: 'L', High: 'H' }[AC_label];
  const prShort = { None: 'N', Low: 'L', High: 'H' }[PR_label];
  const uiShort = { None: 'N', Required: 'R' }[UI_label];
  const sShort = scopeChanged ? 'C' : 'U';
  const cShort = { High: 'H', Low: 'L', None: 'N' }[C_label];
  const iShort = { High: 'H', Low: 'L', None: 'N' }[I_label];
  const aShort = { High: 'H', Low: 'L', None: 'N' }[A_label];
  const vector = `CVSS:3.1/AV:${avShort}/AC:${acShort}/PR:${prShort}/UI:${uiShort}/S:${sShort}/C:${cShort}/I:${iShort}/A:${aShort}`;

  // Insight
  let insight = '';
  if (roundedScore >= 9.0) {
    insight = 'Kondisi kritis — sawah dominan dengan erosi sangat berat dan vegetasi sangat stres. Aksi konservasi segera diperlukan.';
  } else if (roundedScore >= 7.0) {
    insight = 'Risiko tinggi — ketergantungan terhadap sawah tinggi dan kondisi vegetasi menunjukkan tekanan yang meningkat.';
  } else if (roundedScore >= 4.0) {
    insight = 'Risiko sedang — perlu monitoring berkala terhadap kondisi tanah dan vegetasi.';
  } else {
    insight = 'Kondisi stabil — vegetasi sehat, erosi minimal, ketergantungan sawah rendah.';
  }

  // Prioritas
  const prioritas = [];
  if (isErosiBad || isErosiSangat) prioritas.push('konservasi tanah');
  if (isNdviStress) prioritas.push('monitoring vegetasi');
  if (sawahPct > 50) prioritas.push('evaluasi pengelolaan sawah');
  if (!prioritas.length) prioritas.push('pemeliharaan rutin');

  return { score: roundedScore, severity, color, vector, insight, prioritas: prioritas.join(' + ') };
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
    populateGeoidSummaryCards(data);
  } catch (err) {
    console.warn('kode_wilayah.json tidak dapat dimuat; memakai data cadangan:', err);
    renderGeoidProvinces(GEOID_PROVINCE_FALLBACK);
  }
}

function populateGeoidSummaryCards(data) {
  const fmt = n => n.toLocaleString('id-ID');
  const counts = { prov: 0, kab: 0, kec: 0, desa: 0 };
  data.forEach(item => {
    const depth = item.kode.split('.').length;
    if (depth === 1) counts.prov++;
    else if (depth === 2) counts.kab++;
    else if (depth === 3) counts.kec++;
    else if (depth === 4) counts.desa++;
  });
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = fmt(val); };
  set('geoidCountProv', counts.prov);
  set('geoidCountKab', counts.kab);
  set('geoidCountKec', counts.kec);
  set('geoidCountDesa', counts.desa);
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

async function showGeoidBoundary(kode, zoom, options = {}) {
  if (typeof map === 'undefined' || !map) return;

  const requestId = ++geoidBoundaryRequestId;
  if (geoidBoundaryLayer) {
    map.removeLayer(geoidBoundaryLayer);
    geoidBoundaryLayer = null;
  }

  if (!kode) return;

  const parts = kode.split('.');
  const level = parts.length;
  const levelNames = { 1: 'Provinsi', 2: 'Kabupaten/Kota', 3: 'Kecamatan', 4: 'Desa/Kelurahan' };
  const label = levelNames[level] || 'Wilayah';
  const url = `https://wilayah.smartartstudio.my.id/api/boundaries/${kode}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.path || !data.path.length || requestId !== geoidBoundaryRequestId) return;

    const rings = data.path.map(ring => ring);
    const isGeotaniMode = window.currentActiveTab === 'tab-geotani';
    geoidBoundaryLayer = L.polygon(rings, {
      color: isGeotaniMode ? '#16a34a' : '#2563eb',
      weight: 3,
      opacity: 0.95,
      fillColor: isGeotaniMode ? '#4ade80' : '#60a5fa',
      fillOpacity: 0.15,
      dashArray: '7 5'
    }).addTo(map);

    const luasHa = computePolygonAreaHa(data.path);
    const fmtNum = (n) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });

    if (isGeotaniMode) {
      const withTimeout = (promise, ms) => {
        const timeout = new Promise(resolve => setTimeout(() => resolve(null), ms));
        return Promise.race([promise, timeout]);
      };

      const latLng = geoidBoundaryLayer.getBounds().getCenter();
      const weatherReq = withTimeout(
        fetch(`https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${kode}`)
          .then(r => r.ok ? r.json() : null).catch(() => null), 8000
      );
      const sawahReq = (typeof fetchLuasSawah === 'function') ? withTimeout(fetchLuasSawah(kode), 12000) : Promise.resolve(null);
      const erosiReq = (typeof fetchErosiAtPoint === 'function') ? withTimeout(fetchErosiAtPoint(latLng.lat, latLng.lng), 10000) : Promise.resolve(null);
      const ndviReq = (typeof window.fetchNdviStatistics === 'function') ? withTimeout(
        window.fetchNdviStatistics(rings.map(ring => ring)), 15000
      ) : Promise.resolve(null);
      const [weatherPayload, sawahResult, erosiResult, ndviResult] = await Promise.all([weatherReq, sawahReq, erosiReq, ndviReq]);

      let weatherCardHtml = '';
      const forecastDays = weatherPayload?.data?.[0]?.cuaca || [];
      const validDays = forecastDays.filter(day => Array.isArray(day) && day.length);
      if (validDays.length) {
        const icons = { 'Cerah': '☀️', 'Cerah Berawan': '⛅', 'Berawan': '☁️', 'Berawan Tebal': '☁️', 'Hujan Ringan': '🌦️', 'Hujan': '🌧️', 'Hujan Sedang': '🌧️', 'Hujan Lebat': '⛈️', 'Hujan Petir': '⛈️', 'Kabur': '🌫️' };
        const dayCards = validDays.slice(0, 3).map((daySlots, idx) => {
          const temps = daySlots.map(s => Number(s.t)).filter(n => !isNaN(n));
          const hus = daySlots.map(s => Number(s.hu)).filter(n => !isNaN(n));
          const wss = daySlots.map(s => Number(s.ws)).filter(n => !isNaN(n));
          const descs = daySlots.map(s => s.weather_desc).filter(Boolean);
          const minT = temps.length ? Math.min(...temps) : '-';
          const maxT = temps.length ? Math.max(...temps) : '-';
          const avgHu = hus.length ? Math.round(hus.reduce((a, b) => a + b, 0) / hus.length) : '-';
          const avgWs = wss.length ? (wss.reduce((a, b) => a + b, 0) / wss.length).toFixed(1) : '-';
          const mainDesc = descs.length ? descs[Math.floor(descs.length / 2)] : '-';
          const icon = icons[mainDesc] || '🌤️';
          const dayName = ['Hari Ini', 'Besok', 'Lusa'][idx] || `H+${idx}`;
          const dayDate = daySlots[0]?.local_time?.split(' ')[0] || '';
          return `
            <div style="flex:1;min-width:0;background:#f8fafc;border-radius:8px;padding:8px;text-align:center;border:1px solid #e2e8f0;">
              <div style="font-size:9px;font-weight:600;color:#64748b;margin-bottom:4px;">${dayName}</div>
              <div style="font-size:9px;color:#94a3b8;margin-bottom:4px;">${dayDate}</div>
              <div style="font-size:22px;margin:4px 0;">${icon}</div>
              <div style="font-size:10px;font-weight:700;color:#1e293b;">${minT}–${maxT}°C</div>
              <div style="display:flex;justify-content:center;gap:6px;margin-top:4px;font-size:8px;color:#64748b;">
                <span>💧${avgHu}%</span>
                <span>💨${avgWs}m/s</span>
              </div>
            </div>`;
        }).join('');
        weatherCardHtml = `
          <div style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">
            <div style="font-size:11px;font-weight:700;color:#1e293b;margin-bottom:6px;display:flex;align-items:center;gap:4px;">
              <span style="font-size:13px;">🌤️</span> Cuaca 3 Hari
            </div>
            <div style="display:flex;gap:6px;">${dayCards}</div>
          </div>`;
      }

      const sawahHa = sawahResult && sawahResult.sawahHa > 0 ? sawahResult.sawahHa : 0;
      const sawahPct = luasHa > 0 ? ((sawahHa / luasHa) * 100) : 0;
      const pctLabel = sawahPct > 0 ? sawahPct.toFixed(1) : '-';

      // Erosion data
      const erosiKelas = erosiResult?.kelas_erosi || '-';
      const erosiDesc = erosiResult?.deskripsi || '-';

      // NDVI data
      const ndviMean = ndviResult?.mean != null ? Number(ndviResult.mean) : null;
      const ndviLabel = ndviMean != null ? ndviMean.toFixed(4) : '-';

      // CVSS score
      const cvss = (typeof computeAgriculturalCvss === 'function' && sawahPct > 0)
        ? computeAgriculturalCvss(sawahPct, erosiKelas, ndviMean)
        : null;

      lastGeotaniPopupData = {
        kode,
        villageName: data.nama || 'Wilayah',
        label,
        luasHa,
        sawahHa,
        pct: pctLabel,
        latLng,
        weatherPayload,
        erosiKelas,
        ndviMean,
        cvss
      };

      // CVSS gauge section
      let cvssHtml = '';
      if (cvss) {
        const gaugeWidth = Math.min(cvss.score * 10, 100);
        cvssHtml = `
          <div style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">
            <div style="font-size:11px;font-weight:700;color:#1e293b;margin-bottom:6px;">🛡️ Skor Kerentanan Pertanian</div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <div style="position:relative;width:48px;height:48px;flex-shrink:0;">
                <svg viewBox="0 0 36 36" style="width:48px;height:48px;transform:rotate(-90deg);">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" stroke-width="2.5" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="${cvss.color}" stroke-width="2.5"
                    stroke-dasharray="${gaugeWidth} 100" stroke-linecap="round" />
                </svg>
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:${cvss.color};">
                  ${cvss.score}
                </div>
              </div>
              <div>
                <span style="display:inline-block;font-size:9px;font-weight:700;color:#fff;background:${cvss.color};padding:2px 10px;border-radius:12px;letter-spacing:0.5px;">
                  ${cvss.severity.toUpperCase()}
                </span>
                <div style="font-size:8px;color:#94a3b8;margin-top:3px;font-family:monospace;">${cvss.vector}</div>
              </div>
            </div>
            <div class="geotani-vuln-gauge" style="margin-bottom:6px;">
              <div class="geotani-vuln-gauge-track">
                <div class="geotani-vuln-gauge-fill" style="width:${gaugeWidth}%;background:${cvss.color};"></div>
              </div>
            </div>
            <div style="font-size:9px;color:#475569;line-height:1.5;margin-bottom:4px;">${escapeGeoidHtml(cvss.insight)}</div>
            <div style="display:flex;flex-wrap:wrap;gap:3px;">
              ${cvss.prioritas.split(' + ').map(p =>
                `<span style="display:inline-block;font-size:8px;font-weight:600;color:#166534;background:#dcfce7;padding:2px 7px;border-radius:8px;border:1px solid #bbf7d0;">${escapeGeoidHtml(p)}</span>`
              ).join('')}
            </div>
          </div>`;
      }

      const geotaniPopupHtml = `
        <div class="boundary-popup" style="font-family:Inter,system-ui,sans-serif;max-width:320px;">
          <div style="padding:10px 14px;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-bottom:1px solid #bbf7d0;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
              <span style="display:inline-flex;align-items:center;gap:4px;font-size:9px;font-weight:600;color:#166534;background:#dcfce7;padding:2px 8px;border-radius:10px;border:1px solid #bbf7d0;">
                <span style="width:5px;height:5px;border-radius:50%;background:#16a34a;"></span>
                Geotani
              </span>
            </div>
            <strong style="font-size:13px;color:#14532d;">${escapeGeoidHtml(data.nama || 'Wilayah')}</strong>
            <div style="font-size:9px;color:#64748b;margin-top:2px;">${escapeGeoidHtml(label)} · ${escapeGeoidHtml(kode)}</div>
          </div>

          ${weatherCardHtml}
          ${cvssHtml}

          <div style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">
            <div style="font-size:11px;font-weight:700;color:#1e293b;margin-bottom:6px;">📐 Informasi Wilayah</div>
            <div style="display:grid;gap:4px;">
              <div style="display:flex;justify-content:space-between;font-size:10px;">
                <span style="color:#64748b;">Luas Wilayah</span>
                <span style="font-weight:600;color:#1e293b;">${luasHa > 0 ? fmtNum(luasHa) + ' ha' : '-'}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:10px;">
                <span style="color:#64748b;">Luas Lahan Baku Sawah</span>
                <span style="font-weight:600;color:#166534;">${sawahHa > 0 ? fmtNum(sawahHa) + ' ha' : '-'}</span>
              </div>
              ${luasHa > 0 && sawahHa > 0 ? `
              <div style="display:flex;justify-content:space-between;font-size:10px;">
                <span style="color:#64748b;">Rasio Sawah</span>
                <span style="font-weight:600;color:#166534;">${pctLabel}%</span>
              </div>` : ''}
              <div style="display:flex;justify-content:space-between;font-size:10px;">
                <span style="color:#64748b;">Erosi</span>
                <span style="font-weight:600;color:#1e293b;">${escapeGeoidHtml(erosiKelas)}</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:10px;">
                <span style="color:#64748b;">NDVI (Sentinel-2)</span>
                <span style="font-weight:600;color:#1e293b;">${ndviLabel}</span>
              </div>
            </div>
          </div>

          <div style="padding:8px 14px;background:#f8fafc;display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:8px;color:#94a3b8;">Sumber: BMKG · BIG SatuPeta · Sentinel-2</span>
            <button class="geotani-btn-print" onclick="printGeotaniPdf()">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Cetak PDF
            </button>
          </div>
        </div>
      `;

      geoidBoundaryLayer.bindPopup(geotaniPopupHtml, { maxWidth: 340, className: 'geotani-leaflet-popup' });
    } else {
      const boundaryPopupHtml = `
        <div class="boundary-popup">
          <div class="boundary-popup-header">
            <div class="boundary-popup-badge">
              <span class="boundary-popup-badge-dot"></span>
              Batas Wilayah
            </div>
            <strong>${escapeGeoidHtml(data.nama || 'Wilayah')}</strong>
            <span>${escapeGeoidHtml(label)}</span>
          </div>
          <div class="boundary-popup-body">
            <div class="boundary-popup-meta">
              <div class="boundary-popup-meta-item">
                <span class="boundary-popup-meta-label">Kode Wilayah</span>
                <span class="boundary-popup-meta-value">${escapeGeoidHtml(kode)}</span>
              </div>
              <div class="boundary-popup-meta-item">
                <span class="boundary-popup-meta-label">Luas Area</span>
                <span class="boundary-popup-meta-value">${luasHa > 0 ? fmtNum(luasHa) + ' Ha' : 'Tidak tersedia'}</span>
              </div>
              ${luasHa > 0 ? `
              <div class="boundary-popup-meta-item">
                <span class="boundary-popup-meta-label">Dalam km²</span>
                <span class="boundary-popup-meta-value">${fmtNum(luasHa / 100)} km²</span>
              </div>` : ''}
            </div>
          </div>
        </div>
      `;
      geoidBoundaryLayer.bindPopup(boundaryPopupHtml, { maxWidth: 300, className: 'boundary-leaflet-popup' });
    }

    // Pastikan klik pada poligon batas selalu membuka popup batas dan tidak
    // diteruskan ke handler klik peta (yang dapat memulai geocoding).
    geoidBoundaryLayer.on('click', event => {
      if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
      geoidBoundaryLayer.openPopup(event.latlng);
    });

    geoidBoundaryLayer.bringToFront();

    const bounds = geoidBoundaryLayer.getBounds();
    if (bounds.isValid() && options.flyTo !== false) {
      map.flyToBounds(bounds.pad(0.08), { maxZoom: zoom || (level === 1 ? 8 : level === 2 ? 10 : level === 3 ? 12 : 15), duration: 1 });
    }
    return geoidBoundaryLayer;
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
  const isGeotaniMode = window.currentActiveTab === 'tab-geotani';
  const metadata = [
    info.alamat && ['Alamat', info.alamat],

    ['Koordinat', coordStr],
    info.kode && ['Kode wilayah', info.kode]
  ].filter(Boolean);

  const prefix = isGeotaniMode ? 'geotani' : 'geoid';
  const popupContent = `
    <div class="${prefix}-popup geoid-popup-scroll">
      <div class="${prefix}-popup-head">
        <div class="${prefix}-popup-badge">
          <span class="${prefix}-popup-badge-dot"></span>
          ${isGeotaniMode ? 'Geotani' : 'Wilayah'}
        </div>
        <strong>${escapeGeoidHtml(title)}</strong>
        ${hierarchy.length ? `<span>${hierarchy.map(escapeGeoidHtml).join(' · ')}</span>` : ''}
      </div>
      <div class="${prefix}-popup-body">
        ${metadata.length ? `<div class="${prefix}-popup-meta">${metadata.map(([label, value]) => `<div><span>${escapeGeoidHtml(label)}</span><b>${escapeGeoidHtml(value)}</b></div>`).join('')}</div>` : ''}
        <div class="${prefix}-popup-insights" data-geoid-insights>
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px 0 10px;gap:8px;">
            <div style="width:28px;height:28px;border:3px solid ${isGeotaniMode ? '#bbf7d0' : '#bfdbfe'};border-top-color:${isGeotaniMode ? '#16a34a' : '#2563eb'};border-radius:50%;animation:geoportal-spin .8s linear infinite;"></div>
            <span style="font-size:10px;color:#94a3b8;text-align:center;">Memuat analisis…</span>
          </div>
          ${!isGeotaniMode ? `<div class="geoid-popup-cctv" data-cctv-insight><span style="color:#94a3b8; font-size:11px">Memuat CCTV terdekat…</span></div>` : ''}
        </div>
        ${!isGeotaniMode ? `<div class="geoid-popup-prayer" data-prayer-schedule><span style="color:#94a3b8; font-size:11px">Memuat jadwal sholat…</span></div>` : ''}
      </div>
    </div>
  `;

  marker.bindPopup(popupContent, { maxWidth: 360, className: isGeotaniMode ? 'geotani-leaflet-popup' : 'geoid-leaflet-popup' });
  marker.openPopup();

  map.flyTo([lat, lon], zoom, { duration: 1 });
  return marker;
}

function geoidDistanceKm(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchBigHazardZone(lat, lng) {
  const baseUrl = 'https://geoservices.big.go.id/gis/rest/services/PTRA/Atlas_Kebencanaan/MapServer';
  const geometry = JSON.stringify({ x: lng, y: lat });
  const commonParams = `f=json&returnGeometry=false&where=1=1&geometry=${geometry}&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects&outFields=*`;

  const withTimeout = (promise, ms) => {
    const timeout = new Promise(resolve => setTimeout(() => resolve(null), ms));
    return Promise.race([promise, timeout]);
  };

  const fetchLayer = (layerId) => withTimeout(
    fetch(`${baseUrl}/${layerId}/query?${commonParams}`)
      .then(r => r.ok ? r.json() : null)
      .catch(() => null),
    10000
  );

  const [gempaResult, longsorResult] = await Promise.allSettled([
    fetchLayer(3),
    fetchLayer(1)
  ]);

  const getLevel = (result) => {
    const data = result.status === 'fulfilled' ? result.value : null;
    const feature = data?.features?.[0];
    if (!feature) return null;
    const attrs = feature.attributes;
    return attrs.KEWASPADAAN || attrs.KETERANGAN || attrs.STATUS || null;
  };

  return {
    gempa: getLevel(gempaResult),
    longsor: getLevel(longsorResult)
  };
}

var _gempaRadiusCircle = null;

function showGempaPopup(lat, lon, mag, wilayah, potensi, tanggal, jam, kedalaman, dirasakan) {
  const magNum = parseFloat(mag) || 0;
  let color = '#22c55e';
  if (magNum >= 7) color = '#991b1b';
  else if (magNum >= 6) color = '#dc2626';
  else if (magNum >= 5) color = '#ea580c';
  else if (magNum >= 4) color = '#f59e0b';

  let radius = 50000;
  if (magNum >= 7) radius = 800000;
  else if (magNum >= 6) radius = 400000;
  else if (magNum >= 5) radius = 200000;
  else if (magNum >= 4) radius = 100000;

  const popupHtml = `<div class="quake-popup">
    <div class="quake-popup-header">
      <div class="quake-popup-status"><span class="quake-popup-status-dot"></span> Gempa Terbaru</div>
      <div class="quake-popup-region">${escapeGeoidHtml(wilayah || 'Lokasi tidak diketahui')}</div>
    </div>
    <div class="quake-popup-mag-display">
      <div class="quake-popup-mag-circle" style="background:${color}">
        <span class="quake-popup-mag-num">${escapeGeoidHtml(String(magNum))}</span>
        <span class="quake-popup-mag-label">MAG</span>
      </div>
      <div class="quake-popup-mag-info">
        <div class="quake-popup-potensi">${escapeGeoidHtml(potensi || '-')}</div>
        <div class="quake-popup-time">${escapeGeoidHtml(tanggal || '-')} · ${escapeGeoidHtml(jam || '-')}</div>
      </div>
    </div>
    <div class="quake-popup-details">
      <div class="quake-popup-detail-item">
        <span class="quake-popup-detail-label">Kedalaman</span>
        <span class="quake-popup-detail-value">${escapeGeoidHtml(kedalaman || '-')}</span>
      </div>
      <div class="quake-popup-detail-item">
        <span class="quake-popup-detail-label">Koordinat</span>
        <span class="quake-popup-detail-value">${lat.toFixed(2)}, ${lon.toFixed(2)}</span>
      </div>
    </div>
    ${dirasakan ? `<div class="quake-popup-feeling"><div class="quake-popup-feeling-title">Dirasakan</div><div class="quake-popup-feeling-text">${escapeGeoidHtml(dirasakan)}</div></div>` : ''}
    <div class="quake-popup-footer"><span class="quake-popup-footer-text">Sumber: BMKG</span></div>
  </div>`;

  map.flyTo([lat, lon], 8, { duration: 1 });
  setTimeout(() => {
    if (_gempaRadiusCircle) { map.removeLayer(_gempaRadiusCircle); _gempaRadiusCircle = null; }
    _gempaRadiusCircle = L.circle([lat, lon], {
      radius: radius,
      color: color,
      weight: 1.5,
      opacity: 0.7,
      fillColor: color,
      fillOpacity: 0.12
    }).addTo(map);
    L.marker([lat, lon]).addTo(map).bindPopup(popupHtml, { maxWidth: 340, className: 'quake-leaflet-popup' }).openPopup();
  }, 1100);
}

function showHotspotPopup(lat, lon, desa, kecamatan, kabkota, provinsi, sumber, confidence, confidenceLevel, dateHotspot, routeCreate) {
  const confColor = confidenceLevel === 'high' ? '#dc2626' : confidenceLevel === 'medium' ? '#f59e0b' : '#22c55e';
  const confPct = confidence != null ? confidence + '%' : '-';

  const popupHtml = `<div style="font-family:system-ui,-apple-system,sans-serif;min-width:200px;">
    <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:6px;">Hotspot Karhutla</div>
    <div style="font-size:11px;color:#475569;line-height:1.6;">
      <div><b>${escapeGeoidHtml(desa || '-')}</b>, ${escapeGeoidHtml(kecamatan || '-')}</div>
      <div>${escapeGeoidHtml(kabkota || '-')}, ${escapeGeoidHtml(provinsi || '-')}</div>
      <div style="margin-top:4px;">${escapeGeoidHtml(sumber || '-')}
        | <span style="color:${confColor};font-weight:700;">${escapeGeoidHtml(confidenceLevel || '-')} (${confPct})</span>
      </div>
      <div>${escapeGeoidHtml(dateHotspot || '-')}</div>
    </div>
    ${routeCreate ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #e5e7eb;"><a href="${escapeGeoidHtml(routeCreate)}" target="_blank" style="font-size:10px;color:#0891b2;text-decoration:none;font-weight:600;">Laporkan Ground Check</a></div>` : ''}
  </div>`;

  map.flyTo([lat, lon], 10, { duration: 1 });
  setTimeout(() => {
    L.marker([lat, lon]).addTo(map).bindPopup(popupHtml, { maxWidth: 280, className: 'hotspot-popup' }).openPopup();
  }, 1100);
}

function syncPopupContent(marker) {
  try {
    const popup = marker?.getPopup?.();
    if (!popup) return;
    const el = popup.getElement?.();
    if (!el) return;
    const root = el.querySelector('.geoid-popup') || el.querySelector('.geotani-popup') || el.querySelector('.leaflet-popup-content');
    if (root) popup.setContent(root.outerHTML);
  } catch (_) {}
}

async function loadGeoidPopupInsights(marker, location) {

  const element = marker?.getPopup()?.getElement()?.querySelector('[data-geoid-insights]');
  const cctvElement = marker?.getPopup()?.getElement()?.querySelector('[data-cctv-insight]');
  const hasPopup = !!element;

  const isGeotani = window.currentActiveTab === 'tab-geotani';
  if (isGeotani && cctvElement) cctvElement.style.display = 'none';
  if (isGeotani && location?.kode) window._lastGeotaniLocation = location;

  try {

  if (isGeotani) {
    const withTimeout = (promise, ms) => {
      const timeout = new Promise(resolve => setTimeout(() => resolve(null), ms));
      return Promise.race([promise, timeout]);
    };

    const weatherRequest = location.kode ? withTimeout(
      fetch(`https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${location.kode}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null), 8000
    ) : Promise.resolve(null);
    const luasRequest = location.kode ? withTimeout(fetchLuasWilayah(location.kode), 10000) : Promise.resolve(null);
    const sawahRequest = location.kode ? withTimeout(fetchLuasSawah(location.kode), 15000) : Promise.resolve(null);
    const erosiRequest = (location.lat && location.lon && typeof fetchErosiAtPoint === 'function')
      ? withTimeout(fetchErosiAtPoint(location.lat, location.lon), 10000)
      : Promise.resolve(null);
    const overlayOptions = {
      layer1: document.getElementById('overlayLayer1')?.value || 'sawah-2023',
      layer2: document.getElementById('overlayLayer2')?.value || 'erosi',
      clipToVillage: document.getElementById('overlayClipVillage')?.checked !== false
    };
    const overlayRequest = (location.kode && typeof computeOverlayIntersection === 'function')
      ? withTimeout(computeOverlayIntersection(location.kode, overlayOptions), 20000)
      : Promise.resolve(null);
    const [weatherPayload, luasResult, sawahResult, erosiAttrs, overlayResult] = await Promise.all([weatherRequest, luasRequest, sawahRequest, erosiRequest, overlayRequest]);

    // Fallback: if erosi point query returned null, try envelope query around the point
    let erosiFallback = erosiAttrs;
    if (!erosiFallback && location.lat && location.lon && typeof fetchErosiInEnvelope === 'function') {
      try {
        const buf = 0.005;
        const envelopeFeatures = await fetchErosiInEnvelope(
          location.lon - buf, location.lat - buf,
          location.lon + buf, location.lat + buf
        );
        if (envelopeFeatures && envelopeFeatures.length) {
          const classCount = {};
          let dominantKelas = '';
          let maxCount = 0;
          envelopeFeatures.forEach(f => {
            const attrs = f.attributes || {};
            const kelas = attrs.klas_erosi || attrs.KLAS_EROSI || attrs.kelas_erosi ||
                          attrs.KELAS_EROSI || attrs.erosion_class ||
                          attrs.kelas || attrs.KELAS || attrs.nama_kelas || '';
            if (kelas) {
              classCount[kelas] = (classCount[kelas] || 0) + 1;
              if (classCount[kelas] > maxCount) { maxCount = classCount[kelas]; dominantKelas = kelas; }
            }
          });
          erosiFallback = {
            klas_erosi: dominantKelas,
            _fromEnvelope: true,
            _classCount: classCount,
            _totalFeatures: envelopeFeatures.length
          };
        }
      } catch (e) {
        console.warn('KTA envelope fallback error:', e);
      }
    }

    // Third fallback: extract erosi data from overlay intersection results
    if (!erosiFallback && overlayResult && overlayResult.length) {
      const classCount = {};
      let dominantKelas = '';
      let maxCount = 0;
      overlayResult.forEach(f => {
        const attrs = f.properties || {};
        const kelas = attrs.erosi_kelas || '';
        if (kelas) {
          classCount[kelas] = (classCount[kelas] || 0) + 1;
          if (classCount[kelas] > maxCount) { maxCount = classCount[kelas]; dominantKelas = kelas; }
        }
      });
      if (dominantKelas) {
        erosiFallback = {
          klas_erosi: dominantKelas,
          _fromOverlay: true,
          _classCount: classCount,
          _totalFeatures: overlayResult.length
        };
      }
    }

    // Tampilkan overlay polygon di peta
    if (overlayResult && overlayResult.length && typeof showOverlayOnMap === 'function') {
      showOverlayOnMap(overlayResult);
    }

    const escapeGeoHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

    let cuacaHtml = '';
    const forecastDays = weatherPayload?.data?.[0]?.cuaca || [];
    const validDays = forecastDays.filter(day => Array.isArray(day) && day.length);
    if (validDays.length) {
      const allSlots = validDays.slice(0, 3).flat();
      const temps = allSlots.map(s => Number(s.t)).filter(n => !isNaN(n));
      const hus = allSlots.map(s => Number(s.hu)).filter(n => !isNaN(n));
      const wss = allSlots.map(s => Number(s.ws)).filter(n => !isNaN(n));
      const tccs = allSlots.map(s => Number(s.tcc)).filter(n => !isNaN(n));
      const descs = allSlots.map(s => s.weather_desc).filter(Boolean);

      const minT = temps.length ? Math.min(...temps) : '-';
      const maxT = temps.length ? Math.max(...temps) : '-';
      const avgHu = hus.length ? Math.round(hus.reduce((a, b) => a + b, 0) / hus.length) : '-';
      const avgWs = wss.length ? (wss.reduce((a, b) => a + b, 0) / wss.length).toFixed(1) : '-';
      const avgTcc = tccs.length ? Math.round(tccs.reduce((a, b) => a + b, 0) / tccs.length) : '-';
      const mainDesc = descs.length ? descs[Math.floor(descs.length / 2)] : '-';

      const icons = { 'Cerah': '☀️', 'Cerah Berawan': '⛅', 'Berawan': '☁️', 'Berawan Tebal': '☁️', 'Hujan Ringan': '🌦️', 'Hujan': '🌧️', 'Hujan Sedang': '🌧️', 'Hujan Lebat': '⛈️', 'Hujan Petir': '⛈️', 'Kabur': '🌫️' };
      const icon = icons[mainDesc] || '🌤️';

      cuacaHtml = `
        <div style="padding-bottom:8px;border-bottom:1px solid #eef3f8;">
          <b>Cuaca 3 Hari Kedepan</b>
          <div style="margin-top:4px;display:flex;align-items:center;gap:6px;font-size:10px;">
            <span>${icon}</span>
            <span style="color:#385773;">${escapeGeoHtml(mainDesc)}</span>
            <span style="font-weight:600;color:#0b4da2;">${minT}–${maxT}°C</span>
            <span style="color:#7a8fa3;">💧${avgHu}%</span>
            <span style="color:#7a8fa3;">💨${avgWs}m/s</span>
            <span style="color:#7a8fa3;">☁️${avgTcc}%</span>
          </div>
        </div>`;
    }

    let luasHtml = '<div><b>Luas Wilayah</b><span style="font-size:10px;color:#7a8fa3">Tidak tersedia</span></div>';
    if (luasResult && luasResult.luas > 0) {
      const ha = Number(luasResult.luas);
      const m2 = ha * 10000;
      const km2 = ha / 100;
      const fmtNum = (n) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
      const rows = [
        `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px"><span style="color:#54708d">Luas wilayah</span><span style="font-weight:600">${fmtNum(ha)} ha</span></div>`,
        `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px"><span style="color:#54708d">Dalam ${fmtNum(m2)} m²</span><span style="font-weight:600">${fmtNum(km2)} km²</span></div>`
      ];
      luasHtml = `<div><b>Luas Wilayah</b><div style="margin-top:4px;display:grid;gap:2px">${rows.join('')}</div></div>`;
    }

    let sawahHtml = '<div><b>Luas Lahan Baku Sawah</b><span style="font-size:10px;color:#7a8fa3">Tidak tersedia</span></div>';
    if (sawahResult && sawahResult.sawahHa > 0) {
      const fmtNum = (n) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
      const luasWilayah = luasResult && luasResult.luas > 0 ? luasResult.luas : 0;
      const pct = luasWilayah > 0 ? ((sawahResult.sawahHa / luasWilayah) * 100).toFixed(1) : '-';
      const sawahRows = [
        `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px"><span style="color:#54708d">Total luas sawah</span><span style="font-weight:600;color:#2d7a2d">${fmtNum(sawahResult.sawahHa)} ha</span></div>`,
        `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px"><span style="color:#54708d">Luas wilayah</span><span style="font-weight:600">${fmtNum(luasWilayah)} ha</span></div>`,
        `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px"><span style="color:#54708d">Total ${sawahResult.count} bidang</span><span style="font-weight:600">${pct}% dari luas wilayah</span></div>`
      ];
      sawahHtml = `<div><b>Luas Lahan Baku Sawah</b><div style="margin-top:4px;display:grid;gap:2px">${sawahRows.join('')}</div></div>`;
    }

    // ---- KTA Insight (Konservasi Tanah & Air) ----
    let ktaHtml = '';
    const erosiSource = erosiFallback || erosiAttrs;
    if (erosiSource && typeof generateKtaVillageInsightHtml === 'function') {
      const kelas = erosiSource.klas_erosi || erosiSource.KLAS_EROSI || erosiSource.kelas_erosi ||
                    erosiSource.KELAS_EROSI || erosiSource.erosion_class ||
                    erosiSource.kelas || erosiSource.KELAS || erosiSource.nama_kelas || '';
      const nilai = typeof parseErosiValue === 'function' ? parseErosiValue(kelas) : 0;
      const kta = (typeof getKtaByKelasName === 'function' ? getKtaByKelasName(kelas) : null) ||
                  (typeof getKtaClassification === 'function' ? getKtaClassification(nilai) : null);

      if (kta) {
        const sawahHa = sawahResult && sawahResult.sawahHa > 0 ? sawahResult.sawahHa : 0;
        const luasWilayahHa = luasResult && luasResult.luas > 0 ? luasResult.luas : 0;
        const classCount = erosiSource._classCount || (kelas ? { [kelas]: 1 } : {});
        const totalFeatures = erosiSource._totalFeatures || 1;
        ktaHtml = `<div style="padding:10px 18px;background:#f0fdf4;">
          <button onclick="showKtaPopup(${location.lat}, ${location.lon}, ${JSON.stringify(encodeURIComponent(location.kode || ''))})" 
            style="width:100%;padding:10px;border:1px solid #bbf7d0;border-radius:8px;background:#fff;cursor:pointer;display:flex;align-items:center;gap:8px;transition:all .2s;">
            <span style="font-size:18px;">🌱</span>
            <div style="text-align:left;flex:1;">
              <div style="font-size:12px;font-weight:700;color:#166534;">Analisis KTA</div>
              <div style="font-size:10px;color:#668198;">Konservasi Tanah & Air</div>
            </div>
            <span style="color:#16a34a;font-size:14px;">→</span>
          </button>
        </div>`;
        window._lastGeotaniKtaData = { lat: location.lat, lon: location.lon, kode: location.kode, erosiSource, sawahHa, luasWilayahHa };
      }
    }

    if (hasPopup) {
      element.innerHTML = cuacaHtml + luasHtml + sawahHtml + ktaHtml;
    }
    syncPopupContent(marker);
    return;
  }

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
  const karhutlaRequest = withTimeout(fetch('https://opsroom.sipongidata.my.id/api/opsroom/indoHotspot?wilayah=IN&filterperiode=false&from=&to=&late=24&satelit[]=NASA-MODIS&satelit[]=NASA-SNPP&satelit[]=NASA-NOAA20&confidence[]=low&confidence[]=medium&confidence[]=high').then(r => r.ok ? r.json() : null).catch(() => null), 12000);
  const cctvRequest = typeof loadCctvData === 'function' ? withTimeout(loadCctvData().then(() => (typeof cctvData !== 'undefined' ? cctvData : [])).catch(() => []), 10000) : Promise.resolve([]);
  const poiRequest = withTimeout(fetchNearbyPOI(location.lat, location.lon), 8000);
  const propertiRequest = withTimeout(fetchPropertiHarga(location.lat, location.lon), 10000);
  const luasRequest = location.kode ? withTimeout(fetchLuasWilayah(location.kode), 10000) : Promise.resolve(null);
  const sawahRequest = location.kode ? withTimeout(fetchLuasSawah(location.kode), 15000) : Promise.resolve(null);
  const hazardRequest = withTimeout(fetchBigHazardZone(location.lat, location.lon), 12000);
  const settled = await Promise.allSettled([quakeRequest, karhutlaRequest, cctvRequest, poiRequest, propertiRequest, luasRequest, sawahRequest, hazardRequest]);
  const results = settled.map(r => r.status === 'fulfilled' ? r.value : null);
  const [quakePayload, karhutlaPayload, cameras, poiCounts, properti, luas, sawah, hazard] = results;
  const quake = quakePayload?.Infogempa?.gempa;
  const nearest = cameras.map(camera => ({ ...camera, distance: geoidDistanceKm(location.lat, location.lon, camera.lat, camera.lon) })).sort((a, b) => a.distance - b.distance)[0];

  let poiHtml = '<div><b>🏪 Fasilitas Umum</b><span style="font-size:10px;color:#7a8fa3">Tidak tersedia</span></div>';
  if (poiCounts && Object.keys(poiCounts).length) {
    const excludeHealthEdu = ['hospital', 'clinic', 'pharmacy', 'school', 'university'];
    const filtered = Object.entries(poiCounts).filter(([key]) => !excludeHealthEdu.includes(key));
    const priority = ['bank', 'atm', 'marketplace', 'supermarket', 'convenience', 'restaurant', 'cafe', 'fuel', 'parking', 'bus_station', 'police', 'fire_station', 'place_of_worship', 'post_office'];
    const sorted = filtered.sort((a, b) => {
      const ai = priority.indexOf(a[0]);
      const bi = priority.indexOf(b[0]);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return b[1] - a[1];
    });
    if (sorted.length) {
      const rows = sorted.slice(0, 8).map(([type, count]) => {
        const label = type.replace(/_/g, ' ');
        return `<div style="display:flex;justify-content:space-between;gap:8px;font-size:11px"><span style="color:#54708d">${escapeGeoidHtml(label)}</span><span style="font-weight:600">${count}</span></div>`;
      }).join('');
      poiHtml = `<div><b>🏪 Fasilitas Umum</b><div style="margin-top:4px;display:grid;gap:2px">${rows}</div></div>`;
    }
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

  let luasHtml = '<div style="border-top:1px solid #e7eef5;padding-top:10px"><b>📐 Luas Wilayah</b><span style="font-size:10px;color:#7a8fa3">Tidak tersedia</span></div>';
  if (luas && luas.luas > 0) {
    const ha = Number(luas.luas);
    const m2 = ha * 10000;
    const km2 = ha / 100;
    const fmtNum = (n) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
    const rows = [
      `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px"><span style="color:#54708d">Luas wilayah</span><span style="font-weight:600">${fmtNum(ha)} ha</span></div>`,
      `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px"><span style="color:#54708d">Dalam ${fmtNum(m2)} m²</span><span style="font-weight:600">${fmtNum(km2)} km²</span></div>`
    ];
    luasHtml = `<div style="border-top:1px solid #e7eef5;padding-top:10px"><b>📐 Luas Wilayah</b><div style="margin-top:4px;display:grid;gap:2px">${rows.join('')}</div></div>`;
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

  let kesehatanHtml = '<div><b>🏥 Akses Kesehatan</b><span style="font-size:10px;color:#7a8fa3">Tidak tersedia</span></div>';
  if (poiCounts) {
    const healthItems = [
      ['hospital', 'Rumah Sakit'],
      ['clinic', 'Klinik'],
      ['pharmacy', 'Apotek']
    ].filter(([key]) => poiCounts[key] > 0);
    if (healthItems.length) {
      const rows = healthItems.map(([key, label]) => `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px"><span style="color:#54708d">${label}</span><span style="font-weight:600">${poiCounts[key]}</span></div>`).join('');
      kesehatanHtml = `<div><b>🏥 Akses Kesehatan</b><div style="margin-top:4px;display:grid;gap:2px">${rows}</div></div>`;
    }
  }

  let pendidikanHtml = '<div><b>🎓 Akses Pendidikan</b><span style="font-size:10px;color:#7a8fa3">Tidak tersedia</span></div>';
  if (poiCounts) {
    const eduItems = [
      ['school', 'Sekolah'],
      ['university', 'Universitas']
    ].filter(([key]) => poiCounts[key] > 0);
    if (eduItems.length) {
      const rows = eduItems.map(([key, label]) => `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px"><span style="color:#54708d">${label}</span><span style="font-weight:600">${poiCounts[key]}</span></div>`).join('');
      pendidikanHtml = `<div><b>🎓 Akses Pendidikan</b><div style="margin-top:4px;display:grid;gap:2px">${rows}</div></div>`;
    }
  }

  let risikoHtml = '<div><b>⚠️ Risiko Bencana</b><span style="font-size:10px;color:#7a8fa3">Tidak tersedia</span></div>';
  if (quake || hazard || karhutlaPayload?.features?.length) {
    const rows = [];
    if (quake) {
      const quakeCoords = (quake.Coordinates || '').split(',');
      const quakeLat = parseFloat(quakeCoords[0]);
      const quakeLon = parseFloat(quakeCoords[1]);
      const quakeDist = (Number.isFinite(quakeLat) && Number.isFinite(quakeLon) && location.lat && location.lon)
        ? geoidDistanceKm(location.lat, location.lon, quakeLat, quakeLon) : null;
      const distText = quakeDist != null ? `${quakeDist.toFixed(0)} km dari lokasi` : '';
      const quakeBtn = (Number.isFinite(quakeLat) && Number.isFinite(quakeLon))
        ? `<button type="button" class="geoid-risiko-button" title="Lihat lokasi gempa di peta" onclick="showGempaPopup(${quakeLat},${quakeLon},'${escapeGeoidHtml(String(quake.Magnitude || ''))}','${escapeGeoidHtml(quake.Wilayah || '')}','${escapeGeoidHtml(quake.Potensi || '')}','${escapeGeoidHtml(quake.Tanggal || '')}','${escapeGeoidHtml(quake.Jam || '')}','${escapeGeoidHtml(quake.Kedalaman || '')}','${escapeGeoidHtml(quake.Dirasakan || '')}')">📍</button>` : '';
      rows.push(`<div class="geoid-risiko-wrap"><div><span>Gempa</span><div style="font-weight:600;margin-top:1px;">M${escapeGeoidHtml(quake.Magnitude || '-')} · ${escapeGeoidHtml(quake.Wilayah || '')}</div></div>${quakeBtn}</div>`);
      if (distText) {
        rows.push(`<div><span>Jarak</span><div style="font-weight:600;margin-top:1px;">${distText}</div></div>`);
      }
    }
    if (karhutlaPayload?.features?.length) {
      const features = karhutlaPayload.features;
      const totalHotspot = features.length;
      const highConf = features.filter(f => f.properties?.confidence_level === 'high').length;
      const medConf = features.filter(f => f.properties?.confidence_level === 'medium').length;

      let nearestDist = Infinity;
      let nearestProps = null;
      features.forEach(f => {
        const p = f.properties;
        const hLat = Number(p.lat);
        const hLon = Number(p.long);
        if (!Number.isFinite(hLat) || !Number.isFinite(hLon)) return;
        if (!location.lat || !location.lon) return;
        const d = geoidDistanceKm(location.lat, location.lon, hLat, hLon);
        if (d < nearestDist) { nearestDist = d; nearestProps = p; }
      });

      const hasNearest = Number.isFinite(nearestDist);
      const distKm = hasNearest ? nearestDist : null;

      let riskLevel, riskColor;
      if (distKm === null) {
        riskLevel = '-';
        riskColor = '#64748b';
      } else if (distKm < 1) {
        riskLevel = 'Sangat Dekat (< 1 km)';
        riskColor = '#dc2626';
      } else if (distKm < 2) {
        riskLevel = 'Dekat (1–2 km)';
        riskColor = '#ef4444';
      } else if (distKm < 3) {
        riskLevel = 'Sedang (2–3 km)';
        riskColor = '#f59e0b';
      } else if (distKm < 4) {
        riskLevel = 'Jauh (3–4 km)';
        riskColor = '#22c55e';
      } else {
        riskLevel = 'Sangat Jauh (> 4 km)';
        riskColor = '#16a34a';
      }

      rows.push(`<div><span>Karhutla</span><div style="font-weight:600;margin-top:1px;">${totalHotspot} hotspot aktif</div></div>`);
      if (hasNearest) {
        const nearLabel = [nearestProps?.desa, nearestProps?.kecamatan, nearestProps?.kabkota].filter(Boolean).join(', ');
        const hotLat = Number(nearestProps?.lat);
        const hotLon = Number(nearestProps?.long);
        const hotBtn = (Number.isFinite(hotLat) && Number.isFinite(hotLon))
          ? `<button type="button" class="geoid-risiko-button" title="Lihat lokasi hotspot di peta" onclick="showHotspotPopup(${hotLat},${hotLon},'${escapeGeoidHtml(nearestProps?.desa || '')}','${escapeGeoidHtml(nearestProps?.kecamatan || '')}','${escapeGeoidHtml(nearestProps?.kabkota || '')}','${escapeGeoidHtml(nearestProps?.nama_provinsi || '')}','${escapeGeoidHtml(nearestProps?.sumber || '')}','${escapeGeoidHtml(String(nearestProps?.confidence || ''))}','${escapeGeoidHtml(nearestProps?.confidence_level || '')}','${escapeGeoidHtml(nearestProps?.date_hotspot || '')}','${escapeGeoidHtml(nearestProps?.route_create || '')}')">📍</button>` : '';
        rows.push(`<div class="geoid-risiko-wrap"><div><span>Jarak</span><div style="font-weight:600;margin-top:1px;">${distKm.toFixed(1)} km · ${escapeGeoidHtml(nearLabel)}</div></div>${hotBtn}</div>`);
      }
      rows.push(`<div><span>Risiko</span><div style="font-weight:700;margin-top:1px;color:${riskColor};">${riskLevel}</div></div>`);
    }
    if (hazard?.gempa) {
      rows.push(`<div><span>Zona Gempa</span><div style="font-weight:600;margin-top:1px;">${escapeGeoidHtml(hazard.gempa)}</div></div>`);
    }
    if (hazard?.longsor) {
      rows.push(`<div><span>Zona Longsor</span><div style="font-weight:600;margin-top:1px;">${escapeGeoidHtml(hazard.longsor)}</div></div>`);
    }
    if (rows.length) {
      risikoHtml = `<div><b>⚠️ Risiko Bencana</b><div style="margin-top:4px;display:grid;gap:2px">${rows.join('')}</div></div>`;
    }
  }

  if (hasPopup) {
    const cctvRow = nearest
      ? `<div class="geoid-popup-cctv" data-cctv-insight><div class="geoid-cctv-insight"><b>📹 CCTV terdekat</b><span>${escapeGeoidHtml(nearest.name)} · ${nearest.distance.toFixed(1)} km</span><button type="button" class="geoid-cctv-button" onclick="openCctvModal('${escapeGeoidHtml(nearest.id)}')" aria-label="Buka tayangan CCTV" title="Buka tayangan CCTV">▶</button></div></div>`
      : `<div class="geoid-popup-cctv" data-cctv-insight><div class="geoid-cctv-insight"><b>📹 CCTV terdekat</b><span>Tidak tersedia</span></div></div>`;
    element.innerHTML = `
      ${cctvRow}
      ${luasHtml}
      ${sawahHtml}
      ${weatherHtml}
      ${risikoHtml}
      ${poiHtml}
      ${kesehatanHtml}
      ${pendidikanHtml}
    `;
  }
  syncPopupContent(marker);

  } catch (err) {
    console.warn('Gagal memuat insight:', err);
    if (hasPopup) {
      element.innerHTML = '<div style="color:#e74c3c; font-size:11px">Gagal memuat data insight</div>';
    }
    syncPopupContent(marker);
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

function computePolygonAreaHa(path) {
  if (!Array.isArray(path) || !path.length) { console.warn('[GEOID] computePolygonAreaHa: path empty'); return 0; }
  const ring = Array.isArray(path[0]) && Array.isArray(path[0][0]) ? path[0] : path;
  if (!ring || ring.length < 3) { console.warn('[GEOID] computePolygonAreaHa: ring too short', ring?.length); return 0; }
  const R = 6371000;
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lat1, lng1] = ring[i];
    const [lat2, lng2] = ring[(i + 1) % ring.length];
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    area += dLng * (2 + Math.sin(lat1Rad) + Math.sin(lat2Rad));
  }
  const result = Math.abs(area * R * R / 2) / 10000;

  return result;
}

async function fetchLuasWilayah(kode) {
  if (!kode) { console.warn('[GEOID] fetchLuasWilayah: kode kosong'); return null; }
  try {
    const url = `https://wilayah.smartartstudio.my.id/api/boundaries/${kode}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) { console.warn('[GEOID] fetchLuasWilayah: HTTP', res.status); return null; }
    const data = await res.json();
    if (!data.path || !data.path.length) { console.warn('[GEOID] fetchLuasWilayah: no path in response'); return null; }
    const luas = computePolygonAreaHa(data.path);

    return { luas, nama: data.nama || '', desa: '', kec: '', kab: '', prov: '' };
  } catch (e) { console.warn('[GEOID] fetchLuasWilayah: error', e); return null; }
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

    const bAbort = new AbortController();
    const bTimeout = setTimeout(() => bAbort.abort(), 15000);
    const bRes = await fetch(`https://wilayah.smartartstudio.my.id/api/boundaries/${kode}`, { signal: bAbort.signal });
    clearTimeout(bTimeout);
    if (!bRes.ok) {
      console.warn('fetchLuasSawah: boundary fetch failed', bRes.status);
      return null;
    }
    const bData = await bRes.json();
    if (!bData.path || !bData.path.length) {
      console.warn('fetchLuasSawah: no boundary path');
      return null;
    }

    // Convert path [lat,lng] to rings [lon,lat] for Turf.js
    const rings = [bData.path.map(ring => ring.map(([lat, lng]) => [lng, lat]))];

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
  const sidebar = document.getElementById('sidebar-left');
  if (sidebar && !sidebar.classList.contains('collapsed')) {
    sidebar.classList.add('collapsed');
    const toggleBtn = document.getElementById('toggleBtn');
    if (toggleBtn) toggleBtn.innerHTML = '&gt;&gt;';
    setTimeout(() => map.invalidateSize(), 300);
  }

  const selection = getGeoidSelection();
  if (!Object.keys(selection).length) {
    alert('Silakan pilih wilayah terlebih dahulu');
    return;
  }

  const desaSelect = document.getElementById('pilihDesa');
  const selectedVillage = desaSelect && desaSelect.options[desaSelect.selectedIndex];
  const adm4Code = selectedVillage && selectedVillage.value;
  const selectedCode = adm4Code || document.getElementById('pilihKecamatan')?.value || document.getElementById('pilihKabupaten')?.value || document.getElementById('pilihProvinsi')?.value;

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
      const isGeotani = window.currentActiveTab === 'tab-geotani';
      if (isGeotani) {
        window._lastGeotaniLocation = { ...location, kode: location.kode || adm4Code };
        if (selection.desa) showGeoidBoundary(adm4Code, zoom);
      } else {
        const marker = showGeoidFlyup(location.lat, location.lon, {
          desa: selection.desa || selection.kecamatan || selection.kabkota || selection.provinsi,
          kecamatan: selection.kecamatan || location.kecamatan,
          kabkota: selection.kabkota || location.kabkota || location.kotkab,
          provinsi: selection.provinsi || location.provinsi,
          kode: selectedCode,
          postal_code: (selectedVillage && selectedVillage.dataset.postalCode) || location.postal_code || location.kodepos
        }, zoom);
        document.getElementById('adm-provinsi').innerText = selection.provinsi || location.provinsi || '-';
        document.getElementById('adm-kabkota').innerText = selection.kabkota || location.kabkota || location.kotkab || '-';
        document.getElementById('adm-kecamatan').innerText = selection.kecamatan || location.kecamatan || '-';
        document.getElementById('adm-desa').innerText = selection.desa || '-';
        document.getElementById('adm-jalan').innerText = '-';
        document.getElementById('adm-kodepos').innerText = (selectedVillage && selectedVillage.dataset.postalCode) || location.postal_code || location.kodepos || '-';
        await loadGeoidPopupInsights(marker, { ...location, kode: location.kode || adm4Code });
        if (typeof loadDukcapilPopulation === 'function') await loadDukcapilPopulation(marker, selectedCode, location);
        if (selectedCode) showGeoidBoundary(selectedCode, zoom);
        if (typeof loadPrayerSchedule === 'function') loadPrayerSchedule(marker, location.lat, location.lon);
      }
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
  if (window.currentActiveTab === 'tab-geotani') {
    window._lastGeotaniLocation = { ...location, kode: item.kode };
    showGeoidBoundary(item.kode, zoom);
  } else {
    const marker = showGeoidFlyup(location.lat, location.lon, {
      desa: item.desa,
      kecamatan: item.kecamatan,
      kabkota: item.kabkota,
      provinsi: item.provinsi,
      kode: item.kode
    }, zoom);
    await loadGeoidPopupInsights(marker, { ...location, kode: item.kode });
    if (typeof loadDukcapilPopulation === 'function') await loadDukcapilPopulation(marker, item.kode, location);
    showGeoidBoundary(item.kode, zoom);
    if (typeof loadPrayerSchedule === 'function') loadPrayerSchedule(marker, location.lat, location.lon);
  }
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
  if (window.currentActiveTab === 'tab-geotani') {
    window._lastGeotaniLocation = { lat: item.lat, lon: item.lon, kode: adm4Code };
    if (adm4Code) showGeoidBoundary(adm4Code, zoom);
  } else {
    const marker = showGeoidFlyup(item.lat, item.lon, {
      desa: matched ? matched.desa : item.name,
      kecamatan: matched ? matched.kecamatan : item.neighborhood || '',
      kabkota: matched ? matched.kabkota : item.subregion || item.region || '',
      provinsi: matched ? matched.provinsi : item.region || '',
      kode: adm4Code
    }, zoom);
    await loadGeoidPopupInsights(marker, { lat: item.lat, lon: item.lon, kode: adm4Code });
    if (adm4Code && typeof loadDukcapilPopulation === 'function') await loadDukcapilPopulation(marker, adm4Code, { lat: item.lat, lon: item.lon });
    if (adm4Code) showGeoidBoundary(adm4Code, zoom);
    if (typeof loadPrayerSchedule === 'function') loadPrayerSchedule(marker, item.lat, item.lon);
  }
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
    resetGeoidSelect(kecamatanSelect, 'Pilih Kabupaten/Kota');
    resetGeoidSelect(desaSelect, 'Pilih Kecamatan');
    updateApplyWilayahButton();

    if (this.value) {
      loadGeoidRegencies(this.value);
    }
  });

  kabupatenSelect.addEventListener('change', function() {
    geoidSelectedRegency = this.value;
    resetGeoidSelect(kecamatanSelect, 'Pilih Kecamatan', !this.value);
    resetGeoidSelect(desaSelect, 'Pilih Kecamatan');
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

window.printGeotaniPdf = async function() {
  if (!lastGeotaniPopupData) {
    alert('Tidak ada data geotani yang tersedia. Silakan pilih wilayah terlebih dahulu.');
    return;
  }

  const { kode, villageName, label, luasHa, sawahHa, pct, latLng, erosiKelas, ndviMean, cvss } = lastGeotaniPopupData;
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`;
  const fileName = `Geotani_${villageName.replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}.pdf`;
  const dateFormatted = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

  const btn = document.querySelector('.geotani-btn-print');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span>Membuat PDF…'; }

  const hiddenEls = [];
  const hiddenLayers = [];
  try {
    map.closePopup();
    const sidebar = document.getElementById('sidebar-left');
    if (sidebar && !sidebar.classList.contains('collapsed')) {
      sidebar.classList.add('collapsed');
      hiddenEls.push({ el: sidebar, cls: 'collapsed', remove: false });
    }
    const overlays = document.querySelectorAll('.unified-search, .map-insight-cards, .leaflet-control-zoom, .leaflet-control-locate, .reset-layers-btn, .leaflet-control-scale, .detail-panel-btn, #detail-panel');
    overlays.forEach(el => {
      if (el && getComputedStyle(el).display !== 'none') {
        el.style.setProperty('display', 'none', 'important');
        hiddenEls.push({ el, prop: 'display' });
      }
    });
    if (typeof selectedWeatherGroup !== 'undefined' && selectedWeatherGroup && map.hasLayer(selectedWeatherGroup)) {
      map.removeLayer(selectedWeatherGroup);
      hiddenLayers.push(selectedWeatherGroup);
    }
    map.invalidateSize();
    await new Promise(r => setTimeout(r, 300));

    if (geoidBoundaryLayer) {
      const bounds = geoidBoundaryLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { maxZoom: 16, duration: 0 });
      }
    }
    await new Promise(r => setTimeout(r, 2000));

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = 297, pageH = 210, margin = 8;

    const titleH = 14;
    const bottomStripH = 14;
    const mapFrameX = margin;
    const mapFrameY = margin + titleH + 2;
    const mapFrameW = 185;
    const mapFrameH = pageH - margin * 2 - titleH - 2 - bottomStripH;
    const panelX = mapFrameX + mapFrameW + 4;
    const panelW = pageW - panelX - margin;

    function hexToRgb(hex) {
      const h = hex.replace('#', '');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }

    function calcInterval(range, targetLines) {
      const raw = range / targetLines;
      const mag = Math.pow(10, Math.floor(Math.log10(raw)));
      const norm = raw / mag;
      if (norm <= 1.5) return mag;
      if (norm <= 3.5) return 2 * mag;
      if (norm <= 7.5) return 5 * mag;
      return 10 * mag;
    }

    pdf.setDrawColor(30, 41, 59);
    pdf.setLineWidth(0.4);
    pdf.rect(margin, margin, pageW - margin * 2, pageH - margin * 2);
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.2);
    pdf.line(margin, margin + titleH, pageW - margin, margin + titleH);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(30, 41, 59);
    pdf.text('Lahan Baku Sawah (2023)', margin + 2, margin + 6);
    const titleText = `${villageName} (${kode})`;
    const dashX = margin + 2 + pdf.getTextWidth('Lahan Baku Sawah (2023)') + 2;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5);
    pdf.setTextColor(150, 150, 150);
    pdf.text('-', dashX, margin + 6);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(22, 101, 52);
    pdf.text(titleText, dashX + 4, margin + 6);

    pdf.setFontSize(7.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(dateFormatted, pageW - margin - 2, margin + 5, { align: 'right' });
    if (luasHa > 0) pdf.text(luasHa.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' ha', pageW - margin - 2, margin + 9, { align: 'right' });
    pdf.setFontSize(7);
    pdf.setTextColor(150, 150, 150);
    pdf.text('WGS84 / EPSG:4326', pageW - margin - 2, margin + 12, { align: 'right' });

    pdf.setDrawColor(22, 163, 74);
    pdf.setLineWidth(0.3);
    pdf.rect(mapFrameX, mapFrameY, mapFrameW, mapFrameH);

    const leafletContainer = document.querySelector('.leaflet-container');
    if (leafletContainer) {
      map.getRenderer(map).options.padding = 0;
      map.invalidateSize();
      await new Promise(r => setTimeout(r, 200));
      const mapCanvas = await html2canvas(leafletContainer, { useCORS: true, allowTaint: true, scale: 2, logging: false, backgroundColor: '#e8e8e8' });
      const mapImg = mapCanvas.toDataURL('image/jpeg', 0.92);
      const imgAspect = mapCanvas.width / mapCanvas.height;
      const frameAspect = mapFrameW / mapFrameH;
      let drawW, drawH, drawX, drawY;
      if (imgAspect > frameAspect) {
        drawW = mapFrameW;
        drawH = mapFrameW / imgAspect;
        drawX = mapFrameX;
        drawY = mapFrameY + (mapFrameH - drawH) / 2;
      } else {
        drawH = mapFrameH;
        drawW = mapFrameH * imgAspect;
        drawX = mapFrameX + (mapFrameW - drawW) / 2;
        drawY = mapFrameY;
      }
      pdf.addImage(mapImg, 'JPEG', drawX, drawY, drawW, drawH);
    }

    const mapBounds = map.getBounds();
    const latMin = mapBounds.getSouth();
    const latMax = mapBounds.getNorth();
    const lonMin = mapBounds.getWest();
    const lonMax = mapBounds.getEast();
    const latRange = latMax - latMin;
    const lonRange = lonMax - lonMin;
    const latInterval = calcInterval(latRange, 6);
    const lonInterval = calcInterval(lonRange, 8);

    pdf.setDrawColor(180, 180, 180);
    pdf.setLineWidth(0.15);
    pdf.setFontSize(6);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(80, 80, 80);

    const latStart = Math.ceil(latMin / latInterval) * latInterval;
    for (let lat = latStart; lat <= latMax; lat += latInterval) {
      const ratio = (lat - latMin) / latRange;
      const py = mapFrameY + mapFrameH - ratio * mapFrameH;
      pdf.setLineDashPattern([1.5, 1.5], 0);
      pdf.line(mapFrameX, py, mapFrameX + mapFrameW, py);
      pdf.setLineDashPattern([], 0);
      pdf.text(lat.toFixed(latInterval < 0.1 ? 2 : 1) + '°', mapFrameX - 1, py + 1.5, { align: 'right' });
    }
    const lonStart = Math.ceil(lonMin / lonInterval) * lonInterval;
    for (let lon = lonStart; lon <= lonMax; lon += lonInterval) {
      const ratio = (lon - lonMin) / lonRange;
      const px = mapFrameX + ratio * mapFrameW;
      pdf.setLineDashPattern([1.5, 1.5], 0);
      pdf.line(px, mapFrameY, px, mapFrameY + mapFrameH);
      pdf.setLineDashPattern([], 0);
      pdf.text(lon.toFixed(lonInterval < 0.1 ? 2 : 1) + '°', px, mapFrameY + mapFrameH + 3.5, { align: 'center' });
    }

    const naX = mapFrameX + mapFrameW - 14;
    const naY = mapFrameY + 6;
    const naSize = 8;
    const naCx = naX + naSize / 2;
    pdf.setFillColor(22, 163, 74);
    pdf.triangle(naCx, naY, naCx - naSize / 2, naY + naSize, naCx + naSize / 2, naY + naSize, 'F');
    pdf.setFillColor(255, 255, 255);
    pdf.triangle(naCx, naY + naSize * 0.35, naCx - naSize * 0.25, naY + naSize, naCx + naSize * 0.25, naY + naSize, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(22, 163, 74);
    pdf.text('N', naCx, naY - 1.5, { align: 'center' });

    const sbX = mapFrameX + 6;
    const sbY = mapFrameY + mapFrameH - 10;
    const sbW = 50;
    const sbH = 3;
    const centerLat = (latMin + latMax) / 2;
    const metersPerDegLat = 111132.92 - 559.82 * Math.cos(2 * centerLat * Math.PI / 180);
    const metersPerPixel = (latRange * metersPerDegLat) / mapFrameH;
    const sbMeters = sbW * metersPerPixel;
    let sbLabelUnit = 'm';
    let sbValue = Math.round(sbMeters);
    if (sbMeters >= 1000) { sbValue = Math.round(sbMeters / 1000); sbLabelUnit = 'km'; }
    const actualMeters = sbLabelUnit === 'km' ? sbValue * 1000 : sbValue;
    const actualW = actualMeters / metersPerPixel;

    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(22, 163, 74);
    pdf.setLineWidth(0.2);
    pdf.rect(sbX, sbY, actualW, sbH, 'FD');
    pdf.setFillColor(22, 163, 74);
    pdf.rect(sbX, sbY, actualW / 2, sbH, 'F');
    pdf.setFillColor(255, 255, 255);
    pdf.rect(sbX + actualW / 2, sbY, actualW / 4, sbH, 'F');
    pdf.setFillColor(22, 163, 74);
    pdf.rect(sbX + actualW * 3 / 4, sbY, actualW / 4, sbH, 'F');
    pdf.setFontSize(5.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(55, 65, 81);
    pdf.text('0', sbX, sbY - 1);
    pdf.text(String(sbValue), sbX + actualW / 2, sbY - 1, { align: 'center' });
    pdf.text(sbValue * 2 + ' ' + sbLabelUnit, sbX + actualW, sbY - 1, { align: 'center' });

    const geotaniLegend = [
      { label: 'Sawah', color: '#22c55e', desc: 'Lahan baku sawah' },
      { label: 'Non-Sawah', color: '#94a3b8', desc: 'Lainnya' }
    ];
    const lgX = mapFrameX + mapFrameW - 52;
    const lgY = mapFrameY + mapFrameH - 20;
    const lgW = 48;
    const lgH = 16;
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(220, 220, 220);
    pdf.setLineWidth(0.2);
    pdf.roundedRect(lgX, lgY, lgW, lgH, 1, 1, 'FD');
    pdf.setFontSize(6);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(30, 41, 59);
    pdf.text('Legenda Penggunaan Lahan', lgX + 3, lgY + 4);
    let lgRowY = lgY + 8;
    for (const band of geotaniLegend) {
      const rgb = hexToRgb(band.color);
      pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
      pdf.rect(lgX + 3, lgRowY, 4, 3, 'F');
      pdf.setFontSize(5.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(55, 65, 81);
      pdf.text(band.label, lgX + 9, lgRowY + 2.5);
      pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
      pdf.text(band.desc, lgX + lgW - 3, lgRowY + 2.5, { align: 'right' });
      lgRowY += 4;
    }

    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.2);
    pdf.line(panelX, mapFrameY, panelX, mapFrameY + mapFrameH);

    let py = mapFrameY + 4;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(30, 41, 59);
    pdf.text('INFORMASI WILAYAH', panelX + 4, py);
    py += 6;

    const cardW = panelW - 8;
    const cardH = 14;
    pdf.setFillColor(240, 253, 244);
    pdf.setDrawColor(220, 252, 231);
    pdf.roundedRect(panelX + 4, py, cardW, cardH, 2, 2, 'FD');
    pdf.setFontSize(6);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    pdf.text('Nama Wilayah', panelX + 8, py + 5);
    pdf.text('Kode Wilayah', panelX + 8, py + 10);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(22, 101, 52);
    pdf.text(villageName || '-', panelX + 38, py + 5);
    pdf.setTextColor(55, 65, 81);
    pdf.text(kode || '-', panelX + 38, py + 10);
    py += cardH + 5;

    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(55, 65, 81);
    pdf.text('Data Spasial', panelX + 4, py);
    py += 4;

    const infoLines = [
      ['Luas Wilayah', luasHa > 0 ? luasHa.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' ha' : '-'],
      ['Luas Lahan Baku Sawah', sawahHa > 0 ? sawahHa.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' ha' : '-'],
      ['Rasio Sawah', pct && pct !== '-' ? pct + '%' : '-'],
      ['Tingkat', label || '-'],
      ['Erosi', erosiKelas || '-'],
      ['NDVI (Sentinel-2)', ndviMean != null ? Number(ndviMean).toFixed(4) : '-']
    ];
    for (const [infoLabel, value] of infoLines) {
      pdf.setFontSize(5.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 116, 139);
      pdf.text(infoLabel, panelX + 4, py);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(55, 65, 81);
      pdf.text(value, panelX + 38, py);
      py += 3.5;
    }

    py += 4;
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(55, 65, 81);
    pdf.text('Metadata & Kualitas', panelX + 4, py);
    py += 4;

    const metaLines = [
      ['Sumber', 'BMKG · BIG SatuPeta'],
      ['Tipe data', 'Batas wilayah + Lahan Baku Sawah 2023'],
      ['Referensi', 'EPSG:4326'],
      ['Metode', 'Geoprocessing Intersect'],
      ['Kualitas', 'Batas Desa/Kelurahan (BIG)']
    ];
    for (const [metaLabel, value] of metaLines) {
      pdf.setFontSize(5.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 116, 139);
      pdf.text(metaLabel, panelX + 4, py);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(55, 65, 81);
      pdf.text(value, panelX + 38, py);
      py += 3.5;
    }

    if (cvss) {
      py += 4;
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(55, 65, 81);
      pdf.text('SKOR KERENTANAN PERTANIAN', panelX + 4, py);
      py += 4;

      const cvssRgb = hexToRgb(cvss.color);
      pdf.setFillColor(cvssRgb[0], cvssRgb[1], cvssRgb[2]);
      pdf.roundedRect(panelX + 4, py, cardW, 10, 2, 2, 'F');
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(255, 255, 255);
      pdf.text(cvss.score.toFixed(1), panelX + 8, py + 7);
      pdf.setFontSize(6);
      pdf.text(cvss.severity.toUpperCase(), panelX + 28, py + 7);
      py += 14;

      pdf.setFontSize(5.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 116, 139);
      const cvssLines = [
        ['Insight', cvss.insight || '-'],
        ['Prioritas', cvss.prioritas || '-'],
        ['Vector', cvss.vector || '-']
      ];
      for (const [cvssLabel, value] of cvssLines) {
        pdf.setFontSize(5.5);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 116, 139);
        pdf.text(cvssLabel, panelX + 4, py);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(55, 65, 81);
        const lines = pdf.splitTextToSize(value, cardW - 40);
        pdf.text(lines, panelX + 38, py);
        py += lines.length * 3 + 2;
      }
    }

    const bottomY = pageH - margin - 2;
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.2);
    pdf.line(margin, bottomY - bottomStripH + 2, pageW - margin, bottomY - bottomStripH + 2);
    pdf.setFontSize(6);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(120, 120, 120);
    pdf.text('Sumber data: BMKG · BIG SatuPeta · Sentinel-2 · Dibuat oleh RuangKita Pro', margin + 2, bottomY - 4);
    pdf.text('Cetak: ' + dateFormatted, pageW - margin - 2, bottomY - 4, { align: 'right' });
    pdf.setFontSize(5);
    pdf.setTextColor(160, 160, 160);
    pdf.text('Koordinat: WGS84 / EPSG:4326 · Grid graticule untuk referensi ArcGIS / QGIS', margin + 2, bottomY);

    pdf.save(fileName);
  } catch (error) {
    console.error('[Geotani] Gagal membuat PDF:', error);
    alert('Gagal membuat PDF: ' + (error.message || 'Terjadi kesalahan'));
  } finally {
    for (const layer of hiddenLayers) {
      if (layer && !map.hasLayer(layer)) layer.addTo(map);
    }
    for (const item of hiddenEls) {
      if (item.prop) item.el.style[item.prop] = '';
      else if (item.remove === false) item.el.classList.remove(item.cls);
    }
    map.invalidateSize();
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Cetak PDF'; }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const geoidTab = document.getElementById('tab-geoid');
  if (geoidTab) {
    loadGeoidProvinces();
    setupGeoidDropdowns();
    setupGeoidSearch();
    buildGeoidSearchIndex();
  }
});
