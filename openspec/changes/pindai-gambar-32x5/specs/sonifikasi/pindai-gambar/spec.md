# Spec Delta

## Purpose

Sapuan suara dari citra display SPHEREx 6 menit busur supaya pendengar tunanetra bisa membayangkan tata letak medan: keramaian, posisi sumber, dan letak target.

## ADDED Requirements

### Requirement: Listen hanya untuk SPHEREx

Listen SHALL memindai citra SPHEREx kunjungan tampil saja. Riwayat WISE tidak dibunyikan dan tidak mengubah perilaku Listen.

#### Scenario: WISE tetap bisu

- **WHEN** pengguna membuka rentang "16 years" dan menekan Listen pada citra WISE
- **THEN** sistem memaksa lensa ke kunjungan SPHEREx terdekat di 6 menit busur lalu memindai citra itu, bukan citra WISE

#### Scenario: Tanpa frame SPHEREx

- **WHEN** kunjungan tampil tidak punya frame pada band itu
- **THEN** Listen nonaktif dengan penjelasan, bukan bunyi diam atau pindai citra lain

### Requirement: Lensa ke 6 menit busur dan blink berhenti

Menekan Listen SHALL memaksa lensa ke medan penuh 6 menit busur, menghentikan blink, dan memindai gambar yang tampil (band + kunjungan itu) sampai sapuan selesai atau dihentikan.

#### Scenario: Listen dari zoom 2 menit busur

- **WHEN** pengguna menekan Listen saat lensa di 2 menit busur
- **THEN** lensa membuka ke 6 menit busur dulu, blink berhenti, lalu sapuan berbunyi

#### Scenario: Hentikan sapuan

- **WHEN** pengguna menekan Stop di tengah sapuan
- **THEN** suara berhenti bersih dan lensa tetap di 6 menit busur pada kunjungan yang sama

### Requirement: Geometri sapuan 32 kolom hingga 5 puncak

Satu sapuan SHALL terdiri dari 32 kolom dari timur ke barat melintasi medan 6 menit busur penuh, masing-masing membunyikan hingga 5 nada serentak untuk puncak terkuat di kolom itu.

#### Scenario: Medan ramai

- **WHEN** kolom memuat tiga sumber terpisah di atas ambang
- **THEN** terdengar tiga nada serentak dengan pitch sesuai posisi utara-selatan masing-masing

#### Scenario: Kolom kosong

- **WHEN** kolom tidak punya puncak di atas ambang
- **THEN** sistem memainkan tick pelan penanda waktu berjalan, bukan nada data

### Requirement: Pemetaan suara stabil antar look

Pitch SHALL menyandikan utara-selatan (utara naik), waktu menyandikan timur-barat, dan volume menyandikan terang data (nilai abu display setelah tone, sebelum palet). Normalisasi volume memakai rentang per objek per band, sama untuk semua kunjungan.

#### Scenario: Ganti look tidak mengubah bunyi

- **WHEN** pengguna mengganti look (mis. Ember ke Paper) lalu memutar sapuan yang sama
- **THEN** urutan dan volume relatif nada tetap sama

#### Scenario: Kunjungan yang meredup

- **WHEN** objek meredup antar kunjungan pada band yang sama
- **THEN** sapuan kunjungan yang lebih redup terdengar lebih pelan dengan posisi nada yang sama

### Requirement: Target terdengar dan flag jujur

Sapuan SHALL mengumumkan posisi target dengan earcon saat kolom pindai melewati tengah medan, dan kolom yang memuat piksel jenuh atau rusak SHALL terdengar bertimbre beda tanpa mengubah pitch datanya.

#### Scenario: Melewati target

- **WHEN** kolom pindai mencapai kolom tengah (posisi target)
- **THEN** terdengar earcon pendek berbeda dari nada data plus pengumuman screen reader "target"

#### Scenario: Kolom berflag

- **WHEN** puncak kolom berasal dari piksel bertanda jenuh atau rusak di mask
- **THEN** nadanya memakai timbre penanda tetapi pitch-nya tetap mengikuti posisi dan terang

### Requirement: Garis pindai sinkron jam audio

Garis pindai vertikal di lensa SHALL bergerak mengikuti jam audio yang sama dengan suara (bukan pewaktu layar), kolom-per-kolom, dari timur ke barat.

#### Scenario: Ikuti bunyi

- **WHEN** nada kolom ke-20 sedang berbunyi
- **THEN** garis pindai tampil di kolom ke-20

#### Scenario: Gerak dikurangi

- **WHEN** pengguna memakai `prefers-reduced-motion`
- **THEN** garis melompat per kolom tanpa animasi luncur, tetapi suara tetap penuh
