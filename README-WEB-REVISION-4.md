# FinUp Web v2.3.1 — Browser Revision 4

Revision 4 memperbaiki koneksi halaman FinUp Web ke layanan updater pada domain yang sama dan mencegah repository salah terdeteksi `dirty` hanya karena permission file berubah di VPS.

## Perbaikan

- Menambahkan `'self'` pada `connect-src` Content Security Policy agar browser dapat mengakses `/api/finup-update/status` dan `/api/finup-update/run`.
- Installer otomatis menjalankan `git config core.fileMode false`.
- Service updater juga memastikan `core.fileMode=false` setiap kali memeriksa repository.
- Installer selalu me-restart service setelah source updater diperbarui.
- Respons status menyertakan daftar file lokal yang benar-benar berubah melalui `dirtyFiles`.

Versi aplikasi tetap `2.3.1` dan version code Android tetap `29`. Perubahan ini khusus FinUp Web.
