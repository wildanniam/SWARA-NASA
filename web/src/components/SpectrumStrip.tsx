import { Play, Stop } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { Band, TimeWindow } from "../lib/bundle";
import { microns, monthYear } from "../lib/format";
import { useWidth } from "../lib/hooks";
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
import { phrase, sonifier } from "../sound/sonify";

type Props = {
  spectrum?: Spectrum;
  failed: boolean;
  windows: TimeWindow[];
  /** Kunjungan yang sedang tampil di lensa. */
  windowId?: string;
  bands: Band[];
  /** Band citra yang dipilih pengguna. */
  bandId?: string;
  bandHasFrames: (id: string) => boolean;
  onBand: (id: string) => void;
  /** Suara mulai memutar kunjungan ini: lensa ikut pindah dan blink berhenti. */
  onListen: (windowId: string) => void;
  /** Band yang sedang terdengar, supaya lensa menampilkan band yang sama. */
  onHear: (bandId: string | undefined) => void;
  /** Busur di cincin lensa; menyapu seiring suara. */
  soundRing: RefObject<SVGCircleElement | null>;
};

const H = 84;
const M = { left: 2, right: 2, top: 12, bottom: 18 };
const MIN_POINTS = 8; // kunjungan dengan titik layak lebih sedikit tidak dibunyikan
const TICKS = [1, 2, 3, 4, 5];
const HEARD_KEY = "sce.heard";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const FLAG_TEXT: Record<SpectrumPoint["flag"], string> = {
  ok: "no problem flagged",
  saturated: "flagged saturated, value not verified",
  saturated_core: "saturated, no usable value",
  bad_pixel: "bad detector pixel",
};

const NO_SPECTRUM = {
  faint: "No spectrum here. Nothing at the centre is bright enough, so nothing is drawn or played.",
  saturated: "No spectrum here. This object is too bright for SPHEREx: almost every measurement is saturated.",
  empty: "No spectrum here. There are too few usable measurements.",
} as const;

/** Pita spektrum selebar dok. Enam ruasnya adalah enam band citra, jadi pita ini
 *  sekaligus pemilih band; saat suara berjalan, band yang terdengar ikut tampil di lensa. */
