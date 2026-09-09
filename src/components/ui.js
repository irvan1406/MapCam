import { icon } from './icons.js';
import { escapeHtml } from '../utils/text.js';

export function showToast(message, options = {}) {
  let region = document.querySelector('.toast-region');
  if (!region) {
    region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${options.type ?? 'default'}`;
  toast.innerHTML = `${icon(options.type === 'error' ? 'info' : 'check', 20)}<span>${escapeHtml(message)}</span>`;
  region.append(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  setTimeout(() => {
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 250);
  }, options.duration ?? 3200);
}

export function setGlobalBusy(isBusy, message = 'Memproses…') {
  let overlay = document.querySelector('.global-busy');
  if (isBusy) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'global-busy';
      document.body.append(overlay);
    }
    overlay.innerHTML = `<div class="busy-card"><span class="spinner"></span><strong>${escapeHtml(message)}</strong></div>`;
    requestAnimationFrame(() => overlay.classList.add('is-visible'));
  } else if (overlay) {
    overlay.classList.remove('is-visible');
    setTimeout(() => overlay.remove(), 180);
  }
}

export function confirmDialog({ title, message, confirmLabel = 'Lanjutkan', destructive = false }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'app-dialog';
    dialog.innerHTML = `
      <form method="dialog">
        <div class="dialog-icon ${destructive ? 'danger' : ''}">${icon(destructive ? 'trash' : 'info', 26)}</div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
        <div class="dialog-actions">
          <button class="button button-ghost" value="cancel">Batal</button>
          <button class="button ${destructive ? 'button-danger' : 'button-primary'}" value="confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </form>`;
    document.body.append(dialog);
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'confirm');
      dialog.remove();
    }, { once: true });
    dialog.showModal();
  });
}

export function noticeDialog({ title, message, buttonLabel = 'Mengerti', logoMarkup = '' }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'app-dialog notice-dialog';
    dialog.innerHTML = `<form method="dialog">
      ${logoMarkup ? `<div class="notice-logo">${logoMarkup}</div>` : `<div class="dialog-icon">${icon('info', 26)}</div>`}
      <h3>${escapeHtml(title)}</h3>
      <p class="notice-message">${escapeHtml(message)}</p>
      <button class="button button-primary full-width" value="confirm">${escapeHtml(buttonLabel)}</button>
    </form>`;
    document.body.append(dialog);
    dialog.addEventListener('close', () => { dialog.remove(); resolve(); }, { once: true });
    dialog.showModal();
  });
}

export function openSheet({ title, content, onMount, className = '' }) {
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay is-visible';
  overlay.innerHTML = `
    <section class="bottom-sheet ${className}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="sheet-handle"></div>
      <header class="sheet-header"><h3>${escapeHtml(title)}</h3><button class="icon-button sheet-close" aria-label="Tutup">${icon('close')}</button></header>
      <div class="sheet-content">${content}</div>
    </section>`;
  const close = () => {
    overlay.classList.remove('is-visible');
    setTimeout(() => overlay.remove(), 220);
  };
  overlay.addEventListener('pointerdown', (event) => { if (event.target === overlay) close(); });
  overlay.querySelector('.sheet-close').addEventListener('click', close);
  document.body.append(overlay);
  onMount?.(overlay.querySelector('.bottom-sheet'), close);
  return { element: overlay, close };
}

export function emptyState(iconName, title, description, actionHtml = '') {
  return `<div class="empty-state"><div class="empty-icon">${icon(iconName, 30)}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p>${actionHtml}</div>`;
}
