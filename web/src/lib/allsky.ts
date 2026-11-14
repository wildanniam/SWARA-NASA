// Peta seluruh langit: bentuk `bundles/allsky/manifest.json` (dibuat `skychange allsky`,
// kontraknya di pipeline/README.md), proyeksinya, dan pembacaan koordinat.
//
// Petanya Hammer-Aitoff dalam koordinat galaktik: Bima Sakti mendatar, pusat galaksi di
// tengah, bujur naik ke kiri. Rumus di sini sama dengan yang dipakai pipeline untuk
// melukis peta, dan matriks ICRS ke galaktik dibaca dari manifest, jadi penanda dan
// bacaan koordinat jatuh di piksel yang sama dengan bintangnya.

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

/** Piksel peta ke RA dan Dec (derajat); undefined di luar elips. */
export function fromMap(atlas: Atlas, x: number, y: number): { ra: number; dec: number } | undefined {
  const { width, height } = atlas.projection;
  const X = ((x / width) * 2 - 1) * 2 * SQRT2;
  const Y = (1 - (y / height) * 2) * SQRT2;
  if ((X / (2 * SQRT2)) ** 2 + (Y / SQRT2) ** 2 > 1) return undefined;
  const z = Math.sqrt(Math.max(0, 1 - (X / 4) ** 2 - (Y / 2) ** 2));
  const lam = 2 * Math.atan2(z * X, 2 * (2 * z * z - 1));
  const b = Math.asin(Math.max(-1, Math.min(1, z * Y)));
  const l = -lam;
  const g = [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
  const m = atlas.projection.icrs_to_galactic;
  // Matriks putar: kebalikannya adalah transposnya.
  const v = [0, 1, 2].map((i) => m[0][i] * g[0] + m[1][i] * g[1] + m[2][i] * g[2]);
  const ra = ((Math.atan2(v[1], v[0]) / RAD) % 360 + 360) % 360;
  const dec = Math.asin(Math.max(-1, Math.min(1, v[2]))) / RAD;
  return { ra, dec };
}

/** Apakah piksel peta ada di dalam elips langit. */
export function insideMap(atlas: Atlas, x: number, y: number): boolean {
  const { width, height } = atlas.projection;
  const u = (x / width) * 2 - 1;
  const v = 1 - (y / height) * 2;
  return u * u + v * v <= 1;
}

function unit(ra: number, dec: number): [number, number, number] {
  const cd = Math.cos(dec * RAD);
  return [cd * Math.cos(ra * RAD), cd * Math.sin(ra * RAD), Math.sin(dec * RAD)];
}

/** Garis di langit (titik RA/Dec berurutan) menjadi atribut `d` SVG di ruang piksel peta.
 *  Tiap ruas mengikuti lingkaran besar, dan garis diputus di tepi peta. */
export function skyPath(atlas: Atlas, points: [number, number][], stepDeg = 2): string {
  const out: string[] = [];
  let prev: MapPoint | undefined;
  const jump = atlas.projection.width * 0.25;
  const push = (p: MapPoint) => {
    const cmd = !prev || Math.abs(p.x - prev.x) > jump ? "M" : "L";
    out.push(`${cmd}${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    prev = p;
  };
  for (let i = 0; i < points.length; i++) {
    if (i === 0) {
      push(toMap(atlas, points[0][0], points[0][1]));
      continue;
    }
    const a = unit(points[i - 1][0], points[i - 1][1]);
    const b = unit(points[i][0], points[i][1]);
    const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    const angle = Math.acos(dot);
    const n = Math.max(1, Math.ceil(angle / RAD / stepDeg));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const s = Math.sin(angle);
      const wa = s < 1e-9 ? 1 - t : Math.sin((1 - t) * angle) / s;
      const wb = s < 1e-9 ? t : Math.sin(t * angle) / s;
      const v = [0, 1, 2].map((j) => wa * a[j] + wb * b[j]);
      const r = Math.hypot(v[0], v[1], v[2]);
      const dec = Math.asin(v[2] / r) / RAD;
      const ra = Math.atan2(v[1], v[0]) / RAD;
      push(toMap(atlas, ra, dec));
    }
  }
  return out.join("");
}

/** Lingkaran deklinasi atau garis RA, untuk kisi koordinat. */
export function parallel(atlas: Atlas, dec: number): string {
  const pts: [number, number][] = [];
  for (let ra = 0; ra <= 360; ra += 1) pts.push([ra, dec]);
  return skyPath(atlas, pts, 1);
}

export function meridian(atlas: Atlas, ra: number): string {
  const pts: [number, number][] = [];
  for (let dec = -89; dec <= 89; dec += 1) pts.push([ra, dec]);
  return skyPath(atlas, pts, 1);
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
