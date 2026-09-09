import { DEFAULT_SETTINGS, normalizeSettings } from '../models/settings.js';
import { migrateProject } from '../models/project.js';
import { normalizeControlConfig } from '../models/control-config.js';

const DB_NAME = 'gps-map-camera';
const DB_VERSION = 3;
const STORES = {
  projects: 'projects',
  settings: 'settings',
  templates: 'templates',
  geocache: 'geocache',
};

let databasePromise;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Operasi database gagal.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Transaksi database gagal.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaksi database dibatalkan.'));
  });
}

export function openDatabase() {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('IndexedDB tidak tersedia.'));
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORES.projects)) {
        const store = database.createObjectStore(STORES.projects, { keyPath: 'id' });
        store.createIndex('modifiedAt', 'modifiedAt');
        store.createIndex('status', 'status');
      }
      if (!database.objectStoreNames.contains(STORES.settings)) {
        database.createObjectStore(STORES.settings, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(STORES.templates)) {
        database.createObjectStore(STORES.templates, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(STORES.geocache)) {
        const cache = database.createObjectStore(STORES.geocache, { keyPath: 'key' });
        cache.createIndex('expiresAt', 'expiresAt');
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error('Database tidak dapat dibuka.'));
    request.onblocked = () => reject(new Error('Database sedang digunakan oleh tab lain.'));
  });

  return databasePromise;
}

async function withStore(storeName, mode, callback) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, mode);
  const store = transaction.objectStore(storeName);
  const result = await callback(store);
  await transactionDone(transaction);
  return result;
}

export async function saveProject(project) {
  const stored = structuredClone(project);
  try {
    await withStore(STORES.projects, 'readwrite', (store) => requestToPromise(store.put(stored)));
  } catch (error) {
    if (error?.name === 'QuotaExceededError') throw new Error('Penyimpanan perangkat penuh. Hapus project lama atau kurangi ukuran foto.');
    throw error;
  }
  return project;
}

export async function getProject(id) {
  const project = await withStore(STORES.projects, 'readonly', (store) => requestToPromise(store.get(id)));
  return project ? migrateProject(project) : null;
}

export async function listProjects({ limit = null } = {}) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : null;
  const projects = await withStore(STORES.projects, 'readonly', (store) => {
    if (!safeLimit) return requestToPromise(store.getAll());
    return new Promise((resolve, reject) => {
      const values = [];
      const request = store.index('modifiedAt').openCursor(null, 'prev');
      request.onerror = () => reject(request.error ?? new Error('Daftar project gagal dibuka.'));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || values.length >= safeLimit) { resolve(values); return; }
        values.push(cursor.value);
        cursor.continue();
      };
    });
  });
  return projects
    .map((project) => {
      try { return migrateProject(project); }
      catch (error) { console.warn(`[storage] Project ${project?.id ?? 'unknown'} dilewati`, error); return null; }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
}

export async function deleteProject(id) {
  await withStore(STORES.projects, 'readwrite', (store) => requestToPromise(store.delete(id)));
}

export async function loadSettings() {
  const record = await withStore(STORES.settings, 'readonly', (store) => requestToPromise(store.get('settings')));
  return normalizeSettings(record?.value ?? DEFAULT_SETTINGS);
}

export async function saveSettings(settings) {
  const value = normalizeSettings(settings);
  await withStore(STORES.settings, 'readwrite', (store) => requestToPromise(store.put({ id: 'settings', value })));
  return value;
}

export async function loadLocalControlConfig() {
  const record = await withStore(STORES.settings, 'readonly', (store) => requestToPromise(store.get('control-config')));
  return record?.value ? normalizeControlConfig(record.value) : null;
}

export async function saveLocalControlConfig(config) {
  const value = normalizeControlConfig(config);
  await withStore(STORES.settings, 'readwrite', (store) => requestToPromise(store.put({ id: 'control-config', value })));
  return value;
}

export async function clearLocalControlConfig() {
  await withStore(STORES.settings, 'readwrite', (store) => requestToPromise(store.delete('control-config')));
}

export async function loadAnnouncementState() {
  const record = await withStore(STORES.settings, 'readonly', (store) => requestToPromise(store.get('announcement-state')));
  return record?.value && typeof record.value === 'object' ? record.value : { id: '', count: 0, lastShownAt: null };
}

export async function saveAnnouncementState(value) {
  const safe = {
    id: String(value?.id ?? '').slice(0, 64),
    count: Math.max(0, Number(value?.count) || 0),
    lastShownAt: value?.lastShownAt || null,
  };
  await withStore(STORES.settings, 'readwrite', (store) => requestToPromise(store.put({ id: 'announcement-state', value: safe })));
  return safe;
}

export async function listCustomTemplates() {
  return withStore(STORES.templates, 'readonly', (store) => requestToPromise(store.getAll()));
}

export async function saveCustomTemplate(template) {
  await withStore(STORES.templates, 'readwrite', (store) => requestToPromise(store.put(structuredClone(template))));
  return template;
}

export async function deleteCustomTemplate(id) {
  await withStore(STORES.templates, 'readwrite', (store) => requestToPromise(store.delete(id)));
}

export async function getGeoCache(key) {
  const record = await withStore(STORES.geocache, 'readonly', (store) => requestToPromise(store.get(key)));
  if (!record || record.expiresAt < Date.now()) return null;
  return record.value;
}

export async function setGeoCache(key, value, ttlMs) {
  await withStore(STORES.geocache, 'readwrite', (store) => requestToPromise(store.put({
    key,
    value,
    expiresAt: Date.now() + ttlMs,
  })));
}

export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null;
  return navigator.storage.estimate();
}
