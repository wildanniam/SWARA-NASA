// Peta seluruh langit: bentuk `bundles/allsky/manifest.json` (dibuat `skychange allsky`,
// kontraknya di pipeline/README.md), proyeksinya, dan pembacaan koordinat.
//
// Peta dasarnya Hammer-Aitoff dalam koordinat galaktik: Bima Sakti mendatar, pusat
// galaksi di tengah, bujur naik ke kiri. `toMap` memakai rumus yang sama dengan
// pipeline, dengan matriks ICRS ke galaktik dari manifest. Pandangan yang bisa
// diperbesar dan digeser ada di skyview.ts.

export type SkyFrame = {
  band: string;
  /** Indeks frame di kubus HiPS; satu saluran di tengah band. */
  frame: number;
  lambda_um: number;
  /** Rentang saluran band ini, untuk pemilih panjang gelombang. */
  band_min_um: number;
  band_max_um: number;
  image: string;
  /** Versi separuh lebar untuk layar kecil. */
  small: string;
};

export type Atlas = {
  source: {
    title: string;
    url: string;
    release?: string;
    mjd_start: number;
    mjd_end: number;
    pixel_arcmin: number;
    credit: string;
  };
  projection: {
    name: "hammer";
    frame: "galactic";
    width: number;
    height: number;
    icrs_to_galactic: number[][];
  };
  default_band: string;
  frames: SkyFrame[];
  features: { name: string; ra: number; dec: number }[];
  constellations: {
    source: string;
    names: Record<string, string>;
    labels: Record<string, [number, number]>;
    lines: Record<string, [number, number][][]>;
    grid: { step_deg: number; ra0_deg: number; dec0_deg: number; abbr: string[]; rows: number[][] };
  };
};

const BASE = `${import.meta.env.BASE_URL}bundles/allsky`;
export const atlasUrl = (file: string) => `${BASE}/${file}`;

let pending: Promise<Atlas> | undefined;
/** Manifest dimuat sekali per halaman; dipakai pembuka dan pratinjau di "Go to". */
export function loadAtlas(): Promise<Atlas> {
  pending ??= fetch(atlasUrl("manifest.json")).then((res) => {
    if (!res.ok) throw new Error(`allsky manifest: HTTP ${res.status}`);
    return res.json() as Promise<Atlas>;
  });
  pending.catch(() => (pending = undefined));
  return pending;
}

const RAD = Math.PI / 180;
const SQRT2 = Math.SQRT2;

/** Titik di peta, dalam piksel peta (0..width, 0..height). */
export type MapPoint = { x: number; y: number };

/** RA dan Dec (derajat) ke piksel peta. */
export function toMap(atlas: Atlas, ra: number, dec: number): MapPoint {
  const m = atlas.projection.icrs_to_galactic;
  const cd = Math.cos(dec * RAD);
  const v = [cd * Math.cos(ra * RAD), cd * Math.sin(ra * RAD), Math.sin(dec * RAD)];
  const g = m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
  const l = Math.atan2(g[1], g[0]); // -pi..pi
  const b = Math.asin(Math.max(-1, Math.min(1, g[2])));
  const lam = -l; // bujur naik ke kiri
  const k = Math.sqrt(1 + Math.cos(b) * Math.cos(lam / 2));
  const X = (2 * SQRT2 * Math.cos(b) * Math.sin(lam / 2)) / k;
  const Y = (SQRT2 * Math.sin(b)) / k;
  const { width, height } = atlas.projection;
  return { x: ((X / (2 * SQRT2) + 1) / 2) * width, y: ((1 - Y / SQRT2) / 2) * height };
}

const decoded = new WeakMap<Atlas, Uint8Array>();

/** Singkatan IAU rasi di posisi itu, dari kisi batas resmi yang dibuat pipeline. */
export function constellationAt(atlas: Atlas, ra: number, dec: number): string {
  const grid = atlas.constellations.grid;
  const cols = Math.round(360 / grid.step_deg);
  let cells = decoded.get(atlas);
  if (!cells) {
    cells = new Uint8Array(grid.rows.length * cols);
    grid.rows.forEach((runs, r) => {
      let c = 0;
      for (let i = 0; i < runs.length; i += 2) {
        cells!.fill(runs[i], r * cols + c, r * cols + c + runs[i + 1]);
        c += runs[i + 1];
      }
    });
    decoded.set(atlas, cells);
  }
  const row = Math.max(0, Math.min(grid.rows.length - 1, Math.round((dec - grid.dec0_deg) / grid.step_deg)));
  const col = Math.floor((((ra - grid.ra0_deg) % 360) + 360) % 360 / grid.step_deg) % cols;
  return grid.abbr[cells[row * cols + col]];
}

