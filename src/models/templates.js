export const FIELD_DEFAULTS = {
  map: true,
  place: true,
  address: true,
  latitude: true,
  longitude: true,
  accuracy: true,
  altitude: true,
  speed: false,
  date: true,
  time: true,
  timezone: true,
  compass: true,
  activity: false,
  note: false,
  logo: false,
  qr: false,
};

const CORE_FIELDS = {
  ...FIELD_DEFAULTS,
  accuracy: false,
  altitude: false,
  speed: false,
  compass: false,
};

export const BUILT_IN_TEMPLATES = [
  {
    id: 'advanced', name: 'Template Lanjutan', description: 'Informasi GPS lengkap dalam panel horizontal ringkas.',
    panel: { background: '#171717', foreground: '#ffffff', accent: '#fb923c', opacity: 0.82, radius: 10, blur: 10 },
    layout: { direction: 'row', variant: 'advanced', mapPosition: 'left', mapRatio: 0.27, textAlign: 'left' },
    fields: { ...FIELD_DEFAULTS, speed: false, activity: false, note: false, logo: false, qr: false },
  },
  {
    id: 'date-time', name: 'Tanggal & Waktu', description: 'Jam dan tanggal besar untuk dokumentasi berbasis waktu.',
    panel: { background: '#333333', foreground: '#ffffff', accent: '#facc15', opacity: 0.82, radius: 9, blur: 8 },
    layout: { direction: 'row', variant: 'datetime', mapPosition: 'left', mapRatio: 0, textAlign: 'left' },
    fields: { ...CORE_FIELDS, map: false, timezone: false },
  },
  {
    id: 'location-qr', name: 'Pemindaian Lokasi', description: 'Map, data lokasi, dan QR yang membuka koordinat di Maps.',
    panel: { background: '#303030', foreground: '#ffffff', accent: '#22c55e', opacity: 0.84, radius: 9, blur: 8 },
    layout: { direction: 'row', variant: 'qr', mapPosition: 'left', mapRatio: 0.25, textAlign: 'left' },
    fields: { ...CORE_FIELDS, qr: true, timezone: false },
  },
  {
    id: 'classic', name: 'Classic GPS', description: 'Map, alamat, koordinat, tanggal dan jam.',
    panel: { background: '#090f18', foreground: '#ffffff', accent: '#fbbf24', opacity: 0.78, radius: 14, blur: 10 },
    layout: { direction: 'row', variant: 'classic', mapPosition: 'left', mapRatio: 0.27, textAlign: 'left' },
    fields: { ...CORE_FIELDS },
  },
  {
    id: 'report', name: 'Pelaporan', description: 'Stamp check-in untuk kunjungan dan dokumentasi lapangan.',
    panel: { background: '#303030', foreground: '#ffffff', accent: '#22c55e', opacity: 0.84, radius: 9, blur: 8 },
    layout: { direction: 'row', variant: 'report', mapPosition: 'left', mapRatio: 0.27, textAlign: 'left', badgeText: 'Check In' },
    fields: { ...CORE_FIELDS, activity: true },
  },
  {
    id: 'compass-navigation', name: 'Kompas Navigasi', description: 'Kompas, arah, ketinggian, map, dan detail lokasi.',
    panel: { background: '#303030', foreground: '#ffffff', accent: '#38bdf8', opacity: 0.84, radius: 9, blur: 8 },
    layout: { direction: 'row', variant: 'compass', mapPosition: 'right', mapRatio: 0.2, textAlign: 'left' },
    fields: { ...CORE_FIELDS, compass: true, altitude: true },
  },
  {
    id: 'minimal', name: 'Minimal', description: 'Stamp ringan dengan map kecil dan informasi inti.',
    panel: { background: '#ffffff', foreground: '#0f172a', accent: '#0ea5e9', opacity: 0.92, radius: 28, blur: 10 },
    layout: { direction: 'row', variant: 'minimal', mapPosition: 'left', mapRatio: 0.25, textAlign: 'left' },
    fields: { ...FIELD_DEFAULTS, latitude: false, longitude: false, accuracy: false, altitude: false, compass: false, timezone: false },
  },
  {
    id: 'field-work', name: 'Field Work', description: 'Koordinat besar dan catatan untuk dokumentasi kerja.',
    panel: { background: '#082f49', foreground: '#ffffff', accent: '#fbbf24', opacity: 0.94, radius: 16, blur: 8 },
    layout: { direction: 'column', variant: 'field-work', mapPosition: 'top', mapRatio: 0.48, textAlign: 'left' },
    fields: { ...FIELD_DEFAULTS, activity: true, note: true },
  },
  {
    id: 'dark', name: 'Dark', description: 'Panel gelap transparan yang tegas.',
    panel: { background: '#020617', foreground: '#f8fafc', accent: '#a78bfa', opacity: 0.76, radius: 12, blur: 16 },
    layout: { direction: 'row', variant: 'dark', mapPosition: 'right', mapRatio: 0.34, textAlign: 'left' },
    fields: { ...FIELD_DEFAULTS },
  },
  {
    id: 'transparent', name: 'Transparent', description: 'Tampilan teks ringan tanpa panel besar.',
    panel: { background: '#020617', foreground: '#ffffff', accent: '#22d3ee', opacity: 0.28, radius: 10, blur: 2 },
    layout: { direction: 'row', variant: 'transparent', mapPosition: 'left', mapRatio: 0.27, textAlign: 'left' },
    fields: { ...FIELD_DEFAULTS, longitude: false, accuracy: false, altitude: false },
  },
];

export function getTemplate(id, customTemplates = []) {
  return [...BUILT_IN_TEMPLATES, ...customTemplates].find((template) => template.id === id)
    ?? BUILT_IN_TEMPLATES.find((template) => template.id === 'classic')
    ?? BUILT_IN_TEMPLATES[0];
}

export function cloneTemplate(template) {
  const copy = structuredClone(template);
  copy.fields = { ...FIELD_DEFAULTS, ...copy.fields };
  copy.layout = { variant: 'classic', ...copy.layout };
  return copy;
}
