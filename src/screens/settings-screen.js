import { bottomNavigation, pageHeader } from '../components/layout.js';
import { icon } from '../components/icons.js';
import { BUILT_IN_TEMPLATES } from '../models/templates.js';
import { getConfig } from '../config/runtime-config.js';
import { getStorageEstimate } from '../storage/database.js';
import { openSheet, showToast } from '../components/ui.js';
import { brandMarkMarkup, getActiveBranding } from '../components/brand.js';
import { getAdminAttemptState, isAdminUnlocked, recordAdminFailure, unlockAdminSession, verifyAdminPin } from '../services/admin-auth-service.js';
import { escapeHtml } from '../utils/text.js';

export async function renderSettingsScreen(app, root) {
  const settings = app.store.getState().settings;
  const config = getConfig();
  const branding = getActiveBranding();
  const estimate = await getStorageEstimate().catch(() => null);
  root.innerHTML = `<main class="app-page settings-page with-bottom-nav">
    ${pageHeader({ title: 'Pengaturan', subtitle: `Versi ${config.app.versionName}` })}
    <form id="settings-form">
      ${settingsGroup('Tampilan', 'palette', `
        ${selectRow('Tema aplikasi', 'theme', settings.theme, [['system','Ikuti perangkat'],['light','Terang'],['dark','Gelap']])}
        ${selectRow('Template default', 'defaultTemplateId', settings.defaultTemplateId, BUILT_IN_TEMPLATES.map((item) => [item.id,item.name]))}
        ${selectRow('Posisi stamp', 'stampPosition', settings.stampPosition, [['bottom-left','Kiri bawah'],['bottom-right','Kanan bawah'],['top-left','Kiri atas'],['top-right','Kanan atas']])}
      `)}
      ${settingsGroup('Kamera', 'camera', `
        ${toggleRow('Stamp resolusi tinggi di latar belakang', 'backgroundHighRes', settings.backgroundHighRes)}
        <p class="setting-help">Aktif: sekali jepret langsung tersimpan, stamp resolusi tinggi diproses otomatis di belakang layar. Mati: foto tersimpan instan tanpa proses tambahan — export dilakukan manual dari editor.</p>
      `)}
      ${settingsGroup('Format data', 'clock', `
        ${selectRow('Format koordinat', 'coordinateFormat', settings.coordinateFormat, [['decimal','Desimal (-8.123456)'],['dms','Derajat / menit / detik']])}
        ${selectRow('Format tanggal', 'dateFormat', settings.dateFormat, [['long-id','20 Agustus 2026'],['dd/mm/yyyy','20/08/2026'],['dd-mm-yyyy','20-08-2026'],['long-en','Thursday, 20 August 2026']])}
        ${selectRow('Format jam', 'timeFormat', settings.timeFormat, [['24-seconds','05:50:32'],['24-short','05:50'],['12-hour','5:50 AM']])}
        ${toggleRow('Tampilkan zona waktu', 'showTimeZone', settings.showTimeZone)}
        ${toggleRow('Tampilkan alamat', 'showAddress', settings.showAddress)}
        ${toggleRow('Tampilkan koordinat', 'showCoordinates', settings.showCoordinates)}
      `)}
      ${settingsGroup('Map & export', 'layers', `
        ${selectRow('Provider map', 'mapProviderId', settings.mapProviderId, config.maps.providers.filter((item) => item.enabled).map((item) => [item.id,item.label]))}
        ${rangeRow('Zoom map default', 'mapZoom', settings.mapZoom, 2, 19, 1)}
        ${selectRow('Kualitas export', 'exportQuality', settings.exportQuality, [['maximum','Original / Maximum'],['high','High'],['medium','Medium']])}
        ${textRow('Pola nama file', 'fileNamePattern', settings.fileNamePattern, 'MapCam-{date}-{time}')}
        <p class="setting-help">Variabel: {date}, {time}, {location}</p>
      `)}
      ${settingsGroup('Project & privasi', 'folder', `
        ${toggleRow('Auto save project', 'autoSave', settings.autoSave)}
        <div class="setting-static"><span><strong>Penyimpanan lokal</strong><small>${estimate ? `${formatBytes(estimate.usage || 0)} terpakai dari ${formatBytes(estimate.quota || 0)}` : 'Tersimpan di perangkat ini'}</small></span><span class="privacy-lock">Lokal</span></div>
        <div class="privacy-panel">${icon('info', 20)}<p>Foto, EXIF, GPS, dan project tidak diunggah otomatis. Permintaan map/alamat hanya dikirim saat diperlukan.</p></div>
      `)}
      <section class="settings-group about-card">${brandMarkMarkup({ className: 'about-logo', id: 'settings-brand-logo', button: true, label: 'Logo aplikasi' })}<div><strong>${escapeHtml(branding.appName)}</strong><small>Version ${config.app.versionName} (${config.app.versionCode})</small><p>GPS photo editor yang menjaga data asli tetap terpisah dari data tampilan.</p></div></section>
    </form>
  </main>${bottomNavigation('settings')}`;

  const form = root.querySelector('#settings-form');
  form.addEventListener('change', async (event) => {
    const input = event.target;
    if (!input.name) return;
    const value = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
    await app.updateSetting(input.name, value);
    const output = form.querySelector(`[data-range-output="${input.name}"]`);
    if (output) output.textContent = value;
    showToast('Pengaturan disimpan.', { duration: 1700 });
  });
  form.querySelectorAll('input[type="range"]').forEach((input) => input.addEventListener('input', () => {
    const output = form.querySelector(`[data-range-output="${input.name}"]`);
    if (output) output.textContent = input.value;
  }));
  bindAdminTrigger(app, root.querySelector('#settings-brand-logo'));
}

