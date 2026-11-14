// Binning jujur: lembah sempit yang terhapus median ditandai lowConf tanpa
// mengubah pitch (median), plus data nyata Epsilon Indi B.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { binVisit, stepIndexAt, type SpectrumPoint } from "./spectrum";

function pt(window: string, lambda: number, flux: number, snr: number, flag: SpectrumPoint["flag"] = "ok"): SpectrumPoint {
  return { window, lambda_um: lambda, flux_jy: flux, flux_err_jy: flux / snr, snr, flag };
}

describe("binVisit lowConf", () => {
  it("lembah dalam dan sempit ditandai, pitch tetap median", () => {
    const bins = binVisit([pt("w1", 0.76, 1.0, 20), pt("w1", 0.8, 0.5, 20)], "w1", 48);
    expect(bins[0].flux).toBeCloseTo(0.75, 9);
    expect(bins[0].lowConf).toBe(true);
  });

  it("selisih dangkal bukan lembah", () => {
    const bins = binVisit([pt("w1", 0.76, 1.0, 20), pt("w1", 0.8, 0.9, 20)], "w1", 48);
    expect(bins[0].lowConf).toBe(false);
  });

  it("lembah tak signifikan (SNR rendah) diabaikan", () => {
    const bins = binVisit([pt("w1", 0.76, 1.0, 20), pt("w1", 0.8, 0.2, 2)], "w1", 48);
    expect(bins[0].lowConf).toBe(false);
  });

  it("satu titik tidak bisa menyembunyikan lembah", () => {
    const bins = binVisit([pt("w1", 0.76, 1.0, 20)], "w1", 48);
    expect(bins[0].lowConf).toBe(false);
    expect(bins).toHaveLength(48);
  });

  it("Epsilon Indi B: sedikit bin bertanda, 48 langkah utuh", () => {
    const url = new URL(`../../../bundles/epsindb/spectrum.json`, import.meta.url);
    const points = (JSON.parse(readFileSync(url, "utf-8")) as { points: SpectrumPoint[] }).points;
    let marked = 0;
    for (const w of ["w1", "w2", "w3", "w4"]) {
      const bins = binVisit(points, w, 48);
      expect(bins).toHaveLength(48);
      marked += bins.filter((b) => b.lowConf).length;
    }
    expect(marked).toBeGreaterThan(0);
    expect(marked).toBeLessThanOrEqual(12);
  });
});

describe("stepIndexAt", () => {
  it("memetakan pecahan frasa ke langkah nada", () => {
    expect(stepIndexAt(0, 48)).toBe(0);
    expect(stepIndexAt(0.5, 48)).toBe(24);
    expect(stepIndexAt(0.999, 48)).toBe(47);
    expect(stepIndexAt(1, 48)).toBe(47);
    expect(stepIndexAt(-0.1, 48)).toBe(0);
  });
});
