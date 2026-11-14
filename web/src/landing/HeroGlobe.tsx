import { useEffect, useRef, useState, type RefObject } from "react";
import { atlasUrl, constellationAt, decDms, loadAtlas, raHms, type Atlas } from "../lib/allsky";
import { prefersReducedMotion } from "../lib/hooks";
import { paint } from "../lib/paint";
import { APP_PATH, placeHref } from "../route";
import { EMBER, imageOf } from "./data";

// Bola langit di hero: peta seluruh langit SPHEREx DR1 yang asli, dibungkus ke bola dan
// diputar pelan di kutub galaksi. Langitnya tampak seperti dilihat dari Bumi (timur di
// kiri), jadi rasi yang dikenal tidak terbalik, sama dengan peta di aplikasi.
//
// Ukuran bola mengikuti layar: di layar lebar jari-jarinya 0,59 kali lebar layar, dan yang
// terlihat hanya tudung atasnya, seperti planet yang terbit di bawah judul.
//
// Bolanya bisa dipegang: diseret ke segala arah (dengan momentum), ditunjuk untuk membaca rasi
// dan koordinat di bawah kursor, dan diklik untuk membidik titik itu lalu membukanya di aplikasi.
// Setelah dilepas, ia pelan-pelan tegak kembali dan berputar sendiri lagi. Bintang di latar
// adalah bintang sungguhan (titik-titik garis rasi di manifest), di posisi langitnya.

export type GlobePin = { id: string; name: string; short: string; ra: number; dec: number; image?: string };

type V3 = [number, number, number];
type M3 = number[]; // 9 angka, baris demi baris

const RAD = Math.PI / 180;
/** Kemiringan: pusat galaksi di puncak tudung, pita Bima Sakti hampir mendatar. */
const TILT = 41 * RAD;
/** Putaran: satu putaran penuh dalam 12 menit. */
const SPIN_DEG_PER_S = 0.5;
/** Ruang di atas bola untuk cahaya tepinya, piksel CSS. */
const HALO = 170;

const mul = (a: M3, b: M3): M3 => {
  const o = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return o;
};
const transpose = (a: M3): M3 => [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
const rotX = (t: number): M3 => [1, 0, 0, 0, Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t)];
const rotY = (t: number): M3 => [Math.cos(t), 0, Math.sin(t), 0, 1, 0, -Math.sin(t), 0, Math.cos(t)];
const rotZ = (t: number): M3 => [Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t), 0, 0, 0, 1];

/** Layar ke galaktik pada saat putaran `spin` dan kemiringan kursor (yaw, pitch).
 *  Baris kedua bertanda minus: timur di kiri, seperti langit dilihat dari Bumi. */
function viewToGalactic(spin: number, yaw: number, pitch: number): M3 {
  const ct = Math.cos(TILT);
  const st = Math.sin(TILT);
  const A: M3 = [0, ct, st, -1, 0, 0, 0, st, -ct];
  const tilt = mul(rotY(yaw), rotX(pitch));
  return mul(mul(rotZ(spin), A), transpose(tilt));
}

const unit = (ra: number, dec: number): V3 => {
  const c = Math.cos(dec * RAD);
  return [c * Math.cos(ra * RAD), c * Math.sin(ra * RAD), Math.sin(dec * RAD)];
};
const toGalactic = (atlas: Atlas, v: V3): V3 => {
  const m = atlas.projection.icrs_to_galactic;
  return [0, 1, 2].map((r) => m[r][0] * v[0] + m[r][1] * v[1] + m[r][2] * v[2]) as V3;
};

// ---------- WebGL ----------

