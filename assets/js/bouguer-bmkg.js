/* Overlay dan identifikasi data Anomali Bouguer dari layanan BMKG. */
(function () {
  'use strict';

  var SERVICE_URL = 'https://gis.bmkg.go.id/arcgis/rest/services/Peta_Anomali_Bouger/MapServer';
  var LAYER_ID = 1653;
  var layer = null;
  var enabled = false;
  var clickHandler = null;
  var legendDataPromise = null;
  var legendRenderId = 0;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function identify(event) {
    var map = window.map;
    var L = window.L;
    if (!enabled || !map || !L || !event || !event.latlng) return;

    var bounds = map.getBounds();
    var sw = bounds.getSouthWest();
    var ne = bounds.getNorthEast();
    var size = map.getSize();
    var params = new URLSearchParams({
      geometry: event.latlng.lng + ',' + event.latlng.lat,
      geometryType: 'esriGeometryPoint',
      sr: '4326',
      layers: 'all:' + LAYER_ID,
      tolerance: '5',
      mapExtent: [sw.lng, sw.lat, ne.lng, ne.lat].join(','),
      imageDisplay: size.x + ',' + size.y + ',96',
      returnGeometry: 'false',
      f: 'json'
    });
    var popup = L.popup({ maxWidth: 360 })
      .setLatLng(event.latlng)
      .setContent('<div class="bouguer-popup"><strong>Anomali Bouguer · BMKG</strong><div>Memuat atribut titik…</div></div>')
      .openOn(map);

    fetch(SERVICE_URL + '/identify?' + params.toString()).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    }).then(function (data) {
      if (!map.hasLayer(popup)) return;
      if (data.error) throw new Error(data.error.message || 'Layanan BMKG mengembalikan error.');
      var results = data.results || [];
      if (!results.length) {
        popup.setContent('<div class="bouguer-popup"><strong>Anomali Bouguer · BMKG</strong><div>Tidak ada fitur pada koordinat ini.</div><small>' + event.latlng.lat.toFixed(5) + ', ' + event.latlng.lng.toFixed(5) + '</small></div>');
        return;
      }
      var attributes = results[0].attributes || {};
      var html = '<div class="bouguer-popup"><strong>Anomali Bouguer · BMKG</strong><table>';
      Object.keys(attributes).forEach(function (key) {
        var value = attributes[key];
        if (value == null || value === '') return;
        html += '<tr><th>' + escapeHtml(key) + '</th><td>' + escapeHtml(value) + '</td></tr>';
      });
      html += '</table><small>Koordinat: ' + event.latlng.lat.toFixed(5) + ', ' + event.latlng.lng.toFixed(5) + ' · Sumber: BMKG</small></div>';
      popup.setContent(html);
    }).catch(function (error) {
      console.warn('[Anomali Bouguer BMKG] Gagal mengambil informasi titik:', error);
      if (map.hasLayer(popup)) {
        popup.setContent('<div class="bouguer-popup"><strong>Anomali Bouguer · BMKG</strong><div>Data atribut gagal dimuat. Layanan mungkin sedang tidak tersedia.</div><small>Sumber: BMKG</small></div>');
      }
    });
  }

  function addLegend() {
    if (!window.addUnifiedLegend) return;
    var renderId = ++legendRenderId;
    var node = document.createElement('div');
    node.className = 'bouguer-legend';
    node.innerHTML = '<strong>Anomali Bouguer Indonesia</strong><div class="bouguer-legend-items">Memuat legenda…</div><p>Klik peta untuk melihat atribut pada lokasi.</p><small>Sumber: BMKG · satuan nilai mengikuti atribut layanan.</small>';
    window.addUnifiedLegend('bouguer-bmkg', window.createLegendWithToggle ? window.createLegendWithToggle(node) : node);

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
      if (renderId !== legendRenderId || !enabled) return;
      var container = node.querySelector('.bouguer-legend-items');
      if (!container) return;
      container.innerHTML = '';
      var layerInfo = (data.layers || []).filter(function (item) { return Number(item.layerId) === LAYER_ID; })[0];
      var entries = layerInfo && Array.isArray(layerInfo.legend) ? layerInfo.legend : [];
      if (!entries.length) {
        container.textContent = 'Simbol legenda tidak tersedia dari layanan.';
        return;
      }
      entries.forEach(function (entry) {
        var row = document.createElement('div');
        row.className = 'bouguer-legend-row';
        var contentType = String(entry.contentType || 'image/png').toLowerCase();
        if (entry.imageData && /^image\/(png|jpeg|gif)$/.test(contentType)) {
          var image = document.createElement('img');
          image.alt = entry.label || 'Simbol Anomali Bouguer';
          image.src = 'data:' + contentType + ';base64,' + entry.imageData;
          row.appendChild(image);
        }
        var label = document.createElement('span');
        label.textContent = entry.label || (entry.values && entry.values.join(', ')) || 'Kelas';
        row.appendChild(label);
        container.appendChild(row);
      });
    }).catch(function (error) {
      if (renderId !== legendRenderId || !enabled) return;
      console.warn('[Anomali Bouguer BMKG] Legenda gagal dimuat:', error);
      var container = node.querySelector('.bouguer-legend-items');
      if (container) container.textContent = 'Legenda dari layanan BMKG sedang tidak tersedia.';
    });
  }

  function removeLegend() {
    legendRenderId++;
    if (window.removeUnifiedLegend) window.removeUnifiedLegend('bouguer-bmkg');
  }

  window.toggleBouguerBMKG = function (visible) {
    var map = window.map;
    var L = window.L;
    enabled = !!visible;
    if (!map || !L || !L.esri || !L.esri.dynamicMapLayer) {
      if (enabled && window.showToast) window.showToast('Layer Anomali Bouguer gagal diinisialisasi.', 'error');
      return;
    }

    if (!layer) {
      layer = L.esri.dynamicMapLayer({
        url: SERVICE_URL,
        layers: [LAYER_ID],
        opacity: 0.78,
        attribution: 'Anomali Bouguer © BMKG'
      });
      layer.on('requesterror', function (event) {
        console.error('[Anomali Bouguer BMKG] Gagal memuat layer:', event);
        if (window.showToast) window.showToast('Layer Anomali Bouguer BMKG gagal dimuat.', 'error');
      });
    }

    if (enabled) {
      if (!map.hasLayer(layer)) layer.addTo(map);
      if (!clickHandler) clickHandler = identify;
      map.off('click', clickHandler);
      map.on('click', clickHandler);
      addLegend();
    } else {
      if (map.hasLayer(layer)) map.removeLayer(layer);
      if (clickHandler) map.off('click', clickHandler);
      removeLegend();
    }
  };
})();
