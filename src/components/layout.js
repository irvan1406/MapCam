import { icon } from './icons.js';
import { escapeHtml } from '../utils/text.js';

export function bottomNavigation(active = 'home') {
  const items = [
    { id: 'camera', label: 'Kamera', icon: 'camera', action: 'camera' },
    { id: 'gallery', label: 'Galeri', icon: 'image', action: 'gallery' },
    { id: 'projects', label: 'Project', icon: 'folder', route: '/projects' },
    { id: 'settings', label: 'Pengaturan', icon: 'settings', route: '/settings' },
  ];
  return `<nav class="bottom-nav" aria-label="Navigasi utama">${items.map((item) => `
    <button class="nav-item ${active === item.id ? 'is-active' : ''}" ${item.route ? `data-route="${item.route}"` : `data-action="${item.action}"`}>
      <span class="nav-icon">${icon(item.icon, 23)}</span><span>${item.label}</span>
    </button>`).join('')}</nav>`;
}

export function pageHeader({ title, subtitle = '', subtitleHtml = '', back = false, actions = '' }) {
  return `<header class="page-header">
    <div class="page-title-row">
      ${back ? `<button class="icon-button" data-action="back" aria-label="Kembali">${icon('arrowLeft')}</button>` : '<div class="brand-mark brand-mark-small"><span></span></div>'}
      <div class="page-title"><h1>${escapeHtml(title)}</h1>${subtitleHtml ? `<p>${subtitleHtml}</p>` : subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</div>
      <div class="page-header-actions">${actions}</div>
    </div>
  </header>`;
}

export function statusPill(label, state = 'neutral') {
  return `<span class="status-pill status-${state}"><i></i>${escapeHtml(label)}</span>`;
}
