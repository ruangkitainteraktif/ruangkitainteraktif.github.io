/* ═══════════════════════════════════════════════════════
   Layer Serangan OPT (Pertanian) — Sub-kategori per Hama
   Sumber: https://sig02.pertanian.go.id/server/rest/services/siperditan/Laporan_Serangan_OPT/MapServer
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var OPT_URL = 'https://sig02.pertanian.go.id/server/rest/services/siperditan/Laporan_Serangan_OPT/MapServer';

  var optLayers = {};
  var optPopup = null;
  var activePests = {};
  var optClickBound = false;

  var OPT_FIELD_LABELS = {
    FID: 'FID', PROV: 'Provinsi', KABKOT: 'Kab/Kota',
    Jan_T: 'Jan (T)', Feb_T: 'Feb (T)', Mar_T: 'Mar (T)', Apr_T: 'Apr (T)',
    Mei_T: 'Mei (T)', Jun_T: 'Jun (T)', Jul_T: 'Jul (T)', Agt_T: 'Agt (T)',
    Jan_P: 'Jan (P)', Feb_P: 'Feb (P)', Mar_P: 'Mar (P)', Apr_P: 'Apr (P)',
    Mei_P: 'Mei (P)', Jun_P: 'Jun (P)', Jul_P: 'Jul (P)', Agt_P: 'Agt (P)',
    'Jan_Agt_2026 T': 'Jan-Agt 2026 (T)', 'Jan_Agt_2026 P': 'Jan-Agt 2026 (P)',
    'Jan-Agt 2026 T': 'Jan-Agt 2026 (T)', 'Jan-Agt 2026 P': 'Jan-Agt 2026 (P)',
    'Jan_Agt_20': 'Jan-Agt 20 (T)', 'Jan_Agt_21': 'Jan-Agt 21 (T)'
  };

  function optFieldLabel(k) {
    if (OPT_FIELD_LABELS[k]) return OPT_FIELD_LABELS[k];
    return String(k).replace(/_/g, ' ');
  }

  function optLayerIdToKey(layerId) {
    var keys = Object.keys(OPT_PESTS);
    for (var i = 0; i < keys.length; i++) {
      if (OPT_PESTS[keys[i]].layerId === layerId) return keys[i];
    }
    return null;
  }

  /* ── Pest Config: key → { label, parentLayer, layerId, color, parentLabel } ── */
  var OPT_PESTS = {
    /* === PADI (parentLayer=0) === */
    'opt-padi-penggerek':    { label: 'Penggerek Batang',       parentLayer: 0, layerId: 1, color: '#dc2626', parentLabel: 'Padi' },
    'opt-padi-wbc':          { label: 'Wereng Batang Cokelat',   parentLayer: 0, layerId: 2, color: '#b91c1c', parentLabel: 'Padi' },
    'opt-padi-tikus':        { label: 'Tikus',                   parentLayer: 0, layerId: 3, color: '#991b1b', parentLabel: 'Padi' },
    'opt-padi-blas':         { label: 'Blas',                    parentLayer: 0, layerId: 4, color: '#7f1d1d', parentLabel: 'Padi' },
    'opt-padi-kresek':       { label: 'Kresek',                  parentLayer: 0, layerId: 5, color: '#b91c1c', parentLabel: 'Padi' },
    'opt-padi-tungro':       { label: 'Tungro',                  parentLayer: 0, layerId: 6, color: '#991b1b', parentLabel: 'Padi' },
    'opt-padi-kerdil':       { label: 'Kerdil Rumput',           parentLayer: 0, layerId: 7, color: '#7f1d1d', parentLabel: 'Padi' },
    /* === JAGUNG (parentLayer=8) === */
    'opt-jagung-lalat':      { label: 'Lalat Bibit',             parentLayer: 8, layerId: 9, color: '#f59e0b', parentLabel: 'Jagung' },
    'opt-jagung-penggerek':  { label: 'Penggerek Batang',        parentLayer: 8, layerId: 10, color: '#d97706', parentLabel: 'Jagung' },
    'opt-jagung-tikus':      { label: 'Tikus',                   parentLayer: 8, layerId: 11, color: '#b45309', parentLabel: 'Jagung' },
    'opt-jagung-blay':       { label: 'Blai',                    parentLayer: 8, layerId: 12, color: '#92400e', parentLabel: 'Jagung' },
    'opt-jagung-penggerek-tongkol': { label: 'Penggerek Tongkol', parentLayer: 8, layerId: 13, color: '#d97706', parentLabel: 'Jagung' },
    'opt-jagung-ulat-litura':    { label: 'Ulat Grayak Litura',  parentLayer: 8, layerId: 14, color: '#b45309', parentLabel: 'Jagung' },
    'opt-jagung-ulat-frugiperda': { label: 'Ulat Grayak Frugiperda', parentLayer: 8, layerId: 15, color: '#92400e', parentLabel: 'Jagung' },
    /* === KEDELAI (parentLayer=16) === */
    'opt-kedelai-tikus':     { label: 'Tikus',                   parentLayer: 16, layerId: 17, color: '#059669', parentLabel: 'Kedelai' },
    'opt-kedelai-penggerek-polong': { label: 'Penggerek Polong', parentLayer: 16, layerId: 18, color: '#047857', parentLabel: 'Kedelai' },
    'opt-kedelai-penggulung':   { label: 'Penggulung Daun',     parentLayer: 16, layerId: 19, color: '#065f46', parentLabel: 'Kedelai' },
    'opt-kedelai-ulat-litura':  { label: 'Ulat Grayak Litura',  parentLayer: 16, layerId: 20, color: '#047857', parentLabel: 'Kedelai' },
    'opt-kedelai-ulat-jengkal': { label: 'Ulat Jengkal',        parentLayer: 16, layerId: 21, color: '#065f46', parentLabel: 'Kedelai' }
  };

  /* ── Category grouping for legend ── */
  var OPT_CATEGORIES = {
    'Padi':    ['opt-padi-penggerek', 'opt-padi-wbc', 'opt-padi-tikus', 'opt-padi-blas', 'opt-padi-kresek', 'opt-padi-tungro', 'opt-padi-kerdil'],
    'Jagung':  ['opt-jagung-lalat', 'opt-jagung-penggerek', 'opt-jagung-tikus', 'opt-jagung-blay', 'opt-jagung-penggerek-tongkol', 'opt-jagung-ulat-litura', 'opt-jagung-ulat-frugiperda'],
    'Kedelai': ['opt-kedelai-tikus', 'opt-kedelai-penggerek-polong', 'opt-kedelai-penggulung', 'opt-kedelai-ulat-litura', 'opt-kedelai-ulat-jengkal']
  };

  function toggleOPTPest(pestKey, visible) {
    var cfg = OPT_PESTS[pestKey];
    if (!cfg) return;

    if (visible) {
      if (optLayers[pestKey] && window.map && window.map.hasLayer(optLayers[pestKey])) {
        activePests[pestKey] = true;
        ensureOptClickHandler();
        return;
      }
      if (typeof L === 'undefined' || !L.esri || !L.esri.dynamicMapLayer) {
        if (typeof window.showMapToast === 'function') {
          window.showMapToast('Pustaka esri-leaflet tidak tersedia.', 'error');
        }
        return;
      }
      try {
        var layer = L.esri.dynamicMapLayer({
          url: OPT_URL,
          opacity: 0.75,
          layers: [cfg.layerId],
          f: 'image'
        }).addTo(window.map);
        optLayers[pestKey] = layer;
        activePests[pestKey] = true;
        ensureOptClickHandler();
        showOPTLegend(pestKey);
      } catch (err) {
        console.warn('Gagal memuat layer ' + pestKey + ':', err);
        if (typeof window.showMapToast === 'function') {
          window.showMapToast('Data Serangan OPT ' + cfg.label + ' tidak tersedia.', 'error');
        }
      }
    } else {
      if (optLayers[pestKey] && window.map && window.map.hasLayer(optLayers[pestKey])) {
        window.map.removeLayer(optLayers[pestKey]);
      }
      delete activePests[pestKey];
      if (!Object.keys(activePests).length) removeOptClickHandler();
      hideOPTLegend(pestKey);
      if (optPopup && window.map) {
        window.map.removeLayer(optPopup);
        optPopup = null;
      }
    }
  }

  /* esri-leaflet dynamicMapLayer does not fire 'click' — use map click + /identify */
  function ensureOptClickHandler() {
    if (optClickBound || !window.map) return;
    window.map.on('click', onOptMapClick);
    optClickBound = true;
  }
  function removeOptClickHandler() {
    if (!optClickBound || !window.map) return;
    window.map.off('click', onOptMapClick);
    optClickBound = false;
  }

  function onOptMapClick(e) {
    var keys = Object.keys(activePests);
    if (!keys.length || !window.map) return;
    var layerIds = keys.map(function (k) { return OPT_PESTS[k].layerId; });
    var map = window.map;
    var size = map.getSize();
    var bounds = map.getBounds();
    var geom = JSON.stringify({
      x: e.latlng.lng,
      y: e.latlng.lat,
      spatialReference: { wkid: 4326 }
    });
    var url = OPT_URL + '/identify'
      + '?geometry=' + encodeURIComponent(geom)
      + '&geometryType=esriGeometryPoint'
      + '&sr=4326'
      + '&layers=' + encodeURIComponent('visible:' + layerIds.join(','))
      + '&tolerance=4'
      + '&mapExtent=' + [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(',')
      + '&imageDisplay=' + size.x + ',' + size.y + ',96'
      + '&returnGeometry=false'
      + '&f=json';

    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var results = (data && data.results) || [];
        if (!results.length) return;
        showOPTPopup(e.latlng, results);
      })
      .catch(function () { /* silent */ });
  }

  function showOPTPopup(latlng, results) {
    if (optPopup) { window.map.removeLayer(optPopup); optPopup = null; }
    var grouped = {};
    results.forEach(function (r) {
      var key = optLayerIdToKey(r.layerId);
      if (!key) return;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    });
    var h = '<div style="font-size:11px;max-height:280px;overflow:auto;">';
    Object.keys(grouped).forEach(function (key) {
      var cfg = OPT_PESTS[key];
      grouped[key].forEach(function (r) {
        h += '<div style="margin-top:6px;">';
        h += '<strong style="font-size:12px;color:#1e293b;">' + cfg.label + ' (' + cfg.parentLabel + ')</strong>';
        var attrs = r.attributes || {};
        var row = {};
        Object.keys(attrs).forEach(function (k) {
          if (k.toLowerCase().indexOf('shape') === -1) row[k] = attrs[k];
        });
        h += makeOPTDetailTable([row]);
        h += '</div>';
      });
    });
    h += '</div>';
    optPopup = L.popup({ maxWidth: 360, closeButton: true })
      .setLatLng(latlng)
      .setContent(h)
      .addTo(window.map);
  }

  function makeOPTDetailTable(rows) {
    if (!rows.length) return '<em style="font-size:11px;">Tidak ada data.</em>';
    var keys = Object.keys(rows[0]);
    var h = '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
    h += '<thead><tr>';
    keys.forEach(function (k) {
      h += '<th style="text-align:left;padding:5px 6px;border-bottom:2px solid #e5e7eb;color:#64748b;font-weight:600;white-space:nowrap;">' + optFieldLabel(k) + '</th>';
    });
    h += '</tr></thead><tbody>';
    rows.forEach(function (r, i) {
      h += '<tr style="background:' + (i % 2 ? '#f9fafb' : '#fff') + ';">';
      keys.forEach(function (k) {
        var val = r[k] != null ? r[k] : '-';
        if (typeof val === 'number') val = val.toLocaleString('id-ID');
        h += '<td style="padding:4px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">' + val + '</td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table>';
    return h;
  }

  /* ── Expose toggle functions globally ── */
  window.toggleOPTPest = toggleOPTPest;
  Object.keys(OPT_PESTS).forEach(function (key) {
    window['toggleOPT' + key.charAt(0).toUpperCase() + key.slice(1)] = function (v) { toggleOPTPest(key, v); };
  });

  /* ── Legend ── */
  function showOPTLegend(pestKey) {
    if (typeof addUnifiedLegend !== 'function') return;
    var cfg = OPT_PESTS[pestKey];
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
    addUnifiedLegend('opt-' + pestKey, typeof createLegendWithToggle === 'function' ? createLegendWithToggle(el) : el);
  }
  function hideOPTLegend(pestKey) {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('opt-' + pestKey);
  }

  /* ── Attribute Table ── */
  var OPT_ATTR_DATA = {};
  Object.keys(OPT_PESTS).forEach(function (key) {
    var cfg = OPT_PESTS[key];
    OPT_ATTR_DATA[key] = { name: cfg.label + ' (' + cfg.parentLabel + ')', type: 'arcgis', url: OPT_URL + '/' + cfg.layerId + '/query', outFields: ['*'], props: [], noPagination: true };
  });
  window.OPT_ATTR_DATA = OPT_ATTR_DATA;

  window.getOPTAttributeData = function (pestKey, cb) {
    var cfg = OPT_PESTS[pestKey];
    if (!cfg || !window.map) return;
    var bounds = window.map.getBounds();
    var geom = JSON.stringify({
      xmin: bounds.getWest(),
      ymin: bounds.getSouth(),
      xmax: bounds.getEast(),
      ymax: bounds.getNorth(),
      spatialReference: { wkid: 4326 }
    });
    var url = OPT_URL + '/' + cfg.layerId + '/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=json&geometry=' + encodeURIComponent(geom) + '&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects';
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) { cb(null, data); })
      .catch(function (e) { cb(e, null); });
  };
})();
