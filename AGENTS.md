# AGENTS.md: panduan kerja SWARA

Baca berkas ini sebelum mengerjakan apa pun di repo ini. `CLAUDE.md` mengimpornya, jadi cukup perbarui di sini. Repo ini publik: jangan menulis kunci, data pribadi, atau catatan internal di sini.

## Mode kerja: hackathon

Kita sedang membangun produk yang akan dinilai, bukan bereksperimen.

- **Tenggat:** submission Minggu 15 November 2026, 23.59 waktu lokal. Berhenti menambah fitur Minggu 12.00; sisanya untuk halaman proyek, video, dan QA.
- **Utamakan yang dinilai.** Urutan: permintaan wajib challenge, lalu cerita dua babak, lalu kemudahan pakai. Fitur di luar itu ditunda.
- **Perubahan kecil dan utuh.** Satu branch per pekerjaan (`feat/...`, `fix/...`, `docs/...`), pull request ke `main`, commit yang menjelaskan apa dan kenapa.
- **Uji sebelum push.** Jalankan alur pengguna yang terkena di browser, bukan hanya build. Tulis apa yang diuji dan apa yang belum.
- **`main` harus selalu bisa didemokan.**

## Proyek

- **Acara:** NASA Space Apps Challenge 2026, 14-15 November 2026.
- **Challenge:** [Planet X and SPHEREx](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/).
- **Produk:** SWARA, Sky Watch with Audio & Real-time Access.
- **Satu kalimat:** alat untuk orang umum yang ingin melihat sepetak langit berubah dari waktu ke waktu, lalu tahu benda itu apa, lewat mata atau telinga.

## Konsep

- **Untuk siapa:** orang umum. Yang ditekankan: keindahan, UX yang mudah, dan data astronomi yang tetap ilmiah. Ilmuwan menilai kebenarannya, bukan penggunanya.
- **Cerita dua babak:** data WISE (2010-2024) menunjukkan benda itu bergerak; data SPHEREx (2025-2026) memberi spektrumnya, yang juga bisa didengar. Babak WISE belum dibangun.
- **Yang membuatnya dipercaya:** tiap angka gerak tampil di samping angka katalog, dan yang tidak bisa diukur ditulis terus terang.
- **Yang bukan:** mesin pencari benda otomatis, klaim penemuan baru, atau pengganti alat IRSA.

## Peran

- Wildan: platform dan core (pipeline data, viewer, API, deploy).
- Alif: sonifikasi. Rasa dan konsep suaranya sepenuhnya di tangannya; pengaturannya di `web/src/sound/mapping.ts`.
- Nayla: cerita, submission, sains, konten.
- QA dikerjakan bertiga.

## Yang diminta challenge

| Permintaan wajib | Status |
|---|---|
| Web tool yang terbuka untuk publik | Belum di-deploy |
| Pengguna memasukkan koordinat (RA dan Dec) | Ada: satu kotak untuk nama benda atau RA dan Dec |
| Deretan citra patch itu "seperti video kecil" | Ada: blink antar kunjungan |
| Diuji pada Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae, R Draconis | Sudah; lihat hasil per target |

| Saran opsional | Status |
|---|---|
| Spektrum saat itu juga | Ada, dan bisa dibunyikan |
| Koordinat di URL | Ada |
| Penanda kontaminasi | Ada: piksel jenuh dan rusak |
| Menjumlahkan data per detektor | Ada: satu frame = median per detektor per kunjungan |
| Pengguna memilih lebar medan | Belum; direncanakan |
| Menimpa data WISE atau Gaia | Belum; WISE direncanakan |
| Menjumlah atau mengurangkan citra antar waktu | Belum |
| Mudah diperbarui saat rilis data baru | Sebagian: nama koleksi masih tertulis di kode |

## Rencana kerja

Urutan platform berikutnya:

1. Lebar medan yang bisa diubah (syarat untuk WISE, sekaligus zoom).
2. Ruas WISE di garis waktu, lewat backend dengan cache.
3. Input RA dan Dec yang lebih mudah: dua kotak berlabel dan pratinjau "dibaca sebagai".
4. Deploy: backend di VPS, frontend statis.
5. Halaman proyek dan video demo berbahasa Inggris.

Aturan submission yang perlu diingat: demo 7 slide atau video paling lama 30 detik, semua berbahasa Inggris, tautan publik tanpa login, dan pemakaian AI diungkap.

## Struktur repo

```
pipeline/     paket Python `skychange` (pencarian, cutout, frame, spektrum, bundle, API)
bundles/      hasil pipeline untuk 5 contoh, dipakai langsung oleh viewer
web/          viewer: blink, spektrum, suara (`web/src/sound/`)
data/         cache unduhan dan bundle koordinat bebas; tidak ikut git
```

