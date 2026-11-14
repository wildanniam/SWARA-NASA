// Bacaan tiga kartu: semua yang ditulis dan digambar di kartu dihitung di sini dari
// bundle dan peta seluruh langit. Tidak ada angka yang ditulis tangan.

import { constellationAt, type Atlas } from "./allsky";
import { finding, referenceMotion, type Manifest } from "./bundle";
import { slices, STEPS, type Slice } from "./card";
import { shiftWords, span } from "./format";
import type { SpectrumPoint } from "./spectrum";

type V3 = [number, number, number];
const RAD = Math.PI / 180;

const unit = (ra: number, dec: number): V3 => {
  const c = Math.cos(dec * RAD);
  return [c * Math.cos(ra * RAD), c * Math.sin(ra * RAD), Math.sin(dec * RAD)];
};
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ---------- I. Tempatnya ----------

export type PlaceFacts = {
  abbr: string;
  constellation: string;
  /** Lintang galaktik, derajat. */
  b: number;
  plane: string;
  visible: string;
};

export function placeFacts(atlas: Atlas, ra: number, dec: number): PlaceFacts {
  const abbr = constellationAt(atlas, ra, dec);
  const constellation = atlas.constellations.names[abbr] ?? abbr;
  const b = Math.asin(Math.max(-1, Math.min(1, dot(atlas.projection.icrs_to_galactic[2] as V3, unit(ra, dec))))) / RAD;
  const off = Math.round(Math.abs(b));
  const plane =
    off < 10
      ? "In the band of the Milky Way, looking along our galaxy's disc."
      : `${off}° ${b > 0 ? "north" : "south"} of the Milky Way's band${off >= 60 ? ", looking out of our galaxy's disc" : ""}.`;
  // Benda di deklinasi d tidak pernah terbit di lintang yang lebih dari 90 - |d| di belahan seberangnya.
  const limit = Math.round(90 - Math.abs(dec));
  const visible =
    Math.abs(dec) < 20
      ? "Near the sky's equator: it rises for almost everyone on Earth."
      : dec > 0
        ? `Northern sky: it never rises south of about ${limit}° S.`
        : `Southern sky: it never rises north of about ${limit}° N.`;
  return { abbr, constellation, b, plane, visible };
}

/** Petak langit di sekitar satu titik: utara di atas, timur di kiri, proyeksi ortografik.
 *  `scale` adalah piksel per satuan sinus sudut dari pusat. */
export type Patch = { c: V3; e: V3; n: V3; scale: number; w: number; h: number };

export function patchAt(ra: number, dec: number, w: number, h: number, widthDeg: number): Patch {
  const c = unit(ra, dec);
  const e: V3 = [-Math.sin(ra * RAD), Math.cos(ra * RAD), 0];
  const n: V3 = [c[1] * e[2] - c[2] * e[1], c[2] * e[0] - c[0] * e[2], c[0] * e[1] - c[1] * e[0]];
  return { c, e, n, scale: w / 2 / Math.sin((widthDeg / 2) * RAD), w, h };
}

/** RA dan Dec ke piksel petak; undefined kalau di belakang langit yang terlihat. */
export function patchPoint(p: Patch, ra: number, dec: number): { x: number; y: number } | undefined {
  const v = unit(ra, dec);
  if (dot(v, p.c) <= 0.05) return undefined;
  return { x: p.w / 2 - p.scale * dot(v, p.e), y: p.h / 2 - p.scale * dot(v, p.n) };
}

type Gray = { data: Uint8ClampedArray; width: number; height: number };

/** Lukis petak langit dari peta seluruh langit yang asli: tiap piksel petak diubah ke
 *  arah di langit, lalu ke piksel peta Hammer (rumus yang sama dengan allsky.toMap). */
export function paintPatch(canvas: HTMLCanvasElement, gray: Gray, atlas: Atlas, p: Patch, lut: Uint8ClampedArray) {
  canvas.width = p.w;
  canvas.height = p.h;
  const m = atlas.projection.icrs_to_galactic;
  const out = new ImageData(p.w, p.h);
  const px = out.data;
  const { data, width, height } = gray;
  for (let y = 0; y < p.h; y++) {
    const Y = (p.h / 2 - (y + 0.5)) / p.scale;
    for (let x = 0; x < p.w; x++) {
      const X = (p.w / 2 - (x + 0.5)) / p.scale;
      const r2 = X * X + Y * Y;
      const i = (y * p.w + x) * 4;
      px[i + 3] = 255;
      let value = 0;
      if (r2 < 1) {
        const Z = Math.sqrt(1 - r2);
        const vx = X * p.e[0] + Y * p.n[0] + Z * p.c[0];
        const vy = X * p.e[1] + Y * p.n[1] + Z * p.c[1];
        const vz = X * p.e[2] + Y * p.n[2] + Z * p.c[2];
        const gx = m[0][0] * vx + m[0][1] * vy + m[0][2] * vz;
        const gy = m[1][0] * vx + m[1][1] * vy + m[1][2] * vz;
        const gz = m[2][0] * vx + m[2][1] * vy + m[2][2] * vz;
        const lam = -Math.atan2(gy, gx);
        const cb = Math.sqrt(Math.max(0, 1 - gz * gz));
        const k = Math.sqrt(1 + cb * Math.cos(lam / 2));
        const mx = ((cb * Math.sin(lam / 2)) / k + 1) / 2 * width - 0.5;
        const my = (1 - gz / k) / 2 * height - 0.5;
        const x0 = Math.max(0, Math.min(width - 2, Math.floor(mx)));
        const y0 = Math.max(0, Math.min(height - 2, Math.floor(my)));
        const fx = Math.max(0, Math.min(1, mx - x0));
        const fy = Math.max(0, Math.min(1, my - y0));
        const at = y0 * width + x0;
        value =
          (data[at] * (1 - fx) + data[at + 1] * fx) * (1 - fy) +
          (data[at + width] * (1 - fx) + data[at + width + 1] * fx) * fy;
      }
      const v = Math.round(value) * 3;
      px[i] = lut[v];
      px[i + 1] = lut[v + 1];
      px[i + 2] = lut[v + 2];
    }
  }
  canvas.getContext("2d")!.putImageData(out, 0, 0);
}

