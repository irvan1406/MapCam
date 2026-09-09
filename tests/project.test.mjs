import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, setDisplayField, resetDisplayData, duplicateProject, migrateProject } from '../src/models/project.js';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/models/settings.js';

const metadata = { latitude: -8.28, longitude: 113.99, address: 'Kalibaru, Banyuwangi', addressLines: ['Kalibaru', 'Banyuwangi'], dateTime: '2026-08-20T05:50:32', source: 'device-gps' };

test('legacy default export name migrates to MapCam without replacing custom patterns', () => {
  assert.equal(normalizeSettings({ fileNamePattern: 'GPSMapCamera-{date}-{time}' }).fileNamePattern, 'MapCam-{date}-{time}');
  assert.equal(normalizeSettings({ fileNamePattern: 'Survey-{date}' }).fileNamePattern, 'Survey-{date}');
});

test('display data starts as a copy and never overwrites original data', () => {
  const project = createProject({ sourceType: 'camera', file: new Blob(['photo'], { type: 'image/jpeg' }), metadata, settings: DEFAULT_SETTINGS });
  setDisplayField(project, 'latitude', -7.1);
  assert.equal(project.originalData.latitude, -8.28);
  assert.equal(project.displayData.latitude, -7.1);
  assert.equal(project.editedFields.latitude, true);
  resetDisplayData(project);
  assert.equal(project.displayData.latitude, -8.28);
  assert.deepEqual(project.editedFields, {});
});

test('duplicating a project preserves source but creates a new identity', () => {
  const project = createProject({ sourceType: 'gallery', file: new Blob(['photo']), metadata, settings: DEFAULT_SETTINGS });
  const copy = duplicateProject(project);
  assert.notEqual(copy.id, project.id);
  assert.equal(copy.originalData.latitude, project.originalData.latitude);
  assert.equal(copy.status, 'draft');
});

test('schema v1 migrates without losing metadata', () => {
  const migrated = migrateProject({ schemaVersion: 1, id: 'legacy', originalData: metadata, displayData: metadata, template: { fields: {} } });
  assert.equal(migrated.schemaVersion, 4);
  assert.ok(Array.isArray(migrated.texts));
  assert.equal(migrated.originalData.latitude, -8.28);
  assert.equal(migrated.template.fields.place, true);
  assert.equal(migrated.template.fields.accuracy, true);
  assert.equal(migrated.template.fields.qr, false);
});

test('schema v2 projects migrate with complete display metadata and field controls', () => {
  const migrated = migrateProject({ schemaVersion: 2, id: 'v2', originalData: metadata, displayData: metadata, template: { fields: { map: true, address: true } } });
  assert.equal(migrated.schemaVersion, 4);
  assert.equal(migrated.displayData.placeName, '');
  assert.equal(migrated.template.fields.altitude, true);
  assert.equal(migrated.template.fields.speed, false);
});

test('schema v3 keeps its exact free stamp position during migration', () => {
  const migrated = migrateProject({
    schemaVersion: 3,
    id: 'v3',
    originalData: metadata,
    displayData: metadata,
    template: { fields: { map: true }, layout: {} },
    overlay: { x: 0.2, y: 0.3, width: 0.6 },
  });
  assert.equal(migrated.schemaVersion, 4);
  assert.equal(migrated.overlay.anchor, 'free');
  assert.equal(migrated.overlay.x, 0.2);
  assert.equal(migrated.overlay.y, 0.3);
});
