import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeControlConfig } from '../src/models/control-config.js';
import { verifyAdminPin } from '../src/services/admin-auth-service.js';

test('control config validates branding, capture, notice, and admin values', () => {
  const config = normalizeControlConfig({
    revision: -2,
    branding: { appName: '  MapCam Pro  ', accentColor: 'not-a-color' },
    camera: { captureQuality: 'unknown', keepCameraOpen: false },
    announcement: { enabled: true, frequency: 'limited', displayLimit: 999, message: 'Halo' },
    admin: { background: 'ocean' },
  });
  assert.equal(config.revision, 1);
  assert.equal(config.branding.appName, 'MapCam Pro');
  assert.equal(config.branding.accentColor, '#0ea5e9');
  assert.equal(config.camera.captureQuality, 'fast');
  assert.equal(config.camera.keepCameraOpen, false);
  assert.equal(config.announcement.displayLimit, 50);
  assert.equal(config.admin.background, 'ocean');
});

test('hidden owner code verifies without storing the literal code in source', async () => {
  assert.equal(await verifyAdminPin(['31', '12', '25'].join('')), true);
  assert.equal(await verifyAdminPin('000000'), false);
  const source = await readFile(new URL('../src/services/admin-auth-service.js', import.meta.url), 'utf8');
  assert.equal(source.includes(['31', '12', '25'].join('')), false);
});
