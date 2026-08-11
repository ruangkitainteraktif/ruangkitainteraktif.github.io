  // Geotani Layer Tree — jsTree
  function initGeotaniTree() {
    var container = document.getElementById('geotaniLayerTree');
    if (!container) return;

    var treeData = [
      {
        id: 'grp-ksp', text: 'Lahan Baku Sawah (KSP BIG)', children: [
          { id: 'toggleSawahDilindungi', text: 'LSD 50K', li_attr: { 'data-toggle': 'special' } },
          { id: 'toggleSawahNasional50k', text: 'LBS 50K', li_attr: { 'data-toggle': 'special' } }
        ], state: { opened: true }, li_attr: { 'data-level': '0' }
      },
      {
        id: 'grp-kementan', text: 'Lahan Baku Sawah (KEMENTAN)', children: [
          { id: 'arcgis-sawah-2023', text: 'LBS 2023', li_attr: { 'data-toggle': 'arcgis' } },
          { id: 'arcgis-sawah-2019', text: 'LBS 2019', li_attr: { 'data-toggle': 'arcgis' } }
        ], state: { opened: true }, li_attr: { 'data-level': '0' }
      },
      {
        id: 'grp-kta', text: 'Peta Rawan Erosi (BIG)', children: [
          { id: 'toggleErosiLayer', text: 'Peta Rawan Erosi (BIG)', li_attr: { 'data-toggle': 'special' } }
        ], state: { opened: true }, li_attr: { 'data-level': '0' }
      },
      {
        id: 'grp-kawasan', text: 'Kawasan Pertanian', children: [
          { id: 'arcgis-kawasan-padi', text: 'Kawasan Padi', li_attr: { 'data-toggle': 'arcgis' } },
          { id: 'arcgis-kawasan-jagung', text: 'Kawasan Jagung', li_attr: { 'data-toggle': 'arcgis' } },
          { id: 'arcgis-kawasan-kedelai', text: 'Kawasan Kedelai', li_attr: { 'data-toggle': 'arcgis' } }
        ], state: { opened: true }, li_attr: { 'data-level': '0' }
      },
      {
        id: 'grp-bpp', text: 'Balai Penyuluhan Pertanian', children: [
          { id: 'toggleBppLayer', text: 'BPP', li_attr: { 'data-toggle': 'special' } }
        ], state: { opened: true }, li_attr: { 'data-level': '0' }
      },
      {
        id: 'grp-sawit', text: 'IGT Sawit', children: [
          { id: 'toggleSawitLayer', text: 'IGT Sawit 2023', li_attr: { 'data-toggle': 'special' } }
        ], state: { opened: true }, li_attr: { 'data-level': '0' }
      }
    ];

    $(container).jstree({
      core: {
        data: treeData,
        themes: { dots: true, icons: true },
        check_callback: true,
        animation: 120
      },
      checkbox: {
        keep_selected_style: false,
        three_state: false,
        whole_node: true,
        tie_selection: false
      },
      plugins: ['checkbox']
    });

    $(container).on('check_node.jstree', function (e, data) {
      var node = data.node;
      if (node.children && node.children.length) return;
      var toggleType = node.li_attr['data-toggle'];

      geotaniToggleLayer(node.id, true, toggleType);
    });

    $(container).on('uncheck_node.jstree', function (e, data) {
      var node = data.node;
      if (node.children && node.children.length) return;
      var toggleType = node.li_attr['data-toggle'];

      geotaniToggleLayer(node.id, false, toggleType);
    });
  }

  function geotaniToggleLayer(layerId, visible, toggleType) {
    if (toggleType === 'arcgis') {
      toggleArcgisSawah(layerId, visible);
    } else {
      var fnMap = {
        'toggleSawahDilindungi': toggleSawahDilindungi,
        'toggleSawahNasional50k': toggleSawahNasional50k,
        'toggleErosiLayer': toggleErosiLayer,
        'toggleBppLayer': typeof toggleBppLayer === 'function' ? toggleBppLayer : null,
        'toggleSawitLayer': typeof toggleSawitLayer === 'function' ? toggleSawitLayer : null
      };
      var fn = fnMap[layerId];
      if (fn) fn(visible);
      else console.warn('[Geotani] Toggle function not found for:', layerId);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(initGeotaniTree, 500);
  });
