import test from 'node:test';
import assert from 'node:assert/strict';
import { latitudeToWorldY, longitudeToWorldX, worldXToLongitude, worldYToLatitude, formatCoordinate, isValidCoordinate } from '../src/utils/geo.js';

test('Web Mercator projection round-trips coordinates', () => {
  const latitude = -8.28731;
  const longitude = 113.9912;
  const zoom = 16;
  assert.ok(Math.abs(worldXToLongitude(longitudeToWorldX(longitude, zoom), zoom) - longitude) < 1e-9);
  assert.ok(Math.abs(worldYToLatitude(latitudeToWorldY(latitude, zoom), zoom) - latitude) < 1e-9);
});

test('coordinate validation rejects invalid or missing values', () => {
  assert.equal(isValidCoordinate(-8, 113), true);
  assert.equal(isValidCoordinate(-91, 113), false);
  assert.equal(isValidCoordinate(null, null), false);
});

test('coordinate formatting supports decimal and DMS', () => {
  assert.equal(formatCoordinate(-8.25), '-8.250000');
  assert.match(formatCoordinate(-8.25, 'dms'), /^-8° 15′/);
  assert.match(formatCoordinate(113.5, 'dms'), /113° 30′/);
});
