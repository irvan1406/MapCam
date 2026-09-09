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
  drawMarker(context, x + width / 2, y + height / 2, Math.max(9, Math.min(width, height) * 0.09));
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

function drawMarker(context, centerX, centerY, radius) {
  context.save();
  context.shadowColor = 'rgba(15, 23, 42, .38)';
  context.shadowBlur = radius * 0.8;
  context.shadowOffsetY = radius * 0.35;
  context.fillStyle = '#0ea5e9';
  context.beginPath();
  context.arc(centerX, centerY - radius * 0.45, radius, Math.PI * 0.08, Math.PI * 0.92, true);
  context.lineTo(centerX, centerY + radius * 1.6);
  context.closePath();
  context.fill();
  context.shadowColor = 'transparent';
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(centerX, centerY - radius * 0.45, radius * 0.38, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawAttribution(context, bounds, text) {
  context.save();
  context.font = `${Math.max(8, bounds.height * 0.042)}px system-ui, sans-serif`;
  const padding = Math.max(3, bounds.height * 0.025);
  const width = context.measureText(text).width + padding * 2;
  context.fillStyle = 'rgba(255,255,255,.78)';
  context.fillRect(bounds.x + bounds.width - width, bounds.y + bounds.height - 14 - padding, width, 14 + padding);
  context.fillStyle = '#334155';
  context.fillText(text, bounds.x + bounds.width - width + padding, bounds.y + bounds.height - padding);
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
