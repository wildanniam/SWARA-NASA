import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { prefersReducedMotion } from "../lib/hooks";
import { placeHref } from "../route";
import { loadWhyData, type WhyData } from "./data";
import { reveal, useInView } from "./hooks";

// Bagian Why: judulnya diperlihatkan, bukan dicoret. Satu panel, satu tempat (Barnard's Star):
// kiri "a sky viewer" melihat satu citra SPHEREx apa adanya; kanan SWARA melihat tempat yang
// sama dengan jejak 16 tahunnya, satu sinar per pengamatan, dan angka terukur di samping Gaia.
// Garis tengahnya bisa diseret (atau digeser dengan panah) untuk membandingkan.

const START = 0.38;

function Copy({ source, className }: { source?: HTMLCanvasElement; className: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !source) return;
    c.width = source.width;
    c.height = source.height;
    c.getContext("2d")!.drawImage(source, 0, 0);
  }, [source]);
  return <canvas ref={ref} className={className} data-ready={!!source} />;
}

/** Sinar waktu di sekeliling lensa: satu per pengamatan, pada tanggalnya (2010 kiri, 2026 kanan). */
function Rays({ looks }: { looks: WhyData["looks"] }) {
  const cx = 210;
  const cy = 210;
  const angle = (y: number) => Math.PI + ((y - 2010) / 17) * Math.PI;
  return (
    <svg viewBox="0 0 420 420" className="lp-cmp-rays" aria-hidden="true">
      <path d={`M${cx - 166} ${cy}A166 166 0 0 1 ${cx + 166} ${cy}`} className="lp-arc-line" />
      {looks.map((l, i) => {
        const a = angle(l.year);
        const r1 = l.spherex ? 194 : 186;
        return (
          <g key={i} className="lp-ray" data-spherex={l.spherex} style={{ "--i": i } as CSSProperties}>
            <path d={`M${cx + Math.cos(a) * 172} ${cy + Math.sin(a) * 172}L${cx + Math.cos(a) * r1} ${cy + Math.sin(a) * r1}`} />
            <circle cx={cx + Math.cos(a) * r1} cy={cy + Math.sin(a) * r1} r={l.spherex ? 2.6 : 2} />
          </g>
        );
      })}
      <text x={cx - 178} y={cy + 18} className="lp-arc-year" textAnchor="middle">
        2010
      </text>
      <text x={cx + 178} y={cy + 18} className="lp-arc-year" textAnchor="middle">
        2026
      </text>
    </svg>
  );
}

const PILLARS = [
  ["01", "Sixteen years,", "in order.", "WISE from 2010, then SPHEREx from 2025, lined up on the same patch so anything that moved gives itself away."],
  ["02", "A number,", "beside the catalogue's.", "Every shift we measure is shown next to what Gaia and SIMBAD say. What cannot be measured is said plainly."],
  ["03", "Light you can", "listen to.", "The image, the spectrum and the motion play together on one clock, so the sky can be read by ear."],
];

