// Pengaturan sonifikasi. Semua pilihan rasa ada di sini: ubah berkas ini untuk
// menyetel suaranya, tanpa menyentuh mesin (sonify.ts) atau panel.
//
// Pemetaan dasar: satu kunjungan = satu frasa. Panjang gelombang berjalan sebagai
// waktu (pendek dulu), terang menjadi tinggi nada. Skala terang sama untuk semua
// kunjungan satu benda, jadi benda yang meredup memang terdengar lebih rendah.

export const SOUND = {
  /** Lama satu kunjungan, detik. */
  visitSeconds: 7,
  /** Jumlah langkah (nada) dari 0,75 sampai 5,0 mikron. Satu kunjungan punya
   *  sekitar 100 titik yang tidak tersebar rata: makin banyak langkah, makin
   *  banyak langkah kosong. */
  steps: 48,
  /** Jeda antar kunjungan saat semua diputar berurutan, detik. */
  pauseSeconds: 0.7,

  /** Nada untuk fluks nol, Hz (110 = A2). */
  baseHz: 110,
  /** Tangga nada: semiton dari nada dasar dalam satu oktaf. Daftar kosong = nada kontinu. */
  scale: [0, 2, 4, 7, 9],
  /** Rentang dari fluks nol sampai batas atas skala, oktaf. */
  octaves: 3,
  /** 1 = linier. Di bawah 1 mengangkat bagian redup, di atas 1 menekannya. */
  curve: 1,

  /** Bentuk gelombang titik yang layak. */
  waveform: "triangle" as OscillatorType,
  /** Titik yang ditandai jenuh oleh SPHEREx (nilainya ada, akurasinya belum
   *  diverifikasi) memakai gelombang yang lebih kasar supaya terdengar beda. */
  unverifiedWaveform: "sawtooth" as OscillatorType,
  unverifiedGain: 0.45,

  /** Langkah tanpa data: diam, dengan ketukan pelan supaya pendengar tahu waktu masih berjalan. */
  gapTick: true,
  gapTickHz: 1400,
  gapTickGain: 0.12,

  /** Geser stereo: panjang gelombang pendek di kiri (-pan), panjang di kanan (+pan). 0 = tengah. */
  pan: 0.6,
  /** Bagian tiap langkah yang berbunyi; sisanya jeda antar nada. */
  noteFill: 0.85,
  /** Keras keseluruhan, 0-1. */
  gain: 0.22,
};

export type SoundSettings = typeof SOUND;

// Motif gerak: tiap kunjungan satu nada pendek dari posisi terukurnya, berbunyi
// seiring blink. Ukurannya tetap untuk semua benda, jadi gerak yang lebih besar
// terdengar lebih besar.

export const MOTION = {
  /** Nada kunjungan acuan dan kunjungan yang tidak bergeser, Hz (329,63 = E4). */
  baseHz: 329.63,
  /** Tangga nada, semiton dalam satu oktaf. Satu langkah = `arcsecPerStep` ke utara (naik) atau selatan (turun). */
  scale: [0, 2, 4, 7, 9],
  arcsecPerStep: 1,
  /** Batas langkah ke atas dan ke bawah. */
  maxSteps: 12,
  /** Pergeseran timur-barat yang memberi geser stereo penuh, detik busur. Timur di kiri, seperti di gambar. */
  panArcsec: 10,
  /** Jeda antar nada saat frasa Gerak diputar berurutan, detik. Seragam untuk semua objek. */
  phraseGapSeconds: 0.25,  /** Lama satu nada, detik. Blink berganti tiap 0,7 detik. */
  seconds: 0.4,
  /** Keras nada, 0-1. */
  gain: 0.3,
  /** Kunjungan tanpa pengukuran posisi: ketukan pelan. */
  tickHz: 1400,
  tickGain: 0.05,
};

export type MotionSettings = typeof MOTION;

// Rasa Mode Kecerahan: nada acuan, rentang, dan toleransi diam. Selisih di
// bawah max(floorFrac × acuan, sigmaMult × galat) dianggap sistematika antar
// kunjungan, bukan perubahan (Barnard yang stabil tetap diam; penurunan
// RW Aurigae yang puluhan persen tetap terdengar).
export const BRIGHTNESS = {
  /** Nada acuan (C4). */
  baseHz: 261.63,
  /** Rentang dari acuan ke perubahan terbesar objek itu, oktaf. */
  octaves: 1,
  /** Batas bawah toleransi diam: pecahan dari acuan. */
  floorFrac: 0.01,
  /** Pengali sebaran galat dalam toleransi, cermin toleransi Gerak. */
  sigmaMult: 2,
  /** Lama satu nada dan jeda antar nada frasa, detik. Seragam. */
  noteSeconds: 0.4,
  phraseGapSeconds: 0.25,
  /** Keras, 0-1. */
  gain: 0.3,
};

export type BrightnessSettings = typeof BRIGHTNESS;

// Rasa Mode Pindai: sapuan kolom citra display dari timur ke barat. Posisi
// utara-selatan menjadi pitch, terang kolom menjadi volume. Karena sumbernya
// piksel display 8-bit hasil stretch (bukan fluks kalibrasi), volume selalu
// relatif terhadap frame itu dan wajib didokumentasikan sebagai taksiran.
export const SCAN = {
  /** Nada terendah (selatan); utara naik sejauh `octaves`. */
  baseHz: 110,
  octaves: 3,
  /** Puncak per kolom, paling banyak. */
  topN: 5,
  /** Lebar rata-rata penghalus kolom, piksel. */
  smooth: 3,
  /** Jarak minimum dua puncak, piksel. */
  minDist: 4,
  /** Ambang bisu: pecahan dari persentil-99 frame. Di bawah ini sunyi. */
  floorFrac: 0.5,
  /** Kolom yang disapu: tiap `colStep` piksel. */
  colStep: 2,
  /** Lama satu kolom, detik. Sapuan jalan terus tanpa jeda. */
  noteSeconds: 0.08,
  /** Keras, 0-1. */
  gain: 0.3,
};

export type ScanSettings = typeof SCAN;

// Pengumuman ganti mode: tiap mode punya motif pendek khas (earcon), lalu dua
// nada kalibrasi terendah-tertinggi dari rentang mode itu. Bentuk motif dan
// rentang kalibrasi adalah rasa dan milik berkas ini; arti tiap mode dikunci
// spek mode-shell. Kalibrasi memakai rentang penuh citarasa; dipersempit ke
// rentang objek saat pembuat frasa tiap mode sudah ada (tugas 3-6).

export const MODE_ANNOUNCE = {
  /** Lama tiap nada earcon dan kalibrasi, detik. */
  noteSeconds: 0.22,
  /** Jeda antar nada earcon dan kalibrasi, detik. */
  gapSeconds: 0.06,
  /** Keras pengumuman, 0-1. */
  gain: 0.3,
};

/** Motif earcon tiap mode: nada dasar + langkah semiton. */
export const EARCONS = {
  gerak: { baseHz: 329.63, steps: [0, 7, 12] },
  kecerahan: { baseHz: 261.63, steps: [0, 4, 7] },
  pindai: { baseHz: 392.0, steps: [7, 4, 0] },
  spektrum: { baseHz: 220.0, steps: [0, 7, 12, 19] },
} as const;

/** Rentang kalibrasi tiap mode: [terendah, tertinggi], Hz. */
export const CALIBRATION_HZ: Record<string, readonly [number, number]> = {
  gerak: [164.81, 659.25],
  kecerahan: [130.81, 523.25],
  pindai: [196.0, 784.0],
  spektrum: [SOUND.baseHz, SOUND.baseHz * 8],
};
