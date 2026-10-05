/* GeoFarm: peta dasimetrik statistik padi BPS dengan mask lahan sawah. */
(function () {
  'use strict';

  var DOMAIN = '3300';
  var VARIABLE = '463';
  var YEAR_CODE = '125';
  var BOUNDARY_URL = 'assets/data/bps/geojson/kabupaten.geojson';
  var SAWAH_TILE_URL = 'https://geoserver.bps.go.id/gwc/service/wmts?layer=ksa%3Albs_2024&style=&tilematrixset=WebMercatorQuad&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image%2Fpng&TileMatrix={z}&TileCol={x}&TileRow={y}';
  var COLORS = ['#eff6ff', '#bfdbfe', '#60a5fa', '#2563eb', '#1e3a8a'];
  var METRICS = {
    harvest: { label: 'Luas panen', unit: 'ha' },
    production: { label: 'Produksi', unit: 'ton GKG' },
    yield: { label: 'Produktivitas', unit: 'kuintal/ha' }
  };
  var boundaryPromise = null;
  var bpsRows = [];
  var boundaryLayer = null;
  var sawahLayer = null;
  var el = {};

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function normalizeCode(value) {
    var digits = String(value == null ? '' : value).replace(/\D/g, '');
    return digits.length > 4 ? digits.slice(-4) : digits;
  }

  function normalizeName(value, isCity) {
    var name = String(value || '').toUpperCase().replace(/\b(KABUPATEN|KAB\.?|KOTA ADMINISTRASI|KOTA)\b/g, ' ')
      .replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
    return (isCity ? 'KOTA ' : 'KABUPATEN ') + name;
  }

  function metricFromLabel(value) {
    var label = String(value || '').toLowerCase();
    if (/produktivitas|kuintal\s*\/\s*ha|kw\s*\/\s*ha/.test(label)) return 'yield';
    if (/luas\s*panen|luas panen/.test(label)) return 'harvest';
    if (/produksi|ton\s*(gkg)?/.test(label)) return 'production';
    return null;
  }

  function readBpsRows(payload) {
    if (!payload || !payload.datacontent || !payload.vervar || !payload.var) {
      throw new Error('Respons BPS belum berisi dimensi wilayah dan nilai statistik.');
    }
    var content = payload.datacontent;
    var regions = payload.vervar || [];
    var vars = payload.var || [{ val: VARIABLE, label: '' }];
    var subvars = payload.turvar && payload.turvar.length ? payload.turvar : [{ val: '0', label: '' }];
    var years = payload.tahun && payload.tahun.length ? payload.tahun : [{ val: YEAR_CODE, label: '2025' }];
    var subyears = payload.turtahun && payload.turtahun.length ? payload.turtahun : [{ val: '0', label: '' }];
    var rows = new Map();

    regions.forEach(function (region) {
      var name = String(region.label || '').trim();
      var code = normalizeCode(region.val);
      if (!name || !(/kab|kota/i.test(name) || /^33\d\d$/.test(String(region.val)))) return;
      vars.forEach(function (variable) {
        subvars.forEach(function (subvar) {
          var metric = metricFromLabel((subvar.label || '') + ' ' + (variable.label || ''));
          if (!metric) return;
          years.forEach(function (year) {
            subyears.forEach(function (subyear) {
              var key = String(region.val) + String(variable.val) + String(subvar.val) + String(year.val) + String(subyear.val);
              var raw = content[key];
              if (raw === null || raw === undefined || raw === '' || raw === '-') return;
              var value = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, '.'));
              if (!Number.isFinite(value)) return;
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
    if (!result.length) throw new Error('Nilai BPS diterima, tetapi format indikatornya belum dikenali.');
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
    if (!bpsRows.length || !window.map || !window.L) return;
    var metric = METRICS[el.metric.value] || METRICS.harvest;
    var values = bpsRows.map(function (row) { return row.metrics[el.metric.value]; }).filter(Number.isFinite).sort(function (a, b) { return a - b; });
    var byCode = new Map();
    var byName = new Map();
    bpsRows.forEach(function (row) {
      byCode.set(row.code, row);
      var isCity = /^kota\b/i.test(row.name);
      byName.set(normalizeName(row.name, isCity), row);
    });
    if (boundaryLayer && window.map.hasLayer(boundaryLayer)) window.map.removeLayer(boundaryLayer);
    if (sawahLayer && window.map.hasLayer(sawahLayer)) window.map.removeLayer(sawahLayer);

    sawahLayer = L.tileLayer(SAWAH_TILE_URL, {
      opacity: 0.38,
      bounds: [[-8.3, 108.4], [-5.5, 111.7]],
      minZoom: 7,
      maxZoom: 19,
      attribution: 'Lahan Baku Sawah 2024 · KSA BPS'
    });
    sawahLayer.addTo(window.map);

    loadBoundaries().then(function (collection) {
      var features = (collection.features || []).filter(function (feature) {
        var props = feature.properties || {};
        if (String(props.kdprov || '').replace(/\D/g, '') !== '33') return false;
        var code = normalizeCode(props.idkab || (String(props.kdprov || '') + String(props.kdkab || '')));
        var row = byCode.get(code);
        if (!row) {
          var subdistrictCode = Number(String(props.kdkab || code.slice(-2)).replace(/\D/g, ''));
          var isCity = subdistrictCode >= 71;
          row = byName.get(normalizeName(props.nmkab || props.NAMOBJ || props.name, isCity));
        }
        if (!row || !Number.isFinite(row.metrics[el.metric.value])) return false;
        feature.properties._gfDasimetri = row.metrics[el.metric.value];
        feature.properties._gfDasimetriNama = row.name;
        feature.properties._gfDasimetriCode = row.code;
        return true;
      });
      if (!features.length) throw new Error('Data BPS tidak cocok dengan kode batas kabupaten/kota Jawa Tengah.');
      boundaryLayer = L.geoJSON({ type: 'FeatureCollection', features: features }, {
        style: function (feature) {
          return { color: '#ffffff', weight: 1.3, opacity: 0.95, fillColor: colorFor(feature.properties._gfDasimetri, values), fillOpacity: 0.72 };
        },
        onEachFeature: function (feature, layer) {
          var value = feature.properties._gfDasimetri;
          layer.bindPopup('<div class="gf-dasimetri-popup"><b>' + escapeHtml(feature.properties._gfDasimetriNama) + '</b><br>'
            + escapeHtml(metric.label) + ': <strong>' + value.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' ' + escapeHtml(metric.unit) + '</strong><br>'
            + '<small>BPS Jawa Tengah · 2025. Nilai statistik kabupaten/kota; mask sawah menunjukkan sebaran lahan, bukan nilai hasil per petak.</small></div>');
        }
      }).addTo(window.map);
      var bounds = boundaryLayer.getBounds();
      if (bounds.isValid()) window.map.fitBounds(bounds, { padding: [24, 24], maxZoom: 9 });
      var legendValues = [values[0], values[Math.floor((values.length - 1) * 0.25)], values[Math.floor((values.length - 1) * 0.5)], values[Math.floor((values.length - 1) * 0.75)], values[values.length - 1]];
      el.legend.innerHTML = '<b>' + escapeHtml(metric.label) + ' (' + escapeHtml(metric.unit) + ')</b><div class="gf-dasimetri-ramp">'
        + COLORS.map(function (color) { return '<i style="background:' + color + '"></i>'; }).join('') + '</div><div class="gf-dasimetri-labels">'
        + '<span>' + Number(legendValues[0]).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '</span><span>'
        + Number(legendValues[4]).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '</span></div>';
      el.legend.hidden = false;
      el.reset.disabled = false;
      setStatus(features.length + ' kabupaten/kota dipetakan. Mask sawah KSA BPS 2024 ditampilkan sebagai konteks dasimetrik.', 'success');
    }).catch(function (error) {
      setStatus(error.message || 'Peta statistik gagal ditampilkan.', 'error');
    });
  }

  function resetMap() {
    if (boundaryLayer && window.map && window.map.hasLayer(boundaryLayer)) window.map.removeLayer(boundaryLayer);
    if (sawahLayer && window.map && window.map.hasLayer(sawahLayer)) window.map.removeLayer(sawahLayer);
    boundaryLayer = null;
    sawahLayer = null;
    el.legend.hidden = true;
    el.summary.hidden = true;
    el.reset.disabled = true;
    setStatus('Peta dasimetrik direset. Pilih Tampilkan peta untuk memuat kembali.', '');
  }

  function loadData() {
    if (bpsRows.length) { renderSummary(); renderMap(); return; }
    if (typeof window.fetchRKBpsData !== 'function') {
      setStatus('Layanan BPS belum siap. Buka ulang halaman dan coba lagi.', 'error');
      return;
    }
    el.load.disabled = true;
    setStatus('Mengambil luas panen, produksi, dan produktivitas dari BPS…', '');
    window.fetchRKBpsData(DOMAIN, VARIABLE, YEAR_CODE).then(function (payload) {
      if (payload.status !== 'OK' && String(payload.status) !== '200') {
        throw new Error(payload.message || 'BPS belum mengembalikan data untuk tabel ini.');
      }
      bpsRows = readBpsRows(payload);
      renderSummary();
      renderMap();
    }).catch(function (error) {
      console.error('[GeoFarm dasimetrik] BPS request gagal:', error);
      setStatus(error.message || 'Data BPS gagal dimuat. Periksa koneksi atau kunci Web API.', 'error');
    }).finally(function () { el.load.disabled = false; });
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
    el.load.addEventListener('click', loadData);
    el.metric.addEventListener('change', function () { if (bpsRows.length) renderMap(); });
    el.reset.addEventListener('click', resetMap);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
