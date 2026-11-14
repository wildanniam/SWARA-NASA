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
  /** Lama satu nada, detik. Blink berganti tiap 0,7 detik. */
  seconds: 0.4,
  /** Keras nada, 0-1. */
  gain: 0.3,
  /** Kunjungan tanpa pengukuran posisi: ketukan pelan. */
  tickHz: 1400,
  tickGain: 0.05,
};

export type MotionSettings = typeof MOTION;
