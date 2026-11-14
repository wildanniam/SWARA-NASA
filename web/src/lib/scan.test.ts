// Uji ekstraksi sapuan + penjadwalan engine tanpa browser.
// Jalan: `npm run test:scan` dari folder web/.
// Juga ter-typecheck oleh `tsc --noEmit`.

import { strict as assert } from "node:assert";
import { SCAN, SOUND } from "../sound/mapping";
import { schedule } from "../sound/sonify";
import { scanGrid, scanPhrase } from "./scan";

const SIZE = 64;
const COLS = 8;

function blank(): { gray: Uint8ClampedArray; mask: Uint8ClampedArray } {
  // Latar bertekstur tipis seperti derau display nyata: tanpa ini, satu titik
  // terang akan menggelembungkan sigma dan ambangnya sendiri.
  const gray = new Uint8ClampedArray(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) gray[y * SIZE + x] = 10 + ((x * 5 + y * 11) % 3);
  }
  return { gray, mask: new Uint8ClampedArray(SIZE * SIZE) };
}

function dot(gray: Uint8ClampedArray, cx: number, cy: number, value = 200, r = 2): void {
  for (let y = Math.max(0, cy - r); y <= Math.min(SIZE - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(SIZE - 1, cx + r); x++) gray[y * SIZE + x] = value;
  }
}

const s = { ...SCAN, columns: COLS };

// 1. Satu titik -> tepat satu puncak di kolomnya.
{
  const { gray, mask } = blank();
  dot(gray, 20, 20);
  const grid = scanGrid(gray, SIZE, mask, s);
  assert.equal(grid.columns[2].peaks.length, 1);
  assert.ok(Math.abs(grid.columns[2].peaks[0].row01 - 20 / (SIZE - 1)) < 0.05);
  assert.ok(grid.columns.every((c, i) => (i === 2 ? true : c.peaks.length === 0)));
  console.log("ok: satu titik");
}

// 2. Tiga titik satu kolom -> tiga nada serentak.
{
  const { gray, mask } = blank();
  dot(gray, 36, 10);
  dot(gray, 36, 32);
  dot(gray, 36, 54);
  const grid = scanGrid(gray, SIZE, mask, s);
  assert.equal(grid.columns[4].peaks.length, 3);
  const rows = grid.columns[4].peaks.map((p) => p.row01).sort();
  assert.ok(rows[0] < 0.3 && rows[1] > 0.3 && rows[1] < 0.7 && rows[2] > 0.7);
  console.log("ok: tiga titik");
}

// 3. Kosong -> semua kolom tanpa puncak (tick).
{
  const { gray, mask } = blank();
  const grid = scanGrid(gray, SIZE, mask, s);
  assert.ok(grid.columns.every((c) => c.peaks.length === 0));
  const notes = scanPhrase(grid, s);
  assert.equal(notes.length, COLS + 1);
  assert.ok(notes.filter((n) => n.hz !== s.earconHz).every((n) => n.hz === null));
  console.log("ok: kosong");
}

// 4. Berflag -> timbre penanda, pitch tetap dari posisi.
{
  const { gray, mask } = blank();
  dot(gray, 12, 40);
  dot(mask, 12, 40, 255, 1);
  const grid = scanGrid(gray, SIZE, mask, s);
  assert.equal(grid.columns[1].peaks.length, 1);
  assert.equal(grid.columns[1].peaks[0].flagged, true);
  console.log("ok: berflag");
}

// 5. Frasa: waktu monoton per kolom, earcon di kolom tengah.
{
  const { gray, mask } = blank();
  dot(gray, 4, 8);
  const grid = scanGrid(gray, SIZE, mask, s);
  const notes = scanPhrase(grid, s);
  const times = notes.map((n) => n.t);
  assert.ok(times.every((t, i) => i === 0 || t >= times[i - 1]));
  assert.equal(times[times.length - 1], (COLS - 1) * s.colSeconds);
  const earcon = notes.filter((n) => n.hz === s.earconHz);
  assert.equal(earcon.length, 1);
  assert.equal(earcon[0].t, Math.floor(COLS / 2) * s.colSeconds);
  console.log("ok: frasa + earcon");
}

// 6. Engine: tick/flag/vol dijadwalkan benar, stop bersih.
{
  const { gray, mask } = blank();
  dot(gray, 20, 20);
  dot(gray, 52, 48);
  dot(mask, 52, 48, 255, 1);
  const grid = scanGrid(gray, SIZE, mask, s);
  const notes = scanPhrase(grid, s);

  type Rec = { kind: string; type: string; freq: number; peak: number; stopped: boolean };
  const recs: Rec[] = [];
  const mkGain = (rec: Rec) => ({
    value: 0,
    setValueAtTime(v: number) {
      rec.peak = Math.max(rec.peak, v);
    },
    linearRampToValueAtTime(v: number) {
      rec.peak = Math.max(rec.peak, v);
    },
    exponentialRampToValueAtTime() {},
  });
  const ctx = {
    currentTime: 0,
    createOscillator() {
      const rec: Rec = { kind: "osc", type: "", freq: 0, peak: 0, stopped: false };
      recs.push(rec);
      return {
        set type(v: string) {
          rec.type = v;
        },
        frequency: {
          set value(v: number) {
            rec.freq = v;
          },
        },
        connect(node: unknown) {
          return node;
        },
        start() {},
        stop() {
          rec.stopped = true;
        },
      };
    },
    createGain() {
      const rec: Rec = { kind: "gain", type: "gain", freq: 0, peak: 0, stopped: false };
      recs.push(rec);
      return {
        gain: mkGain(rec),
        connect(node: unknown) {
          return node;
        },
      };
    },
    createStereoPanner() {
      return { pan: { value: 0 }, connect(node: unknown) { return node; } };
    },
  };
  const sources = schedule(ctx as never, {} as never, notes, 0, s);
  assert.equal(sources.length, notes.length);
  const oscs = recs.filter((r) => r.kind === "osc");
  const gains = recs.filter((r) => r.kind === "gain");
  assert.equal(oscs.length, notes.length);
  const tick = oscs.find((r) => r.freq === s.gapTickHz);
  assert.ok(tick, "kolom kosong memakai tick");
  const flaggedOsc = oscs.find((r) => r.type === "sawtooth");
  assert.ok(flaggedOsc, "kolom berflag memakai sawtooth");
  const flaggedGain = gains[oscs.indexOf(flaggedOsc)];
  const dataNote = notes.find((n) => n.hz !== null && n.hz !== s.earconHz && !n.unverified)!;
  const dataGain = gains[notes.indexOf(dataNote)];
  assert.ok(Math.abs(dataGain.peak - (dataNote.vol ?? 1)) < 1e-9, "volume = terang ternormalisasi");
  assert.ok(
    Math.abs(flaggedGain.peak - (flaggedOsc && (notes[oscs.indexOf(flaggedOsc)].vol ?? 1)) * s.unverifiedGain) < 1e-9,
    "flag menimpa timbre+gain tanpa mengubah pitch",
  );
  for (const src of sources) src.stop();
  assert.ok(
    oscs.every((r) => r.stopped),
    "stop bersih tanpa menumpuk",
  );
  console.log("ok: engine");
}

// 7. Rasa existing tak tersentuh; default SCAN sesuai plan.
{
  assert.equal(SCAN.columns, 32);
  assert.equal(SCAN.maxNotes, 5);
  assert.equal(SOUND.steps, 48);
  console.log("ok: default rasa");
}

console.log("semua uji sapuan lolos");
