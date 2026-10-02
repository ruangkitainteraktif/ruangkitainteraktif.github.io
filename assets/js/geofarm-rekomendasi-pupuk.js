/* GeoFarm: rekomendasi dosis pupuk subsidi 2027 dan polygon wilayah. */
(function () {
  'use strict';

  var DATA_URL = 'assets/data/pertanian/dosis-subsidi-2027.json';
  var BATAS_URL = 'assets/data/bps/geojson/kabupaten.geojson';
  var TITIK_KECAMATAN_URL = 'assets/data/SPPG_Sebaran.geojson';
  var FILE_SUMBER = 'https://erdkk25.pertanian.go.id/uploads/ref/Dosis_2027_Semua_Komoditas_Subsidi.xlsx';
  var LABEL_PUPUK = {
    urea: 'Urea', sp36: 'SP-36', za: 'ZA', npk: 'NPK', organik: 'Organik',
    npk_formula: 'NPK Formula', poc: 'POC'
  };
  var COLORS = ['#eff6ff', '#bfdbfe', '#60a5fa', '#2563eb', '#1e3a8a'];
  var dataPromise = null;
  var batasPromise = null;
  var titikKecamatanPromise = null;
  var data = null;
  var boundaryLayer = null;
  var kodeIndex = null;
  var queryPending = false;
  var el = {};

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatNumber(value, digits) {
    return Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: digits == null ? 1 : digits });
  }

  function status(message, kind) {
    el.status.textContent = message;
    el.status.className = 'geofarm-ref-status' + (kind ? ' is-' + kind : '');
  }

  function loadData() {
    if (!dataPromise) {
      dataPromise = fetch(DATA_URL).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      }).then(function (payload) {
        if (!payload || !Array.isArray(payload.rows) || !Array.isArray(payload.commodities)) {
          throw new Error('Format data dosis tidak valid.');
        }
        data = payload;
        return payload;
      }).catch(function (error) {
        dataPromise = null;
        throw error;
      });
    }
    return dataPromise;
  }

  function makeIndex() {
    if (kodeIndex) return kodeIndex;
    kodeIndex = new Map();
    (window.KODE_WILAYAH_DATA || []).forEach(function (item) {
      if (item && item.kode) kodeIndex.set(item.kode, item.nama);
    });
    return kodeIndex;
  }

  function putOptions(select, entries, placeholder) {
    select.innerHTML = '<option value="">' + escapeHtml(placeholder) + '</option>';
    entries.forEach(function (entry) {
      var option = document.createElement('option');
      option.value = entry.code;
      option.textContent = entry.name;
      select.appendChild(option);
    });
  }

  function wilayahEntries(parent, depth) {
    var prefix = parent ? parent + '.' : '';
    return (window.KODE_WILAYAH_DATA || []).filter(function (item) {
      var parts = item.kode.split('.');
      return parts.length === depth && item.kode.indexOf(prefix) === 0;
    }).map(function (item) { return { code: item.kode, name: item.nama }; });
  }

  function codePartsForProvince(code) {
    return String(code || '').split('.');
  }

  function fillProvince() {
    var available = new Set(data.rows.map(function (row) { return String(row[0]); }));
    var entries = wilayahEntries('', 1).filter(function (item) { return available.has(item.code); });
    putOptions(el.province, entries, 'Pilih provinsi…');
  }

  function fillKabupaten() {
    var selected = el.province.value;
    var available = new Set(data.rows.filter(function (row) { return String(row[0]) === selected; }).map(function (row) { return String(row[1]); }));
    var entries = wilayahEntries(selected, 2).filter(function (item) {
      return available.has(item.code.replace(/\./g, ''));
    });
    putOptions(el.kabupaten, entries, 'Semua kabupaten/kota');
    el.kabupaten.disabled = !selected;
    fillKecamatan();
  }

  function fillKecamatan() {
    var parent = el.kabupaten.value;
    var province = el.province.value;
    var available = new Set(data.rows.filter(function (row) {
      return String(row[0]) === province && (!parent || String(row[1]) === parent.replace(/\./g, ''));
    }).map(function (row) { return String(row[2]); }));
    var entries = parent ? wilayahEntries(parent, 3).filter(function (item) {
      return available.has(item.code.replace(/\./g, ''));
    }) : [];
    putOptions(el.kecamatan, entries, 'Semua kecamatan');
    el.kecamatan.disabled = !parent;
  }

  function fillCommodities() {
    putOptions(el.commodity, data.commodities.map(function (name, index) {
      return { code: String(index), name: name };
    }), 'Pilih komoditas…');
    putOptions(el.fertilizer, data.fields.map(function (name, index) {
      return { code: String(index), name: LABEL_PUPUK[name] || name };
    }), 'Pilih jenis pupuk…');
    el.commodity.disabled = false;
    el.fertilizer.disabled = false;
    updateRunButton();
  }

  function updateRunButton() {
    el.run.disabled = queryPending || !(data && el.province.value && el.commodity.value !== '' && el.fertilizer.value !== '');
  }

  function loadBoundaries() {
    if (!batasPromise) {
      batasPromise = fetch(BATAS_URL).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      }).catch(function (error) {
        batasPromise = null;
        throw error;
      });
    }
    return batasPromise;
  }

  function loadLocalKecamatanPoints() {
    if (!titikKecamatanPromise) {
      titikKecamatanPromise = fetch(TITIK_KECAMATAN_URL).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      }).catch(function (error) {
        titikKecamatanPromise = null;
        throw error;
      });
    }
    return titikKecamatanPromise;
  }

  function regionName(code) {
    return makeIndex().get(code) || code;
  }

  function queryRows() {
    var province = el.province.value;
    var kabupaten = el.kabupaten.value.replace(/\./g, '');
    var kecamatan = el.kecamatan.value.replace(/\./g, '');
    var commodity = Number(el.commodity.value);
    var fertilizer = Number(el.fertilizer.value);
    var groups = new Map();

    data.rows.forEach(function (row) {
      if (String(row[0]) !== province || Number(row[4]) !== commodity) return;
      if (kabupaten && String(row[1]) !== kabupaten) return;
      if (kecamatan && String(row[2]) !== kecamatan) return;
      var key = kecamatan || String(row[1]);
      var group = groups.get(key);
      if (!group) {
        var code = kecamatan || (String(row[1]).slice(0, 2) + '.' + String(row[1]).slice(2));
        group = { code: code, name: regionName(code), sum: 0, count: 0, kecamatan: new Set(), commodityRows: 0 };
        groups.set(key, group);
      }
      group.commodityRows++;
      group.kecamatan.add(String(row[2]));
      var dose = row[5 + fertilizer];
      if (dose !== null && dose !== undefined && Number.isFinite(Number(dose))) {
        group.sum += Number(dose);
        group.count++;
      }
    });

    return Array.from(groups.values()).map(function (group) {
      group.dose = group.count ? group.sum / group.count : null;
      return group;
    }).filter(function (group) { return group.dose !== null; })
      .sort(function (a, b) { return b.dose - a.dose; });
  }

  function doseColor(value, min, max) {
    if (max <= min) return COLORS[2];
    var index = Math.min(COLORS.length - 1, Math.floor(((value - min) / (max - min)) * COLORS.length));
    return COLORS[index];
  }

  function clearMapResults() {
    if (boundaryLayer && window.map && window.map.hasLayer(boundaryLayer)) window.map.removeLayer(boundaryLayer);
    boundaryLayer = null;
    if (typeof window.showGeoidBoundary === 'function') window.showGeoidBoundary(null);
  }

  function showCountyPolygons(results, fertilizerName, commodityName) {
    return loadBoundaries().then(function (collection) {
      var byCode = new Map(results.map(function (item) { return [item.code.replace(/\./g, ''), item]; }));
      var features = (collection.features || []).filter(function (feature) {
        var props = feature.properties || {};
        var code = String(props.idkab || (String(props.kdprov || '') + String(props.kdkab || ''))).replace(/\.0$/, '');
        return byCode.has(code);
      });
      if (!features.length) throw new Error('Polygon kabupaten tidak ditemukan pada data batas BPS.');
      var values = features.map(function (feature) {
        var p = feature.properties || {};
        var code = String(p.idkab || (String(p.kdprov || '') + String(p.kdkab || ''))).replace(/\.0$/, '');
        return byCode.get(code).dose;
      });
      var min = Math.min.apply(Math, values);
      var max = Math.max.apply(Math, values);
      var rendered = {
        type: 'FeatureCollection',
        features: features.map(function (feature) {
          var props = feature.properties || {};
          var code = String(props.idkab || (String(props.kdprov || '') + String(props.kdkab || ''))).replace(/\.0$/, '');
          var result = byCode.get(code);
          feature.properties._gfpr_dose = result.dose;
          feature.properties._gfpr_kec = result.kecamatan.size;
          return feature;
        })
      };
      boundaryLayer = L.geoJSON(rendered, {
        style: function (feature) {
          return { color: '#fff', weight: 1, fillColor: doseColor(feature.properties._gfpr_dose, min, max), fillOpacity: 0.72 };
        },
        onEachFeature: function (feature, layer) {
          var p = feature.properties || {};
          var name = p.nmkab || p.NAMOBJ || p.name || 'Kabupaten/kota';
          layer.bindPopup('<div class="gfpr-popup"><b>' + escapeHtml(name) + '</b><br>'
            + escapeHtml(commodityName) + ' · ' + escapeHtml(fertilizerName) + ': <b>' + formatNumber(p._gfpr_dose, 1) + ' kg/ha</b><br>'
            + '<small>Rata-rata ' + formatNumber(p._gfpr_kec, 0) + ' kecamatan dari dosis e-RDKK 2027</small></div>');
        }
      }).addTo(window.map);
      var bounds = boundaryLayer.getBounds();
      if (bounds && bounds.isValid()) window.map.fitBounds(bounds, { padding: [24, 24], maxZoom: 10 });
    });
  }

  function showKecamatanPolygon(result, fertilizerName, commodityName) {
    var rawCode = String(result.code || '').replace(/\D/g, '').padStart(6, '0');
    var bigCode = rawCode.slice(0, 2) + '.' + rawCode.slice(2, 4) + '.' + rawCode.slice(4, 6);
    var where = "KDCPUM = '" + bigCode + "'";
    var url = 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_KECAMATAN_AR/MapServer/0/query?'
      + 'where=' + encodeURIComponent(where)
      + '&outFields=KDCPUM%2CNAMOBJ%2CKDPKAB&returnGeometry=true&outSR=4326&geometryPrecision=5&f=json';
    var request = typeof window.geoidFetchWithProxy === 'function'
      ? window.geoidFetchWithProxy(url, 15000)
      : fetch(url);

    if (typeof window.showGeoidBoundary === 'function') window.showGeoidBoundary(null);
    return Promise.resolve(request).then(function (response) {
      if (!response || !response.ok) throw new Error('BIG gagal memuat batas kecamatan.');
      return response.json();
    }).then(function (payload) {
      var features = payload.features || [];
      if (!features.length) throw new Error('Polygon kecamatan ' + bigCode + ' tidak ditemukan di BIG.');
      var layers = [];
      features.forEach(function (feature) {
        var rings = feature.geometry && feature.geometry.rings;
        if (!rings || !rings.length) return;
        var latlngs = rings.map(function (ring) {
          return ring.map(function (point) { return [point[1], point[0]]; });
        });
        var polygon = L.polygon(latlngs, {
          color: '#14532d', weight: 2.5, fillColor: '#22c55e', fillOpacity: 0.38
        });
        var attributes = feature.attributes || {};
        polygon.bindPopup('<div class="gfpr-popup"><b>' + escapeHtml(attributes.NAMOBJ || result.name) + '</b><br>'
          + 'Kode BIG: ' + escapeHtml(attributes.KDCPUM || bigCode) + '<br>'
          + escapeHtml(commodityName) + ' · ' + escapeHtml(fertilizerName) + ': <b>' + formatNumber(result.dose, 1) + ' kg/ha</b><br>'
          + '<small>Acuan dosis subsidi 2027 · Sumber batas: BIG</small></div>');
        layers.push(polygon);
      });
      if (!layers.length) throw new Error('Geometri batas kecamatan BIG tidak valid.');
      boundaryLayer = L.featureGroup(layers).addTo(window.map);
      var bounds = boundaryLayer.getBounds();
      if (bounds && bounds.isValid()) window.map.fitBounds(bounds, { padding: [32, 32], maxZoom: 13 });
    }).catch(function (bigError) {
      console.warn('[GeoFarm Pupuk] Batas BIG gagal, mencoba titik lokal SPPG:', bigError);
      return showKecamatanPoints(result, fertilizerName, commodityName);
    });
  }

  function showKecamatanPoints(result, fertilizerName, commodityName) {
    var rawCode = String(result.code || '').replace(/\D/g, '').padStart(6, '0');
    var bigCode = rawCode.slice(0, 2) + '.' + rawCode.slice(2, 4) + '.' + rawCode.slice(4, 6);
    return loadLocalKecamatanPoints().then(function (collection) {
      var features = (collection.features || []).filter(function (feature) {
        var props = feature.properties || {};
        return String(props.KDCPUM || '').replace(/\D/g, '').padStart(6, '0') === rawCode
          && feature.geometry && feature.geometry.type === 'Point' && feature.geometry.coordinates;
      });
      if (!features.length) throw new Error('Batas BIG gagal dan tidak ada titik SPPG lokal untuk Kecamatan ' + result.name + ' (' + bigCode + ').');

      var markers = features.map(function (feature) {
        var props = feature.properties || {};
        var coords = feature.geometry.coordinates;
        var marker = L.circleMarker([coords[1], coords[0]], {
          radius: 7, color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 0.95
        });
        marker.bindPopup('<div class="gfpr-popup"><b>' + escapeHtml(props['Nama SPPG'] || props.NAMOBJ || 'Titik SPPG') + '</b><br>'
          + escapeHtml(props.Alamat || props['Kelurahan'] || '') + '<br>'
          + '<small>Titik lokasi SPPG · Kode kecamatan BIG: ' + escapeHtml(props.KDCPUM || bigCode) + '</small><br>'
          + escapeHtml(commodityName) + ' · ' + escapeHtml(fertilizerName) + ': <b>' + formatNumber(result.dose, 1) + ' kg/ha</b><br>'
          + '<small>Dosis berlaku untuk kecamatan terpilih; titik ini bukan batas atau centroid kecamatan.</small></div>');
        return marker;
      });
      boundaryLayer = L.featureGroup(markers).addTo(window.map);
      var firstPoint = markers[0].getLatLng();
      if (window.map.flyTo) window.map.flyTo(firstPoint, Math.max(window.map.getZoom(), 13), { animate: true, duration: 0.8 });
      else window.map.setView(firstPoint, Math.max(window.map.getZoom(), 13));
      el.legend.innerHTML = '<b>Titik lokasi SPPG · ' + formatNumber(markers.length, 0) + ' titik</b><br>'
        + 'Batas kecamatan BIG tidak tersedia. Dosis ' + escapeHtml(fertilizerName) + ' sebesar '
        + formatNumber(result.dose, 1) + ' kg/ha berlaku untuk kecamatan terpilih; titik SPPG hanya sebagai referensi lokasi.';
      el.legend.hidden = false;
      status('Batas kecamatan BIG gagal dimuat. Menampilkan ' + formatNumber(markers.length, 0) + ' titik lokasi SPPG lokal untuk ' + result.name + '.', 'success');
    });
  }

  function renderResults(results, fertilizerName, commodityName) {
    if (!results.length) {
      el.result.hidden = true;
      el.legend.hidden = true;
      clearMapResults();
      status('Tidak ada dosis yang cocok untuk wilayah dan komoditas ini.', 'warn');
      return Promise.resolve();
    }
    var totalKecamatan = results.reduce(function (sum, item) { return sum + item.kecamatan.size; }, 0);
    var weighted = results.reduce(function (sum, item) { return sum + item.sum; }, 0);
    var count = results.reduce(function (sum, item) { return sum + item.count; }, 0);
    var avg = count ? weighted / count : 0;
    var top = results.slice(0, 30);
    var table = '<div class="gfpr-table-wrap gfpr-table-wrap-primary"><table class="gfpr-table gfpr-table--primary"><thead><tr><th>Wilayah</th><th>Kecamatan</th><th>Dosis kg/ha</th></tr></thead><tbody>'
      + top.map(function (item) {
        return '<tr><td><b>' + escapeHtml(item.name) + '</b></td><td>' + formatNumber(item.kecamatan.size, 0) + '</td><td><strong>' + formatNumber(item.dose, 1) + '</strong></td></tr>';
      }).join('') + '</tbody></table></div>';
    el.result.innerHTML = table + '<div class="gfpr-summary">'
      + '<div class="gfpr-metric"><small>Wilayah cocok</small><b>' + formatNumber(results.length, 0) + '</b></div>'
      + '<div class="gfpr-metric"><small>Rata-rata dosis</small><b>' + formatNumber(avg, 1) + ' kg/ha</b></div>'
      + '<div class="gfpr-metric"><small>Kecamatan terwakili</small><b>' + formatNumber(totalKecamatan, 0) + '</b></div>'
      + '<div class="gfpr-metric"><small>Komoditas</small><b>' + escapeHtml(commodityName) + '</b></div>'
      + '</div>';
    el.result.hidden = false;
    status('Menampilkan ' + formatNumber(results.length, 0) + ' polygon wilayah berdasarkan dosis ' + fertilizerName + '.', 'success');

    if (el.kecamatan.value) {
      el.legend.innerHTML = '<b>Kecamatan dipilih</b><br>' + escapeHtml(fertilizerName) + ': ' + formatNumber(results[0].dose, 1) + ' kg/ha';
      el.legend.hidden = false;
      clearMapResults();
      return showKecamatanPolygon(results[0], fertilizerName, commodityName);
    }

    var min = Math.min.apply(Math, results.map(function (item) { return item.dose; }));
    var max = Math.max.apply(Math, results.map(function (item) { return item.dose; }));
    el.legend.innerHTML = '<b>Rata-rata dosis ' + escapeHtml(fertilizerName) + ' · kg/ha</b>'
      + '<div class="gfpr-legend-ramp">' + COLORS.map(function (color) { return '<i style="background:' + color + '"></i>'; }).join('') + '</div>'
      + '<div class="gfpr-legend-labels"><span>' + formatNumber(min, 1) + '</span><span>' + formatNumber(max, 1) + '</span></div>';
    el.legend.hidden = false;
    clearMapResults();
    return showCountyPolygons(results, fertilizerName, commodityName);
  }

  function runQuery() {
    if (el.run.disabled) return;
    queryPending = true;
    el.run.disabled = true;
    el.result.hidden = true;
    status('Menjalankan query dosis 2027…');
    var fertilizerName = data.fields[Number(el.fertilizer.value)];
    var commodityName = data.commodities[Number(el.commodity.value)];
    var label = LABEL_PUPUK[fertilizerName] || fertilizerName;
    var rows = queryRows();
    renderResults(rows, label, commodityName).catch(function (error) {
      console.error('[GeoFarm Pupuk] Gagal menampilkan polygon:', error);
      status(error.message || 'Polygon wilayah gagal dimuat.', 'error');
    }).finally(function () { queryPending = false; updateRunButton(); });
  }

  function init() {
    var card = document.getElementById('geofarmPupukRekomCard');
    if (!card || card.__gfprInit) return;
    card.__gfprInit = true;
    el.province = document.getElementById('gfprProvinsi');
    el.kabupaten = document.getElementById('gfprKabupaten');
    el.kecamatan = document.getElementById('gfprKecamatan');
    el.commodity = document.getElementById('gfprKomoditas');
    el.fertilizer = document.getElementById('gfprPupuk');
    el.run = document.getElementById('gfprCari');
    el.status = document.getElementById('gfprStatus');
    el.result = document.getElementById('gfprResult');
    el.legend = document.getElementById('gfprMapLegend');

    card.addEventListener('toggle', function () {
      if (!card.open || data) return;
      status('Memuat tabel dosis pupuk 2027…');
      loadData().then(function () {
        fillProvince();
        fillCommodities();
        status(data.rows.length.toLocaleString('id-ID') + ' referensi dosis siap. Pilih wilayah, komoditas, dan jenis pupuk.', 'success');
      }).catch(function (error) {
        console.error('[GeoFarm Pupuk] Gagal memuat data:', error);
        status('Data dosis gagal dimuat. Muat ulang halaman untuk mencoba kembali.', 'error');
      });
    });
    el.province.addEventListener('change', function () { fillKabupaten(); updateRunButton(); });
    el.kabupaten.addEventListener('change', function () { fillKecamatan(); updateRunButton(); });
    [el.kecamatan, el.commodity, el.fertilizer].forEach(function (select) {
      select.addEventListener('change', updateRunButton);
    });
    el.run.addEventListener('click', runQuery);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
