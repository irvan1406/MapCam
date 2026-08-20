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
  fileNamePattern: 'GPSMapCamera-{date}-{time}',
  showAddress: true,
  showCoordinates: true,
  autoSave: true,
  customTileProvider: null,
});

export function normalizeSettings(value = {}) {
  return { ...DEFAULT_SETTINGS, ...value };
}
