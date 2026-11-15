# Arah desain viewer

Sumber acuan tampilan untuk `web/`. Ubah di sini dulu kalau mau mengganti arah visual.

## Bacaan desain

Alat yang imersif untuk pemula yang penasaran. Suasananya **melayang di angkasa**; kendalinya **ruang kendali teleskop**: sedikit, jelas, dan terasa seperti alat ukur. Dibangun dengan CSS dan canvas biasa, huruf Archivo (lebar) dan IBM Plex Mono, satu warna aksen ambar, dan citra SPHEREx asli sebagai suasananya.

Tingkat: variasi tata letak sedang, gerak sedang, kepadatan rendah.

## Arah identitas

Keputusan Wildan, 14 November 2026: **tarot dan rasi bintang** menjadi DNA visual SWARA ke depan. Orang sudah akrab dengan bahasa itu, jadi ia memancing orang untuk melihat dan membagikan.

Cara kita memakainya: tarot memberi **formatnya** (kartu tinggi, jendela melengkung, angka Romawi, pita julukan, sinar), langit memberi **isinya**. Tiap tempat yang di kartu tarot diisi hiasan, di sini diisi data. Emasnya adalah aksen ambar yang sudah ada, dan huruf tidak berubah.

Yang sudah memakai arah ini: kartu berbagi (gerak, cahaya, tempat), peta seluruh langit, bacaan tiga kartu yang menggantikan Guide, cuplikan penanda, dan daftar tempat di Go to.

**Jendela melengkung = kartu tempat.** Di cuplikan penanda dan daftar Go to, citra asli benda itu tampil di jendela melengkung bergaris ganda (bentuk jendela kartu), dengan julukannya (The Wanderer, The Still One, The Riddle) dan angka yang terukur. Lensa bundar tetap milik alat ukur. Julukan dan angkanya dihitung di satu tempat (`web/src/lib/verdict.ts`) dan dipakai juga oleh landing page, jadi kata-katanya selalu sama.

Dua watak, satu aturan: **alat ukur saat orang mengukur** (lensa, garis waktu, tombol putar, bacaan koordinat), **kartu saat SWARA bercerita** (bacaan, kartu berbagi). Tarot tidak ditempel di semua tempat. Viewer sendiri tetap ruang kendali teleskop; rasa alat ukurnya yang membuat datanya dipercaya.

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

0. **Seluruh langit** (kalau terbuka), di atas semua lapis di bawah ini kecuali bilah atas; lapis lain tetap ada di bawahnya.
1. **Latar langit.** Citra medan lebar, dipusatkan di pusat lensa; sisinya dihitung dari layar supaya menutup dari pusat lensa ke semua tepi. Saat pindah tempat, latar lama bergeser pergi ke arah yang sebenarnya di langit dan latar baru datang dari arah sebaliknya.
2. **Panggung.** Lensa bundar di tengah, diapit dua blok teks: identitas benda di kiri, temuan di kanan.
3. **Dok kendali** di bawah, dua baris: waktu (blink dan kunjungan) dan cahaya (dengar dan spektrum).
4. **Lapis sementara:** dialog "pergi ke" dan laci catatan.

Urutan `z-index`: latar 0, tirai 1, panggung 2, dok dan seluruh langit 3, bilah atas dan laci 4, dialog 5.

## Komponen dan wataknya

- **Lensa.** Bundar, seperti medan pandang teleskop. Cincin luarnya bertanda derajat dengan huruf N dan E. Cincin itu juga penunjuk: terisi saat data dimuat, dan menyapu saat suara spektrum berjalan. Membuka dan menutup seperti diafragma.
- **Rantai pembesaran.** Seluruh langit, pandangan lebar (latar, 40 menit busur), lalu lensa 6, 3, dan 2 menit busur. Menjauh dari tingkat terlebar menutup lensa: ia mengecil sampai isinya tepat seukuran latar (skalanya dihitung dari skala latar, bukan angka tetap), lalu larut. Yang tersisa cincin ambar selebar petak yang diperbesar lensa; mengekliknya membuka lensa lagi. Membuka sebuah tempat selalu lewat urutan ini: langit lebar, lensa terbuka, lalu menyelam ke pembesaran kerja.
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

## Seluruh langit

