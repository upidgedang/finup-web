# FinUp Web v2.3.1 — Web Revision 4

FinUp Web adalah versi browser dari FinUp dengan Firebase Authentication, Cloud Firestore, Realtime Database, backup JSON, impor JSON, laporan CSV, dan Cetak/Simpan PDF melalui browser.

Repository resmi:

```text
https://github.com/upidgedang/finup-web.git
```

Domain produksi yang digunakan dalam contoh konfigurasi:

```text
https://finup.gawelive.xyz
```

## Yang baru pada Web Revision 4

- Menu **Pengaturan → Update FinUp Web**.
- Pemeriksaan commit terbaru otomatis saat Pengaturan atau halaman Update dibuka.
- Pembaruan satu tombol dari branch `main` repository resmi.
- Endpoint update dilindungi token admin yang disimpan di VPS, bukan di source web.
- Validasi fast-forward, repository resmi, file wajib, file rahasia, ukuran file, izin file, dan konfigurasi Nginx.
- Rollback otomatis ke commit sebelumnya jika validasi atau reload Nginx gagal.
- Cache-busting aset JavaScript melalui query versi.
- README instalasi baru dan panduan pembaruan lengkap.

## Instalasi baru pada Debian VPS

Masuk ke VPS sebagai root:

```bash
ssh root@IP_VPS
```

Instal paket dasar:

```bash
apt update
apt install -y nginx git python3 openssl certbot python3-certbot-nginx
systemctl enable --now nginx
```

Clone repository resmi:

```bash
rm -rf /var/www/finup
git clone https://github.com/upidgedang/finup-web.git /var/www/finup
cd /var/www/finup
```

Sebelum rilis Revision 4 dipush, bersihkan file lama yang bukan bagian FinUp Web dari repository, termasuk APK GitUp yang saat ini masih tercatat:

```bash
git rm -f GitUp-v1.0.1-Production-signed.apk 2>/dev/null || true
git rm -r --cached '*.apk' '*.aab' '*.zip' 2>/dev/null || true
```

Atur izin aman untuk web root:

```bash
chown -R root:www-data /var/www/finup
find /var/www/finup -type d -exec chmod 755 {} \;
find /var/www/finup -type f -exec chmod 644 {} \;
find /var/www/finup/deploy -type f -name '*.sh' -exec chmod 755 {} \;
chmod 755 /var/www/finup/deploy/finup_updater.py
```

Pasang layanan updater otomatis:

```bash
sudo bash /var/www/finup/deploy/install-finup-updater.sh
```

Perintah tersebut akan menampilkan **token admin update**. Simpan token secara rahasia. Token juga tersimpan di:

```text
/etc/finup-web-updater.env
```

Pasang konfigurasi Nginx:

```bash
cp /var/www/finup/deploy/nginx-finup.conf.example /etc/nginx/sites-available/finup
ln -sfn /etc/nginx/sites-available/finup /etc/nginx/sites-enabled/finup
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

Aktifkan HTTPS:

```bash
certbot --nginx -d finup.gawelive.xyz
certbot renew --dry-run
```

Tambahkan `finup.gawelive.xyz` pada **Firebase Authentication → Settings → Authorized domains**.

## Memperbarui instalasi lama ke Revision 4

Jalankan melalui SSH:

```bash
cd /var/www/finup
git pull --ff-only origin main
sudo bash /var/www/finup/deploy/install-finup-updater.sh
```

Pastikan konfigurasi Nginx memuat endpoint updater. Installer akan mencoba menambahkan include secara aman pada server block dengan root `/var/www/finup`. Verifikasi:

```bash
grep -n "finup-updater" /etc/nginx/sites-available/finup
nginx -t
systemctl reload nginx
```

## Update dari dalam FinUp Web

1. Login ke FinUp Web.
2. Buka **Lainnya → Pengaturan**.
3. Pilih **Update FinUp Web**.
4. FinUp otomatis membandingkan commit lokal dengan branch `main` GitHub.
5. Jika pembaruan tersedia, masukkan token admin VPS.
6. Tekan **Update sekarang**.
7. Server melakukan fetch, validasi, fast-forward, memperbarui izin, menguji Nginx, lalu memuat ulang FinUp.

Token tidak disimpan oleh browser. Pengguna tanpa token hanya dapat melihat status pembaruan.

## Update melalui SSH

Cara yang direkomendasikan:

```bash
sudo bash /var/www/finup/deploy/update-finup.sh
```

Cara manual:

```bash
cd /var/www/finup
git status
git pull --ff-only origin main
chown -R root:www-data /var/www/finup
nginx -t
systemctl reload nginx
```

## Melihat atau mengganti token admin updater

Lihat token:

```bash
sudo cat /etc/finup-web-updater.env
```

Ganti token:

```bash
NEW_TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(36))')"
sudo sed -i "s|^FINUP_UPDATE_TOKEN=.*|FINUP_UPDATE_TOKEN=$NEW_TOKEN|" /etc/finup-web-updater.env
sudo systemctl restart finup-web-updater
printf '%s\n' "$NEW_TOKEN"
```

## Pemeriksaan layanan updater

```bash
systemctl status finup-web-updater --no-pager
curl http://127.0.0.1:8731/api/finup-update/health
curl http://127.0.0.1:8731/api/finup-update/status
journalctl -u finup-web-updater -n 100 --no-pager
```

## Pemecahan masalah

### Menu menampilkan “Updater VPS belum aktif”

```bash
sudo bash /var/www/finup/deploy/install-finup-updater.sh
sudo nginx -t
sudo systemctl reload nginx
```

### Token ditolak

Pastikan token disalin tanpa spasi dari `/etc/finup-web-updater.env`, lalu restart service:

```bash
sudo systemctl restart finup-web-updater
```

### Repository memiliki perubahan lokal

Updater sengaja berhenti agar file server tidak tertimpa. Periksa:

```bash
cd /var/www/finup
git status
git diff
```

Simpan perubahan ke GitHub atau pulihkan file sebelum menjalankan update otomatis.

### Tampilan lama masih muncul

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Kemudian muat ulang penuh browser. `index.html` dan `version.json` dikirim dengan `no-cache`, sedangkan URL JavaScript memakai query revision.

## Keamanan repository

Repository web **tidak boleh** berisi:

- Keystore Android (`.jks`, `.keystore`).
- Password signing atau `key.properties`.
- Source-With-Signing.
- Paket Developer RAHASIA.
- Service-account private key Firebase.
- File `.env` server.
- APK, AAB, atau arsip ZIP apa pun.

Konfigurasi token updater disimpan di `/etc/finup-web-updater.env` di luar web root. APK, AAB, signing, dan keystore harus tetap berada pada paket privat terpisah.
