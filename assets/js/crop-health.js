/* ── Crop Health Analysis — Sentinel-2 ImageServer ── */
(function () {
  'use strict';

  var SENTINEL_SAMPLES_URL = 'https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer/getSamples';
  var SENTINEL_CATALOG_URL = 'https://sentinel.arcgis.com/arcgis/rest/services/Sentinel2/ImageServer/query';

  var healthCache = {};

  function toWebMercator(lon, lat) {
    var x = lon * 20037508.34 / 180;
    var y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
    return [x, y * 20037508.34 / 180];
  }

  function buildGeometry(polygon) {
    var geom = polygon.geometry || polygon;
    var rings;
    if (geom.type === 'Polygon') {
      rings = [geom.coordinates[0]];
    } else if (geom.type === 'MultiPolygon') {
      rings = geom.coordinates[0];
    } else {
      return null;
    }
    return {
      rings: rings.map(function (ring) {
        return ring.map(function (c) { return toWebMercator(c[0], c[1]); });
      }),
      spatialReference: { wkid: 102100 }
    };
  }

  function fetchSamples(geometry, sampleCount, startTime, endTime) {
    var params = new URLSearchParams({
      f: 'json',
      geometryType: 'esriGeometryPolygon',
      geometry: JSON.stringify(geometry),
      sampleCount: String(sampleCount || 100),
      returnFirstValueOnly: 'true',
      pixelSize: '10'
    });
    if (startTime && endTime) {
      params.set('time', JSON.stringify({ startTime: startTime, endTime: endTime }));
    }
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 30000);
    return fetch(SENTINEL_SAMPLES_URL + '?' + params, { signal: controller.signal })
      .then(function (res) {
        if (!res.ok) throw new Error('Sentinel-2 HTTP ' + res.status);
        return res.json();
      })
      .then(function (payload) {
        if (payload.error) throw new Error(payload.error.message || 'Sentinel-2 error');
        return (payload.samples || []).map(function (sample) {
          var bands = String(sample.value || '').trim().split(/\s+/).map(Number);
          var b3 = bands[2];
          var b4 = bands[3];
          var b5 = bands[4];
          var b8 = bands[7];
          var b11 = bands[10];
          var ndvi = Number.isFinite(b4) && Number.isFinite(b8) && b4 + b8 !== 0 ? (b8 - b4) / (b8 + b4) : null;
          var ndre = Number.isFinite(b5) && Number.isFinite(b8) && b5 + b8 !== 0 ? (b8 - b5) / (b8 + b5) : null;
          var ndmi = Number.isFinite(b11) && Number.isFinite(b8) && b11 + b8 !== 0 ? (b8 - b11) / (b8 + b11) : null;
          var ndwi = Number.isFinite(b3) && Number.isFinite(b8) && b3 + b8 !== 0 ? (b3 - b8) / (b3 + b8) : null;
          return {
            x: Number(sample.location && sample.location.x),
            y: Number(sample.location && sample.location.y),
            ndvi: ndvi, ndre: ndre, ndmi: ndmi, ndwi: ndwi,
            rasterId: sample.rasterId
          };
        }).filter(function (s) {
          return Number.isFinite(s.x) && Number.isFinite(s.y) &&
            (Number.isFinite(s.ndvi) || Number.isFinite(s.ndre) || Number.isFinite(s.ndmi));
        });
      })
      .finally(function () { clearTimeout(timeout); });
  }

  function avg(arr) {
    var valid = arr.filter(Number.isFinite);
    return valid.length ? valid.reduce(function (a, b) { return a + b; }, 0) / valid.length : null;
  }

  function computeStressScore(ndvi, ndre, ndmi) {
    var ndviNorm = Math.max(0, Math.min(1, (ndvi + 0.2) / 1.0));
    var ndreNorm = Math.max(0, Math.min(1, (ndre + 0.2) / 1.0));
    var ndmiNorm = Math.max(0, Math.min(1, (ndmi + 0.2) / 1.0));
    var healthScore = ndviNorm * 0.4 + ndreNorm * 0.3 + ndmiNorm * 0.3;
    return Math.round((1 - healthScore) * 100);
  }

  function classifyHealth(score) {
    if (score < 25) return { label: 'HEALTHY', color: '#22c55e', icon: '\u2705', bg: '#f0fdf4' };
    if (score < 50) return { label: 'MODERATE', color: '#eab308', icon: '\u26A0\uFE0F', bg: '#fefce8' };
    if (score < 75) return { label: 'STRESSED', color: '#f97316', icon: '\uD83D\uDD25', bg: '#fff7ed' };
    return { label: 'CRITICAL', color: '#dc2626', icon: '\u274C', bg: '#fef2f2' };
  }

  function classifyIndex(val, thresholds) {
    if (val === null) return { label: '-', color: '#94a3b8' };
    if (val >= thresholds[0]) return { label: 'Sangat Tinggi', color: '#15803d' };
    if (val >= thresholds[1]) return { label: 'Tinggi', color: '#22c55e' };
    if (val >= thresholds[2]) return { label: 'Sedang', color: '#eab308' };
    return { label: 'Rendah', color: '#dc2626' };
  }

  function computeTrend(current, previous) {
    if (previous === null || previous === undefined || !Number.isFinite(previous) || previous === 0) {
      return { arrow: '\u2192', text: 'N/A', color: '#94a3b8' };
    }
    var change = ((current - previous) / Math.abs(previous)) * 100;
    if (change > 5) return { arrow: '\u2191', text: '+' + change.toFixed(1) + '%', color: '#22c55e' };
    if (change < -5) return { arrow: '\u2193', text: change.toFixed(1) + '%', color: '#dc2626' };
    return { arrow: '\u2192', text: 'Stable', color: '#64748b' };
  }

  function conditionText(score) {
    if (score < 25) return 'Kondisi tanaman normal, pertumbuhan vegetasi baik.';
    if (score < 50) return 'Tanaman dalam kondisi cukup baik, perlu perhatian pada beberapa area.';
    if (score < 75) return 'Tanaman menunjukkan tanda stres. Perlu evaluasi irigasi dan nutrisi.';
    return 'Tanaman dalam kondisi kritis. Diperlukan tindakan segera.';
  }

  function computeVegetationScore(ndvi) {
    if (ndvi === null) return 0;
    return Math.round(Math.max(0, Math.min(100, (ndvi + 0.2) / 1.0 * 100)));
  }

  function computeWaterScore(ndwi) {
    if (ndwi === null) return 0;
    return Math.round(Math.max(0, Math.min(100, (ndwi + 1) / 2 * 100)));
  }

  function computeCropConditionScore(ndvi, ndre, ndmi) {
    var ndviN = Math.max(0, Math.min(1, (ndvi + 0.2) / 1.0));
    var ndreN = Math.max(0, Math.min(1, (ndre + 0.2) / 1.0));
    var ndmiN = Math.max(0, Math.min(1, (ndmi + 0.2) / 1.0));
    return Math.round((ndviN * 0.35 + ndreN * 0.25 + ndmiN * 0.25 + 0.15) * 100);
  }

  function computeDataConfidence(cloudPercent, sampleCount, imageDate) {
    var cloudScore = 0;
    if (Number.isFinite(cloudPercent)) {
      if (cloudPercent <= 10) cloudScore = 40;
      else if (cloudPercent <= 20) cloudScore = 30;
      else if (cloudPercent <= 30) cloudScore = 20;
      else if (cloudPercent <= 50) cloudScore = 10;
    } else {
      cloudScore = 20;
    }

    var sampleScore = 0;
    if (sampleCount >= 200) sampleScore = 30;
    else if (sampleCount >= 100) sampleScore = 25;
    else if (sampleCount >= 50) sampleScore = 15;
    else if (sampleCount >= 20) sampleScore = 5;

    var recencyScore = 0;
    if (imageDate && Number.isFinite(imageDate.getTime())) {
      var daysOld = (Date.now() - imageDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysOld <= 30) recencyScore = 20;
      else if (daysOld <= 60) recencyScore = 15;
      else if (daysOld <= 90) recencyScore = 10;
      else recencyScore = 5;
    } else {
      recencyScore = 10;
    }

    var total = cloudScore + sampleScore + recencyScore + 10;
    var level = total >= 80 ? 'HIGH' : total >= 60 ? 'MEDIUM' : 'LOW';
    return { score: Math.min(total, 100), level: level };
  }

  function detectConcerns(latest, timeSeries, cloudPercent, imageDate) {
    var concerns = [];

    if (Number.isFinite(cloudPercent) && cloudPercent > 30) {
      concerns.push({ severity: 'warning', text: 'Tutupan awan tinggi (' + cloudPercent.toFixed(1) + '%), hasil mungkin terpengaruh.' });
    }

    if (latest.ndvi !== null && latest.ndvi < 0.2) {
      concerns.push({ severity: 'critical', text: 'NDVI rendah (' + latest.ndvi.toFixed(2) + '), vegetasi tidak sehat.' });
    }

    if (latest.ndmi !== null && latest.ndmi < 0.1) {
      concerns.push({ severity: 'warning', text: 'Kelembaban rendah (' + latest.ndmi.toFixed(2) + '), potensi kekeringan.' });
    }

    if (latest.ndre !== null && latest.ndre < 0.2) {
      concerns.push({ severity: 'warning', text: 'Klorofil rendah (' + latest.ndre.toFixed(2) + '), pertumbuhan terhambat.' });
    }

    if (timeSeries && timeSeries.length >= 2) {
      var prev = timeSeries[timeSeries.length - 2];
      if (prev && prev.ndvi !== null && latest.ndvi !== null && prev.ndvi !== 0) {
        var trendPct = ((latest.ndvi - prev.ndvi) / Math.abs(prev.ndvi)) * 100;
        if (trendPct < -10) {
          concerns.push({ severity: 'critical', text: 'NDVI menurun ' + Math.abs(trendPct).toFixed(1) + '% dari bulan lalu.' });
        }
      }
    }

    if (imageDate && Number.isFinite(imageDate.getTime())) {
      var daysOld = (Date.now() - imageDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysOld > 60) {
        concerns.push({ severity: 'info', text: 'Citra terakhir ' + Math.round(daysOld) + ' hari lalu, data mungkin usang.' });
      }
    }

    return concerns;
  }

  function concernIcon(severity) {
    if (severity === 'critical') return '\u274C';
    if (severity === 'warning') return '\u26A0\uFE0F';
    return '\u2139\uFE0F';
  }

  function concernColor(severity) {
    if (severity === 'critical') return '#dc2626';
    if (severity === 'warning') return '#f59e0b';
    return '#3b82f6';
  }

  function confidenceColor(level) {
    if (level === 'HIGH') return '#22c55e';
    if (level === 'MEDIUM') return '#eab308';
    return '#dc2626';
  }

  function fetchImageDate(geometry) {
    var envelope = {
      xmin: Infinity, ymin: Infinity, xmax: -Infinity, ymax: -Infinity
    };
    geometry.rings.forEach(function (ring) {
      ring.forEach(function (c) {
        if (c[0] < envelope.xmin) envelope.xmin = c[0];
        if (c[0] > envelope.xmax) envelope.xmax = c[0];
        if (c[1] < envelope.ymin) envelope.ymin = c[1];
        if (c[1] > envelope.ymax) envelope.ymax = c[1];
      });
    });
    var now = Date.now();
    var thirtyDaysAgo = now - 30 * 24 * 3600 * 1000;
    var params = new URLSearchParams({
      f: 'json',
      where: '1=1',
      geometryType: 'esriGeometryEnvelope',
      geometry: JSON.stringify({
        xmin: envelope.xmin, ymin: envelope.ymin,
        xmax: envelope.xmax, ymax: envelope.ymax,
        spatialReference: { wkid: 102100 }
      }),
      inSR: '102100',
      outFields: 'acquisitiondate,cloudcover',
      returnGeometry: 'false',
      resultRecordCount: '1',
      orderByFields: 'acquisitiondate DESC'
    });
    return fetch(SENTINEL_CATALOG_URL + '?' + params)
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || !data.features || !data.features.length) return null;
        var attrs = data.features[0].attributes || {};
        return {
          date: attrs.acquisitiondate ? new Date(attrs.acquisitiondate) : null,
          cloud: attrs.cloudcover
        };
      })
      .catch(function () { return null; });
  }

  function fetchTimeSeries(geometry) {
    var now = new Date();
    var months = [];
    for (var i = 11; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      var monthStart = d.getTime();
      var monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime();
      months.push({
        label: d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }),
        start: monthStart,
        end: monthEnd
      });
    }

    var promises = months.map(function (m) {
      return fetchSamples(geometry, 50, m.start, m.end)
        .then(function (samples) {
          return {
            label: m.label,
            ndvi: avg(samples.map(function (s) { return s.ndvi; })),
            ndre: avg(samples.map(function (s) { return s.ndre; })),
            ndmi: avg(samples.map(function (s) { return s.ndmi; })),
            count: samples.length
          };
        })
        .catch(function () {
          return { label: m.label, ndvi: null, ndre: null, ndmi: null, count: 0 };
        });
    });

    return Promise.all(promises);
  }

  function renderChart(canvasId, timeSeries) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    var labels = timeSeries.map(function (d) { return d.label; });
    var ndviData = timeSeries.map(function (d) { return d.ndvi !== null ? Number(d.ndvi.toFixed(3)) : null; });
    var ndreData = timeSeries.map(function (d) { return d.ndre !== null ? Number(d.ndre.toFixed(3)) : null; });
    var ndmiData = timeSeries.map(function (d) { return d.ndmi !== null ? Number(d.ndmi.toFixed(3)) : null; });

    new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'NDVI',
            data: ndviData,
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34,197,94,0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 2,
            borderWidth: 2,
            spanGaps: true
          },
          {
            label: 'NDRE',
            data: ndreData,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.08)',
            fill: true,
            tension: 0.3,
            pointRadius: 2,
            borderWidth: 2,
            spanGaps: true
          },
          {
            label: 'NDMI',
            data: ndmiData,
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245,158,11,0.08)',
            fill: true,
            tension: 0.3,
            pointRadius: 2,
            borderWidth: 2,
            spanGaps: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { boxWidth: 10, font: { size: 9 }, padding: 6 }
          }
        },
        scales: {
          x: {
            ticks: { font: { size: 8 }, maxRotation: 45 },
            grid: { display: false }
          },
          y: {
            min: -0.2,
            max: 0.9,
            ticks: { font: { size: 8 }, stepSize: 0.2 },
            grid: { color: '#f1f5f9' }
          }
        }
      }
    });
  }

  function buildCardHtml(props, latest, timeSeries, sampleCount, imageData) {
    var ndviVal = latest.ndvi !== null ? latest.ndvi.toFixed(2) : '-';
    var ndreVal = latest.ndre !== null ? latest.ndre.toFixed(2) : '-';
    var ndmiVal = latest.ndmi !== null ? latest.ndmi.toFixed(2) : '-';

    var stressScore = computeStressScore(latest.ndvi, latest.ndre, latest.ndmi);
    var health = classifyHealth(stressScore);

    var prev = timeSeries.length >= 2 ? timeSeries[timeSeries.length - 2] : null;
    var ndviTrend = computeTrend(latest.ndvi, prev ? prev.ndvi : null);
    var ndreTrend = computeTrend(latest.ndre, prev ? prev.ndre : null);
    var ndmiTrend = computeTrend(latest.ndmi, prev ? prev.ndmi : null);

    var ndviClass = classifyIndex(latest.ndvi, [0.6, 0.4, 0.2]);
    var ndreClass = classifyIndex(latest.ndre, [0.5, 0.35, 0.2]);
    var ndmiClass = classifyIndex(latest.ndmi, [0.4, 0.25, 0.1]);

    var vegScore = computeVegetationScore(latest.ndvi);
    var waterScore = computeWaterScore(latest.ndwi);
    var cropScore = computeCropConditionScore(latest.ndvi, latest.ndre, latest.ndmi);

    var cloudPercent = imageData && imageData.cloud != null ? imageData.cloud : null;
    var imageDate = imageData && imageData.date ? imageData.date : null;
    var confidence = computeDataConfidence(cloudPercent, sampleCount || 0, imageDate);
    var concerns = detectConcerns(latest, timeSeries, cloudPercent, imageDate);

    var cropType = props.sawah_jenis || 'Padi';
    var areaHa = props.area_ha != null ? Number(props.area_ha).toFixed(2) : '-';
    var fieldId = props.admin_name || props.sawah_wadmkk || props.sawah_oid || 'F001';
    var chartId = 'cropChart_' + fieldId;

    var html = '';
    html += '<div class="crop-health-card">';

    html += '<div class="crop-health-header">';
    html += '<div class="crop-health-field-id">\uD83D\uDCCA Crop Health</div>';
    html += '<div class="crop-health-crop">' + fieldId + ' \u2022 ' + cropType + ' \u2022 ' + areaHa + ' ha</div>';
    html += '</div>';

    html += '<div class="crop-health-section">';
    html += '<div class="crop-health-section-title">CROP HEALTH</div>';
    html += '<div class="crop-health-status" style="background:' + health.bg + ';color:' + health.color + ';">';
    html += '<span>' + health.icon + '</span> <strong>' + health.label + '</strong>';
    html += '</div>';
    html += '<div class="crop-health-indices">';
    html += '<div class="crop-health-index-row">';
    html += '<span class="crop-health-idx-label">NDVI</span>';
    html += '<span class="crop-health-idx-value">' + ndviVal + '</span>';
    html += '<span class="crop-health-idx-tag" style="color:' + ndviClass.color + ';">' + ndviClass.label + '</span>';
    html += '</div>';
    html += '<div class="crop-health-index-row">';
    html += '<span class="crop-health-idx-label">NDRE</span>';
    html += '<span class="crop-health-idx-value">' + ndreVal + '</span>';
    html += '<span class="crop-health-idx-tag" style="color:' + ndreClass.color + ';">' + ndreClass.label + '</span>';
    html += '</div>';
    html += '<div class="crop-health-index-row">';
    html += '<span class="crop-health-idx-label">NDMI</span>';
    html += '<span class="crop-health-idx-value">' + ndmiVal + '</span>';
    html += '<span class="crop-health-idx-tag" style="color:' + ndmiClass.color + ';">' + ndmiClass.label + '</span>';
    html += '</div>';
    html += '</div></div>';

    html += '<div class="crop-health-section">';
    html += '<div class="crop-health-section-title">LAND COVER ANALYSIS</div>';
    html += '<div class="crop-health-indices">';
    html += '<div class="crop-health-index-row">';
    html += '<span class="crop-health-idx-label">Vegetation</span>';
    html += '<span class="crop-health-idx-value">' + vegScore + '</span>';
    html += '<span class="crop-health-idx-tag" style="color:' + (vegScore >= 50 ? '#22c55e' : '#dc2626') + ';">' + (vegScore >= 50 ? 'Good' : 'Low') + '</span>';
    html += '</div>';
    html += '<div class="crop-health-index-row">';
    html += '<span class="crop-health-idx-label">Water</span>';
    html += '<span class="crop-health-idx-value">' + waterScore + '</span>';
    html += '<span class="crop-health-idx-tag" style="color:' + (waterScore >= 30 ? '#3b82f6' : '#f59e0b') + ';">' + (waterScore >= 30 ? 'Adequate' : 'Low') + '</span>';
    html += '</div>';
    html += '<div class="crop-health-index-row">';
    html += '<span class="crop-health-idx-label">Crop Condition</span>';
    html += '<span class="crop-health-idx-value">' + cropScore + '</span>';
    html += '<span class="crop-health-idx-tag" style="color:' + (cropScore >= 50 ? '#22c55e' : '#dc2626') + ';">' + (cropScore >= 50 ? 'Good' : 'Poor') + '</span>';
    html += '</div>';
    html += '</div></div>';

    html += '<div class="crop-health-section">';
    html += '<div class="crop-health-section-title">DATA CONFIDENCE</div>';
    html += '<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">';
    html += '<span style="font-size:18px;font-weight:800;color:' + confidenceColor(confidence.level) + ';">' + confidence.score + '%</span>';
    html += '<span class="crop-health-status" style="background:' + confidenceColor(confidence.level) + '15;color:' + confidenceColor(confidence.level) + ';">' + confidence.level + '</span>';
    html += '</div></div>';

    if (concerns.length > 0) {
      html += '<div class="crop-health-section">';
      html += '<div class="crop-health-section-title">POTENTIAL CONCERN</div>';
      html += '<div class="crop-health-concerns">';
      concerns.forEach(function (c) {
        html += '<div class="crop-health-concern-row" style="color:' + concernColor(c.severity) + ';">';
        html += '<span>' + concernIcon(c.severity) + '</span>';
        html += '<span>' + c.text + '</span>';
        html += '</div>';
      });
      html += '</div></div>';
    }

    html += '<div class="crop-health-section">';
    html += '<div class="crop-health-section-title">TREND (vs bulan lalu)</div>';
    html += '<div class="crop-health-indices">';
    html += '<div class="crop-health-index-row">';
    html += '<span class="crop-health-idx-label">NDVI</span>';
    html += '<span class="crop-health-idx-value" style="color:' + ndviTrend.color + ';">' + ndviTrend.arrow + ' ' + ndviTrend.text + '</span>';
    html += '</div>';
    html += '<div class="crop-health-index-row">';
    html += '<span class="crop-health-idx-label">NDRE</span>';
    html += '<span class="crop-health-idx-value" style="color:' + ndreTrend.color + ';">' + ndreTrend.arrow + ' ' + ndreTrend.text + '</span>';
    html += '</div>';
    html += '<div class="crop-health-index-row">';
    html += '<span class="crop-health-idx-label">NDMI</span>';
    html += '<span class="crop-health-idx-value" style="color:' + ndmiTrend.color + ';">' + ndmiTrend.arrow + ' ' + ndmiTrend.text + '</span>';
    html += '</div>';
    html += '</div></div>';

    html += '<div class="crop-health-section">';
    html += '<div class="crop-health-section-title">STRESS</div>';
    html += '<div class="crop-health-stress">';
    html += '<div class="crop-health-stress-score">';
    html += '<span class="crop-health-stress-num">' + stressScore + '</span>';
    html += '<span class="crop-health-stress-of"> / 100</span>';
    html += '</div>';
    html += '<div class="crop-health-status" style="background:' + health.bg + ';color:' + health.color + ';">';
    html += '<span>' + health.icon + '</span> <strong>' + health.label + '</strong>';
    html += '</div>';
    html += '<div class="crop-health-condition">' + conditionText(stressScore) + '</div>';
    html += '</div></div>';

    html += '<div class="crop-health-section crop-health-chart-section">';
    html += '<div class="crop-health-section-title">NDVI / NDRE / NDMI</div>';
    html += '<div class="crop-health-chart-wrap">';
    html += '<canvas id="' + chartId + '"></canvas>';
    html += '</div></div>';

    html += '</div>';
    return { html: html, chartId: chartId };
  }

  function fetchCropHealth(polygon, props, cardElement) {
    var cacheKey = JSON.stringify(polygon.geometry ? polygon.geometry.coordinates : polygon.coordinates);
    if (healthCache[cacheKey]) {
      var cached = healthCache[cacheKey];
      var result = buildCardHtml(props, cached.latest, cached.timeSeries, cached.sampleCount, cached.imageData);
      cardElement.innerHTML = result.html;
      if (result.chartId) renderChart(result.chartId, cached.timeSeries);
      return;
    }

    var geometry = buildGeometry(polygon);
    if (!geometry) {
      cardElement.innerHTML = '<div style="padding:12px;color:#dc2626;font-size:11px;text-align:center;">Geometri tidak valid.</div>';
      return;
    }

    cardElement.innerHTML = '<div class="crop-health-loading"><span class="dem-spinner dark"></span> Memuat data kesehatan tanaman...</div>';

    Promise.all([
      fetchSamples(geometry, 100),
      fetchTimeSeries(geometry),
      fetchImageDate(geometry)
    ]).then(function (results) {
      var samples = results[0];
      var timeSeries = results[1];
      var imageData = results[2];

      var latest = {
        ndvi: avg(samples.map(function (s) { return s.ndvi; })),
        ndre: avg(samples.map(function (s) { return s.ndre; })),
        ndmi: avg(samples.map(function (s) { return s.ndmi; })),
        ndwi: avg(samples.map(function (s) { return s.ndwi; }))
      };

      healthCache[cacheKey] = { latest: latest, timeSeries: timeSeries, sampleCount: samples.length, imageData: imageData };

      var result = buildCardHtml(props, latest, timeSeries, samples.length, imageData);
      cardElement.innerHTML = result.html;

      if (imageData && imageData.date) {
        var dateStr = imageData.date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
        var cloudStr = imageData.cloud != null ? imageData.cloud.toFixed(1) + '%' : '-';
        var metaDiv = document.createElement('div');
        metaDiv.className = 'crop-health-meta';
        metaDiv.innerHTML = '\uD83D\uDCF7 Citra: ' + dateStr + ' \u00B7 Cloud: ' + cloudStr;
        cardElement.appendChild(metaDiv);
      }

      if (result.chartId) {
        setTimeout(function () { renderChart(result.chartId, timeSeries); }, 100);
      }
    }).catch(function (err) {
      console.warn('[CropHealth] Error:', err.message);
      cardElement.innerHTML = '<div class="crop-health-loading" style="color:#dc2626;">Gagal memuat data: ' + (err.message || 'Unknown error') + '</div>';
    });
  }

  window.fetchCropHealth = fetchCropHealth;
})();