Pembuka situs dan tingkat terluar teleskop (`web/src/components/SkyMap.tsx`). Petanya peta langit penuh SPHEREx DR1, satu dari enam panjang gelombang, dalam proyeksi Hammer-Aitoff galaktik: Bima Sakti mendatar dengan pusatnya di tengah, karena bentuk itulah yang dikenali orang. Timur di kiri, seperti lensa.

- **Lapis.** Citra (diwarnai look), kisi RA dan Dec yang melengkung dengan ekuator langit bertitik, garis rasi tipis dalam keluarga warna aksen look, dan elips kedua yang tipis sebagai bingkai pelat. Judul pelat diapit dua bintang empat sudut.
- **Label.** Contoh dan tempat milik pengguna adalah cincin ambar dengan titik, seperti tanda acuan di lensa; tempat terakhir diberi cincin kedua. Label jam RA dan benda yang bisa dikenali (pusat Bima Sakti, Awan Magellan, Andromeda) dipindah ke sisi lain atau disembunyikan kalau menimpa penanda; nama penanda yang tidak muat disembunyikan sampai ditunjuk. Tidak ada label di luar elips.
- **Zoom dan geser.** Roda mouse atau cubit memperbesar ke arah kursor, seret menggeser, klik ganda memperbesar; tombol kecil di sudut peta dan papan ketik (+ −, panah, 0) melakukan hal yang sama. Zoom 1 adalah seluruh langit; yang terdalam medan sekitar 1,8 derajat. Saat diperbesar, tepi elips keluar dari kotak dan kotaknya menjadi medan pandang bersudut 18 px, judul pelat menyebut lebar medannya, dan nama rasi yang terlihat ditulis tipis.
- **Kerangka berputar.** Pada zoom 1 petanya galaktik. Makin dalam, pusat pandangan pindah ke titik yang dilihat dan "atas" berputar ke utara langit, jadi pada zoom dalam arahnya sama dengan lensa: utara di atas, timur di kiri.
- **Menajam bertahap.** Peta dasar selalu tampil; potongan HiPS yang lebih tajam dari IRSA dimuat untuk medan yang terlihat dan muncul dengan larut singkat. Keterangan kecil di sudut kiri bawah muncul selagi memuat, atau kalau IRSA tidak menjawab. Tidak ada potongan yang diminta sebelum orang memperbesar.
- **Cuplikan penanda.** Menunjuk penanda menampilkan citra asli tempat itu, jenisnya, satu kalimat, dan apa yang terukur. Di ponsel ketukan pertama membuka cuplikan dengan tombol "Look closer".
- **Menunjuk.** Di bawah penunjuk tampil RA, Dec, dan nama rasi, dan garis rasi itu menyala bersama namanya. Kursor tetap kursor biasa (crosshair); bacaan disembunyikan selagi menyeret.
- **Membidik.** Klik atau ketuk mengunci bidikan dan membuka kartu kecil: nama rasi, koordinat, keterangan bahwa tempat baru butuh sekitar semenit, dan "Look here". Klik yang hampir mengenai penanda memilih penanda itu. Enter membuka, Esc membatalkan.
- **Panjang gelombang.** Enam tombol selebar rentang band-nya; peta lama larut ke peta baru, karena langitnya sama dan hanya cahayanya yang berganti.
- **Menyelam dan naik.** Memilih tempat membuat peta memperbesar terus ke titik itu sampai zoom terdalam, lalu pada langkah terakhir menyamakan skala dan pusatnya dengan pandangan lebar 40 menit busur dan larut ke sana; lensa baru membuka setelah itu. Kembali ke seluruh langit adalah gerak yang sama terbalik, mulai dari tempat itu. Langkah terakhir (dari sekitar 5 ke 1,2 detik busur per piksel layar) memang lunak, karena potongan terdalam 12,9 detik busur per piksel. Menyelam tidak bisa disela. Tanpa WebGL petanya gambar diam seperti sebelumnya dan perpindahannya langsung.
- **Layar kecil.** Peta selebar layar, kartu bidikan dan cuplikan di bawahnya, label kisi dan benda disembunyikan. Sebelum diperbesar satu jari tetap menggulir halaman; setelah diperbesar satu jari menggeser peta. Tombol yang tersisa hanya kembali ke seluruh langit.

## Kartu berbagi

