import { DEFAULT_CONTROL_CONFIG, normalizeControlConfig } from '../models/control-config.js';
import { escapeHtml } from '../utils/text.js';

let activeBranding = normalizeControlConfig(DEFAULT_CONTROL_CONFIG).branding;

export function setActiveBranding(branding = {}) {
  activeBranding = normalizeControlConfig({ branding }).branding;
  return activeBranding;
}

export function getActiveBranding() {
  return activeBranding;
}

export function brandMarkMarkup({ className = '', id = '', button = false, label = '' } = {}) {
  const source = activeBranding.logoDataUrl || activeBranding.logoUrl || './icons/app-icon.svg';
  const tag = button ? 'button' : 'span';
  const attributes = [
    `class="brand-mark brand-logo ${escapeHtml(className)}"`,
    id ? `id="${escapeHtml(id)}"` : '',
    button ? 'type="button"' : '',
    label ? `aria-label="${escapeHtml(label)}"` : 'aria-hidden="true"',
  ].filter(Boolean).join(' ');
  return `<${tag} ${attributes}><img src="${escapeHtml(source)}" alt="" draggable="false"></${tag}>`;
}
