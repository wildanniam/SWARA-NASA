# Arah desain viewer

Sumber acuan tampilan untuk `web/`. Ubah di sini dulu kalau mau mengganti arah visual.

## Bacaan desain

Alat yang imersif untuk pemula yang penasaran. Suasananya **melayang di angkasa**; kendalinya **ruang kendali teleskop**: sedikit, jelas, dan terasa seperti alat ukur. Dibangun dengan CSS dan canvas biasa, huruf Archivo (lebar) dan IBM Plex Mono, satu warna aksen ambar, dan citra SPHEREx asli sebagai suasananya.

Tingkat: variasi tata letak sedang, gerak sedang, kepadatan rendah.

## Arah identitas

Keputusan Wildan, 14 November 2026: **tarot dan rasi bintang** menjadi DNA visual SWARA ke depan. Orang sudah akrab dengan bahasa itu, jadi ia memancing orang untuk melihat dan membagikan.

Cara kita memakainya: tarot memberi **formatnya** (kartu tinggi, jendela melengkung, angka Romawi, pita julukan, sinar), langit memberi **isinya**. Tiap tempat yang di kartu tarot diisi hiasan, di sini diisi data. Emasnya adalah aksen ambar yang sudah ada, dan huruf tidak berubah.

Yang sudah memakai arah ini: kartu berbagi (lihat di bawah). Yang belum ada dan perlu dibuat setelah pekerjaan fitur: **logo** (sekarang hanya tanda sementara: cincin lensa dan satu titik), lalu penerapan arah ini ke halaman pembuka dan Guide. Viewer sendiri tetap ruang kendali teleskop; rasa alat ukurnya yang membuat datanya dipercaya.

## Aturan paling penting

**Yang data harus terlihat sebagai data, dan suasana tidak boleh menyamar sebagai data.**

- Lensa di tengah adalah data: citra SPHEREx yang dipakai untuk mengukur, 2 sampai 6 menit busur tergantung pembesaran. Warnanya hangat (panas inframerah).
- Citra WISE 2010-2024 juga tampil di lensa, tapi hanya untuk dilihat. Ia ditulis dengan aturan regangan yang sama dengan frame SPHEREx dan dihaluskan ke ketajaman yang sama, supaya yang berubah saat teleskop berganti adalah langitnya, bukan gaya gambarnya. Keterangan di bawah lensa selalu menyebut teleskopnya, dan tidak ada angka yang diukur dari WISE.
- Latar adalah langit yang sama pada pembesaran lebih kecil: citra SPHEREx 40 menit busur di posisi yang sama (`context.png`), dipusatkan tepat di bawah lensa dan memakai palet lensa. Lensa adalah bagian tengahnya yang diperbesar. Selama lensa terbuka latar diredupkan; di pandangan lebar ia tampil terang penuh.
- Latar tidak pernah digeser, diputar, atau dihanyutkan untuk hiasan: bintang di luar lensa harus tetap kelanjutan bintang di dalamnya. Ia hanya bergerak saat teleskop memang berpindah tempat.
- Tidak ada bintang karangan, pendar hias, atau gradien dekoratif. Gradien hanya dipakai sebagai tirai supaya teks terbaca.

## Pengguna dan tugas

Relawan pemula. Tugasnya tiga, berurutan: lihat apa yang bergerak atau berubah terang (blink), kenali benda itu apa (spektrum dan suara), lalu coba tempat sendiri (pergi ke).

## Susunan layar

Empat lapis, dari belakang ke depan:

1. **Latar langit.** Citra medan lebar, dipusatkan di pusat lensa; sisinya dihitung dari layar supaya menutup dari pusat lensa ke semua tepi. Saat pindah tempat, latar lama bergeser pergi ke arah yang sebenarnya di langit dan latar baru datang dari arah sebaliknya.
2. **Panggung.** Lensa bundar di tengah, diapit dua blok teks: identitas benda di kiri, temuan di kanan.
3. **Dok kendali** di bawah, dua baris: waktu (blink dan kunjungan) dan cahaya (dengar dan spektrum).
4. **Lapis sementara:** dialog "pergi ke" dan laci catatan.

Urutan `z-index`: latar 0, tirai 1, panggung 2, bilah atas dan dok 3, laci 4, dialog 5.

## Komponen dan wataknya

