// Mesin sonifikasi: aturan tetap dari data ke nada, lalu Web Audio yang membunyikannya.
// Tidak ada yang dikarang: data yang sama selalu menghasilkan nada yang sama.

import type { Bin } from "../lib/spectrum";
import { SOUND, type SoundSettings } from "./mapping";

export type Note = {
  /** Detik sejak awal frasa. */
  t: number;
  dur: number;
  /** null = langkah tanpa data. */
  hz: number | null;
  unverified: boolean;
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
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const start = at + n.t;
    const dur = tick ? 0.012 : n.dur;
    const peak = tick ? s.gapTickGain : n.unverified ? s.unverifiedGain : 1;
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

/** Pemutar: satu konteks audio untuk seluruh aplikasi, dibuat saat tombol pertama ditekan. */
export class Sonifier {
  private ctx?: AudioContext;
  private master?: GainNode;
  private sources: AudioScheduledSourceNode[] = [];

  /** Putar beberapa frasa berurutan. Mengembalikan waktu mulai tiap frasa (waktu konteks). */
  play(phrases: Note[][], s: SoundSettings = SOUND): number[] {
    this.stop();
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

  /** Waktu konteks audio sekarang; penanda di panel mengikuti jam ini, bukan jam layar. */
  now(): number {
    return this.ctx?.currentTime ?? 0;
  }
}
