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
      + '&tolerance=4&mapExtent=' + [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(',')
      + '&imageDisplay=' + size.x + ',' + size.y + ',96&returnGeometry=false&f=json';
    fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      if (data && data.results && data.results.length) showPopup(e.latlng, data.results);
    }).catch(function () {});
  }

  function showPopup(latlng, results) {
    var html = '<div style="font-size:12px;min-width:220px"><strong style="color:#1e293b">Kategori Wilayah Serangan OPT</strong>';
    results.forEach(function (result) {
      var cfg = configByLayerId(result.layerId);
      if (!cfg) return;
      var a = result.attributes || {};
      html += '<div style="margin-top:8px;padding-top:7px;border-top:1px solid #e2e8f0">'
        + '<b>' + esc(cfg.label) + '</b><br><span style="color:#64748b">' + esc(cfg.season) + '</span>'
        + '<table style="margin-top:5px;border-collapse:collapse;width:100%">'
        + '<tr><td style="color:#64748b">Provinsi</td><td>' + esc(a.PROV) + '</td></tr>'
        + '<tr><td style="color:#64748b">Kab/Kota</td><td>' + esc(a.KABKOT) + '</td></tr>'
        + '<tr><td style="color:#64748b">Kategori</td><td><b>' + esc(a.PB) + '</b></td></tr></table></div>';
    });
    html += '</div>';
    if (popup) window.map.removeLayer(popup);
    popup = L.popup({ maxWidth: 360 }).setLatLng(latlng).setContent(html).addTo(window.map);
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
})();
