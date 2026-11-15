import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../lib/hooks";

// Dua diagram halaman SPHEREx. Warna mengikuti palet SWARA: biru pucat untuk panjang
// gelombang pendek, ambar sampai bara untuk yang panjang. Bukan pelangi, karena inframerah
// tidak punya warna yang bisa dilihat mata; rampanya hanya penanda pendek ke panjang.

const PALE = "#cdd6ff";
const AMBER = "#ffb454";
const EMBER = "#c8601e";

/** Penanda panah: ujung runcing searah garis, jadi arah sebab ke akibat terbaca. */
function Arrowhead({ id, color }: { id: string; color: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill={color} />
    </marker>
  );
}

/** Memutar langkah 0..n berulang selama diagram terlihat. Gerak dikurangi: langsung keadaan akhir. */
function useSteps(n: number, stepMs: number, holdMs: number) {
  const ref = useRef<SVGSVGElement>(null);
  const [step, setStep] = useState(0);
  const [still, setStill] = useState(false);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setStill(true);
      setStep(n);
      return;
    }
    const el = ref.current;
    if (!el) return;
    let timer = 0;
    let visible = false;
    let s = 0;
    const tick = () => {
      if (!visible) return;
      s = s >= n ? 0 : s + 1;
      setStep(s);
      timer = window.setTimeout(tick, s === n ? holdMs : s === 0 ? 700 : stepMs);
    };
    const io = new IntersectionObserver(
      ([e]) => {
        const was = visible;
        visible = e.isIntersecting;
        if (visible && !was) timer = window.setTimeout(tick, 500);
        if (!visible) window.clearTimeout(timer);
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, [n, stepMs, holdMs]);
  return { ref, step, still };
}

// ---------- filter variabel linier ----------

/** Detektor 1 (0,75 sampai 1,09 µm, tabel band Caltech). Lima eksposur contoh; terangnya
 *  ilustrasi, bukan data benda tertentu. */
const LO = 0.75;
const HI = 1.09;
const SHOTS = [
  { um: 0.8, b: 0.42 },
  { um: 0.87, b: 0.7 },
  { um: 0.94, b: 0.55 },
  { um: 1.01, b: 0.86 },
  { um: 1.07, b: 0.64 },
];
const TOP = 104;
const BOTTOM = 410;
const yOf = (um: number) => BOTTOM - ((um - LO) / (HI - LO)) * (BOTTOM - TOP);
const AXIS_X = 196;
const xOf = (b: number) => AXIS_X + 24 + b * 210;

