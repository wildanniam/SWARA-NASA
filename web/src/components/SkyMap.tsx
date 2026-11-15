import { ArrowRight, ArrowsOutSimple, Minus, Plus, X } from "@phosphor-icons/react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { TARGET_NOTES, TARGET_WHY } from "../content";
import { atlasUrl, constellationAt, decDms, raHms, type Atlas } from "../lib/allsky";
import { monthYear } from "../lib/format";
import { orderFor, visibleTiles, type TileId } from "../lib/hips";
import { prefersReducedMotion } from "../lib/hooks";
import { lookGradient, LOOKS, LUTS, REVEAL_LUT, type PaletteId } from "../lib/palette";
import { SkyRenderer } from "../lib/skygl";
import { loadGray, paintSky } from "../lib/skyimage";
import {
  anchor,
  clampView,
  fieldLabel,
  frameOf,
  homeView,
  MAX_ZOOM,
  project,
  SKY_SPAN_DEG,
  toRaDec,
  unit,
  unproject,
  type Frame,
  type V3,
  type View,
} from "../lib/skyview";
import { PlaceThumb, useVerdict } from "./PlaceThumb";

/** Tempat yang ditandai di peta: contoh, atau tempat yang dibuka pengguna di sesi ini. */
export type SkyMarker = {
  id: string;
  name: string;
  detail: string;
  ra: number;
  dec: number;
  yours: boolean;
  current: boolean;
  /** Bundelnya sudah ada, jadi cuplikannya bisa dimuat. */
  built: boolean;
};

/** Ke mana peta harus sejajar di akhir menyelam: pusat lensa di layar dan skala pandangan lebar. */
export type Handoff = { clientX: number; clientY: number; pxPerArcsec: number };

export type SkyMapHandle = {
  /** Menyelam ke satu titik sampai sejajar dengan pandangan lebarnya. */
  dive: (ra: number, dec: number) => Promise<void>;
  zoomBy: (factor: number) => void;
  panBy: (dx: number, dy: number) => void;
  reset: () => void;
};

type Props = {
  atlas?: Atlas;
  failed: boolean;
  band: string;
  onBand: (band: string) => void;
  look: PaletteId;
  onPalette: (look: PaletteId) => void;
  reveal: boolean;
  lines: boolean;
  onLines: (on: boolean) => void;
  markers: SkyMarker[];
  onPick: (id: string) => void;
  /** Titik bidikan dipastikan: buka koordinat itu. Mengembalikan pesan kalau gagal. */
  onGo: (ra: number, dec: number) => Promise<string | null>;
  onTour: () => void;
  /** Datang dari satu tempat: peta mulai dari sana dan menjauh sampai seluruh langit. */
  arrive?: { ra: number; dec: number };
  onArrived: () => void;
  /** Sedang menyelam ke satu tempat: kendali di sekitar peta memudar. */
  leaving: boolean;
  handoff: () => Handoff | undefined;
  /** Tujuan tombol tur, supaya potongannya bisa dimuat sebelum tombolnya ditekan. */
  tour?: { ra: number; dec: number };
  /** Dialog lain sedang terbuka di atas peta. */
  busy?: boolean;
};

type Pointer = { left: number; top: number; ra: number; dec: number; abbr: string };
type Aim = { ra: number; dec: number; abbr: string };
type Motion = { t0: number; ms: number; step: (t: number) => void; done?: () => void; tiles?: TileId[] };

const FEATURE_SIDE: Record<string, "above" | "below"> = {
  "Centre of the Milky Way": "above",
  "Andromeda Galaxy": "above",
};

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const smooth = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};
const easeQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
// Menyelam: bagian ini dari waktunya dipakai sampai zoom terdalam (potongan paling
// tajam), sisanya untuk langkah terakhir ke skala pandangan lebar sambil larut.
const DEEP_PART = 0.8;
/** Zoom dan tirai di saat t (0..1) dari gerak menyelam z0 -> zEnd; naik memakainya terbalik. */
function divePace(t: number, z0: number, zEnd: number): { zoom: number; veil: number } {
  if (zEnd <= MAX_ZOOM) return { zoom: z0 * (zEnd / z0) ** easeQuad(t), veil: 1 - smooth((t - 0.8) / 0.2) };
  if (t < DEEP_PART) return { zoom: z0 * (MAX_ZOOM / z0) ** easeQuad(t / DEEP_PART), veil: 1 };
  const u = (t - DEEP_PART) / (1 - DEEP_PART);
  return { zoom: MAX_ZOOM * (zEnd / MAX_ZOOM) ** (u * u), veil: 1 - smooth(u) };
}
const diveMs = (z0: number) => Math.max(1800, Math.min(3200, 1800 + 160 * Math.log2(MAX_ZOOM / Math.max(1, z0))));

/** Garis di langit sebagai deretan arah, tiap ruas mengikuti lingkaran besar. */
function arcPoints(points: [number, number][], stepDeg: number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < points.length; i++) {
    const b = unit(points[i][0], points[i][1]);
    if (i === 0) {
      out.push(b);
      continue;
    }
    const a = unit(points[i - 1][0], points[i - 1][1]);
    const angle = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
    const n = Math.max(1, Math.ceil(((angle * 180) / Math.PI) / stepDeg));
    const s = Math.sin(angle);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const wa = s < 1e-9 ? 1 - t : Math.sin((1 - t) * angle) / s;
      const wb = s < 1e-9 ? t : Math.sin(t * angle) / s;
      const v: V3 = [wa * a[0] + wb * b[0], wa * a[1] + wb * b[1], wa * a[2] + wb * b[2]];
      const r = Math.hypot(v[0], v[1], v[2]);
      out.push([v[0] / r, v[1] / r, v[2] / r]);
    }
  }
  return out;
}

const circleOfDec = (dec: number, ra0 = 0, ra1 = 360, step = 1): V3[] => {
  const out: V3[] = [];
  for (let ra = ra0; ra <= ra1 + 1e-9; ra += step) out.push(unit(ra, dec));
  return out;
};
const lineOfRa = (ra: number, dec0 = -89, dec1 = 89, step = 1): V3[] => {
  const out: V3[] = [];
  for (let dec = dec0; dec <= dec1 + 1e-9; dec += step) out.push(unit(ra, dec));
  return out;
};

/** Cuplikan satu tempat sebagai kartu kecil: jendela melengkung berisi citra aslinya,
 *  julukannya, kenapa benda itu istimewa, lalu angka yang terukur di sana. */
