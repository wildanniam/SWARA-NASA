// Mesin sonifikasi: aturan tetap dari data ke nada, lalu Web Audio yang membunyikannya.
// Tidak ada yang dikarang: data yang sama selalu menghasilkan nada yang sama.

import type { Bin } from "../lib/spectrum";
import * as Tone from "tone";
import { AMBIENCE, DATA_REVERB, MOTION, SOUND, SPECTRUM_VOICES, type InstrumentId, type MotionSettings, type SoundSettings } from "./mapping";
import { makeImpulseResponse, startAmbience, stopAmbience } from "./ambience";

// Kartu berbagi memakai helper ambience dan impulse response lewat modul ini.
export { makeSpaceImpulse, scheduleAmbience } from "./ambience";

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
  /** Arah perubahan fluks lokal: naik, stabil, atau turun. */
  trend?: -1 | 0 | 1;
  /** Besar perubahan fluks ternormalisasi, -1..1. */
  change?: number;
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
  let previousHeat: number | undefined;
  return bins.map((b, i) => {
    const rawHeat = b.flux === null ? null : Math.min(1, Math.max(0, b.flux / top));
    const heat = rawHeat === null
      ? 0
      : previousHeat === undefined
        ? rawHeat
        : previousHeat + (rawHeat - previousHeat) * s.fluxSmoothing;
    const rawChange = rawHeat === null || previousHeat === undefined ? 0 : heat - previousHeat;
    const change = Math.abs(rawChange) < 0.012 ? 0 : Math.min(1, Math.max(-1, rawChange * 8));
    if (rawHeat !== null) previousHeat = heat;
    const wavelength = Math.min(1, Math.max(0, (b.lambda - 0.75) / (5 - 0.75)));
    const hz = rawHeat === null
      ? null
      : s.spectrumBaseHz * Math.pow(2, heat * s.spectrumOctaves + wavelength * s.spectrumLambdaLiftOctaves);
    return {
      t: i * step,
      dur: step * s.noteFill,
      // Fluks membentuk kontur sub-bass; panjang gelombang hanya memberi
      // kenaikan kecil sepanjang frasa.
      hz,
      unverified: b.unverified,
      // Target berada di tengah apertur; panjang gelombang adalah urutan waktu,
      // bukan posisi sumber kiri-kanan.
      pan: 0,
      lambda: b.lambda,
      voice: "spectrum" as const,
      heat,
      vol: rawHeat === null ? undefined : 0.12 + 0.62 * Math.sqrt(heat),
      trend: rawHeat === null ? 0 as const : change > 0 ? 1 as const : change < 0 ? -1 as const : 0 as const,
      change,
    };
  });
}

/** Jalur kompatibilitas untuk frasa tunggal; suara tetap lewat mesin Tone.js yang sama. */
export function schedule(
  ctx: BaseAudioContext,
  out: AudioNode,
  notes: Note[],
  at: number,
  _s: Voice,
): AudioScheduledSourceNode[] {
  return scheduleMixed(ctx, out, notes, at, ["spectrum"]);
}

/** Jadwalkan semua nada pada satu jam dengan timbre, envelope, dan level per lapisan. */
// Sapuan memakai suara monofonik; gerak punya suara stereo tersendiri;
// spektrum memakai muted horn pad.
let sharedSynth: Tone.Synth | undefined;
let sharedFilter: Tone.Filter | undefined;
let sharedPan: Tone.Panner | undefined;
let sharedLevel: Tone.Gain | undefined;
type SpectrumVoiceRuntime = { synth: Tone.DuoSynth; filter: Tone.Filter; level: Tone.Gain };
let spectrumVoiceRuntime: SpectrumVoiceRuntime | undefined;
type MotionVoiceRuntime = { synth: Tone.Synth; panner: Tone.Panner; level: Tone.Gain };
let motionVoiceRuntime: MotionVoiceRuntime | undefined;
let sharedReverb: ConvolverNode | undefined;
let sharedDry: GainNode | undefined;
let sharedWet: GainNode | undefined;
let spectrumSpace: ConvolverNode | undefined;
let spectrumSpaceWet: GainNode | undefined;
const scheduledEvents = new Set<number>();

