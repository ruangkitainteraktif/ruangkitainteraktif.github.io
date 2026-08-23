// Data penduduk Dukcapil lokal. Setiap berkas provinsi berisi rekaman desa/kelurahan.
(function () {
  const cache = new Map();
  const fmt = value => Number(value || 0).toLocaleString('id-ID');

  function getKode(value) {
    return String(value || '').replace(/\D/g, '');
  }

  async function getProvinceRows(kode) {
    const province = getKode(kode).slice(0, 2);
    if (!province) return [];
    if (!cache.has(province)) {
      cache.set(province, fetch(`assets/data/dukcapil/${province}.json`)
        .then(response => response.ok ? response.json() : [])
        .catch(() => []));
    }
    return cache.get(province);
  }

  async function getDukcapilPopulation(kode) {
    const normalizedKode = getKode(kode);
    if (!normalizedKode) return null;
    const rows = await getProvinceRows(normalizedKode);
    const matched = rows.filter(row => String(row.k || '').startsWith(normalizedKode));
    if (!matched.length) return null;

    const totals = matched.reduce((sum, row) => {
      Object.entries(row).forEach(([key, value]) => {
        if (key !== 'k' && typeof value === 'number') sum[key] = (sum[key] || 0) + value;
      });
      return sum;
    }, {});
    return { ...totals, records: matched.length, source: 'DKB Tahun 2024 Semester 1' };
  }

  function renderDetail(data, kode) {
    const panelBody = document.querySelector('#detail-panel .panel-body');
    if (!panelBody) return;
    let section = document.getElementById('dukcapilPopulationDetail');
    if (!section) {
      section = document.createElement('section');
      section.id = 'dukcapilPopulationDetail';
      panelBody.appendChild(section);
    }
    if (!data) {
      section.innerHTML = `<div style="margin-top:14px;padding:12px;border:1px dashed #cbd5e1;border-radius:8px;color:#64748b;font-size:11px;">Data penduduk Dukcapil belum tersedia untuk kode wilayah <b>${kode}</b>.</div>`;
      return;
    }
    const maxGender = Math.max(data.pd, data.wn, 1);
    const maleWidth = (data.pd / maxGender) * 100;
    const femaleWidth = (data.wn / maxGender) * 100;
    const malePct = data.pp ? Math.round((data.pd / data.pp) * 100) : 0;
    const femalePct = 100 - malePct;
    const areaKm2 = Number(data.lw) || 0;
    const density = areaKm2 > 0 ? Math.round(data.pp / areaKm2) : 0;
    const ageGroups = [['0–4', 'u0'], ['5–9', 'u5'], ['10–14', 'u10'], ['15–19', 'u15'], ['20–24', 'u20'], ['25–34', 'u25'], ['35–44', 'u35'], ['45–54', 'u45'], ['55–64', 'u55'], ['65–69', 'u65'], ['70–74', 'u70'], ['75+', 'u75']];
    const maxAge = Math.max(...ageGroups.map(([, key]) => Number(data[key]) || 0), 1);
    const ageChart = ageGroups.map(([label, key]) => `<div style="display:grid;grid-template-columns:34px 1fr 45px;gap:5px;align-items:center;"><span>${label}</span><i style="display:block;height:6px;background:#e0e7ff;border-radius:999px;"><i style="display:block;width:${((Number(data[key]) || 0) / maxAge) * 100}%;height:100%;background:#4f46e5;border-radius:999px;"></i></i><b>${fmt(data[key])}</b></div>`).join('');
    const buildBars = (items, color, track) => {
      const max = Math.max(...items.map(([, value]) => Number(value) || 0), 1);
      return items.map(([label, value]) => `<div style="display:grid;grid-template-columns:90px 1fr 54px;gap:7px;align-items:center;"><span style="color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${label}</span><i style="display:block;height:8px;background:${track};border-radius:999px;overflow:hidden;box-shadow:inset 0 1px 2px rgba(15,23,42,.08);"><i style="display:block;width:${((Number(value) || 0) / max) * 100}%;height:100%;background:linear-gradient(90deg,${color},#fff);border-radius:999px;filter:saturate(1.3);"></i></i><b style="font-variant-numeric:tabular-nums;color:#334155;">${fmt(value)}</b></div>`).join('');
    };
    const religionChart = buildBars([['Islam', data.is], ['Kristen', data.kr], ['Katolik', data.ka], ['Hindu', data.hi], ['Buddha', data.bu], ['Konghucu', data.ko]], '#0ea5e9', '#e0f2fe');
    const maritalChart = buildBars([['Belum kawin', data.bk], ['Kawin', data.kw], ['Cerai hidup', data.ch], ['Cerai mati', data.cm]], '#8b5cf6', '#ede9fe');
    const educationChart = buildBars([['Belum sekolah', data.tb], ['Belum tamat SD', data.bt], ['Tamat SD', data.ts], ['SLTP', data.sl], ['SLTA', data.sa], ['Diploma I', data.d1], ['Diploma III', data.d3], ['S1', data.s1], ['S2', data.s2], ['S3', data.s3]], '#f97316', '#ffedd5');
    const bloodChart = buildBars([['O', data.og], ['A', data.ag], ['B', data.bg], ['AB', data.abg], ['Belum tercatat', data.tg]], '#e11d48', '#ffe4e6');
    const jobChart = buildBars([['Petani', data.pk], ['PNS', data.ps], ['Mengurus rumah', data.mr], ['Pelajar/mahasiswa', data.pw], ['Nelayan', data.nl], ['Pensiunan', data.pm], ['Guru', data.gp], ['Wiraswasta', data.ws]], '#14b8a6', '#ccfbf1');
    section.innerHTML = `
      <div style="margin-top:14px;padding:13px;background:linear-gradient(145deg,#f8fbff,#f5f3ff);border:1px solid #dbeafe;border-radius:14px;box-shadow:0 12px 28px rgba(37,99,235,.08);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;"><div><strong style="font-size:13px;color:#172554;letter-spacing:.01em;">Statistik Penduduk</strong><span style="display:block;font-size:9px;color:#64748b;margin-top:2px;">${data.source}</span></div><span style="font-size:9px;color:#1d4ed8;background:#dbeafe;padding:4px 7px;border-radius:999px;font-weight:700;">${fmt(data.records)} DESA</span></div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;padding:11px;background:linear-gradient(135deg,#1d4ed8,#4338ca);border-radius:11px;color:#fff;">
          <svg viewBox="0 0 42 42" width="70" height="70" style="flex:none;transform:rotate(-90deg);"><circle cx="21" cy="21" r="15.9" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="5"/><circle pathLength="100" cx="21" cy="21" r="15.9" fill="none" stroke="#67e8f9" stroke-width="5" stroke-dasharray="${malePct} ${100 - malePct}" stroke-linecap="round"/><circle pathLength="100" cx="21" cy="21" r="15.9" fill="none" stroke="#f9a8d4" stroke-width="5" stroke-dasharray="${femalePct} ${100 - femalePct}" stroke-dashoffset="-${malePct}" stroke-linecap="round"/></svg>
          <div style="min-width:0;"><span style="display:block;font-size:9px;letter-spacing:.08em;font-weight:700;color:#bfdbfe;">TOTAL POPULASI</span><strong style="display:block;font-size:24px;line-height:1.1;letter-spacing:-.04em;">${fmt(data.pp)}</strong><span style="font-size:10px;color:#e0e7ff;">${malePct}% laki-laki · ${femalePct}% perempuan</span></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;">
          <div style="padding:9px;background:#fff;border:1px solid #dbeafe;border-radius:9px;"><span style="display:block;font-size:9px;color:#64748b;">Kepala Keluarga</span><b style="font-size:15px;color:#334155;">${fmt(data.kk)}</b></div>
          <div style="padding:9px;background:#fff;border:1px solid #dbeafe;border-radius:9px;"><span style="display:block;font-size:9px;color:#64748b;">Kepadatan</span><b style="font-size:15px;color:#c2410c;">${density ? fmt(density) + '/km²' : '-'}</b></div>
          <div style="padding:9px;background:#fff;border:1px solid #dbeafe;border-radius:9px;"><span style="display:block;font-size:9px;color:#64748b;">Luas wilayah</span><b style="font-size:15px;color:#166534;">${areaKm2 ? areaKm2.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' km²' : '-'}</b></div>
          <div style="padding:9px;background:#fff;border:1px solid #dbeafe;border-radius:9px;"><span style="display:block;font-size:9px;color:#64748b;">Rata-rata/KK</span><b style="font-size:15px;color:#7c3aed;">${data.kk ? (data.pp / data.kk).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jiwa' : '-'}</b></div>
        </div>
        <div style="margin-top:14px;padding:10px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;"><div style="font-size:10px;font-weight:700;color:#334155;margin-bottom:8px;">KOMPOSISI PENDUDUK</div>
          <div style="display:grid;gap:5px;font-size:10px;"><div style="display:grid;grid-template-columns:70px 1fr 52px;gap:5px;align-items:center;"><span>Laki-laki</span><i style="display:block;height:7px;background:#dbeafe;border-radius:999px;"><i style="display:block;width:${maleWidth}%;height:100%;background:#2563eb;border-radius:999px;"></i></i><b>${fmt(data.pd)}</b></div><div style="display:grid;grid-template-columns:70px 1fr 52px;gap:5px;align-items:center;"><span>Perempuan</span><i style="display:block;height:7px;background:#fce7f3;border-radius:999px;"><i style="display:block;width:${femaleWidth}%;height:100%;background:#db2777;border-radius:999px;"></i></i><b>${fmt(data.wn)}</b></div></div>
        </div>
        <div style="margin-top:12px;padding:10px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;"><div style="font-size:10px;font-weight:700;color:#334155;margin-bottom:8px;">DISTRIBUSI USIA</div><div style="display:grid;gap:4px;font-size:9px;">${ageChart}</div></div>
        <div style="margin-top:12px;padding:10px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;"><div style="font-size:10px;font-weight:700;color:#334155;margin-bottom:8px;">AGAMA</div><div style="display:grid;gap:5px;font-size:10px;">${religionChart}</div></div>
        <div style="margin-top:12px;padding:10px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;"><div style="font-size:10px;font-weight:700;color:#334155;margin-bottom:8px;">STATUS PERKAWINAN</div><div style="display:grid;gap:5px;font-size:10px;">${maritalChart}</div></div>
        <div style="margin-top:12px;padding:10px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;"><div style="font-size:10px;font-weight:700;color:#334155;margin-bottom:8px;">PENDIDIKAN TERAKHIR</div><div style="display:grid;gap:5px;font-size:10px;">${educationChart}</div></div>
        <div style="margin-top:12px;padding:10px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;"><div style="font-size:10px;font-weight:700;color:#334155;margin-bottom:8px;">GOLONGAN DARAH</div><div style="display:grid;gap:5px;font-size:10px;">${bloodChart}</div></div>
        <div style="margin-top:12px;padding:10px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;"><div style="font-size:10px;font-weight:700;color:#334155;margin-bottom:3px;">PEKERJAAN</div><div style="font-size:8px;color:#94a3b8;margin-bottom:8px;">Kategori mengikuti kode pada dataset Dukcapil lokal.</div><div style="display:grid;gap:5px;font-size:10px;">${jobChart}</div></div>
        <div style="margin-top:12px;padding:10px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;font-size:9px;color:#64748b;line-height:1.5;text-align:center;">Peta yang ditampilkan merupakan peta indikatif, data yang ditampilkan merupakan agregat data kependudukan dari DKB 2024 Semester 1</div>
      </div>`;
  }

  window.loadDukcapilPopulation = async function (marker, kode, location = {}) {
    const data = await getDukcapilPopulation(kode);
    renderDetail(data, kode);
    if (typeof toggleDetailPanel === 'function') toggleDetailPanel(false);
    const showLabel = data && document.getElementById('geoidToggleKemendagri')?.checked !== false;
    const popup = marker?.getPopup?.()?.getElement?.();
    if (!popup || !showLabel) return data;
    popup.querySelector('[data-dukcapil-summary]')?.remove();
    const card = document.createElement('div');
    card.dataset.dukcapilSummary = 'true';
    card.style.cssText = 'padding:8px 10px;background:#f8fafc;border-bottom:1px solid #dbeafe;';
    card.innerHTML = data
      ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;"><div><span style="font-size:9px;font-weight:700;color:#2563eb;">RINGKASAN POPULASI DUKCAPIL</span><strong style="display:block;font-size:17px;line-height:1.1;color:#1e3a8a;">${fmt(data.pp)} jiwa</strong><small style="font-size:9px;color:#64748b;">${fmt(data.kk)} KK · ${fmt(data.records)} desa</small></div><button type="button" data-dukcapil-detail style="border:0;background:#2563eb;color:#fff;border-radius:5px;padding:5px 7px;font-size:9px;font-weight:600;cursor:pointer;">Lihat detail</button></div>`
      : `<span style="font-size:10px;font-weight:600;color:#64748b;">DATA PENDUDUK: TIDAK TERSEDIA</span>`;
    const insights = popup.querySelector('[data-geoid-insights]');
    if (!insights) return data;
    insights.prepend(card);
    card.querySelector('[data-dukcapil-detail]')?.addEventListener('click', () => {
      if (typeof toggleDetailPanel === 'function') toggleDetailPanel(true);
      document.getElementById('dukcapilPopulationDetail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return data;
  };

  window.showDukcapilDetail = async function (kode) {
    const data = await getDukcapilPopulation(kode);
    renderDetail(data, kode);
    if (typeof toggleDetailPanel === 'function') toggleDetailPanel(true);
    document.getElementById('dukcapilPopulationDetail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
})();
