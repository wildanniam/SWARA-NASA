// Perender peta seluruh langit (WebGL).
//
// Dua lapis, keduanya diwarnai lewat tekstur peta warna 256 tingkat, jadi look dan
// Reveal faint hanya mengganti tekstur itu:
//
//   1. Peta dasar: peta statis buatan pipeline (Hammer galaktik). Untuk tiap piksel
//      layar, shader menghitung arah langitnya lalu mengambil nilainya dari peta itu.
//      Lapis ini selalu ada, jadi tidak pernah ada bidang kosong.
//   2. Potongan HiPS dari IRSA yang sudah termuat, sebagai jaring segitiga di langit,
//      dari order rendah ke tinggi. Tiap potongan muncul dengan larut singkat. Piksel
//      yang tidak punya data tembus pandang dan diberi arsir tipis, jadi lapis di
//      bawahnya (lebih kasar) tetap tampak dan celahnya terbaca sebagai celah
//      (lihat tileGaps.ts).
//
// Proyeksi di shader sama dengan skyview.ts.

import { meshIndices, MESH_N, tileMesh, tileRadius, tileUrl, type TileId } from "./hips";
import type { V3 } from "./skyview";
import { tilePixels } from "./tileGaps";

const BASE_VS = `
attribute vec2 aPos;
varying vec2 vClip;
void main() {
  vClip = aPos;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const BASE_FS = `
