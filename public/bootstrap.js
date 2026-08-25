const BUILD_ID = '__BUILD_ID__';
globalThis.__MAPCAM_BUILD_ID__ = BUILD_ID;

async function start() {
  const isAndroidShell = Boolean(globalThis.AndroidBridge);
  if (isAndroidShell && 'serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
    await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));
    if ('caches' in globalThis) {
      const keys = await caches.keys().catch(() => []);
      await Promise.all(keys.filter((key) => key.startsWith('gps-map-camera-')).map((key) => caches.delete(key)));
    }
    if (navigator.serviceWorker.controller && sessionStorage.getItem('mapcam-sw-clean') !== BUILD_ID) {
      sessionStorage.setItem('mapcam-sw-clean', BUILD_ID);
      location.reload();
      return;
    }
  }
  await import(`./src/main.js?v=${BUILD_ID}`);
}

start().catch((error) => {
  console.error('[bootstrap] Application failed to start', error);
  document.querySelector('#app').innerHTML = '<main class="fatal-error"><h1>Aplikasi tidak dapat dibuka</h1><p>File aplikasi gagal dimuat. Periksa internet atau buka ulang aplikasi.</p><button id="bootstrap-reload">Coba Lagi</button></main>';
  document.querySelector('#bootstrap-reload')?.addEventListener('click', () => location.reload());
});
