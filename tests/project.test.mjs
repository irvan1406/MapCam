import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, setDisplayField, resetDisplayData, duplicateProject, migrateProject } from '../src/models/project.js';
import { DEFAULT_SETTINGS } from '../src/models/settings.js';

const metadata = { latitude: -8.28, longitude: 113.99, address: 'Kalibaru, Banyuwangi', addressLines: ['Kalibaru', 'Banyuwangi'], dateTime: '2026-08-20T05:50:32', source: 'device-gps' };

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
  assert.equal(migrated.schemaVersion, 2);
  assert.ok(Array.isArray(migrated.texts));
  assert.equal(migrated.originalData.latitude, -8.28);
});
