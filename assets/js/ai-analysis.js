/**
 * AI Geospatial Analysis — Chatbot Interface (Transformers.js)
 * Client-side LLM chatbot for geospatial analysis.
 */
(function () {
  'use strict';

  /* ── State ── */
  var generator = null;
  var transformers = null;
  var modelLoaded = false;
  var modelLoading = false;
  var isGenerating = false;
  var sheetOpen = false;
  var sheetMinimized = false;
  var chatHistory = [];

  var MODEL_OPTIONS = [
    { id: 'onnx-community/Qwen2.5-0.5B-Instruct', label: 'Qwen2.5 0.5B', size: '~200MB', quality: 'Ringan', localDir: 'qwen2.5-0.5b' },
    { id: 'onnx-community/Qwen2.5-1.5B-Instruct', label: 'Qwen2.5 1.5B', size: '~800MB', quality: 'Bagus', localDir: 'qwen2.5-1.5b' },
    { id: 'onnx-community/Qwen2.5-3B-Instruct', label: 'Qwen2.5 3B', size: '~1.8GB', quality: 'Terbaik', localDir: 'qwen2.5-3b' }
  ];
  var MODEL_BASE_PATH = 'data/models';
  var MODEL_STORAGE_KEY = 'ruangkita-ai-model';
  var DEVICE_STORAGE_KEY = 'ruangkita-ai-device';
  var MODEL_LOADED_KEY = 'ruangkita-ai-model-loaded';
  var CHAT_HISTORY_KEY = 'ruangkita-ai-chat';
  var MAX_CHAT = 50;

  var SYSTEM_PROMPT = 'Anda adalah analis geospasial ahli untuk Indonesia. ' +
    'Anda WAJIB menjawab berdasarkan data yang diberikan di dalam pesan. ' +
    'JANGAN PERNAH menolak, berkata "tidak dapat", atau "tidak memiliki akses". ' +
    'Jika data tersedia, ANALISIS dan JAWAB. ' +
    'Selalu gunakan Bahasa Indonesia. Gunakan angka dan bullet point. ' +
    'Fokus pada data aktual, bukan teori umum.';

  /* ── Quick Actions ── */
  var QUICK_ACTIONS = [
    { label: '📊 SPPG', prompt: 'Berdasarkan data SPPG yang tersedia, analisis distribusi per kabupaten. Sebutkan 5 kabupaten terbanyak dan 5 tersedikit. Jelaskan pola geografisnya. Berikan rekomendasi pemerataan.' },
    { label: '🔥 Hotspot', prompt: 'Berdasarkan data hotspot yang tersedia, analisis kebakaran hutan dan lahan. Sebutkan 5 provinsi dengan hotspot terbanyak. Bandingkan confidence level. Berikan rekomendasi mitigasi.' },
    { label: '🗺️ Layer', prompt: 'Jelaskan layer apa saja yang aktif di peta saat ini. Apa saja yang bisa dianalisis dari layer-layer tersebut? Berikan ringkasan singkat.' },
    { label: '📍 Rekomendasi', prompt: 'Berdasarkan lokasi viewport saat ini (koordinat dan zoom), rekomendasikan 3-5 layer geospasial yang paling relevan untuk dianalisis di wilayah ini. Jelaskan alasannya.' },
    { label: '📋 Ringkasan', prompt: 'Buat ringkasan lengkap kondisi wilayah berdasarkan semua data yang tersedia di peta: lokasi, layer aktif, data SPPG, data hotspot. Sertakan angka kunci dan insight.' }
  ];

  /* ── Helpers ── */
  function $(id) { return document.getElementById(id); }

  function setStatus(html) {
    var el = $('ais-status');
    if (el) { el.classList.remove('hidden'); el.innerHTML = html; }
  }

  function hideStatus() {
    var el = $('ais-status');
    if (el) el.classList.add('hidden');
  }

  /* ── Model Management ── */
  function getSelectedModel() {
    var saved = localStorage.getItem(MODEL_STORAGE_KEY);
    if (saved) {
      var found = MODEL_OPTIONS.find(function (m) { return m.id === saved; });
      if (found) return found;
    }
    return MODEL_OPTIONS[0];
  }

  function getSelectedDevice() {
    return localStorage.getItem(DEVICE_STORAGE_KEY) || 'wasm';
  }

  function setSelectedModel(modelId) {
    localStorage.setItem(MODEL_STORAGE_KEY, modelId);
  }

  function setSelectedDevice(device) {
    localStorage.setItem(DEVICE_STORAGE_KEY, device);
  }

  async function ensureTransformers() {
    if (!transformers) {
      transformers = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0');
    }
    return transformers;
  }

  function getLocalModelPath(model) {
    return MODEL_BASE_PATH + '/' + model.localDir;
  }

  function setProgressStatus(el, text) {
    if (el) el.innerHTML = '<div class="ais-chat-status">' + text + '</div>';
  }

  async function loadModel() {
    if (modelLoading) return;
    modelLoading = true;

    var model = getSelectedModel();
    var dev = getSelectedDevice();
    var localPath = getLocalModelPath(model);

    var statusEl = $('ais-status');
    if (statusEl) {
      statusEl.classList.remove('hidden');
      setProgressStatus(statusEl, 'Memeriksa model lokal...');
    }

    try {
      var tf = await ensureTransformers();

      try {
        tf.env.backends.onnx.wasm.numThreads = 2;
        tf.env.allowLocalModels = false;
      } catch (e) { /* env config may not be available */ }

      var downloadDone = false;

      generator = await tf.pipeline(
        'text-generation',
        model.id,
        {
          dtype: 'q4',
          device: dev,
          progress_callback: function (data) {
            if (!statusEl) return;

            if (data.status === 'progress_total') {
              var pct = data.progress ? data.progress.toFixed(0) : '0';
              setProgressStatus(statusEl, 'Mengunduh model... ' + pct + '%');
              return;
            }

            if (data.status === 'progress' && data.file) {
              var filePct = data.progress ? data.progress.toFixed(0) : '0';
              var fileName = data.file.split('/').pop();
              setProgressStatus(statusEl, 'Mengunduh ' + fileName + '... ' + filePct + '%');
              return;
            }

            if (data.status === 'done') {
              var doneName = data.file ? data.file.split('/').pop() : '';
              if (doneName) setProgressStatus(statusEl, '✓ ' + doneName + ' selesai');
              return;
            }

            if (data.status === 'ready') {
              downloadDone = true;
              setProgressStatus(statusEl, 'Menyiapkan model...');
              return;
            }

            if (data.status === 'initiate') {
              var initName = data.name ? data.name.split('/').pop() : '';
              if (initName) setProgressStatus(statusEl, 'Memulai unduh ' + initName + '...');
            }
          },
          session_options: {
            graphOptimizationLevel: 'all',
            enableCpuMemArena: true,
            enableMemPattern: true
          }
        }
      );

      modelLoaded = true;
      modelLoading = false;
      localStorage.setItem(MODEL_LOADED_KEY, model.id);

      if (statusEl) {
        setProgressStatus(statusEl, '<span class="ais-ready">✓ ' + model.label + ' siap digunakan</span>');
        setTimeout(hideStatus, 2000);
      }

    } catch (err) {
      modelLoading = false;
      localStorage.removeItem(MODEL_LOADED_KEY);
      console.error('[AI] Model load failed:', err);
      if (statusEl) {
        var errMsg = err.message || String(err);
        if (errMsg.indexOf('quota') !== -1 || errMsg.indexOf('QuotaExceeded') !== -1) {
          setProgressStatus(statusEl, '<span class="ais-error">⚠ Memori penuh. Tutup tab lain atau gunakan model lebih ringan.</span>');
        } else {
          setProgressStatus(statusEl, '<span class="ais-error">⚠ Gagal memuat: ' + errMsg +
            '<br><small>Coba pilih model lebih ringan atau ganti device.</small></span>');
        }
      }
    }
  }

  async function disposeModel() {
    if (generator) {
      try {
        await generator.dispose();
      } catch (e) {
        console.warn('[AI] dispose error:', e);
      }
      generator = null;
    }
    modelLoaded = false;
    modelLoading = false;
  }

  window._aiRetryLoad = async function () {
    await disposeModel();
    loadModel();
  };

  window._aiSelectModel = async function (modelId) {
    setSelectedModel(modelId);
    await disposeModel();
    localStorage.removeItem(MODEL_LOADED_KEY);
    renderModelSelector();
    loadModel();
  };

  window._aiSelectDevice = async function (device) {
    setSelectedDevice(device);
    await disposeModel();
    renderModelSelector();
    loadModel();
  };

  /* ── Data Extractors ── */
  function extractSppgData() {
    var raw = (window.getSppgDistrictData && window.getSppgDistrictData()) || [];
    if (!raw.length) return null;
    var byDistrict = {};
    raw.forEach(function (item) {
      var d = (item.district || item.kabkota || '').trim();
      if (!d) return;
      var key = d.toUpperCase().replace(/^KOTA\s+/, '').replace(/KAB\.\s*/i, '');
      if (!byDistrict[key]) byDistrict[key] = { name: d, count: 0, province: item.province || '' };
      byDistrict[key].count++;
    });
    var sorted = Object.values(byDistrict).sort(function (a, b) { return b.count - a.count; });
    return { total: raw.length, totalDistricts: sorted.length, top10: sorted.slice(0, 10), bottom10: sorted.slice(-10).reverse() };
  }

  function extractHotspotData() {
    var features = (window.getHotspotFeatures && window.getHotspotFeatures()) || [];
    if (!features.length) return null;
    var byProvinsi = {};
    var confidence = { high: 0, medium: 0, low: 0 };
    features.forEach(function (f) {
      var p = (f.properties.nama_provinsi || 'Tidak Diketahui').trim();
      if (!byProvinsi[p]) byProvinsi[p] = { provinsi: p, count: 0 };
      byProvinsi[p].count++;
      var c = (f.properties.confidence_level || '').toLowerCase();
      if (confidence.hasOwnProperty(c)) confidence[c]++;
    });
    var sorted = Object.values(byProvinsi).sort(function (a, b) { return b.count - a.count; });
    return { total: features.length, confidence: confidence, top10: sorted.slice(0, 10) };
  }

  function extractActiveLayers() {
    var layers = [];
    var quickBtns = document.querySelectorAll('.ql-btn.active');
    quickBtns.forEach(function (btn) {
      var nameMap = {
        'qlHotspot': 'Hotspot', 'qlPm25': 'PM2.5', 'qlWind': 'Angin',
        'qlHujan': 'Hujan', 'qlRadar': 'Radar', 'qlProvinsi': 'Batas Provinsi'
      };
      if (nameMap[btn.id]) layers.push(nameMap[btn.id]);
    });
    var lcCheckboxes = document.querySelectorAll('.lc-item input[type="checkbox"]:checked');
    lcCheckboxes.forEach(function (cb) {
      var item = cb.closest('.lc-item');
      if (item) {
        var label = item.querySelector('.lc-item-label');
        if (label) {
          var name = label.textContent.trim();
          if (layers.indexOf(name) === -1) layers.push(name);
        }
      }
    });
    return layers;
  }

  function extractViewportInfo() {
    if (typeof map === 'undefined' || !map) return null;
    var bounds = map.getBounds();
    return {
      center: { lat: map.getCenter().lat.toFixed(3), lng: map.getCenter().lng.toFixed(3) },
      zoom: map.getZoom(),
      bounds: { south: bounds.getSouth().toFixed(3), west: bounds.getWest().toFixed(3), north: bounds.getNorth().toFixed(3), east: bounds.getEast().toFixed(3) }
    };
  }

  function gatherContext() {
    var ctx = '';

    var viewport = extractViewportInfo();
    if (viewport) {
      ctx += '=== LOKASI SAAT INI ===\n';
      ctx += 'Koordinat: ' + viewport.center.lat + ', ' + viewport.center.lng + '\n';
      ctx += 'Zoom level: ' + viewport.zoom + '\n';
      ctx += 'Area bbox: ' + viewport.bounds.south + ',' + viewport.bounds.west + ' - ' + viewport.bounds.north + ',' + viewport.bounds.east + '\n\n';
    }

    var layers = extractActiveLayers();
    if (layers.length) {
      ctx += '=== LAYER AKTIF ===\n' + layers.join(', ') + '\n\n';
    }

    var sppg = extractSppgData();
    if (sppg) {
      ctx += '=== DATA SPPG (MBG) ===\n';
      ctx += 'Total: ' + sppg.total + ' unit di ' + sppg.totalDistricts + ' kabupaten/kota\n';
      if (sppg.top10.length) {
        ctx += 'Top 10 terbanyak: ' + sppg.top10.map(function (x) { return x.name + '(' + x.count + ')'; }).join(', ') + '\n';
      }
      if (sppg.bottom10.length) {
        ctx += 'Bottom 10 tersedikit: ' + sppg.bottom10.map(function (x) { return x.name + '(' + x.count + ')'; }).join(', ') + '\n';
      }
      ctx += '\n';
    }

    var hotspot = extractHotspotData();
    if (hotspot) {
      ctx += '=== DATA HOTSPOT KARHUTLA ===\n';
      ctx += 'Total: ' + hotspot.total + ' titik\n';
      ctx += 'Confidence: High=' + hotspot.confidence.high + ', Medium=' + hotspot.confidence.medium + ', Low=' + hotspot.confidence.low + '\n';
      if (hotspot.top10.length) {
        ctx += 'Top 10 provinsi: ' + hotspot.top10.map(function (x) { return x.provinsi + '(' + x.count + ')'; }).join(', ') + '\n';
      }
      ctx += '\n';
    }

    return ctx;
  }

  /* ── Chat Logic ── */
  function addChatMessage(role, text) {
    chatHistory.push({ role: role, content: text, time: Date.now() });
    if (chatHistory.length > MAX_CHAT) chatHistory = chatHistory.slice(-MAX_CHAT);
    renderChat();
    saveChatHistory();
  }

  function renderChat() {
    var container = $('ais-chat-messages');
    if (!container) return;

    var html = '';
    chatHistory.forEach(function (msg) {
      var cls = msg.role === 'user' ? 'ais-msg-user' : 'ais-msg-ai';
      var text = msg.role === 'user' ? escapeHtml(msg.text || msg.content) : formatMarkdown(msg.content || msg.text);
      html += '<div class="ais-msg ' + cls + '">' +
        '<div class="ais-msg-avatar">' + (msg.role === 'user' ? '👤' : '🤖') + '</div>' +
        '<div class="ais-msg-content">' + text + '</div>' +
        '</div>';
    });

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
  }

  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  }

  function formatMarkdown(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      .replace(/^\d+\. (.+)$/gm, '<div class="ais-list-item">$1</div>')
      .replace(/^[-•] (.+)$/gm, '<div class="ais-list-item">• $1</div>')
      .replace(/\n{2,}/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }

  function isGenericRefusal(text) {
    var t = text.toLowerCase();
    var patterns = [
      'tidak dapat memberikan informasi',
      'tidak bisa memberikan informasi',
      'maaf, saya tidak',
      'saya tidak memiliki akses',
      'tidak memiliki data',
      'tidak dapat menjawab'
    ];
    return patterns.some(function (p) { return t.indexOf(p) !== -1; });
  }

  function saveChatHistory() {
    try { localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory)); } catch (e) {}
  }

  function loadChatHistory() {
    try { chatHistory = JSON.parse(localStorage.getItem(CHAT_HISTORY_KEY) || '[]'); } catch (e) { chatHistory = []; }
  }

  window._aiClearChat = function () {
    chatHistory = [];
    localStorage.removeItem(CHAT_HISTORY_KEY);
    renderChat();
  };

  window._aiSendQuick = function (idx) {
    var action = QUICK_ACTIONS[idx];
    if (action) sendMessage(action.prompt);
  };

  async function sendMessage(text) {
    if (!text.trim() || isGenerating) return;

    var input = $('ais-chat-input');
    if (input) input.value = '';

    addChatMessage('user', text);

    if (!modelLoaded) {
      addChatMessage('ai', 'Memuat model AI...');
      await loadModel();
      if (!modelLoaded) {
        chatHistory.pop();
        addChatMessage('ai', '⚠ Model belum dimuat. Buka Pengaturan Model untuk memilih dan memuat model.');
        renderChat();
        return;
      }
      chatHistory.pop();
    }

    isGenerating = true;
    addChatMessage('ai', '⏳ Menganalisis...');
    renderChat();

    try {
      var context = gatherContext();
      var fullPrompt = '';
      if (context) {
        fullPrompt += 'Gunakan data berikut untuk menjawab:\n\n';
        fullPrompt += context;
        fullPrompt += '---\n\n';
      }
      fullPrompt += 'Pertanyaan: ' + text + '\n\n';
      fullPrompt += 'Jawaban (dalam Bahasa Indonesia, gunakan data di atas):';

      var messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: fullPrompt }
      ];

      var result = await Promise.race([
        generator(messages, { max_new_tokens: 768, do_sample: false, temperature: 0.3 }),
        new Promise(function (_, reject) {
          setTimeout(function () { reject(new Error('Timeout 60 detik')); }, 60000);
        })
      ]);

      var aiText = result[0].generated_text.at(-1).content;

      if (isGenericRefusal(aiText) && context) {
        aiText += '\n\n---\n💡 *Jika jawaban tidak memuaskan, coba upgrade model ke Qwen2.5 1.5B di Pengaturan Model untuk kualitas lebih baik.*';
      }

      chatHistory.pop();
      addChatMessage('ai', aiText);

    } catch (err) {
      chatHistory.pop();
      addChatMessage('ai', '⚠ Gagal: ' + (err.message || err));
    }

    isGenerating = false;
    renderChat();
  }

  window._aiSendMessage = function () {
    var input = $('ais-chat-input');
    if (input) sendMessage(input.value);
  };

  window._aiHandleKeydown = function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      window._aiSendMessage();
    }
  };

  /* ── UI: Model Selector ── */
  async function checkLocalModel(model) {
    try {
      var resp = await fetch(getLocalModelPath(model) + '/config.json', { method: 'HEAD' });
      return resp.ok;
    } catch (e) { return false; }
  }

  async function renderModelSelector() {
    var container = $('ais-model-selector');
    if (!container) return;

    var selected = getSelectedModel();
    var device = getSelectedDevice();

    var html = '<button class="ais-settings-toggle" onclick="this.classList.toggle(\'open\')">' +
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' +
      '<span>Pengaturan Model</span>' +
      '<span class="ais-settings-badge">' + selected.label + ' · ' + device.toUpperCase() + '</span>' +
      '<svg class="ais-settings-arrow" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>' +
      '</button>';

    html += '<div class="ais-settings-body">';

    html += '<div class="ais-model-select-group"><label class="ais-model-label">Model</label><div class="ais-model-options">';
    for (var i = 0; i < MODEL_OPTIONS.length; i++) {
      var m = MODEL_OPTIONS[i];
      var active = m.id === selected.id ? ' active' : '';
      var localAvail = await checkLocalModel(m);
      var statusDot = localAvail
        ? '<span class="ais-model-status ais-model-available" title="Tersedia offline">●</span>'
        : '<span class="ais-model-status ais-model-missing" title="Belum diunduh">○</span>';
      html += '<button class="ais-model-option' + active + '" onclick="window._aiSelectModel(\'' + m.id + '\')">' +
        statusDot +
        '<span class="ais-model-option-name">' + m.label + '</span>' +
        '<span class="ais-model-option-meta">' + m.size + '</span></button>';
    }
    html += '</div></div>';

    html += '<div class="ais-model-select-group"><label class="ais-model-label">Device</label><div class="ais-model-options">';
    [{ id: 'wasm', label: 'WASM' }, { id: 'webgpu', label: 'WebGPU' }].forEach(function (d) {
      var active = d.id === device ? ' active' : '';
      html += '<button class="ais-model-option' + active + '" onclick="window._aiSelectDevice(\'' + d.id + '\')">' +
        '<span class="ais-model-option-name">' + d.label + '</span></button>';
    });
    html += '</div></div>';

    html += '<div class="ais-model-select-group"><label class="ais-model-label">Device</label><div class="ais-model-options">';
    [{ id: 'wasm', label: 'WASM' }, { id: 'webgpu', label: 'WebGPU' }].forEach(function (d) {
      var active = d.id === device ? ' active' : '';
      html += '<button class="ais-model-option' + active + '" onclick="window._aiSelectDevice(\'' + d.id + '\')">' +
        '<span class="ais-model-option-name">' + d.label + '</span></button>';
    });
    html += '</div></div>';

    html += '<div class="ais-model-select-group"><label class="ais-model-label">Model Lokal</label><div class="ais-model-actions">' +
      '<button class="ais-action-btn" onclick="window._aiDownloadModel()"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download Model</button>' +
      '<button class="ais-action-btn" onclick="window._aiLoadLocalFolder()"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>Muat Folder</button>' +
      '</div></div>';

    if (!modelLoaded) {
      html += '<div class="ais-model-select-group"><button class="ais-load-btn" onclick="window._aiRetryLoad()"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>Muat Model</button></div>';
    }

    html += '</div>';
    container.innerHTML = html;
  }

  window._aiDownloadModel = function () {
    var model = getSelectedModel();
    var base = 'https://huggingface.co/' + model.id + '/resolve/main/';
    var files = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'generation_config.json'];
    files.forEach(function (f) {
      var a = document.createElement('a');
      a.href = base + f;
      a.download = '';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
    addChatMessage('ai', '✓ File config + tokenizer didownload.<br><br>' +
      '<strong>Cara simpan model lokal:</strong><br>' +
      '1. Download semua file di atas<br>' +
      '2. Download juga <code>model_q4.onnx</code> dari:<br>' +
      '<code>' + base + 'model_q4.onnx</code><br>' +
      '3. Simpan semua file ke folder:<br>' +
      '<code>data/models/' + model.localDir + '/</code><br><br>' +
      '<em>Model akan otomatis terdeteksi saat buka ulang Pengaturan Model.</em>');
  };

  window._aiLoadLocalFolder = function () {
    var input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.onchange = function (e) {
      var files = Array.from(e.target.files);
      if (!files.length) return;
      var hasConfig = files.some(function (f) { return f.name === 'config.json'; });
      var hasModel = files.some(function (f) { return f.name.endsWith('.onnx'); });
      if (!hasConfig || !hasModel) {
        addChatMessage('ai', '⚠ Folder tidak valid. Harus berisi config.json dan file .onnx');
        return;
      }
      addChatMessage('ai', 'Memuat model lokal...');
      (async function () {
        try {
          var tf = await ensureTransformers();
          var fileMap = {};
          files.forEach(function (f) { fileMap[f.name] = URL.createObjectURL(f); });
          generator = await tf.pipeline('text-generation', fileMap['config.json'], { dtype: 'q4', device: getSelectedDevice() });
          modelLoaded = true;
          addChatMessage('ai', '✓ Model lokal berhasil dimuat!');
          renderModelSelector();
        } catch (err) {
          addChatMessage('ai', '⚠ Gagal: ' + err.message);
        }
      })();
    };
    input.click();
  };

  /* ── Sheet Controls ── */
  function openAiSheet() {
    var sheet = $('ai-sheet');
    if (!sheet) return;
    sheet.classList.add('ais-sheet-open');
    sheetOpen = true;
    sheetMinimized = false;
    renderModelSelector();
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
    // Release model from RAM when sheet is closed
    disposeModel();
  }

  function minimizeAiSheet() {
    var sheet = $('ai-sheet');
    if (!sheet) return;
    sheetMinimized = !sheetMinimized;
    sheet.classList.toggle('ais-sheet-minimized', sheetMinimized);
    sheet.classList.toggle('ais-sheet-open', !sheetMinimized);
  }

  function toggleAiSheet() {
    if (sheetOpen) closeAiSheet(); else openAiSheet();
  }

  window.openAiSheet = openAiSheet;
  window.closeAiSheet = closeAiSheet;
  window.minimizeAiSheet = minimizeAiSheet;
  window.toggleAiSheet = toggleAiSheet;

  /* ── Init ── */
  function initAiAnalysis() {
    var triggerBtn = $('aiAnalysisBtn');
    if (triggerBtn) triggerBtn.addEventListener('click', toggleAiSheet);

    loadChatHistory();
    renderChat();
    renderModelSelector();

    var quickBtns = document.querySelectorAll('.ais-quick-btn');
    quickBtns.forEach(function (btn, idx) {
      btn.addEventListener('click', function () { window._aiSendQuick(idx); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAiAnalysis);
  } else {
    initAiAnalysis();
  }

})();
