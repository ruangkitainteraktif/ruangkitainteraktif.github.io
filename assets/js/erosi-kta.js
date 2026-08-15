// ==========================================
// EROSI KTA - Konservasi Tanah dan Air
// Layer erosi dari BIG + Insight Pertanian
// ==========================================

const EROSI_WMS_URL = 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/KEHUTANAN/MapServer';
const EROSI_LAYER_ID = 14;

let erosiLayer = null;
let erosiCheckboxBound = false;
let lastKtaData = null;

// ---- KTA Matrix Classification ----
const KTA_MATRIX = [
  {
    kelas: 'Sangat Ringan - Ringan',
    range: '≤ 15 - 60 Ton/Ha/Th',
    color: '#4caf50',
    bgColor: '#e8f5e9',
    icon: '✅',
    dampak: 'Sedimentasi minimal, pola irigasi lancar, kesuburan tanah stabil.',
    vegetatif: 'Pematang ditanami rumput penguat. Pengolahan tanah minimum (minimum tillage).',
    sipilTeknis: 'Perbaikan pematang/galengan sawah secara berkala.',
    prioritas: 'Rendah'
  },
  {
    kelas: 'Sedang',
    range: '> 60 - 180 Ton/Ha/Th',
    color: '#ff9800',
    bgColor: '#fff3e0',
    icon: '⚠️',
    dampak: 'Peningkatan lumpur halus di saluran irigasi, pendangkalan parit pasokan air saat hujan deras.',
    vegetatif: 'Cover crop (tanaman penutup tanah) di pematang. Mulsa organik pasca panen.',
    sipilTeknis: 'Pembuatan saluran pengelak (diversion ditch). Teras gulud pada sawah tadah hujan berlereng.',
    prioritas: 'Sedang'
  },
  {
    kelas: 'Berat',
    range: '> 180 - 480 Ton/Ha/Th',
    color: '#f44336',
    bgColor: '#ffebee',
    icon: '🔴',
    dampak: 'Pendangkalan saluran irigasi cepat, risiko erosi lembar (sheet erosion) merusak lapisan olah sawah.',
    vegetatif: 'Penanaman Rumput Vetiver / Rumput Gajah di tebing pematang/lereng batas sawah.',
    sipilTeknis: 'Rorak (lubang penampung sedimen) di sekitar inlet irigasi. Teras bangku (bench terrace) pada sawah lereng.',
    prioritas: 'Tinggi'
  },
  {
    kelas: 'Sangat Berat',
    range: '> 480 Ton/Ha/Th',
    color: '#b71c1c',
    bgColor: '#ffcdd2',
    icon: '🚨',
    dampak: 'Kerap terjadi tanah longsor tebing sawah, penyumbatan total pintu air, hilangnya lahan sawah produktif.',
    vegetatif: 'Pengalihan sawah miring/tadah hujan ke Agroforestri / Hutan Rakyat. Reboisasi bentang lahan sekitar.',
    sipilTeknis: 'Check Dam / Bendung penahan sedimen di hulu aloran air sawah. Bronjong (gabion) penguat lereng sawah.',
    prioritas: 'Kritis'
  }
];

function getKtaClassification(nilaiTonHaTh) {
  const v = Number(nilaiTonHaTh);
  if (isNaN(v) || v < 0) return null;
  if (v <= 60) return KTA_MATRIX[0];
  if (v <= 180) return KTA_MATRIX[1];
  if (v <= 480) return KTA_MATRIX[2];
  return KTA_MATRIX[3];
}

function getKtaByKelasName(kelasName) {
  if (!kelasName) return null;
  const lower = kelasName.toLowerCase().trim();
  if (lower.includes('sangat berat')) return KTA_MATRIX[3];
  if (lower.includes('berat')) return KTA_MATRIX[2];
  if (lower.includes('sedang')) return KTA_MATRIX[1];
  if (lower.includes('ringan') || lower.includes('sangat ringan')) return KTA_MATRIX[0];
  return null;
}

