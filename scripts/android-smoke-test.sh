#!/usr/bin/env bash
set -euo pipefail

APK_PATH="${1:-android/app/build/outputs/apk/debug/app-debug.apk}"
PACKAGE_NAME="id.irvan.gpsmapcamera.debug"
ACTIVITY_NAME="id.irvan.gpsmapcamera.MainActivity"
REPORT_DIR="android/app/build/reports/startup-smoke"

mkdir -p "${REPORT_DIR}"

collect_diagnostics() {
  adb logcat -d > "${REPORT_DIR}/logcat.txt" 2>/dev/null || true
  adb shell dumpsys activity activities > "${REPORT_DIR}/activities.txt" 2>/dev/null || true
  adb shell dumpsys webviewupdate > "${REPORT_DIR}/webview.txt" 2>/dev/null || true
  adb exec-out screencap -p > "${REPORT_DIR}/screen.png" 2>/dev/null || true
}
trap collect_diagnostics EXIT

test -f "${APK_PATH}" || { echo "APK tidak ditemukan: ${APK_PATH}"; exit 1; }

adb wait-for-device
adb install -r "${APK_PATH}"
adb shell am force-stop "${PACKAGE_NAME}"
adb logcat -c

START_OUTPUT="$(adb shell am start -W -n "${PACKAGE_NAME}/${ACTIVITY_NAME}")"
printf '%s\n' "${START_OUTPUT}" | tee "${REPORT_DIR}/start-output.txt"
printf '%s\n' "${START_OUTPUT}" | grep -Fq "Status: ok" || {
  echo "Android tidak berhasil membuka MainActivity."
  exit 1
}

READY=false
for _attempt in $(seq 1 15); do
  if ! adb shell pidof "${PACKAGE_NAME}" >/dev/null 2>&1; then
    echo "Proses aplikasi berhenti saat startup."
    exit 1
  fi
  if adb logcat -d -s MapCam:I '*:S' | grep -Fq "WEB_APP_READY"; then
    READY=true
    break
  fi
  sleep 2
done

if [[ "${READY}" != "true" ]]; then
  echo "Halaman utama tidak mengirim sinyal siap dalam 30 detik."
  exit 1
fi

CRASH_LOG="$(adb logcat -d -b crash)"
if printf '%s\n' "${CRASH_LOG}" | grep -Fq "${PACKAGE_NAME}"; then
  printf '%s\n' "${CRASH_LOG}"
  echo "Crash Android terdeteksi setelah startup."
  exit 1
fi

echo "Startup smoke test berhasil: ${PACKAGE_NAME} tetap aktif dan halaman utama siap."
