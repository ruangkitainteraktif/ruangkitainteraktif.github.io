// ==========================================
// NDVI ANALYSIS - Sentinel-2 ImageServer
// ==========================================
(function () {
  const SENTINEL_NDVI_URL = 'https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer/computeStatisticsHistograms';
  const SENTINEL_SAMPLES_URL = 'https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer/getSamples';
  const SENTINEL_CATALOG_URL = 'https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer/query';
  const VILLAGE_BOUNDARY_URL = 'https://wilayah.smartartstudio.my.id/api/boundaries/';
  let villageIndex = [];
  let villageLoadPromise = null;
  let ndviLayer = null;
  let selectedVillage = null;
  let lastNdviData = null;

  window.clearNdviAnalysis = function() {
    if (ndviLayer && map.hasLayer(ndviLayer)) map.removeLayer(ndviLayer);
    ndviLayer = null;
    lastNdviData = null;
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

  function ndviCategory(value) {
    if (value >= 0.6) return { label: 'Sangat Tinggi', color: '#176b34', icon: '🟢' };
    if (value >= 0.4) return { label: 'Tinggi', color: '#3f9c49', icon: '🟢' };
    if (value >= 0.2) return { label: 'Sedang', color: '#a8b93b', icon: '🟡' };
    return { label: 'Sangat Rendah', color: '#c62828', icon: '🔴' };
  }

  function ndviColor(value) {
    const stops = [
      { value: -0.2, color: [57, 124, 168] },
      { value: 0, color: [198, 135, 42] },
      { value: 0.2, color: [215, 190, 55] },
      { value: 0.4, color: [101, 169, 66] },
      { value: 0.6, color: [43, 132, 59] },
      { value: 0.85, color: [18, 91, 43] }
    ];
    if (value <= stops[0].value) return `rgb(${stops[0].color.join(',')})`;
    for (let index = 0; index < stops.length - 1; index++) {
      const start = stops[index];
      const end = stops[index + 1];
      if (value <= end.value) {
        const ratio = (value - start.value) / (end.value - start.value);
        return `rgb(${start.color.map((channel, channelIndex) => Math.round(channel + ratio * (end.color[channelIndex] - channel))).join(',')})`;
      }
    }
    return `rgb(${stops.at(-1).color.join(',')})`;
  }

  async function loadVillages() {
    if (villageLoadPromise) return villageLoadPromise;
    villageLoadPromise = fetch('assets/data/kode_wilayah.json')
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(items => {
        villageIndex = items.filter(item => item.kode && (item.kode.match(/\./g) || []).length === 3);
      })
      .catch(error => {
        console.warn('[NDVI] Gagal memuat daftar desa:', error);
        villageIndex = [];
      });
    return villageLoadPromise;
  }

  async function fetchVillageBoundary(kode) {
    const response = await fetch(`${VILLAGE_BOUNDARY_URL}${encodeURIComponent(kode)}`);
    if (!response.ok) throw new Error(`Batas desa tidak tersedia (HTTP ${response.status})`);
    const data = await response.json();
    if (!data.path?.length) throw new Error('Geometri batas desa tidak tersedia');
    const rings = data.path.map(ring => ring.map(([lat, lon]) => [lon, lat]));
    return { name: data.nama || selectedVillage?.nama || 'Desa terpilih', rings };
  }

  async function fetchNdviStatistics(rings) {
    const geometry = {
      rings: rings.map(ring => ring.map(toWebMercator)),
      spatialReference: { wkid: 102100 }
    };
    const params = new URLSearchParams({
      f: 'json',
      geometryType: 'esriGeometryPolygon',
      geometry: JSON.stringify(geometry),
      renderingRule: JSON.stringify({ rasterFunction: 'NDVI Raw' }),
      pixelSize: '10'
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(`${SENTINEL_NDVI_URL}?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Sentinel-2 HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.error) throw new Error(payload.error.message || 'Sentinel-2 tidak dapat menghitung NDVI');
      const stats = payload.statistics?.[0];
      if (!stats || !Number.isFinite(stats.mean)) throw new Error('Tidak ada piksel Sentinel-2 yang valid pada batas desa ini');
      return stats;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchNdviSamples(rings) {
    const geometry = {
      rings: rings.map(ring => ring.map(toWebMercator)),
      spatialReference: { wkid: 102100 }
    };
    const params = new URLSearchParams({
      f: 'json',
      geometryType: 'esriGeometryPolygon',
      geometry: JSON.stringify(geometry),
      sampleCount: '225',
      returnFirstValueOnly: 'true',
      pixelSize: '10'
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(`${SENTINEL_SAMPLES_URL}?${params}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Sentinel-2 HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.error) throw new Error(payload.error.message || 'Sentinel-2 tidak dapat mengambil sampel NDVI');
      return (payload.samples || []).map(sample => {
        const bands = String(sample.value || '').trim().split(/\s+/).map(Number);
        const red = bands[3];
        const nir = bands[7];
        const ndvi = Number.isFinite(red) && Number.isFinite(nir) && red + nir !== 0 ? (nir - red) / (nir + red) : null;
        return { x: Number(sample.location?.x), y: Number(sample.location?.y), ndvi, rasterId: sample.rasterId };
      }).filter(sample => Number.isFinite(sample.x) && Number.isFinite(sample.y) && Number.isFinite(sample.ndvi));
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchImageMetadata(rasterId) {
    if (!rasterId) return null;
    const params = new URLSearchParams({
      f: 'json',
      objectIds: String(rasterId),
      outFields: 'acquisitiondate,cloudcover',
      returnGeometry: 'false'
    });
    try {
      const response = await fetch(`${SENTINEL_CATALOG_URL}?${params}`);
      if (!response.ok) return null;
      const data = await response.json();
      return data.features?.[0]?.attributes || null;
    } catch (error) {
      console.warn('[NDVI] Metadata citra tidak tersedia:', error);
      return null;
    }
  }

  function smallestSpacing(values) {
    const unique = [...new Set(values.map(value => value.toFixed(3)))].map(Number).sort((a, b) => a - b);
    let smallest = Infinity;
    for (let index = 1; index < unique.length; index++) {
      const difference = unique[index] - unique[index - 1];
      if (difference > 0.01 && difference < smallest) smallest = difference;
    }
    return Number.isFinite(smallest) ? smallest : 100;
  }

  function buildNdviDetails(mean, stats, samples, cloudPercent, imageDate, analysisAreaHa) {
    const bands = [
      { label: 'Sangat rendah', min: -Infinity, max: 0, color: '#397ca8' },
      { label: 'Rendah', min: 0, max: 0.2, color: '#c6872a' },
      { label: 'Sedang', min: 0.2, max: 0.4, color: '#d7be37' },
      { label: 'Tinggi', min: 0.4, max: 0.6, color: '#65a942' },
      { label: 'Sangat tinggi', min: 0.6, max: Infinity, color: '#176b34' }
    ];
    const totalSamples = samples.length || 1;
    const distribution = bands.map(band => {
      const count = samples.filter(sample => sample.ndvi >= band.min && sample.ndvi < band.max).length;
      const percent = (count / totalSamples) * 100;
      return `<div class="ndvi-popup-dist-row">
        <span class="ndvi-popup-dist-label">${band.label}</span>
        <span class="ndvi-popup-dist-bar"><i style="width:${percent.toFixed(1)}%;background:${band.color}"></i></span>
        <b class="ndvi-popup-dist-value" style="color:${band.color}">${percent.toFixed(0)}%</b>
      </div>`;
    }).join('');
    const dominantBand = bands.map(band => ({ ...band, count: samples.filter(sample => sample.ndvi >= band.min && sample.ndvi < band.max).length }))
      .sort((first, second) => second.count - first.count)[0];
    const insight = mean >= 0.4
      ? `Vegetasi didominasi kondisi ${dominantBand.label.toLowerCase()}; tutupan tanaman relatif sehat.`
      : mean >= 0.2
        ? `Vegetasi berada pada kondisi sedang; area dengan nilai rendah perlu dipantau.`
        : `Nilai NDVI cenderung rendah; cek kemungkinan lahan terbuka, badan air, atau tanaman stres.`;
    const quality = !Number.isFinite(cloudPercent) ? { label: 'Metadata awan tidak tersedia', color: '#78909c' }
      : cloudPercent <= 10 ? { label: 'Baik — tutupan awan rendah', color: '#2e7d32' }
        : cloudPercent <= 30 ? { label: 'Cukup — sebagian area berpotensi tertutup awan', color: '#b26a00' }
          : { label: 'Terbatas — tutupan awan cukup tinggi', color: '#c62828' };
    const section = (title, content) => `<div class="ndvi-popup-section"><div class="ndvi-popup-section-title">${title}</div>${content}</div>`;

    return {
      insight: section('Insight', `<div class="ndvi-popup-insight-text">${insight}</div>`),
      distribution: section('Distribusi', distribution),
      statistics: section('Statistik', `<div class="ndvi-popup-stat-grid"><span>Minimum <b>${Number(stats.min).toFixed(2)}</b></span><span>Maksimum <b>${Number(stats.max).toFixed(2)}</b></span><span>Rata-rata <b>${mean.toFixed(3)}</b></span><span>Median <b>${Number(stats.median).toFixed(2)}</b></span></div>`),
      quality: section('Kualitas', `<div class="ndvi-popup-quality" style="color:${quality.color}">${quality.label}</div><div class="ndvi-popup-quality-detail">${samples.length} zona sampel · ${Number(stats.count || 0).toLocaleString('id-ID')} piksel valid</div>`),
      imagery: section('Citra', `<div class="ndvi-popup-stat-grid"><span>Tanggal</span><b>${imageDate}</b><span>Resolusi</span><b>10 m</b><span>Cloud cover</span><b>${Number.isFinite(cloudPercent) ? `${cloudPercent.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%` : '-'}</b><span>Luas analisis</span><b>${analysisAreaHa ? `${analysisAreaHa.toLocaleString('id-ID', { maximumFractionDigits: 2 })} ha` : '-'}</b></div>`)
    };
  }

  function showNdviOnMap(boundary, stats, samples, imageMetadata) {
    if (ndviLayer && map.hasLayer(ndviLayer)) map.removeLayer(ndviLayer);
    const mean = Number(stats.mean);
    const category = ndviCategory(mean);
    const boundaryFeature = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: boundary.rings } };
    const analysisAreaHa = typeof turf !== 'undefined' ? turf.area(boundaryFeature) / 10000 : null;
    const imageDate = imageMetadata?.acquisitiondate
      ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(imageMetadata.acquisitiondate))
      : 'Tidak tersedia';
    const cloudValue = Number(imageMetadata?.cloudcover);
    const cloudPercentValue = Number.isFinite(cloudValue) ? (cloudValue <= 1 ? cloudValue * 100 : cloudValue) : NaN;
    const details = buildNdviDetails(mean, stats, samples, cloudPercentValue, imageDate, analysisAreaHa);
    const popupContent = `
      <div class="ndvi-popup">
        <div class="ndvi-popup-header">
          <div class="ndvi-popup-badge">
            <span class="ndvi-popup-badge-dot"></span>
            NDVI
          </div>
          <strong>${escapeHtml(boundary.name)}</strong>
        </div>
        <div class="ndvi-popup-body">
          <div class="ndvi-popup-summary">
            <div class="ndvi-popup-summary-item">
              <span>NDVI Rata-rata</span>
              <b style="color:${category.color}">${mean.toFixed(3)}</b>
            </div>
            <div class="ndvi-popup-summary-item">
              <span>Kondisi Vegetasi</span>
              <b style="color:${category.color}">${category.label}</b>
            </div>
          </div>
          <div class="ndvi-popup-bar">
            <div class="ndvi-popup-bar-fill"></div>
            <div class="ndvi-popup-bar-scale">
              <span>Rendah</span><span>NDVI</span><span>Tinggi</span>
            </div>
          </div>
          ${details.insight}
          ${details.distribution}
          ${details.statistics}
          ${details.quality}
          ${details.imagery}
        </div>
        <div class="ndvi-popup-footer">
          <span>Sumber: Sentinel-2</span>
          <div class="ndvi-popup-footer-actions">
            <button class="ndvi-btn-print" onclick="printNdviPdf()">
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
    ndviLayer = L.featureGroup().addTo(map);

    if (typeof turf !== 'undefined' && samples.length) {
      const halfWidth = smallestSpacing(samples.map(sample => sample.x)) / 2;
      const halfHeight = smallestSpacing(samples.map(sample => sample.y)) / 2;
      samples.forEach(sample => {
        const cell = turf.polygon([[
          fromWebMercator([sample.x - halfWidth, sample.y - halfHeight]),
          fromWebMercator([sample.x + halfWidth, sample.y - halfHeight]),
          fromWebMercator([sample.x + halfWidth, sample.y + halfHeight]),
          fromWebMercator([sample.x - halfWidth, sample.y + halfHeight]),
          fromWebMercator([sample.x - halfWidth, sample.y - halfHeight])
        ]], { ndvi: sample.ndvi });
        try {
          const clipped = turf.intersect(turf.featureCollection([cell, boundaryFeature]));
          if (!clipped?.geometry) return;
          const color = ndviColor(sample.ndvi);
          const category = ndviCategory(sample.ndvi);
          const [lon, lat] = fromWebMercator([sample.x, sample.y]);
          const pct = Math.min(100, Math.max(0, ((sample.ndvi + 0.2) / 1.05) * 100));
          const pixelPopupHtml = `
            <div class="ndvi-popup ndvi-popup-pixel">
              <div class="ndvi-popup-header">
                <div class="ndvi-popup-badge">
                  <span class="ndvi-popup-badge-dot"></span>
                  Pixel NDVI
                </div>
                <strong>${sample.ndvi.toFixed(3)}</strong>
              </div>
              <div class="ndvi-popup-body">
                <div class="ndvi-popup-summary">
                  <div class="ndvi-popup-summary-item">
                    <span>Kondisi Vegetasi</span>
                    <b style="color:${category.color}">${category.label}</b>
                  </div>
                </div>
                <div class="ndvi-popup-bar">
                  <div class="ndvi-popup-bar-fill">
                    <div class="ndvi-popup-bar-marker" style="left:${pct}%"></div>
                  </div>
                  <div class="ndvi-popup-bar-scale">
                    <span>-0.2</span><span>${sample.ndvi.toFixed(3)}</span><span>0.85</span>
                  </div>
                </div>
                <div class="ndvi-popup-section">
                  <div class="ndvi-popup-section-title">Koordinat</div>
                  <div class="ndvi-popup-stat-grid">
                    <span>Latitude</span><b>${lat.toFixed(5)}</b>
                    <span>Longitude</span><b>${lon.toFixed(5)}</b>
                  </div>
                </div>
              </div>
              <div class="ndvi-popup-footer">
                <span>Sumber: Sentinel-2</span>
              </div>
            </div>
          `;
          L.geoJSON(clipped, { style: { color, weight: 0.25, fillColor: color, fillOpacity: 0.72 } })
            .bindPopup(pixelPopupHtml, { maxWidth: 340, className: 'ndvi-leaflet-popup' })
            .addTo(ndviLayer);
        } catch (_error) { /* Lewati grid yang tidak dapat di-clip. */ }
      });
    }

    const outline = L.geoJSON(boundaryFeature, { style: { color: '#1f5f33', weight: 2, fillOpacity: 0 } }).addTo(ndviLayer);
    outline.bindPopup(popupContent, { maxWidth: 340, className: 'ndvi-leaflet-popup' });
    const bounds = ndviLayer.getBounds();
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
        input.value = item.nama;
        selected.textContent = `✓ ${item.nama} (${item.kode})`;
        selected.style.display = 'block';
        results.style.display = 'none';
      });
      results.appendChild(option);
    });
    results.style.display = 'block';
  }

  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('ndviVillageSearch');
    const results = document.getElementById('ndviVillageResults');
    const selected = document.getElementById('ndviVillageSelected');
    const button = document.getElementById('btnRunNdvi');
    if (!input || !results || !selected || !button) return;
    const elements = { input, results, selected };

    loadVillages();
    input.addEventListener('input', async () => {
      selectedVillage = null;
      selected.style.display = 'none';
      const query = input.value.trim().toLowerCase();
      if (query.length < 2) { results.style.display = 'none'; return; }
      await loadVillages();
      renderVillageOptions(villageIndex.filter(item => item.nama.toLowerCase().includes(query)).slice(0, 20), elements);
    });
    document.addEventListener('click', event => {
      if (!event.target.closest('#ndviVillageResults') && event.target !== input) results.style.display = 'none';
    });

    button.addEventListener('click', async () => {
      if (!selectedVillage) { alert('Silakan pilih desa dari dropdown terlebih dahulu.'); return; }
      button.disabled = true;
      button.innerHTML = '<span class="ndvi-btn-spinner"></span>Menghitung NDVI…';
      try {
        const boundary = await fetchVillageBoundary(selectedVillage.kode);
        const [statistics, samples] = await Promise.all([
          fetchNdviStatistics(boundary.rings),
          fetchNdviSamples(boundary.rings)
        ]);
        const imageMetadata = await fetchImageMetadata(samples[0]?.rasterId);
        showNdviOnMap(boundary, statistics, samples, imageMetadata);

        lastNdviData = {
          village: selectedVillage,
          boundary,
          stats: statistics,
          samples,
          imageMetadata
        };

        const sidebar = document.getElementById('sidebar-left');
        if (sidebar && !sidebar.classList.contains('collapsed')) {
          sidebar.classList.add('collapsed');
          const toggleBtn = document.getElementById('toggleBtn');
          if (toggleBtn) toggleBtn.innerHTML = '&gt;&gt;';
          setTimeout(() => map.invalidateSize(), 300);
        }
      } catch (error) {
        console.warn('[NDVI] Analisis gagal:', error);
        alert(`Analisis NDVI gagal: ${error.message || 'Terjadi kesalahan.'}`);
      } finally {
        button.disabled = false;
        button.innerHTML = 'Analisis NDVI';
      }
    });
  });

  window.printNdviPdf = async function() {
    if (!lastNdviData) {
      alert('Tidak ada data analisis NDVI yang tersedia. Silakan jalankan analisis terlebih dahulu.');
      return;
    }

    const { village, boundary, stats, samples, imageMetadata } = lastNdviData;
    const mean = Number(stats.mean);
    const category = ndviCategory(mean);
    const cloudValue = Number(imageMetadata?.cloudcover);
    const cloudPercent = Number.isFinite(cloudValue) ? (cloudValue <= 1 ? cloudValue * 100 : cloudValue) : NaN;
    const imageDate = imageMetadata?.acquisitiondate
      ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(imageMetadata.acquisitiondate))
      : 'Tidak tersedia';
    const boundaryFeature = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: boundary.rings } };
    const analysisAreaHa = typeof turf !== 'undefined' ? turf.area(boundaryFeature) / 10000 : null;
    const totalSamples = samples.length || 1;

    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`;
    const fileName = `NDVI_${boundary.name.replace(/[^a-zA-Z0-9]/g, '_')}_${dateStr}.pdf`;

    const btn = document.querySelector('.ndvi-btn-print');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="ndvi-btn-spinner"></span>Membuat PDF…'; }

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

      if (ndviLayer) {
        const bounds = ndviLayer.getBounds();
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
      const panelH = mapFrameH;

      function hexToRgb(hex) {
        const h = hex.replace('#', '');
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
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
      pdf.text('Analisis NDVI', margin + 2, margin + 6);
      const villageCode = village?.kode || '';
      const titleText = villageCode ? `${boundary.name} (${villageCode})` : boundary.name;
      const dashX = margin + 2 + pdf.getTextWidth('Analisis NDVI') + 2;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(5);
      pdf.setTextColor(150, 150, 150);
      pdf.text('-', dashX, margin + 6);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(22, 101, 52);
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
      const mapEl = document.getElementById('map');
      if (mapEl && leafletContainer) {
        map.getRenderer(ndviLayer || map).options.padding = 0;
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

      function calcInterval(range, targetLines) {
        const raw = range / targetLines;
        const mag = Math.pow(10, Math.floor(Math.log10(raw)));
        const norm = raw / mag;
        if (norm <= 1.5) return mag;
        if (norm <= 3.5) return 2 * mag;
        if (norm <= 7.5) return 5 * mag;
        return 10 * mag;
      }

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
        const label = lat.toFixed(latInterval < 0.1 ? 2 : 1) + '°';
        pdf.text(label, mapFrameX - 1, py + 1.5, { align: 'right' });
      }

      const lonStart = Math.ceil(lonMin / lonInterval) * lonInterval;
      for (let lon = lonStart; lon <= lonMax; lon += lonInterval) {
        const ratio = (lon - lonMin) / lonRange;
        const px = mapFrameX + ratio * mapFrameW;
        pdf.setLineDashPattern([1.5, 1.5], 0);
        pdf.line(px, mapFrameY, px, mapFrameY + mapFrameH);
        pdf.setLineDashPattern([], 0);
        const label = lon.toFixed(lonInterval < 0.1 ? 2 : 1) + '°';
        pdf.text(label, px, mapFrameY + mapFrameH + 3.5, { align: 'center' });
      }

      const naX = mapFrameX + mapFrameW - 14;
      const naY = mapFrameY + 6;
      const naSize = 8;
      pdf.setFillColor(30, 41, 59);
      pdf.setDrawColor(30, 41, 59);
      pdf.setLineWidth(0.3);
      const naCx = naX + naSize / 2;
      const naTop = naY;
      const naBot = naY + naSize;
      pdf.triangle(naCx, naTop, naCx - naSize / 2, naBot, naCx + naSize / 2, naBot, 'F');
      pdf.setFillColor(255, 255, 255);
      pdf.triangle(naCx, naTop + naSize * 0.35, naCx - naSize * 0.25, naBot, naCx + naSize * 0.25, naBot, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(30, 41, 59);
      pdf.text('N', naCx, naTop - 1.5, { align: 'center' });

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
      pdf.text(`${sbValue}`, sbX + actualW / 2, sbY - 1, { align: 'center' });
      pdf.text(`${sbValue * 2} ${sbLabelUnit}`, sbX + actualW, sbY - 1, { align: 'center' });

      const lgX = mapFrameX + mapFrameW - 52;
      const lgY = mapFrameY + mapFrameH - 30;
      const lgW = 48;
      const lgH = 24;
      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(220, 220, 220);
      pdf.setLineWidth(0.2);
      pdf.roundedRect(lgX, lgY, lgW, lgH, 1, 1, 'FD');
      pdf.setFontSize(6);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(30, 41, 59);
      pdf.text('Legenda NDVI', lgX + 3, lgY + 4);

      const legendBands = [
        { label: 'Sangat rendah', color: '#397ca8', range: '< 0' },
        { label: 'Rendah', color: '#c6872a', range: '0 - 0.2' },
        { label: 'Sedang', color: '#d7be37', range: '0.2 - 0.4' },
        { label: 'Tinggi', color: '#65a942', range: '0.4 - 0.6' },
        { label: 'Sangat tinggi', color: '#176b34', range: '>= 0.6' }
      ];
      let lgRowY = lgY + 8;
      for (const band of legendBands) {
        const rgb = hexToRgb(band.color);
        pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
        pdf.rect(lgX + 3, lgRowY, 4, 3, 'F');
        pdf.setFontSize(5.5);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(55, 65, 81);
        pdf.text(band.label, lgX + 9, lgRowY + 2.5);
        pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
        pdf.text(band.range, lgX + lgW - 3, lgRowY + 2.5, { align: 'right' });
        lgRowY += 3.2;
      }

      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.line(panelX, mapFrameY, panelX, mapFrameY + panelH);

      let py = mapFrameY + 4;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(30, 41, 59);
      pdf.text('HASIL ANALISIS NDVI', panelX + 4, py);
      py += 6;

      const cardW = panelW - 8;
      const cardH = 18;
      pdf.setFillColor(240, 253, 244);
      pdf.setDrawColor(220, 252, 231);
      pdf.roundedRect(panelX + 4, py, cardW, cardH, 2, 2, 'FD');
      pdf.setFontSize(6);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 116, 139);
      pdf.text('NDVI Rata-rata', panelX + 8, py + 5);
      pdf.text('Kondisi Vegetasi', panelX + 8, py + 11);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(30, 41, 59);
      pdf.text(mean.toFixed(3), panelX + 40, py + 5);
      const catRgb = hexToRgb(category.color);
      pdf.setTextColor(catRgb[0], catRgb[1], catRgb[2]);
      pdf.text(category.label, panelX + 40, py + 11);
      py += cardH + 5;

      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(55, 65, 81);
      pdf.text('Insight', panelX + 4, py);
      py += 4;
      pdf.setFontSize(6.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(71, 85, 105);
      const bands = [
        { label: 'Sangat rendah', min: -Infinity, max: 0, color: '#397ca8' },
        { label: 'Rendah', min: 0, max: 0.2, color: '#c6872a' },
        { label: 'Sedang', min: 0.2, max: 0.4, color: '#d7be37' },
        { label: 'Tinggi', min: 0.4, max: 0.6, color: '#65a942' },
        { label: 'Sangat tinggi', min: 0.6, max: Infinity, color: '#176b34' }
      ];
      const dominantBand = bands.map(b => ({ ...b, count: samples.filter(s => s.ndvi >= b.min && s.ndvi < b.max).length })).sort((a, b) => b.count - a.count)[0];
      const insightText = mean >= 0.4
        ? `Vegetasi didominasi kondisi ${dominantBand.label.toLowerCase()}; tutupan tanaman relatif sehat.`
        : mean >= 0.2
          ? `Vegetasi berada pada kondisi sedang; area dengan nilai rendah perlu dipantau.`
          : `Nilai NDVI cenderung rendah; cek kemungkinan lahan terbuka, badan air, atau tanaman stres.`;
      const splitInsight = pdf.splitTextToSize(insightText, cardW);
      pdf.text(splitInsight, panelX + 4, py);
      py += splitInsight.length * 3.2 + 5;

      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(55, 65, 81);
      pdf.text('Distribusi NDVI', panelX + 4, py);
      py += 4;

      const barLabelW = 26;
      const barPercentW = 10;
      const barMaxW = cardW - barLabelW - barPercentW - 4;
      for (const band of bands) {
        const count = samples.filter(s => s.ndvi >= band.min && s.ndvi < band.max).length;
        const pct = (count / totalSamples) * 100;
        const barW = (pct / 100) * barMaxW;
        const rgb = hexToRgb(band.color);

        pdf.setFontSize(5.5);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 116, 139);
        pdf.text(band.label, panelX + 4, py + 2.5);

        const barX = panelX + 4 + barLabelW;
        pdf.setFillColor(241, 245, 249);
        pdf.roundedRect(barX, py, barMaxW, 3.5, 1, 1, 'F');
        pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
        if (barW > 0) pdf.roundedRect(barX, py, Math.max(barW, 1.5), 3.5, 1, 1, 'F');

        pdf.setFontSize(5.5);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
        pdf.text(pct.toFixed(0) + '%', barX + barMaxW + 2, py + 2.5);
        py += 5;
      }
      py += 3;

      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(55, 65, 81);
      pdf.text('Statistik', panelX + 4, py);
      py += 4;

      const statColW = (cardW - 4) / 2;
      const statItems = [
        ['Minimum', Number(stats.min).toFixed(2)],
        ['Maksimum', Number(stats.max).toFixed(2)],
        ['Rata-rata', mean.toFixed(3)],
        ['Median', Number(stats.median).toFixed(2)]
      ];
      for (let i = 0; i < statItems.length; i += 2) {
        const col = i % 2;
        const sx = panelX + 4 + col * statColW;
        pdf.setFontSize(5.5);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 116, 139);
        pdf.text(statItems[i][0], sx, py);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(22, 101, 52);
        pdf.text(statItems[i][1], sx + 16, py);
        if (statItems[i + 1]) {
          pdf.setFont('helvetica', 'normal');
          pdf.setTextColor(100, 116, 139);
          pdf.text(statItems[i + 1][0], sx + statColW, py);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(22, 101, 52);
          pdf.text(statItems[i + 1][1], sx + statColW + 16, py);
        }
        py += 4;
      }
      py += 3;

      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(55, 65, 81);
      pdf.text('Kualitas & Citra', panelX + 4, py);
      py += 4;

      const qualityLabel = !Number.isFinite(cloudPercent) ? 'Metadata awan tidak tersedia'
        : cloudPercent <= 10 ? 'Baik'
          : cloudPercent <= 30 ? 'Cukup'
            : 'Terbatas';
      const infoLines = [
        ['Tanggal', imageDate],
        ['Resolusi', '10 m'],
        ['Cloud cover', Number.isFinite(cloudPercent) ? cloudPercent.toFixed(1) + '%' : '-'],
        ['Sampel', `${samples.length} zona · ${Number(stats.count || 0).toLocaleString('id-ID')} piksel`],
        ['Luas', analysisAreaHa ? analysisAreaHa.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' ha' : '-'],
        ['Kualitas', qualityLabel]
      ];
      for (const [label, value] of infoLines) {
        pdf.setFontSize(5.5);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(100, 116, 139);
        pdf.text(label, panelX + 4, py);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(55, 65, 81);
        pdf.text(value, panelX + 28, py);
        py += 3.5;
      }

      const bottomY = pageH - margin - 2;
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.line(margin, bottomY - bottomStripH + 2, pageW - margin, bottomY - bottomStripH + 2);

      pdf.setFontSize(6);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(120, 120, 120);
      pdf.text('Sumber data: Sentinel-2 (ESA Copernicus) · Dibuat oleh RuangKita Pro', margin + 2, bottomY - 4);
      pdf.text(`Cetak: ${dateFormatted}`, pageW - margin - 2, bottomY - 4, { align: 'right' });

      pdf.setFontSize(5);
      pdf.setTextColor(160, 160, 160);
      pdf.text('Koordinat: WGS84 / EPSG:4326 · Grid graticule untuk referensi ArcGIS / QGIS', margin + 2, bottomY);
      pdf.text(`Skala: 1:${Math.round(metersPerPixel * mapFrameH / mapFrameH * 100).toLocaleString('id-ID')}`, pageW - margin - 2, bottomY, { align: 'right' });

      pdf.save(fileName);
    } catch (error) {
      console.error('[NDVI] Gagal membuat PDF:', error);
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

  window.fetchNdviStatistics = fetchNdviStatistics;
  window._sentinelToWebMercator = toWebMercator;
})();
