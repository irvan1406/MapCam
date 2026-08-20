import { toLocalIso } from '../utils/date.js';

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

function parseExifDate(value) {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

export async function readExif(file) {
  const fallback = {
    dateTime: null,
    fileLastModified: file?.lastModified ? toLocalIso(new Date(file.lastModified)) : null,
    latitude: null,
    longitude: null,
    altitude: null,
    orientation: 1,
    hasExif: false,
    dateSource: null,
    gpsSource: null,
  };

  if (!file || !/jpe?g/i.test(file.type || file.name || '')) return fallback;

  try {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return fallback;

    let offset = 2;
    while (offset + 4 < view.byteLength) {
      const marker = view.getUint16(offset);
      if ((marker & 0xff00) !== 0xff00) break;
      const length = view.getUint16(offset + 2);
      if (marker === 0xffe1 && length >= 8 && ascii(view, offset + 4, 4) === 'Exif') {
        return { ...fallback, ...parseTiff(view, offset + 10), hasExif: true };
      }
      if (length < 2) break;
      offset += 2 + length;
    }
  } catch (error) {
    console.warn('[exif] Metadata tidak dapat dibaca', error);
  }
  return fallback;
}

function parseTiff(view, tiffStart) {
  const byteOrder = view.getUint16(tiffStart);
  const littleEndian = byteOrder === 0x4949;
  if (!littleEndian && byteOrder !== 0x4d4d) throw new Error('Byte order EXIF tidak dikenali.');
  if (view.getUint16(tiffStart + 2, littleEndian) !== 42) throw new Error('Header TIFF tidak valid.');

  const readU16 = (offset) => view.getUint16(offset, littleEndian);
  const readU32 = (offset) => view.getUint32(offset, littleEndian);
  const ifd0 = tiffStart + readU32(tiffStart + 4);
  const root = readIfd(view, tiffStart, ifd0, littleEndian);
  const exifIfd = root.get(0x8769)?.value;
  const gpsIfd = root.get(0x8825)?.value;
  const exif = Number.isFinite(exifIfd)
    ? readIfd(view, tiffStart, tiffStart + exifIfd, littleEndian)
    : new Map();
  const gps = Number.isFinite(gpsIfd)
    ? readIfd(view, tiffStart, tiffStart + gpsIfd, littleEndian)
    : new Map();

  const dateOriginal = exif.get(0x9003)?.value || exif.get(0x9004)?.value || root.get(0x0132)?.value;
  const latitude = gpsCoordinate(gps.get(0x0002)?.value, gps.get(0x0001)?.value, ['S']);
  const longitude = gpsCoordinate(gps.get(0x0004)?.value, gps.get(0x0003)?.value, ['W']);
  const altitudeValue = gps.get(0x0006)?.value;
  const altitudeRef = gps.get(0x0005)?.value;
  const altitude = Number.isFinite(altitudeValue) ? altitudeValue * (altitudeRef === 1 ? -1 : 1) : null;

  return {
    dateTime: parseExifDate(dateOriginal),
    latitude,
    longitude,
    altitude,
    orientation: root.get(0x0112)?.value ?? 1,
    dateSource: dateOriginal ? 'exif-DateTimeOriginal' : null,
    gpsSource: Number.isFinite(latitude) && Number.isFinite(longitude) ? 'exif-gps' : null,
  };
}

function readIfd(view, tiffStart, ifdOffset, littleEndian) {
  const result = new Map();
  if (ifdOffset < 0 || ifdOffset + 2 > view.byteLength) return result;
  const count = view.getUint16(ifdOffset, littleEndian);
  for (let index = 0; index < count; index += 1) {
    const entry = ifdOffset + 2 + index * 12;
    if (entry + 12 > view.byteLength) break;
    const tag = view.getUint16(entry, littleEndian);
    const type = view.getUint16(entry + 2, littleEndian);
    const valueCount = view.getUint32(entry + 4, littleEndian);
    const byteLength = (TYPE_SIZE[type] ?? 1) * valueCount;
    const valueOffset = byteLength <= 4 ? entry + 8 : tiffStart + view.getUint32(entry + 8, littleEndian);
    try {
      result.set(tag, { type, count: valueCount, value: readValue(view, valueOffset, type, valueCount, littleEndian) });
    } catch {
      // Corrupt or out-of-range EXIF tags are ignored individually.
    }
  }
  return result;
}

function readValue(view, offset, type, count, littleEndian) {
  if (offset < 0 || offset >= view.byteLength) return null;
  if (type === 2) return ascii(view, offset, count).replace(/\0+$/, '');
  const values = [];
  for (let index = 0; index < count; index += 1) {
    if (type === 1 || type === 7) values.push(view.getUint8(offset + index));
    else if (type === 3) values.push(view.getUint16(offset + index * 2, littleEndian));
    else if (type === 4) values.push(view.getUint32(offset + index * 4, littleEndian));
    else if (type === 9) values.push(view.getInt32(offset + index * 4, littleEndian));
    else if (type === 5 || type === 10) {
      const base = offset + index * 8;
      const numerator = type === 5 ? view.getUint32(base, littleEndian) : view.getInt32(base, littleEndian);
      const denominator = type === 5 ? view.getUint32(base + 4, littleEndian) : view.getInt32(base + 4, littleEndian);
      values.push(denominator ? numerator / denominator : 0);
    }
  }
  return count === 1 ? values[0] : values;
}

function gpsCoordinate(values, reference, negativeReferences) {
  if (!Array.isArray(values) || values.length < 3) return null;
  const coordinate = values[0] + values[1] / 60 + values[2] / 3600;
  return negativeReferences.includes(String(reference).toUpperCase()) ? -coordinate : coordinate;
}

function ascii(view, offset, length) {
  let output = '';
  for (let index = 0; index < length && offset + index < view.byteLength; index += 1) {
    output += String.fromCharCode(view.getUint8(offset + index));
  }
  return output;
}
