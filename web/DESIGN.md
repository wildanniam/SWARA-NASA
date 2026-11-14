# Arah desain viewer

Sumber acuan tampilan untuk `web/`. Ubah di sini dulu kalau mau mengganti arah visual.

## Register

Product UI dengan satu momen ekspresif. Ini alat: orang datang untuk melihat langit berubah, bukan membaca halaman. Citra SPHEREx asli adalah gambar utamanya; antarmuka mundur ke belakang.

## Pengguna dan tugas

Relawan pemula. Tugasnya satu: pilih target, lihat citra berkedip antar kunjungan, kenali apa yang bergerak atau berubah terang, dan pahami seberapa bisa datanya dipercaya.

## Prinsip

- **Langit dulu.** Panggung persegi sebesar yang muat di layar; kendali blink tepat di bawahnya. Di ponsel urutannya tetap: target, panggung, kendali, baru penjelasan.
- **Gelap karena perlu.** Citra astronomi gelap; latar hampir hitam supaya bintang redup terbaca. Tanpa gradien hias, kaca buram, atau pendar.
- **Satu warna aksen** (`--accent`, kuning ambar): tanda acuan di langit, tombol Blink, dan pilihan aktif. Merah dan biru hanya untuk penanda piksel jenuh dan rusak.
- **Dua huruf.** IBM Plex Sans untuk teks, IBM Plex Mono untuk apa pun yang berupa bacaan alat: tanggal, panjang gelombang, koordinat, pergeseran.
- **Blink itu potong langsung.** Pergantian kunjungan tanpa pudar, karena mata menangkap gerak dari loncatan. Gerak lain hanya transisi hover 150 ms. Dengan `prefers-reduced-motion`, blink tidak mulai sendiri.
- **Jujur soal data.** Yang ditampilkan: tanggal kunjungan nyata di sumbu waktu, jumlah eksposur, pergeseran terukur beserta batas ketelitiannya, dan penanda piksel yang tidak bisa dipercaya. Kalau tidak terukur, tulis tidak terukur.

## Kosakata komponen

- Tombol: tinggi 40 px, sudut 6 px, garis tepi tipis. Hanya Blink yang berisi warna aksen.
- Pilihan (target, band, palet, kunjungan): `aria-pressed`, garis tepi atau titik aksen saat aktif.
- Keadaan: hover, fokus (garis luar aksen 2 px), aktif, nonaktif (redup, kursor terlarang), memuat, dan gagal dengan tombol coba lagi.

## Yang dihindari

Kartu di dalam kartu, ikon hias, teks pemasaran, animasi masuk halaman, dan angka tanpa satuan.