function ensureSharedVoice() {
  if (sharedSynth) return;
  const ctx = Tone.getContext().rawContext as AudioContext;
  sharedSynth = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.025, decay: 0.08, sustain: 0.72, release: 0.12 },
    portamento: 0.035,
  });
  sharedFilter = new Tone.Filter(1800, "lowpass", -12);
  sharedPan = new Tone.Panner(0);
  sharedLevel = new Tone.Gain(SOUND.gain);
  sharedDry = ctx.createGain();
  sharedWet = ctx.createGain();
  sharedReverb = ctx.createConvolver();
  sharedReverb.buffer = makeImpulseResponse(ctx, DATA_REVERB.seconds);
  spectrumSpace = ctx.createConvolver();
  spectrumSpace.buffer = makeImpulseResponse(ctx, AMBIENCE.reverbSeconds);
  spectrumSpaceWet = ctx.createGain();
  sharedDry.gain.value = DATA_REVERB.dry;
  sharedWet.gain.value = DATA_REVERB.wet;
  // Pad spektrum mendapat tail panjang seperti ambience; sapuan dan gerak
  // memakai reverb data yang lebih pendek.
  spectrumSpaceWet.gain.value = 0.26;
  sharedSynth.chain(sharedFilter, sharedPan, sharedLevel);
  sharedLevel.connect(sharedDry);
  sharedDry.connect(Tone.Destination.input.input.input);
  sharedLevel.connect(sharedReverb);
  sharedReverb.connect(sharedWet).connect(Tone.Destination.input.input.input);
  spectrumSpace.connect(spectrumSpaceWet).connect(Tone.Destination.input.input.input);
}

function ensureSpectrumVoice(): SpectrumVoiceRuntime {
  ensureSharedVoice();
  if (spectrumVoiceRuntime) return spectrumVoiceRuntime;
  const profile = SPECTRUM_VOICES.mutedHornPad;
  const envelope = {
    attack: profile.attackSeconds,
    decay: profile.decaySeconds,
    sustain: profile.sustain,
    release: profile.releaseSeconds,
  };
  const filterOptions = { type: "lowpass" as const, frequency: profile.filterHz, Q: 0.75, rolloff: -12 as const };
  const filter = new Tone.Filter(profile.filterHz, "lowpass", -12);
  const tremolo = new Tone.Tremolo(profile.tremoloHz, profile.tremoloDepth).start();
  const level = new Tone.Gain(profile.gain);
  const synth = new Tone.DuoSynth({
    harmonicity: profile.harmonicity,
    vibratoRate: profile.vibratoHz,
    vibratoAmount: profile.vibratoDepth,
    portamento: profile.glideSeconds,
    voice0: { oscillator: { type: profile.waveform }, envelope, filter: filterOptions },
    voice1: { oscillator: { type: profile.secondWaveform }, envelope, filter: filterOptions },
  });
  synth.chain(filter, tremolo, level);
  level.connect(sharedDry!);
  level.connect(spectrumSpace!);
  spectrumVoiceRuntime = { synth, filter, level };
  return spectrumVoiceRuntime;
}

function ensureMotionVoice(): MotionVoiceRuntime {
  ensureSharedVoice();
  if (motionVoiceRuntime) return motionVoiceRuntime;
  const synth = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.012, decay: 0.18, sustain: 0.18, release: 0.42 },
    portamento: 0.035,
  });
  const panner = new Tone.Panner(0);
  const level = new Tone.Gain(MOTION.gain);
  synth.chain(panner, level);
  level.connect(sharedDry!);
  level.connect(sharedReverb!);
  motionVoiceRuntime = { synth, panner, level };
  return motionVoiceRuntime;
}

