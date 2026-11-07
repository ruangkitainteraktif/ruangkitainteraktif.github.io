/* =============================================================================
 * GEOPROCESSING CORE (assets/js/geoprocessing-core.js)
 *
 * Mesin analisis spasial untuk fitur Geoprocessing pada sheet Alat, dibangun
 * bergaya ArcGIS Pro. File ini dimuat di DUA konteks:
 *
 *   1. window  -> index.html  : registry tool, riwayat, environment,
 *                               loader JSTS, dan runner Web Worker;
 *   2. worker  -> geoprocessing-worker.js lewat importScripts : eksekusi op.
 *
 * Karena itu SELURUH akses DOM/localStorage dibungkus pagar `hasDOM` supaya
 * aman dijalankan di dalam Web Worker yang tidak punya document.
 *
 * Mesin overlay memakai JSTS 2.12 (port Java Topology Suite / GEOS) karena
 * jauh lebih andal dari Turf untuk geometri rusak, berlubang, dan multipolygon.
 * Operasi jarak (Buffer dkk.) dijalankan pada CRS proyeksi (UTM zona otomatis
 * atau Azimuthal Equidistant) hasil `resolveProjection`, lalu hasilnya
 * dikembalikan ke EPSG:4326 sesuai spesifikasi GeoJSON untuk peta web.
 * ============================================================================= */
