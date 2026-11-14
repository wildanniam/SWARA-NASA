# Spec Delta

## Purpose

Aturan lintas-mode yang membuat empat mode suara dapat diandalkan telinga: satu arti per mode, arah yang konsisten, pengumuman ganti mode lewat tiga jalur, satu kontrak nada, dan kontrol yang bisa dipakai tunanetra tanpa mouse.

## ADDED Requirements

### Requirement: Satu parameter per mode

Dalam satu mode, setiap parameter suara SHALL menyandikan tepat satu parameter data. Pitch, volume, pan, dan waktu tidak boleh dipakai ganda dengan arti berbeda di dalam mode yang sama.

#### Scenario: Arti tunggal di Mode Gerak

- **WHEN** pengguna mendengar Mode Gerak
- **THEN** pitch selalu berarti utara-selatan, pan selalu berarti timur-barat, dan volume tidak membawa informasi

#### Scenario: Arti tunggal di Mode Kecerahan

- **WHEN** pengguna mendengar Mode Kecerahan
- **THEN** pitch selalu berarti terang, dan volume serta pan tidak membawa informasi

### Requirement: Arah konsisten lintas mode

Utara SHALL terdengar lebih tinggi, terang SHALL terdengar lebih tinggi, dan timur SHALL terdengar lebih kiri di semua mode yang memakai dimensi itu.

#### Scenario: Utara naik di Gerak dan Pindai

- **WHEN** objek bergeser ke utara antar kunjungan (Mode Gerak) atau kolom terang ada di atas (Mode Pindai)
- **THEN** nadanya lebih tinggi dibanding acuan atau dibanding kolom bawah

#### Scenario: Timur kiri di Gerak dan Pindai

- **WHEN** objek bergeser ke timur (Mode Gerak) atau pindai mencapai sisi timur citra (Mode Pindai)
- **THEN** suaranya terdengar dari kiri

### Requirement: Pengumuman ganti mode tiga jalur

Setiap perpindahan mode SHALL mengumumkan arti suara yang baru lewat tiga jalur sekaligus: earcon khas mode plus nada kalibrasi terendah-tertinggi, pengumuman screen reader, dan label visual mode aktif dengan penanda pasangannya.

#### Scenario: Ganti ke Mode Gerak

- **WHEN** pengguna memilih Mode Gerak
- **THEN** sistem memainkan earcon Gerak lalu nada kalibrasi rendah-tinggi, mengumumkan "Mode Gerak: satu nada per kunjungan, utara lebih tinggi" ke screen reader, dan menampilkan label Mode Gerak yang aktif

#### Scenario: Tidak ada ganti diam-diam

- **WHEN** mode berubah karena sebab apa pun termasuk shortcut keyboard
- **THEN** ketiga jalur pengumuman tetap berbunyi, tampil, dan terbaca

### Requirement: Deteksi lemah terdengar berbeda

Nada dengan penanda lowConf SHALL terdengar berbeda dari deteksi kuat pada parameter suara yang sama (misalnya timbre atau tekstur berbeda), tanpa mengubah pitch yang menyandikan data.

#### Scenario: Lembah binning yang terhapus

- **WHEN** frasa Spektrum memuat bin yang menandai lembah sempit terhapus sebagai lowConf
- **THEN** nada itu memakai timbre penanda tetapi pitch-nya tetap mengikuti fluks bin tersebut

### Requirement: Kontrak Note dan engine tunggal

Semua mode SHALL menghasilkan frasa sebagai daftar `Note { t, dur, hz, vol, pan, lowConf }` dan memutarnya lewat satu engine: satu AudioContext, stop bersih sebelum frasa baru, envelope attack/release tanpa klik.

#### Scenario: Ganti frasa tanpa tumpuk

- **WHEN** pengguna memulai frasa baru saat frasa lama masih berbunyi
- **THEN** suara lama berhenti bersih dan frasa baru mulai tanpa nada bertumpuk atau bunyi klik

#### Scenario: Kunjungan tanpa pengukuran

- **WHEN** suatu kunjungan tidak punya pengukuran untuk mode itu
- **THEN** sistem memainkan tick pendek plus pengumuman "tanpa pengukuran", bukan nada diam atau nada data

### Requirement: Kontrol mode keyboard dan sentuh

Pemilih mode SHALL berupa radiogroup/tablist dengan navigasi panah; shortcut Alt+G (Gerak), Alt+K (Kecerahan), Alt+P (Pindai), Alt+S (Spektrum), dan Space putar/henti; seluruh alur discovery SHALL bisa selesai tanpa mouse, dan kontrol sentuh setara tersedia di HP.

#### Scenario: Navigasi panah antar mode

- **WHEN** fokus ada di pemilih mode dan pengguna menekan panah kiri/kanan
- **THEN** fokus dan mode aktif berpindah ke mode sebelahnya dan pengumuman tiga jalur berjalan

#### Scenario: Tanpa tabrakan shortcut

- **WHEN** pengguna menekan 1–6, L, M, /, N, panah, atau spasi di luar kolom isian
- **THEN** perilaku existing-nya (band, suara gerak lama selama masa transisi, dialog, blink) tetap berjalan dan tidak memicu ganti mode

### Requirement: Aksesibilitas pendengaran dan pembacaan

Perubahan mode dan epoch SHALL diumumkan ke screen reader; angka eksak (RA/Dec, flux, epoch) SHALL bisa dibaca lewat teks; fokus SHALL jelas dan urutan tab logis; target SHALL tercapai: seluruh alur discovery selesai tanpa melihat layar.

#### Scenario: Epoch dibacakan

- **WHEN** kunjungan aktif berpindah dalam mode apa pun
- **THEN** screen reader mengumumkan label epoch (misalnya tanggal kunjungan) beserta status pengukurannya