Gambar 1080 x 1920 (9:16, ukuran story) yang dilukis di kanvas dari bundle yang sedang tampil (`web/src/lib/card.ts`). Dialognya menampilkan kartu itu. Yang dibagikan adalah tautan ke halaman kartunya (lihat "Halaman kartu"): disalin di desktop, lewat lembar berbagi sistem di ponsel. Gambarnya sendiri disimpan sebagai PNG untuk story. Berkas gambar tidak lagi dikirim lewat lembar berbagi, karena di desktop ia tersalin dua kali beserta jalur berkasnya.

**Satu aturan: sinar adalah data.**

- **Kartu I, geraknya.** Jendela melengkung berisi semua citra WISE yang ditumpuk (tiap piksel mengambil nilai paling terang), jadi yang bergerak meninggalkan garis. Busur di atasnya adalah garis waktu: satu sinar per pengamatan pada tanggalnya, sinar WISE pendek dan sinar SPHEREx panjang. Tanpa riwayat WISE, jendelanya berisi frame SPHEREx dan busurnya hanya kunjungan SPHEREx.
- **Kartu II, cahayanya.** Spektrum sebagai 72 sinar mengelilingi frame SPHEREx, 0,75 sampai 5 mikron searah jarum jam; panjang sinar adalah terang. Hanya titik bersih yang dipakai; irisan tanpa titik bersih digambar sebagai titik kosong. Kartu ini hanya ada kalau sedikitnya sepertiga irisannya terisi.
- **Julukan mengikuti yang terukur SPHEREx**, sama dengan blok temuan: bergeser jadi THE WANDERER, tidak bergeser jadi THE STILL ONE, tidak terlacak jadi THE RIDDLE. Julukan adalah nama panggilan, bukan klasifikasi. Benda contoh yang tidak terpisah dari bintang latar (`BLENDED` di `content.ts`) selalu THE RIDDLE dan tidak punya kartu cahaya.
- **Warna kartu mengikuti look** yang dipakai di viewer: enam look, enam warna kartu. Garisnya memakai keluarga warna aksen look itu.
- **Yang murni hiasan** hanya bingkai, pita, dan bintang empat sudut, dan bintang empat sudut tidak pernah digambar di dalam jendela data.
- **Langit di belakang kartu** adalah citra medan lebar yang asli, redup. Dari tiga potongan yang mungkin dipakai yang paling sedikit piksel terangnya, supaya satu bintang terang tidak mendominasi.
- **Kode QR** gelap di atas ubin terang dengan modul berukuran bilangan bulat piksel, dan mengarah ke tautan pendek tempat itu.

Kartu adalah benda untuk dibagikan, bukan alat ukur. Karena itu ia boleh memakai yang dilarang di viewer: gradien latar, satu pendar lembut, dan garis hias di bingkai. Aturan viewer di atas tidak berubah.

## Halaman kartu

`/card?target=…&card=motion|light|place` (atau `ra`, `dec`, `name` untuk tempat di luar contoh; `look` kalau bukan Ember). Tujuan tautan berbagi: isinya hanya satu kartu dan dua jalan keluar, "Explore this place" dan "Draw your own card". Kodenya di `web/src/card/`, bahannya dimuat `web/src/lib/cardData.ts` tanpa aplikasi.

- **Yang di belakang kartu adalah langit tempat itu.** Petak peta SPHEREx yang asli di sekitar bendanya (104 derajat di layar lebar, 58 di ponsel), diredupkan, dengan garis rasi yang memang ada di sana; rasi yang ditempati bendanya digambar terang. Tidak ada bintang karangan.
- **Yang murni hiasan** hanya dua cincin berskala yang berputar pelan, debu cahaya yang naik, percikan bintang empat sudut saat kartu dibalik, dan kilau di muka kartu.
- **Kartu datang tertelungkup lalu membalik.** Punggungnya memakai tanda SWARA. Mengeklik kartu atau memilih I, II, III membaliknya ke kartu berikutnya: punggung lewat dulu, baru muka yang baru.
- **Kartu miring mengikuti penunjuk** (di ponsel Android mengikuti miringnya tangan), dan bernapas sendiri kalau tidak disentuh. Langit dan garis rasi bergeser sedikit berlawanan arah, jadi kartunya terasa melayang di depan.
- **Warna halaman mengikuti look kartu**: garis, tombol utama, dan pendar memakai warna emas look itu.
- **Teks di samping** satu kalimat tentang yang terukur (sama kata dengan `verdict.ts`), satu catatan kecil, lalu tombol. Benda yang tidak terpisah dari bintang latar ditulis "Hidden behind a background star".
- **Keadaan:** selagi dimuat kartu tertelungkup dan cincin berputar lebih cepat; bundle yang belum selesai dibuat dan tautan yang rusak punya kalimat dan tombolnya sendiri.
- **Gerak dikurangi:** kartu langsung terbuka, tanpa kemiringan, cincin diam, tanpa debu dan percikan.

