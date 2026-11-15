// Mesin sonifikasi: aturan tetap dari data ke nada, lalu Web Audio yang membunyikannya.
// Tidak ada yang dikarang: data yang sama selalu menghasilkan nada yang sama.

import type { Bin } from "../lib/spectrum";
import { AMBIENCE, INSTRUMENTS, MIX, MOTION, SCAN, SOUND, type InstrumentId, type MotionSettings, type SoundSettings } from "./mapping";

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
  /** Normalisasi fluks 0..1 untuk kehangatan dan dinamika timbre spektrum. */
  heat?: number;
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

/** Satu kunjungan: beberapa langkah spektrum yang jatuh dalam satu ketukan
 *  dirangkum menjadi satu nada. */
export function phrase(bins: Bin[], top: number, s: SoundSettings = SOUND): Note[] {
  if (!bins.length) return [];
  const step = s.visitSeconds / bins.length;
  const raw: Note[] = bins.map((b, i): Note => ({
    t: i * step,
    dur: step * s.noteFill,
    hz: b.flux === null ? null : pitch(b.flux, top, s),
    unverified: b.unverified,
    pan: bins.length > 1 ? (i / (bins.length - 1)) * 2 * s.pan - s.pan : 0,
    lambda: b.lambda,
    voice: "spectrum",
    heat: b.flux === null ? 0 : Math.min(1, Math.max(0, b.flux / top)),
    vol: b.flux === null ? undefined : 0.2 + 0.8 * Math.sqrt(Math.min(1, Math.max(0, b.flux / top))),
  }));
  const beatCount = Math.ceil(s.visitSeconds / SCAN.colSeconds);
  const beats: Note[][] = Array.from({ length: beatCount }, () => []);
  for (const note of raw) {
    const beat = Math.min(beatCount - 1, Math.floor(note.t / SCAN.colSeconds));
    beats[beat].push(note);
  }

  return beats.flatMap((group, beat): Note[] => {
    if (!group.length) return [];
    const start = beat * SCAN.colSeconds;
    const dur = Math.min(SCAN.colSeconds * s.noteFill, s.visitSeconds - start);
    const measured = group.filter((note) => note.hz !== null);
    if (!measured.length) {
      return [{ ...group[0], t: start, dur, hz: null, unverified: group.every((note) => note.unverified) }];
    }

    const weights = measured.map((note) => Math.max(0.01, note.vol ?? 1));
    const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
    const weighted = (value: (note: Note) => number) =>
      measured.reduce((sum, note, i) => sum + value(note) * weights[i], 0) / weightSum;
    const hz = Math.exp(weighted((note) => Math.log(note.hz!)));
    const vol = Math.sqrt(measured.reduce((sum, note) => sum + (note.vol ?? 1) ** 2, 0) / measured.length);

    return [{
      ...group[0],
      t: start,
      dur,
      hz,
      vol,
      pan: weighted((note) => note.pan),
      lambda: weighted((note) => note.lambda),
      heat: weighted((note) => note.heat ?? 0),
      unverified: measured.some((note) => note.unverified),
    }];
  });
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
    const spectrumProfile = (n.voice ?? "spectrum") === "spectrum" && !tick ? INSTRUMENTS.spectrum : undefined;
    osc.type = tick
      ? "sine"
      : spectrumProfile
        ? n.unverified ? spectrumProfile.unverifiedWaveform : spectrumProfile.waveform
        : n.unverified ? s.unverifiedWaveform : s.waveform;
    osc.frequency.value = tick ? s.gapTickHz : n.hz!;
    pan.pan.value = n.pan;
    const attack = spectrumProfile
      ? Math.min(spectrumProfile.attackSeconds, dur * 0.7)
      : Math.min(0.008, dur / 4);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(peak, start + attack);
    env.gain.setValueAtTime(peak, start + dur * 0.6);
    env.gain.linearRampToValueAtTime(0, start + dur);
    let toneOut: AudioNode = osc;
    if (spectrumProfile?.lowpassHz && typeof ctx.createBiquadFilter === "function") {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = spectrumProfile.lowpassHz;
      filter.Q.value = spectrumProfile.filterQ ?? 0.0001;
      osc.connect(filter);
      toneOut = filter;
    }
    toneOut.connect(env).connect(pan).connect(out);
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
    const heat = Math.min(1, Math.max(0, note.heat ?? 0));
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
      const attack = note.voice === "spectrum" && !tick
        ? profile.attackSeconds + heat * 0.1
        : profile.attackSeconds;
      env.gain.linearRampToValueAtTime(tonePeak, start + Math.min(attack, dur * 0.7));
      if (profile.envelope === "sustain" && !tick) {
        const sustainTo = start + dur * profile.sustainFraction;
        env.gain.setValueAtTime(tonePeak, sustainTo);
        env.gain.linearRampToValueAtTime(0, start + dur);
      } else {
        env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      }
      let toneOut: AudioNode = osc;
      if (!tick && profile.lowpassHz && typeof ctx.createBiquadFilter === "function") {
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = profile.lowpassHz;
        filter.Q.value = profile.filterQ ?? 0.0001;
        osc.connect(filter);
        toneOut = filter;
      }
      toneOut.connect(env).connect(pan).connect(out);
      osc.start(start);
      osc.stop(start + dur + 0.02);
      sources.push(osc);
    }
  }
  return sources;
}

