import { createId } from '../utils/id.js';
import { toLocalIso } from '../utils/date.js';
import { getTemplate, cloneTemplate } from './templates.js';

export const PROJECT_SCHEMA_VERSION = 2;

const emptyMetadata = () => ({
  latitude: null,
  longitude: null,
  address: '',
  addressLines: [],
  dateTime: null,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  compass: null,
  altitude: null,
  speed: null,
  accuracy: null,
  source: 'unknown',
});

export function createProject({ sourceType, file, metadata = {}, settings, customTemplates = [] }) {
  const now = toLocalIso();
  const original = { ...emptyMetadata(), ...metadata };
  const template = cloneTemplate(getTemplate(settings.defaultTemplateId, customTemplates));
  template.fields.address = settings.showAddress;
  template.fields.latitude = settings.showCoordinates;
  template.fields.longitude = settings.showCoordinates;
  template.fields.timezone = settings.showTimeZone;

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: createId('project'),
    name: `Project ${new Date().toLocaleDateString('id-ID')}`,
    status: 'draft',
    sourceType,
    sourceFileName: file?.name ?? `photo-${Date.now()}.jpg`,
    sourceMimeType: file?.type || 'image/jpeg',
    sourceBlob: file ?? null,
    sourceWidth: null,
    sourceHeight: null,
    sourceOrientation: metadata.orientation ?? 1,
    originalData: original,
    displayData: structuredClone(original),
    editedFields: {},
    templateId: template.id,
    template,
    map: {
      providerId: settings.mapProviderId,
      zoom: settings.mapZoom,
      centerMode: 'display-location',
      available: true,
    },
    dateFormat: settings.dateFormat,
    timeFormat: settings.timeFormat,
    coordinateFormat: settings.coordinateFormat,
    fileNamePattern: settings.fileNamePattern,
    overlay: {
      x: 0.04,
      y: 0.69,
      width: 0.92,
      scale: 1,
      opacity: 1,
      textScale: 1,
      mapScale: 1,
      alignment: 'left',
      rotation: 0,
    },
    texts: [],
    activityName: '',
    note: '',
    logoDataUrl: null,
    lastExportBlob: null,
    lastExportName: null,
    createdAt: now,
    modifiedAt: now,
    appVersion: '1.0.0',
  };
}

export function setDisplayField(project, field, value) {
  project.displayData[field] = value;
  const originalValue = project.originalData[field];
  project.editedFields[field] = JSON.stringify(value) !== JSON.stringify(originalValue);
  project.modifiedAt = toLocalIso();
  return project;
}

export function resetDisplayData(project) {
  project.displayData = structuredClone(project.originalData);
  project.editedFields = {};
  project.modifiedAt = toLocalIso();
  return project;
}

export function isProjectEdited(project) {
  return Object.values(project.editedFields ?? {}).some(Boolean);
}

export function duplicateProject(project) {
  const copy = structuredClone(project);
  copy.id = createId('project');
  copy.name = `${project.name} — Salinan`;
  copy.status = 'draft';
  copy.createdAt = toLocalIso();
  copy.modifiedAt = copy.createdAt;
  copy.lastExportBlob = null;
  copy.lastExportName = null;
  return copy;
}

export function migrateProject(project) {
  if (!project || typeof project !== 'object') throw new Error('Project tidak valid.');
  const schemaVersion = project.schemaVersion ?? 1;
  if (schemaVersion === PROJECT_SCHEMA_VERSION) return project;
  if (schemaVersion === 1) {
    project.schemaVersion = 2;
    project.editedFields ??= {};
    project.texts ??= [];
    project.map ??= { providerId: 'openstreetmap', zoom: 16, centerMode: 'display-location', available: true };
    project.overlay ??= { x: 0.04, y: 0.69, width: 0.92, scale: 1, opacity: 1, textScale: 1, mapScale: 1, alignment: 'left', rotation: 0 };
    project.dateFormat ??= 'long-id';
    project.timeFormat ??= '24-seconds';
    project.coordinateFormat ??= 'decimal';
    return project;
  }
  throw new Error(`Schema project v${schemaVersion} belum didukung.`);
}
