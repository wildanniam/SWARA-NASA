import { Play, Stop } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { Band, TimeWindow } from "../lib/bundle";
import { microns, monthYear } from "../lib/format";
import { useWidth } from "../lib/hooks";
import { scanGrid, scanPhrase } from "../lib/scan";
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
import { SCAN, SOUND } from "../sound/mapping";
import { sonifier, type Note } from "../sound/sonify";

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
  /** Paksa lensa ke medan penuh dan hentikan blink sebelum sapuan berbunyi. */
  onScanStart: (visits: string[]) => void;
  /** Piksel abu display kunjungan ini (band yang tampil), kalau citranya sudah dimuat. */
  readVisit: (windowId: string) => { gray: Uint8ClampedArray; mask: Uint8ClampedArray | null; size: number } | undefined;
  /** Citra kunjungan ini (band yang tampil) sudah dimuat. */
  hasImage: (windowId: string) => boolean;
  /** Busur di cincin lensa; menyapu seiring suara. */
  soundRing: RefObject<SVGCircleElement | null>;
  /** Garis pindai di lensa; digerakkan kolom-per-kolom mengikuti jam audio. */
  scanLine: RefObject<SVGLineElement | null>;
};

const H = 84;
const M = { left: 2, right: 2, top: 12, bottom: 18 };
const MIN_POINTS = 8; // kunjungan dengan titik layak lebih sedikit tidak dibunyikan
const TICKS = [1, 2, 3, 4, 5];
const HEARD_KEY = "swara.heard";
// Jeda antar kunjungan saat All visits memutar sapuan berurutan, detik.
const SCAN_PAUSE = 0.8;

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

  // Selama sapuan berjalan: kunjungan mana saja yang diputar dan kapan tiap kunjungan mulai.
  const [play, setPlay] = useState<{ visits: string[]; starts: number[]; total: number; bounds: { visit: string; start: number }[] }>();
  const [playVisit, setPlayVisit] = useState<string>();
  const [announce, setAnnounce] = useState<string>();
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
  const scanStartRef = useRef(p.onScanStart);
  scanStartRef.current = p.onScanStart;
  const readVisitRef = useRef(p.readVisit);
  readVisitRef.current = p.readVisit;

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
    const line = p.scanLine.current;
    if (line) line.style.visibility = "hidden";
    p.soundRing.current?.setAttribute("stroke-dasharray", "0 100");
    setPlay(undefined);
    setPlayVisit(undefined);
  }, [p.soundRing, p.scanLine]);

  // Satu sapuan = satu frasa gabungan: tiap kunjungan 32 kolom lalu jeda.
  const start = useCallback(
    (visits: string[]) => {
      if (!visits.length) return;
      scanStartRef.current(visits);
      let notes: Note[] = [];
      const bounds: { visit: string; start: number }[] = [];
      let refStats: { bg: number; sigma: number; top: number } | undefined;
      for (const v of visits) {
        const fr = readVisitRef.current(v);
        if (!fr) continue;
        const grid = scanGrid(fr.gray, fr.size, fr.mask, { ...SCAN, ...(refStats ? { stats: refStats } : null) });
        if (!refStats) refStats = { bg: grid.bg, sigma: grid.sigma, top: grid.top };
        const at = notes.length ? notes[notes.length - 1].t + SCAN.colSeconds + SCAN_PAUSE : 0;
        bounds.push({ visit: v, start: at });
        for (const n of scanPhrase(grid, SCAN)) notes.push({ ...n, t: n.t + at });
      }
      if (!notes.length) return;
      const total = notes[notes.length - 1].t + SCAN.colSeconds;
      const starts = sonifier.play([notes]);
      setPlay({ visits: bounds.map((b) => b.visit), starts, total, bounds });
      setFresh(false);
      try {
        window.localStorage.setItem(HEARD_KEY, "1");
      } catch {
        // penyimpanan diblokir: petunjuknya hanya muncul lagi lain kali
      }
    },
    [],
  );

  // Benda berganti atau pita hilang: suara berhenti.
  useEffect(() => stop, [spectrum, stop]);

  // Garis pindai, busur cincin, dan pindah kunjungan mengikuti jam audio.
  // Digerakkan langsung di DOM supaya tidak dirender ulang 60 kali per detik.
  useEffect(() => {
    if (!play) return;
    let raf = 0;
    let lastVisit = -1;
    let centerTold = "";
    const tick = () => {
      const elapsed = sonifier.now() - play.starts[0];
      if (elapsed >= play.total) {
        setAnnounce("Scan finished.");
        stop();
        return;
      }
      let i = 0;
      while (i < play.bounds.length - 1 && elapsed >= play.bounds[i + 1].start) i++;
      if (i !== lastVisit) {
        lastVisit = i;
        centerTold = "";
        setPlayVisit(play.visits[i]);
        listenRef.current(play.visits[i]);
        const w = windows.find((q) => q.id === play.visits[i]);
        setAnnounce(`Scanning visit ${w ? monthYear(w.mjd_mid) : play.visits[i]}.`);
      }
      const col = (elapsed - play.bounds[i].start) / SCAN.colSeconds;
      const line = p.scanLine.current;
      if (line) {
        if (col >= 0 && col < SCAN.columns) {
          line.setAttribute("x1", String(col + 0.5));
          line.setAttribute("x2", String(col + 0.5));
          line.style.visibility = "visible";
        } else line.style.visibility = "hidden";
      }
      if (col >= SCAN.columns / 2 && centerTold !== play.visits[i]) {
        centerTold = play.visits[i];
        setAnnounce("Target.");
      }
      p.soundRing.current?.setAttribute("stroke-dasharray", `${clamp01(elapsed / play.total) * 100} 100`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play, stop, windows, p.soundRing, p.scanLine]);

  const shown = playVisit ?? windowId;
  const scanReady = windows.filter((w) => p.hasImage(w.id)).map((w) => w.id);
  const canScan = !!windowId && p.hasImage(windowId);

  const toggle = useCallback(() => {
    if (play) stop();
    else if (canScan && windowId) start([windowId]);
  }, [play, stop, canScan, windowId, start]);

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
          disabled={!play && !canScan}
          aria-pressed={!!play}
          aria-label={play ? "Stop the sound" : "Scan the image of this visit"}
        >
          {play ? <Stop weight="fill" /> : <Play weight="fill" />}
        </button>
        <span className="dial-caption">{play ? "Stop" : fresh && canScan ? "Hear what it is" : "Listen"}</span>
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
          onClick={() => start(scanReady)}
          disabled={!!play || scanReady.length < 2}
        >
          All {scanReady.length || windows.length} visits
        </button>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announce ?? ""}
      </p>
    </>
  );
}
