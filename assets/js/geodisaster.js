(function () {
  'use strict';

  var KODE_URL = 'assets/data/kode_wilayah.json';
  var LOCAL_PROVINCE_BOUNDARY_URL = 'assets/data/bps/geojson/provinsi.geojson';
  var SDA_URL = 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer';
  var DEM_SAMPLES_URL = 'https://geoservices.big.go.id/raster/rest/services/DEMNAS/DEM_Indonesia/ImageServer/getSamples';
  var provinces = [];
  var analysisRequest = 0;
  var chart = null;
  var provinceLayer = null;
  var localProvincePromise = null;

  var $ = function (id) { return document.getElementById(id); };
  function status(message, error) {
    var el = $('gd-status');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('is-error', !!error);
  }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function digits(code) { return String(code || '').replace(/\D/g, ''); }
  function text(value) { return String(value == null ? '' : value).trim(); }
  function field(props, name) {
    var key = Object.keys(props || {}).find(function (k) { return k.toLowerCase() === name.toLowerCase(); });
    return key ? props[key] : null;
  }
  function number(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (value == null || value === '') return null;
    var n = Number(String(value).replace(',', '.').replace(/[^\d.+-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  function bboxOf(feature) { return window.turf.bbox(feature); }
  function bboxGeometry(bbox) {
    return JSON.stringify({ xmin: bbox[0], ymin: bbox[1], xmax: bbox[2], ymax: bbox[3], spatialReference: { wkid: 4326 } });
  }
  function paramsUrl(base, params) { return base + '?' + new URLSearchParams(params).toString(); }
  async function loadLocalProvinceBoundary(selected) {
    if (!localProvincePromise) {
      localProvincePromise = fetch(LOCAL_PROVINCE_BOUNDARY_URL).then(function (response) {
        if (!response.ok) throw new Error('Batas provinsi lokal gagal dimuat (HTTP ' + response.status + ').');
        return response.json();
      }).then(function (data) {
        if (!data || !Array.isArray(data.features)) throw new Error('GeoJSON batas provinsi lokal tidak valid.');
        return data.features;
      }).catch(function (error) {
        localProvincePromise = null;
        throw error;
      });
    }
    var features = await localProvincePromise;
    var code = digits(selected.code);
    var feature = features.find(function (item) {
      var props = item.properties || {};
      return digits(field(props, 'kdprov')) === code;
    });
    if (!feature || !feature.geometry || !/Polygon/.test(feature.geometry.type)) {
      throw new Error('Polygon provinsi tidak ditemukan pada GeoJSON lokal.');
    }
    feature.properties = Object.assign({}, feature.properties || {}, {
      nama: selected.nama, source: 'BPS · GeoJSON provinsi lokal'
    });
    return feature;
  }

  async function requestGeoJSON(url, params) {
    var response = await fetch(paramsUrl(url, params));
    if (!response.ok) throw new Error('Layanan BIG merespons HTTP ' + response.status + '.');
    var data = await response.json();
    if (data.error) throw new Error(data.error.message || 'Layanan BIG mengembalikan kesalahan.');
    return data.features || [];
  }

  async function querySda(layerId, bbox, outFields, limit) {
    var all = [];
    var offset = 0;
    var pageSize = 1000;
    while (all.length < limit) {
      var features = await requestGeoJSON(SDA_URL + '/' + layerId + '/query', {
        where: '1=1', geometry: bboxGeometry(bbox), geometryType: 'esriGeometryEnvelope',
        inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: outFields,
        returnGeometry: true, outSR: 4326, f: 'geojson', resultOffset: offset,
        resultRecordCount: Math.min(pageSize, limit - all.length), orderByFields: 'OBJECTID'
      });
      all = all.concat(features);
      if (features.length < pageSize) break;
      offset += features.length;
    }
    return all;
  }

  function intersectArea(boundary, feature) {
    try {
      var intersection = window.turf.intersect(window.turf.featureCollection([boundary, feature]));
      return intersection ? window.turf.area(intersection) : 0;
    } catch (error) { return 0; }
  }

  function overlayStats(boundary, features, type) {
    var area = window.turf.area(boundary);
    var covered = 0;
    var deficit = 0;
    var surplus = 0;
    var classes = {};
    features.forEach(function (feature) {
      if (!feature.geometry || !/Polygon/.test(feature.geometry.type)) return;
      var clippedArea = intersectArea(boundary, feature);
      if (!clippedArea) return;
      covered += clippedArea;
      var props = feature.properties || {};
      var label = text(field(props, type === 'surface' ? 'kls_nrcair' : 'namobj'));
      if (label) classes[label] = (classes[label] || 0) + clippedArea;
      if (type === 'surface') {
        if (/defisit|deficit/i.test(label)) deficit += clippedArea;
        if (/surplus/i.test(label)) surplus += clippedArea;
      }
    });
    var classArea = deficit + surplus;
    return { districtArea: area, coveredArea: covered, coveragePct: area ? Math.min(100, covered / area * 100) : 0,
      deficitArea: deficit, surplusArea: surplus, deficitPct: classArea ? deficit / classArea * 100 : null,
      classes: classes, featureCount: features.length };
  }

  function pointStats(boundary, features) {
    var points = features.filter(function (feature) {
      return feature.geometry && feature.geometry.type === 'Point' && window.turf.booleanPointInPolygon(feature, boundary);
    });
    var discharge = points.map(function (feature) {
      return number(field(feature.properties || {}, 'dbt_air_baku'));
    }).filter(function (value) { return value != null; });
    return { count: points.length, withDischarge: discharge.length,
      dischargeTotal: discharge.length ? discharge.reduce(function (a, b) { return a + b; }, 0) : null };
  }

  function terrainPoints(boundary) {
    var box = bboxOf(boundary);
    var widthKm = Math.max(1, (box[2] - box[0]) * 111 * Math.cos((box[1] + box[3]) / 2 * Math.PI / 180));
    var heightKm = Math.max(1, (box[3] - box[1]) * 111);
    var spacing = Math.max(3, Math.sqrt(widthKm * heightKm / 180));
    var grid = window.turf.pointGrid(box, spacing, { units: 'kilometers', mask: boundary });
    var points = grid.features;
    if (points.length > 150) {
      var stride = Math.ceil(points.length / 150);
      points = points.filter(function (_, index) { return index % stride === 0; }).slice(0, 150);
    }
    if (!points.length) points = [window.turf.centroid(boundary)];
    return points;
  }

  async function demStats(boundary) {
    var points = terrainPoints(boundary).map(function (feature) { return feature.geometry.coordinates; });
    var geometry = JSON.stringify({ points: points, spatialReference: { wkid: 4326 } });
    var params = { geometry: geometry, geometryType: 'esriGeometryMultipoint',
      sampleCount: String(points.length), returnFirstValueOnly: 'false', interpolation: 'RSP_BilinearInterpolation',
      outFields: '*', f: 'json' };
    var response = await fetch(paramsUrl(DEM_SAMPLES_URL, params));
    if (!response.ok) throw new Error('DEMNAS merespons HTTP ' + response.status + '.');
    var data = await response.json();
    if (data.error) throw new Error(data.error.message || 'Sampel DEMNAS gagal.');
    var values = (data.samples || []).map(function (sample) {
      var props = sample.attributes || sample.properties || {};
      var raw = sample.value != null ? sample.value : (props.RASTERVALU != null ? props.RASTERVALU : (props.PixelValue != null ? props.PixelValue : props.value));
      if (Array.isArray(raw)) raw = raw[0];
      return number(raw);
    }).filter(function (value) { return value != null && value > -100 && value < 9000; }).sort(function (a, b) { return a - b; });
    if (!values.length) throw new Error('DEMNAS tidak mengembalikan nilai elevasi untuk wilayah ini.');
    var below = values.filter(function (value) { return value <= 10; }).length;
    var sum = values.reduce(function (a, b) { return a + b; }, 0);
    return { count: values.length, mean: sum / values.length, min: values[0], max: values[values.length - 1],
      p10: values[Math.floor((values.length - 1) * .10)], p90: values[Math.floor((values.length - 1) * .90)],
      lowlandPct: below / values.length * 100 };
  }

  function scoreClass(score) {
    if (score == null || !Number.isFinite(score)) return 'terbatas';
    return score <= 33 ? 'rendah' : (score <= 66 ? 'sedang' : 'tinggi');
  }
  function makeScores(surface, groundwater, terrain) {
    var components = [
      { key: 'surface', label: 'Air permukaan / neraca air', score: surface.deficitPct, weight: .5 },
      { key: 'groundwater', label: 'Air tanah / cakupan cekungan', score: groundwater.coveragePct == null ? null : 100 - groundwater.coveragePct, weight: .3 },
      { key: 'terrain', label: 'Topografi / elevasi rendah ≤10 m', score: terrain.lowlandPct, weight: .2 }
    ];
    var available = components.filter(function (item) { return Number.isFinite(item.score); });
    var weightTotal = available.reduce(function (sum, item) { return sum + item.weight; }, 0);
    var score = weightTotal ? available.reduce(function (sum, item) { return sum + item.score * item.weight; }, 0) / weightTotal : null;
    return { components: components, score: score, className: scoreClass(score), completeness: weightTotal * 100 };
  }

  function fmt(value, digitsCount) {
    return value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('id-ID', { maximumFractionDigits: digitsCount == null ? 1 : digitsCount });
  }
  function row(label, stat, score, coverage) {
    return '<tr><td>' + esc(label) + '</td><td>' + stat + '</td><td>' + (score == null ? '—' : fmt(score, 0) + '/100') + '</td><td>' + coverage + '</td></tr>';
  }
  function render(result) {
    var summary = $('gd-summary');
    var risk = result.risk;
    summary.innerHTML = '<div><strong>' + esc(result.name) + '</strong><small>Indeks komposit skrining tingkat provinsi · kelengkapan bobot ' + fmt(risk.completeness, 0) + '% · batas: ' + esc(result.boundary.properties.source) + '</small></div>' +
      '<span class="gd-score" data-level="' + esc(risk.className) + '">' + (risk.score == null ? 'Data terbatas' : esc(risk.className.toUpperCase()) + ' · ' + fmt(risk.score, 0)) + '</span>';
    var rows = '';
    rows += row('Neraca air BIG', result.surface.deficitPct == null ? 'Tidak ada kelas defisit/surplus terbaca' : fmt(result.surface.deficitPct, 1) + '% area overlay defisit', risk.components[0].score,
      fmt(result.surface.coveragePct, 1) + '% wilayah · ' + result.surface.featureCount + ' poligon');
    rows += row('Cekungan air tanah BIG', result.groundwater.coveragePct == null ? 'Tidak ada geometri cekungan' : fmt(result.groundwater.coveragePct, 1) + '% cakupan', risk.components[1].score,
      fmt(result.groundwater.featureCount, 0) + ' unit cekungan');
    rows += row('Infrastruktur air tanah BIG', fmt(result.wells.count, 0) + ' titik sumur/infrastruktur', null,
      result.wells.withDischarge ? fmt(result.wells.dischargeTotal, 2) + ' m³/detik tercatat' : 'Debit tidak tercatat');
    rows += row('Elevasi DEMNAS', 'Rerata ' + fmt(result.terrain.mean, 1) + ' m · P10–P90 ' + fmt(result.terrain.p10, 1) + '–' + fmt(result.terrain.p90, 1) + ' m', risk.components[2].score,
      fmt(result.terrain.lowlandPct, 1) + '% sampel ≤10 m · n=' + result.terrain.count);
    $('gd-table-body').innerHTML = rows;
    $('gd-results').hidden = false;
    renderChart(risk);
    renderMethod(result);
    if (window.map && window.L) {
      if (provinceLayer) window.map.removeLayer(provinceLayer);
      provinceLayer = window.L.geoJSON(result.boundary, { style: { color: '#0f766e', weight: 2, fillColor: '#2dd4bf', fillOpacity: .08 } }).addTo(window.map);
      window.map.fitBounds(provinceLayer.getBounds(), { padding: [28, 28], maxZoom: 8 });
    }
  }

  function renderChart(risk) {
    var canvas = $('gd-chart');
    if (!canvas || !window.Chart) return;
    if (chart) chart.destroy();
    chart = new window.Chart(canvas, {
      type: 'bar',
      data: { labels: risk.components.map(function (item) { return item.label; }),
        datasets: [{ label: 'Skor risiko proxy (0–100)', data: risk.components.map(function (item) { return item.score; }),
          backgroundColor: ['#f97316', '#8b5cf6', '#06b6d4'], borderRadius: 7, borderSkipped: false, barThickness: 22 }] },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: { duration: 450 },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (ctx) { return ctx.raw == null ? 'Data tidak tersedia' : ' ' + Number(ctx.raw).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '/100'; } } } },
        scales: { x: { min: 0, max: 100, grid: { color: '#edf2f7' }, ticks: { stepSize: 20, font: { size: 9 } } },
          y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 9 } } } } }
    });
  }

  function renderMethod(result) {
    $('gd-method-body').innerHTML =
      '<p><b>Indeks Water Risk 2026</b> adalah skrining spasial heuristik, bukan prakiraan atau penilaian resmi. Skor 0–100 dibentuk dari neraca air defisit (50%), proporsi wilayah di luar cekungan air tanah terpetakan (30%), dan proporsi sampel DEMNAS pada elevasi ≤10 m (20%). Kelas: 0–33 rendah, 34–66 sedang, 67–100 tinggi. Bobot dihitung ulang hanya dari indikator yang tersedia; kelengkapan menunjukkan bobot data yang berhasil didapat.</p>' +
      '<p><b>Air permukaan:</b> kelas defisit/surplus dan geometri Peta Ketersediaan Air BIG, skala 1:250.000, sumber studi Ditjen SDA 2016. Skor memakai luas potongan polygon yang terklasifikasi, bukan volume air atau kondisi real-time.</p>' +
      '<p><b>Air tanah:</b> cakupan Cekungan Air Tanah BIG skala 1:250.000 dan titik infrastruktur Peta Air Tanah. Cekungan terpetakan tidak membuktikan debit, mutu, atau keberlanjutan akuifer; jumlah titik sumur juga bukan inventaris lengkap.</p>' +
      '<p><b>Topografi:</b> DEMNAS BIG disampel merata pada grid adaptif (maksimum 150 titik). Ambang 10 m hanya proxy keterpaparan dataran rendah; bukan peta banjir, pasang, atau genangan. Rerata dan rentang elevasi adalah statistik sampel, bukan seluruh sel DEM.</p>' +
      '<p><b>Batas wilayah:</b> analisis memakai ' + esc(result.boundary.properties.source) + ' untuk polygon provinsi. Batas diambil lokal; modul ini tidak meminta layanan batas administrasi BIG saat runtime.</p>' +
      '<p><b>Batas analisis:</b> hasil bergantung pada ketersediaan layanan BIG dan skala/kemutakhiran masing-masing sumber. Data neraca air yang dipakai beracuan studi 2016, sehingga skor tidak mewakili ketersediaan air tahun 2026 secara real-time.</p>' +
      '<p>Sumber: <a href="https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/layers" target="_blank" rel="noopener">BIG SatuPeta · Sumber Daya Alam dan Lingkungan</a> · <a href="https://geoservices.big.go.id/raster/rest/services/DEMNAS/DEM_Indonesia/ImageServer" target="_blank" rel="noopener">DEMNAS BIG</a> · batas provinsi dari GeoJSON lokal BPS.</p>';
  }

  function populateProvinces() {
    var select = $('gd-province-select');
    if (!select) return;
    select.innerHTML = '<option value="">Pilih provinsi…</option>' + provinces.map(function (item) {
      return '<option value="' + esc(item.code) + '">' + esc(item.nama) + '</option>';
    }).join('');
  }

  async function initialize() {
    try {
      var rows = window.KODE_WILAYAH_DATA;
      if (!Array.isArray(rows)) {
        var response = await fetch(KODE_URL);
        if (!response.ok) throw new Error('Data kode wilayah tidak dapat dimuat.');
        rows = await response.json();
      }
      provinces = rows.filter(function (row) { return String(row.kode).split('.').length === 1; }).map(function (row) {
        return { code: digits(row.kode), nama: row.nama };
      }).sort(function (a, b) { return a.nama.localeCompare(b.nama, 'id-ID'); });
      populateProvinces();
      status(provinces.length.toLocaleString('id-ID') + ' provinsi lokal tersedia.');
    } catch (error) { status(error.message || 'Gagal memuat daftar wilayah.', true); }
  }

  async function run() {
    var select = $('gd-province-select');
    var selected = provinces.find(function (item) { return item.code === select.value; });
    if (!selected) return;
    var runId = ++analysisRequest;
    $('gd-run').disabled = true;
    $('gd-results').hidden = true;
    status('Memuat batas provinsi dari GeoJSON lokal…');
    try {
      var boundary = await loadLocalProvinceBoundary(selected);
      var bbox = bboxOf(boundary);
      status('Menganalisis overlay SatuPeta BIG dan mengambil sampel DEMNAS…');
      var tasks = await Promise.allSettled([
        querySda(2, bbox, 'kls_nrcair,nrc_air,kls_ipa,kls_ktrs,nm_inf,luas_km2,thn_dat', 3000),
        querySda(42, bbox, 'namobj', 3000),
        querySda(1, bbox, 'kd_inf,nm_inf,nm_sumur,dbt_air_baku,dbt_pom,kdlm_at,thn_dat', 3000),
        demStats(boundary)
      ]);
      if (runId !== analysisRequest) return;
      var issues = [];
      var get = function (index, name) {
        if (tasks[index].status === 'fulfilled') return tasks[index].value;
        issues.push(name + ': ' + (tasks[index].reason.message || 'layanan tidak merespons'));
        return index === 3 ? null : [];
      };
      var surfaceFeatures = get(0, 'Neraca air');
      var basinFeatures = get(1, 'Cekungan air tanah');
      var wellFeatures = get(2, 'Infrastruktur air tanah');
      var terrain = get(3, 'DEMNAS');
      var surface = overlayStats(boundary, surfaceFeatures, 'surface');
      var groundwaterOverlay = overlayStats(boundary, basinFeatures, 'groundwater');
      var groundwater = { coveragePct: groundwaterOverlay.coveredArea > 0 ? groundwaterOverlay.coveragePct : null,
        featureCount: basinFeatures.length, overlayArea: groundwaterOverlay.coveredArea };
      var wells = pointStats(boundary, wellFeatures);
      if (!terrain) terrain = { mean: null, min: null, max: null, p10: null, p90: null, lowlandPct: null, count: 0 };
      var risk = makeScores(surface, groundwater, terrain);
      var result = { name: selected.nama, boundary: boundary, surface: surface,
        groundwater: groundwater, wells: wells, terrain: terrain, risk: risk, issues: issues };
      render(result);
      if (issues.length) status('Hasil parsial. ' + issues.join(' · '), true);
      else status('Analisis selesai · skrining tingkat provinsi.');
    } catch (error) {
      if (runId === analysisRequest) status(error.message || 'Analisis gagal. Periksa koneksi ke layanan BIG.', true);
    } finally {
      if (runId === analysisRequest) $('gd-run').disabled = !select.value;
    }
  }

  function bind() {
    if (!$('gd-run')) return;
    $('gd-province-select').addEventListener('change', function () {
      $('gd-run').disabled = !this.value;
      $('gd-results').hidden = true;
      status(this.value ? 'Provinsi dipilih. Jalankan analisis untuk memuat data.' : 'Pilih provinsi.');
    });
    $('gd-run').addEventListener('click', run);
    initialize();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