(function (global) {
  'use strict';

  var GPC = global.GPC = global.GPC || {};
  var hasDOM = typeof global.document !== 'undefined' && !!global.document.createElement;

  /* ==========================================================================
     1. REGISTRI TOOL
     ========================================================================== */

  GPC.TOOLBOXES = [
    { id: 'overlay', label: 'Overlay Analysis', desc: 'Irisan, gabungan, potong, erase, split, dan simbol area antar layer.' },
    { id: 'proximity', label: 'Proximity', desc: 'Zona jarak (buffer), jarak terdekat, dan poligon Thiessen.' },
    { id: 'data', label: 'Data Management', desc: 'Gabung, ubah atribut, dan kelola struktur fitur.' },
    { id: 'extract', label: 'Extract', desc: 'Pilih fitur berdasarkan kondisi atribut.' },
    { id: 'generalization', label: 'Generalization', desc: 'Sederhanakan geometri dengan toleransi.' },
    { id: 'statistics', label: 'Statistics', desc: 'Ringkasan statistik, frekuensi, dan tabel silang luas.' }
  ];

  var UNIT_OPTIONS = [
    { value: 'meters', label: 'Meters' },
    { value: 'kilometers', label: 'Kilometers' },
    { value: 'feet', label: 'Feet' },
    { value: 'miles', label: 'Miles' },
    { value: 'yards', label: 'Yards' }
  ];

  var ATTRIBUTE_OPTIONS = [
    { value: 'all', label: 'All attributes' },
    { value: 'no-fid', label: 'All attributes except feature IDs' },
    { value: 'fid', label: 'Only feature IDs' }
  ];

  /* Skema parameter. Form dirender dari data ini, bukan dari string HTML.
     Tipe yang tersedia: layer, layers, select, text, number, numberunit,
     field, fields, checkbox, boundary, info.                              */
  GPC.TOOLS = [
    {
      id: 'buffer',
      label: 'Buffer',
      toolbox: 'proximity',
      desc: 'Membuat zona jarak mengelilingi fitur. Dijalankan pada CRS proyeksi otomatis sehingga jarak akurat, bukan perkiraan derajat.',
      rerenderOnChange: ['distanceMode', 'input'],
      params: [
        { name: 'input', type: 'layer', label: 'Input Features', required: true },
        { name: 'distanceMode', type: 'select', label: 'Distance [value or field]', default: 'value',
          options: [{ value: 'value', label: 'Value (jarak tetap)' }, { value: 'field', label: 'Field (jarak tiap fitur)' }] },
        { name: 'distance', type: 'numberunit', label: 'Distance', default: 500, unitDefault: 'meters',
          showIf: function (v) { return v.distanceMode !== 'field'; } },
        { name: 'distanceField', type: 'field', label: 'Distance field', layerFrom: 'input', numeric: true, required: true,
          showIf: function (v) { return v.distanceMode === 'field'; } },
        { name: 'dissolve', type: 'select', label: 'Dissolve Type', default: 'none',
          options: [{ value: 'none', label: 'None (hasil per fitur)' }, { value: 'all', label: 'Dissolve all output features' }] },
        { name: 'output', type: 'text', label: 'Output Feature Class', required: true, placeholder: 'Nama layer hasil' }
      ]
    },
    {
      id: 'clip',
      label: 'Clip',
      toolbox: 'overlay',
      desc: 'Memotong fitur input mengikuti batas poligon (Clip Features). Mendukung point, line, dan polygon.',
      rerenderOnChange: ['clipSource'],
      params: [
        { name: 'input', type: 'layer', label: 'Input Features', required: true },
        { name: 'clipSource', type: 'select', label: 'Sumber Clip Features', default: 'admin',
          options: [{ value: 'admin', label: 'Cari batas administrasi (Provinsi - Desa)' }, { value: 'layer', label: 'Pilih polygon dari layer' }] },
        { name: 'boundaryLayer', type: 'layer', label: 'Clip Features layer', polygonOnly: true, required: true,
          showIf: function (v) { return v.clipSource === 'layer'; } },
        { name: 'adminBoundary', type: 'boundary', label: 'Clip Features (batas administrasi)',
          showIf: function (v) { return v.clipSource !== 'layer'; } },
        { name: 'output', type: 'text', label: 'Output Feature Class', required: true, placeholder: 'Nama layer hasil' }
      ]
    },
    {
      id: 'intersect',
      label: 'Intersect',
      toolbox: 'overlay',
      desc: 'Mengambil irisan antara dua layer atau lebih. Atribut gabungan disimpan di setiap hasil irisan.',
      params: [
        { name: 'layers', type: 'layers', label: 'Input Features (pilih minimal dua)', polygonOnly: true, min: 2, required: true },
        { name: 'attributeMode', type: 'select', label: 'Attributes To Join', default: 'all', options: ATTRIBUTE_OPTIONS },
        { name: 'output', type: 'text', label: 'Output Feature Class', required: true, placeholder: 'Nama layer hasil' }
      ]
    },
    {
      id: 'union',
      label: 'Union',
      toolbox: 'overlay',
      desc: 'Menyatukan seluruh area poligon dari beberapa layer, termasuk bagian yang tidak saling tumpang tindih.',
      params: [
        { name: 'layers', type: 'layers', label: 'Input Features (polygon)', polygonOnly: true, min: 2, required: true },
        { name: 'attributeMode', type: 'select', label: 'Attributes To Join', default: 'all', options: ATTRIBUTE_OPTIONS },
        { name: 'output', type: 'text', label: 'Output Feature Class', required: true, placeholder: 'Nama layer hasil' }
      ]
    },
    {
      id: 'merge',
      label: 'Merge',
      toolbox: 'data',
      desc: 'Menggabungkan beberapa layer bertipe geometri sama menjadi satu dataset tanpa mengubah geometrinya.',
      params: [
        { name: 'layers', type: 'layers', label: 'Input Datasets (pilih minimal dua)', min: 2, required: true },
        { name: 'fieldMode', type: 'select', label: 'Field Matching Mode', default: 'all',
          options: [{ value: 'all', label: 'Gabungkan seluruh field dari semua input' }, { value: 'first', label: 'Pakai skema dataset pertama saja' }] },
        { name: 'addSource', type: 'checkbox', label: 'Add source information to output (field MERGE_SRC)', default: false },
        { name: 'output', type: 'text', label: 'Output Dataset', required: true, placeholder: 'Nama dataset hasil' }
      ]
    },
    {
      id: 'dissolve',
      label: 'Dissolve',
      toolbox: 'data',
      desc: 'Menggabungkan poligon yang memiliki nilai atribut sama menjadi satu geometri.',
      rerenderOnChange: ['input'],
      params: [
        { name: 'input', type: 'layer', label: 'Input Features', polygonOnly: true, required: true },
        { name: 'fields', type: 'fields', label: 'Dissolve Fields (opsional)', layerFrom: 'input',
          hint: 'Kosongkan untuk menggabungkan seluruh fitur menjadi satu.' },
        { name: 'output', type: 'text', label: 'Output Feature Class', required: true, placeholder: 'Nama layer hasil' }
      ]
    },

    /* ---------------- Fase 2: tool tambahan ---------------- */
    {
      id: 'erase',
      label: 'Erase',
      toolbox: 'overlay',
      desc: 'Menghapus bagian fitur input yang berada di dalam Erase Features. Fitur di luar area erase tetap utuh.',
      params: [
        { name: 'input', type: 'layer', label: 'Input Features', required: true },
        { name: 'eraser', type: 'layer', label: 'Erase Features (polygon)', geometry: 'polygon', required: true },
        { name: 'output', type: 'text', label: 'Output Feature Class', required: true, placeholder: 'Nama layer hasil' }
      ]
    },
    {
      id: 'identity',
      label: 'Identity',
      toolbox: 'overlay',
      desc: 'Memotong fitur input dengan Identity Features: bagian di dalam mendapat atribut Identity, bagian luar tetap memakai atribut input saja.',
      params: [
        { name: 'input', type: 'layer', label: 'Input Features', required: true },
        { name: 'identityLayer', type: 'layer', label: 'Identity Features (polygon)', geometry: 'polygon', required: true },
        { name: 'output', type: 'text', label: 'Output Feature Class', required: true, placeholder: 'Nama layer hasil' }
      ]
    },
    {
      id: 'symdifference',
      label: 'Symmetric Difference',
      toolbox: 'overlay',
      desc: 'Mengambil bagian yang hanya dimiliki salah satu dari dua layer (A∖B dan B∖A) beserta atribut pemiliknya.',
      params: [
        { name: 'inputA', type: 'layer', label: 'Input Features A (polygon)', geometry: 'polygon', required: true },
        { name: 'inputB', type: 'layer', label: 'Input Features B (polygon)', geometry: 'polygon', required: true },
        { name: 'output', type: 'text', label: 'Output Feature Class', required: true, placeholder: 'Nama layer hasil' }
      ]
    },
    {
      id: 'split',
      label: 'Split',
      toolbox: 'overlay',
      desc: 'Memotong tiap fitur input mengikuti poligon pembagi. Hasil memakai atribut input + SPLIT_FID; fitur di luar poligon pembagi ikut utuh.',
      rerenderOnChange: ['splitLayer'],
      params: [
        { name: 'input', type: 'layer', label: 'Input Features', required: true },
        { name: 'splitLayer', type: 'layer', label: 'Split Features (polygon)', geometry: 'polygon', required: true },
        { name: 'splitField', type: 'field', label: 'Split Field (opsional)', layerFrom: 'splitLayer',
          hint: 'Kosongkan; bila dipilih, nilainya disimpan sebagai field SPLIT_VAL.' },
        { name: 'output', type: 'text', label: 'Output Feature Class', required: true, placeholder: 'Nama layer hasil' }
      ]
    },
    {
      id: 'spatialjoin',
      label: 'Spatial Join',
      toolbox: 'data',
      desc: 'Menyalin atribut fitur lain ke fitur target menurut relasi spasial (intersects, contains, within, atau terdekat).',
      rerenderOnChange: ['match', 'joinLayer'],
      params: [
        { name: 'target', type: 'layer', label: 'Target Features', required: true },
        { name: 'joinLayer', type: 'layer', label: 'Join Features', required: true },
        { name: 'match', type: 'select', label: 'Match Option', default: 'intersects',
          options: [
            { value: 'intersects', label: 'Intersects (beririsan)' },
            { value: 'contains', label: 'Target contains Join' },
            { value: 'within', label: 'Target within Join' },
            { value: 'nearest', label: 'Nearest (fitur terdekat)' }
          ] },
        { name: 'distance', type: 'number', label: 'Radius pencarian (meter, 0 = tanpa batas)', default: 0,
          showIf: function (v) { return v.match === 'nearest'; } },
        { name: 'joinFields', type: 'fields', label: 'Field dari Join Features (kosong = semua)', layerFrom: 'joinLayer' },
        { name: 'keepUnmatched', type: 'checkbox', label: 'Simpan target yang tidak punya pasangan', default: true },
        { name: 'output', type: 'text', label: 'Output Feature Class', required: true, placeholder: 'Nama layer hasil' }
      ]
    },
    {
      id: 'pairwisebuffer',
      label: 'Pairwise Buffer',
      toolbox: 'proximity',
      desc: 'Buffer per fitur dengan jarak tetap atau per field. Pilihan dissolve "pairs" melebur hanya buffer yang saling tumpang tindih (berbeda dari Buffer yang hanya none/all).',
      rerenderOnChange: ['distanceMode', 'input'],
      params: [
        { name: 'input', type: 'layer', label: 'Input Features', required: true },
        { name: 'distanceMode', type: 'select', label: 'Distance [value or field]', default: 'value',
          options: [{ value: 'value', label: 'Value (jarak tetap)' }, { value: 'field', label: 'Field (jarak tiap fitur)' }] },
        { name: 'distance', type: 'numberunit', label: 'Distance', default: 100, unitDefault: 'meters',
          showIf: function (v) { return v.distanceMode !== 'field'; } },
        { name: 'distanceField', type: 'field', label: 'Distance field', layerFrom: 'input', numeric: true, required: true,
          showIf: function (v) { return v.distanceMode === 'field'; } },
        { name: 'dissolve', type: 'select', label: 'Dissolve Type', default: 'none',
          options: [
            { value: 'none', label: 'None (hasil per fitur)' },
            { value: 'pairs', label: 'Dissolve pasangan yang tumpang tindih' }
          ] },
        { name: 'output', type: 'text', label: 'Output Feature Class', required: true, placeholder: 'Nama layer hasil' }
      ]
    },
    {
      id: 'near',
      label: 'Near',
      toolbox: 'proximity',
      desc: 'Menambahkan jarak terdekat (NEAR_DIST), indeks fitur rujukan (NEAR_FID), dan nama layer (NEAR_LAYER) pada setiap fitur input.',
      params: [
        { name: 'input', type: 'layer', label: 'Input Features', required: true },
        { name: 'nearLayer', type: 'layer', label: 'Near Features', required: true },
        { name: 'unit', type: 'select', label: 'Satuan jarak', default: 'meters', options: UNIT_OPTIONS },
        { name: 'output', type: 'text', label: 'Output Feature Class', required: true, placeholder: 'Nama layer hasil' }
      ]
    },
    {
      id: 'thiessen',
      label: 'Thiessen Polygon',
      toolbox: 'proximity',
      desc: 'Membagi ruang menjadi poligon Voronoi di sekitar setiap titik — setiap lokasi jatuh ke poligon titik terdekatnya. Atribut titik disalin ke poligon.',
      params: [
        { name: 'input', type: 'layer', label: 'Input Titik', geometry: 'point', required: true },
        { name: 'output', type: 'text', label: 'Output Feature Class', required: true, placeholder: 'Nama layer hasil' }
      ]
    },
    {
      id: 'pointstoline',
      label: 'Points To Line',
      toolbox: 'data',
      desc: 'Menghubungkan fitur titik menjadi LineString: diurutkan menurut field tertentu dan dipisah per kelompok field.',
      rerenderOnChange: ['input'],
      params: [
        { name: 'input', type: 'layer', label: 'Input Titik', geometry: 'point', required: true },
        { name: 'orderBy', type: 'field', label: 'Order By Field (opsional)', layerFrom: 'input',
          hint: 'Kosongkan untuk memakai urutan fitur pada layer.' },
        { name: 'groupBy', type: 'field', label: 'Group By Field (opsional)', layerFrom: 'input',
          hint: 'Kosongkan untuk membuat satu garis dari seluruh titik.' },
        { name: 'output', type: 'text', label: 'Output Feature Class', required: true, placeholder: 'Nama layer hasil' }
      ]
    },
    {
      id: 'calculatefield',
      label: 'Calculate Field',
      toolbox: 'data',
      desc: 'Mengisi nilai field untuk tiap fitur memakai ekspresi aritmetika atau teks terhadap field yang sudah ada.',
      params: [
        { name: 'input', type: 'layer', label: 'Input Features', required: true },
        { name: 'fieldName', type: 'text', label: 'Field Baru', default: 'HASIL', required: true,
          placeholder: 'Nama field hasil' },
        { name: 'expression', type: 'expression', label: 'Expression', layerFrom: 'input', required: true,
          placeholder: '[LUAS] / 10000',
          hint: 'Contoh: [LUAS] / 10000 · ROUND([P] * [L], 2) · UPPER([NAMA]) · IIF([X] > 10, "besar", "kecil"). Fungsi: ABS, ROUND, FLOOR, CEIL, INT, SQRT, POW, MIN, MAX, CONCAT, UPPER, LOWER, TRIM, LENGTH, IIF, CONTAINS, REPLACE.' },
        { name: 'output', type: 'text', label: 'Output Feature Class', required: true, placeholder: 'Nama layer hasil' }
      ]
    },
    {
      id: 'selectbyattributes',
      label: 'Select Layer By Attributes',
      toolbox: 'extract',
      desc: 'Memilih fitur yang memenuhi kondisi ekspresi atribut; hanya fitur lolos kondisi yang masuk ke hasil.',
      params: [
        { name: 'input', type: 'layer', label: 'Input Features', required: true },
        { name: 'expression', type: 'expression', label: 'Where Clause', layerFrom: 'input', required: true,
          placeholder: '[POP] > 100000',
          hint: 'Contoh: [POP] > 100000 AND [PROV] = \'Jawa Timur\' · operator: = != > >= < <= AND OR NOT · teks memakai kutip.' },
        { name: 'output', type: 'text', label: 'Output Feature Class', required: true, placeholder: 'Nama layer hasil' }
      ]
    },
    {
      id: 'repairgeometry',
      label: 'Repair Geometry',
      toolbox: 'data',
      desc: 'Memeriksa dan memperbaiki geometri rusak (self-intersection dkk.) lewat buffer(0). Field REPAIRED menandai hasil; geometri yang tetap rusak dibuang.',
      params: [
        { name: 'input', type: 'layer', label: 'Input Features', required: true },
        { name: 'output', type: 'text', label: 'Output Feature Class', required: true, placeholder: 'Nama layer hasil' }
      ]
    },
    {
      id: 'simplify',
      label: 'Simplify',
      toolbox: 'generalization',
      desc: 'Mengurangi jumlah titik geometri sesuai toleransi jarak. Topology Preserving menjaga validitas dan topologi antar fitur.',
      params: [
        { name: 'input', type: 'layer', label: 'Input Features', required: true },
        { name: 'distance', type: 'numberunit', label: 'Tolerance', default: 10, unitDefault: 'meters' },
        { name: 'method', type: 'select', label: 'Method', default: 'topology',
          options: [
            { value: 'topology', label: 'Topology Preserving (AMPLIFY/PE)' },
            { value: 'dp', label: 'Douglas-Peucker (POINT_REMOVE)' }
          ] },
        { name: 'output', type: 'text', label: 'Output Feature Class', required: true, placeholder: 'Nama layer hasil' }
      ]
    },
    {
      id: 'multiparttosinglepart',
      label: 'Multipart To Singlepart',
      toolbox: 'data',
      desc: 'Meledakkan geometri multi-bagian (MultiPolygon, MultiLineString dsb.) menjadi satu fitur per bagian; atribut disalin.',
      params: [
        { name: 'input', type: 'layer', label: 'Input Features', required: true },
        { name: 'output', type: 'text', label: 'Output Feature Class', required: true, placeholder: 'Nama layer hasil' }
      ]
    },
    {
      id: 'append',
      label: 'Append',
      toolbox: 'data',
      desc: 'Menambahkan fitur dari beberapa layer ke dalam satu layer dengan gabungan seluruh field (skema union). Tipe geometri boleh campur.',
      params: [
        { name: 'layers', type: 'layers', label: 'Input Datasets (pilih minimal dua)', min: 2, required: true },
        { name: 'addSource', type: 'checkbox', label: 'Tambahkan info sumber (SRC_LAYER, SRC_FID)', default: true },
        { name: 'output', type: 'text', label: 'Output Dataset', required: true, placeholder: 'Nama dataset hasil' }
      ]
    },
    {
      id: 'summarystats',
      label: 'Summary Statistics',
      toolbox: 'statistics',
      desc: 'Ringkasan statistik per kelompok: FREQUENCY plus SUM, MEAN, MIN, MAX, STD tiap field numerik. Hasil berupa tabel yang ditandai titik di pusat kelompok.',
      rerenderOnChange: ['input'],
      params: [
        { name: 'input', type: 'layer', label: 'Input Features', required: true },
        { name: 'groupFields', type: 'fields', label: 'Case Field (kelompok)', layerFrom: 'input',
          hint: 'Kosongkan untuk satu baris ringkasan seluruh fitur.' },
        { name: 'statFields', type: 'fields', label: 'Statistic Fields (numerik)', layerFrom: 'input', numeric: true,
          hint: 'Kosongkan untuk menghitung FREQUENCY saja.' },
        { name: 'output', type: 'text', label: 'Output Table', required: true, placeholder: 'Nama tabel hasil' }
      ]
    },
    {
      id: 'frequency',
      label: 'Frequency',
      toolbox: 'statistics',
      desc: 'Menghitung jumlah fitur (FREQUENCY) dan persentase (PERCENT) untuk setiap kombinasi nilai field terpilih.',
      rerenderOnChange: ['input'],
      params: [
        { name: 'input', type: 'layer', label: 'Input Features', required: true },
        { name: 'fields', type: 'fields', label: 'Frequency Fields (pilih minimal satu)', layerFrom: 'input',
          min: 1, required: true },
        { name: 'output', type: 'text', label: 'Output Table', required: true, placeholder: 'Nama tabel hasil' }
      ]
    },
    {
      id: 'tabulateintersection',
      label: 'Tabulate Intersection',
      toolbox: 'statistics',
      desc: 'Tabel silang luas irisan antara layer Zona dan layer Kelas: AREA_M2, AREA_HA, dan persentase terhadap luas zona.',
      rerenderOnChange: ['zoneLayer', 'classLayer'],
      params: [
        { name: 'zoneLayer', type: 'layer', label: 'Zone Features (polygon)', geometry: 'polygon', required: true },
        { name: 'zoneField', type: 'field', label: 'Zone Field', layerFrom: 'zoneLayer', required: true },
        { name: 'classLayer', type: 'layer', label: 'Class Features (polygon)', geometry: 'polygon', required: true },
        { name: 'classField', type: 'field', label: 'Class Field', layerFrom: 'classLayer', required: true },
        { name: 'output', type: 'text', label: 'Output Table', required: true, placeholder: 'Nama tabel hasil' }
      ]
    }
  ];

  GPC.get = function (id) {
    for (var i = 0; i < GPC.TOOLS.length; i++) if (GPC.TOOLS[i].id === id) return GPC.TOOLS[i];
    return null;
  };
  GPC.toolboxTools = function (toolboxId) {
    return GPC.TOOLS.filter(function (t) { return t.toolbox === toolboxId; });
  };
  GPC.toolboxLabel = function (toolboxId) {
    var box = GPC.TOOLBOXES.filter(function (b) { return b.id === toolboxId; })[0];
    return box ? box.label : toolboxId;
  };
  /* Pencarian multi-kata: setiap kata harus muncul di label/deskripsi/toolbox
     (AND), sehingga "buffer jarak" maupun "irisan dua" sama-sama cocok. */
  GPC.searchTools = function (query) {
    var words = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return GPC.TOOLS.slice();
    return GPC.TOOLS.filter(function (t) {
      var hay = (t.label + ' ' + t.desc + ' ' + GPC.toolboxLabel(t.toolbox)).toLowerCase();
      return words.every(function (word) { return hay.indexOf(word) >= 0; });
    });
  };

  /* ==========================================================================
     2. UTILITAS & PROYEKSI
     ========================================================================== */

  var RING_DEPTH = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 };
  var UNITS_IN_METERS = { meters: 1, kilometers: 1000, feet: 0.3048, miles: 1609.344, yards: 0.9144 };
  GPC.UNITS = UNITS_IN_METERS;
  GPC.UNIT_OPTIONS = UNIT_OPTIONS;

  function eachCoord(geometry, cb) {
    var depth = RING_DEPTH[geometry.type];
    if (depth === undefined) return;
    var walk = function (node, d) {
      if (!Array.isArray(node)) return;
      if (d === 0) { cb(node); return; }
      for (var i = 0; i < node.length; i++) walk(node[i], d - 1);
    };
    walk(geometry.coordinates, depth);
  }

  function bboxOf(features) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    (features || []).forEach(function (f) {
      if (!f || !f.geometry) return;
      eachCoord(f.geometry, function (c) {
        if (!c || !isFinite(c[0]) || !isFinite(c[1])) return;
        if (c[0] < b[0]) b[0] = c[0];
        if (c[1] < b[1]) b[1] = c[1];
        if (c[0] > b[2]) b[2] = c[0];
        if (c[1] > b[3]) b[3] = c[1];
      });
    });
    return isFinite(b[0]) ? b : [-180, -90, 180, 90];
  }

  /* Pilih CRS pemrosesan seperti ArcGIS: UTM zona otomatis dari pusat data,
     tetapi bila cakupan lebar (> 12 derajat) pakai Azimuthal Equidistant
     berpusat di tengah data agar deformasi jarak tetap kecil.               */
  function resolveProjection(env, bbox) {
    var mode = (env && env.crs) || 'auto';
    if (mode === '4326') return { def: null, label: 'WGS 84 (EPSG:4326)', identity: true };
    var cx = (bbox[0] + bbox[2]) / 2;
    var cy = (bbox[1] + bbox[3]) / 2;
    var width = bbox[2] - bbox[0];
    if (!isFinite(cx) || !isFinite(cy)) { cx = 117; cy = -2; }
    cx = Math.max(-179.9, Math.min(179.9, cx));
    cy = Math.max(-84, Math.min(84, cy));
    if (mode === 'aeqd' || (mode === 'auto' && width > 12)) {
      return {
        def: '+proj=aeqd +lat_0=' + cy.toFixed(6) + ' +lon_0=' + cx.toFixed(6) + ' +datum=WGS84 +units=m +no_defs',
        label: 'Azimuthal Equidistant (pusat data)',
        identity: false
      };
    }
    var zone = Math.floor((cx + 180) / 6) + 1;
    if (zone < 1) zone = 1;
    if (zone > 60) zone = 60;
    var north = cy >= 0;
    return {
      def: '+proj=utm +zone=' + zone + ' +' + (north ? 'north' : 'south') + ' +datum=WGS84 +units=m +no_defs',
      label: 'EPSG:' + (north ? 32600 + zone : 32700 + zone) + ' - UTM zone ' + zone + (north ? 'U' : 'S'),
      identity: false
    };
  }
  GPC.resolveProjection = resolveProjection;

  /* Transformer maju-mundur + pembulatan presisi (XY Tolerance).           */
  function makeProjector(proj, env) {
    var tol = env && Number(env.xyTolerance) > 0 ? Number(env.xyTolerance) : 0;
    var dec = 0;
    if (tol > 0) {
      /* satuan proyeksi = meter; mode derajat dikonversi (1 derajat ~ 111320 m) */
      dec = Math.max(0, Math.round(-Math.log10(proj.def ? tol : tol / 111320)));
    }
    var round = tol > 0 ? (function (d) {
      var m = Math.pow(10, d);
      return function (v) { return Math.round(v * m) / m; };
    })(dec) : null;
    var pr = { label: proj.label, identity: !!proj.identity, def: proj.def };
    if (!proj.def) {
      pr.fwd = function (c) { return round ? [round(c[0]), round(c[1])] : [c[0], c[1]]; };
      pr.inv = function (c) { return [c[0], c[1]]; };
      return pr;
    }
    var t = proj4('+proj=longlat +datum=WGS84 +no_defs', proj.def);
    pr.fwd = function (c) {
      var p = t.forward([c[0], c[1]]);
      if (c.length > 2) p.push(c[2]);
      return round ? [round(p[0]), round(p[1])].concat(p.length > 2 ? [p[2]] : []) : p;
    };
    pr.inv = function (c) { return t.inverse([c[0], c[1]]); };
    return pr;
  }

  function mapGeometry(geometry, fn) {
    if (!geometry || !geometry.coordinates) return geometry;
    var depth = RING_DEPTH[geometry.type];
    if (depth === undefined) return geometry;
    var out = {};
    for (var k in geometry) if (Object.prototype.hasOwnProperty.call(geometry, k)) out[k] = geometry[k];
    var clone = function (node, d) {
      if (!Array.isArray(node)) return node;
      if (d === 0) return fn(node);
      var arr = new Array(node.length);
      for (var i = 0; i < node.length; i++) arr[i] = clone(node[i], d - 1);
      return arr;
    };
    out.coordinates = clone(geometry.coordinates, depth);
    return out;
  }

  /* ---------------------------------------------------------------------
     Densifikasi sisi panjang.

     Sisi lurus di satu CRS bukan garis lurus di CRS lain: rentang lintang
     38 km yang lurus di EPSG:4326 menjadi melengkung ~3,8 m di UTM (dan
     sebaliknya). Agar hasil potong/buffer tidak meleset beberapa meter,
     sisi lebih panjang dari MAX_SEG dipecah lebih dulu, lalu tiap titik
     baru diproyeksikan/dikembalikan satu per satu.
     --------------------------------------------------------------------- */
  var MAX_SEG_M = 1000;

  function dist2(a, b) {
    var dx = a[0] - b[0], dy = a[1] - b[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  function densifyTransform(positions, transform, lengthOf) {
    if (!Array.isArray(positions) || positions.length < 2) return positions;
    var out = [];
    var a = null, pa = null;
    for (var i = 0; i < positions.length; i++) {
      var b = positions[i];
      if (!Array.isArray(b) || !isFinite(b[0]) || !isFinite(b[1])) return positions;
      var pb = transform(b);
      if (a !== null && lengthOf(a, b, pa, pb) > MAX_SEG_M) {
        var parts = Math.min(Math.ceil(lengthOf(a, b, pa, pb) / MAX_SEG_M), 2000);
        for (var k = 1; k < parts; k++) {
          var t = k / parts;
          var m = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          if (a.length > 2 && b.length > 2) m.push((a[2] || 0) + ((b[2] || 0) - (a[2] || 0)) * t);
          out.push(transform(m));
        }
      }
      out.push(pb);
      a = b;
      pa = pb;
    }
    return out;
  }

  /* Daftar posisi -> daftar posisi terproyeksi (dengan densifikasi). */
  function projectPath(positions, pr) {
    if (pr.identity) return positions.slice();
    return densifyTransform(positions, pr.fwd, function (x, y, px, py) { return dist2(px, py); });
  }

  /* Daftar posisi terproyeksi -> daftar posisi 4326. Sisi hasil operasi
     lurus di ruang proyeksi, jadi densifikasi dihitung di ruang itu.      */
  function unprojectPath(positions, pr) {
    if (pr.identity) return positions.slice();
    return densifyTransform(positions, pr.inv, function (x, y) { return dist2(x, y); });
  }

  function transformGeometry(geometry, mode, pr) {
    if (pr.identity || !geometry || !geometry.coordinates) return geometry;
    var depth = RING_DEPTH[geometry.type];
    if (depth === undefined) return mapGeometry(geometry, mode === 'fwd' ? pr.fwd : pr.inv);
    var out = {};
    for (var k in geometry) if (Object.prototype.hasOwnProperty.call(geometry, k)) out[k] = geometry[k];
    var path = mode === 'fwd' ? projectPath : unprojectPath;
    var walk = function (node, d) {
      if (d === 0) return (mode === 'fwd' ? pr.fwd : pr.inv)(node);
      if (!Array.isArray(node)) return node;
      if (d === 1) return path(node, pr);
      var arr = new Array(node.length);
      for (var i = 0; i < node.length; i++) arr[i] = walk(node[i], d - 1);
      return arr;
    };
    out.coordinates = walk(geometry.coordinates, depth);
    return out;
  }

  function projectFeatures(features, pr) {
    if (pr.identity) return features;
    return (features || []).map(function (f) {
      if (!f || !f.geometry) return f;
      return { type: 'Feature', id: f.id, properties: f.properties, geometry: transformGeometry(f.geometry, 'fwd', pr) };
    });
  }

  function unprojectFeatures(features, pr) {
    if (pr.identity) return features;
    return (features || []).map(function (f) {
      if (!f || !f.geometry) return f;
      return { type: 'Feature', id: f.id, properties: f.properties, geometry: transformGeometry(f.geometry, 'inv', pr) };
    });
  }

  function mkFeat(geometry, properties) {
    return { type: 'Feature', properties: properties || {}, geometry: geometry };
  }

  function sanitizeField(name) {
    return String(name || 'layer').replace(/[^a-z0-9_]+/gi, '_');
  }

  function fidValue(feature, index) {
    if (feature.id != null) return feature.id;
    if (feature.properties && feature.properties.OBJECTID != null) return feature.properties.OBJECTID;
    if (feature.properties && feature.properties.FID != null) return feature.properties.FID;
    return index;
  }

  function tick(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms || 0); });
  }

  /* ==========================================================================
     3. PEMBANTU JSTS
     ========================================================================== */

  function requireJsts() {
    if (!global.jsts || !global.jsts.io || !global.jsts.io.GeoJSONReader) {
      throw new Error('Pustaka JSTS belum tersedia. Muat ulang halaman dan pastikan koneksi internet aktif.');
    }
    return global.jsts;
  }

  var _reader = null;
  var _writer = null;
  function reader() {
    if (_reader) return _reader;
    var J = requireJsts();
    return (_reader = new J.io.GeoJSONReader());
  }
  function writer() {
    if (_writer) return _writer;
    var J = requireJsts();
    return (_writer = new J.io.GeoJSONWriter());
  }

  /* Geometri rusak (self-intersection, cincin kolinear, dsb.) diperbaiki
     dulu lewat buffer(0). Geometri yang tetap rusak dibuang dan dihitung
     sebagai "dilewati" supaya laporan hasil jujur, bukan hilang diam-diam. */
  function toJsts(feature, p) {
    var geo = feature && feature.geometry;
    if (!geo || !geo.coordinates || !Array.isArray(geo.coordinates)) return null;
    var geom;
    try { geom = reader().read(geo); } catch (e) { if (p && p.skip) p.skip(); return null; }
    if (!geom || geom.isEmpty()) return null;
    try {
      var J = requireJsts();
      if (new J.operation.valid.IsValidOp(geom).isValid()) return geom;
    } catch (e2) { /* lanjut ke perbaikan */ }
    try {
      var fixed = geom.buffer(0);
      if (fixed && !fixed.isEmpty() && fixed.isValid()) return fixed;
    } catch (e3) { /* jatuh ke bawah */ }
    if (p && p.skip) p.skip();
    return null;
  }

  function fromJsts(geom) {
    if (!geom || geom.isEmpty()) return null;
    try {
      var out = writer().write(geom);
      if (!out || !out.type) return null;
      if (out.coordinates && !hasNumber(out.coordinates)) return null;
      if (out.geometries && !out.geometries.length) return null;
      return out;
    } catch (e) { return null; }
  }

  function hasNumber(node) {
    if (typeof node[0] === 'number') return isFinite(node[0]);
    for (var i = 0; i < node.length; i++) if (hasNumber(node[i])) return true;
    return false;
  }

  /* Overlay dengan satu kali percobaan ulang setelah perbaikan geometri -
     Turf lama menangkap error lalu melempar null tanpa pesan (fitur hilang). */
  function safeOverlay(fn, a, b, label) {
    try { return fn(a, b); } catch (e1) {
      var ra = a, rb = b;
      try { ra = a.buffer(0) || a; } catch (_) { /* biarkan */ }
      try { rb = b.buffer(0) || b; } catch (_) { /* biarkan */ }
      try { return fn(ra, rb); } catch (e2) {
        throw new Error(label + ' gagal pada geometri yang tetap rusak: ' + ((e2 && e2.message) || (e1 && e1.message) || 'tidak diketahui'));
      }
    }
  }

  function unionAll(geoms) {
    if (!geoms.length) return null;
    if (geoms.length === 1) return geoms[0];
    var J = requireJsts();
    var gc = new J.geom.GeometryFactory().createGeometryCollection(geoms);
    return J.operation.union.UnaryUnionOp.union(gc);
  }

  /* ==========================================================================
     4. OPERASI

     Semua op menerima (job, p) dan mengembalikan { features, crs }.
     `p.report(v, label)` melaporkan kemajuan (0..1), `await p.tick()` memberi
     jeda ke event loop supaya UI tidak freeze dan pembatalan bisa dibaca.
     ========================================================================== */

  async function prep(job, p, sets) {
    var all = [];
    sets.forEach(function (s) { for (var i = 0; i < s.length; i++) all.push(s[i]); });
    var proj = resolveProjection(job.env, bboxOf(all));
    var pr = makeProjector(proj, job.env);
    p.report(0.02, 'Memproyeksi ke ' + pr.label);
    await p.tick();
    return { pr: pr, sets: sets.map(function (s) { return projectFeatures(s, pr); }) };
  }

  /* Extent (opsional, dalam EPSG:4326) dipotong ke geometri hasil.         */
  async function applyExtent(features, job, p, pr) {
    var box = job.env && job.env.extentBBox;
    if (!box || !features || !features.length) return features;
    var n = box.map(Number);
    if (n.some(function (v) { return !isFinite(v); }) || n[0] >= n[2] || n[1] >= n[3]) return features;
    /* Sisi kotak didefinisikan sebagai sejajar lintang/bujur di 4326; bila
       hanya 4 sudutnya diproyeksi, tepinya jadi garis lurus di ruang proyeksi
       dan meleset beberapa meter. Sisi ditebalkan dulu (~0,5 derajat) baru
       diproyeksikan. */
    var corners = [[n[0], n[1]], [n[0], n[3]], [n[2], n[3]], [n[2], n[1]]];
    var ring = [];
    var STEP = 0.5;
    for (var e = 0; e < corners.length; e++) {
      var a = corners[e];
      var b = corners[(e + 1) % corners.length];
      var steps = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / STEP));
      for (var s = 0; s < steps; s++) {
        var t = s / steps;
        ring.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    ring.push(ring[0].slice());
    ring = ring.map(function (c) { return pr.fwd(c); });
    var mask;
    try { mask = reader().read({ type: 'Polygon', coordinates: [ring] }); }
    catch (e) { return features; }
    var out = [];
    for (var i = 0; i < features.length; i++) {
      var f = features[i];
      if (!f || !f.geometry) continue;
      var g = toJsts(f, p);
      if (g) {
        var r = safeOverlay(function (a, b) { return a.intersection(b); }, g, mask, 'Extent');
        var geom = fromJsts(r);
        if (geom) out.push(mkFeat(geom, f.properties));
      }
      p.report(0.9 + 0.08 * ((i + 1) / features.length), 'Menerapkan extent ' + (i + 1) + '/' + features.length);
      await p.tick();
    }
    return out;
  }

  function unionFeatureList(list, properties, p) {
    var geoms = [];
    for (var i = 0; i < list.length; i++) {
      var g = toJsts(list[i], p);
      if (g) geoms.push(g);
    }
    if (!geoms.length) return [];
    var u = unionAll(geoms);
    var geom = fromJsts(u);
    return geom ? [mkFeat(geom, properties)] : [];
  }

  var OPS = {};

  /* ---------------- Buffer ---------------- */
  OPS.buffer = async function (job, p) {
    requireJsts();
    var params = job.params || {};
    var input = job.inputs.input;
    if (!input || !input.features || !input.features.length) throw new Error('Input Features kosong.');
    var useField = params.distanceMode === 'field';
    var mpu = UNITS_IN_METERS[params.unit] || 1;
    var fixed = Number(params.distance) * mpu;
    if (!useField && !(fixed > 0)) throw new Error('Masukkan jarak buffer positif.');
    if (useField && !params.distanceField) throw new Error('Pilih field numerik untuk Distance.');

    var r = await prep(job, p, [input.features]);
    var feats = r.sets[0];
    var J = requireJsts();
    var bp = new J.operation.buffer.BufferParameters();
    bp.setQuadrantSegments(16); /* pojok membulat halus, setara ArcGIS default */
    var out = [];
    for (var i = 0; i < feats.length; i++) {
      var f = feats[i];
      var d = fixed;
      if (useField) {
        var raw = f.properties ? f.properties[params.distanceField] : undefined;
        d = Number(raw);
        if (!isFinite(d) || d <= 0) {
          throw new Error('Nilai field "' + params.distanceField + '" pada fitur #' + (i + 1) + ' harus angka positif (nilai: ' + raw + ').');
        }
        d *= mpu;
      }
      var g = toJsts(f, p);
      if (g) {
        var b = safeOverlay(function (geom, dist) {
          return requireJsts().operation.buffer.BufferOp.bufferOp(geom, dist, bp);
        }, g, d, 'Buffer fitur #' + (i + 1));
        var geom = fromJsts(b);
        if (geom) out.push(mkFeat(geom, f.properties));
      }
      p.report(0.05 + 0.85 * ((i + 1) / Math.max(1, feats.length)), 'Buffer ' + (i + 1) + '/' + feats.length + ' fitur');
      await p.tick();
    }
    if (params.dissolve === 'all' && out.length > 1) {
      p.report(0.93, 'Melebur seluruh buffer...');
      await p.tick();
      out = unionFeatureList(out, {}, p);
    }
    out = await applyExtent(out, job, p, r.pr);
    p.report(0.98, 'Menyiapkan hasil...');
    return { features: unprojectFeatures(out, r.pr), crs: r.pr.label };
  };

  /* ---------------- Clip ---------------- */
  OPS.clip = async function (job, p) {
    requireJsts();
    var input = job.inputs.input;
    var boundary = job.inputs.boundary;
    if (!input || !input.features || !input.features.length) throw new Error('Input Features kosong.');
    if (!boundary || !boundary.features || !boundary.features.length) {
      throw new Error('Clip Features belum tersedia. Muat batas wilayah atau pilih layer polygon terlebih dahulu.');
    }
    var r = await prep(job, p, [input.features, boundary.features]);
    var feats = r.sets[0];
    var masks = r.sets[1];
    p.report(0.08, 'Menyatukan Clip Features...');
    await p.tick();
    var maskGeoms = [];
    for (var m = 0; m < masks.length; m++) {
      var mg = toJsts(masks[m], p);
      if (mg && /Polygon/.test(mg.getGeometryType())) maskGeoms.push(mg);
    }
    if (!maskGeoms.length) throw new Error('Clip Features tidak memiliki poligon.');
    var mask = unionAll(maskGeoms);
    var out = [];
    for (var i = 0; i < feats.length; i++) {
      var g = toJsts(feats[i], p);
      if (g) {
        var res = safeOverlay(function (a, b) { return a.intersection(b); }, g, mask, 'Clip fitur #' + (i + 1));
        var geom = fromJsts(res);
        if (geom) out.push(mkFeat(geom, feats[i].properties));
      }
      p.report(0.1 + 0.8 * ((i + 1) / Math.max(1, feats.length)), 'Clip ' + (i + 1) + '/' + feats.length + ' fitur');
      await p.tick();
    }
    out = await applyExtent(out, job, p, r.pr);
    p.report(0.98, 'Menyiapkan hasil...');
    return { features: unprojectFeatures(out, r.pr), crs: r.pr.label };
  };

  /* ---------------- Intersect ---------------- */
  OPS.intersect = async function (job, p) {
    requireJsts();
    var layers = job.inputs.layers || [];
    if (layers.length < 2) throw new Error('Pilih minimal dua Input Features.');
    var attrMode = job.params.attributeMode || 'all';
    var r = await prep(job, p, layers.map(function (l) { return l.features || []; }));
    var fidField = function (index) { return 'FID_' + sanitizeField(layers[index].name); };

    var entries = [];
    r.sets[0].forEach(function (f, i) {
      var g = toJsts(f, p);
      if (!g || !/Polygon/.test(g.getGeometryType())) return;
      var ids = {};
      ids[fidField(0)] = fidValue(f, i);
      entries.push({ g: g, props: Object.assign({}, f.properties || {}), ids: ids });
    });

    for (var li = 1; li < r.sets.length && entries.length; li++) {
      var over = [];
      r.sets[li].forEach(function (f, i) {
        var g = toJsts(f, p);
        if (!g || !/Polygon/.test(g.getGeometryType())) return;
        over.push({ g: g, props: f.properties || {}, id: fidValue(f, i) });
      });
      var name = fidField(li);
      var next = [];
      for (var ei = 0; ei < entries.length; ei++) {
        var e = entries[ei];
        var env = e.g.getEnvelopeInternal();
        for (var oi = 0; oi < over.length; oi++) {
          var o = over[oi];
          if (!env.intersects(o.g.getEnvelopeInternal())) continue;
          if (!e.g.intersects(o.g)) continue;
          var res = safeOverlay(function (a, b) { return a.intersection(b); }, e.g, o.g, 'Intersect');
          if (!res || res.isEmpty()) continue;
          var ids = Object.assign({}, e.ids);
          if (!Object.prototype.hasOwnProperty.call(ids, name)) ids[name] = o.id;
          /* Mode 'all' tetap menyertakan FID_<layer> seperti ArcGIS: field
             asal tiap layer dipertahankan agar hasil bisa ditelusuri balik. */
          next.push({
            g: res,
            props: attrMode === 'fid' ? Object.assign({}, ids)
              : attrMode === 'no-fid' ? Object.assign({}, e.props, o.props)
                : Object.assign({}, e.props, o.props, ids),
            ids: ids
          });
        }
        p.report(0.05 + 0.85 * ((li - 1 + (ei + 1) / Math.max(1, entries.length)) / (r.sets.length - 1)),
          'Intersect layer ' + li + '/' + (r.sets.length - 1) + ' - ' + (ei + 1) + '/' + entries.length + ' fitur');
        await p.tick();
      }
      entries = next;
    }

    var out = [];
    for (var k = 0; k < entries.length; k++) {
      var item = entries[k];
      var props = item.props;
      if (attrMode === 'no-fid') {
        props = Object.fromEntries(Object.entries(props).filter(function (pair) {
          return !/^(FID(?:_|$)|OBJECTID$|FID\d+$)/i.test(pair[0]);
        }));
      }
      var geom = fromJsts(item.g);
      if (geom) out.push(mkFeat(geom, props));
      if (k % 200 === 0) { p.report(0.9 + 0.08 * (k / Math.max(1, entries.length)), 'Menulis hasil irisan...'); await p.tick(); }
    }
    out = await applyExtent(out, job, p, r.pr);
    p.report(0.99, 'Menyiapkan hasil...');
    return { features: unprojectFeatures(out, r.pr), crs: r.pr.label };
  };

  /* ---------------- Union ---------------- */
  OPS.union = async function (job, p) {
    requireJsts();
    var layers = job.inputs.layers || [];
    if (layers.length < 2) throw new Error('Pilih minimal dua Input Features.');
    var attrMode = job.params.attributeMode || 'all';
    var r = await prep(job, p, layers.map(function (l) { return l.features || []; }));
    var flat = [];
    r.sets.forEach(function (set, li) {
      set.forEach(function (f, fi) { flat.push({ f: f, li: li, fi: fi }); });
    });
    if (!flat.length) throw new Error('Tidak ditemukan poligon pada layer terpilih.');

    var parts = [];
    for (var i = 0; i < flat.length; i++) {
      var src = flat[i];
      var g = toJsts(src.f, p);
      if (!g || !/Polygon/.test(g.getGeometryType())) continue;
      var ids = {};
      ids['FID_' + sanitizeField(layers[src.li].name)] = fidValue(src.f, src.fi);
      var cur = { g: g, props: Object.assign({}, src.f.properties || {}), ids: ids };
      var changed = true;
      while (changed) {
        changed = false;
        for (var j = 0; j < parts.length; j++) {
          var other = parts[j];
          if (!other.g.getEnvelopeInternal().intersects(cur.g.getEnvelopeInternal())) continue;
          if (!other.g.intersects(cur.g)) continue;
          cur.g = safeOverlay(function (a, b) { return a.union(b); }, other.g, cur.g, 'Union');
          cur.props = Object.assign({}, other.props, cur.props);
          cur.ids = Object.assign({}, other.ids, cur.ids);
          parts.splice(j, 1);
          changed = true;
          break;
        }
      }
      parts.push(cur);
      p.report(0.05 + 0.85 * ((i + 1) / flat.length), 'Union ' + (i + 1) + '/' + flat.length + ' fitur');
      await p.tick();
    }

    var out = [];
    for (var k = 0; k < parts.length; k++) {
      var item = parts[k];
      var props = item.props;
      if (attrMode === 'fid') props = Object.assign({}, item.ids);
      else if (attrMode === 'no-fid') {
        props = Object.fromEntries(Object.entries(props).filter(function (pair) {
          return !/^(FID(?:_|$)|OBJECTID$|FID\d+$)/i.test(pair[0]);
        }));
      } else {
        props = Object.assign({}, item.props, item.ids);
      }
      var geom = fromJsts(item.g);
      if (geom) out.push(mkFeat(geom, props));
    }
    out = await applyExtent(out, job, p, r.pr);
    p.report(0.99, 'Menyiapkan hasil...');
    return { features: unprojectFeatures(out, r.pr), crs: r.pr.label };
  };

  /* ---------------- Merge ---------------- */
  OPS.merge = async function (job, p) {
    var layers = job.inputs.layers || [];
    if (layers.length < 2) throw new Error('Pilih minimal dua layer.');
    var family = function (type) {
      return !type ? 'other' : /Point/.test(type) ? 'point' : /Line/.test(type) ? 'line' : /Polygon/.test(type) ? 'polygon' : 'other';
    };
    var kinds = {};
    layers.forEach(function (l) {
      (l.features || []).forEach(function (f) { kinds[family(f.geometry && f.geometry.type)] = true; });
    });
    var keys = Object.keys(kinds);
    if (keys.length !== 1 || keys[0] === 'other') {
      throw new Error('Merge hanya bisa untuk layer dengan tipe geometri yang sama (point, line, atau polygon).');
    }
    var useFirstSchema = job.params.fieldMode === 'first';
    var firstKeys = null;
    if (useFirstSchema) {
      var first = (layers[0].features || []).filter(function (f) { return f.properties && Object.keys(f.properties).length; })[0];
      firstKeys = first ? Object.keys(first.properties) : [];
    }
    var addSource = !!job.params.addSource;
    var total = layers.reduce(function (sum, l) { return sum + (l.features || []).length; }, 0);
    var done = 0;
    var out = [];
    for (var li = 0; li < layers.length; li++) {
      var feats = layers[li].features || [];
      for (var i = 0; i < feats.length; i++) {
        var f = feats[i];
        done++;
        if (f.geometry) {
          var props = f.properties || {};
          if (useFirstSchema) {
            props = Object.fromEntries(Object.entries(props).filter(function (pair) { return firstKeys.indexOf(pair[0]) >= 0; }));
          }
          if (addSource) props = Object.assign({}, props, { MERGE_SRC: layers[li].name });
          out.push(mkFeat(f.geometry, props));
        }
        if (done % 250 === 0) {
          p.report(0.95 * (done / Math.max(1, total)), 'Menyalin ' + done + '/' + total + ' fitur');
          await p.tick();
        }
      }
    }
    p.report(1, 'Selesai');
    return { features: out, crs: 'EPSG:4326' };
  };

  /* ---------------- Dissolve ---------------- */
  OPS.dissolve = async function (job, p) {
    requireJsts();
    var input = job.inputs.input;
    if (!input || !input.features || !input.features.length) throw new Error('Input Features kosong.');
    var fields = Array.isArray(job.params.fields) ? job.params.fields : [];
    var polygon = [];
    input.features.forEach(function (f) {
      if (f.geometry && /Polygon/.test(f.geometry.type)) polygon.push(f);
    });
    if (!polygon.length) throw new Error('Layer tidak memiliki poligon untuk di-dissolve.');
    var r = await prep(job, p, [polygon]);
    var feats = r.sets[0];

    var groups = new Map();
    for (var i = 0; i < feats.length; i++) {
      var f = feats[i];
      var values = fields.map(function (key) { return f.properties ? f.properties[key] : undefined; });
      var key = fields.length ? JSON.stringify(values) : 'all';
      if (!groups.has(key)) groups.set(key, { values: values, features: [] });
      groups.get(key).features.push(f);
      if (i % 250 === 0) { p.report(0.15 * (i / feats.length), 'Mengelompokkan fitur...'); await p.tick(); }
    }

    var out = [];
    var list = Array.from(groups.values());
    for (var gi = 0; gi < list.length; gi++) {
      var group = list[gi];
      var props = {};
      fields.forEach(function (key, index) { props[key] = group.values[index]; });
      out = out.concat(unionFeatureList(group.features, props, p));
      p.report(0.2 + 0.72 * ((gi + 1) / list.length), 'Melebur grup ' + (gi + 1) + '/' + list.length);
      await p.tick();
    }
    out = await applyExtent(out, job, p, r.pr);
    p.report(0.99, 'Menyiapkan hasil...');
    return { features: unprojectFeatures(out, r.pr), crs: r.pr.label };
  };

  /* ---------------- Fase 2: operasi tambahan ---------------- */
  function polygonUnion(features, p) {
    var list = [];
    (features || []).forEach(function (f) { var g = toJsts(f, p); if (g && /Polygon/.test(g.getGeometryType())) list.push(g); });
    return unionAll(list);
  }
  function splitGeometry(g, mask, op) {
    if (!mask) return g;
    if (!g.getEnvelopeInternal().intersects(mask.getEnvelopeInternal()) || !g.intersects(mask)) return g;
    return safeOverlay(function (a, b) { return a[op](b); }, g, mask, op);
  }
  function explodeGeometry(geom) {
    if (!geom) return [];
    if (geom.getNumGeometries && geom.getNumGeometries() > 1) {
      var a = []; for (var i = 0; i < geom.getNumGeometries(); i++) a.push(geom.getGeometryN(i)); return a;
    }
    return [geom];
  }
  function propCopy(f) { return Object.assign({}, f && f.properties || {}); }
  function tableResult(rows) { return { features: rows.map(function (r) { return mkFeat(null, r); }), table: true, crs: 'Tabel' }; }
  function evalExpression(expression, properties) {
    var src = String(expression || '').trim();
    if (!src) throw new Error('Ekspresi tidak boleh kosong.');
    src = src.replace(/\[([^\]]+)\]/g, function (_, key) { return JSON.stringify(properties[key.trim()] == null ? null : properties[key.trim()]); });
    src = src.replace(/\bAND\b/gi, '&&').replace(/\bOR\b/gi, '||').replace(/\bNOT\b/gi, '!');
    src = src.replace(/(?<![<>=!])=(?!=)/g, '==');
    var funcs = { ABS:Math.abs, ROUND:function(v,n){var m=Math.pow(10,Number(n)||0);return Math.round(Number(v)*m)/m;}, FLOOR:Math.floor, CEIL:Math.ceil, INT:function(v){return parseInt(v,10);}, SQRT:Math.sqrt, POW:Math.pow, MIN:Math.min, MAX:Math.max, CONCAT:function(){return Array.prototype.join.call(arguments,'');}, UPPER:function(v){return String(v).toUpperCase();}, LOWER:function(v){return String(v).toLowerCase();}, TRIM:function(v){return String(v).trim();}, LENGTH:function(v){return String(v).length;}, IIF:function(c,a,b){return c?a:b;}, CONTAINS:function(a,b){return String(a).indexOf(String(b))>=0;}, REPLACE:function(a,b,c){return String(a).split(String(b)).join(String(c));} };
    var allowed = /^(?:[\w\s.+\-*/%(),!<>=&|"']|\d)+$/;
    if (!allowed.test(src) || /(?:constructor|prototype|__proto__|globalThis|window|document|function|return|new)\b/i.test(src)) throw new Error('Ekspresi berisi sintaks yang tidak didukung.');
    var words = src.match(/[A-Za-z_$][\w$]*/g) || [];
    words.forEach(function(w){if(!/^(true|false|null|undefined|NaN|ABS|ROUND|FLOOR|CEIL|INT|SQRT|POW|MIN|MAX|CONCAT|UPPER|LOWER|TRIM|LENGTH|IIF|CONTAINS|REPLACE)$/i.test(w)) throw new Error('Token ekspresi tidak dikenal: '+w);});
    try { return Function('f', '"use strict"; return (' + src.replace(/\b([A-Za-z]+)\s*\(/g,function(all,n){return 'f.'+n.toUpperCase()+'(';}) + ');')(funcs); }
    catch (e) { throw new Error('Ekspresi tidak valid: ' + (e.message || e)); }
  }

  OPS.erase = async function (job, p) {
    requireJsts(); var input = job.inputs.input, eraser = job.inputs.eraser;
    var r = await prep(job, p, [input.features, eraser.features]);
    var mask = polygonUnion(r.sets[1], p); if (!mask) throw new Error('Erase Features harus berisi poligon.');
    var out = [];
    for (var i = 0; i < r.sets[0].length; i++) { var f = r.sets[0][i], g = toJsts(f,p); if (g) { var x = splitGeometry(g,mask,'difference'), geo=fromJsts(x); if(geo) out.push(mkFeat(geo,propCopy(f))); } p.report(.1+.8*(i+1)/r.sets[0].length,'Erase fitur '+(i+1)); await p.tick(); }
    out=await applyExtent(out,job,p,r.pr); return {features:unprojectFeatures(out,r.pr),crs:r.pr.label};
  };
  OPS.identity = async function (job,p) {
    requireJsts(); var r=await prep(job,p,[job.inputs.input.features,job.inputs.identityLayer.features]);
    var mask=polygonUnion(r.sets[1],p); if(!mask) throw new Error('Identity Features harus berisi poligon.'); var out=[];
    for(var i=0;i<r.sets[0].length;i++){var f=r.sets[0][i],g=toJsts(f,p);if(g){var inside=splitGeometry(g,mask,'intersection'),outside=splitGeometry(g,mask,'difference');
      explodeGeometry(inside).forEach(function(part){var geo=fromJsts(part);if(geo)out.push(mkFeat(geo,Object.assign({},propCopy(f),{IDENTITY:1})));});
      explodeGeometry(outside).forEach(function(part){var geo=fromJsts(part);if(geo)out.push(mkFeat(geo,Object.assign({},propCopy(f),{IDENTITY:null})));});}
      p.report(.1+.8*(i+1)/r.sets[0].length,'Identity fitur '+(i+1));await p.tick();}
    return {features:unprojectFeatures(await applyExtent(out,job,p,r.pr),r.pr),crs:r.pr.label};
  };
  OPS.symdifference = async function(job,p){requireJsts();var a=job.inputs.inputA.features,b=job.inputs.inputB.features,r=await prep(job,p,[a,b]),ga=polygonUnion(r.sets[0],p),gb=polygonUnion(r.sets[1],p);if(!ga||!gb)throw new Error('Kedua input harus memiliki poligon.');var out=[];
    [[safeOverlay(function(x,y){return x.difference(y);},ga,gb,'Difference'), 'A'],[safeOverlay(function(x,y){return x.difference(y);},gb,ga,'Difference'),'B']].forEach(function(pair){explodeGeometry(pair[0]).forEach(function(g){var geo=fromJsts(g);if(geo)out.push(mkFeat(geo,{SOURCE:pair[1]}));});});return{features:unprojectFeatures(out,r.pr),crs:r.pr.label};};
  OPS.split = async function(job,p){requireJsts();var r=await prep(job,p,[job.inputs.input.features,job.inputs.splitLayer.features]),mask=polygonUnion(r.sets[1],p);if(!mask)throw new Error('Split Features harus berisi poligon.');var out=[];
    r.sets[0].forEach(function(f,i){var g=toJsts(f,p);if(g){explodeGeometry(splitGeometry(g,mask,'intersection')).forEach(function(part){var geo=fromJsts(part);if(geo){var props=propCopy(f),matched=null;props.SPLIT_FID=i;if(job.params.splitField){matched=r.sets[1].filter(function(s){return s.properties&&s.properties[job.params.splitField]!=null;})[0];props.SPLIT_VAL=matched?matched.properties[job.params.splitField]:null;}out.push(mkFeat(geo,props));}});}});return{features:unprojectFeatures(out,r.pr),crs:r.pr.label};};
  OPS.pairwisebuffer = async function(job,p){var result=await OPS.buffer(Object.assign({},job,{params:Object.assign({},job.params,{dissolve:'none'})}),p);if(job.params.dissolve!=='pairs'||result.features.length<2)return result;requireJsts();var geoms=result.features.map(function(f){return toJsts(f,p);}),seen={},out=[];for(var i=0;i<geoms.length;i++){if(seen[i])continue;var group=[i];seen[i]=true;for(var q=0;q<group.length;q++){var at=group[q];for(var j=0;j<geoms.length;j++){if(seen[j]||!geoms[at].getEnvelopeInternal().intersects(geoms[j].getEnvelopeInternal())||!geoms[at].intersects(geoms[j]))continue;seen[j]=true;group.push(j);}}var merged=unionAll(group.map(function(n){return geoms[n];})),geo=fromJsts(merged);if(geo)out.push(mkFeat(geo,propCopy(result.features[i])));}result.features=out;return result;};
  OPS.simplify = async function(job,p){requireJsts();var r=await prep(job,p,[job.inputs.input.features]),tol=Number(job.params.distance)*(UNITS_IN_METERS[job.params.unit]||1),J=requireJsts(),out=[];if(!(tol>0))throw new Error('Tolerance harus positif.');r.sets[0].forEach(function(f){var g=toJsts(f,p);if(g){var s=job.params.method==='dp'?new J.simplify.DouglasPeuckerSimplifier(g):new J.simplify.TopologyPreservingSimplifier(g);s.setDistanceTolerance(tol);var geo=fromJsts(s.getResultGeometry());if(geo)out.push(mkFeat(geo,propCopy(f)));}});return{features:unprojectFeatures(out,r.pr),crs:r.pr.label};};
  OPS.repairgeometry = async function(job,p){requireJsts();var out=[];job.inputs.input.features.forEach(function(f){var g;try{g=reader().read(f.geometry);}catch(e){g=null;}if(g){var valid=g.isValid(),fixed=valid?g:g.buffer(0),geo=fromJsts(fixed);if(geo)out.push(mkFeat(geo,Object.assign({},propCopy(f),{REPAIRED:!valid})));}});return{features:out,crs:'EPSG:4326'};};
  OPS.multiparttosinglepart = async function(job,p){requireJsts();var out=[];job.inputs.input.features.forEach(function(f){var g=toJsts(f,p);explodeGeometry(g).forEach(function(part){var geo=fromJsts(part);if(geo)out.push(mkFeat(geo,propCopy(f)));});});return{features:out,crs:'EPSG:4326'};};
  OPS.append = async function(job,p){var out=[],layers=job.inputs.layers||[];layers.forEach(function(layer){(layer.features||[]).forEach(function(f,i){if(!f.geometry)return;var props=propCopy(f);if(job.params.addSource){props.SRC_LAYER=layer.name;props.SRC_FID=fidValue(f,i);}out.push(mkFeat(f.geometry,props));});});return{features:out,crs:'EPSG:4326'};};
  OPS.calculatefield = async function(job,p){var field=String(job.params.fieldName||'').trim();if(!/^[A-Za-z_][\w]*$/.test(field))throw new Error('Nama field tidak valid.');var out=job.inputs.input.features.map(function(f){var props=propCopy(f);props[field]=evalExpression(job.params.expression,props);return mkFeat(f.geometry,props);});return{features:out,crs:'EPSG:4326'};};
  OPS.selectbyattributes = async function(job,p){var out=job.inputs.input.features.filter(function(f){return !!evalExpression(job.params.expression,f.properties||{});});return{features:out,crs:'EPSG:4326'};};
  OPS.pointstoline = async function(job,p){var input=job.inputs.input.features,groups=new Map(),order=job.params.orderBy,by=job.params.groupBy;input.forEach(function(f,i){if(!f.geometry||!/^Multi?Point$/.test(f.geometry.type))return;var k=by?(f.properties||{})[by]:'__all';if(!groups.has(k))groups.set(k,[]);groups.get(k).push({f:f,i:i});});var out=[];groups.forEach(function(a,k){a.sort(function(x,y){return order?String(x.f.properties[order]).localeCompare(String(y.f.properties[order]),undefined,{numeric:true}):x.i-y.i;});var coords=[];a.forEach(function(x){var c=x.f.geometry.type==='Point'?[x.f.geometry.coordinates]:x.f.geometry.coordinates;coords=coords.concat(c);});if(coords.length>1)out.push(mkFeat({type:'LineString',coordinates:coords},by?{[by]:k}:{}));});return{features:out,crs:'EPSG:4326'};};
  OPS.near = async function(job,p){requireJsts();var r=await prep(job,p,[job.inputs.input.features,job.inputs.nearLayer.features]),targets=r.sets[1].map(function(f,i){return{f:f,g:toJsts(f,p),i:i};}).filter(function(x){return x.g;}),out=[];r.sets[0].forEach(function(f,i){var g=toJsts(f,p),best=null,d=Infinity;if(g)targets.forEach(function(t){var x=g.distance(t.g);if(x<d){d=x;best=t;}});var props=propCopy(f);props.NEAR_DIST=best?d/(UNITS_IN_METERS[job.params.unit]||1):null;props.NEAR_FID=best?fidValue(best.f,best.i):null;props.NEAR_LAYER=best?(job.inputs.nearLayer.name||'Near Features'):null;out.push(mkFeat(f.geometry,props));});return{features:out,crs:'EPSG:4326'};};
  OPS.spatialjoin = async function(job,p){requireJsts();var r=await prep(job,p,[job.inputs.target.features,job.inputs.joinLayer.features]),joins=r.sets[1].map(function(f){return{f:f,g:toJsts(f,p)};}).filter(function(x){return x.g;}),out=[];r.sets[0].forEach(function(f){var g=toJsts(f,p),hits=[];if(g)joins.forEach(function(x){var ok=job.params.match==='nearest'?true:job.params.match==='contains'?g.contains(x.g):job.params.match==='within'?g.within(x.g):g.intersects(x.g);if(ok)hits.push(x);});if(job.params.match==='nearest'&&g){hits.sort(function(a,b){return g.distance(a.g)-g.distance(b.g);});var limit=Number(job.params.distance);if(limit>0)hits=hits.filter(function(x){return g.distance(x.g)<=limit;});}if(job.params.match==='nearest')hits=hits.slice(0,1);if(!hits.length&&job.params.keepUnmatched)out.push(mkFeat(f.geometry,propCopy(f)));hits.forEach(function(h){var props=propCopy(f);(job.params.joinFields&&job.params.joinFields.length?job.params.joinFields:Object.keys(h.f.properties||{})).forEach(function(key){props['JOIN_'+key]=h.f.properties[key];});out.push(mkFeat(f.geometry,props));});});return{features:out,crs:'EPSG:4326'};};
  OPS.frequency = async function(job,p){var fields=job.params.fields||[],map=new Map(),src=job.inputs.input.features;src.forEach(function(f){var props=f.properties||{},vals=fields.map(function(k){return props[k];}),k=JSON.stringify(vals);if(!map.has(k)){var row={};fields.forEach(function(field,i){row[field]=vals[i];});row.FREQUENCY=0;map.set(k,row);}map.get(k).FREQUENCY++;});var rows=Array.from(map.values());rows.forEach(function(x){x.PERCENT=src.length?100*x.FREQUENCY/src.length:0;});return tableResult(rows);};
  OPS.summarystats = async function(job,p){var fields=job.params.groupFields||[],nums=job.params.statFields||[],map=new Map();job.inputs.input.features.forEach(function(f){var props=f.properties||{},vals=fields.map(function(k){return props[k];}),key=JSON.stringify(vals);if(!map.has(key)){var row={FREQUENCY:0};fields.forEach(function(k,i){row[k]=vals[i];});nums.forEach(function(n){row[n+'_SUM']=0;row[n+'_MIN']=Infinity;row[n+'_MAX']=-Infinity;row[n+'_COUNT']=0;});map.set(key,row);}var row=map.get(key);row.FREQUENCY++;nums.forEach(function(n){var v=Number(props[n]);if(isFinite(v)){row[n+'_SUM']+=v;row[n+'_MIN']=Math.min(row[n+'_MIN'],v);row[n+'_MAX']=Math.max(row[n+'_MAX'],v);row[n+'_COUNT']++;}});});var rows=Array.from(map.values());rows.forEach(function(row){nums.forEach(function(n){var c=row[n+'_COUNT'];row[n+'_MEAN']=c?row[n+'_SUM']/c:null;row[n+'_MIN']=c?row[n+'_MIN']:null;row[n+'_MAX']=c?row[n+'_MAX']:null;delete row[n+'_COUNT'];});});return tableResult(rows);};
  OPS.tabulateintersection = async function(job,p){requireJsts();var r=await prep(job,p,[job.inputs.zoneLayer.features,job.inputs.classLayer.features]),rows=[],zones=r.sets[0],classes=r.sets[1];zones.forEach(function(z){var zg=toJsts(z,p);if(!zg)return;classes.forEach(function(c){var cg=toJsts(c,p);if(!cg||!zg.intersects(cg))return;var inter=zg.intersection(cg),area=Math.abs(inter.getArea()),props={};props[job.params.zoneField]=z.properties[job.params.zoneField];props[job.params.classField]=c.properties[job.params.classField];props.AREA_M2=area;props.AREA_HA=area/10000;props.PERCENT=zg.getArea()?100*area/zg.getArea():0;rows.push(props);});});return tableResult(rows);};
  OPS.thiessen = async function(job,p){requireJsts();var r=await prep(job,p,[job.inputs.input.features]),pts=[];r.sets[0].forEach(function(f,i){if(f.geometry&&f.geometry.type==='Point')pts.push({f:f,i:i,c:f.geometry.coordinates});});if(pts.length<2)throw new Error('Thiessen memerlukan minimal dua titik.');var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;pts.forEach(function(x){minX=Math.min(minX,x.c[0]);minY=Math.min(minY,x.c[1]);maxX=Math.max(maxX,x.c[0]);maxY=Math.max(maxY,x.c[1]);});var pad=Math.max(maxX-minX,maxY-minY,1)*2,clip={type:'Polygon',coordinates:[[[minX-pad,minY-pad],[maxX+pad,minY-pad],[maxX+pad,maxY+pad],[minX-pad,maxY+pad],[minX-pad,minY-pad]]]};var J=requireJsts(),builder=new J.triangulate.VoronoiDiagramBuilder();builder.setSites(reader().read({type:'MultiPoint',coordinates:pts.map(function(x){return x.c;})}));builder.setClipEnvelope(reader().read(clip).getEnvelopeInternal());var cells=builder.getDiagram(new J.geom.GeometryFactory()),out=[];for(var i=0;i<cells.getNumGeometries();i++){var cell=cells.getGeometryN(i),site=cell.getUserData(),sx=site&&site.x,sy=site&&site.y,idx=-1;if(isFinite(sx)&&isFinite(sy))idx=pts.findIndex(function(x){return Math.abs(x.c[0]-sx)<1e-7&&Math.abs(x.c[1]-sy)<1e-7;});if(idx<0){var center=cell.getInteriorPoint().getCoordinate(),best=Infinity;pts.forEach(function(x,j){var d=Math.pow(x.c[0]-center.x,2)+Math.pow(x.c[1]-center.y,2);if(d<best){best=d;idx=j;}});}var geo=fromJsts(cell);if(geo&&idx>=0)out.push(mkFeat(geo,propCopy(pts[idx].f)));}return{features:unprojectFeatures(await applyExtent(out,job,p,r.pr),r.pr),crs:r.pr.label};};

  /* ==========================================================================
     5. EKSEKUSI (dipakai worker maupun fallback main thread)
     ========================================================================== */

  GPC.runJob = function (job, opts) {
    opts = opts || {};
    var op = OPS[job && job.op];
    if (!op) return Promise.reject(new Error('Tool "' + (job && job.op) + '" tidak dikenal.'));
    var ctx = { onProgress: opts.onProgress, isCancelled: opts.isCancelled, skipped: 0, value: null };
    var lastYield = Date.now();
    var p = {
      report: function (value, label) {
        var v = value < 0 ? 0 : value > 1 ? 1 : value;
        if (ctx.value != null && v < ctx.value + 0.02 && v < 0.999) return;
        ctx.value = v;
        if (ctx.onProgress) { try { ctx.onProgress(v, label || ''); } catch (e) { /* abaikan */ } }
      },
      tick: async function () {
        if (ctx.isCancelled && ctx.isCancelled()) {
          var err = new Error('Dibatalkan pengguna.');
          err.cancelled = true;
          throw err;
        }
        if (Date.now() - lastYield > 25) {
          lastYield = Date.now();
          await tick(0);
        }
      },
      skip: function () { ctx.skipped++; }
    };
    return Promise.resolve()
      .then(function () { return op(job, p); })
      .then(function (result) {
        result = result || {};
        result.skipped = ctx.skipped;
        p.report(1, 'Selesai');
        return result;
      });
  };

  /* ==========================================================================
     6. RIWAYAT & ENVIRONMENT (hanya window)
     ========================================================================== */

  if (hasDOM) {
    var HISTORY_KEY = 'ruangkita-gp-history-v1';
    var ENV_KEY = 'ruangkita-gp-env-v1';
    var HISTORY_MAX = 200;

    function storageGet(key, fallback) {
      try {
        var raw = global.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) { return fallback; }
    }
    function storageSet(key, value) {
      try { global.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* penuh/diizinkan ditolak */ }
    }

    GPC.history = {
      list: function () {
        var arr = storageGet(HISTORY_KEY, []);
        return Array.isArray(arr) ? arr : [];
      },
      add: function (entry) {
        var arr = GPC.history.list();
        arr.unshift(entry);
        if (arr.length > HISTORY_MAX) arr.length = HISTORY_MAX;
        storageSet(HISTORY_KEY, arr);
        return entry;
      },
      update: function (id, patch) {
        var arr = GPC.history.list();
        for (var i = 0; i < arr.length; i++) {
          if (arr[i].id === id) { arr[i] = Object.assign({}, arr[i], patch); storageSet(HISTORY_KEY, arr); return arr[i]; }
        }
        return null;
      },
      remove: function (id) {
        storageSet(HISTORY_KEY, GPC.history.list().filter(function (e) { return e.id !== id; }));
      },
      clear: function () { storageSet(HISTORY_KEY, []); },
      count: function () { return GPC.history.list().length; }
    };

    var ENV_DEFAULT = { crs: 'auto', extent: 'input', extentCustom: null, xyTolerance: 0.001 };
    GPC.env = {
      DEFAULT: ENV_DEFAULT,
      get: function () {
        var v = storageGet(ENV_KEY, null);
        return Object.assign({}, ENV_DEFAULT, v && typeof v === 'object' ? v : {});
      },
      set: function (patch) {
        var next = Object.assign({}, GPC.env.get(), patch || {});
        storageSet(ENV_KEY, next);
        return next;
      },
      resolveBBox: function (env) {
        try {
          if (env.extent === 'map' && global.map && typeof global.map.getBounds === 'function') {
            var b = global.map.getBounds();
            return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
          }
          if (env.extent === 'custom' && Array.isArray(env.extentCustom) && env.extentCustom.length === 4) {
            var box = env.extentCustom.map(Number);
            if (box.every(function (v) { return isFinite(v); })) return box;
          }
        } catch (e) { /* mode input: tanpa potongan */ }
        return null;
      },
      summary: function (env) {
        var crs = { auto: 'Otomatis (UTM/AEQD)', utm: 'UTM', aeqd: 'AEQD', '4326': 'WGS 84' }[env.crs] || 'Otomatis';
        var extent = { input: 'same as input', map: 'ikut tampilan peta', custom: 'custom' }[env.extent] || 'same as input';
        return crs + ' · extent: ' + extent + ' · XY tol ' + (Number(env.xyTolerance) || 0) + ' m';
      }
    };

    /* Susun job dari nilai form. Layer diselesaikan lewat GPC.getLayers yang
       dipasang oleh view (geoprocessing.js). */
    GPC.buildJob = function (toolId, values, extras) {
      extras = extras || {};
      values = values || {};
      var layers = GPC.getLayers ? GPC.getLayers() : [];
      var find = function (id) {
        if (id == null || id === '') return null;
        for (var i = 0; i < layers.length; i++) if (String(layers[i].id) === String(id)) return layers[i];
        return null;
      };
      var env = Object.assign({}, GPC.env.get());
      env.extentBBox = GPC.env.resolveBBox(env);
      var job = { op: toolId, env: env, params: {}, inputs: {} };
      Object.keys(values).forEach(function (key) {
        var v = values[key];
        if (v == null) return;
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || Array.isArray(v)) job.params[key] = v;
      });

      var singleInputTools = ['buffer', 'clip', 'dissolve', 'erase', 'identity', 'split', 'pairwisebuffer', 'near', 'thiessen', 'pointstoline', 'calculatefield', 'selectbyattributes', 'repairgeometry', 'simplify', 'multiparttosinglepart', 'summarystats', 'frequency'];
      if (singleInputTools.indexOf(toolId) >= 0) {
        var input = find(values.input);
        if (!input || !input.geojson || !input.geojson.features.length) {
          throw new Error('Layer input tidak ditemukan atau kosong. Muat layer melalui tab Muat Data terlebih dahulu.');
        }
        job.inputs.input = input.geojson;
      }
      var secondaryInputs = {
        erase: ['eraser'], identity: ['identityLayer'], split: ['splitLayer'],
        near: ['nearLayer'], tabulateintersection: ['zoneLayer', 'classLayer'], spatialjoin: ['target', 'joinLayer']
      }[toolId] || [];
      secondaryInputs.forEach(function (key) {
        var layer = find(values[key]);
        if (!layer || !layer.geojson) throw new Error('Pilih layer untuk ' + key + '.');
        job.inputs[key] = layer.geojson;
      });
      if (toolId === 'clip') {
        if (values.clipSource === 'layer') {
          var boundary = find(values.boundaryLayer);
          if (!boundary || !boundary.geojson) throw new Error('Pilih Clip Features layer.');
          job.inputs.boundary = boundary.geojson;
        } else {
          var feats = extras.adminBoundary || [];
          if (!feats.length) throw new Error('Clip Features belum tersedia. Muat batas wilayah terlebih dahulu.');
          job.inputs.boundary = { type: 'FeatureCollection', features: feats };
        }
      }
      if (toolId === 'intersect' || toolId === 'union' || toolId === 'merge' || toolId === 'append') {
        var selected = Array.isArray(values.layers) ? values.layers : [];
        if (selected.length < 2) throw new Error('Pilih minimal dua layer.');
        job.inputs.layers = selected.map(function (id) {
          var layer = find(id);
          if (!layer) throw new Error('Layer input tidak ditemukan. Muat ulang layer lalu coba lagi.');
          return { name: layer.name, features: layer.geojson.features };
        });
      }
      return job;
    };

    GPC.validateTool = function (tool, values, extras) {
      extras = extras || {};
      values = values || {};
      for (var i = 0; i < tool.params.length; i++) {
        var param = tool.params[i];
        if (param.showIf && !param.showIf(values)) continue;
        var v = values[param.name];
        var empty = v == null || v === '' || (Array.isArray(v) && !v.length);
        if (param.required && empty) {
          if (param.type === 'layers') return param.label + ': pilih minimal ' + (param.min || 1) + ' layer.';
          if (param.type === 'layer') return 'Pilih ' + param.label + ' terlebih dahulu.';
          if (param.type === 'boundary') return 'Clip Features belum tersedia. Muat batas wilayah terlebih dahulu.';
          return 'Isi ' + param.label + ' terlebih dahulu.';
        }
        if (param.type === 'layers' && param.min && Array.isArray(v) && v.length < param.min) {
          return param.label + ': pilih minimal ' + param.min + ' layer.';
        }
        if (param.type === 'numberunit' && !empty && !(Number(values.distance) > 0)) {
          return param.label + ' harus berupa angka positif.';
        }
        if (param.type === 'field' && param.numeric && !empty) {
          /* keabsahan nilai per fitur dicek di mesin */
        }
      }
      if (tool.id === 'clip' && values.clipSource !== 'layer' && !extras.boundaryReady) {
        return 'Clip Features belum tersedia. Muat batas wilayah terlebih dahulu.';
      }
      return null;
    };
  }

  /* ==========================================================================
     7. LOADER JSTS, RUNNER WORKER, EKSEKUTOR (hanya window)
     ========================================================================== */

  if (hasDOM) {
    var JSTS_URL = 'https://unpkg.com/jsts@2.12.0/dist/jsts.min.js';
    var WORKER_URL = 'assets/js/geoprocessing-worker.js';
    var jstsPromise = null;

    /* JSTS hanya diunduh saat benar-benar dibutuhkan (fallback main thread),
       sehingga 488 KB tidak membebani pemuatan awal halaman. */
    GPC.loadJsts = function () {
      if (global.jsts && global.jsts.io && global.jsts.io.GeoJSONReader) return Promise.resolve(global.jsts);
      if (jstsPromise) return jstsPromise;
      jstsPromise = new Promise(function (resolve, reject) {
        var tag = document.createElement('script');
        tag.src = JSTS_URL;
        tag.async = true;
        tag.onload = function () {
          if (global.jsts && global.jsts.io && global.jsts.io.GeoJSONReader) resolve(global.jsts);
          else { jstsPromise = null; reject(new Error('Pustaka JSTS gagal dimuat.')); }
        };
        tag.onerror = function () {
          jstsPromise = null;
          if (tag.parentNode) tag.parentNode.removeChild(tag);
          reject(new Error('Pustaka JSTS tidak dapat diunduh. Periksa koneksi internet lalu coba lagi.'));
        };
        document.head.appendChild(tag);
      });
      return jstsPromise;
    };

    GPC.runner = {
      _worker: null,
      _broken: false,
      _seq: 0,
      supports: function () { return !this._broken && typeof global.Worker === 'function'; },
      _create: function () {
        if (this._broken) return null;
        try {
          return new global.Worker(WORKER_URL);
        } catch (e) {
          this._broken = true;
          return null;
        }
      },
      send: function (job, cb) {
        var self = this;
        var worker = this._worker || this._create();
        if (!worker) return null;
        this._worker = worker;
        var seq = ++this._seq;
        var done = false;
        function cleanup() {
          worker.removeEventListener('message', onMessage);
          worker.removeEventListener('error', onError);
        }
        function onMessage(event) {
          var msg = event.data;
          if (!msg || msg.seq !== seq || done) return;
          if (msg.type === 'progress') { if (cb.onProgress) cb.onProgress(msg.value, msg.label); return; }
          if (msg.type === 'result') { done = true; cleanup(); if (cb.onResult) cb.onResult(msg.payload); return; }
          if (msg.type === 'error') {
            done = true; cleanup();
            var err = new Error(msg.message || 'Geoprocessing gagal.');
            if (msg.cancelled) err.cancelled = true;
            if (cb.onError) cb.onError(err);
            return;
          }
        }
        function onError() {
          if (done) return;
          done = true;
          cleanup();
          try { worker.terminate(); } catch (e) { /* abaikan */ }
          if (self._worker === worker) self._worker = null;
          /* Skrip worker gagal dimuat / error tak tertangkap -> fallback */
          if (cb.onBroken) cb.onBroken();
        }
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        try {
          worker.postMessage({ type: 'run', seq: seq, job: job });
        } catch (e) {
          cleanup();
          if (cb.onBroken) cb.onBroken();
          return null;
        }
        return {
          cancel: function () {
            if (done) return;
            done = true;
            cleanup();
            try { worker.terminate(); } catch (e) { /* abaikan */ }
            if (self._worker === worker) self._worker = null;
            var err = new Error('Dibatalkan pengguna.');
            err.cancelled = true;
            if (cb.onError) cb.onError(err);
          }
        };
      }
    };

    /* Jalankan satu job: utamakan Web Worker, bila gagal pindah ke main
       thread secara chunked (JSTS dimuat dulu di sini). */
    GPC.execute = function (job, opts) {
      opts = opts || {};
      var state = { cancelled: false, handle: null };
      var promise = new Promise(function (resolve, reject) {
        function runLocal() {
          if (state.cancelled) {
            var cancelled = new Error('Dibatalkan pengguna.');
            cancelled.cancelled = true;
            reject(cancelled);
            return;
          }
          GPC.loadJsts()
            .then(function () {
              if (state.cancelled) throw Object.assign(new Error('Dibatalkan pengguna.'), { cancelled: true });
              return GPC.runJob(job, {
                onProgress: opts.onProgress,
                isCancelled: function () { return state.cancelled; }
              });
            })
            .then(resolve, reject);
        }
        if (!GPC.runner.supports()) { runLocal(); return; }
        state.handle = GPC.runner.send(job, {
          onProgress: opts.onProgress,
          onResult: resolve,
          onError: reject,
          onBroken: runLocal
        });
        if (!state.handle) runLocal();
      });
      return {
        promise: promise,
        cancel: function () {
          state.cancelled = true;
          if (state.handle) state.handle.cancel();
        }
      };
    };
  }

})(typeof window !== 'undefined' ? window : self);
