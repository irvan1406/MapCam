import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateStampBounds } from '../src/editor/renderer.js';
import { createProject } from '../src/models/project.js';
import { DEFAULT_SETTINGS } from '../src/models/settings.js';

const metadata = {
  latitude: -8.288877,
  longitude: 113.982172,
  placeName: 'Kecamatan Kalibaru, Jawa Timur, Indonesia',
  address: 'Jl. Nasional III, Dusun Krajan, Kalibaru, Banyuwangi, Jawa Timur 68467, Indonesia',
  addressLines: ['Jl. Nasional III', 'Kalibaru, Banyuwangi, Jawa Timur'],
  accuracy: 7.5,
  altitude: 124,
  compass: 92,
  dateTime: '2026-08-20T08:57:32',
};

test('classic GPS stamp stays compact on portrait and landscape photos', () => {
  const project = createProject({ sourceType: 'camera', file: new Blob(['photo']), metadata, settings: DEFAULT_SETTINGS });
  const portrait = calculateStampBounds(project, 1080, 1920);
  const landscape = calculateStampBounds(project, 1920, 1080);
  assert.ok(portrait.height <= 1920 * 0.34);
  assert.ok(landscape.height <= 1080 * 0.28);
  assert.ok(portrait.height < portrait.width * 0.4);
  assert.ok(landscape.height < landscape.width * 0.4);
});

test('reference templates stay landscape-shaped inside portrait photos', () => {
  for (const templateId of ['advanced', 'date-time', 'location-qr', 'report', 'compass-navigation']) {
    const project = createProject({
      sourceType: 'camera',
      file: new Blob(['photo']),
      metadata,
      settings: { ...DEFAULT_SETTINGS, defaultTemplateId: templateId },
    });
    const bounds = calculateStampBounds(project, 1080, 1920);
    assert.ok(bounds.width > bounds.height * 2.5, `${templateId} harus tetap horizontal`);
    assert.ok(bounds.height <= 1920 * 0.34, `${templateId} terlalu tinggi`);
  }
});

test('new projects stay precisely anchored in portrait and landscape output', () => {
  const project = createProject({ sourceType: 'camera', file: new Blob(['photo']), metadata, settings: DEFAULT_SETTINGS });
  const portrait = calculateStampBounds(project, 1080, 1920);
  const landscape = calculateStampBounds(project, 1920, 1080);
  assert.ok(Math.abs(portrait.x - 1080 * 0.032) < 1);
  assert.ok(Math.abs(1920 - portrait.y - portrait.height - 1080 * 0.032) < 1);
  assert.ok(Math.abs(landscape.x - 1080 * 0.032) < 1);
  assert.ok(Math.abs(1080 - landscape.y - landscape.height - 1080 * 0.032) < 1);
  assert.ok(landscape.height <= 1080 * 0.28);
});
