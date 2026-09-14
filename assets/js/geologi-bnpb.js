/* ── Peta Geologi (BNPB) — Dynamic Overlay ── */
(function () {
  'use strict';

  var GEOLOGI_URL = 'https://gis.bnpb.go.id/server/rest/services/thematic/PETA_GEOLOGI/MapServer';
  var _geologiLayer = null;
  var _geologiActive = false;
  var _geologiLegendActive = false;

  var GEOLOGI_AGE_COLOR = {
    'Holosen': '#8b50c7', 'Kuarter': '#62c232', 'Neogen': '#ba5a30',
    'Miocene': '#4aaec2', 'Miosen': '#4aaec2', 'Oligocene': '#c22d61',
    'Paleogen': '#c9b34f', 'Pra Tersier': '#235ca6', 'Meso - Paleo': '#3da167',
    'Paleo - Meso': '#3da167', 'Tersier': '#c932a4', 'Mesozoikum': '#2523a6',
    'Jura': '#709c3b', 'Triassic': '#b52634', 'Trias': '#b52634',
    'Paleozoikum': '#32bfaa', 'Perm': '#9c6d22', 'Permian': '#9c6d22',
    'Pre-Permia': '#27a847', 'Carbonifer': '#c9c42e', 'Karbon': '#c9c42e',
    'Permo Karbon': '#3982b3', 'Kapur': '#2c49bf', 'Devonian': '#9e423f',
    'Silurian': '#9924ad', 'Ordovician': '#9c3379', 'Prakambrium': '#5433a3',
    'Proteroz': '#a0b336'
  };

  var GEOLOGI_AGE_ORDER = [
    'Holosen', 'Kuarter', 'Neogen', 'Oligocene', 'Miosen', 'Miocene',
    'Paleogen', 'Tersier', 'Pra Tersier', 'Kapur', 'Jura', 'Trias',
    'Triassic', 'Mesozoikum', 'Meso - Paleo', 'Paleo - Meso', 'Perm',
    'Permian', 'Permo Karbon', 'Karbon', 'Carbonifer', 'Pre-Permia',
    'Devonian', 'Silurian', 'Ordovician', 'Paleozoikum', 'Prakambrium',
    'Proteroz'
  ];

  var _shownAges = [];

  function fetchUniqueAges(callback) {
    var url = GEOLOGI_URL + '/1/query?where=1%3D1&outFields=UMUROBJ&returnGeometry=false&returnDistinctValues=true&f=json';
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.features) {
          var ages = data.features
            .map(function (f) { return f.attributes.UMUROBJ; })
            .filter(function (a) { return a; });
          callback(ages);
        } else {
          callback([]);
        }
      })
      .catch(function () { callback([]); });
  }

  function sortAges(ages) {
    var order = {};
    GEOLOGI_AGE_ORDER.forEach(function (a, i) { order[a] = i; });
    return ages.slice().sort(function (a, b) {
      var ia = order[a] !== undefined ? order[a] : 999;
      var ib = order[b] !== undefined ? order[b] : 999;
      return ia - ib;
    });
  }

  function showGeologiLegend() {
    if (_geologiLegendActive) return;
    if (typeof addUnifiedLegend !== 'function') return;

    fetchUniqueAges(function (ages) {
      var sorted = sortAges(ages);
      _shownAges = sorted;

      var div = document.createElement('div');
      div.className = 'geologi-bnpb-legend';
      L.DomEvent.disableClickPropagation(div);

      var html = '<div class="geologi-bnpb-legend-title">Peta Geologi (BNPB)</div>';
      html += '<div class="geologi-bnpb-legend-items">';
      sorted.forEach(function (age) {
        var color = GEOLOGI_AGE_COLOR[age] || '#6b7280';
        html += '<div class="geologi-bnpb-legend-item">' +
          '<span class="geologi-bnpb-legend-swatch" style="background:' + color + ';"></span>' +
          '<span class="geologi-bnpb-legend-label">' + age + '</span>' +
        '</div>';
      });
      html += '</div>';
      html += '<div class="geologi-bnpb-legend-source">Sumber: BNPB - Peta Geologi Indonesia</div>';
      div.innerHTML = html;

      addUnifiedLegend('geologi-bnpb', typeof createLegendWithToggle === 'function' ? createLegendWithToggle(div) : div);
      _geologiLegendActive = true;
    });
  }

  function hideGeologiLegend() {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('geologi-bnpb');
    _geologiLegendActive = false;
    _shownAges = [];
  }

  function showGeologi() {
    if (!_geologiLayer) {
      _geologiLayer = L.esri.dynamicMapLayer({
        url: GEOLOGI_URL,
        layers: [1],
        opacity: 0.6
      });
    }
    if (!map.hasLayer(_geologiLayer)) _geologiLayer.addTo(map);
    _geologiActive = true;
    showGeologiLegend();
  }

  function hideGeologi() {
    if (_geologiLayer && map.hasLayer(_geologiLayer)) map.removeLayer(_geologiLayer);
    _geologiActive = false;
    hideGeologiLegend();
  }

  function isGeologiActive() {
    return _geologiActive;
  }

  function cleanupGeologi() {
    hideGeologi();
    _geologiLayer = null;
  }

  window.toggleGeologiBNPB = function (visible) {
    if (visible) showGeologi(); else hideGeologi();
  };
  window.isGeologiBNPBActive = isGeologiActive;
  window.geologiBNPBCleanup = cleanupGeologi;
})();
