// Mesin sonifikasi: aturan tetap dari data ke nada, lalu Web Audio yang membunyikannya.
// Tidak ada yang dikarang: data yang sama selalu menghasilkan nada yang sama.

import type { Bin } from "../lib/spectrum";
import { INSTRUMENTS, MIX, MOTION, SOUND, type InstrumentId, type MotionSettings, type SoundSettings } from "./mapping";

export type Note = {
  /** Detik sejak awal frasa. */
  t: number;
  dur: number;
  /** null = langkah tanpa data. */
  hz: number | null;
  /** Pengali volume nada ini; default 1 (perilaku lama). */
  vol?: number;
  unverified: boolean;
  /** -1 kiri .. 1 kanan. */
  pan: number;
  lambda: number;
  /** Lapisan yang menghasilkan nada ini; nada lama tanpa voice dianggap spektrum. */
  voice?: InstrumentId;
};

/** Kebutuhan minimum penjadwal: dipenuhi SoundSettings maupun ScanSettings. */
export type Voice = {
  waveform: OscillatorType;
  unverifiedWaveform: OscillatorType;
  unverifiedGain: number;
  gapTick: boolean;
  gapTickHz: number;
  gapTickGain: number;
};

/** Fluks -> frekuensi. Fluks nol = nada dasar, `top` = nada tertinggi. */
export function pitch(flux: number, top: number, s: SoundSettings = SOUND): number {
  const level = Math.pow(Math.min(1, Math.max(0, flux / top)), s.curve);
  let semitones = level * s.octaves * 12;
  if (s.scale.length) {
    // Bulatkan ke derajat tangga nada terdekat.
    const perOctave = s.scale.length;
    const degrees = s.octaves * perOctave;
    const d = Math.round(level * degrees);
    semitones = Math.floor(d / perOctave) * 12 + s.scale[d % perOctave];
  }
  return s.baseHz * Math.pow(2, semitones / 12);
}

/** Satu kunjungan (sudah dibagi per langkah) -> deretan nada. */
export function phrase(bins: Bin[], top: number, s: SoundSettings = SOUND): Note[] {
  const step = s.visitSeconds / bins.length;
  return bins.map((b, i) => ({
    t: i * step,
    dur: step * s.noteFill,
    hz: b.flux === null ? null : pitch(b.flux, top, s),
    unverified: b.unverified,
    pan: bins.length > 1 ? (i / (bins.length - 1)) * 2 * s.pan - s.pan : 0,
    lambda: b.lambda,
    voice: "spectrum",
  }));
}

/** Jadwalkan satu frasa mulai `at` (waktu konteks audio). Mengembalikan sumber
 *  suaranya supaya bisa dihentikan. Dipakai juga untuk render luring saat menguji. */
export function schedule(
  ctx: BaseAudioContext,
  out: AudioNode,
  notes: Note[],
  at: number,
  s: Voice,
): AudioScheduledSourceNode[] {
  const sources: AudioScheduledSourceNode[] = [];
  for (const n of notes) {
    const tick = n.hz === null;
    if (tick && !s.gapTick) continue;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const start = at + n.t;
    const dur = tick ? 0.012 : n.dur;
    const peak = (tick ? s.gapTickGain : n.unverified ? s.unverifiedGain : 1) * (n.vol ?? 1);
    osc.type = tick ? "sine" : n.unverified ? s.unverifiedWaveform : s.waveform;
    osc.frequency.value = tick ? s.gapTickHz : n.hz!;
    pan.pan.value = n.pan;
    const attack = Math.min(0.008, dur / 4);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(peak, start + attack);
    env.gain.setValueAtTime(peak, start + dur * 0.6);
    env.gain.linearRampToValueAtTime(0, start + dur);
    osc.connect(env).connect(pan).connect(out);
    osc.start(start);
    osc.stop(start + dur + 0.02);
    sources.push(osc);
  }
  return sources;
}

/** Jadwalkan semua nada pada satu jam dengan timbre, envelope, dan level per lapisan. */
export function scheduleMixed(
  ctx: BaseAudioContext,
  out: AudioNode,
  notes: Note[],
  at: number,
  activeVoices: InstrumentId[],
): AudioScheduledSourceNode[] {
  const sources: AudioScheduledSourceNode[] = [];
  const mix = 1 / Math.sqrt(Math.max(1, activeVoices.length));
  for (const note of notes) {
    const profile = INSTRUMENTS[note.voice ?? "spectrum"];
    const tick = note.hz === null;
    if (tick && !profile.gapTick) continue;
    const start = at + note.t;
    const dur = tick ? 0.012 : note.dur;
    const peak =
      (tick ? profile.gapTickGain : note.unverified ? profile.unverifiedGain : 1) *
      (note.vol ?? 1) *
      profile.gain *
      mix;
    const tones = tick
      ? [{ hz: profile.gapTickHz, gain: 1, waveform: profile.gapTickWaveform }]
      : [
          { hz: note.hz!, gain: 1, waveform: note.unverified ? profile.unverifiedWaveform : profile.waveform },
          ...profile.partials.map((partial) => ({
            hz: note.hz! * partial.ratio,
            gain: partial.gain,
            waveform: note.unverified ? profile.unverifiedWaveform : profile.waveform,
          })),
        ];
    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      const pan = ctx.createStereoPanner();
      const tonePeak = Math.max(0.0001, peak * tone.gain);
      osc.type = tone.waveform;
      osc.frequency.value = tone.hz;
      pan.pan.value = note.pan;
      env.gain.setValueAtTime(0, start);
      env.gain.linearRampToValueAtTime(tonePeak, start + Math.min(profile.attackSeconds, dur * 0.25));
      if (profile.envelope === "sustain" && !tick) {
        const sustainTo = start + dur * profile.sustainFraction;
        env.gain.setValueAtTime(tonePeak, sustainTo);
        env.gain.linearRampToValueAtTime(0, start + dur);
      } else {
        env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      }
      osc.connect(env).connect(pan).connect(out);
      osc.start(start);
      osc.stop(start + dur + 0.02);
      sources.push(osc);
    }
  }
  return sources;
}