// ---- Fetch Erosion Data at a Point (latlng) ----
async function fetchErosiAtPoint(lat, lon) {
  try {
    const pointGeom = JSON.stringify({ x: lon, y: lat, spatialReference: { wkid: 4326 } });
    const params = new URLSearchParams({
      f: 'json',
      geometry: pointGeom,
      geometryType: 'esriGeometryPoint',
      spatialRel: 'esriSpatialRelIntersects',
      returnGeometry: 'false',
      outFields: '*',
      sr: '4326'
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${EROSI_WMS_URL}/${EROSI_LAYER_ID}/query?${params}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.features || !data.features.length) return null;
    return data.features[0].attributes || null;
  } catch (e) {
    console.warn('fetchErosiAtPoint error:', e);
    return null;
  }
}

// ---- Parse Erosion Class String to Numeric Value ----
function parseErosiValue(klasText) {
  if (!klasText) return 0;
  const str = String(klasText);
  // Match patterns like "<= 15 Ton/Ha/Tahun", "> 180 - 480 Ton/Ha/Th", "> 480 Ton/Ha/Th"
  const match = str.match(/(\d+[\.,]?\d*)/);
  if (match) return parseFloat(match[1].replace(',', '.'));
  return 0;
}

// ---- Fetch Erosion Data within a Bounding Box ----
async function fetchErosiInEnvelope(minX, minY, maxX, maxY) {
  try {
    const envelope = `${minX},${minY},${maxX},${maxY}`;
    const params = new URLSearchParams({
      f: 'json',
      returnGeometry: 'true',
      where: '1=1',
      geometry: envelope,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: '*',
      outSR: '4326'
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(`${EROSI_WMS_URL}/${EROSI_LAYER_ID}/query?${params}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.features || !data.features.length) return [];
    return data.features;
  } catch (e) {
    console.warn('fetchErosiInEnvelope error:', e);
    return [];
  }
}

// ---- Analyze Erosion for a Sawah Polygon ----
async function analyzeErosiForSawah(sawahGeometry) {
  if (!sawahGeometry || !sawahGeometry.rings) return null;

  try {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    sawahGeometry.rings.forEach(ring => {
      ring.forEach(([x, y]) => {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      });
    });

    const erosiFeatures = await fetchErosiInEnvelope(minX, minY, maxX, maxY);
    if (!erosiFeatures || !erosiFeatures.length) return null;

    // Classify erosion for this sawah area
    const classCount = {};
    let totalValue = 0;
    let valueCount = 0;

    erosiFeatures.forEach(f => {
      const attrs = f.attributes || {};
      const kelas = attrs.klas_erosi || attrs.KLAS_EROSI || attrs.kelas_erosi ||
                    attrs.KELAS_EROSI || attrs.erosion_class ||
                    attrs.kelas || attrs.KELAS || attrs.nama_kelas || attrs.NAMA_KELAS || '';
      const nilai = parseErosiValue(kelas);

      if (kelas) {
        const k = String(kelas).trim();
        classCount[k] = (classCount[k] || 0) + 1;
      }
      const n = Number(nilai);
      if (!isNaN(n) && n > 0) {
        totalValue += n;
        valueCount++;
      }
    });

    // Find dominant class
    let dominantClass = '';
    let maxCount = 0;
    Object.entries(classCount).forEach(([cls, count]) => {
      if (count > maxCount) {
        maxCount = count;
        dominantClass = cls;
      }
    });

    const avgValue = valueCount > 0 ? totalValue / valueCount : 0;
    const kta = getKtaByKelasName(dominantClass) || getKtaClassification(avgValue);

    return {
      totalFeatures: erosiFeatures.length,
      dominantClass,
      avgValue: Math.round(avgValue * 100) / 100,
      classCount,
      kta,
      rawFeatures: erosiFeatures
    };
  } catch (e) {
    console.warn('analyzeErosiForSawah error:', e);
    return null;
  }
}

// ---- Generate KTA Insight HTML for Popup ----
function generateKtaInsightHtml(erosiResult, sawahHa) {
  if (!erosiResult || !erosiResult.kta) {
    return `
      <div style="margin-top:10px;padding:8px 10px;background:#f5f7fa;border-radius:6px;border-left:3px solid #90a4ae;">
        <div style="font-size:11px;font-weight:700;color:#37474f;margin-bottom:4px;">🛡️ Matriks Konservasi Tanah & Air (KTA)</div>
        <div style="font-size:10px;color:#78909c;">Data erosi tidak tersedia untuk lokasi ini.</div>
      </div>`;
  }

  const kta = erosiResult.kta;
  const fmtNum = (n) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 2 });

  // Hitung % sawah berisiko (jika ada data sawah)
  let riskHtml = '';
  let riskPct = 0;
  if (sawahHa && sawahHa > 0 && erosiResult.totalFeatures > 0) {
    const beratCount = (erosiResult.classCount['Berat'] || 0) + (erosiResult.classCount['BERAT'] || 0);
    const sbCount = (erosiResult.classCount['Sangat Berat'] || 0) + (erosiResult.classCount['SANGAT BERAT'] || 0);
    const totalClassified = Object.values(erosiResult.classCount).reduce((a, b) => a + b, 0);
    riskPct = totalClassified > 0 ? (((beratCount + sbCount) / totalClassified) * 100).toFixed(1) : '0';

    let riskLevel = 'Rendah';
    let riskColor = '#4caf50';
    if (Number(riskPct) > 60) { riskLevel = 'Sangat Tinggi'; riskColor = '#b71c1c'; }
    else if (Number(riskPct) > 30) { riskLevel = 'Tinggi'; riskColor = '#f44336'; }
    else if (Number(riskPct) > 10) { riskLevel = 'Sedang'; riskColor = '#ff9800'; }

    riskHtml = `
      <div style="margin-top:6px;padding:6px 8px;background:#fff;border-radius:4px;border:1px solid #e0e0e0;">
        <div style="font-size:10px;color:#546e7a;margin-bottom:3px;">Persentase Sawah Berisiko (Erosi Berat + Sangat Berat)</div>
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="flex:1;height:6px;background:#e0e0e0;border-radius:3px;overflow:hidden;">
            <div style="width:${Math.min(Number(riskPct), 100)}%;height:100%;background:${riskColor};border-radius:3px;"></div>
          </div>
          <span style="font-size:11px;font-weight:700;color:${riskColor};">${riskPct}%</span>
        </div>
        <div style="font-size:9px;color:#78909c;margin-top:2px;">Level Risiko: <b style="color:${riskColor}">${riskLevel}</b></div>
        ${Number(riskPct) > 30 ? `<div style="font-size:9px;color:#c62828;margin-top:3px;font-style:italic;">⚠️ Desa berisiko mengalami penurunan ketahanan pangan akibat pendangkalan irigasi dan degradasi tanah olah.</div>` : ''}
      </div>`;
  }

  // Rincian kelas erosi
  let kelasRows = '';
  const kelasEntries = Object.entries(erosiResult.classCount);
  if (kelasEntries.length) {
    const total = kelasEntries.reduce((a, b) => a + b[1], 0);
    kelasRows = kelasEntries.map(([cls, count]) => {
      const pct = ((count / total) * 100).toFixed(1);
      const ktaItem = getKtaByKelasName(cls);
      const clr = ktaItem ? ktaItem.color : '#78909c';
      return `<div style="display:flex;justify-content:space-between;font-size:9px;padding:1px 0;">
        <span style="color:#546e7a">${cls}</span>
        <span style="font-weight:600;color:${clr}">${count} bidang (${pct}%)</span>
      </div>`;
    }).join('');
  }

  return `
    <div style="margin-top:10px;padding:8px 10px;background:${kta.bgColor};border-radius:6px;border-left:3px solid ${kta.color};">
      <div style="font-size:11px;font-weight:700;color:#37474f;margin-bottom:4px;">🛡️ Matriks Konservasi Tanah & Air (KTA)</div>

      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
        <span style="font-size:14px;">${kta.icon}</span>
        <div>
          <div style="font-size:10px;font-weight:700;color:${kta.color};">Erosi ${kta.kelas}</div>
          <div style="font-size:9px;color:#78909c;">${kta.range}</div>
        </div>
        <div style="margin-left:auto;font-size:9px;padding:2px 6px;background:${kta.color};color:#fff;border-radius:10px;font-weight:600;">${kta.prioritas}</div>
      </div>

      <div style="font-size:9px;color:#455a64;margin-bottom:4px;"><b>Dampak:</b> ${kta.dampak}</div>

      ${erosiResult.dominantClass ? `<div style="font-size:9px;color:#78909c;margin-bottom:4px;">Kelas dominan: <b>${erosiResult.dominantClass}</b> (${erosiResult.totalFeatures} zona erosi terdeteksi)</div>` : ''}

      ${riskHtml}

      ${kelasRows ? `
      <div style="margin-top:6px;padding:5px 8px;background:rgba(255,255,255,0.7);border-radius:4px;">
        <div style="font-size:9px;font-weight:600;color:#455a64;margin-bottom:2px;">Rincian Zona Erosi:</div>
        ${kelasRows}
      </div>` : ''}

      <div style="margin-top:6px;padding:5px 8px;background:rgba(255,255,255,0.7);border-radius:4px;">
        <div style="font-size:9px;font-weight:600;color:#455a64;margin-bottom:2px;">🌱 Rekomendasi Vegetatif:</div>
        <div style="font-size:9px;color:#546e7a;">${kta.vegetatif}</div>
      </div>

      <div style="margin-top:4px;padding:5px 8px;background:rgba(255,255,255,0.7);border-radius:4px;">
        <div style="font-size:9px;font-weight:600;color:#455a64;margin-bottom:2px;">🏗️ Rekomendasi Sipil Teknis:</div>
        <div style="font-size:9px;color:#546e7a;">${kta.sipilTeknis}</div>
      </div>

      ${Number(riskPct) > 30 ? `
      <div style="margin-top:6px;padding:5px 8px;background:#fff3e0;border-radius:4px;border:1px solid #ffe0b2;">
        <div style="font-size:9px;font-weight:600;color:#e65100;margin-bottom:2px;">📋 Arahan Alokasi Program Poktan:</div>
        <div style="font-size:9px;color:#bf360c;">
          ${Number(riskPct) > 60
            ? 'Prioritas: Konversi lahan miring ke Agroforestri, bibit Rumput Vetiver, Check Dam, Bronjong penguat lereng.'
            : 'Prioritas: Rorak, Pengerukan Saluran Irigasi, Teras Bangku, pupuk hayati & benih penutup tanah.'}
        </div>
      </div>` : ''}

      <div style="margin-top:4px;font-size:8px;color:#b0bec5;text-align:right;">Sumber: BIG SatuPeta - Kehutanan/MapServer/14</div>
    </div>`;
}

// ---- Generate KTA Insight for Geotani Village Popup ----
function generateKtaVillageInsightHtml(erosiResult, sawahHa, luasWilayahHa) {
  if (!erosiResult || !erosiResult.kta) {
    return `
      <div style="padding-bottom:8px;border-bottom:1px solid #eef3f8;">
        <b>Analisis KTA (Konservasi Tanah & Air)</b>
        <div style="margin-top:4px;font-size:10px;color:#78909c;">Data erosi tidak tersedia untuk wilayah ini.</div>
      </div>`;
  }

  const kta = erosiResult.kta;
  const fmtNum = (n) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 2 });

  // Hitung % sawah berisiko
  let riskPct = 0;
  let riskLevel = 'Rendah';
  let riskColor = '#4caf50';
  if (sawahHa && sawahHa > 0 && erosiResult.totalFeatures > 0) {
    const beratCount = (erosiResult.classCount['Berat'] || 0) + (erosiResult.classCount['BERAT'] || 0);
    const sbCount = (erosiResult.classCount['Sangat Berat'] || 0) + (erosiResult.classCount['SANGAT BERAT'] || 0);
    const totalClassified = Object.values(erosiResult.classCount).reduce((a, b) => a + b, 0);
    riskPct = totalClassified > 0 ? ((beratCount + sbCount) / totalClassified) * 100 : 0;

    if (riskPct > 60) { riskLevel = 'Sangat Tinggi'; riskColor = '#b71c1c'; }
    else if (riskPct > 30) { riskLevel = 'Tinggi'; riskColor = '#f44336'; }
    else if (riskPct > 10) { riskLevel = 'Sedang'; riskColor = '#ff9800'; }
  }

  // Rincian kelas
  let kelasRows = '';
  const kelasEntries = Object.entries(erosiResult.classCount);
  if (kelasEntries.length) {
    const total = kelasEntries.reduce((a, b) => a + b[1], 0);
    kelasRows = kelasEntries.map(([cls, count]) => {
      const pct = ((count / total) * 100).toFixed(1);
      const ktaItem = getKtaByKelasName(cls);
      const clr = ktaItem ? ktaItem.color : '#78909c';
      return `<div style="display:flex;justify-content:space-between;font-size:9px;padding:1px 0;">
        <span style="color:#546e7a">${cls}</span>
        <span style="font-weight:600;color:${clr}">${count} (${pct}%)</span>
      </div>`;
    }).join('');
  }

  // Narasi laporan untuk Dana Desa
  let narasiHtml = '';
  if (sawahHa && sawahHa > 0 && riskPct > 30) {
    const sawahRiskHa = (sawahHa * riskPct / 100).toFixed(1);
    const rekomendasi = riskPct > 60
      ? `Konversi lahan miring ke Agroforestri, penanaman Rumput Vetiver, pembuatan Check Dam & Bronjong penguat lereng.`
      : `Pembuatan Rorak, pengerukan saluran irigasi, Teras Bangku pada sawah berlereng.`;
    narasiHtml = `
      <div style="margin-top:6px;padding:6px 8px;border-radius:4px;border:1px solid #ffe082;background:#fffde7;">
        <div style="font-size:9px;font-weight:600;color:#f57f17;margin-bottom:2px;">📋 Rekomendasi Dana Desa (Ketahanan Pangan)</div>
        <div style="font-size:9px;color:#5d4037;font-style:italic;line-height:1.4;">
          "Wilayah ini memiliki total sawah <b>${fmtNum(sawahHa)} Ha</b>.
          Dari data overlay, <b>${fmtNum(sawahRiskHa)} Ha (${riskPct.toFixed(1)}%)</b> berada pada kawasan ber-erosi ${kta.kelas}.
          Direkomendasikan alokasi Dana Desa fokus pada ${rekomendasi}"
        </div>
      </div>`;
  }

  return `
    <div style="padding-bottom:8px;border-bottom:1px solid #eef3f8;">
      <b>Analisis KTA (Konservasi Tanah & Air)</b>
      <div style="margin-top:4px;display:flex;align-items:center;gap:6px;">
        <span style="font-size:12px;">${kta.icon}</span>
        <div>
          <span style="font-size:10px;font-weight:600;color:${kta.color};">Erosi ${kta.kelas}</span>
          <span style="font-size:9px;color:#78909c;"> (${kta.range})</span>
        </div>
        <span style="margin-left:auto;font-size:8px;padding:2px 6px;background:${kta.color};color:#fff;border-radius:8px;font-weight:600;">${kta.prioritas}</span>
      </div>
      <div style="font-size:9px;color:#546e7a;margin-top:3px;">${kta.dampak}</div>

      ${riskPct > 0 ? `
      <div style="margin-top:4px;display:flex;align-items:center;gap:6px;">
        <div style="flex:1;height:5px;background:#e0e0e0;border-radius:3px;overflow:hidden;">
          <div style="width:${Math.min(riskPct, 100)}%;height:100%;background:${riskColor};border-radius:3px;"></div>
        </div>
        <span style="font-size:9px;font-weight:700;color:${riskColor};">${riskPct.toFixed(1)}% sawah berisiko</span>
      </div>` : ''}

      ${kelasRows ? `
      <div style="margin-top:4px;padding:4px 6px;background:#f5f7fa;border-radius:4px;">
        <div style="font-size:9px;font-weight:600;color:#455a64;margin-bottom:2px;">Rincian:</div>
        ${kelasRows}
      </div>` : ''}

      <div style="margin-top:4px;font-size:9px;color:#546e7a;">
        <b>🌱 Vegetatif:</b> ${kta.vegetatif}
      </div>
      <div style="margin-top:2px;font-size:9px;color:#546e7a;">
        <b>🏗️ Sipil Teknis:</b> ${kta.sipilTeknis}
      </div>

      ${narasiHtml}

      <div style="margin-top:4px;font-size:8px;color:#b0bec5;text-align:right;">Sumber: BIG SatuPeta</div>
    </div>`;
}

// ---- Show KTA Popup (Separate from Geotani Popup) ----
function showKtaPopup(lat, lon, encodedKode) {
  const kode = decodeURIComponent(encodedKode);
  const ktaData = window._lastGeotaniKtaData;
  if (!ktaData || !ktaData.erosiSource) return;

  const { erosiSource, sawahHa, luasWilayahHa } = ktaData;
  const kelas = erosiSource.klas_erosi || erosiSource.KLAS_EROSI || erosiSource.kelas_erosi ||
                erosiSource.KELAS_EROSI || erosiSource.erosion_class ||
                erosiSource.kelas || erosiSource.KELAS || erosiSource.nama_kelas || '';
  const nilai = typeof parseErosiValue === 'function' ? parseErosiValue(kelas) : 0;
  const kta = (typeof getKtaByKelasName === 'function' ? getKtaByKelasName(kelas) : null) ||
              (typeof getKtaClassification === 'function' ? getKtaClassification(nilai) : null);

  if (!kta) return;

  const classCount = erosiSource._classCount || (kelas ? { [kelas]: 1 } : {});
  const totalFeatures = erosiSource._totalFeatures || 1;

  const ktaContent = generateKtaVillageInsightHtml({
    totalFeatures,
    dominantClass: kelas,
    avgValue: Number(nilai) || 0,
    classCount,
    kta
  }, sawahHa, luasWilayahHa);

  const popupHtml = `
    <div class="kta-popup">
      <div class="kta-popup-header">
        <div class="kta-popup-badge">
          <span class="kta-popup-badge-dot"></span>
          KTA Analysis
        </div>
        <strong>Konservasi Tanah & Air</strong>
        <span>Analisis erosi dan rekomendasi konservasi</span>
      </div>
      <div class="kta-popup-body">
        ${ktaContent}
      </div>
      <div class="kta-popup-footer" style="padding:8px 12px;background:#f0f7ff;border-top:1px solid #e0e8f0;text-align:center;">
        <span style="font-size:9px;color:#64748b;">Sumber: BIG SatuPeta</span>
        <div style="display:flex;justify-content:center;gap:8px;margin-top:6px;">
          <button class="kta-btn-print" onclick="printKtaPdf()">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 9V2h12v7"/>
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Cetak PDF
          </button>
        </div>
      </div>
    </div>
  `;

  if (typeof map !== 'undefined' && map) {
    const marker = L.marker([lat, lon], {
      icon: L.divIcon({
        className: 'kta-marker-wrap',
        html: '<div class="kta-marker">🌱</div>',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -20]
      }),
      zIndexOffset: 3000
    }).addTo(map);

    marker.bindPopup(popupHtml, { maxWidth: 360, className: 'kta-leaflet-popup' });
    marker.openPopup();
  }
}

// ---- Toggle Erosion Layer (WMS Raster) ----
function toggleErosiLayer(visible) {
  if (!visible) {
    if (erosiLayer && map.hasLayer(erosiLayer)) {
      map.removeLayer(erosiLayer);
      erosiLayer = null;
    }
    return;
  }

  try {
    erosiLayer = L.tileLayer.wms(`${EROSI_WMS_URL}`, {
      layers: `14`,
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      tiled: true,
      opacity: 0.7,
      crossOrigin: true
    }).addTo(map);

    erosiLayer.on('load', function() {

    });
  } catch (e) {
    console.warn('Gagal memuat layer erosi:', e);
  }
}

// ---- Fetch Sawah Features in Envelope (ArcGIS Sawah 2023) ----
const SAWAH_2023_URL = 'https://sig02.pertanian.go.id/server/rest/services/Sawah/Sawah2023/MapServer/0/query';

async function fetchSawahInEnvelope(minX, minY, maxX, maxY) {
  try {
    const envelope = `${minX},${minY},${maxX},${maxY}`;
    let allFeatures = [];
    let offset = 0;
    const maxPerRequest = 1000;

    do {
      const params = new URLSearchParams({
        f: 'json', returnGeometry: 'true', where: '1=1',
        geometry: envelope, geometryType: 'esriGeometryEnvelope',
        inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
        outFields: 'OBJECTID,WADMPR,WADMKK,WIADKK,Jenis_Lahan_Sawah,Luas_Ha',
        outSR: '4326',
        resultOffset: String(offset),
        resultRecordCount: String(maxPerRequest),
        returnCountOnly: 'false'
      });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(`${SAWAH_2023_URL}?${params}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) break;
      const data = await res.json();
      const features = data.features || [];
      allFeatures = allFeatures.concat(features);
      if (!features.length || features.length < maxPerRequest) break;
      const exceeded = data.exceededTransferLimit || (data.properties && data.properties.exceededTransferLimit);
      if (!exceeded) break;
      offset += maxPerRequest;
    } while (true);

    return allFeatures;
  } catch (e) {
    console.warn('fetchSawahInEnvelope error:', e);
    return [];
  }
}

// ---- Fetch Kawasan Pertanian in Envelope ----
const KAWASAN_CONFIG = {
  'kawasan-padi':    'https://sig02.pertanian.go.id/server/rest/services/Kawasan/Peta_Kawasan_Padi/MapServer/0/query',
  'kawasan-jagung':  'https://sig02.pertanian.go.id/server/rest/services/Kawasan/Peta_Kawasan_Jagung/MapServer/0/query',
  'kawasan-kedelai': 'https://sig02.pertanian.go.id/server/rest/services/Kawasan/Peta_Kawasan_Kedelai/MapServer/0/query',
};

async function fetchKawasanInEnvelope(minX, minY, maxX, maxY, type) {
  const url = KAWASAN_CONFIG[type];
  if (!url) return [];
  try {
    const envelope = `${minX},${minY},${maxX},${maxY}`;
    let allFeatures = [];
    let offset = 0;
    do {
      const params = new URLSearchParams({
        f: 'json', returnGeometry: 'true', where: '1=1',
        geometry: envelope, geometryType: 'esriGeometryEnvelope',
        inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
        outFields: '*', outSR: '4326',
        resultOffset: String(offset),
        resultRecordCount: '1000'
      });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`${url}?${params}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) break;
      const data = await res.json();
      const features = data.features || [];
      allFeatures = allFeatures.concat(features);
      if (features.length < 1000 || !data.exceededTransferLimit) break;
      offset += 1000;
    } while (offset < 5000);

    return allFeatures;
  } catch (e) {
    console.warn('fetchKawasanInEnvelope error:', type, e);
    return [];
  }
}

// ---- Fetch Village Boundary ----
async function fetchVillageBoundary(kode) {
  const url = `https://wilayah.smartartstudio.my.id/api/boundaries/${kode}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.path || !data.path.length) return null;
      // Convert path [lat,lng] to rings [lon,lat] for GeoJSON/Turf.js
      const rings = data.path.map(ring => ring.map(([lat, lng]) => [lng, lat]));
      return {
        geometry: { rings },
        attributes: { WADMKD: data.nama || '' }
      };
    } catch (e) {
      console.warn(`[KTA] fetchVillageBoundary attempt ${attempt + 1} failed:`, e.message);
      if (attempt === 0) await new Promise(r => setTimeout(r, 1000));
    }
  }
  return null;
}

// ---- Compute Overlay Intersection (Layer1 × Layer2 × Desa) ----
async function computeOverlayIntersection(villageKode, options = {}) {
  if (!villageKode || typeof turf === 'undefined') {
    console.warn('[KTA] computeOverlayIntersection: turf not loaded or no kode', { villageKode, turfLoaded: typeof turf !== 'undefined' });
    return [];
  }

  const {
    layer1 = 'sawah-2023',
    layer2 = 'erosi',
    clipToVillage = true
  } = options;

  try {
    // 1. Fetch village boundary
    const villageFeature = await fetchVillageBoundary(villageKode);
    if (!villageFeature || !villageFeature.geometry?.rings) {
      console.warn('[KTA] computeOverlayIntersection: village boundary not found for kode:', villageKode);
      return [];
    }

    const villagePolyRaw = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: villageFeature.geometry.rings }
    };
    let villagePolygon;
    try { villagePolygon = turf.rewind(villagePolyRaw); } catch (e) { villagePolygon = villagePolyRaw; }

    // 2. Compute bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    villageFeature.geometry.rings.forEach(ring => {
      ring.forEach(([x, y]) => {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      });
    });
    if (minX >= maxX || minY >= maxY) {
      console.warn('[KTA] computeOverlayIntersection: degenerate bounding box', { minX, maxX, minY, maxY });
      return [];
    }

    // 3. Fetch Layer 1 (Sawah) + Layer 2 in parallel
    const [sawahFeatures, layer2Features] = await Promise.all([
      fetchSawahInEnvelope(minX, minY, maxX, maxY),
      layer2 === 'erosi'
        ? fetchErosiInEnvelope(minX, minY, maxX, maxY)
        : fetchKawasanInEnvelope(minX, minY, maxX, maxY, layer2)
    ]);

    if (!sawahFeatures.length || !layer2Features.length) {
      console.warn('[KTA] computeOverlayIntersection: missing features', { sawahCount: sawahFeatures.length, layer2Count: layer2Features.length, layer2 });
      return [];
    }

    // 4. Convert Layer 2 features to turf polygons
    const layer2Polys = layer2Features
      .filter(f => f.geometry?.rings || f.geometry?.polygon?.rings)
      .map(f => {
        const rings = f.geometry.rings || f.geometry.polygon?.rings || [];
        if (!rings.length) return null;
        const attrs = f.attributes || {};

        let props = {};
        if (layer2 === 'erosi') {
          const kelas = attrs.klas_erosi || attrs.KLAS_EROSI || attrs.kelas_erosi ||
                        attrs.KELAS_EROSI || attrs.erosion_class ||
                        attrs.kelas || attrs.KELAS || attrs.nama_kelas || '';
          const nilai = parseErosiValue(kelas);
          const kta = (typeof getKtaByKelasName === 'function' ? getKtaByKelasName(kelas) : null) ||
                      (typeof getKtaClassification === 'function' ? getKtaClassification(nilai) : null);
          props = {
            erosi_kelas: kelas,
            erosi_nilai: nilai,
            erosi_prioritas: kta?.prioritas || '',
            erosi_bpdashl: attrs.bpdashl || attrs.BPDASHL || '',
            erosi_namobj: attrs.namobj || attrs.NAMOBJ || '',
            erosi_remark: attrs.remark || attrs.REMARK || '',
            erosi_metadata: attrs.metadata || attrs.METADATA || '',
            erosi_srs_id: attrs.srs_id || attrs.SRS_ID || 'EPSG:4326',
            erosi_fcode: attrs.fcode || attrs.FCODE || ''
          };
        } else {
          const nama = attrs.NAMA || attrs.nama || attrs.WADMPR || attrs.WIADKK || '-';
          props = { kawasan_nama: nama, kawasan_layer: layer2 };
        }

        const polyRaw = {
          type: 'Feature',
          properties: props,
          geometry: { type: 'Polygon', coordinates: rings }
        };
        try { return turf.rewind(polyRaw); } catch (e) { return polyRaw; }
      })
      .filter(Boolean);

    if (!layer2Polys.length) {
      console.warn('[KTA] computeOverlayIntersection: no valid layer2 polygons after geometry filter');
      return [];
    }

    // 5. For each sawah, intersect with each Layer 2 polygon
    const intersections = [];
    for (const sawahF of sawahFeatures) {
      if (!sawahF.geometry?.rings) continue;
      const sawahAttrs = sawahF.attributes || {};
      const sawahLuasHa = Number(sawahAttrs.Luas_Ha || sawahAttrs.luas_polyg || 0);
      const sawahJenis = sawahAttrs.Jenis_Lahan_Sawah || '-';
      const sawahWadmkk = sawahAttrs.WADMKK || sawahAttrs.wadmkk || '';

      let sawahPolyRaw;
      try {
        sawahPolyRaw = turf.rewind({
          type: 'Feature',
          properties: { sawah_luas: sawahLuasHa, sawah_jenis: sawahJenis, sawah_wadmkk: sawahWadmkk },
          geometry: { type: 'Polygon', coordinates: sawahF.geometry.rings }
        });
      } catch (e) {
        sawahPolyRaw = {
          type: 'Feature',
          properties: { sawah_luas: sawahLuasHa, sawah_jenis: sawahJenis, sawah_wadmkk: sawahWadmkk },
          geometry: { type: 'Polygon', coordinates: sawahF.geometry.rings }
        };
      }

      for (const l2Poly of layer2Polys) {
        try {
          const intersection = turf.intersect(turf.featureCollection([sawahPolyRaw, l2Poly]));
          if (intersection && intersection.geometry) {
            const areaM2 = turf.area(intersection);
            const areaHa = areaM2 / 10000;
            if (areaHa < 0.0001) continue;
            intersection.properties = {
              ...l2Poly.properties,
              ...sawahPolyRaw.properties,
              area_ha: Math.round(areaHa * 10000) / 10000
            };
            intersections.push(intersection);
          }
        } catch (e) { /* skip invalid intersections */ }
      }
    }

    // 6. CLIP ke boundary desa (opsional)
    let results = intersections;
    if (clipToVillage && intersections.length) {
      const clippedIntersections = [];
      for (const ix of intersections) {
        try {
          const clipped = turf.intersect(
            turf.featureCollection([ix, villagePolygon])
          );
          if (clipped && clipped.geometry) {
            clipped.properties = ix.properties;
            clippedIntersections.push(clipped);
          }
        } catch (e) {
          clippedIntersections.push(ix);
        }
      }
      results = clippedIntersections;
    }


    return results;
  } catch (e) {
    console.warn('computeOverlayIntersection error:', e);
    return [];
  }
}

