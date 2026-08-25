import { pageHeader } from '../components/layout.js';
import { icon } from '../components/icons.js';
import { confirmDialog, openSheet, setGlobalBusy, showToast } from '../components/ui.js';
import { renderProject } from '../editor/renderer.js';
import { loadPreviewImageSource, fileToDataUrl } from '../services/image-service.js';
import { createExport, saveExport, shareExport } from '../services/export-service.js';
import { selectLogo } from '../services/media-service.js';
import { reverseGeocode } from '../services/location-service.js';
import { cloneTemplate, getTemplate } from '../models/templates.js';
import { resetDisplayData, setDisplayField, isProjectEdited } from '../models/project.js';
import { createId } from '../utils/id.js';
import { clamp, formatCoordinate, isValidCoordinate } from '../utils/geo.js';
import { combineDateAndTime, dateInputValue, formatDate, formatTime, timeInputValue } from '../utils/date.js';
import { escapeHtml, truncate } from '../utils/text.js';
import { templatePreviewMarkup } from '../components/template-preview.js';

export async function renderEditorScreen(app, root, route) {
  const project = app.getProjectFromState(route.query.get('id'));
  if (!project) return app.router.navigate('/projects');
  const ui = app.getEditorUi(project.id);
  const history = app.getEditorHistory(project);
  const locationReady = isValidCoordinate(project.displayData.latitude, project.displayData.longitude);
  const dateReady = Boolean(project.displayData.dateTime);

  root.innerHTML = `<main class="editor-page">
    ${pageHeader({
      title: project.name,
      subtitleHtml: '<span id="save-state-text">Tersimpan otomatis</span>',
      back: true,
      actions: `<button class="icon-button" id="undo-button" ${history.canUndo ? '' : 'disabled'} aria-label="Undo">${icon('undo')}</button><button class="icon-button" id="redo-button" ${history.canRedo ? '' : 'disabled'} aria-label="Redo">${icon('redo')}</button>`,
    })}
    <section class="editor-preview-section">
      <div class="preview-toolbar">
        <div class="segmented-control"><button class="${ui.originalOnly ? 'is-active' : ''}" data-preview-mode="original">Asli</button><button class="${!ui.originalOnly ? 'is-active' : ''}" data-preview-mode="result">Hasil</button></div>
        <div class="preview-statuses">${locationReady ? `<span class="preview-status ready">${icon('mapPin', 14)} GPS</span>` : `<span class="preview-status missing">${icon('mapPin', 14)} GPS kosong</span>`}${isProjectEdited(project) ? '<span class="preview-status edited">Data diedit</span>' : ''}</div>
      </div>
      <div id="editor-stage" class="editor-stage ${ui.originalOnly ? 'show-original' : ''}">
        <canvas id="preview-canvas" aria-label="Preview foto GPS map"></canvas>
        <div id="stamp-hitbox" class="stamp-hitbox" role="button" aria-label="Geser GPS stamp"><span class="move-label">Geser</span><button class="resize-handle" aria-label="Ubah ukuran">${icon('zoomIn', 16)}</button></div>
        <div id="text-hitboxes"></div>
        <div id="preview-loader" class="preview-loader"><span class="spinner"></span><small>Menyiapkan preview…</small></div>
      </div>
      ${!locationReady || !dateReady ? `<div class="editor-warning">${icon('info', 19)}<span>${!locationReady && !dateReady ? 'Foto tidak mempunyai GPS serta tanggal lengkap.' : !locationReady ? 'Foto tidak mempunyai koordinat GPS.' : 'Tanggal dan jam belum tersedia.'}</span><div class="editor-warning-actions">${!locationReady ? `<button id="editor-current-location">${icon('locate', 15)} Lokasi Saat Ini</button><button id="editor-pick-location">${icon('mapPin', 15)} Pilih di Peta</button>` : ''}${!dateReady ? '<button data-editor-tab-target="data">Atur Tanggal</button>' : ''}</div></div>` : ''}
    </section>
    <section class="editor-tools">
      <nav class="editor-tabs">
        ${tabButton('template', 'layers', 'Template', ui.activeTab)}
        ${tabButton('data', 'mapPin', 'Data', ui.activeTab)}
        ${tabButton('style', 'palette', 'Gaya', ui.activeTab)}
        ${tabButton('text', 'edit', 'Teks', ui.activeTab)}
      </nav>
      <div class="editor-panel" id="editor-panel">${panelContent(project, ui.activeTab, app)}</div>
    </section>
    <footer class="editor-footer">
      <button class="button button-soft icon-only" id="share-editor" aria-label="Bagikan" ${project.lastExportBlob ? '' : 'disabled'}>${icon('share', 21)}</button>
      <button class="button button-soft" id="save-project">${icon('save', 19)} Simpan Project</button>
      <button class="button button-primary" id="export-photo">${icon('upload', 20)} Simpan Foto</button>
    </footer>
  </main>`;

  const canvas = root.querySelector('#preview-canvas');
  const stage = root.querySelector('#editor-stage');
  const loader = root.querySelector('#preview-loader');
  const source = await loadPreviewImageSource(project.sourceBlob, project.sourceWidth, project.sourceHeight, 1500).catch((error) => {
    loader.innerHTML = `<div class="preview-error">${icon('info', 26)}<strong>Foto tidak dapat dibuka</strong><small>${escapeHtml(error.message)}</small></div>`;
    return null;
  });
  if (!source) return;
  project.sourceWidth ||= source.width;
  project.sourceHeight ||= source.height;

  let renderSequence = 0;
  const drawPreview = async () => {
    const sequence = ++renderSequence;
    loader.classList.remove('is-hidden');
    const previewSize = calculatePreviewSize(source.width, source.height, 1500);
    try {
      const result = await renderProject(project, canvas, { source, targetSize: previewSize, preview: true, originalOnly: ui.originalOnly });
      if (sequence !== renderSequence) return;
      if (!ui.originalOnly && result.stampBoundsNormalized) updateStampHitbox(root, result.stampBoundsNormalized);
      renderTextHitboxes(root, project, ui.originalOnly);
      loader.classList.add('is-hidden');
    } catch (error) {
      loader.innerHTML = `<div class="preview-error">${icon('info', 26)}<strong>Preview gagal</strong><small>${escapeHtml(error.message)}</small></div>`;
      console.error('[editor] Preview gagal', error);
    }
  };
  await drawPreview();

  const saveChange = async (reason = 'edit', redraw = true) => {
    project.modifiedAt = new Date().toISOString();
    history.commit(project);
    app.markProjectChanged(project);
    updateHistoryButtons(root, history);
    root.querySelector('#save-state-text').textContent = 'Menyimpan…';
    await app.autoSaveProject(project, reason);
    root.querySelector('#save-state-text').textContent = 'Tersimpan otomatis';
    if (redraw) await drawPreview();
  };

  bindEditorTabs(app, root, project);
  bindPanelEvents(app, root, project, saveChange, drawPreview);
  bindStageGestures(root, stage, project, saveChange, drawPreview);

  root.querySelector('#undo-button').addEventListener('click', async () => {
    history.undo(project); app.markProjectChanged(project); await app.autoSaveProject(project, 'undo'); app.cleanupObjectUrls(); renderEditorScreen(app, root, route);
  });
  root.querySelector('#redo-button').addEventListener('click', async () => {
    history.redo(project); app.markProjectChanged(project); await app.autoSaveProject(project, 'redo'); app.cleanupObjectUrls(); renderEditorScreen(app, root, route);
  });
  root.querySelectorAll('[data-preview-mode]').forEach((button) => button.addEventListener('click', async () => {
    ui.originalOnly = button.dataset.previewMode === 'original';
    root.querySelectorAll('[data-preview-mode]').forEach((item) => item.classList.toggle('is-active', item === button));
    stage.classList.toggle('show-original', ui.originalOnly);
    await drawPreview();
  }));
  root.querySelector('[data-editor-tab-target]')?.addEventListener('click', () => activateEditorTab(app, root, project, 'data'));
  root.querySelector('#editor-pick-location')?.addEventListener('click', () => app.router.navigate(`/location?id=${project.id}`));
  root.querySelector('#editor-current-location')?.addEventListener('click', async () => {
    setGlobalBusy(true, 'Mencari lokasi GPS saat ini…');
    try {
      const location = await app.acquireLocationWithAddress();
      await app.applyDisplayLocation(project.id, location);
      showToast(location.accuracy ? `Lokasi diterapkan • akurasi ±${Math.round(location.accuracy)} m` : 'Lokasi saat ini diterapkan.');
      app.router.navigate(`/editor?id=${project.id}&location=${Date.now()}`);
    } catch (error) { showToast(error.message, { type: 'error', duration: 5500 }); }
    finally { setGlobalBusy(false); }
  });
  root.querySelector('#save-project').addEventListener('click', async () => {
    await app.saveProjectNow(project);
    showToast('Project tersimpan dan dapat diedit lagi.');
  });
  root.querySelector('#export-photo').addEventListener('click', () => openExportSheet(app, project));
  root.querySelector('#share-editor').addEventListener('click', async () => {
    if (!project.lastExportBlob) return;
    try { await shareExport({ blob: project.lastExportBlob, fileName: project.lastExportName || 'GPSMapCamera.jpg' }); }
    catch (error) { showToast(error.message, { type: 'error' }); }
  });

  app.registerEditorCleanup(project.id, () => source.release?.());
}

