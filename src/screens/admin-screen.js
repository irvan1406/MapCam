import { pageHeader } from '../components/layout.js';
import { brandMarkMarkup } from '../components/brand.js';
import { icon } from '../components/icons.js';
import { confirmDialog, showToast } from '../components/ui.js';
import { normalizeControlConfig } from '../models/control-config.js';
import { lockAdminSession, isAdminUnlocked } from '../services/admin-auth-service.js';
import { optimizeLogoDataUrl } from '../services/image-service.js';
import { selectLogo } from '../services/media-service.js';
import { escapeHtml } from '../utils/text.js';

export async function renderAdminScreen(app, root) {
  if (!isAdminUnlocked()) {
    app.router.navigate('/settings');
    return;
  }
  const snapshot = app.getControlConfigSnapshot();
  const control = structuredClone(snapshot.effective);
  const branding = control.branding;
  const logoSource = branding.logoDataUrl || branding.logoUrl || './icons/app-icon.svg';
  root.innerHTML = `<main class="admin-page admin-bg-${escapeHtml(control.admin.background)}">
    <div class="admin-backdrop"></div>
    <div class="admin-content">
      ${pageHeader({ title: 'MapCam Control', subtitle: 'Pengaturan pemilik', back: true, actions: `<button class="icon-button" id="admin-lock" aria-label="Kunci">${icon('logout', 19)}</button>` })}
      <section class="admin-hero">
        <div class="admin-hero-logo">${brandMarkMarkup({ className: 'admin-brand-mark' })}</div>
        <div><span>CONTROL CENTER</span><h2>${escapeHtml(branding.headerTitle)}</h2><p>Atur tampilan, kamera cepat, dan catatan pembuka dari satu tempat.</p></div>
        <i>${snapshot.hasLocalOverride ? 'Perangkat ini' : 'Konfigurasi publik'}</i>
      </section>

      <form id="admin-form" class="admin-form">
        ${adminSection('Identitas aplikasi', 'shield', `
          <div class="admin-logo-control"><div class="admin-logo-preview"><img id="admin-logo-preview" src="${escapeHtml(logoSource)}" alt="Preview logo"></div><div><strong>Logo MapCam</strong><small>PNG, JPG, WebP, atau SVG. Otomatis diringkas agar aplikasi tetap cepat.</small><span><button type="button" class="button button-small button-soft" id="admin-logo-select">${icon('image', 16)} Ganti</button><button type="button" class="button button-small button-ghost" id="admin-logo-reset">Default</button></span></div></div>
          <div class="admin-grid two">
            ${textInput('Nama aplikasi', 'appName', branding.appName, 36)}
            ${textInput('Judul header', 'headerTitle', branding.headerTitle, 48)}
          </div>
          ${textInput('Subjudul', 'tagline', branding.tagline, 80)}
          <div class="admin-grid two">
            ${textInput('Label status', 'statusLabel', branding.statusLabel, 24)}
            <label class="admin-field"><span>Warna aksen</span><input name="accentColor" type="color" value="${escapeHtml(branding.accentColor)}"></label>
          </div>
        `)}

        ${adminSection('Kamera lapangan', 'camera', `
          ${adminToggle('Foto bertag langsung masuk galeri', 'autoSaveStamped', control.camera.autoSaveStamped, 'Project asli tetap dapat diedit.')}
          ${adminToggle('Tetap di kamera setelah memotret', 'keepCameraOpen', control.camera.keepCameraOpen, 'Cocok untuk foto beruntun tanpa menunggu editor.')}
          ${adminToggle('Isi GPS galeri bila EXIF kosong', 'autoLocationForGallery', control.camera.autoLocationForGallery, 'Memakai lokasi perangkat saat foto dipilih.')}
          ${adminToggle('Simpan juga foto asli ke galeri', 'saveOriginalToGallery', control.camera.saveOriginalToGallery, 'Nonaktif secara default agar galeri tidak berisi dua foto.')}
          ${adminToggle('Tampilkan konfirmasi berhasil', 'showSaveConfirmation', control.camera.showSaveConfirmation, 'Notifikasi kecil, tanpa menutup kamera.')}
          <label class="admin-field"><span>Kualitas simpan cepat</span><select name="captureQuality"><option value="fast" ${control.camera.captureQuality === 'fast' ? 'selected' : ''}>Cepat — 12 MP</option><option value="high" ${control.camera.captureQuality === 'high' ? 'selected' : ''}>High — 24 MP</option><option value="maximum" ${control.camera.captureQuality === 'maximum' ? 'selected' : ''}>Maximum — resolusi sumber</option></select></label>
        `)}

        ${adminSection('Catatan saat aplikasi dibuka', 'megaphone', `
          ${adminToggle('Aktifkan popup', 'noticeEnabled', control.announcement.enabled, 'Pesan muncul sesuai frekuensi yang dipilih.')}
          ${textInput('Judul popup', 'noticeTitle', control.announcement.title, 72)}
          <label class="admin-field"><span>Isi catatan</span><textarea name="noticeMessage" rows="5" maxlength="1600" placeholder="Tulis catatan untuk pengguna…">${escapeHtml(control.announcement.message)}</textarea></label>
          <div class="admin-grid two">
            <label class="admin-field"><span>Frekuensi</span><select name="noticeFrequency"><option value="once" ${control.announcement.frequency === 'once' ? 'selected' : ''}>Sekali per catatan</option><option value="every-open" ${control.announcement.frequency === 'every-open' ? 'selected' : ''}>Setiap aplikasi dibuka</option><option value="limited" ${control.announcement.frequency === 'limited' ? 'selected' : ''}>Beberapa kali</option></select></label>
            <label class="admin-field"><span>Batas tampil</span><input name="noticeLimit" type="number" min="1" max="50" value="${control.announcement.displayLimit}"></label>
          </div>
          ${textInput('Teks tombol', 'noticeButton', control.announcement.buttonLabel, 28)}
          <button type="button" class="button button-soft full-width" id="admin-preview-notice">${icon('image', 17)} Preview Popup</button>
        `)}

        ${adminSection('Tampilan khusus admin', 'palette', `
          <label class="admin-field"><span>Background panel admin</span><select name="adminBackground"><option value="aurora" ${control.admin.background === 'aurora' ? 'selected' : ''}>Aurora</option><option value="midnight" ${control.admin.background === 'midnight' ? 'selected' : ''}>Midnight</option><option value="graphite" ${control.admin.background === 'graphite' ? 'selected' : ''}>Graphite</option><option value="ocean" ${control.admin.background === 'ocean' ? 'selected' : ''}>Ocean</option></select></label>
        `)}

        <section class="admin-sync-card">
          <div class="admin-sync-icon">${icon('refresh', 21)}</div><div><strong>Update untuk semua perangkat</strong><p>Konfigurasi publik dibaca otomatis oleh seluruh web-shell. Tanpa server penyimpan, salin konfigurasi ini lalu kirim ke ChatGPT untuk dipublikasikan ke repository MapCam.</p></div>
          <button type="button" class="button button-ghost" id="admin-copy-config">Salin konfigurasi</button>
        </section>

        <div class="admin-footer-actions"><button type="button" class="button button-ghost" id="admin-reset">Kembalikan Default</button><button type="submit" class="button button-primary">${icon('save', 18)} Simpan & Terapkan</button></div>
      </form>
    </div>
  </main>`;

  const form = root.querySelector('#admin-form');
  let logoDataUrl = branding.logoDataUrl;
  let logoUrl = branding.logoUrl;
  root.querySelector('#admin-logo-select').addEventListener('click', async () => {
    const [file] = await selectLogo();
    if (!file) return;
    try {
      logoDataUrl = await optimizeLogoDataUrl(file);
      root.querySelector('#admin-logo-preview').src = logoDataUrl;
      showToast('Logo siap diterapkan.');
    } catch (error) { showToast(error.message, { type: 'error' }); }
  });
  root.querySelector('#admin-logo-reset').addEventListener('click', () => {
    logoDataUrl = '';
    logoUrl = './icons/app-icon.svg';
    root.querySelector('#admin-logo-preview').src = './icons/app-icon.svg';
  });
  form.elements.adminBackground.addEventListener('change', (event) => {
    root.querySelector('.admin-page').className = `admin-page admin-bg-${event.target.value}`;
  });
  root.querySelector('#admin-preview-notice').addEventListener('click', () => {
    const draft = configFromForm(form, control, logoDataUrl, logoUrl, false);
    app.previewAnnouncement(draft.announcement);
  });
  root.querySelector('#admin-copy-config').addEventListener('click', async () => {
    const draft = configFromForm(form, control, logoDataUrl, logoUrl, false);
    const copied = await copyText(JSON.stringify(draft, null, 2));
    showToast(copied ? 'Konfigurasi disalin. Kirimkan ke ChatGPT untuk publikasi global.' : 'Konfigurasi tidak dapat disalin.', { type: copied ? 'default' : 'error', duration: 5000 });
  });
  root.querySelector('#admin-reset').addEventListener('click', async () => {
    const confirmed = await confirmDialog({ title: 'Kembalikan pengaturan?', message: 'Override pada perangkat ini akan dihapus dan konfigurasi publik digunakan kembali.', confirmLabel: 'Kembalikan' });
    if (!confirmed) return;
    await app.resetControlConfig();
    showToast('Konfigurasi publik diterapkan kembali.');
    renderAdminScreen(app, root);
  });
  root.querySelector('#admin-lock').addEventListener('click', () => {
    lockAdminSession();
    app.router.navigate('/settings');
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const next = configFromForm(form, control, logoDataUrl, logoUrl, true);
    await app.updateControlConfig(next);
    showToast('Pengaturan admin disimpan dan langsung diterapkan.');
    renderAdminScreen(app, root);
  });
}

