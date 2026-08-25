import { getConfig } from '../config/runtime-config.js';
import { getGeoCache, setGeoCache } from '../storage/database.js';
import { wait } from '../utils/async.js';
import { isValidCoordinate } from '../utils/geo.js';

let lastGeocodeRequestAt = 0;
let nativeRequest = null;

function normalizePosition(coords, source) {
  return {
    latitude: Number(coords.latitude),
    longitude: Number(coords.longitude),
    accuracy: Number.isFinite(coords.accuracy) ? Number(coords.accuracy) : null,
    altitude: Number.isFinite(coords.altitude) ? Number(coords.altitude) : null,
    speed: Number.isFinite(coords.speed) ? Number(coords.speed) : null,
    compass: Number.isFinite(coords.heading) ? Number(coords.heading) : null,
    source,
  };
}

export function watchCurrentLocation(onUpdate, onError = () => {}, options = {}) {
  const settings = { enableHighAccuracy: true, timeout: 22000, maximumAge: 3000, ...options };
  if (navigator.geolocation?.watchPosition) {
    const watchId = navigator.geolocation.watchPosition(
      (position) => onUpdate(normalizePosition(position.coords, 'device-gps')),
      (error) => onError(friendlyLocationError(error)),
      settings,
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }
  let active = true;
  let timer = null;
  const poll = async () => {
    try { if (active) onUpdate(await getCurrentLocation(settings)); }
    catch (error) { if (active) onError(error); }
    if (active) timer = setTimeout(poll, 12000);
  };
  poll();
  return () => { active = false; clearTimeout(timer); };
}

export async function getCurrentLocation(options = {}) {
  const settings = {
    enableHighAccuracy: true,
    timeout: 20000,
    maximumAge: 5000,
    ...options,
  };

  if ('geolocation' in navigator) {
    try {
      return await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) => resolve(normalizePosition(position.coords, 'device-gps')),
          reject,
          settings,
        );
      });
    } catch (error) {
      console.warn('[location] Browser geolocation gagal, mencoba native bridge', error);
      if (!globalThis.AndroidBridge?.requestLocation) throw friendlyLocationError(error);
    }
  }

  if (globalThis.AndroidBridge?.requestLocation) return requestNativeLocation(settings.timeout);
  throw new Error('GPS tidak tersedia pada perangkat ini.');
}

function requestNativeLocation(timeout) {
  if (nativeRequest) return nativeRequest.promise;
  let resolveRequest;
  let rejectRequest;
  const promise = new Promise((resolve, reject) => {
    resolveRequest = resolve;
    rejectRequest = reject;
  });
  const timer = setTimeout(() => {
    nativeRequest = null;
    rejectRequest(new Error('GPS belum mendapatkan lock. Coba lagi atau pilih lokasi manual.'));
  }, timeout + 3000);
  nativeRequest = { promise, resolveRequest, rejectRequest, timer };
  globalThis.AndroidBridge.requestLocation();
  return promise;
}

globalThis.__nativeLocationSuccess = (payload) => {
  if (!nativeRequest) return;
  clearTimeout(nativeRequest.timer);
  try {
    const coords = typeof payload === 'string' ? JSON.parse(payload) : payload;
    nativeRequest.resolveRequest(normalizePosition(coords, 'native-gps'));
  } catch (error) {
    nativeRequest.rejectRequest(error);
  }
  nativeRequest = null;
};

globalThis.__nativeLocationError = (message) => {
  if (!nativeRequest) return;
  clearTimeout(nativeRequest.timer);
  nativeRequest.rejectRequest(new Error(message || 'Lokasi native gagal diperoleh.'));
  nativeRequest = null;
};

