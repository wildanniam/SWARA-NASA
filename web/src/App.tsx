import {
  CaretLeft,
  CaretRight,
  CircleHalf,
  Flag,
  LinkSimple,
  MagnifyingGlass,
  Notebook,
  Pause,
  Play,
  SpeakerHigh,
  SpeakerSlash,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Backdrop } from "./components/Backdrop";
import { GoTo } from "./components/GoTo";
import { Lens } from "./components/Lens";
import { Notes } from "./components/Notes";
import { SpectrumStrip } from "./components/SpectrumStrip";
import { Timeline } from "./components/Timeline";
import { CUSTOM_NOTE, KIND_LABEL, SEARCH_LABEL, searchNote, TARGET_NOTES } from "./content";
import {
  assetUrl,
  defaultBand,
  findFrame,
  finding,
  loadIndex,
  loadManifest,
  loadSpectrum,
  referenceMotion,
  shiftAt,
  trail,
  type Manifest,
  type TargetRef,
} from "./lib/bundle";
import { coord, coordShort, microns, monthYear, shiftWords, span } from "./lib/format";
import { prefersReducedMotion } from "./lib/hooks";
import { preload, useImageStore } from "./lib/images";
import type { PaletteId } from "./lib/palette";
import { isPending, requestSky, SkyRequestError, skyStatus, type SkyJob } from "./lib/sky";
import type { Spectrum } from "./lib/spectrum";
import { motionNote, sonifier } from "./sound/sonify";

const BLINK_MS = 700;
const POLL_MS = 1000;
const POLL_MAX_FAILURES = 3;

/** Arah di langit dari satu posisi ke posisi lain: x ke timur, y ke utara, panjang 1. */
function bearingBetween(a: { ra: number; dec: number }, b: { ra: number; dec: number }) {
  const x = ((((b.ra - a.ra + 540) % 360) - 180) * Math.cos((((a.dec + b.dec) / 2) * Math.PI) / 180));
  const y = b.dec - a.dec;
  const length = Math.hypot(x, y);
  return length ? { x: x / length, y: y / length } : { x: 0, y: 0 };
}

type Loaded = { id: string; manifest?: Manifest; error?: boolean };

// Yang dibuka lewat tautan: preset, atau nama benda dan koordinatnya, dan band.
const LINK = new URLSearchParams(window.location.search);
const LINK_NAME = LINK.get("name")?.trim().slice(0, 80) || undefined;
const LINK_RA = Number(LINK.get("ra") ?? NaN);
const LINK_DEC = Number(LINK.get("dec") ?? NaN);
const LINK_HAS_POSITION = Number.isFinite(LINK_RA) && Number.isFinite(LINK_DEC);

