(function () {
  'use strict';

  var LAYER_SOURCES = {
    'lsd-50k': {
      label: 'LSD 50K (BIG)',
      query: 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/59/query',
      nameField: 'lsd',
      titleField: 'lsd',
      areaField: 'luasha',
      areaUnit: 'ha',
      dateField: null,
      nameLabel: 'Jenis',
      emptyMessage: 'Tidak ada polygon LSD 50K di wilayah ini.',
      loadingMessage: 'Memuat data LSD 50K...',
      source: 'BIG KSP SatuPeta - LSD 50K',
      tableFields: [
        { key: 'lsd', label: 'Jenis' },
        { key: 'luasha', label: 'Luas', type: 'ha' },
        { key: 'wadmkk', label: 'Kab/Kota' },
        { key: 'fgsfrf', label: 'Fungsi' }
      ],
      extraFields: [
        { key: 'wadmpr', label: 'Provinsi' },
        { key: 'wadmkk', label: 'Kab/Kota' },
        { key: 'ctkswh', label: 'Cetak Sawah' },
        { key: 'remark', label: 'Keterangan' }
      ],
      colors: {
        'Lahan Sawah yang Dilindungi di Dalam Kawasan Hutan': '#ffaa00',
        'Lahan Sawah yang Dilindungi di Luar Kawasan Hutan': '#aaff00'
      }
    },
    'lbs-50k': {
      label: 'LBS 50K (BIG)',
      query: 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/36/query',
      nameField: 'q_name19',
      titleField: 'q_name19',
      areaField: 'luas_polyg',
      areaUnit: 'ha',
      dateField: null,
      nameLabel: 'Nama',
      emptyMessage: 'Tidak ada polygon LBS 50K di wilayah ini.',
      loadingMessage: 'Memuat data LBS 50K...',
      source: 'BIG KSP SatuPeta - LBS 50K',
      tableFields: [
        { key: 'q_name19', label: 'Nama' },
        { key: 'luas_polyg', label: 'Luas', type: 'ha' },
        { key: 'wadmkk', label: 'Kab/Kota' },
        { key: 'wadmpr', label: 'Provinsi' }
      ],
      extraFields: [
        { key: 'wadmpr', label: 'Provinsi' },
        { key: 'wadmkk', label: 'Kab/Kota' }
      ],
      colors: {
        'Sawah': '#e6fcc0'
      }
    },
    'likuifaksi-big': {
      label: 'Kerentanan Likuifaksi (BIG)',
      query: 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/43/query',
      nameField: 'kerentanan',
      titleField: 'namobj',
      areaField: null,
      dateField: null,
      nameLabel: 'Kerentanan',
      emptyMessage: 'Tidak ada polygon kerentanan likuifaksi di wilayah ini.',
      loadingMessage: 'Memuat data kerentanan likuifaksi...',
      source: 'BIG KSP SatuPeta - Kerentanan Likuifaksi 1:100K',
      tableFields: [
        { key: 'kerentanan', label: 'Kerentanan', type: 'nameMap' },
        { key: 'namobj', label: 'Nama Objek' },
        { key: 'metadata', label: 'Metadata' }
      ],
      extraFields: [
        { key: 'keterangan', label: 'Keterangan' },
        { key: 'metadata', label: 'Metadata' }
      ],
      nameMap: {
        '1': 'Tinggi',
        '2': 'Sedang',
        '3': 'Rendah'
      },
      colors: {
        'Tinggi': '#dc2626',
        'Sedang': '#f59e0b',
        'Rendah': '#a78bfa'
      }
    },
    'geostruktur-big': {
      label: 'Geologi Geostruktur (BIG)',
      query: 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/9/query',
      nameField: 'namaobj',
      titleField: 'namaobj',
      areaField: null,
      dateField: null,
      nameLabel: 'Jenis',
      geomKind: 'line',
      emptyMessage: 'Tidak ada garis geostruktur di wilayah ini.',
      loadingMessage: 'Memuat data geologi geostruktur...',
      source: 'BIG KSP SatuPeta - Geostruktur',
      tableFields: [
        { key: 'namaobj', label: 'Jenis' },
        { key: 'klsstr', label: 'Kelas Struktur' },
        { key: 'remark', label: 'Nama' },
        { key: 'fcode', label: 'Kode' }
      ],
      extraFields: [
        { key: 'klsstr', label: 'Kelas Struktur' },
        { key: 'remark', label: 'Nama' },
        { key: 'fcode', label: 'Kode' }
      ],
      colors: {
        'Lipatan': '#df5da7',
        'Scarp': '#e8e8e8',
        'Foliasi': '#d9d9d9',
        'Patahan': '#c5c5c5',
        'Rekahan': '#b5b5b5',
        'Kelurusan': '#a1a1a1',
        'Sumbu Lipatan': '#8e8e8e',
        'Pematang Pantai': '#7a7a7a',
        'Not Classified': '#686868'
      }
    },
    'erosi-big': {
      label: 'Peta Rawan Erosi (BIG)',
      query: 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/KEHUTANAN/MapServer/14/query',
      nameField: 'klas_erosi',
      titleField: 'klas_erosi',
      areaField: null,
      dateField: null,
      nameLabel: 'Kelas Erosi',
      emptyMessage: 'Tidak ada polygon peta rawan erosi di wilayah ini.',
      loadingMessage: 'Memuat data peta rawan erosi...',
      source: 'BIG KSP SatuPeta - Peta Rawan Erosi',
      tableFields: [
        { key: 'klas_erosi', label: 'Kelas Erosi' },
        { key: 'bpdashl', label: 'BPDASHL' },
        { key: 'namobj', label: 'Nama Objek' },
        { key: 'remark', label: 'Keterangan' }
      ],
      extraFields: [
        { key: 'bpdashl', label: 'BPDASHL' },
        { key: 'namobj', label: 'Nama' },
        { key: 'remark', label: 'Keterangan' },
        { key: 'metadata', label: 'Metadata' },
        { key: 'fcode', label: 'Kode' }
      ],
      colors: {
        '<= 15 Ton/Ha/Tahun': '#4caf50',
        '> 15 - 60 Ton/Ha/Tahun': '#8bc34a',
        '> 60 - 180 Ton/Ha/Tahun': '#ff9800',
        '> 180 - 480 Ton/Ha/Tahun': '#f44336',
        '> 480 Ton/Ha/Tahun': '#b71c1c'
      }
    },
    penggunaan10k: {
      label: 'Penggunaan Tanah 10K',
      query: 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/3/query',
      nameField: 'ptnobjname',
      titleField: 'ptnobjname',
      areaField: 'ig25k_penggunaan10k_ar_area',
      dateField: 'ptndate',
      emptyMessage: 'Tidak ada polygon penggunaan tanah di wilayah ini.',
      loadingMessage: 'Memuat data penggunaan tanah...',
      source: 'KSP SatuPeta',
      tableFields: [
        { key: 'ptnobjname', label: 'Jenis' },
        { key: 'ig25k_penggunaan10k_ar_area', label: 'Luas', type: 'area' },
        { key: 'ptndate', label: 'Tanggal', type: 'date' },
        { key: 'fcode', label: 'Kode' }
      ]
    },
    'geologi-bnpb': {
      label: 'Peta Geologi (BNPB)',
      query: 'https://gis.bnpb.go.id/server/rest/services/thematic/PETA_GEOLOGI/MapServer/1/query',
      nameField: 'UMUROBJ',
      titleField: 'NAMOBJ',
      areaField: null,
      dateField: null,
      emptyMessage: 'Tidak ada polygon geologi di wilayah ini.',
      loadingMessage: 'Memuat data peta geologi...',
      source: 'BNPB - Peta Geologi Indonesia',
      tableFields: [
        { key: 'NAMOBJ', label: 'Nama' },
        { key: 'UMUROBJ', label: 'Umur' },
        { key: 'SIMOBJ', label: 'Simbol' },
        { key: 'FCODE', label: 'Kode' }
      ],
      colors: {
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
      }
    },
    'kh-esdm': {
      label: 'Kawasan Hutan (ESDM)',
      query: 'https://geoportal.esdm.go.id/gis1/rest/services/Kawasan_Hutan/MapServer/0/query',
      nameField: 'deskripsi',
      titleField: 'deskripsi',
      areaField: 'lskkws',
      areaUnit: 'ha',
      dateField: 'tglskkws',
      nameLabel: 'Fungsi',
      emptyMessage: 'Tidak ada polygon kawasan hutan di wilayah ini.',
      loadingMessage: 'Memuat data kawasan hutan (ESDM)...',
      source: 'Geoportal ESDM',
      tableFields: [
        { key: 'deskripsi', label: 'Fungsi' },
        { key: 'lskkws', label: 'Luas', type: 'ha' },
        { key: 'noskkws', label: 'No. SK' },
        { key: 'fcode', label: 'Kode' }
      ],
      extraFields: [
        { key: 'namobj', label: 'Nama' },
        { key: 'noskkws', label: 'No. SK' },
        { key: 'remark', label: 'Keterangan' }
      ],
      colors: {
        'Kawasan Konservasi': '#c500ff',
        'Kawasan Konservasi Laut': '#ffffff',
        'Hutan Lindung': '#38a800',
        'Hutan Produksi Tetap': '#ffff00',
        'Hutan Produksi Terbatas': '#aaff00',
        'Hutan Produksi Yang Dapat Dikonversi': '#ff73df',
        'Hutan Produksi yang Dapat Dikonversi': '#ff73df',
        'Areal Penggunaan Lain': '#e0e0e0',
        'Tubuh Air': '#00c5ff',
        'Tidak Terdefinisi': '#ff5500'
      }
    },
    'kh-kemenhut': {
      label: 'Kawasan Hutan (Kemenhut)',
      query: 'https://simontana.kehutanan.go.id/arcgis/rest/services/simontana/kh/MapServer/0/query',
      nameField: 'fungsikws',
      titleField: null,
      areaField: 'lskpnjk',
      areaUnit: 'ha',
      dateField: 'tglskpnjk',
      nameLabel: 'Fungsi',
      emptyMessage: 'Tidak ada polygon kawasan hutan di wilayah ini.',
      loadingMessage: 'Memuat data kawasan hutan (Kemenhut)...',
      source: 'SIMANTAN KLHK',
      tableFields: [
        { key: 'fungsikws', label: 'Fungsi', type: 'nameMap' },
        { key: 'lskpnjk', label: 'Luas', type: 'ha' },
        { key: 'noskpnjk', label: 'No. SK' },
        { key: 'wadmkk', label: 'Kabupaten' }
      ],
      extraFields: [
        { key: 'namobj', label: 'Nama' },
        { key: 'wadmpr', label: 'Provinsi' },
        { key: 'wadmkk', label: 'Kabupaten' },
        { key: 'noskpnjk', label: 'No. SK' },
        { key: 'keterangan', label: 'Keterangan' }
      ],
      nameMap: {
        '1': 'Kawasan Konservasi',
        '1001': 'Hutan Lindung',
        '1002': 'Kawasan Konservasi',
        '1003': 'Hutan Produksi Tetap',
        '1004': 'Hutan Produksi Terbatas',
        '1005': 'Hutan Produksi yang Dapat Dikonversi',
        '1007': 'Areal Penggunaan Lain',
        '10021': 'Kawasan Konservasi',
        '10022': 'Kawasan Konservasi',
        '10023': 'Kawasan Konservasi',
        '10024': 'Kawasan Konservasi',
        '10025': 'Kawasan Konservasi',
        '10026': 'Kawasan Konservasi',
        '100201': 'Kawasan Konservasi',
        '100202': 'Kawasan Konservasi Laut',
        '100211': 'Kawasan Konservasi Laut',
        '100221': 'Kawasan Konservasi Laut',
        '100241': 'Kawasan Konservasi Laut',
        '100251': 'Kawasan Konservasi Laut'
      },
      colors: {
        'Kawasan Konservasi': '#c500ff',
        'Kawasan Konservasi Laut': '#ffffff',
        'Hutan Lindung': '#38a800',
        'Hutan Produksi Tetap': '#ffff00',
        'Hutan Produksi Terbatas': '#aaff00',
        'Hutan Produksi yang Dapat Dikonversi': '#ff73df',
        'Areal Penggunaan Lain': '#e0e0e0',
        'Tubuh Air': '#00c5ff',
        'Tidak Terdefinisi': '#ff5500'
      }
    }
  };
  var KAB_URL = 'assets/data/bps/geojson/kabupaten.geojson';
  var PROV_URL = 'assets/data/bps/geojson/provinsi.geojson';
  var DESA_URL = 'assets/data/kode_wilayah.json';
  var BIG_RBI_BASE = 'https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/';
  var BIG_SERVICE_BASE = 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/';
  var BIG_FOLDERS = [
    'BATAS_WILAYAH',
    'KAWASAN_KHUSUS_DAN_TRANSMIGRASI',
    'KEHUTANAN',
    'PERENCANAAN_RUANG',
    'PERIZINAN_DAN_PERTANAHAN',
    'SARANA_PRASARANA',
    'SUMBER_DAYA_ALAM_DAN_LINGKUNGAN'
  ];
  var BIG_FOLDER_LABELS = {
    BATAS_WILAYAH: 'Batas Wilayah',
    KAWASAN_KHUSUS_DAN_TRANSMIGRASI: 'Kawasan Khusus & Transmigrasi',
    KEHUTANAN: 'Kehutanan',
    PERENCANAAN_RUANG: 'Perencanaan Ruang',
    PERIZINAN_DAN_PERTANAHAN: 'Perizinan & Pertanahan',
    SARANA_PRASARANA: 'Sarana Prasarana',
    SUMBER_DAYA_ALAM_DAN_LINGKUNGAN: 'SDA & Lingkungan'
  };
  var BIG_SKIP = {
    KEHUTANAN: { 14: 1 },
    SUMBER_DAYA_ALAM_DAN_LINGKUNGAN: { 3: 1, 9: 1, 36: 1, 43: 1, 59: 1 }
  };
  var PAGE_SIZE = 1000;

  function currentSource() {
    var sel = document.getElementById('satupetaInputLayer');
    var id = (sel && sel.value) || 'penggunaan10k';
    return LAYER_SOURCES[id] || LAYER_SOURCES.penggunaan10k;
  }

  function bigOptionValue(folder, layerId) {
    return 'big:' + folder + ':' + layerId;
  }

  function findSourceByQuery(query) {
    var keys = Object.keys(LAYER_SOURCES);
    for (var i = 0; i < keys.length; i++) {
      if (LAYER_SOURCES[keys[i]].query === query) return LAYER_SOURCES[keys[i]];
    }
    return null;
  }

  function buildBigSource(folder, layerId, meta) {
    var queryUrl = BIG_SERVICE_BASE + folder + '/MapServer/' + layerId + '/query';
    var existing = findSourceByQuery(queryUrl);
    if (existing) return existing;

    var fields = meta.fields || [];
    var names = fields.map(function (f) { return f.name; });
    var lower = {};
    names.forEach(function (n) { lower[n.toLowerCase()] = n; });

    var namePriority = [
      'namobj', 'namaobj', 'ptnobjname', 'deskripsi', 'klas_erosi', 'fungsikws',
      'kerentanan', 'lsd', 'umurobj', 'simobj', 'jenis', 'klasifikasi', 'remark',
      'keterangan', 'unit_morf', 'kom_lrg'
    ];
    var nameField = null;
    for (var i = 0; i < namePriority.length; i++) {
      if (lower[namePriority[i]]) { nameField = lower[namePriority[i]]; break; }
    }
    if (!nameField) {
      var skip = {
        objectid: 1, fcode: 1, srs_id: 1, metadata: 1, shape: 1, ruleid: 1,
        updated: 1, pyear: 1, locid: 1, lfaccode: 1, wadmpr: 1, wadmkk: 1
      };
      for (var j = 0; j < fields.length; j++) {
        var f = fields[j];
        if (skip[f.name.toLowerCase()]) continue;
        if (f.type === 'esriFieldTypeString') { nameField = f.name; break; }
      }
    }
    if (!nameField) nameField = names[0] || 'objectid';

    var areaField = null;
    var areaUnit = null;
    for (var a = 0; a < names.length; a++) {
      var an = names[a];
      var al = an.toLowerCase();
      if (al === 'luasha' || al === 'shape_area') { areaField = an; areaUnit = al === 'luasha' ? 'ha' : null; break; }
      if (/^(luas|area)/.test(al) && !areaField) {
        areaField = an;
        areaUnit = /ha/.test(al) ? 'ha' : null;
      }
    }

    var shortLabels = {
      wadmpr: 'Provinsi', wadmkk: 'Kab/Kota', wadmkc: 'Kecamatan',
      remark: 'Keterangan', keterangan: 'Keterangan', metadata: 'Metadata',
      fcode: 'Kode', namobj: 'Nama', ptnobjname: 'Jenis', kelas: 'Kelas',
      klasifikasi: 'Klasifikasi', jenis: 'Jenis', deskripsi: 'Deskripsi'
    };
    var used = {};
    var tableFields = [];
    function addField(key, label, type) {
      if (!key || used[key]) return false;
      used[key] = 1;
      tableFields.push({ key: key, label: label, type: type });
      return true;
    }
    addField(nameField, 'Nama');
    if (areaField) addField(areaField, 'Luas', areaUnit === 'ha' ? 'ha' : 'area');
    for (var t = 0; t < fields.length && tableFields.length < 5; t++) {
      var tf = fields[t];
      if (used[tf.name] || tf.name.toLowerCase() === 'shape') continue;
      if (
        tf.type === 'esriFieldTypeString' ||
        tf.type === 'esriFieldTypeInteger' ||
        tf.type === 'esriFieldTypeDouble'
      ) {
        addField(tf.name, shortLabels[tf.name.toLowerCase()] || tf.name);
      }
    }

    var extraFields = [];
    for (var e = 0; e < fields.length && extraFields.length < 4; e++) {
      var ef = fields[e];
      if (used[ef.name] || ef.name.toLowerCase() === 'shape') continue;
      if (ef.type === 'esriFieldTypeString' || ef.type === 'esriFieldTypeInteger') {
        extraFields.push({ key: ef.name, label: shortLabels[ef.name.toLowerCase()] || ef.name });
      }
    }

    var geomKind = null;
    if (meta.geometryType === 'esriGeometryPolyline') geomKind = 'line';
    else if (meta.geometryType === 'esriGeometryPoint') geomKind = 'point';

    var label = meta.name || ('BIG Layer ' + layerId);
    return {
      label: label + ' (BIG)',
      query: queryUrl,
      nameField: nameField,
      titleField: nameField,
      areaField: areaField,
      areaUnit: areaUnit,
      dateField: null,
      nameLabel: 'Jenis',
      geomKind: geomKind,
      emptyMessage: 'Tidak ada fitur di wilayah ini.',
      loadingMessage: 'Memuat ' + label + '...',
      source: 'BIG KSP SatuPeta - ' + (BIG_FOLDER_LABELS[folder] || folder),
      tableFields: tableFields,
      extraFields: extraFields
    };
  }

  function ensureCurrentSource() {
    var sel = document.getElementById('satupetaInputLayer');
    var id = (sel && sel.value) || 'penggunaan10k';
    if (LAYER_SOURCES[id]) return Promise.resolve(LAYER_SOURCES[id]);
    if (id.indexOf('big:') !== 0) return Promise.resolve(LAYER_SOURCES.penggunaan10k);
    var parts = id.split(':');
    if (parts.length < 3) return Promise.resolve(LAYER_SOURCES.penggunaan10k);
    var folder = parts[1];
    var layerId = parts[2];
    var metaUrl = BIG_SERVICE_BASE + folder + '/MapServer/' + layerId + '?f=json';
    return fetch(metaUrl)
      .then(function (r) { return r.json(); })
      .then(function (meta) {
        if (!meta || meta.error) throw new Error((meta && meta.error && meta.error.message) || 'Layer meta error');
        LAYER_SOURCES[id] = buildBigSource(folder, layerId, meta);
        return LAYER_SOURCES[id];
      });
  }

  function populateBigLayers() {
    var sel = document.getElementById('satupetaInputLayer');
    if (!sel) return Promise.resolve();
    return Promise.all(
      BIG_FOLDERS.map(function (folder) {
        return fetch(BIG_SERVICE_BASE + folder + '/MapServer?f=json')
          .then(function (r) { return r.json(); })
          .catch(function () { return null; });
      })
    ).then(function (results) {
      results.forEach(function (meta, i) {
        if (!meta || !meta.layers) return;
        var folder = BIG_FOLDERS[i];
        var skip = BIG_SKIP[folder] || {};
        var og = document.createElement('optgroup');
        og.label = 'BIG — ' + (BIG_FOLDER_LABELS[folder] || folder);
        meta.layers.forEach(function (layer) {
          if (!layer.geometryType) return;
          if (skip[layer.id]) return;
          var opt = document.createElement('option');
          opt.value = bigOptionValue(folder, layer.id);
          opt.textContent = layer.name || ('Layer ' + layer.id);
          og.appendChild(opt);
        });
        if (og.children.length) sel.appendChild(og);
      });
    });
  }

  var COLORS = {
    'Sawah Irigasi 2x Padi/thn': '#2ecc71',
    'Sawah Irigasi 1x Padi/thn': '#27ae60',
    'Sawah Tadah Hujan': '#1abc9c',
    '2x Padi + Palawija/thn': '#16a085',
    'Tegalan/Ladang': '#f39c12',
    'Kampung Jarang Tidak Teratur': '#e74c3c',
    'Kampung Padat Tidak Teratur': '#c0392b',
    'Semak': '#27ae60',
    'Tanah Kosong Sudah Diperuntukan': '#95a5a6',
    'Tanah Kosong Belum Diperuntukan': '#7f8c8d',
    'Perkebunan Sudah Menghasilkan': '#9b59b6',
    'Perkebunan Belum Menghasilkan': '#8e44ad',
    'Kebun Campuran': '#16a085',
    'Hutan Rakyat': '#006400',
    'Hutan Tanaman Industri': '#228b22',
    'Hutan Produksi Tetap': '#2d6a4f',
    'Pasir': '#d4a574',
    'Kolam Air Tawar': '#3498db',
    'Tambak': '#2980b9',
    'Kuburan/Pemakaman': '#7f8c8d',
    'Bangunan': '#95a5a6',
    'Jalan': '#636e72',
    'Sungai': '#0984e3',
    'Danau/Waduk': '#74b9ff',
    'Rawa': '#00cec9'
  };
  var DEFAULT_COLOR = '#3498db';

  var state = {
    level: 'kabupaten',
    layer: null,
    visible: false,
    kabData: null,
    provData: null,
    provDataGeo: null,
    kecData: null,
    desaData: null,
    selectedFeature: null,
    selectedBoundary: null,
    outlineLayer: null,
    clipped: [],
    loading: false,
    fetchAbort: null
  };

  function getColor(name, src) {
    if (!name) return DEFAULT_COLOR;
    var map = (src && src.colors) || COLORS;
    if (map[name]) return map[name];
    var key = Object.keys(map).find(function (k) {
      return k.toLowerCase() === name.toLowerCase();
    });
    return key ? map[key] : DEFAULT_COLOR;
  }

  function resolveName(src, v) {
    if (v == null || v === '') return null;
    if (!src || !src.nameMap) return String(v);
    var s = String(v);
    return src.nameMap[s] || src.nameMap[s.slice(0, 4)] || src.nameMap[s.slice(0, 3)] || String(v);
  }

  function formatHa(v) {
    if (v == null || isNaN(v)) return '-';
    return Number(v).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' ha';
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '-' : s);
    return d.innerHTML;
  }

  function formatLuas(m2) {
    if (m2 == null || isNaN(m2)) return '-';
    var ha = m2 / 10000;
    if (ha >= 1) return ha.toFixed(2) + ' ha';
    return m2.toFixed(0) + ' m\u00B2';
  }

  function formatDate(epoch) {
    if (!epoch) return '-';
    var d = new Date(epoch);
    return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function attrToGeoJSON(feature) {
    if (!feature.geometry) return null;
    var geom = feature.geometry;
    var props = feature.attributes ? Object.assign({}, feature.attributes) : {};

    if (geom.rings) {
      return {
        type: 'Feature',
        properties: props,
        geometry: { type: 'Polygon', coordinates: geom.rings }
      };
    }
    if (geom.paths) {
      return {
        type: 'Feature',
        properties: props,
        geometry: { type: 'MultiLineString', coordinates: geom.paths }
      };
    }
    if (geom.points) {
      return {
        type: 'Feature',
        properties: props,
        geometry: { type: 'MultiPoint', coordinates: geom.points }
      };
    }
    return null;
  }

  function ensureMultiPolygon(gj) {
    if (!gj || !gj.geometry) return gj;
    if (gj.geometry.type === 'MultiPolygon') return gj;
    if (gj.geometry.type === 'Polygon') {
      gj.geometry = { type: 'MultiPolygon', coordinates: [gj.geometry.coordinates] };
    }
    return gj;
  }

  /* ---- Load Kabupaten GeoJSON ---- */
  function loadKab() {
    if (state.kabData) return Promise.resolve(state.kabData);
    return fetch(KAB_URL)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.kabData = data;
        return data;
      });
  }

  /* ---- Load Provinsi GeoJSON ---- */
  function loadProvGeo() {
    if (state.provDataGeo) return Promise.resolve(state.provDataGeo);
    return fetch(PROV_URL)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.provDataGeo = data;
        return data;
      });
  }

  /* ---- Load Desa/Prov/Kec (kode_wilayah.json) ---- */
  function loadDesa() {
    if (state.desaData && state.provData && state.kecData) {
      return Promise.resolve(state.desaData);
    }
    return fetch(DESA_URL)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.provData = data.filter(function (item) {
          return item.kode && item.kode.split('.').length === 1;
        });
        state.kecData = data.filter(function (item) {
          return item.kode && item.kode.split('.').length === 3;
        });
        state.desaData = data.filter(function (item) {
          return item.kode && item.kode.split('.').length === 4;
        });
        return state.desaData;
      });
  }

  /* ---- Fetch boundary from BIG RBI ---- */
  function esriRingsToPolygon(rings) {
    var outers = [], holes = [];
    for (var i = 0; i < rings.length; i++) {
      var r = rings[i], a = 0;
      for (var j = 0; j < r.length - 1; j++) a += r[j][0] * r[j + 1][1] - r[j + 1][0] * r[j][1];
      if (a / 2 < 0) outers.push(r);
      else holes.push(r);
    }
    if (!outers.length) { outers = [rings[0]]; holes = rings.slice(1); }
    if (outers.length === 1) return { type: 'Polygon', coordinates: [outers[0]].concat(holes) };
    return {
      type: 'MultiPolygon',
      coordinates: outers.map(function (o, idx) { return idx === 0 ? [o].concat(holes) : [o]; })
    };
  }

  function fetchBoundary(kode, attempt) {
    attempt = attempt || 0;
    var parts = String(kode || '').split('.');

    /* Provinsi (depth 1): local BPS geojson (fast, offline) */
    if (parts.length === 1) {
      return loadProvGeo().then(function (gj) {
        var f = gj && gj.features && gj.features.find(function (ft) {
          return String(ft.properties && ft.properties.kdprov) === kode;
        });
        if (!f || !f.geometry) return null;
        return ensureMultiPolygon({
          type: 'Feature',
          properties: { name: (f.properties.nmprov || ''), kode: kode },
          geometry: f.geometry
        });
      }).catch(function () { return null; });
    }

    var url;
    if (parts.length === 4) {
      url = BIG_RBI_BASE + 'BATAS_DESAKEL_AR/MapServer/0/query?where='
        + encodeURIComponent("KDEPUM='" + kode + "'")
        + '&f=json&returnGeometry=true&outSR=4326'
        + '&outFields=KDEPUM,NAMOBJ,WADMKK,WADMPR,LUASWH&geometryPrecision=5';
    } else if (parts.length === 3) {
      /* Kecamatan: BIG RBI BATAS_KECAMATAN_AR by KDCPUM */
      url = BIG_RBI_BASE + 'BATAS_KECAMATAN_AR/MapServer/0/query?where='
        + encodeURIComponent("KDCPUM='" + kode + "'")
        + '&f=json&returnGeometry=true&outSR=4326'
        + '&outFields=NAMOBJ,KDCPUM,KDPKAB,KDPPUM,LUASWH&geometryPrecision=5';
    } else if (parts.length === 2) {
      url = BIG_RBI_BASE + 'BATAS_KABKOTA_AR/MapServer/0/query?where='
        + encodeURIComponent("KDPKAB='" + kode + "'")
        + '&f=json&returnGeometry=true&outSR=4326'
        + '&outFields=NAMOBJ,KDPKAB&geometryPrecision=5';
    } else {
      return Promise.resolve(null);
    }

    var retry = function () {
      if (attempt < 3) {
        return new Promise(function (res) { setTimeout(res, 700 * (attempt + 1)); })
          .then(function () { return fetchBoundary(kode, attempt + 1); });
      }
      return null;
    };

    var ctrl = new AbortController();
    var timeout = setTimeout(function () { ctrl.abort(); }, 20000);
    return fetch(url, { signal: ctrl.signal })
      .then(function (r) {
        clearTimeout(timeout);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (data && data.status === 'error') {
          throw new Error((data.messages && data.messages[0]) || 'BIG error');
        }
        var f = data.features && data.features[0];
        if (!f || !f.geometry || !f.geometry.rings || !f.geometry.rings.length) {
          if (attempt < 3) return retry();
          return null;
        }
        var a = f.attributes || {};
        return ensureMultiPolygon({
          type: 'Feature',
          properties: { name: a.NAMOBJ || a.namobj || '', kode: kode },
          geometry: esriRingsToPolygon(f.geometry.rings)
        });
      })
      .catch(function (e) {
        clearTimeout(timeout);
        if (attempt < 3) return retry();
        console.warn('[Satupeta] fetchBoundary BIG failed:', e.message);
        return null;
      });
  }

  function drawSelOutline(boundary) {
    clearSelOutline();
    if (!boundary || !window.map) return;
    try {
      var gj = boundary;
      if (typeof turf !== 'undefined' && turf.rewind) {
        try { gj = turf.rewind(boundary); } catch (e) { gj = boundary; }
      }
      state.outlineLayer = L.geoJSON(gj, {
        interactive: false,
        style: function () {
          return { color: '#2563eb', weight: 2.5, opacity: 0.95, dashArray: '7 5', fill: false };
        }
      });
      state.outlineLayer.addTo(window.map);
      state.outlineLayer.bringToFront();
    } catch (e) { console.warn('[Satupeta] drawSelOutline gagal:', e); }
  }

  function clearSelOutline() {
    if (state.outlineLayer && window.map) {
      window.map.removeLayer(state.outlineLayer);
    }
    state.outlineLayer = null;
  }

  function rewindSafe(gj) {
    if (typeof turf === 'undefined' || !turf.rewind || !gj) return gj;
    try { return turf.rewind(gj); } catch (e) { return gj; }
  }

  /* ---- Fetch pages with spatial filter ---- */
  function fetchPagesWithBBox(bbox, signal) {
    var minX = bbox[0], minY = bbox[1], maxX = bbox[2], maxY = bbox[3];
    var envelopeJson = JSON.stringify({ xmin: minX, ymin: minY, xmax: maxX, ymax: maxY, spatialReference: { wkid: 4326 } });
    var offset = 0;
    var all = [];

    var info = document.getElementById('satupetaInfo');

    var loop = function () {
      var url = currentSource().query
        + '?where=1%3D1&outFields=*&returnGeometry=true'
        + '&geometry=' + encodeURIComponent(envelopeJson)
        + '&geometryType=esriGeometryEnvelope'
        + '&spatialRel=esriSpatialRelIntersects'
        + '&inSR=4326'
        + '&resultOffset=' + offset + '&resultRecordCount=' + PAGE_SIZE
        + '&f=json';

      if (info) {
        info.innerHTML = '<div class="satupeta-loading"><span class="satupeta-spinner"></span> Mengambil data... (halaman ' + (Math.floor(offset / PAGE_SIZE) + 1) + ')</div>';
      }

      return fetch(url, { signal: signal })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.features) all = all.concat(data.features);
          if (info) {
            info.innerHTML = '<div class="satupeta-loading"><span class="satupeta-spinner"></span> Mengambil data... ' + all.length + ' fitur</div>';
          }
          if (data.exceededTransferLimit && data.features && data.features.length > 0) {
            offset += PAGE_SIZE;
            return loop();
          }
          return all;
        });
    };
    return loop();
  }

  /* ---- Search ---- */
  function searchWilayah(query) {
    var container = document.getElementById('satupetaKabResults');
    if (!query || query.length < 2) {
      container.style.display = 'none';
      return;
    }
    var q = query.toUpperCase();
    var results = [];
    var html = '';

    if (state.level === 'provinsi') {
      if (!state.provData) { container.style.display = 'none'; return; }
      results = state.provData.filter(function (item) {
        return item.nama.toUpperCase().indexOf(q) !== -1;
      }).slice(0, 10);
      html = results.map(function (item) {
        return '<div class="satupeta-kab-item" data-type="prov" data-kode="' + esc(item.kode) + '">'
          + '<span class="satupeta-kab-name">' + esc(item.nama) + '</span>'
          + '<span class="satupeta-kab-prov">' + esc(item.kode) + '</span>'
          + '</div>';
      }).join('');
    } else if (state.level === 'kabupaten') {
      if (!state.kabData) { container.style.display = 'none'; return; }
      results = state.kabData.features.filter(function (f) {
        var name = (f.properties.nmkab || '').toUpperCase();
        var prov = (f.properties.nmprov || '').toUpperCase();
        return name.indexOf(q) !== -1 || prov.indexOf(q) !== -1;
      }).slice(0, 10);
      html = results.map(function (f) {
        var p = f.properties;
        var idx = state.kabData.features.indexOf(f);
        return '<div class="satupeta-kab-item" data-type="kab" data-idx="' + idx + '">'
          + '<span class="satupeta-kab-name">' + esc(p.nmkab) + '</span>'
          + '<span class="satupeta-kab-prov">' + esc(p.nmprov) + '</span>'
          + '</div>';
      }).join('');
    } else if (state.level === 'kecamatan') {
      if (!state.kecData) { container.style.display = 'none'; return; }
      results = state.kecData.filter(function (item) {
        return item.nama.toUpperCase().indexOf(q) !== -1;
      }).slice(0, 10);
      html = results.map(function (item) {
        return '<div class="satupeta-kab-item" data-type="kec" data-kode="' + esc(item.kode) + '">'
          + '<span class="satupeta-kab-name">' + esc(item.nama) + '</span>'
          + '<span class="satupeta-kab-prov">' + esc(item.kode) + '</span>'
          + '</div>';
      }).join('');
    } else {
      if (!state.desaData) { container.style.display = 'none'; return; }
      results = state.desaData.filter(function (item) {
        return item.nama.toUpperCase().indexOf(q) !== -1;
      }).slice(0, 10);
      html = results.map(function (item) {
        return '<div class="satupeta-kab-item" data-type="desa" data-kode="' + esc(item.kode) + '">'
          + '<span class="satupeta-kab-name">' + esc(item.nama) + '</span>'
          + '<span class="satupeta-kab-prov">' + esc(item.kode) + '</span>'
          + '</div>';
      }).join('');
    }

    if (!results.length) {
      container.innerHTML = '<div class="satupeta-kab-item satupeta-kab-empty">Tidak ditemukan</div>';
    } else {
      container.innerHTML = html;
    }
    container.style.display = 'block';

    container.querySelectorAll('.satupeta-kab-item:not(.satupeta-kab-empty)').forEach(function (el) {
      el.addEventListener('click', function () {
        var type = el.getAttribute('data-type');
        var input = document.getElementById('satupetaKabSearch');
        container.style.display = 'none';
        if (type === 'kab') {
          var idx = parseInt(el.getAttribute('data-idx'), 10);
          var feat = state.kabData.features[idx];
          input.value = feat.properties.nmkab;
          selectKabupaten(feat);
        } else if (type === 'prov') {
          var pk = el.getAttribute('data-kode');
          var pitem = state.provData.find(function (d) { return d.kode === pk; });
          input.value = pitem ? pitem.nama : pk;
          selectProvinsi(pk, pitem ? pitem.nama : '');
        } else if (type === 'kec') {
          var kk = el.getAttribute('data-kode');
          var kitem = state.kecData.find(function (d) { return d.kode === kk; });
          input.value = kitem ? kitem.nama : kk;
          selectKecamatan(kk, kitem ? kitem.nama : '');
        } else {
          var kode = el.getAttribute('data-kode');
          var item = state.desaData.find(function (d) { return d.kode === kode; });
          input.value = item ? item.nama : kode;
          selectDesa(kode, item ? item.nama : '');
        }
      });
    });
  }

  function hideResults() {
    var c = document.getElementById('satupetaKabResults');
    if (c) c.style.display = 'none';
  }

  function updateSelectedLabel(name, sub) {
    var sel = document.getElementById('satupetaKabSelected');
    if (sel) {
      sel.innerHTML = '<span>' + esc(name) + (sub ? ', ' + esc(sub) : '') + '</span>';
      sel.style.display = 'flex';
    }
  }

  function selectKabupaten(feature) {
    var p = feature.properties;
    var kode = p.kdprov && p.kdkab
      ? (p.kdprov + '.' + p.kdkab)
      : (p.idkab ? (String(p.idkab).slice(0, 2) + '.' + String(p.idkab).slice(2)) : '');

    state.selectedFeature = {
      properties: Object.assign({}, p, { nama: p.nmkab, nmkab: p.nmkab, nmprov: p.nmprov }),
      geometry: feature.geometry
    };
    state.selectedBoundary = ensureMultiPolygon({
      type: 'Feature',
      properties: p,
      geometry: feature.geometry
    });
    updateSelectedLabel(p.nmkab, p.nmprov);
    drawSelOutline(state.selectedBoundary);

    fetchBoundary(kode).then(function (boundary) {
      if (boundary) {
        state.selectedBoundary = boundary;
        state.selectedFeature.geometry = boundary.geometry;
        drawSelOutline(boundary);
      }
      fetchAndDisplay();
    });
  }

  function selectDesa(kode, nama) {
    var info = document.getElementById('satupetaInfo');
    if (info) {
      info.style.display = 'block';
      info.innerHTML = '<div class="satupeta-loading"><span class="satupeta-spinner"></span> Memuat batas wilayah...</div>';
    }

    fetchBoundary(kode).then(function (boundary) {
      if (!boundary) {
        if (info) info.innerHTML = 'Gagal memuat batas desa dari BIG RBI. Coba lagi.';
        return;
      }
      state.selectedFeature = { properties: { kode: kode, nama: nama }, geometry: boundary.geometry };
      state.selectedBoundary = boundary;
      updateSelectedLabel(nama, kode);
      drawSelOutline(boundary);
      fetchAndDisplay();
    });
  }

  function selectProvinsi(kode, nama) {
    var info = document.getElementById('satupetaInfo');
    if (info) {
      info.style.display = 'block';
      info.innerHTML = '<div class="satupeta-loading"><span class="satupeta-spinner"></span> Memuat batas provinsi...</div>';
    }

    fetchBoundary(kode).then(function (boundary) {
      if (!boundary) {
        if (info) info.innerHTML = 'Gagal memuat batas provinsi. Coba lagi.';
        return;
      }
      state.selectedFeature = { properties: { kode: kode, nama: nama }, geometry: boundary.geometry };
      state.selectedBoundary = boundary;
      updateSelectedLabel(nama, 'Provinsi');
      drawSelOutline(boundary);
      fetchAndDisplay();
    });
  }

  function selectKecamatan(kode, nama) {
    var info = document.getElementById('satupetaInfo');
    if (info) {
      info.style.display = 'block';
      info.innerHTML = '<div class="satupeta-loading"><span class="satupeta-spinner"></span> Memuat batas kecamatan...</div>';
    }

    fetchBoundary(kode).then(function (boundary) {
      if (!boundary) {
        if (info) info.innerHTML = 'Gagal memuat batas kecamatan dari BIG RBI. Coba lagi.';
        return;
      }
      state.selectedFeature = { properties: { kode: kode, nama: nama }, geometry: boundary.geometry };
      state.selectedBoundary = boundary;
      updateSelectedLabel(nama, kode);
      drawSelOutline(boundary);
      fetchAndDisplay();
    });
  }

  function clearSelection() {
    clearSelOutline();
    if (state.fetchAbort) {
      state.fetchAbort.abort();
      state.fetchAbort = null;
    }
    state.loading = false;
    state.selectedFeature = null;
    state.selectedBoundary = null;
    state.clipped = [];
    var sel = document.getElementById('satupetaKabSelected');
    if (sel) sel.style.display = 'none';
    var input = document.getElementById('satupetaKabSearch');
    if (input) input.value = '';
    if (state.layer && window.map) {
      window.map.removeLayer(state.layer);
      state.layer = null;
    }
    var info = document.getElementById('satupetaInfo');
    if (info) info.style.display = 'none';
    clearFeatureTable();
  }

  function clearFeatureTable() {
    var wrap = document.getElementById('satupetaFeatureTable');
    if (wrap) {
      wrap.style.display = 'none';
      wrap.innerHTML = '';
    }
  }

  function getFieldVal(props, key) {
    if (props[key] != null && props[key] !== '') return props[key];
    var up = key.toUpperCase();
    if (props[up] != null && props[up] !== '') return props[up];
    var low = key.toLowerCase();
    if (props[low] != null && props[low] !== '') return props[low];
    return null;
  }

  function renderFeatureTable() {
    var wrap = document.getElementById('satupetaFeatureTable');
    if (!wrap) return;
    var feats = state.clipped;
    var src = currentSource();
    if (!feats || !feats.length) { clearFeatureTable(); return; }

    var fields = src.tableFields || [];
    var pageSize = 50;
    var page = 1;
    var totalPages = Math.max(1, Math.ceil(feats.length / pageSize));

    function cellVal(f, fd) {
      var p = f.properties || {};
      var v = getFieldVal(p, fd.key);
      if (v == null) return '-';
      if (fd.type === 'date') return esc(formatDate(v));
      if (fd.type === 'area') return esc(formatLuas(v));
      if (fd.type === 'ha') return esc(formatHa(v));
      if (fd.type === 'nameMap') return esc(resolveName(src, v) || String(v));
      return esc(String(v));
    }

    function render() {
      var start = (page - 1) * pageSize;
      var slice = feats.slice(start, start + pageSize);
      var html = '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:8px 0 4px;">'
        + '<strong style="font-size:11px;color:var(--text-primary);">Tabel Feature — ' + esc(src.label) + '</strong>'
        + '<span style="font-size:10px;color:var(--text-tertiary);">' + feats.length + ' baris</span></div>';
      html += '<div class="at-table-wrap" style="width:100%;max-width:100%;min-width:0;max-height:220px;margin:0;overflow-x:auto;overflow-y:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--border-color);border-radius:6px;">';
      html += '<table class="at-table"><thead><tr><th class="at-th-no">No</th>';
      fields.forEach(function (fd) { html += '<th>' + esc(fd.label) + '</th>'; });
      var gk = currentSource().geomKind;
      html += '<th>' + (gk === 'line' ? 'Panjang (Clip)' : gk === 'point' ? 'Titik' : 'Luas (Clip)') + '</th></tr></thead><tbody>';
      slice.forEach(function (f, i) {
        var p = f.properties || {};
        html += '<tr><td class="at-td-no">' + (start + i + 1) + '</td>';
        fields.forEach(function (fd) {
          var v = cellVal(f, fd);
          html += '<td title="' + v.replace(/"/g, '&quot;') + '">' + v + '</td>';
        });
        if (gk === 'point') {
          html += '<td>-</td></tr>';
        } else if (p._panjang_km != null && p._area_ha == null) {
          html += '<td>' + esc(String(p._panjang_km)) + ' km</td></tr>';
        } else {
          html += '<td>' + (p._area_ha ? esc(String(p._area_ha)) + ' ha' : '-') + '</td></tr>';
        }
      });
      html += '</tbody></table></div>';
      if (totalPages > 1) {
        html += '<div class="at-pagination">'
          + '<button class="at-page-btn" type="button" data-ft-page="prev"' + (page <= 1 ? ' disabled' : '') + '>&lsaquo; Prev</button>'
          + '<span style="font-size:11px;color:var(--text-tertiary);">' + page + ' / ' + totalPages + '</span>'
          + '<button class="at-page-btn" type="button" data-ft-page="next"' + (page >= totalPages ? ' disabled' : '') + '>Next &rsaquo;</button>'
          + '</div>';
      }
      wrap.innerHTML = html;
      wrap.style.display = 'block';
      wrap.querySelectorAll('[data-ft-page]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (btn.getAttribute('data-ft-page') === 'prev' && page > 1) page--;
          else if (btn.getAttribute('data-ft-page') === 'next' && page < totalPages) page++;
          else return;
          render();
        });
      });
    }
    render();
  }

  function isLineGeom(gj) {
    var t = gj && gj.geometry && gj.geometry.type;
    return t === 'LineString' || t === 'MultiLineString';
  }

  function isPointGeom(gj) {
    var t = gj && gj.geometry && gj.geometry.type;
    return t === 'Point' || t === 'MultiPoint';
  }

  function clipPointFeature(gj, boundary) {
    try {
      if (turf.booleanWithin(gj, boundary) || turf.booleanIntersects(gj, boundary)) return gj;
      return null;
    } catch (e) {
      return gj;
    }
  }

  function clipLineFeature(gj, boundary) {
    try {
      var lines = [];
      if (gj.geometry.type === 'LineString') {
        lines.push(turf.lineString(gj.geometry.coordinates));
      } else {
        gj.geometry.coordinates.forEach(function (coords) {
          lines.push(turf.lineString(coords));
        });
      }
      var bPolys = boundary.geometry.type === 'MultiPolygon'
        ? boundary.geometry.coordinates.map(function (c) { return turf.polygon(c); })
        : [boundary];
      var kept = [];
      lines.forEach(function (line) {
        var hitPoly = null;
        for (var i = 0; i < bPolys.length; i++) {
          if (turf.booleanIntersects(line, bPolys[i])) { hitPoly = bPolys[i]; break; }
        }
        if (!hitPoly) return;
        var parts = [line];
        try {
          parts = turf.lineSplit(line, turf.polygonToLine(hitPoly)).features;
        } catch (e) { /* keep whole line */ }
        parts.forEach(function (seg) {
          try {
            if (turf.booleanWithin(seg, hitPoly) || turf.booleanContains(hitPoly, seg)) {
              kept.push(seg);
            } else {
              for (var j = 0; j < bPolys.length; j++) {
                if (turf.booleanIntersects(seg, bPolys[j])) { kept.push(seg); return; }
              }
            }
          } catch (e) {
            kept.push(seg);
          }
        });
      });
      if (!kept.length) return null;
      var geom = kept.length === 1
        ? kept[0].geometry
        : { type: 'MultiLineString', coordinates: kept.map(function (s) {
            return s.geometry.type === 'LineString' ? s.geometry.coordinates : s.geometry.coordinates[0];
          }) };
      return { type: 'Feature', properties: gj.properties, geometry: geom };
    } catch (e) {
      if (turf.booleanIntersects(gj, boundary)) return gj;
      return null;
    }
  }

  function clipFeatureToBoundary(gj, boundary) {
    if (isPointGeom(gj)) return clipPointFeature(gj, boundary);
    if (isLineGeom(gj)) return clipLineFeature(gj, boundary);
    return turf.intersect(turf.featureCollection([gj, boundary]));
  }

  function measureClip(gj) {
    if (isPointGeom(gj)) return { km: null, ha: null };
    if (isLineGeom(gj)) {
      try { return { km: (turf.length(gj, { units: 'kilometers' }) || 0).toFixed(2), ha: null }; }
      catch (e) { return { km: null, ha: null }; }
    }
    return { km: null, ha: (turf.area(gj) / 10000).toFixed(2) };
  }

  /* ---- Main: fetch + clip + display ---- */
  function fetchAndDisplay() {
    if (!state.selectedBoundary || !window.map) return;
    if (state.loading) return;
    state.loading = true;

    var info = document.getElementById('satupetaInfo');
    if (info) {
      info.style.display = 'block';
      info.innerHTML = '<div class="satupeta-loading"><span class="satupeta-spinner"></span> Menyiapkan layer...</div>';
    }

    ensureCurrentSource()
      .then(function () { runFetchAndDisplay(info); })
      .catch(function (err) {
        state.loading = false;
        if (info) info.innerHTML = 'Gagal memuat konfigurasi layer. Coba lagi.';
        console.error('SatupetaDownloader ensureSource:', err);
      });
  }

  function runFetchAndDisplay(info) {
    if (!state.selectedBoundary || !window.map) {
      state.loading = false;
      return;
    }

    if (info) {
      info.style.display = 'block';
      info.innerHTML = '<div class="satupeta-loading"><span class="satupeta-spinner"></span> ' + esc(currentSource().loadingMessage || 'Memuat data...') + '</div>';
    }

    if (state.layer) {
      window.map.removeLayer(state.layer);
      state.layer = null;
    }
    state.clipped = [];
    clearFeatureTable();

    var ctrl = new AbortController();
    state.fetchAbort = ctrl;

    var boundaryBbox = turf.bbox(state.selectedBoundary);
    var props = state.selectedFeature.properties;
    var clipBoundary = rewindSafe(state.selectedBoundary);
    var isLineSrc = currentSource().geomKind === 'line';

    fetchPagesWithBBox(boundaryBbox, ctrl.signal)
      .then(function (features) {
        var totalFetched = features.length;
        var clipped = [];
        var skipped = 0;
        features.forEach(function (f) {
          var gj = attrToGeoJSON(f);
          if (!gj) { skipped++; return; }
          if (!isLineGeom(gj)) gj = rewindSafe(gj);

          try {
            var intersection = clipFeatureToBoundary(gj, clipBoundary);
            if (intersection && intersection.geometry) {
              var p = gj.properties || {};
              var m = measureClip(intersection);
              if (m.ha != null) p._area_ha = m.ha;
              if (m.km != null) p._panjang_km = m.km;
              clipped.push({
                type: 'Feature',
                properties: p,
                geometry: intersection.geometry
              });
            }
          } catch (e) { skipped++; }
        });

        state.clipped = clipped;
        state.loading = false;

        if (!clipped.length) {
          if (info) info.innerHTML = esc(currentSource().emptyMessage || 'Tidak ada fitur di wilayah ini.');
          clearFeatureTable();
          return;
        }

        var types = {};
        var src = currentSource();
        var nameField = src.nameField;
        clipped.forEach(function (f) {
          var name = resolveName(src, f.properties[nameField]) || 'Lainnya';
          if (!types[name]) types[name] = 0;
          types[name]++;
        });
        var typeList = Object.keys(types).sort(function (a, b) { return types[b] - types[a]; });
        var typeHtml = typeList.map(function (t) {
          var color = getColor(t, src);
          return '<span style="display:inline-flex;align-items:center;gap:4px;margin:2px 0;font-size:10px;">'
            + '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' + color + ';flex-shrink:0;"></span>'
            + esc(t) + ' <strong>' + types[t] + '</strong></span>';
        }).join('');

        var areaTotal = clipped.reduce(function (s, f) { return s + parseFloat(f.properties._area_ha || 0); }, 0);
        var lenTotal = clipped.reduce(function (s, f) { return s + parseFloat(f.properties._panjang_km || 0); }, 0);
        var labelName = props.nmkab || props.nama || props.kode || '-';
        var labelSub = props.nmprov || props.kode || '';
        var isPointSrc = currentSource().geomKind === 'point';
        var geomWord = isLineSrc ? 'garis' : (isPointSrc ? 'titik' : 'polygon');
        var unitHtml = isLineSrc
          ? 'Panjang: <strong>' + lenTotal.toFixed(2) + ' km</strong>'
          : (isPointSrc
              ? 'Jumlah: <strong>' + clipped.length + ' titik</strong>'
              : 'Luas: <strong>' + areaTotal.toFixed(2) + ' ha</strong>');

        var detailHtml = '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">'
          + '<div>'
          + '<div style="font-weight:700;font-size:12px;">' + esc(labelName) + (labelSub ? ', ' + esc(labelSub) : '') + '</div>'
          + '<div style="font-size:10px;color:#64748b;margin-top:2px;">'
          + 'API: <strong>' + totalFetched + '</strong> feature &middot; Di dalam wilayah: <strong>' + clipped.length + '</strong> ' + geomWord + ' &middot; ' + unitHtml
          + (skipped > 0 ? ' &middot; Skip: ' + skipped : '')
          + '</div>'
          + '</div>'
          + '<button class="satupeta-close-btn" onclick="SatupetaDownloader.clearSelection()" title="Tutup layer">'
          + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
          + '</button></div>'
          + '<div style="display:flex;flex-wrap:wrap;gap:2px 10px;margin-top:6px;padding-top:6px;border-top:1px solid #f0f0f0;">' + typeHtml + '</div>';

        if (info) info.innerHTML = detailHtml;
        renderFeatureTable();

        var layer = L.geoJSON(turf.featureCollection(clipped), {
          style: function (f) {
            var src = currentSource();
            var color = getColor(resolveName(src, f.properties[src.nameField]), src);
            if (isLineSrc) {
              return { color: color, weight: 1.6, opacity: 0.9 };
            }
            if (isPointSrc) {
              return { color: color, weight: 1, opacity: 0.95 };
            }
            return {
              color: color,
              weight: 1.2,
              opacity: 0.9,
              fillColor: color,
              fillOpacity: 0.35
            };
          },
          pointToLayer: function (f, latlng) {
            var src = currentSource();
            var color = getColor(resolveName(src, f.properties[src.nameField]), src);
            return L.circleMarker(latlng, {
              radius: 5,
              color: color,
              weight: 1.5,
              opacity: 0.95,
              fillColor: color,
              fillOpacity: 0.75
            });
          },
          onEachFeature: function (f, l) {
            l.bindPopup(buildPopup(f), { maxWidth: 320, className: 'agol-leaflet-popup' });
          }
        });
        layer.addTo(window.map);
        state.layer = layer;
        layer.bringToFront();
        if (state.outlineLayer) state.outlineLayer.bringToFront();

        var bbox4326 = [boundaryBbox[0], boundaryBbox[1], boundaryBbox[2], boundaryBbox[3]];
        window.map.fitBounds([[bbox4326[1], bbox4326[0]], [bbox4326[3], bbox4326[2]]], { padding: [40, 40] });
      })
      .catch(function (err) {
        state.loading = false;
        if (err.name === 'AbortError') return;
        if (info) info.innerHTML = 'Gagal memuat data. Coba lagi.';
        console.error('SatupetaDownloader:', err);
      });
  }

  /* ---- Popup HTML ---- */
  function buildPopup(feature) {
    var p = feature.properties || {};
    var src = currentSource();
    var nameVal = resolveName(src, p[src.nameField]);
    var color = getColor(nameVal, src);
    var html = '<div class="agol-popup" style="min-width:240px">';
    html += '<div class="agol-popup-header agol-geo-satupeta">';
    html += '<div class="agol-popup-badge"><span class="agol-popup-badge-dot" style="background:' + color + ';"></span>' + esc(src.label) + '</div>';
    html += '<div class="agol-popup-title">' + esc((src.titleField ? p[src.titleField] : null) || nameVal || p.namobj || p.NAMOBJ || '-') + '</div>';
    html += '</div>';
    html += '<div class="agol-popup-body"><div class="agol-popup-fields">';
    if (src.areaField && p[src.areaField] != null) {
      var areaTxt = src.areaUnit === 'ha' ? formatHa(p[src.areaField]) : formatLuas(p[src.areaField]);
      html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Luas</span><span class="agol-popup-field-value">' + areaTxt + '</span></div>';
    }
    if (src.geomKind === 'point') {
      html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Titik</span><span class="agol-popup-field-value">Ada di wilayah</span></div>';
    } else if (p._panjang_km != null && p._area_ha == null) {
      html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Panjang (Clip)</span><span class="agol-popup-field-value">' + esc(String(p._panjang_km)) + ' km</span></div>';
    } else {
      html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Luas (Clip)</span><span class="agol-popup-field-value">' + (p._area_ha ? p._area_ha + ' ha' : '-') + '</span></div>';
    }
    if (src.dateField && p[src.dateField]) {
      html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Tanggal</span><span class="agol-popup-field-value">' + formatDate(p[src.dateField]) + '</span></div>';
    }
    if (nameVal) {
      var nameLabel = src.nameLabel || (src.nameField === 'UMUROBJ' ? 'Umur Geologi' : 'Jenis');
      html += '<div class="agol-popup-field"><span class="agol-popup-field-label">' + nameLabel + '</span><span class="agol-popup-field-value">' + esc(nameVal) + '</span></div>';
    }
    if (src.extraFields) {
      src.extraFields.forEach(function (fd) {
        var v = getFieldVal(p, fd.key);
        if (v == null || v === '') return;
        var txt = fd.type === 'ha' ? formatHa(v) : String(v);
        html += '<div class="agol-popup-field"><span class="agol-popup-field-label">' + esc(fd.label) + '</span><span class="agol-popup-field-value">' + esc(txt) + '</span></div>';
      });
    }
    if (p.fcode || p.FCODE) {
      html += '<div class="agol-popup-field"><span class="agol-popup-field-label">Kode</span><span class="agol-popup-field-value">' + esc(p.fcode || p.FCODE) + '</span></div>';
    }
    html += '</div></div>';
    html += '<div class="agol-popup-footer"><span>Sumber: ' + esc(src.source || '-') + '</span></div>';
    html += '</div>';
    return html;
  }

  /* ---- Toggle panel visibility ---- */
  function toggleLayer(show) {
    state.visible = show;
    if (show) {
      loadKab();
      loadDesa();
    }
  }

  /* ---- Cleanup ---- */
  function cleanup() {
    clearSelOutline();
    if (state.fetchAbort) {
      state.fetchAbort.abort();
      state.fetchAbort = null;
    }
    if (state.layer && window.map) {
      window.map.removeLayer(state.layer);
      state.layer = null;
    }
    state.clipped = [];
    clearFeatureTable();
    state.loading = false;
    state.selectedFeature = null;
    state.selectedBoundary = null;
  }

  /* ---- Level mode change ---- */
  var LEVEL_TEXT = {
    provinsi: { label: 'Cari nama provinsi', ph: 'Ketik nama provinsi...' },
    kabupaten: { label: 'Cari nama kabupaten', ph: 'Ketik nama kabupaten...' },
    kecamatan: { label: 'Cari nama kecamatan', ph: 'Ketik nama kecamatan...' },
    desa: { label: 'Cari nama desa', ph: 'Ketik nama desa...' }
  };

  function onLevelChange() {
    var sel = document.getElementById('satupetaLevelMode');
    var label = document.getElementById('satupetaLevelLabel');
    var input = document.getElementById('satupetaKabSearch');
    if (sel) state.level = sel.value;
    var t = LEVEL_TEXT[state.level] || LEVEL_TEXT.desa;
    if (label) label.textContent = t.label;
    if (input) {
      input.value = '';
      input.placeholder = t.ph;
    }
    clearSelection();
  }

  /* ---- Init ---- */
  function init() {
    var searchInput = document.getElementById('satupetaKabSearch');
    if (searchInput) {
      var debounce = null;
      searchInput.addEventListener('input', function () {
        clearTimeout(debounce);
        var q = this.value;
        debounce = setTimeout(function () { searchWilayah(q); }, 250);
      });
      searchInput.addEventListener('focus', function () {
        if (this.value.length >= 2) searchWilayah(this.value);
      });
    }

    document.addEventListener('click', function (e) {
      if (!e.target.closest('#satupetaKabSearch') && !e.target.closest('#satupetaKabResults')) {
        hideResults();
      }
    });

    var levelSel = document.getElementById('satupetaLevelMode');
    if (levelSel) {
      levelSel.addEventListener('change', onLevelChange);
    }

    var layerSel = document.getElementById('satupetaInputLayer');
    if (layerSel) {
      layerSel.addEventListener('change', function () {
        if (state.selectedBoundary) fetchAndDisplay();
      });
    }

    loadKab();
    loadDesa();
    loadProvGeo();
    populateBigLayers();

    var origOpenGeotani = window.openGeotaniAnalysisTab;
    window.openGeotaniAnalysisTab = function (tabId) {
      if (origOpenGeotani) origOpenGeotani('satupeta');
      if (tabId === 'satupeta') {
        state.visible = true;
        loadKab();
        loadDesa();
        loadProvGeo();
      }
    };
  }

  window.SatupetaDownloader = {
    toggleLayer: toggleLayer,
    searchWilayah: searchWilayah,
    clearSelection: clearSelection,
    cleanup: cleanup,
    run: function (kode) {
      loadKab().then(function (data) {
        var feat = data.features.find(function (f) {
          return f.properties.idkab === kode;
        });
        if (feat) selectKabupaten(feat);
      });
    }
  };

  window.isSatupetaActive = function () { return state.visible; };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