function friendlyLocationError(error) {
  if (error?.code === 1) return new Error('Izin lokasi ditolak. Pilih lokasi manual atau buka pengaturan aplikasi.');
  if (error?.code === 2) return new Error('Sinyal GPS tidak tersedia. Aktifkan GPS dan coba lagi.');
  if (error?.code === 3) return new Error('GPS belum mendapatkan lock. Coba di area terbuka atau pilih lokasi manual.');
  return new Error(error?.message || 'Lokasi tidak dapat diperoleh.');
}

export async function getPermissionSnapshot() {
  const result = { camera: 'prompt', location: 'prompt', storage: 'available' };
  if (!navigator.permissions?.query) return result;
  try {
    result.location = (await navigator.permissions.query({ name: 'geolocation' })).state;
  } catch { /* Not all WebViews implement Permission API. */ }
  try {
    result.camera = (await navigator.permissions.query({ name: 'camera' })).state;
  } catch { /* Camera permission is queried only during use. */ }
  return result;
}

export async function reverseGeocode(latitude, longitude) {
  if (!isValidCoordinate(latitude, longitude)) return null;
  const config = getConfig().geocoding;
  if (!config.enabled || !navigator.onLine) return null;
  const cacheKey = `reverse:${Number(latitude).toFixed(5)},${Number(longitude).toFixed(5)}:${config.language}`;
  const cached = await getGeoCache(cacheKey).catch(() => null);
  if (cached) return cached;
  await respectRateLimit(config.minimumIntervalMs);
  const endpoint = config.endpoint.replace(/\/$/, '');
  const url = new URL(`${endpoint}/reverse`);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('zoom', '18');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', config.language);
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Alamat gagal dimuat (HTTP ${response.status}).`);
  const data = await response.json();
  const result = normalizeAddress(data);
  await setGeoCache(cacheKey, result, config.cacheTtlDays * 86400000).catch(() => {});
  return result;
}

export async function searchPlaces(query) {
  const cleanQuery = String(query).trim();
  if (cleanQuery.length < 3) throw new Error('Masukkan minimal 3 karakter.');
  const config = getConfig().geocoding;
  if (!config.enabled) throw new Error('Pencarian alamat dinonaktifkan pada konfigurasi.');
  if (!navigator.onLine) throw new Error('Pencarian lokasi memerlukan internet.');
  const cacheKey = `search:${cleanQuery.toLocaleLowerCase('id-ID')}:${config.language}`;
  const cached = await getGeoCache(cacheKey).catch(() => null);
  if (cached) return cached;
  await respectRateLimit(config.minimumIntervalMs);
  const endpoint = config.endpoint.replace(/\/$/, '');
  const url = new URL(`${endpoint}/search`);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('q', cleanQuery);
  url.searchParams.set('limit', '6');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', config.language);
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Pencarian gagal (HTTP ${response.status}).`);
  const data = (await response.json()).map((item) => ({
    latitude: Number(item.lat),
    longitude: Number(item.lon),
    ...normalizeAddress(item),
  }));
  await setGeoCache(cacheKey, data, config.cacheTtlDays * 86400000).catch(() => {});
  return data;
}

async function respectRateLimit(minimumIntervalMs) {
  const remaining = minimumIntervalMs - (Date.now() - lastGeocodeRequestAt);
  if (remaining > 0) await wait(remaining);
  lastGeocodeRequestAt = Date.now();
}

function normalizeAddress(data) {
  const address = data.address ?? {};
  const road = address.road || address.pedestrian || address.path || address.hamlet || address.neighbourhood || '';
  const locality = [address.village || address.suburb || address.town || address.city, address.county, address.state]
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(', ');
  const placeName = [
    address.city_district || address.suburb || address.village || address.town || address.city || address.county,
    address.state,
    address.country,
  ].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).join(', ');
  return {
    address: data.display_name || [road, locality].filter(Boolean).join(', '),
    addressLines: [road, locality].filter(Boolean),
    placeName: placeName || locality || road,
    countryCode: String(address.country_code || '').toUpperCase(),
    rawAddress: address,
  };
}
