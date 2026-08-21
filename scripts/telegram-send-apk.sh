#!/usr/bin/env bash
set -euo pipefail

APK_PATH="${1:-}"
CAPTION="${2:-GPS Map Camera APK build}"

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" || -z "${TELEGRAM_CHAT_ID:-}" ]]; then
  echo "Telegram secrets are not configured; skipping APK delivery."
  exit 0
fi

if [[ -z "$APK_PATH" || ! -f "$APK_PATH" ]]; then
  echo "APK file not found: $APK_PATH" >&2
  exit 1
fi

API_URL="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument"

curl --fail-with-body --silent --show-error \
  --retry 3 \
  --retry-delay 2 \
  --request POST "$API_URL" \
  --form-string "chat_id=${TELEGRAM_CHAT_ID}" \
  --form-string "caption=${CAPTION}" \
  --form "document=@${APK_PATH};type=application/vnd.android.package-archive"

echo
echo "APK sent to Telegram successfully."
