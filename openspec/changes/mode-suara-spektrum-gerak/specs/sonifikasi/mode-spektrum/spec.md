# Spec Delta

## Purpose

Mengembalikan suara spektrum 48 nada per kunjungan sebagai mode kedua di area Listen supaya kondisi objek (panas/dingin, berdisk, serapan atmosfer) bisa didengar lagi di samping sapuan gambar.

## ADDED Requirements

### Requirement: Pemilih mode Sapuan atau Spektrum

Area Listen SHALL menyediakan dua mode suara: Sapuan (bunyikan tata letak medan, bawaan) dan Spektrum (bunyikan kondisi objek). Ganti mode menghentikan suara yang berjalan.

#### Scenario: Pindah ke Spektrum

- **WHEN** pengguna memilih mode Spektrum saat sapuan berbunyi
- **THEN** sapuan berhenti bersih dan tombol Listen berikutnya memutar spektrum kunjungan tampil

#### Scenario: Bawaan Sapuan

- **WHEN** halaman dibuka
- **THEN** mode aktif adalah Sapuan

### Requirement: Spektrum 48 nada per kunjungan

Mode Spektrum SHALL memainkan 48 nada per kunjungan dengan waktu = panjang gelombang pendek ke panjang dan pitch = fluks; lembah serapan SHALL terdengar sebagai nada yang turun; langkah tanpa data memakai tick plus pengumuman; titik jenuh memakai timbre kasar tanpa mengubah pitch.

#### Scenario: Epsilon Indi B utuh

- **WHEN** pengguna memutar mode Spektrum pada Epsilon Indi B
- **THEN** terdengar 48 nada berurutan pendek-ke-panjang dengan kontur pitch mengikuti bentuk spektrumnya termasuk lembah serapannya

#### Scenario: Barnard hanya buntut kanan

- **WHEN** pengguna memutar mode Spektrum pada Barnard's Star
- **THEN** langkah tanpa data di kiri terdengar sebagai tick dan nada data muncul di kanan (3,8-5 mikron)

### Requirement: Visual mengikuti suara Spektrum

Saat mode Spektrum berjalan, garis kepala grafik SHALL bergerak nada-per-nada mengikuti jam audio, busur cincin lensa menyapu, dan lensa SHALL menampilkan band yang sedang terdengar; blink berhenti selama suara berjalan.

#### Scenario: Ikuti nada ke-20

- **WHEN** nada ke-20 dari 48 sedang berbunyi
- **THEN** garis kepala menunjuk langkah ke-20 dan lensa menampilkan band langkah itu

#### Scenario: Kunjungan berganti di All visits

- **WHEN** sapuan All visits mode Spektrum pindah ke kunjungan berikutnya
- **THEN** lensa pindah ke kunjungan itu dan pengumuman menyebut tanggalnya

### Requirement: Tanpa spektrum tetap jujur

Jika kunjungan tidak punya cukup titik layak, Listen mode Spektrum SHALL nonaktif dengan penjelasan, bukan bunyi diam atau bunyi tebakan.

#### Scenario: R Dra jenuh

- **WHEN** pengguna memilih mode Spektrum pada R Dra
- **THEN** tombol Listen nonaktif dan pita menjelaskan hampir semua pengukuran jenuh
