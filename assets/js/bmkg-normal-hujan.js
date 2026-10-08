/* Normal klimatologis curah hujan bulanan BMKG (periode 30 tahun). */
(function () {
  'use strict';

  var SERVICE_URL = 'https://gis.bmkg.go.id/arcgis/rest/services/Normal_hujan_30th/Normal_curah_hujan/MapServer';
  var MONTHS = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  var layer = null;
  var active = false;
  var renderId = 0;
  var metadataPromise = null;

  function selectedMonthLayer(monthIndex) {
    if (!metadataPromise) {
      metadataPromise = fetch(SERVICE_URL + '?f=pjson', { headers: { Accept: 'application/json' } })
        .then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.json();
        }).then(function (metadata) {
          if (metadata.error) throw new Error(metadata.error.message || 'Metadata layanan BMKG tidak tersedia.');
          return metadata.layers || [];
        }).catch(function (error) {
          metadataPromise = null;
          throw error;
        });
    }

    return metadataPromise.then(function (layers) {
      var month = MONTHS[monthIndex].toLowerCase();
      var match = layers.find(function (item) {
        return String(item.name || '').toLowerCase().indexOf('curah hujan normal ' + month) !== -1;
      });
      if (!match) throw new Error('Layer normal curah hujan ' + MONTHS[monthIndex] + ' tidak ditemukan.');
      return match.id;
    });
  }

  function showLegend(month, layerId, currentRender) {
    if (!window.addUnifiedLegend) return;
    var box = document.createElement('div');
    box.className = 'bmkg-rain-legend';
    var title = document.createElement('strong');
    title.textContent = 'Normal Curah Hujan ' + month;
    box.appendChild(title);
    var entriesBox = document.createElement('div');
    entriesBox.className = 'bmkg-rain-legend-group';
    entriesBox.textContent = 'Memuat legenda…';
    box.appendChild(entriesBox);
    var source = document.createElement('small');
    source.textContent = 'Rata-rata klimatologis 30 tahun · Sumber: BMKG';
    box.appendChild(source);
    window.addUnifiedLegend('bmkg-normal-hujan', window.createLegendWithToggle ? window.createLegendWithToggle(box) : box);

    fetch(SERVICE_URL + '/legend?f=json', { headers: { Accept: 'application/json' } })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      }).then(function (data) {
        if (currentRender !== renderId) return;
        if (data.error) throw new Error(data.error.message || 'Legenda BMKG tidak tersedia.');
        var item = (data.layers || []).find(function (entry) { return Number(entry.layerId) === Number(layerId); });
        var legendEntries = item && Array.isArray(item.legend) ? item.legend : [];
        entriesBox.textContent = '';
        if (!legendEntries.length) {
          entriesBox.textContent = 'Legenda kelas tidak tersedia.';
          return;
        }
        legendEntries.forEach(function (entry) {
          var row = document.createElement('div');
          row.className = 'bmkg-rain-legend-row';
          var contentType = String(entry.contentType || 'image/png').toLowerCase();
          if (entry.imageData && /^image\/(png|jpeg|gif)$/.test(contentType)) {
            var swatch = document.createElement('img');
            swatch.alt = '';
            swatch.src = 'data:' + contentType + ';base64,' + entry.imageData;
            row.appendChild(swatch);
          }
          var label = document.createElement('span');
          label.textContent = entry.label || (entry.values && entry.values.join(', ')) || 'Kelas';
          row.appendChild(label);
          entriesBox.appendChild(row);
        });
      }).catch(function (error) {
        if (currentRender !== renderId) return;
        console.warn('[Legenda normal hujan BMKG]', error);
        entriesBox.textContent = 'Legenda BMKG sedang tidak tersedia.';
      });
  }

  function hideLegend() {
    if (window.removeUnifiedLegend) window.removeUnifiedLegend('bmkg-normal-hujan');
  }

  function render(visible, selectedMonth) {
    var map = window.map || window._map;
    var currentRender = ++renderId;
    active = !!visible;

    if (!active) {
      if (layer && map.hasLayer(layer)) map.removeLayer(layer);
      hideLegend();
      return;
    }
    if (!map || !window.L || !window.L.esri) return;

    var monthIndex = Number(selectedMonth == null ? window._bmkgNormalHujanMonth || 0 : selectedMonth);
    window._bmkgNormalHujanMonth = monthIndex;
    selectedMonthLayer(monthIndex).then(function (layerId) {
      if (currentRender !== renderId || !active || !map) return;
      if (layer && map.hasLayer(layer)) map.removeLayer(layer);
      layer = window.L.esri.dynamicMapLayer({
        url: SERVICE_URL,
        layers: [layerId],
        opacity: 0.78,
        format: 'png32',
        transparent: true,
        attribution: 'Normal Curah Hujan © BMKG'
      });
      layer.addTo(map);
      showLegend(MONTHS[monthIndex], layerId, currentRender);
    }).catch(function (error) {
      if (currentRender !== renderId) return;
      console.warn('[Normal Curah Hujan BMKG]', error);
      if (window.showToast) window.showToast('Layer normal curah hujan BMKG gagal dimuat.', 'error');
    });
  }

  function init() {
    document.addEventListener('change', function (event) {
      if (event.target && event.target.id === 'bmkgNormalHujanMonth') {
        window._bmkgNormalHujanMonth = Number(event.target.value);
        if (active) render(true, window._bmkgNormalHujanMonth);
      }
    });
  }

  window._bmkgNormalHujanMonth = Number(window._bmkgNormalHujanMonth || 0);
  window.toggleBmkgNormalHujan = function (visible) { render(visible, window._bmkgNormalHujanMonth); };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
