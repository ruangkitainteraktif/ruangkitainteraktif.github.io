/**
 * AI Geospatial Analysis — Simple Query Engine
 * Keyword-based data analysis from map features (no LLM).
 */
(function () {
  'use strict';

  var sheetOpen = false;
  var sheetMinimized = false;
  var chatHistory = [];
  var CHAT_HISTORY_KEY = 'ruangkita-ai-chat';
  var MAX_CHAT = 50;

  var QUICK_ACTIONS = [
    { label: 'SPPG', intent: 'sppg' },
    { label: 'Hotspot', intent: 'hotspot' },
    { label: 'Gempa', intent: 'gempa' },
    { label: 'Layer', intent: 'layers' },
    { label: 'Lokasi', intent: 'viewport' },
    { label: 'Ringkasan', intent: 'summary' }
  ];

  function $(id) { return document.getElementById(id); }
  function fmt(n) { return n == null ? '-' : Number(n).toLocaleString('id-ID'); }

  /* === Data Extractors === */
  function extractSppgData() {
    var raw = (window.getSppgDistrictData && window.getSppgDistrictData()) || [];
    if (!raw.length) return null;
    var byDistrict = {}, byProvince = {};
    raw.forEach(function (item) {
      var d = (item.district || item.kabkota || '').trim();
      var p = (item.province || '').trim();
      if (d) {
        var key = d.toUpperCase().replace(/^KOTA\s+/, '').replace(/KAB\.\s*/i, '');
        if (!byDistrict[key]) byDistrict[key] = { name: d, count: 0, province: p };
        byDistrict[key].count++;
      }
      if (p) {
        if (!byProvince[p]) byProvince[p] = { name: p, count: 0 };
        byProvince[p].count++;
      }
    });
    var sd = Object.values(byDistrict).sort(function (a, b) { return b.count - a.count; });
    var sp = Object.values(byProvince).sort(function (a, b) { return b.count - a.count; });
    return { total: raw.length, totalDistricts: sd.length, totalProvinces: sp.length, top10: sd.slice(0, 10), bottom10: sd.slice(-10).reverse(), provinceTop10: sp.slice(0, 10) };
  }

  function extractHotspotData() {
    var features = (window.getHotspotFeatures && window.getHotspotFeatures()) || [];
    if (!features.length) return null;
    var byProv = {}, byKab = {}, conf = { high: 0, medium: 0, low: 0 };
    features.forEach(function (f) {
      var prov = (f.properties.nama_provinsi || 'Tidak Diketahui').trim();
      var kab = (f.properties.kabkota || '').trim();
      if (!byProv[prov]) byProv[prov] = { name: prov, count: 0 };
      byProv[prov].count++;
      if (kab) {
        var k = kab + ' (' + prov + ')';
        if (!byKab[k]) byKab[k] = { name: k, count: 0 };
        byKab[k].count++;
      }
      var c = (f.properties.confidence_level || '').toLowerCase();
      if (conf.hasOwnProperty(c)) conf[c]++;
    });
    return { total: features.length, confidence: conf, provinceTop10: Object.values(byProv).sort(function (a, b) { return b.count - a.count; }).slice(0, 10), kabkotaTop10: Object.values(byKab).sort(function (a, b) { return b.count - a.count; }).slice(0, 10) };
  }

  function extractGempaData() {
    var sig = window.earthquakeSignificantData || [];
    var felt = window.earthquakeFeltData || [];
    var latest = window.earthquakeLatestData || null;
    var items = [];
    sig.forEach(function (e) { items.push({ mag: e.Magnitude || e.mag, depth: e.Kedalaman || e.depth, place: e.Wilayah || e.place || e.lokasi, time: e.Date || e.time, type: 'Significant (M5.0+)' }); });
    felt.forEach(function (e) { items.push({ mag: e.Magnitude || e.mag, depth: e.Kedalaman || e.depth, place: e.Wilayah || e.place || e.lokasi, time: e.Date || e.time, type: 'Dirasakan' }); });
    if (!items.length && !latest) return null;
    return { latest: latest, items: items.slice(0, 15), totalSignificant: sig.length, totalFelt: felt.length };
  }

  function extractActiveLayers() {
    var layers = [];
    document.querySelectorAll('.ql-btn.active').forEach(function (btn) {
      var m = { qlHotspot: 'Hotspot', qlPm25: 'PM2.5', qlWind: 'Angin', qlHujan: 'Hujan', qlRadar: 'Radar', qlProvinsi: 'Batas Provinsi' };
      if (m[btn.id]) layers.push(m[btn.id]);
    });
    document.querySelectorAll('.lc-item input[type="checkbox"]:checked').forEach(function (cb) {
      var item = cb.closest('.lc-item');
      if (item) { var lbl = item.querySelector('.lc-item-label'); if (lbl) { var n = lbl.textContent.trim(); if (layers.indexOf(n) === -1) layers.push(n); } }
    });
    return layers;
  }

  function extractViewportInfo() {
    if (typeof map === 'undefined' || !map) return null;
    var c = map.getCenter(), b = map.getBounds();
    return { lat: c.lat.toFixed(4), lng: c.lng.toFixed(4), zoom: map.getZoom(), south: b.getSouth().toFixed(3), west: b.getWest().toFixed(3), north: b.getNorth().toFixed(3), east: b.getEast().toFixed(3) };
  }

  /* === Intent Parser === */
  var INTENT_RULES = [
    { intent: 'hotspot', patterns: ['hotspot', 'api', 'karhutla', 'kebakaran', 'hutan', 'lahan'] },
    { intent: 'sppg', patterns: ['sppg', 'mbg', 'pangan', 'sentra', 'food'] },
    { intent: 'gempa', patterns: ['gempa', 'earthquake', 'magnitudo', 'seismik', 'getaran', 'richter'] },
    { intent: 'layers', patterns: ['layer', 'aktif', 'tampil', 'menampilkan', 'overlay', 'peta'] },
    { intent: 'viewport', patterns: ['lokasi', 'posisi', 'koordinat', 'viewport', 'sekarang', 'area'] },
    { intent: 'summary', patterns: ['ringkasan', 'summary', 'semua', 'kondisi', 'overview'] }
  ];

  function parseIntent(text) {
    var t = text.toLowerCase();
    for (var i = 0; i < INTENT_RULES.length; i++) {
      var r = INTENT_RULES[i];
      for (var j = 0; j < r.patterns.length; j++) {
        if (t.indexOf(r.patterns[j]) !== -1) return r.intent;
      }
    }
    return 'help';
  }

  /* === Answer Formatters === */
  function formatHotspotAnswer() {
    var d = extractHotspotData();
    if (!d) return 'Tidak ada data hotspot yang tersedia. Aktifkan layer Hotspot terlebih dahulu.';
    var s = '**Data Hotspot Karhutla (24 Jam)**\n\n';
    s += 'Total: **' + fmt(d.total) + '** titik\n';
    s += 'Confidence: High=**' + fmt(d.confidence.high) + '**, Medium=**' + fmt(d.confidence.medium) + '**, Low=**' + fmt(d.confidence.low) + '**\n\n';
    s += '**Top 10 Provinsi:**\n';
    d.provinceTop10.forEach(function (p, i) { s += (i + 1) + '. ' + p.name + ' - **' + fmt(p.count) + '** titik\n'; });
    if (d.kabkotaTop10.length) {
      s += '\n**Top 10 Kabupaten/Kota:**\n';
      d.kabkotaTop10.forEach(function (p, i) { s += (i + 1) + '. ' + p.name + ' - **' + fmt(p.count) + '** titik\n'; });
    }
    return s;
  }

  function formatSppgAnswer() {
    var d = extractSppgData();
    if (!d) return 'Tidak ada data SPPG yang tersedia. Aktifkan layer SPPG terlebih dahulu.';
    var s = '**Data SPPG (MBG)**\n\n';
    s += 'Total: **' + fmt(d.total) + '** unit di **' + fmt(d.totalDistricts) + '** kabupaten/kota\n';
    s += 'Provinsi: **' + fmt(d.totalProvinces) + '**\n\n';
    s += '**Top 10 Kabupaten/Kota:**\n';
    d.top10.forEach(function (p, i) { s += (i + 1) + '. ' + p.name + ' (' + p.province + ') - **' + fmt(p.count) + '** unit\n'; });
    s += '\n**Top 10 Provinsi:**\n';
    d.provinceTop10.forEach(function (p, i) { s += (i + 1) + '. ' + p.name + ' - **' + fmt(p.count) + '** unit\n'; });
    return s;
  }

  function formatGempaAnswer() {
    var d = extractGempaData();
    if (!d) return 'Tidak ada data gempa yang tersedia.';
    var s = '**Data Gempa BMKG**\n\n';
    if (d.latest) {
      var L = d.latest;
      s += '**Gempa Terbaru:**\n';
      s += 'Wilayah: ' + (L.Wilayah || L.place || L.lokasi || '-') + '\n';
      s += 'Magnitude: **' + (L.Magnitude || L.mag || '-') + '**\n';
      s += 'Kedalaman: ' + (L.Kedalaman || L.depth || '-') + ' km\n';
      s += 'Waktu: ' + (L.Date || L.time || '-') + '\n\n';
    }
    s += 'Total Signifikan (M5.0+): **' + fmt(d.totalSignificant) + '**\n';
    s += 'Total Dirasakan: **' + fmt(d.totalFelt) + '**\n\n';
    if (d.items.length) {
      s += '**Daftar Gempa:**\n';
      d.items.forEach(function (e, i) {
        s += (i + 1) + '. M' + (e.mag || '-') + ' - ' + (e.place || '-') + ' (Kedalaman: ' + (e.depth || '-') + ' km)\n';
      });
    }
    return s;
  }

  function formatLayersAnswer() {
    var layers = extractActiveLayers();
    var s = '**Layer Aktif di Peta**\n\n';
    if (!layers.length) return s + 'Tidak ada layer aktif saat ini.';
    s += 'Total: **' + layers.length + '** layer\n\n';
    layers.forEach(function (l, i) { s += (i + 1) + '. ' + l + '\n'; });
    return s;
  }

  function formatViewportAnswer() {
    var v = extractViewportInfo();
    if (!v) return 'Tidak dapat membaca informasi viewport.';
    var s = '**Lokasi Saat Ini**\n\n';
    s += 'Koordinat: **' + v.lat + ', ' + v.lng + '**\n';
    s += 'Zoom Level: **' + v.zoom + '**\n';
    s += 'Area: ' + v.south + ',' + v.west + ' - ' + v.north + ',' + v.east;
    return s;
  }

  function formatSummaryAnswer() {
    var s = '**Ringkasan Data Peta**\n\n';
    var v = extractViewportInfo();
    if (v) s += 'Lokasi: ' + v.lat + ', ' + v.lng + ' (zoom ' + v.zoom + ')\n';
    var layers = extractActiveLayers();
    s += 'Layer aktif: **' + layers.length + '**\n';
    if (layers.length) s += '_' + layers.join(', ') + '_\n\n';
    var sppg = extractSppgData();
    if (sppg) s += 'SPPG: **' + fmt(sppg.total) + '** unit di ' + fmt(sppg.totalDistricts) + ' kab/kota\n';
    var hs = extractHotspotData();
    if (hs) s += 'Hotspot: **' + fmt(hs.total) + '** titik (High: ' + fmt(hs.confidence.high) + ')\n';
    var eq = extractGempaData();
    if (eq) {
      s += 'Gempa Signifikan: **' + fmt(eq.totalSignificant) + '**, Dirasakan: **' + fmt(eq.totalFelt) + '**\n';
    }
    if (!sppg && !hs && !eq) s += '\n_Aktifkan layer data untuk analisis lebih lanjut._';
    return s;
  }

  function formatHelpAnswer() {
    return '**AI Analisis Geospasial**\n\n' +
      'Tanyakan sesuatu tentang data peta, atau gunakan tombol quick action.\n\n' +
      '**Contoh pertanyaan:**\n' +
      '- "Hotspot terbanyak di mana?"\n' +
      '- "Berapa total SPPG?"\n' +
      '- "Gempa terbaru apa?"\n' +
      '- "Layer apa saja yang aktif?"\n' +
      '- "Posisi saya di mana?"\n' +
      '- "Ringkasan data peta"\n';
  }

  function getAnswer(intent) {
    switch (intent) {
      case 'hotspot': return formatHotspotAnswer();
      case 'sppg': return formatSppgAnswer();
      case 'gempa': return formatGempaAnswer();
      case 'layers': return formatLayersAnswer();
      case 'viewport': return formatViewportAnswer();
      case 'summary': return formatSummaryAnswer();
      default: return formatHelpAnswer();
    }
  }

  /* === Chat Logic === */
  function addChatMessage(role, text) {
    chatHistory.push({ role: role, content: text, time: Date.now() });
    if (chatHistory.length > MAX_CHAT) chatHistory = chatHistory.slice(-MAX_CHAT);
    renderChat();
    saveChatHistory();
  }

  function renderChat() {
    var c = $('ais-chat-messages');
    if (!c) return;
    var html = '';
    chatHistory.forEach(function (m) {
      var cls = m.role === 'user' ? 'ais-msg-user' : 'ais-msg-ai';
      var text = m.role === 'user' ? escapeHtml(m.content) : formatMarkdown(m.content);
      html += '<div class="ais-msg ' + cls + '"><div class="ais-msg-avatar">' + (m.role === 'user' ? 'Anda' : 'AI') + '</div><div class="ais-msg-content">' + text + '</div></div>';
    });
    c.innerHTML = html;
    c.scrollTop = c.scrollHeight;
  }

  function escapeHtml(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'); }

  function formatMarkdown(t) {
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      .replace(/^\d+\. (.+)$/gm, '<div class="ais-list-item">$1</div>')
      .replace(/^[-\u2022] (.+)$/gm, '<div class="ais-list-item">\u2022 $1</div>')
      .replace(/\n{2,}/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }

  function saveChatHistory() { try { localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory)); } catch (e) {} }
  function loadChatHistory() { try { chatHistory = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '[]'); } catch (e) { chatHistory = []; } }

  window._aiClearChat = function () { chatHistory = []; localStorage.removeItem(CHAT_HISTORY_KEY); renderChat(); };

  window._aiSendQuick = function (idx) {
    var action = QUICK_ACTIONS[idx];
    if (action) sendMessage(action.intent);
  };

  function sendMessage(text) {
    if (!text || !text.trim()) return;
    var input = $('ais-chat-input');
    if (input) input.value = '';
    addChatMessage('user', text);
    var intent = parseIntent(text);
    var answer = getAnswer(intent);
    addChatMessage('ai', answer);
  }

  window._aiSendMessage = function () { var input = $('ais-chat-input'); if (input) sendMessage(input.value); };
  window._aiHandleKeydown = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window._aiSendMessage(); } };

  /* === Sheet Controls === */
  function openAiSheet() {
    var sheet = $('ai-sheet');
    if (!sheet) return;
    sheet.classList.add('ais-sheet-open');
    sheetOpen = true;
    sheetMinimized = false;
    if (!chatHistory.length) {
      addChatMessage('ai', 'Halo! Saya adalah AI asisten geospasial. Tanyakan apa saja tentang data peta, atau pilih quick action di bawah.');
    }
  }

  function closeAiSheet() {
    var sheet = $('ai-sheet');
    if (!sheet) return;
    sheetOpen = false;
    sheetMinimized = false;
    sheet.classList.remove('ais-sheet-open', 'ais-sheet-minimized');
  }

  function minimizeAiSheet() {
    var sheet = $('ai-sheet');
    if (!sheet) return;
    sheetMinimized = !sheetMinimized;
    sheet.classList.toggle('ais-sheet-minimized', sheetMinimized);
    sheet.classList.toggle('ais-sheet-open', !sheetMinimized);
  }

  function toggleAiSheet() { if (sheetOpen) closeAiSheet(); else openAiSheet(); }

  window.openAiSheet = openAiSheet;
  window.closeAiSheet = closeAiSheet;
  window.minimizeAiSheet = minimizeAiSheet;
  window.toggleAiSheet = toggleAiSheet;

  /* === Init === */
  function initAiAnalysis() {
    var triggerBtn = $('aiAnalysisBtn');
    if (triggerBtn) triggerBtn.addEventListener('click', toggleAiSheet);
    loadChatHistory();
    renderChat();
    document.querySelectorAll('.ais-quick-btn').forEach(function (btn, idx) {
      btn.addEventListener('click', function () { window._aiSendQuick(idx); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAiAnalysis);
  } else {
    initAiAnalysis();
  }

})();