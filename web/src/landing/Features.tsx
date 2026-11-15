import { ArrowRight } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { decDms, raHms } from "../lib/allsky";
import { prefersReducedMotion } from "../lib/hooks";
import { APP_PATH, placeHref } from "../route";
import { loadFeatureData, type FeatureData } from "./data";
import { reveal, useCountUp, useInView, useMedia } from "./hooks";

// Enam kartu "jendela bidik". Tiap kartu menggambar komponennya sendiri dari data asli
// (Barnard's Star untuk gerak, Epsilon Indi B untuk cahaya), bukan tangkapan layar.
//
// Mikro-interaksi yang sama untuk semua kartu (CSS): terangkat, kurung sudut melebar dan
// menyala, sorot cahaya mengikuti kursor, kilau yang lewat sekali, dan ajakan "Open in
// SWARA". Yang khusus tiap kartu ada di komponennya. Di layar sentuh (tanpa hover) animasi
// kartu berjalan sendiri selama kartunya terlihat.

type CardProps = {
  index: string;
  name: string;
  title: string;
  text?: string;
  href: string;
  className: string;
  onPointer?: (e: ReactPointerEvent<HTMLAnchorElement>) => void;
  /** `hot`: sedang ditunjuk (atau terlihat, di layar sentuh). `seen`: pernah terlihat. */
  children: (hot: boolean, seen: boolean) => ReactNode;
};

function Card({ index, name, title, text, href, className, onPointer, children }: CardProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [hovered, setHovered] = useState(false);
  const [viewRef, inView] = useInView<HTMLDivElement>({ once: false, threshold: 0.5 });
  const [seen, setSeen] = useState(false);
  const touch = useMedia("(hover: none)");
  useEffect(() => {
    if (inView) setSeen(true);
  }, [inView]);
  const hot = hovered || (touch && inView);
  const attach = useCallback((el: HTMLAnchorElement | null) => {
    ref.current = el;
    reveal(el);
  }, []);
  const move = (e: ReactPointerEvent<HTMLAnchorElement>) => {
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    // Dalam persen, supaya tetap tepat di bawah kursor walau kartunya diperkecil (zoom).
    el.style.setProperty("--mx", `${(((e.clientX - box.left) / box.width) * 100).toFixed(2)}%`);
    el.style.setProperty("--my", `${(((e.clientY - box.top) / box.height) * 100).toFixed(2)}%`);
    onPointer?.(e);
  };
  return (
    <a
      ref={attach}
      href={href}
      className={`lp-card lp-rise ${className}`}
      data-hot={hot}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onPointerMove={move}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <i className="lp-br lp-br-tl" aria-hidden="true" />
      <i className="lp-br lp-br-tr" aria-hidden="true" />
      <i className="lp-br lp-br-bl" aria-hidden="true" />
      <i className="lp-br lp-br-br" aria-hidden="true" />
      <span className="lp-idx">
        {index}
        <b>{name}</b>
      </span>
      <div ref={viewRef} className="lp-viz" aria-hidden="true">
        {children(hot, seen)}
      </div>
      <div className="lp-cap">
        <h3>
          {/* Panah menempel di kata terakhir supaya tidak turun sendirian ke baris baru. */}
          {title.split(" ").slice(0, -1).join(" ")}{" "}
          <span className="lp-nowrap">
            {title.split(" ").slice(-1)[0]}
            <span className="lp-cap-go" aria-hidden="true">
              <ArrowRight weight="bold" />
            </span>
          </span>
        </h3>
        {text && <p>{text}</p>}
      </div>
    </a>
  );
}

/** Kanvas lensa bundar yang menyalin salah satu kanvas sumber. */
function LensCanvas({ source, className }: { source?: HTMLCanvasElement; className: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !source) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(source, 0, 0, c.width, c.height);
  }, [source]);
  return <canvas ref={ref} className={className} width={520} height={520} data-ready={!!source} />;
}

