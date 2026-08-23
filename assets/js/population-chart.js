(function () {
  'use strict';

  const DIS_UMUR_URL = 'assets/data/bps/dis-umur.json';
  const GEN_URL = 'assets/data/bps/gen.json';
  const RANK_URL = 'assets/data/bps/rank.json';
  const LAJU_URL = 'assets/data/bps/indikator/1.json';
  const INDICATOR_BASE = 'assets/data/bps/indikator/';

  const AGE_LABELS = ['0-4','5-9','10-14','15-19','20-24','25-29','30-34','35-39','40-44','45-49','50-54','55-59','60-64','65-69','70-74','75+'];

  const INDICATORS = [
    { id: '1',  label: 'Laju Pertumbuhan Penduduk',            group: 'Struktur Penduduk' },
    { id: '2',  label: 'Rasio Jenis Kelamin',                   group: 'Struktur Penduduk' },
    { id: '3',  label: 'Rasio Ketergantungan',                  group: 'Struktur Penduduk' },
    { id: '4',  label: 'Angka Kelahiran Total (TFR)',           group: 'Fertilitas' },
    { id: '5',  label: 'Angka Prevalensi Kontrasepsi (CPR)',    group: 'Fertilitas' },
    { id: '6',  label: 'Angka Kematian Bayi (IMR)',             group: 'Mortalitas' },
    { id: '7',  label: 'Angka Kematian Anak (CMR)',             group: 'Mortalitas' },
    { id: '8',  label: 'Angka Kematian Balita (U5MR)',          group: 'Mortalitas' },
    { id: '9',  label: 'Angka Kematian Ibu (MMR)',              group: 'Mortalitas' },
    { id: '10', label: 'Migrasi Seumur Hidup',                  group: 'Mobilitas' },
    { id: '11', label: 'Migrasi Risen',                         group: 'Mobilitas' },
    { id: '12', label: 'Komuter Wilayah Metropolitan',          group: 'Mobilitas' },
    { id: '13', label: 'Berbahasa Indonesia (5+)',              group: 'Lainnya' },
    { id: '14', label: 'Berbahasa Daerah (5+)',                 group: 'Lainnya' },
    { id: '15', label: 'Berbahasa Asing (5+)',                  group: 'Lainnya' },
    { id: '16', label: 'Persentase Lansia',                     group: 'Lainnya' },
    { id: '17', label: 'Prevalensi Disabilitas (5+)',           group: 'Lainnya' },
  ];

  const kelompokOrder = ['Struktur Penduduk','Fertilitas','Mortalitas','Mobilitas','Lainnya'];

  let cachedDisUmur = null;
  let cachedGen = null;
  let cachedRank = null;
  let cachedLaju = null;
  const cachedIndicators = {};

  async function fetchJSON(url) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return await resp.json();
    } catch (e) {
      console.error('[PopulationChart] Gagal fetch:', url, e);
      return null;
    }
  }

  async function loadDisUmur() {
    if (cachedDisUmur) return cachedDisUmur;
    const json = await fetchJSON(DIS_UMUR_URL);
    cachedDisUmur = json?.data || null;
    return cachedDisUmur;
  }

  async function loadGen() {
    if (cachedGen) return cachedGen;
    const json = await fetchJSON(GEN_URL);
    cachedGen = json?.data || null;
    return cachedGen;
  }

  async function loadRank() {
    if (cachedRank) return cachedRank;
    const json = await fetchJSON(RANK_URL);
    cachedRank = json?.data || null;
    return cachedRank;
  }

  async function loadLaju() {
    if (cachedLaju) return cachedLaju;
    const json = await fetchJSON(LAJU_URL);
    cachedLaju = json?.data || null;
    return cachedLaju;
  }

  async function loadIndicator(id) {
    if (cachedIndicators[id]) return cachedIndicators[id];
    const json = await fetchJSON(INDICATOR_BASE + id + '.json');
    cachedIndicators[id] = json || null;
    return cachedIndicators[id];
  }

  function getTotalPopulation(rankData) {
    if (!rankData?.features) return null;
    const indo = rankData.features.find(f => f.properties.nama_wilayah === 'INDONESIA');
    if (!indo) return null;
    const all = rankData.features.filter(f => f.properties.nama_wilayah === 'INDONESIA');
    let max = 0;
    for (let i = 0; i < all.length; i++) {
      const v = all[i].properties.nilai || 0;
      if (v > max) max = v;
    }
    return max || indo.properties.nilai || null;
  }

  function getIndicatorNational(jsonData) {
    if (!jsonData?.data?.features) return null;
    const f = jsonData.data.features.find(x => x.properties.nama_wilayah === 'INDONESIA');
    return f?.properties?.nilai ?? null;
  }

  function formatIndoNumber(num) {
    if (num === null || num === undefined) return '-';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function extractAgeData(dimensiData, provinceIndex) {
    const male = [];
    const female = [];
    for (let i = 0; i < 32; i += 2) {
      const maleVal = dimensiData[i]?.features[provinceIndex]?.properties?.nilai || 0;
      const femaleVal = dimensiData[i + 1]?.features[provinceIndex]?.properties?.nilai || 0;
      male.push(maleVal);
      female.push(femaleVal);
    }
    return { male, female };
  }

  function extractGenerationData(genData) {
    if (!genData) return [];
    const genMap = [
      { label: 'Post Gen Z', color: '#6366f1' },
      { label: 'Gen Z', color: '#8b5cf6' },
      { label: 'Milenial', color: '#06b6d4' },
      { label: 'Gen X', color: '#f59e0b' },
      { label: 'Baby Boomer', color: '#ef4444' },
      { label: 'Pre-Boomer', color: '#64748b' }
    ];
    const nilaiNasional = genData?.nilai_nasional_kategori || {};
    return genMap.map((g, i) => ({ ...g, pct: nilaiNasional[String(i + 33)] || 0 }));
  }

  function getProvincesRanking(rankData) {
    if (!rankData?.features) return [];
    const seen = new Set();
    return rankData.features
      .filter(f => {
        if (f.properties.nama_wilayah === 'INDONESIA') return false;
        if (seen.has(f.properties.nama_wilayah)) return false;
        seen.add(f.properties.nama_wilayah);
        return true;
      })
      .map(f => ({
        name: f.properties.nama_wilayah || '-',
        code: f.properties.id_wilayah || '-',
        population: f.properties.nilai || 0
      }))
      .sort((a, b) => b.population - a.population);
  }

  function getProvincesLaju(lajuData) {
    if (!lajuData?.features) return [];
    return lajuData.features
      .filter(f => f.properties.nama_wilayah !== 'INDONESIA')
      .map(f => ({
        name: f.properties.nama_wilayah || '-',
        code: f.properties.id_wilayah || '-',
        laju: f.properties.nilai || 0
      }))
      .sort((a, b) => b.laju - a.laju);
  }

  function formatNumber(num) {
    if (num >= 1000000000) return (num / 1000000000).toFixed(1) + ' Milyar';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + ' Juta';
    if (num >= 1000) return (num / 1000).toFixed(1) + ' Ribu';
    return num.toFixed ? num.toFixed(1) : String(num);
  }

  function formatValue(val, satuan) {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'number') {
      if (satuan && satuan.includes('%')) return val.toFixed(2) + '%';
      if (satuan && satuan.includes('per')) return val.toFixed(1);
      if (satuan && satuan.includes('anak')) return val.toFixed(2);
      return val.toFixed(2);
    }
    return String(val);
  }

  /* ── Pyramid Chart ── */
  function createPyramidChart(container, maleData, femaleData) {
    const maxVal = Math.max(...maleData, ...femaleData, 0.1);
    let html = `<div style="position:relative;width:100%;overflow-x:auto;">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;padding:0 2px;">
        <span style="font-size:9px;color:#64748b;font-weight:600;width:45%;text-align:right;">&#9794; Laki-laki</span>
        <span style="font-size:9px;color:#64748b;font-weight:600;width:45%;text-align:left;">Perempuan &#9792;</span>
      </div>`;
    html += `<div style="display:flex;width:100%;">`;
    html += `<div style="flex:1;display:flex;flex-direction:column;justify-content:space-around;">`;
    for (let i = AGE_LABELS.length - 1; i >= 0; i--) {
      const pct = maleData[i];
      const w = maxVal > 0 ? (pct / maxVal) * 100 : 0;
      html += `<div style="display:flex;align-items:center;justify-content:flex-end;height:16px;">
        <div style="flex:1;display:flex;justify-content:flex-end;padding-right:4px;">
          <div style="width:${w}%;height:10px;background:linear-gradient(90deg,#3b82f6,#60a5fa);border-radius:2px 0 0 2px;"></div>
        </div>
        <span style="font-size:7px;color:#64748b;width:20px;text-align:right;">${pct.toFixed(1)}%</span>
      </div>`;
    }
    html += `</div>`;
    html += `<div style="width:35px;display:flex;flex-direction:column;justify-content:space-around;align-items:center;">`;
    for (let i = AGE_LABELS.length - 1; i >= 0; i--) {
      html += `<div style="height:16px;display:flex;align-items:center;">
        <span style="font-size:7px;color:#475569;font-weight:500;">${AGE_LABELS[i]}</span>
      </div>`;
    }
    html += `</div>`;
    html += `<div style="flex:1;display:flex;flex-direction:column;justify-content:space-around;">`;
    for (let i = AGE_LABELS.length - 1; i >= 0; i--) {
      const pct = femaleData[i];
      const w = maxVal > 0 ? (pct / maxVal) * 100 : 0;
      html += `<div style="display:flex;align-items:center;height:16px;">
        <span style="font-size:7px;color:#64748b;width:20px;text-align:left;">${pct.toFixed(1)}%</span>
        <div style="flex:1;padding-left:4px;">
          <div style="width:${w}%;height:10px;background:linear-gradient(90deg,#f472b6,#fb7185);border-radius:0 2px 2px 0;"></div>
        </div>
      </div>`;
    }
    html += `</div></div></div>`;
    container.innerHTML = html;
  }

  /* ── Generation Chart ── */
  function createGenerationChart(container, generasi) {
    let html = '<div style="display:flex;flex-direction:column;gap:5px;">';
    for (const g of generasi) {
      html += `<div style="display:flex;align-items:center;gap:6px;">
        <div style="width:8px;height:8px;border-radius:2px;background:${g.color};flex-shrink:0;"></div>
        <span style="font-size:8px;color:#475569;min-width:60px;">${g.label}</span>
        <div style="flex:1;height:12px;background:#f1f5f9;border-radius:3px;overflow:hidden;">
          <div style="width:${g.pct}%;height:100%;background:${g.color};border-radius:3px;"></div>
        </div>
        <span style="font-size:8px;color:#475569;font-weight:600;min-width:30px;text-align:right;">${g.pct}%</span>
      </div>`;
    }
    html += '</div>';
    container.innerHTML = html;
  }

  /* ── Ranking Table (populasi / laju) ── */
  function createRankingTable(container, provinces, type) {
    const isLaju = type === 'laju';
    const tblWrap = 'border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#fff;';
    const thStyle = 'text-align:left;padding:8px 10px;font-size:8px;font-weight:700;color:#374151;background:#f8fafc;border-bottom:2px solid #e5e7eb;white-space:nowrap;';
    const tdStyle = 'padding:6px 10px;font-size:8px;color:#374151;border-bottom:1px solid #f0f0f0;';
    const tdStyleR = 'padding:6px 10px;font-size:8px;font-weight:600;color:#0891b2;text-align:right;border-bottom:1px solid #f0f0f0;';

    let html = `<div style="${tblWrap}max-height:50vh;overflow-y:auto;">`;
    html += '<table style="width:100%;border-collapse:collapse;">';
    html += '<thead><tr>';
    html += `<th style="${thStyle}width:30px;">No.</th>`;
    html += `<th style="${thStyle}">Kode</th>`;
    html += `<th style="${thStyle}">Provinsi</th>`;
    html += `<th style="${thStyle}text-align:right;">${isLaju ? 'Laju (%)' : 'Populasi'}</th>`;
    html += '</tr></thead><tbody>';
    provinces.forEach((p, i) => {
      const rank = i + 1;
      const bg = rank % 2 === 0 ? '#f9fafb' : '#ffffff';
      const val = isLaju ? p.laju.toFixed(2) + '%' : formatNumber(p.population);
      html += `<tr style="background:${bg};transition:background .15s;" onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='${bg}'">`;
      html += `<td style="${tdStyle}color:#9ca3af;text-align:center;">${rank}</td>`;
      html += `<td style="${tdStyle}font-weight:600;">${p.code}</td>`;
      html += `<td style="${tdStyle}">${p.name}</td>`;
      html += `<td style="${tdStyleR}">${val}</td>`;
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  /* ── Bar Chart (horizontal, for province-level data) ── */
  function createBarChart(container, items, satuan, color) {
    if (!items.length) { container.innerHTML = '<div style="font-size:8px;color:#94a3b8;">Tidak ada data</div>'; return; }
    const maxVal = Math.max(...items.map(d => d.nilai), 0.1);
    const barH = 12;
    const maxBars = Math.min(items.length, 20);
    const chartH = maxBars * (barH + 3);
    color = color || '#0891b2';

    let html = `<div style="max-height:50vh;overflow-y:auto;">`;
    html += `<div style="display:flex;flex-direction:column;gap:3px;">`;
    for (let i = 0; i < maxBars; i++) {
      const d = items[i];
      const w = maxVal > 0 ? (d.nilai / maxVal) * 100 : 0;
      html += `<div style="display:flex;align-items:center;gap:4px;">
        <span style="font-size:7px;color:#475569;min-width:90px;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${d.nama}">${d.nama}</span>
        <div style="flex:1;height:${barH}px;background:#f1f5f9;border-radius:3px;overflow:hidden;">
          <div style="width:${w}%;height:100%;background:${color};border-radius:3px;"></div>
        </div>
        <span style="font-size:7px;color:#334155;font-weight:600;min-width:40px;text-align:right;">${formatValue(d.nilai, satuan)}</span>
      </div>`;
    }
    html += `</div></div>`;
    container.innerHTML = html;
  }

  /* ── Generic Table (paginated + search) ── */
  function createGenericTable(container, features, satuan, perPage) {
    if (!features.length) { container.innerHTML = '<div style="font-size:8px;color:#94a3b8;">Tidak ada data</div>'; return; }
    perPage = perPage || 80;
    const sorted = [...features].sort((a, b) => (b.properties.nilai || 0) - (a.properties.nilai || 0));
    let filtered = sorted;
    let currentPage = 1;
    let searchTerm = '';
    const totalPages = () => Math.ceil(filtered.length / perPage);

    function render() {
      const tp = totalPages();
      if (currentPage > tp) currentPage = tp || 1;
      const start = (currentPage - 1) * perPage;
      const page = filtered.slice(start, start + perPage);

      const tblWrap = 'border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#fff;';
      const thStyle = 'text-align:left;padding:8px 10px;font-size:8px;font-weight:700;color:#374151;background:#f8fafc;border-bottom:2px solid #e5e7eb;white-space:nowrap;';
      const tdStyle = 'padding:6px 10px;font-size:8px;color:#374151;border-bottom:1px solid #f0f0f0;';
      const tdStyleR = 'padding:6px 10px;font-size:8px;font-weight:600;color:#0891b2;text-align:right;border-bottom:1px solid #f0f0f0;';

      let html = '';

      /* ── Search ── */
      html += `<div style="margin-bottom:6px;display:flex;align-items:center;gap:6px;">`;
      html += `<div style="flex:1;position:relative;">`;
      html += `<input type="text" id="tbl-search" placeholder="Cari wilayah..." value="${searchTerm}" style="width:100%;padding:5px 8px 5px 24px;font-size:8px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#334155;outline:none;box-sizing:border-box;" />`;
      html += `<svg style="position:absolute;left:7px;top:50%;transform:translateY(-50%);pointer-events:none;" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>`;
      html += `</div>`;
      html += `<span style="font-size:7px;color:#94a3b8;white-space:nowrap;">${filtered.length} data</span>`;
      html += `</div>`;

      /* ── Table ── */
      html += `<div style="${tblWrap}">`;
      html += '<table style="width:100%;border-collapse:collapse;">';
      html += '<thead><tr>';
      html += `<th style="${thStyle}width:30px;">No.</th>`;
      html += `<th style="${thStyle}">Kode</th>`;
      html += `<th style="${thStyle}">Wilayah</th>`;
      html += `<th style="${thStyle}text-align:right;">Nilai</th>`;
      html += '</tr></thead><tbody>';

      if (page.length === 0) {
        html += `<tr><td colspan="4" style="${tdStyle}text-align:center;color:#9ca3af;">Tidak ditemukan</td></tr>`;
      }
      page.forEach((f, i) => {
        const p = f.properties;
        const rank = start + i + 1;
        const bg = rank % 2 === 0 ? '#f9fafb' : '#ffffff';
        html += `<tr style="background:${bg};transition:background .15s;" onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='${bg}'">`;
        html += `<td style="${tdStyle}color:#9ca3af;text-align:center;">${rank}</td>`;
        html += `<td style="${tdStyle}font-weight:600;">${p.id_wilayah || '-'}</td>`;
        html += `<td style="${tdStyle}">${p.nama_wilayah || '-'}</td>`;
        html += `<td style="${tdStyleR}">${formatValue(p.nilai, satuan)}</td>`;
        html += '</tr>';
      });
      html += '</tbody></table></div>';

      /* ── Pagination ── */
      if (tp > 1) {
        const btnBase = 'display:inline-flex;align-items:center;justify-content:center;height:22px;min-width:22px;border:1px solid #d1d5db;border-radius:4px;background:#fff;color:#374151;font-size:8px;cursor:pointer;transition:all .15s;';
        const btnActive = 'background:#0891b2;color:#fff;border-color:#0891b2;font-weight:700;';
        const btnDisabled = 'opacity:0.35;cursor:default;pointer-events:none;';

        html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;flex-wrap:wrap;gap:4px;">`;
        html += `<span style="font-size:7px;color:#94a3b8;">${filtered.length === 0 ? 0 : start + 1}–${Math.min(start + perPage, filtered.length)} dari ${filtered.length}</span>`;
        html += `<div style="display:flex;align-items:center;gap:3px;">`;

        html += `<button data-page="prev" style="${btnBase}${currentPage === 1 ? btnDisabled : ''}">&#9664;</button>`;

        const maxBtn = 5;
        let sp = Math.max(1, currentPage - Math.floor(maxBtn / 2));
        let ep = Math.min(tp, sp + maxBtn - 1);
        if (ep - sp < maxBtn - 1) sp = Math.max(1, ep - maxBtn + 1);

        if (sp > 1) {
          html += `<button data-page="1" style="${btnBase}">1</button>`;
          if (sp > 2) html += `<span style="font-size:7px;color:#94a3b8;">...</span>`;
        }
        for (let p = sp; p <= ep; p++) {
          const active = p === currentPage ? btnActive : '';
          html += `<button data-page="${p}" style="${btnBase}${active}">${p}</button>`;
        }
        if (ep < tp) {
          if (ep < tp - 1) html += `<span style="font-size:7px;color:#94a3b8;">...</span>`;
          html += `<button data-page="${tp}" style="${btnBase}">${tp}</button>`;
        }

        html += `<button data-page="next" style="${btnBase}${currentPage === tp ? btnDisabled : ''}">&#9654;</button>`;
        html += `</div></div>`;
      }

      container.innerHTML = html;

      /* ── Search handler ── */
      const searchInput = container.querySelector('#tbl-search');
      if (searchInput) {
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
        searchInput.addEventListener('input', function () {
          searchTerm = this.value.toLowerCase().trim();
          filtered = searchTerm
            ? sorted.filter(f => (f.properties.nama_wilayah || '').toLowerCase().includes(searchTerm))
            : sorted;
          currentPage = 1;
          render();
        });
      }

      /* ── Pagination handlers ── */
      container.querySelectorAll('button[data-page]').forEach(btn => {
        btn.addEventListener('click', function () {
          const val = this.getAttribute('data-page');
          if (val === 'prev' && currentPage > 1) currentPage--;
          else if (val === 'next' && currentPage < tp) currentPage++;
          else if (val !== 'prev' && val !== 'next') currentPage = parseInt(val);
          render();
        });
      });
    }

    render();
  }

  /* ── Indicator Dropdown (all 18 indicators) ── */
  function renderIndicatorDropdown(container, onChange) {
    let html = `<select id="indicator-select" style="width:100%;padding:11px 12px;font-size:12px;font-weight:600;border:2px solid #0ea5e9;border-radius:8px;background:#f0f9ff;color:#0c4a6e;margin-bottom:10px;cursor:pointer;box-shadow:0 1px 3px rgba(14,165,233,0.18);">`;
    html += `<option value="jumlah">Jumlah Penduduk</option>`;
    html += `<option value="laju">Laju Pertumbuhan</option>`;
    for (const k of kelompokOrder) {
      const groupItems = INDICATORS.filter(i => i.group === k);
      if (!groupItems.length) continue;
      html += `<optgroup label="${k}">`;
      for (const ind of groupItems) {
        html += `<option value="${ind.id}">${ind.label}</option>`;
      }
      html += `</optgroup>`;
    }
    html += '</select>';
    container.innerHTML = html;
    document.getElementById('indicator-select').addEventListener('change', onChange);
  }

  /* ── Load & Render Indicator Data ── */
  async function loadAndRenderIndicator(indicatorId, chartContainer, rankingContainer, titleEl) {
    rankingContainer.innerHTML = '';

    const json = await loadIndicator(indicatorId);
    if (!json?.data) {
      rankingContainer.innerHTML = '<div style="font-size:8px;color:#ef4444;">Gagal memuat data</div>';
      return;
    }

    const data = json.data;
    const indMeta = data.indikator || {};
    const satuan = indMeta.level_wilayah?.[0]?.pivot_satuan || '';
    const features = data.features || [];
    const title = indMeta.level_wilayah?.[0]?.pivot_judul || indMeta.nama_indikator || '';

    if (titleEl) titleEl.textContent = title;

    if (!features.length) {
      rankingContainer.innerHTML = '<div style="font-size:8px;color:#94a3b8;">Tidak ada data</div>';
      return;
    }

    /* ── Determine display mode based on feature count ── */
    const uniqueProvinces = new Map();
    features.forEach(f => {
      const name = f.properties.nama_wilayah;
      if (!uniqueProvinces.has(name)) uniqueProvinces.set(name, f);
    });

    if (features.length <= 40) {
      /* Province level — bar chart + table */
      const items = features.map(f => ({
        nama: f.properties.nama_wilayah || '-',
        nilai: f.properties.nilai || 0
      })).sort((a, b) => b.nilai - a.nilai);

      const barDiv = document.createElement('div');
      barDiv.style.marginBottom = '8px';
      chartContainer.appendChild(barDiv);
      createBarChart(barDiv, items, satuan, '#0891b2');

      const tblDiv = document.createElement('div');
      rankingContainer.appendChild(tblDiv);
      createGenericTable(tblDiv, features, satuan, 80);
    } else if (features.length <= 100) {
      /* Kab/Kota level — table only */
      const tblDiv = document.createElement('div');
      rankingContainer.appendChild(tblDiv);
      createGenericTable(tblDiv, features, satuan, 80);
    } else if (uniqueProvinces.size <= 40 && features.length > 100) {
      /* Flow / multi-record — deduplicate to provinces */
      const deduped = [...uniqueProvinces.values()];
      const items = deduped.map(f => ({
        nama: f.properties.nama_wilayah || '-',
        nilai: f.properties.nilai || 0
      })).sort((a, b) => b.nilai - a.nilai);

      const barDiv = document.createElement('div');
      barDiv.style.marginBottom = '8px';
      chartContainer.appendChild(barDiv);
      createBarChart(barDiv, items, satuan, '#8b5cf6');

      const tblDiv = document.createElement('div');
      rankingContainer.appendChild(tblDiv);
      createGenericTable(tblDiv, deduped, satuan, 80);
    } else {
      /* Large kab/kota dataset — table only, limit rows */
      const tblDiv = document.createElement('div');
      rankingContainer.appendChild(tblDiv);
      createGenericTable(tblDiv, features, satuan, 80);
    }
  }

  /* ── Main Render ── */
  async function renderPopulationChart() {
    const statsCard = document.getElementById('geoidStatsCard');
    const indicatorCard = document.getElementById('geoidIndicatorCard');
    if (!statsCard || !indicatorCard) return;

    statsCard.innerHTML = '<div style="text-align:center;padding:15px;color:#94a3b8;font-size:10px;">Memuat data kependudukan...</div>';
    indicatorCard.innerHTML = '<div style="text-align:center;padding:15px;color:#94a3b8;font-size:10px;">Memuat data kependudukan...</div>';

    const [disUmur, genData, rankJson, lajuJson, tfrJson, imrJson, rjkJson, rkJson, lansiaJson] = await Promise.all([
      loadDisUmur(), loadGen(), loadRank(), loadLaju(),
      loadIndicator('4'), loadIndicator('6'), loadIndicator('2'), loadIndicator('3'), loadIndicator('16')
    ]);

    if (!disUmur || !disUmur.dimensi_data) {
      statsCard.innerHTML = '<div style="text-align:center;padding:15px;color:#ef4444;font-size:10px;">Gagal memuat data kependudukan</div>';
      indicatorCard.innerHTML = '';
      return;
    }

    const { male, female } = extractAgeData(disUmur.dimensi_data, 0);
    const generasi = extractGenerationData(genData);
    const provincesRank = getProvincesRanking(rankJson?.data || rankJson);
    const provincesLaju = getProvincesLaju(lajuJson?.data || lajuJson);
    const totalPop = getTotalPopulation(rankJson?.data || rankJson);

    const summaryCards = [
      { label: 'Angka Kelahiran Total', value: getIndicatorNational(tfrJson), unit: 'anak/perempuan', color: '#0891b2' },
      { label: 'Angka Kematian Bayi', value: getIndicatorNational(imrJson), unit: '/1.000', color: '#dc2626' },
      { label: 'Rasio Jenis Kelamin', value: getIndicatorNational(rjkJson), unit: 'laki/100 perempuan', color: '#7c3aed' },
      { label: 'Rasio Ketergantungan', value: getIndicatorNational(rkJson), unit: '/100 produktif', color: '#ea580c' },
      { label: 'Persentase Lansia', value: getIndicatorNational(lansiaJson), unit: '%', color: '#059669' },
    ];

    function buildStatsHTML() {
      const summaryHTML = summaryCards.map(c => {
        const val = c.value !== null ? c.value : '-';
        return `<div style="flex:1;min-width:80px;border:1px solid #e5e7eb;border-radius:6px;padding:8px 6px;text-align:center;background:#fff;">
          <div style="font-size:7px;color:#64748b;font-weight:500;margin-bottom:3px;line-height:1.2;">${c.label}</div>
          <div style="font-size:14px;font-weight:800;color:${c.color};line-height:1;">${val}</div>
          <div style="font-size:6px;color:#94a3b8;margin-top:2px;">${c.unit}</div>
        </div>`;
      }).join('');

      return `<div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #e2e8f0;">
          <span style="font-size:13px;font-weight:700;color:#1e293b;">Kependudukan Indonesia</span>
          <span style="font-size:7px;color:#94a3b8;">BPS SUPAS 2025</span>
        </div>

        <div style="margin-bottom:10px;border:1px solid #e5e7eb;border-radius:8px;background:linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 50%,#dbeafe 100%);padding:14px 12px;text-align:center;">
          <div style="font-size:8px;color:#64748b;font-weight:500;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Total Penduduk Indonesia</div>
          <div style="font-size:20px;font-weight:800;color:#0c4a6e;line-height:1;">${totalPop ? formatIndoNumber(totalPop) : '-'}</div>
          <div style="font-size:7px;color:#94a3b8;margin-top:4px;">jiwa &middot; SUPAS 2025</div>
        </div>

        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">${summaryHTML}</div>

        <div style="margin-bottom:10px;">
          <div style="font-size:11px;font-weight:700;color:#1e293b;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">Piramida Penduduk</div>
          <div id="pyramid-chart"></div>
        </div>

        <div style="margin-bottom:10px;">
          <div style="font-size:11px;font-weight:700;color:#1e293b;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">Persentase Menurut Generasi</div>
          <div id="generation-chart"></div>
        </div>
      </div>`;
    }

    function buildIndicatorHTML() {
      return `<div style="margin-bottom:12px;">
          <div style="font-size:11px;font-weight:700;color:#0c4a6e;margin-bottom:8px;">Pilih Indikator Penduduk</div>
          <div id="indicator-dropdown"></div>
        </div>

        <div id="indicator-chart"></div>

        <div id="indicator-table-container">
          <div style="font-size:11px;font-weight:700;color:#1e293b;margin-bottom:6px;" id="indicator-table-title">Peringkat Provinsi (Jumlah Penduduk)</div>
          <div id="ranking-table"></div>
        </div>`;
    }

    statsCard.innerHTML = buildStatsHTML();
    indicatorCard.innerHTML = buildIndicatorHTML();

    renderIndicatorDropdown(document.getElementById('indicator-dropdown'), async function (e) {
      const val = e.target.value;
      const chartArea = document.getElementById('indicator-chart');
      const tableContainer = document.getElementById('indicator-table-container');
      const titleEl = document.getElementById('indicator-table-title');
      const rankingEl = document.getElementById('ranking-table');

      if (val === 'jumlah') {
        chartArea.innerHTML = '';
        titleEl.textContent = 'Peringkat Provinsi (Jumlah Penduduk)';
        const freshRank = await loadRank();
        const freshRankData = freshRank?.data || freshRank;
        const freshProvincesRank = getProvincesRanking(freshRankData);
        createRankingTable(rankingEl, freshProvincesRank, 'jumlah');
        if (typeof showChoropleth === 'function') showChoropleth('jumlah', freshRank);
      } else if (val === 'laju') {
        chartArea.innerHTML = '';
        titleEl.textContent = 'Peringkat Provinsi (Laju Pertumbuhan)';
        const freshLaju = await loadLaju();
        const freshLajuData = freshLaju?.data || freshLaju;
        const freshProvincesLaju = getProvincesLaju(freshLajuData);
        createRankingTable(rankingEl, freshProvincesLaju, 'laju');
        if (typeof showChoropleth === 'function') showChoropleth('laju', freshLaju);
      } else {
        chartArea.innerHTML = '';
        titleEl.textContent = 'Memuat...';
        rankingEl.innerHTML = '';
        if (typeof showChoropleth === 'function') showChoropleth(val);
        await loadAndRenderIndicator(val, chartArea, rankingEl, titleEl);
      }
    });

    createPyramidChart(document.getElementById('pyramid-chart'), male, female);
    createGenerationChart(document.getElementById('generation-chart'), generasi);
    createRankingTable(document.getElementById('ranking-table'), provincesRank, 'jumlah');

  }

  window.renderPopulationChart = renderPopulationChart;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(renderPopulationChart, 2000);
    });
  } else {
    setTimeout(renderPopulationChart, 2000);
  }
})();
