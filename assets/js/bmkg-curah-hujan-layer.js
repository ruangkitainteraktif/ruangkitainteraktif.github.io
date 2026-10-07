/* Layer observasi curah hujan dan hari hujan dari MapServer BMKG. */
(function () {
  'use strict';

  var SERVICE_URL = 'https://gis.bmkg.go.id/arcgis/rest/services/Peta_Curah_Hujan_dan_Hari_Hujan_/MapServer';
  var DEFINITIONS = {
    curah: { id: 0, toggle: 'toggleBmkgCurahHujan', label: 'Curah Hujan' },
    hari: { id: 1, toggle: 'toggleBmkgHariHujan', label: 'Hari Hujan' }
  };
  var layers = {};
  var enabled = { curah: false, hari: false };
  var clickMap = null;
  var clickHandler = null;
  var requestId = 0;
  var legendDataPromise = null;
  var legendRenderId = 0;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function updateLegend() {
    if (!window.addUnifiedLegend) return;
    var selected = Object.keys(enabled).filter(function (key) { return enabled[key]; });
    if (!selected.length) {
      if (window.removeUnifiedLegend) window.removeUnifiedLegend('bmkg-curah-hujan');
      return;
    }
    var renderId = ++legendRenderId;
    var node = document.createElement('div');
    node.className = 'bmkg-rain-legend';
    node.innerHTML = '<strong>Legenda Data Iklim BMKG</strong><div class="bmkg-rain-legend-items">Memuat legenda…</div><small>Klik area pada peta untuk membaca atribut yang tersedia.</small>';
    window.addUnifiedLegend('bmkg-curah-hujan', window.createLegendWithToggle ? window.createLegendWithToggle(node) : node);

    if (!legendDataPromise) {
      legendDataPromise = fetch(SERVICE_URL + '/legend?f=json', { headers: { Accept: 'application/json' } }).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      }).catch(function (error) {
        legendDataPromise = null;
        throw error;
      });
    }
    legendDataPromise.then(function (data) {
      if (renderId !== legendRenderId) return;
      var container = node.querySelector('.bmkg-rain-legend-items');
      if (!container) return;
      container.innerHTML = '';
      selected.forEach(function (key) {
        var definition = DEFINITIONS[key];
        var layerInfo = (data.layers || []).filter(function (item) { return Number(item.layerId) === definition.id; })[0];
        var group = document.createElement('section');
        group.className = 'bmkg-rain-legend-group';
        var title = document.createElement('b');
        title.textContent = definition.label;
        group.appendChild(title);
        var entries = layerInfo && Array.isArray(layerInfo.legend) ? layerInfo.legend : [];
        if (!entries.length) {
          var unavailable = document.createElement('small');
          unavailable.textContent = 'Simbol legenda tidak tersedia dari layanan.';
          group.appendChild(unavailable);
        }
        entries.forEach(function (entry) {
          var row = document.createElement('div');
          row.className = 'bmkg-rain-legend-row';
          var contentType = String(entry.contentType || 'image/png').toLowerCase();
          if (entry.imageData && /^image\/(png|jpeg|gif)$/.test(contentType)) {
            var image = document.createElement('img');
            image.alt = entry.label || definition.label;
            image.src = 'data:' + contentType + ';base64,' + entry.imageData;
            row.appendChild(image);
          }
          var label = document.createElement('span');
          label.textContent = entry.label || (entry.values && entry.values.join(', ')) || 'Kelas';
          row.appendChild(label);
          group.appendChild(row);
        });
        container.appendChild(group);
      });
    }).catch(function (error) {
      if (renderId !== legendRenderId) return;
      console.warn('[Data Iklim BMKG] Legenda gagal dimuat:', error);
      var container = node.querySelector('.bmkg-rain-legend-items');
      if (container) container.textContent = 'Legenda dari layanan BMKG sedang tidak tersedia.';
    });
  }

  function refreshClickHandler() {
    var map = window.map;
    if (clickMap && clickHandler) clickMap.off('click', clickHandler);
    clickMap = null;
    clickHandler = null;
    requestId++;
    if (!map || (!enabled.curah && !enabled.hari)) return;
    clickMap = map;
    clickHandler = identify;
    clickMap.on('click', clickHandler);
  }

  function identify(event) {
    var map = window.map;
    var L = window.L;
    if (!map || !L || !event || !event.latlng) return;
    var selected = Object.keys(enabled).filter(function (key) { return enabled[key]; });
    if (!selected.length) return;
    var currentRequest = ++requestId;
    var popup = L.popup({ maxWidth: 360 }).setLatLng(event.latlng)
      .setContent('<div class="bmkg-rain-popup"><strong>Data Iklim BMKG</strong><div>Memuat data pada koordinat ini…</div></div>')
      .openOn(map);
    var bounds = map.getBounds();
    var sw = bounds.getSouthWest();
    var ne = bounds.getNorthEast();
    var size = map.getSize();

    Promise.all(selected.map(function (key) {
      var def = DEFINITIONS[key];
      var params = new URLSearchParams({
        geometry: event.latlng.lng + ',' + event.latlng.lat,
        geometryType: 'esriGeometryPoint', sr: '4326', layers: 'all:' + def.id,
        tolerance: '5', mapExtent: [sw.lng, sw.lat, ne.lng, ne.lat].join(','),
        imageDisplay: size.x + ',' + size.y + ',96', returnGeometry: 'false', f: 'json'
      });
      return fetch(SERVICE_URL + '/identify?' + params.toString()).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      }).then(function (data) {
        if (data.error) throw new Error(data.error.message || 'Kesalahan layanan BMKG');
        return { label: def.label, results: data.results || [] };
      });
    })).then(function (groups) {
      if (currentRequest !== requestId || !map.hasLayer(popup)) return;
      var html = '<div class="bmkg-rain-popup"><strong>Data Iklim BMKG</strong>';
      var found = false;
      groups.forEach(function (group) {
        if (!group.results.length) return;
        found = true;
        html += '<h4>' + esc(group.label) + '</h4><table>';
        Object.keys(group.results[0].attributes || {}).forEach(function (field) {
          var value = group.results[0].attributes[field];
          if (value == null || value === '') return;
          html += '<tr><th>' + esc(field) + '</th><td>' + esc(value) + '</td></tr>';
        });
        html += '</table>';
      });
      if (!found) html += '<div>Tidak ada fitur pada koordinat ini.</div>';
      html += '<small>Koordinat: ' + event.latlng.lat.toFixed(5) + ', ' + event.latlng.lng.toFixed(5) + ' · Sumber: BMKG</small></div>';
      popup.setContent(html);
    }).catch(function (error) {
      console.warn('[Data Iklim BMKG] Gagal mengambil atribut:', error);
      if (currentRequest === requestId && map.hasLayer(popup)) {
        popup.setContent('<div class="bmkg-rain-popup"><strong>Data Iklim BMKG</strong><div>Atribut gagal dimuat. Layanan BMKG mungkin sedang tidak tersedia.</div><small>Koordinat: ' + event.latlng.lat.toFixed(5) + ', ' + event.latlng.lng.toFixed(5) + '</small></div>');
      }
    });
  }

  function toggle(key, visible) {
    var map = window.map;
    var L = window.L;
    var def = DEFINITIONS[key];
    if (!def || !map || !L || !L.esri || !L.esri.dynamicMapLayer) return;
    enabled[key] = !!visible;
    if (!layers[key]) {
      layers[key] = L.esri.dynamicMapLayer({
        url: SERVICE_URL, layers: [def.id], opacity: 0.8, attribution: 'Data Curah Hujan dan Hari Hujan © BMKG'
      });
      layers[key].on('requesterror', function (event) {
        console.error('[Data Iklim BMKG] Layer gagal dimuat:', event);
        if (window.showToast) window.showToast('Layer ' + def.label + ' BMKG gagal dimuat.', 'error');
      });
    }
    if (visible) {
      if (!map.hasLayer(layers[key])) layers[key].addTo(map);
    } else if (map.hasLayer(layers[key])) {
      map.removeLayer(layers[key]);
    }
    refreshClickHandler();
    updateLegend();
  }

  window.toggleBmkgCurahHujan = function (visible) { toggle('curah', visible); };
  window.toggleBmkgHariHujan = function (visible) { toggle('hari', visible); };
})();
