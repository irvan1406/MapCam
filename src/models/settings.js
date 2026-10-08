export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'system',
  defaultTemplateId: 'classic',
  coordinateFormat: 'decimal',
  dateFormat: 'long-id',
  timeFormat: '24-seconds',
  showSeconds: true,
  showTimeZone: true,
  mapProviderId: 'openstreetmap',
  mapZoom: 16,
  stampPosition: 'bottom-left',
  mapSize: 'medium',
  exportQuality: 'high',
  fileNamePattern: 'MapCam-{date}-{time}',
  showAddress: true,
  showCoordinates: true,
  autoSave: true,
  backgroundHighRes: true,
  customTileProvider: null,
});

export function normalizeSettings(value = {}) {
  const normalized = { ...DEFAULT_SETTINGS, ...value };
  if (normalized.fileNamePattern === 'GPSMapCamera-{date}-{time}') normalized.fileNamePattern = DEFAULT_SETTINGS.fileNamePattern;
  return normalized;
}
