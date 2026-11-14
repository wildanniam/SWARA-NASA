// Bentuk bundle hasil pipeline. Kontraknya dijelaskan di pipeline/README.md.

export type TargetRef = {
  id: string;
  name: string;
  kind: "moving" | "variable";
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
  source: { n_exposures_used: number; collections: string[] };
};

const BASE = `${import.meta.env.BASE_URL}bundles`;

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, { signal });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const loadIndex = (signal?: AbortSignal) =>
  getJson<{ targets: TargetRef[] }>("index.json", signal).then((d) => d.targets);

export const loadManifest = (id: string, signal?: AbortSignal) =>
  getJson<Manifest>(`${id}/manifest.json`, signal);

export const assetUrl = (targetId: string, path: string) => `${BASE}/${targetId}/${path}`;

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

/** Posisi acuan: posisi terukur di jendela pertama, bila pengukurannya stabil. */
export function referenceMotion(m: Manifest): Motion | undefined {
  const first = m.motion[0];
  const stable = m.motion.length > 0 && m.motion.every((x) => x.scatter_arcsec < 3);
  return stable ? first : undefined;
}
