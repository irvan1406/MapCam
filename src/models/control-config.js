const BACKGROUNDS = new Set(['aurora', 'midnight', 'graphite', 'ocean']);
const NOTICE_FREQUENCIES = new Set(['once', 'every-open', 'limited']);
const CAPTURE_QUALITIES = new Set(['fast', 'high', 'maximum']);

export const DEFAULT_CONTROL_CONFIG = Object.freeze({
  schemaVersion: 1,
  revision: 1,
  branding: {
    appName: 'MapCam',
    headerTitle: 'MapCam',
    tagline: 'GPS Camera & Photo Editor',
    logoUrl: './icons/app-icon.svg',
    logoDataUrl: '',
    accentColor: '#0ea5e9',
    statusLabel: 'Siap',
  },
  camera: {
    autoSaveStamped: true,
    keepCameraOpen: true,
    saveOriginalToGallery: false,
    autoLocationForGallery: true,
    captureQuality: 'fast',
    showSaveConfirmation: true,
  },
  announcement: {
    enabled: false,
    id: 'welcome-v1',
    title: 'Informasi',
    message: '',
    frequency: 'once',
    displayLimit: 1,
    buttonLabel: 'Mengerti',
  },
  admin: {
    background: 'aurora',
  },
});

export function normalizeControlConfig(value = {}) {
  const merged = deepMerge(DEFAULT_CONTROL_CONFIG, value);
  const branding = merged.branding ?? {};
  const camera = merged.camera ?? {};
  const announcement = merged.announcement ?? {};
  const admin = merged.admin ?? {};
  return {
    schemaVersion: 1,
    revision: positiveInteger(merged.revision, 1),
    branding: {
      appName: cleanText(branding.appName, 'MapCam', 36),
      headerTitle: cleanText(branding.headerTitle, branding.appName || 'MapCam', 48),
      tagline: cleanText(branding.tagline, 'GPS Camera & Photo Editor', 80),
      logoUrl: safeImageSource(branding.logoUrl, './icons/app-icon.svg'),
      logoDataUrl: safeImageSource(branding.logoDataUrl, ''),
      accentColor: validColor(branding.accentColor) ? branding.accentColor.toLowerCase() : '#0ea5e9',
      statusLabel: cleanText(branding.statusLabel, 'Siap', 24),
    },
    camera: {
      autoSaveStamped: camera.autoSaveStamped !== false,
      keepCameraOpen: camera.keepCameraOpen !== false,
      saveOriginalToGallery: camera.saveOriginalToGallery === true,
      autoLocationForGallery: camera.autoLocationForGallery !== false,
      captureQuality: CAPTURE_QUALITIES.has(camera.captureQuality) ? camera.captureQuality : 'fast',
      showSaveConfirmation: camera.showSaveConfirmation !== false,
    },
    announcement: {
      enabled: announcement.enabled === true,
      id: cleanText(announcement.id, 'notice-v1', 64),
      title: cleanText(announcement.title, 'Informasi', 72),
      message: cleanMultiline(announcement.message, 1600),
      frequency: NOTICE_FREQUENCIES.has(announcement.frequency) ? announcement.frequency : 'once',
      displayLimit: clamp(positiveInteger(announcement.displayLimit, 1), 1, 50),
      buttonLabel: cleanText(announcement.buttonLabel, 'Mengerti', 28),
    },
    admin: {
      background: BACKGROUNDS.has(admin.background) ? admin.background : 'aurora',
    },
  };
}

export function mergeControlConfig(base, override) {
  return normalizeControlConfig(deepMerge(normalizeControlConfig(base), override));
}

function deepMerge(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return structuredClone(base);
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value)
      && result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = deepMerge(result[key], value);
    } else result[key] = value;
  }
  return result;
}

function cleanText(value, fallback, maximum) {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum);
  return clean || fallback;
}

function cleanMultiline(value, maximum) {
  return String(value ?? '').replace(/\r/g, '').trim().slice(0, maximum);
}

function safeImageSource(value, fallback) {
  const source = String(value ?? '').trim();
  if (!source) return fallback;
  if (/^(?:\.\.?\/|https:\/\/)/i.test(source)) return source.slice(0, 500);
  if (/^data:image\/(?:png|jpeg|webp|svg\+xml);base64,/i.test(source) && source.length <= 1_500_000) return source;
  return fallback;
}

function validColor(value) {
  return /^#[\da-f]{6}$/i.test(String(value ?? ''));
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
