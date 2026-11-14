// Uji render luring: schedule() dan Sonifier dijalankan dengan konteks audio
// palsu yang mencatat semua parameter, jadi tanpa browser pun gain, timbre,
// dan stop-bersih tiap nada bisa diverifikasi.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { Manifest } from "../lib/bundle";
import type { SpectrumPoint } from "../lib/spectrum";
import { BRIGHTNESS, SOUND } from "./mapping";
import {
  brightnessAnalysis,
  brightnessPhrase,
  commonBand,
  motionNote,
  phrase,
  schedule,
  sonifier,
  motionPhrase,
  type Note,
} from "./sonify";

type Call = { method: string; value: number; at: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

function fakeCtx() {
  const oscs: AnyNode[] = [];
  const gains: AnyNode[] = [];
  const ctx: AnyNode = {
    currentTime: 10,
    destination: {},
    resume() {
      return Promise.resolve();
    },
    createOscillator() {
      const o: AnyNode = {
        type: "",
        frequency: { value: 0 },
        stopCalls: 0,
        connect(n: AnyNode) {
          return n;
        },
        start() {},
        stop() {
          o.stopCalls++;
        },
      };
      oscs.push(o);
      return o;
    },
    createGain() {
      const calls: Call[] = [];
      const g: AnyNode = {
        gain: {
          value: 0,
          setValueAtTime(v: number, at: number) {
            calls.push({ method: "set", value: v, at });
          },
          linearRampToValueAtTime(v: number, at: number) {
            calls.push({ method: "linear", value: v, at });
          },
        },
        calls,
        connect(n: AnyNode) {
          return n;
        },
        disconnect() {},
      };
      gains.push(g);
      return g;
    },
    createStereoPanner() {
      const p: AnyNode = {
        pan: { value: 0 },
        connect(n: AnyNode) {
          return n;
        },
      };
      return p;
    },
  };
  return { ctx: ctx as BaseAudioContext, out: ctx.destination as AudioNode, oscs, gains };
}

function note(over: Partial<Note>): Note {
  return { t: 0, dur: 0.1, hz: 220, unverified: false, vol: 1, lowConf: false, pan: 0, lambda: 1, ...over };
}

describe("schedule", () => {
  it("nada kuat berbunyi penuh dengan timbre dasar", () => {
    const { ctx, out, oscs, gains } = fakeCtx();
    schedule(ctx, out, [note({})], 10);
    expect(oscs).toHaveLength(1);
    expect(oscs[0].type).toBe(SOUND.waveform);
    expect(oscs[0].frequency.value).toBe(220);
    const peak = gains[0].calls.find((c: Call) => c.method === "linear");
    expect(peak.value).toBeCloseTo(1, 6);
  });

  it("lowConf memakai timbre penanda tetapi pitch tetap dari data", () => {
    const { ctx, out, oscs, gains } = fakeCtx();
    schedule(ctx, out, [note({ hz: 330, vol: 0.5, lowConf: true })], 10);
    expect(oscs).toHaveLength(1);
    expect(oscs[0].type).toBe(SOUND.unverifiedWaveform);
    expect(oscs[0].frequency.value).toBe(330);
    const peak = gains[0].calls.find((c: Call) => c.method === "linear");
    expect(peak.value).toBeCloseTo(SOUND.unverifiedGain * 0.5, 6);
  });

  it("titik jenuh (unverified) memakai timbre penanda yang sama", () => {
    const { ctx, out, oscs, gains } = fakeCtx();
    schedule(ctx, out, [note({ hz: 330, unverified: true })], 10);
    expect(oscs).toHaveLength(1);
    expect(oscs[0].type).toBe(SOUND.unverifiedWaveform);
    expect(oscs[0].frequency.value).toBe(330);
    const peak = gains[0].calls.find((c: Call) => c.method === "linear");
    expect(peak.value).toBeCloseTo(SOUND.unverifiedGain, 6);
  });

  it("volume per nada mengalikan puncak tanpa mengubah pitch", () => {
    const { ctx, out, oscs, gains } = fakeCtx();
    schedule(ctx, out, [note({ hz: 440, vol: 0.25 })], 10);
    expect(oscs[0].frequency.value).toBe(440);
    const peak = gains[0].calls.find((c: Call) => c.method === "linear");
    expect(peak.value).toBeCloseTo(0.25, 6);
  });

  it("amplop selalu mulai dari nol dan kembali ke nol (tanpa klik)", () => {
    const { ctx, out, gains } = fakeCtx();
    schedule(ctx, out, [note({}), note({ t: 0.2, lowConf: true })], 10);
    for (const g of gains) {
      const calls = g.calls as Call[];
      expect(calls[0]).toMatchObject({ method: "set", value: 0 });
      expect(calls[calls.length - 1]).toMatchObject({ method: "linear", value: 0 });
    }
  });

  it("langkah tanpa data berbunyi tick, bukan nada diam", () => {
    const { ctx, out, oscs, gains } = fakeCtx();
    schedule(ctx, out, [note({ hz: null })], 10);
    expect(oscs).toHaveLength(1);
    expect(oscs[0].type).toBe("sine");
    expect(oscs[0].frequency.value).toBe(SOUND.gapTickHz);
    const peak = gains[0].calls.find((c: Call) => c.method === "linear");
    expect(peak.value).toBeCloseTo(SOUND.gapTickGain, 6);
  });

  it("tick dilewati bila gapTick mati", () => {
    const { ctx, out, oscs } = fakeCtx();
    schedule(ctx, out, [note({ hz: null })], 10, { ...SOUND, gapTick: false });
    expect(oscs).toHaveLength(0);
  });
});

describe("phrase", () => {
  it("memberi vol 1 dan lowConf false supaya suara lama tidak berubah", () => {
    const notes = phrase(
      [
        { lambda: 1, flux: 0.5, unverified: false, lowConf: false },
        { lambda: 2, flux: null, unverified: false, lowConf: false },
      ],
      1,
    );
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ vol: 1, lowConf: false });
    expect(notes[0].hz).toBeGreaterThan(0);
    expect(notes[1].hz).toBeNull();
  });
});