// ---------- II. Jalannya ----------

/** Lebar rata-rata Bulan purnama, detik busur. */
const MOON_ARCSEC = 1865;
/** Satu piksel SPHEREx, detik busur. */
export const SPHEREX_PIXEL_ARCSEC = 6.15;

export type PathFacts = {
  /** Yang diukur SPHEREx, satu kalimat. */
  measured: string;
  /** Kalimat kedua: berapa lama untuk melintasi lebar Bulan, kalau ia bergerak. */
  moon?: string;
  /** Posisi tiap kunjungan terhadap kunjungan pertama, detik busur; kosong kalau tidak terukur. */
  dots: { east: number; north: number }[];
};

export function pathFacts(m: Manifest, blended?: string, cataloguePm?: number | null): PathFacts {
  const catalogue = cataloguePm != null && cataloguePm >= 0.1 ? ` The catalogue says ${cataloguePm.toFixed(1)}″ a year.` : "";
  if (m.preview) return { measured: "SPHEREx is still reading this place.", dots: [] };
  if (blended) return { measured: `${blended}.`, dots: [] };
  const ref = referenceMotion(m);
  const dots = ref ? m.motion.map((p) => ({ east: p.d_east_arcsec - ref.d_east_arcsec, north: p.d_north_arcsec - ref.d_north_arcsec })) : [];
  const f = finding(m);
  if (f.kind === "moved") {
    const years = (f.toMjd - f.fromMjd) / 365.25;
    const crossing = MOON_ARCSEC / (f.total / years);
    const rounded = crossing < 1000 ? Math.round(crossing / 10) * 10 : Math.round(crossing / 100) * 100;
    return {
      measured: `SPHEREx measured ${shiftWords(f.east, f.north)} in ${span(f.fromMjd, f.toMjd)}.${catalogue}`,
      moon: `At this pace it would take about ${rounded.toLocaleString("en-US")} years to cross the width of the full Moon.`,
      dots,
    };
  }
  if (f.kind === "still")
    return { measured: `SPHEREx measured no shift across ${f.visits} visits, within ${f.tolerance.toFixed(1)}″.${catalogue}`, dots };
  return { measured: `SPHEREx could not track a position here.${catalogue}`, dots: [] };
}

// ---------- III. Cahayanya ----------

export type LightFacts =
  | { readable: true; slices: Slice[]; top: number; clean: number; peakUm: number }
  | { readable: false; why: string; counts: string };

export function lightFacts(points: SpectrumPoint[] | undefined, pending: boolean, blended?: string, preview?: boolean): LightFacts {
  if (!points) {
    return {
      readable: false,
      why: pending || preview ? "Its light is still being read." : "The spectrum could not be loaded.",
      counts: "",
    };
  }
  const clean = points.filter((p) => p.flag === "ok").length;
  const counts = `${clean} clean of ${points.length} measurements.`;
  if (blended) return { readable: false, why: "Its light could not be told apart from a background star in this data.", counts };
  const all = slices(points);
  const filled = all.filter((s) => s.flux !== null);
  if (filled.length < STEPS / 3) {
    // Lebih dari separuh titiknya ditandai jenuh oleh SPHEREx: bendanya terlalu terang.
    const saturated = points.filter((p) => p.flag === "saturated" || p.flag === "saturated_core").length;
    const why =
      saturated > points.length / 2
        ? "Too bright for SPHEREx: most of its measurements are saturated, so there is no clean spectrum."
        : "Too few clean measurements for a spectrum here.";
    return { readable: false, why, counts };
  }
  const values = filled.map((s) => s.flux as number).sort((a, b) => a - b);
  const top = Math.max(values[Math.min(values.length - 1, Math.floor(values.length * 0.97))], 1e-12);
  const peak = filled.reduce((a, b) => ((b.flux as number) > (a.flux as number) ? b : a));
  return { readable: true, slices: all, top, clean, peakUm: peak.lambda };
}