- **Lensa.** Bundar, seperti medan pandang teleskop. Cincin luarnya bertanda derajat dengan huruf N dan E. Cincin itu juga penunjuk: terisi saat data dimuat, dan menyapu saat suara spektrum berjalan. Membuka dan menutup seperti diafragma.
- **Rantai pembesaran.** Pandangan lebar (latar, 40 menit busur), lalu lensa 6, 3, dan 2 menit busur. Menjauh dari tingkat terlebar menutup lensa: ia mengecil sampai isinya tepat seukuran latar (skalanya dihitung dari skala latar, bukan angka tetap), lalu larut. Yang tersisa cincin ambar selebar petak yang diperbesar lensa; mengekliknya membuka lensa lagi. Membuka sebuah tempat selalu lewat urutan ini: langit lebar, lensa terbuka, lalu menyelam ke pembesaran kerja.
- **Berpindah tempat.** Lensa menutup, latar bergeser, dan baris di bawah lensa membaca posisi yang sedang dilewati di sepanjang busur lingkaran besar serta sisa jaraknya. Lama perpindahan mengikuti jarak sudut yang sebenarnya (0,8 sampai 2,4 detik).
- **Tanda acuan dan jejak.** Tanda silang ambar menandai posisi pada kunjungan pertama. Posisi terukur tiap kunjungan digambar sebagai titik yang tersambung, jadi geraknya terbaca walau blink dijeda.
- **Satelit.** Tombol bundar kecil menempel di cincin lensa: look, penanda piksel yang tidak bisa dipercaya, dan Reveal faint di kanan; perbesar dan perkecil di kiri.
- **Roda filter.** Tombol look membuka enam contoh warna yang berjajar di cincin, seperti roda filter teleskop: Ember (bawaan), Glacier, Aurora, Nebula, Mono, Paper. Semuanya dikurasi dengan satu aturan: terang selalu naik (untuk Paper selalu turun) dari nilai terendah ke tertinggi, jadi look mengubah suasana, bukan urutan terang. Tidak ada peta pelangi atau dua arah, dan tidak ada pengatur manual. Latar ikut look lensa (untuk Paper latar memakai Mono supaya teks tetap terbaca). Look tercatat di URL.
- **Reveal faint.** Satu tombol yang mengangkat nilai redup (kurva gamma) di lensa dan latar. Urutan terang tetap.
- **Share dan Guide.** Dua tombol di kanan atas adalah fitur, bukan catatan kaki. Share berbingkai aksen dan membuka dialog kartu berbagi. Selagi bundle tempat baru masih dibuat belum ada yang bisa digambar, jadi Share membagikan tautannya saja: lembar berbagi sistem di ponsel, salin di tempat lain. Guide berbingkai jelas dan diberi penanda sampai pernah dibuka; isinya dimulai dengan legenda bergambar tentang tanda-tanda di lensa.
- **Tombol putar.** Blink dan Dengar adalah tombol bundar besar. Hanya Blink yang berisi warna aksen.
- **Penggaris waktu.** Kunjungan diletakkan pada jarak tanggal yang sebenarnya, dengan pergeseran terukur di bawah tiap kunjungan.
- **Rentang waktu.** Sakelar dua pilihan di kiri penggaris: "16 years" memutar citra WISE lalu kunjungan SPHEREx pada satu penggaris 2010 sampai sekarang, dengan lensa selebar 6 menit busur; "SPHEREx" kembali ke kunjungan SPHEREx saja, diperbesar ke 2 menit busur. Benda yang punya riwayat WISE dibuka di "16 years".
- **Pita spektrum.** Selebar dok. Enam ruasnya adalah enam band citra: mengeklik satu ruas mengganti band di lensa. Saat suara berjalan, lensa ikut menampilkan band yang sedang terdengar.
- **Pergi ke.** Satu kotak untuk nama atau koordinat, lalu daftar benda contoh dengan cuplikan citra aslinya.
- **Guide.** Laci di kanan untuk semua yang tidak perlu tampil terus: rincian data, cara membaca spektrum, cara kerja suara, dan tombol papan ketik.

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

## Kartu berbagi

Gambar 1080 x 1920 (9:16, ukuran story) yang dilukis di kanvas dari bundle yang sedang tampil (`web/src/lib/card.ts`). Dialognya menampilkan kartu itu, lalu menyimpannya sebagai PNG, membagikannya lewat lembar berbagi sistem kalau sistem menerima berkas, atau menyalin tautan.

**Satu aturan: sinar adalah data.**

