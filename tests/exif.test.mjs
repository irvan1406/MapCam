import test from 'node:test';
import assert from 'node:assert/strict';
import { readExif } from '../src/services/exif-service.js';

test('JPEG EXIF reader extracts DateTimeOriginal, orientation, and per-photo GPS', async () => {
  const jpeg = buildExifJpeg();
  const file = new Blob([jpeg], { type: 'image/jpeg' });
  const result = await readExif(file);
  assert.equal(result.hasExif, true);
  assert.equal(result.dateTime, '2026-08-20T05:50:32');
  assert.equal(result.orientation, 1);
  assert.ok(Math.abs(result.latitude - (-8.25)) < 1e-9);
  assert.ok(Math.abs(result.longitude - 113.5) < 1e-9);
  assert.equal(result.gpsSource, 'exif-gps');
});

test('missing EXIF does not invent GPS or capture date', async () => {
  const file = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
  const result = await readExif(file);
  assert.equal(result.latitude, null);
  assert.equal(result.longitude, null);
  assert.equal(result.dateTime, null);
});

function buildExifJpeg() {
  const tiff = new ArrayBuffer(190);
  const view = new DataView(tiff);
  const little = true;
  view.setUint8(0, 0x49); view.setUint8(1, 0x49);
  view.setUint16(2, 42, little); view.setUint32(4, 8, little);

  view.setUint16(8, 3, little);
  writeEntry(view, 10, 0x0112, 3, 1, 1, little, true);
  writeEntry(view, 22, 0x8769, 4, 1, 50, little);
  writeEntry(view, 34, 0x8825, 4, 1, 88, little);
  view.setUint32(46, 0, little);

  view.setUint16(50, 1, little);
  writeEntry(view, 52, 0x9003, 2, 20, 68, little);
  view.setUint32(64, 0, little);
  writeAscii(view, 68, '2026:08:20 05:50:32\0');

  view.setUint16(88, 4, little);
  writeAsciiEntry(view, 90, 0x0001, 'S\0', little);
  writeEntry(view, 102, 0x0002, 5, 3, 142, little);
  writeAsciiEntry(view, 114, 0x0003, 'E\0', little);
  writeEntry(view, 126, 0x0004, 5, 3, 166, little);
  view.setUint32(138, 0, little);
  writeRationals(view, 142, [[8, 1], [15, 1], [0, 1]], little);
  writeRationals(view, 166, [[113, 1], [30, 1], [0, 1]], little);

  const payloadLength = 6 + tiff.byteLength;
  const output = new Uint8Array(2 + 2 + 2 + payloadLength + 2);
  let cursor = 0;
  output.set([0xff, 0xd8, 0xff, 0xe1], cursor); cursor += 4;
  new DataView(output.buffer).setUint16(cursor, payloadLength + 2, false); cursor += 2;
  output.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], cursor); cursor += 6;
  output.set(new Uint8Array(tiff), cursor); cursor += tiff.byteLength;
  output.set([0xff, 0xd9], cursor);
  return output;
}

function writeEntry(view, offset, tag, type, count, value, little, shortInline = false) {
  view.setUint16(offset, tag, little); view.setUint16(offset + 2, type, little); view.setUint32(offset + 4, count, little);
  if (shortInline) view.setUint16(offset + 8, value, little);
  else view.setUint32(offset + 8, value, little);
}

function writeAsciiEntry(view, offset, tag, value, little) {
  view.setUint16(offset, tag, little); view.setUint16(offset + 2, 2, little); view.setUint32(offset + 4, value.length, little);
  writeAscii(view, offset + 8, value);
}

function writeAscii(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

function writeRationals(view, offset, values, little) {
  values.forEach(([numerator, denominator], index) => {
    view.setUint32(offset + index * 8, numerator, little);
    view.setUint32(offset + index * 8 + 4, denominator, little);
  });
}