// ---- Show Overlay on Map ----
let erosiSawahOverlayLayer = null;

function erosiColorScale(nilai) {
  const stops = [
    { val: 0,   r: 76,  g: 175, b: 80  },
    { val: 15,  r: 139, g: 195, b: 74  },
    { val: 60,  r: 255, g: 193, b: 7   },
    { val: 180, r: 255, g: 87,  b: 34  },
    { val: 480, r: 183, g: 28,  b: 28  },
  ];
  const v = Math.max(0, Math.min(480, Number(nilai) || 0));
  for (let i = 0; i < stops.length - 1; i++) {
    if (v >= stops[i].val && v <= stops[i + 1].val) {
      const t = (v - stops[i].val) / (stops[i + 1].val - stops[i].val);
      const r = Math.round(stops[i].r + t * (stops[i + 1].r - stops[i].r));
      const g = Math.round(stops[i].g + t * (stops[i + 1].g - stops[i].g));
      const b = Math.round(stops[i].b + t * (stops[i + 1].b - stops[i].b));
      return `rgb(${r},${g},${b})`;
    }
  }
  return `rgb(183,28,28)`;
}

function showOverlayOnMap(intersections) {
  if (!intersections || !intersections.length) return;
  clearOverlay();

  const isErosi = intersections[0]?.properties?.erosi_kelas !== undefined;

  erosiSawahOverlayLayer = L.geoJSON(
    { type: 'FeatureCollection', features: intersections },
    {
      style: function(feature) {
        const p = feature.properties || {};
        if (isErosi) {
          const nilai = Number(p.erosi_nilai) || 0;
          const color = erosiColorScale(nilai);
          return { color, weight: 1.5, fillColor: color, fillOpacity: 0.50, opacity: 0.90 };
        }
        return { color: '#1565c0', weight: 1.5, fillColor: '#1565c0', fillOpacity: 0.45, opacity: 0.85 };
      },
      onEachFeature: function(feature, layer) {
        const p = feature.properties || {};
        const areaHa = p.area_ha != null ? Number(p.area_ha).toLocaleString('id-ID', { maximumFractionDigits: 4 }) : '-';
        const sawahHa = p.sawah_luas != null ? Number(p.sawah_luas).toLocaleString('id-ID', { maximumFractionDigits: 2 }) : '-';

        let headerContent = '';
        let detailContent = '';

        if (isErosi) {
          const kta = (typeof getKtaByKelasName === 'function') ? getKtaByKelasName(p.erosi_kelas || '') : null;
          const prioritas = kta ? kta.prioritas : '-';
          const erosiNilai = p.erosi_nilai ? `${p.erosi_nilai} Ton/Ha/Th` : '-';
          const nilai = Number(p.erosi_nilai) || 0;
          const warna = erosiColorScale(nilai);
          const pct = Math.min(100, (nilai / 480) * 100);
          headerContent = 'Irisan Sawah + Erosi';
          detailContent = `
            <span>Kelas Erosi</span>
            <b style="color:${warna}">${p.erosi_kelas || '-'}</b>
            <span>Nilai Erosi</span>
            <b style="color:${warna}">${erosiNilai}</b>
            <span>Prioritas</span>
            <b style="color:${warna}">${prioritas}</b>`;
          detailContent += `
            <div class="irisan-popup-progress">
              <div class="irisan-popup-progress-label">Intensitas Erosi</div>
              <div class="irisan-popup-progress-bar">
                <div class="irisan-popup-progress-marker" style="left:${pct}%"></div>
              </div>
              <div class="irisan-popup-progress-scale">
                <span>0</span><span>15</span><span>60</span><span>180</span><span>480+</span>
              </div>
            </div>`;
          const metadataRows = [
            ['Sumber', 'BIG SatuPeta'],
            ['Tipe data', 'Poligon erosi'],
            ['Referensi', p.erosi_srs_id || 'EPSG:4326'],
            p.erosi_bpdashl && ['BPDASHL', p.erosi_bpdashl],
            p.erosi_namobj && ['Objek', p.erosi_namobj],
            p.erosi_fcode && ['Kode fitur', p.erosi_fcode],
            p.erosi_metadata && ['Metadata', p.erosi_metadata],
            p.erosi_remark && ['Keterangan', p.erosi_remark]
          ].filter(Boolean);
          detailContent += `
            <div class="irisan-popup-meta">
              <div class="irisan-popup-meta-title">METADATA & KUALITAS</div>
              <div class="irisan-popup-meta-grid">
                ${metadataRows.map(([label, value]) => `<span>${label}</span><b>${value}</b>`).join('')}
                <span>Metode</span><b>Irisan sawah × erosi</b>
                <span>Kualitas</span><b style="color:#16a34a">Di-clip ke batas</b>
                <span>Akuisisi</span><b style="color:#64748b">Tidak dipublikasikan</b>
              </div>
            </div>`;
        } else {
          headerContent = `🌾 Irisan Sawah + ${p.kawasan_layer === 'kawasan-padi' ? 'Padi' : p.kawasan_layer === 'kawasan-jagung' ? 'Jagung' : 'Kedelai'}`;
          detailContent = `
            <span>Kawasan</span>
            <b style="color:#166534">${p.kawasan_nama || '-'}</b>`;
        }

        layer.bindPopup(`
          <div class="irisan-popup">
            <div class="irisan-popup-header">
              <div class="irisan-popup-badge">
                <span class="irisan-popup-badge-dot"></span>
                Irisan
              </div>
              <strong>${headerContent}</strong>
            </div>
            <div class="irisan-popup-body">
              <div class="irisan-popup-detail">
                ${detailContent}
                <span>Luas Irisan</span>
                <b style="color:#166534">${areaHa} Ha</b>
                <span>Luas Sawah</span>
                <b>${sawahHa} Ha</b>
                <span>Jenis Sawah</span>
                <b>${p.sawah_jenis || '-'}</b>
                <span>Kab/Kota</span>
                <b>${p.sawah_wadmkk || '-'}</b>
              </div>
            </div>
            <div class="irisan-popup-footer">
              <span>Sumber: BIG SatuPeta</span>
              <div style="display:flex;justify-content:center;gap:8px;margin-top:6px;">
                <button class="kta-btn-print" onclick="printKtaPdf()">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 9V2h12v7"/>
                    <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                    <rect x="6" y="14" width="12" height="8"/>
                  </svg>
                  Cetak PDF
                </button>
              </div>
            </div>
          </div>
        `, { maxWidth: 320, className: 'irisan-leaflet-popup' });
      }
    }
  ).addTo(map);

  try {
    const bounds = erosiSawahOverlayLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.15), { maxZoom: 14, duration: 0.6 });
    }
  } catch (e) {}
}

