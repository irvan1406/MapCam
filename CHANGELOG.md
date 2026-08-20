# Changelog

Semua perubahan penting mengikuti [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-08-20

### Added

- Kamera Android dan import satu atau banyak foto dari galeri.
- Pembacaan EXIF `DateTimeOriginal`, GPS, altitude, dan orientation secara lokal.
- GPS aktual dengan akurasi serta penanganan permission, timeout, dan GPS tidak aktif.
- Mini map OpenStreetMap, marker, zoom, pencarian lokasi, reverse geocoding, serta input koordinat manual.
- Pemisahan permanen Original Data dan Display Data beserta status field yang diedit.
- Editor GPS stamp dengan drag, resize, opacity, ukuran map/teks, alignment, field visibility, dan warna.
- Editor tanggal/jam sampai detik dan pilihan format Indonesia/Inggris serta 12/24 jam.
- Template Classic GPS, Minimal, Field Work, Dark, Transparent, dan preset custom.
- Teks bebas, nama kegiatan, catatan, serta logo custom.
- Undo/redo, Original/Result comparison, autosave, continue draft, duplikat project, dan schema migration.
- Export JPEG Maximum/High/Medium tanpa menimpa sumber, share Android, dan penyimpanan ke galeri.
- Batch EXIF per foto dan batch export berurutan.
- Light/dark mode, PWA offline shell, Android WebView bridge, APK/AAB build, dan GitHub Actions release.

### Security & Privacy

- Foto, EXIF, GPS, project, dan settings disimpan lokal; tidak ada upload otomatis.
- Keystore, password, API key, dan credential dikecualikan dari Git.
