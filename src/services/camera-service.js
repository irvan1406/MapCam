import { canvasToBlob } from './image-service.js';

export async function openLiveCamera({ facingMode = 'environment' } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Preview kamera live tidak didukung pada perangkat ini.');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 3840 },
        height: { ideal: 2160 },
      },
    });
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('Perangkat tidak memberikan video kamera.');
    return {
      stream,
      track,
      facingMode,
      settings: track.getSettings?.() ?? {},
      capabilities: track.getCapabilities?.() ?? {},
      stop() { stream.getTracks().forEach((item) => item.stop()); },
    };
  } catch (error) {
    if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') throw new Error('Izin kamera ditolak. Izinkan kamera dari pengaturan aplikasi.');
    if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') throw new Error('Kamera yang sesuai tidak ditemukan pada perangkat ini.');
    if (error?.name === 'NotReadableError') throw new Error('Kamera sedang dipakai aplikasi lain. Tutup aplikasi kamera lain lalu coba lagi.');
    throw new Error(error?.message || 'Kamera tidak dapat dibuka.');
  }
}

export async function attachCameraPreview(video, session) {
  video.srcObject = session.stream;
  await new Promise((resolve, reject) => {
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return resolve();
    const timer = setTimeout(() => reject(new Error('Preview kamera terlalu lama dimuat.')), 12000);
    video.addEventListener('loadedmetadata', () => { clearTimeout(timer); resolve(); }, { once: true });
    video.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Preview kamera gagal dimuat.')); }, { once: true });
  });
  await video.play();
}

export async function captureCameraPhoto(video, session) {
  if (globalThis.ImageCapture) {
    try {
      const capture = new ImageCapture(session.track);
      const blob = await capture.takePhoto();
      if (blob?.size) return blob;
    } catch (error) {
      console.warn('[camera] ImageCapture gagal, memakai frame video', error);
    }
  }
  const width = video.videoWidth || session.settings.width;
  const height = video.videoHeight || session.settings.height;
  if (!width || !height) throw new Error('Resolusi kamera belum tersedia. Tunggu sebentar lalu coba lagi.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Foto kamera tidak dapat dibuat pada perangkat ini.');
  if (session.facingMode === 'user') {
    context.translate(width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(video, 0, 0, width, height);
  return canvasToBlob(canvas, 'image/jpeg', 0.96);
}

export async function setCameraTorch(session, enabled) {
  if (!session?.capabilities?.torch || !session.track?.applyConstraints) return false;
  await session.track.applyConstraints({ advanced: [{ torch: Boolean(enabled) }] });
  return true;
}

export function cameraBlobToFile(blob, capturedAt = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  const name = `Camera-${capturedAt.getFullYear()}${pad(capturedAt.getMonth() + 1)}${pad(capturedAt.getDate())}-${pad(capturedAt.getHours())}${pad(capturedAt.getMinutes())}${pad(capturedAt.getSeconds())}.jpg`;
  return new File([blob], name, { type: blob.type || 'image/jpeg', lastModified: capturedAt.getTime() });
}
