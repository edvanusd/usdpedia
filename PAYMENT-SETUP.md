# USDpedia × Midtrans Sandbox

## Status deliverable

Checkout, keranjang, backend pembuatan transaksi, verifikasi notifikasi, status pesanan, dan penyimpanan SQLite sudah diimplementasikan. **Belum terhubung ke merchant Midtrans atau hosting backend publik.** GitHub Pages hanya menyajikan frontend, sehingga tidak dapat menyimpan Server Key atau menjalankan API. Tidak ada pembayaran live atau pengiriman barang.

Tombol beli platform pembanding membuka penjelasan bahwa checkout dilakukan pada katalog USDpedia, bukan atas nama Amazon/Flipkart. Harga dan ongkir toko USDpedia ditentukan server; promo bank toko pembanding tidak berlaku. Katalog adalah katalog uji, bukan inventaris merchant nyata.

## Aktivasi oleh pemilik merchant

1. Buat/masuk akun Midtrans dan pilih **Sandbox**. Ambil **Server Key sandbox** dari pengaturan akses merchant. Jangan mengirim key melalui chat, memasukkan ke frontend, atau commit ke GitHub.
2. Deploy backend pada host yang mendukung **Node.js 22.13+**, HTTPS, environment secrets, dan **persistent disk**. Dockerfile berada di `backend/Dockerfile`; build context harus root repo. Start command: `node backend/server.mjs`. Port mengikuti environment `PORT`, default 3000. Tidak perlu memasang dependency npm.
3. Simpan konfigurasi melalui secret manager host:
   - `MIDTRANS_SERVER_KEY`: Server Key sandbox dengan prefix `SB-Mid-server-`.
   - `ORDER_TOKEN_SECRET`: rahasia acak minimal 32 karakter, tidak diganti selama pesanan aktif.
   - `ALLOWED_ORIGINS`: `https://edvanusd.github.io`. Tambahkan origin frontend lain dengan koma jika diperlukan.
   - `DATABASE_PATH`: path pada disk persisten, misalnya `/data/orders.sqlite`. Jangan letakkan database di direktori publik atau Git.
   - `PORT`: port yang ditentukan host.
4. Isi `window.USDPEDIA_PAYMENT_API` di `payment-config.js` dengan **origin HTTPS backend yang benar-benar berhasil dideploy** (tanpa trailing slash atau `/api`). Ini alamat publik, bukan secret. Push ke `main` untuk memperbarui frontend Pages. Jika seluruh aplikasi disajikan oleh backend pada origin yang sama, konfigurasi ini dapat kosong.
5. Daftarkan URL notifikasi pada dashboard sandbox: origin backend diikuti `/api/midtrans/notification`. URL ini harus HTTPS dan dapat diakses Midtrans. Jangan masukkan URL frontend GitHub Pages sebagai webhook.
6. Cek `/api/health`: `paymentReady` harus `true`. Gunakan data pelanggan contoh, lalu buat pembayaran sandbox dan buka halaman Midtrans dari pesanan. Ikuti instruksi simulator resmi di dashboard/dokumentasi Midtrans; jangan gunakan kartu nyata.
7. Setelah simulasi dibayar, tekan **Periksa status**. Hanya backend yang boleh mengubah status berdasarkan status API Midtrans yang cocok dengan order ID dan total. Jangan mengubah status dari callback frontend.

## API

| Endpoint | Fungsi |
| --- | --- |
| `GET /api/health` | Kesiapan konfigurasi, mode sandbox |
| `GET /api/catalog` | Harga katalog merchant |
| `POST /api/quote` | Total server dari SKU dan kuantitas |
| `POST /api/checkout` | Buat order dan redirect Snap Sandbox |
| `GET /api/orders/:id` | Status terverifikasi; wajib header `Authorization: Bearer <accessToken>` |
| `POST /api/midtrans/notification` | Signature SHA-512 dan verifikasi status API server-to-server |

Contoh body checkout:

```json
{
  "items": [{"id": 6, "quantity": 1}],
  "customer": {
    "name": "Pelanggan Uji",
    "email": "pelanggan@example.com",
    "phone": "081234567890",
    "address": "Jalan Contoh No. 1, Jakarta",
    "postalCode": "10110",
    "consent": true
  },
  "idempotencyKey": "48-karakter-hex-acak-dibuat-frontend"
}
```

Harga dari client diabaikan. Idempotency key acak mencegah order ganda untuk permintaan yang sama. Jika pembayaran tidak dapat diverifikasi, status tidak ditandai berhasil. Jika ada timeout setelah pembuatan, periksa pesanan/gateway sebelum membuat transaksi baru. Keranjang bertahan di localStorage. Token pesanan berada di sessionStorage tab (bukan URL); tutup sesi browser dapat menghilangkan akses pesanan. Belum tersedia akun pelanggan atau pemulihan pesanan lintas perangkat.

## Pengujian

`node --test backend/server.test.mjs`

Tes memakai mock gateway server-side; tidak mengklaim transaksi merchant Midtrans asli. Mencakup harga server, kuantitas, idempotensi, consent, origin CORS, signature, token akses, mismatch jumlah, fraud challenge, status terverifikasi, dan fail-closed tanpa credentials. End-to-end merchant sandbox nyata harus dilakukan setelah host dan credentials tersedia.

## Batasan operasional

- Mode sandbox dipatok; Server Key production tidak diaktifkan. Jangan menggunakan ini sebagai penerimaan uang production tanpa audit lanjutan.
- SQLite membutuhkan satu instance aplikasi dan persistent disk. Untuk horizontal scaling, ganti dengan database transaksi server terkelola.
- Data pelanggan uji disimpan server. Terapkan kontrol akses host, backup, retensi, dan penghapusan data merchant. Penghapusan preferensi browser tidak menghapus database merchant.
- Rate limit merupakan batas lokal per IP socket, belum solusi distributed rate limit. Konfigurasikan proxy/WAF host untuk lingkungan publik.
- Checkout belum memiliki akun/OAuth, admin order, stok/fulfillment, pajak, diskon merchant, resi, refund automation, atau email pesanan.
- Tidak meminta PAN/CVV. Midtrans Snap hosted checkout mengelola informasi pembayaran. Kepatuhan produksi, verifikasi merchant, dan aturan konsumen harus ditinjau sebelum go-live.

## Dokumentasi resmi yang dirujuk

- https://docs.midtrans.com/docs/snap-snap-integration-guide
- https://docs.midtrans.com/docs/https-notification-webhooks
