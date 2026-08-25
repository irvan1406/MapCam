import { icon } from '../components/icons.js';
import { openSheet, setGlobalBusy, showToast } from '../components/ui.js';
import { cloneTemplate } from '../models/templates.js';
import { openLiveCamera, attachCameraPreview, captureCameraPhoto, setCameraTorch, cameraBlobToFile } from '../services/camera-service.js';
import { reverseGeocode, watchCurrentLocation } from '../services/location-service.js';
import { renderDomMap } from '../services/map-service.js';
import { formatDate, formatTime, toLocalIso } from '../utils/date.js';
import { formatCoordinate, isValidCoordinate } from '../utils/geo.js';
import { escapeHtml } from '../utils/text.js';
import { createLocationQrValue, renderQrSvg } from '../utils/qr-code.js';

const CAMERA_FIELDS = {
  map: 'Mini Map', qr: 'QR Lokasi', place: 'Nama lokasi', address: 'Alamat lengkap', latitude: 'Latitude', longitude: 'Longitude',
  accuracy: 'Akurasi GPS', altitude: 'Ketinggian', speed: 'Kecepatan', date: 'Tanggal', time: 'Jam',
  timezone: 'Zona waktu', compass: 'Arah kompas', activity: 'Kegiatan', note: 'Catatan', logo: 'Logo',
};

