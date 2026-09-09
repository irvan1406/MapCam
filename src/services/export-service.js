import { getConfig } from '../config/runtime-config.js';
import { renderProject } from '../editor/renderer.js';
import { calculateExportSize, canvasToBlob, loadImageSource } from './image-service.js';
import { fileSafe } from '../utils/text.js';
import { formatDate, formatTime } from '../utils/date.js';

export async function createExport(project, qualityName = 'high', onStatus = () => {}) {
  const config = getConfig().export;
  const quality = config.jpegQuality[qualityName] ?? config.jpegQuality.high;
  const maxMegapixels = config.maxMegapixels[qualityName] ?? config.maxMegapixels.high;
  onStatus('Membuka foto resolusi asli…');
  const source = await loadImageSource(project.sourceBlob);
  try {
    const size = calculateExportSize(source.width, source.height, maxMegapixels);
    const canvas = document.createElement('canvas');
    onStatus('Merender map dan GPS stamp…');
    await renderProject(project, canvas, { source, targetSize: size, preview: false });
    onStatus('Mengompresi hasil…');
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    const fileName = buildFileName(project, qualityName);
    return { blob, fileName, width: size.width, height: size.height, qualityName };
  } catch (error) {
    if (/memory|canvas|allocation/i.test(error.message)) {
      throw new Error('Memori tidak cukup untuk resolusi ini. Coba kualitas High atau Medium.');
    }
    throw error;
  } finally {
    URL.revokeObjectURL(source.url);
  }
}

export async function saveExport(exported) {
  if (globalThis.AndroidBridge?.saveImage) {
    const dataUrl = await blobToDataUrl(exported.blob);
    globalThis.AndroidBridge.saveImage(dataUrl, exported.fileName);
    return { method: 'native', fileName: exported.fileName };
  }
  const url = URL.createObjectURL(exported.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = exported.fileName;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  return { method: 'download', fileName: exported.fileName };
}

export async function shareExport(exported) {
  const file = new File([exported.blob], exported.fileName, { type: exported.blob.type || 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Foto MapCam', text: 'Dibuat dengan MapCam' });
    return { method: 'web-share' };
  }
  if (globalThis.AndroidBridge?.shareImage) {
    globalThis.AndroidBridge.shareImage(await blobToDataUrl(exported.blob), exported.fileName);
    return { method: 'native-share' };
  }
  await saveExport(exported);
  return { method: 'download' };
}

export function buildFileName(project) {
  const config = getConfig().export;
  const dateTime = project.displayData.dateTime ?? new Date().toISOString();
  const date = formatDate(dateTime, 'dd-mm-yyyy');
  const time = formatTime(dateTime, '24-seconds', false).replaceAll(':', '-');
  const location = fileSafe(project.displayData.addressLines?.[0] || 'Photo');
  const base = (project.fileNamePattern || config.fileNamePattern)
    .replace('{date}', date)
    .replace('{time}', time)
    .replace('{location}', location);
  return `${fileSafe(base) || 'MapCam'}.jpg`;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error('Gambar gagal diproses.'));
    reader.readAsDataURL(blob);
  });
}