function PlacePeek({ marker, look, pinned, onGo }: { marker: SkyMarker; look: PaletteId; pinned: boolean; onGo: () => void }) {
  const v = useVerdict(marker.id, marker.yours, marker.built);
  const first = marker.yours ? undefined : TARGET_NOTES[marker.id]?.split(". ")[0];
  const text = marker.yours ? undefined : (TARGET_WHY[marker.id]?.why ?? (first && (first.endsWith(".") ? first : `${first}.`)));
  return (
    <div className="sky-peek" data-pinned={pinned} data-ra={marker.ra} data-dec={marker.dec} data-keep="true">
      <PlaceThumb id={marker.id} custom={marker.yours} enabled={marker.built} look={look} size={168} arch />
      <div className="sky-peek-text">
        <small>{v?.epithet ?? (marker.yours ? "Your place" : marker.detail)}</small>
        <b>{marker.name}</b>
        {text && <p>{text}</p>}
      </div>
      {/* Kaki selebar kartu: yang terukur di kiri, jalan masuk di kanan. */}
      <div className="sky-peek-foot">
        {v ? (
          <span className="sky-peek-measured">
            <i>{v.big}</i>
            {v.line}
          </span>
        ) : (
          <span className="sky-peek-measured">{marker.built ? "Not measured yet" : "Still being gathered"}</span>
        )}
        {pinned && (
          <button type="button" className="pill pill-accent" onClick={onGo}>
            Look closer
            <ArrowRight aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Seluruh langit menurut SPHEREx: tingkat terluar teleskop dan pintu masuk ke tempat mana pun. */
export const SkyMap = forwardRef<SkyMapHandle, Props>(function SkyMap(p, handle) {
  const { atlas, band, look, reveal, lines, markers } = p;
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<HTMLSpanElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const goRef = useRef<HTMLButtonElement>(null);

  const renderer = useRef<SkyRenderer | undefined>(undefined);
  const view = useRef<View | undefined>(undefined);
  const size = useRef({ w: 0, h: 0 });
  const raf = useRef(0);
  const motion = useRef<Motion | undefined>(undefined);
  // Datang dari satu tempat: peta mulai tembus pandang di atas pandangan lebarnya.
  const veil = useRef(p.arrive ? 0 : 1);
  const fitTimer = useRef(0);
  const colors = useRef({ line: "255 180 84", grid: "205 214 255" });
  const live = useRef({ lines, hot: undefined as string | undefined, atlas });
  // Potongan untuk tempat yang sedang ditunjuk atau dibidik, diminta lebih dulu supaya
  // sudah ada saat orang memutuskan menyelam ke sana.
  const ahead = useRef<TileId[]>([]);

  const [gl, setGl] = useState(true);
  const [ready, setReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [loadingBand, setLoadingBand] = useState<string>();
  const [zoomed, setZoomed] = useState(false);
  const [deep, setDeep] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pointer, setPointer] = useState<Pointer>();
  const [aim, setAim] = useState<Aim>();
  const [aimBusy, setAimBusy] = useState(false);
  const [aimError, setAimError] = useState<string>();
  const [peek, setPeek] = useState<{ id: string; pinned: boolean }>();
  const painted = useRef<string | undefined>(undefined);
  // Layar kecil memuat versi separuh lebar; ditentukan sekali saat dibuka.
  const small = useMemo(() => window.innerWidth * (window.devicePixelRatio || 1) <= 1400, []);
  const touch = useMemo(() => window.matchMedia?.("(pointer: coarse)").matches ?? false, []);

  const frame = atlas?.frames.find((f) => f.band === band) ?? atlas?.frames.find((f) => f.band === atlas.default_band);
  const names = atlas?.constellations.names ?? {};
  const hot = aim?.abbr ?? pointer?.abbr;
  live.current = { lines, hot, atlas };

  // Garis yang tidak bergantung pada pandangan: kisi kasar dan garis rasi, sebagai arah di langit.
  const sky = useMemo(() => {
    if (!atlas) return undefined;
    const figures: Record<string, V3[][]> = {};
    for (const [abbr, parts] of Object.entries(atlas.constellations.lines)) figures[abbr] = parts.map((seg) => arcPoints(seg, 2));
    return {
      figures,
      grid: [...[-60, -30, 30, 60].map((d) => circleOfDec(d)), ...[0, 3, 6, 9, 12, 15, 18, 21].map((h) => lineOfRa(h * 15))],
      equator: circleOfDec(0),
      labels: Object.entries(atlas.constellations.labels).map(([abbr, [ra, dec]]) => ({ abbr, v: unit(ra, dec) })),
    };
  }, [atlas]);

  const currentFrame = useCallback((): Frame | undefined => {
    const a = live.current.atlas;
    if (!a || !view.current || !size.current.w) return undefined;
    return frameOf(a, view.current, size.current.w, size.current.h);
  }, []);

  /** Kisi, garis rasi, dan tepi langit, lewat proyeksi yang sama dengan citranya. */
  const drawOverlay = useCallback(
    (f: Frame) => {
      const canvas = overlayRef.current;
      if (!canvas || !sky) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.round(f.w * dpr);
      const H = Math.round(f.h * dpr);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
      }
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, f.w, f.h);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      const jump = Math.max(120, f.w * f.zoom * 0.25);
      const centre: V3 = [f.m[0], f.m[1], f.m[2]];
      const reach = Math.cos(Math.min(Math.PI, 3.6 / f.zoom + 0.9));
      const trace = (pts: V3[]) => {
        // Garis yang seluruhnya jauh dari medan dilewati.
        const a = pts[0];
        const b = pts[pts.length >> 1];
        if (f.zoom > 3 && a[0] * centre[0] + a[1] * centre[1] + a[2] * centre[2] < reach && b[0] * centre[0] + b[1] * centre[1] + b[2] * centre[2] < reach) return;
        let prev: { x: number; y: number } | undefined;
        for (const v of pts) {
          const q = project(f, v);
          if (!prev || Math.abs(q.x - prev.x) > jump || Math.abs(q.y - prev.y) > jump) ctx.moveTo(q.x, q.y);
          else ctx.lineTo(q.x, q.y);
          prev = q;
        }
      };
      const { line, grid } = colors.current;

      // Kisi RA dan Dec: kasar untuk seluruh langit, makin rapat saat diperbesar.
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgb(${grid} / 0.09)`;
      ctx.beginPath();
      if (f.zoom < 3) sky.grid.forEach(trace);
      else {
        const c = toRaDec(centre);
        const half = (SKY_SPAN_DEG / f.zoom) * 0.62;
        const decStep = [30, 10, 5, 2, 1, 0.5, 0.25].find((s) => s <= half / 1.5) ?? 0.25;
        const raHalf = Math.min(180, half / Math.max(0.05, Math.cos((c.dec * Math.PI) / 180)));
        const raStep = [45, 15, 5, 2.5, 1.25, 0.5, 0.25].find((s) => s <= raHalf / 1.5) ?? 0.25;
        const d0 = Math.max(-89, c.dec - half);
        const d1 = Math.min(89, c.dec + half);
        for (let d = Math.ceil(d0 / decStep) * decStep; d <= d1; d += decStep) {
          if (Math.abs(d) < 1e-9) continue;
          trace(circleOfDec(d, c.ra - raHalf, c.ra + raHalf, raHalf / 24));
        }
        for (let r = Math.ceil((c.ra - raHalf) / raStep) * raStep; r <= c.ra + raHalf; r += raStep) trace(lineOfRa(r, d0, d1, (d1 - d0) / 24));
      }
      ctx.stroke();
      ctx.strokeStyle = `rgb(${grid} / 0.24)`;
      ctx.setLineDash([1, 5]);
      ctx.beginPath();
      trace(sky.equator);
      ctx.stroke();
      ctx.setLineDash([]);

      if (live.current.lines) {
        ctx.strokeStyle = `rgb(${line} / ${f.zoom > 2.5 ? 0.34 : 0.22})`;
        ctx.beginPath();
        for (const parts of Object.values(sky.figures)) parts.forEach(trace);
        ctx.stroke();
      }
      const hotNow = live.current.hot;
      if (hotNow && sky.figures[hotNow]) {
        ctx.strokeStyle = `rgb(${line} / 0.95)`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        sky.figures[hotNow].forEach(trace);
        ctx.stroke();
      }

      // Nama rasi yang terlihat, begitu peta cukup dekat untuk membacanya.
      if (f.zoom >= 2.5 && live.current.lines) {
        ctx.font = '600 11px "Archivo Variable", system-ui, sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "3.4px";
        (ctx as CanvasRenderingContext2D & { fontStretch?: string }).fontStretch = "expanded";
        ctx.fillStyle = `rgb(${line} / 0.5)`;
        for (const { abbr, v } of sky.labels) {
          if (abbr === hotNow || v[0] * centre[0] + v[1] * centre[1] + v[2] * centre[2] < 0.2) continue;
          const q = project(f, v);
          if (q.x < 40 || q.x > f.w - 40 || q.y < 14 || q.y > f.h - 14) continue;
          ctx.fillText((live.current.atlas?.constellations.names[abbr] ?? abbr).toUpperCase(), q.x, q.y);
        }
      }

      // Tepi langit, selama masih terlihat.
      if (f.zoom < 1.6) {
        ctx.strokeStyle = "rgb(205 214 255 / 0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(f.w / 2, f.h / 2, (f.w / 2) * f.zoom, (f.h / 2) * f.zoom, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
    [sky],
  );

  /** Taruh penanda, label, bidikan, dan kartu di letak layarnya untuk pandangan ini. */
  const placeDom = useCallback((f: Frame) => {
    const plot = plotRef.current;
    if (!plot) return;
    for (const el of plot.querySelectorAll<HTMLElement>("[data-ra]")) {
      const q = project(f, unit(Number(el.dataset.ra), Number(el.dataset.dec)));
      const out = q.x < -30 || q.x > f.w + 30 || q.y < -30 || q.y > f.h + 30;
      if (el.dataset.keep) {
        // Kartu tetap terlihat walau titiknya keluar layar: ditahan di tepi peta.
        const x = Math.max(0, Math.min(f.w, q.x));
        const y = Math.max(0, Math.min(f.h, q.y));
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.dataset.flipX = String(x > f.w * 0.62);
        el.dataset.flipY = String(y > f.h * 0.58);
        continue;
      }
      el.style.display = out ? "none" : "";
      if (out) continue;
      el.style.left = `${q.x}px`;
      el.style.top = `${q.y}px`;
      if (el.classList.contains("sky-constellation")) el.dataset.anchor = q.x > f.w * 0.84 ? "end" : q.x < f.w * 0.16 ? "start" : "middle";
    }
  }, []);

  /** Label tidak boleh menimpa penanda atau label lain: yang bertabrakan pindah sisi atau disembunyikan. */
  const fitLabels = useCallback(() => {
    const map = mapRef.current;
    const f = currentFrame();
    if (!map || !f) return;
    const overlaps = (a: DOMRect, b: DOMRect) =>
      a.left < b.right + 8 && a.right + 8 > b.left && a.top < b.bottom + 4 && a.bottom + 4 > b.top;
    const bounds = map.getBoundingClientRect();
    const cx = bounds.left + bounds.width / 2;
    const cy = bounds.top + bounds.height / 2;
    // Selama tepi langit masih terlihat, label harus di dalam elipsnya.
    const inside = (r: DOMRect) =>
      f.zoom > 1.5
        ? r.left >= bounds.left + 6 && r.right <= bounds.right - 6 && r.top >= bounds.top + 6 && r.bottom <= bounds.bottom - 6
        : [r.left, r.right].every((x) =>
            [r.top, r.bottom].every(
              (y) => ((x - cx) / ((bounds.width / 2) * f.zoom)) ** 2 + ((y - cy) / ((bounds.height / 2) * f.zoom)) ** 2 <= 0.97,
            ),
          );
    const shown = [...map.querySelectorAll<HTMLElement>(".sky-marker")].filter((el) => el.style.display !== "none");
    const rings = shown.map((el) => el.querySelector(".sky-marker-ring")!.getBoundingClientRect());
    const placed: DOMRect[] = [...rings];
    for (const [i, el] of shown.entries()) {
      const text = el.querySelector<HTMLElement>(".sky-marker-text")!;
      el.dataset.label = "shown";
      el.dataset.side = rings[i].left - bounds.left > bounds.width * 0.72 ? "left" : "right";
      const free = () => {
        const r = text.getBoundingClientRect();
        const within = r.left >= bounds.left - 2 && r.right <= bounds.right + 2;
        return within && !placed.some((b) => b !== rings[i] && overlaps(r, b)) ? r : undefined;
      };
      let r = free();
      if (!r) {
        el.dataset.side = el.dataset.side === "left" ? "right" : "left";
        r = free();
      }
      if (r) placed.push(r);
      else el.dataset.label = "hidden";
    }
    for (const el of map.querySelectorAll<HTMLElement>(".sky-feature, .sky-hour, .sky-equator-label")) {
      if (el.style.display === "none") continue;
      el.dataset.hidden = "false";
      const free = () => {
        const r = el.getBoundingClientRect();
        return inside(r) && !placed.some((b) => overlaps(r, b)) ? r : undefined;
      };
      let r = free();
      if (!r && el.classList.contains("sky-feature")) {
        el.dataset.side = el.dataset.side === "above" ? "below" : "above";
        r = free();
      }
      if (r) placed.push(r);
      else el.dataset.hidden = "true";
    }
  }, [currentFrame]);

  const paint = useCallback(() => {
    raf.current = 0;
    const a = live.current.atlas;
    if (!a || !view.current || !size.current.w) return;
    const now = performance.now();
    const run = motion.current;
    if (run) {
      const t = run.ms ? Math.min(1, (now - run.t0) / run.ms) : 1;
      run.step(t);
      if (t >= 1) {
        motion.current = undefined;
        run.done?.();
      }
    }
    const f = frameOf(a, view.current, size.current.w, size.current.h);
    let moving = !!motion.current;
    const r = renderer.current;
    if (r) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const order = orderFor(Math.min(f.zoom, MAX_ZOOM), f.w * dpr);
      // Selama gerak otomatis hanya potongan tujuannya yang diminta, supaya tidak
      // meminta ratusan potongan yang hanya lewat.
      r.request(run?.tiles ?? (motion.current ? [] : [...(order ? visibleTiles(f, order) : []), ...ahead.current]));
      if (r.draw(f.m, f.zoom, Math.round(f.w * dpr), Math.round(f.h * dpr), order + 1)) moving = true;
      const status = statusRef.current;
      if (status) {
        const state = r.unreachable ? "down" : r.loading && f.zoom >= 1.5 && !motion.current ? "loading" : "idle";
        if (status.dataset.state !== state) status.dataset.state = state;
      }
    }
    drawOverlay(f);
    placeDom(f);
    if (fieldRef.current) {
      const label = fieldLabel(Math.min(f.zoom, MAX_ZOOM));
      fieldRef.current.textContent = label ? ` · field ${label}` : "";
    }
    rootRef.current?.style.setProperty("--veil", String(veil.current));
    // Satu bingkai, satu lukisan: langkah gerak di atas lewat setView sudah bisa menjadwalkan
    // bingkai berikutnya. Menjadwalkan lagi di sini membuat jumlah lukisan berlipat dua tiap
    // bingkai, dan itulah yang membuat menyelam tersendat makin lama makin parah.
    if (moving && !raf.current) raf.current = requestAnimationFrame(paint);
  }, [drawOverlay, placeDom]);

  const schedule = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(paint);
  }, [paint]);

  /** Ganti pandangan (dari gerak tangan atau gerak otomatis). */
  const setView = useCallback(
    (next: View, settle = true) => {
      view.current = next;
      const z = next.zoom > 1.02;
      setZoomed((cur) => (cur === z ? cur : z));
      const d = next.zoom > 1.4;
      setDeep((cur) => (cur === d ? cur : d));
      schedule();
      if (settle) {
        window.clearTimeout(fitTimer.current);
        fitTimer.current = window.setTimeout(fitLabels, 160);
      }
    },
    [schedule, fitLabels],
  );

  // Menyelam tidak bisa disela: begitu dimulai, peta sedang ditinggalkan.
  const diving = useRef(false);

  /** Hentikan gerak otomatis karena pengguna mengambil alih. Yang menunggu selesainya tetap diberi tahu. */
  const stopMotion = useCallback(() => {
    if (diving.current) return;
    const was = motion.current;
    motion.current = undefined;
    veil.current = 1;
    was?.done?.();
  }, []);

  const animate = useCallback(
    (ms: number, step: (t: number) => void, done?: () => void, tiles?: TileId[]) => {
      if (diving.current) return;
      const was = motion.current;
      motion.current = { t0: performance.now(), ms: prefersReducedMotion() ? 0 : ms, step, done, tiles };
      was?.done?.();
      schedule();
    },
    [schedule],
  );

  /** Zoom dengan satu titik layar tetap di tempatnya. */
  const zoomAt = useCallback(
    (x: number, y: number, factor: number, ms = 280) => {
      const a = live.current.atlas;
      const f = currentFrame();
      if (!a || !f || !view.current) return;
      const z0 = view.current.zoom;
      const z1 = Math.max(1, Math.min(MAX_ZOOM, z0 * factor));
      const s = unproject(f, x, y) ?? ([f.m[0], f.m[1], f.m[2]] as V3);
      animate(ms, (t) => setView(anchor(a, z0 * (z1 / z0) ** ease(t), view.current!, s, x, y, f.w, f.h), t >= 1));
    },
    [animate, currentFrame, setView],
  );

  const reset = useCallback(() => {
    const a = live.current.atlas;
    if (!a || !view.current) return;
    const from = view.current;
    animate(Math.min(900, 300 + 90 * Math.log2(from.zoom)), (t) => setView(clampView(a, { ...from, zoom: from.zoom ** (1 - ease(t)) }), t >= 1));
    setAim(undefined);
  }, [animate, setView]);

  /** Skala dan titik tujuan di akhir menyelam, dalam piksel peta. */
  const landing = useCallback(() => {
    const map = mapRef.current;
    const h = p.handoff();
    const { w, h: hh } = size.current;
    if (!map || !h) return { x: w / 2, y: hh / 2, zoom: MAX_ZOOM * 3 };
    const rect = map.getBoundingClientRect();
    return { x: h.clientX - rect.left, y: h.clientY - rect.top, zoom: Math.max(MAX_ZOOM, (h.pxPerArcsec * SKY_SPAN_DEG * 3600) / w) };
    // `p.handoff` dibaca saat dipanggil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.handoff]);

  /** Potongan yang akan dibutuhkan di ujung gerak: pandangan menengah lalu yang terdalam. */
  const destinationTiles = useCallback((ra: number, dec: number): TileId[] => {
    const a = live.current.atlas;
    const { w, h } = size.current;
    if (!a || !w) return [];
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // Yang terdalam dulu: di sanalah gerak berakhir. Tiap potongan butuh 1 sampai 2 detik
    // dari IRSA, jadi daftarnya pendek.
    return (
      [
        [MAX_ZOOM, 4],
        [40, 2],
        [10, 1],
      ] as const
    ).flatMap(([zoom, count]) => visibleTiles(frameOf(a, { ra, dec, zoom }, w, h), orderFor(zoom, w * dpr)).slice(0, count));
  }, []);

  const dive = useCallback(
    (ra: number, dec: number) =>
      new Promise<void>((resolve) => {
        const a = live.current.atlas;
        const f = currentFrame();
        // Tanpa WebGL petanya gambar diam: tidak ada zoom untuk dijalankan.
        if (!a || !f || !view.current || prefersReducedMotion() || !renderer.current) {
          resolve();
          return;
        }
        if (diving.current) return;
        setAim(undefined);
        setPeek(undefined);
        setPointer(undefined);
        const target = unit(ra, dec);
        const end = landing();
        const z0 = view.current.zoom;
        const here = project(f, target);
        const start = { x: Math.max(0, Math.min(f.w, here.x)), y: Math.max(0, Math.min(f.h, here.y)) };
        animate(
          diveMs(z0),
          (t) => {
            const pace = divePace(t, z0, end.zoom);
            const k = smooth((t / DEEP_PART) * 1.15);
            setView(
              anchor(a, pace.zoom, view.current!, target, start.x + (end.x - start.x) * k, start.y + (end.y - start.y) * k, f.w, f.h, end.zoom),
              false,
            );
            // Lewat zoom terdalam, peta larut ke pandangan lebar yang sudah sejajar di bawahnya.
            veil.current = pace.veil;
          },
          resolve,
          destinationTiles(ra, dec),
        );
        diving.current = true;
      }),
    [animate, currentFrame, destinationTiles, landing, setView],
  );

  useImperativeHandle(
    handle,
    () => ({
      dive,
      zoomBy: (factor) => zoomAt(size.current.w / 2, size.current.h / 2, factor),
      panBy: (dx, dy) => {
        const a = live.current.atlas;
        const f = currentFrame();
        if (!a || !f || !view.current || diving.current) return;
        const s: V3 = [f.m[0], f.m[1], f.m[2]];
        stopMotion();
        setView(anchor(a, f.zoom, view.current, s, f.w / 2 - dx * f.w * 0.18, f.h / 2 - dy * f.h * 0.18, f.w, f.h));
      },
      reset,
    }),
    [dive, zoomAt, currentFrame, setView, stopMotion, reset],
  );

  // Hanya saat pengembangan: pandangan yang sedang tampil, untuk uji letak.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __skyView?: () => unknown };
    w.__skyView = () => ({ view: view.current, size: size.current, frame: currentFrame(), loading: renderer.current?.loading ?? 0, tiles: renderer.current?.loaded ?? [], shown: renderer.current?.lastShown ?? 0 });
    return () => {
      delete w.__skyView;
    };
  }, [currentFrame]);

  // Perender: dibuat sekali per peta. Tanpa WebGL, peta dilukis seperti gambar diam.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!atlas || !canvas || !gl) return;
    let made: SkyRenderer;
    try {
      made = new SkyRenderer(canvas, atlas.projection.icrs_to_galactic, touch ? 64 : 150);
    } catch (err) {
      console.warn("sky map: WebGL is not available, showing the still map", err);
      setGl(false);
      return;
    }
    made.onChange = schedule;
    renderer.current = made;
    return () => {
      renderer.current = undefined;
      made.dispose();
    };
  }, [atlas, gl, touch, schedule]);

  // Ukuran peta di layar.
  useLayoutEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const measure = () => {
      size.current = { w: map.clientWidth, h: map.clientHeight };
      schedule();
      window.clearTimeout(fitTimer.current);
      fitTimer.current = window.setTimeout(fitLabels, 160);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(map);
    void document.fonts?.ready.then(fitLabels);
    return () => observer.disconnect();
  }, [schedule, fitLabels]);

  // Pandangan awal: seluruh langit, atau mulai dari tempat yang baru ditinggalkan lalu menjauh.
  const arrived = useRef(false);
  const startTimer = useRef(0);
  const { arrive, onArrived } = p;
  useEffect(() => {
    if (!atlas || view.current) return;
    view.current = homeView(atlas);
    schedule();
  }, [atlas, schedule]);
  useEffect(() => {
    if (!atlas || !ready || arrived.current || !arrive || !size.current.w) return;
    arrived.current = true;
    if (prefersReducedMotion() || !gl) {
      onArrived();
      return;
    }
    const { w, h } = size.current;
    const target = unit(arrive.ra, arrive.dec);
    const from = landing();
    const home = project(frameOf(atlas, homeView(atlas), w, h), target);
    view.current = { ra: arrive.ra, dec: arrive.dec, zoom: from.zoom };
    veil.current = 0;
    schedule();
    // Mulai begitu potongan di tempat asal termuat, paling lama sekitar satu detik:
    // peta yang muncul di atas pandangan lebar harus setajam yang bisa.
    const began = performance.now();
    const start = () => {
      const waited = performance.now() - began;
      if (waited < 900 && (waited < 250 || (renderer.current?.loading ?? 0) > 0)) {
        startTimer.current = window.setTimeout(start, 80);
        return;
      }
      rise();
    };
    const rise = () =>
      animate(
        diveMs(1),
        (t) => {
          const pace = divePace(1 - t, 1, from.zoom);
          const k = smooth((t - (1 - DEEP_PART)) / DEEP_PART);
          setView(anchor(atlas, pace.zoom, view.current!, target, from.x + (home.x - from.x) * k, from.y + (home.y - from.y) * k, w, h, from.zoom), t >= 1);
          veil.current = pace.veil;
        },
        onArrived,
        destinationTiles(arrive.ra, arrive.dec),
      );
    start();
  }, [atlas, ready, arrive, gl, animate, landing, setView, onArrived, schedule, destinationTiles]);

  // Warna garis mengikuti look.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const style = getComputedStyle(root);
    colors.current = { line: style.getPropertyValue("--line").trim() || "255 180 84", grid: style.getPropertyValue("--grid").trim() || "205 214 255" };
    renderer.current?.setLook(LUTS[look], reveal ? REVEAL_LUT : undefined);
    schedule();
  }, [look, reveal, atlas, gl, schedule]);

  // Peta dasar untuk panjang gelombang yang dipilih, dan sumber potongannya.
  useEffect(() => {
    if (!frame || !atlas) return;
    let alive = true;
    setLoadingBand(frame.band);
    loadGray(atlasUrl(small ? frame.small : frame.image))
      .then((gray) => {
        if (!alive) return;
        const r = renderer.current;
        if (r) {
          r.setLook(LUTS[look], reveal ? REVEAL_LUT : undefined);
          r.setMap(gray, painted.current && !prefersReducedMotion() ? 420 : 0);
          r.setSource(atlas.source.url, frame.frame);
        } else if (canvasRef.current && !gl) paintSky(canvasRef.current, gray, LUTS[look], reveal ? REVEAL_LUT : undefined);
        painted.current = frame.band;
        setReady(true);
        setImageFailed(false);
        setLoadingBand(undefined);
        // Digambar langsung, tanpa menunggu bingkai berikutnya.
        if (!raf.current) paint();
      })
      .catch((err) => {
        console.error(err);
        if (alive) {
          setImageFailed(true);
          setLoadingBand(undefined);
        }
      });
    return () => {
      alive = false;
    };
    // Look dan Reveal faint ditangani efek di atas; di sini hanya saat petanya berganti.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, small, atlas, gl]);

  // Cahaya di luar elips: peta yang sama, diperbesar dan dikaburkan di belakang pelat,
  // supaya halaman ini juga berlatar langit seperti halaman tempat. Bukan lapis baru:
  // hanya rembesan cahaya dari data yang sedang tampil.
  useEffect(() => {
    if (!frame) return;
    let alive = true;
    loadGray(atlasUrl(frame.small))
      .then((gray) => {
        if (alive && glowRef.current) paintSky(glowRef.current, gray, LUTS[look], reveal ? REVEAL_LUT : undefined);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [frame, look, reveal]);
  useEffect(() => {
    const place = () => {
      const map = mapRef.current;
      const glow = glowRef.current;
      if (!map || !glow) return;
      const r = map.getBoundingClientRect();
      glow.style.left = `${r.left + r.width / 2}px`;
      glow.style.top = `${r.top + r.height / 2}px`;
      glow.style.width = `${r.width}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    if (mapRef.current) observer.observe(mapRef.current);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [atlas, ready]);

  // Garis rasi dan sorotan digambar ulang saat berubah; letak elemen disusul setelah render.
  useEffect(schedule, [lines, hot, schedule]);
  useLayoutEffect(() => {
    rootRef.current?.style.setProperty("--veil", String(veil.current));
    const f = currentFrame();
    if (f) placeDom(f);
  });
  useEffect(() => {
    window.clearTimeout(fitTimer.current);
    fitTimer.current = window.setTimeout(fitLabels, 60);
  }, [markers, atlas, deep, fitLabels]);
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      // Dinolkan supaya penjadwalan berikutnya jalan lagi (efek bisa dipasang ulang).
      raf.current = 0;
      window.clearTimeout(fitTimer.current);
      window.clearTimeout(startTimer.current);
    },
    [],
  );

  // Bidikan: Enter membuka titik itu, Esc membatalkannya.
  useEffect(() => {
    if (!aim && !peek) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAim(undefined);
        setPeek(undefined);
      } else if (e.key === "Enter" && aim && !(e.target as HTMLElement).closest?.("button, input, a")) goRef.current?.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aim, peek]);

  const locate = useCallback(
    (clientX: number, clientY: number) => {
      const map = mapRef.current;
      const a = live.current.atlas;
      const f = currentFrame();
      if (!a || !map || !f) return undefined;
      const rect = map.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const v = unproject(f, x, y);
      if (!v) return undefined;
      const at = toRaDec(v);
      return { x, y, v, f, ...at, abbr: constellationAt(a, at.ra, at.dec) };
    },
    [currentFrame],
  );

  // Gerak tangan: roda dan cubit memperbesar ke arah kursor, seret menggeser, klik membidik.
  const press = useRef(new Map<number, { x: number; y: number }>());
  const grab = useRef<{ id: number; x: number; y: number; s?: V3; moved: boolean } | undefined>(undefined);
  const pinch = useRef<{ d: number; zoom: number; s: V3 } | undefined>(undefined);
  const onPickRef = useRef(p.onPick);
  onPickRef.current = p.onPick;
  const markersRef = useRef(markers);
  markersRef.current = markers;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !gl) return;
    const onWheel = (e: WheelEvent) => {
      const a = live.current.atlas;
      const hit = locate(e.clientX, e.clientY);
      if (!a || !view.current || !size.current.w) return;
      e.preventDefault();
      if (diving.current) return;
      stopMotion();
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
      const zoom = Math.max(1, Math.min(MAX_ZOOM, view.current.zoom * Math.exp(-delta * (e.ctrlKey ? 0.012 : 0.0022))));
      const rect = map.getBoundingClientRect();
      setView(
        hit
          ? anchor(a, zoom, view.current, hit.v, hit.x, hit.y, size.current.w, size.current.h)
          : clampView(a, { ...view.current, zoom }),
      );
      setPointer(undefined);
      void rect;
    };
    map.addEventListener("wheel", onWheel, { passive: false });
    return () => map.removeEventListener("wheel", onWheel);
  }, [gl, locate, setView, stopMotion]);

  const local = (e: React.PointerEvent) => {
    const rect = mapRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (diving.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    // Jari yang mendarat di penanda tetap dihitung untuk cubit; hanya tidak memulai seret atau bidikan.
    const onThing = !!(e.target as HTMLElement).closest(".sky-marker, .sky-peek, .atlas-zoom");
    if (onThing && e.pointerType === "mouse") return;
    const at = local(e);
    press.current.set(e.pointerId, at);
    if (press.current.size === 1) {
      const f = currentFrame();
      grab.current = onThing ? undefined : { id: e.pointerId, ...at, s: f ? unproject(f, at.x, at.y) : undefined, moved: false };
    } else if (press.current.size === 2 && gl) {
      const [a, b] = [...press.current.values()];
      const f = currentFrame();
      const mid = f && unproject(f, (a.x + b.x) / 2, (a.y + b.y) / 2);
      if (mid && view.current) pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.current.zoom, s: mid };
      if (grab.current) grab.current.moved = true;
      stopMotion();
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const a = live.current.atlas;
    const at = local(e);
    if (press.current.has(e.pointerId)) press.current.set(e.pointerId, at);
    if (pinch.current && press.current.size >= 2 && a && view.current) {
      const [p1, p2] = [...press.current.values()];
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const zoom = Math.max(1, Math.min(MAX_ZOOM, (pinch.current.zoom * d) / pinch.current.d));
      setView(anchor(a, zoom, view.current, pinch.current.s, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2, size.current.w, size.current.h));
      return;
    }
    const g = grab.current;
    if (g && g.id === e.pointerId && gl && a && view.current) {
      // Di ponsel, sebelum diperbesar satu jari tetap menggulir halaman.
      const pans = e.pointerType !== "touch" || view.current.zoom > 1.02;
      if (!g.moved && Math.hypot(at.x - g.x, at.y - g.y) > 5 && pans) {
        g.moved = true;
        stopMotion();
        setDragging(true);
        setPointer(undefined);
        mapRef.current?.setPointerCapture(e.pointerId);
      }
      if (g.moved && g.s) setView(anchor(a, view.current.zoom, view.current, g.s, at.x, at.y, size.current.w, size.current.h));
      if (g.moved) return;
    }
    if (e.pointerType === "touch" || press.current.size) return;
    const onThing = (e.target as HTMLElement).closest(".sky-marker, .sky-peek, .atlas-zoom");
    const hit = onThing ? undefined : locate(e.clientX, e.clientY);
    setPointer(hit ? { left: hit.x, top: hit.y, ra: hit.ra, dec: hit.dec, abbr: hit.abbr } : undefined);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    press.current.delete(e.pointerId);
    if (press.current.size < 2) pinch.current = undefined;
    const g = grab.current;
    if (!g || g.id !== e.pointerId) return;
    grab.current = undefined;
    setDragging(false);
    if (g.moved || e.type === "pointercancel") return;
    // Klik tanpa seret: membidik, atau memilih penanda yang hampir kena.
    const hit = locate(e.clientX, e.clientY);
    if (!hit) {
      setAim(undefined);
      setPeek(undefined);
      return;
    }
    const near = markersRef.current
      .map((m) => {
        const q = project(hit.f, unit(m.ra, m.dec));
        return { m, d: Math.hypot(q.x - hit.x, q.y - hit.y) };
      })
      .sort((x, y) => x.d - y.d)[0];
    if (near && near.d < (touch ? 22 : 12)) {
      pickMarker(near.m.id);
      return;
    }
    setPeek(undefined);
    setAimError(undefined);
    setAim({ ra: hit.ra, dec: hit.dec, abbr: hit.abbr });
  };

  /** Di ponsel ketukan pertama membuka cuplikan; di tempat lain langsung menyelam. */
  const pickMarker = (id: string) => {
    if (touch && peek?.id !== id) {
      setAim(undefined);
      setPeek({ id, pinned: true });
    } else onPickRef.current(id);
  };

  const go = async () => {
    if (!aim || aimBusy) return;
    setAimBusy(true);
    setAimError(undefined);
    const error = await p.onGo(aim.ra, aim.dec);
    setAimBusy(false);
    if (error) setAimError(error);
  };

  // Menunjuk penanda atau membidik: potongan terdalam di sana mulai dimuat.
  const peekId = peek?.id;
  const [touring, setTouring] = useState(false);
  const { tour } = p;
  useEffect(() => {
    const m = peekId ? markersRef.current.find((x) => x.id === peekId) : undefined;
    const at = m ?? aim ?? (touring ? tour : undefined);
    ahead.current = at ? destinationTiles(at.ra, at.dec) : [];
    schedule();
  }, [peekId, aim, touring, tour, destinationTiles, schedule]);

  const hotLabel = atlas && hot ? atlas.constellations.labels[hot] : undefined;
  const lambda = frame ? `${frame.lambda_um.toFixed(2)} µm` : "";
  const peeked = peek && markers.find((m) => m.id === peek.id);

  return (
    <div
      ref={rootRef}
      className="atlas"
      data-look={look}
      data-fx={p.leaving ? "leave" : arrive ? "enter" : undefined}
      data-zoomed={deep}
      inert={p.busy}
    >
      <div className="atlas-head">
        <p className="atlas-kicker">
          <span>
            {atlas
              ? `SPHEREx all-sky map · seen from Earth · ${monthYear(atlas.source.mjd_start)} to ${monthYear(atlas.source.mjd_end)}`
              : "SPHEREx all-sky map · seen from Earth"}
            <span ref={fieldRef} />
          </span>
        </p>
      </div>

      <div className="atlas-glow" aria-hidden="true">
        <canvas ref={glowRef} />
      </div>
      <div className="atlas-stage">
        <div className="atlas-plot" ref={plotRef}>
          <div
            ref={mapRef}
            className="atlas-map"
            data-ready={ready}
            data-pan={zoomed}
            data-dragging={dragging}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => setPointer(undefined)}
            onDoubleClick={(e) => {
              if (!gl || diving.current || (e.target as HTMLElement).closest(".sky-marker, .sky-peek, .atlas-zoom")) return;
              const at = mapRef.current!.getBoundingClientRect();
              setAim(undefined);
              zoomAt(e.clientX - at.left, e.clientY - at.top, 2.6);
            }}
          >
            <canvas
              key={gl ? "gl" : "still"}
              ref={canvasRef}
              className="atlas-canvas"
              role="img"
              aria-label={`The whole sky seen from Earth, as SPHEREx saw it at ${lambda}: our galaxy runs across the middle.`}
            />
            <canvas ref={overlayRef} className="atlas-overlay" aria-hidden="true" />

            {atlas && (
              <div className="atlas-labels" aria-hidden="true">
                {[0, 6, 12, 18].map((h) => (
                  <span key={h} className="sky-hour" data-ra={h * 15} data-dec={0}>
                    {h}h
                  </span>
                ))}
                <span className="sky-equator-label" data-ra={26} data-dec={0}>
                  celestial equator
                </span>
                {atlas.features.map((f) => (
                  <span key={f.name} className="sky-feature" data-side={FEATURE_SIDE[f.name] ?? "below"} data-ra={f.ra} data-dec={f.dec}>
                    {f.name}
                  </span>
                ))}
              </div>
            )}
            {hotLabel && hot && !deep && (
              <span className="sky-constellation" data-ra={hotLabel[0]} data-dec={hotLabel[1]} aria-hidden="true">
                {names[hot]}
              </span>
            )}
            {atlas &&
              markers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="sky-marker"
                  data-id={m.id}
                  data-yours={m.yours}
                  data-current={m.current}
                  data-peeked={peek?.id === m.id}
                  data-ra={m.ra}
                  data-dec={m.dec}
                  aria-label={`${m.name}, ${m.detail}. Look closer.`}
                  onClick={() => pickMarker(m.id)}
                  onPointerEnter={(e) => e.pointerType === "mouse" && setPeek({ id: m.id, pinned: false })}
                  onPointerLeave={() => setPeek((cur) => (cur && !cur.pinned ? undefined : cur))}
                  onFocus={() => !touch && setPeek({ id: m.id, pinned: false })}
                  onBlur={() => setPeek((cur) => (cur && !cur.pinned ? undefined : cur))}
                >
                  <span className="sky-marker-ring" aria-hidden="true" />
                  <span className="sky-marker-text" aria-hidden="true">
                    <b>{m.name}</b>
                    <small>{m.current ? "you were here" : m.detail}</small>
                  </span>
                </button>
              ))}
            {aim && (
              <span className="sky-aim" data-ra={aim.ra} data-dec={aim.dec} aria-hidden="true">
                <svg viewBox="-20 -20 40 40">
                  <circle r="9" />
                  <path d="M0 -9V-17M0 9V17M-9 0H-17M9 0H17" />
                </svg>
              </span>
            )}
            {pointer && !aim && !peek && !dragging && (
              <div
                className="sky-readout"
                data-flip-x={pointer.left > size.current.w - 260}
                data-flip-y={pointer.top > size.current.h - 110}
                style={{ left: pointer.left, top: pointer.top }}
                aria-hidden="true"
              >
                <span className="sky-readout-coords">
                  RA {raHms(pointer.ra)}
                  <i />
                  Dec {decDms(pointer.dec)}
                </span>
                <span className="sky-readout-name">{names[pointer.abbr] ?? ""}</span>
                <span className="sky-readout-hint">Click to aim here</span>
              </div>
            )}
            <p ref={statusRef} className="atlas-status" data-state="idle" aria-hidden="true">
              <span className="atlas-status-loading">Sharpening with SPHEREx tiles from IRSA…</span>
              <span className="atlas-status-down">IRSA is not answering, so the map stays at overview sharpness.</span>
            </p>
            {gl && (
              <div className="atlas-zoom" role="group" aria-label="Zoom the map">
                <button type="button" className="round" aria-label="Zoom out" disabled={!zoomed} onClick={() => zoomAt(size.current.w / 2, size.current.h / 2, 0.5)}>
                  <Minus aria-hidden="true" />
                </button>
                <button type="button" className="round" aria-label="Zoom in" onClick={() => zoomAt(size.current.w / 2, size.current.h / 2, 2)}>
                  <Plus aria-hidden="true" />
                </button>
                <button type="button" className="round" aria-label="Back to the whole sky" disabled={!zoomed} onClick={reset}>
                  <ArrowsOutSimple aria-hidden="true" />
                </button>
              </div>
            )}
            {!atlas && !p.failed && <p className="atlas-wait">Finding the whole sky…</p>}
            {(p.failed || imageFailed) && (
              <p className="atlas-wait" role="alert">
                The sky map could not be loaded. You can still go to a place by name or coordinates.
              </p>
            )}
          </div>

          {peeked && <PlacePeek marker={peeked} look={look} pinned={peek!.pinned} onGo={() => onPickRef.current(peeked.id)} />}
          {aim && (
            <div className="aim-card" role="group" aria-label={`Aimed at ${names[aim.abbr] ?? "the sky"}`} data-ra={aim.ra} data-dec={aim.dec} data-keep="true">
              <div className="aim-card-head">
                <b>{names[aim.abbr] ?? "Open sky"}</b>
                <button type="button" className="round" aria-label="Clear the aim" onClick={() => setAim(undefined)}>
                  <X aria-hidden="true" />
                </button>
              </div>
              <p className="aim-coords">
                RA {raHms(aim.ra)}
                <br />
                Dec {decDms(aim.dec)}
              </p>
              <p className="aim-note" role={aimError ? "alert" : undefined}>
                {aimError ?? "SPHEREx has looked here too. A new place takes about a minute to gather the first time."}
              </p>
              <button ref={goRef} type="button" className="pill pill-accent" disabled={aimBusy} onClick={() => void go()}>
                {aimBusy ? "Pointing the telescope…" : "Look here"}
                {!aimBusy && <ArrowRight aria-hidden="true" />}
              </button>
            </div>
          )}
        </div>
      </div>

      <footer className="atlas-foot">
        <div className="atlas-intro">
          <h1>The whole sky</h1>
          {/* Pertanyaan yang selalu muncul: "Bumi di mana?" Peta ini pandangan dari Bumi ke luar. */}
          <p>
            The sky seen from Earth, looking out in every direction, so Earth, the Sun and the Moon are not on this map. Every point of
            light is SPHEREx data, here at {lambda || "one wavelength"}. Our galaxy runs across the middle.
          </p>
          <p className="atlas-hint">
            {!gl ? "Choose a spot to look closer" : touch ? "Pinch to zoom · drag to move · tap to aim" : "Scroll to zoom · drag to move · click to aim"}
          </p>
        </div>

        <div className="atlas-controls">
          <div
            className="wave"
            role="group"
            aria-label="Wavelength"
            onPointerEnter={() => atlas?.frames.forEach((f) => void loadGray(atlasUrl(small ? f.small : f.image)).catch(() => undefined))}
          >
            <p className="wave-head">
              <span>Wavelength</span>
              <b>{lambda}</b>
            </p>
            <div className="wave-bands">
              {atlas?.frames.map((f, i) => (
                <button
                  key={f.band}
                  type="button"
                  aria-pressed={f.band === frame?.band}
                  aria-label={`${f.lambda_um.toFixed(2)} micrometres`}
                  data-loading={loadingBand === f.band && painted.current !== undefined}
                  title={`${f.lambda_um.toFixed(2)} µm`}
                  style={{ flexGrow: f.band_max_um - f.band_min_um, flexBasis: 0 }}
                  onClick={() => p.onBand(f.band)}
                >
                  <span aria-hidden="true">{i + 1}</span>
                </button>
              ))}
            </div>
            <p className="wave-scale" aria-hidden="true">
              <span>0.75</span>
              <span>5 µm</span>
            </p>
          </div>

          <div className="atlas-tools">
            <button type="button" className="pill" aria-pressed={lines} onClick={() => p.onLines(!lines)}>
              Constellations
            </button>
            <div className="atlas-looks" role="group" aria-label="Look">
              {LOOKS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={l.id === look}
                  aria-label={`${l.name} look`}
                  title={l.name}
                  style={{ background: lookGradient(l.id, "135deg") }}
                  onClick={() => p.onPalette(l.id)}
                />
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="pill pill-accent atlas-tour"
          onClick={p.onTour}
          onPointerEnter={() => setTouring(true)}
          onPointerLeave={() => setTouring(false)}
          onFocus={() => setTouring(true)}
          onBlur={() => setTouring(false)}
        >
          Show me a moving star
          <ArrowRight aria-hidden="true" />
        </button>
      </footer>
    </div>
  );
});