function panelContent(project, tab, app) {
  if (tab === 'template') return templatePanel(project, app);
  if (tab === 'data') return dataPanel(project);
  if (tab === 'style') return stylePanel(project, app);
  return textPanel(project);
}

function tabButton(id, iconName, label, active) {
  return `<button class="editor-tab ${active === id ? 'is-active' : ''}" data-editor-tab="${id}">${icon(iconName, 19)}<span>${label}</span></button>`;
}

function templatePanel(project, app) {
  const templates = [...app.getAllTemplates()];
  return `<div class="tool-section"><div class="tool-heading"><div><span class="eyebrow">PILIH DESAIN</span><h3>Template GPS stamp</h3></div><button class="text-button" data-command="save-preset">Simpan preset</button></div>
    <div class="editor-template-strip">${templates.map((template) => `<button class="editor-template ${project.templateId === template.id ? 'is-selected' : ''}" data-template-id="${template.id}"><span class="editor-template-preview" style="--panel:${template.panel.background};--accent:${template.panel.accent};--fg:${template.panel.foreground};--opacity:${template.panel.opacity}">${templatePreviewMarkup(template)}</span><strong>${escapeHtml(template.name)}</strong>${project.templateId === template.id ? icon('check', 15) : ''}</button>`).join('')}</div>
    <div class="field-grid-heading"><h3>Informasi yang ditampilkan</h3><small>Aktifkan sesuai kebutuhan</small></div><div class="field-toggle-grid">${Object.entries(fieldLabels).map(([field, label]) => fieldToggle(field, label, project.template.fields[field])).join('')}</div>
  </div>`;
}