/** Jadwalkan suara pindai, gerak, dan pad spektrum pada satu jam. */
export function scheduleMixed(
  _ctx: BaseAudioContext,
  _out: AudioNode,
  notes: Note[],
  at: number,
  _activeVoices: InstrumentId[],
): AudioScheduledSourceNode[] {
  ensureSharedVoice();
  const spectrumVoice = ensureSpectrumVoice();
  const transport = Tone.Transport;
  if (transport.state !== "started") transport.start();
  const timelineAt = transport.seconds + Math.max(0, at - Tone.now());

  // Satu suara tidak dapat membunyikan puncak serentak. Saat waktunya sama,
  // pilih puncak dengan amplitudo data terkuat dan pertahankan jam sapuan.
  const byTime = new Map<number, Note>();
  for (const note of notes) {
    if (note.hz === null || !Number.isFinite(note.hz)) continue;
    const eventAt = timelineAt + note.t;
    if (note.voice === "motion") {
      const motion = ensureMotionVoice();
      let id = -1;
      id = transport.scheduleOnce((time) => {
        scheduledEvents.delete(id);
        motion.panner.pan.rampTo(Math.min(1, Math.max(-1, note.pan)), 0.012, time);
        motion.level.gain.rampTo(MOTION.gain, 0.04, time);
        const velocity = Math.min(1, Math.max(0.05, note.vol ?? 0.85));
        motion.synth.triggerAttackRelease(note.hz!, note.dur, time, velocity);
      }, eventAt);
      scheduledEvents.add(id);
      continue;
    }
    if (note.voice === "spectrum" && note.heat !== undefined) {
      let id = -1;
      id = transport.scheduleOnce((time) => {
        scheduledEvents.delete(id);
        const confidence = note.unverified ? 0.65 : 1;
        const change = Math.min(1, Math.max(-1, note.change ?? 0));
        const contourGain = change > 0 ? 1 + change * 0.14 : 1 + change * 0.18;
        const velocity = Math.min(1, Math.max(0.035, (note.vol ?? 0.5) * confidence * contourGain));
        const profile = SPECTRUM_VOICES.mutedHornPad;
        const heat = Math.min(1, Math.max(0, note.heat ?? 0));
        // Flux yang naik membuka nada; flux yang turun menggelapkan dan
        // meredakannya sebagai metafora bunyi, bukan pembacaan suhu.
        const cutoff = note.change === undefined
          ? profile.filterHz * (note.unverified ? 0.78 : 1)
          : profile.filterHz * (0.72 + heat * 0.25 + Math.max(0, change) * 0.18 + Math.min(0, change) * 0.2) * (note.unverified ? 0.78 : 1);
        spectrumVoice.filter.frequency.rampTo(cutoff, note.change === undefined ? 0.12 : 0.15, time);
        spectrumVoice.level.gain.rampTo(profile.gain, 0.08, time);
        spectrumVoice.synth.triggerAttackRelease(note.hz!, note.dur, time, velocity);
      }, eventAt);
      scheduledEvents.add(id);
      continue;
    }
    const previous = byTime.get(note.t);
    const strength = (candidate: Note) => (candidate.vol ?? 1) * (candidate.unverified ? 0.65 : 1);
    if (!previous || strength(note) > strength(previous)) byTime.set(note.t, note);
  }
  const ordered = [...byTime.values()].sort((a, b) => a.t - b.t);
  const scheduled: AudioScheduledSourceNode[] = [];
  for (let index = 0; index < ordered.length; index++) {
    const note = ordered[index];
    const next = ordered[index + 1];
    const eventAt = timelineAt + note.t;
    const duration = Math.max(0.035, Math.min(note.dur, next ? next.t - note.t : note.dur));
    const confidence = note.unverified ? 0.65 : 1;
    const amplitude = Math.min(1, Math.max(0.035, (note.vol ?? 0.5) * confidence));
    const harmonicPosition = Math.min(1, Math.max(0, (Math.log2(note.hz!) - Math.log2(110)) / 4));
    const cutoff = 900 + harmonicPosition * 6900;
    let id = -1;
    id = transport.scheduleOnce((time) => {
      scheduledEvents.delete(id);
      sharedFilter!.frequency.rampTo(cutoff, 0.08, time);
      sharedPan!.pan.rampTo(Math.min(1, Math.max(-1, note.pan)), 0.06, time);
      sharedLevel!.gain.rampTo(SOUND.gain, 0.055, time);
      sharedSynth!.triggerAttackRelease(note.hz!, duration, time, amplitude);
    }, eventAt);
    scheduledEvents.add(id);
  }
  return scheduled;
}

