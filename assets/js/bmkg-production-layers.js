/* ── BMKG Production Layers — datacuaca.bmkg.go.id ── */
(function () {
  'use strict';

  var BASE = 'https://datacuaca.bmkg.go.id/arcgis/rest/services/production/';
  var POPUP_CLASS = 'bmkg-prod-popup';

  var SERVICES = {
    nowcasting: {
      path: 'nowcasting_public/MapServer',
      layerIds: [2],
      name: 'Nowcasting Aktif',
      legendTitle: 'Nowcasting Hujan Aktif',
      fields: ['namakecamatan','namakotakab','namaprovinsi','tipearea','kategoridampak','waktuberlaku'],
      fieldLabels: {
        namakecamatan: 'Kecamatan', namakotakab: 'Kabupaten', namaprovinsi: 'Provinsi',
        tipearea: 'Tipe Area', kategoridampak: 'Kategori Dampak', waktuberlaku: 'Waktu Berlaku'
      },
      legendItems: [
        { color: '#ffaa00', label: 'Area Terjadi' },
        { color: '#ffff00', label: 'Area Meluas' }
      ]
    },
    prakiraan: {
      path: 'prakiraan_cuaca/MapServer',
      layerIds: [0],
      name: 'Prakiraan Cuaca',
      legendTitle: 'Prakiraan Cuaca BMKG',
      fields: ['kecamatan','kabupaten','propinsi'],
      fieldLabels: { kecamatan: 'Kecamatan', kabupaten: 'Kabupaten', propinsi: 'Provinsi' },
      legendItems: [
        { color: '#357f4e', label: 'Titik Kecamatan' }
      ]
    },
    geohotspot: {
      path: 'geohotspot/MapServer',
      layerIds: [0],
      name: 'Hotspot (BMKG)',
      legendTitle: 'Hotspot BMKG',
      fields: ['provinsi','kabupaten','kecamatan','date','time','region'],
      fieldLabels: {
        provinsi: 'Provinsi', kabupaten: 'Kabupaten', kecamatan: 'Kecamatan',
        date: 'Tanggal', time: 'Waktu', region: 'Region'
      },
      legendItems: [
        { color: '#3e879b', label: 'Titik Hotspot' }
      ]
    },
    rdca: {
      path: 'rdca/MapServer',
      layerIds: [1],
      name: 'RDCA (Radar)',
      legendTitle: 'Radar Composit BMKG',
      fields: ['latitude','longitude','system_date'],
      fieldLabels: { latitude: 'Latitude', longitude: 'Longitude', system_date: 'Tanggal Update' },
      legendItems: [
        { color: '#448e8e', label: 'Stasiun Radar' }
      ]
    },
    rdcaGeohotspot: {
      path: 'rdca_geohotspot/MapServer',
      layerIds: [0, 1],
      name: 'RDCA + Hotspot',
      legendTitle: 'RDCA + Hotspot BMKG',
      fields: ['provinsi','kabupaten','kecamatan','date','time'],
      fieldLabels: { provinsi: 'Provinsi', kabupaten: 'Kabupaten', kecamatan: 'Kecamatan', date: 'Tanggal', time: 'Waktu' },
      legendItems: [
        { color: '#3e879b', label: 'Hotspot' },
        { color: '#448e8e', label: 'Stasiun Radar' }
      ]
    },
    spartanBasin: {
      path: 'saoffg/MapServer',
      layerIds: [0],
      name: 'Spartan BASIN',
      legendTitle: 'Spartan BASIN BMKG',
      fields: ['cat','label','ffr12','ffr24','status'],
      fieldLabels: { cat: 'Kategori', label: 'Label', ffr12: 'FFR 12j', ffr24: 'FFR 24j', status: 'Status' },
      legendItems: [
        { color: '#fcdcc9', label: 'Area BASIN' }
      ]
    },
    signatureForecast: {
      path: 'signature_bmkg_forecast/MapServer',
      layerIds: [0],
      name: 'Signature Forecast',
      legendTitle: 'Signature Forecast BMKG',
      fields: ['published','id','type','category','impacted'],
      fieldLabels: { published: 'Published', id: 'ID', type: 'Tipe', category: 'Kategori', impacted: 'Dampak' },
      legendItems: [
        { color: '#e7d6fc', label: 'Area Prakiraan Dampak' }
      ]
    }
  };

  var _layers = {};
  var _popups = {};

  /* ── Legend helpers ── */
  function showLegend(key) {
    if (typeof addUnifiedLegend !== 'function') return;
    var svc = SERVICES[key];
    var div = document.createElement('div');
    div.className = 'bmkg-prod-legend';
    var html = '<div class="bmkg-prod-legend-title">' + svc.legendTitle + '</div>';
    html += '<div class="bmkg-prod-legend-items">';
    svc.legendItems.forEach(function (it) {
      html += '<div class="bmkg-prod-legend-item"><span class="bmkg-prod-swatch" style="background:' + it.color + '"></span>' + it.label + '</div>';
    });
    html += '</div>';
    html += '<div class="bmkg-prod-legend-source">Sumber: BMKG (datacuaca.bmkg.go.id)</div>';
    div.innerHTML = html;
    addUnifiedLegend('bmkg-prod-' + key, typeof createLegendWithToggle === 'function' ? createLegendWithToggle(div) : div);
  }

  function hideLegend(key) {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('bmkg-prod-' + key);
  }

  /* ── Popup via identify ── */
  function buildPopupHtml(svc, attrs) {
    var html = '<div class="' + POPUP_CLASS + '">';
    html += '<div class="bmkg-prod-popup-title">' + svc.name + '</div>';
    html += '<table class="bmkg-prod-popup-table">';
    svc.fields.forEach(function (f) {
      var val = attrs[f];
      if (val === undefined || val === null || val === '') return;
      var label = svc.fieldLabels[f] || f;
      if (f.indexOf('date') !== -1 || f.indexOf('waktu') !== -1 || f === 'published' || f === 'system_date') {
        if (typeof val === 'number') {
          val = new Date(val).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        }
      }
      html += '<tr><td class="bmkg-prod-popup-k">' + label + '</td><td class="bmkg-prod-popup-v">' + val + '</td></tr>';
    });
    html += '</table></div>';
    return html;
  }

  function queryIdentify(key, latlng) {
    var svc = SERVICES[key];
    var mapSize = map.getSize();
    var bounds = map.getBounds();
    var layerParam = svc.layerIds.map(function (id) { return id; }).join(',');
    var url = BASE + svc.path + '/identify?geometry=' + latlng.lng + ',' + latlng.lat +
      '&geometryType=esriGeometryPoint&sr=4326&layers=all:' + layerParam +
      '&tolerance=5&mapExtent=' + bounds.getWest() + ',' + bounds.getSouth() + ',' + bounds.getEast() + ',' + bounds.getNorth() +
      '&imageDisplay=' + mapSize.x + ',' + mapSize.y + ',96&returnGeometry=false&f=json';

    fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      if (!data || !data.results || data.results.length === 0) return;
      var attrs = data.results[0].attributes;
      var html = buildPopupHtml(svc, attrs);
      L.popup({ maxWidth: 340, className: POPUP_CLASS })
        .setLatLng(latlng)
        .setContent(html)
        .openOn(map);
    }).catch(function () {});
  }

  /* ── Toggle + click handler ── */
  function makeToggle(key) {
    var svc = SERVICES[key];
    window['toggleBmkgProd_' + key] = function (on) {
      if (on) {
        if (_layers[key]) return;
        _layers[key] = L.esri.dynamicMapLayer({
          url: BASE + svc.path,
          opacity: 0.6,
          layers: svc.layerIds,
          format: 'png32',
          transparent: true
        }).addTo(map);
        showLegend(key);
        _popups[key] = function (e) { queryIdentify(key, e.latlng); };
        map.on('click', _popups[key]);
      } else {
        if (_layers[key]) { map.removeLayer(_layers[key]); _layers[key] = null; }
        if (_popups[key]) { map.off('click', _popups[key]); _popups[key] = null; }
        hideLegend(key);
      }
    };
    window['isBmkgProd_' + key + '_Active'] = function () { return !!_layers[key]; };
  }

  Object.keys(SERVICES).forEach(makeToggle);

  window._bmkgProdResetAll = function () {
    Object.keys(SERVICES).forEach(function (k) {
      if (_layers[k]) { map.removeLayer(_layers[k]); _layers[k] = null; }
      if (_popups[k]) { map.off('click', _popups[k]); _popups[k] = null; }
      hideLegend(k);
    });
  };
})();
