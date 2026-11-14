# Proposal

## Why

Listen sekarang hanya memutar sapuan gambar (tata letak medan). Dua suara yang menjawab pertanyaan discovery lain hilang: suara spektrum 48 nada (kondisi objek: panas/dingin, berdisk, serapan atmosfer) yang pemicunya diganti sapuan di `pindai-gambar-32x5`, dan riwayat gerak antar kunjungan yang selama ini hanya satu blip sesaat per blink sehingga "pindah ke mana" tidak terdengar dalam sekali dengar.

## What Changes

- Mengembalikan suara spektrum 48 nada per kunjungan sebagai mode kedua di area Listen (pemilih mode: Sapuan | Spektrum, bawaan Sapuan). Semua mesinnya (`phrase`, `binVisit`, `SOUND`) masih ada; yang dikembalikan hanya pemicu + penggerak visualnya (garis kepala grafik, busur cincin, lensa ikut band yang terdengar).
- Menambah melodi gerak: satu tombol memutar satu nada per kunjungan dari pertama sampai terakhir (pitch = utara-selatan vs acuan, pan = timur-barat, tanpa pengukuran = tick), lensa melangkah mengikuti kunjungan yang berbunyi. Blip live saat blink tetap apa adanya.
- Aturan bunyi bersama: satu suara dalam satu waktu (sapuan/spektrum/melodi saling menghentikan), pengumuman screen reader hanya pada peristiwa (mulai, target/kunjungan, selesai).

## Capabilities

### New Capabilities

- `sonifikasi/mode-spektrum`: mode spektrum 48 nada per kunjungan — pemicu mode, garis kepala + busur sinkron jam audio, lensa ikut band terdengar, perilaku All visits, dan panduan baca bentuk melodi (naik = dingin/berdisk, lembah = serapan, tick = tanpa data, timbre kasar = jenuh).
- `sonifikasi/mode-gerak`: melodi gerak antar kunjungan — satu nada per kunjungan berurutan, normalisasi absolut yang sama dengan blip existing (1 detik busur per tangga), lensa melangkah sinkron, tick untuk kunjungan tanpa pengukuran.

### Modified Capabilities

- Tidak ada. Sapuan gambar (`sonifikasi/pindai-gambar`, masih in-progress) tidak diubah perilakunya; change ini hanya menambah pilihan mode di sebelahnya.

## Impact

- Kode terdampak: `web/src/components/SpectrumStrip.tsx` (pemilih mode + penggerak visual per mode), `web/src/App.tsx` (state mode, gerak lensa saat melodi), `web/src/sound/` (rangkaian nada melodi; angka rasa `SOUND`/`MOTION` milik Alif tidak diubah nilainya).
- Bentuk bundle tidak berubah; tidak ada perubahan API.
- Di luar scope: isyarat kecerahan antar kunjungan (diusulkan terpisah), klaim aksesibilitas sebelum uji dengar.
