// Pengaturan sonifikasi. Semua pilihan rasa ada di sini: ubah berkas ini untuk
// menyetel suaranya, tanpa menyentuh mesin (sonify.ts) atau panel.
//
// Pemetaan dasar: satu kunjungan = satu frasa. Panjang gelombang berjalan sebagai
// waktu (pendek dulu), fluks membentuk kontur nada rendah dan volume. Skala fluks
// sama untuk semua kunjungan satu benda; ini pemetaan bunyi, bukan suhu benda.

export const SOUND = {
  /** Lama satu kunjungan, detik. */
  visitSeconds: 7,
  /** Jumlah langkah (nada) dari 0,75 sampai 5,0 mikron. Satu kunjungan punya
   *  sekitar 100 titik yang tidak tersebar rata: makin banyak langkah, makin
   *  banyak langkah kosong. */
  steps: 48,
  /** Jeda antar kunjungan saat semua diputar berurutan, detik. */
  pauseSeconds: 0.7,

  /** Nada jangkar fluks nol; fluks tetap menggeser pitch relatifnya. */
  baseHz: 110,
  /** Tangga nada: semiton dari nada dasar dalam satu oktaf. Daftar kosong = nada kontinu. */
  scale: [0, 2, 4, 7, 9],
  /** Rentang dari fluks nol sampai batas atas skala, oktaf. */
  octaves: 3,
  /** 1 = linier. Di bawah 1 mengangkat bagian redup, di atas 1 menekannya. */
  curve: 1,
  /** Register rendah untuk frasa spektrum; bukan konversi langsung dari frekuensi cahaya. */
  spectrumBaseHz: 65,
  spectrumOctaves: 0.72,
  spectrumLambdaLiftOctaves: 0.035,
  /** Menghaluskan perpindahan antar langkah agar terasa seperti gelombang pelan. */
  fluxSmoothing: 0.24,

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
  /** Bagian tiap langkah yang berbunyi; 1 membuat frasa spektrum terasa legato. */
  noteFill: 1,
  /** Keras keseluruhan, 0-1. */
  gain: 0.22,
  /** Resonansi logam 174 Hz hanya menyertai ujung panjang spektrum. */
  metalLambdaStartUm: 3.82,
  metalLambdaFullUm: 4.42,
  metalResonanceHz: 174,
  metalResonanceGain: 0.1,
};

export type SoundSettings = typeof SOUND;

export type SpectrumVoiceId = "mutedHornPad";

export type SpectrumVoiceProfile = {
  name: string;
  description: string;
  waveform: OscillatorType;
  secondWaveform: OscillatorType;
  filterHz: number;
  attackSeconds: number;
  decaySeconds: number;
  sustain: number;
  releaseSeconds: number;
  glideSeconds: number;
  vibratoHz: number;
  vibratoDepth: number;
  harmonicity: number;
  tremoloHz: number;
  tremoloDepth: number;
  gain: number;
};

export const SPECTRUM_VOICES: Record<SpectrumVoiceId, SpectrumVoiceProfile> = {
  mutedHornPad: {
    name: "Muted horn pad",
    description: "A warm, low-passed horn-like pad with a slow breath and a soft resonant tail.",
    waveform: "sawtooth",
    secondWaveform: "triangle",
    filterHz: 900,
    attackSeconds: 0.075,
    decaySeconds: 0.16,
    sustain: 0.88,
    releaseSeconds: 0.55,
    glideSeconds: 0.18,
    vibratoHz: 0.55,
    vibratoDepth: 0.02,
    harmonicity: 1.005,
    tremoloHz: 0.12,
    tremoloDepth: 0.09,
    gain: 0.4,
  },
};

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
  /** Abaikan geser timur-barat di bawah ambang ini; setelahnya, pan penuh ke sisi gerak. */
  panArcsec: 0.5,
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
  /** Pitch dasar band lebih tinggi untuk panjang gelombang pendek (lebih biru relatif IR). */
  colorMinLambdaUm: 0.75,
  colorMaxLambdaUm: 5,
  colorLowPitchHz: 220,
  colorHighPitchHz: 880,
  /** Lebar profil piksel yang lebih besar menurunkan pitch hingga batas ini. */
  sizeMinWidthPx: 4,
  sizeMaxWidthPx: 18,
  sizePitchOctaves: 0.75,
  /** Posisi atas-bawah gambar digeser ke stereo; kolom tetap menentukan waktu. */
  rowPan: 0.6,
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
  partials: { ratio: number; gain: number; detuneCents?: number }[];
};

// Partial lembut untuk pad organ sintetis pada ambience.
export const COSMIC_PAD_PARTIALS = [
  { ratio: 2, gain: 0.18 },
  { ratio: 3, gain: 0.055 },
  { ratio: 4, gain: 0.014 },
  { ratio: 1.003, gain: 0.035, detuneCents: 1.5 },
  { ratio: 2.006, gain: 0.025, detuneCents: 2.4 },
];

// Mode inharmonik memberi karakter logam hanya pada ujung panjang spektrum.
export const SPECTRUM_METAL_PARTIALS = [
  { ratio: 2.76, gain: 0.3, detuneCents: -1 },
  { ratio: 5.4, gain: 0.16, detuneCents: 1.5 },
  { ratio: 8.93, gain: 0.055, detuneCents: -2.5 },
];

