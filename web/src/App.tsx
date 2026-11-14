import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CoordinateForm } from "./components/CoordinateForm";
import { SkyStage } from "./components/SkyStage";
import { Timeline } from "./components/Timeline";
import { CUSTOM_NOTE, KIND_LABEL, TARGET_NOTES } from "./content";
import {
  assetUrl,
  defaultBand,
  findFrame,
  loadIndex,
  loadManifest,
  referenceMotion,
  type Manifest,
  type TargetRef,
} from "./lib/bundle";
import { coord, coordShort, dayMonthYear, microns, monthYear, shiftWords } from "./lib/format";
import { preload, useImageStore } from "./lib/images";
import type { PaletteId } from "./lib/palette";
import { isPending, requestSky, SkyRequestError, skyStatus, type SkyJob } from "./lib/sky";

const BLINK_MS = 700;
const POLL_MS = 1000;
const POLL_MAX_FAILURES = 3;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Loaded = { id: string; manifest?: Manifest; error?: boolean };

export function App() {
  const [targets, setTargets] = useState<TargetRef[]>();
  const [indexError, setIndexError] = useState(false);
  const [targetId, setTargetId] = useState<string>();
  const [loaded, setLoaded] = useState<Loaded>();
  const [attempt, setAttempt] = useState(0);
  const [bandId, setBandId] = useState<string>();
  const [windowId, setWindowId] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const [palette, setPalette] = useState<PaletteId>("heat");
  const [showFlags, setShowFlags] = useState(false);
  // Koordinat bebas yang dibuka di sesi ini, per id; keadaannya dilaporkan API.
  const [jobs, setJobs] = useState<Record<string, SkyJob>>({});
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string>();
  const images = useImageStore();

  const job = targetId ? jobs[targetId] : undefined;
  const custom = job !== undefined;
  const ready = !job || job.status === "ready";

  const openSky = useCallback(async (ra: string, dec: string) => {
    setFormBusy(true);
    setFormError(undefined);
    try {
      const next = await requestSky(ra, dec);
      setJobs((all) => ({ ...all, [next.id]: next }));
      setTargetId(next.id);
    } catch (err) {
      if (err instanceof SkyRequestError) {
        setFormError(err.message);
      } else {
        console.error(err);
        setFormError("The coordinate service is not reachable right now. The targets above still work.");
      }
    } finally {
      setFormBusy(false);
    }
  }, []);

  // Selama bundle dibuat, tanyakan progresnya tiap detik.
  const jobId = job?.id;
  const pending = isPending(job);
  useEffect(() => {
    if (!jobId || !pending) return;
    const ac = new AbortController();
    let failures = 0;
    const timer = window.setInterval(() => {
      skyStatus(jobId, ac.signal)
        .then((next) => {
          failures = 0;
          setJobs((all) => ({ ...all, [next.id]: next }));
        })
        .catch((err) => {
          if (ac.signal.aborted || ++failures < POLL_MAX_FAILURES) return;
          console.error(err);
          setJobs((all) => ({ ...all, [jobId]: { ...all[jobId], status: "error", error: "failed" } }));
        });
    }, POLL_MS);
    return () => {
      window.clearInterval(timer);
      ac.abort();
    };
  }, [jobId, pending]);

  // Daftar target.
  useEffect(() => {
    const ac = new AbortController();
    setIndexError(false);
    loadIndex(ac.signal)
      .then((list) => {
        setTargets(list);
        setTargetId((cur) => cur ?? list[0]?.id);
      })
      .catch((err) => {
        if (!ac.signal.aborted) {
          console.error(err);
          setIndexError(true);
        }
      });
    return () => ac.abort();
  }, [attempt]);

  // Manifest target terpilih, lalu muat semua frame-nya.
  useEffect(() => {
    if (!targetId || !ready) return;
    const ac = new AbortController();
    setLoaded({ id: targetId });
    loadManifest(targetId, custom, ac.signal)
      .then((manifest) => {
        const band = defaultBand(manifest);
        const first = manifest.windows.find((w) => findFrame(manifest, w.id, band));
        preload(
          manifest.frames.flatMap((f) => [assetUrl(targetId, custom, f.image), assetUrl(targetId, custom, f.mask)]),
        );
        setLoaded({ id: targetId, manifest });
        setBandId(band);
        setWindowId(first?.id);
        setPlaying(!reducedMotion());
      })
      .catch((err) => {
        if (!ac.signal.aborted) {
          console.error(err);
          setLoaded({ id: targetId, error: true });
        }
      });
    return () => ac.abort();
  }, [targetId, custom, ready, attempt]);

  const manifest = loaded?.id === targetId ? loaded?.manifest : undefined;
  const allTargets = useMemo<TargetRef[]>(
    () => [
      ...(targets ?? []),
      ...Object.values(jobs).map((j) => ({
        id: j.id,
        name: coordShort(j.ra, j.dec),
        kind: "custom" as const,
        ra: j.ra,
        dec: j.dec,
      })),
    ],
    [targets, jobs],
  );
  const target = allTargets.find((t) => t.id === targetId);

  // Daftar target bisa lebih lebar dari layar; pilihan aktif harus tetap terlihat.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    navRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [targetId, allTargets.length]);

  const available = useMemo(
    () => (manifest && bandId ? manifest.windows.filter((w) => findFrame(manifest, w.id, bandId)) : []),
    [manifest, bandId],
  );
  const availableIds = useMemo(() => new Set(available.map((w) => w.id)), [available]);

  const step = useCallback(
    (dir: 1 | -1) => {
      if (available.length < 2) return;
      setWindowId((cur) => {
        const i = available.findIndex((w) => w.id === cur);
        return available[(i + dir + available.length) % available.length].id;
      });
    },
    [available],
  );

  // Blink.
  useEffect(() => {
    if (!playing || available.length < 2) return;
    const timer = window.setInterval(() => step(1), BLINK_MS);
    return () => window.clearInterval(timer);
  }, [playing, step, available.length]);

  const chooseBand = useCallback(
    (id: string) => {
      if (!manifest || !manifest.frames.some((f) => f.band === id)) return;
      setBandId(id);
      setWindowId((cur) =>
        cur && findFrame(manifest, cur, id) ? cur : manifest.windows.find((w) => findFrame(manifest, w.id, id))?.id,
      );
    },
    [manifest],
  );

  // Papan ketik: spasi = putar/jeda, panah = pindah kunjungan, 1-6 = band.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el.closest("input, select, textarea")) return;
      if (e.key === " " && !el.closest("button, a")) {
        e.preventDefault();
        setPlaying((v) => !v);
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        setPlaying(false);
        step(e.key === "ArrowRight" ? 1 : -1);
      } else if (manifest && /^[1-6]$/.test(e.key)) {
        chooseBand(manifest.bands[Number(e.key) - 1]?.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, chooseBand, manifest]);

  const frame = manifest && windowId && bandId ? findFrame(manifest, windowId, bandId) : undefined;
  const band = manifest?.bands.find((b) => b.id === bandId);
  const win = manifest?.windows.find((w) => w.id === windowId);
  const imageUrl = frame && targetId ? assetUrl(targetId, custom, frame.image) : undefined;
  const maskUrl = frame && targetId ? assetUrl(targetId, custom, frame.mask) : undefined;
  const image = images.get(imageUrl);

  const jobFailed = job?.status === "error";
  const failed =
    jobFailed || (!custom && indexError) || (loaded?.id === targetId && loaded?.error) || images.hasFailed(imageUrl);
  const status = failed ? "error" : image ? undefined : "loading";

  // Teks panggung selama bundle koordinat bebas dibuat, atau saat gagal.
  let statusText: string | undefined;
  let progress: { done: number; total: number } | undefined;
  if (jobFailed) {
    statusText =
      job.error === "no_data"
        ? "SPHEREx has no usable images of this position."
        : "This position could not be loaded.";
  } else if (job && pending) {
    if (job.status === "queued") statusText = "Waiting for a free slot…";
    else if (job.stage === "fetch") {
      statusText = "Reading SPHEREx exposures…";
      progress = { done: job.done, total: job.total };
    } else if (job.stage === "frames") statusText = "Aligning the images…";
    else statusText = "Looking for SPHEREx exposures of this spot…";
  }
  const retry = jobFailed
    ? job.error === "no_data"
      ? undefined
      : () => openSky(String(job.ra), String(job.dec))
    : () => setAttempt((n) => n + 1);

  // Tanda acuan dan pergeseran terukur.
  const ref = manifest ? referenceMotion(manifest) : undefined;
  const refWindow = manifest?.windows.find((w) => w.id === ref?.window);
  const mark = useMemo(() => {
    if (!manifest) return undefined;
    const scale = manifest.frame_px / manifest.fov_arcsec;
    const c = manifest.frame_px / 2;
    if (!ref) return { x: c, y: c };
    const east = (ref.ra - manifest.ra) * 3600 * Math.cos((manifest.dec * Math.PI) / 180);
    const north = (ref.dec - manifest.dec) * 3600;
    return { x: c - east * scale, y: c - north * scale };
  }, [manifest, ref]);

  let shift = "";
  if (manifest && win) {
    const cur = manifest.motion.find((m) => m.window === win.id);
    if (!ref || !refWindow) {
      shift = custom
        ? "Nothing at the centre could be tracked reliably between visits."
        : "The position could not be measured reliably for this target.";
    } else if (!cur) {
      shift = "No position measurement for this visit.";
    } else if (cur.window === ref.window) {
      shift = `Reference visit. The mark shows where the object was in ${monthYear(refWindow.mjd_mid)}.`;
    } else {
      const total = Math.hypot(cur.d_east_arcsec, cur.d_north_arcsec);
      const tolerance = Math.max(1.5, 2 * Math.max(cur.scatter_arcsec, ref.scatter_arcsec));
      shift =
        total < tolerance
          ? `No shift measured since ${monthYear(refWindow.mjd_mid)} (within ${tolerance.toFixed(1)}″).`
          : `Shifted ${shiftWords(cur.d_east_arcsec, cur.d_north_arcsec)} since ${monthYear(refWindow.mjd_mid)}.`;
    }
  }

  const dateLabel = win ? monthYear(win.mjd_mid) : "";
  const bandLabel = band ? microns(band.lambda_min, band.lambda_max) : "";
  const description =
    target && win && band
      ? `SPHEREx infrared image of ${target.name}, ${bandLabel}, ${dateLabel}. ${shift}`
      : "SPHEREx infrared image";

  return (
    <div className="app">
      <header className="top">
        <p className="brand">Sky Change Explorer</p>
        <p className="source">SPHEREx all-sky infrared survey · data from NASA/IPAC IRSA</p>
      </header>

      <main className="layout">
        <section className="stage-col" aria-label="Sky view">
          <nav className="targets" aria-label="Targets" ref={navRef}>
            {allTargets.map((t) => (
              <button
                key={t.id}
                type="button"
                className="target"
                aria-pressed={t.id === targetId}
                onClick={() => setTargetId(t.id)}
              >
                {t.name}
              </button>
            ))}
          </nav>

          <CoordinateForm busy={formBusy} error={formError} onSubmit={openSky} />

          <SkyStage
            image={image}
            mask={images.get(maskUrl)}
            palette={palette}
            showFlags={showFlags}
            sizePx={manifest?.frame_px ?? 240}
            fovArcsec={manifest?.fov_arcsec ?? 120}
            mark={mark}
            dateLabel={dateLabel}
            bandLabel={bandLabel}
            description={description}
            status={status}
            statusText={statusText}
            statusHint={
              pending
                ? "A new position takes a few minutes the first time. After that it opens straight away."
                : undefined
            }
            progress={progress}
            onRetry={retry}
          />

          <div className="transport">
            <button
              type="button"
              className="btn btn-play"
              onClick={() => setPlaying((v) => !v)}
              disabled={available.length < 2}
              aria-pressed={playing}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                {playing ? <path d="M4 3h3v10H4zM9 3h3v10H9z" /> : <path d="M4.5 2.5v11l9-5.5z" />}
              </svg>
              {playing ? "Pause" : "Blink"}
            </button>
            <button
              type="button"
              className="btn btn-icon"
              aria-label="Previous visit"
              disabled={available.length < 2}
              onClick={() => {
                setPlaying(false);
                step(-1);
              }}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M10.5 3 5.5 8l5 5" />
              </svg>
            </button>
            <button
              type="button"
              className="btn btn-icon"
              aria-label="Next visit"
              disabled={available.length < 2}
              onClick={() => {
                setPlaying(false);
                step(1);
              }}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="m5.5 3 5 5-5 5" />
              </svg>
            </button>
            {manifest && windowId && (
              <Timeline
                windows={manifest.windows}
                available={availableIds}
                current={windowId}
                onSelect={(id) => {
                  setPlaying(false);
                  setWindowId(id);
                }}
              />
            )}
          </div>
          <p className="keys">
            <kbd>Space</kbd> blink · <kbd>←</kbd> <kbd>→</kbd> step through visits · <kbd>1</kbd>–<kbd>6</kbd> band
          </p>
        </section>

        <aside className="side">
          {target && (
            <section className="about">
              <p className="kind">{KIND_LABEL[target.kind]}</p>
              <h1>{target.name}</h1>
              <p className="note">{target.kind === "custom" ? CUSTOM_NOTE : TARGET_NOTES[target.id]}</p>
              {shift && <p className="shift">{shift}</p>}
              <p className="sr-only" role="status" aria-live="polite">
                {!playing && win ? `${dateLabel}, ${bandLabel}. ${shift}` : ""}
              </p>
            </section>
          )}

          {manifest && (
            <>
              <section>
                <h2>Infrared band</h2>
                <div className="bands" role="group" aria-label="Infrared band, in microns">
                  {manifest.bands.map((b, i) => {
                    const has = manifest.frames.some((f) => f.band === b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        className="band"
                        aria-pressed={b.id === bandId}
                        disabled={!has}
                        onClick={() => chooseBand(b.id)}
                      >
                        <span className="band-range">
                          {b.lambda_min.toFixed(2)}–{b.lambda_max.toFixed(2)}
                        </span>
                        <span className="band-key">{i + 1}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="hint">Wavelength in microns, shortest to longest. Bright stars saturate less in the long bands.</p>
              </section>

              <section>
                <h2>Display</h2>
                <div className="seg" role="group" aria-label="Colour map">
                  {(["heat", "gray"] as const).map((id) => (
                    <button key={id} type="button" aria-pressed={palette === id} onClick={() => setPalette(id)}>
                      {id === "heat" ? "Heat" : "Gray"}
                    </button>
                  ))}
                </div>
                <label className="check">
                  <input type="checkbox" checked={showFlags} onChange={(e) => setShowFlags(e.target.checked)} />
                  <span>Mark unreliable pixels</span>
                </label>
                {showFlags && (
                  <ul className="legend">
                    <li>
                      <i className="sw sw-sat" /> Saturated: source too bright
                    </li>
                    <li>
                      <i className="sw sw-bad" /> Bad or missing detector pixel
                    </li>
                  </ul>
                )}
              </section>

              {win && frame && (
                <section>
                  <h2>This view</h2>
                  <dl className="facts">
                    <dt>Visit</dt>
                    <dd>
                      {dayMonthYear(win.date_start)} to {dayMonthYear(win.date_end)}
                    </dd>
                    <dt>Image</dt>
                    <dd>Median of {frame.n_exposures} exposures</dd>
                    <dt>Field</dt>
                    <dd>
                      {manifest.fov_arcsec / 60}′ across · north up, east left
                    </dd>
                    <dt>Centre</dt>
                    <dd>{coord(manifest.ra, manifest.dec)}</dd>
                    <dt>Data</dt>
                    <dd>{manifest.source.n_exposures_used} SPHEREx exposures in total</dd>
                  </dl>
                </section>
              )}
            </>
          )}
        </aside>
      </main>
    </div>
  );
}
