# Architecture

## Data flow

1. Live camera or gallery returns a source `Blob`.
2. Camera mode watches device location and time before capture; the exact capture snapshot becomes Original Data. `exif-service` reads gallery metadata locally.
3. `createProject` copies detected metadata into both `originalData` and `displayData`.
4. Editor actions mutate only `displayData` and mark `editedFields`.
5. IndexedDB persists source media, project schema, template, layout, settings, thumbnail, and optional last export.
6. Preview uses a downscaled canvas; final export reopens the source and renders at the selected output resolution.
7. The Android bridge writes the resulting JPEG as a new MediaStore item.

## Module boundaries

- `src/models`: versioned project, settings, and templates.
- `src/storage`: IndexedDB only; no UI behavior.
- `src/services`: device, EXIF, image, map, location, and export operations.
- `src/editor`: deterministic renderer and undo/redo history.
- `src/screens`: mobile screens and event binding.
- `src/components`: shared UI primitives and icons.
- `android`: thin native host for WebView assets and Android-only capabilities.

## Remote web updates

Android always navigates to the synthetic HTTPS origin `https://app.local`. This keeps IndexedDB stable across shell updates. `LocalAssetWebViewClient` resolves each app-local asset from GitHub Pages first and falls back to the matching bundled asset when the remote build cannot be reached. Main-frame navigation is restricted to the synthetic origin, while external links open in the system browser.

The Android app does not register the PWA service worker. A bootstrap step removes service workers left by older versions so cache-first behavior cannot pin an outdated UI. Browser/PWA installs keep a network-first, build-ID-versioned service worker.

`.github/workflows/web.yml` deploys `dist/` on web changes. `.github/workflows/android.yml` uses native path filters, so ordinary UI/editor updates do not rebuild the APK.

## Project compatibility

`schemaVersion` is separate from app version. Schema v3 stores complete location/sensor display fields and per-field visibility. Open-time migration runs in `migrateProject`. Future migrations must be additive, preserve `originalData`, and include tests with legacy fixtures.

## Extension points

- Add stamp templates in `src/models/templates.js`.
- Add tile providers in `app.config.json`; UI reads enabled providers dynamically.
- Add project-level fields in `src/models/project.js` and renderer support in `src/editor/renderer.js`.
- Add native capabilities only through `AndroidBridge`; retain a browser fallback.
