# USDpedia — Interactive Web Preview

Implementasi UI/UX interaktif berdasarkan **PRD-Mobile-Application.pdf**. Antarmuka berbahasa Indonesia; toko dan bank mengikuti PRD. Seluruh harga ditampilkan dalam rupiah (IDR). Logo menggunakan gambar Universe Solusi Digital yang diberikan pengguna, dengan simbol yang dipotong dari gambar yang sama untuk asisten.

## Cakupan yang berfungsi

- **Kelola produk:** tambah, ubah, hapus, draft/aktif, kategori, deskripsi, foto terkompresi, dan harga rupiah. Maksimal 50 produk tambahan. Disimpan lokal per browser, bukan katalog server bersama. Produk aktif muncul di Toko USDpedia dan keranjang; checkout produk lokal ditahan sampai SKU dan harga diterbitkan secara aman melalui backend admin. Tidak ada autentikasi admin pada menu lokal ini.

- Beranda dengan produk pilihan, kategori, insight harga, dan preferensi pembayaran.
- Pencarian produk/merek, filter kategori, serta urutan harga dan penghematan.
- **Harga standar:** panel samping glass, urutan harga naik, harga tiap toko, status stok, estimasi pengiriman, ongkir, dan CTA kontekstual.
- **Harga personal:** perhitungan promo berdasarkan bank/metode pembayaran; persentase, batas diskon, dan minimum transaksi. Harga awal dan harga setelah promo ditampilkan terpisah.
- **Detail lengkap:** modal vertikal, filter toko, dan enam blok—harga/penghematan, pengiriman, rating, aktivitas 30 hari, retur/refund, stok/penjual. Tidak menggunakan tabel lebar atau scroll horizontal.
- Daftar pantauan, target harga, notifikasi dalam aplikasi, permintaan pantauan stok, dan grafik riwayat harga contoh.
- Pengelolaan preferensi kredit/debit/UPI/wallet, nama panggilan, kode pos, notifikasi, pilihan privasi, serta penghapusan data lokal.
- Walkthrough empat langkah, menu asisten floating, FAQ, serta penyimpanan masukan lokal.
- Tata letak desktop/tablet/mobile, navigasi seluler, keyboard shortcut pencarian, Escape, focus trap dialog, label aksesibel, dan reduced-motion.
- **Toko USDpedia:** katalog merchant sandbox terpisah, keranjang, kuantitas, ongkir, data pengiriman contoh, checkout, dan daftar pesanan.
- **Backend Midtrans Sandbox:** pembuatan Snap hosted checkout, harga server, idempotensi, bearer token order, verifikasi signature SHA-512 dan status API, serta persistensi SQLite. Aktivasi merchant dan hosting backend masih diperlukan.

## Batasan penting

Ini adalah **aplikasi web sandbox, bukan APK Android atau aplikasi produksi**. Semua harga, promo, ketersediaan, review, aktivitas, dan kebijakan toko merupakan data contoh. Tombol beli membuka checkout katalog milik USDpedia, bukan transaksi ke platform pembanding atau tautan affiliate. Notifikasi bukan push native. Mengubah lokasi tidak mengubah ongkir data contoh. Tombol perbarui hanya memuat ulang tampilan data contoh, bukan mengambil harga live.

Preferensi dan keranjang menggunakan `localStorage`; token akses order memakai `sessionStorage` tab. Backend pesanan SQLite sudah tersedia tetapi belum dihosting/dihubungkan ke Midtrans merchant. **GitHub Pages tetap frontend saja; checkout tidak dapat menghasilkan pembayaran tanpa backend dan Server Key sandbox.** Tidak ada akun, scraping, pembayaran production, analitik, enkripsi Keystore, atau pengiriman laporan. Jangan memasukkan data pribadi/kartu nyata. Lihat **PAYMENT-SETUP.md** untuk aktivasi merchant, deployment backend, konfigurasi environment rahasia, dan batasan keamanan.

## Struktur

- `index.html`: entry point dan metadata.
- `styles.css`: token desain, komponen, responsivitas, dan aksesibilitas visual.
- `app.js`: katalog contoh, state, promo engine, interaksi, dan persistensi lokal.
- `assets/`: ilustrasi produk SVG lokal. Tidak membutuhkan layanan gambar eksternal.
- `checkout.js` / `checkout.css`: toko, keranjang, formulir checkout, dan pesanan.
- `payment-config.js`: origin HTTPS backend publik; tidak berisi secret.
- `backend/`: server Node.js 22, katalog merchant, tes keamanan, SQLite, Dockerfile, dan contoh environment.
- `_config.yml`: mengecualikan backend dari output GitHub Pages.

Tidak ada dependency JavaScript, proses build, atau bundler. Sajikan folder ini sebagai situs statis. Google Fonts digunakan untuk Manrope dan Plus Jakarta Sans; tersedia fallback font sistem apabila jaringan tidak tersedia.

## Handoff produksi sesuai PRD

| Area | Preview | Kebutuhan produksi |
| --- | --- | --- |
| Frontend | HTML/CSS/JavaScript responsif | Android Kotlin + Jetpack Compose |
| Asisten | Floating button di halaman ini | Overlay lintas aplikasi, izin sistem yang sesuai, tinjauan kebijakan Play Store |
| Ekstraksi produk | Katalog contoh | Integrasi ekstraksi produk dari platform yang disetujui |
| Data harga | Data statis | API/scraping yang diizinkan, validasi SKU/varian, fallback, timestamp |
| Cache | Data contoh dalam sesi | Cache 30 menit standar/personal, 60 menit lengkap; Redis dan cache offline |
| Akun | Nama lokal | OAuth 2.0, backend Node/FastAPI, PostgreSQL |
| Pembayaran | Preferensi lokal | Android Keystore, offer API, penilaian PCI dan consent |
| Notifikasi | Evaluasi target data contoh | WorkManager, push, pemantauan harga/stok, WebSocket bila diperlukan |
| Pembelian | Checkout toko sendiri + backend Midtrans Sandbox (belum aktif merchant) | Hosting HTTPS, sandbox key, webhook; audit production, stok, fulfillment, akun |
| Privasi | Reset localStorage | Kebijakan privasi, granular consent, mekanisme penghapusan data server |

Target performa PRD (load <2 s, overlay <500 ms, fetch <3–5 s, scroll 60 FPS) belum disertifikasi dengan pengujian perangkat Android atau API produksi.

## Data demo

Katalog mencakup Sony WH-1000XM5, iPhone 15, Nike Air Max 270, JBL Flip 6, Galaxy Watch6, dan Amul Taaza Milk. Lima platform PRD tersedia di seluruh katalog: Amazon, Flipkart, Blinkit, Zepto, dan Instamart. Setiap produk hanya menampilkan toko yang relevan pada data contohnya.

Preferensi awal HDFC •••• 4242 dan dua produk pantauan dibuat untuk demonstrasi; bisa diubah atau dihapus melalui UI. Harga dalam rupiah (IDR), dengan pemisah ribuan Indonesia. Harga, ongkir, riwayat, minimum transaksi, dan batas promo disesuaikan menggunakan faktor demo tetap 190 dari angka contoh sebelumnya. Faktor ini bukan kurs live, bukan kutipan kurs, dan bukan harga toko Indonesia. Target harga lama dikonversi satu kali ke IDR saat pemuatan, tanpa menghapus pantauan atau profil. Target baru diisi langsung dalam rupiah. Platform dan lokasi pengiriman India tidak diubah.
