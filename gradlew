#!/usr/bin/env sh
set -eu
GRADLE_VERSION="9.5.0"
GRADLE_BASE="${GRADLE_USER_HOME:-${HOME}/.gradle}/gps-map-camera-wrapper"
GRADLE_DIR="${GRADLE_BASE}/gradle-${GRADLE_VERSION}"
ARCHIVE="${GRADLE_BASE}/gradle-${GRADLE_VERSION}-bin.zip"
if [ ! -x "${GRADLE_DIR}/bin/gradle" ]; then
  mkdir -p "${GRADLE_BASE}"
  if [ ! -f "${ARCHIVE}" ]; then
    URL="https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip"
    if command -v curl >/dev/null 2>&1; then curl -fL "${URL}" -o "${ARCHIVE}"
    elif command -v wget >/dev/null 2>&1; then wget -O "${ARCHIVE}" "${URL}"
    else echo "curl atau wget diperlukan untuk mengunduh Gradle." >&2; exit 1; fi
  fi
  unzip -q -o "${ARCHIVE}" -d "${GRADLE_BASE}"
fi
exec "${GRADLE_DIR}/bin/gradle" "$@"
