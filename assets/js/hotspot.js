(function () {
  'use strict';

  var HOTSPOT_API = 'https://opsroom.sipongidata.my.id/api/opsroom/indoHotspot?wilayah=IN&filterperiode=false&from=&to=&late=24&satelit[]=NASA-MODIS&satelit[]=NASA-SNPP&satelit[]=NASA-NOAA20&confidence[]=low&confidence[]=medium&confidence[]=high&provinsi=&kabkota=';

  var heatmapLayer = null;
  var hotspotMarkerGroup = null;
  var hotspotLegendControl = null;
  var hotspotDataLoaded = false;
  var hotspotFeatures = [];

  function getConfidenceColor(level) {
    if (level === 'high') return '#dc2626';
    if (level === 'medium') return '#f59e0b';
    return '#22c55e';
  }

  function getConfidenceIntensity(level) {
    if (level === 'high') return 1.0;
    if (level === 'medium') return 0.6;
    return 0.3;
  }

  function fetchHotspotData(callback) {
    fetch(HOTSPOT_API)
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function (json) { callback(null, json); })
      .catch(function (e) { callback(e, null); });
  }

  function loadHotspotData(callback) {
    if (hotspotDataLoaded) { callback(true); return; }
    fetchHotspotData(function (err, geojson) {
      if (err || !geojson || !geojson.features) {
        console.error('[Hotspot] Gagal fetch:', err);
        callback(false);
        return;
      }
      hotspotFeatures = geojson.features;
      hotspotDataLoaded = true;
      callback(true);
    });
  }

  function createHotspotLegend(totalCount, high, medium, low) {
    if (hotspotLegendControl) {
      map.removeControl(hotspotLegendControl);
      hotspotLegendControl = null;
    }

    var LegendControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        var div = L.DomUtil.create('div', 'hotspot-legend');
        L.DomEvent.disableClickPropagation(div);

        div.innerHTML =
          '<div class="hotspot-legend-title">Hotspot Karhutla (24 Jam)</div>' +
          '<div class="hotspot-legend-total">' + totalCount.toLocaleString('id-ID') + ' titik aktif</div>' +
          '<div class="hotspot-legend-gradient">' +
            '<div class="hotspot-legend-bar"></div>' +
            '<div class="hotspot-legend-labels">' +
              '<span>Low</span><span>Medium</span><span>High</span>' +
            '</div>' +
          '</div>' +
          '<div class="hotspot-legend-items">' +
            '<div class="hotspot-legend-item">' +
              '<span class="hotspot-legend-dot" style="background:#dc2626;"></span>' +
              '<span>High (' + high + ')</span>' +
            '</div>' +
            '<div class="hotspot-legend-item">' +
              '<span class="hotspot-legend-dot" style="background:#f59e0b;"></span>' +
              '<span>Medium (' + medium + ')</span>' +
            '</div>' +
            '<div class="hotspot-legend-item">' +
              '<span class="hotspot-legend-dot" style="background:#22c55e;"></span>' +
              '<span>Low (' + low + ')</span>' +
            '</div>' +
          '</div>' +
          '<div class="hotspot-legend-source">Sumber: BNPB / Sipongi</div>';

        return div;
      }
    });

    hotspotLegendControl = new LegendControl();
    hotspotLegendControl.addTo(map);
  }

  function removeHotspotLegend() {
    if (hotspotLegendControl) {
      map.removeControl(hotspotLegendControl);
      hotspotLegendControl = null;
    }
  }

  function showHotspotLayer() {
    loadHotspotData(function (ok) {
      if (!ok || !hotspotFeatures.length) {
        console.error('[Hotspot] Tidak ada data');
        return;
      }

      var high = 0, medium = 0, low = 0;
      var latlngs = [];

      for (var i = 0; i < hotspotFeatures.length; i++) {
        var p = hotspotFeatures[i].properties;
        if (p.lat == null || p.long == null) continue;

        if (p.confidence_level === 'high') high++;
        else if (p.confidence_level === 'medium') medium++;
        else low++;

        latlngs.push([p.lat, p.long, getConfidenceIntensity(p.confidence_level)]);
      }

      heatmapLayer = L.heatLayer(latlngs, {
        radius: 20,
        blur: 15,
        maxZoom: 17,
        max: 1.0,
        gradient: {
          0.2: '#22c55e',
          0.4: '#84cc16',
          0.6: '#f59e0b',
          0.8: '#ef4444',
          1.0: '#dc2626'
        },
        minOpacity: 0.4
      }).addTo(map);

      hotspotMarkerGroup = L.layerGroup();

      for (var j = 0; j < hotspotFeatures.length; j++) {
        var f = hotspotFeatures[j];
        var pp = f.properties;
        if (pp.lat == null || pp.long == null) continue;

        var color = getConfidenceColor(pp.confidence_level);
        var confPct = pp.confidence != null ? pp.confidence + '%' : '-';

        var marker = L.circleMarker([pp.lat, pp.long], {
          radius: 4,
          fillColor: color,
          color: '#fff',
          weight: 1,
          opacity: 0.9,
          fillOpacity: 0.85
        });

        var popupHtml =
          '<div style="font-family:system-ui,-apple-system,sans-serif;min-width:200px;">' +
            '<div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:6px;">Hotspot Karhutla</div>' +
            '<div style="font-size:11px;color:#475569;line-height:1.6;">' +
              '<div><b>' + (pp.desa || '-') + '</b>, ' + (pp.kecamatan || '-') + '</div>' +
              '<div>' + (pp.kabkota || '-') + ', ' + (pp.nama_provinsi || '-') + '</div>' +
              '<div style="margin-top:4px;">' + (pp.sumber || '-') +
                ' | <span style="color:' + color + ';font-weight:700;">' +
                (pp.confidence_level || '-') + ' (' + confPct + ')</span>' +
              '</div>' +
              '<div>' + (pp.date_hotspot || '-') + '</div>' +
            '</div>' +
            '<div style="margin-top:6px;padding-top:6px;border-top:1px solid #e5e7eb;">' +
              '<a href="' + (pp.route_create || '#') + '" target="_blank" ' +
              'style="font-size:10px;color:#0891b2;text-decoration:none;font-weight:600;">' +
              'Laporkan Ground Check</a>' +
            '</div>' +
          '</div>';

        marker.bindPopup(popupHtml, { maxWidth: 280, className: 'hotspot-popup' });
        hotspotMarkerGroup.addLayer(marker);
      }

      hotspotMarkerGroup.addTo(map);

      var eyeBtn = document.getElementById('toggleHotspotMarkers');
      if (eyeBtn) {
        eyeBtn.style.display = 'flex';
        eyeBtn.classList.remove('markers-hidden');
        eyeBtn.title = 'Sembunyikan marker';
      }

      createHotspotLegend(hotspotFeatures.length, high, medium, low);
    });
  }

  function hideHotspotLayer() {
    if (heatmapLayer) {
      map.removeLayer(heatmapLayer);
      heatmapLayer = null;
    }
    if (hotspotMarkerGroup) {
      map.removeLayer(hotspotMarkerGroup);
      hotspotMarkerGroup = null;
    }
    removeHotspotLegend();
    var eyeBtn = document.getElementById('toggleHotspotMarkers');
    if (eyeBtn) {
      eyeBtn.style.display = 'none';
      eyeBtn.classList.remove('markers-hidden');
    }
  }

  function toggleHotspotMarkers() {
    if (!hotspotMarkerGroup) return;
    var eyeBtn = document.getElementById('toggleHotspotMarkers');
    if (map.hasLayer(hotspotMarkerGroup)) {
      map.removeLayer(hotspotMarkerGroup);
      if (eyeBtn) {
        eyeBtn.classList.add('markers-hidden');
        eyeBtn.title = 'Tampilkan marker';
      }
    } else {
      hotspotMarkerGroup.addTo(map);
      if (eyeBtn) {
        eyeBtn.classList.remove('markers-hidden');
        eyeBtn.title = 'Sembunyikan marker';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var checkbox = document.getElementById('toggleHotspotLayer');
    if (checkbox) {
      checkbox.addEventListener('change', function () {
        if (this.checked) {
          showHotspotLayer();
        } else {
          hideHotspotLayer();
        }
      });
    }

    var eyeBtn = document.getElementById('toggleHotspotMarkers');
    if (eyeBtn) {
      eyeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleHotspotMarkers();
      });
    }
  });

  window.showHotspotLayer = showHotspotLayer;
  window.hideHotspotLayer = hideHotspotLayer;
})();
