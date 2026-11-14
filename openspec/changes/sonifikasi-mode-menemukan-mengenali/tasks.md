# Tasks

## 1. Kontrak Note dan engine tunggal

- [x] 1.1 Perluas `Note` dengan `vol` dan `lowConf`, dukung gain per nada + timbre penanda di `schedule()`; verifikasi: uji render luring mencatat gain/timbre per nada sesuai `lowConf` tanpa klik (attack/release utuh).
- [x] 1.2 Kunci perilaku stop-bersih dan tick-pengumuman (`hz: null` → tick + teks kunjungan); verifikasi: uji memainkan frasa lalu frasa baru — tidak ada sumber lama yang tersisa dan kunjungan tanpa data berbunyi tick.
- [x] 1.3 Dokumentasikan kontrak `Note` di `pipeline/README.md` (kontrak audio) dan verifikasi perintah contoh tetap jalan; catat bahwa bentuk bundle tidak berubah.

## 2. Mode-shell: pengumuman, kontrol, aksesibilitas

- [x] 2.1 Implementasikan earcon khas + nada kalibrasi min–maks per mode (parameter di `mapping.ts`, persetujuan Alif); verifikasi: ganti mode empat kali — tiap kali earcon berbeda lalu kalibrasi rendah-tinggi terdengar.
- [x] 2.2 Implementasikan pemilih mode radiogroup/tablist + shortcut Alt+G/K/P/S dan Space, tanpa tabrakan 1–6/L/M///N/panah; verifikasi: uji keyboard (Tab, panah, tiap shortcut) dan konfirmasi shortcut lama tetap berfungsi.
- [x] 2.3 Implementasikan pengumuman tiga jalur (suara, `role="status"` screen reader, label visual + penanda pasangan); verifikasi: ganti mode dan ganti epoch — screen reader mengumumkan teks spek dan label visual cocok dengan mode aktif.
- [x] 2.4 Tambahkan kontrol sentuh setara dan urutan tab logis + fokus jelas; verifikasi: alur discovery selesai di HP (sentuh saja) dan lolos cek fokus/tab keyboard.

## 3. Mode Gerak

- [ ] 3.1 Implementasikan `motionPhrase()` dari `shiftAt()` (pitch Dec relatif, pan RA relatif timur-kiri, volume konstan, normalisasi rentang objek, jeda seragam); verifikasi: Barnard's Star nada akhir jelas lebih tinggi; RW Aurigae semua nada sama + teks "tidak bergeser".
- [ ] 3.2 Implementasikan titik jejak berdenyut sinkron di Lens; verifikasi: putar Gerak — titik kunjungan aktif berdenyut bersama nadanya, diam di objek tak-terlacak.

## 4. Mode Kecerahan

- [ ] 4.1 Implementasikan pemilihan band-irisan + toleransi diam + `brightnessPhrase()` (pitch dari fluks ternormalisasi kunjungan pertama/median, volume konstan; selisih < `max(batas_bawah, 2×S)` = nada acuan + pengumuman diam; kunjungan tanpa band = tick + pengumuman); verifikasi: data sintetis di bawah toleransi terdengar sama dengan acuan; penurunan RW Aurigae 4–5 mikron terbukti melewati toleransi lalu terdengar turun (kalau tidak lewat, klaim "terdengar turun" dikoreksi); kunjungan tanpa band berbunyi tick + teks alasan.
- [ ] 4.2 Implementasikan meter terang sinkron + A/B dua kunjungan bergantian dengan pengumuman "A"/"B"; verifikasi: putar A/B — meter dan pengumuman mengikuti giliran sampai dihentikan.

## 5. Mode Pindai

- [ ] 5.1 Implementasikan ekstraksi top-N puncak per kolom dari PNG display (cache per frame) + `scanPhrase()` (X = waktu timur-ke-barat, Y = pitch utara-naik, kecerahan = volume); verifikasi: sumber tunggal tengah terdengar satu nada pitch-tengah volume-keras selaras garis pindai.
- [ ] 5.2 Implementasikan garis pindai sinkron di Lens + teks kejujuran ("taksiran dari citra display, bukan fluks kalibrasi"); verifikasi: garis dan kolom yang berbunyi cocok; teks penjelasan memuat peringatan itu.

## 6. Mode Spektrum

- [ ] 6.1 Implementasikan penanda lowConf pada binning 102 → 48 (lembah sempit terhapus) + timbre penanda tanpa mengubah pitch; verifikasi: data sintetis dengan lembah sempit — nadanya bertanda tetapi pitch tetap mengikuti fluks bin, dan angka mentah terbaca di teks.
- [ ] 6.2 Implementasikan pitch follower nada-per-nada di SpectrumStrip; verifikasi: saat nada ke-N berbunyi, penanda menunjuk langkah ke-N dengan label panjang gelombang yang benar (Epsilon Indi B: 48 nada utuh).

## 7. Uji pendengar dan submission

- [ ] 7.1 Siapkan materi uji (sintetis berjawaban diketahui: diam/bergerak/meredup + satu kasus nyata Barnard's Star) dan jalankan uji teknis (tanpa klik/pop, tanpa overlap, HP); verifikasi: checklist lolos untuk keempat mode.
- [ ] 7.2 Jalankan uji pendengar 2–3 orang (prioritas tunanetra/low vision), ukur akurasi "pindah ke mana / meredup atau menerang" + waktu belajar, catat hasil untuk submission; verifikasi: peserta membedakan diam/bergerak/meredup hanya dengan dengar, tanpa klaim aksesibilitas sebelum hasil ada.