export function LvfDiagram() {
  const { ref, step, still } = useSteps(SHOTS.length, 1500, 3200);
  const shown = SHOTS.slice(0, step);
  const current = step > 0 ? SHOTS[step - 1] : undefined;
  const starY = yOf((current ?? SHOTS[0]).um);
  const curve = shown.map((s) => `${xOf(s.b)},${yOf(s.um)}`).join(" ");
  return (
    <svg
      ref={ref}
      className="sx-diagram sx-lvf"
      data-still={still}
      viewBox="0 0 560 500"
      role="img"
      aria-labelledby="lvf-t lvf-d"
    >
      <title id="lvf-t">How one detector builds a spectrum</title>
      <desc id="lvf-d">
        Detector 1 passes 0.75 microns at the bottom and 1.09 microns at the top. The telescope turns a little between exposures,
        so the same star climbs the detector one step at a time. Each step records the star's brightness at one wavelength, and
        five steps give five points of its spectrum.
      </desc>
      <defs>
        <Arrowhead id="lvf-head" color="rgba(205,214,255,0.7)" />
        <Arrowhead id="lvf-link" color={AMBER} />
        <linearGradient id="lvf-ramp" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={PALE} />
          <stop offset="0.55" stopColor={AMBER} />
          <stop offset="1" stopColor={EMBER} />
        </linearGradient>
        <radialGradient id="lvf-star">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.35" stopColor="#fff6e6" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff6e6" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* judul kecil */}
      <text className="sx-t sx-t-dim" x="28" y="34">
        DETECTOR 1
      </text>
      <text className="sx-t sx-t-acc" x="532" y="34" textAnchor="end">
        EXPOSURE {Math.max(step, 1)} / {SHOTS.length}
      </text>

      {/* detektor: rampa panjang gelombang, pendek di bawah */}
      <rect x="40" y={TOP} width="76" height={BOTTOM - TOP} rx="6" fill="url(#lvf-ramp)" opacity="0.5" />
      <rect x="40" y={TOP} width="76" height={BOTTOM - TOP} rx="6" fill="none" stroke="rgba(205,214,255,0.45)" />
      {Array.from({ length: 11 }, (_, i) => (
        <line
          key={i}
          x1="108"
          x2="116"
          y1={TOP + (i * (BOTTOM - TOP)) / 10}
          y2={TOP + (i * (BOTTOM - TOP)) / 10}
          stroke="#05060b"
          strokeOpacity="0.6"
        />
      ))}
      <text className="sx-t" x="78" y={BOTTOM + 30} textAnchor="middle">
        0.75 µm
      </text>
      <text className="sx-t" x="78" y={TOP - 16} textAnchor="middle">
        1.09 µm
      </text>

      {/* sumbu spektrum: panjang gelombang ke atas (sejajar detektor), terang ke kanan */}
      <line x1={AXIS_X} y1={BOTTOM + 8} x2={AXIS_X} y2={TOP - 6} className="sx-axis" markerEnd="url(#lvf-head)" />
      <line x1={AXIS_X} y1={BOTTOM + 8} x2="530" y2={BOTTOM + 8} className="sx-axis" markerEnd="url(#lvf-head)" />
      <text className="sx-t sx-t-dim" x="530" y={BOTTOM + 36} textAnchor="end">
        brightness
      </text>
      <text className="sx-t sx-t-dim" x={AXIS_X + 14} y={TOP - 16}>
        wavelength
      </text>

      {/* kurva yang terbentuk */}
      {shown.length > 1 && <polyline points={curve} className="sx-curve" key={`curve-${step}`} data-fresh={!still} />}

      {/* tiap eksposur: penghubung dari bintang ke titiknya, lalu titik dan panjang gelombangnya */}
      {shown.map((s, i) => {
        const y = yOf(s.um);
        const x = xOf(s.b);
        const fresh = i === step - 1 && !still;
        return (
          <g key={s.um} className={fresh ? "sx-shot sx-shot-new" : "sx-shot"}>
            <line x1="124" y1={y} x2={x - 12} y2={y} className="sx-link" markerEnd="url(#lvf-link)" />
            <circle cx={x} cy={y} r="7" className="sx-dot" />
            <text className="sx-t" x={x + 16} y={y + 6}>
              {s.um.toFixed(2)} µm
            </text>
          </g>
        );
      })}

      {/* bintang yang sama, naik satu langkah tiap eksposur */}
      <g className="sx-star" style={{ transform: `translateY(${starY}px)`, opacity: step === 0 ? 0 : 1 }}>
        <circle cx="78" cy="0" r="20" fill="url(#lvf-star)" />
        <circle cx="78" cy="0" r="5" fill="#fff" />
      </g>

      <text className="sx-t sx-t-acc" x="28" y="472">
        ↑ the star climbs one step per exposure
      </text>
    </svg>
  );
}

// ---------- pemisah dikroik ----------

function Tile({ x, y, w, h, n, short }: { x: number; y: number; w: number; h: number; n: number; short: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="5" fill={`url(#${short ? "sp-tile-s" : "sp-tile-l"})`} opacity="0.55" />
      <rect x={x} y={y} width={w} height={h} rx="5" fill="none" stroke="rgba(205,214,255,0.5)" />
      <text className="sx-t sx-t-ink" x={x + w / 2} y={y + h / 2 + 7} textAnchor="middle">
        {n}
      </text>
    </g>
  );
}

/** Cahaya teleskop sampai di pelat dikroik: yang pendek dipantulkan ke atas, yang panjang
 *  diteruskan (halaman instrumen Caltech). Tiap bidang fokus berisi tiga detektor. */