const fieldLabels = {
  map: 'Mini Map', qr: 'QR Lokasi', place: 'Nama lokasi', address: 'Alamat lengkap', latitude: 'Latitude', longitude: 'Longitude',
  accuracy: 'Akurasi GPS', altitude: 'Ketinggian', speed: 'Kecepatan',
  date: 'Tanggal', time: 'Jam', timezone: 'Zona waktu', compass: 'Kompas',
  activity: 'Kegiatan', note: 'Catatan', logo: 'Logo',
};

function fieldToggle(field, label, checked) {
  const iconName = field === 'map' ? 'layers' : field === 'qr' ? 'mapPin' : field === 'date' || field === 'time' ? 'clock' : field === 'address' || field === 'latitude' || field === 'longitude' ? 'mapPin' : field === 'logo' ? 'image' : 'edit';
  return `<label class="field-toggle ${checked ? 'is-on' : ''}"><input type="checkbox" data-template-field="${field}" ${checked ? 'checked' : ''}><span>${icon(iconName, 18)}</span><strong>${label}</strong><i>${icon('check', 12)}</i></label>`;
}

function dataPanel(project) {
  const original = project.originalData;
  const display = project.displayData;
  const locationReady = isValidCoordinate(display.latitude, display.longitude);
  return `<div class="tool-section data-tool-section">
    <div class="data-origin-banner"><div>${icon('info', 19)}<span><strong>Original Data tetap aman</strong><small>Perubahan di bawah hanya memengaruhi Display Data.</small></span></div>${isProjectEdited(project) ? '<span class="edited-badge">Diedit</span>' : '<span class="original-badge">Asli</span>'}</div>
    <article class="data-card"><div class="data-card-heading"><span class="data-card-icon">${icon('mapPin', 20)}</span><div><strong>Lokasi & koordinat</strong><small>${locationReady ? `${formatCoordinate(display.latitude, project.coordinateFormat)}, ${formatCoordinate(display.longitude, project.coordinateFormat)}` : 'Belum dipilih'}</small></div><button class="button button-small" data-command="edit-location">Edit Lokasi</button></div>
      <label class="editor-textarea"><span>Nama lokasi / judul</span><input data-display-field="placeName" type="text" value="${escapeHtml(display.placeName || '')}" placeholder="Contoh: Kecamatan Kalibaru, Jawa Timur"></label>
      <label class="editor-textarea"><span>Alamat lengkap tampilan</span><textarea data-display-field="address" rows="3" placeholder="Masukkan alamat lengkap manual">${escapeHtml(display.address || '')}</textarea></label>
      <div class="original-data-line"><span>Asli</span><p>${original.address ? escapeHtml(truncate(original.address, 100)) : 'Tidak tersedia'} ${Number.isFinite(original.latitude) ? `• ${formatCoordinate(original.latitude, project.coordinateFormat)}, ${formatCoordinate(original.longitude, project.coordinateFormat)}` : ''}</p></div>
    </article>
    <article class="data-card"><div class="data-card-heading"><span class="data-card-icon purple">${icon('clock', 20)}</span><div><strong>Tanggal & jam</strong><small>${display.dateTime ? `${formatDate(display.dateTime, project.dateFormat)} • ${formatTime(display.dateTime, project.timeFormat, project.template.fields.timezone, display.timeZone)}` : 'Belum dipilih'}</small></div><button class="button button-small" data-command="edit-datetime">Edit</button></div>
      <label class="editor-textarea"><span>Zona waktu tampilan</span><input data-display-field="timeZone" type="text" value="${escapeHtml(display.timeZone || '')}" placeholder="Asia/Jakarta atau WIB"></label>
      <div class="original-data-line"><span>Asli</span><p>${original.dateTime ? `${formatDate(original.dateTime, project.dateFormat)} • ${formatTime(original.dateTime, project.timeFormat, true, original.timeZone)}` : 'Tidak tersedia dalam metadata foto'}</p></div>
    </article>
    <div class="coordinate-manual"><label><span>Latitude</span><input data-display-number="latitude" type="number" inputmode="decimal" step="any" value="${display.latitude ?? ''}" placeholder="-8.xxxxxx"></label><label><span>Longitude</span><input data-display-number="longitude" type="number" inputmode="decimal" step="any" value="${display.longitude ?? ''}" placeholder="113.xxxxxx"></label></div>
    <article class="data-card sensor-data-card"><div class="data-card-heading"><span class="data-card-icon">${icon('sliders', 20)}</span><div><strong>Data sensor</strong><small>Nilai kosong tidak akan dicetak</small></div></div>
      <div class="coordinate-manual sensor-manual"><label><span>Akurasi (meter)</span><input data-display-number="accuracy" type="number" inputmode="decimal" step="any" min="0" value="${display.accuracy ?? ''}"></label><label><span>Ketinggian (meter)</span><input data-display-number="altitude" type="number" inputmode="decimal" step="any" value="${display.altitude ?? ''}"></label><label><span>Kecepatan (m/s)</span><input data-display-number="speed" type="number" inputmode="decimal" step="any" min="0" value="${display.speed ?? ''}"></label><label><span>Kompas (derajat)</span><input data-display-number="compass" type="number" inputmode="decimal" step="any" min="0" max="359.99" value="${display.compass ?? ''}"></label></div>
      <div class="original-data-line"><span>Asli</span><p>Akurasi ${formatOptional(original.accuracy, 'm')} • Alt ${formatOptional(original.altitude, 'm')} • Kecepatan ${formatOptional(original.speed, 'm/s')} • Arah ${formatOptional(original.compass, '°')}</p></div>
    </article>
    <button class="button button-ghost full-width" data-command="reset-original" ${isProjectEdited(project) ? '' : 'disabled'}>${icon('undo', 18)} Kembalikan ke Data Asli</button>
  </div>`;
}