Cara menjalankan dan arti tiap kolom `spectrum.json` ada di [pipeline/README.md](pipeline/README.md). Itu kontrak antara pipeline, viewer, dan suara: kalau mengubah bentuk bundle, perbarui README itu dan beri tahu tim. Arah visual ada di [web/DESIGN.md](web/DESIGN.md); baca sebelum mengubah tampilan.

## Yang wajib dipahami tentang data SPHEREx

Semua poin ini sudah diuji langsung terhadap data.

- **Satu eksposur bukan satu band.** Panjang gelombang berubah di sepanjang detektor, jadi target yang sama jatuh di panjang gelombang berbeda di tiap eksposur. Dibaca dari WCS alternatif `W`.
- **Waktu = kunjungan, bukan frame.** Satu lokasi dilewati kira-kira tiap 6 bulan: 3-4 kunjungan per target sejak April 2025, masing-masing puluhan eksposur per detektor.
- **Enam detektor dipakai sebagai band tampilan** (0,75-5,0 mikron). Satu frame = median eksposur satu detektor dalam satu kunjungan.
- **Piksel besar:** 6,15 detik busur. Gerak beberapa detik busur per tahun hanya bergeser sekitar 1 piksel.
- **Bintang terang jenuh.** Definisi bit penanda ada di `pipeline/src/skychange/flags.py`.
- **Pencarian posisi pakai SIA, bukan TAP** (2-4 detik lawan 203 detik).
- **Piksel dibaca langsung dari bucket publik `nasa-irsa-spherex`** lewat HTTP range, sekitar 0,4 detik per berkas.
- **Satu koordinat baru butuh 2-3,5 menit** (258-545 eksposur). Contoh aman karena sudah jadi berkas statis.
- **Medan 6 menit busur menambah waktu sekitar sepertiga** dibanding 2 menit busur (157 lawan 115 detik pada satu uji), dengan hasil ukur yang sama.

## Hasil per target

| Target | Gerak terukur | Spektrum | Catatan |
|---|---|---|---|
| Barnard's Star | +9,9" ke utara dalam setahun (katalog sekitar 10,4"/tahun) | hanya 3,8-5 mikron yang konsisten | contoh utama untuk gerak |
| Epsilon Indi B | +4,8" timur, -4,0" selatan dalam sekitar 16 bulan | 347 titik bersih | contoh utama untuk suara |
| RW Aurigae | tidak bergerak | terang di 4-5 mikron turun antar kunjungan | hampir semua titik ditandai jenuh |
| WISE 0855-0714 | tidak terukur | tidak terpisah dari bintang latar | belum terbukti terlihat, jangan diklaim |
| R Draconis | tidak valid | hampir semua titik tanpa nilai inti | terlalu terang |

Di luar contoh: Wolf 359 terukur 3,9" barat dan 2,4" selatan dalam 381 hari (katalog 4,0 dan 2,8); Teegarden's Star 5,2" dalam 12 bulan (katalog 5,1 per tahun).

## Aturan untuk AI agent

- **Bedakan yang diuji dari yang diduga.** Jangan mengklaim WISE 0855 terlihat, jangan mengklaim berguna untuk tunanetra tanpa uji, jangan memakai kata "penemuan baru".
- **Jangan mengubah bentuk bundle secara diam-diam.**
- **Jangan mengubah `web/src/sound/` tanpa diminta.**
- **Jangan commit isi `data/`**, kunci API, atau berkas FITS.
- **Bahasa:** antarmuka, README, dan pesan commit berbahasa Inggris; panduan ini dan komentar kode berbahasa Indonesia.
- Fakta baru tentang data atau keputusan tim dicatat di log di bawah, dengan tanggal dan label KEPUTUSAN, TEMUAN, atau USULAN.

## Resource

- [Halaman challenge](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/?tab=resources)
- [IRSA: SPHEREx](https://irsa.ipac.caltech.edu/Missions/spherex.html) dan [tutorial notebook](https://caltech-ipac.github.io/irsa-tutorials/spherex/)
- [WiseView](http://byw.tools/wiseview), model yang disebut NASA
- SIA IRSA: `https://irsa.ipac.caltech.edu/SIA`, koleksi `spherex_dr1` dan `spherex_qr3`
- Nama dan gerak diri: SIMBAD lewat CDS Sesame

## Log

### 2026-11-14
- **KEPUTUSAN:** nama produk SWARA; arah produk seperti di bagian Konsep.
- **TEMUAN:** layanan WiseView memberi frame WISE 2010-2024 untuk satu posisi dalam sekitar 3 detik. Dicoba pada WISE 0855, Epsilon Indi B, dan Luhman 16: ketiganya terlihat bergerak. Gambarnya sudah diregangkan, jadi untuk dilihat, bukan diukur.
