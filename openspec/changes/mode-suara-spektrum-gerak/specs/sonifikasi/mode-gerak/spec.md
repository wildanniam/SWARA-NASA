# Spec Delta

## Purpose

Melodi gerak antar kunjungan supaya arah dan besar pergeseran objek terdengar dalam sekali dengar, bukan satu blip sesaat per langkah blink.

## ADDED Requirements

### Requirement: Melodi gerak berurutan

Satu putaran melodi SHALL memainkan satu nada per kunjungan dari pertama sampai terakhir dengan pitch dari utara-selatan relatif ke kunjungan acuan (utara naik) dan pan dari timur-barat (timur kiri); kunjungan tanpa pengukuran SHALL memakai tick plus pengumuman; normalisasi memakai aturan absolut existing (1 detik busur per tangga, batas ±12).

#### Scenario: Barnard ke utara

- **WHEN** pengguna memutar melodi gerak pada Barnard's Star
- **THEN** nada-nada terdengar menanjak jelas (sekitar +9,9″ utara) dengan pan mendekati tengah

#### Scenario: Objek diam

- **WHEN** pengguna memutar melodi gerak pada objek yang tidak bergeser di luar toleransi (misalnya RW Aurigae)
- **THEN** semua nada terdengar pada nada acuan yang sama dan teks menyatakan tidak ada pergeseran

### Requirement: Lensa melangkah sinkron

Selama melodi berjalan, lensa SHALL menampilkan kunjungan yang sedang berbunyi dan blink berhenti; titik jejak kunjungan itu menyala; selesai berbunyi lensa tetap di kunjungan terakhir.

#### Scenario: Ikuti kunjungan ketiga

- **WHEN** nada kunjungan ketiga sedang berbunyi
- **THEN** lensa menampilkan kunjungan ketiga dan pengumuman menyebut tanggalnya

### Requirement: Satu suara dalam satu waktu

Memulai melodi SHALL menghentikan sapuan atau spektrum yang berjalan, dan sebaliknya; blip live gerak saat blink tidak berbunyi selama melodi atau sapuan berjalan.

#### Scenario: Ganti ke sapuan di tengah melodi

- **WHEN** pengguna menekan Listen (mode Sapuan) saat melodi berbunyi
- **THEN** melodi berhenti bersih dan sapuan mulai dari kunjungan tampil

### Requirement: Tanpa posisi terukur tidak berbunyi

Jika tidak ada posisi acuan yang stabil untuk objek ini, kontrol melodi SHALL nonaktif dengan penjelasan yang sama dengan suara gerak existing.

#### Scenario: WISE 0855 tidak terlacak

- **WHEN** pengguna membuka WISE 0855
- **THEN** kontrol melodi nonaktif dan keterangannya menyatakan posisi tidak terukur
