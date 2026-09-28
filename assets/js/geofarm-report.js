/*
 * Laporan PDF hasil analisis GeoFarm.
 *
 * Dibuat sebagai modul terpisah dari polygon-analysis.js supaya bisa diuji
 * sendiri: fungsi buildGeoFarmReportPDF(items) hanya butuh array item GeoFarm
 * plus global jspdf, tanpa menyentuh DOM maupun peta. Itu penting karena
 * generator PDF lain di repo (ndvi-analysis, landcover-analysis, dan
 * seterusnya) memakai html2canvas + fitBounds, yang tidak bisa diuji di luar
 * browser. Peta di laporan ini digambar sebagai vektor dari koordinat rings,
 * jadi tidak perlu mengubah tampilan peta sama sekali.
 *
 * Semua nilai ditulis sebagai teks (bukan gambar) supaya hasil di PDF tetap
 * bisa dicari dan disalin.
 */
(function () {
  'use strict';

  var BRAND = 'RUANG KITA';

  /* Palet mengikuti generator PDF lain di repo agar seluruh laporan situs
     terlihat berasal dari satu keluarga. */
  var C_INK = [30, 41, 59];
  var C_MUTED = [100, 116, 139];
  var C_FAINT = [150, 150, 150];
  var C_ACCENT = [13, 148, 136];
  var C_LINE = [200, 200, 200];
  var C_RULE = [226, 232, 240];
  var C_ZEBRA = [248, 250, 252];
  var C_BAD = [190, 60, 40];
  var C_GOOD = [22, 101, 52];

  var PAGE_W = 297;
  var PAGE_H = 210;
  var MARGIN = 8;
  var TITLE_H = 14;

  /* ── format angka ── */

  function num(value, digits) {
    if (typeof value !== 'number' || !isFinite(value)) return '-';
    return value.toLocaleString('id-ID', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function idDate(value) {
    if (!value) return '-';
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function nowStamp() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  /** Nama file aman: hanya huruf, angka, dan strip. */
  function safeName(value) {
    return String(value || 'polygon').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40) || 'polygon';
  }

  function rgbCss(rgb) {
    return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
  }

  /* ── pengumpulan data ── */

  /** Kelas yang paling banyak pikselnya pada satu statistik indeks. */
  function dominantClass(stats) {
    if (!stats || !stats.bands || !stats.bands.length) return null;
    var best = null;
    for (var i = 0; i < stats.bands.length; i++) {
      var row = stats.bands[i];
      if (!best || row.count > best.count) best = row;
    }
    return best && best.count > 0 ? best.band : null;
  }

  /**
   * Ringkasan satu indeks untuk tabel. x bukan wajib: kolom "kelas dominan"
   * sengaja dibuang di tabel ringkasan supaya muat banyak indeks dalam satu
   * lebar kolom.
   */
  function indexRow(label, stats, digits) {
    return {
      label: label,
      mean: stats ? num(stats.mean, digits === undefined ? 3 : digits) : '-',
      min: stats ? num(stats.min, digits === undefined ? 3 : digits) : '-',
      max: stats ? num(stats.max, digits === undefined ? 3 : digits) : '-',
      count: stats ? stats.count : null,
      dominant: dominantClass(stats)
    };
  }

  function statusLabel(item) {
    if (item.stale) return 'Perlu rean';
    return item.analyzed ? 'Selesai' : 'Belum dianalisis';
  }

  /**
   * Menyeragamkan bentuk data antar sumber: NDVI, indeks spektral, dan tren
   * punya nama kunci berbeda tapi maknanya sama, dan laporan tidak boleh
   * menampilkan "undefined" di mana pun.
   */
  function citraMeta(item) {
    var meta = item.cloud || item.spectralMeta || null;
    if (!meta) return null;
    return {
      tanggal: meta.imageDate || '-',
      utc: meta.acquisitionUtc || '-',
      platform: meta.platform || '-',
      level: meta.level || '-',
      tile: meta.tile || '-',
      orbit: meta.orbit || '-',
      baseline: meta.baseline || '-',
      awan: typeof meta.cloudPercent === 'number' && isFinite(meta.cloudPercent) ? num(meta.cloudPercent, 2) + '%' : '-',
      produk: meta.productName || '-'
    };
  }

  function soilRows(soil) {
    if (!soil || !soil.bands || !soil.bands.length) return [];
    return soil.bands.map(function (s) {
      return {
        label: String(s.band),
        mean: num(s.mean, 1),
        min: num(s.min, 0),
        max: num(s.max, 0),
        p10: num(s.p10, 0),
        median: num(s.median, 0),
        p90: num(s.p90, 0)
      };
    });
  }

  function trendRows(item, spec) {
    // trendKey diambil dari spec kalau ada, kalau tidak diturunkan dari key.
    // Tanpa fallback ini spec yang tidak lengkap akan diam-diam dilewati dan
    // trennya hilang dari laporan tanpa ada pesan apa pun.
    var key = spec.trendKey || (spec.key + 'Trend');
    var trend = item[key];
    if (!trend) return null;
    var delta = trend.delta;
    return {
      label: spec.label,
      months: trend.months,
      from: trend.from,
      to: trend.to,
      median: num(trend.median, 3),
      delta: (delta >= 0 ? '+' : '-') + num(Math.abs(delta), 3),
      naik: delta >= 0,
      best: trend.best ? trend.best.label + ' (' + num(trend.best.mean, 3) + ')' : '-',
      worst: trend.worst ? trend.worst.label + ' (' + num(trend.worst.mean, 3) + ')' : '-',
      awan: typeof trend.cloudAvg === 'number' && isFinite(trend.cloudAvg) ? num(trend.cloudAvg, 1) + '%' : '-',
      gaps: trend.gaps || 0
    };
  }

  /**
   * Satu blok laporan untuk satu polygon. Dipisah dari penggambar supaya
   * seluruh isi laporan bisa diuji tanpa membuat PDF sama sekali.
   */
  function buildPolygonReport(item, indexSpecs) {
    var blocks = [];

    blocks.push({
      title: 'Ringkasan polygon',
      cols: [0.42, 0.2, 0.2, 0.18],
      rows: [
        ['Luas', num(item.areaHa, 2) + ' ha', 'Titik sample', String(item.pointCount || 0)],
        ['Sumber', item.source === 'upload' ? 'Unggah berkas' : 'Gambar di peta', 'Status', statusLabel(item)],
        ['Piksel NDVI valid', item.ndvi ? num(item.ndvi.count, 0) : '-', 'Cakupan', item.ndvi ? num(item.ndvi.coverage, 1) + '%' : '-'],
        ['Batas', boundsText(item.bounds), 'Jumlah ring', String((item.rings || []).length)]
      ]
    });

    if (item.ndvi) {
      blocks.push({
        title: 'Indeks Tutupan (NDVI)',
        cols: [0.3, 0.175, 0.175, 0.175, 0.175],
        rows: [['NDVI', num(item.ndvi.mean), num(item.ndvi.min), num(item.ndvi.max), dominantLabel(item.ndvi)]],
        note: 'Kelas dominan: ' + dominantLabel(item.ndvi)
      });
    }

    /* Blok indeks spektral hanya dibuat kalau minimal satu indeks terisi.
       Kalau tidak, polygon yang belum dianalisis akan mendapat halaman penuh
       tabel yang isinya hanya tanda hubung. */
    var adaIndeks = indexSpecs && indexSpecs.some(function (spec) { return !!item[spec.key]; });
    if (adaIndeks) {
      blocks.push({
        title: 'Indeks spektral',
        cols: [0.2, 0.14, 0.14, 0.14, 0.38],
        rows: indexSpecs.map(function (spec) {
          var row = indexRow(spec.label, item[spec.key]);
          return [spec.label, row.mean, row.min, row.max, dominantLabel(item[spec.key])];
        })
      });
    }

    if (item.lst) {
      blocks.push({
        title: 'Suhu permukaan (LST)',
        cols: [0.34, 0.22, 0.22, 0.22],
        rows: [['Suhu (°C)', num(item.lst.mean, 1), num(item.lst.min, 1), num(item.lst.max, 1)]],
        note: 'Landsat Collection 2 Level-2 · ' + (item.lst.date || '-') +
          (isFinite(item.lst.cloud) ? ' · awan ' + num(item.lst.cloud, 0) + '%' : '')
      });
    }

    if (item.terrain) {
      var t = item.terrain;
      blocks.push({
        title: 'Topografi',
        cols: [0.34, 0.22, 0.22, 0.22],
        rows: [
          ['Elevasi (mdpl)', num(t.elevMin, 0), num(t.elevAvg, 0), num(t.elevMax, 0)],
          ['Kemiringan (°)', num(t.slopeAvg, 1), 'Lereng curam', num(t.steepPct, 1) + '%']
        ],
        note: t.elevSourceLabel || 'Model elevasi terrain'
      });
    }

    var soil = item.soilWeekly || item.soil;
    var soilRowsData = soilRows(soil);
    if (soilRowsData.length) {
      blocks.push({
        title: 'Kelembapan tanah (NOAA SOIL)',
        cols: [0.24, 0.19, 0.19, 0.19, 0.19],
        rows: soilRowsData.map(function (r) {
          return [r.label, r.min, r.mean, r.max, r.median];
        }),
        note: 'Resolusi ~9,8 km/piksel (NOAA) · bacaan per bulan, bukan pengukuran di lapangan'
      });
    }

    var trends = [];
    if (item.ndviTrend) trends.push(trendRows(item, { label: 'NDVI', trendKey: 'ndviTrend' }));
    (indexSpecs || []).forEach(function (spec) {
      var t = trendRows(item, spec);
      if (t) trends.push(t);
    });
    trends = trends.filter(Boolean);
    if (trends.length) {
      blocks.push({
        title: 'Tren bulanan',
        cols: [0.16, 0.14, 0.16, 0.14, 0.2, 0.2],
        rows: trends.map(function (r) {
          return [r.label, r.from + ' → ' + r.to, r.median, r.delta, r.best, r.worst];
        }),
        note: 'Median Sentinel-2 per bulan · p10–p90 ditampilkan sebagai rentang pada grafik panel'
      });
    }

    var meta = citraMeta(item);
    if (meta) {
      blocks.push({
        title: 'Metadata citra',
        cols: [0.28, 0.22, 0.28, 0.22],
        rows: [
          ['Tanggal akuisisi (WIB)', meta.tanggal, 'UTC', meta.utc],
          ['Platform', meta.platform, 'Tingkat produk', meta.level],
          ['Tile MGRS', meta.tile, 'Orbit', meta.orbit],
          ['Baseline', meta.baseline, 'Tutupan awan', meta.awan],
          ['ID produk ESA', meta.produk, '', '']
        ]
      });
    }

    return {
      id: item.id,
      index: item.index,
      name: item.name || ('Polygon ' + item.index),
      areaHa: item.areaHa,
      status: statusLabel(item),
      analysed: !!item.analyzed,
      bounds: item.bounds,
      rings: item.rings || [],
      blocks: blocks
    };
  }

  function dominantLabel(stats) {
    var band = dominantClass(stats);
    return band ? band.label : '-';
  }

  function boundsText(bounds) {
    if (!bounds) return '-';
    return [
      num(bounds.south, 4) + ' … ' + num(bounds.north, 4) + ' LS',
      num(bounds.west, 4) + ' … ' + num(bounds.east, 4) + ' BT'
    ].join(' · ');
  }

  /** Semua polygon yang punya rings, untuk menggambar peta vektor. */
  function mappable(items) {
    return items.filter(function (item) {
      return item.bounds && (item.rings || []).length;
    });
  }

  /* ── primitif gambar ── */

  /*
   * jsPDF 2.5.1 TIDAK menerima array pada setTextColor/setDrawColor/
   * setFillColor: bentuk yang sah hanya satu angka abu-abu atau tiga angka
   * terpisah. Mengirim [r,g,b] membuatNA fungsi internal f2/f3 menerima NaN
   * dan melempar "Invalid argument passed to jsPDF.f2". Karena itu warna di
   * modul ini disimpan sebagai array lalu diteruskan lewat tiga helper ini.
   */
  function ink(pdf, color) {
    pdf.setTextColor(color[0], color[1], color[2]);
  }

  function stroke(pdf, color) {
    pdf.setDrawColor(color[0], color[1], color[2]);
  }

  function fill(pdf, color) {
    pdf.setFillColor(color[0], color[1], color[2]);
  }

  /**
   * Watermark miring di tengah halaman.Opacity lewat GState kalau tersedia;
   * kalau tidak, warna teks dibuat sangat terang agar tetap tidak mengganggu.
   */
  function drawWatermark(pdf) {
    var usedGState = false;
    try {
      if (pdf.GState) {
        pdf.saveGraphicsState();
        pdf.setGState(new pdf.GState({ opacity: 0.1 }));
        usedGState = true;
      }
    } catch (error) {
      usedGState = false;
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(48);
    if (!usedGState) pdf.setTextColor(226, 232, 240);
    else pdf.setTextColor(100, 116, 139);
    pdf.text(BRAND, PAGE_W / 2, PAGE_H / 2, { align: 'center', angle: 32 });
    if (usedGState) {
      pdf.restoreGraphicsState();
      pdf.setTextColor(30, 41, 59);
    }
  }

  /** Bingkai luar + judul + footer. Dipanggil sekali per halaman. */
  function drawPageChrome(pdf, heading, subtitle, rightLines) {
    pdf.setDrawColor(30, 41, 59);
    pdf.setLineWidth(0.4);
    pdf.rect(MARGIN, MARGIN, PAGE_W - MARGIN * 2, PAGE_H - MARGIN * 2);

    stroke(pdf, C_LINE);
    pdf.setLineWidth(0.2);
    pdf.line(MARGIN, MARGIN + TITLE_H, PAGE_W - MARGIN, MARGIN + TITLE_H);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(30, 41, 59);
    pdf.text(heading, MARGIN + 2, MARGIN + 6.2);

    if (subtitle) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(5);
      ink(pdf, C_FAINT);
      pdf.text('-', MARGIN + 4 + pdf.getTextWidth(heading), MARGIN + 6.2);
      pdf.setFontSize(10);
      pdf.setTextColor(13, 148, 136);
      pdf.text(subtitle, MARGIN + 7 + pdf.getTextWidth(heading), MARGIN + 6.2);
    }

    var rightX = PAGE_W - MARGIN - 2;
    var y = MARGIN + 5;
    for (var i = 0; i < (rightLines || []).length; i++) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(100, 116, 139);
      pdf.text(rightLines[i], rightX, y, { align: 'right' });
      y += 3.6;
    }

    // footer
    stroke(pdf, C_RULE);
    pdf.setLineWidth(0.2);
    pdf.line(MARGIN, PAGE_H - MARGIN - 6, PAGE_W - MARGIN, PAGE_H - MARGIN - 6);
    pdf.setFontSize(6.5);
    ink(pdf, C_FAINT);
    pdf.text('Dihasilkan oleh Ruang Kita · laporan analisis GeoFarm', MARGIN + 2, PAGE_H - MARGIN - 2.6);
    pdf.text('Sentinel-2 L2A · Landsat C2-L2 · NOAA SOIL', PAGE_W - MARGIN - 2, PAGE_H - MARGIN - 2.6, { align: 'right' });

    drawWatermark(pdf);
  }

  function newPage(pdf, pageCount, heading, subtitle, rightLines) {
    if (pageCount > 0) pdf.addPage();
    drawPageChrome(pdf, heading, subtitle, rightLines);
  }

  /**
   * Peta vektor: semua polygon digambar sebagai outline, polygon yang sedang
   * dilaporkan diisi garis tebal. Peta satelit sengaja tidak dipakai: capturing
   * peta berarti mengubah tampilan dan menunggu tile, sedangkan laporan ini
   */
  function drawVectorMap(pdf, frame, items, activeItem) {
    pdf.setDrawColor(55, 65, 81);
    pdf.setLineWidth(0.3);
    pdf.rect(frame.x, frame.y, frame.w, frame.h);

    var drawn = mappable(items);
    if (!drawn.length) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      ink(pdf, C_FAINT);
      pdf.text('Batas polygon tidak tersedia', frame.x + frame.w / 2, frame.y + frame.h / 2, { align: 'center' });
      return;
    }

    // satu extent bersama untuk semua polygon supaya bisa dibandingkan
    var west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
    drawn.forEach(function (item) {
      west = Math.min(west, item.bounds.west);
      south = Math.min(south, item.bounds.south);
      east = Math.max(east, item.bounds.east);
      north = Math.max(north, item.bounds.north);
    });
    // rentang minimum supaya polygon kecil tidak jadi garis tak terlihat
    var minSpan = 0.0008;
    if (east - west < minSpan) {
      var cx = (west + east) / 2;
      west = cx - minSpan / 2;
      east = cx + minSpan / 2;
    }
    if (north - south < minSpan) {
      var cy = (south + north) / 2;
      south = cy - minSpan / 2;
      north = cy + minSpan / 2;
    }
    var padX = (east - west) * 0.08;
    var padY = (north - south) * 0.08;
    west -= padX;
    east += padX;
    south -= padY;
    north += padY;

    var scaleX = frame.w / (east - west);
    var scaleY = frame.h / (north - south);
    // pakai satu skala supaya bentuk polygon tidak berubah (equal aspect)
    var scale = Math.min(scaleX, scaleY);
    var offX = frame.x + (frame.w - (east - west) * scale) / 2;
    var offY = frame.y + (frame.h - (north - south) * scale) / 2;

    var project = function (lng, lat) {
      return [offX + (lng - west) * scale, offY + (north - lat) * scale];
    };

    // grid koordinat
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.15);
    var steps = 4;
    for (var g = 1; g < steps; g++) {
      var gy = frame.y + (frame.h / steps) * g;
      pdf.line(frame.x, gy, frame.x + frame.w, gy);
      var gx = frame.x + (frame.w / steps) * g;
      pdf.line(gx, frame.y, gx, frame.y + frame.h);
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5);
    ink(pdf, C_FAINT);
    pdf.text(num(south, 4), frame.x + 1, frame.y + frame.h - 1);
    pdf.text(num(north, 4), frame.x + 1, frame.y + 3);
    pdf.text(num(west, 4), frame.x + 1, frame.y + 5.5);
    pdf.text(num(east, 4), frame.x + frame.w - 1, frame.y + 5.5, { align: 'right' });
    pdf.setFontSize(5.5);
    ink(pdf, C_MUTED);
    pdf.text('WGS84 / EPSG:4326', frame.x + 1, frame.y + frame.h + 3.5);

    /*
     * Setiap ring digambar sebagai polyline.
     *
     * Bentuk panggil pdf.lines() di jsPDF 2.5.1 HANYA menerima tiga argumen
     * dengan titik berupa array [dx, dy]: lines(delta, x, y). Bentuk dengan
     * argumen scale/style/closed atau titik {x, y} semuanya ditolak
     * ("Invalid argument passed to jsPDF.scale"). Karena itu koordinat
     * relatif dipakai, titik pertama jadi titik awal, dan garis penutup dari
     * titik terakhir ke titik pertama digambar terpisah.
     */
    var drawRings = function (item, isActive) {
      var rings = item.rings || [];
      for (var r = 0; r < rings.length; r++) {
        var ring = rings[r];
        if (!ring || ring.length < 3) continue;
        var start = project(ring[0][0], ring[0][1]);
        var deltas = [];
        for (var i = 1; i < ring.length; i++) {
          var p = project(ring[i][0], ring[i][1]);
          deltas.push([p[0] - start[0], p[1] - start[1]]);
        }
        if (!deltas.length) continue;
        // ring pertama (outer) ditebalkan untuk polygon yang sedang dilaporkan;
        // ring berikutnya adalah hole, digambar lebih tipis supaya lubang terbaca.
        if (isActive) pdf.setLineWidth(r === 0 ? 0.5 : 0.25);
        else pdf.setLineWidth(0.2);
        pdf.lines(deltas, start[0], start[1]);
        pdf.line(
          start[0] + deltas[deltas.length - 1][0],
          start[1] + deltas[deltas.length - 1][1],
          start[0],
          start[1]
        );
      }
    };

    // polygon lain dulu (latar), baru polygon aktif di atasnya
    drawn.forEach(function (item) {
      if (item !== activeItem) {
        pdf.setDrawColor(203, 213, 225);
        pdf.setLineWidth(0.2);
        drawRings(item, false);
      }
    });
    if (activeItem) {
      pdf.setDrawColor(15, 118, 110);
      pdf.setLineWidth(0.5);
      drawRings(activeItem, true);
    }
  }

  /**
   * Tabel sederhana. cols adalah lebar relatif; rows berupa array string.
   * Mengembalikan koordinat y setelah baris terakhir supaya blok berikutnya
   * bisa ditumpuk tanpa saling tumpang tindih.
   */
  function drawTable(pdf, x, y, width, block) {
    var titleH = TABLE_TITLE_H;
    var rowH = ROW_H;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(30, 41, 59);
    pdf.text(block.title, x, y + 3.2);
    var titleW = pdf.getTextWidth(block.title);

    pdf.setDrawColor(30, 41, 59);
    pdf.setLineWidth(0.3);
    pdf.line(x, y + titleH, x + width, y + titleH);

    var cursor = y + titleH;
    block.rows.forEach(function (row, rowIndex) {
      var colX = x;
      for (var c = 0; c < row.length; c++) {
        var colW = width * (block.cols[c] || (1 / row.length));
        var text = row[c] === null || row[c] === undefined ? '' : String(row[c]);
        var isLabel = c === 0;
        pdf.setFont('helvetica', isLabel ? 'normal' : 'bold');
        pdf.setFontSize(isLabel ? 6.8 : 7);
        pdf.setTextColor(isLabel ? 71 : 30, isLabel ? 85 : 41, isLabel ? 105 : 59);
        // kolom pertama rata kiri, sisanya rata kanan
        var options = isLabel ? {} : { align: 'right' };
        var available = colW - 1.5;
        var shown = text;
        // potong dengan elipsis supaya tidak menabrak kolom sebelah
        while (pdf.getTextWidth(shown) > available && shown.length > 1) {
          shown = shown.slice(0, -1);
        }
        if (shown !== text) shown = shown.slice(0, -1) + '.';
        pdf.text(shown, isLabel ? colX + 0.5 : colX + colW - 0.5, cursor + 3.1, options);
        colX += colW;
      }
      if (rowIndex % 2 === 1) {
        // zebra baris supaya tabel mudah dibaca saat panjangnya banyak baris
        fill(pdf, C_ZEBRA);
        pdf.rect(x, cursor, width, rowH, 'F');
      }
      cursor += rowH;
    });

    stroke(pdf, C_RULE);
    pdf.setLineWidth(0.2);
    pdf.line(x, cursor, x + width, cursor);

    if (block.note) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(5.8);
      ink(pdf, C_FAINT);
      pdf.text(block.note, x, cursor + 3.4);
      cursor += 5.4;
    }
    return cursor + 3.2;
  }

  /* ── halaman ── */

  function drawSummaryPage(pdf, reports, drawn) {
    var right = [
      idDate(new Date()),
      drawn.length + ' polygon',
      'WGS84 / EPSG:4326'
    ];
    drawPageChrome(pdf, 'Laporan Analisis GeoFarm', 'Ringkasan', right);

    var mapFrame = { x: MARGIN, y: contentTop(), w: 96, h: contentBottom() - contentTop() };
    drawVectorMap(pdf, mapFrame, drawn, null);

    var x = mapFrame.x + mapFrame.w + 5;
    var w = PAGE_W - x - MARGIN;
    var geometry = { x: x, w: w };

    var rows = reports.map(function (r) {
      return [
        String(r.index),
        r.name,
        num(r.areaHa, 2),
        indexValue(r, 'ndvi'),
        indexValue(r, 'ndmi'),
        indexValue(r, 'evi'),
        indexValue(r, 'ndvi705'),
        r.status
      ];
    });

    var blocks = [{
      title: 'Semua polygon',
      cols: [0.06, 0.26, 0.11, 0.11, 0.11, 0.11, 0.13, 0.11],
      rows: rows
    }];

    // Tabel kedua hanya untuk polygon yang benar-benar punya indeks terisi,
    // supaya baris yang seluruhnya tanda hubung tidak memenuhi halaman.
    var bandRows = [];
    drawn.forEach(function (item) {
      var ada = M_INDEX_SPECS.some(function (spec) { return !!item[spec.key]; });
      if (!ada) return;
      var values = M_INDEX_SPECS.map(function (spec) {
        return indexValueFromItem(item, spec);
      });
      bandRows.push([String(item.index), (item.name || ('Polygon ' + item.index))].concat(values));
    });
    if (bandRows.length) {
      blocks.push({
        title: 'Indeks spektral (rata-rata)',
        cols: [0.06, 0.24].concat(M_INDEX_SPECS.map(function () { return 0.7 / M_INDEX_SPECS.length; })),
        rows: bandRows
      });
    }

    // Halaman sudah digambar oleh pemanggil sebelum drawBlocks(), jadi
    // newPage() SELALU harus menambah halaman baru. Kalau flag ini salah
    // diset true, blok yang meluber akan digambar di halaman yang sama dan
    // menimpa peta instead of pindah halaman.
    var state = {
      y: contentTop(),
      newPage: function () {
        pdf.addPage();
        drawPageChrome(pdf, 'Laporan Analisis GeoFarm', 'Ringkasan (lanjutan)', right);
        drawVectorMap(pdf, mapFrame, drawn, null);
        return contentTop();
      }
    };
    var y = drawBlocks(pdf, state, blocks, geometry);

    if (y <= contentBottom()) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.5);
      ink(pdf, C_MUTED);
      pdf.text(
        'Laporan lengkap per polygon ada pada halaman-halaman berikutnya. Indeks yang belum dimuat ditampilkan sebagai "-".',
        x, y + 1
      );
    }
  }

  function indexValue(report, key) {
    return report.indexValues && report.indexValues[key] !== undefined
      ? report.indexValues[key] : '-';
  }

  function indexValueFromItem(item, spec) {
    var stats = item[spec.key];
    return stats ? num(stats.mean, 3) : '-';
  }

  /*
   * Tinggi tetap (mm) supaya pemenggalan baris bisa dihitung sebelum menggambar.
   * Nilai-nilai ini harus sama dengan yang dipakai drawTable().
   */
  var TABLE_TITLE_H = 5.2;
  var ROW_H = 4.4;
  var NOTE_H = 5.4;
  var BLOCK_GAP = 3.2;

  function contentTop() {
    return MARGIN + TITLE_H + 4;
  }

  function contentBottom() {
    // Sisakan ruang untuk garis footer di PAGE_H - MARGIN - 6.
    return PAGE_H - MARGIN - 10;
  }

  /**
   * Memotong blok yang terlalu panjang menjadi beberapa bagian agar tidak
   * melewati halaman. Tanpa ini blok Metadata citra akan hilang diam-diam
   * pada polygon yang punya banyak blok.
   */
  function splitBlock(block, availH) {
    var head = TABLE_TITLE_H + BLOCK_GAP + (block.note ? NOTE_H : 0);
    var perPage = Math.floor((availH - head) / ROW_H);
    if (!isFinite(perPage) || perPage < 1) perPage = 1;
    if (block.rows.length <= perPage) return [block];
    var out = [];
    for (var i = 0; i < block.rows.length; i += perPage) {
      var end = Math.min(i + perPage, block.rows.length);
      out.push({
        title: block.title + (i > 0 ? ' (lanjutan)' : ''),
        cols: block.cols,
        rows: block.rows.slice(i, end),
        // catatan hanya di bagian terakhir supaya tidak terulang
        note: end >= block.rows.length ? block.note : null
      });
    }
    return out;
  }

  function drawBlocks(pdf, state, blocks, geometry) {
    var y = state.y;
    blocks.forEach(function (block) {
      // Pisah blok yang tidak muat, lalu pecah jadi beberapa halaman.
      var chunks = splitBlock(block, contentBottom() - y);
      chunks.forEach(function (chunk, i) {
        if (i > 0 || y + (TABLE_TITLE_H + chunk.rows.length * ROW_H) > contentBottom()) {
          if (i === 0 && y > contentTop() + 1) {
            y = state.newPage();
          } else if (i > 0) {
            y = state.newPage();
          }
        }
        y = drawTable(pdf, geometry.x, y, geometry.w, chunk);
      });
    });
    state.y = y;
    return y;
  }

  function drawPolygonPages(pdf, report, item, drawn) {
    var right = [
      idDate(new Date()),
      num(report.areaHa, 2) + ' ha',
      report.status
    ];
    var mapFrame = { x: MARGIN, y: contentTop(), w: 92, h: contentBottom() - contentTop() };
    var geometry = { x: mapFrame.x + mapFrame.w + 5, w: 0 };
    geometry.w = PAGE_W - geometry.x - MARGIN;

    // Sama seperti halaman ringkasan: pemanggil sudah menggambar halaman
    // pertama, jadi newPage() selalu menambah halaman baru.
    var state = {
      y: contentTop(),
      newPage: function () {
        pdf.addPage();
        drawPageChrome(pdf, 'Laporan Analisis GeoFarm', report.name + ' (lanjutan)', right);
        drawVectorMap(pdf, mapFrame, drawn, item);
        return contentTop();
      }
    };

    // Halaman pertama
    drawPageChrome(pdf, 'Laporan Analisis GeoFarm', report.name, right);
    drawVectorMap(pdf, mapFrame, drawn, item);
    drawBlocks(pdf, state, report.blocks, geometry);
    return state;
  }

  /* Daftar indeks untuk halaman ringkasan. Diisi dari luar supaya modul ini
     tidak perlu tahu urutan definisi indeks. */
  var M_INDEX_SPECS = [];

  function setIndexSpecs(specs) {
    M_INDEX_SPECS = specs || [];
  }

  /**
   * Pintu masuk PDF. items = array item GeoFarm. Mengembalikan Promise
   * { ok, message }. Tidak melempar, supaya tombol bisa menampilkan pesannya.
   */
  function buildGeoFarmReportPDF(items) {
    var list = (items || []).filter(Boolean);
    if (!list.length) {
      return Promise.resolve({ ok: false, message: 'Tidak ada polygon untuk dilaporkan.' });
    }
    var jsPDFCtor = (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF)
      ? window.jspdf.jsPDF
      : (typeof jspdf !== 'undefined' && jspdf.jsPDF ? jspdf.jsPDF : null);
    if (!jsPDFCtor) {
      return Promise.resolve({ ok: false, message: 'Modul PDF belum siap. Muat ulang halaman lalu coba kembali.' });
    }

    var drawn = mappable(list);
    var indexSpecs = M_INDEX_SPECS;

    var reports = list.map(function (item) {
      var report = buildPolygonReport(item, indexSpecs);
      report.indexValues = {};
      report.indexValues.ndvi = item.ndvi ? num(item.ndvi.mean, 3) : '-';
      indexSpecs.forEach(function (spec) {
        report.indexValues[spec.key] = indexValueFromItem(item, spec);
      });
      return report;
    });

    try {
      var pdf = new jsPDFCtor({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      // Halaman ringkasan memakai halaman pertama.
      drawSummaryPage(pdf, reports, drawn);
      // Tiap polygon mulai di halaman baru; drawPolygonPages menambah halaman
      // lanjutannya sendiri kalau bloknya tidak muat.
      list.forEach(function (item, i) {
        pdf.addPage();
        drawPolygonPages(pdf, reports[i], item, drawn);
      });
      var fileName = 'Laporan_GeoFarm_' + nowStamp() + '.pdf';
      var pages = pdf.internal.getNumberOfPages();
      pdf.save(fileName);
      return Promise.resolve({
        ok: true,
        fileName: fileName,
        pages: pages,
        message: list.length + ' polygon ditulis ke ' + fileName + ' (' + pages + ' halaman).'
      });
    } catch (error) {
      return Promise.resolve({
        ok: false,
        message: 'Gagal membuat PDF: ' + (error && error.message ? error.message : String(error))
      });
    }
  }

  window.setGeoFarmReportIndexSpecs = setIndexSpecs;
  window.buildGeoFarmReportPDF = buildGeoFarmReportPDF;
  /* Dipakai uji otomatis:.Report yang sudah terkumpul tapi belum digambar. */
  window.buildGeoFarmPolygonReport = buildPolygonReport;
  window.geoFarmReportInternals = {
    dominantClass: dominantClass,
    boundsText: boundsText,
    num: num,
    mappable: mappable,
    setIndexSpecs: setIndexSpecs
  };
})();
