// Baca piksel abu display dari citra yang sudah dimuat (DOM).
// Abu = kanal merah (citra pipeline abu-abu); mask dibaca dengan cara yang sama.

export type FramePixels = {
  gray: Uint8ClampedArray;
  mask: Uint8ClampedArray | null;
  size: number;
};

let scratch: HTMLCanvasElement | undefined;

/** Gambar `img` (persegi `size` px) ke kanvas dan kembalikan nilai abunya. */
export function readFramePixels(img: HTMLImageElement, maskImg?: HTMLImageElement): FramePixels | undefined {
  const size = img.naturalWidth;
  if (!size || size !== img.naturalHeight) return undefined;
  scratch ??= document.createElement("canvas");
  const read = (source: HTMLImageElement): Uint8ClampedArray | undefined => {
    if (source.naturalWidth !== size || source.naturalHeight !== size) return undefined;
    scratch!.width = size;
    scratch!.height = size;
    const ctx = scratch!.getContext("2d", { willReadFrequently: true });
    if (!ctx) return undefined;
    ctx.drawImage(source, 0, 0);
    const data = ctx.getImageData(0, 0, size, size).data;
    const out = new Uint8ClampedArray(size * size);
    for (let i = 0; i < out.length; i++) out[i] = data[i * 4];
    return out;
  };
  const gray = read(img);
  if (!gray) return undefined;
  const mask = maskImg ? (read(maskImg) ?? null) : null;
  return { gray, mask, size };
}
