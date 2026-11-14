// Bentuk bundle hasil pipeline. Kontraknya dijelaskan di pipeline/README.md.

import type { Spectrum } from "./spectrum";

export type TargetRef = {
  id: string;
  name: string;
  /** "custom" = koordinat yang dimasukkan pengguna; bundelnya dibuat API. */
  kind: "moving" | "variable" | "custom";
  ra: number;
  dec: number;
};

export type TimeWindow = {
  id: string;
  date_start: string;
  date_end: string;
  mjd_mid: number;
  n_exposures: number;
  main: boolean;
};

export type Band = { id: string; detector: number; lambda_min: number; lambda_max: number };

export type Frame = {
  window: string;
  band: string;
  image: string;
  mask: string;
  n_exposures: number;
  /** Skala regangan citra ini, MJy/sr; sama untuk semua kunjungan satu band. */
  knee_mjy_sr?: number;
  vmax_mjy_sr?: number;
  saturated_fraction: number;
  bad_fraction: number;
};

export type Motion = {
  window: string;
  ra: number;
  dec: number;
  d_east_arcsec: number;
  d_north_arcsec: number;
  scatter_arcsec: number;
  n: number;
};

/** Citra medan lebar di sekitar posisi; latar langit di viewer. */
export type Context = { image: string; fov_arcsec: number; size_px: number; band: string; n_exposures: number };

/** Riwayat WISE 2010-2024 di medan yang sama. Untuk dilihat, bukan diukur. */
export type WiseFrame = { id: string; image: string; mjd_mid: number; date_start: string; date_end: string };
export type Wise = {
  band: { id: string; label: string; lambda_um: number };
  pixel_arcsec: number;
  size_px: [number, number];
  /** Letak posisi bundle di citra WISE, piksel dari kiri atas (bilangan bulat = pusat piksel). */
  target_px: [number, number];
  frames: WiseFrame[];
  /** Citra sudah ditulis pipeline dengan aturan tampilan frame SPHEREx. Bundle lama
   *  belum; untuk itu viewer menyamakan nadanya sendiri saat melukis (tone.ts). */
  matched?: boolean;
  /** Skala regangan citra WISE yang sudah disamakan, satuan unWISE. */
  display?: { sky: number; knee: number; vmax: number; soften_arcsec: number };
};

export type Manifest = {
  id: string;
  name: string;
  ra: number;
  dec: number;
  fov_arcsec: number;
  frame_px: number;
  windows: TimeWindow[];
  bands: Band[];
  frames: Frame[];
  motion: Motion[];
  context?: Context | null;
  wise?: Wise | null;
  /** Pratinjau selagi bundle dibuat: hanya riwayat WISE dan citra medan lebar. */
  preview?: boolean;
  source: { n_exposures_used: number; collections: string[] };
};

// Preset adalah berkas statis; bundle koordinat bebas disajikan API dengan bentuk yang sama.
const base = (custom: boolean) => `${import.meta.env.BASE_URL}${custom ? "api/bundles" : "bundles"}`;

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const loadIndex = (signal?: AbortSignal) =>
  getJson<{ targets: TargetRef[] }>(`${base(false)}/index.json`, signal).then((d) => d.targets);

export const assetUrl = (targetId: string, custom: boolean, path: string) => `${base(custom)}/${targetId}/${path}`;

export const loadManifest = (id: string, custom: boolean, signal?: AbortSignal) =>
  getJson<Manifest>(assetUrl(id, custom, "manifest.json"), signal);

/** Pratinjau bundle yang masih dibuat; belum tentu ada, jadi kegagalan dianggap biasa. */
export const loadPreview = (id: string, signal?: AbortSignal) =>
  getJson<Manifest>(`${assetUrl(id, true, "preview.json")}?t=${Date.now()}`, signal);

export const loadSpectrum = (id: string, custom: boolean, signal?: AbortSignal) =>
  getJson<Spectrum>(assetUrl(id, custom, "spectrum.json"), signal);

