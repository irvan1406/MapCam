import { loadRuntimeConfig, getConfig } from './config/runtime-config.js';
import { createStore } from './core/store.js';
import { Router } from './core/router.js';
import { loadSettings, saveSettings, listProjects, saveProject, getProject, deleteProject, listCustomTemplates, saveCustomTemplate, deleteCustomTemplate } from './storage/database.js';
import { createProject, duplicateProject as cloneProject, setDisplayField } from './models/project.js';
import { normalizeSettings } from './models/settings.js';
import { BUILT_IN_TEMPLATES, cloneTemplate } from './models/templates.js';
import { EditorHistory } from './editor/history.js';
import { readExif } from './services/exif-service.js';
import { createThumbnailFromSource, loadImageSource } from './services/image-service.js';
import { getCurrentLocation, getPermissionSnapshot, reverseGeocode } from './services/location-service.js';
import { selectCameraPhoto, selectGalleryPhotos } from './services/media-service.js';
import { shareExport } from './services/export-service.js';
import { renderHomeScreen } from './screens/home-screen.js';
import { renderProjectsScreen } from './screens/projects-screen.js';
import { renderTemplatesScreen } from './screens/templates-screen.js';
import { renderSettingsScreen } from './screens/settings-screen.js';
import { renderEditorScreen } from './screens/editor-screen.js';
import { renderLocationScreen } from './screens/location-screen.js';
import { renderBatchScreen } from './screens/batch-screen.js';
import { setGlobalBusy, showToast } from './components/ui.js';
import { createId } from './utils/id.js';
import { toLocalIso } from './utils/date.js';

class GPSMapCameraApp {
  constructor(root) {
    this.root = root;
    this.store = createStore({ settings: normalizeSettings(), projects: [], customTemplates: [], permissions: { camera: 'prompt', location: 'prompt', storage: 'available' } });
    this.router = new Router((route) => this.renderRoute(route));
    this.histories = new Map();
    this.editorUi = new Map();
    this.editorCallbacks = new Map();
    this.editorCleanups = [];
    this.autoSaveTimers = new Map();
    this.batchProjectIds = [];
    this.currentRoute = null;
    this.renderNumber = 0;
  }

