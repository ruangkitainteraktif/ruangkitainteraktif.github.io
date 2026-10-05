/* GeoFarm: peta dasimetrik statistik padi BPS dengan mask lahan sawah. */
(function () {
  'use strict';

  var YEAR = '2025';
  var SIMDASI_TABLE = 'ZjZ6MXlacGJNR0JaaHBPRSs0TzNUdz09';
  var PROVINCES = {
    '32': { name: 'Jawa Barat', source: 'simdasi', areaCode: '3200000' },
    '33': { name: 'Jawa Tengah', source: 'dynamic', domain: '3300', variable: '463', yearCode: '125' },
    '34': { name: 'DI Yogyakarta', source: 'simdasi', areaCode: '3400000' },
    '35': { name: 'Jawa Timur', source: 'simdasi', areaCode: '3500000' },
    '36': { name: 'Banten', source: 'dynamic', domain: '3600', variable: '593', yearCode: '125' }
  };
  var BOUNDARY_URL = 'assets/data/bps/geojson/kabupaten.geojson';
  var BIG_LBS_URL = 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/36/query';
  var COLORS = ['#4b0082', '#2457ff', '#00b8d9', '#ff8a00', '#e6003d'];
  var METRICS = {
    harvest: { label: 'Luas panen', unit: 'ha' },
    production: { label: 'Produksi', unit: 'ton GKG' },
    yield: { label: 'Produktivitas', unit: 'kuintal/ha' }
  };
  var boundaryPromise = null;
  var bpsRows = [];
  var bpsRowsByProvince = Object.create(null);
  var boundaryLayer = null;
  var sawahLayer = null;
  var adminFeature = null;
  var sawahFeatures = [];
  var loadGeneration = 0;
  var polygonChart = null;
  var detailPage = 0;
  var detailPageSize = 100;
  var detailFilter = '';
  var el = {};

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function normalizeCode(value) {
    var digits = String(value == null ? '' : value).replace(/\D/g, '');
    // SIMDASI uses seven digit MFD codes (e.g. 3501000); the local boundary
    // GeoJSON uses the first four digits as the kabupaten/kota code (3501).
    return digits.length > 4 ? digits.slice(0, 4) : digits;
  }

  function parseBpsNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (value === null || value === undefined) return null;
    var text = String(value).trim().replace(/\s/g, '');
    if (!text || text === '-') return null;
    if (text.indexOf(',') >= 0 && text.indexOf('.') >= 0) {
      text = text.lastIndexOf(',') > text.lastIndexOf('.')
        ? text.replace(/\./g, '').replace(',', '.')
        : text.replace(/,/g, '');
    } else if (text.indexOf(',') >= 0) {
      text = text.replace(',', '.');
    } else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) {
      text = text.replace(/\./g, '');
    }
    var number = Number(text.replace(/[^\d.-]/g, ''));
    return Number.isFinite(number) ? number : null;
  }

  function metricFromLabel(value) {
    var label = String(value || '').toLowerCase();
    if (/produktivitas|kuintal\s*\/\s*ha|kw\s*\/\s*ha/.test(label)) return 'yield';
    if (/luas\s*panen|luas panen/.test(label)) return 'harvest';
    if (/produksi|ton\s*(gkg)?/.test(label)) return 'production';
    return null;
  }

  function readBpsRows(payload, boundaries) {
    if (!payload || !payload.datacontent || !payload.vervar || !payload.var) {
      throw new Error('Respons BPS belum berisi dimensi wilayah dan nilai statistik.');
    }
    var content = payload.datacontent;
    var regions = payload.vervar || [];
    var vars = payload.var || [];
    var subvars = payload.turvar && payload.turvar.length ? payload.turvar : [{ val: '0', label: '' }];
    var years = payload.tahun && payload.tahun.length ? payload.tahun : [{ val: '125', label: YEAR }];
    var subyears = payload.turtahun && payload.turtahun.length ? payload.turtahun : [{ val: '0', label: '' }];
    var rows = new Map();
    var allowedCodes = new Set((boundaries || []).map(function (feature) {
      return normalizeCode((feature.properties || {}).idkab);
    }));

    regions.forEach(function (region) {
      var name = String(region.label || '').trim();
      var code = normalizeCode(region.val);
      if (!name || !(/kab|kota/i.test(name) || /^\d{4,7}$/.test(String(region.val)))) return;
      if (allowedCodes.size && !allowedCodes.has(code)) return;
      vars.forEach(function (variable) {
        subvars.forEach(function (subvar) {
          var metric = metricFromLabel((subvar.label || '') + ' ' + (variable.label || ''));
          if (!metric) return;
          years.forEach(function (year) {
            subyears.forEach(function (subyear) {
              var key = String(region.val) + String(variable.val) + String(subvar.val) + String(year.val) + String(subyear.val);
              var raw = content[key];
              if (raw === null || raw === undefined || raw === '' || raw === '-') return;
              var value = parseBpsNumber(raw);
              if (value === null) return;
              var row = rows.get(code) || { code: code, name: name, metrics: {} };
              row.metrics[metric] = value;
              row.year = year.label || '2025';
              rows.set(code, row);
            });
          });
        });
      });
    });

    var result = Array.from(rows.values()).filter(function (row) {
      return row.metrics.harvest !== undefined || row.metrics.production !== undefined || row.metrics.yield !== undefined;
    });
    if (!result.length) throw new Error('Nilai BPS diterima, tetapi format indikator atau kode kabupaten belum dikenali.');
    return result;
  }

  function normalizeRegionName(value) {
    return String(value == null ? '' : value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\b(kabupaten administrasi|kabupaten|kab\.?|kota administrasi|kota)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  }

  function readSimdasiRows(payload, boundaries) {
    if (!payload || (payload.status !== 'OK' && String(payload.status) !== '200')) {
      throw new Error((payload && (payload.message || payload.error)) || 'BPS belum mengembalikan data SIMDASI untuk wilayah ini.');
    }
    var byName = new Map();
    var byCode = new Map();
    (boundaries || []).forEach(function (feature) {
      var props = feature.properties || {};
      var code = normalizeCode(props.idkab);
      var name = normalizeRegionName(props.nmkab);
      if (code) byCode.set(code, { code: code, name: props.nmkab || code, metrics: {} });
      if (name) byName.set(name, code);
    });

    var rows = new Map();
    var regionCodeKeys = /^(idkab|id_kab|id_wilayah|wilayah_id|wilayah|kdkab|kd_kab|kode_kab|kode_kabkota|kode_kabupaten|kodewilayah|kode_wilayah|kdwil|mfd|mfd_code|kode_daerah)$/i;
    var regionNameKeys = /(kab|kota|nama_wilayah|nama_daerah|wilayah|region|area_name|nmkab)/i;
    var numericKeys = /^(nilai|value|jumlah|angka|hasil|besaran|data|nilai_data|capaian|2025)$/i;

    function findNameCode(object) {
      var keys = Object.keys(object || {});
      for (var i = 0; i < keys.length; i++) {
        var value = object[keys[i]];
        if (typeof value !== 'string' && typeof value !== 'number') continue;
        if (!regionNameKeys.test(keys[i]) && typeof value === 'number') continue;
        var normalized = normalizeRegionName(value);
        if (byName.has(normalized)) return byName.get(normalized);
      }
      return '';
    }

    function findCode(object) {
      var keys = Object.keys(object || {});
      for (var i = 0; i < keys.length; i++) {
        if (!regionCodeKeys.test(keys[i])) continue;
        var code = normalizeCode(object[keys[i]]);
        if (byCode.has(code)) return code;
      }
      return '';
    }

    function walk(node, inheritedCode, inheritedMetric, depth) {
      if (depth > 24 || node == null) return;
      if (Array.isArray(node)) {
        node.forEach(function (item) { walk(item, inheritedCode, inheritedMetric, depth + 1); });
        return;
      }
      if (typeof node !== 'object') return;
      var code = findCode(node) || findNameCode(node) || inheritedCode;
      var metric = inheritedMetric;
      var hasNamedMetricValue = Object.keys(node).some(function (key) {
        return !!metricFromLabel(key) && parseBpsNumber(node[key]) !== null;
      });
      if (!metric) {
        Object.keys(node).some(function (key) {
          var value = node[key];
          if (typeof value !== 'string') return false;
          var candidate = metricFromLabel(key + ' ' + value);
          if (!candidate) return false;
          metric = candidate;
          return true;
        });
      }
      Object.keys(node).forEach(function (key) {
        var value = node[key];
        var directMetric = metricFromLabel(key);
        if (code && directMetric) {
          var directValue = parseBpsNumber(value);
          if (directValue !== null) {
            var directRow = rows.get(code) || Object.assign({}, byCode.get(code));
            directRow.metrics[directMetric] = directValue;
            rows.set(code, directRow);
          }
        }
        if (code && !hasNamedMetricValue && metric && (numericKeys.test(key) || typeof value === 'number')) {
          var parsed = parseBpsNumber(value);
          if (parsed !== null && !/^(id|kode|tahun|year|no|nomor|urut|row|kolom)$/i.test(key)) {
            var row = rows.get(code) || Object.assign({}, byCode.get(code));
            row.metrics[metric] = parsed;
            rows.set(code, row);
          }
        }
        var childMetric = directMetric || (typeof value === 'string' ? metricFromLabel(value) : null) || metric;
        walk(value, code, childMetric, depth + 1);
      });
    }

    walk(payload, '', null, 0);
    var result = Array.from(rows.values()).filter(function (row) {
      return row && (row.metrics.harvest !== undefined || row.metrics.production !== undefined || row.metrics.yield !== undefined);
    });
    if (!result.length) throw new Error('Data SIMDASI diterima, tetapi kolom indikator dan kabupaten belum dapat dikenali.');
    return result;
  }

  function loadBoundaries() {
    if (!boundaryPromise) {
      boundaryPromise = fetch(BOUNDARY_URL).then(function (response) {
        if (!response.ok) throw new Error('Batas kabupaten/kota gagal dimuat.');
        return response.json();
      }).catch(function (error) {
        boundaryPromise = null;
        throw error;
      });
    }
    return boundaryPromise;
  }

  function colorFor(value, sorted) {
    if (!sorted.length) return COLORS[0];
    var rank = sorted.filter(function (item) { return item <= value; }).length / sorted.length;
    return COLORS[Math.min(COLORS.length - 1, Math.floor(rank * COLORS.length))];
  }

  function setStatus(message, kind) {
    el.status.textContent = message;
    el.status.className = 'geofarm-ref-status' + (kind ? ' is-' + kind : '');
  }

  function numberText(value, digits) {
    return Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: digits == null ? 2 : digits });
  }

  function areaClass(area) {
    if (area <= 1) return '≤ 1 ha';
    if (area <= 5) return '> 1–5 ha';
    if (area <= 10) return '> 5–10 ha';
    if (area <= 25) return '> 10–25 ha';
    return '> 25 ha';
  }

  function renderAnalysis(row, metric) {
    if (!el.analysis || !sawahFeatures.length) return;
    el.analysis.hidden = false;
    var totalArea = sawahFeatures.reduce(function (sum, feature) { return sum + (feature.properties._gfAreaHa || 0); }, 0);
    var bins = [
      { label: '≤ 1 ha', count: 0, area: 0 }, { label: '> 1–5 ha', count: 0, area: 0 },
      { label: '> 5–10 ha', count: 0, area: 0 }, { label: '> 10–25 ha', count: 0, area: 0 }, { label: '> 25 ha', count: 0, area: 0 }
    ];
    sawahFeatures.forEach(function (feature) {
      var area = feature.properties._gfAreaHa || 0;
      var idx = area <= 1 ? 0 : area <= 5 ? 1 : area <= 10 ? 2 : area <= 25 ? 3 : 4;
      bins[idx].count++;
      bins[idx].area += area;
    });
    if (window.Chart) {
      var chartData = {
        labels: bins.map(function (bin) { return bin.label; }),
        datasets: [{ label: 'Luas polygon sawah (ha)', data: bins.map(function (bin) { return Number(bin.area.toFixed(2)); }),
          backgroundColor: COLORS, borderColor: COLORS, borderWidth: 1, borderRadius: 6, maxBarThickness: 42 }]
      };
      if (polygonChart) {
        polygonChart.data = chartData;
        polygonChart.update();
      } else {
        polygonChart = new Chart(el.chart, { type: 'bar', data: chartData, options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (context) { return numberText(context.parsed.y, 2) + ' ha'; } } } },
          scales: { x: { grid: { display: false }, ticks: { color: '#526174', font: { size: 10 } } },
            y: { beginAtZero: true, title: { display: true, text: 'Total luas sawah (ha)' }, ticks: { color: '#526174', font: { size: 9 } } } }
        } });
      }
    }
    el.analysisSummary.innerHTML = bins.map(function (bin, i) {
      return '<tr><td><i class="gf-dasimetri-swatch" style="background:' + COLORS[i] + '"></i>' + bin.label + '</td><td>'
        + numberText(bin.count, 0) + '</td><td>' + numberText(bin.area, 2) + ' ha</td><td>'
        + numberText(totalArea ? bin.area * 100 / totalArea : 0, 1) + '%</td></tr>';
    }).join('');

    var filtered = sawahFeatures.slice().sort(function (a, b) { return b.properties._gfAreaHa - a.properties._gfAreaHa; });
    if (detailFilter) filtered = filtered.filter(function (feature) {
      var p = feature.properties || {};
      return [p.objectid, p.q_name19, p.wadmkk].join(' ').toLowerCase().indexOf(detailFilter) >= 0;
    });
    var pageCount = Math.max(1, Math.ceil(filtered.length / detailPageSize));
    detailPage = Math.min(detailPage, pageCount - 1);
    var shown = filtered.slice(detailPage * detailPageSize, (detailPage + 1) * detailPageSize);
    var totalSawahHa = totalArea || 1;
    var metricValue = row.metrics[el.metric.value];
    el.detailBody.innerHTML = shown.map(function (feature, index) {
      var p = feature.properties || {};
      var area = p._gfAreaHa || 0;
      var estimated = el.metric.value === 'yield' ? metricValue : metricValue * area / totalSawahHa;
      var estimatedUnit = el.metric.value === 'yield' ? metric.unit : (el.metric.value === 'harvest' ? 'ha' : 'ton GKG');
      return '<tr><td>' + (detailPage * detailPageSize + index + 1).toLocaleString('id-ID') + '</td><td>'
        + escapeHtml(p.objectid || '—') + '</td><td>' + escapeHtml(p.q_name19 || 'Sawah') + '</td><td>'
        + escapeHtml(p.wadmkk || row.name) + '</td><td>' + numberText(area, 3) + '</td><td>'
        + numberText(estimated, 3) + ' ' + escapeHtml(estimatedUnit) + '</td></tr>';
    }).join('');
    el.detailCount.textContent = filtered.length
      ? 'Menampilkan ' + (detailPage * detailPageSize + 1).toLocaleString('id-ID') + '–' + Math.min((detailPage + 1) * detailPageSize, filtered.length).toLocaleString('id-ID') + ' dari ' + filtered.length.toLocaleString('id-ID') + ' polygon'
      : 'Tidak ada polygon yang cocok dengan pencarian.';
    el.prev.disabled = detailPage <= 0;
    el.next.disabled = detailPage >= pageCount - 1;
    el.analysisTitle.textContent = 'Analisis ' + row.name + ' · ' + metric.label;
  }

  function bboxOf(geometry) {
    var bounds = [Infinity, Infinity, -Infinity, -Infinity];
    function visit(value) {
      if (!Array.isArray(value)) return;
      if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
        var x = Number(value[0]), y = Number(value[1]);
        bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
        bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
        return;
      }
      value.forEach(visit);
    }
    visit(geometry && geometry.coordinates);
    return Number.isFinite(bounds[0]) ? bounds : null;
  }

  function selectedAdmin() {
    if (!el.district || !el.district.value) return null;
    var code = normalizeCode(el.district.value);
    return (el.boundaries || []).find(function (feature) {
      return normalizeCode((feature.properties || {}).idkab) === code;
    }) || null;
  }

  async function fetchSawahPolygons(feature, generation) {
    if (!window.turf || typeof window.turf.intersect !== 'function') {
      throw new Error('Pustaka pemotong geometri belum siap. Muat ulang halaman lalu coba lagi.');
    }
    var bbox = bboxOf(feature.geometry);
    if (!bbox) throw new Error('Batas kabupaten tidak memiliki geometri yang dapat dibaca.');
    var results = [];
    var offset = 0;
    var pageSize = 250;
    while (true) {
      if (generation !== loadGeneration) return [];
      var params = new URLSearchParams({
        f: 'json', where: '1=1', geometry: bbox.join(','), geometryType: 'esriGeometryEnvelope',
        inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
        outFields: 'objectid,wadmpr,wadmkk,q_name19,luas_polyg', returnGeometry: 'true',
        resultRecordCount: String(pageSize), resultOffset: String(offset), orderByFields: 'objectid'
      });
      var controller = new AbortController();
      var timeout = window.setTimeout(function () { controller.abort(); }, 30000);
      var response;
      try { response = await fetch(BIG_LBS_URL + '?' + params.toString(), { signal: controller.signal }); }
      catch (error) {
        if (error && error.name === 'AbortError') throw new Error('Permintaan polygon LBS BIG melewati batas waktu 30 detik.');
        throw error;
      } finally { window.clearTimeout(timeout); }
      if (!response.ok) throw new Error('Layanan polygon LBS BIG tidak merespons (HTTP ' + response.status + ').');
      var payload = await response.json();
      if (generation !== loadGeneration) return [];
      if (payload.error) throw new Error(payload.error.message || 'Layanan LBS BIG menolak permintaan.');
      var page = payload.features || [];
      for (var i = 0; i < page.length; i++) {
        var esri = page[i], rings = esri.geometry && esri.geometry.rings;
        if (!rings || !rings.length) continue;
        var sawah = { type: 'Feature', properties: esri.attributes || {}, geometry: { type: 'Polygon', coordinates: rings } };
        try {
          var clipped = window.turf.intersect(window.turf.featureCollection([sawah, feature]));
          if (!clipped || !clipped.geometry) continue;
          var areaHa = window.geoArea && window.geoArea.areaHaFromGeoJSON
            ? window.geoArea.areaHaFromGeoJSON(clipped.geometry)
            : window.turf.area(clipped) / 10000;
          if (!Number.isFinite(areaHa) || areaHa <= 0) continue;
          clipped.properties = Object.assign({}, esri.attributes || {}, { _gfAreaHa: areaHa });
          results.push(clipped);
        } catch (error) { /* Geometri tidak valid atau tidak beririsan, abaikan fitur ini. */ }
      }
      offset += page.length;
      setStatus('Mengambil dan memotong polygon sawah… ' + results.length.toLocaleString('id-ID') + ' polygon diproses.', '');
      if (page.length < pageSize) break;
    }
    return results;
  }

  function renderSummary() {
    var totalHarvest = 0;
    var totalProduction = 0;
    var harvestCount = 0;
    var productionCount = 0;
    bpsRows.forEach(function (row) {
      if (Number.isFinite(row.metrics.harvest)) { totalHarvest += row.metrics.harvest; harvestCount++; }
      if (Number.isFinite(row.metrics.production)) { totalProduction += row.metrics.production; productionCount++; }
    });
    var weightedYield = harvestCount && totalHarvest > 0 ? totalProduction * 10 / totalHarvest : null;
    el.summary.innerHTML = '<div><small>Kabupaten/kota terpetakan</small><b>' + bpsRows.length.toLocaleString('id-ID') + '</b></div>'
      + '<div><small>Luas panen BPS</small><b>' + (harvestCount ? totalHarvest.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' ha' : '—') + '</b></div>'
      + '<div><small>Produksi BPS</small><b>' + (productionCount ? totalProduction.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' ton' : '—') + '</b></div>'
      + '<div><small>Produktivitas tertimbang</small><b>' + (weightedYield === null ? '—' : weightedYield.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' ku/ha') + '</b></div>';
    el.summary.hidden = false;
  }

  function renderMap() {
    if (!bpsRows.length || !sawahFeatures.length || !adminFeature || !window.map || !window.L) return;
    var metric = METRICS[el.metric.value] || METRICS.harvest;
    var values = bpsRows.map(function (item) { return item.metrics[el.metric.value]; }).filter(Number.isFinite).sort(function (x, y) { return x - y; });
    var row = bpsRows.find(function (item) { return item.code === normalizeCode(el.district.value); });
    if (!row || !Number.isFinite(row.metrics[el.metric.value])) {
      setStatus('Nilai indikator BPS untuk kabupaten/kota ini tidak tersedia.', 'error');
      return;
    }
    if (boundaryLayer && window.map.hasLayer(boundaryLayer)) window.map.removeLayer(boundaryLayer);
    if (sawahLayer && window.map.hasLayer(sawahLayer)) window.map.removeLayer(sawahLayer);
    var totalSawahHa = sawahFeatures.reduce(function (sum, item) { return sum + item.properties._gfAreaHa; }, 0);
    var value = row.metrics[el.metric.value];
    sawahLayer = L.geoJSON({ type: 'FeatureCollection', features: sawahFeatures }, {
      attribution: 'BIG Satu Peta · LBS MapServer layer 36',
      style: { color: '#ffffff', weight: 0.45, opacity: 0.78, fillColor: colorFor(value, values), fillOpacity: 0.78 },
      onEachFeature: function (feature, layer) {
        var area = feature.properties._gfAreaHa || 0;
        var estimate = el.metric.value === 'yield' ? value : value * area / (totalSawahHa || 1);
        var unit = el.metric.value === 'yield' ? metric.unit : (el.metric.value === 'harvest' ? 'ha estimasi' : 'ton GKG estimasi');
        var allocationLabel = el.metric.value === 'yield' ? 'Produktivitas BPS kabupaten' : 'Alokasi berbobot luas';
        layer.bindPopup('<div class="gf-dasimetri-popup"><b>' + escapeHtml(row.name) + '</b><br>'
          + 'Area polygon sawah: <strong>' + area.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' ha</strong><br>'
          + escapeHtml(metric.label) + ' BPS: <strong>' + value.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' ' + escapeHtml(metric.unit) + '</strong><br>'
          + escapeHtml(allocationLabel) + ': <strong>' + estimate.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' ' + escapeHtml(unit) + '</strong><br>'
          + '<small>Estimasi alokasi statistik kabupaten ke polygon berdasarkan proporsi luas LBS; bukan pengukuran hasil per petak.</small></div>');
      }
    }).addTo(window.map);
    boundaryLayer = L.geoJSON(adminFeature, { style: { color: '#17324d', weight: 2, opacity: 0.9, fillOpacity: 0 } }).addTo(window.map);
    var bounds = boundaryLayer.getBounds();
    if (bounds.isValid()) window.map.fitBounds(bounds, { padding: [24, 24], maxZoom: 11 });
    var breaks = [values[0], values[Math.floor((values.length - 1) * 0.25)], values[Math.floor((values.length - 1) * 0.5)], values[Math.floor((values.length - 1) * 0.75)], values[values.length - 1]];
    el.legend.innerHTML = '<b>' + escapeHtml(metric.label) + ' (' + escapeHtml(metric.unit) + '), ' + escapeHtml(row.name) + '</b><div class="gf-dasimetri-ramp">'
      + COLORS.map(function (color) { return '<i style="background:' + color + '"></i>'; }).join('') + '</div><div class="gf-dasimetri-labels">'
      + '<span>' + Number(breaks[0]).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '</span><span>'
      + Number(breaks[4]).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '</span></div>';
    el.legend.hidden = false;
    el.reset.disabled = false;
    el.summary.innerHTML = '<div><small>Kabupaten/kota</small><b>' + escapeHtml(row.name) + '</b></div>'
      + '<div><small>Polygon sawah terpotong</small><b>' + sawahFeatures.length.toLocaleString('id-ID') + '</b></div>'
      + '<div><small>Luas LBS hasil geometri</small><b>' + totalSawahHa.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' ha</b></div>'
      + '<div><small>' + escapeHtml(metric.label) + ' BPS</small><b>' + value.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' ' + escapeHtml(metric.unit) + '</b></div>';
    el.summary.hidden = false;
    setStatus(sawahFeatures.length.toLocaleString('id-ID') + ' polygon LBS BIG berhasil dipotong mengikuti batas ' + row.name + '.', 'success');
    renderAnalysis(row, metric);
  }

  function resetMap() {
    if (boundaryLayer && window.map && window.map.hasLayer(boundaryLayer)) window.map.removeLayer(boundaryLayer);
    if (sawahLayer && window.map && window.map.hasLayer(sawahLayer)) window.map.removeLayer(sawahLayer);
    boundaryLayer = null;
    sawahLayer = null;
    adminFeature = null;
    sawahFeatures = [];
    loadGeneration++;
    el.legend.hidden = true;
    el.summary.hidden = true;
    if (el.analysis) el.analysis.hidden = true;
    el.reset.disabled = true;
    setStatus('Peta dasimetrik direset. Pilih Tampilkan peta untuk memuat kembali.', '');
  }

  function loadData() {
    var admin = selectedAdmin();
    if (!admin) { setStatus('Pilih kabupaten/kota terlebih dahulu.', 'error'); return; }
    if (sawahFeatures.length && adminFeature && normalizeCode(adminFeature.properties.idkab) === normalizeCode(admin.properties.idkab)) {
      renderMap();
      return;
    }
    var province = PROVINCES[el.province.value];
    if (!province) { setStatus('Pilih provinsi yang didukung.', 'error'); return; }
    if ((province.source === 'simdasi' && typeof window.fetchRKBpsSimdasiData !== 'function')
      || (province.source === 'dynamic' && typeof window.fetchRKBpsData !== 'function')) {
      setStatus('Layanan BPS belum siap. Buka ulang halaman dan coba lagi.', 'error');
      return;
    }
    var generation = ++loadGeneration;
    el.load.disabled = true;
    setStatus('Mengambil data BPS ' + province.name + ' dan polygon LBS BIG...', '');
    var statsPromise = loadProvinceStats(el.province.value, province);
    Promise.all([statsPromise, fetchSawahPolygons(admin, generation)]).then(function (results) {
      if (generation !== loadGeneration) return;
      bpsRows = results[0];
      if (!results[1].length) throw new Error('BIG tidak mengembalikan polygon LBS di dalam kabupaten/kota ini.');
      adminFeature = admin;
      sawahFeatures = results[1];
      updateMetricOptions();
      renderMap();
    }).catch(function (error) {
      console.error('[GeoFarm dasimetrik] Gagal mengambil data:', error);
      if (generation === loadGeneration) loadGeneration++;
      setStatus(error.message || 'Data BPS atau polygon sawah gagal dimuat.', 'error');
    }).finally(function () { el.load.disabled = false; });
  }

  function refreshAnalysisTable() {
    var row = bpsRows.find(function (item) { return item.code === normalizeCode(el.district.value); });
    if (row) renderAnalysis(row, METRICS[el.metric.value] || METRICS.harvest);
  }

  function loadProvinceStats(provinceCode, province) {
    if (bpsRowsByProvince[provinceCode]) return bpsRowsByProvince[provinceCode];
    var boundaries = (el.allBoundaries || []).filter(function (feature) {
      return String((feature.properties || {}).kdprov || '').replace(/\D/g, '') === provinceCode;
    });
    var request = province.source === 'simdasi'
      ? window.fetchRKBpsSimdasiData(SIMDASI_TABLE, YEAR, province.areaCode).then(function (payload) {
        return readSimdasiRows(payload, boundaries);
      })
      : window.fetchRKBpsData(province.domain, province.variable, province.yearCode).then(function (payload) {
        if (!payload || (payload.status !== 'OK' && String(payload.status) !== '200')) {
          throw new Error((payload && payload.message) || 'BPS belum mengembalikan data untuk ' + province.name + '.');
        }
        return readBpsRows(payload, boundaries);
      });
    bpsRowsByProvince[provinceCode] = request.catch(function (error) {
      delete bpsRowsByProvince[provinceCode];
      throw error;
    });
    return bpsRowsByProvince[provinceCode];
  }

  function updateMetricOptions() {
    if (!el.metric || !bpsRows.length) return;
    var available = [];
    Array.prototype.forEach.call(el.metric.options, function (option) {
      var hasValue = bpsRows.some(function (row) { return Number.isFinite(row.metrics[option.value]); });
      option.disabled = !hasValue;
      if (hasValue) available.push(option.value);
    });
    if (available.length && available.indexOf(el.metric.value) < 0) el.metric.value = available[0];
  }

  function updateSourceText() {
    var province = PROVINCES[el.province.value];
    if (!province) return;
    var method = province.source === 'simdasi' ? 'SIMDASI' : 'API Data Dinamis BPS';
    if (el.source) {
      el.source.innerHTML = 'Statistik: BPS ' + escapeHtml(province.name) + ' (' + method + ', ' + YEAR + '). Geometri: '
        + '<a href="https://geoportal.big.go.id/" target="_blank" rel="noopener noreferrer">BIG Satu Peta, LBS MapServer layer 36</a>. '
        + 'Nilai yang dialokasikan ke polygon adalah estimasi berbobot luas dari total kabupaten, bukan pengukuran hasil panen per petak.';
    }
  }

  function populateDistricts(provinceCode) {
    el.boundaries = (el.allBoundaries || []).filter(function (feature) {
      return String((feature.properties || {}).kdprov || '').replace(/\D/g, '') === provinceCode;
    }).sort(function (a, b) {
      return String(a.properties.nmkab || '').localeCompare(String(b.properties.nmkab || ''), 'id');
    });
    el.district.innerHTML = '<option value="">Pilih kabupaten/kota</option>';
    el.district.value = '';
    Array.prototype.forEach.call(el.metric.options, function (option) { option.disabled = false; });
    el.boundaries.forEach(function (feature) {
      var props = feature.properties || {};
      var option = document.createElement('option');
      option.value = props.idkab;
      option.textContent = (Number(String(props.kdkab || '').slice(-2)) >= 71 ? 'Kota ' : 'Kabupaten ') + (props.nmkab || props.idkab);
      el.district.appendChild(option);
    });
    updateSourceText();
  }

  function init() {
    el.card = document.getElementById('geofarmPetaDasimetri');
    if (!el.card || el.card.__gfDasimetriInit) return;
    el.card.__gfDasimetriInit = true;
    el.metric = document.getElementById('gfDasimetriMetric');
    el.load = document.getElementById('gfDasimetriLoad');
    el.reset = document.getElementById('gfDasimetriReset');
    el.status = document.getElementById('gfDasimetriStatus');
    el.summary = document.getElementById('gfDasimetriSummary');
    el.legend = document.getElementById('gfDasimetriLegend');
    el.province = document.getElementById('gfDasimetriProvince');
    el.district = document.getElementById('gfDasimetriDistrict');
    el.source = document.getElementById('gfDasimetriSource');
    el.analysis = document.getElementById('gfDasimetriAnalysis');
    el.chart = document.getElementById('gfDasimetriChart');
    el.analysisTitle = document.getElementById('gfDasimetriAnalysisTitle');
    el.analysisSummary = document.getElementById('gfDasimetriClassBody');
    el.detailBody = document.getElementById('gfDasimetriDetailBody');
    el.detailCount = document.getElementById('gfDasimetriDetailCount');
    el.search = document.getElementById('gfDasimetriSearch');
    el.prev = document.getElementById('gfDasimetriPrev');
    el.next = document.getElementById('gfDasimetriNext');
    loadBoundaries().then(function (collection) {
      el.allBoundaries = (collection.features || []).filter(function (feature) {
        return Object.prototype.hasOwnProperty.call(PROVINCES, String((feature.properties || {}).kdprov || ''));
      });
      el.province.innerHTML = Object.keys(PROVINCES).map(function (code) {
        return '<option value="' + code + '">' + escapeHtml(PROVINCES[code].name) + '</option>';
      }).join('');
      el.province.value = '33';
      populateDistricts(el.province.value);
    }).catch(function (error) { setStatus(error.message || 'Batas kabupaten gagal dimuat.', 'error'); });
    el.load.addEventListener('click', loadData);
    el.metric.addEventListener('change', function () { if (sawahFeatures.length) renderMap(); });
    el.district.addEventListener('change', resetMap);
    el.province.addEventListener('change', function () {
      resetMap();
      bpsRows = [];
      populateDistricts(el.province.value);
    });
    el.reset.addEventListener('click', resetMap);
    el.search.addEventListener('input', function () { detailFilter = el.search.value.trim().toLowerCase(); detailPage = 0; refreshAnalysisTable(); });
    el.prev.addEventListener('click', function () { detailPage = Math.max(0, detailPage - 1); refreshAnalysisTable(); });
    el.next.addEventListener('click', function () { detailPage += 1; refreshAnalysisTable(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
