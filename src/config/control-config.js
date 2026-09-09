import { getConfig } from './runtime-config.js';
import { DEFAULT_CONTROL_CONFIG, mergeControlConfig, normalizeControlConfig } from '../models/control-config.js';
import { loadLocalControlConfig } from '../storage/database.js';
import { fetchWithTimeout } from '../utils/async.js';

let publishedControl = normalizeControlConfig(DEFAULT_CONTROL_CONFIG);
let effectiveControl = publishedControl;
let hasLocalOverride = false;

export async function loadControlConfig() {
  const configuredUrl = getConfig().admin?.controlConfigUrl || './control-config.json';
  try {
    const url = new URL(configuredUrl, location.href);
    url.searchParams.set('refresh', String(Date.now()));
    const response = await fetchWithTimeout(url, { cache: 'no-store' }, 2500);
    if (!response.ok) throw new Error(`Control config HTTP ${response.status}`);
    publishedControl = normalizeControlConfig(await response.json());
  } catch (error) {
    console.warn('[control] Konfigurasi publik tidak dapat dimuat', error);
    publishedControl = normalizeControlConfig(DEFAULT_CONTROL_CONFIG);
  }
  const local = await loadLocalControlConfig().catch(() => null);
  hasLocalOverride = Boolean(local);
  effectiveControl = local ? mergeControlConfig(publishedControl, local) : publishedControl;
  return getControlConfigSnapshot();
}

export function setEffectiveControlConfig(config, localOverride = true) {
  effectiveControl = normalizeControlConfig(config);
  hasLocalOverride = localOverride;
  return getControlConfigSnapshot();
}

export function clearEffectiveControlOverride() {
  effectiveControl = publishedControl;
  hasLocalOverride = false;
  return getControlConfigSnapshot();
}

export function getControlConfigSnapshot() {
  return {
    published: structuredClone(publishedControl),
    effective: structuredClone(effectiveControl),
    hasLocalOverride,
  };
}
