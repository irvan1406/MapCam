import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTileUrl, getTileLayout } from '../src/services/map-service.js';

test('map tile layout uses the selected coordinate and configured provider', () => {
  const layout = getTileLayout(-8.25, 113.5, 16, 420, 260, 'openstreetmap');
  assert.equal(layout.zoom, 16);
  assert.ok(layout.tiles.length >= 4);
  assert.ok(layout.tiles.every((tile) => tile.url.startsWith('https://tile.openstreetmap.org/16/')));
  assert.equal(layout.provider.attribution, '© OpenStreetMap contributors');
});

test('tile URL expansion is deterministic', () => {
  assert.equal(buildTileUrl({ tileUrl: 'https://tiles/{z}/{x}/{y}.png' }, 7, 11, 22), 'https://tiles/7/11/22.png');
});
