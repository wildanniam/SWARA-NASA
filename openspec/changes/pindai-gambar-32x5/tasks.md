# Tasks

## 1. Ukur ambang dari preset

- [x] 1.1 Ukur distribusi terang kolom 32 di 5 preset (Barnard, Eps Indi B, RW Aur, WISE 0855, R Dra) per band dan tetapkan ambang puncak + normalisasi per objek per band; verifikasi: tabel angka tercatat di change dan tidak ada kolom yang 100% kosong atau 100% penuh di Eps Indi B
- [x] 1.2 Tetapkan posisi pemicu Listen (ganti tombol Listen spektrum vs tombol terpisah) dan perilaku "All visits"; verifikasi: keputusan tertulis satu paragraf di change sebelum grup 3 dimulai

## 2. Frasa pindai 32x5

- [x] 2.1 Implementasikan ekstraksi puncak per kolom dari abu display setelah tone sebelum palet (maks 5 puncak, tick untuk kolom kosong, flag mask untuk timbre, earcon tengah) dan verifikasi: uji unit dengan citra sintetis (satu titik, tiga titik, kosong, berflag) lolos
- [x] 2.2 Tambahkan parameter rasa pindai (kolom, nada maks, durasi, ambang, timbre flag, tick, earcon) sebagai usulan di `sound/mapping.ts` dan verifikasi: nilai default terdokumentasi dan tidak mengubah rasa spektrum/gerak existing (uji dengar existing tetap sama)
- [x] 2.3 Jadwalkan frasa pindai lewat engine existing (satu AudioContext, stop bersih, tanpa tumpuk dengan motif gerak) dan verifikasi: putar-henti-putar cepat tidak menumpuk nada (cek manual + tidak ada error console)

## 3. Integrasi viewer

- [x] 3.1 Tekan Listen memaksa lensa ke 6 menit busur, menghentikan blink, dan memindai band+kunjungan tampil; WISE dialihkan ke kunjungan SPHEREx terdekat; verifikasi: dari zoom 2' dan dari citra WISE, lensa berakhir di 6' SPHEREx dan sapuan berbunyi
- [x] 3.2 Gambar garis pindai vertikal di `lens-marks` yang dikunci jam audio (`sonifier.now()` + RAF) kolom-per-kolom timur-ke-barat dan verifikasi: garis di kolom ke-N saat nada kolom ke-N berbunyi (cek visual + reduced-motion melompat per kolom)
- [x] 3.3 Umumkan ke screen reader hanya pada peristiwa (mulai sapuan, earcon target, selesai) tanpa mengganggu frasa dan verifikasi: lolos tab keyboard penuh + tidak ada pengumuman tiap kolom

## 4. Kejujuran dan verifikasi akhir

- [ ] 4.1 Tulis catatan kejujuran display-vs-kalibrasi di Guide + label timbre flag dan verifikasi: teks terbaca di Guide dan menyebut Paper tidak mengubah bunyi
- [ ] 4.2 Uji dengar manual di Barnard's Star (pindah), Epsilon Indi B (sasaran suara), RW Aurigae (terang berubah) dan verifikasi: pendengar bisa menunjuk target tengah dan membedakan ramai vs sepi tanpa melihat layar
