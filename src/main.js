import { loadRuntimeConfig, getConfig } from './config/runtime-config.js';
import { createStore } from './core/store.js';
import { Router } from './core/router.js';
import { loadSettings, saveSettings, listProjects, saveProject, getProject, deleteProject, listCustomTemplates, saveCustomTemplate, deleteCustomTemplate, saveLocalControlConfig, clearLocalControlConfig, loadAnnouncementState, saveAnnouncementState } from './storage/database.js';
import { createProject, duplicateProject as cloneProject, setDisplayField } from './models/project.js';
import { normalizeSettings } from './models/settings.js';
import { BUILT_IN_TEMPLATES, cloneTemplate } from './models/templates.js';
import { EditorHistory } from './editor/history.js';
import { readExif } from './services/exif-service.js';
import { createThumbnailFromSource, fileToDataUrl, loadImageSource } from './services/image-service.js';
import { getCachedLocation, getCurrentLocation, getPermissionSnapshot, reverseGeocode } from './services/location-service.js';
import { selectCameraPhoto, selectGalleryPhotos } from './services/media-service.js';
import { createExport, saveExport, shareExport } from './services/export-service.js';
import { renderHomeScreen } from './screens/home-screen.js';
import { renderProjectsScreen } from './screens/projects-screen.js';
import { renderTemplatesScreen } from './screens/templates-screen.js';
import { renderSettingsScreen } from './screens/settings-screen.js';
import { renderEditorScreen } from './screens/editor-screen.js';
import { renderLocationScreen } from './screens/location-screen.js';
import { renderBatchScreen } from './screens/batch-screen.js';
import { renderCameraScreen } from './screens/camera-screen.js';
import { renderAdminScreen } from './screens/admin-screen.js';
import { noticeDialog, setGlobalBusy, showToast } from './components/ui.js';
import { createId } from './utils/id.js';
import { toLocalIso } from './utils/date.js';
import { loadControlConfig, setEffectiveControlConfig, clearEffectiveControlOverride, getControlConfigSnapshot } from './config/control-config.js';
import { brandMarkMarkup, setActiveBranding } from './components/brand.js';
import { isValidCoordinate } from './utils/geo.js';
import { fetchWithTimeout } from './utils/async.js';

class GPSMapCameraApp {
  constructor(root) {
    this.root = root;
    this.store = createStore({ settings: normalizeSettings(), projects: [], customTemplates: [], controlConfig: null, permissions: { camera: 'prompt', location: 'prompt', storage: 'available' } });
    this.router = new Router((route) => this.renderRoute(route));
    this.histories = new Map();
    this.editorUi = new Map();
    this.editorCallbacks = new Map();
    this.editorCleanups = [];
    this.autoSaveTimers = new Map();
    this.batchProjectIds = [];
    this.currentRoute = null;
    this.renderNumber = 0;
    this.nativeReadyReported = false;
    this.routeCleanup = null;
    this.webUpdatePending = false;
    this.updateCheckTimer = null;
    this.announcementState = { id: '', count: 0, lastShownAt: null };
    this.announcementVisible = false;
    this.lastAnnouncementCheckAt = 0;
    this.appHiddenAt = 0;
    this.captureQueue = Promise.resolve();
    this.pendingCaptures = 0;
    this.projectsFullyLoaded = false;
  }

