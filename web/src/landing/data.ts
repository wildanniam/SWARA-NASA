// Isi landing page dihitung dari bundle yang sama dengan aplikasi: tidak ada angka atau
// citra yang ditulis tangan. Yang tidak terukur dikatakan terus terang, seperti di aplikasi.

import { BLENDED } from "../content";
import {
  assetUrl,
  defaultBand,
  findFrame,
  finding,
  loadGaia,
  loadIndex,
  loadManifest,
  loadSpectrum,
  type GaiaField,
  type Manifest,
  type TargetRef,
} from "../lib/bundle";
import { span } from "../lib/format";
import { paint, paintDifference, type Rect } from "../lib/paint";

// ---------- warna ----------

/** Peta warna landing page: bara yang sama dengan look Ember, sedikit lebih bercahaya di
 *  bagian redup supaya citra kecil tetap hidup. Urutan terang tidak berubah. */
const STOPS: [number, number, number, number][] = [
  [0, 2, 2, 5],
  [0.3, 70, 16, 6],
  [0.62, 205, 82, 24],
  [0.86, 255, 184, 92],
  [1, 255, 246, 226],
];

export const EMBER: Uint8ClampedArray = (() => {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let v = 0; v < 256; v++) {
    const t = Math.pow(v / 255, 0.62);
    let k = 0;
    while (k < STOPS.length - 2 && t > STOPS[k + 1][0]) k++;
    const f = Math.min(1, Math.max(0, (t - STOPS[k][0]) / (STOPS[k + 1][0] - STOPS[k][0])));
    for (let c = 0; c < 3; c++) lut[v * 3 + c] = STOPS[k][c + 1] + (STOPS[k + 1][c + 1] - STOPS[k][c + 1]) * f;
  }
  return lut;
})();

// ---------- pemuatan ----------

const manifests = new Map<string, Promise<Manifest>>();
export function manifestOf(id: string): Promise<Manifest> {
  let pending = manifests.get(id);
  if (!pending) {
    pending = loadManifest(id, false);
    manifests.set(id, pending);
    pending.catch(() => manifests.delete(id));
  }
  return pending;
}

const gaias = new Map<string, Promise<GaiaField | undefined>>();
export function gaiaOf(m: Manifest): Promise<GaiaField | undefined> {
  let pending = gaias.get(m.id);
  if (!pending) {
    pending = m.gaia ? loadGaia(m.id, false, m.gaia.file).catch(() => undefined) : Promise.resolve(undefined);
    gaias.set(m.id, pending);
  }
  return pending;
}

const images = new Map<string, Promise<HTMLImageElement>>();
export function imageOf(url: string): Promise<HTMLImageElement> {
  let pending = images.get(url);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`image: ${url}`));
      img.src = url;
    });
    images.set(url, pending);
    pending.catch(() => images.delete(url));
  }
  return pending;
}

// ---------- contoh ----------

export type Epithet = "The Wanderer" | "The Still One" | "The Riddle";

export type Example = {
  ref: TargetRef;
  manifest: Manifest;
  epithet: Epithet;
  /** Angka besar di panggung: "10.1″", "≈ 0″", atau "?" kalau tidak terukur. */
  big: string;
  /** Nilai untuk hitung naik, kalau angkanya memang terukur. */
  value?: number;
  /** Kalimat di bawah angka besar. */
  line: string;
  /** Ringkasan di daftar dan di penanda bola langit. */
  short: string;
  /** Kunjungan terakhir pada band bawaan: citra lensa di panggung. */
  image?: string;
  blended: boolean;
};

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

/** Arah pergeseran dalam kata: utara di atas, timur di kiri, seperti di langit. */
export function compass(east: number, north: number): string {
  const bearing = ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
  return COMPASS[Math.round(bearing / 45) % 8];
}

export function describe(ref: TargetRef, m: Manifest): Example {
  const f = finding(m);
  const band = defaultBand(m);
  const last = [...m.windows].reverse().find((w) => findFrame(m, w.id, band));
  const frame = last ? findFrame(m, last.id, band) : undefined;
  const base = { ref, manifest: m, image: frame ? assetUrl(ref.id, false, frame.image) : undefined };
  if (BLENDED[ref.id]) {
    return {
      ...base,
      epithet: "The Riddle",
      big: "?",
      line: "SPHEREx sees a background star here",
      short: "hidden behind a star",
      blended: true,
    };
  }
  if (f.kind === "moved") {
    const when = span(f.fromMjd, f.toMjd);
    return {
      ...base,
      epithet: "The Wanderer",
      big: `${f.total.toFixed(1)}″`,
      value: f.total,
      line: `${compass(f.east, f.north)} in ${when}`,
      short: `${f.total.toFixed(1)}″ in ${when}`,
      blended: false,
    };
  }
  if (f.kind === "still") {
    return {
      ...base,
      epithet: "The Still One",
      big: "≈ 0″",
      line: `no shift across ${f.visits} visits, within ${f.tolerance.toFixed(1)}″`,
      short: `no shift in ${f.visits} visits`,
      blended: false,
    };
  }
  // Posisinya tidak terukur stabil. Kalau citranya banyak jenuh, sebabnya terlalu terang.
  const saturated = Math.max(0, ...m.frames.map((x) => x.saturated_fraction));
  const bright = saturated > 0.02;
  return {
    ...base,
    epithet: "The Riddle",
    big: "?",
    line: bright ? "too bright for SPHEREx to track" : "SPHEREx could not track it",
    short: bright ? "too bright to track" : "not trackable",
    blended: false,
  };
}

