#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${FINUP_APP_DIR:-/var/www/finup}"
SITE_FILE="${FINUP_NGINX_SITE:-/etc/nginx/sites-available/finup}"
ENV_FILE="/etc/finup-web-updater.env"
SERVICE_DIR="/opt/finup-web-updater"
SNIPPET_FILE="/etc/nginx/snippets/finup-updater-location.conf"
REPO_SLUG="upidgedang/finup-web"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Jalankan sebagai root: sudo bash $0" >&2
  exit 1
fi
if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "Repository Git tidak ditemukan di $APP_DIR" >&2
  exit 1
fi

# Abaikan perubahan mode executable yang diperlukan VPS agar repository tidak
# salah dianggap memiliki perubahan lokal.
git -C "$APP_DIR" config core.fileMode false

apt-get update
apt-get install -y python3 git nginx openssl

install -d -m 755 "$SERVICE_DIR" /etc/nginx/snippets
install -m 755 "$APP_DIR/deploy/finup_updater.py" "$SERVICE_DIR/finup_updater.py"
install -m 644 "$APP_DIR/deploy/finup-web-updater.service" /etc/systemd/system/finup-web-updater.service
install -m 644 "$APP_DIR/deploy/nginx-finup-updater-location.conf" "$SNIPPET_FILE"

if [[ ! -f "$ENV_FILE" ]]; then
  TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(36))')"
  cat > "$ENV_FILE" <<EOF
FINUP_APP_DIR=$APP_DIR
FINUP_REPO_SLUG=$REPO_SLUG
FINUP_BRANCH=main
FINUP_UPDATER_HOST=127.0.0.1
FINUP_UPDATER_PORT=8731
FINUP_UPDATE_TOKEN=$TOKEN
EOF
  chmod 600 "$ENV_FILE"
else
  TOKEN="$(sed -n 's/^FINUP_UPDATE_TOKEN=//p' "$ENV_FILE" | head -n1)"
fi

# Tambahkan include updater hanya pada server block yang melayani web root FinUp.
if [[ -f "$SITE_FILE" ]] && ! grep -q 'finup-updater-location.conf' "$SITE_FILE"; then
  cp -a "$SITE_FILE" "$SITE_FILE.backup-before-updater-$(date +%Y%m%d-%H%M%S)"
  python3 - "$SITE_FILE" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
s = p.read_text()
needle = 'root /var/www/finup;'
positions = []
i = 0
while True:
    start = s.find('server', i)
    if start < 0: break
    brace = s.find('{', start)
    if brace < 0: break
    depth = 0
    end = None
    for j in range(brace, len(s)):
        if s[j] == '{': depth += 1
        elif s[j] == '}':
            depth -= 1
            if depth == 0:
                end = j
                break
    if end is None: break
    block = s[start:end+1]
    if needle in block and 'finup-updater-location.conf' not in block:
        positions.append(end)
    i = end + 1
for end in reversed(positions):
    s = s[:end] + '    include /etc/nginx/snippets/finup-updater-location.conf;\n' + s[end:]
p.write_text(s)
PY
fi

systemctl daemon-reload
systemctl enable finup-web-updater
systemctl restart finup-web-updater
nginx -t
systemctl reload nginx

printf '\nFinUp Web Updater berhasil dipasang.\n'
printf 'Token admin update (simpan rahasia):\n%s\n\n' "$TOKEN"
printf 'Token juga tersimpan di %s dengan izin 600.\n' "$ENV_FILE"
printf 'Uji service: curl http://127.0.0.1:8731/api/finup-update/status\n'
