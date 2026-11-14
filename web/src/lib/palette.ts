// Peta warna untuk citra abu-abu 8-bit dari pipeline.

export type PaletteId = "heat" | "gray";

type Stop = [number, number, number, number];

const STOPS: Record<PaletteId | "star", Stop[]> = {
  // Latar langit: cahaya bintang yang dingin, supaya beda dari lensa yang hangat.
  star: [
    [0, 5, 6, 11],
    [0.12, 7, 9, 19],
    [0.4, 30, 38, 86],
    [0.68, 118, 134, 212],
    [0.88, 205, 214, 255],
    [1, 250, 251, 255],
  ],
  heat: [
    [0, 0, 0, 0],
    [0.18, 44, 9, 12],
    [0.42, 142, 34, 16],
    [0.68, 236, 116, 28],
    [0.87, 255, 204, 108],
    [1, 255, 250, 236],
  ],
  gray: [
    [0, 0, 0, 0],
    [1, 255, 255, 255],
  ],
};

function build(stops: Stop[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [t0, r0, g0, b0] = stops[k];
    const [t1, r1, g1, b1] = stops[k + 1];
    const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    lut[i * 3] = r0 + (r1 - r0) * f;
    lut[i * 3 + 1] = g0 + (g1 - g0) * f;
    lut[i * 3 + 2] = b0 + (b1 - b0) * f;
  }
  return lut;
}

export const LUTS: Record<PaletteId, Uint8ClampedArray> = {
  heat: build(STOPS.heat),
  gray: build(STOPS.gray),
};

export const STAR_LUT = build(STOPS.star);

// Warna penanda di atas citra: jenuh dan piksel rusak.
export const FLAG_SATURATED: [number, number, number] = [255, 107, 94];
export const FLAG_BAD: [number, number, number] = [110, 168, 255];
