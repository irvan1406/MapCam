# Release guide

1. Update `app.versionName` and `app.versionCode` in `app.config.json`.
2. Update `package.json` version to the same `MAJOR.MINOR.PATCH` value.
3. Add the release notes to `CHANGELOG.md`.
4. Run `npm run check` and build/test the debug APK.
5. Commit with a descriptive Conventional Commit message.
6. Create and push a matching tag, for example `v1.1.0`.
7. GitHub Actions validates the tag, signs the build, creates APK/AAB, writes SHA-256 hashes, and creates a GitHub Release.

Required GitHub Actions secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Never commit the keystore or these values. Keep an offline backup of the keystore; losing it prevents compatible app updates.
