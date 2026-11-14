// Spektrum dari bundle (`spectrum.json`, kontraknya di pipeline/README.md) dan
// ringkasan yang dipakai bersama oleh panel dan suara, supaya mata dan telinga
// mendapat data yang sama.

export type SpectrumFlag = "ok" | "saturated" | "saturated_core" | "bad_pixel";

export type SpectrumPoint = {
  window: string;
  lambda_um: number;
  flux_jy: number;
  flux_err_jy: number;
  snr: number;
  flag: SpectrumFlag;
};

export type Spectrum = { id: string; points: SpectrumPoint[] };

/** Rentang panjang gelombang SPHEREx, mikron. */
export const LAMBDA_MIN = 0.75;
export const LAMBDA_MAX = 5.0;

/** Titik yang punya nilai fluks. "saturated" tetap dipakai tapi ditandai: SPHEREx
 *  menandai overflow, nilainya ada, akurasinya belum diverifikasi. */
export const isUsable = (p: SpectrumPoint) => p.flag === "ok" || p.flag === "saturated";

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export type Quality = "ok" | "faint" | "saturated" | "empty";

/** Batas minimal titik layak untuk membunyikan satu kunjungan. */
export const MIN_VISIT_POINTS = 8;

/** Apakah ada spektrum yang layak ditampilkan dan dibunyikan? */
export function assess(points: SpectrumPoint[]): Quality {
  const good = points.filter(isUsable);
  if (good.length < 10) {
    const cores = points.filter((p) => p.flag === "saturated_core").length;
    return cores > points.length / 2 ? "saturated" : "empty";
  }
  // Di langit kosong fluks apertur hanya derau: separuh titiknya di bawah 3 sigma.
  return median(good.map((p) => p.snr)) < 3 ? "faint" : "ok";
}

/** Nilai kelayakan satu kunjungan, agar visit baik tidak tertutup statistik visit lain. */
export function assessVisit(points: SpectrumPoint[], minPoints = MIN_VISIT_POINTS): Quality {
  const usable = points.filter(isUsable);
  if (usable.length < minPoints) {
    const cores = points.filter((p) => p.flag === "saturated_core").length;
    return points.length > 0 && cores > points.length / 2 ? "saturated" : "empty";
  }
  return median(usable.map((p) => p.snr)) < 3 ? "faint" : "ok";
}

/** Visit spektrum yang punya cukup pengukuran berguna dan SNR yang layak. */
export function playableVisits(
  windowIds: string[],
  points: SpectrumPoint[],
  minPoints = MIN_VISIT_POINTS,
): string[] {
  return windowIds.filter((id) => assessVisit(points.filter((p) => p.window === id), minPoints) === "ok");
}

/** Batas atas skala terang, sama untuk semua kunjungan supaya perubahan antar
 *  waktu terlihat dan terdengar. Persentil, bukan maksimum: beberapa titik jenuh
 *  melonjak puluhan kali di atas sisanya. */
export function fluxTop(points: SpectrumPoint[]): number {
  const v = points
    .filter(isUsable)
    .map((p) => p.flux_jy)
    .sort((a, b) => a - b);
  if (!v.length) return 1;
  return Math.max(v[Math.min(v.length - 1, Math.floor(v.length * 0.98))] * 1.25, 1e-9);
}

export type Bin = {
  /** Titik tengah langkah, mikron. */
  lambda: number;
  /** Median fluks titik "ok"; kalau tidak ada, median titik yang ditandai jenuh.
   *  null = tidak ada data di langkah ini. */
  flux: number | null;
  /** Nilainya hanya dari titik yang ditandai jenuh oleh SPHEREx. */
  unverified: boolean;
};

/** Satu kunjungan dibagi rata menjadi `steps` langkah panjang gelombang. */
export function binVisit(points: SpectrumPoint[], windowId: string, steps: number): Bin[] {
  const width = (LAMBDA_MAX - LAMBDA_MIN) / steps;
  const cells: SpectrumPoint[][] = Array.from({ length: steps }, () => []);
  for (const p of points) {
    if (p.window !== windowId || !isUsable(p)) continue;
    const i = Math.min(steps - 1, Math.max(0, Math.floor((p.lambda_um - LAMBDA_MIN) / width)));
    cells[i].push(p);
  }
  return cells.map((cell, i) => {
    // Titik jenuh kadang melonjak jauh; selama ada titik bersih di langkah yang sama, pakai itu.
    const clean = cell.filter((p) => p.flag === "ok");
    const used = clean.length ? clean : cell;
    return {
      lambda: LAMBDA_MIN + (i + 0.5) * width,
      flux: used.length ? median(used.map((p) => p.flux_jy)) : null,
      unverified: used.length > 0 && !clean.length,
    };
  });
}

/** "12.6 mJy" */
export function fluxLabel(jy: number, digits = 1): string {
  const a = Math.abs(jy);
  if (a >= 1) return `${jy.toFixed(digits)} Jy`;
  if (a >= 1e-3) return `${(jy * 1e3).toFixed(digits)} mJy`;
  return `${(jy * 1e6).toFixed(0)} µJy`;
}
