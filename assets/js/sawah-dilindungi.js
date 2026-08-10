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

  function createSawahPopup(properties, withKtaPlaceholder) {
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
        ${withKtaPlaceholder ? '<div id="kta-insight-container" style="margin-top:8px;"><div style="font-size:9px;color:#b0bec5;text-align:center;padding:4px;">⏳ Memuat analisis KTA...</div></div>' : ''}
      </div>`;
  }

  function createSawahNasionalPopup(properties, withKtaPlaceholder) {
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
        ${withKtaPlaceholder ? '<div id="kta-insight-container" style="margin-top:8px;"><div style="font-size:9px;color:#b0bec5;text-align:center;padding:4px;">⏳ Memuat analisis KTA...</div></div>' : ''}
      </div>`;
  }

  // ---- Attach KTA Insight to Sawah Layer ----
  function attachKtaInsightToLayer(layer) {
    if (!layer || !layer.on) return;
    layer.on('popupopen', async (e) => {
      try {
        const popup = e.popup;
        const container = popup.getElement()?.querySelector('#kta-insight-container');
        if (!container) return;

        const feature = e.layer?.feature;
        if (!feature || !feature.geometry) return;

        // Get centroid of the feature
        let lat = null, lon = null;
        if (feature.geometry.coordinates) {
          const geom = feature.geometry;
          if (geom.type === 'Polygon' && geom.coordinates?.[0]) {
            const ring = geom.coordinates[0];
            let cx = 0, cy = 0;
            ring.forEach(([x, y]) => { cx += x; cy += y; });
            lon = cx / ring.length;
            lat = cy / ring.length;
          } else if (geom.type === 'MultiPolygon' && geom.coordinates?.[0]?.[0]) {
            const ring = geom.coordinates[0][0];
            let cx = 0, cy = 0;
            ring.forEach(([x, y]) => { cx += x; cy += y; });
            lon = cx / ring.length;
            lat = cy / ring.length;
          }
        }

        if (lat === null || lon === null) {
          container.innerHTML = '<div style="font-size:9px;color:#b0bec5;">Geometri tidak valid</div>';
          return;
        }

        const luasha = feature.properties?.luasha || feature.properties?.luas_polyg || 0;
        const luasHa = Number(luasha) / 10000;

        // Fetch erosion data
        const erosiResult = typeof fetchErosiAtPoint === 'function' ? await fetchErosiAtPoint(lat, lon) : null;

        if (!erosiResult) {
          // Try envelope query if point query fails
          if (feature.geometry.coordinates) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            const getCoords = (coords) => {
              if (Array.isArray(coords[0])) {
                coords.forEach(c => Array.isArray(c[0]) ? getCoords(c) : (minX = Math.min(minX, c[0]), maxX = Math.max(maxX, c[0]), minY = Math.min(minY, c[1]), maxY = Math.max(maxY, c[1])));
              }
            };
            getCoords(feature.geometry.coordinates);

            if (minX < maxX && minY < maxY && typeof fetchErosiInEnvelope === 'function') {
              const features = await fetchErosiInEnvelope(minX, minY, maxX, maxY);
              if (features && features.length) {
                const classCount = {};
                features.forEach(f => {
                  const attrs = f.attributes || {};
                  const kelas = attrs.klas_erosi || attrs.KLAS_EROSI || attrs.kelas_erosi || attrs.KELAS_EROSI || attrs.erosion_class || attrs.kelas || attrs.KELAS || attrs.nama_kelas || '';
                  if (kelas) classCount[String(kelas).trim()] = (classCount[String(kelas).trim()] || 0) + 1;
                });
                let dominantClass = '', maxCount = 0;
                Object.entries(classCount).forEach(([cls, count]) => { if (count > maxCount) { maxCount = count; dominantClass = cls; } });
                const kta = (typeof getKtaByKelasName === 'function' ? getKtaByKelasName(dominantClass) : null) ||
                            (typeof getKtaClassification === 'function' ? getKtaClassification(0) : null);
                if (kta && typeof generateKtaInsightHtml === 'function') {
                  container.innerHTML = generateKtaInsightHtml({ totalFeatures: features.length, dominantClass, avgValue: 0, classCount, kta }, luasHa);
                  return;
                }
              }
            }
          }
          container.innerHTML = '<div style="font-size:9px;color:#b0bec5;">Data erosi tidak tersedia</div>';
          return;
        }

        // Classify from point result
        const kelas = erosiResult.klas_erosi || erosiResult.KLAS_EROSI || erosiResult.kelas_erosi ||
                      erosiResult.KELAS_EROSI || erosiResult.erosion_class ||
                      erosiResult.kelas || erosiResult.KELAS || erosiResult.nama_kelas || '';
        const nilai = typeof parseErosiValue === 'function' ? parseErosiValue(kelas) : 0;
        const kta = (typeof getKtaByKelasName === 'function' ? getKtaByKelasName(kelas) : null) ||
                    (typeof getKtaClassification === 'function' ? getKtaClassification(nilai) : null);

        if (kta && typeof generateKtaInsightHtml === 'function') {
          container.innerHTML = generateKtaInsightHtml({
            totalFeatures: 1,
            dominantClass: kelas,
            avgValue: Number(nilai) || 0,
            classCount: kelas ? { [kelas]: 1 } : {},
            kta
          }, luasHa);
        } else {
          container.innerHTML = '<div style="font-size:9px;color:#b0bec5;">Klasifikasi erosi tidak dikenali</div>';
        }
      } catch (err) {
        console.warn('KTA insight error:', err);
        const container = e.popup?.getElement()?.querySelector('#kta-insight-container');
        if (container) container.innerHTML = '<div style="font-size:9px;color:#ef5350;">Gagal memuat analisis KTA</div>';
      }
    });
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
            layer.bindPopup(createSawahPopup(feature.properties, true), {
              maxWidth: 280,
              className: 'sawah-leaflet-popup'
            });
          }
        }
      }).addTo(map);

      attachKtaInsightToLayer(sawahDilindungiLayer);

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
            layer.bindPopup(createSawahNasionalPopup(feature.properties, true), {
              maxWidth: 280,
              className: 'sawah-leaflet-popup'
            });
          }
        }
      }).addTo(map);

      attachKtaInsightToLayer(sawahNasionalLayer);

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
