// Potongan HiPS peta langit penuh SPHEREx di IRSA: order mana yang dibutuhkan,
// potongan mana yang terlihat, alamatnya, dan jaring segitiganya di langit.
//
// HiPS membagi langit menurut HEALPix bersarang: order k punya 12 x 4^k potongan,
// masing-masing 512 x 512 piksel. Order 5 adalah yang terdalam di sini (12,9 detik
// busur per piksel).

import { pixcoord2vec_nest, vec2pix_nest } from "@hscmap/healpix";
import { SKY_SPAN_DEG, unproject, type Frame, type V3 } from "./skyview";

export const MAX_ORDER = 5;
const TILE_PX = 512;
/** Sisi satu potongan order 0, derajat. */
const BASE_TILE_DEG = (Math.sqrt((4 * Math.PI) / 12) * 180) / Math.PI;
/** Potongan dibagi menjadi kisi sebanyak ini per sisi supaya mengikuti lengkung proyeksi. */
export const MESH_N = 12;

export type TileId = { order: number; ipix: number };

/** Order yang pikselnya kira-kira sebesar piksel layar; 0 berarti peta dasar sudah cukup. */
export function orderFor(zoom: number, deviceWidth: number): number {
  if (zoom < 1.5) return 0;
  const screenPixelDeg = SKY_SPAN_DEG / zoom / deviceWidth;
  const order = Math.ceil(Math.log2(BASE_TILE_DEG / TILE_PX / screenPixelDeg) - 0.35);
  return Math.max(1, Math.min(MAX_ORDER, order));
}

/** Potongan order `order` yang terlihat, dari yang paling dekat ke tengah layar. */
export function visibleTiles(frame: Frame, order: number): TileId[] {
  const nside = 2 ** order;
  const seen = new Map<number, number>();
  const nx = 14;
  const ny = 8;
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const v = unproject(frame, (i / nx) * frame.w, (j / ny) * frame.h);
      if (!v) continue;
      const ipix = vec2pix_nest(nside, v);
      const d = Math.hypot(i / nx - 0.5, j / ny - 0.5);
      if (!seen.has(ipix) || seen.get(ipix)! > d) seen.set(ipix, d);
    }
  }
  return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([ipix]) => ({ order, ipix }));
}

/** Alamat satu potongan. `frame` adalah indeks panjang gelombang di kubus; frame 0 tanpa akhiran. */
export function tileUrl(base: string, t: TileId, frame: number): string {
  const dir = Math.floor(t.ipix / 10000) * 10000;
  return `${base}/Norder${t.order}/Dir${dir}/Npix${t.ipix}${frame ? `_${frame}` : ""}.png`;
}

/** Jaring satu potongan: untuk tiap titik kisi, arah di langit (3 angka) lalu letaknya
 *  di gambar potongan (2 angka). Baris gambar mengikuti sumbu timur laut HEALPix dan
 *  kolomnya sumbu barat laut; susunan ini dipastikan dari data di pipeline (allsky.py). */
export function tileMesh(t: TileId): { vertices: Float32Array; centre: V3 } {
  const nside = 2 ** t.order;
  const n = MESH_N;
  const vertices = new Float32Array((n + 1) * (n + 1) * 5);
  let at = 0;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const ne = i / n;
      const nw = j / n;
      const v = pixcoord2vec_nest(nside, t.ipix, ne, nw);
      vertices[at++] = v[0];
      vertices[at++] = v[1];
      vertices[at++] = v[2];
      vertices[at++] = nw;
      vertices[at++] = ne;
    }
  }
  return { vertices, centre: pixcoord2vec_nest(nside, t.ipix, 0.5, 0.5) };
}

/** Indeks segitiga untuk jaring di atas; sama untuk semua potongan. */
export function meshIndices(): Uint16Array {
  const n = MESH_N;
  const out = new Uint16Array(n * n * 6);
  let at = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      const b = a + 1;
      const c = a + n + 1;
      const d = c + 1;
      out.set([a, b, c, b, d, c], at);
      at += 6;
    }
  }
  return out;
}

/** Jari-jari sudut satu potongan, radian (dengan cadangan). */
export const tileRadius = (order: number) => ((BASE_TILE_DEG / 2 ** order) * Math.PI) / 180;
