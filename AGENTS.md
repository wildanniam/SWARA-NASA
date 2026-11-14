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
- **Cerita dua babak:** data WISE (2010-2024) menunjukkan benda itu bergerak; data SPHEREx (2025-2026) memberi spektrumnya, yang juga bisa didengar. Benda yang punya riwayat WISE dibuka di rentang "16 years"; sakelar "SPHEREx" kembali ke kunjungan SPHEREx saja.
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
| Web tool yang terbuka untuk publik | Ada: https://swara-nasa.vercel.app |
| Pengguna memasukkan koordinat (RA dan Dec) | Ada: satu kotak untuk nama benda atau RA dan Dec |
| Deretan citra patch itu "seperti video kecil" | Ada: 13-18 citra WISE lalu 3-4 kunjungan SPHEREx diputar berurutan; blink antar kunjungan SPHEREx |
| Diuji pada Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae, R Draconis | Sudah; lihat hasil per target |

| Saran opsional | Status |
|---|---|
| Spektrum saat itu juga | Ada, dan bisa dibunyikan |
| Koordinat di URL | Ada |
| Penanda kontaminasi | Ada: piksel jenuh dan rusak |
| Menjumlahkan data per detektor | Ada: satu frame = median per detektor per kunjungan |
| Pengguna memilih lebar medan | Ada: pandangan lebar 40 menit busur, lalu lensa 6, 3, atau 2 menit busur |
| Menimpa data WISE atau Gaia | Ada untuk WISE (W2, 2010-2024, untuk dilihat); Gaia belum |
| Menjumlah atau mengurangkan citra antar waktu | Belum |
| Mudah diperbarui saat rilis data baru | Sebagian: nama koleksi masih tertulis di kode |

## Rencana kerja

Urutan platform berikutnya:

1. Pilihan warna yang dikurasi, tombol Share dan Guide yang menonjol, kartu berbagi.
2. Input RA dan Dec yang lebih mudah: dua kotak berlabel dan pratinjau "dibaca sebagai".
3. Halaman proyek dan video demo berbahasa Inggris.

Sudah selesai: medan 6 menit busur, riwayat WISE di garis waktu, zoom teleskop dengan latar yang sejajar, deploy publik, pembacaan data yang cepat, pemuatan bertahap untuk tempat baru, dan peralihan WISE ke SPHEREx yang setara tampilannya.

Aturan submission yang perlu diingat: demo 7 slide atau video paling lama 30 detik, semua berbahasa Inggris, tautan publik tanpa login, dan pemakaian AI diungkap.

## Deploy

Situs publik: https://swara-nasa.vercel.app

- **Frontend** di Vercel, proyek `swara-nasa`. Dibangun di mesin sendiri lalu diunggah, karena build membutuhkan `bundles/` di luar folder `web/`. Dari `web/`:
  ```
  vercel pull --yes --environment=production
  vercel build --prod
  vercel deploy --prebuilt --prod
  ```
- **API** di server tim sebagai layanan systemd `swara-api` ([deploy/swara-api.service](deploy/swara-api.service)), kode di `/opt/swara/app`, data di `/opt/swara/data`. Memperbarui: `git pull` di sana, lalu `systemctl restart swara-api`. Kalau dependensi berubah, pasang ulang dari `pipeline/requirements.txt` (dibuat dengan `uv export`). Jumlah bundle yang dibuat bersamaan diatur dengan `SWARA_MAX_BUILDS` di `/etc/swara-api.env` (bawaan 2). Menyalakan ulang layanan membatalkan bundle yang sedang dibuat, jadi lakukan saat tidak ada yang berjalan.
- **Sambungan.** `/api/...` di situs diteruskan ke API oleh `web/api/proxy.js`. Alamat API dan kunci bersamanya adalah pengaturan proyek Vercel (`SWARA_API_ORIGIN`, `SWARA_API_KEY`); kunci yang sama ada di `/etc/swara-api.env` di server. Jangan menulis alamat server atau kunci di repo.
- Lima contoh adalah berkas statis di Vercel, jadi tetap terbuka kalau API mati. Yang butuh API hanya cari nama dan koordinat bebas.

