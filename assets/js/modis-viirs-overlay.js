/* ── MODIS & VIIRS ArcGIS ImageServer Overlay + Time Control ── */
(function () {
  'use strict';

  var MODIS_URL = 'https://modis.arcgis.com/arcgis/rest/services/MODIS/ImageServer';
  var VIIRS_URL = 'https://modis.arcgis.com/arcgis/rest/services/VIIRS/ImageServer';

  var modisLayer = null;
  var viirsLayer = null;
  var latestDateStr = '2024-01-01';

  function getSelectedDateRange() {
    var dateStr = latestDateStr;
    var from = new Date(dateStr + 'T00:00:00');
    var to = new Date(dateStr + 'T23:59:59.999');
    return { from: from, to: to };
  }

  function updateTimeRange() {
    var range = getSelectedDateRange();
    if (modisLayer) modisLayer.setTimeRange(range.from, range.to);
    if (viirsLayer) viirsLayer.setTimeRange(range.from, range.to);
  }

  function fetchLatestDate() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', MODIS_URL + '/query?where=1%3D1&outFields=AcquisitionDate&orderByFields=AcquisitionDate%20DESC&resultRecordCount=1&f=json', true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (data && data.features && data.features.length && data.features[0].attributes) {
            var ts = data.features[0].attributes.AcquisitionDate;
            var d = new Date(ts);
            latestDateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            updateTimeRange();
          }
        } catch (e) { /* ignore */ }
      }
    };
    xhr.send();
  }

  function toggleModis(on) {
    if (on) {
      if (modisLayer) { if (!map.hasLayer(modisLayer)) modisLayer.addTo(map); return; }
      var range = getSelectedDateRange();
      modisLayer = L.esri.imageMapLayer({
        url: MODIS_URL,
        from: range.from,
        to: range.to,
        format: 'jpgpng',
        transparent: true
      }).addTo(map);
    } else {
      if (modisLayer && map.hasLayer(modisLayer)) map.removeLayer(modisLayer);
      modisLayer = null;
    }
  }

  function toggleViirs(on) {
    if (on) {
      if (viirsLayer) { if (!map.hasLayer(viirsLayer)) viirsLayer.addTo(map); return; }
      var range = getSelectedDateRange();
      viirsLayer = L.esri.imageMapLayer({
        url: VIIRS_URL,
        from: range.from,
        to: range.to,
        format: 'jpgpng',
        transparent: true
      }).addTo(map);
    } else {
      if (viirsLayer && map.hasLayer(viirsLayer)) map.removeLayer(viirsLayer);
      viirsLayer = null;
    }
  }

  function cleanup() {
    if (modisLayer && map.hasLayer(modisLayer)) map.removeLayer(modisLayer);
    modisLayer = null;
    if (viirsLayer && map.hasLayer(viirsLayer)) map.removeLayer(viirsLayer);
    viirsLayer = null;
    var chkM = document.getElementById('toggleModisOverlay');
    var chkV = document.getElementById('toggleViirsOverlay');
    if (chkM) chkM.checked = false;
    if (chkV) chkV.checked = false;
  }

  document.addEventListener('DOMContentLoaded', function () {
    fetchLatestDate();

    var chkModis = document.getElementById('toggleModisOverlay');
    if (chkModis) chkModis.addEventListener('change', function () { toggleModis(this.checked); });

    var chkViirs = document.getElementById('toggleViirsOverlay');
    if (chkViirs) chkViirs.addEventListener('change', function () { toggleViirs(this.checked); });
  });

  window.modisViirsOverlayCleanup = cleanup;
})();
