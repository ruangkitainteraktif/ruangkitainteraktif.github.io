/* ── Wind RGB Layer (BMKG GFS) ── */
(function () {
  'use strict';

  var WIND_RGB_BASE = 'https://spartan.bmkg.go.id/map/rgb_req/gfs_indo/wind/1000';
  var PROV_GEOJSON_URL = 'assets/data/bps/geojson/provinsi.geojson';
  var windRgbLayer = null;
  var provinsiLayer = null;
  var provinsiLoaded = false;
  var legendControl = null;

  var WindLegend = L.Control.extend({
    options: { position: 'bottomleft' },
    onAdd: function () {
      var div = L.DomUtil.create('div', 'wind-legend');
      L.DomEvent.disableClickPropagation(div);
      div.innerHTML =
        '<div class="wind-legend-title">Wind Speed (m/s)</div>' +
        '<div class="wind-legend-bar"></div>' +
        '<div class="wind-legend-labels"><span>0</span><span>3</span><span>8</span><span>15</span><span>25</span></div>' +
        '<div class="wind-legend-items">' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#64b4ff;"></span>< 3 &mdash; Calm</div>' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#32dc78;"></span>3 &ndash; 8 &mdash; Light</div>' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#ffdc32;"></span>8 &ndash; 15 &mdash; Moderate</div>' +
          '<div class="wind-legend-item"><span class="wind-legend-dot" style="background:#ff5032;"></span>&ge; 15 &mdash; Strong</div>' +
        '</div>' +
        '<div class="wind-legend-unit">Sumber: BMKG GFS</div>';
      return div;
    }
  });

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function buildDateStr(d) {
    return '' + d.getUTCFullYear()
      + pad2(d.getUTCMonth() + 1)
      + pad2(d.getUTCDate())
      + pad2(d.getUTCHours()) + '00';
  }

  function calcForecastTime() {
    var now = new Date();
    var utcH = now.getUTCHours();
    var forecast = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));

    if (utcH >= 12) {
      forecast.setUTCDate(forecast.getUTCDate() + 1);
      forecast.setUTCHours(3, 0, 0, 0);
    } else if (utcH >= 3) {
      forecast.setUTCHours(12, 0, 0, 0);
    } else {
      forecast.setUTCHours(3, 0, 0, 0);
    }

    return forecast;
  }

  function calcModelRun() {
    var now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  }

  function formatInfo(modelRun, forecast) {
    var m = buildDateStr(modelRun);
    var f = buildDateStr(forecast);
    var ms = m.slice(6, 8) + ' ' + m.slice(8, 10) + 'Z ' + m.slice(4, 6) + '/' + m.slice(0, 4);
    var fs = f.slice(6, 8) + ' ' + f.slice(8, 10) + 'Z ' + f.slice(4, 6) + '/' + f.slice(0, 4);
    return ms + ' → ' + fs;
  }

  function loadProvinsi() {
    if (provinsiLoaded) {
      if (provinsiLayer) provinsiLayer.addTo(map);
      return;
    }
    var xhr = new XMLHttpRequest();
    xhr.open('GET', PROV_GEOJSON_URL, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          var geojson = JSON.parse(xhr.responseText);
          provinsiLayer = L.geoJSON(geojson, {
            style: {
              color: '#ffffff',
              weight: 1.2,
              opacity: 0.6,
              fillColor: '#3b82f6',
              fillOpacity: 0.03
            },
            interactive: false
          }).addTo(map);
          provinsiLoaded = true;
        } catch (e) {
          console.error('[WindRgb] Gagal load provinsi GeoJSON:', e);
        }
      }
    };
    xhr.send();
  }

  function showLegend() {
    if (!legendControl) {
      legendControl = new WindLegend();
      legendControl.addTo(map);
    }
  }

  function hideLegend() {
    if (legendControl) {
      map.removeControl(legendControl);
      legendControl = null;
    }
  }

  function showWindRgb() {
    if (windRgbLayer) { map.removeLayer(windRgbLayer); windRgbLayer = null; }

    var modelRun = calcModelRun();
    var forecast = calcForecastTime();
    var mr = buildDateStr(modelRun);
    var fc = buildDateStr(forecast);

    var url = WIND_RGB_BASE + '/' + mr + '/' + fc + '/{z}/{x}/{y}.png';
    windRgbLayer = L.tileLayer(url, {
      tileSize: 256,
      opacity: 0.7,
      maxZoom: 8,
      minZoom: 0,
      tms: true,
      attribution: 'BMKG GFS Wind RGB'
    }).addTo(map);

    loadProvinsi();
    showLegend();

    var info = document.getElementById('windRgbInfo');
    if (info) info.textContent = formatInfo(modelRun, forecast);
  }

  function hideWindRgb() {
    if (windRgbLayer) { map.removeLayer(windRgbLayer); windRgbLayer = null; }
    if (provinsiLayer) { map.removeLayer(provinsiLayer); }
    hideLegend();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var checkbox = document.getElementById('toggleWindRgb');
    if (!checkbox) return;

    var modelRun = calcModelRun();
    var forecast = calcForecastTime();
    var info = document.getElementById('windRgbInfo');
    if (info) info.textContent = formatInfo(modelRun, forecast);

    checkbox.addEventListener('change', function () {
      if (this.checked) {
        showWindRgb();
        map.flyTo([-1.5, 118.5], 5, { duration: 1.5 });
      } else {
        hideWindRgb();
      }
    });
  });
})();
