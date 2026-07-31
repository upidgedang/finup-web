#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${FINUP_APP_DIR:-/var/www/finup}"
BRANCH="${FINUP_BRANCH:-main}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Jalankan sebagai root: sudo bash $0" >&2
  exit 1
fi
cd "$APP_DIR"

if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  echo "Update dibatalkan: ada perubahan lokal pada file yang dilacak Git." >&2
  exit 1
fi

OLD_COMMIT="$(git rev-parse HEAD)"
git fetch --prune origin "$BRANCH"
NEW_COMMIT="$(git rev-parse "origin/$BRANCH")"

if [[ "$OLD_COMMIT" == "$NEW_COMMIT" ]]; then
  echo "FinUp Web sudah versi terbaru ($OLD_COMMIT)."
  exit 0
fi

if ! git merge-base --is-ancestor "$OLD_COMMIT" "$NEW_COMMIT"; then
  echo "Update bukan fast-forward. Periksa branch secara manual." >&2
  exit 1
fi

git merge --ff-only "origin/$BRANCH"

for file in index.html web-adapter-v232.js hardening-v232.js version.json deploy/finup_updater.py; do
  [[ -s "$file" ]] || { echo "Validasi gagal: $file tidak tersedia." >&2; git reset --hard "$OLD_COMMIT"; exit 1; }
done

chown -R root:www-data "$APP_DIR"
find "$APP_DIR" -type d -exec chmod 755 {} \;
find "$APP_DIR" -type f -exec chmod 644 {} \;
find "$APP_DIR/deploy" -type f -name '*.sh' -exec chmod 755 {} \;
chmod 755 "$APP_DIR/deploy/finup_updater.py"

# Salin updater versi terbaru ke luar web root, lalu restart servicenya.
install -m 755 "$APP_DIR/deploy/finup_updater.py" /opt/finup-web-updater/finup_updater.py
systemctl restart finup-web-updater
nginx -t
systemctl reload nginx

echo "FinUp Web berhasil diperbarui: $OLD_COMMIT -> $NEW_COMMIT"