  async init() {
    setGlobalBusy(true, 'Membuka GPS Map Camera…');
    try {
      await loadRuntimeConfig();
      const [settings, projects, customTemplates, permissions] = await Promise.all([
        loadSettings(), listProjects(), listCustomTemplates(), getPermissionSnapshot(),
      ]);
      this.store.setState({ settings, projects, customTemplates, permissions }, 'init');
      this.applyTheme(settings.theme);
      this.bindGlobalActions();
      this.registerServiceWorker();
      window.addEventListener('online', () => this.handleConnectionChange(true));
      window.addEventListener('offline', () => this.handleConnectionChange(false));
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.flushAutoSaves(); });
      this.router.start();
    } catch (error) {
      console.error('[app] Inisialisasi gagal', error);
      this.root.innerHTML = `<main class="fatal-error"><h1>Aplikasi tidak dapat dibuka</h1><p>${error.message}</p><button onclick="location.reload()">Coba Lagi</button></main>`;
    } finally { setGlobalBusy(false); }
  }

  async renderRoute(route) {
    const renderNumber = ++this.renderNumber;
    this.currentRoute = route;
    this.cleanupObjectUrls();
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (route.path === '/home') await renderHomeScreen(this, this.root);
    else if (route.path === '/projects') await renderProjectsScreen(this, this.root);
    else if (route.path === '/templates') renderTemplatesScreen(this, this.root);
    else if (route.path === '/settings') await renderSettingsScreen(this, this.root);
    else if (route.path === '/editor') await renderEditorScreen(this, this.root, route);
    else if (route.path === '/location') renderLocationScreen(this, this.root, route);
    else if (route.path === '/batch') await renderBatchScreen(this, this.root);
    else this.router.navigate('/home');
    if (renderNumber !== this.renderNumber) return;
    this.root.querySelector('main')?.focus?.({ preventScroll: true });
  }

  bindGlobalActions() {
    this.root.addEventListener('click', async (event) => {
      const routeTarget = event.target.closest('[data-route]');
      if (routeTarget) { event.preventDefault(); return this.router.navigate(routeTarget.dataset.route); }
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'back') { event.preventDefault(); return this.router.back(); }
      if (action === 'camera') return this.startCamera();
      if (action === 'gallery') return this.startGallery();
      if (action === 'open-project') return this.openProject(target.dataset.projectId);
      if (action === 'refresh-permissions') return this.refreshPermissions(true);
      if (action === 'open-settings') {
        if (globalThis.AndroidBridge?.openAppSettings) globalThis.AndroidBridge.openAppSettings();
        else showToast('Buka pengaturan situs/browser lalu izinkan akses yang diperlukan.', { duration: 5000 });
        return;
      }
      if (action === 'choose-template') {
        await this.setDefaultTemplate(target.dataset.templateId);
        showToast('Template dipilih sebagai default.');
      }
    });
  }

  async startCamera() {
    try {
      const [file] = await selectCameraPhoto();
      if (!file) return;
      setGlobalBusy(true, 'Membaca foto dan mencari GPS…');
      const exif = await readExif(file);
      let location = null;
      let locationError = null;
      try { location = await this.acquireLocationWithAddress(); }
      catch (error) { locationError = error; }
      const now = new Date();
      const fileDate = exif.dateTime
        || (file.lastModified && Math.abs(now.getTime() - file.lastModified) < 15 * 60_000 ? toLocalIso(new Date(file.lastModified)) : toLocalIso(now));
      const metadata = {
        latitude: location?.latitude ?? null,
        longitude: location?.longitude ?? null,
        address: location?.address ?? '',
        addressLines: location?.addressLines ?? [],
        accuracy: location?.accuracy ?? null,
        altitude: location?.altitude ?? null,
        speed: location?.speed ?? null,
        compass: location?.compass ?? null,
        dateTime: fileDate,
        orientation: exif.orientation,
        source: location?.source ?? 'camera-no-gps',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      const project = await this.createAndSaveProject('camera', file, metadata);
      await this.refreshPermissions(false);
      this.router.navigate(`/editor?id=${project.id}`);
      if (locationError) setTimeout(() => showToast(locationError.message, { type: 'error', duration: 6000 }), 450);
    } catch (error) {
      console.error('[camera] Gagal', error);
      showToast(`Kamera gagal: ${error.message}`, { type: 'error', duration: 6000 });
    } finally { setGlobalBusy(false); }
  }

  async startGallery() {
    try {
      const files = (await selectGalleryPhotos({ multiple: true })).slice(0, 50);
      if (!files.length) return;
      const appendToBatch = this.currentRoute?.path === '/batch';
      setGlobalBusy(true, files.length > 1 ? `Membaca metadata 1/${files.length}…` : 'Membaca metadata foto…');
      if (files.length === 1 && !appendToBatch) {
        const project = await this.importGalleryFile(files[0], true);
        this.router.navigate(`/editor?id=${project.id}`);
      } else {
        const imported = [];
        for (let index = 0; index < files.length; index += 1) {
          setGlobalBusy(true, `Membaca metadata ${index + 1}/${files.length}…`);
          imported.push(await this.importGalleryFile(files[index], false));
        }
        this.batchProjectIds = appendToBatch
          ? [...new Set([...this.batchProjectIds, ...imported.map((project) => project.id)])]
          : imported.map((project) => project.id);
        this.router.navigate('/batch');
      }
      await this.refreshPermissions(false);
    } catch (error) {
      console.error('[gallery] Gagal', error);
      showToast(`Galeri gagal: ${error.message}`, { type: 'error', duration: 6000 });
    } finally { setGlobalBusy(false); }
  }

  async importGalleryFile(file, resolveAddress) {
    const exif = await readExif(file);
    let address = null;
    if (resolveAddress && Number.isFinite(exif.latitude) && Number.isFinite(exif.longitude)) {
      address = await reverseGeocode(exif.latitude, exif.longitude).catch((error) => {
        console.warn('[geocoding] Reverse geocode foto galeri gagal', error);
        return null;
      });
    }
    const metadata = {
      latitude: exif.latitude,
      longitude: exif.longitude,
      address: address?.address ?? '',
      addressLines: address?.addressLines ?? [],
      altitude: exif.altitude,
      dateTime: exif.dateTime,
      orientation: exif.orientation,
      source: exif.gpsSource ? 'gallery-exif' : 'gallery-no-gps',
      dateSource: exif.dateSource,
      gpsSource: exif.gpsSource,
      fileLastModified: exif.fileLastModified,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    return this.createAndSaveProject('gallery', file, metadata);
  }

  async createAndSaveProject(sourceType, file, metadata) {
    const state = this.store.getState();
    const project = createProject({ sourceType, file, metadata, settings: state.settings, customTemplates: state.customTemplates });
    project.overlay.mapScale = state.settings.mapSize === 'small' ? 0.78 : state.settings.mapSize === 'large' ? 1.25 : 1;
    const source = await loadImageSource(file);
    project.sourceWidth = source.width;
    project.sourceHeight = source.height;
    project.thumbnailBlob = await createThumbnailFromSource(source).catch(() => null);
    URL.revokeObjectURL(source.url);
    applyDefaultPosition(project, state.settings.stampPosition);
    project.appVersion = getConfig().app.versionName;
    await saveProject(project);
    this.store.setState((current) => ({ ...current, projects: [project, ...current.projects.filter((item) => item.id !== project.id)] }), 'project-created');
    return project;
  }

  async acquireLocationWithAddress() {
    const location = await getCurrentLocation({ enableHighAccuracy: true, timeout: 22000, maximumAge: 3000 });
    let address = null;
    if (navigator.onLine) address = await reverseGeocode(location.latitude, location.longitude).catch(() => null);
    return { ...location, address: address?.address ?? '', addressLines: address?.addressLines ?? [] };
  }

  async commitLocation(projectId, location) {
    const project = this.getProjectFromState(projectId);
    if (!project) return;
    setDisplayField(project, 'latitude', Number(location.latitude));
    setDisplayField(project, 'longitude', Number(location.longitude));
    setDisplayField(project, 'address', location.address || '');
    setDisplayField(project, 'addressLines', location.addressLines || []);
    project.displayData.accuracy = location.accuracy ?? null;
    project.displayData.source = location.source || 'manual-map';
    project.map.zoom = location.zoom ?? project.map.zoom;
    this.getEditorHistory(project).commit(project);
    this.markProjectChanged(project);
    await this.saveProjectNow(project);
  }

  async applyDisplayLocation(projectId, location) {
    await this.commitLocation(projectId, location);
  }

  openProject(projectId) {
    if (!projectId) return;
    this.router.navigate(`/editor?id=${projectId}`);
  }

  getProjectFromState(projectId) {
    return this.store.getState().projects.find((project) => project.id === projectId) ?? null;
  }

  async duplicateProject(projectId) {
    const source = this.getProjectFromState(projectId) ?? await getProject(projectId);
    if (!source) throw new Error('Project tidak ditemukan.');
    const duplicate = cloneProject(source);
    await saveProject(duplicate);
    this.store.setState((state) => ({ ...state, projects: [duplicate, ...state.projects] }), 'project-duplicated');
    if (this.currentRoute?.path === '/projects') await renderProjectsScreen(this, this.root);
    return duplicate;
  }

  async removeProject(projectId) {
    await deleteProject(projectId);
    this.histories.delete(projectId);
    this.editorUi.delete(projectId);
    this.store.setState((state) => ({ ...state, projects: state.projects.filter((project) => project.id !== projectId) }), 'project-deleted');
    if (this.currentRoute?.path === '/projects') await renderProjectsScreen(this, this.root);
  }

  markProjectChanged(project) {
    this.store.setState((state) => ({ ...state, projects: state.projects.map((item) => item.id === project.id ? project : item).sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt)) }), 'project-changed');
  }

  autoSaveProject(project) {
    if (!this.store.getState().settings.autoSave) return Promise.resolve();
    clearTimeout(this.autoSaveTimers.get(project.id));
    const timer = setTimeout(async () => {
      this.autoSaveTimers.delete(project.id);
      try { await saveProject(project); }
      catch (error) { showToast(`Autosave gagal: ${error.message}`, { type: 'error' }); }
    }, 650);
    this.autoSaveTimers.set(project.id, timer);
    return Promise.resolve();
  }

  async saveProjectNow(project) {
    clearTimeout(this.autoSaveTimers.get(project.id));
    this.autoSaveTimers.delete(project.id);
    await saveProject(project);
    this.markProjectChanged(project);
  }

  async flushAutoSaves() {
    const ids = [...this.autoSaveTimers.keys()];
    for (const id of ids) {
      const project = this.getProjectFromState(id);
      if (project) await this.saveProjectNow(project).catch(() => {});
    }
  }

  async recordExport(projectId, exported) {
    const project = this.getProjectFromState(projectId);
    if (!project) return;
    project.lastExportBlob = exported.blob;
    project.lastExportName = exported.fileName;
    project.status = 'exported';
    project.modifiedAt = new Date().toISOString();
    await this.saveProjectNow(project);
  }

  async shareLastExport(projectId) {
    const project = this.getProjectFromState(projectId);
    if (!project?.lastExportBlob) return showToast('Project belum mempunyai hasil export.', { type: 'error' });
    try { await shareExport({ blob: project.lastExportBlob, fileName: project.lastExportName || 'GPSMapCamera.jpg' }); }
    catch (error) { showToast(error.message, { type: 'error' }); }
  }

  async updateSetting(key, value) {
    const settings = { ...this.store.getState().settings, [key]: value };
    await saveSettings(settings);
    this.store.setState((state) => ({ ...state, settings }), 'settings');
    if (key === 'theme') this.applyTheme(value);
  }

  async setDefaultTemplate(templateId) {
    await this.updateSetting('defaultTemplateId', templateId);
    if (this.currentRoute?.path === '/templates') renderTemplatesScreen(this, this.root);
  }

  async createCustomPreset(project, name) {
    const template = cloneTemplate(project.template);
    template.id = createId('preset');
    template.name = name;
    template.description = 'Preset custom dari editor';
    template.custom = true;
    template.preset = {
      overlay: structuredClone(project.overlay),
      map: structuredClone(project.map),
      dateFormat: project.dateFormat,
      timeFormat: project.timeFormat,
    };
    await saveCustomTemplate(template);
    this.store.setState((state) => ({ ...state, customTemplates: [...state.customTemplates, template] }), 'template-created');
    return template;
  }

  async removeCustomTemplate(id) {
    await deleteCustomTemplate(id);
    this.store.setState((state) => ({ ...state, customTemplates: state.customTemplates.filter((template) => template.id !== id) }), 'template-deleted');
    if (this.currentRoute?.path === '/templates') renderTemplatesScreen(this, this.root);
  }

  getAllTemplates() { return [...BUILT_IN_TEMPLATES, ...this.store.getState().customTemplates]; }
  getMapProviders() { return getConfig().maps.providers.filter((provider) => provider.enabled); }

  getEditorHistory(project) {
    if (!this.histories.has(project.id)) this.histories.set(project.id, new EditorHistory(project));
    return this.histories.get(project.id);
  }

  getEditorUi(projectId) {
    if (!this.editorUi.has(projectId)) this.editorUi.set(projectId, { activeTab: 'template', originalOnly: false });
    return this.editorUi.get(projectId);
  }

  setEditorCallbacks(projectId, saveChange, drawPreview) { this.editorCallbacks.set(projectId, { saveChange, drawPreview }); }
  getEditorSaveChange(projectId) { return this.editorCallbacks.get(projectId)?.saveChange ?? (() => Promise.resolve()); }
  getEditorDrawPreview(projectId) { return this.editorCallbacks.get(projectId)?.drawPreview ?? (() => Promise.resolve()); }
  registerEditorCleanup(_projectId, cleanup) { this.editorCleanups.push(cleanup); }

  cleanupObjectUrls() {
    for (const cleanup of this.editorCleanups.splice(0)) {
      try { cleanup(); } catch { /* Object URL may already be revoked. */ }
    }
    this.root.querySelectorAll('[data-object-url]').forEach((element) => URL.revokeObjectURL(element.dataset.objectUrl));
  }

  async refreshPermissions(showFeedback) {
    const permissions = await getPermissionSnapshot();
    this.store.setState((state) => ({ ...state, permissions }), 'permissions');
    if (this.currentRoute?.path === '/home') await renderHomeScreen(this, this.root);
    if (showFeedback) showToast('Status izin diperbarui.');
  }

  applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#08111f' : '#f4f8fc');
  }

  handleConnectionChange(online) {
    showToast(online ? 'Koneksi internet kembali.' : 'Mode offline: kamera dan editor tetap dapat digunakan.', { duration: 3500 });
    if (this.currentRoute?.path === '/home') renderHomeScreen(this, this.root);
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./service-worker.js').catch((error) => console.warn('[pwa] Service worker gagal', error));
    }
  }
}

function applyDefaultPosition(project, position) {
  if (position === 'bottom-right') { project.overlay.x = 0.04; project.template.layout.mapPosition = 'right'; }
  else if (position === 'top-left') { project.overlay.x = 0.04; project.overlay.y = 0.04; }
  else if (position === 'top-right') { project.overlay.x = 0.04; project.overlay.y = 0.04; project.template.layout.mapPosition = 'right'; }
  else { project.overlay.x = 0.04; project.overlay.y = 0.69; }
}

const root = document.querySelector('#app');
const app = new GPSMapCameraApp(root);
globalThis.GPSMapCameraApp = app;
app.init();
