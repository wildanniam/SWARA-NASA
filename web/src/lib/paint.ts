// Mewarnai citra abu-abu 8-bit dari pipeline ke canvas lewat peta warna.
// Dipakai lensa, latar langit, dan cuplikan benda contoh.

import { FLAG_BAD, FLAG_SATURATED } from "./palette";

let scratch: HTMLCanvasElement | undefined;

/** Bagian citra yang ditampilkan, dalam piksel citra itu. Boleh melewati tepinya. */
export type Rect = { x: number; y: number; w: number; h: number };

function pixels(img: HTMLImageElement, size: number, view?: Rect, soften = 0): Uint8ClampedArray {
  scratch ??= document.createElement("canvas");
  if (scratch.width !== size) scratch.width = scratch.height = size;
  const ctx = scratch.getContext("2d", { willReadFrequently: true })!;
  ctx.clearRect(0, 0, size, size);
  // `soften` dalam piksel citra; di kanvas ia ikut skala gambarnya. Browser tanpa
  // filter kanvas mengabaikannya, dan citra tampil setajam aslinya.
  const scale = view ? size / view.w : size / img.naturalWidth;
  ctx.filter = soften > 0 ? `blur(${(soften * scale).toFixed(2)}px)` : "none";
  if (view) {
    // Bagian di luar citra dibiarkan kosong; letaknya dihitung sendiri supaya
    // tidak bergantung pada cara browser memotong persegi sumber.
    const k = size / view.w;
    ctx.drawImage(img, -view.x * k, -view.y * k, img.naturalWidth * k, img.naturalHeight * k);
  } else ctx.drawImage(img, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}

/** Gambar `img` ke `canvas` (persegi `size` piksel). `mask` menandai piksel jenuh dan
 *  rusak. `view` memilih bagian citra yang tampil; tanpa itu seluruh citra. `tone`
 *  memetakan ulang tingkat abu sebelum diwarnai dan `soften` menghaluskan citra
 *  lebih dulu, dalam piksel citra (lihat tone.ts). */
export function paint(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  lut: Uint8ClampedArray,
  size: number,
  mask?: HTMLImageElement,
  view?: Rect,
  tone?: Uint8ClampedArray,
  soften = 0,
) {
  if (canvas.width !== size) canvas.width = canvas.height = size;
  const gray = pixels(img, size, view, soften);
  const out = new ImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = (tone ? tone[gray[i * 4]] : gray[i * 4]) * 3;
    out.data[i * 4] = lut[v];
    out.data[i * 4 + 1] = lut[v + 1];
    out.data[i * 4 + 2] = lut[v + 2];
    out.data[i * 4 + 3] = 255;
  }
  if (mask) {
    const m = pixels(mask, size, view);
    for (let i = 0; i < size * size; i++) {
      const tint = m[i * 4] > 200 ? FLAG_SATURATED : m[i * 4] > 64 ? FLAG_BAD : null;
      if (!tint) continue;
      for (let c = 0; c < 3; c++) out.data[i * 4 + c] = out.data[i * 4 + c] * 0.4 + tint[c] * 0.6;
    }
  }
  canvas.getContext("2d")!.putImageData(out, 0, 0);
}

/** Skala terang satu citra: dengan ini tingkat abu 0-255 dikembalikan ke satuan aslinya
 *  (pipeline meregangkan dengan asinh(v/knee)/asinh(vmax/knee), lihat frames.stretch). */
export type Linear = { knee: number; vmax: number };

type RGB = [number, number, number];
const BASE: RGB = [5, 6, 11];
// Lebih terang sekarang: bara. Lebih terang dulu: bayangan pucat. Dua warna sistem
// (aksen dan garis), bukan peta warna dua arah yang lain.
const NOW: RGB[] = [BASE, [150, 66, 22], [255, 180, 84], [255, 240, 210]];
const THEN: RGB[] = [BASE, [52, 66, 112], [150, 168, 226], [228, 234, 255]];

function ramp(stops: RGB[], t: number, out: Uint8ClampedArray, at: number) {
  const x = t * (stops.length - 1);
  const k = Math.min(stops.length - 2, Math.floor(x));
  const f = x - k;
  out[at] = stops[k][0] + (stops[k + 1][0] - stops[k][0]) * f;
  out[at + 1] = stops[k][1] + (stops[k + 1][1] - stops[k][1]) * f;
  out[at + 2] = stops[k][2] + (stops[k + 1][2] - stops[k][2]) * f;
  out[at + 3] = 255;
}

/** Citra selisih: `img` dikurangi `ref`, keduanya bagian langit yang sama. Yang tidak
 *  berubah jadi gelap; yang lebih terang di `img` berwarna bara, yang lebih terang di
 *  `ref` berwarna pucat. Dengan `scale`, pengurangan dilakukan di satuan terang aslinya;
 *  tanpa itu (citra lama) di tingkat tampilan. Ambang gelapnya 2,5 kali derau selisih
 *  itu sendiri, diukur dari median simpangan mutlak. */
export function paintDifference(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  ref: HTMLImageElement,
  size: number,
  view?: Rect,
  scale?: Linear,
  tone?: Uint8ClampedArray,
  soften = 0,
) {
  if (canvas.width !== size) canvas.width = canvas.height = size;
  const lin = new Float32Array(256);
  const k = scale ? Math.asinh(scale.vmax / scale.knee) : 0;
  for (let v = 0; v < 256; v++) {
    const level = tone ? tone[v] : v;
    lin[v] = scale ? scale.knee * Math.sinh((level / 255) * k) : level;
  }
  // `pixels` memakai satu kanvas kerja, jadi hasil pertama disalin dulu.
  const a = pixels(img, size, view, soften).slice();
  const b = pixels(ref, size, view, soften);
  const n = size * size;
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = lin[a[i * 4]] - lin[b[i * 4]];

  const sample: number[] = [];
  for (let i = 0; i < n; i += 7) sample.push(d[i]);
  sample.sort((x, y) => x - y);
  const med = sample[sample.length >> 1];
  const dev = sample.map((x) => Math.abs(x - med)).sort((x, y) => x - y);
  const sigma = Math.max(1.4826 * dev[dev.length >> 1], scale ? scale.knee / 30 : 0.5);
  const floor = 2.5 * sigma;
  const top = Math.max(dev[Math.floor(dev.length * 0.998)], 12 * sigma);
  const span = Math.asinh((top - floor) / (3 * sigma));

  const out = new ImageData(size, size);
  for (let i = 0; i < n; i++) {
    const x = d[i] - med;
    const m = Math.abs(x);
    const t = m <= floor ? 0 : Math.min(1, Math.asinh((m - floor) / (3 * sigma)) / span);
    ramp(x > 0 ? NOW : THEN, t, out.data, i * 4);
  }
  canvas.getContext("2d")!.putImageData(out, 0, 0);
}