## Struktur repo

```
pipeline/     paket Python `skychange` (pencarian, cutout, frame, spektrum, bundle, API)
deploy/       unit layanan untuk API
bundles/      hasil pipeline untuk 5 contoh (frame, spektrum, citra medan lebar, riwayat WISE), dipakai langsung oleh viewer
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
- **Piksel dibaca langsung dari bucket publik `nasa-irsa-spherex`** (wilayah us-east-1, sekitar 260 milidetik bolak-balik dari Indonesia) lewat HTTP range. `remote.py` meminta tepat bagian yang dibutuhkan: lima permintaan dan sekitar 1,25 MB per eksposur. Lewat astropy dan fsspec satu eksposur butuh sekitar 360 permintaan dan 10,7 MB, hampir semuanya untuk HDU FLAGS yang terkompresi per baris; cara itu tinggal sebagai cadangan.
- **Satu koordinat baru butuh sekitar 1 sampai 1,5 menit** (diukur pada 291 dan 334 eksposur; sebelumnya 2,5 menit di laptop dan 6 menit di server). Yang paling lama sekarang unduhan itu sendiri: sekitar 360 MB untuk 291 eksposur. Contoh aman karena sudah jadi berkas statis.
- **Frame dibuat selebar 6 menit busur.** Itu menambah waktu sekitar sepertiga dibanding 2 menit busur (157 lawan 115 detik pada satu uji), dengan hasil ukur yang sama.
- **Citra WISE dipotong dari satu petak unWISE.** Di dekat tepi petak citranya terpotong; pipeline meminta ulang dari petak tetangga dan memakai yang menutup medan paling banyak. Epsilon Indi B tertutup 90%, empat contoh lain di atas 99%.

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
- **TEMUAN: kenapa pindah dari WISE ke SPHEREx terasa meloncat, dan perbaikannya.**
  - Sebab terukur: latar citra WISE bernilai abu 23-33 dari 255 sedangkan latar frame SPHEREx 0; rata-rata terang lensa 2-4 kali lebih tinggi; dan citra dari layanan WiseView terpotong di 500 satuan, jadi bintang terang menyilaukan (Barnard's Star: rata-rata 57 lawan 14).
  - Layanan WiseView menerima rentang terang dan parameter asinh. Diperiksa dengan tiga permintaan: keluarannya mengikuti `AsinhStretch` astropy dalam satu tingkat abu, jadi bisa dikembalikan ke satuan unWISE.
  - `wise.py` sekarang meminta rentang lebar, mengembalikannya ke satuan, mengisi inti jenuh yang kosong, menghaluskan 3 detik busur, lalu memakai `frames.stretch` yang sama dengan frame SPHEREx. Jumlah permintaan ke layanan tidak bertambah.
  - Hasil pada citra WISE terakhir lawan kunjungan SPHEREx pertama (rata-rata abu di medan 6 menit busur): WISE 0855 13,4 lawan 13,3; Barnard's Star 19 lawan 14; RW Aurigae 15 lawan 12; R Draconis 25 lawan 27; Epsilon Indi B 19 lawan 8 (WISE memang melihat lebih banyak bintang di sana).
  - Di viewer: saat teleskop berganti citranya larut 0,7 detik, kunjungan di titik itu ditahan 1,6 detik, dan nama teleskop di keterangan menyala sebentar. Blink dalam satu teleskop tetap meloncat. Bundle lama yang citra WISE-nya belum ditulis ulang disamakan nadanya di viewer saat dilukis.
- **TEMUAN: pemuatan bertahap jalan.** Selagi bundle tempat baru dibuat, server menulis `preview.json` dan keadaan pekerjaan menyebut apa yang sudah siap. Diukur di laptop pada satu tempat baru: riwayat WISE siap dalam 4 detik, citra medan lebar dalam 22 detik, bundle lengkap dalam 87 detik. Di viewer, lensa memutar riwayat WISE mulai sekitar detik ke-13 (termasuk perpindahan dan pencarian), cincinnya menunjukkan progres, dan pita spektrum terisi satu garis per eksposur yang terbaca. Saat bundle lengkap datang, pemutaran tidak diulang: kunjungan SPHEREx menyusul di ujung deretan.
  - Citra medan lebar sekarang memilih eksposurnya dari header saja supaya bisa jadi lebih awal. Hasilnya sama persis dengan cara lama. Jalur ini berebut jaringan dengan unduhan utama dan sekali tidak jadi saat dua bundle dibuat bersamaan; karena itu kalau gagal, ia dibuat lagi dari cutout di akhir.
- **TEMUAN: kenapa benda baru lambat, dan perbaikannya.** Diukur di laptop dan di server, keduanya di Indonesia.
  - Sebab: tiap eksposur dibaca dengan sekitar 360 permintaan kecil berurutan (10,7 MB, 21-30 detik sendirian). Hampir semuanya untuk penanda piksel (FLAGS), yang disimpan terkompresi satu baris per petak dan dibaca 64 KB per baris.
  - Perbaikan 1, `remote.py`: susunan berkas tetap, jadi header, baris IMAGE, tabel penunjuk dan baris FLAGS, serta tabel panjang gelombang diminta langsung. Hasilnya identik dengan cara lama pada semua larik (citra, penanda, panjang gelombang, lebar pita, posisi, header) di tiga detektor. Unduhan 291 eksposur: 264 jadi sekitar 45 detik di server.
  - Perbaikan 2, `frames.coarse_map`: transformasi langit ke piksel dihitung di kisi 16 piksel lalu diinterpolasi. Galat posisi terukur sekitar 0,00001 piksel detektor; dari 37 gambar, 0,007% piksel berbeda satu tingkat abu. Menyusun frame: 34 jadi 9 detik di server.
  - Perbaikan 3: WISE dimulai sejak awal, citra medan lebar berjalan berbarengan dengan frame, dan rentang besarnya dipecah jadi permintaan serentak.
  - Gerak, spektrum (291 titik), dan statistik frame Wolf 359 identik sebelum dan sesudah.
  - Menambah jumlah unduhan serentak di atas 32 tidak membantu: batasnya sekarang jumlah byte.
  - Alat spektrofotometri IRSA menaksir waktunya 1,67 detik per citra ditambah 50 detik (dari halaman bantuannya, tidak diukur di sini): sekitar 9 menit untuk 291 citra.
- **TEMUAN: latar dan lensa adalah langit yang sama, dan itu terukur.** Latar (citra SPHEREx 40 menit busur) dipusatkan tepat di bawah lensa. Korelasi silang antara isi lensa 6 menit busur dan petak latar yang sama pada Epsilon Indi B: 0,91, dengan selisih letak 0,8 detik busur (kurang dari setengah piksel layar saat lensa menutup). Pada 1440 x 900 lensa adalah pembesaran 2,5 kali atas latar di tingkat 6 menit busur, dan 7,4 kali di tingkat 2 menit busur.
- **KEPUTUSAN (Wildan): rasa teleskop harus nyata, bukan hiasan.** Menjauh dari tingkat terlebar menutup lensa ke latar; mengeklik cincin membukanya lagi; pindah tempat memakai arah, jarak sudut, dan koordinat yang sebenarnya. Tidak ada bintang karangan.
- **TEMUAN: riwayat WISE dan zoom lensa jalan.** Letak posisi di citra WISE diperiksa pada Epsilon Indi B: posisi yang diprediksi dari gerak diri katalog cocok dengan bintang di citra 2010 dan 2024 dalam 0,2 piksel (0,5 detik busur). Kelima contoh dibuat ulang selebar 6 menit busur; gerak terukurnya sama dengan sebelumnya. WISE 0855 redup di tampilan ini dan sulit dilihat tanpa memperbesar.
- **KEPUTUSAN:** nama produk SWARA; arah produk seperti di bagian Konsep.
- **TEMUAN:** layanan WiseView memberi frame WISE 2010-2024 untuk satu posisi dalam sekitar 3 detik. Dicoba pada WISE 0855, Epsilon Indi B, dan Luhman 16: ketiganya terlihat bergerak. Gambarnya sudah diregangkan, jadi untuk dilihat, bukan diukur.
