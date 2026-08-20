import { pageHeader } from '../components/layout.js';
import { icon } from '../components/icons.js';
import { confirmDialog, emptyState, showToast } from '../components/ui.js';
import { BUILT_IN_TEMPLATES } from '../models/templates.js';
import { escapeHtml } from '../utils/text.js';

export function renderTemplatesScreen(app, root) {
  const state = app.store.getState();
  const custom = state.customTemplates;
  root.innerHTML = `<main class="app-page templates-page">
    ${pageHeader({ title: 'Template', subtitle: 'Pilih gaya GPS stamp', back: true })}
    <section class="template-page-section"><span class="eyebrow">BAWAAN</span><div class="template-grid-large">${BUILT_IN_TEMPLATES.map((template) => largeTemplateCard(template, state.settings.defaultTemplateId)).join('')}</div></section>
    <section class="template-page-section"><div class="section-heading"><div><span class="eyebrow">PRESET SAYA</span><h2>Template Saya</h2></div></div>
      ${custom.length ? `<div class="template-grid-large">${custom.map((template) => largeTemplateCard(template, state.settings.defaultTemplateId, true)).join('')}</div>` : emptyState('palette', 'Belum ada preset', 'Atur desain di editor lalu simpan sebagai preset.')}
    </section>
  </main>`;
  root.querySelectorAll('[data-template-select]').forEach((button) => button.addEventListener('click', async () => {
    await app.setDefaultTemplate(button.dataset.templateSelect);
    showToast('Template default diperbarui.');
  }));
  root.querySelectorAll('[data-template-delete]').forEach((button) => button.addEventListener('click', async (event) => {
    event.stopPropagation();
    const confirmed = await confirmDialog({ title: 'Hapus preset?', message: 'Preset custom ini akan dihapus. Project yang sudah memakai preset tetap aman.', confirmLabel: 'Hapus', destructive: true });
    if (confirmed) await app.removeCustomTemplate(button.dataset.templateDelete);
  }));
}

function largeTemplateCard(template, selectedId, custom = false) {
  const selected = selectedId === template.id;
  return `<button class="template-large-card ${selected ? 'is-selected' : ''}" data-template-select="${template.id}">
    <div class="template-large-preview" style="--panel:${template.panel.background};--accent:${template.panel.accent};--fg:${template.panel.foreground};--opacity:${template.panel.opacity}">
      <div class="template-photo-pattern"></div><div class="template-mock-stamp ${template.layout.direction}"><span class="mock-map"><i></i></span><span class="mock-lines"><i></i><i></i><i></i><i></i></span></div>
      ${selected ? `<span class="selected-badge">${icon('check', 16)} Default</span>` : ''}
    </div><span class="template-large-copy"><strong>${escapeHtml(template.name)}</strong><small>${escapeHtml(template.description)}</small></span>
    ${custom ? `<span class="template-delete" data-template-delete="${template.id}" aria-label="Hapus preset">${icon('trash', 17)}</span>` : ''}
  </button>`;
}
