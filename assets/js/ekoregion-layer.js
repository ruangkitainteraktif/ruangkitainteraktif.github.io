/* ── Bentang Lahan Indonesia — ArcGIS Feature Service ── */
(function () {
  'use strict';

  var EKOREGION_URL = 'https://services-ap1.arcgis.com/zddIc5NlxDyZbzsT/arcgis/rest/services/Unit_Ekoregion/FeatureServer/0';
  var ekoregionLayer = null;

  // Symbology dari sumber ArcGIS: color [76,129,205,191] = #4C81CD alpha 191/255 ≈ 0.749
  // outline [0,0,0,255] = hitam, width 0.75
  var EKO_FILL_COLOR = '#4C81CD';
  var EKO_FILL_OPACITY = 191 / 255; // ≈ 0.749
  var EKO_OUTLINE_COLOR = '#000000';
  var EKO_OUTLINE_WEIGHT = 0.75;

  function toggleEkoregion(visible) {
    if (!visible) {
      if (ekoregionLayer && map.hasLayer(ekoregionLayer)) {
        map.removeLayer(ekoregionLayer);
        ekoregionLayer = null;
      }
      if (typeof removeUnifiedLegend === 'function') removeUnifiedLegend('ekoregion');
      return;
    }

    if (!L || !L.esri || !L.esri.featureLayer) return;

    try {
      ekoregionLayer = L.esri.featureLayer({
        url: EKOREGION_URL,
        where: '1=1',
        outFields: ['PULAU', 'PROVINSI', 'KAB_KOTA', 'NAMA_WE', 'MORFOLOGI', 'IKLIM', 'KODE_UNIT', 'LUAS_HA'],
        style: function () {
          return {
            color: EKO_OUTLINE_COLOR,
            weight: EKO_OUTLINE_WEIGHT,
            opacity: 1,
            fillColor: EKO_FILL_COLOR,
            fillOpacity: EKO_FILL_OPACITY
          };
        },
        onEachFeature: function (feature, layer) {
          if (feature.properties) {
            var nama = feature.properties.NAMA_WE || '-';
            var provinsi = feature.properties.PROVINSI || '-';
            var kabkota = feature.properties.KAB_KOTA || '-';
            var pulau = feature.properties.PULAU || '-';
            var morfologi = feature.properties.MORFOLOGI || '-';
            var iklim = feature.properties.IKLIM || '-';
            var luas = feature.properties.LUAS_HA;
            var luasStr = luas ? Number(luas).toLocaleString('id-ID') + ' ha' : '-';

            layer.bindPopup(
              '<div class="ekoregion-popup">' +
              '<strong>Bentang Lahan Indonesia</strong><br>' +
              'Nama: ' + nama + '<br>' +
              'Provinsi: ' + provinsi + '<br>' +
              'Kab/Kota: ' + kabkota + '<br>' +
              'Pulau: ' + pulau + '<br>' +
              'Morfologi: ' + morfologi + '<br>' +
              'Iklim: ' + iklim + '<br>' +
              'Luas: ' + luasStr +
              '</div>',
              { maxWidth: 300 }
            );
          }
        }
      }).addTo(map);

      if (typeof addUnifiedLegend === 'function' && typeof createLegendWithToggle === 'function') {
        var div = L.DomUtil.create('div', 'ekoregion-legend');
        L.DomEvent.disableClickPropagation(div);
        div.innerHTML =
          '<div class="himawari-legend-title">Bentang Lahan Indonesia</div>' +
          '<div class="himawari-legend-item" style="display:flex;align-items:center;margin:4px 0;">' +
          '<div style="width:16px;height:16px;background:' + EKO_FILL_COLOR + ';border:1px solid ' + EKO_OUTLINE_COLOR + ';margin-right:8px;opacity:' + EKO_FILL_OPACITY + ';"></div>' +
          '<span>Bentang Lahan</span>' +
          '</div>' +
          '<div class="himawari-legend-unit">Sumber: ArcGIS Feature Service — Bentang Lahan</div>';
        addUnifiedLegend('ekoregion', createLegendWithToggle(div));
      }
    } catch (err) {
      console.warn('Gagal memuat Bentang Lahan Indonesia:', err);
    }
  }

  window.toggleEkoregion = toggleEkoregion;
})();
