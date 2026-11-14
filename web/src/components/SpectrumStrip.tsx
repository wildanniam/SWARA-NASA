import { ArrowRight, ArrowUpRight, Play, Scan, Stop, Waveform, X } from "@phosphor-icons/react";
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
import { MOTION, SCAN, SOUND } from "../sound/mapping";
import { motionPhrase, phrase, sonifier, soundEpoch, type Note } from "../sound/sonify";

type Props = {
  spectrum?: Spectrum;
  failed: boolean;
  windows: TimeWindow[];
  /** Kunjungan yang sedang tampil di lensa. */
  windowId?: string;
  /** Nada dari posisi terukur; null = tidak ada pengukuran pada kunjungan itu. */
  readMotion: (windowId: string) => { hz: number; pan: number } | null;
  /** Posisi acuan cukup stabil untuk menyuarakan riwayat gerak. */
  motionReady: boolean;
  bands: Band[];
  /** Band citra yang dipilih pengguna. */
  bandId?: string;
  bandHasFrames: (id: string) => boolean;
  onBand: (id: string) => void;
  /** Suara mulai memutar kunjungan ini: lensa ikut pindah dan blink berhenti. */
  onListen: (windowId: string) => void;
  /** Band yang sedang terdengar, supaya lensa menampilkan band yang sama. */
  onHear: (bandId: string | undefined) => void;
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
  const [play, setPlay] = useState<{ kind: "scan" | "spectrum" | "motion"; visits: string[]; starts: number[]; total: number; bounds: { visit: string; start: number }[] }>();
  const [mode, setMode] = useState<"scan" | "spectrum" | "motion">("scan");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [chooser, setChooser] = useState(false);
  const chooserRef = useDialog<HTMLDivElement>(chooser, () => setChooser(false));
  const readMotionRef = useRef(p.readMotion);
  readMotionRef.current = p.readMotion;
  const [playVisit, setPlayVisit] = useState<string>();
  const [announce, setAnnounce] = useState<string>();
  const [hover, setHover] = useState<SpectrumPoint>();
  const [heardLambda, setHeardLambda] = useState<number>();
  const [fresh, setFresh] = useState(() => {
    try {
      return !window.localStorage.getItem(HEARD_KEY);
    } catch {
      return false;
    }
  });
  const headRef = useRef<SVGLineElement>(null);
  const headDotRef = useRef<SVGCircleElement>(null);
  const listenRef = useRef(p.onListen);
  listenRef.current = p.onListen;
  const hearRef = useRef(p.onHear);
  hearRef.current = p.onHear;
  const scanStartRef = useRef(p.onScanStart);
  scanStartRef.current = p.onScanStart;
  const readVisitRef = useRef(p.readVisit);
  readVisitRef.current = p.readVisit;
  const hasImageRef = useRef(p.hasImage);
  hasImageRef.current = p.hasImage;

  const points = useMemo(() => spectrum?.points ?? [], [spectrum]);
  const quality = useMemo(() => (spectrum ? assess(spectrum.points) : undefined), [spectrum]);
  const top = useMemo(() => fluxTop(points), [points]);
  const binned = useMemo(
    () => new Map(windows.map((w) => [w.id, binVisit(points, w.id, SOUND.steps)])),
    [points, windows],
  );
  const playable = useMemo(
    () =>
      quality === "ok"
        ? windows.filter((w) => points.filter((q) => q.window === w.id && isUsable(q)).length >= MIN_POINTS)
        : [],
    [points, quality, windows],
  );

  const abandon = useCallback(() => {
    if (headRef.current) headRef.current.style.visibility = "hidden";
    if (headDotRef.current) headDotRef.current.style.visibility = "hidden";
    const line = p.scanLine.current;
    if (line) line.style.visibility = "hidden";
    p.soundRing.current?.setAttribute("stroke-dasharray", "0 100");
    setPlay(undefined);
    setPlayVisit(undefined);
    setHeardLambda(undefined);
    hearRef.current(undefined);
  }, [p.soundRing, p.scanLine]);

  const stop = useCallback(() => {
    sonifier.stop();
    abandon();
  }, [abandon]);

  // Setiap pilihan Listen memakai satu suara saja: gambar, spektrum, atau gerak.
  const start = useCallback(
    (visits: string[], kind: "scan" | "spectrum" | "motion" = modeRef.current) => {
      if (!visits.length) return;
      setAnnounce("");
      setHeardLambda(undefined);
      if (kind === "motion") {
        const use = visits.filter((v) => hasImageRef.current(v));
        if (!use.length) return;
        setMode("motion");
        hearRef.current(undefined);
        const notes = motionPhrase(use.map((v) => readMotionRef.current(v)));
        const starts = sonifier.play([notes]);
        setPlay({
          kind: "motion",
          visits: use,
          starts,
          total: notes[notes.length - 1].t + MOTION.seconds,
          // tick() membandingkan waktu relatif sejak awal frasa pertama.
          bounds: use.map((v, i) => ({ visit: v, start: i * MOTION.melodyStep })),
        });
      } else if (kind === "spectrum") {
        const use = visits.filter((v) => (binned.get(v) ?? []).length > 0);
        if (!use.length) return;
        setMode("spectrum");
        hearRef.current(undefined);
        const starts = sonifier.play(use.map((v) => phrase(binned.get(v) ?? [], top)));
        const slot = SOUND.visitSeconds + SOUND.pauseSeconds;
        setPlay({
          kind: "spectrum",
          visits: use,
          starts,
          total: (use.length - 1) * slot + SOUND.visitSeconds,
          // starts[] memakai jam absolut AudioContext; batas tick relatif terhadap starts[0].
          bounds: use.map((v, i) => ({ visit: v, start: starts[i] - starts[0] })),
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

  // Memilih dari pemilih langsung memutar gambar, riwayat spektrum, atau gerak.
  const choose = useCallback(
    (kind: "scan" | "spectrum" | "motion") => {
      setChooser(false);
      if (kind === "spectrum") start(spectrumReadyRef.current, kind);
      else if (kind === "motion") start(motionReadyRef.current, kind);
      else if (windowId) start([windowId], kind);
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
    let lastStep = -1;
    const epoch = soundEpoch.n;
    const tick = () => {
      if (soundEpoch.n !== epoch) {
        // Diambil alih mode lain: play() barunya sudah menghentikan audio ini.
        abandon();
        return;
      }
      const elapsed = sonifier.now() - play.starts[0];
      if (elapsed >= play.total) {
        setAnnounce(play.kind === "scan" ? "Scan finished." : play.kind === "spectrum" ? "Spectrum finished." : "Motion finished.");
        stop();
        return;
      }
      let i = 0;
      while (i < play.bounds.length - 1 && elapsed >= play.bounds[i + 1].start) i++;
      if (elapsed >= 0 && i !== lastVisit) {
        lastVisit = i;
        centerTold = "";
        lastBand = undefined;
        lastStep = -1;
        setPlayVisit(play.visits[i]);
        listenRef.current(play.visits[i]);
        const w = windows.find((q) => q.id === play.visits[i]);
        setAnnounce(
          play.kind === "scan"
            ? `Scanning visit ${w ? monthYear(w.mjd_mid) : play.visits[i]}.`
            : `${play.kind === "spectrum" ? "Spectrum" : "Motion"}, visit ${w ? monthYear(w.mjd_mid) : play.visits[i]}.`,
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
      } else if (play.kind === "spectrum") {
        const frac = (elapsed - play.bounds[i].start) / SOUND.visitSeconds;
        const step = Math.min(SOUND.steps - 1, Math.max(0, Math.floor(clamp01(frac) * SOUND.steps)));
        const lambda = LAMBDA_MIN + ((step + 0.5) / SOUND.steps) * (LAMBDA_MAX - LAMBDA_MIN);
        const band = (bands.find((b) => lambda >= b.lambda_min && lambda < b.lambda_max) ?? bands[bands.length - 1])?.id;
        if ((frac < 0 || frac > 1) && lastStep !== -1) {
          lastStep = -1;
          setHeardLambda(undefined);
        }
        if (frac >= 0 && frac <= 1 && step !== lastStep) {
          lastStep = step;
          setHeardLambda(lambda);
        }
        if (frac >= 0 && frac <= 1 && band !== lastBand) {
          lastBand = band;
          hearRef.current(band);
        }
        const head = headRef.current;
        const dot = headDotRef.current;
        if (head) {
          const x = xOf(lambda);
          head.setAttribute("x1", String(x));
          head.setAttribute("x2", String(x));
          head.style.visibility = frac >= 0 && frac <= 1 ? "visible" : "hidden";
        }
        if (dot) {
          dot.setAttribute("cx", String(xOf(lambda)));
          dot.style.visibility = frac >= 0 && frac <= 1 ? "visible" : "hidden";
        }
      } else {
        if (headRef.current) headRef.current.style.visibility = "hidden";
        if (headDotRef.current) headDotRef.current.style.visibility = "hidden";
      }
      p.soundRing.current?.setAttribute("stroke-dasharray", `${clamp01(elapsed / play.total) * 100} 100`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play, stop, abandon, windows, bands, xOf, p.soundRing, p.scanLine]);

  const shown = playVisit ?? windowId;
  const bandsLocked = !!play;
  const scanReady = windows.filter((w) => p.hasImage(w.id)).map((w) => w.id);
  const spectrumReady = windows.filter((w) => p.hasImage(w.id) && playable.includes(w)).map((w) => w.id);
  const spectrumReadyRef = useRef(spectrumReady);
  spectrumReadyRef.current = spectrumReady;
  const motionReadyVisits = windows.filter((w) => p.hasImage(w.id)).map((w) => w.id);
  const motionReadyRef = useRef(motionReadyVisits);
  motionReadyRef.current = motionReadyVisits;
  const canScan = !!windowId && p.hasImage(windowId);
  // Jelaskan syarat spektrum yang belum terpenuhi dengan apa adanya.
  const spectrumReason = !spectrum
    ? p.failed
      ? "Spektrum gagal dimuat."
      : "Spektrum masih dimuat."
    : quality === "faint"
      ? "Spektrum terlalu redup untuk disuarakan dengan andal."
      : quality === "saturated"
        ? "Spektrum jenuh dan tidak memiliki nilai yang dapat dipakai."
        : quality === "empty" || !playable.length
          ? "Terlalu sedikit pengukuran spektrum yang dapat dipakai."
          : undefined;
  const spectrumDisabledReason = [
    spectrumReason,
    playable.length && !spectrumReady.length ? "Menunggu citra kunjungan selesai dimuat." : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  const motionDisabledReason = !p.motionReady
    ? "Posisi acuan yang stabil tidak dapat diukur."
    : !motionReadyVisits.length
      ? "Belum ada citra kunjungan yang siap diputar."
      : undefined;
  const allReady = mode === "scan" ? scanReady : mode === "spectrum" ? spectrumReady : motionReadyVisits;

  const toggle = useCallback(() => {
    if (play) stop();
    else setChooser(true);
  }, [play]);

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
          disabled={!play && !canScan && !spectrumReady.length && !(p.motionReady && motionReadyVisits.length)}
          aria-pressed={!!play}
          aria-label={play ? "Stop the sound" : "Choose what to listen to"}
        >
          {play ? <Stop weight="fill" /> : <Play weight="fill" />}
        </button>
        <span className="dial-caption">{play ? "Stop" : fresh ? "Hear what it is" : "Listen"}</span>
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
            <circle ref={headDotRef} className="spec-head-dot" cx={M.left} cy={M.top - 5} r={3.5} />
          </svg>

          <div className="segments" role="group" aria-label="Image band, by wavelength">
            {bands.map((b, i) => {
                const has = p.bandHasFrames(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    className="segment"
                    data-heard={
                      play?.kind === "spectrum" && heardLambda !== undefined &&
                      heardLambda >= b.lambda_min && heardLambda < b.lambda_max
                        ? "true"
                        : undefined
                    }
                    data-missing={!has ? "true" : undefined}
                    data-audio-locked={bandsLocked ? "true" : undefined}
                    style={{ left: `${(xOf(b.lambda_min) / W) * 100}%`, width: `${((xOf(b.lambda_max) - xOf(b.lambda_min)) / W) * 100}%` }}
                    aria-pressed={b.id === p.bandId}
                    aria-label={`Show the image at ${microns(b.lambda_min, b.lambda_max)}`}
                    disabled={!has || bandsLocked}
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
        {play?.kind === "spectrum" && heardLambda !== undefined && (
          <span className="sound-lambda">λ {heardLambda.toFixed(2)} µm</span>
        )}
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
          <div ref={chooserRef} className="hear" role="dialog" aria-modal="true" aria-label="Pilih cara mendengarkan">
            <header className="hear-head">
              <div>
                <h2>Pilih cara mendengarkan</h2>
                <p>Pilih data yang ingin didengar. Setiap pilihan berbunyi sendiri.</p>
              </div>
              <button type="button" className="round hear-close" aria-label="Tutup pemilih suara" onClick={() => setChooser(false)}>
                <X aria-hidden="true" />
              </button>
            </header>
            {(
              [
                {
                  id: "scan",
                  name: "Pindai gambar",
                  detail: "Susuri gambar dari timur ke barat dalam 32 kolom suara.",
                  disabled: !canScan,
                  why: "Gambar untuk band dan kunjungan ini belum tersedia.",
                  Icon: Scan,
                },
                {
                  id: "spectrum",
                  name: "Dengarkan spektrum",
                  detail: "Dengarkan 48 nada spektrum untuk setiap kunjungan, dari yang pertama hingga terakhir.",
                  disabled: !!spectrumDisabledReason,
                  why: spectrumDisabledReason ?? "",
                  Icon: Waveform,
                },
                {
                  id: "motion",
                  name: "Dengarkan suara gerak saja",
                  detail: "Satu nada posisi untuk tiap kunjungan, dari yang pertama hingga terakhir.",
                  disabled: !!motionDisabledReason,
                  why: motionDisabledReason ?? "",
                  Icon: ArrowUpRight,
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
                <span className="hear-icon" aria-hidden="true"><o.Icon weight="regular" /></span>
                <span className="hear-copy">
                  <span className="hear-name">{o.name}</span>
                  <span className="hear-detail">{o.disabled ? o.why : o.detail}</span>
                </span>
                <ArrowRight className="hear-arrow" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
