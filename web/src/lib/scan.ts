// Ekstraksi puncak kolom untuk Mode Pindai dari piksel citra display.
// Murni (tanpa DOMcanvas di inti) supaya bisa diuji tanpa browser; pembacaan
// kanvas hanya di imagePixels() yang dipakai aplikasi.

import { SCAN, type ScanSettings } from "../sound/mapping";

export type ScanPeak = {
  /** Posisi vertikal, piksel dari atas (0 = utara). */
  y: number;
  /** Terang relatif 0-1 terhadap persentil-99 frame. */
  v: number;
  /** Piksel display ini ditandai tidak tepercaya di masker. */
  flagged: boolean;
};

export type ScanData = {
  width: number;
  height: number;
  /** Satu entri per kolom tersapu, dari timur ke barat. */
  cols: ScanPeak[][];
};

/** Baca piksel abu-abu (kanal merah) dari citra yang sudah dimuat. */
export function imagePixels(img: HTMLImageElement): { data: Uint8ClampedArray; width: number; height: number } {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return { data: new Uint8ClampedArray(0), width: 0, height: 0 };
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  const rgba = g.getImageData(0, 0, c.width, c.height).data;
  const data = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4];
  return { data, width: c.width, height: c.height };
}

/** Puncak-puncak tiap kolom: penghalus, ambang, lalu non-maximum suppression. */
export function extractScanColumns(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mask: Uint8ClampedArray | null,
  s: ScanSettings = SCAN,
): ScanData {
  const cols: ScanPeak[][] = [];
  const sorted = [...data].sort((a, b) => a - b);
  const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))];
  const floor = s.floorFrac * p99;
  const half = Math.floor(s.smooth / 2);
  for (let x = 0; x < width; x += s.colStep) {
    const col: number[] = [];
    for (let y = 0; y < height; y++) col.push(data[y * width + x]);
    if (p99 <= 0) {
      cols.push([]);
      continue;
    }
    const sm = col.map((_, y) => {
      let sum = 0;
      let n = 0;
      for (let k = -half; k <= half; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < height) {
          sum += col[yy];
          n++;
        }
      }
      return sum / n;
    });
    const cand = sm
      .map((v, y) => ({ v, y, raw: col[y] }))
      .filter(({ v, y }) => {
        if (v <= floor) return false;
        for (let z = Math.max(0, y - s.minDist); z <= Math.min(height - 1, y + s.minDist); z++) {
          if (sm[z] > v) return false;
        }
        return true;
      })
      .sort((a, b) => b.v - a.v || b.raw - a.raw);
    const take: { v: number; y: number }[] = [];
    for (const c of cand) {
      if (take.every((t) => Math.abs(t.y - c.y) >= s.minDist)) take.push(c);
      if (take.length >= s.topN) break;
    }
    cols.push(
      take.map(({ v, y }) => ({
        y,
        v: Math.min(1, v / p99),
        flagged: mask ? mask[y * width + x] !== 0 : false,
      })),
    );
  }
  return { width, height, cols };
}
