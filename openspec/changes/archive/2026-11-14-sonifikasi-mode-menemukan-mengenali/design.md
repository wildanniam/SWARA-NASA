# Design

## Context

Lihat `proposal.md` untuk motivasi. Keadaan kini di `web/src`: `sound/sonify.ts` punya `Note { t, dur, hz, unverified, pan, lambda }`, `phrase()` 48 langkah per kunjungan, `motionNote()` satu nada dari `d_east/d_north_arcsec`, dan kelas `Sonifier` (satu AudioContext, `stop()` bersih, envelope attack/release). `sound/mapping.ts` milik Alif memegang semua rasa (skala, oktaf, gain, waveform). `lib/spectrum.ts` (`binVisit`, `fluxTop`) dan `lib/bundle.ts` (`shiftAt`, `referenceMotion`, `trail`) sudah dipakai bersama teks dan suara supaya keduanya mengatakan hal yang sama. `App.tsx` punya shortcut global (spasi, panah, 1–6, M, /, N) dan `role="status"` untuk pengumuman epoch. Lihat `specs/` untuk kontrak perilaku.

## Goals / Non-Goals

**Goals:** empat mode berbagi satu engine dan satu bentuk `Note`; tiap mode hanya menambah satu pembuat frasa + satu pasangan visual; tidak ada perubahan bentuk bundle; tidak ada tabrakan shortcut.

**Non-Goals:** perubahan rasa suara di luar aturan spek tanpa Alif; deteksi sumber otomatis / kandidat; perubahan pipeline atau format bundle.

## Decisions

- **Perluas `Note`, jangan bikin tipe baru.** Tambah `vol` dan `lowConf` ke `Note` existing (`hz: null` tetap berarti tick). Alasan: semua mode tetap frasa-nada sehingga `schedule()` dan `Sonifier.play/stop` dipakai ulang; bedanya hanya pembuat frasa. Alternatif (tipe per mode) ditolak: menggandakan penjadwalan dan risiko overlap audio.
- **Satu pembuat frasa per mode di samping `phrase()`/`motionNote()`.** `motionPhrase()` (satu nada per kunjungan dari `shiftAt`, normalisasi ke rentang objek itu), `brightnessPhrase()` (satu nada per kunjungan dari median fluks band-bersama, normalisasi ke kunjungan pertama/median), `scanPhrase()` (top-N puncak per kolom dari piksel PNG display via canvas offscreen, dibaca sekali lalu di-cache per frame), `spectrumPhrase()` = `phrase()` existing + penanda lowConf per bin. Alasan: kontrak ke audio seragam; pengujian bisa membandingkan frasa tanpa Web Audio.
- **Rasa tetap di `mapping.ts`, arti dikunci di spek.** Rentang pitch, skala, earcon, nada kalibrasi, dan timbre lowConf didefinisikan sebagai parameter di `mapping.ts` (wilayah Alif); mode hanya memetakan data ke parameter. Alasan: mematuhi aturan repo (AI tidak mengubah `web/src/sound/` tanpa diminta — implementasi fase ini butuh persetujuan Alif per perubahan).
- **Normalisasi per objek, bukan global.** Rentang Gerak = pergeseran maks objek itu; rentang Kecerahan = kunjungan pertama/median objek itu; Pindai = kecerahan kolom relatif frame itu. Alasan: piksel 6,15″ dan gerak ~1 piksel tidak terdengar pada skala global; disepakati di spek 14 Nov 2026. Konsekuensinya (antar-benda tidak sebanding) didokumentasikan di UI, bukan disembunyikan.
- **Band pembanding Kecerahan = irisan semua kunjungan.** Dipilih sekali per objek (prioritas jangkauan D5/D6 yang paling jarang jenuh, lalu cakupan). Kunjungan tanpa band itu = tick + pengumuman. Alasan: satu-satunya cara pitch antar-kunjungan jujur; alternatif (interpolasi band hilang) ditolak karena mengarang data.
- **Earcon + kalibrasi disintesis, bukan sampel.** Tiap mode punya motif 3–4 nada pendek dari osilator yang sama, lalu nada kalibrasi min–maks memakai pemetaan mode itu. Alasan: nol aset, selalu selaras dengan rasa `mapping.ts`, dan kalibrasi sekaligus tes dengar ("ini bunyi terendah–tertinggi mode ini").
- **Kontrol = radiogroup + shortcut Alt, bukan tombol lepas.** Satu `radiogroup` (navigasi panah bawaan) untuk empat mode; Alt+G/K/P/S dan Space; tombol sentuh besar di HP memakai state yang sama. Alasan: pola ARIA standar memberi keyboard dan screen reader gratis; Alt+huruf tidak dipakai shortcut existing.
- **Visual pasangan minimal, di komponen existing.** Lens: garis pindai (Pindai), titik berdenyut (Gerak), meter terang (Kecerahan); SpectrumStrip: pitch follower (Spektrum). Alasan: tidak ada komponen baru; DESIGN.md (cincin lensa sebagai penunjuk suara) tetap berlaku.

## Risks / Trade-offs

- [Risk] Pindai dari PNG 8-bit bisa terdengar meyakinkan padahal taksiran → Mitigasi: label "taksiran dari citra display" di UI dan spek; volume tidak pernah dipakai mode lain sebagai data kuantitatif.
- [Risk] Earcon + kalibrasi tiap ganti mode memperlambat eksplorasi cepat → Mitigasi: kalibrasi penuh hanya saat ganti mode; ganti epoch hanya mengumumkan nama epoch.
- [Risk] `AudioContext` di HP terkunci sampai gestur pengguna → Mitigasi: engine existing sudah lazy-init saat tombol pertama; semua putar berasal dari gestur; uji di HP masuk kriteria.
- [Risk] Perdebatan rasa (skala, timbre lowConf) menghambat implementasi → Mitigasi: batas tegas — pemetaan arti dikunci spek ini, rasa di `mapping.ts` diputuskan Alif.

## Migration Plan

Murni aditif di depan bundle statis: mode baru di balik pemilih mode, suara lama tetap jalan selama transisi (M tetap motif lama sampai Mode Gerak lolos uji). Rollback = sembunyikan pemilih mode, tidak ada migrasi data.

## Open Questions

- Bentuk earcon tiap mode (ditentukan Alif bersama uji pendengar, tidak mengubah spek).
- Ambang top-N dan ambang lembah lowConf numerik (ditetapkan dari data sintetis saat implementasi, dicatat di submission).