export const findFrame = (m: Manifest, windowId: string, bandId: string) =>
  m.frames.find((f) => f.window === windowId && f.band === bandId);

/** Band awal: yang punya frame di paling banyak jendela, mendahulukan panjang
 *  gelombang panjang karena bintang terang paling sedikit jenuh di sana. */
export function defaultBand(m: Manifest): string {
  const count = (b: string) => m.frames.filter((f) => f.band === b).length;
  const order = ["D5", "D6", "D4", "D3", "D2", "D1"].filter((b) => count(b) > 0);
  const best = Math.max(...order.map(count));
  return order.find((b) => count(b) === best) ?? m.bands[0].id;
}

/** Pergeseran satu kunjungan terhadap kunjungan acuan. Dipakai teks dan suara,
 *  supaya keduanya selalu mengatakan hal yang sama. */
export type Shift =
  | { kind: "none" } // posisi benda ini tidak terukur stabil
  | { kind: "unmeasured" } // kunjungan ini tanpa pengukuran posisi
  | { kind: "reference" }
  | { kind: "still"; tolerance: number } // di dalam batas ketelitian
  | { kind: "moved"; east: number; north: number };

export function shiftAt(m: Manifest, windowId: string): Shift {
  const ref = referenceMotion(m);
  if (!ref) return { kind: "none" };
  const cur = m.motion.find((x) => x.window === windowId);
  if (!cur) return { kind: "unmeasured" };
  if (cur.window === ref.window) return { kind: "reference" };
  const tolerance = Math.max(1.5, 2 * Math.max(cur.scatter_arcsec, ref.scatter_arcsec));
  return Math.hypot(cur.d_east_arcsec, cur.d_north_arcsec) < tolerance
    ? { kind: "still", tolerance }
    : { kind: "moved", east: cur.d_east_arcsec, north: cur.d_north_arcsec };
}

/** Temuan utama untuk satu benda: pergeseran terbesar yang terukur, atau kenapa tidak ada. */
export type Finding =
  | { kind: "none" }
  | { kind: "still"; tolerance: number; visits: number }
  | { kind: "moved"; east: number; north: number; total: number; fromMjd: number; toMjd: number };

export function finding(m: Manifest): Finding {
  const ref = referenceMotion(m);
  const from = m.windows.find((w) => w.id === ref?.window);
  if (!ref || !from) return { kind: "none" };
  let best: Extract<Finding, { kind: "moved" }> | undefined;
  let tolerance = 0;
  let visits = 0;
  for (const w of m.windows) {
    const s = shiftAt(m, w.id);
    if (s.kind === "moved") {
      const total = Math.hypot(s.east, s.north);
      if (!best || total > best.total)
        best = { kind: "moved", east: s.east, north: s.north, total, fromMjd: from.mjd_mid, toMjd: w.mjd_mid };
    }
    if (s.kind === "still") tolerance = Math.max(tolerance, s.tolerance);
    if (s.kind !== "unmeasured") visits++;
  }
  return best ?? { kind: "still", tolerance: tolerance || 1.5, visits };
}

/** Posisi terukur tiap kunjungan dalam piksel frame, untuk jejak di lensa. */
export function trail(m: Manifest): { id: string; x: number; y: number }[] {
  if (!referenceMotion(m)) return [];
  const scale = m.frame_px / m.fov_arcsec;
  const c = m.frame_px / 2;
  const cos = Math.cos((m.dec * Math.PI) / 180);
  return m.motion.map((p) => ({
    id: p.window,
    x: c - (p.ra - m.ra) * 3600 * cos * scale,
    y: c - (p.dec - m.dec) * 3600 * scale,
  }));
}

/** Posisi acuan: posisi terukur di jendela pertama, bila pengukurannya stabil. */
export function referenceMotion(m: Manifest): Motion | undefined {
  const first = m.motion[0];
  const stable = m.motion.length > 0 && m.motion.every((x) => x.scatter_arcsec < 3);
  return stable ? first : undefined;
}
