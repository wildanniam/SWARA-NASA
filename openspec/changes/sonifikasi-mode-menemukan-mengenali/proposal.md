# Proposal

## Why

Viewer sudah bisa dibunyikan (suara spektrum 48 nada per kunjungan + motif gerak satu nada per kunjungan), tetapi keduanya dirancang untuk pendengar yang melihat layar. Pendengar tunanetra tidak bisa menjawab pertanyaan paling dasar: ada yang pindah ke mana, ada yang meredup atau menerang, bagian mana dari gambar yang terang, dan benda ini memancarkan warna apa. Tanpa empat jawaban itu, klaim aksesibilitas tidak bisa diuji dan tidak boleh ditulis di submission.

## What Changes

- Menambah **Mode Gerak**: satu nada per kunjungan, pitch = Dec relatif ke kunjungan pertama (utara naik), pan = RA relatif (timur kiri), volume konstan, normalisasi per objek.
- Menambah **Mode Kecerahan**: satu nada per kunjungan, pitch = fluks ternormalisasi (naik = menerang), volume konstan, hanya pada band yang ada di semua kunjungan, plus fitur A/B dua kunjungan bergantian.
- Menambah **Mode Pindai**: 1–5 nada serentak per kolom citra display (PNG 8-bit hasil stretch), X = waktu (timur ke barat), Y = pitch (utara naik), kecerahan = volume; garis pindai di lensa.
- Mengunci ulang **Mode Spektrum** sebagai mode mengenali: 48 nada per kunjungan, waktu = panjang gelombang pendek ke panjang, pitch = fluks; binning 102 → 48 menandai lembah sempit yang terhapus sebagai lowConf.
- Menegakkan aturan keras lintas-mode: satu parameter data = satu parameter suara per mode; arah konsisten (utara naik, terang naik, timur kiri); ganti mode wajib diumumkan lewat tiga jalur (earcon + nada kalibrasi, pengumuman screen reader, label visual).
- Menyatukan kontrak data-ke-audio: bundle → bin per mode → `Note { t, dur, hz, vol, pan, lowConf }` → satu engine (`Sonifier`: satu AudioContext, stop bersih, envelope attack/release). Hanya pembuat frasa yang berbeda antar mode.
- Menambah kontrol mode: radiogroup/tablist dengan navigasi panah, shortcut Alt+G / Alt+K / Alt+P / Alt+S, Space putar/henti, akses keyboard penuh dan kontrol sentuh; tanpa tabrakan dengan shortcut existing (1–6, L, M, /, N, spasi, panah).
- Menetapkan uji pendengar minimal (2–3 orang, prioritas tunanetra/low vision; materi sintetis berjawaban diketahui + Barnard's Star nyata) dengan metrik akurasi diam/bergerak/meredup dan waktu belajar; hasil dicatat untuk submission.

## Capabilities

### New Capabilities

- `sonifikasi/mode-shell`: aturan keras lintas-mode (satu-parameter, arah konsisten, pengumuman tiga jalur), kontrak `Note` + engine tunggal, kontrol pemilih mode + shortcut, aksesibilitas screen reader/fokus, dan kriteria uji teknis.
- `sonifikasi/menemukan`: tiga mode menemukan — Gerak, Kecerahan, Pindai — masing-masing dengan pertanyaan, unit, pemetaan, normalisasi, penanganan kunjungan tanpa pengukuran (tick + pengumuman), dan pasangan visualnya.
- `sonifikasi/mengenali`: Mode Spektrum sebagai pengenal — 48 nada per kunjungan, pemetaan waktu-panjang-gelombang dan pitch-fluks, penanda lowConf untuk fitur sempit yang terhapus binning, dan pitch follower visual nada-per-nada.

### Modified Capabilities

- Tidak ada. Ini kapabilitas baru; suara existing (SOUND/MOTION di `web/src/sound/`) menjadi acuan perilaku yang dikunci, bukan spek yang diubah.

## Impact

- Kode terdampak: `web/src/sound/` (engine + pembuat frasa per mode; `mapping.ts` tetap milik Alif — perubahan rasa suara butuh persetujuannya), `web/src/App.tsx` (state mode, shortcut, pengumuman), `web/src/components/` (Lens: garis pindai/jejak berdenyut/meter terang; SpectrumStrip: pitch follower), `web/src/lib/spectrum.ts` + `bundle.ts` (binning dan agregasi per mode).
- Bentuk bundle tidak berubah (kontrak `pipeline/README.md` tetap); Mode Pindai membaca piksel PNG display dan wajib didokumentasikan sebagai taksiran, bukan fluks kalibrasi.
- Di luar scope fase ini: daftar kandidat otomatis, klaim penemuan baru, klaim aksesibilitas di submission sebelum uji pengguna selesai.