// ---- Clear Overlay ----
function clearOverlay() {
  if (erosiSawahOverlayLayer && map.hasLayer(erosiSawahOverlayLayer)) {
    map.removeLayer(erosiSawahOverlayLayer);
  }
  erosiSawahOverlayLayer = null;
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  const checkbox = document.getElementById('toggleErosiLayer');
  if (checkbox) {
    checkbox.addEventListener('change', () => {
      toggleErosiLayer(checkbox.checked);
    });
  }

  const btnRunOverlay = document.getElementById('btnRunOverlay');
  if (btnRunOverlay) {
    btnRunOverlay.addEventListener('click', async () => {
      const kode = window._selectedVillageKode || window._lastGeotaniLocation?.kode;
      if (!kode) {
        alert('Silakan pilih nama desa terlebih dahulu.');
        return;
      }

      const layer2 = document.getElementById('overlayLayer2')?.value || 'erosi';

      btnRunOverlay.disabled = true;
      btnRunOverlay.innerHTML = '<span class="btn-spinner"></span>';
      btnRunOverlay.style.background = '#90caf9';
      try {
        const options = {
          layer1: document.getElementById('overlayLayer1')?.value || 'sawah-2023',
          layer2: layer2,
          clipToVillage: document.getElementById('overlayClipVillage')?.checked !== false
        };

        const withTimeout = (promise, ms) => {
          const timeout = new Promise(resolve => setTimeout(() => resolve(null), ms));
          return Promise.race([promise, timeout]);
        };

        const boundaryReq = withTimeout(
          fetch(`https://wilayah.smartartstudio.my.id/api/boundaries/${kode}`).then(r => r.ok ? r.json() : null).catch(() => null), 8000
        );
        const sawahReq = (typeof fetchLuasSawah === 'function') ? withTimeout(fetchLuasSawah(kode), 12000) : Promise.resolve(null);
        const luasReq = (typeof fetchLuasWilayah === 'function') ? withTimeout(fetchLuasWilayah(kode), 8000) : Promise.resolve(null);

        if (typeof showGeoidBoundary === 'function') showGeoidBoundary(kode, 14);
        const [boundaryData, sawahResult, luasResult, result] = await Promise.all([
          boundaryReq, sawahReq, luasReq,
          computeOverlayIntersection(kode, options)
        ]);

        const villageName = boundaryData?.nama || window._lastGeotaniLocation?.desa || window._lastGeotaniLocation?.location || kode;
        const sawahHa = sawahResult && sawahResult.sawahHa > 0 ? sawahResult.sawahHa : 0;
        const luasWilayahHa = luasResult && luasResult.luas > 0 ? luasResult.luas : 0;
        if (result && result.length && typeof showOverlayOnMap === 'function') {
          showOverlayOnMap(result);

          const classCount = {};
          let totalFeatures = result.length;
          let totalValue = 0;
          let valueCount = 0;
          result.forEach(f => {
            const kelas = f.properties?.erosi_kelas || '';
            const nilai = Number(f.properties?.erosi_nilai) || 0;
            if (kelas) classCount[kelas] = (classCount[kelas] || 0) + 1;
            if (nilai > 0) { totalValue += nilai; valueCount++; }
          });
          const avgValue = valueCount > 0 ? totalValue / valueCount : 0;
          const dominantClass = Object.entries(classCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
          const ktaItem = (typeof getKtaByKelasName === 'function') ? getKtaByKelasName(dominantClass) : null;

          lastKtaData = {
            kode,
            villageName,
            intersections: result,
            classCount,
            totalFeatures,
            avgValue: Math.round(avgValue * 100) / 100,
            dominantClass,
            kta: ktaItem,
            sawahHa,
            luasWilayahHa,
            layer2: document.getElementById('overlayLayer2')?.value || 'erosi'
          };

          const sidebar = document.getElementById('sidebar-left');
          if (sidebar && !sidebar.classList.contains('collapsed')) {
            sidebar.classList.add('collapsed');
            const toggleBtn = document.getElementById('toggleBtn');
            if (toggleBtn) toggleBtn.innerHTML = '&gt;&gt;';
            setTimeout(() => map.invalidateSize(), 300);
          }
        } else {
          clearOverlay();
          const detail = !result ? 'hasil null'
            : result.length === 0 ? 'hasil kosong (cek console F12)'
            : typeof showOverlayOnMap !== 'function' ? 'showOverlayOnMap tidak tersedia'
            : 'tidak diketahui';
          console.warn('[KTA] Overlay kosong:', detail, { kode, options, result });
          alert('Tidak ada irisan ditemukan untuk kombinasi layer ini.\n\nDetail: ' + detail + '\nPeriksa browser console (F12) untuk info lebih lanjut.');
        }
      } catch (e) {
        console.warn('Run overlay error:', e);
        alert('Gagal menjalankan overlay.');
      } finally {
        btnRunOverlay.disabled = false;
        btnRunOverlay.innerHTML = '<span>▶</span> Jalankan';
        btnRunOverlay.style.background = '#0879bf';
      }
    });
  }

  window.printKtaPdf = async function() {
    if (!lastKtaData) {
      alert('Tidak ada data analisis KTA yang tersedia. Silakan jalankan analisis overlay terlebih dahulu.');
      return;
    }

    const { kode, villageName, intersections, classCount, totalFeatures, avgValue, dominantClass, kta, sawahHa, luasWilayahHa, layer2 } = lastKtaData;
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`;
    const fileName = `KTA_${villageName.replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}.pdf`;
    const dateFormatted = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

    const btn = document.querySelector('.kta-btn-print');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span>Membuat PDF…'; }

    const hiddenEls = [];
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
      map.invalidateSize();
      await new Promise(r => setTimeout(r, 300));

      if (erosiSawahOverlayLayer) {
        const bounds = erosiSawahOverlayLayer.getBounds();
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
      pdf.text('Analisis KTA', margin + 2, margin + 6);
      const titleText = `${villageName} (${kode})`;
      const dashX = margin + 2 + pdf.getTextWidth('Analisis KTA') + 2;
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
      if (luasWilayahHa > 0) pdf.text(luasWilayahHa.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' ha', pageW - margin - 2, margin + 9, { align: 'right' });
      pdf.setFontSize(7);
      pdf.setTextColor(150, 150, 150);
      pdf.text('WGS84 / EPSG:4326', pageW - margin - 2, margin + 12, { align: 'right' });

      pdf.setDrawColor(55, 65, 81);
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
      pdf.setFillColor(30, 41, 59);
      pdf.triangle(naCx, naY, naCx - naSize / 2, naY + naSize, naCx + naSize / 2, naY + naSize, 'F');
      pdf.setFillColor(255, 255, 255);
      pdf.triangle(naCx, naY + naSize * 0.35, naCx - naSize * 0.25, naY + naSize, naCx + naSize * 0.25, naY + naSize, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(30, 41, 59);
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
      pdf.setDrawColor(55, 65, 81);
      pdf.setLineWidth(0.2);
      pdf.rect(sbX, sbY, actualW, sbH, 'FD');
      pdf.setFillColor(55, 65, 81);
      pdf.rect(sbX, sbY, actualW / 2, sbH, 'F');
      pdf.setFillColor(255, 255, 255);
      pdf.rect(sbX + actualW / 2, sbY, actualW / 4, sbH, 'F');
      pdf.setFillColor(55, 65, 81);
      pdf.rect(sbX + actualW * 3 / 4, sbY, actualW / 4, sbH, 'F');
      pdf.setFontSize(5.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(55, 65, 81);
      pdf.text('0', sbX, sbY - 1);
      pdf.text(String(sbValue), sbX + actualW / 2, sbY - 1, { align: 'center' });
      pdf.text(sbValue * 2 + ' ' + sbLabelUnit, sbX + actualW, sbY - 1, { align: 'center' });

      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.line(panelX, mapFrameY, panelX, mapFrameY + mapFrameH);

      let py = mapFrameY + 4;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(30, 41, 59);
      pdf.text('HASIL ANALISIS KTA', panelX + 4, py);
      py += 6;

      const cardW = panelW - 8;
      const cardH = 18;
      const ktaColor = kta ? kta.color : '#78909c';
      const ktaRgb = hexToRgb(ktaColor);
      pdf.setFillColor(240, 253, 244);
      pdf.setDrawColor(220, 252, 231);
      pdf.roundedRect(panelX + 4, py, cardW, cardH, 2, 2, 'FD');
      pdf.setFontSize(6);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 116, 139);
      pdf.text('Kelas Erosi Dominan', panelX + 8, py + 5);
      pdf.text('Rata-rata Nilai Erosi', panelX + 8, py + 11);
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(ktaRgb[0], ktaRgb[1], ktaRgb[2]);
      const dominantText = dominantClass || '-';
      const splitDominant = pdf.splitTextToSize(dominantText, panelW - 48);
      pdf.text(splitDominant, panelX + 40, py + 5);
      pdf.setTextColor(30, 41, 59);
      pdf.text(avgValue.toFixed(1) + ' Ton/Ha/Th', panelX + 40, py + 11);
      py += cardH + 5;

      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(55, 65, 81);
      pdf.text('Rincian Kelas Erosi', panelX + 4, py);
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.line(panelX + 4, py + 1, panelX + cardW, py + 1);
      py += 4;

      const barLabelW = 28;
      const barPercentW = 10;
      const barMaxW = cardW - barLabelW - barPercentW - 4;
      const kelasEntries = Object.entries(classCount);
      const totalClassified = kelasEntries.reduce((a, b) => a + b[1], 0);
      for (const [cls, count] of kelasEntries) {
        const pct = totalClassified > 0 ? (count / totalClassified) * 100 : 0;
        const barW = (pct / 100) * barMaxW;
        const ktaItem = (typeof getKtaByKelasName === 'function') ? getKtaByKelasName(cls) : null;
        const clr = ktaItem ? ktaItem.color : '#78909c';
        const rgb = hexToRgb(clr);

        pdf.setFontSize(5.5);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 116, 139);
        pdf.text(cls, panelX + 4, py + 2.5);

        const barX = panelX + 4 + barLabelW;
        pdf.setFillColor(241, 245, 249);
        pdf.roundedRect(barX, py, barMaxW, 3.5, 1, 1, 'F');
        pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
        if (barW > 0) pdf.roundedRect(barX, py, Math.max(barW, 1.5), 3.5, 1, 1, 'F');

        pdf.setFontSize(5.5);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
        pdf.text(count + ' (' + pct.toFixed(0) + '%)', barX + barMaxW + 2, py + 2.5);
        py += 5;
      }
      py += 3;

      if (kta) {
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(55, 65, 81);
        pdf.text('Rekomendasi Konservasi', panelX + 4, py);
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.2);
        pdf.line(panelX + 4, py + 1, panelX + cardW, py + 1);
        py += 4;

        pdf.setFontSize(6);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(100, 116, 139);
        pdf.text('Vegetatif:', panelX + 4, py);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(71, 85, 105);
        const vegText = pdf.splitTextToSize(kta.vegetatif || '-', cardW - 4);
        pdf.text(vegText, panelX + 4, py + 3.5);
        py += vegText.length * 3 + 3;

        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(100, 116, 139);
        pdf.text('Sipil Teknis:', panelX + 4, py);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(71, 85, 105);
        const sipilText = pdf.splitTextToSize(kta.sipilTeknis || '-', cardW - 4);
        pdf.text(sipilText, panelX + 4, py + 3.5);
        py += sipilText.length * 3 + 3;

        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(100, 116, 139);
        pdf.text('Dampak:', panelX + 4, py);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(71, 85, 105);
        const dampakText = pdf.splitTextToSize(kta.dampak || '-', cardW - 4);
        pdf.text(dampakText, panelX + 4, py + 3.5);
        py += dampakText.length * 3 + 3;

        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(100, 116, 139);
        pdf.text('Prioritas:', panelX + 4, py);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(ktaRgb[0], ktaRgb[1], ktaRgb[2]);
        pdf.text(kta.prioritas || '-', panelX + 24, py);
        py += 5;
      }

      py += 3;
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(55, 65, 81);
      pdf.text('Informasi Wilayah', panelX + 4, py);
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.line(panelX + 4, py + 1, panelX + cardW, py + 1);
      py += 4;

      const infoLines = [
        ['Luas Sawah', sawahHa > 0 ? sawahHa.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' ha' : '-'],
        ['Luas Wilayah', luasWilayahHa > 0 ? luasWilayahHa.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' ha' : '-'],
        ['Total Zona', String(totalFeatures)],
        ['Layer', layer2 === 'erosi' ? 'Erosi' : layer2]
      ];
      for (const [label, value] of infoLines) {
        pdf.setFontSize(5.5);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 116, 139);
        pdf.text(label, panelX + 4, py);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(55, 65, 81);
        pdf.text(value, panelX + 30, py);
        py += 3.5;
      }

      py += 2;
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(55, 65, 81);
      pdf.text('Metadata & Kualitas', panelX + 4, py);
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.line(panelX + 4, py + 1, panelX + cardW, py + 1);
      py += 4;

      const metaLines = [
        ['Sumber', 'BIG SatuPeta'],
        ['Tipe data', 'Poligon erosi'],
        ['Referensi', 'EPSG:4326'],
        ['Metode', 'Irisan sawah x erosi'],
        ['Kualitas', 'Di-clip ke batas desa']
      ];
      for (const [label, value] of metaLines) {
        pdf.setFontSize(5.5);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 116, 139);
        pdf.text(label, panelX + 4, py);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(55, 65, 81);
        pdf.text(value, panelX + 30, py);
        py += 3.5;
      }

      py += 4;
      const ktaLegend = [
        { label: 'Ringan', color: '#4caf50' },
        { label: 'Sedang', color: '#ff9800' },
        { label: 'Berat', color: '#f44336' },
        { label: 'Sangat Berat', color: '#b71c1c' }
      ];
      const lgX = panelX + 4;
      const lgW = panelW - 8;
      const lgRowH = 3.5;
      const lgRows = Math.ceil(ktaLegend.length / 2);
      const lgH = lgRows * lgRowH + 8;
      const lgY = py;
      const lgColW = (lgW - 8) / 2;

      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(55, 65, 81);
      pdf.text('Legenda Erosi', lgX, lgY + 4);
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.line(lgX, lgY + 5, lgX + lgW, lgY + 5);

      let lgRowY = lgY + 8;
      for (let i = 0; i < ktaLegend.length; i++) {
        const band = ktaLegend[i];
        const col = i % 2;
        const row = Math.floor(i / 2);
        const itemX = lgX + col * lgColW;
        const itemY = lgRowY + row * lgRowH;
        const rgb = hexToRgb(band.color);
        pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
        pdf.rect(itemX, itemY, 3, 2.5, 'F');
        pdf.setFontSize(5.5);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(55, 65, 81);
        pdf.text(band.label, itemX + 4, itemY + 2.2);
      }

      const bottomY = pageH - margin - 2;
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.line(margin, bottomY - bottomStripH + 2, pageW - margin, bottomY - bottomStripH + 2);
      pdf.setFontSize(6);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(120, 120, 120);
      pdf.text('Sumber data: BIG SatuPeta · Dibuat oleh RuangKita Pro', margin + 2, bottomY - 4);
      pdf.text('Cetak: ' + dateFormatted, pageW - margin - 2, bottomY - 4, { align: 'right' });
      pdf.setFontSize(5);
      pdf.setTextColor(160, 160, 160);
      pdf.text('Koordinat: WGS84 / EPSG:4326 · Grid graticule untuk referensi ArcGIS / QGIS', margin + 2, bottomY);

      const wcX = pageW / 2;
      const wcY = pageH / 2;
      pdf.setFillColor(200, 200, 200);
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.5);
      const hs = 12;
      pdf.triangle(wcX, wcY - hs - 8, wcX - hs, wcY - 8, wcX + hs, wcY - 8, 'S');
      pdf.setFillColor(255, 255, 255);
      pdf.rect(wcX - hs * 0.35, wcY - hs * 0.2 - 8, hs * 0.7, hs * 0.3, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(32);
      pdf.setTextColor(220, 220, 220);
      pdf.text('RuangKita', wcX, wcY + 10, { align: 'center' });
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(210, 210, 210);
      pdf.text('ruangkitainteraktif.github.io', wcX, wcY + 16, { align: 'center' });

      pdf.save(fileName);
    } catch (error) {
      console.error('[KTA] Gagal membuat PDF:', error);
      alert('Gagal membuat PDF: ' + (error.message || 'Terjadi kesalahan'));
    } finally {
      for (const item of hiddenEls) {
        if (item.prop) item.el.style[item.prop] = '';
        else if (item.remove === false) item.el.classList.remove(item.cls);
      }
      map.invalidateSize();
      if (btn) { btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Cetak PDF'; }
    }
  };

  // ==========================================
  // LBS ANALYSIS - Lahan Baku Sawah
  // ==========================================

  let lbsOverlayLayer = null;
  let lastLbsData = null;
  let lbsVillageData = [];
  let lbsVillageLoadPromise = null;

  window.getLbsOverlayLayer = () => lbsOverlayLayer;

  function removeLbsOverlay() {
    if (lbsOverlayLayer && map.hasLayer(lbsOverlayLayer)) map.removeLayer(lbsOverlayLayer);
    lbsOverlayLayer = null;
  }

  function clearLbsAnalysis() {
    removeLbsOverlay();
    lastLbsData = null;

    const resultArea = document.getElementById('lbsResultArea');
    if (resultArea) {
      resultArea.innerHTML = '';
      resultArea.style.display = 'none';
    }
  }

  window.clearLbsAnalysis = clearLbsAnalysis;

  let lbsKabData = [];
  let lbsDesaData = [];

  function ensureLbsVillageData() {
    if (lbsVillageLoadPromise) return lbsVillageLoadPromise;
    lbsVillageLoadPromise = (async () => {
      try {
        const res = await fetch('assets/data/kode_wilayah.json');
        if (!res.ok) return;
        const all = await res.json();
        lbsKabData = all.filter(item => item.kode && (item.kode.match(/\./g) || []).length === 1);
        lbsDesaData = all.filter(item => item.kode && (item.kode.match(/\./g) || []).length === 3);
        lbsVillageData = lbsDesaData;
      } catch (e) { /* ignore */ }
    })();
    return lbsVillageLoadPromise;
  }

  function searchLbsAreas(query, level) {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const pool = level === 'kabupaten' ? lbsKabData : lbsDesaData;
    return pool.filter(item => {
      const name = item.nama.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return name.includes(q);
    }).slice(0, 20);
  }

  async function computeLbsIntersection(villageKode) {
    if (!villageKode || typeof turf === 'undefined') return null;

    const villageFeature = await fetchVillageBoundary(villageKode);
    if (!villageFeature || !villageFeature.geometry?.rings) return null;

    const rings = villageFeature.geometry.rings;
    let villageGeo;
    if (rings.length === 1) {
      villageGeo = { type: 'Polygon', coordinates: [rings[0]] };
    } else {
      const outerRing = rings[0];
      const holes = [];
      const otherPolygons = [];
      const outerPoly = turf.polygon([outerRing]);
      for (let i = 1; i < rings.length; i++) {
        const pt = turf.point(rings[i][0]);
        if (turf.booleanPointInPolygon(pt, outerPoly)) {
          holes.push(rings[i]);
        } else {
          otherPolygons.push(rings[i]);
        }
      }
      if (otherPolygons.length === 0) {
        villageGeo = { type: 'Polygon', coordinates: [outerRing, ...holes] };
      } else {
        const polys = [outerRing, ...otherPolygons].map(r => [r]);
        villageGeo = { type: 'MultiPolygon', coordinates: polys };
      }
    }

    const villagePolyRaw = { type: 'Feature', properties: {}, geometry: villageGeo };
    let villagePolygon;
    try { villagePolygon = turf.rewind(villagePolyRaw); } catch (e) { villagePolygon = villagePolyRaw; }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    villageFeature.geometry.rings.forEach(ring => {
      ring.forEach(([x, y]) => {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      });
    });
    minX -= 0.0001; minY -= 0.0001; maxX += 0.0001; maxY += 0.0001;
    if (minX >= maxX || minY >= maxY) return null;

    const sawahFeatures = await fetchSawahInEnvelope(minX, minY, maxX, maxY);
    if (!sawahFeatures.length) return null;

    const villageName = villageFeature.attributes?.WADMKD || '';
    const intersections = [];
    let totalSawahHa = 0;

    for (const f of sawahFeatures) {
      if (!f.geometry?.rings) continue;
      const attrs = f.attributes || {};
      const sawahLuasHa = Number(attrs.Luas_Ha || 0);
      const sawahJenis = attrs.Jenis_Lahan_Sawah || '-';
      const sawahWadmpr = attrs.WADMPR || '';
      const sawahWadmkk = attrs.WADMKK || '';

      let sawahPoly;
      try {
        sawahPoly = turf.rewind({
          type: 'Feature',
          properties: { sawah_luas: sawahLuasHa, sawah_jenis: sawahJenis, sawah_wadmpr: sawahWadmpr, sawah_wadmkk: sawahWadmkk },
          geometry: { type: 'Polygon', coordinates: f.geometry.rings }
        });
      } catch (e) {
        sawahPoly = {
          type: 'Feature',
          properties: { sawah_luas: sawahLuasHa, sawah_jenis: sawahJenis, sawah_wadmpr: sawahWadmpr, sawah_wadmkk: sawahWadmkk },
          geometry: { type: 'Polygon', coordinates: f.geometry.rings }
        };
      }

      try {
        const intersection = turf.intersect(turf.featureCollection([sawahPoly, villagePolygon]));
        if (intersection && intersection.geometry) {
          const areaM2 = turf.area(intersection);
          const areaHa = areaM2 / 10000;
          if (areaHa < 0.00001) continue;
          intersection.properties = {
            ...sawahPoly.properties,
            area_ha: Math.round(areaHa * 10000) / 10000
          };
          totalSawahHa += areaHa;
          intersections.push(intersection);
        }
      } catch (e) { console.warn('[LBS] intersect error (desa):', e.message); }
    }

    return {
      intersections,
      villageName,
      villageKode,
      totalSawahHa: Math.round(totalSawahHa * 100) / 100,
      bidangCount: intersections.length,
      totalBidangAsli: sawahFeatures.length
    };
  }

  // ---- Fetch Admin Boundary (kab/kec/desa) from API ----
  async function fetchAdminBoundary(kode) {
    const url = `https://wilayah.smartartstudio.my.id/api/boundaries/${kode}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data.path || !data.path.length) return null;
        const rings = data.path.map(ring => ring.map(([lat, lng]) => [lng, lat]));
        return { geometry: { rings }, attributes: { name: data.nama || '' } };
      } catch (e) {
        console.warn(`[LBS] fetchAdminBoundary attempt ${attempt + 1} failed:`, e.message);
        if (attempt === 0) await new Promise(r => setTimeout(r, 1000));
      }
    }
    return null;
  }

  // ---- Compute LBS Intersection for Kabupaten/Kecamatan ----
  async function computeLbsIntersectionMulti(outerKode, outerName, level) {
    if (!outerKode || typeof turf === 'undefined') return null;

    const outerFeature = await fetchAdminBoundary(outerKode);
    if (!outerFeature || !outerFeature.geometry?.rings) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    outerFeature.geometry.rings.forEach(ring => {
      ring.forEach(([x, y]) => {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      });
    });
    minX -= 0.0001; minY -= 0.0001; maxX += 0.0001; maxY += 0.0001;
    if (minX >= maxX || minY >= maxY) return null;

    const sawahFeatures = await fetchSawahInEnvelope(minX, minY, maxX, maxY);
    if (!sawahFeatures.length) return null;

    const outerPolygons = outerFeature.geometry.rings.map(ring => ({
      type: 'Feature', properties: {},
      geometry: { type: 'Polygon', coordinates: [ring] }
    }));

    const intersections = [];
    let totalSawahHa = 0;

    for (const f of sawahFeatures) {
      if (!f.geometry?.rings) continue;
      const attrs = f.attributes || {};
      const sawahLuasHa = Number(attrs.Luas_Ha || 0);
      const sawahJenis = attrs.Jenis_Lahan_Sawah || '-';
      const sawahWadmpr = attrs.WADMPR || '';
      const sawahWadmkk = attrs.WADMKK || '';

      let sawahPoly;
      try {
        sawahPoly = turf.rewind({
          type: 'Feature',
          properties: { sawah_luas: sawahLuasHa, sawah_jenis: sawahJenis, sawah_wadmpr: sawahWadmpr, sawah_wadmkk: sawahWadmkk },
          geometry: { type: 'Polygon', coordinates: f.geometry.rings }
        });
      } catch (e) {
        sawahPoly = {
          type: 'Feature',
          properties: { sawah_luas: sawahLuasHa, sawah_jenis: sawahJenis, sawah_wadmpr: sawahWadmpr, sawah_wadmkk: sawahWadmkk },
          geometry: { type: 'Polygon', coordinates: f.geometry.rings }
        };
      }

      for (const outerPoly of outerPolygons) {
        try {
          const intersection = turf.intersect(turf.featureCollection([sawahPoly, outerPoly]));
          if (intersection && intersection.geometry) {
            const areaM2 = turf.area(intersection);
            const areaHa = areaM2 / 10000;
            if (areaHa < 0.00001) continue;
            intersection.properties = {
              ...sawahPoly.properties,
              area_ha: Math.round(areaHa * 10000) / 10000,
              admin_name: outerName,
              admin_level: level
            };
            totalSawahHa += areaHa;
            intersections.push(intersection);
            break;
          }
        } catch (e) { console.warn('[LBS] intersect error (kab/kec):', e.message); }
      }
    }

    return {
      intersections,
      adminName: outerName,
      adminKode: outerKode,
      adminLevel: level,
      totalSawahHa: Math.round(totalSawahHa * 100) / 100,
      bidangCount: intersections.length,
      totalBidangAsli: sawahFeatures.length
    };
  }

  function showLbsOverlayOnMap(result) {
    if (!result || !result.intersections || !result.intersections.length) return;
    removeLbsOverlay();
    clearOverlay();

    const levelLabel = result.adminLevel === 'kabupaten' ? 'Kabupaten' : 'Desa';
    const headerLabel = result.adminLevel ? `Irisan Sawah + ${levelLabel}` : 'Irisan Sawah + Desa';

    lbsOverlayLayer = L.geoJSON(
      { type: 'FeatureCollection', features: result.intersections },
      {
        style: function(feature) {
          const luas = Number(feature.properties?.area_ha) || 0;
          let fillColor = '#22c55e';
          let fillOpacity = 0.45;
          if (luas > 5) { fillColor = '#16a34a'; fillOpacity = 0.55; }
          else if (luas > 1) { fillColor = '#16a34a'; fillOpacity = 0.50; }
          return { color: '#15803d', weight: 1.5, fillColor, fillOpacity, opacity: 0.85 };
        },
        onEachFeature: function(feature, layer) {
          const p = feature.properties || {};
          const areaHa = p.area_ha != null ? Number(p.area_ha).toLocaleString('id-ID', { maximumFractionDigits: 4 }) : '-';
          const sawahHa = p.sawah_luas != null ? Number(p.sawah_luas).toLocaleString('id-ID', { maximumFractionDigits: 2 }) : '-';

          layer.bindPopup(`
            <div class="irisan-popup">
              <div class="irisan-popup-header">
                <div class="irisan-popup-badge">
                  <span class="irisan-popup-badge-dot"></span>
                  LBS
                </div>
                <strong>${headerLabel}</strong>
              </div>
              <div class="irisan-popup-body">
                <div class="irisan-popup-detail">
                  <span>Luas Irisan</span>
                  <b style="color:#166534">${areaHa} Ha</b>
                  <span>Luas Sawah Asli</span>
                  <b>${sawahHa} Ha</b>
                  <span>Jenis Sawah</span>
                  <b>${p.sawah_jenis || '-'}</b>
                  <span>Kab/Kota</span>
                  <b>${p.sawah_wadmkk || '-'}</b>
                  <span>Provinsi</span>
                  <b>${p.sawah_wadmpr || '-'}</b>
                </div>
              </div>
              <div class="irisan-popup-footer">
                <span>Sumber: Kementan Sawah 2023</span>
                <div style="display:flex;justify-content:center;gap:8px;margin-top:6px;">
                  <button class="kta-btn-print" onclick="printLbsPdf()">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    Cetak PDF
                  </button>
                </div>
              </div>
            </div>
          `, { maxWidth: 320, className: 'irisan-leaflet-popup' });
        }
      }
    ).addTo(map);

    try {
      const bounds = lbsOverlayLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.15), { maxZoom: 14, duration: 0.6 });
      }
    } catch (e) {}
  }

  window.printLbsPdf = async function() {
    if (!lastLbsData) {
      alert('Tidak ada data LBS yang tersedia. Silakan jalankan analisis terlebih dahulu.');
      return;
    }

    const { villageName, villageKode, adminName, adminKode, adminLevel, totalSawahHa, bidangCount, totalBidangAsli } = lastLbsData;
    const displayName = adminName || villageName || '';
    const displayKode = adminKode || villageKode || '';
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`;
    const fileName = `LBS_${displayName.replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}.pdf`;
    const dateFormatted = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

    const btn = document.querySelector('.kta-btn-print');
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

      if (lbsOverlayLayer) {
        const bounds = lbsOverlayLayer.getBounds();
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
      const titleText = `${displayName} (${displayKode})`;
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

      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.line(panelX, mapFrameY, panelX, mapFrameY + mapFrameH);

      let py = mapFrameY + 4;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(30, 41, 59);
      const levelTitleMap = { kabupaten: 'KABUPATEN/KOTA', desa: 'DESA/KELURAHAN' };
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
      pdf.text(levelTitleMap[adminLevel] || 'NAMA DESA', panelX + 8, py + 5);
      pdf.text('Kode Wilayah', panelX + 8, py + 10);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(22, 101, 52);
      pdf.text(displayName || '-', panelX + 38, py + 5);
      pdf.setTextColor(55, 65, 81);
      pdf.text(displayKode || '-', panelX + 38, py + 10);
      py += cardH + 5;

      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(55, 65, 81);
      pdf.text('HASIL ANALISIS LBS', panelX + 4, py);
      py += 4;

      const infoLines = [
        ['Total Luas Sawah', totalSawahHa > 0 ? totalSawahHa.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' ha' : '-'],
        ['Jumlah Bidang', String(bidangCount)],
        ['Bidang Asli (ArcGIS)', String(totalBidangAsli)],
        ['Sumber Data', 'Kementan Sawah 2023']
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
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.line(panelX + 4, py + 1, panelX + cardW, py + 1);
      py += 4;

      const levelTypeMap = { kabupaten: 'Batas Kabupaten/Kota + Lahan Baku Sawah 2023' };
      const metaLines = [
        ['Sumber', 'Kementan Sawah 2023'],
        ['Tipe data', levelTypeMap[adminLevel] || 'Batas Desa/Kelurahan + Lahan Baku Sawah 2023'],
        ['Referensi', 'EPSG:4326'],
        ['Metode', 'Geoprocessing Intersect'],
        ['Kualitas', adminLevel ? (adminLevel === 'kabupaten' ? 'Batas Kabupaten/Kota (API)' : 'Batas Kecamatan (API)') : 'Batas Desa/Kelurahan (BIG)']
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

      py += 4;
      const boundaryLabel = adminLevel === 'kabupaten' ? 'Batas Kabupaten' : 'Batas Desa';
      const lbsLegend = [
        { label: 'Sawah Teriris', color: '#22c55e' },
        { label: boundaryLabel, color: '#15803d' }
      ];
      const lgX = panelX + 4;
      const lgW = panelW - 8;
      const lgRowH = 3.5;
      const lgRows = Math.ceil(lbsLegend.length / 2);
      const lgH = lgRows * lgRowH + 8;
      const panelBottom = mapFrameY + mapFrameH;
      if (py + lgH > panelBottom) py = panelBottom - lgH;
      const lgY = py;
      const lgColW = (lgW - 8) / 2;

      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(55, 65, 81);
      pdf.text('Legenda Lahan Baku Sawah', lgX, lgY + 4);
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.line(lgX, lgY + 5, lgX + lgW, lgY + 5);

      let lgRowY = lgY + 8;
      for (let i = 0; i < lbsLegend.length; i++) {
        const band = lbsLegend[i];
        const col = i % 2;
        const row = Math.floor(i / 2);
        const itemX = lgX + col * lgColW;
        const itemY = lgRowY + row * lgRowH;
        const rgb = hexToRgb(band.color);
        pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
        pdf.rect(itemX, itemY, 3, 2.5, 'F');
        pdf.setFontSize(5.5);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(55, 65, 81);
        pdf.text(band.label, itemX + 4, itemY + 2.2);
      }

      const bottomY = pageH - margin - 2;
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.line(margin, bottomY - bottomStripH + 2, pageW - margin, bottomY - bottomStripH + 2);
      pdf.setFontSize(6);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(120, 120, 120);
      pdf.text('Sumber data: Kementan · BIG SatuPeta · Dibuat oleh RuangKita Pro', margin + 2, bottomY - 4);
      pdf.text('Cetak: ' + dateFormatted, pageW - margin - 2, bottomY - 4, { align: 'right' });
      pdf.setFontSize(5);
      pdf.setTextColor(160, 160, 160);
      pdf.text('Koordinat: WGS84 / EPSG:4326 · Grid graticule untuk referensi ArcGIS / QGIS', margin + 2, bottomY);

      const wcX = pageW / 2;
      const wcY = pageH / 2;
      pdf.setFillColor(200, 200, 200);
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.5);
      const hs = 12;
      pdf.triangle(wcX, wcY - hs - 8, wcX - hs, wcY - 8, wcX + hs, wcY - 8, 'S');
      pdf.setFillColor(255, 255, 255);
      pdf.rect(wcX - hs * 0.35, wcY - hs * 0.2 - 8, hs * 0.7, hs * 0.3, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(32);
      pdf.setTextColor(220, 220, 220);
      pdf.text('RuangKita', wcX, wcY + 10, { align: 'center' });
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(210, 210, 210);
      pdf.text('ruangkitainteraktif.github.io', wcX, wcY + 16, { align: 'center' });

      pdf.save(fileName);
    } catch (error) {
      console.error('[LBS] Gagal membuat PDF:', error);
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
      if (btn) { btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Cetak PDF'; }
    }
  };

  // ---- LBS Button Handler ----
  const btnRunLbs = document.getElementById('btnRunLbs');
  if (btnRunLbs) {
    btnRunLbs.addEventListener('click', async () => {
      const kode = window._selectedLbsVillageKode;
      if (!kode) {
        alert('Silakan pilih nama wilayah terlebih dahulu.');
        return;
      }

      const levelMode = document.getElementById('lbsLevelMode')?.value || 'desa';
      const levelLabelMap = { desa: 'Desa/Kelurahan', kabupaten: 'Kabupaten/Kota' };
      const levelZoomMap = { desa: 14, kabupaten: 10 };

      btnRunLbs.disabled = true;
      btnRunLbs.innerHTML = '<span class="btn-spinner"></span> Menghitung…';
      btnRunLbs.style.background = '#90caf9';
      try {
        if (typeof showGeoidBoundary === 'function') showGeoidBoundary(kode, levelZoomMap[levelMode] || 14);

        let result;
        if (levelMode === 'desa') {
          result = await computeLbsIntersection(kode);
        } else {
          const areaName = window._selectedLbsAreaName || '';
          result = await computeLbsIntersectionMulti(kode, areaName, levelMode);
        }

        if (result && result.intersections && result.intersections.length) {
          lastLbsData = result;
          showLbsOverlayOnMap(result);

          const resultArea = document.getElementById('lbsResultArea');
          if (resultArea) {
            const fmtNum = (n) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
            const displayName = result.adminName || result.villageName || '';
            const displayLevel = result.adminLevel ? levelLabelMap[result.adminLevel] : 'Desa/Kelurahan';
            resultArea.innerHTML = `
              <div style="display:grid;gap:4px;">
                <div style="display:flex;justify-content:space-between;"><span style="color:#54708d;">${displayLevel}</span><b style="color:#166534;">${displayName}</b></div>
                <div style="display:flex;justify-content:space-between;"><span style="color:#54708d;">Total Luas Sawah</span><b style="color:#166534;">${fmtNum(result.totalSawahHa)} ha</b></div>
                <div style="display:flex;justify-content:space-between;"><span style="color:#54708d;">Jumlah Bidang</span><b>${result.bidangCount}</b></div>
              </div>
            `;
            resultArea.style.display = 'block';
          }

          const sidebar = document.getElementById('sidebar-left');
          if (sidebar && !sidebar.classList.contains('collapsed')) {
            sidebar.classList.add('collapsed');
            const toggleBtn = document.getElementById('toggleBtn');
            if (toggleBtn) toggleBtn.innerHTML = '&gt;&gt;';
            setTimeout(() => map.invalidateSize(), 300);
          }
        } else {
          clearOverlay();
          alert('Tidak ada irisan sawah ditemukan untuk wilayah ini.\n\nKemungkinan data sawah belum tersedia atau CORS diblokir.');
        }
      } catch (e) {
        console.warn('[LBS] Error:', e);
        alert('Gagal menjalankan analisis LBS.');
      } finally {
        btnRunLbs.disabled = false;
        btnRunLbs.innerHTML = '<span>🌾</span> Hitung Luas Sawah';
        btnRunLbs.style.background = '#16a34a';
      }
    });
  }

  // ---- LBS Village Autocomplete ----
  const lbsInput = document.getElementById('lbsVillageSearch');
  const lbsResults = document.getElementById('lbsVillageResults');
  const lbsSelected = document.getElementById('lbsVillageSelected');
  const lbsLevelMode = document.getElementById('lbsLevelMode');
  const lbsLevelLabel = document.getElementById('lbsLevelLabel');
  const lbsLevelPlaceholders = { desa: 'Ketik nama desa...', kabupaten: 'Ketik nama kabupaten...' };
  const lbsLevelLabels = { desa: 'Desa/Kelurahan', kabupaten: 'Kabupaten/Kota' };

  if (lbsLevelMode) {
    lbsLevelMode.addEventListener('change', () => {
      const level = lbsLevelMode.value;
      if (lbsInput) lbsInput.placeholder = lbsLevelPlaceholders[level] || lbsLevelPlaceholders.desa;
      if (lbsLevelLabel) lbsLevelLabel.textContent = lbsLevelLabels[level] || lbsLevelLabels.desa;
      if (lbsInput) lbsInput.value = '';
      if (lbsSelected) { lbsSelected.style.display = 'none'; lbsSelected.textContent = ''; }
      window._selectedLbsVillageKode = null;
      window._selectedLbsAreaName = null;
      if (lbsResults) lbsResults.style.display = 'none';
    });
  }

  if (lbsInput && lbsResults && lbsSelected) {
    let lbsDebounce = null;

    lbsInput.addEventListener('input', () => {
      clearTimeout(lbsDebounce);
      const query = lbsInput.value.trim();
      if (query.length < 2) {
        lbsResults.style.display = 'none';
        return;
      }
      lbsDebounce = setTimeout(async () => {
        await ensureLbsVillageData();
        const level = lbsLevelMode?.value || 'desa';
        const results = searchLbsAreas(query, level);
        lbsResults.innerHTML = '';
        if (!results.length) {
          lbsResults.style.display = 'none';
          return;
        }
        results.forEach(item => {
          const div = document.createElement('div');
          div.textContent = `${item.nama} (${item.kode})`;
          div.style.cssText = 'padding:7px 9px;border-bottom:1px solid #edf3f6;cursor:pointer;font-size:11px;color:#385773;';
          div.addEventListener('mouseenter', () => { div.style.background = '#edf8f0'; div.style.color = '#276b3a'; });
          div.addEventListener('mouseleave', () => { div.style.background = '#fff'; div.style.color = '#385773'; });
          div.addEventListener('mousedown', (e) => {
            e.preventDefault();
            lbsInput.value = item.nama;
            window._selectedLbsVillageKode = item.kode;
            window._selectedLbsAreaName = item.nama;
            lbsSelected.textContent = `\u2713 ${item.nama} (${item.kode})`;
            lbsSelected.style.display = 'block';
            lbsResults.style.display = 'none';
          });
          lbsResults.appendChild(div);
        });
        lbsResults.style.display = 'block';
      }, 200);
    });

    lbsInput.addEventListener('focus', () => {
      if (lbsInput.value.trim().length >= 2 && lbsResults.children.length) {
        lbsResults.style.display = 'block';
      }
    });

    document.addEventListener('click', (e) => {
      if (!lbsInput.contains(e.target) && !lbsResults.contains(e.target)) {
        lbsResults.style.display = 'none';
      }
    });

    ensureLbsVillageData();
  }
});
