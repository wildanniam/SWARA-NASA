import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { Band, TimeWindow } from "../lib/bundle";
import { monthYear } from "../lib/format";
import {
  assess,
  binVisit,
  fluxLabel,
  fluxTop,
  isUsable,
  LAMBDA_MAX,
  LAMBDA_MIN,
  type Bin,
  type Spectrum,
  type SpectrumPoint,
} from "../lib/spectrum";
import { SOUND } from "../sound/mapping";
import { phrase, Sonifier } from "../sound/sonify";

type Props = {
  spectrum?: Spectrum;
  failed: boolean;
  windows: TimeWindow[];
  /** Kunjungan yang sedang tampil di panggung. */
  windowId?: string;
  /** Band citra yang sedang tampil; ditandai di sumbu panjang gelombang. */
  band?: Band;
  /** Suara mulai memutar kunjungan ini: panggung ikut pindah dan blink berhenti. */
  onListen: (windowId: string) => void;
};

const W = 360;
const H = 188;
const M = { left: 46, right: 14, top: 10, bottom: 24 };
const MIN_POINTS = 8; // kunjungan dengan titik layak lebih sedikit tidak dibunyikan
const TICKS = [1, 2, 3, 4, 5];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const xOf = (lambda: number) =>
  M.left + clamp01((lambda - LAMBDA_MIN) / (LAMBDA_MAX - LAMBDA_MIN)) * (W - M.left - M.right);

