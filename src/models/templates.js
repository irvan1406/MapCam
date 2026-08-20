const fieldDefaults = {
  map: true,
  address: true,
  latitude: true,
  longitude: true,
  date: true,
  time: true,
  timezone: true,
  compass: false,
  activity: false,
  note: false,
  logo: false,
};

export const BUILT_IN_TEMPLATES = [
  {
    id: 'classic', name: 'Classic GPS', description: 'Map, alamat, koordinat, tanggal dan jam.',
    panel: { background: '#0b1325', foreground: '#ffffff', accent: '#38bdf8', opacity: 0.9, radius: 22, blur: 12 },
    layout: { direction: 'row', mapPosition: 'left', mapRatio: 0.37, textAlign: 'left' },
    fields: { ...fieldDefaults },
  },
  {
    id: 'minimal', name: 'Minimal', description: 'Stamp ringan dengan map kecil dan informasi inti.',
    panel: { background: '#ffffff', foreground: '#0f172a', accent: '#0ea5e9', opacity: 0.92, radius: 28, blur: 10 },
    layout: { direction: 'row', mapPosition: 'left', mapRatio: 0.28, textAlign: 'left' },
    fields: { ...fieldDefaults, latitude: false, longitude: false, timezone: false },
  },
  {
    id: 'field-work', name: 'Field Work', description: 'Koordinat besar dan catatan untuk dokumentasi kerja.',
    panel: { background: '#082f49', foreground: '#ffffff', accent: '#fbbf24', opacity: 0.94, radius: 16, blur: 8 },
    layout: { direction: 'column', mapPosition: 'top', mapRatio: 0.48, textAlign: 'left' },
    fields: { ...fieldDefaults, activity: true, note: true },
  },
  {
    id: 'dark', name: 'Dark', description: 'Panel gelap transparan yang tegas.',
    panel: { background: '#020617', foreground: '#f8fafc', accent: '#a78bfa', opacity: 0.76, radius: 12, blur: 16 },
    layout: { direction: 'row', mapPosition: 'right', mapRatio: 0.38, textAlign: 'left' },
    fields: { ...fieldDefaults },
  },
  {
    id: 'transparent', name: 'Transparent', description: 'Tampilan teks ringan tanpa panel besar.',
    panel: { background: '#020617', foreground: '#ffffff', accent: '#22d3ee', opacity: 0.28, radius: 10, blur: 2 },
    layout: { direction: 'row', mapPosition: 'left', mapRatio: 0.3, textAlign: 'left' },
    fields: { ...fieldDefaults, longitude: false },
  },
];

export function getTemplate(id, customTemplates = []) {
  return [...BUILT_IN_TEMPLATES, ...customTemplates].find((template) => template.id === id)
    ?? BUILT_IN_TEMPLATES[0];
}

export function cloneTemplate(template) {
  return structuredClone(template);
}
