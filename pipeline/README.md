# skychange: pipeline data SPHEREx untuk SWARA

Mengubah satu koordinat langit menjadi "bundle" siap tampil: frame yang sudah diselaraskan untuk di-blink, dan spektrum untuk sonifikasi. Data diambil dari arsip publik NASA/IPAC IRSA (SPHEREx level-2), tanpa login.

## Pakai

Butuh [uv](https://docs.astral.sh/uv/). Dari folder `pipeline/`:

```bash
uv sync
```

```bash
uv run skychange presets
```

```bash
uv run skychange build --id barnard --name "Barnard's Star" --ra 269.44627 --dec 4.76821
```

Hasil ditulis ke `bundles/<id>/`. Cutout disimpan di `data/cache/` (tidak ikut git), jadi menjalankan ulang tidak mengunduh lagi. Target preset ada di `presets.json`.

## Saat rilis data baru

Koleksi SPHEREx yang dicari diatur lewat `SWARA_COLLECTIONS` (dipisah koma, urutan = prioritas bila eksposur yang sama ada di dua koleksi). Bawaannya `spherex_dr1,spherex_qr3`. Saat IRSA merilis koleksi baru, cukup tambahkan namanya, tanpa mengubah kode:

```
SWARA_COLLECTIONS=spherex_dr2,spherex_dr1,spherex_qr3 uv run skychange presets
```

Di server, baris yang sama ditaruh di `/etc/swara-api.env`. Koleksi yang dipakai tercatat di `manifest.json` (`source.collections`). Peta seluruh langit dibuat ulang dengan `skychange allsky`; alamat HiPS-nya tercatat di `bundles/allsky/manifest.json` dan dibaca viewer dari sana.

## API koordinat bebas

Viewer memakai API ini untuk koordinat di luar preset. Dari folder `pipeline/`:

```bash
uv run skychange serve
```

API berjalan di `http://127.0.0.1:8000`; dev server viewer meneruskan `/api` ke sana. Preset tidak membutuhkan API.

| Permintaan | Isi |
|---|---|
| `POST /api/sky` dengan `{"query": "..."}` | Mulai membuat bundle, atau langsung `ready` kalau sudah pernah dibuat. Jawabannya keadaan pekerjaan, termasuk `id`; untuk pencarian nama juga `label` dan `pm_arcsec_yr` (gerak diri katalog). |
| `GET /api/sky/<id>` | Keadaan pekerjaan: `status` (`queued`, `running`, `ready`, `error`), `stage` (`search`, `fetch`, `frames`), `done`, `total`, `error` (`no_data`, `archive` bila layanan SIA IRSA tetap tidak menjawab setelah dicoba ulang, `failed`). |
| `GET /api/bundles/<id>/...` | Berkas bundle, bentuknya sama dengan preset. |

`query` boleh koordinat atau nama benda:

- **Koordinat:** dua angka polos dibaca sebagai derajat (`133.7951 -7.2451`); bentuk lain sebagai jam-menit-detik untuk RA dan derajat untuk Dec (`08h55m10.831s -7d14m42.53s`, `08:55:10.8 -07:14:42`).
- **Nama:** apa pun yang bukan koordinat dicari di SIMBAD lewat CDS Sesame (`resolve.py`). Posisi SIMBAD berlaku untuk tahun 2000, jadi digeser dengan gerak diri katalog ke 2026 supaya benda yang bergerak cepat ada di tengah medan. Kalau SIMBAD tidak mencatat gerak diri, posisi tahun 2000 dipakai apa adanya.

Koordinat dibulatkan ke 4 desimal (0,36 detik busur) dan itu menjadi `id`.

Bundle koordinat bebas disimpan di `data/bundles/` (tidak ikut git), jadi koordinat yang sama tidak dibuat dua kali. Paling banyak dua bundle dibuat bersamaan; sisanya menunggu. Keadaan pekerjaan hanya disimpan di memori: kalau API dimatikan di tengah pembuatan, kirim ulang koordinatnya.

## Isi bundle

| Berkas | Isi |
|---|---|
| `manifest.json` | target, jendela waktu, band, daftar frame, gerak terukur |
| `spectrum.json` | satu titik per eksposur: panjang gelombang, fluks, penanda |
| `frames/<jendela>_<band>.png` | citra abu-abu 480x480 selebar 6 menit busur, utara di atas, timur di kiri |
| `frames/<jendela>_<band>_mask.png` | 0 = baik, 128 = rusak/hilang, 255 = jenuh |
| `context.png` | citra medan lebar 40 menit busur di sekitar posisi, 720x720, utara di atas, timur di kiri |
| `wise/NN.png` | citra WISE W2 (4,6 mikron) per epoch, 2010-2024, medan yang sama dengan frame; untuk dilihat, bukan diukur |
| `gaia.json` | bintang Gaia DR3 di medan itu, untuk ditimpakan di lensa |

**Jendela waktu** (`w1`, `w2`, ...): SPHEREx melewati satu lokasi kira-kira tiap 6 bulan; eksposur yang terpisah lebih dari 30 hari masuk jendela berbeda.

**Band** (`D1`-`D6`): enam detektor SPHEREx, 0,75-5,0 mikron. Satu frame = median semua eksposur detektor itu dalam satu jendela. Skala terang sama untuk semua jendela dalam satu band, jadi perubahan terang antar waktu itu nyata. Inti bintang yang jenuh dan tidak punya nilai ditampilkan putih penuh; topengnya tetap menandai piksel itu sebagai jenuh.

**Pratinjau selagi dibuat.** Bundle koordinat bebas butuh sekitar satu setengah menit. Supaya ada yang bisa dilihat lebih dulu, riwayat WISE dan citra medan lebar dibuat paling awal dan dicatat di `preview.json` di folder bundle: bentuknya seperti `manifest.json` dengan `preview: true`, tanpa jendela waktu, frame, atau gerak. Keadaan pekerjaan (`GET /api/sky/{id}`) menyebut `wise` dan `context` begitu masing-masing siap, dan `seen_um`: panjang gelombang yang diamati tiap eksposur yang sudah terbaca. `preview.json` dihapus saat `manifest.json` ditulis.

**Pembacaan dan kecepatan.** Berkas level-2 berukuran sekitar 65 MB dan tersimpan di bucket publik di us-east-1. `remote.py` membaca hanya yang dibutuhkan dengan lima permintaan per eksposur: awal berkas (header), baris IMAGE yang memuat potongan, tabel penunjuk FLAGS dan baris terkompresinya, dan tabel panjang gelombang di akhir berkas. Kalau susunan sebuah berkas berbeda dari yang diandaikan, pembacaan kembali ke astropy dan fsspec, yang butuh sekitar 360 permintaan per eksposur. Saat menyusun frame, transformasi langit ke piksel dihitung di kisi 16 piksel keluaran dan diinterpolasi (`frames.coarse_map`); galat posisinya terukur sekitar 0,00001 piksel detektor. Satu posisi baru dengan sekitar 300 eksposur selesai dalam kira-kira 1 sampai 1,5 menit.

**Medan frame.** Frame dibuat selebar 6 menit busur (`fov_arcsec: 360`, `frame_px: 480`). Viewer memperbesar bagian tengahnya (2 atau 3 menit busur) untuk membandingkan kunjungan SPHEREx, dan memakai seluruh medan saat memutar riwayat WISE. Bundle lama selebar 2 menit busur tetap bisa dibuka.

**Riwayat WISE** (folder `wise/`, isian `wise` di manifest): deretan citra W2 dari koad unWISE per epoch, diambil dari layanan WiseView (proyek Backyard Worlds: Planet 9). `frames` berisi `id`, `image`, `mjd_mid`, `date_start`, `date_end`; `pixel_arcsec` adalah skala pikselnya (2,75) dan `target_px` letak posisi bundle di citra itu, dalam piksel dari kiri atas. Citra di tepi petak unWISE bisa terpotong, jadi `size_px` tidak selalu persegi. Supaya deretan WISE lalu SPHEREx tidak meloncat tampilannya, citra WISE ditulis ulang dengan aturan frame SPHEREx (`matched: true`): layanan diminta mengirim rentang terang lebar dengan regangan asinh, lalu citranya dikembalikan ke satuan unWISE, inti bintang jenuh yang kosong diisi, dihaluskan 3 detik busur ke ketajaman frame SPHEREx, latarnya dikurangi, dan diregangkan dengan `frames.stretch` (lutut 3 kali derau latar, sama untuk semua epoch). Angka yang dipakai tercatat di `display`. Ini untuk dilihat, bukan fotometri. Isian `wise` bisa `null` kalau layanan tidak menjawab; bundle tetap sah.

**Citra medan lebar** (`context.png`, isian `context` di manifest): median 4 eksposur detektor 2 (1,10-1,63 mikron) yang dipotong jauh lebih lebar dari frame blink. Dipakai viewer sebagai latar langit. Ini untuk suasana dan orientasi, bukan untuk diukur: latar tiap eksposur diratakan per baris dan kolom, tidak ada topeng piksel, dan inti bintang jenuh diisi putih. Isian `context` bisa `null` kalau citranya gagal dibuat; bundle tetap sah. Untuk menambahkannya ke bundle lama tanpa membuat ulang frame:

```bash
uv run skychange context
```

**Bintang Gaia** (`gaia.json`, isian `gaia` di manifest): bintang Gaia DR3 dalam radius setengah diagonal medan ditambah 120 detik busur (cadangan untuk bintang cepat), diambil dari arsip Gaia ESA lewat TAP (sekitar 3 detik). Paling banyak 400 bintang, dari yang paling terang; `truncated: true` berarti medan itu lebih padat dari itu dan `faintest_g_mag` adalah batasnya. Tiap baris `stars`: `[ra, dec, pmra, pmdec, G, source_id]`, posisi dalam derajat pada epoch 2016,0, gerak diri dalam milidetik busur per tahun (`pmra` sudah dikali cos dec; `null` kalau Gaia tidak mengukurnya), `source_id` sebagai teks. Viewer menaruh tiap bintang di posisinya pada tanggal citra yang tampil. Arsip itu tidak mengizinkan panggilan dari browser, jadi berkas ini dibuat pipeline. Isian `gaia` bisa `null` atau tidak ada (bundle lama); bundle tetap sah. Menambahkannya ke bundle yang sudah ada:

```bash
uv run skychange gaia
```

**Citra selisih** tidak disimpan di bundle: viewer menghitungnya sendiri dari dua frame. `knee_mjy_sr` dan `vmax_mjy_sr` di tiap frame (dan `wise.display` untuk WISE) adalah yang membuat tingkat abu bisa dikembalikan ke satuan aslinya sebelum dikurangkan, jadi keduanya jangan dihapus.

## Peta seluruh langit (`bundles/allsky/`)

Pembuka viewer: seluruh langit menurut peta langit penuh SPHEREx DR1 dari IRSA (HiPS kubus, 102 panjang gelombang, data April 2025 sampai Mei 2026). Dibuat sekali di mesin sendiri, lalu ikut git sebagai berkas statis:

```bash
uv run --extra sky skychange allsky
```

| Berkas | Isi |
|---|---|
| `sky_D1.png` ... `sky_D6.png` | peta abu-abu 2048x1024, satu per band: saluran tengah band itu |
| `sky_D1_small.png` ... | versi 1024x512 untuk layar kecil |
| `manifest.json` | sumber, proyeksi, daftar peta, benda berlabel, dan rasi |

**Proyeksi.** Hammer-Aitoff dalam koordinat galaktik: Bima Sakti mendatar, pusat galaksi di tengah, bujur naik ke kiri. Di luar elips bernilai 0. `projection.icrs_to_galactic` adalah matriks putar astropy; viewer memakainya bersama rumus yang sama (`web/src/lib/allsky.ts`) untuk menaruh penanda dan membaca koordinat di bawah penunjuk.

**Sumber.** Pratinjau `Norder3/Allsky_F.png` dari HiPS (768 tile 64 piksel, sekitar 6,9 menit busur per piksel; nilainya sudah diregangkan asinh, potong 0-40). Tile disusun ulang menjadi peta HEALPix lalu diinterpolasi bilinear ke proyeksi. Susunan piksel di dalam tile dipastikan dari data, dan tiap kali dibuat diperiksa lagi: titik ujung garis rasi (757 bintang terang) harus jatuh di piksel terang (median 77 lawan 12 di titik acak).

**`frames`**: `band`, `frame` (indeks kubus: 17 x (band - 1) + saluran - 1), `lambda_um`, `band_min_um` dan `band_max_um` (rentang saluran band itu), `image`, `small`.

**`constellations`**: `names` (nama rasi per singkatan IAU), `labels` (titik label), `lines` (garis rasi, RA dan Dec dalam derajat), dan `grid`: singkatan rasi di kisi 0,5 derajat dari batas resmi IAU (astropy), dipadatkan per baris sebagai pasangan (indeks, panjang). Garis rasi dari d3-celestial oleh Olaf Frohn (lisensi BSD-3-Clause, commit dicatat di `source`).

**Zoom di viewer.** Enam peta ini adalah lapis dasar. Saat peta diperbesar, viewer membaca potongan HiPS yang sama langsung dari IRSA (`<source.url>/Norder{k}/Dir{10000*floor(n/10000)}/Npix{n}_{frame}.png`, order 1 sampai 5, 512 piksel per potongan, 12,9 detik busur per piksel di order 5) dan menaruhnya di atas lapis dasar; `source.url` dan `frames[].frame` di manifest adalah yang dipakainya. Susunan piksel di dalam potongan sama dengan yang dipastikan di sini.

Peta ini untuk orientasi; tidak ada yang diukur darinya. Beberapa bercak hitam di dekat daerah yang sangat terang adalah celah di peta SPHEREx sendiri.

## spectrum.json (kontrak untuk sonifikasi)

SPHEREx memakai filter yang panjang gelombangnya berubah di sepanjang detektor, jadi tiap eksposur melihat target di panjang gelombang yang berbeda. Titik-titik dalam satu jendela membentuk spektrum. `points` sudah diurutkan per jendela lalu per panjang gelombang.

| Kolom | Arti |
|---|---|
| `window` | jendela waktu (`w1`, ...) |
| `lambda_um` | panjang gelombang, mikron |
| `bandwidth_um` | lebar pita di titik itu, mikron |
| `flux_jy`, `flux_err_jy` | fluks dan galatnya, jansky |
| `snr` | fluks dibagi galat |
| `detected` | `true` kalau ada puncak jelas (> 5 sigma); kalau `false`, fluks diukur di koordinat nominal |
| `flag` | `ok`, `saturated`, `saturated_core`, atau `bad_pixel` |
| `flagged` | `true` kalau `flag` bukan `ok` |
| `missing_pixels` | jumlah piksel tanpa nilai di dalam apertur |
| `ra`, `dec` | posisi terukur di eksposur itu (derajat) |
| `date`, `mjd`, `detector`, `obs_id` | asal eksposur |

Arti `flag`:

- `ok`: tidak ada masalah.
- `saturated`: SPHEREx menandai overflow, tapi semua piksel punya nilai. Bentuk spektrumnya konsisten antar jendela; akurasi nilai mutlaknya belum diverifikasi.
- `saturated_core`: inti bintang tidak punya nilai. Fluks tidak bisa dipakai.
- `bad_pixel`: ada piksel rusak atau hilang di apertur.

## Batas

- Fluks = jumlah kotak 5x5 piksel setelah latar dikurangi, tanpa koreksi apertur dan tanpa pemisahan bintang tetangga. Cukup untuk bentuk spektrum, bukan fotometri kelas publikasi.
- Posisi target dicari dalam radius 3 piksel (sekitar 18 detik busur) dari koordinat masukan. Di medan padat, bintang tetangga yang lebih terang bisa terambil.
