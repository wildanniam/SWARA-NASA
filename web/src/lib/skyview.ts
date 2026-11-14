// Pandangan peta seluruh langit: pusat dan zoom, dan proyeksinya ke layar.
//
// Proyeksinya selalu Hammer-Aitoff, tetapi kerangkanya ikut pandangan. Pada zoom 1
// kerangkanya galaktik dengan pusat galaksi di tengah (peta pembuka). Makin dalam,
// kerangka berpusat di titik yang dilihat dan "atas"-nya berputar dari utara galaktik
// ke utara langit. Di dekat pusatnya Hammer hampir tanpa distorsi, jadi pada zoom dalam
// hasilnya pandangan teleskop biasa: utara di atas, timur di kiri, seperti lensa.
//
// Perender WebGL (skygl.ts) memakai rumus yang sama di shader-nya.

import type { Atlas } from "./allsky";

export type V3 = [number, number, number];
export type View = { ra: number; dec: number; zoom: number };
/** Kerangka satu pandangan: baris matriks = sumbu pandangan dalam ICRS, dan ukuran peta di layar. */
export type Frame = { m: number[]; zoom: number; w: number; h: number };

const RAD = Math.PI / 180;
const SQRT2 = Math.SQRT2;
/** Lebar seluruh langit di proyeksi ini, derajat: lebar medan = ini dibagi zoom. */
export const SKY_SPAN_DEG = (4 * SQRT2) / RAD;
/** Zoom terdalam: medan sekitar 1,8 derajat, sekitar 5 detik busur per piksel layar. */
export const MAX_ZOOM = 180;

export const unit = (ra: number, dec: number): V3 => {
  const c = Math.cos(dec * RAD);
  return [c * Math.cos(ra * RAD), c * Math.sin(ra * RAD), Math.sin(dec * RAD)];
};

export const toRaDec = (v: V3) => ({
  ra: ((Math.atan2(v[1], v[0]) / RAD) % 360 + 360) % 360,
  dec: Math.asin(Math.max(-1, Math.min(1, v[2]))) / RAD,
});

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: V3): V3 => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};
export const angleBetween = (a: V3, b: V3) => Math.atan2(Math.hypot(...cross(a, b)), dot(a, b));

/** Putar `v` dengan putaran terpendek yang membawa `a` ke `b`, dikali `gain`. */
function carry(v: V3, a: V3, b: V3, gain = 1): V3 {
  const axis = cross(a, b);
  const s = Math.hypot(axis[0], axis[1], axis[2]);
  if (s < 1e-12) return v;
  const angle = Math.atan2(s, dot(a, b)) * gain;
  const k: V3 = [axis[0] / s, axis[1] / s, axis[2] / s];
  const c = Math.cos(angle);
  const sn = Math.sin(angle);
  const kv = cross(k, v);
  const kd = dot(k, v) * (1 - c);
  return normalize([v[0] * c + kv[0] * sn + k[0] * kd, v[1] * c + kv[1] * sn + k[1] * kd, v[2] * c + kv[2] * sn + k[2] * kd]);
}

/** Titik di busur lingkaran besar dari `a` ke `b`; t = 0 di a, 1 di b. */
export function along(a: V3, b: V3, t: number): V3 {
  return carry(a, a, b, t);
}

const smooth = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

/** Seberapa jauh "atas" sudah berputar ke utara langit: 0 pada peta pembuka, 1 pada zoom dalam. */
export const turn = (zoom: number) => smooth((Math.log2(zoom) - Math.log2(1.5)) / (Math.log2(5) - Math.log2(1.5)));

const galacticCentre = (atlas: Atlas): V3 => atlas.projection.icrs_to_galactic[0] as V3;
const galacticNorth = (atlas: Atlas): V3 => atlas.projection.icrs_to_galactic[2] as V3;

/** Pandangan pembuka: seluruh langit, pusat galaksi di tengah. */
export function homeView(atlas: Atlas): View {
  return { ...toRaDec(galacticCentre(atlas)), zoom: 1 };
}

/** Zoom dijepit, dan pusat ditahan dekat pusat galaksi selama peta masih hampir utuh:
 *  pada zoom 1 petanya harus persis peta pembuka. */
