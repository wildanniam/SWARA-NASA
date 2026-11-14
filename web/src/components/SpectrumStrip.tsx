import { Play, Stop } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { Band, TimeWindow } from "../lib/bundle";
import { microns, monthYear } from "../lib/format";
import { useDialog, useWidth } from "../lib/hooks";
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
import { phrase, sonifier, soundEpoch, type Note } from "../sound/sonify";

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
  /** Band yang sedang terdengar di mode Spektrum, supaya lensa menampilkan band yang sama. */
  onHear: (bandId: string | undefined) => void;
  /** Memutar riwayat gerak penuh (dipicu dari pemilih suara). */
  onMotionHistory: () => void;
  /** Riwayat gerak sedang berbunyi (dimiliki App). */
  motionPlaying: boolean;
  /** Hentikan riwayat gerak. */
  onMotionStop: () => void;
  /** Ada posisi acuan stabil sehingga riwayat gerak bisa dibunyikan. */
  motionReady: boolean;
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

  // Selama suara berjalan: kunjungan mana saja yang diputar dan kapan tiap kunjungan mulai.
  const [play, setPlay] = useState<{ kind: "scan" | "spectrum"; visits: string[]; starts: number[]; total: number; bounds: { visit: string; start: number }[] }>();
  const [mode, setMode] = useState<"scan" | "spectrum">("scan");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [chooser, setChooser] = useState(false);
  const chooserRef = useDialog<HTMLDivElement>(chooser, () => setChooser(false));
  const motionRef = useRef(p.onMotionHistory);
  motionRef.current = p.onMotionHistory;
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
  const hearRef = useRef(p.onHear);
  hearRef.current = p.onHear;
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

  const abandon = useCallback(() => {
    if (headRef.current) headRef.current.style.visibility = "hidden";
    const line = p.scanLine.current;
    if (line) line.style.visibility = "hidden";
    p.soundRing.current?.setAttribute("stroke-dasharray", "0 100");
    setPlay(undefined);
    setPlayVisit(undefined);
    hearRef.current(undefined);
  }, [p.soundRing, p.scanLine]);

  const stop = useCallback(() => {
    sonifier.stop();
    abandon();
  }, [abandon]);

  // Satu suara = satu frasa gabungan. Sapuan: tiap kunjungan 32 kolom lalu jeda.
  // Spektrum: satu frasa 48 nada per kunjungan seperti sebelum sapuan ada.
  const start = useCallback(
    (visits: string[], kind: "scan" | "spectrum" = modeRef.current) => {
      if (!visits.length) return;
      if (kind === "spectrum") {
        const use = visits.filter((v) => (binned.get(v) ?? []).length > 0);
        if (!use.length) return;
        setMode("spectrum");
        const starts = sonifier.play(use.map((v) => phrase(binned.get(v) ?? [], top)));
        setPlay({
          kind: "spectrum",
          visits: use,
          starts,
          total: starts[starts.length - 1] + SOUND.visitSeconds,
          bounds: use.map((v, i) => ({ visit: v, start: starts[i] })),
        });
      } else {
        setMode("scan");
        scanStartRef.current(visits);
        hearRef.current(undefined);
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
        setPlay({ kind: "scan", visits: bounds.map((b) => b.visit), starts, total, bounds });
      }
      setFresh(false);
      try {
        window.localStorage.setItem(HEARD_KEY, "1");
      } catch {
        // penyimpanan diblokir: petunjuknya hanya muncul lagi lain kali
      }
    },
    [binned, top],
  );

  // Memilih dari pemilih langsung memutar: kunjungan tampil untuk
  // Scan/Spectrum, riwayat penuh untuk Motion history.
  const choose = useCallback(
    (kind: "scan" | "spectrum" | "motion") => {
      setChooser(false);
      if (kind === "motion") {
        motionRef.current();
        return;
      }
      if (windowId) start([windowId], kind);
    },
    [windowId, start],
  );

  // Benda berganti atau pita hilang: suara berhenti.
  useEffect(() => stop, [spectrum, stop]);

  // Garis pindai / garis kepala, busur cincin, dan pindah kunjungan mengikuti jam audio.
  // Digerakkan langsung di DOM supaya tidak dirender ulang 60 kali per detik.
  useEffect(() => {
    if (!play) return;
    let raf = 0;
    let lastVisit = -1;
    let centerTold = "";
    let lastBand: string | undefined;
    const epoch = soundEpoch.n;
    const tick = () => {
      if (soundEpoch.n !== epoch) {
        // Diambil alih mode lain: play() barunya sudah menghentikan audio ini.
        abandon();
        return;
      }
      const elapsed = sonifier.now() - play.starts[0];
      if (elapsed >= play.total) {
        setAnnounce(play.kind === "scan" ? "Scan finished." : "Finished.");
        stop();
        return;
      }
      let i = 0;
      while (i < play.bounds.length - 1 && elapsed >= play.bounds[i + 1].start) i++;
      if (i !== lastVisit) {
        lastVisit = i;
        centerTold = "";
        lastBand = undefined;
        setPlayVisit(play.visits[i]);
        listenRef.current(play.visits[i]);
        const w = windows.find((q) => q.id === play.visits[i]);
        setAnnounce(
          play.kind === "scan"
            ? `Scanning visit ${w ? monthYear(w.mjd_mid) : play.visits[i]}.`
            : `Playing the spectrum of ${w ? monthYear(w.mjd_mid) : play.visits[i]}.`,
        );
      }
      if (play.kind === "scan") {
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
      } else {
        const frac = (elapsed - play.bounds[i].start) / SOUND.visitSeconds;
        const lambda = LAMBDA_MIN + clamp01(frac) * (LAMBDA_MAX - LAMBDA_MIN);
        const band = (bands.find((b) => lambda >= b.lambda_min && lambda < b.lambda_max) ?? bands[bands.length - 1])?.id;
        if (frac >= 0 && band !== lastBand) {
          lastBand = band;
          hearRef.current(band);
        }
        const head = headRef.current;
        if (head) {
          const x = xOf(lambda);
          head.setAttribute("x1", String(x));
          head.setAttribute("x2", String(x));
          head.style.visibility = frac >= 0 && frac <= 1 ? "visible" : "hidden";
        }
      }
      p.soundRing.current?.setAttribute("stroke-dasharray", `${clamp01(elapsed / play.total) * 100} 100`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play, stop, abandon, windows, bands, xOf, p.soundRing, p.scanLine]);

  const shown = playVisit ?? windowId;
  const scanReady = windows.filter((w) => p.hasImage(w.id)).map((w) => w.id);
  const canScan = !!windowId && p.hasImage(windowId);
  const canSpectrum = quality === "ok" && !!windowId && playable.some((w) => w.id === windowId);
  const canPlay = mode === "scan" ? canScan : canSpectrum;
  const allReady = mode === "scan" ? scanReady : playable.map((w) => w.id);

  const toggle = useCallback(() => {
    if (play) stop();
    else if (p.motionPlaying) p.onMotionStop();
    else setChooser(true);
  }, [play, p.motionPlaying, p.onMotionStop]);

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
          disabled={!play && !p.motionPlaying && !canPlay}
          aria-pressed={!!play || p.motionPlaying}
          aria-label={play || p.motionPlaying ? "Stop the sound" : "Choose what to listen to"}
        >
          {play || p.motionPlaying ? <Stop weight="fill" /> : <Play weight="fill" />}
        </button>
        <span className="dial-caption">{play || p.motionPlaying ? "Stop" : fresh ? "Hear what it is" : "Listen"}</span>
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
          onClick={() => start(allReady)}
          disabled={!!play || allReady.length < 2}
        >
          All {allReady.length || windows.length} visits
        </button>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announce ?? ""}
      </p>

      {chooser && (
        <div
          className="scrim"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setChooser(false);
          }}
        >
          <div ref={chooserRef} className="hear" role="dialog" aria-modal="true" aria-label="Choose what to listen to">
            {(
              [
                {
                  id: "scan",
                  name: "Scan the image",
                  detail: "32 columns east to west. Higher is north, louder is brighter, a ping marks the target.",
                  disabled: !canScan,
                  why: "No image in this band and visit.",
                },
                {
                  id: "spectrum",
                  name: "Play the spectrum",
                  detail: "48 notes short to long. Higher is brighter, dips are absorption.",
                  disabled: !canSpectrum,
                  why: "Not enough usable spectrum in this visit.",
                },
                {
                  id: "motion",
                  name: "Motion history",
                  detail: "One note per visit, first to last. Higher is north, same note means holding still.",
                  disabled: !p.motionReady,
                  why: "Nothing here could be tracked between visits.",
                },
              ] as const
            ).map((o) => (
              <button
                key={o.id}
                type="button"
                className="hear-option"
                data-autofocus={o.id === "scan" ? true : undefined}
                disabled={o.disabled}
                title={o.disabled ? o.why : o.detail}
                onClick={() => choose(o.id)}
              >
                <span className="hear-name">{o.name}</span>
                <span className="hear-detail">{o.disabled ? o.why : o.detail}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