function bindAdminTrigger(app, logo) {
  if (!logo) return;
  let taps = [];
  logo.addEventListener('click', () => {
    const now = Date.now();
    taps = [...taps.filter((time) => now - time < 1700), now];
    if (taps.length < 5) return;
    taps = [];
    if (isAdminUnlocked()) app.router.navigate('/admin');
    else openAdminUnlockSheet(app);
  });
}

function openAdminUnlockSheet(app) {
  const attempt = getAdminAttemptState();
  const lockedSeconds = Math.ceil(attempt.remainingMs / 1000);
  openSheet({
    title: 'Verifikasi',
    className: 'admin-pin-sheet',
    content: `<form id="admin-pin-form" class="sheet-form">
      <div class="admin-pin-icon">${icon('lock', 26)}</div>
      <label><span>Kode akses</span><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" required ${attempt.remainingMs ? 'disabled' : ''}></label>
      <p class="admin-pin-message ${attempt.remainingMs ? 'error' : ''}">${attempt.remainingMs ? `Coba kembali dalam ${lockedSeconds} detik.` : 'Masukkan kode untuk melanjutkan.'}</p>
      <div class="sheet-actions"><button type="button" class="button button-ghost sheet-cancel">Batal</button><button type="submit" class="button button-primary" ${attempt.remainingMs ? 'disabled' : ''}>Lanjutkan</button></div>
    </form>`,
    onMount: (sheet, close) => {
      const form = sheet.querySelector('#admin-pin-form');
      const message = sheet.querySelector('.admin-pin-message');
      const input = form.elements.pin;
      sheet.querySelector('.sheet-cancel').addEventListener('click', close);
      if (!attempt.remainingMs) setTimeout(() => input.focus(), 180);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const current = getAdminAttemptState();
        if (current.remainingMs) return;
        const valid = await verifyAdminPin(new FormData(form).get('pin')).catch(() => false);
        input.value = '';
        if (valid) {
          unlockAdminSession();
          close();
          app.router.navigate('/admin');
          return;
        }
        const failure = recordAdminFailure();
        message.classList.add('error');
        if (failure.lockedUntil) {
          input.disabled = true;
          form.querySelector('[type="submit"]').disabled = true;
          message.textContent = 'Terlalu banyak percobaan. Tunggu 30 detik.';
        } else message.textContent = 'Kode tidak sesuai.';
      });
    },
  });
}

function settingsGroup(title, iconName, body) {
  return `<section class="settings-group"><div class="settings-group-title">${icon(iconName, 19)}<h2>${title}</h2></div><div class="settings-list">${body}</div></section>`;
}

function selectRow(label, name, value, options) {
  return `<label class="setting-row"><span><strong>${label}</strong></span><select name="${name}">${options.map(([optionValue, optionLabel]) => `<option value="${optionValue}" ${optionValue === value ? 'selected' : ''}>${optionLabel}</option>`).join('')}</select></label>`;
}

function toggleRow(label, name, checked) {
  return `<label class="setting-row"><span><strong>${label}</strong></span><input class="switch-input" type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span class="switch" aria-hidden="true"></span></label>`;
}

function rangeRow(label, name, value, min, max, step) {
  return `<label class="setting-range"><span><strong>${label}</strong><output data-range-output="${name}">${value}</output></span><input type="range" name="${name}" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;
}

function textRow(label, name, value, placeholder) {
  return `<label class="setting-text"><span><strong>${label}</strong></span><input type="text" name="${name}" value="${value}" placeholder="${placeholder}"></label>`;
}

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}
