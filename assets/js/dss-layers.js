/* ── DSS SIMANTAN KLHK layers (feature layers, transparent + popup) ──
   Menggunakan featureLayer (bukan dynamicMapLayer) agar latar belakang
   transparan (tidak menutupi base map) dan setiap fitur punya popup. */
(function () {
  'use strict';

  var BASE = 'https://simontana.kehutanan.go.id/arcgis/rest/services/dss/';

  var DEFS = [
    { id: 'toggleSawitNasionalLayer',    color: '#ffd24d', title: 'Sawit Nasional',          urls: [BASE + 'sawit_nasional/MapServer/0'] },
    { id: 'toggleSawitPerkebunanLayer',  color: '#ff9f40', title: 'Sawit dan Perkebunan',    urls: [BASE + 'sawit_dan_perkebunan/MapServer/0'] },
    { id: 'toggleRehabDasLayer',         color: '#4dd0a0', title: 'Rehab DAS',                urls: [BASE + 'REHAB_DAS/MapServer/0'] },
    { id: 'togglePerkebunanPl24Layer',   color: '#9ccc65', title: 'Perkebunan PL24',          urls: [BASE + 'perkebunan_pl24/MapServer/0'] },
    { id: 'toggleRktnSumateraLayer',     color: '#ba68c8', title: 'RKTN Sumatera',           urls: [BASE + 'rktn/MapServer/0'] },
    { id: 'toggleRktnSulawesiLayer',     color: '#7986cb', title: 'RKTN Sulawesi',           urls: [BASE + 'rktn/MapServer/1'] },
    { id: 'toggleRktnPapuaLayer',        color: '#4db6ac', title: 'RKTN Papua',              urls: [BASE + 'rktn/MapServer/2'] },
    { id: 'toggleRktnMalukuLayer',       color: '#4fc3f7', title: 'RKTN Maluku',             urls: [BASE + 'rktn/MapServer/3'] },
    { id: 'toggleRktnKalimantanLayer',   color: '#aed581', title: 'RKTN Kalimantan',         urls: [BASE + 'rktn/MapServer/4'] },
    { id: 'toggleRktnJawaLayer',         color: '#ffb74d', title: 'RKTN Jawa',               urls: [BASE + 'rktn/MapServer/5'] },
    { id: 'toggleRktnBaliNtLayer',       color: '#f06292', title: 'RKTN Bali & NT',          urls: [BASE + 'rktn/MapServer/6'] }
  ];

  var SKIP = { objectid: 1, shape: 1, 'st_area(shape)': 1, 'st_length(shape)': 1, shape_leng: 1, shape_length: 1, shape_area: 1 };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
    });
  }

  function fmtVal(v) {
    if (v == null) return null;
    if (typeof v === 'number') return Number(v).toLocaleString('id-ID', { maximumFractionDigits: 2 });
    return String(v);
  }

  function buildPopup(title, color, props) {
    var rows = '';
    Object.keys(props || {}).forEach(function (k) {
      if (SKIP[String(k).toLowerCase()]) return;
      var val = fmtVal(props[k]);
      if (val === '' || val == null) return;
      rows += '<div class="agol-popup-field"><span class="agol-popup-field-label">' + esc(k) +
        '</span><span class="agol-popup-field-value">' + esc(val) + '</span></div>';
    });
    var html = '<div class="agol-popup" style="min-width:240px">';
    html += '<div class="agol-popup-header agol-geo-kawasan">';
    html += '<div class="agol-popup-badge"><span class="agol-popup-badge-dot" style="background:' + color + ';"></span>' + esc(title) + '</div>';
    html += '</div>';
    html += '<div class="agol-popup-body"><div class="agol-popup-fields">' +
      (rows || '<div class="agol-popup-field"><span class="agol-popup-field-value">-</span></div>') + '</div></div>';
    html += '<div class="agol-popup-footer"><span>Sumber: SIMANTAN KLHK</span></div>';
    html += '</div>';
    return html;
  }

  function makeFeatureLayer(url, color, title) {
    var l = L.esri.featureLayer({
      url: url,
      where: '1=1',
      outFields: ['*'],
      style: function () {
        return { color: color, weight: 1, opacity: 0.9, fillColor: color, fillOpacity: 0.4 };
      },
      onEachFeature: function (f, ly) {
        ly.bindPopup(buildPopup(title, color, f.properties), { maxWidth: 340, className: 'agol-leaflet-popup' });
      }
    });
    l.on('error', function (e) { console.error('[' + title + '] Error:', e); });
    return l;
  }

  var layersById = {};

  function getLayers(def) {
    if (!layersById[def.id]) {
      layersById[def.id] = def.urls.map(function (u) { return makeFeatureLayer(u, def.color, def.title); });
    }
    return layersById[def.id];
  }

  function toggle(def, v) {
    getLayers(def).forEach(function (l) {
      if (v) {
        if (!map.hasLayer(l)) l.addTo(map);
      } else if (map.hasLayer(l)) {
        map.removeLayer(l);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    DEFS.forEach(function (def) {
      var cb = document.getElementById(def.id);
      if (cb) {
        cb.addEventListener('change', function () { toggle(def, this.checked); });
      }
    });
  });

  window.dssLayersCleanup = function (id) {
    if (id) {
      var def = DEFS.filter(function (d) { return d.id === id; })[0];
      if (def) {
        getLayers(def).forEach(function (l) { if (map.hasLayer(l)) map.removeLayer(l); });
        var cb = document.getElementById(id);
        if (cb) cb.checked = false;
      }
      return;
    }
    DEFS.forEach(function (def) {
      getLayers(def).forEach(function (l) { if (map.hasLayer(l)) map.removeLayer(l); });
      var cb = document.getElementById(def.id);
      if (cb) cb.checked = false;
    });
  };
})();