export function SplitDiagram() {
  const { ref, still } = useSteps(1, 1000, 1000);
  const PX = 250;
  const PY = 270;
  return (
    <svg
      ref={ref}
      className="sx-diagram sx-split-d"
      data-still={still}
      viewBox="0 0 560 420"
      role="img"
      aria-labelledby="split-t split-d"
    >
      <title id="split-t">Light path to the six detectors</title>
      <desc id="split-d">
        Light from the telescope reaches a tilted dichroic plate. It reflects the shorter wavelengths, 0.75 to 2.42 microns, up to
        detectors 1 to 3, and lets the longer wavelengths, 2.42 to 5.0 microns, pass through to detectors 4 to 6.
      </desc>
      <defs>
        <filter id="sp-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <linearGradient id="sp-tile-s" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={PALE} />
          <stop offset="1" stopColor="#e8e2d4" />
        </linearGradient>
        <linearGradient id="sp-tile-l" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={AMBER} />
          <stop offset="1" stopColor={EMBER} />
        </linearGradient>
        <linearGradient id="sp-plate" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f2efe8" stopOpacity="0.9" />
          <stop offset="0.5" stopColor={PALE} stopOpacity="0.35" />
          <stop offset="1" stopColor={AMBER} stopOpacity="0.7" />
        </linearGradient>
      </defs>

      {/* berkas masuk */}
      <text className="sx-t sx-t-dim" x="20" y={PY - 22}>
        TELESCOPE
      </text>
      <text className="sx-t sx-t-dim" x="20" y={PY - 46}>
        LIGHT FROM
      </text>
      <line x1="20" y1={PY} x2={PX} y2={PY} stroke="#fff6e6" strokeWidth="9" opacity="0.35" filter="url(#sp-glow)" />
      <line x1="20" y1={PY} x2={PX} y2={PY} stroke="#fff6e6" strokeWidth="2.5" />
      <line x1="20" y1={PY} x2={PX} y2={PY} className="sx-flow-dash" stroke="#fff" />

      {/* berkas pendek: dipantulkan ke atas, melebar ke bidang fokus */}
      <polygon points={`${PX - 6},${PY} ${PX + 6},${PY} ${PX + 96},110 ${PX - 96},110`} fill={PALE} opacity="0.08" />
      <line x1={PX} y1={PY} x2={PX} y2="116" stroke={PALE} strokeWidth="9" opacity="0.35" filter="url(#sp-glow)" />
      <line x1={PX} y1={PY} x2={PX} y2="116" stroke={PALE} strokeWidth="2.5" />
      <line x1={PX} y1={PY} x2={PX} y2="116" className="sx-flow-dash" stroke="#fff" />
      <Tile x={PX - 96} y={46} w={60} h={60} n={1} short />
      <Tile x={PX - 30} y={46} w={60} h={60} n={2} short />
      <Tile x={PX + 36} y={46} w={60} h={60} n={3} short />
      <text className="sx-t" x={PX + 112} y="72">
        0.75–2.42 µm
      </text>
      <text className="sx-t sx-t-dim" x={PX + 112} y="96">
        shorter
      </text>

      {/* berkas panjang: menembus pelat, melebar ke bidang fokus kedua */}
      <polygon points={`${PX},${PY - 6} ${PX},${PY + 6} 440,${PY + 96} 440,${PY - 96}`} fill={AMBER} opacity="0.07" />
      <line x1={PX} y1={PY} x2="434" y2={PY} stroke={AMBER} strokeWidth="9" opacity="0.35" filter="url(#sp-glow)" />
      <line x1={PX} y1={PY} x2="434" y2={PY} stroke={AMBER} strokeWidth="2.5" />
      <line x1={PX} y1={PY} x2="434" y2={PY} className="sx-flow-dash" stroke="#fff" />
      <Tile x={444} y={PY - 96} w={60} h={60} n={4} short={false} />
      <Tile x={444} y={PY - 30} w={60} h={60} n={5} short={false} />
      <Tile x={444} y={PY + 36} w={60} h={60} n={6} short={false} />
      <text className="sx-t" x="540" y={PY + 132} textAnchor="end">
        2.42–5.0 µm
      </text>
      <text className="sx-t sx-t-dim" x="540" y={PY + 156} textAnchor="end">
        longer
      </text>

      {/* pelat dikroik, miring 45 derajat */}
      <g transform={`rotate(45 ${PX} ${PY})`}>
        <rect x={PX - 7} y={PY - 70} width="14" height="140" rx="3" fill="url(#sp-plate)" stroke="rgba(255,255,255,0.6)" />
      </g>
      <line x1={PX - 40} y1={PY + 52} x2={PX - 70} y2={PY + 96} stroke="rgba(205,214,255,0.5)" />
      <text className="sx-t sx-t-acc" x={PX - 70} y={PY + 122} textAnchor="middle">
        DICHROIC
      </text>
    </svg>
  );
}