**Pratinjau tautan.** WhatsApp dan layanan lain membaca tag Open Graph tanpa menjalankan JavaScript, jadi `/card` dilayani `web/api/card.js`, yang mengisi tag itu ke `index.html`. Kartu contoh mendapat gambarnya sendiri: tangkapan layar halaman kartunya pada 1200 x 630 (`web/public/og/`, dibuat `web/scripts/og-cards.cjs`; jalankan ulang kalau bundle contoh atau tampilan kartu berubah). Tempat di luar contoh mendapat kartu tertelungkup dan namanya di judul, karena gambarnya tidak bisa dilukis di server.

## Bacaan (pengganti Guide)

Tombol **The cards** (dulu Guide) membuka dialog di tengah layar berisi kartu, bukan laci teks. Kartunya diletakkan langsung di atas langit yang diredupkan, tanpa kotak dialog. Semua yang digambar dan ditulis dihitung dari bundle dan peta seluruh langit (`web/src/lib/reading.ts`); tidak ada angka yang ditulis tangan.

- **Anatomi kartu** (sama dengan kartu berbagi, sepertiga ukurannya, 360 x 640 satuan): bingkai garis ganda bersudut cekung, angka Romawi, satu baris pertanyaan, gambar, keterangan gambar, pita julukan, satu kalimat, dua fakta bertanda kecil, tombol. Warna kartu mengikuti look.
- **I, tempatnya.** Jendela melengkung berisi 44 derajat langit dari peta SPHEREx yang asli, utara di atas, dengan garis rasi di atasnya; rasi yang ditempati benda itu digambar terang dan namanya jadi isi pita. Faktanya: jarak dari pita Bima Sakti (dengan peta seluruh langit mini) dan dari lintang mana ia tidak pernah terbit.
- **II, jalannya.** Tumpukan semua citra WISE; busur di atasnya memuat satu sinar per pengamatan pada tanggalnya. Menunjuk satu sinar (atau panah kiri dan kanan) menampilkan citra pengamatan itu. Pitanya julukan dari yang terukur (THE WANDERER, THE STILL ONE, THE RIDDLE). Faktanya: pergeseran terukur dengan diagram tanda dan titik, dan berapa lama ia melintasi lebar Bulan purnama dengan laju itu.
- **III, cahayanya.** Lensa dengan spektrum sebagai 72 sinar; menunjuk satu sinar membaca panjang gelombang dan terangnya.
- **0, seluruh langit.** Di peta seluruh langit dialognya berisi satu kartu: peta itu sendiri dan legendanya.
- **Sisi belakang.** Tiap kartu dibalik untuk rincian datanya (sumber, tanggal, jumlah eksposur, penanda piksel). Depan untuk orang umum, belakang untuk yang ingin memeriksa.
- **Tertelungkup.** Kartu yang datanya tidak terbaca (spektrum terlalu sedikit titik bersih, terlalu terang, tidak terpisah dari bintang latar, atau masih dimuat) tampil tertelungkup dengan pita UNREAD dan satu kalimat alasannya. Tidak ada kartu yang diisi gambar kosong.
- **Bahasa.** Tarot hanya formatnya. Tidak ada kata ramalan, zodiak, atau nasib; rasi yang dipakai adalah rasi IAU.
- **Layar kecil.** Tiga kartu digeser satu per satu. Tanpa gerak, kartu berganti sisi tanpa berputar.

## Citra selisih dan bintang Gaia di lensa

Dua lapis di lensa yang menjawab "apa yang berubah?" dan "katalog bilang apa?". Keduanya tombol di busur bawah cincin lensa (tujuh tombol berjajar tiap 18 derajat) dan bisa dinyalakan bersamaan.