/** Synthesize a slow space bed without external audio assets. */
export function scheduleAmbience(ctx: BaseAudioContext, out: AudioNode, at: number, duration: number): AudioScheduledSourceNode[] {
  const sources: AudioScheduledSourceNode[] = [];
  if (duration <= 0) return sources;

  const tone = (
    hz: number,
    start: number,
    length: number,
    waveform: OscillatorType,
    peak: number,
    attack: number,
    release: number,
    panValue = 0,
    cutoff?: number,
  ) => {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const pan = ctx.createStereoPanner();
    osc.type = waveform;
    osc.frequency.value = hz;
    pan.pan.value = panValue;
    let node: AudioNode = osc;
    if (cutoff) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = cutoff;
      osc.connect(filter);
      node = filter;
    }
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(peak, start + Math.min(attack, length * 0.45));
    env.gain.setValueAtTime(peak, start + Math.max(attack, length - release));
    env.gain.linearRampToValueAtTime(0, start + length);
    node.connect(env).connect(pan).connect(out);
    osc.start(start);
    osc.stop(start + length + 0.03);
    sources.push(osc);
  };

  const bedLength = duration + AMBIENCE.releaseSeconds;
  for (const hz of AMBIENCE.droneHz) {
    tone(hz, at, bedLength, "sine", AMBIENCE.gain * 0.5, AMBIENCE.buildSeconds, AMBIENCE.releaseSeconds, hz === 55 ? -0.25 : 0.25);
  }
  for (const hz of AMBIENCE.organHz) {
    tone(hz, at, bedLength, "sawtooth", AMBIENCE.gain * 0.09, AMBIENCE.buildSeconds, AMBIENCE.releaseSeconds, 0, 720);
  }
  for (const hz of AMBIENCE.stringsHz) {
    tone(hz, at, bedLength, "triangle", AMBIENCE.gain * 0.065, AMBIENCE.buildSeconds * 1.4, AMBIENCE.releaseSeconds, 0);
    tone(hz * 1.004, at, bedLength, "sine", AMBIENCE.gain * 0.025, AMBIENCE.buildSeconds * 1.4, AMBIENCE.releaseSeconds, 0.08);
  }
  for (let t = 0, i = 0; t < duration; t += AMBIENCE.pianoIntervalSeconds, i++) {
    tone(AMBIENCE.pianoHz[i % AMBIENCE.pianoHz.length], at + t, Math.min(2.6, duration - t), "sine", AMBIENCE.gain * 0.26, 0.018, 2.2, i % 2 ? 0.18 : -0.18);
  }
  return sources;
}

/** Seeded-like synthetic impulse response for a long, soft tail. */
export function makeSpaceImpulse(ctx: BaseAudioContext, seconds = MIX.reverbSeconds): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let state = 0x51f15e + channel * 97;
    for (let i = 0; i < length; i++) {
      state = (state * 1664525 + 1013904223) >>> 0;
      const noise = (state / 0xffffffff) * 2 - 1;
      const fade = Math.pow(1 - i / length, 4.2);
      data[i] = noise * fade * (channel ? 0.86 : 1);
    }
  }
  return buffer;
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
  private reverb?: ConvolverNode;
  private dry?: GainNode;
  private wet?: GainNode;
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
  playMixed(notes: Note[], activeVoices: InstrumentId[], duration = 0): number {
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
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeSpaceImpulse(ctx);
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.dry.gain.value = 1 - MIX.reverbMix;
    this.wet.gain.value = MIX.reverbMix;
    this.master.connect(this.compressor);
    this.compressor.connect(this.dry).connect(ctx.destination);
    this.compressor.connect(this.reverb).connect(this.wet).connect(ctx.destination);
    const start = ctx.currentTime + 0.08;
    this.sources.push(...scheduleMixed(ctx, this.master, notes, start, activeVoices));
    this.sources.push(...scheduleAmbience(ctx, this.master, start, duration));
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
    this.reverb?.disconnect();
    this.reverb = undefined;
    this.dry?.disconnect();
    this.dry = undefined;
    this.wet?.disconnect();
    this.wet = undefined;
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
