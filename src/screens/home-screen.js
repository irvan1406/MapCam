import { bottomNavigation, statusPill } from '../components/layout.js';
import { icon } from '../components/icons.js';
import { formatRelative } from '../utils/date.js';
import { escapeHtml, truncate } from '../utils/text.js';
import { BUILT_IN_TEMPLATES } from '../models/templates.js';

export async function renderHomeScreen(app, root) {
  const state = app.store.getState();
  const recent = state.projects.slice(0, 3);
  const draft = state.projects.find((project) => project.status === 'draft');
  const permission = state.permissions;
  root.innerHTML = `
    <main class="app-page home-page with-bottom-nav">
      <header class="home-header">
        <div class="brand-lockup"><div class="brand-mark"><span></span></div><div><strong>GPS Map Camera</strong><small>Camera & Photo Editor</small></div></div>
        ${navigator.onLine ? statusPill('Siap', 'success') : statusPill('Offline', 'warning')}
      </header>

      <section class="hero-card">
        <div class="hero-glow"></div>
        <div class="hero-copy"><span class="eyebrow">GPS STAMP AKURAT</span><h1>Foto lokasi yang rapi,<br><em>bisa diedit kapan saja.</em></h1><p>Data aktual dipakai otomatis. Foto asli selalu aman.</p></div>
        <div class="hero-actions">
          <button class="capture-button" data-action="camera"><span class="capture-ring">${icon('camera', 29)}</span><span><strong>Ambil Foto</strong><small>GPS otomatis</small></span>${icon('chevronRight', 20)}</button>
          <button class="gallery-button" data-action="gallery"><span>${icon('image', 22)}</span><strong>Pilih dari Galeri</strong><small>EXIF otomatis</small></button>
        </div>
      </section>

      ${draft ? `<section class="continue-card" data-action="open-project" data-project-id="${draft.id}">
        <div class="continue-icon">${icon('wand', 22)}</div><div><span>Lanjutkan project terakhir</span><strong>${escapeHtml(draft.name)}</strong><small>${formatRelative(draft.modifiedAt)}</small></div>${icon('chevronRight', 21)}
      </section>` : ''}

      <section class="section-block">
        <div class="section-heading"><div><span class="eyebrow">AKSES PERANGKAT</span><h2>Status izin</h2></div><button class="text-button" data-action="refresh-permissions">Periksa</button></div>
        <div class="permission-grid">
          ${permissionCard('camera', 'Kamera', permission.camera)}
          ${permissionCard('mapPin', 'Lokasi', permission.location)}
          ${permissionCard('image', 'Foto', permission.storage)}
        </div>
        <p class="privacy-note">${icon('info', 16)} Izin hanya diminta saat fitur digunakan. Foto dan project diproses lokal.</p>
      </section>

      <section class="section-block">
        <div class="section-heading"><div><span class="eyebrow">DESAIN CEPAT</span><h2>Template GPS stamp</h2></div><button class="text-button" data-route="/templates">Lihat semua</button></div>
        <div class="template-strip">${BUILT_IN_TEMPLATES.slice(0, 4).map(templateCard).join('')}</div>
      </section>

      <section class="section-block recent-section">
        <div class="section-heading"><div><span class="eyebrow">TERAKHIR DIEDIT</span><h2>Project terbaru</h2></div><button class="text-button" data-route="/projects">Semua project</button></div>
        ${recent.length ? `<div class="recent-list">${recent.map(projectRow).join('')}</div>` : `<div class="compact-empty">${icon('folder', 26)}<div><strong>Belum ada project</strong><span>Ambil foto atau pilih dari galeri untuk mulai.</span></div></div>`}
      </section>
    </main>
    ${bottomNavigation('home')}`;
  await hydrateProjectImages(root, recent);
}

function permissionCard(iconName, label, state) {
  const normalized = state === 'granted' || state === 'available' ? 'granted' : state === 'denied' ? 'denied' : 'prompt';
  const labels = { granted: 'Diizinkan', denied: 'Ditolak', prompt: 'Saat digunakan' };
  return `<div class="permission-card"><span class="permission-icon permission-${normalized}">${icon(iconName, 20)}</span><div><strong>${label}</strong><small>${labels[normalized]}</small></div>${normalized === 'denied' ? '<button class="permission-fix" data-action="open-settings">Atur</button>' : `<i class="permission-dot ${normalized}"></i>`}</div>`;
}

function templateCard(template) {
  const color = template.panel.accent;
  return `<button class="template-card" data-action="choose-template" data-template-id="${template.id}">
    <div class="template-preview" style="--template-bg:${template.panel.background};--template-accent:${color};--template-fg:${template.panel.foreground}">
      <span class="fake-map"><i></i></span><span class="fake-copy"><i></i><i></i><i></i></span>
    </div><strong>${escapeHtml(template.name)}</strong><small>${escapeHtml(template.description)}</small>
  </button>`;
}

function projectRow(project) {
  const address = project.displayData.addressLines?.[0] || project.displayData.address || 'Lokasi belum dipilih';
  return `<button class="project-row" data-action="open-project" data-project-id="${project.id}">
    <span class="project-thumb" data-thumb-id="${project.id}"><span>${icon('image', 22)}</span></span>
    <span class="project-row-copy"><strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(truncate(address, 52))}</small><em>${formatRelative(project.modifiedAt)}</em></span>
    ${icon('chevronRight', 19)}
  </button>`;
}

async function hydrateProjectImages(root, projects) {
  for (const project of projects) {
    if (!project.thumbnailBlob) continue;
    const target = root.querySelector(`[data-thumb-id="${project.id}"]`);
    if (!target) continue;
    const url = URL.createObjectURL(project.thumbnailBlob);
    target.style.backgroundImage = `url("${url}")`;
    target.innerHTML = '';
    target.dataset.objectUrl = url;
  }
}