- **Citra selisih** (tombol atau D): citra yang tampil dikurangi pengamatan pertama dari teleskop dan band yang sama. Yang tidak berubah jadi gelap. Yang lebih terang sekarang berwarna **bara** (aksen ambar menuju putih hangat); yang lebih terang dulu berwarna **bayangan pucat** (warna garis sistem). Ini dua warna sistem, bukan peta warna dua arah baru, dan tidak mengikuti look. Keterangan lensa menyebut dua tanggalnya ("Mar 2026 minus Aug 2025") dan membawa kunci warnanya; di pengamatan pertama ia bilang belum ada yang dikurangkan.
- **Bintang Gaia** (tombol atau A): tiap bintang katalog Gaia DR3 digambar sebagai cincin tipis berwarna dingin di posisinya **pada tanggal citra yang tampil**, jadi cincin bintang yang bergerak ikut bergerak. Cincin lebih besar untuk bintang lebih terang. Bintang yang geraknya lebih dari 0,3 detik busur per tahun diberi garis putus-putus dari posisinya pada pengamatan pertama: jalur menurut katalog, di samping jejak ambar yang kita ukur. Ambar tetap hanya untuk pengukuran kita.
- Paling banyak 140 cincin digambar (yang paling terang di bagian langit yang tampil), dan keterangan lensa menyebut jumlahnya. Tempat tanpa data Gaia: tombolnya mati dan mengatakan itu.

## Dua isian koordinat

Di Go to, di bawah kotak cari, ada dua isian RA dan Dec yang ditata seperti dua sumbu teleskop: label mono berwarna aksen, angka besar di atas satu garis tipis (bukan kotak isian), dan satu baris petunjuk. Masing-masing membaca derajat atau jam/derajat-menit-detik, mengatakan alasannya kalau tidak terbaca, dan memakai pratinjau "Read as" yang sama dengan kotak cari.

## Bilah atas dan mode fokus

- **Bilah atas** memakai bahasa ukiran kartu: tanda SWARA berhuruf lebar (mengekliknya kembali ke seluruh langit), pelat cari bergaris ganda tipis diapit dua bintang empat sudut, dan satu garis tipis di bawah bilah yang memudar di ujung. Di kanan hanya satu tombol berteks, **The cards**; Whole sky, Share, dan Focus adalah tombol bundar berikon.
- **Mode fokus** (tombol pojok atau F): bilah atas dan dok menghilang, lensa membesar, nama di kiri dan angka terukur di kanan tetap ada. Browser diminta masuk layar penuh; kalau ditolak, mode fokus tetap jalan. Esc, F, atau tombol kecil di pojok untuk keluar. Blink tetap dengan Spasi dan panah.

## Logo

Dua bagian (`web/src/components/Logo.tsx`; bentuk yang sama ada di `web/public/favicon.svg` dan di kartu berbagi, `lib/card.ts`):

- **Tanda:** cakram ambar dengan bintang empat sudut yang dilubangi, sehingga langit di belakangnya terlihat lewat bintang itu. Dipakai sendirian di tempat sempit: ikon tab, ponsel, avatar.
- **Nama:** SWARA digambar satu garis berujung bulat, A tanpa palang, dan bintang ambar kecil sebagai palang A pertama.
- Saat ditunjuk, tandanya sedikit membesar. Jangan diputar: bintang empat sudut yang diputar 45 derajat terbaca sebagai tanda tutup (✕).
- Dipilih Wildan (14 November 2026) dari enam jenis (wordmark garis, monogram, tanda abstrak, ruang negatif, emblem, wordmark huruf) dan lima variasi tanda.

## Halaman seluruh langit di layar lebar

Elips sebesar yang muat di layar; judul dan kontrol menempati sudut kosong elips (kiri bawah: judul, satu kalimat, petunjuk, tombol tur; kanan bawah: panjang gelombang dan look; kanan atas pelat: zoom). Tidak ada kaki halaman. Ponsel tetap bertumpuk.

## Landing page

`/` adalah landing page; aplikasinya di `/sky`. Tautan lama yang membawa parameter aplikasi (`target`, `ra`, `dec`, `name`, `band`, `look`, `view`) tetap membuka aplikasi, dan aplikasi selalu menulis alamatnya di `/sky`. Kodenya di `web/src/landing/`, kelasnya berawalan `lp-`. Acuannya mockup v2 yang disetujui Wildan (14 November 2026): minimalis dan modern, rasi bintang sebagai aksen, bukan hiasan di semua tempat.

