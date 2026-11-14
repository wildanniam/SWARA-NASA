// Uji frasa melodi gerak tanpa browser.
// Jalan via `npm run test:scan` dari folder web/.
// Juga ter-typecheck oleh `tsc --noEmit`.

import { strict as assert } from "node:assert";
import { MOTION } from "../sound/mapping";
import { motionNote, motionPhrase, schedule } from "../sound/sonify";

// 1. Utara naik, selatan turun, acuan di tengah.
{
  const ref = motionNote(0, 0);
  const up = motionNote(0, 5);
  const down = motionNote(0, -3);
  assert.equal(ref.hz, MOTION.baseHz);
  assert.ok(up.hz > ref.hz);
  assert.ok(down.hz < ref.hz);
  console.log("ok: utara naik");
}

// 2. Timur kiri (pan negatif), barat kanan.
{
  assert.equal(motionNote(10, 0).pan, -1);
  assert.equal(motionNote(-10, 0).pan, 1);
  console.log("ok: timur kiri");
}

// 3. Frasa: urutan waktu kelipatan langkah, tick untuk tanpa pengukuran.
{
  const steps = [motionNote(0, 0), null, motionNote(0, 9.9)];
  const notes = motionPhrase(steps);
  assert.equal(notes.length, 3);
  assert.deepEqual(
    notes.map((n) => n.t),
    [0, MOTION.melodyStep, MOTION.melodyStep * 2],
  );
  assert.ok(notes[0].hz !== null && notes[2].hz !== null && notes[2].hz! > notes[0].hz!);
  assert.equal(notes[1].hz, null);
  assert.ok(notes.every((n) => n.dur === MOTION.seconds));
  console.log("ok: frasa melodi");
}

// 4. Terjadwal bersih lewat engine existing (tick + stop).
{
  const notes = motionPhrase([motionNote(0, 0), null]);
  let stopped = 0;
  let scheduled = 0;
  const ctx = {
    currentTime: 0,
    createOscillator() {
      let done = false;
      return {
        type: "",
        frequency: { value: 0 },
        connect(node: unknown) {
          return node;
        },
        start() {},
        stop(when?: number) {
          // schedule() memanggil stop(waktu) untuk menjadwalkan; stop()
          // tanpa argumen berarti dihentikan manual.
          if (when === undefined && !done) {
            done = true;
            stopped++;
          } else {
            scheduled++;
          }
        },
      };
    },
    createGain() {
      const g = {
        value: 0,
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {},
      };
      return { gain: g, connect(node: unknown) { return node; } };
    },
    createStereoPanner() {
      return { pan: { value: 0 }, connect(node: unknown) { return node; } };
    },
  };
  const sources = schedule(ctx as never, {} as never, notes, 0, MOTION);
  assert.equal(sources.length, 2);
  assert.equal(scheduled, 2);
  for (const s of sources) s.stop();
  assert.equal(stopped, 2);
  console.log("ok: engine melodi");
}

console.log("semua uji melodi lolos");
