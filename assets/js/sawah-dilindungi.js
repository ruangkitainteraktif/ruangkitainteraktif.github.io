  // Lahan Sawah Dilindungi 50K Layer
  const SAWAH_DILINDUNGI_URL = 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/59';
  let sawahDilindungiLayer = null;

  // Lahan Baku Sawah Nasional 50K Layer
  const SAWAH_NASIONAL_URL = 'https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/36';
  let sawahNasionalLayer = null;

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
    const luashaStr = luasha ? `${Number(luasha).toLocaleString('id-ID')} m²` : '-';
    const remark = properties.remark || '-';
    const metadata = properties.metadata || '-';
    const luasHa = luasha ? (Number(luasha) / 10000).toFixed(2) : null;

    return `
      <div class="sawah-popup">
        <div class="sawah-popup-header">
          <strong>🌾 Lahan Sawah Dilindungi</strong>
        </div>
        <div class="sawah-popup-body">
          <div class="sawah-popup-row"><span>Jenis</span><b>${escapeSawahHtml(lsd)}</b></div>
          <div class="sawah-popup-row"><span>Provinsi</span><b>${escapeSawahHtml(wadmpr)}</b></div>
          <div class="sawah-popup-row"><span>Kab/Kota</span><b>${escapeSawahHtml(wadmkk)}</b></div>
          <div class="sawah-popup-row"><span>Luas</span><b>${escapeSawahHtml(luashaStr)}${luasHa ? ` (${luasHa} Ha)` : ''}</b></div>
          <div class="sawah-popup-row"><span>Keterangan</span><b>${escapeSawahHtml(remark)}</b></div>
        </div>
      </div>`;
  }

  function createSawahNasionalPopup(properties) {
    const qName = properties.q_name19 || '-';
    const wadmpr = properties.wadmpr || '-';
    const wadmkk = properties.wadmkk || '-';
    const luasPolyg = properties.luas_polyg;
    const luasStr = luasPolyg ? `${Number(luasPolyg).toLocaleString('id-ID')} m²` : '-';
    const luasHa = luasPolyg ? (Number(luasPolyg) / 10000).toFixed(2) : null;

    return `
      <div class="sawah-popup">
        <div class="sawah-popup-header" style="background: linear-gradient(135deg, #1976d2, #42a5f5);">
          <strong>🌾 Lahan Baku Sawah Nasional 50K</strong>
        </div>
        <div class="sawah-popup-body">
          <div class="sawah-popup-row"><span>Nama</span><b>${escapeSawahHtml(qName)}</b></div>
          <div class="sawah-popup-row"><span>Provinsi</span><b>${escapeSawahHtml(wadmpr)}</b></div>
          <div class="sawah-popup-row"><span>Kab/Kota</span><b>${escapeSawahHtml(wadmkk)}</b></div>
          <div class="sawah-popup-row"><span>Luas</span><b>${escapeSawahHtml(luasStr)}${luasHa ? ` (${luasHa} Ha)` : ''}</b></div>
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
              maxWidth: 280,
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
      return;
    }

    try {
      sawahNasionalLayer = L.esri.featureLayer({
        url: SAWAH_NASIONAL_URL,
        where: '1=1',
        outFields: ['q_name19', 'wadmpr', 'wadmkk', 'luas_polyg'],
        style: function() {
          return { color: '#6e6e6e', weight: 0.4, fillColor: '#e6fcc0', fillOpacity: 0.6 };
        },
        onEachFeature: function(feature, layer) {
          if (feature.properties) {
            layer.bindPopup(createSawahNasionalPopup(feature.properties), {
              maxWidth: 280,
              className: 'sawah-leaflet-popup'
            });
          }
        }
      }).addTo(map);

      sawahNasionalLayer.on('load', function() {
        if (sawahNasionalLayer.getBounds().isValid()) {
          map.flyToBounds(sawahNasionalLayer.getBounds().pad(0.1), { maxZoom: 10, duration: 0.8 });
        }
      });
    } catch (err) {
      console.warn('Gagal memuat Lahan Baku Sawah Nasional 50K:', err);
    }
  }

  // Event listener
  document.addEventListener('DOMContentLoaded', () => {
    const checkbox = document.getElementById('toggleSawahDilindungi');
    if (checkbox) {
      checkbox.addEventListener('change', () => {
        toggleSawahDilindungi(checkbox.checked);
      });
    }

    const checkboxNasional = document.getElementById('toggleSawahNasional50k');
    if (checkboxNasional) {
      checkboxNasional.addEventListener('change', () => {
        toggleSawahNasional50k(checkboxNasional.checked);
      });
    }
  });
