// Sapuan gambar: ekstraksi puncak per kolom dari piksel abu display (0-255),
// yaitu nilai setelah tone dan sebelum palet. Murni fungsi: tidak menyentuh
// DOM atau audio, supaya bisa diuji tanpa browser. Lihat measurements.md
// untuk ambang yang diukur dari 5 preset.

import type { Note } from "../sound/sonify";
import type { ScanSettings } from "../sound/mapping";

export type ScanPeak = {
  /** 0 = utara (atas citra) .. 1 = selatan. */
  row01: number;
  /** Nilai abu display 0-255. */
  value: number;
  /** Puncak jatuh di piksel bertanda jenuh/rusak pada mask. */
  flagged: boolean;
};

export type ScanColumn = {
  peaks: ScanPeak[];
  /** Kolom pertama melewati tengah medan: earcon target berbunyi di sini. */
  center: boolean;
};

export type ScanGrid = {
  columns: ScanColumn[];
  bg: number;
  sigma: number;
  /** Batas atas normalisasi volume: min(255, p98 * margin). */
  top: number;
};

export type ScanExtractOptions = {
  columns?: number;
  kSigma?: number;
  maxPeaks?: number;
  /** Jarak minimum antar puncak, dalam piksel pada citra 480px. */
  minDistPx?: number;
  topMargin?: number;
  /** Statistik dari kunjungan acuan (per objek per band): kalau ada, ambang dan
   *  normalisasi kunjungan ini memakai angka acuan, bukan citranya sendiri. */
  stats?: { bg: number; sigma: number; top: number };
};

const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const quantile = (sorted: number[], q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];

/** Abu display -> grid puncak. `gray`/`mask` persegi `size` x `size`, baris-mayor. */
export function scanGrid(
  gray: ArrayLike<number>,
  size: number,
  mask: ArrayLike<number> | null = null,
  opts: ScanExtractOptions = {},
): ScanGrid {
  const columns = opts.columns ?? 32;
  const kSigma = opts.kSigma ?? 4;
  const maxPeaks = opts.maxPeaks ?? 5;
  const minDist = Math.max(2, Math.round((opts.minDistPx ?? 6) * (size / 480)));
  const margin = opts.topMargin ?? 1.25;

  let bg: number;
  let sigma: number;
  let top: number;
  if (opts.stats) {
    ({ bg, sigma, top } = opts.stats);
  } else {
    const n = size * size;
    const vals = new Array<number>(n);
    for (let i = 0; i < n; i++) vals[i] = gray[i];
    bg = median(vals);
    const above = vals.filter((v) => v > bg).map((v) => v - bg);
    sigma = above.length ? quantile([...above].sort((a, b) => a - b), 0.68) : 1;
    top = Math.min(255, Math.round(quantile([...vals].sort((a, b) => a - b), 0.98) * margin));
  }
  const thr = bg + kSigma * (sigma || 1);
  if (!top) top = 1;

  const width = size / columns;
  const out: ScanColumn[] = [];
  for (let c = 0; c < columns; c++) {
    const x0 = Math.floor(c * width);
    const x1 = c === columns - 1 ? size : Math.floor((c + 1) * width);
    // Profil vertikal: rata-rata tiap baris di dalam kolom, dihaluskan 3px.
    const prof = new Array<number>(size);
    for (let y = 0; y < size; y++) {
      let s = 0;
      for (let x = x0; x < x1; x++) s += gray[y * size + x];
      prof[y] = s / (x1 - x0);
    }
    const sm = new Array<number>(size);
    for (let y = 0; y < size; y++) {
      const a = Math.max(0, y - 1);
      const b = Math.min(size, y + 2);
      let s = 0;
      for (let k = a; k < b; k++) s += prof[k];
      sm[y] = s / (b - a);
    }
    const found: { y: number; v: number }[] = [];
    for (let y = 1; y < size - 1; y++) {
      if (sm[y] > thr && sm[y] >= sm[y - 1] && sm[y] > sm[y + 1]) {
        const last = found[found.length - 1];
        if (!last || y - last.y >= minDist) found.push({ y, v: sm[y] });
        else if (sm[y] > last.v) found[found.length - 1] = { y, v: sm[y] };
      }
    }
    // Puncak terkuat dulu, maks `maxPeaks`.
    found.sort((a, b) => b.v - a.v);
    const xc = Math.min(size - 1, Math.floor((x0 + x1) / 2));
    const peaks: ScanPeak[] = found.slice(0, maxPeaks).map((p) => ({
      row01: p.y / (size - 1),
      value: Math.round(p.v),
      flagged: mask != null && mask[p.y * size + xc] > 64,
    }));
    out.push({ peaks, center: c === Math.floor(columns / 2) });
  }
  return { columns: out, bg, sigma: sigma || 1, top: top || 1 };
}

/** Baris utara-selatan -> frekuensi. Utara (0) paling tinggi, seperti pitch(). */
export function scanPitch(row01: number, s: ScanSettings): number {
  const level = Math.pow(Math.min(1, Math.max(0, 1 - row01)), 1);
  let semitones = level * s.octaves * 12;
  if (s.scale.length) {
    const perOctave = s.scale.length;
    const degrees = s.octaves * perOctave;
    const d = Math.round(level * degrees);
    semitones = Math.floor(d / perOctave) * 12 + s.scale[d % perOctave];
  }
  return s.baseHz * Math.pow(2, semitones / 12);
}

/** Grid puncak -> satu frasa nada yang siap dijadwalkan engine. */
export function scanPhrase(grid: ScanGrid, s: ScanSettings): Note[] {
  const notes: Note[] = [];
  const total = grid.columns.length;
  grid.columns.forEach((col, c) => {
    const t = c * s.colSeconds;
    const dur = s.colSeconds * s.noteFill;
    const pos = total > 1 ? c / (total - 1) : 0;
    if (!col.peaks.length) {
      notes.push({ t, dur, hz: null, unverified: false, pan: 0, lambda: pos });
    } else {
      for (const p of col.peaks) {
        notes.push({
          t,
          dur,
          hz: scanPitch(p.row01, s),
          vol: Math.min(1, Math.max(s.minVol, p.value / grid.top)),
          unverified: p.flagged,
          pan: 0,
          // Posisi pindai 0..1, bukan panjang gelombang: jadwal tidak memakainya.
          lambda: pos,
        });
      }
    }
    // Earcon target selalu berbunyi saat pindai melewati tengah, walau kolomnya kosong.
    if (col.center) {
      notes.push({ t, dur: s.earconSeconds, hz: s.earconHz, vol: s.earconGain, unverified: false, pan: 0, lambda: 0.5 });
    }
  });
  return notes;
}