precision highp float;
uniform mat3 uInv;      // arah di kerangka pandangan -> galaktik
uniform float uZoom;
uniform float uEdge;    // lebar tepi halus elips
uniform float uMix;     // 0 = peta lama, 1 = peta baru (ganti panjang gelombang)
uniform float uAlpha;
uniform sampler2D uOld;
uniform sampler2D uNew;
uniform sampler2D uLut;
varying vec2 vClip;
void main() {
  float X = vClip.x * 2.8284271 / uZoom;
  float Y = vClip.y * 1.4142136 / uZoom;
  float e = X * X / 8.0 + Y * Y / 2.0;
  if (e > 1.0) discard;
  float z = sqrt(max(0.0, 1.0 - X * X / 16.0 - Y * Y / 4.0));
  float lon = -2.0 * atan(z * X, 2.0 * (2.0 * z * z - 1.0));
  float lat = asin(clamp(z * Y, -1.0, 1.0));
  vec3 g = uInv * vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
  float b = asin(clamp(g.z, -1.0, 1.0));
  float hl = -atan(g.y, g.x) / 2.0;
  float k = sqrt(1.0 + cos(b) * cos(hl));
  vec2 uv = vec2((cos(b) * sin(hl) / k + 1.0) / 2.0, (1.0 - sin(b) / k) / 2.0);
  float gray = mix(texture2D(uOld, uv).r, texture2D(uNew, uv).r, uMix);
  vec3 col = texture2D(uLut, vec2(gray * 0.99609375 + 0.001953125, 0.5)).rgb;
  float a = clamp((1.0 - e) / uEdge, 0.0, 1.0) * uAlpha;
  gl_FragColor = vec4(col * a, a);
}`;

const TILE_VS = `
attribute vec3 aDir;
attribute vec2 aUv;
uniform mat3 uM;        // ICRS -> kerangka pandangan
uniform float uZoom;
varying vec2 vUv;
void main() {
  vec3 v = uM * aDir;
  float lam = -atan(v.y, v.x);
  float lat = asin(clamp(v.z, -1.0, 1.0));
  float k = sqrt(1.0 + cos(lat) * cos(lam / 2.0));
  vUv = aUv;
  gl_Position = vec4(cos(lat) * sin(lam / 2.0) / k * uZoom, sin(lat) / k * uZoom, 0.0, 1.0);
}`;

const TILE_FS = `
precision highp float;
uniform sampler2D uTex;
uniform sampler2D uLut;
uniform float uAlpha;
uniform float uHatch;   // jarak antar garis arsir, piksel perangkat
varying vec2 vUv;
void main() {
  // Alpha = bagian piksel yang punya data. Abu disimpan sudah dikali alpha, jadi di tepi
  // celah nilai yang diinterpolasi dibagi lagi supaya tidak menggelap.
  vec4 t = texture2D(uTex, vUv);
  float gray = t.a > 0.02 ? min(1.0, t.r / t.a) : 0.0;
  vec3 col = texture2D(uLut, vec2(gray * 0.99609375 + 0.001953125, 0.5)).rgb;
  // Celah tanpa data: selaput tipis dan garis miring sewarna nada tengah look, di ruang
  // layar. Selaputnya mengangkat bagian yang di peta dasar pun kosong (hitam pekat).
  float off = abs(mod(gl_FragCoord.x + gl_FragCoord.y, uHatch) - uHatch * 0.5) * 0.7071;
  float line = 1.0 - smoothstep(uHatch * 0.05, uHatch * 0.05 + 1.0, off);
  float hatch = (0.11 + 0.2 * line) * (1.0 - t.a);
  vec3 ink = texture2D(uLut, vec2(0.5, 0.5)).rgb;
  gl_FragColor = vec4(col * t.a + ink * hatch, t.a + hatch) * uAlpha;
}`;

type Tile = { texture: WebGLTexture; loadedAt: number; usedAt: number; id: TileId; gap: number };
type Shape = { buffer: WebGLBuffer; centre: V3 };

const FADE_MS = 260;
// Browser membuka paling banyak enam sambungan ke satu server.
const MAX_REQUESTS = 6;
const RETRY_MS = 15000;

function program(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "program");
  return p;
}

/** Matriks 3x3 baris-demi-baris ke urutan kolom yang dipakai GLSL. */
const columns = (m: number[]) => new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);

export class SkyRenderer {
  /** Dipanggil saat ada yang berubah dan peta perlu digambar ulang. */
  onChange: () => void = () => undefined;

  private gl: WebGLRenderingContext;
  private base: WebGLProgram;
  private tile: WebGLProgram;
  private quad: WebGLBuffer;
  private indices: WebGLBuffer;
  private lut: WebGLTexture;
  private oldMap?: WebGLTexture;
  private newMap?: WebGLTexture;
  private mapSwappedAt = 0;
  private mapFadeMs = 0;
  private galactic: number[];
  private source = "";
  private frame = -1;
  private tiles = new Map<string, Tile>();
  private shapes = new Map<string, Shape>();
  private pending = new Map<string, AbortController>();
  private failedAt = new Map<string, number>();
  private failures = 0;
  private capacity: number;
  private disposed = false;
  /** Jumlah potongan yang digambar di bingkai terakhir, untuk uji. */
  lastShown = 0;
  /** Bagian tanpa data (0-1) terbesar di antara potongan paling tajam yang digambar di bingkai terakhir. */
  lastGap = 0;
  private scratch?: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;

  constructor(canvas: HTMLCanvasElement, icrsToGalactic: number[][], capacity: number) {
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) throw new Error("WebGL is not available");
    if (!gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision) throw new Error("no highp float");
    this.gl = gl;
    this.galactic = icrsToGalactic.flat();
    this.capacity = capacity;
    this.base = program(gl, BASE_VS, BASE_FS);
    this.tile = program(gl, TILE_VS, TILE_FS);
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.indices = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, meshIndices(), gl.STATIC_DRAW);
    this.lut = this.texture();
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  private texture(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  /** Peta warna (256 x RGB) dan pemetaan ulang tingkat abu sebelum diwarnai. */
  setLook(lut: Uint8ClampedArray, tone?: Uint8ClampedArray) {
    const gl = this.gl;
    const rgba = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      const v = (tone ? tone[i] : i) * 3;
      rgba.set([lut[v], lut[v + 1], lut[v + 2], 255], i * 4);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.lut);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    this.onChange();
  }

  /** Peta dasar untuk satu panjang gelombang. Peta sebelumnya larut ke yang baru. */
  setMap(gray: { data: Uint8ClampedArray; width: number; height: number }, fadeMs: number) {
    const gl = this.gl;
    if (this.oldMap && this.oldMap !== this.newMap) gl.deleteTexture(this.oldMap);
    this.oldMap = this.newMap;
    this.newMap = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gray.width, gray.height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, gray.data);
    this.oldMap ??= this.newMap;
    this.mapSwappedAt = performance.now();
    this.mapFadeMs = this.oldMap === this.newMap ? 0 : fadeMs;
    this.onChange();
  }

  /** Sumber potongan: alamat HiPS dan indeks panjang gelombangnya. Potongan panjang
   *  gelombang lain dibuang dari antrean, tapi yang sudah termuat tetap di tembolok. */
  setSource(url: string, frame: number) {
    if (url === this.source && frame === this.frame) return;
    this.source = url;
    this.frame = frame;
    for (const c of this.pending.values()) c.abort();
    this.pending.clear();
    this.onChange();
  }

  get hasMap() {
    return !!this.newMap;
  }

  /** Berapa potongan yang sedang diminta. */
  get loading() {
    return this.pending.size;
  }

  /** Potongan yang sudah termuat, untuk uji. */
  get loaded() {
    return [...this.tiles.keys()];
  }

  /** IRSA berulang kali tidak menjawab: peta tetap tampil, hanya tidak menajam. */
  get unreachable() {
    return this.failures >= 4;
  }

  private key(t: TileId) {
    return `${this.frame}:${t.order}:${t.ipix}`;
  }

  /** Minta potongan yang belum ada (paling banyak beberapa serentak) dan batalkan
   *  permintaan yang tidak lagi diinginkan. `want` berurut dari yang paling penting. */
  request(want: TileId[]) {
    if (!this.source) return;
    const wanted = new Set(want.map((t) => this.key(t)));
    for (const [key, c] of this.pending) {
      if (!wanted.has(key)) {
        c.abort();
        this.pending.delete(key);
      }
    }
    const now = performance.now();
    for (const t of want) {
      if (this.pending.size >= MAX_REQUESTS) break;
      const key = this.key(t);
      if (this.tiles.has(key) || this.pending.has(key)) continue;
      if (now - (this.failedAt.get(key) ?? -Infinity) < RETRY_MS) continue;
      void this.load(t, key);
    }
  }

  private async load(t: TileId, key: string) {
    const control = new AbortController();
    this.pending.set(key, control);
    try {
      const res = await fetch(tileUrl(this.source, t, this.frame), { signal: control.signal, mode: "cors" });
      if (!res.ok) throw new Error(`tile ${res.status}`);
      const bitmap = await createImageBitmap(await res.blob(), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
      if (this.disposed || control.signal.aborted) return;
      const gl = this.gl;
      const texture = this.texture();
      const pixels = this.read(bitmap);
      let gap = 0;
      if (pixels) {
        const made = tilePixels(pixels.data, pixels.width, pixels.height);
        gap = made.gap;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE_ALPHA, pixels.width, pixels.height, 0, gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE, made.data);
      } else {
        // Tanpa kanvas 2D pikselnya tidak bisa dibaca: potongan dipakai apa adanya.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, bitmap);
      }
      bitmap.close();
      const now = performance.now();
      this.tiles.set(key, { texture, loadedAt: now, usedAt: now, id: t, gap });
      this.failures = 0;
      this.trim();
    } catch (err) {
      if (control.signal.aborted) return;
      this.failedAt.set(key, performance.now());
      this.failures++;
      console.warn("sky tile", t, err);
    } finally {
      if (this.pending.get(key) === control) this.pending.delete(key);
      if (!this.disposed) this.onChange();
    }
  }

  /** Piksel satu potongan (RGBA), dibaca lewat kanvas 2D. */
  private read(bitmap: ImageBitmap): ImageData | undefined {
    if (this.scratch === undefined) {
      const canvas = typeof OffscreenCanvas === "undefined" ? document.createElement("canvas") : new OffscreenCanvas(bitmap.width, bitmap.height);
      this.scratch = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    }
    const ctx = this.scratch;
    if (!ctx) return undefined;
    if (ctx.canvas.width !== bitmap.width || ctx.canvas.height !== bitmap.height) {
      ctx.canvas.width = bitmap.width;
      ctx.canvas.height = bitmap.height;
    }
    ctx.globalCompositeOperation = "copy";
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  }

  /** Buang potongan yang paling lama tidak dipakai kalau tembolok penuh. */
  private trim() {
    if (this.tiles.size <= this.capacity) return;
    const oldest = [...this.tiles.entries()].sort((a, b) => a[1].usedAt - b[1].usedAt);
    for (const [key, tile] of oldest.slice(0, this.tiles.size - this.capacity)) {
      this.gl.deleteTexture(tile.texture);
      this.tiles.delete(key);
    }
  }

  private shape(t: TileId): Shape {
    const key = `${t.order}:${t.ipix}`;
    let s = this.shapes.get(key);
    if (!s) {
      const gl = this.gl;
      const mesh = tileMesh(t);
      const buffer = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
      s = { buffer, centre: mesh.centre };
      if (this.shapes.size > 600) {
        const first = this.shapes.keys().next().value!;
        gl.deleteBuffer(this.shapes.get(first)!.buffer);
        this.shapes.delete(first);
      }
      this.shapes.set(key, s);
    }
    return s;
  }

  /** Gambar satu bingkai. `m`: baris = sumbu pandangan dalam ICRS. `maxOrder`: potongan
   *  yang lebih dalam dari ini tidak digambar (terlalu kecil di layar). `alpha`: untuk
   *  melarutkan seluruh peta. Mengembalikan true kalau masih ada yang beranimasi. */
  draw(m: number[], zoom: number, width: number, height: number, maxOrder: number, alpha = 1): boolean {
    const gl = this.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.newMap || !this.oldMap) return false;
    const now = performance.now();
    let moving = false;

    // Lapis dasar.
    const g = this.galactic;
    // uInv = G x M^T: dari kerangka pandangan ke ICRS (M^T), lalu ke galaktik (G).
    const inv: number[] = [];
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) inv.push(g[r * 3] * m[c * 3] + g[r * 3 + 1] * m[c * 3 + 1] + g[r * 3 + 2] * m[c * 3 + 2]);
    const mix = this.mapFadeMs ? Math.min(1, (now - this.mapSwappedAt) / this.mapFadeMs) : 1;
    if (mix < 1) moving = true;
    gl.useProgram(this.base);
    const bu = (n: string) => gl.getUniformLocation(this.base, n);
    gl.uniformMatrix3fv(bu("uInv"), false, columns(inv));
    gl.uniform1f(bu("uZoom"), zoom);
    gl.uniform1f(bu("uEdge"), 6 / (width * zoom));
    gl.uniform1f(bu("uMix"), mix);
    gl.uniform1f(bu("uAlpha"), alpha);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.oldMap);
    gl.uniform1i(bu("uOld"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.newMap);
    gl.uniform1i(bu("uNew"), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.lut);
    gl.uniform1i(bu("uLut"), 2);
    const aPos = gl.getAttribLocation(this.base, "aPos");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(aPos);

    // Potongan: hanya pada zoom yang tepi langitnya sudah di luar layar.
    this.lastGap = 0;
    if (zoom < 1.5 || maxOrder < 1) return moving;
    const centre: V3 = [m[0], m[1], m[2]];
    // Setengah diagonal medan, dengan batas atas supaya tidak mendekati sambungan proyeksi.
    const reach = Math.min((125 * Math.PI) / 180, (3.4 / zoom) * 1.05);
    const shown: { tile: Tile; shape: Shape; near: boolean }[] = [];
    const prefix = `${this.frame}:`;
    for (const [key, tile] of this.tiles) {
      if (!key.startsWith(prefix) || tile.id.order > maxOrder) continue;
      const shape = this.shape(tile.id);
      const cos = shape.centre[0] * centre[0] + shape.centre[1] * centre[1] + shape.centre[2] * centre[2];
      const away = Math.acos(Math.max(-1, Math.min(1, cos)));
      if (away > reach + tileRadius(tile.id.order)) continue;
      tile.usedAt = now;
      shown.push({ tile, shape, near: away <= reach });
    }
    shown.sort((a, b) => a.tile.id.order - b.tile.id.order);
    this.lastShown = shown.length;
    const sharpest = shown.length ? shown[shown.length - 1].tile.id.order : 0;
    // Hanya potongan yang pusatnya di dalam medan: yang cuma menyentuh tepi layar tidak dihitung.
    for (const s of shown) if (s.near && s.tile.id.order === sharpest) this.lastGap = Math.max(this.lastGap, s.tile.gap);
    gl.useProgram(this.tile);
    const tu = (n: string) => gl.getUniformLocation(this.tile, n);
    gl.uniformMatrix3fv(tu("uM"), false, columns(m));
    gl.uniform1f(tu("uZoom"), zoom);
    gl.uniform1i(tu("uTex"), 0);
    gl.uniform1i(tu("uLut"), 2);
    gl.uniform1f(tu("uHatch"), 10 * Math.min(2, window.devicePixelRatio || 1));
    const aDir = gl.getAttribLocation(this.tile, "aDir");
    const aUv = gl.getAttribLocation(this.tile, "aUv");
    gl.enableVertexAttribArray(aDir);
    gl.enableVertexAttribArray(aUv);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indices);
    gl.activeTexture(gl.TEXTURE0);
    for (const { tile, shape } of shown) {
      const fade = Math.min(1, (now - tile.loadedAt) / FADE_MS);
      if (fade < 1) moving = true;
      gl.uniform1f(tu("uAlpha"), fade * alpha);
      gl.bindTexture(gl.TEXTURE_2D, tile.texture);
      gl.bindBuffer(gl.ARRAY_BUFFER, shape.buffer);
      gl.vertexAttribPointer(aDir, 3, gl.FLOAT, false, 20, 0);
      gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 20, 12);
      gl.drawElements(gl.TRIANGLES, MESH_N * MESH_N * 6, gl.UNSIGNED_SHORT, 0);
    }
    gl.disableVertexAttribArray(aDir);
    gl.disableVertexAttribArray(aUv);
    return moving;
  }

  dispose() {
    this.disposed = true;
    for (const c of this.pending.values()) c.abort();
    this.pending.clear();
    // Konteksnya tidak dilepas paksa: kanvas yang sama bisa dipakai perender berikutnya.
    const gl = this.gl;
    for (const t of this.tiles.values()) gl.deleteTexture(t.texture);
    for (const sh of this.shapes.values()) gl.deleteBuffer(sh.buffer);
    this.tiles.clear();
    this.shapes.clear();
    for (const t of [this.lut, this.oldMap, this.newMap]) if (t) gl.deleteTexture(t);
  }
}
