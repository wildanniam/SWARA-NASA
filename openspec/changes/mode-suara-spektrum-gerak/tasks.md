# Tasks

## 1. Keputusan kontrol melodi

- [x] 1.1 Tetapkan bentuk kontrol melodi gerak (tombol terpisah vs aksi sekunder pada tombol Motion sound) dan perilaku default mode; verifikasi: keputusan tertulis satu paragraf di change sebelum grup 2 dimulai

## 2. Mode Spektrum kembali

- [x] 2.1 Kembalikan pemicu frasa spektrum 48 nada di mode Spektrum (pemilih Sapuan | Spektrum, bawaan Sapuan) dan verifikasi: beralih mode menghentikan suara berjalan dan Listen berikutnya memutar mode aktif
- [x] 2.2 Kembalikan penggerak visual spektrum (garis kepala nada-per-nada, busur cincin, lensa ikut band terdengar) terkunci jam audio dan verifikasi: garis di langkah ke-N saat nada ke-N berbunyi; garis pindai tidak tampil bersamaan
- [x] 2.3 All visits mode Spektrum memutar kunjungan berurutan dengan lensa mengikuti dan verifikasi: Epsilon Indi B terdengar penuh 48 nada per kunjungan, Barnard tick-kiri/nada-kanan

## 3. Melodi gerak

- [x] 3.1 Implementasikan frasa melodi (satu nada per kunjungan via `motionNote`, tick untuk tanpa pengukuran) dijadwalkan lewat engine existing dan verifikasi: uji unit urutan nada + stop bersih lolos, `tsc` bersih
- [x] 3.2 Lensa melangkah sinkron dengan nada (pakai pola `onListen`), blink berhenti, pengumuman peristiwa saja dan verifikasi: Barnard terdengar menanjak dengan lensa mengikuti; objek diam berbunyi nada acuan
- [x] 3.3 Satu-suara-dalam-satu-waktu: memulai mode apa pun menghentikan yang berjalan (sapuan/spektrum/melodi/blip live) dan verifikasi: tidak ada nada bertumpuk pada uji putar-henti-ganti cepat

## 4. Kejujuran dan verifikasi akhir

- [x] 4.1 Perbarui Guide: cara baca melodi spektrum vs sapuan vs melodi gerak + kapan tiap mode dipakai dan verifikasi: teks terbaca di Guide, tanpa klaim aksesibilitas baru
- [ ] 4.2 Uji dengar manual Epsilon Indi B, Barnard, RW Aur untuk kedua mode + melodi dan verifikasi: pendengar bisa membedakan ketiga suara dan menyebut fungsinya tanpa melihat layar
