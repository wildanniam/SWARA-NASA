// Peta warna untuk citra abu-abu 8-bit dari pipeline.
//
// Semuanya dikurasi dengan satu aturan: terang selalu naik (atau, untuk Paper, selalu
// turun) dari nilai terendah ke tertinggi. Dengan begitu benda yang lebih terang di
// data selalu tampak lebih terang di layar, apa pun warnanya. Peta pelangi dan peta
// dua arah tidak dipakai: urutan terangnya menyesatkan.

export type PaletteId = "heat" | "glacier" | "aurora" | "nebula" | "gray" | "paper";

type Stop = [number, number, number, number];

const STOPS: Record<PaletteId, Stop[]> = {
  // Ember: panas inframerah. Bawaan.
  heat: [
    [0, 0, 0, 0],
    [0.18, 44, 9, 12],
    [0.42, 142, 34, 16],
    [0.68, 236, 116, 28],
    [0.87, 255, 204, 108],
    [1, 255, 250, 236],
  ],
  // Glacier: cahaya bintang yang dingin.
  glacier: [
    [0, 0, 0, 0],
    [0.2, 9, 16, 44],
    [0.45, 26, 62, 138],
    [0.7, 72, 152, 214],
    [0.88, 170, 222, 246],
    [1, 244, 252, 255],
  ],
  // Aurora: dari laut dalam ke hijau lalu kuning pucat.
  aurora: [
    [0, 0, 0, 0],
    [0.2, 8, 26, 46],
    [0.45, 12, 88, 98],
    [0.7, 58, 168, 112],
    [0.88, 178, 226, 122],
    [1, 252, 250, 206],
  ],
  // Nebula: ungu ke merah muda lalu krem.
  nebula: [
    [0, 0, 0, 0],
    [0.2, 30, 10, 58],
    [0.45, 104, 26, 120],
    [0.7, 214, 78, 118],
    [0.88, 252, 172, 140],
    [1, 255, 244, 222],
  ],
  // Mono: abu-abu netral.
  gray: [
    [0, 0, 0, 0],
    [1, 255, 255, 255],
  ],
  // Paper: langit terang, bintang gelap; cara lama astronom mencari yang redup.
  paper: [
    [0, 244, 241, 234],
    [0.5, 142, 138, 134],
    [1, 10, 10, 14],
  ],
};

export const LOOKS: { id: PaletteId; name: string }[] = [
  { id: "heat", name: "Ember" },
  { id: "glacier", name: "Glacier" },
  { id: "aurora", name: "Aurora" },
  { id: "nebula", name: "Nebula" },
  { id: "gray", name: "Mono" },
  { id: "paper", name: "Paper" },
];

export const isPalette = (v: unknown): v is PaletteId => typeof v === "string" && v in STOPS;

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

export const LUTS = Object.fromEntries(
  (Object.keys(STOPS) as PaletteId[]).map((id) => [id, build(STOPS[id])]),
) as Record<PaletteId, Uint8ClampedArray>;

/** Gradien CSS satu look, untuk contoh warnanya di tombol dan legenda. */
export const lookGradient = (id: PaletteId, angle = "90deg") =>
  `linear-gradient(${angle}, ${STOPS[id].map(([t, r, g, b]) => `rgb(${r} ${g} ${b}) ${Math.round(t * 100)}%`).join(", ")})`;

/** Latar langit memakai look yang sama dengan lensa. Paper membuat langit terang,
 *  dan teks antarmuka tidak terbaca di atasnya, jadi latarnya memakai Mono. */
export const backdropPalette = (id: PaletteId): PaletteId => (id === "paper" ? "gray" : id);

/** Mengangkat yang redup: kurva gamma di atas nilai tampilan. Urutan terang tetap,
 *  hanya jaraknya yang berubah. */
export const REVEAL_LUT = (() => {
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = Math.round(255 * Math.pow(v / 255, 0.5));
  return lut;
})();

// Warna penanda di atas citra: jenuh dan piksel rusak.
export const FLAG_SATURATED: [number, number, number] = [255, 107, 94];
export const FLAG_BAD: [number, number, number] = [110, 168, 255];
