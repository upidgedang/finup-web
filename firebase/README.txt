Folder ini disiapkan untuk Firebase Web SDK lokal.

Build v2.3.0 masih menggunakan CDN resmi gstatic karena file SDK tidak tersedia
pada paket Android SDK offline. Untuk menghilangkan ketergantungan pembukaan
pertama terhadap CDN, simpan versi resmi yang cocok di folder ini dan ubah tag
script index.html, atau migrasikan autentikasi/Firestore ke Firebase Android SDK.
Jangan mengambil Firebase SDK dari mirror tidak resmi.
