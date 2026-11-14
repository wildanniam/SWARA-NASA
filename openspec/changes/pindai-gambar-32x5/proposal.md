# Proposal

## Why

Listen sekarang membunyikan spektrum apertur pusat (5x5 piksel tengah), bukan isi gambar yang tampil di lensa. Pendengar tunanetra bisa tahu bentuk spektrum, tetapi tidak bisa menjawab pertanyaan paling dasar tentang gambarnya: medannya ramai atau sepi, ada berapa sumber, di mana, dan mana targetnya. Gambar dan suara belum satu kursor di level spasial.

## What Changes

- Mengunci **Listen hanya untuk data SPHEREx**. Riwayat WISE tetap visual saja (tanpa spektrum, tanpa mask, tanpa skala terang yang sebanding).
- Mengganti isi Listen menjadi **satu sapuan puncak dari gambar** (bukan 48 nada spektrum): 32 kolom melintasi medan 6 menit busur tetap, hingga 5 nada serentak per kolom untuk puncak terkuat.
- **Opsi A: lensa dipaksa ke 6 menit busur** saat Listen ditekan; blink berhenti; sapuan berbunyi dari gambar yang sedang tampil (band + kunjungan itu).
- Pemetaan tetap: X = waktu (timur ke barat, kiri ke kanan), Y = pitch (utara naik), terang = volume. Keras = terang data (nilai abu display setelah tone, sebelum palet), supaya bunyi stabil antar look termasuk Paper.
- Tiap sapuan mengumumkan target (earcon saat melewati tengah), menandai kolom berflag (jenuh/rusak dari `_mask.png`) dengan timbre beda, dan memainkan tick pelan untuk kolom tanpa puncak.
- Garis pindai vertikal di lensa digerakkan jam audio yang sama dengan suara (pola `sonifier.now()` + RAF seperti garis kepala spektrum).

## Capabilities

### New Capabilities

- `sonifikasi/pindai-gambar`: sapuan puncak 32x5 dari citra display SPHEREx 6 menit busur — pemetaan kolom-ke-nada, normalisasi per objek per band, earcon tengah, timbre flag, tick kolom kosong, garis pindai sinkron jam audio, dan aturan kejujuran display-vs-kalibrasi.

### Modified Capabilities

- Tidak ada. Ini kapabilitas baru; suara spektrum dan motif gerak existing tetap apa adanya sampai change ini di-apply.

## Impact

- Kode terdampak: `web/src/components/SpectrumStrip.tsx` (atau pemicu Listen), `web/src/components/Lens.tsx` (garis pindai), `web/src/lib/paint.ts` + `web/src/lib/images.ts` (baca piksel display), `web/src/sound/` (pembuat frasa pindai + engine; `mapping.ts` rasa milik Alif — perubahan angka rasa butuh persetujuannya, sesuai AGENTS.md).
- Bentuk bundle tidak berubah (kontrak `pipeline/README.md` tetap); pindai membaca PNG display + mask yang sudah ada dan didokumentasikan sebagai taksiran, bukan fluks kalibrasi.
- Di luar scope: pindai WISE, sapuan kontur, mode A/B antar kunjungan, klaim aksesibilitas di submission sebelum uji dengar.
