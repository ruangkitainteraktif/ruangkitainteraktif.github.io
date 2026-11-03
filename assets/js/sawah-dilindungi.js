  // Lahan Sawah Dilindungi 50K Layer
  const SAWAH_DILINDUNGI_URL = 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/59';
  let sawahDilindungiLayer = null;

  // LBS 2019 nasional disajikan sebagai 34 sublayer provinsi.
  const SAWAH_NASIONAL_URL = 'https://sig02.pertanian.go.id/server/rest/services/Sawah/LBS2019/MapServer';
  const SAWAH_NASIONAL_LAYERS = Array.from({ length: 34 }, (_, id) => id);
  let sawahNasionalLayer = null;
  let sawahNasionalClickHandler = null;

  function escapeSawahHtml(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
  }

  function createSawahPopup(properties) {
    const lsd = properties.lsd || '-';
    const wadmpr = properties.wadmpr || '-';
    const wadmkk = properties.wadmkk || '-';
    const luasha = properties.luasha;
    const luashaStr = luasha ? `${Number(luasha).toLocaleString('id-ID')} ha` : '-';
    const remark = properties.remark || '-';
    const metadata = properties.metadata || '-';

    return `
      <div class="sawah-popup">
        <div class="sawah-popup-header">
          <strong>🌾 Lahan Sawah Dilindungi</strong>
        </div>
        <div class="sawah-popup-body">
          <div class="sawah-popup-row"><span>Jenis</span><b>${escapeSawahHtml(lsd)}</b></div>
          <div class="sawah-popup-row"><span>Provinsi</span><b>${escapeSawahHtml(wadmpr)}</b></div>
          <div class="sawah-popup-row"><span>Kab/Kota</span><b>${escapeSawahHtml(wadmkk)}</b></div>
          <div class="sawah-popup-row"><span>Luas</span><b>${escapeSawahHtml(luashaStr)}</b></div>
          <div class="sawah-popup-row"><span>Keterangan</span><b>${escapeSawahHtml(remark)}</b></div>
        </div>
      </div>`;
  }

  function createSawahNasionalPopup(properties) {
    const rows = Object.entries(properties || {}).filter(([key, value]) =>
      !/^objectid$/i.test(key) && value !== null && value !== ''
    ).slice(0, 8).map(([key, value]) => `
      <div class="sawah-popup-row"><span>${escapeSawahHtml(key)}</span><b>${escapeSawahHtml(value)}</b></div>`).join('');

    return `
      <div class="sawah-popup">
        <div class="sawah-popup-header" style="background: linear-gradient(135deg, #1976d2, #42a5f5);">
          <strong>🌾 Lahan Baku Sawah Nasional (Kementan LBS 2019)</strong>
        </div>
        <div class="sawah-popup-body">
          ${rows || '<div class="sawah-popup-row">Atribut tidak tersedia</div>'}
        </div>
      </div>`;
  }

  async function toggleSawahDilindungi(visible) {
    if (!visible) {
      if (sawahDilindungiLayer && map.hasLayer(sawahDilindungiLayer)) {
        map.removeLayer(sawahDilindungiLayer);
      }
      return;
    }

    try {
      sawahDilindungiLayer = L.esri.featureLayer({
        url: SAWAH_DILINDUNGI_URL,
        where: '1=1',
        outFields: ['lsd', 'wadmpr', 'wadmkk', 'luasha', 'remark', 'metadata'],
        style: function(feature) {
          const lsd = feature.properties.lsd;
          if (lsd === 'Lahan Sawah yang Dilindungi di Dalam Kawasan Hutan') {
            return { color: '#ffaa00', weight: 1, fillColor: '#ffaa00', fillOpacity: 0.6 };
          } else if (lsd === 'Lahan Sawah yang Dilindungi di Luar Kawasan Hutan') {
            return { color: '#aaff00', weight: 1, fillColor: '#aaff00', fillOpacity: 0.6 };
          }
          return { color: '#d6fcd2', weight: 1, fillColor: '#d6fcd2', fillOpacity: 0.6 };
        },
        onEachFeature: function(feature, layer) {
          if (feature.properties) {
            layer.bindPopup(createSawahPopup(feature.properties), {
              maxWidth: 320,
              className: 'sawah-leaflet-popup'
            });
          }
        }
      }).addTo(map);

      sawahDilindungiLayer.on('load', function() {
        if (sawahDilindungiLayer.getBounds().isValid()) {
          map.flyToBounds(sawahDilindungiLayer.getBounds().pad(0.1), { maxZoom: 10, duration: 0.8 });
        }
      });
    } catch (err) {
      console.warn('Gagal memuat Lahan Sawah Dilindungi:', err);
    }
  }

  async function toggleSawahNasional50k(visible) {
    if (!visible) {
      if (sawahNasionalLayer && map.hasLayer(sawahNasionalLayer)) {
        map.removeLayer(sawahNasionalLayer);
      }
      if (sawahNasionalClickHandler) {
        map.off('click', sawahNasionalClickHandler);
        sawahNasionalClickHandler = null;
      }
      return;
    }

    try {
      sawahNasionalLayer = L.esri.dynamicMapLayer({
        url: SAWAH_NASIONAL_URL,
        layers: SAWAH_NASIONAL_LAYERS,
        opacity: 0.72,
        format: 'png32',
        transparent: true
      }).addTo(map);

      if (sawahNasionalClickHandler) map.off('click', sawahNasionalClickHandler);
      sawahNasionalClickHandler = function(event) {
        L.esri.identifyFeatures({ url: SAWAH_NASIONAL_URL }).on(map).at(event.latlng).layers('visible')
          .run(function(error, collection) {
            if (error || !collection || !collection.features || !collection.features.length) return;
            L.popup({ maxWidth: 320, className: 'sawah-leaflet-popup' }).setLatLng(event.latlng)
              .setContent(createSawahNasionalPopup(collection.features[0].properties)).openOn(map);
          });
      };
      map.on('click', sawahNasionalClickHandler);
    } catch (err) {
      console.warn('Gagal memuat Lahan Baku Sawah Nasional LBS 2019:', err);
    }
  }

  window.toggleSawahDilindungi = toggleSawahDilindungi;
  window.toggleSawahNasional50k = toggleSawahNasional50k;

  Object.defineProperty(window, 'sawahDilindungiLayerObj', { get: function () { return sawahDilindungiLayer; } });
  Object.defineProperty(window, 'sawahNasionalLayerObj', { get: function () { return sawahNasionalLayer; } });
