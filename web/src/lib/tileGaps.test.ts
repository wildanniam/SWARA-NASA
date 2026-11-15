// Piksel tanpa data di potongan peta: inti bintang diisi, celah besar dibiarkan kosong.

import { strict as assert } from "node:assert";
import { SMALL_HOLE_PX, tilePixels } from "./tileGaps";

const W = 64;
const H = 64;

/** Potongan abu rata `gray` dengan piksel yang disebut `hole` dibuat transparan. */
function tile(gray: (x: number, y: number) => number, hole: (x: number, y: number) => boolean): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (hole(x, y)) continue; // transparan: 0, 0, 0, 0
      const g = gray(x, y);
      rgba.set([g, g, g, 255], i);
    }
  }
  return rgba;
}
const at = (data: Uint8Array, x: number, y: number) => ({ gray: data[(y * W + x) * 2], alpha: data[(y * W + x) * 2 + 1] });

// Tanpa lubang: nilai sama persis, semua punya data.
{
  const { data, gap } = tilePixels(tile((x, y) => (x * 3 + y) % 256, () => false), W, H);
  assert.equal(gap, 0);
  assert.deepEqual(at(data, 5, 7), { gray: 22, alpha: 255 });
  assert.deepEqual(at(data, 63, 63), { gray: (63 * 3 + 63) % 256, alpha: 255 });
}

// Inti bintang: lubang 3 x 3 di tengah bintang terang diisi nilai tepinya.
{
  const star = (x: number, y: number) => (Math.abs(x - 20) <= 3 && Math.abs(y - 20) <= 3 ? 240 : 30);
  const { data, gap } = tilePixels(tile(star, (x, y) => Math.abs(x - 20) <= 1 && Math.abs(y - 20) <= 1), W, H);
  assert.equal(gap, 0);
  assert.deepEqual(at(data, 20, 20), { gray: 240, alpha: 255 });
  assert.deepEqual(at(data, 19, 21), { gray: 240, alpha: 255 });
  assert.deepEqual(at(data, 40, 40), { gray: 30, alpha: 255 });
}

// Celah besar: strip selebar 20 piksel tetap tanpa data dan tidak diberi nilai.
{
  const { data, gap } = tilePixels(tile(() => 100, (x) => x >= 10 && x < 30), W, H);
  assert.ok(20 * H > SMALL_HOLE_PX);
  assert.equal(gap, (20 * H) / (W * H));
  assert.deepEqual(at(data, 15, 32), { gray: 0, alpha: 0 });
  assert.deepEqual(at(data, 9, 32), { gray: 100, alpha: 255 });
  assert.deepEqual(at(data, 30, 32), { gray: 100, alpha: 255 });
}

// Keduanya sekaligus, dan lubang di tepi kiri tidak bersambung ke tepi kanan baris sebelumnya.
{
  const hole = (x: number, y: number) => (x === 0 && y === 10) || (x === W - 1 && y === 9) || y >= 50;
  const { data, gap } = tilePixels(tile((x) => (x < 32 ? 50 : 200), hole), W, H);
  assert.equal(gap, (14 * W) / (W * H));
  assert.deepEqual(at(data, 0, 10), { gray: 50, alpha: 255 });
  assert.deepEqual(at(data, W - 1, 9), { gray: 200, alpha: 255 });
  assert.deepEqual(at(data, 3, 55), { gray: 0, alpha: 0 });
}

// Potongan yang seluruhnya kosong.
{
  const { data, gap } = tilePixels(new Uint8ClampedArray(W * H * 4), W, H);
  assert.equal(gap, 1);
  assert.ok(data.every((v) => v === 0));
}

console.log("ok: lubang kecil diisi dari tepinya, celah besar tetap tanpa data");
