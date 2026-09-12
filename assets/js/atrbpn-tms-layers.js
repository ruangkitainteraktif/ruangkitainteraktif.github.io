/* ── ATRBPN TMS Layers (LSD, LBS, KP2B, DI, Saluran, RTRW) ── */
(function () {
  'use strict';

  var LAYERS = {
    'toggleLsdTmsLayer': {
      url: 'https://pptr.dasmap.com/layers/tms/public/269_lhnswhdlng/{z}/{x}/{y}/?tileSize=1024',
      center: [-7.68, 110.84], zoom: 12, label: 'Lahan Sawah Dilindungi (LSD)'
    },
    'toggleLbsTmsLayer': {
      url: 'https://pptr.dasmap.com/layers/tms/public/222_lhnbkswh/{z}/{x}/{y}/?tileSize=1024',
      center: [-7.68, 110.84], zoom: 12, label: 'Lahan Baku Sawah'
    },
    'toggleKp2bTmsLayer': {
      url: 'https://pptr.dasmap.com/layers/tms/public/270_kp2b/{z}/{x}/{y}/?tileSize=1024',
      center: [-7.68, 110.84], zoom: 12, label: 'KP2B'
    },
    'toggleDiTmsLayer': {
      url: 'https://pptr.dasmap.com/layers/tms/public/224_drhirgs/{z}/{x}/{y}/?tileSize=1024',
      center: [-2.0, 117.0], zoom: 5, label: 'Daerah Irigasi'
    },
    'toggleSaluranIrTmsLayer': {
      url: 'https://pptr.dasmap.com/layers/tms/public/223_slrnirgs/{z}/{x}/{y}/?tileSize=1024',
      center: [-2.0, 117.0], zoom: 5, label: 'Saluran Irigasi'
    },
    'toggleRtrwTmsLayer': {
      url: 'https://pptr.dasmap.com/layers/tms/public/212_rtrwkbpt/{z}/{x}/{y}/?tileSize=1024',
      center: [-2.0, 117.0], zoom: 5, label: 'RTRW Kabupaten/Kota'
    }
  };

  var active = {};

  function show(id) {
    var c = LAYERS[id];
    if (!c) return;
    if (active[id]) { map.removeLayer(active[id]); }
    active[id] = L.tileLayer(c.url, {
      tileSize: 256, opacity: 0.7, maxZoom: 18, minZoom: 0, attribution: c.label
    }).addTo(map);
    map.flyTo(c.center, c.zoom, { duration: 1.5 });
  }

  function hide(id) {
    if (active[id]) { map.removeLayer(active[id]); delete active[id]; }
  }

  window.toggleAtrbpnTmsLayer = function (id, visible) {
    if (visible) show(id); else hide(id);
  };

  window.isAtrbpnTmsActive = function (id) {
    return !!(active[id] && map.hasLayer(active[id]));
  };
})();
