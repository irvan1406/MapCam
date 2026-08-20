# Architecture

## Data flow

1. Camera or gallery returns a source `Blob`.
2. `exif-service` reads metadata locally; camera mode also requests a fresh device location.
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

## Project compatibility

`schemaVersion` is separate from app version. Open-time migration runs in `migrateProject`. Future migrations must be additive, preserve `originalData`, and include tests with legacy fixtures.

## Extension points

- Add stamp templates in `src/models/templates.js`.
- Add tile providers in `app.config.json`; UI reads enabled providers dynamically.
- Add project-level fields in `src/models/project.js` and renderer support in `src/editor/renderer.js`.
- Add native capabilities only through `AndroidBridge`; retain a browser fallback.