function linePath(bins: Bin[], y: (flux: number) => number): string {
  let d = "";
  let pen = false;
  for (const b of bins) {
    if (b.flux === null) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${xOf(b.lambda).toFixed(1)} ${y(b.flux).toFixed(1)}`;
    pen = true;
  }
  return d;
}

const FLAG_TEXT: Record<SpectrumPoint["flag"], string> = {
  ok: "no problem flagged",
  saturated: "flagged saturated, accuracy not verified",
  saturated_core: "saturated, no usable value",
  bad_pixel: "bad detector pixel",
};

const sonifier = new Sonifier();

export function SpectrumPanel({ spectrum, failed, windows, windowId, band, onListen }: Props) {
  // Selama suara berjalan: kunjungan mana saja yang diputar dan kapan tiap frasa mulai.
  const [play, setPlay] = useState<{ visits: string[]; starts: number[] }>();
  const [playVisit, setPlayVisit] = useState<string>();
  const [hover, setHover] = useState<SpectrumPoint>();
  const headRef = useRef<SVGLineElement>(null);
  const listenRef = useRef(onListen);
  listenRef.current = onListen;

  const points = spectrum?.points ?? [];
  const quality = useMemo(() => (spectrum ? assess(spectrum.points) : undefined), [spectrum]);
  const top = useMemo(() => fluxTop(points), [points]);
  const binned = useMemo(
    () => new Map(windows.map((w) => [w.id, binVisit(points, w.id, SOUND.steps)])),
    [points, windows],
  );
  const playable = useMemo(
    () => windows.filter((w) => points.filter((p) => p.window === w.id && isUsable(p)).length >= MIN_POINTS),
    [points, windows],
  );

  const stop = useCallback(() => {
    sonifier.stop();
    if (headRef.current) headRef.current.style.visibility = "hidden";
    setPlay(undefined);
    setPlayVisit(undefined);
  }, []);

  const start = useCallback(
    (visits: string[]) => {
      if (!visits.length) return;
      const starts = sonifier.play(visits.map((id) => phrase(binned.get(id) ?? [], top)));
      setPlay({ visits, starts });
    },
    [binned, top],
  );

  // Benda berganti atau panel hilang: suara berhenti.
  useEffect(() => stop, [spectrum, stop]);

  // Penanda mengikuti jam audio. Digerakkan langsung di DOM supaya grafik tidak
  // dirender ulang 60 kali per detik.
  useEffect(() => {
    if (!play) return;
    let raf = 0;
    let last = -1;
    const tick = () => {
      const now = sonifier.now();
      let i = 0;
      while (i < play.starts.length - 1 && now >= play.starts[i + 1]) i++;
      const frac = (now - play.starts[i]) / SOUND.visitSeconds;
      if (i === play.starts.length - 1 && frac >= 1) {
        stop();
        return;
      }
      if (i !== last) {
        last = i;
        setPlayVisit(play.visits[i]);
        listenRef.current(play.visits[i]);
      }
      const head = headRef.current;
      if (head) {
        const x = xOf(LAMBDA_MIN + clamp01(frac) * (LAMBDA_MAX - LAMBDA_MIN));
        head.setAttribute("x1", String(x));
        head.setAttribute("x2", String(x));
        head.style.visibility = frac >= 0 && frac <= 1 ? "visible" : "hidden";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play, stop]);

  const shown = playVisit ?? windowId;
  const canListen = quality === "ok" && playable.some((w) => w.id === windowId);

  const toggle = useCallback(() => {
    if (play) stop();
    else if (canListen && windowId) start([windowId]);
  }, [play, stop, canListen, windowId, start]);

  // L = dengarkan / berhenti.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== "l") return;
      if ((e.target as HTMLElement).closest("input, select, textarea")) return;
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  if (failed) {
    return (
      <section className="spectrum">
        <h2>Spectrum</h2>
        <p className="hint">The spectrum could not be loaded.</p>
      </section>
    );
  }
  if (!spectrum || !quality) {
    return (
      <section className="spectrum">
        <h2>Spectrum</h2>
        <p className="hint">Loading spectrum…</p>
      </section>
    );
  }
  if (quality !== "ok") {
    return (
      <section className="spectrum">
        <h2>Spectrum</h2>
        <p className="spec-none">
          {quality === "faint"
            ? "Nothing at the centre of this field is bright enough for a spectrum. What SPHEREx measured here is mostly noise, so it is neither drawn nor played."
            : quality === "saturated"
              ? "This object is too bright for SPHEREx. Almost every measurement is saturated, so there is no spectrum to draw or play."
              : "There are too few usable measurements here for a spectrum."}
        </p>
      </section>
    );
  }

  const y = (flux: number) => M.top + (1 - clamp01(flux / top)) * (H - M.top - M.bottom);
  const baseline = H - M.bottom;
  const current = points.filter((p) => p.window === shown);
  const good = current.filter(isUsable);
  const unusable = current.filter((p) => !isUsable(p));
  const hasUnverified = good.some((p) => p.flag === "saturated");
  const others = windows.filter((w) => w.id !== shown && playable.includes(w));
  const shownWindow = windows.find((w) => w.id === shown);
  const shownBins = (shown && binned.get(shown)) || [];
  const peak = shownBins.reduce<Bin | undefined>(
    (best, b) => (b.flux !== null && (!best || b.flux > best.flux!) ? b : best),
    undefined,
  );
  const when = shownWindow ? monthYear(shownWindow.mjd_mid) : "";
  const summary = good.length
    ? `${good.length} of ${current.length} measurements usable${peak ? `, brightest near ${peak.lambda.toFixed(1)} µm` : ""}.`
    : "No usable measurements in this visit.";

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let best: SpectrumPoint | undefined;
    for (const p of good) {
      if (!best || Math.abs(xOf(p.lambda_um) - px) < Math.abs(xOf(best.lambda_um) - px)) best = p;
    }
    setHover(best);
  };

  return (
    <section className="spectrum">
      <h2>Spectrum</h2>
      <p className="hint">
        The same light split by wavelength. The shape of this curve is a fingerprint of what kind of object it is.
      </p>

      <svg
        className="spec-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Spectrum from 0.75 to 5 microns, visit ${when}. ${summary}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(undefined)}
      >
        {band && (
          <rect
            className="spec-band"
            x={xOf(band.lambda_min)}
            y={M.top}
            width={xOf(band.lambda_max) - xOf(band.lambda_min)}
            height={baseline - M.top}
          />
        )}
        <line className="spec-axis" x1={M.left} y1={baseline} x2={W - M.right} y2={baseline} />
        <line className="spec-grid" x1={M.left} y1={M.top} x2={W - M.right} y2={M.top} />
        <text className="spec-label" x={M.left - 6} y={M.top + 4} textAnchor="end">
          {fluxLabel(top, top >= 1 || top < 0.01 ? 1 : 0)}
        </text>
        <text className="spec-label" x={M.left - 6} y={baseline + 3} textAnchor="end">
          0
        </text>
        {TICKS.map((t) => (
          <g key={t}>
            <line className="spec-axis" x1={xOf(t)} y1={baseline} x2={xOf(t)} y2={baseline + 4} />
            <text
              className="spec-label"
              x={t === 5 ? W - 2 : xOf(t)}
              y={baseline + 16}
              textAnchor={t === 5 ? "end" : "middle"}
            >
              {t === 5 ? "5 µm" : t}
            </text>
          </g>
        ))}

        {others.map((w) => (
          <path key={w.id} className="spec-other" d={linePath(binned.get(w.id) ?? [], y)} />
        ))}
        <path className="spec-line" d={linePath(shownBins, y)} />

        {unusable.map((p, i) => (
          <line
            key={i}
            className={p.flag === "saturated_core" ? "spec-tick spec-sat" : "spec-tick spec-bad"}
            x1={xOf(p.lambda_um)}
            y1={baseline - 5}
            x2={xOf(p.lambda_um)}
            y2={baseline}
          />
        ))}
        {good.map((p, i) =>
          p.flux_jy > top ? (
            // Di luar skala: segitiga di tepi atas.
            <path
              key={i}
              className={p.flag === "ok" ? "spec-dot" : "spec-ring"}
              d={`M${xOf(p.lambda_um) - 3} ${M.top + 5}L${xOf(p.lambda_um)} ${M.top}L${xOf(p.lambda_um) + 3} ${M.top + 5}Z`}
            />
          ) : (
            <circle
              key={i}
              className={p.flag === "ok" ? "spec-dot" : "spec-ring"}
              cx={xOf(p.lambda_um)}
              cy={y(p.flux_jy)}
              r={2.2}
            />
          ),
        )}
        {hover && (
          <circle className="spec-hover" cx={xOf(hover.lambda_um)} cy={y(Math.min(hover.flux_jy, top))} r={5} />
        )}
        <line ref={headRef} className="spec-head" x1={M.left} y1={M.top} x2={M.left} y2={baseline} />
      </svg>

      <p className="spec-readout" aria-hidden={!hover}>
        {hover
          ? `${hover.lambda_um.toFixed(2)} µm · ${fluxLabel(hover.flux_jy)} ± ${fluxLabel(hover.flux_err_jy)} · ${FLAG_TEXT[hover.flag]}`
          : `${when} · ${summary}`}
      </p>

      <ul className="legend spec-legend">
        <li>
          <i className="key key-dot" /> this visit
        </li>
        {others.length > 0 && (
          <li>
            <i className="key key-line" /> other visits
          </li>
        )}
        {hasUnverified && (
          <li>
            <i className="key key-ring" /> flagged saturated: value not verified
          </li>
        )}
        {unusable.length > 0 && (
          <li>
            <i className="key key-tick" /> measured but unusable
          </li>
        )}
        {band && (
          <li>
            <i className="key key-band" /> band shown in the image
          </li>
        )}
      </ul>

      <div className="spec-actions">
        <button type="button" className="btn" onClick={toggle} disabled={!play && !canListen} aria-pressed={!!play}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            {play ? <path d="M4 4h8v8H4z" /> : <path d="M4.5 2.5v11l9-5.5z" />}
          </svg>
          {play ? "Stop" : "Listen"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => start(playable.map((w) => w.id))}
          disabled={!!play || playable.length < 2}
        >
          All {playable.length} visits
        </button>
      </div>
      <p className="hint">
        Sound runs from short to long wavelength, left to right. Higher pitch is brighter. A rougher tone marks values
        flagged as saturated, and a soft tick marks a gap in the data. <kbd>L</kbd> listens.
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {play && playVisit ? `Playing the spectrum of ${when}.` : ""}
      </p>
    </section>
  );
}
