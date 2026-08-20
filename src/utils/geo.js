export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function wrapTileX(x, zoom) {
  const size = 2 ** zoom;
  return ((x % size) + size) % size;
}

export function longitudeToWorldX(longitude, zoom) {
  return ((longitude + 180) / 360) * (256 * 2 ** zoom);
}

export function latitudeToWorldY(latitude, zoom) {
  const safeLatitude = clamp(latitude, -85.05112878, 85.05112878);
  const radians = safeLatitude * Math.PI / 180;
  return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2
    * (256 * 2 ** zoom);
}

export function worldXToLongitude(x, zoom) {
  return x / (256 * 2 ** zoom) * 360 - 180;
}

export function worldYToLatitude(y, zoom) {
  const n = Math.PI - (2 * Math.PI * y) / (256 * 2 ** zoom);
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function offsetCoordinates(latitude, longitude, dx, dy, zoom) {
  const x = longitudeToWorldX(longitude, zoom) - dx;
  const y = latitudeToWorldY(latitude, zoom) - dy;
  return {
    latitude: worldYToLatitude(y, zoom),
    longitude: worldXToLongitude(x, zoom),
  };
}

export function formatCoordinate(value, format = 'decimal') {
  if (!Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  if (format === 'dms') {
    const absolute = Math.abs(number);
    const degrees = Math.floor(absolute);
    const minutesFloat = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesFloat);
    const seconds = ((minutesFloat - minutes) * 60).toFixed(2);
    return `${number < 0 ? '-' : ''}${degrees}° ${minutes}′ ${seconds}″`;
  }
  return number.toFixed(6);
}

export function isValidCoordinate(latitude, longitude) {
  if (latitude === null || latitude === undefined || latitude === ''
    || longitude === null || longitude === undefined || longitude === '') return false;
  return Number.isFinite(Number(latitude))
    && Number.isFinite(Number(longitude))
    && Number(latitude) >= -90
    && Number(latitude) <= 90
    && Number(longitude) >= -180
    && Number(longitude) <= 180;
}
