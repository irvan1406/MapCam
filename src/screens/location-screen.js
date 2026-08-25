import { pageHeader } from '../components/layout.js';
import { icon } from '../components/icons.js';
import { setGlobalBusy, showToast } from '../components/ui.js';
import { renderDomMap } from '../services/map-service.js';
import { reverseGeocode, searchPlaces } from '../services/location-service.js';
import { clamp, isValidCoordinate, offsetCoordinates } from '../utils/geo.js';
import { escapeHtml, truncate } from '../utils/text.js';

export function renderLocationScreen(app, root, route) {
  const project = app.getProjectFromState(route.query.get('id'));
  if (!project) return app.router.navigate('/projects');
  const hasLocation = isValidCoordinate(project.displayData.latitude, project.displayData.longitude);
  const view = {
    latitude: hasLocation ? Number(project.displayData.latitude) : -2.5489,
    longitude: hasLocation ? Number(project.displayData.longitude) : 118.0149,
    zoom: project.map.zoom ?? 16,
    selected: hasLocation,
    address: project.displayData.address || '',
    addressLines: project.displayData.addressLines || [],
    placeName: project.displayData.placeName || '',
    countryCode: project.displayData.countryCode || '',
  };

  root.innerHTML = `<main class="location-page">
    ${pageHeader({ title: 'Edit Lokasi', subtitle: 'Geser map atau cari tempat', back: true })}
    <form id="place-search-form" class="location-search"><label>${icon('search', 20)}<input id="place-search-input" type="search" placeholder="Cari tempat atau alamat" autocomplete="off"><button type="submit">Cari</button></label><div id="search-results" class="search-results"></div></form>
    <section class="location-map-wrap">
      <div id="location-map" class="location-map"></div>
      <div class="center-pin ${hasLocation ? 'selected' : ''}">${icon('mapPin', 38)}</div>
      <div class="map-controls"><button id="zoom-in" aria-label="Perbesar">${icon('plus')}</button><button id="zoom-out" aria-label="Perkecil">${icon('zoomOut')}</button></div>
      <button id="use-current-location" class="map-locate-button">${icon('locate', 20)} Lokasi Saya</button>
      ${!hasLocation ? '<div class="map-view-notice">Tampilan awal map — belum menjadi lokasi foto</div>' : ''}
    </section>
    <section class="location-form-card">
      <div class="coordinate-fields"><label><span>Latitude</span><input id="latitude-input" type="number" inputmode="decimal" step="any" value="${hasLocation ? project.displayData.latitude : ''}" placeholder="-8.xxxxxx"></label><label><span>Longitude</span><input id="longitude-input" type="number" inputmode="decimal" step="any" value="${hasLocation ? project.displayData.longitude : ''}" placeholder="113.xxxxxx"></label></div>
      <label class="address-field"><span>Alamat tampilan</span><textarea id="address-input" rows="3" placeholder="Alamat akan dimuat setelah titik dipilih">${escapeHtml(project.displayData.address || '')}</textarea><small>Boleh diubah manual sesudah koordinat dipilih.</small></label>
    </section>
    <footer class="location-footer"><button class="button button-ghost" data-action="back">Batal</button><button id="save-location" class="button button-primary">${icon('check', 19)} Gunakan Titik Ini</button></footer>
  </main>`;

  const map = root.querySelector('#location-map');
  const latInput = root.querySelector('#latitude-input');
  const lonInput = root.querySelector('#longitude-input');
  const addressInput = root.querySelector('#address-input');
  const centerPin = root.querySelector('.center-pin');
  const notice = root.querySelector('.map-view-notice');
  let mapFrame = null;
  const renderMap = () => {
    if (mapFrame) return;
    mapFrame = requestAnimationFrame(() => {
      mapFrame = null;
      renderDomMap(map, view, { zoom: view.zoom, providerId: project.map.providerId });
    });
  };
  requestAnimationFrame(renderMap);

  let pointer = null;
  map.addEventListener('pointerdown', (event) => {
    map.setPointerCapture(event.pointerId);
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, latitude: view.latitude, longitude: view.longitude };
    map.classList.add('is-dragging');
  });
  map.addEventListener('pointermove', (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const coordinates = offsetCoordinates(pointer.latitude, pointer.longitude, event.clientX - pointer.x, event.clientY - pointer.y, view.zoom);
    view.latitude = coordinates.latitude;
    view.longitude = coordinates.longitude;
    renderMap();
  });
  const endPointer = (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const distance = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
    pointer = null;
    map.classList.remove('is-dragging');
    view.selected = true;
    centerPin.classList.add('selected');
    notice?.remove();
    syncInputs();
    if (distance < 8) {
      const rect = map.getBoundingClientRect();
      const tapX = event.clientX - (rect.left + rect.width / 2);
      const tapY = event.clientY - (rect.top + rect.height / 2);
      const coordinates = offsetCoordinates(view.latitude, view.longitude, -tapX, -tapY, view.zoom);
      view.latitude = coordinates.latitude;
      view.longitude = coordinates.longitude;
      syncInputs();
      renderMap();
    }
    resolveAddress(false);
  };
  map.addEventListener('pointerup', endPointer);
  map.addEventListener('pointercancel', endPointer);

  root.querySelector('#zoom-in').addEventListener('click', () => { view.zoom = clamp(view.zoom + 1, 2, 19); renderMap(); });
  root.querySelector('#zoom-out').addEventListener('click', () => { view.zoom = clamp(view.zoom - 1, 2, 19); renderMap(); });

  const syncInputs = () => {
    latInput.value = view.latitude.toFixed(6);
    lonInput.value = view.longitude.toFixed(6);
  };
  const applyManualCoordinates = () => {
    const latitude = Number(latInput.value);
    const longitude = Number(lonInput.value);
    if (!isValidCoordinate(latitude, longitude)) return;
    view.latitude = latitude;
    view.longitude = longitude;
    view.selected = true;
    centerPin.classList.add('selected');
    notice?.remove();
    renderMap();
    resolveAddress(false);
  };
  latInput.addEventListener('change', applyManualCoordinates);
  lonInput.addEventListener('change', applyManualCoordinates);

  const resolveAddress = async (showBusy = true) => {
    if (!view.selected || !navigator.onLine) return;
    if (showBusy) setGlobalBusy(true, 'Mencari alamat…');
    try {
      const result = await reverseGeocode(view.latitude, view.longitude);
      if (result) {
        view.address = result.address;
        view.addressLines = result.addressLines;
        view.placeName = result.placeName || '';
        addressInput.value = result.address;
      }
    } catch (error) {
      showToast(error.message, { type: 'error' });
    } finally { if (showBusy) setGlobalBusy(false); }
  };

  root.querySelector('#use-current-location').addEventListener('click', async () => {
    setGlobalBusy(true, 'Mencari lokasi GPS…');
    try {
      const location = await app.acquireLocationWithAddress();
      Object.assign(view, location, { selected: true });
      centerPin.classList.add('selected');
      notice?.remove();
      syncInputs();
      addressInput.value = location.address || '';
      renderMap();
      showToast(location.accuracy ? `Akurasi GPS ±${Math.round(location.accuracy)} m` : 'Lokasi GPS ditemukan.');
    } catch (error) { showToast(error.message, { type: 'error', duration: 5000 }); }
    finally { setGlobalBusy(false); }
  });

  root.querySelector('#place-search-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = root.querySelector('#place-search-input').value;
    const resultsContainer = root.querySelector('#search-results');
    resultsContainer.innerHTML = '<div class="search-loading"><span class="spinner small"></span> Mencari…</div>';
    try {
      const results = await searchPlaces(query);
      resultsContainer.innerHTML = results.length ? results.map((item, index) => `<button type="button" data-search-result="${index}"><span>${icon('mapPin', 18)}</span><span><strong>${escapeHtml(item.addressLines?.[0] || 'Lokasi')}</strong><small>${escapeHtml(truncate(item.address, 90))}</small></span></button>`).join('') : '<p class="search-empty">Lokasi tidak ditemukan.</p>';
      resultsContainer.querySelectorAll('[data-search-result]').forEach((button) => button.addEventListener('click', () => {
        const result = results[Number(button.dataset.searchResult)];
        Object.assign(view, result, { selected: true });
        syncInputs(); addressInput.value = result.address; centerPin.classList.add('selected'); notice?.remove(); renderMap(); resultsContainer.innerHTML = '';
      }));
    } catch (error) {
      resultsContainer.innerHTML = `<p class="search-empty error">${escapeHtml(error.message)}</p>`;
    }
  });

  root.querySelector('#save-location').addEventListener('click', async () => {
    const latitude = Number(latInput.value);
    const longitude = Number(lonInput.value);
    if (!isValidCoordinate(latitude, longitude)) return showToast('Pilih titik atau masukkan koordinat yang valid.', { type: 'error' });
    view.latitude = latitude;
    view.longitude = longitude;
    if (!addressInput.value.trim() && navigator.onLine) await resolveAddress();
    await app.commitLocation(project.id, {
      latitude: view.latitude,
      longitude: view.longitude,
      address: addressInput.value.trim(),
      addressLines: splitAddress(addressInput.value),
      placeName: view.placeName || splitAddress(addressInput.value)[1] || splitAddress(addressInput.value)[0] || '',
      countryCode: view.countryCode || '',
      accuracy: view.accuracy ?? null,
      source: view.source ?? 'manual-map',
      zoom: view.zoom,
    });
    app.router.navigate(`/editor?id=${project.id}`);
  });
}

function splitAddress(value) {
  const parts = value.split(',').map((item) => item.trim()).filter(Boolean);
  return [parts.slice(0, 2).join(', '), parts.slice(2, 5).join(', ')].filter(Boolean);
}