  async init() {
    setGlobalBusy(true, 'Membuka MapCam…');
    try {
      await loadRuntimeConfig();
      const [settings, projects, customTemplates, permissions, controlSnapshot, announcementState] = await Promise.all([
        loadSettings(), listProjects({ limit: 12 }), listCustomTemplates(), getPermissionSnapshot(), loadControlConfig(), loadAnnouncementState(),
      ]);
      this.announcementState = announcementState;
      this.store.setState({ settings, projects, customTemplates, permissions, controlConfig: controlSnapshot.effective }, 'init');
      this.applyBranding(controlSnapshot.effective.branding);
      this.applyTheme(settings.theme);
      this.bindGlobalActions();
      this.registerServiceWorker();
      window.addEventListener('online', () => this.handleConnectionChange(true));
      window.addEventListener('offline', () => this.handleConnectionChange(false));
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.appHiddenAt = Date.now();
          this.flushAutoSaves();
        } else if (this.appHiddenAt && Date.now() - this.appHiddenAt > 1000) {
          this.appHiddenAt = 0;
          this.maybeShowOpeningAnnouncement();
        }
      });
      this.router.start();
      this.startWebUpdateChecks();
      setTimeout(() => this.maybeShowOpeningAnnouncement(), 280);
    } catch (error) {
      console.error('[app] Inisialisasi gagal', error);
      this.root.innerHTML = `<main class="fatal-error"><h1>Aplikasi tidak dapat dibuka</h1><p>${error.message}</p><button id="app-reload">Coba Lagi</button></main>`;
      this.root.querySelector('#app-reload')?.addEventListener('click', () => location.reload());
    } finally { setGlobalBusy(false); }
  }

  async renderRoute(route) {
    const renderNumber = ++this.renderNumber;
    if (this.routeCleanup) {
      try { this.routeCleanup(); } catch (error) { console.warn('[app] Route cleanup gagal', error); }
      this.routeCleanup = null;
    }
    this.currentRoute = route;
    this.cleanupObjectUrls();
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (route.path === '/home') await renderHomeScreen(this, this.root);
    else if (route.path === '/camera') await renderCameraScreen(this, this.root);
    else if (route.path === '/projects') { await this.ensureAllProjectsLoaded(); await renderProjectsScreen(this, this.root); }
    else if (route.path === '/templates') renderTemplatesScreen(this, this.root);
    else if (route.path === '/settings') await renderSettingsScreen(this, this.root);
    else if (route.path === '/editor') await renderEditorScreen(this, this.root, route);
    else if (route.path === '/location') renderLocationScreen(this, this.root, route);
    else if (route.path === '/batch') await renderBatchScreen(this, this.root);
    else if (route.path === '/admin') await renderAdminScreen(this, this.root);
    else this.router.navigate('/home');
    if (renderNumber !== this.renderNumber) return;
    if (this.webUpdatePending && route.path === '/home') {
      await this.flushAutoSaves();
      location.reload();
      return;
    }
    this.root.querySelector('main')?.focus?.({ preventScroll: true });
    if (!this.nativeReadyReported && route.path === '/home') {
      this.nativeReadyReported = true;
      try { globalThis.AndroidBridge?.reportReady?.(); }
      catch (error) { console.warn('[android] Ready signal gagal dikirim', error); }
    }
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
    this.router.navigate('/camera');
  }

  async startSystemCamera() {
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
        placeName: location?.placeName ?? '',
        countryCode: location?.countryCode ?? '',
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

  async persistCameraOriginal(file) {
    if (!globalThis.AndroidBridge?.saveOriginalImage) return;
    try { globalThis.AndroidBridge.saveOriginalImage(await fileToDataUrl(file), file.name); }
    catch (error) { console.warn('[camera] Foto asli tidak dapat disalin ke galeri', error); }
  }

  enqueueCameraCapture({ file, metadata, template, dimensions, onStatus = () => {} }) {
    this.pendingCaptures += 1;
    onStatus({ state: 'queued', pending: this.pendingCaptures });
    const preparedProject = this.createAndSaveProject('camera', file, metadata, {
      template,
      dimensions,
      deferThumbnail: true,
    });
    const process = async () => {
      onStatus({ state: 'processing', pending: this.pendingCaptures });
      let project = null;
      try {
        project = await preparedProject;
        // Jalur cepat: foto + data GPS langsung disimpan sebagai project
        // begitu tombol ditekan. Langsung bisa dibuka & diedit.
        await this.saveProjectNow(project);
        this.createDeferredThumbnail(project).catch((error) => console.warn('[camera] Thumbnail tertunda gagal', error));
      } catch (error) {
        console.error('[camera] Penyimpanan foto gagal', error);
        showToast(`Foto gagal disimpan: ${error.message}`, { type: 'error', duration: 6000 });
        onStatus({ state: 'error', pending: Math.max(0, this.pendingCaptures - 1), error, project });
        this.pendingCaptures = Math.max(0, this.pendingCaptures - 1);
        return project;
      }
      this.pendingCaptures = Math.max(0, this.pendingCaptures - 1);
      onStatus({ state: 'saved', pending: this.pendingCaptures, project });
      const control = this.getControlConfig().camera;
      if (control.showSaveConfirmation) {
        showToast('Foto tersimpan. Stamp resolusi tinggi diproses di latar belakang.', { duration: 3300 });
      }
      // Jalur berat (lengkapi alamat + render stamp resolusi tinggi + simpan
      // ke galeri) jalan terpisah di latar belakang tanpa memblokir
      // jepretan berikutnya.
      this.finishCaptureInBackground(project, { file, metadata }).catch((error) => {
        console.error('[camera] Penyelesaian latar belakang gagal', error);
      });
      return project;
    };
    const result = this.captureQueue.then(process, process);
    this.captureQueue = result.catch(() => null);
    return result;
  }

  // Melengkapi metadata (reverse geocode), menyimpan foto asli ke galeri,
  // dan me-render stamp resolusi tinggi — semuanya di latar belakang
  // setelah foto tersimpan, agar tombol shutter tidak pernah menunggu.
  async finishCaptureInBackground(project, { file, metadata }) {
    if (!project) return;
    try {
      const completedMetadata = await this.completeCaptureMetadata(metadata);
      let enriched = false;
      for (const [field, value] of Object.entries(completedMetadata)) {
        const originalMissing = project.originalData[field] == null || project.originalData[field] === ''
          || (Array.isArray(project.originalData[field]) && project.originalData[field].length === 0);
        if (originalMissing && value != null && value !== '') { project.originalData[field] = structuredClone(value); enriched = true; }
        if (!project.editedFields[field] && originalMissing && value != null && value !== '') { project.displayData[field] = structuredClone(value); enriched = true; }
      }
      if (enriched) await this.saveProjectNow(project);
      const control = this.getControlConfig().camera;
      if (control.saveOriginalToGallery) this.persistCameraOriginal(file);
      if (control.autoSaveStamped) {
        const exported = await createExport(project, control.captureQuality);
        await saveExport(exported);
        await this.recordExport(project.id, exported);
      }
    } catch (error) {
      console.error('[camera] Latar belakang gagal', error);
      showToast(`Project tersimpan, tetapi stamp/galeri gagal: ${error.message}`, { type: 'error', duration: 6000 });
    }
  }

  async completeCaptureMetadata(metadata) {
    const completed = structuredClone(metadata);
    if (!isValidCoordinate(completed.latitude, completed.longitude)) {
      const cached = getCachedLocation(90_000);
      if (cached) Object.assign(completed, cached);
    }
    if (isValidCoordinate(completed.latitude, completed.longitude) && !completed.address && navigator.onLine) {
      const address = await reverseGeocode(completed.latitude, completed.longitude).catch(() => null);
      if (address) Object.assign(completed, address);
    }
    return completed;
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
      placeName: address?.placeName ?? '',
      countryCode: address?.countryCode ?? '',
      altitude: exif.altitude,
      dateTime: exif.dateTime,
      orientation: exif.orientation,
      source: exif.gpsSource ? 'gallery-exif' : 'gallery-no-gps',
      dateSource: exif.dateSource,
      gpsSource: exif.gpsSource,
      fileLastModified: exif.fileLastModified,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    const project = await this.createAndSaveProject('gallery', file, metadata);
    let displayUpdated = false;
    if (!exif.dateTime) {
      setDisplayField(project, 'dateTime', toLocalIso());
      project.displayData.dateSource = 'current-time';
      displayUpdated = true;
    }
    if (!isValidCoordinate(exif.latitude, exif.longitude) && this.getControlConfig().camera.autoLocationForGallery) {
      const current = getCachedLocation(90_000) ?? await getCurrentLocation({ timeout: 8000, maximumAge: 90_000 }).catch(() => null);
      if (current) {
        const currentAddress = navigator.onLine
          ? await reverseGeocode(current.latitude, current.longitude).catch(() => null)
          : null;
        setDisplayField(project, 'latitude', current.latitude);
        setDisplayField(project, 'longitude', current.longitude);
        setDisplayField(project, 'accuracy', current.accuracy);
        setDisplayField(project, 'altitude', current.altitude);
        setDisplayField(project, 'speed', current.speed);
        setDisplayField(project, 'compass', current.compass);
        setDisplayField(project, 'address', currentAddress?.address ?? '');
        setDisplayField(project, 'addressLines', currentAddress?.addressLines ?? []);
        setDisplayField(project, 'placeName', currentAddress?.placeName ?? '');
        setDisplayField(project, 'countryCode', currentAddress?.countryCode ?? '');
        project.displayData.source = current.source || 'device-gps';
        displayUpdated = true;
      }
    }
    if (displayUpdated) await this.saveProjectNow(project);
    return project;
  }

  async createAndSaveProject(sourceType, file, metadata, options = {}) {
    const state = this.store.getState();
    const project = createProject({ sourceType, file, metadata, settings: state.settings, customTemplates: state.customTemplates });
    project.overlay.mapScale = state.settings.mapSize === 'small' ? 0.78 : state.settings.mapSize === 'large' ? 1.25 : 1;
    if (options.template) {
      project.templateId = options.template.id;
      project.template = cloneTemplate(options.template);
    }
    if (Number.isFinite(options.dimensions?.width) && Number.isFinite(options.dimensions?.height)) {
      project.sourceWidth = options.dimensions.width;
      project.sourceHeight = options.dimensions.height;
    }
    if (!options.deferThumbnail || !project.sourceWidth || !project.sourceHeight) {
      const source = await loadImageSource(file);
      project.sourceWidth = source.width;
      project.sourceHeight = source.height;
      if (!options.deferThumbnail) project.thumbnailBlob = await createThumbnailFromSource(source).catch(() => null);
      URL.revokeObjectURL(source.url);
    }
    applyDefaultPosition(project, state.settings.stampPosition);
    project.appVersion = getConfig().app.versionName;
    await saveProject(project);
    this.store.setState((current) => ({ ...current, projects: [project, ...current.projects.filter((item) => item.id !== project.id)] }), 'project-created');
    return project;
  }

  async createDeferredThumbnail(project) {
    if (!project?.sourceBlob || project.thumbnailBlob) return;
    const source = await loadImageSource(project.sourceBlob);
    try {
      project.sourceWidth = source.width;
      project.sourceHeight = source.height;
      project.thumbnailBlob = await createThumbnailFromSource(source);
      await this.saveProjectNow(project);
    } finally { URL.revokeObjectURL(source.url); }
  }

  async acquireLocationWithAddress() {
    const location = await getCurrentLocation({ enableHighAccuracy: true, timeout: 22000, maximumAge: 3000 });
    let address = null;
    if (navigator.onLine) address = await reverseGeocode(location.latitude, location.longitude).catch(() => null);
    return { ...location, address: address?.address ?? '', addressLines: address?.addressLines ?? [], placeName: address?.placeName ?? '' };
  }

  async commitLocation(projectId, location) {
    const project = this.getProjectFromState(projectId);
    if (!project) return;
    setDisplayField(project, 'latitude', Number(location.latitude));
    setDisplayField(project, 'longitude', Number(location.longitude));
    setDisplayField(project, 'address', location.address || '');
    setDisplayField(project, 'addressLines', location.addressLines || []);
    setDisplayField(project, 'placeName', location.placeName || location.addressLines?.[1] || '');
    setDisplayField(project, 'countryCode', location.countryCode || '');
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

  async ensureAllProjectsLoaded() {
    if (this.projectsFullyLoaded) return;
    const projects = await listProjects();
    this.projectsFullyLoaded = true;
    this.store.setState((state) => ({ ...state, projects }), 'projects-loaded');
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
    try { await shareExport({ blob: project.lastExportBlob, fileName: project.lastExportName || 'MapCam.jpg' }); }
    catch (error) { showToast(error.message, { type: 'error' }); }
  }

  async updateSetting(key, value) {
    const settings = { ...this.store.getState().settings, [key]: value };
    await saveSettings(settings);
    this.store.setState((state) => ({ ...state, settings }), 'settings');
    if (key === 'theme') this.applyTheme(value);
  }

  getControlConfig() {
    return this.store.getState().controlConfig ?? getControlConfigSnapshot().effective;
  }

  getControlConfigSnapshot() {
    return getControlConfigSnapshot();
  }

  async updateControlConfig(config) {
    const saved = await saveLocalControlConfig(config);
    const snapshot = setEffectiveControlConfig(saved, true);
    this.store.setState((state) => ({ ...state, controlConfig: snapshot.effective }), 'control-config');
    this.applyBranding(snapshot.effective.branding);
    return snapshot.effective;
  }

  async resetControlConfig() {
    await clearLocalControlConfig();
    const snapshot = clearEffectiveControlOverride();
    this.store.setState((state) => ({ ...state, controlConfig: snapshot.effective }), 'control-config-reset');
    this.applyBranding(snapshot.effective.branding);
    return snapshot.effective;
  }

  previewAnnouncement(announcement = this.getControlConfig().announcement) {
    return noticeDialog({
      title: announcement.title || 'Informasi',
      message: announcement.message || 'Isi catatan belum diisi.',
      buttonLabel: announcement.buttonLabel || 'Mengerti',
      logoMarkup: brandMarkMarkup({ className: 'notice-brand-mark' }),
    });
  }

  async maybeShowOpeningAnnouncement() {
    const announcement = this.getControlConfig()?.announcement;
    if (!announcement?.enabled || !announcement.message) return;
    const now = Date.now();
    if (this.announcementVisible || now - this.lastAnnouncementCheckAt < 2000) return;
    this.lastAnnouncementCheckAt = now;
    const previous = this.announcementState.id === announcement.id
      ? this.announcementState
      : { id: announcement.id, count: 0, lastShownAt: null };
    const shouldShow = announcement.frequency === 'every-open'
      || (announcement.frequency === 'limited' ? previous.count < announcement.displayLimit : previous.count === 0);
    if (!shouldShow) return;
    this.announcementState = await saveAnnouncementState({
      id: announcement.id,
      count: previous.count + 1,
      lastShownAt: new Date().toISOString(),
    }).catch(() => ({ ...previous, count: previous.count + 1 }));
    this.announcementVisible = true;
    try { await this.previewAnnouncement(announcement); }
    finally { this.announcementVisible = false; }
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
  setRouteCleanup(cleanup) { this.routeCleanup = cleanup; }
  setNativeCameraMode(enabled) {
    try { globalThis.AndroidBridge?.setCameraMode?.(Boolean(enabled)); }
    catch (error) { console.warn('[android] Mode system bar kamera gagal', error); }
  }

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

  applyBranding(branding) {
    const active = setActiveBranding(branding);
    document.title = active.appName;
    document.documentElement.style.setProperty('--primary', active.accentColor);
    document.documentElement.style.setProperty('--primary-dark', active.accentColor);
    document.documentElement.style.setProperty('--primary-soft', `color-mix(in srgb, ${active.accentColor} 14%, var(--surface))`);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', active.accentColor);
  }

  handleConnectionChange(online) {
    showToast(online ? 'Koneksi internet kembali.' : 'Mode offline: kamera dan editor tetap dapat digunakan.', { duration: 3500 });
    if (online) this.checkForWebUpdate();
    if (this.currentRoute?.path === '/home') renderHomeScreen(this, this.root);
  }

  startWebUpdateChecks() {
    const check = () => this.checkForWebUpdate().catch((error) => console.warn('[update] Pemeriksaan web gagal', error));
    setTimeout(check, 2500);
    this.updateCheckTimer = setInterval(check, 5 * 60_000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  }

  async checkForWebUpdate() {
    if (!navigator.onLine || this.webUpdatePending) return;
    const response = await fetchWithTimeout(`./build-info.json?check=${Date.now()}`, { cache: 'no-store' }, 3500);
    if (!response.ok) return;
    const info = await response.json();
    const currentBuildId = globalThis.__MAPCAM_BUILD_ID__;
    if (!info.buildId || !currentBuildId || info.buildId === currentBuildId) return;
    this.webUpdatePending = true;
    const safeToReload = ['/home', '/projects', '/templates', '/settings'].includes(this.currentRoute?.path);
    if (safeToReload) {
      showToast('Pembaruan aplikasi ditemukan. Memuat versi terbaru…', { duration: 1800 });
      await this.flushAutoSaves();
      setTimeout(() => location.reload(), 700);
    } else {
      showToast('Pembaruan siap dan akan diterapkan setelah kembali ke halaman utama.', { duration: 5000 });
    }
  }

  registerServiceWorker() {
    if (!globalThis.AndroidBridge && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' })
        .then((registration) => registration.update())
        .catch((error) => console.warn('[pwa] Service worker gagal', error));
    }
  }
}

function applyDefaultPosition(project, position) {
  project.overlay.anchor = ['bottom-left', 'bottom-right', 'top-left', 'top-right'].includes(position) ? position : 'bottom-left';
  if (position === 'bottom-right' || position === 'top-right') project.template.layout.mapPosition = 'right';
  else if (project.template.layout.direction !== 'column') project.template.layout.mapPosition = 'left';
}

const root = document.querySelector('#app');
const app = new GPSMapCameraApp(root);
globalThis.GPSMapCameraApp = app;
app.init();
