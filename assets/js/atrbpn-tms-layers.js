/* ── ATRBPN TMS Layers (LSD, LBS, KP2B, DI, Saluran, RTRW) ── */
(function () {
  'use strict';

  var LAYERS = {
    'toggleLsdTmsLayer': {
      url: 'https://pptr.dasmap.com/layers/tms/public/269_lhnswhdlng/{z}/{x}/{y}/?tileSize=1024',
      center: [-7.68, 110.84], zoom: 12, label: 'Lahan Sawah Dilindungi (LSD)',
      legend: {
        title: 'Lahan Sawah Dilindungi (LSD)',
        items: [
          { color: '#228B22', label: 'Lahan Sawah Dilindungi' }
        ],
        source: 'Sumber: ATRBPN / Kementerian ATR/BPN'
      }
    },
    'toggleLbsTmsLayer': {
      url: 'https://pptr.dasmap.com/layers/tms/public/222_lhnbkswh/{z}/{x}/{y}/?tileSize=1024',
      center: [-7.68, 110.84], zoom: 12, label: 'Lahan Baku Sawah',
      legend: {
        title: 'Lahan Baku Sawah',
        items: [
          { color: '#32CD32', label: 'Lahan Baku Sawah' }
        ],
        source: 'Sumber: ATRBPN / Kementerian ATR/BPN'
      }
    },
    'toggleKp2bTmsLayer': {
      url: 'https://pptr.dasmap.com/layers/tms/public/270_kp2b/{z}/{x}/{y}/?tileSize=1024',
      center: [-7.68, 110.84], zoom: 12, label: 'KP2B',
      legend: {
        title: 'KP2B (Kawasan Perencanaan Pertanahan untuk Kebutuhan Publik)',
        items: [
          { color: '#FF6347', label: 'Kawasan Perencanaan Pertanahan' }
        ],
        source: 'Sumber: ATRBPN / Kementerian ATR/BPN'
      }
    },
    'toggleDiTmsLayer': {
      url: 'https://pptr.dasmap.com/layers/tms/public/224_drhirgs/{z}/{x}/{y}/?tileSize=1024',
      center: [-2.0, 117.0], zoom: 5, label: 'Daerah Irigasi',
      legend: {
        title: 'Daerah Irigasi',
        items: [
          { color: '#1E90FF', label: 'Daerah Irigasi' }
        ],
        source: 'Sumber: ATRBPN / Kementerian ATR/BPN'
      }
    },
    'toggleSaluranIrTmsLayer': {
      url: 'https://pptr.dasmap.com/layers/tms/public/223_slrnirgs/{z}/{x}/{y}/?tileSize=1024',
      center: [-2.0, 117.0], zoom: 5, label: 'Saluran Irigasi',
      legend: {
        title: 'Saluran Irigasi',
        items: [
          { color: '#4169E1', label: 'Saluran Irigasi' }
        ],
        source: 'Sumber: ATRBPN / Kementerian ATR/BPN'
      }
    },
    'toggleRtrwTmsLayer': {
      url: 'https://pptr.dasmap.com/layers/tms/public/212_rtrwkbpt/{z}/{x}/{y}/?tileSize=1024',
      center: [-7.9666, 112.6326], zoom: 12, label: 'RTRW Kabupaten/Kota',
      legend: {
        title: 'RTRW Kabupaten/Kota',
        items: [
          { color: '#9370DB', label: 'Rencana Tata Ruang Wilayah' }
        ],
        source: 'Sumber: ATRBPN / Kementerian ATR/BPN'
      }
    }
  };

  var active = {};
  var legendActive = {};

  function show(id) {
    var c = LAYERS[id];
    if (!c) return;
    if (active[id]) { map.removeLayer(active[id]); }
    active[id] = L.tileLayer(c.url, {
      tileSize: 256, opacity: 0.7, maxZoom: 18, minZoom: 0, attribution: c.label
    }).addTo(map);
    map.flyTo(c.center, c.zoom, { duration: 1.5 });
    showLegend(id);
  }

  function hide(id) {
    if (active[id]) { map.removeLayer(active[id]); delete active[id]; }
    hideLegend(id);
  }

  function showLegend(id) {
    var c = LAYERS[id];
    if (!c || !c.legend || legendActive[id]) return;
    if (typeof addUnifiedLegend !== 'function') return;

    var div = L.DomUtil.create('div', 'atrbpn-legend');
    L.DomEvent.disableClickPropagation(div);

    var itemsHtml = '';
    for (var i = 0; i < c.legend.items.length; i++) {
      var item = c.legend.items[i];
      itemsHtml += '<div class="atrbpn-legend-item">' +
        '<span class="atrbpn-legend-dot" style="background:' + item.color + ';"></span>' +
        '<span>' + item.label + '</span>' +
      '</div>';
    }

    div.innerHTML =
      '<div class="atrbpn-legend-title">' + c.legend.title + '</div>' +
      '<div class="atrbpn-legend-items">' + itemsHtml + '</div>' +
      '<div class="atrbpn-legend-source">' + c.legend.source + '</div>';

    addUnifiedLegend('atrbpn-' + id, typeof createLegendWithToggle === 'function' ? createLegendWithToggle(div) : div);
    legendActive[id] = true;
  }

  function hideLegend(id) {
    if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('atrbpn-' + id);
    legendActive[id] = false;
  }

  window.toggleAtrbpnTmsLayer = function (id, visible) {
    if (visible) show(id); else hide(id);
  };

  window.isAtrbpnTmsActive = function (id) {
    return !!(active[id] && map.hasLayer(active[id]));
  };
})();
