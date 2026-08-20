const FALLBACK_CONFIG = Object.freeze({
  app: {
    name: 'GPS Map Camera',
    shortName: 'GPS Camera',
    packageId: 'id.irvan.gpsmapcamera',
    versionName: '1.0.0',
    versionCode: 1,
    projectSchemaVersion: 2,
  },
  features: {
    batchExport: true,
    customPresets: true,
    nativeBridge: true,
    offlineEditor: true,
  },
  maps: {
    defaultProvider: 'openstreetmap',
    defaultZoom: 16,
    minZoom: 2,
    maxZoom: 19,
    providers: [{
      id: 'openstreetmap',
      label: 'Standard',
      style: 'standard',
      enabled: true,
      tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }],
  },
  geocoding: {
    enabled: true,
    endpoint: 'https://nominatim.openstreetmap.org',
    language: 'id',
    minimumIntervalMs: 1100,
    cacheTtlDays: 30,
  },
  export: {
    defaultQuality: 'high',
    jpegQuality: { maximum: 0.96, high: 0.9, medium: 0.78 },
    maxMegapixels: { maximum: 80, high: 24, medium: 12 },
    fileNamePattern: 'GPSMapCamera-{date}-{time}',
  },
});

let runtimeConfig = FALLBACK_CONFIG;

function deepMerge(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return base;
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = deepMerge(base?.[key] ?? {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export async function loadRuntimeConfig() {
  try {
    const response = await fetch('./app.config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Config HTTP ${response.status}`);
    runtimeConfig = deepMerge(FALLBACK_CONFIG, await response.json());
  } catch (error) {
    console.warn('[config] Falling back to built-in defaults', error);
    runtimeConfig = FALLBACK_CONFIG;
  }
  return runtimeConfig;
}

export function getConfig() {
  return runtimeConfig;
}

export function getMapProvider(providerId) {
  const enabledProviders = runtimeConfig.maps.providers.filter((provider) => provider.enabled);
  return enabledProviders.find((provider) => provider.id === providerId)
    ?? enabledProviders.find((provider) => provider.id === runtimeConfig.maps.defaultProvider)
    ?? enabledProviders[0]
    ?? FALLBACK_CONFIG.maps.providers[0];
}
