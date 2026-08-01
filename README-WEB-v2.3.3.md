# FinUp Web v2.3.3 — Responsive Revision 2

FinUp Web v2.3.3 menyempurnakan hasil laporan tanpa mengubah struktur data Firebase atau repository resmi.

## Perubahan laporan

- Template laporan A4 profesional untuk cetak atau Simpan sebagai PDF.
- Header FinUp, periode laporan, waktu pembuatan, dan identitas akun.
- Ringkasan pemasukan, pengeluaran, arus bersih, dan saldo akun.
- Tabel saldo akun, pengeluaran per kategori, dan rincian transaksi.
- Header tabel berulang dan nomor halaman pada laporan panjang.
- CSV siap Excel dengan kolom pemasukan, pengeluaran, dan transfer terpisah.
- Mesin laporan bersama berada pada `report-v233.js`.

## Deployment

Unggah isi repository bersih ke branch `main`, lalu gunakan menu updater atau jalankan:

```bash
cd /var/www/finup
sudo bash deploy/update-finup.sh
```

Tidak ada perubahan pada port StreamFlow `7575` maupun server block `gawelive.xyz`.

## Responsive Revision 2

- Desktop, tablet, mobile, portrait, dan landscape.
- Tidak ada overflow horizontal pada layout utama.
- Login dan halaman penuh dapat digulir pada layar landscape pendek.
- Grid menyesuaikan ruang yang tersedia tanpa mengubah data atau fitur.
