// Uji render luring: schedule() dan Sonifier dijalankan dengan konteks audio
// palsu yang mencatat semua parameter, jadi tanpa browser pun gain, timbre,
// dan stop-bersih tiap nada bisa diverifikasi.

import { describe, expect, it } from "vitest";
import { SOUND } from "./mapping";
import { phrase, schedule, sonifier, type Note } from "./sonify";

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
        { lambda: 1, flux: 0.5, unverified: false },
        { lambda: 2, flux: null, unverified: false },
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
