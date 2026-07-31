#!/usr/bin/env bash
set -euo pipefail
ENV_FILE="/etc/finup-web-updater.env"
if [[ "${EUID}" -ne 0 ]]; then
  echo "Jalankan sebagai root: sudo bash $0" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Konfigurasi updater belum ada: $ENV_FILE" >&2
  exit 1
fi
TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
if grep -q '^FINUP_UPDATE_TOKEN=' "$ENV_FILE"; then
  sed -i "s#^FINUP_UPDATE_TOKEN=.*#FINUP_UPDATE_TOKEN=$TOKEN#" "$ENV_FILE"
else
  printf '\nFINUP_UPDATE_TOKEN=%s\n' "$TOKEN" >> "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"
systemctl restart finup-web-updater
printf 'Token updater baru (simpan rahasia):\n%s\n' "$TOKEN"
