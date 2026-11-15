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
| Web tool yang terbuka untuk publik | Ada: https://swara.space (landing page), aplikasinya di https://swara.space/sky |
| Pengguna memasukkan koordinat (RA dan Dec) | Ada: dua isian berlabel RA dan Dec (derajat atau jam/derajat-menit-detik), satu kotak untuk nama benda atau koordinat, pratinjau "dibaca sebagai" di peta, atau klik titik mana pun di peta seluruh langit |
| Deretan citra patch itu "seperti video kecil" | Ada: 13-18 citra WISE lalu 3-4 kunjungan SPHEREx diputar berurutan; blink antar kunjungan SPHEREx |
| Diuji pada Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae, R Draconis | Sudah; lihat hasil per target |

| Saran opsional | Status |
|---|---|
| Spektrum saat itu juga | Ada, dan bisa dibunyikan |
| Koordinat di URL | Ada |
| Penanda kontaminasi | Ada: piksel jenuh dan rusak di lensa, dan persentasenya per kunjungan di garis waktu |
| Menjumlahkan data per detektor | Ada: satu frame = median per detektor per kunjungan |
| Pengguna memilih lebar medan | Ada: peta seluruh langit yang bisa diperbesar sampai medan 1,8 derajat, pandangan lebar 40 menit busur, lalu lensa 6, 3, atau 2 menit busur |
| Menimpa data WISE atau Gaia | Ada: WISE (W2, 2010-2024, untuk dilihat) dan bintang Gaia DR3 di lensa, ditaruh di posisinya pada tanggal citra yang tampil |
| Menjumlah atau mengurangkan citra antar waktu | Ada: citra selisih di lensa (yang tampil dikurangi pengamatan pertama), untuk SPHEREx dan WISE |
| Mudah diperbarui saat rilis data baru | Ada: koleksi diatur lewat `SWARA_COLLECTIONS`, alamat peta seluruh langit dibaca dari manifest |

## Rencana kerja

Urutan platform berikutnya:

2. Halaman proyek dan video demo berbahasa Inggris.

Sudah selesai: medan 6 menit busur, riwayat WISE di garis waktu, zoom teleskop dengan latar yang sejajar, deploy publik, pembacaan data yang cepat, pemuatan bertahap untuk tempat baru, peralihan WISE ke SPHEREx yang setara tampilannya, enam look terkurasi dengan Reveal faint, tombol Share serta Guide (bacaan tiga kartu), kartu berbagi (kartu gerak dan kartu cahaya; tanpa kata "discovery"), pembuka seluruh langit, landing page di `/` (aplikasi pindah ke `/sky`), gaya kartu untuk cuplikan penanda dan daftar Go to, kartu berbagi ketiga (tempatnya), perkenalan tombol lensa, kualitas data per kunjungan di garis waktu, halaman kartu `/card` dengan pratinjau tautannya, dan tur berpemandu di `/sky`.

Aturan submission yang perlu diingat: demo 7 slide atau video paling lama 30 detik, semua berbahasa Inggris, tautan publik tanpa login, dan pemakaian AI diungkap.

## Deploy

Situs publik: https://swara.space (landing page). Aplikasinya di `/sky`; tautan lama `/?target=...` dan `/?ra=...` tetap membuka aplikasi. `www.swara.space` dialihkan ke `swara.space`, dan alamat lama https://swara-nasa.vercel.app tetap jalan.

- **Domain** `swara.space` dibeli di GoDaddy (akun teman Wildan) dan name server-nya tetap di GoDaddy. DNS: dua record A `@` ke `216.198.79.1` dan `64.29.17.1` (nilai dari `vercel domains verify swara.space`). Kalau sertifikat HTTPS tidak terbit sendiri: `vercel certs issue swara.space www.swara.space`.

- **Frontend** di Vercel, proyek `swara-nasa`. Dibangun di mesin sendiri lalu diunggah, karena build membutuhkan `bundles/` di luar folder `web/`. Dari `web/`:
  ```
  vercel pull --yes --environment=production
  vercel build --prod
  vercel deploy --prebuilt --prod
  ```
- **API** di server tim sebagai layanan systemd `swara-api` ([deploy/swara-api.service](deploy/swara-api.service)), kode di `/opt/swara/app`, data di `/opt/swara/data`. Memperbarui: `git pull` di sana, lalu `systemctl restart swara-api`. Kalau dependensi berubah, pasang ulang dari `pipeline/requirements.txt` (dibuat dengan `uv export`). Jumlah bundle yang dibuat bersamaan diatur dengan `SWARA_MAX_BUILDS` di `/etc/swara-api.env` (bawaan 2). Koleksi SPHEREx yang dicari diatur dengan `SWARA_COLLECTIONS` di berkas yang sama (bawaan `spherex_dr1,spherex_qr3`); rilis baru cukup ditambahkan di situ. Menyalakan ulang layanan membatalkan bundle yang sedang dibuat, jadi lakukan saat tidak ada yang berjalan.
- **Sambungan.** `/api/...` di situs diteruskan ke API oleh `web/api/proxy.js`. Alamat API dan kunci bersamanya adalah pengaturan proyek Vercel (`SWARA_API_ORIGIN`, `SWARA_API_KEY`); kunci yang sama ada di `/etc/swara-api.env` di server. Jangan menulis alamat server atau kunci di repo.
- Lima contoh adalah berkas statis di Vercel, jadi tetap terbuka kalau API mati. Yang butuh API hanya cari nama dan koordinat bebas.

