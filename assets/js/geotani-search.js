  // Geotani Layer Tree — jsTree
  function initGeotaniTree() {
    var container = document.getElementById('geotaniLayerTree');
    if (!container) return;

    var treeData = [
      {
        id: 'grp-st2023-bps', text: 'Sensus Pertanian 2023 (BPS)', state: { opened: false }, li_attr: { 'data-level': '0' },
        children: [
          {
            id: 'grp-st2023-batas', text: 'Batas Administrasi', li_attr: { 'data-level': '1' }, children: [
              { id: 'st2023:batas_desa', text: 'Batas Desa', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:batas_kecamatan', text: 'Batas Kecamatan', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:batas_kabupaten', text: 'Batas Kabupaten', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:batas_provinsi', text: 'Batas Provinsi', li_attr: { 'data-toggle': 'bpswms' } }
            ]
          },
          {
            id: 'grp-st2023-dasymetric', text: 'Dasymetric UTP', li_attr: { 'data-level': '1' }, children: [
              { id: 'st2023:dasymetric_utp', text: 'Dasymetric UTP (Dasar)', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:dasymetric_utp_tp', text: 'Dasymetric UTP Tanaman Pangan', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:dasymetric_utp_horti', text: 'Dasymetric UTP Hortikultura', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:dasymetric_utp_holti', text: 'Dasymetric UTP Holtikultura', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:dasymetric_utp_hutan', text: 'Dasymetric UTP Hutan', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:dasymetric_utp_ikan', text: 'Dasymetric UTP Perikanan', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:dasymetric_utp_kebun', text: 'Dasymetric UTP Perkebunan', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:dasymetric_utp_milenial', text: 'Dasymetric UTP Petani Milenial', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:dasymetric_utp_ternak', text: 'Dasymetric UTP Peternakan', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:dasymetric_utp_urban', text: 'Dasymetric UTP Urban', li_attr: { 'data-toggle': 'bpswms' } }
            ]
          },
          {
            id: 'grp-st2023-geotagging', text: 'Geotagging', li_attr: { 'data-level': '1' }, children: [
              { id: 'st2023:geotagging', text: 'Geotagging (Semua)', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:geotagging_tanaman_pangan', text: 'Geotagging Tanaman Pangan', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:geotagging_hortikultura', text: 'Geotagging Hortikultura', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:geotagging_kebun', text: 'Geotagging Perkebunan', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:geotagging_hutan', text: 'Geotagging Hutan', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:geotagging_ikan', text: 'Geotagging Perikanan', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:geotagging_ternak', text: 'Geotagging Peternakan', li_attr: { 'data-toggle': 'bpswms' } }
            ]
          },
          {
            id: 'grp-st2023-lainnya', text: 'Infrastruktur & Lainnya', li_attr: { 'data-level': '1' }, children: [
              { id: 'st2023:infrastruktur_pertanian', text: 'Infrastruktur Pertanian', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:gurem_lahan_vw', text: 'Gurem Lahan', li_attr: { 'data-toggle': 'bpswms' } }
            ]
          },
          {
            id: 'grp-st2023-ihk', text: 'UTP IHK 01-17', li_attr: { 'data-level': '1' }, children: [
              { id: 'st2023:utp_ihk_01', text: 'UTP IHK 01', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:utp_ihk_02', text: 'UTP IHK 02', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:utp_ihk_03', text: 'UTP IHK 03', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:utp_ihk_04', text: 'UTP IHK 04', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:utp_ihk_05', text: 'UTP IHK 05', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:utp_ihk_06', text: 'UTP IHK 06', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:utp_ihk_07', text: 'UTP IHK 07', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:utp_ihk_08', text: 'UTP IHK 08', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:utp_ihk_09', text: 'UTP IHK 09', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:utp_ihk_10', text: 'UTP IHK 10', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:utp_ihk_11', text: 'UTP IHK 11', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:utp_ihk_12', text: 'UTP IHK 12', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:utp_ihk_13', text: 'UTP IHK 13', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:utp_ihk_14', text: 'UTP IHK 14', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:utp_ihk_15', text: 'UTP IHK 15', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:utp_ihk_16', text: 'UTP IHK 16', li_attr: { 'data-toggle': 'bpswms' } },
              { id: 'st2023:utp_ihk_17', text: 'UTP IHK 17', li_attr: { 'data-toggle': 'bpswms' } }
            ]
          }
        ]
      },
      {
        id: 'grp-ksa-bps', text: 'Lahan Baku Sawah (KSA BPS)', children: [
          { id: 'bps-lbs-2024', text: 'LBS Nasional 2024', li_attr: { 'data-toggle': 'wmts' } }
        ], state: { opened: false }, li_attr: { 'data-level': '0' }
      },
      {
        id: 'grp-ksp', text: 'Lahan Baku Sawah (KSP BIG)', children: [
          { id: 'toggleSawahDilindungi', text: 'LSD 50K', li_attr: { 'data-toggle': 'special' } },
          { id: 'toggleSawahNasional50k', text: 'LBS 50K', li_attr: { 'data-toggle': 'special' } }
        ], state: { opened: false }, li_attr: { 'data-level': '0' }
      },
      {
        id: 'grp-kementan', text: 'Lahan Baku Sawah (KEMENTAN)', children: [
          { id: 'arcgis-sawah-2023', text: 'LBS 2023', li_attr: { 'data-toggle': 'arcgis' } },
          { id: 'arcgis-sawah-2019', text: 'LBS 2019', li_attr: { 'data-toggle': 'arcgis' } }
        ], state: { opened: false }, li_attr: { 'data-level': '0' }
      },
      {
        id: 'grp-tl-bps', text: 'Tutupan Lahan (KSA BPS)', children: [
          { id: 'toggleBpsTutupanLahan', text: 'Peta Tutupan Lahan 100 m', li_attr: { 'data-toggle': 'special' } }
        ], state: { opened: false }, li_attr: { 'data-level': '0' }
      },
      {
        id: 'grp-kta', text: 'Peta Rawan Erosi (BIG)', children: [
          { id: 'toggleErosiLayer', text: 'Peta Rawan Erosi (BIG)', li_attr: { 'data-toggle': 'special' } }
        ], state: { opened: false }, li_attr: { 'data-level': '0' }
      },
      {
        id: 'grp-kawasan', text: 'Kawasan Pertanian', children: [
          { id: 'arcgis-kawasan-padi', text: 'Kawasan Padi', li_attr: { 'data-toggle': 'arcgis' } },
          { id: 'arcgis-kawasan-jagung', text: 'Kawasan Jagung', li_attr: { 'data-toggle': 'arcgis' } },
          { id: 'arcgis-kawasan-kedelai', text: 'Kawasan Kedelai', li_attr: { 'data-toggle': 'arcgis' } }
        ], state: { opened: false }, li_attr: { 'data-level': '0' }
      },
      {
        id: 'grp-bpp', text: 'Balai Penyuluhan Pertanian', children: [
          { id: 'toggleBppLayer', text: 'BPP', li_attr: { 'data-toggle': 'special' } }
        ], state: { opened: false }, li_attr: { 'data-level': '0' }
      },
      {
        id: 'grp-sawit', text: 'IGT Sawit', children: [
          { id: 'toggleSawitLayer', text: 'IGT Sawit 2023', li_attr: { 'data-toggle': 'special' } }
        ], state: { opened: false }, li_attr: { 'data-level': '0' }
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
    if (toggleType === 'bpswms') {
      toggleBpsSt2023Layer(layerId, visible);
      return;
    }
    if (toggleType === 'wmts') {
      toggleBpsWmts(layerId, visible);
      return;
    }
    if (toggleType === 'arcgis') {
      toggleArcgisSawah(layerId, visible);
    } else {
      var fnMap = {
        'toggleSawahDilindungi': toggleSawahDilindungi,
        'toggleSawahNasional50k': toggleSawahNasional50k,
        'toggleErosiLayer': toggleErosiLayer,
        'toggleBppLayer': typeof toggleBppLayer === 'function' ? toggleBppLayer : null,
        'toggleSawitLayer': typeof toggleSawitLayer === 'function' ? toggleSawitLayer : null,
        'toggleBpsTutupanLahan': typeof toggleBpsTutupanLahan === 'function' ? toggleBpsTutupanLahan : null
      };
      var fn = fnMap[layerId];
      if (fn) fn(visible);
      else console.warn('[Geotani] Toggle function not found for:', layerId);
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(initGeotaniTree, 500);
  });