function configFromForm(form, current, logoDataUrl, logoUrl, incrementRevision) {
  const data = new FormData(form);
  const next = structuredClone(current);
  next.branding = {
    ...next.branding,
    appName: data.get('appName'), headerTitle: data.get('headerTitle'), tagline: data.get('tagline'),
    statusLabel: data.get('statusLabel'), accentColor: data.get('accentColor'), logoDataUrl, logoUrl,
  };
  next.camera = {
    ...next.camera,
    autoSaveStamped: data.has('autoSaveStamped'), keepCameraOpen: data.has('keepCameraOpen'),
    autoLocationForGallery: data.has('autoLocationForGallery'), saveOriginalToGallery: data.has('saveOriginalToGallery'),
    showSaveConfirmation: data.has('showSaveConfirmation'), captureQuality: data.get('captureQuality'),
  };
  const noticeSignatureBefore = JSON.stringify(current.announcement);
  next.announcement = {
    ...next.announcement,
    enabled: data.has('noticeEnabled'), title: data.get('noticeTitle'), message: data.get('noticeMessage'),
    frequency: data.get('noticeFrequency'), displayLimit: Number(data.get('noticeLimit')), buttonLabel: data.get('noticeButton'),
  };
  if (incrementRevision && JSON.stringify(next.announcement) !== noticeSignatureBefore) next.announcement.id = `notice-${Date.now()}`;
  next.admin.background = data.get('adminBackground');
  if (incrementRevision) next.revision = Math.max(1, Number(current.revision) || 1) + 1;
  return normalizeControlConfig(next);
}

function adminSection(title, iconName, content) {
  return `<section class="admin-section"><header>${icon(iconName, 19)}<h3>${escapeHtml(title)}</h3></header><div class="admin-section-body">${content}</div></section>`;
}

function textInput(label, name, value, maximum) {
  return `<label class="admin-field"><span>${escapeHtml(label)}</span><input name="${name}" type="text" value="${escapeHtml(value)}" maxlength="${maximum}" required></label>`;
}

function adminToggle(label, name, checked, help) {
  return `<label class="admin-toggle"><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(help)}</small></span><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><i aria-hidden="true"></i></label>`;
}

async function copyText(value) {
  try { await navigator.clipboard.writeText(value); return true; }
  catch {
    const input = document.createElement('textarea');
    input.value = value; input.style.position = 'fixed'; input.style.opacity = '0';
    document.body.append(input); input.select();
    const copied = document.execCommand('copy'); input.remove(); return copied;
  }
}
