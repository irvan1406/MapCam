import { bottomNavigation, pageHeader } from '../components/layout.js';
import { icon } from '../components/icons.js';
import { emptyState, confirmDialog, showToast } from '../components/ui.js';
import { formatDate, formatRelative } from '../utils/date.js';
import { escapeHtml, truncate } from '../utils/text.js';

export async function renderProjectsScreen(app, root) {
  const projects = app.store.getState().projects;
  root.innerHTML = `
    <main class="app-page with-bottom-nav projects-page">
      ${pageHeader({ title: 'Project', subtitle: `${projects.length} project tersimpan`, actions: `<button class="icon-button" data-action="gallery" aria-label="Tambah foto">${icon('plus')}</button>` })}
      <section class="project-toolbar">
        <label class="search-field">${icon('search', 19)}<input id="project-search" type="search" placeholder="Cari nama atau lokasi…" autocomplete="off"></label>
        <button class="filter-button is-active" data-filter="all">Semua</button>
        <button class="filter-button" data-filter="draft">Draft</button>
        <button class="filter-button" data-filter="exported">Selesai</button>
      </section>
      <section id="project-grid" class="project-grid">
        ${projects.length ? projects.map(projectCard).join('') : emptyState('folder', 'Belum ada project', 'Foto yang Anda edit akan tersimpan di sini.', '<button class="button button-primary" data-action="gallery">Pilih Foto</button>')}
      </section>
    </main>${bottomNavigation('projects')}`;

  await hydrateThumbnails(root, projects);
  const searchInput = root.querySelector('#project-search');
  let filter = 'all';
  const applyFilter = () => {
    const query = searchInput.value.trim().toLowerCase();
    root.querySelectorAll('.project-card').forEach((card) => {
      const matchesFilter = filter === 'all' || card.dataset.status === filter;
      const matchesQuery = !query || card.dataset.search.includes(query);
      card.hidden = !(matchesFilter && matchesQuery);
    });
  };
  searchInput?.addEventListener('input', applyFilter);
  root.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
    filter = button.dataset.filter;
    root.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('is-active', item === button));
    applyFilter();
  }));
  root.querySelectorAll('[data-project-menu]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleMenu(root, button.dataset.projectMenu);
  }));
  root.querySelectorAll('[data-project-command]').forEach((button) => button.addEventListener('click', async (event) => {
    event.stopPropagation();
    const projectId = button.closest('[data-project-id]').dataset.projectId;
    const command = button.dataset.projectCommand;
    if (command === 'edit' || command === 'export') app.openProject(projectId);
    if (command === 'duplicate') {
      await app.duplicateProject(projectId);
      showToast('Project berhasil diduplikat.');
    }
    if (command === 'share') await app.shareLastExport(projectId);
    if (command === 'delete') {
      const confirmed = await confirmDialog({ title: 'Hapus project?', message: 'Project akan dihapus dari perangkat. Foto sumber di galeri tetap aman.', confirmLabel: 'Hapus', destructive: true });
      if (confirmed) { await app.removeProject(projectId); showToast('Project dihapus.'); }
    }
  }));
}

function projectCard(project) {
  const location = project.displayData.addressLines?.[0] || project.displayData.address || 'Lokasi belum dipilih';
  const status = project.status === 'exported' ? 'exported' : 'draft';
  const date = project.displayData.dateTime ? formatDate(project.displayData.dateTime, 'long-id') : 'Tanggal belum dipilih';
  const search = `${project.name} ${location}`.toLowerCase();
  return `<article class="project-card" data-project-id="${project.id}" data-status="${status}" data-search="${escapeHtml(search)}">
    <button class="project-cover" data-action="open-project" data-project-id="${project.id}" data-project-thumb="${project.id}" aria-label="Edit ${escapeHtml(project.name)}">
      <span class="project-cover-placeholder">${icon('image', 30)}</span>
      <span class="project-state ${status}">${status === 'exported' ? 'Selesai' : 'Draft'}</span>
      <span class="project-edited">${formatRelative(project.modifiedAt)}</span>
    </button>
    <div class="project-card-body"><div><h3>${escapeHtml(project.name)}</h3><p>${icon('mapPin', 14)} ${escapeHtml(truncate(location, 40))}</p><small>${date}</small></div>
      <button class="icon-button" data-project-menu="${project.id}" aria-label="Menu project">${icon('more')}</button>
    </div>
    <div class="project-menu" data-menu-id="${project.id}">
      <button data-project-command="edit">${icon('edit', 18)} Edit Lagi</button>
      <button data-project-command="export">${icon('upload', 18)} Export Lagi</button>
      <button data-project-command="duplicate">${icon('copy', 18)} Duplikat</button>
      <button data-project-command="share" ${project.lastExportBlob ? '' : 'disabled'}>${icon('share', 18)} Bagikan hasil</button>
      <button data-project-command="delete" class="danger">${icon('trash', 18)} Hapus</button>
    </div>
  </article>`;
}

async function hydrateThumbnails(root, projects) {
  for (const project of projects) {
    if (!project.thumbnailBlob) continue;
    const target = root.querySelector(`[data-project-thumb="${project.id}"]`);
    if (!target) continue;
    const url = URL.createObjectURL(project.thumbnailBlob);
    target.style.backgroundImage = `url("${url}")`;
    target.dataset.objectUrl = url;
    target.querySelector('.project-cover-placeholder')?.remove();
  }
}

function toggleMenu(root, id) {
  root.querySelectorAll('.project-menu').forEach((menu) => menu.classList.toggle('is-open', menu.dataset.menuId === id && !menu.classList.contains('is-open')));
}
