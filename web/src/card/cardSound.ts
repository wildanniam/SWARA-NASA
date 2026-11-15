// Suara halaman kartu: desir saat kartu berputar, lonceng saat mukanya terlihat, denting
// untuk tiap percikan bintang, dan latar yang sangat pelan.
//
// Tidak memakai berkas audio; semua disintesis Web Audio. Gema dan latar memakai mesin suara
// Alif (src/sound/) apa adanya, dan nada lonceng tiap kartu diambil dari datanya dengan
// pemetaan yang sama dengan sonifikasi aplikasi:
//   - kartu gerak: satu nada per kunjungan dari pergeseran terukurnya (motionNote);
//   - kartu cahaya: spektrum dibagi delapan irisan, terang menjadi tinggi nada (pitch);
//   - kartu tempat: bintang-bintang rasi tempat benda itu, kiri ke kanan, makin tinggi di
//     langit makin tinggi nadanya.
// Rasa dan levelnya usulan awal; penyetelan akhir wewenang Alif.

import { finding, shiftAt, type Manifest } from "../lib/bundle";
import type { CardInput, CardKind } from "../lib/card";
import { patchAt, patchPoint, placeFacts } from "../lib/reading";
import { fluxTop, isUsable, LAMBDA_MAX, LAMBDA_MIN, type SpectrumPoint } from "../lib/spectrum";
import { SOUND } from "../sound/mapping";
import { makeSpaceImpulse, motionNote, pitch, scheduleAmbience } from "../sound/sonify";

/** Satu nada lonceng: frekuensi dan letak kiri-kanan (-1..1). */
export type Chime = { hz: number; pan: number };

const LEVEL = {
  master: 0.62,
  /** Latar sekitar seperempat dari efek. */
  bed: 0.16,
  whoosh: 0.2,
  bell: 0.24,
  glint: 0.05,
  thump: 0.32,
};
const PENTA = [0, 2, 4, 7, 9];
const A4 = 440;
const STORE = "swara:card-sound";

const degreeHz = (base: number, degree: number) =>
  base * Math.pow(2, (Math.floor(degree / PENTA.length) * 12 + PENTA[((degree % PENTA.length) + PENTA.length) % PENTA.length]) / 12);

// ---------- nada dari data ----------

function motionChimes(m: Manifest, blended: boolean): Chime[] {
  // Benda yang tertutup bintang latar tidak punya gerak miliknya sendiri: satu nada acuan saja.
  const base = motionNote(0, 0);
  if (blended || finding(m).kind === "none") return [base];
  const notes: Chime[] = [];
  for (const w of m.windows) {
    const s = shiftAt(m, w.id);
    if (s.kind === "moved") notes.push(motionNote(s.east, s.north));
    else if (s.kind === "reference" || s.kind === "still") notes.push(base);
  }
  return notes.length ? notes : [base];
}

function lightChimes(points: SpectrumPoint[] | undefined): Chime[] {
  const usable = (points ?? []).filter(isUsable);
  if (!usable.length) return [];
  const top = fluxTop(usable);
  const slices = 8;
  const out: Chime[] = [];
  for (let i = 0; i < slices; i++) {
    const lo = LAMBDA_MIN + ((LAMBDA_MAX - LAMBDA_MIN) * i) / slices;
    const hi = lo + (LAMBDA_MAX - LAMBDA_MIN) / slices;
    const here = usable.filter((p) => p.lambda_um >= lo && p.lambda_um < hi).map((p) => p.flux_jy);
    if (!here.length) continue;
    const mean = here.reduce((a, b) => a + b, 0) / here.length;
    // Satu oktaf di atas sonifikasi aplikasi: lonceng di bawah 200 Hz terdengar keruh.
    out.push({ hz: pitch(mean, top) * 2, pan: ((i + 0.5) / slices) * 2 * SOUND.pan - SOUND.pan });
  }
  return out;
}

function placeChimes(input: CardInput): Chime[] {
  const sky = input.sky;
  if (!sky) return [];
  const { ra, dec } = input.manifest;
  const home = placeFacts(sky.atlas, ra, dec).abbr;
  const patch = patchAt(ra, dec, 2, 2, 44);
  const seen = new Set<string>();
  const stars: { x: number; y: number }[] = [];
  for (const part of sky.atlas.constellations.lines[home] ?? [])
    for (const [r, d] of part) {
      const key = `${r.toFixed(3)},${d.toFixed(3)}`;
      const p = patchPoint(patch, r, d);
      if (seen.has(key) || !p) continue;
      seen.add(key);
      stars.push(p);
    }
  stars.sort((a, b) => a.x - b.x);
  const pick = stars.length > 9 ? stars.filter((_, i) => i % Math.ceil(stars.length / 9) === 0) : stars;
  // Petak 2 x 2 berpusat di (1, 1): y = 0 di atas. Dua oktaf pentatonik dari A4.
  return pick.map((p) => ({
    hz: degreeHz(A4, Math.round((1 - Math.max(0, Math.min(2, p.y)) / 2) * 9)),
    pan: Math.max(-0.8, Math.min(0.8, p.x - 1)),
  }));
}

export function cardChimes(kind: CardKind, input: CardInput): Chime[] {
  if (kind === "voice") return lightChimes(input.points);
  if (kind === "place") return placeChimes(input);
  return motionChimes(input.manifest, !!input.blended);
}

// ---------- mesin ----------

export function soundPreference(): boolean {
  try {
    return localStorage.getItem(STORE) !== "off";
  } catch {
    return true;
  }
}

