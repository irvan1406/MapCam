const VERSION_TABLE = [
  { version: 1, dataCodewords: 19, eccCodewords: 7, alignments: [] },
  { version: 2, dataCodewords: 34, eccCodewords: 10, alignments: [6, 18] },
  { version: 3, dataCodewords: 55, eccCodewords: 15, alignments: [6, 22] },
  { version: 4, dataCodewords: 80, eccCodewords: 20, alignments: [6, 26] },
  { version: 5, dataCodewords: 108, eccCodewords: 26, alignments: [6, 30] },
];

const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);
let value = 1;
for (let index = 0; index < 255; index += 1) {
  EXP_TABLE[index] = value;
  LOG_TABLE[value] = index;
  value <<= 1;
  if (value & 0x100) value ^= 0x11d;
}
for (let index = 255; index < EXP_TABLE.length; index += 1) EXP_TABLE[index] = EXP_TABLE[index - 255];

export function createLocationQrValue(location) {
  if (!Number.isFinite(location?.latitude) || !Number.isFinite(location?.longitude)) return '';
  return `https://maps.google.com/?q=${Number(location.latitude).toFixed(6)},${Number(location.longitude).toFixed(6)}`;
}

export function createQrMatrix(text) {
  const bytes = new TextEncoder().encode(String(text));
  const versionInfo = VERSION_TABLE.find((item) => 4 + 8 + bytes.length * 8 <= item.dataCodewords * 8);
  if (!versionInfo) throw new Error('Data QR terlalu panjang. Maksimum 106 byte.');
  const dataCodewords = encodeData(bytes, versionInfo.dataCodewords);
  const ecc = calculateEcc(dataCodewords, versionInfo.eccCodewords);
  const codewords = new Uint8Array([...dataCodewords, ...ecc]);
  let bestMatrix = null;
  let bestPenalty = Infinity;

  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = createMatrix(versionInfo, codewords, mask);
    const penalty = calculatePenalty(candidate);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMatrix = candidate;
    }
  }
  return bestMatrix;
}

export function renderQrSvg(text, options = {}) {
  const matrix = createQrMatrix(text);
  const quietZone = options.quietZone ?? 4;
  const size = matrix.length + quietZone * 2;
  const commands = [];
  for (let y = 0; y < matrix.length; y += 1) {
    for (let x = 0; x < matrix.length; x += 1) {
      if (matrix[y][x]) commands.push(`M${x + quietZone} ${y + quietZone}h1v1h-1z`);
    }
  }
  return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QR lokasi"><rect width="${size}" height="${size}" fill="#fff"/><path d="${commands.join('')}" fill="#000"/></svg>`;
}

export function drawQrCode(context, bounds, text) {
  const matrix = createQrMatrix(text);
  const quietZone = 4;
  const modules = matrix.length + quietZone * 2;
  const moduleSize = Math.min(bounds.width, bounds.height) / modules;
  const qrSize = modules * moduleSize;
  const originX = bounds.x + (bounds.width - qrSize) / 2;
  const originY = bounds.y + (bounds.height - qrSize) / 2;
  context.save();
  context.fillStyle = '#ffffff';
  context.fillRect(originX, originY, qrSize, qrSize);
  context.fillStyle = '#000000';
  for (let y = 0; y < matrix.length; y += 1) {
    for (let x = 0; x < matrix.length; x += 1) {
      if (!matrix[y][x]) continue;
      context.fillRect(
        originX + (x + quietZone) * moduleSize,
        originY + (y + quietZone) * moduleSize,
        moduleSize + 0.08,
        moduleSize + 0.08,
      );
    }
  }
  context.restore();
}

function encodeData(bytes, dataCodewordCount) {
  const capacity = dataCodewordCount * 8;
  const bits = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  for (const byte of bytes) appendBits(bits, byte, 8);
  appendBits(bits, 0, Math.min(4, capacity - bits.length));
  while (bits.length % 8) bits.push(0);
  const output = [];
  for (let index = 0; index < bits.length; index += 8) {
    let byte = 0;
    for (let offset = 0; offset < 8; offset += 1) byte = (byte << 1) | bits[index + offset];
    output.push(byte);
  }
  let pad = 0;
  while (output.length < dataCodewordCount) {
    output.push(pad % 2 ? 0x11 : 0xec);
    pad += 1;
  }
  return Uint8Array.from(output);
}

function appendBits(target, number, length) {
  for (let bit = length - 1; bit >= 0; bit -= 1) target.push((number >>> bit) & 1);
}

function calculateEcc(data, degree) {
  let generator = Uint8Array.from([1]);
  for (let index = 0; index < degree; index += 1) {
    const next = new Uint8Array(generator.length + 1);
    for (let coefficient = 0; coefficient < generator.length; coefficient += 1) {
      next[coefficient] ^= generator[coefficient];
      next[coefficient + 1] ^= multiply(generator[coefficient], EXP_TABLE[index]);
    }
    generator = next;
  }
  const remainder = new Uint8Array(degree);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[degree - 1] = 0;
    for (let index = 0; index < degree; index += 1) remainder[index] ^= multiply(generator[index + 1], factor);
  }
  return remainder;
}

function multiply(left, right) {
  return left && right ? EXP_TABLE[LOG_TABLE[left] + LOG_TABLE[right]] : 0;
}

