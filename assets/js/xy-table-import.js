(function () {
  'use strict';

  var parsedTable = null;
  var fileName = '';
  var elements = {};

  function setStatus(message, isError) {
    if (!elements.status) return;
    elements.status.textContent = message || '';
    elements.status.classList.toggle('is-error', !!isError);
  }

  function countDelimiter(line, delimiter) {
    var count = 0;
    var quoted = false;
    for (var i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        if (quoted && line[i + 1] === '"') i++;
        else quoted = !quoted;
      } else if (!quoted && line[i] === delimiter) count++;
    }
    return count;
  }

  function detectDelimiter(text) {
    var firstLine = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0];
    var choices = [',', ';', '\t'];
    return choices.map(function (delimiter) {
      return { delimiter: delimiter, count: countDelimiter(firstLine, delimiter) };
    }).sort(function (a, b) { return b.count - a.count; })[0].delimiter;
  }

  function parseDelimited(text, delimiter) {
    var rows = [];
    var row = [];
    var cell = '';
    var quoted = false;
    text = String(text || '').replace(/^\uFEFF/, '');
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === '"') {
        if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (!quoted && ch === delimiter) {
        row.push(cell); cell = '';
      } else if (!quoted && (ch === '\n' || ch === '\r')) {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some(function (value) { return String(value).trim() !== ''; })) rows.push(row);
        row = [];
      } else cell += ch;
    }
    row.push(cell);
    if (row.some(function (value) { return String(value).trim() !== ''; })) rows.push(row);
    if (quoted) throw new Error('Ada tanda kutip yang belum ditutup pada file.');
    if (!rows.length || rows.length < 2) throw new Error('Tabel harus memiliki header dan setidaknya satu baris data.');

    var headerCounts = Object.create(null);
    var headers = rows.shift().map(function (value, index) {
      var name = String(value || '').trim() || ('Kolom ' + (index + 1));
      var key = name.toLocaleLowerCase();
      headerCounts[key] = (headerCounts[key] || 0) + 1;
      return headerCounts[key] > 1 ? name + ' (' + headerCounts[key] + ')' : name;
    });
    return { headers: headers, rows: rows, delimiter: delimiter };
  }

  function fillSelect(select, headers, axis) {
    select.replaceChildren();
    headers.forEach(function (header, index) {
      var option = document.createElement('option');
      option.value = String(index);
      option.textContent = header;
      select.appendChild(option);
    });
    var aliases = axis === 'x'
      ? /^(x|lon|long|longitude|lng|easting|east)$/i
      : /^(y|lat|latitude|northing|north)$/i;
    var detected = headers.findIndex(function (header) { return aliases.test(header.trim()); });
    if (detected >= 0) select.value = String(detected);
    select.disabled = false;
  }

  function coordinateNumber(value, delimiter) {
    var text = String(value == null ? '' : value).trim().replace(/\s/g, '');
    if (!text) return NaN;
    if (delimiter === ';' && /^[-+]?\d+,\d+$/.test(text)) text = text.replace(',', '.');
    if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(text)) return NaN;
    return Number(text);
  }

  function coordinateToWgs84(x, y) {
    var crs = elements.crs.value;
    if (crs === 'EPSG:4326') return [x, y];
    if (typeof window.proj4 !== 'function') throw new Error('Modul proyeksi belum siap. Muat ulang halaman lalu coba lagi.');
    var point = window.proj4(crs, 'EPSG:4326', [x, y]);
    return [Number(point[0]), Number(point[1])];
  }

  function getFeatureCollection() {
    if (!parsedTable) throw new Error('Pilih file tabel terlebih dahulu.');
    var xIndex = Number(elements.x.value);
    var yIndex = Number(elements.y.value);
    if (!Number.isInteger(xIndex) || !Number.isInteger(yIndex) || xIndex === yIndex) {
      throw new Error('Pilih kolom X dan Y yang berbeda.');
    }
    var features = [];
    var invalid = 0;
    parsedTable.rows.forEach(function (row) {
      var x = coordinateNumber(row[xIndex], parsedTable.delimiter);
      var y = coordinateNumber(row[yIndex], parsedTable.delimiter);
      if (!Number.isFinite(x) || !Number.isFinite(y)) { invalid++; return; }
      var point;
      try { point = coordinateToWgs84(x, y); }
      catch (error) { throw error; }
      if (!Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) {
        invalid++; return;
      }
      var properties = {};
      parsedTable.headers.forEach(function (header, index) { properties[header] = row[index] == null ? '' : String(row[index]).trim(); });
      features.push({ type: 'Feature', properties: properties, geometry: { type: 'Point', coordinates: point } });
    });
    return { collection: { type: 'FeatureCollection', features: features }, invalid: invalid };
  }

  function updatePreview() {
    if (!parsedTable) return;
    try {
      var result = getFeatureCollection();
      var count = result.collection.features.length;
      elements.preview.textContent = count + ' titik valid dari ' + parsedTable.rows.length + ' baris' +
        (result.invalid ? ' · ' + result.invalid + ' baris dilewati karena koordinat kosong atau tidak valid.' : '.');
      elements.importButton.disabled = count === 0;
      setStatus('', false);
    } catch (error) {
      elements.preview.textContent = parsedTable.rows.length + ' baris data terdeteksi.';
      elements.importButton.disabled = true;
      setStatus(error.message, true);
    }
  }

  function loadTable(file) {
    fileName = file.name.replace(/\.(csv|tsv|txt)$/i, '') || 'Tabel XY';
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var delimiter = detectDelimiter(reader.result);
        parsedTable = parseDelimited(reader.result, delimiter);
        fillSelect(elements.x, parsedTable.headers, 'x');
        fillSelect(elements.y, parsedTable.headers, 'y');
        if (elements.x.value === elements.y.value && parsedTable.headers.length > 1) elements.y.value = '1';
        updatePreview();
      } catch (error) {
        parsedTable = null;
        elements.x.disabled = true;
        elements.y.disabled = true;
        elements.importButton.disabled = true;
        elements.preview.textContent = 'File belum dapat dipratinjau.';
        setStatus('Gagal membaca tabel: ' + error.message, true);
      }
    };
    reader.onerror = function () { setStatus('Gagal membaca file tabel.', true); };
    reader.readAsText(file);
  }

  function init() {
    elements.file = document.getElementById('xyTableFile');
    elements.x = document.getElementById('xyTableXField');
    elements.y = document.getElementById('xyTableYField');
    elements.crs = document.getElementById('xyTableCrs');
    elements.preview = document.getElementById('xyTablePreview');
    elements.status = document.getElementById('xyTableStatus');
    elements.importButton = document.getElementById('xyTableImportBtn');
    if (!elements.file || !elements.importButton) return;

    elements.file.addEventListener('change', function () {
      var file = elements.file.files && elements.file.files[0];
      if (file) loadTable(file);
    });
    elements.x.addEventListener('change', updatePreview);
    elements.y.addEventListener('change', updatePreview);
    elements.crs.addEventListener('change', updatePreview);
    elements.importButton.addEventListener('click', function () {
      try {
        var result = getFeatureCollection();
        if (!result.collection.features.length) throw new Error('Tidak ada koordinat valid untuk dibuat menjadi titik.');
        if (typeof window.addAlatGeoJSONLayer !== 'function') throw new Error('Modul layer peta belum siap. Muat ulang halaman lalu coba lagi.');
        window.addAlatGeoJSONLayer(fileName, 'Tabel X,Y', result.collection);
        setStatus(result.collection.features.length + ' titik ditambahkan ke Layer Aktif.' + (result.invalid ? ' ' + result.invalid + ' baris dilewati.' : ''), false);
      } catch (error) { setStatus(error.message, true); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
