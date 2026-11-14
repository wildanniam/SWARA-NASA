# Pengukuran ambang sapuan 32 kolom (task 1.1)

Diukur 2026-11-14 dari PNG display bundle (`frames/<w>_<band>.png`, 480x480 abu 8-bit)
dengan decoder stdlib (`/tmp/opencode/scan_measure.py`, tidak di-commit).
Metode per frame: 32 kolom (15px), profil vertikal = rata-rata baris per kolom
dihaluskan 3px, puncak = maksimum lokal dengan jarak min 6px, maks 5 per kolom.
Latar `bg` = median; `sig` = persentil-68 simpangan di atas latar (MAD = 0 di
banyak frame karena >50% piksel tepat bernilai latar, jadi MAD tidak bisa dipakai).
Ambang kandidat: `thr = bg + k*sig`.

## Hasil per band (kunjungan pertama)

Kolom per frame: 32. `0x` = kolom tanpa puncak, `12x` = 1-2 puncak, `35x` = 3-5 puncak.

| Preset | Band | bg | sig | p98 | k=3 | k=4 | k=5 | k=6 |
|---|---|---|---|---|---|---|---|---|
| barnard | D1 | 5.0 | 29.9 | 127 | 18/14/0 | 23/9/0 | 27/5/0 | 30/2/0 |
| barnard | D5 | 2.0 | 23.6 | 107 | 19/12/1 | 23/8/1 | 27/5/0 | 28/4/0 |
| barnard | D6 | 1.0 | 20.6 | 103 | 18/14/0 | 21/11/0 | 26/6/0 | 27/5/0 |
| epsindb | D4 | 0.0 | 19.5 | 93 | 10/18/4 | 14/17/1 | 18/14/0 | 22/10/0 |
| epsindb | D5 | 0.0 | 11.2 | 71 | 8/20/4 | 10/20/2 | 14/18/0 | 18/14/0 |
| epsindb | D6 | 0.0 | 7.4 | 78 | 3/12/17 | 6/15/11 | 7/18/7 | 9/18/5 |
| rwaur | D1 | 0.0 | 25.7 | 122 | 4/23/5 | 12/20/0 | 18/14/0 | 24/8/0 |
| rwaur | D5 | 0.0 | 17.2 | 99 | 14/16/2 | 18/14/0 | 21/11/0 | 25/7/0 |
| wise0855 | D3 | 0.0 | 13.6 | 132 | 1/11/20 | 3/13/16 | 3/21/8 | 8/21/3 |
| wise0855 | D5 | 0.0 | 12.0 | 114 | 0/11/21 | 4/17/11 | 6/23/3 | 7/23/2 |
| rdra | D1 | 12.0 | 48.5 | 168 | 26/6/0 | 28/4/0 | 30/2/0 | 32/0/0 |
| rdra | D5 | 10.0 | 44.0 | 149 | 26/6/0 | 28/4/0 | 29/3/0 | 32/0/0 |

## Keputusan

- **Ambang: `thr = bg + 4*sig`, dihitung per objek per band** dari kunjungan
  pertama yang punya frame, dipakai untuk semua kunjungan band itu.
  k=3 terlalu penuh (wise0855 D5: 21 kolom 3-5 puncak), k=5/6 terlalu sepi
  (barnard/rdra hampir semua kolom kosong). k=4 tidak degenerat di mana pun:
  tidak ada band yang 0 kolom kosong maupun 32 kolom kosong, termasuk Eps Indi B.
- **Normalisasi volume: `top = min(255, round(p98*1.25))` per objek per band**,
  analog dengan `fluxTop` di suara spektrum. p98 terukur 71-206.
- **Target selalu kena:** kolom tengah (14-17) memuat puncak dalam 20px dari
  tengah (baris 240) di barnard, epsindb, rwaur D5 — earcon tengah bertemu puncak nyata.
- **Stabil antar kunjungan:** barnard D5 w1/w2/w3 bg=2/2/2, p98=107/107/106 —
  ambang dan normalisasi per objek per band sah dipakai lintas kunjungan;
  perbedaan terang antar waktu memang terdengar.
- Catatan jujur: R Dra sangat sepi (28/32 kolom kosong di k=4) karena intinya
  jenuh dan medannya kosong — sapuannya memang hampir sunyi di luar tick.