export function clampView(atlas: Atlas, view: View, maxZoom = MAX_ZOOM): View {
  const zoom = Math.max(1, Math.min(maxZoom, view.zoom));
  const home = galacticCentre(atlas);
  const c = unit(view.ra, view.dec);
  const reach = Math.PI * smooth((zoom - 1) / 0.8);
  const away = angleBetween(home, c);
  if (away <= reach) return { ra: view.ra, dec: view.dec, zoom };
  return { ...toRaDec(along(home, c, reach / away)), zoom };
}

export function frameOf(atlas: Atlas, view: View, w: number, h: number): Frame {
  const x = unit(view.ra, view.dec);
  const t = turn(view.zoom);
  const g = galacticNorth(atlas);
  let up: V3 = [g[0] * (1 - t), g[1] * (1 - t), g[2] * (1 - t) + t];
  let z: V3 = [up[0] - dot(up, x) * x[0], up[1] - dot(up, x) * x[1], up[2] - dot(up, x) * x[2]];
  if (Math.hypot(z[0], z[1], z[2]) < 1e-6) {
    // Tepat di kutub: "atas" tidak tertentu, pakai arah lain yang tegak lurus.
    up = Math.abs(x[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    z = [up[0] - dot(up, x) * x[0], up[1] - dot(up, x) * x[1], up[2] - dot(up, x) * x[2]];
  }
  z = normalize(z);
  const y = cross(z, x);
  return { m: [...x, ...y, ...z], zoom: view.zoom, w, h };
}

/** Arah di langit ke piksel peta (asal di kiri atas kotak peta). */
export function project(f: Frame, v: V3): { x: number; y: number } {
  const m = f.m;
  const vx = m[0] * v[0] + m[1] * v[1] + m[2] * v[2];
  const vy = m[3] * v[0] + m[4] * v[1] + m[5] * v[2];
  const vz = m[6] * v[0] + m[7] * v[1] + m[8] * v[2];
  const lam = -Math.atan2(vy, vx);
  const lat = Math.asin(Math.max(-1, Math.min(1, vz)));
  const k = Math.sqrt(1 + Math.cos(lat) * Math.cos(lam / 2));
  const X = (Math.cos(lat) * Math.sin(lam / 2)) / k; // -1..1
  const Y = Math.sin(lat) / k;
  return { x: (f.w / 2) * (1 + X * f.zoom), y: (f.h / 2) * (1 - Y * f.zoom) };
}

/** Piksel peta ke arah di langit; undefined di luar elips langit. */
export function unproject(f: Frame, px: number, py: number): V3 | undefined {
  const X = ((px / (f.w / 2) - 1) / f.zoom) * 2 * SQRT2;
  const Y = ((1 - py / (f.h / 2)) / f.zoom) * SQRT2;
  if (X * X / 8 + Y * Y / 2 > 1) return undefined;
  const z = Math.sqrt(Math.max(0, 1 - (X / 4) ** 2 - (Y / 2) ** 2));
  const lon = -2 * Math.atan2(z * X, 2 * (2 * z * z - 1));
  const lat = Math.asin(Math.max(-1, Math.min(1, z * Y)));
  const v: V3 = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  const m = f.m;
  return [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
}

/** Pandangan dengan zoom `zoom` yang menaruh arah `s` di piksel (px, py): dipakai untuk
 *  zoom ke arah kursor dan untuk menyeret. Pusat digeser berulang sampai cocok. */
export function anchor(atlas: Atlas, zoom: number, from: View, s: V3, px: number, py: number, w: number, h: number, maxZoom = MAX_ZOOM): View {
  let view = clampView(atlas, { ra: from.ra, dec: from.dec, zoom }, maxZoom);
  for (let i = 0; i < 24; i++) {
    const f = frameOf(atlas, view, w, h);
    const here = unproject(f, px, py);
    if (!here) break;
    if (angleBetween(here, s) < 2e-8) break;
    const next = clampView(atlas, { ...toRaDec(carry(unit(view.ra, view.dec), here, s)), zoom: view.zoom }, maxZoom);
    if (Math.abs(next.ra - view.ra) < 1e-9 && Math.abs(next.dec - view.dec) < 1e-9) break;
    view = next;
  }
  return view;
}

/** Lebar medan yang tampil, derajat. */
export const fieldDeg = (zoom: number) => SKY_SPAN_DEG / zoom;

/** "Whole sky", "62°", "4.2°" */
export function fieldLabel(zoom: number): string {
  if (zoom < 1.05) return "";
  const d = fieldDeg(zoom);
  return d >= 10 ? `${Math.round(d)}°` : `${d.toFixed(1)}°`;
}