function stylePanel(project, app) {
  const providers = app.getMapProviders();
  return `<div class="tool-section style-panel">
    ${rangeControl('Ukuran stamp', 'overlay.width', project.overlay.width, 0.35, 0.96, 0.01, `${Math.round(project.overlay.width * 100)}%`)}
    ${rangeControl('Opacity stamp', 'overlay.opacity', project.overlay.opacity, 0.2, 1, 0.02, `${Math.round(project.overlay.opacity * 100)}%`)}
    ${rangeControl('Ukuran teks', 'overlay.textScale', project.overlay.textScale, 0.65, 1.6, 0.05, `${Math.round(project.overlay.textScale * 100)}%`)}
    ${rangeControl('Ukuran mini map', 'overlay.mapScale', project.overlay.mapScale, 0.65, 1.45, 0.05, `${Math.round(project.overlay.mapScale * 100)}%`)}
    ${rangeControl('Zoom map', 'map.zoom', project.map.zoom, 2, 19, 1, project.map.zoom)}
    <label class="tool-select"><span><strong>Map style</strong><small>Provider dapat diganti lewat konfigurasi</small></span><select data-project-path="map.providerId">${providers.map((provider) => `<option value="${provider.id}" ${provider.id === project.map.providerId ? 'selected' : ''}>${provider.label}</option>`).join('')}</select></label>
    <label class="tool-select"><span><strong>Posisi mini map</strong><small>Di dalam panel GPS stamp</small></span><select data-map-position><option value="left" ${project.template.layout.mapPosition === 'left' ? 'selected' : ''}>Kiri</option><option value="right" ${project.template.layout.mapPosition === 'right' ? 'selected' : ''}>Kanan</option><option value="top" ${project.template.layout.mapPosition === 'top' ? 'selected' : ''}>Atas</option></select></label>
    <div class="alignment-control"><span><strong>Alignment teks</strong></span><div class="segmented-control"><button data-alignment="left" class="${project.overlay.alignment === 'left' ? 'is-active' : ''}">Kiri</button><button data-alignment="center" class="${project.overlay.alignment === 'center' ? 'is-active' : ''}">Tengah</button><button data-alignment="right" class="${project.overlay.alignment === 'right' ? 'is-active' : ''}">Kanan</button></div></div>
    <div class="color-control"><label><span>Panel</span><input type="color" data-panel-color="background" value="${project.template.panel.background}"></label><label><span>Teks</span><input type="color" data-panel-color="foreground" value="${project.template.panel.foreground}"></label><label><span>Aksen</span><input type="color" data-panel-color="accent" value="${project.template.panel.accent}"></label></div>
  </div>`;
}

function textPanel(project) {
  return `<div class="tool-section text-panel">
    <label class="tool-input"><span><strong>Nama project</strong><small>Ditampilkan di daftar project</small></span><input type="text" data-project-text="name" value="${escapeHtml(project.name)}" placeholder="Nama project"></label>
    <label class="tool-input"><span><strong>Nama kegiatan</strong><small>Muncul jika field Kegiatan aktif</small></span><input type="text" data-project-text="activityName" value="${escapeHtml(project.activityName)}" placeholder="Contoh: Kunjungan Lapangan"></label>
    <label class="tool-input"><span><strong>Catatan</strong><small>Muncul jika field Catatan aktif</small></span><textarea data-project-text="note" rows="3" placeholder="Catatan bebas…">${escapeHtml(project.note)}</textarea></label>
    <div class="tool-heading"><div><h3>Teks bebas</h3><small>Dapat digeser langsung di atas foto</small></div><button class="button button-small" data-command="add-text">${icon('plus', 16)} Tambah</button></div>
    <div class="floating-text-list">${project.texts.length ? project.texts.map((text) => `<article><span class="text-style-dot" style="background:${text.color}"></span><div><strong>${escapeHtml(truncate(text.value, 35))}</strong><small>${text.bold ? 'Bold' : 'Regular'} • ${text.fontSize}px</small></div><button data-edit-text="${text.id}">${icon('edit', 17)}</button><button class="danger" data-delete-text="${text.id}">${icon('trash', 17)}</button></article>`).join('') : '<div class="compact-empty mini"><span>Belum ada teks bebas.</span></div>'}</div>
    <div class="logo-editor"><div><strong>Logo custom</strong><small>PNG transparan direkomendasikan</small></div><button class="button button-small" data-command="select-logo">${icon('image', 17)} ${project.logoDataUrl ? 'Ganti' : 'Pilih'}</button>${project.logoDataUrl ? '<button class="icon-button danger" data-command="remove-logo">' + icon('trash', 17) + '</button>' : ''}</div>
  </div>`;
}