function createMatrix(versionInfo, codewords, mask) {
  const size = versionInfo.version * 4 + 17;
  const matrix = Array.from({ length: size }, () => Array(size).fill(false));
  const functions = Array.from({ length: size }, () => Array(size).fill(false));
  const setFunction = (x, y, dark) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    matrix[y][x] = Boolean(dark);
    functions[y][x] = true;
  };
  drawFinder(setFunction, 3, 3);
  drawFinder(setFunction, size - 4, 3);
  drawFinder(setFunction, 3, size - 4);
  for (const centerY of versionInfo.alignments) {
    for (const centerX of versionInfo.alignments) {
      if (functions[centerY][centerX]) continue;
      drawAlignment(setFunction, centerX, centerY);
    }
  }
  for (let index = 8; index < size - 8; index += 1) {
    setFunction(index, 6, index % 2 === 0);
    setFunction(6, index, index % 2 === 0);
  }
  reserveFormat(setFunction, size);
  placeCodewords(matrix, functions, codewords, mask);
  drawFormat(setFunction, size, mask);
  return matrix;
}

function drawFinder(setFunction, centerX, centerY) {
  for (let offsetY = -4; offsetY <= 4; offsetY += 1) {
    for (let offsetX = -4; offsetX <= 4; offsetX += 1) {
      const distance = Math.max(Math.abs(offsetX), Math.abs(offsetY));
      setFunction(centerX + offsetX, centerY + offsetY, distance !== 2 && distance !== 4);
    }
  }
}

function drawAlignment(setFunction, centerX, centerY) {
  for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
    for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
      setFunction(centerX + offsetX, centerY + offsetY, Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== 1);
    }
  }
}

function reserveFormat(setFunction, size) {
  for (let index = 0; index <= 8; index += 1) {
    if (index !== 6) {
      setFunction(8, index, false);
      setFunction(index, 8, false);
    }
  }
  for (let index = 0; index < 8; index += 1) setFunction(size - 1 - index, 8, false);
  for (let index = 0; index < 7; index += 1) setFunction(8, size - 1 - index, false);
  setFunction(8, size - 8, true);
}

function placeCodewords(matrix, functions, codewords, mask) {
  const size = matrix.length;
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let vertical = 0; vertical < size; vertical += 1) {
      const y = upward ? size - 1 - vertical : vertical;
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        if (functions[y][x]) continue;
        const byteIndex = bitIndex >>> 3;
        const bit = byteIndex < codewords.length ? (codewords[byteIndex] >>> (7 - (bitIndex & 7))) & 1 : 0;
        matrix[y][x] = Boolean(bit ^ Number(maskApplies(mask, x, y)));
        bitIndex += 1;
      }
    }
  }
}

function maskApplies(mask, x, y) {
  if (mask === 0) return (x + y) % 2 === 0;
  if (mask === 1) return y % 2 === 0;
  if (mask === 2) return x % 3 === 0;
  if (mask === 3) return (x + y) % 3 === 0;
  if (mask === 4) return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
  if (mask === 5) return (x * y) % 2 + (x * y) % 3 === 0;
  if (mask === 6) return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
  return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
}

function drawFormat(setFunction, size, mask) {
  const errorCorrectionLevelL = 1;
  const data = (errorCorrectionLevelL << 3) | mask;
  let remainder = data;
  for (let index = 0; index < 10; index += 1) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  const bits = ((data << 10) | remainder) ^ 0x5412;
  const bit = (index) => ((bits >>> index) & 1) !== 0;
  for (let index = 0; index <= 5; index += 1) setFunction(8, index, bit(index));
  setFunction(8, 7, bit(6));
  setFunction(8, 8, bit(7));
  setFunction(7, 8, bit(8));
  for (let index = 9; index < 15; index += 1) setFunction(14 - index, 8, bit(index));
  for (let index = 0; index < 8; index += 1) setFunction(size - 1 - index, 8, bit(index));
  for (let index = 8; index < 15; index += 1) setFunction(8, size - 15 + index, bit(index));
  setFunction(8, size - 8, true);
}

function calculatePenalty(matrix) {
  const size = matrix.length;
  let score = 0;
  const lines = [...matrix, ...Array.from({ length: size }, (_, x) => matrix.map((row) => row[x]))];
  for (const line of lines) {
    let runColor = line[0];
    let runLength = 1;
    for (let index = 1; index < line.length; index += 1) {
      if (line[index] === runColor) runLength += 1;
      else {
        if (runLength >= 5) score += 3 + runLength - 5;
        runColor = line[index];
        runLength = 1;
      }
    }
    if (runLength >= 5) score += 3 + runLength - 5;
    for (let index = 0; index <= line.length - 7; index += 1) {
      const pattern = line.slice(index, index + 7).map(Number).join('');
      if (pattern !== '1011101') continue;
      const before = index >= 4 && line.slice(index - 4, index).every((cell) => !cell);
      const after = index + 11 <= line.length && line.slice(index + 7, index + 11).every((cell) => !cell);
      if (before || after) score += 40;
    }
  }
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const color = matrix[y][x];
      if (matrix[y][x + 1] === color && matrix[y + 1][x] === color && matrix[y + 1][x + 1] === color) score += 3;
    }
  }
  const dark = matrix.flat().filter(Boolean).length;
  score += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  return score;
}
