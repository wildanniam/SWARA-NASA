# Spec Delta

## Purpose

Satu mode yang menjawab pertanyaan mengenali hanya lewat telinga: benda ini memancarkan warna apa, dibaca sebagai 48 nada per kunjungan dari pendek ke panjang gelombang dengan lembah serapan yang terdengar turun.

## ADDED Requirements

### Requirement: Mode Spektrum 48 nada per kunjungan

Mode Spektrum SHALL memainkan 48 nada per kunjungan dengan waktu = panjang gelombang pendek ke panjang dan pitch = fluks; lembah serapan SHALL terdengar sebagai nada yang turun.

#### Scenario: Epsilon Indi B utuh

- **WHEN** pengguna memutar Mode Spektrum pada Epsilon Indi B (347 titik bersih)
- **THEN** terdengar 48 nada berurutan pendek-ke-panjang dengan kontur pitch mengikuti bentuk spektrumnya

#### Scenario: Kunjungan dibunyikan utuh

- **WHEN** satu kunjungan selesai diputar
- **THEN** tidak ada langkah yang dilewati diam-diam: langkah tanpa data memakai tick plus pengumuman sesuai kontrak mode-shell

### Requirement: Binning jujur dengan lowConf

Binning 102 → 48 SHALL NOT menghapus fitur sempit tanpa tanda: bin yang lembah dalamnya didominasi sedikit titik SHALL ditandai lowConf sehingga terdengar berbeda sesuai kontrak mode-shell.

#### Scenario: Lembah sempit bertahan sebagai tanda

- **WHEN** satu bin memuat lembah dalam yang sempit
- **THEN** nada bin itu memakai timbre lowConf dan data mentah lembah itu tetap bisa dibaca sebagai angka eksak lewat teks

### Requirement: Pitch follower nada per nada

Visual Mode Spektrum SHALL menampilkan pitch follower: penanda posisi nada-ke-nada pada grafik spektrum, sinkron dengan nada yang sedang berbunyi.

#### Scenario: Ikuti nada ke-20

- **WHEN** nada ke-20 dari 48 sedang berbunyi
- **THEN** penanda grafik menunjuk langkah ke-20 dan label panjang gelombangnya terbaca
