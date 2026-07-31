# FinUp Web v2.3.2 — Revision 1

Revision ini memusatkan perbaikan pada keamanan sesi browser, keamanan impor backup, dan keamanan updater VPS.

## Sesi browser

- Default menggunakan `sessionStorage` sehingga sesi hilang ketika seluruh tab FinUp ditutup.
- Pengguna dapat memilih **Tetap masuk di browser ini** untuk penyimpanan persisten.
- Logout dan penghapusan akun membersihkan kedua lokasi penyimpanan sesi.
- Sesi Revision 4 dimigrasikan ke penyimpanan tab bila belum ada persetujuan penyimpanan persisten.

## Impor backup

- Maksimum 25 MB dan 25.000 record valid.
- Batas terpisah untuk akun, kategori, transaksi, anggaran, jadwal, target, utang/piutang, dan aktivitas.
- ID, angka, tanggal, timestamp, enum, teks, dan field bersarang dinormalisasi.
- Field asing dan kunci prototype-pollution ditolak.
- Relasi transaksi, jenis anggaran, dan struktur jadwal divalidasi.
- Backup otomatis dibuat sebelum mode **Ganti seluruh data**.

## Updater VPS

- Status dan eksekusi memerlukan token administrator.
- Lima token salah dalam 15 menit mengunci klien selama 15 menit.
- Perubahan lokal dan file tidak terlacak menghentikan update.
- Runtime updater, unit systemd, dan snippet Nginx ikut diperbarui setelah fast-forward berhasil.
- Rollback source dan runtime dilakukan jika validasi atau reload Nginx gagal.
- Script rotasi token tersedia di `deploy/rotate-finup-updater-token.sh`.

## Batasan yang masih diketahui

Core UI FinUp masih berupa HTML/JavaScript monolitik dengan handler inline. CSP Nginx sudah membatasi origin, frame, objek, kamera, mikrofon, dan geolokasi, tetapi `unsafe-inline` masih dibutuhkan. Pemindahan seluruh handler ke modul terpisah adalah pekerjaan arsitektur lanjutan dan tidak dilakukan secara tergesa-gesa agar tidak merusak alur transaksi yang sudah stabil.
