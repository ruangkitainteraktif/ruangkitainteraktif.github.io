// ==========================================
// LAND COVER ANALYSIS - Sentinel-2 10m Land Cover
// Overlay/Intersect dengan batas desa
// ==========================================
(function () {
  const LANDCOVER_IMAGE_SERVER = 'https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer';
  const VILLAGE_BOUNDARY_URL = 'https://wilayah.smartartstudio.my.id/api/boundaries/';

  const LANDCOVER_CLASSES = [
    { id: 0, name: 'No Data', nameId: 'Tidak Ada Data', color: '#cccccc' },
    { id: 1, name: 'Water', nameId: 'Air', color: '#419bdf' },
    { id: 2, name: 'Trees', nameId: 'Hutan/Pohon', color: '#397d49' },
    { id: 3, name: 'Flooded Veg', nameId: 'Vegetasi Banjir', color: '#7a87c6' },
    { id: 4, name: 'Crops', nameId: 'Tanaman Pangan', color: '#e49635' },
    { id: 5, name: 'Built Area', nameId: 'Kawasan Terbangun', color: '#c4281b' },
    { id: 6, name: 'Bare Ground', nameId: 'Tanah Gundul', color: '#a59b8f' },
    { id: 7, name: 'Snow/Ice', nameId: 'Salju/Es', color: '#a8ebff' },
    { id: 8, name: 'Clouds', nameId: 'Awan', color: '#616161' },
    { id: 9, name: 'Rangeland', nameId: 'Padang Rumput', color: '#e3e2c3' }
  ];

  // Map dari class ID Esri ke LEGENDA INDEX
  // Esri band values: 1=Water, 2=Trees, 4=FloodedVeg, 5=Crops, 7=BuiltArea, 8=BareGround, 9=SnowIce, 10=Clouds, 11=Rangeland
  const ESRIBAND_TO_CLASS = { 1: 1, 2: 2, 4: 3, 5: 4, 7: 5, 8: 6, 9: 7, 10: 8, 11: 9 };

  let landcoverLayer = null;
  let selectedVillage = null;
  let lastLandcoverData = null;

  window.clearLandcoverAnalysis = function () {
    if (landcoverLayer && map.hasLayer(landcoverLayer)) map.removeLayer(landcoverLayer);
    landcoverLayer = null;
    lastLandcoverData = null;
  };

  function toWebMercator([lon, lat]) {
    const x = lon * 20037508.34 / 180;
    const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
    return [x, y * 20037508.34 / 180];
  }

  function fromWebMercator([x, y]) {
    const lon = x * 180 / 20037508.34;
    let lat = y * 180 / 20037508.34;
    lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
    return [lon, lat];
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[character]);
  }

  function getClassByEsriBand(bandValue) {
    const classIdx = ESRIBAND_TO_CLASS[Number(bandValue)];
    if (classIdx !== undefined) return LANDCOVER_CLASSES[classIdx];
    return LANDCOVER_CLASSES[0];
  }

  function getClassColor(classIdx) {
    return LANDCOVER_CLASSES[classIdx]?.color || '#cccccc';
  }

  function smallestSpacing(values) {
    const unique = [...new Set(values.map(v => v.toFixed(3)))].map(Number).sort((a, b) => a - b);
    let smallest = Infinity;
    for (let i = 1; i < unique.length; i++) {
      const d = unique[i] - unique[i - 1];
      if (d > 0.01 && d < smallest) smallest = d;
    }
    return Number.isFinite(smallest) ? smallest : 100;
  }

  async function fetchVillageBoundary(kode) {
    const response = await fetch(`${VILLAGE_BOUNDARY_URL}${encodeURIComponent(kode)}`);
    if (!response.ok) throw new Error(`Batas desa tidak tersedia (HTTP ${response.status})`);
    const data = await response.json();
    if (!data.path?.length) throw new Error('Geometri batas desa tidak tersedia');
    const rings = data.path.map(ring => ring.map(([lat, lon]) => [lon, lat]));
    return { name: data.nama || selectedVillage?.nama || 'Desa terpilih', rings };
  }

  async function fetchLandcoverSamples(rings) {
    const geometry = {
      rings: rings.map(ring => ring.map(toWebMercator)),
      spatialReference: { wkid: 102100 }
    };
    const params = new URLSearchParams({
      f: 'json',
      geometryType: 'esriGeometryPolygon',
      geometry: JSON.stringify(geometry),
      sampleCount: '400',
      returnFirstValueOnly: 'true',
      pixelSize: '10'
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(`${LANDCOVER_IMAGE_SERVER}/getSamples?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Sentinel-2 Land Cover HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.error) throw new Error(payload.error.message || 'Tidak dapat mengambil sampel Land Cover');
      return (payload.samples || [])
        .map(sample => {
          const bandVal = Number(String(sample.value || '').trim().split(/\s+/)[0]);
          const classInfo = getClassByEsriBand(bandVal);
          return {
            x: Number(sample.location?.x),
            y: Number(sample.location?.y),
            bandValue: bandVal,
            classId: classInfo.id,
            className: classInfo.nameId,
            color: classInfo.color
          };
        })
        .filter(s => Number.isFinite(s.x) && Number.isFinite(s.y) && s.classId > 0);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchLandcoverStatistics(rings) {
    const geometry = {
      rings: rings.map(ring => ring.map(toWebMercator)),
      spatialReference: { wkid: 102100 }
    };
    const params = new URLSearchParams({
      f: 'json',
      geometryType: 'esriGeometryPolygon',
      geometry: JSON.stringify(geometry),
      pixelSize: '10'
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(`${LANDCOVER_IMAGE_SERVER}/computeStatisticsHistograms?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Sentinel-2 Land Cover HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.error) throw new Error(payload.error.message || 'Gagal menghitung statistik Land Cover');
      const stats = payload.statistics?.[0];
      const histograms = payload.histograms?.[0];
      if (!histograms?.counts) throw new Error('Tidak ada data histogram Land Cover');
      return { stats, histograms };
    } finally {
      clearTimeout(timeout);
    }
  }

  function buildHistogramDistribution(histograms) {
    const distribution = {};
    const totalPixels = (histograms.counts || []).reduce((a, b) => a + b, 0);
    const mins = histograms.minValues || [];
    const counts = histograms.counts || [];

    for (let i = 0; i < counts.length; i++) {
      const bandVal = Math.round(mins[i] ?? i);
      const classInfo = getClassByEsriBand(bandVal);
      if (classInfo.id === 0) continue;
      const pct = totalPixels > 0 ? (counts[i] / totalPixels) * 100 : 0;
      if (!distribution[classInfo.id]) {
        distribution[classInfo.id] = { ...classInfo, count: 0, pct: 0 };
      }
      distribution[classInfo.id].count += counts[i];
      distribution[classInfo.id].pct += pct;
    }
    return { distribution, totalPixels };
  }

  function buildLandcoverPopupHtml(villageName, boundary, distribution, totalPixels, analysisAreaHa) {
    const classes = Object.values(distribution).sort((a, b) => b.pct - a.pct);
    const dominantClass = classes[0] || null;
    const vegetationClasses = classes.filter(c => [2, 3, 4].includes(c.id));
    const vegetationPct = vegetationClasses.reduce((sum, c) => sum + c.pct, 0);
    const builtClasses = classes.filter(c => c.id === 5);
    const builtPct = builtClasses.reduce((sum, c) => sum + c.pct, 0);

    let insightText = '';
    if (vegetationPct > 60) {
      insightText = `Area didominasi tutupan vegetasi (${vegetationPct.toFixed(1)}%), kondisi lahan relatif alami dan produktif.`;
    } else if (builtPct > 30) {
      insightText = `Kawasan terbangun cukup dominan (${builtPct.toFixed(1)}%), potensi urban heat island dan kebutuhan ruang terbuka hijau.`;
    } else if (dominantClass) {
      insightText = `Tutupan lahan didominasi ${dominantClass.nameId} (${dominantClass.pct.toFixed(1)}%).`;
    } else {
      insightText = 'Distribusi tutupan lahan relatif merata antar kelas.';
    }

    const distRows = classes.map(c => {
      return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${c.color};flex-shrink:0;"></span>
        <span style="flex:1;font-size:10px;color:#385773;">${c.nameId}</span>
        <span style="font-size:10px;font-weight:700;color:${c.color};min-width:40px;text-align:right;">${c.pct.toFixed(1)}%</span>
        <div style="width:60px;height:5px;background:#e5e7eb;border-radius:3px;overflow:hidden;">
          <div style="width:${Math.min(c.pct, 100)}%;height:100%;background:${c.color};border-radius:3px;"></div>
        </div>
      </div>`;
    }).join('');

    const statGrid = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:10px;">
        <div style="padding:6px 8px;background:#f0fdf4;border-radius:4px;border:1px solid #bbf7d0;">
          <div style="color:#6b7280;margin-bottom:2px;">Luas Area</div>
          <div style="font-weight:700;color:#166534;">${analysisAreaHa ? analysisAreaHa.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' ha' : '-'}</div>
        </div>
        <div style="padding:6px 8px;background:#f0fdf4;border-radius:4px;border:1px solid #bbf7d0;">
          <div style="color:#6b7280;margin-bottom:2px;">Total Piksel</div>
          <div style="font-weight:700;color:#166534;">${totalPixels.toLocaleString('id-ID')}</div>
        </div>
        <div style="padding:6px 8px;background:#eff6ff;border-radius:4px;border:1px solid #bfdbfe;">
          <div style="color:#6b7280;margin-bottom:2px;">Tutupan Vegetasi</div>
          <div style="font-weight:700;color:#1e40af;">${vegetationPct.toFixed(1)}%</div>
        </div>
        <div style="padding:6px 8px;background:#fef2f2;border-radius:4px;border:1px solid #fecaca;">
          <div style="color:#6b7280;margin-bottom:2px;">Kawasan Terbangun</div>
          <div style="font-weight:700;color:#991b1b;">${builtPct.toFixed(1)}%</div>
        </div>
      </div>`;

    return `
      <div class="landcover-popup">
        <div class="landcover-popup-header">
          <div class="landcover-popup-badge">
            <span class="landcover-popup-badge-dot"></span>
            Land Cover
          </div>
          <strong>${escapeHtml(villageName)}</strong>
        </div>
        <div class="landcover-popup-body">
          ${statGrid}
          <div style="margin-top:10px;">
            <div class="landcover-popup-section-title">Insight</div>
            <div style="font-size:10px;color:#475569;line-height:1.4;">${insightText}</div>
          </div>
          <div style="margin-top:10px;">
            <div class="landcover-popup-section-title">Distribusi Tutupan Lahan</div>
            ${distRows || '<div style="font-size:10px;color:#94a3b8;">Tidak ada data distribusi</div>'}
          </div>
          <div style="margin-top:10px;">
            <div class="landcover-popup-section-title">Sumber Data</div>
            <div style="font-size:9px;color:#94a3b8;">Sentinel-2 10m Land Cover (Esri / Impact Observatory)</div>
            <div style="font-size:9px;color:#94a3b8;">Resolusi: 10 meter · Koordinat: WGS84 / EPSG:4326</div>
          </div>
        </div>
        <div class="landcover-popup-footer">
          <span>Sumber: Sentinel-2 / Esri</span>
          <div class="landcover-popup-footer-actions">
            <button class="landcover-btn-print" onclick="printLandcoverPdf()">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 9V2h12v7"/>
                <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              Cetak PDF
            </button>
          </div>
        </div>
      </div>`;
  }

  function showLandcoverOnMap(boundary, distribution, totalPixels, samples) {
    if (landcoverLayer && map.hasLayer(landcoverLayer)) map.removeLayer(landcoverLayer);
    landcoverLayer = L.featureGroup().addTo(map);

    const boundaryFeature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: boundary.rings }
    };
    const analysisAreaHa = typeof turf !== 'undefined' ? turf.area(boundaryFeature) / 10000 : null;

    if (typeof turf !== 'undefined' && samples.length) {
      const halfWidth = smallestSpacing(samples.map(s => s.x)) / 2;
      const halfHeight = smallestSpacing(samples.map(s => s.y)) / 2;

      samples.forEach(sample => {
        const cell = turf.polygon([[
          fromWebMercator([sample.x - halfWidth, sample.y - halfHeight]),
          fromWebMercator([sample.x + halfWidth, sample.y - halfHeight]),
          fromWebMercator([sample.x + halfWidth, sample.y + halfHeight]),
          fromWebMercator([sample.x - halfWidth, sample.y + halfHeight]),
          fromWebMercator([sample.x - halfWidth, sample.y - halfHeight])
        ]], { classId: sample.classId, className: sample.className });

        try {
          const clipped = turf.intersect(turf.featureCollection([cell, boundaryFeature]));
          if (!clipped?.geometry) return;
          const color = sample.color;
          L.geoJSON(clipped, {
            style: { color, weight: 0.25, fillColor: color, fillOpacity: 0.72 }
          }).addTo(landcoverLayer);
        } catch (_e) { /* skip */ }
      });
    }

    const outline = L.geoJSON(boundaryFeature, {
      style: { color: '#0d9488', weight: 2, fillOpacity: 0 }
    }).addTo(landcoverLayer);

    const popupHtml = buildLandcoverPopupHtml(boundary.name, boundary, distribution, totalPixels, analysisAreaHa);
    outline.bindPopup(popupHtml, { maxWidth: 360, className: 'landcover-leaflet-popup' });

    const bounds = landcoverLayer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.12), { maxZoom: 14, duration: 0.6 });
    outline.openPopup();
  }

  function renderVillageOptions(items, elements) {
    const { results, input, selected } = elements;
    results.replaceChildren();
    if (!items.length) { results.style.display = 'none'; return; }
    items.forEach(item => {
      const option = document.createElement('button');
      option.type = 'button';
      option.style.cssText = 'display:block;width:100%;padding:7px 9px;border:0;border-bottom:1px solid #edf3f6;background:#fff;color:#385773;font-size:10px;text-align:left;cursor:pointer;';
      option.setAttribute('role', 'option');
      option.textContent = `${item.nama} (${item.kode})`;
      option.addEventListener('mouseenter', () => { option.style.background = '#edf8f0'; option.style.color = '#276b3a'; });
      option.addEventListener('mouseleave', () => { option.style.background = '#fff'; option.style.color = '#385773'; });
      option.addEventListener('click', () => {
        selectedVillage = item;
        window._selectedLandcoverVillageKode = item.kode;
        input.value = item.nama;
        selected.textContent = `\u2713 ${item.nama} (${item.kode})`;
        selected.style.display = 'block';
        results.style.display = 'none';
      });
      results.appendChild(option);
    });
    results.style.display = 'block';
  }

  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('landcoverVillageSearch');
    const results = document.getElementById('landcoverVillageResults');
    const selected = document.getElementById('landcoverVillageSelected');
    const button = document.getElementById('btnRunLandcover');
    if (!input || !results || !selected || !button) return;
    const elements = { input, results, selected };

    let villageData = [];
    let villageLoadPromise = null;

    function ensureLoaded() {
      if (villageLoadPromise) return villageLoadPromise;
      villageLoadPromise = (async () => {
        try {
          const res = await fetch('assets/data/kode_wilayah.json');
          if (!res.ok) return;
          const all = await res.json();
          villageData = all.filter(item => item.kode && (item.kode.match(/\./g) || []).length === 3);
        } catch (e) {
          console.warn('[LandCover] Gagal memuat kode_wilayah.json:', e);
        }
      })();
      return villageLoadPromise;
    }

    ensureLoaded();

    input.addEventListener('input', async () => {
      selectedVillage = null;
      window._selectedLandcoverVillageKode = null;
      selected.style.display = 'none';
      const query = input.value.trim().toLowerCase();
      if (query.length < 2) { results.style.display = 'none'; return; }
      await ensureLoaded();
      const filtered = villageData.filter(item => {
        const name = item.nama.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const q = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return name.includes(q);
      }).slice(0, 20);
      renderVillageOptions(filtered, elements);
    });

    input.addEventListener('focus', async () => {
      if (input.value.trim().length >= 2) {
        await ensureLoaded();
        const q = input.value.trim().toLowerCase();
        const filtered = villageData.filter(item => {
          const name = item.nama.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const nq = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return name.includes(nq);
        }).slice(0, 20);
        renderVillageOptions(filtered, elements);
      }
    });

    document.addEventListener('click', event => {
      if (!event.target.closest('#landcoverVillageResults') && event.target !== input) {
        results.style.display = 'none';
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { results.style.display = 'none'; input.blur(); }
    });

    button.addEventListener('click', async () => {
      if (!selectedVillage) { alert('Silakan pilih desa dari dropdown terlebih dahulu.'); return; }

      button.disabled = true;
      button.innerHTML = '<span class="ndvi-btn-spinner"></span>Menganalisis Land Cover\u2026';

      try {
        const boundary = await fetchVillageBoundary(selectedVillage.kode);
        const [statistics, samples] = await Promise.all([
          fetchLandcoverStatistics(boundary.rings),
          fetchLandcoverSamples(boundary.rings)
        ]);

        const { distribution, totalPixels } = buildHistogramDistribution(statistics.histograms);

        showLandcoverOnMap(boundary, distribution, totalPixels, samples);

        lastLandcoverData = {
          village: selectedVillage,
          boundary,
          distribution,
          totalPixels,
          samples
        };

        const sidebar = document.getElementById('sidebar-left');
        if (sidebar && !sidebar.classList.contains('collapsed')) {
          sidebar.classList.add('collapsed');
          const toggleBtn = document.getElementById('toggleBtn');
          if (toggleBtn) toggleBtn.innerHTML = '&gt;&gt;';
          setTimeout(() => map.invalidateSize(), 300);
        }
      } catch (error) {
        console.warn('[LandCover] Analisis gagal:', error);
        alert(`Analisis Land Cover gagal: ${error.message || 'Terjadi kesalahan.'}`);
      } finally {
        button.disabled = false;
        button.innerHTML = 'Jalankan Analisis';
      }
    });
  });

  // ==========================================
  // PRINT PDF - Land Cover Analysis
  // ==========================================
  window.printLandcoverPdf = async function () {
    if (!lastLandcoverData) {
      alert('Tidak ada data analisis Land Cover yang tersedia. Silakan jalankan analisis terlebih dahulu.');
      return;
    }

    const { village, boundary, distribution, totalPixels, samples } = lastLandcoverData;
    const classes = Object.values(distribution).sort((a, b) => b.pct - a.pct);
    const dominantClass = classes[0] || null;
    const vegetationClasses = classes.filter(c => [2, 3, 4].includes(c.id));
    const vegetationPct = vegetationClasses.reduce((sum, c) => sum + c.pct, 0);
    const builtClasses = classes.filter(c => c.id === 5);
    const builtPct = builtClasses.reduce((sum, c) => sum + c.pct, 0);

    const boundaryFeature = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: boundary.rings } };
    const analysisAreaHa = typeof turf !== 'undefined' ? turf.area(boundaryFeature) / 10000 : null;

    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`;
    const fileName = `LandCover_${boundary.name.replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}.pdf`;

    const btn = document.querySelector('.landcover-btn-print');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="ndvi-btn-spinner"></span>Membuat PDF\u2026'; }

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

      if (landcoverLayer) {
        const bounds = landcoverLayer.getBounds();
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
      pdf.text('Analisis Land Cover', margin + 2, margin + 6);
      const villageCode = village?.kode || '';
      const titleText = villageCode ? `${boundary.name} (${villageCode})` : boundary.name;
      const dashX = margin + 2 + pdf.getTextWidth('Analisis Land Cover') + 2;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(5);
      pdf.setTextColor(150, 150, 150);
      pdf.text('-', dashX, margin + 6);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(13, 148, 136);
      const nameX = dashX + 4;
      pdf.text(titleText, nameX, margin + 6);

      const dateFormatted = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
      pdf.setFontSize(7.5);
      pdf.setTextColor(100, 116, 139);
      pdf.text(dateFormatted, pageW - margin - 2, margin + 5, { align: 'right' });
      if (analysisAreaHa) pdf.text(analysisAreaHa.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' ha', pageW - margin - 2, margin + 9, { align: 'right' });
      pdf.setFontSize(7);
      pdf.setTextColor(150, 150, 150);
      pdf.text('WGS84 / EPSG:4326', pageW - margin - 2, margin + 12, { align: 'right' });

      pdf.setDrawColor(55, 65, 81);
      pdf.setLineWidth(0.3);
      pdf.rect(mapFrameX, mapFrameY, mapFrameW, mapFrameH);

      const leafletContainer = document.querySelector('.leaflet-container');
      if (leafletContainer) {
        map.getRenderer(landcoverLayer || map).options.padding = 0;
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
        pdf.text(lat.toFixed(latInterval < 0.1 ? 2 : 1) + '\u00B0', mapFrameX - 1, py + 1.5, { align: 'right' });
      }

      const lonStart = Math.ceil(lonMin / lonInterval) * lonInterval;
      for (let lon = lonStart; lon <= lonMax; lon += lonInterval) {
        const ratio = (lon - lonMin) / lonRange;
        const px = mapFrameX + ratio * mapFrameW;
        pdf.setLineDashPattern([1.5, 1.5], 0);
        pdf.line(px, mapFrameY, px, mapFrameY + mapFrameH);
        pdf.setLineDashPattern([], 0);
        pdf.text(lon.toFixed(lonInterval < 0.1 ? 2 : 1) + '\u00B0', px, mapFrameY + mapFrameH + 3.5, { align: 'center' });
      }

      const naX = mapFrameX + mapFrameW - 14;
      const naY = mapFrameY + 6;
      const naSize = 8;
      const naCx = naX + naSize / 2;
      pdf.setFillColor(30, 41, 59);
      pdf.setDrawColor(30, 41, 59);
      pdf.setLineWidth(0.3);
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
      pdf.text('HASIL ANALISIS LAND COVER', panelX + 4, py);
      py += 6;

      const cardW = panelW - 8;
      pdf.setFillColor(240, 253, 244);
      pdf.setDrawColor(220, 252, 231);
      pdf.roundedRect(panelX + 4, py, cardW, 18, 2, 2, 'FD');
      pdf.setFontSize(6);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 116, 139);
      pdf.text('Tutupan Dominan', panelX + 8, py + 5);
      pdf.text('Luas Area Analisis', panelX + 8, py + 11);
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      if (dominantClass) {
        const dcRgb = hexToRgb(dominantClass.color);
        pdf.setTextColor(dcRgb[0], dcRgb[1], dcRgb[2]);
        const dominantText = dominantClass.nameId + ' (' + dominantClass.pct.toFixed(1) + '%)';
        const splitDominant = pdf.splitTextToSize(dominantText, panelW - 48);
        pdf.text(splitDominant, panelX + 40, py + 5);
      } else {
        pdf.setTextColor(30, 41, 59);
        pdf.text('-', panelX + 40, py + 5);
      }
      pdf.setTextColor(30, 41, 59);
      pdf.text(analysisAreaHa ? analysisAreaHa.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' ha' : '-', panelX + 40, py + 11);
      py += 23;

      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(55, 65, 81);
      pdf.text('Distribusi Tutupan Lahan', panelX + 4, py);
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.line(panelX + 4, py + 1, panelX + cardW, py + 1);
      py += 4;

      const barLabelW = 32;
      const barPercentW = 12;
      const barMaxW = cardW - barLabelW - barPercentW - 4;
      for (const c of classes) {
        const barW = (c.pct / 100) * barMaxW;
        const rgb = hexToRgb(c.color);

        pdf.setFontSize(5.5);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 116, 139);
        pdf.text(c.nameId, panelX + 4, py + 2.5);

        const barX = panelX + 4 + barLabelW;
        pdf.setFillColor(241, 245, 249);
        pdf.roundedRect(barX, py, barMaxW, 3.5, 1, 1, 'F');
        pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
        if (barW > 0) pdf.roundedRect(barX, py, Math.max(barW, 1.5), 3.5, 1, 1, 'F');

        pdf.setFontSize(5.5);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
        pdf.text(c.pct.toFixed(0) + '%', barX + barMaxW + 2, py + 2.5);
        py += 5;
      }
      py += 3;

      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(55, 65, 81);
      pdf.text('Ringkasan', panelX + 4, py);
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.line(panelX + 4, py + 1, panelX + cardW, py + 1);
      py += 4;

      const summaryItems = [
        ['Tutupan Vegetasi', vegetationPct.toFixed(1) + '%'],
        ['Kawasan Terbangun', builtPct.toFixed(1) + '%'],
        ['Total Piksel', totalPixels.toLocaleString('id-ID')],
        ['Jumlah Sampel', String(samples.length)]
      ];
      for (const [label, value] of summaryItems) {
        pdf.setFontSize(5.5);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 116, 139);
        pdf.text(label, panelX + 4, py);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(55, 65, 81);
        pdf.text(value, panelX + 34, py);
        py += 3.5;
      }
      py += 3;

      let insightText = '';
      if (vegetationPct > 60) {
        insightText = `Area didominasi tutupan vegetasi (${vegetationPct.toFixed(1)}%), kondisi lahan relatif alami dan produktif.`;
      } else if (builtPct > 30) {
        insightText = `Kawasan terbangun cukup dominan (${builtPct.toFixed(1)}%), potensi urban heat island dan kebutuhan ruang terbuka hijau.`;
      } else if (dominantClass) {
        insightText = `Tutupan lahan didominasi ${dominantClass.nameId} (${dominantClass.pct.toFixed(1)}%).`;
      } else {
        insightText = 'Distribusi tutupan lahan relatif merata antar kelas.';
      }
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(55, 65, 81);
      pdf.text('Insight', panelX + 4, py);
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.line(panelX + 4, py + 1, panelX + cardW, py + 1);
      py += 4;
      pdf.setFontSize(6.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(71, 85, 105);
      const splitInsight = pdf.splitTextToSize(insightText, cardW);
      pdf.text(splitInsight, panelX + 4, py);
      py += splitInsight.length * 3.2 + 3;

      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(55, 65, 81);
      pdf.text('Metadata & Sumber', panelX + 4, py);
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.line(panelX + 4, py + 1, panelX + cardW, py + 1);
      py += 4;

      const metaLines = [
        ['Sumber', 'Sentinel-2 / Esri / Impact Observatory'],
        ['Resolusi', '10 meter'],
        ['Metode', 'Overlay intersect batas desa'],
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
      const lgLegend = LANDCOVER_CLASSES.filter(c => c.id > 0);
      const lgX = panelX + 4;
      const lgW = panelW - 8;
      const lgRowH = 3.5;
      const lgRows = Math.ceil(lgLegend.length / 2);
      const lgH = lgRows * lgRowH + 8;
      const lgY = py;
      const lgColW = (lgW - 8) / 2;

      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(55, 65, 81);
      pdf.text('Legenda Land Cover', lgX, lgY + 4);
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.line(lgX, lgY + 5, lgX + lgW, lgY + 5);

      let lgRowY = lgY + 8;
      for (let i = 0; i < lgLegend.length; i++) {
        const band = lgLegend[i];
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
        pdf.text(band.nameId, itemX + 4, itemY + 2.2);
      }

      const bottomY = pageH - margin - 2;
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.line(margin, bottomY - bottomStripH + 2, pageW - margin, bottomY - bottomStripH + 2);
      pdf.setFontSize(6);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(120, 120, 120);
      pdf.text('Sumber data: Sentinel-2 10m Land Cover (Esri) \u00B7 Dibuat oleh RuangKita Pro', margin + 2, bottomY - 4);
      pdf.text('Cetak: ' + dateFormatted, pageW - margin - 2, bottomY - 4, { align: 'right' });
      pdf.setFontSize(5);
      pdf.setTextColor(160, 160, 160);
      pdf.text('Koordinat: WGS84 / EPSG:4326 \u00B7 Grid graticule untuk referensi ArcGIS / QGIS', margin + 2, bottomY);

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
      console.error('[LandCover] Gagal membuat PDF:', error);
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
})();
