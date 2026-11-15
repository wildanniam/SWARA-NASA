// Citra peta seluruh langit: dimuat sekali per berkas, lalu diwarnai dengan look yang
// sedang dipakai. Di luar elips langit dibiarkan tembus, supaya halaman tetap terlihat.

export type Gray = { data: Uint8ClampedArray; width: number; height: number };

const cache = new Map<string, Promise<Gray>>();

/** Nilai abu-abu satu berkas peta (kanal merah dari PNG abu-abu). */
export function loadGray(url: string): Promise<Gray> {
  let pending = cache.get(url);
  if (!pending) {
    pending = new Promise<Gray>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const data = new Uint8ClampedArray(canvas.width * canvas.height);
        for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4];
        resolve({ data, width: canvas.width, height: canvas.height });
      };
      img.onerror = () => reject(new Error(`sky image: ${url}`));
      img.src = url;
    });
    cache.set(url, pending);
    pending.catch(() => cache.delete(url));
  }
  return pending;
}

const masks = new Map<string, Uint8Array>();

/** 1 di dalam elips langit, 0 di luar. Tepinya dihaluskan satu piksel. */
function ellipseMask(width: number, height: number): Uint8Array {
  const key = `${width}x${height}`;
  let mask = masks.get(key);
  if (mask) return mask;
  mask = new Uint8Array(width * height);
  const ax = width / 2;
  const ay = height / 2;
  for (let y = 0; y < height; y++) {
    const v = (y + 0.5 - ay) / ay;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5 - ax) / ax;
      // Jarak dari tepi dalam piksel, kira-kira: dipakai untuk tepi yang halus.
      const r = Math.sqrt(u * u + v * v);
      const edge = (1 - r) * ax;
      mask[y * width + x] = edge >= 1 ? 255 : edge <= 0 ? 0 : Math.round(edge * 255);
    }
  }
  masks.set(key, mask);
  return mask;
}

/** Lukis peta ke kanvas seukuran berkasnya, lewat peta warna `lut` (dan `tone` sebelumnya). */
export function paintSky(canvas: HTMLCanvasElement, gray: Gray, lut: Uint8ClampedArray, tone?: Uint8ClampedArray) {
  const { width, height, data } = gray;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const mask = ellipseMask(width, height);
  const out = new ImageData(width, height);
  const px = out.data;
  for (let i = 0; i < data.length; i++) {
    const v = (tone ? tone[data[i]] : data[i]) * 3;
    px[i * 4] = lut[v];
    px[i * 4 + 1] = lut[v + 1];
    px[i * 4 + 2] = lut[v + 2];
    px[i * 4 + 3] = mask[i];
  }
  canvas.getContext("2d")!.putImageData(out, 0, 0);
}
