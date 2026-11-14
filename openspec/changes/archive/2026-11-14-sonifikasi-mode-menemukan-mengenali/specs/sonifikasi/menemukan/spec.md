# Spec Delta

## Purpose

Tiga mode yang menjawab pertanyaan menemukan hanya lewat telinga: benda pindah ke mana (Gerak), meredup atau menerang (Kecerahan), dan bagian mana dari gambar yang terang (Pindai), masing-masing dengan satu unit bunyi dan pasangan visualnya.

## ADDED Requirements

### Requirement: Mode Gerak satu nada per kunjungan

Mode Gerak SHALL memainkan satu nada per kunjungan dengan pitch dari Dec relatif ke kunjungan pertama, pan dari RA relatif (timur kiri), volume konstan, dan jeda antar-nada yang seragam; normalisasi memakai rentang pergeseran objek itu, bukan rentang global.

#### Scenario: Barnard's Star ke utara

- **WHEN** pengguna memutar Mode Gerak pada Barnard's Star dari kunjungan pertama ke terakhir
- **THEN** nada terakhir terdengar jelas lebih tinggi (sekitar +9,9″ utara) dengan pan mendekati tengah

#### Scenario: Objek diam

- **WHEN** pengguna memutar Mode Gerak pada objek yang tidak bergeser di luar toleransi (misalnya RW Aurigae)
- **THEN** semua nada terdengar pada pitch dan pan yang sama (nada acuan), dan teks menyatakan tidak ada pergeseran

#### Scenario: Titik jejak berdenyut

- **WHEN** Mode Gerak memutar kunjungan ke-N
- **THEN** titik jejak kunjungan ke-N di lensa berdenyut sinkron dengan nadanya

### Requirement: Mode Kecerahan satu nada per kunjungan

Mode Kecerahan SHALL memainkan satu nada per kunjungan dengan pitch dari fluks ternormalisasi terhadap kunjungan pertama atau median objek itu (naik = menerang), volume konstan, hanya dibandingkan pada band yang ada di semua kunjungan; kunjungan tanpa band itu mendapat tick plus pengumuman.

#### Scenario: Menerang antar kunjungan

- **WHEN** fluks objek naik antar kunjungan pada band pembanding (misalnya RW Aurigae terang di 4–5 mikron lalu turun)
- **THEN** pitch mengikuti arah terang: kunjungan yang lebih terang terdengar lebih tinggi

#### Scenario: Band tidak lengkap

- **WHEN** suatu kunjungan tidak punya band pembanding
- **THEN** sistem memainkan tick plus mengumumkan kunjungan mana yang dilewati dan kenapa, lalu lanjut ke kunjungan berikutnya

#### Scenario: Meter terang sinkron

- **WHEN** Mode Kecerahan memutar kunjungan ke-N
- **THEN** meter terang menampilkan nilai kunjungan ke-N yang sedang terdengar

### Requirement: Fitur A/B Kecerahan

Mode Kecerahan SHALL menyediakan putar bergantian dua kunjungan (A/B) supaya pendengar bisa membandingkan meredup-menerang secara langsung.

#### Scenario: Banding A/B

- **WHEN** pengguna memilih kunjungan A dan B lalu menyalakan A/B
- **THEN** sistem memainkan nada A dan B bergantian sampai dihentikan, dengan pengumuman "A" dan "B" tiap giliran

### Requirement: Mode Pindai kolom citra display

Mode Pindai SHALL memindai kolom citra dari timur ke barat, memainkan 1–5 nada serentak per kolom untuk puncak terkuat, dengan X = waktu, Y = pitch (utara naik), dan kecerahan = volume; garis pindai SHALL tampil di lensa sinkron dengan kolom yang berbunyi.

#### Scenario: Satu sumber terang

- **WHEN** kolom pindai melewati satu sumber terang di tengah lensa
- **THEN** terdengar satu nada dengan pitch tengah dan volume keras, selaras dengan garis pindai di posisi kolom itu

#### Scenario: Kejujuran sumber Pindai

- **WHEN** pengguna membuka penjelasan Mode Pindai
- **THEN** teks menyatakan sumbernya piksel display PNG 8-bit hasil stretch dan volumenya taksiran, bukan fluks kalibrasi
