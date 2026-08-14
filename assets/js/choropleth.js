(function () {
  'use strict';

  const GEOJSON_BASE = 'assets/data/bps/geojson/';
  const INDICATOR_BASE = 'assets/data/bps/indikator/';

  const geojsonCache = {};
  const indicatorCache = {};
  let activeChoroplethLayer = null;
  let activeChoroplethLegend = null;
  let activeIndicatorMeta = null;

  async function fetchJSON(url) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return await resp.json();
    } catch (e) {
      console.error('[Choropleth] Gagal fetch:', url, e);
      return null;
    }
  }

  async function loadGeoJSON(name) {
    if (geojsonCache[name]) return geojsonCache[name];
    const json = await fetchJSON(GEOJSON_BASE + name + '.geojson');
    geojsonCache[name] = json || null;
    return geojsonCache[name];
  }

  async function loadIndicator(id) {
    if (indicatorCache[id]) return indicatorCache[id];
    const json = await fetchJSON(INDICATOR_BASE + id + '.json');
    indicatorCache[id] = json || null;
    return indicatorCache[id];
  }

  function interpolateColor(c1, c2, t) {
    const r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
    const r2 = parseInt(c2.slice(1, 3), 16), g2 = parseInt(c2.slice(3, 5), 16), b2 = parseInt(c2.slice(5, 7), 16);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function getColorForValue(value, kelas, tipeSkala, minColor, midColor, maxColor) {
    if (value === null || value === undefined || isNaN(value)) return 'rgba(200,200,200,0.3)';
    const n = kelas.length;
    if (n === 0) return '#ccc';

    for (let i = 0; i < n; i++) {
      if (value >= kelas[i].min && value < kelas[i].max) {
        const t = n > 1 ? i / (n - 1) : 0;
        if (tipeSkala === 'diverging' && midColor) {
          const half = Math.floor(n / 2);
          if (i < half) {
            return interpolateColor(minColor, midColor, half > 0 ? i / half : 0);
          } else {
            return interpolateColor(midColor, maxColor, (n - half) > 1 ? (i - half) / (n - half - 1) : 0);
          }
        }
        return interpolateColor(minColor, maxColor, t);
      }
    }

    const last = kelas[n - 1];
    if (value >= last.min) {
      if (tipeSkala === 'diverging' && midColor) return maxColor;
      return maxColor;
    }
    return minColor;
  }

  function detectLevel(features, levelWilayah) {
    const firstLvl = levelWilayah[0];

    if (firstLvl.id_level_wilayah === 2) return { geoKey: 'pulau', idLen: 99, lvlConfig: firstLvl };
    if (firstLvl.id_level_wilayah === 3) return { geoKey: 'metropolitan', idLen: 99, lvlConfig: firstLvl };

    const hasKab = features.some(f => f.properties.id_wilayah && /^\d{4,}$/.test(f.properties.id_wilayah));

    if (hasKab) {
      const lvlConfig = levelWilayah.find(l => l.id_level_wilayah === 5);
      return { geoKey: 'kabupaten', idLen: 4, lvlConfig: lvlConfig || levelWilayah[levelWilayah.length - 1] };
    }

    const hasProv = features.some(f => f.properties.id_wilayah && f.properties.id_wilayah.length === 2);
    if (hasProv) {
      const lvlConfig = levelWilayah.find(l => l.id_level_wilayah === 4);
      return { geoKey: 'provinsi', idLen: 2, lvlConfig: lvlConfig || firstLvl };
    }

    return { geoKey: 'provinsi', idLen: 2, lvlConfig: firstLvl };
  }

  function matchGeoId(geoFeature, geoKey) {
    const p = geoFeature.properties;
    if (geoKey === 'provinsi') return String(p.kdprov);
    if (geoKey === 'kabupaten') return String(p.idkab);
    if (geoKey === 'pulau') return String(p.id_wilayah);
    if (geoKey === 'metropolitan') return String(p.id_wilayah);
    return null;
  }

  function getFeatureName(geoFeature, geoKey) {
    const p = geoFeature.properties;
    if (geoKey === 'provinsi') return p.nmprov || '-';
    if (geoKey === 'kabupaten') return p.nmkab || '-';
    if (geoKey === 'pulau') return p.nama_wilayah || '-';
    if (geoKey === 'metropolitan') return p.nama_wilayah || '-';
    return '-';
  }

  function formatValue(val, satuan) {
    if (val === null || val === undefined || isNaN(val)) return '-';
    if (satuan.includes('%')) return val.toFixed(2) + ' %';
    if (satuan.includes('per 1.000')) return val.toFixed(1) + ' /1.000';
    if (satuan.includes('per 100.000')) return val.toFixed(1) + ' /100.000';
    if (satuan.includes('anak')) return val.toFixed(2) + ' ' + satuan;
    return val.toFixed(2) + (satuan ? ' ' + satuan : '');
  }

  function createLegend(lvlConfig, kelas) {
    if (activeChoroplethLegend) {
      map.removeControl(activeChoroplethLegend);
      activeChoroplethLegend = null;
    }

    const legendaLabels = lvlConfig.pivot_legenda_domain || [];
    const minColor = lvlConfig.pivot_min_color || '#fee5d9';
    const midColor = lvlConfig.pivot_mid_color;
    const maxColor = lvlConfig.pivot_max_color || '#a50f15';
    const satuan = lvlConfig.pivot_satuan || '';
    const title = lvlConfig.pivot_judul || '';
    const tipeSkala = lvlConfig.pivot_tipe_skala || 'sequential';

    const LegendControl = L.Control.extend({
      options: { position: 'bottomleft' },
      onAdd: function () {
        const div = L.DomUtil.create('div', 'choropleth-legend');
        L.DomEvent.disableClickPropagation(div);

        let html = `<div class="choropleth-legend-title">${title}</div>`;

        const n = kelas.length;
        for (let i = 0; i < n; i++) {
          let color;
          if (tipeSkala === 'diverging' && midColor) {
            const half = Math.floor(n / 2);
            if (i < half) {
              color = interpolateColor(minColor, midColor, half > 0 ? i / half : 0);
            } else {
              color = interpolateColor(midColor, maxColor, (n - half) > 1 ? (i - half) / (n - half - 1) : 0);
            }
          } else {
            color = interpolateColor(minColor, maxColor, n > 1 ? i / (n - 1) : 0);
          }
          const label = legendaLabels[i] || (kelas[i].min.toFixed(1) + ' – ' + kelas[i].max.toFixed(1));
          html += `<div class="choropleth-legend-item">
            <span class="choropleth-legend-color" style="background:${color};"></span>
            <span class="choropleth-legend-label">${label}</span>
          </div>`;
        }

        html += `<div class="choropleth-legend-unit">${satuan}</div>`;
        div.innerHTML = html;
        return div;
      }
    });

    activeChoroplethLegend = new LegendControl();
    activeChoroplethLegend.addTo(map);
  }

  function removeChoropleth() {
    if (activeChoroplethLayer) {
      map.removeLayer(activeChoroplethLayer);
      activeChoroplethLayer = null;
    }
    if (activeChoroplethLegend) {
      map.removeControl(activeChoroplethLegend);
      activeChoroplethLegend = null;
    }
    activeIndicatorMeta = null;
  }

  async function showChoropleth(indicatorId, customData) {
    removeChoropleth();

    let json;
    if (customData) {
      json = customData;
    } else {
      json = await loadIndicator(indicatorId);
    }
    if (!json) {
      console.error('[Choropleth] Gagal load indikator:', indicatorId);
      return;
    }

    const data = json.data || json;
    const meta = data.indikator;
    const allFeatures = data.features || [];
    const allKelas = data.klasifikasi?.kelas || [];

    if (!allFeatures.length) {
      console.warn('[Choropleth] Tidak ada data fitur');
      return;
    }

    const level = detectLevel(allFeatures, meta.level_wilayah || []);
    const geoKey = level.geoKey;
    const lvlConfig = level.lvlConfig;

    console.log('[Choropleth] Level detected:', geoKey, '| Indicator:', meta.nama_indikator);

    const geoData = await loadGeoJSON(geoKey);
    if (!geoData) {
      console.error('[Choropleth] Gagal load GeoJSON:', geoKey);
      return;
    }

    activeIndicatorMeta = meta;

    const minColor = lvlConfig.pivot_min_color || '#fee5d9';
    const midColor = lvlConfig.pivot_mid_color;
    const maxColor = lvlConfig.pivot_max_color || '#a50f15';
    const tipeSkala = lvlConfig.pivot_tipe_skala || 'sequential';
    const satuan = lvlConfig.pivot_satuan || '';

    const indicatorMap = {};
    allFeatures.forEach(f => {
      const id = f.properties.id_wilayah;
      if (id && f.properties.nilai !== null && f.properties.nilai !== undefined) {
        indicatorMap[String(id)] = f.properties;
      }
    });

    console.log('[Choropleth] Indicator map entries:', Object.keys(indicatorMap).length);
    console.log('[Choropleth] GeoJSON features:', geoData.features.length);
    console.log('[Choropleth] Kelas:', allKelas.length, '| Colors:', minColor, midColor, maxColor);

    function getIndicatorValue(geoFeature) {
      const matchId = matchGeoId(geoFeature, geoKey);
      return indicatorMap[matchId] || null;
    }

    function style(geoFeature) {
      const ind = getIndicatorValue(geoFeature);
      const value = ind?.nilai;
      const fillColor = allKelas.length > 0
        ? getColorForValue(value, allKelas, tipeSkala, minColor, midColor, maxColor)
        : 'rgba(200,200,200,0.3)';
      return {
        fillColor: fillColor,
        weight: 1,
        opacity: 0.8,
        color: '#ffffff',
        fillOpacity: 0.7
      };
    }

    let bounds = null;

    activeChoroplethLayer = L.geoJSON(geoData, {
      style: style,
      onEachFeature: function (feature, layer) {
        const name = getFeatureName(feature, geoKey);
        const ind = getIndicatorValue(feature);
        const value = ind?.nilai;
        const kode = matchGeoId(feature, geoKey);
        const valueStr = formatValue(value, satuan);

        layer.bindTooltip(
          '<div style="font-size:11px;font-weight:700;color:#1e293b;">' + name + '</div>' +
          '<div style="font-size:10px;color:#475569;">' + (lvlConfig.pivot_judul || meta.nama_indikator) + '</div>' +
          '<div style="font-size:12px;font-weight:800;color:#0891b2;margin-top:3px;">' + valueStr + '</div>',
          { sticky: true, className: 'choropleth-tooltip' }
        );

        layer.on('mouseover', function () {
          this.setStyle({ weight: 2.5, color: '#0891b2', fillOpacity: 0.85 });
          this.bringToFront();
        });

        layer.on('mouseout', function () {
          if (activeChoroplethLayer) activeChoroplethLayer.resetStyle(this);
        });

        layer.on('click', function () {
          if (typeof selectedWilayahId !== 'undefined') {
            selectedWilayahId = kode;
          }
          if (typeof showDetailPanel === 'function') {
            showDetailPanel(kode);
          }
        });

        if (!bounds) {
          bounds = layer.getBounds();
        } else {
          bounds.extend(layer.getBounds());
        }
      }
    }).addTo(map);

    createLegend(lvlConfig, allKelas);

    if (bounds) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 8 });
    }
  }

  function hideChoropleth() {
    removeChoropleth();
  }

  window.showChoropleth = showChoropleth;
  window.hideChoropleth = hideChoropleth;
})();
