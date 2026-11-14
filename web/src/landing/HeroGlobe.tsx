import { useEffect, useRef, useState, type RefObject } from "react";
import { atlasUrl, loadAtlas, type Atlas } from "../lib/allsky";
import { prefersReducedMotion } from "../lib/hooks";
import { placeHref } from "../route";
import { EMBER } from "./data";

// Bola langit di hero: peta seluruh langit SPHEREx DR1 yang asli, dibungkus ke bola dan
// diputar pelan di kutub galaksi. Langitnya tampak seperti dilihat dari Bumi (timur di
// kiri), jadi rasi yang dikenal tidak terbalik, sama dengan peta di aplikasi.
//
// Ukuran bola mengikuti layar: di layar lebar jari-jarinya 0,59 kali lebar layar, dan yang
// terlihat hanya tudung atasnya, seperti planet yang terbit di bawah judul.

export type GlobePin = { id: string; name: string; short: string; ra: number; dec: number };

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

type Geometry = { w: number; h: number; cx: number; cy: number; r: number; hidePinsBelow: number };

type Props = {
  pins: GlobePin[];
  /** Elemen yang bagian bawahnya menjadi batas atas bola (deretan tombol hero). */
  above: RefObject<HTMLElement | null>;
  /** Tinggi bagian bawah bola yang tertutup deretan angka; penanda di sana disembunyikan. */
  covered: number;
};

