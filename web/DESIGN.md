# Arah desain viewer

Sumber acuan tampilan untuk `web/`. Ubah di sini dulu kalau mau mengganti arah visual.

## Bacaan desain

Alat yang imersif untuk pemula yang penasaran. Suasananya **melayang di angkasa**; kendalinya **ruang kendali teleskop**: sedikit, jelas, dan terasa seperti alat ukur. Dibangun dengan CSS dan canvas biasa, huruf Archivo (lebar) dan IBM Plex Mono, satu warna aksen ambar, dan citra SPHEREx asli sebagai suasananya.

Tingkat: variasi tata letak sedang, gerak sedang, kepadatan rendah.

## Aturan paling penting

**Yang data harus terlihat sebagai data, dan suasana tidak boleh menyamar sebagai data.**

- Lensa di tengah adalah data: citra SPHEREx 2 menit busur yang dipakai untuk mengukur. Warnanya hangat (panas inframerah).
- Latar adalah suasana, tapi tetap asli: citra SPHEREx 40 menit busur di sekitar posisi yang sama (`context.png`). Warnanya dingin (cahaya bintang) dan diredupkan, supaya tidak dikira bagian yang diukur.
- Tidak ada bintang karangan, pendar hias, atau gradien dekoratif. Gradien hanya dipakai sebagai tirai supaya teks terbaca.

## Pengguna dan tugas

Relawan pemula. Tugasnya tiga, berurutan: lihat apa yang bergerak atau berubah terang (blink), kenali benda itu apa (spektrum dan suara), lalu coba tempat sendiri (pergi ke).

## Susunan layar

Empat lapis, dari belakang ke depan:

1. **Latar langit.** Citra medan lebar memenuhi layar dan hanyut sangat pelan. Saat pindah tempat, latar lama bergeser pergi ke arah yang sebenarnya di langit dan latar baru datang dari arah sebaliknya.
2. **Panggung.** Lensa bundar di tengah, diapit dua blok teks: identitas benda di kiri, temuan di kanan.
3. **Dok kendali** di bawah, dua baris: waktu (blink dan kunjungan) dan cahaya (dengar dan spektrum).
4. **Lapis sementara:** dialog "pergi ke" dan laci catatan.

Urutan `z-index`: latar 0, tirai 1, panggung 2, bilah atas dan dok 3, laci 4, dialog 5.

## Komponen dan wataknya

- **Lensa.** Bundar, seperti medan pandang teleskop. Cincin luarnya bertanda derajat dengan huruf N dan E. Cincin itu juga penunjuk: terisi saat data dimuat, dan menyapu saat suara spektrum berjalan. Membuka dan menutup seperti diafragma.
- **Tanda acuan dan jejak.** Tanda silang ambar menandai posisi pada kunjungan pertama. Posisi terukur tiap kunjungan digambar sebagai titik yang tersambung, jadi geraknya terbaca walau blink dijeda.
- **Satelit.** Dua tombol bundar kecil menempel di cincin lensa: palet warna dan penanda piksel yang tidak bisa dipercaya.
- **Tombol putar.** Blink dan Dengar adalah tombol bundar besar. Hanya Blink yang berisi warna aksen.
- **Penggaris waktu.** Kunjungan diletakkan pada jarak tanggal yang sebenarnya, dengan pergeseran terukur di bawah tiap kunjungan.
- **Pita spektrum.** Selebar dok. Enam ruasnya adalah enam band citra: mengeklik satu ruas mengganti band di lensa. Saat suara berjalan, lensa ikut menampilkan band yang sedang terdengar.
- **Pergi ke.** Satu kotak untuk nama atau koordinat, lalu daftar benda contoh dengan cuplikan citra aslinya.
- **Catatan.** Laci di kanan untuk semua yang tidak perlu tampil terus: rincian data, cara membaca spektrum, cara kerja suara, dan tombol papan ketik.

## Bentuk

Satu aturan: **yang bisa ditekan berbentuk bulat penuh** (lingkaran atau pil); **panel bersudut 18 px**; lensa lingkaran. Garis tepi 1 px. Tidak ada bayangan dan tidak ada kaca buram tebal; panel memakai warna gelap setengah tembus.

## Warna

| Token | Nilai | Dipakai untuk |
|---|---|---|
| `--void` | `#05060b` | ruang kosong |
| `--panel` | `rgba(8, 10, 17, 0.84)` | dok, laci, dialog |
| `--hair`, `--hair-strong` | putih kebiruan 14% dan 30% | garis |
| `--text` | `#f2efe8` | teks utama |
| `--muted` | `#a3a4b3` | teks pendukung |
| `--faint` | `#7d7f94` | tanda skala, label kecil |
| `--accent` | `#ffb454` | satu-satunya aksen: tanda acuan, Blink, pilihan aktif, penunjuk |
| `--flag-sat`, `--flag-bad` | merah, biru | hanya untuk mutu data |

Tampilan ini hanya gelap, karena citra astronomi gelap dan bintang redup harus terbaca.

## Huruf

- **Archivo dengan lebar 125%**, huruf besar, untuk nama benda: seperti tulisan di panel pesawat dan lencana misi.
- **Archivo lebar normal** untuk teks.
- **IBM Plex Mono** untuk semua bacaan alat: tanggal, panjang gelombang, koordinat, pergeseran.

Penekanan memakai tebal atau miring dari keluarga yang sama, bukan huruf lain. Teks antarmuka tidak memakai tanda pisah panjang.

## Ikon

Satu keluarga: Phosphor, ketebalan `regular` (`fill` hanya untuk putar dan jeda). Gambar alat (cincin, tanda silang, kompas arah) dibuat dari data, bukan ikon.

## Gerak

Tiap gerak punya alasan:

| Gerak | Artinya |
|---|---|
| Blink berpindah tanpa pudar | mata menangkap gerak dari loncatan |
| Latar bergeser saat pindah tempat | teleskop diarahkan ke bagian langit lain, dengan arah yang benar |
| Lensa membuka seperti diafragma | data untuk tempat ini sudah siap |
| Cincin terisi atau menyapu | progres muat atau posisi suara |
| Latar hanyut sangat pelan | rasa melayang |

Dengan `prefers-reduced-motion`: tidak ada hanyut dan geser, lensa langsung terbuka, dan blink tidak mulai sendiri.

## Keadaan yang wajib ada

Memuat (cincin berputar), membuat bundle baru (cincin terisi sesuai jumlah eksposur), gagal (pesan dan coba lagi), tanpa data SPHEREx, tanpa spektrum (pita tetap menjadi pemilih band dan menjelaskan alasannya), posisi tidak terlacak, layanan tidak terjangkau. Semua kendali punya keadaan hover, fokus (garis luar ambar 2 px), ditekan, aktif, dan nonaktif.

## Jujur soal data

Tetap tampil: tanggal kunjungan nyata, pergeseran terukur beserta batas ketelitiannya, titik spektrum yang ditandai jenuh, dan alasan kalau sesuatu tidak bisa diukur. Catatan menyebut bahwa latar adalah citra SPHEREx sungguhan dan apa bedanya dengan lensa.

## Layar kecil

Di bawah 860 px semuanya satu kolom dan halaman bisa digulir: lensa, temuan, identitas, lalu dok. Laci dan dialog memenuhi layar.

## Yang dihindari

Kartu di dalam kartu, label huruf besar kecil di atas tiap bagian, titik status hias, garis bidik hias, kursor khusus, angka tanpa satuan, dan teks pemasaran.
