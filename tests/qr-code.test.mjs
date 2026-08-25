import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocationQrValue, createQrMatrix, renderQrSvg } from '../src/utils/qr-code.js';

test('location QR encodes an exact Maps coordinate URL locally', () => {
  const value = createLocationQrValue({ latitude: -7.9284962, longitude: 114.4070174 });
  assert.equal(value, 'https://maps.google.com/?q=-7.928496,114.407017');
  const matrix = createQrMatrix(value);
  assert.ok(matrix.length >= 29);
  assert.equal(matrix.length, matrix[0].length);
  assert.equal(matrix[0][0], true);
  assert.equal(matrix[6][6], true);
  assert.equal(matrix[1][1], false);
  assert.equal(matrix[3][3], true);
});

test('QR SVG is self-contained and no location request is needed', () => {
  const svg = renderQrSvg('https://maps.google.com/?q=-8.288877,113.982172');
  assert.match(svg, /^<svg /);
  assert.match(svg, /<path d="M/);
  assert.doesNotMatch(svg, /maps\.google\.com/);
});

test('location QR stays empty until coordinates are valid', () => {
  assert.equal(createLocationQrValue({ latitude: null, longitude: null }), '');
  assert.throws(() => createQrMatrix('x'.repeat(107)), /terlalu panjang/);
});
