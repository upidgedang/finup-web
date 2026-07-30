# Release Notes — FinUp Web v2.3.1 Revision 4

Tanggal rilis: 31 Juli 2026

- Memperbaiki menu Update FinUp Web yang sebelumnya selalu menampilkan updater VPS belum aktif walaupun endpoint server merespons HTTP 200.
- Mengizinkan koneksi same-origin ke API updater melalui Content Security Policy.
- Mengabaikan perubahan permission file Git agar pembaruan tidak terkunci dengan status `dirty` palsu.
- Memastikan service updater di-restart saat installer dijalankan ulang.
- APK dan AAB tidak berubah.
