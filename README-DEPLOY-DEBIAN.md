# Panduan Instalasi dan Update FinUp Web pada Debian VPS

Dokumen ini menggunakan:

- Repository: `https://github.com/upidgedang/finup-web.git`
- Branch: `main`
- Web root: `/var/www/finup`
- Domain: `finup.gawelive.xyz`
- Service updater: `finup-web-updater`

## A. Instalasi baru

### 1. Hubungkan domain ke VPS

Buat DNS record:

```text
Type: A
Host/Name: finup
Value: IP VPS
```

Tunggu DNS mengarah ke VPS, lalu lanjutkan.

### 2. Instal paket server

```bash
ssh root@IP_VPS
apt update
apt install -y nginx git python3 openssl certbot python3-certbot-nginx
systemctl enable --now nginx
```

### 3. Clone source FinUp Web

```bash
rm -rf /var/www/finup
git clone https://github.com/upidgedang/finup-web.git /var/www/finup
cd /var/www/finup
```

Repository web harus dibersihkan dari APK/AAB/ZIP dan file aplikasi lain. Pada repository lama, hapus APK GitUp sebelum membuat rilis web:

```bash
git rm -f GitUp-v1.0.1-Production-signed.apk 2>/dev/null || true
git rm -r --cached '*.apk' '*.aab' '*.zip' 2>/dev/null || true
```

### 4. Atur ownership dan permission

```bash
chown -R root:www-data /var/www/finup
find /var/www/finup -type d -exec chmod 755 {} \;
find /var/www/finup -type f -exec chmod 644 {} \;
find /var/www/finup/deploy -type f -name '*.sh' -exec chmod 755 {} \;
chmod 755 /var/www/finup/deploy/finup_updater.py
```

### 5. Instal updater otomatis

```bash
sudo bash /var/www/finup/deploy/install-finup-updater.sh
```

Simpan token yang ditampilkan. Token yang sama dapat dilihat oleh root melalui:

```bash
sudo cat /etc/finup-web-updater.env
```

### 6. Pasang konfigurasi Nginx

```bash
cp /var/www/finup/deploy/nginx-finup.conf.example /etc/nginx/sites-available/finup
ln -sfn /etc/nginx/sites-available/finup /etc/nginx/sites-enabled/finup
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

Buka sementara:

```text
http://finup.gawelive.xyz
```

### 7. Aktifkan HTTPS

```bash
certbot --nginx -d finup.gawelive.xyz
certbot renew --dry-run
```

### 8. Izinkan domain di Firebase

Tambahkan domain berikut pada Firebase Authentication Authorized domains:

```text
finup.gawelive.xyz
```

Pastikan Firestore Rules dan Realtime Database Rules membatasi data berdasarkan UID pengguna.

### 9. Uji updater

```bash
systemctl status finup-web-updater --no-pager
curl http://127.0.0.1:8731/api/finup-update/health
curl http://127.0.0.1:8731/api/finup-update/status
```

Kemudian buka FinUp Web:

```text
Lainnya → Pengaturan → Update FinUp Web
```

## B. Memperbarui FinUp Web

### Metode 1 — Menu Update FinUp Web

1. Push source versi terbaru ke branch `main` repository resmi.
2. Buka FinUp Web.
3. Pilih **Lainnya → Pengaturan → Update FinUp Web**.
4. Tunggu pemeriksaan commit otomatis.
5. Masukkan token admin VPS.
6. Tekan **Update sekarang**.

Updater hanya menerima fast-forward dari repository `upidgedang/finup-web`, menolak perubahan lokal, memblokir file signing/keystore, menguji file wajib, dan melakukan rollback bila Nginx gagal.

### Metode 2 — Script SSH

```bash
sudo bash /var/www/finup/deploy/update-finup.sh
```

### Metode 3 — Git manual

```bash
cd /var/www/finup
git status
git pull --ff-only origin main
chown -R root:www-data /var/www/finup
find /var/www/finup -type d -exec chmod 755 {} \;
find /var/www/finup -type f -exec chmod 644 {} \;
nginx -t
systemctl reload nginx
```

## C. Memasang updater pada instalasi lama

Setelah source Revision 3 sudah berada di repository:

```bash
cd /var/www/finup
git pull --ff-only origin main
sudo bash /var/www/finup/deploy/install-finup-updater.sh
sudo nginx -t
sudo systemctl reload nginx
```

Installer akan membuat:

```text
/opt/finup-web-updater/finup_updater.py
/etc/finup-web-updater.env
/etc/systemd/system/finup-web-updater.service
/etc/nginx/snippets/finup-updater-location.conf
```

## D. Mengganti token update

```bash
NEW_TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(36))')"
sed -i "s|^FINUP_UPDATE_TOKEN=.*|FINUP_UPDATE_TOKEN=$NEW_TOKEN|" /etc/finup-web-updater.env
systemctl restart finup-web-updater
printf '%s\n' "$NEW_TOKEN"
```

## E. Rollback manual

Lihat riwayat commit:

```bash
cd /var/www/finup
git log --oneline -10
```

Kembali ke commit tertentu:

```bash
git reset --hard COMMIT_SEBELUMNYA
chown -R root:www-data /var/www/finup
nginx -t
systemctl reload nginx
```

## F. Larangan penting

Jangan upload file berikut ke repository web:

- Keystore/signing Android.
- Password keystore.
- Source-With-Signing.
- Developer Package RAHASIA.
- File service-account Firebase.
- `/etc/finup-web-updater.env`.

Source web yang di-push ke GitHub harus hanya berisi file yang memang aman dilayani oleh Nginx.