/** "5h 35m 17s" */
export function raHms(ra: number): string {
  const total = Math.round((((ra % 360) + 360) % 360) / 15 * 3600) % 86400;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

/** "−5° 23′ 28″" */
export function decDms(dec: number): string {
  const total = Math.round(Math.abs(dec) * 3600);
  const d = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${dec < 0 ? "−" : "+"}${d}° ${String(m).padStart(2, "0")}′ ${String(s).padStart(2, "0")}″`;
}

const TOKEN = /[+-]?(?:\d+\.?\d*|\.\d+)/g;

export type Reading = { ra: number; dec: number } | { error: string };

/** Pratinjau "dibaca sebagai" untuk kotak cari. Hanya bentuk yang dibaca server dengan
 *  cara yang sama: dua angka (derajat), atau enam angka (RA dalam jam kecuali ditulis
 *  dengan d atau °, Dec dalam derajat) dengan spasi, titik dua, atau huruf h m s dan
 *  d m s. Selain itu tidak ada pratinjau, dan server yang memutuskan (bisa juga nama). */
export function readCoordinates(text: string): Reading | undefined {
  const s = text.trim().replace(/−/g, "-");
  if (!/^[\d\s+\-.:,hmsd°′″'"]+$/i.test(s)) return undefined;
  const tokens = [...s.matchAll(TOKEN)];
  const nums = tokens.map((t) => Number(t[0]));
  let ra: number;
  let dec: number;
  if (tokens.length === 2 && /^[+-]?[\d.]+[\s,]+[+-]?[\d.]+$/.test(s)) {
    [ra, dec] = nums;
  } else if (tokens.length === 6) {
    if ([1, 2, 4, 5].some((i) => /^[+-]/.test(tokens[i][0]) || nums[i] >= 60) || nums[0] < 0) return undefined;
    const raPart = s.slice(0, tokens[3].index);
    const raScale = /[d°]/i.test(raPart) ? 1 : 15;
    ra = (nums[0] + nums[1] / 60 + nums[2] / 3600) * raScale;
    const sign = tokens[3][0].startsWith("-") ? -1 : 1;
    dec = sign * (Math.abs(nums[3]) + nums[4] / 60 + nums[5] / 3600);
  } else return undefined;
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || ra < 0 || ra > 360 || dec < -90 || dec > 90)
    return { error: "RA must be 0 to 360 degrees and Dec −90 to +90 degrees." };
  return { ra, dec };
}

/** Satu isian koordinat: angka yang terbaca (derajat), kosong, atau alasan kenapa tidak terbaca. */
export type FieldReading = { value: number } | { error: string } | undefined;

function sexagesimal(text: string): { parts: number[]; negative: boolean } | undefined {
  const s = text.trim().replace(/−/g, "-");
  if (!s) return undefined;
  if (!/^[\d\s+\-.:hmsd°′″'"]+$/i.test(s)) return { parts: [], negative: false };
  const tokens = [...s.matchAll(/\d+\.?\d*|\.\d+/g)].map((t) => Number(t[0]));
  return { parts: tokens, negative: /^\s*-/.test(s) };
}

/** Isian RA: satu angka dibaca derajat; dua atau tiga angka, atau yang ditulis dengan
 *  h, dibaca jam, menit, detik (kecuali ditulis dengan d atau °). */
export function readRa(text: string): FieldReading {
  const r = sexagesimal(text);
  if (!r) return undefined;
  const { parts } = r;
  if (!parts.length || parts.length > 3 || r.negative) return { error: "RA should look like 269.4463 or 17h 57m 48s." };
  if (parts.slice(1).some((v) => v >= 60)) return { error: "Minutes and seconds of RA must be below 60." };
  const hours = (parts.length > 1 || /h/i.test(text)) && !/[d°]/i.test(text);
  const value = (parts[0] + (parts[1] ?? 0) / 60 + (parts[2] ?? 0) / 3600) * (hours ? 15 : 1);
  if (value < 0 || value > 360) return { error: hours ? "RA runs from 0 to 24 hours." : "RA runs from 0 to 360 degrees." };
  return { value };
}

/** Isian Dec: derajat, atau derajat, menit busur, detik busur, dengan tanda. */
export function readDec(text: string): FieldReading {
  const r = sexagesimal(text);
  if (!r) return undefined;
  const { parts } = r;
  if (!parts.length || parts.length > 3 || /h/i.test(text)) return { error: "Dec should look like +4.7682 or +04° 46′ 06″." };
  if (parts.slice(1).some((v) => v >= 60)) return { error: "Arcminutes and arcseconds of Dec must be below 60." };
  const value = (r.negative ? -1 : 1) * (parts[0] + (parts[1] ?? 0) / 60 + (parts[2] ?? 0) / 3600);
  if (value < -90 || value > 90) return { error: "Dec runs from −90 to +90 degrees." };
  return { value };
}
