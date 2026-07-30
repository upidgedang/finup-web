# FinUp Web v2.3.1 — Deployment Debian VPS

> **PRIVATE:** Paket ini memuat konfigurasi Firebase milik FinUp. Gunakan repository GitHub **Private**. Paket ini tidak memuat keystore atau password signing Android.

## 1. Buat repository GitHub privat

Buat repository bernama `finup-web` dan pilih **Private**.

Dari folder ini jalankan:

```bash
git init
git branch -M main
git add .
git commit -m "FinUp Web v2.3.1"
git remote add origin git@github.com:USERNAME-GITHUB/finup-web.git
git push -u origin main
```

## 2. Arahkan domain

Buat DNS record:

```text
Type: A
Name: finup
Value: IP-VPS-ANDA
```

Contoh alamat aplikasi: `https://finup.domainanda.com`.

## 3. Instal paket dasar di Debian

Masuk ke VPS:

```bash
ssh root@IP-VPS-ANDA
apt update
apt install -y nginx git openssh-client certbot python3-certbot-nginx
systemctl enable --now nginx
```

## 4. Hubungkan VPS ke GitHub private dengan deploy key

```bash
ssh-keygen -t ed25519 -C "finup-vps" -f ~/.ssh/finup_deploy -N ""
cat ~/.ssh/finup_deploy.pub
```

Salin hasil public key, lalu buka GitHub:

`Repository finup-web → Settings → Deploy keys → Add deploy key`

Jangan centang **Allow write access**.

Buat konfigurasi SSH:

```bash
cat > ~/.ssh/config <<'SSHCONF'
Host github-finup
    HostName github.com
    User git
    IdentityFile ~/.ssh/finup_deploy
    IdentitiesOnly yes
SSHCONF
chmod 600 ~/.ssh/config
ssh-keyscan github.com >> ~/.ssh/known_hosts
ssh -T github-finup
```

## 5. Clone aplikasi ke web root

Ganti `USERNAME-GITHUB`:

```bash
rm -rf /var/www/finup
GIT_SSH_COMMAND="ssh -F /root/.ssh/config" git clone \
  git@github-finup:USERNAME-GITHUB/finup-web.git /var/www/finup
chown -R www-data:www-data /var/www/finup
find /var/www/finup -type d -exec chmod 755 {} \;
find /var/www/finup -type f -exec chmod 644 {} \;
```

Jika login VPS memakai pengguna non-root, sesuaikan lokasi file SSH dan jalankan perintah yang memerlukan hak admin memakai `sudo`.

## 6. Aktifkan konfigurasi Nginx

```bash
cp /var/www/finup/deploy/nginx-finup.conf.example /etc/nginx/sites-available/finup
nano /etc/nginx/sites-available/finup
```

Ganti `finup.DOMAIN-ANDA.com` dengan domain sebenarnya, lalu:

```bash
ln -sfn /etc/nginx/sites-available/finup /etc/nginx/sites-enabled/finup
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

Tes lebih dahulu:

```text
http://finup.domainanda.com
```

## 7. Aktifkan HTTPS

```bash
certbot --nginx -d finup.domainanda.com
certbot renew --dry-run
```

## 8. Izinkan domain pada Firebase

Di Firebase Console:

1. Buka project FinUp.
2. Buka **Authentication → Settings → Authorized domains**.
3. Tambahkan `finup.domainanda.com`.
4. Di **Project settings → Your apps**, daftarkan Web App FinUp.
5. Salin konfigurasi Web App dan sesuaikan konstanta `FIREBASE_CONFIG` pada `index.html` bila konfigurasi web berbeda.
6. Pastikan Firestore Rules dan Realtime Database Rules tetap membatasi data berdasarkan UID pengguna.

## 9. Memperbarui aplikasi

Setelah perubahan dipush ke GitHub:

```bash
cd /var/www/finup
git pull --ff-only
chown -R www-data:www-data /var/www/finup
nginx -t
systemctl reload nginx
```

Atau jalankan:

```bash
bash /var/www/finup/deploy/update-finup.sh
```

## Batasan versi awal web

Fitur transaksi, dashboard, login Firebase, Firestore, dan sinkronisasi dapat diuji dari browser. Fitur berikut masih bergantung pada bridge Android dan perlu adapter web sebelum rilis produksi penuh:

- Impor/ekspor melalui penyimpanan Android
- PDF native Android
- Biometrik Android
- Notifikasi terjadwal Android
- Perlindungan screenshot
- Penyimpanan aman berbasis Android Keystore

Jangan unggah ZIP Developer Package, Source-With-Signing, Signing-Keystore, keystore, password signing, APK, atau AAB ke repository web.
