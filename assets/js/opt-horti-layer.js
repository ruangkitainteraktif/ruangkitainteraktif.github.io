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
  var highlight = null;
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
      if (highlight && window.map) {
        window.map.removeLayer(highlight);
        highlight = null;
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
      /* tolerance=0: server identify SIPERDITAN membalas ratusan fitur
         se-Indonesia bila tolerance dinaikkan. maxAllowableOffset
         menyederhanakan geometri (~55 m) supaya payload ringan. */
      + '&tolerance=0&mapExtent=' + [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(',')
      + '&imageDisplay=' + size.x + ',' + size.y + ',96&returnGeometry=true&maxAllowableOffset=0.0005&f=json';
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.results && data.results.length) showPopup(e.latlng, data.results);
      })
      .catch(function () { /* silent */ });
  }

  function fieldLabel(k) {
    var known = { FID: 'FID', PROV: 'Provinsi', KABKOT: 'Kab/Kota', PB: 'Kategori' };
    return known[k] || String(k).replace(/_/g, ' ');
  }

  /* Template .agol-popup dipakai semua card di panel Detail Layer: header
     badge/judul, body berisi baris atribut, lalu footer sumber. Panel Detail
     Layer mengubah .agol-popup-fields menjadi tabel dua kolom, jadi atribut
     tidak boleh dirender sebagai <table> yang digulir sendiri di dalam popup. */
  function optPopupCard(cfg, attrs) {
    var fields = '';
    Object.keys(attrs).forEach(function (k) {
      var val = attrs[k];
      if (val == null || val === '') return;
      if (typeof val === 'number') val = val.toLocaleString('id-ID');
      fields += '<div class="agol-popup-field">'
        + '<span class="agol-popup-field-label">' + esc(fieldLabel(k)) + '</span>'
        + '<span class="agol-popup-field-value">' + esc(String(val)) + '</span>'
        + '</div>';
    });
    if (!fields) {
      fields = '<div class="agol-popup-field"><span class="agol-popup-field-value">Tidak ada atribut.</span></div>';
    }
    return '<div class="agol-popup">'
      + '<div class="agol-popup-header agol-geo-kawasan">'
      + '<div class="agol-popup-badge"><span class="agol-popup-badge-dot" style="background:' + esc(cfg.color) + ';"></span>KEMENTAN</div>'
      + '<div class="agol-popup-title">' + esc(cfg.label + ' (' + cfg.parentLabel + ')') + '</div>'
      + '</div>'
      + '<div class="agol-popup-body"><div class="agol-popup-fields">' + fields + '</div></div>'
      + '<div class="agol-popup-footer"><span>Sumber: KEMENTAN / siperditan &mdash; Laporan Serangan OPT Horti</span></div>'
      + '</div>';
  }

  /* ── Sorot polygon fitur yang sedang dilihat ──
     Geometri ring Esri dikonversi via L.esri.Util.arcgisToGeoJSON dengan
     fallback manual; gaya oranye putus-putus mengikuti sorotan persil. */
  function drawHighlight(latlng, results) {
    if (highlight && window.map) { window.map.removeLayer(highlight); highlight = null; }
    if (!window.map || typeof L === 'undefined') return;
    var style = { color: '#FFAA00', weight: 2, fill: false, dashArray: '4 3' };
    var group = null;
    results.forEach(function (r) {
      var geometry = r && r.geometry;
      if (!geometry || !geometry.rings || !geometry.rings.length) return;
      if (!group) group = L.featureGroup();
      try {
        if (L.esri && L.esri.Util && typeof L.esri.Util.arcgisToGeoJSON === 'function') {
          var feature = L.esri.Util.arcgisToGeoJSON({ geometry: geometry, attributes: r.attributes || {} });
          if (feature && feature.type === 'Feature') {
            L.geoJSON(feature, { style: style }).addTo(group);
            return;
          }
        }
      } catch (err) { /* geometri tidak valid: pakai fallback di bawah */ }
      try {
        L.polygon(geometry.rings.map(function (ring) {
          return ring.map(function (p) { return [p[1], p[0]]; });
        }), style).addTo(group);
      } catch (err2) { /* ring tidak valid: abaikan fitur ini */ }
    });
    if (group && group.getLayers().length) {
      group.addTo(window.map);
      highlight = group;
      return;
    }
    /* Tanpa geometri: pasang marker di titik klik sebagai penanda lokasi. */
    highlight = L.circleMarker(latlng, {
      radius: 8, color: '#FFAA00', weight: 2, fillColor: '#FFAA00', fillOpacity: 0.35
    }).addTo(window.map);
  }

  function showPopup(latlng, results) {
    if (popup && window.map) window.map.removeLayer(popup);
    drawHighlight(latlng, results);
    var grouped = {};
    results.forEach(function (r) {
      var cfg = configByLayerId(r.layerId);
      if (!cfg) return;
      if (!grouped[r.layerId]) grouped[r.layerId] = { cfg: cfg, rows: [] };
      grouped[r.layerId].rows.push(r);
    });
    var cards = [];
    Object.keys(grouped).forEach(function (lid) {
      var g = grouped[lid];
      g.rows.forEach(function (r) {
        var attrs = r.attributes || {};
        var clean = {};
        Object.keys(attrs).forEach(function (k) {
          if (k.toLowerCase().indexOf('shape') === -1) clean[k] = attrs[k];
        });
        cards.push(optPopupCard(g.cfg, clean));
      });
    });
    if (!cards.length) return;
    var html = cards.join('');
    /* Satu klik bisa menyentuh lebih dari satu OPT; bungkus dengan daftar
       persil supaya kartu terpisah rapi, persis pola map-core.js. */
    if (cards.length > 1) html = '<div class="bhumi-persil-list">' + html + '</div>';
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
  /* Panel Detail Layer memanggil cleanup ini saat ditutup (map-core.js). */
  (window.catalogHighlightCleanups = window.catalogHighlightCleanups || []).push(function () {
    if (highlight && window.map) { window.map.removeLayer(highlight); highlight = null; }
  });
})();
