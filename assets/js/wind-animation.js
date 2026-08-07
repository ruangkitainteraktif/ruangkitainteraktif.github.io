(function () {
  const WIND_API_URL = 'https://bmkg-sus.geo.id/windmap/ecmwf/1000';
  const WIND_MIN = -50, WIND_MAX = 50;
  const PARTICLE_BASE = 3500;
  const SPEED_FACTOR = 0.25;
  const FADE_OPACITY = 0.93;

  let windLayer = null;
  let windMeta = null;
  let currentFrameIndex = 0;
  let isPlaying = false;
  let pCanvas, pCtx;
  let windImageData = null;
  let windW = 0, windH = 0;
  let particles = [];
  let animId = null;
  let windReady = false;
  let tileLayer = null;

  // Tile bounds cache for current frame
  let tileStartX = 0, tileStartY = 0, tileZoom = 3;

  function windFromPixel(r, g) {
    return {
      u: (r / 255) * (WIND_MAX - WIND_MIN) + WIND_MIN,
      v: (g / 255) * (WIND_MAX - WIND_MIN) + WIND_MIN
    };
  }

  function loadTileImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Tile load failed'));
      img.src = url;
    });
  }

  async function compositeTiles() {
    if (!windMeta || !windMeta.keyframes) return false;
    const keyframe = windMeta.keyframes[currentFrameIndex];
    if (!keyframe) return false;

    const z = windMeta.minzoom || 3;
    const n = Math.pow(2, z);
    const tileSize = 512;

    const bounds = map.getBounds();
    const nwLat = bounds.getNorth(), nwLng = bounds.getWest();
    const seLat = bounds.getSouth(), seLng = bounds.getEast();

    const nwTileX = Math.floor((nwLng + 180) / 360 * n);
    const nwTileY = Math.floor((1 - Math.log(Math.tan(nwLat * Math.PI / 180) + 1 / Math.cos(nwLat * Math.PI / 180)) / Math.PI) / 2 * n);
    const seTileX = Math.floor((seLng + 180) / 360 * n);
    const seTileY = Math.floor((1 - Math.log(Math.tan(seLat * Math.PI / 180) + 1 / Math.cos(seLat * Math.PI / 180)) / Math.PI) / 2 * n);

    const pad = 1;
    const startX = Math.max(0, nwTileX - pad);
    const endX = Math.min(n - 1, seTileX + pad);
    const startY = Math.max(0, nwTileY - pad);
    const endY = Math.min(n - 1, seTileY + pad);

    tileStartX = startX;
    tileStartY = startY;
    tileZoom = z;

    const cols = endX - startX + 1;
    const rows = endY - startY + 1;
    windW = cols * tileSize;
    windH = rows * tileSize;

    const compCanvas = document.createElement('canvas');
    compCanvas.width = windW;
    compCanvas.height = windH;
    const compCtx = compCanvas.getContext('2d');

    let corsOk = true;

    const promises = [];
    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const url = `${keyframe.id}/${z}/${x}/${y}.png`;
        promises.push(
          loadTileImage(url)
            .then(img => {
              const dx = (x - startX) * tileSize;
              const dy = (y - startY) * tileSize;
              compCtx.drawImage(img, dx, dy, tileSize, tileSize);
            })
            .catch(() => { corsOk = false; })
        );
      }
    }

    await Promise.all(promises);

    // Try reading pixel data
    if (corsOk) {
      try {
        const test = compCtx.getImageData(0, 0, 1, 1);
        if (test.data[3] > 0) {
          windImageData = compCtx.getImageData(0, 0, windW, windH);
          windReady = true;
          return true;
        }
      } catch (e) {
        corsOk = false;
      }
    }

    // CORS failed — just display tiles as regular Leaflet tile layer
    windReady = false;
    windImageData = null;
    showWindTiles(keyframe, z);
    return false;
  }

  function showWindTiles(keyframe, z) {
    if (tileLayer) { map.removeLayer(tileLayer); tileLayer = null; }
    const urlTemplate = `${keyframe.id}/${z}/{x}/{y}.png`;
    tileLayer = L.tileLayer(urlTemplate, {
      tileSize: 512,
      opacity: 0.7,
      maxZoom: 5,
      attribution: 'BMKG Wind'
    }).addTo(map);
  }

  function getWindVelocity(lat, lng) {
    if (!windImageData) return null;
    const z = tileZoom;
    const n = Math.pow(2, z);
    const tileSize = 512;

    const fx = (lng + 180) / 360 * n;
    const latRad = lat * Math.PI / 180;
    const fy = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;

    const px = (fx - tileStartX) * tileSize;
    const py = (fy - tileStartY) * tileSize;

    const ix = Math.floor(px);
    const iy = Math.floor(py);
    if (ix < 0 || ix >= windW || iy < 0 || iy >= windH) return null;

    const i = (iy * windW + ix) * 4;
    const r = windImageData.data[i];
    const g = windImageData.data[i + 1];
    const a = windImageData.data[i + 3];
    if (a === 0 || (r === 0 && g === 0)) return null;
    return windFromPixel(r, g);
  }

  function createParticle(bounds) {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    return {
      lat: sw.lat + Math.random() * (ne.lat - sw.lat),
      lng: sw.lng + Math.random() * (ne.lng - sw.lng),
      prevLat: 0, prevLng: 0,
      age: Math.floor(Math.random() * 60) + 20,
      maxAge: 80
    };
  }

  function initParticles() {
    particles = [];
    const bounds = map.getBounds();
    const n = Math.floor(PARTICLE_BASE * (map.getZoom() / 5));
    for (let i = 0; i < n; i++) {
      const p = createParticle(bounds);
      p.prevLat = p.lat;
      p.prevLng = p.lng;
      particles.push(p);
    }
  }

  function latLngToCanvas(lat, lng) {
    const bounds = map.getBounds();
    const sz = map.getSize();
    return {
      x: (lng - bounds.getWest()) / (bounds.getEast() - bounds.getWest()) * sz.x,
      y: (bounds.getNorth() - lat) / (bounds.getNorth() - bounds.getSouth()) * sz.y
    };
  }

  function animate() {
    if (!isPlaying || !pCtx) return;
    animId = requestAnimationFrame(animate);

    const sz = map.getSize();
    pCtx.globalCompositeOperation = 'destination-out';
    pCtx.fillStyle = `rgba(0,0,0,${1 - FADE_OPACITY})`;
    pCtx.fillRect(0, 0, sz.x, sz.y);
    pCtx.globalCompositeOperation = 'source-over';

    if (!windReady) return;

    const bounds = map.getBounds();
    pCtx.lineWidth = 1.2;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const vel = getWindVelocity(p.lat, p.lng);

      if (vel) {
        const speed = Math.sqrt(vel.u * vel.u + vel.v * vel.v);
        p.prevLat = p.lat;
        p.prevLng = p.lng;
        p.lat += vel.v * SPEED_FACTOR * 0.001;
        p.lng += vel.u * SPEED_FACTOR * 0.001;
        p.age--;

        if (p.age <= 0 || p.lng < -180 || p.lng > 180 || p.lat < -85 || p.lat > 85 || speed < 0.5) {
          Object.assign(p, createParticle(bounds));
          p.prevLat = p.lat;
          p.prevLng = p.lng;
          continue;
        }

        const from = latLngToCanvas(p.prevLat, p.prevLng);
        const to = latLngToCanvas(p.lat, p.lng);

        if (from.x >= -10 && from.x <= sz.x + 10 && from.y >= -10 && from.y <= sz.y + 10) {
          const alpha = Math.min(1, speed / 12) * 0.85;
          let r, g, b;
          if (speed < 3) { r = 100; g = 180; b = 255; }
          else if (speed < 8) { r = 50; g = 220; b = 120; }
          else if (speed < 15) { r = 255; g = 220; b = 50; }
          else { r = 255; g = 80; b = 50; }
          pCtx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
          pCtx.beginPath();
          pCtx.moveTo(from.x, from.y);
          pCtx.lineTo(to.x, to.y);
          pCtx.stroke();
        }
      } else {
        Object.assign(p, createParticle(bounds));
        p.prevLat = p.lat;
        p.prevLng = p.lng;
      }
    }
  }

  const WindLayer = L.Layer.extend({
    onAdd(map) {
      this._map = map;
      pCanvas = document.createElement('canvas');
      pCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:600;';
      map.getContainer().appendChild(pCanvas);
      pCtx = pCanvas.getContext('2d');
      pCanvas.width = map.getSize().x;
      pCanvas.height = map.getSize().y;

      this._onResize = () => {
        if (pCanvas) { pCanvas.width = map.getSize().x; pCanvas.height = map.getSize().y; }
      };
      this._onMove = () => { compositeTiles(); };
      window.addEventListener('resize', this._onResize);
      map.on('moveend zoomend', this._onMove, this);

      compositeTiles().then(() => { initParticles(); animate(); });
    },
    onRemove(map) {
      stopAnimation();
      window.removeEventListener('resize', this._onResize);
      map.off('moveend zoomend', this._onMove, this);
      if (tileLayer) { map.removeLayer(tileLayer); tileLayer = null; }
      if (pCanvas && pCanvas.parentNode) pCanvas.parentNode.removeChild(pCanvas);
      pCanvas = null; pCtx = null;
      windImageData = null; windReady = false;
    }
  });

  function startAnimation() {
    if (isPlaying) return;
    isPlaying = true;
    compositeTiles().then(() => {
      initParticles();
      if (isPlaying) animate();
    });
  }

  function stopAnimation() {
    isPlaying = false;
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    particles = [];
    windImageData = null;
    windReady = false;
    if (pCtx && pCanvas) pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
  }

  function updateTimestamp() {
    const el = document.getElementById('windTimestamp');
    if (el && windMeta?.keyframes?.[currentFrameIndex]) {
      el.textContent = windMeta.keyframes[currentFrameIndex].timestamp.replace('T', ' ').slice(0, 16) + ' UTC';
    }
  }

  window.initWindAnimation = async function () {
    try {
      const res = await fetch(WIND_API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      windMeta = await res.json();
      if (!windMeta.keyframes?.length) throw new Error('Tidak ada keyframe');

      const now = new Date();
      let closest = 0;
      windMeta.keyframes.forEach((kf, i) => {
        if (Math.abs(new Date(kf.timestamp) - now) < Math.abs(new Date(windMeta.keyframes[closest].timestamp) - now)) closest = i;
      });
      currentFrameIndex = closest;

      if (!windLayer) {
        windLayer = new WindLayer();
        windLayer.addTo(map);
      } else {
        compositeTiles();
      }
      updateTimestamp();
    } catch (err) {
      console.error('Wind animation error:', err);
    }
  };

  window.toggleWindAnimation = function (show) {
    if (show) {
      window.initWindAnimation();
    } else {
      if (windLayer) { map.removeLayer(windLayer); windLayer = null; }
      stopAnimation();
      if (tileLayer) { map.removeLayer(tileLayer); tileLayer = null; }
    }
  };

  window.stepWindFrame = function (dir) {
    if (!windMeta?.keyframes) return;
    currentFrameIndex = (currentFrameIndex + dir + windMeta.keyframes.length) % windMeta.keyframes.length;
    compositeTiles().then(() => updateTimestamp());
  };

  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('toggleWindAnim');
    const controls = document.getElementById('windControls');
    if (toggle) {
      toggle.addEventListener('change', () => {
        const show = toggle.checked;
        if (controls) controls.style.display = show ? 'flex' : 'none';
        window.toggleWindAnimation(show);
      });
    }
    document.getElementById('windPrev')?.addEventListener('click', () => window.stepWindFrame(-1));
    document.getElementById('windNext')?.addEventListener('click', () => window.stepWindFrame(1));
  });
})();
