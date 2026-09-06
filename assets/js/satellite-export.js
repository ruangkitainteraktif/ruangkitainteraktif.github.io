/* ── Satellite Imagery Export (PNG) ── */
(function () {
  'use strict';

  function getExportDimensions() {
    var isMobile = window.innerWidth < 768;
    if (isMobile) {
      return { w: 2100, h: 2970, headerH: 60, footerH: 50 };
    }
    return { w: 2970, h: 2100, headerH: 70, footerH: 60 };
  }
  var MAP_PAD = 30;

  /* ── Legend data per basemap ── */
  var LEGENDS = {
    'bmkg-himawari': {
      title: 'Suhu Puncak Awan',
      unit: 'IR 10.4\u00B5m \u2014 BMKG',
      gradient: [
        [0.0, [123, 0, 81]],
        [0.2, [215, 48, 39]],
        [0.4, [247, 127, 0]],
        [0.6, [246, 215, 67]],
        [0.8, [26, 147, 111]],
        [1.0, [22, 33, 62]]
      ],
      labels: ['-80\u00B0C', '-60\u00B0C', '-40\u00B0C', '-20\u00B0C', '0\u00B0C', '20\u00B0C']
    },
    'bmkg-himawari-fd': {
      title: 'Suhu Puncak Awan',
      unit: 'IR 10.4\u00B5m \u2014 BMKG',
      gradient: [
        [0.0, [123, 0, 81]],
        [0.2, [215, 48, 39]],
        [0.4, [247, 127, 0]],
        [0.6, [246, 215, 67]],
        [0.8, [26, 147, 111]],
        [1.0, [22, 33, 62]]
      ],
      labels: ['-80\u00B0C', '-60\u00B0C', '-40\u00B0C', '-20\u00B0C', '0\u00B0C', '20\u00B0C']
    },
    'bmkg-himawari-hires': {
      title: 'Visible (0.64\u00B5m)',
      unit: '500m \u2014 BMKG',
      gradient: [
        [0.0, [0, 0, 0]],
        [1.0, [255, 255, 255]]
      ],
      labels: ['Gelap', 'Cerah']
    },
    'bmkg-gk2a': {
      title: 'Suhu Puncak Awan',
      unit: 'IR 10.4\u00B5m \u2014 BMKG GK-2A',
      gradient: [
        [0.0, [123, 0, 81]],
        [0.2, [215, 48, 39]],
        [0.4, [247, 127, 0]],
        [0.6, [246, 215, 67]],
        [0.8, [26, 147, 111]],
        [1.0, [22, 33, 62]]
      ],
      labels: ['-80\u00B0C', '-60\u00B0C', '-40\u00B0C', '-20\u00B0C', '0\u00B0C', '20\u00B0C']
    },
    'bmkg-gk2a-wv': {
      title: 'Uap Air (Water Vapor)',
      unit: 'WV 6.3\u00B5m \u2014 BMKG GK-2A',
      gradient: [
        [0.0, [26, 26, 46]],
        [0.25, [22, 33, 62]],
        [0.5, [15, 52, 96]],
        [0.75, [26, 147, 111]],
        [1.0, [255, 255, 255]]
      ],
      labels: ['Kering', '', 'Lembab', '', 'Sangat Lembab']
    },
    's5p-cloud-fraction': {
      title: 'Cloud Fraction',
      unit: 'Unit: fraction (0\u20131) \u2014 S5P-PAL',
      gradient: [
        [0.0, [30, 60, 120]],
        [0.5, [240, 200, 40]],
        [1.0, [255, 60, 40]]
      ],
      labels: ['0', '0.25', '0.5', '0.75', '1']
    },
    's5p-no2-tropo': {
      title: 'NO\u2082 Tropospheric',
      unit: 'mol/cm\u00B2 \u2014 S5P-PAL',
      gradient: [
        [0.0, [20, 20, 80]],
        [0.25, [60, 120, 200]],
        [0.5, [240, 200, 40]],
        [0.75, [240, 80, 20]],
        [1.0, [160, 20, 40]]
      ],
      labels: ['0', '45', '90', '135', '180']
    },
    's5p-ch4': {
      title: 'CH\u2084 Column',
      unit: 'ppb \u2014 S5P-PAL',
      gradient: [
        [0.0, [20, 100, 60]],
        [0.5, [200, 200, 40]],
        [1.0, [200, 60, 20]]
      ],
      labels: ['1800', '1850', '1900', '1950', '2000']
    },
    's5p-hcho': {
      title: 'HCHO Column Density',
      unit: 'mol/cm\u00B2 \u2014 S5P-PAL',
      gradient: [
        [0.0, [20, 20, 80]],
        [0.5, [240, 200, 40]],
        [1.0, [200, 40, 20]]
      ],
      labels: ['0', '0.005', '0.01', '0.015', '0.02']
    },
    's5p-co': {
      title: 'CO Column Density',
      unit: 'mol/m\u00B2 \u2014 S5P-PAL',
      gradient: [
        [0.0, [20, 20, 80]],
        [0.5, [60, 160, 200]],
        [1.0, [200, 60, 20]]
      ],
      labels: ['0', '0.025', '0.05', '0.075', '0.1']
    },
    's5p-so2': {
      title: 'SO\u2082 Column Density',
      unit: 'DU \u2014 S5P-PAL',
      gradient: [
        [0.0, [20, 20, 80]],
        [0.5, [240, 200, 40]],
        [1.0, [200, 40, 20]]
      ],
      labels: ['0', '0.25', '0.5', '0.75', '1']
    },
    's5p-o3': {
      title: 'O\u2083 Column Density',
      unit: 'DU \u2014 S5P-PAL',
      gradient: [
        [0.0, [20, 20, 80]],
        [0.5, [100, 180, 220]],
        [1.0, [200, 60, 20]]
      ],
      labels: ['0', '0.1', '0.2', '0.3', '0.4']
    },
    'noaa-goes-ir': {
      title: 'GOES IR Enhanced',
      unit: 'Infrared \u2014 NOAA',
      gradient: [
        [0.0, [123, 0, 81]],
        [0.2, [215, 48, 39]],
        [0.4, [247, 127, 0]],
        [0.6, [246, 215, 67]],
        [0.8, [26, 147, 111]],
        [1.0, [22, 33, 62]]
      ],
      labels: ['-80\u00B0C', '-60\u00B0C', '-40\u00B0C', '-20\u00B0C', '0\u00B0C', '20\u00B0C']
    }
  };

  /* ── Helpers ── */
  function formatDateNow() {
    var d = new Date();
    var months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatCoord(val, isLat) {
    var abs = Math.abs(val);
    var dir = isLat ? (val < 0 ? 'S' : 'N') : (val < 0 ? 'W' : 'E');
    return abs.toFixed(0) + '\u00B0' + dir;
  }

  function getGridInterval(zoom) {
    if (zoom < 6) return 5;
    if (zoom <= 8) return 2;
    return 1;
  }

  function interpolateColor(stops, t) {
    t = Math.max(0, Math.min(1, t));
    for (var i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i][0] && t <= stops[i + 1][0]) {
        var range = stops[i + 1][0] - stops[i][0];
        var local = range === 0 ? 0 : (t - stops[i][0]) / range;
        var c0 = stops[i][1], c1 = stops[i + 1][1];
        return [
          Math.round(c0[0] + (c1[0] - c0[0]) * local),
          Math.round(c0[1] + (c1[1] - c0[1]) * local),
          Math.round(c0[2] + (c1[2] - c0[2]) * local)
        ];
      }
    }
    return stops[stops.length - 1][1];
  }

  /* ── Draw functions ── */
  function drawHeader(ctx, title, w, headerH) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, headerH);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 28px "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 40, headerH / 2 - 6);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatDateNow(), w - 40, headerH / 2 - 10);
    ctx.fillText('WGS84 / EPSG:4326', w - 40, headerH / 2 + 12);
    ctx.textAlign = 'left';

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerH);
    ctx.lineTo(w, headerH);
    ctx.stroke();
  }

  function drawFooter(ctx, source, w, h, footerH) {
    var y = h - footerH;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, y, w, footerH);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '14px "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('Sumber: ' + source, 40, y + footerH / 2);
    ctx.textAlign = 'right';
    ctx.fillText('Ruang Kita Interaktif', w - 40, y + footerH / 2);
    ctx.textAlign = 'left';
  }

  function drawScaleBar(ctx, mapBounds, mapX, mapY, mapW, mapH) {
    var centerLat = (mapBounds.getNorth() + mapBounds.getSouth()) / 2;
    var lngDist = mapBounds.getEast() - mapBounds.getWest();
    var metersPerDeg = 111320 * Math.cos(centerLat * Math.PI / 180);
    var totalMeters = lngDist * metersPerDeg;
    var pxPerMeter = mapW / totalMeters;

    var targetPx = 180;
    var targetMeters = targetPx / pxPerMeter;
    var niceValues = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000];
    var best = niceValues[0];
    for (var i = 0; i < niceValues.length; i++) {
      if (Math.abs(niceValues[i] - targetMeters) < Math.abs(best - targetMeters)) best = niceValues[i];
    }
    var barPx = best * pxPerMeter;

    var bx = mapX + 20;
    var by = mapY + mapH - 25;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + barPx, by);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(bx, by - 5);
    ctx.lineTo(bx, by + 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx + barPx, by - 5);
    ctx.lineTo(bx + barPx, by + 5);
    ctx.stroke();

    var label;
    if (best >= 1000000) label = (best / 1000000) + ' km';
    else if (best >= 1000) label = (best / 1000) + ' km';
    else label = best + ' m';

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 3;
    ctx.fillText(label, bx + barPx / 2, by + 8);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function drawNorthArrow(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = 'rgba(15,23,42,0.7)';
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(-5, 4);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.lineTo(5, -2);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, -22);

    ctx.restore();
  }

  function drawGrid(ctx, mapBounds, mapX, mapY, mapW, mapH, zoom) {
    var interval = getGridInterval(zoom);
    var west = mapBounds.getWest();
    var east = mapBounds.getEast();
    var south = mapBounds.getSouth();
    var north = mapBounds.getNorth();

    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '13px "Segoe UI", system-ui, sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 3;

    var lonStart = Math.ceil(west / interval) * interval;
    for (var lon = lonStart; lon <= east; lon += interval) {
      var px = mapX + ((lon - west) / (east - west)) * mapW;
      ctx.beginPath();
      ctx.moveTo(px, mapY);
      ctx.lineTo(px, mapY + mapH);
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(px - 20, mapY, 40, 18);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(formatCoord(lon, false), px, mapY + 3);
    }

    var latStart = Math.ceil(south / interval) * interval;
    for (var lat = latStart; lat <= north; lat += interval) {
      var py = mapY + mapH - ((lat - south) / (north - south)) * mapH;
      ctx.beginPath();
      ctx.moveTo(mapX, py);
      ctx.lineTo(mapX + mapW, py);
      ctx.stroke();
      var latLabel = formatCoord(lat, true);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(mapX + 2, py - 9, ctx.measureText(latLabel).width + 10, 18);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(latLabel, mapX + 7, py);
    }

    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function drawLegend(ctx, key, x, y) {
    var data = LEGENDS[key];
    if (!data) return;

    var barW = 400;
    var barH = 30;
    var gap = 6;

    for (var i = 0; i < barW; i++) {
      var t = i / barW;
      var c = interpolateColor(data.gradient, t);
      ctx.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
      ctx.fillRect(x + i, y, 1, barH);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, barW, barH);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '14px "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = 'top';
    var labels = data.labels;
    for (var j = 0; j < labels.length; j++) {
      var lx = x + (j / (labels.length - 1)) * barW;
      ctx.textAlign = (j === 0) ? 'left' : (j === labels.length - 1) ? 'right' : 'center';
      var offset = (j === 0) ? 0 : (j === labels.length - 1) ? 0 : 0;
      ctx.fillText(labels[j], lx + offset, y + barH + gap);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* ── Indonesia extent ── */
  var ID_EXTENT = L.latLngBounds([-9, 98], [5, 140]);
  var prevZoom = null;
  var prevCenter = null;

  /* ── Main export ── */
  async function exportImage() {
    var btn = document.querySelector('.sat-export-btn');
    if (btn) { btn.disabled = true; btn.classList.add('sat-export-active'); }

    var overlay = document.createElement('div');
    overlay.className = 'sat-export-overlay';
    overlay.innerHTML = '<div class="sat-export-box"><div class="sat-export-spinner"></div><div class="sat-export-text">Mengekspor citra satelit\u2026</div></div>';
    document.body.appendChild(overlay);
    overlay.style.display = 'flex';

    var hiddenEls = [];

    try {
      prevZoom = map.getZoom();
      prevCenter = map.getCenter();

      var selectors = [
        '.sat-export-btn', '.geoportal-print-btn', '.reset-layers-btn',
        '.basemap-control-wrap', '.leaflet-control-zoom', '.leaflet-control-locate',
        '.unified-search', '.leaflet-control-scale', '.detail-panel-btn',
        '#detail-panel', '.map-insight-cards', '.quick-layer-bar',
        '.geoid-marker-wrap', '.leaflet-control-mouse-position',
        '.wind-legend', '.himawari-legend', '.s5p-legend', '.maritime-legend',
        '.leaflet-control-legend', '.legend-wrap',
        '.bmkg-time-slider-wrap', '.bmkg-ts-title', '.bmkg-ts-controls',
        '.bmkg-ts-info', '.bmkg-ts-slider-wrap',
        '.draw-fab-wrap'
      ];
      selectors.forEach(function (sel) {
        document.querySelectorAll(sel).forEach(function (el) {
          if (el && getComputedStyle(el).display !== 'none') {
            var prev = el.style.display;
            el.style.setProperty('display', 'none', 'important');
            hiddenEls.push({ el: el, prev: prev });
          }
        });
      });

      map.flyToBounds(ID_EXTENT, { animate: false, duration: 0, padding: [20, 20] });
      await new Promise(function (r) { setTimeout(r, 800); });

      var tries = 0;
      while (tries < 30) {
        var loading = false;
        map.eachLayer(function (l) {
          if (l._loading) loading = true;
        });
        if (!loading) break;
        await new Promise(function (r) { setTimeout(r, 200); });
        tries++;
      }
      await new Promise(function (r) { setTimeout(r, 600); });

      map.invalidateSize();
      await new Promise(function (r) { setTimeout(r, 300); });

      var dim = getExportDimensions();
      var EXPORT_W = dim.w;
      var EXPORT_H = dim.h;
      var HEADER_H = dim.headerH;
      var FOOTER_H = dim.footerH;

      var leafletContainer = document.querySelector('.leaflet-container');
      var mapCanvas = await html2canvas(leafletContainer, {
        useCORS: true,
        allowTaint: false,
        scale: 2,
        logging: false,
        backgroundColor: '#1a1a2e'
      });

      var canvas = document.createElement('canvas');
      canvas.width = EXPORT_W;
      canvas.height = EXPORT_H;
      var ctx = canvas.getContext('2d');

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, EXPORT_W, EXPORT_H);

      var mapX = 0;
      var mapY = HEADER_H;
      var mapW = EXPORT_W;
      var mapH = EXPORT_H - HEADER_H - FOOTER_H;

      var canvasAspect = mapCanvas.width / mapCanvas.height;
      var frameAspect = mapW / mapH;
      var sx, sy, sw, sh;
      if (canvasAspect > frameAspect) {
        sh = mapCanvas.height;
        sw = sh * frameAspect;
        sx = (mapCanvas.width - sw) / 2;
        sy = 0;
      } else {
        sw = mapCanvas.width;
        sh = sw / frameAspect;
        sx = 0;
        sy = (mapCanvas.height - sh) / 2;
      }

      ctx.drawImage(mapCanvas, sx, sy, sw, sh, mapX, mapY, mapW, mapH);

      var mCX = mapX + mapW / 2;
      var mCY = mapY + mapH / 2;
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 64px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('PREVIEW', mCX, mCY - 50);
      ctx.font = 'bold 44px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('RUANGKITA PRO', mCX, mCY + 10);
      ctx.font = '20px "Segoe UI", system-ui, sans-serif';
      ctx.fillText('ruangkita.net', mCX, mCY + 44);
      ctx.restore();

      var mapBounds = map.getBounds();
      var zoom = map.getZoom();
      drawGrid(ctx, mapBounds, mapX, mapY, mapW, mapH, zoom);

      var currentName = (typeof currentBasemapName !== 'undefined') ? currentBasemapName : '';
      var labels = (typeof satelliteBasemapLabels !== 'undefined') ? satelliteBasemapLabels : {};
      var title = labels[currentName] || currentName || 'Satellite Imagery';
      drawHeader(ctx, title, EXPORT_W, HEADER_H);
      drawFooter(ctx, 'BMKG / ESA / NASA / Esri', EXPORT_W, EXPORT_H, FOOTER_H);

      drawNorthArrow(ctx, mapX + mapW - 30, mapY + mapH - 30);

      var legendKey = currentName;
      if (!LEGENDS[legendKey] && typeof satelliteBasemapLabels !== 'undefined') {
        legendKey = currentName;
      }
      if (LEGENDS[legendKey]) {
        var legendBarW = 400;
        var legendX = (EXPORT_W - legendBarW) / 2;
        var legendY = EXPORT_H - FOOTER_H - 60;
        drawLegend(ctx, legendKey, legendX, legendY);
      }

      canvas.toBlob(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        a.download = 'ruangkita-' + currentName + '-' + dateStr + '.png';
        a.href = url;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/png');

      map.flyTo(prevCenter, prevZoom, { animate: false, duration: 0 });

    } catch (err) {
      console.error('[SatelliteExport] Error:', err);
      alert('Gagal export citra satelit: ' + err.message);
    } finally {
      hiddenEls.forEach(function (item) {
        item.el.style.display = item.prev || '';
      });
      if (btn) { btn.disabled = false; btn.classList.remove('sat-export-active'); }
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
  }

  /* ── Leaflet Control ── */
  var _exportBtn = null;

  var SatExportControl = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd: function () {
      var btn = L.DomUtil.create('button', 'sat-export-btn');
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
      btn.title = 'Export citra satelit (PNG)';
      btn.setAttribute('aria-label', 'Export citra satelit');
      btn.style.display = 'none';
      L.DomEvent.disableClickPropagation(btn);
      L.DomEvent.disableScrollPropagation(btn);
      btn.addEventListener('click', exportImage);
      _exportBtn = btn;
      return btn;
    }
  });

  function isSatelliteBasemap(name) {
    return typeof satelliteBasemapLabels !== 'undefined' && satelliteBasemapLabels.hasOwnProperty(name);
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (typeof map !== 'undefined') {
      new SatExportControl().addTo(map);
      map.on('basemapchanged', function (e) {
        if (_exportBtn) {
          _exportBtn.style.display = isSatelliteBasemap(e.basemap) ? '' : 'none';
        }
      });
    }
  });

  window.SatelliteExport = { exportImage: exportImage };
  window.SATELLITE_LEGENDS = LEGENDS;

})();