const VERT = `attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FRAG = `
precision highp float;
uniform sampler2D uMap;
uniform sampler2D uLut;
uniform vec2 uSize;
uniform vec3 uSphere;
uniform mat3 uRot;
uniform float uPx;
uniform float uFade;
void main() {
  vec2 q = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  vec2 d = (q - uSphere.xy) / uSphere.z;
  d.y = -d.y;
  float r = length(d);
  float dist = (r - 1.0) * uSphere.z / uPx;
  vec3 col = vec3(0.0);
  float a = 0.0;
  if (r < 1.0 + 2.0 * uPx / uSphere.z) {
    vec2 e = r > 1.0 ? d / r : d;
    float z = sqrt(max(0.0, 1.0 - dot(e, e)));
    vec3 g = uRot * vec3(e, z);
    float gz = clamp(g.z, -1.0, 1.0);
    float lam = -atan(g.y, g.x);
    float cb = sqrt(max(0.0, 1.0 - gz * gz));
    float k = sqrt(1.0 + cb * cos(lam * 0.5));
    vec2 uv = vec2(0.5 + 0.498 * cb * sin(lam * 0.5) / k, 0.5 - 0.5 * gz / k);
    float v = texture2D(uMap, uv).r;
    vec3 c = texture2D(uLut, vec2(v * 0.99609375 + 0.001953125, 0.5)).rgb;
    float shade = 0.25 + 0.75 * pow(z, 0.55);
    col = mix(vec3(0.012, 0.012, 0.024), c * shade, uFade);
    a = clamp(0.5 - dist * uPx, 0.0, 1.0);
  }
  float out_ = max(dist, 0.0);
  float rimA = 0.85 * exp(-pow(dist / 1.15, 2.0));
  // Cahaya luar memudar ke nol sebelum tepi atas kanvas, supaya tidak terpotong lurus.
  float edge = smoothstep(0.0, 120.0 * uPx, q.y);
  float h1 = 0.42 * exp(-out_ / 24.0) * edge;
  float h2 = 0.20 * exp(-out_ / 95.0) * edge;
  vec3 rimC = vec3(1.0, 0.84, 0.63);
  vec3 h1C = vec3(1.0, 0.59, 0.24);
  vec3 h2C = vec3(1.0, 0.47, 0.16);
  // Semua warna premultiplied: langit di bawah, cahaya tepi di luarnya, garis tepi di atas.
  vec3 haloP = h1C * h1 + h2C * h2 * (1.0 - h1);
  float haloA = h1 + h2 * (1.0 - h1);
  vec3 baseP = col * a + haloP * (1.0 - a);
  float baseA = a + haloA * (1.0 - a);
  gl_FragColor = vec4(rimC * rimA + baseP * (1.0 - rimA), rimA + baseA * (1.0 - rimA));
}`;

type Gl = {
  draw: (rot: M3, cx: number, cy: number, r: number, px: number, fade: number) => void;
  setMap: (img: HTMLImageElement) => void;
  dispose: () => void;
};

function makeGl(canvas: HTMLCanvasElement): Gl | undefined {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return undefined;
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  let prog: WebGLProgram;
  try {
    prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
  } catch (err) {
    console.error(err);
    return undefined;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "aPos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const texture = (unitIndex: number) => {
    const t = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unitIndex);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const mapTex = texture(0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  const lutTex = texture(1);
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    lut[i * 4] = EMBER[i * 3];
    lut[i * 4 + 1] = EMBER[i * 3 + 1];
    lut[i * 4 + 2] = EMBER[i * 3 + 2];
    lut[i * 4 + 3] = 255;
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lut);

  const u = (name: string) => gl.getUniformLocation(prog, name);
  gl.uniform1i(u("uMap"), 0);
  gl.uniform1i(u("uLut"), 1);
  const uSize = u("uSize");
  const uSphere = u("uSphere");
  const uRot = u("uRot");
  const uPx = u("uPx");
  const uFade = u("uFade");

  return {
    setMap(img) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, mapTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    },
    draw(rot, cx, cy, r, px, fade) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uSize, canvas.width, canvas.height);
      gl.uniform3f(uSphere, cx * px, cy * px, r * px);
      // GLSL membaca matriks kolom demi kolom: kirim transposnya.
      gl.uniformMatrix3fv(uRot, false, new Float32Array(transpose(rot)));
      gl.uniform1f(uPx, px);
      gl.uniform1f(uFade, fade);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      gl.deleteTexture(mapTex);
      gl.deleteTexture(lutTex);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    },
  };
}

/** Tanpa WebGL: bola yang sama dilukis sekali di CPU, tanpa putaran. */
function paintCpu(canvas: HTMLCanvasElement, map: HTMLImageElement, rot: M3, cx: number, cy: number, r: number) {
  const W = canvas.width;
  const H = canvas.height;
  const mc = document.createElement("canvas");
  mc.width = map.naturalWidth;
  mc.height = map.naturalHeight;
  const mx = mc.getContext("2d", { willReadFrequently: true })!;
  mx.drawImage(map, 0, 0);
  const md = mx.getImageData(0, 0, mc.width, mc.height).data;
  const ctx = canvas.getContext("2d")!;
  const out = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const X = (x + 0.5 - cx) / r;
      const Y = (cy - (y + 0.5)) / r;
      const r2 = X * X + Y * Y;
      if (r2 >= 1) continue;
      const Z = Math.sqrt(1 - r2);
      const gx = rot[0] * X + rot[1] * Y + rot[2] * Z;
      const gy = rot[3] * X + rot[4] * Y + rot[5] * Z;
      const gz = Math.max(-1, Math.min(1, rot[6] * X + rot[7] * Y + rot[8] * Z));
      const lam = -Math.atan2(gy, gx);
      const cb = Math.sqrt(Math.max(0, 1 - gz * gz));
      const k = Math.sqrt(1 + cb * Math.cos(lam / 2));
      const px = Math.min(mc.width - 1, Math.max(0, Math.round((0.5 + (0.498 * cb * Math.sin(lam / 2)) / k) * mc.width)));
      const py = Math.min(mc.height - 1, Math.max(0, Math.round((0.5 - (0.5 * gz) / k) * mc.height)));
      const v = md[(py * mc.width + px) * 4] * 3;
      const shade = 0.25 + 0.75 * Math.pow(Z, 0.55);
      const i = (y * W + x) * 4;
      out.data[i] = EMBER[v] * shade;
      out.data[i + 1] = EMBER[v + 1] * shade;
      out.data[i + 2] = EMBER[v + 2] * shade;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
}

type Geometry = {
  w: number;
  h: number;
  /** Jarak tepi atas pembungkus bola dari tepi atas hero. */
  top: number;
  cx: number;
  cy: number;
  r: number;
  hidePinsBelow: number;
  /** Elips blok teks hero (koordinat hero): bintang latar dikosongkan di situ. */
  text: { cx: number; cy: number; rx: number; ry: number };
};

type Props = {
  pins: GlobePin[];
  /** Elemen yang bagian bawahnya menjadi batas atas bola (deretan tombol hero). */
  above: RefObject<HTMLElement | null>;
  /** Tinggi bagian bawah bola yang tertutup deretan angka; penanda di sana disembunyikan. */
  covered: number;
};

type AimPoint = { ra: number; dec: number; name: string; g: V3 };

const apply = (m: M3, v: V3): V3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
/** Rotasi sebesar `a` radian mengelilingi sumbu satuan `k` (rumus Rodrigues). */
const axisAngle = (k: V3, a: number): M3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const t = 1 - c;
  const [x, y, z] = k;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
};
const toRaDec = (atlas: Atlas, g: V3) => {
  const m = atlas.projection.icrs_to_galactic;
  const v = [0, 1, 2].map((i) => m[0][i] * g[0] + m[1][i] * g[1] + m[2][i] * g[2]);
  return { ra: ((Math.atan2(v[1], v[0]) / RAD) + 360) % 360, dec: Math.asin(Math.max(-1, Math.min(1, v[2]))) / RAD };
};
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function HeroGlobe({ pins, above, covered }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const starCanvas = useRef<HTMLCanvasElement>(null);
  const glCanvas = useRef<HTMLCanvasElement>(null);
  const lineCanvas = useRef<HTMLCanvasElement>(null);
  const pinRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const readRef = useRef<HTMLDivElement>(null);
  const aimRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [dragged, setDragged] = useState(false);
  const [aim, setAim] = useState<AimPoint>();
  const aimPoint = useRef<AimPoint | undefined>(undefined);
  aimPoint.current = aim;
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  // Penanda dan bidikan datang belakangan; tanpa gerak (gerak dikurangi) lukisan perlu dipicu ulang.
  const kick = useRef<() => void>(undefined);
  useEffect(() => kick.current?.(), [pins, aim]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = glCanvas.current;
    const lines = lineCanvas.current;
    const stars = starCanvas.current;
    const hero = wrap?.parentElement;
    if (!wrap || !canvas || !lines || !stars || !hero) return;
    let alive = true;
    let raf = 0;
    let visible = true;
    const gl = makeGl(canvas);
    // Tanpa WebGL langitnya dilukis sekali, jadi tidak ada putaran dan tidak bisa diseret.
    const reduced = prefersReducedMotion() || !gl;
    setInteractive(!!gl);
    let atlas: Atlas | undefined;
    let map: HTMLImageElement | undefined;
    let figures: { abbr: string; line: Float32Array }[] = [];
    let starVecs: V3[] = [];
    let geo: Geometry | undefined;
    let fade = 0;
    let fadeStart = 0;
    let last = performance.now();

    // Orientasi: galaktik = Q · pandangan. Mulai dari kemiringan rumah, Bima Sakti hampir mendatar.
    let Q = viewToGalactic(0, 0, 0);
    const HOME_POLE: V3 = [Q[6], Q[7], Q[8]];
    const C0 = apply(Q, [0, 0, 1]);
    const B0 = Math.asin(C0[2]);
    const vel = { x: 0, y: 0 }; // radian per milidetik
    const drag = { on: false, id: -1, x: 0, y: 0, moved: 0, t: 0 };
    let idleSince = -Infinity;
    const pointer = { in: false, x: 0, y: 0 };

    const turn = (dx: number, dy: number) => {
      // Seret ke kanan: permukaan depan ikut ke kanan (putar di sumbu y layar); ke bawah: sumbu x.
      Q = mul(Q, transpose(mul(rotY(dx), rotX(dy))));
    };

    const layout = () => {
      const heroBox = hero.getBoundingClientRect();
      // Letak tata letak, bukan getBoundingClientRect: deretan tombol masih bergeser oleh
      // animasi masuk saat ini dihitung.
      const el = above.current;
      const w = heroBox.width;
      const wide = w >= 900;
      const r = wide ? Math.max(620, w * 0.59) : Math.max(360, w * 1.0);
      const ctaBottom = el ? el.offsetTop + el.offsetHeight : heroBox.height * 0.5;
      const top = ctaBottom + (wide ? 30 : 36);
      const wrapTop = top - HALO;
      const h = Math.max(120, heroBox.height - wrapTop);
      wrap.style.top = `${wrapTop}px`;
      wrap.style.height = `${h}px`;
      const px = Math.min(2, window.devicePixelRatio || 1);
      for (const c of [canvas, lines]) {
        c.width = Math.round(w * px);
        c.height = Math.round(h * px);
        c.style.width = `${w}px`;
        c.style.height = `${h}px`;
      }
      stars.width = Math.round(w * px);
      stars.height = Math.round(heroBox.height * px);
      stars.style.width = `${w}px`;
      stars.style.height = `${heroBox.height}px`;
      const textTop = 70;
      geo = {
        w,
        h,
        top: wrapTop,
        cx: w / 2,
        cy: HALO + r,
        r,
        hidePinsBelow: h - covered - 20,
        text: { cx: w / 2, cy: (textTop + ctaBottom) / 2, rx: Math.min(w * 0.46, 660), ry: (ctaBottom - textTop) / 2 + 26 },
      };
    };

    /** Titik pandangan (satuan) di bawah posisi pembungkus (x, y), atau tidak ada kalau di luar bola. */
    const viewAt = (x: number, y: number): V3 | undefined => {
      if (!geo) return undefined;
      const X = (x - geo.cx) / geo.r;
      const Y = (geo.cy - y) / geo.r;
      const d = X * X + Y * Y;
      if (d >= 0.985 || y > geo.hidePinsBelow + 20) return undefined;
      return [X, Y, Math.sqrt(1 - d)];
    };

    const drawStars = (now: number) => {
      if (!geo) return;
      const px = Math.min(2, window.devicePixelRatio || 1);
      const ctx = stars.getContext("2d")!;
      ctx.setTransform(px, 0, 0, px, 0, 0);
      const W = geo.w;
      const H = stars.height / px;
      ctx.clearRect(0, 0, W, H);
      if (!starVecs.length) return;
      // Langit nyata dalam proyeksi galaktik; pusatnya mengikuti bujur yang sedang menghadap ke kita,
      // jadi latar ikut bergeser saat bola diputar atau diseret.
      const c = apply(Q, [0, 0, 1]);
      const lc = Math.atan2(c[1], c[0]);
      const bc = Math.asin(Math.max(-1, Math.min(1, c[2]))) - B0;
      const k = (W / 200) / RAD;
      const cy0 = H * 0.3;
      const t = now / 1000;
      const T = geo.text;
      ctx.fillStyle = "#fff6e6";
      for (let i = 0; i < starVecs.length; i++) {
        const g = starVecs[i];
        let dl = Math.atan2(g[1], g[0]) - lc;
        dl = Math.atan2(Math.sin(dl), Math.cos(dl));
        const x = W / 2 - dl * k;
        const y = cy0 - (Math.asin(g[2]) - bc * 0.6) * k;
        if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue;
        const ex = (x - T.cx) / T.rx;
        const ey = (y - T.cy) / T.ry;
        const clear = smooth(0.82, 1.15, Math.sqrt(ex * ex + ey * ey));
        const tw = reduced ? 0.8 : 0.62 + 0.38 * Math.sin(t * (0.6 + (i % 7) * 0.17) + i * 2.4);
        const a = 0.78 * tw * (0.1 + 0.9 * clear);
        if (a < 0.02) continue;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(x, y, 0.95, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const frame = (now: number) => {
      raf = 0;
      if (!alive || !geo) return;
      const dt = Math.min(64, now - last);
      last = now;
      const px = Math.min(2, window.devicePixelRatio || 1);
      let settling = false;
      if (!drag.on && gl) {
        const speed = Math.hypot(vel.x, vel.y);
        if (speed > 2e-6) {
          // Momentum sesudah dilepas, melambat.
          turn(vel.x * dt, vel.y * dt);
          const decay = Math.pow(0.94, dt / 16.7);
          vel.x *= decay;
          vel.y *= decay;
          settling = true;
        } else if (!reduced && now - idleSince > 2600) {
          // Diam: berputar sendiri di kutub galaksi, dan pelan-pelan tegak kembali.
          Q = mul(rotZ(SPIN_DEG_PER_S * RAD * (dt / 1000)), Q);
          const cur: V3 = [Q[6], Q[7], Q[8]];
          const dot = Math.max(-1, Math.min(1, cur[0] * HOME_POLE[0] + cur[1] * HOME_POLE[1] + cur[2] * HOME_POLE[2]));
          const ang = Math.acos(dot);
          if (ang > 1e-4) {
            const ax: V3 = [cur[1] * HOME_POLE[2] - cur[2] * HOME_POLE[1], cur[2] * HOME_POLE[0] - cur[0] * HOME_POLE[2], cur[0] * HOME_POLE[1] - cur[1] * HOME_POLE[0]];
            const n = Math.hypot(...ax);
            if (n > 1e-9) Q = mul(Q, transpose(axisAngle([ax[0] / n, ax[1] / n, ax[2] / n], Math.min(ang, ang * 0.025 * (dt / 16.7)))));
          }
        }
      }
      if (map && fadeStart === 0) fadeStart = now;
      fade = map ? (reduced ? 1 : Math.min(1, (now - fadeStart) / 900)) : 0;
      if (fade < 1) settling = true;
      if (gl) gl.draw(Q, geo.cx, geo.cy, geo.r, px, fade);
      drawStars(now);

      // Garis rasi, penanda, bidikan: proyeksi yang sama, kebalikan dari Q.
      const inv = transpose(Q);
      const project = (g: V3) => {
        const s = apply(inv, g);
        return { x: geo!.cx + s[0] * geo!.r, y: geo!.cy - s[1] * geo!.r, z: s[2] };
      };
      // Rasi yang ditunjuk atau dibidik menyala.
      let lit = "";
      let hoverInfo: { name: string; ra: number; dec: number } | undefined;
      if (atlas && pointer.in && !drag.on) {
        const v = viewAt(pointer.x, pointer.y);
        if (v) {
          const at = toRaDec(atlas, apply(Q, v));
          const abbr = constellationAt(atlas, at.ra, at.dec);
          lit = abbr;
          hoverInfo = { name: atlas.constellations.names[abbr] ?? abbr, ...at };
        }
      }
      const aimNow = aimPoint.current;
      const aimAbbr = aimNow && atlas ? constellationAt(atlas, aimNow.ra, aimNow.dec) : "";
      const ctx = lines.getContext("2d")!;
      ctx.setTransform(px, 0, 0, px, 0, 0);
      ctx.clearRect(0, 0, geo.w, geo.h);
      if (fade > 0) {
        ctx.lineJoin = "round";
        for (const pass of [0, 1]) {
          ctx.globalAlpha = fade;
          ctx.lineWidth = pass ? 1.7 : 1.1;
          ctx.strokeStyle = pass ? "rgba(255, 196, 120, 0.95)" : "rgba(255, 206, 150, 0.34)";
          ctx.shadowColor = "rgba(255, 160, 60, 0.9)";
          ctx.shadowBlur = pass ? 8 : 0;
          ctx.beginPath();
          for (const { abbr, line } of figures) {
            const on = abbr === lit || abbr === aimAbbr;
            if ((pass === 1) !== on) continue;
            let pen = false;
            for (let i = 0; i < line.length; i += 3) {
              const q = project([line[i], line[i + 1], line[i + 2]]);
              if (q.z < 0.06) {
                pen = false;
                continue;
              }
              if (pen) ctx.lineTo(q.x, q.y);
              else ctx.moveTo(q.x, q.y);
              pen = true;
            }
          }
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
      // Bacaan di kursor, sama dengan bacaan peta seluruh langit di aplikasi.
      const read = readRef.current;
      if (read) {
        if (hoverInfo) {
          const text = `${hoverInfo.name}|${raHms(hoverInfo.ra)}|${decDms(hoverInfo.dec)}`;
          if (read.dataset.text !== text) {
            read.dataset.text = text;
            const [n, r, d] = text.split("|");
            (read.children[0] as HTMLElement).textContent = n;
            (read.children[1] as HTMLElement).textContent = `${r}  ${d}`;
          }
          const flip = pointer.x > geo.w - 260;
          read.style.transform = `translate(${(flip ? pointer.x - 22 : pointer.x + 22).toFixed(1)}px, ${(pointer.y - 30).toFixed(1)}px) translateX(${flip ? "-100%" : "0"})`;
          read.dataset.on = "true";
        } else read.dataset.on = "false";
      }
      const aimEl = aimRef.current;
      if (aimEl) {
        if (aimNow) {
          const q = project(aimNow.g);
          const shown = q.z > 0.08 && q.y < geo.hidePinsBelow;
          aimEl.style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px)`;
          aimEl.dataset.on = String(shown);
          aimEl.dataset.flip = String(q.x > geo.w - 280);
        } else aimEl.dataset.on = "false";
      }
      if (atlas) {
        pinsRef.current.forEach((pin, i) => {
          const el = pinRefs.current[i];
          if (!el || !geo) return;
          const q = project(toGalactic(atlas!, unit(pin.ra, pin.dec)));
          const inside = q.z > 0.1 && q.y > HALO + 24 && q.y < geo.hidePinsBelow && q.x > 24 && q.x < geo.w - 220;
          const o = inside ? Math.min(1, (q.z - 0.1) / 0.15) * fade : 0;
          el.style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px)`;
          el.style.opacity = o.toFixed(3);
          el.style.visibility = o > 0.02 ? "visible" : "hidden";
        });
      }
      if (visible && (!reduced || settling || drag.on)) raf = requestAnimationFrame(frame);
    };
    const schedule = () => {
      if (!raf && alive) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    layout();
    schedule();
    kick.current = schedule;
    // Huruf yang baru termuat menggeser deretan tombol tanpa mengubah ukuran hero.
    document.fonts?.ready.then(() => {
      if (!alive) return;
      layout();
      schedule();
    });
    const ro = new ResizeObserver(() => {
      layout();
      if (!gl && map && geo && atlas) paintCpu(canvas, map, Q, geo.cx * (canvas.width / geo.w), geo.cy * (canvas.width / geo.w), geo.r * (canvas.width / geo.w));
      schedule();
    });
    ro.observe(hero);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) schedule();
    });
    io.observe(wrap);
    const onVisibility = () => {
      visible = !document.hidden;
      if (visible) schedule();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // ---------- memegang bola ----------
    const local = (e: PointerEvent) => {
      const box = wrap.getBoundingClientRect();
      return { x: e.clientX - box.left, y: e.clientY - box.top };
    };
    const onControl = (e: PointerEvent) => !!(e.target as Element | null)?.closest?.("a, button, .lp-aim-card");
    const onMove = (e: PointerEvent) => {
      if (!gl) return;
      const p = local(e);
      if (drag.on && e.pointerId === drag.id) {
        const dx = p.x - drag.x;
        const dy = p.y - drag.y;
        const now = performance.now();
        const dtm = Math.max(1, now - drag.t);
        drag.x = p.x;
        drag.y = p.y;
        drag.t = now;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        if (geo) {
          turn(dx / geo.r, dy / geo.r);
          vel.x = (dx / geo.r) / dtm;
          vel.y = (dy / geo.r) / dtm;
        }
        schedule();
        return;
      }
      pointer.x = p.x;
      pointer.y = p.y;
      pointer.in = e.pointerType === "mouse" && !onControl(e) && !!viewAt(p.x, p.y);
      hero.style.cursor = pointer.in ? "grab" : "";
      schedule();
    };
    const onDown = (e: PointerEvent) => {
      if (!gl || e.button !== 0 || onControl(e)) return;
      const p = local(e);
      if (!viewAt(p.x, p.y)) return;
      drag.on = true;
      drag.id = e.pointerId;
      drag.x = p.x;
      drag.y = p.y;
      drag.t = performance.now();
      drag.moved = 0;
      vel.x = vel.y = 0;
      hero.setPointerCapture?.(e.pointerId);
      hero.style.cursor = "grabbing";
      if (e.pointerType === "mouse") e.preventDefault();
      schedule();
    };
    const onUp = (e: PointerEvent) => {
      if (!drag.on || e.pointerId !== drag.id) return;
      drag.on = false;
      hero.style.cursor = pointer.in ? "grab" : "";
      // Lepas setelah diam sebentar: tanpa momentum.
      if (performance.now() - drag.t > 90) vel.x = vel.y = 0;
      if (drag.moved < 6) {
        vel.x = vel.y = 0;
        const v = viewAt(drag.x, drag.y);
        if (v && atlas) {
          const g = apply(Q, v);
          const at = toRaDec(atlas, g);
          const abbr = constellationAt(atlas, at.ra, at.dec);
          setAim({ ...at, g, name: atlas.constellations.names[abbr] ?? abbr });
        }
      } else {
        idleSince = performance.now();
        setDragged(true);
      }
      schedule();
    };
    // Browser mengambil alih (misalnya halaman digulir di ponsel): bukan klik, bukan lemparan.
    const onCancel = (e: PointerEvent) => {
      if (!drag.on || e.pointerId !== drag.id) return;
      drag.on = false;
      vel.x = vel.y = 0;
      idleSince = performance.now();
      hero.style.cursor = "";
      schedule();
    };
    const onLeave = () => {
      pointer.in = false;
      if (!drag.on) hero.style.cursor = "";
      schedule();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAim(undefined);
    };
    hero.addEventListener("pointermove", onMove);
    hero.addEventListener("pointerdown", onDown);
    hero.addEventListener("pointerup", onUp);
    hero.addEventListener("pointercancel", onCancel);
    hero.addEventListener("pointerleave", onLeave);
    window.addEventListener("keydown", onKey);

    const small = window.innerWidth * (window.devicePixelRatio || 1) < 1000;
    loadAtlas()
      .then((a) => {
        if (!alive) return;
        atlas = a;
        figures = Object.entries(a.constellations.lines).flatMap(([abbr, parts]) =>
          parts.map((line) => {
            const out = new Float32Array(line.length * 3);
            line.forEach(([ra, dec], i) => out.set(toGalactic(a, unit(ra, dec)), i * 3));
            return { abbr, line: out };
          }),
        );
        // Bintang latar: titik-titik garis rasi, sekali saja per bintang.
        const seen = new Set<string>();
        starVecs = [];
        for (const parts of Object.values(a.constellations.lines))
          for (const line of parts)
            for (const [ra, dec] of line) {
              const key = `${ra.toFixed(3)},${dec.toFixed(3)}`;
              if (seen.has(key)) continue;
              seen.add(key);
              starVecs.push(toGalactic(a, unit(ra, dec)));
            }
        const frameD5 = a.frames.find((f) => f.band === "D5") ?? a.frames[0];
        // Peta kecil (220 KB) dulu supaya langit cepat muncul; di layar lebar peta penuh
        // (660 KB) menyusul dan menggantikannya tanpa larut ulang.
        const load = (url: string, first: boolean) => {
          const img = new Image();
          img.decoding = "async";
          img.onload = () => {
            if (!alive) return;
            map = img;
            if (gl) gl.setMap(img);
            else if (geo) {
              const k = canvas.width / geo.w;
              paintCpu(canvas, img, Q, geo.cx * k, geo.cy * k, geo.r * k);
            }
            if (first) {
              setReady(true);
              if (!small) load(atlasUrl(frameD5.image), false);
            }
            schedule();
          };
          img.src = url;
        };
        load(atlasUrl(frameD5.small), true);
      })
      .catch((err) => console.error(err));

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      hero.removeEventListener("pointermove", onMove);
      hero.removeEventListener("pointerdown", onDown);
      hero.removeEventListener("pointerup", onUp);
      hero.removeEventListener("pointercancel", onCancel);
      hero.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("keydown", onKey);
      hero.style.cursor = "";
      gl?.dispose();
    };
  }, [above, covered]);

  /** Cuplikan citra asli penanda, dilukis saat pertama kali ditunjuk. */
  const thumb = (pin: GlobePin, el: HTMLCanvasElement | null) => {
    if (!el || !pin.image || el.dataset.done) return;
    el.dataset.done = "1";
    imageOf(pin.image)
      .then((img) => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        paint(el, img, EMBER, 128, undefined, { x: w * 0.25, y: h * 0.25, w: w * 0.5, h: h * 0.5 });
        el.dataset.ready = "true";
      })
      .catch(() => undefined);
  };

  return (
    <>
      <canvas ref={starCanvas} className="lp-stars" aria-hidden="true" />
      <div ref={wrapRef} className="lp-globe" data-ready={ready} data-interactive={interactive}>
        <canvas
          ref={glCanvas}
          className="lp-globe-sky"
          role="img"
          aria-label="The whole sky as NASA's SPHEREx mapped it, wrapped onto a globe you can turn, with the constellation figures drawn on it."
        />
        <canvas ref={lineCanvas} className="lp-globe-lines" aria-hidden="true" />
        {interactive && (
          <span className="lp-drag-hint" data-on={ready && !dragged} aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M20 12a8 8 0 1 1-2.3-5.6" />
              <path d="M20 4v5h-5" />
            </svg>
            Drag to turn the sky
          </span>
        )}
        <div ref={readRef} className="lp-read" data-on="false" aria-hidden="true">
          <b />
          <span />
          <em>Click to aim here</em>
        </div>
        <div ref={aimRef} className="lp-aim" data-on="false">
          <i className="lp-aim-ring" aria-hidden="true" />
          {aim && (
            <div className="lp-aim-card">
              <b>{aim.name}</b>
              <span>
                {raHms(aim.ra)} {decDms(aim.dec)}
              </span>
              <a href={`${APP_PATH}?ra=${aim.ra.toFixed(4)}&dec=${aim.dec.toFixed(4)}`}>Look here →</a>
              <button type="button" aria-label="Clear the aim" onClick={() => setAim(undefined)}>
                ×
              </button>
            </div>
          )}
        </div>
        {pins.map((pin, i) => (
          <a
            key={pin.id}
            ref={(el) => {
              pinRefs.current[i] = el;
            }}
            className="lp-pin"
            href={placeHref(pin.id)}
            style={{ visibility: "hidden" }}
            onPointerEnter={(e) => thumb(pin, e.currentTarget.querySelector("canvas"))}
            onFocus={(e) => thumb(pin, e.currentTarget.querySelector("canvas"))}
          >
            {pin.image && <canvas className="lp-pin-thumb" aria-hidden="true" />}
            <i aria-hidden="true" />
            <span>
              {pin.name}
              <small>{pin.short}</small>
            </span>
          </a>
        ))}
      </div>
    </>
  );
}
