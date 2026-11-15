// Julukan dan angka terukur satu tempat, dalam bentuk pendek. Dipakai cuplikan penanda,
// daftar Go to, dan landing page, supaya ketiganya menyebut hal yang sama dengan kata yang sama.

import { BLENDED } from "../content";
import { finding, type Manifest } from "./bundle";
import { span } from "./format";

export type Epithet = "The Wanderer" | "The Still One" | "The Riddle";

export type Verdict = {
  epithet: Epithet;
  /** Angka besar: "10.1″", "≈ 0″", atau "?" kalau tidak terukur. */
  big: string;
  /** Keterangan di samping angka besar: "north in 12 months". */
  line: string;
  /** Satu baris ringkas untuk daftar: "10.1″ in 12 months". */
  short: string;
};

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

/** Arah pergeseran dalam kata: utara di atas, timur di kiri, seperti di langit. */
export function compass(east: number, north: number): string {
  const bearing = ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
  return COMPASS[Math.round(bearing / 45) % 8];
}

export function verdict(m: Manifest, id: string, custom: boolean): Verdict {
  // Tercampur bintang latar: angka yang terukur di sana bukan milik benda ini.
  if (!custom && BLENDED[id]) return { epithet: "The Riddle", big: "?", line: "behind a background star", short: "hidden behind a star" };
  const f = finding(m);
  if (f.kind === "moved") {
    const when = span(f.fromMjd, f.toMjd);
    return { epithet: "The Wanderer", big: `${f.total.toFixed(1)}″`, line: `${compass(f.east, f.north)} in ${when}`, short: `${f.total.toFixed(1)}″ in ${when}` };
  }
  if (f.kind === "still") return { epithet: "The Still One", big: "≈ 0″", line: `no shift in ${f.visits} visits`, short: `no shift in ${f.visits} visits` };
  const bright = Math.max(0, ...m.frames.map((x) => x.saturated_fraction)) > 0.02;
  return { epithet: "The Riddle", big: "?", line: bright ? "too bright to track" : "not trackable", short: bright ? "too bright to track" : "not trackable" };
}