class CardSound {
  private ctx?: AudioContext;
  private out?: GainNode;
  private fx?: GainNode;
  private bed?: GainNode;
  private noise?: AudioBuffer;
  private bedSources: AudioScheduledSourceNode[] = [];
  on = soundPreference();

  /** Dipanggil di dalam penanganan sentuhan atau tombol: browser hanya mengizinkan suara sesudahnya. */
  unlock() {
    if (!this.on) return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.out = ctx.createGain();
      this.out.gain.value = 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 5;
      this.out.connect(comp).connect(ctx.destination);
      // Efek lewat jalur kering dan gema; latar langsung ke keluaran.
      this.fx = ctx.createGain();
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      const verb = ctx.createConvolver();
      verb.buffer = makeSpaceImpulse(ctx, 3.6);
      dry.gain.value = 0.72;
      wet.gain.value = 0.42;
      this.fx.connect(dry).connect(this.out);
      this.fx.connect(verb).connect(wet).connect(this.out);
      this.bed = ctx.createGain();
      this.bed.gain.value = 0;
      this.bed.connect(this.out);
      const n = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, n, n);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
      document.addEventListener("visibilitychange", this.onVisibility);
    }
    const ctx = this.ctx;
    void ctx.resume();
    const t = ctx.currentTime;
    this.out!.gain.cancelScheduledValues(t);
    this.out!.gain.setTargetAtTime(LEVEL.master, t, 0.08);
    if (!this.bedSources.length) {
      // Lima belas menit latar dijadwalkan sekali; muncul perlahan.
      this.bedSources = scheduleAmbience(ctx, this.bed!, t + 0.05, 900);
      this.bed!.gain.setValueAtTime(0, t);
      this.bed!.gain.linearRampToValueAtTime(LEVEL.bed, t + 4);
    }
  }

  setOn(on: boolean) {
    this.on = on;
    try {
      localStorage.setItem(STORE, on ? "on" : "off");
    } catch {
      /* penyimpanan tidak tersedia: pilihan hanya berlaku di halaman ini */
    }
    if (on) this.unlock();
    else if (this.ctx && this.out) this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
  }

  private onVisibility = () => {
    if (!this.ctx) return;
    if (document.hidden) void this.ctx.suspend();
    else if (this.on) void this.ctx.resume();
  };

  private ready() {
    return this.on && this.ctx && this.ctx.state === "running" ? this.ctx : undefined;
  }

  /** Desir udara selama kartu berputar: derau yang disaring, naik dan bergeser kiri ke kanan. */
  whoosh(seconds: number, delay = 0, level = 1) {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 0.9;
    band.frequency.setValueAtTime(260, t);
    band.frequency.exponentialRampToValueAtTime(1700, t + seconds * 0.6);
    band.frequency.exponentialRampToValueAtTime(700, t + seconds);
    // Desis di atas 4 kHz terdengar seperti radio rusak, bukan udara.
    const soft = ctx.createBiquadFilter();
    soft.type = "lowpass";
    soft.frequency.value = 3800;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(LEVEL.whoosh * level, t + seconds * 0.45);
    env.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(-0.55, t);
    pan.pan.linearRampToValueAtTime(0.55, t + seconds);
    src.connect(band).connect(soft).connect(env).connect(pan).connect(this.fx!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + seconds + 0.05);
  }

  /** Lonceng: beberapa nada parsial yang tidak harmonis, meluruh cepat ke gema. */
  private bell(ctx: AudioContext, hz: number, at: number, panValue: number, peak: number, decay: number) {
    const pan = ctx.createStereoPanner();
    pan.pan.value = panValue;
    pan.connect(this.fx!);
    for (const [ratio, gain, length] of [
      [1, 1, 1],
      [2, 0.32, 0.6],
      [2.76, 0.16, 0.4],
      [5.4, 0.06, 0.22],
    ]) {
      // Parsial di atas 9 kHz menusuk telinga, terutama di speaker ponsel.
      if (hz * ratio > 9000) continue;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = hz * ratio;
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(peak * gain, at + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, at + decay * length);
      osc.connect(env).connect(pan);
      osc.start(at);
      osc.stop(at + decay * length + 0.05);
    }
  }

  /** Muka kartu terlihat: dentum rendah, lalu nada-nada kartu itu dipetik berurutan. */
  reveal(chimes: Chime[], delay = 0) {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const sub = ctx.createOscillator();
    const env = ctx.createGain();
    sub.frequency.setValueAtTime(110, t);
    sub.frequency.exponentialRampToValueAtTime(55, t + 0.5);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(LEVEL.thump, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    sub.connect(env).connect(this.out!);
    sub.start(t);
    sub.stop(t + 1);
    const step = chimes.length > 6 ? 0.075 : 0.11;
    const peak = LEVEL.bell / Math.sqrt(Math.max(1, chimes.length / 3));
    chimes.forEach((c, i) => this.bell(ctx, c.hz, t + 0.03 + i * step, c.pan, peak, 2.4));
  }

  /** Percikan bintang: satu denting per bintang, di tempat dan seterbang bintangnya. */
  sparkle(sparks: { x: number; speed: number }[]) {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const heard = sparks.slice(0, 24);
    heard.forEach((s, i) => {
      // Bintang yang terbang lebih jauh berbunyi lebih tinggi: A5 sampai dua oktaf di atasnya.
      const hz = degreeHz(A4 * 2, Math.round(Math.max(0, Math.min(1, s.speed)) * 9));
      const at = t + (i / heard.length) * 0.42 + Math.random() * 0.04;
      this.bell(ctx, hz, at, Math.max(-1, Math.min(1, s.x)), LEVEL.glint, 0.5 + Math.random() * 0.5);
    });
  }
}

export const cardSound = new CardSound();