function rangeControl(label, path, value, min, max, step, output) {
  return `<label class="tool-range"><span><strong>${label}</strong><output data-path-output="${path}">${output}</output></span><input type="range" data-project-path="${path}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
}

function bindEditorTabs(app, root, project) {
  root.querySelectorAll('[data-editor-tab]').forEach((button) => button.addEventListener('click', () => activateEditorTab(app, root, project, button.dataset.editorTab)));
}

function activateEditorTab(app, root, project, tab) {
  const ui = app.getEditorUi(project.id);
  ui.activeTab = tab;
  root.querySelectorAll('[data-editor-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.editorTab === tab));
  root.querySelector('#editor-panel').innerHTML = panelContent(project, tab, app);
  bindPanelEvents(app, root, project, app.getEditorSaveChange(project.id), app.getEditorDrawPreview(project.id));
  root.querySelector('.editor-tools')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function bindPanelEvents(app, root, project, saveChange, drawPreview) {
  app.setEditorCallbacks(project.id, saveChange, drawPreview);
  const panel = root.querySelector('#editor-panel');
  if (!panel) return;
  panel.querySelectorAll('[data-template-id]').forEach((button) => button.addEventListener('click', async () => {
    const template = cloneTemplate(getTemplate(button.dataset.templateId, app.store.getState().customTemplates));
    project.templateId = template.id;
    project.template = template;
    if (template.preset) {
      project.overlay = structuredClone(template.preset.overlay ?? project.overlay);
      project.map = structuredClone(template.preset.map ?? project.map);
      project.dateFormat = template.preset.dateFormat ?? project.dateFormat;
      project.timeFormat = template.preset.timeFormat ?? project.timeFormat;
    }
    await saveChange('template');
    activateEditorTab(app, root, project, 'template');
  }));
  panel.querySelectorAll('[data-template-field]').forEach((input) => input.addEventListener('change', async () => {
    project.template.fields[input.dataset.templateField] = input.checked;
    input.closest('.field-toggle').classList.toggle('is-on', input.checked);
    await saveChange('field-visibility');
  }));
  panel.querySelectorAll('[data-display-field]').forEach((input) => input.addEventListener('change', async () => {
    setDisplayField(project, input.dataset.displayField, input.value.trim());
    if (input.dataset.displayField === 'address') setDisplayField(project, 'addressLines', splitAddress(input.value));
    await saveChange('display-data');
  }));
  panel.querySelectorAll('[data-display-field]').forEach((input) => input.addEventListener('input', () => {
    setDisplayField(project, input.dataset.displayField, input.value);
    if (input.dataset.displayField === 'address') setDisplayField(project, 'addressLines', splitAddress(input.value));
    app.markProjectChanged(project);
    app.autoSaveProject(project, 'typing');
  }));
  panel.querySelectorAll('[data-display-number]').forEach((input) => input.addEventListener('change', async () => {
    const value = input.value === '' ? null : Number(input.value);
    if (value !== null && !Number.isFinite(value)) return showToast('Nilai angka tidak valid.', { type: 'error' });
    const field = input.dataset.displayNumber;
    if (field === 'latitude' && value !== null && (value < -90 || value > 90)) return showToast('Latitude harus antara -90 dan 90.', { type: 'error' });
    if (field === 'longitude' && value !== null && (value < -180 || value > 180)) return showToast('Longitude harus antara -180 dan 180.', { type: 'error' });
    if ((field === 'accuracy' || field === 'speed') && value !== null && value < 0) return showToast('Nilai sensor tidak boleh negatif.', { type: 'error' });
    if (field === 'compass' && value !== null && (value < 0 || value >= 360)) return showToast('Kompas harus antara 0 dan kurang dari 360 derajat.', { type: 'error' });
    setDisplayField(project, field, value);
    const coordinateField = field === 'latitude' || field === 'longitude';
    if (coordinateField && isValidCoordinate(project.displayData.latitude, project.displayData.longitude) && navigator.onLine) {
      const address = await reverseGeocode(project.displayData.latitude, project.displayData.longitude).catch(() => null);
      if (address) {
        setDisplayField(project, 'address', address.address);
        setDisplayField(project, 'addressLines', address.addressLines);
        setDisplayField(project, 'placeName', address.placeName || '');
      }
    }
    await saveChange('coordinates');
  }));
  panel.querySelectorAll('[data-project-path]').forEach((input) => {
    const update = async (commit = false) => {
      setPath(project, input.dataset.projectPath, input.type === 'range' ? Number(input.value) : input.value);
      const output = panel.querySelector(`[data-path-output="${input.dataset.projectPath}"]`);
      if (output) output.textContent = input.dataset.projectPath === 'map.zoom' ? input.value : `${Math.round(Number(input.value) * 100)}%`;
      await drawPreview();
      if (commit) await saveChange('style', false);
    };
    input.addEventListener('input', () => update(false));
    input.addEventListener('change', () => update(true));
  });
  panel.querySelectorAll('[data-alignment]').forEach((button) => button.addEventListener('click', async () => {
    project.overlay.alignment = button.dataset.alignment;
    await saveChange('alignment');
    panel.querySelectorAll('[data-alignment]').forEach((item) => item.classList.toggle('is-active', item === button));
  }));
  panel.querySelector('[data-map-position]')?.addEventListener('change', async (event) => {
    project.template.layout.mapPosition = event.target.value;
    project.template.layout.direction = event.target.value === 'top' ? 'column' : 'row';
    await saveChange('map-position');
  });
  panel.querySelectorAll('[data-panel-color]').forEach((input) => input.addEventListener('change', async () => {
    project.template.panel[input.dataset.panelColor] = input.value;
    await saveChange('colors');
  }));
  panel.querySelectorAll('[data-project-text]').forEach((input) => input.addEventListener('change', async () => {
    project[input.dataset.projectText] = input.value;
    await saveChange('text');
  }));
  panel.querySelectorAll('[data-project-text]').forEach((input) => input.addEventListener('input', () => {
    project[input.dataset.projectText] = input.value;
    project.modifiedAt = new Date().toISOString();
    app.markProjectChanged(project);
    app.autoSaveProject(project, 'typing');
  }));
  panel.querySelectorAll('[data-edit-text]').forEach((button) => button.addEventListener('click', () => openTextSheet(project, saveChange, button.dataset.editText, () => activateEditorTab(app, root, project, 'text'))));
  panel.querySelectorAll('[data-delete-text]').forEach((button) => button.addEventListener('click', async () => {
    project.texts = project.texts.filter((text) => text.id !== button.dataset.deleteText);
    await saveChange('delete-text');
    activateEditorTab(app, root, project, 'text');
  }));
  panel.querySelectorAll('[data-command]').forEach((button) => button.addEventListener('click', async () => {
    const command = button.dataset.command;
    if (command === 'edit-location') app.router.navigate(`/location?id=${project.id}`);
    if (command === 'edit-datetime') openDateTimeSheet(project, saveChange, app, root);
    if (command === 'add-text') openTextSheet(project, saveChange, null, () => activateEditorTab(app, root, project, 'text'));
    if (command === 'save-preset') openPresetSheet(app, project);
    if (command === 'select-logo') {
      const [file] = await selectLogo();
      if (file) { project.logoDataUrl = await fileToDataUrl(file); project.template.fields.logo = true; await saveChange('logo'); activateEditorTab(app, root, project, 'text'); }
    }
    if (command === 'remove-logo') { project.logoDataUrl = null; project.template.fields.logo = false; await saveChange('logo'); activateEditorTab(app, root, project, 'text'); }
    if (command === 'reset-original') {
      const confirmed = await confirmDialog({ title: 'Kembalikan data asli?', message: 'Lokasi, alamat, tanggal, dan jam tampilan akan kembali ke hasil deteksi awal.', confirmLabel: 'Kembalikan' });
      if (confirmed) { resetDisplayData(project); await saveChange('reset-original'); activateEditorTab(app, root, project, 'data'); }
    }
  }));
}

function formatOptional(value, unit) {
  return Number.isFinite(value) ? `${Number(value).toFixed(1)} ${unit}` : '—';
}

function bindStageGestures(root, stage, project, saveChange, drawPreview) {
  const hitbox = root.querySelector('#stamp-hitbox');
  if (!hitbox) return;
  let gesture = null;
  hitbox.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.resize-handle')) return;
    hitbox.setPointerCapture(event.pointerId);
    gesture = { type: 'move', id: event.pointerId, startX: event.clientX, startY: event.clientY, x: project.overlay.x, y: project.overlay.y };
    hitbox.classList.add('is-moving');
  });
  const resizeHandle = hitbox.querySelector('.resize-handle');
  resizeHandle.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    resizeHandle.setPointerCapture(event.pointerId);
    gesture = { type: 'resize', id: event.pointerId, startX: event.clientX, width: project.overlay.width };
    hitbox.classList.add('is-moving');
  });
  const move = (event) => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const rect = stage.getBoundingClientRect();
    if (gesture.type === 'move') {
      project.overlay.x = clamp(gesture.x + (event.clientX - gesture.startX) / rect.width, 0, 1 - project.overlay.width);
      project.overlay.y = clamp(gesture.y + (event.clientY - gesture.startY) / rect.height, 0, 0.9);
      hitbox.style.left = `${project.overlay.x * 100}%`;
      hitbox.style.top = `${project.overlay.y * 100}%`;
    } else {
      project.overlay.width = clamp(gesture.width + (event.clientX - gesture.startX) / rect.width, 0.35, 0.96);
      hitbox.style.width = `${project.overlay.width * 100}%`;
    }
  };
  const end = async (event) => {
    if (!gesture || event.pointerId !== gesture.id) return;
    gesture = null; hitbox.classList.remove('is-moving'); await saveChange('gesture');
  };
  hitbox.addEventListener('pointermove', move); hitbox.addEventListener('pointerup', end); hitbox.addEventListener('pointercancel', end);
  resizeHandle.addEventListener('pointermove', move); resizeHandle.addEventListener('pointerup', end); resizeHandle.addEventListener('pointercancel', end);

  let textGesture = null;
  stage.addEventListener('pointerdown', (event) => {
    const textHitbox = event.target.closest('.text-hitbox');
    if (!textHitbox) return;
    const text = project.texts.find((item) => item.id === textHitbox.dataset.textHitbox);
    if (!text) return;
    stage.setPointerCapture(event.pointerId);
    textGesture = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: text.x, y: text.y, text, element: textHitbox };
  });
  stage.addEventListener('pointermove', (event) => {
    if (!textGesture || event.pointerId !== textGesture.id) return;
    const rect = stage.getBoundingClientRect();
    textGesture.text.x = clamp(textGesture.x + (event.clientX - textGesture.startX) / rect.width, 0, 0.95);
    textGesture.text.y = clamp(textGesture.y + (event.clientY - textGesture.startY) / rect.height, 0, 0.95);
    textGesture.element.style.left = `${textGesture.text.x * 100}%`;
    textGesture.element.style.top = `${textGesture.text.y * 100}%`;
  });
  const endTextGesture = async (event) => {
    if (!textGesture || event.pointerId !== textGesture.id) return;
    textGesture = null;
    await saveChange('move-text');
  };
  stage.addEventListener('pointerup', endTextGesture);
  stage.addEventListener('pointercancel', endTextGesture);
}

function openDateTimeSheet(project, saveChange, app, root) {
  const value = project.displayData.dateTime || new Date().toISOString();
  openSheet({
    title: 'Edit Tanggal & Jam',
    content: `<form id="datetime-form" class="sheet-form"><div class="two-column-inputs"><label><span>Tanggal</span><input name="date" type="date" value="${dateInputValue(value)}" required></label><label><span>Jam</span><input name="time" type="time" step="1" value="${timeInputValue(value)}" required></label></div><label><span>Format tanggal</span><select name="dateFormat"><option value="long-id" ${project.dateFormat === 'long-id' ? 'selected' : ''}>20 Agustus 2026</option><option value="dd/mm/yyyy" ${project.dateFormat === 'dd/mm/yyyy' ? 'selected' : ''}>20/08/2026</option><option value="dd-mm-yyyy" ${project.dateFormat === 'dd-mm-yyyy' ? 'selected' : ''}>20-08-2026</option><option value="long-en" ${project.dateFormat === 'long-en' ? 'selected' : ''}>Thursday, 20 August 2026</option></select></label><label><span>Format jam</span><select name="timeFormat"><option value="24-seconds" ${project.timeFormat === '24-seconds' ? 'selected' : ''}>05:50:32</option><option value="24-short" ${project.timeFormat === '24-short' ? 'selected' : ''}>05:50</option><option value="12-hour" ${project.timeFormat === '12-hour' ? 'selected' : ''}>5:50 AM</option></select></label><div class="sheet-actions"><button type="button" class="button button-ghost sheet-cancel">Batal</button><button type="submit" class="button button-primary">${icon('check', 18)} Terapkan</button></div></form>`,
    onMount: (sheet, close) => {
      sheet.querySelector('.sheet-cancel').addEventListener('click', close);
      sheet.querySelector('#datetime-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setDisplayField(project, 'dateTime', combineDateAndTime(data.get('date'), data.get('time')));
        project.dateFormat = data.get('dateFormat'); project.timeFormat = data.get('timeFormat');
        await saveChange('datetime'); close(); activateEditorTab(app, root, project, 'data');
      });
    },
  });
}

function openTextSheet(project, saveChange, textId = null, onSaved = () => {}) {
  const existing = project.texts.find((item) => item.id === textId);
  const text = existing ?? { id: createId('text'), value: '', x: 0.08, y: 0.12, width: 0.7, fontSize: 34, color: '#ffffff', opacity: 1, bold: true, italic: false, alignment: 'left', rotation: 0 };
  openSheet({
    title: existing ? 'Edit Teks Bebas' : 'Tambah Teks Bebas',
    content: `<form id="floating-text-form" class="sheet-form"><label><span>Isi teks</span><textarea name="value" rows="3" required placeholder="Tulis keterangan…">${escapeHtml(text.value)}</textarea></label><div class="two-column-inputs"><label><span>Ukuran</span><input name="fontSize" type="number" min="12" max="120" value="${text.fontSize}"></label><label><span>Warna</span><input name="color" type="color" value="${text.color}"></label></div><label class="tool-range"><span><strong>Opacity</strong><output>${Math.round(text.opacity * 100)}%</output></span><input name="opacity" type="range" min="0.2" max="1" step="0.05" value="${text.opacity}"></label><div class="inline-options"><label><input type="checkbox" name="bold" ${text.bold ? 'checked' : ''}> Bold</label><label><input type="checkbox" name="italic" ${text.italic ? 'checked' : ''}> Italic</label></div><label><span>Alignment</span><select name="alignment"><option value="left" ${text.alignment === 'left' ? 'selected' : ''}>Kiri</option><option value="center" ${text.alignment === 'center' ? 'selected' : ''}>Tengah</option><option value="right" ${text.alignment === 'right' ? 'selected' : ''}>Kanan</option></select></label><div class="sheet-actions"><button type="button" class="button button-ghost sheet-cancel">Batal</button><button type="submit" class="button button-primary">${icon('check', 18)} Simpan</button></div></form>`,
    onMount: (sheet, close) => {
      const form = sheet.querySelector('#floating-text-form');
      form.querySelector('[name="opacity"]').addEventListener('input', (event) => { form.querySelector('output').textContent = `${Math.round(event.target.value * 100)}%`; });
      sheet.querySelector('.sheet-cancel').addEventListener('click', close);
      form.addEventListener('submit', async (event) => {
        event.preventDefault(); const data = new FormData(form);
        Object.assign(text, { value: data.get('value').trim(), fontSize: Number(data.get('fontSize')), color: data.get('color'), opacity: Number(data.get('opacity')), bold: data.has('bold'), italic: data.has('italic'), alignment: data.get('alignment') });
        if (!existing) project.texts.push(text);
        await saveChange('floating-text'); close(); onSaved();
      });
    },
  });
}

function openPresetSheet(app, project) {
  openSheet({
    title: 'Simpan sebagai Preset',
    content: `<form id="preset-form" class="sheet-form"><label><span>Nama preset</span><input name="name" type="text" required maxlength="40" placeholder="Contoh: Dokumentasi Kerja"></label><p class="sheet-note">Template, field, warna, ukuran, posisi stamp, map, serta format saat ini akan disimpan.</p><div class="sheet-actions"><button type="button" class="button button-ghost sheet-cancel">Batal</button><button type="submit" class="button button-primary">${icon('save', 18)} Simpan Preset</button></div></form>`,
    onMount: (sheet, close) => {
      sheet.querySelector('.sheet-cancel').addEventListener('click', close);
      sheet.querySelector('#preset-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        await app.createCustomPreset(project, new FormData(event.currentTarget).get('name').trim());
        close(); showToast('Preset berhasil disimpan.');
      });
    },
  });
}

function openExportSheet(app, project) {
  const locationReady = isValidCoordinate(project.displayData.latitude, project.displayData.longitude);
  const dateReady = Boolean(project.displayData.dateTime);
  if (!locationReady || !dateReady) return showToast('Lengkapi lokasi serta tanggal/jam sebelum export.', { type: 'error', duration: 4800 });
  const defaultQuality = app.store.getState().settings.exportQuality;
  openSheet({
    title: 'Simpan Foto',
    content: `<form id="export-form" class="sheet-form"><div class="quality-options">${qualityOption('maximum', 'Original / Maximum', 'Resolusi semaksimal foto sumber', defaultQuality)}${qualityOption('high', 'High', 'Seimbang untuk kualitas dan ukuran', defaultQuality)}${qualityOption('medium', 'Medium', 'File lebih kecil dan cepat', defaultQuality)}</div><div class="export-assurance">${icon('info', 18)} Foto asli tidak akan ditimpa. Hasil dibuat sebagai file baru.</div><div class="sheet-actions"><button type="button" class="button button-ghost sheet-cancel">Batal</button><button type="submit" class="button button-primary">${icon('upload', 18)} Render & Simpan</button></div></form>`,
    onMount: (sheet, close) => {
      sheet.querySelector('.sheet-cancel').addEventListener('click', close);
      sheet.querySelector('#export-form').addEventListener('submit', async (event) => {
        event.preventDefault(); close(); setGlobalBusy(true, 'Menyiapkan export…');
        try {
          const quality = new FormData(event.currentTarget).get('quality');
          const exported = await createExport(project, quality, (status) => setGlobalBusy(true, status));
          await saveExport(exported);
          await app.recordExport(project.id, exported);
          showToast(`Foto disimpan: ${exported.fileName}`, { duration: 5000 });
        } catch (error) { showToast(error.message, { type: 'error', duration: 6000 }); }
        finally { setGlobalBusy(false); }
      });
    },
  });
}

function qualityOption(value, label, description, selected) {
  return `<label class="quality-option"><input type="radio" name="quality" value="${value}" ${value === selected ? 'checked' : ''}><span class="quality-radio"></span><span><strong>${label}</strong><small>${description}</small></span></label>`;
}

function calculatePreviewSize(width, height, maximum) {
  const scale = Math.min(1, maximum / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function updateStampHitbox(root, bounds) {
  const hitbox = root.querySelector('#stamp-hitbox');
  hitbox.style.left = `${bounds.x * 100}%`; hitbox.style.top = `${bounds.y * 100}%`;
  hitbox.style.width = `${bounds.width * 100}%`; hitbox.style.height = `${bounds.height * 100}%`;
  hitbox.hidden = false;
}

function renderTextHitboxes(root, project, originalOnly) {
  const container = root.querySelector('#text-hitboxes');
  container.innerHTML = originalOnly ? '' : project.texts.map((text) => `<div class="text-hitbox" data-text-hitbox="${text.id}" style="left:${text.x * 100}%;top:${text.y * 100}%;color:${text.color};font-size:${Math.max(10, text.fontSize * 0.34)}px">${escapeHtml(truncate(text.value, 32))}</div>`).join('');
}

function updateHistoryButtons(root, history) {
  root.querySelector('#undo-button').disabled = !history.canUndo;
  root.querySelector('#redo-button').disabled = !history.canRedo;
}

function setPath(object, path, value) {
  const parts = path.split('.');
  const key = parts.pop();
  let target = object;
  for (const part of parts) target = target[part];
  target[key] = value;
}

function splitAddress(value) {
  const parts = value.split(',').map((item) => item.trim()).filter(Boolean);
  return [parts.slice(0, 2).join(', '), parts.slice(2, 5).join(', ')].filter(Boolean);
}
