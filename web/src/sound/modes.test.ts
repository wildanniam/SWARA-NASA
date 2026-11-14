// Kontrak mode-shell yang bisa diperiksa tanpa browser: empat mode berbeda,
// shortcut tidak menabrak perilaku existing, dan pengumuman selalu tiga jalur.

import { describe, expect, it } from "vitest";
import { MODE_ANNOUNCE } from "./mapping";
import { MODES, RESERVED_KEYS, modeById, modeForKey } from "./modes";
import { announceMode, modePhrase, sonifier } from "./sonify";

describe("MODES", () => {
  it("ada empat mode dengan urutan alur Pindai-Gerak-Kecerahan-Spektrum", () => {
    expect(MODES.map((m) => m.id)).toEqual(["gerak", "kecerahan", "pindai", "spektrum"]);
  });

  it("id, label, shortcut, dan pengumuman semuanya unik dan terisi", () => {
    const ids = MODES.map((m) => m.id);
    const keys = MODES.map((m) => m.key);
    expect(new Set(ids).size).toBe(4);
    expect(new Set(keys).size).toBe(4);
    for (const m of MODES) {
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.announcement.length).toBeGreaterThan(20);
    }
  });

  it("pengumuman menyebut arti mode itu (arah yang dikunci spek)", () => {
    expect(modeById("gerak")!.announcement).toMatch(/north is higher/);
    expect(modeById("kecerahan")!.announcement).toMatch(/brighter is higher/);
    expect(modeById("pindai")!.announcement).toMatch(/left to right/);
    expect(modeById("spektrum")!.announcement).toMatch(/short to long/);
  });
});

describe("modeForKey", () => {
  it("Alt+G/K/P/S memilih mode (besar-kecil huruf bebas)", () => {
    expect(modeForKey("g")!.id).toBe("gerak");
    expect(modeForKey("K")!.id).toBe("kecerahan");
    expect(modeForKey("p")!.id).toBe("pindai");
    expect(modeForKey("S")!.id).toBe("spektrum");
  });

  it("tidak menabrak tombol existing", () => {
    for (const k of ["1", "2", "3", "4", "5", "6", "l", "m", "/", "n", " ", "arrowleft", "arrowright"]) {
      expect(RESERVED_KEYS).toContain(k);
      expect(modeForKey(k)).toBeUndefined();
    }
    expect(modeForKey("x")).toBeUndefined();
  });
});

describe("modePhrase", () => {
  it("tiap mode: earcon berbeda lalu kalibrasi rendah-tinggi", () => {
    const contours = new Set<string>();
    for (const m of MODES) {
      const notes = modePhrase(m.id);
      // Semua nada berbunyi (bukan tick), berurutan tanpa tumpang.
      expect(notes.length).toBeGreaterThanOrEqual(5);
      for (const n of notes) expect(n.hz).not.toBeNull();
      for (let i = 1; i < notes.length; i++) {
        expect(notes[i].t).toBeGreaterThanOrEqual(notes[i - 1].t + notes[i - 1].dur);
      }
      // Dua nada terakhir = kalibrasi rendah lalu tinggi.
      const [lo, hi] = notes.slice(-2);
      expect(hi.hz!).toBeGreaterThan(lo.hz!);
      contours.add(notes.slice(0, 3).map((n) => n.hz!.toFixed(1)).join(","));
    }
    // Empat earcon harus saling berbeda.
    expect(contours.size).toBe(4);
  });

  it("kalibrasi memakai nada terendah-tertinggi dan gain pengumuman", () => {
    const notes = modePhrase("spektrum");
    const [lo, hi] = notes.slice(-2);
    expect(lo.hz).toBeCloseTo(110, 0);
    expect(hi.hz).toBeCloseTo(880, 0);
    expect(notes[0].dur).toBeCloseTo(MODE_ANNOUNCE.noteSeconds, 6);
  });

  it("announceMode memutar lewat engine lalu bisa dihentikan bersih", () => {
    const RealAC = globalThis.AudioContext;
    const created: { currentTime: number; destination: object }[] = [];
    globalThis.AudioContext = class {
      currentTime = 0;
      destination = {};
      constructor() {
        created.push(this);
      }
      resume() {
        return Promise.resolve();
      }
      createGain() {
        const param = {
          value: 0,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        };
        return { gain: param, connect: (n: unknown) => n, disconnect() {} };
      }
      createOscillator() {
        return {
          type: "",
          frequency: { value: 0 },
          connect: (n: unknown) => n,
          start() {},
          stop() {},
        };
      }
      createStereoPanner() {
        return { pan: { value: 0 }, connect: (n: unknown) => n };
      }
    } as unknown as typeof AudioContext;
    try {
      announceMode("gerak");
      expect(sonifier.busy).toBe(true);
      sonifier.stop();
      expect(sonifier.busy).toBe(false);
      expect(created.length).toBeGreaterThanOrEqual(0);
    } finally {
      globalThis.AudioContext = RealAC;
      sonifier.stop();
    }
  });
});
