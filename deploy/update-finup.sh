#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/finup"

cd "$APP_DIR"
git pull --ff-only
sudo chown -R www-data:www-data "$APP_DIR"
sudo find "$APP_DIR" -type d -exec chmod 755 {} \;
sudo find "$APP_DIR" -type f -exec chmod 644 {} \;
sudo nginx -t
sudo systemctl reload nginx

echo "FinUp berhasil diperbarui."
