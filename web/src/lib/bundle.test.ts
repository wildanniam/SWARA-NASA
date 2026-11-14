// Kunjungan dari bundle baru boleh hanya memiliki sebagian band citra.

import { strict as assert } from "node:assert";
import { framesForWindow, readyFrameForWindow } from "./visitFrames";

const manifest = {
  frames: [
    { window: "visit-1", band: "D2" },
    { window: "visit-3", band: "D6" },
    { window: "visit-1", band: "D5" },
  ],
};

assert.deepEqual(framesForWindow(manifest.frames, "visit-1").map((frame) => frame.band), ["D2", "D5"]);
assert.deepEqual(framesForWindow(manifest.frames, "visit-2"), []);
assert.equal(readyFrameForWindow(manifest.frames, "visit-1", "D2", (frame) => frame.band === "D5")?.band, "D5");
assert.equal(readyFrameForWindow(manifest.frames, "visit-1", "D2", () => true)?.band, "D2");
assert.equal(readyFrameForWindow(manifest.frames, "visit-2", "D2", () => true), undefined);
console.log("ok: frame visit memakai band yang memang tersedia");
