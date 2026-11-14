# Design

## Context

Lihat `proposal.md` untuk motivasi. Keadaan setelah `pindai-gambar-32x5` task 3: `SpectrumStrip` memutar frasa sapuan (`scanGrid`/`scanPhrase`/`SCAN`), garis pindai + busur cincin dikunci jam audio (`sonifier.now()` + RAF), `onListen` memindah lensa per kunjungan. Mesin suara spektrum (`phrase`, `binVisit`, `SOUND`, `motionNote`, `blip`) masih utuh; yang hilang hanya pemicu + penggerak visual spektrum (`headRef` disembunyikan, `onHear`/`heardBand` dicabut). Grafik spektrum tetap digambar sebagai visual + pemilih band.

## Goals / Non-Goals

**Goals:**

- Satu pemilih mode di area Listen: Sapuan (bawaan) | Spektrum, dengan penggerak visual masing-masing dikunci jam audio yang sama.
- Melodi gerak mandiri dari blip live: rangkaian nada per kunjungan, lensa melangkah sinkron.
- Satu suara dalam satu waktu; pengumuman hanya pada peristiwa.

**Non-Goals:**

- Mengubah rasa `SOUND`/`MOTION`/`SCAN` (milik Alif) atau mesin `Sonifier`.
- Isyarat kecerahan antar kunjungan; pindai WISE.

## Decisions

- **Kembalikan pola lama spektrum apa adanya, jangan tulis ulang.** Pola `play` + RAF + `onListen`/`onHear` yang dicabut task 3 pada dasarnya sudah benar untuk spektrum; kembalikan sebagai cabang mode dalam komponen yang sama. Alternatif komponen terpisah ditolak: grafik, tombol, dan cincin dipakai bersama.
- **Garis pindai dan garis kepala tidak tampil bersamaan.** Masing-masing hanya visible saat modenya berjalan; `stop()` menyembunyikan keduanya. Satu `stop` bersih untuk semua mode.
- **Melodi gerak memakai `motionNote` existing per kunjungan + `blip`-style envelope lewat `schedule`.** Alternatif rangkaian `blip()` manual ditolak: `blip` fire-and-forget tanpa jadwal, tidak bisa dikunci ke lensa. Frasa nada gerak dijadwalkan seperti frasa lain (satu `Note` per kunjungan, `t` kelipatan detik per nada), lensa melangkah via `onListen` yang sama dengan All visits.
- **Kontrol melodi menempel pada tombol Motion sound existing** (mis. tekan kedua / menu putar riwayat) supaya tidak tambah tombol di dock; keputusan final bentuk kontrol saat apply. Blip live tetap untuk langkah blink manual.
- **All visits mengikuti mode aktif.** Sapuan berurutan (sudah ada) atau spektrum berurutan (pola lama), bukan campuran.

## Risks / Trade-offs

- [Blip live vs melodi membingungkan] → Mitigasi: label Guide menegaskan blip = langkah blink, melodi = putar riwayat; hanya satu yang berbunyi dalam satu waktu.
- [Spektrum 7 detik x 4 kunjungan ~30 detik] → Mitigasi: sama seperti dulu; pengguna bisa Stop kapan saja; bukan default.
- [Garis kepala + garis pindai tertukar] → Mitigasi: visibility dikendalikan mode aktif di satu tempat (`start`/`stop`).
- [Screen reader bertabrakan antar mode] → Mitigasi: satu live region, teks diganti per peristiwa, tidak per nada/kolom.

## Migration Plan

- Viewer saja; rollback = kembalikan pemilih mode ke Sapuan-saja (satu commit revert di `SpectrumStrip` + `App`).
- Setelah apply: uji dengar Epsilon Indi B (spektrum penuh), Barnard (tick-kiri/nada-kanan + melodi menanjak), RW Aur (nada acuan diam).

## Open Questions

- ~~Bentuk kontrol melodi diputuskan saat apply~~ diputuskan (task 1.1):
  tombol terpisah. Satu tombol = satu fungsi (lebih jelas untuk tunanetra):
  tombol Motion existing tetap toggle blip live per langkah blink, tombol putar
  kecil baru di sampingnya memutar melodi riwayat dari kunjungan pertama sampai
  terakhir. Tidak ada yang berbunyi barengan (spec 3.3).