export function HeroGlobe({ pins, above, covered }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const glCanvas = useRef<HTMLCanvasElement>(null);
  const lineCanvas = useRef<HTMLCanvasElement>(null);
  const pinRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [ready, setReady] = useState(false);
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  // Penanda datang belakangan; tanpa gerak (gerak dikurangi) lukisan perlu dipicu ulang.
  const kick = useRef<() => void>(undefined);
  useEffect(() => kick.current?.(), [pins]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = glCanvas.current;
    const lines = lineCanvas.current;
    const hero = wrap?.parentElement;
    if (!wrap || !canvas || !lines || !hero) return;
    let alive = true;
    let raf = 0;
    let visible = true;
    const gl = makeGl(canvas);
    // Tanpa WebGL langitnya dilukis sekali, jadi garis dan penanda juga tidak boleh berputar.
    const reduced = prefersReducedMotion() || !gl;
    let atlas: Atlas | undefined;
    let map: HTMLImageElement | undefined;
    let figures: Float32Array[] = [];
    let geo: Geometry | undefined;
    let fade = 0;
    let fadeStart = 0;
    const t0 = performance.now();
    // Kemiringan dari kursor, dihaluskan.
    const tilt = { yaw: 0, pitch: 0, toYaw: 0, toPitch: 0 };

    const layout = () => {
      const heroBox = hero.getBoundingClientRect();
      // Letak tata letak, bukan getBoundingClientRect: deretan tombol masih bergeser oleh
      // animasi masuk saat ini dihitung.
      const el = above.current;
      const w = heroBox.width;
      const wide = w >= 900;
      const r = wide ? Math.max(620, w * 0.59) : Math.max(360, w * 1.0);
      const top = (el ? el.offsetTop + el.offsetHeight : heroBox.height * 0.5) + (wide ? 30 : 36);
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
      geo = { w, h, cx: w / 2, cy: HALO + r, r, hidePinsBelow: h - covered - 20 };
    };

    const frame = (now: number) => {
      raf = 0;
      if (!alive || !geo) return;
      const px = Math.min(2, window.devicePixelRatio || 1);
      const spin = reduced ? 0 : (((now - t0) / 1000) * SPIN_DEG_PER_S * RAD) % (2 * Math.PI);
      tilt.yaw += (tilt.toYaw - tilt.yaw) * 0.05;
      tilt.pitch += (tilt.toPitch - tilt.pitch) * 0.05;
      const rot = viewToGalactic(spin, tilt.yaw, tilt.pitch);
      if (map && fadeStart === 0) fadeStart = now;
      fade = map ? (reduced ? 1 : Math.min(1, (now - fadeStart) / 900)) : 0;
      if (gl) gl.draw(rot, geo.cx, geo.cy, geo.r, px, fade);

      // Garis rasi dan penanda: proyeksi yang sama, kebalikan dari matriks di atas.
      const inv = transpose(rot);
      const ctx = lines.getContext("2d")!;
      ctx.setTransform(px, 0, 0, px, 0, 0);
      ctx.clearRect(0, 0, geo.w, geo.h);
      if (fade > 0) {
        ctx.globalAlpha = fade;
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = "rgba(255, 206, 150, 0.34)";
        ctx.lineJoin = "round";
        ctx.beginPath();
        const { cx, cy, r } = geo;
        for (const line of figures) {
          let pen = false;
          for (let i = 0; i < line.length; i += 3) {
            const gx = line[i];
            const gy = line[i + 1];
            const gz = line[i + 2];
            const sx = inv[0] * gx + inv[1] * gy + inv[2] * gz;
            const sy = inv[3] * gx + inv[4] * gy + inv[5] * gz;
            const sz = inv[6] * gx + inv[7] * gy + inv[8] * gz;
            if (sz < 0.06) {
              pen = false;
              continue;
            }
            const x = cx + sx * r;
            const y = cy - sy * r;
            if (pen) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
            pen = true;
          }
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (atlas) {
        pinsRef.current.forEach((pin, i) => {
          const el = pinRefs.current[i];
          if (!el || !geo) return;
          const g = toGalactic(atlas!, unit(pin.ra, pin.dec));
          const sx = inv[0] * g[0] + inv[1] * g[1] + inv[2] * g[2];
          const sy = inv[3] * g[0] + inv[4] * g[1] + inv[5] * g[2];
          const sz = inv[6] * g[0] + inv[7] * g[1] + inv[8] * g[2];
          const x = geo.cx + sx * geo.r;
          const y = geo.cy - sy * geo.r;
          const inside = sz > 0.1 && y > HALO + 24 && y < geo.hidePinsBelow && x > 24 && x < geo.w - 220;
          const o = inside ? Math.min(1, (sz - 0.1) / 0.15) * fade : 0;
          el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
          el.style.opacity = o.toFixed(3);
          el.style.visibility = o > 0.02 ? "visible" : "hidden";
        });
      }
      const settling = Math.abs(tilt.toYaw - tilt.yaw) > 1e-4 || Math.abs(tilt.toPitch - tilt.pitch) > 1e-4 || fade < 1;
      if (visible && (!reduced || settling)) raf = requestAnimationFrame(frame);
    };
    const schedule = () => {
      if (!raf && alive) raf = requestAnimationFrame(frame);
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
      if (!gl && map && geo && atlas) paintCpu(canvas, map, viewToGalactic(0, 0, 0), geo.cx * (canvas.width / geo.w), geo.cy * (canvas.width / geo.w), geo.r * (canvas.width / geo.w));
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
    const onPointer = (e: PointerEvent) => {
      if (reduced || e.pointerType !== "mouse") return;
      tilt.toYaw = ((e.clientX / window.innerWidth) * 2 - 1) * 2.5 * RAD;
      tilt.toPitch = ((e.clientY / window.innerHeight) * 2 - 1) * 1.5 * RAD;
      schedule();
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    const small = window.innerWidth * (window.devicePixelRatio || 1) < 1000;
    loadAtlas()
      .then((a) => {
        if (!alive) return;
        atlas = a;
        figures = Object.values(a.constellations.lines)
          .flat()
          .map((line) => {
            const out = new Float32Array(line.length * 3);
            line.forEach(([ra, dec], i) => out.set(toGalactic(a, unit(ra, dec)), i * 3));
            return out;
          });
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
              paintCpu(canvas, img, viewToGalactic(0, 0, 0), geo.cx * k, geo.cy * k, geo.r * k);
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
      window.removeEventListener("pointermove", onPointer);
      gl?.dispose();
    };
  }, [above, covered]);

  return (
    <div ref={wrapRef} className="lp-globe" data-ready={ready}>
      <canvas ref={glCanvas} className="lp-globe-sky" role="img" aria-label="The whole sky as NASA's SPHEREx mapped it, wrapped onto a slowly turning globe with the constellation figures drawn on it." />
      <canvas ref={lineCanvas} className="lp-globe-lines" aria-hidden="true" />
      {pins.map((pin, i) => (
        <a
          key={pin.id}
          ref={(el) => {
            pinRefs.current[i] = el;
          }}
          className="lp-pin"
          href={placeHref(pin.id)}
          style={{ visibility: "hidden" }}
        >
          <i aria-hidden="true" />
          <span>
            {pin.name}
            <small>{pin.short}</small>
          </span>
        </a>
      ))}
    </div>
  );
}
