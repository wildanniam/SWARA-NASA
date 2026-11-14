import { Play, Stop } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { Band, TimeWindow } from "../lib/bundle";
import { microns, monthYear } from "../lib/format";
import { useWidth } from "../lib/hooks";
import { scanGrid, scanPhrase } from "../lib/scan";
import { combineSoundLayers, VISIT_PAUSE_SECONDS, VISIT_SLOT_SECONDS, type CombinedVisit } from "../lib/combinedSound";
import {
  assessVisit,
  binVisit,
  fluxLabel,
  fluxTop,
  isUsable,
  LAMBDA_MAX,
  LAMBDA_MIN,
  playableVisits,
  type Bin,
  type Spectrum,
  type SpectrumPoint,
} from "../lib/spectrum";
import { MOTION, SCAN, SOUND } from "../sound/mapping";
import { phrase, sonifier, soundEpoch, type Note } from "../sound/sonify";

type Props = {
  targetId: string;
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
const TICKS = [1, 2, 3, 4, 5];
const HEARD_KEY = "swara.heard";
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
  const [play, setPlay] = useState<{
    start: number;
    total: number;
    visits: CombinedVisit[];
    skipped: { id: string; layers: ("scan" | "spectrum" | "motion")[] }[];
    activeVoices: ("scan" | "spectrum" | "motion")[];
  }>();
  const readMotionRef = useRef(p.readMotion);
  readMotionRef.current = p.readMotion;
  const [playVisit, setPlayVisit] = useState<string>();
  const [announce, setAnnounce] = useState<string>();
  const [hover, setHover] = useState<SpectrumPoint>();
  const [heardLambda, setHeardLambda] = useState<number>();
  const [motionNoteActive, setMotionNoteActive] = useState(false);
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
  const shown = playVisit ?? windowId;

  const points = useMemo(() => spectrum?.points ?? [], [spectrum]);
  const top = useMemo(() => fluxTop(points), [points]);
  const binned = useMemo(
    () => new Map(windows.map((w) => [w.id, binVisit(points, w.id, SOUND.steps)])),
    [points, windows],
  );
  const qualityByVisit = useMemo(
    () => new Map(windows.map((w) => [w.id, assessVisit(points.filter((q) => q.window === w.id))] as const)),
    [points, windows],
  );
  const playable = useMemo(
    () => playableVisits(windows.map((w) => w.id), points).map((id) => windows.find((w) => w.id === id)!),
    [points, windows],
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
    setMotionNoteActive(false);
    hearRef.current(undefined);
  }, [p.soundRing, p.scanLine]);

  const stop = useCallback(() => {
    sonifier.stop();
    abandon();
  }, [abandon]);

  // Ketiga lapisan masuk ke satu antrean dan satu jam per visit.
  const startCombined = useCallback(() => {
    if (!windows.length) return;
    setAnnounce("");
    setHeardLambda(undefined);
    setMotionNoteActive(false);
    hearRef.current(undefined);

    const scanLayers = new Map<string, Note[]>();
    let refStats: { bg: number; sigma: number; top: number } | undefined;
    for (const w of windows) {
      if (!hasImageRef.current(w.id)) continue;
      const frame = readVisitRef.current(w.id);
      if (!frame) continue;
      const grid = scanGrid(frame.gray, frame.size, frame.mask, { ...SCAN, ...(refStats ? { stats: refStats } : null) });
      if (!refStats) refStats = { bg: grid.bg, sigma: grid.sigma, top: grid.top };
      scanLayers.set(w.id, scanPhrase(grid, SCAN));
    }

    const spectrumLayers = new Map<string, Note[]>();
    const spectrumSettings = { ...SOUND, visitSeconds: VISIT_SLOT_SECONDS };
    for (const w of playable) {
      spectrumLayers.set(w.id, phrase(binned.get(w.id) ?? [], top, spectrumSettings));
    }

    const motionLayers = new Map<string, Note>();
    if (p.motionReady) {
      for (const w of windows) {
        const delta = readMotionRef.current(w.id);
        if (!delta) continue;
        motionLayers.set(w.id, {
          t: 0,
          dur: MOTION.seconds,
          hz: delta.hz,
          unverified: false,
          pan: delta.pan,
          lambda: 0,
          voice: "motion",
        });
      }
    }

    const plan = combineSoundLayers(
      windows.map((w) => w.id),
      scanLayers,
      spectrumLayers,
      motionLayers,
      VISIT_PAUSE_SECONDS,
    );
    const scanVisits = plan.visits.filter((visit) => visit.layers.scan).map((visit) => visit.id);
    if (scanVisits.length) scanStartRef.current(scanVisits);
    const ambienceOnly = plan.visits.length === 0;
    const visits = ambienceOnly
      ? windows.map((w, i) => ({
          id: w.id,
          start: i * (VISIT_SLOT_SECONDS + VISIT_PAUSE_SECONDS),
          layers: { scan: false, spectrum: false, motion: false },
        }))
      : plan.visits;
    const total = ambienceOnly
      ? VISIT_SLOT_SECONDS + Math.max(0, visits.length - 1) * (VISIT_SLOT_SECONDS + VISIT_PAUSE_SECONDS)
      : plan.total;
    const skipped = ambienceOnly
      ? windows.map((w) => ({ id: w.id, layers: ["scan", "spectrum", "motion"] as ("scan" | "spectrum" | "motion")[] }))
      : plan.skipped;
    const start = sonifier.playMixed(plan.notes, plan.activeVoices, total);
    setPlay({ start, total, visits, skipped, activeVoices: plan.activeVoices });
    if (ambienceOnly) setAnnounce("Tidak ada lapisan data yang siap; ambience ruang angkasa diputar.");
    setFresh(false);
    try {
      window.localStorage.setItem(HEARD_KEY, "1");
    } catch {
      // penyimpanan diblokir: petunjuknya hanya muncul lagi lain kali
    }
  }, [binned, playable, top, windows, p.motionReady]);

  // Benda berganti atau pita hilang: suara berhenti.
  useEffect(() => stop, [p.targetId, stop]);

  // Garis pindai, kursor spektrum, dan lensa mengikuti jam audio yang sama.
  // Digerakkan langsung di DOM supaya tidak dirender ulang 60 kali per detik.
  useEffect(() => {
    if (!play) return;
    let raf = 0;
    let lastVisit = -1;
    let centerTold = "";
    let lastBand: string | undefined;
    let lastStep = -1;
    let lastMotionActive: boolean | undefined;
    const epoch = soundEpoch.n;
    const tick = () => {
      if (soundEpoch.n !== epoch) {
        // Diambil alih mode lain: play() barunya sudah menghentikan audio ini.
        abandon();
        return;
      }
      const elapsed = sonifier.now() - play.start;
      if (elapsed >= play.total) {
        setAnnounce("Pemutaran gabungan selesai.");
        stop();
        return;
      }
      let i = 0;
      while (i < play.visits.length - 1 && elapsed >= play.visits[i + 1].start) i++;
      const visit = play.visits[i];
      const local = elapsed - visit.start;
      const motionActive = visit.layers.motion && local >= 0 && local < MOTION.seconds;
      if (motionActive !== lastMotionActive) {
        lastMotionActive = motionActive;
        setMotionNoteActive(motionActive);
      }
      if (elapsed >= 0 && i !== lastVisit) {
        lastVisit = i;
        centerTold = "";
        lastBand = undefined;
        lastStep = -1;
        setPlayVisit(visit.id);
        setHeardLambda(undefined);
        hearRef.current(undefined);
        listenRef.current(visit.id);
        const w = windows.find((q) => q.id === visit.id);
        const active = [
          visit.layers.scan ? "pindai gambar" : "",
          visit.layers.spectrum ? "spektrum" : "",
          visit.layers.motion ? "gerak" : "",
        ].filter(Boolean);
        const missing = [
          !visit.layers.scan ? "pindai gambar" : "",
          !visit.layers.spectrum ? "spektrum" : "",
          !visit.layers.motion ? "gerak" : "",
        ].filter(Boolean);
        const skippedVisits = play.skipped.filter((entry) => !play.visits.some((q) => q.id === entry.id));
        const skippedSummary = i === 0 && skippedVisits.length
          ? ` ${skippedVisits.length} kunjungan tanpa data untuk semua lapisan dilewati.`
          : "";
        setAnnounce(active.length
          ? `Kunjungan ${w ? monthYear(w.mjd_mid) : visit.id}: ${active.join(", ")}.` +
              (missing.length ? ` Lapisan ${missing.join(", ")} dilewati.` : "") + skippedSummary
          : `Kunjungan ${w ? monthYear(w.mjd_mid) : visit.id}: ambience tenang tanpa data.`);
      }
      const col = local / SCAN.colSeconds;
      const line = p.scanLine.current;
      if (line) {
        if (visit.layers.scan && col >= 0 && col < SCAN.columns) {
          line.setAttribute("x1", String(col + 0.5));
          line.setAttribute("x2", String(col + 0.5));
          line.style.visibility = "visible";
        } else line.style.visibility = "hidden";
      }
      if (visit.layers.scan && col >= SCAN.columns / 2 && centerTold !== visit.id) {
        centerTold = visit.id;
        setAnnounce("Target di tengah gambar.");
      }

      if (visit.layers.spectrum) {
        const frac = local / VISIT_SLOT_SECONDS;
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
        const activeBin = binned.get(visit.id)?.[step];
        if (head) {
          const x = xOf(lambda);
          head.setAttribute("x1", String(x));
          head.setAttribute("x2", String(x));
          head.style.visibility = frac >= 0 && frac <= 1 ? "visible" : "hidden";
        }
        if (dot) {
          dot.setAttribute("cx", String(xOf(lambda)));
          const flux = activeBin?.flux;
          const cy = flux !== null && flux !== undefined
            ? M.top + (1 - clamp01(flux / top)) * (H - M.top - M.bottom)
            : baseline;
          dot.setAttribute("cy", String(cy));
          dot.style.visibility = frac >= 0 && frac <= 1 ? "visible" : "hidden";
        }
      } else {
        if (lastStep !== -1) setHeardLambda(undefined);
        lastStep = -1;
        if (lastBand !== undefined) hearRef.current(undefined);
        lastBand = undefined;
        if (headRef.current) headRef.current.style.visibility = "hidden";
        if (headDotRef.current) headDotRef.current.style.visibility = "hidden";
      }
      p.soundRing.current?.setAttribute("stroke-dasharray", `${clamp01(elapsed / play.total) * 100} 100`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play, stop, abandon, windows, bands, binned, top, xOf, p.soundRing, p.scanLine]);

  const bandsLocked = !!play;
  const scanReady = windows.filter((w) => p.hasImage(w.id)).map((w) => w.id);
  const spectrumReady = windows.filter((w) => playable.includes(w)).map((w) => w.id);
  const motionReadyVisits = p.motionReady ? windows.filter((w) => !!p.readMotion(w.id)).map((w) => w.id) : [];
  const canPlayCombined = windows.length > 0;
  const combinedVisitCount = new Set([...scanReady, ...spectrumReady, ...motionReadyVisits]).size;
  const currentLayers = play?.visits.find((visit) => visit.id === playVisit)?.layers;
  const soundLegend = [
    { id: "scan", label: "Scan", available: scanReady.length > 0 },
    { id: "spectrum", label: "Spectrum", available: spectrumReady.length > 0 },
    { id: "motion", label: "Motion", available: motionReadyVisits.length > 0 },
  ] as const;

  const toggle = useCallback(() => {
    if (play) stop();
    else startCombined();
  }, [play, startCombined, stop]);

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

  const currentQuality = shown ? qualityByVisit.get(shown) : undefined;
  const drawn = currentQuality === "ok";
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
      : currentQuality && currentQuality !== "ok"
        ? NO_SPECTRUM[currentQuality]
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
          disabled={!play && !canPlayCombined}
          aria-pressed={!!play}
          aria-label={play ? "Stop the sound" : "Listen to image, spectrum, and motion"}
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
                      play && heardLambda !== undefined &&
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
                    <span className="segment-number" aria-hidden="true">{i + 1}</span>
                    <span className="segment-notes" aria-hidden="true">
                      <i className="segment-note segment-note--scan" />
                      <i className="segment-note segment-note--spectrum" />
                      <i className="segment-note segment-note--motion" />
                    </span>
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
        <div className={`sound-legend${play ? " is-playing" : ""}`} aria-label="Sound layer indicators">
          {soundLegend.map((layer) => {
            const active = layer.id === "motion"
              ? motionNoteActive
              : currentLayers?.[layer.id] === true;
            const status = play ? (active ? "playing" : "inactive for this visit") : layer.available ? "available" : "unavailable";
            return (
              <span
                key={layer.id}
                className={`sound-layer sound-layer--${layer.id}`}
                role="img"
                data-active={play && active ? "true" : undefined}
                data-available={layer.available ? "true" : undefined}
                aria-label={`${layer.label} ${status}`}
                title={`${layer.label}: ${status}`}
              >
                <span className="sound-note-glyph" aria-hidden="true">♪</span>
                <span>{layer.label}</span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="dock-tail">
        {play && heardLambda !== undefined && (
          <span className="sound-lambda">λ {heardLambda.toFixed(2)} µm</span>
        )}
        <button
          type="button"
          className="pill"
          onClick={startCombined}
          disabled={!!play || combinedVisitCount < 2}
        >
          All {combinedVisitCount || windows.length} visits
        </button>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announce ?? ""}
      </p>

    </>
  );
}
