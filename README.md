# FinUp Web v2.3.3 — Web Revision 1

FinUp Web adalah versi browser FinUp yang menggunakan Firebase Authentication, Cloud Firestore, dan Realtime Database yang sama dengan aplikasi Android.

- Repository resmi: `https://github.com/upidgedang/finup-web.git`
- Branch produksi: `main`
- Domain contoh produksi: `https://finup.gawelive.xyz`
- Web root: `/var/www/finup`
- Updater lokal: `127.0.0.1:8731`

## Perubahan v2.3.3

- PDF memakai template A4 profesional dengan identitas FinUp, periode, tanggal pembuatan, ringkasan arus kas, saldo akun, kategori pengeluaran, tabel transaksi, dan nomor halaman.
- CSV disusun untuk Excel dengan metadata laporan, ringkasan, saldo akun, kategori, serta kolom pemasukan, pengeluaran, dan transfer yang terpisah.
- Hasil cetak Web menggunakan template yang sama dan dapat dipilih sebagai **Simpan sebagai PDF** dari dialog browser.
- Source Web dan Android memakai mesin laporan bersama `report-v233.js`.

- Sesi web memakai `sessionStorage` secara default. Penyimpanan persisten hanya dipakai bila pengguna memilih **Tetap masuk di browser ini**.
- Sesi lama dari Revision 4 dimigrasikan dari penyimpanan persisten ke penyimpanan tab apabila pengguna belum memilih untuk tetap masuk.
- Impor backup JSON divalidasi per koleksi, ukuran file dibatasi 25 MB, jumlah record dibatasi, field asing dibuang, dan struktur berbahaya ditolak.
- FinUp menampilkan ringkasan data sebelum impor dan membuat backup otomatis sebelum **Ganti seluruh data**.
- Menu updater hanya dapat memeriksa status dan menjalankan update setelah token administrator VPS dimasukkan.
- Percobaan token salah dibatasi; lima kegagalan dalam 15 menit mengunci akses klien selama 15 menit.
- Updater menolak perubahan lokal, file tidak terlacak, APK, AAB, ZIP, keystore, private key, symlink, dan file terlalu besar di web root.
- Runtime updater di `/opt`, unit systemd, dan snippet Nginx ikut diperbarui setelah update berhasil.
- Menu, tutorial, pengingat, keamanan, backup, CSV, dan PDF menampilkan fungsi yang sesuai untuk browser.
- Header keamanan Nginx ditingkatkan. Core UI lama masih memerlukan `unsafe-inline`; migrasi modul penuh akan dilakukan bertahap pada rilis selanjutnya.

## Instalasi pada VPS Debian yang juga menjalankan StreamFlow

FinUp tidak memakai port StreamFlow. Contoh susunan layanan:

```text
https://gawelive.xyz        -> Nginx -> 127.0.0.1:7575 (StreamFlow)
https://finup.gawelive.xyz  -> Nginx -> /var/www/finup (FinUp Web)
Updater FinUp               -> 127.0.0.1:8731
```

Jangan mengubah service StreamFlow, port `7575`, atau server block `gawelive.xyz`.

### 1. Instal paket dasar

```bash
sudo apt update
sudo apt install -y nginx git python3 openssl certbot python3-certbot-nginx
sudo systemctl enable --now nginx
```

### 2. Clone repository

```bash
sudo mkdir -p /var/www
sudo git clone --branch main --single-branch \
  https://github.com/upidgedang/finup-web.git /var/www/finup
cd /var/www/finup
sudo git config core.fileMode false
```

### 3. Atur permission

```bash
sudo chown -R root:www-data /var/www/finup
sudo find /var/www/finup -type d -exec chmod 755 {} \;
sudo find /var/www/finup -type f -exec chmod 644 {} \;
sudo find /var/www/finup/deploy -type f -name '*.sh' -exec chmod 755 {} \;
sudo chmod 755 /var/www/finup/deploy/finup_updater.py
```

### 4. Instal updater

```bash
sudo bash /var/www/finup/deploy/install-finup-updater.sh
```

Simpan token yang ditampilkan. Token disimpan di luar web root:

```text
/etc/finup-web-updater.env
```

### 5. Pasang server block FinUp

```bash
sudo cp /var/www/finup/deploy/nginx-finup.conf.example \
  /etc/nginx/sites-available/finup
sudo ln -sfn /etc/nginx/sites-available/finup \
  /etc/nginx/sites-enabled/finup
sudo nginx -t
sudo systemctl reload nginx
```

Jangan menjalankan perintah yang menghapus konfigurasi StreamFlow atau `sites-enabled/default` kecuali Anda sudah memeriksa bahwa file itu tidak dipakai layanan lain.

### 6. Aktifkan HTTPS

```bash
sudo certbot --nginx -d finup.gawelive.xyz --redirect
sudo nginx -t
sudo systemctl reload nginx
```

Tambahkan `finup.gawelive.xyz` pada **Firebase Authentication → Settings → Authorized domains**.

## Upgrade dari Web Revision 4 ke v2.3.2

Revision 4 belum dapat mengganti runtime updater-nya sendiri. Setelah source v2.3.2 sudah dipush ke GitHub, jalankan satu kali melalui SSH:

```bash
cd /var/www/finup
sudo git config core.fileMode false
sudo git pull --ff-only origin main
sudo bash /var/www/finup/deploy/install-finup-updater.sh
sudo nginx -t
sudo systemctl reload nginx
```

Karena token lama pernah terlihat di log/chat, segera buat token baru:

```bash
sudo bash /var/www/finup/deploy/rotate-finup-updater-token.sh
```

Setelah langkah ini, pembaruan selanjutnya dapat dilakukan melalui menu **Lainnya → Pengaturan → Update FinUp Web**.

## Update melalui menu FinUp

1. Push source baru ke branch `main` repository resmi.
2. Buka **Lainnya → Pengaturan → Update FinUp Web**.
3. Masukkan token administrator VPS.
4. Tekan **Periksa status**.
5. Bila pembaruan tersedia, tekan **Update sekarang**.

Token hanya dipakai untuk permintaan saat itu dan tidak disimpan oleh FinUp Web.

## Update melalui SSH

```bash
sudo bash /var/www/finup/deploy/update-finup.sh
```

Script hanya menerima fast-forward, memeriksa file wajib, memperbarui runtime updater, menguji Nginx, dan berhenti bila repository memiliki perubahan lokal atau file tidak terlacak.

## Pemeriksaan layanan

Health endpoint tidak memerlukan token:

```bash
curl -i https://finup.gawelive.xyz/api/finup-update/health
```

Status endpoint memerlukan token:

```bash
set -a
source /etc/finup-web-updater.env
set +a
curl -sS \
  -H "X-FinUp-Update-Token: $FINUP_UPDATE_TOKEN" \
  https://finup.gawelive.xyz/api/finup-update/status | python3 -m json.tool
```

Periksa service dan log:

```bash
sudo systemctl status finup-web-updater --no-pager
sudo ss -lntp | grep ':8731'
sudo journalctl -u finup-web-updater -n 100 --no-pager
```

## Repository harus bersih

Jangan masukkan file berikut ke repository web:

- APK, AAB, atau ZIP.
- Keystore `.jks`/`.keystore`.
- Password signing, `key.properties`, atau source-with-signing.
- File `.env`, token VPS, private key, atau service-account Firebase.
- Paket developer privat.

Paket repository GitHub yang disediakan untuk rilis ini sudah dipisahkan dari seluruh rahasia Android dan server.
