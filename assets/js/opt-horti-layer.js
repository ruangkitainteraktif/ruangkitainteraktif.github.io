/* ═══════════════════════════════════════════════════════
   Layer Rekap Serangan OPT Hortikultura (Pertanian)
   Sumber: https://sig02.pertanian.go.id/server/rest/services/siperditan/Laporan_Serangan_OPT_Horti/MapServer
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SERVICE_URL = 'https://sig02.pertanian.go.id/server/rest/services/siperditan/Laporan_Serangan_OPT_Horti/MapServer';

  var OPTH_LAYERS = {};
  /* === ANEKA CABAI (parentLayer=0) === */
  OPTH_LAYERS['opth-cabai-antraknosa'] = { label: 'Antraknosa (Colletotrichum spp.)', parentLayer: 0, layerId: 1, color: '#dc2626', parentLabel: 'Aneka Cabai' };
  OPTH_LAYERS['opth-cabai-lalat-buah'] = { label: 'Lalat Buah (Bactrocera spp.)', parentLayer: 0, layerId: 2, color: '#b91c1c', parentLabel: 'Aneka Cabai' };
  OPTH_LAYERS['opth-cabai-layu-fusarium'] = { label: 'Layu Fusarium (Fusarium oxysporum)', parentLayer: 0, layerId: 3, color: '#991b1b', parentLabel: 'Aneka Cabai' };
  OPTH_LAYERS['opth-cabai-trips'] = { label: 'Trips (Thrips spp.)', parentLayer: 0, layerId: 4, color: '#7f1d1d', parentLabel: 'Aneka Cabai' };
  OPTH_LAYERS['opth-cabai-virus-keriting'] = { label: 'Virus Keriting', parentLayer: 0, layerId: 5, color: '#b91c1c', parentLabel: 'Aneka Cabai' };
  OPTH_LAYERS['opth-cabai-virus-kuning'] = { label: 'Virus Kuning', parentLayer: 0, layerId: 6, color: '#991b1b', parentLabel: 'Aneka Cabai' };
  /* === BAWANG MERAH (parentLayer=7) === */
  OPTH_LAYERS['opth-bawang-merah-embun-tepung'] = { label: 'Embun Tepung (Perenospora destructor)', parentLayer: 7, layerId: 8, color: '#b45309', parentLabel: 'Bawang Merah' };
  OPTH_LAYERS['opth-bawang-merah-lalat-pengorok-daun'] = { label: 'Lalat Pengorok Daun (Liriomyza sp.)', parentLayer: 7, layerId: 9, color: '#d97706', parentLabel: 'Bawang Merah' };
  OPTH_LAYERS['opth-bawang-merah-mati-pucuk'] = { label: 'Mati Pucuk (Phytophora sp.)', parentLayer: 7, layerId: 10, color: '#a16207', parentLabel: 'Bawang Merah' };
  OPTH_LAYERS['opth-bawang-merah-trotol-bercak-ungu'] = { label: 'Trotol/Bercak Ungu (Alternaria porri)', parentLayer: 7, layerId: 11, color: '#92400e', parentLabel: 'Bawang Merah' };
  OPTH_LAYERS['opth-bawang-merah-ulat-bawang'] = { label: 'Ulat Bawang (Spodoptera exigua)', parentLayer: 7, layerId: 12, color: '#b45309', parentLabel: 'Bawang Merah' };

  var renderedLayers = {};
  var activeLayers = {};
  var popup = null;
  var clickBound = false;

  function esc(value) {
    return String(value == null ? '-' : value).replace(/[&<>'"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c];
    });
  }

  function configByLayerId(id) {
    var keys = Object.keys(OPTH_LAYERS);
    for (var i = 0; i < keys.length; i++) {
      if (OPTH_LAYERS[keys[i]].layerId === id) return OPTH_LAYERS[keys[i]];
    }
    return null;
  }

  function toggleOPTHorti(key, visible) {
    var cfg = OPTH_LAYERS[key];
    if (!cfg || !window.map) return;
    if (visible) {
      if (typeof L === 'undefined' || !L.esri || !L.esri.dynamicMapLayer) {
        if (typeof window.showMapToast === 'function') {
          window.showMapToast('Pustaka esri-leaflet tidak tersedia.', 'error');
        }
        return;
      }
      try {
        if (!renderedLayers[key]) {
          renderedLayers[key] = L.esri.dynamicMapLayer({
            url: SERVICE_URL,
            layers: [cfg.layerId],
            opacity: 0.75,
            f: 'image'
          });
        }
        if (!window.map.hasLayer(renderedLayers[key])) renderedLayers[key].addTo(window.map);
        activeLayers[key] = true;
        addLegend(key);
        bindClick();
      } catch (err) {
        console.warn('Gagal memuat layer ' + key + ':', err);
        if (typeof window.showMapToast === 'function') {
          window.showMapToast('Data OPT Horti ' + cfg.label + ' tidak tersedia.', 'error');
        }
      }
    } else {
      if (renderedLayers[key] && window.map.hasLayer(renderedLayers[key])) {
        window.map.removeLayer(renderedLayers[key]);
      }
      delete activeLayers[key];
      removeLegend(key);
      if (!Object.keys(activeLayers).length) unbindClick();
      if (popup && window.map) {
        window.map.removeLayer(popup);
        popup = null;
      }
    }
  }

  function bindClick() {
    if (!clickBound && window.map) {
      window.map.on('click', onOpthMapClick);
      clickBound = true;
    }
  }
  function unbindClick() {
    if (clickBound && window.map) {
      window.map.off('click', onOpthMapClick);
      clickBound = false;
    }
  }

  function onOpthMapClick(e) {
    var keys = Object.keys(activeLayers);
    if (!keys.length || !window.map) return;
    var layerIds = keys.map(function (k) { return OPTH_LAYERS[k].layerId; });
    var size = window.map.getSize();
    var bounds = window.map.getBounds();
    var geometry = JSON.stringify({ x: e.latlng.lng, y: e.latlng.lat, spatialReference: { wkid: 4326 } });
    var url = SERVICE_URL + '/identify?geometry=' + encodeURIComponent(geometry)
      + '&geometryType=esriGeometryPoint&sr=4326&layers=' + encodeURIComponent('visible:' + layerIds.join(','))
      + '&tolerance=4&mapExtent=' + [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(',')
      + '&imageDisplay=' + size.x + ',' + size.y + ',96&returnGeometry=false&f=json';
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.results && data.results.length) showPopup(e.latlng, data.results);
      })
      .catch(function () { /* silent */ });
  }

  function showPopup(latlng, results) {
    if (popup && window.map) window.map.removeLayer(popup);
    var grouped = {};
    results.forEach(function (r) {
      var cfg = configByLayerId(r.layerId);
      if (!cfg) return;
      if (!grouped[r.layerId]) grouped[r.layerId] = { cfg: cfg, rows: [] };
      grouped[r.layerId].rows.push(r);
    });
    var html = '<div style="font-size:11px;max-height:280px;overflow:auto;">';
    Object.keys(grouped).forEach(function (lid) {
      var g = grouped[lid];
      html += '<div style="margin-top:6px;">';
      html += '<strong style="font-size:12px;color:#1e293b;">' + esc(g.cfg.label) + ' (' + esc(g.cfg.parentLabel) + ')</strong>';
      g.rows.forEach(function (r) {
        var attrs = r.attributes || {};
        var keys = Object.keys(attrs).filter(function (k) { return k.toLowerCase().indexOf('shape') === -1; });
        if (!keys.length) return;
        html += '<table style="width:100%;border-collapse:collapse;font-size:11px;margin-top:3px;">';
        keys.forEach(function (k, i) {
          var val = attrs[k];
          if (typeof val === 'number') val = val.toLocaleString('id-ID');
          html += '<tr style="background:' + (i % 2 ? '#f9fafb' : '#fff') + ';">'
            + '<td style="padding:3px 6px;color:#64748b;white-space:nowrap;">' + esc(k) + '</td>'
            + '<td style="padding:3px 6px;color:#334155;">' + esc(val) + '</td></tr>';
        });
        html += '</table>';
      });
      html += '</div>';
    });
    html += '</div>';
    popup = L.popup({ maxWidth: 360, closeButton: true }).setLatLng(latlng).setContent(html).addTo(window.map);
  }

  function addLegend(key) {
    if (typeof addUnifiedLegend !== 'function') return;
    var cfg = OPTH_LAYERS[key];
    if (!cfg) return;
    var el = L.DomUtil.create('div', 'omi-legend leaflet-bar');
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
    var titleEl = L.DomUtil.create('div', 'omi-legend-title', el);
    titleEl.textContent = cfg.label + ' (' + cfg.parentLabel + ')';
    var bar = L.DomUtil.create('div', 'himawari-legend-bar', el);
    bar.style.background = 'linear-gradient(90deg,' + cfg.color + '88,' + cfg.color + ')';
    bar.style.height = '14px';
    bar.style.borderRadius = '3px';
    var infoRow = L.DomUtil.create('div', 'himawari-legend-unit', el);
    infoRow.textContent = 'Sumber: KEMENTAN / siperditan';
    addUnifiedLegend(key, typeof createLegendWithToggle === 'function' ? createLegendWithToggle(el) : el);
  }
  function removeLegend(key) {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend(key);
  }

  /* ── Attribute Table ── */
  var OPTH_ATTR_DATA = {};
  Object.keys(OPTH_LAYERS).forEach(function (key) {
    var cfg = OPTH_LAYERS[key];
    OPTH_ATTR_DATA[key] = {
      name: 'OPT Horti: ' + cfg.label + ' (' + cfg.parentLabel + ')',
      type: 'arcgis',
      url: SERVICE_URL + '/' + cfg.layerId + '/query',
      outFields: ['*'],
      props: [],
      noPagination: true
    };
  });

  window.OPTH_ATTR_DATA = OPTH_ATTR_DATA;
  window.OPTH_LAYER_IDS = Object.keys(OPTH_LAYERS);
  window.toggleOPTHorti = toggleOPTHorti;
})();