Isinya dihitung dari bundle yang sama dengan aplikasi. Yang ditulis tangan hanya empat angka di bawah hero dan contoh pembacaan di kartu 06 (Wolf 359, tempat yang sudah pernah dibuat). Cahaya hias hanya boleh di bingkai (tepi bola, kilau kartu, cahaya fajar di awal bagian Why), tidak pernah di data: bola langit adalah peta SPHEREx DR1 asli dengan garis rasi dari manifest peta seluruh langit, dan citra di kartu serta panggung adalah frame bundle. Bintang di latar hero dan di belakang bagian bawah juga sungguhan: 757 titik garis rasi di posisi langitnya, bukan titik acak. Area judul dikosongkan supaya teks tetap bersih.

| Bagian | Sasaran | Mikro-interaksi |
|---|---|---|
| Navigasi | empat bagian dan satu jalan ke aplikasi | pil penanda meluncur ke menu yang ditunjuk lalu kembali ke bagian yang sedang dibaca; titik ambar di bawah menu aktif; kaca gelap setelah digulir; panah tombol bergeser |
| Hero | nama SWARA, janji satu kalimat, dua tombol (aplikasi dan Barnard's Star), dan langit yang bisa dipegang | SWARA diketik huruf demi huruf lalu tiap huruf membuka jadi katanya (menunjuk barisnya memutar ulang); tepi bola terbit lebih dulu, petanya larut masuk; bola bisa diseret ke segala arah dengan momentum, lalu pelan-pelan tegak kembali dan berputar sendiri; menunjuk bola menyalakan rasi di bawah kursor dengan nama dan koordinatnya; klik membidik titik itu dan "Look here" membukanya di aplikasi (Esc atau × membatalkan); penanda lima contoh membawa angka terukurnya dan memperlihatkan cuplikan citra aslinya saat ditunjuk; bintang latar ikut bergeser saat bola diputar |
| Angka | empat fakta yang bisa dicek | menghitung naik sekali; garis ambar tumbuh di atas kolom yang ditunjuk |
| Kenapa SWARA | memperlihatkan judulnya: penampil langit memberi satu gambar, SWARA memperlihatkan apa yang terjadi | satu panel Barnard's Star: kiri citra SPHEREx 40′ apa adanya, kanan tempat yang sama dengan lensa jejak 14 epoch WISE, satu sinar per pengamatan, dan angka terukur di samping Gaia; garis tengah bisa diseret atau digeser dengan panah, dan bergeser sekali sendiri saat pertama terlihat; sinar muncul satu per satu; tiga poin di bawahnya, garis ambar tumbuh di atasnya |
| Enam alat | tiap kartu menggambar alatnya dari data asli | semua: terangkat 8 px, kurung sudut melebar dan menyala, sorot cahaya mengikuti kursor, kilau lewat sekali, panah muncul di samping judul. 01 memutar semua pengamatan dengan sinar dan tanggalnya; 02 penggeser pembanding mengikuti kursor (kiri citra terakhir, kanan selisihnya) dan kunci tahunnya; 03 kepala putar menyapu spektrum dengan bacaan µm, tanpa bunyi; 04 garis tumbuh lalu selisihnya tertulis; 05 kipas kartu melebar; 06 koordinat diacak lalu mengunci dan cincinnya terisi |
| Lima contoh | pilih satu benda dan lihat angkanya sebelum masuk | bintang penanda meluncur ke baris; lensa larut sambil sedikit mengecil; angka menghitung dari angka sebelumnya; kalimat Gaia dari `gaia.json` |
| Kaki | produk, proyek, sumber data | garis bawah tautan meluncur masuk; bintang di nama SWARA membesar |

Layar sentuh tidak punya hover, jadi animasi kartu berjalan sendiri selama kartunya terlihat. Di bola dan panel pembanding, seret ke samping memutar atau menggeser, sedangkan seret ke atas-bawah tetap menggulir halaman. Di ponsel lima contoh menjadi deretan pil yang bisa digeser dengan panggung di bawahnya. Dengan gerak dikurangi tidak ada animasi: angka langsung tampil dan bola diam. Tanpa WebGL bola dilukis sekali di CPU.

## Pelat: gaya semua panel

Dialog dan popover memakai satu gaya, bukan kotak abu-abu polos: latar gelap yang hangat di bagian atas, garis tepi aksen tipis, dan satu garis lagi 5 px di dalamnya (garis ganda, seperti bingkai kartu). Dipakai dialog Go to dan Share, kartu bidik dan cuplikan penanda di peta, dan panel Keys and sources. Dua dialog besar membawa satu bintang empat sudut yang memutus garis atasnya, seperti garis dok. Keterangan kecil (tooltip) dan gugus tombol zoom peta memakai garis dan latar yang sama tanpa garis dalam. Kartu tarot tetap hanya di The cards dan kartu berbagi; pelat adalah wadah, bukan kartu.

Semua tombol pil dan tombol di cincin lensa bergaris ganda: satu garis tipis di dalam tepinya. Saat ditunjuk, garisnya berubah ke aksen.

## Pangkat tombol

Satu bentuk (bulat penuh), tiga pangkat: **utama** berisi ambar penuh, satu saja per layar (`pill-accent`); **kedua** bergaris ambar (`pill-share`, dan di dalam kartu `pill-etched`: garis ganda tipis senada bingkai kartu); **tenang** hanya teks dan ikon (`pill-quiet`). Tombol bundar berikon tetap kenop alat.

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
| Citra lama tersapu dari kiri ke kanan oleh garis ambar saat Difference, look, Reveal faint, atau penanda piksel diganti | filter teleskop diputar: tempat dan waktunya sama, hanya cara melihatnya yang berubah. Blink tidak tersapu |
| Cincin Gaia mengunci dari besar ke ukurannya satu per satu, lalu memudar saat dimatikan | katalog sedang dicocokkan ke bintang di citra |
| Menunjuk lensa: bacaan RA/Dec dan jarak dari tanda di samping kursor, jarum ambar di cincin menunjuk arahnya, N dan E menyala | lensa adalah alat ukur; tiap titiknya punya koordinat (rumusnya sama dengan `sky_grid` di pipeline) |
| Kenop di cincin sedikit masuk saat ditekan dan bercahaya saat menyala | kenop alat, bukan tombol halaman |
| Lima kenop menyala bergantian dengan keterangannya, sekali per browser saat lensa pertama terbuka | alatnya memperkenalkan diri; berhenti begitu orang menyentuh apa pun, dan tidak muncul dengan gerak dikurangi atau di layar sentuh |

Dengan `prefers-reduced-motion`: tidak ada geser, perpindahan, atau gerak pembesaran; lensa langsung terbuka pada pembesaran kerjanya, dan blink tidak mulai sendiri.

## Keterangan (tooltip)

Dua baris, tanpa ikon: nama dan tombol pintasnya, lalu satu kalimat tentang gunanya. Dipakai kenop di cincin lensa ("Difference [D]: What changed since the first look") dan tanda di garis waktu. Tanda kunjungan SPHEREx menyebut jumlah eksposur yang ditumpuk serta persen piksel jenuh dan rusak pada band yang tampil; tanda WISE menyebut panjang gelombangnya dan bahwa citranya untuk dilihat, bukan diukur. Keterangan kenop diletakkan sedikit di bawah tengah kenopnya supaya tidak menimpa kenop tetangga.

## Keadaan yang wajib ada

Memuat (cincin berputar), membuat bundle baru (cincin terisi sesuai jumlah eksposur; begitu riwayat WISE tiba lensa sudah memutarnya, pita spektrum menambah satu garis untuk tiap eksposur yang terbaca, dan blok temuan menghitung eksposur alih-alih menampilkan ukuran yang belum ada), gagal (pesan dan coba lagi), tanpa data SPHEREx, tanpa spektrum (pita tetap menjadi pemilih band dan menjelaskan alasannya), posisi tidak terlacak, layanan tidak terjangkau. Semua kendali punya keadaan hover, fokus (garis luar ambar 2 px), ditekan, aktif, dan nonaktif.

## Jujur soal data

Tetap tampil: tanggal kunjungan nyata, pergeseran terukur beserta batas ketelitiannya, titik spektrum yang ditandai jenuh, dan alasan kalau sesuatu tidak bisa diukur. Catatan menyebut bahwa latar adalah citra SPHEREx sungguhan dan apa bedanya dengan lensa.

## Layar kecil

Di bawah 860 px semuanya satu kolom dan halaman bisa digulir: lensa, temuan, identitas, lalu dok. Laci dan dialog memenuhi layar.

## Yang dihindari

Kartu di dalam kartu, label huruf besar kecil di atas tiap bagian, titik status hias, garis bidik hias, kursor khusus, angka tanpa satuan, dan teks pemasaran.
