/* Kategori Wilayah Serangan OPT — SIPERDITAN Kementerian Pertanian */
(function () {
  'use strict';

  var SERVICE_URL = 'https://sig02.pertanian.go.id/server/rest/services/siperditan/Kategori_Wilayah_Serangan_OPT/MapServer';
  var CATEGORY_STYLES = [
    { label: 'Aman', color: '#006100' },
    { label: 'Potensial', color: '#55ff00' },
    { label: 'Sporadis', color: '#ffff00' },
    { label: 'Endemis', color: '#ff2600' }
  ];
  var LAYERS = {
    'kategori-opt-hujan-penggerek-batang': { id: 2, label: 'Penggerek Batang', season: 'Musim Hujan' },
    'kategori-opt-hujan-wereng-batang-cokelat': { id: 3, label: 'Wereng Batang Cokelat', season: 'Musim Hujan' },
    'kategori-opt-hujan-tikus': { id: 4, label: 'Tikus', season: 'Musim Hujan' },
    'kategori-opt-hujan-blas': { id: 5, label: 'Blas', season: 'Musim Hujan' },
    'kategori-opt-hujan-kresek': { id: 6, label: 'Kresek', season: 'Musim Hujan' },
    'kategori-opt-hujan-tungro': { id: 7, label: 'Tungro', season: 'Musim Hujan' },
    'kategori-opt-hujan-kerdil-rumput': { id: 8, label: 'Kerdil Rumput', season: 'Musim Hujan' },
    'kategori-opt-kemarau-penggerek-batang': { id: 10, label: 'Penggerek Batang', season: 'Musim Kemarau' },
    'kategori-opt-kemarau-wereng-batang-cokelat': { id: 11, label: 'Wereng Batang Cokelat', season: 'Musim Kemarau' },
    'kategori-opt-kemarau-tikus': { id: 12, label: 'Tikus', season: 'Musim Kemarau' },
    'kategori-opt-kemarau-blas': { id: 13, label: 'Blas', season: 'Musim Kemarau' },
    'kategori-opt-kemarau-kresek': { id: 14, label: 'Kresek', season: 'Musim Kemarau' },
    'kategori-opt-kemarau-tungro': { id: 15, label: 'Tungro', season: 'Musim Kemarau' },
    'kategori-opt-kemarau-kerdil-rumput': { id: 16, label: 'Kerdil Rumput', season: 'Musim Kemarau' }
  };
  var renderedLayers = {};
  var activeLayers = {};
  var clickBound = false;
  var popup = null;
  var highlight = null;

  function esc(value) {
    return String(value == null ? '-' : value).replace(/[&<>'"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c];
    });
  }

  function configByLayerId(id) {
    var keys = Object.keys(LAYERS);
    for (var i = 0; i < keys.length; i++) if (LAYERS[keys[i]].id === id) return LAYERS[keys[i]];
    return null;
  }

  function toggleKategoriWilayahOpt(key, visible) {
    var cfg = LAYERS[key];
    if (!cfg || !window.map) return;
    if (visible) {
      if (!renderedLayers[key]) {
        renderedLayers[key] = L.esri.dynamicMapLayer({ url: SERVICE_URL, layers: [cfg.id], opacity: 0.78, f: 'image' });
      }
      renderedLayers[key].addTo(window.map);
      activeLayers[key] = true;
      addLegend(key);
      bindClick();
    } else {
      if (renderedLayers[key]) window.map.removeLayer(renderedLayers[key]);
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
    if (!clickBound) { window.map.on('click', identify); clickBound = true; }
  }
  function unbindClick() {
    if (clickBound) { window.map.off('click', identify); clickBound = false; }
  }

  function identify(e) {
    var ids = Object.keys(activeLayers).map(function (key) { return LAYERS[key].id; });
    if (!ids.length) return;
    var size = window.map.getSize();
    var bounds = window.map.getBounds();
    var geometry = JSON.stringify({ x: e.latlng.lng, y: e.latlng.lat, spatialReference: { wkid: 4326 } });
    var url = SERVICE_URL + '/identify?geometry=' + encodeURIComponent(geometry)
      + '&geometryType=esriGeometryPoint&sr=4326&layers=' + encodeURIComponent('visible:' + ids.join(','))
      /* tolerance=0: server identify SIPERDITAN membalas ratusan fitur
         se-Indonesia bila tolerance dinaikkan. maxAllowableOffset
         menyederhanakan geometri (~55 m) supaya payload ringan. */
      + '&tolerance=0&mapExtent=' + [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(',')
      + '&imageDisplay=' + size.x + ',' + size.y + ',96&returnGeometry=true&maxAllowableOffset=0.0005&f=json';
    fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      if (data && data.results && data.results.length) showPopup(e.latlng, data.results);
    }).catch(function () {});
  }

  /* Template .agol-popup dipakai semua card di panel Detail Layer: header
     badge/judul, body berisi baris atribut, lalu footer sumber. Panel Detail
     Layer mengubah .agol-popup-fields menjadi tabel dua kolom, jadi atribut
     tidak boleh dirender sebagai <table> yang digulir sendiri di dalam popup. */
  function kategoriOptCard(cfg, attrs) {
    /* Identify membalas atribut memakai alias, jadi kategori kadang datang
       sebagai "Kategori" dan bukan "PB" (nama field aslinya). */
    var kategori = attrs.PB;
    if (kategori == null || kategori === '') kategori = attrs.Kategori;
    var rows = [
      ['Provinsi', attrs.PROV],
      ['Kab/Kota', attrs.KABKOT],
      ['Kategori', kategori]
    ];
    var fields = '';
    rows.forEach(function (pair) {
      if (pair[1] == null || pair[1] === '') return;
      fields += '<div class="agol-popup-field">'
        + '<span class="agol-popup-field-label">' + esc(pair[0]) + '</span>'
        + '<span class="agol-popup-field-value">' + esc(String(pair[1])) + '</span>'
        + '</div>';
    });
    if (!fields) {
      fields = '<div class="agol-popup-field"><span class="agol-popup-field-value">Tidak ada atribut.</span></div>';
    }
    /* Titik badge memakai warna kategori agar cocok dengan legenda. */
    var color = '#16a34a';
    CATEGORY_STYLES.forEach(function (style) { if (style.label === kategori) color = style.color; });
    return '<div class="agol-popup">'
      + '<div class="agol-popup-header agol-geo-kawasan">'
      + '<div class="agol-popup-badge"><span class="agol-popup-badge-dot" style="background:' + esc(color) + ';"></span>KEMENTAN</div>'
      + '<div class="agol-popup-title">' + esc(cfg.label) + '</div>'
      + '<div class="agol-popup-subtitle">' + esc(cfg.season) + '</div>'
      + '</div>'
      + '<div class="agol-popup-body"><div class="agol-popup-fields">' + fields + '</div></div>'
      + '<div class="agol-popup-footer"><span>Sumber: KEMENTAN / siperditan &mdash; Kategori Wilayah Serangan OPT</span></div>'
      + '</div>';
  }

  /* ── Sorot polygon fitur yang sedang dilihat ──
     Warna sorotan mengikuti kategori (Aman/Potensial/Sporadis/Endemis)
     agar sejalan dengan legenda. Geometri ring Esri dikonversi via
     L.esri.Util.arcgisToGeoJSON dengan fallback manual. */
  function clearHighlight() {
    if (highlight && window.map) window.map.removeLayer(highlight);
    highlight = null;
  }

  function drawHighlight(latlng, results) {
    clearHighlight();
    if (!window.map || typeof L === 'undefined') return;
    var group = null;
    results.forEach(function (result) {
      var geometry = result && result.geometry;
      if (!geometry || !geometry.rings || !geometry.rings.length) return;
      var a = result.attributes || {};
      var kategori = a.PB;
      if (kategori == null || kategori === '') kategori = a.Kategori;
      var color = '#FFAA00';
      CATEGORY_STYLES.forEach(function (style) { if (style.label === kategori) color = style.color; });
      var style = { color: color, weight: 2, fill: false, dashArray: '4 3' };
      if (!group) group = L.featureGroup();
      try {
        if (L.esri && L.esri.Util && typeof L.esri.Util.arcgisToGeoJSON === 'function') {
          var feature = L.esri.Util.arcgisToGeoJSON({ geometry: geometry, attributes: a });
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
    if (popup) window.map.removeLayer(popup);
    drawHighlight(latlng, results);
    var cards = [];
    results.forEach(function (result) {
      var cfg = configByLayerId(result.layerId);
      if (!cfg) return;
      cards.push(kategoriOptCard(cfg, result.attributes || {}));
    });
    if (!cards.length) return;
    var html = cards.join('');
    /* Satu klik bisa menyentuh lebih dari satu hama; bungkus dengan daftar
       persil supaya kartu terpisah rapi, persis pola map-core.js. */
    if (cards.length > 1) html = '<div class="bhumi-persil-list">' + html + '</div>';
    popup = L.popup({ maxWidth: 360, closeButton: true }).setLatLng(latlng).setContent(html).addTo(window.map);
  }

  function addLegend(key) {
    if (typeof addUnifiedLegend !== 'function') return;
    var cfg = LAYERS[key];
    var el = L.DomUtil.create('div', 'omi-legend leaflet-bar');
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
    var title = L.DomUtil.create('div', 'omi-legend-title', el);
    title.textContent = cfg.label + ' — ' + cfg.season;
    CATEGORY_STYLES.forEach(function (item) {
      var row = L.DomUtil.create('div', 'himawari-legend-unit', el);
      row.innerHTML = '<i style="display:inline-block;width:12px;height:12px;margin-right:5px;border:1px solid #334155;background:' + item.color + '"></i>' + item.label;
    });
    var source = L.DomUtil.create('div', 'himawari-legend-unit', el);
    source.textContent = 'Sumber: SIPERDITAN Kementan';
    addUnifiedLegend(key, typeof createLegendWithToggle === 'function' ? createLegendWithToggle(el) : el);
  }
  function removeLegend(key) { if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend(key); }

  var attrs = {};
  Object.keys(LAYERS).forEach(function (key) {
    var cfg = LAYERS[key];
    attrs[key] = { name: 'Kategori OPT: ' + cfg.label + ' (' + cfg.season + ')', type: 'arcgis', url: SERVICE_URL + '/' + cfg.id + '/query', outFields: ['*'], props: [], noPagination: true };
  });

  window.KATEGORI_OPT_ATTR_DATA = attrs;
  window.toggleKategoriWilayahOpt = toggleKategoriWilayahOpt;
  /* Panel Detail Layer memanggil cleanup ini saat ditutup (map-core.js). */
  (window.catalogHighlightCleanups = window.catalogHighlightCleanups || []).push(clearHighlight);
})();
