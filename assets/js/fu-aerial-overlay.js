/* ── BIG Foto Udara / Imagery (ImageServer + Banten MapServer) Overlay ── */
(function () {
  'use strict';

  var BASE = 'https://geoservices.big.go.id/raster/rest/services/';

  var MAIN_LAYERS = {
    toggleFuPadang: {
      url: BASE + 'FU/FU_Padang_0715_3216C/ImageServer',
      type: 'image',
      bounds: [[-0.937509, 100.333325], [-0.916658, 100.354175]],
      label: 'Foto Udara Padang 0715 (BIG)'
    },
    toggleFuKendari: {
      url: BASE + 'FUTILE/FU_SULAWESI_KENDARI_2024_TILE/ImageServer',
      type: 'image',
      bounds: [[-4.104620, 122.437050], [-3.895381, 122.646283]],
      label: 'Foto Udara Kendari 2024 (BIG)'
    },
    toggleFuBitung: {
      url: BASE + 'FUTILE/FU_SULAWESI_KOTA_BITUNG_2024_TILE/ImageServer',
      type: 'image',
      bounds: [[1.374548, 125.082884], [1.479619, 125.229617]],
      label: 'Foto Udara Bitung 2024 (BIG)'
    },
    toggleFuMakassar: {
      url: BASE + 'FUTILE/FU_SULAWESI_MAKASSAR_2024_TILE/ImageServer',
      type: 'image',
      bounds: [[-5.292119, 119.353716], [-4.978715, 119.604617]],
      label: 'Foto Udara Makassar 2024 (BIG)'
    },
    toggleFuPlanetScope: {
      url: BASE + 'BASEMAP_PLANET/PLANETSCOPE_DESEMBER/ImageServer',
      type: 'image',
      bounds: [[-3.688868, 94.921875], [5.965754, 101.953125]],
      label: 'Basemap PlanetScope Des 2025 (BIG)'
    },
    toggleFuBanten: {
      url: BASE + 'IMAGERY/BANTEN/MapServer',
      type: 'dynamic',
      bounds: [[-6.271885, 106.385974], [-5.96121, 106.82776]],
      label: 'Peta Banten (BIG)'
    }
  };
  var IMAGERY_DEFS = [
    { id: 'toggleFuCTSRT2014SULAWESIMALUKU', name: 'CTSRT_2014_SULAWESI_MALUKU', group: 'ctsrt', label: 'Citra CTSRT 2014 SULAWESI MALUKU (BIG)', bounds: [[-3.250244, 118.74979], [2.750053, 129.250013]] },
    { id: 'toggleFuCTSRT2015ACEH1', name: 'CTSRT_2015_ACEH1', group: 'ctsrt', label: 'Citra CTSRT 2015 ACEH1 (BIG)', bounds: [[3.729054, 94.95822], [5.91678, 96.937613]] },
    { id: 'toggleFuCTSRT2015ACEH2', name: 'CTSRT_2015_ACEH2', group: 'ctsrt', label: 'Citra CTSRT 2015 ACEH2 (BIG)', bounds: [[1.958223, 95.687387], [5.270948, 98.458445]] },
    { id: 'toggleFuCTSRT2015ALOR', name: 'CTSRT_2015_ALOR', group: 'ctsrt', label: 'Citra CTSRT 2015 ALOR (BIG)', bounds: [[-8.479276, 124.27072], [-8.104051, 125.145944]] },
    { id: 'toggleFuCTSRT2015AMBON', name: 'CTSRT_2015_AMBON', group: 'ctsrt', label: 'Citra CTSRT 2015 AMBON (BIG)', bounds: [[-3.813887, 127.915275], [-3.477776, 128.376386]] },
    { id: 'toggleFuCTSRT2015BALI', name: 'CTSRT_2015_BALI', group: 'ctsrt', label: 'Citra CTSRT 2015 BALI (BIG)', bounds: [[-8.854278, 114.416552], [-8.041551, 115.729276]] },
    { id: 'toggleFuCTSRT2015BANGKA', name: 'CTSRT_2015_BANGKA', group: 'ctsrt', label: 'Citra CTSRT 2015 BANGKA (BIG)', bounds: [[-3.333445, 105.104053], [-1.499887, 107.29178]] },
    { id: 'toggleFuCTSRT2015BANTAENG', name: 'CTSRT_2015_BANTAENG', group: 'ctsrt', label: 'Citra CTSRT 2015 BANTAENG (BIG)', bounds: [[-5.687606, 119.812387], [-4.70822, 120.18761]] },
    { id: 'toggleFuCTSRT2015BELITUNG', name: 'CTSRT_2015_BELITUNG', group: 'ctsrt', label: 'Citra CTSRT 2015 BELITUNG (BIG)', bounds: [[-3.354279, 107.104055], [-2.52072, 108.479278]] },
    { id: 'toggleFuCTSRT2015BOLAANGMONGONDOWTIMUR', name: 'CTSRT_2015_BOLAANG_MONGONDOW_TIMUR', group: 'ctsrt', label: 'Citra CTSRT 2015 BOLAANG MONGONDOW TIMUR (BIG)', bounds: [[0.395724, 124.104054], [1.437614, 124.812612]] },
    { id: 'toggleFuCTSRT2015BULI', name: 'CTSRT_2015_BULI', group: 'ctsrt', label: 'Citra CTSRT 2015 BULI (BIG)', bounds: [[0.541557, 128.104053], [1.437615, 128.291779]] },
    { id: 'toggleFuCTSRT2015DKIBANTEN', name: 'CTSRT_2015_DKI_BANTEN', group: 'ctsrt', label: 'Citra CTSRT 2015 DKI BANTEN (BIG)', bounds: [[-7.458445, 105.645718], [-5.729053, 107.020942]] },
    { id: 'toggleFuCTSRT2015GORONTALO', name: 'CTSRT_2015_GORONTALO', group: 'ctsrt', label: 'Citra CTSRT 2015 GORONTALO (BIG)', bounds: [[0.373616, 122.061109], [1.063891, 123.209722]] },
    { id: 'toggleFuCTSRT2015JAMBI', name: 'CTSRT_2015_JAMBI', group: 'ctsrt', label: 'Citra CTSRT 2015 JAMBI (BIG)', bounds: [[-3.97939, 101.124775], [-1.083109, 104.583553]] },
    { id: 'toggleFuCTSRT2015JAWABARAT', name: 'CTSRT_2015_JAWA_BARAT', group: 'ctsrt', label: 'Citra CTSRT 2015 JAWA BARAT (BIG)', bounds: [[-7.583442, 106.812387], [-5.89572, 107.666775]] },
    { id: 'toggleFuCTSRT2015JAWATENGAH', name: 'CTSRT_2015_JAWA_TENGAH', group: 'ctsrt', label: 'Citra CTSRT 2015 JAWA TENGAH (BIG)', bounds: [[-8.167222, 109.916109], [-6.832775, 110.604722]] },
    { id: 'toggleFuCTSRT2015JAWATENGAH2', name: 'CTSRT_2015_JAWA_TENGAH2', group: 'ctsrt', label: 'Citra CTSRT 2015 JAWA TENGAH2 (BIG)', bounds: [[-8.291776, 110.33322], [-6.39572, 111.708443]] },
    { id: 'toggleFuCTSRT2015JAWATENGAH3', name: 'CTSRT_2015_JAWA_TENGAH3', group: 'ctsrt', label: 'Citra CTSRT 2015 JAWA TENGAH3 (BIG)', bounds: [[-7.875111, 108.291551], [-6.729051, 110.125111]] },
    { id: 'toggleFuCTSRT2015JAWATIMUR', name: 'CTSRT_2015_JAWA_TIMUR', group: 'ctsrt', label: 'Citra CTSRT 2015 JAWA TIMUR (BIG)', bounds: [[-8.666778, 111.770717], [-6.479052, 115.937611]] },
    { id: 'toggleFuCTSRT2015KALIMANTAN', name: 'CTSRT_2015_KALIMANTAN', group: 'ctsrt', label: 'Citra CTSRT 2015 KALIMANTAN (BIG)', bounds: [[-4.25015, 107.999971], [2.625101, 118.875062]] },
    { id: 'toggleFuCTSRT2015KALIMANTANSELATAN', name: 'CTSRT_2015_KALIMANTAN_SELATAN', group: 'ctsrt', label: 'Citra CTSRT 2015 KALIMANTAN SELATAN (BIG)', bounds: [[-4.020947, 114.187386], [-1.791552, 116.229277]] },
    { id: 'toggleFuCTSRT2015KALIMANTANTIMUR', name: 'CTSRT_2015_KALIMANTAN_TIMUR', group: 'ctsrt', label: 'Citra CTSRT 2015 KALIMANTAN TIMUR (BIG)', bounds: [[-2.729279, 115.041553], [2.583447, 119.000113]] },
    { id: 'toggleFuCTSRT2015KALIMANTANUTARA', name: 'CTSRT_2015_KALIMANTAN_UTARA', group: 'ctsrt', label: 'Citra CTSRT 2015 KALIMANTAN UTARA (BIG)', bounds: [[1.874889, 114.729053], [2.770947, 117.729279]] },
    { id: 'toggleFuCTSRT2015KEDIRI', name: 'CTSRT_2015_KEDIRI', group: 'ctsrt', label: 'Citra CTSRT 2015 KEDIRI (BIG)', bounds: [[-8.020943, 111.770716], [-7.58322, 112.458446]] },
    { id: 'toggleFuCTSRT2015KONAWE', name: 'CTSRT_2015_KONAWE', group: 'ctsrt', label: 'Citra CTSRT 2015 KONAWE (BIG)', bounds: [[-4.063887, 122.269442], [-3.665272, 122.501387]] },
    { id: 'toggleFuCTSRT2015KUPANGTIMOR', name: 'CTSRT_2015_KUPANG_TIMOR', group: 'ctsrt', label: 'Citra CTSRT 2015 KUPANG TIMOR (BIG)', bounds: [[-10.208887, 123.624442], [-8.936942, 125.208887]] },
    { id: 'toggleFuCTSRT2015MALUKU', name: 'CTSRT_2015_MALUKU', group: 'ctsrt', label: 'Citra CTSRT 2015 MALUKU (BIG)', bounds: [[-1.250069, 127.124936], [2.750053, 129.250008]] },
    { id: 'toggleFuCTSRT2015ROTENDAO', name: 'CTSRT_2015_ROTENDAO', group: 'ctsrt', label: 'Citra CTSRT 2015 ROTENDAO (BIG)', bounds: [[-11.02222, 122.623608], [-10.415273, 123.459722]] },
    { id: 'toggleFuCTSRT2015SAMBAS', name: 'CTSRT_2015_SAMBAS', group: 'ctsrt', label: 'Citra CTSRT 2015 SAMBAS (BIG)', bounds: [[0.853612, 108.895272], [2.083893, 109.854721]] },
    { id: 'toggleFuCTSRT2015SULAWESI', name: 'CTSRT_2015_SULAWESI', group: 'ctsrt', label: 'Citra CTSRT 2015 SULAWESI (BIG)', bounds: [[-3.250236, 118.74979], [2.000165, 125.375139]] },
    { id: 'toggleFuCTSRT2015SULAWESIBARAT', name: 'CTSRT_2015_SULAWESI_BARAT', group: 'ctsrt', label: 'Citra CTSRT 2015 SULAWESI BARAT (BIG)', bounds: [[-3.250236, 118.74979], [2.000165, 125.375139]] },
    { id: 'toggleFuCTSRT2015SULAWESISELATAN', name: 'CTSRT_2015_SULAWESI_SELATAN', group: 'ctsrt', label: 'Citra CTSRT 2015 SULAWESI SELATAN (BIG)', bounds: [[-4.81261, 119.33322], [-1.95822, 121.458444]] },
    { id: 'toggleFuCTSRT2015SULAWESISELATAN2', name: 'CTSRT_2015_SULAWESI_SELATAN2', group: 'ctsrt', label: 'Citra CTSRT 2015 SULAWESI SELATAN2 (BIG)', bounds: [[-5.708444, 119.20822], [-3.64572, 120.500109]] },
    { id: 'toggleFuCTSRT2015SULAWESITENGAH', name: 'CTSRT_2015_SULAWESI_TENGAH', group: 'ctsrt', label: 'Citra CTSRT 2015 SULAWESI TENGAH (BIG)', bounds: [[-3.000112, 119.437387], [1.375114, 124.041776]] },
    { id: 'toggleFuCTSRT2015SULAWESITENGGARA', name: 'CTSRT_2015_SULAWESI_TENGGARA', group: 'ctsrt', label: 'Citra CTSRT 2015 SULAWESI TENGGARA (BIG)', bounds: [[-5.708446, 120.854053], [-2.89572, 123.270943]] },
    { id: 'toggleFuCTSRT2015SUMATERASELATAN1', name: 'CTSRT_2015_SUMATERA_SELATAN1', group: 'ctsrt', label: 'Citra CTSRT 2015 SUMATERA SELATAN1 (BIG)', bounds: [[-5.000112, 102.479053], [-2.416553, 104.479276]] },
    { id: 'toggleFuCTSRT2015SUMATERASELATAN2', name: 'CTSRT_2015_SUMATERA_SELATAN2', group: 'ctsrt', label: 'Citra CTSRT 2015 SUMATERA SELATAN2 (BIG)', bounds: [[-4.833443, 104.312387], [-1.562275, 106.041779]] },
    { id: 'toggleFuCTSRT2015SUMATERABARAT', name: 'CTSRT_2015_SUMATERABARAT', group: 'ctsrt', label: 'Citra CTSRT 2015 SUMATERABARAT (BIG)', bounds: [[-3.50011, 98.624887], [0.645948, 101.604279]] },
    { id: 'toggleFuCTSRT2015SUMBAR', name: 'CTSRT_2015_SUMBAR', group: 'ctsrt', label: 'Citra CTSRT 2015 SUMBAR (BIG)', bounds: [[-3.50011, 98.624887], [0.645948, 101.604279]] },
    { id: 'toggleFuCTSRT2015TOBA', name: 'CTSRT_2015_TOBA', group: 'ctsrt', label: 'Citra CTSRT 2015 TOBA (BIG)', bounds: [[1.832779, 98.186941], [3.18806, 99.271387]] },
    { id: 'toggleFuCTSRT2015TOJOUNAUNA', name: 'CTSRT_2015_TOJOUNAUNA', group: 'ctsrt', label: 'Citra CTSRT 2015 TOJOUNAUNA (BIG)', bounds: [[-0.583441, 121.541555], [-0.104051, 122.416776]] },
    { id: 'toggleFuCTSRT2017JAWATIMUR', name: 'CTSRT_2017_JAWA_TIMUR', group: 'ctsrt', label: 'Citra CTSRT 2017 JAWA TIMUR (BIG)', bounds: [[-8.47928, 111.145718], [-6.749812, 113.625113]] },
    { id: 'toggleFuCTSRT2017KALIMANTANBARAT', name: 'CTSRT_2017_KALIMANTAN_BARAT', group: 'ctsrt', label: 'Citra CTSRT 2017 KALIMANTAN BARAT (BIG)', bounds: [[-3.083445, 108.666553], [0.020947, 111.250112]] },
    { id: 'toggleFuCTSRT2017KALIMANTANBARAT1', name: 'CTSRT_2017_KALIMANTAN_BARAT1', group: 'ctsrt', label: 'Citra CTSRT 2017 KALIMANTAN BARAT1 (BIG)', bounds: [[-1.041777, 110.124887], [1.60428, 114.12511]] },
    { id: 'toggleFuCTSRT2017LAMPUNG', name: 'CTSRT_2017_LAMPUNG', group: 'ctsrt', label: 'Citra CTSRT 2017 LAMPUNG (BIG)', bounds: [[-5.729277, 103.749887], [-3.999886, 105.875111]] },
    { id: 'toggleFuCTSRT2017PAPUA', name: 'CTSRT_2017_PAPUA', group: 'ctsrt', label: 'Citra CTSRT 2017 PAPUA (BIG)', bounds: [[-9.125111, 134.58322], [-0.604053, 141.00011]] },
    { id: 'toggleFuCTSRT2018NUSATENGGARABARAT', name: 'CTSRT_2018_NUSA_TENGGARA_BARAT', group: 'ctsrt', label: 'Citra CTSRT 2018 NUSA TENGGARA BARAT (BIG)', bounds: [[-9.125109, 116.70822], [-8.062387, 119.270942]] },
    { id: 'toggleFuCTSRT2018SULAWESI', name: 'CTSRT_2018_SULAWESI', group: 'ctsrt', label: 'Citra CTSRT 2018 SULAWESI (BIG)', bounds: [[-4.81261, 119.33322], [-1.95822, 121.458444]] },
    { id: 'toggleFuCTSRT2018SULAWESIUTARA', name: 'CTSRT_2018_SULAWESIUTARA', group: 'ctsrt', label: 'Citra CTSRT 2018 Sulawesi Utara (BIG)', bounds: [[0.291558, 122.874887], [1.895948, 125.208444]] },
    { id: 'toggleFuCTSRT2018SUMATERA', name: 'CTSRT_2018_SUMATERA', group: 'ctsrt', label: 'Citra CTSRT 2018 SUMATERA (BIG)', bounds: [[-4.833444, 100.64572], [2.312613, 108.47928]] },
    { id: 'toggleFuCTSRT2019KEPULAUANRIAU', name: 'CTSRT_2019_KEPULAUAN_RIAU', group: 'ctsrt', label: 'Citra CTSRT 2019 KEPULAUAN RIAU (BIG)', bounds: [[-0.687609, 103.27072], [4.270948, 109.145947]] },
    { id: 'toggleFuCTSRT2019KUALATANJUNG', name: 'CTSRT_2019_KUALATANJUNG', group: 'ctsrt', label: 'Citra CTSRT 2019 KUALATANJUNG (BIG)', bounds: [[2.99861, 99.144442], [3.480558, 99.459722]] },
    { id: 'toggleFuCTSRT2019SUMUT1', name: 'CTSRT_2019_SUMUT1', group: 'ctsrt', label: 'Citra CTSRT 2019 SUMUT1 (BIG)', bounds: [[0.083224, 98.749887], [3.750113, 100.520941]] },
    { id: 'toggleFuCTSRT2019SUMUT2', name: 'CTSRT_2019_SUMUT2', group: 'ctsrt', label: 'Citra CTSRT 2019 SUMUT2 (BIG)', bounds: [[-0.645943, 97.062387], [4.958448, 99.250109]] },
    { id: 'toggleFuCTSRT2020JAMBI', name: 'CTSRT_2020_JAMBI', group: 'ctsrt', label: 'Citra CTSRT 2020 JAMBI (BIG)', bounds: [[-2.708446, 101.95822], [-0.729053, 103.770944]] },
    { id: 'toggleFuCTSRT2020KALIMANTANBARAT1', name: 'CTSRT_2020_KALIMANTAN_BARAT1', group: 'ctsrt', label: 'Citra CTSRT 2020 KALIMANTAN BARAT1 (BIG)', bounds: [[-2.56261, 109.041555], [1.312613, 111.229277]] },
    { id: 'toggleFuCTSRT2020KALIMANTANBARAT2', name: 'CTSRT_2020_KALIMANTAN_BARAT2', group: 'ctsrt', label: 'Citra CTSRT 2020 KALIMANTAN BARAT2 (BIG)', bounds: [[-2.375109, 110.999887], [1.062613, 112.187611]] },
    { id: 'toggleFuCTSRT2020KALIMANTANTIMUR1', name: 'CTSRT_2020_KALIMANTAN_TIMUR1', group: 'ctsrt', label: 'Citra CTSRT 2020 KALIMANTAN TIMUR1 (BIG)', bounds: [[-2.583445, 115.166555], [0.41678, 117.000109]] },
    { id: 'toggleFuCTSRT2020KALIMANTANTIMUR2', name: 'CTSRT_2020_KALIMANTAN_TIMUR2', group: 'ctsrt', label: 'Citra CTSRT 2020 KALIMANTAN TIMUR2 (BIG)', bounds: [[-1.083443, 115.499887], [2.520948, 119.000112]] },
    { id: 'toggleFuCTSRT2020KALIMANTANTENGAH1', name: 'CTSRT_2020_KALIMANTANTENGAH1', group: 'ctsrt', label: 'Citra CTSRT 2020 KALIMANTANTENGAH1 (BIG)', bounds: [[-3.562607, 110.58322], [-0.999886, 112.500109]] },
    { id: 'toggleFuCTSRT2020KALIMANTANTENGAH2', name: 'CTSRT_2020_KALIMANTANTENGAH2', group: 'ctsrt', label: 'Citra CTSRT 2020 KALIMANTANTENGAH2 (BIG)', bounds: [[-3.45844, 111.229055], [0.520948, 113.45844]] },
    { id: 'toggleFuCTSRT2020RIAU', name: 'CTSRT_2020_RIAU', group: 'ctsrt', label: 'Citra CTSRT 2020 RIAU (BIG)', bounds: [[-0.979277, 100.437387], [1.250113, 103.604277]] },
    { id: 'toggleFuCTSRT2020SUMATERASELATAN1', name: 'CTSRT_2020_SUMATERA_SELATAN1', group: 'ctsrt', label: 'Citra CTSRT 2020 SUMATERA SELATAN1 (BIG)', bounds: [[-4.812612, 102.52072], [-1.999886, 103.50011]] },
    { id: 'toggleFuCTSRT2020SUMATERASELATAN2', name: 'CTSRT_2020_SUMATERA_SELATAN2', group: 'ctsrt', label: 'Citra CTSRT 2020 SUMATERA SELATAN2 (BIG)', bounds: [[-5.000112, 102.812387], [-1.479053, 105.000109]] },
    { id: 'toggleFuCTSRT2021BANTEN', name: 'CTSRT_2021_BANTEN', group: 'ctsrt', label: 'Citra CTSRT 2021 BANTEN (BIG)', bounds: [[-7.020837, 105.083329], [-5.791661, 106.79167]] },
    { id: 'toggleFuCTSRT2021JAMBI', name: 'CTSRT_2021_JAMBI', group: 'ctsrt', label: 'Citra CTSRT 2021 JAMBI (BIG)', bounds: [[-2.770943, 101.562387], [-0.77072, 104.437611]] },
    { id: 'toggleFuCTSRT2021JAWABARAT', name: 'CTSRT_2021_JAWA_BARAT', group: 'ctsrt', label: 'Citra CTSRT 2021 JAWA BARAT (BIG)', bounds: [[-7.479276, 106.39572], [-5.89572, 107.416779]] },
    { id: 'toggleFuCTSRT2021JAWABARAT2', name: 'CTSRT_2021_JAWA_BARAT2', group: 'ctsrt', label: 'Citra CTSRT 2021 JAWA BARAT2 (BIG)', bounds: [[-7.833339, 107.249995], [-6.020828, 109.000008]] },
    { id: 'toggleFuCTSRT2021KALIMANTANBARAT', name: 'CTSRT_2021_KALIMANTAN_BARAT', group: 'ctsrt', label: 'Citra CTSRT 2021 KALIMANTAN BARAT (BIG)', bounds: [[-2.125009, 108.999995], [1.187508, 112.812507]] },
    { id: 'toggleFuCTSRT2021KALIMANTANTENGAH', name: 'CTSRT_2021_KALIMANTAN_TENGAH', group: 'ctsrt', label: 'Citra CTSRT 2021 KALIMANTAN TENGAH (BIG)', bounds: [[-3.562608, 113.14572], [-0.312387, 115.979276]] },
    { id: 'toggleFuCTSRT2021RIAU', name: 'CTSRT_2021_RIAU', group: 'ctsrt', label: 'Citra CTSRT 2021 RIAU (BIG)', bounds: [[-1.479278, 99.812387], [2.562613, 103.479276]] },
    { id: 'toggleFuCTSRT2022BALI', name: 'CTSRT_2022_BALI', group: 'ctsrt', label: 'Citra CTSRT 2022 BALI (BIG)', bounds: [[-8.854385, 114.416418], [-8.04146, 115.729348]] },
    { id: 'toggleFuCTSRT2022JAWABARAT', name: 'CTSRT_2022_JAWA_BARAT', group: 'ctsrt', label: 'Citra CTSRT 2022 JAWA BARAT (BIG)', bounds: [[-7.687613, 106.166552], [-5.937383, 107.791777]] },
    { id: 'toggleFuCTSRT2022JAWATENGAH', name: 'CTSRT_2022_JAWA_TENGAH', group: 'ctsrt', label: 'Citra CTSRT 2022 JAWA TENGAH (BIG)', bounds: [[-8.291776, 108.229052], [-6.374886, 111.750111]] },
    { id: 'toggleFuCTSRT2022JAWATIMUR', name: 'CTSRT_2022_JAWA_TIMUR', group: 'ctsrt', label: 'Citra CTSRT 2022 JAWA TIMUR (BIG)', bounds: [[-8.47928, 112.312383], [-6.812387, 115.916779]] },
    { id: 'toggleFuCTSRT2023SULBARSULTENG', name: 'CTSRT_2023_SULBAR_SULTENG', group: 'ctsrt', label: 'Citra CTSRT 2023 SULBAR SULTENG (BIG)', bounds: [[-3.583443, 118.749884], [0.187613, 120.208444]] },
    { id: 'toggleFuCTSRT2023SULSEL', name: 'CTSRT_2023_SULSEL', group: 'ctsrt', label: 'Citra CTSRT 2023 SULSEL (BIG)', bounds: [[-5.708447, 117.895719], [-1.437387, 120.145944]] },
    { id: 'toggleFuCTSRT2023SULSEL2', name: 'CTSRT_2023_SULSEL2', group: 'ctsrt', label: 'Citra CTSRT 2023 SULSEL2 (BIG)', bounds: [[-7.520945, 119.895719], [-1.833217, 121.854278]] },
    { id: 'toggleFuCTSRT2023SULTRA', name: 'CTSRT_2023_SULTRA', group: 'ctsrt', label: 'Citra CTSRT 2023 SULTRA (BIG)', bounds: [[-6.04178, 120.85405], [-1.541553, 124.083443]] },
    { id: 'toggleFuFOTOUDARA', name: 'FOTOUDARA', group: 'fu', label: 'Foto Udara Arsip 2011-2014 (BIG)', bounds: [[-10.375508, 95.207704], [5.917302, 133.396312]] },
    { id: 'toggleFuFU19811982JawaNusaTenggara', name: 'FU_19811982_JawaNusaTenggara', group: 'fu', label: 'Foto Udara 1981-1982 Jawa Nusa Tenggara (BIG)', bounds: [[-10.764418, 105.044895], [-5.971068, 125.244239]] },
    { id: 'toggleFuFU2011KotaMedan', name: 'FU_2011_KotaMedan', group: 'fu', label: 'Foto Udara 2011 Kota Medan (BIG)', bounds: [[3.458042, 98.458038], [3.833619, 98.750283]] },
    { id: 'toggleFuFU2011KotaPekanbaru', name: 'FU_2011_KotaPekanbaru', group: 'fu', label: 'Foto Udara 2011 Kota Pekanbaru (BIG)', bounds: [[0.374715, 101.33305], [0.625291, 101.541955]] },
    { id: 'toggleFuFU2011Padang', name: 'FU_2011_Padang', group: 'fu', label: 'Foto Udara 2011 Padang (BIG)', bounds: [[-1.000414, 100.208006], [-0.166373, 100.667173]] },
    { id: 'toggleFuFU2012Bitung', name: 'FU_2012_Bitung', group: 'fu', label: 'Foto Udara 2012 Bitung (BIG)', bounds: [[1.374499, 124.721709], [1.653278, 125.306073]] },
    { id: 'toggleFuFU2012KotaGorontalo', name: 'FU_2012_KotaGorontalo', group: 'fu', label: 'Foto Udara 2012 Kota Gorontalo (BIG)', bounds: [[0.453808, 122.953839], [0.629525, 123.129494]] },
    { id: 'toggleFuFU2012KotaParepare', name: 'FU_2012_KotaParepare', group: 'fu', label: 'Foto Udara 2012 Kota Parepare (BIG)', bounds: [[-4.085168, 119.539931], [-3.956501, 119.75174]] },
    { id: 'toggleFuFU2012Manado', name: 'FU_2012_Manado', group: 'fu', label: 'Foto Udara 2012 Manado (BIG)', bounds: [[1.416165, 124.666154], [1.667167, 125.000516]] },
    { id: 'toggleFuFU2012Tomohon', name: 'FU_2012_Tomohon', group: 'fu', label: 'Foto Udara 2012 Tomohon (BIG)', bounds: [[1.249499, 124.707822], [1.417167, 124.91718]] },
    { id: 'toggleFuFU2013Belitung', name: 'FU_2013_Belitung', group: 'fu', label: 'Foto Udara 2013 Belitung (BIG)', bounds: [[-2.833704, 107.541397], [-2.665667, 107.791937]] },
    { id: 'toggleFuFU2013KabBandungUtara', name: 'FU_2013_KabBandungUtara', group: 'fu', label: 'Foto Udara 2013 Kab Bandung Utara (BIG)', bounds: [[-6.939361, 107.457192], [-6.708223, 107.771759]] },
    { id: 'toggleFuFU2013Kendari', name: 'FU_2013_Kendari', group: 'fu', label: 'Foto Udara 2013 Kendari (BIG)', bounds: [[-4.086048, 122.372262], [-3.872285, 122.711054]] },
    { id: 'toggleFuFU2013Palu', name: 'FU_2013_Palu', group: 'fu', label: 'Foto Udara 2013 Palu (BIG)', bounds: [[-1.167156, 119.624547], [-0.624525, 120.000458]] },
    { id: 'toggleFuFU2014Balikpapan', name: 'FU_2014_Balikpapan', group: 'fu', label: 'Foto Udara 2014 Balikpapan (BIG)', bounds: [[-1.293072, 116.769438], [-1.144429, 117.001393]] },
    { id: 'toggleFuFU2014KabBandungSelatan', name: 'FU_2014_KabBandungSelatan', group: 'fu', label: 'Foto Udara 2014 Kab Bandung Selatan (BIG)', bounds: [[-7.065367, 107.413817], [-6.788822, 107.79438]] },
    { id: 'toggleFuFU2014KabBogor', name: 'FU_2014_KabBogor', group: 'fu', label: 'Foto Udara 2014 Kab Bogor (BIG)', bounds: [[-6.688883, 106.727786], [-6.352786, 106.938885]] },
    { id: 'toggleFuFU2014KotaBogor', name: 'FU_2014_KotaBogor', group: 'fu', label: 'Foto Udara 2014 Kota Bogor (BIG)', bounds: [[-6.688882, 106.727788], [-6.49862, 106.855549]] },
    { id: 'toggleFuFU2014Pantura', name: 'FU_2014_Pantura', group: 'fu', label: 'Foto Udara 2014 Pantura (BIG)', bounds: [[-7.000484, 106.97909], [-5.895757, 110.583806]] },
    { id: 'toggleFuFU2014Samarinda', name: 'FU_2014_Samarinda', group: 'fu', label: 'Foto Udara 2014 Samarinda (BIG)', bounds: [[-0.605569, 117.061106], [-0.394431, 117.23056]] },
    { id: 'toggleFuFU2014TanjungSelor', name: 'FU_2014_TanjungSelor', group: 'fu', label: 'Foto Udara 2014 Tanjung Selor (BIG)', bounds: [[2.790262, 117.331931], [2.876403, 117.501403]] },
    { id: 'toggleFuFU2014Tarakan', name: 'FU_2014_Tarakan', group: 'fu', label: 'Foto Udara 2014 Tarakan (BIG)', bounds: [[3.227762, 117.498593], [3.459736, 117.688908]] },
    { id: 'toggleFuFU2015Mandor', name: 'FU_2015_Mandor', group: 'fu', label: 'Foto Udara 2015 Mandor (BIG)', bounds: [[0.228711, 109.166214], [0.417124, 109.521287]] },
    { id: 'toggleFuFU2015TanggaMus', name: 'FU_2015_TanggaMus', group: 'fu', label: 'Foto Udara 2015 Tangga Mus (BIG)', bounds: [[-5.854173, 104.520356], [-5.374529, 105.021295]] },
    { id: 'toggleFuFU2016ACEH', name: 'FU_2016_ACEH', group: 'fu', label: 'Foto Udara 2016 ACEH (BIG)', bounds: [[4.103546, 95.207705], [5.917302, 96.292282]] },
    { id: 'toggleFuFU2016Mandalika', name: 'FU_2016_Mandalika', group: 'fu', label: 'Foto Udara 2016 Mandalika (BIG)', bounds: [[-8.958831, 116.020325], [-8.312003, 116.417165]] },
    { id: 'toggleFuFU2016SeiMangkei', name: 'FU_2016_SeiMangkei', group: 'fu', label: 'Foto Udara 2016 Sei Mangkei (BIG)', bounds: [[2.894801, 99.290693], [3.188406, 99.584091]] },
    { id: 'toggleFuFU2017KotaKetapang', name: 'FU_2017_KotaKetapang', group: 'fu', label: 'Foto Udara 2017 Kota Ketapang (BIG)', bounds: [[-2.397205, 110.061136], [-2.102797, 110.31386]] },
    { id: 'toggleFuFU2017KotaSorong', name: 'FU_2017_KotaSorong', group: 'fu', label: 'Foto Udara 2017 Kota Sorong (BIG)', bounds: [[-1.188201, 131.186899], [-0.791005, 131.604778]] },
    { id: 'toggleFuFU2017KualaTanjung', name: 'FU_2017_KualaTanjung', group: 'fu', label: 'Foto Udara 2017 Kuala Tanjung (BIG)', bounds: [[3.124537, 99.207879], [3.458793, 99.562962]] },
    { id: 'toggleFuFU2017TanjungKelayang', name: 'FU_2017_TanjungKelayang', group: 'fu', label: 'Foto Udara 2017 Tanjung Kelayang (BIG)', bounds: [[-2.729846, 107.603553], [-2.520156, 107.917281]] },
    { id: 'toggleFuFU2018GalangBatang', name: 'FU_2018_GalangBatang', group: 'fu', label: 'Foto Udara 2018 Galang Batang (BIG)', bounds: [[0.832672, 104.332649], [1.188159, 104.729814]] },
    { id: 'toggleFuFU2018KabDonggala', name: 'FU_2018_KabDonggala', group: 'fu', label: 'Foto Udara 2018 Kab Donggala (BIG)', bounds: [[-0.900463, 119.60458], [-0.00458, 120.006637]] },
    { id: 'toggleFuFU2018KabGunungMas', name: 'FU_2018_KabGunungMas', group: 'fu', label: 'Foto Udara 2018 Kab Gunung Mas (BIG)', bounds: [[-1.812984, 113.374522], [-1.457856, 113.604647]] },
    { id: 'toggleFuFU2018KabParigiMoutong', name: 'FU_2018_KabParigiMoutong', group: 'fu', label: 'Foto Udara 2018 Kab Parigi Moutong (BIG)', bounds: [[-1.014087, 119.657496], [0.009442, 120.456058]] },
    { id: 'toggleFuFU2018Palangkaraya', name: 'FU_2018_Palangkaraya', group: 'fu', label: 'Foto Udara 2018 Palangkaraya (BIG)', bounds: [[-2.042612, 113.5824], [-1.519901, 113.834273]] },
    { id: 'toggleFuFU2018PascaBencanaPalu5kPaket3', name: 'FU_2018_PascaBencanaPalu5k_Paket3', group: 'fu', label: 'Foto Udara 2018 Pasca Bencana Palu 5K Paket 3 (BIG)', bounds: [[-0.900464, 119.60458], [-0.00458, 120.006637]] },
    { id: 'toggleFuFU2018TelukBintuni', name: 'FU_2018_TelukBintuni', group: 'fu', label: 'Foto Udara 2018 Teluk Bintuni (BIG)', bounds: [[-2.667154, 132.978683], [-2.395352, 133.396312]] },
    { id: 'toggleFuFU2019Dumai', name: 'FU_2019_Dumai', group: 'fu', label: 'Foto Udara 2019 Dumai (BIG)', bounds: [[1.416191, 101.04119], [2.16715, 101.771313]] },
    { id: 'toggleFuFU2019Kupang', name: 'FU_2019_Kupang', group: 'fu', label: 'Foto Udara 2019 Kupang (BIG)', bounds: [[-10.375508, 123.249526], [-9.728669, 123.938021]] },
    { id: 'toggleFuFU2019PaserKutaiBarat', name: 'FU_2019_Paser_KutaiBarat', group: 'fu', label: 'Foto Udara 2019 Paser Kutai Barat (BIG)', bounds: [[-1.333835, 115.666157], [-0.999547, 116.000489]] },
    { id: 'toggleFuFU2019PrabumulihLubuklinggau', name: 'FU_2019_Prabumulih_Lubuklinggau', group: 'fu', label: 'Foto Udara 2019 Prabumulih Lubuklinggau (BIG)', bounds: [[-3.646302, 102.749499], [-3.145338, 104.354634]] },
    { id: 'toggleFuFU2019Tebingtinggi', name: 'FU_2019_Tebingtinggi', group: 'fu', label: 'Foto Udara 2019 Tebingtinggi (BIG)', bounds: [[3.270378, 99.103714], [3.396289, 99.208789]] },
    { id: 'toggleFuFU2020Bulik', name: 'FU_2020_Bulik', group: 'fu', label: 'Foto Udara 2020 Bulik (BIG)', bounds: [[-2.313043, 111.326824], [-2.011094, 111.68795]] },
    { id: 'toggleFuFU2020Kikim', name: 'FU_2020_Kikim', group: 'fu', label: 'Foto Udara 2020 Kikim (BIG)', bounds: [[-3.792075, 103.270096], [-3.49972, 103.521518]] },
    { id: 'toggleFuFU2020PuprSelunaPnbp', name: 'FU_2020_Pupr_Seluna_Pnbp', group: 'fu', label: 'Foto Udara 2020 PUPR Seluna PNBP (BIG)', bounds: [[-7.271295, 110.52036], [-6.60371, 111.458808]] },
    { id: 'toggleFuFU2020Seputihbanyak', name: 'FU_2020_Seputihbanyak', group: 'fu', label: 'Foto Udara 2020 Seputihbanyak (BIG)', bounds: [[-4.938115, 105.353759], [-4.728558, 105.583767]] },
    { id: 'toggleFuFU2020Siabu', name: 'FU_2020_Siabu', group: 'fu', label: 'Foto Udara 2020 Siabu (BIG)', bounds: [[0.832889, 99.395349], [1.12543, 99.604669]] },
    { id: 'toggleFuFU2020Solok', name: 'FU_2020_Solok', group: 'fu', label: 'Foto Udara 2020 Solok (BIG)', bounds: [[-0.917227, 100.541252], [-0.603662, 100.771186]] },
    { id: 'toggleFuFU2020Tebingtinggi', name: 'FU_2020_Tebingtinggi', group: 'fu', label: 'Foto Udara 2020 Tebingtinggi (BIG)', bounds: [[-1.167105, 102.999369], [-0.874621, 103.208932]] },
    { id: 'toggleFuFU2020Tidengpale', name: 'FU_2020_Tidengpale', group: 'fu', label: 'Foto Udara 2020 Tidengpale (BIG)', bounds: [[3.499514, 116.582883], [3.750462, 117.062961]] },
    { id: 'toggleFuFU2024SULAWESILR', name: 'FU_2024_SULAWESI_LR', group: 'fu', label: 'Foto Udara 2024 SULAWESI LR (BIG)', bounds: [[-5.292127, 119.353716], [1.583786, 125.229617]] }
  ];

  var FU_LAYERS = {};
  Object.keys(MAIN_LAYERS).forEach(function (id) { FU_LAYERS[id] = MAIN_LAYERS[id]; });
  IMAGERY_DEFS.forEach(function (d) {
    FU_LAYERS[d.id] = {
      url: BASE + 'IMAGERY/' + d.name + '/ImageServer',
      type: 'image',
      bounds: d.bounds,
      label: d.label,
      group: d.group,
      name: d.name
    };
  });

  var _layers = {};
  var _active = {};

  function getMap() {
    if (typeof window._map !== 'undefined' && window._map) return window._map;
    if (typeof window.map !== 'undefined' && window.map) return window.map;
    if (typeof map !== 'undefined') return map;
    return null;
  }

  function hasEsri() {
    return typeof L !== 'undefined' && L.esri && L.esri.imageMapLayer;
  }

  function createLayer(def) {
    if (def.type === 'dynamic') {
      if (!(L.esri && L.esri.dynamicMapLayer)) return null;
      return L.esri.dynamicMapLayer({
        url: def.url,
        opacity: 1,
        attribution: '© BIG',
        pane: 'overlayPane'
      });
    }
    if (!L.esri || !L.esri.imageMapLayer) return null;
    return L.esri.imageMapLayer({
      url: def.url,
      format: 'jpgpng',
      transparent: true,
      opacity: 1,
      attribution: '© BIG',
      pane: 'overlayPane'
    });
  }

  window.toggleFuLayer = function (id, visible) {
    var def = FU_LAYERS[id];
    if (!def) return;
    var m = getMap();
    if (!m) return;

    if (!visible) {
      if (_layers[id] && m.hasLayer(_layers[id])) m.removeLayer(_layers[id]);
      _active[id] = false;
      return;
    }

    if (!hasEsri()) {
      if (typeof window.showMapToast === 'function') {
        window.showMapToast('Pustaka esri-leaflet tidak tersedia.', 'error');
      }
      return;
    }

    if (!_layers[id]) {
      _layers[id] = createLayer(def);
      if (!_layers[id]) return;
      _layers[id].on('error', function (e) {
        console.warn('[FU] layer error:', id, e && e.error);
      });
    }

    if (!m.hasLayer(_layers[id])) _layers[id].addTo(m);
    _active[id] = true;
    m.flyToBounds(L.latLngBounds(def.bounds).pad(0.35), {
      maxZoom: 17,
      duration: 1.2
    });
  };

  window.isFuLayerActive = function (id) {
    return !!_active[id];
  };

  window.getFuLayerIds = function () {
    return Object.keys(FU_LAYERS);
  };

  window.getFuLayerDefs = function () {
    return FU_LAYERS;
  };

  window.getFuCatalogGroups = function () {
    var main = [], ctsrt = [], fu = [], digital = [];
    Object.keys(FU_LAYERS).forEach(function (id) {
      var d = FU_LAYERS[id];
      var item = { id: id, label: d.label };
      if (id === 'toggleFuBanten') { digital.push(item); return; }
      if (MAIN_LAYERS[id] && !d.group) { main.push(item); return; }
      if (d.group === 'ctsrt') ctsrt.push(item);
      else fu.push(item);
    });
    return { main: main, ctsrt: ctsrt, fu: fu, digital: digital };
  };

  Object.keys(FU_LAYERS).forEach(function (id) {
    window[id] = (function (layerId) {
      return function (visible) { window.toggleFuLayer(layerId, visible); };
    })(id);
    var camel = id.replace(/^toggleFu/, '');
    window['isFu' + camel + 'Active'] = (function (layerId) {
      return function () { return window.isFuLayerActive(layerId); };
    })(id);
  });
})();