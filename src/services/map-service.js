import { getMapProvider } from '../config/runtime-config.js';
import { clamp, latitudeToWorldY, longitudeToWorldX, wrapTileX } from '../utils/geo.js';

const TILE_SIZE = 256;
const imageCache = new Map();

export function buildTileUrl(provider, zoom, x, y) {
  return provider.tileUrl
    .replace('{z}', String(zoom))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

export function getTileLayout(latitude, longitude, zoom, width, height, providerId) {
  const provider = getMapProvider(providerId);
  const safeZoom = clamp(Math.round(zoom), 2, provider.maxZoom ?? 19);
  const centerX = longitudeToWorldX(longitude, safeZoom);
  const centerY = latitudeToWorldY(latitude, safeZoom);
  const left = centerX - width / 2;
  const top = centerY - height / 2;
  const firstX = Math.floor(left / TILE_SIZE);
  const firstY = Math.floor(top / TILE_SIZE);
  const lastX = Math.floor((left + width) / TILE_SIZE);
  const lastY = Math.floor((top + height) / TILE_SIZE);
  const limit = 2 ** safeZoom;
  const tiles = [];

  for (let tileY = firstY; tileY <= lastY; tileY += 1) {
    if (tileY < 0 || tileY >= limit) continue;
    for (let tileX = firstX; tileX <= lastX; tileX += 1) {
      const wrappedX = wrapTileX(tileX, safeZoom);
      tiles.push({
        x: tileX * TILE_SIZE - left,
        y: tileY * TILE_SIZE - top,
        url: buildTileUrl(provider, safeZoom, wrappedX, tileY),
        tileX: wrappedX,
        tileY,
      });
    }
  }

  return { provider, zoom: safeZoom, tiles, centerX, centerY, left, top };
}

export async function drawMiniMap(context, bounds, location, options = {}) {
  const { x, y, width, height } = bounds;
  context.save();
  roundRectPath(context, x, y, width, height, options.radius ?? 18);
  context.clip();
  context.fillStyle = '#dbeafe';
  context.fillRect(x, y, width, height);

  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    drawMapUnavailable(context, bounds, 'Lokasi belum dipilih');
    context.restore();
    return { loaded: false };
  }

  const layout = getTileLayout(
    location.latitude,
    location.longitude,
    options.zoom ?? 16,
    width,
    height,
    options.providerId,
  );
  let loadedCount = 0;
  await Promise.all(layout.tiles.map(async (tile) => {
    try {
      const image = await loadTile(tile.url);
      context.drawImage(image, x + tile.x, y + tile.y, TILE_SIZE + 1, TILE_SIZE + 1);
      loadedCount += 1;
    } catch {
      // The map stays readable with a neutral fallback when a tile is unavailable.
    }
  }));

  if (!loadedCount) drawMapUnavailable(context, bounds, navigator.onLine ? 'Map gagal dimuat' : 'Map offline');
  drawMarker(context, x + width / 2, y + height / 2, Math.max(10, Math.min(width, height) * 0.11));
  drawAttribution(context, bounds, layout.provider.attribution);
  context.restore();
  return { loaded: loadedCount > 0, provider: layout.provider };
}

export function renderDomMap(container, location, options = {}) {
  if (!container) return;
  const width = container.clientWidth || options.width || 360;
  const height = container.clientHeight || options.height || 260;
  container.innerHTML = '';
  container.classList.add('map-surface');
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    container.innerHTML = '<div class="map-fallback">Lokasi belum dipilih</div>';
    return;
  }
  const layout = getTileLayout(location.latitude, location.longitude, options.zoom ?? 16, width, height, options.providerId);
  for (const tile of layout.tiles) {
    const image = document.createElement('img');
    image.className = 'map-tile';
    image.alt = '';
    image.draggable = false;
    image.loading = 'eager';
    image.src = tile.url;
    image.style.transform = `translate3d(${Math.round(tile.x)}px, ${Math.round(tile.y)}px, 0)`;
    container.append(image);
  }
  const marker = document.createElement('div');
  marker.className = 'map-pin';
  marker.innerHTML = '<span></span>';
  container.append(marker);
  const attribution = document.createElement('div');
  attribution.className = 'map-attribution';
  attribution.textContent = layout.provider.attribution;
  container.append(attribution);
}

function loadTile(url) {
  if (imageCache.has(url)) return imageCache.get(url);
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => {
      image.src = '';
      reject(new Error('Tile map timeout.'));
    }, 3000);
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('Tile gagal dimuat.')); };
    image.src = url;
  });
  imageCache.set(url, promise);
  promise.catch(() => imageCache.delete(url));
  if (imageCache.size > 180) imageCache.delete(imageCache.keys().next().value);
  return promise;
}

function drawMarker(context, centerX, centerY, halfSide) {
  // Teardrop pin yang identik dengan CSS .map-pin di kamera:
  // kotak dengan border-radius 50% 50% 50% 0 yang diputar -45deg,
  // sudut tajamnya (kiri-bawah) menjadi ujung pin di bawah.
  const s = halfSide;
  context.save();
  context.translate(centerX, centerY - s * 0.68);
  context.rotate(-Math.PI / 4);
  context.shadowColor = 'rgba(15,23,42,.35)';
  context.shadowBlur = s * 1.1;
  context.shadowOffsetY = s * 0.45;
  context.fillStyle = '#0ea5e9';
  context.beginPath();
  // Tiga sudut membulat 50% = tiga perempat lingkaran; sudut kiri-bawah tajam.
  context.arc(0, 0, s, Math.PI, Math.PI * 0.5, false);
  context.lineTo(-s, s);
  context.closePath();
  context.fill();
  // Titik putih di tengah, seperti .map-pin span.
  context.shadowColor = 'transparent';
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(0, 0, s * 0.43, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawAttribution(context, bounds, text) {
  // Sama seperti .map-attribution di kamera: teks mungil di kanan bawah, tanpa latar.
  context.save();
  context.font = `${Math.max(7, bounds.height * 0.05)}px system-ui, sans-serif`;
  context.textAlign = 'right';
  context.textBaseline = 'alphabetic';
  const padding = Math.max(3, bounds.height * 0.03);
  const x = bounds.x + bounds.width - padding;
  const y = bounds.y + bounds.height - padding;
  context.shadowColor = 'rgba(255,255,255,.85)';
  context.shadowBlur = 3;
  context.fillStyle = 'rgba(51,65,85,.92)';
  context.fillText(text, x, y, bounds.width - padding * 2);
  context.restore();
}

function drawMapUnavailable(context, bounds, label) {
  context.save();
  context.fillStyle = '#dbeafe';
  context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
  context.strokeStyle = 'rgba(14,165,233,.24)';
  context.lineWidth = 1;
  const step = Math.max(24, bounds.width / 7);
  for (let x = bounds.x; x < bounds.x + bounds.width; x += step) {
    context.beginPath(); context.moveTo(x, bounds.y); context.lineTo(x, bounds.y + bounds.height); context.stroke();
  }
  for (let y = bounds.y; y < bounds.y + bounds.height; y += step) {
    context.beginPath(); context.moveTo(bounds.x, y); context.lineTo(bounds.x + bounds.width, y); context.stroke();
  }
  context.fillStyle = '#475569';
  context.font = `${Math.max(11, bounds.height * 0.08)}px system-ui, sans-serif`;
  context.textAlign = 'center';
  context.fillText(label, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  context.restore();
}

function roundRectPath(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.roundRect(x, y, width, height, safeRadius);
}
