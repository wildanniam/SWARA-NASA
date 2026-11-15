// Jam dan lapisan suara gabungan: ketiga sumber memakai slot visit yang sama.

import { strict as assert } from "node:assert";
import { combineSoundLayers, VISIT_PAUSE_SECONDS, VISIT_SLOT_SECONDS } from "./combinedSound";
import { INSTRUMENTS, type InstrumentId } from "../sound/mapping";
import { scheduleMixed, type Note } from "../sound/sonify";

const note = (voice: InstrumentId, hz: number, t = 0): Note => ({
  t,
  dur: 0.2,
  hz,
  unverified: false,
  pan: 0,
  lambda: 0,
  voice,
});

{
  const plan = combineSoundLayers(
    ["w1", "w2", "w3", "w4"],
    new Map([["w1", [note("scan", 300, 0.34)]], ["w2", [note("scan", 310)]]]),
    new Map([["w1", [note("spectrum", 440, 0.1)]], ["w3", [note("spectrum", 450)]]]),
    new Map([["w1", note("motion", 660)], ["w2", note("motion", 670)]]),
  );
  assert.deepEqual(plan.activeVoices, ["scan", "spectrum", "motion"]);
  assert.deepEqual(plan.visits.map((v) => v.id), ["w1", "w2", "w3"]);
  assert.deepEqual(plan.visits.map((v) => v.start), [0, VISIT_SLOT_SECONDS + VISIT_PAUSE_SECONDS, 2 * (VISIT_SLOT_SECONDS + VISIT_PAUSE_SECONDS)]);
  assert.equal(plan.visits[0].layers.scan && plan.visits[0].layers.spectrum && plan.visits[0].layers.motion, true);
  assert.deepEqual(plan.skipped, [
    { id: "w2", layers: ["spectrum"] },
    { id: "w3", layers: ["scan", "motion"] },
    { id: "w4", layers: ["scan", "spectrum", "motion"] },
  ]);
  assert.equal(plan.total, 2 * (VISIT_SLOT_SECONDS + VISIT_PAUSE_SECONDS) + VISIT_SLOT_SECONDS);
  assert.ok(plan.notes.some((n) => n.voice === "scan" && n.t === 0.34));
  assert.ok(plan.notes.some((n) => n.voice === "spectrum" && n.t === 0.1));
  assert.ok(plan.notes.some((n) => n.voice === "motion" && n.t === 0));
  console.log("ok: gabungan memakai satu jam dan melewati lapisan tanpa data");
}

// Scheduler memilih timbre tiap sumber, dan gain mengikuti equal-power mix.
{
  type Osc = { type: string; hz: number; peak: number; stopped: boolean };
  const oscs: Osc[] = [];
  const ctx = {
    createOscillator() {
      const o: Osc = { type: "", hz: 0, peak: 0, stopped: false };
      oscs.push(o);
      return {
        set type(v: string) { o.type = v; },
        frequency: { set value(v: number) { o.hz = v; } },
        connect(node: unknown) { return node; },
        start() {},
        stop() { o.stopped = true; },
      };
    },
    createGain() {
      const o = oscs[oscs.length - 1];
      return {
        gain: {
          setValueAtTime(v: number) { o.peak = Math.max(o.peak, v); },
          linearRampToValueAtTime(v: number) { o.peak = Math.max(o.peak, v); },
          exponentialRampToValueAtTime(v: number) { o.peak = Math.max(o.peak, v); },
        },
        connect(node: unknown) { return node; },
      };
    },
    createStereoPanner() { return { pan: { value: 0 }, connect(node: unknown) { return node; } }; },
  };
  const notes = [note("spectrum", 440), note("scan", 330), note("motion", 660)];
  const sources = scheduleMixed(ctx as never, {} as never, notes, 0.5, ["spectrum", "scan", "motion"]);
  // Tiap nada: satu osilator dasar plus parsial instrumennya; spektrum menambah dua harmoni kehangatan.
  const expected = (["spectrum", "scan", "motion"] as const).reduce((n, v) => n + 1 + INSTRUMENTS[v].partials.length, 0) + 2;
  assert.equal(oscs.length, expected);
  assert.ok(oscs.some((o) => o.type === INSTRUMENTS.spectrum.waveform && o.hz === 440));
  assert.ok(oscs.some((o) => o.type === INSTRUMENTS.scan.waveform && o.hz === 330));
  assert.ok(oscs.some((o) => o.type === INSTRUMENTS.motion.waveform && o.hz === 660));
  assert.ok(oscs.every((o) => o.peak > 0));
  for (const source of sources) source.stop();
  assert.ok(oscs.every((o) => o.stopped));
  console.log("ok: timbre per lapisan, mix otomatis, dan stop bersih");
}

console.log("semua uji gabungan lolos");
