export async function loadImageSource(blob) {
  if (!blob) throw new Error('File foto tidak tersedia.');
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    return { image, width: image.naturalWidth, height: image.naturalHeight, url };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw new Error(`Foto tidak dapat dibuka: ${error.message}`);
  }
}

export async function loadPreviewImageSource(blob, originalWidth, originalHeight, maxDimension = 1600) {
  if (!blob) throw new Error('File foto tidak tersedia.');
  const hasDimensions = Number.isFinite(originalWidth) && Number.isFinite(originalHeight) && originalWidth > 0 && originalHeight > 0;
  if ('createImageBitmap' in globalThis && hasDimensions) {
    const scale = Math.min(1, maxDimension / Math.max(originalWidth, originalHeight));
    try {
      const bitmap = await createImageBitmap(blob, {
        resizeWidth: Math.max(1, Math.round(originalWidth * scale)),
        resizeHeight: Math.max(1, Math.round(originalHeight * scale)),
        resizeQuality: 'high',
        imageOrientation: 'from-image',
      });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, url: null, release: () => bitmap.close() };
    } catch (error) {
      console.warn('[image] Optimized preview decode tidak tersedia, memakai fallback', error);
    }
  }
  const source = await loadImageSource(blob);
  return { ...source, release: () => URL.revokeObjectURL(source.url) };
}

export async function createThumbnail(blob, maxSize = 480) {
  const source = await loadImageSource(blob);
  try {
    return await createThumbnailFromSource(source, maxSize);
  } finally {
    URL.revokeObjectURL(source.url);
  }
}

export async function createThumbnailFromSource(source, maxSize = 480) {
  const scale = Math.min(1, maxSize / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext('2d', { alpha: false });
  context.drawImage(source.image, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas, 'image/jpeg', 0.78);
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.9) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Gambar gagal dibuat.')), type, quality);
  });
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error('File gagal dibaca.'));
    reader.readAsDataURL(file);
  });
}

export function calculateExportSize(width, height, maxMegapixels) {
  const pixels = width * height;
  const maximumPixels = maxMegapixels * 1_000_000;
  if (pixels <= maximumPixels) return { width, height, scale: 1 };
  const scale = Math.sqrt(maximumPixels / pixels);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}