export function Why() {
  const [sectionRef, near] = useInView<HTMLElement>({ rootMargin: "900px 0px" });
  const [panelView, panelSeen] = useInView<HTMLDivElement>({ threshold: 0.45 });
  const [data, setData] = useState<WhyData>();
  const [split, setSplit] = useState(START);
  const [dragging, setDragging] = useState(false);
  const touched = useRef(false);
  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!near || data) return;
    let alive = true;
    loadWhyData()
      .then((d) => alive && setData(d))
      .catch((err) => console.error(err));
    return () => {
      alive = false;
    };
  }, [near, data]);

  // Sekali saat panel pertama terlihat, garisnya bergeser sedikit dan kembali: tanda bisa diseret.
  useEffect(() => {
    if (!panelSeen || !data || prefersReducedMotion()) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      if (touched.current) return;
      const x = Math.min(1, (t - t0) / 1600);
      setSplit(START + Math.sin(x * Math.PI) * 0.1);
      if (x < 1) raf = requestAnimationFrame(tick);
    };
    const wait = window.setTimeout(() => (raf = requestAnimationFrame(tick)), 500);
    return () => {
      window.clearTimeout(wait);
      cancelAnimationFrame(raf);
    };
  }, [panelSeen, data]);

  const setFrom = (clientX: number) => {
    const box = panel.current?.getBoundingClientRect();
    if (box) setSplit(Math.min(0.94, Math.max(0.06, (clientX - box.left) / box.width)));
  };
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest("a")) return;
    touched.current = true;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    setFrom(e.clientX);
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging) setFrom(e.clientX);
  };
  const up = () => setDragging(false);
  const key = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 0.1 : 0.04;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      touched.current = true;
      setSplit((s) => Math.min(0.94, Math.max(0.06, s + (e.key === "ArrowRight" ? step : -step))));
    }
  };

  const pct = `${(split * 100).toFixed(2)}%`;
  return (
    <section ref={sectionRef} id="why" className="lp-sec lp-why" aria-labelledby="why-title">
      <span ref={reveal} className="lp-kick lp-rise">
        Why SWARA
      </span>
      <h2 ref={reveal} id="why-title" className="lp-h2 lp-rise">
        Sky viewers show you a picture.
        <br />
        SWARA shows you what happened.
      </h2>

      <div
        ref={(el) => {
          panel.current = el;
          panelView.current = el;
          reveal(el);
        }}
        className="lp-cmp lp-rise"
        data-ready={!!data}
        data-dragging={dragging}
        data-seen={panelSeen}
        style={{ "--split": pct } as CSSProperties}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <Copy source={data?.context} className="lp-cmp-sky" />

        {/* Sisi SWARA: tempat yang sama, dengan apa yang terjadi di sana. */}
        <div className="lp-cmp-side lp-cmp-swara" aria-hidden={split > 0.9}>
          <div className="lp-cmp-optic">
            <Copy source={data?.stack} className="lp-cmp-lens" />
            <i className="lp-cmp-arrow" aria-hidden="true" />
            {data && <Rays looks={data.looks} />}
          </div>
          <span className="lp-cmp-tag lp-cmp-tag-r">SWARA</span>
          <div className="lp-cmp-read">
            <span className="lp-cmp-lab">{data?.name ?? "Barnard's Star"} · measured</span>
            <b>{data ? `${data.ours.toFixed(1)}″` : ""}</b>
            <span className="lp-cmp-line">
              {data?.line}
              {data?.gaia !== undefined && (
                <>
                  <br />
                  <em>Gaia predicts {data.gaia.toFixed(1)}″</em>
                </>
              )}
            </span>
            <a className="lp-cmp-go" href={placeHref("barnard")}>
              See it move →
            </a>
          </div>
        </div>

        {/* Sisi penampil langit biasa: satu citra, tidak ada apa-apa lagi. */}
        <div className="lp-cmp-side lp-cmp-plain" aria-hidden={split < 0.1}>
          <span className="lp-cmp-tag">A sky viewer</span>
          <div className="lp-cmp-cap">
            <b>One picture.</b>
            <p>The same patch of sky, once. Nothing in it seems to move.</p>
          </div>
        </div>

        <i className="lp-br lp-br-tl" aria-hidden="true" />
        <i className="lp-br lp-br-tr" aria-hidden="true" />
        <i className="lp-br lp-br-bl" aria-hidden="true" />
        <i className="lp-br lp-br-br" aria-hidden="true" />
        <i className="lp-cmp-divider" aria-hidden="true" />
        <button
          type="button"
          className="lp-cmp-knob"
          role="slider"
          aria-label="Compare one picture with what SWARA shows"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(split * 100)}
          aria-valuetext={`${Math.round((1 - split) * 100)}% SWARA`}
          onKeyDown={key}
        >
          <i aria-hidden="true" />
        </button>
      </div>

      <div className="lp-pillars">
        {PILLARS.map(([n, lead, accent, text], i) => (
          <div key={n} ref={reveal} className="lp-pillar lp-rise" style={{ "--d": `${i * 110}ms` } as CSSProperties}>
            <span className="lp-pillar-n">{n}</span>
            <h3>
              {lead} <em>{accent}</em>
            </h3>
            <p>{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