describe("sonifier", () => {
  it("frasa baru menghentikan semua sumber lama", () => {
    const f = fakeCtx();
    const RealAC = globalThis.AudioContext;
    globalThis.AudioContext = class {
      constructor() {
        return f.ctx;
      }
    } as unknown as typeof AudioContext;
    try {
      sonifier.play([[note({})]]);
      expect(f.oscs).toHaveLength(1);
      sonifier.play([[note({ hz: 330 })]]);
      // Sumber frasa pertama harus sudah dihentikan saat frasa kedua mulai.
      expect(f.oscs[0].stopCalls).toBeGreaterThan(0);
      expect(f.oscs).toHaveLength(2);
      sonifier.stop();
      expect(sonifier.busy).toBe(false);
    } finally {
      globalThis.AudioContext = RealAC;
      sonifier.stop();
    }
  });
});

function loadManifest(id: string): Manifest {
  const url = new URL(`../../../bundles/${id}/manifest.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf-8")) as Manifest;
}

describe("motionPhrase", () => {
  it("Barnard: nada akhir jelas lebih tinggi dari acuan, jeda seragam", () => {
    const notes = motionPhrase(loadManifest("barnard"));
    expect(notes).toHaveLength(3);
    expect(notes.every((n) => n.hz !== null)).toBe(true);
    expect(notes.every((n) => n.vol === 1 && !n.lowConf && !n.unverified)).toBe(true);
    const gaps = [notes[1].t - notes[0].t, notes[2].t - notes[1].t];
    expect(gaps[0]).toBeCloseTo(gaps[1], 9);
    expect(notes[0].hz).toBeCloseTo(motionNote(0, 0).hz, 9);
    expect(notes[2].hz! / notes[0].hz!).toBeGreaterThan(2);
  });

  it("RW Aurigae yang diam: semua nada sama dengan acuan", () => {
    const notes = motionPhrase(loadManifest("rwaur"));
    const ref = motionNote(0, 0);
    expect(notes).toHaveLength(3);
    for (const n of notes) {
      expect(n.hz).toBeCloseTo(ref.hz, 9);
      expect(n.pan).toBeCloseTo(0, 9);
    }
  });

  it("kunjungan tanpa pengukuran menjadi ketukan", () => {
    const m = {
      windows: [{ id: "w1" }, { id: "w2" }],
      motion: [
        { window: "w1", ra: 0, dec: 0, d_east_arcsec: 0, d_north_arcsec: 0, scatter_arcsec: 0.5, n: 10 },
      ],
    } as unknown as Manifest;
    const notes = motionPhrase(m);
    expect(notes[0].hz).not.toBeNull();
    expect(notes[1].hz).toBeNull();
  });

  it("objek tak-terlacak: semua kunjungan ketukan", () => {
    const m = {
      windows: [{ id: "w1" }, { id: "w2" }],
      motion: [
        { window: "w1", ra: 0, dec: 0, d_east_arcsec: 0, d_north_arcsec: 0, scatter_arcsec: 5, n: 10 },
        { window: "w2", ra: 0, dec: 0, d_east_arcsec: 1, d_north_arcsec: 1, scatter_arcsec: 5, n: 10 },
      ],
    } as unknown as Manifest;
    const notes = motionPhrase(m);
    expect(notes.every((n) => n.hz === null)).toBe(true);
  });
});

const D5 = { id: "D5", detector: 5, lambda_min: 3.82, lambda_max: 4.42 };

function bman(windows: string[]) {
  return { windows: windows.map((id) => ({ id })), bands: [D5], motion: [] } as unknown as Manifest;
}

function bpts(rows: [string, number, number, SpectrumPoint["flag"]][]): SpectrumPoint[] {
  return rows.map(([window, flux, err, flag], i) => ({
    window,
    lambda_um: 4.0 + i * 0.001,
    flux_jy: flux,
    flux_err_jy: err,
    snr: flux / err,
    flag,
  }));
}

function loadSpectrum(id: string): SpectrumPoint[] {
  const url = new URL(`../../../bundles/${id}/spectrum.json`, import.meta.url);
  return (JSON.parse(readFileSync(url, "utf-8")) as { points: SpectrumPoint[] }).points;
}

describe("brightnessPhrase", () => {
  it("selisih di bawah toleransi berbunyi sama dengan acuan", () => {
    const m = bman(["w1", "w2"]);
    const notes = brightnessPhrase(m, bpts([["w1", 1.0, 0.001, "ok"], ["w2", 1.005, 0.001, "ok"]]));
    expect(notes).toHaveLength(2);
    expect(notes[0].hz).toBeCloseTo(BRIGHTNESS.baseHz, 9);
    expect(notes[1].hz).toBeCloseTo(BRIGHTNESS.baseHz, 9);
    expect(notes.every((n) => n.vol === 1 && n.pan === 0)).toBe(true);
  });

  it("selisih di atas toleransi berbunyi beda, jeda seragam", () => {
    const m = bman(["w1", "w2", "w3"]);
    const notes = brightnessPhrase(
      m,
      bpts([["w1", 1.0, 0.001, "ok"], ["w2", 1.0, 0.001, "ok"], ["w3", 1.5, 0.001, "ok"]]),
    );
    expect(notes[0].hz).toBeCloseTo(BRIGHTNESS.baseHz, 9);
    expect(notes[2].hz!).toBeGreaterThan(BRIGHTNESS.baseHz);
    const gaps = [notes[1].t - notes[0].t, notes[2].t - notes[1].t];
    expect(gaps[0]).toBeCloseTo(gaps[1], 9);
  });

  it("kunjungan tanpa band menjadi ketukan; tanpa band pembanding semua ketukan", () => {
    const m = bman(["w1", "w2", "w3"]);
    const notes = brightnessPhrase(m, bpts([["w1", 1.0, 0.001, "ok"], ["w2", 1.2, 0.001, "ok"]]));
    expect(notes[0].hz).not.toBeNull();
    expect(notes[2].hz).toBeNull();
    const empty = brightnessPhrase(m, []);
    expect(empty.every((n) => n.hz === null)).toBe(true);
  });

  it("RW Aurigae: penurunan 4-5 mikron melewati toleransi lalu terdengar turun", () => {
    const m = loadManifest("rwaur");
    const a = brightnessAnalysis(m, loadSpectrum("rwaur"));
    expect(a.band?.id).toBe("D5");
    // w1 +20% dan w3 -40% dari acuan: jauh di atas batas 1%.
    const w3 = a.visits.find((v) => v.window === "w3")!;
    expect(w3.still).toBe(false);
    expect(w3.rel!).toBeLessThan(-0.3);
    const notes = brightnessPhrase(m, loadSpectrum("rwaur"));
    expect(notes[0].hz!).toBeGreaterThan(BRIGHTNESS.baseHz);
    expect(notes[2].hz!).toBeLessThan(BRIGHTNESS.baseHz);
    expect(notes.every((n) => n.unverified)).toBe(true);
  });

  it("Barnard yang stabil: semua kunjungan diam", () => {
    const m = loadManifest("barnard");
    const a = brightnessAnalysis(m, loadSpectrum("barnard"));
    expect(a.band?.id).toBe("D5");
    expect(a.visits.every((v) => v.still)).toBe(true);
    const notes = brightnessPhrase(m, loadSpectrum("barnard"));
    for (const n of notes) expect(n.hz).toBeCloseTo(BRIGHTNESS.baseHz, 9);
  });

  it("commonBand mendahulukan D5/D6 bila seri cakupan", () => {
    const m = loadManifest("barnard");
    expect(commonBand(m, loadSpectrum("barnard"))?.id).toBe("D5");
  });
});