// Instrumen sintetis terpisah untuk tiap sumber data; level adalah pengali relatif.
export const INSTRUMENTS: Record<InstrumentId, InstrumentProfile> = {
  spectrum: {
    waveform: "sine",
    unverifiedWaveform: "triangle",
    unverifiedGain: 0.42,
    gapTick: true,
    gapTickHz: 1400,
    gapTickGain: 0.035,
    gapTickWaveform: "sine",
    gain: 0.92,
    envelope: "sustain",
    attackSeconds: 0.014,
    sustainFraction: 0.62,
    partials: COSMIC_PAD_PARTIALS,
  },
  scan: {
    waveform: "sine",
    unverifiedWaveform: "triangle",
    unverifiedGain: 0.34,
    gapTick: true,
    gapTickHz: 1760,
    gapTickGain: 0.12,
    gapTickWaveform: "sine",
    gain: 0.44,
    envelope: "pluck",
    attackSeconds: 0.003,
    sustainFraction: 0.16,
    partials: [
      { ratio: 2, gain: 0.07 },
      { ratio: 3, gain: 0.018 },
    ],
  },
  motion: {
    waveform: "sine",
    unverifiedWaveform: "sine",
    unverifiedGain: 0.7,
    gapTick: true,
    gapTickHz: 1150,
    gapTickGain: 0.035,
    gapTickWaveform: "sine",
    gain: 0.58,
    envelope: "bell",
    attackSeconds: 0.006,
    sustainFraction: 0.1,
    partials: [
      { ratio: 2, gain: 0.12 },
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
  reverbSeconds: 4.2,
  reverbMix: 0.28,
};

/** Reverb untuk nada data dan kilau scanner, terpisah dari reverb ambience orkestra. */
export const DATA_REVERB = {
  seconds: 4.2,
  dry: 0.88,
  wet: 0.22,
};

// Ambience sintetis lokal: drone, harmonik organ, pad, dan piano yang jarang.
const D2_CENTER_UM = (1.1 + 1.63) / 2;
const D2_OPENING_HZ = 880 * Math.pow(220 / 880, (D2_CENTER_UM - 0.75) / (5 - 0.75));
const D2_OPENING_ROOT_HZ = D2_OPENING_HZ / 8;
export const AMBIENCE = {
  /** Master bed dinaikkan agar setara lapisan musik, bukan dengung latar. */
  gain: 0.48,
  dryMix: 0.64,
  reverbMix: 0.36,
  reverbSeconds: 7,
  compressorThresholdDb: -12,
  compressorRatio: 4,
  droneHz: [41.2, 55],
  droneGain: 0.34,
  droneFundamentalMix: 0.36,
  droneUpperMix: 0.23,
  droneAttackSeconds: 4.8,
  padGain: 0.15,
  organRootMix: 0.42,
  organUpperMix: 0.28,
  stringPadGain: 0.12,
  stringHarmonicMix: 0.58,
  stringDetuneCents: [-7, 0, 7],
  stringPan: 0.34,
  stringPadDelaySeconds: 2.2,
  stringPadAttackSeconds: 5.2,
  stringFilterHz: 1100,
  brassGain: 0.075,
  brassFilterHz: 540,
  brassAttackSeconds: 4.5,
  pianoGain: 0.12,
  pianoFundamentalMix: 0.42,
  pianoOvertoneMix: 0.11,
  pianoStartSeconds: 4.5,
  pianoIntervalSeconds: 10,
  pianoTailSeconds: 1.8,
  /** Nada aksen organ rendah, dalam Hz. */
  progression: [
    [65.41, 98, 130.81],
    [58.27, 87.31, 116.54],
    [73.42, 110, 146.83],
    [65.41, 98, 130.81],
  ],
  /** Akor pembuka diturunkan dari titik tengah D2 (1,10–1,63 µm). */
  openingBand: "D2",
  openingBandNoteHz: D2_OPENING_HZ,
  openingChord: [D2_OPENING_ROOT_HZ, D2_OPENING_ROOT_HZ * 1.5, D2_OPENING_ROOT_HZ * 2, D2_OPENING_HZ],
  /** Harmoni organ berubah perlahan serta bertumpang tindih. */
  chordSeconds: 12,
  chordOverlapSeconds: 4,
  buildSeconds: 3.4,
  releaseSeconds: 3,
  /** Hembusan noise tipis, disaring agar terasa seperti udara jauh. */
  windGain: 0.022,
  windHighPassHz: 120,
  windLowPassHz: 620,
  windAttackSeconds: 4.2,
  windBreathHz: 0.075,
  windBreathDepth: 0.22,
  /** Tic jarang dengan serangan lembut; reverb ambience memberi ekor panjang. */
  tickStartSeconds: 2.6,
  tickIntervalSeconds: 6.2,
  tickHz: 880,
  tickGain: 0.022,
  tickLengthSeconds: 0.11,
  tickAttackSeconds: 0.018,
  tickReleaseSeconds: 0.085,
  tickFilterHz: 1500,
  /** Ambience turun halus saat spektrum berbunyi agar tekstur pad terpisah. */
  spectrumDuckGain: 0.34,
  spectrumDuckAttackSeconds: 0.055,
  spectrumDuckReleaseSeconds: 0.32,
};
