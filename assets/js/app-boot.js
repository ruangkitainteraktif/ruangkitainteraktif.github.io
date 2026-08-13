  function loadProvinces() {
    if (typeof wilayahLookup !== 'undefined' && wilayahLookup) return;
    fetch('assets/data/bps/geojson/provinsi.geojson')
      .then(function (r) { return r.json(); })
      .then(function (geo) {
        if (typeof wilayahLookup !== 'undefined') {
          wilayahLookup = geo.features.map(function (f) {
            return { id: f.properties.kdprov, nama: f.properties.nmprov };
          });
        }
      })
      .catch(function (e) { console.warn('[AppBoot] Gagal load provinsi:', e); });
  }

  function loadLegend() {
    /* no-op — legend handled by choropleth.js and layer controls */
  }
