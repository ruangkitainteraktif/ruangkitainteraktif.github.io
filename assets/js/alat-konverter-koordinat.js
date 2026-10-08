/* Konverter koordinat GPS untuk sheet Alat. */
(function () {
  'use strict';
  var coordinateLayer = null;
  var coordinateMarker = null;
  var geocodeRequestId = 0;

  function init() {
    var coordInput = document.getElementById('dmCoordInput');
    var results = document.getElementById('dmCoordResults');
    var status = document.getElementById('dmCoordStatus');
    var copyButton = document.getElementById('dmCoordCopy');
    var shareButton = document.getElementById('dmCoordShare');
    var inputFormatSelect = document.getElementById('dmCoordInputFormat');
    var formatSelect = document.getElementById('dmCoordFormat');
    var inputPlaceholders = {
      dd: '-7.470000, 112.650000',
      dms: '7° 28′ 12″ S, 112° 39′ 0″ E',
      dmm: '7° 28.2000′ S, 112° 39.0000′ E',
      utm: '49S, 760000, 9170000'
    };
    var lastText = '';
    if (!coordInput || !results) return;

    function dms(value, latitude, decimalMinutes) {
      var direction = latitude ? (value < 0 ? 'S' : 'N') : (value < 0 ? 'W' : 'E');
      var absolute = Math.abs(value);
      var degrees = Math.floor(absolute);
      var minutesRaw = (absolute - degrees) * 60;
      if (decimalMinutes) return degrees + '° ' + minutesRaw.toFixed(4) + "' " + direction;
      var minutes = Math.floor(minutesRaw);
      var seconds = ((minutesRaw - minutes) * 60).toFixed(2);
      if (Number(seconds) >= 60) { seconds = '0.00'; minutes += 1; }
      if (minutes >= 60) { minutes = 0; degrees += 1; }
      return degrees + '° ' + minutes + "' " + seconds + '" ' + direction;
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
      });
    }

    function parsePair(text, inputFormat) {
      if (inputFormat === 'utm') {
        var utm = text.trim().match(/^(\d{1,2})\s*([NS])\s*[,;\s]+([\d.]+)\s*[,;\s]+([\d.]+)$/i);
        if (!utm || typeof window.proj4 !== 'function') return null;
        var zone = Number(utm[1]);
        if (zone < 1 || zone > 60) return null;
        var epsg = (utm[2].toUpperCase() === 'N' ? 'EPSG:326' : 'EPSG:327') + String(zone).padStart(2, '0');
        try {
          var lonLat = window.proj4(epsg, 'EPSG:4326', [Number(utm[3]), Number(utm[4])]);
          return { lat: lonLat[1], lon: lonLat[0] };
        } catch (_) { return null; }
      }

      var pair = text.trim().split(/\s*,\s*|\s*;\s*/);
      if (inputFormat === 'dd' && pair.length !== 2) pair = text.trim().split(/\s+/);
      if (pair.length !== 2) return null;
      if (inputFormat === 'dd') {
        var decimalLat = Number(pair[0]);
        var decimalLon = Number(pair[1]);
        return Number.isFinite(decimalLat) && Number.isFinite(decimalLon) ? { lat: decimalLat, lon: decimalLon } : null;
      }

      function parseAngle(source, isLatitude) {
        var direction = source.match(/[NSEW]/i);
        var nums = source.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)/g);
        var required = inputFormat === 'dms' ? 3 : 2;
        if (!nums || nums.length < required) return NaN;
        var deg = Number(nums[0]);
        var min = Number(nums[1]);
        var sec = inputFormat === 'dms' ? Number(nums[2]) : 0;
        if (!Number.isFinite(deg) || !Number.isFinite(min) || !Number.isFinite(sec) || min >= 60 || sec >= 60 || min < 0 || sec < 0) return NaN;
        var result = Math.abs(deg) + min / 60 + sec / 3600;
        var dir = direction && direction[0].toUpperCase();
        if (dir) {
          if ((isLatitude && !/[NS]/.test(dir)) || (!isLatitude && !/[EW]/.test(dir))) return NaN;
          if (dir === 'S' || dir === 'W') result *= -1;
        } else if (deg < 0) result *= -1;
        return result;
      }
      return { lat: parseAngle(pair[0], true), lon: parseAngle(pair[1], false) };
    }

    async function reverseGeocode(lat, lon, requestId) {
      try {
        var url = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=pjson&featureTypes=&location=' + encodeURIComponent(lon + ',' + lat);
        var response = await fetch(url);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        var data = await response.json();
        var address = data && data.address && (data.address.Match_addr || data.address.LongLabel);
        if (!address) throw new Error('Alamat tidak ditemukan');
        if (requestId !== geocodeRequestId) return;
        var addressValue = document.querySelector('#dmCoordAddress strong');
        if (addressValue) addressValue.textContent = address;
        lastText += '\nAlamat: ' + address;
        if (coordinateMarker) coordinateMarker.setPopupContent('<strong>Lokasi hasil konversi</strong><br>Latitude: ' + lat.toFixed(6) + '<br>Longitude: ' + lon.toFixed(6) + '<br>Alamat: ' + escapeHtml(address));
      } catch (_) {
        if (requestId !== geocodeRequestId) return;
        var addressValue = document.querySelector('#dmCoordAddress strong');
        if (addressValue) addressValue.textContent = 'Alamat tidak tersedia.';
      }
    }

    function convert() {
      var parsed = parsePair(coordInput.value, inputFormatSelect.value);
      var lat = parsed ? parsed.lat : NaN;
      var lon = parsed ? parsed.lon : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        status.textContent = 'Koordinat tidak sesuai format input yang dipilih. Periksa contoh pada kolom koordinat.';
        results.innerHTML = '';
        copyButton.disabled = shareButton.disabled = true;
        lastText = '';
        return;
      }
      var format = formatSelect.value;
      var label = '';
      var value = '';
      if (format === 'dd') {
        label = 'DD — Derajat desimal';
        value = lat.toFixed(6) + ', ' + lon.toFixed(6);
      } else if (format === 'dms') {
        label = 'DMS — Derajat, menit, detik';
        value = dms(lat, true, false) + ', ' + dms(lon, false, false);
      } else if (format === 'dmm') {
        label = 'DMM — Derajat, menit desimal';
        value = dms(lat, true, true) + ', ' + dms(lon, false, true);
      } else if (format === 'utm') {
        if (lat < -80 || lat > 84) {
          status.textContent = 'UTM hanya berlaku pada latitude -80° sampai 84°.';
          results.innerHTML = '';
          copyButton.disabled = shareButton.disabled = true;
          lastText = '';
          return;
        }
        if (typeof window.proj4 === 'function') {
          var zone = Math.floor((lon + 180) / 6) + 1;
          zone = Math.max(1, Math.min(60, zone));
          var epsg = (lat >= 0 ? 'EPSG:326' : 'EPSG:327') + String(zone).padStart(2, '0');
          try {
            var xy = window.proj4('EPSG:4326', epsg, [lon, lat]);
            label = 'UTM zona ' + zone + (lat >= 0 ? 'N' : 'S');
            value = Math.round(xy[0]) + ' m E, ' + Math.round(xy[1]) + ' m N';
          } catch (_) { /* Proj4 tidak tersedia atau definisi zona gagal. */ }
        } else {
          status.textContent = 'Konversi UTM belum tersedia karena pustaka proyeksi tidak termuat.';
          results.innerHTML = '';
          copyButton.disabled = shareButton.disabled = true;
          lastText = '';
          return;
        }
      }
      var datum = document.getElementById('dmCoordDatum').value;
      results.innerHTML = '<div class="dm-coord-result"><span>' + label + ' · ' + datum + '</span><strong>' + value + '</strong></div>';
      lastText = label + ' (' + datum + '): ' + value;
      results.insertAdjacentHTML('beforeend', '<div id="dmCoordAddress" class="dm-coord-result"><span>Alamat</span><strong>Mencari alamat...</strong></div>');
      var requestId = ++geocodeRequestId;
      var map = window.map;
      if (map && window.L && typeof window.L.marker === 'function') {
        if (!coordinateLayer) coordinateLayer = window.L.layerGroup().addTo(map);
        else coordinateLayer.clearLayers();
        coordinateMarker = window.L.marker([lat, lon], { title: 'Hasil konversi koordinat', alt: 'Lokasi hasil konversi' })
          .bindPopup('<strong>Lokasi hasil konversi</strong><br>Latitude: ' + lat.toFixed(6) + '<br>Longitude: ' + lon.toFixed(6))
          .addTo(coordinateLayer).openPopup();
        if (typeof map.flyTo === 'function') map.flyTo([lat, lon], Math.max(map.getZoom(), 13), { duration: 0.8 });
        else map.setView([lat, lon], Math.max(map.getZoom(), 13));
        status.textContent = 'Lokasi hasil konversi ditampilkan pada peta.';
      } else {
        status.textContent = 'Peta belum siap; hasil koordinat tetap tersedia di sini.';
      }
      reverseGeocode(lat, lon, requestId);
      copyButton.disabled = shareButton.disabled = false;
    }

    document.getElementById('dmCoordConvert').addEventListener('click', convert);
    formatSelect.addEventListener('change', function () { if (coordInput.value.trim()) convert(); });
    inputFormatSelect.addEventListener('change', function () {
      coordInput.placeholder = inputPlaceholders[inputFormatSelect.value] || inputPlaceholders.dd;
    });
    coordInput.placeholder = inputPlaceholders[inputFormatSelect.value] || inputPlaceholders.dd;
    coordInput.addEventListener('keydown', function (event) { if (event.key === 'Enter') convert(); });
    copyButton.addEventListener('click', async function () {
      try { await navigator.clipboard.writeText(lastText); status.textContent = 'Hasil disalin.'; }
      catch (_) { status.textContent = 'Gagal menyalin. Pilih dan salin hasil secara manual.'; }
    });
    shareButton.addEventListener('click', async function () {
      var shareData = { title: 'Konverter Koordinat', text: lastText };
      try {
        if (navigator.share) await navigator.share(shareData);
        else { await navigator.clipboard.writeText(lastText); status.textContent = 'Berbagi tidak tersedia; hasil disalin.'; }
      } catch (error) { if (error.name !== 'AbortError') status.textContent = 'Hasil tidak dapat dibagikan.'; }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
