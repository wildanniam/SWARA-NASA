// Uji kelayakan spektrum per visit dan frasa dengan cakupan data yang tidak seragam.
// Jalan via `npm run test:scan` dari folder web/.

import { strict as assert } from "node:assert";
import { MOTION, SOUND } from "../sound/mapping";
import { motionNote, phrase } from "../sound/sonify";
import { assessVisit, binVisit, playableVisits, type SpectrumPoint } from "./spectrum";

function pointsFor(window: string, count: number, snr: number, flag: SpectrumPoint["flag"] = "ok"): SpectrumPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    window,
    lambda_um: 0.75 + ((i + 0.5) / count) * (5 - 0.75),
    flux_jy: i + 1,
    flux_err_jy: 0.1,
    snr,
    flag,
  }));
}

const points = [
  ...pointsFor("visit-good", 9, 8),
  ...pointsFor("visit-faint", 16, 1.5),
  ...pointsFor("visit-sparse", 7, 20),
  ...pointsFor("visit-saturated", 12, 0.5, "saturated_core"),
];

assert.equal(assessVisit(points.filter((p) => p.window === "visit-good")), "ok");
assert.equal(assessVisit(points.filter((p) => p.window === "visit-faint")), "faint");
assert.equal(assessVisit(points.filter((p) => p.window === "visit-sparse")), "empty");
assert.equal(assessVisit(points.filter((p) => p.window === "visit-saturated")), "saturated");
assert.deepEqual(
  playableVisits(["visit-good", "visit-faint", "visit-sparse", "missing-visit"], points),
  ["visit-good"],
);
console.log("ok: visit spektrum dinilai secara independen");

// Sebaran wavelength yang jarang tetap menghasilkan 48 slot dan menandai celah sebagai tick.
{
  const sparse = pointsFor("new-target-visit-3", 8, 9).filter((_, i) => i % 2 === 0);
  const bins = binVisit(sparse, "new-target-visit-3", SOUND.steps);
  const notes = phrase(bins, 8);
  assert.equal(bins.length, SOUND.steps);
  assert.ok(notes.some((n) => n.hz === null));
  assert.ok(notes.some((n) => n.hz !== null));
  assert.ok(notes.every((n) => n.t >= 0 && n.t < SOUND.visitSeconds));
  console.log("ok: cakupan wavelength baru menghasilkan nada dan tick sesuai data");
}

// Batas tetap gerak: nilai ekstrem mencapai batas skala tanpa mengubah kalibrasi antarobjek.
{
  const northLimit = MOTION.maxSteps * MOTION.arcsecPerStep;
  const eastLimit = MOTION.panArcsec;
  assert.equal(motionNote(0, northLimit * 5).hz, motionNote(0, northLimit).hz);
  assert.equal(motionNote(0, -northLimit * 5).hz, motionNote(0, -northLimit).hz);
  assert.equal(motionNote(eastLimit * 5, 0).pan, -1);
  assert.equal(motionNote(-eastLimit * 5, 0).pan, 1);
  console.log("ok: gerak di luar rentang mencapai batas nada dan pan");
}