- **Kartu I, geraknya.** Jendela melengkung berisi semua citra WISE yang ditumpuk (tiap piksel mengambil nilai paling terang), jadi yang bergerak meninggalkan garis. Busur di atasnya adalah garis waktu: satu sinar per pengamatan pada tanggalnya, sinar WISE pendek dan sinar SPHEREx panjang. Tanpa riwayat WISE, jendelanya berisi frame SPHEREx dan busurnya hanya kunjungan SPHEREx.
- **Kartu II, cahayanya.** Spektrum sebagai 72 sinar mengelilingi frame SPHEREx, 0,75 sampai 5 mikron searah jarum jam; panjang sinar adalah terang. Hanya titik bersih yang dipakai; irisan tanpa titik bersih digambar sebagai titik kosong. Kartu ini hanya ada kalau sedikitnya sepertiga irisannya terisi.
- **Julukan mengikuti yang terukur SPHEREx**, sama dengan blok temuan: bergeser jadi THE WANDERER, tidak bergeser jadi THE STILL ONE, tidak terlacak jadi THE RIDDLE. Julukan adalah nama panggilan, bukan klasifikasi. Benda contoh yang tidak terpisah dari bintang latar (`BLENDED` di `content.ts`) selalu THE RIDDLE dan tidak punya kartu cahaya.
- **Warna kartu mengikuti look** yang dipakai di viewer: enam look, enam warna kartu. Garisnya memakai keluarga warna aksen look itu.
- **Yang murni hiasan** hanya bingkai, pita, dan bintang empat sudut, dan bintang empat sudut tidak pernah digambar di dalam jendela data.
- **Langit di belakang kartu** adalah citra medan lebar yang asli, redup. Dari tiga potongan yang mungkin dipakai yang paling sedikit piksel terangnya, supaya satu bintang terang tidak mendominasi.
- **Kode QR** gelap di atas ubin terang dengan modul berukuran bilangan bulat piksel, dan mengarah ke tautan pendek tempat itu.

Kartu adalah benda untuk dibagikan, bukan alat ukur. Karena itu ia boleh memakai yang dilarang di viewer: gradien latar, satu pendar lembut, dan garis hias di bingkai. Aturan viewer di atas tidak berubah.

## Ikon

Satu keluarga: Phosphor, ketebalan `regular` (`fill` hanya untuk putar dan jeda). Gambar alat (cincin, tanda silang, kompas arah) dibuat dari data, bukan ikon.

## Gerak

Tiap gerak punya alasan:

| Gerak | Artinya |
|---|---|
| Blink berpindah tanpa pudar | mata menangkap gerak dari loncatan |
| Citra larut saat teleskop berganti (WISE ke SPHEREx dan sebaliknya) | ini serah-terima antar alat, bukan perbandingan posisi; kunjungan di titik itu ditahan lebih lama dan nama teleskop di keterangan menyala sebentar |
| Latar bergeser saat pindah tempat | teleskop diarahkan ke bagian langit lain, dengan arah yang benar dan lama yang mengikuti jaraknya |
| Lensa mengecil ke latar atau membesar darinya | lensa dan latar adalah langit yang sama pada pembesaran berbeda |
| Isi lensa membesar atau mengecil saat ganti tingkat | pembesaran berubah, tempatnya tetap |
| Lensa membuka seperti diafragma | data untuk tempat ini sudah siap |
| Cincin terisi atau menyapu | progres muat atau posisi suara |

Dengan `prefers-reduced-motion`: tidak ada geser, perpindahan, atau gerak pembesaran; lensa langsung terbuka pada pembesaran kerjanya, dan blink tidak mulai sendiri.

## Keadaan yang wajib ada

Memuat (cincin berputar), membuat bundle baru (cincin terisi sesuai jumlah eksposur; begitu riwayat WISE tiba lensa sudah memutarnya, pita spektrum menambah satu garis untuk tiap eksposur yang terbaca, dan blok temuan menghitung eksposur alih-alih menampilkan ukuran yang belum ada), gagal (pesan dan coba lagi), tanpa data SPHEREx, tanpa spektrum (pita tetap menjadi pemilih band dan menjelaskan alasannya), posisi tidak terlacak, layanan tidak terjangkau. Semua kendali punya keadaan hover, fokus (garis luar ambar 2 px), ditekan, aktif, dan nonaktif.

## Jujur soal data

Tetap tampil: tanggal kunjungan nyata, pergeseran terukur beserta batas ketelitiannya, titik spektrum yang ditandai jenuh, dan alasan kalau sesuatu tidak bisa diukur. Catatan menyebut bahwa latar adalah citra SPHEREx sungguhan dan apa bedanya dengan lensa.

## Layar kecil

Di bawah 860 px semuanya satu kolom dan halaman bisa digulir: lensa, temuan, identitas, lalu dok. Laci dan dialog memenuhi layar.

## Yang dihindari

Kartu di dalam kartu, label huruf besar kecil di atas tiap bagian, titik status hias, garis bidik hias, kursor khusus, angka tanpa satuan, dan teks pemasaran.
