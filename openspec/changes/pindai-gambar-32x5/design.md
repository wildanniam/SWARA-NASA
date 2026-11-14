# Design

## Context

Lihat `proposal.md` untuk motivasi. Keadaan sekarang: Listen memutar 48 nada spektrum per kunjungan (`SpectrumStrip.tsx` + `sonify.phrase` + `binVisit`), garis kepala grafik + busur cincin + ganti band sudah dikunci ke jam audio (`sonifier.now()` + RAF). Lensa melukis PNG display 480x480 6 menit busur lewat `paint.ts` (abu 8-bit + LUT palet, tone WISE lama di `tone.ts`, gamma Reveal). Mask `_mask.png` tersedia per frame (0/128/255). Tidak ada perubahan bundle: PNG + mask sudah ada.

## Goals / Non-Goals

**Goals:**

- Satu sapuan puncak 32 kolom x hingga 5 nada dari piksel display kunjungan tampil, di medan 6 menit busur tetap.
- Mata dan telinga satu barang: lensa dipaksa ke 6 menit busur (Opsi A), garis pindai dikunci jam audio.
- Bunyi stabil antar look; flag jujur terdengar.

**Non-Goals:**

- Pindai WISE, sapuan kontur, perbandingan A/B antar kunjungan.
- Deteksi sumber otomatis / katalog baru; ambang puncak hanya untuk sonifikasi.
- Mengubah kontrak bundle (`pipeline/README.md`) atau API.

## Decisions

- **Opsi A (paksa 6 menit busur), bukan ikuti zoom.** Alternatif mengikuti `viewArcsec` ditolak karena user memilih medan tetap: satu sapuan = satu medan yang sama, mudah dibandingkan antar kunjungan dan antar objek. Konsekuensi: Listen dari zoom 2 menit busur memindahkan lensa dulu.
- **32 kolom x hingga 5 nada, langsung.** Alternatif mulai 24x3 ditolak user; 32x5 diambil sebagai target uji pertama. Kolom disampel di koordinat langit (detik busur), bukan indeks piksel, supaya stabil antar teleskop dan zoom.
- **Sumber = abu display setelah tone, sebelum palet.** Alternatif baca FITS/kalibrasi ditolak: tidak tersedia di viewer dan lambat. Display 8-bit cukup untuk tata letak; didokumentasikan sebagai taksiran, bukan fotometri. Keras = terang data agar Paper tidak membalik bunyi.
- **Gunakan ulang pola jam audio spektrum.** `sonifier.play()` menjadwalkan frasa, RAF membaca `sonifier.now()` untuk garis pindai SVG di `lens-marks` (seperti `headRef`), bukan repaint canvas. Stop bersih dan `busy` dipakai supaya motif gerak tidak bertumpuk.
- **Ekstraksi puncak di kolom dari downsample kasar.** Alternatif pindai 480px penuh ditolak karena derau dan biaya; ambang + pencari puncak lokal di atas citra yang sudah di-downsample (orde 16-32px per kolom) lalu dipetakan ke pitch 1-5 nada terkuat.
- **Rasa suara tetap lewat `sound/mapping.ts`.** AGENTS.md: file itu milik Alif. Change ini menambah parameter pindai sebagai entri baru yang diusulkan, nilai final disetel Alif; engine tidak diubah.

## Risks / Trade-offs

- [5 nada serentak sulit dipilah] → Mitigasi: uji dengar di 5 preset; fallback ke 3 nada tanpa ubah spec (masih "hingga 5").
- [Ambang salah: derau ikut bunyi / bintang hilang] → Mitigasi: ukur distribusi terang kolom di 5 preset saat implementasi; ambang per objek per band.
- [Paper membalik ekspektasi visual] → Mitigasi: keras dari terang data, bukan putih layar; disebut di Guide.
- [Garis pindai vs `prefers-reduced-motion`] → Mitigasi: lompat per kolom, suara penuh.
- [Screen reader bertabrakan dengan frasa] → Mitigasi: umumkan hanya ganti kunjungan + earcon target, bukan tiap kolom.

## Migration Plan

- Viewer saja, tanpa migrasi data; bundle lama tetap bisa dibuka. Rollback: kembalikan pemicu Listen ke frasa spektrum (satu commit revert di komponen pemicu + garis pindai).
- Setelah apply: uji dengar manual di Barnard's Star (gerak), Epsilon Indi B (sasaran suara), RW Aurigae (variabel terang) sebelum klaim apa pun di submission.

## Open Questions

- Ambang puncak dan normalisasi volume per objek per band: sudah diukur, lihat
  `measurements.md` (thr = bg + 4*sig, top = min(255, p98*1.25)).
- ~~Posisi pemicu Listen diputuskan saat apply~~ diputuskan (task 1.2):
  tombol Listen existing diganti menjadi pemicu sapuan gambar (suara spektrum
  48 nada dihapus dari tombol itu), dan tombol All visits memutar sapuan tiap
  kunjungan berurutan dari yang pertama sampai yang tampil.