## Struktur repo

```
pipeline/     paket Python `skychange` (pencarian, cutout, frame, spektrum, bundle, API)
deploy/       unit layanan untuk API
bundles/      hasil pipeline untuk 5 contoh (frame, spektrum, citra medan lebar, riwayat WISE) dan peta seluruh langit (`allsky/`), dipakai langsung oleh viewer
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
- **SIA IRSA bisa membalas `502 Proxy Error` berjam-jam.** Pencarian mencoba ulang dengan jeda 1, 2, 4, dan 8 detik; kalau tetap gagal, bundle tidak dibuat dan aplikasi mengatakan arsip NASA sedang tidak menjawab. Lima contoh dan tempat yang sudah pernah dibuat tidak terpengaruh.
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

### 2026-11-15
- **TEMUAN: bercak hitam di peta seluruh langit adalah piksel tanpa data, bukan noise.** Masukan teman Wildan: saat di-zoom ke pusat Bima Sakti, di beberapa panjang gelombang muncul bercak hitam. Tile HiPS IRSA menandai piksel tanpa data sebagai transparan (PNG berpalet, indeks 0); perender membuang alpha itu, jadi piksel itu dilukis dengan warna tergelap.
  - Bagian tanpa data di tile order 5, band D1 sampai D6 (saluran tengah): pusat galaksi 13,8 / 8,9 / 22,5 / 3,0 / 0,2 / 2,6 persen; kutub ekliptika utara 89,5 / 0,5 / 92,5 / 89,7 / 0,7 / 92,4 persen; Barnard's Star, Epsilon Indi, dan Orion 0 sampai 0,4 persen. Inti bintang terang yang jenuh juga transparan.
  - Perbaikan: lubang kecil (sampai 400 piksel, inti bintang) diisi rata-rata tepinya; celah besar dibiarkan tembus pandang dan diberi arsir tipis serta satu kalimat keterangan. Tidak ada nilai yang dikarang di celah besar. Rincian tampilan di [web/DESIGN.md](web/DESIGN.md), "Seluruh langit".
  - Yang belum: peta dasar (pratinjau order 3) membawa lubang yang sama dan tidak bisa dibedakan dari langit gelap, jadi di bawah arsir sebagian celah tetap gelap. Kenapa datanya kosong di sana belum dipastikan.
  - Diuji di Chromium (browser bawaan Claude) pada 1440 x 900: pusat galaksi di 0,91, 2,00, 4,11, dan 4,70 µm pada medan 4°, look Ember dan Paper, sekitar kutub ekliptika utara di 0,91 µm, menyelam ke Barnard's Star, build. Belum diuji: zoom dalam di ponsel, Safari, Firefox.
- **TEMUAN: pengumuman pembaca layar saat Listen masih berbahasa Indonesia**, sekarang berbahasa Inggris (`web/src/components/SpectrumStrip.tsx`). `web/src/sound/` tidak diubah.
- **KEPUTUSAN (Wildan): tata letak cuplikan penanda dan panggung contoh dirapikan.** Masukannya: angka busur terlalu besar dibanding keterangan di sampingnya, tombol dan kartu terasa menggantung di pinggir. Cuplikan sekarang dua baris dengan kaki selebar kartu (angka 22 px, keterangan 12,5 px), label penanda menepi selagi kartunya terbuka. Di landing page daftar contoh setinggi panggung, angka 56 px dengan keterangan 14 px, dan tombol selebar kartu saat bertumpuk.
  - **TEMUAN: di ponsel cuplikan dan kartu bidikan menimpa judul peta sejak sebelum perubahan ini.** Sebabnya baris peta tidak ikut memanjang (`min-height: 0` pada `.atlas-stage`), dan garis dalam kartu lepas ke bingkai peta karena kartunya tidak berposisi. Keduanya diperbaiki.
  - Diuji di Chromium headless: kelima cuplikan dan kartu bidikan di 1440 x 900, cuplikan, kartu bidikan, dan "Look closer" di ponsel 390 px, bagian contoh di 1440, 1100, dan 390 px, dialog Go to, tampilan teleskop Barnard's Star di desktop dan ponsel, build. Belum diuji: ponsel asli, Safari, Firefox.
- **KEPUTUSAN (Wildan): aplikasi menjelaskan kenapa lima contoh itu istimewa.** Sebabnya: masukan teman Wildan, penanda hanya menulis "moves" atau "changes brightness" jadi orang tidak tahu apa istimewanya. Tiap benda sekarang membawa dua hal dari `TARGET_WHY` (`web/src/content.ts`): bendanya apa (di bawah nama penanda) dan kenapa istimewa. Tampil di penanda dan cuplikan peta seluruh langit serta bagian contoh di landing page. Versi pertama memakai bingkai "Test n of 5"; Wildan menolaknya karena terbaca seperti ujian, jadi kata "test" tidak dipakai. Rincian di [web/DESIGN.md](web/DESIGN.md), "Seluruh langit".
  - Untuk Nayla: faktanya (Barnard's Star sekitar 6 tahun cahaya dan hanya Alpha Centauri yang lebih dekat; WISE 0855 katai cokelat terdingin, sekitar 7 tahun cahaya, ditemukan 2014; Epsilon Indi B sekitar 12 tahun cahaya; R Draconis berdenyut sekitar delapan bulan) ditulis dari pengetahuan umum dan belum dicek ke sumber.
  - Diuji di Chromium headless: kelima cuplikan di 1440 x 900, cuplikan dan "Look closer" di ponsel 390 px, bagian contoh landing page di 1440, 1100, dan 390 px (kelima benda, gerak dikurangi), tur langkah 1 sampai 3 dengan menyelam ke Barnard's Star, daftar Go to, tanpa geser horizontal, build. Belum diuji: ponsel asli, Safari, Firefox, pembaca layar.
- **KEPUTUSAN (Wildan): peta seluruh langit menulis "seen from Earth".** Sebabnya: orang selalu bertanya di mana Bumi, Matahari, dan Bulan. Peta itu pandangan dari Bumi ke segala arah, jadi ketiganya tidak ada di peta; Bumi tidak ditandai sebagai titik. Teksnya di judul pelat, kalimat di bawah judul peta, langkah pertama tur, dan kartu 0 di Story. Penanda Matahari dan Bulan "hari ini" belum dibuat.
  - Diuji di Chromium headless: peta, langkah pertama tur, dan kartu Story di 1440 x 900; peta di 1366 x 768 dan ponsel 390 px; tanpa geser horizontal; build lolos. Belum diuji: ponsel asli, Safari, Firefox.
- **KEPUTUSAN (Wildan): alamat publik pindah ke https://swara.space.** `www` dialihkan ke sana, dan swara-nasa.vercel.app tetap jalan supaya tautan dan QR yang sudah tersebar tidak rusak. Pratinjau tautan memakai domain baru (PR #63). Materi submission perlu memakai alamat baru.
- **KEPUTUSAN (Wildan): suara digambar di lensa, mengikuti engine Alif di PR #55 (PR #60).** Sebabnya: saat diputar, layar hanya menampilkan cincin yang terisi dari utara kembali ke utara dan garis pindai, jadi tidak terlihat apa yang sedang terdengar. Syaratnya: tetap minimalis dan nyambung dengan tampilan sekarang. Rincian di [web/DESIGN.md](web/DESIGN.md), tabel gerak.
  - Pindai: cincin tipis putih di bintang yang sedang dibunyikan; bintang yang berkilau mendapat cincin kedua. Spektrum: sinar ambar ke dalam dari cincin pada sudut panjang gelombangnya (0,75 µm kiri sampai 5 µm kanan), panjang = fluks, mahkota kunjungan sebelumnya jadi bayangan abu. Gerak: denyut di posisi terukur saat lonceng berbunyi. Busur cincin sekarang jarum per kunjungan.
  - `web/src/sound/` tidak diubah; gambar membaca jadwal nada yang sama dan mengikuti jam audio.
  - Diuji di Chromium headless: Epsilon Indi B (Ember dan Paper) dan Barnard's Star, build, regresi aplikasi 26 langkah. Belum diuji: ponsel asli, Safari, Firefox, menonton sambil mendengar dengan speaker sungguhan. `node --test` pada `scan.test.ts` tidak bisa membaca import tanpa ekstensi, sudah begitu sebelum perubahan ini.
- **KEPUTUSAN (Wildan): tur berpemandu di `/sky`, memakai driver.js.** Sebabnya: satu teman Wildan tanpa latar astronomi menyukai SWARA setelah dijelaskan, tetapi sebelum dijelaskan ia tidak paham dan merasa ribet. Tur membawa penjelasan itu ke layar: 2 langkah di seluruh langit (berakhir dengan mengeklik Barnard's Star), lalu 6 di teleskop; tautan ke satu tempat langsung mendapat 6 langkah itu. Sekali per browser, bisa dilewati, dan diulang dari tombol bertanda tanya di bilah atas. Rincian tampilan di [web/DESIGN.md](web/DESIGN.md), "Tur".
  - driver.js 1.10.2 (lisensi MIT, boleh dipakai di proyek AGPL) dipasang pada versi tepat. Versi 1.11 sampai 1.14 baru terbit dalam seminggu terakhir, jadi tidak dipakai. Pustakanya hanya diunduh saat tur berjalan (sekitar 11 kB terkompresi).
  - Diuji di Chromium headless: 36 pemeriksaan perilaku (lewati dengan Esc, tombol silang, dan Not now; mundur; Enter dan panah; berangkat lewat tombol dan lewat klik bintang; tautan langsung ke tiga benda; ulang; dialog terbuka; gerak dikurangi; penyimpanan diblokir), semua langkah di 11 ukuran layar dari 1920 sampai 360 px, tanpa WebGL, waktu bingkai saat berpindah langkah (median 16,7 ms), dan regresi aplikasi 26 langkah.
  - Belum diuji: ponsel asli, Safari, Firefox, pembaca layar. Tur ini juga belum dicoba ke orang awam; dasarnya baru satu wawancara.
- **KEPUTUSAN (Wildan): tombol "The cards" berganti nama jadi "Story".** "The cards" hanya menyebut bentuknya, dan bertabrakan dengan "Draw a card" (kartu berbagi). Isi dialognya tidak berubah. Logo di bilah atas sekarang jalan pulang satu tingkat sekali: teleskop ke seluruh langit, seluruh langit ke landing page.
- **KEPUTUSAN (Wildan): suara di halaman kartu dirilis.** Wildan menyetujui setelah audisi; penyetelan rasa oleh Alif bisa menyusul di `LEVEL` (`web/src/card/cardSound.ts`). Kartu pertama menunggu diketuk (browser tidak mengizinkan suara sebelum disentuh), lalu desir saat berputar, lonceng dari data kartunya, satu denting per percikan bintang, dan latar ambience yang pelan. Mesin suara Alif (`web/src/sound/`) dipakai apa adanya, tidak diubah. Rincian di [web/DESIGN.md](web/DESIGN.md), "Halaman kartu".
  - Diuji di Chromium headless: tidak ada konteks audio sebelum disentuh, ketuk membalik dan membunyikan, balik sendiri setelah 3,8 detik tanpa suara, sentuhan sesudahnya membuka suara, tombol mati diingat antar kunjungan, Enter, gerak dikurangi, ponsel. Rekaman 12,8 detik (Epsilon Indi B, tiga kartu): −25,8 LUFS, puncak −10,6 dBFS, tidak ada energi di atas 9 kHz.
  - Belum diuji: speaker dan headphone sungguhan, ponsel asli (iPhone membisukan Web Audio saat sakelar senyap aktif), Safari, Firefox. Alif belum mendengarnya.
- **KEPUTUSAN (Wildan): yang dibagikan dari kartu adalah tautan ke halaman kartunya, bukan berkas gambar.** Sebabnya: di Chrome desktop, lembar berbagi macOS menyalin berkas PNG dua kali beserta jalur berkasnya, jadi di WhatsApp muncul dua gambar dan teks jalur. Rincian tampilan di [web/DESIGN.md](web/DESIGN.md), "Halaman kartu".
  - **Halaman `/card`**: satu kartu melayang di petak langit SPHEREx yang asli di sekitar bendanya, datang tertelungkup lalu membalik, miring mengikuti penunjuk, dan bisa diputar ke kartu lain. Dua tombol: "Explore this place" dan "Draw your own card". Simpan gambar ukuran story tetap ada, di dialog dan di halaman ini.
  - **Pratinjau tautan**: `/card` dilayani `web/api/card.js` supaya tag Open Graph ada di HTML. Sebelas kartu contoh punya gambar pratinjau sendiri (tangkapan layar halaman kartunya); tempat di luar contoh mendapat kartu tertelungkup dan namanya di judul. Tautan situs lainnya sekarang juga punya pratinjau (landing page).
  - Diuji di Chromium headless: kelima contoh dengan tiap kartunya, tautan langsung ke satu kartu, klik dan papan ketik, klik beruntun, simpan (PNG 1080 x 1920), salin tautan, kemiringan, waktu bingkai (median 16,7 ms), gerak dikurangi, sembilan ukuran layar, dialog berbagi di aplikasi, dan regresi aplikasi 26 langkah. Dengan respons tiruan: tempat yang dicari, bundle yang belum jadi, layanan mati, dan lembar berbagi ponsel.
  - Belum diuji: ponsel asli, Safari, Firefox, dan miring mengikuti tangan di Android.
- **KEPUTUSAN (Wildan): empat sisa pekerjaan core dikerjakan dengan estetika sebagai tekanan utama.** Semuanya memakai data yang sudah ada; tidak ada bentuk bundle yang berubah.
  - **Cuplikan penanda dan daftar Go to jadi kartu tempat:** jendela melengkung berisi citra asli, julukan, dan angka terukur ("The Wanderer · 10.1″ north in 12 months"). Julukan dan angka dihitung di `web/src/lib/verdict.ts`, dipakai juga oleh landing page.
  - **Kartu berbagi ketiga, "Its place":** langit 44 derajat di sekitar benda dari peta seluruh langit SPHEREx, rasi yang ditempatinya digambar terang, kompas di sekeliling jendela, lalu lintang galaktik dan dari mana ia bisa terlihat. Kartu ini selalu ada, jadi benda tanpa spektrum bersih sekarang punya dua kartu.
  - **Keterangan kenop lensa dua baris** (nama, tombol pintas, gunanya) dan **perkenalan sekali per browser**: lima kenop menyala bergantian saat lensa pertama terbuka.
  - **Garis waktu:** menunjuk tanda kunjungan menampilkan jumlah eksposur yang ditumpuk serta persen piksel jenuh dan rusak; tanda WISE menyebut "to look at, not measured". Dua persen itu ditulis terpisah karena `saturated_fraction` dan `bad_fraction` di bundle dihitung sendiri-sendiri dan bisa tumpang tindih.
  - Diuji di Chromium headless: kelima contoh di cuplikan dan daftar, kartu tempat pada tiga look (Ember, Glacier, Paper), perkenalan (urutan, tidak muncul di kunjungan kedua, berhenti saat diklik), tujuh keterangan kenop tanpa menimpa kenop lain, keterangan garis waktu di kedua rentang, ponsel 390 px, dan regresi aplikasi 26 langkah. Belum diuji: ponsel asli, Safari, Firefox.
- **KEPUTUSAN (Wildan): panel temuan WISE 0855 menulis "Hidden · ? · behind a background star", bukan "Holding still".** Yang terukur di posisi itu bintang latar, jadi "Holding still" bisa terbaca sebagai WISE 0855 tidak bergerak. Teks dibuat sependek benda lain (prinsip minimalis); penjelasan panjang tetap di panel kiri. Berlaku untuk semua benda di `BLENDED` (`web/src/content.ts`).
- **KEPUTUSAN (Wildan): UX lensa dipoles tanpa menunggu persetujuan per langkah.** Masukannya: Difference dan tombol lain berganti "langsung pek" tanpa transisi, dan teleskopnya terasa statis saat ditunjuk.
  - Pergantian cara melukis (Difference, look, Reveal faint, piksel tak andal) sekarang menyapu citra lama dari kiri ke kanan dalam 0,64 detik dengan garis ambar; blink dan pergantian pembesaran tidak tersapu. Cincin Gaia mengunci satu per satu dan memudar saat dimatikan. Keterangan di bawah lensa masuk pelan.
  - Menunjuk lensa menampilkan RA/Dec titik itu dan jaraknya dari tanda, jarum ambar di cincin, dan kompas yang menyala. Diperiksa: di pusat lensa Barnard's Star terbaca 17h 57m 47s +4° 46′ 06″, sama dengan manifest (269,4463°, +4,7682°).
  - Diuji di Chromium headless: sapuan muncul untuk keempat mode dan tidak untuk blink, 110 cincin Gaia mengunci lalu hilang setelah 0,38 detik, bacaan hilang saat kursor keluar, regresi aplikasi 26 langkah lolos. Bingkai lambat sekitar 100 ms di awal menyelam juga ada di `main` (mode dev), jadi bukan dari perubahan ini. Belum diuji: ponsel asli, Safari, Firefox.
- **TEMUAN: tempat baru gagal karena layanan SIA IRSA membalas 502, bukan karena rute `/sky`.** Diuji 14-15 November sekitar tengah malam WIB: `spherex_dr1` gagal 6 dari 6 permintaan, `spherex_qr3` 4 dari 6, TAP juga 502, sementara potongan HiPS IRSA tetap termuat. Pipeline dulu menyerah pada 502 pertama, jadi tiap Try again membangun ulang lalu gagal dengan pesan umum.
  - Perbaikan (PR #37): coba ulang 429, 5xx, dan koneksi putus dengan jeda 1, 2, 4, dan 8 detik dalam batas 90 detik; kalau tetap gagal, pekerjaan berakhir dengan `error: "archive"` dan aplikasi menulis "NASA's SPHEREx archive (IRSA) is not answering right now". Tidak dilanjutkan dengan satu koleksi saja, karena bundle itu akan tersimpan dengan eksposur yang diam-diam hilang.
  - Diuji dengan respons palsu (502, 502, 200; putus lalu 200; lima kali 502; 404) dan langsung ke IRSA: saat DR1 terus 502 pencarian berhenti setelah 21,5 detik dengan pesan arsip; percobaan berikutnya lolos dan bundle Sirius jadi ("Not trackable": terlalu terang untuk dilacak).

### 2026-11-14
- **KEPUTUSAN (Wildan): landing page di `/`, aplikasi di `/sky`, mengikuti mockup v2.** Arahnya minimalis dan modern dengan rasi bintang sebagai aksen. Mockup pertama ditolak karena kartunya polos, isinya terlalu umum, bagian contohnya lemah, dan kakinya berantakan. Isi landing page dihitung dari bundle yang sama dengan aplikasi; sasaran dan mikro-interaksi tiap bagian ada di [web/DESIGN.md](web/DESIGN.md).
  - Tautan lama yang membawa parameter aplikasi tetap membuka aplikasi, dan aplikasi sekarang selalu menulis alamatnya di `/sky`, jadi memuat ulang tidak jatuh ke landing page. Tautan Share dan QR kartu berbagi ikut menunjuk `/sky`.
  - Diuji di Chromium headless dengan GPU laptop: enam ukuran layar dari 1440 sampai 360 px tanpa tabrakan dan tanpa geser horizontal; keenam kartu menyala saat ditunjuk dan animasinya jalan; pemilih contoh membaca kelima benda (Barnard's Star 10,1″ lawan Gaia 10,2″; Epsilon Indi B 6,2″ lawan Gaia 6,6″ untuk rentang yang sama; RW Aurigae ≈ 0″; WISE 0855 "Not in Gaia DR3"; R Draconis tidak terukur); bola langit median 16,7 ms per bingkai dan berhenti saat tidak terlihat; gerak dikurangi; tanpa WebGL; dan regresi aplikasi 26 langkah di `/sky`.
  - Belum diuji: ponsel asli, Safari, Firefox, pembaca layar.
  - **Revisi atas masukan Wildan (15 November dini hari), disetujui dari usulan bergambar:** judul SWARA diketik lalu membuka jadi kepanjangannya; bola langit bisa diseret dengan momentum, ditunjuk untuk membaca rasi dan koordinat, dan diklik untuk membidik lalu membuka tempat itu di aplikasi; penanda contoh memperlihatkan cuplikan citra asli; bintang latar memakai 757 bintang sungguhan (titik garis rasi), bukan titik acak; bagian Why diganti panel pembanding (satu citra SPHEREx lawan jejak 16 tahun Barnard's Star) tanpa coretan. Diuji di Chromium headless: seret, momentum, bacaan (Scorpius), bidikan (tautan `/sky?ra=&dec=`), Esc, cuplikan penanda, panel diseret dan digeser dengan panah, ponsel 390 px, enam ukuran layar tanpa tabrakan, gerak dikurangi, tanpa WebGL, bola tetap median 16,7 ms per bingkai.
  - Untuk Nayla: teks Inggris landing page ada di `web/src/landing/Landing.tsx`, `Why.tsx`, dan `Features.tsx`. Baris kaki "Built for NASA Space Apps 2026" perlu dicek terhadap aturan penamaan NASA.
- **KEPUTUSAN (Wildan, Alif, Nayla): lisensi repo pindah dari MIT ke AGPL-3.0-or-later.** Alasannya: mesin suara Alif akan memakai Strudel (AGPL) yang berjalan di browser, dan tim ingin semangat open source yang tinggi. Akibatnya: siapa pun yang menjalankan versi modifikasi SWARA untuk orang lain lewat jaringan wajib membuka kodenya; versi tertutup hanya mungkin kalau Strudel diganti. Tautan "Source · AGPL" selalu terlihat di kaki dialog Story (dulu The cards). Versi lama repo tetap MIT.
- **TEMUAN: citra selisih, bintang Gaia, dua isian koordinat, dan koleksi data sebagai pengaturan sudah jalan.** Keempat baris tabel challenge yang masih kosong atau sebagian sekarang terisi. Cara kerjanya di [pipeline/README.md](pipeline/README.md) dan [web/DESIGN.md](web/DESIGN.md).
  - **Citra selisih** dihitung di viewer dari dua frame, setelah tingkat abu dikembalikan ke satuan aslinya dengan `knee` dan `vmax` yang tercatat di bundle. Diperiksa pada Barnard's Star di data WISE: jarak inti "sekarang" ke inti "dulu" cocok dengan gerak diri katalog dalam 0,5 detik busur di empat epoch (2024 dikurangi 2010: terukur 142,7 detik busur ke utara, katalog 142,5).
  - **Gaia DR3** diambil pipeline dari arsip Gaia ESA (sekitar 3 detik per tempat) dan disimpan sebagai `gaia.json`. Arsip ESA tidak mengizinkan panggilan dari browser, dan layanan VizieR tidak terjangkau dari jaringan saat diuji, jadi pengambilannya tidak dilakukan di viewer. Selisih cincin Gaia terhadap puncak terang bintangnya: median 0,3 sampai 0,8 detik busur di tiga medan, sampai sekitar 3 detik busur (satu piksel WISE) di medan Epsilon Indi B dan R Draconis.
  - Barnard's Star dan Epsilon Indi B: bintang Gaia yang digeser dengan gerak dirinya ke 2026 jatuh di posisi bundle (selisih 0,0 detik busur).
  - **WISE 0855 tidak ada di Gaia.** Bintang Gaia terdekat berjarak 6,8 detik busur dari posisi yang diharapkan (G 16,3, gerak hampir nol), dan cincinnya jatuh tepat di sumber yang diukur SPHEREx. Jadi yang terukur di sana memang bintang latar; ini menguatkan catatan "tidak terpisah", bukan mengubahnya.
  - **Isian RA dan Dec** diuji dengan 8 cara penulisan yang benar dan 7 yang salah; semuanya terbaca atau ditolak seperti seharusnya.
  - **`SWARA_COLLECTIONS`**: bawaan menemukan 362 eksposur Barnard's Star, sama dengan yang tercatat di bundle.
  - Belum diuji: ponsel asli, Safari, Firefox. Bundle koordinat bebas yang dibuat sebelum ini belum punya `gaia.json` sampai `skychange gaia` dijalankan di server.
- **KEPUTUSAN (Wildan): logo SWARA, dok bergaya skala instrumen, dan peta seluruh langit memenuhi layar.** Logo: tanda cakram ambar dengan bintang empat sudut berlubang, dan nama SWARA digambar satu garis; dipilih dari enam jenis dan lima variasi tanda. Dok: kotak panel diganti skala yang terukir, baris diberi label II Path dan III Light. Peta: elips sebesar layar, kontrol di sudut kosongnya. Usulan bingkai dan dek kartu di sisi peta ditolak karena terlalu ramai; ruang kosong tidak dijawab dengan menambah panel atau kartu. Rinciannya di [web/DESIGN.md](web/DESIGN.md).
- **KEPUTUSAN (Wildan): bilah atas diberi karakter ukiran kartu, Guide berganti nama jadi "The cards", dan ada mode fokus layar penuh (F).** Alasannya: bilah lama terasa seperti aplikasi biasa dan "Guide" menjanjikan petunjuk padahal isinya cerita benda. Dok bawah belum diubah. Rinciannya di [web/DESIGN.md](web/DESIGN.md).
- **TEMUAN: menyelam dari seluruh langit tersendat karena bug penjadwalan, sudah diperbaiki.** Tiap bingkai gerak otomatis menjadwalkan lukisan dua kali, jadi jumlahnya berlipat dua tiap bingkai. Di situs live sebelum: 108 bingkai dalam 6 detik, bingkai terpanjang 1,7 detik; sesudah: 390 bingkai, terpanjang 17,7 ms. Uji kecepatan berikutnya perlu mengukur tiap gerak otomatis, bukan hanya geser.
- **KEPUTUSAN (Wildan): Guide diganti bacaan tiga kartu, dan tarot serta rasi bintang mulai diterapkan sebagai sistem.** Alasannya: laci Guide terlalu banyak teks dan tidak menjelaskan bendanya. Syaratnya: boleh liar, tetapi tetap nyambung dengan desain kosmik yang sudah ada. Aturannya di [web/DESIGN.md](web/DESIGN.md): alat ukur saat orang mengukur, kartu saat SWARA bercerita.
  - Tombol Guide sekarang membuka tiga kartu yang digambar dari bundle di layar: tempatnya (rasi di atas peta SPHEREx asli), jalannya (tumpukan WISE, satu sinar per pengamatan), cahayanya (spektrum sebagai sinar). Sisi belakang tiap kartu memuat rincian data yang dulu ada di Guide. Di peta seluruh langit isinya satu kartu.
  - Kartu yang tidak terbaca tampil tertelungkup dengan alasannya: Barnard's Star, RW Aurigae, dan R Draconis (terlalu terang untuk spektrum bersih), WISE 0855 (tidak terpisah dari bintang latar).
  - Fakta di kartu semuanya hitungan: rasi dari batas IAU, lintang galaktik, lintang Bumi tempat benda itu tidak pernah terbit (90 dikurangi deklinasi), dan waktu melintasi lebar Bulan purnama (1865 detik busur dibagi laju terukur; Barnard's Star sekitar 180 tahun, Epsilon Indi B sekitar 420 tahun).
  - Diuji di browser lokal (Chromium headless): lima contoh, menunjuk sinar di kartu II dan III, membalik ketiga kartu, Keys and sources, look Glacier dan Paper, kartu seluruh langit, layar 1366 x 768, dan layar 390 px dengan geser dan ketuk. Belum diuji: ponsel asli, Safari, Firefox, pembaca layar.
  - Untuk Nayla: kalimat pembuka di kepala dialog diambil dari kalimat pertama `TARGET_NOTES` di `web/src/content.ts`. Kalau mau fakta kurasi per benda (jarak, jenis), di situ tempatnya.
- **TEMUAN: peta seluruh langit bisa diperbesar dan digeser sampai resolusi SPHEREx.** IRSA melayani peta DR1 sebagai potongan HiPS sampai order 5 (12,9 detik busur per piksel) yang boleh dibaca langsung dari browser. Viewer menggambarnya dengan WebGL di atas peta dasar, dalam proyeksi Hammer yang kerangkanya berputar ke utara-di-atas saat diperbesar. Menyelam ke satu tempat sekarang zoom yang menyambung sampai pandangan lebarnya. Rinciannya di [web/DESIGN.md](web/DESIGN.md).
  - Terukur di lokal (Chromium headless dengan GPU laptop): titik langit di bawah kursor bergeser paling banyak 0,41 px per langkah zoom; waktu per bingkai saat menggeser median 16,7 ms; pada medan 51 derajat titik ujung garis rasi jatuh di bintang peta dengan median selisih 0,70 px (33 bintang).
  - Peta pada zoom terdalam di Barnard's Star lawan pandangan lebar 40 menit busurnya: selisih letak 3,5 detik busur, korelasi 0,80.
  - Tiap potongan butuh sekitar 1 sampai 2 detik dari Indonesia. Potongan tujuan mulai dimuat saat penanda ditunjuk atau titik dibidik; kalau belum tiba, ujung gerak menyelam tampak lunak. Tidak ada permintaan ke IRSA sebelum orang memperbesar.
  - Menunjuk penanda sekarang menampilkan cuplikan citra asli tempat itu dan angka terukurnya.
  - Tanpa WebGL peta tetap tampil sebagai gambar diam (diuji dengan WebGL dimatikan).
- **TEMUAN: pembuka seluruh langit jalan.** Situs tanpa tautan ke satu tempat dibuka di peta seluruh langit SPHEREx DR1: tingkat terluar teleskop (seluruh langit, pandangan lebar 40′, lensa). Menjauh dari pandangan lebar atau tombol Whole sky membukanya; memilih penanda, tombol "Show me a moving star", atau titik yang dibidik membuat peta membesar ke titik itu lalu larut ke tempatnya. Cara kerja dan kontraknya di [pipeline/README.md](pipeline/README.md) dan [web/DESIGN.md](web/DESIGN.md).
  - Sumber: HiPS kubus SPHEREx DR1 di IRSA (rilis 1 November 2026), 102 panjang gelombang, data 30 April 2025 sampai 20 Mei 2026; enam peta dipakai, satu per band. Resolusinya sekitar 6,9 menit busur per piksel.
  - Diuji di browser: lima contoh dan enam look, bacaan koordinat di bawah penunjuk cocok dengan posisi (Orion terbaca 5h 35m 17s, −5° 23′ 24″), bidikan dan Esc, enam panjang gelombang, penanda menyelam tanpa gerak berpindah, kembali ke tempat terakhir, rantai zoom dua langkah dari pandangan lebar, tautan langsung, gerak dikurangi, layar 390 px, dan pesan saat API tidak terjangkau (permintaan sengaja digagalkan). Bidikan sampai ke tempat diuji dengan respons API yang dimock ke bundle yang sudah ada.
  - Pratinjau "dibaca sebagai" di "Go to" membaca bentuk yang sama dengan server (dua angka sebagai derajat, enam angka sebagai jam dan derajat); hasilnya sama dengan server pada sebelas contoh.
- **KEPUTUSAN (Wildan): tarot dan rasi bintang jadi DNA desain SWARA ke depan.** Alasannya: orang sudah akrab dengan bahasa itu, jadi ia memancing orang untuk melihat dan membagikan. Logo belum ada dan perlu dibuat. Urutannya: fitur dulu, identitas visual sesudahnya. Cara memakainya ditulis di [web/DESIGN.md](web/DESIGN.md): tarot memberi formatnya, langit memberi isinya.
- **TEMUAN: kartu berbagi jalan.** Share sekarang membuka dialog kartu 1080 x 1920 yang dilukis dari bundle di layar: kartu gerak (citra WISE ditumpuk, satu sinar per pengamatan pada tanggalnya) dan kartu cahaya (spektrum sebagai sinar). Julukannya mengikuti yang terukur SPHEREx.
  - Diuji di browser pada lima contoh dengan enam look, satu nama yang dicari, dan satu koordinat bebas. Kartu cahaya muncul untuk Epsilon Indi B; untuk Barnard's Star, RW Aurigae, dan R Draconis tidak, karena titik bersihnya terlalu sedikit, dan dialognya mengatakan itu.
  - WISE 0855: tumpukan WISE memperlihatkan jejaknya, tetapi yang terukur SPHEREx di posisi itu adalah bintang latar. Kartunya menulis bahwa keduanya tidak terpisah, dan kartu cahaya tidak dibuat.
  - Semua kode QR dari kartu yang diekspor terbaca pemindai OpenCV. Belum dicoba: memindai dengan kamera ponsel, dan lembar berbagi berkas di ponsel asli.
  - Gerak katalog hanya tertulis di kartu untuk nama yang dicari; untuk lima contoh angkanya tidak ada di bundle.
- **TEMUAN: enam look terkurasi.** Ember, Glacier, Aurora, Nebula, Mono, Paper. Terang relatif tiap peta diperiksa di 256 tingkat: lima naik terus, Paper turun terus, tidak ada yang berbalik arah. Masukan teman Wildan: Copy link dan Notes tidak terasa bisa diklik; keduanya diganti Share (berbingkai aksen) dan Guide (dengan penanda sampai dibuka, dimulai dengan legenda bergambar).
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
- **TEMUAN: bunyi spektrum bisa menyerupai Scan saat datanya jarang.** Pemeriksaan bundle menunjukkan Barnard's Star hanya mengisi 14-15 dari 48 langkah spektrum per kunjungan (33-34 langkah kosong); Epsilon Indi B mengisi 30-46 langkah. Celah memakai tick yang sama (1.400 Hz, gain 0,12), sehingga Barnard terdengar seperti deretan tick.
- **KEPUTUSAN:** modal Listen punya pilihan Pindai, Spektrum, dan Gerak. Spektrum hanya membunyikan data spektrum dengan resep utama (`SOUND`); Gerak membunyikan riwayat posisi saja, tanpa spektrum. Tombol gerak terpisah di dok dihapus; penanda gerak di baris soundwave mengikuti kunjungan yang sedang berbunyi. Build dan uji unit lolos; uji dengar manual masih perlu dilakukan.
- **TEMUAN: alur sonifikasi bundle koordinat bebas diuji dengan Wolf 359.** Pencarian API menghasilkan bundle 3 kunjungan, 6 frame tiap kunjungan, 291 titik spektrum, dan 3 pengukuran gerak stabil. Ketiga kunjungan memenuhi syarat spektrum (102, 118, 38 titik layak); ekstraksi Pindai dengan frame dan mask PNG 480×480 menghasilkan 32 kolom, 9 kolom berpuncak, 13 puncak, satu berflag.
- **KEPUTUSAN:** kelayakan suara spektrum dinilai per kunjungan, bukan gabungan semua kunjungan. Visit dengan sedikitnya 8 titik yang dapat dipakai dan median SNR minimal 3 dapat diputar sendiri; visit redup, jenuh tanpa nilai, atau terlalu jarang dilewati. Skala nada gerak tetap lintas objek dan nilai di luar rentang mencapai batas nada/pan.
- **KEPUTUSAN:** suara spektrum dan gerak mengikuti visit yang punya setidaknya satu frame band siap; saat band terpilih tidak tersedia di visit itu, viewer pindah ke band frame yang tersedia. Pindai tetap memakai band yang sedang dipilih.
- **KEPUTUSAN:** Listen memadukan pindai gambar, spektrum, dan gerak pada jam visit bersama selama 10,88 detik; celah antar-visit 0,8 detik. Timbre dibedakan dengan sintesis lokal (pindai perkusi, spektrum halus, gerak lonceng), level campuran dinormalisasi otomatis, dan lapisan/visit tanpa data dilewati serta diumumkan.
- **KEPUTUSAN:** rasa sonifikasi gabungan memakai intensitas fluks untuk pitch dan volume bertahap, partial yang makin hangat pada fluks tinggi, denting untuk bintang kontras saat dipindai, serta ambience sintetis (drone rendah yang membangun perlahan, organ, string, piano, dan reverb panjang). Jika semua data suara tak tersedia, ambience tenang tetap diputar; guide menyebut bahwa “hangat” menandai fluks terang, bukan ukur suhu benda.