// ---------- 01 Blink ----------

const ARC_FROM = 2010;
const ARC_TO = 2027;

function Blink({ hot, data }: { hot: boolean; data?: FeatureData["blink"] }) {
  const [at, setAt] = useState(-1);
  useEffect(() => {
    if (!hot || !data || prefersReducedMotion()) {
      setAt(-1);
      return;
    }
    // Pengamatan diputar berurutan, berhenti sebentar di yang terakhir, lalu mengulang.
    const n = data.frames.length;
    let k = 0;
    setAt(0);
    const timer = window.setInterval(() => {
      k = (k + 1) % (n + 6);
      setAt(Math.min(k, n - 1));
    }, 160);
    return () => window.clearInterval(timer);
  }, [hot, data]);

  // Pusat busur sama dengan pusat lensa (kotak 420 x 420).
  const cx = 210;
  const cy = 210;
  const angle = (y: number) => Math.PI + ((y - ARC_FROM) / (ARC_TO - ARC_FROM)) * Math.PI;
  const shown = at >= 0 && data ? data.frames[at] : undefined;
  return (
    <div className="lp-blink" data-playing={!!shown}>
      <LensCanvas source={data?.stack} className="lp-lens lp-blink-stack" />
      <LensCanvas source={shown?.canvas} className="lp-lens lp-blink-frame" />
      <svg viewBox="0 0 420 420" className="lp-blink-arc">
        <path d={`M${cx - 166} ${cy}A166 166 0 0 1 ${cx + 166} ${cy}`} className="lp-arc-line" />
        {data?.frames.map((f, i) => {
          const a = angle(f.year);
          const r1 = f.spherex ? 194 : 186;
          const x1 = cx + Math.cos(a) * r1;
          const y1 = cy + Math.sin(a) * r1;
          return (
            <g key={i} className="lp-ray" data-spherex={f.spherex} data-on={i === at} data-past={at >= 0 && i < at}>
              <path d={`M${cx + Math.cos(a) * 172} ${cy + Math.sin(a) * 172}L${x1} ${y1}`} />
              <circle cx={x1} cy={y1} r={f.spherex ? 2.6 : 2} />
            </g>
          );
        })}
        <text x={cx - 178} y={cy + 18} className="lp-arc-year" textAnchor="middle">
          {ARC_FROM}
        </text>
        <text x={cx + 178} y={cy + 18} className="lp-arc-year" textAnchor="middle">
          {ARC_TO - 1}
        </text>
      </svg>
      <span className="lp-blink-date" data-on={!!shown}>
        {shown?.label ?? ""}
      </span>
    </div>
  );
}

// ---------- 02 Difference ----------

function Difference({
  hot,
  data,
  split,
  lensRef,
}: {
  hot: boolean;
  data?: FeatureData["diff"];
  split: number;
  lensRef: RefObject<HTMLDivElement | null>;
}) {
  // Kiri garis: citra biasa (pengamatan terakhir). Kanan: citra selisih. Saat diam, selisih penuh.
  const at = hot ? split : 0;
  return (
    <div className="lp-diff">
      <div ref={lensRef} className="lp-diff-lens">
        <LensCanvas source={data?.now} className="lp-lens" />
        <div className="lp-diff-over" style={{ clipPath: `inset(0 0 0 ${(at * 100).toFixed(2)}%)` }}>
          <LensCanvas source={data?.diff} className="lp-lens" />
        </div>
        <i className="lp-diff-line" style={{ left: `${(at * 100).toFixed(2)}%` }} data-on={hot && at > 0.02 && at < 0.98} />
      </div>
      {/* Bara: terang di pengamatan terakhir. Pucat: terang di pengamatan pertama. */}
      <p className="lp-diff-key" data-on={hot}>
        <span className="lp-key-now">{data?.nowLabel.split(" ")[1] ?? ""}</span>
        <span className="lp-key-then">{data?.thenLabel.split(" ")[1] ?? ""}</span>
      </p>
    </div>
  );
}

