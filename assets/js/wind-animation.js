(function () {
  'use strict';

  const API_URL = 'https://api.open-meteo.com/v1/forecast';
  const GRID_COLUMNS = 9;
  const GRID_ROWS = 7;
  const PARTICLE_COUNT = 520;
  const PARTICLE_LIFETIME = 90;
  const REFRESH_DELAY = 350;
  let windLayer = null;
  let canvas = null;
  let context = null;
  let particles = [];
  let windSamples = [];
  let animationId = null;
  let refreshTimer = null;
  let active = false;
  let requestId = 0;
  let lastFrame = 0;

  function setStatus(message) {
    const timestamp = document.getElementById('windTimestamp');
    if (timestamp) timestamp.textContent = message;
  }

  function resizeCanvas() {
    if (!canvas) return;
    const size = map.getSize();
    canvas.width = size.x;
    canvas.height = size.y;
  }

  function createParticle() {
    const size = map.getSize();
    return { x: Math.random() * size.x, y: Math.random() * size.y, previousX: 0, previousY: 0,
      age: Math.floor(Math.random() * PARTICLE_LIFETIME), maxAge: PARTICLE_LIFETIME };
  }

  function resetParticles() { particles = Array.from({ length: PARTICLE_COUNT }, createParticle); }

  function buildGridCoordinates() {
    const bounds = map.getBounds();
    const south = Math.max(-85, bounds.getSouth());
    const north = Math.min(85, bounds.getNorth());
    const west = bounds.getWest(), east = bounds.getEast();
    const coordinates = [];
    for (let row = 0; row < GRID_ROWS; row++) {
      const lat = south + ((north - south) * row / (GRID_ROWS - 1));
      for (let column = 0; column < GRID_COLUMNS; column++) {
        coordinates.push({ lat, lng: west + ((east - west) * column / (GRID_COLUMNS - 1)) });
      }
    }
    return coordinates;
  }

  async function loadWindData() {
    const coordinates = buildGridCoordinates();
    const thisRequest = ++requestId;
    setStatus('Memuat data angin Open-Meteo…');
    const params = new URLSearchParams({
      latitude: coordinates.map(point => point.lat.toFixed(4)).join(','),
      longitude: coordinates.map(point => point.lng.toFixed(4)).join(','),
      current: 'wind_speed_10m,wind_direction_10m', wind_speed_unit: 'ms', timezone: 'auto'
    });
    const response = await fetch(`${API_URL}?${params}`);
    if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : [payload];
    if (!active || thisRequest !== requestId) return;
    windSamples = rows.map((item, index) => {
      const current = item.current || {};
      const direction = Number(current.wind_direction_10m), speed = Number(current.wind_speed_10m);
      // Weather services express direction as the wind's origin; particles travel in the opposite direction.
      const radians = (direction + 180) * Math.PI / 180;
      return { lat: coordinates[index].lat, lng: coordinates[index].lng,
        u: Number.isFinite(speed) ? speed * Math.sin(radians) : 0,
        v: Number.isFinite(speed) ? speed * Math.cos(radians) : 0 };
    }).filter(sample => Number.isFinite(sample.u) && Number.isFinite(sample.v));
    const sampleTime = rows[0]?.current?.time;
    setStatus(sampleTime ? `Open-Meteo · ${sampleTime.replace('T', ' ')}` : 'Open-Meteo · data terkini');
    resetParticles();
  }

  function velocityAt(latlng) {
    if (!windSamples.length) return null;
    let u = 0, v = 0, totalWeight = 0;
    for (const sample of windSamples) {
      const distanceSquared = (sample.lat - latlng.lat) ** 2 + (sample.lng - latlng.lng) ** 2;
      const weight = 1 / Math.max(distanceSquared, 0.0001);
      u += sample.u * weight; v += sample.v * weight; totalWeight += weight;
    }
    return { u: u / totalWeight, v: v / totalWeight };
  }

  function drawFrame(now) {
    if (!active || !context || !canvas) return;
    animationId = requestAnimationFrame(drawFrame);
    const elapsed = Math.min(2, Math.max(0.4, (now - lastFrame) / 16.67 || 1));
    lastFrame = now;
    const size = map.getSize();
    context.globalCompositeOperation = 'destination-out';
    context.fillStyle = 'rgba(0, 0, 0, 0.10)';
    context.fillRect(0, 0, size.x, size.y);
    context.globalCompositeOperation = 'source-over';
    for (const particle of particles) {
      const velocity = velocityAt(map.containerPointToLatLng([particle.x, particle.y]));
      particle.previousX = particle.x; particle.previousY = particle.y; particle.age -= elapsed;
      if (!velocity || particle.age <= 0) { Object.assign(particle, createParticle()); continue; }
      const speed = Math.hypot(velocity.u, velocity.v), scale = 0.8 * elapsed;
      particle.x += velocity.u * scale; particle.y -= velocity.v * scale;
      if (particle.x < -8 || particle.x > size.x + 8 || particle.y < -8 || particle.y > size.y + 8 || speed < 0.15) {
        Object.assign(particle, createParticle()); continue;
      }
      context.beginPath();
      context.lineWidth = Math.min(1.8, 0.8 + speed / 18);
      context.strokeStyle = `rgba(112, 225, 255, ${Math.min(0.9, 0.25 + speed / 18)})`;
      context.moveTo(particle.previousX, particle.previousY); context.lineTo(particle.x, particle.y); context.stroke();
    }
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => loadWindData().catch(error => {
      console.error('Open-Meteo wind layer:', error);
      if (active) setStatus('Data angin tidak tersedia');
    }), REFRESH_DELAY);
  }

  const WindLayer = L.Layer.extend({
    onAdd() {
      canvas = document.createElement('canvas');
      canvas.className = 'leaflet-wind-particles';
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:600;';
      map.getContainer().appendChild(canvas); context = canvas.getContext('2d'); resizeCanvas();
      this.onResize = resizeCanvas; this.onMoveEnd = scheduleRefresh;
      map.on('resize', this.onResize); map.on('moveend zoomend', this.onMoveEnd);
      active = true;
      loadWindData().catch(error => { console.error('Open-Meteo wind layer:', error); setStatus('Data angin tidak tersedia'); });
      lastFrame = performance.now(); animationId = requestAnimationFrame(drawFrame);
    },
    onRemove() {
      active = false; requestId++; clearTimeout(refreshTimer); cancelAnimationFrame(animationId);
      map.off('resize', this.onResize); map.off('moveend zoomend', this.onMoveEnd);
      canvas?.remove(); canvas = null; context = null; particles = []; windSamples = [];
    }
  });

  window.initWindAnimation = function () {
    if (!windLayer) windLayer = new WindLayer();
    if (!map.hasLayer(windLayer)) windLayer.addTo(map);
  };
  window.toggleWindAnimation = function (show) {
    if (show) window.initWindAnimation();
    else if (windLayer && map.hasLayer(windLayer)) map.removeLayer(windLayer);
  };
  window.stepWindFrame = function () { scheduleRefresh(); };

  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('toggleWindAnim');
    const controls = document.getElementById('windControls');
    if (toggle) toggle.addEventListener('change', () => {
      if (controls) controls.style.display = toggle.checked ? 'flex' : 'none';
      window.toggleWindAnimation(toggle.checked);
    });
    document.getElementById('windPrev')?.addEventListener('click', window.stepWindFrame);
    document.getElementById('windNext')?.addEventListener('click', window.stepWindFrame);
  });
})();
