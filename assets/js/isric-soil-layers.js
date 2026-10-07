/* SoilGrids WMS overlays from ISRIC. */
(function () {
  'use strict';

  var BASE_URL = 'https://maps.isric.org/mapserv/';
  var DEFINITIONS = {
    wrb: { service: 'wrb', layer: 'MostProbable', label: 'WRB · Kelas tanah paling mungkin' },
    bdod: { service: 'bdod', layer: 'bdod_0-5cm_mean', label: 'Bulk density · 0–5 cm' },
    cec: { service: 'cec', layer: 'cec_0-5cm_mean', label: 'Kapasitas tukar kation (CEC) · 0–5 cm' },
    cfvo: { service: 'cfvo', layer: 'cfvo_0-5cm_mean', label: 'Fragmen kasar volumetrik · 0–5 cm' },
    clay: { service: 'clay', layer: 'clay_0-5cm_mean', label: 'Kandungan liat · 0–5 cm' },
    nitrogen: { service: 'nitrogen', layer: 'nitrogen_0-5cm_mean', label: 'Nitrogen · 0–5 cm' },
    phh2o: { service: 'phh2o', layer: 'phh2o_0-5cm_mean', label: 'pH tanah dalam H₂O · 0–5 cm' },
    sand: { service: 'sand', layer: 'sand_0-5cm_mean', label: 'Kandungan pasir · 0–5 cm' },
    silt: { service: 'silt', layer: 'silt_0-5cm_mean', label: 'Kandungan debu · 0–5 cm' },
    soc: { service: 'soc', layer: 'soc_0-5cm_mean', label: 'Karbon organik tanah · 0–5 cm' },
    ocs: { service: 'ocs', layer: 'ocs_0-30cm_mean', label: 'Stok karbon organik · 0–30 cm' },
    ocd: { service: 'ocd', layer: 'ocd_0-5cm_mean', label: 'Kerapatan karbon organik · 0–5 cm' },
    wv1500: { service: 'wv1500', layer: 'wv1500_0-5cm_mean', label: 'Kadar air volumetrik · 1500 kPa · 0–5 cm' },
    wv0033: { service: 'wv0033', layer: 'wv0033_0-5cm_mean', label: 'Kadar air volumetrik · 33 kPa · 0–5 cm' },
    wv0010: { service: 'wv0010', layer: 'wv0010_0-5cm_mean', label: 'Kadar air volumetrik · 10 kPa · 0–5 cm' }
  };
  var active = {};
  var selectedKey = null;

  function updateLegend(key) {
    var def = DEFINITIONS[key];
    if (!def) {
      if (window.removeUnifiedLegend) window.removeUnifiedLegend('isric-soil');
      return;
    }

    var div = document.createElement('div');
    div.className = 'isric-soil-legend';
    var title = document.createElement('div');
    title.className = 'isric-soil-legend-title';
    title.textContent = def.label;
    div.appendChild(title);
    var legendUrl = new URL(BASE_URL + def.service);
    legendUrl.search = new URLSearchParams({
      SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetLegendGraphic',
      LAYER: def.layer, FORMAT: 'image/png'
    }).toString();
    var image = document.createElement('img');
    image.className = 'isric-soil-legend-image';
    image.alt = 'Legenda ' + def.label;
    image.onerror = function () { image.style.display = 'none'; };
    image.src = legendUrl.toString();
    if (def.service === 'wrb') {
      image.style.cssText = 'display:block;width:auto;max-width:100%;max-height:280px;margin:0;background:#fff;border-radius:4px';
    } else {
      image.style.cssText = 'display:block;width:auto;height:230px;max-width:100%;object-fit:contain;margin:2px 0 0;background:#fff;border-radius:4px';
    }
    div.appendChild(image);
    var source = document.createElement('small');
    source.className = 'isric-soil-legend-source';
    source.textContent = 'Sumber: SoilGrids · ISRIC';
    div.appendChild(source);
    if (window.addUnifiedLegend) {
      window.addUnifiedLegend('isric-soil', window.createLegendWithToggle ? window.createLegendWithToggle(div) : div);
    }
  }

  window.toggleIsricSoilLayer = function (id, visible) {
    var key = String(id || '').replace(/^isric-soil-/, '');
    var definition = DEFINITIONS[key];
    var map = window.map;
    var L = window.L;
    if (!definition || !map || !L) return;

    if (visible) {
      Object.keys(active).forEach(function (otherKey) {
        if (otherKey !== key && map.hasLayer(active[otherKey])) {
          map.removeLayer(active[otherKey]);
          if (window.setLayerCatalogCheckboxState) {
            window.setLayerCatalogCheckboxState('isric-soil-' + otherKey, false);
          }
        }
      });
      if (!active[key]) {
        active[key] = L.tileLayer.wms(BASE_URL + definition.service, {
          layers: definition.layer,
          format: 'image/png',
          transparent: true,
          version: '1.3.0',
          crs: L.CRS.EPSG4326,
          opacity: 0.75,
          attribution: 'SoilGrids © ISRIC'
        });
      }
      if (!map.hasLayer(active[key])) active[key].addTo(map);
      selectedKey = key;
      updateLegend(key);
    } else if (active[key] && map.hasLayer(active[key])) {
      map.removeLayer(active[key]);
      if (selectedKey === key) {
        selectedKey = null;
        updateLegend(null);
      }
    }
  };
})();