// ---------- 03 Listen ----------

const REST = 0.6;

function Listen({ hot, data }: { hot: boolean; data?: FeatureData["spectrum"] }) {
  const [head, setHead] = useState(REST);
  useEffect(() => {
    if (!hot || prefersReducedMotion()) {
      setHead(REST);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      setHead(((t - t0) / 2600) % 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hot]);
  const bins = data?.bins ?? [];
  const top = Math.max(1e-12, ...bins.filter((v): v is number => v !== null));
  const W = 520;
  const step = W / Math.max(1, bins.length);
  const x = (head * W).toFixed(1);
  return (
    <div className="lp-listen">
      <svg viewBox={`0 0 ${W} 150`}>
        {bins.map((v, i) => {
          const bx = i * step + 2;
          const played = (i + 0.5) / bins.length <= head;
          if (v === null) return <circle key={i} cx={bx + 2} cy={122} r={1.4} className="lp-gap" />;
          const h = 6 + Math.max(0, v / top) * 104;
          return <rect key={i} x={bx} y={124 - h} width={Math.max(2, step - 4)} height={h} rx={2} className="lp-bar" data-on={played} />;
        })}
        <path d={`M${x} 6V132`} className="lp-head" />
        <circle cx={x} cy={6} r={3.5} className="lp-head-dot" />
        <text x={head > 0.8 ? Number(x) - 9 : Number(x) + 9} y={10} className="lp-head-read" textAnchor={head > 0.8 ? "end" : "start"} data-on={hot}>
          {(0.75 + head * 4.25).toFixed(2)} µm
        </text>
        {[0.75, 2, 3, 4, 5].map((l) => (
          <text key={l} x={((l - 0.75) / 4.25) * W} y={148} className="lp-axis" textAnchor={l === 0.75 ? "start" : l === 5 ? "end" : "middle"}>
            {l === 5 ? "5 µm" : l}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ---------- 04 Catalogue ----------

function Catalogue({ hot, data, seen }: { hot: boolean; data?: FeatureData["catalogue"]; seen: boolean }) {
  const ours = data?.ours ?? 0;
  const gaia = data?.gaia;
  const shown = seen && !!data;
  const oursText = useCountUp(ours, shown, 1300, 1);
  const gaiaText = useCountUp(gaia ?? 0, shown && gaia !== undefined, 1300, 1);
  // Penggaris 0 sampai 12 detik busur, 25 satuan per detik busur, mulai di x = 10.
  const at = (v: string) => 10 + parseFloat(v) * 25;
  const end = 10 + Math.max(ours, gaia ?? 0) * 25;
  const gap = gaia !== undefined ? Math.abs(ours - gaia) : 0;
  return (
    <svg viewBox="0 0 400 150" className="lp-cat" data-on={shown} data-hot={hot}>
      <text x={10} y={26} className="lp-cat-ours">
        SWARA MEASURED {oursText}″
      </text>
      <path d={`M10 40H${at(oursText)}`} className="lp-cat-ours-line" />
      <circle cx={at(oursText)} cy={40} r={5} className="lp-cat-ours-dot" />
      {gaia !== undefined && (
        <>
          <text x={10} y={66} className="lp-cat-gaia">
            GAIA PREDICTS {gaiaText}″
          </text>
          <path d={`M10 78H${at(gaiaText)}`} className="lp-cat-gaia-line" />
          <circle cx={at(gaiaText)} cy={78} r={5} className="lp-cat-gaia-dot" />
          <g className="lp-cat-gap">
            <path d={`M${end + 12} 40h5V78h-5`} />
            <text x={end + 24} y={63}>
              {gap < 0.05 ? "the same" : `${gap.toFixed(1)}″ apart`}
            </text>
          </g>
        </>
      )}
      <path d="M10 104H310" className="lp-rule" />
      {Array.from({ length: 13 }, (_, i) => (
        <g key={i}>
          <path d={`M${10 + i * 25} 104v${i % 2 ? 5 : 9}`} className="lp-rule-tick" />
          {i % 4 === 0 && (
            <text x={10 + i * 25} y={128} className="lp-axis" textAnchor="middle">
              {i}″
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

// ---------- 05 Cards ----------

function Arch() {
  return <path d="M-24 40V-12a24 24 0 0 1 48 0V40" className="lp-fan-ink" />;
}

function Fan() {
  return (
    <div className="lp-fan">
      <div className="lp-fan-card lp-fan-l">
        <svg viewBox="-45 -75 90 150">
          <rect x="-44" y="-74" width="88" height="148" rx="9" className="lp-fan-frame" />
          <Arch />
          <path d="M-12 14L0 -8L14 10" className="lp-fan-gold lp-fan-thin" />
        </svg>
      </div>
      <div className="lp-fan-card lp-fan-r">
        <svg viewBox="-45 -75 90 150">
          <rect x="-44" y="-74" width="88" height="148" rx="9" className="lp-fan-frame" />
          <circle r="15" cy="-6" className="lp-fan-ink" />
          {Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * Math.PI * 2;
            const len = 26 + ((i * 7) % 9);
            return (
              <path
                key={i}
                d={`M${Math.cos(a) * 20} ${-6 + Math.sin(a) * 20}L${Math.cos(a) * len} ${-6 + Math.sin(a) * len}`}
                className="lp-fan-gold"
              />
            );
          })}
        </svg>
      </div>
      <div className="lp-fan-card lp-fan-m">
        <svg viewBox="-45 -75 90 150">
          <rect x="-44" y="-74" width="88" height="148" rx="9" className="lp-fan-frame" />
          <Arch />
          <path d="M-2 30L4 -18" className="lp-fan-streak" />
          {Array.from({ length: 9 }, (_, i) => {
            const a = Math.PI + (i / 8) * Math.PI;
            return (
              <path key={i} d={`M${Math.cos(a) * 30} ${-12 + Math.sin(a) * 30}L${Math.cos(a) * 37} ${-12 + Math.sin(a) * 37}`} className="lp-fan-gold" />
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ---------- 06 Anywhere ----------

// Wolf 359, salah satu koordinat bebas yang sudah dicoba: 291 eksposur SPHEREx.
const WOLF = { ra: 164.0924, dec: 6.9952, exposures: 291, read: 195 };
const DIGITS = "0123456789";
const decPadded = (dec: number) => decDms(dec).replace(/^([+−])(\d)°/, (_, s: string, d: string) => `${s}0${d}°`);

function useScramble(text: string, run: number): string {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (!run || prefersReducedMotion()) {
      setShown(text);
      return;
    }
    // Angka diacak lalu mengunci satu per satu dari kiri, seperti alat yang membidik.
    let frame = 0;
    const timer = window.setInterval(() => {
      frame++;
      const settled = Math.floor(frame / 2);
      setShown([...text].map((ch, i) => (/\d/.test(ch) && i >= settled ? DIGITS[Math.floor(Math.random() * 10)] : ch)).join(""));
      if (settled >= text.length) window.clearInterval(timer);
    }, 34);
    return () => window.clearInterval(timer);
  }, [text, run]);
  return shown;
}

function Anywhere({ hot, seen }: { hot: boolean; seen: boolean }) {
  // Pembacaan diulang tiap kali kartunya mulai terlihat atau ditunjuk.
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (seen) setRun((n) => n + 1);
  }, [seen]);
  useEffect(() => {
    if (hot) setRun((n) => n + 1);
  }, [hot]);
  const ra = useScramble(raHms(WOLF.ra), run);
  const dec = useScramble(decPadded(WOLF.dec), run);
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (prefersReducedMotion()) {
      setCount(WOLF.read);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const x = Math.min(1, (t - t0) / 1500);
      setCount(Math.round(WOLF.read * (1 - Math.pow(1 - x, 3))));
      if (x < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run]);
  const frac = count / WOLF.exposures;
  const C = 2 * Math.PI * 28;
  return (
    <div className="lp-any">
      <div>
        <span className="lp-lab">RA</span>
        <b>{ra}</b>
      </div>
      <div>
        <span className="lp-lab">Dec</span>
        <b>{dec}</b>
      </div>
      <svg viewBox="-35 -35 70 70" className="lp-ring">
        <circle r="28" className="lp-ring-track" />
        <circle r="28" className="lp-ring-fill" strokeDasharray={`${(frac * C).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90)" />
        <text y="4" textAnchor="middle">
          {Math.round(frac * 100)}%
        </text>
      </svg>
      <div>
        <span className="lp-lab">Reading</span>
        <em>
          {count} of {WOLF.exposures} exposures
        </em>
      </div>
    </div>
  );
}

// ---------- bagian ----------

export function Features() {
  const [sectionRef, near] = useInView<HTMLElement>({ rootMargin: "800px 0px" });
  const [data, setData] = useState<FeatureData>();
  const [split, setSplit] = useState(0.5);
  const diffLens = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!near || data) return;
    let alive = true;
    loadFeatureData()
      .then((d) => alive && setData(d))
      .catch((err) => console.error(err));
    return () => {
      alive = false;
    };
  }, [near, data]);

  return (
    <section ref={sectionRef} id="features" className="lp-sec lp-features" aria-labelledby="features-title">
      <span ref={reveal} className="lp-kick lp-rise">
        What it does
      </span>
      <h2 ref={reveal} id="features-title" className="lp-h2 lp-rise">
        Six instruments,
        <br />
        one patch of sky.
      </h2>
      <div className="lp-bento">
        <Card
          index="01"
          name="Blink"
          title="Sixteen years of one place"
          text="Fourteen WISE epochs and every SPHEREx visit, played like a small film. Each ray is one night a telescope looked."
          href={placeHref("barnard")}
          className="lp-c1"
        >
          {(hot) => <Blink hot={hot} data={data?.blink} />}
        </Card>
        <Card
          index="02"
          name="Difference"
          title="Now, minus then"
          text="Stars that stayed cancel out. The ember is where it is; the pale ghost is where it was."
          href={placeHref("barnard")}
          className="lp-c2"
          onPointer={(e) => {
            const box = diffLens.current?.getBoundingClientRect();
            if (box) setSplit(Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)));
          }}
        >
          {(hot) => <Difference hot={hot} data={data?.diff} split={split} lensRef={diffLens} />}
        </Card>
        <Card
          index="03"
          name="Listen"
          title="Hear the spectrum"
          text={`${data?.spectrum.name ?? "Epsilon Indi B"}'s light, 0.75 to 5 µm, as sound. Higher is brighter.`}
          href={placeHref("epsindb")}
          className="lp-c3"
        >
          {(hot) => <Listen hot={hot} data={data?.spectrum} />}
        </Card>
        <Card
          index="04"
          name="Catalogue"
          title="Checked against Gaia"
          text="Our number, and the catalogue's, on the same ruler."
          href={placeHref("barnard")}
          className="lp-c4"
        >
          {(hot, seen) => <Catalogue hot={hot} data={data?.catalogue} seen={seen} />}
        </Card>
        <Card index="05" name="Cards" title="Three cards" text="Where it lives, how it moves, what its light is." href={placeHref("epsindb")} className="lp-c5">
          {() => <Fan />}
        </Card>
        <Card index="06" name="Anywhere" title="Any coordinate, in about a minute" href={APP_PATH} className="lp-c6">
          {(hot, seen) => <Anywhere hot={hot} seen={seen} />}
        </Card>
      </div>
    </section>
  );
}