/** Pergeseran sejak kunjungan acuan (detik busur) -> satu nada. Utara menaikkan
 *  nada, selatan menurunkan; timur menggeser ke kiri, barat ke kanan. */
export function motionNote(east: number, north: number, m: MotionSettings = MOTION): { hz: number; pan: number } {
  const steps = Math.min(m.maxSteps, Math.max(-m.maxSteps, Math.round(north / m.arcsecPerStep)));
  const per = m.scale.length;
  const degree = ((steps % per) + per) % per;
  const semitones = Math.floor(steps / per) * 12 + m.scale[degree];
  return {
    hz: m.baseHz * Math.pow(2, semitones / 12),
    pan: Math.min(1, Math.max(-1, -east / m.panArcsec)),
  };
}

/** Satu nada per kunjungan untuk melodi riwayat gerak. null = tanpa pengukuran. */
export function motionPhrase(steps: ({ hz: number; pan: number } | null)[], m: MotionSettings = MOTION): Note[] {
  return steps.map((s, i) => ({
    t: i * m.melodyStep,
    dur: m.seconds,
    hz: s?.hz ?? null,
    unverified: false,
    pan: s?.pan ?? 0,
    // Urutan kunjungan 0..1, bukan panjang gelombang.
    lambda: steps.length > 1 ? i / (steps.length - 1) : 0,
    voice: "motion",
  }));
}

/** Naik tiap Sonifier.play dipanggil: loop visual yang epoch-nya tertinggal
 *  tahu suaranya sudah diambil alih mode lain, lalu berhenti sendiri. */
export const soundEpoch = { n: 0 };

/** Pemutar: satu konteks audio untuk seluruh aplikasi, dibuat saat tombol pertama ditekan. */
export class Sonifier {
  private ctx?: AudioContext;
  private master?: GainNode;
  private compressor?: DynamicsCompressorNode;
  private sources: AudioScheduledSourceNode[] = [];

  /** Putar beberapa frasa berurutan. Mengembalikan waktu mulai tiap frasa (waktu konteks). */
  play(phrases: Note[][], s: SoundSettings = SOUND): number[] {
    this.stop();
    soundEpoch.n++;
    const ctx = (this.ctx ??= new AudioContext());
    void ctx.resume();
    this.master = ctx.createGain();
    this.master.gain.value = s.gain;
    this.master.connect(ctx.destination);
    const starts: number[] = [];
    let at = ctx.currentTime + 0.08;
    for (const notes of phrases) {
      starts.push(at);
      this.sources.push(...schedule(ctx, this.master, notes, at, s));
      at += s.visitSeconds + s.pauseSeconds;
    }
    return starts;
  }

  /** Satu campuran berlapis dengan jam dan gain utama bersama. */
  playMixed(notes: Note[], activeVoices: InstrumentId[]): number {
    this.stop();
    soundEpoch.n++;
    const ctx = (this.ctx ??= new AudioContext());
    void ctx.resume();
    this.master = ctx.createGain();
    this.master.gain.value = MIX.gain;
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = MIX.compressorThresholdDb;
    this.compressor.knee.value = MIX.compressorKneeDb;
    this.compressor.ratio.value = MIX.compressorRatio;
    this.compressor.attack.value = MIX.compressorAttackSeconds;
    this.compressor.release.value = MIX.compressorReleaseSeconds;
    this.master.connect(this.compressor).connect(ctx.destination);
    const start = ctx.currentTime + 0.08;
    this.sources.push(...scheduleMixed(ctx, this.master, notes, start, activeVoices));
    return start;
  }

  stop() {
    for (const src of this.sources) {
      try {
        src.stop();
      } catch {
        // sudah selesai
      }
    }
    this.sources = [];
    this.master?.disconnect();
    this.master = undefined;
    this.compressor?.disconnect();
    this.compressor = undefined;
  }

  /** Ada frasa suara yang sedang dijalankan. */
  get busy(): boolean {
    return this.sources.length > 0;
  }

  /** Waktu konteks audio sekarang; penanda di panel mengikuti jam ini, bukan jam layar. */
  now(): number {
    return this.ctx?.currentTime ?? 0;
  }
}

/** Satu pemutar untuk seluruh aplikasi. */
export const sonifier = new Sonifier();