export async function loadExamples(): Promise<Example[]> {
  const refs = await loadIndex();
  const ms = await Promise.all(refs.map((r) => manifestOf(r.id)));
  return refs.map((r, i) => describe(r, ms[i]));
}

const year = (mjd: number) => 2000 + (mjd - 51544.5) / 365.25;

/** Bintang Gaia terdekat dari posisi itu pada tahun itu, dan jaraknya dalam detik busur. */
function nearestGaia(field: GaiaField, ra: number, dec: number, at: number) {
  const cos = Math.cos((dec * Math.PI) / 180);
  let best: { star: GaiaField["stars"][number]; sep: number } | undefined;
  for (const star of field.stars) {
    const dt = at - field.epoch;
    const east = (star.ra - ra) * 3600 * cos + ((star.pmRa ?? 0) * dt) / 1000;
    const north = (star.dec - dec) * 3600 + ((star.pmDec ?? 0) * dt) / 1000;
    const sep = Math.hypot(east, north);
    if (!best || sep < best.sep) best = { star, sep };
  }
  return best;
}

/** Yang dikatakan katalog Gaia tentang benda itu, dalam satu kalimat; kosong kalau tidak ada
 *  yang bisa dibandingkan. */
export async function gaiaLine(ex: Example): Promise<string | undefined> {
  const m = ex.manifest;
  const field = await gaiaOf(m);
  if (!field || !m.windows.length) return undefined;
  const first = m.windows[0];
  const lastWin = m.windows[m.windows.length - 1];
  if (ex.blended) {
    // Posisi yang diharapkan dari benda itu sendiri, bukan sumber yang terukur di sana.
    const near = nearestGaia(field, m.ra, m.dec, year(first.mjd_mid));
    return near && near.sep > 3 ? "Not in Gaia DR3" : undefined;
  }
  const f = finding(m);
  if (f.kind === "none") return undefined;
  const ref = m.motion[0];
  const near = nearestGaia(field, ref?.ra ?? m.ra, ref?.dec ?? m.dec, year(first.mjd_mid));
  if (!near || near.sep > 3) return undefined;
  const pm = Math.hypot(near.star.pmRa ?? 0, near.star.pmDec ?? 0) / 1000;
  const years = f.kind === "moved" ? (f.toMjd - f.fromMjd) / 365.25 : (lastWin.mjd_mid - first.mjd_mid) / 365.25;
  return `Gaia predicts ${(pm * years).toFixed(1)}″`;
}

// ---------- kartu fitur ----------

export type BlinkFrame = { canvas: HTMLCanvasElement; year: number; label: string; spherex: boolean };
export type FeatureData = {
  blink: { stack: HTMLCanvasElement; frames: BlinkFrame[] };
  diff: { now: HTMLCanvasElement; diff: HTMLCanvasElement; nowLabel: string; thenLabel: string };
  spectrum: { bins: (number | null)[]; name: string };
  catalogue: { ours: number; gaia?: number; when: string; name: string };
};

