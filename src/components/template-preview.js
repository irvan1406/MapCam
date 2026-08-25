import { escapeHtml } from '../utils/text.js';

export function templatePreviewMarkup(template) {
  const variant = template.layout?.variant ?? 'classic';
  const map = template.fields?.map ? '<span class="gps-preview-map"><i></i></span>' : '';
  const lines = '<span class="gps-preview-lines"><b></b><i></i><i></i><i></i></span>';
  if (variant === 'datetime') {
    return '<span class="gps-preview-stamp variant-datetime"><strong>06:02</strong><em></em><span><b>26 Agu 2026</b><small>Rabu</small></span><i></i></span>';
  }
  if (variant === 'qr') return `<span class="gps-preview-stamp variant-qr">${map}${lines}<span class="gps-preview-qr"></span></span>`;
  if (variant === 'report') {
    const badge = escapeHtml(template.layout?.badgeText || 'Check In');
    return `<span class="gps-preview-stamp variant-report"><span class="gps-preview-map-wrap"><small>${badge}</small>${map}</span>${lines}</span>`;
  }
  if (variant === 'compass') return `<span class="gps-preview-stamp variant-compass"><span class="gps-preview-compass"><i></i><b>N</b></span>${lines}${map}</span>`;
  return `<span class="gps-preview-stamp variant-${escapeHtml(variant)}">${map}${lines}</span>`;
}