/** Pergeseran sejak kunjungan acuan (detik busur) -> satu nada. Utara menaikkan
 *  nada, selatan menurunkan; timur menggeser ke kiri, barat ke kanan. */
export function motionNote(east: number, north: number, m: MotionSettings = MOTION): { hz: number; pan: number } {
  const displacement = Math.min(m.maxSteps, Math.max(-m.maxSteps, north / m.arcsecPerStep));
  return {
    // Pemetaan logaritmik kontinu: seluruh rentang ukur membentang satu oktaf
    // ke masing-masing arah, tanpa pembulatan ke tangga nada.
    hz: m.baseHz * Math.pow(2, displacement / m.maxSteps),
    // Pan keras ke sisi yang sama dengan arah timur-barat di peta (timur kiri).
    // Sisi lawan senyap; pergeseran kecil di bawah ambang tetap di tengah.
    pan: Math.abs(east) < m.panArcsec ? 0 : -Math.sign(east),
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

  /** Konteks Tone.js yang dipakai bersama seluruh suara SWARA. */
  audioContext(): AudioContext {
    ensureSharedVoice();
    return (this.ctx ??= Tone.getContext().rawContext as AudioContext);
  }

  /** Buka konteks dari gestur tombol Play agar kebijakan autoplay browser terpenuhi. */
  resume(): Promise<void> {
    this.audioContext();
    return Tone.start();
  }

  /** Putar beberapa frasa berurutan. Mengembalikan waktu mulai tiap frasa (waktu konteks). */
  play(phrases: Note[][], s: SoundSettings = SOUND): number[] {
    this.stop();
    soundEpoch.n++;
    const ctx = this.audioContext();
    void ctx.resume();
    const starts: number[] = [];
    let at = Tone.now() + 0.08;
    for (const notes of phrases) {
      starts.push(at);
      scheduleMixed(ctx, ctx.destination, notes, at, ["spectrum"]);
      at += s.visitSeconds + s.pauseSeconds;
    }
    return starts;
  }

  /** Satu campuran berlapis dengan jam dan gain utama bersama. */
  playMixed(notes: Note[], activeVoices: InstrumentId[], duration = 0): number {
    this.stop();
    soundEpoch.n++;
    const ctx = this.audioContext();
    void ctx.resume();
    const start = Tone.now() + 0.08;
    scheduleMixed(ctx, ctx.destination, notes, start, activeVoices);
    if (duration > 0) {
      const ambientAt = ctx.currentTime + Math.max(0, start - Tone.now());
      startAmbience(ctx, ambientAt, duration);
    }
    return start;
  }

  stop() {
    const now = Tone.now();
    for (const id of scheduledEvents) Tone.Transport.clear(id);
    scheduledEvents.clear();
    ensureSharedVoice();
    const ctx = this.audioContext();
    stopAmbience(ctx);
    sharedSynth!.triggerRelease(now);
    sharedLevel!.gain.rampTo(0, 0.025, now);
    if (spectrumVoiceRuntime) {
      spectrumVoiceRuntime.synth.triggerRelease(now);
      spectrumVoiceRuntime.level.gain.rampTo(0, 0.025, now);
    }
    if (motionVoiceRuntime) {
      motionVoiceRuntime.synth.triggerRelease(now);
      motionVoiceRuntime.level.gain.rampTo(0, 0.025, now);
    }
  }

  /** Ada frasa suara yang sedang dijalankan. */
  get busy(): boolean {
    return scheduledEvents.size > 0;
  }

  /** Waktu konteks audio sekarang; penanda di panel mengikuti jam ini, bukan jam layar. */
  now(): number {
    return Tone.now();
  }
}

/** Satu pemutar untuk seluruh aplikasi. */
export const sonifier = new Sonifier();
