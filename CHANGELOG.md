# Changelog

Semua perubahan penting mengikuti [Semantic Versioning](https://semver.org/).

## [1.2.0] - 2026-09-09

### Added

- Nama, header, launcher label, folder galeri, dan identitas visual profesional baru untuk MapCam.
- Control Center tersembunyi dengan verifikasi PIN, pembatasan percobaan, penggantian logo/branding, pengaturan kamera cepat, popup pembuka, frekuensi tampil, dan pilihan background admin.
- Konfigurasi publik network-first agar perubahan branding dan popup dapat diterapkan ke semua web-shell melalui deploy GitHub Pages tanpa rebuild APK.
- Popup pembuka dengan mode sekali per catatan, setiap pembukaan, atau jumlah terbatas.
- Posisi stamp berbasis anchor yang menyesuaikan foto portrait dan landscape secara presisi.

### Improved

- Satu tekan shutter langsung membuat project dan menyimpan hasil bertag ke Galeri Android melalui antrean latar belakang tanpa menutup kamera.
- Daftar awal hanya membaca project terbaru agar waktu buka aplikasi lebih singkat; halaman Project tetap dapat memuat seluruh data.
- Preview memakai update koordinat/jam realtime sementara reverse geocoding dan mini-map dibatasi agar kamera lebih ringan.
- Foto galeri tanpa GPS dapat memakai lokasi perangkat sebagai Display Data tanpa mengubah Original Data.
- Kualitas cepat 12 MP disediakan untuk pekerjaan lapangan dan thumbnail resolusi penuh dibuat secara tertunda.
- Project Schema v4 memigrasikan posisi stamp lama ke mode bebas tanpa menggeser hasil yang sudah ada.

### Security & Privacy

- PIN admin tidak disimpan sebagai teks biasa dan sesi admin terkunci kembali saat sesi aplikasi berakhir.
- Konfigurasi publik tidak menerima secret; perubahan global tetap melalui repository terotorisasi.

## [1.1.0] - 2026-08-26

### Added

- Kamera live fullscreen dengan GPS, jam, alamat, dan mini map realtime sebelum foto diambil.
- Layout kamera responsif khusus portrait dan landscape, kamera depan/belakang, serta torch jika hardware mendukung.
- Field lengkap yang dapat ditampilkan/disembunyikan: nama lokasi, alamat lengkap, koordinat, akurasi, altitude, speed, kompas, tanggal, jam, dan zona waktu.
- Template Lanjutan, Tanggal & Waktu, Pemindaian Lokasi dengan QR, Pelaporan/Check In, dan Kompas Navigasi yang mengikuti orientasi foto.
- QR lokasi dibuat sepenuhnya di perangkat dan membuka koordinat Display Location di Maps saat dipindai.
- Aksi cepat Lokasi Saat Ini atau Pilih di Peta untuk foto galeri yang tidak memiliki GPS EXIF.
- GitHub Pages deployment serta Android remote-web shell dengan fallback offline tanpa memindahkan origin penyimpanan project.

### Improved

- GPS stamp Classic dibuat ringkas dan content-fit sehingga tidak lagi menyisakan panel kosong besar.
- Preview template kamera kini benar-benar berubah sesuai desain yang dipilih sebelum tombol shutter ditekan.
- Project Schema v3 memigrasikan project v1/v2 dan mempertahankan Original Data.
- Perubahan web biasa tidak lagi memicu build APK; workflow Android hanya berjalan untuk perubahan native atau release.

## [1.0.1] - 2026-08-20

### Fixed

- Mencegah aplikasi langsung tertutup ketika Android System WebView gagal dibuat atau renderer berhenti.
- Memperbaiki `NullPointerException` saat konfigurasi system bar dijalankan sebelum Android membuat `DecorView`.
- Menambahkan layar pemulihan native dengan tombol coba lagi, pengaturan WebView, dan detail diagnostik.
- Melindungi pemanggilan JavaScript serta penyimpanan state ketika WebView sudah tidak tersedia.

### Improved

- Menambahkan sinyal kesiapan halaman utama dan smoke test startup pada emulator Android 14 di GitHub Actions.
- Menyimpan log, status activity, informasi WebView, dan screenshot sebagai diagnostic artifact ketika smoke test gagal.

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
