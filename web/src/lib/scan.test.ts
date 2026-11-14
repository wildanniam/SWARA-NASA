// Mode Pindai tanpa browser: ekstraksi puncak dari piksel sintetis dan
// pemetaan kolom menjadi nada (utara naik, terang keras).

import { describe, expect, it } from "vitest";
import { extractScanColumns } from "./scan";
import { SCAN } from "../sound/mapping";
import { scanPhrase } from "../sound/sonify";

function frame(w: number, h: number, fill: number): Uint8ClampedArray {
  return new Uint8ClampedArray(w * h).fill(fill);
}

describe("extractScanColumns", () => {
  it("sumber titik terang menjadi satu puncak keras di kolomnya", () => {
    const w = 12;
    const h = 12;
    const px = frame(w, h, 10);
    px[3 * w + 6] = 250;
    const { cols } = extractScanColumns(px, w, h, null);
    expect(cols).toHaveLength(6);
    const star = cols[3];
    expect(star.length).toBeGreaterThanOrEqual(1);
    expect(star[0].y).toBe(3);
    expect(star[0].v).toBeCloseTo(1, 6);
    expect(star[0].flagged).toBe(false);
  });

  it("tonjolan lebar dihitung satu puncak, bukan tiga", () => {
    const w = 12;
    const h = 12;
    const px = frame(w, h, 10);
    px[3 * w + 6] = 200;
    px[4 * w + 6] = 220;
    px[5 * w + 6] = 200;
    const { cols } = extractScanColumns(px, w, h, null);
    const near = cols[3].filter((p) => Math.abs(p.y - 4) < SCAN.minDist);
    expect(near).toHaveLength(1);
  });

  it("bingkai hitam total = sunyi (tanpa bagi-nol)", () => {
    const { cols } = extractScanColumns(frame(12, 12, 0), 12, 12, null);
    expect(cols.every((c) => c.length === 0)).toBe(true);
  });

  it("piksel yang ditandai masker membawa unverified", () => {
    const w = 12;
    const h = 12;
    const px = frame(w, h, 10);
    px[3 * w + 6] = 250;
    const mask = frame(w, h, 0);
    mask[3 * w + 6] = 255;
    const { cols } = extractScanColumns(px, w, h, mask);
    expect(cols[3][0].flagged).toBe(true);
  });
});

describe("scanPhrase", () => {
  it("utara tinggi, terang keras, kolom kosong dilewati", () => {
    const notes = scanPhrase(
      [[{ y: 0, v: 1, flagged: false }], [], [{ y: 11, v: 0.5, flagged: false }]],
      12,
    );
    expect(notes).toHaveLength(2);
    expect(notes[0].hz).toBeCloseTo(SCAN.baseHz * 8, 6);
    expect(notes[0].vol).toBeCloseTo(1, 6);
    expect(notes[1].hz).toBeCloseTo(SCAN.baseHz, 6);
    expect(notes[1].vol).toBeCloseTo(0.5, 6);
    expect(notes[1].t).toBeGreaterThan(notes[0].t);
  });

  it("puncak tengah berbunyi di tengah rentang", () => {
    const notes = scanPhrase([[{ y: 5, v: 1, flagged: true }]], 12);
    expect(notes[0].hz).toBeCloseTo(SCAN.baseHz * Math.pow(2, ((1 - 5 / 11) * SCAN.octaves)), 6);
    expect(notes[0].unverified).toBe(true);
  });
});
