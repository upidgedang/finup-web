# Instalasi dan Pembaruan FinUp Web pada Debian VPS

Panduan ini khusus untuk server yang sudah menjalankan StreamFlow pada:

```text
Domain utama : gawelive.xyz
Port lokal   : 7575
Subdomain    : finup.gawelive.xyz
Web root     : /var/www/finup
Updater      : 127.0.0.1:8731
```

FinUp dilayani sebagai situs statis pada subdomain terpisah. Tidak perlu mengubah port atau service StreamFlow.

## A. Backup sebelum instalasi

```bash
BACKUP_DIR="/root/backup-sebelum-finup-$(date +%Y%m%d-%H%M%S)"
sudo mkdir -p "$BACKUP_DIR"
sudo cp -a /etc/nginx "$BACKUP_DIR/nginx"
sudo nginx -T > "$BACKUP_DIR/nginx-full.txt" 2>&1
sudo ss -lntp | grep ':7575' || true
```

## B. Instalasi baru

### 1. Persiapkan paket server

```bash
sudo apt update
sudo apt install -y nginx git python3 openssl certbot python3-certbot-nginx
sudo systemctl enable --now nginx
```

### 2. Clone source

```bash
sudo test ! -e /var/www/finup || \
  sudo mv /var/www/finup "/var/www/finup-backup-$(date +%Y%m%d-%H%M%S)"
sudo git clone --branch main --single-branch \
  https://github.com/upidgedang/finup-web.git /var/www/finup
sudo git -C /var/www/finup config core.fileMode false
```

Periksa file wajib:

```bash
for file in \
  index.html web-adapter-v232.js hardening-v232.js report-v233.js \
  report-period-v234.js report-period-v234.css version.json \
  deploy/finup_updater.py deploy/install-finup-updater.sh
 do
  sudo test -s "/var/www/finup/$file" && echo "OK: $file" || echo "TIDAK ADA: $file"
 done
```

### 3. Pastikan repository tidak membawa file privat

```bash
sudo find /var/www/finup \
  -path '/var/www/finup/.git' -prune -o \
  -type f \( -iname '*.apk' -o -iname '*.aab' -o -iname '*.zip' \
  -o -iname '*.jks' -o -iname '*.keystore' -o -iname '.env' \) -print
```

Perintah tersebut tidak boleh menampilkan file apa pun.

### 4. Atur permission

```bash
sudo chown -R root:www-data /var/www/finup
sudo find /var/www/finup -type d -exec chmod 755 {} \;
sudo find /var/www/finup -type f -exec chmod 644 {} \;
sudo find /var/www/finup/deploy -type f -name '*.sh' -exec chmod 755 {} \;
sudo chmod 755 /var/www/finup/deploy/finup_updater.py
```

### 5. Instal updater

```bash
sudo bash /var/www/finup/deploy/install-finup-updater.sh
```

Token disimpan dengan izin `600` pada `/etc/finup-web-updater.env`.

### 6. Pasang konfigurasi Nginx khusus FinUp

```bash
sudo cp /var/www/finup/deploy/nginx-finup.conf.example \
  /etc/nginx/sites-available/finup
sudo ln -sfn /etc/nginx/sites-available/finup \
  /etc/nginx/sites-enabled/finup
```

Pastikan hanya satu konfigurasi aktif yang memakai subdomain FinUp:

```bash
sudo grep -Rni "server_name.*finup.gawelive.xyz" \
  /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null
```

Jangan menghapus server block `gawelive.xyz` atau proxy StreamFlow `127.0.0.1:7575`.

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 7. HTTPS

```bash
sudo certbot --nginx -d finup.gawelive.xyz --redirect
sudo nginx -t
sudo systemctl reload nginx
```

### 8. Firebase

Tambahkan `finup.gawelive.xyz` pada daftar **Authorized domains** di Firebase Authentication.

### 9. Uji kedua aplikasi

```bash
curl -sS -o /dev/null -w 'StreamFlow: %{http_code}\n' https://gawelive.xyz
curl -sS -o /dev/null -w 'FinUp: %{http_code}\n' https://finup.gawelive.xyz
curl -sS https://finup.gawelive.xyz/api/finup-update/health
sudo ss -lntp | grep -E ':7575|:8731'
```

## C. Memperbarui ke FinUp Web v2.3.6

```bash
cd /var/www/finup
sudo git config core.fileMode false
sudo git status
sudo git pull --ff-only origin main
sudo bash deploy/install-finup-updater.sh
sudo bash deploy/rotate-finup-updater-token.sh
sudo nginx -t
sudo systemctl reload nginx
```

Perintah tersebut mengambil source v2.3.6, memasang ulang runtime updater, dan tidak mengubah StreamFlow pada port `7575`.

## D. Update berikutnya

### Melalui aplikasi

Buka **Lainnya → Pengaturan → Update FinUp Web**, masukkan token admin, periksa status, lalu tekan **Update sekarang**.

### Melalui SSH

```bash
sudo bash /var/www/finup/deploy/update-finup.sh
```

## E. Pemeriksaan updater

```bash
curl -i http://127.0.0.1:8731/api/finup-update/health
set -a
source /etc/finup-web-updater.env
set +a
curl -sS -H "X-FinUp-Update-Token: $FINUP_UPDATE_TOKEN" \
  http://127.0.0.1:8731/api/finup-update/status | python3 -m json.tool
```

Status yang sehat memiliki `ok: true`, `dirty: false`, dan commit lokal/remote yang valid.

## F. Repository kotor

```bash
cd /var/www/finup
git status --short
git diff --summary
```

Updater menolak perubahan isi, perubahan mode yang masih terdeteksi, dan file tidak terlacak. Jangan memakai `git reset --hard` sebelum memastikan tidak ada konfigurasi lokal penting di web root.

## G. Mengganti token

```bash
sudo bash /var/www/finup/deploy/rotate-finup-updater-token.sh
```

Jangan mengirim token ke GitHub, screenshot, log publik, atau chat.

## H. Menghapus FinUp tanpa mengganggu StreamFlow

```bash
sudo rm -f /etc/nginx/sites-enabled/finup
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl disable --now finup-web-updater 2>/dev/null || true
sudo rm -rf /var/www/finup /opt/finup-web-updater
sudo rm -f /etc/finup-web-updater.env \
  /etc/systemd/system/finup-web-updater.service \
  /etc/nginx/snippets/finup-updater-location.conf
sudo systemctl daemon-reload
```

Perintah di atas tidak menyentuh service StreamFlow atau port `7575`.