export async function renderCameraScreen(app, root) {
  const state = app.store.getState();
  let template = cloneTemplate(app.getAllTemplates().find((item) => item.id === state.settings.defaultTemplateId) ?? app.getAllTemplates()[0]);
  let session = null;
  let facingMode = 'environment';
  let torchEnabled = false;
  let destroyed = false;
  let locationSequence = 0;
  let lastGeocodeKey = '';
  let lastQrValue = null;
  let lastQrMarkup = '';
  const liveData = {
    latitude: null, longitude: null, accuracy: null, altitude: null, speed: null, compass: null,
    address: '', addressLines: [], placeName: '', countryCode: '', dateTime: toLocalIso(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, source: 'camera-live',
  };

  root.innerHTML = `<main class="camera-page">
    <video id="camera-video" class="camera-video" autoplay muted playsinline aria-label="Preview kamera"></video>
    <div class="camera-shade camera-shade-top"></div><div class="camera-shade camera-shade-bottom"></div>
    <header class="camera-topbar">
      <button class="camera-icon-button" id="camera-back" aria-label="Kembali">${icon('arrowLeft', 26)}</button>
      <div class="camera-top-actions">
        <button class="camera-icon-button" id="camera-flash" aria-label="Flash" disabled>${icon('flash', 23)}</button>
        <button class="camera-icon-button" id="camera-fields" aria-label="Atur informasi">${icon('sliders', 23)}</button>
        <button class="camera-icon-button" id="camera-flip" aria-label="Ganti kamera">${icon('flipCamera', 24)}</button>
      </div>
    </header>
    <div class="camera-gps-status searching" id="camera-gps-status"><span class="camera-status-dot"></span><span>Mencari lokasi GPS…</span></div>
    <section class="live-gps-stamp" id="live-gps-stamp" aria-label="GPS stamp realtime">
      <div class="live-compass" id="live-camera-compass" hidden></div>
      <div class="live-map" id="live-camera-map"></div>
      <div class="live-stamp-copy" id="live-stamp-copy"></div>
      <div class="live-qr" id="live-camera-qr" hidden></div>
    </section>
    <section class="camera-error" id="camera-error" hidden>
      ${icon('info', 28)}<strong>Kamera live tidak tersedia</strong><p></p>
      <button class="camera-fallback-button" id="camera-fallback">Buka Kamera Sistem</button>
    </section>
    <footer class="camera-controls">
      <div class="camera-mode-label"><span></span><strong>FOTO GPS</strong><span></span></div>
      <div class="camera-control-row">
        <button class="camera-side-action" id="camera-gallery"><span>${icon('image', 24)}</span><small>Galeri</small></button>
        <button class="camera-shutter" id="camera-shutter" aria-label="Ambil foto"><span></span></button>
        <button class="camera-side-action" id="camera-template"><span>${icon('layers', 24)}</span><small>Template</small></button>
      </div>
    </footer>
  </main>`;

  const video = root.querySelector('#camera-video');
  const stamp = root.querySelector('#live-gps-stamp');
  const map = root.querySelector('#live-camera-map');
  const copy = root.querySelector('#live-stamp-copy');
  const qr = root.querySelector('#live-camera-qr');
  const compass = root.querySelector('#live-camera-compass');
  const gpsStatus = root.querySelector('#camera-gps-status');
  const shutter = root.querySelector('#camera-shutter');
  const flashButton = root.querySelector('#camera-flash');
  const errorPanel = root.querySelector('#camera-error');

  const updateStamp = ({ refreshMap = false } = {}) => {
    if (destroyed) return;
    const fields = template.fields;
    const variant = template.layout.variant ?? 'classic';
    const coordinateParts = [];
    if (fields.latitude && Number.isFinite(liveData.latitude)) coordinateParts.push(`Lat ${formatCoordinate(liveData.latitude, 'decimal')}`);
    if (fields.longitude && Number.isFinite(liveData.longitude)) coordinateParts.push(`Long ${formatCoordinate(liveData.longitude, 'decimal')}`);
    const sensorParts = [];
    if (fields.accuracy && Number.isFinite(liveData.accuracy)) sensorParts.push(`Akurasi ±${Math.round(liveData.accuracy)} m`);
    if (fields.altitude && Number.isFinite(liveData.altitude)) sensorParts.push(`Alt ${Math.round(liveData.altitude)} m`);
    if (fields.speed && Number.isFinite(liveData.speed)) sensorParts.push(`${(liveData.speed * 3.6).toFixed(1)} km/j`);
    if (fields.compass && Number.isFinite(liveData.compass) && variant !== 'compass') sensorParts.push(`Arah ${Math.round(liveData.compass)}° ${bearingLabel(liveData.compass)}`);
    const dateTimeParts = [];
    if (fields.date) dateTimeParts.push(formatDate(liveData.dateTime, state.settings.dateFormat));
    if (fields.time) dateTimeParts.push(formatTime(liveData.dateTime, state.settings.timeFormat, fields.timezone, liveData.timeZone));
    const place = liveData.placeName || liveData.addressLines?.[1] || liveData.addressLines?.[0] || 'Menunggu nama lokasi…';
    const flag = countryFlag(liveData.countryCode);
    const standardCopy = [
      variant === 'report' && fields.activity ? `<span class="live-report-badge">${escapeHtml(template.layout.badgeText || 'Check In')}</span>` : '',
      fields.place ? `<strong class="live-place">${escapeHtml(`${place}${flag ? ` ${flag}` : ''}`)}</strong>` : '',
      fields.address && liveData.address ? `<span class="live-address">${escapeHtml(liveData.address)}</span>` : '',
      coordinateParts.length ? `<span class="live-coordinates">${escapeHtml(coordinateParts.join('  •  '))}</span>` : '',
      sensorParts.length ? `<span class="live-sensors">${escapeHtml(sensorParts.join('  •  '))}</span>` : '',
      dateTimeParts.length && variant !== 'datetime' ? `<span class="live-datetime">${escapeHtml(dateTimeParts.join('  •  '))}</span>` : '',
    ].filter(Boolean).join('');
    if (variant === 'datetime') {
      const date = new Date(liveData.dateTime);
      const weekday = new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(date);
      const time = fields.time ? formatTime(liveData.dateTime, state.settings.timeFormat, false) : '';
      const dateLabel = fields.date ? formatDate(liveData.dateTime, state.settings.dateFormat) : '';
      copy.innerHTML = `<div class="live-time-lead"><strong>${escapeHtml(time)}</strong><span><b>${escapeHtml(dateLabel)}</b><small>${escapeHtml(weekday)}</small></span></div>${standardCopy}`;
    } else copy.innerHTML = standardCopy;
    stamp.style.setProperty('--stamp-bg', template.panel.background);
    stamp.style.setProperty('--stamp-fg', template.panel.foreground);
    stamp.style.setProperty('--stamp-accent', template.panel.accent);
    stamp.style.setProperty('--stamp-opacity', template.panel.opacity);
    stamp.className = `live-gps-stamp live-variant-${variant}${fields.map ? '' : ' without-map'}${fields.qr ? ' with-qr' : ''}`;
    map.hidden = !fields.map;
    qr.hidden = !fields.qr;
    if (fields.qr) {
      const value = createLocationQrValue(liveData);
      if (value !== lastQrValue) {
        lastQrValue = value;
        lastQrMarkup = value ? renderQrSvg(value) : '<span>QR<br>menunggu GPS</span>';
      }
      if (qr.innerHTML !== lastQrMarkup) qr.innerHTML = lastQrMarkup;
    } else {
      qr.innerHTML = '';
      lastQrValue = null;
      lastQrMarkup = '';
    }
    compass.hidden = variant !== 'compass' || !fields.compass;
    if (variant === 'compass' && fields.compass) {
      const heading = Number.isFinite(liveData.compass) ? liveData.compass : 0;
      compass.style.setProperty('--heading', `${heading}deg`);
      compass.innerHTML = `<div class="live-compass-dial"><i></i><b>N</b><span class="east">E</span><span class="south">S</span><span class="west">W</span><em>${Number.isFinite(liveData.compass) ? `${Math.round(liveData.compass)}°` : '—'}</em></div><small>${Number.isFinite(liveData.compass) ? `Menghadap ${bearingLabel(liveData.compass)}` : 'Kompas tidak tersedia'}</small>`;
    } else compass.innerHTML = '';
    if (fields.map && refreshMap) requestAnimationFrame(() => {
      if (!destroyed && !map.hidden) renderDomMap(map, liveData, { zoom: state.settings.mapZoom, providerId: state.settings.mapProviderId });
    });
  };

  const setGpsStatus = (message, mode = 'searching') => {
    gpsStatus.className = `camera-gps-status ${mode}`;
    gpsStatus.querySelector('span:last-child').textContent = message;
  };

  const enrichAddress = async (latitude, longitude) => {
    if (!navigator.onLine) return;
    const key = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
    if (key === lastGeocodeKey) return;
    lastGeocodeKey = key;
    const sequence = ++locationSequence;
    const address = await reverseGeocode(latitude, longitude).catch((error) => {
      console.warn('[camera] Alamat realtime gagal dimuat', error);
      return null;
    });
    if (!address || destroyed || sequence !== locationSequence) return;
    Object.assign(liveData, address);
    updateStamp();
  };

  const acceptLocation = (location) => {
    Object.assign(liveData, location);
    liveData.source = location.source || 'device-gps';
    setGpsStatus(Number.isFinite(location.accuracy) ? `GPS aktif • akurasi ±${Math.round(location.accuracy)} m` : 'GPS aktif', 'ready');
    updateStamp({ refreshMap: true });
    enrichAddress(location.latitude, location.longitude);
  };

  const stopWatchingLocation = watchCurrentLocation(acceptLocation, (error) => {
    setGpsStatus(error.message, 'warning');
  });

  const orientationHandler = (event) => {
    const heading = Number.isFinite(event.webkitCompassHeading) ? event.webkitCompassHeading
      : Number.isFinite(event.alpha) ? (360 - event.alpha + 360) % 360 : null;
    if (Number.isFinite(heading)) { liveData.compass = heading; updateStamp(); }
  };
  window.addEventListener('deviceorientationabsolute', orientationHandler);
  window.addEventListener('deviceorientation', orientationHandler);

  const clockTimer = setInterval(() => {
    liveData.dateTime = toLocalIso();
    updateStamp();
  }, 1000);

  const startPreview = async () => {
    errorPanel.hidden = true;
    session?.stop();
    session = null;
    try {
      const openedSession = await openLiveCamera({ facingMode });
      if (destroyed) { openedSession.stop(); return; }
      session = openedSession;
      video.classList.toggle('is-mirrored', facingMode === 'user');
      await attachCameraPreview(video, session);
      flashButton.disabled = !session.capabilities.torch;
      shutter.disabled = false;
    } catch (error) {
      console.error('[camera] Preview gagal', error);
      errorPanel.hidden = false;
      errorPanel.querySelector('p').textContent = error.message;
      shutter.disabled = true;
    }
  };

  const cleanup = () => {
    if (destroyed) return;
    destroyed = true;
    clearInterval(clockTimer);
    stopWatchingLocation?.();
    window.removeEventListener('deviceorientationabsolute', orientationHandler);
    window.removeEventListener('deviceorientation', orientationHandler);
    session?.stop();
    app.setNativeCameraMode(false);
  };
  app.setRouteCleanup(cleanup);
  app.setNativeCameraMode(true);

  root.querySelector('#camera-back').addEventListener('click', () => app.router.back());
  root.querySelector('#camera-flip').addEventListener('click', async () => {
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    torchEnabled = false;
    flashButton.classList.remove('is-active');
    await startPreview();
  });
  flashButton.addEventListener('click', async () => {
    try {
      torchEnabled = !torchEnabled;
      await setCameraTorch(session, torchEnabled);
      flashButton.classList.toggle('is-active', torchEnabled);
    } catch (error) { torchEnabled = false; showToast(`Flash gagal: ${error.message}`, { type: 'error' }); }
  });
  root.querySelector('#camera-fields').addEventListener('click', () => openFieldsSheet(template, () => updateStamp({ refreshMap: true })));
  root.querySelector('#camera-template').addEventListener('click', () => openTemplateSheet(app.getAllTemplates(), template.id, (selected) => {
    template = cloneTemplate(selected);
    updateStamp({ refreshMap: true });
  }));
  root.querySelector('#camera-gallery').addEventListener('click', async () => {
    cleanup();
    app.router.navigate('/home');
    await app.startGallery();
  });
  root.querySelector('#camera-fallback').addEventListener('click', async () => {
    cleanup();
    app.router.navigate('/home');
    await app.startSystemCamera();
  });
  shutter.addEventListener('click', async () => {
    if (!session || shutter.disabled) return;
    shutter.disabled = true;
    shutter.classList.add('is-capturing');
    const capturedAt = new Date();
    liveData.dateTime = toLocalIso(capturedAt);
    try {
      setGlobalBusy(true, 'Mengambil foto resolusi tinggi…');
      const blob = await captureCameraPhoto(video, session);
      if (isValidCoordinate(liveData.latitude, liveData.longitude) && navigator.onLine) {
        const address = await reverseGeocode(liveData.latitude, liveData.longitude).catch(() => null);
        if (address) Object.assign(liveData, address);
      }
      const file = cameraBlobToFile(blob, capturedAt);
      app.persistCameraOriginal(file);
      const metadata = { ...structuredClone(liveData), dateTime: toLocalIso(capturedAt), orientation: 1, source: liveData.source || 'camera-live' };
      const project = await app.createAndSaveProject('camera', file, metadata);
      project.templateId = template.id;
      project.template = cloneTemplate(template);
      await app.saveProjectNow(project);
      cleanup();
      app.router.navigate(`/editor?id=${project.id}`);
    } catch (error) {
      console.error('[camera] Foto gagal', error);
      showToast(`Foto gagal: ${error.message}`, { type: 'error', duration: 6000 });
      shutter.disabled = false;
    } finally {
      shutter.classList.remove('is-capturing');
      setGlobalBusy(false);
    }
  });

  updateStamp({ refreshMap: true });
  await startPreview();
}

function openFieldsSheet(template, onChange) {
  openSheet({
    title: 'Informasi di Kamera',
    content: `<form id="live-fields-form" class="sheet-form"><p class="sheet-note">Semua nilai tetap tersimpan di project. Pilih informasi yang terlihat pada stamp.</p><div class="live-field-grid">${Object.entries(CAMERA_FIELDS).map(([field, label]) => `<label class="live-field-option"><input type="checkbox" name="${field}" ${template.fields[field] ? 'checked' : ''}><span>${escapeHtml(label)}</span></label>`).join('')}</div><div class="sheet-actions"><button type="button" class="button button-ghost sheet-cancel">Batal</button><button type="submit" class="button button-primary">${icon('check', 18)} Terapkan</button></div></form>`,
    onMount: (sheet, close) => {
      sheet.querySelector('.sheet-cancel').addEventListener('click', close);
      sheet.querySelector('#live-fields-form').addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        for (const field of Object.keys(CAMERA_FIELDS)) template.fields[field] = data.has(field);
        onChange(); close();
      });
    },
  });
}

function openTemplateSheet(templates, selectedId, onSelect) {
  openSheet({
    title: 'Template Kamera',
    content: `<div class="camera-template-list">${templates.map((template) => `<button data-live-template="${template.id}" class="camera-template-choice ${template.id === selectedId ? 'is-selected' : ''}"><span style="--choice-bg:${template.panel.background};--choice-accent:${template.panel.accent}"></span><div><strong>${escapeHtml(template.name)}</strong><small>${escapeHtml(template.description)}</small></div>${template.id === selectedId ? icon('check', 18) : ''}</button>`).join('')}</div>`,
    onMount: (sheet, close) => {
      sheet.querySelectorAll('[data-live-template]').forEach((button) => button.addEventListener('click', () => {
        const selected = templates.find((template) => template.id === button.dataset.liveTemplate);
        if (selected) onSelect(selected);
        close();
      }));
    },
  });
}

function bearingLabel(value) {
  const labels = ['Utara', 'Timur Laut', 'Timur', 'Tenggara', 'Selatan', 'Barat Daya', 'Barat', 'Barat Laut'];
  return labels[Math.round((((Number(value) % 360) + 360) % 360) / 45) % 8];
}

function countryFlag(countryCode) {
  const code = String(countryCode || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt(0)));
}