const SIZE = 520;
const canvasOf = () => {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  return c;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthYear = (mjd: number) => {
  const d = new Date((mjd - 40587) * 86400000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** Tingkat abu satu bagian citra, diperbesar ke SIZE x SIZE. */
function grayOf(img: HTMLImageElement, view: Rect): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  const k = SIZE / view.w;
  ctx.drawImage(img, -view.x * k, -view.y * k, img.naturalWidth * k, img.naturalHeight * k);
  const d = ctx.getImageData(0, 0, SIZE, SIZE).data;
  const out = new Uint8ClampedArray(SIZE * SIZE);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4];
  return out;
}

function colorize(gray: Uint8ClampedArray): HTMLCanvasElement {
  const c = canvasOf();
  const ctx = c.getContext("2d")!;
  const out = ctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i] * 3;
    out.data[i * 4] = EMBER[v];
    out.data[i * 4 + 1] = EMBER[v + 1];
    out.data[i * 4 + 2] = EMBER[v + 2];
    out.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

/** Bahan keenam kartu fitur, dari Barnard's Star (gerak) dan Epsilon Indi B (cahaya). */
export async function loadFeatureData(): Promise<FeatureData> {
  const [bm, em, spectrum] = await Promise.all([manifestOf("barnard"), manifestOf("epsindb"), loadSpectrum("epsindb", false)]);
  const wise = bm.wise!;
  // 150 detik busur di sekitar posisi: medan yang sama untuk WISE dan SPHEREx.
  const HALF = 150;
  const wiseView: Rect = {
    x: wise.target_px[0] + 0.5 - HALF / wise.pixel_arcsec,
    y: wise.target_px[1] + 0.5 - HALF / wise.pixel_arcsec,
    w: (2 * HALF) / wise.pixel_arcsec,
    h: (2 * HALF) / wise.pixel_arcsec,
  };
  const scale = bm.frame_px / bm.fov_arcsec;
  const c = bm.frame_px / 2;
  const sphxView: Rect = { x: c - HALF * scale, y: c - HALF * scale, w: 2 * HALF * scale, h: 2 * HALF * scale };

  const wiseImgs = await Promise.all(wise.frames.map((f) => imageOf(assetUrl("barnard", false, f.image))));
  const band = defaultBand(bm);
  const visits = bm.windows.flatMap((w) => {
    const fr = findFrame(bm, w.id, band);
    return fr ? [{ w, url: assetUrl("barnard", false, fr.image) }] : [];
  });
  const visitImgs = await Promise.all(visits.map((v) => imageOf(v.url)));

  // Tiap lukisan memakan beberapa milidetik; di antaranya browser diberi napas supaya
  // halaman tetap mulus saat digulir.
  const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  const frames: BlinkFrame[] = [];
  for (let i = 0; i < wise.frames.length; i++) {
    const f = wise.frames[i];
    const canvas = canvasOf();
    paint(canvas, wiseImgs[i], EMBER, SIZE, undefined, wiseView);
    frames.push({ canvas, year: year(f.mjd_mid), label: `${monthYear(f.mjd_mid)} · WISE`, spherex: false });
    await breathe();
  }
  for (let i = 0; i < visits.length; i++) {
    const v = visits[i];
    const canvas = canvasOf();
    paint(canvas, visitImgs[i], EMBER, SIZE, undefined, sphxView);
    frames.push({ canvas, year: year(v.w.mjd_mid), label: `${monthYear(v.w.mjd_mid)} · SPHEREx`, spherex: true });
    await breathe();
  }
  // Semua epoch WISE ditumpuk: tiap piksel mengambil yang paling terang. Yang diam tetap
  // titik; yang bergerak meninggalkan jejak.
  const stackGray = new Uint8ClampedArray(SIZE * SIZE);
  for (const img of wiseImgs) {
    const g = grayOf(img, wiseView);
    for (let i = 0; i < g.length; i++) if (g[i] > stackGray[i]) stackGray[i] = g[i];
    await breathe();
  }

  // Citra selisih: epoch WISE terakhir dikurangi yang pertama, dengan cara yang sama dengan lensa.
  const firstImg = wiseImgs[0];
  const lastImg = wiseImgs[wiseImgs.length - 1];
  const now = canvasOf();
  paint(now, lastImg, EMBER, SIZE, undefined, wiseView);
  const diff = canvasOf();
  paintDifference(diff, lastImg, firstImg, SIZE, wiseView, wise.display ? { knee: wise.display.knee, vmax: wise.display.vmax } : undefined);

  // Spektrum Epsilon Indi B: 64 langkah dari 0,75 sampai 5 mikron, median titik bersih semua kunjungan.
  const STEPS = 64;
  const cells: number[][] = Array.from({ length: STEPS }, () => []);
  for (const p of spectrum.points) {
    if (p.flag !== "ok") continue;
    cells[Math.min(STEPS - 1, Math.max(0, Math.floor(((p.lambda_um - 0.75) / 4.25) * STEPS)))].push(p.flux_jy);
  }
  const bins = cells.map((cell) => {
    if (!cell.length) return null;
    const s = cell.sort((a, b) => a - b);
    return s[s.length >> 1];
  });

  // Gerak terukur Barnard's Star dan yang diramalkan Gaia untuk rentang yang sama.
  const f = finding(bm);
  let ours = 0;
  let when = "";
  let gaia: number | undefined;
  if (f.kind === "moved") {
    ours = f.total;
    when = span(f.fromMjd, f.toMjd);
    const field = await gaiaOf(bm);
    const ref = bm.motion[0];
    const near = field ? nearestGaia(field, ref.ra, ref.dec, year(bm.windows[0].mjd_mid)) : undefined;
    if (near && near.sep < 3) gaia = (Math.hypot(near.star.pmRa ?? 0, near.star.pmDec ?? 0) / 1000) * ((f.toMjd - f.fromMjd) / 365.25);
  }

  return {
    blink: { stack: colorize(stackGray), frames },
    diff: {
      now,
      diff,
      nowLabel: monthYear(wise.frames[wise.frames.length - 1].mjd_mid),
      thenLabel: monthYear(wise.frames[0].mjd_mid),
    },
    spectrum: { bins, name: em.name },
    catalogue: { ours, gaia, when, name: bm.name },
  };
}
