import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHomeScreen } from '../src/screens/home-screen.js';

test('home screen exposes real camera, gallery, project, settings, and permission actions', async () => {
  const root = { innerHTML: '', querySelector: () => null };
  const app = {
    store: {
      getState: () => ({
        projects: [],
        permissions: { camera: 'prompt', location: 'prompt', storage: 'available' },
      }),
    },
  };
  await renderHomeScreen(app, root);
  assert.match(root.innerHTML, /data-action="camera"/);
  assert.match(root.innerHTML, /data-action="gallery"/);
  assert.match(root.innerHTML, /data-route="\/projects"/);
  assert.match(root.innerHTML, /data-route="\/settings"/);
  assert.match(root.innerHTML, /data-action="refresh-permissions"/);
});
