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
  /** Jarak antar nada saat melodi riwayat diputar (durasi nada = `seconds`). */
  melodyStep: 0.9,
  /** Bentuk gelombang agar frasa melodi bisa dijadwalkan engine yang sama. */
  waveform: "triangle" as OscillatorType,
  unverifiedWaveform: "sawtooth" as OscillatorType,
  unverifiedGain: 1,
  /** Kunjungan tanpa pengukuran: ketukan pelan. */
  gapTick: true,
  gapTickHz: 1400,
  gapTickGain: 0.12,
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

// Sapuan gambar 32x5 (usul awal dari measurements.md; nilai akhir wewenang Alif).
// Satu sapuan = 32 kolom melintasi medan 6 menit busur, tiap kolom hingga 5 nada.
// Ambang dan normalisasi dihitung per objek per band saat ekstraksi.

export const SCAN = {
  /** Jumlah kolom barat-ke-timur. */
  columns: 32,
  /** Nada serentak terbanyak per kolom (puncak terkuat). */
  maxNotes: 5,
  /** Detik per kolom: 32 x 0,34 ~ 11 detik per kunjungan. */
  colSeconds: 0.34,
  /** Bagian tiap kolom yang berbunyi; sisanya jeda antar kolom. */
  noteFill: 0.8,
  /** Ambang puncak = latar + kSigma * sigma (diukur: k=4, lihat measurements.md). */
  kSigma: 4,
  /** Batas atas volume = min(255, p98 * topMargin). */
  topMargin: 1.25,
  /** Volume minimum puncak yang lolos ambang, supaya tetap terdengar. */
  minVol: 0.08,

  /** Nada baris paling utara, Hz (A3). Selatan turun `octaves` oktaf. */
  baseHz: 220,
  octaves: 2,
  scale: [0, 2, 4, 7, 9],

  /** Bentuk gelombang nada data; kolom berflag memakai yang kasar. */
  waveform: "triangle" as OscillatorType,
  unverifiedWaveform: "sawtooth" as OscillatorType,
  unverifiedGain: 0.45,

  /** Kolom tanpa puncak: ketukan pelan penanda waktu berjalan. */
  gapTick: true,
  gapTickHz: 1400,
  gapTickGain: 0.12,

  /** Earcon tengah medan: nada pendek berbeda dari nada data. */
  earconHz: 1760,
  earconSeconds: 0.15,
  earconGain: 0.5,

  /** Jarak minimum antar puncak, piksel pada citra 480px. */
  minDistPx: 6,
};

export type ScanSettings = typeof SCAN;

export type InstrumentId = "spectrum" | "scan" | "motion";

export type InstrumentProfile = {
  waveform: OscillatorType;
  unverifiedWaveform: OscillatorType;
  unverifiedGain: number;
  gapTick: boolean;
  gapTickHz: number;
  gapTickGain: number;
  gapTickWaveform: OscillatorType;
  gain: number;
  envelope: "sustain" | "pluck" | "bell";
  attackSeconds: number;
  sustainFraction: number;
  partials: { ratio: number; gain: number }[];
};

// Instrumen sintetis terpisah untuk tiap sumber data; level adalah pengali relatif.
export const INSTRUMENTS: Record<InstrumentId, InstrumentProfile> = {
  spectrum: {
    waveform: "sine",
    unverifiedWaveform: "triangle",
    unverifiedGain: 0.42,
    gapTick: true,
    gapTickHz: 1400,
    gapTickGain: 0.1,
    gapTickWaveform: "sine",
    gain: 0.92,
    envelope: "sustain",
    attackSeconds: 0.014,
    sustainFraction: 0.62,
    partials: [],
  },
  scan: {
    waveform: "triangle",
    unverifiedWaveform: "square",
    unverifiedGain: 0.38,
    gapTick: true,
    gapTickHz: 1760,
    gapTickGain: 0.12,
    gapTickWaveform: "square",
    gain: 0.5,
    envelope: "pluck",
    attackSeconds: 0.003,
    sustainFraction: 0.16,
    partials: [{ ratio: 2, gain: 0.08 }],
  },
  motion: {
    waveform: "sine",
    unverifiedWaveform: "sine",
    unverifiedGain: 0.7,
    gapTick: true,
    gapTickHz: 1150,
    gapTickGain: 0.1,
    gapTickWaveform: "sine",
    gain: 0.68,
    envelope: "bell",
    attackSeconds: 0.006,
    sustainFraction: 0.1,
    partials: [
      { ratio: 2.4, gain: 0.24 },
      { ratio: 3.9, gain: 0.1 },
    ],
  },
};

export const MIX = {
  /** Master level dipertahankan; equal-power gain membagi energi antar lapisan aktif. */
  gain: SOUND.gain,
  compressorThresholdDb: -16,
  compressorKneeDb: 12,
  compressorRatio: 6,
  compressorAttackSeconds: 0.003,
  compressorReleaseSeconds: 0.18,
};
