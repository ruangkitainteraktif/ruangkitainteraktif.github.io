/* UMD GLAD Land & Carbon Lab — tutupan lahan global dari bucket publik lcl_tiles
   (storage.googleapis.com/lcl_tiles). Tile XYZ hasil render GLCLU2020 (Landsat
   30 m, zoom maks. 12) dan NatLand (alam vs non-alam), cakupan lat -60..80,
   transparan di atas laut. Lisensi CC BY (Potapov et al. 2022, Front. Remote
   Sens.); atribusi tercantum di legenda dan tile attribution. */
(function () {
  'use strict';

  var B_GLCLU = 'https://storage.googleapis.com/lcl_tiles/GLCLU2020/';
  var B_NATLAND = 'https://storage.googleapis.com/lcl_tiles/NatLand_renderedTiles/';
  var ATTR = 'UMD GLAD Land &amp; Carbon Lab · GLCLU2020/NatLand (CC BY)';
  var SOURCE_LINE = 'Sumber: UMD GLAD Land & Carbon Lab · lcl_tiles (CC BY)';

  var LEGENDS = {
    composite: {
      rows: [
        ['#0d570d', 'Hutan & tutupan pohon'],
        ['#5a9e2f', 'Semak, rumput & vegetasi lain'],
        ['#fff183', 'Lahan pertanian'],
        ['#e8765d', 'Permukiman & bangunan'],
        ['#6baed6', 'Air']
      ]
    },
    forest: {
      rows: [['#689106', 'Tutupan pohon / hutan']],
      note: 'Area tanpa tutupan pohon tampil transparan.'
    },
    cropland: {
      rows: [['#fff183', 'Lahan pertanian'], ['#36baae', 'Area berair / lahan basah']]
    },
    croplandYear: { rows: [['#fff183', 'Lahan pertanian']] },
    croplandInvert: {
      rows: [['#fff183', 'Lahan pertanian'], ['#fd8b2d', 'Area lain (inversi)']]
    },
    cropChange: { rows: [['#36baae', 'Area perubahan lahan pertanian']] },
    builtup: { rows: [['#e8765d', 'Permukiman & bangunan']] },
    water: {
      rows: [['#6baed6', 'Air']],
      note: 'Area tanpa air tampil transparan.'
    },
    snow: {
      rows: [['#abd0e7', 'Salju & es']],
      note: 'Hanya tampil di daerah bersalju (pegunungan tinggi & kutub).'
    },
    changeMask: {
      rows: [['#474146', 'Area tutupan lahan berubah']],
      note: 'Mask perubahan tutupan lahan 2000-2020.'
    },
    changeHill: {
      rows: [['#484247', 'Hillshade area perubahan']],
      note: 'Relief area perubahan tutupan lahan.'
    },
    natlandClasses: {
      rows: [
        ['#256e24', 'Hutan & vegetasi alami'],
        ['#6baed6', 'Air'],
        ['#d3d3d3', 'Non-alam (pertanian, permukiman, dll.)']
      ]
    },
    natlandBinary: {
      rows: [['#a7dcb4', 'Kawasan alam (natural)'], ['#969796', 'Kawasan non-alam']]
    }
  };

  var CONFIG = {
    'glcluc-composite2020': { base: B_GLCLU, dir: 'composite2020', title: 'Komposit tutupan lahan 2020 · GLCLU2020', maxNativeZoom: 12, opacity: 0.9, legend: 'composite' },
    'glcluc-composite2000': { base: B_GLCLU, dir: 'composite2000', title: 'Komposit tutupan lahan 2000 · GLCLU2020', maxNativeZoom: 12, opacity: 0.9, legend: 'composite' },
    'glcluc-forest': { base: B_GLCLU, dir: 'forest', title: 'Tutupan pohon (hutan)', maxNativeZoom: 12, opacity: 0.8, legend: 'forest' },
    'glcluc-cropland': { base: B_GLCLU, dir: 'cropland', title: 'Lahan pertanian', maxNativeZoom: 12, opacity: 0.8, legend: 'cropland' },
    'glcluc-cropland-invert': { base: B_GLCLU, dir: 'cropland_invert', title: 'Lahan pertanian (inversi)', maxNativeZoom: 12, opacity: 0.8, legend: 'croplandInvert' },
    'glcluc-crop03': { base: B_GLCLU, dir: 'crop03', title: 'Lahan pertanian 2003', maxNativeZoom: 12, opacity: 0.8, legend: 'croplandYear' },
    'glcluc-crop07': { base: B_GLCLU, dir: 'crop07', title: 'Lahan pertanian 2007', maxNativeZoom: 12, opacity: 0.8, legend: 'croplandYear' },
    'glcluc-crop11': { base: B_GLCLU, dir: 'crop11', title: 'Lahan pertanian 2011', maxNativeZoom: 12, opacity: 0.8, legend: 'croplandYear' },
    'glcluc-crop15': { base: B_GLCLU, dir: 'crop15', title: 'Lahan pertanian 2015', maxNativeZoom: 12, opacity: 0.8, legend: 'croplandYear' },
    'glcluc-crop19': { base: B_GLCLU, dir: 'crop19', title: 'Lahan pertanian 2019', maxNativeZoom: 12, opacity: 0.8, legend: 'croplandYear' },
    'glcluc-cropchange-only': { base: B_GLCLU, dir: 'cropChangeOnly', title: 'Perubahan lahan pertanian', maxNativeZoom: 12, opacity: 0.8, legend: 'cropChange' },
    'glcluc-builtup': { base: B_GLCLU, dir: 'builtup', title: 'Permukiman & bangunan', maxNativeZoom: 12, opacity: 0.8, legend: 'builtup' },
    'glcluc-builtup-2': { base: B_GLCLU, dir: 'builtup_2', title: 'Permukiman & bangunan v2', maxNativeZoom: 12, opacity: 0.8, legend: 'builtup' },
    'glcluc-water': { base: B_GLCLU, dir: 'water', title: 'Air', maxNativeZoom: 12, opacity: 0.8, legend: 'water' },
    'glcluc-snow': { base: B_GLCLU, dir: 'snow', title: 'Salju & es', maxNativeZoom: 12, opacity: 0.85, legend: 'snow' },
    'glcluc-change-mask': { base: B_GLCLU, dir: 'change_mask', title: 'Mask perubahan tutupan lahan 2000-2020', maxNativeZoom: 12, opacity: 0.85, legend: 'changeMask' },
    'glcluc-change-hill': { base: B_GLCLU, dir: 'change_hill', title: 'Hillshade perubahan tutupan lahan', maxNativeZoom: 12, opacity: 0.85, legend: 'changeHill' },
    'natland-classes': { base: B_NATLAND, dir: 'allClasses', title: 'NatLand — tutupan lahan (kelas)', maxNativeZoom: 9, opacity: 0.85, legend: 'natlandClasses' },
    'natland-binary': { base: B_NATLAND, dir: 'binary', title: 'NatLand — alam vs non-alam', maxNativeZoom: 5, opacity: 0.85, legend: 'natlandBinary' }
  };

  var layers = {};

  function showLegend(id, def) {
    if (!window.addUnifiedLegend) return;
    var cfg = LEGENDS[def.legend] || { rows: [] };
    var box = document.createElement('div');
    box.className = 'hwsd-id-legend';
    var title = document.createElement('strong');
    title.textContent = def.title;
    box.appendChild(title);
    var list = document.createElement('div');
    list.className = 'hwsd-id-legend-list';
    cfg.rows.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'hwsd-id-legend-row';
      row.innerHTML = '<i style="background:' + item[0] + '"></i><span>' + item[1] + '</span>';
      list.appendChild(row);
    });
    box.appendChild(list);
    if (cfg.note) {
      var note = document.createElement('small');
      note.textContent = cfg.note;
      box.appendChild(note);
    }
    var source = document.createElement('small');
    source.textContent = SOURCE_LINE + ' · zoom maks. ' + def.maxNativeZoom;
    box.appendChild(source);
    window.addUnifiedLegend('lcl-' + id, window.createLegendWithToggle ? window.createLegendWithToggle(box) : box);
  }

  window.toggleLclTileLayer = function (id, visible) {
    var def = CONFIG[id];
    if (!def) return;
    var map = window.map || window._map;
    if (!map || !window.L) return;
    if (visible) {
      if (!layers[id]) {
        layers[id] = L.tileLayer(def.base + def.dir + '/{z}/{x}/{y}.png', {
          minZoom: 0,
          maxZoom: 19,
          maxNativeZoom: def.maxNativeZoom,
          bounds: [[-60, -180], [80, 180]],
          opacity: def.opacity,
          attribution: ATTR
        });
      }
      layers[id].addTo(map);
      showLegend(id, def);
    } else {
      if (layers[id] && map.hasLayer(layers[id])) map.removeLayer(layers[id]);
      if (window.removeUnifiedLegend) window.removeUnifiedLegend('lcl-' + id);
    }
  };
})();
