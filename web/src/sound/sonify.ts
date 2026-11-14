// Mesin sonifikasi: aturan tetap dari data ke nada, lalu Web Audio yang membunyikannya.
// Tidak ada yang dikarang: data yang sama selalu menghasilkan nada yang sama.

import type { Bin } from "../lib/spectrum";
import { shiftAt, type Manifest } from "../lib/bundle";
import { CALIBRATION_HZ, EARCONS, MODE_ANNOUNCE, MOTION, SOUND, type MotionSettings, type SoundSettings } from "./mapping";
import { modeById, type ModeId } from "./modes";

export type Note = {
  /** Detik sejak awal frasa. */
  t: number;
  dur: number;
  /** null = langkah tanpa data. */
  hz: number | null;
  unverified: boolean;
  /** Pengali keras nada ini, 0-1. Mode yang volumenya konstan memakai 1;
   *  hanya Pindai yang menyandikan terang lewat sini. */
  vol: number;
  /** Deteksi lemah: terdengar berbeda tanpa mengubah pitch yang menyandikan
   *  data. Memakai timbre penanda yang sama dengan `unverified`. */
  lowConf: boolean;
  /** -1 kiri .. 1 kanan. */
  pan: number;
  lambda: number;
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
    vol: 1,
    lowConf: false,
    pan: bins.length > 1 ? (i / (bins.length - 1)) * 2 * s.pan - s.pan : 0,
    lambda: b.lambda,
  }));
}

/** Jadwalkan satu frasa mulai `at` (waktu konteks audio). Mengembalikan sumber
 *  suaranya supaya bisa dihentikan. Dipakai juga untuk render luring saat menguji. */
export function schedule(
  ctx: BaseAudioContext,
  out: AudioNode,
  notes: Note[],
  at: number,
  s: SoundSettings = SOUND,
): AudioScheduledSourceNode[] {
  const sources: AudioScheduledSourceNode[] = [];
  for (const n of notes) {
    const tick = n.hz === null;
    if (tick && !s.gapTick) continue;
    // Nada bertanda (tak terverifikasi atau deteksi lemah) memakai timbre
    // penanda dari mapping, tetapi pitch-nya tetap dari data.
    const marked = n.unverified || n.lowConf;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const start = at + n.t;
    const dur = tick ? 0.012 : n.dur;
    const peak = (tick ? s.gapTickGain : marked ? s.unverifiedGain : 1) * (tick ? 1 : n.vol);
    osc.type = tick ? "sine" : marked ? s.unverifiedWaveform : s.waveform;
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

/** Satu frasa Gerak: satu nada per kunjungan, ternormalisasi ke rentang
 *  pergeseran objek itu (bukan rentang global). Acuan dan kunjungan diam
 *  berbunyi sama persis; kunjungan tanpa pengukuran menjadi ketukan. */
export function motionPhrase(m: Manifest, mo: MotionSettings = MOTION): Note[] {
  const shifts = m.windows.map((w) => shiftAt(m, w.id));
  const maxShift = Math.max(0, ...shifts.map((s) => (s.kind === "moved" ? Math.hypot(s.east, s.north) : 0)));
  // Skala supaya pergeseran terbesar objek ini mencapai nada tertinggi.
  const k = maxShift > 0 ? (mo.maxSteps * mo.arcsecPerStep) / maxShift : 1;
  const step = mo.seconds + mo.phraseGapSeconds;
  return shifts.map((s, i) => {
    const at = (hz: number | null, pan = 0): Note => ({
      t: i * step,
      dur: mo.seconds,
      hz,
      unverified: false,
      vol: 1,
      lowConf: false,
      pan,
      lambda: 0,
    });
    if (s.kind === "none" || s.kind === "unmeasured") return at(null);
    const n = s.kind === "moved" ? motionNote(s.east * k, s.north * k, mo) : motionNote(0, 0, mo);
    return at(n.hz, n.pan);
  });
}

/** Frasa pengumuman ganti mode: earcon khas lalu kalibrasi rendah-tinggi. */
export function modePhrase(id: ModeId): Note[] {
  const ear = EARCONS[id];
  const [lo, hi] = CALIBRATION_HZ[id];
  const step = MODE_ANNOUNCE.noteSeconds + MODE_ANNOUNCE.gapSeconds;
  const at = (i: number, hz: number): Note => ({
    t: i * step,
    dur: MODE_ANNOUNCE.noteSeconds,
    hz,
    unverified: false,
    vol: 1,
    lowConf: false,
    pan: 0,
    lambda: 0,
  });
  const notes = ear.steps.map((s, i) => at(i, ear.baseHz * Math.pow(2, s / 12)));
  const base = ear.steps.length + 1;
  notes.push(at(base, lo), at(base + 1, hi));
  return notes;
}

/** Umumkan ganti mode lewat jalur suara (earcon + kalibrasi). */
export function announceMode(id: ModeId): void {
  if (!modeById(id)) return;
  sonifier.play([modePhrase(id)], SOUND, MODE_ANNOUNCE.gain);
}

/** Pemutar: satu konteks audio untuk seluruh aplikasi, dibuat saat tombol pertama ditekan. */
export class Sonifier {
  private ctx?: AudioContext;
  private master?: GainNode;
  private sources: AudioScheduledSourceNode[] = [];

  /** Putar beberapa frasa berurutan. Mengembalikan waktu mulai tiap frasa (waktu konteks). */
  play(phrases: Note[][], s: SoundSettings = SOUND, gain?: number): number[] {
    this.stop();
    const ctx = (this.ctx ??= new AudioContext());
    void ctx.resume();
    this.master = ctx.createGain();
    this.master.gain.value = gain ?? s.gain;
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
  }

  /** Suara spektrum sedang berjalan; motif gerak menunggu supaya tidak bertumpuk. */
  get busy(): boolean {
    return this.sources.length > 0;
  }

  /** Satu nada pendek berbunyi lonceng untuk motif gerak; null = ketukan. */
  blip(note: { hz: number; pan: number } | null, m: MotionSettings = MOTION) {
    const ctx = (this.ctx ??= new AudioContext());
    void ctx.resume();
    const at = ctx.currentTime + 0.01;
    const dur = note ? m.seconds : 0.02;
    const env = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = note?.pan ?? 0;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(note ? m.gain : m.tickGain, at + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0005, at + dur);
    env.connect(pan).connect(ctx.destination);
    // Nada dasar ditambah oktafnya yang lebih pelan: cukup berbeda dari suara spektrum.
    for (const [mult, level] of note ? [[1, 1], [2, 0.25]] : [[1, 1]]) {
      const osc = ctx.createOscillator();
      const part = ctx.createGain();
      osc.frequency.value = (note?.hz ?? m.tickHz) * mult;
      part.gain.value = level;
      osc.connect(part).connect(env);
      osc.start(at);
      osc.stop(at + dur + 0.02);
    }
  }

  /** Waktu konteks audio sekarang; penanda di panel mengikuti jam ini, bukan jam layar. */
  now(): number {
    return this.ctx?.currentTime ?? 0;
  }
}

/** Satu pemutar untuk seluruh aplikasi. */
export const sonifier = new Sonifier();
