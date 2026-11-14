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
