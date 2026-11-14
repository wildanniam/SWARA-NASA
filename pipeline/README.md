# skychange: pipeline data SPHEREx

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

## API koordinat bebas

Viewer memakai API ini untuk koordinat di luar preset. Dari folder `pipeline/`:

```bash
uv run skychange serve
```

API berjalan di `http://127.0.0.1:8000`; dev server viewer meneruskan `/api` ke sana. Preset tidak membutuhkan API.

| Permintaan | Isi |
|---|---|
| `POST /api/sky` dengan `{"ra": "...", "dec": "..."}` | Mulai membuat bundle, atau langsung `ready` kalau sudah pernah dibuat. Jawabannya keadaan pekerjaan, termasuk `id`. |
| `GET /api/sky/<id>` | Keadaan pekerjaan: `status` (`queued`, `running`, `ready`, `error`), `stage` (`search`, `fetch`, `frames`), `done`, `total`, `error` (`no_data`, `failed`). |
| `GET /api/bundles/<id>/...` | Berkas bundle, bentuknya sama dengan preset. |

`ra` dan `dec` boleh derajat desimal (`133.7951`, `-7.2451`) atau jam-menit-detik (`08h55m10.831s`, `-7d14m42.53s`, `08:55:10.8`). Angka polos dibaca sebagai derajat. Koordinat dibulatkan ke 4 desimal (0,36 detik busur) dan itu menjadi `id`.

Bundle koordinat bebas disimpan di `data/bundles/` (tidak ikut git), jadi koordinat yang sama tidak dibuat dua kali. Paling banyak dua bundle dibuat bersamaan; sisanya menunggu. Keadaan pekerjaan hanya disimpan di memori: kalau API dimatikan di tengah pembuatan, kirim ulang koordinatnya.

## Isi bundle

| Berkas | Isi |
|---|---|
| `manifest.json` | target, jendela waktu, band, daftar frame, gerak terukur |
| `spectrum.json` | satu titik per eksposur: panjang gelombang, fluks, penanda |
| `frames/<jendela>_<band>.png` | citra abu-abu 240x240, utara di atas, timur di kiri |
| `frames/<jendela>_<band>_mask.png` | 0 = baik, 128 = rusak/hilang, 255 = jenuh |

**Jendela waktu** (`w1`, `w2`, ...): SPHEREx melewati satu lokasi kira-kira tiap 6 bulan; eksposur yang terpisah lebih dari 30 hari masuk jendela berbeda.

**Band** (`D1`-`D6`): enam detektor SPHEREx, 0,75-5,0 mikron. Satu frame = median semua eksposur detektor itu dalam satu jendela. Skala terang sama untuk semua jendela dalam satu band, jadi perubahan terang antar waktu itu nyata. Inti bintang yang jenuh dan tidak punya nilai ditampilkan putih penuh; topengnya tetap menandai piksel itu sebagai jenuh.

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
