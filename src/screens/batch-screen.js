import { pageHeader } from '../components/layout.js';
import { icon } from '../components/icons.js';
import { confirmDialog, setGlobalBusy, showToast } from '../components/ui.js';
import { formatDate } from '../utils/date.js';
import { formatCoordinate } from '../utils/geo.js';
import { escapeHtml } from '../utils/text.js';
import { runSequential } from '../utils/async.js';
import { createExport, saveExport } from '../services/export-service.js';

export async function renderBatchScreen(app, root) {
  const projectIds = app.batchProjectIds ?? [];
  const projects = projectIds.map((id) => app.getProjectFromState(id)).filter(Boolean);
  root.innerHTML = `<main class="app-page batch-page">
    ${pageHeader({ title: 'Batch GPS Photo', subtitle: `${projects.length} foto dipilih`, back: true, actions: `<button class="icon-button" data-action="gallery" aria-label="Tambah foto">${icon('plus')}</button>` })}
    <section class="batch-summary">
      <div class="batch-summary-icon">${icon('layers', 24)}</div><div><strong>Metadata dibaca per foto</strong><p>GPS dan waktu setiap foto tidak disamakan. Item yang belum lengkap ditandai.</p></div>
    </section>
    <section class="batch-toolbar"><label><input id="batch-select-all" type="checkbox" checked><span>Pilih semua</span></label><button class="button button-soft" id="batch-current-location">${icon('locate', 18)} GPS saat ini untuk yang kosong</button></section>
    <section class="batch-list">${projects.map(batchItem).join('')}</section>
    <footer class="batch-footer"><div><strong id="batch-selected-count">${projects.length}</strong><span>foto dipilih</span></div><button class="button button-primary" id="batch-export">${icon('upload', 20)} Export Batch</button></footer>
  </main>`;
  hydrateBatchImages(root, projects);
  const checkboxes = Array.from(root.querySelectorAll('[data-batch-check]'));
  const selectAll = root.querySelector('#batch-select-all');
  const updateCount = () => {
    const checked = checkboxes.filter((input) => input.checked).length;
    root.querySelector('#batch-selected-count').textContent = checked;
    selectAll.checked = checked === checkboxes.length;
    selectAll.indeterminate = checked > 0 && checked < checkboxes.length;
  };
  checkboxes.forEach((input) => input.addEventListener('change', updateCount));
  selectAll.addEventListener('change', () => { checkboxes.forEach((input) => { input.checked = selectAll.checked; }); updateCount(); });
  root.querySelectorAll('[data-batch-edit]').forEach((button) => button.addEventListener('click', () => app.openProject(button.dataset.batchEdit)));

  root.querySelector('#batch-current-location').addEventListener('click', async () => {
    const missing = projects.filter((project) => !Number.isFinite(project.displayData.latitude) || !Number.isFinite(project.displayData.longitude));
    if (!missing.length) return showToast('Semua foto sudah mempunyai lokasi.');
    const confirmed = await confirmDialog({
      title: 'Gunakan lokasi saat ini?',
      message: `Lokasi GPS perangkat akan diterapkan hanya ke ${missing.length} foto yang tidak mempunyai GPS EXIF. Data asli tetap dicatat sebagai kosong.`,
      confirmLabel: 'Gunakan GPS',
    });
    if (!confirmed) return;
    setGlobalBusy(true, 'Mencari lokasi GPS…');
    try {
      const location = await app.acquireLocationWithAddress();
      for (const project of missing) await app.applyDisplayLocation(project.id, location);
      showToast(`Lokasi diterapkan ke ${missing.length} foto.`);
      renderBatchScreen(app, root);
    } catch (error) {
      showToast(error.message, { type: 'error', duration: 4800 });
    } finally { setGlobalBusy(false); }
  });

  root.querySelector('#batch-export').addEventListener('click', async () => {
    const selected = checkboxes.filter((input) => input.checked).map((input) => app.getProjectFromState(input.dataset.batchCheck)).filter(Boolean);
    if (!selected.length) return showToast('Pilih minimal satu foto.', { type: 'error' });
    const incomplete = selected.filter((project) => !Number.isFinite(project.displayData.latitude) || !project.displayData.dateTime);
    if (incomplete.length) {
      return showToast(`${incomplete.length} foto belum mempunyai lokasi atau tanggal. Lengkapi lewat Edit.`, { type: 'error', duration: 5000 });
    }
    const button = root.querySelector('#batch-export');
    button.disabled = true;
    const originalLabel = button.innerHTML;
    try {
      await runSequential(selected, async (project, index) => {
        button.innerHTML = `<span class="spinner small"></span> ${index + 1}/${selected.length}`;
        const exported = await createExport(project, app.store.getState().settings.exportQuality);
        await saveExport(exported);
        await app.recordExport(project.id, exported);
      });
      showToast(`${selected.length} foto berhasil diexport.`);
      renderBatchScreen(app, root);
    } catch (error) {
      showToast(`Batch berhenti: ${error.message}`, { type: 'error', duration: 6000 });
      button.disabled = false;
      button.innerHTML = originalLabel;
    }
  });
}

function batchItem(project) {
  const hasGps = Number.isFinite(project.displayData.latitude) && Number.isFinite(project.displayData.longitude);
  const hasDate = Boolean(project.displayData.dateTime);
  const ready = hasGps && hasDate;
  return `<article class="batch-item">
    <label class="batch-check"><input type="checkbox" data-batch-check="${project.id}" checked><span>${icon('check', 14)}</span></label>
    <div class="batch-thumb" data-batch-thumb="${project.id}">${icon('image', 23)}</div>
    <div class="batch-copy"><strong>${escapeHtml(project.sourceFileName)}</strong>
      <small class="${hasGps ? '' : 'missing'}">${icon('mapPin', 13)} ${hasGps ? `${formatCoordinate(project.displayData.latitude)}, ${formatCoordinate(project.displayData.longitude)}` : 'GPS tidak tersedia'}</small>
      <small class="${hasDate ? '' : 'missing'}">${icon('clock', 13)} ${hasDate ? formatDate(project.displayData.dateTime, 'long-id') : 'Tanggal tidak tersedia'}</small>
    </div>
    <div class="batch-actions"><span class="batch-status ${ready ? 'ready' : 'incomplete'}">${ready ? 'Siap' : 'Lengkapi'}</span><button data-batch-edit="${project.id}">Edit</button></div>
  </article>`;
}

function hydrateBatchImages(root, projects) {
  for (const project of projects) {
    if (!project.thumbnailBlob) continue;
    const target = root.querySelector(`[data-batch-thumb="${project.id}"]`);
    if (!target) continue;
    const url = URL.createObjectURL(project.thumbnailBlob);
    target.style.backgroundImage = `url("${url}")`;
    target.dataset.objectUrl = url;
    target.innerHTML = '';
  }
}