export function SpectrumStrip(p: Props) {
  const { spectrum, windows, windowId, bands } = p;
  const [plotRef, width] = useWidth<HTMLDivElement>();
  const W = Math.max(width, 240);
  const xOf = useCallback(
    (lambda: number) =>
      M.left + clamp01((lambda - LAMBDA_MIN) / (LAMBDA_MAX - LAMBDA_MIN)) * (W - M.left - M.right),
    [W],
  );

  // Selama suara berjalan: kunjungan mana saja yang diputar dan kapan tiap frasa mulai.
  const [play, setPlay] = useState<{ visits: string[]; starts: number[] }>();
  const [playVisit, setPlayVisit] = useState<string>();
  const [heard, setHeard] = useState<string>();
  const [hover, setHover] = useState<SpectrumPoint>();
  const [fresh, setFresh] = useState(() => {
    try {
      return !window.localStorage.getItem(HEARD_KEY);
    } catch {
      return false;
    }
  });
  const headRef = useRef<SVGLineElement>(null);
  const listenRef = useRef(p.onListen);
  listenRef.current = p.onListen;
  const hearRef = useRef(p.onHear);
  hearRef.current = p.onHear;

  const points = useMemo(() => spectrum?.points ?? [], [spectrum]);
  const quality = useMemo(() => (spectrum ? assess(spectrum.points) : undefined), [spectrum]);
  const top = useMemo(() => fluxTop(points), [points]);
  const binned = useMemo(
    () => new Map(windows.map((w) => [w.id, binVisit(points, w.id, SOUND.steps)])),
    [points, windows],
  );
  const playable = useMemo(
    () => windows.filter((w) => points.filter((q) => q.window === w.id && isUsable(q)).length >= MIN_POINTS),
    [points, windows],
  );

  const stop = useCallback(() => {
    sonifier.stop();
    if (headRef.current) headRef.current.style.visibility = "hidden";
    p.soundRing.current?.setAttribute("stroke-dasharray", "0 100");
    setPlay(undefined);
    setPlayVisit(undefined);
    setHeard(undefined);
    hearRef.current(undefined);
  }, [p.soundRing]);

  const start = useCallback(
    (visits: string[]) => {
      if (!visits.length) return;
      const starts = sonifier.play(visits.map((id) => phrase(binned.get(id) ?? [], top)));
      setPlay({ visits, starts });
      setFresh(false);
      try {
        window.localStorage.setItem(HEARD_KEY, "1");
      } catch {
        // penyimpanan diblokir: petunjuknya hanya muncul lagi lain kali
      }
    },
    [binned, top],
  );

  // Benda berganti atau pita hilang: suara berhenti.
  useEffect(() => stop, [spectrum, stop]);

  // Penanda, busur cincin, dan band yang terdengar mengikuti jam audio. Digerakkan
  // langsung di DOM supaya grafik tidak dirender ulang 60 kali per detik.
  useEffect(() => {
    if (!play) return;
    let raf = 0;
    let lastVisit = -1;
    let lastBand: string | undefined;
    const tick = () => {
      const now = sonifier.now();
      let i = 0;
      while (i < play.starts.length - 1 && now >= play.starts[i + 1]) i++;
      const frac = (now - play.starts[i]) / SOUND.visitSeconds;
      if (i === play.starts.length - 1 && frac >= 1) {
        stop();
        return;
      }
      if (i !== lastVisit) {
        lastVisit = i;
        setPlayVisit(play.visits[i]);
        listenRef.current(play.visits[i]);
      }
      const lambda = LAMBDA_MIN + clamp01(frac) * (LAMBDA_MAX - LAMBDA_MIN);
      const band = (bands.find((b) => lambda >= b.lambda_min && lambda < b.lambda_max) ?? bands[bands.length - 1])?.id;
      if (frac >= 0 && band !== lastBand) {
        lastBand = band;
        setHeard(band);
        hearRef.current(band);
      }
      const head = headRef.current;
      if (head) {
        const x = xOf(lambda);
        head.setAttribute("x1", String(x));
        head.setAttribute("x2", String(x));
        head.style.visibility = frac >= 0 && frac <= 1 ? "visible" : "hidden";
      }
      p.soundRing.current?.setAttribute("stroke-dasharray", `${clamp01(frac) * 100} 100`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play, stop, bands, xOf, p.soundRing]);

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
      if ((e.target as HTMLElement).closest?.("input, select, textarea, [role=dialog]")) return;
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const y = (flux: number) => M.top + (1 - clamp01(flux / top)) * (H - M.top - M.bottom);
  const baseline = H - M.bottom;
  const linePath = (bins: Bin[]) => {
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
  };

  const drawn = quality === "ok";
  const current = drawn ? points.filter((q) => q.window === shown) : [];
  const good = current.filter(isUsable);
  const unusable = current.filter((q) => !isUsable(q));
  const others = drawn ? windows.filter((w) => w.id !== shown && playable.includes(w)) : [];
  const shownWindow = windows.find((w) => w.id === shown);
  const when = shownWindow ? monthYear(shownWindow.mjd_mid) : "";
  const summary = drawn ? `${good.length} of ${current.length} measurements usable` : "";
  const message = p.failed
    ? "The spectrum could not be loaded."
    : !spectrum
      ? "Loading spectrum"
      : quality && quality !== "ok"
        ? NO_SPECTRUM[quality]
        : !good.length
          ? "No usable measurements in this visit."
          : undefined;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let best: SpectrumPoint | undefined;
    for (const q of good) {
      if (!best || Math.abs(xOf(q.lambda_um) - px) < Math.abs(xOf(best.lambda_um) - px)) best = q;
    }
    setHover(best);
  };

  return (
    <>
      <div className="dock-lead">
        <button
          type="button"
          className="dial"
          onClick={toggle}
          disabled={!play && !canListen}
          aria-pressed={!!play}
          aria-label={play ? "Stop the sound" : "Listen to the spectrum of this visit"}
        >
          {play ? <Stop weight="fill" /> : <Play weight="fill" />}
        </button>
        <span className="dial-caption">{play ? "Stop" : fresh && canListen ? "Hear what it is" : "Listen"}</span>
      </div>

      <div className="strip">
        <div
          ref={plotRef}
          className="strip-plot"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(undefined)}
        >
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={
              drawn ? `Spectrum from 0.75 to 5 microns, visit ${when}. ${summary}.` : (message ?? "Spectrum")
            }
          >
            <line className="spec-axis" x1={M.left} y1={baseline} x2={W - M.right} y2={baseline} />
            {TICKS.map((t) => (
              <text
                key={t}
                className="spec-label"
                x={t === 5 ? W - M.right : xOf(t)}
                y={H - 4}
                textAnchor={t === 5 ? "end" : "middle"}
              >
                {t === 5 ? "5 µm" : t}
              </text>
            ))}
            {/* Di pita sempit ruas terakhir terlalu kecil untuk angka ini; nilainya tetap ada di pembacaan titik. */}
            {drawn && W >= 560 && (
              <text className="spec-label" x={W - M.right - 4} y={M.top - 2} textAnchor="end">
                {fluxLabel(top, top >= 1 || top < 0.01 ? 1 : 0)}
              </text>
            )}
            {others.map((w) => (
              <path key={w.id} className="spec-other" d={linePath(binned.get(w.id) ?? [])} />
            ))}
            {drawn && <path className="spec-line" d={linePath((shown && binned.get(shown)) || [])} />}
            {unusable.map((q, i) => (
              <line
                key={i}
                className={q.flag === "saturated_core" ? "spec-tick spec-sat" : "spec-tick spec-bad"}
                x1={xOf(q.lambda_um)}
                y1={baseline - 5}
                x2={xOf(q.lambda_um)}
                y2={baseline}
              />
            ))}
            {good.map((q, i) =>
              q.flux_jy > top ? (
                <path
                  key={i}
                  className={q.flag === "ok" ? "spec-dot" : "spec-ring"}
                  d={`M${xOf(q.lambda_um) - 3} ${M.top + 5}L${xOf(q.lambda_um)} ${M.top}L${xOf(q.lambda_um) + 3} ${M.top + 5}Z`}
                />
              ) : (
                <circle
                  key={i}
                  className={q.flag === "ok" ? "spec-dot" : "spec-ring"}
                  cx={xOf(q.lambda_um)}
                  cy={y(q.flux_jy)}
                  r={2}
                />
              ),
            )}
            {hover && <circle className="spec-hover" cx={xOf(hover.lambda_um)} cy={y(Math.min(hover.flux_jy, top))} r={5} />}
            <line ref={headRef} className="spec-head" x1={M.left} y1={M.top - 6} x2={M.left} y2={baseline} />
          </svg>

          <div className="segments" role="group" aria-label="Image band, by wavelength">
            {bands.map((b, i) => {
              const has = p.bandHasFrames(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  className="segment"
                  style={{ left: `${(xOf(b.lambda_min) / W) * 100}%`, width: `${((xOf(b.lambda_max) - xOf(b.lambda_min)) / W) * 100}%` }}
                  aria-pressed={b.id === p.bandId}
                  aria-label={`Show the image at ${microns(b.lambda_min, b.lambda_max)}`}
                  data-heard={b.id === heard}
                  disabled={!has}
                  title={has ? microns(b.lambda_min, b.lambda_max) : "No image in this band"}
                  onClick={() => p.onBand(b.id)}
                >
                  <span aria-hidden="true">{i + 1}</span>
                </button>
              );
            })}
          </div>

          {message && <p className="strip-message">{message}</p>}
          {hover && (
            <p className="strip-tip" style={{ left: `${clamp01(xOf(hover.lambda_um) / W) * 100}%` }} aria-hidden="true">
              {hover.lambda_um.toFixed(2)} µm, {fluxLabel(hover.flux_jy)}, {FLAG_TEXT[hover.flag]}
            </p>
          )}
        </div>
      </div>

      <div className="dock-tail">
        <button
          type="button"
          className="pill"
          onClick={() => start(playable.map((w) => w.id))}
          disabled={!!play || !drawn || playable.length < 2}
        >
          All {playable.length || windows.length} visits
        </button>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {play && playVisit ? `Playing the spectrum of ${when}.` : ""}
      </p>
    </>
  );
}
