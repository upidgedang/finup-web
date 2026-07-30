# FinUp Web v2.3.1 — Browser Revision 3

Revision 3 menambahkan pembaruan aplikasi web dari repository GitHub resmi melalui layanan updater lokal pada VPS.

## Alur pembaruan

1. Pengaturan dibuka.
2. Browser meminta status ke endpoint same-origin `/api/finup-update/status`.
3. Service lokal membandingkan commit terpasang dengan branch `main` repository `upidgedang/finup-web`.
4. Jika tersedia, pemilik memasukkan token admin VPS.
5. Service melakukan fetch, fast-forward, validasi source, pengaturan izin, tes Nginx, dan reload.
6. Jika validasi gagal, service mengembalikan repository ke commit sebelumnya.

## Batas platform

Fitur updater hanya ada pada FinUp Web. APK/AAB tidak diubah karena pembaruan Android tetap dilakukan melalui pemasangan APK atau Google Play.

## Berkas deployment baru

- `version.json`
- `deploy/finup_updater.py`
- `deploy/finup-web-updater.service`
- `deploy/install-finup-updater.sh`
- `deploy/nginx-finup-updater-location.conf`
- `deploy/update-finup.sh`
