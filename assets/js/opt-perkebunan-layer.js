/* ═══════════════════════════════════════════════════════
   Layer Kategori Endemis OPT Perkebunan (Pertanian)
   Sumber: https://sig02.pertanian.go.id/server/rest/services/siperditan/Kategori_Endemis_OPT_Perkebunan/MapServer
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SERVICE_URL = 'https://sig02.pertanian.go.id/server/rest/services/siperditan/Kategori_Endemis_OPT_Perkebunan/MapServer';

  var OPTP_LAYERS = {};
  /* === Cengkeh (parentLayer=0) === */
  OPTP_LAYERS['optp-cengkeh-penggerek-batang'] = { label: 'Penggerek Batang (Nothopeus sp.)', parentLayer: 0, layerId: 1, color: '#0f766e', parentLabel: 'Cengkeh' };
  /* === Jambu Mete (parentLayer=2) === */
  OPTP_LAYERS['optp-jambu-mete-ulat-kipat'] = { label: 'Ulat Kipat', parentLayer: 2, layerId: 3, color: '#b45309', parentLabel: 'Jambu Mete' };
  OPTP_LAYERS['optp-jambu-mete-kepik-penghisap'] = { label: 'Kepik Penghisap (Helopeltis sp.)', parentLayer: 2, layerId: 4, color: '#b45309', parentLabel: 'Jambu Mete' };
  OPTP_LAYERS['optp-jambu-mete-wereng-pucuk'] = { label: 'Wereng Pucuk (Sanurus sp.)', parentLayer: 2, layerId: 5, color: '#b45309', parentLabel: 'Jambu Mete' };
  /* === Kakao (parentLayer=6) === */
  OPTP_LAYERS['optp-kakao-penggerek-buah-kakao'] = { label: 'Penggerek Buah Kakao', parentLayer: 6, layerId: 7, color: '#7c2d12', parentLabel: 'Kakao' };
  OPTP_LAYERS['optp-kakao-kepik-penghisap-buah'] = { label: 'Kepik Penghisap Buah (Helopeltis sp.)', parentLayer: 6, layerId: 8, color: '#7c2d12', parentLabel: 'Kakao' };
  OPTP_LAYERS['optp-kakao-penyakit-vascular-streak-dieback'] = { label: 'Penyakit Vascular Streak Dieback (VSD)', parentLayer: 6, layerId: 9, color: '#7c2d12', parentLabel: 'Kakao' };
  OPTP_LAYERS['optp-kakao-penyakit-busuk-buah'] = { label: 'Penyakit Busuk Buah', parentLayer: 6, layerId: 10, color: '#7c2d12', parentLabel: 'Kakao' };
  /* === Kapas (parentLayer=11) === */
  OPTP_LAYERS['optp-kapas-heliothis-sp'] = { label: 'Heliothis sp.', parentLayer: 11, layerId: 12, color: '#a16207', parentLabel: 'Kapas' };
  /* === Karet (parentLayer=13) === */
  OPTP_LAYERS['optp-karet-jamur-akar-putih'] = { label: 'Jamur Akar Putih', parentLayer: 13, layerId: 14, color: '#166534', parentLabel: 'Karet' };
  OPTP_LAYERS['optp-karet-gugur-daun-pestalotiopsis'] = { label: 'Gugur Daun Pestalotiopsis', parentLayer: 13, layerId: 15, color: '#166534', parentLabel: 'Karet' };
  OPTP_LAYERS['optp-karet-gugur-daun-colletotrichum'] = { label: 'Gugur Daun Colletotrichum', parentLayer: 13, layerId: 16, color: '#166534', parentLabel: 'Karet' };
  OPTP_LAYERS['optp-karet-penyakit-bidang-sadap'] = { label: 'Penyakit Bidang Sadap', parentLayer: 13, layerId: 17, color: '#166534', parentLabel: 'Karet' };
  OPTP_LAYERS['optp-karet-jamur-upas'] = { label: 'Jamur Upas', parentLayer: 13, layerId: 18, color: '#166534', parentLabel: 'Karet' };
  OPTP_LAYERS['optp-karet-rayap'] = { label: 'Rayap', parentLayer: 13, layerId: 19, color: '#166534', parentLabel: 'Karet' };
  /* === Kelapa (parentLayer=20) === */
  OPTP_LAYERS['optp-kelapa-oryctes-rhinoceros'] = { label: 'Oryctes rhinoceros', parentLayer: 20, layerId: 21, color: '#0e7490', parentLabel: 'Kelapa' };
  OPTP_LAYERS['optp-kelapa-brontispa-longissima'] = { label: 'Brontispa longissima', parentLayer: 20, layerId: 22, color: '#0e7490', parentLabel: 'Kelapa' };
  OPTP_LAYERS['optp-kelapa-belalang-padang'] = { label: 'Belalang Padang (Sexava spp.)', parentLayer: 20, layerId: 23, color: '#0e7490', parentLabel: 'Kelapa' };
  OPTP_LAYERS['optp-kelapa-aspidiotus-destructor'] = { label: 'Aspidiotus destructor', parentLayer: 20, layerId: 24, color: '#0e7490', parentLabel: 'Kelapa' };
  OPTP_LAYERS['optp-kelapa-busuk-pucuk-kelapa'] = { label: 'Busuk Pucuk Kelapa (Phytophthora palmivora)', parentLayer: 20, layerId: 25, color: '#0e7490', parentLabel: 'Kelapa' };
  /* === Kelapa Sawit (parentLayer=26) === */
  OPTP_LAYERS['optp-kelapa-sawit-ulat-api'] = { label: 'Ulat Api', parentLayer: 26, layerId: 27, color: '#c2410c', parentLabel: 'Kelapa Sawit' };
  OPTP_LAYERS['optp-kelapa-sawit-babi-hutan'] = { label: 'Babi Hutan', parentLayer: 26, layerId: 28, color: '#c2410c', parentLabel: 'Kelapa Sawit' };
  OPTP_LAYERS['optp-kelapa-sawit-tikus'] = { label: 'Tikus', parentLayer: 26, layerId: 29, color: '#c2410c', parentLabel: 'Kelapa Sawit' };
  OPTP_LAYERS['optp-kelapa-sawit-busuk-pangkal-batang'] = { label: 'Busuk Pangkal Batang', parentLayer: 26, layerId: 30, color: '#c2410c', parentLabel: 'Kelapa Sawit' };
  /* === Kopi (parentLayer=31) === */
  OPTP_LAYERS['optp-kopi-penggerek-batang-kopi'] = { label: 'Penggerek Batang Kopi', parentLayer: 31, layerId: 32, color: '#3f6212', parentLabel: 'Kopi' };
  OPTP_LAYERS['optp-kopi-karat-daun'] = { label: 'Karat daun (Hemileia vastatrix)', parentLayer: 31, layerId: 33, color: '#3f6212', parentLabel: 'Kopi' };
  OPTP_LAYERS['optp-kopi-kutu-putih'] = { label: 'Kutu Putih', parentLayer: 31, layerId: 34, color: '#3f6212', parentLabel: 'Kopi' };
  /* === Lada (parentLayer=35) === */
  OPTP_LAYERS['optp-lada-busuk-pangkal-batang'] = { label: 'Busuk Pangkal Batang', parentLayer: 35, layerId: 36, color: '#9f1239', parentLabel: 'Lada' };
  OPTP_LAYERS['optp-lada-dasynus-piperis'] = { label: 'Dasynus piperis', parentLayer: 35, layerId: 37, color: '#9f1239', parentLabel: 'Lada' };
  OPTP_LAYERS['optp-lada-lophobaris-piperis'] = { label: 'Lophobaris piperis', parentLayer: 35, layerId: 38, color: '#9f1239', parentLabel: 'Lada' };
  OPTP_LAYERS['optp-lada-penyakit-kuning'] = { label: 'Penyakit Kuning (nematoda)', parentLayer: 35, layerId: 39, color: '#9f1239', parentLabel: 'Lada' };
  OPTP_LAYERS['optp-lada-keriting-daun'] = { label: 'Keriting Daun', parentLayer: 35, layerId: 40, color: '#9f1239', parentLabel: 'Lada' };
  OPTP_LAYERS['optp-lada-jamur-pirang'] = { label: 'Jamur Pirang', parentLayer: 35, layerId: 41, color: '#9f1239', parentLabel: 'Lada' };
  /* === Nilam (parentLayer=42) === */
  OPTP_LAYERS['optp-nilam-ulat-daun'] = { label: 'Ulat Daun', parentLayer: 42, layerId: 43, color: '#4d7c0f', parentLabel: 'Nilam' };
  OPTP_LAYERS['optp-nilam-budok'] = { label: 'Budok', parentLayer: 42, layerId: 44, color: '#4d7c0f', parentLabel: 'Nilam' };
  OPTP_LAYERS['optp-nilam-busuk-batang'] = { label: 'Busuk Batang', parentLayer: 42, layerId: 45, color: '#4d7c0f', parentLabel: 'Nilam' };
  OPTP_LAYERS['optp-nilam-belalang'] = { label: 'Belalang', parentLayer: 42, layerId: 46, color: '#4d7c0f', parentLabel: 'Nilam' };
  /* === Pala (parentLayer=47) === */
  OPTP_LAYERS['optp-pala-penyakit-busuk-buah'] = { label: 'Penyakit Busuk Buah', parentLayer: 47, layerId: 48, color: '#7e22ce', parentLabel: 'Pala' };
  OPTP_LAYERS['optp-pala-hama-penggerek-batang'] = { label: 'Hama Penggerek Batang', parentLayer: 47, layerId: 49, color: '#7e22ce', parentLabel: 'Pala' };
  /* === Sagu (parentLayer=50) === */
  OPTP_LAYERS['optp-sagu-oryctes-rhinoceros'] = { label: 'Oryctes rhinoceros', parentLayer: 50, layerId: 51, color: '#0369a1', parentLabel: 'Sagu' };
  OPTP_LAYERS['optp-sagu-babi-hutan'] = { label: 'Babi Hutan', parentLayer: 50, layerId: 52, color: '#0369a1', parentLabel: 'Sagu' };
  OPTP_LAYERS['optp-sagu-artona-catoxantha'] = { label: 'Artona catoxantha', parentLayer: 50, layerId: 53, color: '#0369a1', parentLabel: 'Sagu' };
  /* === Tebu (parentLayer=54) === */
  OPTP_LAYERS['optp-tebu-tikus'] = { label: 'Tikus (Rattus sp.)', parentLayer: 54, layerId: 55, color: '#a21caf', parentLabel: 'Tebu' };
  OPTP_LAYERS['optp-tebu-uret'] = { label: 'Uret (Lepidiota stigma)', parentLayer: 54, layerId: 56, color: '#a21caf', parentLabel: 'Tebu' };
  OPTP_LAYERS['optp-tebu-penggerek-pucuk'] = { label: 'Penggerek Pucuk (Scirpophaga sp.)', parentLayer: 54, layerId: 57, color: '#a21caf', parentLabel: 'Tebu' };
  OPTP_LAYERS['optp-tebu-penggerek-batang'] = { label: 'Penggerek Batang (Chilo sp.)', parentLayer: 54, layerId: 58, color: '#a21caf', parentLabel: 'Tebu' };
  OPTP_LAYERS['optp-tebu-luka-api'] = { label: 'Luka Api', parentLayer: 54, layerId: 59, color: '#a21caf', parentLabel: 'Tebu' };
  /* === Teh (parentLayer=60) === */
  OPTP_LAYERS['optp-teh-helopeltis-sp'] = { label: 'Helopeltis sp.', parentLayer: 60, layerId: 61, color: '#15803d', parentLabel: 'Teh' };
  OPTP_LAYERS['optp-teh-cacar-daun-teh'] = { label: 'Cacar Daun Teh', parentLayer: 60, layerId: 62, color: '#15803d', parentLabel: 'Teh' };
  OPTP_LAYERS['optp-teh-wereng-pucuk-teh'] = { label: 'Wereng Pucuk Teh', parentLayer: 60, layerId: 63, color: '#15803d', parentLabel: 'Teh' };
  /* === Tembakau (parentLayer=64) === */
  OPTP_LAYERS['optp-tembakau-lanas'] = { label: 'Lanas', parentLayer: 64, layerId: 65, color: '#b91c1c', parentLabel: 'Tembakau' };
  OPTP_LAYERS['optp-tembakau-spodoptera-sp'] = { label: 'Spodoptera sp.', parentLayer: 64, layerId: 66, color: '#b91c1c', parentLabel: 'Tembakau' };
  OPTP_LAYERS['optp-tembakau-myzus-sp'] = { label: 'Myzus sp.', parentLayer: 64, layerId: 67, color: '#b91c1c', parentLabel: 'Tembakau' };
  OPTP_LAYERS['optp-tembakau-tobacco-mosaic-virus'] = { label: 'Tobacco Mosaic Virus (TMV)', parentLayer: 64, layerId: 68, color: '#b91c1c', parentLabel: 'Tembakau' };
  OPTP_LAYERS['optp-tembakau-aphis-sp'] = { label: 'Aphis sp.', parentLayer: 64, layerId: 69, color: '#b91c1c', parentLabel: 'Tembakau' };
  OPTP_LAYERS['optp-tembakau-heliothis-sp'] = { label: 'Heliothis sp.', parentLayer: 64, layerId: 70, color: '#b91c1c', parentLabel: 'Tembakau' };
  /* === Vanili (parentLayer=71) === */
  OPTP_LAYERS['optp-vanili-busuk-batang'] = { label: 'Busuk Batang', parentLayer: 71, layerId: 72, color: '#0f766e', parentLabel: 'Vanili' };

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
    var keys = Object.keys(OPTP_LAYERS);
    for (var i = 0; i < keys.length; i++) {
      if (OPTP_LAYERS[keys[i]].layerId === id) return OPTP_LAYERS[keys[i]];
    }
    return null;
  }

  function toggleOPTPerkebunan(key, visible) {
    var cfg = OPTP_LAYERS[key];
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
          window.showMapToast('Data OPT Perkebunan ' + cfg.label + ' tidak tersedia.', 'error');
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
      window.map.on('click', onOptpMapClick);
      clickBound = true;
    }
  }
  function unbindClick() {
    if (clickBound && window.map) {
      window.map.off('click', onOptpMapClick);
      clickBound = false;
    }
  }

  function onOptpMapClick(e) {
    var keys = Object.keys(activeLayers);
    if (!keys.length || !window.map) return;
    var layerIds = keys.map(function (k) { return OPTP_LAYERS[k].layerId; });
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
      + '<div class="agol-popup-footer"><span>Sumber: KEMENTAN / siperditan &mdash; Kategori Endemis OPT Perkebunan</span></div>'
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
    var cfg = OPTP_LAYERS[key];
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
  var OPTP_ATTR_DATA = {};
  Object.keys(OPTP_LAYERS).forEach(function (key) {
    var cfg = OPTP_LAYERS[key];
    OPTP_ATTR_DATA[key] = {
      name: 'OPT Perkebunan: ' + cfg.label + ' (' + cfg.parentLabel + ')',
      type: 'arcgis',
      url: SERVICE_URL + '/' + cfg.layerId + '/query',
      outFields: ['*'],
      props: [],
      noPagination: true
    };
  });

  window.OPTP_ATTR_DATA = OPTP_ATTR_DATA;
  window.OPTP_LAYER_IDS = Object.keys(OPTP_LAYERS);
  window.toggleOPTPerkebunan = toggleOPTPerkebunan;
  /* Panel Detail Layer memanggil cleanup ini saat ditutup (map-core.js). */
  (window.catalogHighlightCleanups = window.catalogHighlightCleanups || []).push(function () {
    if (highlight && window.map) { window.map.removeLayer(highlight); highlight = null; }
  });
})();