export function App() {
  const [targets, setTargets] = useState<TargetRef[]>();
  const [indexError, setIndexError] = useState(false);
  const [targetId, setTargetId] = useState<string>();
  const [loaded, setLoaded] = useState<Loaded>();
  const [spec, setSpec] = useState<{ id: string; data?: Spectrum; error?: boolean }>();
  const [attempt, setAttempt] = useState(0);
  const [bandId, setBandId] = useState<string>();
  const [windowId, setWindowId] = useState<string>();
  const [playing, setPlaying] = useState(false);
  const [palette, setPalette] = useState<PaletteId>("heat");
  const [showFlags, setShowFlags] = useState(false);
  const [motionSound, setMotionSound] = useState(false);
  // Koordinat bebas yang dibuka di sesi ini, per id; keadaannya dilaporkan API.
  const [jobs, setJobs] = useState<Record<string, SkyJob>>({});
  const [query, setQuery] = useState("");
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [gotoOpen, setGotoOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Band yang sedang terdengar saat suara spektrum berjalan; lensa ikut menampilkannya.
  const [heardBand, setHeardBand] = useState<string>();
  const soundRing = useRef<SVGCircleElement>(null);
  const images = useImageStore();

  const bandFromLink = useRef(LINK.get("band"));

  // Memilih tempat lain mengosongkan kotak cari, supaya isinya tidak tertinggal
  // di samping gambar benda yang berbeda.
  const selectTarget = useCallback((id: string) => {
    setTargetId(id);
    setQuery("");
    setFormError(undefined);
  }, []);

  const job = targetId ? jobs[targetId] : undefined;
  const custom = job !== undefined;
  const ready = !job || job.status === "ready";

  /** Buka satu nama benda atau koordinat. Mengembalikan false kalau ditolak atau gagal. */
  const openSky = useCallback(async (text: string): Promise<boolean> => {
    setFormBusy(true);
    setFormError(undefined);
    try {
      const next = await requestSky(text);
      setJobs((all) => ({ ...all, [next.id]: next }));
      setTargetId(next.id);
      return true;
    } catch (err) {
      if (err instanceof SkyRequestError) {
        setFormError(err.message);
      } else {
        console.error(err);
        setFormError("The search service is not reachable right now. The examples still work.");
      }
      return false;
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
          // Nama dan gerak katalog hanya datang dari permintaan awal; jangan ditimpa.
          setJobs((all) => ({ ...all, [next.id]: { ...all[next.id], ...next } }));
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

  // Tautan yang membawa nama atau koordinat langsung dibuka, tanpa menunggu daftar
  // contoh. Nama dicari ulang di katalog, supaya nama dan posisinya memang
  // berasal dari katalog; koordinat di tautan dipakai kalau pencarian itu gagal.
  const linkOpened = useRef(false);
  useEffect(() => {
    if (linkOpened.current || !(LINK_NAME || LINK_HAS_POSITION)) return;
    linkOpened.current = true;
    void (async () => {
      const byName = LINK_NAME ? await openSky(LINK_NAME) : false;
      const opened = byName || (LINK_HAS_POSITION && (await openSky(`${LINK_RA} ${LINK_DEC}`)));
      // Tautan yang tidak bisa dibuka tidak boleh gagal diam-diam: dialog menampilkan alasannya.
      if (!opened) setGotoOpen(true);
    })();
  }, [openSky]);

  // Daftar target.
  useEffect(() => {
    const ac = new AbortController();
    setIndexError(false);
    loadIndex(ac.signal)
      .then((list) => {
        setTargets(list);
        const linked = LINK_NAME || LINK_HAS_POSITION ? undefined : list.find((t) => t.id === LINK.get("target"));
        setTargetId((cur) => cur ?? (linked ?? list[0])?.id);
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
        // Band dari tautan hanya dipakai untuk target pertama yang tampil.
        const wanted = bandFromLink.current;
        bandFromLink.current = null;
        const band = wanted && manifest.frames.some((f) => f.band === wanted) ? wanted : defaultBand(manifest);
        const first = manifest.windows.find((w) => findFrame(manifest, w.id, band));
        preload(
          manifest.frames.flatMap((f) => [assetUrl(targetId, custom, f.image), assetUrl(targetId, custom, f.mask)]),
        );
        setLoaded({ id: targetId, manifest });
        setBandId(band);
        setWindowId(first?.id);
        setPlaying(!prefersReducedMotion());
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

  // Yang sedang tampil dicatat di URL, supaya tautannya membuka pandangan yang sama.
  useEffect(() => {
    if (!targetId || !bandId || !manifest) return;
    const p = new URLSearchParams();
    if (job) {
      p.set("ra", job.ra.toFixed(4));
      p.set("dec", job.dec.toFixed(4));
      if (job.label) p.set("name", job.label);
    } else p.set("target", targetId);
    p.set("band", bandId);
    window.history.replaceState(null, "", `${window.location.pathname}?${p}`);
  }, [targetId, bandId, manifest, job]);

  // Spektrum menyusul setelah citra; panelnya punya keadaan memuat sendiri.
  useEffect(() => {
    if (!targetId || !manifest) return;
    const ac = new AbortController();
    setSpec({ id: targetId });
    loadSpectrum(targetId, custom, ac.signal)
      .then((data) => setSpec({ id: targetId, data }))
      .catch((err) => {
        if (!ac.signal.aborted) {
          console.error(err);
          setSpec({ id: targetId, error: true });
        }
      });
    return () => ac.abort();
  }, [targetId, custom, manifest]);
  const spectrum = spec?.id === targetId ? spec : undefined;
  const allTargets = useMemo<TargetRef[]>(
    () => [
      ...(targets ?? []),
      ...Object.values(jobs).map((j) => ({
        id: j.id,
        name: j.label || coordShort(j.ra, j.dec),
        kind: "custom" as const,
        ra: j.ra,
        dec: j.dec,
      })),
    ],
    [targets, jobs],
  );
  const target = allTargets.find((t) => t.id === targetId);

  // Arah pindah dari tempat sebelumnya, untuk gerak latar. Diturunkan saat render
  // supaya tempat baru dan arahnya sampai ke latar pada saat yang sama.
  const [route, setRoute] = useState<{ id?: string; ra: number; dec: number; bearing: { x: number; y: number } }>({
    ra: 0,
    dec: 0,
    bearing: { x: 0, y: 0 },
  });
  if (target && target.id !== route.id) {
    setRoute({
      id: target.id,
      ra: target.ra,
      dec: target.dec,
      bearing: route.id ? bearingBetween(route, target) : { x: 0, y: 0 },
    });
  }

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

  // Suara mulai memutar satu kunjungan: blink berhenti dan panggung ikut ke kunjungan itu.
  const listen = useCallback(
    (id: string) => {
      setPlaying(false);
      if (availableIds.has(id)) setWindowId(id);
    },
    [availableIds],
  );

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
      if (el.closest?.("input, select, textarea, [role=dialog]")) return;
      if (e.key === "/") {
        e.preventDefault();
        setFormError(undefined);
        setGotoOpen(true);
        return;
      }
      if (e.key.toLowerCase() === "n") {
        setNotesOpen(true);
        return;
      }
      if (e.key === " " && !el.closest("button, a")) {
        e.preventDefault();
        setPlaying((v) => !v);
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        setPlaying(false);
        step(e.key === "ArrowRight" ? 1 : -1);
      } else if (e.key.toLowerCase() === "m" && manifest && referenceMotion(manifest)) {
        setMotionSound((v) => !v);
      } else if (manifest && /^[1-6]$/.test(e.key)) {
        chooseBand(manifest.bands[Number(e.key) - 1]?.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, chooseBand, manifest]);

  // Saat suara spektrum berjalan, lensa menampilkan band yang sedang terdengar.
  const shownBandId =
    heardBand && manifest && windowId && findFrame(manifest, windowId, heardBand) ? heardBand : bandId;
  const frame = manifest && windowId && shownBandId ? findFrame(manifest, windowId, shownBandId) : undefined;
  const band = manifest?.bands.find((b) => b.id === shownBandId);
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
    else if (job.stage === "context") statusText = "Mapping the sky around it…";
    else statusText = "Looking for SPHEREx exposures of this spot…";
  }
  const retry = jobFailed
    ? job.error === "no_data"
      ? undefined
      : () => void openSky(job.label ?? `${job.ra} ${job.dec}`)
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
    const s = shiftAt(manifest, win.id);
    const since = refWindow ? monthYear(refWindow.mjd_mid) : "";
    if (s.kind === "none") {
      shift = custom
        ? "Nothing at the centre could be tracked reliably between visits."
        : "The position could not be measured reliably for this target.";
    } else if (s.kind === "unmeasured") shift = "No position measurement for this visit.";
    else if (s.kind === "reference") shift = `Reference visit. The mark shows where the object was in ${since}.`;
    else if (s.kind === "still") shift = `No shift measured since ${since} (within ${s.tolerance.toFixed(1)}″).`;
    else shift = `Shifted ${shiftWords(s.east, s.north)} since ${since}.`;
  }

  // Motif gerak: tiap kunjungan yang tampil membunyikan satu nada dari posisinya.
  const canHearMotion = !!ref;
  useEffect(() => {
    if (!motionSound || !manifest || !windowId || sonifier.busy) return;
    const s = shiftAt(manifest, windowId);
    if (s.kind === "none") return;
    sonifier.blip(s.kind === "unmeasured" ? null : s.kind === "moved" ? motionNote(s.east, s.north) : motionNote(0, 0));
  }, [motionSound, manifest, windowId]);

  const dateLabel = win ? monthYear(win.mjd_mid) : "";
  const bandLabel = band ? microns(band.lambda_min, band.lambda_max) : "";
  const description =
    target && win && band
      ? `SPHEREx infrared image of ${target.name}, ${bandLabel}, ${dateLabel}. ${shift}`
      : "SPHEREx infrared image";

  const found = useMemo(() => (manifest ? finding(manifest) : undefined), [manifest]);
  const path = useMemo(() => (manifest ? trail(manifest) : []), [manifest]);
  const contextUrl =
    manifest?.context && targetId ? assetUrl(targetId, custom, manifest.context.image) : undefined;

  // Pergeseran tiap kunjungan, untuk label di penggaris waktu.
  const visitNotes = useMemo(() => {
    const notes: Record<string, string> = {};
    if (!manifest) return notes;
    for (const w of manifest.windows) {
      const s = shiftAt(manifest, w.id);
      if (s.kind === "reference") notes[w.id] = "start";
      else if (s.kind === "still") notes[w.id] = "no shift";
      else if (s.kind === "moved") notes[w.id] = `${Math.hypot(s.east, s.north).toFixed(1)}″`;
      else if (s.kind === "unmeasured") notes[w.id] = "not measured";
    }
    return notes;
  }, [manifest]);

  const copyLink = useCallback(() => {
    void navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  }, []);

  const openGoTo = () => {
    setFormError(undefined);
    setGotoOpen(true);
  };

  const kind = !target ? "" : job?.label ? SEARCH_LABEL : KIND_LABEL[target.kind];
  const note = !target
    ? ""
    : job?.label
      ? searchNote(job.label, job.pm_arcsec_yr)
      : target.kind === "custom"
        ? CUSTOM_NOTE
        : TARGET_NOTES[target.id];

  return (
    <div className="app">
      <Backdrop id={target?.id} url={contextUrl} size={manifest?.context?.size_px} bearing={route.bearing} />

      <header className="top">
        <p className="brand">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="9" cy="11" r="6.5" />
            <circle className="brand-dot" cx="15.5" cy="4.5" r="2" />
          </svg>
          <span>Sky Change Explorer</span>
        </p>
        <button type="button" className="goto-trigger" onClick={openGoTo}>
          <MagnifyingGlass aria-hidden="true" />
          <span>Go to a place in the sky</span>
          <kbd aria-hidden="true">/</kbd>
        </button>
        <div className="top-actions">
          <button type="button" className="pill pill-quiet" aria-label="Copy a link to this view" onClick={copyLink}>
            <LinkSimple aria-hidden="true" />
            <span aria-live="polite">{copied ? "Link copied" : "Copy link"}</span>
          </button>
          <button
            type="button"
            className="pill pill-quiet"
            aria-label="Notes on this view"
            aria-expanded={notesOpen}
            onClick={() => setNotesOpen(true)}
          >
            <Notebook aria-hidden="true" />
            <span>Notes</span>
          </button>
        </div>
      </header>

      <main className="stage">
        <section className="identity" aria-label="Where you are looking">
          {target && (
            <>
              <p className="kind">{kind}</p>
              <h1>{target.name}</h1>
              <p className="position">{coord(target.ra, target.dec)}</p>
              <p className="note">{note}</p>
            </>
          )}
        </section>

        <Lens
          image={image}
          mask={images.get(maskUrl)}
          palette={palette}
          showFlags={showFlags}
          sizePx={manifest?.frame_px ?? 240}
          fovArcsec={manifest?.fov_arcsec ?? 120}
          mark={mark}
          trail={path}
          currentId={windowId}
          dateLabel={dateLabel}
          bandLabel={bandLabel}
          description={description}
          status={status}
          statusText={statusText}
          statusHint={pending ? "A new place takes a few minutes the first time. After that it opens straight away." : undefined}
          progress={progress}
          onRetry={retry}
          soundRing={soundRing}
        >
          <button
            type="button"
            className="satellite"
            style={{ "--a": "126deg" } as React.CSSProperties}
            aria-pressed={palette === "gray"}
            aria-label="Gray scale"
            data-tip="Gray scale"
            onClick={() => setPalette((v) => (v === "heat" ? "gray" : "heat"))}
          >
            <CircleHalf aria-hidden="true" />
          </button>
          <button
            type="button"
            className="satellite"
            style={{ "--a": "146deg" } as React.CSSProperties}
            aria-pressed={showFlags}
            aria-label="Mark unreliable pixels"
            data-tip="Unreliable pixels"
            onClick={() => setShowFlags((v) => !v)}
          >
            <Flag aria-hidden="true" />
          </button>
        </Lens>

        <section className="finding" aria-label="What was measured">
          {found?.kind === "moved" && (
            <>
              <p className="finding-word">Moved</p>
              <p className="finding-number">
                <svg viewBox="-12 -12 24 24" aria-hidden="true">
                  <circle r="10.5" />
                  <path
                    d="M0 6.5V-6.5M-3.6 -2.9L0 -6.5L3.6 -2.9"
                    transform={`rotate(${(Math.atan2(-found.east, found.north) * 180) / Math.PI})`}
                  />
                </svg>
                {found.total.toFixed(1)}″
              </p>
              <p className="finding-detail">
                {shiftWords(found.east, found.north)} in {span(found.fromMjd, found.toMjd)}
              </p>
            </>
          )}
          {found?.kind === "still" && (
            <>
              <p className="finding-word">Holding still</p>
              <p className="finding-number">&lt; {found.tolerance.toFixed(1)}″</p>
              <p className="finding-detail">no shift measured across {found.visits} visits</p>
            </>
          )}
          {found?.kind === "none" && (
            <>
              <p className="finding-word">Not trackable</p>
              <p className="finding-detail">
                {custom
                  ? "Nothing at the centre could be tracked between visits."
                  : "The position could not be measured reliably for this target."}
              </p>
            </>
          )}
          {found && job?.pm_arcsec_yr != null && job.pm_arcsec_yr >= 0.1 && (
            <p className="finding-catalogue">Catalogue: {job.pm_arcsec_yr.toFixed(1)}″ per year</p>
          )}
        </section>
      </main>

      <section className="dock" aria-label="Controls">
        <div className="dock-row">
          <div className="dock-lead">
            <button
              type="button"
              className="dial dial-accent"
              onClick={() => setPlaying((v) => !v)}
              disabled={available.length < 2}
              aria-pressed={playing}
              aria-label={playing ? "Pause the blink" : "Blink between visits"}
            >
              {playing && available.length > 1 ? <Pause weight="fill" /> : <Play weight="fill" />}
            </button>
            <span className="dial-caption">{playing && available.length > 1 ? "Pause" : "Blink"}</span>
          </div>
          <div className="timebar">
            <button
              type="button"
              className="round"
              aria-label="Previous visit"
              disabled={available.length < 2}
              onClick={() => {
                setPlaying(false);
                step(-1);
              }}
            >
              <CaretLeft aria-hidden="true" />
            </button>
            {manifest && windowId ? (
              <Timeline
                windows={manifest.windows}
                available={availableIds}
                current={windowId}
                notes={visitNotes}
                onSelect={(id) => {
                  setPlaying(false);
                  setWindowId(id);
                }}
              />
            ) : (
              <div className="timeline" />
            )}
            <button
              type="button"
              className="round"
              aria-label="Next visit"
              disabled={available.length < 2}
              onClick={() => {
                setPlaying(false);
                step(1);
              }}
            >
              <CaretRight aria-hidden="true" />
            </button>
          </div>
          <div className="dock-tail">
            <button
              type="button"
              className="pill"
              aria-pressed={motionSound && canHearMotion}
              disabled={!canHearMotion}
              title={
                canHearMotion
                  ? "One note per visit: higher is further north"
                  : "Nothing here could be tracked between visits, so there is no motion sound"
              }
              onClick={() => setMotionSound((v) => !v)}
            >
              {motionSound && canHearMotion ? <SpeakerHigh aria-hidden="true" /> : <SpeakerSlash aria-hidden="true" />}
              Motion sound
            </button>
          </div>
        </div>

        <div className="dock-row dock-light">
          {manifest ? (
            <SpectrumStrip
              spectrum={spectrum?.data}
              failed={!!spectrum?.error}
              windows={manifest.windows}
              windowId={windowId}
              bands={manifest.bands}
              bandId={bandId}
              bandHasFrames={(id) => manifest.frames.some((f) => f.band === id)}
              onBand={chooseBand}
              onListen={listen}
              onHear={setHeardBand}
              soundRing={soundRing}
            />
          ) : (
            <div className="strip strip-empty" />
          )}
        </div>
      </section>

      <GoTo
        open={gotoOpen}
        onClose={() => setGotoOpen(false)}
        query={query}
        onQuery={setQuery}
        busy={formBusy}
        error={formError}
        onSubmit={(text) => void openSky(text).then((ok) => ok && setGotoOpen(false))}
        examples={targets ?? []}
        yours={allTargets.filter((t) => t.kind === "custom")}
        building={new Set(Object.values(jobs).filter((j) => j.status !== "ready").map((j) => j.id))}
        currentId={targetId}
        onPick={(id) => {
          selectTarget(id);
          setGotoOpen(false);
        }}
      />
      <Notes open={notesOpen} onClose={() => setNotesOpen(false)} manifest={manifest} win={win} frame={frame} />

      <p className="sr-only" role="status" aria-live="polite">
        {!playing && win ? `${dateLabel}, ${bandLabel}. ${shift}` : ""}
      </p>
    </div>
  );
}
